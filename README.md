# Data Center Cooling 3D Prototype

Vite + Three.js 工程版機房冷卻可視化 Prototype，可用於主管簡報、面試展示與工程提案。

## 技術棧
- Vite 5
- Three.js (npm)
- OrbitControls
- GitHub Actions + GitHub Pages

## 功能
- 2D 熱圖：保留冷熱分佈視覺化
- 3D Viewer：真實 WebGL 場景（非 CSS 假 3D）
- 參數面板：機房尺寸、機櫃數、功率、供風溫度、冷卻效率、風量
- 統計卡片與工程判讀
- 手機/桌機響應式
- 3D 操作：旋轉、縮放、平移（OrbitControls）

## 開發
```bash
npm install
npm run dev
```

## 打包
```bash
npm run build
npm run preview
```

## GitHub Pages
已配置 `.github/workflows/deploy.yml` 於 `main` 分支 push 後執行：
1. `npm ci`
2. `npm run build`
3. 部署 `dist/` 到 GitHub Pages

> `vite.config.js` 已設定 `base: '/dc-ai-cooling-demo/'` 以符合 repo 名稱。
