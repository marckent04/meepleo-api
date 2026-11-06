import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { TokenService } from '@/infrastructure/adapters/auth'
import { UnauthenticatedError } from '@/shared/errors'
import type { AuthenticatedRequest } from '../decorators/current-user.decorator'
import { IS_PUBLIC } from '../decorators/public.decorator'

/**
 * Exige un access token `Authorization: Bearer <jwt>` valide, sauf sur les
 * routes marquées `@Public()`. L'utilisateur est exposé via `@CurrentUserId()`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC,
      [context.getHandler(), context.getClass()],
    )
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const [scheme, token] = (request.headers.authorization ?? '').split(' ')
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthenticatedError('Missing bearer token')
    }

    request.userId = await this.tokenService.verifyAccessToken(token)
    return true
  }
}
