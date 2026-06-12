"use strict";

const CONFIG = {
  saveKey: "hanabi-komachan-save-v1",
  cryptoKey: "Hanabi1234",
  tickMs: 250,
  manual: {
    materialCost: 10,
    materialGain: 1,
    craftCost: 1,
    launchCost: 1,
  },
  economy: {
    baseReward: 22,
    crowdBase: 30,
    crowdPerLaunch: 7,
    idleOfflineCapMs: 1000 * 60 * 60 * 6,
  },
  colors: [
    { name: "白", value: "#f7fbff", mult: 1 },
    { name: "黄色", value: "#ffd64b", mult: 1.35 },
    { name: "赤", value: "#ff4b45", mult: 1.8 },
    { name: "紫", value: "#b46cff", mult: 2.35 },
    { name: "オレンジ", value: "#ff9a38", mult: 3.05 },
    { name: "青緑", value: "#44dfda", mult: 3.9 },
    { name: "黄緑", value: "#9df263", mult: 5 },
    { name: "深い赤", value: "#aa1626", mult: 6.4 },
  ],
  upgrades: {
    colorLevel: { base: 120, scale: 2.55, max: 7, label: "花火の色", desc: "報酬アップ。次の色へ進む" },
    sizeLevel: { base: 90, scale: 1.85, max: 18, label: "花火の大きさ", desc: "報酬と打ち上げ高度アップ" },
    tubes: { base: 240, scale: 2.15, max: 8, label: "花火発射箇所 +1", desc: "同時に打ち上げる数が増える" },
    autoBuyers: { base: 95, scale: 1.9, max: 20, label: "自動仕入れ装置", desc: "素材購入を自動化" },
    autoCrafters: { base: 135, scale: 1.85, max: 20, label: "花火作成機", desc: "花火玉を自動作成。強化で速度+1" },
    autoLaunchers: { base: 190, scale: 1.95, max: 20, label: "花火打ち上げ機", desc: "打ち上げを自動化。強化で速度+1" },
  },
  automation: {
    buyPerSec: 0.55,
    craftPerSec: 0.58,
    launchPerSec: 0.24,
  },
  assets: {
    background: "./assets/night-river-bg_trim.png",
    komachan: "./assets/komachan.png",
    props: "./assets/firework-props-pack.png",
  },
  audio: {
    bgm: "./assets/bgm/bgm.mp3",
    launch: "./assets/se/hanabi1.mp3",
    burst: "./assets/se/hanabi2.mp3",
    button: "./assets/se/button.mp3",
    bgmVolume: 0.34,
    seVolume: 0.76,
  },
};

const DEFAULT_STATE = {
  money: 80,
  materials: 0,
  shells: 0,
  tubes: 1,
  colorLevel: 0,
  sizeLevel: 0,
  autoBuyers: 0,
  autoCrafters: 0,
  autoLaunchers: 0,
  launches: 0,
  earnedTotal: 0,
  bgmOn: true,
  lastSavedAt: Date.now(),
  autoProgress: { buy: 0, craft: 0, launch: 0 },
};

function createFreshState() {
  return {
    ...DEFAULT_STATE,
    lastSavedAt: Date.now(),
    autoProgress: { ...DEFAULT_STATE.autoProgress },
  };
}

const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const ui = {
  money: document.querySelector("#moneyText"),
  materials: document.querySelector("#materialsText"),
  shells: document.querySelector("#shellsText"),
  tubes: document.querySelector("#tubesText"),
  crowd: document.querySelector("#crowdText"),
  color: document.querySelector("#colorText"),
  status: document.querySelector("#statusLine"),
  upgrades: document.querySelector("#upgradeList"),
  saveBox: document.querySelector("#saveDataBox"),
  buy: document.querySelector("#buyMaterialButton"),
  craft: document.querySelector("#craftButton"),
  launch: document.querySelector("#launchButton"),
  audio: document.querySelector("#audioButton"),
  save: document.querySelector("#saveButton"),
  export: document.querySelector("#exportButton"),
  import: document.querySelector("#importButton"),
  reset: document.querySelector("#resetButton"),
};

let state = loadState();
let particles = [];
let rockets = [];
let floatingTexts = [];
let lastFrame = performance.now();
let lastTick = performance.now();
let propsCanvas = null;
let bgImage = loadImage(CONFIG.assets.background);
let komachanImage = loadImage(CONFIG.assets.komachan);
let propsImage = loadImage(CONFIG.assets.props, () => {
  propsCanvas = makeMagentaTransparent(propsImage);
});
let audio = createAudioManager();

