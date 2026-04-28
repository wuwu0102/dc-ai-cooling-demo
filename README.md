# dc-ai-cooling-demo

Data Center AI Cooling Demo 是一個可部署到 GitHub Pages 的純前端靜態頁面專案，用來快速示範機房冷卻熱場分佈與熱點風險。

> ⚠️ 本專案為「簡化 AI surrogate / 熱場示意模型，非正式 CFD 驗證」，僅供展示與概念討論使用。

## Demo 功能重點

- 20m x 20m（可調）機房平面示意
- 2 排機櫃（可調排數與每排數量）
- 冷通道 / 熱通道可視化
- 溫度熱圖、熱點標記、氣流方向箭頭
- 即時統計卡片（總熱負載、預估最高/平均溫、風險等級）

## 本機開啟方式（無需 build）

本專案為純前端靜態頁面，無需 build。

你可以直接用任一靜態伺服器開啟，或直接以瀏覽器開啟 `index.html`。

例如：

```bash
python -m http.server 8080
```

然後開啟：

- http://localhost:8080/

## GitHub Pages 部署方式（無需 npm）

本 repo 已包含 `.github/workflows/deploy.yml`，採用 GitHub 官方 Pages Actions 直接部署 repo 根目錄靜態檔案（不執行 npm install / npm ci / npm run build）。

1. 到 **Settings → Pages**
2. **Source** 選擇 **GitHub Actions**
3. Push 到 `main` branch
4. GitHub Actions 會自動部署

正式網址：

- https://wuwu0102.github.io/dc-ai-cooling-demo/

## 技術棧

- HTML / CSS / JavaScript
- GitHub Actions (Pages)
