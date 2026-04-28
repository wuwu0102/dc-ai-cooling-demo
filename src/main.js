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
      </section>
    </main>
  </div>
`;

const schema = [
  { key: 'roomWidth', label: '機房寬度 (m)', type: 'number', min: 10, max: 80, step: 1 },
  { key: 'roomDepth', label: '機房深度 (m)', type: 'number', min: 10, max: 80, step: 1 },
  { key: 'rackRows', label: '機櫃排數', type: 'number', min: 1, max: 8, step: 1 },
  { key: 'racksPerRow', label: '每排機櫃數', type: 'number', min: 2, max: 40, step: 1 },
  { key: 'rackPower', label: '每櫃功率 (kW)', type: 'number', min: 3, max: 80, step: 1 },
  { key: 'supplyTemp', label: '出風溫度 (°C)', type: 'number', min: 8, max: 25, step: 0.5 },
  { key: 'coolingEfficiency', label: '冷卻效率係數', type: 'range', min: 0.3, max: 1.2, step: 0.01 },
  { key: 'airflowFactor', label: '風量係數', type: 'range', min: 0.5, max: 2.0, step: 0.01 },
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
  coldAisleContainment: true
};

const gridSize = 90;
const canvas = document.querySelector('#heatCanvas');
const ctx = canvas.getContext('2d');
const controls = document.querySelector('#controls');
const statsEl = document.querySelector('#stats');

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
    if (!(target instanceof HTMLInputElement)) return;

    const field = schema.find((item) => item.key === target.name);
    if (!field) return;

    if (field.type === 'checkbox') {
      state[target.name] = target.checked;
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

function rackLayout() {
  const aisleGap = state.roomWidth / (state.rackRows + 1);
  const rackDepth = state.roomDepth / (state.racksPerRow * 2.2);
  const rackWidth = Math.max(0.8, state.roomWidth / 24);

  const racks = [];
  for (let row = 0; row < state.rackRows; row += 1) {
    const xCenter = aisleGap * (row + 1);
    const yGap = state.roomDepth / (state.racksPerRow + 1);

    for (let i = 0; i < state.racksPerRow; i += 1) {
      const yCenter = yGap * (i + 1);
      racks.push({
        x: xCenter,
        y: yCenter,
        width: rackWidth,
        depth: rackDepth,
        row
      });
    }
  }

  return racks;
}

function buildHeatField() {
  const field = Array.from({ length: gridSize }, () => Array(gridSize).fill(state.supplyTemp));
  const roomToGridX = (x) => Math.floor((x / state.roomWidth) * (gridSize - 1));
  const roomToGridY = (y) => Math.floor((y / state.roomDepth) * (gridSize - 1));
  const racks = rackLayout();

  const powerFactor = state.rackPower * 0.23;
  const flowDivider = 0.65 + state.airflowFactor * 0.9;
  const efficiencyDivider = 0.55 + state.coolingEfficiency * 1.1;
  const containmentBoost = state.coldAisleContainment ? 0.8 : 1.15;
  const sourceStrength = (powerFactor * containmentBoost) / (flowDivider * efficiencyDivider);

  racks.forEach((rack) => {
    const cx = roomToGridX(rack.x);
    const cy = roomToGridY(rack.y);

    for (let dy = -8; dy <= 8; dy += 1) {
      for (let dx = -8; dx <= 8; dx += 1) {
        const gx = cx + dx;
        const gy = cy + dy;
        if (gx < 0 || gx >= gridSize || gy < 0 || gy >= gridSize) continue;

        const distance = Math.sqrt(dx * dx + dy * dy);
        const spread = Math.exp(-(distance * distance) / 26);
        const rowBias = rack.row % 2 === 0 ? 1.08 : 0.95;
        field[gy][gx] += sourceStrength * spread * rowBias;
      }
    }

    // 熱通道偏移：機櫃後方溫度額外上升
    const exhaustOffset = rack.row % 2 === 0 ? 5 : -5;
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = 2; dx <= 8; dx += 1) {
        const gx = cx + dx * (rack.row % 2 === 0 ? 1 : -1);
        const gy = cy + dy + exhaustOffset * 0.12;
        if (gx < 0 || gx >= gridSize || gy < 0 || gy >= gridSize) continue;
        const d = Math.sqrt((dx - 2) ** 2 + dy * dy);
        field[Math.round(gy)][gx] += sourceStrength * 0.45 * Math.exp(-(d * d) / 18);
      }
    }
  });

  // 冷通道封閉讓冷區更集中
  if (state.coldAisleContainment && state.rackRows >= 2) {
    for (let row = 0; row < state.rackRows - 1; row += 1) {
      const leftX = ((row + 1) / (state.rackRows + 1)) * state.roomWidth;
      const rightX = ((row + 2) / (state.rackRows + 1)) * state.roomWidth;
      const coldAisleX = (leftX + rightX) / 2;
      const gx = roomToGridX(coldAisleX);
      for (let y = 0; y < gridSize; y += 1) {
        for (let x = gx - 3; x <= gx + 3; x += 1) {
          if (x < 0 || x >= gridSize) continue;
          field[y][x] -= 0.9 * state.coolingEfficiency;
        }
      }
    }
  }

  // diffusion / smoothing
  const cycles = 8;
  for (let n = 0; n < cycles; n += 1) {
    const next = field.map((row) => row.slice());
    for (let y = 1; y < gridSize - 1; y += 1) {
      for (let x = 1; x < gridSize - 1; x += 1) {
        const center = field[y][x] * 0.42;
        const around =
          (field[y - 1][x] + field[y + 1][x] + field[y][x - 1] + field[y][x + 1]) * 0.13 +
          (field[y - 1][x - 1] + field[y - 1][x + 1] + field[y + 1][x - 1] + field[y + 1][x + 1]) * 0.0075;
        const coolingSink = state.supplyTemp * (0.08 + state.airflowFactor * 0.015);
        next[y][x] = center + around + coolingSink;
      }
    }
    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        field[y][x] = next[y][x];
      }
    }
  }

  return { field, racks };
}

function tempColor(temp, minTemp, maxTemp) {
  const t = clamp((temp - minTemp) / (maxTemp - minTemp || 1), 0, 1);
  const hue = 220 - 210 * t;
  const sat = 85;
  const light = 55 - 12 * t;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
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

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const temp = field[y][x];
      min = Math.min(min, temp);
      max = Math.max(max, temp);
      sum += temp;
    }
  }

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      ctx.fillStyle = tempColor(field[y][x], min, max);
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

  // 冷通道與熱通道標示
  for (let row = 0; row < state.rackRows - 1; row += 1) {
    const leftX = ((row + 1) / (state.rackRows + 1)) * state.roomWidth;
    const rightX = ((row + 2) / (state.rackRows + 1)) * state.roomWidth;
    const coldLeft = toCanvas(leftX + 0.5, 0).x;
    const coldRight = toCanvas(rightX - 0.5, 0).x;
    ctx.fillStyle = 'rgba(66, 165, 245, 0.14)';
    ctx.fillRect(coldLeft, margin, coldRight - coldLeft, mapH);

    ctx.fillStyle = 'rgba(120, 215, 255, 0.85)';
    ctx.font = '12px sans-serif';
    ctx.fillText('冷通道', coldLeft + 8, margin + 16);
  }

  racks.forEach((rack) => {
    const p = toCanvas(rack.x, rack.y);
    const rw = (rack.width / state.roomWidth) * mapW;
    const rh = (rack.depth / state.roomDepth) * mapH;
    ctx.fillStyle = 'rgba(34, 42, 58, 0.92)';
    ctx.strokeStyle = 'rgba(214, 224, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.fillRect(p.x - rw / 2, p.y - rh / 2, rw, rh);
    ctx.strokeRect(p.x - rw / 2, p.y - rh / 2, rw, rh);

    // 熱通道顯示在機櫃後方
    const hotShift = rack.row % 2 === 0 ? rw * 1.8 : -rw * 1.8;
    ctx.fillStyle = 'rgba(255, 95, 87, 0.18)';
    ctx.fillRect(p.x + hotShift - rw * 0.7, p.y - rh * 0.6, rw * 1.4, rh * 1.2);

    // 氣流箭頭
    ctx.strokeStyle = 'rgba(173, 216, 255, 0.9)';
    ctx.lineWidth = 1.4;
    const arrowDir = rack.row % 2 === 0 ? 1 : -1;
    const startX = p.x - arrowDir * rw;
    const endX = p.x + arrowDir * rw;
    ctx.beginPath();
    ctx.moveTo(startX, p.y);
    ctx.lineTo(endX, p.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(endX, p.y);
    ctx.lineTo(endX - arrowDir * 6, p.y - 4);
    ctx.lineTo(endX - arrowDir * 6, p.y + 4);
    ctx.closePath();
    ctx.fillStyle = 'rgba(173, 216, 255, 0.95)';
    ctx.fill();
  });

  const hotspotThreshold = state.supplyTemp + 8.8;
  let hotspots = 0;
  for (let y = 1; y < gridSize - 1; y += 2) {
    for (let x = 1; x < gridSize - 1; x += 2) {
      const t = field[y][x];
      if (t > hotspotThreshold && t > field[y][x - 1] && t > field[y][x + 1] && t > field[y - 1][x] && t > field[y + 1][x]) {
        hotspots += 1;
        const px = margin + x * cellW;
        const py = margin + y * cellH;
        ctx.fillStyle = 'rgba(255, 65, 65, 0.95)';
        ctx.beginPath();
        ctx.arc(px, py, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const avgTemp = sum / (gridSize * gridSize);
  const maxTemp = max;
  const totalRacks = state.rackRows * state.racksPerRow;
  const totalLoad = totalRacks * state.rackPower;
  let risk = '低';
  if (maxTemp > state.supplyTemp + 10 || hotspots > 65) risk = '高';
  else if (maxTemp > state.supplyTemp + 7 || hotspots > 30) risk = '中';

  statsEl.innerHTML = [
    ['總機櫃數', `${totalRacks}`],
    ['總熱負載 kW', `${totalLoad.toFixed(0)} kW`],
    ['預估最高溫', `${maxTemp.toFixed(1)} °C`],
    ['預估平均溫', `${avgTemp.toFixed(1)} °C`],
    ['熱點數量', `${hotspots}`],
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
}

function update() {
  const model = buildHeatField();
  drawMap(model);
}

createControls();
update();
