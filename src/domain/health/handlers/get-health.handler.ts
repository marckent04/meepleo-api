import { performance } from 'node:perf_hooks'
import { QueryHandler } from '@nestjs/cqrs'
import { HealthRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { HealthStatus } from '@/shared/types'
import { AppQueryHandler } from '@/utils/cqrs.utils'
import { GetHealthQuery } from '../queries'

@QueryHandler(GetHealthQuery)
export class GetHealthHandler extends AppQueryHandler<
  GetHealthQuery,
  HealthStatus
> {
  constructor(
    private readonly healthRepository: HealthRepository,
    logger: LoggerService,
  ) {
    super(logger, 'system', GetHealthQuery.name)
    this.logger.setContext(GetHealthHandler.name)
  }

  async handle(): Promise<HealthStatus> {
    const startedAt = performance.now()
    await this.healthRepository.ping()
    const latencyMs = Math.round(performance.now() - startedAt)
    return new HealthStatus(latencyMs, new Date())
  }
}
