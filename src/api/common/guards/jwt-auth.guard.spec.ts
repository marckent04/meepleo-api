import type { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { TokenService } from '@/infrastructure/adapters/auth'
import { UnauthenticatedError } from '@/shared/errors'
import { IS_PUBLIC } from '../decorators/public.decorator'
import { JwtAuthGuard } from './jwt-auth.guard'

function contextFor(request: object, type = 'http'): ExecutionContext {
  return {
    getType: () => type,
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

describe('JwtAuthGuard', () => {
  const verifyAccessToken = vi.fn()
  const tokenService = { verifyAccessToken } as unknown as TokenService
  const reflector = new Reflector()
  const guard = new JwtAuthGuard(reflector, tokenService)

  afterEach(() => {
    vi.restoreAllMocks()
    verifyAccessToken.mockReset()
  })

  it('lets public routes through without a token', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
      key === IS_PUBLIC ? true : undefined,
    )
    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(
      true,
    )
    expect(verifyAccessToken).not.toHaveBeenCalled()
  })

  it('rejects a missing or non-bearer Authorization header', async () => {
    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthenticatedError)
    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: 'Basic abc' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthenticatedError)
  })

  it('exposes the user id of a valid token', async () => {
    verifyAccessToken.mockResolvedValue('u1')
    const request: { headers: object; userId?: string } = {
      headers: { authorization: 'Bearer good' },
    }
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true)
    expect(verifyAccessToken).toHaveBeenCalledWith('good')
    expect(request.userId).toBe('u1')
  })

  it('propagates an invalid token', async () => {
    verifyAccessToken.mockRejectedValue(new UnauthenticatedError())
    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: 'Bearer bad' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthenticatedError)
  })
})
