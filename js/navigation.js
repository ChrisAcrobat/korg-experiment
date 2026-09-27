(function (global) {
  const scriptEl = document.currentScript;
  const siteRoot = new URL("../", scriptEl.src).href;
  const sitePath = new URL(siteRoot).pathname.replace(/\/?$/, "/");

  const registry = [];
  let cleanup = null;
  let navigating = false;
  let styleNodes = [];

  function relativePath(href) {
    const url = new URL(href, location.href);
    let path = url.pathname;
    if (path.indexOf(sitePath) === 0) path = path.slice(sitePath.length);
    return path.replace(/^\//, "");
  }

  function isHomeUrl(href) {
    const rel = relativePath(href);
    return rel === "" || rel === "index.html";
  }

  function samePage(a, b) {
    const ua = new URL(a, location.href);
    const ub = new URL(b, location.href);
    return ua.pathname.replace(/\/$/, "") === ub.pathname.replace(/\/$/, "") && ua.search === ub.search;
  }

  function register(matcher, mountFn) {
    registry.push({ matcher: matcher, mount: mountFn });
  }

  function findMount(href) {
    const url = new URL(href, location.href);
    for (let i = 0; i < registry.length; i++) {
      try {
        if (registry[i].matcher(url)) return registry[i].mount;
      } catch (_) {}
    }
    return null;
  }

  function clearInjectedStyles() {
    styleNodes.forEach(function (n) {
      if (n && n.parentNode) n.parentNode.removeChild(n);
    });
    styleNodes = [];
  }

  function ensureStyles(doc, pageUrl) {
    clearInjectedStyles();
    const base = new URL(pageUrl, location.href);
    const nodes = doc.querySelectorAll('link[rel="stylesheet"], style[data-korg-page]');
    nodes.forEach(function (node) {
      if (node.tagName === "LINK") {
        const href = new URL(node.getAttribute("href"), base).href;
        const already = Array.prototype.some.call(document.querySelectorAll('link[rel="stylesheet"]'), function (l) {
          return l.href === href;
        });
        if (already) return;
        // Skip site.css — already on the shell
        if (/\/css\/site\.css$/.test(href)) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.setAttribute("data-korg-soft", "1");
        document.head.appendChild(link);
        styleNodes.push(link);
      } else {
        const style = document.createElement("style");
        style.setAttribute("data-korg-soft", "1");
        style.textContent = node.textContent;
        document.head.appendChild(style);
        styleNodes.push(style);
      }
    });
  }

  function setPageAttr(href) {
    if (isHomeUrl(href)) {
      document.body.removeAttribute("data-korg-page");
    } else {
      document.body.setAttribute("data-korg-page", "hoop");
    }
  }

  function runCleanup() {
    if (typeof cleanup === "function") {
      try {
        cleanup();
      } catch (err) {
        console.warn("korg nav cleanup", err);
      }
    }
    cleanup = null;
  }

  function resolveMountScript(doc, pageUrl) {
    const el = doc.querySelector("script[data-korg-mount]");
    if (!el) return null;
    const src = el.getAttribute("src");
    if (!src) return null;
    return new URL(src, pageUrl).href;
  }

  async function takeCleanup(result) {
    if (result && typeof result.then === "function") result = await result;
    cleanup = typeof result === "function" ? result : null;
  }

  async function invokeMount(href, doc, pageUrl) {
    const registered = findMount(href);
    if (registered) {
      await takeCleanup(registered(document.getElementById("content")));
      return;
    }
    const modUrl = resolveMountScript(doc, pageUrl);
    if (!modUrl) return;
    const mod = await import(modUrl);
    if (mod && typeof mod.mount === "function") {
      await takeCleanup(mod.mount(document.getElementById("content")));
    }
  }

  function updateDocumentMeta(doc) {
    if (doc.title) document.title = doc.title;
    const srcDesc = doc.querySelector('meta[name="description"]');
    const dstDesc = document.querySelector('meta[name="description"]');
    if (srcDesc && dstDesc) dstDesc.setAttribute("content", srcDesc.getAttribute("content") || "");
    const srcTitleKey = doc.body && doc.body.getAttribute("data-i18n-title");
    const srcMetaKey = doc.body && doc.body.getAttribute("data-i18n-meta");
    if (srcTitleKey) document.body.setAttribute("data-i18n-title", srcTitleKey);
    else document.body.removeAttribute("data-i18n-title");
    if (srcMetaKey) document.body.setAttribute("data-i18n-meta", srcMetaKey);
    else document.body.removeAttribute("data-i18n-meta");
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function swapTo(href, options) {
    options = options || {};
    const push = options.push !== false;
    const animate = options.animate !== false;
    const url = new URL(href, location.href).href;

    if (navigating) return;
    if (push && samePage(url, location.href) && !options.force) return;

    navigating = true;
    const root = document.getElementById("content");
    if (!root) {
      navigating = false;
      window.location.href = url;
      return;
    }

    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error("nav " + res.status);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const next = doc.getElementById("content");
      if (!next) throw new Error("no #content in " + url);

      runCleanup();
      ensureStyles(doc, url);
      updateDocumentMeta(doc);
      setPageAttr(url);

      if (animate && !(global.KorgAnimations && global.KorgAnimations.reduceMotion())) {
        root.classList.add("content-leave");
        await wait(180);
      }

      root.innerHTML = next.innerHTML;
      root.classList.remove("content-leave");
      root.classList.add("content-enter");
      requestAnimationFrame(function () {
        root.classList.add("content-enter-active");
      });
      setTimeout(function () {
        root.classList.remove("content-enter", "content-enter-active");
      }, 420);

      if (push) {
        history.pushState({ korgSoft: true }, "", url);
      }

      await invokeMount(url, doc, url);

      if (global.KorgI18n && global.KorgI18n.setLanguage) {
        global.KorgI18n.setLanguage(global.KorgI18n.getLanguage());
      }

      document.dispatchEvent(
        new CustomEvent("korg:navigate", { detail: { url: url, soft: true } })
      );
    } catch (err) {
      console.warn("soft nav failed, hard loading", err);
      window.location.href = url;
    } finally {
      navigating = false;
      document.body.classList.remove("is-leaving");
      document.querySelectorAll(".expand-overlay").forEach(function (el) {
        el.remove();
      });
    }
  }

  function navigate(href, options) {
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) {
      window.location.href = url.href;
      return Promise.resolve();
    }
    const path = url.pathname;
    if (path.indexOf(sitePath) !== 0 && path !== sitePath.replace(/\/$/, "")) {
      window.location.href = url.href;
      return Promise.resolve();
    }
    return swapTo(url.href, options);
  }

  function shouldIntercept(anchor, event) {
    if (!anchor || !anchor.href) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (anchor.target && anchor.target !== "" && anchor.target !== "_self") return false;
    if (anchor.hasAttribute("download")) return false;
    if (anchor.getAttribute("href") && anchor.getAttribute("href").charAt(0) === "#") return false;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin) return false;
    if (url.pathname.indexOf(sitePath) !== 0) return false;
    return true;
  }

  document.addEventListener(
    "click",
    function (event) {
      const anchor = event.target.closest && event.target.closest("a[href]");
      if (!shouldIntercept(anchor, event)) return;
      // Hoop cards handle their own zoom-then-navigate.
      if (anchor.classList.contains("hoop")) return;
      event.preventDefault();
      navigate(anchor.href);
    },
    false
  );

  window.addEventListener("popstate", function () {
    swapTo(location.href, { push: false });
  });

  // Initial page attribute for hard loads
  setPageAttr(location.href);


  async function bootCurrentPage() {
    if (isHomeUrl(location.href)) return;
    const el = document.querySelector("script[data-korg-mount]");
    if (!el) return;
    const src = el.getAttribute("src");
    if (!src) return;
    const modUrl = new URL(src, location.href).href;
    try {
      const mod = await import(modUrl);
      if (mod && typeof mod.mount === "function") {
        await takeCleanup(mod.mount(document.getElementById("content")));
      }
    } catch (err) {
      console.warn("korg boot mount failed", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      bootCurrentPage();
    });
  } else {
    bootCurrentPage();
  }

  function setCleanup(fn) {
    cleanup = typeof fn === "function" ? fn : null;
  }

  global.KorgNav = {
    register: register,
    navigate: navigate,
    swapTo: swapTo,
    setCleanup: setCleanup,
    isHomeUrl: isHomeUrl,
    relativePath: relativePath,
    siteRoot: siteRoot,
  };
})(window);
