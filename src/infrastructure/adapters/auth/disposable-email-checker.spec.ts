import { DisposableEmailChecker } from './disposable-email-checker'

describe('DisposableEmailChecker', () => {
  const checker = new DisposableEmailChecker()

  it.each([
    ['a known disposable domain', 'x@mailinator.com'],
    ['a different case', 'X@MAILINATOR.COM'],
    ['a subdomain of a disposable domain', 'x@a.b.mailinator.com'],
  ])('flags %s', (_name, email) => {
    expect(checker.isDisposable(email)).toBe(true)
  })

  it.each([
    ['a legitimate domain', 'ada@gmail.com'],
    ['an email without @', 'not-an-email'],
    ['a bare TLD', 'x@com'],
  ])('does not flag %s', (_name, email) => {
    expect(checker.isDisposable(email)).toBe(false)
  })
})
