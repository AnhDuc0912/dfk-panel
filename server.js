require('dotenv').config();
const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const exphbs = require('express-handlebars');
const { ensureRootExists, ROOT_DIR } = require('./lib/fs-utils');

const app = express();

const PORT = process.env.PORT || 3333;

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

ensureRootExists();

app.get('/', (req, res) => res.redirect('/browse/'));

// mount routers
app.use(require('./routes/browse'));
app.use(require('./routes/file'));
app.use(require('./routes/nginx'));
app.use(require('./routes/ftp'));

app.listen(PORT, () => {
  console.log(`DFKPanel listening on http://localhost:${PORT}`);
  console.log(`Root directory: ${ROOT_DIR}`);
});
