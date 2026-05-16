import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '../context/UserContext';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, allUsers } = useUser();
  const [name, setName] = useState('');

  const handleLogin = async () => {
    if (name.trim()) {
      await login(name.trim());
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
      <Text style={styles.logo}>🤝</Text>
      <Text style={styles.title}>Thuna</Text>
      <Text style={styles.subtitle}>നിങ്ങളുടെ ആരോഗ്യ തുണ</Text>

      <View style={styles.inputSection}>
        <Text style={styles.label}>നിങ്ങളുടെ പേര് എന്താണ്?</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your name"
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
          onSubmitEditing={handleLogin}
          autoFocus
        />
        <TouchableOpacity
          style={[styles.loginBtn, !name.trim() && styles.loginBtnDisabled]}
          onPress={handleLogin}
          disabled={!name.trim()}>
          <Text style={styles.loginBtnText}>തുടങ്ങുക →</Text>
        </TouchableOpacity>
      </View>

      {/* Existing users — quick switch */}
      {allUsers.length > 0 && (
        <View style={styles.existingSection}>
          <Text style={styles.existingTitle}>അല്ലെങ്കിൽ തിരഞ്ഞെടുക്കുക:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.userList}>
            {allUsers.map(user => (
              <TouchableOpacity
                key={user.id}
                style={styles.userChip}
                onPress={() => login(user.name)}>
                <Text style={styles.userAvatar}>{user.name.charAt(0).toUpperCase()}</Text>
                <Text style={styles.userName}>{user.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', paddingHorizontal: 24, alignItems: 'center' },
  logo: { fontSize: 72, marginBottom: 8 },
  title: { fontSize: 36, fontWeight: 'bold', color: '#1B5E20' },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 40 },
  inputSection: { width: '100%', marginBottom: 30 },
  label: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 12 },
  input: {
    width: '100%', height: 60, borderWidth: 2, borderColor: '#1B5E20', borderRadius: 16,
    paddingHorizontal: 20, fontSize: 20, color: '#333', backgroundColor: '#fff',
  },
  loginBtn: {
    marginTop: 16, backgroundColor: '#1B5E20', paddingVertical: 18, borderRadius: 30, alignItems: 'center',
  },
  loginBtnDisabled: { backgroundColor: '#BDBDBD' },
  loginBtnText: { fontSize: 20, fontWeight: '700', color: '#fff' },
  existingSection: { width: '100%', marginTop: 20 },
  existingTitle: { fontSize: 15, color: '#666', marginBottom: 12 },
  userList: { flexDirection: 'row' },
  userChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 25,
    marginRight: 10, elevation: 2,
  },
  userAvatar: { fontSize: 18, fontWeight: 'bold', color: '#1B5E20', marginRight: 8 },
  userName: { fontSize: 16, color: '#333' },
});
