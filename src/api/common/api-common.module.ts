import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AppExceptionFilter } from './filters/app-exception.filter'
import { AcceptLanguageGuard } from './guards/accept-language.guard'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { ErrorCodeOnFailureInterceptor } from './interceptors/error-code-on-failure.interceptor'

/** Cross-cutting behaviors shared by all transports, declared once. */
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AcceptLanguageGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ErrorCodeOnFailureInterceptor },
  ],
})
export class ApiCommonModule {}
