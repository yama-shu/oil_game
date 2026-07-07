import { describe, expect, it } from "vitest";
import {
  BLOB_COUNT_MAX,
  BLOB_COUNT_MIN,
  DEFAULT_CONFIG,
  loadConfig,
  parseIntParam,
  parseLogLevelParam,
  parseRendererParam,
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

describe("parseRendererParam", () => {
  it("定義済みの描画方式は採用し、未知の値は既定値に落とす", () => {
    expect(parseRendererParam("2d", "3d")).toBe("2d");
    expect(parseRendererParam("3d", "2d")).toBe("3d");
    expect(parseRendererParam("webgpu", "3d")).toBe("3d");
    expect(parseRendererParam(null, "3d")).toBe("3d");
  });
});

describe("loadConfig", () => {
  it("クエリパラメータから設定を構築する", () => {
    const config = loadConfig(
      new URLSearchParams("blobs=30&seed=123&log=debug&renderer=2d"),
    );
    expect(config.initialBlobCount).toBe(30);
    expect(config.seed).toBe(123);
    expect(config.logLevel).toBe("debug");
    expect(config.renderer).toBe("2d");
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
