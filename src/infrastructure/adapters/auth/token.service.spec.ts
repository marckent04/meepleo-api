import { JwtService } from '@nestjs/jwt'
import { ErrorCode, UnauthenticatedError } from '@/shared/errors'
import { TokenService } from './token.service'

const config = {
  accessSecret: 'a'.repeat(32),
  refreshSecret: 'b'.repeat(32),
  accessTtl: '15m',
  refreshTtl: '30d',
}

describe('TokenService', () => {
  const service = new TokenService(new JwtService(), config)

  it('signs an access token valid for the configured duration', async () => {
    const { token, expiresIn } = await service.signAccessToken('user-1')
    expect(expiresIn).toBe(900)
    expect(await service.verifyAccessToken(token)).toBe('user-1')
  })

  it('signs a refresh token carrying its jti and expiry', async () => {
    const issued = await service.signRefreshToken('user-1')
    expect(await service.verifyRefreshToken(issued.token)).toEqual({
      userId: 'user-1',
      id: issued.id,
    })
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('does not accept a refresh token as an access token (and vice versa)', async () => {
    const access = await service.signAccessToken('user-1')
    const refresh = await service.signRefreshToken('user-1')
    await expect(
      service.verifyAccessToken(refresh.token),
    ).rejects.toBeInstanceOf(UnauthenticatedError)
    await expect(
      service.verifyRefreshToken(access.token),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_REFRESH_TOKEN })
  })

  it('rejects garbage', async () => {
    await expect(service.verifyAccessToken('nope')).rejects.toBeInstanceOf(
      UnauthenticatedError,
    )
  })

  it('hashes deterministically without leaking the token', () => {
    expect(service.hash('abc')).toBe(service.hash('abc'))
    expect(service.hash('abc')).not.toContain('abc')
  })
})
