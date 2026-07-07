import type { Chopstick } from "../core/world";
import type { Vec2 } from "../core/vec2";

/**
 * タッチ / マウスを Pointer Events で統一的に扱い、
 * 「箸」の位置と速度 (突く勢い) に変換する。
 *
 * 速度はフレーム間の移動量から算出し、指数移動平均で平滑化する。
 * 生の差分をそのまま使うとタッチのジッタで油が暴れるため。
 */
export class PointerInput {
  private current: Vec2 | null = null;
  /** 前フレームの物理座標系での位置。速度は物理座標系で算出する */
  private previousWorld: Vec2 | null = null;
  private smoothedVel: Vec2 = { x: 0, y: 0 };

  /** ポインタが押された瞬間に呼ばれるコールバック (つつき回数の記録用) */
  onPokeStart: ((pos: Vec2) => void) | null = null;

  constructor(private readonly element: HTMLElement) {
    element.addEventListener("pointerdown", this.handleDown);
    element.addEventListener("pointermove", this.handleMove);
    element.addEventListener("pointerup", this.handleUp);
    element.addEventListener("pointercancel", this.handleUp);
    element.addEventListener("pointerleave", this.handleUp);
  }

  dispose(): void {
    this.element.removeEventListener("pointerdown", this.handleDown);
    this.element.removeEventListener("pointermove", this.handleMove);
    this.element.removeEventListener("pointerup", this.handleUp);
    this.element.removeEventListener("pointercancel", this.handleUp);
    this.element.removeEventListener("pointerleave", this.handleUp);
  }

  private readonly handleDown = (e: PointerEvent): void => {
    // マルチタッチは最初の指のみ追跡する (箸は一膳しかないため)
    if (this.current !== null) return;
    this.element.setPointerCapture(e.pointerId);
    this.current = this.toLocal(e);
    this.previousWorld = null;
    this.smoothedVel = { x: 0, y: 0 };
    this.onPokeStart?.(this.current);
  };

  private readonly handleMove = (e: PointerEvent): void => {
    if (this.current === null) return;
    if (!e.isPrimary) return;
    this.current = this.toLocal(e);
  };

  private readonly handleUp = (e: PointerEvent): void => {
    if (!e.isPrimary) return;
    this.current = null;
    this.previousWorld = null;
    this.smoothedVel = { x: 0, y: 0 };
  };

  private toLocal(e: PointerEvent): Vec2 {
    const rect = this.element.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /**
   * 毎フレーム呼び、現在の箸の状態を物理座標系で返す。触れていなければ null。
   * dt: 前フレームからの経過秒
   * toWorld: スクリーン座標 → 物理座標の変換 (3D 描画時はレイキャスト投影)。
   *          速度も変換後の座標系で算出する。
   */
  sample(dt: number, toWorld: (p: Vec2) => Vec2 = (p) => p): Chopstick | null {
    if (this.current === null) {
      return null;
    }
    const world = toWorld(this.current);
    if (this.previousWorld !== null && dt > 0) {
      const rawVel = {
        x: (world.x - this.previousWorld.x) / dt,
        y: (world.y - this.previousWorld.y) / dt,
      };
      const alpha = 0.35; // 平滑化係数。大きいほど機敏、小さいほど滑らか
      this.smoothedVel = {
        x: this.smoothedVel.x + (rawVel.x - this.smoothedVel.x) * alpha,
        y: this.smoothedVel.y + (rawVel.y - this.smoothedVel.y) * alpha,
      };
    }
    this.previousWorld = world;
    return { pos: { ...world }, vel: { ...this.smoothedVel } };
  }
}
