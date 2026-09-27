(function () {
  const REPO = "ChrisAcrobat/korg-experiment";
  const BRANCH = "main";
  const INTERVAL_MS = 30_000;
  const ATOM =
    "https://github.com/" + REPO + "/commits/" + encodeURIComponent(BRANCH) + ".atom";
  const API =
    "https://api.github.com/repos/" +
    REPO +
    "/commits?sha=" +
    encodeURIComponent(BRANCH) +
    "&per_page=1";

  // Site root from this script’s URL so subpages (Korgs/Pong/) resolve correctly.
  const scriptEl = document.currentScript;
  const siteRoot = scriptEl
    ? new URL(".", scriptEl.src).href
    : new URL(".", location.href).href;

  let known = null;

  async function fingerprintFromAtom() {
    const res = await fetch(ATOM, { cache: "no-store" });
    if (!res.ok) throw new Error("atom " + res.status);
    const text = await res.text();
    const entry = text.match(/<entry>[\s\S]*?<id>([^<]+)<\/id>/i);
    if (entry && entry[1]) {
      const sha = entry[1].match(/([a-f0-9]{40})/i);
      if (sha) return "sha:" + sha[1].toLowerCase();
      return "atom:" + entry[1];
    }
    throw new Error("atom missing entry");
  }

  async function fingerprintFromPages() {
    const url = new URL("index.html", siteRoot).href + "?_=" + Date.now();
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (!res.ok) throw new Error("pages " + res.status);
    const etag = res.headers.get("etag");
    const modified = res.headers.get("last-modified");
    if (etag) return "etag:" + etag;
    if (modified) return "mod:" + modified;
    throw new Error("pages missing validators");
  }

  async function fingerprintFromApi() {
    const res = await fetch(API, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("api " + res.status);
    const data = await res.json();
    const sha = data[0] && data[0].sha;
    if (!sha) throw new Error("api missing sha");
    return "sha:" + sha;
  }

  async function latestFingerprint() {
    const errors = [];
    for (const fn of [fingerprintFromAtom, fingerprintFromPages, fingerprintFromApi]) {
      try {
        return await fn();
      } catch (err) {
        errors.push(String(err && err.message ? err.message : err));
      }
    }
    throw new Error(errors.join("; ") || "all fingerprint sources failed");
  }

  async function poll() {
    try {
      const next = await latestFingerprint();
      if (!next) return;
      if (known === null) {
        known = next;
        return;
      }
      if (next !== known) {
        location.reload();
      }
    } catch (_) {
      // Ignore transient errors; try again next interval.
    }
  }

  poll();
  setInterval(poll, INTERVAL_MS);
})();
