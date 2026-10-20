import type { CompletedThenCredited, ProjectDocument, ScopeItem } from '../types'
import { mergeItems, cancelCreditedItems, diffAndMergeChangeOrder } from './parseExcel'

// Ordered from base → most-recent; site-visit is excluded (it drives Walk View only).
const SCOPE_ORDER = ['approved-sow', 'change-order-1', 'change-order-2', 'change-order-3'] as const

export function recomputeFromDocuments(documents: ProjectDocument[], currentItems: ScopeItem[]): { items: ScopeItem[]; walkSourceItems: ScopeItem[]; scopeTotal?: number; completedThenCredited: CompletedThenCredited[] } {
  const siteVisitDoc = documents.find(d => d.designation === 'site-visit' && d.fileType === 'excel')
  const walkSourceItems = siteVisitDoc?.parsedItems ?? []

  // Collect scope docs in hierarchy order that have parsed Excel data.
  const scopeDocs = SCOPE_ORDER
    .map(desig => documents.find(d => d.designation === desig && d.fileType === 'excel'))
    .filter((d): d is ProjectDocument => !!(d?.parsedItems?.length))

  if (scopeDocs.length === 0) return { items: currentItems, walkSourceItems, completedThenCredited: [] }

  if (scopeDocs.length === 1) {
    // Single base document — cancel any internal credit pairs before merging.
    const items = mergeItems(currentItems, cancelCreditedItems(scopeDocs[0].parsedItems!))
    return { items, walkSourceItems, completedThenCredited: [] }
  }

  // For Full-SOW COs every document already contains all previous items, so
  // concatenating earlier docs would duplicate them and corrupt cancellation.
  // Use the penultimate document directly as the clean baseline instead.
  const prevClean = cancelCreditedItems(scopeDocs[scopeDocs.length - 2].parsedItems!)

  // Diff the clean previous state against the current (latest) document to
  // produce REMOVED / NEW tags.
  const currentDoc = scopeDocs[scopeDocs.length - 1]
  const diffed = diffAndMergeChangeOrder(prevClean, currentDoc.parsedItems!)

  // Restore completion state / photos from the live project items, then
  // strip completion from anything tagged REMOVED (it's out of scope).
  const merged = mergeItems(currentItems, diffed)
  // Record lines that were completed and are now credited out by this CO.
  const now = new Date().toISOString()
  const completedThenCredited: CompletedThenCredited[] = merged
    .filter(i => i.changeTag === 'removed' && i.completed && i.rcv > 0)
    .map(i => ({ itemId: i.id, room: i.room, description: i.description, subcontractorId: i.subcontractorId, rcv: i.rcv, completedAt: i.completedAt, creditedAt: now, documentName: currentDoc.fileName }))
  const items = merged.map(item =>
    item.changeTag === 'removed'
      ? { ...item, completed: false, completedAt: undefined, pendingApproval: undefined, pendingApprovalAt: undefined }
      : item
  )

  // Compute scope total directly from the CO's raw parsedItems so it always
  // matches the CO Excel exactly — sum of all non-header rows (positive items
  // minus credits).  This bypasses any key-matching ambiguity in the merged list.
  const scopeTotal = currentDoc.parsedItems!
    .filter(i => !i.isHeader && !i.excluded)
    .reduce((s, i) => s + i.rcv, 0)

  return { items, walkSourceItems, scopeTotal: Math.round(scopeTotal * 100) / 100, completedThenCredited }
}

export function accumulateCTC(existing: CompletedThenCredited[] | undefined, found: CompletedThenCredited[]): CompletedThenCredited[] | undefined {
  if (!found.length) return existing
  const have = new Set((existing ?? []).map(e => e.itemId))
  const add = found.filter(f => !have.has(f.itemId))
  return add.length ? [...(existing ?? []), ...add] : existing
}

