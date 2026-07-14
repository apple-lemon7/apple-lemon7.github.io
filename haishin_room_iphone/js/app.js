(function () {
  "use strict";

  const STORAGE_KEY = "rainy-focus-room-iphone-settings-v1";
  const TAKEOFF_DELAY = 12000;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const SCENES = {
    sunrise: { label: "朝", path: "./assets/images/room/sunrise.png" },
    day: { label: "昼", path: "./assets/images/room/day.png" },
    cloudy: { label: "曇り", path: "./assets/images/room/day_cloudy.png" },
    sunset: { label: "夕暮れ", path: "./assets/images/room/sunset.png" },
    blue: { label: "ブルーモーメント", path: "./assets/images/room/blue_moment.png" },
    night: { label: "夜", path: "./assets/images/room/outside-night.png" },
  };

  const GALLERY = [
    { title: "山", path: "./assets/images/gallery/mountain.jpg" },
    { title: "星空 1", path: "./assets/images/gallery/stars-1.jpg" },
    { title: "星空 2", path: "./assets/images/gallery/stars-2.jpg" },
    { title: "氷山", path: "./assets/images/gallery/iceberg.jpg" },
    { title: "海を見下ろす", path: "./assets/images/gallery/sea-view.jpg" },
    { title: "海底", path: "./assets/images/gallery/undersea.jpg" },
    { title: "火山", path: "./assets/images/gallery/volcano.jpg" },
  ];

  const BGM_TRACKS = [
    "Goodbye My Starry Night",
    "Tokyo Speed Drive (Cover Instrumental)",
    "こまちゃん、星を斬る (Cover Instrumental)",
    "こまちゃん、星を斬る",
    "こまちゃん☆Shooting Star (Cover Instrumental)",
    "こまちゃん☆Shooting Star",
    "こまちゃんRising (Remastered)",
    "屋久島の雨に抱かれて (Cover Instrumental)",
    "屋久島の雨に抱かれて",
    "星に届けるメロディー (Add Instrumental)",
    "星空の分かれ道",
  ].map((title, index) => ({
    title,
    path: `./assets/audio/bgm/track-${String(index + 1).padStart(2, "0")}.mp3`,
  }));

  const DEFAULTS = {
    focusMinutes: 25,
    focusSeconds: 0,
    breakMinutes: 5,
    breakSeconds: 0,
    clockOn: true,
    characterOn: true,
    fighterMode: false,
    neonOn: true,
    lampOn: true,
    keyboardOn: true,
    deskSweepOn: true,
    neonSpeed: 3,
    neonX: 0,
    neonY: 0,
    lampX: 0,
    lampY: 0,
    keyboardSweepX: 8,
    keyboardSweepY: 69,
    keyboardSweepWidth: 77,
    keyboardSweepHeight: 25,
    glassDropsOn: true,
    dropDensity: 4,
    dropSize: 1,
    continuousDrops: true,
    outsideRainOn: false,
    outsideSnowOn: false,
    lightFlowOn: true,
    lightFlowX: 24,
    lightFlowY: 66,
    lightFlowAngle: -8,
    bgmMode: "playlist",
    bgmTrack: 0,
    backgroundPath: SCENES.night.path,
    sceneMode: "night",
    mouthSensitivity: 1.4,
    mouthThreshold: .18,
    idleMotionOn: true,
    pointerFollowOn: false,
    motionSpeed: 1,
    headMotion: 1,
    eyeMotion: 1,
    hairMotion: 1,
    breathMotion: 1,
    characterX: 0,
    characterY: 0,
    characterScale: 100,
  };

  const LIGHT_LIMITS = {
    neon: { x: [-55, 50], y: [-80, 15] },
    lamp: { x: [-65, 35], y: [-70, 25] },
  };

  const booleanKeys = [
    "clockOn", "characterOn", "fighterMode", "neonOn", "lampOn", "keyboardOn",
    "deskSweepOn", "glassDropsOn", "continuousDrops", "outsideRainOn", "outsideSnowOn",
    "lightFlowOn", "idleMotionOn", "pointerFollowOn",
  ];
  const numberKeys = [
    "focusMinutes", "focusSeconds", "breakMinutes", "breakSeconds", "neonSpeed", "neonX", "neonY",
    "lampX", "lampY", "keyboardSweepX", "keyboardSweepY", "keyboardSweepWidth", "keyboardSweepHeight",
    "dropDensity", "dropSize", "lightFlowX", "lightFlowY", "lightFlowAngle",
    "mouthSensitivity", "mouthThreshold", "motionSpeed", "headMotion", "eyeMotion", "hairMotion",
    "breathMotion", "characterX", "characterY", "characterScale",
  ];

  let settings = loadSettings();
  let previousFighterMode = null;
  let fighterTakeoffTimer = 0;
  let thunderTimer = 0;
  let uiHidden = false;
  let voiceObjectUrl = "";
  let voiceGraph = null;
  let mouthLevel = 0;
  let pointer = { x: 0, y: 0, inside: false };

  const scene = $("#scene");
  const outsideImage = $("#outsideImage");
  const character = $("#character");
  const bgmAudio = $("#bgmAudio");
  const voiceAudio = $("#voiceAudio");
  const fighterAudio = $("#fighterAudio");
  const soundAudios = {
    rain: $("#rainAudio"),
    wind: $("#windAudio"),
    thunder: $("#thunderAudio"),
    notification: $("#notificationAudio"),
    fighter: fighterAudio,
  };

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return saved && typeof saved === "object" ? { ...DEFAULTS, ...saved } : { ...DEFAULTS };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (_) { /* private mode */ }
  }

  function setSetting(key, value, options = {}) {
    settings[key] = value;
    if (options.save !== false) saveSettings();
    applySettings();
  }

  function outputText(key, value) {
    if (["neonX", "neonY", "lampX", "lampY", "keyboardSweepX", "keyboardSweepY", "keyboardSweepWidth", "keyboardSweepHeight", "lightFlowX", "lightFlowY", "characterX", "characterY", "characterScale"].includes(key)) return `${value}%`;
    if (key === "lightFlowAngle") return `${value}°`;
    return String(value);
  }

  function syncFormValues() {
    for (const key of booleanKeys) {
      const input = $(`#${key}`);
      if (input) input.checked = Boolean(settings[key]);
    }
    for (const key of numberKeys) {
      const input = $(`#${key}`);
      if (input && document.activeElement !== input) input.value = String(settings[key]);
      const output = $(`[data-output="${key}"]`);
      if (output) output.textContent = outputText(key, settings[key]);
    }
  }

  function applySettings() {
    syncFormValues();
    outsideImage.src = settings.backgroundPath || SCENES.night.path;
    outsideImage.alt = settings.sceneMode === "gallery" ? "選択した背景" : `${SCENES[settings.sceneMode]?.label || "夜"}の景色`;
    outsideImage.classList.toggle("gallery-image", settings.sceneMode === "gallery");

    $$("[data-scene]").forEach((button) => button.classList.toggle("active", button.dataset.scene === settings.sceneMode));
    $$("#backgroundGallery button").forEach((button) => button.classList.toggle("active", button.dataset.path === settings.backgroundPath));

    $("#dateClock").hidden = !settings.clockOn;
    character.classList.toggle("is-off", !settings.characterOn);
    character.style.setProperty("--character-x", `${settings.characterX}%`);
    character.style.setProperty("--character-y", `${settings.characterY}%`);
    character.style.setProperty("--character-scale", String(settings.characterScale / 100));

    $("#neonObject").classList.toggle("is-off", !settings.neonOn);
    $("#lampObject").classList.toggle("is-off", !settings.lampOn);
    $("#keyboardObject").classList.toggle("is-off", !settings.keyboardOn);
    $("#deskSweep").classList.toggle("is-off", !settings.deskSweepOn);
    $("#neonObject").style.setProperty("--object-x", `${settings.neonX}%`);
    $("#neonObject").style.setProperty("--object-y", `${settings.neonY}%`);
    $("#lampObject").style.setProperty("--object-x", `${settings.lampX}%`);
    $("#lampObject").style.setProperty("--object-y", `${settings.lampY}%`);
    $("#keyboardSweep").style.left = `${settings.keyboardSweepX}%`;
    $("#keyboardSweep").style.top = `${settings.keyboardSweepY}%`;
    $("#keyboardSweep").style.width = `${settings.keyboardSweepWidth}%`;
    $("#keyboardSweep").style.height = `${settings.keyboardSweepHeight}%`;
    scene.style.setProperty("--pulse-duration", `${Math.max(1.4, 7.2 - settings.neonSpeed * 1.05)}s`);

    const lightFlow = $("#lightFlow");
    lightFlow.classList.toggle("is-off", !settings.lightFlowOn);
    lightFlow.style.left = `${settings.lightFlowX}%`;
    lightFlow.style.top = `${settings.lightFlowY}%`;
    lightFlow.style.setProperty("--flow-angle", `${settings.lightFlowAngle}deg`);

    $("#quickRain").classList.toggle("active", settings.outsideRainOn || settings.glassDropsOn);
    $("#quickRain").setAttribute("aria-pressed", String(settings.outsideRainOn || settings.glassDropsOn));
    $("#quickSnow").classList.toggle("active", settings.outsideSnowOn);
    $("#quickSnow").setAttribute("aria-pressed", String(settings.outsideSnowOn));

    $("#bgmTrack").value = String(clamp(settings.bgmTrack, 0, BGM_TRACKS.length - 1));
    $("#bgmPlaylist").classList.toggle("active", settings.bgmMode === "playlist");
    $("#bgmLoop").classList.toggle("active", settings.bgmMode === "loop");
    bgmAudio.loop = settings.bgmMode === "loop";
  }

  function buildGallery() {
    const root = $("#backgroundGallery");
    for (const item of GALLERY) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.path = item.path;
      button.innerHTML = `<img src="${item.path}" alt=""><span>${item.title}</span>`;
      button.addEventListener("click", () => {
        settings.backgroundPath = item.path;
        settings.sceneMode = "gallery";
        saveSettings();
        applySettings();
      });
      root.append(button);
    }
  }

  function buildBgmOptions() {
    const select = $("#bgmTrack");
    BGM_TRACKS.forEach((track, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = track.title;
      select.append(option);
    });
    loadBgmTrack(false);
  }

  function loadBgmTrack(continuePlaying) {
    const index = clamp(Number(settings.bgmTrack) || 0, 0, BGM_TRACKS.length - 1);
    settings.bgmTrack = index;
    const track = BGM_TRACKS[index];
    bgmAudio.src = track.path;
    bgmAudio.loop = settings.bgmMode === "loop";
    $("#bgmNow").textContent = track.title;
    $("#bgmTrack").value = String(index);
    if (continuePlaying) bgmAudio.play().catch(() => updateBgmUi());
    updateBgmUi();
  }

  function updateBgmUi() {
    const playing = !bgmAudio.paused && !bgmAudio.ended;
    $("#bgmToggle").textContent = playing ? "一時停止" : "再生";
    $("#bgmToggle").classList.toggle("active", playing);
  }

  async function toggleBgm() {
    if (bgmAudio.paused) {
      try { await bgmAudio.play(); } catch (_) { /* iOS may require another tap */ }
    } else {
      bgmAudio.pause();
    }
    updateBgmUi();
  }

  function bindSettings() {
    for (const key of booleanKeys) {
      const input = $(`#${key}`);
      if (!input) continue;
      input.addEventListener("change", () => setSetting(key, input.checked));
    }
    for (const key of numberKeys) {
      const input = $(`#${key}`);
      if (!input) continue;
      const eventName = input.type === "range" ? "input" : "change";
      input.addEventListener(eventName, () => {
        const value = Number(input.value);
        if (Number.isFinite(value)) setSetting(key, value);
      });
    }

    $$("[data-scene]").forEach((button) => button.addEventListener("click", () => {
      const key = button.dataset.scene;
      settings.sceneMode = key;
      settings.backgroundPath = SCENES[key].path;
      saveSettings();
      applySettings();
    }));

    $("#quickRain").addEventListener("click", () => {
      const next = !(settings.outsideRainOn || settings.glassDropsOn);
      settings.outsideRainOn = next;
      settings.glassDropsOn = next;
      saveSettings();
      applySettings();
    });
    $("#quickSnow").addEventListener("click", () => setSetting("outsideSnowOn", !settings.outsideSnowOn));
    

    $("#bgmTrack").addEventListener("change", () => {
      const wasPlaying = !bgmAudio.paused;
      settings.bgmTrack = Number($("#bgmTrack").value);
      saveSettings();
      loadBgmTrack(wasPlaying);
    });
    $("#bgmToggle").addEventListener("click", toggleBgm);
    $("#bgmPlaylist").addEventListener("click", () => setSetting("bgmMode", "playlist"));
    $("#bgmLoop").addEventListener("click", () => setSetting("bgmMode", "loop"));
    bgmAudio.addEventListener("play", updateBgmUi);
    bgmAudio.addEventListener("pause", updateBgmUi);
    bgmAudio.addEventListener("ended", () => {
      if (settings.bgmMode !== "playlist") return updateBgmUi();
      settings.bgmTrack = (settings.bgmTrack + 1) % BGM_TRACKS.length;
      saveSettings();
      loadBgmTrack(true);
    });

    $("#characterReset").addEventListener("click", () => {
      Object.assign(settings, { characterX: 0, characterY: 0, characterScale: 100 });
      saveSettings();
      applySettings();
    });

    $("#resetSettings").addEventListener("click", () => {
      stopAllAudio();
      settings = { ...DEFAULTS };
      previousFighterMode = null;
      saveSettings();
      applySettings();
      selectPhase("focus");
    });
  }


  function bindLightDragging() {
    let drag = null;
    $$('[data-drag-light]').forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        if (uiHidden) return;
        event.preventDefault();
        event.stopPropagation();
        const kind = handle.dataset.dragLight;
        handle.setPointerCapture(event.pointerId);
        drag = {
          kind,
          startX: event.clientX,
          startY: event.clientY,
          x: Number(settings[`${kind}X`]),
          y: Number(settings[`${kind}Y`]),
        };
      });
      handle.addEventListener("pointermove", (event) => {
        if (!drag || !handle.hasPointerCapture(event.pointerId)) return;
        const rect = scene.getBoundingClientRect();
        const limits = LIGHT_LIMITS[drag.kind];
        settings[`${drag.kind}X`] = clamp(drag.x + (event.clientX - drag.startX) / rect.width * 100, limits.x[0], limits.x[1]);
        settings[`${drag.kind}Y`] = clamp(drag.y + (event.clientY - drag.startY) / rect.height * 100, limits.y[0], limits.y[1]);
        applySettings();
      });
      const finish = (event) => {
        if (!drag) return;
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        drag = null;
        saveSettings();
      };
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    });
  }

  function bindPanels() {
    const panel = $("#settingsPanel");
    const openPanel = () => {
      panel.classList.add("is-open");
      panel.setAttribute("aria-hidden", "false");
    };
    const closePanel = () => {
      panel.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
    };
    $("#settingsOpen").addEventListener("click", () => panel.classList.contains("is-open") ? closePanel() : openPanel());
    $("#settingsClose").addEventListener("click", closePanel);

    const setUiHidden = (hidden) => {
      uiHidden = hidden;
      if (hidden) closePanel();
      $$(".interface-layer").forEach((element) => element.classList.toggle("ui-hidden", hidden));
      scene.classList.toggle("ui-hidden-mode", hidden);
    };
    $("#uiHide").addEventListener("click", () => setUiHidden(true));

    let longPressTimer = 0;
    let longPressPointer = null;
    const cancelLongPress = () => {
      clearTimeout(longPressTimer);
      longPressTimer = 0;
      longPressPointer = null;
    };
    scene.addEventListener("pointerdown", (event) => {
      if (!uiHidden || (event.button !== undefined && event.button !== 0)) return;
      longPressPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      longPressTimer = window.setTimeout(() => {
        if (!uiHidden || !longPressPointer) return;
        if (navigator.vibrate) navigator.vibrate(20);
        setUiHidden(false);
        cancelLongPress();
      }, 700);
    });
    scene.addEventListener("pointermove", (event) => {
      if (!longPressPointer || event.pointerId !== longPressPointer.id) return;
      if (Math.hypot(event.clientX - longPressPointer.x, event.clientY - longPressPointer.y) > 12) cancelLongPress();
    });
    scene.addEventListener("pointerup", cancelLongPress);
    scene.addEventListener("pointercancel", cancelLongPress);
    scene.addEventListener("pointerleave", cancelLongPress);
    scene.addEventListener("contextmenu", (event) => {
      if (uiHidden) event.preventDefault();
    });
    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (uiHidden) setUiHidden(false);
      else closePanel();
    });
  }

  const timer = {
    phase: "focus",
    remaining: 0,
    running: false,
    deadline: 0,
    interval: 0,
  };

  function phaseSeconds(phase = timer.phase) {
    const minutes = phase === "focus" ? settings.focusMinutes : settings.breakMinutes;
    const seconds = phase === "focus" ? settings.focusSeconds : settings.breakSeconds;
    return Math.max(1, clamp(Math.round(minutes), 0, 999) * 60 + clamp(Math.round(seconds), 0, 59));
  }

  function formatTimer(total) {
    const value = Math.max(0, Math.round(total));
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  }

  function updateTimerUi() {
    const text = formatTimer(timer.remaining);
    $("#timeDisplay").textContent = text;
    $("#miniTime").textContent = text;
    $("#timerToggle").textContent = timer.running ? "PAUSE" : "START";
    $("#miniStatus").classList.toggle("is-running", timer.running);
    const duration = phaseSeconds();
    const progress = clamp(1 - timer.remaining / duration, 0, 1);
    $("#progressBar").style.width = `${progress * 100}%`;
    document.title = `${text} · ${timer.phase === "focus" ? "FOCUS" : "BREAK"} — Rainy Focus Room`;
  }

  function stopTimer() {
    timer.running = false;
    clearInterval(timer.interval);
    timer.interval = 0;
    updateTimerUi();
  }

  function tickTimer() {
    if (!timer.running) return;
    timer.remaining = Math.max(0, Math.ceil((timer.deadline - Date.now()) / 1000));
    updateTimerUi();
    if (timer.remaining <= 0) {
      stopTimer();
      playNotification(2);
    }
  }

  function toggleTimer() {
    if (timer.running) return stopTimer();
    if (timer.remaining <= 0) timer.remaining = phaseSeconds();
    timer.running = true;
    timer.deadline = Date.now() + timer.remaining * 1000;
    timer.interval = window.setInterval(tickTimer, 250);
    updateTimerUi();
  }

  function selectPhase(phase) {
    stopTimer();
    timer.phase = phase;
    timer.remaining = phaseSeconds(phase);
    $("#focusTab").classList.toggle("active", phase === "focus");
    $("#breakTab").classList.toggle("active", phase === "break");
    $("#focusTab").setAttribute("aria-selected", String(phase === "focus"));
    $("#breakTab").setAttribute("aria-selected", String(phase === "break"));
    $("#timerNote").textContent = phase === "focus" ? "静かな雨音と、ひとつのタスク。" : "肩の力を抜いて、窓の外を眺めよう。";
    updateTimerUi();
  }

  function bindTimer() {
    timer.remaining = phaseSeconds("focus");
    $("#focusTab").addEventListener("click", () => selectPhase("focus"));
    $("#breakTab").addEventListener("click", () => selectPhase("break"));
    $("#timerToggle").addEventListener("click", toggleTimer);
    $("#timerReset").addEventListener("click", () => {
      stopTimer();
      timer.remaining = phaseSeconds();
      updateTimerUi();
    });
    $("#timerPlus").addEventListener("click", () => {
      timer.remaining = Math.min(999 * 60 + 59, timer.remaining + 60);
      if (timer.running) timer.deadline += 60000;
      updateTimerUi();
    });
    $("#timeEditorToggle").addEventListener("click", () => {
      const editor = $("#timeEditor");
      editor.hidden = !editor.hidden;
      $("#timerReadout").hidden = !editor.hidden;
    });
    $("#applyTime").addEventListener("click", () => {
      for (const key of ["focusMinutes", "focusSeconds", "breakMinutes", "breakSeconds"]) {
        const input = $(`#${key}`);
        const max = key.endsWith("Seconds") ? 59 : 999;
        settings[key] = clamp(Number(input.value) || 0, 0, max);
      }
      saveSettings();
      $("#timeEditor").hidden = true;
      $("#timerReadout").hidden = false;
      stopTimer();
      timer.remaining = phaseSeconds();
      applySettings();
      updateTimerUi();
    });
    $("#timerMinimize").addEventListener("click", () => setTimerMinimized(!$("#timerCard").classList.contains("is-minimized")));
    $("#miniTimer").addEventListener("click", () => setTimerMinimized(false));
    document.addEventListener("visibilitychange", tickTimer);
    updateTimerUi();
  }

  function setTimerMinimized(minimized) {
    $("#timerCard").classList.toggle("is-minimized", minimized);
    $("#timerFull").hidden = minimized;
    $("#miniTimer").hidden = !minimized;
    $("#timerMinimize").textContent = minimized ? "+" : "−";
    $("#timerMinimize").setAttribute("aria-label", minimized ? "タイマーを展開" : "タイマーを最小化");
  }

  function formatClock(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function startClock() {
    const update = () => {
      const now = new Date();
      $("#dateClock").textContent = formatClock(now);
      $("#dateClock").dateTime = now.toISOString();
    };
    update();
    setInterval(update, 1000);
  }

  function updateSoundButton(kind, active) {
    const button = kind === "fighter" ? $("#fighterSound") : $(`[data-sound="${kind}"]`);
    if (!button) return;
    button.classList.toggle("active", active);
    const small = button.querySelector("small");
    if (small) {
      if (kind === "thunder") small.textContent = active ? "RANDOM ON" : "RANDOM";
      else if (kind === "notification") small.textContent = "2 PLAY";
      else if (kind === "fighter") small.textContent = settings.fighterMode ? (active ? "STOP" : "LOOP") : "MODE OFF";
      else small.textContent = active ? "STOP" : "LOOP";
    }
  }

  async function toggleLoopSound(kind) {
    const audio = soundAudios[kind];
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      audio.currentTime = 0;
      updateSoundButton(kind, false);
      return;
    }
    audio.volume = kind === "fighter" ? .42 : kind === "rain" ? .32 : .27;
    try {
      await audio.play();
      updateSoundButton(kind, true);
    } catch (_) {
      updateSoundButton(kind, false);
    }
  }

  function playNotification(repeats = 2) {
    const audio = soundAudios.notification;
    let remaining = repeats;
    const replay = () => {
      remaining -= 1;
      if (remaining > 0) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        audio.removeEventListener("ended", replay);
      }
    };
    audio.addEventListener("ended", replay);
    audio.volume = .45;
    audio.currentTime = 0;
    audio.play().catch(() => audio.removeEventListener("ended", replay));
  }

  function scheduleThunder() {
    clearTimeout(thunderTimer);
    const button = $('[data-sound="thunder"]');
    if (!button.classList.contains("active")) return;
    thunderTimer = window.setTimeout(async () => {
      const audio = soundAudios.thunder;
      audio.volume = .36;
      audio.currentTime = 0;
      try { await audio.play(); } catch (_) { /* next manual tap can unlock */ }
      scheduleThunder();
    }, 7000 + Math.random() * 22000);
  }

  function toggleThunder() {
    const button = $('[data-sound="thunder"]');
    const active = !button.classList.contains("active");
    updateSoundButton("thunder", active);
    if (active) scheduleThunder();
    else {
      clearTimeout(thunderTimer);
      soundAudios.thunder.pause();
      soundAudios.thunder.currentTime = 0;
    }
  }

  function stopAllAudio() {
    clearTimeout(thunderTimer);
    [...Object.values(soundAudios), bgmAudio, voiceAudio].forEach((audio) => {
      audio.pause();
      try { audio.currentTime = 0; } catch (_) { /* metadata may not be loaded */ }
    });
    ["rain", "wind", "thunder", "fighter"].forEach((kind) => updateSoundButton(kind, false));
    updateBgmUi();
  }

  function bindSound() {
    $('[data-sound="rain"]').addEventListener("click", () => toggleLoopSound("rain"));
    $('[data-sound="wind"]').addEventListener("click", () => toggleLoopSound("wind"));
    $('[data-sound="thunder"]').addEventListener("click", toggleThunder);
    $('[data-sound="notification"]').addEventListener("click", () => playNotification(2));
    $("#fighterSound").addEventListener("click", () => {
      if (settings.fighterMode) toggleLoopSound("fighter");
    });
    for (const kind of ["rain", "wind", "fighter"]) {
      soundAudios[kind].addEventListener("pause", () => updateSoundButton(kind, false));
      soundAudios[kind].addEventListener("play", () => updateSoundButton(kind, true));
    }
  }

  async function prepareVoiceGraph() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!voiceGraph) {
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = .72;
      const source = context.createMediaElementSource(voiceAudio);
      source.connect(analyser);
      analyser.connect(context.destination);
      voiceGraph = { context, analyser, data: new Uint8Array(analyser.fftSize) };
    }
    if (voiceGraph.context.state === "suspended") await voiceGraph.context.resume();
    return voiceGraph;
  }

  function bindVoice() {
    $("#voiceFile").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      if (voiceObjectUrl) URL.revokeObjectURL(voiceObjectUrl);
      voiceObjectUrl = URL.createObjectURL(file);
      voiceAudio.src = voiceObjectUrl;
      voiceAudio.volume = .72;
      $("#voiceName").textContent = file.name;
      $("#voiceName").hidden = false;
      $("#voiceToggle").hidden = false;
      await prepareVoiceGraph();
      try { await voiceAudio.play(); } catch (_) { /* button remains available */ }
      updateVoiceUi();
    });
    $("#voiceToggle").addEventListener("click", async () => {
      if (!voiceAudio.src) return;
      await prepareVoiceGraph();
      if (voiceAudio.paused) {
        try { await voiceAudio.play(); } catch (_) { /* no-op */ }
      } else voiceAudio.pause();
      updateVoiceUi();
    });
    voiceAudio.addEventListener("play", updateVoiceUi);
    voiceAudio.addEventListener("pause", updateVoiceUi);
    voiceAudio.addEventListener("ended", updateVoiceUi);
  }

  function updateVoiceUi() {
    const playing = !voiceAudio.paused && !voiceAudio.ended;
    $("#voiceToggle").textContent = playing ? "一時停止" : "再生";
    $("#voiceToggle").classList.toggle("active", playing);
  }

  function updateMouth() {
    let level = 0;
    if (voiceGraph && !voiceAudio.paused && !voiceAudio.ended) {
      voiceGraph.analyser.getByteTimeDomainData(voiceGraph.data);
      let energy = 0;
      for (const sample of voiceGraph.data) {
        const normalized = (sample - 128) / 128;
        energy += normalized * normalized;
      }
      level = clamp(Math.sqrt(energy / voiceGraph.data.length) * 7.2 * settings.mouthSensitivity, 0, 1);
    }
    mouthLevel += (level - mouthLevel) * (level > mouthLevel ? .42 : .24);
    const open = mouthLevel > settings.mouthThreshold;
    character.style.setProperty("--mouth-scale", String(open ? 1 + mouthLevel * .68 : 1));
    character.style.setProperty("--mouth-open-opacity", open ? "1" : "0");
    character.style.setProperty("--mouth-closed-opacity", open ? "0" : "1");
  }

  function bindPointerFollow() {
    const updatePointer = (event) => {
      const rect = scene.getBoundingClientRect();
      pointer.x = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
      pointer.y = clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1);
      pointer.inside = true;
    };
    scene.addEventListener("pointermove", updatePointer, { passive: true });
    scene.addEventListener("pointerdown", updatePointer, { passive: true });
    scene.addEventListener("pointerleave", () => { pointer.inside = false; }, { passive: true });
  }

  function startCharacterRig() {
    let targetYaw = 0;
    let targetPitch = 0;
    let currentYaw = 0;
    let currentPitch = 0;
    let nextDirection = 0;
    const animate = (now) => {
      const t = now / 1000 * settings.motionSpeed;
      if (settings.idleMotionOn && now > nextDirection) {
        targetYaw = (Math.random() * 2 - 1) * settings.headMotion;
        targetPitch = (Math.random() * 2 - 1) * settings.headMotion * .65;
        nextDirection = now + 1600 + Math.random() * 2800;
      }
      if (!settings.idleMotionOn) {
        targetYaw = 0;
        targetPitch = 0;
      }
      currentYaw += (targetYaw - currentYaw) * .018;
      currentPitch += (targetPitch - currentPitch) * .018;
      const followX = settings.pointerFollowOn && pointer.inside ? pointer.x * settings.headMotion * 1.6 : 0;
      const followY = settings.pointerFollowOn && pointer.inside ? pointer.y * settings.headMotion : 0;
      const idleX = settings.idleMotionOn ? Math.sin(t * .42) * .34 * settings.headMotion : 0;
      const idleY = settings.idleMotionOn ? Math.sin(t * .31 + 1.7) * .2 * settings.headMotion : 0;
      const idleR = settings.idleMotionOn ? Math.sin(t * .23 + .5) * .36 * settings.headMotion : 0;
      const breath = settings.idleMotionOn ? (.5 + .5 * Math.sin(t * Math.PI * 2 / 3.4)) * settings.breathMotion : 0;
      const hair = settings.idleMotionOn ? (Math.sin(t * .8) * .6 + Math.sin(t * 1.9 + 1.2) * .28) * settings.hairMotion : 0;
      const eyeX = ((settings.idleMotionOn ? Math.sin(t * .56 + .4) * .08 : 0) + (settings.pointerFollowOn && pointer.inside ? pointer.x * .34 : 0)) * settings.eyeMotion;
      const eyeY = ((settings.idleMotionOn ? Math.sin(t * .37 + 1.2) * .045 : 0) + (settings.pointerFollowOn && pointer.inside ? pointer.y * .19 : 0)) * settings.eyeMotion;
      character.style.setProperty("--head-x", `${idleX + currentYaw * .3 + followX * .26}%`);
      character.style.setProperty("--head-y", `${idleY + currentPitch * .2 + followY * .2}%`);
      character.style.setProperty("--head-r", `${idleR + currentYaw * .15 + followX * .17}deg`);
      character.style.setProperty("--body-r", `${Math.sin(t * .19 + 2.1) * .28 * settings.headMotion}deg`);
      character.style.setProperty("--breath-y", `${-breath * .22}%`);
      character.style.setProperty("--breath-x", String(1 + breath * .0014));
      character.style.setProperty("--hair-r", `${hair}deg`);
      character.style.setProperty("--hair-back-r", `${-hair * .7}deg`);
      character.style.setProperty("--eye-x", `${eyeX}%`);
      character.style.setProperty("--eye-y", `${eyeY}%`);
      character.style.setProperty("--blink-duration", `${Math.max(3.8, 7.5 / settings.motionSpeed)}s`);
      updateMouth();
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  function init() {
    buildGallery();
    buildBgmOptions();
    bindSettings();
    bindPanels();
    bindTimer();
    bindSound();
    bindVoice();
    bindPointerFollow();
    bindLightDragging();
    startClock();
    startCharacterRig();
    window.RoomEffects.start({
      weather: $("#weatherCanvas"),
      rain: $("#rainCanvas"),
      particles: $("#particleCanvas"),
    }, () => settings);
    applySettings();
    window.addEventListener("beforeunload", () => {
      if (voiceObjectUrl) URL.revokeObjectURL(voiceObjectUrl);
    });
  }

  init();
})();
