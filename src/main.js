const app = document.querySelector('#app');

app.innerHTML = `
  <div class="page container">
    <header class="header">
      <div class="text-block">
        <h1>Data Center AI Cooling Demo</h1>
        <p>機房冷卻熱場快速示意工具</p>
      </div>
      <span class="demo-tag text-block">DEMO</span>
    </header>

    <main class="layout main-layout">
      <section class="panel sidebar text-block" aria-label="參數面板">
        <h2>參數設定</h2>
        <p class="model-note">簡化 AI surrogate / 熱場示意模型，非正式 CFD 驗證。</p>
        <div id="controls" class="controls"></div>
      </section>

      <section class="viz-section content" aria-label="熱場視覺化">
        <div class="view-toggle" role="tablist" aria-label="圖層切換">
          <button type="button" class="view-btn is-active" data-view="2d">2D 平面熱圖</button>
          <button type="button" class="view-btn" data-view="3d">3D 示意圖</button>
        </div>
        <div class="canvas-wrap container-heatmap">
          <canvas id="heatCanvas" class="viz-pane" width="900" height="900"></canvas>
          <div id="isoStage" class="iso-stage viz-pane is-hidden" aria-label="3D isometric airflow">
            <p class="scene-hint">拖曳可旋轉視角</p>
            <div id="scene3dViewport" class="scene-3d-viewport">
              <div id="scene3dInner" class="scene-3d-inner">
                <svg id="isoView" viewBox="0 0 900 620" preserveAspectRatio="xMidYMid meet"></svg>
              </div>
            </div>
            <button id="resetViewBtn" class="reset-view-btn" type="button">重設視角</button>
          </div>
        </div>
        <div id="stats" class="stats-grid cards"></div>
        <section class="interpretation analysis text-block" id="interpretation"></section>
        <section class="legend text-block" aria-label="圖例與高度示意">
          <div class="legend-block text-block">
            <h3>圖例 / Legend</h3>
            <ul>
              <li><span class="chip chip-blue"></span>藍色：冷區</li>
              <li><span class="chip chip-green"></span>綠色：正常</li>
              <li><span class="chip chip-yellow"></span>黃色：偏熱</li>
              <li><span class="chip chip-red"></span>紅色：高溫區</li>
              <li><span class="legend-tile"></span>地板送風口：淺藍小格 / ↑</li>
              <li><span class="legend-arrow">→</span>水平白箭頭：平面水平氣流</li>
              <li><span class="legend-short-arrow">↦</span>短箭頭：機櫃前送後回</li>
              <li><span class="legend-hvac"></span>灰色設備：AHU / CRAH / CRAC</li>
              <li><span class="legend-return"></span>灰色區：回風區</li>
              <li><span class="legend-rack"></span>黑色長方形：機櫃</li>
            </ul>
          </div>
          <div id="heightCard" class="height-card text-block"></div>
        </section>
      </section>
    </main>
  </div>
`;

const airflowModes = {
  underfloor: '地板下送風 / 上回風',
  sidewall: '牆側送風 / 對側回風',
  endtoend: '走道端送風 / 另一端回風',
  frontback: '前送後回'
};

const HELP_TEXT = {
  coolingEfficiency:
    '冷卻效率係數代表冷卻系統抑制溫升的能力。數值越高，代表冷源、換熱、送風組織越有效，模型中的預估溫度會下降。這是簡化示意參數，不等於真實設備 COP 或 PUE。',
  airflowFactor:
    '風量係數代表送風量相對基準值的比例。1.0 表示基準風量；提高到 1.5 代表假設送風能力增加約 50%。數值越高，熱量越容易被帶走，熱點應減少。此處為示意參數，非正式 CFM 計算。'
};

const schema = [
  { key: 'roomWidth', label: '機房寬度 (m)', type: 'number', min: 10, max: 80, step: 1 },
  { key: 'roomDepth', label: '機房深度 (m)', type: 'number', min: 10, max: 80, step: 1 },
  { key: 'rackRows', label: '機櫃排數', type: 'number', min: 1, max: 8, step: 1 },
  { key: 'racksPerRow', label: '每排機櫃數', type: 'number', min: 2, max: 40, step: 1 },
  { key: 'rackPower', label: '每櫃功率 (kW)', type: 'number', min: 3, max: 80, step: 1 },
  { key: 'supplyTemp', label: '出風溫度 (°C)', type: 'number', min: 8, max: 25, step: 0.5 },
  { key: 'coolingEfficiency', label: '冷卻效率係數', type: 'range', min: 0.3, max: 1.2, step: 0.01 },
  { key: 'airflowFactor', label: '風量係數', type: 'range', min: 0.5, max: 2.0, step: 0.01 },
  {
    key: 'airflowMode',
    label: '出風方向',
    type: 'select',
    options: Object.entries(airflowModes).map(([value, label]) => ({ value, label }))
  },
  {
    key: 'rackHeight',
    label: '機櫃高度',
    type: 'select',
    options: [42, 45, 48, 52].map((u) => ({ value: String(u), label: `${u}U` }))
  },
  { key: 'coldAisleContainment', label: '啟用冷通道封閉', type: 'checkbox' }
];

