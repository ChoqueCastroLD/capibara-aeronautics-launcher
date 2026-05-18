let state = {};
let javaPath = null;
let isInstalling = false;
let gameRunning = false;
let isDownloadingJava = false;
let isOnline = navigator.onLine;

const $ = (id) => document.getElementById(id);

const javaStatus = $('java-status');
const btnDownloadJava = $('btn-download-java');
const usernameInput = $('username-input');
const ramSlider = $('ram-slider');
const ramValue = $('ram-value');
const progressWrap = $('progress-wrap');
const progressFill = $('progress-fill');
const progressLabel = $('progress-label');
const btnPlay = $('btn-play');
const btnUninstall = $('btn-uninstall');
const gpuSelect = $('gpu-select');

// ── Mapa ──────────────────────────────────────────────────────────────────
const mapPanel = $('map-panel');
const btnToggleMap = $('btn-toggle-map');

function applyMapVisible(visible) {
  if (visible) {
    mapPanel.classList.remove('hidden');
    btnToggleMap.style.opacity = '1';
    document.body.classList.remove('map-hidden');
  } else {
    mapPanel.classList.add('hidden');
    btnToggleMap.style.opacity = '0.4';
    document.body.classList.add('map-hidden');
  }
  window.api.saveState({ mapVisible: visible });
}

btnToggleMap.addEventListener('click', () => {
  const nowVisible = mapPanel.classList.contains('hidden');
  applyMapVisible(nowVisible);
});

// ── Tema ──────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

$('btn-toggle-theme').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
  window.api.saveState({ theme: next });
});

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  window.api.getAppVersion().then((v) => {
    const t = `Capibara Aeronautics Launcher v${v}`;
    $('titlebar-title').textContent = t;
    document.title = t;
  }).catch(() => {});

  state = await window.api.getState();
  if (state.username) usernameInput.value = state.username;
  refreshSkin();
  const ram = Math.max(4, state.ram || 6);
  ramSlider.value = ram; ramValue.textContent = `${ram} GB`;

  let mapVisible;
  if (state.mapVisible === undefined) {
    // Primera vez: ocultar el mapa por defecto en PCs con < 12 GB de RAM
    let totalRam = 16;
    try { totalRam = await window.api.getTotalRamGB(); } catch {}
    mapVisible = totalRam >= 12;
  } else {
    mapVisible = state.mapVisible !== false;
  }
  applyMapVisible(mapVisible);

  applyTheme(state.theme === 'light' ? 'light' : 'dark');

  window.addEventListener('online', () => { isOnline = true; updateUI(); refreshServerStatus(); });
  window.addEventListener('offline', () => { isOnline = false; updateUI(); });

  // UI interactiva de inmediato; las detecciones corren en paralelo y
  // actualizan su sección al terminar (no bloquean el arranque).
  updateUI();

  gpuSelect.addEventListener('change', () => {
    window.api.saveState({ gpuPref: parseInt(gpuSelect.value) });
    flashGpuSaved();
  });

  detectJava().then(updateUI);

  window.api.detectGpus().then((gpus) => {
    gpuSelect.innerHTML = '';
    const dedicated = gpus.filter(g => g.type === 'dedicated');
    const integrated = gpus.filter(g => g.type === 'integrated');
    if (dedicated.length > 0) {
      dedicated.forEach(g => {
        const opt = document.createElement('option');
        opt.value = '2';
        opt.textContent = g.name;
        gpuSelect.appendChild(opt);
      });
    } else {
      const opt = document.createElement('option'); opt.value = '2'; opt.textContent = 'Dedicada (alto rendimiento)'; gpuSelect.appendChild(opt);
    }
    if (integrated.length > 0) {
      integrated.forEach(g => {
        const opt = document.createElement('option');
        opt.value = '1';
        opt.textContent = g.name;
        gpuSelect.appendChild(opt);
      });
    } else {
      const opt = document.createElement('option'); opt.value = '1'; opt.textContent = 'Integrada (ahorro energía)'; gpuSelect.appendChild(opt);
    }
    const autoOpt = document.createElement('option'); autoOpt.value = '0'; autoOpt.textContent = 'Automático (sistema)'; gpuSelect.appendChild(autoOpt);
    gpuSelect.value = String(state.gpuPref ?? 2);
  });

  // Pre-cargar Steve al caché (sin tocar la skin actual)
  prefetchSteve();

  // Verificar actualizaciones en segundo plano
  if (state.installed) {
    window.api.checkForUpdates().then((result) => {
      if (result.hasUpdate) {
        const banner = $('update-banner');
        $('update-text').textContent = `Nueva versión disponible — v${result.latest.version}`;
        banner.classList.remove('hidden');
        banner.dataset.mrpackUrl = result.latest.mrpack_url || '';
        banner.dataset.version = result.latest.version;
        if (result.latest.changelog) {
          banner.dataset.changelog = result.latest.changelog;
          $('btn-changelog').classList.remove('hidden');
        }
      }
    }).catch(() => {});
  }

  window.api.onInstallProgress((p) => {
    progressWrap.classList.remove('hidden');
    progressFill.style.width = `${p.percent}%`;
    progressLabel.textContent = p.message;
    if (isInstalling) {
      progressWrap.classList.add('install-mode');
      btnPlay.style.setProperty('--progress', `${p.percent}%`);
      btnPlay.textContent = `INSTALANDO ${p.percent}%`;
    } else {
      progressWrap.classList.remove('install-mode');
    }
  });

  window.api.onGameClosed((code) => {
    gameRunning = false;
    progressWrap.classList.add('hidden');
    updateUI();
    if (code !== 0) {
      $('crash-msg').innerHTML = `El juego se cerró inesperadamente (código ${code}). Para que podamos ayudarte, copia o abre el log y envíalo por el canal <strong>#soporte</strong> del Discord.`;
      $('crash-overlay').classList.remove('hidden');
    }
  });
}

