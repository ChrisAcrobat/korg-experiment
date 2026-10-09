(function (global) {
  let started = false;

  function t(key, fallback) {
    return global.KorgI18n ? global.KorgI18n.t(key, fallback) : fallback;
  }

  function isHome() {
    if (global.KorgNav && global.KorgNav.isHomeUrl) {
      return global.KorgNav.isHomeUrl(location.href);
    }
    const path = location.pathname.replace(/\/$/, "");
    return /\/korg-experiment$/i.test(path) || /\/korg-experiment\/index\.html$/i.test(location.pathname);
  }

  function buildContent(root) {
    root.innerHTML = "";

    const intro1 = document.createElement("p");
    intro1.setAttribute("data-i18n", "intro1");
    intro1.textContent = t(
      "intro1",
      "This is an open experiment where an AI assistant gets to build, publish, and iterate on a simple website — without anyone writing the code by hand."
    );

    const intro2 = document.createElement("p");
    intro2.setAttribute("data-i18n", "intro2");
    intro2.textContent = t(
      "intro2",
      "The page is intentionally simple: a place to try workflows, publishing, and collaboration between human and assistant."
    );

    const section = document.createElement("section");
    section.className = "baskets-section";
    section.setAttribute("aria-labelledby", "baskets-heading");

    const heading = document.createElement("h2");
    heading.id = "baskets-heading";
    heading.className = "baskets-heading";
    heading.setAttribute("data-i18n", "baskets_heading");
    heading.textContent = t("baskets_heading", "Baskets");

    const status = document.createElement("p");
    status.id = "baskets-status";
    status.className = "baskets-status";
    status.setAttribute("data-i18n", "baskets_loading");
    status.textContent = t("baskets_loading", "Loading baskets…");

    const list = document.createElement("ul");
    list.id = "basket-list";
    list.className = "basket-list";
    list.hidden = true;

    section.appendChild(heading);
    section.appendChild(status);
    section.appendChild(list);

    root.appendChild(intro1);
    root.appendChild(intro2);
    root.appendChild(section);

    if (global.KorgI18n && global.KorgI18n.getStrings) {
      global.KorgI18n.setLanguage(global.KorgI18n.getLanguage());
    }

    let basketCleanup = null;
    if (global.KorgBaskets) {
      basketCleanup = global.KorgBaskets.mount(list, status);
    }
    return function () {
      if (typeof basketCleanup === "function") basketCleanup();
      root.innerHTML = "";
    };
  }

  function mountHome(root) {
    if (!root) root = document.getElementById("content");
    if (!root) return function () {};
    return buildContent(root);
  }

  function start() {
    if (!isHome()) return;
    if (started) return;
    started = true;
    const root = document.getElementById("content");
    if (!root) return;
    const cleanupFn = mountHome(root);
    if (global.KorgNav && global.KorgNav.setCleanup) {
      global.KorgNav.setCleanup(cleanupFn);
    }
  }

  if (global.KorgNav) {
    global.KorgNav.register(function (url) {
      return global.KorgNav.isHomeUrl(url.href);
    }, function (root) {
      started = true;
      return mountHome(root);
    });
    global.__korgHomeRegistered = true;
  }

  function boot() {
    if (!isHome()) return;
    start();
  }

  if (global.KorgI18n && global.KorgI18n.ready) {
    global.KorgI18n.ready.then(boot).catch(boot);
  } else {
    document.addEventListener("i18n:ready", boot, { once: true });
    setTimeout(boot, 500);
  }

  global.KorgHome = { mount: mountHome, isHome: isHome };
})(window);
