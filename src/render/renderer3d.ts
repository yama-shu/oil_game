import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { radiusOf } from "../core/blob";
import type { Chopstick, WorldParams, WorldState } from "../core/world";
import type { Vec2 } from "../core/vec2";
import { createRimPatternTexture, createSoupTexture } from "./ramenDecor";
import type { GameRenderer } from "./types";

const RIPPLE_LIFETIME_SEC = 0.8;

/** カメラの俯角。0 で真上から、大きいほど斜めから覗き込む */
const CAMERA_TILT_RAD = (30 * Math.PI) / 180;
const CAMERA_FOV_DEG = 40;

/** 丼がビューポートに収まるようにする余白係数 (縁 1.16R + マージン) */
const CAMERA_FIT_MARGIN = 1.32;

/** 油の球の縦方向の潰し率。1 で真球、小さいほど平たく浮いて見える */
const OIL_SQUASH = 0.42;

interface Ripple3D {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  bornAt: number;
  maxRadius: number;
}

/**
 * three.js による 3D 描画。
 * 物理は 2D のままなので、物理座標 (x, y) をスープ面 (y=0 の平面) 上の
 * (x, z) に対応させ、丼の中心をシーン原点に置く。
 *
 * カメラが斜めから見下ろすため、タッチ位置はレイキャストで
 * スープ面に投影して物理座標へ変換する (screenToWorld)。
 */
export class ThreeRenderer implements GameRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly raycaster = new THREE.Raycaster();
  /** スープ面。物理座標の写像先であり、タッチのレイキャスト対象 */
  private readonly soupPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private cssWidth = 1;
  private cssHeight = 1;
  private bowlCenter: Vec2 = { x: 0, y: 0 };
  /** 静的シーン (丼・スープ・机) を構築した時の丼半径。変わったら作り直す */
  private builtBowlRadius = 0;
  private staticGroup: THREE.Group | null = null;

  private readonly oilGeometry = new THREE.SphereGeometry(1, 32, 24);
  // トーンマッピングで彩度が落ちるため、色はやや濃いめに設定している
  private readonly oilMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xff9d00,
    roughness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 0.95,
    envMapIntensity: 1.4,
  });
  private blobMeshes: THREE.Mesh[] = [];

  private readonly chopstickGroup: THREE.Group;
  private readonly rippleGeometry: THREE.RingGeometry;
  private ripples: Ripple3D[] = [];

  constructor(canvas: HTMLCanvasElement) {
    // WebGL が使えない環境ではここで例外になる。呼び出し側で 2D にフォールバックする
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2b1a10);

    // 環境マップ: 油やスープの「照り」を出すための室内風ライティング
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, 1, 10000);

    this.chopstickGroup = buildChopsticks();
    this.chopstickGroup.visible = false;
    this.scene.add(this.chopstickGroup);

    this.rippleGeometry = new THREE.RingGeometry(0.92, 1.0, 48);
    this.rippleGeometry.rotateX(-Math.PI / 2);
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    // モバイルの高 DPR でフィルレートが尽きないよう 2 で頭打ちにする
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(cssWidth, cssHeight, false);
    this.camera.aspect = cssWidth / cssHeight;
    if (this.builtBowlRadius > 0) {
      this.updateCamera(this.builtBowlRadius);
    }
  }

  addRipple(pos: Vec2, nowSec: number, maxRadius: number): void {
    const material = new THREE.MeshBasicMaterial({
      color: 0xfff4c8,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.rippleGeometry, material);
    mesh.position.set(pos.x - this.bowlCenter.x, 0.5, pos.y - this.bowlCenter.y);
    this.scene.add(mesh);
    this.ripples.push({ mesh, bornAt: nowSec, maxRadius });
  }

  screenToWorld(pos: Vec2): Vec2 {
    const ndc = new THREE.Vector2(
      (pos.x / this.cssWidth) * 2 - 1,
      -((pos.y / this.cssHeight) * 2 - 1),
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.soupPlane, hit) === null) {
      // レイがスープ面と平行 (実質起こらない)。安全のため丼中心を返す
      return { ...this.bowlCenter };
    }
    return { x: hit.x + this.bowlCenter.x, y: hit.z + this.bowlCenter.y };
  }

  draw(
    state: WorldState,
    params: WorldParams,
    chopstick: Chopstick | null,
    _cssWidth: number,
    _cssHeight: number,
    nowSec: number,
  ): void {
    this.bowlCenter = params.bowlCenter;
    this.ensureStaticScene(params.bowlRadius);
    this.syncBlobs(state, nowSec);
    this.updateChopsticks(chopstick);
    this.updateRipples(nowSec);
    this.renderer.render(this.scene, this.camera);
  }

  /** 丼半径が変わった時 (初回・リサイズ) に丼・スープ・机を作り直す */
  private ensureStaticScene(bowlRadius: number): void {
    if (Math.abs(bowlRadius - this.builtBowlRadius) < 0.5) {
      return;
    }
    if (this.staticGroup) {
      this.scene.remove(this.staticGroup);
      disposeGroup(this.staticGroup);
    }
    this.staticGroup = buildStaticScene(bowlRadius);
    this.scene.add(this.staticGroup);
    this.builtBowlRadius = bowlRadius;
    this.updateCamera(bowlRadius);
  }

  /** 丼全体が縦横どちらでも収まる距離にカメラを置き、斜め上から見下ろす */
  private updateCamera(bowlRadius: number): void {
    const vHalf = THREE.MathUtils.degToRad(CAMERA_FOV_DEG) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const fitHalf = Math.min(vHalf, hHalf);
    const dist = (bowlRadius * CAMERA_FIT_MARGIN) / Math.tan(fitHalf);
    this.camera.position.set(
      0,
      dist * Math.cos(CAMERA_TILT_RAD),
      dist * Math.sin(CAMERA_TILT_RAD),
    );
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  /** 油メッシュのプールを WorldState と同数に保ち、位置・大きさを反映する */
  private syncBlobs(state: WorldState, nowSec: number): void {
    while (this.blobMeshes.length < state.blobs.length) {
      const mesh = new THREE.Mesh(this.oilGeometry, this.oilMaterial);
      this.scene.add(mesh);
      this.blobMeshes.push(mesh);
    }
    while (this.blobMeshes.length > state.blobs.length) {
      const mesh = this.blobMeshes.pop();
      if (mesh) this.scene.remove(mesh);
    }
    for (let i = 0; i < state.blobs.length; i++) {
      const blob = state.blobs[i]!;
      const mesh = this.blobMeshes[i]!;
      const r = radiusOf(blob);
      // ぷるぷるしたゆらぎ: xz を逆位相で脈動させ体積感を保つ
      const wobble = Math.sin(nowSec * 2.1 + blob.wobblePhase) * 0.04;
      mesh.scale.set(r * (1 + wobble), r * OIL_SQUASH, r * (1 - wobble));
      mesh.position.set(
        blob.pos.x - this.bowlCenter.x,
        r * OIL_SQUASH * 0.55, // 下側がわずかにスープへ沈む高さ
        blob.pos.y - this.bowlCenter.y,
      );
    }
  }

  private updateChopsticks(chopstick: Chopstick | null): void {
    this.chopstickGroup.visible = chopstick !== null;
    if (chopstick) {
      this.chopstickGroup.position.set(
        chopstick.pos.x - this.bowlCenter.x,
        0,
        chopstick.pos.y - this.bowlCenter.y,
      );
    }
  }

  private updateRipples(nowSec: number): void {
    this.ripples = this.ripples.filter((ripple) => {
      const t = Math.max(0, (nowSec - ripple.bornAt) / RIPPLE_LIFETIME_SEC);
      if (t >= 1) {
        this.scene.remove(ripple.mesh);
        ripple.mesh.material.dispose();
        return false;
      }
      const scale = Math.max(ripple.maxRadius * t, 0.001);
      ripple.mesh.scale.set(scale, 1, scale);
      ripple.mesh.material.opacity = 0.5 * (1 - t);
      return true;
    });
  }
}

