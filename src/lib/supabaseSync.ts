import { supabase } from './supabase'
import type { Project, GlobalSubcontractor, JobGroup, Superintendent, PurchaseOrder, PODocument, POStatus } from '../types'

// User-level settings (personal, per-user)
export interface UserSettings {
  walkPresets: string[]
}

// Org-level settings (shared across the whole contractor org)
export interface OrgSettings {
  globalSubcontractors: GlobalSubcontractor[]
  jobGroups: JobGroup[]
  superintendents: Superintendent[]
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
    // silent
  }
}

export async function loadOrgSettingsForUser(userId: string): Promise<Partial<OrgSettings>> {
  try {
    // Look up the user's contractor org (subcontractor orgs don't use these settings)
    const { data: member } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (!member?.org_id) return {}

    const { data } = await supabase
      .from('org_settings')
      .select('data')
      .eq('org_id', member.org_id)
      .maybeSingle()
    return (data?.data ?? {}) as Partial<OrgSettings>
  } catch {
    return {}
  }
}

export async function syncOrgSettingsToSupabase(settings: OrgSettings, orgId: string): Promise<void> {
  try {
    await supabase
      .from('org_settings')
      .upsert({ org_id: orgId, data: settings, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })
  } catch {
    // silent
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

export async function syncProjectToSupabase(project: Project, ownerId: string, orgId?: string): Promise<void> {
  // UPDATE first — preserves the original owner_id/org_id so sub users
  // can't overwrite contractor ownership when they save approval changes.
  const { data: updated, error: updateErr } = await supabase
    .from('projects')
    .update({
      name: project.name,
      address: project.address,
      updated_at: new Date().toISOString(),
      data: project,
    })
    .eq('id', project.id)
    .select('id')

  if (updateErr) {
    console.error('Failed to sync project (update):', updateErr.message)
    return
  }

  // No rows updated → project is new, insert with full ownership metadata.
  if (!updated || updated.length === 0) {
    const { error: insertErr } = await supabase
      .from('projects')
      .insert({
        id: project.id,
        owner_id: ownerId,
        org_id: orgId ?? null,
        name: project.name,
        address: project.address,
        created_at: project.createdAt,
        updated_at: new Date().toISOString(),
        data: project,
      })
    if (insertErr) {
      console.error('Failed to sync project (insert):', insertErr.message)
    }
  }
}

export async function assignProjectSuperintendent(
  projectId: string,
  newUserId: string | null,
  oldUserId?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('assign_project_superintendent', {
    p_project_id:  projectId,
    p_new_user_id: newUserId,
    p_old_user_id: oldUserId ?? null,
  })
  if (error) {
    console.error('Failed to assign superintendent:', error.message)
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

export interface SubOrg {
  id: string
  name: string
}

export async function fetchContractorSubOrgs(contractorOrgId: string): Promise<SubOrg[]> {
  try {
    const { data, error } = await supabase
      .from('contractor_subcontractors')
      .select('subcontractor_org_id, organizations!contractor_subcontractors_subcontractor_org_id_fkey(id, name)')
      .eq('contractor_org_id', contractorOrgId)

    if (error || !data) return []
    return data.map((row: any) => ({ id: row.organizations.id, name: row.organizations.name }))
  } catch {
    return []
  }
}

// Fetches all sub orgs linked to the current user's contractor org (no org ID needed)
export async function fetchMyContractorSubOrgs(): Promise<SubOrg[]> {
  try {
    const { data } = await supabase
      .from('contractor_subcontractors')
      .select('organizations!contractor_subcontractors_subcontractor_org_id_fkey(id, name)')
    if (!data) return []
    return data
      .map((row: any) => ({ id: row.organizations?.id ?? '', name: row.organizations?.name ?? '' }))
      .filter(o => o.id)
  } catch {
    return []
  }
}

export async function grantProjectAccessToSubOrg(projectId: string, subName: string, grantedBy: string): Promise<void> {
  await supabase.rpc('grant_project_access_by_sub_name', {
    p_project_id: projectId,
    p_sub_name:   subName,
    p_granted_by: grantedBy,
  })
}

export async function revokeProjectAccessForSubOrg(projectId: string, subName: string): Promise<void> {
  await supabase.rpc('revoke_project_access_by_sub_name', {
    p_project_id: projectId,
    p_sub_name:   subName,
  })
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────

export async function fetchPurchaseOrders(projectId: string): Promise<PurchaseOrder[]> {
  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(row => ({
      ...row,
      poNumber: row.data?.poNumber ?? row.title,
      lineItemIds: row.data?.lineItemIds ?? [],
      documents: row.data?.documents ?? [],
    })) as PurchaseOrder[]
  } catch {
    return []
  }
}

// Fetch all POs visible to the current sub org user (across all projects)
export async function fetchPurchaseOrdersForSubOrg(subOrgId: string): Promise<PurchaseOrder[]> {
  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('sub_org_id', subOrgId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(row => ({
      ...row,
      poNumber: row.data?.poNumber ?? row.title,
      lineItemIds: row.data?.lineItemIds ?? [],
      documents: row.data?.documents ?? [],
    })) as PurchaseOrder[]
  } catch {
    return []
  }
}

export async function createPurchaseOrder(
  po: Pick<PurchaseOrder, 'project_id' | 'contractor_org_id' | 'sub_org_id' | 'title' | 'amount' | 'notes'> & {
    poNumber: string
    lineItemIds: string[]
    documents?: PODocument[]
  },
  userId: string
): Promise<PurchaseOrder | null> {
  try {
    const { poNumber, lineItemIds, documents, ...rest } = po
    const { data, error } = await supabase
      .from('purchase_orders')
      .insert({
        ...rest,
        title: poNumber,
        created_by: userId,
        data: { poNumber, lineItemIds, documents: documents ?? [] },
      })
      .select()
      .single()
    if (error) throw error
    const row = data as Record<string, unknown>
    return {
      ...row,
      poNumber,
      lineItemIds,
      documents: documents ?? [],
    } as PurchaseOrder
  } catch {
    return null
  }
}

export async function updatePurchaseOrder(
  id: string,
  fields: Partial<Pick<PurchaseOrder, 'title' | 'amount' | 'status' | 'notes' | 'sub_org_id' | 'documents'>>
): Promise<boolean> {
  try {
    const { documents, ...rest } = fields
    const updatePayload: Record<string, unknown> = { ...rest }
    if (documents !== undefined) {
      // Merge documents into existing data column
      const { data: existing } = await supabase
        .from('purchase_orders')
        .select('data')
        .eq('id', id)
        .single()
      updatePayload.data = { ...(existing?.data ?? {}), documents }
    }
    const { error } = await supabase
      .from('purchase_orders')
      .update(updatePayload)
      .eq('id', id)
    return !error
  } catch {
    return false
  }
}

export async function deletePurchaseOrder(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('purchase_orders')
      .delete()
      .eq('id', id)
    return !error
  } catch {
    return false
  }
}

export async function uploadPODocument(file: File, poId: string): Promise<string | null> {
  try {
    const ext = file.name.split('.').pop() ?? 'bin'
    const path = `${poId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('po-documents').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('po-documents').getPublicUrl(path)
    return data.publicUrl
  } catch {
    return null
  }
}

// Unused import guard
export type { POStatus, PODocument }
