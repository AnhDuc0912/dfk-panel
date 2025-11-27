const express = require('express');
const path = require('path');
const fs = require('fs');
const upload = require('../lib/upload');
const { safeResolve } = require('../lib/fs-utils');

const router = express.Router();

router.get('/file', (req, res) => {
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

router.post('/file/save', (req, res) => {
  const rel = req.body.path || '';
  const content = req.body.content || '';
  let abs;
  try { abs = safeResolve(rel); } catch (e) { return res.status(400).send('Invalid path'); }
  fs.writeFile(abs, content, 'utf8', (err) => {
    if (err) return res.status(500).send('Unable to save file: ' + err.message);
    res.redirect('/browse/' + rel);
  });
});

router.post('/file/create', (req, res) => {
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

router.post('/file/delete', (req, res) => {
  const rel = req.body.path || '';
  let abs;
  try { abs = safeResolve(rel); } catch (e) { return res.status(400).send('Invalid path'); }
  fs.rm(abs, { recursive: true, force: true }, (err) => {
    if (err) return res.status(500).send('Unable to delete');
    const parent = path.posix.dirname(rel);
    res.redirect('/browse/' + (parent === '.' ? '' : parent));
  });
});

router.post('/file/upload', upload.array('files'), (req, res) => {
  const relDir = req.body.path || '';
  res.redirect('/browse/' + relDir);
});

module.exports = router;
