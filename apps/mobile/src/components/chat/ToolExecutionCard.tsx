import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { useTheme } from '../../theme';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge, BadgeVariant } from '../ui/Badge';
import {
  Terminal, File, GitBranch, Globe, Search, FolderOpen,
  ChevronDown, ChevronUp,
} from 'lucide-react-native';
import type { ToolExecution } from 'core-types';

interface ToolExecutionCardProps {
  tool: ToolExecution;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

// ─── Tool Icons ───────────────────────────────────────────────────────────────

function ToolIcon({ name, color, size }: { name?: string; color: string; size: number }) {
  if (!name) return <Terminal color={color} size={size} strokeWidth={1.5} />;
  if (name.startsWith('git_')) return <GitBranch color={color} size={size} strokeWidth={1.5} />;
  if (name === 'run_command') return <Terminal color={color} size={size} strokeWidth={1.5} />;
  if (name === 'read_url') return <Globe color={color} size={size} strokeWidth={1.5} />;
  if (name.includes('search') || name.includes('find')) return <Search color={color} size={size} strokeWidth={1.5} />;
  if (name === 'create_directory') return <FolderOpen color={color} size={size} strokeWidth={1.5} />;
  return <File color={color} size={size} strokeWidth={1.5} />;
}

// ─── Tier Badge ───────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: ToolExecution['tier'] }) {
  const { colors, typography, radius } = useTheme();
  const config = {
    auto: { label: 'AUTO', color: colors.accentEmerald },
    confirm: { label: 'CONFIRM', color: colors.accentAmber },
    gate: { label: 'GATE', color: colors.accentRed },
  }[tier ?? 'gate'];

  return (
    <View style={{ backgroundColor: `${config.color}18`, borderRadius: radius.xs, paddingHorizontal: 5, paddingVertical: 1 }}>
      <Text style={{ fontFamily: typography.fonts.uiMedium, fontSize: 9, color: config.color, letterSpacing: 0.6 }}>
        {config.label}
      </Text>
    </View>
  );
}

// ─── Diff Viewer ─────────────────────────────────────────────────────────────

function DiffViewer({ diff }: { diff: string }) {
  const { colors, typography, spacing } = useTheme();
  const lines = diff.split('\n');
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
      <View>
        {lines.map((line, idx) => {
          const isAdded = line.startsWith('+');
          const isRemoved = line.startsWith('-');
          return (
            <Text key={idx} style={{
              fontFamily: typography.fonts.mono,
              fontSize: 10,
              color: isAdded ? colors.accentEmerald : isRemoved ? colors.accentRed : colors.muted,
              backgroundColor: isAdded ? `${colors.accentEmerald}10` : isRemoved ? `${colors.accentRed}10` : 'transparent',
            }}>
              {line || ' '}
            </Text>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Main Card ────────────────────────────────────────────────────────────────

export const ToolExecutionCard: React.FC<ToolExecutionCardProps> = ({ tool, onApprove, onReject }) => {
  const { colors, spacing, radius, typography } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isDone = tool.status === 'completed' || tool.status === 'failed';

  // Auto-collapse after completion
  useEffect(() => {
    if (isDone) {
      const t = setTimeout(() => setIsCollapsed(true), 3000);
      return () => clearTimeout(t);
    }
    setIsCollapsed(false);
  }, [isDone]);

  // Auto-scroll streaming output to bottom
  useEffect(() => {
    if (tool.streamingOutput) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [tool.streamingOutput]);

  const getStatusBadge = (): { text: string; variant: BadgeVariant } => {
    switch (tool.status) {
      case 'pending_approval': return { text: 'Needs Approval', variant: 'warning' };
      case 'running': return { text: 'Running', variant: 'default' };
      case 'completed': return { text: 'Done', variant: 'success' };
      case 'failed': return { text: 'Failed', variant: 'error' };
      default: return { text: 'Unknown', variant: 'default' };
    }
  };

  const badgeProps = getStatusBadge();
  const hasDiff = (tool.toolName === 'write_file' || tool.toolName === 'patch_file') && tool.output?.includes('\n');

  return (
    <View style={{ paddingHorizontal: spacing.md, marginVertical: spacing.xs }}>
      <Card>
        {/* ── Header ── */}
        <TouchableOpacity
          style={styles.header}
          onPress={() => isDone && setIsCollapsed(!isCollapsed)}
          activeOpacity={isDone ? 0.7 : 1}
        >
          <View style={styles.titleRow}>
            <ToolIcon name={tool.toolName} color={colors.muted} size={14} />
            <Text style={{ fontFamily: typography.fonts.uiMedium, fontSize: typography.sizes.sm, color: colors.foreground, flex: 1 }}>
              {tool.toolName?.replace(/_/g, ' ') ?? 'Tool'}
            </Text>
            <TierBadge tier={tool.tier} />
          </View>
          <View style={styles.headerRight}>
            <Badge text={badgeProps.text} variant={badgeProps.variant} />
            {isDone && (isCollapsed
              ? <ChevronDown color={colors.muted} size={13} strokeWidth={1.5} />
              : <ChevronUp color={colors.muted} size={13} strokeWidth={1.5} />
            )}
          </View>
        </TouchableOpacity>

        {!isCollapsed && (
          <>
            {/* ── Command ── */}
            <View style={[styles.codeBlock, {
              backgroundColor: colors.background,
              borderRadius: radius.xs,
              borderWidth: 1,
              borderColor: colors.borderMuted,
              padding: spacing.md,
              marginBottom: spacing.sm,
            }]}>
              <Text style={{ fontFamily: typography.fonts.mono, fontSize: typography.sizes.xs, color: colors.accentEmerald }}>
                {tool.command}
              </Text>
            </View>

            {/* ── Live streaming output ── */}
            {tool.status === 'running' && tool.streamingOutput && (
              <ScrollView
                ref={scrollRef}
                style={{ maxHeight: 180, backgroundColor: colors.background, borderRadius: radius.xs, padding: spacing.sm }}
                showsVerticalScrollIndicator={false}
              >
                <Text style={{ fontFamily: typography.fonts.mono, fontSize: 10, color: colors.mutedForeground }}>
                  {tool.streamingOutput}
                </Text>
              </ScrollView>
            )}

            {/* ── Running indicator ── */}
            {tool.status === 'running' && !tool.streamingOutput && (
              <Text style={{ fontFamily: typography.fonts.ui, fontSize: typography.sizes.xs, color: colors.muted }}>
                Executing…
              </Text>
            )}

            {/* ── Approval buttons ── */}
            {tool.status === 'pending_approval' && (
              <View style={[styles.actions, { marginTop: spacing.md, gap: spacing.sm }]}>
                <Button
                  title="Reject"
                  variant="danger"
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

            {/* ── Output / Error ── */}
            {(tool.output || tool.error) && (
              <View style={[styles.outputBlock, { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderMuted }]}>
                {tool.output && !hasDiff && (
                  <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                    <Text style={{ fontFamily: typography.fonts.mono, fontSize: 10, color: colors.muted }}>
                      {tool.output}
                    </Text>
                  </ScrollView>
                )}
                {tool.output && hasDiff && (
                  <DiffViewer diff={tool.output} />
                )}
                {tool.error && (
                  <Text style={{ fontFamily: typography.fonts.mono, fontSize: 10, color: colors.accentRed, marginTop: spacing.xs }}>
                    {tool.error}
                  </Text>
                )}
              </View>
            )}
          </>
        )}
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  codeBlock: {},
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  actionBtn: { minWidth: 100 },
  outputBlock: {},
});
