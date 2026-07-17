# 設計資料

## 全体構成

DOM / Canvas に依存する層と、依存しない純粋ロジック層 (`src/core/`) を分離している。
物理・合体などのゲームルールはすべて `core` に置き、単体テストの対象にしている。

```
src/
├── main.ts          エントリポイント。設定読み込みと各層の配線、ゲームループ
├── config.ts        設定の既定値と URL クエリからの読み込み (検証付き)
├── logger.ts        レベル制御付きロガー (?log=debug で詳細ログ)
├── core/            純粋ロジック層 (DOM 非依存・単体テスト対象)
│   ├── vec2.ts      2次元ベクトル演算
│   ├── rng.ts       シード指定可能な擬似乱数 (mulberry32)
│   ├── blob.ts      油の粒の定義と合体処理
│   └── world.ts     物理シミュレーションとゲーム進行
├── render/          描画層 (状態を読むだけで変更しない)
│   ├── types.ts     GameRenderer インターフェース
│   ├── renderer2d.ts  Canvas 2D 実装 (フォールバック用)
│   ├── renderer3d.ts  three.js 実装 (既定)
│   └── ramenDecor.ts  ラーメンの装飾 (スープ・雷紋・具材)。テクスチャは Canvas 生成
├── input/           タッチ/マウス → 箸の位置・速度への変換
└── ui/              HUD (DOM)。スコア表示・リセット・ベスト記録
```

## 3D 描画の座標系

物理シミュレーションは 2D のまま変えず、描画だけを 3D 化している。
物理座標 (x, y) は three.js シーンのスープ面 (y=0 平面) 上の (x, z) に対応し、
丼の中心をシーン原点に置く。

カメラは斜め上から見下ろすため、**タッチしたスクリーン座標と物理座標が
一致しない**。`GameRenderer.screenToWorld()` がこの変換を担い、3D 実装では
カメラからのレイをスープ面に交差させて求める (2D 実装では恒等変換)。

```mermaid
flowchart LR
    Touch["タッチ座標<br>(スクリーン px)"] --> Ray["カメラからレイを飛ばす<br>Raycaster.setFromCamera"]
    Ray --> Hit["スープ面 (y=0) との交点"]
    Hit --> World["物理座標<br>(丼中心オフセットを加算)"]
    World --> Physics["箸の位置・速度として<br>物理シミュレーションへ"]
```

## ゲームループの処理の流れ

毎フレーム (`requestAnimationFrame`) の処理をフローチャートで示す。

```mermaid
flowchart TD
    Start([rAF コールバック]) --> DT["経過時間 dt を計算<br>(上限 1/20 秒に制限 ※1)"]
    DT --> Sample["入力をサンプリング<br>箸の位置・速度を取得"]
    Sample --> Phase{フェーズは?}
    Phase -- playing --> Time[経過時間を加算]
    Time --> Forces["力の適用<br>・表面張力 (めり込んだ油を吸い込む)<br>・クッション (接触寸前は押し返す)<br>・漂い (流れ場に沿って流す)<br>・箸の斥力 (影響半径内を弾く)"]
    Forces --> Move["速度の減衰 (スープの粘性)<br>速度上限で頭打ち → 位置を更新"]
    Move --> Bound["丼の縁の処理<br>はみ出しを押し戻し反発"]
    Bound --> Split{"箸が速く動いていて<br>触れた油がある?"}
    Split -- はい --> DoSplit["分裂 (面積を保存して2分割)<br>破片に不応時間を設定"]
    DoSplit --> Merge
    Split -- いいえ --> Merge{"めり込んだ<br>油のペアがある?<br>(不応時間中は除く)"}
    Merge -- はい --> DoMerge["合体 (面積・運動量を保存)<br>合体イベントを記録"]
    DoMerge --> Merge
    Merge -- いいえ --> Clear{"油が残り<br>1つ?"}
    Clear -- はい --> SetClear["フェーズを cleared に変更"]
    Clear -- いいえ --> Draw
    SetClear --> Draw["描画<br>丼 → 波紋 → 油 → 箸"]
    Phase -- cleared --> Drift["物理のみ更新<br>(時間・回数は進めない)"] --> Draw
    Draw --> HUD[HUD を更新] --> Next([次フレームを予約])
```