function loadImage(src, onload) {
  const image = new Image();
  image.onload = onload || null;
  image.src = src;
  return image;
}

function createAudioManager() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || typeof fetch !== "function") {
    return {
      unlock() {},
      playSfx() {},
      startBgm() {},
      stopBgm() {},
      toggleBgm() {
        state.bgmOn = !state.bgmOn;
      },
    };
  }

  let context = null;
  let masterGain = null;
  let bgmGain = null;
  let seGain = null;
  let bgmSource = null;
  let loadingPromise = null;
  const buffers = {};

  const ensureContext = () => {
    if (context) return context;
    context = new AudioContextClass();
    masterGain = context.createGain();
    bgmGain = context.createGain();
    seGain = context.createGain();
    bgmGain.gain.value = CONFIG.audio.bgmVolume;
    seGain.gain.value = CONFIG.audio.seVolume;
    bgmGain.connect(masterGain);
    seGain.connect(masterGain);
    masterGain.connect(context.destination);
    loadingPromise = loadAll();
    return context;
  };

  const loadBuffer = async (name, url) => {
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    buffers[name] = await context.decodeAudioData(data);
  };

  const loadAll = async () => {
    try {
      await Promise.all([
        loadBuffer("bgm", CONFIG.audio.bgm),
        loadBuffer("launch", CONFIG.audio.launch),
        loadBuffer("burst", CONFIG.audio.burst),
        loadBuffer("button", CONFIG.audio.button),
      ]);
    } catch {
      flashStatus("音声ファイルの読み込みに失敗しました");
    }
  };

  const unlock = () => {
    const ctx = ensureContext();
    if (ctx.state === "suspended") ctx.resume();
    if (state.bgmOn) startBgm();
  };

  const playSfx = (name, volume = 1, rate = 1) => {
    if (!context || !buffers[name]) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffers[name];
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(seGain);
    source.start();
  };

  const startBgm = () => {
    const ctx = ensureContext();
    loadingPromise.then(() => {
      if (!state.bgmOn || bgmSource || !buffers.bgm) return;
      bgmSource = ctx.createBufferSource();
      bgmSource.buffer = buffers.bgm;
      bgmSource.loop = true;
      bgmSource.connect(bgmGain);
      bgmSource.onended = () => {
        bgmSource = null;
      };
      bgmSource.start();
    });
  };

  const stopBgm = () => {
    if (!bgmSource) return;
    bgmSource.onended = null;
    bgmSource.stop();
    bgmSource.disconnect();
    bgmSource = null;
  };

  const toggleBgm = () => {
    unlock();
    state.bgmOn = !state.bgmOn;
    if (state.bgmOn) startBgm();
    else stopBgm();
    renderUI();
    flashStatus(state.bgmOn ? "BGMをオンにしました" : "BGMをオフにしました");
  };

  ensureContext();

  return { unlock, playSfx, startBgm, stopBgm, toggleBgm };
}

function loadState() {
  try {
    const raw = localStorage.getItem(CONFIG.saveKey);
    if (!raw) return createFreshState();
    const parsed = JSON.parse(raw);
    const merged = {
      ...DEFAULT_STATE,
      ...parsed,
      autoProgress: { ...DEFAULT_STATE.autoProgress, ...(parsed.autoProgress || {}) },
    };
    applyOfflineProgress(merged);
    return merged;
  } catch {
    return createFreshState();
  }
}

function applyOfflineProgress(nextState) {
  const elapsedMs = Math.min(Date.now() - (nextState.lastSavedAt || Date.now()), CONFIG.economy.idleOfflineCapMs);
  if (elapsedMs <= 1000) return;
  runAutomation(nextState, elapsedMs / 1000, false);
}

function saveState() {
  state.lastSavedAt = Date.now();
  localStorage.setItem(CONFIG.saveKey, JSON.stringify(state));
  flashStatus("保存しました");
}

function formatMoney(value) {
  return `${Math.floor(value).toLocaleString("ja-JP")}円`;
}

function getCrowd() {
  return Math.floor(CONFIG.economy.crowdBase + state.launches * CONFIG.economy.crowdPerLaunch + state.sizeLevel * 12);
}

