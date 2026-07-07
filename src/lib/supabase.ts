import { createClient } from '@supabase/supabase-js'
import type { Project } from '../types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export interface DbProject {
  id: string
  owner_id: string
  name: string
  address: string
  created_at: string
  updated_at: string
  data: Project
}
