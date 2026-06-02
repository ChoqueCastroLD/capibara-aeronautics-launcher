import { IcFolder, IcMap, IcTrash } from './Icons.jsx'

function DockItem({ icon, label, onClick, active, danger }) {
	return (
		<button className="dock-btn" data-active={active ? 'true' : 'false'} onClick={onClick} aria-label={label}>
			<span style={danger ? { color: 'rgb(var(--rust))' } : undefined}>{icon}</span>
			<span className="tip">{label}</span>
		</button>
	)
}

export default function Dock({ installed, mapActive, onToggleMap, onOpenDir, onUninstall }) {
	return (
		<div className="dock animate-slide-up" style={{ animationDelay: '120ms' }}>
			<DockItem icon={<IcMap />}    label="Mapa"     onClick={onToggleMap} active={mapActive} />
			{installed && <>
				<DockItem icon={<IcFolder />} label="Carpeta"  onClick={onOpenDir} />
				<DockItem icon={<IcTrash />}  label="Borrar"   onClick={onUninstall} danger />
			</>}
		</div>
	)
}
