import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

// Lazy: returns null if env vars are missing (e.g. dev without secrets set).
// The app still works in offline / localStorage-only mode in that case.
export const supabase = (URL && ANON) ? createClient(URL, ANON, {
  realtime: { params: { eventsPerSecond: 5 } },
}) : null

export const supabaseConfigured = Boolean(supabase)
