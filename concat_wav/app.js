(() => {
  "use strict";

  const state = {
    tracks: [],
    draggedId: null,
    isProcessing: false,
    audioContext: null,
  };

  const elements = {
    dropZone: document.getElementById("dropZone"),
    fileInput: document.getElementById("fileInput"),
    pickButton: document.getElementById("pickButton"),
    fileList: document.getElementById("fileList"),
    listCount: document.getElementById("listCount"),
    totalDuration: document.getElementById("totalDuration"),
    mergeButton: document.getElementById("mergeButton"),
    statusRegion: document.getElementById("statusRegion"),
  };

  const AUDIO_EXTENSIONS = /\.wav$/i;

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `track-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#039;",
      '"': "&quot;",
    })[character]);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }

  function formatDuration(seconds, includeHours = false) {
    if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
    const wholeSeconds = Math.floor(seconds);
    const hours = Math.floor(wholeSeconds / 3600);
    const minutes = Math.floor((wholeSeconds % 3600) / 60);
    const remainingSeconds = wholeSeconds % 60;
    const paddedMinutes = String(minutes).padStart(2, "0");
    const paddedSeconds = String(remainingSeconds).padStart(2, "0");
    if (includeHours || hours > 0) {
      return `${hours}:${paddedMinutes}:${paddedSeconds}`;
    }
    return `${minutes}:${paddedSeconds}`;
  }

  function isWav(file) {
    const type = (file.type || "").toLowerCase();
    return AUDIO_EXTENSIONS.test(file.name) || type === "audio/wav" || type === "audio/x-wav" || type === "audio/wave";
  }

  function getAudioContext() {
    if (state.audioContext) return state.audioContext;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("このブラウザはWAVの音声解析に対応していません。");
    }
    state.audioContext = new AudioContextClass();
    return state.audioContext;
  }

  async function decodeWav(file) {
    const audioContext = getAudioContext();
    const source = await file.arrayBuffer();
    return audioContext.decodeAudioData(source.slice(0));
  }

  function setStatus(message, type = "info") {
    elements.statusRegion.hidden = !message;
    elements.statusRegion.textContent = message;
    elements.statusRegion.className = "status-region";
    if (message) elements.statusRegion.classList.add(`is-${type}`);
  }

  function getReadyTracks() {
    return state.tracks.filter((track) => track.audioBuffer && !track.error);
  }

  function getTotalDuration() {
    return state.tracks.reduce((total, track) => total + (track.duration || 0), 0);
  }

  function render() {
    elements.listCount.textContent = `${state.tracks.length} ${state.tracks.length === 1 ? "FILE" : "FILES"}`;
    elements.totalDuration.textContent = state.tracks.length ? formatDuration(getTotalDuration(), true) : "0:00";

    if (state.tracks.length === 0) {
      elements.fileList.innerHTML = `
        <div class="empty-state">
          <div><strong>まだファイルがありません</strong>左のエリアからWAVを追加してください。</div>
        </div>`;
    } else {
      elements.fileList.innerHTML = state.tracks.map((track, index) => renderTrack(track, index)).join("");
    }

    updateMergeButton();
  }

  function renderTrack(track, index) {
    const stateClass = track.error ? "has-error" : track.loading ? "is-loading" : "";
    const detail = track.loading
      ? '<span class="loading-dots">解析中</span>'
      : track.error
        ? `<span class="error-text">${escapeHtml(track.error)}</span>`
        : `<span class="format-chip">WAV</span><span>${track.audioBuffer.sampleRate.toLocaleString()} Hz</span><span>${track.audioBuffer.numberOfChannels} ch</span>`;
    const duration = track.loading ? "--:--" : track.error ? "" : formatDuration(track.duration);
    const name = escapeHtml(track.file.name);
    const indexLabel = String(index + 1).padStart(2, "0");

    return `
      <div class="track-row ${stateClass}" draggable="true" data-track-id="${track.id}" tabindex="0" aria-label="${name}、${index + 1}番目">
        <button class="drag-handle" type="button" aria-label="${name}をドラッグして並べ替え" title="ドラッグして並べ替え">⠿</button>
        <span class="track-number" aria-hidden="true">${indexLabel}</span>
        <div class="file-glyph" aria-hidden="true">WAV</div>
        <div class="track-main">
          <p class="track-name" title="${name}">${name}</p>
          <div class="track-detail">${detail}</div>
        </div>
        <span class="file-meta">${duration}</span>
        <div class="move-controls" aria-label="${name}の順番を調整">
          <button class="move-button move-up" type="button" data-action="up" aria-label="${name}を上へ" ${index === 0 ? "disabled" : ""}>↑</button>
          <button class="move-button move-down" type="button" data-action="down" aria-label="${name}を下へ" ${index === state.tracks.length - 1 ? "disabled" : ""}>↓</button>
        </div>
        <button class="remove-track" type="button" data-action="remove" aria-label="${name}を削除" title="削除">×</button>
      </div>`;
  }

  function updateMergeButton() {
    const canMerge = state.tracks.length >= 2 && state.tracks.every((track) => track.audioBuffer && !track.loading && !track.error);
    elements.mergeButton.disabled = !canMerge || state.isProcessing;
    elements.pickButton.disabled = state.isProcessing;
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const wavFiles = files.filter(isWav);
    const ignoredCount = files.length - wavFiles.length;
    if (!wavFiles.length) {
      setStatus("WAVファイルのみ追加できます。", "error");
      return;
    }

    const newTracks = wavFiles.map((file) => ({
      id: createId(),
      file,
      audioBuffer: null,
      duration: null,
      loading: true,
      error: null,
    }));
    state.tracks.push(...newTracks);
    render();
    setStatus(`${newTracks.length}ファイルを解析しています…`, "working");

    await Promise.all(newTracks.map(async (track) => {
      try {
        track.audioBuffer = await decodeWav(track.file);
        track.duration = track.audioBuffer.duration;
      } catch (error) {
        track.error = error instanceof Error && error.message
          ? "WAVを読み込めません"
          : "WAVを読み込めません";
      } finally {
        track.loading = false;
        render();
      }
    }));

    const badCount = state.tracks.filter((track) => track.error).length;
    if (badCount) {
      setStatus("読み込めないファイルがあります。削除してからもう一度お試しください。", "error");
    } else if (ignoredCount) {
      setStatus(`${newTracks.length}ファイルを追加しました（WAV以外の${ignoredCount}ファイルは無視）。`, "info");
    } else {
      setStatus(`${newTracks.length}ファイルを追加しました。順番を確認して結合できます。`, "success");
    }
  }

  function removeTrack(id) {
    state.tracks = state.tracks.filter((track) => track.id !== id);
    render();
    if (!state.tracks.length) setStatus("");
  }

  function moveTrack(id, direction) {
    const index = state.tracks.findIndex((track) => track.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= state.tracks.length) return;
    const [track] = state.tracks.splice(index, 1);
    state.tracks.splice(nextIndex, 0, track);
    render();
    requestAnimationFrame(() => document.querySelector(`[data-track-id="${id}"]`)?.focus());
  }

  function syncOrderFromDom() {
    const ids = Array.from(elements.fileList.querySelectorAll("[data-track-id]"), (row) => row.dataset.trackId);
    const byId = new Map(state.tracks.map((track) => [track.id, track]));
    state.tracks = ids.map((id) => byId.get(id)).filter(Boolean);
  }

  function clearDropIndicators() {
    elements.fileList.querySelectorAll(".is-drop-before, .is-drop-after").forEach((row) => {
      row.classList.remove("is-drop-before", "is-drop-after");
    });
  }

  function handleDragStart(event) {
    const row = event.target.closest("[data-track-id]");
    if (!row) return;
    state.draggedId = row.dataset.trackId;
    row.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.draggedId);
  }

  function handleDragOver(event) {
    event.preventDefault();
    const row = event.target.closest("[data-track-id]");
    if (!row || row.dataset.trackId === state.draggedId) return;
    clearDropIndicators();
    const rect = row.getBoundingClientRect();
    row.classList.add(event.clientY < rect.top + rect.height / 2 ? "is-drop-before" : "is-drop-after");
    event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(event) {
    event.preventDefault();
    const row = event.target.closest("[data-track-id]");
    const draggedRow = elements.fileList.querySelector(`[data-track-id="${state.draggedId}"]`);
    if (!row || !draggedRow || row === draggedRow) return;

    const rect = row.getBoundingClientRect();
    const insertBefore = event.clientY < rect.top + rect.height / 2;
    elements.fileList.insertBefore(draggedRow, insertBefore ? row : row.nextSibling);
    syncOrderFromDom();
  }

  function handleDragEnd() {
    const draggedRow = state.draggedId && elements.fileList.querySelector(`[data-track-id="${state.draggedId}"]`);
    draggedRow?.classList.remove("is-dragging");
    clearDropIndicators();
    syncOrderFromDom();
    render();
    state.draggedId = null;
  }

  function handleListClick(event) {
    const actionButton = event.target.closest("[data-action]");
    const row = event.target.closest("[data-track-id]");
    if (!actionButton || !row) return;
    const id = row.dataset.trackId;
    if (actionButton.dataset.action === "remove") removeTrack(id);
    if (actionButton.dataset.action === "up") moveTrack(id, -1);
    if (actionButton.dataset.action === "down") moveTrack(id, 1);
  }

  function handleListKeydown(event) {
    const row = event.target.closest("[data-track-id]");
    if (!row || !event.altKey) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveTrack(row.dataset.trackId, -1);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveTrack(row.dataset.trackId, 1);
    }
  }

  function yieldToBrowser() {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  async function mixTracks(buffers) {
    const sampleRate = Math.max(...buffers.map((buffer) => buffer.sampleRate));
    const channelCount = Math.max(...buffers.map((buffer) => buffer.numberOfChannels));
    const frameCounts = buffers.map((buffer) => Math.max(1, Math.round(buffer.length * sampleRate / buffer.sampleRate)));
    const totalFrames = frameCounts.reduce((sum, count) => sum + count, 0);
    const channels = Array.from({ length: channelCount }, () => new Float32Array(totalFrames));
    let offset = 0;

    for (let bufferIndex = 0; bufferIndex < buffers.length; bufferIndex += 1) {
      const buffer = buffers[bufferIndex];
      const outputFrames = frameCounts[bufferIndex];
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        const sourceChannel = channelIndex % buffer.numberOfChannels;
        const source = buffer.getChannelData(sourceChannel);
        const channel = channels[channelIndex];
        const ratio = buffer.sampleRate / sampleRate;

        for (let frame = 0; frame < outputFrames; frame += 1) {
          const sourcePosition = frame * ratio;
          const lower = Math.min(source.length - 1, Math.floor(sourcePosition));
          const upper = Math.min(source.length - 1, lower + 1);
          const mix = sourcePosition - lower;
          channel[offset + frame] = source[lower] * (1 - mix) + source[upper] * mix;
          if (frame > 0 && frame % 250000 === 0) await yieldToBrowser();
        }
      }
      offset += outputFrames;
      setStatus(`音声を結合しています… ${bufferIndex + 1} / ${buffers.length}`, "working");
      await yieldToBrowser();
    }

    return { channels, sampleRate };
  }

  function writeString(view, offset, value) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  function encodeWav(channels, sampleRate) {
    const channelCount = channels.length;
    const frameCount = channels[0]?.length || 0;
    const dataLength = frameCount * channelCount * 2;
    const wav = new ArrayBuffer(44 + dataLength);
    const view = new DataView(wav);

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channelCount * 2, true);
    view.setUint16(32, channelCount * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let frame = 0; frame < frameCount; frame += 1) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const sample = Math.max(-1, Math.min(1, channels[channel][frame]));
        const signedSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, signedSample, true);
        offset += 2;
      }
    }

    return new Blob([wav], { type: "audio/wav" });
  }

  function downloadBlob(blob) {
    const now = new Date();
    const stamp = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `joined-wav-${stamp}.wav`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function mergeAndDownload() {
    if (state.isProcessing) return;
    const tracks = getReadyTracks();
    if (tracks.length < 2 || tracks.length !== state.tracks.length) {
      setStatus("2つ以上のWAVファイルを追加してください。", "error");
      return;
    }

    state.isProcessing = true;
    updateMergeButton();
    setStatus("音声データを準備しています…", "working");

    try {
      await yieldToBrowser();
      const { channels, sampleRate } = await mixTracks(tracks.map((track) => track.audioBuffer));
      const blob = encodeWav(channels, sampleRate);
      downloadBlob(blob);
      setStatus(`結合完了。${formatDuration(getTotalDuration(), true)} のWAVをダウンロードしました。`, "success");
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "音声の結合に失敗しました。";
      setStatus(`結合できませんでした：${message}`, "error");
    } finally {
      state.isProcessing = false;
      updateMergeButton();
    }
  }

  elements.pickButton.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", (event) => {
    addFiles(event.target.files);
    event.target.value = "";
  });

  elements.dropZone.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    elements.fileInput.click();
  });
  elements.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      elements.fileInput.click();
    }
  });
  elements.dropZone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-dragover");
  });
  elements.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-dragover");
  });
  elements.dropZone.addEventListener("dragleave", (event) => {
    if (event.relatedTarget && elements.dropZone.contains(event.relatedTarget)) return;
    elements.dropZone.classList.remove("is-dragover");
  });
  elements.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-dragover");
    addFiles(event.dataTransfer.files);
  });

  elements.fileList.addEventListener("click", handleListClick);
  elements.fileList.addEventListener("keydown", handleListKeydown);
  elements.fileList.addEventListener("dragstart", handleDragStart);
  elements.fileList.addEventListener("dragover", handleDragOver);
  elements.fileList.addEventListener("drop", handleDrop);
  elements.fileList.addEventListener("dragend", handleDragEnd);
  elements.fileList.addEventListener("dragleave", (event) => {
    if (!event.target.closest("[data-track-id]")) clearDropIndicators();
  });
  elements.mergeButton.addEventListener("click", mergeAndDownload);

  render();
})();
