import { TokenService } from '@/infrastructure/adapters/auth'
import type { RefreshTokenRepository } from '@/infrastructure/database/repositories'
import type { AuthTokens } from '@/shared/types'

/** Issues a token pair and stores the refresh token fingerprint. */
export async function issueTokens(
  tokenService: TokenService,
  refreshTokenRepository: RefreshTokenRepository,
  userId: string,
): Promise<AuthTokens> {
  const [access, refresh] = await Promise.all([
    tokenService.signAccessToken(userId),
    tokenService.signRefreshToken(userId),
  ])
  await refreshTokenRepository.create({
    id: refresh.id,
    userId,
    tokenHash: tokenService.hash(refresh.token),
    expiresAt: refresh.expiresAt,
  })
  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    expiresIn: access.expiresIn,
  }
}
