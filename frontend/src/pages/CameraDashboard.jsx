import { useEffect, useMemo, useState } from 'react'
import { buildCameraStreamUrl, fetchCameras, fetchCollisions } from '../api'
import useAutoRefresh from '../utils/useAutoRefresh'

function statusBadgeClass(status) {
  if (status === 'active') return 'bg-green-100 text-green-800'
  if (status === 'maintenance') return 'bg-yellow-100 text-yellow-800'
  if (status === 'failed') return 'bg-red-100 text-red-800'
  if (status === 'error') return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-700'
}

function StatTile({ icon, label, value, hint, tone = 'text-gray-900', iconBg = 'bg-gray-100', iconColor = 'text-gray-700' }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 card-hover">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
          <p className="text-xs text-gray-500 mt-1">{hint}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center`}>
          <i className={`fas ${icon}`} />
        </div>
      </div>
    </div>
  )
}

export default function CameraDashboard({ user, notify, onNavigate, navigationState }) {
  const [cameras, setCameras] = useState([])
  const [collisions, setCollisions] = useState([])
  const [loading, setLoading] = useState(true)
  const [streamErrors, setStreamErrors] = useState({})
  const [streamConnected, setStreamConnected] = useState({})
  const [streamEverConnected, setStreamEverConnected] = useState({})
  const [fullscreenCameraId, setFullscreenCameraId] = useState(null)
  const [isWallFullscreen, setIsWallFullscreen] = useState(false)

  const requestedCameraId = navigationState?.cameraId ? String(navigationState.cameraId) : ''

  const streamToken = useMemo(() => localStorage.getItem('token') || '', [])
  const isCaptain = String(user?.role || '').toLowerCase() === 'captain'

  const streamableCameras = useMemo(
    () => cameras.filter(camera => camera.status === 'active' && camera.rtsp_url),
    [cameras],
  )
  const mappedCameras = useMemo(
    () => cameras.filter(camera => Number.isFinite(camera.map_latitude) && Number.isFinite(camera.map_longitude)).length,
    [cameras],
  )
  const failedCameras = useMemo(
    () => cameras.filter(camera => camera.status === 'failed' || camera.status === 'error').length,
    [cameras],
  )
  const inactiveCameras = useMemo(
    () => cameras.filter(camera => camera.status === 'inactive' || camera.status === 'maintenance').length,
    [cameras],
  )

  const hotspot = useMemo(() => {
    if (!collisions.length) return null

    const byCamera = {}
    for (const collision of collisions) {
      const key = collision.camera_name || 'Unknown camera'
      byCamera[key] = (byCamera[key] || 0) + 1
    }

    const [name, count] = Object.entries(byCamera).sort((a, b) => b[1] - a[1])[0]
    return { name, count }
  }, [collisions])

  const fullscreenCamera = useMemo(
    () => cameras.find(camera => camera.id === fullscreenCameraId) || null,
    [cameras, fullscreenCameraId],
  )

  const isFullscreenOpen = isWallFullscreen || !!fullscreenCameraId

  const fullscreenGridColumns = useMemo(() => {
    const count = Math.max(cameras.length, 1)
    if (count <= 1) return 1
    if (count <= 4) return 2
    if (count <= 9) return 3
    return 4
  }, [cameras.length])

  async function load(options = {}) {
    const background = !!options.background
    try {
      const [cameraDocs, collisionDocs] = await Promise.all([fetchCameras(), fetchCollisions()])
      setCameras(cameraDocs)
      setCollisions(collisionDocs)
    } catch {
      if (!background) notify('Failed to load camera dashboard data.', 'error')
    } finally {
      if (!background) setLoading(false)
    }
  }

  useAutoRefresh(load, { intervalMs: 4000 })

  useEffect(() => {
    const streamableIds = new Set(streamableCameras.map(camera => camera.id))

    setStreamErrors(prev => {
      const next = {}
      for (const [cameraId, message] of Object.entries(prev)) {
        if (streamableIds.has(cameraId)) next[cameraId] = message
      }
      return next
    })

    setStreamConnected(prev => {
      const next = {}
      for (const [cameraId, isConnected] of Object.entries(prev)) {
        if (streamableIds.has(cameraId)) next[cameraId] = isConnected
      }
      return next
    })

    setStreamEverConnected(prev => {
      const next = {}
      for (const [cameraId, hasConnected] of Object.entries(prev)) {
        if (streamableIds.has(cameraId)) next[cameraId] = hasConnected
      }
      return next
    })
  }, [streamableCameras])

  useEffect(() => {
    if (!isFullscreenOpen) return

    const onKeyDown = event => {
      if (event.key === 'Escape') {
        setIsWallFullscreen(false)
        setFullscreenCameraId(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isFullscreenOpen])

  useEffect(() => {
    if (fullscreenCameraId && !cameras.some(camera => camera.id === fullscreenCameraId)) {
      setFullscreenCameraId(null)
    }
  }, [cameras, fullscreenCameraId])

  useEffect(() => {
    if (!requestedCameraId) return

    const exists = cameras.some(camera => camera.id === requestedCameraId)
    if (exists) {
      setIsWallFullscreen(false)
      setFullscreenCameraId(requestedCameraId)
    }
  }, [requestedCameraId, cameras])

  function openCameraFullscreen(cameraId) {
    setIsWallFullscreen(false)
    setFullscreenCameraId(cameraId)
  }

  function openWallFullscreen() {
    setFullscreenCameraId(null)
    setIsWallFullscreen(true)
  }

  function closeFullscreen() {
    setIsWallFullscreen(false)
    setFullscreenCameraId(null)
  }

  function renderStreamSurface(camera, mode = 'card') {
    const canStream = camera.status === 'active' && camera.rtsp_url
    const streamError = streamErrors[camera.id]
    const streamUrl = canStream ? buildCameraStreamUrl(camera.id, streamToken) : ''

    const frameClass = mode === 'card' ? 'aspect-video bg-gray-900' : 'h-full bg-black'
    const messageClass =
      mode === 'card'
        ? 'w-full h-full flex items-center justify-center text-gray-300 text-sm px-4 text-center'
        : 'w-full h-full flex items-center justify-center text-gray-300 text-xs px-3 text-center'

    return (
      <div className={frameClass}>
        {canStream && !streamError ? (
          <img
            src={streamUrl}
            alt={`${camera.name} live`}
            className="w-full h-full object-cover"
            onError={() => {
              setStreamErrors(prev => ({ ...prev, [camera.id]: 'Live stream unavailable for this camera.' }))
              setStreamConnected(prev => ({ ...prev, [camera.id]: false }))
            }}
            onLoad={() => {
              setStreamErrors(prev => {
                if (!prev[camera.id]) return prev
                const next = { ...prev }
                delete next[camera.id]
                return next
              })
              setStreamConnected(prev => ({ ...prev, [camera.id]: true }))
              setStreamEverConnected(prev => ({ ...prev, [camera.id]: true }))
            }}
          />
        ) : (
          <div className={messageClass}>
            {streamError || (canStream ? 'Opening live stream...' : 'Live output unavailable for this camera.')}
          </div>
        )}
      </div>
    )
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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatTile
          icon="fa-video"
          label="Total Cameras"
          value={cameras.length}
          hint="All configured camera units"
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatTile
          icon="fa-broadcast-tower"
          label="Live Ready"
          value={streamableCameras.length}
          hint="Active with private stream source"
          tone="text-emerald-700"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatTile
          icon="fa-map-marker-alt"
          label="Mapped"
          value={mappedCameras}
          hint="Placed on location map"
          tone="text-cyan-700"
          iconBg="bg-cyan-50"
          iconColor="text-cyan-600"
        />
        <StatTile
          icon="fa-triangle-exclamation"
          label="Failed"
          value={failedCameras}
          hint="Needs reconnect or review"
          tone="text-red-700"
          iconBg="bg-red-50"
          iconColor="text-red-600"
        />
        <StatTile
          icon="fa-fire"
          label="Top Hotspot"
          value={hotspot?.name || 'N/A'}
          hint={hotspot ? `${hotspot.count} incident(s)` : 'No collisions yet'}
          tone="text-orange-700"
          iconBg="bg-orange-50"
          iconColor="text-orange-600"
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center space-x-2">
            <i className="fas fa-th-large text-blue-500" />
            <h3 className="text-lg font-medium text-gray-900">All CCTV Live Output</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{streamableCameras.length} live / {cameras.length} total</span>
            <button
              type="button"
              onClick={openWallFullscreen}
              className="px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
            >
              <i className="fas fa-expand mr-1" />
              Fullscreen Wall
            </button>
            <button
              onClick={() => onNavigate?.('cameraLocations')}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              Open Map
            </button>
            {isCaptain && (
              <button
                onClick={() => onNavigate?.('cameras')}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
              >
                Manage Cameras
              </button>
            )}
          </div>
        </div>

        <div className="p-6">
          {cameras.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <i className="fas fa-video text-3xl mb-2 block text-gray-300" />
              No cameras configured yet.
            </div>
          ) : (
            <>
              {(failedCameras > 0 || inactiveCameras > 0) && (
                <div className="mb-4 p-3 rounded-lg border border-yellow-200 bg-yellow-50 text-sm text-yellow-900">
                  {failedCameras > 0 && <p>{failedCameras} camera(s) are in failed/error state.</p>}
                  {inactiveCameras > 0 && <p>{inactiveCameras} camera(s) are inactive or under maintenance.</p>}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {cameras.map(camera => {
                  const canStream = camera.status === 'active' && camera.rtsp_url
                  const isConnected = !!streamConnected[camera.id]
                  const hasConnectedBefore = !!streamEverConnected[camera.id]

                  return (
                    <div key={camera.id} className="rounded-lg border border-gray-200 overflow-hidden bg-white">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{camera.name}</p>
                          <p className="text-xs text-gray-500">{camera.location}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {canStream && (
                            <span
                              className={`px-2 py-1 text-[10px] rounded-full font-semibold uppercase tracking-wide ${
                                isConnected
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : hasConnectedBefore
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {isConnected ? 'Connected' : hasConnectedBefore ? 'Reconnecting' : 'Connecting'}
                            </span>
                          )}
                          <span className={`px-2 py-1 text-xs rounded-full font-medium ${statusBadgeClass(camera.status)}`}>
                            {camera.status}
                          </span>
                          <button
                            type="button"
                            onClick={() => openCameraFullscreen(camera.id)}
                            className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                            title={`Fullscreen ${camera.name}`}
                          >
                            <i className="fas fa-expand text-[11px]" />
                          </button>
                        </div>
                      </div>

                      {renderStreamSurface(camera, 'card')}

                      <div className="px-4 py-3 text-xs text-gray-500 space-y-1">
                        <p>Stream source: {camera.rtsp_url ? 'Configured (private)' : 'Not configured'}</p>
                        <p>{camera.description || 'No description provided.'}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {isFullscreenOpen && (
        <div className="fixed inset-0 z-50 bg-black">
          <div className="h-full flex flex-col">
            <div className="px-4 py-3 border-b border-gray-700 bg-black/90 flex items-center justify-between gap-3">
              <div className="text-white min-w-0">
                <p className="text-sm font-semibold truncate">
                  {isWallFullscreen
                    ? 'All Cameras Fullscreen Wall'
                    : `${fullscreenCamera?.name || 'Camera'} Fullscreen`}
                </p>
                <p className="text-xs text-gray-300">
                  Press ESC to close fullscreen.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {!isWallFullscreen && (
                  <button
                    type="button"
                    onClick={openWallFullscreen}
                    className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                  >
                    <i className="fas fa-th mr-1" />
                    Wall View
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeFullscreen}
                  className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium"
                >
                  <i className="fas fa-compress mr-1" />
                  Exit
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 p-2">
              {isWallFullscreen ? (
                cameras.length ? (
                  <div
                    className="grid h-full gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${fullscreenGridColumns}, minmax(0, 1fr))`,
                      gridAutoRows: 'minmax(0, 1fr)',
                    }}
                  >
                    {cameras.map(camera => (
                      <div key={`fullscreen-${camera.id}`} className="relative min-h-0 rounded-md border border-gray-700 overflow-hidden bg-black">
                        {renderStreamSurface(camera, 'fullscreen')}

                        <div className="absolute top-2 left-2 max-w-[78%] px-2 py-1 rounded bg-black/65 text-white text-[11px] truncate">
                          {camera.name}
                        </div>

                        <button
                          type="button"
                          onClick={() => openCameraFullscreen(camera.id)}
                          className="absolute top-2 right-2 w-7 h-7 rounded bg-black/65 hover:bg-black/80 text-white"
                          title={`Focus ${camera.name}`}
                        >
                          <i className="fas fa-expand text-[11px]" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full rounded-lg border border-gray-700 bg-black text-gray-300 flex items-center justify-center text-sm">
                    No cameras available for fullscreen wall.
                  </div>
                )
              ) : fullscreenCamera ? (
                <div className="h-full rounded-lg border border-gray-700 overflow-hidden bg-black relative">
                  {renderStreamSurface(fullscreenCamera, 'fullscreen')}
                  <div className="absolute left-3 bottom-3 px-3 py-1.5 rounded bg-black/65 text-white text-xs max-w-[85%] truncate">
                    {fullscreenCamera.name} • {fullscreenCamera.location}
                  </div>
                </div>
              ) : (
                <div className="h-full rounded-lg border border-gray-700 bg-black text-gray-300 flex items-center justify-center text-sm">
                  Selected camera is unavailable.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
