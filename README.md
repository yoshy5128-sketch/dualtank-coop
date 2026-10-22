# DUAL TANK v0.3.2.4 — GitHub登録用

2人で1台の戦車を操作する協力型オンライン戦車ゲームです。今回のZIPは、確認済みのv0.3.2.4（敵少数テスト版・ダメージ表示拡大版）をGitHubに配置しやすい構成にしたものです。ゲーム本体は変更していません。

## GitHubにアップロードする手順

1. GitHubにログインして **New repository** を開きます。
2. Repository nameは `dual-tank-coop` などに設定し、**Create repository** を押します（READMEの自動作成は不要）。
3. リポジトリの **uploading an existing file** または **Add file → Upload files** を押します。
4. このZIPを解凍したフォルダを開き、フォルダ内の **`server.js` / `package.json` / `render.yaml` / `README.md` / `.gitignore` / `public` フォルダ** を選んでアップロードします。**ZIPそのものはアップロードしないでください。**
5. **Commit changes** を押します。

**public/index.html と public/game.js が `public` フォルダ内にあることが重要**です。

## ローカル起動（Windows 11）

Node.js（18以上）をインストールし、`package.json` があるフォルダでPowerShellを開きます。

```powershell
npm install
npm start
```

PCでは `http://localhost:3000` を開きます。同じWi-Fiのスマホでは `http://PCのIPv4アドレス:3000` を開いてください（PCのIPは `ipconfig` で確認）。

## Renderでオンライン公開する場合

GitHubリポジトリをRenderの **New → Web Service** に接続してください。
- Build Command: `npm install`
- Start Command: `npm start`

`render.yaml` はRender向けのサンプル設定です。Render側の利用可能プランや料金は作成時にご確認ください。

**注意:** GitHubはソースコードを保管する場所です。GitHub Pagesだけでは、WebSocketが必要なこのゲームを実行できません。ネット対戦を公開する場合はRenderなどのNode.jsサーバーが別途必要です。

## 維持している内容

- 横画面、戦車サイズ、広いフィールド、既存UI
- PC・スマホでの2人協力操作
- 障害物回避、戦車同士の押し合い
- AP/HE弾種と装甲・距離別ダメージ
- HPバー上の大きなダメージ表示
- テスト用の少数敵（第1ウェーブ2台、以降最大4台）

## 開発用チェック

`npm run check` でJavaScript構文を検査できます。実機通信の確認は別途必要です。
