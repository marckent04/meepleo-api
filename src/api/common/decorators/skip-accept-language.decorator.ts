import { SetMetadata } from '@nestjs/common'

export const SKIP_ACCEPT_LANGUAGE = 'skipAcceptLanguage'

/** Exempts the route (or controller) from the mandatory Accept-Language header. */
export const SkipAcceptLanguage = () => SetMetadata(SKIP_ACCEPT_LANGUAGE, true)
