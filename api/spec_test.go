package api_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/meepleo/meepleo-api/api"
	"github.com/meepleo/meepleo-api/internal/platform/httpserver"
)

func TestSpecIsValid(t *testing.T) {
	t.Parallel()
	_, err := httpserver.LoadSpec(context.Background(), api.Spec)
	require.NoError(t, err)
}
