(function (global) {
  const reduceMotion = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function scaleUpNavigate(options) {
    const href = options.href;
    const icon = options.icon || "🧺";
    const fromEl = options.fromEl;
    const onComplete = options.onComplete;

    if (!href) return;
    if (reduceMotion()) {
      if (typeof onComplete === "function") onComplete();
      else if (global.KorgNav) global.KorgNav.navigate(href, { animate: false });
      else window.location.href = href;
      return;
    }

    const rect = fromEl
      ? fromEl.getBoundingClientRect()
      : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
    const overlay = document.createElement("div");
    overlay.className = "expand-overlay";
    overlay.setAttribute("aria-hidden", "true");
    const fly = document.createElement("span");
    fly.className = "fly-hoop";
    fly.textContent = icon;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    fly.style.left = cx + "px";
    fly.style.top = cy + "px";
    fly.style.transform = "translate(-50%, -50%) scale(1)";
    overlay.appendChild(fly);
    document.body.appendChild(overlay);
    document.body.classList.add("is-leaving");

    requestAnimationFrame(function () {
      overlay.classList.add("is-on");
    });

    let finished = false;
    const done = function () {
      if (finished) return;
      finished = true;
      if (typeof onComplete === "function") {
        Promise.resolve(onComplete()).finally(function () {
          overlay.remove();
          document.body.classList.remove("is-leaving");
        });
      } else if (global.KorgNav) {
        global.KorgNav.navigate(href, { animate: false }).finally(function () {
          overlay.remove();
          document.body.classList.remove("is-leaving");
        });
      } else {
        window.location.href = href;
      }
    };
    fly.addEventListener("transitionend", done, { once: true });
    setTimeout(done, 850);
  }

  function applyStagger(elements, baseDelaySec) {
    const delay = baseDelaySec == null ? 0.08 : baseDelaySec;
    Array.prototype.forEach.call(elements, function (el, index) {
      el.style.animationDelay = index * delay + "s";
    });
  }

  global.KorgAnimations = {
    scaleUpNavigate: scaleUpNavigate,
    applyStagger: applyStagger,
    reduceMotion: reduceMotion,
  };
})(window);
