import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import LoginScreen from '../screens/LoginScreen'
import DashboardScreen from '../screens/DashboardScreen'
import CollisionsScreen from '../screens/CollisionsScreen'
import AlertsScreen from '../screens/AlertsScreen'
import CamerasScreen from '../screens/CamerasScreen'

const RootStack = createNativeStackNavigator()
const Tabs = createBottomTabNavigator()

function ScreenWrapper({ title, children }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#0f172a' }}>{title}</Text>
      </View>
      {children}
    </View>
  )
}

function ResponderTabs() {
  const { logout } = useAuth()

  return (
    <Tabs.Navigator
      screenOptions={{
        headerRight: () => (
          <TouchableOpacity onPress={logout}>
            <Text style={{ color: '#0f766e', fontWeight: '600' }}>Logout</Text>
          </TouchableOpacity>
        ),
        tabBarActiveTintColor: '#0f766e',
        tabBarStyle: { height: 62, paddingTop: 6, paddingBottom: 6 },
      }}
    >
      <Tabs.Screen
        name="Dashboard"
        options={{ headerTitle: 'Responder Dashboard' }}
      >
        {() => (
          <ScreenWrapper title="Responder Dashboard">
            <DashboardScreen />
          </ScreenWrapper>
        )}
      </Tabs.Screen>

      <Tabs.Screen
        name="Collisions"
        options={{ headerTitle: 'Collision Logs' }}
      >
        {() => (
          <ScreenWrapper title="Collision Logs">
            <CollisionsScreen />
          </ScreenWrapper>
        )}
      </Tabs.Screen>

      <Tabs.Screen
        name="Alerts"
        options={{ headerTitle: 'SMS Alerts' }}
      >
        {() => (
          <ScreenWrapper title="SMS Alerts">
            <AlertsScreen />
          </ScreenWrapper>
        )}
      </Tabs.Screen>

      <Tabs.Screen
        name="Cameras"
        options={{ headerTitle: 'Camera Health' }}
      >
        {() => (
          <ScreenWrapper title="Camera Health">
            <CamerasScreen />
          </ScreenWrapper>
        )}
      </Tabs.Screen>
    </Tabs.Navigator>
  )
}

function NonResponderScreen() {
  const { user, logout } = useAuth()
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f8fafc' }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 8 }}>Responder App Access Only</Text>
      <Text style={{ textAlign: 'center', color: '#475569', marginBottom: 16 }}>
        Logged in as {user?.full_name || user?.username || 'Unknown'} ({user?.role || 'unknown role'}). This mobile app is limited to responder accounts.
      </Text>
      <TouchableOpacity onPress={logout} style={{ backgroundColor: '#0f766e', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={{ color: 'white', fontWeight: '700' }}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function AppNavigator() {
  const { authReady, user, isResponder } = useAuth()

  if (!authReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#0f766e" />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <RootStack.Screen name="Login" component={LoginScreen} />
        ) : isResponder ? (
          <RootStack.Screen name="ResponderTabs" component={ResponderTabs} />
        ) : (
          <RootStack.Screen name="NonResponder" component={NonResponderScreen} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  )
}
