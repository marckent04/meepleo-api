import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DATABASE_CONFIG } from './database.config'
import { PrismaService } from './prisma.service'

@Module({
  imports: [ConfigModule.forFeature(DATABASE_CONFIG)],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
