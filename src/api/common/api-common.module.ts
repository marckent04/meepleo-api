import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AppExceptionFilter } from './filters/app-exception.filter'
import { ErrorCodeOnFailureInterceptor } from './interceptors/error-code-on-failure.interceptor'

/** Comportements transverses aux transports, déclarés une seule fois. */
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ErrorCodeOnFailureInterceptor },
  ],
})
export class ApiCommonModule {}
