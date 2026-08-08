(() => {
  "use strict";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const scenes = Array.from(document.querySelectorAll("[data-scroll-scene]")).map((section) => ({
    section,
    video: section.querySelector("video"),
    shell: section.querySelector(".video-shell"),
    bar: section.querySelector(".scene-progress span"),
    progress: section.querySelector(".scene-progress"),
    label: section.querySelector(".progress-label b"),
    stagePercent: section.querySelector(".stage-percent"),
    marker: section.querySelector(".side-marker i"),
    target: 0,
    duration: 0,
    shownPercent: -1,
    primed: false,
    objectUrl: null,
  }));

  let scrollFrame = 0;
  let priming = false;

  scenes.forEach((scene) => {
    scene.video.muted = true;
    scene.video.defaultMuted = true;
    scene.video.setAttribute("playsinline", "");
    scene.video.setAttribute("webkit-playsinline", "");
  });

  if (isIOS) document.documentElement.classList.add("ios-video");

  function seekToScrollPosition(scene) {
    if (!scene.duration || scene.video.seeking) return;

    const targetTime = scene.target * Math.max(scene.duration - 0.04, 0);
    if (Math.abs(scene.video.currentTime - targetTime) > 0.012) {
      scene.video.currentTime = targetTime;
    }
  }

  function updateScrollPositions() {
    scrollFrame = 0;

    scenes.forEach((scene) => {
      const rect = scene.section.getBoundingClientRect();
      const scrollable = Math.max(scene.section.offsetHeight - window.innerHeight, 1);
      const progress = clamp(-rect.top / scrollable, 0, 1);
      const percent = Math.round(progress * 100);
      scene.target = progress;

      if (percent === scene.shownPercent) return;
      scene.shownPercent = percent;
      scene.bar.style.width = `${percent}%`;
      scene.progress.setAttribute("aria-valuenow", String(percent));
      scene.label.textContent = String(percent).padStart(3, "0");
      scene.stagePercent.textContent = `${percent}%`;
      scene.marker.style.height = `${Math.max(percent, 4)}%`;
      seekToScrollPosition(scene);
    });
  }

  function requestScrollUpdate() {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateScrollPositions);
  }

  async function prepareIOSVideos() {
    if (!isIOS) return;

    await Promise.all(scenes.map(async (scene) => {
      const source = scene.video.getAttribute("src");
      if (!source) return;

      try {
        const response = await fetch(source, { cache: "force-cache" });
        if (!response.ok) return;
        const sourceBlob = await response.blob();
        const videoBlob = sourceBlob.type === "video/mp4"
          ? sourceBlob
          : new Blob([sourceBlob], { type: "video/mp4" });
        scene.objectUrl = URL.createObjectURL(videoBlob);
        scene.video.src = scene.objectUrl;
        scene.video.load();
      } catch {
        // 通常のMP4 URLをそのまま利用する。
      }
    }));
  }

  function primeVideosFromGesture() {
    if (!isIOS || priming || scenes.every((scene) => scene.primed)) return;
    priming = true;

    const attempts = scenes.map((scene) => {
      if (scene.primed) return Promise.resolve(true);

      const playResult = scene.video.play();
      return Promise.resolve(playResult)
        .then(() => {
          scene.video.pause();
          scene.primed = true;
          seekToScrollPosition(scene);
          return true;
        })
        .catch(() => false);
    });

    Promise.all(attempts).then((results) => {
      priming = false;
      if (results.every(Boolean)) {
        document.documentElement.classList.add("video-unlocked");
      }
    });
  }

  scenes.forEach((scene) => {
    const setDuration = () => {
      scene.duration = Number.isFinite(scene.video.duration) ? scene.video.duration : 0;
      updateScrollPositions();
      seekToScrollPosition(scene);
    };

    if (scene.video.readyState >= 1) setDuration();
    scene.video.addEventListener("loadedmetadata", setDuration);
    scene.video.addEventListener("seeked", () => {
      scene.shell.classList.add("has-video-frame");
      seekToScrollPosition(scene);
    });
  });

  window.addEventListener("scroll", requestScrollUpdate, { passive: true });
  window.addEventListener("resize", requestScrollUpdate);
  window.addEventListener("touchstart", primeVideosFromGesture, { passive: true });
  window.addEventListener("pointerdown", primeVideosFromGesture, { passive: true });
  window.addEventListener("pagehide", () => {
    scenes.forEach((scene) => {
      if (scene.objectUrl) URL.revokeObjectURL(scene.objectUrl);
    });
  }, { once: true });

  prepareIOSVideos();
  updateScrollPositions();
})();
