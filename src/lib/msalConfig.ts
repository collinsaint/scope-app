import { PublicClientApplication, type Configuration } from '@azure/msal-browser'

// ─── SETUP REQUIRED ───────────────────────────────────────────────────────────
// Replace this with your Azure App Registration Client ID.
// See Contractor Settings → OneDrive for setup instructions.
export const ONEDRIVE_CLIENT_ID = 'YOUR_AZURE_CLIENT_ID_HERE'
// ──────────────────────────────────────────────────────────────────────────────

export const isOneDriveConfigured = ONEDRIVE_CLIENT_ID !== 'YOUR_AZURE_CLIENT_ID_HERE'

const msalConfig: Configuration = {
  auth: {
    clientId: ONEDRIVE_CLIENT_ID,
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
}

export const msalInstance = new PublicClientApplication(msalConfig)

export const GRAPH_SCOPES = ['User.Read', 'Files.ReadWrite']

let initialized = false
export async function ensureMsalInitialized() {
  if (!initialized) {
    await msalInstance.initialize()
    initialized = true
  }
}
