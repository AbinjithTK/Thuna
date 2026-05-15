import React, { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CactusProvider } from './src/context/CactusContext';
import HomeScreen from './src/screens/HomeScreen';
import TriageScreen from './src/screens/TriageScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import RemindersScreen from './src/screens/RemindersScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.5 }}>{icon}</Text>;
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1B5E20' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold', fontSize: 18 },
        tabBarStyle: { height: 75, paddingBottom: 20, paddingTop: 8 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarActiveTintColor: '#1B5E20',
        tabBarInactiveTintColor: '#999',
      }}>
      <Tab.Screen
        name="Chat"
        component={TriageScreen}
        options={{
          title: '💬 Thuna',
          tabBarIcon: ({ focused }) => <TabIcon icon="💬" focused={focused} />,
          tabBarLabel: 'Chat',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: '👤 Profile',
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon icon="👤" focused={focused} />,
          tabBarLabel: 'Profile',
        }}
      />
      <Tab.Screen
        name="Reminders"
        component={RemindersScreen}
        options={{
          title: '⏰ Reminders',
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon icon="⏰" focused={focused} />,
          tabBarLabel: 'Reminders',
        }}
      />
    </Tab.Navigator>
  );
}

export default function App(): React.JSX.Element {
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [patientData, setPatientData] = useState<any>(null);

  return (
    <SafeAreaProvider>
      <CactusProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!isOnboarded ? (
              <Stack.Screen name="Onboarding">
                {() => (
                  <OnboardingScreen
                    onComplete={(data) => {
                      setPatientData(data);
                      setIsOnboarded(true);
                    }}
                  />
                )}
              </Stack.Screen>
            ) : (
              <>
                <Stack.Screen name="Home" component={HomeScreen} />
                <Stack.Screen name="Main" component={MainTabs} />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </CactusProvider>
    </SafeAreaProvider>
  );
}
