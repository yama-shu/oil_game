import type { OilBlob } from "./blob";
import { createBlob, mergeBlobs, radiusOf } from "./blob";
import type { Rng } from "./rng";
import { randRange } from "./rng";
import type { Vec2 } from "./vec2";
import { add, clampLength, distance, normalize, scale, sub } from "./vec2";

/** 物理挙動のチューニングパラメータ。値の根拠は docs/architecture.md を参照 */
export interface WorldParams {
  /** 丼 (プレイフィールド) の中心 */
  bowlCenter: Vec2;
  /** 丼の半径 (px) */
  bowlRadius: number;
  /** 初期に浮かべる油の個数 */
  initialBlobCount: number;
  /** 初期の油の半径の範囲 (px) */
  blobRadiusMin: number;
  blobRadiusMax: number;
  /** スープの粘性による減衰係数 (1秒あたりの速度残存率のべき基数) */
  damping: number;
  /** 油同士が引き合う表面張力の強さ */
  attraction: number;
  /** 表面張力が働き始める距離 (半径の和に対する倍率) */
  attractionRange: number;
  /** 箸で押される力の強さ */
  pokeStrength: number;
  /** 箸の影響半径 (px) */
  pokeRadius: number;
  /** 油の最高速度 (px/s)。発散防止のための安全弁 */
  maxSpeed: number;
  /**
   * スープの流れ (漂い) の速さ (px/s)。
   * 中心に収束する対流とは異なり、滑らかな流れ場に沿って漂わせるだけなので
   * 放置しても油同士が自然に集まることはない (#3)
   */
  driftSpeed: number;
  /**
   * 接触寸前の油同士を押し返すクッションの強さ (px/s^2)。
   * 漂いや縁の押し付け程度の弱い力では油が触れ合わないようにして、
   * 放置での自然合体を防ぐ。箸の突きはこれより十分強いので、
   * ユーザーが押し込んだときだけ合体する (#3)
   */
  repulsion: number;
}

/** 箸 (ポインタ) の現在の状態。null なら触れていない */
export interface Chopstick {
  pos: Vec2;
  /** 直前フレームからの移動速度 (px/s)。突く勢いとして使う */
  vel: Vec2;
}

export type GamePhase = "playing" | "cleared";

export interface WorldState {
  blobs: OilBlob[];
  phase: GamePhase;
  /** プレイ開始からの経過秒 */
  elapsedSec: number;
  /**
   * 物理シミュレーションの通算時間 (秒)。流れ場の時間変化に使う。
   * elapsedSec と違い、クリア後も進み続ける
   */
  simTimeSec: number;
  /** 箸を入れた (タッチした) 回数。入力レイヤから addPoke() で加算する */
  pokeCount: number;
  /** このフレームで発生した合体イベント (演出用) */
  mergesThisFrame: MergeEvent[];
}

export interface MergeEvent {
  pos: Vec2;
  /** 合体後の面積 */
  area: number;
}

/**
 * 丼の中に重ならないように油の初期配置を生成する。
 * 単純なリジェクションサンプリングで、試行上限を超えたら
 * 重なりを許容して配置する (ゲーム進行には支障がないため)。
 */
export function spawnBlobs(params: WorldParams, rng: Rng): OilBlob[] {
  const blobs: OilBlob[] = [];
  const maxTries = 200;
  for (let i = 0; i < params.initialBlobCount; i++) {
    const radius = randRange(rng, params.blobRadiusMin, params.blobRadiusMax);
    let placed: Vec2 | null = null;
    for (let t = 0; t < maxTries; t++) {
      const angle = randRange(rng, 0, Math.PI * 2);
      const dist = Math.sqrt(rng()) * (params.bowlRadius - radius - 4);
      const pos = {
        x: params.bowlCenter.x + Math.cos(angle) * dist,
        y: params.bowlCenter.y + Math.sin(angle) * dist,
      };
      // 生成間隔は広めに取る。漂いによる相対移動で偶発的に接触しないための余白 (#3)
      const overlapping = blobs.some(
        (b) => distance(b.pos, pos) < radiusOf(b) + radius + 10,
      );
      if (!overlapping) {
        placed = pos;
        break;
      }
    }
    if (placed === null) {
      // 上限まで試しても空きがない場合は中心付近に置く (すぐ合体して解消される)
      placed = { ...params.bowlCenter };
    }
    blobs.push(createBlob(placed, radius, randRange(rng, 0, Math.PI * 2)));
  }
  return blobs;
}