※1: タブが非アクティブになると dt が数十秒になり得るため、上限を設けて物理の発散を防ぐ。

## つつき操作から合体までの流れ

プレイヤーの操作がどのように状態へ反映されるかをシーケンス図で示す。

```mermaid
sequenceDiagram
    actor Player as プレイヤー
    participant Input as PointerInput<br>(input/pointer.ts)
    participant Main as ゲームループ<br>(main.ts)
    participant World as WorldState<br>(core/world.ts)
    participant Renderer as Renderer<br>(render/renderer.ts)
    participant Hud as Hud<br>(ui/hud.ts)

    Player ->> Input: 画面にタッチ (pointerdown)
    Input ->> World: addPoke() つつき回数を加算
    Input ->> Renderer: addRipple() 波紋を追加
    loop 毎フレーム
        Main ->> Input: sample(dt)
        Input -->> Main: 箸の位置と速度 (平滑化済み)
        Main ->> World: stepWorld(箸, dt)
        Note over World: 箸の影響半径内の油を弾く<br>めり込んだ油同士を合体
        World -->> Main: mergesThisFrame (合体イベント)
        Main ->> Renderer: 合体位置に波紋を追加
        Main ->> Renderer: draw(状態)
        Main ->> Hud: update(状態)
    end
    Note over Hud: 油が1つになったら<br>クリア表示 + ベスト記録更新
```

図に描いていないこと: リサイズ・画面回転時の座標の写し替え (`main.ts` の
`handleResize`)、localStorage が使えない環境でのベスト記録のスキップ。

## 物理パラメータの根拠

`WorldParams` の値 (`main.ts` の `computeParams`) は以下の方針で決めている。

| パラメータ | 方針 |
| --- | --- |
| `damping` (0.25) | 1秒後に速度が 25% まで減衰。「粘性のあるスープに浮く油」の、押すとゆっくり滑って止まる感触を出す |
| `attraction` / `attractionRange` (1.0) | 表面がめり込み始めた油だけを合体しきい値まで吸い込む。離れた油には働かせず、放置で勝手に合体が進まないようにする (#3) |
| `repulsion` | 接触寸前 (すき間 8px 未満) の油を押し返すクッション。漂いや縁の押し付け程度の弱い力では油が触れ合わず、箸で押し込んだときだけ合体する (#3) |
| `pokeStrength` | ひと突きで油が丼の 1/3 ほど滑る強さ。強すぎると縁に散らばり逆に難しくなる。`repulsion` より十分強く、突けば必ずクッションを突破できる |
| `driftSpeed` | スープの漂いの最高流速。波長が丼サイズ程度の滑らかな時変流れ場に沿わせるため、近くの油は同じ向きに流れて相対距離が保たれ、放置では合体しない (#3)。中心へ収束する旧 `convection` は放置クリアの原因だったため廃止 |
| `splitSpeed` | 分裂が起こる箸の速さ。素早いフリック (画面幅を0.5秒未満で横切る程度) だけが分裂になり、ゆっくり押す「集める」操作と区別される (#4) |
| 丼半径・油サイズ | 画面の短辺に比例させ、端末サイズが違っても同じ密度・難易度になるようにする |
| 合体しきい値 (0.85) | 縁が触れただけでは合体せず少しめり込んだら合体。すれ違いで意図せず合体するのを防ぐ |

## 合体・分裂の物理

- 油の大きさは半径ではなく **面積** を正として持つ。合体・分裂時は面積の合計を
  保存し、画面上の油の総量が変わらないようにする (半径だと総量が変わって見える)。
- 合体: 位置は面積による重心、速度は運動量 (面積 × 速度) 保存で決める。
  小さい油が大きい油に「吸い込まれる」ように見えるのはこのため。
- 分裂 (#4): 箸が `splitSpeed` より速く動きながら触れた油を、箸の進行方向と
  垂直な向きに 40:60〜50:50 のランダム比で2分割する。破片が最小半径
  (`blobRadiusMin`) を下回る分裂は行わない (無限分裂の防止)。
  分裂直後の破片には不応時間 (0.5秒) を設け、その間は合体も再分裂もしない。
  これがないと、破片が離れる前に合体して元に戻ったり、箸が触れている間
  毎フレーム分裂し続けたりする。
