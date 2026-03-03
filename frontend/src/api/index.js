import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

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
export async function deleteCamera(id)        { const { data } = await api.delete(`/cameras/${id}`);      return data }
export async function mockCollision(cameraId) { const { data } = await api.post(`/collisions/mock-detection?camera_id=${cameraId}`); return data }

// ── Collisions ────────────────────────────────────────────────────────────────
export async function fetchCollisions()        { const { data } = await api.get('/collisions/');                              return data }
export async function acknowledgeCollision(id) { const { data } = await api.put(`/collisions/${id}`, { status: 'acknowledged' }); return data }

// ── Users ─────────────────────────────────────────────────────────────────────
export async function fetchUsers()         { const { data } = await api.get('/users/');              return data }
export async function createUser(body)     { const { data } = await api.post('/users/', body);        return data }
export async function updateUser(id, body) { const { data } = await api.put(`/users/${id}`, body);   return data }
export async function deleteUser(id)       { const { data } = await api.delete(`/users/${id}`);      return data }

// ── Alerts ────────────────────────────────────────────────────────────────────
export async function fetchAlerts() { const { data } = await api.get('/alerts/'); return data }
