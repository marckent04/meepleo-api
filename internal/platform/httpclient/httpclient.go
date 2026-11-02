// Package httpclient builds resilient http.Clients for calls to external APIs.
//
// Every partner adapter gets its own client (never http.DefaultClient) made of
// a RoundTripper chain:
//
//	otelhttp (one span per logical call)
//	  -> retry (exponential backoff with full jitter, honours Retry-After)
//	    -> circuit breaker (fails fast while the partner is down)
//	      -> http.Transport (explicit dial / TLS / header timeouts)
//
// Retries only happen on transient failures (network errors, 429, 502, 503,
// 504, 529) and only for idempotent methods, unless the adapter explicitly
// opts in with RetryNonIdempotent because the call has no side effect.
package httpclient

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/sony/gobreaker/v2"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// ErrCircuitOpen is returned while the circuit breaker is open: the partner
// failed repeatedly and is not called until the breaker half-opens.
var ErrCircuitOpen = errors.New("circuit breaker open")

// Config configures a client.
type Config struct {
	// Name identifies the partner in spans and breaker state logs.
	Name string
	// Timeout bounds a whole call, retries included.
	Timeout time.Duration
	// MaxRetries is the number of retries after the first attempt.
	MaxRetries int
	// BaseBackoff and MaxBackoff bound the exponential backoff.
	BaseBackoff time.Duration
	MaxBackoff  time.Duration
	// RetryNonIdempotent allows retrying POST/PATCH. Only set it when
	// replaying the request cannot have a side effect.
	RetryNonIdempotent bool
	// BreakerFailures is the number of consecutive failures that opens the
	// breaker; BreakerOpenTimeout is how long it stays open.
	BreakerFailures    uint32
	BreakerOpenTimeout time.Duration
}

func (c Config) withDefaults() Config {
	if c.Timeout <= 0 {
		c.Timeout = 10 * time.Second
	}
	if c.BaseBackoff <= 0 {
		c.BaseBackoff = 200 * time.Millisecond
	}
	if c.MaxBackoff <= 0 {
		c.MaxBackoff = 10 * time.Second
	}
	if c.BreakerFailures == 0 {
		c.BreakerFailures = 5
	}
	if c.BreakerOpenTimeout <= 0 {
		c.BreakerOpenTimeout = 30 * time.Second
	}
	return c
}

// New returns a resilient client for one partner.
func New(cfg Config) *http.Client {
	cfg = cfg.withDefaults()
	return &http.Client{
		Timeout: cfg.Timeout,
		Transport: otelhttp.NewTransport(
			&retryTransport{cfg: cfg, next: newBreakerTransport(cfg, baseTransport())},
			otelhttp.WithSpanNameFormatter(func(_ string, r *http.Request) string {
				return cfg.Name + " " + r.Method
			}),
		),
	}
}

func baseTransport() *http.Transport {
	return &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           (&net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   10,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   5 * time.Second,
		ExpectContinueTimeout: time.Second,
	}
}

// errUpstreamFailure marks a 5xx response so the breaker counts it as a
// failure while the response itself is still handed back to the caller.
var errUpstreamFailure = errors.New("upstream failure")

type breakerTransport struct {
	cb   *gobreaker.CircuitBreaker[*http.Response]
	next http.RoundTripper
}

func newBreakerTransport(cfg Config, next http.RoundTripper) *breakerTransport {
	return &breakerTransport{
		next: next,
		cb: gobreaker.NewCircuitBreaker[*http.Response](gobreaker.Settings{ //nolint:bodyclose // the breaker only passes responses through
			Name:    cfg.Name,
			Timeout: cfg.BreakerOpenTimeout,
			ReadyToTrip: func(c gobreaker.Counts) bool {
				return c.ConsecutiveFailures >= cfg.BreakerFailures
			},
		}),
	}
}

func (t *breakerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := t.cb.Execute(func() (*http.Response, error) {
		resp, err := t.next.RoundTrip(req)
		if err != nil {
			return nil, err
		}
		if resp.StatusCode >= http.StatusInternalServerError {
			return resp, errUpstreamFailure
		}
		return resp, nil
	})
	switch {
	case errors.Is(err, errUpstreamFailure):
		return resp, nil
	case errors.Is(err, gobreaker.ErrOpenState), errors.Is(err, gobreaker.ErrTooManyRequests):
		return nil, fmt.Errorf("%s: %w", t.cb.Name(), ErrCircuitOpen)
	default:
		return resp, err
	}
}
