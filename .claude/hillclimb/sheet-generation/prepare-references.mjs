#!/usr/bin/env node
// Freezes the grading references of the sheet-generation eval, once:
//   1. downloads each case's official rulebook (rulebooks.json) to rulebooks/<id>.pdf
//   2. asks the judge for the key-rules checklist -> checklists/<id>.json (paid)
// Existing files are kept: references never change between eval runs. Delete a
// file by hand to rebuild it.
//
//   node .claude/hillclimb/sheet-generation/prepare-references.mjs [--ids g01,g02] [--download-only]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { buildChecklist, uploadRulebook } from './judge.mjs'

const FLOW = dirname(fileURLToPath(import.meta.url))
process.loadEnvFile('.env')

const { values } = parseArgs({
  options: { ids: { type: 'string' }, 'download-only': { type: 'boolean' } },
})
const refs = JSON.parse(readFileSync(join(FLOW, 'rulebooks.json'), 'utf8'))
const wanted = values.ids ? new Set(values.ids.split(',')) : null
const ids = Object.keys(refs).filter(
  (id) => refs[id].status !== 'missing' && refs[id].url && (!wanted || wanted.has(id)),
)
mkdirSync(join(FLOW, 'rulebooks'), { recursive: true })
mkdirSync(join(FLOW, 'checklists'), { recursive: true })

const idsPath = join(FLOW, 'rulebooks', 'file-ids.json')
const fileIds = existsSync(idsPath) ? JSON.parse(readFileSync(idsPath, 'utf8')) : {}
let failed = 0
for (const id of ids) {
  const pdfPath = join(FLOW, 'rulebooks', `${id}.pdf`)
  try {
    if (!existsSync(pdfPath)) {
      const res = await fetch(refs[id].url, {
        headers: { 'user-agent': 'Mozilla/5.0 (rulebook eval fixture)' },
        redirect: 'follow',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.subarray(0, 5).toString() !== '%PDF-') {
        throw new Error(`not a PDF (${res.headers.get('content-type')})`)
      }
      writeFileSync(pdfPath, buf)
      console.error(`${id} downloaded ${(buf.length / 1e6).toFixed(1)} MB`)
    }
    if (values['download-only']) continue
    if (!fileIds[id]) {
      fileIds[id] = await uploadRulebook(pdfPath, `${id}.pdf`)
      writeFileSync(idsPath, `${JSON.stringify(fileIds, null, 2)}\n`)
    }
    const listPath = join(FLOW, 'checklists', `${id}.json`)
    if (existsSync(listPath)) continue
    const { value, model, usage } = await buildChecklist(fileIds[id])
    writeFileSync(
      listPath,
      `${JSON.stringify({ ...value, judge_model: model, judge_usage: usage }, null, 2)}\n`,
    )
    console.error(
      `${id} checklist: ${value.items.length} items (${value.items.filter((i) => i.critical).length} critical), ` +
        `${usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)} in / ${usage.output_tokens} out`,
    )
  } catch (e) {
    failed++
    console.error(`${id} FAILED: ${e?.message ?? e}`)
  }
}
process.exit(failed ? 1 : 0)
