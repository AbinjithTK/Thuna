import React from 'react';
import { Text, ActivityIndicator, View, TouchableOpacity, Alert, Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CactusProvider } from './src/context/CactusContext';
import { UserProvider, useUser } from './src/context/UserContext';
import ErrorBoundary from './src/components/ErrorBoundary';
import HomeScreen from './src/screens/HomeScreen';
import TriageScreen from './src/screens/TriageScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import RemindersScreen from './src/screens/RemindersScreen';
import LoginScreen from './src/screens/LoginScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{icon}</Text>;
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
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarActiveTintColor: '#0D7C66',
        tabBarInactiveTintColor: '#9CA3AF',
      }}>
      <Tab.Screen
        name="Chat"
        component={TriageScreen}
        options={{
          title: currentUser?.name || 'Thuna',
          headerRight: () => (
            <TouchableOpacity
              style={{ marginRight: 16, backgroundColor: '#DC2626', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 4 }}
              onPress={() => {
                Alert.alert(
                  '🚨 SOS',
                  'Emergency contact-നെ വിളിക്കണോ?',
                  [
                    { text: 'വേണ്ട', style: 'cancel' },
                    { text: 'വിളിക്കുക', style: 'destructive', onPress: () => Linking.openURL('tel:112') },
                  ]
                );
              }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>🚨 SOS</Text>
            </TouchableOpacity>
          ),
          tabBarIcon: ({ focused }) => <TabIcon icon="💬" focused={focused} />,
          tabBarLabel: 'ചാറ്റ്',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon icon="👤" focused={focused} />,
          tabBarLabel: 'പ്രൊഫൈൽ',
        }}
      />
      <Tab.Screen
        name="Reminders"
        component={RemindersScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon icon="⏰" focused={focused} />,
          tabBarLabel: 'ഓർമ്മ',
        }}
      />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { currentUser, isLoading, updateUser } = useUser();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' }}>
        <ActivityIndicator size="large" color="#1B5E20" />
      </View>
    );
  }

  // Show onboarding for new users who haven't filled their profile
  const needsOnboarding = currentUser && !currentUser.age && !currentUser.existingConditions;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!currentUser ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : needsOnboarding ? (
          <Stack.Screen name="Onboarding">
            {() => (
              <OnboardingScreen
                onComplete={(data) => {
                  updateUser({
                    age: data.age,
                    gender: data.gender,
                    village: data.village,
                    bloodGroup: data.bloodGroup,
                    existingConditions: data.existingConditions,
                    currentMedications: data.currentMedications,
                    allergies: data.allergies,
                    emergencyContact: data.emergencyContact,
                  });
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
  );
}

export default function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <UserProvider>
          <CactusProvider>
            <AppContent />
          </CactusProvider>
        </UserProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