const state = {
  roomWidth: 20,
  roomDepth: 20,
  rackRows: 2,
  racksPerRow: 10,
  rackPower: 20,
  supplyTemp: 15,
  coolingEfficiency: 0.75,
  airflowFactor: 1.0,
  airflowMode: 'underfloor',
  rackHeight: 42,
  coldAisleContainment: true,
  viewMode: '2d'
};

const gridSize = 90;
const FIXED_MIN_TEMP = 15;
const FIXED_MAX_TEMP = 35;
const HOTSPOT_THRESHOLD = 30;

const canvas = document.querySelector('#heatCanvas');
const ctx = canvas.getContext('2d');
const isoView = document.querySelector('#isoView');
const isoStage = document.querySelector('#isoStage');
const scene3dViewport = document.querySelector('#scene3dViewport');
const scene3dInner = document.querySelector('#scene3dInner');
const resetViewBtn = document.querySelector('#resetViewBtn');
const controls = document.querySelector('#controls');
const statsEl = document.querySelector('#stats');
const interpretationEl = document.querySelector('#interpretation');
const heightCardEl = document.querySelector('#heightCard');
const viewButtons = Array.from(document.querySelectorAll('.view-btn'));
const camera = { rotateX: -42, rotateZ: -38 };
const CAMERA_DEFAULT = { rotateX: -42, rotateZ: -38 };
const CAMERA_LIMITS = { minX: -70, maxX: -20 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applySceneCamera() {
  scene3dInner.style.transform = `rotateX(${camera.rotateX.toFixed(2)}deg) rotateZ(${camera.rotateZ.toFixed(2)}deg)`;
}

function resetSceneCamera() {
  camera.rotateX = CAMERA_DEFAULT.rotateX;
  camera.rotateZ = CAMERA_DEFAULT.rotateZ;
  applySceneCamera();
}

function bind3DInteractions() {
  let dragging = false;
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  const horizontalSpeed = 0.22;
  const verticalSpeed = 0.2;

  const onDown = (event) => {
    dragging = true;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    scene3dViewport.setPointerCapture(pointerId);
  };

  const onMove = (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    camera.rotateZ += dx * horizontalSpeed;
    camera.rotateX = clamp(camera.rotateX + dy * verticalSpeed, CAMERA_LIMITS.minX, CAMERA_LIMITS.maxX);
    applySceneCamera();
    event.preventDefault();
  };

  const onUp = (event) => {
    if (event.pointerId !== pointerId) return;
    dragging = false;
    scene3dViewport.releasePointerCapture(pointerId);
    pointerId = null;
  };

  scene3dViewport.addEventListener('pointerdown', onDown);
  scene3dViewport.addEventListener('pointermove', onMove);
  scene3dViewport.addEventListener('pointerup', onUp);
  scene3dViewport.addEventListener('pointercancel', onUp);
  resetViewBtn.addEventListener('click', resetSceneCamera);
  resetSceneCamera();
}

function createControls() {
  controls.innerHTML = '';

  schema.forEach((item) => {
    const row = document.createElement('label');
    row.className = 'control-row';
    const helper = HELP_TEXT[item.key] ? `<button class="help-dot" type="button" title="${HELP_TEXT[item.key]}" aria-label="${item.label}說明">?</button>` : '';

    if (item.type === 'checkbox') {
      row.innerHTML = `
        <span class="control-label">${item.label}</span>
        <input type="checkbox" name="${item.key}" ${state[item.key] ? 'checked' : ''} />
      `;
    } else if (item.type === 'select') {
      row.innerHTML = `
        <span class="control-label">${item.label}</span>
        <select name="${item.key}">
          ${item.options
            .map((option) => `<option value="${option.value}" ${String(state[item.key]) === option.value ? 'selected' : ''}>${option.label}</option>`)
            .join('')}
        </select>
      `;
    } else {
      const value = Number(state[item.key]).toFixed(item.step < 1 ? 2 : 0);
      const hint = item.key === 'coolingEfficiency' || item.key === 'airflowFactor' ? `<p class="coef-hint" data-hint="${item.key}">${getCoefficientHint(item.key)}</p>` : '';
      row.innerHTML = `
        <span class="control-label">${item.label}${helper}</span>
        <div class="input-group">
          <input
            type="${item.type}"
            name="${item.key}"
            min="${item.min}"
            max="${item.max}"
            step="${item.step}"
            value="${state[item.key]}"
          />
          <output>${value}</output>
        </div>
        ${hint}
      `;
    }

    controls.appendChild(row);
  });

  controls.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;

    const field = schema.find((item) => item.key === target.name);
    if (!field) return;

    if (field.type === 'checkbox') {
      state[target.name] = target.checked;
    } else if (field.type === 'select') {
      state[target.name] = target.name === 'rackHeight' ? Number(target.value) : target.value;
    } else {
      const num = parseFloat(target.value);
      state[target.name] = clamp(Number.isFinite(num) ? num : 0, field.min, field.max);
      const output = target.parentElement?.querySelector('output');
      if (output) output.textContent = Number(state[target.name]).toFixed(field.step < 1 ? 2 : 0);
      const hintEl = target.closest('.control-row')?.querySelector('.coef-hint');
      if (hintEl) hintEl.textContent = getCoefficientHint(target.name);
    }

    update();
  });
}

