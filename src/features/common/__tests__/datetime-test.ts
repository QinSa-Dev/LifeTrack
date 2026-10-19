import { localDateText, localTimeText, parseLocalDateTime, shiftLocalDays } from '@/features/common/datetime';

describe('localDateText / localTimeText', () => {
  it('补零输出本地日期与时间', () => {
    const date = new Date(2026, 0, 5, 8, 7); // 2026-01-05 08:07 本地时间
    expect(localDateText(date)).toBe('2026-01-05');
    expect(localTimeText(date)).toBe('08:07');
  });
});

describe('parseLocalDateTime', () => {
  it('解析后得到同一本地时刻（本地 → UTC 往返一致）', () => {
    const iso = parseLocalDateTime('2026-10-19', '08:30');
    expect(iso).not.toBeNull();

    const roundTrip = new Date(iso as string);
    expect(roundTrip.getFullYear()).toBe(2026);
    expect(roundTrip.getMonth()).toBe(9);
    expect(roundTrip.getDate()).toBe(19);
    expect(roundTrip.getHours()).toBe(8);
    expect(roundTrip.getMinutes()).toBe(30);
  });

  it('容忍首尾空白', () => {
    expect(parseLocalDateTime(' 2026-10-19 ', ' 8:30 ')).toBe(parseLocalDateTime('2026-10-19', '08:30'));
  });

  it('格式不合法时返回 null', () => {
    expect(parseLocalDateTime('19/10/2026', '08:30')).toBeNull();
    expect(parseLocalDateTime('2026-10-19', '8')).toBeNull();
    expect(parseLocalDateTime('2026-10-19', '')).toBeNull();
    expect(parseLocalDateTime('', '08:30')).toBeNull();
  });

  it('取值越界时返回 null', () => {
    expect(parseLocalDateTime('2026-13-01', '08:30')).toBeNull();
    expect(parseLocalDateTime('2026-10-19', '25:00')).toBeNull();
    expect(parseLocalDateTime('2026-10-19', '08:60')).toBeNull();
  });

  it('日期溢出时返回 null（2 月 31 日不该被 JS 归一成 3 月）', () => {
    expect(parseLocalDateTime('2026-02-31', '08:30')).toBeNull();
    expect(parseLocalDateTime('2026-02-29', '08:30')).toBeNull(); // 2026 不是闰年
    expect(parseLocalDateTime('2024-02-29', '08:30')).not.toBeNull(); // 2024 是闰年
  });

  it('用「现在」生成的默认值不会落在未来（时间被截断到分钟）', () => {
    const now = new Date();
    const iso = parseLocalDateTime(localDateText(now), localTimeText(now));
    expect(iso).not.toBeNull();
    expect(Date.parse(iso as string)).toBeLessThanOrEqual(now.getTime());
  });
});

describe('shiftLocalDays', () => {
  it('跨月边界按日历天平移', () => {
    const march = new Date(2026, 2, 1, 10, 0); // 2026-03-01 本地
    expect(localDateText(shiftLocalDays(march, -1))).toBe('2026-02-28');
    expect(localDateText(shiftLocalDays(march, -2))).toBe('2026-02-27');
  });

  it('保留时分', () => {
    const base = new Date(2026, 5, 15, 23, 45);
    expect(localTimeText(shiftLocalDays(base, -1))).toBe('23:45');
  });
});
