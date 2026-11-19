/**
 * Compila y publica el sitio estático en gh-pages.
 * Requiere Node.js compatible con Vite, Git y acceso de escritura al repositorio.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');
const marker = '.barberdp-generated';
const env = loadEnv('production', root, 'VITE_');
const publicKey = env.VITE_SUPABASE_ANON_KEY?.trim();
if (env.VITE_SUPABASE_URL?.trim() !== 'https://pavekklbjaplfbqvhmiy.supabase.co' ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey || '')) {
  throw new Error('Configura la URL de BARBER-DP y una clave sb_publishable_ en .env.production.local.');
}

function git(args, cwd = root) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const remote = git(['remote', 'get-url', 'origin']);
const pushRemote = git(['remote', 'get-url', '--push', '--all', 'origin']);
const barberRepo = /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)dgaviriaj-cmd\/BARBER-DP(?:\.git)?$/i;
if (!barberRepo.test(remote) || !barberRepo.test(pushRemote)) {
  throw new Error('El remote origin debe apuntar exclusivamente a dgaviriaj-cmd/BARBER-DP.');
}

execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: root,
  stdio: 'inherit',
});
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  throw new Error('Vite no generó dist/index.html.');
}
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
function catalog(directory, relative = '') {
  return fs.readdirSync(path.join(directory, relative), { withFileTypes: true })
    .filter(({ name }) => relative || (name !== '.git' && name !== marker))
    .flatMap((entry) => {
      const file = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isDirectory()) return catalog(directory, file);
      if (!entry.isFile()) throw new Error('Recurso no regular: ' + file);
      const hash = createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex');
      return [[file, hash]];
    });
}
fs.writeFileSync(path.join(dist, marker), JSON.stringify(catalog(dist)) + '\n');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'barberdp-pages-'));
try {
  if (git(['ls-remote', '--heads', remote, 'refs/heads/gh-pages'])) {
    git(['clone', '--quiet', '--single-branch', '--branch', 'gh-pages', remote, temp]);
    const markerPath = path.join(temp, marker);
    if (!fs.existsSync(markerPath) ||
        fs.readFileSync(markerPath, 'utf8').trim() !== JSON.stringify(catalog(temp))) {
      throw new Error('La rama gh-pages tiene contenido sin identificar. Revisa su historial antes de publicar.');
    }
    for (const entry of fs.readdirSync(temp)) {
      if (entry !== '.git') fs.rmSync(path.join(temp, entry), { recursive: true });
    }
  } else {
    git(['init', '--quiet', '--initial-branch=gh-pages'], temp);
  }
  fs.cpSync(dist, temp, { recursive: true });
  git(['add', '--all'], temp);
  if (git(['status', '--porcelain'], temp)) {
    git(['commit', '-m', 'deploy: publish BARBER-DP static site'], temp);
    git(['push', pushRemote, 'HEAD:refs/heads/gh-pages'], temp);
    console.log('Publicado en gh-pages.');
  } else {
    console.log('La rama gh-pages ya contiene esta compilación.');
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
