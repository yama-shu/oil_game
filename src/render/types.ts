import type { Chopstick, WorldParams, WorldState } from "../core/world";
import type { Vec2 } from "../core/vec2";

/**
 * 描画レイヤの共通インターフェース。
 * Canvas 2D 実装 (renderer2d) と three.js 実装 (renderer3d) を
 * ゲームループから同じ形で扱えるようにする。
 * 実装は WorldState を読むだけで、状態を変更してはならない。
 */
export interface GameRenderer {
  /** 表示サイズと devicePixelRatio に合わせて描画バッファを再設定する */
  resize(cssWidth: number, cssHeight: number, dpr: number): void;

  /** 演出用の波紋を追加する (物理には影響しない) */
  addRipple(pos: Vec2, nowSec: number, maxRadius: number): void;

  /**
   * スクリーン座標 (CSS px) を物理座標へ変換する。
   * 2D 描画では恒等変換だが、3D 描画ではカメラが傾いているため
   * レイキャストでスープ面へ投影する必要がある。
   */
  screenToWorld(pos: Vec2): Vec2;

  /** 1フレーム描画する */
  draw(
    state: WorldState,
    params: WorldParams,
    chopstick: Chopstick | null,
    cssWidth: number,
    cssHeight: number,
    nowSec: number,
  ): void;
}
