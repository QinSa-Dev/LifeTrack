/**
 * UUID 方案：UUID v7（RFC 9562）。
 *
 * 为什么不用 v4：LifeTrack 的事实数据（事件记录、周期记录）天然按时间产生，
 * v7 把 48 位毫秒时间戳放在高位，主键本身即全局有序，
 * 便于「按时间分页/排序」并让 SQLite 的 B-Tree 写入更集中（本地数据库收益明显）。
 *
 * 实现约束：
 * - 时间戳 + 同毫秒内自增序列 → 同一进程内严格单调递增；
 * - 随机位来自 expo-crypto 的密码学安全随机源。
 */

import * as Crypto from 'expo-crypto';

import { ValidationError } from './errors';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** 12 位 rand_a 作为同毫秒序列号，最多 4096 个/毫秒 */
const MAX_SEQUENCE = 0x0fff;

let lastTimestamp = -1;
let sequence = 0;

function hex(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

function formatUuid(bytes: Uint8Array): string {
  return (
    `${hex(bytes[0] ?? 0)}${hex(bytes[1] ?? 0)}${hex(bytes[2] ?? 0)}${hex(bytes[3] ?? 0)}` +
    `-${hex(bytes[4] ?? 0)}${hex(bytes[5] ?? 0)}` +
    `-${hex(bytes[6] ?? 0)}${hex(bytes[7] ?? 0)}` +
    `-${hex(bytes[8] ?? 0)}${hex(bytes[9] ?? 0)}` +
    `-${hex(bytes[10] ?? 0)}${hex(bytes[11] ?? 0)}${hex(bytes[12] ?? 0)}${hex(bytes[13] ?? 0)}` +
    `${hex(bytes[14] ?? 0)}${hex(bytes[15] ?? 0)}`
  );
}

/** 取下一个 (timestamp, sequence) 组合，保证单调不减。 */
function nextStamp(timestampMs: number): { timestampMs: number; sequence: number } {
  if (timestampMs > lastTimestamp) {
    lastTimestamp = timestampMs;
    sequence = 0;
  } else if (timestampMs === lastTimestamp) {
    if (sequence >= MAX_SEQUENCE) {
      // 同一毫秒内超量：把时间戳推进 1ms，保证严格递增而不是回绕
      lastTimestamp += 1;
      sequence = 0;
    } else {
      sequence += 1;
    }
  } else {
    // 传入比上次更早的时间（补录场景）：沿用递增序列，绝不回退
    if (sequence >= MAX_SEQUENCE) {
      lastTimestamp += 1;
      sequence = 0;
    } else {
      sequence += 1;
    }
  }
  return { timestampMs: lastTimestamp, sequence };
}

/**
 * 生成一个 UUID v7。
 * @param timestampMs 毫秒时间戳，默认取当前时间；显式传入便于测试与补录排序。
 */
export function uuidv7(timestampMs: number = Date.now()): string {
  if (!Number.isFinite(timestampMs) || timestampMs < 0) {
    throw new ValidationError(`uuidv7 需要非负的毫秒时间戳，收到：${String(timestampMs)}`);
  }

  const stamp = nextStamp(Math.floor(timestampMs));

  const bytes = new Uint8Array(16);
  Crypto.getRandomValues(bytes);

  // 48 位大端时间戳（bytes 0..5）
  let remaining = stamp.timestampMs;
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }

  // 版本号 7（bytes[6] 高 4 位）+ rand_a 高 4 位
  bytes[6] = ((stamp.sequence >> 8) & 0x0f) | 0x70;
  // rand_a 低 8 位
  bytes[7] = stamp.sequence & 0xff;
  // RFC 4122 变体（bytes[8] 高 2 位 = 10）
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  return formatUuid(bytes);
}

/** 生成新的实体主键。 */
export function newId(): string {
  return uuidv7();
}

export function isUuidV7(value: string): boolean {
  return UUID_V7_PATTERN.test(value);
}

/**
 * 实体 id 的形状：UUID（8-4-4-4-12 的小写十六进制），**不限定版本**。
 *
 * 为什么导入这条边界不要求 v7：`uuidv7` 管的是**往后怎么写**（主键本身按时间有序），
 * 而库里已有的 id 是**既有事实**——本项目早期版本用的是 v4，那些行还在库里，
 * 也照样出现在备份里。导入若只认 v7，「自己导出的备份被自己拒绝」就是一条真会踩到的
 * 死路（手测「选文件导入」时正是撞在这上面：老数据里的分组 id 是 v4）。
 */
const ENTITY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * 校验并返回一个实体 id，用在**导入外部 JSON**的边界上。
 *
 * 只挡「结构上就不是 id」的垃圾（注入、截断、类型错），不挡版本：
 * 既有数据的准入条件是「App 曾经写进过库」，而不是「它是不是 v7」。
 */
export function assertEntityId(value: string, field = 'id'): string {
  if (!ENTITY_ID_PATTERN.test(value)) {
    throw new ValidationError(`${field} 不是合法的 id（UUID）：${value}`);
  }
  return value;
}
