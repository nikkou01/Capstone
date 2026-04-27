import { useEffect, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { fetchAlerts } from '../api/client'
import { REFRESH_INTERVAL_MS } from '../config'
import RefreshLabel from '../components/RefreshLabel'
import StatusPill from '../components/StatusPill'
import { formatDateTime } from '../utils/datetime'

export default function AlertsScreen() {
  const [rows, setRows] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')

  async function load(background = false) {
    if (!background) setRefreshing(true)
    try {
      const data = await fetchAlerts()
      setRows(data)
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

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        if (row.status === 'sent') acc.sent += 1
        else acc.failed += 1
        return acc
      },
      { sent: 0, failed: 0 },
    )
  }, [rows])

  return (
    <View style={{ flex: 1 }}>
      <RefreshLabel lastUpdated={lastUpdated} />
      <View style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12 }}>
        <Text style={{ color: '#0f172a', fontWeight: '700' }}>SMS Delivery Summary</Text>
        <Text style={{ color: '#166534', marginTop: 4 }}>Sent: {summary.sent}</Text>
        <Text style={{ color: '#991b1b', marginTop: 2 }}>Failed: {summary.failed}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(false)} />}
      >
        {rows.map(item => (
          <View key={item.id} style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ color: '#0f172a', fontWeight: '700' }}>{item.recipient_name || 'Responder'}</Text>
              <StatusPill value={item.status} />
            </View>
            <Text style={{ color: '#334155' }}>{item.message}</Text>
            <Text style={{ color: '#64748b', marginTop: 8, fontSize: 12 }}>{formatDateTime(item.sent_at)}</Text>
          </View>
        ))}

        {rows.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <Text style={{ color: '#64748b' }}>No alert logs yet.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}
