import { describe, expect, it } from "vitest";
import {
  BLOB_COUNT_MAX,
  BLOB_COUNT_MIN,
  DEFAULT_CONFIG,
  loadConfig,
  parseIntParam,
  parseLogLevelParam,
} from "../src/config";

describe("parseIntParam", () => {
  const parse = (raw: string | null) => parseIntParam(raw, 2, 80, 24);

  it("範囲内の整数はそのまま採用する", () => {
    expect(parse("40")).toBe(40);
  });

  it("境界値: 下限・上限ちょうどは採用する", () => {
    expect(parse("2")).toBe(2);
    expect(parse("80")).toBe(80);
  });

  it("境界値: 範囲外 (下限-1, 上限+1) は既定値に落とす", () => {
    expect(parse("1")).toBe(24);
    expect(parse("81")).toBe(24);
  });

  it("不正な入力 (数値でない・小数・空・null) は既定値に落とす", () => {
    expect(parse("abc")).toBe(24);
    expect(parse("3.5")).toBe(24);
    expect(parse("")).toBe(24);
    expect(parse("Infinity")).toBe(24);
    expect(parse("NaN")).toBe(24);
    expect(parse(null)).toBe(24);
  });
});

describe("parseLogLevelParam", () => {
  it("定義済みレベルは採用し、未知の値は既定値に落とす", () => {
    expect(parseLogLevelParam("debug", "info")).toBe("debug");
    expect(parseLogLevelParam("verbose", "info")).toBe("info");
    expect(parseLogLevelParam(null, "warn")).toBe("warn");
  });
});

describe("loadConfig", () => {
  it("クエリパラメータから設定を構築する", () => {
    const config = loadConfig(new URLSearchParams("blobs=30&seed=123&log=debug"));
    expect(config.initialBlobCount).toBe(30);
    expect(config.seed).toBe(123);
    expect(config.logLevel).toBe("debug");
  });

  it("パラメータがなければ既定値を使う", () => {
    const config = loadConfig(new URLSearchParams(""));
    expect(config.initialBlobCount).toBe(DEFAULT_CONFIG.initialBlobCount);
    expect(config.logLevel).toBe(DEFAULT_CONFIG.logLevel);
  });

  it("油の個数の許容範囲が定数と整合している", () => {
    expect(BLOB_COUNT_MIN).toBeLessThan(BLOB_COUNT_MAX);
  });
});
