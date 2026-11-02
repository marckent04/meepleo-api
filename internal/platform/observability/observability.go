// Package observability configures OpenTelemetry traces and metrics.
//
// Exporters use OTLP over HTTP and read the standard OTEL_* environment
// variables (OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_SERVICE_NAME, ...). When no
// endpoint is configured, the global no-op providers stay in place: the
// instrumentation costs almost nothing and nothing is exported.
package observability

import (
	"context"
	"errors"
	"fmt"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// Shutdown flushes and stops the providers.
type Shutdown func(context.Context) error

// Setup installs the global tracer and meter providers. getenv is usually
// os.Getenv.
func Setup(ctx context.Context, service, version string, getenv func(string) string) (Shutdown, error) {
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))

	if getenv("OTEL_EXPORTER_OTLP_ENDPOINT") == "" &&
		getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") == "" &&
		getenv("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT") == "" {
		return func(context.Context) error { return nil }, nil
	}

	res, err := resource.Merge(resource.Default(), resource.NewSchemaless(
		attribute.String("service.name", service),
		attribute.String("service.version", version),
	))
	if err != nil {
		return nil, fmt.Errorf("otel resource: %w", err)
	}

	traceExp, err := otlptracehttp.New(ctx)
	if err != nil {
		return nil, fmt.Errorf("otlp trace exporter: %w", err)
	}
	tp := sdktrace.NewTracerProvider(sdktrace.WithBatcher(traceExp), sdktrace.WithResource(res))

	metricExp, err := otlpmetrichttp.New(ctx)
	if err != nil {
		_ = tp.Shutdown(ctx)
		return nil, fmt.Errorf("otlp metric exporter: %w", err)
	}
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExp)), sdkmetric.WithResource(res))

	otel.SetTracerProvider(tp)
	otel.SetMeterProvider(mp)

	return func(ctx context.Context) error {
		return errors.Join(tp.Shutdown(ctx), mp.Shutdown(ctx))
	}, nil
}
