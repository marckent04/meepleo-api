import { createHash, randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import type { ConfigType } from '@nestjs/config'
import { JwtService, type JwtSignOptions } from '@nestjs/jwt'
import { JWT_CONFIG } from '@/shared/config'
import { ErrorCode, UnauthenticatedError } from '@/shared/errors'

type Expiry = JwtSignOptions['expiresIn']

export type IssuedAccessToken = {
  token: string
  /** Lifetime, in seconds. */
  expiresIn: number
}

export type IssuedRefreshToken = {
  token: string
  /** `jti` claim, identifier of the token in the database. */
  id: string
  expiresAt: Date
}

type TokenPayload = { sub: string; jti?: string; iat: number; exp: number }

/** Issuing and verifying JWTs (access and refresh, distinct secrets). */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(JWT_CONFIG.KEY)
    private readonly config: ConfigType<typeof JWT_CONFIG>,
  ) {}

  async signAccessToken(userId: string): Promise<IssuedAccessToken> {
    const token = await this.jwt.signAsync(
      { sub: userId },
      {
        secret: this.config.accessSecret,
        expiresIn: this.config.accessTtl as Expiry,
      },
    )
    const { iat, exp } = this.jwt.decode<TokenPayload>(token)
    return { token, expiresIn: exp - iat }
  }

  async signRefreshToken(userId: string): Promise<IssuedRefreshToken> {
    const id = randomUUID()
    const token = await this.jwt.signAsync(
      { sub: userId },
      {
        secret: this.config.refreshSecret,
        expiresIn: this.config.refreshTtl as Expiry,
        jwtid: id,
      },
    )
    const { exp } = this.jwt.decode<TokenPayload>(token)
    return { token, id, expiresAt: new Date(exp * 1000) }
  }

  /** Returns the user id; throws UnauthenticatedError otherwise. */
  async verifyAccessToken(token: string): Promise<string> {
    try {
      const { sub } = await this.jwt.verifyAsync<TokenPayload>(token, {
        secret: this.config.accessSecret,
      })
      return sub
    } catch (cause) {
      throw new UnauthenticatedError('Invalid access token', { cause })
    }
  }

  /** Throws UnauthenticatedError (INVALID_REFRESH_TOKEN) if the JWT is invalid. */
  async verifyRefreshToken(
    token: string,
  ): Promise<{ userId: string; id: string }> {
    try {
      const { sub, jti } = await this.jwt.verifyAsync<TokenPayload>(token, {
        secret: this.config.refreshSecret,
      })
      if (!jti) throw new Error('Missing jti claim')
      return { userId: sub, id: jti }
    } catch (cause) {
      throw new UnauthenticatedError('Invalid refresh token', {
        code: ErrorCode.INVALID_REFRESH_TOKEN,
        cause,
      })
    }
  }

  /** Fingerprint stored in the database in place of the refresh token. */
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }
}
