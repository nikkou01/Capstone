export default function Sidebar({ page, setPage, user, onLogout, allowedPages = [] }) {
  const nav = [
    { id: 'dashboard',   icon: 'fa-tachometer-alt', label: 'Dashboard'         },
    { id: 'cameraLocations', icon: 'fa-map-marker-alt', label: 'Camera Locations' },
    { id: 'cameras',     icon: 'fa-video',           label: 'Camera Management' },
    { id: 'collisions',  icon: 'fa-exclamation-triangle', label: 'Collision Logs' },
    { id: 'users',       icon: 'fa-users',           label: 'User Management'   },
    { id: 'alerts',      icon: 'fa-bell',            label: 'Alert History'     },
  ]
  const visibleNav = allowedPages.length ? nav.filter(item => allowedPages.includes(item.id)) : nav

  const initials = (user?.full_name || 'BC')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="sidebar w-64 flex-shrink-0 p-6 flex flex-col">
      {/* Logo */}
      <div className="flex items-center space-x-3 mb-8">
        <img src="/logo.png" alt="SafeSight" className="h-10 w-auto" />
        <div>
          <h1 className="text-xl font-bold text-white">SafeSight</h1>
          <p className="text-emerald-100 text-xs">Surveillance System</p>
        </div>
      </div>

      {/* User card */}
      <div className="bg-white/10 rounded-lg p-4 mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-sm">{initials}</span>
          </div>
          <div>
            <p className="text-white font-medium text-sm">{user?.full_name || 'User'}</p>
            <p className="text-emerald-200 text-xs capitalize">{user?.role || ''}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="space-y-1 flex-1">
        {visibleNav.map(item => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={`w-full flex items-center space-x-3 p-3 rounded-lg text-white 
              hover:bg-white/10 transition-colors text-left
              ${page === item.id ? 'bg-white/20' : ''}`}
          >
            <i className={`fas ${item.icon} w-5 text-center`} />
            <span className="text-sm">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Logout */}
      <button
        onClick={onLogout}
        className="flex items-center space-x-3 p-3 rounded-lg text-white hover:bg-red-500/20 transition-colors"
      >
        <i className="fas fa-sign-out-alt w-5 text-center" />
        <span className="text-sm">Sign Out</span>
      </button>
    </div>
  )
}
