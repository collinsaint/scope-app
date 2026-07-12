import { parseExcelFile } from './parseExcel'
import { useStore } from '../store/useStore'
import type { Project, ProjectSketch, Walk } from '../types'

const DEMO_ID = 'demo-fl-12345'

function waitForHydration(): Promise<void> {
  return new Promise<void>((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (useStore as any).persist
    if (!p || p.hasHydrated()) {
      resolve()
    } else {
      const unsub = p.onFinishHydration(() => { unsub(); resolve() })
    }
  })
}

async function fetchDemoSketch(): Promise<ProjectSketch> {
  const res = await fetch('/demo/demo_project_sketch.jpg')
  if (!res.ok) throw new Error('Failed to fetch demo sketch')
  const buffer = await res.arrayBuffer()
  const base64 = btoa(new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ''))
  return {
    label: 'Main Level',
    data: `data:image/jpeg;base64,${base64}`,
    fileName: 'demo_project_sketch.jpg',
  }
}

const DEFAULT_WALK: Walk = {
  id: 'demo-walk-1',
  name: 'Initial Site Visit',
  createdAt: '2026-07-04T00:00:00.000Z',
  itemOverrides: [],
  groupNotes: [],
  roomPhotos: [],
  customRooms: [],
  generalNotes: [],
}

export async function seedDemoProject(): Promise<void> {
  await waitForHydration()

  // Deduplicate any duplicate demo projects left by a previous race condition
  const current = useStore.getState().projects
  const seen = new Set<string>()
  const deduped = current.filter(p => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
  if (deduped.length !== current.length) {
    useStore.setState({ projects: deduped })
  }

  const existingDemo = useStore.getState().projects.find(p => p.id === DEMO_ID)
  if (existingDemo) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patches: any = {}

    // Patch missing walk
    if (!existingDemo.walks?.length) {
      patches.walks = [DEFAULT_WALK]
    }

    // Patch missing or old PDF sketch → JPG
    if (!existingDemo.sketches?.length || existingDemo.sketches.some(s => s.fileName === 'demo_project_sketch.pdf')) {
      try {
        patches.sketches = [await fetchDemoSketch()]
      } catch { /* keep existing */ }
    }

    if (Object.keys(patches).length > 0) {
      useStore.setState({
        projects: useStore.getState().projects.map(p =>
          p.id === DEMO_ID ? { ...p, ...patches } : p
        ),
      })
    }
    return
  }

  const [xlsxRes] = await Promise.all([
    fetch('/demo/demo_project_scope.xlsx'),
  ])

  if (!xlsxRes.ok) return

  const xlsxBuffer = await xlsxRes.arrayBuffer()
  const { items } = parseExcelFile(xlsxBuffer)

  let sketch: ProjectSketch
  try {
    sketch = await fetchDemoSketch()
  } catch {
    return
  }

  const demo: Project = {
    id: DEMO_ID,
    name: '123 Demo St',
    address: '123 Demo St, Fort Myers, FL 33907',
    createdAt: '2026-07-04T00:00:00.000Z',
    fileName: 'demo_project_scope.xlsx',
    projectCode: 'FL-12345',
    projectStatus: 'Site Visit',
    jobGroup: 'FL - South',
    applicantName: 'Jane Doe',
    applicantPhone: '(239)123-4567',
    applicantEmail: 'jane.doe@gmail.com',
    isDemo: true,
    items,
    sketches: [sketch],
    walks: [DEFAULT_WALK],
    subcontractors: [],
  }

  useStore.getState().addProject(demo)
}

export async function resetDemoProject(): Promise<void> {
  const [xlsxRes] = await Promise.all([
    fetch('/demo/demo_project_scope.xlsx'),
  ])

  if (!xlsxRes.ok) return

  const xlsxBuffer = await xlsxRes.arrayBuffer()
  const { items } = parseExcelFile(xlsxBuffer)

  let sketch: ProjectSketch
  try {
    sketch = await fetchDemoSketch()
  } catch {
    return
  }

  const freshDemo: Project = {
    id: DEMO_ID,
    name: '123 Demo St',
    address: '123 Demo St, Fort Myers, FL 33907',
    createdAt: '2026-07-04T00:00:00.000Z',
    fileName: 'demo_project_scope.xlsx',
    projectCode: 'FL-12345',
    projectStatus: 'Site Visit',
    jobGroup: 'FL - South',
    applicantName: 'Jane Doe',
    applicantPhone: '(239)123-4567',
    applicantEmail: 'jane.doe@gmail.com',
    isDemo: true,
    items,
    sketches: [sketch],
    walks: [{ ...DEFAULT_WALK }],
    subcontractors: [],
  }

  useStore.getState().replaceProject(freshDemo)
}
