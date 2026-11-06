// All backend API calls in one place.
// Set NEXT_PUBLIC_API_BASE_URL in your .env.local file.
// e.g. NEXT_PUBLIC_API_BASE_URL=http://localhost:5000

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000'

const fetchJSON = async (path, options = {}) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(err.message || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Session APIs ───────────────────────────────────────────────────────────────

export const createSession = (payload) =>
  fetchJSON('/create-session', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const getSessions = () => fetchJSON('/sessions')

export const getSession = (sessionId) => fetchJSON(`/session/${sessionId}`)

// ── Generation APIs ────────────────────────────────────────────────────────────

export const generateResponses = (sessionId) =>
  fetchJSON('/generate-responses', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  })

export const regenerateOutput = (outputId) =>
  fetchJSON('/regenerate-output', {
    method: 'POST',
    body: JSON.stringify({ output_id: outputId }),
  })

// ── Evaluation APIs ────────────────────────────────────────────────────────────

export const gradeSession = (sessionId) =>
  fetchJSON('/grade-session', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  })

// ── Export APIs ────────────────────────────────────────────────────────────────

export const downloadExport = (sessionId, type = 'csv') => {
  const url = `${BASE_URL}/export/${type}/${sessionId}`
  const a = document.createElement('a')
  a.href = url
  a.download = `session_${sessionId}_report.${type}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