export function createWorld(params: WorldParams, rng: Rng): WorldState {
  return {
    blobs: spawnBlobs(params, rng),
    phase: "playing",
    elapsedSec: 0,
    simTimeSec: 0,
    pokeCount: 0,
    mergesThisFrame: [],
  };
}

/**
 * 1フレーム分の物理更新。
 * dt は秒。可変フレームレートでも挙動が大きく変わらないよう、
 * すべての力を dt でスケールする。
 */
export function stepWorld(
  state: WorldState,
  params: WorldParams,
  chopstick: Chopstick | null,
  dt: number,
): void {
  state.mergesThisFrame = [];
  state.simTimeSec += dt;
  if (state.phase === "cleared") {
    // クリア後も油はゆらゆら漂わせるが、時間・カウントは進めない
    applyForcesAndMove(state, params, null, dt);
    return;
  }

  state.elapsedSec += dt;
  applyForcesAndMove(state, params, chopstick, dt);
  resolveMerges(state);

  if (state.blobs.length === 1) {
    state.phase = "cleared";
  }
}

/**
 * 流れ場の目標速度へ漸近させる係数。
 * damping=0.25 の減衰率 |ln 0.25| ≈ 1.4 /s と釣り合わせ、
 * 定常状態の漂い速度がおよそ driftSpeed になるようにしている
 */
const FLOW_FOLLOW_RATE = 1.4;

/** 油同士のクッション (repulsion) が働き始める表面間のすき間 (px) */
const CONTACT_CUSHION_PX = 8;

/**
 * スープの流れ場。位置と時刻から、その場所の流れの目標速度を返す。
 * 波長を丼サイズ程度に取った正弦波の重ね合わせで作っており、
 * - 空間的に滑らか: 近くの油はほぼ同じ速度で流れ、相対距離が保たれる
 * - 時間変化する: 同じ場所でも流れの向きがゆっくり変わり、単調に見えない
 * - 収束点を持たない: 中心対流のように1点へ集めてしまうことがない
 */
export function flowFieldAt(
  pos: Vec2,
  params: WorldParams,
  timeSec: number,
): Vec2 {
  const L = params.bowlRadius * 1.2;
  const x = (pos.x - params.bowlCenter.x) / L;
  const y = (pos.y - params.bowlCenter.y) / L;
  const t = timeSec;
  const fx =
    Math.sin(y * 2.1 + t * 0.5 + 1.3) + 0.6 * Math.sin(x * 1.4 + t * 0.33);
  const fy =
    Math.sin(x * 1.9 + t * 0.44) + 0.6 * Math.sin(y * 1.2 + t * 0.61 + 2.0);
  // 振幅の最大値はおよそ 1.6 なので、最高流速が driftSpeed になるよう正規化する
  return scale({ x: fx, y: fy }, params.driftSpeed / 1.6);
}

/** プレイ中に箸を入れた回数を記録する。ポインタダウン時に入力レイヤから呼ぶ */
export function addPoke(state: WorldState): void {
  if (state.phase === "playing") {
    state.pokeCount++;
  }
}

