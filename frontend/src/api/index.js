import axios from 'axios'

const isDesktopFileMode = typeof window !== 'undefined' && window.location.protocol === 'file:'
const isElectronRuntime =
  typeof navigator !== 'undefined' &&
  typeof navigator.userAgent === 'string' &&
  navigator.userAgent.toLowerCase().includes('electron')
const isDesktopRuntime = isDesktopFileMode || isElectronRuntime
const apiBaseURL = isDesktopRuntime ? 'http://127.0.0.1:8000/api' : '/api'
export const API_BASE_URL = apiBaseURL

const api = axios.create({ baseURL: apiBaseURL })

// Attach token automatically
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function login(username, password) {
  const form = new URLSearchParams()
  form.append('username', username)
  form.append('password', password)
  const { data } = await api.post('/auth/token', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })
  localStorage.setItem('token', data.access_token)
  return data
}

export async function fetchMe() {
  const { data } = await api.get('/auth/me')
  return data
}

export function logout() {
  localStorage.removeItem('token')
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export async function fetchStats() {
  const { data } = await api.get('/dashboard/stats')
  return data
}

// ── Cameras ───────────────────────────────────────────────────────────────────
export async function fetchCameras()          { const { data } = await api.get('/cameras/');              return data }
export async function createCamera(body)      { const { data } = await api.post('/cameras/', body);       return data }
export async function updateCamera(id, body)  { const { data } = await api.put(`/cameras/${id}`, body);   return data }
export async function reconnectCamera(id)     { const { data } = await api.post(`/cameras/${id}/reconnect`); return data }
export async function deleteCamera(id)        { const { data } = await api.delete(`/cameras/${id}`);      return data }
export async function fetchCameraSnapshotBlob(id) { const { data } = await api.get(`/cameras/${id}/snapshot`, { responseType: 'blob' }); return data }
export function buildCameraStreamUrl(id, token = '') {
  const encodedId = encodeURIComponent(id)
  const base = `${API_BASE_URL}/cameras/${encodedId}/stream`
  if (!token) return base
  return `${base}?token=${encodeURIComponent(token)}`
}
export async function mockCollision(cameraId) { const { data } = await api.post(`/collisions/mock-detection?camera_id=${cameraId}`); return data }

// ── Collisions ────────────────────────────────────────────────────────────────
export async function fetchCollisions()        { const { data } = await api.get('/collisions/');                              return data }
export async function acknowledgeCollision(id) { const { data } = await api.put(`/collisions/${id}`, { status: 'acknowledged' }); return data }
export async function updateCollisionStatus(id, status) {
  const { data } = await api.put(`/collisions/${id}`, { status })
  return data
}
export async function fetchCollisionVideoBlob(id) {
  const { data } = await api.get(`/collisions/${id}/video`, { responseType: 'blob' })
  return data
}
export async function simulateCollisionVideo(videoFile, options = {}) {
  const {
    cameraId,
    createEvent = true,
    sendSms = true,
  } = options || {}

  const form = new FormData()
  form.append('video_file', videoFile)

  const query = new URLSearchParams()
  query.set('create_event', createEvent ? 'true' : 'false')
  query.set('send_sms', sendSms ? 'true' : 'false')
  if (cameraId) query.set('camera_id', cameraId)

  const { data } = await api.post('/collisions/simulate', form, {
    params: query,
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return data
}

// ── Users ─────────────────────────────────────────────────────────────────────
export async function fetchUsers()         { const { data } = await api.get('/users/');              return data }
export async function createUser(body)     { const { data } = await api.post('/users/', body);        return data }
export async function updateUser(id, body) { const { data } = await api.put(`/users/${id}`, body);   return data }
export async function deleteUser(id)       { const { data } = await api.delete(`/users/${id}`);      return data }

// ── Alerts ────────────────────────────────────────────────────────────────────
export async function fetchAlerts() { const { data } = await api.get('/alerts/'); return data }
export async function sendTestSmsAlert(body = {}) { const { data } = await api.post('/alerts/test-sms', body); return data }
