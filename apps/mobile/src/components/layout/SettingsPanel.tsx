import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
  Platform,
} from 'react-native';
import { useTheme } from '../../theme';
import {
  X,
  Sun,
  Moon,
  FolderOpen,
  Plus,
  GitBranch,
  ChevronDown,
  Shield,
  Cpu,
  FileSearch,
  Globe,
  Terminal,
  Box,
  Wrench,
} from 'lucide-react-native';

import { Eye, EyeOff } from 'lucide-react-native';
import type { GroupedSessions } from '../../utils/session-utils';

// ─── Nav items (left sidebar) ─────────────────────────────────────────────────
type NavSection =
  | 'general'
  | 'account'
  | 'permissions'
  | 'appearance'
  | 'models'
  | 'customizations'
  | 'browser'
  | 'app'
  | 'project'; // dynamic project

const GLOBAL_NAV: { id: NavSection; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'account', label: 'Account' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'models', label: 'Models' },
  { id: 'customizations', label: 'Customizations' },
  { id: 'browser', label: 'Browser' },
  { id: 'app', label: 'App' },
];


interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
  /** When set, the panel opens directly on that project's settings page */
  initialProject?: string;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  modelName: string;
  onModelNameChange: (name: string) => void;
  repoUrl: string;
  onRepoUrlChange: (url: string) => void;
  onSave: () => void;
  sessions: GroupedSessions[];
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  visible,
  onClose,
  initialProject,
  apiKey,
  onApiKeyChange,
  modelName,
  onModelNameChange,
  repoUrl,
  onRepoUrlChange,
  onSave,
  sessions,
}) => {
  const { colors, spacing, radius, typography, mode, toggleTheme } = useTheme();

  const projectNames = sessions.map(s => s.name);

  const [activeSection, setActiveSection] = useState<NavSection>(
    initialProject ? 'project' : 'general'
  );
  const [activeProject, setActiveProject] = useState<string>(
    initialProject ?? (projectNames[0] || 'No Project')
  );

  const styles = makeStyles(colors, spacing, radius, typography);

  // Re-sync when prop changes (e.g. opened from a specific project)
  React.useEffect(() => {
    if (visible) {
      if (initialProject) {
        setActiveSection('project');
        setActiveProject(initialProject);
      } else {
        setActiveSection('general');
      }
    }
  }, [visible, initialProject]);

  if (!visible) return null;

  // ─── Right-panel content ──────────────────────────────────────────────────
  const renderContent = () => {
    if (activeSection === 'project') {
      return <ProjectSettings projectName={activeProject} styles={styles} colors={colors} spacing={spacing} radius={radius} typography={typography} />;
    }
    if (activeSection === 'models') {
      return <ModelsSettings 
        apiKey={apiKey} 
        onApiKeyChange={onApiKeyChange}
        modelName={modelName}
        onModelNameChange={onModelNameChange}
        styles={styles} 
        colors={colors} 
        spacing={spacing} 
        radius={radius} 
        typography={typography} 
      />;
    }
    if (activeSection === 'appearance') {
      return (
        <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.contentTitle}>Appearance</Text>
          <Text style={styles.contentDesc}>Customize the look of Dextro.</Text>

          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                {mode === 'dark'
                  ? <Moon color={colors.accentPurple} size={18} strokeWidth={1.5} />
                  : <Sun color={colors.accentAmber} size={18} strokeWidth={1.5} />
                }
                <View>
                  <Text style={styles.settingLabel}>{mode === 'dark' ? 'Dark Mode' : 'Light Mode'}</Text>
                  <Text style={styles.settingDescription}>{mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}</Text>
                </View>
              </View>
              <Switch
                value={mode === 'light'}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.surfaceActive, true: colors.accentBlue }}
                thumbColor={mode === 'light' ? '#FFFFFF' : colors.muted}
              />
            </View>
          </View>
        </ScrollView>
      );
    }
    // Default placeholder for other sections
    return (
      <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.contentTitle}>{GLOBAL_NAV.find(n => n.id === activeSection)?.label ?? 'Settings'}</Text>
        <Text style={styles.contentDesc}>This section is coming soon.</Text>
      </ScrollView>
    );
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Backdrop */}
      <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1} />

      {/* Main modal panel */}
      <View style={styles.modal}>
        {/* ── Left nav sidebar ── */}
        <View style={styles.navSidebar}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Global settings */}
            {GLOBAL_NAV.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.navItem,
                  activeSection === item.id && styles.navItemActive,
                ]}
                onPress={() => setActiveSection(item.id)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.navItemText,
                  activeSection === item.id && styles.navItemTextActive,
                ]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={styles.navDivider} />

            {/* Projects subsection */}
            <Text style={styles.navGroupLabel}>Projects</Text>
            {projectNames.map((proj) => (
              <TouchableOpacity
                key={proj}
                style={[
                  styles.navItem,
                  activeSection === 'project' && activeProject === proj && styles.navItemActive,
                ]}
                onPress={() => {
                  setActiveSection('project');
                  setActiveProject(proj);
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.navItemText,
                  activeSection === 'project' && activeProject === proj && styles.navItemTextActive,
                ]}>
                  {proj}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={styles.navDivider} />

            {/* Extras */}
            <Text style={styles.navGroupLabel}>Not in Project</Text>
            <TouchableOpacity style={styles.navItem} activeOpacity={0.7}>
              <Text style={styles.navItemText}>Conversations</Text>
            </TouchableOpacity>

            <View style={styles.navDivider} />

            <TouchableOpacity style={styles.navItem} activeOpacity={0.7}>
              <Text style={styles.navItemText}>Shortcuts</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navItem} activeOpacity={0.7}>
              <Text style={styles.navItemText}>Provide Feedback</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* ── Right content area ── */}
        <View style={styles.contentArea}>
          {/* Close button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <X color={colors.muted} size={18} strokeWidth={1.5} />
          </TouchableOpacity>

          {renderContent()}
        </View>
      </View>
    </View>
  );
};

// ─── Models Settings content ────────────────────────────────────────────────────
const ModelsSettings: React.FC<{
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  modelName: string;
  onModelNameChange: (name: string) => void;
  styles: any;
  colors: any;
  spacing: any;
  radius: any;
  typography: any;
}> = ({ apiKey, onApiKeyChange, modelName, onModelNameChange, styles, colors, spacing, radius, typography }) => {
  const [showKey, setShowKey] = useState(false);

  return (
    <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.contentTitle}>Models</Text>
      <Text style={styles.contentDesc}>Configure your AI models and API keys.</Text>

      <View style={styles.settingCard}>
        <Text style={styles.settingLabel}>Model Name</Text>
        <TextInput
          style={[styles.textInput, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
          value={modelName}
          onChangeText={onModelNameChange}
          placeholder="e.g. claude-3-5-sonnet-20240620"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
        />

        <View style={{ height: spacing.md }} />

        <Text style={styles.settingLabel}>API Key</Text>
        <View style={[styles.passwordInputContainer, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <TextInput
            style={[styles.passwordInput, { color: colors.foreground }]}
            value={apiKey}
            onChangeText={onApiKeyChange}
            placeholder="sk-..."
            placeholderTextColor={colors.muted}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity onPress={() => setShowKey(!showKey)} style={styles.eyeIconBtn}>
            {showKey ? <EyeOff color={colors.muted} size={18} /> : <Eye color={colors.muted} size={18} />}
          </TouchableOpacity>
        </View>
        <Text style={[styles.settingDescription, { marginTop: 6 }]}>Keys are stored securely on device using SecureStore.</Text>
      </View>
    </ScrollView>
  );
};

// ─── Project Settings content ─────────────────────────────────────────────────
const ProjectSettings: React.FC<{
  projectName: string;
  styles: any;
  colors: any;
  spacing: any;
  radius: any;
  typography: any;
}> = ({ projectName, styles, colors, spacing, radius, typography }) => {
  const PERMISSION_ITEMS = [
    { icon: FileSearch, label: 'File Access Rules', desc: 'Configure allowed and denied paths for file reads and writes.' },
    { icon: Globe, label: 'Network Access Rules', desc: 'Configure allowed and denied URLs for reading.', badge: '2' },
    { icon: Terminal, label: 'Terminal Commands', desc: 'Configure allowed terminal commands.' },
    { icon: Box, label: 'Commands Outside Sandbox', desc: 'Configure allowed commands outside the sandbox.' },
    { icon: Wrench, label: 'MCP Tools', desc: 'Configure external tools via Model Context Protocol.' },
  ];

  return (
    <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.contentTitle}>Manage project folders, agent settings, and permissions.</Text>

      {/* ── Folders ── */}
      <Text style={styles.projectSectionLabel}>Folders</Text>
      <View style={styles.foldersCard}>
        <View style={styles.folderRow}>
          <FolderOpen color={colors.muted} size={15} strokeWidth={1.5} />
          <Text style={styles.folderName}>{projectName}/</Text>
          <GitBranch color={colors.muted} size={13} strokeWidth={1.5} />
          <Text style={styles.folderBranch}>master</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity activeOpacity={0.7}>
            <X color={colors.muted} size={14} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>
        <View style={styles.folderDivider} />
        <TouchableOpacity style={styles.addFolderBtn} activeOpacity={0.8}>
          <Plus color={colors.muted} size={15} strokeWidth={1.5} />
          <Text style={styles.addFolderText}>Add Folder</Text>
        </TouchableOpacity>
      </View>

      {/* ── Agent Settings ── */}
      <Text style={styles.projectSectionLabel}>Agent Settings</Text>
      <View style={styles.settingCard}>
        <View style={styles.agentSettingRow}>
          <View style={styles.agentSettingInfo}>
            <Text style={styles.settingLabel}>Security Preset</Text>
            <Text style={styles.settingDescription}>
              Choose a predefined security preset for the agent. This controls terminal auto-execution policy, and file access policy.
            </Text>
          </View>
          <TouchableOpacity style={styles.dropdownPill} activeOpacity={0.8}>
            <Text style={styles.dropdownPillText}>Turbo Mode</Text>
            <ChevronDown color={colors.mutedForeground} size={14} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Agent Behavior ── */}
      <Text style={styles.projectSectionLabel}>Agent Behavior</Text>
      <View style={styles.settingCard}>
        <View style={styles.agentSettingRow}>
          <View style={styles.agentSettingInfo}>
            <Text style={styles.settingLabel}>Artifact Review Policy</Text>
            <Text style={styles.settingDescription}>
              Specifies Agent's behavior when asking for review on artifacts, which are documents it creates to enable a richer conversation experience.
            </Text>
          </View>
          <TouchableOpacity style={styles.dropdownPill} activeOpacity={0.8}>
            <Text style={styles.dropdownPillText}>Always Ask</Text>
            <ChevronDown color={colors.mutedForeground} size={14} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Local Permissions ── */}
      <Text style={styles.projectSectionLabel}>Local Permissions</Text>
      <Text style={styles.permissionsNote}>
        Inherits from{' '}
        <Text style={{ color: colors.accentBlue }}>global settings</Text>
        {'. '}Local permissions have higher priority.{' '}
        <Text style={{ color: colors.accentBlue }}>Learn more.</Text>
      </Text>
      <View style={styles.settingCard}>
        {PERMISSION_ITEMS.map((item, idx) => (
          <View key={item.label}>
            <View style={styles.permissionRow}>
              <View style={styles.permissionInfo}>
                <Text style={styles.settingLabel}>
                  {item.label}
                  {item.badge ? (
                    <Text style={styles.permissionBadgeInline}> {item.badge}</Text>
                  ) : null}
                </Text>
                <Text style={styles.settingDescription}>{item.desc}</Text>
              </View>
              <TouchableOpacity style={styles.openBtn} activeOpacity={0.8}>
                <Text style={styles.openBtnText}>Open</Text>
              </TouchableOpacity>
            </View>
            {idx < PERMISSION_ITEMS.length - 1 && <View style={styles.folderDivider} />}
          </View>
        ))}
      </View>

      <View style={{ height: spacing.xl * 2 }} />
    </ScrollView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const makeStyles = (colors: any, spacing: any, radius: any, typography: any) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlayBg,
    },
    modal: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 60 : 40,
      bottom: Platform.OS === 'ios' ? 20 : 16,
      left: 16,
      right: 16,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    // ── Left nav ──
    navSidebar: {
      width: 180,
      backgroundColor: colors.background,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },
    navItem: {
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderRadius: radius.sm,
      marginHorizontal: spacing.xs,
    },
    navItemActive: {
      backgroundColor: colors.surfaceHover,
    },
    navItemText: {
      fontFamily: typography.fonts.ui,
      fontSize: typography.sizes.sm,
      color: colors.sidebarText,
    },
    navItemTextActive: {
      color: colors.foreground,
      fontFamily: typography.fonts.uiMedium,
    },
    navDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: spacing.md,
      marginVertical: spacing.sm,
    },
    navGroupLabel: {
      fontFamily: typography.fonts.uiMedium,
      fontSize: typography.sizes.xs,
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.xs,
      marginTop: spacing.xs,
    },
    // ── Right content ──
    contentArea: {
      flex: 1,
      position: 'relative',
    },
    closeBtn: {
      position: 'absolute',
      top: spacing.md,
      right: spacing.md,
      width: 30,
      height: 30,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceHover,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
    },
    contentScroll: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    contentTitle: {
      fontFamily: typography.fonts.uiSemiBold,
      fontSize: typography.sizes.md,
      color: colors.foreground,
      marginBottom: spacing.xs,
      paddingRight: 36, // space for close button
    },
    contentDesc: {
      fontFamily: typography.fonts.ui,
      fontSize: typography.sizes.sm,
      color: colors.muted,
      marginBottom: spacing.lg,
    },
    // ── Project settings specific ──
    projectSectionLabel: {
      fontFamily: typography.fonts.uiSemiBold,
      fontSize: typography.sizes.sm,
      color: colors.foreground,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    foldersCard: {
      backgroundColor: colors.background,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    folderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
    },
    folderName: {
      fontFamily: typography.fonts.uiMedium,
      fontSize: typography.sizes.sm,
      color: colors.foreground,
    },
    folderBranch: {
      fontFamily: typography.fonts.ui,
      fontSize: typography.sizes.sm,
      color: colors.muted,
    },
    folderDivider: {
      height: 1,
      backgroundColor: colors.border,
    },
    addFolderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm + 2,
    },
    addFolderText: {
      fontFamily: typography.fonts.uiMedium,
      fontSize: typography.sizes.sm,
      color: colors.muted,
    },
    settingCard: {
      backgroundColor: colors.background,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      marginBottom: spacing.xs,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    settingLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
    },
    agentSettingRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    agentSettingInfo: {
      flex: 1,
    },
    settingLabel: {
      fontFamily: typography.fonts.uiMedium,
      fontSize: typography.sizes.sm,
      color: colors.foreground,
      marginBottom: 3,
    },
    settingDescription: {
      fontFamily: typography.fonts.ui,
      fontSize: typography.sizes.xs,
      color: colors.muted,
      lineHeight: 16,
    },
    dropdownPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceHover,
      borderWidth: 1,
      borderColor: colors.border,
      minWidth: 110,
    },
    dropdownPillText: {
      fontFamily: typography.fonts.uiMedium,
      fontSize: typography.sizes.xs,
      color: colors.foreground,
      flex: 1,
    },
    permissionsNote: {
      fontFamily: typography.fonts.ui,
      fontSize: typography.sizes.xs,
      color: colors.muted,
      marginBottom: spacing.sm,
      lineHeight: 18,
    },
    permissionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      gap: spacing.md,
    },
    permissionInfo: {
      flex: 1,
    },
    permissionBadgeInline: {
      color: colors.accentBlue,
      fontFamily: typography.fonts.uiMedium,
    },
    openBtn: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceHover,
      borderWidth: 1,
      borderColor: colors.border,
    },
    openBtnText: {
      fontFamily: typography.fonts.uiMedium,
      fontSize: typography.sizes.xs,
      color: colors.foreground,
    },
    textInput: {
      fontFamily: typography.fonts.ui,
      fontSize: typography.sizes.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      marginTop: spacing.xs,
    },
    passwordInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: radius.sm,
      marginTop: spacing.xs,
    },
    passwordInput: {
      flex: 1,
      fontFamily: typography.fonts.ui,
      fontSize: typography.sizes.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    eyeIconBtn: {
      padding: spacing.sm,
    },
  });
