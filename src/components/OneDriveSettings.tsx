import { useState } from 'react'
import { useStore } from '../store/useStore'
import { isOneDriveConfigured } from '../lib/msalConfig'
import { signInToOneDrive, signOutOfOneDrive, getConnectedAccount } from '../lib/oneDrive'

export function OneDriveSettings() {
  const { oneDrive, setOneDrive } = useStore()
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [folderDraft, setFolderDraft] = useState(oneDrive.rootFolderName)
  const [folderSaved, setFolderSaved] = useState(false)

  async function handleConnect() {
    setError('')
    setConnecting(true)
    try {
      const account = await signInToOneDrive()
      setOneDrive({
        connected: true,
        accountName: account.name ?? account.username,
        accountEmail: account.username,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('user_cancelled') && !msg.includes('popup_window_error')) {
        setError('Sign-in failed. Please try again.')
      }
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    setError('')
    try {
      await signOutOfOneDrive()
    } catch { /* ignore */ }
    setOneDrive({ connected: false, accountName: null, accountEmail: null })
  }

  function handleSaveFolder() {
    const name = folderDraft.trim().replace(/[\\/:*?"<>|]/g, '-') || 'ProScope'
    setOneDrive({ rootFolderName: name })
    setFolderDraft(name)
    setFolderSaved(true)
    setTimeout(() => setFolderSaved(false), 2000)
  }

  // Re-sync connected state with MSAL on mount (token may persist in sessionStorage)
  const liveAccount = getConnectedAccount()
  const isConnected = oneDrive.connected && !!liveAccount

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
        {/* OneDrive cloud icon */}
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0078D4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">OneDrive Integration</h3>
          <p className="text-xs text-slate-400 mt-0.5">Automatically sync project photos to your OneDrive</p>
        </div>
        {isConnected && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"/>
            Connected
          </span>
        )}
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Not configured warning */}
        {!isOneDriveConfigured && (
          <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div className="text-xs text-amber-800 space-y-1">
              <p className="font-semibold">Azure App Registration required</p>
              <p>To enable OneDrive sync, you need to register ProScope in the Azure Portal and provide a Client ID. See the setup steps below.</p>
            </div>
          </div>
        )}

        {/* Setup steps (shown when not configured) */}
        {!isOneDriveConfigured && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Setup steps</p>
            <ol className="space-y-2 text-xs text-slate-600">
              {[
                <>Go to <span className="font-mono bg-slate-100 px-1 py-0.5 rounded">portal.azure.com</span> and sign in with any Microsoft account</>,
                <>Search <strong>App registrations</strong> → click <strong>New registration</strong></>,
                <>Name: <em>ProScope</em> · Account types: <em>Any org directory and personal Microsoft accounts</em></>,
                <>Redirect URI: <strong>Single-page application (SPA)</strong> → <span className="font-mono bg-slate-100 px-1 py-0.5 rounded">http://localhost:5173</span></>,
                <>Click <strong>Register</strong> → copy the <strong>Application (client) ID</strong></>,
                <>Go to <strong>API permissions</strong> → add <span className="font-mono bg-slate-100 px-1 py-0.5 rounded">Files.ReadWrite</span> and <span className="font-mono bg-slate-100 px-1 py-0.5 rounded">User.Read</span> (Microsoft Graph → Delegated)</>,
                <>Provide the Client ID — it will be entered into <span className="font-mono bg-slate-100 px-1 py-0.5 rounded">src/lib/msalConfig.ts</span></>,
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Connection block */}
        {isOneDriveConfigured && (
          <>
            {isConnected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(oneDrive.accountName ?? '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{oneDrive.accountName}</p>
                    <p className="text-xs text-slate-400 truncate">{oneDrive.accountEmail}</p>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    className="ml-auto text-xs text-red-500 hover:text-red-700 font-medium transition-colors flex-shrink-0"
                  >
                    Disconnect
                  </button>
                </div>

                {/* Folder name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">App root folder on OneDrive</label>
                  <div className="flex gap-2">
                    <div className="flex items-center gap-1.5 flex-1 border border-slate-200 rounded-lg px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-blue-500">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                      </svg>
                      <input
                        value={folderDraft}
                        onChange={e => { setFolderDraft(e.target.value); setFolderSaved(false) }}
                        onKeyDown={e => e.key === 'Enter' && handleSaveFolder()}
                        className="flex-1 text-sm text-slate-800 outline-none bg-transparent"
                        placeholder="ProScope"
                      />
                    </div>
                    <button
                      onClick={handleSaveFolder}
                      className="px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      {folderSaved ? '✓ Saved' : 'Save'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Photos will be saved to <span className="font-mono">{oneDrive.rootFolderName}/{'{Project Name}'}/</span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Connect your Microsoft account to automatically back up project photos to OneDrive. A folder will be created for each project.
                </p>
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="flex items-center gap-2.5 px-4 py-2.5 bg-[#0078D4] hover:bg-[#106EBE] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
                >
                  {connecting ? (
                    <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.25"/>
                      <path d="M21 12a9 9 0 00-9-9"/>
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>
                    </svg>
                  )}
                  {connecting ? 'Connecting…' : 'Connect OneDrive'}
                </button>
              </div>
            )}
          </>
        )}

        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}

        {/* How it works */}
        {isConnected && (
          <div className="pt-1 border-t border-slate-100 space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">How it works</p>
            <ul className="space-y-1 text-[11px] text-slate-500">
              <li className="flex gap-1.5"><span className="text-blue-400">•</span> Photos uploaded to scope items are backed up automatically</li>
              <li className="flex gap-1.5"><span className="text-blue-400">•</span> Walk / site visit room photos are also synced</li>
              <li className="flex gap-1.5"><span className="text-blue-400">•</span> Each project gets its own subfolder inside your app folder</li>
              <li className="flex gap-1.5"><span className="text-blue-400">•</span> Sync happens in the background — your work is never blocked</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
