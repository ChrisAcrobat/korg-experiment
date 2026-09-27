(function () {
  const REPO = "ChrisAcrobat/korg-experiment";
  const BRANCH = "main";
  const INTERVAL_MS = 30_000;
  const API =
    "https://api.github.com/repos/" +
    REPO +
    "/commits?sha=" +
    encodeURIComponent(BRANCH) +
    "&per_page=1";

  let knownSha = null;

  async function latestSha() {
    const res = await fetch(API, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("GitHub API " + res.status);
    const data = await res.json();
    return data[0] && data[0].sha;
  }

  async function poll() {
    try {
      const sha = await latestSha();
      if (!sha) return;
      if (knownSha === null) {
        knownSha = sha;
        return;
      }
      if (sha !== knownSha) {
        location.reload();
      }
    } catch (_) {
      // Ignore transient errors; try again next interval.
    }
  }

  poll();
  setInterval(poll, INTERVAL_MS);
})();
