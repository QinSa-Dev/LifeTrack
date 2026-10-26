import type { EventGroup } from '@/domain/models';
import type { EventGroupInput } from '@/domain/validation';

/**
 * 「把分组改个名」要提交的输入。
 *
 * `EventGroupRepository.update()` 是**整体替换**——`name` / `color` / `sortOrder`
 * 三条一起写。所以改名时只传 `name` 会把分组的颜色清空、排序归零；
 * 必须把原来的 `color` 与 `sortOrder` 一起带上。
 *
 * 单独拎出来是因为这条约束很容易踩：`update` 的签名（`EventGroupInput`）看不出
 * 哪些字段是「可选但会覆盖」，放在这里让它有一个能被测试钉住的落点。
 */
export function renameGroupInput(group: EventGroup, name: string): EventGroupInput {
  return { name, color: group.color, sortOrder: group.sortOrder };
}
