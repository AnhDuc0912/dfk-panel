require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const exphbs = require('express-handlebars');
const app = express();

const PORT = process.env.PORT || 3333;
const ROOT_DIR = path.resolve(process.env.ROOT_DIR || path.join(process.cwd(), 'repos'));
const NGINX_CONF = process.env.NGINX_CONF || '/etc/nginx/nginx.conf';
const NGINX_RELOAD_CMD = process.env.NGINX_RELOAD_CMD || 'nginx -s reload';

app.engine('hbs', exphbs.engine({
  extname: '.hbs',
  layoutsDir: path.join(__dirname, 'views', 'layouts'),
  defaultLayout: 'main',
  helpers: {
    encodeURIComponent: (str) => encodeURIComponent(str || '')
  }
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'public')));

function safeResolve(relPath = '') {
  const requested = path.normalize(relPath).replace(/^\/+/, '');
  const abs = path.resolve(ROOT_DIR, requested);
  if (!abs.startsWith(ROOT_DIR)) throw new Error('Path outside root');
  return abs;
}

function ensureRootExists() {
  if (!fs.existsSync(ROOT_DIR)) {
    fs.mkdirSync(ROOT_DIR, { recursive: true });
  }
}

ensureRootExists();

app.get('/', (req, res) => {
  res.redirect('/browse/');
});

app.get('/browse/*', (req, res) => {
  const rel = req.params[0] || '';
  let abs;
  try {
    abs = safeResolve(rel);
  } catch (e) {
    return res.status(400).send('Invalid path');
  }

  fs.stat(abs, (err, stats) => {
    if (err) return res.status(404).send('Not found');
    if (stats.isDirectory()) {
      fs.readdir(abs, { withFileTypes: true }, (err, items) => {
        if (err) return res.status(500).send('Unable to read directory');
        const list = items.map(it => {
          const name = it.name;
          const itemRel = rel ? path.posix.join(rel, name) : name;
          const href = it.isDirectory() ? ('/browse/' + encodeURIComponent(itemRel)) : ('/file?path=' + encodeURIComponent(itemRel));
          return { name, isDirectory: it.isDirectory(), rel: itemRel, href };
        });
        const parentRel = rel ? path.posix.dirname(rel) : '';
        res.render('browse', { root: ROOT_DIR, relPath: rel, parentRel, list });
      });
    } else {
      // If it's a file, show editor
      fs.readFile(abs, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Unable to read file');
        const parentRel = rel ? path.posix.dirname(rel) : '';
        res.render('edit', { relPath: rel, parentRel, content: data });
      });
    }
  });
});

app.get('/browse', (req, res) => res.redirect('/browse/'));

app.get('/file', (req, res) => {
  const rel = req.query.path || '';
  let abs;
  try { abs = safeResolve(rel); } catch (e) { return res.status(400).send('Invalid path'); }
  fs.stat(abs, (err, stats) => {
    if (err) return res.status(404).send('Not found');
    if (stats.isDirectory()) return res.redirect('/browse/' + rel);
    fs.readFile(abs, 'utf8', (err, data) => {
      if (err) return res.status(500).send('Unable to read file');
      const parentRel = rel ? path.posix.dirname(rel) : '';
      res.render('edit', { relPath: rel, parentRel, content: data });
    });
  });
});

app.post('/file/save', (req, res) => {
  const rel = req.body.path || '';
  const content = req.body.content || '';
  let abs;
  try { abs = safeResolve(rel); } catch (e) { return res.status(400).send('Invalid path'); }
  fs.writeFile(abs, content, 'utf8', (err) => {
    if (err) return res.status(500).send('Unable to save file: ' + err.message);
    res.redirect('/browse/' + rel);
  });
});

app.post('/file/create', (req, res) => {
  const relDir = req.body.path || '';
  const name = req.body.name;
  const type = req.body.type || 'file';
  if (!name) return res.status(400).send('Missing name');
  let absDir;
  try { absDir = safeResolve(relDir); } catch (e) { return res.status(400).send('Invalid path'); }
  const target = path.join(absDir, name);
  if (type === 'dir') {
    fs.mkdir(target, { recursive: true }, (err) => {
      if (err) {
        console.error('mkdir error:', err);
        return res.status(500).send('Unable to create dir: ' + err.message);
      }
      res.redirect('/browse/' + relDir);
    });
  } else {
    fs.writeFile(target, '', 'utf8', (err) => {
      if (err) return res.status(500).send('Unable to create file');
      res.redirect('/browse/' + path.posix.join(relDir, name));
    });
  }
});

app.post('/file/delete', (req, res) => {
  const rel = req.body.path || '';
  let abs;
  try { abs = safeResolve(rel); } catch (e) { return res.status(400).send('Invalid path'); }
  fs.rm(abs, { recursive: true, force: true }, (err) => {
    if (err) return res.status(500).send('Unable to delete');
    const parent = path.posix.dirname(rel);
    res.redirect('/browse/' + (parent === '.' ? '' : parent));
  });
});

app.get('/nginx', (req, res) => {
  fs.readFile(NGINX_CONF, 'utf8', (err, data) => {
    const content = err ? (`Unable to read ${NGINX_CONF}: ${err.message}`) : data;
    res.render('nginx', { nginxConfPath: NGINX_CONF, nginxReloadCmd: NGINX_RELOAD_CMD, content, error: !!err });
  });
});

app.post('/nginx/reload', (req, res) => {
  exec(NGINX_RELOAD_CMD, { timeout: 10000 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).send(`Reload failed: ${err.message}\n${stderr}`);
    }
    res.send(`Reload OK:\n${stdout}`);
  });
});

app.listen(PORT, () => {
  console.log(`DFKPanel listening on http://localhost:${PORT}`);
  console.log(`Root directory: ${ROOT_DIR}`);
});
