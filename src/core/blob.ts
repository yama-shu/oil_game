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
  /**
   * 分裂直後の不応時間 (秒)。残っている間は合体も再分裂もしない。
   * 分裂した破片が離れる前に元に戻ってしまうのを防ぐ (#4)
   */
  cooldownSec: number;
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
    cooldownSec: 0,
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
    cooldownSec: 0,
  };
}

/**
 * 1つの油を2つに分裂させる (#4)。合体の逆操作。
 * - 面積: 合計を保存し、ratio : (1 - ratio) で分ける
 * - 位置: 破片同士がすぐ再合体しない距離まで direction の向きに離す
 * - 速度: 元の速度を引き継ぎ、direction の向きに separationSpeed を加える
 * direction は正規化済みであること。
 */
export function splitBlob(
  blob: OilBlob,
  ratio: number,
  direction: Vec2,
  separationSpeed: number,
  cooldownSec: number,
): [OilBlob, OilBlob] {
  const areas: [number, number] = [blob.area * ratio, blob.area * (1 - ratio)];
  const radii = areas.map((a) => Math.sqrt(a / Math.PI));
  // 合体しきい値 (0.85) の外側に出るよう、半径の和より少し広く離す
  const gap = (radii[0]! + radii[1]!) * 1.05;
  const fragments = areas.map((area, i) => {
    const sign = i === 0 ? 1 : -1;
    return {
      id: nextId++,
      pos: {
        x: blob.pos.x + direction.x * gap * sign * (radii[1 - i]! / (radii[0]! + radii[1]!)),
        y: blob.pos.y + direction.y * gap * sign * (radii[1 - i]! / (radii[0]! + radii[1]!)),
      },
      vel: {
        x: blob.vel.x + direction.x * separationSpeed * sign,
        y: blob.vel.y + direction.y * separationSpeed * sign,
      },
      area,
      wobblePhase: blob.wobblePhase + i * 1.7,
      cooldownSec,
    };
  });
  return [fragments[0]!, fragments[1]!];
}
