import { Injectable } from '@nestjs/common'
import * as argon2 from 'argon2'

/** Hash des mots de passe avec argon2id (paramètres par défaut de la lib). */
@Injectable()
export class PasswordHasher {
  /** Empreinte d'un mot de passe bidon, pour égaliser le temps de réponse. */
  private dummyHash?: Promise<string>

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id })
  }

  /** `false` si le mot de passe ne correspond pas ou si l'empreinte est illisible. */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password)
    } catch {
      return false
    }
  }

  /**
   * À appeler quand l'utilisateur n'existe pas : le login prend alors autant de
   * temps que pour un mauvais mot de passe, ce qui évite de deviner les comptes.
   */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('dummy-password-for-timing')
    await this.verify(await this.dummyHash, password)
  }
}
