const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const STATE_FILE = path.join(app.getPath('userData'), 'launcher-state.json');

const DEFAULTS = {
  username: '',
  ram: 6,
  javaPath: null,
  installed: false,
  installedVersion: null,
};

function load() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(data) {
  const current = load();
  const merged = { ...current, ...data };
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

module.exports = { load, save };
