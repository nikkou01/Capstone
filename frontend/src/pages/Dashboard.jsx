import { useEffect, useState } from 'react'
import { fetchStats, fetchCollisions } from '../api'

function StatCard({ icon, iconBg, iconColor, label, value, sub, subColor }) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 card-hover">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          <p className={`text-sm ${subColor}`}>{sub}</p>
        </div>
        <div className={`p-3 ${iconBg} rounded-full`}>
          <i className={`fas ${icon} ${iconColor} text-xl`} />
        </div>
      </div>
    </div>
  )
}

export default function Dashboard({ notify }) {
  const [stats,      setStats]      = useState(null)
  const [collisions, setCollisions] = useState([])
  const [loading,    setLoading]    = useState(true)

  async function load() {
    try {
      const [s, c] = await Promise.all([fetchStats(), fetchCollisions()])
      setStats(s)
      setCollisions(c.slice(0, 5))
    } catch {
      notify('Failed to load dashboard data.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleAck(id) {
    const { acknowledgeCollision } = await import('../api')
    try {
      await acknowledgeCollision(id)
      notify('✅ Event acknowledged.', 'success')
      load()
    } catch {
      notify('Failed to acknowledge.', 'error')
    }
  }

  const pending = collisions.filter(c => c.status === 'pending')

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <i className="fas fa-spinner fa-spin text-emerald-500 text-3xl" />
    </div>
  )

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard icon="fa-video"               iconBg="bg-blue-50"   iconColor="text-blue-600"
          label="Active Cameras"   value={stats?.active_cameras   ?? 0}
          sub="All systems operational"    subColor="text-green-600" />
        <StatCard icon="fa-exclamation-triangle" iconBg="bg-red-50"    iconColor="text-red-600"
          label="Total Collisions"  value={stats?.total_collisions ?? 0}
          sub={`${stats?.pending_collisions ?? 0} unacknowledged`} subColor="text-orange-600" />
        <StatCard icon="fa-sms"                  iconBg="bg-green-50"  iconColor="text-green-600"
          label="SMS Alerts Sent"  value={stats?.total_alerts     ?? 0}
          sub="Notifications active"       subColor="text-blue-600" />
        <StatCard icon="fa-bell"                 iconBg="bg-yellow-50" iconColor="text-yellow-600"
          label="Pending Alerts"   value={stats?.pending_collisions ?? 0}
          sub={stats?.pending_collisions ? 'Requires attention' : 'All clear'}
          subColor={stats?.pending_collisions ? 'text-red-600' : 'text-green-600'} />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live feed placeholder */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center space-x-2">
            <i className="fas fa-eye text-green-500" />
            <h3 className="text-lg font-medium text-gray-900">Live Camera Feeds</h3>
          </div>
          <div className="p-6">
            <div className="bg-gray-900 rounded-lg p-8 text-center relative overflow-hidden">
              <div className="absolute top-3 left-3">
                <span className="px-2 py-1 bg-red-500 text-white text-xs rounded-full">
                  <i className="fas fa-circle animate-pulse mr-1" />LIVE
                </span>
              </div>
              <i className="fas fa-video text-gray-600 text-4xl mb-4 block" />
              <h4 className="text-white font-medium mb-2">RTSP Stream</h4>
              <p className="text-gray-400 text-sm">
                {stats?.active_cameras
                  ? `${stats.active_cameras} camera(s) active`
                  : 'No cameras configured'}
              </p>
            </div>
          </div>
        </div>

        {/* Recent collisions */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center space-x-2">
            <i className="fas fa-exclamation-triangle text-orange-500" />
            <h3 className="text-lg font-medium text-gray-900">Recent Collision Events</h3>
          </div>
          <div className="p-6 space-y-3 max-h-72 overflow-y-auto">
            {collisions.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">No collision events yet.</p>
            )}
            {collisions.map(c => (
              <div key={c.id}
                className={`flex items-center justify-between p-3 rounded-lg border
                  ${c.status === 'pending'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-green-50 border-green-200'}`}>
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${c.status === 'pending' ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{c.camera_name}</p>
                    <p className="text-xs text-gray-500">{c.camera_location} • {new Date(c.timestamp).toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Confidence: <span className="font-medium text-red-600">{(c.confidence_score * 100).toFixed(1)}%</span></p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 text-xs rounded-full
                    ${c.status === 'pending' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                    {c.status}
                  </span>
                  {c.status === 'pending' && (
                    <button onClick={() => handleAck(c.id)}
                      className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-full">
                      Ack
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {pending.length > 0 && (
            <div className="mx-6 mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-center space-x-2 text-yellow-800">
                <i className="fas fa-exclamation-triangle" />
                <p className="text-sm font-medium">
                  {pending.length} unacknowledged collision event(s) require attention.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
