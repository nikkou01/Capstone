import axios from 'axios'
import { API_BASE_URL } from '../config'

const api = axios.create({ baseURL: API_BASE_URL })

export function setApiToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`
  } else {
    delete api.defaults.headers.common.Authorization
  }
}

export async function login(username, password) {
  const form = new URLSearchParams()
  form.append('username', username)
  form.append('password', password)
  const { data } = await api.post('/auth/token', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return data
}

export async function fetchMe() {
  const { data } = await api.get('/auth/me')
  return data
}

export async function fetchStats() {
  const { data } = await api.get('/dashboard/stats')
  return data
}

export async function fetchCollisions() {
  const { data } = await api.get('/collisions/')
  return data
}

export async function updateCollisionStatus(id, status) {
  const { data } = await api.put(`/collisions/${id}`, { status })
  return data
}

export async function fetchAlerts() {
  const { data } = await api.get('/alerts/')
  return data
}

export async function fetchCameras() {
  const { data } = await api.get('/cameras/')
  return data
}

export function getSnapshotUrl(cameraId) {
  return `${API_BASE_URL}/cameras/${encodeURIComponent(cameraId)}/snapshot`
}

export function getCollisionClipUrl(collision) {
  const rawUrl = String(collision?.video_public_url || '').trim()
  if (!rawUrl) return ''

  try {
    const clipUrl = new URL(rawUrl)
    const apiUrl = new URL(API_BASE_URL)
    clipUrl.protocol = apiUrl.protocol
    clipUrl.host = apiUrl.host
    return clipUrl.toString()
  } catch {
    return rawUrl
  }
}
