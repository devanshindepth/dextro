import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, SafeAreaView, TextInput, ScrollView, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import {
  useFonts,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
} from '@expo-google-fonts/geist';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';

import { theme } from './src/theme';
import { Header, GitSyncStatus } from './src/components/layout/Header';
import { MessageBubble } from './src/components/chat/MessageBubble';
import { ToolExecutionCard } from './src/components/chat/ToolExecutionCard';
import { Button } from './src/components/ui/Button';

// Internal Core Logic
import { AgentOrchestrator } from 'shared-core/src/orchestrator';
import { executeToolLocally } from './src/executor';
import type { AgentSession, ToolExecution } from 'core-types';

const orchestrator = new AgentOrchestrator();

export default function App() {
  const [fontsLoaded] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    JetBrainsMono_400Regular,
  });

  const [activeScreen, setActiveScreen] = useState<'chat' | 'settings'>('settings');
  const [session, setSession] = useState<AgentSession | null>(null);
  
  // Settings State
  const [apiKey, setApiKey] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  
  // Chat State
  const [inputText, setInputText] = useState('');
  const [gitStatus, setGitStatus] = useState<GitSyncStatus>('synced');
  
  // To trigger re-renders when orchestrator updates internal arrays
  const [tick, setTick] = useState(0);
  const forceUpdate = () => setTick(t => t + 1);

  useEffect(() => {
    // Load Settings
    SecureStore.getItemAsync('openai_key').then(val => {
      if (val) setApiKey(val);
      if (val) setActiveScreen('chat'); // Auto-skip to chat if configured
    });
    SecureStore.getItemAsync('repo_url').then(val => {
      if (val) setRepoUrl(val);
    });
    
    // Initialize Session
    const rootPath = `${FileSystem.documentDirectory}repos/default_project`;
    const newSession = orchestrator.createSession(rootPath);
    setSession(newSession);
  }, []);

  const saveSettings = async () => {
    await SecureStore.setItemAsync('openai_key', apiKey);
    await SecureStore.setItemAsync('repo_url', repoUrl);
    setActiveScreen('chat');
  };

  const handleSend = async () => {
    if (!inputText.trim() || !session || !apiKey) return;
    const text = inputText;
    setInputText('');
    
    try {
      await orchestrator.processUserPrompt(session.id, text, apiKey);
      forceUpdate();
    } catch (e: any) {
      orchestrator.addMessage(session.id, { role: 'system', content: `Error: ${e.message}` });
      forceUpdate();
    }
  };

  const handleApproveTool = async (toolId: string) => {
    if (!session || !apiKey) return;
    try {
      const tool = orchestrator.queue.approve(toolId);
      forceUpdate();

      const output = await executeToolLocally(tool, session.projectPath, 'dummy_token'); // TODO: Git Token
      orchestrator.queue.updateStatus(toolId, 'completed', output);
      forceUpdate();

      // Automatically continue the LLM loop
      await orchestrator.continueSession(session.id, toolId, output, apiKey);
      forceUpdate();
    } catch (e: any) {
      orchestrator.queue.updateStatus(toolId, 'failed', undefined, e.message);
      forceUpdate();
      await orchestrator.continueSession(session.id, toolId, `Failed to execute tool: ${e.message}`, apiKey);
      forceUpdate();
    }
  };

  const handleRejectTool = async (toolId: string) => {
    if (!session || !apiKey) return;
    try {
      orchestrator.queue.reject(toolId, 'User rejected the action via UI.');
      forceUpdate();
      
      await orchestrator.continueSession(session.id, toolId, `Tool execution was rejected by the user.`, apiKey);
      forceUpdate();
    } catch (e: any) {
      console.error(e);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <Header projectName={repoUrl ? repoUrl.split('/').pop() || 'dextro' : 'dextro'} gitStatus={gitStatus} />

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
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>OpenAI API Key</Text>
              <TextInput 
                style={styles.settingsInput} 
                placeholder="sk-..." 
                placeholderTextColor={theme.colors.border}
                secureTextEntry
                value={apiKey}
                onChangeText={setApiKey}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Project Repository URL</Text>
              <TextInput 
                style={styles.settingsInput} 
                placeholder="https://github.com/user/repo.git" 
                placeholderTextColor={theme.colors.border}
                value={repoUrl}
                onChangeText={setRepoUrl}
              />
            </View>

            <Button title="Save Configuration" onPress={saveSettings} style={styles.saveBtn} />
          </View>
        </View>
      ) : (
        <View style={styles.chatContainer}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {session?.messages.map((msg) => (
              <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
            ))}
            
            {session?.toolQueue.map((tool: ToolExecution) => (
              <ToolExecutionCard 
                key={tool.id}
                tool={tool}
                onApprove={() => handleApproveTool(tool.id)}
                onReject={() => handleRejectTool(tool.id)}
              />
            ))}
          </ScrollView>

          <View style={styles.inputArea}>
            <TextInput 
              style={styles.input} 
              placeholder="Ask the agent..." 
              placeholderTextColor={theme.colors.muted}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
            />
            <Button title="Send" onPress={handleSend} />
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
    fontFamily: 'JetBrainsMono_400Regular',
  },
  saveBtn: {
    marginTop: theme.spacing.xl,
  }
});
