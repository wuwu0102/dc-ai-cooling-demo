const app = document.querySelector('#app');

app.innerHTML = `
  <div class="page">
    <header class="header">
      <div>
        <h1>Data Center AI Cooling Demo</h1>
        <p>機房冷卻熱場快速示意工具</p>
      </div>
      <span class="demo-tag">DEMO</span>
    </header>

    <main class="layout">
      <section class="panel" aria-label="參數面板">
        <h2>參數設定</h2>
        <p class="model-note">簡化 AI surrogate / 熱場示意模型，非正式 CFD 驗證。</p>
        <div id="controls" class="controls"></div>
      </section>

      <section class="viz-section" aria-label="熱場視覺化">
        <div class="canvas-wrap">
          <canvas id="heatCanvas" width="900" height="900"></canvas>
        </div>
        <div id="stats" class="stats-grid"></div>
        <section class="interpretation" id="interpretation"></section>
        <section class="legend" aria-label="圖例與高度示意">
          <div class="legend-block">
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
          <div id="heightCard" class="height-card"></div>
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
  coldAisleContainment: true
};

const gridSize = 90;
const FIXED_MIN_TEMP = 15;
const FIXED_MAX_TEMP = 35;
const HOTSPOT_THRESHOLD = 30;

const canvas = document.querySelector('#heatCanvas');
const ctx = canvas.getContext('2d');
const controls = document.querySelector('#controls');
const statsEl = document.querySelector('#stats');
const interpretationEl = document.querySelector('#interpretation');
const heightCardEl = document.querySelector('#heightCard');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createControls() {
  controls.innerHTML = '';

  schema.forEach((item) => {
    const row = document.createElement('label');
    row.className = 'control-row';

    if (item.type === 'checkbox') {
      row.innerHTML = `
        <span>${item.label}</span>
        <input type="checkbox" name="${item.key}" ${state[item.key] ? 'checked' : ''} />
      `;
    } else if (item.type === 'select') {
      row.innerHTML = `
        <span>${item.label}</span>
        <select name="${item.key}">
          ${item.options
            .map((option) => `<option value="${option.value}" ${String(state[item.key]) === option.value ? 'selected' : ''}>${option.label}</option>`)
            .join('')}
        </select>
      `;
    } else {
      const value = Number(state[item.key]).toFixed(item.step < 1 ? 2 : 0);
      row.innerHTML = `
        <span>${item.label}</span>
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
      if (output) {
        output.textContent = Number(state[target.name]).toFixed(field.step < 1 ? 2 : 0);
      }
    }

    update();
  });
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
  if (rightDistance <= leftDistance) return 1;
  return -1;
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
      { x: 0.4, y: state.roomDepth * 0.5, width: 0.6, depth: 2.6, label: 'CRAH' },
      { x: 0.4, y: state.roomDepth * 0.8, width: 0.6, depth: 2.6, label: 'CRAH' }
    ];
  }

  if (state.airflowMode === 'endtoend') {
    return [
      { x: state.roomWidth * 0.2, y: 0.5, width: 2.0, depth: 0.7, label: 'CRAC' },
      { x: state.roomWidth * 0.5, y: 0.5, width: 2.0, depth: 0.7, label: 'CRAC' },
      { x: state.roomWidth * 0.8, y: 0.5, width: 2.0, depth: 0.7, label: 'CRAC' }
    ];
  }

  if (state.airflowMode === 'underfloor') {
    return [
      { x: state.roomWidth * 0.2, y: state.roomDepth - 0.35, width: 2.2, depth: 0.7, label: 'CRAC' },
      { x: state.roomWidth * 0.5, y: state.roomDepth - 0.35, width: 2.2, depth: 0.7, label: 'CRAC' },
      { x: state.roomWidth * 0.8, y: state.roomDepth - 0.35, width: 2.2, depth: 0.7, label: 'CRAC' }
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
      if (state.airflowMode === 'sidewall') {
        field[y][x] += nx * (2.8 - state.airflowFactor * 1.2);
      } else if (state.airflowMode === 'endtoend') {
        field[y][x] += ny * (2.9 - state.airflowFactor * 1.25);
      } else if (state.airflowMode === 'frontback') {
        field[y][x] += nx * (1.8 - state.airflowFactor * 0.8);
      } else {
        field[y][x] += (0.7 - ny * 0.4) * (1.1 - state.airflowFactor * 0.3);
      }
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
      for (let x = 0; x < gridSize; x += 1) {
        field[y][x] = Math.max(state.supplyTemp - 0.5, next[y][x]);
      }
    }
  }

  return { field, racks };
}