function getCoefficientHint(key) {
  if (key === 'coolingEfficiency') {
    if (state.coolingEfficiency < 0.6) return '冷卻能力偏弱';
    if (state.coolingEfficiency <= 0.9) return '一般';
    return '冷卻能力較強';
  }
  if (state.airflowFactor < 0.8) return '風量偏低';
  if (state.airflowFactor <= 1.2) return '基準範圍';
  return '風量偏高';
}

function getRowCenter(row) {
  const aisleGap = state.roomWidth / (state.rackRows + 1);
  return aisleGap * (row + 1);
}

function getFrontDirX(row) {
  const leftGapX = row > 0 ? (getRowCenter(row - 1) + getRowCenter(row)) / 2 : -Infinity;
  const rightGapX = row < state.rackRows - 1 ? (getRowCenter(row + 1) + getRowCenter(row)) / 2 : Infinity;
  const leftDistance = Math.abs(getRowCenter(row) - leftGapX);
  const rightDistance = Math.abs(rightGapX - getRowCenter(row));
  return rightDistance <= leftDistance ? 1 : -1;
}

function getColdAisles() {
  const aisles = [];
  for (let row = 0; row < state.rackRows - 1; row += 1) {
    aisles.push({
      leftX: getRowCenter(row),
      rightX: getRowCenter(row + 1),
      centerX: (getRowCenter(row) + getRowCenter(row + 1)) / 2
    });
  }
  return aisles;
}

function rackLayout() {
  const rackWidth = 0.6;
  const rackDepth = 1.2;
  const racks = [];

  for (let row = 0; row < state.rackRows; row += 1) {
    const xCenter = getRowCenter(row);
    const yGap = state.roomDepth / (state.racksPerRow + 1);
    const frontDirX = getFrontDirX(row);

    for (let i = 0; i < state.racksPerRow; i += 1) {
      const yCenter = yGap * (i + 1);
      racks.push({ x: xCenter, y: yCenter, width: rackWidth, depth: rackDepth, row, frontDirX });
    }
  }

  return racks;
}

function getAirflowDevices() {
  if (state.airflowMode === 'sidewall') {
    return [
      { x: 0.4, y: state.roomDepth * 0.2, width: 0.6, depth: 2.6, label: 'CRAH' },
      { x: 0.4, y: state.roomDepth * 0.5, width: 0.6, depth: 2.6, label: 'AHU' },
      { x: 0.4, y: state.roomDepth * 0.8, width: 0.6, depth: 2.6, label: 'CRAH' }
    ];
  }

  if (state.airflowMode === 'endtoend') {
    return [
      { x: state.roomWidth * 0.2, y: 0.5, width: 2.0, depth: 0.7, label: 'CRAC' },
      { x: state.roomWidth * 0.5, y: 0.5, width: 2.0, depth: 0.7, label: 'AHU' },
      { x: state.roomWidth * 0.8, y: 0.5, width: 2.0, depth: 0.7, label: 'CRAC' }
    ];
  }

  if (state.airflowMode === 'underfloor') {
    return [
      { x: state.roomWidth * 0.2, y: state.roomDepth - 0.35, width: 2.2, depth: 0.7, label: 'CRAC' },
      { x: state.roomWidth * 0.5, y: state.roomDepth - 0.35, width: 2.2, depth: 0.7, label: 'CRAH' },
      { x: state.roomWidth * 0.8, y: state.roomDepth - 0.35, width: 2.2, depth: 0.7, label: 'AHU' }
    ];
  }

  return [];
}

function getAirflowProfile() {
  switch (state.airflowMode) {
    case 'sidewall':
      return { vectorX: 1.15, vectorY: 0, coldLift: 0.75, diffusion: 1.0, modeStrength: 1.12 };
    case 'endtoend':
      return { vectorX: 0, vectorY: 1.2, coldLift: 0.66, diffusion: 0.95, modeStrength: 1.1 };
    case 'frontback':
      return { vectorX: 0.45, vectorY: 0.0, coldLift: 0.62, diffusion: 0.9, modeStrength: 1.05 };
    case 'underfloor':
    default:
      return { vectorX: 0.2, vectorY: 0.35, coldLift: 0.94, diffusion: 1.15, modeStrength: 0.96 };
  }
}

