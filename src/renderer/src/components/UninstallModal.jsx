import { useState } from 'react'
import ModalShell from './ModalShell.jsx'
import { IcAlert, IcTrash } from './Icons.jsx'

export default function UninstallModal({ onClose, onConfirm }) {
	const [running, setRunning] = useState(false)
	const confirm = async () => {
		setRunning(true)
		try { await onConfirm() } finally { setRunning(false); onClose() }
	}
	return (
		<ModalShell
			kicker="Acción destructiva"
			title="Desinstalar modpack"
			onClose={onClose}
			size="sm"
			footer={(
				<>
					<button className="btn btn-ghost" onClick={onClose} disabled={running}>Cancelar</button>
					<button className="btn btn-danger" onClick={confirm} disabled={running}>
						<IcTrash />{running ? 'Borrando…' : 'Sí, desinstalar'}
					</button>
				</>
			)}
		>
			<div className="flex gap-3">
				<div className="w-8 h-8 rounded-md grid place-items-center flex-shrink-0" style={{ background:'rgba(var(--rust),.1)', color:'rgb(var(--rust))' }}>
					<IcAlert />
				</div>
				<div className="text-[13px] leading-relaxed" style={{ color:'rgba(var(--ink),.85)' }}>
					Borra <strong>mods, configs y mundos guardados</strong> del modpack. Java y los archivos vanilla no se tocan. Esta acción no se puede deshacer.
				</div>
			</div>
		</ModalShell>
	)
}
