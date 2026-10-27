# Deploy backend to Long Vân (cPanel, CloudLinux Node.js Selector, Passenger)

The workflow at `.github/workflows/deploy-backend.yml` deploys only `backend/` to:

```text
/home/toeicmsuyenvn/apps/english-course/backend
```

It is deliberately disabled until the hosting setup has been checked. It neither runs seeders/migrations nor connects to the database beyond the normal application start. It does not use Docker, PM2, `sudo`, or a server-wide Apache restart.

## One-time hosting setup

Ask Long Vân to confirm all of the following for the **cPanel user `toeicmsuyenvn`**:

1. SSH/SFTP shell access is enabled for this user and allows public-key authentication from GitHub-hosted runners on the selected SSH port.
2. CloudLinux **Node.js Selector** is available and supports Node.js **22.12+**.
3. The application is registered for `api.toeicmsuyen.vn`, has application root `apps/english-course/backend`, and has Node.js 22 selected.
4. Passenger is enabled for Node.js Selector, and the startup file is `app.js`. This repository supplies `backend/app.js`, which starts the existing `src/server.js` bootstrap.
5. The virtual-environment activation file exists at `/home/toeicmsuyenvn/nodevenv/apps/english-course/backend/22/bin/activate`, and the cPanel user can read it.
6. The cPanel user owns and can write the application root and its `tmp/` directory. Passenger must honor `tmp/restart.txt`; that is the restart mechanism used by this workflow.
7. HTTPS for `https://api.toeicmsuyen.vn/health` routes to this application. The endpoint must return HTTP 200 with JSON containing `"status":"success"`.

cPanel documents `tmp/restart.txt` as the user-level Passenger restart mechanism; touching it avoids requiring `sudo` or an Apache restart. See [cPanel’s Node.js installation guide](https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/).

Configure the production runtime variables in the cPanel Node.js application environment, or retain the already-existing production `.env` in the application root. At minimum, this backend needs `MONGODB_URI`, `JWT_SECRET`, and `JWT_REFRESH_SECRET`; production CORS must also set `NODE_ENV=production` and the appropriate `FRONTEND_URL`/`FRONTEND_ORIGINS`. Do not put any of those values in GitHub Actions workflow files or in Git.

## GitHub Actions configuration

In GitHub, open **Settings → Secrets and variables → Actions**. Create these repository secrets:

| Secret | Value |
| --- | --- |
| `LONGVAN_SSH_HOST` | Long Vân SSH host name or IP address |
| `LONGVAN_SSH_PORT` | SSH port, normally `22` but use the value from Long Vân |
| `LONGVAN_SSH_USER` | `toeicmsuyenvn` |
| `LONGVAN_SSH_PRIVATE_KEY` | A dedicated deploy-only Ed25519 private key; do not use a personal key |
| `LONGVAN_SSH_KNOWN_HOSTS` | The verified host-key line(s) for `host:port`, obtained from Long Vân through a trusted channel |

Generate the dedicated key locally, then give **only its public key** to Long Vân for `~toeicmsuyenvn/.ssh/authorized_keys`:

```bash
ssh-keygen -t ed25519 -a 100 -f ~/.ssh/toeicmsuyen_github_deploy -C github-actions-toeic-backend
```

Do not accept a host key merely by copying unauthenticated `ssh-keyscan` output. Obtain and verify the SSH host-key fingerprint with Long Vân first, then place the matching `known_hosts` line in `LONGVAN_SSH_KNOWN_HOSTS`.

Finally create repository variable `BACKEND_DEPLOY_ENABLED` with value `false` (or leave it unset). Once the first preflight is approved, change it to `true`. A push to `main` that changes `backend/**` then verifies the code and deploys automatically. Until then, workflow runs only the local `npm ci` and offline security tests.

For the first remote check, use **Actions → Deploy backend to Long Van → Run workflow**, leave `deploy` set to `false`, and inspect the `Check SSH and Node.js Selector` job. It verifies SSH, exact paths, write access, `rsync`, the restart directory, activation script, and activated Node version before any code is uploaded. After reviewing that successful run and confirming the cPanel registration, enable automatic deployment with `BACKEND_DEPLOY_ENABLED=true`. A manual run with `deploy=true` also deploys after preflight, so use it only after the setup has been confirmed.

## Release safety and rollback

Before synchronization the workflow copies deployable code to:

```text
/home/toeicmsuyenvn/apps/english-course/backend/.deploy-backups/<GitHub-run-id>-<commit-sha>/code
```

It uses `rsync --delete` only for deployable code and always excludes `.env`, `.git/`, `uploads/`, `data/`, `logs/`, `tmp/`, `node_modules/`, and the deployment directories. Therefore environment secrets and mutable uploads/storage are retained. It installs locked production packages using the activated Node Selector environment and `npm ci --omit=dev`, then touches `tmp/restart.txt`.

An install/sync failure restores the saved code automatically. A public health-check failure also restores it, reinstalls its locked production dependencies, and requests a Passenger restart. The workflow leaves the backup intact and prints its path. To perform the same rollback manually over SSH, replace `BACKUP_ID` with the failed run’s value:

```bash
APP_ROOT=/home/toeicmsuyenvn/apps/english-course/backend
NODE_VENV=/home/toeicmsuyenvn/nodevenv/apps/english-course/backend/22
BACKUP_ID='<run-id>-<commit-sha>'
rsync -a --delete \
  --exclude='.env' --exclude='node_modules/' --exclude='uploads/' --exclude='data/' \
  --exclude='logs/' --exclude='tmp/' --exclude='.git/' --exclude='.deploy-backups/' --exclude='.deploy-staging/' \
  "$APP_ROOT/.deploy-backups/$BACKUP_ID/code/" "$APP_ROOT/"
cd "$APP_ROOT"
source "$NODE_VENV/bin/activate"
npm ci --omit=dev
mkdir -p tmp && touch tmp/restart.txt
```

If the health endpoint does not recover after a rollback, inspect the application’s Passenger logs in the application `logs/` directory and ask Long Vân to verify the cPanel Node.js Selector/Passenger registration. Do not run database seeders, migrations, or destructive cleanup as part of recovery.
