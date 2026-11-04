import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { catchError, type Observable, throwError } from 'rxjs'
import { ErrorCode, InternalError } from '@/shared/errors'
import { ERROR_CODE_ON_FAILURE } from '../decorators/error-code-on-failure.decorator'
import { toAppError } from '../errors/to-app-error'

@Injectable()
export class ErrorCodeOnFailureInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const code = this.reflector.get<ErrorCode | undefined>(
      ERROR_CODE_ON_FAILURE,
      context.getHandler(),
    )
    if (!code) return next.handle()

    return next.handle().pipe(
      catchError((exception: unknown) => {
        const error = toAppError(exception)
        if (error.code !== ErrorCode.INTERNAL_SERVER_ERROR) {
          return throwError(() => exception)
        }
        return throwError(
          () =>
            new InternalError(error.message, {
              code,
              details: error.details,
              cause: exception,
            }),
        )
      }),
    )
  }
}
