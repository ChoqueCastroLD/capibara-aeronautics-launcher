import { IcDownload, IcPlay, IcRefresh } from './Icons.jsx'

function chooseState({ phase, isOnline, javaOk, usernameOk, installed, updateAvailable, updateVersion, progress }) {
	if (phase === 'installing') return { v: 'busy',    label: `Instalando · ${progress?.percent || 0}%`, disabled: true, pct: progress?.percent || 0 }
	if (phase === 'updating')   return { v: 'busy',    label: `Actualizando · ${progress?.percent || 0}%`, disabled: true, pct: progress?.percent || 0 }
	if (phase === 'launching')  return { v: 'busy',    label: 'Iniciando', disabled: true, dots: true }
	if (phase === 'playing')    return { v: 'playing', label: 'En partida', disabled: true, dots: true }
	if (!isOnline)              return { v: 'offline', label: 'Sin conexión', disabled: true }
	if (!javaOk)                return { v: 'block',   label: 'Instalá Java 21', disabled: true }
	if (!usernameOk)            return { v: 'block',   label: 'Escribí un usuario', disabled: true }
	if (updateAvailable && installed) return { v: 'update',  label: `Actualizar a v${updateVersion || '?'}`, icon: <IcRefresh />, disabled: false }
	if (!installed)             return { v: 'install', label: 'Instalar modpack', icon: <IcDownload />, disabled: false }
	return                        { v: 'play', label: 'Jugar', icon: <IcPlay />, disabled: false }
}

export default function PlayButton(props) {
	const { onClick, onForceKill, phase, progress } = props
	const st = chooseState(props)

	return (
		<div className="space-y-2">
			<button onClick={onClick} disabled={st.disabled} data-variant={st.v} className="play">
				{(st.v === 'busy') && <div className="play-bar" style={{ width: `${st.pct || 0}%` }} />}
				<span className="label">
					{st.icon && <span style={{ opacity: .9 }}>{st.icon}</span>}
					<span>{st.label}</span>
					{st.dots && (
						<span className="dotline inline-flex items-center gap-1 pl-0.5">
							<span /><span /><span />
						</span>
					)}
				</span>
			</button>
			{phase === 'playing' && (
				<button className="btn btn-danger w-full text-[12px]" onClick={onForceKill}>Forzar cierre del juego</button>
			)}
			{(phase === 'installing' || phase === 'updating') && progress?.message && (
				<div className="text-[11px] truncate font-mono tracking-mini text-center" style={{ color: 'rgba(var(--ink),.55)' }}>
					{progress.message}
				</div>
			)}
		</div>
	)
}
