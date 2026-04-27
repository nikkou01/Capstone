import Constants from 'expo-constants'

const fromExtra = Constants?.expoConfig?.extra?.apiBaseUrl || Constants?.manifest2?.extra?.expoClient?.extra?.apiBaseUrl
const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL

export const API_BASE_URL = String(fromEnv || fromExtra || 'http://10.0.2.2:8000/api').replace(/\/$/, '')
export const REFRESH_INTERVAL_MS = 5000
