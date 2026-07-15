import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Project, ScopeItem, Walk, WalkGeneralNote } from '../types'

const JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtQty(n: number): string {
  return parseFloat(n.toFixed(2)).toString()
}

function groupByRoom(items: ScopeItem[]): Record<string, ScopeItem[]> {
  return items.reduce<Record<string, ScopeItem[]>>((acc, item) => {
    ;(acc[item.room] = acc[item.room] ?? []).push(item)
    return acc
  }, {})
}

export function generateReport(
  project: Project,
  options: {
    visibleItems: ScopeItem[]
    subPercentage?: number
    spanishMode?: boolean
    translationCache?: Record<string, string>
    scopeTotal?: number
  } = { visibleItems: [] }
): void {
  const { subPercentage, spanishMode = false, translationCache = {}, scopeTotal } = options

  // Items the user can see: non-header, non-removed, non-DRV (pre-filtered by caller)
  const allItems = options.visibleItems.length > 0
    ? options.visibleItems
    : project.items.filter(i => !i.isHeader && i.changeTag !== 'removed' && i.coverage?.toUpperCase() !== 'DRV')

  function displayRcv(rcv: number) {
    return subPercentage != null ? rcv * subPercentage / 100 : rcv
  }

  function tr(key: string) {
    const translations: Record<string, string> = {
      reportTitle: spanishMode ? 'Reporte de Alcance' : 'Scope Report',
      printBtn:    spanishMode ? 'Imprimir / Guardar como PDF' : 'Print / Save as PDF',
      totalAmt:    spanishMode ? 'Monto Total' : 'Total Amount',
      completedAmt:spanishMode ? 'Monto Completado' : 'Completed Amount',
      itemsComplete:spanishMode ? 'Ítems completados' : 'Items complete',
      pctComplete: spanishMode ? '% Completado' : '% Complete',
      colNum:      spanishMode ? '#' : '#',
      colDesc:     spanishMode ? 'Descripción' : 'Description',
      colQty:      spanishMode ? 'Cant.' : 'Qty',
      colActivity: spanishMode ? 'Actividad' : 'Activity',
      colAmount:   spanishMode ? 'Monto' : 'Amount',
      colNote:     spanishMode ? 'Nota' : 'Note',
      colStatus:   spanishMode ? 'Estado' : 'Status',
      statusComplete: spanishMode ? '✓ Completado' : '✓ Complete',
      statusPending:  spanishMode ? '⏳ Pendiente' : '⏳ Pending',
      statusOpen:     spanishMode ? 'Abierto' : 'Open',
    }
    return translations[key] ?? key
  }

  function desc(text: string) {
    return spanishMode ? (translationCache[text] ?? text) : text
  }

  const completedItems = allItems.filter(i => i.completed)
  // Use scopeTotal (from raw CO parsedItems) when available — matches what SummaryCards shows
  const totalRcv = scopeTotal != null ? displayRcv(scopeTotal) : allItems.reduce((s, i) => s + displayRcv(i.rcv), 0)
  const completedRcv = completedItems.reduce((s, i) => s + displayRcv(i.rcv), 0)
  const pct = allItems.length ? Math.round(completedItems.length / allItems.length * 100) : 0

  const groups = groupByRoom(allItems)
  const roomSections = Object.entries(groups).map(([room, items]) => {
    const roomLabel = spanishMode
      ? (translationCache[room.replace(/_/g, ' ')] ?? room.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
      : room.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

    const rows = items.map(item => {
      const statusText = item.completed ? tr('statusComplete') : item.pendingApproval ? tr('statusPending') : tr('statusOpen')
      const statusColor = item.completed ? '#16a34a' : item.pendingApproval ? '#d97706' : '#64748b'
      return `
        <tr>
          <td>${item.rowNum}</td>
          <td>${desc(item.description)}</td>
          <td>${item.qty ? `${fmtQty(item.qty)} ${item.unit}` : '—'}</td>
          <td>${item.activity || '—'}</td>
          <td>${fmt(displayRcv(item.rcv))}</td>
          <td>${item.note ? desc(item.note) : '—'}</td>
          <td style="color:${statusColor};font-weight:500">${statusText}</td>
        </tr>
        ${item.photos.length > 0 ? `<tr><td colspan="7" style="padding:8px 16px"><div style="display:flex;gap:8px;flex-wrap:wrap">${item.photos.map(p => `<img src="${p}" style="height:80px;border-radius:4px;object-fit:cover">`).join('')}</div></td></tr>` : ''}
      `
    }).join('')

    return `
      <h3 style="margin:24px 0 8px;color:#1e293b">${roomLabel}</h3>
      <table>
        <thead><tr>
          <th>${tr('colNum')}</th><th>${tr('colDesc')}</th><th>${tr('colQty')}</th>
          <th>${tr('colActivity')}</th><th>${tr('colAmount')}</th><th>${tr('colNote')}</th><th>${tr('colStatus')}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="${spanishMode ? 'es' : 'en'}">
<head>
<meta charset="UTF-8">
<title>Verascope — ${project.name}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #0f172a; padding: 40px; max-width: 960px; margin: 0 auto }
  h1 { font-size: 22px; margin: 0 0 4px }
  p { margin: 0 0 24px; color: #64748b; font-size: 14px }
  .cards { display: flex; gap: 16px; margin-bottom: 32px }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; flex: 1 }
  .card-label { font-size: 12px; color: #94a3b8; margin-bottom: 4px }
  .card-value { font-size: 22px; font-weight: 600 }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px }
  th { text-align: left; padding: 8px 12px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b }
  td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top }
  @media print { .no-print { display: none } }
</style>
</head>
<body>
  <div class="no-print" style="margin-bottom:24px">
    <button onclick="window.print()" style="padding:8px 20px;background:#1d4ed8;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">${tr('printBtn')}</button>
  </div>
  <h1>${tr('reportTitle')}</h1>
  <p>${project.name} &nbsp;·&nbsp; ${project.address} &nbsp;·&nbsp; ${new Date().toLocaleDateString()}</p>
  <div class="cards">
    <div class="card"><div class="card-label">${tr('totalAmt')}</div><div class="card-value">${fmt(totalRcv)}</div></div>
    <div class="card"><div class="card-label">${tr('completedAmt')}</div><div class="card-value" style="color:#16a34a">${fmt(completedRcv)}</div></div>
    <div class="card"><div class="card-label">${tr('itemsComplete')}</div><div class="card-value">${completedItems.length} / ${allItems.length}</div></div>
    <div class="card"><div class="card-label">${tr('pctComplete')}</div><div class="card-value">${pct}%</div></div>
  </div>
  ${roomSections}
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `verascope-report-${project.name.replace(/\s+/g, '-')}.html`
  a.click()
  URL.revokeObjectURL(url)
}

function buildWalkReportHtml(
  project: Project,
  walk: Walk,
  items: ScopeItem[],
  options: { includePhotos?: boolean; adjustedOnly?: boolean } = {},
  pdfDataUri?: string,
): string {
  const { includePhotos = true, adjustedOnly = false } = options
  const overrides = walk.itemOverrides ?? []
  const allDataItems = items.filter(i => !i.isHeader && i.coverage?.toUpperCase() !== 'DRV')
  const dataItems = adjustedOnly
    ? allDataItems.filter(i => {
        const ov = overrides.find(o => o.itemId === i.id)
        return ov?.removed === true || ov?.qty !== undefined || (ov?.notes?.length ?? 0) > 0
      })
    : allDataItems

  function getOverride(itemId: string) {
    return overrides.find(o => o.itemId === itemId)
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
  }

  const removedCount = dataItems.filter(i => getOverride(i.id)?.removed === true).length
  const qtyCount     = dataItems.filter(i => getOverride(i.id)?.qty !== undefined).length
  const noteCount    = dataItems.filter(i => (getOverride(i.id)?.notes?.length ?? 0) > 0).length

  // --- Full scope grouped by room, notes inline ---
  const rooms: Record<string, ScopeItem[]> = {}
  for (const item of dataItems) {
    ;(rooms[item.room] = rooms[item.room] ?? []).push(item)
  }

  const fmtRoom = (r: string) => r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const COLS = 7

  const groupNotes = walk.groupNotes ?? []
  const groupNoteCount = groupNotes.length
  const allRoomPhotos = walk.roomPhotos ?? []
  const generalNotes: WalkGeneralNote[] = walk.generalNotes ?? []
  const customRooms = walk.customRooms ?? []

  const fullScope = Object.entries(rooms).map(([room, roomItems]) => {
    const roomGroupNotes = groupNotes.filter(n => n.room === room)
    const photos = allRoomPhotos.filter(p => p.room === room)
    const rows = roomItems.map(i => {
      const ov       = getOverride(i.id)
      const isRemoved = ov?.removed === true
      const hasQty    = ov?.qty !== undefined
      const hasNotes  = (ov?.notes?.length ?? 0) > 0
      const rowBg     = isRemoved ? 'background:#fef2f2' : (hasQty || hasNotes) ? 'background:#fefce8' : ''
      const badge     = isRemoved
        ? '<span class="badge-removed">Removed</span>'
        : (hasQty || hasNotes) ? '<span class="badge-modified">Modified</span>' : ''

      const qtyBase = i.qty > 0 ? `${fmtQty(i.qty)} ${i.unit}` : '—'
      const qtyCell = hasQty
        ? `${qtyBase} <span class="qty-update">→ ${fmtQty(ov!.qty as number)} ${i.unit}</span>`
        : qtyBase

      const mainRow = `<tr style="${rowBg}">
        <td>${i.rowNum}</td>
        <td>${isRemoved ? `<s>${i.description}</s>` : i.description}</td>
        <td>${i.activity || '—'}</td>
        <td>${qtyCell}</td>
        <td>${i.rcv > 0 ? fmt(i.rcv) : '—'}</td>
        <td>${i.note || '—'}</td>
        <td>${badge}</td>
      </tr>`

      const notesRow = hasNotes ? `<tr style="${rowBg}">
        <td></td>
        <td colspan="${COLS - 1}" style="padding:0 10px 10px 10px">
          <div class="notes-block">
            <div class="notes-label">Inspection Notes</div>
            ${(ov!.notes ?? []).map(n => `<div class="note-entry">
              <span class="note-text">${n.text}</span>
              <span class="note-date">${fmtDate(n.createdAt)}</span>
            </div>`).join('')}
          </div>
        </td>
      </tr>` : ''

      return mainRow + notesRow
    }).join('')

    const groupNoteRows = roomGroupNotes.map(gn => `<tr style="background:#f0fdf4">
      <td style="border-left:3px solid #6ee7b7;padding-left:12px">
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#059669">Group Note</span>
      </td>
      <td>
        <div style="padding:2px 0">
          <div style="font-size:13px;color:#1e293b">${gn.text}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">${fmtDate(gn.createdAt)}</div>
        </div>
      </td>
      <td>—</td>
      <td style="color:#059669;font-weight:600;font-size:13px">${gn.qty !== undefined ? gn.qty : '—'}</td>
      <td>—</td>
      <td>—</td>
      <td><span class="badge-added">Added</span></td>
    </tr>`).join('')

    const photoGrid = includePhotos && photos.length > 0 ? `
      <div class="photo-grid">
        ${photos.map((ph, i) => {
          const ext = ph.data.startsWith('data:image/png') ? 'png' : 'jpg'
          const ts = new Date(ph.createdAt).toISOString().replace(/[:.]/g, '-').slice(0, 19)
          const fileName = `photo_${String(i + 1).padStart(2, '0')}_${fmtRoom(ph.room).replace(/\s+/g, '-')}_${ts}.${ext}`
          return `<div class="photo-item"><a href="${ph.data}" target="_blank" title="Click to view full size" style="display:block"><img src="${ph.data}" alt="" style="cursor:zoom-in"></a><div class="photo-footer"><span class="photo-date">${fmtDate(ph.createdAt)}</span><a href="${ph.data}" download="${fileName}" class="photo-dl">↓ Download</a></div></div>`
        }).join('')}
      </div>` : ''

    return `<h3 class="room-heading">${fmtRoom(room)}</h3>
      <table>
        <thead><tr><th>#</th><th>Description</th><th>Activity</th><th>Qty / Unit</th><th>Amount</th><th>Note</th><th>Status</th></tr></thead>
        <tbody>${rows}${groupNoteRows}</tbody>
      </table>${photoGrid}`
  }).join('')

  // Custom rooms (no scope items — only group notes + photos)
  const customRoomSections = customRooms
    .filter(cr => !rooms[cr])
    .map(cr => {
      const crNotes = groupNotes.filter(n => n.room === cr)
      const crPhotos = allRoomPhotos.filter(p => p.room === cr)
      if (crNotes.length === 0 && crPhotos.length === 0) return ''
      const noteRows = crNotes.map(gn => `<tr style="background:#f0fdf4">
        <td style="border-left:3px solid #6ee7b7;padding-left:12px">
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#059669">Group Note</span>
        </td>
        <td><div style="padding:2px 0"><div style="font-size:13px;color:#1e293b">${gn.text}</div><div style="font-size:10px;color:#94a3b8;margin-top:2px">${fmtDate(gn.createdAt)}</div></div></td>
        <td>—</td>
        <td style="color:#059669;font-weight:600;font-size:13px">${gn.qty !== undefined ? gn.qty : '—'}</td>
        <td>—</td><td>—</td><td><span class="badge-added">Added</span></td>
      </tr>`).join('')
      const photoGrid = includePhotos && crPhotos.length > 0 ? `<div class="photo-grid">${crPhotos.map((ph, i) => {
        const ext = ph.data.startsWith('data:image/png') ? 'png' : 'jpg'
        const ts = new Date(ph.createdAt).toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const fileName = `photo_${String(i + 1).padStart(2, '0')}_${fmtRoom(ph.room).replace(/\s+/g, '-')}_${ts}.${ext}`
        return `<div class="photo-item"><img src="${ph.data}" alt=""><div class="photo-footer"><span class="photo-date">${fmtDate(ph.createdAt)}</span><a href="${ph.data}" download="${fileName}" class="photo-dl">↓ Download</a></div></div>`
      }).join('')}</div>` : ''
      return `<h3 class="room-heading">${fmtRoom(cr)}</h3>
        <table><thead><tr><th>#</th><th>Description</th><th>Activity</th><th>Qty / Unit</th><th>Amount</th><th>Note</th><th>Status</th></tr></thead>
        <tbody>${noteRows}</tbody></table>${photoGrid}`
    }).join('')

  // General notes section
  const generalPhotos = allRoomPhotos.filter(p => p.room === '_general_')
  const generalPhotosSection = includePhotos && generalPhotos.length > 0 ? `
    <h3 class="room-heading" style="margin-top:0">General Photos</h3>
    <div class="photo-grid">
      ${generalPhotos.map((ph, i) => {
        const ext = ph.data.startsWith('data:image/png') ? 'png' : 'jpg'
        const ts = new Date(ph.createdAt).toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const fileName = `photo_general_${String(i + 1).padStart(2, '0')}_${ts}.${ext}`
        return `<div class="photo-item"><a href="${ph.data}" target="_blank" title="Click to view full size" style="display:block"><img src="${ph.data}" alt="" style="cursor:zoom-in"></a><div class="photo-footer"><span class="photo-date">${fmtDate(ph.createdAt)}</span><a href="${ph.data}" download="${fileName}" class="photo-dl">↓ Download</a></div></div>`
      }).join('')}
    </div>` : ''

  const generalNotesSection = generalNotes.length > 0 ? `
    <h3 class="room-heading" style="margin-top:36px">General Notes</h3>
    <table>
      <thead><tr><th>Note</th><th>Qty</th><th>Date</th></tr></thead>
      <tbody>
        ${generalNotes.map(gn => `<tr style="background:#fffbeb">
          <td style="border-left:3px solid #fcd34d;padding-left:12px;font-size:13px;color:#1e293b">${gn.text}</td>
          <td style="color:#92400e;font-weight:600;font-size:13px">${gn.qty !== undefined ? gn.qty : '—'}</td>
          <td style="font-size:11px;color:#94a3b8">${fmtDate(gn.createdAt)}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : ''

  const generated = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Walk Report — ${walk.name}</title>
<style>
  body{font-family:system-ui,sans-serif;color:#0f172a;padding:40px;max-width:1020px;margin:0 auto}
  h1{font-size:22px;margin:0 0 4px}
  h3.room-heading{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#475569;margin:28px 0 0;padding-bottom:6px;border-bottom:1px solid #e2e8f0}
  .meta{color:#64748b;font-size:13px;margin:0 0 28px}
  .cards{display:flex;gap:14px;margin-bottom:32px}
  .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;flex:1;text-align:center}
  .card-label{font-size:11px;color:#94a3b8;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em}
  .card-value{font-size:24px;font-weight:700}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px}
  th{text-align:left;padding:7px 10px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
  td{padding:7px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top}
  .qty-update{color:#92400e;font-weight:600}
  .badge-removed{background:#fecaca;color:#b91c1c;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap}
  .badge-modified{background:#fde68a;color:#92400e;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap}
  .badge-added{background:#d1fae5;color:#065f46;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap}
  .notes-block{background:#eff6ff;border-left:3px solid #93c5fd;border-radius:0 4px 4px 0;padding:8px 10px;display:flex;flex-direction:column;gap:5px}
  .notes-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#3b82f6;margin-bottom:3px}
  .note-entry{display:flex;flex-direction:column;gap:1px}
  .note-text{font-size:12px;color:#1e3a5f}
  .note-date{font-size:10px;color:#93c5fd}
  .photo-grid{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;margin-bottom:20px}
  .photo-item{width:160px;border-radius:6px;overflow:hidden;border:1px solid #e2e8f0}
  .photo-item img{width:100%;height:120px;object-fit:cover;display:block}
  .photo-footer{display:flex;align-items:center;justify-content:space-between;padding:4px 6px;background:#f8fafc;gap:4px}
  .photo-date{font-size:9px;color:#64748b}
  .photo-dl{font-size:9px;color:#4f46e5;text-decoration:none;white-space:nowrap}
  .photo-dl:hover{text-decoration:underline}
  @media print{.no-print{display:none}}
</style>
</head>
<body>
  <script src="${JSZIP_CDN}"></script>
  <script>
    var WALK_PHOTOS = ${JSON.stringify(allRoomPhotos.map((p, i) => {
      const ext = p.data.startsWith('data:image/png') ? 'png' : 'jpg'
      const ts = new Date(p.createdAt).toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const room = p.room.replace(/[^a-z0-9]/gi, '_') || 'room'
      return { data: p.data, filename: `${room}/photo_${String(i + 1).padStart(2, '0')}_${ts}.${ext}` }
    }))};
    async function downloadAllPhotos() {
      if (!WALK_PHOTOS.length) return;
      var btn = document.getElementById('dl-photos-btn');
      btn.disabled = true; btn.textContent = 'Preparing zip…';
      try {
        var zip = new JSZip();
        WALK_PHOTOS.forEach(function(p) {
          var base64 = p.data.split(',')[1];
          zip.file(p.filename, base64, { base64: true });
        });
        var blob = await zip.generateAsync({ type: 'blob' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = '${(walk.name + '-' + project.name).replace(/\s+/g, '-')}-photos.zip';
        a.click(); URL.revokeObjectURL(url);
      } finally {
        btn.disabled = false; btn.textContent = 'Download All Photos (${allRoomPhotos.length})';
      }
    }
  </script>

  <h1>Walk Report &mdash; ${walk.name}</h1>
  <p class="meta">${project.name}${project.address ? ' &nbsp;&middot;&nbsp; ' + project.address : ''} &nbsp;&middot;&nbsp; Generated ${generated}</p>

  ${pdfDataUri ? `<script>
    var _PDF_URI = '${pdfDataUri}';
    var _PDF_NAME = 'walk-report-${walk.name.replace(/\s+/g, '-')}.pdf';
    function savePdf() { var a = document.createElement('a'); a.href = _PDF_URI; a.download = _PDF_NAME; a.click(); }
  </script>` : ''}

  <div class="no-print" style="margin-bottom:24px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    ${pdfDataUri
      ? `<button onclick="savePdf()" style="padding:8px 20px;background:#1d4ed8;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">&#128462; Save PDF</button>`
      : `<button onclick="window.print()" style="padding:8px 20px;background:#1d4ed8;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">Print / Save as PDF</button>`
    }
    ${includePhotos && allRoomPhotos.length > 0 ? `<button id="dl-photos-btn" onclick="downloadAllPhotos()" style="padding:8px 20px;background:#7c3aed;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">Download All Photos (${allRoomPhotos.length})</button>` : ''}
  </div>

  <div class="cards">
    <div class="card"><div class="card-label">${adjustedOnly ? 'Adjusted Items' : 'Total Items'}</div><div class="card-value">${dataItems.length}${adjustedOnly ? ` / ${allDataItems.length}` : ''}</div></div>
    <div class="card"><div class="card-label">Removed</div><div class="card-value" style="color:#b91c1c">${removedCount}</div></div>
    <div class="card"><div class="card-label">Qty Updates</div><div class="card-value" style="color:#92400e">${qtyCount}</div></div>
    <div class="card"><div class="card-label">Inspection Notes</div><div class="card-value" style="color:#1d4ed8">${noteCount}</div></div>
    <div class="card"><div class="card-label">Group Notes</div><div class="card-value" style="color:#059669">${groupNoteCount}</div></div>
    <div class="card"><div class="card-label">General Notes</div><div class="card-value" style="color:#d97706">${generalNotes.length}</div></div>
    ${includePhotos ? `<div class="card"><div class="card-label">Photos</div><div class="card-value" style="color:#7c3aed">${allRoomPhotos.length}</div></div>` : ''}
  </div>

  ${generalPhotosSection}${generalNotesSection}${fullScope}${customRoomSections}
</body>
</html>`
  return html
}

export function buildWalkReportBlob(
  project: Project,
  walk: Walk,
  items: ScopeItem[],
  options: { includePhotos?: boolean; adjustedOnly?: boolean } = {},
): Blob {
  return new Blob([buildWalkReportHtml(project, walk, items, options)], { type: 'text/html' })
}

export function openWalkReportPdf(
  project: Project,
  walk: Walk,
  items: ScopeItem[],
  options: { includePhotos?: boolean; adjustedOnly?: boolean } = {},
): void {
  const pdfDataUri = buildWalkReportPdfDoc(project, walk, items, { adjustedOnly: options.adjustedOnly }).output('datauristring') as string
  const html = buildWalkReportHtml(project, walk, items, options, pdfDataUri)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank')
  if (!w) window.location.href = url
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function generateWalkReport(
  project: Project,
  walk: Walk,
  items: ScopeItem[],
  options: { includePhotos?: boolean; adjustedOnly?: boolean } = {},
): void {
  const blob = buildWalkReportBlob(project, walk, items, options)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `walk-report-${walk.name.replace(/\s+/g, '-')}-${project.name.replace(/\s+/g, '-')}.html`
  a.click()
  URL.revokeObjectURL(url)
}

function buildWalkReportPdfDoc(
  project: Project,
  walk: Walk,
  items: ScopeItem[],
  options: { adjustedOnly?: boolean } = {},
): InstanceType<typeof jsPDF> {
  const { adjustedOnly = false } = options
  const overrides = walk.itemOverrides ?? []

  function getOverride(itemId: string) {
    return overrides.find(o => o.itemId === itemId)
  }

  const allDataItems = items.filter(i => !i.isHeader && i.coverage?.toUpperCase() !== 'DRV')
  const dataItems = adjustedOnly
    ? allDataItems.filter(i => {
        const ov = getOverride(i.id)
        return ov?.removed === true || ov?.qty !== undefined || (ov?.notes?.length ?? 0) > 0
      })
    : allDataItems

  const removedCount  = dataItems.filter(i => getOverride(i.id)?.removed === true).length
  const qtyCount      = dataItems.filter(i => getOverride(i.id)?.qty !== undefined).length
  const noteCount     = dataItems.filter(i => (getOverride(i.id)?.notes?.length ?? 0) > 0).length
  const groupNotes    = walk.groupNotes ?? []
  const generalNotes  = walk.generalNotes ?? []
  const fmtRoom       = (r: string) => r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
  }

  const rooms: Record<string, ScopeItem[]> = {}
  for (const item of dataItems) {
    ;(rooms[item.room] = rooms[item.room] ?? []).push(item)
  }

  // Landscape A4: 297 × 210mm, 12mm side margins → 273mm content width
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' })
  const ML = 12 // margin left/right
  const pageW = 297

  // Title
  doc.setFontSize(14)
  doc.setTextColor(15, 23, 42)
  doc.text(`Walk Report — ${walk.name}`, ML, 14)

  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  const meta = `${project.name}${project.address ? '  ·  ' + project.address : ''}  ·  Generated ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}`
  doc.text(meta, ML, 20)

  // Summary row
  doc.setFontSize(8)
  doc.setTextColor(15, 23, 42)
  const summaryText = [
    `${adjustedOnly ? 'Adjusted' : 'Total'} Items: ${dataItems.length}${adjustedOnly ? ' / ' + allDataItems.length : ''}`,
    `Removed: ${removedCount}`,
    `Qty Updates: ${qtyCount}`,
    `Notes: ${noteCount}`,
    `Group Notes: ${groupNotes.length}`,
    `General Notes: ${generalNotes.length}`,
  ].join('   |   ')
  doc.text(summaryText, ML, 27)

  let currentY = 32

  // Per-room tables
  for (const [room, roomItems] of Object.entries(rooms)) {
    const roomGroupNotes = groupNotes.filter(n => n.room === room)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any[][] = []

    for (const item of roomItems) {
      const ov = getOverride(item.id)
      const isRemoved = ov?.removed === true
      const hasQty    = ov?.qty !== undefined
      const hasNotes  = (ov?.notes?.length ?? 0) > 0

      const descLines: string[] = [isRemoved ? `[REMOVED] ${item.description}` : item.description]
      if (hasNotes) {
        for (const n of ov!.notes ?? []) {
          descLines.push(`  Note: ${n.text}`)
        }
      }

      const qty = hasQty ? `${fmtQty(item.qty)} → ${fmtQty(ov!.qty as number)} ${item.unit}` : item.qty > 0 ? `${fmtQty(item.qty)} ${item.unit}` : '—'
      const status = isRemoved ? 'Removed' : (hasQty || hasNotes) ? 'Modified' : ''

      const fillColor: [number, number, number] | undefined = isRemoved
        ? [254, 226, 226]
        : hasQty || hasNotes
        ? [254, 252, 232]
        : undefined

      const row = [
        String(item.rowNum),
        descLines.join('\n'),
        item.activity || '—',
        qty,
        item.rcv > 0 ? `$${item.rcv.toLocaleString()}` : '—',
        item.note || '—',
        status,
      ]

      if (fillColor) {
        body.push(row.map(cell => ({ content: cell, styles: { fillColor } })))
      } else {
        body.push(row)
      }
    }

    // Group note rows
    for (const gn of roomGroupNotes) {
      body.push([
        { content: 'GROUP NOTE', styles: { fillColor: [209, 250, 229], textColor: [6, 95, 70], fontStyle: 'bold' as const } },
        { content: gn.text + '\n' + fmtDate(gn.createdAt), styles: { fillColor: [209, 250, 229] } },
        { content: '—', styles: { fillColor: [209, 250, 229] } },
        { content: gn.qty !== undefined ? String(gn.qty) : '—', styles: { fillColor: [209, 250, 229], textColor: [5, 150, 105] } },
        { content: '—', styles: { fillColor: [209, 250, 229] } },
        { content: '—', styles: { fillColor: [209, 250, 229] } },
        { content: 'Added', styles: { fillColor: [209, 250, 229], textColor: [6, 95, 70] } },
      ])
    }

    autoTable(doc, {
      startY: currentY,
      head: [[fmtRoom(room), 'Description', 'Activity', 'Qty / Unit', 'Amount', 'Note', 'Status']],
      body,
      theme: 'grid',
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 7, fontStyle: 'bold' as const },
      bodyStyles: { fontSize: 7, valign: 'top' },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 110 },
        2: { cellWidth: 22 },
        3: { cellWidth: 38 },
        4: { cellWidth: 28 },
        5: { cellWidth: 42 },
        6: { cellWidth: 24 },
      },
      margin: { left: ML, right: ML },
    })

    currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  }

  // Custom rooms (group notes + no items)
  for (const cr of walk.customRooms ?? []) {
    if (rooms[cr]) continue
    const crNotes = groupNotes.filter(n => n.room === cr)
    if (!crNotes.length) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any[][] = crNotes.map(gn => [
      { content: 'GROUP NOTE', styles: { fillColor: [209, 250, 229], textColor: [6, 95, 70], fontStyle: 'bold' as const } },
      { content: gn.text + '\n' + fmtDate(gn.createdAt), styles: { fillColor: [209, 250, 229] } },
      { content: '—', styles: { fillColor: [209, 250, 229] } },
      { content: gn.qty !== undefined ? String(gn.qty) : '—', styles: { fillColor: [209, 250, 229] } },
      { content: '—', styles: { fillColor: [209, 250, 229] } },
      { content: '—', styles: { fillColor: [209, 250, 229] } },
      { content: 'Added', styles: { fillColor: [209, 250, 229], textColor: [6, 95, 70] } },
    ])

    autoTable(doc, {
      startY: currentY,
      head: [[fmtRoom(cr), 'Description', 'Activity', 'Qty / Unit', 'Amount', 'Note', 'Status']],
      body,
      theme: 'grid',
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 7, fontStyle: 'bold' as const },
      bodyStyles: { fontSize: 7 },
      columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 110 }, 2: { cellWidth: 22 }, 3: { cellWidth: 38 }, 4: { cellWidth: 28 }, 5: { cellWidth: 42 }, 6: { cellWidth: 24 } },
      margin: { left: ML, right: ML },
    })
    currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  }

  // General notes
  if (generalNotes.length > 0) {
    autoTable(doc, {
      startY: currentY,
      head: [['General Notes', 'Qty', 'Date']],
      body: generalNotes.map(gn => [gn.text, gn.qty !== undefined ? String(gn.qty) : '—', fmtDate(gn.createdAt)]),
      theme: 'grid',
      headStyles: { fillColor: [180, 83, 9], textColor: 255, fontSize: 7, fontStyle: 'bold' as const },
      bodyStyles: { fontSize: 7, fillColor: [255, 251, 235] },
      columnStyles: { 0: { cellWidth: 180 }, 1: { cellWidth: 30 }, 2: { cellWidth: 60 } },
      margin: { left: ML, right: ML },
    })
  }

  // Page numbers
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFontSize(7)
    doc.setTextColor(148, 163, 184)
    doc.text(`Page ${p} of ${pageCount}`, pageW - ML, 207, { align: 'right' })
  }

  return doc
}

export function buildWalkReportPdfBlob(
  project: Project,
  walk: Walk,
  items: ScopeItem[],
  options: { adjustedOnly?: boolean } = {},
): Blob {
  return buildWalkReportPdfDoc(project, walk, items, options).output('blob')
}
