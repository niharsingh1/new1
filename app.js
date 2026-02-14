const dataModeEl = document.getElementById('dataMode');
const simControlsEl = document.getElementById('simControls');
const tleControlsEl = document.getElementById('tleControls');
const runBtn = document.getElementById('runBtn');
const satCountEl = document.getElementById('satCount');
const seedEl = document.getElementById('seed');
const tleInputEl = document.getElementById('tleInput');
const thresholdEl = document.getElementById('threshold');

const closestDistanceEl = document.getElementById('closestDistance');
const threatPercentEl = document.getElementById('threatPercent');
const alertStatusEl = document.getElementById('alertStatus');
const collisionListEl = document.getElementById('collisionList');

const canvas = document.getElementById('orbitCanvas');
const ctx = canvas.getContext('2d');

let latestData = [];

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulateSatellites(count, seed) {
  const random = mulberry32(Number(seed) || 1);
  const steps = 45;
  const satellites = [];

  for (let i = 0; i < count; i += 1) {
    const radius = 6650 + random() * 850;
    const speed = 0.035 + random() * 0.03;
    const phase = random() * Math.PI * 2;
    const inclination = (random() - 0.5) * 0.35;
    const points = [];

    for (let t = 0; t < steps; t += 1) {
      const angle = phase + t * speed;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle) * Math.cos(inclination);
      const z = radius * Math.sin(angle) * Math.sin(inclination);
      points.push({ t, x, y, z });
    }

    satellites.push({ name: `SIM-${i + 1}`, points });
  }

  return satellites;
}

function parseTLE(inputText) {
  const lines = inputText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 3) return [];
  const satellites = [];

  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i];
    const line2 = lines[i + 2];
    const parts = line2.split(/\s+/);

    const inclinationDeg = Number(parts[2]) || 0;
    const meanMotion = Number(parts[7]) || 15;
    const phase = (Number(parts[5]) || 0) * (Math.PI / 180);

    const incRad = inclinationDeg * (Math.PI / 180);
    const orbitalPeriodSec = (24 * 3600) / meanMotion;
    const radius = 6771 + (meanMotion < 15 ? 800 : 450);

    const points = [];
    const stepSec = orbitalPeriodSec / 45;

    for (let t = 0; t < 45; t += 1) {
      const angle = phase + ((2 * Math.PI) / orbitalPeriodSec) * (t * stepSec);
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle) * Math.cos(incRad);
      const z = radius * Math.sin(angle) * Math.sin(incRad);
      points.push({ t, x, y, z });
    }

    satellites.push({ name, points });
  }

  return satellites;
}

function linearRegressionPredict(points, futureSteps = 18) {
  const predicted = [...points];
  const dimensions = ['x', 'y', 'z'];

  for (let step = 1; step <= futureSteps; step += 1) {
    const t = points.length - 1 + step;
    const next = { t };

    dimensions.forEach((dim) => {
      const xs = points.map((p) => p.t);
      const ys = points.map((p) => p[dim]);
      const n = xs.length;
      const sumX = xs.reduce((a, b) => a + b, 0);
      const sumY = ys.reduce((a, b) => a + b, 0);
      const sumXY = xs.reduce((acc, x, idx) => acc + x * ys[idx], 0);
      const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
      const denominator = n * sumXX - sumX * sumX || 1;
      const slope = (n * sumXY - sumX * sumY) / denominator;
      const intercept = (sumY - slope * sumX) / n;
      next[dim] = slope * t + intercept;
    });

    predicted.push(next);
  }

  return predicted;
}

function distance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function detectCollisions(satellites, thresholdKm) {
  let closest = Infinity;
  const alerts = [];

  for (let i = 0; i < satellites.length; i += 1) {
    for (let j = i + 1; j < satellites.length; j += 1) {
      const a = satellites[i];
      const b = satellites[j];
      const steps = Math.min(a.points.length, b.points.length);

      for (let t = 0; t < steps; t += 1) {
        const d = distance(a.points[t], b.points[t]);
        closest = Math.min(closest, d);
        if (d < thresholdKm) {
          alerts.push({ pair: `${a.name} ↔ ${b.name}`, distance: d.toFixed(1), timeStep: t });
        }
      }
    }
  }

  return { closest, alerts };
}

