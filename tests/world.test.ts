import { describe, expect, it } from "vitest";
import { createBlob, radiusOf } from "../src/core/blob";
import { createRng } from "../src/core/rng";
import type { WorldParams, WorldState } from "../src/core/world";
import {
  addPoke,
  createWorld,
  resolveMerges,
  spawnBlobs,
  stepWorld,
} from "../src/core/world";
import { distance, vec2 } from "../src/core/vec2";

const params: WorldParams = {
  bowlCenter: vec2(200, 200),
  bowlRadius: 180,
  initialBlobCount: 10,
  blobRadiusMin: 8,
  blobRadiusMax: 16,
  damping: 0.3,
  attraction: 2,
  attractionRange: 1.0,
  pokeStrength: 120,
  pokeRadius: 24,
  maxSpeed: 500,
  driftSpeed: 12,
  repulsion: 90,
  splitSpeed: 500,
};

/** 分裂の分割比などに使う乱数。シード固定で結果を再現可能にする */
const testRng = createRng(1000);

function emptyState(): WorldState {
  return {
    blobs: [],
    phase: "playing",
    elapsedSec: 0,
    simTimeSec: 0,
    pokeCount: 0,
    mergesThisFrame: [],
    splitsThisFrame: [],
  };
}

describe("spawnBlobs", () => {
  it("指定した個数の油が丼の内側に生成される", () => {
    const blobs = spawnBlobs(params, createRng(42));
    expect(blobs).toHaveLength(10);
    for (const b of blobs) {
      const d = distance(b.pos, params.bowlCenter);
      expect(d + radiusOf(b)).toBeLessThanOrEqual(params.bowlRadius + 0.01);
    }
  });

  it("同じシードなら同じ配置になる (再現性)", () => {
    const a = spawnBlobs(params, createRng(7));
    const b = spawnBlobs(params, createRng(7));
    expect(a.map((x) => x.pos)).toEqual(b.map((x) => x.pos));
  });
});

describe("resolveMerges", () => {
  it("めり込んだ油同士は合体し、離れた油は合体しない", () => {
    const state = emptyState();
    state.blobs = [
      createBlob(vec2(100, 100), 10),
      createBlob(vec2(105, 100), 10), // ほぼ重なっている → 合体する
      createBlob(vec2(300, 300), 10), // 遠い → 残る
    ];
    resolveMerges(state);
    expect(state.blobs).toHaveLength(2);
    expect(state.mergesThisFrame).toHaveLength(1);
  });

  it("境界値: 縁が触れた程度 (しきい値の外側) では合体しない", () => {
    const state = emptyState();
    // 半径10同士、しきい値は (10+10)*0.85 = 17。距離18なら合体しない
    state.blobs = [createBlob(vec2(0, 0), 10), createBlob(vec2(18, 0), 10)];
    resolveMerges(state);
    expect(state.blobs).toHaveLength(2);
  });

  it("連鎖合体: 合体でできた油が隣の油に触れていれば続けて合体する", () => {
    const state = emptyState();
    state.blobs = [
      createBlob(vec2(0, 0), 10),
      createBlob(vec2(10, 0), 10),
      createBlob(vec2(22, 0), 10),
    ];
    resolveMerges(state);
    expect(state.blobs).toHaveLength(1);
  });
});

describe("stepWorld", () => {
  it("時間が経過し、油が1つになったらクリアになる", () => {
    const state = emptyState();
    state.blobs = [createBlob(vec2(100, 100), 10), createBlob(vec2(104, 100), 10)];
    stepWorld(state, params, null, 1 / 60, testRng);
    expect(state.elapsedSec).toBeCloseTo(1 / 60);
    expect(state.blobs).toHaveLength(1);
    expect(state.phase).toBe("cleared");
  });

  it("クリア後は経過時間が進まない", () => {
    const state = emptyState();
    state.blobs = [createBlob(vec2(100, 100), 10)];
    state.phase = "cleared";
    state.elapsedSec = 10;
    stepWorld(state, params, null, 1, testRng);
    expect(state.elapsedSec).toBe(10);
  });

  it("箸の影響半径内の油は箸から離れる方向に動く", () => {
    const state = emptyState();
    const blob = createBlob(vec2(210, 200), 10);
    state.blobs = [blob, createBlob(vec2(120, 280), 10)];
    const chopstick = { pos: vec2(200, 200), vel: vec2(0, 0) };
    stepWorld(state, params, chopstick, 1 / 60, testRng);
    // 箸は油の左にあるので、油は右 (x正方向) に押される
    expect(blob.vel.x).toBeGreaterThan(0);
  });

  it("油は丼の外に出ない", () => {
    const state = emptyState();
    const blob = createBlob(vec2(370, 200), 10); // 縁ぎりぎり
    blob.vel = vec2(1000, 0); // 外向きに強い速度
    state.blobs = [blob, createBlob(vec2(100, 100), 10)];
    for (let i = 0; i < 120; i++) {
      stepWorld(state, params, null, 1 / 60, testRng);
    }
    for (const b of state.blobs) {
      const d = distance(b.pos, params.bowlCenter);
      expect(d + radiusOf(b)).toBeLessThanOrEqual(params.bowlRadius + 0.01);
    }
  });
});

