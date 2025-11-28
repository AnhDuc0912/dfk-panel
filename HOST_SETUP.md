**Host setup: allow the panel to install nginx site files**

This document describes a simple, safe helper script and sudoers entry you can install on the host so the `dfkpanel` workflow can be used to install nginx vhost files and reload nginx.

1) Copy the helper script to the host and make it executable

```bash
# from project dir on host
sudo install -m 0755 host/dfkpanel-apply-site.sh /usr/local/bin/dfkpanel-apply-site
sudo chown root:root /usr/local/bin/dfkpanel-apply-site
```

2) Create a restricted sudoers entry (allow user `dfk` to run only this script)

```bash
sudo tee /etc/sudoers.d/dfkpanel <<'EOF'
# allow dfk to install nginx site files via dfkpanel helper
dfk ALL=(root) NOPASSWD: /usr/local/bin/dfkpanel-apply-site
EOF

sudo chmod 0440 /etc/sudoers.d/dfkpanel
```

3) How to use (manual, safe)

- The panel writes the generated site file into the host-mounted directory: e.g. `/data/dfk-panel/sites-enabled/example.com.conf`.
- On the host, the administrator (user `dfk`) runs:

```bash
# install and reload (no password required because of sudoers entry)
sudo /usr/local/bin/dfkpanel-apply-site /data/dfk-panel/sites-enabled/example.com.conf
```

The helper will copy the file to `/etc/nginx/sites-enabled`, run `nginx -t` and reload nginx if test succeeds. If the test fails the temporary file is removed and nginx is not reloaded.

Security note: this sudoers entry grants the `dfk` user the ability to run this single script as root without a password. Keep the script small and review it before installing. If you prefer a different workflow (e.g., signed API or SSH agent), consider implementing an authenticated host agent instead.
