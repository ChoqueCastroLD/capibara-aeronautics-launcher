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
const NEOFORGE_VERSION = '21.1.231';
const MC_VERSION = '1.21.1';
const NEOFORGE_VERSION_ID = `neoforge-${NEOFORGE_VERSION}`;
const NEOFORGE_INSTALLER_URL = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${NEOFORGE_VERSION}/neoforge-${NEOFORGE_VERSION}-installer.jar`;
const NEOFORM_VERSION = '20240808.144430';
const CLIENT_SRG_PATH = path.join(
  MC_DIR, 'libraries', 'net', 'minecraft', 'client',
  `${MC_VERSION}-${NEOFORM_VERSION}`,
  `client-${MC_VERSION}-${NEOFORM_VERSION}-srg.jar`
);
const CLIENT_EXTRA_PATH = path.join(
  MC_DIR, 'libraries', 'net', 'minecraft', 'client',
  `${MC_VERSION}-${NEOFORM_VERSION}`,
  `client-${MC_VERSION}-${NEOFORM_VERSION}-extra.jar`
);

// Los procesadores del instalador de NeoForge generan client-srg.jar y
// client-extra.jar localmente (no tienen URL de descarga). Si el proceso se
// interrumpe (antivirus, red, disco) quedan en 0 bytes o truncados: el
// versionJson existe → isInstalled() pasa → pero al lanzar, el module finder
// de FML no resuelve el módulo `minecraft` y BootstrapLauncher crashea con
// "java.util.NoSuchElementException: No value present". Exigimos tamaño
// mínimo razonable (ambos son de varios MB) para detectar corrupción.
function clientPatchedOk() {
  for (const p of [CLIENT_SRG_PATH, CLIENT_EXTRA_PATH]) {
    try {
      if (fs.statSync(p).size < 1_000_000) return false;
    } catch {
      return false;
    }
  }
  return true;
}

// Mods SOLO de servidor que a veces se filtran al .mrpack del cliente y lo
// tumban en la fase de carga (dependencia server-only [MISSING]). Ej.:
// server-opac-bluemap-integration requiere `bluemap` (solo-servidor) →
// "Currently, bluemap is not installed" → crash antes del menú, no deja
// entrar. El launcher los filtra siempre, aunque el mrpack los traiga.
const SERVER_ONLY_MOD_PATTERNS = [
  /^server-/i,
  /opac[-_]?bluemap[-_]?integration/i,
  /^bluemap-(?!offlineplayermarkers)/i,
];
function isServerOnlyMod(fileName) {
  return SERVER_ONLY_MOD_PATTERNS.some((re) => re.test(fileName));
}

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

// Descarga un JSON por HTTPS siguiendo redirects.
function fetchJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Demasiados redirects'));
    https.get(url, { timeout: 12000, headers: { 'User-Agent': 'CapibaraLauncher/1.0' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        res.resume();
        return resolve(fetchJson(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} (${url})`));
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`JSON inválido (${url})`)); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error(`Timeout (${url})`)));
  });
}

// Obtiene el JSON canónico de Mojang para MC_VERSION (lista de librerías oficial).
async function fetchMojangVanillaJson() {
  const manifest = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
  const entry = (manifest.versions || []).find((v) => v.id === MC_VERSION);
  if (!entry?.url) throw new Error(`${MC_VERSION} no está en el manifiesto de Mojang`);
  return fetchJson(entry.url);
}

function getLocalMrpackPath() {
  if (app.isPackaged) return null;
  const localPath = path.join(__dirname, '../../resources/modpack.mrpack');
  return fs.existsSync(localPath) ? localPath : null;
}

