const express = require('express');
const path = require('path');
const fs = require('fs');
const { safeResolve, ROOT_DIR } = require('../lib/fs-utils');

const router = express.Router();

router.get('/browse/*', (req, res) => {
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
      fs.readFile(abs, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Unable to read file');
        const parentRel = rel ? path.posix.dirname(rel) : '';
        res.render('edit', { relPath: rel, parentRel, content: data });
      });
    }
  });
});

router.get('/browse', (req, res) => res.redirect('/browse/'));

module.exports = router;
