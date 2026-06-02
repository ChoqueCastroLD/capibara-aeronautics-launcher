/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,jsx}'],
	darkMode: 'class',
	theme: {
		extend: {
			fontFamily: {
				sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
				mono: ['"IBM Plex Mono"', 'Menlo', 'monospace'],
				display: ['"IBM Plex Sans"', 'system-ui', 'sans-serif']
			},
			colors: {
				snow:  { 50:'#F4F1EA', 100:'#ECEAE4', 200:'#DDD9D1', 300:'#C8C3B8' },
				steel: { 300:'#7E96AC', 500:'#3F5D77', 600:'#2D4B65', 700:'#1F384E' },
				olive: { 300:'#A5B27A', 400:'#8FA15A', 500:'#6E8044', 600:'#4D5B2E', 700:'#3A4623' },
				rust:  { 400:'#A8554A', 500:'#8A3A2A', 600:'#6A2B1F' },
				brass: { 400:'#B59A3A', 500:'#957D29', 600:'#705C1E' },
				ash:   { 100:'#E5E2DA', 300:'#9098A0', 500:'#5A6168', 700:'#2F353A', 800:'#1F2429', 900:'#15191D', 950:'#0C1014' }
			},
			letterSpacing: { micro:'0.02em', mini:'0.06em', caps:'0.14em' },
			keyframes: {
				rise:       { '0%':{ opacity:0, transform:'translateY(8px)' }, '100%':{ opacity:1, transform:'translateY(0)' } },
				'slide-up': { '0%':{ opacity:0, transform:'translateY(12px)' }, '100%':{ opacity:1, transform:'translateY(0)' } },
				'fade-in':  { '0%':{ opacity:0 }, '100%':{ opacity:1 } },
				'caret-blink': { '0%, 50%':{ opacity:1 }, '50.01%, 100%':{ opacity:0 } },
				sweep:      { '0%':{ backgroundPosition:'-200% 0' }, '100%':{ backgroundPosition:'200% 0' } },
				'pulse-brass': { '0%, 100%':{ boxShadow:'0 0 0 0 rgba(149,125,41,.5)' }, '50%':{ boxShadow:'0 0 0 4px rgba(149,125,41,0)' } }
			},
			animation: {
				rise:        'rise 0.4s cubic-bezier(.16,1,.3,1) both',
				'slide-up':  'slide-up .22s cubic-bezier(.16,1,.3,1) both',
				'fade-in':   'fade-in .15s ease-out both',
				caret:       'caret-blink 1s steps(2) infinite',
				sweep:       'sweep 1.8s linear infinite',
				'pulse-brass':'pulse-brass 2.4s ease-out infinite'
			}
		}
	},
	plugins: []
}