function buildHeatField() {
  const field = Array.from({ length: gridSize }, () => Array(gridSize).fill(state.supplyTemp));
  const roomToGridX = (x) => Math.floor((x / state.roomWidth) * (gridSize - 1));
  const roomToGridY = (y) => Math.floor((y / state.roomDepth) * (gridSize - 1));
  const racks = rackLayout();
  const airflow = getAirflowProfile();

  const heightFactor = 1 + ((state.rackHeight - 42) / 10) * 0.12;
  const efficiencyCooling = 0.45 + state.coolingEfficiency * 0.95;
  const airflowCooling = 0.5 + state.airflowFactor * 0.85;
  const containmentMultiplier = state.coldAisleContainment ? 0.9 : 1.15;
  const sourceStrength =
    (state.rackPower * 0.42 * heightFactor * containmentMultiplier * airflow.modeStrength) /
    (efficiencyCooling * airflowCooling);
  const spreadRadius =
    22 * (1 + ((state.rackHeight - 42) / 10) * 0.09) * (1 + (1.4 - state.coolingEfficiency) * 0.06);

  racks.forEach((rack) => {
    const cx = roomToGridX(rack.x);
    const cy = roomToGridY(rack.y);

    for (let dy = -10; dy <= 10; dy += 1) {
      for (let dx = -10; dx <= 10; dx += 1) {
        const gx = cx + dx;
        const gy = cy + dy;
        if (gx < 0 || gx >= gridSize || gy < 0 || gy >= gridSize) continue;

        const frontbackBias = state.airflowMode === 'frontback' ? dx * rack.frontDirX * 0.8 : 0;
        const vecBias = dx * airflow.vectorX + dy * airflow.vectorY + frontbackBias;
        const distance2 = dx * dx + dy * dy;
        const spread = Math.exp(-(distance2 + Math.max(0, vecBias) * 2.8) / spreadRadius);
        field[gy][gx] += sourceStrength * spread;
      }
    }

    const exhaustBias = state.airflowMode === 'frontback' ? -rack.frontDirX : state.airflowMode === 'endtoend' ? 0 : rack.row % 2 === 0 ? 1 : -1;
    for (let dy = -5; dy <= 5; dy += 1) {
      for (let dx = 2; dx <= 9; dx += 1) {
        const gx = cx + dx * (exhaustBias === 0 ? 1 : exhaustBias);
        const gy = cy + dy + airflow.vectorY * 1.2;
        if (gx < 0 || gx >= gridSize || gy < 0 || gy >= gridSize) continue;
        const d = Math.sqrt((dx - 2) ** 2 + dy * dy);
        field[Math.round(gy)][gx] += sourceStrength * 0.35 * Math.exp(-(d * d) / 20);
      }
    }
  });

  if (state.coldAisleContainment && state.rackRows >= 2) {
    getColdAisles().forEach((aisle) => {
      const gx = roomToGridX(aisle.centerX);
      for (let y = 0; y < gridSize; y += 1) {
        for (let x = gx - 4; x <= gx + 4; x += 1) {
          if (x < 0 || x >= gridSize) continue;
          field[y][x] -= 0.7 * state.coolingEfficiency * airflow.coldLift;
        }
      }
    });
  }

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const nx = x / (gridSize - 1);
      const ny = y / (gridSize - 1);
      if (state.airflowMode === 'sidewall') field[y][x] += nx * (2.8 - state.airflowFactor * 1.2);
      else if (state.airflowMode === 'endtoend') field[y][x] += ny * (2.9 - state.airflowFactor * 1.25);
      else if (state.airflowMode === 'frontback') field[y][x] += nx * (1.8 - state.airflowFactor * 0.8);
      else field[y][x] += (0.7 - ny * 0.4) * (1.1 - state.airflowFactor * 0.3);
    }
  }

  const cycles = 9;
  const airflowExchange = 0.014 + state.airflowFactor * 0.022;
  const efficiencyExchange = 0.015 + state.coolingEfficiency * 0.018;
  const baseRemoval = (airflowExchange + efficiencyExchange) * airflow.diffusion;

  for (let n = 0; n < cycles; n += 1) {
    const next = field.map((row) => row.slice());
    for (let y = 1; y < gridSize - 1; y += 1) {
      for (let x = 1; x < gridSize - 1; x += 1) {
        const center = field[y][x] * 0.35;
        const cross = (field[y - 1][x] + field[y + 1][x] + field[y][x - 1] + field[y][x + 1]) * 0.13;
        const diagonal =
          (field[y - 1][x - 1] + field[y - 1][x + 1] + field[y + 1][x - 1] + field[y + 1][x + 1]) * 0.032;
        const mixed = center + cross + diagonal;
        const coolPull = baseRemoval * (mixed - state.supplyTemp);
        next[y][x] = mixed - coolPull;
      }
    }

    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize; x += 1) field[y][x] = Math.max(state.supplyTemp - 0.5, next[y][x]);
    }
  }

  return { field, racks };
}

function tempColor(temp) {
  const t = clamp((temp - FIXED_MIN_TEMP) / (FIXED_MAX_TEMP - FIXED_MIN_TEMP), 0, 1);
  return `hsl(${220 - 220 * t}, 86%, ${54 - 12 * t}%)`;
}

