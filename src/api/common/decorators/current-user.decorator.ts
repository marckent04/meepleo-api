import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { NodeRequest } from '@nestjs/platform-node'

/** Request whose user was resolved by JwtAuthGuard. */
export type AuthenticatedRequest = NodeRequest & { userId?: string }

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
