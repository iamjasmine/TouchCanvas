# TouchCanvas

音楽制作とサーマルフィードバックを組み合わせたインタラクティブなWebアプリケーションです。

## 主な機能

- **オーディオチャンネル**: 複数のオーディオチャンネルでの音楽制作
- **サーマルチャンネル**: Bluetooth接続による温度フィードバック制御
- **タイムライン**: 直感的なブロック配置とドラッグ&ドロップ操作
- **リアルタイム再生**: ADSR制御と波形選択による高品質オーディオ
- **レスポンシブデザイン**: デスクトップ・モバイル対応

## 技術スタック

- **Next.js 15** - Reactフレームワーク
- **Tone.js** - Web Audio APIベースのオーディオエンジン
- **TypeScript** - 型安全な開発
- **Tailwind CSS** - スタイリング
- **Radix UI** - アクセシブルなUIコンポーネント

## 開発環境

```bash
# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev

# ブラウザで http://localhost:9002 にアクセス
```

## AI機能（オプション）

```bash
# AI機能の開発
npm run genkit:dev

# AI機能のウォッチモード
npm run genkit:watch
```

## ビルド

```bash
# プロダクションビルド
npm run build

# プロダクションサーバー起動
npm start
```

## プロジェクト構造

```
src/
├── app/              # Next.js App Router
├── components/       # Reactコンポーネント
│   ├── channel/      # チャンネル表示
│   ├── controls/     # 再生コントロール
│   ├── property-panel/ # プロパティ編集
│   ├── timeline/     # タイムライン関連
│   └── ui/           # 基本UIコンポーネント
├── hooks/            # カスタムフック
├── lib/              # ユーティリティ
└── types/            # TypeScript型定義
```
