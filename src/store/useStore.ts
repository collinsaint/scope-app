import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project, ScopeItem, Subcontractor, GlobalSubcontractor, JobGroup, Superintendent, ProjectSketch, SketchLabel, Walk, WalkItemOverride, WalkGroupNote, WalkRoomPhoto, WalkGeneralNote, OneDriveSettings } from '../types'

interface StoreState {
  projects: Project[]
  activeProjectId: string | null
  globalSubcontractors: GlobalSubcontractor[]
  jobGroups: JobGroup[]
  superintendents: Superintendent[]
  oneDrive: OneDriveSettings
  viewMode: 'auto' | 'desktop' | 'mobile'
  walkPresets: string[]

  setOneDrive: (settings: Partial<OneDriveSettings>) => void
  setViewMode: (mode: 'auto' | 'desktop' | 'mobile') => void
  setWalkPreset: (index: number, text: string) => void

  replaceProjects: (projects: Project[]) => void
  addProject: (project: Project) => void
  replaceProject: (project: Project) => void
  updateProjectItems: (projectId: string, items: ScopeItem[]) => void
  setActiveProject: (id: string | null) => void
  toggleItem: (projectId: string, itemId: string) => void
  addPhoto: (projectId: string, itemId: string, photo: string) => void
  removePhoto: (projectId: string, itemId: string, index: number) => void
  deleteProject: (projectId: string) => void
  addSubcontractor: (projectId: string, sub: Subcontractor) => void
  deleteSubcontractor: (projectId: string, subId: string) => void
  assignSubcontractor: (projectId: string, itemIds: string[], subId: string | null) => void
  bulkComplete: (projectId: string, itemIds: string[]) => void
  bulkUncomplete: (projectId: string, itemIds: string[]) => void
  setComment: (projectId: string, itemId: string, comment: string) => void
  updateProjectDetails: (projectId: string, details: { name: string; address: string; projectCode?: string; superintendent?: string; projectStatus?: string; jobGroup?: string; applicantName?: string; applicantPhone?: string; applicantEmail?: string }) => void
  addGlobalSubcontractor: (sub: GlobalSubcontractor) => void
  updateGlobalSubcontractor: (id: string, updates: Partial<GlobalSubcontractor>) => void
  deleteGlobalSubcontractor: (id: string) => void
  addJobGroup: (group: JobGroup) => void
  updateJobGroup: (id: string, name: string) => void
  deleteJobGroup: (id: string) => void
  addSuperintendent: (super_: Superintendent) => void
  updateSuperintendent: (id: string, name: string) => void
  deleteSuperintendent: (id: string) => void
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
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      projects: [],
      activeProjectId: null,
      globalSubcontractors: [],
      jobGroups: [],
      superintendents: [],
      oneDrive: {
        connected: false,
        accountName: null,
        accountEmail: null,
        rootFolderName: 'Verascope',
      },
      viewMode: 'auto',
      walkPresets: ['', '', '', '', '', ''],

      setOneDrive: (settings) =>
        set((s) => ({ oneDrive: { ...s.oneDrive, ...settings } })),

      setViewMode: (mode) => set({ viewMode: mode }),

      setWalkPreset: (index, text) =>
        set((s) => {
          const presets = [...s.walkPresets]
          presets[index] = text.slice(0, 20)
          return { walkPresets: presets }
        }),

      replaceProjects: (projects) => set({ projects }),

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
    }),
    {
      name: 'proscope-storage',
    }
  )
)
