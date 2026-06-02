import { IcClose, IcMaximize, IcMinimize } from './Icons.jsx'

export default function Titlebar({ version }) {
	return (
		<div className="app-titlebar">
			<div className="flex items-center gap-2 font-mono text-[10.5px] tracking-mini" style={{ color: 'rgba(var(--ink),.7)' }}>
				<span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'rgb(var(--amber))', boxShadow: '0 0 8px rgba(212,162,76,.7)' }} />
				<span className="font-semibold">CAPIBARA AERONAUTICS</span>
				<span style={{ color: 'rgba(var(--ink),.3)' }}>·</span>
				<span>LAUNCHER v{version || '—'}</span>
			</div>
			<div className="flex items-center gap-px">
				<button className="win-ctrl" onClick={() => window.api.minimize()} aria-label="Minimizar"><IcMinimize /></button>
				<button className="win-ctrl" onClick={() => window.api.maximize()} aria-label="Maximizar"><IcMaximize /></button>
				<button className="win-ctrl close" onClick={() => window.api.close()} aria-label="Cerrar"><IcClose /></button>
			</div>
		</div>
	)
}
