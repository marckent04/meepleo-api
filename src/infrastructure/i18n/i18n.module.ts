import path from 'node:path'
import { Module } from '@nestjs/common'
import { AcceptLanguageResolver, I18nModule } from 'nestjs-i18n'
import { APP_CONFIG, type AppConfig } from '@/shared/config'
import { DEFAULT_LOCALE } from '@/shared/i18n/locale'

/** Dossier des traductions : src/i18n (copié dans dist/i18n au build). */
export const I18N_PATH = path.join(__dirname, '../../i18n')

@Module({
  imports: [
    I18nModule.forRootAsync({
      inject: [APP_CONFIG.KEY],
      useFactory: (app: AppConfig) => ({
        fallbackLanguage: DEFAULT_LOCALE,
        loaderOptions: {
          path: I18N_PATH,
          watch: app.nodeEnv === 'development',
        },
      }),
      resolvers: [AcceptLanguageResolver],
    }),
  ],
})
export class AppI18nModule {}
