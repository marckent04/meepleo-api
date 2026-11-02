package httpserver

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// ServerConfig configures NewServer.
type ServerConfig struct {
	Addr              string
	ReadHeaderTimeout time.Duration
	ReadTimeout       time.Duration
	WriteTimeout      time.Duration
	IdleTimeout       time.Duration
}

// NewServer returns an http.Server with explicit timeouts, wrapping h with
// the OpenTelemetry instrumentation.
func NewServer(cfg ServerConfig, h http.Handler, log *slog.Logger) *http.Server {
	return &http.Server{
		Addr:              cfg.Addr,
		Handler:           otelhttp.NewHandler(h, "http.server"),
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
		ReadTimeout:       cfg.ReadTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       cfg.IdleTimeout,
		ErrorLog:          slog.NewLogLogger(log.Handler(), slog.LevelWarn),
	}
}

// Run serves until ctx is cancelled, then shuts down gracefully: readiness
// turns false first, then in-flight requests get shutdownTimeout to finish.
func Run(ctx context.Context, srv *http.Server, health *Health, shutdownTimeout time.Duration, log *slog.Logger) error {
	serveErr := make(chan error, 1)
	go func() {
		defer close(serveErr)
		if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
	}()
	log.InfoContext(ctx, "http server listening", slog.String("addr", srv.Addr))

	select {
	case err := <-serveErr:
		return fmt.Errorf("http server: %w", err)
	case <-ctx.Done():
	}

	log.InfoContext(ctx, "shutting down http server")
	if health != nil {
		health.Drain()
	}
	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("http server shutdown: %w", err)
	}
	if err := <-serveErr; err != nil {
		return fmt.Errorf("http server: %w", err)
	}
	log.InfoContext(ctx, "http server stopped")
	return nil
}
