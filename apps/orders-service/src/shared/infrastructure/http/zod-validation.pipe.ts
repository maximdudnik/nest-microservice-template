import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Validates + strips unknown fields at the boundary; ZodError is mapped by ProblemDetailsFilter. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
