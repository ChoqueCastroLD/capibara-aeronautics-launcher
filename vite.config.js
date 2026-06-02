import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	root: path.join(dirname, 'src/renderer'),
	base: './',
	plugins: [react()],
	server: { port: 5173, strictPort: true },
	build: {
		outDir: path.join(dirname, 'src/renderer-dist'),
		emptyOutDir: true,
		assetsDir: '.',
		rollupOptions: {
			output: {
				entryFileNames: '[name].js',
				chunkFileNames: '[name].js',
				assetFileNames: '[name].[ext]'
			}
		}
	}
})
