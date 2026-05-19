const { execFile, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const { app } = require('electron');
const StreamZip = require('node-stream-zip');
const { downloadFile } = require('./download');

// Metadata oficial de Adoptium: build exacto + checksum SHA256.
function fetchAdoptiumAsset(redirects = 0, url) {
  const api = url || 'https://api.adoptium.net/v3/assets/feature_releases/21/ga'
    + '?architecture=x64&image_type=jre&jvm_impl=hotspot&os=windows&vendor=eclipse&page_size=1';
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Demasiados redirects'));
    https.get(api, { timeout: 12000, headers: { 'User-Agent': 'CapibaraLauncher/1.0' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        res.resume();
        return resolve(fetchAdoptiumAsset(redirects + 1, res.headers.location));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} (Adoptium API)`));
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const arr = JSON.parse(data);
          const pkg = arr?.[0]?.binaries?.[0]?.package;
          if (!pkg?.link || !pkg?.checksum) return reject(new Error('Respuesta de Adoptium sin link/checksum'));
          resolve({ link: pkg.link, checksum: pkg.checksum.toLowerCase() });
        } catch { reject(new Error('JSON inválido de Adoptium API')); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout API Adoptium')));
  });
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(file);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

const JAVA_DIR = path.join(app.getPath('userData'), 'java');

async function getVersion(javaExe) {
  return new Promise((resolve) => {
    execFile(javaExe, ['-version'], { timeout: 5000 }, (err, _stdout, stderr) => {
      if (err) return resolve(null);
      const match = stderr.match(/version "([^"]+)"/);
      resolve(match ? match[1] : null);
    });
  });
}

async function probeJava(javaExe) {
  if (!fs.existsSync(javaExe)) return null;
  const version = await getVersion(javaExe);
  if (!version) return null;
  let major = parseInt(version.split('.')[0]);
  if (major === 1) major = parseInt(version.split('.')[1] || '0'); // Java 8 = "1.8.x"
  return { path: javaExe, version, major };
}

async function detectAll() {
  const candidates = [];

  // Java descargado por el launcher
  const bundled = path.join(JAVA_DIR, 'bin', 'java.exe');
  const b = await probeJava(bundled);
  if (b) candidates.push({ ...b, label: 'Java 21 (descargado por launcher)' });

  // JAVA_HOME
  if (process.env.JAVA_HOME) {
    const p = await probeJava(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'));
    if (p) candidates.push({ ...p, label: `JAVA_HOME (${p.version})` });
  }

  // Rutas de instalación comunes en Windows
  const roots = [
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Java',
    'C:\\Program Files\\Microsoft',
    'C:\\Program Files\\Amazon Corretto',
    'C:\\Program Files\\Zulu',
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      const javaExe = path.join(root, entry, 'bin', 'java.exe');
      const p = await probeJava(javaExe);
      if (p) candidates.push({ ...p, label: `${entry} (${p.version})` });
    }
  }

  // java en PATH
  try {
    const pathJava = await new Promise((resolve) => {
      exec('where java', (_err, stdout) => {
        resolve(stdout ? stdout.trim().split('\n')[0].trim() : null);
      });
    });
    if (pathJava) {
      const p = await probeJava(pathJava);
      if (p && !candidates.find((c) => c.path === p.path)) {
        candidates.push({ ...p, label: `PATH (${p.version})` });
      }
    }
  } catch {}

  // Eliminar duplicados por ruta
  const seen = new Set();
  return candidates.filter((c) => {
    if (seen.has(c.path)) return false;
    seen.add(c.path);
    return true;
  });
}

async function downloadAndExtractTemurin(onProgress) {
  const zipPath = path.join(os.tmpdir(), 'temurin21.zip');

  // Build exacto + checksum oficial (como Modrinth). Fallback al endpoint
  // "latest" si la API de assets no responde.
  let link, checksum;
  try {
    ({ link, checksum } = await fetchAdoptiumAsset());
  } catch (e) {
    console.warn(`[Java] API de Adoptium falló (${e.message}); usando endpoint latest sin checksum`);
    link = 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse';
    checksum = null;
  }

  try { fs.unlinkSync(zipPath); } catch {}
  await downloadFile(link, zipPath, (received, total) => {
    if (total) onProgress({ phase: 'Descargando Java 21...', percent: Math.round((received / total) * 80) });
  }, { stallTimeoutMs: 30000, maxRetries: 3 });

  // Verificar integridad ANTES de extraer (atrapa corrupción de antivirus/red).
  if (checksum) {
    onProgress({ phase: 'Verificando integridad...', percent: 81 });
    const got = await sha256File(zipPath);
    if (got.toLowerCase() !== checksum) {
      try { fs.unlinkSync(zipPath); } catch {}
      throw new Error(`Checksum del Java no coincide (descarga corrupta: ${got.slice(0, 12)}… ≠ ${checksum.slice(0, 12)}…)`);
    }
  }

  onProgress({ phase: 'Extrayendo Java...', percent: 82 });

  const tmpExtract = path.join(os.tmpdir(), 'temurin21-extract');
  if (fs.existsSync(tmpExtract)) fs.rmSync(tmpExtract, { recursive: true });
  fs.mkdirSync(tmpExtract, { recursive: true });

  const zip = new StreamZip.async({ file: zipPath });
  const totalEntries = await zip.entriesCount;
  let doneEntries = 0;
  zip.on('extract', () => {
    doneEntries++;
    if (totalEntries) {
      const pct = 82 + Math.round((doneEntries / totalEntries) * 16);
      onProgress({ phase: 'Extrayendo Java...', percent: Math.min(pct, 98) });
    }
  });
  await zip.extract(null, tmpExtract);
  await zip.close();

  const entries = fs.readdirSync(tmpExtract);
  if (entries.length > 0) {
    const src = path.join(tmpExtract, entries[0]);
    if (fs.existsSync(JAVA_DIR)) fs.rmSync(JAVA_DIR, { recursive: true });
    fs.renameSync(src, JAVA_DIR);
  }

  try { fs.unlinkSync(zipPath); } catch {}
  try { fs.rmSync(tmpExtract, { recursive: true }); } catch {}

  // Validar que el Java extraído realmente ejecuta (zip corrupto / AV).
  const javaExe = path.join(JAVA_DIR, 'bin', 'java.exe');
  const version = await getVersion(javaExe);
  if (!version) throw new Error('El Java descargado no se ejecuta (descarga corrupta o bloqueada por antivirus)');
  return { path: javaExe, version, major: 21, label: 'Java 21 (descargado por launcher)' };
}

async function downloadTemurin21(onProgress) {
  onProgress({ phase: 'Descargando Java 21 (Temurin)...', percent: 0 });
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await downloadAndExtractTemurin(onProgress);
      onProgress({ phase: 'Java listo', percent: 100 });
      return result;
    } catch (e) {
      lastErr = e;
      console.warn(`[Java] Intento ${attempt}/3 falló: ${e.message}`);
      try { fs.rmSync(JAVA_DIR, { recursive: true }); } catch {}
      if (attempt < 3) onProgress({ phase: `Reintentando descarga de Java (${attempt + 1}/3)...`, percent: 0 });
    }
  }
  throw lastErr || new Error('No se pudo descargar Java tras 3 intentos');
}

// Borra el Java bundleado (puede estar corrupto: "java.exe -version
// Command failed") y reinstala uno limpio.
async function repairJava(onProgress) {
	onProgress({ phase: 'Borrando Java dañado...', percent: 0 });
	try { if (fs.existsSync(JAVA_DIR)) fs.rmSync(JAVA_DIR, { recursive: true, force: true }); } catch {}
	return downloadTemurin21(onProgress);
}

module.exports = { detectAll, downloadTemurin21, repairJava, getVersion };
