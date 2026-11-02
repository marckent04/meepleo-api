// Package claudeapi implements app.SheetGenerator with the Claude API.
//
// The model searches the web for the barcode (server-side web search tool)
// and answers with a structured JSON sheet. A model that only receives 13
// digits does not "know" the product and would invent a plausible game; the
// web search lets it check, and the prompt and schema let it answer
// "not_found" instead of guessing.
package claudeapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/anthropics/anthropic-sdk-go/v2"
	"github.com/anthropics/anthropic-sdk-go/v2/option"
	"github.com/anthropics/anthropic-sdk-go/v2/packages/param"
	"github.com/anthropics/anthropic-sdk-go/v2/shared/constant"

	"github.com/meepleo/meepleo-api/internal/catalog/domain"
	"github.com/meepleo/meepleo-api/internal/platform/httpclient"
)

// Config configures the generator.
type Config struct {
	APIKey  string
	BaseURL string // empty for the public API; set in tests
	Model   string
	// MaxWebSearches bounds the searches per sheet, which bounds its cost.
	MaxWebSearches int64
}

// Generator calls Claude to build game sheets.
type Generator struct {
	client anthropic.Client
	model  string
	cfg    Config
}

// maxContinuations bounds how many times a paused server-side tool loop
// (stop_reason "pause_turn") is resumed.
const maxContinuations = 3

// New returns a Generator. httpClient is the resilient client from
// platform/httpclient: retries, backoff and circuit breaking happen there, so
// the SDK's own retries are disabled to avoid multiplying attempts.
func New(cfg Config, httpClient *http.Client) *Generator {
	if cfg.MaxWebSearches <= 0 {
		cfg.MaxWebSearches = 5
	}
	opts := []option.RequestOption{
		option.WithAPIKey(cfg.APIKey),
		option.WithHTTPClient(httpClient),
		option.WithMaxRetries(0),
	}
	if cfg.BaseURL != "" {
		opts = append(opts, option.WithBaseURL(cfg.BaseURL))
	}
	return &Generator{client: anthropic.NewClient(opts...), model: cfg.Model, cfg: cfg}
}

// Generate implements app.SheetGenerator.
func (g *Generator) Generate(ctx context.Context, code domain.Barcode) (domain.Generation, error) {
	params := anthropic.BetaMessageNewParams{
		Model:     g.model,
		MaxTokens: 16000,
		System:    []anthropic.BetaTextBlockParam{{Text: systemPrompt}},
		Messages: []anthropic.BetaMessageParam{
			anthropic.NewBetaUserMessage(anthropic.NewBetaTextBlock(userPrompt(code))),
		},
		Tools: []anthropic.BetaToolUnionParam{
			{OfWebSearchTool20260209: &anthropic.BetaWebSearchTool20260209Param{MaxUses: param.NewOpt(g.cfg.MaxWebSearches)}},
		},
		OutputConfig: anthropic.BetaOutputConfigParam{
			// Identifying a product and summarizing its rules is
			// intelligence-sensitive: below "high" the sheets get worse.
			Effort: anthropic.BetaOutputConfigEffortHigh,
			Format: anthropic.BetaJSONOutputFormatParam{Schema: outputSchema()},
		},
		// Server-side fallback: if a safety classifier declines the request,
		// the API re-serves it with a fallback model inside the same call.
		Fallbacks: anthropic.BetaFallbacksParamUnion{OfDefault: constant.ValueOf[constant.Default]()},
		Betas:     []anthropic.AnthropicBeta{anthropic.AnthropicBetaServerSideFallback2026_07_01},
	}

	for range maxContinuations + 1 {
		msg, err := g.client.Beta.Messages.New(ctx, params)
		if err != nil {
			return domain.Generation{Model: g.model}, mapError(err)
		}
		switch msg.StopReason {
		case anthropic.BetaStopReasonPauseTurn:
			// The server-side search loop hit its iteration limit: resend
			// the conversation as is and the API resumes where it stopped.
			params.Messages = append(params.Messages, msg.ToParam())
			continue
		case anthropic.BetaStopReasonRefusal:
			return domain.Generation{Model: g.model}, fmt.Errorf("model refused to answer for %s", code)
		case anthropic.BetaStopReasonMaxTokens:
			return domain.Generation{Model: g.model}, fmt.Errorf("model answer truncated (max_tokens) for %s", code)
		}
		raw := finalText(msg)
		if raw == "" {
			return domain.Generation{Model: g.model}, fmt.Errorf("model returned no answer for %s (stop reason %q)", code, msg.StopReason)
		}
		return toGeneration([]byte(raw), msg.Model)
	}
	return domain.Generation{Model: g.model}, fmt.Errorf("model did not finish after %d continuations for %s", maxContinuations, code)
}

// finalText returns the text written after the last tool block: the
// structured answer, without any text the model wrote between searches.
func finalText(msg *anthropic.BetaMessage) string {
	var b strings.Builder
	for _, block := range msg.Content {
		switch v := block.AsAny().(type) {
		case anthropic.BetaTextBlock:
			b.WriteString(v.Text)
		case anthropic.BetaServerToolUseBlock, anthropic.BetaWebSearchToolResultBlock:
			b.Reset()
		}
	}
	return strings.TrimSpace(b.String())
}

// mapError marks transient failures (overload, rate limit, outage, open
// circuit, timeout) as domain.ErrGenerationUnavailable. They are retried by
// the worker later; none of them reach an HTTP client.
func mapError(err error) error {
	var apiErr *anthropic.Error
	switch {
	case errors.Is(err, httpclient.ErrCircuitOpen),
		errors.Is(err, context.DeadlineExceeded):
		return fmt.Errorf("%w: %w", domain.ErrGenerationUnavailable, err)
	case errors.As(err, &apiErr):
		if apiErr.StatusCode == http.StatusTooManyRequests || apiErr.StatusCode >= http.StatusInternalServerError {
			return fmt.Errorf("%w: claude api status %d", domain.ErrGenerationUnavailable, apiErr.StatusCode)
		}
		return fmt.Errorf("claude api status %d: %w", apiErr.StatusCode, err)
	default:
		return fmt.Errorf("claude api call: %w", err)
	}
}
