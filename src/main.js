import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const state = {
  roomWidth: 20,
  roomDepth: 20,
  rackRows: 2,
  racksPerRow: 10,
  rackPower: 20,
  supplyTemp: 16,
  coolingEfficiency: 0.78,
  airflowFactor: 1,
  coldAisleContainment: true,
  view: '2d'
};

document.querySelector('#app').innerHTML = `
<div class="page">
  <h1>Data Center Cooling 3D Prototype</h1>
  <div class="layout">
    <aside class="panel" id="controls"></aside>
    <main class="panel grow">
      <div class="toggle">
        <button data-view="2d" class="active">2D 熱圖</button>
        <button data-view="3d">3D Viewer</button>
      </div>
      <canvas id="heatmap" width="900" height="900"></canvas>
      <div id="viewer" class="hidden"></div>
      <div id="stats" class="stats"></div>
      <section id="interpretation" class="note"></section>
    </main>
  </div>
</div>`;

const controlsEl = document.querySelector('#controls');
const heatmap = document.querySelector('#heatmap');
const ctx = heatmap.getContext('2d');
const viewer = document.querySelector('#viewer');
const stats = document.querySelector('#stats');
const interpretation = document.querySelector('#interpretation');

const fields = [
  ['roomWidth', '機房寬度(m)', 10, 40, 1], ['roomDepth', '機房深度(m)', 10, 40, 1],
  ['rackRows', '機櫃排數', 1, 6, 1], ['racksPerRow', '每排櫃數', 2, 24, 1],
  ['rackPower', '每櫃功率(kW)', 3, 50, 1], ['supplyTemp', '供風溫度(°C)', 12, 24, 0.5],
  ['coolingEfficiency', '冷卻效率係數', 0.3, 1.2, 0.01], ['airflowFactor', '風量係數', 0.5, 2, 0.01]
];

function renderControls() {
  controlsEl.innerHTML = `<h2>參數設定</h2>${fields.map(([k, l, min, max, step]) => `
    <label>${l}<input name="${k}" type="number" min="${min}" max="${max}" step="${step}" value="${state[k]}"></label>
  `).join('')}
  <label><input type="checkbox" name="coldAisleContainment" ${state.coldAisleContainment ? 'checked' : ''}/>冷通道封閉</label>`;

  controlsEl.querySelectorAll('input').forEach((i) => i.addEventListener('input', () => {
    state[i.name] = i.type === 'checkbox' ? i.checked : Number(i.value);
    renderAll();
  }));
}

function tempAt(x, y) {
  const base = state.supplyTemp + (state.rackPower / 10) * (1 - state.coolingEfficiency) * 5;
  const cx = state.roomWidth / 2;
  const cy = state.roomDepth / 2;
  const hotspot = Math.max(0, 1 - Math.hypot(x - cx, y - cy) / (state.roomWidth / 2));
  const airflow = (1 / state.airflowFactor) * 2;
  return base + hotspot * 10 + airflow;
}

function heatColor(t) {
  const p = Math.max(0, Math.min(1, (t - 15) / 20));
  const hue = (1 - p) * 220;
  return `hsl(${hue}, 90%, 55%)`;
}

function draw2D() {
  const size = 90;
  const cw = heatmap.width / size;
  const ch = heatmap.height / size;
  let max = -Infinity, avg = 0, hot = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tx = (x / size) * state.roomWidth;
      const ty = (y / size) * state.roomDepth;
      const t = tempAt(tx, ty);
      ctx.fillStyle = heatColor(t);
      ctx.fillRect(x * cw, y * ch, cw + 1, ch + 1);
      avg += t; if (t > max) max = t; if (t >= 30) hot++;
    }
  }

  const aisleW = heatmap.width * 0.12;
  ctx.fillStyle = 'rgba(137,196,255,0.25)';
  ctx.fillRect(heatmap.width * 0.44, 0, aisleW, heatmap.height);
  ctx.fillStyle = 'rgba(255,145,84,0.22)';
  ctx.fillRect(heatmap.width * 0.58, 0, aisleW, heatmap.height);

  const points = size * size;
  stats.innerHTML = `
  <article><h3>平均溫度</h3><p>${(avg / points).toFixed(1)}°C</p></article>
  <article><h3>最高溫</h3><p>${max.toFixed(1)}°C</p></article>
  <article><h3>熱點比例</h3><p>${((hot / points) * 100).toFixed(1)}%</p></article>`;
  interpretation.innerHTML = `<h3>工程判讀</h3><ul><li>冷通道(${state.coldAisleContainment ? '封閉' : '開放'})可降低混風。</li><li>當每櫃功率升高時，建議同步提高風量係數與冷卻效率。</li></ul>`;
}

let renderer, scene, camera, controls, root;
function init3D() {
  if (renderer) return;
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1224');
  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  viewer.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = true;
  controls.minDistance = 8;
  controls.maxDistance = 120;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  scene.add(new THREE.HemisphereLight(0x88bbff, 0x222233, 1.2));
  const light = new THREE.DirectionalLight(0xffffff, 0.9);
  light.position.set(20, 25, 12);
  scene.add(light);
  root = new THREE.Group();
  scene.add(root);
  window.addEventListener('resize', resize3D);
  resize3D();
  animate();
}

function build3D() {
  init3D();
  root.clear();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(state.roomWidth, state.roomDepth), new THREE.MeshStandardMaterial({ color: 0x1a2a3d, side: THREE.DoubleSide }));
  floor.rotation.x = -Math.PI / 2; root.add(floor);
  const grid = new THREE.GridHelper(state.roomWidth, 20, 0x6ea5ff, 0x32507a);
  root.add(grid);

  const cold = new THREE.Mesh(new THREE.BoxGeometry(state.roomWidth * 0.2, 0.03, state.roomDepth), new THREE.MeshBasicMaterial({ color: 0x75bfff, transparent: true, opacity: 0.3 }));
  cold.position.set(0, 0.02, 0); root.add(cold);
  const hot = new THREE.Mesh(new THREE.BoxGeometry(state.roomWidth * 0.2, 0.03, state.roomDepth), new THREE.MeshBasicMaterial({ color: 0xff9a66, transparent: true, opacity: 0.25 }));
  hot.position.set(state.roomWidth * 0.23, 0.02, 0); root.add(hot);

  const rackGeo = new THREE.BoxGeometry(0.7, 2.2, 1.1);
  const rackMat = new THREE.MeshStandardMaterial({ color: 0x151515 });
  for (let r = 0; r < state.rackRows; r++) for (let c = 0; c < state.racksPerRow; c++) {
    const m = new THREE.Mesh(rackGeo, rackMat);
    m.position.set((-state.roomWidth / 2) + 2 + c * 0.8, 1.1, (-state.roomDepth / 2) + 2 + r * 2.6);
    root.add(m);
  }

  camera.position.set(state.roomWidth, state.roomDepth * 0.9, state.roomDepth);
  controls.target.set(0, 1.2, 0);
  controls.update();
}

function resize3D() {
  if (!renderer) return;
  const w = viewer.clientWidth; const h = Math.max(360, viewer.clientHeight || 560);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  controls?.update();
  renderer?.render(scene, camera);
}

function renderAll() {
  draw2D();
  if (state.view === '3d') build3D();
}

document.querySelectorAll('.toggle button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.toggle button').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  state.view = b.dataset.view;
  const show3d = state.view === '3d';
  viewer.classList.toggle('hidden', !show3d);
  heatmap.classList.toggle('hidden', show3d);
  if (show3d) build3D();
}));

renderControls();
renderAll();
