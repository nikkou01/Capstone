import { Text, View } from 'react-native'

export default function StatCard({ label, value, tone = '#0f172a' }) {
  return (
    <View style={{ flex: 1, minWidth: 150, backgroundColor: 'white', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
      <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <Text style={{ color: tone, fontSize: 24, fontWeight: '700' }}>{value}</Text>
    </View>
  )
}
