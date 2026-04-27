import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { fetchMe, login as loginRequest, setApiToken } from '../api/client'

const TOKEN_KEY = 'safesight_mobile_token'
const USER_KEY = 'safesight_mobile_user'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState('')
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      try {
        const savedToken = (await AsyncStorage.getItem(TOKEN_KEY)) || ''
        if (!savedToken) {
          if (mounted) setAuthReady(true)
          return
        }

        setApiToken(savedToken)
        const me = await fetchMe()

        if (!mounted) return
        setToken(savedToken)
        setUser(me)
      } catch {
        await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY])
        setApiToken('')
      } finally {
        if (mounted) setAuthReady(true)
      }
    }

    bootstrap()
    return () => {
      mounted = false
    }
  }, [])

  async function login(username, password) {
    setLoading(true)
    try {
      const result = await loginRequest(username, password)
      const nextToken = result?.access_token || ''
      if (!nextToken) throw new Error('Missing access token')

      setApiToken(nextToken)
      const me = await fetchMe()

      await AsyncStorage.setItem(TOKEN_KEY, nextToken)
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(me))

      setToken(nextToken)
      setUser(me)
      return me
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    setApiToken('')
    setToken('')
    setUser(null)
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY])
  }

  const value = useMemo(
    () => ({
      token,
      user,
      authReady,
      loading,
      isResponder: String(user?.role || '').toLowerCase() === 'responder',
      login,
      logout,
    }),
    [token, user, authReady, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
