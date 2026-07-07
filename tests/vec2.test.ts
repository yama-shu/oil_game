import { describe, expect, it } from "vitest";
import {
  add,
  clampLength,
  distance,
  length,
  normalize,
  scale,
  sub,
  vec2,
} from "../src/core/vec2";

describe("vec2", () => {
  it("加算・減算・スカラー倍が成分ごとに計算される", () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual({ x: 4, y: 6 });
    expect(sub(vec2(3, 4), vec2(1, 2))).toEqual({ x: 2, y: 2 });
    expect(scale(vec2(1, -2), 3)).toEqual({ x: 3, y: -6 });
  });

  it("長さと距離が計算できる", () => {
    expect(length(vec2(3, 4))).toBe(5);
    expect(distance(vec2(1, 1), vec2(4, 5))).toBe(5);
  });

  describe("normalize", () => {
    it("単位ベクトルを返す", () => {
      const n = normalize(vec2(3, 4));
      expect(n.x).toBeCloseTo(0.6);
      expect(n.y).toBeCloseTo(0.8);
    });

    it("境界値: ゼロベクトルでも NaN を返さずゼロベクトルを返す", () => {
      expect(normalize(vec2(0, 0))).toEqual({ x: 0, y: 0 });
    });
  });

  describe("clampLength", () => {
    it("上限以下のベクトルはそのまま返す", () => {
      expect(clampLength(vec2(3, 4), 10)).toEqual({ x: 3, y: 4 });
    });

    it("境界値: 上限ちょうどの長さはそのまま返す", () => {
      expect(clampLength(vec2(3, 4), 5)).toEqual({ x: 3, y: 4 });
    });

    it("上限を超えるベクトルは向きを保って切り詰める", () => {
      const clamped = clampLength(vec2(30, 40), 5);
      expect(clamped.x).toBeCloseTo(3);
      expect(clamped.y).toBeCloseTo(4);
      expect(length(clamped)).toBeCloseTo(5);
    });
  });
});
