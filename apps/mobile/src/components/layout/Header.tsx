import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';
import { Badge } from '../ui/Badge';
import { Server, WifiOff } from 'lucide-react-native';

interface HeaderProps {
  projectName: string;
  isDaemonOnline: boolean;
}

export const Header: React.FC<HeaderProps> = ({ projectName, isDaemonOnline }) => {
  return (
    <View style={styles.container}>
      <View style={styles.projectInfo}>
        <Text style={styles.projectName}>{projectName}</Text>
      </View>
      <View style={styles.status}>
        {isDaemonOnline ? (
          <Server color={theme.colors.accentEmerald} size={16} />
        ) : (
          <WifiOff color={theme.colors.muted} size={16} />
        )}
        <Badge 
          text={isDaemonOnline ? 'Host Online' : 'Host Offline'} 
          variant={isDaemonOnline ? 'success' : 'default'} 
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
