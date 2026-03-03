import { useState, useEffect } from 'react'
import { login, fetchMe, logout as apiLogout } from './api'
import { NotifProvider, useNotif } from './context/NotifContext'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Cameras from './pages/Cameras'
import Collisions from './pages/Collisions'
import Users from './pages/Users'
import Alerts from './pages/Alerts'

// ── Login Page ────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [username, setUsername] = useState('captain')
  const [password, setPassword] = useState('password')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const notify = useNotif()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(username, password)
      const me = await fetchMe()
      notify('Welcome back! Dashboard loaded.', 'success')
      onLogin(me)
    } catch {
      setError('Invalid username or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center px-4">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">

        {/* Hero */}
        <div className="text-white space-y-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-3 -ml-2">
              <img src="/logo.png" alt="SafeSight" className="h-24 w-auto flex-shrink-0" />
              <h1 className="text-4xl lg:text-6xl font-bold">
                Safe<span className="text-emerald-400">Sight</span>
              </h1>
            </div>
            <p className="text-xl lg:text-2xl text-slate-300 mt-2">
              Advanced Collision Detection &amp; Surveillance System
            </p>
            <div className="w-24 h-1 bg-emerald-400 rounded-full" />
          </div>
          <div className="space-y-4">
            {[
              ['fa-video',     'Real-time CCTV Monitoring'],
              ['fa-brain',     'AI-Powered Collision Detection'],
              ['fa-sms',       'Instant SMS Alert System'],
              ['fa-users-cog', 'Role-Based Access Control'],
            ].map(([icon, label]) => (
              <div key={label} className="flex items-center space-x-3">
                <i className={`fas ${icon} text-emerald-400 w-5`} />
                <span className="text-lg">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="w-full max-w-md mx-auto">
          <div className="glass rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-8">
              <img src="/logo.png" alt="SafeSight" className="h-24 w-auto mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
              <p className="text-slate-300">Sign in to your surveillance dashboard</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">Username</label>
                <input
                  type="text" value={username} onChange={e => setUsername(e.target.value)} required
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white
                    placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all"
                  placeholder="Enter your username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">Password</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white
                    placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all"
                  placeholder="Enter your password"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit" disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4
                  rounded-lg transition-all transform hover:scale-[1.02] disabled:opacity-50"
              >
                <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-sign-in-alt'} mr-2`} />
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <div className="mt-6 p-4 bg-white/5 rounded-lg border border-white/10 text-center text-sm text-slate-400">
              <p className="mb-1">Demo Credentials:</p>
              <p className="text-emerald-300"><strong>captain</strong> / <strong>password</strong></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Shell ────────────────────────────────────────────────────────────────
const PAGE_META = {
  dashboard:  { title: 'Dashboard',         subtitle: 'Monitor your surveillance system and collision detection alerts' },
  cameras:    { title: 'Camera Management', subtitle: 'Manage and monitor your CCTV cameras' },
  collisions: { title: 'Collision Logs',    subtitle: 'View detailed collision detection events' },
  users:      { title: 'User Management',   subtitle: 'Manage system users and permissions' },
  alerts:     { title: 'Alert History',     subtitle: 'View SMS alert delivery history' },
}

const PAGES = { dashboard: Dashboard, cameras: Cameras, collisions: Collisions, users: Users, alerts: Alerts }

function Shell({ user, onLogout }) {
  const [page, setPage] = useState('dashboard')
  const [time, setTime] = useState(new Date().toLocaleString())
  const notify = useNotif()
  const meta   = PAGE_META[page]
  const PageComponent = PAGES[page]

  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleString()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar page={page} setPage={setPage} user={user} onLogout={onLogout} />
      <div className="flex-1 p-6 min-w-0">
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{meta.title}</h1>
            <p className="text-gray-600">{meta.subtitle}</p>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">{time}</span>
          </div>
        </div>
        <PageComponent user={user} notify={notify} />
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
function AppInner() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('safecctv_user')) } catch { return null }
  })

  function handleLogin(me) {
    localStorage.setItem('safecctv_user', JSON.stringify(me))
    setUser(me)
  }

  function handleLogout() {
    apiLogout()
    localStorage.removeItem('safecctv_user')
    setUser(null)
  }

  // Validate token on mount
  useEffect(() => {
    if (user && localStorage.getItem('token')) {
      fetchMe().catch(() => handleLogout())
    }
  }, [])

  return user ? <Shell user={user} onLogout={handleLogout} /> : <Login onLogin={handleLogin} />
}

export default function App() {
  return (
    <NotifProvider>
      <AppInner />
    </NotifProvider>
  )
}
