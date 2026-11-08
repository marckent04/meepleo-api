import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC = 'isPublic'

/** Opens the route (or controller) to requests without an access token. */
export const Public = () => SetMetadata(IS_PUBLIC, true)
