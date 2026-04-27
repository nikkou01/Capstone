import { useEffect, useMemo, useState } from 'react'
import { fetchCollisions, acknowledgeCollision, updateCollisionStatus, fetchCollisionVideoBlob, simulateCollisionVideo, fetchCameras } from '../api'
import { formatApiDateTime } from '../utils/datetime'
import useAutoRefresh from '../utils/useAutoRefresh'

export default function Collisions({ notify }) {
  const [collisions, setCollisions] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState('all')
  const [loadingVideoId, setLoadingVideoId] = useState('')
  const [statusActionId, setStatusActionId] = useState('')
  const [viewer, setViewer] = useState({ open: false, url: '', collision: null })
  const [viewerPlaybackSecond, setViewerPlaybackSecond] = useState(0)
  const [simOpen, setSimOpen] = useState(false)
  const [simFile, setSimFile] = useState(null)
  const [simRunning, setSimRunning] = useState(false)
  const [simResult, setSimResult] = useState(null)
  const [simCameras, setSimCameras] = useState([])
  const [simCameraId, setSimCameraId] = useState('')

  async function load(options = {}) {
    const background = !!options.background
    if (!background) setLoading(true)
    try {
      setCollisions(await fetchCollisions())
    } catch {
      if (!background) notify('Failed to load collisions.', 'error')
    } finally {
      if (!background) setLoading(false)
    }
  }

  useAutoRefresh(load, { intervalMs: 5000 })

  useEffect(() => {
    return () => {
      if (viewer.url) URL.revokeObjectURL(viewer.url)
    }
  }, [viewer.url])

  async function handleAck(id) {
    try {
      setStatusActionId(id)
      await acknowledgeCollision(id)
      notify('✅ Collision acknowledged.', 'success')
      await load({ background: true })
    } catch {
      notify('Failed to acknowledge collision.', 'error')
    } finally {
      setStatusActionId('')
    }
  }

  async function handleStatusUpdate(id, nextStatus, successMessage) {
    try {
      setStatusActionId(id)
      await updateCollisionStatus(id, nextStatus)
      notify(successMessage, 'success')
      await load({ background: true })
    } catch {
      notify('Failed to update collision status.', 'error')
    } finally {
      setStatusActionId('')
    }
  }

  async function handlePlayVideo(collision) {
    if (!collision?.video_file_id) {
      notify('No collision clip available yet.', 'warning')
      return
    }

    setLoadingVideoId(collision.id)
    setViewerPlaybackSecond(0)
    try {
      const blob = await fetchCollisionVideoBlob(collision.id)
      const url = URL.createObjectURL(blob)
      setViewer(prev => {
        if (prev.url) URL.revokeObjectURL(prev.url)
        return { open: true, url, collision }
      })
    } catch (err) {
      let detail = 'Failed to load collision clip.'
      const payload = err?.response?.data
      if (payload instanceof Blob) {
        try {
          const text = await payload.text()
          const parsed = JSON.parse(text)
          detail = parsed?.detail || detail
        } catch {
          detail = detail
        }
      } else if (err?.response?.data?.detail) {
        detail = err.response.data.detail
      }
      notify(detail, 'error')
    } finally {
      setLoadingVideoId('')
    }
  }

  function closeViewer() {
    setViewerPlaybackSecond(0)
    setViewer(prev => {
      if (prev.url) URL.revokeObjectURL(prev.url)
      return { open: false, url: '', collision: null }
    })
  }

  async function openSimulation() {
    setSimFile(null)
    setSimResult(null)
    setSimOpen(true)

    try {
      const cameraRows = await fetchCameras()
      setSimCameras(cameraRows)
      setSimCameraId(prev => {
        if (prev && cameraRows.some(camera => camera.id === prev)) return prev
        return cameraRows[0]?.id || ''
      })
    } catch {
      setSimCameras([])
      setSimCameraId('')
    }
  }

  function closeSimulation() {
    if (simRunning) return
    setSimOpen(false)
    setSimFile(null)
    setSimResult(null)
  }

  async function runSimulation(e) {
    e.preventDefault()
    if (!simFile) {
      notify('Please choose a video file for simulation.', 'warning')
      return
    }

    setSimRunning(true)
    try {
      const result = await simulateCollisionVideo(simFile, {
        cameraId: simCameraId || undefined,
        createEvent: true,
        sendSms: true,
      })
      setSimResult(result)

      if (result?.detected) {
        const confidenceText = typeof result.confidence === 'number'
          ? `${(result.confidence * 100).toFixed(1)}%`
          : 'N/A'

        if (result?.event_created) {
          notify(
            `Simulation detected (${confidenceText}). SMS sent: ${result.sms_sent || 0}, failed: ${result.sms_failed || 0}.`,
            'success',
          )
          await load({ background: true })
        } else {
          notify(`Simulation detected a collision candidate (${confidenceText}).`, 'success')
        }
      } else {
        notify(result?.detail || 'No collision detected in simulation video.', 'warning')
      }
    } catch (err) {
      notify(err?.response?.data?.detail || 'Failed to run collision simulation.', 'error')
    } finally {
      setSimRunning(false)
    }
  }

  const filtered = useMemo(
    () => (filter === 'all' ? collisions : collisions.filter(c => c.status === filter)),
    [collisions, filter],
  )

  const viewerOverlayData = useMemo(() => {
    const collision = viewer?.collision
    const rawBoxes = Array.isArray(collision?.detection_boxes)
      ? collision.detection_boxes
      : (Array.isArray(collision?.boxes) ? collision.boxes : [])

    const frameWidth = Number(collision?.detection_frame_width || 0)
    const frameHeight = Number(collision?.detection_frame_height || 0)
    const collisionSecondRaw = Number(collision?.video_collision_at_second)
    const collisionSecond = Number.isFinite(collisionSecondRaw) ? collisionSecondRaw : null

    if (!rawBoxes.length || frameWidth <= 0 || frameHeight <= 0 || collisionSecond === null) {
      return {
        available: false,
        show: false,
        boxes: [],
        collisionSecond: null,
      }
    }

    const toleranceSeconds = 0.4
    const show = Math.abs(viewerPlaybackSecond - collisionSecond) <= toleranceSeconds

    const boxes = rawBoxes
      .map((box, index) => {
        const coords = Array.isArray(box?.coords) ? box.coords : []
        if (coords.length !== 4) return null

        const x1 = Number(coords[0])
        const y1 = Number(coords[1])
        const x2 = Number(coords[2])
        const y2 = Number(coords[3])
        if (![x1, y1, x2, y2].every(Number.isFinite)) return null
        if (x2 <= x1 || y2 <= y1) return null

        const left = Math.max(0, Math.min(100, (x1 / frameWidth) * 100))
        const top = Math.max(0, Math.min(100, (y1 / frameHeight) * 100))
        const width = Math.max(0, Math.min(100 - left, ((x2 - x1) / frameWidth) * 100))
        const height = Math.max(0, Math.min(100 - top, ((y2 - y1) / frameHeight) * 100))

        if (width <= 0 || height <= 0) return null

        const className = String(box?.class_name || 'object')
        const confidence = Number(box?.confidence)
        const confidenceText = Number.isFinite(confidence) ? ` ${(confidence * 100).toFixed(0)}%` : ''
        const trackText = Number.isFinite(Number(box?.track_id)) ? ` #T${Number(box.track_id)}` : ''

        return {
          key: `${className}-${index}`,
          left,
          top,
          width,
          height,
          label: `${className}${confidenceText}${trackText}`,
        }
      })
      .filter(Boolean)

    return {
      available: boxes.length > 0,
      show: show && boxes.length > 0,
      boxes,
      collisionSecond,
    }
  }, [viewer, viewerPlaybackSecond])

  const severityColor = {
    high:   'bg-red-100 text-red-800',
    medium: 'bg-orange-100 text-orange-800',
    low:    'bg-yellow-100 text-yellow-800',
  }
  const statusColor = {
    pending:      'bg-orange-100 text-orange-800',
    acknowledged: 'bg-blue-100 text-blue-800',
    responded:    'bg-purple-100 text-purple-800',
    resolved:     'bg-green-100 text-green-800',
  }
  const clipStatusColor = {
    ready: 'bg-green-100 text-green-800',
    processing: 'bg-blue-100 text-blue-800',
    failed: 'bg-red-100 text-red-800',
    missing: 'bg-gray-100 text-gray-600',
  }

  function renderStatusAudit(collision) {
    const status = String(collision?.status || '').toLowerCase()

    if (status === 'acknowledged' && collision?.acknowledged_by) {
      const at = collision?.acknowledged_at ? formatApiDateTime(collision.acknowledged_at) : 'N/A'
      return `Acknowledged by ${collision.acknowledged_by} at ${at}`
    }

    if (status === 'responded' && (collision?.responded_by || collision?.acknowledged_by)) {
      const actor = collision?.responded_by || collision?.acknowledged_by
      const atValue = collision?.responded_at || collision?.acknowledged_at
      const at = atValue ? formatApiDateTime(atValue) : 'N/A'
      return `Responded by ${actor} at ${at}`
    }

    if (status === 'resolved' && (collision?.resolved_by || collision?.responded_by || collision?.acknowledged_by)) {
      const actor = collision?.resolved_by || collision?.responded_by || collision?.acknowledged_by
      const atValue = collision?.resolved_at || collision?.responded_at || collision?.acknowledged_at
      const at = atValue ? formatApiDateTime(atValue) : 'N/A'
      return `Resolved by ${actor} at ${at}`
    }

    return ''
  }

  return (
    <>
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-medium text-gray-900">Collision Detection Logs</h3>
        <div className="flex space-x-2">
          <button
            onClick={openSimulation}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium"
          >
            <i className="fas fa-film mr-1" />
            Collision Simulation
          </button>
          {['all', 'pending', 'acknowledged', 'responded', 'resolved'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors
                ${filter === f ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f}
            </button>
          ))}
          <button onClick={() => load()} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs">
            <i className="fas fa-sync-alt" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <i className="fas fa-spinner fa-spin text-emerald-500 text-2xl" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <i className="fas fa-check-circle text-4xl mb-3 block text-green-300" />
          No {filter !== 'all' ? filter : ''} collision events.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Camera', 'Location', 'Time', 'Confidence', 'Severity', 'Status', 'Clip', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.camera_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{c.camera_location}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {formatApiDateTime(c.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-red-600">
                    {(c.confidence_score * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${severityColor[c.severity] || 'bg-gray-100 text-gray-600'}`}>
                      {c.severity || 'N/A'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${statusColor[c.status] || 'bg-gray-100 text-gray-600'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {c.video_file_id ? (
                      <div className="space-y-1">
                        <button
                          onClick={() => handlePlayVideo(c)}
                          disabled={loadingVideoId === c.id}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-full disabled:opacity-60"
                        >
                          {loadingVideoId === c.id ? 'Loading clip...' : 'Play 15s Clip'}
                        </button>
                        <div className="text-xs text-gray-500">
                          {c.video_pre_event_seconds || 0}s before + {c.video_post_event_seconds || 0}s after
                        </div>
                        {c.video_public_url && (
                          <a
                            href={c.video_public_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block text-xs text-indigo-600 hover:underline break-all"
                            title={c.video_public_url}
                          >
                            Public clip URL
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span
                          title={c.video_error || ''}
                          className={`inline-block px-2 py-1 text-xs rounded-full font-medium ${clipStatusColor[c.video_status || 'missing'] || clipStatusColor.missing}`}
                        >
                          {c.video_status || 'missing'}
                        </span>
                        {c.video_error && (
                          <div className="text-xs text-red-600 max-w-[220px] truncate" title={c.video_error}>
                            {c.video_error}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {c.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleAck(c.id)}
                            disabled={statusActionId === c.id}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-full disabled:opacity-60"
                          >
                            {statusActionId === c.id ? 'Updating...' : 'Acknowledge'}
                          </button>
                          <button
                            onClick={() => handleStatusUpdate(c.id, 'resolved', 'False alarm marked as resolved.')}
                            disabled={statusActionId === c.id}
                            className="px-3 py-1 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 text-xs rounded-full disabled:opacity-60"
                          >
                            Decline (False Alarm)
                          </button>
                        </>
                      )}

                      {c.status === 'acknowledged' && (
                        <button
                          onClick={() => handleStatusUpdate(c.id, 'responded', 'Responder action logged.')}
                          disabled={statusActionId === c.id}
                          className="px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white text-xs rounded-full disabled:opacity-60"
                        >
                          {statusActionId === c.id ? 'Updating...' : 'Mark Responded'}
                        </button>
                      )}

                      {c.status === 'responded' && (
                        <button
                          onClick={() => handleStatusUpdate(c.id, 'resolved', 'Collision marked as resolved.')}
                          disabled={statusActionId === c.id}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-full disabled:opacity-60"
                        >
                          {statusActionId === c.id ? 'Updating...' : 'Mark Resolved'}
                        </button>
                      )}

                      {c.status === 'resolved' && (
                        <span className="text-xs text-emerald-700 font-medium">Resolved</span>
                      )}

                      {c.status !== 'pending' && (
                        <span className="text-xs text-gray-500">
                          {renderStatusAudit(c) || '—'}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {viewer.open && viewer.collision && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h4 className="text-base font-semibold text-gray-900">
              Collision Clip - {viewer.collision.camera_name}
            </h4>
            <button
              onClick={closeViewer}
              className="text-gray-500 hover:text-gray-700"
              aria-label="Close collision clip viewer"
            >
              <i className="fas fa-times" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div className="relative w-full rounded-lg overflow-hidden bg-black">
              <video
                controls
                autoPlay
                className="w-full max-h-[60vh] rounded-lg bg-black block"
                src={viewer.url}
                onTimeUpdate={event => setViewerPlaybackSecond(event.currentTarget.currentTime || 0)}
                onLoadedMetadata={event => setViewerPlaybackSecond(event.currentTarget.currentTime || 0)}
                onSeeked={event => setViewerPlaybackSecond(event.currentTarget.currentTime || 0)}
              />

              {viewerOverlayData.show && (
                <div className="pointer-events-none absolute inset-0">
                  {viewerOverlayData.boxes.map(box => (
                    <div
                      key={box.key}
                      className="absolute border-2 border-red-500 shadow-[0_0_0_1px_rgba(255,255,255,0.45)]"
                      style={{
                        left: `${box.left}%`,
                        top: `${box.top}%`,
                        width: `${box.width}%`,
                        height: `${box.height}%`,
                      }}
                    >
                      <span className="absolute -top-6 left-0 bg-red-600/95 text-white px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap">
                        {box.label}
                      </span>
                    </div>
                  ))}
                  <div className="absolute left-3 top-3 px-2 py-1 rounded text-xs font-semibold bg-red-600/90 text-white">
                    Collision Moment
                  </div>
                </div>
              )}
            </div>

            {viewerOverlayData.available && (
              <p className="text-xs text-gray-600">
                Bounding boxes are shown near {viewerOverlayData.collisionSecond?.toFixed(2)}s when the collision is detected.
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-gray-500 text-xs">Collision Time</p>
                <p className="font-medium text-gray-900">{formatApiDateTime(viewer.collision.timestamp)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-gray-500 text-xs">Clip Window</p>
                <p className="font-medium text-gray-900">
                  {viewer.collision.video_pre_event_seconds || 0}s before, {viewer.collision.video_post_event_seconds || 0}s after
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-gray-500 text-xs">Duration</p>
                <p className="font-medium text-gray-900">{viewer.collision.video_duration_seconds || 15}s</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-gray-500 text-xs">Overlay Data</p>
                <p className="font-medium text-gray-900">
                  {viewerOverlayData.available
                    ? `${viewerOverlayData.boxes.length} box(es)`
                    : 'Unavailable'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

    {simOpen && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h4 className="text-base font-semibold text-gray-900">Collision Simulation</h4>
            <button
              onClick={closeSimulation}
              disabled={simRunning}
              className="text-gray-500 hover:text-gray-700 disabled:opacity-40"
              aria-label="Close simulation dialog"
            >
              <i className="fas fa-times" />
            </button>
          </div>

          <form onSubmit={runSimulation} className="p-5 space-y-4">
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 text-sm text-indigo-900">
              Upload a video clip to run simulation. If a collision is detected, the system creates a collision log, stores replay,
              and sends SMS alerts with replay link.
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Camera Context (optional)
              </label>
              <select
                value={simCameraId}
                onChange={e => setSimCameraId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">Simulation Upload (no camera selected)</option>
                {simCameras.map(camera => (
                  <option key={camera.id} value={camera.id}>{camera.name} - {camera.location}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Simulation Video File
              </label>
              <input
                type="file"
                accept="video/*"
                onChange={e => setSimFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-gray-700 file:mr-3 file:px-3 file:py-2 file:border file:border-gray-300 file:rounded-md file:bg-white file:text-gray-700 file:text-sm file:cursor-pointer"
              />
              {simFile && (
                <p className="text-xs text-gray-500 mt-2">
                  {simFile.name} • {(simFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              )}
            </div>

            {simResult && (
              <div className={`rounded-lg border p-4 text-sm ${simResult.detected ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                <p className="font-semibold text-gray-900 mb-2">
                  Result: {simResult.detected ? 'Collision candidate detected' : 'No collision detected'}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-gray-700">
                  <p>File: {simResult.filename || 'N/A'}</p>
                  <p>Analyzed frames: {simResult.analyzed_frames ?? 0}</p>
                  <p>Sampling stride: every {simResult.sampled_every_n_frames || 1} frame(s)</p>
                  <p>Video duration: {simResult.duration_seconds ?? 'N/A'}s</p>
                  {simResult.detected && (
                    <>
                      <p>Class: {simResult.class_name || 'N/A'}</p>
                      <p>Confidence: {typeof simResult.confidence === 'number' ? `${(simResult.confidence * 100).toFixed(1)}%` : 'N/A'}</p>
                      <p>Collision second: {typeof simResult.video_collision_at_second === 'number' ? simResult.video_collision_at_second.toFixed(2) : (typeof simResult.detected_at_second === 'number' ? simResult.detected_at_second.toFixed(2) : 'N/A')}s</p>
                      <p>Detection boxes: {Array.isArray(simResult.detection_boxes) ? simResult.detection_boxes.length : (Array.isArray(simResult.boxes) ? simResult.boxes.length : 0)}</p>
                    </>
                  )}
                </div>
                {simResult?.event_created && (
                  <div className="mt-3 space-y-1 text-gray-700">
                    <p>Collision ID: {simResult.collision_id || 'N/A'}</p>
                    <p>SMS recipients: {simResult.sms_total_recipients || 0} (sent {simResult.sms_sent || 0}, failed {simResult.sms_failed || 0})</p>
                    <p>
                      Camera: {simResult.camera_name || 'Simulation Upload'}
                      {simResult.camera_location ? ` (${simResult.camera_location})` : ''}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {simResult.collision_id && simResult.video_file_id && (
                        <button
                          type="button"
                          onClick={() => handlePlayVideo({
                            id: simResult.collision_id,
                            video_file_id: simResult.video_file_id,
                            camera_name: simResult.camera_name || 'Simulation Upload',
                            timestamp: simResult.timestamp || new Date().toISOString(),
                            video_pre_event_seconds: Number(simResult.video_pre_event_seconds || 0),
                            video_post_event_seconds: Number(simResult.video_post_event_seconds || 0),
                            video_duration_seconds: Number(simResult.video_duration_seconds || simResult.duration_seconds || 0),
                            video_collision_at_second: Number(simResult.video_collision_at_second || simResult.detected_at_second || 0),
                            detection_boxes: Array.isArray(simResult.detection_boxes)
                              ? simResult.detection_boxes
                              : (Array.isArray(simResult.boxes) ? simResult.boxes : []),
                            detection_frame_width: Number(simResult.detection_frame_width || 0),
                            detection_frame_height: Number(simResult.detection_frame_height || 0),
                          })}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-full"
                        >
                          Play Stored Replay
                        </button>
                      )}
                      {simResult.video_public_url && (
                        <a
                          href={simResult.video_public_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1 border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs rounded-full"
                        >
                          Open Public Replay Link
                        </a>
                      )}
                    </div>
                  </div>
                )}
                {!simResult.detected && simResult.detail && (
                  <p className="mt-2 text-gray-600">{simResult.detail}</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeSimulation}
                disabled={simRunning}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={simRunning || !simFile}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {simRunning ? 'Running Simulation...' : 'Run Simulation'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  )
}