/** 力の適用と移動・境界処理 */
function applyForcesAndMove(
  state: WorldState,
  params: WorldParams,
  chopstick: Chopstick | null,
  dt: number,
): void {
  const { blobs } = state;

  for (const blob of blobs) {
    let force: Vec2 = { x: 0, y: 0 };

    // 油同士の相互作用 (#3):
    // - めり込み始めた油は表面張力で引き寄せ、合体しきい値まで吸い込む
    // - 接触寸前 (すき間がクッション幅未満) の油は逆に押し返す。
    //   漂い程度の弱い力ではすき間を越えられず、自然合体しない
    for (const other of blobs) {
      if (other.id === blob.id) continue;
      const d = distance(blob.pos, other.pos);
      const sumRadius = radiusOf(blob) + radiusOf(other);
      if (d <= 0) continue;
      const dir = normalize(sub(other.pos, blob.pos));
      if (d < sumRadius * params.attractionRange) {
        // 大きい油ほど強く引っ張る。距離が近いほど強い
        const strength = params.attraction * (other.area / (d * d));
        force = add(force, scale(dir, strength));
      } else {
        const gap = d - sumRadius;
        if (gap < CONTACT_CUSHION_PX) {
          const strength = params.repulsion * (1 - gap / CONTACT_CUSHION_PX);
          force = add(force, scale(dir, -strength));
        }
      }
    }

    // 漂い: 空間的に滑らかな時変の流れ場に沿ってゆっくり流す。
    // 近くの油はほぼ同じ向きに流れるため相対距離が保たれ、
    // 中心収束型の対流と違って放置で油が集まることはない (#3)
    force = add(
      force,
      scale(flowFieldAt(blob.pos, params, state.simTimeSec), FLOW_FOLLOW_RATE),
    );

    // 箸: 影響半径内の油を、箸の進行方向 + 箸から離れる方向に弾く
    if (chopstick) {
      const d = distance(blob.pos, chopstick.pos);
      const reach = params.pokeRadius + radiusOf(blob);
      if (d < reach) {
        const away = normalize(sub(blob.pos, chopstick.pos));
        const push = add(
          scale(away, params.pokeStrength),
          scale(chopstick.vel, 0.9),
        );
        // 小さい油ほど軽く飛ぶように面積で割る (質量相当)
        const impulse = scale(push, 1 / Math.max(blob.area / 400, 1));
        blob.vel = add(blob.vel, scale(impulse, dt * 60));
      }
    }

    blob.vel = add(blob.vel, scale(force, dt));
    blob.vel = scale(blob.vel, Math.pow(params.damping, dt));
    blob.vel = clampLength(blob.vel, params.maxSpeed);
    blob.pos = add(blob.pos, scale(blob.vel, dt));
  }

  // 丼の縁: はみ出した分を押し戻し、速度の法線成分を反転して弱める
  for (const blob of blobs) {
    const r = radiusOf(blob);
    const fromCenter = sub(blob.pos, params.bowlCenter);
    const d = Math.hypot(fromCenter.x, fromCenter.y);
    const limit = params.bowlRadius - r;
    if (d > limit && d > 0) {
      const n = scale(fromCenter, 1 / d);
      blob.pos = add(params.bowlCenter, scale(n, limit));
      const vn = blob.vel.x * n.x + blob.vel.y * n.y;
      if (vn > 0) {
        blob.vel = sub(blob.vel, scale(n, vn * 1.5));
      }
    }
  }
}

/**
 * 接触している油同士を合体させる。
 * 合体で新しくできた油がさらに別の油と接触するケースがあるため、
 * 合体が発生しなくなるまで繰り返す。
 */
export function resolveMerges(state: WorldState): void {
  let merged = true;
  while (merged) {
    merged = false;
    const { blobs } = state;
    outer: for (let i = 0; i < blobs.length; i++) {
      for (let j = i + 1; j < blobs.length; j++) {
        const a = blobs[i]!;
        const b = blobs[j]!;
        const d = distance(a.pos, b.pos);
        // 縁が触れただけでは合体せず、少しめり込んだら合体する
        // (すれ違いで即合体すると操作の余地がなくなるため)
        if (d < (radiusOf(a) + radiusOf(b)) * 0.85) {
          const m = mergeBlobs(a, b);
          blobs.splice(j, 1);
          blobs.splice(i, 1);
          blobs.push(m);
          state.mergesThisFrame.push({ pos: { ...m.pos }, area: m.area });
          merged = true;
          break outer;
        }
      }
    }
  }
}
