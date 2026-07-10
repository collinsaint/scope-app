import { supabase } from './supabase'
import type { Project, GlobalSubcontractor, JobGroup, Superintendent } from '../types'

export interface UserSettings {
  globalSubcontractors: GlobalSubcontractor[]
  jobGroups: JobGroup[]
  superintendents: Superintendent[]
  walkPresets: string[]
}

export async function loadSettingsFromSupabase(): Promise<Partial<UserSettings>> {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('data')
      .maybeSingle()

    if (error || !data) return {}
    return (data.data ?? {}) as Partial<UserSettings>
  } catch {
    return {}
  }
}

export async function syncSettingsToSupabase(settings: UserSettings, userId: string): Promise<void> {
  try {
    await supabase
      .from('user_settings')
      .upsert({ user_id: userId, data: settings, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  } catch {
    // Table may not exist yet — fail silently
  }
}

export async function loadProjectsFromSupabase(): Promise<Project[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const { data, error } = await supabase
      .from('projects')
      .select('data')
      .order('created_at', { ascending: true })
      .abortSignal(controller.signal)

    if (error) {
      console.error('Failed to load projects:', error.message)
      return []
    }

    return (data ?? []).map(row => row.data as Project)
  } finally {
    clearTimeout(timeout)
  }
}

export async function syncProjectToSupabase(project: Project, ownerId: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .upsert({
      id: project.id,
      owner_id: ownerId,
      name: project.name,
      address: project.address,
      created_at: project.createdAt,
      updated_at: new Date().toISOString(),
      data: project,
    }, { onConflict: 'id' })

  if (error) {
    console.error('Failed to sync project:', error.message)
  }
}

export async function deleteProjectFromSupabase(projectId: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)

  if (error) {
    console.error('Failed to delete project:', error.message)
  }
}

export async function grantProjectAccess(projectId: string, userId: string, grantedBy: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('project_access')
    .upsert({ project_id: projectId, user_id: userId, granted_by: grantedBy }, { onConflict: 'project_id,user_id' })

  return { error: error?.message ?? null }
}

export async function revokeProjectAccess(projectId: string, userId: string): Promise<void> {
  await supabase
    .from('project_access')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId)
}
