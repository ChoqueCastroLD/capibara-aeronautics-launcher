import { useEffect, useMemo, useRef, useState } from 'react'
import { cn, classifyLogLine } from '../lib/utils.js'
import { IcAlert, IcCheck, IcCopy, IcDownload, IcExternal, IcMap, IcSearch, IcWrench } from './Icons.jsx'

const TABS = [
	{ id: 'general',   label: 'General' },
	{ id: 'java',      label: 'Java' },
	{ id: 'logs',      label: 'Logs' },
	{ id: 'novedades', label: 'Novedades' },
	{ id: 'mapa',      label: 'Mapa' }
]

export default function SidePanel({
	tab, onTabChange,
	state, onPatchState,
	java, javaInstalls, javaBusy, javaProgress,
	onDownloadJava, onRepairJava, onBrowseJava, onSelectJava,
	gpus, onRefreshGpus, onRefreshJava,
	logLines,
	updateInfo
}) {
	return (
		<div className="panel rounded-md flex flex-col h-full overflow-hidden relative panel-hl">
			<div className="tab-bar px-2 pt-1 flex-shrink-0">
				{TABS.map(t => (
					<button key={t.id} className="tab" data-active={tab === t.id} onClick={() => onTabChange(t.id)}>
						{t.label}
					</button>
				))}
			</div>
			<div className="flex-1 overflow-hidden">
				{tab === 'general'   && <GeneralTab   state={state} onPatchState={onPatchState} gpus={gpus} onRefreshGpus={onRefreshGpus} />}
				{tab === 'java'      && <JavaTab      state={state} onPatchState={onPatchState} java={java} javaInstalls={javaInstalls} javaBusy={javaBusy} javaProgress={javaProgress} onDownloadJava={onDownloadJava} onRepairJava={onRepairJava} onBrowseJava={onBrowseJava} onSelectJava={onSelectJava} onRefreshJava={onRefreshJava} />}
				{tab === 'logs'      && <LogsTab      lines={logLines} />}
				{tab === 'novedades' && <NovedadesTab state={state} updateInfo={updateInfo} />}
				{tab === 'mapa'      && <MapaTab />}
			</div>
		</div>
	)
}

/* ── General ──────────────────────────────────────────────── */
function GeneralTab({ state, onPatchState, gpus, onRefreshGpus }) {
	return (
		<div className="p-4 space-y-5 overflow-auto h-full">
			<section>
				<div className="kicker mb-2 flex items-center justify-between">
					<span>Aceleración gráfica</span>
					<button className="text-[10px] underline opacity-60 hover:opacity-100" onClick={onRefreshGpus}>Re-detectar</button>
				</div>
				<div className="space-y-1.5">
					{[
						{ v:2, t:'Alto rendimiento', s:'GPU dedicada (recomendado)' },
						{ v:1, t:'Ahorro de energía',  s:'GPU integrada' },
						{ v:0, t:'Automático',          s:'Windows decide' }
					].map(o => (
						<button key={o.v} className="choice w-full" data-active={state.gpuPref === o.v}
							onClick={() => onPatchState({ gpuPref: o.v })}>
							<div className="text-[12.5px] font-semibold">{o.t}</div>
							<div className="text-[11px]" style={{ color: 'rgba(var(--ink),.55)' }}>{o.s}</div>
						</button>
					))}
				</div>
				{gpus.length > 0 && (
					<div className="mt-2 font-mono text-[10.5px] tracking-micro space-y-0.5" style={{ color: 'rgba(var(--ink),.45)' }}>
						{gpus.slice(0, 3).map((g, i) => <div key={i}>· {g.name || g}</div>)}
					</div>
				)}
			</section>

			<section>
				<div className="kicker mb-2">Servidor</div>
				<div className="panel-soft rounded-md p-3 font-mono text-[11.5px]" style={{ color:'rgba(var(--ink),.75)' }}>
					mc.capibaratraductor.com:25565
				</div>
			</section>
		</div>
	)
}

