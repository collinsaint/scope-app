// ─── Role System ────────────────────────────────────────────────────────────

export type AppRole = 'admin' | 'user'

export type ContractorRole = 'admin' | 'manager' | 'superintendent'

export type SubcontractorRole = 'manager' | 'crew'

export type OrgType = 'contractor' | 'subcontractor'

export interface Organization {
  id: string
  name: string
  type: OrgType
  created_by: string | null
  created_at: string
}

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: ContractorRole
  invited_by: string | null
  joined_at: string
}

export interface SubcontractorMember {
  id: string
  org_id: string
  user_id: string
  role: SubcontractorRole
  invited_by: string | null
  joined_at: string
}

export interface Invitation {
  id: string
  email: string
  org_id: string
  role: string
  invited_by: string | null
  token: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export interface UserProfile {
  id: string
  email: string
  display_name: string | null
  role: AppRole
  created_at: string
}

// The resolved identity of the currently logged-in user
export interface CurrentUser {
  profile: UserProfile
  // Contractor org this user belongs to (null if not yet in an org)
  contractorOrg: Organization | null
  contractorRole: ContractorRole | null
  // Subcontractor org this user belongs to (null if not a subcontractor)
  subcontractorOrg: Organization | null
  subcontractorRole: SubcontractorRole | null
}

// ─── Subcontractors (project-level, existing) ────────────────────────────────

export interface Subcontractor {
  id: string
  name: string
  color: string
  percentage?: number
}

export interface GlobalSubcontractor {
  id: string
  name: string
  color: string
  defaultPercentage: number
  subOrgId?: string  // UUID of the linked subcontractor org in Supabase
}

export interface JobGroup {
  id: string
  name: string
}

export interface Superintendent {
  id: string
  name: string
}

export type DocumentDesignation = 'site-visit' | 'approved-sow' | 'change-order-1' | 'change-order-2' | 'change-order-3'

export interface ProjectDocument {
  id: string
  designation: DocumentDesignation
  fileType: 'excel' | 'pdf'
  fileName: string
  uploadedAt: string
  parsedItems?: ScopeItem[]
  pdfDataUrl?: string
}

export interface ScopeItem {
  id: string
  rowNum: number
  room: string
  description: string
  qty: number
  unit: string
  coverage: string
  activity: string
  rcv: number
  note: string
  completed: boolean
  completedAt?: string
  pendingApproval?: boolean
  pendingApprovalAt?: string
  returned?: boolean
  returnedAt?: string
  returnComment?: string
  returnCommentBy?: string
  approvalComment?: string
  approvalCommentBy?: string
  photos: string[]
  isHeader?: boolean
  subcontractorId?: string
  purchaseOrderId?: string
  comment?: string
  commentNotes?: CommentNote[]
  changeTag?: 'removed' | 'new'
}

export interface WalkNote {
  text: string
  createdAt: string
}

export interface CommentNote {
  text: string
  createdAt: string
  by?: string
  type?: 'comment' | 'approval' | 'return'
}

export interface WalkItemOverride {
  itemId: string
  qty?: number
  notes?: WalkNote[]
  removed?: boolean
}

export interface WalkGroupNote {
  id: string
  room: string
  text: string
  qty?: number
  createdAt: string
}

export interface WalkRoomPhoto {
  id: string
  room: string
  data: string
  createdAt: string
}

export interface WalkGeneralNote {
  id: string
  text: string
  qty?: number
  createdAt: string
}

export interface Walk {
  id: string
  name: string
  createdAt: string
  itemOverrides?: WalkItemOverride[]
  groupNotes?: WalkGroupNote[]
  roomPhotos?: WalkRoomPhoto[]
  customRooms?: string[]
  generalNotes?: WalkGeneralNote[]
}

export const SKETCH_LABELS = ['Main Level', 'Second Level', 'Roof'] as const
export type SketchLabel = typeof SKETCH_LABELS[number]

export interface ProjectSketch {
  label: SketchLabel
  data: string
  fileName: string
}

export interface OneDriveSettings {
  connected: boolean
  accountName: string | null
  accountEmail: string | null
  rootFolderName: string
}

export interface Project {
  id: string
  name: string
  address: string
  createdAt: string
  fileName: string
  items: ScopeItem[]
  subcontractors?: Subcontractor[]
  projectCode?: string
  superintendent?: string
  superintendentId?: string
  projectStatus?: string
  jobGroup?: string
  applicantName?: string
  applicantPhone?: string
  applicantEmail?: string
  sketches?: ProjectSketch[]
  walks?: Walk[]
  roomPhotos?: Record<string, string[]>
  isDemo?: boolean
  spanishMode?: boolean
  translationCache?: Record<string, string>
  documents?: ProjectDocument[]
  walkSourceItems?: ScopeItem[]
  scopeTotal?: number
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────

export type POStatus = 'draft' | 'approved' | 'paid'

export interface PODocument {
  id: string
  name: string
  url: string
  uploadedAt: string
}

export interface PurchaseOrder {
  id: string
  project_id: string
  contractor_org_id: string
  sub_org_id: string | null
  title: string
  amount: number
  status: POStatus
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  // Extended fields stored in `data` JSONB column
  poNumber?: string
  lineItemIds?: string[]
  documents?: PODocument[]
}
