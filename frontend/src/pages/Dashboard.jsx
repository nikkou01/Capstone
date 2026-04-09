import { useEffect, useMemo, useRef, useState } from 'react'
import {
  acknowledgeCollision,
  fetchAlerts,
  fetchCameraSnapshotBlob,
  fetchCameras,
  fetchCollisions,
  fetchStats,
} from '../api'

function statusBadgeClass(status) {
  if (status === 'active') return 'bg-green-100 text-green-800'
  if (status === 'maintenance') return 'bg-yellow-100 text-yellow-800'
  if (status === 'error') return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-700'
}

function alertStatusBadgeClass(status) {
  if (status === 'sent') return 'bg-green-100 text-green-800'
  if (status === 'failed') return 'bg-red-100 text-red-800'
  return 'bg-yellow-100 text-yellow-800'
}

function StatCard({ icon, iconBg, iconColor, label, value, sub, subColor }) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-5 border border-gray-200 card-hover">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          <p className={`text-sm ${subColor}`}>{sub}</p>
        </div>
        <div className={`p-3 ${iconBg} rounded-full flex-shrink-0`}>
          <i className={`fas ${icon} ${iconColor} text-lg`} />
        </div>
      </div>
    </div>
  )
}

function QuickAccessCard({ icon, title, description, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-left w-full bg-white rounded-lg border border-gray-200 p-4 card-hover"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
          <i className={`fas ${icon}`} />
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-sm">{title}</p>
          <p className="text-xs text-gray-500 mt-1">{description}</p>
        </div>
      </div>
    </button>
  )
}

async function parseErrorDetail(err, fallback = 'Request failed.') {
  let detail = fallback
  const payload = err?.response?.data

  if (payload instanceof Blob) {
    try {
      const text = await payload.text()
      const parsed = JSON.parse(text)
      if (parsed?.detail) detail = parsed.detail
    } catch {
      detail = fallback
    }
  } else if (payload?.detail) {
    detail = payload.detail
  }

  return detail
}

