import { useEffect, useState } from 'react'
import { isValidUsername, cn } from '../lib/utils.js'
import PlayButton from './PlayButton.jsx'

const STEVE = 'MHF_Steve'

function StatusPill({ dot, value, title }) {
	return (
		<div className="pill" title={title || value}>
			{dot && <span className={cn('dot', dot)} />}
			<span>{value}</span>
		</div>
	)
}

export default function HeroCard({
	state, java, javaBusyState, isOnline, usernameOk,
	serverStatus, updateInfo, phase, progress, maxRam,
	onPatchState, onPlay, onForceKill
}) {
	const [skin, setSkin] = useState(null)
	const valid = isValidUsername(state.username)

	useEffect(() => {
		let active = true
		const name = valid ? state.username.trim() : STEVE
		window.api.getSkin(name).then((file) => {
			if (!active) return
			if (!file) { setSkin(null); return }
			if (/^(file|https?|data|blob):/i.test(file)) setSkin(file)
			else setSkin(`file:///${String(file).replace(/\\/g, '/')}`)
		}).catch(() => { if (active) setSkin(null) })
		return () => { active = false }
	}, [state.username, valid])

	const javaOk = java.status === 'ok'

	const javaPill = !javaOk && !javaBusyState
		? { dot: 'bad',  value: java.status === 'needs-21' ? `Java ${java.major} · no compatible` : 'Sin Java' }
		: javaBusyState
			? { dot: 'warn', value: 'Java · trabajando' }
			: { dot: 'online', value: 'Java 21' }

	const serverPill = serverStatus?.status === 'online'
		? { dot: 'online', value: `${serverStatus.players ?? '—'}${serverStatus.max ? '/' + serverStatus.max : ''} en línea` }
		: serverStatus?.status === 'checking'
			? { dot: 'warn', value: 'Conectando…' }
			: { dot: 'off',  value: 'Servidor offline' }

	const ramPct = ((state.ram - 4) / (maxRam - 4)) * 100

	return (
		<div className="panel panel-hl relative rounded-md px-6 py-5 w-full max-w-[480px] flex flex-col gap-5 animate-slide-up">
			{/* Insignia row: just the logo, no text — logo carries the name. */}
			<div className="flex flex-col items-center gap-2.5">
				<img
					src="./logo.png"
					alt="Capibara Aeronautics"
					style={{ width: 'auto', height: 96, maxWidth: '100%', display: 'block' }}
					className="select-none"
					draggable={false}
				/>
				<div className="flex items-center gap-3 w-full">
					<div className="flex-1 stripe-rule" />
					<div className="kicker">{state.installed ? `MODPACK v${state.installedVersion || '—'}` : 'MODPACK NO INSTALADO'}</div>
					<div className="flex-1 stripe-rule" />
				</div>
				{updateInfo.available && updateInfo.latest?.version && (
					<div className="kicker" style={{ color: 'rgb(var(--amber-hi))' }}>
						↻ ACTUALIZACIÓN DISPONIBLE · v{updateInfo.latest.version}
					</div>
				)}
			</div>

			{/* Identity row */}
			<div className="flex items-center gap-3">
				<div
					className="w-12 h-12 rounded-md grid place-items-center flex-shrink-0 overflow-hidden"
					style={{ background: 'rgba(var(--ink), .04)', border: '1px solid rgba(var(--border), .55)' }}
					aria-label={`Skin de ${valid ? state.username : 'Steve'}`}
				>
					{skin
						? <img src={skin} alt="" className="w-10 h-10 pixelated" />
						: <div className="w-9 h-9 rounded bg-[rgba(var(--ink),.08)]" />}
				</div>
				<div className="flex-1 min-w-0">
					<div className="kicker mb-1">Nombre de usuario</div>
					<input
						type="text"
						className={cn('input', state.username && !valid && 'invalid')}
						placeholder="Tu nombre (3–16 caracteres, letras/números/_)"
						value={state.username}
						maxLength={16}
						onChange={(e) => onPatchState({ username: e.target.value })}
					/>
				</div>
			</div>

			{/* RAM row */}
			<div>
				<div className="flex items-center justify-between mb-2">
					<div className="kicker">Memoria RAM</div>
					<div className="font-mono text-[12.5px] tabular-nums font-semibold">{state.ram} <span style={{ color: 'rgba(var(--ink),.5)' }}>/ {maxRam} GB</span></div>
				</div>
				<input
					type="range" min={4} max={maxRam} step={1}
					value={state.ram}
					disabled={phase !== 'idle'}
					onChange={(e) => onPatchState({ ram: parseInt(e.target.value, 10) })}
					className="range w-full"
					style={{ '--p': ramPct + '%' }}
					aria-label="Memoria RAM"
				/>
			</div>

			{/* Status row */}
			<div className="flex items-center gap-2 flex-wrap">
				<StatusPill {...javaPill} />
				<StatusPill {...serverPill} />
				{!isOnline && <StatusPill dot="bad" value="Sin conexión" />}
			</div>

			{/* Play */}
			<PlayButton
				phase={phase} isOnline={isOnline} javaOk={javaOk} usernameOk={usernameOk}
				installed={state.installed} updateAvailable={updateInfo.available}
				updateVersion={updateInfo.latest?.version}
				progress={progress}
				onClick={onPlay}
				onForceKill={onForceKill}
			/>
		</div>
	)
}