function getReward() {
  return getRewardFor(state);
}

function getRewardFor(targetState) {
  const color = CONFIG.colors[targetState.colorLevel];
  const sizeMult = 1 + targetState.sizeLevel * 0.18;
  const crowd = Math.floor(
    CONFIG.economy.crowdBase + targetState.launches * CONFIG.economy.crowdPerLaunch + targetState.sizeLevel * 12
  );
  const crowdMult = 1 + crowd / 1000;
  return Math.floor(CONFIG.economy.baseReward * color.mult * sizeMult * crowdMult);
}

function getUpgradeCost(key) {
  const info = CONFIG.upgrades[key];
  const level = key === "tubes" ? state.tubes - 1 : state[key];
  return Math.floor(info.base * Math.pow(info.scale, level));
}

function canUpgrade(key) {
  const info = CONFIG.upgrades[key];
  const level = key === "tubes" ? state.tubes - 1 : state[key];
  return level < info.max && state.money >= getUpgradeCost(key);
}

function buyMaterial(manual = true) {
  if (!buyMaterialFor(state)) return false;
  if (manual) flashStatus("素材を仕入れました");
  return true;
}

function craftShell(manual = true) {
  if (!craftShellFor(state)) return false;
  if (manual) flashStatus(`${CONFIG.colors[state.colorLevel].name}の花火玉を作りました`);
  return true;
}

function launchShell(manual = true) {
  if (state.shells < CONFIG.manual.launchCost) return false;
  const count = Math.min(state.shells, state.tubes);
  state.shells -= count;
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const reward = getReward();
    total += reward;
    spawnRocket(i, count, reward);
  }
  state.money += total;
  state.earnedTotal += total;
  state.launches += count;
  audio.playSfx("launch", 0.82);
  if (manual) flashStatus(`${count}発打ち上げ！ +${formatMoney(total)}`);
  return true;
}

function buyMaterialFor(targetState) {
  if (targetState.money < CONFIG.manual.materialCost) return false;
  targetState.money -= CONFIG.manual.materialCost;
  targetState.materials += CONFIG.manual.materialGain;
  return true;
}

function craftShellFor(targetState) {
  if (targetState.materials < CONFIG.manual.craftCost) return false;
  targetState.materials -= CONFIG.manual.craftCost;
  targetState.shells += 1;
  return true;
}

function launchShellFor(targetState, withEffects) {
  if (targetState.shells < CONFIG.manual.launchCost) return false;
  const count = Math.min(targetState.shells, targetState.tubes);
  targetState.shells -= count;
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const reward = getRewardFor(targetState);
    total += reward;
    if (withEffects) spawnRocket(i, count, reward);
  }
  targetState.money += total;
  targetState.earnedTotal += total;
  targetState.launches += count;
  if (withEffects) audio.playSfx("launch", 0.82);
  return true;
}

function buyUpgrade(key) {
  if (!canUpgrade(key)) return;
  state.money -= getUpgradeCost(key);
  if (key === "tubes") state.tubes += 1;
  else state[key] += 1;
  flashStatus(`${CONFIG.upgrades[key].label}を強化しました`);
  renderUI();
}

function runAutomation(targetState, dt, withEffects = true) {
  const ap = targetState.autoProgress;
  ap.buy += targetState.autoBuyers * CONFIG.automation.buyPerSec * dt;
  ap.craft += targetState.autoCrafters * CONFIG.automation.craftPerSec * dt;
  ap.launch += targetState.autoLaunchers * CONFIG.automation.launchPerSec * dt;

  while (ap.buy >= 1) {
    if (!buyMaterialFor(targetState)) break;
    ap.buy -= 1;
  }
  while (ap.craft >= 1) {
    if (!craftShellFor(targetState)) break;
    ap.craft -= 1;
  }
  while (ap.launch >= 1) {
    if (!launchShellFor(targetState, withEffects)) break;
    ap.launch -= 1;
  }
}

function renderUI() {
  ui.money.textContent = formatMoney(state.money);
  ui.materials.textContent = state.materials.toLocaleString("ja-JP");
  ui.shells.textContent = state.shells.toLocaleString("ja-JP");
  ui.tubes.textContent = state.tubes.toLocaleString("ja-JP");
  ui.crowd.textContent = `${getCrowd().toLocaleString("ja-JP")}人`;
  ui.color.textContent = CONFIG.colors[state.colorLevel].name;
  ui.buy.disabled = state.money < CONFIG.manual.materialCost;
  ui.craft.disabled = state.materials < CONFIG.manual.craftCost;
  ui.launch.disabled = state.shells < CONFIG.manual.launchCost;
  ui.audio.textContent = state.bgmOn ? "BGM ON" : "BGM OFF";
  ui.audio.title = state.bgmOn ? "BGMをオフ" : "BGMをオン";
  renderUpgrades();
}