async function repairMissingLibraries(send) {
  const libDir = path.join(MC_DIR, 'libraries');
  const vanillaJsonPath = path.join(MC_DIR, 'versions', MC_VERSION, `${MC_VERSION}.json`);

  // Si el 1.21.1.json local está corrupto/incompleto (otro launcher o modpack
  // reusó el id "1.21.1"), buildClasspath y la reparación se quedan sin las
  // libs vanilla. Descargamos el JSON canónico de Mojang y, si tiene más
  // librerías que el local, lo reescribimos para que todo lo lea correcto.
  const jsonObjs = [];
  try {
    send('Verificando versión de Minecraft...', 38);
    const mojangJson = await fetchMojangVanillaJson();
    const mojangLibs = (mojangJson.libraries || []).length;
    let localLibs = -1;
    try {
      localLibs = (JSON.parse(fs.readFileSync(vanillaJsonPath, 'utf8')).libraries || []).length;
    } catch {}
    if (mojangLibs > localLibs) {
      fs.mkdirSync(path.dirname(vanillaJsonPath), { recursive: true });
      fs.writeFileSync(vanillaJsonPath, JSON.stringify(mojangJson, null, 2));
      console.log(`[Repair] 1.21.1.json reescrito desde Mojang (${localLibs} -> ${mojangLibs} libs)`);
    }
    jsonObjs.push(mojangJson);
  } catch (e) {
    console.warn(`[Repair] No se pudo obtener el JSON de Mojang: ${e.message}`);
  }

  for (const jsonPath of [vanillaJsonPath, path.join(MC_DIR, 'versions', NEOFORGE_VERSION_ID, `${NEOFORGE_VERSION_ID}.json`)]) {
    if (!fs.existsSync(jsonPath)) continue;
    try { jsonObjs.push(JSON.parse(fs.readFileSync(jsonPath, 'utf8'))); } catch {}
  }

  const missing = [];
  const seen = new Set();
  for (const json of jsonObjs) {
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

async function downloadModVerified(url, dest, hashes) {
  const want = hashes && (hashes.sha512 || hashes.sha1);
  const algo = hashes && hashes.sha512 ? 'sha512' : 'sha1';
  for (let attempt = 1; attempt <= 3; attempt++) {
    await downloadFile(url, dest, null);
    if (!want) return true;
    const got = crypto.createHash(algo).update(fs.readFileSync(dest)).digest('hex');
    if (got.toLowerCase() === String(want).toLowerCase()) return true;
    try { fs.unlinkSync(dest); } catch {}
  }
  return false;
}

// Verifica que los mods en disco coincidan EXACTAMENTE con el .mrpack actual
// (no solo "hay algo en mods/"). Descarga lo que falte/cambie y borra mods
// viejos que sobren. Evita que se juegue con un modpack incompleto/desfasado
// (causa de los crashes "No value with id X" al entrar al servidor).
async function verifyAndRepairMods(send) {
  let mrpackPath = getLocalMrpackPath();
  let tempMrpack = null;
  if (!mrpackPath) {
    const info = await fetchVersionJson();
    if (!info.mrpack_url) throw new Error('version.json sin mrpack_url');
    tempMrpack = path.join(os.tmpdir(), `capibara-verify-${Date.now()}.mrpack`);
    send('Verificando modpack...', 41);
    await downloadFile(info.mrpack_url, tempMrpack, null);
    mrpackPath = tempMrpack;
  }

  const zip = new StreamZip.async({ file: mrpackPath });
  let repaired = 0;
  try {
    const index = JSON.parse((await zip.entryData('modrinth.index.json')).toString());
    const files = index.files || [];
    const expectedMods = new Set();

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const rel = f.path.replace(/^overrides\//, '');
      // Mod solo-servidor colado en el mrpack: no lo esperamos ni lo
      // descargamos; el barrido de abajo lo borra si ya está en disco.
      if (rel.startsWith('mods/') && isServerOnlyMod(path.basename(rel))) continue;
      if (rel.startsWith('mods/') && rel.endsWith('.jar')) expectedMods.add(path.basename(rel));
      const dest = path.join(GAME_DIR, rel);
      let ok = false;
      try {
        const st = fs.statSync(dest);
        ok = !f.fileSize || st.size === f.fileSize;
      } catch {}
      if (!ok) {
        send(`Reparando modpack (${i + 1}/${files.length})... ${path.basename(rel)}`, 41);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        try {
          if (await downloadModVerified(f.downloads[0], dest, f.hashes)) repaired++;
        } catch (e) { console.warn(`[VerifyMods] ${path.basename(rel)}: ${e.message}`); }
      }
    }

    // Mods provistos por overrides/mods/ del mrpack: también son esperados.
    // Si no se cuentan, el barrido de abajo los borra (no están en files[])
    // y queda una instalación incompleta → crash de carga. Además los
    // restauramos si faltan o cambiaron de tamaño.
    const entries = await zip.entries();
    for (const name of Object.keys(entries)) {
      const e = entries[name];
      if (e.isDirectory) continue;
      if (!name.startsWith('overrides/mods/') || !name.endsWith('.jar')) continue;
      const base = path.basename(name);
      if (isServerOnlyMod(base)) continue;
      expectedMods.add(base);
      const dest = path.join(GAME_DIR, name.replace(/^overrides\//, ''));
      let ok = false;
      try { ok = fs.statSync(dest).size === e.size; } catch {}
      if (!ok) {
        send(`Reparando modpack... ${base}`, 41);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        try { fs.writeFileSync(dest, await zip.entryData(name)); repaired++; }
        catch (er) { console.warn(`[VerifyMods] override ${base}: ${er.message}`); }
      }
    }

    // Borrar mods que sobran (instalación vieja con mods que ya no van).
    const modsDir = path.join(GAME_DIR, 'mods');
    try {
      for (const name of fs.readdirSync(modsDir)) {
        if (name.endsWith('.jar') && !expectedMods.has(name)) {
          try { fs.unlinkSync(path.join(modsDir, name)); repaired++; } catch {}
        }
      }
    } catch {}
  } finally {
    await zip.close();
    if (tempMrpack) { try { fs.unlinkSync(tempMrpack); } catch {} }
  }
  return repaired;
}

function isInstalled() {
  const versionJson = path.join(MC_DIR, 'versions', NEOFORGE_VERSION_ID, `${NEOFORGE_VERSION_ID}.json`);
  const modsDir = path.join(GAME_DIR, 'mods');
  return (
    fs.existsSync(versionJson) &&
    clientPatchedOk() &&
    fs.existsSync(modsDir) &&
    fs.readdirSync(modsDir).length > 0 &&
    !!findLwjglJar()
  );
}

// Garantiza un client patcheado de NeoForge íntegro (srg + extra). Se usa en
// la instalación y también antes de lanzar (auto-reparación sin reinstalar
// todo). Reejecuta el instalador de NeoForge —único que regenera estos jars—
// hasta 3 veces, validando por tamaño y no solo por existencia.
async function ensureNeoForgeClient({ javaPath, send }) {
  const versionJson = path.join(MC_DIR, 'versions', NEOFORGE_VERSION_ID, `${NEOFORGE_VERSION_ID}.json`);
  if (fs.existsSync(versionJson) && clientPatchedOk()) return false;

  const installerJar = path.join(os.tmpdir(), `neoforge-${NEOFORGE_VERSION}-installer.jar`);
  if (!fs.existsSync(installerJar)) {
    send('Descargando NeoForge installer...', 2);
    await downloadFile(NEOFORGE_INSTALLER_URL, installerJar, (r, t) => {
      send('Descargando NeoForge installer...', 2 + (r / t) * 18);
    });
  }
  send('NeoForge installer descargado', 20);

  // Borrar jars patcheados truncados/corruptos para que un parcial no engañe.
  for (const p of [CLIENT_SRG_PATH, CLIENT_EXTRA_PATH]) {
    try { if (fs.statSync(p).size < 1_000_000) fs.unlinkSync(p); } catch {}
  }

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
      proc.on('close', () => resolve(fs.existsSync(versionJson) && clientPatchedOk()));
      proc.on('error', (e) => { lastError = e; resolve(false); });
    });
    if (ok) { send('NeoForge instalado', 38); return true; }
    if (attempt === MAX_ATTEMPTS) {
      throw new Error(`NeoForge no se instaló correctamente tras ${MAX_ATTEMPTS} intentos. ${lastError?.message || 'Revisa los logs.'}`);
    }
    send(`Reintentando (timeout de red)...`, 21);
    await new Promise(r => setTimeout(r, 2000));
  }
  return true;
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

  // ── 1-2. Garantizar NeoForge + client patcheado íntegro ─────────────────
  await ensureNeoForgeClient({ javaPath, send });

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
  const failedMods = [];

  // Descarga + verificación de hash (como Modrinth). El modrinth.index.json
  // trae sha512/sha1 por archivo; si no coincide, reintenta. Esto evita
  // instalaciones "OK" con mods corruptos que crashean el juego.
  const downloadVerified = async (url, dest, hashes) => {
    const want = hashes && (hashes.sha512 || hashes.sha1);
    const algo = hashes && hashes.sha512 ? 'sha512' : 'sha1';
    for (let attempt = 1; attempt <= 3; attempt++) {
      await downloadFile(url, dest, null);
      if (!want) return true; // sin hash en el índice: no se puede verificar
      const got = crypto.createHash(algo).update(fs.readFileSync(dest)).digest('hex');
      if (got.toLowerCase() === String(want).toLowerCase()) return true;
      console.warn(`[Install] Hash incorrecto ${path.basename(dest)} intento ${attempt}/3`);
      try { fs.unlinkSync(dest); } catch {}
    }
    return false;
  };

  // Descargar mods en paralelo (lotes de 8)
  const BATCH = 8;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    await Promise.all(batch.map(async (file) => {
      const url = file.downloads[0];
      const fileName = path.basename(file.path);
      const relP = file.path.replace(/^overrides\//, '');
      if (relP.startsWith('mods/') && isServerOnlyMod(fileName)) {
        downloaded++;
        send(`Descargando mods (${downloaded}/${files.length})...`, 42 + (downloaded / files.length) * 45);
        return;
      }
      const dest = path.join(GAME_DIR, relP);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      try {
        const ok = await downloadVerified(url, dest, file.hashes);
        if (!ok) failedMods.push(fileName);
      } catch (err) {
        console.error(`Error descargando ${fileName}:`, err.message);
        failedMods.push(fileName);
      }
      downloaded++;
      send(`Descargando mods (${downloaded}/${files.length})...`, 42 + (downloaded / files.length) * 45);
    }));
  }

  if (failedMods.length > 0) {
    throw new Error(
      `${failedMods.length} mod(s) no se descargaron correctamente (hash inválido o sin conexión): `
      + failedMods.slice(0, 5).join(', ') + (failedMods.length > 5 ? '…' : '')
      + '. Revisa tu conexión/antivirus e intenta instalar de nuevo.'
    );
  }

  // ── 4. Extraer overrides ──────────────────────────────────────────────────
  send('Extrayendo configuración del modpack...', 89);
  const entries = await zip.entries();
  const overrideEntries = Object.keys(entries).filter(
    (e) => e.startsWith('overrides/') && !entries[e].isDirectory
  );

  const totalOv = overrideEntries.length || 1;
  let ovDone = 0;
  let lastPct = -1;
  for (const entry of overrideEntries) {
    const relPath = entry.replace(/^overrides\//, '');
    if (relPath.startsWith('mods/') && isServerOnlyMod(path.basename(relPath))) {
      ovDone++;
      continue;
    }
    const dest = path.join(GAME_DIR, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const data = await zip.entryData(entry);
    fs.writeFileSync(dest, data);
    ovDone++;
    const pct = 89 + Math.round((ovDone / totalOv) * 10); // 89 → 99
    if (pct !== lastPct) {
      lastPct = pct;
      send(`Extrayendo configuración (${ovDone}/${totalOv})...`, pct);
    }
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

module.exports = { install, uninstall, getGameDir, isInstalled, findLwjglJar, repairMissingLibraries, verifyAndRepairMods, ensureNeoForgeClient, NEOFORGE_VERSION_ID, MC_VERSION };
