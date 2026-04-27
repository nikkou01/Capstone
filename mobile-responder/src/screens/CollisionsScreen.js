import { useEffect, useMemo, useState } from 'react'
import { Alert, Linking, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { fetchCollisions, getCollisionClipUrl, updateCollisionStatus } from '../api/client'
import { REFRESH_INTERVAL_MS } from '../config'
import RefreshLabel from '../components/RefreshLabel'
import StatusPill from '../components/StatusPill'
import { formatDateTime } from '../utils/datetime'

const tabs = ['all', 'pending', 'acknowledged', 'responded', 'resolved']

export default function CollisionsScreen() {
  const [rows, setRows] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')
  const [filter, setFilter] = useState('all')
  const [busyId, setBusyId] = useState('')

  async function load(background = false) {
    if (!background) setRefreshing(true)
    try {
      const data = await fetchCollisions()
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

  async function setStatus(id, status) {
    try {
      setBusyId(id)
      await updateCollisionStatus(id, status)
      await load(true)
    } catch {
      Alert.alert('Update failed', 'Could not update collision status.')
    } finally {
      setBusyId('')
    }
  }

  async function openClip(item) {
    if (String(item?.video_status || '').toLowerCase() === 'processing') {
      Alert.alert('Clip still processing', 'The 15-second detection clip is still being generated.')
      return
    }

    const clipUrl = getCollisionClipUrl(item)
    if (!clipUrl) {
      Alert.alert('No clip available', 'No 15-second clip is available for this collision yet.')
      return
    }

    try {
      const supported = await Linking.canOpenURL(clipUrl)
      if (!supported) {
        Alert.alert('Open failed', 'This device could not open the collision clip link.')
        return
      }
      await Linking.openURL(clipUrl)
    } catch {
      Alert.alert('Open failed', 'Could not open the collision clip. Please try again.')
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter(item => item.status === filter)
  }, [rows, filter])

  return (
    <View style={{ flex: 1 }}>
      <RefreshLabel lastUpdated={lastUpdated} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 10 }}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => setFilter(tab)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: filter === tab ? '#0f766e' : '#e2e8f0',
            }}
          >
            <Text style={{ color: filter === tab ? 'white' : '#334155', fontWeight: '600', textTransform: 'capitalize' }}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(false)} />}
      >
        {filtered.map(item => (
          <View key={item.id} style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontWeight: '700', color: '#0f172a', flex: 1, marginRight: 8 }}>{item.camera_name}</Text>
              <StatusPill value={item.status} />
            </View>
            <Text style={{ color: '#475569', marginTop: 4 }}>{item.camera_location}</Text>
            <Text style={{ color: '#334155', marginTop: 4 }}>
              {(Number(item.confidence_score || 0) * 100).toFixed(1)}% • {item.severity || 'N/A'}
            </Text>
            <Text style={{ color: '#64748b', marginTop: 4, fontSize: 12 }}>{formatDateTime(item.timestamp)}</Text>

            {item.video_status === 'processing' ? (
              <Text style={{ color: '#b45309', marginTop: 4, fontSize: 12 }}>Clip status: processing 15-second evidence...</Text>
            ) : null}
            {item.video_status === 'failed' ? (
              <Text style={{ color: '#b91c1c', marginTop: 4, fontSize: 12 }}>
                Clip status: failed {item.video_error ? `(${item.video_error})` : ''}
              </Text>
            ) : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              <ActionButton
                disabled={String(item?.video_status || '').toLowerCase() === 'processing'}
                label={String(item?.video_status || '').toLowerCase() === 'processing' ? 'Clip Processing...' : 'View 15s Clip'}
                tone="#1d4ed8"
                onPress={() => openClip(item)}
              />

              {item.status === 'pending' ? (
                <>
                  <ActionButton disabled={busyId === item.id} label="Acknowledge" tone="#16a34a" onPress={() => setStatus(item.id, 'acknowledged')} />
                  <ActionButton disabled={busyId === item.id} label="Decline" tone="#dc2626" onPress={() => setStatus(item.id, 'resolved')} />
                </>
              ) : null}

              {item.status === 'acknowledged' ? (
                <ActionButton disabled={busyId === item.id} label="Mark Responded" tone="#7c3aed" onPress={() => setStatus(item.id, 'responded')} />
              ) : null}

              {item.status === 'responded' ? (
                <ActionButton disabled={busyId === item.id} label="Mark Resolved" tone="#059669" onPress={() => setStatus(item.id, 'resolved')} />
              ) : null}
            </View>
          </View>
        ))}

        {filtered.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <Text style={{ color: '#64748b' }}>No collisions in this filter.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

function ActionButton({ label, onPress, tone, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{ backgroundColor: tone, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, opacity: disabled ? 0.6 : 1 }}
    >
      <Text style={{ color: 'white', fontWeight: '700', fontSize: 12 }}>{disabled ? 'Updating...' : label}</Text>
    </TouchableOpacity>
  )
}
