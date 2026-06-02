const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Client } = require('minecraft-launcher-core');
const { app } = require('electron');

const { NEOFORGE_VERSION_ID, MC_VERSION, getGameDir, findLwjglJar } = require('./install');

const MC_DIR = path.join(app.getPath('appData'), '.minecraft');

function generateOfflineUUID(username) {
	const hash = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest('hex');
	return [
		hash.slice(0, 8),
		hash.slice(8, 12),
		hash.slice(12, 16),
		hash.slice(16, 20),
		hash.slice(20, 32),
	].join('-');
}

function buildNeoForgeJvmArgs() {
	const libDir = path.join(MC_DIR, 'libraries');
	const sep = ';';
	const modulePath = [
		path.join(libDir, 'cpw/mods/bootstraplauncher/2.0.2/bootstraplauncher-2.0.2.jar'),
		path.join(libDir, 'cpw/mods/securejarhandler/3.0.8/securejarhandler-3.0.8.jar'),
		path.join(libDir, 'org/ow2/asm/asm-commons/9.8/asm-commons-9.8.jar'),
		path.join(libDir, 'org/ow2/asm/asm-util/9.8/asm-util-9.8.jar'),
		path.join(libDir, 'org/ow2/asm/asm-analysis/9.8/asm-analysis-9.8.jar'),
		path.join(libDir, 'org/ow2/asm/asm-tree/9.8/asm-tree-9.8.jar'),
		path.join(libDir, 'org/ow2/asm/asm/9.8/asm-9.8.jar'),
		path.join(libDir, 'net/neoforged/JarJarFileSystems/0.4.1/JarJarFileSystems-0.4.1.jar'),
	].join(sep);

	return [
		'-p', modulePath,
		'--add-modules', 'ALL-MODULE-PATH',
		'--add-opens', 'java.base/java.util.jar=cpw.mods.securejarhandler',
		'--add-opens', 'java.base/java.lang.invoke=cpw.mods.securejarhandler',
		'--add-exports', 'java.base/sun.security.util=cpw.mods.securejarhandler',
		'--add-exports', 'jdk.naming.dns/com.sun.jndi.dns=java.naming',
		`-DlibraryDirectory=${libDir}`,
		`-DignoreList=client-extra,${NEOFORGE_VERSION_ID}.jar`,
		'-Djava.net.preferIPv6Addresses=system',
	];
}

function isLibAllowedOnWindows(lib) {
	if (!lib.rules) return true;
	let allowed = false;
	for (const rule of lib.rules) {
		const osMatch = !rule.os || rule.os.name === 'windows';
		if (rule.action === 'allow' && osMatch) allowed = true;
		if (rule.action === 'disallow' && osMatch) allowed = false;
	}
	return allowed;
}

