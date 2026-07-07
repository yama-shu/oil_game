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
  attractionRange: 3,
  pokeStrength: 120,
  pokeRadius: 24,
  maxSpeed: 500,
  convection: 0.02,
};

function emptyState(): WorldState {
  return {
    blobs: [],
    phase: "playing",
    elapsedSec: 0,
    pokeCount: 0,
    mergesThisFrame: [],
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
    stepWorld(state, params, null, 1 / 60);
    expect(state.elapsedSec).toBeCloseTo(1 / 60);
    expect(state.blobs).toHaveLength(1);
    expect(state.phase).toBe("cleared");
  });

  it("クリア後は経過時間が進まない", () => {
    const state = emptyState();
    state.blobs = [createBlob(vec2(100, 100), 10)];
    state.phase = "cleared";
    state.elapsedSec = 10;
    stepWorld(state, params, null, 1);
    expect(state.elapsedSec).toBe(10);
  });

  it("箸の影響半径内の油は箸から離れる方向に動く", () => {
    const state = emptyState();
    const blob = createBlob(vec2(210, 200), 10);
    state.blobs = [blob, createBlob(vec2(120, 280), 10)];
    const chopstick = { pos: vec2(200, 200), vel: vec2(0, 0) };
    stepWorld(state, params, chopstick, 1 / 60);
    // 箸は油の左にあるので、油は右 (x正方向) に押される
    expect(blob.vel.x).toBeGreaterThan(0);
  });

  it("油は丼の外に出ない", () => {
    const state = emptyState();
    const blob = createBlob(vec2(370, 200), 10); // 縁ぎりぎり
    blob.vel = vec2(1000, 0); // 外向きに強い速度
    state.blobs = [blob, createBlob(vec2(100, 100), 10)];
    for (let i = 0; i < 120; i++) {
      stepWorld(state, params, null, 1 / 60);
    }
    for (const b of state.blobs) {
      const d = distance(b.pos, params.bowlCenter);
      expect(d + radiusOf(b)).toBeLessThanOrEqual(params.bowlRadius + 0.01);
    }
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