export default function Dashboard({ user, notify, onNavigate }) {
  const [stats, setStats] = useState(null)
  const [allCollisions, setAllCollisions] = useState([])
  const [alerts, setAlerts] = useState([])
  const [cameras, setCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [cameraFrames, setCameraFrames] = useState({})
  const [loading, setLoading] = useState(true)

  const frameUrlRef = useRef(new Map())
  const isCaptain = String(user?.role || '').toLowerCase() === 'captain'

  const quickAccessLinks = useMemo(() => {
    const links = [
      {
        id: 'cameraLocations',
        icon: 'fa-map-marker-alt',
        title: 'Camera Locations',
        description: 'Pin and monitor CCTV map coordinates',
      },
      {
        id: 'collisions',
        icon: 'fa-exclamation-triangle',
        title: 'Collision Logs',
        description: 'Review incidents and acknowledgement status',
      },
      {
        id: 'alerts',
        icon: 'fa-bell',
        title: 'Alert History',
        description: 'Track SMS delivery and failures',
      },
      {
        id: 'analytics',
        icon: 'fa-chart-line',
        title: 'Analytics',
        description: 'Check monthly trends and camera hotspots',
      },
    ]

    if (isCaptain) {
      links.splice(1, 0, {
        id: 'cameras',
        icon: 'fa-video',
        title: 'Camera Management',
        description: 'Add, edit, and remove CCTV sources',
      })
    }

    return links
  }, [isCaptain])

  const recentCollisions = useMemo(() => allCollisions.slice(0, 5), [allCollisions])
  const recentAlerts = useMemo(() => alerts.slice(0, 5), [alerts])
  const pendingCollisions = useMemo(
    () => allCollisions.filter(collision => collision.status === 'pending'),
    [allCollisions],
  )
  const mappedCameras = useMemo(
    () => cameras.filter(cam => Number.isFinite(cam.map_latitude) && Number.isFinite(cam.map_longitude)).length,
    [cameras],
  )
  const streamableCameras = useMemo(
    () => cameras.filter(cam => cam.status === 'active' && cam.rtsp_url),
    [cameras],
  )
  const selectedCamera = useMemo(
    () => cameras.find(cam => cam.id === selectedCameraId) || null,
    [cameras, selectedCameraId],
  )
  const hotspot = useMemo(() => {
    if (!allCollisions.length) return null

    const counter = {}
    for (const collision of allCollisions) {
      const key = collision.camera_name || 'Unknown camera'
      counter[key] = (counter[key] || 0) + 1
    }

    const [name, count] = Object.entries(counter).sort((a, b) => b[1] - a[1])[0]
    return { name, count }
  }, [allCollisions])

  async function load() {
    try {
      const [statsDoc, collisionsDoc, cameraDocs, alertDocs] = await Promise.all([
        fetchStats(),
        fetchCollisions(),
        fetchCameras(),
        fetchAlerts(),
      ])

      setStats(statsDoc)
      setAllCollisions(collisionsDoc)
      setCameras(cameraDocs)
      setAlerts(alertDocs)
    } catch {
      notify('Failed to load dashboard data.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!cameras.length) {
      setSelectedCameraId('')
      return
    }

    const exists = cameras.some(cam => cam.id === selectedCameraId)
    if (!exists) {
      const firstLive = cameras.find(cam => cam.status === 'active') || cameras[0]
      setSelectedCameraId(firstLive?.id || '')
    }
  }, [cameras, selectedCameraId])

  useEffect(() => {
    let cancelled = false
    let inFlight = false

    if (!streamableCameras.length) {
      setCameraFrames(prev => {
        const next = { ...prev }
        for (const id of Object.keys(next)) {
          const oldUrl = frameUrlRef.current.get(id)
          if (oldUrl) URL.revokeObjectURL(oldUrl)
          frameUrlRef.current.delete(id)
          delete next[id]
        }
        return next
      })
      return
    }

    const refreshSnapshots = async () => {
      if (inFlight) return
      inFlight = true

      try {
        const results = await Promise.all(
          streamableCameras.map(async cam => {
            try {
              const blob = await fetchCameraSnapshotBlob(cam.id)
              return { id: cam.id, blob }
            } catch (err) {
              const error = await parseErrorDetail(err, 'Unable to fetch live frame.')
              return { id: cam.id, error }
            }
          }),
        )

        if (cancelled) return

        setCameraFrames(prev => {
          const next = { ...prev }
          const streamableIds = new Set(streamableCameras.map(cam => cam.id))

          for (const id of Object.keys(next)) {
            if (!streamableIds.has(id)) {
              const oldUrl = frameUrlRef.current.get(id)
              if (oldUrl) URL.revokeObjectURL(oldUrl)
              frameUrlRef.current.delete(id)
              delete next[id]
            }
          }

          for (const result of results) {
            if (result.blob) {
              const nextUrl = URL.createObjectURL(result.blob)
              const oldUrl = frameUrlRef.current.get(result.id)
              if (oldUrl) URL.revokeObjectURL(oldUrl)

              frameUrlRef.current.set(result.id, nextUrl)
              next[result.id] = { url: nextUrl, error: '', updatedAt: Date.now() }
            } else {
              next[result.id] = {
                url: frameUrlRef.current.get(result.id) || '',
                error: result.error,
                updatedAt: Date.now(),
              }
            }
          }

          return next
        })
      } finally {
        inFlight = false
      }
    }

    refreshSnapshots()
    const timer = setInterval(refreshSnapshots, 3000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [streamableCameras])

  useEffect(() => {
    return () => {
      for (const url of frameUrlRef.current.values()) {
        URL.revokeObjectURL(url)
      }
      frameUrlRef.current.clear()
    }
  }, [])

  async function handleAck(id) {
    try {
      await acknowledgeCollision(id)
      notify('Event acknowledged.', 'success')
      await load()
    } catch {
      notify('Failed to acknowledge.', 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <i className="fas fa-spinner fa-spin text-emerald-500 text-3xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          icon="fa-video"
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          label="Active Cameras"
          value={stats?.active_cameras ?? streamableCameras.length}
          sub={`${streamableCameras.length} with live stream`}
          subColor="text-green-600"
        />
        <StatCard
          icon="fa-map-marker-alt"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          label="Mapped Cameras"
          value={mappedCameras}
          sub="Placed on camera map"
          subColor="text-emerald-600"
        />
        <StatCard
          icon="fa-exclamation-triangle"
          iconBg="bg-red-50"
          iconColor="text-red-600"
          label="Total Collisions"
          value={stats?.total_collisions ?? allCollisions.length}
          sub={`${stats?.pending_collisions ?? pendingCollisions.length} unacknowledged`}
          subColor="text-orange-600"
        />
        <StatCard
          icon="fa-sms"
          iconBg="bg-green-50"
          iconColor="text-green-600"
          label="SMS Alerts Sent"
          value={stats?.total_alerts ?? alerts.length}
          sub="Notifications active"
          subColor="text-blue-600"
        />
        <StatCard
          icon="fa-bell"
          iconBg="bg-yellow-50"
          iconColor="text-yellow-600"
          label="Pending Alerts"
          value={stats?.pending_collisions ?? pendingCollisions.length}
          sub={(stats?.pending_collisions ?? pendingCollisions.length) ? 'Requires attention' : 'All clear'}
          subColor={(stats?.pending_collisions ?? pendingCollisions.length) ? 'text-red-600' : 'text-green-600'}
        />
        <StatCard
          icon="fa-fire"
          iconBg="bg-orange-50"
          iconColor="text-orange-600"
          label="Top Hotspot"
          value={hotspot?.name || 'N/A'}
          sub={hotspot ? `${hotspot.count} incident(s)` : 'No incidents yet'}
          subColor="text-orange-600"
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center space-x-2">
          <i className="fas fa-compass text-emerald-500" />
          <h3 className="text-lg font-medium text-gray-900">Quick Access</h3>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {quickAccessLinks.map(link => (
            <QuickAccessCard
              key={link.id}
              icon={link.icon}
              title={link.title}
              description={link.description}
              onClick={() => onNavigate?.(link.id)}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <i className="fas fa-eye text-green-500" />
              <h3 className="text-lg font-medium text-gray-900">Featured Live Camera</h3>
            </div>
            <select
              value={selectedCameraId}
              onChange={e => setSelectedCameraId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[220px]"
              disabled={!cameras.length}
            >
              {!cameras.length && <option value="">No cameras available</option>}
              {cameras.map(cam => (
                <option key={cam.id} value={cam.id}>
                  {cam.name} ({cam.status})
                </option>
              ))}
            </select>
          </div>
          <div className="p-6">
            {!selectedCamera ? (
              <div className="aspect-video bg-gray-100 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-500">
                No camera selected.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-semibold text-gray-900">{selectedCamera.name}</p>
                    <p className="text-gray-500">{selectedCamera.location}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full font-medium ${statusBadgeClass(selectedCamera.status)}`}>
                    {selectedCamera.status}
                  </span>
                </div>

                <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden border border-gray-800 relative">
                  {selectedCamera.status === 'active' && selectedCamera.rtsp_url && cameraFrames[selectedCamera.id]?.url ? (
                    <img
                      src={cameraFrames[selectedCamera.id].url}
                      alt={`${selectedCamera.name} live feed`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 px-6 text-center">
                      <i className="fas fa-video-slash text-3xl mb-3" />
                      <p className="font-medium">Live feed unavailable</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {cameraFrames[selectedCamera.id]?.error || 'Camera is offline, inactive, or has no stream URL.'}
                      </p>
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <span className="px-2 py-1 bg-red-500 text-white text-xs rounded-full">
                      <i className="fas fa-circle animate-pulse mr-1" />LIVE
                    </span>
                  </div>
                </div>

                <p className="text-xs text-gray-500">Auto-refreshing camera snapshots every 3 seconds.</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center space-x-2">
            <i className="fas fa-exclamation-triangle text-orange-500" />
            <h3 className="text-lg font-medium text-gray-900">Recent Collision Events</h3>
          </div>
          <div className="p-6 space-y-3 max-h-96 overflow-y-auto">
            {recentCollisions.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">No collision events yet.</p>
            )}
            {recentCollisions.map(collision => (
              <div
                key={collision.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  collision.status === 'pending' ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${collision.status === 'pending' ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{collision.camera_name}</p>
                    <p className="text-xs text-gray-500">
                      {collision.camera_location} • {new Date(collision.timestamp).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      Confidence: <span className="font-medium text-red-600">{(collision.confidence_score * 100).toFixed(1)}%</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      collision.status === 'pending' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {collision.status}
                  </span>
                  {collision.status === 'pending' && (
                    <button
                      onClick={() => handleAck(collision.id)}
                      className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-full"
                    >
                      Ack
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {pendingCollisions.length > 0 && (
            <div className="mx-6 mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-center space-x-2 text-yellow-800">
                <i className="fas fa-exclamation-triangle" />
                <p className="text-sm font-medium">
                  {pendingCollisions.length} unacknowledged collision event(s) require attention.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <i className="fas fa-th-large text-blue-500" />
            <h3 className="text-lg font-medium text-gray-900">Camera Dashboard - All CCTV Live Output</h3>
          </div>
          <span className="text-xs text-gray-500">
            {streamableCameras.length} live / {cameras.length} total cameras
          </span>
        </div>
        <div className="p-6">
          {cameras.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <i className="fas fa-video text-3xl mb-2 block text-gray-300" />
              No cameras configured yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {cameras.map(camera => {
                const frame = cameraFrames[camera.id]
                const canStream = camera.status === 'active' && camera.rtsp_url

                return (
                  <div key={camera.id} className="rounded-lg border border-gray-200 overflow-hidden bg-white">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{camera.name}</p>
                        <p className="text-xs text-gray-500">{camera.location}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${statusBadgeClass(camera.status)}`}>
                        {camera.status}
                      </span>
                    </div>

                    <div className="aspect-video bg-gray-900">
                      {canStream && frame?.url ? (
                        <img src={frame.url} alt={`${camera.name} live`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm px-4 text-center">
                          {frame?.error || (canStream ? 'Loading live frame...' : 'Live output unavailable for this camera.')}
                        </div>
                      )}
                    </div>

                    <div className="px-4 py-3 text-xs text-gray-500 space-y-1">
                      <p>IP: {camera.ip_address}:{camera.port}</p>
                      <p>{camera.description || 'No description provided.'}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center space-x-2">
          <i className="fas fa-sms text-indigo-500" />
          <h3 className="text-lg font-medium text-gray-900">Recent SMS Alerts</h3>
        </div>
        <div className="p-6 space-y-3">
          {recentAlerts.length === 0 && <p className="text-sm text-gray-500">No alert history yet.</p>}

          {recentAlerts.map(alert => (
            <div key={alert.id} className="flex items-start justify-between p-3 rounded-lg border border-gray-200 bg-gray-50 gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {alert.is_test ? 'Test SMS' : 'Collision SMS'} to {alert.recipient_name}
                </p>
                <p className="text-xs text-gray-500">{alert.recipient_phone}</p>
                <p className="text-xs text-gray-500 mt-1">{alert.message}</p>
              </div>
              <span className={`px-2 py-1 text-xs rounded-full font-medium ${alertStatusBadgeClass(alert.status)}`}>
                {alert.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