function renderUpgrades() {
  ui.upgrades.innerHTML = "";
  Object.keys(CONFIG.upgrades).forEach((key) => {
    const info = CONFIG.upgrades[key];
    const level = key === "tubes" ? state.tubes - 1 : state[key];
    const row = document.createElement("div");
    row.className = "upgrade";
    const isMax = level >= info.max;
    row.innerHTML = `
      <div>
        <strong>${info.label} Lv.${level}${isMax ? " 最大" : ""}</strong>
        <small>${info.desc}</small>
      </div>
    `;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = isMax ? "完了" : formatMoney(getUpgradeCost(key));
    button.disabled = isMax || !canUpgrade(key);
    bindButton(button, () => buyUpgrade(key));
    row.appendChild(button);
    ui.upgrades.appendChild(row);
  });
}

function flashStatus(text) {
  ui.status.textContent = text;
}

function bindButton(button, handler) {
  let handledByPointer = false;
  button.addEventListener("pointerup", (event) => {
    if (button.disabled) return;
    handledByPointer = true;
    event.preventDefault();
    audio.unlock();
    audio.playSfx("button", 0.58);
    handler(event);
    window.setTimeout(() => {
      handledByPointer = false;
    }, 0);
  });
  button.addEventListener("click", (event) => {
    if (button.disabled || handledByPointer) return;
    audio.unlock();
    audio.playSfx("button", 0.58);
    handler(event);
  });
}

function spawnRocket(index, count, reward) {
  const lane = (index + 1) / (count + 1);
  const x = canvas.width * (0.3 + lane * 0.48) + (Math.random() - 0.5) * 70;
  const startY = canvas.height * 0.84;
  const targetY = canvas.height * (0.115 - Math.min(state.sizeLevel, 14) * 0.005) + Math.random() * 44;
  rockets.push({
    x,
    y: startY,
    vx: (Math.random() - 0.5) * 20,
    vy: -500 - state.sizeLevel * 22,
    targetY,
    color: CONFIG.colors[state.colorLevel].value,
    reward,
    size: 70 + state.sizeLevel * 8,
  });
}

function explode(rocket) {
  audio.playSfx("burst", 0.84, 0.96 + Math.random() * 0.08);
  const amount = Math.floor(64 + state.sizeLevel * 7);
  for (let i = 0; i < amount; i += 1) {
    const angle = (Math.PI * 2 * i) / amount;
    const speed = rocket.size * (1.45 + Math.random() * 1.35);
    particles.push({
      x: rocket.x,
      y: rocket.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.7 + Math.random() * 0.35,
      color: rocket.color,
      radius: 2 + Math.random() * 2.5,
      sparkle: Math.random() > 0.68,
    });
    if (i % 2 === 0) {
      particles.push({
        x: rocket.x,
        y: rocket.y,
        vx: Math.cos(angle + 0.08) * speed * 0.56,
        vy: Math.sin(angle + 0.08) * speed * 0.56,
        life: 1.15,
        decay: 0.9 + Math.random() * 0.35,
        color: "#fff4b8",
        radius: 1.8 + Math.random() * 2,
        sparkle: true,
      });
    }
  }
  for (let i = 0; i < 24; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = rocket.size * (0.18 + Math.random() * 0.42);
    particles.push({
      x: rocket.x,
      y: rocket.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.55,
      decay: 1.2,
      color: "#ffffff",
      radius: 3 + Math.random() * 4,
      sparkle: true,
    });
  }
  floatingTexts.push({ x: rocket.x, y: rocket.y, text: `+${formatMoney(rocket.reward)}`, life: 1.5 });
}

function draw(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  if (now - lastTick > CONFIG.tickMs) {
    runAutomation(state, (now - lastTick) / 1000);
    lastTick = now;
    renderUI();
  }
  updateEffects(dt);
  drawScene();
  requestAnimationFrame(draw);
}

