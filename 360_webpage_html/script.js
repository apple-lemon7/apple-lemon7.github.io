(() => {
  "use strict";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const scenes = Array.from(document.querySelectorAll("[data-scroll-scene]")).map((section) => ({
    section,
    video: section.querySelector("video"),
    bar: section.querySelector(".scene-progress span"),
    progress: section.querySelector(".scene-progress"),
    label: section.querySelector(".progress-label b"),
    stagePercent: section.querySelector(".stage-percent"),
    marker: section.querySelector(".side-marker i"),
    target: 0,
    duration: 0,
    shownPercent: -1,
  }));

  let scrollFrame = 0;

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

  scenes.forEach((scene) => {
    const setDuration = () => {
      scene.duration = Number.isFinite(scene.video.duration) ? scene.video.duration : 0;
      updateScrollPositions();
      seekToScrollPosition(scene);
    };

    if (scene.video.readyState >= 1) setDuration();
    scene.video.addEventListener("loadedmetadata", setDuration);
    scene.video.addEventListener("seeked", () => seekToScrollPosition(scene));
  });

  window.addEventListener("scroll", requestScrollUpdate, { passive: true });
  window.addEventListener("resize", requestScrollUpdate);
  updateScrollPositions();
})();