// ── Java ──────────────────────────────────────────────────────────────────
async function detectJava() {
  javaStatus.textContent = 'Detectando Java...';
  javaStatus.className = 'java-status';

  const installations = await window.api.detectJava();

  // Intentar usar Java guardado o el mejor disponible
  let best = installations.find((j) => j.path === state.javaPath)
    || installations.find((j) => j.major >= 21)
    || installations.find((j) => j.major >= 17)
    || installations[0];

  if (best) {
    javaPath = best.path;
    if (best.major === 21) {
      javaStatus.textContent = `✓ Java 21 detectado`;
      javaStatus.className = 'java-status ok';
      btnDownloadJava.classList.add('hidden');
    } else if (best.major > 21) {
      javaStatus.textContent = `⚠ Java ${best.major} no compatible — NeoForge requiere Java 21`;
      javaStatus.className = 'java-status warn';
      javaPath = null;
      btnDownloadJava.classList.remove('hidden');
    } else if (best.major >= 17) {
      javaStatus.textContent = `⚠ Java ${best.major} detectado (se recomienda Java 21)`;
      javaStatus.className = 'java-status warn';
      btnDownloadJava.classList.add('hidden');
    } else {
      javaStatus.textContent = `✗ Java ${best.major} no compatible — NeoForge requiere Java 21`;
      javaStatus.className = 'java-status err';
      javaPath = null;
      btnDownloadJava.classList.remove('hidden');
    }
  } else {
    javaPath = null;
    javaStatus.textContent = '✗ Java no encontrado';
    javaStatus.className = 'java-status err';
    btnDownloadJava.classList.remove('hidden');
  }
}

