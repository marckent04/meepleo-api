import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { ZodSerializerInterceptor } from 'nestjs-zod'
import * as controllers from './controllers'
import { AppZodValidationPipe } from './validation/zod-validation.pipe'

@Module({
  imports: [CqrsModule],
  controllers: [...Object.values(controllers)],
  providers: [
    { provide: APP_PIPE, useClass: AppZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  ],
})
export class RestApiModule {}
