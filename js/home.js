(function () {
  function t(key, fallback) {
    return window.KorgI18n ? window.KorgI18n.t(key, fallback) : fallback;
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
    section.className = "hoops-section";
    section.setAttribute("aria-labelledby", "hoops-heading");

    const heading = document.createElement("h2");
    heading.id = "hoops-heading";
    heading.className = "hoops-heading";
    heading.setAttribute("data-i18n", "hoops_heading");
    heading.textContent = t("hoops_heading", "Hoops");

    const status = document.createElement("p");
    status.id = "hoops-status";
    status.className = "hoops-status";
    status.setAttribute("data-i18n", "hoops_loading");
    status.textContent = t("hoops_loading", "Loading hoops…");

    const list = document.createElement("ul");
    list.id = "hoop-list";
    list.className = "hoop-list";
    list.hidden = true;

    section.appendChild(heading);
    section.appendChild(status);
    section.appendChild(list);

    root.appendChild(intro1);
    root.appendChild(intro2);
    root.appendChild(section);

    if (window.KorgI18n && window.KorgI18n.getStrings) {
      // Re-apply so newly injected nodes pick up current language
      window.KorgI18n.setLanguage(window.KorgI18n.getLanguage());
    }

    if (window.KorgHoops) {
      window.KorgHoops.mount(list, status);
    }
  }

  function start() {
    const root = document.getElementById("content");
    if (!root) return;
    buildContent(root);
  }

  if (window.KorgI18n && window.KorgI18n.ready) {
    window.KorgI18n.ready.then(start).catch(start);
  } else {
    document.addEventListener("i18n:ready", start, { once: true });
    setTimeout(start, 500);
  }
})();
