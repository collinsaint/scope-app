import type { Project, PurchaseOrder } from '../types'

function derivePrefix(project: Project): string {
  if (project.projectCode?.trim()) return project.projectCode.trim()
  return project.name
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase()
    .slice(0, 16)
}

export function generatePONumber(project: Project, existingPOs: PurchaseOrder[]): string {
  const prefix = derivePrefix(project)
  let maxNum = 0
  for (const po of existingPOs) {
    if (po.project_id !== project.id) continue
    const num = po.poNumber ?? po.title ?? ''
    const match = num.match(/-(\d{3})$/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (n > maxNum) maxNum = n
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`
}
