import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, Chip, Header, Screen } from '@/components';
import { META_KEYS, useReadyDatabase } from '@/db';
import {
  DEFAULT_PREDICTION_WINDOW_SETTING,
  PREDICTION_WINDOW_OPTIONS,
  describePredictionWindow,
  parsePredictionWindow,
} from '@/features/cycles/predictionWindow';
import { useGoBack } from '@/features/common/useGoBack';
import { NavigationSettingsCard } from '@/features/navigation/NavigationSettingsCard';
import { useNavigationPreferences } from '@/features/navigation/NavigationPreferencesProvider';
import {
  DEFAULT_TIMELINE_VIEW_MODE,
  TIMELINE_VIEW_LABELS,
  parseTimelineViewMode,
  type TimelineViewMode,
} from '@/features/records/timelineView';
import { MetaRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

/**
 * 偏好设置：只影响「怎么看」，不动库里任何数据。
 *
 * 显示偏好（时间轴展开/合并、周期预测窗口）存 `app_meta`，导航偏好走 Context，
 * 两者都在这里改、立即生效。
 */
export default function PreferencesScreen() {
  const goBack = useGoBack();
  const { db } = useReadyDatabase();
  const {
    preferences: navigationPreferences,
    error: navigationError,
    update: updateNavigationPreferences,
  } = useNavigationPreferences();

  const [timelineView, setTimelineView] = useState<TimelineViewMode>(DEFAULT_TIMELINE_VIEW_MODE);
  const [predictionWindow, setPredictionWindow] = useState(DEFAULT_PREDICTION_WINDOW_SETTING);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const repository = new MetaRepository(db);

      Promise.all([repository.get(META_KEYS.timelineView), repository.get(META_KEYS.predictionWindow)])
        .then(([storedView, storedWindow]) => {
          if (cancelled) {
            return;
          }
          setTimelineView(parseTimelineViewMode(storedView));
          setPredictionWindow(parsePredictionWindow(storedWindow));
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setPreferenceError(cause instanceof Error ? cause.message : String(cause));
          }
        });

      return () => {
        cancelled = true;
      };
    }, [db]),
  );

  /**
   * 改纯展示偏好：先改本地（界面立刻跟上），再落 app_meta；写失败只提示，不回滚显示
   * ——偏好没记住不影响任何数据。
   */
  const changeTimelineView = useCallback(
    (next: TimelineViewMode) => {
      setTimelineView(next);
      setPreferenceError(null);
      new MetaRepository(db).set(META_KEYS.timelineView, next).catch((cause: unknown) => {
        setPreferenceError(cause instanceof Error ? cause.message : String(cause));
      });
    },
    [db],
  );

  const changePredictionWindow = useCallback(
    (next: number) => {
      setPredictionWindow(next);
      setPreferenceError(null);
      new MetaRepository(db).set(META_KEYS.predictionWindow, String(next)).catch((cause: unknown) => {
        setPreferenceError(cause instanceof Error ? cause.message : String(cause));
      });
    },
    [db],
  );

  return (
    <Screen scroll header={<Header title="偏好设置" onBack={goBack} />} contentStyle={styles.content}>
      <Card title="显示">
        <AppText variant="label" color={palette.textMuted}>
          时间轴显示
        </AppText>
        <View style={styles.chipRow}>
          {(['expanded', 'merged'] as const).map((mode) => (
            <Chip
              key={mode}
              label={TIMELINE_VIEW_LABELS[mode]}
              selected={timelineView === mode}
              onPress={() => changeTimelineView(mode)}
            />
          ))}
        </View>

        <AppText variant="label" color={palette.textMuted} style={styles.chipLabel}>
          周期预测窗口
        </AppText>
        <View style={styles.chipRow}>
          {PREDICTION_WINDOW_OPTIONS.map((option) => (
            <Chip
              key={option}
              label={describePredictionWindow(option)}
              selected={predictionWindow === option}
              onPress={() => changePredictionWindow(option)}
            />
          ))}
        </View>

        {preferenceError ? (
          <AppText variant="caption" color={palette.danger} style={styles.chipHint}>
            偏好没能记住：{preferenceError}
          </AppText>
        ) : null}
      </Card>

      <NavigationSettingsCard
        preferences={navigationPreferences}
        error={navigationError}
        onChange={updateNavigationPreferences}
        style={styles.spaced}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.md,
  },
  spaced: {
    marginTop: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chipLabel: {
    marginTop: spacing.md,
  },
  chipHint: {
    marginTop: spacing.sm,
  },
});
