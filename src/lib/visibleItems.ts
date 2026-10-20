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
 * lines, Excluded=True lines, unmatched CO credits (shown as a warning instead), and — for sub users — lines not assigned to their sub.
 */
/** Lines never shown and never totalled: DRV coverage, Excluded=True, and unmatched CO credits. */
export function isHiddenLine(item: ScopeItem): boolean {
  return item.coverage?.toUpperCase() === 'DRV' || !!item.excluded || !!item.unmatchedCredit
}

export function isDisplayedScopeLine(item: ScopeItem, subId: string | null = null): boolean {
  if (item.isHeader) return false
  if (isHiddenLine(item)) return false
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
  return visibleScopeLines(items, subId).filter(i => i.changeTag !== 'removed')
}
