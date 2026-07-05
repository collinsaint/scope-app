import { msalInstance, GRAPH_SCOPES, ensureMsalInitialized } from './msalConfig'
import type { AccountInfo } from '@azure/msal-browser'

const GRAPH = 'https://graph.microsoft.com/v1.0'

// Sanitize a project name for use as an OneDrive folder name
function sanitizeFolderName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 100) || 'Unnamed Project'
}

async function getToken(): Promise<string> {
  const accounts = msalInstance.getAllAccounts()
  if (!accounts.length) throw new Error('Not signed in to OneDrive')
  try {
    const res = await msalInstance.acquireTokenSilent({ scopes: GRAPH_SCOPES, account: accounts[0] })
    return res.accessToken
  } catch {
    const res = await msalInstance.acquireTokenPopup({ scopes: GRAPH_SCOPES, account: accounts[0] })
    return res.accessToken
  }
}

async function graphFetch(method: string, path: string, body?: unknown, isBlob = false): Promise<Response> {
  const token = await getToken()
  return fetch(`${GRAPH}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(isBlob ? { 'Content-Type': 'image/jpeg' } : { 'Content-Type': 'application/json' }),
    },
    body: body instanceof Blob ? body : body ? JSON.stringify(body) : undefined,
  })
}

export async function signInToOneDrive(): Promise<AccountInfo> {
  await ensureMsalInitialized()
  const res = await msalInstance.loginPopup({ scopes: GRAPH_SCOPES })
  return res.account
}

export async function signOutOfOneDrive(): Promise<void> {
  await ensureMsalInitialized()
  const accounts = msalInstance.getAllAccounts()
  if (accounts.length) {
    await msalInstance.logoutPopup({ account: accounts[0] })
  }
}

export function getConnectedAccount(): AccountInfo | null {
  const accounts = msalInstance.getAllAccounts()
  return accounts[0] ?? null
}

// Ensures a folder exists at the given drive path, returns its item id
async function ensureFolder(drivePath: string, folderName: string): Promise<string> {
  const token = await getToken()
  const fullPath = drivePath ? `${drivePath}/${folderName}` : folderName

  // Check if it already exists
  const check = await fetch(`${GRAPH}/me/drive/root:/${fullPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (check.ok) {
    const data = await check.json()
    return data.id as string
  }

  // Create it
  const parentPath = drivePath
    ? `/me/drive/root:/${drivePath}:/children`
    : `/me/drive/root/children`
  const create = await fetch(`${GRAPH}${parentPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'rename',
    }),
  })
  if (!create.ok) throw new Error(`Failed to create OneDrive folder: ${folderName}`)
  const data = await create.json()
  return data.id as string
}

// Cache so we only check/create each project folder once per session
const folderEnsured = new Set<string>()

export async function ensureProjectFolder(rootFolderName: string, projectName: string): Promise<void> {
  const key = `${rootFolderName}::${projectName}`
  if (folderEnsured.has(key)) return
  const safe = sanitizeFolderName(projectName)
  await ensureFolder('', rootFolderName)
  await ensureFolder(rootFolderName, safe)
  folderEnsured.add(key)
}

export async function uploadPhotoToOneDrive(
  rootFolderName: string,
  projectName: string,
  dataUrl: string,
  fileName: string,
): Promise<string> {
  await ensureProjectFolder(rootFolderName, projectName)

  const safe = sanitizeFolderName(projectName)
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: 'image/jpeg' })

  const token = await getToken()
  const uploadPath = `${rootFolderName}/${safe}/${fileName}`
  const res = await fetch(`${GRAPH}/me/drive/root:/${uploadPath}:/content`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
    body: blob,
  })

  if (!res.ok) throw new Error('OneDrive upload failed')
  const data = await res.json()
  return (data.webUrl as string) ?? ''
}

export async function deletePhotoFromOneDrive(
  rootFolderName: string,
  projectName: string,
  fileName: string,
): Promise<void> {
  const safe = sanitizeFolderName(projectName)
  const token = await getToken()
  const path = `${rootFolderName}/${safe}/${fileName}`
  await fetch(`${GRAPH}/me/drive/root:/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  // Ignore errors — file may already be gone
}
