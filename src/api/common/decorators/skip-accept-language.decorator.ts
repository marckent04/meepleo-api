import { SetMetadata } from '@nestjs/common'

export const SKIP_ACCEPT_LANGUAGE = 'skipAcceptLanguage'

/** Dispense la route (ou le contrôleur) de l'en-tête Accept-Language obligatoire. */
export const SkipAcceptLanguage = () => SetMetadata(SKIP_ACCEPT_LANGUAGE, true)
