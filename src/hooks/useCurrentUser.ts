import { useEffect, useState, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { CurrentUser, UserProfile, Organization, ContractorRole, SubcontractorRole } from '../types'

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
        supabase.from('subcontractor_members').select('*, organizations(*)').eq('user_id', user.id).maybeSingle(),
      ])

      const profile = profileRes.data as UserProfile | null
      const orgMember = orgMemberRes.data as ({ role: ContractorRole; organizations: Organization } | null)
      const subMember = subMemberRes.data as ({ role: SubcontractorRole; organizations: Organization } | null)

      setCurrentUser({
        profile: profile ?? { id: user.id, email: user.email ?? '', display_name: null, role: 'user', created_at: new Date().toISOString() },
        contractorOrg: orgMember?.organizations ?? null,
        contractorRole: orgMember?.role ?? null,
        subcontractorOrg: subMember?.organizations ?? null,
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
