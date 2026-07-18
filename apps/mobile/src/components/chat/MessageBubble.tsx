import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';
import { CodeBlock } from './CodeBlock';

interface MessageBubbleProps {
  role: 'user' | 'agent' | 'system';
  content: string;
  isStreaming?: boolean;
}

// ─── Inline Markdown Parser ───────────────────────────────────────────────────

interface TextSegment {
  type: 'text' | 'bold' | 'italic' | 'inline_code';
  text: string;
}

function parseInline(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Bold: **text** or __text__
    const boldMatch = remaining.match(/^(\*\*|__)(.*?)\1/s);
    if (boldMatch) {
      segments.push({ type: 'bold', text: boldMatch[2] });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic: *text* or _text_
    const italicMatch = remaining.match(/^(\*|_)(.*?)\1/s);
    if (italicMatch) {
      segments.push({ type: 'italic', text: italicMatch[2] });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Inline code: `text`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      segments.push({ type: 'inline_code', text: codeMatch[1] });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Plain text — consume until next special char
    const plainMatch = remaining.match(/^[^*_`]+/);
    if (plainMatch) {
      segments.push({ type: 'text', text: plainMatch[0] });
      remaining = remaining.slice(plainMatch[0].length);
      continue;
    }

    // Fallback: consume single char
    segments.push({ type: 'text', text: remaining[0] });
    remaining = remaining.slice(1);
  }

  return segments;
}

interface Block {
  type: 'paragraph' | 'code_block' | 'bullet' | 'heading';
  content: string;
  language?: string;
  level?: number;
}

function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const codeFenceMatch = line.match(/^```(\w*)/);
    if (codeFenceMatch) {
      const language = codeFenceMatch[1];
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code_block', content: codeLines.join('\n'), language });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: 'heading', content: headingMatch[2], level: headingMatch[1].length });
      i++;
      continue;
    }

    // Bullet list item
    const bulletMatch = line.match(/^[-*+]\s+(.+)/);
    if (bulletMatch) {
      blocks.push({ type: 'bullet', content: bulletMatch[1] });
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].match(/^```/) && !lines[i].match(/^#{1,3}\s/)) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paraLines.join(' ') });
    }
  }

  return blocks;
}

// ─── Inline Renderer ──────────────────────────────────────────────────────────

const InlineText: React.FC<{ segments: TextSegment[]; baseStyle: object; colors: any; typography: any }> = ({
  segments, baseStyle, colors, typography
}) => (
  <Text style={baseStyle}>
    {segments.map((seg, idx) => {
      switch (seg.type) {
        case 'bold':
          return <Text key={idx} style={{ fontFamily: typography.fonts.uiSemiBold }}>{seg.text}</Text>;
        case 'italic':
          return <Text key={idx} style={{ fontStyle: 'italic' }}>{seg.text}</Text>;
        case 'inline_code':
          return (
            <Text key={idx} style={{
              fontFamily: typography.fonts.mono,
              fontSize: typography.sizes.xs,
              backgroundColor: colors.surfaceHover,
              color: colors.accentEmerald,
            }}>
              {` ${seg.text} `}
            </Text>
          );
        default:
          return <Text key={idx}>{seg.text}</Text>;
      }
    })}
  </Text>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const MessageBubble: React.FC<MessageBubbleProps> = ({ role, content, isStreaming }) => {
  const { colors, spacing, radius, typography } = useTheme();
  const isUser = role === 'user';
  const isSystem = role === 'system';

  const baseTextStyle = {
    fontFamily: typography.fonts.ui,
    fontSize: typography.sizes.sm,
    color: isSystem ? colors.muted : colors.foreground,
    lineHeight: 21,
  };

  if (isSystem) {
    return (
      <View style={{ paddingHorizontal: spacing.md, marginVertical: spacing.xs, alignItems: 'center' }}>
        <Text style={[baseTextStyle, { fontSize: typography.sizes.xs, fontFamily: typography.fonts.uiMedium }]}>
          {content}
        </Text>
      </View>
    );
  }

  if (isUser) {
    return (
      <View style={[styles.container, { paddingHorizontal: spacing.md, marginVertical: spacing.xs }, styles.userContainer]}>
        <View style={[styles.bubble, {
          backgroundColor: colors.surfaceHover,
          borderRadius: radius.lg,
          borderBottomRightRadius: radius.xs,
          padding: spacing.md,
        }]}>
          <Text style={baseTextStyle}>{content}</Text>
        </View>
      </View>
    );
  }

  // Agent message — render with markdown
  const blocks = parseMarkdown(content);

  return (
    <View style={[styles.container, { paddingHorizontal: spacing.md, marginVertical: spacing.xs }, styles.agentContainer]}>
      <View style={[styles.avatar, { backgroundColor: colors.surfaceHover, marginRight: spacing.sm }]}>
        <Text style={styles.avatarText}>🤖</Text>
      </View>
      <View style={[styles.agentContent, { maxWidth: '82%' }]}>
        {blocks.length === 0 && isStreaming ? (
          // Empty streaming — cursor only
          <Text style={[baseTextStyle, { color: colors.muted }]}>▋</Text>
        ) : null}

        {blocks.map((block, idx) => {
          switch (block.type) {
            case 'code_block':
              return (
                <CodeBlock key={idx} code={block.content} language={block.language} />
              );

            case 'heading': {
              const headingSize = block.level === 1
                ? typography.sizes.lg
                : block.level === 2
                ? typography.sizes.md
                : typography.sizes.sm;
              return (
                <InlineText
                  key={idx}
                  segments={parseInline(block.content)}
                  baseStyle={[baseTextStyle, { fontSize: headingSize, fontFamily: typography.fonts.uiSemiBold, marginTop: 8, marginBottom: 2 }]}
                  colors={colors}
                  typography={typography}
                />
              );
            }

            case 'bullet':
              return (
                <View key={idx} style={styles.bulletRow}>
                  <Text style={[baseTextStyle, { color: colors.muted, marginRight: 4 }]}>•</Text>
                  <View style={{ flex: 1 }}>
                    <InlineText
                      segments={parseInline(block.content)}
                      baseStyle={baseTextStyle}
                      colors={colors}
                      typography={typography}
                    />
                  </View>
                </View>
              );

            default: // paragraph
              return (
                <View key={idx} style={{ marginBottom: 4 }}>
                  <InlineText
                    segments={parseInline(block.content)}
                    baseStyle={baseTextStyle}
                    colors={colors}
                    typography={typography}
                  />
                  {idx === blocks.length - 1 && isStreaming && (
                    <Text style={[baseTextStyle, { color: colors.muted }]}>▋</Text>
                  )}
                </View>
              );
          }
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', width: '100%' },
  userContainer: { justifyContent: 'flex-end' },
  agentContainer: { justifyContent: 'flex-start' },
  agentContent: { flex: 0 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  avatarText: { fontSize: 14 },
  bubble: { maxWidth: '82%' },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2 },
});
