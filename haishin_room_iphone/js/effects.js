(function () {
  "use strict";

  const TWO_PI = Math.PI * 2;

  class CanvasEffect {
    constructor(canvas, readState) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: true });
      this.readState = readState;
      this.width = 1;
      this.height = 1;
      this.frame = 0;
      this.lastTime = performance.now();
      this.resize = this.resize.bind(this);
      this.tick = this.tick.bind(this);
      this.resize();
      if ("ResizeObserver" in window) {
        this.observer = new ResizeObserver(this.resize);
        this.observer.observe(canvas);
      } else {
        window.addEventListener("resize", this.resize, { passive: true });
      }
      this.frame = requestAnimationFrame(this.tick);
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.width = Math.max(1, rect.width);
      this.height = Math.max(1, rect.height);
      this.canvas.width = Math.max(1, Math.round(this.width * dpr));
      this.canvas.height = Math.max(1, Math.round(this.height * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.populate();
    }

    populate() {}
    draw() {}

    tick(now) {
      const delta = Math.min(2.5, Math.max(.1, (now - this.lastTime) / 16.667));
      this.lastTime = now;
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.draw(now, delta, this.readState());
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  class WeatherEffect extends CanvasEffect {
    populate() {
      this.rain = Array.from({ length: 92 }, () => ({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        speed: 6 + Math.random() * 10,
        length: 8 + Math.random() * 20,
        drift: 1 + Math.random() * 2,
      }));
      this.snow = Array.from({ length: 58 }, () => ({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        speed: .2 + Math.random() * .65,
        radius: .8 + Math.random() * 2.5,
        drift: .25 + Math.random() * .7,
        phase: Math.random() * TWO_PI,
      }));
    }

    draw(now, delta, state) {
      const ctx = this.ctx;
      if (state.outsideRainOn) {
        ctx.save();
        ctx.lineCap = "round";
        for (const drop of this.rain) {
          const gradient = ctx.createLinearGradient(drop.x, drop.y, drop.x + drop.drift, drop.y + drop.length);
          gradient.addColorStop(0, "rgba(186,220,240,0)");
          gradient.addColorStop(1, "rgba(214,237,250,.55)");
          ctx.strokeStyle = gradient;
          ctx.lineWidth = .55 + drop.length / 30;
          ctx.beginPath();
          ctx.moveTo(drop.x, drop.y);
          ctx.lineTo(drop.x + drop.drift, drop.y + drop.length);
          ctx.stroke();
          drop.x += drop.drift * .12 * delta;
          drop.y += drop.speed * delta;
          if (drop.y > this.height + 25) {
            drop.y = -30;
            drop.x = Math.random() * this.width;
          }
        }
        ctx.restore();
      }
      if (state.outsideSnowOn) {
        for (const flake of this.snow) {
          const sway = Math.sin(now * .0006 + flake.phase) * flake.drift;
          const glow = ctx.createRadialGradient(flake.x, flake.y, 0, flake.x, flake.y, flake.radius * 2.8);
          glow.addColorStop(0, "rgba(255,255,255,.9)");
          glow.addColorStop(.38, "rgba(235,247,255,.5)");
          glow.addColorStop(1, "rgba(235,247,255,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(flake.x, flake.y, flake.radius * 2.8, 0, TWO_PI);
          ctx.fill();
          flake.x += sway * .35 * delta;
          flake.y += flake.speed * delta;
          if (flake.y > this.height + 10) {
            flake.y = -10;
            flake.x = Math.random() * this.width;
          }
        }
      }
    }
  }

  class RainEffect extends CanvasEffect {
    populate() { this.drops = []; }

    makeDrop(state, moving) {
      const size = Number(state.dropSize) || 1;
      return {
        x: Math.random() * this.width,
        y: moving ? -15 : Math.random() * this.height * .68,
        r: (moving ? 2.8 + Math.random() * 5 : .8 + Math.random() * 2.6) * size,
        vx: (Math.random() - .5) * .08,
        vy: moving ? .55 + Math.random() * .8 : 0,
        moving,
        hold: 20 + Math.random() * 75,
        alpha: .35 + Math.random() * .55,
      };
    }

    drawDrop(drop) {
      const ctx = this.ctx;
      const gradient = ctx.createRadialGradient(drop.x - drop.r * .35, drop.y - drop.r * .5, drop.r * .1, drop.x, drop.y, drop.r * 1.35);
      gradient.addColorStop(0, `rgba(245,251,255,${.72 * drop.alpha})`);
      gradient.addColorStop(.3, `rgba(121,166,195,${.12 * drop.alpha})`);
      gradient.addColorStop(.76, `rgba(8,24,39,${.42 * drop.alpha})`);
      gradient.addColorStop(1, `rgba(235,249,255,${.5 * drop.alpha})`);
      ctx.beginPath();
      if (drop.moving) {
        ctx.moveTo(drop.x, drop.y - drop.r * 1.4);
        ctx.bezierCurveTo(drop.x + drop.r, drop.y - drop.r * .3, drop.x + drop.r, drop.y + drop.r, drop.x, drop.y + drop.r);
        ctx.bezierCurveTo(drop.x - drop.r, drop.y + drop.r, drop.x - drop.r, drop.y - drop.r * .3, drop.x, drop.y - drop.r * 1.4);
      } else {
        ctx.ellipse(drop.x, drop.y, drop.r, drop.r * 1.08, 0, 0, TWO_PI);
      }
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = `rgba(231,247,255,${.42 * drop.alpha})`;
      ctx.lineWidth = .55;
      ctx.stroke();
    }

    draw(now, delta, state) {
      if (!state.glassDropsOn) {
        this.drops.length = 0;
        return;
      }
      const density = Number(state.dropDensity) || 1;
      const target = 24 + density * 18;
      while (this.drops.length < target && Math.random() < .72) this.drops.push(this.makeDrop(state, false));
      const movingCount = this.drops.reduce((sum, drop) => sum + (drop.moving ? 1 : 0), 0);
      const movingTarget = state.continuousDrops ? 5 + density : 2;
      if (movingCount < movingTarget && Math.random() < (state.continuousDrops ? .16 : .025)) this.drops.push(this.makeDrop(state, true));
      for (const drop of this.drops) {
        if (drop.moving) {
          drop.hold -= delta;
          if (drop.hold < 0) {
            drop.vy += .02 * Math.max(2, drop.r) * delta;
          }
          drop.x += drop.vx * delta;
          drop.y += drop.vy * delta;
        }
        this.drawDrop(drop);
      }
      this.drops = this.drops.filter((drop) => drop.y < this.height + 25 && drop.x > -20 && drop.x < this.width + 20);
    }
  }

  class ParticleEffect extends CanvasEffect {
    populate() { this.particles = []; }

    spawn(state) {
      const active = [];
      if (state.neonOn) active.push({ x: .476 + Number(state.neonX) / 100, y: .828 + Number(state.neonY) / 100, color: "255,84,219" });
      if (state.lampOn) active.push({ x: .66 + Number(state.lampX) / 100, y: .729 + Number(state.lampY) / 100, color: "255,185,91" });
      if (state.keyboardOn) active.push({ x: .56, y: .79, color: "90,226,255" });
      if (!active.length) return;
      const source = active[Math.floor(Math.random() * active.length)];
      this.particles.push({
        x: source.x * this.width + (Math.random() - .5) * this.width * .2,
        y: source.y * this.height + (Math.random() - .5) * this.height * .14,
        vx: (Math.random() - .5) * .18,
        vy: -.08 - Math.random() * .22,
        radius: .5 + Math.random() * 1.45,
        alpha: .3 + Math.random() * .65,
        life: 40 + Math.random() * 100,
        color: source.color,
      });
    }

    draw(now, delta, state) {
      const speed = Number(state.neonSpeed) || 1;
      if (this.particles.length < 70 && Math.random() < .08 * speed) this.spawn(state);
      for (const particle of this.particles) {
        const glow = this.ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, particle.radius * 4);
        glow.addColorStop(0, `rgba(${particle.color},${particle.alpha})`);
        glow.addColorStop(.25, `rgba(${particle.color},${particle.alpha * .55})`);
        glow.addColorStop(1, `rgba(${particle.color},0)`);
        this.ctx.fillStyle = glow;
        this.ctx.beginPath();
        this.ctx.arc(particle.x, particle.y, particle.radius * 4, 0, TWO_PI);
        this.ctx.fill();
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.life -= delta;
        particle.alpha *= .994;
      }
      this.particles = this.particles.filter((particle) => particle.life > 0 && particle.alpha > .03);
    }
  }

  window.RoomEffects = {
    start(canvases, readState) {
      return [
        new WeatherEffect(canvases.weather, readState),
        new RainEffect(canvases.rain, readState),
        new ParticleEffect(canvases.particles, readState),
      ];
    },
  };
})();
