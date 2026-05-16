const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Tray, Menu } = require('electron');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');

const javaManager = require('./launcher/java');
const installer = require('./launcher/install');
const launcher = require('./launcher/launch');
const state = require('./launcher/state');
const updater = require('./launcher/updater');
const discord = require('./launcher/discord');
const ping = require('ping-minecraft-server');

let mainWindow;
let tray = null;
let isQuitting = false;
const TRAY_ICON = path.join(__dirname, '..', 'resources', 'icon.ico');

function showLauncher() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// Oculta al tray si existe; si no, minimiza (para no dejar la ventana inaccesible)
function hideToTray() {
  if (!mainWindow) return;
  if (tray) mainWindow.hide();
  else mainWindow.minimize();
}

function resolveTrayIcon() {
  const candidates = [
    TRAY_ICON,
    path.join(__dirname, '..', 'resources', 'logo.png'),
    path.join(process.resourcesPath || '', 'icon.ico'),
  ];
  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return c; } catch {}
  }
  return TRAY_ICON;
}

function createTray() {
  if (tray) return;
  try {
    const iconPath = resolveTrayIcon();
    tray = new Tray(iconPath);
    log(`[Tray] Icono: ${iconPath}`);
    tray.setToolTip('Capibara Aeronautics Launcher');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir launcher', click: showLauncher },
      { type: 'separator' },
      { label: 'Salir', click: () => { isQuitting = true; app.quit(); } },
    ]));
    tray.on('click', showLauncher);
    tray.on('double-click', showLauncher);
  } catch (e) {
    console.warn('[Tray] No se pudo crear:', e.message);
  }
}

// ── Log buffer ────────────────────────────────────────────────────────────────
const LOG_FILE = path.join(app.getPath('appData'), 'CapibaraAeronautics', 'launcher.log');
const logLines = [];

function log(line) {
  const entry = `[${new Date().toISOString()}] ${line}`;
  logLines.push(entry);
  if (logLines.length > 2000) logLines.shift();
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, entry + '\n');
  } catch {}
}

const MAP_W = 440;
const LAUNCHER_W = 480;
const WIN_H = 560;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: LAUNCHER_W + MAP_W,
    height: WIN_H,
    minWidth: LAUNCHER_W + MAP_W,
    minHeight: WIN_H,
    frame: false,
    resizable: true,
    icon: path.join(__dirname, '..', 'resources', 'icon.ico'),
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      hideToTray();
    }
  });
}

// Una sola instancia: si se abre de nuevo, enfoca la ya existente.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showLauncher());

  app.whenReady().then(() => {
    try {
      fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
      fs.writeFileSync(LOG_FILE, `=== Sesión iniciada ${new Date().toISOString()} ===\n`);
    } catch {}
    createWindow();
    createTray();
    setTimeout(() => clearEfficiencyMode(process.pid), 1500);
  });
}
app.on('window-all-closed', () => { if (isQuitting) app.quit(); });
app.on('before-quit', () => { isQuitting = true; });

// ── Ventana ───────────────────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window:close', () => hideToTray());
ipcMain.on('window:setMapVisible', (_e, visible) => {
  state.save({ mapVisible: visible });
});

// ── Skin cache ────────────────────────────────────────────────────────────────
const SKIN_CACHE_DIR = path.join(app.getPath('userData'), 'skin-cache');
const SKIN_TTL_MS = 24 * 60 * 60 * 1000;
const SKIN_CACHE_MAX = 50;

function pruneSkinCache() {
  try {
    const files = fs.readdirSync(SKIN_CACHE_DIR)
      .filter(f => f.endsWith('.png'))
      .map(f => {
        const p = path.join(SKIN_CACHE_DIR, f);
        return { p, mtime: fs.statSync(p).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    for (const entry of files.slice(SKIN_CACHE_MAX)) {
      try { fs.unlinkSync(entry.p); } catch {}
    }
  } catch {}
}

ipcMain.handle('skin:get', async (_e, username) => {
  if (!username || !/^[a-zA-Z0-9_]{3,16}$/.test(username)) return null;
  const safe = username.toLowerCase();
  const file = path.join(SKIN_CACHE_DIR, `${safe}.png`);
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < SKIN_TTL_MS && st.size > 0) {
      return file;
    }
  } catch {}
  try {
    fs.mkdirSync(SKIN_CACHE_DIR, { recursive: true });
    const res = await axios.get(`https://mc-heads.net/head/${encodeURIComponent(safe)}/96`, {
      responseType: 'arraybuffer',
      timeout: 8000,
    });
    fs.writeFileSync(file, Buffer.from(res.data));
    pruneSkinCache();
    return file;
  } catch (err) {
    log(`[Skin] Error descargando skin de ${username}: ${err.message}`);
    try {
      const st = fs.statSync(file);
      if (st.size > 0) return file;
    } catch {}
    return null;
  }
});

// ── Sistema ───────────────────────────────────────────────────────────────────
ipcMain.handle('system:totalRamGB', () => Math.round(os.totalmem() / (1024 ** 3)));

// ── Estado ────────────────────────────────────────────────────────────────────
ipcMain.handle('state:get', () => state.load());
ipcMain.handle('state:save', (_e, data) => state.save(data));

// ── Logs ──────────────────────────────────────────────────────────────────────
ipcMain.handle('logs:copy', () => {
  clipboard.writeText(logLines.join('\n'));
});
ipcMain.handle('logs:open', () => {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.writeFileSync(LOG_FILE, logLines.join('\n'));
    shell.openPath(LOG_FILE);
  } catch {}
});

