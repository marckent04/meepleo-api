import 'reflect-metadata'

// @Transactional() is neutralized in unit tests: handlers are
// tested without a CLS context or a real transaction.
vi.mock('@nestjs-cls/transactional', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nestjs-cls/transactional')>()),
  Transactional:
    () =>
    (_target: object, _key: string | symbol, descriptor: PropertyDescriptor) =>
      descriptor,
}))
