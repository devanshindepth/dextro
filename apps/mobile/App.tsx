import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  ScrollView,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Font from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Theme ────────────────────────────────────────────────────────────────────
import { ThemeProvider, useTheme } from './src/theme';

// ─── Components ───────────────────────────────────────────────────────────────
import { Header, GitSyncStatus } from './src/components/layout/Header';
import { Sidebar } from './src/components/layout/Sidebar';
import { SettingsPanel } from './src/components/layout/SettingsPanel';
import { NewChatView } from './src/components/chat/NewChatView';
import { MessageBubble } from './src/components/chat/MessageBubble';
import { ToolExecutionCard } from './src/components/chat/ToolExecutionCard';
import { ThinkingIndicator } from './src/components/chat/ThinkingIndicator';
import { SetupWizard } from './src/components/onboarding/SetupWizard';
import { TerminalView } from './src/components/terminal/TerminalView';

// ─── Core Logic ───────────────────────────────────────────────────────────────
import { AgentOrchestrator, getModelInfo, inferProvider } from 'shared-core';
import { executeToolLocally } from './src/executor';
import type { AgentSession, ToolExecution, SetupStatus } from 'core-types';

// ─── Store ────────────────────────────────────────────────────────────────────
import {
  loadAllSessions,
  saveSession,
  appendMessage,
  upsertToolExecution,
} from './src/store/session-store';
import {
  loadSettings,
  getApiKey,
  getGithubToken,
  saveSettings,
  setApiKey as saveApiKey,
} from './src/store/settings-store';
import { groupSessionsByProject } from './src/utils/session-utils';

// ─── Shared Storage Root ─────────────────────────────────────────────────────
const SHARED_PROJECTS_ROOT = '/storage/emulated/0/Dextro/projects';

// ─── Orchestrator (singleton) ─────────────────────────────────────────────────
const orchestrator = new AgentOrchestrator();

