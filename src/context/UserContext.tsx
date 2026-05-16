/**
 * UserContext — Simple name-based authentication.
 * Persists current user in AsyncStorage.
 * Supports switching between multiple people on the same device.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserProfile {
  id: string;
  name: string;
  age: string;
  gender: string;
  bloodGroup: string;
  village: string;
  emergencyContact: string;
  allergies: string;
  existingConditions: string;
  currentMedications: string;
  createdAt: number;
}

interface UserContextValue {
  currentUser: UserProfile | null;
  allUsers: UserProfile[];
  isLoading: boolean;
  login: (name: string) => Promise<UserProfile>;
  switchUser: (userId: string) => Promise<void>;
  createUser: (data: Partial<UserProfile>) => Promise<UserProfile>;
  updateUser: (data: Partial<UserProfile>) => Promise<void>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

const STORAGE_KEYS = {
  CURRENT_USER_ID: '@thuna_current_user',
  ALL_USERS: '@thuna_all_users',
};

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load saved state on mount
  useEffect(() => {
    loadSavedState();
  }, []);

  const loadSavedState = async () => {
    try {
      const [usersJson, currentId] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.ALL_USERS),
        AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID),
      ]);

      const users: UserProfile[] = usersJson ? JSON.parse(usersJson) : [];
      setAllUsers(users);

      if (currentId) {
        const user = users.find(u => u.id === currentId);
        if (user) setCurrentUser(user);
      }
    } catch (e) {
      console.warn('Failed to load user state:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const saveUsers = async (users: UserProfile[]) => {
    await AsyncStorage.setItem(STORAGE_KEYS.ALL_USERS, JSON.stringify(users));
    setAllUsers(users);
  };

  // Login by name — creates user if doesn't exist
  const login = async (name: string): Promise<UserProfile> => {
    const trimmed = name.trim();
    const existing = allUsers.find(u => u.name.toLowerCase() === trimmed.toLowerCase());

    if (existing) {
      setCurrentUser(existing);
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, existing.id);
      return existing;
    }

    // Create new user
    const newUser: UserProfile = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      age: '', gender: '', bloodGroup: '', village: '',
      emergencyContact: '', allergies: '', existingConditions: '', currentMedications: '',
      createdAt: Date.now(),
    };

    const updated = [...allUsers, newUser];
    await saveUsers(updated);
    setCurrentUser(newUser);
    await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, newUser.id);
    return newUser;
  };

  const createUser = async (data: Partial<UserProfile>): Promise<UserProfile> => {
    const newUser: UserProfile = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: data.name || 'Unknown',
      age: data.age || '',
      gender: data.gender || '',
      bloodGroup: data.bloodGroup || '',
      village: data.village || '',
      emergencyContact: data.emergencyContact || '',
      allergies: data.allergies || '',
      existingConditions: data.existingConditions || '',
      currentMedications: data.currentMedications || '',
      createdAt: Date.now(),
    };

    const updated = [...allUsers, newUser];
    await saveUsers(updated);
    setCurrentUser(newUser);
    await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, newUser.id);
    return newUser;
  };

  const switchUser = async (userId: string) => {
    const user = allUsers.find(u => u.id === userId);
    if (user) {
      setCurrentUser(user);
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, userId);
    }
  };

  const updateUser = async (data: Partial<UserProfile>) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...data };
    setCurrentUser(updated);
    const updatedAll = allUsers.map(u => u.id === updated.id ? updated : u);
    await saveUsers(updatedAll);
  };

  const logout = async () => {
    setCurrentUser(null);
    await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
  };

  return (
    <UserContext.Provider value={{ currentUser, allUsers, isLoading, login, switchUser, createUser, updateUser, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