// Construye el classpath leyendo los JSON de versión de NeoForge y vanilla.
// Incluye 1.21.1.jar para que los módulos de Minecraft estén disponibles en la module layer.
// MCLC añade neoforge-21.1.231.jar al final (game JAR), que Connector necesita encontrar.
function buildClasspath() {
	const libDir = path.join(MC_DIR, 'libraries');
	const seen = new Set();
	const libs = [];

	const addLib = (jarPath) => {
		const norm = path.normalize(jarPath);
		if (seen.has(norm)) return;
		seen.add(norm);
		if (fs.existsSync(norm)) libs.push(norm);
		else console.warn(`[launch] Librería no encontrada: ${norm}`);
	};

	const neoforgeJsonPath = path.join(MC_DIR, 'versions', NEOFORGE_VERSION_ID, `${NEOFORGE_VERSION_ID}.json`);
	const vanillaJsonPath = path.join(MC_DIR, 'versions', MC_VERSION, `${MC_VERSION}.json`);

	const neoforgeJson = JSON.parse(fs.readFileSync(neoforgeJsonPath, 'utf8'));
	const vanillaJson = JSON.parse(fs.readFileSync(vanillaJsonPath, 'utf8'));

	let lwjglVersion = null;
	for (const json of [vanillaJson, neoforgeJson]) {
		for (const lib of (json.libraries || [])) {
			if (!isLibAllowedOnWindows(lib)) continue;
			// Detectar la versión de LWJGL declarada (ej. "org.lwjgl:lwjgl:3.3.3")
			const m = typeof lib.name === 'string' && lib.name.match(/^org\.lwjgl:lwjgl:([\d.]+)$/);
			if (m) lwjglVersion = m[1];
			// Omitir librerías que son solo natives (sin artifact, o con natives pero sin artifact.path)
			const artifact = lib.downloads?.artifact;
			if (!artifact?.path) continue;
			addLib(path.join(libDir, artifact.path.replace(/\//g, path.sep)));
		}
	}

	// Red de seguridad: si el vanilla json estaba incompleto, escaneamos org/lwjgl/
	// en disco — pero SOLO la versión declarada y SOLO jars compatibles con Windows.
	// (Versiones viejas de otras instalaciones rompen el juego con NoSuchMethodError.)
	if (lwjglVersion) {
		const lwjglRoot = path.join(libDir, 'org', 'lwjgl');
		if (fs.existsSync(lwjglRoot)) {
			const stack = [lwjglRoot];
			while (stack.length) {
				const dir = stack.pop();
				try {
					for (const entry of fs.readdirSync(dir)) {
						const full = path.join(dir, entry);
						const stat = fs.statSync(full);
						if (stat.isDirectory()) {
							stack.push(full);
						} else if (
							entry.endsWith('.jar') &&
							!entry.includes('-sources') &&
							!entry.includes('-javadoc') &&
							full.split(path.sep).includes(lwjglVersion) &&
							!/-natives-(linux|macos|windows-arm64|windows-x86)/.test(entry)
						) {
							addLib(full);
						}
					}
				} catch {}
			}
		}
	}

	// neoforge-21.1.231.jar lo añade MCLC como trailing game JAR.
	// NO añadimos 1.21.1.jar porque eso confunde al bootstraplauncher
	// al intentar procesarlo como módulo fuera de DignoreList.

	return libs;
}

// Devuelve un EventEmitter (Client de MCLC) que emite:
//   'data'  → string con log del juego
//   'close' → código de salida
//   'download-progress' → { name, current, total } mientras descarga assets faltantes
function parseUserJvmArgs(str) {
	if (!str || typeof str !== 'string') return [];
	const out = [];
	const re = /(?:[^\s"]+|"[^"]*")+/g;
	let m;
	while ((m = re.exec(str)) !== null) out.push(m[0].replace(/^"|"$/g, ''));
	return out;
}

async function launch({ username, javaPath, ram, javaArgs }, { onData, onClose, onProgress }) {
	const client = new Client();
	const uuid = generateOfflineUUID(username);

	if (!findLwjglJar()) {
		throw new Error('Instalación incompleta: faltan librerías de LWJGL. Desinstala y vuelve a instalar el modpack para corregirlo.');
	}

	const classes = buildClasspath();
	console.log(`[launch] Classpath: ${classes.length} entradas`);
	console.log(`[launch] Últimas 5:\n  ${classes.slice(-5).join('\n  ')}`);
	console.log(`[launch] Game JAR (MCLC): ${path.join(MC_DIR, 'versions', NEOFORGE_VERSION_ID, `${NEOFORGE_VERSION_ID}.jar`)}`);

	const gameDir = getGameDir();
	const userExtra = parseUserJvmArgs(javaArgs);
	const jvmArgs = [...userExtra, ...buildNeoForgeJvmArgs()];
	console.log(`[launch] JVM args: ${jvmArgs.join(' ')}`);

	const opts = {
		authorization: {
			access_token: 'offline',
			client_token: uuid,
			uuid,
			name: username,
			user_properties: '{}',
		},
		root: MC_DIR,
		javaPath,
		version: {
			number: MC_VERSION,
			type: 'release',
			custom: NEOFORGE_VERSION_ID,
		},
		memory: {
			max: `${ram * 1024}M`,
			min: '512M',
		},
		customArgs: jvmArgs,
		overrides: {
			classes,
			gameDirectory: gameDir,
			cwd: gameDir,
			detached: false,
		},
	};

	client.on('data', (e) => onData(String(e)));
	client.on('close', (code) => onClose(code));
	client.on('debug', (msg) => onData(`[DEBUG] ${msg}`));

	// Rastrear archivos completados para progreso real (nunca retrocede)
	const startedFiles = new Set();
	const completedFiles = new Set();
	let smoothPercent = 0;

	client.on('download-status', (status) => {
		const key = status.name || String(Math.random());
		startedFiles.add(key);
		if (status.total > 0 && status.current >= status.total) completedFiles.add(key);

		const total = Math.max(startedFiles.size, 1);
		const done = completedFiles.size;
		const raw = Math.round((done / total) * 100);
		smoothPercent = Math.max(smoothPercent, Math.min(raw, 99));

		const fileName = key.split('/').pop().split('\\').pop().replace(/\.[^.]+$/, '');
		onProgress({
			message: `Descargando archivos del juego (${done}/${total})${fileName ? ` · ${fileName}` : ''}`,
			percent: smoothPercent,
			indeterminate: total < 10, // animación mientras no sabemos el total real
		});
	});

	const proc = await client.launch(opts);
	currentProcess = proc;
	if (proc && typeof proc.on === 'function') {
		proc.on('close', () => { if (currentProcess === proc) currentProcess = null; });
	}
	return client;
}

let currentProcess = null;

function killGame() {
	if (currentProcess && !currentProcess.killed) {
		const pid = currentProcess.pid;
		try { currentProcess.kill('SIGKILL'); } catch {}
		// En Windows el árbol de Java (bootstrap → javaw) no muere con
		// SIGKILL al padre; taskkill /T /F termina todo el árbol.
		if (process.platform === 'win32' && pid) {
			try {
				require('child_process').execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => {});
			} catch {}
		}
		currentProcess = null;
		return true;
	}
	return false;
}

function getGamePid() {
	return currentProcess && !currentProcess.killed ? currentProcess.pid : null;
}

module.exports = { launch, killGame, getGamePid };
