import { Query } from '@nestjs/cqrs'
import type { HealthStatus } from '@/shared/types'

export class GetHealthQuery extends Query<HealthStatus> {}
