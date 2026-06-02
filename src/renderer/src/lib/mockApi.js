// Mock para previsualización en navegador (Vite dev). En Electron real
// window.api viene del preload y este código nunca se ejecuta.
export function installMockApi() {
	if (typeof window === 'undefined' || window.api) return
	const p = new URLSearchParams(location.search)
	const scenario = p.get('s') || 'ready'
	const log = (...a) => console.log('[mockApi]', ...a)

	const installed = scenario !== 'fresh'
	const updateAvailable = scenario === 'update'
	const noJava = scenario === 'nojava'
	const wrongJava = scenario === 'badjava'
	const offline = scenario === 'offline'

	const javaList = noJava ? [] : wrongJava
		? [
			{ major: 17, path: 'C:/Program Files/Java/jdk-17/bin/javaw.exe' },
			{ major: 8,  path: 'C:/Program Files/Eclipse Adoptium/jdk-8.0.392.8-hotspot/bin/javaw.exe' }
		]
		: [
			{ major: 21, path: 'C:/Program Files/Eclipse Adoptium/jdk-21.0.5.11-hotspot/bin/javaw.exe' },
			{ major: 17, path: 'C:/Program Files/Java/jdk-17/bin/javaw.exe' },
			{ major: 8,  path: 'C:/Program Files/Eclipse Adoptium/jdk-8.0.392.8-hotspot/bin/javaw.exe' }
		]

	const listeners = { java: [], install: [], log: [], closed: [] }
	const emit = (k, v) => listeners[k].forEach(cb => { try { cb(v) } catch {} })

	window.api = {
		minimize: () => log('minimize'),
		maximize: () => log('maximize'),
		close:    () => log('close'),
		getState: async () => ({ username: 'ShokoCC', ram: 8, javaPath: null, javaArgs: '', installed, installedVersion: installed ? '2.4.2' : null, gpuPref: 2 }),
		saveState: async (d) => { log('saveState', d); return d },
		getTotalRamGB: async () => 32,
		getAppVersion: async () => '1.1.0',
		detectGpus: async () => [{ name: 'NVIDIA GeForce RTX 4080' }, { name: 'Intel UHD Graphics' }],
		detectJava: async () => javaList,
		downloadJava: async () => { for (let i = 0; i <= 100; i += 10) { emit('java', { percent: i, phase: 'Descargando' }); await new Promise(r => setTimeout(r, 60)) } return { path: 'C:/Java/jdk-21/bin/javaw.exe' } },
		repairJava: async () => { for (let i = 0; i <= 100; i += 10) { emit('java', { percent: i, phase: 'Reparando' }); await new Promise(r => setTimeout(r, 50)) } return { path: 'C:/Java/jdk-21/bin/javaw.exe' } },
		browseJava: async () => null,
		onJavaProgress: (cb) => listeners.java.push(cb),
		installModpack: async () => { for (let i = 0; i <= 100; i += 5) { emit('install', { percent: i, message: i < 30 ? 'Descargando mods' : i < 60 ? 'Extrayendo configuración' : i < 95 ? 'Verificando integridad' : 'Finalizando' }); await new Promise(r => setTimeout(r, 30)) } return { ok: true, version: 'T2 2.4.2' } },
		uninstallModpack: async () => ({ ok: true }),
		onInstallProgress: (cb) => listeners.install.push(cb),
		launchGame: async () => { setTimeout(() => emit('closed', 0), 4000); return { ok: true } },
		killGame: async () => { emit('closed', null); return { ok: true } },
		openGameDir: async () => log('openDir'),
		onGameLog: (cb) => listeners.log.push(cb),
		onGameClosed: (cb) => listeners.closed.push(cb),
		copyLogs: async () => log('copyLogs'),
		openLogs: async () => log('openLogs'),
		setMapVisible: (v) => log('setMapVisible', v),
		getSkin: async (name) => `https://mc-heads.net/avatar/${encodeURIComponent(name || 'MHF_Steve')}/64/nohelm.png`,
		checkForUpdates: async () => ({ hasUpdate: updateAvailable, latest: updateAvailable ? { version: '2.5.0', changelog: ['Optimización de chunks', 'Fix de crash en walls', 'Update de Create a 6.0.11'], mrpack_url: '' } : null }),
		pingServer: async () => offline ? { online: false } : { online: true, players: 12, maxPlayers: 40 }
	}

	if (offline) Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })

	if (p.get('seed') === 'logs') {
		const sample = [
			'[16:30:21] [Render thread/INFO]: Starting Minecraft 1.21.1',
			'[16:30:22] [Render thread/INFO]: Loading Sodium 0.6.13+mc1.21.1',
			'[16:30:23] [Render thread/INFO]: Loading Iris 1.8.12',
			'[16:30:24] [Render thread/WARN]: Mixin redirect skipped: chloride.LeavesBlockMixin',
			'[16:30:25] [Render thread/INFO]: KubeJS server scripts loaded (20 files)',
			'[16:30:26] [Render thread/INFO]: Loaded 264 mods, 47 resource packs',
			'[16:30:27] [Render thread/INFO]: Bound to 0.0.0.0',
			'[16:30:30] [Render thread/INFO]: Connecting to mc.capibaratraductor.com',
			'[16:30:31] [Server Connector #1/INFO]: Handshake OK · proto 767',
			'[16:30:32] [Render thread/INFO]: Login phase complete',
			'[16:30:33] [Render thread/INFO]: Joined the world as ShokoCC',
			'[16:30:34] [Render thread/INFO]: Spawned at world (1865, 82, 5276)',
			'[16:30:35] [Render thread/WARN]: respackopts: variable crackingarmor not found',
			'[16:30:36] [Render thread/INFO]: Loading chunks within render distance 12',
			'[16:30:37] [Server thread/INFO]: <ShokoCC> hola',
			'[16:30:38] [Render thread/INFO]: Loaded 384 chunks',
			'[16:30:39] [Render thread/INFO]: VRAM use 4.2 GB / 12 GB',
			'[16:30:40] [Render thread/WARN]: Veil: shader sampler missing',
			'[16:30:41] [Render thread/ERROR]: NullPointerException at cosycritters.trySpawnBird:92',
			'[16:30:41] [Render thread/INFO]: Crash report saved to crash-2026-06-02_16.30.41.txt'
		]
		const tick = () => {
			if (listeners.log.length) {
				sample.forEach((s, i) => setTimeout(() => emit('log', s), i * 12))
			} else setTimeout(tick, 50)
		}
		setTimeout(tick, 50)
	}
}
