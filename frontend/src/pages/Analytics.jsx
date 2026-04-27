import { useMemo, useState } from 'react'
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
} from 'recharts'
import { fetchCollisions, fetchCameras } from '../api'
import useAutoRefresh from '../utils/useAutoRefresh'

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
    <div className="relative overflow-hidden bg-white/95 rounded-2xl shadow-sm border border-gray-200 p-5">
      <div className="pointer-events-none absolute -top-16 -right-12 w-36 h-36 rounded-full bg-cyan-100/50 blur-2xl" />
      <div className="mb-4">
        <h3 className="text-base font-semibold tracking-tight text-gray-900">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
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
    <div className="h-72 flex items-center justify-center text-gray-500 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-300">
      {message}
    </div>
  )
}

function ModernTooltip({ active, label, payload, labelPrefix = '' }) {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 shadow-lg">
      {label !== undefined && (
        <p className="text-xs font-semibold text-slate-700">{labelPrefix}{label}</p>
      )}
      <div className="mt-1 space-y-1">
        {payload.map(item => (
          <div key={item.name} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-600">{item.name}</span>
            <span className="font-semibold text-slate-900">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function renderSeverityLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name, value, fill }) {
  if (!percent || percent < 0.08) return null

  const RADIAN = Math.PI / 180
  const radius = outerRadius + 18
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  return (
    <text
      x={x}
      y={y}
      fill={fill}
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
    >
      {`${name} ${value} (${Math.round(percent * 100)}%)`}
    </text>
  )
}

export default function Analytics({ notify }) {
  const [collisions, setCollisions] = useState([])
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(true)

  async function load(options = {}) {
    const background = !!options.background
    try {
      const [collisionDocs, cameraDocs] = await Promise.all([fetchCollisions(), fetchCameras()])
      setCollisions(collisionDocs)
      setCameras(cameraDocs)
    } catch {
      if (!background) notify('Failed to load analytics data.', 'error')
    } finally {
      if (!background) setLoading(false)
    }
  }

  useAutoRefresh(load, { intervalMs: 7000 })

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

    const severityTotal = severityData.reduce((sum, item) => sum + item.value, 0)

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
      severityTotal,
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
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.45} />
                      <stop offset="70%" stopColor="#f43f5e" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ModernTooltip labelPrefix="Day " />} />
                  <Area
                    type="monotone"
                    dataKey="collisions"
                    stroke="#e11d48"
                    strokeWidth={2.5}
                    fill="url(#dailyCollisionFill)"
                    dot={{ r: 2.5, fill: '#e11d48', stroke: '#fff', strokeWidth: 2 }}
                    activeDot={{ r: 4.5, fill: '#be123c', stroke: '#fff', strokeWidth: 2 }}
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
            <div className="h-72 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 10, right: 40, bottom: 10, left: 40 }}>
                  <defs>
                    <filter id="pieShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.25" />
                    </filter>
                  </defs>
                  <Pie
                    data={analytics.severityData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={108}
                    paddingAngle={2.5}
                    stroke="#fff"
                    strokeWidth={2}
                    labelLine={false}
                    label={renderSeverityLabel}
                    style={{ filter: 'url(#pieShadow)' }}
                  >
                    {analytics.severityData.map(item => (
                      <Cell key={item.name} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ModernTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Total</p>
                  <p className="text-2xl font-bold text-slate-900 leading-none mt-1">{analytics.severityTotal}</p>
                  <p className="text-[11px] text-slate-500 mt-1">Incidents</p>
                </div>
              </div>

              <div className="absolute left-0 right-0 bottom-0 flex items-center justify-center gap-3">
                {analytics.severityData.map(item => (
                  <div key={item.name} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-xs text-slate-700 shadow-sm">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="font-medium">{item.name}</span>
                    <span className="text-slate-500">{item.value}</span>
                  </div>
                ))}
              </div>
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
                  <defs>
                    <linearGradient id="hotspotBar" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={{ fontSize: 11, fill: '#475569' }}
                    interval={0}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ModernTooltip />} />
                  <Bar dataKey="collisions" fill="url(#hotspotBar)" radius={[0, 10, 10, 0]} barSize={16} />
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
                  <CartesianGrid strokeDasharray="2 6" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ModernTooltip />} />
                  <Bar dataKey="count" radius={[10, 10, 0, 0]} barSize={30}>
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
