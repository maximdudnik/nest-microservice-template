import 'reflect-metadata';
import type { IncomingMessage } from 'node:http';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { APP_CONFIG } from './shared/infrastructure/config/config.module';
import type { AppConfig } from './shared/infrastructure/config/env.schema';
import {
  CorrelationContext,
  REQUEST_ID_HEADER,
  sanitizeCorrelationId,
} from './shared/infrastructure/correlation/correlation-context';

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    bodyLimit: 1024 * 1024, // 1 MB (standards §8)
    trustProxy: true,
    // Fastify request id == correlation id: accepted from X-Request-Id or generated.
    genReqId: (req: IncomingMessage) => sanitizeCorrelationId(req.headers[REQUEST_ID_HEADER]),
  });
  const fastify = adapter.getInstance();
  fastify.addHook('onRequest', (req, reply, done) => {
    void reply.header(REQUEST_ID_HEADER, req.id);
    CorrelationContext.enterWith(req.id);
    done();
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: undefined });
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);

  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

process.on('unhandledRejection', (reason) => {
  // Programmer error: log and exit; the orchestrator restarts us (standards §3).
  process.stderr.write(
    `${JSON.stringify({ level: 'fatal', msg: 'unhandledRejection', reason: String(reason) })}\n`,
  );
  process.exit(1);
});

bootstrap().catch((err: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ level: 'fatal', msg: 'Bootstrap failed', err: err instanceof Error ? err.message : String(err) })}\n`,
  );
  process.exit(1);
});
