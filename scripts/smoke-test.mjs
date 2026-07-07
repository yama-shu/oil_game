/**
 * ヘッドレスブラウザによるスモークテスト。
 *
 * 単体テストでは検出できない「実際にブラウザで動くか」を自動確認する。
 * タッチ操作 (ドラッグ) をシミュレートし、以下を検証する:
 *   1. 初期状態で指定個数の油が表示される
 *   2. つつくと油が合体して数が減る
 *   3. リセットで初期状態に戻る
 *   4. コンソールエラーが発生しない
 *
 * 使い方:
 *   npm run dev を起動した状態で `npm run smoke`
 *   環境変数:
 *     BASE_URL    ... 対象 URL (既定: http://localhost:5173)
 *     CHROME_PATH ... Chrome/Chromium 実行ファイル (既定: macOS の Google Chrome)
 *     OUT_DIR     ... スクリーンショット出力先 (既定: ./smoke-output)
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5173";
const CHROME_PATH =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT_DIR = process.env.OUT_DIR ?? "./smoke-output";
const INITIAL_BLOBS = 12;

mkdirSync(OUT_DIR, { recursive: true });

/** HUD のテキストから「のこりの油」の数を取り出す */
function parseBlobCount(hudText) {
  const match = hudText.match(/のこりの油:\s*(\d+)/);
  if (!match) {
    throw new Error(`HUD から油の数を読み取れません: ${hudText.slice(0, 80)}`);
  }
  return Number(match[1]);
}

const errors = [];
const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: true,
});

try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, // iPhone 14 相当の画面サイズ
    hasTouch: true,
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  // シード固定で再現性のある配置にする
  await page.goto(`${BASE_URL}/?seed=42&blobs=${INITIAL_BLOBS}`);
  await page.waitForTimeout(1500);

  const initialCount = parseBlobCount(await page.textContent("#app"));
  await page.screenshot({ path: `${OUT_DIR}/1_initial.png` });
  if (initialCount !== INITIAL_BLOBS) {
    throw new Error(`初期の油の数が不正: ${initialCount} (期待: ${INITIAL_BLOBS})`);
  }

  // 丼の中心付近を横切るドラッグ (箸でつつく) を3回行う
  const cx = 195;
  const cy = 422;
  async function drag(from, to, steps = 20) {
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(
        from[0] + ((to[0] - from[0]) * i) / steps,
        from[1] + ((to[1] - from[1]) * i) / steps,
      );
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
  }
  await drag([cx - 120, cy], [cx + 120, cy]);
  await drag([cx + 100, cy - 100], [cx - 100, cy + 100]);
  await drag([cx, cy - 130], [cx, cy + 130]);
  await page.waitForTimeout(2500); // 表面張力で寄って合体するのを待つ

  const afterCount = parseBlobCount(await page.textContent("#app"));
  await page.screenshot({ path: `${OUT_DIR}/2_after_pokes.png` });
  if (afterCount >= initialCount) {
    throw new Error(
      `つついても油が合体していない: ${initialCount} -> ${afterCount}`,
    );
  }

  // リセットで初期個数に戻ること
  await page.click("text=やり直す");
  await page.waitForTimeout(500);
  const resetCount = parseBlobCount(await page.textContent("#app"));
  await page.screenshot({ path: `${OUT_DIR}/3_after_reset.png` });
  if (resetCount !== INITIAL_BLOBS) {
    throw new Error(`リセット後の油の数が不正: ${resetCount}`);
  }

  if (errors.length > 0) {
    throw new Error(`コンソールエラーが発生:\n${errors.join("\n")}`);
  }

  console.log(
    `smoke test OK: 油 ${initialCount} -> ${afterCount} -> reset ${resetCount}, コンソールエラーなし`,
  );
} finally {
  await browser.close();
}
