import { context, propagation, ROOT_CONTEXT, trace, SpanStatusCode, SpanKind, metrics } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';

// Manual instrumentation avoids ESM loader hooks. Without an endpoint all API calls are no-ops.
export const sdk = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? new NodeSDK({
  autoDetectResources: false,
  serviceName: process.env.OTEL_SERVICE_NAME || "delta-notes-backend",
  traceExporter: new OTLPTraceExporter(),
  metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter(), exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL || 60000) })],
  logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter(), maxQueueSize: 128, maxExportBatchSize: 32 })],
}) : null;
sdk?.start();
const duration = metrics.getMeter('delta-notes').createHistogram('http.server.request.duration', {
  unit: 's', advice: { explicitBucketBoundaries: [0, .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10] },
});
export function routeName(url) {
  const path = url.split('?')[0];
  if (/^\/api\/notes\/[^/]+$/.test(path)) return '/api/notes/:id';
  return ['/', '/healthz', '/api/health', '/api/notes', '/app.js', '/styles.css', '/runtime-config.json', '/favicon.svg'].includes(path) ? path : 'other';
}
export function instrument(handler, service) {
  return (req, res) => {
    const route = routeName(req.url);
    const parent = propagation.extract(ROOT_CONTEXT, req.headers);
    return context.with(parent, () => trace.getTracer('delta-notes').startActiveSpan(
      `${req.method} ${route}`, { kind: SpanKind.SERVER }, (span) => {
        const start = performance.now();
        const attributes = { 'http.request.method': req.method, 'http.route': route };
        res.once('finish', () => {
          attributes['http.response.status_code'] = res.statusCode;
          duration.record((performance.now() - start) / 1000, attributes);
          span.setAttributes(attributes);
          if (res.statusCode >= 500) {
            span.setStatus({ code: SpanStatusCode.ERROR });
            logs.getLogger('delta-notes').emit({
              severityNumber: SeverityNumber.ERROR, severityText: 'ERROR',
              body: `${service} request failed`, attributes,
              context: trace.setSpan(ROOT_CONTEXT, span),
            });
          }
          span.end();
        });
        return handler(req, res);
      },
    ));
  };
}
export function traceHeaders(headers) { propagation.inject(context.active(), headers); }
