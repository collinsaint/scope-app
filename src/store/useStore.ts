import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project, ScopeItem, Subcontractor, GlobalSubcontractor, JobGroup, Superintendent, ProjectSketch, SketchLabel, Walk, WalkItemOverride, WalkGroupNote, WalkRoomPhoto, WalkGeneralNote, CommentNote, ProjectDocument } from '../types'
import { mergeItems, cancelCreditedItems, diffAndMergeChangeOrder } from '../lib/parseExcel'

// Ordered from base → most-recent; site-visit is excluded (it drives Walk View only).
const SCOPE_ORDER = ['approved-sow', 'change-order-1', 'change-order-2', 'change-order-3'] as const

function recomputeFromDocuments(documents: ProjectDocument[], currentItems: ScopeItem[]): { items: ScopeItem[]; walkSourceItems: ScopeItem[]; scopeTotal?: number } {
  const siteVisitDoc = documents.find(d => d.designation === 'site-visit' && d.fileType === 'excel')
  const walkSourceItems = siteVisitDoc?.parsedItems ?? []

  // Collect scope docs in hierarchy order that have parsed Excel data.
  const scopeDocs = SCOPE_ORDER
    .map(desig => documents.find(d => d.designation === desig && d.fileType === 'excel'))
    .filter((d): d is ProjectDocument => !!(d?.parsedItems?.length))

  if (scopeDocs.length === 0) return { items: currentItems, walkSourceItems }

  if (scopeDocs.length === 1) {
    // Single base document — cancel any internal credit pairs before merging.
    const items = mergeItems(currentItems, cancelCreditedItems(scopeDocs[0].parsedItems!))
    return { items, walkSourceItems }
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
  const items = merged.map(item =>
    item.changeTag === 'removed'
      ? { ...item, completed: false, completedAt: undefined, pendingApproval: undefined, pendingApprovalAt: undefined }
      : item
  )

  // Compute scope total directly from the CO's raw parsedItems so it always
  // matches the CO Excel exactly — sum of all non-header rows (positive items
  // minus credits).  This bypasses any key-matching ambiguity in the merged list.
  const scopeTotal = currentDoc.parsedItems!
    .filter(i => !i.isHeader)
    .reduce((s, i) => s + i.rcv, 0)

  return { items, walkSourceItems, scopeTotal }
}

interface StoreState {
  projects: Project[]
  activeProjectId: string | null
  globalSubcontractors: GlobalSubcontractor[]
  jobGroups: JobGroup[]
  superintendents: Superintendent[]
  viewMode: 'auto' | 'desktop' | 'mobile'
  walkPresets: string[]
  darkMode: boolean

  setViewMode: (mode: 'auto' | 'desktop' | 'mobile') => void
  setDarkMode: (dark: boolean) => void
  setWalkPreset: (index: number, text: string) => void

  replaceProjects: (projects: Project[]) => void
  addProject: (project: Project) => void
  replaceProject: (project: Project) => void
  updateProjectItems: (projectId: string, items: ScopeItem[]) => void
  setActiveProject: (id: string | null) => void
  toggleItem: (projectId: string, itemId: string) => void
  addPhoto: (projectId: string, itemId: string, photo: string) => void
  removePhoto: (projectId: string, itemId: string, index: number) => void
  addRoomPhoto: (projectId: string, room: string, photo: string) => void
  removeRoomPhoto: (projectId: string, room: string, index: number) => void
  deleteProject: (projectId: string) => void
  addSubcontractor: (projectId: string, sub: Subcontractor) => void
  deleteSubcontractor: (projectId: string, subId: string) => void
  updateProjectSubcontractor: (projectId: string, subId: string, updates: Partial<Subcontractor>) => void
  assignSubcontractor: (projectId: string, itemIds: string[], subId: string | null) => void
  bulkComplete: (projectId: string, itemIds: string[]) => void
  bulkUncomplete: (projectId: string, itemIds: string[]) => void
  setPendingApproval: (projectId: string, itemId: string, pending: boolean) => void
  approveItem: (projectId: string, itemId: string, comment?: string, by?: string) => void
  rejectItem: (projectId: string, itemId: string) => void
  returnItem: (projectId: string, itemId: string, comment?: string, by?: string) => void
  bulkSetPending: (projectId: string, itemIds: string[]) => void
  bulkClearPending: (projectId: string, itemIds: string[]) => void
  bulkApproveItems: (projectId: string, itemIds: string[], by?: string) => void
  setComment: (projectId: string, itemId: string, comment: string) => void
  addCommentNote: (projectId: string, itemId: string, note: CommentNote) => void
  deleteCommentNote: (projectId: string, itemId: string, index: number) => void
  setSpanishMode: (projectId: string, enabled: boolean) => void
  setTranslationCache: (projectId: string, cache: Record<string, string>) => void
  updateProjectDetails: (projectId: string, details: { name: string; address: string; projectCode?: string; superintendent?: string; superintendentId?: string; projectStatus?: string; jobGroup?: string; applicantName?: string; applicantPhone?: string; applicantEmail?: string }) => void
  addGlobalSubcontractor: (sub: GlobalSubcontractor) => void
  updateGlobalSubcontractor: (id: string, updates: Partial<GlobalSubcontractor>) => void
  deleteGlobalSubcontractor: (id: string) => void
  replaceGlobalSubcontractors: (subs: GlobalSubcontractor[]) => void
  addJobGroup: (group: JobGroup) => void
  updateJobGroup: (id: string, name: string) => void
  deleteJobGroup: (id: string) => void
  replaceJobGroups: (groups: JobGroup[]) => void
  addSuperintendent: (super_: Superintendent) => void
  updateSuperintendent: (id: string, name: string) => void
  deleteSuperintendent: (id: string) => void
  replaceSuperintendents: (supers: Superintendent[]) => void
  replaceWalkPresets: (presets: string[]) => void
  addSketch: (projectId: string, sketch: ProjectSketch) => void
  removeSketch: (projectId: string, label: SketchLabel) => void
  addWalk: (projectId: string, walk: Walk) => void
  deleteWalk: (projectId: string, walkId: string) => void
  updateWalkItem: (projectId: string, walkId: string, itemId: string, override: Partial<WalkItemOverride>) => void
  addWalkGroupNote: (projectId: string, walkId: string, note: WalkGroupNote) => void
  deleteWalkGroupNote: (projectId: string, walkId: string, noteId: string) => void
  addWalkRoomPhoto: (projectId: string, walkId: string, photo: WalkRoomPhoto) => void
  deleteWalkRoomPhoto: (projectId: string, walkId: string, photoId: string) => void
  bulkDeleteWalkRoomPhotos: (projectId: string, walkId: string, photoIds: string[]) => void
  updateWalkRoomPhoto: (projectId: string, walkId: string, photoId: string, updates: Partial<WalkRoomPhoto>) => void
  addWalkCustomRoom: (projectId: string, walkId: string, room: string) => void
  deleteWalkCustomRoom: (projectId: string, walkId: string, room: string) => void
  addWalkGeneralNote: (projectId: string, walkId: string, note: WalkGeneralNote) => void
  deleteWalkGeneralNote: (projectId: string, walkId: string, noteId: string) => void
  uploadProjectDocument: (projectId: string, doc: ProjectDocument) => void
  removeProjectDocument: (projectId: string, docId: string) => void
  assignItemsToPO: (projectId: string, itemIds: string[], poId: string | null) => void
  setOpPercentage: (projectId: string, pct: number | undefined) => void
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      projects: [],
      activeProjectId: null,
      globalSubcontractors: [],
      jobGroups: [],
      superintendents: [],
      viewMode: 'auto',
      walkPresets: ['', '', '', '', '', ''],
      darkMode: false,

      setViewMode: (mode) => set({ viewMode: mode }),
      setDarkMode: (dark) => set({ darkMode: dark }),

      setWalkPreset: (index, text) =>
        set((s) => {
          const presets = [...s.walkPresets]
          presets[index] = text.slice(0, 20)
          return { walkPresets: presets }
        }),

      replaceProjects: (incoming) => set(() => ({
        projects: incoming.map((p) => {
          if (!(p.documents ?? []).some(d => d.fileType === 'excel' && d.parsedItems?.length)) return p
          const { items, walkSourceItems, scopeTotal } = recomputeFromDocuments(p.documents ?? [], p.items)
          return { ...p, items, walkSourceItems, scopeTotal }
        }),
      })),

      addProject: (project) =>
        set((s) => ({ projects: [...s.projects, project] })),

      replaceProject: (project) =>
        set((s) => ({ projects: s.projects.map((p) => p.id === project.id ? project : p) })),

      updateProjectItems: (projectId, items) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, items } : p
          ),
        })),

      setActiveProject: (id) => set({ activeProjectId: id }),

      toggleItem: (projectId, itemId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  items: p.items.map((item) =>
                    item.id !== itemId
                      ? item
                      : {
                          ...item,
                          completed: !item.completed,
                          completedAt: !item.completed ? new Date().toISOString() : undefined,
                        }
                  ),
                }
          ),
        })),

      addPhoto: (projectId, itemId, photo) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  items: p.items.map((item) =>
                    item.id !== itemId
                      ? item
                      : { ...item, photos: [...item.photos, photo] }
                  ),
                }
          ),
        })),

      removePhoto: (projectId, itemId, index) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  items: p.items.map((item) =>
                    item.id !== itemId
                      ? item
                      : { ...item, photos: item.photos.filter((_, i) => i !== index) }
                  ),
                }
          ),
        })),

      addRoomPhoto: (projectId, room, photo) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  roomPhotos: {
                    ...(p.roomPhotos ?? {}),
                    [room]: [...(p.roomPhotos?.[room] ?? []), photo],
                  },
                }
          ),
        })),

      removeRoomPhoto: (projectId, room, index) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  roomPhotos: {
                    ...(p.roomPhotos ?? {}),
                    [room]: (p.roomPhotos?.[room] ?? []).filter((_, i) => i !== index),
                  },
                }
          ),
        })),

      deleteProject: (projectId) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== projectId),
          activeProjectId: s.activeProjectId === projectId ? null : s.activeProjectId,
        })),

      addSubcontractor: (projectId, sub) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : { ...p, subcontractors: [...(p.subcontractors ?? []), sub] }
          ),
        })),

      deleteSubcontractor: (projectId, subId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  subcontractors: (p.subcontractors ?? []).filter((s) => s.id !== subId),
                  items: p.items.map((item) =>
                    item.subcontractorId === subId
                      ? { ...item, subcontractorId: undefined }
                      : item
                  ),
                }
          ),
        })),

      updateProjectSubcontractor: (projectId, subId, updates) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  subcontractors: (p.subcontractors ?? []).map((sub) =>
                    sub.id !== subId ? sub : { ...sub, ...updates }
                  ),
                }
          ),
        })),

      assignSubcontractor: (projectId, itemIds, subId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  items: p.items.map((item) =>
                    itemIds.includes(item.id)
                      ? { ...item, subcontractorId: subId ?? undefined }
                      : item
                  ),
                }
          ),
        })),

      bulkComplete: (projectId, itemIds) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  items: p.items.map((item) =>
                    itemIds.includes(item.id) && !item.completed
                      ? { ...item, completed: true, completedAt: new Date().toISOString() }
                      : item
                  ),
                }
          ),
        })),

      updateProjectDetails: (projectId, details) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, ...details } : p
          ),
        })),

      setComment: (projectId, itemId, comment) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  items: p.items.map((item) =>
                    item.id === itemId ? { ...item, comment: comment || undefined } : item
                  ),
                }
          ),
        })),

      addCommentNote: (projectId, itemId, note) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              items: p.items.map((item) =>
                item.id !== itemId ? item : {
                  ...item,
                  commentNotes: [...(item.commentNotes ?? []), note],
                }
              ),
            }
          ),
        })),

      deleteCommentNote: (projectId, itemId, index) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              items: p.items.map((item) =>
                item.id !== itemId ? item : {
                  ...item,
                  commentNotes: (item.commentNotes ?? []).filter((_, i) => i !== index),
                }
              ),
            }
          ),
        })),

      setSpanishMode: (projectId, enabled) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : { ...p, spanishMode: enabled }
          ),
        })),

      setTranslationCache: (projectId, cache) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : { ...p, translationCache: { ...(p.translationCache ?? {}), ...cache } }
          ),
        })),

      addGlobalSubcontractor: (sub) =>
        set((s) => ({ globalSubcontractors: [...s.globalSubcontractors, sub] })),

      updateGlobalSubcontractor: (id, updates) =>
        set((s) => ({
          globalSubcontractors: s.globalSubcontractors.map((sub) =>
            sub.id === id ? { ...sub, ...updates } : sub
          ),
        })),

      deleteGlobalSubcontractor: (id) =>
        set((s) => ({ globalSubcontractors: s.globalSubcontractors.filter((sub) => sub.id !== id) })),

      replaceGlobalSubcontractors: (subs) => set({ globalSubcontractors: subs }),
      replaceJobGroups: (groups) => set({ jobGroups: groups }),
      replaceSuperintendents: (supers) => set({ superintendents: supers }),
      replaceWalkPresets: (presets) => set({ walkPresets: presets }),

      addSketch: (projectId, sketch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              sketches: [
                ...(p.sketches ?? []).filter((sk) => sk.label !== sketch.label),
                sketch,
              ],
            }
          ),
        })),

      removeSketch: (projectId, label) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              sketches: (p.sketches ?? []).filter((sk) => sk.label !== label),
            }
          ),
        })),

      addWalk: (projectId, walk) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : { ...p, walks: [...(p.walks ?? []), walk] }
          ),
        })),

      deleteWalk: (projectId, walkId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : { ...p, walks: (p.walks ?? []).filter((w) => w.id !== walkId) }
          ),
        })),

      updateWalkItem: (projectId, walkId, itemId, override) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              walks: (p.walks ?? []).map((w) =>
                w.id !== walkId ? w : {
                  ...w,
                  itemOverrides: [
                    ...(w.itemOverrides ?? []).filter((o) => o.itemId !== itemId),
                    { itemId, ...(w.itemOverrides ?? []).find((o) => o.itemId === itemId), ...override },
                  ],
                }
              ),
            }
          ),
        })),

      addWalkGroupNote: (projectId, walkId, note) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              walks: (p.walks ?? []).map((w) =>
                w.id !== walkId ? w : {
                  ...w,
                  groupNotes: [...(w.groupNotes ?? []), note],
                }
              ),
            }
          ),
        })),

      deleteWalkGroupNote: (projectId, walkId, noteId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              walks: (p.walks ?? []).map((w) =>
                w.id !== walkId ? w : {
                  ...w,
                  groupNotes: (w.groupNotes ?? []).filter((n) => n.id !== noteId),
                }
              ),
            }
          ),
        })),

      addWalkRoomPhoto: (projectId, walkId, photo) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              walks: (p.walks ?? []).map((w) =>
                w.id !== walkId ? w : {
                  ...w,
                  roomPhotos: [...(w.roomPhotos ?? []), photo],
                }
              ),
            }
          ),
        })),

      deleteWalkRoomPhoto: (projectId, walkId, photoId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              walks: (p.walks ?? []).map((w) =>
                w.id !== walkId ? w : {
                  ...w,
                  roomPhotos: (w.roomPhotos ?? []).filter((ph) => ph.id !== photoId),
                }
              ),
            }
          ),
        })),

      bulkDeleteWalkRoomPhotos: (projectId, walkId, photoIds) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              walks: (p.walks ?? []).map((w) =>
                w.id !== walkId ? w : {
                  ...w,
                  roomPhotos: (w.roomPhotos ?? []).filter((ph) => !photoIds.includes(ph.id)),
                }
              ),
            }
          ),
        })),

      updateWalkRoomPhoto: (projectId, walkId, photoId, updates) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              walks: (p.walks ?? []).map((w) =>
                w.id !== walkId ? w : {
                  ...w,
                  roomPhotos: (w.roomPhotos ?? []).map((ph) =>
                    ph.id !== photoId ? ph : { ...ph, ...updates }
                  ),
                }
              ),
            }
          ),
        })),

      addWalkCustomRoom: (projectId, walkId, room) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              walks: (p.walks ?? []).map((w) =>
                w.id !== walkId ? w : {
                  ...w,
                  customRooms: [...(w.customRooms ?? []).filter(r => r !== room), room],
                }
              ),
            }
          ),
        })),

      deleteWalkCustomRoom: (projectId, walkId, room) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              walks: (p.walks ?? []).map((w) =>
                w.id !== walkId ? w : {
                  ...w,
                  customRooms: (w.customRooms ?? []).filter(r => r !== room),
                  groupNotes: (w.groupNotes ?? []).filter(n => n.room !== room),
                  roomPhotos: (w.roomPhotos ?? []).filter(ph => ph.room !== room),
                }
              ),
            }
          ),
        })),

      addWalkGeneralNote: (projectId, walkId, note) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              walks: (p.walks ?? []).map((w) =>
                w.id !== walkId ? w : {
                  ...w,
                  generalNotes: [...(w.generalNotes ?? []), note],
                }
              ),
            }
          ),
        })),

      deleteWalkGeneralNote: (projectId, walkId, noteId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              walks: (p.walks ?? []).map((w) =>
                w.id !== walkId ? w : {
                  ...w,
                  generalNotes: (w.generalNotes ?? []).filter((n) => n.id !== noteId),
                }
              ),
            }
          ),
        })),

      addJobGroup: (group) =>
        set((s) => ({ jobGroups: [...s.jobGroups, group] })),

      updateJobGroup: (id, name) =>
        set((s) => ({
          jobGroups: s.jobGroups.map((g) => g.id === id ? { ...g, name } : g),
        })),

      deleteJobGroup: (id) =>
        set((s) => ({ jobGroups: s.jobGroups.filter((g) => g.id !== id) })),

      addSuperintendent: (super_) =>
        set((s) => ({ superintendents: [...s.superintendents, super_] })),

      updateSuperintendent: (id, name) =>
        set((s) => ({
          superintendents: s.superintendents.map((su) => su.id === id ? { ...su, name } : su),
        })),

      deleteSuperintendent: (id) =>
        set((s) => ({ superintendents: s.superintendents.filter((su) => su.id !== id) })),

      bulkUncomplete: (projectId, itemIds) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  items: p.items.map((item) =>
                    itemIds.includes(item.id) && item.completed
                      ? { ...item, completed: false, completedAt: undefined }
                      : item
                  ),
                }
          ),
        })),

      setPendingApproval: (projectId, itemId, pending) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              items: p.items.map((item) =>
                item.id !== itemId ? item : {
                  ...item,
                  pendingApproval: pending || undefined,
                  pendingApprovalAt: pending ? new Date().toISOString() : undefined,
                  ...(pending ? { returned: undefined, returnComment: undefined } : {}),
                }
              ),
            }
          ),
        })),

      approveItem: (projectId, itemId, comment, by) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              items: p.items.map((item) =>
                item.id !== itemId ? item : {
                  ...item,
                  completed: true,
                  completedAt: new Date().toISOString(),
                  pendingApproval: undefined,
                  pendingApprovalAt: undefined,
                  approvalComment: comment || undefined,
                  approvalCommentBy: by || undefined,
                  commentNotes: comment
                    ? [...(item.commentNotes ?? []), { text: comment, by, type: 'approval' as const, createdAt: new Date().toISOString() }]
                    : item.commentNotes,
                }
              ),
            }
          ),
        })),

      rejectItem: (projectId, itemId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              items: p.items.map((item) =>
                item.id !== itemId ? item : {
                  ...item,
                  pendingApproval: undefined,
                  pendingApprovalAt: undefined,
                }
              ),
            }
          ),
        })),

      returnItem: (projectId, itemId, comment, by) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              items: p.items.map((item) =>
                item.id !== itemId ? item : {
                  ...item,
                  returned: true,
                  returnedAt: new Date().toISOString(),
                  returnComment: comment || undefined,
                  returnCommentBy: by || undefined,
                  pendingApproval: undefined,
                  pendingApprovalAt: undefined,
                  completed: false,
                  commentNotes: comment
                    ? [...(item.commentNotes ?? []), { text: comment, by, type: 'return' as const, createdAt: new Date().toISOString() }]
                    : item.commentNotes,
                }
              ),
            }
          ),
        })),

      bulkSetPending: (projectId, itemIds) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              items: p.items.map((item) =>
                itemIds.includes(item.id) && !item.completed && !item.pendingApproval
                  ? { ...item, pendingApproval: true, pendingApprovalAt: new Date().toISOString() }
                  : item
              ),
            }
          ),
        })),

      bulkClearPending: (projectId, itemIds) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              items: p.items.map((item) =>
                itemIds.includes(item.id) && item.pendingApproval
                  ? { ...item, pendingApproval: undefined, pendingApprovalAt: undefined }
                  : item
              ),
            }
          ),
        })),

      bulkApproveItems: (projectId, itemIds, by) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : {
              ...p,
              items: p.items.map((item) =>
                itemIds.includes(item.id) && item.pendingApproval
                  ? {
                      ...item,
                      completed: true,
                      completedAt: new Date().toISOString(),
                      pendingApproval: undefined,
                      pendingApprovalAt: undefined,
                      approvalCommentBy: by || undefined,
                    }
                  : item
              ),
            }
          ),
        })),

      uploadProjectDocument: (projectId, doc) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId) return p
            const docs = [
              ...(p.documents ?? []).filter(
                (d) => !(d.designation === doc.designation && d.fileType === doc.fileType)
              ),
              doc,
            ]
            const { items, walkSourceItems, scopeTotal } = recomputeFromDocuments(docs, p.items)
            // Auto-create a "Site Visit" walk when the first site-visit Excel is uploaded
            const walks = (doc.designation === 'site-visit' && doc.fileType === 'excel' && !(p.walks ?? []).length)
              ? [{ id: Math.random().toString(36).slice(2, 10), name: 'Site Visit', createdAt: new Date().toISOString() }]
              : p.walks
            return { ...p, documents: docs, items, walkSourceItems, scopeTotal, walks }
          }),
        })),

      removeProjectDocument: (projectId, docId) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId) return p
            const docs = (p.documents ?? []).filter((d) => d.id !== docId)
            const { items, walkSourceItems, scopeTotal } = recomputeFromDocuments(docs, p.items)
            return { ...p, documents: docs, items, walkSourceItems, scopeTotal }
          }),
        })),

      assignItemsToPO: (projectId, itemIds, poId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  items: p.items.map((item) =>
                    itemIds.includes(item.id)
                      ? { ...item, purchaseOrderId: poId ?? undefined }
                      : item
                  ),
                }
          ),
        })),

      setOpPercentage: (projectId, pct) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : { ...p, opPercentage: pct }
          ),
        })),
    }),
    {
      name: 'proscope-storage',
      // Strip base64 image data before writing to localStorage — photos/sketches
      // are synced to Supabase and reloaded on every login, so the local cache
      // only needs metadata, not the full payloads.
      partialize: (state) => ({
        ...state,
        projects: state.projects.map((p) => ({
          ...p,
          items: p.items.map((item) => ({ ...item, photos: [] })),
          walks: (p.walks ?? []).map((w) => ({
            ...w,
            roomPhotos: (w.roomPhotos ?? []).map((ph) => ({ ...ph, data: '' })),
          })),
          sketches: (p.sketches ?? []).map((sk) => ({ ...sk, data: '' })),
          documents: (p.documents ?? []).map((d) => ({ ...d, pdfDataUrl: undefined, parsedItems: d.parsedItems })),
        })),
      }),
      // Recompute items from documents during hydration so that any changes to
      // diff logic (e.g. diffAndMergeChangeOrder) take effect immediately on
      // the very first render, without requiring the user to re-upload files.
      merge: (persistedState: unknown, currentState: StoreState): StoreState => {
        const persisted = persistedState as Partial<StoreState> | undefined
        if (!persisted) return currentState
        const projects = ((persisted.projects ?? []) as StoreState['projects']).map((p) => {
          if (!(p.documents ?? []).some(d => d.fileType === 'excel' && d.parsedItems?.length)) return p
          const { items, walkSourceItems, scopeTotal } = recomputeFromDocuments(p.documents ?? [], p.items)
          return { ...p, items, walkSourceItems, scopeTotal }
        })
        return { ...currentState, ...persisted, projects }
      },
    }
  )
)
