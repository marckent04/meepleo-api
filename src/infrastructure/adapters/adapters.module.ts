import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import {
  ANTHROPIC_CONFIG,
  GAME_SHEET_CONFIG,
  JWT_CONFIG,
} from "@/shared/config";
import { GameBarcodeLookup } from "@/shared/types";
import {
  AnthropicGameBarcodeLookup,
  anthropicClientProvider,
  GameSheetGenerator,
  GameSheetTranslator,
} from "./anthropic";
import { DisposableEmailChecker, PasswordHasher, TokenService } from "./auth";

/**
 * External integrations outside the database (third-party APIs, SDKs…). Each
 * adapter has its own subfolder, its Zod schemas and its config registered here via
 * ConfigModule.forFeature(...).
 */
@Module({
  imports: [
    ConfigModule.forFeature(ANTHROPIC_CONFIG),
    ConfigModule.forFeature(GAME_SHEET_CONFIG),
    ConfigModule.forFeature(JWT_CONFIG),
    // Secrets and durations passed on each call by TokenService.
    JwtModule.register({}),
  ],
  providers: [
    anthropicClientProvider,
    // Port bound to its current provider: switch adapters here only.
    { provide: GameBarcodeLookup, useClass: AnthropicGameBarcodeLookup },
    GameSheetGenerator,
    GameSheetTranslator,
    DisposableEmailChecker,
    PasswordHasher,
    TokenService,
  ],
  exports: [
    GameBarcodeLookup,
    GameSheetGenerator,
    GameSheetTranslator,
    DisposableEmailChecker,
    PasswordHasher,
    TokenService,
  ],
})
export class AdaptersModule {}
