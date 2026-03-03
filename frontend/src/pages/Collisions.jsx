import { useEffect, useState } from 'react'
import { fetchCollisions, acknowledgeCollision } from '../api'

export default function Collisions({ notify }) {
  const [collisions, setCollisions] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState('all')

  async function load() {
    try {
      setCollisions(await fetchCollisions())
    } catch {
      notify('Failed to load collisions.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleAck(id) {
    try {
      await acknowledgeCollision(id)
      notify('✅ Collision acknowledged.', 'success')
      load()
    } catch {
      notify('Failed to acknowledge collision.', 'error')
    }
  }

  const filtered = filter === 'all' ? collisions : collisions.filter(c => c.status === filter)

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

  return (
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
                {['Camera', 'Location', 'Time', 'Confidence', 'Severity', 'Status', 'Actions'].map(h => (
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
  )
}
