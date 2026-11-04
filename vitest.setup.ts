import 'reflect-metadata'

// @Transactional() est neutralisé dans les tests unitaires : les handlers sont
// testés sans contexte CLS ni transaction réelle.
vi.mock('@nestjs-cls/transactional', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nestjs-cls/transactional')>()),
  Transactional:
    () =>
    (_target: object, _key: string | symbol, descriptor: PropertyDescriptor) =>
      descriptor,
}))