function updateEffects(dt) {
  rockets.forEach((rocket) => {
    rocket.x += rocket.vx * dt;
    rocket.y += rocket.vy * dt;
    rocket.vy += 130 * dt;
    particles.push({
      x: rocket.x,
      y: rocket.y,
      vx: (Math.random() - 0.5) * 25,
      vy: 40 + Math.random() * 35,
      life: 0.45,
      decay: 1.6,
      color: "#ffd27a",
      radius: 1.5,
    });
  });
  rockets = rockets.filter((rocket) => {
    if (rocket.y <= rocket.targetY || rocket.vy > -40) {
      explode(rocket);
      return false;
    }
    return true;
  });
  particles.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 90 * dt;
    p.life -= p.decay * dt;
  });
  particles = particles.filter((p) => p.life > 0);
  floatingTexts.forEach((t) => {
    t.y -= 32 * dt;
    t.life -= dt;
  });
  floatingTexts = floatingTexts.filter((t) => t.life > 0);
}

function drawScene() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (bgImage.complete) drawImageCover(bgImage, 0, 0, w, h);
  else {
    ctx.fillStyle = "#06112a";
    ctx.fillRect(0, 0, w, h);
  }

  drawProps(w, h);
  drawKomachan(w, h);
  drawLaunchTubes(w, h);
  drawEffects();
}

function drawImageCover(image, x, y, width, height) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function drawProps(w, h) {
  if (!propsCanvas) return;
  drawPropCell(0, w * 0.06, h * 0.72, 94);
  drawPropCell(1, w * 0.15, h * 0.75, 72);
  drawPropCell(5, w * 0.78, h * 0.73, 82);
  drawPropCell(6, w * 0.87, h * 0.71, 86);
  drawPropCell(8, w * 0.91, h * 0.48, 76);
}

function drawPropCell(cell, x, y, size) {
  const cols = 3;
  const cellW = propsCanvas.width / cols;
  const cellH = propsCanvas.height / cols;
  const sx = (cell % cols) * cellW;
  const sy = Math.floor(cell / cols) * cellH;
  ctx.drawImage(propsCanvas, sx, sy, cellW, cellH, x - size / 2, y - size / 2, size, size);
}

function drawKomachan(w, h) {
  if (!komachanImage.complete) return;
  const targetH = Math.min(h * 0.62, w * 0.36);
  const sourceWidth = komachanImage.naturalWidth || komachanImage.width;
  const sourceHeight = komachanImage.naturalHeight || komachanImage.height;
  const targetW = targetH * (sourceWidth / sourceHeight);
  ctx.drawImage(komachanImage, w * 0.02, h - targetH - 10, targetW, targetH);
}

function drawLaunchTubes(w, h) {
  const count = state.tubes;
  for (let i = 0; i < count; i += 1) {
    const x = w * (0.58 + (i % 4) * 0.055);
    const y = h * (0.83 + Math.floor(i / 4) * 0.055);
    ctx.fillStyle = "#2c2522";
    ctx.fillRect(x - 10, y - 38, 20, 46);
    ctx.fillStyle = "#5f5146";
    ctx.fillRect(x - 13, y - 42, 26, 8);
    ctx.fillStyle = "#b84432";
    ctx.fillRect(x - 12, y - 12, 24, 5);
  }
}

