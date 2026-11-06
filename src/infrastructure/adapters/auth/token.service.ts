import { createHash, randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import type { ConfigType } from '@nestjs/config'
import { JwtService, type JwtSignOptions } from '@nestjs/jwt'
import { JWT_CONFIG } from '@/shared/config'
import { ErrorCode, UnauthenticatedError } from '@/shared/errors'

type Expiry = JwtSignOptions['expiresIn']

export type IssuedAccessToken = {
  token: string
  /** Durée de vie, en secondes. */
  expiresIn: number
}

export type IssuedRefreshToken = {
  token: string
  /** Claim `jti`, identifiant du token en base. */
  id: string
  expiresAt: Date
}

type TokenPayload = { sub: string; jti?: string; iat: number; exp: number }

/** Émission et vérification des JWT (access et refresh, secrets distincts). */
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

  /** Renvoie l'id de l'utilisateur ; lève UnauthenticatedError sinon. */
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

  /** Lève UnauthenticatedError (INVALID_REFRESH_TOKEN) si le JWT est invalide. */
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

  /** Empreinte stockée en base à la place du refresh token. */
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }
}
