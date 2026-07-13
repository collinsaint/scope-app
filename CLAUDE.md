# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Vite dev server (http://localhost:5173)
npm run build    # tsc && vite build — TypeScript errors fail the build
npm run preview  # Preview the production build locally
```

There is no test runner. TypeScript strict mode is on (`noUnusedLocals` enforced) — unused variables are build errors, not warnings. Always run `npx tsc --noEmit` before pushing.

## Architecture Overview

**Verascope** is a construction scope-of-work management app. React 19 + Vite 8 + TypeScript 6 + Tailwind CSS 4 + Zustand 5 + Supabase.

### Routing

`src/App.tsx` is the root router. There is no React Router — view state is a plain `AppView` string union managed in `useState`. The current view is persisted to `sessionStorage` (`ps-view`) so it survives page refresh, but is cleared on logout so the next fresh login starts at dashboard. `activeProjectId` is persisted in Zustand (localStorage).

### State management

`src/store/useStore.ts` — Zustand v5 with `persist` middleware, stored under the key `proscope-storage`. Two critical behaviors:
- **localStorage strip**: base64 image/sketch data is stripped before writing to localStorage (photos live in Supabase, not localStorage).
- **Hydration recompute**: on every hydration, `recomputeFromDocuments` is called so diff-logic changes take effect without requiring re-uploads.

`recomputeFromDocuments` drives the core item lifecycle: it collapses documents in designation order (`approved-sow → change-order-1 → change-order-2 → change-order-3`), applies `cancelCreditedItems` to remove paired credit/debit rows, then `diffAndMergeChangeOrder` against the latest CO to tag items as `'removed'` or `'new'`. `scopeTotal` is computed directly from the latest CO's raw `parsedItems` to avoid key-matching ambiguity.

### Data persistence

Projects are stored as a **JSON blob** in `projects.data` in Supabase — the entire `Project` object is serialized into one column. There is no relational normalization of scope items. The sync functions in `src/lib/supabaseSync.ts` do an UPDATE first (to preserve the original `owner_id`/`org_id` so subs can't overwrite contractor ownership), then INSERT if no row was updated.

Purchase orders live in a **separate** `purchase_orders` table and are fetched independently via `fetchPurchaseOrders`.

### Role & access system

Two distinct org types: **contractor** and **subcontractor** (never both simultaneously). Resolved by `useCurrentUser` hook via three parallel Supabase calls — `profiles`, `org_members`, and `get_my_sub_membership` RPC (SECURITY DEFINER, used to bypass RLS recursion on the sub membership join).

Key derived booleans in `App.tsx`:
- `isSubUser = !!currentUser?.subcontractorOrg`
- `isContractorAdmin = contractorRole === 'admin' | 'manager'`
- `isSuperintendentRole = !isSubUser && contractorRole === 'superintendent'`

Subs access projects via the `project_access` table (RLS). Contractors own projects via `org_id` on the project row.

### Mobile vs. desktop

`useViewMode` detects the active layout. The scope view renders two completely separate components: `ScopeTable.tsx` (desktop/web) and `MobileScopeList.tsx` (mobile). Any behavior change to the scope view must be applied to both files unless explicitly desktop-only or mobile-only. Use `pb-[calc(60px+env(safe-area-inset-bottom))] sm:pb-0` on any overlay container that might be obscured by the mobile nav bar.

### Subcontractor financials

Sub users see percentage-adjusted totals. The sub's entry is found in `project.subcontractors` by matching `subOrgName` (name match, case-insensitive). Their `percentage` field drives all financial display: `item.rcv * subPercentage / 100`. The "By Subcontractor" breakdown section and Scope History section are contractor-only (`!isSubUser` gate).

### Billable items filter

Consistently applied across all financial summaries:
```ts
items.filter(i => !i.isHeader && i.changeTag !== 'removed' && i.coverage?.toUpperCase() !== 'DRV')
```

### CSS / Design system

Tailwind v4 with custom tokens in `src/index.css`. Use the defined utility classes — don't inline equivalent Tailwind chains:
- Buttons: `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`
- Inputs: `.input-base`, `.label-base`
- Cards: `.card`, `.card-hover`, `.section-card`, `.section-card-header`, `.section-card-body`
- Layout: `.page-header`, `.page-title`, `.page-subtitle`

Dark surface: `#0D0B21` (sidebar, mobile nav). Light bg: `#F4F3FC` (body). Brand violet: `blue-600` (`#3C3489` in the theme).

### Excel parsing

`src/lib/parseExcel.ts` — header rows are identified by descriptions starting with `-`. Key exports: `parseExcel` (raw parse), `mergeItems` (preserve completion/photo state during re-parse), `cancelCreditedItems` (remove paired credit/debit rows), `diffAndMergeChangeOrder` (tag removed/new items when a new CO is uploaded).

### Excel & PDF export

`src/lib/exportReport.ts` uses jsPDF + jspdf-autotable for PDF output and jszip for bundling. The `xlsx` package is used for Excel parsing (not generation — use it for any new Excel generation features too).