function computeThreatPercent(closestDistanceKm, thresholdKm) {
  const ratio = Math.max(0, (thresholdKm - closestDistanceKm) / thresholdKm);
  const boosted = Math.min(1, ratio * 1.3);
  return Math.round(boosted * 100);
}

function drawDashboard(satellites, alerts) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const earthRadius = 60;

  ctx.fillStyle = '#11458a';
  ctx.beginPath();
  ctx.arc(cx, cy, earthRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#1fa5ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, earthRadius + 4, 0, Math.PI * 2);
  ctx.stroke();

  const maxOrbit = Math.max(
    ...satellites.flatMap((sat) => sat.points.map((point) => Math.hypot(point.x, point.y))),
    1,
  );

  satellites.forEach((sat, index) => {
    const hue = Math.floor((index / Math.max(1, satellites.length)) * 280 + 40);
    ctx.strokeStyle = `hsl(${hue}, 95%, 70%)`;
    ctx.lineWidth = 1.3;
    ctx.beginPath();

    sat.points.forEach((point, pIndex) => {
      const px = cx + (point.x / maxOrbit) * (canvas.width * 0.39);
      const py = cy + (point.y / maxOrbit) * (canvas.height * 0.39);
      if (pIndex === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });

    ctx.stroke();
  });

  alerts.slice(0, 8).forEach((alert) => {
    const [leftName, rightName] = alert.pair.split(' ↔ ');
    const leftSat = satellites.find((sat) => sat.name === leftName);
    const rightSat = satellites.find((sat) => sat.name === rightName);
    if (!leftSat || !rightSat) return;

    const a = leftSat.points[alert.timeStep];
    const b = rightSat.points[alert.timeStep];
    if (!a || !b) return;

    const ax = cx + (a.x / maxOrbit) * (canvas.width * 0.39);
    const ay = cy + (a.y / maxOrbit) * (canvas.height * 0.39);
    const bx = cx + (b.x / maxOrbit) * (canvas.width * 0.39);
    const by = cy + (b.y / maxOrbit) * (canvas.height * 0.39);

    ctx.strokeStyle = '#ff4b5c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  });
}

function renderAlerts(alerts) {
  if (!alerts.length) {
    collisionListEl.innerHTML = '<strong>No collisions detected.</strong> All monitored distances are above threshold.';
    return;
  }

  collisionListEl.innerHTML = alerts
    .slice(0, 12)
    .map(
      (alert) =>
        `<div class="alert-item">🚨 <strong>${alert.pair}</strong> at step ${alert.timeStep}, distance: ${alert.distance} km</div>`,
    )
    .join('');
}

function runDetection() {
  const mode = dataModeEl.value;
  const threshold = Number(thresholdEl.value) || 350;

  let satellites =
    mode === 'tle'
      ? parseTLE(tleInputEl.value)
      : simulateSatellites(Number(satCountEl.value) || 4, Number(seedEl.value) || 42);

  if (satellites.length < 2) {
    collisionListEl.innerHTML = 'Please provide at least two satellites.';
    return;
  }

  satellites = satellites.map((sat) => ({
    ...sat,
    points: linearRegressionPredict(sat.points, 18),
  }));

  latestData = satellites;

  const { closest, alerts } = detectCollisions(satellites, threshold);
  const threatPercent = Number.isFinite(closest) ? computeThreatPercent(closest, threshold) : 0;

  closestDistanceEl.textContent = Number.isFinite(closest) ? `${closest.toFixed(1)} km` : '--';
  threatPercentEl.textContent = `${threatPercent}%`;

  const isDanger = alerts.length > 0;
  alertStatusEl.textContent = isDanger ? 'RED ALERT' : 'SAFE';
  alertStatusEl.classList.toggle('danger', isDanger);
  alertStatusEl.classList.toggle('safe', !isDanger);

  renderAlerts(alerts);
  drawDashboard(satellites, alerts);
}

dataModeEl.addEventListener('change', () => {
  const useTLE = dataModeEl.value === 'tle';
  simControlsEl.classList.toggle('hidden', useTLE);
  tleControlsEl.classList.toggle('hidden', !useTLE);
});

runBtn.addEventListener('click', runDetection);

runDetection();
