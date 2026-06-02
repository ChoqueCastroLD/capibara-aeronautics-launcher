const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }

export const IcMinimize = (p) => <svg viewBox="0 0 14 14" width="14" height="14" {...S} {...p}><path d="M3 7h8" /></svg>
export const IcMaximize = (p) => <svg viewBox="0 0 14 14" width="12" height="12" {...S} {...p}><rect x="3" y="3" width="8" height="8" rx="1" /></svg>
export const IcClose    = (p) => <svg viewBox="0 0 14 14" width="12" height="12" {...S} {...p}><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" /></svg>

export const IcMap      = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><path d="M2 4l4-1 4 1 4-1v10l-4 1-4-1-4 1V4z M6 3v11 M10 4v11" /></svg>
export const IcSun      = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><circle cx="8" cy="8" r="2.5" /><path d="M8 1.5v1.5 M8 13v1.5 M1.5 8h1.5 M13 8h1.5 M3.2 3.2l1 1 M11.8 11.8l1 1 M3.2 12.8l1-1 M11.8 4.2l1-1" /></svg>
export const IcMoon     = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><path d="M13.5 9.5a5.5 5.5 0 1 1-7-7c0 3 2.5 5.5 5.5 5.5 .5 0 1-.05 1.5-.15" /></svg>

export const IcSettings = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><circle cx="8" cy="8" r="1.6" /><path d="M8 1.5v2 M8 12.5v2 M3.5 3.5l1.4 1.4 M11.1 11.1l1.4 1.4 M1.5 8h2 M12.5 8h2 M3.5 12.5l1.4-1.4 M11.1 4.9l1.4-1.4" /></svg>
export const IcTerminal = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M4.5 6l1.5 1.5L4.5 9 M7.5 10h3" /></svg>
export const IcBoxes    = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><rect x="2" y="2.5" width="5" height="5" rx="1" /><rect x="9" y="2.5" width="5" height="5" rx="1" /><rect x="5.5" y="9" width="5" height="5" rx="1" /></svg>
export const IcFolder   = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><path d="M2 4.5C2 3.7 2.7 3 3.5 3h2l1.5 1.5h5.5c.8 0 1.5.7 1.5 1.5v6c0 .8-.7 1.5-1.5 1.5h-9c-.8 0-1.5-.7-1.5-1.5V4.5z" /></svg>
export const IcTrash    = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><path d="M3 5h10 M5.5 5V3.5c0-.5.4-1 1-1h3c.6 0 1 .5 1 1V5 M5 5l.5 8c0 .5.4 1 1 1h3c.6 0 1-.5 1-1l.5-8" /></svg>
export const IcNews     = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><path d="M3 3h10v10H3z M5.5 6h5 M5.5 8.5h5 M5.5 11h3" /></svg>
export const IcWrench   = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><path d="M11 1.5a3.5 3.5 0 0 0-3.4 4.4L2 11.5l1 1L4 11.5l1 1 1-1 1 1 3.6-3.6A3.5 3.5 0 1 0 11 1.5z" /></svg>
export const IcDownload = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><path d="M8 2v8 M5 7l3 3 3-3 M3 13h10" /></svg>
export const IcCheck    = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><path d="M3 8.5l3 3 7-7" /></svg>
export const IcAlert    = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><path d="M8 2L1.5 13.5h13L8 2z M8 6v4 M8 12v.5" /></svg>
export const IcCopy     = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><rect x="4" y="4" width="9" height="10" rx="1.2" /><path d="M10 4V3a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v9" /></svg>
export const IcSearch   = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><circle cx="7" cy="7" r="4.5" /><path d="M13 13l-2.7-2.7" /></svg>
export const IcArrowUp  = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><path d="M3 13L13 3 M6 3h7v7" /></svg>
export const IcEye      = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z" /><circle cx="8" cy="8" r="1.8" /></svg>
export const IcExternal = (p) => <svg viewBox="0 0 16 16" width="12" height="12" {...S} {...p}><path d="M6 3H3v10h10v-3 M9 3h4v4 M13 3L7.5 8.5" /></svg>
export const IcPlay     = (p) => <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" stroke="none" {...p}><path d="M4 2.5v11l9-5.5z" /></svg>
export const IcRefresh  = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><path d="M2.5 8a5.5 5.5 0 0 1 9.4-3.9 M13.5 8a5.5 5.5 0 0 1-9.4 3.9 M11.9 1.5v2.6h-2.6 M4.1 14.5v-2.6h2.6" /></svg>
export const IcFilter   = (p) => <svg viewBox="0 0 16 16" width="14" height="14" {...S} {...p}><path d="M2 3.5h12 L9.5 8.5v4l-3 1.5v-5.5z" /></svg>
