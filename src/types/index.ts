export interface Subcontractor {
  id: string
  name: string
  color: string
}

export interface GlobalSubcontractor {
  id: string
  name: string
  color: string
  defaultPercentage: number
}

export interface JobGroup {
  id: string
  name: string
}

export interface Superintendent {
  id: string
  name: string
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
  photos: string[]
  isHeader?: boolean
  subcontractorId?: string
  comment?: string
  commentNotes?: CommentNote[]
}

export interface WalkNote {
  text: string
  createdAt: string
}

export interface CommentNote {
  text: string
  createdAt: string
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
  projectStatus?: string
  jobGroup?: string
  applicantName?: string
  applicantPhone?: string
  applicantEmail?: string
  sketches?: ProjectSketch[]
  walks?: Walk[]
  roomPhotos?: Record<string, string[]>
  isDemo?: boolean
}
