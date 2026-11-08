import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import dnupOutput from './__fixtures__/dnup-sheet.output.json'
import { GameSheetOutputSchema } from './game-sheet.schema'

describe('GameSheetOutputSchema', () => {
  it('accepts a sheet shaped like src/dnup.json', () => {
    expect(GameSheetOutputSchema.safeParse(dnupOutput).success).toBe(true)
  })

  it('rejects an unknown confidence level', () => {
    const result = GameSheetOutputSchema.safeParse({
      ...dnupOutput,
      confidence: 'certain',
    })
    expect(result.success).toBe(false)
  })

  it('produces a JSON schema whose objects forbid extra properties', () => {
    const { schema } = zodOutputFormat(GameSheetOutputSchema)
    const objects: Record<string, unknown>[] = []
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (node === null || typeof node !== 'object') return
      const record = node as Record<string, unknown>
      if (record.type === 'object') objects.push(record)
      Object.values(record).forEach(walk)
    }
    walk(schema)

    expect(objects.length).toBeGreaterThan(5)
    for (const object of objects) {
      expect(object.additionalProperties).toBe(false)
    }
  })

  it('fits the structured-output complexity budget', () => {
    // The grammar compiled by the API is capped (schema + web tools):
    // the version with nullable fields and an `id` on entries was rejected
    // with a 400 "compiled grammar is too large". See game-sheet.schema.ts.
    const { schema } = zodOutputFormat(GameSheetOutputSchema)
    let unions = 0
    let ids = 0
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (node === null || typeof node !== 'object') return
      const record = node as Record<string, unknown>
      if (Array.isArray(record.anyOf) || Array.isArray(record.type)) unions++
      const properties = record.properties as
        | Record<string, unknown>
        | undefined
      if (properties && 'id' in properties) ids++
      Object.values(record).forEach(walk)
    }
    walk(schema)

    expect(unions).toBe(0)
    expect(ids).toBe(0)
  })
})
