// Dew — condensation engine
// Layered canvas renderer with droplet physics, fog mask, and re-fogging.

const { useEffect, useRef, useState, useCallback } = React;

function createDroplet(x, y, r, opts = {}) {
  const lobes = 10 + Math.floor(Math.random() * 4);
  const shape = new Array(lobes);
  for (let i = 0; i < lobes; i++) {
    shape[i] = 0.75 + Math.random() * 0.5;
  }
  return {
    id: Math.random().toString(36).slice(2),
    x, y, r,
    vy: 0, vx: 0,
    pinned: opts.pinned ?? false,
    age: 0,
    trail: [],
    sliding: false,
    seed: Math.random(),
    wob: Math.random() * Math.PI * 2,
    shape,
    rot: Math.random() * Math.PI * 2,
    aspect: 0.55 + Math.random() * 0.9,
  };
}

function hash2(ix, iy, seed) {
  let h = ix * 374761393 + iy * 668265263 + seed * 1442695040888963407;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 10000) / 10000;
}
function smoothNoise2D(x, y, scale, seed) {
  const sx = x / scale, sy = y / scale;
  const ix = Math.floor(sx), iy = Math.floor(sy);
  const fx = sx - ix, fy = sy - iy;
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}
function fbm2D(x, y, seed) {
  return (
    smoothNoise2D(x, y, 280, seed) * 0.55 +
    smoothNoise2D(x, y, 110, seed + 17) * 0.30 +
    smoothNoise2D(x, y, 40, seed + 41) * 0.15
  );
}

// CHANGE 1: expanded size range with tiers that produce genuine variety
function sampleRadius(sizeBias, rng = Math.random) {
  const u = rng();
  let r;
  if (u < 0.60)      r = 0.3 + rng() * 1.2;
  else if (u < 0.82) r = 1.5 + rng() * 2.0;
  else if (u < 0.94) r = 3.5 + rng() * 2.0;
  else               r = 5.5 + rng() * 1.5;
  return r * sizeBias;
}

// CHANGE 2: grid-jittered spawn, hard cap below slideThreshold
function spawnAmbient(droplets, w, h, density, sizeBias, slideThreshold) {
  droplets.length = 0;
  const maxR = (slideThreshold ?? 8) * 0.82;
  const isMobile = window.innerWidth < 768;
  const cellSize = isMobile ? 24 : 13;
  const cols = Math.ceil(w / cellSize);
  const rows = Math.ceil(h / cellSize);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (Math.random() > density / 15) continue;
      const x = col * cellSize + Math.random() * cellSize;
      const y = row * cellSize + Math.random() * cellSize;
      const r = Math.min(sampleRadius(sizeBias), maxR);
      droplets.push(createDroplet(x, y, r, { pinned: true }));
    }
  }
}

