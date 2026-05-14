const RPC = require('discord-rpc');

// Reemplazar con tu Application ID del Discord Developer Portal.
// https://discord.com/developers/applications → New Application → Copiar Application ID
const DISCORD_APP_ID = process.env.DISCORD_APP_ID || '';

let client = null;
let connected = false;
let sessionStart = null;

async function connect() {
	if (!DISCORD_APP_ID) return false;
	if (connected) return true;
	try {
		client = new RPC.Client({ transport: 'ipc' });
		await client.login({ clientId: DISCORD_APP_ID });
		connected = true;
		return true;
	} catch (err) {
		console.warn('[Discord] No se pudo conectar:', err.message);
		client = null;
		connected = false;
		return false;
	}
}

async function setPlaying({ username, modpackVersion }) {
	if (!await connect()) return;
	sessionStart = Date.now();
	try {
		await client.setActivity({
			details: `Jugando Capibara Aeronautics`,
			state: `v${modpackVersion} · ${username}`,
			startTimestamp: sessionStart,
			largeImageKey: 'logo',
			largeImageText: 'Capibara Aeronautics SMP',
			instance: false,
		});
	} catch (err) {
		console.warn('[Discord] setActivity falló:', err.message);
	}
}

async function setIdle() {
	if (!connected || !client) return;
	try {
		await client.clearActivity();
	} catch {}
}

async function disconnect() {
	if (!client) return;
	try { await client.destroy(); } catch {}
	client = null;
	connected = false;
}

module.exports = { setPlaying, setIdle, disconnect };
