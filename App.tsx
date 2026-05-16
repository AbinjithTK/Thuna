import React from 'react';
import { Text, ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CactusProvider } from './src/context/CactusContext';
import { UserProvider, useUser } from './src/context/UserContext';
import HomeScreen from './src/screens/HomeScreen';
import TriageScreen from './src/screens/TriageScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import RemindersScreen from './src/screens/RemindersScreen';
import LoginScreen from './src/screens/LoginScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.5 }}>{icon}</Text>;
}

function MainTabs() {
  const { currentUser } = useUser();
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0D7C66' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold', fontSize: 18 },
        tabBarStyle: { height: 75, paddingBottom: 20, paddingTop: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        tabBarActiveTintColor: '#0D7C66',
        tabBarInactiveTintColor: '#9CA3AF',
      }}>
      <Tab.Screen
        name="Chat"
        component={TriageScreen}
        options={{
          title: `💬 ${currentUser?.name || 'Thuna'}`,
          tabBarIcon: ({ focused }) => <TabIcon icon="💬" focused={focused} />,
          tabBarLabel: 'Chat',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon icon="👤" focused={focused} />,
          tabBarLabel: 'Profile',
        }}
      />
      <Tab.Screen
        name="Reminders"
        component={RemindersScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon icon="⏰" focused={focused} />,
          tabBarLabel: 'Reminders',
        }}
      />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { currentUser, isLoading } = useUser();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' }}>
        <ActivityIndicator size="large" color="#1B5E20" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!currentUser ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Main" component={MainTabs} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <UserProvider>
        <CactusProvider>
          <AppContent />
        </CactusProvider>
      </UserProvider>
    </SafeAreaProvider>
  );
}
