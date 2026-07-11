import { useState } from 'react'
import { useStore } from '../store/useStore'
import type { GlobalSubcontractor, JobGroup, Superintendent } from '../types'
import { OneDriveSettings } from './OneDriveSettings'

const PRESET_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#84cc16']

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function ContractorSettingsView() {
  const { globalSubcontractors, addGlobalSubcontractor, updateGlobalSubcontractor, deleteGlobalSubcontractor, jobGroups, addJobGroup, updateJobGroup, deleteJobGroup, superintendents, addSuperintendent, updateSuperintendent, deleteSuperintendent } = useStore()

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [newPct, setNewPct] = useState('')
  const [addError, setAddError] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(PRESET_COLORS[0])
  const [editPct, setEditPct] = useState('')
  const [editError, setEditError] = useState('')

  const [newGroupName, setNewGroupName] = useState('')
  const [groupAddError, setGroupAddError] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editGroupName, setEditGroupName] = useState('')
  const [groupEditError, setGroupEditError] = useState('')

  const [newSuperName, setNewSuperName] = useState('')
  const [superAddError, setSuperAddError] = useState('')
  const [editingSuperId, setEditingSuperId] = useState<string | null>(null)
  const [editSuperName, setEditSuperName] = useState('')
  const [superEditError, setSuperEditError] = useState('')

  function handleAdd() {
    const name = newName.trim()
    if (!name) { setAddError('Name is required.'); return }
    if (globalSubcontractors.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      setAddError('A subcontractor with that name already exists.')
      return
    }
    const pct = parseFloat(newPct)
    if (isNaN(pct) || pct < 0 || pct > 100) { setAddError('Enter a percentage between 0 and 100.'); return }
    addGlobalSubcontractor({ id: generateId(), name, color: newColor, defaultPercentage: pct })
    setNewName('')
    setNewPct('')
    setNewColor(PRESET_COLORS[0])
    setAddError('')
  }

  function startEdit(sub: GlobalSubcontractor) {
    setEditingId(sub.id)
    setEditName(sub.name)
    setEditColor(sub.color)
    setEditPct(String(sub.defaultPercentage))
    setEditError('')
  }

  function saveEdit(id: string) {
    const name = editName.trim()
    if (!name) { setEditError('Name is required.'); return }
    if (globalSubcontractors.some(s => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) {
      setEditError('Another subcontractor with that name already exists.')
      return
    }
    const pct = parseFloat(editPct)
    if (isNaN(pct) || pct < 0 || pct > 100) { setEditError('Enter a percentage between 0 and 100.'); return }
    updateGlobalSubcontractor(id, { name, color: editColor, defaultPercentage: pct })
    setEditingId(null)
  }

  function handleAddGroup() {
    const name = newGroupName.trim()
    if (!name) { setGroupAddError('Name is required.'); return }
    if (jobGroups.some(g => g.name.toLowerCase() === name.toLowerCase())) {
      setGroupAddError('A job group with that name already exists.')
      return
    }
    addJobGroup({ id: generateId(), name })
    setNewGroupName('')
    setGroupAddError('')
  }

  function startEditGroup(g: JobGroup) {
    setEditingGroupId(g.id)
    setEditGroupName(g.name)
    setGroupEditError('')
  }

  function saveEditGroup(id: string) {
    const name = editGroupName.trim()
    if (!name) { setGroupEditError('Name is required.'); return }
    if (jobGroups.some(g => g.id !== id && g.name.toLowerCase() === name.toLowerCase())) {
      setGroupEditError('Another job group with that name already exists.')
      return
    }
    updateJobGroup(id, name)
    setEditingGroupId(null)
  }

  function handleAddSuper() {
    const name = newSuperName.trim()
    if (!name) { setSuperAddError('Name is required.'); return }
    if (superintendents.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      setSuperAddError('A superintendent with that name already exists.')
      return
    }
    addSuperintendent({ id: generateId(), name })
    setNewSuperName('')
    setSuperAddError('')
  }

  function startEditSuper(su: Superintendent) {
    setEditingSuperId(su.id)
    setEditSuperName(su.name)
    setSuperEditError('')
  }

  function saveEditSuper(id: string) {
    const name = editSuperName.trim()
    if (!name) { setSuperEditError('Name is required.'); return }
    if (superintendents.some(s => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) {
      setSuperEditError('Another superintendent with that name already exists.')
      return
    }
    updateSuperintendent(id, name)
    setEditingSuperId(null)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contractor Settings</h1>
          <p className="page-subtitle">Manage global subcontractors and their default payout percentages.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-2xl flex flex-col gap-5">

          {/* Subcontractors */}
          <div className="section-card">
            <div className="section-card-header">
              <h2 className="text-sm font-semibold text-slate-800">Subcontractors</h2>
              <p className="text-xs text-slate-400 mt-0.5">Set the default percentage of a line item's amount each subcontractor receives.</p>
            </div>

            {globalSubcontractors.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {globalSubcontractors.map(sub => (
                  <div key={sub.id}>
                    {editingId === sub.id ? (
                      <div className="px-5 py-4 bg-[#F9F8FF] space-y-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={e => { setEditName(e.target.value); setEditError('') }}
                            placeholder="Name"
                            className="input-base flex-1"
                            autoFocus
                          />
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={editPct}
                              onChange={e => { setEditPct(e.target.value); setEditError('') }}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(sub.id); if (e.key === 'Escape') setEditingId(null) }}
                              className="input-base w-24 pr-7 pl-3"
                            />
                            <span className="absolute right-2.5 text-xs text-slate-400 pointer-events-none">%</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1.5 flex-wrap">
                            {PRESET_COLORS.map(c => (
                              <button
                                key={c}
                                onClick={() => setEditColor(c)}
                                className="w-5 h-5 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                                style={{ backgroundColor: c, outline: editColor === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }}
                              />
                            ))}
                          </div>
                          <div className="ml-auto flex gap-2">
                            <button onClick={() => setEditingId(null)} className="btn-ghost btn-sm border border-slate-200">Cancel</button>
                            <button onClick={() => saveEdit(sub.id)} className="btn-primary btn-sm">Save changes</button>
                          </div>
                        </div>
                        {editError && <p className="text-xs text-red-500">{editError}</p>}
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: sub.color }} />
                        <span className="flex-1 text-sm font-medium text-slate-800">{sub.name}</span>
                        <span className="text-sm text-slate-500 font-medium w-16 text-right">{sub.defaultPercentage}%</span>
                        <button onClick={() => startEdit(sub)} className="text-xs text-blue-500 hover:text-blue-700 transition-colors font-medium">Edit</button>
                        <button
                          onClick={() => { if (confirm(`Delete "${sub.name}"?`)) deleteGlobalSubcontractor(sub.id) }}
                          className="text-slate-300 hover:text-red-400 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-slate-400">No subcontractors added yet.</p>
              </div>
            )}

            <div className="px-5 py-4 border-t border-slate-100 bg-[#F9F8FF] rounded-b-[14px] space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Add subcontractor</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Name"
                  value={newName}
                  onChange={e => { setNewName(e.target.value); setAddError('') }}
                  className="input-base flex-1"
                />
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="0"
                    value={newPct}
                    onChange={e => { setNewPct(e.target.value); setAddError('') }}
                    className="input-base w-24 pr-7 pl-3"
                  />
                  <span className="absolute right-2.5 text-xs text-slate-400 pointer-events-none">%</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className="w-5 h-5 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                      style={{ backgroundColor: c, outline: newColor === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }}
                    />
                  ))}
                </div>
                <button onClick={handleAdd} className="btn-primary btn-sm ml-auto whitespace-nowrap">
                  Add subcontractor
                </button>
              </div>
              {addError && <p className="text-xs text-red-500">{addError}</p>}
            </div>
          </div>

          {/* Job Groups */}
          <div className="section-card">
            <div className="section-card-header">
              <h2 className="text-sm font-semibold text-slate-800">Job Groups</h2>
              <p className="text-xs text-slate-400 mt-0.5">Create job groups that can be assigned to projects.</p>
            </div>

            {jobGroups.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {jobGroups.map(g => (
                  <div key={g.id}>
                    {editingGroupId === g.id ? (
                      <div className="px-5 py-3.5 flex items-center gap-2 bg-[#F9F8FF]">
                        <input
                          type="text"
                          value={editGroupName}
                          onChange={e => { setEditGroupName(e.target.value); setGroupEditError('') }}
                          onKeyDown={e => { if (e.key === 'Enter') saveEditGroup(g.id); if (e.key === 'Escape') setEditingGroupId(null) }}
                          className="input-base flex-1"
                          autoFocus
                        />
                        {groupEditError && <p className="text-xs text-red-500">{groupEditError}</p>}
                        <button onClick={() => setEditingGroupId(null)} className="btn-ghost btn-sm border border-slate-200">Cancel</button>
                        <button onClick={() => saveEditGroup(g.id)} className="btn-primary btn-sm">Save</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className="flex-1 text-sm font-medium text-slate-800">{g.name}</span>
                        <button onClick={() => startEditGroup(g)} className="text-xs text-blue-500 hover:text-blue-700 transition-colors font-medium">Edit</button>
                        <button
                          onClick={() => { if (confirm(`Delete "${g.name}"?`)) deleteJobGroup(g.id) }}
                          className="text-slate-300 hover:text-red-400 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-slate-400">No job groups added yet.</p>
              </div>
            )}

            <div className="px-5 py-4 border-t border-slate-100 bg-[#F9F8FF] rounded-b-[14px]">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Add job group</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Job group name"
                  value={newGroupName}
                  onChange={e => { setNewGroupName(e.target.value); setGroupAddError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddGroup() }}
                  className="input-base flex-1"
                />
                <button onClick={handleAddGroup} className="btn-primary btn-sm whitespace-nowrap">
                  Add job group
                </button>
              </div>
              {groupAddError && <p className="text-xs text-red-500 mt-2">{groupAddError}</p>}
            </div>
          </div>

          {/* Superintendents */}
          <div className="section-card">
            <div className="section-card-header">
              <h2 className="text-sm font-semibold text-slate-800">Superintendents</h2>
              <p className="text-xs text-slate-400 mt-0.5">Create superintendents that can be assigned to projects.</p>
            </div>

            {superintendents.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {superintendents.map(su => (
                  <div key={su.id}>
                    {editingSuperId === su.id ? (
                      <div className="px-5 py-3.5 flex items-center gap-2 bg-[#F9F8FF]">
                        <input
                          type="text"
                          value={editSuperName}
                          onChange={e => { setEditSuperName(e.target.value); setSuperEditError('') }}
                          onKeyDown={e => { if (e.key === 'Enter') saveEditSuper(su.id); if (e.key === 'Escape') setEditingSuperId(null) }}
                          className="input-base flex-1"
                          autoFocus
                        />
                        {superEditError && <p className="text-xs text-red-500">{superEditError}</p>}
                        <button onClick={() => setEditingSuperId(null)} className="btn-ghost btn-sm border border-slate-200">Cancel</button>
                        <button onClick={() => saveEditSuper(su.id)} className="btn-primary btn-sm">Save</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className="flex-1 text-sm font-medium text-slate-800">{su.name}</span>
                        <button onClick={() => startEditSuper(su)} className="text-xs text-blue-500 hover:text-blue-700 transition-colors font-medium">Edit</button>
                        <button
                          onClick={() => { if (confirm(`Delete "${su.name}"?`)) deleteSuperintendent(su.id) }}
                          className="text-slate-300 hover:text-red-400 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-slate-400">No superintendents added yet.</p>
              </div>
            )}

            <div className="px-5 py-4 border-t border-slate-100 bg-[#F9F8FF] rounded-b-[14px]">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Add superintendent</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Superintendent name"
                  value={newSuperName}
                  onChange={e => { setNewSuperName(e.target.value); setSuperAddError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddSuper() }}
                  className="input-base flex-1"
                />
                <button onClick={handleAddSuper} className="btn-primary btn-sm whitespace-nowrap">
                  Add superintendent
                </button>
              </div>
              {superAddError && <p className="text-xs text-red-500 mt-2">{superAddError}</p>}
            </div>
          </div>

          <div>
            <OneDriveSettings />
          </div>

        </div>
      </div>
    </div>
  )
}
