import { Text } from 'react-native'
import { formatDateTime } from '../utils/datetime'

export default function RefreshLabel({ lastUpdated }) {
  return (
    <Text style={{ color: '#64748b', fontSize: 12, marginHorizontal: 16, marginBottom: 10 }}>
      Live sync: {lastUpdated ? formatDateTime(lastUpdated) : 'waiting for first update'}
    </Text>
  )
}