/* ── Java ─────────────────────────────────────────────────── */
function JavaTab({ state, onPatchState, java, javaInstalls, javaBusy, javaProgress, onDownloadJava, onRepairJava, onBrowseJava, onSelectJava, onRefreshJava }) {
	const selectedPath = state.javaPath || java?.path || null
	const incompatible = java?.status === 'needs-21'
	const missing = java?.status === 'not-found'

	return (
		<div className="p-4 space-y-4 overflow-auto h-full">
			{incompatible && (
				<div className="rounded-md p-3 flex items-start gap-2.5"
					style={{ background: 'rgba(var(--rust),.1)', border: '1px solid rgba(var(--rust),.4)' }}>
					<span style={{ color:'rgb(var(--rust))' }}><IcAlert /></span>
					<div className="text-[12px] leading-snug">
						<div className="font-semibold mb-0.5" style={{ color:'rgb(var(--rust))' }}>Java incompatible</div>
						<div style={{ color:'rgba(var(--ink),.75)' }}>El servidor requiere <b>Java 21</b>. Tu Java {java?.major || '?'} no funciona con Minecraft 1.21.1 + NeoForge.</div>
					</div>
				</div>
			)}
			{missing && (
				<div className="rounded-md p-3 flex items-start gap-2.5"
					style={{ background: 'rgba(var(--amber),.08)', border: '1px solid rgba(var(--amber),.4)' }}>
					<span style={{ color:'rgb(var(--amber-hi))' }}><IcAlert /></span>
					<div className="text-[12px] leading-snug">
						<div className="font-semibold mb-0.5">No se detectó Java</div>
						<div style={{ color:'rgba(var(--ink),.75)' }}>Descargá Temurin 21 con el botón de abajo.</div>
					</div>
				</div>
			)}

			<section>
				<div className="kicker mb-2 flex items-center justify-between">
					<span>Java en tu PC</span>
					<button className="text-[10px] underline opacity-60 hover:opacity-100" onClick={onRefreshJava}>Re-detectar</button>
				</div>
				<div className="space-y-1.5">
					{javaInstalls.length === 0 && (
						<div className="text-[11.5px] italic" style={{ color:'rgba(var(--ink),.4)' }}>(no se detectó ninguna instalación de Java)</div>
					)}
					{javaInstalls.map((j, i) => {
						const isSel = selectedPath === j.path
						const ok = j.major === 21
						return (
							<button key={i} className="choice w-full" data-active={isSel} onClick={() => onSelectJava(j.path)}>
								<div className="flex items-center justify-between gap-2">
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span className="text-[12.5px] font-semibold">Java {j.major}</span>
											{ok
												? <span className="pill"><span className="dot online" />compatible</span>
												: <span className="pill" style={{ color:'rgb(var(--rust))', borderColor:'rgba(var(--rust),.4)' }}><span className="dot bad" />no compatible</span>
											}
										</div>
										<div className="font-mono text-[10px] tracking-micro mt-0.5 truncate" style={{ color:'rgba(var(--ink),.55)' }}>{j.path}</div>
									</div>
									{isSel && <span style={{ color:'rgb(var(--amber-hi))' }}><IcCheck /></span>}
								</div>
							</button>
						)
					})}
				</div>
				<div className="flex items-center gap-2 mt-3">
					<button className="btn text-[11.5px]" onClick={onBrowseJava}>Examinar…</button>
					{state.javaPath && (
						<button className="btn btn-ghost text-[11.5px]" onClick={() => onPatchState({ javaPath: null })}>
							Usar automático
						</button>
					)}
				</div>
			</section>

			<section>
				<div className="kicker mb-2">Acciones</div>
				<div className="flex flex-wrap gap-2">
					<button className="btn text-[12px]" onClick={onDownloadJava} disabled={!!javaBusy}>
						<IcDownload /> {javaBusy === 'downloading' ? `Descargando ${javaProgress?.percent || 0}%` : 'Instalar Java 21'}
					</button>
					<button className="btn text-[12px]" onClick={onRepairJava} disabled={!!javaBusy}>
						<IcWrench /> {javaBusy === 'repairing' ? `Reparando ${javaProgress?.percent || 0}%` : 'Reparar Java'}
					</button>
				</div>
				{javaBusy && (
					<div className="bar-track mt-3"><div className="bar-fill" style={{ width: `${javaProgress?.percent || 0}%` }} /></div>
				)}
			</section>

			<section>
				<div className="kicker mb-2">Argumentos JVM personalizados</div>
				<textarea
					className="input input-mono"
					rows={3}
					placeholder='-XX:+UseG1GC -XX:MaxGCPauseMillis=50 -Dprop=valor'
					value={state.javaArgs || ''}
					onChange={(e) => onPatchState({ javaArgs: e.target.value })}
					style={{ resize: 'none', minHeight: 64 }}
				/>
				<div className="text-[10.5px] mt-1.5" style={{ color:'rgba(var(--ink),.45)' }}>
					Se agregan antes de los flags de NeoForge. Espacios separan; comillas para valores con espacios.
				</div>
			</section>
		</div>
	)
}

