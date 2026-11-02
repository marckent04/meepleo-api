package logging

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoggerAddsRequestID(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	log := New(&buf, slog.LevelInfo).With("component", "test")

	log.InfoContext(WithRequestID(context.Background(), "req-42"), "hello")

	var rec map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &rec))
	assert.Equal(t, "req-42", rec["request_id"])
	assert.Equal(t, "test", rec["component"])
}
