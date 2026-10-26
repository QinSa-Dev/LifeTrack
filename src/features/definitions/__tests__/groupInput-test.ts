import type { EventGroup } from '@/domain/models';

import { renameGroupInput } from '@/features/definitions/groupInput';

const group: EventGroup = {
  id: 'grp-1',
  name: '健康',
  color: '#3B82F6',
  sortOrder: 7,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('renameGroupInput', () => {
  it('带上新名字', () => {
    expect(renameGroupInput(group, '身体').name).toBe('身体');
  });

  it('保留原有的颜色与排序（update 是整体替换，丢了就会被清空）', () => {
    expect(renameGroupInput(group, '身体')).toEqual({
      name: '身体',
      color: '#3B82F6',
      sortOrder: 7,
    });
  });

  it('没有颜色的分组改名后仍然没有颜色', () => {
    const plain: EventGroup = { ...group, color: undefined };
    expect(renameGroupInput(plain, '身体').color).toBeUndefined();
  });

  it('不改动传进来的分组', () => {
    renameGroupInput(group, '身体');
    expect(group.name).toBe('健康');
  });
});