function drawArrow(sx, sy, ex, ey, width = 1.5, color = 'rgba(255,255,255,0.85)') {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  const vx = ex - sx;
  const vy = ey - sy;
  const len = Math.sqrt(vx * vx + vy * vy) || 1;
  const ux = vx / len;
  const uy = vy / len;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - ux * 8 - uy * 4, ey - uy * 8 + ux * 4);
  ctx.lineTo(ex - ux * 8 + uy * 4, ey - uy * 8 - ux * 4);
  ctx.closePath();
  ctx.fill();
}

function drawAirflowAnnotations(toCanvas, mapW, mapH, margin, racks) {
  const mode = state.airflowMode;

  if (mode === 'sidewall') {
    for (let y = 0.16; y <= 0.84; y += 0.14) drawArrow(margin + 0.08 * mapW, margin + y * mapH, margin + 0.36 * mapW, margin + y * mapH);
    ctx.fillStyle = 'rgba(210, 216, 228, 0.35)';
    ctx.fillRect(margin + mapW * 0.91, margin, mapW * 0.09, mapH);
    ctx.fillStyle = 'rgba(238,245,255,0.9)';
    ctx.font = '11px sans-serif';
    ctx.fillText('對側回風區', margin + mapW * 0.92, margin + 15);
  } else if (mode === 'endtoend') {
    for (let x = 0.16; x <= 0.84; x += 0.14) drawArrow(margin + x * mapW, margin + 0.08 * mapH, margin + x * mapW, margin + 0.34 * mapH);
    ctx.fillStyle = 'rgba(210, 216, 228, 0.35)';
    ctx.fillRect(margin, margin + mapH * 0.91, mapW, mapH * 0.09);
    ctx.fillStyle = 'rgba(238,245,255,0.9)';
    ctx.font = '11px sans-serif';
    ctx.fillText('走道端回風區', margin + 8, margin + mapH * 0.96);
  } else if (mode === 'frontback') {
    racks.forEach((rack) => {
      const p = toCanvas(rack.x, rack.y);
      drawArrow(p.x - rack.frontDirX * 16, p.y, p.x - rack.frontDirX * 4, p.y, 1.2, 'rgba(225,245,255,0.95)');
      drawArrow(p.x + rack.frontDirX * 4, p.y, p.x + rack.frontDirX * 16, p.y, 1.2, 'rgba(255,166,120,0.95)');
    });
  } else {
    getColdAisles().forEach((aisle) => {
      const centerX = toCanvas(aisle.centerX, 0).x;
      const tileBandW = Math.max((0.9 / state.roomWidth) * mapW, 10);
      for (let y = margin + 30; y < margin + mapH - 30; y += 24) {
        ctx.fillStyle = 'rgba(130, 205, 255, 0.35)';
        ctx.fillRect(centerX - tileBandW / 2, y - 8, tileBandW, 12);
        ctx.fillStyle = 'rgba(220, 247, 255, 0.95)';
        ctx.font = '11px sans-serif';
        ctx.fillText('↑', centerX - 3, y + 2);
      }
      ctx.fillStyle = 'rgba(220, 247, 255, 0.92)';
      ctx.font = '12px sans-serif';
      ctx.fillText('地板送風區', centerX - 28, margin + 16);
    });

    ctx.fillStyle = 'rgba(210, 216, 228, 0.3)';
    ctx.fillRect(margin, margin, mapW, 24);
    ctx.fillStyle = 'rgba(238,245,255,0.9)';
    ctx.font = '11px sans-serif';
    ctx.fillText('上方回風（俯視示意）', margin + 8, margin + 16);
  }

  ctx.fillStyle = 'rgba(238,245,255,0.9)';
  ctx.font = '12px sans-serif';
  ctx.fillText(`風向模式：${airflowModes[state.airflowMode]}`, margin + 8, margin + mapH + 18);
}

function getStats(field) {
  let max = -Infinity;
  let sum = 0;
  let hotspotCells = 0;
  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const temp = field[y][x];
      max = Math.max(max, temp);
      sum += temp;
      if (temp >= HOTSPOT_THRESHOLD) hotspotCells += 1;
    }
  }
  const avgTemp = sum / (gridSize * gridSize);
  const hotspotAreaRatio = hotspotCells / (gridSize * gridSize);
  const totalRacks = state.rackRows * state.racksPerRow;
  const totalLoad = totalRacks * state.rackPower;
  let risk = '低風險';
  if (max >= 30) risk = '高風險';
  else if (max >= 27) risk = '中風險';
  return { maxTemp: max, avgTemp, hotspotAreaRatio, totalRacks, totalLoad, risk };
}

