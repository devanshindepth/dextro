import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, ActivityIndicator, AppState,
} from 'react-native';
import { useTheme } from '../../theme';
import { CheckCircle, Circle, ExternalLink, RefreshCw, Shield } from 'lucide-react-native';
import type { SetupStatus } from 'core-types';
import { checkAll, getSetupSteps } from '../../onboarding/setup-checker';
import * as IntentLauncher from 'expo-intent-launcher';

const FDROID_TERMUX_URL = 'https://f-droid.org/packages/com.termux/';

interface SetupWizardProps {
  onComplete: (status: SetupStatus) => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const { colors, spacing, radius, typography } = useTheme();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [checking, setChecking] = useState(true);
  // Track whether we opened the settings screen so we auto-recheck on return
  const openedSettings = useRef(false);
  // Keep a stable ref to onComplete so the AppState listener is never stale
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const runCheck = useCallback(async () => {
    setChecking(true);
    const result = await checkAll();
    setStatus(result);
    setChecking(false);
    if (result.setupComplete) {
      setTimeout(() => onCompleteRef.current(result), 500);
    }
  }, []);

  // Stable ref so the AppState listener always calls the latest runCheck
  const runCheckRef = useRef(runCheck);
  useEffect(() => { runCheckRef.current = runCheck; }, [runCheck]);

  // Auto-recheck when user returns from the All Files Access settings screen
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && openedSettings.current) {
        openedSettings.current = false;
        runCheckRef.current();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => { runCheck(); }, [runCheck]);

  const steps = status ? getSetupSteps(status) : [];
  const requiredDone = steps.filter(s => s.required).every(s => s.done);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.iconWrap, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}>
          <Shield color={colors.accentBlue} size={32} strokeWidth={1.5} />
        </View>
        <Text style={{ fontFamily: typography.fonts.uiSemiBold, fontSize: typography.sizes.xl, color: colors.foreground, textAlign: 'center', marginTop: spacing.md }}>
          Setup Required
        </Text>
        <Text style={{ fontFamily: typography.fonts.ui, fontSize: typography.sizes.sm, color: colors.muted, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.xl }}>
          A few things need to be configured before Dextro can run agent tasks on your device.
        </Text>

        {/* Steps */}
        {checking && !status ? (
          <ActivityIndicator color={colors.accentBlue} size="large" />
        ) : (
          steps.map((step) => (
            <View key={step.id} style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
              <View style={styles.stepHeader}>
                {step.done
                  ? <CheckCircle color={colors.accentEmerald} size={18} strokeWidth={1.5} />
                  : <Circle color={step.required ? colors.accentAmber : colors.muted} size={18} strokeWidth={1.5} />
                }
                <Text style={{ fontFamily: typography.fonts.uiMedium, fontSize: typography.sizes.sm, color: colors.foreground, flex: 1 }}>
                  {step.label}
                </Text>
                {!step.done && step.id === 'storage' && (
                  <TouchableOpacity
                    style={{ backgroundColor: colors.accentBlue, borderRadius: radius.xs, paddingHorizontal: 8, paddingVertical: 4 }}
                    onPress={() => {
                      openedSettings.current = true;
                      try {
                        IntentLauncher.startActivityAsync(
                          'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION',
                          { data: 'package:com.anonymous.mobile' }
                        );
                      } catch (e) {
                        IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, {
                          data: 'package:com.anonymous.mobile'
                        });
                      }
                    }}
                  >
                    <Text style={{ fontFamily: typography.fonts.uiMedium, fontSize: 10, color: '#FFFFFF' }}>OPEN SETTINGS</Text>
                  </TouchableOpacity>
                )}
                {!step.required && (
                  <View style={{ backgroundColor: colors.surfaceHover, borderRadius: radius.xs, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ fontFamily: typography.fonts.uiMedium, fontSize: 9, color: colors.muted }}>OPTIONAL</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontFamily: typography.fonts.ui, fontSize: typography.sizes.xs, color: colors.muted, lineHeight: 18, marginTop: spacing.xs }}>
                {step.description}
              </Text>
            </View>
          ))
        )}

        {/* Recheck button */}
        <TouchableOpacity
          style={[styles.recheckBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.lg }]}
          onPress={runCheck}
          disabled={checking}
          activeOpacity={0.8}
        >
          {checking
            ? <ActivityIndicator color={colors.accentBlue} size="small" />
            : <RefreshCw color={colors.accentBlue} size={15} strokeWidth={1.5} />
          }
          <Text style={{ fontFamily: typography.fonts.uiMedium, fontSize: typography.sizes.sm, color: colors.accentBlue }}>
            {checking ? 'Checking…' : 'Re-check Setup'}
          </Text>
        </TouchableOpacity>

        {/* Continue anyway if only optional steps remain */}
        {requiredDone && (
          <TouchableOpacity
            style={[styles.continueBtn, { backgroundColor: colors.accentBlue, borderRadius: radius.md, marginTop: spacing.sm }]}
            onPress={() => status && onComplete(status)}
            activeOpacity={0.85}
          >
            <Text style={{ fontFamily: typography.fonts.uiSemiBold, fontSize: typography.sizes.sm, color: '#FFFFFF' }}>
              Continue
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  iconWrap: { width: 72, height: 72, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  stepCard: { padding: 14, borderWidth: 1, marginBottom: 10 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1 },
  recheckBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderWidth: 1 },
  continueBtn: { alignItems: 'center', paddingVertical: 14 },
});
