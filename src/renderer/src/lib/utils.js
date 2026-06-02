export const isValidUsername = (n) => /^[a-zA-Z0-9_]{3,16}$/.test(n || '')
export const cn = (...xs) => xs.filter(Boolean).join(' ')

export const debounce = (fn, ms = 300) => {
	let t
	return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
}

export const classifyLogLine = (s) => {
	if (!s) return 'info'
	const t = s.toLowerCase()
	if (t.includes('error') || t.includes('fatal') || t.includes('exception')) return 'err'
	if (t.includes('warn'))  return 'warn'
	return 'info'
}

const DESYNC_RE = /(no value with id \d+|connector locator error|modulelayermigrator|iddispatchcodec)/i
export const isDesyncLine = (s) => DESYNC_RE.test(s || '')
