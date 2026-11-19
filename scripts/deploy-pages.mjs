/**
 * Publica BARBER-DP en la rama gh-pages SIN usar un workflow de compilación.
 * Requiere Node.js 22+, Git y autenticación GitHub local.
 * Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.production.local.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const sourceEnv = ['.env.production.local', '.env.production', '.env.local', '.env']
  .map((name) => path.join(root, name))
  .filter((name) => fs.existsSync(name));
const envContents = sourceEnv.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
  const fromProcess = process.env[name]?.trim();
  const match = envContents.match(new RegExp('^\\s*' + name + '\\s*=\\s*(.+)\\s*$', 'm'));
  if (!fromProcess && (!match || !match[1].replace(/[\\"']/g, '').trim())) {
    console.error('Falta ' + name + '. Configúrala en .env.production.local antes de publicar.');
    process.exit(1);
  }
}

function run(command, args, cwd = root, allowFailure = false) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0 && !allowFailure) {
    throw new Error('Falló: ' + command + ' ' + args.join(' '));
  }
  return result.status;
}
function capture(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(result.stderr || 'Error al consultar Git');
  return result.stdout.trim();
}

const remote = capture('git', ['remote', 'get-url', 'origin']);
const ownerRepo = /(?:github\.com[/:])([^/]+\/BARBER-DP)(?:\.git)?$/i.exec(remote);
if (!ownerRepo || ownerRepo[1].toLowerCase() !== 'dgaviriaj-cmd/barber-dp') {
  throw new Error('El remote origin no corresponde a dgaviriaj-cmd/BARBER-DP.');
}

console.log('Compilando aplicación con Vite...');
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  throw new Error('No se creó dist/index.html.');
}
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
fs.writeFileSync(path.join(dist, '.barberdp-generated'), 'Publicación generada por scripts/deploy-pages.mjs\n');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'barberdp-pages-'));
try {
  const exists = spawnSync('git', ['ls-remote', '--exit-code', '--heads', 'origin', 'gh-pages'], { cwd: root, encoding: 'utf8' }).status === 0;
  if (exists) {
    run('git', ['clone', '--quiet', '--single-branch', '--branch', 'gh-pages', remote, temp]);
    if (!fs.existsSync(path.join(temp, '.barberdp-generated'))) {
      throw new Error('La rama gh-pages existe y no está identificada como generada por BARBER-DP. No se sobrescribió.');
    }
  } else {
    run('git', ['clone', '--quiet', '--no-checkout', remote, temp]);
    run('git', ['checkout', '--orphan', 'gh-pages'], temp);
    run('git', ['rm', '-r', '-f', '--ignore-unmatch', '.'], temp);
  }
  for (const entry of fs.readdirSync(temp)) {
    if (entry !== '.git') fs.rmSync(path.join(temp, entry), { recursive: true, force: true });
  }
  fs.cpSync(dist, temp, { recursive: true, force: true });
  run('git', ['add', '--all'], temp);
  const changed = capture('git', ['status', '--porcelain'], temp);
  if (changed) {
    run('git', ['commit', '-m', 'deploy: publish BARBER-DP static site'], temp);
    run('git', ['push', 'origin', 'HEAD:gh-pages'], temp);
  } else {
    console.log('No hay cambios por publicar.');
  }
  console.log('Archivos publicados en gh-pages. Configura Pages: Deploy from a branch / gh-pages / (root).');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
