import { type HttpException, ValidationPipe } from '@nestjs/common'
import type { Command, Query } from '@nestjs/cqrs'
import { validate } from 'class-validator'
import type { LoggerService } from '@/infrastructure/logger/logger.service'
import {
  CQRSValidationException,
  type OriginType,
} from '@/shared/errors/cqrs-validation.exception'
import { toErrorFields } from '@/shared/errors/validation-fields'

const validationPipe = new ValidationPipe()

/** Messages lisibles (« email must be an email »), comme le ValidationPipe Nest. */
function toValidationMessages(
  errors: Parameters<ReturnType<ValidationPipe['createExceptionFactory']>>[0],
): string[] {
  const exception = validationPipe.createExceptionFactory()(
    errors,
  ) as HttpException
  const response = exception.getResponse()
  if (
    typeof response === 'object' &&
    'message' in response &&
    Array.isArray(response.message)
  ) {
    return response.message.map(String)
  }
  return [exception.message]
}

/**
 * Filet de sécurité indépendant du transport : valide les décorateurs
 * class-validator de la Command/Query avant son exécution.
 */
async function validatePayload(
  data: object,
  operationName: string,
  originType: OriginType,
): Promise<void> {
  const errors = await validate(data, { forbidUnknownValues: false })
  if (errors.length === 0) return
  throw new CQRSValidationException({
    data: structuredClone(data),
    operationName,
    originType,
    validationErrors: toValidationMessages(errors),
    fields: toErrorFields(errors),
  })
}

export abstract class AppCommandHandler<
  TCommand extends Command<TResult>,
  TResult,
> {
  constructor(
    protected readonly logger: LoggerService,
    private readonly originType: OriginType,
    private readonly operationName: string,
  ) {}

  async execute(command: TCommand): Promise<TResult> {
    await validatePayload(command, this.operationName, this.originType)
    return this.handle(command)
  }

  abstract handle(command: TCommand): Promise<TResult>
}

export abstract class AppQueryHandler<TQuery extends Query<TResult>, TResult> {
  constructor(
    protected readonly logger: LoggerService,
    private readonly originType: OriginType,
    private readonly operationName: string,
  ) {}

  async execute(query: TQuery): Promise<TResult> {
    await validatePayload(query, this.operationName, this.originType)
    return this.handle(query)
  }

  abstract handle(query: TQuery): Promise<TResult>
}
