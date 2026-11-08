import { Injectable } from '@nestjs/common'
import * as argon2 from 'argon2'

/** Password hashing with argon2id (default parameters of the lib). */
@Injectable()
export class PasswordHasher {
  /** Fingerprint of a dummy password, to equalize the response time. */
  private dummyHash?: Promise<string>

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id })
  }

  /** `false` if the password does not match or if the fingerprint is unreadable. */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password)
    } catch {
      return false
    }
  }

  /**
   * To call when the user does not exist: the login then takes as much
   * time as for a wrong password, which prevents guessing accounts.
   */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('dummy-password-for-timing')
    await this.verify(await this.dummyHash, password)
  }
}
