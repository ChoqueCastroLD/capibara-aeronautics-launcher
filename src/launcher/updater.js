const https = require('https');

const VERSION_URL = 'https://raw.githubusercontent.com/ChoqueCastroLD/aeronautics-modpack-versions/main/version.json';

function fetchLatestVersion() {
	return new Promise((resolve, reject) => {
		https.get(VERSION_URL, { timeout: 8000 }, (res) => {
			let data = '';
			res.on('data', (chunk) => (data += chunk));
			res.on('end', () => {
				try {
					resolve(JSON.parse(data));
				} catch {
					reject(new Error('Respuesta inválida del servidor de versiones'));
				}
			});
		}).on('error', reject).on('timeout', () => reject(new Error('Timeout al verificar actualizaciones')));
	});
}

async function checkForUpdates(installedVersion) {
	try {
		const latest = await fetchLatestVersion();
		const hasUpdate = latest.version && latest.version !== installedVersion;
		return { hasUpdate, latest, error: null };
	} catch (err) {
		return { hasUpdate: false, latest: null, error: err.message };
	}
}

module.exports = { checkForUpdates };
