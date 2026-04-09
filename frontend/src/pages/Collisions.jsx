import { useEffect, useMemo, useState } from 'react'
import { fetchCollisions, acknowledgeCollision, fetchCollisionVideoBlob } from '../api'

export default function Collisions({ notify }) {
  const [collisions, setCollisions] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState('all')
  const [loadingVideoId, setLoadingVideoId] = useState('')
  const [viewer, setViewer] = useState({ open: false, url: '', collision: null })

  async function load() {
    setLoading(true)
    try {
      setCollisions(await fetchCollisions())
    } catch {
      notify('Failed to load collisions.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    return () => {
      if (viewer.url) URL.revokeObjectURL(viewer.url)
    }
  }, [viewer.url])

  async function handleAck(id) {
    try {
      await acknowledgeCollision(id)
      notify('✅ Collision acknowledged.', 'success')
      load()
    } catch {
      notify('Failed to acknowledge collision.', 'error')
    }
  }

  async function handlePlayVideo(collision) {
    if (!collision?.video_file_id) {
      notify('No collision clip available yet.', 'warning')
      return
    }

    setLoadingVideoId(collision.id)
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
    setViewer(prev => {
      if (prev.url) URL.revokeObjectURL(prev.url)
      return { open: false, url: '', collision: null }
    })
  }

  const filtered = useMemo(
    () => (filter === 'all' ? collisions : collisions.filter(c => c.status === filter)),
    [collisions, filter],
  )

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

  return (
    <>
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-medium text-gray-900">Collision Detection Logs</h3>
        <div className="flex space-x-2">
          {['all', 'pending', 'acknowledged', 'resolved'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors
                ${filter === f ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f}
            </button>
          ))}
          <button onClick={load} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs">
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
                    {new Date(c.timestamp).toLocaleString()}
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
                    {c.status === 'pending' && (
                      <button onClick={() => handleAck(c.id)}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-full">
                        Acknowledge
                      </button>
                    )}
                    {c.status !== 'pending' && (
                      <span className="text-xs text-gray-400">
                        {c.acknowledged_by ? `By ${c.acknowledged_by}` : '—'}
                      </span>
                    )}
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
            <video
              controls
              autoPlay
              className="w-full max-h-[60vh] rounded-lg bg-black"
              src={viewer.url}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-gray-500 text-xs">Collision Time</p>
                <p className="font-medium text-gray-900">{new Date(viewer.collision.timestamp).toLocaleString()}</p>
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
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