/* ── Logs ─────────────────────────────────────────────────── */
function LogsTab({ lines }) {
	const [filter, setFilter] = useState('all')
	const [q, setQ] = useState('')
	const [autoscroll, setAutoscroll] = useState(true)
	const scrollRef = useRef(null)

	const classified = useMemo(() => lines.map((l, i) => ({ idx: i + 1, raw: l, kind: classifyLogLine(l) })), [lines])
	const filtered = useMemo(() => {
		const ql = q.toLowerCase()
		return classified.filter(c => {
			if (filter !== 'all' && c.kind !== filter) return false
			if (ql && !c.raw.toLowerCase().includes(ql)) return false
			return true
		})
	}, [classified, filter, q])

	useEffect(() => {
		if (!autoscroll || !scrollRef.current) return
		scrollRef.current.scrollTop = scrollRef.current.scrollHeight
	}, [filtered.length, autoscroll])

	const copyAll = async () => { try { await navigator.clipboard.writeText(lines.join('\n')) } catch {} }
	const openFile = () => window.api.openLogs?.()

	return (
		<div className="flex flex-col h-full">
			<div className="p-3 flex items-center gap-2 border-b" style={{ borderColor:'rgb(var(--border-soft))' }}>
				<div className="relative flex-1">
					<span className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color:'rgba(var(--ink),.4)' }}><IcSearch /></span>
					<input className="input pl-8 text-[12px]" placeholder="Filtrar…" value={q} onChange={(e) => setQ(e.target.value)} />
				</div>
				<select className="input text-[11.5px] py-1.5 px-2 w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
					<option value="all">Todo</option>
					<option value="err">Errores</option>
					<option value="warn">Warnings</option>
					<option value="info">Info</option>
				</select>
			</div>
			<div className="px-3 py-1.5 flex items-center gap-3 text-[10.5px] font-mono tracking-mini" style={{ color:'rgba(var(--ink),.55)' }}>
				<label className="inline-flex items-center gap-1.5 cursor-pointer">
					<input type="checkbox" checked={autoscroll} onChange={(e) => setAutoscroll(e.target.checked)} className="accent-[rgb(var(--amber))]" />
					AUTO-SCROLL
				</label>
				<span className="opacity-50">·</span>
				<span>{filtered.length} / {lines.length}</span>
				<span className="ml-auto flex items-center gap-1">
					<button className="btn btn-ghost px-2 py-1 text-[10.5px]" onClick={openFile}><IcExternal />Archivo</button>
					<button className="btn btn-ghost px-2 py-1 text-[10.5px]" onClick={copyAll}><IcCopy />Copiar</button>
				</span>
			</div>
			<div ref={scrollRef} className="log-pane flex-1 overflow-auto">
				{filtered.length === 0
					? <div className="px-3 py-6 text-center opacity-50">No hay logs todavía.</div>
					: filtered.map((c) => (
						<div key={c.idx} className={cn('log-row', c.kind)}>
							<span className="ln">{c.idx}</span>{c.raw}
						</div>
					))}
			</div>
		</div>
	)
}

