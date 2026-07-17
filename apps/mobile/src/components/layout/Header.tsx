import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';
import { Badge } from '../ui/Badge';
import { Server, WifiOff } from 'lucide-react-native';

export type GitSyncStatus = 'synced' | 'unsynced' | 'syncing' | 'error';

interface HeaderProps {
  projectName: string;
  gitStatus: GitSyncStatus;
}

export const Header: React.FC<HeaderProps> = ({ projectName, gitStatus }) => {
  const getStatusConfig = () => {
    switch (gitStatus) {
      case 'synced':
        return { text: 'Git Synced', variant: 'success' as BadgeVariant, icon: <Server color={theme.colors.accentEmerald} size={16} /> };
      case 'syncing':
        return { text: 'Syncing...', variant: 'default' as BadgeVariant, icon: <Server color={theme.colors.muted} size={16} /> };
      case 'unsynced':
        return { text: 'Uncommitted Changes', variant: 'warning' as BadgeVariant, icon: <WifiOff color={theme.colors.accentAmber} size={16} /> };
      case 'error':
        return { text: 'Sync Error', variant: 'error' as BadgeVariant, icon: <WifiOff color={theme.colors.accentRed} size={16} /> };
    }
  };

  const config = getStatusConfig();

  return (
    <View style={styles.container}>
      <View style={styles.projectInfo}>
        <Text style={styles.projectName}>{projectName}</Text>
      </View>
      <View style={styles.status}>
        {config.icon}
        <Badge 
          text={config.text} 
          variant={config.variant} 
          style={styles.badge}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontFamily: 'Geist_600SemiBold',
    fontSize: theme.typography.sizes.md,
    color: theme.colors.foreground,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  badge: {
    marginLeft: theme.spacing.xs,
  }
});