btnDownloadJava.addEventListener('click', async () => {
  if (isDownloadingJava) return;
  isDownloadingJava = true;
  btnDownloadJava.disabled = true;
  btnDownloadJava.classList.add('loading');
  btnDownloadJava.querySelector('.java-btn-text').textContent = 'Descargando... 0%';
  javaStatus.textContent = 'Descargando Java 21...';
  javaStatus.className = 'java-status warn';
  progressWrap.classList.remove('hidden', 'install-mode');

  window.api.onJavaProgress((p) => {
    progressFill.style.width = `${p.percent}%`;
    progressLabel.textContent = p.phase;
    btnDownloadJava.querySelector('.java-btn-text').textContent = `${p.phase}... ${p.percent}%`;
  });

  const result = await window.api.downloadJava();
  btnDownloadJava.classList.remove('loading');
  btnDownloadJava.querySelector('.java-btn-text').textContent = 'Descargar Java 21';
  if (result) {
    javaPath = result.path;
    javaStatus.textContent = '✓ Java 21 instalado';
    javaStatus.className = 'java-status ok';
    btnDownloadJava.classList.add('hidden');
    state.javaPath = javaPath;
    window.api.saveState({ javaPath });
  } else {
    javaStatus.textContent = '✗ Error al descargar Java';
    javaStatus.className = 'java-status err';
  }

  isDownloadingJava = false;
  progressWrap.classList.add('hidden');
  updateUI();
});

// ── Username & RAM ─────────────────────────────────────────────────────────
const skinHead = $('skin-head');
const skinMemCache = new Map();
const STEVE_NAME = 'MHF_Steve';
let skinTimer = null;
let skinReqId = 0;

function isValidUsername(name) {
  return /^[a-zA-Z0-9_]{3,16}$/.test(name);
}

function setSkinSrc(file) {
  skinHead.onload = () => skinHead.classList.add('loaded');
  skinHead.onerror = () => loadSteve();
  if (file) skinHead.src = file.startsWith('file:') ? file : `file:///${file.replace(/\\/g, '/')}`;
}

async function prefetchSteve() {
  const key = STEVE_NAME.toLowerCase();
  if (skinMemCache.has(key)) return;
  const file = await window.api.getSkin(STEVE_NAME);
  if (file) skinMemCache.set(key, file);
}

async function loadSteve() {
  await prefetchSteve();
  const file = skinMemCache.get(STEVE_NAME.toLowerCase());
  if (file) setSkinSrc(file);
  else skinHead.classList.remove('loaded');
}

async function refreshSkin() {
  const name = usernameInput.value.trim();
  const valid = isValidUsername(name);
  usernameInput.classList.toggle('invalid', name.length > 0 && !valid);

  if (!valid) {
    loadSteve();
    return;
  }
  const key = name.toLowerCase();
  if (skinMemCache.has(key)) {
    const cached = skinMemCache.get(key);
    if (cached) setSkinSrc(cached);
    else loadSteve();
    return;
  }
  const myReq = ++skinReqId;
  const file = await window.api.getSkin(name);
  if (myReq !== skinReqId) return;
  skinMemCache.set(key, file);
  if (!file) loadSteve();
  else setSkinSrc(file);
}

const skinWrap = $('skin-wrap');
document.addEventListener('mousemove', (e) => {
  if (!skinHead.classList.contains('loaded')) return;
  const rect = skinHead.getBoundingClientRect();
  if (!rect.width) return;
  const cx = rect.left + rect.width / 2;
  const flip = e.clientX < cx ? -1 : 1;
  skinWrap.style.transform = `scaleX(${flip})`;
});

usernameInput.addEventListener('input', () => {
  usernameInput.value = usernameInput.value.replace(/[^a-zA-Z0-9_]/g, '');
  window.api.saveState({ username: usernameInput.value });
  clearTimeout(skinTimer);
  skinTimer = setTimeout(refreshSkin, 500);
  updateUI();
});

ramSlider.addEventListener('input', () => {
  const v = parseInt(ramSlider.value);
  ramValue.textContent = `${v} GB`;
  window.api.saveState({ ram: v });
});

