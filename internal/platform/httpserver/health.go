package httpserver

import (
	"context"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

// Check reports whether a dependency is usable.
type Check func(ctx context.Context) error

// Health serves the liveness and readiness probes.
//
// Liveness only says the process is alive. Readiness checks the dependencies
// and turns false as soon as shutdown starts, so the load balancer stops
// routing new requests before the server stops accepting them.
type Health struct {
	checks   map[string]Check
	timeout  time.Duration
	draining atomic.Bool
}

// NewHealth returns a Health running the given named checks, each bounded by
// timeout.
func NewHealth(timeout time.Duration, checks map[string]Check) *Health {
	return &Health{checks: checks, timeout: timeout}
}

// Drain marks the instance as not ready (called at shutdown).
func (h *Health) Drain() { h.draining.Store(true) }

type healthBody struct {
	Status string            `json:"status"`
	Checks map[string]string `json:"checks,omitempty"`
}

// Live handles GET /healthz.
func (h *Health) Live(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusOK, healthBody{Status: "ok"})
}

// Ready handles GET /readyz.
func (h *Health) Ready(w http.ResponseWriter, r *http.Request) {
	if h.draining.Load() {
		WriteJSON(w, http.StatusServiceUnavailable, healthBody{Status: "draining"})
		return
	}

	results := make(map[string]string, len(h.checks))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for name, check := range h.checks {
		wg.Go(func() {
			ctx, cancel := context.WithTimeout(r.Context(), h.timeout)
			defer cancel()
			status := "ok"
			if err := check(ctx); err != nil {
				status = "unavailable" // the error itself is not exposed to callers
			}
			mu.Lock()
			results[name] = status
			mu.Unlock()
		})
	}
	wg.Wait()

	body := healthBody{Status: "ok", Checks: results}
	code := http.StatusOK
	for _, s := range results {
		if s != "ok" {
			body.Status, code = "unavailable", http.StatusServiceUnavailable
			break
		}
	}
	WriteJSON(w, code, body)
}
