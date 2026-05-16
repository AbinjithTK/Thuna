import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '../context/UserContext';
import { colors, spacing, radius, fontSize, shadow } from '../theme';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, allUsers } = useUser();
  const [name, setName] = useState('');

  const handleLogin = async () => {
    if (name.trim()) await login(name.trim());
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 60 }]}>
      {/* Logo */}
      <View style={styles.logoSection}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoEmoji}>🤝</Text>
        </View>
        <Text style={styles.appName}>Thuna</Text>
        <Text style={styles.tagline}>നിങ്ങളുടെ ആരോഗ്യ തുണ</Text>
        <Text style={styles.taglineEn}>Your Health Companion</Text>
      </View>

      {/* Input */}
      <View style={styles.inputSection}>
        <Text style={styles.label}>നിങ്ങളുടെ പേര്</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your name"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          onSubmitEditing={handleLogin}
          autoFocus
        />
        <TouchableOpacity
          style={[styles.btn, !name.trim() && styles.btnDisabled]}
          onPress={handleLogin}
          disabled={!name.trim()}>
          <Text style={styles.btnText}>തുടങ്ങുക</Text>
        </TouchableOpacity>
      </View>

      {/* Existing users */}
      {allUsers.length > 0 && (
        <View style={styles.usersSection}>
          <Text style={styles.usersTitle}>മുമ്പ് ലോഗിൻ ചെയ്തവർ</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {allUsers.map(user => (
              <TouchableOpacity key={user.id} style={styles.userCard} onPress={() => login(user.name)}>
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>{user.name.charAt(0).toUpperCase()}</Text>
                </View>
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
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  logoSection: { alignItems: 'center', marginBottom: 50 },
  logoCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center',
    ...shadow.md,
  },
  logoEmoji: { fontSize: 48 },
  appName: { fontSize: fontSize.hero, fontWeight: '800', color: colors.primary, marginTop: spacing.md },
  tagline: { fontSize: fontSize.lg, color: colors.textSecondary, marginTop: spacing.xs },
  taglineEn: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  inputSection: { width: '100%' },
  label: { fontSize: fontSize.lg, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.sm },
  input: {
    height: 64, borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg,
    paddingHorizontal: spacing.lg, fontSize: fontSize.xl, color: colors.textPrimary,
    backgroundColor: colors.bgSecondary,
  },
  btn: {
    marginTop: spacing.lg, height: 64, borderRadius: radius.xl,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    ...shadow.md,
  },
  btnDisabled: { backgroundColor: colors.border },
  btnText: { fontSize: fontSize.xl, fontWeight: '700', color: '#fff' },
  usersSection: { marginTop: 40, width: '100%' },
  usersTitle: { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.md },
  userCard: {
    alignItems: 'center', marginRight: spacing.md, padding: spacing.md,
    backgroundColor: colors.bgSecondary, borderRadius: radius.lg, minWidth: 80,
    ...shadow.sm,
  },
  userAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  userAvatarText: { fontSize: fontSize.xl, fontWeight: '700', color: colors.primary },
  userName: { fontSize: fontSize.sm, color: colors.textPrimary, marginTop: spacing.xs },
});
