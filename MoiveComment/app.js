(() => {
  "use strict";

  const STORAGE_KEY = "flow-comment.comments.v1";
  const FLOW_SECONDS = 6;
  const $ = (selector) => document.querySelector(selector);

  const dropZone = $("#dropZone");
  const videoInput = $("#videoInput");
  const workspace = $("#workspace");
  const video = $("#video");
  const stage = $("#stage");
  const overlay = $("#overlay");
  const commentInput = $("#commentInput");
  const colorInput = $("#colorInput");
  const commentList = $("#commentList");
  const commentCount = $("#commentCount");
  const importInput = $("#importInput");
  const status = $("#status");
  const clearButton = $("#clearButton");
  const downloadVideoButton = $("#downloadVideoButton");

  let comments = loadStoredComments();
  let videoUrl = null;
  let animationFrame = null;
  let isRendering = false;

  function loadStoredComments() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return validateComments(value);
    } catch {
      return [];
    }
  }

  function validateComments(value) {
    if (!Array.isArray(value)) throw new Error("コメントデータが配列ではありません。");
    return value.map((item, index) => {
      if (!item || !Number.isFinite(Number(item.time)) || typeof item.text !== "string") {
        throw new Error(`${index + 1}件目のコメント形式が正しくありません。`);
      }
      const color = /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : "#ffffff";
      return {
        id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
        time: Math.max(0, Number(item.time)),
        text: item.text.slice(0, 120),
        color
      };
    }).filter((item) => item.text.trim());
  }

  function persist(showMessage = false) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(comments));
    if (showMessage) setStatus("コメントをブラウザストレージに保存しました。");
  }

  function setStatus(message) {
    status.textContent = message;
  }

  function formatTime(seconds) {
    const value = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const secs = value % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${minutes}:${String(secs).padStart(2, "0")}`;
  }

  function renderCommentList() {
    commentList.replaceChildren();
    commentCount.textContent = String(comments.length);
    clearButton.disabled = comments.length === 0;
    if (!comments.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "まだコメントはありません";
      commentList.append(empty);
      return;
    }

    [...comments].sort((a, b) => a.time - b.time).forEach((comment) => {
      const item = document.createElement("div");
      item.className = "comment-item";

      const timeButton = document.createElement("button");
      timeButton.className = "time-button";
      timeButton.type = "button";
      timeButton.textContent = formatTime(comment.time);
      timeButton.title = "この位置へ移動";
      timeButton.addEventListener("click", () => { video.currentTime = comment.time; });

      const text = document.createElement("span");
      text.className = "comment-text";
      text.textContent = comment.text;
      text.style.color = comment.color;

      const remove = document.createElement("button");
      remove.className = "delete-button";
      remove.type = "button";
      remove.textContent = "×";
      remove.title = "削除";
      remove.addEventListener("click", () => {
        comments = comments.filter((entry) => entry.id !== comment.id);
        persist();
        renderCommentList();
      });

      item.append(timeButton, text, remove);
      commentList.append(item);
    });
  }

  function openVideo(file) {
    if (!file || !file.type.startsWith("video/")) {
      setStatus("動画ファイルを選択してください。");
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    video.src = videoUrl;
    downloadVideoButton.disabled = true;
    workspace.classList.remove("is-hidden");
    dropZone.classList.add("is-hidden");
    setStatus(`${file.name} を読み込みました。`);
    video.addEventListener("loadedmetadata", () => {
      resizeOverlay();
      downloadVideoButton.disabled = false;
    }, { once: true });
  }

  function addComment() {
    const text = commentInput.value.trim();
    if (!video.src) return setStatus("先に動画を読み込んでください。");
    if (!text) return;
    comments.push({ id: crypto.randomUUID(), time: video.currentTime, text, color: colorInput.value });
    comments.sort((a, b) => a.time - b.time);
    persist();
    renderCommentList();
    commentInput.value = "";
    commentInput.focus();
    setStatus(`${formatTime(video.currentTime)} にコメントを追加しました。`);
  }

  function resizeOverlay() {
    const rect = stage.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    overlay.width = Math.max(1, Math.round(rect.width * ratio));
    overlay.height = Math.max(1, Math.round(rect.height * ratio));
    drawOverlay(overlay.getContext("2d"), video.currentTime, overlay.width, overlay.height, ratio);
  }

  function drawOverlay(context, time, width, height, scale = 1, includeVideo = false) {
    context.clearRect(0, 0, width, height);
    if (includeVideo) context.drawImage(video, 0, 0, width, height);
    const fontSize = Math.max(20 * scale, height * 0.048);
    context.font = `700 ${fontSize}px "Noto Sans JP", sans-serif`;
    context.textBaseline = "top";
    context.lineJoin = "round";

    comments.forEach((comment, index) => {
      if (time < comment.time || time >= comment.time + FLOW_SECONDS) return;
      const progress = (time - comment.time) / FLOW_SECONDS;
      const textWidth = context.measureText(comment.text).width;
      const x = width - progress * (width + textWidth);
      const laneCount = Math.max(1, Math.floor((height * .72) / (fontSize * 1.35)));
      const y = (index % laneCount) * fontSize * 1.35 + height * .06;
      context.lineWidth = Math.max(2, fontSize * .11);
      context.strokeStyle = "rgba(0, 0, 0, .8)";
      context.strokeText(comment.text, x, y);
      context.fillStyle = comment.color;
      context.fillText(comment.text, x, y);
    });
  }

  function animate() {
    drawOverlay(overlay.getContext("2d"), video.currentTime, overlay.width, overlay.height, window.devicePixelRatio || 1);
    animationFrame = requestAnimationFrame(animate);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function renderVideo() {
    if (!video.src || isRendering) return;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      return setStatus("このブラウザは動画書き出しに対応していません。Chrome / Edge をお試しください。");
    }

    isRendering = true;
    downloadVideoButton.disabled = true;
    const originalTime = video.currentTime;
    const wasPaused = video.paused;
    const renderCanvas = document.createElement("canvas");
    renderCanvas.width = video.videoWidth;
    renderCanvas.height = video.videoHeight;
    const context = renderCanvas.getContext("2d");
    const canvasStream = renderCanvas.captureStream(30);
    let sourceStream = null;
    const capture = video.captureStream || video.mozCaptureStream;
    if (capture) sourceStream = capture.call(video);
    const tracks = [...canvasStream.getVideoTracks(), ...(sourceStream ? sourceStream.getAudioTracks() : [])];
    const outputStream = new MediaStream(tracks);
    const mimeTypes = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
    const recorder = new MediaRecorder(outputStream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined);
    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });

    try {
      video.pause();
      video.currentTime = 0;
      await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true }));
      recorder.start(1000);
      await video.play();

      await new Promise((resolve, reject) => {
        let raf;
        const draw = () => {
          drawOverlay(context, video.currentTime, renderCanvas.width, renderCanvas.height, 1, true);
          const percent = video.duration ? Math.min(100, video.currentTime / video.duration * 100) : 0;
          setStatus(`動画を書き出しています… ${percent.toFixed(0)}%（再生時間と同じだけかかります）`);
          if (video.ended) return resolve();
          raf = requestAnimationFrame(draw);
        };
        recorder.addEventListener("error", (event) => { cancelAnimationFrame(raf); reject(event.error); }, { once: true });
        draw();
      });

      recorder.stop();
      await new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
      downloadBlob(new Blob(chunks, { type: recorder.mimeType || "video/webm" }), "commented-video.webm");
      setStatus("コメント付き動画を書き出しました。");
    } catch (error) {
      console.error(error);
      if (recorder.state !== "inactive") recorder.stop();
      setStatus("動画の書き出しに失敗しました。別の動画形式または Chrome / Edge でお試しください。");
    } finally {
      outputStream.getTracks().forEach((track) => track.stop());
      video.currentTime = Math.min(originalTime, video.duration || originalTime);
      if (!wasPaused) video.play().catch(() => {});
      isRendering = false;
      downloadVideoButton.disabled = false;
    }
  }

  dropZone.addEventListener("click", () => videoInput.click());
  dropZone.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") videoInput.click(); });
  videoInput.addEventListener("change", () => openVideo(videoInput.files[0]));
  ["dragenter", "dragover"].forEach((name) => dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  }));
  ["dragleave", "drop"].forEach((name) => dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  }));
  dropZone.addEventListener("drop", (event) => openVideo(event.dataTransfer.files[0]));
  $("#addButton").addEventListener("click", addComment);
  commentInput.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.isComposing) addComment(); });
  $("#saveButton").addEventListener("click", () => persist(true));
  clearButton.addEventListener("click", () => {
    if (!comments.length) return;
    const confirmed = window.confirm(`${comments.length}件のコメントをすべて削除します。この操作は元に戻せません。`);
    if (!confirmed) return;
    comments = [];
    persist();
    renderCommentList();
    resizeOverlay();
    setStatus("すべてのコメントを削除しました。");
  });
  $("#exportButton").addEventListener("click", () => {
    const payload = { format: "flow-comment", version: 1, exportedAt: new Date().toISOString(), comments };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "flow-comments.json");
    setStatus("コメントJSONをエクスポートしました。");
  });
  $("#importButton").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    try {
      const data = JSON.parse(await importInput.files[0].text());
      comments = validateComments(Array.isArray(data) ? data : data.comments);
      persist();
      renderCommentList();
      setStatus(`${comments.length}件のコメントをインポートしました。`);
    } catch (error) {
      setStatus(`インポートできませんでした: ${error.message}`);
    } finally {
      importInput.value = "";
    }
  });
  downloadVideoButton.addEventListener("click", renderVideo);
  window.addEventListener("resize", resizeOverlay);
  video.addEventListener("play", () => { if (!animationFrame) animate(); });
  video.addEventListener("pause", () => { cancelAnimationFrame(animationFrame); animationFrame = null; resizeOverlay(); });
  video.addEventListener("seeked", resizeOverlay);
  window.addEventListener("beforeunload", () => { if (videoUrl) URL.revokeObjectURL(videoUrl); });

  renderCommentList();
})();
