package httpclient

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testConfig() Config {
	return Config{
		Name:               "test",
		Timeout:            5 * time.Second,
		MaxRetries:         2,
		BaseBackoff:        time.Millisecond,
		MaxBackoff:         5 * time.Millisecond,
		BreakerFailures:    100,
		BreakerOpenTimeout: time.Minute,
	}
}

// failThen answers `failures` times with status, then 200.
func failThen(t *testing.T, failures int32, status int) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := calls.Add(1)
		body, _ := io.ReadAll(r.Body)
		if n <= failures {
			w.WriteHeader(status)
			return
		}
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	return srv, &calls
}

func TestRetry(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name      string
		cfg       func(Config) Config
		method    string
		failures  int32
		status    int
		wantCalls int32
		wantCode  int
	}{
		{"GET retried on 503 until success", nil, http.MethodGet, 2, http.StatusServiceUnavailable, 3, http.StatusOK},
		{"GET gives up after max retries", nil, http.MethodGet, 5, http.StatusServiceUnavailable, 3, http.StatusServiceUnavailable},
		{"429 is retried", nil, http.MethodGet, 1, http.StatusTooManyRequests, 2, http.StatusOK},
		{"529 overloaded is retried", nil, http.MethodGet, 1, 529, 2, http.StatusOK},
		{"400 is not retried", nil, http.MethodGet, 1, http.StatusBadRequest, 1, http.StatusBadRequest},
		{"500 is not retried", nil, http.MethodGet, 1, http.StatusInternalServerError, 1, http.StatusInternalServerError},
		{"POST is not retried by default", nil, http.MethodPost, 1, http.StatusServiceUnavailable, 1, http.StatusServiceUnavailable},
		{"POST retried when opted in", func(c Config) Config { c.RetryNonIdempotent = true; return c }, http.MethodPost, 1, http.StatusServiceUnavailable, 2, http.StatusOK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			srv, calls := failThen(t, tt.failures, tt.status)
			cfg := testConfig()
			if tt.cfg != nil {
				cfg = tt.cfg(cfg)
			}
			req, err := http.NewRequestWithContext(context.Background(), tt.method, srv.URL, strings.NewReader("payload"))
			require.NoError(t, err)

			resp, err := New(cfg).Do(req)
			require.NoError(t, err)
			defer resp.Body.Close()
			body, _ := io.ReadAll(resp.Body)

			assert.Equal(t, tt.wantCode, resp.StatusCode)
			assert.Equal(t, tt.wantCalls, calls.Load())
			if resp.StatusCode == http.StatusOK && tt.method == http.MethodPost {
				assert.Equal(t, "payload", string(body), "body must be replayed on retry")
			}
		})
	}
}

func TestCircuitBreakerOpens(t *testing.T) {
	t.Parallel()
	srv, calls := failThen(t, 100, http.StatusBadGateway)
	cfg := testConfig()
	cfg.MaxRetries = 0
	cfg.BreakerFailures = 3
	client := New(cfg)

	for range 3 {
		req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, srv.URL, nil)
		resp, err := client.Do(req)
		require.NoError(t, err)
		_ = resp.Body.Close()
	}

	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, srv.URL, nil)
	_, err := client.Do(req) //nolint:bodyclose // no response when the breaker is open
	require.ErrorIs(t, err, ErrCircuitOpen)
	assert.Equal(t, int32(3), calls.Load(), "the partner must not be called while the breaker is open")
}

func TestRetryStopsWhenContextIsCancelled(t *testing.T) {
	t.Parallel()
	srv, _ := failThen(t, 100, http.StatusServiceUnavailable)
	cfg := testConfig()
	cfg.MaxRetries = 10
	cfg.BaseBackoff = time.Hour
	cfg.MaxBackoff = time.Hour

	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, srv.URL, nil)
	done := make(chan error, 1)
	go func() {
		_, err := New(cfg).Do(req) //nolint:bodyclose // error path
		done <- err
	}()
	cancel()
	require.ErrorIs(t, <-done, context.Canceled)
}

func TestRetryAfter(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		in     string
		want   time.Duration
		wantOK bool
	}{
		{"", 0, false},
		{"3", 3 * time.Second, true},
		{"Sun, 01 Nov 2026 12:00:10 GMT", 10 * time.Second, true},
		{"Sun, 01 Nov 2026 11:00:00 GMT", 0, true},
		{"soon", 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			t.Parallel()
			got, ok := retryAfter(tt.in, now)
			assert.Equal(t, tt.wantOK, ok)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestBackoffIsBounded(t *testing.T) {
	t.Parallel()
	for attempt := range 40 {
		d := backoff(attempt, 100*time.Millisecond, 2*time.Second)
		assert.GreaterOrEqual(t, d, time.Duration(0))
		assert.LessOrEqual(t, d, 2*time.Second)
	}
}
