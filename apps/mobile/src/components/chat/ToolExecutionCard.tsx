import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge, BadgeVariant } from '../ui/Badge';
import { Terminal } from 'lucide-react-native';
import type { ToolExecution } from 'db-schema';

interface ToolExecutionCardProps {
  tool: ToolExecution;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

export const ToolExecutionCard: React.FC<ToolExecutionCardProps> = ({ tool, onApprove, onReject }) => {
  const getStatusBadge = (): { text: string; variant: BadgeVariant } => {
    switch (tool.status) {
      case 'pending_approval': return { text: 'Needs Approval', variant: 'warning' };
      case 'queued': return { text: 'Queued (Syncing)', variant: 'default' };
      case 'running': return { text: 'Running', variant: 'default' };
      case 'completed': return { text: 'Success', variant: 'success' };
      case 'failed': return { text: 'Failed', variant: 'error' };
      default: return { text: 'Unknown', variant: 'default' };
    }
  };

  const badgeProps = getStatusBadge();

  return (
    <View style={styles.container}>
      <Card>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Terminal color={theme.colors.muted} size={16} />
            <Text style={styles.title}>Terminal Execution</Text>
          </View>
          <Badge text={badgeProps.text} variant={badgeProps.variant} />
        </View>

        <View style={styles.codeBlock}>
          <Text style={styles.codeText}>{tool.command}</Text>
        </View>

        {tool.status === 'pending_approval' && (
          <View style={styles.actions}>
            <Button 
              title="Reject" 
              variant="secondary" 
              onPress={() => onReject?.(tool.id)} 
              style={styles.actionBtn}
            />
            <Button 
              title="Approve" 
              variant="primary" 
              onPress={() => onApprove?.(tool.id)} 
              style={styles.actionBtn}
            />
          </View>
        )}

        {(tool.output || tool.error) && (
          <View style={styles.outputBlock}>
            {tool.output && <Text style={styles.outputText}>{tool.output}</Text>}
            {tool.error && <Text style={styles.errorText}>{tool.error}</Text>}
          </View>
        )}
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  title: {
    fontFamily: 'Geist_500Medium',
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.foreground,
  },
  codeBlock: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
  },
  codeText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.accentEmerald,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  actionBtn: {
    minWidth: 100,
  },
  outputBlock: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderMuted,
  },
  outputText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 10,
    color: theme.colors.muted,
  },
  errorText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 10,
    color: theme.colors.accentRed,
    marginTop: theme.spacing.xs,
  }
});
