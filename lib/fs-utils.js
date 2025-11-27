const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(process.env.ROOT_DIR || path.join(process.cwd(), 'repos'));

function safeResolve(relPath = '') {
  const requested = path.normalize(relPath).replace(/^\/+/,'');
  const abs = path.resolve(ROOT_DIR, requested);
  if (!abs.startsWith(ROOT_DIR)) throw new Error('Path outside root');
  return abs;
}

function ensureRootExists() {
  if (!fs.existsSync(ROOT_DIR)) {
    fs.mkdirSync(ROOT_DIR, { recursive: true });
  }
}

module.exports = { ROOT_DIR, safeResolve, ensureRootExists };
