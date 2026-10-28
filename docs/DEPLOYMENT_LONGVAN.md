# Deploy backend to Long Vân through CloudLinux Node.js Selector

The production workflow is [`deploy-backend.yml`](../.github/workflows/deploy-backend.yml). It uploads only `backend/` by **Explicit FTPS on port 21** to the cPanel-account-relative directory:

```text
apps/english-course/backend
```

It is deliberately fail-closed. Neither a push nor a manual run can write production unless both GitHub Actions **Secrets** below equal `true` and the `longvan-production` GitHub Environment approves the job:

```text
BACKEND_FTPS_DEPLOY_ENABLED=true
CLOUDLINUX_NODE_SELECTOR_VERIFIED=true
```

## Why this does not call `PassengerApps`

The account uses **CloudLinux Node.js Selector**, not cPanel Application Manager. `PassengerApps/list_applications` is therefore not an authoritative list of these applications: the observed success response (`status: 1`, empty `data`) does not prove that the Selector application is absent. The workflow does not call `PassengerApps/list_applications` or `PassengerApps/ensure_deps`.

CloudLinux's supported controls are the **Setup Node.js App** UI, or (where a shell is available) `cloudlinux-selector`. The latter can list an account's Node apps, install their modules, and restart an app. See [CloudLinux command-line tools](https://docs.cloudlinux.com/cloudlinuxos/command-line_tools/) and [Node.js Selector UI](https://docs.cloudlinux.com/cloudlinuxos/lve_manager/).

## Required one-time cPanel review and GitHub Secrets

In cPanel **Software → Setup Node.js App**, open the existing application and verify these exact values before setting the confirmation Secret:

| cPanel field | Required value |
| --- | --- |
| Application URL | `api.toeicmsuyen.vn` |
| Application root | `apps/english-course/backend` |
| Application startup file | `app.js` |
| Node.js version | `22.23.4` |
| Mode | Production |

Set the GitHub Actions Secret `CLOUDLINUX_NODE_SELECTOR_VERIFIED=true` only after that review. If any cPanel value changes, first replace it with `false`, review again, and then re-enable it. This is a deliberate human confirmation because the available cPanel token API cannot read CloudLinux Selector registrations. The expected values are fixed in the workflow, rather than copied through mutable repository variables.

The workflow also performs two independent, read-only checks on every preflight:

1. Authenticated Explicit FTPS with normal certificate validation lists `apps/english-course/backend/` and reads `app.js` there. This verifies the FTP-account mapping to the exact application root; it never reads `.env`.
2. `https://api.toeicmsuyen.vn/health` must return either the backend production health JSON or CloudLinux's `It works!` response for Node.js `22.23.4`. The second form is accepted only to permit the first source upload to an already-created Selector app; any other response fails the preflight.

Together with the cPanel UI review, these checks prevent a similarly named FTP directory or an empty `PassengerApps` response from authorizing deployment to a different hosting target.

## GitHub secrets

| Secret | Value |
| --- | --- |
| `LONGVAN_FTPS_HOST` | `cpanelhn1.longvan.net` (or the hostname Long Vân supplies whose certificate matches) |
| `LONGVAN_FTPS_USER` | A restricted deployment FTP account |
| `LONGVAN_FTPS_PASSWORD` | Password for that account |

The preflight uses `curl --ftp-ssl-reqd`, so certificate validation remains enabled. Do not replace it with plain FTP or add `-k`/`--insecure`.

## Safe release procedure

1. Run the workflow manually with `deploy=false`. It runs tests plus read-only Selector, FTPS, and health checks; it uploads nothing.
2. After reviewing the result and the `longvan-production` approval policy, run it with `deploy=true`, or enable the two gates for controlled push deployment.
3. Open the same application in cPanel **Setup Node.js App**. Click **Run NPM Install** if `package.json` or `package-lock.json` changed, then click **Restart**.
4. Verify `https://api.toeicmsuyen.vn/health` reports `status: success` and `env: production`. The CloudLinux default response is not a completed release verification.

There is intentionally no automatic dependency installation or restart. CloudLinux documents **Run NPM Install** and **Restart** in the Selector UI; `cloudlinux-selector install-modules` and `cloudlinux-selector restart` are the shell equivalents. With only FTPS, GitHub Actions cannot invoke either command safely. It also does not send a `tmp/restart.txt` signal, because that signal has not been confirmed by this hosting configuration as the supported Selector restart mechanism.

The upload uses no clean slate and excludes `.env`, `node_modules`, `uploads`, `data`, `logs`, `tmp`, and old deployment directories. No database operation, migration, seeder, `.env` write, or automatic production deployment was performed while preparing this workflow.

## Recovery

FTPS cannot provide a server-side atomic release switch or safe automatic rollback. If a release fails after the manual restart, leave the production gate disabled, inspect the Selector/Passenger logs in cPanel, and redeploy a known-good commit with `workflow_dispatch` and `release_ref`. Do not erase application data or regenerate `.env` as part of recovery.

If Long Vân later grants an SSH shell, use the supported CloudLinux commands to make the same root/domain verification and restart automatable; do not reintroduce `PassengerApps` as a proxy for the Selector application.
