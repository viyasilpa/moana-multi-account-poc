import { createClient } from '@supabase/supabase-js'
// Public POC config. Authorization is enforced by RLS, never by this key.
const deviceTest=typeof location!=='undefined'&&location.pathname==='/device.html'
export const supabase = deviceTest ? createClient(
  'https://bpedekosireooxrsaerp.supabase.co',
  'sb_publishable_Sn4MKuaPuHDqq3fxhBY7cQ_HtsPwM1G',
  {auth:{storageKey:'moana-synthetic-device-v1',persistSession:false}},
) : createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://gekgfbiduzntenvgcwxv.supabase.co',
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_H1K8h84bzTti827qODcZ2w_cOFIPRwt',
)
