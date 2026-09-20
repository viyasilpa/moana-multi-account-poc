import { createClient } from '@supabase/supabase-js'
// Public POC config. Authorization is enforced by RLS, never by this key.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://gekgfbiduzntenvgcwxv.supabase.co',
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_H1K8h84bzTti827qODcZ2w_cOFIPRwt',
)
