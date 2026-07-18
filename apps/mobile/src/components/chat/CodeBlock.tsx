import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';
import { Copy, Check } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';

interface CodeBlockProps {
  code: string;
  language?: string;
}

// Basic keyword sets for syntax highlighting
const KEYWORDS: Record<string, string[]> = {
  ts: ['const', 'let', 'var', 'function', 'async', 'await', 'return', 'if', 'else', 'for', 'while', 'class', 'interface', 'type', 'import', 'export', 'from', 'default', 'new', 'this', 'extends', 'implements', 'readonly', 'private', 'public', 'protected', 'void', 'null', 'undefined', 'true', 'false', 'try', 'catch', 'throw'],
  js: ['const', 'let', 'var', 'function', 'async', 'await', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'from', 'default', 'new', 'this', 'null', 'undefined', 'true', 'false', 'try', 'catch', 'throw'],
  py: ['def', 'class', 'import', 'from', 'return', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'with', 'as', 'pass', 'break', 'continue', 'lambda', 'yield', 'None', 'True', 'False', 'and', 'or', 'not', 'in', 'is'],
};

interface Token { text: string; type: 'keyword' | 'string' | 'comment' | 'number' | 'plain'; }

function tokenizeLine(line: string, lang: string): Token[] {
  const tokens: Token[] = [];
  let remaining = line;

  const keywords = KEYWORDS[lang] ?? KEYWORDS['ts'];

  while (remaining.length > 0) {
    // Comment
    if (remaining.startsWith('//') || remaining.startsWith('#')) {
      tokens.push({ text: remaining, type: 'comment' });
      break;
    }

    // String (single/double quote)
    const strMatch = remaining.match(/^(['"`])(.*?)\1/);
    if (strMatch) {
      tokens.push({ text: strMatch[0], type: 'string' });
      remaining = remaining.slice(strMatch[0].length);
      continue;
    }

    // Number
    const numMatch = remaining.match(/^\d+(\.\d+)?/);
    if (numMatch) {
      tokens.push({ text: numMatch[0], type: 'number' });
      remaining = remaining.slice(numMatch[0].length);
      continue;
    }

    // Word / keyword
    const wordMatch = remaining.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
    if (wordMatch) {
      const word = wordMatch[0];
      tokens.push({ text: word, type: keywords.includes(word) ? 'keyword' : 'plain' });
      remaining = remaining.slice(word.length);
      continue;
    }

    // Plain char
    tokens.push({ text: remaining[0], type: 'plain' });
    remaining = remaining.slice(1);
  }

  return tokens;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language = '' }) => {
  const { colors, spacing, radius, typography } = useTheme();
  const [copied, setCopied] = useState(false);

  const lang = language.toLowerCase().replace('typescript', 'ts').replace('javascript', 'js').replace('python', 'py');
  const lines = code.split('\n');

  const tokenColors = {
    keyword: colors.accentBlue,
    string: colors.accentEmerald,
    comment: colors.muted,
    number: colors.accentAmber,
    plain: colors.foreground,
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={{ fontFamily: typography.fonts.mono, fontSize: typography.sizes.xs, color: colors.muted }}>
          {language || 'code'}
        </Text>
        <TouchableOpacity onPress={handleCopy} style={styles.copyBtn} activeOpacity={0.7}>
          {copied
            ? <Check color={colors.accentEmerald} size={13} strokeWidth={2} />
            : <Copy color={colors.muted} size={13} strokeWidth={1.5} />
          }
          <Text style={{ fontFamily: typography.fonts.uiMedium, fontSize: typography.sizes.xs, color: copied ? colors.accentEmerald : colors.muted }}>
            {copied ? 'Copied!' : 'Copy'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Code */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ padding: spacing.md }}>
        <View>
          {lines.map((line, lineIdx) => {
            const tokens = tokenizeLine(line, lang);
            return (
              <View key={lineIdx} style={styles.line}>
                <Text style={{ fontFamily: typography.fonts.mono, fontSize: typography.sizes.xs, color: colors.muted, width: 28 }}>
                  {lineIdx + 1}
                </Text>
                <View style={styles.lineContent}>
                  {tokens.map((token, tokenIdx) => (
                    <Text
                      key={tokenIdx}
                      style={{
                        fontFamily: typography.fonts.mono,
                        fontSize: typography.sizes.xs,
                        color: tokenColors[token.type],
                      }}
                    >
                      {token.text}
                    </Text>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { overflow: 'hidden', marginVertical: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  line: { flexDirection: 'row', minHeight: 18 },
  lineContent: { flexDirection: 'row', flexWrap: 'nowrap' },
});
