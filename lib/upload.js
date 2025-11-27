const multer = require('multer');
const fs = require('fs');
const { safeResolve } = require('./fs-utils');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const rel = req.body.path || '';
    let abs;
    try {
      abs = safeResolve(rel);
    } catch (e) {
      return cb(new Error('Invalid upload path'));
    }
    try {
      fs.mkdirSync(abs, { recursive: true });
    } catch (err) {
      return cb(err);
    }
    cb(null, abs);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

module.exports = multer({ storage });
