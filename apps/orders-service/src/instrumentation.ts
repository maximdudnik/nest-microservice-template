/**
 * OpenTelemetry bootstrap. MUST load before anything else:
 *   node --require ./dist/instrumentation.js dist/main.js
 * Export is enabled only when OTEL_EXPORTER_OTLP_ENDPOINT is set (standard OTEL_* env vars apply).
 */
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];

if (endpoint) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]:
        process.env['OTEL_SERVICE_NAME'] ?? process.env['SERVICE_NAME'] ?? 'orders-service',
      [ATTR_SERVICE_VERSION]: process.env['SERVICE_VERSION'] ?? '0.0.0',
      'deployment.environment.name': process.env['NODE_ENV'] ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() })],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      }),
    ],
  });
  sdk.start();
  const shutdown = () => void sdk.shutdown().catch(() => undefined);
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
