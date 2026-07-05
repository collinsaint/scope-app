import type { Project, ScopeItem, Walk, WalkGeneralNote } from '../types'

const JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function groupByRoom(items: ScopeItem[]): Record<string, ScopeItem[]> {
  return items.reduce<Record<string, ScopeItem[]>>((acc, item) => {
    ;(acc[item.room] = acc[item.room] ?? []).push(item)
    return acc
  }, {})
}

export function generateReport(project: Project): void {
  const completed = project.items.filter(i => i.completed)
  const totalRcv = project.items.reduce((s, i) => s + i.rcv, 0)
  const completedRcv = completed.reduce((s, i) => s + i.rcv, 0)
  const groups = groupByRoom(completed)

  const roomSections = Object.entries(groups).map(([room, items]) => {
    const rows = items.map(item => `
      <tr>
        <td>${item.rowNum}</td>
        <td>${item.description}</td>
        <td>${item.qty} ${item.unit}</td>
        <td>${item.activity}</td>
        <td>${fmt(item.rcv)}</td>
        <td>${item.note || '—'}</td>
        <td>${item.completedAt ? new Date(item.completedAt).toLocaleDateString() : '—'}</td>
      </tr>
      ${item.photos.length > 0 ? `<tr><td colspan="7" style="padding:8px 16px"><div style="display:flex;gap:8px;flex-wrap:wrap">${item.photos.map(p => `<img src="${p}" style="height:80px;border-radius:4px;object-fit:cover">`).join('')}</div></td></tr>` : ''}
    `).join('')
    return `
      <h3 style="margin:24px 0 8px;color:#1e293b">${room}</h3>
      <table>
        <thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Activity</th><th>Amount</th><th>Note</th><th>Completed</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ProScope Report — ${project.name}</title>
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
    <button onclick="window.print()" style="padding:8px 20px;background:#1d4ed8;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">Print / Save as PDF</button>
  </div>
  <h1>ProScope Completion Report</h1>
  <p>${project.name} &nbsp;·&nbsp; ${project.address} &nbsp;·&nbsp; Generated ${new Date().toLocaleDateString()}</p>
  <div class="cards">
    <div class="card"><div class="card-label">Total Amount</div><div class="card-value">${fmt(totalRcv)}</div></div>
    <div class="card"><div class="card-label">Completed Amount</div><div class="card-value" style="color:#16a34a">${fmt(completedRcv)}</div></div>
    <div class="card"><div class="card-label">Items complete</div><div class="card-value">${completed.length} / ${project.items.length}</div></div>
    <div class="card"><div class="card-label">% Complete</div><div class="card-value">${project.items.length ? Math.round(completed.length / project.items.length * 100) : 0}%</div></div>
  </div>
  ${roomSections}
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `proscope-report-${project.name.replace(/\s+/g, '-')}.html`
  a.click()
  URL.revokeObjectURL(url)
}

export function generateWalkReport(project: Project, walk: Walk, items: ScopeItem[]): void {
  const overrides = walk.itemOverrides ?? []
  const dataItems = items.filter(i => !i.isHeader && i.coverage?.toUpperCase() !== 'DRV')

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

      const qtyBase = i.qty > 0 ? `${i.qty} ${i.unit}` : '—'
      const qtyCell = hasQty
        ? `${qtyBase} <span class="qty-update">→ ${ov!.qty} ${i.unit}</span>`
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

    const photoGrid = photos.length > 0 ? `
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
      const photoGrid = crPhotos.length > 0 ? `<div class="photo-grid">${crPhotos.map((ph, i) => {
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
  const generalPhotosSection = generalPhotos.length > 0 ? `
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

  <div class="no-print" style="margin-bottom:24px;display:flex;gap:10px;align-items:center">
    <button onclick="window.print()" style="padding:8px 20px;background:#1d4ed8;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">Print / Save as PDF</button>
    ${allRoomPhotos.length > 0 ? `<button id="dl-photos-btn" onclick="downloadAllPhotos()" style="padding:8px 20px;background:#7c3aed;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">Download All Photos (${allRoomPhotos.length})</button>` : ''}
  </div>

  <div class="cards">
    <div class="card"><div class="card-label">Total Items</div><div class="card-value">${dataItems.length}</div></div>
    <div class="card"><div class="card-label">Removed</div><div class="card-value" style="color:#b91c1c">${removedCount}</div></div>
    <div class="card"><div class="card-label">Qty Updates</div><div class="card-value" style="color:#92400e">${qtyCount}</div></div>
    <div class="card"><div class="card-label">Inspection Notes</div><div class="card-value" style="color:#1d4ed8">${noteCount}</div></div>
    <div class="card"><div class="card-label">Group Notes</div><div class="card-value" style="color:#059669">${groupNoteCount}</div></div>
    <div class="card"><div class="card-label">General Notes</div><div class="card-value" style="color:#d97706">${generalNotes.length}</div></div>
    <div class="card"><div class="card-label">Photos</div><div class="card-value" style="color:#7c3aed">${allRoomPhotos.length}</div></div>
  </div>

  ${generalPhotosSection}${generalNotesSection}${fullScope}${customRoomSections}
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `walk-report-${walk.name.replace(/\s+/g, '-')}-${project.name.replace(/\s+/g, '-')}.html`
  a.click()
  URL.revokeObjectURL(url)
}
