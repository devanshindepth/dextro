import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  Platform,
} from 'react-native';
import { useTheme } from '../../theme';
import {
  Plus,
  Mic,
  Send,
  ChevronDown,
  GitBranch,
  Cpu,
  Bot,
} from 'lucide-react-native';

const MODELS = [
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', badge: 'HIGH' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', badge: 'FAST' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', badge: '' },
  { id: 'claude-sonnet', label: 'Claude Sonnet 4.5', badge: '' },
  { id: 'claude-haiku', label: 'Claude Haiku 3.5', badge: 'FAST' },
  { id: 'gpt-4o', label: 'GPT-4o', badge: '' },
];

const WORKTREES = [
  { id: 'local', label: 'Local', icon: 'local' },
  { id: 'main', label: 'main', icon: 'branch' },
  { id: 'dev', label: 'dev', icon: 'branch' },
  { id: 'feature/ui', label: 'feature/ui', icon: 'branch' },
];

interface NewChatViewProps {
  projectName: string;
  onSend: (text: string, model: string, worktree: string) => void;
  onAttachFile: () => void;
}

export const NewChatView: React.FC<NewChatViewProps> = ({
  projectName,
  onSend,
  onAttachFile,
}) => {
  const { colors, spacing, radius, typography } = useTheme();
  const [inputText, setInputText] = useState('');
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [selectedWorktree, setSelectedWorktree] = useState(WORKTREES[0]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showWorktreePicker, setShowWorktreePicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const styles = makeStyles(colors, spacing, radius, typography);

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSend(inputText.trim(), selectedModel.id, selectedWorktree.id);
    setInputText('');
  };

  const canSend = inputText.trim().length > 0;

  return (
    <View style={styles.container}>
      {/* Project selector — top left */}
      <View style={styles.projectRow}>
        <TouchableOpacity style={styles.projectSelector} activeOpacity={0.75}>
          <GitBranch color={colors.muted} size={14} strokeWidth={1.5} />
          <Text style={styles.projectSelectorText}>{projectName}</Text>
          <ChevronDown color={colors.muted} size={13} strokeWidth={1.5} />
        </TouchableOpacity>
      </View>

      {/* Empty state hint */}
      <View style={styles.emptyHint}>
        <View style={styles.agentIconContainer}>
          <Bot color={colors.muted} size={28} strokeWidth={1.5} />
        </View>
        <Text style={styles.emptyTitle}>What can I help you with?</Text>
        <Text style={styles.emptySubtitle}>@ to mention, / for actions</Text>
      </View>

      {/* ── Chat Input Card ── */}
      <View style={styles.inputCard}>
        {/* Row 1: Text input */}
        <TextInput
          style={styles.textInput}
          placeholder="Ask anything, @ to mention, / for actions"
          placeholderTextColor={colors.muted}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={4000}
          returnKeyType="default"
        />

        {/* Row 2: file-attach on left · mic + send on right */}
        <View style={styles.toolbar}>
          <View style={styles.toolbarLeft}>
            <TouchableOpacity style={styles.iconBtn} onPress={onAttachFile} activeOpacity={0.7}>
              <Plus color={colors.mutedForeground} size={18} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <View style={styles.toolbarRight}>
            {/* Mic */}
            <TouchableOpacity
              style={[styles.iconBtn, isRecording && styles.iconBtnActive]}
              onPress={() => setIsRecording(!isRecording)}
              activeOpacity={0.7}
            >
              <Mic
                color={isRecording ? colors.accentRed : colors.mutedForeground}
                size={17}
                strokeWidth={1.5}
              />
            </TouchableOpacity>

            {/* Send */}
            <TouchableOpacity
              style={[styles.sendBtn, canSend && styles.sendBtnActive]}
              onPress={handleSend}
              activeOpacity={0.8}
              disabled={!canSend}
            >
              <Send
                color={canSend ? '#FFFFFF' : colors.muted}
                size={15}
                strokeWidth={2}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Row 3: worktree on left · model selector on right */}
        <View style={styles.bottomBar}>
          {/* Worktree */}
          <TouchableOpacity
            style={styles.bottomBarBtn}
            onPress={() => setShowWorktreePicker(true)}
            activeOpacity={0.75}
          >
            <GitBranch color={colors.muted} size={13} strokeWidth={1.5} />
            <Text style={styles.bottomBarText}>{selectedWorktree.label}</Text>
            <ChevronDown color={colors.muted} size={12} strokeWidth={1.5} />
          </TouchableOpacity>

          {/* Model selector */}
          <TouchableOpacity
            style={styles.bottomBarBtn}
            onPress={() => setShowModelPicker(true)}
            activeOpacity={0.75}
          >
            <Cpu color={colors.muted} size={13} strokeWidth={1.5} />
            <Text style={styles.bottomBarText}>{selectedModel.label}</Text>
            {selectedModel.badge ? (
              <View style={styles.modelBadge}>
                <Text style={styles.modelBadgeText}>{selectedModel.badge}</Text>
              </View>
            ) : null}
            <ChevronDown color={colors.muted} size={12} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Model Picker Modal ─── */}
      <Modal
        visible={showModelPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModelPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setShowModelPicker(false)}
          activeOpacity={1}
        >
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Select Model</Text>
            {MODELS.map((model) => (
              <TouchableOpacity
                key={model.id}
                style={[
                  styles.pickerItem,
                  selectedModel.id === model.id && styles.pickerItemSelected,
                ]}
                onPress={() => {
                  setSelectedModel(model);
                  setShowModelPicker(false);
                }}
                activeOpacity={0.7}
              >
                <Cpu
                  color={selectedModel.id === model.id ? colors.accentBlue : colors.muted}
                  size={14}
                  strokeWidth={1.5}
                />
                <Text
                  style={[
                    styles.pickerItemText,
                    selectedModel.id === model.id && styles.pickerItemTextSelected,
                  ]}
                >
                  {model.label}
                </Text>
                {model.badge ? (
                  <View style={styles.modelBadge}>
                    <Text style={styles.modelBadgeText}>{model.badge}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── Worktree Picker Modal ─── */}
      <Modal
        visible={showWorktreePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWorktreePicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setShowWorktreePicker(false)}
          activeOpacity={1}
        >
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Select Worktree</Text>
            {WORKTREES.map((wt) => (
              <TouchableOpacity
                key={wt.id}
                style={[
                  styles.pickerItem,
                  selectedWorktree.id === wt.id && styles.pickerItemSelected,
                ]}
                onPress={() => {
                  setSelectedWorktree(wt);
                  setShowWorktreePicker(false);
                }}
                activeOpacity={0.7}
              >
                <GitBranch
                  color={selectedWorktree.id === wt.id ? colors.accentBlue : colors.muted}
                  size={14}
                  strokeWidth={1.5}
                />
                <Text
                  style={[
                    styles.pickerItemText,
                    selectedWorktree.id === wt.id && styles.pickerItemTextSelected,
                  ]}
                >
                  {wt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const makeStyles = (colors: any, spacing: any, radius: any, typography: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    projectRow: {
      position: 'absolute',
      top: spacing.md,
      left: spacing.lg,
    },
    projectSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    projectSelectorText: {
      fontFamily: typography.fonts.uiMedium,
      fontSize: typography.sizes.sm,
      color: colors.mutedForeground,
    },
    emptyHint: {
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    agentIconContainer: {
      width: 56,
      height: 56,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    emptyTitle: {
      fontFamily: typography.fonts.uiSemiBold,
      fontSize: typography.sizes.lg,
      color: colors.foreground,
      marginBottom: spacing.xs,
    },
    emptySubtitle: {
      fontFamily: typography.fonts.ui,
      fontSize: typography.sizes.sm,
      color: colors.muted,
    },
    inputCard: {
      width: '100%',
      backgroundColor: colors.chatInputCard,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    // Row 1 — text area
    textInput: {
      fontFamily: typography.fonts.ui,
      fontSize: typography.sizes.md,
      color: colors.foreground,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      minHeight: 56,
      maxHeight: 160,
    },
    // Row 2 — attach | mic + send
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: colors.borderMuted,
    },
    toolbarLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    toolbarRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBtnActive: {
      backgroundColor: 'rgba(255,68,68,0.12)',
    },
    sendBtn: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceHover,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnActive: {
      backgroundColor: colors.accentBlue,
    },
    // Row 3 — worktree | model
    bottomBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.borderMuted,
    },
    bottomBarBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    bottomBarText: {
      fontFamily: typography.fonts.ui,
      fontSize: typography.sizes.xs,
      color: colors.muted,
    },
    modelBadge: {
      backgroundColor: colors.surfaceActive,
      borderRadius: radius.xs,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    modelBadgeText: {
      fontFamily: typography.fonts.uiMedium,
      fontSize: 9,
      color: colors.accentBlue,
      letterSpacing: 0.4,
    },
    // Modals
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlayBg,
      justifyContent: 'flex-end',
    },
    pickerSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: Platform.OS === 'ios' ? spacing.xl + spacing.md : spacing.xl,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pickerTitle: {
      fontFamily: typography.fonts.uiSemiBold,
      fontSize: typography.sizes.md,
      color: colors.foreground,
      marginBottom: spacing.md,
    },
    pickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
    },
    pickerItemSelected: {
      backgroundColor: colors.surfaceHover,
    },
    pickerItemText: {
      fontFamily: typography.fonts.ui,
      fontSize: typography.sizes.sm,
      color: colors.mutedForeground,
      flex: 1,
    },
    pickerItemTextSelected: {
      color: colors.foreground,
    },
  });