function drawMap(fieldData) {
  const { field, racks } = fieldData;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const margin = 36;
  const mapW = w - margin * 2;
  const mapH = h - margin * 2;
  const cellW = mapW / gridSize;
  const cellH = mapH / gridSize;

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      ctx.fillStyle = tempColor(field[y][x]);
      ctx.fillRect(margin + x * cellW, margin + y * cellH, cellW + 0.7, cellH + 0.7);
    }
  }

  ctx.strokeStyle = 'rgba(130,160,255,0.9)';
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, margin, mapW, mapH);

  const toCanvas = (x, y) => ({ x: margin + (x / state.roomWidth) * mapW, y: margin + (y / state.roomDepth) * mapH });

  getColdAisles().forEach((aisle) => {
    const coldLeft = toCanvas(aisle.leftX + 0.5, 0).x;
    const coldRight = toCanvas(aisle.rightX - 0.5, 0).x;
    ctx.fillStyle = 'rgba(92, 203, 128, 0.2)';
    ctx.fillRect(coldLeft, margin, coldRight - coldLeft, mapH);
    if (state.coldAisleContainment && state.airflowMode === 'frontback') {
      ctx.fillStyle = 'rgba(120, 235, 160, 0.3)';
      ctx.fillRect(coldLeft, margin + 3, coldRight - coldLeft, 12);
      ctx.fillRect(coldLeft, margin + mapH - 15, coldRight - coldLeft, 12);
      ctx.fillStyle = 'rgba(218, 255, 230, 0.95)';
      ctx.font = '11px sans-serif';
      ctx.fillText('冷通道封閉', coldLeft + 5, margin + 13);
    }
  });

  getAirflowDevices().forEach((device) => {
    const p = toCanvas(device.x, device.y);
    const dw = (device.width / state.roomWidth) * mapW;
    const dh = (device.depth / state.roomDepth) * mapH;
    ctx.fillStyle = 'rgba(170, 176, 187, 0.88)';
    ctx.strokeStyle = 'rgba(242, 245, 255, 0.8)';
    ctx.fillRect(p.x - dw / 2, p.y - dh / 2, dw, dh);
    ctx.strokeRect(p.x - dw / 2, p.y - dh / 2, dw, dh);
    ctx.fillStyle = 'rgba(20, 25, 34, 0.95)';
    ctx.font = '10px sans-serif';
    ctx.fillText(device.label, p.x - dw / 2 + 4, p.y + 3);
  });

  racks.forEach((rack) => {
    const p = toCanvas(rack.x, rack.y);
    const rw = (rack.depth / state.roomWidth) * mapW;
    const rh = (rack.width / state.roomDepth) * mapH;
    ctx.fillStyle = 'rgba(20, 20, 24, 0.95)';
    ctx.strokeStyle = 'rgba(214, 224, 255, 0.6)';
    ctx.fillRect(p.x - rw / 2, p.y - rh / 2, rw, rh);
    ctx.strokeRect(p.x - rw / 2, p.y - rh / 2, rw, rh);
  });

  drawAirflowAnnotations(toCanvas, mapW, mapH, margin, racks);
}

function isoProject(x, y, z = 0) {
  const scale = 18;
  const ox = 450;
  const oy = 440;
  return {
    x: ox + (x - y) * scale,
    y: oy + (x + y) * scale * 0.52 - z * scale
  };
}

function tempAt(field, x, y) {
  const gx = clamp(Math.round((x / state.roomWidth) * (gridSize - 1)), 0, gridSize - 1);
  const gy = clamp(Math.round((y / state.roomDepth) * (gridSize - 1)), 0, gridSize - 1);
  return field[gy][gx];
}

function poly(points, cls, fill) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  p.setAttribute('points', points.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' '));
  if (cls) p.setAttribute('class', cls);
  if (fill) p.setAttribute('fill', fill);
  return p;
}

function addIsoArrow(group, from, to, color) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', from.x);
  line.setAttribute('y1', from.y);
  line.setAttribute('x2', to.x);
  line.setAttribute('y2', to.y);
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '3');
  line.setAttribute('marker-end', `url(${color.includes('66') ? '#arrowHot' : '#arrowCold'})`);
  group.appendChild(line);
}

