import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>എന്തോ പിശക് സംഭവിച്ചു</Text>
          <Text style={styles.subtitle}>Something went wrong</Text>
          <Text style={styles.error}>{this.state.error?.message || 'Unknown error'}</Text>
          <TouchableOpacity style={styles.btn} onPress={this.handleReset}>
            <Text style={styles.btnText}>വീണ്ടും ശ്രമിക്കുക (Retry)</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#FAFBFC' },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#6B7280', marginTop: 4 },
  error: { fontSize: 13, color: '#9CA3AF', marginTop: 16, textAlign: 'center', maxWidth: 300 },
  btn: { marginTop: 32, paddingHorizontal: 32, paddingVertical: 16, backgroundColor: '#0D7C66', borderRadius: 28 },
  btnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
