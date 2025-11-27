const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const { ROOT_DIR } = require('../lib/fs-utils');
const path = require('path');
const os = require('os');
 

const router = express.Router();

const NGINX_CONF = process.env.NGINX_CONF || '/etc/nginx/nginx.conf';
// Recommended defaults for Linux: test then reload via systemctl, fallback to 'nginx -s reload'
const NGINX_TEST_CMD = process.env.NGINX_TEST_CMD || 'nginx -t -c ' + NGINX_CONF;
const NGINX_RELOAD_CMD = process.env.NGINX_RELOAD_CMD || 'systemctl reload nginx';
const NGINX_FALLBACK_RELOAD = process.env.NGINX_FALLBACK_RELOAD || ('nginx -s reload');
// If your environment requires sudo to reload nginx, set NGINX_USE_SUDO=true
const USE_SUDO = ('' + (process.env.NGINX_USE_SUDO || '')).toLowerCase() === 'true';

function maybeSudo(cmd) {
  return USE_SUDO ? ('sudo ' + cmd) : cmd;
}

router.get('/nginx', (req, res) => {
  fs.readFile(NGINX_CONF, 'utf8', (err, data) => {
    const content = err ? (`Unable to read ${NGINX_CONF}: ${err.message}`) : data;
    res.render('nginx', { nginxConfPath: NGINX_CONF, nginxReloadCmd: NGINX_RELOAD_CMD, content, error: !!err });
  });
});

router.post('/nginx/reload', (req, res) => {
  const testCmd = maybeSudo(NGINX_TEST_CMD);
  exec(testCmd, { timeout: 10_000 }, (testErr, testOut, testErrOut) => {
    if (testErr) {
      const msg = `Nginx config test failed: ${testErr.message}\n${testErrOut || ''}`;
      return res.status(500).send(msg);
    }

    // Try primary reload method (systemctl), if fails try fallback
    const reloadCmd = maybeSudo(NGINX_RELOAD_CMD);
    exec(reloadCmd, { timeout: 10_000 }, (reloadErr, reloadOut, reloadErrOut) => {
      if (!reloadErr) {
        return res.send(`Reload OK:\n${testOut || ''}\n${reloadOut || ''}`);
      }

      // fallback
      const fallbackCmd = maybeSudo(NGINX_FALLBACK_RELOAD);
      exec(fallbackCmd, { timeout: 10_000 }, (fbErr, fbOut, fbErrOut) => {
        if (!fbErr) {
          return res.send(`Reload OK (fallback):\n${testOut || ''}\n${fbOut || ''}`);
        }
        const combined = `Reload failed. test: ${testErr ? testErr.message : 'ok'}; reload: ${reloadErr.message}; fallback: ${fbErr.message}\n\nstdout:\n${testOut || ''}\n${reloadOut || ''}\n${fbOut || ''}\n\nstderr:\n${testErrOut || ''}\n${reloadErrOut || ''}\n${fbErrOut || ''}`;
        return res.status(500).send(combined);
      });
    });
  });
});

module.exports = router;

