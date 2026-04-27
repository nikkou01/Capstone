import { Text, View } from 'react-native'

const statusStyles = {
  pending: { bg: '#ffedd5', fg: '#9a3412' },
  acknowledged: { bg: '#dbeafe', fg: '#1e40af' },
  responded: { bg: '#ede9fe', fg: '#6d28d9' },
  resolved: { bg: '#dcfce7', fg: '#166534' },
  sent: { bg: '#dcfce7', fg: '#166534' },
  failed: { bg: '#fee2e2', fg: '#991b1b' },
}

export default function StatusPill({ value }) {
  const key = String(value || '').toLowerCase()
  const style = statusStyles[key] || { bg: '#e2e8f0', fg: '#334155' }

  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: style.bg }}>
      <Text style={{ color: style.fg, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' }}>{value || 'unknown'}</Text>
    </View>
  )
}
