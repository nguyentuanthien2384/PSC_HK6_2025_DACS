const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const express = require('../backend/node_modules/express');
const compression = require('../backend/node_modules/compression');
const dotenv = require('../backend/node_modules/dotenv');
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run npm run preview.');
const frontendDir = path.resolve(__dirname, '../frontend');
const buildDir = path.join(frontendDir, 'build');
if (!fs.existsSync(path.join(buildDir, 'index.html'))) throw new Error('Run npm run build before npm run preview.');
const frontendEnvPath = path.join(frontendDir, '.env');
const frontendEnv = fs.existsSync(frontendEnvPath) ? dotenv.parse(fs.readFileSync(frontendEnvPath)) : {};
const host = frontendEnv.HOST || '127.0.0.1';
const port = Number(frontendEnv.PORT) || 3000;
const app = express(); app.disable('x-powered-by');
app.use(compression());
app.use('/static', express.static(path.join(buildDir, 'static'), { immutable: true, maxAge: '1y' }));
app.use(express.static(buildDir, { index: false, maxAge: 0 }));
app.use((req, res) => {
    if (req.method !== 'GET' || path.extname(req.path)) return res.status(404).end();
    return res.set('Cache-Control', 'no-cache').sendFile(path.join(buildDir, 'index.html'));
});
const server = app.listen(port, host, () => console.log(`Production preview: http://${host}:${port}`));
const backend = spawn(process.execPath, [npm, 'start'], {
    cwd: path.resolve(__dirname, '../backend'), stdio: 'inherit', windowsHide: true,
    env: { ...process.env, BABEL_DISABLE_CACHE: '1' }
});
let stopping = false;
function stop(code = 0) {
    if (stopping) return;
    stopping = true; server.close(); process.exitCode = code;
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(backend.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else backend.kill('SIGTERM');
}
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Stop npm start before npm run preview.` : error.message); stop(1); });
backend.on('error', error => { console.error(error.message); stop(1); });
backend.on('exit', code => stop(code || 0));
process.once('SIGINT', () => stop()); process.once('SIGTERM', () => stop());
