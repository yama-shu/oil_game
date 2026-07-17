import * as THREE from "three";

/**
 * ラーメンらしい見た目のための装飾 (#5)。
 * スープ・丼の雷紋・具材 (チャーシュー / なると / ネギ / 海苔) を生成する。
 * すべて見た目だけの飾りで、物理 (src/core) には一切干渉しない。
 * テクスチャは外部画像を使わず Canvas で描いて自己完結させる。
 */

/** テクスチャ用の Canvas 2D コンテキストを用意する */
function createCanvasContext(
  size: number,
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("テクスチャ用の 2D context を取得できませんでした");
  }
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * スープのテクスチャ。
 * 醤油スープの琥珀色のグラデーションに、縮れ麺の束が沈んでいる様子を描く。
 */
export function createSoupTexture(): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = createCanvasContext(size);

  // 醤油スープ: 中心がやや明るい琥珀色
  const grad = ctx.createRadialGradient(
    size * 0.42,
    size * 0.4,
    size * 0.05,
    size * 0.5,
    size * 0.5,
    size * 0.55,
  );
  grad.addColorStop(0, "#c47a16");
  grad.addColorStop(0.7, "#a35c0c");
  grad.addColorStop(1, "#8f4e0a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // 縮れ麺の束: 波打つ平行線を数本まとめて1束とし、向きを変えて数束描く
  const noodle = (
    cx: number,
    cy: number,
    angle: number,
    length: number,
    lines: number,
  ) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = "rgba(240, 214, 130, 0.5)";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    for (let i = 0; i < lines; i++) {
      const y = (i - (lines - 1) / 2) * 14;
      ctx.beginPath();
      for (let x = -length / 2; x <= length / 2; x += 8) {
        const wave = Math.sin(x * 0.09 + i * 1.3) * 6;
        if (x === -length / 2) {
          ctx.moveTo(x, y + wave);
        } else {
          ctx.lineTo(x, y + wave);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  };
  noodle(size * 0.38, size * 0.42, 0.4, size * 0.5, 5);
  noodle(size * 0.62, size * 0.6, -0.7, size * 0.45, 4);
  noodle(size * 0.5, size * 0.76, 0.15, size * 0.4, 4);
  noodle(size * 0.66, size * 0.3, 1.1, size * 0.35, 3);

  return toTexture(canvas);
}

/**
 * 雷紋 (ラーメン丼の縁の四角い渦巻き模様) のテクスチャ。
 * 白い帯の上に、円周に沿って赤茶の渦巻きモチーフを等間隔に描く。
 * 平面の Ring メッシュに貼るため、円環状に直接描画する。
 */
export function createRimPatternTexture(): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = createCanvasContext(size);
  const center = size / 2;
  const bandMid = size * 0.42;

  // 白い帯 (透明背景に円環だけ塗る)
  ctx.strokeStyle = "#f3ede0";
  ctx.lineWidth = size * 0.11;
  ctx.beginPath();
  ctx.arc(center, center, bandMid, 0, Math.PI * 2);
  ctx.stroke();

  // 渦巻きモチーフ: 正方形の渦を線分で描く
  const motifCount = 20;
  const motifSize = size * 0.048;
  ctx.strokeStyle = "#8c2f23";
  ctx.lineWidth = size * 0.011;
  ctx.lineCap = "square";
  for (let i = 0; i < motifCount; i++) {
    const angle = (i / motifCount) * Math.PI * 2;
    ctx.save();
    ctx.translate(
      center + Math.cos(angle) * bandMid,
      center + Math.sin(angle) * bandMid,
    );
    ctx.rotate(angle + Math.PI / 2);
    // 内向きに巻き込む正方形の渦 (雷紋の1ユニット)
    const s = motifSize;
    ctx.beginPath();
    ctx.moveTo(-s, s);
    ctx.lineTo(s, s);
    ctx.lineTo(s, -s);
    ctx.lineTo(-s * 0.6, -s);
    ctx.lineTo(-s * 0.6, s * 0.5);
    ctx.lineTo(s * 0.5, s * 0.5);
    ctx.lineTo(s * 0.5, -s * 0.45);
    ctx.lineTo(-s * 0.05, -s * 0.45);
    ctx.stroke();
    ctx.restore();
  }

  return toTexture(canvas);
}

/** チャーシューの断面テクスチャ (上面用) */
function createChashuTexture(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = createCanvasContext(size);
  const center = size / 2;

  // 肉の断面
  const grad = ctx.createRadialGradient(center, center, 10, center, center, center);
  grad.addColorStop(0, "#d9a878");
  grad.addColorStop(0.8, "#c0895f");
  grad.addColorStop(1, "#a06a42");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(center, center, center - 4, 0, Math.PI * 2);
  ctx.fill();

  // 煮汁が染みた縁
  ctx.strokeStyle = "#6e4526";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(center, center, center - 10, 0, Math.PI * 2);
  ctx.stroke();

  // 脂の渦 (マーブル模様)
  ctx.strokeStyle = "rgba(245, 233, 214, 0.75)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 4.5; a += 0.15) {
    const r = 14 + a * 15;
    const x = center + Math.cos(a) * r;
    const y = center + Math.sin(a) * r * 0.92;
    if (a === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  return toTexture(canvas);
}

/** なるとの渦巻きテクスチャ (上面用) */
function createNarutoTexture(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = createCanvasContext(size);
  const center = size / 2;

  ctx.fillStyle = "#f6f1e7";
  ctx.beginPath();
  ctx.arc(center, center, center - 4, 0, Math.PI * 2);
  ctx.fill();

  // ピンクの渦巻き
  ctx.strokeStyle = "#e88a9a";
  ctx.lineWidth = 16;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 5; a += 0.1) {
    const r = 8 + a * 7.2;
    const x = center + Math.cos(a) * r;
    const y = center + Math.sin(a) * r;
    if (a === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  return toTexture(canvas);
}

/** 上面にテクスチャ、側面を単色にした円柱 (チャーシュー・なると用) */
function texturedDisc(
  radius: number,
  height: number,
  topTexture: THREE.CanvasTexture,
  sideColor: number,
): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 40);
  const top = new THREE.MeshStandardMaterial({
    map: topTexture,
    roughness: 0.7,
  });
  const side = new THREE.MeshStandardMaterial({
    color: sideColor,
    roughness: 0.7,
  });
  // CylinderGeometry のマテリアル順: [側面, 上面, 底面]
  return new THREE.Mesh(geometry, [side, top, side]);
}

/**
 * 具材一式を丼半径 R に合わせて配置したグループを返す。
 * 油の邪魔になりにくいよう、丼の縁寄りに寄せて置く。
 */
export function buildToppings(R: number): THREE.Group {
  const group = new THREE.Group();

  // チャーシュー: 縁寄りに1枚
  const chashu = texturedDisc(R * 0.24, R * 0.035, createChashuTexture(), 0xb5895f);
  chashu.position.set(-R * 0.58, R * 0.02, -R * 0.5);
  group.add(chashu);

  // なると: チャーシューの反対側に1枚
  const naruto = texturedDisc(R * 0.11, R * 0.03, createNarutoTexture(), 0xf6f1e7);
  naruto.position.set(R * 0.6, R * 0.018, -R * 0.42);
  group.add(naruto);

  // ネギ: 小さな輪切りを散らす (位置は固定シードで自然に見える配置)
  const negiMaterial = new THREE.MeshStandardMaterial({
    color: 0x7fae3c,
    roughness: 0.6,
  });
  const negiGeometry = new THREE.CylinderGeometry(R * 0.025, R * 0.025, R * 0.012, 12);
  const negiSpots: Array<[number, number]> = [
    [-0.3, -0.68],
    [-0.42, -0.58],
    [0.34, -0.62],
    [0.48, -0.55],
    [0.66, -0.28],
    [-0.66, -0.32],
    [-0.55, -0.38],
  ];
  for (const [nx, nz] of negiSpots) {
    const negi = new THREE.Mesh(negiGeometry, negiMaterial);
    negi.position.set(R * nx, R * 0.012, R * nz);
    negi.rotation.y = nx * 7; // 向きをばらす
    group.add(negi);
  }

  // 海苔: 内壁に立てかける薄い板
  const nori = new THREE.Mesh(
    new THREE.BoxGeometry(R * 0.34, R * 0.4, R * 0.012),
    new THREE.MeshStandardMaterial({ color: 0x14210f, roughness: 0.45 }),
  );
  nori.position.set(0, R * 0.14, -R * 0.86);
  nori.rotation.x = -0.32; // 縁にもたれる角度
  group.add(nori);

  return group;
}
