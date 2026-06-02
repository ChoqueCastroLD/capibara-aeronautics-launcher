import { useEffect } from 'react'
import { IcClose } from './Icons.jsx'

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }

export default function ModalShell({ title, kicker, onClose, footer, children, size = 'md' }) {
	useEffect(() => {
		const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose])

	return (
		<>
			<div className="modal-backdrop" onClick={onClose} />
			<div className="modal-shell">
				<div className={`modal-card w-full ${SIZES[size]} flex flex-col max-h-[80vh]`}>
					<header className="px-5 pt-4 pb-3">
						<div className="flex items-start justify-between gap-4">
							<div className="min-w-0">
								{kicker && <div className="kicker mb-1.5">{kicker}</div>}
								<h2 className="text-[18px] font-semibold leading-tight">{title}</h2>
							</div>
							<button className="win-ctrl close -mr-1 -mt-1" onClick={onClose} aria-label="Cerrar"><IcClose /></button>
						</div>
					</header>
					<div className="flex-1 overflow-auto px-5 pb-4">{children}</div>
					{footer && (
						<footer className="px-5 py-3 border-t flex items-center justify-end gap-2" style={{ borderColor:'rgba(var(--border),.5)' }}>
							{footer}
						</footer>
					)}
				</div>
			</div>
		</>
	)
}
