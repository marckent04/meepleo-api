import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

/** Request whose user was resolved by JwtAuthGuard. */
export type AuthenticatedRequest = FastifyRequest & { userId?: string }

/** Authenticated user id (`sub` claim of the access token). */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    if (!request.userId) {
      throw new Error('CurrentUserId used on a route without JwtAuthGuard')
    }
    return request.userId
  },
)
