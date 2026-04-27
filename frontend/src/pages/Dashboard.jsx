import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import useAutoRefresh from '../utils/useAutoRefresh'
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
  if (status === 'failed') return 'bg-red-100 text-red-800'
  if (status === 'error') return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-700'
}

function alertStatusBadgeClass(status) {
  if (status === 'sent') return 'bg-green-100 text-green-800'
  if (status === 'failed') return 'bg-red-100 text-red-800'
  return 'bg-yellow-100 text-yellow-800'
}

const DASHBOARD_MAP_DEFAULT_CENTER = [14.5995, 120.9842]

const DASHBOARD_CAMERA_ICON = L.divIcon({
  className: 'camera-map-pin camera-map-pin--pinned',
  html: '<span class="camera-map-pin__glyph"><i class="fas fa-video"></i></span>',
  iconSize: [34, 46],
  iconAnchor: [17, 44],
  popupAnchor: [0, -36],
  tooltipAnchor: [0, -32],
})

const DASHBOARD_HOTSPOT_ICON = L.divIcon({
  className: 'camera-map-pin camera-map-pin--draft',
  html: '<span class="camera-map-pin__glyph"><i class="fas fa-fire"></i></span>',
  iconSize: [34, 46],
  iconAnchor: [17, 44],
  popupAnchor: [0, -36],
  tooltipAnchor: [0, -32],
})

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
  const [featuredFrame, setFeaturedFrame] = useState({ url: '', error: '' })
  const [loading, setLoading] = useState(true)

  const featuredFrameUrlRef = useRef('')
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
        id: 'cameraDashboard',
        icon: 'fa-th-large',
        title: 'Camera Dashboard',
        description: 'Watch all CCTV streams in one page',
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
  const mappedCameraPins = useMemo(
    () => cameras.filter(cam => Number.isFinite(cam.map_latitude) && Number.isFinite(cam.map_longitude)),
    [cameras],
  )
  const mappedCameras = mappedCameraPins.length
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

  const monthlyAnalytics = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const elapsedDays = Math.max(now.getDate(), 1)

    const monthlyCollisions = allCollisions.filter(collision => {
      const stamp = new Date(collision.timestamp)
      if (Number.isNaN(stamp.getTime())) return false
      return stamp >= monthStart && stamp <= now
    })

    const severityCounts = { high: 0, medium: 0, low: 0 }
    const statusCounts = { pending: 0, acknowledged: 0, responded: 0, resolved: 0 }
    const cameraIndex = new Map(cameras.map(cam => [cam.id, cam]))
    const hotspots = new Map()

    for (const collision of monthlyCollisions) {
      const severityKey = String(collision.severity || 'medium').toLowerCase()
      if (severityKey in severityCounts) severityCounts[severityKey] += 1
      else severityCounts.medium += 1

      const statusKey = String(collision.status || 'pending').toLowerCase()
      if (statusKey in statusCounts) statusCounts[statusKey] += 1

      const cameraId = collision.camera_id || `name:${collision.camera_name || 'Unknown camera'}`
      if (!hotspots.has(cameraId)) {
        hotspots.set(cameraId, {
          cameraId: collision.camera_id || null,
          name: cameraIndex.get(collision.camera_id || '')?.name || collision.camera_name || 'Unknown camera',
          count: 0,
        })
      }
      hotspots.get(cameraId).count += 1
    }

    const topHotspots = Array.from(hotspots.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)

    return {
      monthLabel: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      totalThisMonth: monthlyCollisions.length,
      dailyAverage: (monthlyCollisions.length / elapsedDays).toFixed(2),
      highSeverity: severityCounts.high,
      statusCounts,
      topHotspots,
      topHotspotCameraId: topHotspots[0]?.cameraId || null,
    }
  }, [allCollisions, cameras])

  const locationMapCenter = useMemo(() => {
    if (!mappedCameraPins.length) return DASHBOARD_MAP_DEFAULT_CENTER

    const sums = mappedCameraPins.reduce(
      (acc, cam) => ({
        lat: acc.lat + cam.map_latitude,
        lng: acc.lng + cam.map_longitude,
      }),
      { lat: 0, lng: 0 },
    )

    return [sums.lat / mappedCameraPins.length, sums.lng / mappedCameraPins.length]
  }, [mappedCameraPins])

  async function load(options = {}) {
    const background = !!options.background
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
      if (!background) notify('Failed to load dashboard data.', 'error')
    } finally {
      if (!background) setLoading(false)
    }
  }

  useAutoRefresh(load, { intervalMs: 5000 })

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

    const resetFeaturedFrame = (error = '') => {
      if (featuredFrameUrlRef.current) {
        URL.revokeObjectURL(featuredFrameUrlRef.current)
        featuredFrameUrlRef.current = ''
      }
      setFeaturedFrame({ url: '', error })
    }

    if (!selectedCamera) {
      resetFeaturedFrame('')
      return
    }

    const canLoadSnapshot = selectedCamera.status === 'active' && !!selectedCamera.rtsp_url
    if (!canLoadSnapshot) {
      resetFeaturedFrame('Camera is offline, inactive, or has no stream URL.')
      return
    }

    const refreshSnapshot = async () => {
      try {
        const blob = await fetchCameraSnapshotBlob(selectedCamera.id)
        if (cancelled) return

        const nextUrl = URL.createObjectURL(blob)
        if (featuredFrameUrlRef.current) {
          URL.revokeObjectURL(featuredFrameUrlRef.current)
        }

        featuredFrameUrlRef.current = nextUrl
        setFeaturedFrame({ url: nextUrl, error: '' })
      } catch (err) {
        const error = await parseErrorDetail(err, 'Unable to fetch featured camera snapshot.')
        if (!cancelled) {
          setFeaturedFrame(prev => ({ ...prev, error }))
        }
      }
    }

    refreshSnapshot()
    const timer = setInterval(refreshSnapshot, 3000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [selectedCamera])

  useEffect(() => {
    return () => {
      if (featuredFrameUrlRef.current) {
        URL.revokeObjectURL(featuredFrameUrlRef.current)
      }
    }
  }, [])

  async function handleAck(id) {
    try {
      await acknowledgeCollision(id)
      notify('Event acknowledged.', 'success')
      await load({ background: true })
    } catch {
      notify('Failed to acknowledge.', 'error')
    }
  }

  function openCameraLiveFeed(cameraId) {
    if (!cameraId) {
      onNavigate?.('cameraDashboard')
      return
    }

    onNavigate?.({
      page: 'cameraDashboard',
      state: {
        cameraId,
        ts: Date.now(),
      },
    })
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
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
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

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <i className="fas fa-chart-pie text-indigo-500" />
              <h3 className="text-lg font-medium text-gray-900">Analytics Snapshot</h3>
            </div>
            <button
              onClick={() => onNavigate?.('analytics')}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              Open Analytics
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">This Month</p>
                <p className="text-xl font-bold text-gray-900">{monthlyAnalytics.totalThisMonth}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Daily Avg</p>
                <p className="text-xl font-bold text-gray-900">{monthlyAnalytics.dailyAverage}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">High Sev</p>
                <p className="text-xl font-bold text-red-600">{monthlyAnalytics.highSeverity}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">{monthlyAnalytics.monthLabel} status mix</p>
              <div className="space-y-2">
                {[
                  { key: 'pending', label: 'Pending', color: 'bg-orange-500' },
                  { key: 'acknowledged', label: 'Acknowledged', color: 'bg-blue-500' },
                  { key: 'responded', label: 'Responded', color: 'bg-violet-500' },
                  { key: 'resolved', label: 'Resolved', color: 'bg-emerald-500' },
                ].map(item => {
                  const value = monthlyAnalytics.statusCounts[item.key]
                  const total = Math.max(monthlyAnalytics.totalThisMonth, 1)
                  const pct = Math.round((value / total) * 100)

                  return (
                    <div key={item.key}>
                      <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                        <span>{item.label}</span>
                        <span>{value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`${item.color} h-2 rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Top camera hotspots (monthly)</p>
              {monthlyAnalytics.topHotspots.length === 0 ? (
                <p className="text-sm text-gray-500">No monthly incident data yet.</p>
              ) : (
                <div className="space-y-2">
                  {monthlyAnalytics.topHotspots.map((item, idx) => (
                    <div key={`${item.name}-${idx}`} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{item.name}</span>
                      <span className="font-semibold text-gray-900">{item.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="xl:col-span-3 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <i className="fas fa-map-marked-alt text-emerald-600" />
              <h3 className="text-lg font-medium text-gray-900">Camera Location Map Snapshot</h3>
            </div>
            <button
              onClick={() => onNavigate?.('cameraLocations')}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              Open Full Map
            </button>
          </div>

          <div className="p-6">
            {mappedCameraPins.length === 0 ? (
              <div className="h-[320px] rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center text-center px-6">
                <i className="fas fa-map-pin text-2xl text-gray-400 mb-2" />
                <p className="text-sm font-medium text-gray-700">No mapped camera locations yet.</p>
                <p className="text-xs text-gray-500 mt-1">Assign pinpoints in Camera Locations to populate this map.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative z-0 h-[320px] rounded-lg overflow-hidden border border-gray-200">
                  <MapContainer
                    center={locationMapCenter}
                    zoom={13}
                    scrollWheelZoom={false}
                    zoomControl={false}
                    className="h-full w-full z-0"
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {mappedCameraPins.map(camera => {
                      const isTopHotspot = monthlyAnalytics.topHotspotCameraId && camera.id === monthlyAnalytics.topHotspotCameraId
                      return (
                        <Marker
                          key={camera.id}
                          position={[camera.map_latitude, camera.map_longitude]}
                          icon={isTopHotspot ? DASHBOARD_HOTSPOT_ICON : DASHBOARD_CAMERA_ICON}
                          eventHandlers={{
                            click: () => openCameraLiveFeed(camera.id),
                          }}
                        >
                          <Tooltip direction="top" offset={[0, -10]}>{camera.name}</Tooltip>
                          <Popup>
                            <div className="text-sm">
                              <p className="font-semibold text-gray-900">{camera.name}</p>
                              <p className="text-gray-600">{camera.location}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                {camera.map_latitude.toFixed(6)}, {camera.map_longitude.toFixed(6)}
                              </p>
                              <button
                                type="button"
                                onClick={() => openCameraLiveFeed(camera.id)}
                                className="mt-2 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded"
                              >
                                Open Live Feed
                              </button>
                            </div>
                          </Popup>
                        </Marker>
                      )
                    })}
                  </MapContainer>
                </div>
                <p className="text-xs text-gray-500">
                  Showing {mappedCameraPins.length} mapped camera(s). Fire icon marks this month’s top hotspot camera.
                </p>
              </div>
            )}
          </div>
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
                  {selectedCamera.status === 'active' && selectedCamera.rtsp_url && featuredFrame.url ? (
                    <img
                      src={featuredFrame.url}
                      alt={`${selectedCamera.name} live feed`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 px-6 text-center">
                      <i className="fas fa-video-slash text-3xl mb-3" />
                      <p className="font-medium">Live feed unavailable</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {featuredFrame.error || 'Camera is offline, inactive, or has no stream URL.'}
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
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => openCameraLiveFeed(selectedCamera.id)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded"
                  >
                    Open This Camera in Live Feed
                  </button>
                </div>
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
