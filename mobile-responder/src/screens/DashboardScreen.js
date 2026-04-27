import { useEffect, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { fetchAlerts, fetchCollisions, fetchStats } from '../api/client'
import { REFRESH_INTERVAL_MS } from '../config'
import StatCard from '../components/StatCard'
import StatusPill from '../components/StatusPill'
import RefreshLabel from '../components/RefreshLabel'
import { formatDateTime } from '../utils/datetime'

export default function DashboardScreen() {
  const [stats, setStats] = useState(null)
  const [collisions, setCollisions] = useState([])
  const [alerts, setAlerts] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')

  async function load(background = false) {
    if (!background) setRefreshing(true)
    try {
      const [statsData, collisionsData, alertsData] = await Promise.all([
        fetchStats(),
        fetchCollisions(),
        fetchAlerts(),
      ])
      setStats(statsData)
      setCollisions(collisionsData)
      setAlerts(alertsData)
      setLastUpdated(new Date().toISOString())
    } finally {
      if (!background) setRefreshing(false)
    }
  }

  useEffect(() => {
    load(false)
    const id = setInterval(() => load(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  const recentCollision = useMemo(() => collisions[0] || null, [collisions])
  const recentAlert = useMemo(() => alerts[0] || null, [alerts])

  return (
    <View style={{ flex: 1 }}>
      <RefreshLabel lastUpdated={lastUpdated} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(false)} />}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <StatCard label="Total Collisions" value={stats?.total_collisions ?? 0} tone="#be123c" />
          <StatCard label="Pending" value={stats?.pending_collisions ?? 0} tone="#c2410c" />
          <StatCard label="Active Cameras" value={stats?.active_cameras ?? 0} tone="#0f766e" />
          <StatCard label="Total Alerts" value={stats?.total_alerts ?? 0} tone="#1d4ed8" />
        </View>

        <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12 }}>
          <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Latest Collision</Text>
          {!recentCollision ? (
            <Text style={{ color: '#64748b' }}>No collisions yet.</Text>
          ) : (
            <>
              <StatusPill value={recentCollision.status} />
              <Text style={{ color: '#0f172a', fontWeight: '700', marginTop: 8 }}>{recentCollision.camera_name}</Text>
              <Text style={{ color: '#475569', marginTop: 3 }}>{recentCollision.camera_location}</Text>
              <Text style={{ color: '#334155', marginTop: 6 }}>
                {(Number(recentCollision.confidence_score || 0) * 100).toFixed(1)}% confidence
              </Text>
              <Text style={{ color: '#64748b', marginTop: 4, fontSize: 12 }}>{formatDateTime(recentCollision.timestamp)}</Text>
            </>
          )}
        </View>

        <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12 }}>
          <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Latest SMS Alert</Text>
          {!recentAlert ? (
            <Text style={{ color: '#64748b' }}>No alerts yet.</Text>
          ) : (
            <>
              <StatusPill value={recentAlert.status} />
              <Text style={{ color: '#0f172a', marginTop: 8 }}>{recentAlert.message}</Text>
              <Text style={{ color: '#64748b', marginTop: 6, fontSize: 12 }}>{formatDateTime(recentAlert.sent_at)}</Text>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
