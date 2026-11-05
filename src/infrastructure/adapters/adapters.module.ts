import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ANTHROPIC_CONFIG } from '@/shared/config'
import { anthropicClientProvider, GameSheetGenerator } from './anthropic'

/**
 * Intégrations externes hors base de données (API tierces, SDK…). Chaque
 * adapter a son sous-dossier, ses schémas Zod et sa config enregistrée ici via
 * ConfigModule.forFeature(...).
 */
@Module({
  imports: [ConfigModule.forFeature(ANTHROPIC_CONFIG)],
  providers: [anthropicClientProvider, GameSheetGenerator],
  exports: [GameSheetGenerator],
})
export class AdaptersModule {}
