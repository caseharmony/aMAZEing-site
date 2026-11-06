/* =========================================================
   aMAZEing — site interactions, release data and maze demo
   ========================================================= */

(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const numberFormat = new Intl.NumberFormat('en-US');
  const raf = (callback) => window.requestAnimationFrame(callback);
  const prefersReducedMotion = () =>
    window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

  const REPO = 'caseharmony/Maze-Game';
  const API_URL = `https://api.github.com/repos/${REPO}/releases?per_page=100`;
  const LATEST_DOWNLOAD = `https://github.com/${REPO}/releases/latest/download`;
  const RELEASES_URL = `https://github.com/${REPO}/releases`;
  const CACHE_KEY = 'amazeing:releases:v1';
  const CACHE_TTL = 10 * 60 * 1000;

  /* ---------------------------------------------------------
     Small DOM helpers
     --------------------------------------------------------- */

  function makeSvgIcon(id, className = 'icon') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${id}`);
    svg.appendChild(use);
    return svg;
  }

  function formatDate(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  function formatVersion(tag) {
    const value = String(tag || '').trim();
    if (!value) return 'v1.0.0';
    if (/^v/i.test(value) || !/^\d/.test(value)) return value;
    return `v${value}`;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return null;
    const mb = bytes / (1024 * 1024);
    if (mb >= 100) return `${Math.round(mb)} MB`;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function formatMs(ms) {
    if (!Number.isFinite(ms)) return '—';
    return ms < 0.1 ? '<0.1 ms' : `${ms.toFixed(1)} ms`;
  }

  /* ---------------------------------------------------------
     Header, mobile navigation and scroll state
     --------------------------------------------------------- */

  function initHeader() {
    const header = $('[data-header]');
    const toggle = $('[data-nav-toggle]');
    const nav = $('[data-nav]');
    let isOpen = false;

    function setOpen(next) {
      isOpen = Boolean(next);
      if (toggle) toggle.setAttribute('aria-expanded', String(isOpen));
      if (nav) nav.classList.toggle('is-open', isOpen);
    }

    if (toggle && nav) {
      toggle.addEventListener('click', () => setOpen(!isOpen));

      nav.addEventListener('click', (event) => {
        if (event.target.closest('a')) setOpen(false);
      });

      document.addEventListener('click', (event) => {
        if (!isOpen) return;
        if (nav.contains(event.target) || toggle.contains(event.target)) return;
        setOpen(false);
      });

      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !isOpen) return;
        setOpen(false);
        toggle.focus();
      });

      window.addEventListener('resize', () => {
        if (window.innerWidth > 800 && isOpen) setOpen(false);
      });
    }

    if (!header) return;
    const updateScrollState = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 6);
    };
    updateScrollState();
    window.addEventListener('scroll', updateScrollState, { passive: true });
  }

  /* ---------------------------------------------------------
     Reveal on scroll
     --------------------------------------------------------- */

  function initReveal() {
    const elements = $$('[data-reveal]');
    if (!elements.length) return;

    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const element = entry.target;
          const delay = Number(element.dataset.revealDelay || 0);
          if (delay > 0) element.style.transitionDelay = `${delay}ms`;
          element.classList.add('is-visible');
          observer.unobserve(element);
        });
      },
      { rootMargin: '0px 0px -7% 0px', threshold: 0.1 }
    );

    elements.forEach((element) => observer.observe(element));
  }

  /* ---------------------------------------------------------
     Install tabs
     --------------------------------------------------------- */

  function initTabs() {
    $$('[data-tabs]').forEach((root) => {
      const tabs = $$('[role="tab"]', root);
      if (!tabs.length) return;
      const panels = tabs
        .map((tab) => document.getElementById(tab.getAttribute('aria-controls') || ''))
        .filter(Boolean);

      function activate(index, moveFocus) {
        const next = (index + tabs.length) % tabs.length;
        tabs.forEach((tab, i) => {
          const selected = i === next;
          tab.classList.toggle('is-active', selected);
          tab.setAttribute('aria-selected', String(selected));
          tab.tabIndex = selected ? 0 : -1;
        });
        panels.forEach((panel, i) => {
          panel.hidden = i !== next;
        });
        if (moveFocus) tabs[next].focus();
      }

      tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => activate(index, false));
        tab.addEventListener('keydown', (event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          if (event.key === 'Home') activate(0, true);
          else if (event.key === 'End') activate(tabs.length - 1, true);
          else activate(index + (event.key === 'ArrowRight' ? 1 : -1), true);
        });
      });
    });
  }

  /* ---------------------------------------------------------
     Copy-to-clipboard buttons
     --------------------------------------------------------- */

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        /* fall through to the legacy path */
      }
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      return copied;
    } catch (error) {
      return false;
    }
  }

  function initCopyButtons() {
    $$('[data-copy]').forEach((button) => {
      button.addEventListener('click', async () => {
        const target = document.getElementById(button.dataset.copy || '');
        if (!target) return;
        const text = (target.textContent || '').trim();
        if (!text) return;

        const copied = await copyText(text);
        const label = $('span', button);
        const original = label ? label.textContent : '';
        button.classList.toggle('is-copied', copied);
        if (label) label.textContent = copied ? 'Copied' : 'Select';

        window.setTimeout(() => {
          button.classList.remove('is-copied');
          if (label) label.textContent = original;
        }, 1600);
      });
    });
  }

  /* ---------------------------------------------------------
     Platform detection
     --------------------------------------------------------- */

  function detectPlatform() {
    const ua = navigator.userAgent || '';
    if (/Windows NT|Win64|WOW64|Windows/i.test(ua)) return 'windows';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
    if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) return 'linux';
    return 'unknown';
  }

  /* ---------------------------------------------------------
     Release data from GitHub
     --------------------------------------------------------- */

  const FALLBACK_RELEASES = [
    {
      id: 'fallback-latest',
      tag_name: '1.0.0',
      name: 'V1.0.0 Added cross comatibility',
      published_at: '2026-11-06T04:45:13Z',
      html_url: `https://github.com/${REPO}/releases/tag/1.0.0`,
      prerelease: false,
      draft: false,
      body:
        'Download the .exe for Windows. Download the .appimage for Linux.\n\n' +
        'Added cross-compatibility, the Growing Tree algorithm for mixed mazes, fixed the database and improved email functionality.',
      assets: [
        {
          name: 'aMAZEing.exe',
          browser_download_url: `${LATEST_DOWNLOAD}/aMAZEing.exe`,
          size: 42788864,
          download_count: 2,
          digest: 'sha256:c8ce616730f8ef2c87bf28b23ba9352f7692f9f4d4fdb6424651ac2625d9103b',
        },
        {
          name: 'aMAZEing.appimage',
          browser_download_url: `${LATEST_DOWNLOAD}/aMAZEing.appimage`,
          size: 60377712,
          download_count: 1,
          digest: 'sha256:584d2bad527e30a33f09479ba637e9b900d888f23127af70d2481e42411bf6d9',
        },
      ],
    },
    {
      id: 'fallback-081',
      tag_name: 'v0.8.1',
      name: 'Better randomness, secure OTPs',
      published_at: '2026-01-28T00:00:00Z',
      html_url: `https://github.com/${REPO}/releases/tag/v0.8.1`,
      prerelease: false,
      draft: false,
      body: 'More (better) randomness in maze generation. Cryptographically secure OTP generation.',
      assets: [],
    },
  ];

  let currentLatestRelease = null;
  let currentPlatform = detectPlatform();

  function readCache(allowExpired = false) {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (!cached || !Array.isArray(cached.data) || !cached.data.length) return null;
      if (!allowExpired && Date.now() - Number(cached.at || 0) > CACHE_TTL) return null;
      return cached.data;
    } catch (error) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
    } catch (error) {
      /* storage may be unavailable — the site still works without it */
    }
  }

  async function loadReleases() {
    const cached = readCache();
    if (cached) return { releases: cached, failed: false };

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 9000);

    try {
      const response = await fetch(API_URL, {
        signal: controller.signal,
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!response.ok) throw new Error(`GitHub responded with ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data) || !data.length) throw new Error('No releases returned');
      writeCache(data);
      return { releases: data, failed: false };
    } catch (error) {
      const stale = readCache(true);
      return { releases: stale || FALLBACK_RELEASES, failed: true };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function sortReleases(releases) {
    return releases
      .filter((release) => release && !release.draft)
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.published_at || 0).getTime();
        const bTime = new Date(b.published_at || 0).getTime();
        return bTime - aTime;
      });
  }

  function selectLatest(releases) {
    const sorted = sortReleases(releases);
    return sorted.find((release) => !release.prerelease) || sorted[0] || FALLBACK_RELEASES[0];
  }

  function findAsset(release, platform) {
    if (!release || !Array.isArray(release.assets)) return null;
    return (
      release.assets.find((asset) => {
        const name = String(asset.name || '').toLowerCase();
        if (platform === 'windows') return /\.exe$/i.test(name) || name.includes('windows');
        if (platform === 'linux') return /\.appimage$/i.test(name) || name.includes('linux');
        return false;
      }) || null
    );
  }

  function assetUrl(release, asset, platform) {
    if (asset && asset.browser_download_url) return asset.browser_download_url;
    const fallbackName = platform === 'windows' ? 'aMAZEing.exe' : 'aMAZEing.appimage';
    if (release && release.tag_name && asset && asset.name) {
      return `https://github.com/${REPO}/releases/download/${encodeURIComponent(
        release.tag_name
      )}/${encodeURIComponent(asset.name)}`;
    }
    return `${LATEST_DOWNLOAD}/${fallbackName}`;
  }

  function totalDownloads(releases) {
    return releases.reduce((total, release) => {
      if (!release || !Array.isArray(release.assets)) return total;
      return total + release.assets.reduce((sum, asset) => sum + (Number(asset.download_count) || 0), 0);
    }, 0);
  }

  /* ---- tiny, safe markdown renderer for release bodies ---- */

  function appendInline(parent, text) {
    const pattern =
      /(!?\[([^\]]*)\]\((https?:\/\/[^\s)]+)\))|(\*\*([^*]+)\*\*)|(`([^`]+)`)/g;
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(text))) {
      if (match.index > lastIndex) {
        parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      if (match[1]) {
        if (match[1].startsWith('!')) {
          parent.appendChild(document.createTextNode(match[2] || ''));
        } else {
          const link = document.createElement('a');
          link.href = match[3];
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = match[2] || match[3];
          parent.appendChild(link);
        }
      } else if (match[4]) {
        const strong = document.createElement('strong');
        strong.textContent = match[5];
        parent.appendChild(strong);
      } else if (match[6]) {
        const code = document.createElement('code');
        code.textContent = match[7];
        parent.appendChild(code);
      }

      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function renderMarkdown(parent, source) {
    parent.textContent = '';
    const lines = String(source || '')
      .replace(/\r\n/g, '\n')
      .split('\n');

    let index = 0;
    while (index < lines.length) {
      const line = lines[index];

      if (!line.trim()) {
        index += 1;
        continue;
      }

      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
        index += 1;
        continue;
      }

      if (/^#{1,6}\s+/.test(line)) {
        const heading = document.createElement('p');
        heading.className = 'release-heading';
        appendInline(heading, line.replace(/^#{1,6}\s+/, ''));
        parent.appendChild(heading);
        index += 1;
        continue;
      }

      if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
        const list = document.createElement('ul');
        while (index < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[index])) {
          const item = document.createElement('li');
          appendInline(item, lines[index].replace(/^\s*([-*+]|\d+\.)\s+/, ''));
          list.appendChild(item);
          index += 1;
        }
        parent.appendChild(list);
        continue;
      }

      const paragraph = document.createElement('p');
      const chunks = [];
      while (
        index < lines.length &&
        lines[index].trim() &&
        !/^#{1,6}\s+/.test(lines[index]) &&
        !/^\s*([-*+]|\d+\.)\s+/.test(lines[index]) &&
        !/^\s*([-*_])\1{2,}\s*$/.test(lines[index])
      ) {
        chunks.push(lines[index].trim());
        index += 1;
      }
      appendInline(paragraph, chunks.join(' '));
      parent.appendChild(paragraph);
    }
  }

  function renderReleaseNotes(release) {
    const mount = $('[data-latest-notes]');
    if (!mount) return;
    const body = String((release && release.body) || '').trim();
    if (!body) {
      mount.textContent = '';
      const paragraph = document.createElement('p');
      paragraph.textContent = 'No release notes were provided for this build.';
      mount.appendChild(paragraph);
      return;
    }
    renderMarkdown(mount, body);
  }

  function createHistoryItem(release) {
    const details = document.createElement('details');
    details.className = 'history-item';

    const summary = document.createElement('summary');

    const version = document.createElement('span');
    version.className = 'history-version';
    version.textContent = formatVersion(release.tag_name);
    if (release.prerelease) {
      const tag = document.createElement('span');
      tag.className = 'history-tag';
      tag.textContent = 'PRE-RELEASE';
      version.appendChild(tag);
    }

    const name = document.createElement('span');
    name.className = 'history-name';
    name.textContent = release.name || 'Untitled release';

    const date = document.createElement('span');
    date.className = 'history-date';
    date.textContent = formatDate(release.published_at);

    const chevron = makeSvgIcon('i-chevron-down', 'icon history-chevron');
    summary.append(version, name, date, chevron);

    const body = document.createElement('div');
    body.className = 'history-body';

    if (release.body) {
      const notes = document.createElement('div');
      notes.className = 'history-notes';
      renderMarkdown(notes, release.body);
      body.appendChild(notes);
    }

    const assets = Array.isArray(release.assets) ? release.assets : [];
    if (assets.length) {
      const assetList = document.createElement('div');
      assetList.className = 'history-assets';
      assets.forEach((asset) => {
        const link = document.createElement('a');
        link.className = 'history-asset';
        link.href =
          asset.browser_download_url ||
          `https://github.com/${REPO}/releases/download/${encodeURIComponent(
            release.tag_name
          )}/${encodeURIComponent(asset.name)}`;
        link.target = '_blank';
        link.rel = 'noopener';
        link.appendChild(makeSvgIcon('i-download', 'icon'));
        const label = document.createElement('span');
        const size = formatBytes(Number(asset.size));
        label.textContent = size ? `${asset.name} · ${size}` : asset.name;
        link.appendChild(label);
        assetList.appendChild(link);
      });
      body.appendChild(assetList);
    }

    const releaseLink = document.createElement('a');
    releaseLink.className = 'text-link';
    releaseLink.href = release.html_url || RELEASES_URL;
    releaseLink.target = '_blank';
    releaseLink.rel = 'noopener';
    releaseLink.textContent = 'View release';
    releaseLink.appendChild(makeSvgIcon('i-arrow-up-right', 'icon'));
    body.appendChild(releaseLink);

    details.append(summary, body);
    return details;
  }

  function renderHistory(releases, latest, failed) {
    const mount = $('[data-release-history]');
    if (!mount) return;

    const status = $('[data-history-status]', mount);
    $$('.history-item', mount).forEach((item) => item.remove());

    const older = sortReleases(releases).filter(
      (release) => release.tag_name !== latest.tag_name
    );

    older.forEach((release) => {
      const item = createHistoryItem(release);
      if (status) mount.insertBefore(item, status);
      else mount.appendChild(item);
    });

    if (!status) return;

    if (failed) {
      status.hidden = false;
      status.classList.add('history-status--error');
      status.textContent = older.length
        ? 'GitHub could not be reached — showing the most recent known releases.'
        : 'Release history is unavailable right now.';
    } else if (older.length) {
      status.hidden = true;
      status.classList.remove('history-status--error');
    } else {
      status.hidden = false;
      status.classList.remove('history-status--error');
      status.textContent = 'No older public releases yet.';
    }
  }

  function applyReleaseAssets(release) {
    ['windows', 'linux'].forEach((platform) => {
      const asset = findAsset(release, platform);
      const href = assetUrl(release, asset, platform);

      $$(`[data-asset-link="${platform}"]`).forEach((link) => {
        link.href = href;
        if (asset && asset.name) link.setAttribute('title', `Download ${asset.name}`);
      });

      if (asset) {
        const size = formatBytes(Number(asset.size));
        if (size) {
          $$(`[data-asset-size="${platform}"]`).forEach((element) => {
            element.textContent = size;
          });
        }

        const digest = String(asset.digest || '').replace(/^sha256:/i, '');
        $$(`[data-asset-digest="${platform}"]`).forEach((element) => {
          if (digest) element.textContent = digest;
        });
        if (!digest) {
          $$(`[data-digest-wrap="${platform}"]`).forEach((wrapper) => {
            wrapper.hidden = true;
          });
        }
      }
    });
  }

  function updateQuickDownload() {
    const links = $$('[data-quick-download]');
    const labels = $$('[data-quick-label]');
    if (!links.length && !labels.length) return;

    if (currentPlatform === 'windows' || currentPlatform === 'linux') {
      const asset = findAsset(currentLatestRelease, currentPlatform);
      const href = assetUrl(currentLatestRelease, asset, currentPlatform);
      const niceName = currentPlatform === 'windows' ? 'Windows' : 'Linux';
      links.forEach((link) => {
        link.href = href;
      });
      labels.forEach((label) => {
        label.textContent = `Download for ${niceName}`;
      });
    } else {
      links.forEach((link) => {
        link.href = 'download.html';
      });
      labels.forEach((label) => {
        label.textContent = 'Download aMAZEing';
      });
    }
  }

  function applyPlatformUI() {
    const supported = currentPlatform === 'windows' || currentPlatform === 'linux';

    $$('[data-platform-card]').forEach((card) => {
      card.classList.toggle(
        'is-recommended',
        supported && card.dataset.platformCard === currentPlatform
      );
    });

    $$('[data-recommended]').forEach((tag) => {
      tag.hidden = !supported || tag.dataset.recommended !== currentPlatform;
    });

    updateQuickDownload();
  }

  function applyReleaseData(releases, failed) {
    const latest = selectLatest(releases);
    currentLatestRelease = latest;

    const version = formatVersion(latest.tag_name);
    $$('[data-latest-version]').forEach((element) => {
      element.textContent = version;
    });

    const published = formatDate(latest.published_at);
    $$('[data-latest-date]').forEach((element) => {
      element.textContent = published;
    });

    $$('[data-latest-link]').forEach((link) => {
      link.href = latest.html_url || RELEASES_URL;
    });

    $$('[data-total-downloads]').forEach((element) => {
      element.textContent = numberFormat.format(totalDownloads(releases));
    });

    renderReleaseNotes(latest);
    renderHistory(releases, latest, failed);
    applyReleaseAssets(latest);
    updateQuickDownload();

    const note = $('[data-release-note]');
    if (note) note.hidden = !failed;
  }

  async function initReleases() {
    const needed = document.querySelector(
      '[data-latest-version], [data-asset-link], [data-release-history], [data-quick-download], [data-total-downloads]'
    );
    if (!needed) return;

    applyPlatformUI();

    // Paint the known-good fallback immediately, then replace it with live data.
    applyReleaseData(FALLBACK_RELEASES, false);

    const result = await loadReleases();
    applyReleaseData(result.releases, result.failed);
  }

  /* ---------------------------------------------------------
     Maze generation
     --------------------------------------------------------- */

  const DIRECTIONS = [
    { dx: 0, dy: -1, wall: 0, opposite: 2 },
    { dx: 1, dy: 0, wall: 1, opposite: 3 },
    { dx: 0, dy: 1, wall: 2, opposite: 0 },
    { dx: -1, dy: 0, wall: 3, opposite: 1 },
  ];

  function makeEmptyMaze(cols, rows) {
    const total = cols * rows;
    const walls = new Uint8Array(total * 4);
    walls.fill(1);
    return { cols, rows, walls };
  }

  function generatePrim(cols, rows, random) {
    const maze = makeEmptyMaze(cols, rows);
    const { walls } = maze;
    const inMaze = new Uint8Array(cols * rows);
    const frontier = [];
    const cellIndex = (x, y) => y * cols + x;
    const inBounds = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;

    function pushFrontier(x, y) {
      DIRECTIONS.forEach((direction) => {
        const nx = x + direction.dx;
        const ny = y + direction.dy;
        if (!inBounds(nx, ny) || inMaze[cellIndex(nx, ny)]) return;
        frontier.push({
          x,
          y,
          nx,
          ny,
          wall: direction.wall,
          opposite: direction.opposite,
        });
      });
    }

    inMaze[0] = 1;
    pushFrontier(0, 0);

    while (frontier.length) {
      const pick = Math.floor(random() * frontier.length);
      const edge = frontier[pick];
      frontier[pick] = frontier[frontier.length - 1];
      frontier.pop();

      const target = cellIndex(edge.nx, edge.ny);
      if (inMaze[target]) continue;

      walls[cellIndex(edge.x, edge.y) * 4 + edge.wall] = 0;
      walls[target * 4 + edge.opposite] = 0;
      inMaze[target] = 1;
      pushFrontier(edge.nx, edge.ny);
    }

    return maze;
  }

  function generateGrowingTree(cols, rows, bias, random) {
    const maze = makeEmptyMaze(cols, rows);
    const { walls } = maze;
    const visited = new Uint8Array(cols * rows);
    const active = [0];
    const cellIndex = (x, y) => y * cols + x;
    const inBounds = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;

    visited[0] = 1;

    while (active.length) {
      const useNewest = random() < bias;
      const position = useNewest ? active.length - 1 : Math.floor(random() * active.length);
      const current = active[position];
      const x = current % cols;
      const y = Math.floor(current / cols);
      const options = [];

      DIRECTIONS.forEach((direction) => {
        const nx = x + direction.dx;
        const ny = y + direction.dy;
        if (!inBounds(nx, ny)) return;
        const target = cellIndex(nx, ny);
        if (visited[target]) return;
        options.push({ direction, nx, ny, target });
      });

      if (!options.length) {
        active.splice(position, 1);
        continue;
      }

      const choice = options[Math.floor(random() * options.length)];
      walls[current * 4 + choice.direction.wall] = 0;
      walls[choice.target * 4 + choice.direction.opposite] = 0;
      visited[choice.target] = 1;
      active.push(choice.target);
    }

    return maze;
  }

  function generateMaze(cols, rows, algorithm, bias) {
    const random = Math.random;
    if (algorithm === 'growing') return generateGrowingTree(cols, rows, bias, random);
    return generatePrim(cols, rows, random);
  }

  /* ---------------------------------------------------------
     A* solver + binary heap
     --------------------------------------------------------- */

  class MinHeap {
    constructor() {
      this.nodes = [];
      this.scores = [];
    }

    get size() {
      return this.nodes.length;
    }

    push(node, score) {
      const nodes = this.nodes;
      const scores = this.scores;
      let index = nodes.length;
      nodes.push(node);
      scores.push(score);

      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (scores[parent] <= score) break;
        nodes[index] = nodes[parent];
        scores[index] = scores[parent];
        index = parent;
      }

      nodes[index] = node;
      scores[index] = score;
    }

    pop() {
      const nodes = this.nodes;
      const scores = this.scores;
      const top = nodes[0];
      const lastNode = nodes.pop();
      const lastScore = scores.pop();

      if (nodes.length) {
        let index = 0;
        const length = nodes.length;
        while (true) {
          const left = index * 2 + 1;
          const right = left + 1;
          let smallest = index;
          if (left < length && scores[left] < scores[smallest]) smallest = left;
          if (right < length && scores[right] < scores[smallest]) smallest = right;
          if (smallest === index) break;
          nodes[index] = nodes[smallest];
          scores[index] = scores[smallest];
          index = smallest;
        }
        nodes[index] = lastNode;
        scores[index] = lastScore;
      }

      return top;
    }
  }

  function solveMaze(maze) {
    const { cols, rows, walls } = maze;
    const total = cols * rows;
    const start = 0;
    const goal = total - 1;
    const goalX = goal % cols;
    const goalY = Math.floor(goal / cols);

    const gScore = new Float64Array(total);
    gScore.fill(Infinity);
    const cameFrom = new Int32Array(total);
    cameFrom.fill(-1);
    const closed = new Uint8Array(total);
    const visitedOrder = [];

    const heuristic = (node) => {
      const x = node % cols;
      const y = Math.floor(node / cols);
      return Math.abs(x - goalX) + Math.abs(y - goalY);
    };

    const open = new MinHeap();
    gScore[start] = 0;
    open.push(start, heuristic(start));

    const startedAt =
      typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

    while (open.size) {
      const current = open.pop();
      if (closed[current]) continue;
      closed[current] = 1;
      visitedOrder.push(current);

      if (current === goal) break;

      const x = current % cols;
      const y = Math.floor(current / cols);

      for (let d = 0; d < DIRECTIONS.length; d += 1) {
        const direction = DIRECTIONS[d];
        if (walls[current * 4 + direction.wall] !== 0) continue;
        const nx = x + direction.dx;
        const ny = y + direction.dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;

        const neighbour = ny * cols + nx;
        if (closed[neighbour]) continue;

        const tentative = gScore[current] + 1;
        if (tentative >= gScore[neighbour]) continue;

        cameFrom[neighbour] = current;
        gScore[neighbour] = tentative;
        open.push(neighbour, tentative + heuristic(neighbour));
      }
    }

    const path = [];
    if (cameFrom[goal] !== -1 || goal === start) {
      let node = goal;
      path.push(node);
      while (node !== start) {
        node = cameFrom[node];
        if (node === -1) break;
        path.push(node);
      }
      path.reverse();
    }

    const finishedAt =
      typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

    return {
      visited: visitedOrder,
      path: path[0] === start ? path : [],
      ms: Math.max(0, finishedAt - startedAt),
    };
  }

  /* ---------------------------------------------------------
     Canvas renderer
     --------------------------------------------------------- */

  const MAZE_COLORS = {
    background: '#020912',
    glow: 'rgba(35, 212, 245, 0.11)',
    visited: 'rgba(35, 212, 245, 0.105)',
    wallGlow: 'rgba(35, 212, 245, 0.16)',
    wall: 'rgba(148, 240, 255, 0.7)',
    pathGlow: 'rgba(114, 255, 192, 0.22)',
    path: '#8dffd0',
    start: '#72ffc0',
    goal: '#ffb454',
  };

  class MazeView {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.cols = options.cols || 17;
      this.rows = options.rows || this.cols;
      this.algorithm = options.algorithm || 'prim';
      this.bias = typeof options.bias === 'number' ? options.bias : 0.68;
      this.onStatus = options.onStatus || (() => {});
      this.onStats = options.onStats || (() => {});
      this.maze = null;
      this.solution = null;
      this.visitedCount = 0;
      this.pathRevealed = false;
      this.frame = 0;
      this.width = 0;
      this.height = 0;
      this.destroyed = false;

      this.handleResize = this.resize.bind(this);
      this.resize();

      if ('ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(canvas);
      } else {
        window.addEventListener('resize', this.handleResize);
      }
    }

    resize() {
      if (this.destroyed) return;
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height || rect.width));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bufferWidth = Math.round(width * dpr);
      const bufferHeight = Math.round(height * dpr);

      if (this.canvas.width !== bufferWidth || this.canvas.height !== bufferHeight) {
        this.canvas.width = bufferWidth;
        this.canvas.height = bufferHeight;
      }

      this.width = width;
      this.height = height;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.draw();
    }

    cancelAnimation() {
      if (this.frame) {
        window.cancelAnimationFrame(this.frame);
        this.frame = 0;
      }
    }

    generate() {
      this.cancelAnimation();
      this.maze = generateMaze(this.cols, this.rows, this.algorithm, this.bias);
      this.solution = null;
      this.visitedCount = 0;
      this.pathRevealed = false;
      this.draw();
      this.onStatus('READY', false);
      this.onStats({
        cells: this.cols * this.rows,
        nodes: 0,
        path: null,
        time: null,
      });
    }

    solve(options = {}) {
      if (!this.maze) this.generate();
      this.cancelAnimation();

      const solution = solveMaze(this.maze);
      this.solution = solution;
      this.visitedCount = 0;
      this.pathRevealed = false;
      this.onStatus('SEARCHING', false);
      this.onStats({
        cells: this.cols * this.rows,
        nodes: 0,
        path: null,
        time: null,
      });

      const animate = options.animate !== false && !prefersReducedMotion();
      const finish = () => {
        this.visitedCount = solution.visited.length;
        this.pathRevealed = true;
        this.draw();
        this.onStatus(solution.path.length ? 'SOLVED' : 'NO PATH', Boolean(solution.path.length));
        this.onStats({
          cells: this.cols * this.rows,
          nodes: solution.visited.length,
          path: solution.path.length || null,
          time: solution.ms,
        });
        if (typeof options.onComplete === 'function') options.onComplete(solution);
      };

      if (!animate) {
        finish();
        return;
      }

      const total = solution.visited.length;
      const duration = Math.min(2300, Math.max(1050, total * 4.5));
      const startTime = performance.now();
      let lastReport = 0;

      const tick = (now) => {
        if (this.destroyed) return;
        const progress = Math.min(1, (now - startTime) / duration);
        this.visitedCount = Math.floor(progress * total);
        this.draw();

        if (now - lastReport > 90) {
          lastReport = now;
          this.onStats({
            cells: this.cols * this.rows,
            nodes: this.visitedCount,
            path: null,
            time: null,
          });
        }

        if (progress < 1) {
          this.frame = raf(tick);
        } else {
          this.frame = 0;
          finish();
        }
      };

      this.frame = raf(tick);
    }

    draw() {
      const ctx = this.ctx;
      const width = this.width;
      const height = this.height;
      if (!ctx || !width || !height) return;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = MAZE_COLORS.background;
      ctx.fillRect(0, 0, width, height);

      const radial = ctx.createRadialGradient(
        width * 0.5,
        height * 0.24,
        0,
        width * 0.5,
        height * 0.24,
        width * 0.88
      );
      radial.addColorStop(0, MAZE_COLORS.glow);
      radial.addColorStop(0.58, 'rgba(35, 212, 245, 0.02)');
      radial.addColorStop(1, 'rgba(2, 9, 18, 0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, width, height);

      if (!this.maze) return;

      const layout = this.getLayout();
      const { cell, ox, oy } = layout;

      if (this.solution && this.visitedCount > 0) {
        const limit = Math.min(this.visitedCount, this.solution.visited.length);
        ctx.fillStyle = MAZE_COLORS.visited;
        for (let i = 0; i < limit; i += 1) {
          const node = this.solution.visited[i];
          const x = node % this.cols;
          const y = Math.floor(node / this.cols);
          ctx.fillRect(ox + x * cell + 0.5, oy + y * cell + 0.5, cell - 1, cell - 1);
        }
      }

      if (this.solution && this.pathRevealed && this.solution.path.length > 1) {
        const path = this.solution.path;
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < path.length; i += 1) {
          const node = path[i];
          const x = node % this.cols;
          const y = Math.floor(node / this.cols);
          const px = ox + (x + 0.5) * cell;
          const py = oy + (y + 0.5) * cell;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = MAZE_COLORS.pathGlow;
        ctx.lineWidth = Math.max(5, cell * 0.34);
        ctx.stroke();
        ctx.strokeStyle = MAZE_COLORS.path;
        ctx.lineWidth = Math.max(1.4, cell * 0.12);
        ctx.shadowColor = 'rgba(114, 255, 192, 0.8)';
        ctx.shadowBlur = Math.max(5, cell * 0.38);
        ctx.stroke();
        ctx.restore();
      }

      this.drawWalls(layout);
      this.drawMarkers(layout);
    }

    getLayout() {
      const pad = Math.min(this.width, this.height) * 0.052;
      const cell = Math.min(
        (this.width - pad * 2) / this.cols,
        (this.height - pad * 2) / this.rows
      );
      const mazeWidth = cell * this.cols;
      const mazeHeight = cell * this.rows;
      return {
        cell,
        ox: (this.width - mazeWidth) / 2,
        oy: (this.height - mazeHeight) / 2,
      };
    }

    drawWalls(layout) {
      const { cell, ox, oy } = layout;
      const { cols, rows, walls } = this.maze;
      const ctx = this.ctx;

      ctx.save();
      ctx.beginPath();

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const base = (y * cols + x) * 4;
          const left = ox + x * cell;
          const top = oy + y * cell;
          const right = left + cell;
          const bottom = top + cell;

          if (walls[base] === 1) {
            ctx.moveTo(left, top);
            ctx.lineTo(right, top);
          }
          if (walls[base + 3] === 1) {
            ctx.moveTo(left, top);
            ctx.lineTo(left, bottom);
          }
          if (y === rows - 1 && walls[base + 2] === 1) {
            ctx.moveTo(left, bottom);
            ctx.lineTo(right, bottom);
          }
          if (x === cols - 1 && walls[base + 1] === 1) {
            ctx.moveTo(right, top);
            ctx.lineTo(right, bottom);
          }
        }
      }

      ctx.lineCap = 'round';
      ctx.strokeStyle = MAZE_COLORS.wallGlow;
      ctx.lineWidth = Math.max(3, cell * 0.24);
      ctx.stroke();
      ctx.strokeStyle = MAZE_COLORS.wall;
      ctx.lineWidth = Math.max(1.1, cell * 0.075);
      ctx.stroke();
      ctx.restore();
    }

    drawMarkers(layout) {
      const { cell, ox, oy } = layout;
      const ctx = this.ctx;

      const drawDot = (x, y, color, radius, ring) => {
        const cx = ox + (x + 0.5) * cell;
        const cy = oy + (y + 0.5) * cell;

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = Math.max(6, cell * 0.8);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (ring) {
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1.2, cell * 0.07);
          ctx.beginPath();
          ctx.arc(cx, cy, radius * 2.35, 0, Math.PI * 2);
          ctx.stroke();
        }
      };

      drawDot(0, 0, MAZE_COLORS.start, Math.max(2.4, cell * 0.16), false);
      drawDot(
        this.cols - 1,
        this.rows - 1,
        MAZE_COLORS.goal,
        Math.max(2.2, cell * 0.13),
        true
      );
    }

    destroy() {
      this.destroyed = true;
      this.cancelAnimation();
      if (this.resizeObserver) this.resizeObserver.disconnect();
      else window.removeEventListener('resize', this.handleResize);
    }
  }

  /* ---------------------------------------------------------
     Hero maze preview
     --------------------------------------------------------- */

  function initHeroMaze() {
    const root = $('[data-maze-preview]');
    const canvas = $('[data-maze-canvas]', root || document);
    if (!root || !canvas) return;

    const statusElement = $('[data-maze-status]', root);
    const nodesElement = $('[data-maze-nodes]', root);
    const pathElement = $('[data-maze-path]', root);
    const timeElement = $('[data-maze-time]', root);
    const newButton = $('[data-maze-new]', root);

    const view = new MazeView(canvas, {
      cols: 17,
      rows: 17,
      algorithm: 'prim',
      bias: 0.68,
      onStatus(text, solved) {
        if (!statusElement) return;
        statusElement.textContent = text;
        statusElement.classList.toggle('is-solved', Boolean(solved));
      },
      onStats(stats) {
        if (nodesElement) {
          nodesElement.textContent = stats.nodes ? numberFormat.format(stats.nodes) : '0';
        }
        if (pathElement) {
          pathElement.textContent = stats.path ? numberFormat.format(stats.path) : '—';
        }
        if (timeElement) {
          timeElement.textContent = stats.time === null ? '—' : formatMs(stats.time);
        }
      },
    });

    let visible = true;
    let started = false;
    let paused = false;
    let pending = 0;
    let alternate = false;

    function startCycle() {
      window.clearTimeout(pending);
      if (prefersReducedMotion()) {
        view.algorithm = 'prim';
        view.generate();
        view.solve({ animate: false });
        return;
      }
      if (!visible || paused) return;

      alternate = !alternate;
      view.algorithm = alternate ? 'growing' : 'prim';
      view.bias = alternate ? 0.42 + Math.random() * 0.42 : 0.68;
      view.generate();

      pending = window.setTimeout(() => {
        view.solve({
          animate: true,
          onComplete() {
            if (paused || !visible || prefersReducedMotion()) return;
            pending = window.setTimeout(startCycle, 3500);
          },
        });
      }, 520);
    }

    if (newButton) {
      newButton.addEventListener('click', () => {
        started = true;
        paused = false;
        view.cancelAnimation();
        startCycle();
      });
    }

    if (prefersReducedMotion()) {
      started = true;
      startCycle();
      return;
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          visible = entry.isIntersecting;

          if (visible) {
            if (paused || !started) {
              paused = false;
              started = true;
              startCycle();
            }
          } else {
            paused = true;
            window.clearTimeout(pending);
            view.cancelAnimation();
          }
        },
        { threshold: 0.12 }
      );
      observer.observe(root);
    } else {
      started = true;
      startCycle();
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        window.clearTimeout(pending);
        view.cancelAnimation();
      } else if (visible) {
        paused = false;
        if (!started) started = true;
        startCycle();
      }
    });

    window.addEventListener('beforeunload', () => view.destroy());
  }

  /* ---------------------------------------------------------
     Interactive Maze Lab
     --------------------------------------------------------- */

  function initLabMaze() {
    const lab = $('[data-maze-lab]');
    if (!lab) return;

    const canvas = $('[data-lab-canvas]', lab);
    if (!canvas) return;

    const statusElement = $('[data-lab-status]', lab);
    const algorithmLabel = $('[data-lab-alg-label]', lab);
    const cellsElement = $('[data-lab-cells]', lab);
    const nodesElement = $('[data-lab-nodes]', lab);
    const pathElement = $('[data-lab-path]', lab);
    const timeElement = $('[data-lab-time]', lab);
    const biasInput = $('[data-lab-bias]', lab);
    const biasOutput = $('[data-lab-bias-value]', lab);
    const biasRow = biasInput ? biasInput.closest('.range-row') : null;
    const generateButton = $('[data-lab-generate]', lab);
    const solveButton = $('[data-lab-solve]', lab);
    const algorithmButtons = $$('[data-algorithm]', lab);

    let algorithm = 'prim';
    let bias = biasInput ? Number(biasInput.value) / 100 : 0.68;
    let started = false;
    let visible = true;
    let paused = false;
    let autoSolved = false;
    let pending = 0;

    function setStatus(text, solved) {
      if (!statusElement) return;
      statusElement.textContent = text;
      statusElement.classList.toggle('is-solved', Boolean(solved));
    }

    function reportStats(stats) {
      if (cellsElement) cellsElement.textContent = numberFormat.format(stats.cells);
      if (nodesElement) {
        nodesElement.textContent = stats.nodes ? numberFormat.format(stats.nodes) : '—';
      }
      if (pathElement) {
        pathElement.textContent = stats.path ? numberFormat.format(stats.path) : '—';
      }
      if (timeElement) {
        timeElement.textContent = stats.time === null ? '—' : formatMs(stats.time);
      }
    }

    const view = new MazeView(canvas, {
      cols: 21,
      rows: 21,
      algorithm,
      bias,
      onStatus(text, solved) {
        setStatus(text, solved);
      },
      onStats: reportStats,
    });

    function updateAlgorithmUI() {
      algorithmButtons.forEach((button) => {
        const active = button.dataset.algorithm === algorithm;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      if (algorithmLabel) {
        algorithmLabel.textContent = algorithm === 'prim' ? 'PRIMZ' : 'GROWING TREE';
      }
      if (biasInput) biasInput.disabled = algorithm === 'prim';
      if (biasRow) biasRow.classList.toggle('is-disabled', algorithm === 'prim');
    }

    function generate(options = {}) {
      window.clearTimeout(pending);
      setStatus('GENERATING', false);
      if (nodesElement) nodesElement.textContent = '—';
      if (pathElement) pathElement.textContent = '—';
      if (timeElement) timeElement.textContent = '—';

      pending = window.setTimeout(() => {
        view.algorithm = algorithm;
        view.bias = bias;
        view.generate();

        if (prefersReducedMotion()) {
          view.solve({ animate: false });
          autoSolved = true;
          return;
        }

        if (options.autoSolve && visible && !paused) {
          autoSolved = true;
          pending = window.setTimeout(() => {
            if (!visible || paused) return;
            view.solve({ animate: true });
          }, 620);
        }
      }, 140);
    }

    updateAlgorithmUI();

    algorithmButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const next = button.dataset.algorithm;
        if (next !== 'prim' && next !== 'growing') return;
        if (next === algorithm) return;
        algorithm = next;
        updateAlgorithmUI();
        generate();
      });
    });

    let biasTimer = 0;
    if (biasInput) {
      biasInput.addEventListener('input', () => {
        bias = Number(biasInput.value) / 100;
        if (biasOutput) biasOutput.textContent = `${biasInput.value}%`;
        window.clearTimeout(biasTimer);
        if (algorithm !== 'growing') return;
        biasTimer = window.setTimeout(() => {
          if (started && visible && !paused) generate();
        }, 220);
      });
    }

    if (generateButton) {
      generateButton.addEventListener('click', () => {
        started = true;
        paused = false;
        generate();
      });
    }

    if (solveButton) {
      solveButton.addEventListener('click', () => {
        started = true;
        paused = false;
        window.clearTimeout(pending);
        view.solve({ animate: true });
      });
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          visible = entry.isIntersecting;

          if (visible) {
            if (!started) {
              started = true;
              paused = false;
              generate({ autoSolve: !autoSolved });
            } else if (paused) {
              paused = false;
              generate();
            }
          } else if (started) {
            paused = true;
            window.clearTimeout(pending);
            view.cancelAnimation();
          }
        },
        { threshold: 0.15 }
      );
      observer.observe(lab);
    } else {
      started = true;
      generate({ autoSolve: true });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        window.clearTimeout(pending);
        view.cancelAnimation();
      }
    });

    window.addEventListener('beforeunload', () => view.destroy());
  }

  /* ---------------------------------------------------------
     Init
     --------------------------------------------------------- */

  function init() {
    const year = new Date().getFullYear();
    $$('[data-year]').forEach((element) => {
      element.textContent = String(year);
    });

    currentPlatform = detectPlatform();
    initHeader();
    initReveal();
    initTabs();
    initCopyButtons();
    initReleases();
    initHeroMaze();
    initLabMaze();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