// ── GPU ───────────────────────────────────────────────────────────────────────
function applyGpuPreference(javaPath, gpuPref) {
  try {
    execSync(`reg add "HKCU\\SOFTWARE\\Microsoft\\DirectX\\UserGpuPreferences" /v "${javaPath}" /t REG_SZ /d "GpuPreference=${gpuPref};" /f`, { timeout: 3000 });
  } catch (e) {
    console.warn('[GPU] Error aplicando preferencia:', e.message);
  }
}

ipcMain.handle('gpu:detect', async () => {
  try {
    const out = execSync(
      'powershell -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_VideoController).Name"',
      { encoding: 'utf8', timeout: 5000, windowsHide: true }
    );
    return out
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 2)
      .map(name => {
        const lower = name.toLowerCase();
        const isIntegrated = lower.includes('intel') || lower.includes('integrated')
          || lower.includes('radeon graphics') || lower.includes('vega')
          || lower.includes('amd renoir') || lower.includes('amd lucienne')
          || lower.includes('amd cezanne') || lower.includes('amd rembrandt');
        const type = isIntegrated ? 'integrated' : 'dedicated';
        return { name, type };
      });
  } catch (e) {
    console.warn('[GPU] Error detectando GPUs:', e.message);
    return [];
  }
});

// ── Java ──────────────────────────────────────────────────────────────────────
ipcMain.handle('java:detect', async () => javaManager.detectAll());

ipcMain.handle('java:download', async () => {
  return await javaManager.downloadTemurin21((progress) => {
    log(`[Java] ${progress.phase} ${progress.percent}%`);
    mainWindow.webContents.send('java:progress', progress);
  });
});

ipcMain.handle('java:browse', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecciona el ejecutable de Java',
    filters: [{ name: 'Java', extensions: ['exe'] }],
    properties: ['openFile'],
  });
  if (result.canceled) return null;
  const javaPath = result.filePaths[0];
  const version = await javaManager.getVersion(javaPath);
  return { path: javaPath, version };
});

