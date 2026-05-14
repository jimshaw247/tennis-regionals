import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Viewer from './Viewer.jsx'

// /view → read-only viewer subscribed to Supabase realtime.
// anything else → admin (with password gate).
const isViewer = window.location.pathname.startsWith('/view')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isViewer ? <Viewer /> : <App />}
  </StrictMode>,
)
