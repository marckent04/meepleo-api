import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

/** Requête dont l'utilisateur a été résolu par JwtAuthGuard. */
export type AuthenticatedRequest = FastifyRequest & { userId?: string }

/** Identifiant de l'utilisateur authentifié (claim `sub` de l'access token). */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    if (!request.userId) {
      throw new Error('CurrentUserId used on a route without JwtAuthGuard')
    }
    return request.userId
  },
)
