import { AppText, Badge, Button, ListRow } from '@/components';
import type { EventRecord } from '@/domain/models';

import { formatRecordValue, isBackfilled, recordSubtitle } from './format';

export interface RecordRowProps {
  record: EventRecord;
  /** 覆盖标题，默认用快照名称 */
  title?: string;
  /** 覆盖副标题，默认「发生时间 · 来源（补录时显示补录于）」 */
  subtitle?: string;
  /** 传入后右侧显示「删除」按钮（软删除，可撤销） */
  onDelete?: () => void;
  /** 该行删除请求进行中 */
  deleting?: boolean;
}

/**
 * 历史记录的一行：名称/时间 + 补录标记 + 取值 + 可选删除。
 *
 * 时间轴与事件记录页共用这一行，避免两处各写一遍展示与删除逻辑。
 */
export function RecordRow({ record, title, subtitle, onDelete, deleting = false }: RecordRowProps) {
  const backfilled = isBackfilled(record);

  return (
    <ListRow
      title={title ?? record.snapshot.name}
      subtitle={subtitle ?? recordSubtitle(record)}
      right={
        <>
          {backfilled ? <Badge label="补录" tone="warning" /> : null}
          <AppText variant="subtitle">{formatRecordValue(record)}</AppText>
          {onDelete ? (
            <Button
              label={deleting ? '删除中…' : '删除'}
              tone="danger"
              size="sm"
              onPress={onDelete}
              disabled={deleting}
            />
          ) : null}
        </>
      }
    />
  );
}
