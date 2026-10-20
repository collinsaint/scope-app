// Verifies change-order matching on a SOW + CO sample pair.
// Usage: npx tsx scripts/verify-co-matching.ts <sow.xlsx> <co.xlsx>
import { readFileSync } from 'fs'
import { parseExcelFile } from '../src/lib/parseExcel'
import { recomputeFromDocuments } from '../src/lib/recompute'
import { activeScopeLines, visibleScopeLines } from '../src/lib/visibleItems'
import type { ProjectDocument, ScopeItem } from '../src/types'

const [sowPath = '/workspace/rebuild/samples/small.xlsx', coPath = '/workspace/rebuild/samples/big.xlsx'] = process.argv.slice(2)
const ab = (f: string) => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
const sow = parseExcelFile(ab(sowPath)).items, co = parseExcelFile(ab(coPath)).items
const doc = (d: string, items: ScopeItem[]) => ({ id: d, designation: d, fileType: 'excel', fileName: d, parsedItems: items }) as unknown as ProjectDocument
const sum = (L: ScopeItem[]) => Math.round(L.reduce((s, i) => s + i.rcv, 0) * 100) / 100
const key = (i: ScopeItem) => `${i.room}|${i.description}|${i.qty}|${i.unit}|${i.rcv}|${i.date}|${i.changeTag ?? ''}`

const s1 = recomputeFromDocuments([doc('approved-sow', sow)], [])
console.log(`SOW only: active ${activeScopeLines(s1.items).length}, $${sum(activeScopeLines(s1.items))}`)

for (const allDone of [false, true]) {
  const before = allDone ? s1.items.map(i => ({ ...i, completed: true, completedAt: '2026-09-01T00:00:00Z', subcontractorId: 'sub-1', photos: ['p'] })) : s1.items
  const r = recomputeFromDocuments([doc('approved-sow', sow), doc('change-order-1', co)], before)
  const vis = visibleScopeLines(r.items), act = activeScopeLines(r.items)
  const dups = vis.length - new Set(vis.map(key)).size
  console.log(`\nSOW+CO (${allDone ? 'every SOW line completed first' : 'nothing completed'}):`)
  console.log(`  rows shown ${vis.length}, active (counted) ${act.length}, removed ${vis.filter(i => i.changeTag === 'removed').length}, new ${act.filter(i => i.changeTag === 'new').length}`)
  console.log(`  scopeTotal $${r.scopeTotal}, active sum $${sum(act)}, duplicate visible rows ${dups}`)
  console.log(`  unmatched credits: ${r.items.filter(i => i.unmatchedCredit).map(i => `${i.room} | ${i.description} ${i.rcv}`).join('; ') || 'none'}`)
  if (allDone) {
    console.log(`  still completed ${act.filter(i => i.completed).length}, with sub carried ${act.filter(i => i.subcontractorId === 'sub-1').length}, photos carried ${act.filter(i => i.photos.length).length}`)
    console.log(`  new lines completed (should be 0): ${act.filter(i => i.changeTag === 'new' && i.completed).length}`)
    console.log(`  completed-then-credited ${r.completedThenCredited.length}:`)
    r.completedThenCredited.forEach(c => console.log(`    ${c.room} | ${c.description} | $${c.rcv} | sub ${c.subcontractorId} | completed ${c.completedAt}`))
  }
}
