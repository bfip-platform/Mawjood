import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from './theme';
import { t } from './i18n';
import type { LoadFailure } from './usePaginatedList';

interface Props {
  /** why the load failed — picks the message (timeout vs generic failure) */
  kind: LoadFailure;
  /** re-run the failed load */
  onRetry: () => void;
  /** compact = a slim footer row (load-more failures under existing rows) */
  compact?: boolean;
}

/**
 * The ONE load-failure surface for lists (Product Foundation wave): a plain
 * bilingual message + a ≥44pt retry button. Full form replaces an empty
 * list area when the first page failed; compact form sits in the footer
 * when a later page failed and rows are already on screen. Without this,
 * failed loads looked exactly like empty lists.
 */
export function ListLoadError({ kind, onRetry, compact = false }: Props) {
  const { palette: P } = useTheme();
  return (
    <View style={compact ? styles.wrapCompact : styles.wrap}>
      {!compact && <Text style={styles.icon}>⚠️</Text>}
      <Text style={[compact ? styles.msgCompact : styles.msg, { color: P.faint }]}>
        {t(kind === 'timeout' ? 'loadTimedOut' : 'loadFailed')}
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t('retryAction')}
        style={({ pressed }) => [
          styles.btn,
          { borderColor: P.accent, backgroundColor: P.surface },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.btnText, { color: P.accent }]}>↻ {t('retryAction')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 28,
    gap: 10,
  },
  wrapCompact: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  icon: {
    fontSize: 40,
  },
  msg: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  msgCompact: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  btn: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
