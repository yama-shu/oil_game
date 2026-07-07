import { describe, expect, it } from "vitest";
import {
  areaFromRadius,
  createBlob,
  mergeBlobs,
  radiusOf,
} from "../src/core/blob";
import { vec2 } from "../src/core/vec2";

describe("blob", () => {
  it("面積と半径が相互に変換できる", () => {
    const area = areaFromRadius(10);
    expect(area).toBeCloseTo(Math.PI * 100);
    expect(radiusOf({ area })).toBeCloseTo(10);
  });

  it("createBlob は一意な id を割り振る", () => {
    const a = createBlob(vec2(0, 0), 10);
    const b = createBlob(vec2(0, 0), 10);
    expect(a.id).not.toBe(b.id);
  });

  describe("mergeBlobs", () => {
    it("合体後の面積は2つの面積の合計になる (油の総量保存)", () => {
      const a = createBlob(vec2(0, 0), 10);
      const b = createBlob(vec2(30, 0), 20);
      const m = mergeBlobs(a, b);
      expect(m.area).toBeCloseTo(a.area + b.area);
    });

    it("合体後の位置は面積による重心になる", () => {
      // 同じ大きさなら中点、大きさが違えば大きい方に寄る
      const a = createBlob(vec2(0, 0), 10);
      const b = createBlob(vec2(100, 0), 10);
      const mid = mergeBlobs(a, b);
      expect(mid.pos.x).toBeCloseTo(50);

      const big = createBlob(vec2(0, 0), 20);
      const small = createBlob(vec2(100, 0), 10);
      const skewed = mergeBlobs(big, small);
      expect(skewed.pos.x).toBeLessThan(50);
    });

    it("合体後の速度は運動量 (面積×速度) を保存する", () => {
      const a = createBlob(vec2(0, 0), 10);
      a.vel = vec2(10, 0);
      const b = createBlob(vec2(10, 0), 10);
      b.vel = vec2(-10, 0);
      // 同面積で逆向きの速度なら打ち消し合って静止する
      const m = mergeBlobs(a, b);
      expect(m.vel.x).toBeCloseTo(0);
      expect(m.vel.y).toBeCloseTo(0);
    });

    it("合体後は大きい方の id を引き継ぐ", () => {
      const big = createBlob(vec2(0, 0), 20);
      const small = createBlob(vec2(10, 0), 5);
      expect(mergeBlobs(big, small).id).toBe(big.id);
      expect(mergeBlobs(small, big).id).toBe(big.id);
    });
  });
});
