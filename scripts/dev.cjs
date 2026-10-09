const { spawn } = require('node:child_process');
const path = require('node:path');
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Start the project with npm start.');
const children = ['backend', 'frontend'].map(project => spawn(process.execPath, [npm, 'start'], {
  cwd: path.resolve(__dirname, '..', project), stdio: 'inherit',
  env: { ...process.env, BROWSER: 'none' },
}));
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exitCode = code;
}
children.forEach(child => {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => stop(code || 0));
});
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
