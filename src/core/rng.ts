/**
 * シード指定可能な擬似乱数生成器 (mulberry32)。
 *
 * Math.random() を直接使うと油の初期配置が毎回変わりテストで再現できないため、
 * シードから決定的に生成できる軽量な PRNG を採用する。
 */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** min 以上 max 未満の一様乱数 */
export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
