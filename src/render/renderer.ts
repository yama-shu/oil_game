import type { OilBlob } from "../core/blob";
import { radiusOf } from "../core/blob";
import type { Chopstick, WorldParams, WorldState } from "../core/world";
import type { Vec2 } from "../core/vec2";

/** 合体・タッチ時に広がる波紋 (見た目だけの演出で物理には影響しない) */
export interface Ripple {
  pos: Vec2;
  bornAt: number;
  maxRadius: number;
}

const RIPPLE_LIFETIME_SEC = 0.8;

const COLORS = {
  table: "#2b1a10",
  bowlRim: "#8c2f23",
  bowlRimEdge: "#5f1e16",
  soupDeep: "#b96d21",
  soupMid: "#d98e2b",
  soupEdge: "#c97e26",
  oil: "rgba(255, 214, 79, 0.92)",
  oilEdge: "rgba(230, 168, 23, 0.95)",
  oilHighlight: "rgba(255, 250, 220, 0.75)",
  chopstick: "#7a4a21",
  chopstickTip: "#5c3517",
  ripple: "rgba(255, 244, 200, 0.5)",
} as const;

/**
 * Canvas 2D への描画を担当する。
 * ゲーム状態 (WorldState) を受け取って描くだけで、状態を変更しない。
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private ripples: Ripple[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context を取得できませんでした");
    }
    this.ctx = ctx;
  }

  /**
   * 表示サイズと devicePixelRatio に合わせて描画バッファを再設定する。
   * 高解像度端末でにじまないようにするため。
   */
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  addRipple(pos: Vec2, nowSec: number, maxRadius: number): void {
    this.ripples.push({ pos: { ...pos }, bornAt: nowSec, maxRadius });
  }

  draw(
    state: WorldState,
    params: WorldParams,
    chopstick: Chopstick | null,
    cssWidth: number,
    cssHeight: number,
    nowSec: number,
  ): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    this.drawTable(cssWidth, cssHeight);
    this.drawBowl(params);
    this.drawRipples(params, nowSec);
    for (const blob of state.blobs) {
      this.drawBlob(blob, nowSec);
    }
    if (chopstick) {
      this.drawChopstick(chopstick);
    }
  }

  private drawTable(w: number, h: number): void {
    const { ctx } = this;
    ctx.fillStyle = COLORS.table;
    ctx.fillRect(0, 0, w, h);
  }

  private drawBowl(params: WorldParams): void {
    const { ctx } = this;
    const { bowlCenter: c, bowlRadius: r } = params;

    // 丼の縁 (外側の赤いリング)
    const rimWidth = r * 0.1;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r + rimWidth, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.bowlRimEdge;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x, c.y, r + rimWidth * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.bowlRim;
    ctx.fill();

    // スープ (中心が明るい放射グラデーション)
    const soup = ctx.createRadialGradient(
      c.x - r * 0.15,
      c.y - r * 0.2,
      r * 0.1,
      c.x,
      c.y,
      r,
    );
    soup.addColorStop(0, COLORS.soupMid);
    soup.addColorStop(0.75, COLORS.soupDeep);
    soup.addColorStop(1, COLORS.soupEdge);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fillStyle = soup;
    ctx.fill();

    // 沈んだ麺のほのめかし (薄い曲線を数本)
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(245, 222, 150, 0.18)";
    ctx.lineWidth = 5;
    for (let i = 0; i < 5; i++) {
      const y = c.y - r * 0.6 + i * r * 0.3;
      ctx.beginPath();
      ctx.moveTo(c.x - r, y);
      ctx.bezierCurveTo(
        c.x - r * 0.4,
        y + 18,
        c.x + r * 0.4,
        y - 18,
        c.x + r,
        y + 8,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 油の粒。輪郭を sin でゆらして「ぷるぷる」した有機的な形にする。
   * 半径が大きいほどゆらぎの割合を小さくして、巨大な油がどっしり見えるようにする。
   */
  private drawBlob(blob: OilBlob, nowSec: number): void {
    const { ctx } = this;
    const r = radiusOf(blob);
    const wobbleAmp = Math.min(2.5, r * 0.08);
    const segments = 24;

    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const wobble =
        Math.sin(angle * 3 + blob.wobblePhase + nowSec * 2.1) * wobbleAmp;
      const rr = r + wobble;
      const x = blob.pos.x + Math.cos(angle) * rr;
      const y = blob.pos.y + Math.sin(angle) * rr;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();

    const grad = ctx.createRadialGradient(
      blob.pos.x - r * 0.3,
      blob.pos.y - r * 0.3,
      r * 0.1,
      blob.pos.x,
      blob.pos.y,
      r,
    );
    grad.addColorStop(0, COLORS.oil);
    grad.addColorStop(1, COLORS.oilEdge);
    ctx.fillStyle = grad;
    ctx.fill();

    // ハイライト (光の反射)
    ctx.beginPath();
    ctx.ellipse(
      blob.pos.x - r * 0.35,
      blob.pos.y - r * 0.4,
      r * 0.22,
      r * 0.12,
      -0.6,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = COLORS.oilHighlight;
    ctx.fill();
  }

  /** 箸先。タッチ位置に斜めに構えた2本の棒を描く */
  private drawChopstick(chopstick: Chopstick): void {
    const { ctx } = this;
    const { pos } = chopstick;
    const len = 150;
    const dir = { x: 0.55, y: -0.85 }; // 右上に伸びる

    ctx.lineCap = "round";
    for (const offset of [-4, 4]) {
      ctx.beginPath();
      ctx.moveTo(pos.x + offset, pos.y);
      ctx.lineTo(pos.x + offset + dir.x * len, pos.y + dir.y * len);
      ctx.strokeStyle = COLORS.chopstick;
      ctx.lineWidth = 7;
      ctx.stroke();
    }

    // 箸先の接触点
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.chopstickTip;
    ctx.fill();
  }

  private drawRipples(params: WorldParams, nowSec: number): void {
    const { ctx } = this;
    this.ripples = this.ripples.filter(
      (r) => nowSec - r.bornAt < RIPPLE_LIFETIME_SEC,
    );

    ctx.save();
    ctx.beginPath();
    ctx.arc(params.bowlCenter.x, params.bowlCenter.y, params.bowlRadius, 0, Math.PI * 2);
    ctx.clip();
    for (const ripple of this.ripples) {
      const t = (nowSec - ripple.bornAt) / RIPPLE_LIFETIME_SEC;
      ctx.beginPath();
      ctx.arc(ripple.pos.x, ripple.pos.y, ripple.maxRadius * t, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.ripple;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
