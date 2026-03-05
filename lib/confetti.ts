export function fireConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#8B1A2B', '#C9A94E', '#ffffff', '#ff6b6b', '#4ecdc4', '#ffe66d'];
  const pieces: {
    x: number; y: number; vx: number; vy: number;
    size: number; color: string; rotation: number;
    rotationSpeed: number; gravity: number; opacity: number;
  }[] = [];

  for (let i = 0; i < 120; i++) {
    pieces.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height * 0.4,
      vx: (Math.random() - 0.5) * 24,
      vy: Math.random() * -18 - 4,
      size: Math.random() * 8 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      gravity: 0.35,
      opacity: 1,
    });
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of pieces) {
      p.x += p.vx;
      p.vy += p.gravity;
      p.y += p.vy;
      p.vx *= 0.99;
      p.rotation += p.rotationSpeed;
      p.opacity -= 0.006;
      if (p.opacity > 0 && p.y < canvas.height + 50) {
        alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
    }
    if (alive) requestAnimationFrame(animate);
    else canvas.remove();
  }
  requestAnimationFrame(animate);
}
