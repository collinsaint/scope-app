import { useEffect, useState, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { CurrentUser, UserProfile, Organization, OrgType, ContractorRole, SubcontractorRole } from '../types'

export function useCurrentUser(user: User | null | undefined) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) {
      setCurrentUser(null)
      return
    }
    setLoading(true)
    try {
      const [profileRes, orgMemberRes, subMemberRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('org_members').select('*, organizations(*)').eq('user_id', user.id).maybeSingle(),
        // Use SECURITY DEFINER RPC to bypass RLS recursion issues on this join
        supabase.rpc('get_my_sub_membership'),
      ])

      const profile = profileRes.data as UserProfile | null
      const orgMember = orgMemberRes.data as ({ role: ContractorRole; organizations: Organization } | null)
      const rawSubData = Array.isArray(subMemberRes.data) ? subMemberRes.data[0] ?? null : subMemberRes.data ?? null
      const subMember = rawSubData as ({ org_id: string; org_name: string; org_type: string; role: SubcontractorRole } | null)

      const subOrg: Organization | null = subMember
        ? { id: subMember.org_id, name: subMember.org_name, type: subMember.org_type as OrgType, created_by: null, created_at: '' }
        : null

      setCurrentUser({
        profile: profile ?? { id: user.id, email: user.email ?? '', display_name: null, role: 'user', created_at: new Date().toISOString() },
        contractorOrg: orgMember?.organizations ?? null,
        contractorRole: orgMember?.role ?? null,
        subcontractorOrg: subOrg,
        subcontractorRole: subMember?.role ?? null,
      })
    } catch (err) {
      console.error('useCurrentUser error:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh()
  }, [refresh])

  return { currentUser, loading, refresh }
}
