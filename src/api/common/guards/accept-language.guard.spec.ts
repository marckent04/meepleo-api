import type { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ErrorCode } from '@/shared/errors'
import type { LocalizedRequest } from '../decorators/language.decorator'
import { AcceptLanguageGuard } from './accept-language.guard'

function setup(header?: string, skip = false) {
  const reflector = new Reflector()
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(skip)
  const request = {
    headers: header === undefined ? {} : { 'accept-language': header },
  } as LocalizedRequest
  const context = {
    getType: () => 'http',
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
  return { guard: new AcceptLanguageGuard(reflector), context, request }
}

describe('AcceptLanguageGuard', () => {
  it.each([undefined, '', '   '])(
    'rejects a missing header (%j) with LANGUAGE_REQUIRED',
    (header) => {
      const { guard, context } = setup(header)
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: ErrorCode.LANGUAGE_REQUIRED,
        }),
      )
    },
  )

  it('rejects an unsupported language with UNSUPPORTED_LANGUAGE', () => {
    const { guard, context } = setup('de-DE, es;q=0.5')
    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({
        statusCode: 400,
        code: ErrorCode.UNSUPPORTED_LANGUAGE,
        params: { supported: 'fr, en' },
      }),
    )
  })

  it('accepts a supported language and stores the resolved locale', () => {
    const { guard, context, request } = setup('de, en-GB;q=0.8')
    expect(guard.canActivate(context)).toBe(true)
    expect(request.locale).toBe('en')
  })

  it('lets routes marked @SkipAcceptLanguage through without the header', () => {
    const { guard, context } = setup(undefined, true)
    expect(guard.canActivate(context)).toBe(true)
  })
})
