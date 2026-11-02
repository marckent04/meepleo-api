// Package config loads the process configuration from environment variables.
//
// Configuration is validated once at startup: an invalid or missing value
// makes the program refuse to start instead of failing later at request time.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"
)

// Config is the configuration shared by every binary (api, worker, migrate).
type Config struct {
	Env      string
	LogLevel slog.Level

	HTTP       HTTP
	Postgres   Postgres
	Redis      Redis
	Auth       Auth
	Claude     Claude
	Generation Generation
}

// HTTP configures the inbound HTTP server.
type HTTP struct {
	Addr               string
	RequestTimeout     time.Duration
	ReadHeaderTimeout  time.Duration
	ReadTimeout        time.Duration
	WriteTimeout       time.Duration
	IdleTimeout        time.Duration
	ShutdownTimeout    time.Duration
	MaxBodyBytes       int64
	CORSAllowedOrigins []string
	DocsEnabled        bool
}

// Postgres configures the database pool.
type Postgres struct {
	URL      string
	MaxConns int32
}

// Redis configures the cache client.
type Redis struct {
	URL string
}

// Auth configures token issuance and verification.
type Auth struct {
	JWTSecret       []byte
	Issuer          string
	Audience        string
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration
}

// Claude configures the Anthropic API client used by the generation worker.
type Claude struct {
	APIKey         string
	BaseURL        string
	Model          string
	RequestTimeout time.Duration
}

// Generation configures the game sheet generation worker.
type Generation struct {
	DailyBudget  int
	Lease        time.Duration
	MaxAttempts  int
	RetryAfter   time.Duration
	PollInterval time.Duration
}

// Load reads and validates the configuration. getenv is usually os.Getenv;
// it is injected so tests do not depend on the process environment.
func Load(getenv func(string) string) (Config, error) {
	r := reader{getenv: getenv}

	cfg := Config{
		Env:      r.str("APP_ENV", "development"),
		LogLevel: r.level("LOG_LEVEL", slog.LevelInfo),
		HTTP: HTTP{
			Addr:               r.str("HTTP_ADDR", ":8080"),
			RequestTimeout:     r.duration("REQUEST_TIMEOUT", 10*time.Second),
			ReadHeaderTimeout:  r.duration("HTTP_READ_HEADER_TIMEOUT", 5*time.Second),
			ReadTimeout:        r.duration("HTTP_READ_TIMEOUT", 15*time.Second),
			WriteTimeout:       r.duration("HTTP_WRITE_TIMEOUT", 30*time.Second),
			IdleTimeout:        r.duration("HTTP_IDLE_TIMEOUT", 120*time.Second),
			ShutdownTimeout:    r.duration("HTTP_SHUTDOWN_TIMEOUT", 20*time.Second),
			MaxBodyBytes:       int64(r.integer("HTTP_MAX_BODY_BYTES", 1<<20)),
			CORSAllowedOrigins: r.list("CORS_ALLOWED_ORIGINS"),
			DocsEnabled:        r.boolean("DOCS_ENABLED", true),
		},
		Postgres: Postgres{
			URL:      r.required("DATABASE_URL"),
			MaxConns: r.int32("DATABASE_MAX_CONNS", 10),
		},
		Redis: Redis{
			URL: r.required("REDIS_URL"),
		},
		Auth: Auth{
			JWTSecret:       []byte(r.required("JWT_SECRET")),
			Issuer:          r.str("JWT_ISSUER", "meepleo-api"),
			Audience:        r.str("JWT_AUDIENCE", "meepleo-app"),
			AccessTokenTTL:  r.duration("ACCESS_TOKEN_TTL", 15*time.Minute),
			RefreshTokenTTL: r.duration("REFRESH_TOKEN_TTL", 30*24*time.Hour),
		},
		Claude: Claude{
			APIKey:         r.str("ANTHROPIC_API_KEY", ""),
			BaseURL:        r.str("ANTHROPIC_BASE_URL", ""),
			Model:          r.str("CLAUDE_MODEL", "claude-opus-5-5"),
			RequestTimeout: r.duration("CLAUDE_REQUEST_TIMEOUT", 5*time.Minute),
		},
		Generation: Generation{
			DailyBudget:  r.integer("GENERATION_DAILY_BUDGET", 200),
			Lease:        r.duration("GENERATION_LEASE", 10*time.Minute),
			MaxAttempts:  r.integer("GENERATION_MAX_ATTEMPTS", 3),
			RetryAfter:   r.duration("GENERATION_RETRY_AFTER", 30*24*time.Hour),
			PollInterval: r.duration("GENERATION_POLL_INTERVAL", 15*time.Second),
		},
	}

	if len(cfg.Auth.JWTSecret) > 0 && len(cfg.Auth.JWTSecret) < 32 {
		r.fail("JWT_SECRET", "must be at least 32 bytes")
	}
	if cfg.HTTP.MaxBodyBytes < 1 {
		r.fail("HTTP_MAX_BODY_BYTES", "must be >= 1")
	}
	if cfg.Generation.DailyBudget < 0 {
		r.fail("GENERATION_DAILY_BUDGET", "must be >= 0")
	}
	if cfg.Generation.MaxAttempts < 1 {
		r.fail("GENERATION_MAX_ATTEMPTS", "must be >= 1")
	}

	if err := errors.Join(r.errs...); err != nil {
		return Config{}, fmt.Errorf("invalid configuration: %w", err)
	}
	return cfg, nil
}

// ValidateWorker checks the settings only the generation worker needs, so the
// API can start without an Anthropic key.
func (c Config) ValidateWorker() error {
	if c.Claude.APIKey == "" {
		return errors.New("invalid configuration: ANTHROPIC_API_KEY is required by the worker")
	}
	if c.Claude.Model == "" {
		return errors.New("invalid configuration: CLAUDE_MODEL is required by the worker")
	}
	return nil
}

type reader struct {
	getenv func(string) string
	errs   []error
}

func (r *reader) fail(key, msg string) {
	r.errs = append(r.errs, fmt.Errorf("%s %s", key, msg))
}

func (r *reader) str(key, def string) string {
	if v := strings.TrimSpace(r.getenv(key)); v != "" {
		return v
	}
	return def
}

func (r *reader) required(key string) string {
	v := strings.TrimSpace(r.getenv(key))
	if v == "" {
		r.fail(key, "is required")
	}
	return v
}

func (r *reader) duration(key string, def time.Duration) time.Duration {
	v := strings.TrimSpace(r.getenv(key))
	if v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		r.fail(key, "must be a positive duration (e.g. 10s, 15m)")
		return def
	}
	return d
}

func (r *reader) integer(key string, def int) int {
	v := strings.TrimSpace(r.getenv(key))
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		r.fail(key, "must be an integer")
		return def
	}
	return n
}

func (r *reader) int32(key string, def int32) int32 {
	n := r.integer(key, int(def))
	if n < 1 || n > 10_000 {
		r.fail(key, "must be between 1 and 10000")
		return def
	}
	return int32(n)
}

func (r *reader) boolean(key string, def bool) bool {
	v := strings.TrimSpace(r.getenv(key))
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		r.fail(key, "must be a boolean")
		return def
	}
	return b
}

func (r *reader) list(key string) []string {
	var out []string
	for _, p := range strings.Split(r.getenv(key), ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func (r *reader) level(key string, def slog.Level) slog.Level {
	v := strings.TrimSpace(r.getenv(key))
	if v == "" {
		return def
	}
	var l slog.Level
	if err := l.UnmarshalText([]byte(v)); err != nil {
		r.fail(key, "must be one of debug, info, warn, error")
		return def
	}
	return l
}
