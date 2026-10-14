import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError, type ErrorKind } from '../../kernel/app-error';

/** RFC 9457 Problem Details. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  traceId?: string;
  errors?: Array<{ path: string; message: string }>;
  [ext: string]: unknown;
}

const KIND_TO_STATUS: Record<ErrorKind, number> = {
  validation: HttpStatus.BAD_REQUEST,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  rule_violation: HttpStatus.UNPROCESSABLE_ENTITY,
  unavailable: HttpStatus.SERVICE_UNAVAILABLE,
  internal: HttpStatus.INTERNAL_SERVER_ERROR,
};

const TYPE_BASE = 'https://errors.example.com/';

/** The ONE place errors become HTTP responses (standards §3). Never leaks stack traces. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();
    const problem = this.toProblem(exception);
    problem.instance = req.url;
    problem.traceId = String(req.id);

    if (problem.status >= 500) this.logger.error({ err: exception }, problem.title);
    else this.logger.warn({ code: problem.code, status: problem.status }, problem.title);

    void reply
      .status(problem.status)
      .header('content-type', 'application/problem+json')
      .send(problem);
  }

  private toProblem(exception: unknown): ProblemDetails {
    if (exception instanceof AppError) {
      const status = KIND_TO_STATUS[exception.kind];
      const expose = status < 500 || exception.kind === 'unavailable';
      return {
        type: `${TYPE_BASE}${exception.code.toLowerCase().replaceAll('_', '-')}`,
        title: expose ? exception.message : 'Internal Server Error',
        status,
        code: exception.code,
        ...(expose && exception.details ? { context: exception.details } : {}),
      };
    }
    if (exception instanceof ZodError) {
      return {
        type: `${TYPE_BASE}validation-failed`,
        title: 'Request validation failed',
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_FAILED',
        errors: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        type: 'about:blank',
        title: exception.message,
        status,
        code: `HTTP_${status}`,
      };
    }
    return {
      type: 'about:blank',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL',
    };
  }
}
