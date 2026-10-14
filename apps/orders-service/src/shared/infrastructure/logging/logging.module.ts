import { Module } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { LoggerModule } from 'nestjs-pino';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { CorrelationContext } from '../correlation/correlation-context';

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.iban',
  '*.cardNumber',
  '*.email',
];

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.LOG_LEVEL,
          base: {
            service: config.SERVICE_NAME,
            env: config.NODE_ENV,
            version: config.SERVICE_VERSION,
          },
          timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
          messageKey: 'msg',
          formatters: { level: (label: string) => ({ level: label }) },
          redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
          // req.id is set by Fastify's genReqId from X-Request-Id (see main.ts).
          // mixin adds correlation/trace ids to EVERY line, including AMQP consumer logs.
          mixin: () => {
            const span = trace.getActiveSpan()?.spanContext();
            return {
              requestId: CorrelationContext.get(),
              ...(span ? { traceId: span.traceId, spanId: span.spanId } : {}),
            };
          },
          autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
          customLogLevel: (_req, res, err) =>
            err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
          ...(config.LOG_PRETTY ? { transport: { target: 'pino-pretty' } } : {}),
        },
      }),
    }),
  ],
})
export class LoggingModule {}
