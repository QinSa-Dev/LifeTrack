import { AppText, Badge, Button, ListRow } from '@/components';
import type { EventRecord } from '@/domain/models';

import { formatRowValue, isBackfilled, recordSubtitle } from './format';

export interface RecordRowProps {
  record: EventRecord;
  /** 覆盖标题，默认用快照名称 */
  title?: string;
  /** 覆盖副标题，默认「发生时间 · 来源（补录时显示补录于）」 */
  subtitle?: string;
  /** 点行进入这条记录的详情页——删除在详情页里，不再占行内位置 */
  onPress?: () => void;
  /** 点【+1】：以这条记录的取值「现在」再记一条；不传则不显示按钮 */
  onRepeat?: () => void;
  /** 该行的【+1】请求进行中 */
  repeating?: boolean;
  /** 【+1】不能用的原因（例如定义已归档）：按钮禁用，并显示同文案的标记 */
  repeatBlockedReason?: string;
  /** 定义已被永久删除：连【+1】都不再可能，只留一个标记 */
  definitionGone?: boolean;
  /** 单独成卡时传 false，去掉行底部的分隔线（默认显示） */
  divider?: boolean;
}

/**
 * 历史记录的一行：名称/时间 + 补录标记 + 取值 + 【+1】。
 *
 * 时间轴与事件记录页共用这一行，避免两处各写一遍展示与「再记一条」逻辑。
 *
 * 行内不再有【删除】：右侧留给「这条记录的取值」与【+1】，删除挪进记录详情页
 * （见 `src/app/records/[id].tsx`）。行本身可点，也是进详情页的入口。
 */
export function RecordRow({
  record,
  title,
  subtitle,
  onPress,
  onRepeat,
  repeating = false,
  repeatBlockedReason,
  definitionGone = false,
  divider = true,
}: RecordRowProps) {
  const backfilled = isBackfilled(record);
  const value = formatRowValue(record);

  return (
    <ListRow
      title={title ?? record.snapshot.name}
      subtitle={subtitle ?? recordSubtitle(record)}
      divider={divider}
      onPress={onPress}
      right={
        <>
          {backfilled ? <Badge label="补录" tone="warning" /> : null}
          {definitionGone ? <Badge label="定义已删除" /> : null}
          {repeatBlockedReason ? <Badge label={repeatBlockedReason} tone="warning" /> : null}
          {value ? <AppText variant="subtitle">{value}</AppText> : null}
          {onRepeat && !definitionGone ? (
            <Button
              label={repeating ? '+1…' : '+1'}
              tone="secondary"
              size="sm"
              onPress={onRepeat}
              disabled={repeating || repeatBlockedReason !== undefined}
            />
          ) : null}
        </>
      }
    />
  );
}
