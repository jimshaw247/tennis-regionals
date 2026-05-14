// Sync layer between local state and Supabase `tennis_state` table.
//
// Read path (any client, including /view): one row, id=1, JSONB column `data`.
// Write path (admin only): POST to /api/state with x-admin-pass header. Server
// validates and upserts via service-role key.
// Realtime: subscribe to the row; on UPDATE, callback with the new state.

import { supabase, supabaseConfigured } from './supabase.js'

const ROW_ID = 1

export { supabaseConfigured }

export async function pullState() {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('tennis_state')
    .select('data, updated_at')
    .eq('id', ROW_ID)
    .maybeSingle()
  if (error) {
    console.warn('pullState failed:', error.message)
    return null
  }
  if (!data) return null
  return { state: data.data, updatedAt: data.updated_at }
}

// onChange is called whenever the row updates (debounced by Supabase realtime).
// Returns an unsubscribe function.
export function subscribeState(onChange) {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('tennis_state_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tennis_state', filter: `id=eq.${ROW_ID}` },
      (payload) => {
        const next = payload.new?.data
        if (next) onChange({ state: next, updatedAt: payload.new.updated_at })
      }
    )
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

// Admin write — sends full state to server. Throws on failure (caller decides
// whether to retry). Debounce in caller, not here.
export async function pushState(state, adminPass) {
  const res = await fetch('/api/state', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pass': adminPass || '',
    },
    body: JSON.stringify({ state }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`pushState ${res.status}: ${txt.slice(0, 200)}`)
  }
  return res.json()
}
