import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Simple localStorage-based storage shim (replaces window.storage from Claude artifact)
window.storage = {
  async get(key) {
    try {
      const val = localStorage.getItem(key)
      return val ? { value: val } : null
    } catch { return null }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value)
      return { key, value }
    } catch { return null }
  },
  async delete(key) {
    try {
      localStorage.removeItem(key)
      return { key, deleted: true }
    } catch { return null }
  },
  async list(prefix) {
    try {
      const keys = Object.keys(localStorage).filter(k => !prefix || k.startsWith(prefix))
      return { keys }
    } catch { return { keys: [] } }
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
