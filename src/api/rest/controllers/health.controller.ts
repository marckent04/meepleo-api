import { Controller, Get } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { ZodResponse } from 'nestjs-zod'
import { GetHealthQuery } from '@/domain/health'
import { ErrorCode } from '@/shared/errors'
import {
  ErrorCodeOnFailure,
  Public,
  SkipAcceptLanguage,
} from '../../common/decorators'
import { HealthResponseDto } from '../dto'
import { ApiErrorResponses } from '../errors'

@ApiTags('health')
@Public()
@SkipAcceptLanguage()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @SkipThrottle()
  @ApiOperation({
    summary: 'Check the health of the API and the database',
  })
  @ZodResponse({ status: 200, type: HealthResponseDto })
  @ApiErrorResponses(500)
  @ErrorCodeOnFailure(ErrorCode.HEALTH_CHECK_FAILED)
  async check(): Promise<HealthResponseDto> {
    const health = await this.queryBus.execute(new GetHealthQuery())
    return HealthResponseDto.fromDomain(health)
  }
}
