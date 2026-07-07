/**
 * 2次元ベクトルのユーティリティ。
 * ゲームループ内で毎フレーム大量に呼ばれるため、クラスではなく
 * プレーンオブジェクト + 純粋関数で実装し、テストしやすさを優先する。
 */
export interface Vec2 {
  x: number;
  y: number;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** ゼロベクトルの場合はゼロベクトルを返す (NaN を発生させない) */
export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  if (len === 0) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / len, y: v.y / len };
}

/** ベクトルの長さを max 以下に制限する */
export function clampLength(v: Vec2, max: number): Vec2 {
  const len = length(v);
  if (len <= max) {
    return { ...v };
  }
  return scale(normalize(v), max);
}
