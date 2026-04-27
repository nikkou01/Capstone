import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { API_BASE_URL } from '../config'
import { useAuth } from '../context/AuthContext'

export default function LoginScreen() {
  const { login, loading } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function onSubmit() {
    try {
      setError('')
      await login(username.trim(), password)
    } catch {
      setError('Invalid username/password or server unreachable.')
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#0f172a' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ backgroundColor: '#111827', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#1f2937' }}>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: '700' }}>SafeSight Responder</Text>
        <Text style={{ color: '#9ca3af', marginTop: 4, marginBottom: 16 }}>Mobile operations console</Text>

        <Text style={{ color: '#cbd5e1', marginBottom: 4 }}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          style={{ backgroundColor: '#1f2937', color: 'white', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 }}
        />

        <Text style={{ color: '#cbd5e1', marginBottom: 4 }}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={{ backgroundColor: '#1f2937', color: 'white', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 }}
        />

        {error ? <Text style={{ color: '#fca5a5', marginBottom: 10 }}>{error}</Text> : null}

        <TouchableOpacity
          onPress={onSubmit}
          disabled={loading}
          style={{ backgroundColor: '#0f766e', borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: loading ? 0.65 : 1 }}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontWeight: '700' }}>Sign In</Text>}
        </TouchableOpacity>

        <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 12 }}>
          API: {API_BASE_URL}
        </Text>
      </View>
    </KeyboardAvoidingView>
  )
}
