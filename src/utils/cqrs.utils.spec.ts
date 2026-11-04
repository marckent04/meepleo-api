import { Command, Query } from '@nestjs/cqrs'
import { IsEmail, IsInt, Min } from 'class-validator'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import type { LoggerService } from '@/infrastructure/logger/logger.service'
import { CQRSValidationException, ErrorCode } from '@/shared/errors'
import { AppCommandHandler, AppQueryHandler } from './cqrs.utils'

class InviteCommand extends Command<string> {
  @IsEmail()
  readonly email: string

  constructor(email: string) {
    super()
    this.email = email
  }
}

class CountQuery extends Query<number> {
  @IsInt()
  @Min(1)
  readonly limit: number

  constructor(limit: number) {
    super()
    this.limit = limit
  }
}

const logger = mockLoggerService as unknown as LoggerService

class InviteHandler extends AppCommandHandler<InviteCommand, string> {
  constructor(originType: 'user' | 'system') {
    super(logger, originType, InviteCommand.name)
  }

  async handle(command: InviteCommand): Promise<string> {
    return `invited ${command.email}`
  }
}

class CountHandler extends AppQueryHandler<CountQuery, number> {
  constructor() {
    super(logger, 'user', CountQuery.name)
  }

  async handle(query: CountQuery): Promise<number> {
    return query.limit
  }
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected the promise to reject')
}

describe('AppCommandHandler / AppQueryHandler', () => {
  it('executes the handler when the payload is valid', async () => {
    await expect(
      new InviteHandler('user').execute(new InviteCommand('a@b.co')),
    ).resolves.toBe('invited a@b.co')
    await expect(new CountHandler().execute(new CountQuery(3))).resolves.toBe(3)
  })

  it('turns an invalid user payload into a 400 VALIDATION_FAILED', async () => {
    const error = await captureError(
      new InviteHandler('user').execute(new InviteCommand('not-an-email')),
    )

    expect(error).toBeInstanceOf(CQRSValidationException)
    expect(error).toMatchObject({
      statusCode: 400,
      code: ErrorCode.VALIDATION_FAILED,
      fields: [{ field: 'email', constraint: 'isEmail' }],
      details: {
        operationName: 'InviteCommand',
        originType: 'user',
        data: { email: 'not-an-email' },
      },
    })
    expect(
      (error as CQRSValidationException).extensions.validationErrors,
    ).toEqual(['email must be an email'])
  })

  it('turns an invalid system payload into a 500 without exposing fields', async () => {
    const error = await captureError(
      new InviteHandler('system').execute(new InviteCommand('nope')),
    )

    expect(error).toMatchObject({
      statusCode: 500,
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      fields: undefined,
    })
    expect((error as CQRSValidationException).extensions).toEqual({
      code: ErrorCode.INTERNAL_SERVER_ERROR,
    })
  })

  it('validates queries too', async () => {
    const error = await captureError(
      new CountHandler().execute(new CountQuery(0)),
    )
    expect(error).toMatchObject({
      fields: [{ field: 'limit', constraint: 'min' }],
    })
  })
})