function CondensationEngine({ tweaks, scene, onCapture, registerCaptureRef }) {
  const wrapRef = useRef(null);
  const sceneCanvasRef = useRef(null);
  const fogCanvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const dropCanvasRef = useRef(null);
  const compositeRef = useRef(null);

  const stateRef = useRef({
    droplets: [],
    pointer: { down: false, x: 0, y: 0, lx: 0, ly: 0, mode: 'wipe' },
    tilt: { x: 0, y: 0 },
    size: { w: 0, h: 0 },
    lastT: 0,
    refogClock: 0,
  });

  const tweaksRef = useRef(tweaks);
  useEffect(() => { tweaksRef.current = tweaks; }, [tweaks]);

  const sceneRef = useRef(scene);
  useEffect(() => { sceneRef.current = scene; }, [scene]);

  const paintSceneAndFog = useCallback(() => {
    const sc = sceneCanvasRef.current;
    const fc = fogCanvasRef.current;
    if (!sc || !fc) return;
    const { w, h } = stateRef.current.size;
    if (!w || !h) return;
    const sx = sc.getContext('2d');
    const fx = fc.getContext('2d');
    sx.clearRect(0, 0, w, h);
    fx.clearRect(0, 0, w, h);

    const s = sceneRef.current;
    if (s.kind === 'gradient') {
      const g = sx.createLinearGradient(0, 0, 0, h);
      s.stops.forEach(([t, c]) => g.addColorStop(t, c));
      sx.fillStyle = g;
      sx.fillRect(0, 0, w, h);
      sx.globalAlpha = 0.08;
      for (let i = 0; i < 80; i++) {
        sx.fillStyle = `hsla(${(s.hueAccent ?? 220) + Math.random() * 40},30%,70%,0.4)`;
        sx.beginPath();
        sx.arc(Math.random() * w, Math.random() * h, 40 + Math.random() * 200, 0, Math.PI * 2);
        sx.fill();
      }
      sx.globalAlpha = 1;
    } else if (s.kind === 'image' && s.img) {
      const ir = s.img.width / s.img.height;
      const cr = w / h;
      let dw, dh, dx, dy;
      if (ir > cr) { dh = h; dw = h * ir; dx = (w - dw) / 2; dy = 0; }
      else { dw = w; dh = w / ir; dx = 0; dy = (h - dh) / 2; }
      sx.drawImage(s.img, dx, dy, dw, dh);
    } else if (s.kind === 'video' && s.video) {
      const v = s.video;
      if (v.videoWidth) {
        const ir = v.videoWidth / v.videoHeight;
        const cr = w / h;
        let dw, dh, dx, dy;
        if (ir > cr) { dh = h; dw = h * ir; dx = (w - dw) / 2; dy = 0; }
        else { dw = w; dh = w / ir; dx = 0; dy = (h - dh) / 2; }
        if (s.mirror) {
          sx.save(); sx.translate(w, 0); sx.scale(-1, 1);
          sx.drawImage(v, w - dx - dw, dy, dw, dh);
          sx.restore();
        } else {
          sx.drawImage(v, dx, dy, dw, dh);
        }
      }
    }

    const tint = tweaksRef.current.tint;
    const tintAmt = tweaksRef.current.tintAmount;
    if (tintAmt > 0) {
      sx.fillStyle = tint;
      sx.globalAlpha = tintAmt;
      sx.fillRect(0, 0, w, h);
      sx.globalAlpha = 1;
    }

    fx.filter = `blur(${20 + tweaksRef.current.fogBlur}px) saturate(0.5) brightness(1.15)`;
    fx.drawImage(sc, 0, 0);
    fx.filter = 'none';

    fx.fillStyle = `rgba(210, 222, 232, ${0.35 + tweaksRef.current.fogDensity * 0.35})`;
    fx.fillRect(0, 0, w, h);

    const tw = tweaksRef.current;
    const variation = tw.mistVariation ?? 0.4;
    if (variation > 0.01) {
      const cellW = 64;
      const cols = Math.ceil(w / cellW);
      const rows = Math.ceil(h / cellW);
      if (!stateRef.current.mistTmp) stateRef.current.mistTmp = document.createElement('canvas');
      const mt = stateRef.current.mistTmp;
      mt.width = cols; mt.height = rows;
      const mtx = mt.getContext('2d');
      const mistSeed = stateRef.current.mistSeed ?? (stateRef.current.mistSeed = Math.floor(Math.random() * 1000));
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const x = cx * cellW + cellW / 2;
          const y = cy * cellW + cellW / 2;
          const n = fbm2D(x, y, mistSeed);
          const heightBias = 1.0 - (y / h) * 0.4;
          const a = Math.max(0, Math.min(0.85, (n - 0.35) * 2.8 * variation * heightBias));
          mtx.fillStyle = `rgba(255,253,250,${a})`;
          mtx.fillRect(cx, cy, 1, 1);
        }
      }
      fx.save();
      fx.filter = `blur(${cellW * 0.6}px)`;
      fx.imageSmoothingEnabled = true;
      fx.drawImage(mt, 0, 0, w, h);
      fx.filter = 'none';
      fx.restore();
    }

    const stippleSeed = (stateRef.current.stippleSeed ?? (stateRef.current.stippleSeed = Math.floor(Math.random() * 1000)));
    const stippleCount = Math.floor((w * h) / 600);
    fx.globalAlpha = 0.18;
    let placed = 0, attempts = 0;
    while (placed < stippleCount && attempts < stippleCount * 3) {
      attempts++;
      const x = Math.random() * w;
      const y = Math.random() * h;
      const local = fbm2D(x, y, stippleSeed);
      const heightBias = 1.0 - (y / h) * 0.3;
      if (Math.random() > local * 1.4 * heightBias) continue;
      placed++;
      const sz = Math.random() < 0.85 ? 0.5 : 1.2;
      fx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.8)' : 'rgba(180,200,220,0.6)';
      fx.beginPath();
      fx.arc(x, y, sz, 0, Math.PI * 2);
      fx.fill();
    }
    fx.globalAlpha = 1;
  }, []);

  const initMask = useCallback(() => {
    const m = maskCanvasRef.current;
    if (!m) return;
    const { w, h } = stateRef.current.size;
    const ctx = m.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
  }, []);

  const wipeAt = useCallback((x, y, brushR, hardness = 1) => {
    const m = maskCanvasRef.current;
    if (!m) return;
    const ctx = m.getContext('2d');
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const grad = ctx.createRadialGradient(x, y, 0, x, y, brushR);
    grad.addColorStop(0, `rgba(0,0,0,${hardness})`);
    grad.addColorStop(0.7, `rgba(0,0,0,${hardness * 0.7})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, brushR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, []);

  const sweepAndAccumulate = useCallback((x1, y1, x2, y2, brushR) => {
    const tw = tweaksRef.current;
    const droplets = stateRef.current.droplets;
    const dx = x2 - x1, dy = y2 - y1;
    const segLen2 = dx * dx + dy * dy;
    let absorbedVolume = 0;
    let lastBrushX = x2, lastBrushY = y2;
    if (segLen2 > 0.5) {
      for (let i = droplets.length - 1; i >= 0; i--) {
        const d = droplets[i];
        const t = Math.max(0, Math.min(1, ((d.x - x1) * dx + (d.y - y1) * dy) / segLen2));
        const px = x1 + dx * t;
        const py = y1 + dy * t;
        const distSq = (d.x - px) * (d.x - px) + (d.y - py) * (d.y - py);
        const r = brushR + d.r;
        if (distSq < r * r) {
          absorbedVolume += d.r * d.r;
          droplets.splice(i, 1);
        }
      }
    }
    if (!stateRef.current.reservoir) stateRef.current.reservoir = null;
    let res = stateRef.current.reservoir;
    const swipeDist = Math.sqrt(segLen2);
    const buildup = tw.wipeBuildup ?? 1.0;
    const displaced = swipeDist * brushR * 0.0012 * buildup;
    const totalVolume = absorbedVolume + displaced;
    if (totalVolume > 0.02) {
      if (!res || res.brokenAt && performance.now() - res.brokenAt > 220) {
        res = {
          x: lastBrushX,
          y: lastBrushY + brushR * 0.15,
          mass: 0, brushR,
          createdAt: performance.now(),
          brokenAt: 0,
        };
        stateRef.current.reservoir = res;
      }
      res.x = res.x * 0.7 + lastBrushX * 0.3;
      res.y = res.y * 0.7 + (lastBrushY + brushR * 0.15) * 0.3;
      res.mass += totalVolume;
      res.brushR = brushR;
    }
    if (res && res.mass > 4) {
      const releaseChance = Math.min(0.5, (res.mass - 4) * 0.04);
      if (Math.random() < releaseChance) {
        const consumed = Math.min(res.mass, 8 + Math.random() * 18);
        // CHANGE 3: cap reservoir drops below slideThreshold
        const slideThresh = tw.slideThreshold ?? 8;
        const r = Math.min(slideThresh * 0.85, Math.sqrt(consumed) * 1.1) * (tw.dropSize ?? 1) * 0.7;
        if (r > 1.5) {
          const px = res.x + (Math.random() - 0.5) * res.brushR * 1.2;
          const py = res.y + (Math.random() - 0.3) * res.brushR * 0.4;
          const d = createDroplet(px, py, r, { pinned: false });
          d.sliding = true;
          d.vy = 0.4 + Math.random() * 0.6;
          d.vx = (Math.random() - 0.5) * 0.3;
          droplets.push(d);
          res.mass -= consumed;
          if (res.mass < 1) res.brokenAt = performance.now();
        }
      }
    }
  }, []);

  const wipeLine = useCallback((x1, y1, x2, y2, brushR) => {
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / (brushR * 0.15)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      wipeAt(x1 + dx * t, y1 + dy * t, brushR, 0.85);
    }
  }, [wipeAt]);

  const refogStep = useCallback((dt) => {
    const tw = tweaksRef.current;
    const speed = tw.refogSpeed;
    if (speed <= 0) return;
    const m = maskCanvasRef.current;
    if (!m) return;
    const ctx = m.getContext('2d');
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(255,255,255,${0.008 * speed * dt * 60})`;
    ctx.fillRect(0, 0, stateRef.current.size.w, stateRef.current.size.h);
    ctx.restore();
  }, []);

  const drawDroplets = useCallback(() => {
    const dc = dropCanvasRef.current;
    const sc = sceneCanvasRef.current;
    if (!dc || !sc) return;
    const { w, h } = stateRef.current.size;
    const ctx = dc.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const droplets = stateRef.current.droplets;

    for (const d of droplets) {
      const r = d.r;
      if (r < 0.1) continue;

      if (r < 2.2) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,0.55)`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(d.x - r * 0.3, d.y - r * 0.3, r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();
        continue;
      }

      ctx.save();
      const vel = Math.hypot(d.vx ?? 0, d.vy ?? 0);
      const drawAngle = (d.sliding && vel > 0.1)
        ? Math.atan2(d.vy ?? 0, d.vx ?? 0) - Math.PI / 2
        : 0;
      ctx.translate(d.x, d.y);
      ctx.rotate(drawAngle);
      ctx.scale(1, d.sliding ? 1.5 : 1);

      // Build clip path in local (origin-relative) coordinates
      ctx.beginPath();
      if (d.sliding) {
        // Teardrop: tip at top, bulge at bottom
        ctx.moveTo(0, -r * 1.6);
        ctx.bezierCurveTo( r * 1.1, -r * 0.4,  r * 1.1,  r * 0.6, 0,  r * 1.0);
        ctx.bezierCurveTo(-r * 1.1,  r * 0.6, -r * 1.1, -r * 0.4, 0, -r * 1.6);
      } else {
        // Organic blob
        const shape = d.shape;
        const lobes = shape.length;
        const pts = [];
        for (let i = 0; i < lobes; i++) {
          const a = (i / lobes) * Math.PI * 2 + d.rot;
          const rr = r * shape[i];
          pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
        }
        const m0 = { x: (pts[0].x + pts[lobes-1].x) / 2, y: (pts[0].y + pts[lobes-1].y) / 2 };
        ctx.moveTo(m0.x, m0.y);
        for (let i = 0; i < lobes; i++) {
          const cur = pts[i];
          const next = pts[(i+1) % lobes];
          const mid = { x: (cur.x + next.x) / 2, y: (cur.y + next.y) / 2 };
          ctx.quadraticCurveTo(cur.x, cur.y, mid.x, mid.y);
        }
      }
      ctx.closePath();
      ctx.clip();

      // Refraction: sample scene in world space, draw into local space
      const mag = 1.5;
      const sxBox = d.x - r / mag;
      const syBox = d.y - r / mag + r * 0.15;
      const sBox = (r * 2) / mag;
      ctx.save();
      ctx.scale(1, -1);
      ctx.drawImage(sc, sxBox, syBox, sBox, sBox, -r, -r, r * 2, r * 2);
      ctx.restore();

      // Specular highlight (local coords)
      const hox = -(0.2 + d.seed * 0.3) * r;
      const hoy = -(0.2 + d.seed * 0.35) * r;
      const hrx = r * (0.25 + d.seed * 0.3);
      const hry = r * (0.15 + ((d.seed * 137) % 1) * 0.25);
      const maxHR = Math.max(hrx, hry);
      const spec = ctx.createRadialGradient(hox, hoy, 0, hox, hoy, maxHR);
      spec.addColorStop(0, 'rgba(255,255,255,0.85)');
      spec.addColorStop(0.5, 'rgba(255,255,255,0.25)');
      spec.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.translate(hox, hoy);
      ctx.scale(hrx / maxHR, hry / maxHR);
      ctx.translate(-hox, -hoy);
      ctx.fillStyle = spec;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();

      // Contact shadow (local coords)
      ctx.beginPath();
      ctx.ellipse(0, r * 0.7, r * 0.6, r * 0.18, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fill();

      ctx.restore();

      // Merge pulse ring
      if (d.mergeT) {
        const age = (performance.now() - d.mergeT) / 300;
        if (age < 1) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, r * (1.1 + age * 0.5), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(180,200,220,${0.5 * (1 - age)})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      ctx.beginPath();
      ctx.arc(d.x + 1, d.y + 2, r * 1.05, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(40,55,70,0.18)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }, []);

  const step = useCallback((dt) => {
    const tw = tweaksRef.current;
    const { w, h } = stateRef.current.size;
    const droplets = stateRef.current.droplets;
    const tilt = stateRef.current.tilt;
    const gravityDir = tw.tiltEnabled
      ? {
          x: tilt.x * 2.0 + (tw.gravityX ?? 0),
          y: Math.max(-1, 1 - Math.abs(tilt.x) * 1.8) * (tilt.y < -0.3 ? -1 : 1),
        }
      : {
          x: tw.gravityX ?? 0,
          y: 1,
        };
    if (!window._glog || performance.now() - window._glog > 1000) {
      window._glog = performance.now();
      console.log('tiltEnabled:', tw.tiltEnabled, 'gravityDir.y:', gravityDir.y.toFixed(3));
    }
    const slideThresh = tw.slideThreshold;

    for (let i = 0; i < droplets.length; i++) {
      const d = droplets[i];
      d.age += dt;
      d.wob += dt * 0.5;
      const shouldSlide = d.r >= slideThresh && !d.pinned;
      if (shouldSlide) d.sliding = true;

      if (d.sliding) {
        const g = tw.gravity * (0.4 + d.r / 8);
        d.vy += g * gravityDir.y * dt * 60;
        d.vx += g * gravityDir.x * dt * 60 * 4.0;
        d.vy *= 0.96;
        d.vx *= 0.80;
        // CHANGE 4: near-zero horizontal jitter for smooth vertical trails
        if (!d._wx) d._wx = 0;
        d._wx = d._wx * 0.85 + (Math.random() - 0.5) * 0.08;
        d.vx += d._wx;
        const nx = d.x + d.vx * dt * 60;
        const ny = d.y + d.vy * dt * 60;

        if (Math.abs(ny - d.y) > 0.3 || Math.abs(nx - d.x) > 0.3) {
          // CHANGE 5: trail width proportional to drop, continuous coverage
          const trailR = Math.max(1.5, d.r * 0.42);
          wipeLine(d.x, d.y, nx, ny, trailR);
        }

        if (!d.trail) d.trail = [];
        d.trail.push({ x: d.x, y: d.y });
        if (d.trail.length > 40) d.trail.shift();
        d.x = nx;
        d.y = ny;

        if (d.y > h + d.r || d.y < -d.r || d.x < -d.r || d.x > w + d.r) {
          droplets.splice(i, 1);
          i--;
          continue;
        }
      }
    }

    // Merge droplets — grid-bucketed so only nearby drops checked
    const bucketSize = 24;
    const buckets = {};
    for (let i = 0; i < droplets.length; i++) {
      const d = droplets[i];
      const bx = Math.floor(d.x / bucketSize);
      const by = Math.floor(d.y / bucketSize);
      const key = bx + ',' + by;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(i);
    }
    const merged = new Uint8Array(droplets.length);
    for (const key in buckets) {
      const [bx, by] = key.split(',').map(Number);
      const neighbors = [];
      for (let nx = bx - 1; nx <= bx + 1; nx++)
        for (let ny = by - 1; ny <= by + 1; ny++) {
          const nk = nx + ',' + ny;
          if (buckets[nk]) neighbors.push(...buckets[nk]);
        }
      const cell = buckets[key];
      for (let ci = 0; ci < cell.length; ci++) {
        const i = cell[ci];
        if (merged[i]) continue;
        const a = droplets[i];
        for (let ni = 0; ni < neighbors.length; ni++) {
          const j = neighbors[ni];
          if (j <= i || merged[j]) continue;
          const b = droplets[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const rr = a.r + b.r;
          if (dx * dx + dy * dy < rr * rr) {
            const newR = Math.min(slideThresh * 1.5, Math.sqrt(a.r * a.r + b.r * b.r));
            const wA = a.r * a.r, wB = b.r * b.r, tot = wA + wB;
            if (!a.sliding) {
              a.x = (a.x * wA + b.x * wB) / tot;
              a.y = (a.y * wA + b.y * wB) / tot;
            }
            a.r = newR;
            a.mergeT = performance.now();
            a.vx = (a.vx * wA + b.vx * wB) / tot;
            a.vy = (a.vy * wA + b.vy * wB) / tot;
            a.pinned = a.pinned && b.pinned;
            if (a.sliding || b.sliding) {
              a.sliding = true; a.pinned = false;
              // Deflect horizontally based on relative position
              const hitAngle = Math.atan2(a.y - b.y, a.x - b.x);
              a.vx += Math.cos(hitAngle) * 0.4;
              a.vy += Math.sin(hitAngle) * 0.2;
              const gSign = gravityDir.y >= 0 ? 1 : -1;
            if (a.vy * gSign < 0.3) a.vy = gSign * (0.3 + Math.random() * 0.4);
            } else if (a.r > slideThresh * 1.2 && !a.pinned) {
              a.sliding = true;
              a.vy = 0.2 + Math.random() * 0.3;
            }
            merged[j] = 1;
          }
        }
      }
    }
    for (let i = droplets.length - 1; i >= 0; i--) {
      if (merged[i]) droplets.splice(i, 1);
    }

    const growthRate = tw.accumulation * dt * 0.012;
    if (growthRate > 0) {
      const growSeed = stateRef.current.growSeed ?? (stateRef.current.growSeed = 7);
      for (let i = 0; i < droplets.length; i++) {
        const d = droplets[i];
        if (d.sliding) continue;
        const local = fbm2D(d.x, d.y, growSeed);
        const heightBias = 1.0 - (d.y / h) * 0.3;
        const sizeFactor = 0.4 + d.r * 0.18;
        d.r += growthRate * local * heightBias * sizeFactor * (0.6 + Math.random() * 0.8);
        if (d.pinned && d.r > slideThresh * 0.88) d.r = slideThresh * 0.88;
        if (d.r >= slideThresh && Math.random() < 0.015) {
          d.sliding = true;
          d.pinned = false;
          d.vy = 0.2 + Math.random() * 0.4;
          const ptr = stateRef.current.pointer;
          const dist = Math.hypot(d.x - ptr.x, d.y - ptr.y);
          console.log('drop activated, distance from pointer:', Math.round(dist), 'px');
        }
      }
    }

    if (tw.accumulation > 0 && Math.random() < tw.accumulation * dt * 1.5) {
      const n = Math.floor(1 + Math.random() * 4);
      const ambSeed = stateRef.current.ambSeed ?? (stateRef.current.ambSeed = 23);
      for (let i = 0; i < n; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const local = fbm2D(x, y, ambSeed);
        const heightBias = 1.0 - (y / h) * 0.3;
        if (Math.random() > local * 1.4 * heightBias) continue;
        droplets.push(createDroplet(x, y, sampleRadius(tw.dropSize), { pinned: true }));
      }
    }

    if (droplets.length > 18000) {
      droplets.splice(0, droplets.length - 12000);
    }
  }, [wipeLine]);

  const composite = useCallback(() => {
    const out = compositeRef.current;
    const sc = sceneCanvasRef.current;
    const fc = fogCanvasRef.current;
    const mc = maskCanvasRef.current;
    const dc = dropCanvasRef.current;
    if (!out || !sc || !fc || !mc || !dc) return;
    const { w, h } = stateRef.current.size;
    const ctx = out.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(sc, 0, 0);
    if (!stateRef.current.fogTmp) {
      stateRef.current.fogTmp = document.createElement('canvas');
    }
    const tmp = stateRef.current.fogTmp;
    if (tmp.width !== w || tmp.height !== h) { tmp.width = w; tmp.height = h; }
    const tctx = tmp.getContext('2d');
    tctx.clearRect(0, 0, w, h);
    tctx.drawImage(fc, 0, 0);
    tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(mc, 0, 0);
    tctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(tmp, 0, 0);
    ctx.drawImage(dc, 0, 0);
  }, []);

  useEffect(() => {
    const onResize = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      stateRef.current.size = { w, h };
      [sceneCanvasRef, fogCanvasRef, maskCanvasRef, dropCanvasRef, compositeRef].forEach(ref => {
        const c = ref.current;
        if (!c) return;
        c.width = w; c.height = h;
        c.style.width = w + 'px'; c.style.height = h + 'px';
      });
      paintSceneAndFog();
      initMask();
      if (stateRef.current.droplets.length === 0) {
        spawnAmbient(stateRef.current.droplets, w, h, tweaksRef.current.density, tweaksRef.current.dropSize, tweaksRef.current.slideThreshold);
      }
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [paintSceneAndFog, initMask]);

  useEffect(() => { paintSceneAndFog(); }, [scene, paintSceneAndFog]);

  useEffect(() => {
    let raf;
    const loop = (t) => {
      const st = stateRef.current;
      const dt = Math.min(0.05, st.lastT ? (t - st.lastT) / 1000 : 0.016);
      st.lastT = t;
      step(dt);
      const firstSlider = stateRef.current.droplets.find(d => d.sliding);
      if (firstSlider) {
        const now = performance.now();
        if (!window._lastDrop || now - window._lastDrop > 500) {
          window._lastDrop = now;
          console.log('drop y:', firstSlider.y.toFixed(1), 'vy:', firstSlider.vy.toFixed(3));
        }
      }
      refogStep(dt);
      drawDroplets();
      composite();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [step, refogStep, drawDroplets, composite]);

  useEffect(() => {
    if (scene.kind !== 'video') return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      paintSceneAndFog();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { cancelled = true; };
  }, [scene, paintSceneAndFog]);

  useEffect(() => {
    paintSceneAndFog();
  }, [tweaks.tint, tweaks.tintAmount, tweaks.fogBlur, tweaks.fogDensity, tweaks.mistVariation, paintSceneAndFog]);

  const getXY = (e) => {
    const rect = compositeRef.current.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };

  useEffect(() => {
    const el = compositeRef.current;
    if (!el) return;

    const onDown = (e) => {
      e.preventDefault();
      const { x, y } = getXY(e);
      const st = stateRef.current;
      st.pointer.down = true;
      st.pointer.x = x; st.pointer.y = y;
      st.pointer.lx = x; st.pointer.ly = y;
      const tw = tweaksRef.current;
      if (tw.tool === 'wipe') {
        wipeAt(x, y, tw.brushSize, 0.85);
      } else if (tw.tool === 'drip') {
        const r = 4 + Math.random() * 3;
        const d = createDroplet(x, y, r, { pinned: false });
        d.sliding = true;
        d.vy = 0.3 + Math.random() * 0.3;
        st.droplets.push(d);
        wipeAt(x, y, r * 1.1, 0.6);
      } else if (tw.tool === 'tap') {
        const r = tw.brushSize * 0.35;
        const d = createDroplet(x, y, r);
        d.sliding = r >= tw.slideThreshold;
        d.pinned = !d.sliding;
        st.droplets.push(d);
      }
    };

    const onMove = (e) => {
      const st = stateRef.current;
      if (!st.pointer.down) return;
      e.preventDefault();
      const { x, y } = getXY(e);
      const tw = tweaksRef.current;
      if (tw.tool === 'wipe') {
        wipeLine(st.pointer.lx, st.pointer.ly, x, y, tw.brushSize);
        sweepAndAccumulate(st.pointer.lx, st.pointer.ly, x, y, tw.brushSize);
      } else if (tw.tool === 'drip') {
        const dx = x - st.pointer.lx, dy = y - st.pointer.ly;
        const dist = Math.hypot(dx, dy);
        if (dist > 12) {
          const steps = Math.ceil(dist / 12);
          for (let i = 0; i < steps; i++) {
            const t = i / steps;
            const px = st.pointer.lx + dx * t;
            const py = st.pointer.ly + dy * t;
            const r = 2 + Math.random() * 2;
            const d = createDroplet(px, py, r);
            d.sliding = true;
            d.vy = 0.3 + Math.random() * 0.3;
            st.droplets.push(d);
            wipeAt(px, py, r * 0.9, 0.4);
          }
        }
      }
      st.pointer.lx = x; st.pointer.ly = y;
      st.pointer.x = x; st.pointer.y = y;
    };

    const onUp = () => { stateRef.current.pointer.down = false; };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [wipeAt, wipeLine, sweepAndAccumulate]);

  useEffect(() => {
    if (!tweaks.tiltEnabled) {
      stateRef.current.tilt = { x: 0, y: 0 };
      return;
    }

    const startListening = () => {
      window.addEventListener('deviceorientation', onOrient);
    };

    const onOrient = (e) => {
      const gamma = (e.gamma || 0);
      const beta = (e.beta || 0);
      const gx = gamma / 90;
      const gy = (beta - 45) / 90;
      stateRef.current.tilt = {
        x: Math.max(-1, Math.min(1, gx)),
        y: Math.max(-1, Math.min(1, gy)),
      };
    };

    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(response => {
          if (response === 'granted') startListening();
        })
        .catch(console.error);
    } else {
      startListening();
    }

    return () => window.removeEventListener('deviceorientation', onOrient);
  }, [tweaks.tiltEnabled]);

  useEffect(() => {
    if (!registerCaptureRef) return;
    registerCaptureRef.current = {
      capture: () => {
        const out = compositeRef.current;
        if (!out) return;
        const link = document.createElement('a');
        link.download = `dew-${Date.now()}.png`;
        link.href = out.toDataURL('image/png');
        link.click();
      },
      reset: () => {
        stateRef.current.droplets = [];
        initMask();
        const { w, h } = stateRef.current.size;
        spawnAmbient(stateRef.current.droplets, w, h, tweaksRef.current.density, tweaksRef.current.dropSize, tweaksRef.current.slideThreshold);
      },
      respawn: () => {
        const { w, h } = stateRef.current.size;
        spawnAmbient(stateRef.current.droplets, w, h, tweaksRef.current.density, tweaksRef.current.dropSize, tweaksRef.current.slideThreshold);
      },
    };
  }, [registerCaptureRef, initMask]);

  useEffect(() => {
    const { w, h } = stateRef.current.size;
    if (w && h) {
      spawnAmbient(stateRef.current.droplets, w, h, tweaks.density, tweaks.dropSize, tweaks.slideThreshold);
    }
  }, [tweaks.density, tweaks.dropSize]);

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <canvas ref={sceneCanvasRef} style={{ display: 'none' }} />
      <canvas ref={fogCanvasRef} style={{ display: 'none' }} />
      <canvas ref={maskCanvasRef} style={{ display: 'none' }} />
      <canvas ref={dropCanvasRef} style={{ display: 'none' }} />
      <canvas
        ref={compositeRef}
        style={{
          position: 'absolute', inset: 0,
          touchAction: 'none',
          cursor: tweaks.tool === 'wipe' ? 'grab' : 'crosshair',
        }}
      />
    </div>
  );
}

window.CondensationEngine = CondensationEngine;
