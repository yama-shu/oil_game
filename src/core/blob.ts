import type { Vec2 } from "./vec2";

/**
 * スープに浮かぶ油の粒。
 * 大きさは半径ではなく「面積」を正として扱う。
 * 合体時に面積の合計を保存することで、見た目の総量が変わらないようにするため。
 */
export interface OilBlob {
  id: number;
  pos: Vec2;
  vel: Vec2;
  /** 油の面積 (px^2)。半径はここから導出する */
  area: number;
  /** 描画のゆらぎ用の位相 (物理には影響しない) */
  wobblePhase: number;
}

export function radiusOf(blob: Pick<OilBlob, "area">): number {
  return Math.sqrt(blob.area / Math.PI);
}

export function areaFromRadius(radius: number): number {
  return Math.PI * radius * radius;
}

let nextId = 1;

export function createBlob(pos: Vec2, radius: number, wobblePhase = 0): OilBlob {
  return {
    id: nextId++,
    pos,
    vel: { x: 0, y: 0 },
    area: areaFromRadius(radius),
    wobblePhase,
  };
}

/**
 * 2つの油を1つに合体させる。
 * - 面積: 合計を保存 (油の総量が変わらない)
 * - 位置: 面積による重心 (大きい油に吸い込まれるように見える)
 * - 速度: 運動量保存 (面積を質量とみなす)
 */
export function mergeBlobs(a: OilBlob, b: OilBlob): OilBlob {
  const totalArea = a.area + b.area;
  return {
    id: a.area >= b.area ? a.id : b.id,
    pos: {
      x: (a.pos.x * a.area + b.pos.x * b.area) / totalArea,
      y: (a.pos.y * a.area + b.pos.y * b.area) / totalArea,
    },
    vel: {
      x: (a.vel.x * a.area + b.vel.x * b.area) / totalArea,
      y: (a.vel.y * a.area + b.vel.y * b.area) / totalArea,
    },
    area: totalArea,
    wobblePhase: a.area >= b.area ? a.wobblePhase : b.wobblePhase,
  };
}
