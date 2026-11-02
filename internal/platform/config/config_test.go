package config

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func validEnv() map[string]string {
	return map[string]string{
		"DATABASE_URL": "postgres://localhost/meepleo",
		"REDIS_URL":    "redis://localhost:6379/0",
		"JWT_SECRET":   "0123456789abcdef0123456789abcdef",
	}
}

func TestLoad(t *testing.T) {
	t.Parallel()

	t.Run("defaults", func(t *testing.T) {
		t.Parallel()
		cfg, err := Load(env(validEnv()))
		require.NoError(t, err)
		assert.Equal(t, ":8080", cfg.HTTP.Addr)
		assert.Equal(t, 10*time.Second, cfg.HTTP.RequestTimeout)
		assert.Equal(t, "claude-opus-5-5", cfg.Claude.Model)
		assert.True(t, cfg.HTTP.DocsEnabled)
	})

	tests := []struct {
		name    string
		mutate  func(map[string]string)
		wantErr string
	}{
		{"missing database url", func(m map[string]string) { delete(m, "DATABASE_URL") }, "DATABASE_URL is required"},
		{"short jwt secret", func(m map[string]string) { m["JWT_SECRET"] = "short" }, "JWT_SECRET must be at least 32 bytes"},
		{"bad duration", func(m map[string]string) { m["REQUEST_TIMEOUT"] = "soon" }, "REQUEST_TIMEOUT must be a positive duration"},
		{"bad bool", func(m map[string]string) { m["DOCS_ENABLED"] = "maybe" }, "DOCS_ENABLED must be a boolean"},
		{"bad level", func(m map[string]string) { m["LOG_LEVEL"] = "loud" }, "LOG_LEVEL must be one of"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			m := validEnv()
			tt.mutate(m)
			_, err := Load(env(m))
			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.wantErr)
		})
	}
}

func TestValidateWorker(t *testing.T) {
	t.Parallel()
	cfg, err := Load(env(validEnv()))
	require.NoError(t, err)
	require.ErrorContains(t, cfg.ValidateWorker(), "ANTHROPIC_API_KEY")

	cfg.Claude.APIKey = "sk-test"
	require.NoError(t, cfg.ValidateWorker())
}
