import { Module } from '@nestjs/common'

/**
 * Intégrations externes hors base de données (API tierces, SDK…). Chaque
 * adapter a son sous-dossier, ses schémas Zod et sa config enregistrée ici via
 * ConfigModule.forFeature(...).
 */
@Module({
  providers: [],
  exports: [],
})
export class AdaptersModule {}