// ── Botón principal ────────────────────────────────────────────────────────
btnPlay.addEventListener('click', async () => {
  if (gameRunning || isInstalling) return;
  if (!navigator.onLine) {
    isOnline = false;
    updateUI();
    alert('Sin conexión a internet. Conéctate para instalar o jugar.');
    return;
  }

  const username = usernameInput.value.trim();
  const ram = parseInt(ramSlider.value);

  if (!state.installed) {
    // Instalar
    isInstalling = true;
    progressWrap.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressFill.style.background = '';
    updateUI();

    const result = await window.api.installModpack({ javaPath, ram, version: '2.1' });
    isInstalling = false;

    if (result.ok) {
      state.installed = true;
      state.installedVersion = '2.1';
      progressLabel.textContent = '✓ ¡Instalación completa!';
      setTimeout(() => progressWrap.classList.add('hidden'), 3000);
    } else {
      progressFill.style.width = '100%';
      progressFill.style.background = 'var(--red)';
      progressLabel.textContent = `✗ Error: ${result.error}`;
      alert(`Error durante la instalación:\n\n${result.error}\n\nUsa "Ver logs" para más detalles.`);
      setTimeout(() => { progressWrap.classList.add('hidden'); progressFill.style.background = ''; }, 8000);
    }
    updateUI();
  } else {
    // Jugar
    gameRunning = true;
    updateUI();

    const result = await window.api.launchGame({ username, javaPath, ram, gpuPref: parseInt(gpuSelect.value) });
    if (!result.ok) {
      gameRunning = false;
      alert(`No se pudo lanzar el juego:\n${result.error}`);
      updateUI();
    }
  }
});

// ── Forzar cierre ──────────────────────────────────────────────────────────
$('btn-kill').addEventListener('click', async () => {
  if (!gameRunning) return;
  if (!confirm('¿Forzar el cierre del juego? Se perderá el progreso no guardado.')) return;
  await window.api.killGame();
});

// ── Desinstalar ────────────────────────────────────────────────────────────
btnUninstall.addEventListener('click', () => $('modal-overlay').classList.remove('hidden'));
$('modal-cancel').addEventListener('click', () => $('modal-overlay').classList.add('hidden'));

$('modal-confirm').addEventListener('click', async () => {
  $('modal-overlay').classList.add('hidden');
  progressWrap.classList.remove('hidden');
  progressFill.style.width = '0%';

  const result = await window.api.uninstallModpack();
  if (result.ok) {
    state.installed = false;
    state.installedVersion = null;
    progressLabel.textContent = '✓ Desinstalado';
    setTimeout(() => progressWrap.classList.add('hidden'), 2000);
  } else {
    progressLabel.textContent = `Error: ${result.error}`;
    setTimeout(() => progressWrap.classList.add('hidden'), 3000);
  }
  updateUI();
});

// ── Feedback GPU ──────────────────────────────────────────────────────────
let gpuFlashTimer = null;
function flashGpuSaved() {
  const label = document.querySelector('.gpu-label');
  if (!label) return;
  const prev = label.textContent;
  label.textContent = '✓';
  label.style.color = 'var(--green)';
  clearTimeout(gpuFlashTimer);
  gpuFlashTimer = setTimeout(() => {
    label.textContent = prev;
    label.style.color = '';
  }, 1200);
}

