import { useState } from 'react'

// Hardcoded credentials. Client-side only — server validates on writes.
const USER = import.meta.env.VITE_ADMIN_USER || 'admin'
const PASS = import.meta.env.VITE_ADMIN_PASS || 'tennis'
const STORAGE_KEY = 'tennis-regionals-admin'

export function isAdmin() {
  return localStorage.getItem(STORAGE_KEY) === '1'
}

export function adminPass() {
  return PASS
}

export function logout() {
  localStorage.removeItem(STORAGE_KEY)
  window.location.reload()
}

export default function Gate({ onUnlock }) {
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (u === USER && p === PASS) {
      localStorage.setItem(STORAGE_KEY, '1')
      setErr('')
      onUnlock()
    } else {
      setErr('Nope')
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-xs space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-5">
        <div>
          <div className="text-sm font-bold">Admin login</div>
          <div className="text-[11px] text-slate-400">View-only? Open <a href="/view" className="underline text-blue-400">/view</a></div>
        </div>
        <input
          autoFocus
          value={u}
          onChange={e => setU(e.target.value)}
          placeholder="username"
          autoComplete="username"
          className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm"
        />
        <input
          value={p}
          onChange={e => setP(e.target.value)}
          placeholder="password"
          type="password"
          autoComplete="current-password"
          className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm"
        />
        {err && <div className="text-xs text-red-400">{err}</div>}
        <button type="submit" className="w-full px-3 py-2 rounded bg-blue-600 text-white text-sm font-semibold">
          Unlock
        </button>
      </form>
    </div>
  )
}