// ─── Inner App ────────────────────────────────────────────────────────────────
function DextroApp() {
  const { colors, mode, spacing } = useTheme();

  // ── Loading / Setup ──────────────────────────────────────────────────────
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [setupState, setSetupState] = useState<'loading' | 'incomplete' | 'completed'>('loading');
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);

  // ── Sessions ─────────────────────────────────────────────────────────────
  const [session, setSession] = useState<AgentSession | null>(null);
  const [allSessions, setAllSessions] = useState<AgentSession[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();

  // ── Nav ──────────────────────────────────────────────────────────────────
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [settingsProject, setSettingsProject] = useState<string | undefined>();

  // ── Settings ─────────────────────────────────────────────────────────────
  const [apiKey, setApiKey] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-5');
  const [repoUrl, setRepoUrl] = useState('');

  // ── Agent State ───────────────────────────────────────────────────────────
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState('Dextro is thinking');
  const [inputText, setInputText] = useState('');
  const [gitStatus] = useState<GitSyncStatus>('synced');
  const [tick, setTick] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Scroll ────────────────────────────────────────────────────────────────
  const scrollViewRef = useRef<ScrollView>(null);

  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  // ── Font Loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    Font.loadAsync({
      'GeistPixel-Regular': require('./GeistFonts/GeistPixel-Regular.ttf'),
      'GeistPixel-Medium': require('./GeistFonts/GeistPixel-Medium.ttf'),
      'GeistPixel-SemiBold': require('./GeistFonts/GeistPixel-SemiBold.ttf'),
      'GeistMono-Regular': require('./GeistFonts/GeistMono-Regular.ttf'),
    }).then(() => setFontsLoaded(true));
  }, []);

  // ── Initial Load ──────────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        // Load persisted settings
        const [settings, savedSessions] = await Promise.all([
          loadSettings(),
          loadAllSessions(),
        ]);

        if (!isMounted) return;

        setAllSessions(savedSessions);
        setSelectedModel(settings.defaultModel);

        const key = await getApiKey(settings.defaultProvider);
        if (key) setApiKey(key);

        const token = await getGithubToken();
        if (token) setGithubToken(token);

        // Check if setup was previously completed
        const setupFlag = await AsyncStorage.getItem('@setup_complete');
        // If API key is missing or setup wasn't complete, we drop to the setup wizard
        if (setupFlag === 'true') {
          setSetupState('completed');
        } else {
          setSetupState('incomplete');
        }
      } catch (err) {
        // Fail closed to wizard on any storage exception
        if (isMounted) setSetupState('incomplete');
        console.warn('Boot initialization failed:', err);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // ── Orchestrator Callbacks ────────────────────────────────────────────────
  useEffect(() => {
    orchestrator.setCallbacks({
      onText: (sessionId, _chunk) => {
        if (session?.id === sessionId) forceUpdate();
      },

      onToolProposed: (sessionId, tool) => {
        if (session?.id !== sessionId) return;

        // Auto-approved tools need to be executed immediately
        if (tool.status === 'running') {
          executeAutoTool(tool);
        }
        forceUpdate();
      },

      onToolStreamChunk: (sessionId, toolId, chunk) => {
        if (session?.id !== sessionId) return;
        orchestrator.queue.updateStreamingOutput(toolId, chunk);
        forceUpdate();
      },

      onTurnComplete: (sessionId) => {
        if (session?.id === sessionId) {
          setIsAgentRunning(false);
          setThinkingLabel('Dextro is thinking');
          persistSession(sessionId);
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }
      },

      onError: (sessionId, error) => {
        if (session?.id === sessionId) {
          setIsAgentRunning(false);
          console.error('[Orchestrator]', error);
        }
      },

      onStateChange: (sessionId) => {
        if (session?.id === sessionId) {
          forceUpdate();
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }
      },
    });
  }, [session, forceUpdate]);

  // ── Execute an auto-approved tool (tier: auto, or confirm in standard preset) ──
  const executeAutoTool = useCallback(async (tool: ToolExecution) => {
    if (!session) return;

    const currentApiKey = apiKey;
    const projectRoot = session.settings.projectPath;

    try {
      const output = await executeToolLocally(tool, projectRoot, githubToken, {
        onChunk: (toolId, chunk) => {
          orchestrator.queue.updateStreamingOutput(toolId, chunk);
          setThinkingLabel(`Running: ${tool.toolName}`);
          forceUpdate();
        },
      }, abortControllerRef.current?.signal);

      orchestrator.queue.updateStatus(tool.id, 'completed', output);
      forceUpdate();
      await upsertToolExecution(session.id, { ...tool, status: 'completed', output });

      await orchestrator.continueAfterTool(
        session.id, tool.id, output, false, currentApiKey,
        abortControllerRef.current?.signal
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      orchestrator.queue.updateStatus(tool.id, 'failed', undefined, errorMsg);
      forceUpdate();
      await upsertToolExecution(session.id, { ...tool, status: 'failed', error: errorMsg });

      await orchestrator.continueAfterTool(
        session.id, tool.id, `Error: ${errorMsg}`, true, currentApiKey,
        abortControllerRef.current?.signal
      );
    }
  }, [session, apiKey, githubToken, forceUpdate]);

  // ── Create a new session ──────────────────────────────────────────────────
  const createNewSession = useCallback(async (projectName = 'default_project', model = selectedModel) => {
    const provider = inferProvider(model);
    const projectPath = `${SHARED_PROJECTS_ROOT}/${projectName}`;

    const newSession = orchestrator.createSession(projectPath, {
      provider,
      model,
      securityPreset: 'standard',
    });

    await saveSession(newSession);
    setAllSessions((prev) => [newSession, ...prev]);
    setSession(newSession);
    setActiveConversationId(newSession.id);
    return newSession;
  }, [selectedModel]);

  // ── Persist session to SQLite ──────────────────────────────────────────────
  const persistSession = useCallback(async (sessionId: string) => {
    const s = orchestrator.getSession(sessionId);
    if (!s) return;
    await saveSession(s);
    // Persist new messages
    for (const msg of s.messages) {
      if (!msg.isStreaming) await appendMessage(sessionId, msg);
    }
  }, []);

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async (text: string, model: string, _worktree: string) => {
    if (!text.trim() || !apiKey) return;

    let activeSession = session;
    if (!activeSession) {
      activeSession = await createNewSession('default_project', model);
    }

    // Update model if it changed
    if (model !== activeSession.settings.model) {
      orchestrator.updateSessionSettings(activeSession.id, {
        model,
        provider: inferProvider(model),
      });
    }

    const abort = new AbortController();
    abortControllerRef.current = abort;
    setIsAgentRunning(true);
    setInputText('');

    try {
      await orchestrator.processUserPrompt(activeSession.id, text, apiKey, abort.signal);
    } finally {
      setIsAgentRunning(false);
    }
  }, [session, apiKey, createNewSession]);

  const handleSendFromInput = useCallback(async () => {
    if (!inputText.trim()) return;
    await handleSend(inputText, selectedModel, 'local');
  }, [inputText, selectedModel, handleSend]);

  // ── Approve a tool ────────────────────────────────────────────────────────
  const handleApproveTool = useCallback(async (toolId: string) => {
    if (!session || !apiKey) return;

    const tool = orchestrator.queue.approve(toolId);
    forceUpdate();

    try {
      const output = await executeToolLocally(tool, session.settings.projectPath, githubToken, {
        onChunk: (tid, chunk) => {
          orchestrator.queue.updateStreamingOutput(tid, chunk);
          setThinkingLabel(`Running: ${tool.toolName}`);
          forceUpdate();
        },
      }, abortControllerRef.current?.signal);

      orchestrator.queue.updateStatus(toolId, 'completed', output);
      forceUpdate();
      await upsertToolExecution(session.id, { ...tool, status: 'completed', output });

      setIsAgentRunning(true);
      await orchestrator.continueAfterTool(
        session.id, toolId, output, false, apiKey,
        abortControllerRef.current?.signal
      );
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      orchestrator.queue.updateStatus(toolId, 'failed', undefined, errorMsg);
      forceUpdate();
      await upsertToolExecution(session.id, { ...tool, status: 'failed', error: errorMsg });

      setIsAgentRunning(true);
      await orchestrator.continueAfterTool(
        session.id, toolId, `Error: ${errorMsg}`, true, apiKey,
        abortControllerRef.current?.signal
      );
    } finally {
      setIsAgentRunning(false);
    }
  }, [session, apiKey, githubToken, forceUpdate]);

  // ── Reject a tool ─────────────────────────────────────────────────────────
  const handleRejectTool = useCallback(async (toolId: string) => {
    if (!session || !apiKey) return;
    orchestrator.queue.reject(toolId, 'User rejected the action.');
    forceUpdate();

    setIsAgentRunning(true);
    try {
      await orchestrator.continueAfterTool(
        session.id, toolId, 'Tool execution was rejected by the user.', false, apiKey,
        abortControllerRef.current?.signal
      );
    } finally {
      setIsAgentRunning(false);
    }
  }, [session, apiKey, forceUpdate]);

  // ── Stop agent ────────────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsAgentRunning(false);
  }, []);

  // ── New conversation ──────────────────────────────────────────────────────
  const handleNewConversation = useCallback(() => {
    setSession(null);
    setActiveConversationId(undefined);
    setIsSidebarOpen(false);
  }, []);

  // ── Select conversation from sidebar ─────────────────────────────────────
  const handleSelectConversation = useCallback((id: string) => {
    const found = allSessions.find((s) => s.id === id);
    if (found) {
      setSession(found);
      setActiveConversationId(id);
    }
    setIsSidebarOpen(false);
  }, [allSessions]);

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!fontsLoaded || setupState === 'loading') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.accentBlue} size="large" />
      </View>
    );
  }

  if (setupState === 'incomplete') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <SetupWizard onComplete={async (status) => {
          setSetupStatus(status);
          try {
            await AsyncStorage.setItem('@setup_complete', 'true');
          } catch (e) {
            console.warn('Failed to save setup completion', e);
          }
          setSetupState('completed');
        }} />
      </SafeAreaView>
    );
  }

  const hasMessages = session && session.messages.length > 0;
  const projectName = session?.settings.remoteGitUrl?.split('/').pop()
    ?? session?.settings.projectPath.split('/').pop()
    ?? 'dextro';

  const hasPendingTools = session?.toolQueue.some(t => t.status === 'pending_approval');

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      {/* ─── Top Header ─── */}
      <Header
        projectName={projectName}
        gitStatus={gitStatus}
        onMenuPress={() => setIsSidebarOpen(true)}
        onTerminalPress={() => setIsTerminalOpen(true)}
      />

      {/* ─── Content Area ─── */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {hasMessages ? (
          <View style={styles.flex}>
            <ScrollView
              ref={scrollViewRef}
              style={styles.flex}
              contentContainerStyle={{ paddingVertical: spacing.md }}
              onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
            >
              {session.messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  isStreaming={msg.isStreaming}
                />
              ))}

              {session.toolQueue.map((tool: ToolExecution) => (
                <ToolExecutionCard
                  key={tool.id}
                  tool={tool}
                  onApprove={() => handleApproveTool(tool.id)}
                  onReject={() => handleRejectTool(tool.id)}
                />
              ))}

              {/* Thinking indicator */}
              <ThinkingIndicator
                visible={isAgentRunning && !hasPendingTools}
                label={thinkingLabel}
              />
            </ScrollView>

            {/* Active chat input bar */}
            <View style={[styles.chatInputBar, {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            }]}>
              <TextInput
                style={[styles.chatInput, {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.foreground,
                  fontFamily: 'GeistPixel-Regular',
                }]}
                placeholder="Ask the agent..."
                placeholderTextColor={colors.muted}
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={handleSendFromInput}
                returnKeyType="send"
                editable={!isAgentRunning}
                multiline
                maxLength={4000}
              />

              {isAgentRunning ? (
                <TouchableOpacity
                  style={[styles.sendIconBtn, { backgroundColor: colors.accentRed }]}
                  onPress={handleStop}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.sendBtnText, { color: '#FFFFFF', fontFamily: 'GeistPixel-Medium' }]}>■</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.sendIconBtn, {
                    backgroundColor: inputText.trim() ? colors.accentBlue : colors.surfaceHover,
                  }]}
                  onPress={handleSendFromInput}
                  activeOpacity={0.8}
                  disabled={!inputText.trim()}
                >
                  <Text style={[styles.sendBtnText, {
                    color: inputText.trim() ? '#FFFFFF' : colors.muted,
                    fontFamily: 'GeistPixel-Medium',
                  }]}>↑</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <NewChatView
            projectName={projectName}
            onSend={handleSend}
            onAttachFile={() => {}}
          />
        )}
      </KeyboardAvoidingView>

      {/* ─── In-House Terminal ─── */}
      {isTerminalOpen && (
        <View style={StyleSheet.absoluteFill}>
          <TerminalView 
            cwd={session?.settings.projectPath ?? `${SHARED_PROJECTS_ROOT}/${projectName}`} 
            onClose={() => setIsTerminalOpen(false)} 
          />
        </View>
      )}

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onNewConversation={handleNewConversation}
        onOpenSettings={() => {
          setIsSidebarOpen(false);
          setTimeout(() => setIsSettingsOpen(true), 250);
        }}
        onOpenProjectSettings={(proj) => {
          setTimeout(() => {
            setSettingsProject(proj);
            setIsSettingsOpen(true);
          }, 250);
        }}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        sessions={groupSessionsByProject(allSessions)}
      />

      <SettingsPanel
        visible={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialProject={settingsProject}
        apiKey={apiKey}
        onApiKeyChange={async (val) => {
          setApiKey(val);
          await saveApiKey(inferProvider(selectedModel), val);
        }}
        modelName={selectedModel}
        onModelNameChange={async (val) => {
          setSelectedModel(val);
          await saveSettings({ defaultModel: val, defaultProvider: inferProvider(val) });
        }}
        repoUrl={repoUrl}
        onRepoUrlChange={setRepoUrl}
        onSave={async () => {
          setIsSettingsOpen(false);
        }}
        sessions={groupSessionsByProject(allSessions)}
      />
    </SafeAreaView>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <DextroApp />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  chatInputBar: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    gap: 8,
    alignItems: 'flex-end',
  },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 44,
    maxHeight: 120,
  },
  sendIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: { fontSize: 18, fontWeight: '700' },
});
