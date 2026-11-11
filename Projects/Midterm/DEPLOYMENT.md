# Publish Pulse: GitHub Pages + Render

The deployment configuration is prepared; creating these account resources and enabling Pages still requires your GitHub/Render account. Neither service is claimed live until its deployment succeeds.

Public frontend, once published:

**https://2bandie.github.io/Web-Application-Dev/Projects/Midterm/**

GitHub Pages only hosts the built React files. Django, authentication, WebSockets, and data live on Render. This does not require changing your local port-5500 workflow.

## 1. Create a PostgreSQL database on Render

1. Sign into https://dashboard.render.com/ and choose **New → PostgreSQL**.
2. Choose a name such as `pulse-db` and a region close to your players. Put the backend service in the **same region**.
3. Review the available database plans before creating it. Render may charge for persistent databases; free database plans, if offered, can expire. Do not use an expiring database for records you want to keep.
4. After creation, locate the **Internal Database URL**. It is private: enter it only in Render's environment settings, never in GitHub variables, frontend files, screenshots, or chat.

The local SQLite database does not automatically transfer. The deployed site initially has fresh accounts and records. Keep your local `db.sqlite3` as a backup; if you need its accounts/results migrated, plan that as a separate import rather than replacing the live database blindly.

## 2. Create the Django web service

In Render, choose **New → Web Service**, connect GitHub, and select `2Bandie/Web-Application-Dev`.

| Setting | Value |
| --- | --- |
| Branch | `multiplayer-rhythm-arena` |
| Root Directory | `Projects/Midterm/backend` |
| Runtime | Python |
| Build Command | `bash build.sh` |
| Start Command | `bash start.sh` |
| Health Check Path | `/api/health/` |
| Instances | **1** |

Choose a web-service plan after reviewing Render's current pricing. The supplied optional blueprint uses a free web service; free services can sleep and take time to wake up. A continuously available service gives a better live-game experience.

Set these **Render environment variables**:

| Name | Value |
| --- | --- |
| `PYTHON_VERSION` | `3.12.12` |
| `DJANGO_DEBUG` | `0` |
| `DJANGO_SECRET_KEY` | Generate a random value in Render and keep it unchanged on redeploys |
| `DATABASE_URL` | Your Render PostgreSQL **Internal Database URL** |
| `CORS_ALLOWED_ORIGINS` | `https://2bandie.github.io` |

Use a generated secret of at least 50 characters. No secret value belongs in this document. Render automatically provides `RENDER_EXTERNAL_HOSTNAME`; Django adds that hostname to its allowed hosts. Do not use `*` for allowed hosts or origins. The origin contains no repository path or trailing slash.

Click **Create Web Service** and wait for a successful deploy. Startup applies migrations and seeds the four songs, then starts Daphne on Render's `$PORT`. Copy the service's public HTTPS URL, for example `https://your-assigned-name.onrender.com` (use the URL Render actually assigns).

Open **`YOUR_RENDER_URL/api/health/`**. It should return:

```json
{"status":"ok"}
```

If it returns 503, check database availability and Render deployment logs. Do not continue to Pages until the backend is healthy.

Optional: Render Blueprints can use `Projects/Midterm/render.yaml` as the Blueprint path on this branch. It creates the web service only, generates the secret, and asks for `DATABASE_URL`; create the PostgreSQL database first. Review the blueprint and billing before applying it.

### One process is intentional

Keep one instance and the provided Daphne command. Room broadcasts currently use an in-memory Channels layer. Multiple instances/processes require adding a shared Redis channel layer first. Accounts and scores are durable in PostgreSQL across service restarts; processes and live sockets reconnect after a restart.

## 3. Connect the frontend to Render

In the GitHub repository, open:

**Settings → Secrets and variables → Actions → Variables → New repository variable**

Direct settings page: https://github.com/2Bandie/Web-Application-Dev/settings/variables/actions

Add:

- **Name:** `PULSE_BACKEND_URL`
- **Value:** the actual Render HTTPS origin, such as `https://your-assigned-name.onrender.com`

Do not append `/api`, a repository path, or credentials. This URL is public configuration, not a secret. Never put `DATABASE_URL` or `DJANGO_SECRET_KEY` here. Rebuild Pages after changing this variable; Vite embeds it at build time.

## 4. Enable GitHub Pages and publish

1. Merge `multiplayer-rhythm-arena` into `main`, including `.github/workflows/pulse-pages.yml`. You can start a pull request here:
   https://github.com/2Bandie/Web-Application-Dev/compare/main...multiplayer-rhythm-arena?expand=1
2. Open **Settings → Pages → Build and deployment → Source**, and select **GitHub Actions**:
   https://github.com/2Bandie/Web-Application-Dev/settings/pages
3. In **Actions**, choose **Deploy Pulse and static projects to Pages → Run workflow**, select `main`, and run it. The workflow must be present on the default branch for the manual button to appear. If a push ran before Pages was enabled, rerun it after enabling Pages.
4. Wait for the publish job to finish. A skipped job means `PULSE_BACKEND_URL` is missing; a failed health step means Render is not ready.
5. Open the public Pulse URL above and register a new account.

The workflow builds Pulse for `/Web-Application-Dev/Projects/Midterm/`, not the site root, so fonts and scripts load under the correct project path. It includes the repository's existing tracked static assets at their existing paths. The capital-I `Index.html` Wordle page remains available; when no lowercase index exists, its content is also copied to `index.html` for the root entry. Python/backend source, environments, and the Pulse frontend source tree are not copied into the site artifact. Changing Pages to Actions means this workflow becomes responsible for future static-site updates.

Do not publish just the source `frontend` folder using “Deploy from a branch”; browsers cannot execute the unbuilt TypeScript, and Pages cannot proxy Django or WebSockets.

## 5. Verify both halves

- Backend `/api/health/` responds with `status: ok`.
- The GitHub Pages URL loads the rounded font and song cards; no asset 404s appear.
- Registration/login works from Pages (REST requests go to Render, not `github.io/api`).
- Play solo; timing feedback and score updates work.
- In a second browser/profile, join a multiplayer room. Both players ready up and receive live score updates.
- Finish a song, then verify records after a reload or backend redeploy.

The client derives `wss://` from the Render HTTPS URL. Render supports WebSocket upgrades through the same web-service endpoint. CORS and WebSocket origin checks both use the exact GitHub Pages origin. If REST works but the socket is denied, check `CORS_ALLOWED_ORIGINS` in Render, then redeploy/restart that service.

No actual Render URL has been configured by the repository itself. Account settings and a real successful deployment remain necessary.

## Local development and deployment testing

After updating an existing local Windows setup, run `.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt` from `backend` to install the new deployment dependencies.

The default remains `bash scripts/dev.sh` (or the documented Windows terminals). Without `VITE_BACKEND_URL`, Vite forwards `/api` and `/ws` to the local backend. Local SQLite is retained when `DJANGO_DEBUG=1` and no `DATABASE_URL` is set.

To build against a specific backend, set the public frontend variables when running `npm run build`:

```powershell
# From Projects\Midterm\frontend
$env:VITE_BACKEND_URL = "https://YOUR-ACTUAL-SERVICE.onrender.com"
$env:VITE_BASE_PATH = "/Web-Application-Dev/Projects/Midterm/"
npm.cmd run build
```

Use your actual assigned URL. For normal local development afterward, remove those variables from the terminal with `Remove-Item Env:VITE_BACKEND_URL, Env:VITE_BASE_PATH -ErrorAction SilentlyContinue`. Environment settings are documented in `frontend/.env.example` and `backend/.env.example`.
