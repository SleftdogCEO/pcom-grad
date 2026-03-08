'use client';

import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
  life: number;
  maxLife: number;
}

interface Bokeh {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
  pulse: number;
  pulseSpeed: number;
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  wobble: number;
  wobbleSpeed: number;
}

const GOLD = [201, 169, 78];
const WARM = [180, 120, 60];
const CRIMSON = [139, 26, 43];

function randomColor(): string {
  const palettes = [
    `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},`,
    `rgba(${WARM[0]},${WARM[1]},${WARM[2]},`,
    `rgba(${CRIMSON[0]},${CRIMSON[1]},${CRIMSON[2]},`,
    `rgba(255,255,255,`,
  ];
  return palettes[Math.floor(Math.random() * palettes.length)];
}

export default function AmbientCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let w = 0;
    let h = 0;

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Particles - gold dust floating around
    const particles: Particle[] = [];
    const PARTICLE_COUNT = 80;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.2 - 0.1,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
        color: randomColor(),
        life: Math.random() * 1000,
        maxLife: 600 + Math.random() * 800,
      });
    }

    // Bokeh - large soft circles
    const bokehs: Bokeh[] = [];
    const BOKEH_COUNT = 12;

    for (let i = 0; i < BOKEH_COUNT; i++) {
      bokehs.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.1,
        size: 40 + Math.random() * 100,
        opacity: 0.015 + Math.random() * 0.025,
        color: randomColor(),
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.005 + Math.random() * 0.01,
      });
    }

    // Embers - rising sparks from bottom
    const embers: Ember[] = [];
    const EMBER_COUNT = 25;

    for (let i = 0; i < EMBER_COUNT; i++) {
      embers.push({
        x: Math.random() * w,
        y: h + Math.random() * 200,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(0.3 + Math.random() * 0.8),
        size: 1 + Math.random() * 2.5,
        opacity: 0.4 + Math.random() * 0.5,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.02 + Math.random() * 0.04,
      });
    }

    let frame = 0;

    const render = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);

      // Draw bokeh (large soft circles)
      for (const b of bokehs) {
        b.x += b.vx;
        b.y += b.vy;
        b.pulse += b.pulseSpeed;

        // Wrap around
        if (b.x < -b.size) b.x = w + b.size;
        if (b.x > w + b.size) b.x = -b.size;
        if (b.y < -b.size) b.y = h + b.size;
        if (b.y > h + b.size) b.y = -b.size;

        const currentOpacity = b.opacity * (0.6 + 0.4 * Math.sin(b.pulse));
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.size);
        grad.addColorStop(0, b.color + `${currentOpacity})`);
        grad.addColorStop(0.5, b.color + `${currentOpacity * 0.3})`);
        grad.addColorStop(1, b.color + '0)');

        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Draw particles (gold dust)
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        if (p.life > p.maxLife) {
          p.x = Math.random() * w;
          p.y = Math.random() * h;
          p.life = 0;
          p.maxLife = 600 + Math.random() * 800;
          p.opacity = Math.random() * 0.5 + 0.1;
        }

        // Wrap
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        // Fade in/out
        const lifeRatio = p.life / p.maxLife;
        let fade = 1;
        if (lifeRatio < 0.1) fade = lifeRatio / 0.1;
        else if (lifeRatio > 0.8) fade = (1 - lifeRatio) / 0.2;

        const o = p.opacity * fade;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color + `${o})`;
        ctx.fill();
      }

      // Draw embers (rising sparks)
      for (const e of embers) {
        e.wobble += e.wobbleSpeed;
        e.x += e.vx + Math.sin(e.wobble) * 0.5;
        e.y += e.vy;

        // Reset when off top
        if (e.y < -20) {
          e.x = Math.random() * w;
          e.y = h + 20;
          e.opacity = 0.4 + Math.random() * 0.5;
        }

        // Fade as it rises
        const heightRatio = 1 - (h - e.y) / h;
        const o = e.opacity * Math.max(0, heightRatio);

        // Glow effect
        const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.size * 3);
        grad.addColorStop(0, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${o})`);
        grad.addColorStop(0.4, `rgba(${WARM[0]},${WARM[1]},${WARM[2]},${o * 0.4})`);
        grad.addColorStop(1, `rgba(${WARM[0]},${WARM[1]},${WARM[2]},0)`);

        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Bright core
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,220,150,${o * 0.8})`;
        ctx.fill();
      }

      // Subtle light sweep every ~10s
      const sweepPhase = (frame % 600) / 600;
      if (sweepPhase < 0.15) {
        const sweepX = (sweepPhase / 0.15) * (w + 400) - 200;
        const grad = ctx.createLinearGradient(sweepX - 200, 0, sweepX + 200, 0);
        grad.addColorStop(0, 'rgba(201,169,78,0)');
        grad.addColorStop(0.5, 'rgba(201,169,78,0.015)');
        grad.addColorStop(1, 'rgba(201,169,78,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
