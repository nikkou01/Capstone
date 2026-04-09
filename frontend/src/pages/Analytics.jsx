import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { fetchCollisions, fetchCameras } from '../api'

const SEVERITY_COLORS = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
}

const STATUS_COLORS = {
  pending: '#f97316',
  acknowledged: '#3b82f6',
  responded: '#8b5cf6',
  resolved: '#10b981',
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function StatCard({ icon, iconBg, iconColor, label, value, hint, hintColor = 'text-gray-500' }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 card-hover">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          <p className={`text-sm mt-1 ${hintColor}`}>{hint}</p>
        </div>
        <div className={`p-3 rounded-full ${iconBg}`}>
          <i className={`fas ${icon} text-lg ${iconColor}`} />
        </div>
      </div>
    </div>
  )
}

function EmptyChart({ message }) {
  return (
    <div className="h-72 flex items-center justify-center text-gray-500 text-sm bg-gray-50 rounded-lg border border-dashed border-gray-300">
      {message}
    </div>
  )
}

export default function Analytics({ notify }) {
  const [collisions, setCollisions] = useState([])
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const [collisionDocs, cameraDocs] = await Promise.all([fetchCollisions(), fetchCameras()])
      setCollisions(collisionDocs)
      setCameras(cameraDocs)
    } catch {
      notify('Failed to load analytics data.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const analytics = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const daysInMonth = monthEnd.getDate()
    const elapsedDays = Math.max(now.getDate(), 1)

    const cameraIndex = new Map(cameras.map(cam => [cam.id, cam]))

    const monthlyCollisions = collisions.filter(collision => {
      const stamp = new Date(collision.timestamp)
      if (Number.isNaN(stamp.getTime())) return false
      return stamp >= monthStart && stamp <= now
    })

    const dailyCounts = Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      collisions: 0,
    }))

    monthlyCollisions.forEach(collision => {
      const stamp = new Date(collision.timestamp)
      const dayIdx = stamp.getDate() - 1
      if (dayIdx >= 0 && dayIdx < dailyCounts.length) {
        dailyCounts[dayIdx].collisions += 1
      }
    })

    const peakDay = dailyCounts.reduce(
      (best, dayItem) => (dayItem.collisions > best.collisions ? dayItem : best),
      { day: 1, collisions: 0 },
    )

    const severityCounts = { high: 0, medium: 0, low: 0 }
    const statusCounts = { pending: 0, acknowledged: 0, responded: 0, resolved: 0 }
    const cameraCounts = new Map()

    monthlyCollisions.forEach(collision => {
      const severityKey = String(collision.severity || 'medium').toLowerCase()
      if (severityCounts[severityKey] !== undefined) severityCounts[severityKey] += 1
      else severityCounts.medium += 1

      const statusKey = String(collision.status || 'pending').toLowerCase()
      if (statusCounts[statusKey] !== undefined) statusCounts[statusKey] += 1

      const cameraId = collision.camera_id || collision.id || 'unknown'
      const knownCamera = cameraIndex.get(cameraId)
      const cameraName = knownCamera?.name || collision.camera_name || 'Unknown Camera'

      if (!cameraCounts.has(cameraId)) {
        cameraCounts.set(cameraId, { name: cameraName, collisions: 0 })
      }
      cameraCounts.get(cameraId).collisions += 1
    })

    const severityData = [
      { name: 'High', value: severityCounts.high, color: SEVERITY_COLORS.high },
      { name: 'Medium', value: severityCounts.medium, color: SEVERITY_COLORS.medium },
      { name: 'Low', value: severityCounts.low, color: SEVERITY_COLORS.low },
    ].filter(item => item.value > 0)

    const statusData = [
      { name: 'Pending', count: statusCounts.pending, color: STATUS_COLORS.pending },
      { name: 'Acknowledged', count: statusCounts.acknowledged, color: STATUS_COLORS.acknowledged },
      { name: 'Responded', count: statusCounts.responded, color: STATUS_COLORS.responded },
      { name: 'Resolved', count: statusCounts.resolved, color: STATUS_COLORS.resolved },
    ]

    const topCameraData = Array.from(cameraCounts.values())
      .sort((a, b) => b.collisions - a.collisions)
      .slice(0, 5)

    return {
      monthLabel: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      monthName: now.toLocaleString('en-US', { month: 'long' }),
      totalThisMonth: monthlyCollisions.length,
      dailyAverage: (monthlyCollisions.length / elapsedDays).toFixed(2),
      peakDay,
      highSeverity: severityCounts.high,
      dailyCounts,
      severityData,
      statusData,
      topCameraData,
    }
  }, [collisions, cameras])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <i className="fas fa-spinner fa-spin text-emerald-500 text-3xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon="fa-car-crash"
          iconBg="bg-red-50"
          iconColor="text-red-600"
          label={`Accidents in ${analytics.monthName}`}
          value={analytics.totalThisMonth}
          hint="Total recorded collisions this month"
          hintColor="text-red-600"
        />
        <StatCard
          icon="fa-chart-line"
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          label="Daily Average"
          value={analytics.dailyAverage}
          hint="Average incidents per day"
          hintColor="text-blue-600"
        />
        <StatCard
          icon="fa-fire"
          iconBg="bg-orange-50"
          iconColor="text-orange-600"
          label="Peak Day"
          value={`Day ${analytics.peakDay.day}`}
          hint={`${analytics.peakDay.collisions} incident(s)`}
          hintColor="text-orange-600"
        />
        <StatCard
          icon="fa-exclamation-triangle"
          iconBg="bg-rose-50"
          iconColor="text-rose-600"
          label="High Severity"
          value={analytics.highSeverity}
          hint="Critical incidents this month"
          hintColor="text-rose-600"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard
          title="Daily Vehicular Accidents"
          subtitle={`${analytics.monthLabel} trend by calendar day`}
        >
          {analytics.totalThisMonth === 0 ? (
            <EmptyChart message="No collisions recorded for this month yet." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.dailyCounts} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dailyCollisionFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => [`${value} incident(s)`, 'Collisions']}
                    labelFormatter={(label) => `Day ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="collisions"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fill="url(#dailyCollisionFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Severity Distribution"
          subtitle={`How severe incidents were in ${analytics.monthName}`}
        >
          {analytics.severityData.length === 0 ? (
            <EmptyChart message="Severity chart will appear once collisions are recorded." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.severityData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {analytics.severityData.map(item => (
                      <Cell key={item.name} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${value} incident(s)`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Top Camera Hotspots"
          subtitle="Cameras with the highest incident count this month"
        >
          {analytics.topCameraData.length === 0 ? (
            <EmptyChart message="No hotspot data yet for this month." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.topCameraData}
                  layout="vertical"
                  margin={{ top: 8, right: 20, left: 20, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={{ fontSize: 12 }}
                    interval={0}
                  />
                  <Tooltip formatter={(value) => [`${value} incident(s)`, 'Collisions']} />
                  <Bar dataKey="collisions" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Incident Status"
          subtitle="Current response state for this month’s events"
        >
          {analytics.totalThisMonth === 0 ? (
            <EmptyChart message="Status distribution appears once incidents exist." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.statusData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => [`${value} incident(s)`, 'Count']} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {analytics.statusData.map(item => (
                      <Cell key={item.name} fill={item.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
