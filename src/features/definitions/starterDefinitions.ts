import type { SqlExecutor } from '@/db';
import type { EventDefinition } from '@/domain/models';
import type { EventDefinitionDraft } from '@/domain/validation';
import { EventDefinitionRepository } from '@/repositories';

/**
 * 首次初始化时内置的「参考模板」事件。
 *
 * 为什么要有它：新用户打开「事件」页看到的是空白 + 一句提示，得先想清楚「事件怎么定义」
 * 才能记第一笔。给一个已经配好的例子（名字 + 一条属性 + 一个快捷选项），
 * 点进去就能看到「属性 / 快捷选项 / 记录页」各长什么样——**不喜欢直接删掉即可**。
 *
 * 内容刻意保持最小：一个计数型事件、一条属性、一个快捷选项。
 * 不塞周期型、不塞自定义字段——那些等用户真的要用了再看（定义内页有完整表单）。
 */
export const STARTER_DEFINITIONS: readonly EventDefinitionDraft[] = [
  {
    name: '喝水',
    kind: 'counter',
    // 属性：这一次是什么。记录时可以多选，也可以一条都不选。
    attributes: ['200ml'],
    // 快捷选项：记录页会多出一颗「200ml +1」胶囊，点一下就把这一次记下来。
    quickOptions: [{ attribute: '200ml', value: 1 }],
  },
];

/**
 * 内置模板事件——**只在数据库是这一次新建出来的时候**执行（`freshDatabase`）。
 *
 * 判断「刚新建」而不是「app_meta 里有没有标记」，是为了避免一种很难解释的复活：
 * 用户把内置事件删了，下次升级又冒出来一条。`openDatabase()` 会把迁移前的版本
 * 放在 `connection.migration.from` 里，`from === 0` 就说明这个库文件是刚刚创建的
 * （迁移与建库在同一次打开里完成），此后每次打开 `from` 都不再是 0。
 *
 * 失败**不阻断启动**（与启动记账同一档：这是便利，不是用户数据），
 * 由调用方把它降级成一条警告横幅。
 */
export async function seedStarterDefinitions(
  db: SqlExecutor,
  options: { freshDatabase: boolean },
): Promise<EventDefinition[]> {
  if (!options.freshDatabase) {
    return [];
  }
  const repository = new EventDefinitionRepository(db);
  const created: EventDefinition[] = [];
  for (const draft of STARTER_DEFINITIONS) {
    created.push(await repository.create(draft));
  }
  return created;
}
