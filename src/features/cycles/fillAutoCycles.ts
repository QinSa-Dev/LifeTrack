/**
 * 自动循环懒补齐的「写库」那一半：读定义 → 读实例 → 算计划 → 逐段落库。
 *
 * 为什么放在启动流程里而不是页面里：用户可能几周不打开「周期」页，但自动循环
 * 的说法是「到时间自动开始 / 结束」。启动时补一次，打开事件页就能看到补齐的段落。
 *
 * 失败策略：**按定义隔离**。一条定义算不出来 / 写不进去，不影响其它定义，
 * 也不阻断启动；调用方把 `failures` 挂成顶部警告即可。
 */

import type { SqlExecutor } from '@/db';
import type { IsoDate } from '@/domain/models';
import { MetaRepository } from '@/repositories';
import { CycleInstanceRepository } from '@/repositories/cycleInstanceRepository';
import { EventDefinitionRepository } from '@/repositories/eventDefinitionRepository';

import { AUTO_FILL_LIMIT, autoFillHorizonKey, parseAutoFillHorizon, planAutoCycleFill } from './autoFill';

export interface AutoCycleFillFailure {
  definitionId: string;
  name: string;
  message: string;
}

export interface AutoCycleFillOutcome {
  /** 这次启动新建的段落数 */
  created: number;
  /** 参与检查的自动循环定义数（不含归档） */
  definitions: number;
  /** 单条定义失败的原因；整体启动不受影响 */
  failures: AutoCycleFillFailure[];
}

/**
 * 把水位往前推（只增不减）。
 *
 * 「已经补到哪一段」是个单调的水位：手动补了一段更早的周期，不应该把水位退回去，
 * 否则以后删掉更晚的一段时，它又会被自动补回来。
 */
export async function rememberAutoFillHorizon(
  db: SqlExecutor,
  definitionId: string,
  startDate: IsoDate,
): Promise<void> {
  const meta = new MetaRepository(db);
  const current = parseAutoFillHorizon(await meta.get(autoFillHorizonKey(definitionId)));
  if (current === undefined || startDate > current) {
    await meta.set(autoFillHorizonKey(definitionId), startDate);
  }
}

/**
 * 把每条自动循环定义「漏掉的后续段落」补到今天。
 *
 * - 只追加、不改已有边界；进行中 / 没有第一段 / 没有周期长度都会自然停下。
 * - 水位写在 `app_meta`：删掉自动生成的一段之后，下次启动不会又补回来。
 */
export async function fillAutoCycles(
  db: SqlExecutor,
  today: IsoDate,
  limit: number = AUTO_FILL_LIMIT,
): Promise<AutoCycleFillOutcome> {
  const definitions = new EventDefinitionRepository(db);
  const instances = new CycleInstanceRepository(db);
  const meta = new MetaRepository(db);

  const autoDefinitions = (await definitions.list()).filter(
    (definition) => definition.kind === 'cycle' && definition.cycleMode === 'auto',
  );

  let created = 0;
  const failures: AutoCycleFillFailure[] = [];

  for (const definition of autoDefinitions) {
    try {
      const existing = await instances.list({ definitionId: definition.id });
      const horizon = parseAutoFillHorizon(await meta.get(autoFillHorizonKey(definition.id)));
      const plan = planAutoCycleFill(definition, existing, today, horizon, limit);

      for (const segment of plan.segments) {
        await instances.create({
          definitionId: definition.id,
          startDate: segment.startDate,
          endDate: segment.endDate,
        });
        await rememberAutoFillHorizon(db, definition.id, segment.startDate);
        created += 1;
      }
    } catch (cause) {
      failures.push({
        definitionId: definition.id,
        name: definition.name,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return { created, definitions: autoDefinitions.length, failures };
}