function drawEffects() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  rockets.forEach((rocket) => {
    const glow = 12;
    const gradient = ctx.createRadialGradient(rocket.x, rocket.y, 0, rocket.x, rocket.y, glow);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.35, rocket.color);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(rocket.x, rocket.y, glow, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rocket.color;
    ctx.beginPath();
    ctx.arc(rocket.x, rocket.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
  particles.forEach((p) => {
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    if (p.sparkle) {
      ctx.globalAlpha = Math.max(p.life * 0.72, 0);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x - p.radius * 2.2, p.y);
      ctx.lineTo(p.x + p.radius * 2.2, p.y);
      ctx.moveTo(p.x, p.y - p.radius * 2.2);
      ctx.lineTo(p.x, p.y + p.radius * 2.2);
      ctx.stroke();
    }
  });
  ctx.restore();

  floatingTexts.forEach((t) => {
    ctx.save();
    ctx.globalAlpha = Math.min(t.life, 1);
    ctx.fillStyle = "#ffe890";
    ctx.font = "700 24px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
  });
}

function makeMagentaTransparent(image) {
  const offscreen = document.createElement("canvas");
  offscreen.width = image.naturalWidth;
  offscreen.height = image.naturalHeight;
  const octx = offscreen.getContext("2d");
  octx.drawImage(image, 0, 0);
  const data = octx.getImageData(0, 0, offscreen.width, offscreen.height);
  for (let i = 0; i < data.data.length; i += 4) {
    const r = data.data[i];
    const g = data.data[i + 1];
    const b = data.data[i + 2];
    if (r > 210 && g < 55 && b > 210) data.data[i + 3] = 0;
  }
  octx.putImageData(data, 0, 0);
  return offscreen;
}

function csvEscape(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCSV() {
  const rows = [
    ["field", "value"],
    ...Object.keys(DEFAULT_STATE)
      .filter((key) => key !== "autoProgress")
      .map((key) => [key, state[key]]),
    ["autoBuyProgress", state.autoProgress.buy],
    ["autoCraftProgress", state.autoProgress.craft],
    ["autoLaunchProgress", state.autoProgress.launch],
  ];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function fromCSV(csv) {
  const rows = csv.trim().split(/\r?\n/).map((line) => {
    const cells = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) {
        cells.push(current);
        current = "";
      } else current += char;
    }
    cells.push(current);
    return cells;
  });
  const next = { ...DEFAULT_STATE, autoProgress: { ...DEFAULT_STATE.autoProgress } };
  rows.slice(1).forEach(([key, value]) => {
    const number = Number(value);
    if (key === "autoBuyProgress") next.autoProgress.buy = number || 0;
    else if (key === "autoCraftProgress") next.autoProgress.craft = number || 0;
    else if (key === "autoLaunchProgress") next.autoProgress.launch = number || 0;
    else if (typeof next[key] === "boolean") next[key] = value === "true";
    else if (key in next) next[key] = Number.isFinite(number) ? number : value;
  });
  next.colorLevel = clamp(next.colorLevel, 0, CONFIG.colors.length - 1);
  next.tubes = clamp(next.tubes, 1, CONFIG.upgrades.tubes.max + 1);
  next.lastSavedAt = Date.now();
  return next;
}

function xorText(text) {
  return Array.from(text)
    .map((char, i) => String.fromCharCode(char.charCodeAt(0) ^ CONFIG.cryptoKey.charCodeAt(i % CONFIG.cryptoKey.length)))
    .join("");
}

function encodeSave() {
  const encrypted = xorText(toCSV());
  return btoa(unescape(encodeURIComponent(encrypted)));
}

function formatSaveTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function decodeSave(encoded) {
  const encrypted = decodeURIComponent(escape(atob(encoded.trim())));
  return fromCSV(xorText(encrypted));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
}

bindButton(ui.buy, () => {
  buyMaterial();
  renderUI();
});
bindButton(ui.craft, () => {
  craftShell();
  renderUI();
});
bindButton(ui.launch, () => {
  launchShell();
  renderUI();
});
bindButton(ui.audio, () => {
  audio.toggleBgm();
});
bindButton(ui.save, saveState);
bindButton(ui.export, () => {
  const encoded = encodeSave();
  const filename = `savedata_${formatSaveTimestamp()}.txt`;
  ui.saveBox.value = encoded;
  downloadTextFile(encoded, filename);
  flashStatus(`${filename} をダウンロードしました`);
});
bindButton(ui.import, () => {
  try {
    state = decodeSave(ui.saveBox.value);
    saveState();
    renderUI();
    flashStatus("セーブデータを読み込みました");
  } catch {
    flashStatus("インポートに失敗しました");
  }
});
bindButton(ui.reset, () => {
  const ok = window.confirm("ゲーム進捗を初期化して、最初から遊び直しますか？");
  if (!ok) return;
  state = createFreshState();
  localStorage.setItem(CONFIG.saveKey, JSON.stringify(state));
  ui.saveBox.value = "";
  particles = [];
  rockets = [];
  floatingTexts = [];
  renderUI();
  flashStatus("ゲーム進捗を初期化しました");
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("beforeunload", () => {
  state.lastSavedAt = Date.now();
  localStorage.setItem(CONFIG.saveKey, JSON.stringify(state));
});

resizeCanvas();
renderUI();
requestAnimationFrame(draw);
setInterval(() => {
  state.lastSavedAt = Date.now();
  localStorage.setItem(CONFIG.saveKey, JSON.stringify(state));
}, 10000);
