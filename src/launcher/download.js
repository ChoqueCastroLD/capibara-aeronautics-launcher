const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

async function downloadFile(url, dest, onProgress, opts = {}) {
	const { maxRetries = 3, stallTimeoutMs = 30000 } = opts;
	fs.mkdirSync(path.dirname(dest), { recursive: true });

	const attempt = () => new Promise((resolve, reject) => {
		const follow = (u, redirects = 0) => {
			if (redirects > 5) return reject(new Error('Demasiados redirects'));
			const mod = u.startsWith('https') ? https : http;
			const req = mod.get(u, { headers: { 'User-Agent': 'CapibaraLauncher/1.0' } }, (res) => {
				if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
					res.resume();
					return follow(res.headers.location, redirects + 1);
				}
				if (res.statusCode !== 200) {
					res.resume();
					return reject(new Error(`HTTP ${res.statusCode} al descargar ${path.basename(dest)}`));
				}

				const total = parseInt(res.headers['content-length'] || '0');
				let received = 0;
				const file = fs.createWriteStream(dest);
				let lastChunkAt = Date.now();
				let done = false;

				const cleanup = () => { if (stallTimer) clearInterval(stallTimer); };

				const stallTimer = setInterval(() => {
					if (done) return cleanup();
					if (Date.now() - lastChunkAt > stallTimeoutMs) {
						done = true;
						cleanup();
						req.destroy(new Error('stall'));
						file.destroy();
						try { fs.unlinkSync(dest); } catch {}
						reject(new Error(`Descarga estancada ${stallTimeoutMs / 1000}s sin recibir datos`));
					}
				}, 2000);

				res.on('data', (chunk) => {
					received += chunk.length;
					lastChunkAt = Date.now();
					if (total && onProgress) onProgress(received, total);
				});
				res.pipe(file);
				file.on('finish', () => {
					if (done) return;
					done = true;
					cleanup();
					file.close();
					if (total && received < total) {
						try { fs.unlinkSync(dest); } catch {}
						return reject(new Error(`Descarga incompleta: ${received}/${total} bytes`));
					}
					resolve();
				});
				file.on('error', (e) => { done = true; cleanup(); reject(e); });
				res.on('error', (e) => { done = true; cleanup(); reject(e); });
			});
			req.on('error', reject);
			req.setTimeout(stallTimeoutMs, () => req.destroy(new Error('Timeout de conexión')));
		};
		follow(url);
	});

	let lastErr;
	for (let i = 1; i <= maxRetries; i++) {
		try {
			await attempt();
			return;
		} catch (err) {
			lastErr = err;
			console.warn(`[downloadFile] Intento ${i}/${maxRetries} falló para ${path.basename(dest)}: ${err.message}`);
			if (i < maxRetries) await new Promise(r => setTimeout(r, 2000 * i));
		}
	}
	throw lastErr || new Error('downloadFile falló sin error específico');
}

module.exports = { downloadFile };
