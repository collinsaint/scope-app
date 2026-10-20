import type { ScopeItem } from '../types'

/**
 * Single source of truth for which scope lines the scope view displays
 * (ScopeTable desktop + MobileScopeList mobile, with no search/status/coverage
 * filter applied). Every "N items" count in the app must use this so the count
 * equals the number of rows the user can see.
 *
 * Displayed: every non-header line, including REMOVED lines (shown greyed /
 * struck through) and NEW lines.
 * Hidden: header rows (rendered as section labels, not counted), DRV-coverage
 * lines, Excluded=True lines, and — for sub users — lines not assigned to their sub.
 * Unmatched CO credits ARE displayed (flagged amber, locked) so the visible rows
 * add up to the Xactimate total, but they are never counted as items.
 */
/** Lines excluded from item counts / progress / billable lists: DRV, Excluded=True, unmatched CO credits. */
export function isHiddenLine(item: ScopeItem): boolean {
  return item.coverage?.toUpperCase() === 'DRV' || !!item.excluded || !!item.unmatchedCredit
}

export function isDisplayedScopeLine(item: ScopeItem, subId: string | null = null): boolean {
  if (item.isHeader) return false
  if (item.coverage?.toUpperCase() === 'DRV' || item.excluded) return false
  if (subId !== null && item.subcontractorId !== subId) return false
  return true
}

/** Rows filter used by the scope views: keeps headers (pruned later) and displayed lines. */
export function isScopeViewRow(item: ScopeItem, subId: string | null = null): boolean {
  return item.isHeader ? true : isDisplayedScopeLine(item, subId)
}

/** The scope lines the scope view displays (no headers). */
export function visibleScopeLines(items: ScopeItem[], subId: string | null = null): ScopeItem[] {
  return items.filter(i => isDisplayedScopeLine(i, subId))
}

/** Displayed lines that are still in scope (not REMOVED) — basis for progress % and dollars. */
export function activeScopeLines(items: ScopeItem[], subId: string | null = null): ScopeItem[] {
  return visibleScopeLines(items, subId).filter(i => i.changeTag !== 'removed' && !i.unmatchedCredit)
}

/** Rows that can't be completed / selected / assigned: REMOVED lines and unmatched CO credits. */
export function isLockedLine(item: ScopeItem): boolean {
  return item.changeTag === 'removed' || !!item.unmatchedCredit
}

/** Dollar total of the rows the scope view shows (active lines + unmatched credits). Equals the Xactimate total. */
export function visibleScopeTotal(items: ScopeItem[], subId: string | null = null): number {
  const t = visibleScopeLines(items, subId).filter(i => i.changeTag !== 'removed').reduce((s, i) => s + i.rcv, 0)
  return Math.round(t * 100) / 100
}
