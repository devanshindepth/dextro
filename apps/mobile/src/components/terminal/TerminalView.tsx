import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../theme';
import { getTermuxBridge } from '../../executor/termux-bridge';
import { Terminal as TerminalIcon, X } from 'lucide-react-native';

interface TerminalViewProps {
  cwd: string;
  onClose: () => void;
}

interface TermBlock {
  id: string;
  type: 'input' | 'output' | 'error';
  content: string;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ cwd, onClose }) => {
  const { colors, typography, spacing } = useTheme();
  const [blocks, setBlocks] = useState<TermBlock[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll on new output
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [blocks]);

  const handleExecute = async () => {
    const cmd = inputText.trim();
    if (!cmd || isRunning) return;

    setInputText('');
    const inputId = `in-${Date.now()}`;
    const outputId = `out-${Date.now()}`;

    setBlocks(prev => [
      ...prev,
      { id: inputId, type: 'input', content: `$ ${cmd}` },
      { id: outputId, type: 'output', content: '' }
    ]);

    setIsRunning(true);
    abortControllerRef.current = new AbortController();

    try {
      const bridge = getTermuxBridge();
      const result = await bridge.execute(
        cmd,
        cwd,
        (chunk) => {
          setBlocks(prev => prev.map(b => 
            b.id === outputId ? { ...b, content: b.content + chunk } : b
          ));
        },
        abortControllerRef.current.signal
      );

      // Append exit code if non-zero
      if (result.exitCode !== 0) {
        setBlocks(prev => [
          ...prev,
          { id: `err-${Date.now()}`, type: 'error', content: `\n[Process exited with code ${result.exitCode}]` }
        ]);
      }
    } catch (err: any) {
      setBlocks(prev => [
        ...prev,
        { id: `err-${Date.now()}`, type: 'error', content: `\nError: ${err.message || String(err)}` }
      ]);
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setIsRunning(false);
  };

  const getDirName = (path: string) => path.split('/').pop() || '~';

  return (
    <View style={[styles.container, { backgroundColor: '#1E1E1E' }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: '#333333' }]}>
        <View style={styles.headerTitle}>
          <TerminalIcon color="#CCCCCC" size={16} strokeWidth={2} />
          <Text style={{ fontFamily: typography.fonts.uiMedium, fontSize: typography.sizes.sm, color: '#CCCCCC', marginLeft: 8 }}>
            Terminal ({getDirName(cwd)})
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <X color="#CCCCCC" size={18} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Terminal Output */}
      <ScrollView
        ref={scrollRef}
        style={styles.outputArea}
        contentContainerStyle={{ padding: spacing.md }}
      >
        <Text style={{ fontFamily: typography.fonts.mono, fontSize: 12, color: '#888888', marginBottom: 8 }}>
          Dextro In-House Terminal v1.0
          {'\n'}Bridge: Shared Storage intent {"→"} com.termux.RUN_COMMAND
        </Text>
        
        {blocks.map((block) => (
          <Text
            key={block.id}
            style={{
              fontFamily: typography.fonts.mono,
              fontSize: 12,
              color: block.type === 'input' ? '#4CAF50' : block.type === 'error' ? '#F44336' : '#E0E0E0',
              marginTop: block.type === 'input' ? 8 : 0,
            }}
          >
            {block.content}
          </Text>
        ))}
      </ScrollView>

      {/* Input Area */}
      <View style={[styles.inputRow, { borderTopColor: '#333333' }]}>
        <Text style={{ fontFamily: typography.fonts.mono, fontSize: 13, color: '#4CAF50', marginRight: 8, marginTop: 12 }}>
          $
        </Text>
        <TextInput
          style={[styles.input, { fontFamily: typography.fonts.mono, color: '#E0E0E0' }]}
          placeholder={isRunning ? "Command is running..." : "Type a command..."}
          placeholderTextColor="#666666"
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleExecute}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isRunning}
          returnKeyType="send"
        />
        {isRunning && (
          <TouchableOpacity onPress={handleStop} style={styles.stopBtn}>
            <Text style={{ fontFamily: typography.fonts.uiSemiBold, color: '#F44336', fontSize: 12 }}>STOP</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, zIndex: 100 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    backgroundColor: '#1E1E1E'
  },
  headerTitle: { flexDirection: 'row', alignItems: 'center' },
  closeBtn: { padding: 4 },
  outputArea: { flex: 1 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    backgroundColor: '#1E1E1E'
  },
  input: {
    flex: 1,
    fontSize: 13,
    minHeight: 44,
    paddingVertical: 12,
  },
  stopBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
  }
});
