// Vercel serverless function: GET returns current state, POST updates it (admin).
// Reads/writes Supabase via the service-role key (server-side only).

import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN_PASS = process.env.ADMIN_PASS

function timingSafeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!URL || !SERVICE) {
    return res.status(500).json({ error: 'Supabase not configured on server' })
  }
  const supabase = createClient(URL, SERVICE)

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('tennis_state')
      .select('data, updated_at')
      .eq('id', 1)
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ state: data?.data || null, updatedAt: data?.updated_at || null })
  }

  if (req.method === 'POST') {
    const pass = req.headers['x-admin-pass']
    if (!ADMIN_PASS) {
      return res.status(500).json({ error: 'ADMIN_PASS not configured on server' })
    }
    if (!timingSafeEq(pass, ADMIN_PASS)) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    const body = req.body
    if (!body?.state?.flights) {
      return res.status(400).json({ error: 'Missing state.flights' })
    }
    const { error } = await supabase
      .from('tennis_state')
      .upsert({ id: 1, data: body.state, updated_at: new Date().toISOString() })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  }

  return res.status(405).json({ error: 'GET or POST only' })
}
