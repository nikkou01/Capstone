import { useEffect, useState } from 'react'
import { Image, RefreshControl, ScrollView, Text, View } from 'react-native'
import { fetchCameras, getSnapshotUrl } from '../api/client'
import { REFRESH_INTERVAL_MS } from '../config'
import { useAuth } from '../context/AuthContext'
import RefreshLabel from '../components/RefreshLabel'
import StatusPill from '../components/StatusPill'

export default function CamerasScreen() {
  const { token } = useAuth()
  const [rows, setRows] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')

  async function load(background = false) {
    if (!background) setRefreshing(true)
    try {
      const data = await fetchCameras()
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

  return (
    <View style={{ flex: 1 }}>
      <RefreshLabel lastUpdated={lastUpdated} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(false)} />}
      >
        {rows.map(item => {
          const canShowSnapshot = item.status === 'active' && item.rtsp_url
          return (
            <View key={item.id} style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: '#0f172a', fontWeight: '700' }}>{item.name}</Text>
                <StatusPill value={item.status} />
              </View>
              <Text style={{ color: '#475569', marginBottom: 8 }}>{item.location}</Text>

              {canShowSnapshot ? (
                <Image
                  source={{
                    uri: getSnapshotUrl(item.id),
                    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                  }}
                  style={{ height: 160, width: '100%', borderRadius: 10, backgroundColor: '#0f172a' }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ height: 120, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
                  <Text style={{ color: '#64748b' }}>No live snapshot for this camera.</Text>
                </View>
              )}
            </View>
          )
        })}

        {rows.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <Text style={{ color: '#64748b' }}>No cameras available.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}