function renderIso(fieldData) {
  const { field, racks } = fieldData;
  isoView.innerHTML = `
    <defs>
      <marker id="arrowCold" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><polygon points="0,0 8,4 0,8" fill="#68c4ff"/></marker>
      <marker id="arrowHot" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><polygon points="0,0 8,4 0,8" fill="#ff7b4f"/></marker>
    </defs>
  `;

  const floor = [isoProject(0, 0, 0), isoProject(state.roomWidth, 0, 0), isoProject(state.roomWidth, state.roomDepth, 0), isoProject(0, state.roomDepth, 0)];
  isoView.appendChild(poly(floor, '', 'rgba(36,60,95,0.55)'));

  const tempLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  for (let y = 0; y < state.roomDepth; y += 2) {
    for (let x = 0; x < state.roomWidth; x += 2) {
      const t = tempAt(field, x + 1, y + 1);
      tempLayer.appendChild(poly([isoProject(x, y, 0.01), isoProject(x + 2, y, 0.01), isoProject(x + 2, y + 2, 0.01), isoProject(x, y + 2, 0.01)], '', tempColor(t)));
    }
  }
  tempLayer.setAttribute('opacity', '0.48');
  isoView.appendChild(tempLayer);

  const rackHeightScale = 2.2 + ((state.rackHeight - 42) / 10) * 1.2;
  const rackGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  racks.forEach((rack) => {
    const x0 = rack.x - rack.width / 2;
    const x1 = rack.x + rack.width / 2;
    const y0 = rack.y - rack.depth / 2;
    const y1 = rack.y + rack.depth / 2;
    const z = rackHeightScale;
    rackGroup.appendChild(poly([isoProject(x0, y0, z), isoProject(x1, y0, z), isoProject(x1, y1, z), isoProject(x0, y1, z)], 'rack-top', '#242d3f'));
    rackGroup.appendChild(poly([isoProject(x1, y0, 0), isoProject(x1, y1, 0), isoProject(x1, y1, z), isoProject(x1, y0, z)], 'rack-side', '#1b2230'));
    rackGroup.appendChild(poly([isoProject(x0, y1, 0), isoProject(x1, y1, 0), isoProject(x1, y1, z), isoProject(x0, y1, z)], 'rack-front', '#11161f'));
  });
  isoView.appendChild(rackGroup);

  const aisleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  getColdAisles().forEach((aisle) => {
    aisleGroup.appendChild(poly([isoProject(aisle.leftX + 0.4, 0.8, 0.02), isoProject(aisle.rightX - 0.4, 0.8, 0.02), isoProject(aisle.rightX - 0.4, state.roomDepth - 0.8, 0.02), isoProject(aisle.leftX + 0.4, state.roomDepth - 0.8, 0.02)], '', 'rgba(102,214,140,0.32)'));
    if (state.airflowMode === 'underfloor') {
      for (let y = 1.4; y < state.roomDepth - 1.1; y += 2.2) {
        aisleGroup.appendChild(poly([isoProject(aisle.centerX - 0.34, y, 0.03), isoProject(aisle.centerX + 0.34, y, 0.03), isoProject(aisle.centerX + 0.34, y + 0.6, 0.03), isoProject(aisle.centerX - 0.34, y + 0.6, 0.03)], '', 'rgba(140,214,255,0.55)'));
      }
    }
  });
  isoView.appendChild(aisleGroup);

  const anno = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const addLabel = (x, y, text) => {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('fill', '#e8f2ff');
    t.setAttribute('font-size', '14');
    t.textContent = text;
    anno.appendChild(t);
  };

  if (state.airflowMode === 'underfloor') {
    getColdAisles().forEach((aisle) => {
      addIsoArrow(anno, isoProject(aisle.centerX, state.roomDepth * 0.25, 0.05), isoProject(aisle.centerX, state.roomDepth * 0.25, 2.3), '#68c4ff');
      addIsoArrow(anno, isoProject(aisle.centerX + 0.5, state.roomDepth * 0.55, 1.2), isoProject(aisle.centerX + 0.5, state.roomDepth * 0.55, 3.5), '#ff7b4f66');
    });
    const p = isoProject(state.roomWidth - 1.5, state.roomDepth - 2, 3.6);
    addLabel(p.x, p.y, '上方回風區');
  } else if (state.airflowMode === 'sidewall') {
    addIsoArrow(anno, isoProject(0.8, state.roomDepth * 0.3, 1.4), isoProject(4.5, state.roomDepth * 0.3, 1.4), '#68c4ff');
    addIsoArrow(anno, isoProject(0.8, state.roomDepth * 0.6, 1.4), isoProject(4.5, state.roomDepth * 0.6, 1.4), '#68c4ff');
    addLabel(isoProject(0.2, state.roomDepth * 0.2, 1.2).x, isoProject(0.2, state.roomDepth * 0.2, 1.2).y, '左牆 AHU / CRAH');
    addLabel(isoProject(state.roomWidth - 1.2, state.roomDepth * 0.4, 1.2).x, isoProject(state.roomWidth - 1.2, state.roomDepth * 0.4, 1.2).y, '右側回風區');
  } else if (state.airflowMode === 'endtoend') {
    addIsoArrow(anno, isoProject(state.roomWidth * 0.3, 0.6, 1.2), isoProject(state.roomWidth * 0.3, state.roomDepth * 0.56, 1.2), '#68c4ff');
    addIsoArrow(anno, isoProject(state.roomWidth * 0.6, 0.6, 1.2), isoProject(state.roomWidth * 0.6, state.roomDepth * 0.56, 1.2), '#68c4ff');
    addLabel(isoProject(state.roomWidth * 0.46, 0.3, 1.1).x, isoProject(state.roomWidth * 0.46, 0.3, 1.1).y, '走道端送風設備');
    addLabel(isoProject(state.roomWidth * 0.52, state.roomDepth - 0.8, 1.1).x, isoProject(state.roomWidth * 0.52, state.roomDepth - 0.8, 1.1).y, '另一端回風區');
  } else {
    racks.slice(0, Math.min(racks.length, 16)).forEach((rack) => {
      addIsoArrow(anno, isoProject(rack.x - rack.frontDirX * 0.8, rack.y, 1.0), isoProject(rack.x - rack.frontDirX * 0.2, rack.y, 1.0), '#68c4ff');
      addIsoArrow(anno, isoProject(rack.x + rack.frontDirX * 0.2, rack.y, 1.0), isoProject(rack.x + rack.frontDirX * 0.8, rack.y, 1.0), '#ff7b4f66');
    });
    addLabel(isoProject(state.roomWidth * 0.45, 0.5, 1.2).x, isoProject(state.roomWidth * 0.45, 0.5, 1.2).y, '前送後回（機櫃層級）');
  }

  addLabel(24, 30, `3D 示意模式：${airflowModes[state.airflowMode]}`);
  addLabel(24, 52, `機櫃高度：${state.rackHeight}U（僅視覺比例）`);
  isoView.appendChild(anno);
}