// ── Markdown mínimo ────────────────────────────────────────────────────────
function renderMarkdown(md) {
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lines = md.split(/\r?\n/);
  const out = [];
  let inList = false;
  for (let line of lines) {
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + inlineMd(esc(line.replace(/^\s*[-*]\s+/, ''))) + '</li>');
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      if (/^###\s+/.test(line)) out.push('<h3>' + inlineMd(esc(line.replace(/^###\s+/, ''))) + '</h3>');
      else if (/^##\s+/.test(line)) out.push('<h2>' + inlineMd(esc(line.replace(/^##\s+/, ''))) + '</h2>');
      else if (/^#\s+/.test(line)) out.push('<h1>' + inlineMd(esc(line.replace(/^#\s+/, ''))) + '</h1>');
      else if (line.trim() === '') out.push('<br>');
      else out.push('<p>' + inlineMd(esc(line)) + '</p>');
    }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}
function inlineMd(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

// ── Modal changelog ────────────────────────────────────────────────────────
$('btn-changelog').addEventListener('click', () => {
  const banner = $('update-banner');
  const md = banner.dataset.changelog || '';
  $('changelog-title').textContent = `Novedades — v${banner.dataset.version || ''}`;
  $('changelog-body').innerHTML = renderMarkdown(md);
  $('changelog-overlay').classList.remove('hidden');
});
$('changelog-close').addEventListener('click', () => $('changelog-overlay').classList.add('hidden'));
$('changelog-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'changelog-overlay') $('changelog-overlay').classList.add('hidden');
});

// ── Modal crash del juego ─────────────────────────────────────────────────
$('crash-copy').addEventListener('click', async () => {
  await window.api.copyLogs();
  const b = $('crash-copy');
  b.textContent = '¡Copiado!';
  setTimeout(() => { b.textContent = 'Copiar log'; }, 1500);
});
$('crash-open').addEventListener('click', () => window.api.openLogs());
$('crash-close').addEventListener('click', () => $('crash-overlay').classList.add('hidden'));
$('crash-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'crash-overlay') $('crash-overlay').classList.add('hidden');
});

// ── Modal modlist ─────────────────────────────────────────────────────────
let allMods = [];
function renderModlist(filter = '') {
  const body = $('modlist-body');
  const f = filter.toLowerCase();
  const filtered = f ? allMods.filter(m => m.name.toLowerCase().includes(f)) : allMods;
  body.innerHTML = filtered.length
    ? filtered.map(m => `<div class="modlist-item"><span class="mod-name">${m.name}</span><span class="mod-size">${m.sizeMB} MB</span></div>`).join('')
    : '<div style="color:var(--muted);text-align:center;padding:20px">Sin mods</div>';
  $('modlist-count').textContent = `(${filtered.length}${filter && filtered.length !== allMods.length ? ` / ${allMods.length}` : ''})`;
}
$('btn-modlist').addEventListener('click', async () => {
  $('modlist-search').value = '';
  allMods = await window.api.listMods();
  renderModlist();
  $('modlist-overlay').classList.remove('hidden');
});
$('modlist-close').addEventListener('click', () => $('modlist-overlay').classList.add('hidden'));
$('modlist-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modlist-overlay') $('modlist-overlay').classList.add('hidden');
});
$('modlist-search').addEventListener('input', (e) => renderModlist(e.target.value));

// ── Enter para jugar ──────────────────────────────────────────────────────
usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !btnPlay.disabled) btnPlay.click();
});

// ── Servidor ───────────────────────────────────────────────────────────────
const serverDot = $('server-dot');
const serverDetail = $('server-detail');
const serverPlayers = $('server-players');

async function refreshServerStatus() {
  const s = await window.api.pingServer();
  if (s.online) {
    serverDot.className = 'server-dot online';
    serverDetail.textContent = s.motd.replace(/§./g, '') || s.version;
    serverPlayers.textContent = `${s.players}/${s.maxPlayers}`;
    serverPlayers.className = 'server-players';
  } else {
    serverDot.className = 'server-dot offline';
    serverDetail.textContent = 'Servidor offline';
    serverPlayers.textContent = '';
    serverPlayers.className = 'server-players offline';
  }
}

refreshServerStatus();
setInterval(refreshServerStatus, 30000);

