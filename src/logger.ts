import type { LogLevel } from "./config";

/**
 * レベル制御付きの簡易ロガー。
 * 通常プレイでは info 以上のみ出力し、?log=debug で物理・入力の詳細を追える。
 * 出力先は console (モバイルブラウザでは remote debugging で確認する)。
 */
const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export function createLogger(level: LogLevel): Logger {
  const threshold = LEVEL_ORDER[level];

  const log =
    (lv: LogLevel, fn: (...a: unknown[]) => void) =>
    (message: string, ...args: unknown[]) => {
      if (LEVEL_ORDER[lv] >= threshold) {
        fn(`[oil-game][${lv}] ${message}`, ...args);
      }
    };

  return {
    debug: log("debug", console.debug),
    info: log("info", console.info),
    warn: log("warn", console.warn),
    error: log("error", console.error),
  };
}