function tempColor(temp) {
  const t = clamp((temp - FIXED_MIN_TEMP) / (FIXED_MAX_TEMP - FIXED_MIN_TEMP), 0, 1);
  const hue = 220 - 220 * t;
  const sat = 86;
  const light = 54 - 12 * t;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
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
    for (let y = 0.16; y <= 0.84; y += 0.14) {
      drawArrow(margin + 0.08 * mapW, margin + y * mapH, margin + 0.36 * mapW, margin + y * mapH);
    }
    ctx.fillStyle = 'rgba(210, 216, 228, 0.35)';
    ctx.fillRect(margin + mapW * 0.91, margin, mapW * 0.09, mapH);
    ctx.fillStyle = 'rgba(238,245,255,0.9)';
    ctx.font = '11px sans-serif';
    ctx.fillText('對側回風區', margin + mapW * 0.92, margin + 15);
  } else if (mode === 'endtoend') {
    for (let x = 0.16; x <= 0.84; x += 0.14) {
      drawArrow(margin + x * mapW, margin + 0.08 * mapH, margin + x * mapW, margin + 0.34 * mapH);
    }
    ctx.fillStyle = 'rgba(210, 216, 228, 0.35)';
    ctx.fillRect(margin, margin + mapH * 0.91, mapW, mapH * 0.09);
    ctx.fillStyle = 'rgba(238,245,255,0.9)';
    ctx.font = '11px sans-serif';
    ctx.fillText('走道端回風區', margin + 8, margin + mapH * 0.96);
  } else if (mode === 'frontback') {
    racks.forEach((rack) => {
      const p = toCanvas(rack.x, rack.y);
      const frontX = p.x + rack.frontDirX * -16;
      const rearX = p.x + rack.frontDirX * 16;
      drawArrow(frontX, p.y, p.x + rack.frontDirX * -4, p.y, 1.2, 'rgba(225,245,255,0.95)');
      drawArrow(p.x + rack.frontDirX * 4, p.y, rearX, p.y, 1.2, 'rgba(255,166,120,0.95)');
    });
  } else {
    const aisles = getColdAisles();
    aisles.forEach((aisle) => {
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

  const title = `風向模式：${airflowModes[state.airflowMode]}`;
  ctx.fillStyle = 'rgba(238,245,255,0.9)';
  ctx.font = '12px sans-serif';
  ctx.fillText(title, margin + 8, margin + mapH + 18);
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

  let max = -Infinity;
  let sum = 0;

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const temp = field[y][x];
      max = Math.max(max, temp);
      sum += temp;
      ctx.fillStyle = tempColor(temp);
      ctx.fillRect(margin + x * cellW, margin + y * cellH, cellW + 0.7, cellH + 0.7);
    }
  }

  ctx.strokeStyle = 'rgba(130,160,255,0.9)';
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, margin, mapW, mapH);

  const toCanvas = (x, y) => ({
    x: margin + (x / state.roomWidth) * mapW,
    y: margin + (y / state.roomDepth) * mapH
  });

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

  const airflowDevices = getAirflowDevices();
  airflowDevices.forEach((device) => {
    const p = toCanvas(device.x, device.y);
    const dw = (device.width / state.roomWidth) * mapW;
    const dh = (device.depth / state.roomDepth) * mapH;
    ctx.fillStyle = 'rgba(170, 176, 187, 0.88)';
    ctx.strokeStyle = 'rgba(242, 245, 255, 0.8)';
    ctx.lineWidth = 1;
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
    ctx.lineWidth = 1;
    ctx.fillRect(p.x - rw / 2, p.y - rh / 2, rw, rh);
    ctx.strokeRect(p.x - rw / 2, p.y - rh / 2, rw, rh);

    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.1;
    const frontEdgeX = p.x - (rack.frontDirX * rw) / 2;
    ctx.beginPath();
    ctx.moveTo(frontEdgeX, p.y - rh / 2 + 2);
    ctx.lineTo(frontEdgeX, p.y + rh / 2 - 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(245,250,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(frontEdgeX, p.y);
    ctx.lineTo(frontEdgeX + rack.frontDirX * 6, p.y - 3);
    ctx.lineTo(frontEdgeX + rack.frontDirX * 6, p.y + 3);
    ctx.closePath();
    ctx.fill();
  });

  drawAirflowAnnotations(toCanvas, mapW, mapH, margin, racks);

  let hotspotCells = 0;
  for (let y = 1; y < gridSize - 1; y += 1) {
    for (let x = 1; x < gridSize - 1; x += 1) {
      if (field[y][x] >= HOTSPOT_THRESHOLD) {
        hotspotCells += 1;
        if ((x + y) % 6 === 0) {
          const px = margin + x * cellW;
          const py = margin + y * cellH;
          ctx.fillStyle = 'rgba(255, 72, 72, 0.85)';
          ctx.beginPath();
          ctx.arc(px, py, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  const hotspotAreaRatio = hotspotCells / (gridSize * gridSize);
  const avgTemp = sum / (gridSize * gridSize);
  const maxTemp = max;
  const totalRacks = state.rackRows * state.racksPerRow;
  const totalLoad = totalRacks * state.rackPower;

  let risk = '低風險';
  if (maxTemp >= 30) risk = '高風險';
  else if (maxTemp >= 27) risk = '中風險';

  statsEl.innerHTML = [
    ['總機櫃數', `${totalRacks}`],
    ['總熱負載 kW', `${totalLoad.toFixed(0)} kW`],
    ['預估最高溫', `${maxTemp.toFixed(1)} °C`],
    ['預估平均溫', `${avgTemp.toFixed(1)} °C`],
    ['熱點區域比例', `${(hotspotAreaRatio * 100).toFixed(1)} %`],
    ['簡易風險等級', `${risk}`]
  ]
    .map(
      ([label, value]) => `
      <article class="stat-card">
        <h3>${label}</h3>
        <p>${value}</p>
      </article>
    `
    )
    .join('');

  renderInterpretation({ maxTemp, hotspotAreaRatio, avgTemp, risk });
  renderHeightCard();
}

function renderInterpretation({ maxTemp, hotspotAreaRatio, avgTemp, risk }) {
  const safety = maxTemp < 27 ? '最高溫在低風險範圍。' : maxTemp <= 30 ? '最高溫接近上限，建議持續監控。' : '最高溫偏高，建議立即改善冷卻條件。';
  const hotspotText = hotspotAreaRatio > 0.06 ? '熱點範圍明顯，建議快速處理。' : hotspotAreaRatio > 0.02 ? '存在局部熱點，需優化氣流。' : '熱點區域有限。';
  const airflowText = state.airflowFactor < 0.9 ? '風量係數可能不足。' : '風量條件目前可接受。';
  const containmentText = state.coldAisleContainment ? '冷通道封閉已啟用，對抑制熱混流有幫助。' : '冷通道封閉未啟用，熱混流風險較高。';

  const modeGuidance = {
    underfloor: '主圖為俯視平面圖，以地板出風口 / perforated tiles 表示送風區；實際送風方向為垂直向上。',
    sidewall: '此模式為牆側設備水平送風，箭頭由送風側牆面流向對側回風區。',
    endtoend: '此模式為走道端送風，氣流沿走道方向推進至另一端回風區。',
    frontback: '此模式代表機櫃層級前送後回，不代表整間機房牆面空調箱水平送風。'
  };

  const suggestions = [];
  if (state.airflowFactor < 1.15) suggestions.push('提高風量係數');
  if (state.rackPower > 28 || maxTemp > 30) suggestions.push('降低單櫃功率');
  if (!state.coldAisleContainment) suggestions.push('改善冷通道封閉');
  if (state.airflowMode !== 'underfloor' && maxTemp > 28) suggestions.push('調整出風方向');

  interpretationEl.innerHTML = `
    <h3>工程判讀</h3>
    <ul>
      <li>目前安全性：${safety}</li>
      <li>熱點狀況：${hotspotText}</li>
      <li>風量判讀：${airflowText}</li>
      <li>冷通道封閉：${containmentText}</li>
      <li>風險等級：${risk}（熱點門檻 ${HOTSPOT_THRESHOLD}°C）</li>
      <li>氣流模式說明：${modeGuidance[state.airflowMode]}</li>
      <li>建議動作：${suggestions.length ? suggestions.join('、') : '維持現有設定並持續監測'}</li>
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

function update() {
  const model = buildHeatField();
  drawMap(model);
}

createControls();
update();
