import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { useTheme } from '../../theme';
import {
  Plus,
  Clock,
  CalendarClock,
  FolderOpen,
  Settings,
  MessageSquarePlus,
  SlidersHorizontal,
} from 'lucide-react-native';

const SIDEBAR_WIDTH = 280;

import type { GroupedSessions } from '../../utils/session-utils';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewConversation: () => void;
  onOpenSettings: () => void;
  onOpenProjectSettings: (projectName: string) => void;
  activeConversationId?: string;
  onSelectConversation: (id: string) => void;
  sessions: GroupedSessions[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  onNewConversation,
  onOpenSettings,
  onOpenProjectSettings,
  activeConversationId,
  onSelectConversation,
  sessions,
}) => {
  const { colors, spacing, radius, typography } = useTheme();
  const translateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setVisible(true);
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: -SIDEBAR_WIDTH,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => setVisible(false));
    }
  }, [isOpen]);

  if (!visible && !isOpen) return null;

  const styles = makeStyles(colors, spacing, radius, typography);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={isOpen ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* Drawer Panel */}
      <Animated.View style={[styles.sidebar, { transform: [{ translateX }] }]}>

        {/* ── Top nav items ── */}
        <View style={styles.topSection}>
          <TouchableOpacity style={styles.newConvBtn} onPress={onNewConversation} activeOpacity={0.8}>
            <Plus color={colors.foreground} size={16} strokeWidth={2} />
            <Text style={styles.newConvText}>New Conversation</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navItem} onPress={() => {}} activeOpacity={0.7}>
            <Clock color={colors.sidebarText} size={15} strokeWidth={1.5} />
            <Text style={styles.navItemText}>Conversation History</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navItem} onPress={() => {}} activeOpacity={0.7}>
            <CalendarClock color={colors.sidebarText} size={15} strokeWidth={1.5} />
            <Text style={styles.navItemText}>Scheduled Tasks</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* ── Projects section header ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Projects</Text>
        </View>

        <ScrollView style={styles.projectList} showsVerticalScrollIndicator={false}>
          {sessions.map((project) => (
            <View key={project.name} style={styles.projectGroup}>

              {/* Project row: folder icon + name + action buttons */}
              <View style={styles.projectHeader}>
                <FolderOpen color={colors.sidebarText} size={14} strokeWidth={1.5} />
                <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>

                {/* Action buttons — appear on the right */}
                <View style={styles.projectActions}>
                  {/* New conversation in this project */}
                  <TouchableOpacity
                    style={styles.projectActionBtn}
                    onPress={() => {
                      onNewConversation();
                    }}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <MessageSquarePlus color={colors.muted} size={13} strokeWidth={1.5} />
                  </TouchableOpacity>

                  {/* Project settings */}
                  <TouchableOpacity
                    style={styles.projectActionBtn}
                    onPress={() => {
                      onClose();
                      setTimeout(() => onOpenProjectSettings(project.name), 200);
                    }}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <SlidersHorizontal color={colors.muted} size={13} strokeWidth={1.5} />
                  </TouchableOpacity>
                </View>
              </View>

              {project.conversations.map((conv) => (
                <TouchableOpacity
                  key={conv.id}
                  style={[
                    styles.convItem,
                    activeConversationId === conv.id && styles.convItemActive,
                  ]}
                  onPress={() => onSelectConversation(conv.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.convTitle,
                      activeConversationId === conv.id && styles.convTitleActive,
                    ]}
                    numberOfLines={1}
                  >
                    {conv.title}
                  </Text>
                  <Text style={styles.convTime}>{conv.time}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>

        {/* ── Settings button at bottom ── */}
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={onOpenSettings}
          activeOpacity={0.8}
        >
          <Settings color={colors.sidebarText} size={16} strokeWidth={1.5} />
          <Text style={styles.settingsBtnText}>Settings</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const makeStyles = (colors: any, spacing: any, radius: any, typography: any) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlayBg,
    },
    sidebar: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      width: SIDEBAR_WIDTH,
      backgroundColor: colors.sidebarBg,
      borderRightWidth: 1,
      borderRightColor: colors.sidebarBorder,
      paddingTop: Platform.OS === 'ios' ? 52 : 20,
      flexDirection: 'column',
    },
    topSection: {
      paddingHorizontal: spacing.sm,
      paddingBottom: spacing.sm,
      gap: 2,
    },
    newConvBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      backgroundColor: colors.sidebarItemActive,
      marginBottom: spacing.xs,
    },
    newConvText: {
      fontFamily: typography.fonts.uiMedium,
      fontSize: typography.sizes.sm,
      color: colors.foreground,
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
    },
    navItemText: {
      fontFamily: typography.fonts.ui,
      fontSize: typography.sizes.sm,
      color: colors.sidebarText,
    },
    divider: {
      height: 1,
      backgroundColor: colors.sidebarBorder,
      marginHorizontal: spacing.sm,
      marginVertical: spacing.xs,
    },
    sectionHeader: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    sectionLabel: {
      fontFamily: typography.fonts.uiMedium,
      fontSize: typography.sizes.xs,
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    projectList: {
      flex: 1,
      paddingHorizontal: spacing.xs,
    },
    projectGroup: {
      marginBottom: spacing.sm,
    },
    // Project row: icon + name + action btns all in one row
    projectHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    projectName: {
      fontFamily: typography.fonts.uiMedium,
      fontSize: typography.sizes.sm,
      color: colors.mutedForeground,
      flex: 1,           // pushes action buttons to the right
    },
    projectActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    projectActionBtn: {
      width: 24,
      height: 24,
      borderRadius: radius.xs,
      alignItems: 'center',
      justifyContent: 'center',
    },
    convItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderRadius: radius.sm,
      marginHorizontal: spacing.xs,
    },
    convItemActive: {
      backgroundColor: colors.sidebarItemActive,
    },
    convTitle: {
      fontFamily: typography.fonts.ui,
      fontSize: typography.sizes.sm,
      color: colors.sidebarText,
      flex: 1,
    },
    convTitleActive: {
      color: colors.sidebarTextActive,
    },
    convTime: {
      fontFamily: typography.fonts.ui,
      fontSize: typography.sizes.xs,
      color: colors.muted,
      marginLeft: spacing.sm,
    },
    // Settings button — centered row, bottom of sidebar
    settingsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',   // ← centers icon + text horizontally
      gap: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      marginHorizontal: spacing.sm,
      marginBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
      borderRadius: radius.sm,
    },
    settingsBtnText: {
      fontFamily: typography.fonts.uiMedium,
      fontSize: typography.sizes.sm,
      color: colors.sidebarText,
    },
  });
