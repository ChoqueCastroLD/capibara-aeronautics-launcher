import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Titlebar from './components/Titlebar.jsx'
import HeroCard from './components/HeroCard.jsx'
import SidePanel from './components/SidePanel.jsx'
import Dock from './components/Dock.jsx'
import CrashModal from './components/CrashModal.jsx'
import UninstallModal from './components/UninstallModal.jsx'
import { isValidUsername, isDesyncLine, debounce } from './lib/utils.js'

const LOG_CAP = 2000
const DEFAULT_STATE = {
	username: '', ram: 6,
	javaPath: null, javaArgs: '',
	installed: false, installedVersion: null,
	gpuPref: 2
}

export default function App() {
	const [state, setState] = useState(DEFAULT_STATE)
	const [loaded, setLoaded] = useState(false)
	const [appVersion, setAppVersion] = useState('')
	const [maxRam, setMaxRam] = useState(16)

	const [java, setJava] = useState({ status: 'detecting' })
	const [javaInstalls, setJavaInstalls] = useState([])
	const [javaBusy, setJavaBusy] = useState(null)
	const [javaProgress, setJavaProgress] = useState({ percent: 0, phase: '' })
	const [gpus, setGpus] = useState([])

	const [isOnline, setIsOnline] = useState(navigator.onLine)
	const [updateInfo, setUpdateInfo] = useState({ available: false, latest: null })
	const [serverStatus, setServerStatus] = useState({ status: 'checking' })

	const [phase, setPhase] = useState('idle')
	const [progress, setProgress] = useState({ percent: 0, message: '' })
	const [logLines, setLogLines] = useState([])
	const [serverDesync, setServerDesync] = useState(false)

	const [tab, setTab] = useState('general')
	const [modal, setModal] = useState(null)
	const [crashInfo, setCrashInfo] = useState(null)

	const userKilledRef = useRef(false)
	const phaseRef = useRef('idle')
	useEffect(() => { phaseRef.current = phase }, [phase])
	const logRef = useRef([])
	useEffect(() => { logRef.current = logLines }, [logLines])

	const saveStateDebounced = useMemo(() => debounce((patch) => { window.api.saveState(patch).catch(() => {}) }, 400), [])

	useEffect(() => {
		(async () => {
			try {
				const [persisted, version, totalRam] = await Promise.all([
					window.api.getState(), window.api.getAppVersion(), window.api.getTotalRamGB()
				])
				const merged = { ...DEFAULT_STATE, ...persisted }
				setState(merged)
				setAppVersion(version)
				if (totalRam) setMaxRam(Math.min(32, Math.max(4, totalRam - 2)))
			} catch {}
			setLoaded(true)
		})()
	}, [])

	useEffect(() => {
		document.documentElement.classList.add('dark')
	}, [])

	useEffect(() => {
		const on = () => setIsOnline(true); const off = () => setIsOnline(false)
		window.addEventListener('online', on); window.addEventListener('offline', off)
		return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
	}, [])

	const detectJava = useCallback(async () => {
		setJava((j) => ({ ...j, status: 'detecting' }))
		try {
			const list = await window.api.detectJava()
			setJavaInstalls(list || [])
			const preferred = list.find((j) => j.path === state.javaPath)
			const best = preferred || list.find((j) => j.major === 21) || list.find((j) => j.major > 21) || list[0]
			if (!best) { setJava({ status: 'not-found' }); return }
			if (best.major === 21) setJava({ status: 'ok', major: 21, path: best.path })
			else setJava({ status: 'needs-21', major: best.major, path: best.path })
		} catch { setJava({ status: 'not-found' }); setJavaInstalls([]) }
	}, [state.javaPath])
	useEffect(() => { if (loaded) detectJava() }, [loaded, detectJava])

	const detectGpus = useCallback(async () => {
		try { const list = await window.api.detectGpus(); setGpus(list || []) } catch { setGpus([]) }
	}, [])
	useEffect(() => { if (loaded) detectGpus() }, [loaded, detectGpus])

	useEffect(() => {
		window.api.onJavaProgress((p) => setJavaProgress(p))
		window.api.onInstallProgress((p) => setProgress(p))
		window.api.onGameLog((line) => {
			setLogLines((prev) => { const next = prev.concat(String(line).trimEnd()); return next.length > LOG_CAP ? next.slice(next.length - LOG_CAP) : next })
			if (isDesyncLine(line)) setServerDesync(true)
		})
		window.api.onGameClosed((code) => {
			const wasPlaying = phaseRef.current === 'playing' || phaseRef.current === 'launching'
			setPhase('idle')
			if (wasPlaying && !userKilledRef.current && code !== 0 && code != null) {
				setCrashInfo({ code, log: logRef.current }); setModal('crash')
			}
			userKilledRef.current = false
		})
	}, [])

	const checkUpdate = useCallback(async () => {
		if (!state.installed) { setUpdateInfo({ available: false, latest: null }); return }
		try { const r = await window.api.checkForUpdates(); setUpdateInfo({ available: !!r?.hasUpdate, latest: r?.latest || null }) } catch {}
	}, [state.installed])
	useEffect(() => { if (loaded) checkUpdate() }, [loaded, checkUpdate, state.installedVersion])

	useEffect(() => {
		let cancelled = false
		const tick = async () => {
			try {
				const r = await window.api.pingServer()
				if (cancelled) return
				if (r?.online) setServerStatus({ status: 'online', players: r.players, max: r.maxPlayers })
				else setServerStatus({ status: 'offline' })
			} catch { if (!cancelled) setServerStatus({ status: 'offline' }) }
		}
		tick(); const id = setInterval(tick, 30000); return () => { cancelled = true; clearInterval(id) }
	}, [])

	const patchState = useCallback((patch) => { setState((prev) => { const next = { ...prev, ...patch }; saveStateDebounced(next); return next }) }, [saveStateDebounced])

	const javaOk = java.status === 'ok'
	const javaBusyState = javaBusy === 'downloading' || javaBusy === 'repairing'
	const usernameOk = isValidUsername(state.username)

	const onDownloadJava = async () => {
		setJavaBusy('downloading'); setJavaProgress({ percent: 0, phase: 'Descargando' })
		try { const r = await window.api.downloadJava(); if (r?.path) { patchState({ javaPath: r.path }); await detectJava() } }
		finally { setJavaBusy(null) }
	}
	const onRepairJava = async () => {
		if (!confirm('Esto borra el Java instalado y descarga uno nuevo. ¿Seguir?')) return
		setJavaBusy('repairing'); setJavaProgress({ percent: 0, phase: 'Reparando' })
		try { const r = await window.api.repairJava(); if (r?.path) { patchState({ javaPath: r.path }); await detectJava() } }
		finally { setJavaBusy(null) }
	}
	const onBrowseJava = async () => {
		const r = await window.api.browseJava()
		if (r?.path) { patchState({ javaPath: r.path }); await detectJava() }
	}
	const onSelectJava = async (jPath) => { patchState({ javaPath: jPath }); await detectJava() }

	const startInstall = async ({ update }) => {
		setPhase(update ? 'updating' : 'installing')
		setProgress({ percent: 0, message: 'Preparando…' })
		try {
			const r = await window.api.installModpack({
				javaPath: java.path || state.javaPath, ram: state.ram,
				mrpackUrl: update ? updateInfo.latest?.mrpack_url : undefined,
				version:   update ? updateInfo.latest?.version   : undefined
			})
			if (r?.ok) {
				patchState({ installed: true, installedVersion: update ? (updateInfo.latest?.version || state.installedVersion) : (r.version || state.installedVersion) })
				setUpdateInfo({ available: false, latest: null })
				setProgress({ percent: 100, message: update ? '✓ Actualizado' : '✓ Instalado' })
			} else {
				setProgress({ percent: 0, message: r?.error || 'Error en la instalación' })
				alert('Error en la instalación: ' + (r?.error || 'desconocido'))
			}
		} catch (e) { alert('Error: ' + e.message) }
		setTimeout(() => setPhase('idle'), 600)
	}

	const startLaunch = async () => {
		setPhase('launching'); setLogLines([]); setServerDesync(false)
		try {
			const r = await window.api.launchGame({
				username: state.username,
				javaPath: java.path || state.javaPath,
				ram: state.ram,
				gpuPref: state.gpuPref,
				javaArgs: state.javaArgs || ''
			})
			if (r?.ok) setPhase('playing')
			else { setPhase('idle'); alert('No se pudo lanzar: ' + (r?.error || 'desconocido')) }
		} catch (e) { setPhase('idle'); alert('Error: ' + e.message) }
	}

	const onPlay = () => {
		if (!isOnline || phase !== 'idle') return
		if (updateInfo.available && state.installed) return startInstall({ update: true })
		if (!state.installed) return startInstall({ update: false })
		return startLaunch()
	}

	const forceKill = async () => {
		if (!confirm('¿Forzar el cierre del juego?')) return
		userKilledRef.current = true
		try { await window.api.killGame() } catch {}
	}

	const onUninstall = async () => {
		await window.api.uninstallModpack()
		patchState({ installed: false, installedVersion: null })
		setUpdateInfo({ available: false, latest: null })
	}

	const openCrashLogs = () => { setTab('logs'); setModal(null) }
	const copyCrash = async () => { try { await navigator.clipboard.writeText((crashInfo?.log || []).join('\n')) } catch {} }

	if (!loaded) {
		return (
			<div className="h-full grid place-items-center">
				<div className="font-mono text-[11px] tracking-mini opacity-50 animate-pulse">cargando…</div>
			</div>
		)
	}

	return (
		<div className="h-full flex flex-col relative">
			<Titlebar version={appVersion} />

			<main className="flex-1 grid grid-cols-[480px_1fr] gap-4 px-4 pt-4 pb-2 min-h-0 relative z-10">
				{/* Left: Hero — Play button SIEMPRE visible */}
				<div className="flex flex-col gap-3 min-h-0">
					<div className="flex-1 flex items-center justify-center min-h-0">
						<HeroCard
							state={state} java={java} javaBusyState={javaBusyState}
							isOnline={isOnline} usernameOk={usernameOk}
							serverStatus={serverStatus} updateInfo={updateInfo}
							phase={phase} progress={progress} maxRam={maxRam}
							onPatchState={patchState}
							onPlay={onPlay} onForceKill={forceKill}
						/>
					</div>
					{serverDesync && (
						<div className="rounded-md px-3 py-2 flex items-center gap-2 text-[11.5px] animate-fade-in"
							style={{ background:'rgba(var(--amber),.1)', border:'1px solid rgba(var(--amber),.4)', color:'rgb(var(--amber-hi))' }}>
							<span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background:'rgb(var(--amber))' }} />
							<span className="font-medium">Modpack desincronizado del servidor — actualizá.</span>
						</div>
					)}
				</div>

				{/* Right: Side panel inline — no modales */}
				<div className="min-h-0">
					<SidePanel
						tab={tab} onTabChange={setTab}
						state={state} onPatchState={patchState}
						java={java} javaInstalls={javaInstalls}
						javaBusy={javaBusy} javaProgress={javaProgress}
						onDownloadJava={onDownloadJava} onRepairJava={onRepairJava}
						onBrowseJava={onBrowseJava} onSelectJava={onSelectJava}
						gpus={gpus} onRefreshGpus={detectGpus} onRefreshJava={detectJava}
						logLines={logLines}
						updateInfo={updateInfo}
					/>
				</div>
			</main>

			<footer className="flex items-center justify-center pb-3 relative z-10">
				<Dock
					installed={state.installed}
					mapActive={tab === 'mapa'}
					onToggleMap={() => setTab((t) => t === 'mapa' ? 'general' : 'mapa')}
					onOpenDir={() => window.api.openGameDir()}
					onUninstall={() => setModal('uninstall')}
				/>
			</footer>

			{modal === 'crash' && crashInfo && (
				<CrashModal code={crashInfo.code} recentLog={crashInfo.log}
					onClose={() => { setModal(null); setCrashInfo(null) }}
					onOpenLogs={openCrashLogs} onCopy={copyCrash} />
			)}
			{modal === 'uninstall' && <UninstallModal onClose={() => setModal(null)} onConfirm={onUninstall} />}
		</div>
	)
}

