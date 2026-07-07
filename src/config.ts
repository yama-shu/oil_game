/**
 * ゲーム設定。
 * 既定値をここで一元管理し、URL クエリパラメータで一部を上書きできる。
 * 例: ?blobs=40&seed=123&log=debug
 *
 * クエリ値は信頼できない入力として扱い、数値として不正なもの・
 * 許容範囲外のものは既定値にフォールバックする。
 */
export interface GameConfig {
  /** 初期の油の個数 */
  initialBlobCount: number;
  /** 乱数シード。同じシードなら同じ初期配置になる */
  seed: number;
  /** ログレベル */
  logLevel: LogLevel;
  /** 描画方式。3d = three.js (既定)、2d = Canvas 2D (フォールバック) */
  renderer: RendererKind;
}

export type LogLevel = "debug" | "info" | "warn" | "error";
export type RendererKind = "2d" | "3d";

const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];
const RENDERER_KINDS: readonly RendererKind[] = ["2d", "3d"];

export const DEFAULT_CONFIG: GameConfig = {
  initialBlobCount: 24,
  seed: Date.now() % 2 ** 31,
  logLevel: "info",
  renderer: "3d",
};

/** 油の個数として受け付ける範囲。多すぎると低スペック端末で処理落ちする */
export const BLOB_COUNT_MIN = 2;
export const BLOB_COUNT_MAX = 80;

/**
 * 整数クエリパラメータを検証付きで読む。
 * 数値でない・範囲外の場合は fallback を返す。
 */
export function parseIntParam(
  raw: string | null,
  min: number,
  max: number,
  fallback: number,
): number {
  if (raw === null || raw.trim() === "") {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return fallback;
  }
  if (n < min || n > max) {
    return fallback;
  }
  return n;
}

export function parseLogLevelParam(
  raw: string | null,
  fallback: LogLevel,
): LogLevel {
  if (raw !== null && (LOG_LEVELS as readonly string[]).includes(raw)) {
    return raw as LogLevel;
  }
  return fallback;
}

export function parseRendererParam(
  raw: string | null,
  fallback: RendererKind,
): RendererKind {
  if (raw !== null && (RENDERER_KINDS as readonly string[]).includes(raw)) {
    return raw as RendererKind;
  }
  return fallback;
}

/** URLSearchParams から設定を構築する */
export function loadConfig(params: URLSearchParams): GameConfig {
  return {
    initialBlobCount: parseIntParam(
      params.get("blobs"),
      BLOB_COUNT_MIN,
      BLOB_COUNT_MAX,
      DEFAULT_CONFIG.initialBlobCount,
    ),
    seed: parseIntParam(
      params.get("seed"),
      0,
      2 ** 31 - 1,
      DEFAULT_CONFIG.seed,
    ),
    logLevel: parseLogLevelParam(params.get("log"), DEFAULT_CONFIG.logLevel),
    renderer: parseRendererParam(
      params.get("renderer"),
      DEFAULT_CONFIG.renderer,
    ),
  };
}
