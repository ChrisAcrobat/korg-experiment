/**
 * Pong hoop — mountable game for soft navigation.
 */
let activeCleanup = null;

export function mount() {
  if (activeCleanup) {
    try { activeCleanup(); } catch (_) {}
    activeCleanup = null;
  }

  const canvas = document.getElementById("game");
  const scoreEl = document.getElementById("score");
  if (!canvas || !scoreEl) return function () {};

  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const paddleW = 14;
  const paddleH = 90;
  const ballR = 9;
  const player = { x: 28, y: H / 2 - paddleH / 2, vy: 0 };
  const cpu = { x: W - 28 - paddleW, y: H / 2 - paddleH / 2 };
  let ball = { x: W / 2, y: H / 2, vx: 5, vy: 3 };
  let scoreP = 0;
  let scoreC = 0;
  const keys = new Set();
  let pointerY = null;
  let pointerActive = false;
  let running = true;
  let scoreSep = " : ";
  let idleTimer = null;
  let raf = 0;
  const ac = new AbortController();
  const signal = ac.signal;

  function markBusy() {
    if (window.KorgInteraction) window.KorgInteraction.setBusy(true);
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (window.KorgInteraction) window.KorgInteraction.setBusy(false);
    }, 12000);
  }
  markBusy();

  function resetBall(dir) {
    ball.x = W / 2;
    ball.y = H / 2;
    const speed = 5.2;
    const angle = Math.random() * 0.7 - 0.35;
    ball.vx = dir * speed * Math.cos(angle);
    ball.vy = speed * Math.sin(angle) * 1.4;
    if (Math.abs(ball.vy) < 1.5) ball.vy = (Math.random() < 0.5 ? -1 : 1) * 2;
  }

  function updateScore() {
    scoreEl.textContent = scoreP + scoreSep + scoreC;
  }

  function syncI18n() {
    if (window.KorgI18n) {
      scoreSep = window.KorgI18n.t("score_separator", " : ");
      updateScore();
    }
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return ((clientY - rect.top) / rect.height) * H;
  }

  function hit(p) {
    return (
      ball.x - ballR < p.x + paddleW &&
      ball.x + ballR > p.x &&
      ball.y > p.y &&
      ball.y < p.y + paddleH
    );
  }

  function draw() {
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#a78bfa";
    const fg = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim() || "#e8eaed";
    const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#9aa0a6";

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(15, 17, 21, 0.35)";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = muted;
    ctx.globalAlpha = 0.35;
    ctx.setLineDash([10, 14]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2, 16);
    ctx.lineTo(W / 2, H - 16);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.fillStyle = accent;
    ctx.fillRect(player.x, player.y, paddleW, paddleH);
    ctx.fillRect(cpu.x, cpu.y, paddleW, paddleH);

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ballR, 0, Math.PI * 2);
    ctx.fillStyle = fg;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function step() {
    if (!running) return;

    let dy = 0;
    if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) dy -= 1;
    if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) dy += 1;
    if (dy !== 0) {
      player.y += dy * 7.5;
    } else if (pointerActive && pointerY != null) {
      player.y += (pointerY - paddleH / 2 - player.y) * 0.28;
    }
    player.y = Math.max(8, Math.min(H - paddleH - 8, player.y));

    const target = ball.y - paddleH / 2;
    const cpuSpeed = 4.2 + Math.min(2, (scoreP + scoreC) * 0.15);
    cpu.y += Math.max(-cpuSpeed, Math.min(cpuSpeed, target - cpu.y));
    cpu.y = Math.max(8, Math.min(H - paddleH - 8, cpu.y));

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.y - ballR < 0) {
      ball.y = ballR;
      ball.vy *= -1;
    }
    if (ball.y + ballR > H) {
      ball.y = H - ballR;
      ball.vy *= -1;
    }

    if (ball.vx < 0 && hit(player)) {
      ball.x = player.x + paddleW + ballR;
      const rel = (ball.y - (player.y + paddleH / 2)) / (paddleH / 2);
      const speed = Math.min(11, Math.hypot(ball.vx, ball.vy) * 1.05 + 0.2);
      ball.vx = Math.abs(speed * Math.cos(rel * 0.6));
      ball.vy = speed * Math.sin(rel * 0.75);
    }
    if (ball.vx > 0 && hit(cpu)) {
      ball.x = cpu.x - ballR;
      const rel = (ball.y - (cpu.y + paddleH / 2)) / (paddleH / 2);
      const speed = Math.min(11, Math.hypot(ball.vx, ball.vy) * 1.05 + 0.2);
      ball.vx = -Math.abs(speed * Math.cos(rel * 0.6));
      ball.vy = speed * Math.sin(rel * 0.75);
    }

    if (ball.x < -30) {
      scoreC += 1;
      updateScore();
      resetBall(1);
    } else if (ball.x > W + 30) {
      scoreP += 1;
      updateScore();
      resetBall(-1);
    }

    draw();
    raf = requestAnimationFrame(step);
  }

  window.addEventListener("keydown", markBusy, { signal });
  canvas.addEventListener("pointerdown", markBusy, { signal });
  document.addEventListener(
    "visibilitychange",
    function () {
      if (document.hidden && window.KorgInteraction) window.KorgInteraction.setBusy(false);
    },
    { signal }
  );
  document.addEventListener("i18n:ready", syncI18n, { signal });
  if (window.KorgI18n && window.KorgI18n.ready) {
    window.KorgI18n.ready.then(syncI18n).catch(function () {});
  }

  window.addEventListener(
    "keydown",
    function (e) {
      if (["ArrowUp", "ArrowDown", "w", "W", "s", "S"].includes(e.key)) {
        e.preventDefault();
        keys.add(e.key);
      }
    },
    { signal }
  );
  window.addEventListener(
    "keyup",
    function (e) {
      keys.delete(e.key);
    },
    { signal }
  );

  canvas.addEventListener(
    "pointerdown",
    function (e) {
      pointerActive = true;
      pointerY = pointerPos(e);
      canvas.setPointerCapture(e.pointerId);
    },
    { signal }
  );
  canvas.addEventListener(
    "pointermove",
    function (e) {
      if (!pointerActive) return;
      pointerY = pointerPos(e);
    },
    { signal }
  );
  canvas.addEventListener(
    "pointerup",
    function () {
      pointerActive = false;
    },
    { signal }
  );
  canvas.addEventListener(
    "pointercancel",
    function () {
      pointerActive = false;
    },
    { signal }
  );

  resetBall(Math.random() < 0.5 ? 1 : -1);
  updateScore();
  raf = requestAnimationFrame(step);

  function cleanup() {
    running = false;
    cancelAnimationFrame(raf);
    ac.abort();
    if (idleTimer) clearTimeout(idleTimer);
    if (window.KorgInteraction) window.KorgInteraction.setBusy(false);
    keys.clear();
  }

  activeCleanup = cleanup;
  return cleanup;
}
