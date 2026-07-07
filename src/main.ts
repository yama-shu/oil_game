import { loadConfig } from "./config";
import { radiusOf } from "./core/blob";
import { createRng } from "./core/rng";
import type { WorldParams, WorldState } from "./core/world";
import { addPoke, createWorld, stepWorld } from "./core/world";
import { PointerInput } from "./input/pointer";
import { createLogger } from "./logger";
import { CanvasRenderer } from "./render/renderer2d";
import type { GameRenderer } from "./render/types";
import { Hud } from "./ui/hud";

/**
 * エントリポイント。
 * 設定読み込み → 各レイヤの生成 → ゲームループ起動、の配線のみを担当する。
 */
function main(): void {
  const config = loadConfig(new URLSearchParams(location.search));
  const logger = createLogger(config.logLevel);
  logger.info("起動しました", config);

  const app = document.getElementById("app");
  if (!app) {
    throw new Error("#app 要素が見つかりません (index.html を確認してください)");
  }

  const canvas = document.createElement("canvas");
  app.appendChild(canvas);

  const renderer: GameRenderer = new CanvasRenderer(canvas);
  const hud = new Hud(app);
  const input = new PointerInput(canvas);

  /** 画面サイズから丼の配置を決める。リサイズ・回転のたびに再計算する */
  function computeParams(w: number, h: number): WorldParams {
    const bowlRadius = Math.min(w, h) * 0.42;
    return {
      bowlCenter: { x: w / 2, y: h / 2 },
      bowlRadius,
      initialBlobCount: config.initialBlobCount,
      // 油の初期サイズは丼の大きさに比例させ、端末サイズによらず密度を揃える
      blobRadiusMin: bowlRadius * 0.045,
      blobRadiusMax: bowlRadius * 0.09,
      damping: 0.25,
      attraction: 1.6,
      attractionRange: 2.4,
      pokeStrength: 140,
      pokeRadius: bowlRadius * 0.12,
      maxSpeed: bowlRadius * 2.2,
      convection: 0.06,
    };
  }

  let cssWidth = window.innerWidth;
  let cssHeight = window.innerHeight;
  let params = computeParams(cssWidth, cssHeight);
  let world: WorldState = createWorld(params, createRng(config.seed));
  logger.debug("初期配置", { seed: config.seed, blobs: world.blobs.length });

  function restart(): void {
    // 再スタートのたびに違う配置になるよう、シードは現在時刻から取り直す
    const seed = Date.now() % 2 ** 31;
    world = createWorld(params, createRng(seed));
    hud.reset();
    logger.info("リスタートしました", { seed });
  }
  hud.onReset = restart;

  input.onPokeStart = (pos) => {
    addPoke(world);
    const worldPos = renderer.screenToWorld(pos);
    renderer.addRipple(
      worldPos,
      performance.now() / 1000,
      params.pokeRadius * 2.2,
    );
    logger.debug("つつき", worldPos);
  };

  function handleResize(): void {
    cssWidth = window.innerWidth;
    cssHeight = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    renderer.resize(cssWidth, cssHeight, dpr);

    // 丼の中心・半径が変わるので、油の位置を新旧の丼の相対座標で写し替える
    const prev = params;
    params = computeParams(cssWidth, cssHeight);
    const ratio = params.bowlRadius / prev.bowlRadius;
    for (const blob of world.blobs) {
      blob.pos = {
        x: params.bowlCenter.x + (blob.pos.x - prev.bowlCenter.x) * ratio,
        y: params.bowlCenter.y + (blob.pos.y - prev.bowlCenter.y) * ratio,
      };
      blob.area *= ratio * ratio;
    }
    logger.debug("リサイズ", { cssWidth, cssHeight, dpr });
  }
  window.addEventListener("resize", handleResize);
  handleResize();

  // ゲームループ。dt はタブ復帰などで巨大化するため上限を設けて物理の発散を防ぐ
  const MAX_DT_SEC = 1 / 20;
  let lastTime = performance.now();

  function frame(now: number): void {
    const dt = Math.min((now - lastTime) / 1000, MAX_DT_SEC);
    lastTime = now;
    const nowSec = now / 1000;

    const chopstick = input.sample(dt, (p) => renderer.screenToWorld(p));
    stepWorld(world, params, chopstick, dt);

    // 合体の瞬間に波紋を出す (大きい油ほど大きい波紋)
    for (const merge of world.mergesThisFrame) {
      renderer.addRipple(merge.pos, nowSec, radiusOf(merge) * 2.5);
      logger.debug("合体", { remaining: world.blobs.length });
    }
    if (world.phase === "cleared" && world.mergesThisFrame.length > 0) {
      logger.info("クリア", {
        timeSec: world.elapsedSec,
        pokeCount: world.pokeCount,
      });
    }

    renderer.draw(world, params, chopstick, cssWidth, cssHeight, nowSec);
    hud.update(world);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

try {
  main();
} catch (err) {
  // 起動に失敗した場合はコンソールに詳細を残しつつ、画面にも明示する
  console.error("[oil-game][fatal] 起動に失敗しました", err);
  document.body.innerHTML =
    '<p style="color:#fff;padding:20px;">起動に失敗しました。コンソールを確認してください。</p>';
}
