import { createContext, useContext, useState, useCallback } from 'react'

const NotifCtx = createContext(null)

export function NotifProvider({ children }) {
  const [notifs, setNotifs] = useState([])

  const push = useCallback((message, type = 'info') => {
    const id = Date.now()
    setNotifs(p => [...p, { id, message, type }])
    setTimeout(() => setNotifs(p => p.filter(n => n.id !== id)), 5000)
  }, [])

  const remove = (id) => setNotifs(p => p.filter(n => n.id !== id))

  return (
    <NotifCtx.Provider value={push}>
      {children}
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 space-y-2 w-80">
        {notifs.map(n => (
          <div key={n.id}
            className={`flex items-center justify-between p-4 rounded-lg shadow-lg text-white text-sm
              ${n.type === 'success' ? 'bg-green-500'
              : n.type === 'error'   ? 'bg-red-500'
              : n.type === 'warning' ? 'bg-orange-500'
              : 'bg-blue-500'}`}>
            <span>{n.message}</span>
            <button onClick={() => remove(n.id)} className="ml-3 opacity-80 hover:opacity-100">
              <i className="fas fa-times" />
            </button>
          </div>
        ))}
      </div>
    </NotifCtx.Provider>
  )
}

export const useNotif = () => useContext(NotifCtx)