/** 丼 (ラーメン鉢)・スープ・机 と光源をまとめて構築する */
function buildStaticScene(R: number): THREE.Group {
  const group = new THREE.Group();

  // 机: 丼の下に広がる暗い木目色の面
  const table = new THREE.Mesh(
    new THREE.CircleGeometry(R * 6, 32).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: 0.95 }),
  );
  table.position.y = -R * 0.52;
  group.add(table);

  // 丼: 回転体 (LatheGeometry)。高台から縁まで一筆の断面で作る
  const profile = [
    new THREE.Vector2(0.0, -0.52),
    new THREE.Vector2(0.4, -0.52), // 高台
    new THREE.Vector2(0.5, -0.46),
    new THREE.Vector2(0.92, -0.18),
    new THREE.Vector2(1.1, 0.05),
    new THREE.Vector2(1.16, 0.14), // 縁の外側トップ
    new THREE.Vector2(1.08, 0.16), // 縁の内側トップ
    new THREE.Vector2(1.01, 0.05), // 内壁 → スープ面へ
  ].map((p) => p.multiplyScalar(R));
  const bowl = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 64),
    new THREE.MeshStandardMaterial({
      color: 0x8c2f23,
      roughness: 0.35,
      side: THREE.DoubleSide,
    }),
  );
  group.add(bowl);

  // スープ: 麺のテクスチャを貼った円盤。クリアコートで表面の照りを出す
  const soup = new THREE.Mesh(
    new THREE.CircleGeometry(R * 1.02, 64).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({
      map: createSoupTexture(),
      roughness: 0.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
    }),
  );
  group.add(soup);

  // 雷紋: 丼の縁の上面に貼る円環 (#5)
  const rimPattern = new THREE.Mesh(
    new THREE.RingGeometry(R * 1.03, R * 1.17, 96).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      map: createRimPatternTexture(),
      transparent: true,
      roughness: 0.4,
    }),
  );
  rimPattern.position.y = R * 0.165;
  group.add(rimPattern);

  // 具材 (チャーシュー・なると・ネギ・海苔) は一旦見送り。
  // 見た目の検討中のため、生成関数 buildToppings は ramenDecor.ts に残してある (#5)

  // 光源: 食べ物がおいしく見える暖色寄りの環境光 + キーライト (#5)
  group.add(new THREE.HemisphereLight(0xffe8c8, 0x40210f, 1.0));
  const key = new THREE.DirectionalLight(0xfff1dc, 1.5);
  key.position.set(R * 0.6, R * 1.8, R * 0.8);
  group.add(key);

  return group;
}

/** 箸: 先端がタッチ位置に来るよう、原点から斜め上に伸びる2本の棒 */
function buildChopsticks(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0x7a4a21,
    roughness: 0.6,
  });
  const length = 260;
  for (const offset of [-5, 5]) {
    const geometry = new THREE.CylinderGeometry(3.6, 2.0, length, 12);
    geometry.translate(0, length / 2, 0); // 原点 = 箸先にする
    const stick = new THREE.Mesh(geometry, material);
    stick.position.x = offset;
    group.add(stick);
  }
  // 右上に構える傾き
  const dir = new THREE.Vector3(0.45, 1.5, -0.55).normalize();
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return group;
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const materials = Array.isArray(obj.material)
        ? obj.material
        : [obj.material];
      for (const m of materials) {
        m.dispose();
      }
    }
  });
}
