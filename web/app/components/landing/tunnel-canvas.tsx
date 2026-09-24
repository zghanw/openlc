"use client";

import { useEffect, useRef, type RefObject } from "react";

/*
 * The hero's wave-line tunnel. Two mirrored walls, each a quarter-pipe of thin polylines running
 * away from the camera, are projected in perspective so every line converges on one vanishing
 * point: the OpenLC tile. A slow sine drift (one cycle every CYCLE_MS) makes the walls flow toward
 * the viewer and the floor lines recede. One radial gradient, centred on the vanishing point, is the
 * only stroke style, so lines brighten where they converge and a frame stays ~120 strokes.
 */

const WALL_LINES = 44; // per wall
const DEPTH_STEPS = 72; // samples along each wall line
const FLOOR_LINES = 16;
const FLOOR_RAYS = 18;
const Z_NEAR = 0.4;
const Z_FAR = 80;
const HALF_WIDTH = 0.8; // corridor half width at the floor, in camera heights
const FLOOR_SPACING = 1.3; // geometric ratio between receding floor lines
const CYCLE_MS = 26000;
const LIGHT_STOPS: [number, number][] = [
  [0, 0.05],
  [0.03, 0.35],
  [0.09, 0.9],
  [0.22, 0.55],
  [0.5, 0.28],
  [1, 0.14],
];

function drawTunnel(ctx: CanvasRenderingContext2D, w: number, h: number, vx: number, vy: number, cycle: number) {
  ctx.clearRect(0, 0, w, h);
  const f = Math.min(w * 0.5, h * 0.95);
  const reach = Math.hypot(Math.max(vx, w - vx), Math.max(vy, h - vy));
  const light = ctx.createRadialGradient(vx, vy, 0, vx, vy, reach);
  for (const [offset, alpha] of LIGHT_STOPS) light.addColorStop(offset, `rgba(255,255,255,${alpha})`);
  ctx.strokeStyle = light;
  ctx.lineWidth = 0.9;
  const phase = cycle * Math.PI * 2;

  for (const side of [-1, 1]) {
    for (let i = 0; i < WALL_LINES; i++) {
      const s = i / (WALL_LINES - 1); // 0 at the foot of the wall, 1 at its crest
      const theta = (s * Math.PI) / 2;
      // Brighter toward the crest, with slow bands of sheen drifting across the wall.
      ctx.globalAlpha = (0.3 + 0.7 * s * s) * (0.45 + 0.55 * Math.sin(s * Math.PI * 2.5 + phase));
      ctx.beginPath();
      for (let j = 0; j <= DEPTH_STEPS; j++) {
        const z = Z_NEAR * Math.pow(Z_FAR / Z_NEAR, j / DEPTH_STEPS);
        const r = 5.5 * (0.14 + 0.86 * Math.exp(-z / 4.5)); // the wall shrinks with depth, so its crest sweeps down
        // Two sine drifts ripple the wall; squaring the height ratio calms them near the vanishing point.
        const wave = (Math.sin(z * 0.3 + phase + s * 2.2) + 0.6 * Math.sin(z * 0.55 - 2 * phase + s * 9)) * (r / 5.5) ** 2;
        const x = HALF_WIDTH + r * 0.75 * Math.sin(theta) + wave * s;
        const y = 1 - r * (1 - Math.cos(theta)) - wave * s * 0.45;
        const sx = vx + (side * f * x) / z;
        const sy = vy + (f * y) / z;
        if (j === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
  }

  // Horizontal floor lines drift toward the viewer by one spacing per cycle, so the loop is seamless.
  for (let k = 0; k < FLOOR_LINES; k++) {
    const z = 0.55 * Math.pow(FLOOR_SPACING, k + 1 - cycle);
    const sy = vy + f / z;
    if (sy > h + 2) continue;
    const half = (f * HALF_WIDTH) / z;
    ctx.globalAlpha = 0.28 * Math.min(1, (FLOOR_LINES - k - 1 + cycle) / 2);
    ctx.beginPath();
    ctx.moveTo(vx - half, sy);
    ctx.lineTo(vx + half, sy);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.16;
  ctx.beginPath();
  for (let r = 1; r < FLOOR_RAYS; r++) {
    const x = -HALF_WIDTH + (2 * HALF_WIDTH * r) / FLOOR_RAYS;
    ctx.moveTo(vx + (f * x) / Z_NEAR, vy + f / Z_NEAR);
    ctx.lineTo(vx + (f * x) / Z_FAR, vy + f / Z_FAR);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * Fills its positioned parent. `anchorRef` is the untransformed box the logo tile sits in: the
 * tunnel converges just beneath it, where the pillar of light meets the floor.
 */
export function TunnelCanvas({ anchorRef }: { anchorRef: RefObject<HTMLElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let w = 0;
    let h = 0;
    let vx = 0;
    let vy = 0;
    let frame = 0;
    let onScreen = true;

    const paint = (now: number) => drawTunnel(ctx, w, h, vx, vy, motionQuery.matches ? 0.18 : (now % CYCLE_MS) / CYCLE_MS);

    const measure = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = box.width;
      h = box.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const tile = anchorRef.current?.getBoundingClientRect();
      vx = tile ? tile.left + tile.width / 2 - box.left : w / 2;
      vy = tile ? tile.bottom + tile.height * 0.55 - box.top : h * 0.62;
      paint(performance.now());
      canvas.dataset.ready = "true";
    };

    const loop = (now: number) => {
      paint(now);
      frame = requestAnimationFrame(loop);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (onScreen && !document.hidden && !motionQuery.matches) frame = requestAnimationFrame(loop);
      else paint(performance.now());
    };

    const resize = new ResizeObserver(measure);
    resize.observe(canvas);
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    visibility.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    motionQuery.addEventListener("change", sync);
    measure();
    sync();
    void document.fonts?.ready.then(measure); // the headline's font swap can move the tile

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", sync);
      motionQuery.removeEventListener("change", sync);
    };
  }, [anchorRef]);

  return <canvas ref={canvasRef} className="lp-tunnel" aria-hidden="true" />;
}