// Create a new nginx site config for a domain and root folder
// POST /nginx/create-site
// body: { domain: 'example.com', root: '/data/web/example' }
router.post('/nginx/create-site', (req, res) => {
  const domain = (req.body && req.body.domain || '').trim();
  const siteRoot = (req.body && req.body.root || '').trim();

  if (!domain || !/^[a-zA-Z0-9.-]+$/.test(domain)) {
    return res.status(400).send('Invalid domain. Use letters, numbers, dot and hyphen only.');
  }
  if (!siteRoot) return res.status(400).send('Missing site root path.');

  // Verify site root exists (optionally create if not)
  try {
    if (!fs.existsSync(siteRoot)) {
      // attempt to create directory (may require sudo on some hosts) - try local create first
      try {
        fs.mkdirSync(siteRoot, { recursive: true });
      } catch (mkErr) {
        // ignore - we'll still proceed and let the admin create it or run with sudo
      }
    }
  } catch (e) {
    // proceed — existence check failed for permissions
  }

  const FPM_HOST = process.env.FPM_HOST || '127.0.0.1';
  const FPM_PORT = process.env.FPM_PORT || '9000';
  const clientMaxBody = process.env.NGINX_CLIENT_MAX_BODY || '128m';

  const config = `server {
  listen 80;
  server_name ${domain};

  root ${siteRoot};
  index index.php index.html;
  client_max_body_size ${clientMaxBody};

  location / {
    try_files $uri $uri/ /index.php?$args;
  }

  # hardcode SCRIPT_FILENAME
  location ~ \\.(php)$ {
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME ${siteRoot}$fastcgi_script_name;
    fastcgi_index index.php;
    fastcgi_pass ${FPM_HOST}:${FPM_PORT};
    fastcgi_read_timeout 300;
  }

  location ~* \\.(jpg|jpeg|gif|png|webp|css|js|ico|svg|mp4|ttf|woff|woff2)$ { expires 30d; access_log off; }
  location ~* \\.(htaccess|htpasswd|env|ini|log|conf|config|sql)$ { deny all; }
}`;

  const sitesDir = process.env.NGINX_SITES_DIR || '/etc/nginx/sites-enabled';
  const targetPath = path.join(sitesDir, `${domain}.conf`);
  const tmpPath = path.join(os.tmpdir(), `dfkpanel-${domain}.conf`);

  try {
    fs.writeFileSync(tmpPath, config, 'utf8');
  } catch (werr) {
    return res.status(500).send(`Failed writing temp file: ${werr.message}`);
  }

  // copy into place (use sudo if configured)
  const copyCmd = maybeSudo(`cp "${tmpPath}" "${targetPath}"`);
  const chownCmd = maybeSudo(`chown root:root "${targetPath}"`);
  const chmodCmd = maybeSudo(`chmod 644 "${targetPath}"`);

  exec(copyCmd, { timeout: 15_000 }, (cErr, cOut, cErrOut) => {
    if (cErr) {
      return res.status(500).send(`Failed to copy config into place: ${cErr.message}\n${cErrOut || ''}`);
    }

    // set ownership and permissions (best effort)
    exec(chownCmd, { timeout: 5_000 }, () => {
      exec(chmodCmd, { timeout: 5_000 }, () => {
        // After file placed, test + reload (reuse existing test/reload flow)
        const testCmd = maybeSudo(NGINX_TEST_CMD);
        exec(testCmd, { timeout: 10_000 }, (testErr, testOut, testErrOut) => {
          if (testErr) {
            return res.status(500).send(`Nginx config test failed after creating site: ${testErr.message}\n${testErrOut || ''}`);
          }

          const reloadCmd = maybeSudo(NGINX_RELOAD_CMD);
          exec(reloadCmd, { timeout: 10_000 }, (reloadErr, reloadOut, reloadErrOut) => {
            if (!reloadErr) {
              return res.send(`Site created and nginx reloaded:\n${targetPath}\n\n${testOut || ''}\n${reloadOut || ''}`);
            }

            // fallback
            const fallbackCmd = maybeSudo(NGINX_FALLBACK_RELOAD);
            exec(fallbackCmd, { timeout: 10_000 }, (fbErr, fbOut, fbErrOut) => {
              if (!fbErr) {
                return res.send(`Site created and nginx reloaded (fallback):\n${targetPath}\n\n${testOut || ''}\n${fbOut || ''}`);
              }
              const combined = `Site created at ${targetPath} but reload failed. test: ok; reload: ${reloadErr.message}; fallback: ${fbErr.message}\n\nstdout:\n${testOut || ''}\n${reloadOut || ''}\n${fbOut || ''}\n\nstderr:\n${testErrOut || ''}\n${reloadErrOut || ''}\n${fbErrOut || ''}`;
              return res.status(500).send(combined);
            });
          });
        });
      });
    });
  });
});

// mark task done
try { require('../lib/fs-utils'); } catch (e) {}