describe("放置時の挙動 (#3 の回帰テスト)", () => {
  it("60秒放置しても油が自然合体せず、勝手にクリアされない", () => {
    const state = createWorld(params, createRng(42));
    const initialCount = state.blobs.length;
    for (let i = 0; i < 60 * 60; i++) {
      stepWorld(state, params, null, 1 / 60, testRng);
    }
    expect(state.blobs.length).toBe(initialCount);
    expect(state.phase).toBe("playing");
  });

  it("放置していても油は静止せず漂う", () => {
    const state = createWorld(params, createRng(7));
    const before = state.blobs.map((b) => ({ ...b.pos }));
    for (let i = 0; i < 60 * 5; i++) {
      stepWorld(state, params, null, 1 / 60, testRng);
    }
    // 少なくとも1つの油が目に見える距離 (2px 以上) 動いていること
    const moved = state.blobs.some((b, i) => {
      const p = before[i]!;
      return Math.hypot(b.pos.x - p.x, b.pos.y - p.y) > 2;
    });
    expect(moved).toBe(true);
  });
});

describe("分裂 (#4)", () => {
  const fastChopstick = () => ({ pos: vec2(200, 200), vel: vec2(800, 0) });
  const slowChopstick = () => ({ pos: vec2(200, 200), vel: vec2(100, 0) });

  it("しきい値より速い箸が触れると油が2つに分裂し、総面積が保存される", () => {
    const state = emptyState();
    const blob = createBlob(vec2(200, 200), 20);
    const originalArea = blob.area;
    state.blobs = [blob, createBlob(vec2(100, 100), 10)];
    const bystanderArea = state.blobs[1]!.area;
    stepWorld(state, params, fastChopstick(), 1 / 60, createRng(5));
    expect(state.blobs).toHaveLength(3);
    expect(state.splitsThisFrame).toHaveLength(1);
    const totalArea = state.blobs.reduce((sum, b) => sum + b.area, 0);
    expect(totalArea).toBeCloseTo(originalArea + bystanderArea, 3);
  });

  it("しきい値より遅い箸では分裂しない", () => {
    const state = emptyState();
    state.blobs = [createBlob(vec2(200, 200), 20), createBlob(vec2(100, 100), 10)];
    stepWorld(state, params, slowChopstick(), 1 / 60, createRng(5));
    expect(state.blobs).toHaveLength(2);
    expect(state.splitsThisFrame).toHaveLength(0);
  });

  it("境界値: 破片が最小半径を下回る小さい油は分裂しない", () => {
    // blobRadiusMin=8 → 最小破片面積 = π*64 ≈ 201。
    // 半径10 (面積 ≈ 314) は分割比 0.4 でも破片が 126 < 201 となるため割れない
    const state = emptyState();
    state.blobs = [createBlob(vec2(200, 200), 10), createBlob(vec2(100, 100), 10)];
    stepWorld(state, params, fastChopstick(), 1 / 60, createRng(5));
    expect(state.blobs).toHaveLength(2);
  });

  it("分裂直後の破片は不応時間中に再合体・再分裂しない", () => {
    const state = emptyState();
    state.blobs = [createBlob(vec2(200, 200), 20), createBlob(vec2(100, 100), 10)];
    const rng = createRng(5);
    stepWorld(state, params, fastChopstick(), 1 / 60, rng);
    expect(state.blobs).toHaveLength(3);
    // 直後にもう一度速い箸を当てても、不応時間中なので増えない
    stepWorld(state, params, fastChopstick(), 1 / 60, rng);
    expect(state.blobs).toHaveLength(3);
    // 箸を離して1秒漂わせても、破片同士が勝手に再合体しない
    for (let i = 0; i < 60; i++) {
      stepWorld(state, params, null, 1 / 60, rng);
    }
    expect(state.blobs).toHaveLength(3);
  });
});

describe("addPoke", () => {
  it("プレイ中はカウントされ、クリア後はカウントされない", () => {
    const state = createWorld(params, createRng(1));
    addPoke(state);
    expect(state.pokeCount).toBe(1);
    state.phase = "cleared";
    addPoke(state);
    expect(state.pokeCount).toBe(1);
  });
});
