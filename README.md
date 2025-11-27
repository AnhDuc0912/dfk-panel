# DFKPanel — lightweight file & nginx manager (ExpressJS)

Small admin panel built with ExpressJS to browse, edit, create and delete files inside a configured root directory, plus basic Nginx config viewing and reload.

Important: This is a starting scaffold. It is NOT secure by default. Add authentication, HTTPS, CSRF protection and run only in trusted environments.

Quick start

1. Copy `.env.example` to `.env` and adjust `ROOT_DIR`, `PORT`, `NGINX_CONF`, `NGINX_RELOAD_CMD`.
2. Install dependencies:

```powershell
cd f:/Freelance/DFKPanel
npm install
```

3. Run the app:

```powershell
npm start
# or for development
npm run dev
```

4. Open `http://localhost:3000`.

Notes and security
- The panel restricts file operations to the configured `ROOT_DIR` to prevent path traversal.
- The Nginx reload command will be executed exactly as configured — ensure the running user has permissions. On Windows adjust `NGINX_RELOAD_CMD` accordingly.
- Add authentication before exposing to networks. Use a reverse proxy with HTTPS or run locally.

Extending
- Add express-session + passport / basic auth for access control.
- Add file watchers or git integration to pull/push projects.

Docker / Compose

The repository includes a `Dockerfile` and `docker-compose.yml` to run DFKPanel in a container. To make sure files and directories created from the web UI appear on your native host, bind-mount a host directory into the container and set `ROOT_DIR` to the mounted path. The supplied compose file already sets `ROOT_DIR=/srv/repos` and mounts `${HOST_REPO_DIR:-./repos}` on the host to `/srv/repos` in the container.

Examples (PowerShell)

1) Use the default host-relative folder `./repos` (will be created if missing):
```powershell
# from repository root
docker compose up --build -d
```

2) Use an explicit absolute host folder (Windows example):
```powershell
# Windows PowerShell: set environment variable for docker-compose run
$env:HOST_REPO_DIR = 'F:/Freelance/DFKPanel/repos'
docker compose up --build -d
```

3) Linux/macOS example:
```bash
HOST_REPO_DIR=/home/you/dfk-repos docker compose up --build -d
```

Notes
- Files and folders created from the panel inside `/srv/repos` will be created on the host path you bind-mounted.
- If you run into permission issues when creating files on the host, you can run the container as a different user or adjust file permissions on the host directory.
 - Files and folders created from the panel inside the configured `ROOT_DIR` (e.g. `/data`) will be created on the host path you bind-mounted.
 - If you run into permission issues when creating files on the host, fix permissions on the host directory so the container's user can write to it. Example (Linux):

```bash
# set ownership to your user (replace 1000:1000 with your UID:GID if different)
sudo chown -R 1000:1000 /path/to/host/data
```

Or run the container as `root` (less secure) by adding `user: root` under the service in `docker-compose.yml`.

