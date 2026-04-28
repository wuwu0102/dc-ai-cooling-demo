# dc-ai-cooling-demo

Data Center AI Cooling Demo 是一個可部署到 GitHub Pages 的純前端靜態頁面專案，用來快速示範機房冷卻熱場分佈與熱點風險。

> ⚠️ 本專案為「簡化 AI surrogate / 熱場示意模型，非正式 CFD 驗證」，僅供展示與概念討論使用。

## Demo 功能重點

- 20m x 20m（可調）機房平面示意
- 機櫃排數、每排數量、每櫃功率、供風溫度可調
- 冷卻效率係數與風量係數示意參數（非實際設備效能保證）
- 出風方向模式切換（地板下送風、牆側送風、走道端送風、前送後回）
- 機櫃高度（42U / 45U / 48U / 52U）對熱場與風險的簡化影響
- 固定色階（15°C ~ 35°C）熱圖、熱點區域統計、氣流箭頭、工程判讀

## 模型說明（重要）

- 本工具使用簡化 surrogate 邏輯描述熱源、擴散與冷卻，不代表正式 CFD 物理求解。
- 冷卻效率與風量係數僅作示意參數，用於觀察相對趨勢。
- 出風方向與機櫃高度是簡化工程影響：用來幫助理解空調配置可能改變熱場分布。
- 若要做正式設計驗證，仍需 CFD 模擬或現場量測數據佐證。

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