function renderStatsAndInsights(stats) {
  statsEl.innerHTML = [
    ['總機櫃數', `${stats.totalRacks}`],
    ['總熱負載 kW', `${stats.totalLoad.toFixed(0)} kW`],
    ['預估最高溫', `${stats.maxTemp.toFixed(1)} °C`],
    ['預估平均溫', `${stats.avgTemp.toFixed(1)} °C`],
    ['熱點區域比例', `${(stats.hotspotAreaRatio * 100).toFixed(1)} %`],
    ['簡易風險等級', `${stats.risk}`]
  ]
    .map(([label, value]) => `<article class="stat-card"><h3>${label}</h3><p>${value}</p></article>`)
    .join('');

  renderInterpretation(stats);
  renderHeightCard();
}

function renderInterpretation({ maxTemp, hotspotAreaRatio, avgTemp, risk }) {
  const safety = maxTemp < 27 ? '最高溫在低風險範圍。' : maxTemp <= 30 ? '最高溫接近上限，建議持續監控。' : '最高溫偏高，建議立即改善冷卻條件。';
  const hotspotText = hotspotAreaRatio > 0.06 ? '熱點範圍明顯，建議快速處理。' : hotspotAreaRatio > 0.02 ? '存在局部熱點，需優化氣流。' : '熱點區域有限。';
  const airflowText = state.airflowFactor < 0.9 ? '風量係數可能不足。' : '風量條件目前可接受。';
  const efficiencyText = state.coolingEfficiency < 0.6 ? '冷卻效率偏弱，建議改善冷源或送風組織。' : state.coolingEfficiency <= 0.9 ? '冷卻效率落在一般範圍。' : '冷卻效率較強，溫升抑制能力較佳。';
  const flowDetail = state.airflowFactor < 0.8 ? '風量偏低，熱點可能擴大。' : state.airflowFactor <= 1.2 ? '風量在基準範圍。' : '風量偏高，較有利帶走熱量。';
  const containmentText = state.coldAisleContainment ? '冷通道封閉已啟用，對抑制熱混流有幫助。' : '冷通道封閉未啟用，熱混流風險較高。';

  interpretationEl.innerHTML = `
    <h3>工程判讀</h3>
    <ul>
      <li>目前安全性：${safety}</li>
      <li>熱點狀況：${hotspotText}</li>
      <li>冷卻效率係數解讀：${efficiencyText}</li>
      <li>風量係數解讀：${flowDetail}（${airflowText}）</li>
      <li>冷通道封閉：${containmentText}</li>
      <li>風險等級：${risk}（熱點門檻 ${HOTSPOT_THRESHOLD}°C）</li>
      <li>氣流模式：${airflowModes[state.airflowMode]}</li>
      <li>目前 3D 示意僅用於視覺理解，不代表正式 CFD。</li>
      <li>平均溫度參考：${avgTemp.toFixed(1)}°C</li>
    </ul>
  `;
}

function renderHeightCard() {
  const shortCircuitRisk = ((state.rackHeight - 42) / 10) * 8 + (state.coldAisleContainment ? -2 : 3);
  const normalizedRisk = clamp(12 + shortCircuitRisk, 8, 28);
  heightCardEl.innerHTML = `
    <h3>高度影響卡片</h3>
    <div class="side-view">
      <div class="supply">Supply Air ↑</div>
      <div class="rack-box">Rack ${state.rackHeight}U</div>
      <div class="return">Return Air ←</div>
      <div class="hot-plume">熱氣流上升</div>
    </div>
    <p>機櫃高度越高，熱氣上升與回風短路風險略升。此處為簡化示意，非正式 CFD 結果。估計風險指標：${normalizedRisk.toFixed(1)}%</p>
  `;
}

function updateViewToggle() {
  viewButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.view === state.viewMode));
  canvas.classList.toggle('is-hidden', state.viewMode !== '2d');
  isoStage.classList.toggle('is-hidden', state.viewMode !== '3d');
}

function bindViewButtons() {
  viewButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.viewMode = btn.dataset.view;
      updateViewToggle();
    });
  });
}

function update() {
  const model = buildHeatField();
  drawMap(model);
  renderIso(model);
  renderStatsAndInsights(getStats(model.field));
  updateViewToggle();
}

createControls();
bindViewButtons();
bind3DInteractions();
update();
