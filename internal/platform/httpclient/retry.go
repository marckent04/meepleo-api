package httpclient

import (
	"context"
	"errors"
	"io"
	"math/rand/v2"
	"net/http"
	"strconv"
	"time"
)

type retryTransport struct {
	cfg  Config
	next http.RoundTripper
}

func (t *retryTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if !t.canRetry(req) {
		return t.next.RoundTrip(req)
	}

	for attempt := 0; ; attempt++ {
		r := req
		if attempt > 0 {
			var err error
			if r, err = rewind(req); err != nil {
				return nil, err
			}
		}

		resp, err := t.next.RoundTrip(r)
		if attempt >= t.cfg.MaxRetries || !retryable(resp, err) {
			return resp, err
		}

		wait := backoff(attempt, t.cfg.BaseBackoff, t.cfg.MaxBackoff)
		if resp != nil {
			if ra, ok := retryAfter(resp.Header.Get("Retry-After"), time.Now()); ok {
				wait = min(ra, t.cfg.MaxBackoff)
			}
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10)) // let the connection be reused
			_ = resp.Body.Close()
		}

		timer := time.NewTimer(wait)
		select {
		case <-req.Context().Done():
			timer.Stop()
			return nil, req.Context().Err()
		case <-timer.C:
		}
	}
}

func (t *retryTransport) canRetry(req *http.Request) bool {
	if t.cfg.MaxRetries <= 0 {
		return false
	}
	if req.Body != nil && req.Body != http.NoBody && req.GetBody == nil {
		return false // the body cannot be replayed
	}
	switch req.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodPut, http.MethodDelete:
		return true
	default:
		return t.cfg.RetryNonIdempotent
	}
}

func rewind(req *http.Request) (*http.Request, error) {
	r := req.Clone(req.Context())
	if req.GetBody != nil {
		body, err := req.GetBody()
		if err != nil {
			return nil, err
		}
		r.Body = body
	}
	return r, nil
}

func retryable(resp *http.Response, err error) bool {
	if err != nil {
		return !errors.Is(err, context.Canceled) &&
			!errors.Is(err, context.DeadlineExceeded) &&
			!errors.Is(err, ErrCircuitOpen)
	}
	switch resp.StatusCode {
	case http.StatusTooManyRequests, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout,
		529: // Anthropic "overloaded"
		return true
	}
	return false
}

// backoff returns a "full jitter" delay: uniform in [0, min(max, base*2^n)].
// Jitter spreads retries of many clients so they do not hit the partner in
// synchronized waves.
func backoff(attempt int, base, maxDelay time.Duration) time.Duration {
	ceiling := base << min(attempt, 30)
	if ceiling <= 0 || ceiling > maxDelay {
		ceiling = maxDelay
	}
	return rand.N(ceiling + 1) //nolint:gosec // jitter does not need a CSPRNG
}

// retryAfter parses a Retry-After header (delay in seconds or HTTP date).
func retryAfter(v string, now time.Time) (time.Duration, bool) {
	if v == "" {
		return 0, false
	}
	if s, err := strconv.Atoi(v); err == nil && s >= 0 {
		return time.Duration(s) * time.Second, true
	}
	if t, err := http.ParseTime(v); err == nil {
		return max(t.Sub(now), 0), true
	}
	return 0, false
}
