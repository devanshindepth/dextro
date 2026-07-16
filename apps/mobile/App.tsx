import React, { useState } from 'react';
import { StyleSheet, View, SafeAreaView, TextInput, ScrollView, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
} from '@expo-google-fonts/geist';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';

import { theme } from './src/theme';
import { Header } from './src/components/layout/Header';
import { MessageBubble } from './src/components/chat/MessageBubble';
import { ToolExecutionCard } from './src/components/chat/ToolExecutionCard';
import { Button } from './src/components/ui/Button';

// Mock Data for UI Demonstration
const MOCK_MESSAGES = [
  { id: '1', role: 'user' as const, content: 'Can you compile the typescript for the daemon package?' },
  { id: '2', role: 'agent' as const, content: 'Sure, I will execute the build command in the daemon workspace.' },
];

const MOCK_TOOL = {
  id: 't1',
  command: 'npm run build',
  status: 'pending_approval' as const,
  requiresHost: true,
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    JetBrainsMono_400Regular,
  });

  const [activeScreen, setActiveScreen] = useState<'chat' | 'settings'>('chat');
  const [mockToolStatus, setMockToolStatus] = useState<typeof MOCK_TOOL.status | 'queued' | 'running' | 'completed' | 'failed'>(MOCK_TOOL.status);

  if (!fontsLoaded) {
    return null; // or a sleek loading spinner
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <Header projectName="dextro-monorepo" isDaemonOnline={false} />

      {activeScreen === 'settings' ? (
        <View style={styles.settingsContainer}>
          <Button 
            title="← Back to Chat" 
            variant="secondary" 
            onPress={() => setActiveScreen('chat')}
            style={styles.backButton}
          />
          <View style={styles.settingsForm}>
            <Text style={styles.settingsTitle}>Bring Your Own Key (BYOK)</Text>
            <Text style={styles.settingsSubtitle}>Configure your LLM provider and Git repository.</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>OpenAI API Key</Text>
              <TextInput 
                style={styles.settingsInput} 
                placeholder="sk-..." 
                placeholderTextColor={theme.colors.border}
                secureTextEntry
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Project Repository URL</Text>
              <TextInput 
                style={styles.settingsInput} 
                placeholder="https://github.com/user/repo.git" 
                placeholderTextColor={theme.colors.border}
              />
            </View>

            <Button title="Save Configuration" onPress={() => setActiveScreen('chat')} style={styles.saveBtn} />
          </View>
        </View>
      ) : (
        <View style={styles.chatContainer}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {MOCK_MESSAGES.map((msg) => (
              <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
            ))}
            
            <ToolExecutionCard 
              tool={{ ...MOCK_TOOL, status: mockToolStatus }}
              onApprove={() => setMockToolStatus('queued')}
              onReject={() => setMockToolStatus('failed')}
            />
          </ScrollView>

          <View style={styles.inputArea}>
            <TextInput 
              style={styles.input} 
              placeholder="Ask the agent..." 
              placeholderTextColor={theme.colors.muted}
            />
            <Button title="Send" onPress={() => {}} />
            <Button 
              title="⚙️" 
              variant="secondary" 
              onPress={() => setActiveScreen('settings')} 
              style={styles.settingsBtn}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  chatContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: theme.spacing.md,
  },
  inputArea: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    color: theme.colors.foreground,
    fontFamily: 'Geist_400Regular',
  },
  settingsBtn: {
    paddingHorizontal: theme.spacing.sm,
  },
  settingsContainer: {
    flex: 1,
    padding: theme.spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.lg,
  },
  settingsForm: {
    flex: 1,
    marginTop: theme.spacing.lg,
  },
  settingsTitle: {
    fontFamily: 'Geist_600SemiBold',
    fontSize: theme.typography.sizes.lg,
    color: theme.colors.foreground,
    marginBottom: theme.spacing.xs,
  },
  settingsSubtitle: {
    fontFamily: 'Geist_400Regular',
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.muted,
    marginBottom: theme.spacing.xl,
  },
  inputGroup: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontFamily: 'Geist_500Medium',
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.foreground,
    marginBottom: theme.spacing.sm,
  },
  settingsInput: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    color: theme.colors.foreground,
    fontFamily: 'JetBrainsMono_400Regular', // Using mono for keys/urls
  },
  saveBtn: {
    marginTop: theme.spacing.xl,
  }
});
