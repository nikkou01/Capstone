import { useState, useEffect } from 'react'
import { login, fetchMe, logout as apiLogout } from './api'
import { NotifProvider, useNotif } from './context/NotifContext'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import CameraDashboard from './pages/CameraDashboard'
import CameraLocations from './pages/CameraLocations'
import Cameras from './pages/Cameras'
import Collisions from './pages/Collisions'
import Users from './pages/Users'
import Alerts from './pages/Alerts'
import Analytics from './pages/Analytics'

// ── Login Page ────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const notify = useNotif()
  const logoSrc = `${import.meta.env.BASE_URL}logo.png`

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
              <img src={logoSrc} alt="SafeSight" className="h-24 w-auto flex-shrink-0" />
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
              <img src={logoSrc} alt="SafeSight" className="h-24 w-auto mx-auto mb-4" />
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
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Shell ────────────────────────────────────────────────────────────────
const PAGE_META = {
  dashboard:  { title: 'Dashboard',         subtitle: 'Monitor your surveillance system and collision detection alerts' },
  cameraDashboard: { title: 'Camera Dashboard', subtitle: 'View all CCTV live outputs and camera stream health' },
  cameraLocations: { title: 'Camera Locations', subtitle: 'Assign and view map pinpoints for every camera' },
  cameras:    { title: 'Camera Management', subtitle: 'Manage and monitor your CCTV cameras' },
  collisions: { title: 'Collision Logs',    subtitle: 'View detailed collision detection events' },
  users:      { title: 'User Management',   subtitle: 'Manage system users and permissions' },
  alerts:     { title: 'Alert History',     subtitle: 'View SMS alert delivery history' },
  analytics:  { title: 'Analytics',         subtitle: 'Analyze monthly incident trends and camera hotspots' },
}

const PAGES = {
  dashboard: Dashboard,
  cameraDashboard: CameraDashboard,
  cameraLocations: CameraLocations,
  cameras: Cameras,
  collisions: Collisions,
  users: Users,
  alerts: Alerts,
  analytics: Analytics,
}
const CAPTAIN_PAGES = ['dashboard', 'cameraDashboard', 'cameraLocations', 'cameras', 'collisions', 'users', 'alerts', 'analytics']
const RESPONDER_PAGES = ['dashboard', 'cameraDashboard', 'cameraLocations', 'collisions', 'alerts', 'analytics']

function Shell({ user, onLogout }) {
  const [page, setPage] = useState('dashboard')
  const [now, setNow] = useState(() => new Date())
  const notify = useNotif()
  const isCaptain = String(user?.role || '').toLowerCase() === 'captain'
  const allowedPages = isCaptain ? CAPTAIN_PAGES : RESPONDER_PAGES
  const safePage = allowedPages.includes(page) ? page : 'dashboard'
  const meta = PAGE_META[safePage]
  const PageComponent = PAGES[safePage]
  const formattedDate = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const formattedTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!allowedPages.includes(page)) setPage('dashboard')
  }, [page, allowedPages])

  return (
    <div className="h-screen bg-gray-50 overflow-hidden">
      <Sidebar
        page={safePage}
        setPage={setPage}
        user={user}
        onLogout={onLogout}
        allowedPages={allowedPages}
      />
      <div className="ml-64 h-screen min-w-0 overflow-y-auto">
        <div className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50/95 backdrop-blur px-6 py-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{meta.title}</h1>
              <p className="text-gray-600">{meta.subtitle}</p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
              <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <i className="fas fa-clock" />
              </div>
              <div className="text-right leading-tight">
                <p className="text-xs font-medium text-gray-500">{formattedDate}</p>
                <p className="text-sm font-semibold text-gray-900 tabular-nums tracking-wide">{formattedTime}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="p-6">
          <PageComponent user={user} notify={notify} onNavigate={setPage} />
        </div>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
function AppInner() {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  function handleLogin(me) {
    localStorage.setItem('safesight_user', JSON.stringify(me))
    setUser(me)
    setAuthReady(true)
  }

  function handleLogout() {
    apiLogout()
    localStorage.removeItem('safesight_user')
    setUser(null)
    setAuthReady(true)
  }

  // Validate the token before showing protected pages.
  useEffect(() => {
    let mounted = true

    async function bootstrapAuth() {
      const token = localStorage.getItem('token')

      if (!token) {
        localStorage.removeItem('safesight_user')
        if (mounted) {
          setUser(null)
          setAuthReady(true)
        }
        return
      }

      try {
        const me = await fetchMe()
        if (!mounted) return
        localStorage.setItem('safesight_user', JSON.stringify(me))
        setUser(me)
      } catch {
        apiLogout()
        localStorage.removeItem('safesight_user')
        if (!mounted) return
        setUser(null)
      } finally {
        if (mounted) setAuthReady(true)
      }
    }

    bootstrapAuth()

    return () => {
      mounted = false
    }
  }, [])

  if (!authReady) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center px-4">
        <div className="glass rounded-xl px-6 py-4 text-slate-100 text-sm sm:text-base">
          <i className="fas fa-spinner fa-spin mr-2" />
          Checking session...
        </div>
      </div>
    )
  }

  return user ? <Shell user={user} onLogout={handleLogout} /> : <Login onLogin={handleLogin} />
}

export default function App() {
  return (
    <NotifProvider>
      <AppInner />
    </NotifProvider>
  )
}
