import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { ANTHROPIC_CONFIG, JWT_CONFIG } from '@/shared/config'
import {
  anthropicClientProvider,
  GameSheetGenerator,
  GameSheetTranslator,
} from './anthropic'
import { PasswordHasher, TokenService } from './auth'

/**
 * Intégrations externes hors base de données (API tierces, SDK…). Chaque
 * adapter a son sous-dossier, ses schémas Zod et sa config enregistrée ici via
 * ConfigModule.forFeature(...).
 */
@Module({
  imports: [
    ConfigModule.forFeature(ANTHROPIC_CONFIG),
    ConfigModule.forFeature(JWT_CONFIG),
    // Secrets et durées passés à chaque appel par TokenService.
    JwtModule.register({}),
  ],
  providers: [
    anthropicClientProvider,
    GameSheetGenerator,
    GameSheetTranslator,
    PasswordHasher,
    TokenService,
  ],
  exports: [
    GameSheetGenerator,
    GameSheetTranslator,
    PasswordHasher,
    TokenService,
  ],
})
export class AdaptersModule {}
