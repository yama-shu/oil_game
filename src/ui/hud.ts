import type { WorldState } from "../core/world";

/** クリア記録。localStorage に保存するベストスコアもこの形式 */
export interface Score {
  timeSec: number;
  pokeCount: number;
}

const BEST_SCORE_KEY = "oil-game/best-score";

/**
 * ゲーム画面に重ねる HUD (残り油数・タイム・つつき数・クリア表示・リセット)。
 * Canvas とは独立した DOM 要素として実装し、描画ループから update() で反映する。
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;
  private readonly clearEl: HTMLDivElement;
  private clearShown = false;

  /** リセットボタン押下時のコールバック */
  onReset: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.style.cssText = [
      "position:absolute",
      "inset:0",
      "pointer-events:none",
      "color:#fff7e6",
      "font-size:14px",
      "text-shadow:0 1px 3px rgba(0,0,0,0.6)",
    ].join(";");

    this.statusEl = document.createElement("div");
    this.statusEl.style.cssText =
      "position:absolute;top:calc(env(safe-area-inset-top, 0px) + 10px);left:14px;line-height:1.7;";
    this.root.appendChild(this.statusEl);

    const resetButton = document.createElement("button");
    resetButton.textContent = "やり直す";
    resetButton.style.cssText = [
      "position:absolute",
      "top:calc(env(safe-area-inset-top, 0px) + 10px)",
      "right:14px",
      "pointer-events:auto",
      "background:rgba(0,0,0,0.35)",
      "color:#fff7e6",
      "border:1px solid rgba(255,247,230,0.5)",
      "border-radius:8px",
      "padding:8px 14px",
      "font-size:14px",
    ].join(";");
    resetButton.addEventListener("click", () => this.onReset?.());
    this.root.appendChild(resetButton);

    this.clearEl = document.createElement("div");
    this.clearEl.style.cssText = [
      "position:absolute",
      "top:38%",
      "left:50%",
      "transform:translate(-50%,-50%)",
      "text-align:center",
      "display:none",
    ].join(";");
    this.root.appendChild(this.clearEl);

    parent.appendChild(this.root);
  }

  update(state: WorldState): void {
    const time = formatTime(state.elapsedSec);
    this.statusEl.innerHTML =
      `のこりの油: <b>${state.blobs.length}</b><br>` +
      `タイム: <b>${time}</b><br>` +
      `つついた回数: <b>${state.pokeCount}</b>`;

    if (state.phase === "cleared" && !this.clearShown) {
      this.clearShown = true;
      this.showClear({ timeSec: state.elapsedSec, pokeCount: state.pokeCount });
    }
  }

  reset(): void {
    this.clearShown = false;
    this.clearEl.style.display = "none";
  }

  private showClear(score: Score): void {
    const best = updateBestScore(score);
    const isNewRecord = best !== null && best.timeSec === score.timeSec;
    this.clearEl.innerHTML =
      `<div style="font-size:34px;font-weight:bold;">ひとつになった！</div>` +
      `<div style="font-size:18px;margin-top:10px;">タイム ${formatTime(score.timeSec)} ／ ${score.pokeCount} つつき</div>` +
      (isNewRecord
        ? `<div style="font-size:16px;margin-top:6px;color:#ffd64f;">★ 自己ベスト更新！</div>`
        : best !== null
          ? `<div style="font-size:14px;margin-top:6px;">自己ベスト: ${formatTime(best.timeSec)}</div>`
          : "");
    this.clearEl.style.display = "block";
  }
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

/**
 * ベストスコア (最短タイム) を更新して返す。
 * localStorage が使えない環境 (プライベートモード等) では null を返し、
 * ゲーム自体は記録なしで続行できるようにする。
 */
export function updateBestScore(score: Score): Score | null {
  try {
    const raw = localStorage.getItem(BEST_SCORE_KEY);
    const prev = raw !== null ? (JSON.parse(raw) as Score) : null;
    const isValidPrev =
      prev !== null &&
      typeof prev.timeSec === "number" &&
      Number.isFinite(prev.timeSec);
    const best =
      !isValidPrev || score.timeSec < prev.timeSec ? score : prev;
    localStorage.setItem(BEST_SCORE_KEY, JSON.stringify(best));
    return best;
  } catch {
    return null;
  }
}
