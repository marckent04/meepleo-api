import { Module } from '@nestjs/common'
import { ApiCommonModule } from './api/common/api-common.module'
import { RestApiModule } from './api/rest/rest.module'
import { DomainModule } from './domain/domain.module'
import { InfrastructureModule } from './infrastructure/infrastructure.module'

@Module({
  imports: [InfrastructureModule, DomainModule, ApiCommonModule, RestApiModule],
})
export class AppModule {}
