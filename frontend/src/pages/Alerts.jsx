import { useEffect, useState } from 'react'
import { fetchAlerts, sendTestSmsAlert } from '../api'

export default function Alerts({ user, notify }) {
  const [alerts,  setAlerts]  = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all')
  const [sendingTest, setSendingTest] = useState(false)

  const isCaptain = user?.role === 'captain'

  async function loadAlerts() {
    setLoading(true)
    try {
      const rows = await fetchAlerts()
      setAlerts(rows)
    } catch {
      notify('Failed to load alerts.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAlerts()
  }, [])

  async function handleSendTestSms() {
    setSendingTest(true)
    try {
      const result = await sendTestSmsAlert()
      const toastType = result.failed > 0 ? 'warning' : 'success'
      notify(`Test SMS done: ${result.sent} sent, ${result.failed} failed.`, toastType)
      await loadAlerts()
    } catch (err) {
      notify(err?.response?.data?.detail || 'Failed to send test SMS.', 'error')
    } finally {
      setSendingTest(false)
    }
  }

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.status === filter)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-medium text-gray-900">SMS Alert History</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {isCaptain && (
            <button
              onClick={handleSendTestSms}
              disabled={sendingTest}
              className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <i className="fas fa-paper-plane mr-1" />
              {sendingTest ? 'Sending Test SMS...' : 'Send Test SMS'}
            </button>
          )}
          {['all', 'sent', 'failed', 'pending'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors
                ${filter === f ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <i className="fas fa-spinner fa-spin text-emerald-500 text-2xl" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <i className="fas fa-bell-slash text-4xl mb-3 block text-gray-300" />
          No {filter !== 'all' ? filter : ''} alerts found.
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {filtered.map(a => (
            <div key={a.id} className={`px-6 py-4 border-l-4
              ${a.status === 'sent'    ? 'border-green-500 bg-green-50'
              : a.status === 'failed' ? 'border-red-400 bg-red-50'
              : 'border-yellow-400 bg-yellow-50'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 mr-4">
                  <p className={`font-medium text-sm
                    ${a.status === 'sent'    ? 'text-green-900'
                    : a.status === 'failed' ? 'text-red-900'
                    : 'text-yellow-900'}`}>
                    {a.is_test ? 'Test SMS Alert' : 'Collision Alert'} → {a.recipient_name}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">{a.recipient_phone}</p>
                  <p className="text-xs text-gray-500 mt-1 truncate">{a.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    <i className="fas fa-clock mr-1" />
                    {new Date(a.sent_at).toLocaleString()}
                  </p>
                </div>
                <span className={`flex-shrink-0 px-2 py-1 text-xs rounded-full font-medium
                  ${a.status === 'sent'    ? 'bg-green-100 text-green-800'
                  : a.status === 'failed' ? 'bg-red-100 text-red-800'
                  : 'bg-yellow-100 text-yellow-800'}`}>
                  {a.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
