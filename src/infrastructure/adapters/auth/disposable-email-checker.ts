import { Injectable } from '@nestjs/common'
import disposableDomains from 'disposable-email-domains'

/** Détecte les adresses email jetables (liste `disposable-email-domains`). */
@Injectable()
export class DisposableEmailChecker {
  private readonly domains = new Set<string>(disposableDomains)

  /** `true` si le domaine de l'email, ou l'un de ses domaines parents, est jetable. */
  isDisposable(email: string): boolean {
    const at = email.lastIndexOf('@')
    if (at === -1) return false

    const labels = email
      .slice(at + 1)
      .trim()
      .toLowerCase()
      .split('.')
    // a.b.mailinator.com → a.b.mailinator.com, b.mailinator.com, mailinator.com
    for (let i = 0; i < labels.length - 1; i++) {
      if (this.domains.has(labels.slice(i).join('.'))) return true
    }
    return false
  }
}
