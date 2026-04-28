# dc-ai-cooling-demo

Data Center AI Cooling Demo 是一個可部署到 GitHub Pages 的純前端 Vite 專案，用來快速示範機房冷卻熱場分佈與熱點風險。

> ⚠️ 本專案為「簡化 AI surrogate / 熱場示意模型，非正式 CFD 驗證」，僅供展示與概念討論使用。

## Demo 功能重點

- 20m x 20m（可調）機房平面示意
- 2 排機櫃（可調排數與每排數量）
- 冷通道 / 熱通道可視化
- 溫度熱圖、熱點標記、氣流方向箭頭
- 即時統計卡片（總熱負載、預估最高/平均溫、風險等級）

## 本機開發

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## GitHub Pages 部署方式

本 repo 已包含 `.github/workflows/deploy.yml`，採用 GitHub 官方 Pages Actions 流程自動部署。

1. 到 **Settings → Pages**
2. **Source** 選擇 **GitHub Actions**
3. Push 到 `main` branch
4. GitHub Actions 會自動 build 並部署

## 技術棧

- HTML / CSS / JavaScript
- Vite
- GitHub Actions (Pages)
