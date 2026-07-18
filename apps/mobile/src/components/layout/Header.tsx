import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useTheme } from '../../theme';
import { Menu, GitBranch, Wifi, WifiOff, Server, Loader, Terminal } from 'lucide-react-native';

export type GitSyncStatus = 'synced' | 'unsynced' | 'syncing' | 'error';

interface HeaderProps {
  projectName: string;
  gitStatus: GitSyncStatus;
  onMenuPress: () => void;
  onTerminalPress?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ projectName, gitStatus, onMenuPress, onTerminalPress }) => {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = makeStyles(colors, spacing, radius, typography);

  const getStatusConfig = () => {
    switch (gitStatus) {
      case 'synced':
        return { color: colors.accentEmerald, icon: <Server color={colors.accentEmerald} size={14} strokeWidth={1.5} /> };
      case 'syncing':
        return { color: colors.muted, icon: <Loader color={colors.muted} size={14} strokeWidth={1.5} /> };
      case 'unsynced':
        return { color: colors.accentAmber, icon: <WifiOff color={colors.accentAmber} size={14} strokeWidth={1.5} /> };
      case 'error':
        return { color: colors.accentRed, icon: <WifiOff color={colors.accentRed} size={14} strokeWidth={1.5} /> };
    }
  };

  const config = getStatusConfig();

  return (
    <View style={styles.container}>
      {/* Hamburger */}
      <TouchableOpacity style={styles.menuBtn} onPress={onMenuPress} activeOpacity={0.7}>
        <Menu color={colors.foreground} size={20} strokeWidth={1.5} />
      </TouchableOpacity>

      {/* Project name + git status */}
      <View style={styles.center}>
        <Text style={styles.projectName} numberOfLines={1}>{projectName}</Text>
        <View style={styles.statusRow}>
          {config.icon}
          <View style={[styles.statusDot, { backgroundColor: config.color }]} />
        </View>
      </View>

      {/* Terminal button */}
      <TouchableOpacity style={styles.menuBtn} onPress={onTerminalPress} activeOpacity={0.7}>
        <Terminal color={colors.foreground} size={20} strokeWidth={1.5} />
      </TouchableOpacity>
    </View>
  );
};

const makeStyles = (colors: any, spacing: any, radius: any, typography: any) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      paddingTop: Platform.OS === 'ios' ? spacing.sm : spacing.sm,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    menuBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    center: {
      flex: 1,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    projectName: {
      fontFamily: typography.fonts.uiSemiBold,
      fontSize: typography.sizes.md,
      color: colors.foreground,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
  });
