import ModalShell from './ModalShell.jsx'
import { IcAlert, IcCopy, IcTerminal } from './Icons.jsx'

export default function CrashModal({ code, recentLog, onClose, onOpenLogs, onCopy }) {
	return (
		<ModalShell
			kicker="Reporte"
			title="El juego se cerró"
			onClose={onClose}
			size="md"
			footer={(
				<>
					<button className="btn btn-ghost" onClick={onCopy}><IcCopy />Copiar logs</button>
					<button className="btn btn-ghost" onClick={onOpenLogs}><IcTerminal />Ver log</button>
					<button className="btn btn-primary" onClick={onClose}>Cerrar</button>
				</>
			)}
		>
			<div className="flex gap-3 mb-4">
				<div className="w-8 h-8 rounded-md grid place-items-center flex-shrink-0" style={{ background:'rgba(var(--rust),.1)', color:'rgb(var(--rust))' }}>
					<IcAlert />
				</div>
				<div className="text-[13px] leading-relaxed" style={{ color:'rgba(var(--ink),.85)' }}>
					Código de salida <span className="font-mono">{code ?? '?'}</span>. Si fue un crash,
					copiá los logs y pegalos en <strong>#soporte</strong> del Discord para que te ayudemos.
				</div>
			</div>
			{recentLog && recentLog.length > 0 && (
				<div className="log-pane rounded-md py-2 max-h-64 overflow-auto">
					{recentLog.slice(-30).map((l, i) => (
						<div key={i} className="log-row info">{l}</div>
					))}
				</div>
			)}
		</ModalShell>
	)
}