/* ── Novedades ────────────────────────────────────────────── */
function NovedadesTab({ state, updateInfo }) {
	const changelog = updateInfo.latest?.changelog || []
	const latestVer = updateInfo.latest?.version
	const installedVer = state.installedVersion

	return (
		<div className="p-4 space-y-4 overflow-auto h-full">
			<section>
				<div className="kicker mb-1">Modpack actual</div>
				<div className="text-[18px] font-semibold">v{installedVer || '—'}</div>
			</section>
			{updateInfo.available && (
				<section className="rounded-md p-3" style={{ background:'rgba(var(--amber),.08)', border:'1px solid rgba(var(--amber),.4)' }}>
					<div className="flex items-center justify-between mb-2">
						<div>
							<div className="kicker" style={{ color:'rgba(var(--amber-hi),.85)' }}>NUEVA VERSIÓN</div>
							<div className="text-[16px] font-semibold" style={{ color:'rgb(var(--amber-hi))' }}>v{latestVer}</div>
						</div>
					</div>
					{changelog.length > 0 ? (
						<ul className="space-y-1 text-[12px] list-disc list-inside" style={{ color:'rgba(var(--ink),.85)' }}>
							{Array.isArray(changelog)
								? changelog.map((line, i) => <li key={i}>{line}</li>)
								: String(changelog).split('\n').filter(Boolean).map((line, i) => <li key={i}>{line.replace(/^[-·]\s*/, '')}</li>)
							}
						</ul>
					) : (
						<div className="text-[11.5px] italic" style={{ color:'rgba(var(--ink),.55)' }}>(sin notas publicadas)</div>
					)}
				</section>
			)}
			{!updateInfo.available && (
				<section>
					<div className="kicker mb-1">Estado</div>
					<div className="text-[12.5px]" style={{ color:'rgba(var(--ink),.7)' }}>
						Estás en la última versión disponible. Cuando se publique una actualización aparecerá acá.
					</div>
				</section>
			)}
		</div>
	)
}

/* ── Mapa (inline, lazy) ──────────────────────────────────── */
const MAP_URL = 'http://mc.capibaratraductor.com/#world:0:0:0:5045:0:0:0:1:flat'

function MapaTab() {
	const [loaded, setLoaded] = useState(false)
	const [ready, setReady] = useState(false)

	return (
		<div className="flex flex-col h-full">
			<div className="px-3 py-2 flex items-center gap-2 border-b" style={{ borderColor:'rgb(var(--border-soft))' }}>
				<span style={{ color:'rgba(var(--ink),.55)' }}><IcMap /></span>
				<span className="kicker">Mapa del servidor</span>
				<a className="btn btn-ghost text-[11px] ml-auto px-2 py-1" href={MAP_URL} target="_blank" rel="noopener noreferrer">
					<IcExternal />En navegador
				</a>
			</div>
			<div className="flex-1 relative overflow-hidden" style={{ background:'rgb(var(--bg-0))' }}>
				{!loaded && (
					<div className="absolute inset-0 grid place-items-center p-6">
						<div className="text-center max-w-xs">
							<div className="w-10 h-10 mx-auto mb-3 grid place-items-center" style={{ color:'rgba(var(--amber-hi),.7)' }}><IcMap /></div>
							<p className="text-[12px] mb-4 leading-relaxed" style={{ color:'rgba(var(--ink),.7)' }}>
								El mapa consume recursos. Se carga solo cuando lo pedís.
							</p>
							<button className="btn btn-primary text-[12px]" onClick={() => setLoaded(true)}>Cargar mapa</button>
						</div>
					</div>
				)}
				{loaded && (
					<>
						{!ready && <div className="absolute inset-0 grid place-items-center text-[11px] font-mono" style={{ color:'rgba(var(--ink),.4)' }}>cargando…</div>}
						<iframe
							title="Mapa del servidor"
							src={MAP_URL}
							loading="lazy"
							referrerPolicy="no-referrer"
							className="absolute inset-0 w-full h-full border-0"
							style={{ transform: 'scale(0.5)', transformOrigin: 'top left', width: '200%', height: '200%' }}
							onLoad={() => setReady(true)}
						/>
					</>
				)}
			</div>
		</div>
	)
}
