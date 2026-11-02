// Command worker generates the game sheets of unknown barcodes in the
// background, within a daily budget. It runs from the same image as the API
// and scales independently (several workers can run side by side).
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/meepleo/meepleo-api/internal/catalog"
	"github.com/meepleo/meepleo-api/internal/platform/config"
	"github.com/meepleo/meepleo-api/internal/platform/httpclient"
	"github.com/meepleo/meepleo-api/internal/platform/logging"
	"github.com/meepleo/meepleo-api/internal/platform/observability"
	"github.com/meepleo/meepleo-api/internal/platform/postgres"
	"github.com/meepleo/meepleo-api/internal/platform/redis"
)

var version = "dev"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "worker:", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	if err := cfg.ValidateWorker(); err != nil {
		return err
	}
	log := logging.New(os.Stdout, cfg.LogLevel).With(slog.String("service", "meepleo-worker"), slog.String("version", version))

	shutdownOtel, err := observability.Setup(ctx, "meepleo-worker", version, os.Getenv)
	if err != nil {
		return err
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		if err := shutdownOtel(ctx); err != nil {
			log.WarnContext(ctx, "otel shutdown", slog.String("error", err.Error()))
		}
	}()

	pool, err := postgres.NewPool(ctx, cfg.Postgres.URL, cfg.Postgres.MaxConns)
	if err != nil {
		return err
	}
	defer pool.Close()

	rdb, err := redis.NewClient(cfg.Redis.URL)
	if err != nil {
		return err
	}
	defer func() { _ = rdb.Close() }()

	claudeHTTP := httpclient.New(httpclient.Config{
		Name:       "claude",
		Timeout:    cfg.Claude.RequestTimeout,
		MaxRetries: 2,
		MaxBackoff: 30 * time.Second,
		// Generating a sheet has no side effect on Anthropic's side, so a
		// POST /v1/messages can safely be replayed after a transient failure.
		RetryNonIdempotent: true,
		BreakerFailures:    5,
		BreakerOpenTimeout: time.Minute,
	})

	catalogModule := catalog.New(catalog.Deps{Pool: pool, Redis: rdb, Logger: log})
	worker := catalogModule.NewWorker(catalog.WorkerConfig{
		Generator: catalog.NewClaudeGenerator(catalog.ClaudeConfig{
			APIKey:  cfg.Claude.APIKey,
			BaseURL: cfg.Claude.BaseURL,
			Model:   cfg.Claude.Model,
		}, claudeHTTP),
		DailyBudget:  cfg.Generation.DailyBudget,
		Lease:        cfg.Generation.Lease,
		MaxAttempts:  cfg.Generation.MaxAttempts,
		RetryAfter:   cfg.Generation.RetryAfter,
		PollInterval: cfg.Generation.PollInterval,
	})
	return worker.Run(ctx)
}