// ── Instalación ───────────────────────────────────────────────────────────────
ipcMain.handle('modpack:install', async (_e, { javaPath, ram, mrpackUrl, version }) => {
  try {
    log(`[Install] Iniciando instalación del modpack${version ? ` v${version}` : ''}${mrpackUrl ? ` (remoto)` : ''}`);
    const result = await installer.install(
      { javaPath, ram, mrpackUrl },
      (progress) => {
        log(`[Install] ${progress.message} (${progress.percent}%)`);
        mainWindow.webContents.send('install:progress', progress);
      }
    );
    const s = state.load();
    s.installed = true;
    s.installedVersion = version || result?.version || '2.1';
    state.save(s);
    log('[Install] Instalación completada');
    return { ok: true };
  } catch (err) {
    log(`[Install] ERROR: ${err.message}\n${err.stack}`);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('modpack:uninstall', async () => {
  try {
    await installer.uninstall((progress) => {
      mainWindow.webContents.send('install:progress', progress);
    });
    const s = state.load();
    s.installed = false;
    s.installedVersion = null;
    state.save(s);
    return { ok: true };
  } catch (err) {
    log(`[Uninstall] ERROR: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

// ── Modo eficiencia (EcoQoS) ──────────────────────────────────────────────────
// Windows 11 mete procesos en "modo eficiencia" cuando su padre está en
// segundo plano (launcher en el tray), throttleando Java/Minecraft. Sacamos
// al proceso del juego y todo su árbol de EcoQoS vía SetProcessInformation.
const EFF_SCRIPT = path.join(os.tmpdir(), 'capibara-fixeff.ps1');
function writeEffScript() {
  const ps = `
$ErrorActionPreference='SilentlyContinue'
$src=@"
using System;
using System.Runtime.InteropServices;
public class Eff {
  [DllImport("kernel32.dll",SetLastError=true)] public static extern IntPtr OpenProcess(uint a,bool i,uint p);
  [DllImport("kernel32.dll",SetLastError=true)] public static extern bool SetPriorityClass(IntPtr h,uint c);
  [DllImport("kernel32.dll",SetLastError=true)] public static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll",SetLastError=true)] public static extern bool SetProcessInformation(IntPtr h,int c,ref PPTS s,uint l);
  [StructLayout(LayoutKind.Sequential)] public struct PPTS { public uint Version; public uint ControlMask; public uint StateMask; }
  public static void Fix(uint pid){
    IntPtr h=OpenProcess(0x1F0FFF,false,pid); if(h==IntPtr.Zero) return;
    SetPriorityClass(h,0x20);
    PPTS s=new PPTS(); s.Version=1; s.ControlMask=1; s.StateMask=0;
    SetProcessInformation(h,4,ref s,(uint)Marshal.SizeOf(s));
    CloseHandle(h);
  }
}
"@
Add-Type $src
function FixTree($id){
  try{ [Eff]::Fix([uint32]$id) }catch{}
  Get-CimInstance Win32_Process -Filter "ParentProcessId=$id" | ForEach-Object { FixTree $_.ProcessId }
}
FixTree $args[0]
`;
  fs.writeFileSync(EFF_SCRIPT, ps);
}
function clearEfficiencyMode(pid) {
  if (!pid) return;
  try {
    if (!fs.existsSync(EFF_SCRIPT)) writeEffScript();
    const child = require('child_process').spawn(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', EFF_SCRIPT, String(pid)],
      { detached: true, stdio: 'ignore', windowsHide: true }
    );
    child.unref();
    log(`[Eff] Solicitado fix de modo eficiencia para PID ${pid} (+árbol)`);
  } catch (e) {
    log(`[Eff] Error: ${e.message}`);
  }
}

// ── Lanzamiento ───────────────────────────────────────────────────────────────
ipcMain.handle('game:launch', async (_e, { username, javaPath, ram, gpuPref }) => {
  try {
    log(`[Launch] Iniciando juego para ${username}`);

    applyGpuPreference(javaPath, gpuPref ?? 2);
    log(`[GPU] Preferencia aplicada: ${gpuPref ?? 2}`);

    const s = state.load();
    discord.setPlaying({ username, modpackVersion: s.installedVersion || '2.1' }).catch(() => {});

    await launcher.launch(
      { username, javaPath, ram },
      {
        onData: (line) => {
          log(`[Game] ${line.trim()}`);
          mainWindow.webContents.send('game:log', line);
        },
        onClose: (code) => {
          log(`[Game] Proceso cerrado con código ${code}`);
          discord.setIdle().catch(() => {});
          mainWindow.webContents.send('game:closed', code);
          showLauncher();
        },
        onProgress: (progress) => {
          mainWindow.webContents.send('install:progress', progress);
        },
      }
    );

    hideToTray();

    // Sacar a Java y su árbol de procesos del modo eficiencia de Windows.
    // Se reintenta porque el árbol (bootstrap → java → game) se va creando.
    const gamePid = launcher.getGamePid();
    if (gamePid) {
      for (const delay of [2000, 6000, 15000, 30000]) {
        setTimeout(() => clearEfficiencyMode(gamePid), delay);
      }
    }

    return { ok: true };
  } catch (err) {
    log(`[Launch] ERROR: ${err.message}\n${err.stack}`);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('game:openDir', () => {
  shell.openPath(installer.getGameDir());
});

ipcMain.handle('mods:list', () => {
  try {
    const modsDir = path.join(installer.getGameDir(), 'mods');
    if (!fs.existsSync(modsDir)) return [];
    return fs.readdirSync(modsDir)
      .filter(f => f.endsWith('.jar'))
      .map(f => {
        const stat = fs.statSync(path.join(modsDir, f));
        return { name: f.replace(/\.jar$/, ''), sizeMB: (stat.size / 1024 / 1024).toFixed(2) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
});

ipcMain.handle('game:kill', () => {
  const killed = launcher.killGame();
  log(`[Game] Cierre forzado solicitado (killed=${killed})`);
  return { ok: killed };
});

// ── Servidor Minecraft ────────────────────────────────────────────────────────
const MC_SERVER_HOST = 'mc.capibaratraductor.com';
const MC_SERVER_PORT = 25565;

ipcMain.handle('server:ping', async () => {
  try {
    const res = await ping(MC_SERVER_HOST, MC_SERVER_PORT, { timeout: 5000 });
    return {
      online: true,
      players: res.players?.online ?? 0,
      maxPlayers: res.players?.max ?? 0,
      motd: typeof res.description === 'string'
        ? res.description
        : res.description?.text ?? '',
      version: res.version?.name ?? '',
    };
  } catch {
    return { online: false, players: 0, maxPlayers: 0, motd: '', version: '' };
  }
});

// ── Actualizaciones ───────────────────────────────────────────────────────────
ipcMain.handle('update:check', async () => {
  const s = state.load();
  const result = await updater.checkForUpdates(s.installedVersion);
  log(`[Update] ${result.hasUpdate ? `Nueva versión: ${result.latest?.version}` : 'Sin actualizaciones'}${result.error ? ` (error: ${result.error})` : ''}`);
  return result;
});
