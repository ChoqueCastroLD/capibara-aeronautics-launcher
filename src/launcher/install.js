const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const os = require('os');
const { execFile } = require('child_process');
const { app } = require('electron');
const StreamZip = require('node-stream-zip');
const { downloadFile } = require('./download');

const GAME_DIR = path.join(app.getPath('appData'), 'CapibaraAeronautics');
const MC_DIR = path.join(app.getPath('appData'), '.minecraft');
const NEOFORGE_VERSION = '21.1.228';
const MC_VERSION = '1.21.1';
const NEOFORGE_VERSION_ID = `neoforge-${NEOFORGE_VERSION}`;
const NEOFORGE_INSTALLER_URL = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${NEOFORGE_VERSION}/neoforge-${NEOFORGE_VERSION}-installer.jar`;
const NEOFORM_VERSION = '20240808.144430';
const CLIENT_SRG_PATH = path.join(
  MC_DIR, 'libraries', 'net', 'minecraft', 'client',
  `${MC_VERSION}-${NEOFORM_VERSION}`,
  `client-${MC_VERSION}-${NEOFORM_VERSION}-srg.jar`
);

function getGameDir() { return GAME_DIR; }

const VERSION_URL = 'https://raw.githubusercontent.com/ChoqueCastroLD/aeronautics-modpack-versions/main/version.json';

function fetchVersionJson() {
  return new Promise((resolve, reject) => {
    https.get(VERSION_URL, { timeout: 10000, headers: { 'User-Agent': 'CapibaraLauncher/1.0' } }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} al leer version.json`));
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('version.json inválido')); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout al leer version.json')));
  });
}

function getLocalMrpackPath() {
  if (app.isPackaged) return null;
  const localPath = path.join(__dirname, '../../resources/modpack.mrpack');
  return fs.existsSync(localPath) ? localPath : null;
}

