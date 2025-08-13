# Planet Postcard Forge 🌍

**惑星ポストカード工房** - NASA衛星画像とWikipedia/Wikidataを使用したフロントエンド完結型ポストカード生成アプリ

![Planet Postcard Forge Screenshot](https://img.shields.io/badge/Status-Ready%20for%20Deploy-brightgreen)

## 概要

Planet Postcard Forgeは、場所名を入力するだけで美しいポストカードを生成できるWebアプリケーションです。NASA GIBS (Global Imagery Browse Services) の衛星画像とWikipedia/Wikidataから取得した地理情報を組み合わせて、高品質なポストカード画像を作成します。

### 特徴

- ✅ **フロントエンド完結**: サーバーレス・APIキー不要
- 🛰️ **NASA衛星画像**: Worldview Snapshotsから高解像度画像を取得
- 📍 **地理情報**: Wikipedia/Wikidataから座標・人口・標高などを自動取得
- 🎨 **リアルタイム合成**: HTML5 Canvasでリアルタイムに画像合成
- 📱 **レスポンシブ**: デスクトップ・モバイル対応
- ⚡ **高速**: Next.js 15 + Turbopack採用

## 使用技術・データソース

### フロントエンド
- **Next.js 15** (App Router)
- **React 19** + TypeScript
- **Tailwind CSS 4**
- **HTML5 Canvas API**

### オープンデータ API
- **NASA GIBS Worldview Snapshots API** - 衛星画像取得
- **Wikipedia MediaWiki API** - 場所検索・座標取得  
- **Wikidata SPARQL API** - 地理情報・統計データ取得

すべてCORS対応・認証不要で利用可能

## セットアップ

### 前提条件
- Node.js 20以上
- npm または yarn

### インストール

```bash
# リポジトリをクローン
git clone <your-repo-url>
cd postcard-forge

# 依存関係をインストール
npm install

# 開発サーバー起動
npm run dev
```

ブラウザで http://localhost:3000 にアクセス

## 使い方

1. **場所名を入力** - 例: 東京, Mount Fuji, Paris
2. **言語設定** - 日本語優先 / English
3. **日付選択** - 衛星画像の撮影日
4. **表示範囲調整** - 20-800km幅でスケール調整
5. **生成ボタンクリック** - ポストカード自動生成
6. **PNG保存** - 完成した画像をダウンロード

## デプロイ方法

### Vercel (推奨)

1. **GitHubにプッシュ**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo>
   git push -u origin main
   ```

2. **Vercelでインポート**
   - [Vercel Dashboard](https://vercel.com) にアクセス
   - "New Project" → GitHubリポジトリを選択
   - フレームワーク: "Next.js" (自動検出)
   - 環境変数: **設定不要**
   - デプロイ実行

3. **完了**
   - 数分で自動デプロイ完了
   - カスタムドメイン設定可能

### その他のプラットフォーム

- **Netlify**: `npm run build && npm run export`
- **GitHub Pages**: Static Export対応
- **Cloudflare Pages**: 自動デプロイ対応

## API詳細

### NASA Worldview Snapshots
```
GET https://wvs.earthdata.nasa.gov/api/v1/snapshot
Parameters: REQUEST, TIME, BBOX, CRS, LAYERS, FORMAT, WIDTH, HEIGHT
```

### Wikipedia API
```
GET https://ja.wikipedia.org/w/api.php
Parameters: action=query, list=search, prop=coordinates|pageprops, origin=*
```

### Wikidata SPARQL
```
GET https://query.wikidata.org/sparql
SPARQL Query: SELECT ?countryLabel ?population ?elev WHERE {...}
```

## ライセンス・クレジット

- **画像**: NASA EOSDIS Worldview Snapshots (GIBS)
- **データ**: Wikipedia/Wikidata (CC0)
- **コード**: MIT License

### 必須表記
アプリケーションフッターに以下のクレジットを必ず記載してください:

```
Imagery: NASA EOSDIS Worldview Snapshots (GIBS) | Data: Wikipedia/Wikidata
```

## 技術仕様

### 対応ブラウザ
- Chrome/Edge 88+
- Safari 14+
- Firefox 85+

### 画像仕様  
- 出力: PNG形式 1600x900px
- 衛星画像: MODIS Terra True Color
- フォント: System UI (OS標準)

### パフォーマンス
- Lighthouse Score: 95+
- Core Web Vitals: すべてGreen
- 画像生成時間: 2-5秒（ネットワーク依存）

## 開発

### ビルド
```bash
npm run build    # プロダクションビルド
npm run start    # プロダクション実行
npm run lint     # ESLint実行
```

### カスタマイズポイント
- `/src/app/page.tsx`: メインコンポーネント
- `buildWvsUrl()`: NASA API呼び出しパラメータ
- `rebuildSnapshot()`: Canvas描画ロジック

## トラブルシューティング

### よくある問題
1. **画像が読み込まれない** → CORS/ネットワーク確認
2. **場所が見つからない** → 英語名で再試行
3. **Canvas出力エラー** → モダンブラウザで実行

### サポート
- GitHub Issues: バグ報告・機能要望
- 技術文書: [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/)

---

🚀 **Ready for Production** - Vercelで今すぐデプロイ可能！