// ── Actualizar ─────────────────────────────────────────────────────────────
$('btn-update').addEventListener('click', async () => {
  if (gameRunning || isInstalling) return;
  if (!navigator.onLine) {
    isOnline = false;
    updateUI();
    alert('Sin conexión a internet. Conéctate para actualizar.');
    return;
  }
  const banner = $('update-banner');
  const newVersion = banner.dataset.version;
  const mrpackUrl = banner.dataset.mrpackUrl;

  isInstalling = true;
  progressWrap.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressFill.style.background = '';
  banner.classList.add('hidden');
  updateUI();

  const result = await window.api.installModpack({
    javaPath,
    ram: parseInt(ramSlider.value),
    mrpackUrl: mrpackUrl || undefined,
    version: newVersion,
  });
  isInstalling = false;

  if (result.ok) {
    state.installed = true;
    state.installedVersion = newVersion;
    progressLabel.textContent = `✓ ¡Actualización a v${newVersion} completada!`;
    setTimeout(() => progressWrap.classList.add('hidden'), 3000);
  } else {
    progressFill.style.width = '100%';
    progressFill.style.background = 'var(--red)';
    progressLabel.textContent = `✗ Error: ${result.error}`;
    setTimeout(() => { progressWrap.classList.add('hidden'); progressFill.style.background = ''; }, 8000);
  }
  updateUI();
});

// ── Logs ───────────────────────────────────────────────────────────────────
$('btn-open-dir').addEventListener('click', () => window.api.openGameDir());

$('btn-copy-logs').addEventListener('click', async () => {
  await window.api.copyLogs();
  const btn = $('btn-copy-logs');
  btn.textContent = '¡Copiado!';
  setTimeout(() => { btn.textContent = 'Copiar logs'; }, 1500);
});
$('btn-open-logs').addEventListener('click', () => window.api.openLogs());

// ── Ventana ────────────────────────────────────────────────────────────────
$('btn-minimize').addEventListener('click', () => window.api.minimize());
$('btn-maximize').addEventListener('click', () => window.api.maximize());
$('btn-close').addEventListener('click', () => window.api.close());

// ── UI ─────────────────────────────────────────────────────────────────────
function updateUI() {
  $('version-tag').textContent = `Modpack v${state.installedVersion || '2.1'}`;
  const locked = isInstalling || gameRunning;
  usernameInput.disabled = locked;
  ramSlider.disabled = locked;
  gpuSelect.disabled = locked;
  btnDownloadJava.disabled = locked || isDownloadingJava;

  const hasUsername = usernameInput.value.trim().length >= 3;
  const hasJava = !!javaPath;
  const ready = hasJava && hasUsername;

  const btnKill = $('btn-kill');
  btnKill.classList.toggle('hidden', !gameRunning);

  if (gameRunning) {
    btnPlay.textContent = 'JUGANDO...';
    btnPlay.className = 'play-btn running';
    btnPlay.disabled = true;
  } else if (isInstalling) {
    if (!btnPlay.classList.contains('installing')) {
      btnPlay.textContent = 'INSTALANDO 0%';
      btnPlay.style.setProperty('--progress', '0%');
    }
    btnPlay.className = 'play-btn installing';
    btnPlay.disabled = true;
  } else if (!isOnline) {
    btnPlay.textContent = 'SIN CONEXIÓN';
    btnPlay.className = 'play-btn offline';
    btnPlay.disabled = true;
  } else if (!state.installed) {
    btnPlay.className = 'play-btn install';
    btnPlay.disabled = !ready;
    if (ready) btnPlay.textContent = 'INSTALAR';
    else if (!hasJava) btnPlay.textContent = 'FALTA JAVA 21';
    else if (!hasUsername) btnPlay.textContent = 'ESCRIBE TU USUARIO';
    else btnPlay.textContent = 'INSTALAR';
  } else {
    btnPlay.className = 'play-btn';
    btnPlay.disabled = !ready;
    if (ready) btnPlay.textContent = 'JUGAR';
    else if (!hasJava) btnPlay.textContent = 'FALTA JAVA 21';
    else if (!hasUsername) btnPlay.textContent = 'ESCRIBE TU USUARIO';
    else btnPlay.textContent = 'JUGAR';
  }

  if (state.installed) {
    btnUninstall.classList.remove('hidden');
    $('btn-open-dir').classList.remove('hidden');
    $('btn-modlist').classList.remove('hidden');
  } else {
    btnUninstall.classList.add('hidden');
    $('btn-open-dir').classList.add('hidden');
    $('btn-modlist').classList.add('hidden');
  }
}

init();