async function repairMissingLibraries(send) {
  const libDir = path.join(MC_DIR, 'libraries');
  const jsonPaths = [
    path.join(MC_DIR, 'versions', MC_VERSION, `${MC_VERSION}.json`),
    path.join(MC_DIR, 'versions', NEOFORGE_VERSION_ID, `${NEOFORGE_VERSION_ID}.json`),
  ];
  const missing = [];
  const seen = new Set();
  for (const jsonPath of jsonPaths) {
    if (!fs.existsSync(jsonPath)) continue;
    let json;
    try { json = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch { continue; }
    for (const lib of (json.libraries || [])) {
      const artifact = lib.downloads?.artifact;
      if (!artifact?.path || !artifact?.url) continue;
      const full = path.join(libDir, artifact.path.replace(/\//g, path.sep));
      if (seen.has(full)) continue;
      seen.add(full);
      if (!fs.existsSync(full)) {
        missing.push({ url: artifact.url, dest: full, name: path.basename(artifact.path) });
      }
    }
  }
  if (missing.length === 0) return 0;
  console.log(`[Repair] ${missing.length} librerías faltantes, descargando...`);
  for (let i = 0; i < missing.length; i++) {
    const m = missing[i];
    send(`Reparando librerías (${i + 1}/${missing.length})... ${m.name}`, 38);
    try {
      await downloadFile(m.url, m.dest, null);
    } catch (e) {
      console.warn(`[Repair] No se pudo descargar ${m.name}: ${e.message}`);
    }
  }
  return missing.length;
}

function findLwjglJar() {
  const lwjglDir = path.join(MC_DIR, 'libraries', 'org', 'lwjgl', 'lwjgl');
  if (!fs.existsSync(lwjglDir)) return null;
  try {
    for (const version of fs.readdirSync(lwjglDir)) {
      const jar = path.join(lwjglDir, version, `lwjgl-${version}.jar`);
      if (fs.existsSync(jar)) return jar;
    }
  } catch {}
  return null;
}

function isInstalled() {
  const versionJson = path.join(MC_DIR, 'versions', NEOFORGE_VERSION_ID, `${NEOFORGE_VERSION_ID}.json`);
  const modsDir = path.join(GAME_DIR, 'mods');
  return (
    fs.existsSync(versionJson) &&
    fs.existsSync(CLIENT_SRG_PATH) &&
    fs.existsSync(modsDir) &&
    fs.readdirSync(modsDir).length > 0 &&
    !!findLwjglJar()
  );
}

async function install({ javaPath, ram, mrpackUrl }, onProgress) {
  const send = (msg, percent) => onProgress({ message: msg, percent: Math.round(percent) });

  send('Preparando directorios...', 0);
  fs.mkdirSync(GAME_DIR, { recursive: true });
  fs.mkdirSync(MC_DIR, { recursive: true });

  // El NeoForge installer requiere launcher_profiles.json para poder correr
  const profilesFile = path.join(MC_DIR, 'launcher_profiles.json');
  if (!fs.existsSync(profilesFile)) {
    fs.writeFileSync(profilesFile, JSON.stringify({
      profiles: {},
      selectedProfile: null,
      clientToken: crypto.randomUUID(),
      authenticationDatabase: {},
      launcherVersion: { format: 21, name: '3.0.0', profilesFormat: 2 },
    }, null, 2));
  }

  // ── 1. Descargar NeoForge installer ─────────────────────────────────────
  const installerJar = path.join(os.tmpdir(), `neoforge-${NEOFORGE_VERSION}-installer.jar`);
  if (!fs.existsSync(installerJar)) {
    send('Descargando NeoForge installer...', 2);
    await downloadFile(NEOFORGE_INSTALLER_URL, installerJar, (r, t) => {
      send('Descargando NeoForge installer...', 2 + (r / t) * 18);
    });
  }
  send('NeoForge installer descargado', 20);

  // ── 2. Ejecutar NeoForge installer (con hasta 3 reintentos por timeouts de red) ──
  const versionJson = path.join(MC_DIR, 'versions', NEOFORGE_VERSION_ID, `${NEOFORGE_VERSION_ID}.json`);
  if (!fs.existsSync(versionJson) || !fs.existsSync(CLIENT_SRG_PATH)) {
    const MAX_ATTEMPTS = 3;
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      send(`Instalando NeoForge${attempt > 1 ? ` (intento ${attempt}/${MAX_ATTEMPTS})` : ''}...`, 21);
      const ok = await new Promise((resolve) => {
        const proc = execFile(
          javaPath,
          ['-Djava.awt.headless=true', '-Xmx2G', '-jar', installerJar, '--installClient'],
          { timeout: 900000, cwd: MC_DIR }
        );
        proc.stdout?.on('data', (d) => console.log('[NeoForge]', d.toString().trim()));
        proc.stderr?.on('data', (d) => console.log('[NeoForge]', d.toString().trim()));
        proc.on('close', () => resolve(fs.existsSync(versionJson) && fs.existsSync(CLIENT_SRG_PATH)));
        proc.on('error', (e) => { lastError = e; resolve(false); });
      });
      if (ok) break;
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`NeoForge no se instaló tras ${MAX_ATTEMPTS} intentos. ${lastError?.message || 'Revisa los logs.'}`);
      }
      send(`Reintentando (timeout de red)...`, 21);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  send('NeoForge instalado', 38);

  // ── 2.5 Reparar librerías faltantes que NeoForge debió descargar ──────────
  // Algunos usuarios terminan con jars faltantes (antivirus, red flaky, rate
  // limits de Mojang). Verificamos cada lib del vanilla json y descargamos
  // las que falten con nuestro downloadFile robusto.
  await repairMissingLibraries(send);
  send('Librerías verificadas', 40);

  // ── 3. Obtener mrpack: local (dev) o remoto (prod) ────────────────────────
  send('Preparando modpack...', 40);
  let mrpackPath = null;
  let resolvedVersion = null;

  if (!mrpackUrl) {
    const local = getLocalMrpackPath();
    if (local) {
      mrpackPath = local;
    } else {
      send('Buscando versión más reciente...', 41);
      const versionInfo = await fetchVersionJson();
      mrpackUrl = versionInfo.mrpack_url;
      resolvedVersion = versionInfo.version;
      if (!mrpackUrl) throw new Error('version.json no contiene mrpack_url');
    }
  }

  if (mrpackUrl) {
    const remoteCache = path.join(os.tmpdir(), `capibara-modpack-${Date.now()}.mrpack`);
    send('Descargando modpack...', 42);
    await downloadFile(mrpackUrl, remoteCache, (r, t) => {
      const mb = (r / 1024 / 1024).toFixed(1);
      const totalMb = (t / 1024 / 1024).toFixed(1);
      send(`Descargando modpack (${mb} / ${totalMb} MB)...`, 42 + (r / t) * 5);
    });
    mrpackPath = remoteCache;
  }

  if (!mrpackPath) throw new Error('No se pudo obtener el archivo del modpack');
  const zip = new StreamZip.async({ file: mrpackPath });

  const indexRaw = await zip.entryData('modrinth.index.json');
  const index = JSON.parse(indexRaw.toString());

  const files = index.files || [];
  const modsDir = path.join(GAME_DIR, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });

  // Limpiar mods viejos
  if (fs.existsSync(modsDir)) fs.rmSync(modsDir, { recursive: true });
  fs.mkdirSync(modsDir, { recursive: true });

  send(`Descargando ${files.length} mods...`, 42);
  let downloaded = 0;

  // Descargar mods en paralelo (lotes de 8)
  const BATCH = 8;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    await Promise.all(batch.map(async (file) => {
      const url = file.downloads[0];
      const fileName = path.basename(file.path);
      const dest = path.join(GAME_DIR, file.path.replace(/^overrides\//, ''));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      try {
        await downloadFile(url, dest, null);
      } catch (err) {
        console.error(`Error descargando ${fileName}:`, err.message);
      }
      downloaded++;
      send(`Descargando mods (${downloaded}/${files.length})...`, 42 + (downloaded / files.length) * 45);
    }));
  }

  // ── 4. Extraer overrides ──────────────────────────────────────────────────
  send('Extrayendo configuración del modpack...', 89);
  const entries = await zip.entries();
  const overrideEntries = Object.keys(entries).filter(
    (e) => e.startsWith('overrides/') && !entries[e].isDirectory
  );

  for (const entry of overrideEntries) {
    const relPath = entry.replace(/^overrides\//, '');
    const dest = path.join(GAME_DIR, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const data = await zip.entryData(entry);
    fs.writeFileSync(dest, data);
  }

  await zip.close();

  // ── 5. Asegurar estructura de directorios y opciones mínimas ────────────────
  // FancyMenu necesita que su directorio exista antes del primer lanzamiento
  fs.mkdirSync(path.join(GAME_DIR, 'config', 'fancymenu'), { recursive: true });
  fs.mkdirSync(path.join(GAME_DIR, 'config', 'fancymenu', 'customization'), { recursive: true });

  const optionsFile = path.join(GAME_DIR, 'options.txt');
  if (!fs.existsSync(optionsFile)) {
    fs.writeFileSync(optionsFile, 'lang:es_es\n');
  }

  send('¡Instalación completa!', 100);
  return { version: resolvedVersion };
}

async function uninstall(onProgress) {
  const send = (msg, percent) => onProgress({ message: msg, percent });

  // Directorios que sobreviven la desinstalación (datos del usuario)
  const KEEP = new Set(['saves', 'screenshots', 'resourcepacks', 'shaderpacks']);

  send('Eliminando mods y datos del modpack...', 10);

  // Borrar todos los directorios excepto los del usuario
  if (fs.existsSync(GAME_DIR)) {
    for (const entry of fs.readdirSync(GAME_DIR)) {
      if (KEEP.has(entry)) continue;
      const p = path.join(GAME_DIR, entry);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        fs.rmSync(p, { recursive: true });
      } else {
        fs.unlinkSync(p);
      }
    }
  }

  send('Desinstalado correctamente', 100);
}

module.exports = { install, uninstall, getGameDir, isInstalled, findLwjglJar, repairMissingLibraries, NEOFORGE_VERSION_ID, MC_VERSION };
