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

  // Patch existing demo project that is missing a walk (from before the default walk was added)
  const existingDemo = useStore.getState().projects.find(p => p.id === DEMO_ID)
  if (existingDemo) {
    if (!existingDemo.walks?.length) {
      const patchedWalk: Walk = {
        id: 'demo-walk-1',
        name: 'Initial Site Visit',
        createdAt: '2026-07-04T00:00:00.000Z',
        itemOverrides: [],
        groupNotes: [],
        roomPhotos: [],
        customRooms: [],
        generalNotes: [],
      }
      useStore.setState({
        projects: useStore.getState().projects.map(p =>
          p.id === DEMO_ID ? { ...p, walks: [patchedWalk] } : p
        ),
      })
    }
    return
  }

  const [xlsxRes, pdfRes] = await Promise.all([
    fetch('/demo/demo_project_scope.xlsx'),
    fetch('/demo/demo_project_sketch.pdf'),
  ])

  if (!xlsxRes.ok || !pdfRes.ok) return

  const xlsxBuffer = await xlsxRes.arrayBuffer()
  const items = parseExcelFile(xlsxBuffer)

  const pdfBuffer = await pdfRes.arrayBuffer()
  const pdfBase64 = btoa(
    new Uint8Array(pdfBuffer).reduce((s, b) => s + String.fromCharCode(b), '')
  )
  const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`

  const sketch: ProjectSketch = {
    label: 'Main Level',
    data: pdfDataUrl,
    fileName: 'demo_project_sketch.pdf',
  }

  const defaultWalk: Walk = {
    id: 'demo-walk-1',
    name: 'Initial Site Visit',
    createdAt: '2026-07-04T00:00:00.000Z',
    itemOverrides: [],
    groupNotes: [],
    roomPhotos: [],
    customRooms: [],
    generalNotes: [],
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
    walks: [defaultWalk],
    subcontractors: [],
  }

  useStore.getState().addProject(demo)
}
