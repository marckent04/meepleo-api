import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC = 'isPublic'

/** Ouvre la route (ou le contrôleur) aux requêtes sans access token. */
export const Public = () => SetMetadata(IS_PUBLIC, true)
