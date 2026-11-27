# Production deployment on Ubuntu

The active deployment uses Netlify for React and Contabo for the Express API. The full Docker Compose stack below is an alternative with its own proxy, volumes, and same-site cookie configuration.

## Netlify and PM2 on Contabo

The current frontend is at `https://codebridge-ai.netlify.app`. Host Caddy serves the Express API at `https://codebridge-api.duckdns.org` and passes `/api/v1/*` to PM2's Express process with the path intact. The Contabo PostgreSQL container publishes its port on `127.0.0.1:5433`, and Express connects privately to llama.cpp. Use the existing PM2 app and host Caddy configuration. The repository [Compose Caddyfile](../deploy/Caddyfile) expects a Docker service named `backend`.

Set these values in the Express process environment:

```dotenv
NODE_ENV=production
CLIENT_ORIGIN=https://codebridge-ai.netlify.app
SESSION_COOKIE_SAME_SITE=none
```

Keep `JWT_SECRET` and `DATABASE_URL` in the existing private production configuration. Keep the checkout's `backend/` and `lang/` directories together so Express can load the message catalog. The backend entry point is `backend/server.js`. If PM2 injects variables, update its configured environment and restart the Express process with `--update-env`. If Express reads the private repository-root `.env`, restart after updating that file. Existing PM2 environment variables take precedence over values in `.env`. Keep Express behind Caddy and preserve the request `Origin` and response `Set-Cookie` headers.

Use `AI_SERVICE_URL` for the private llama.cpp origin if it differs from the default `http://127.0.0.1:8080`. Set `AI_MODEL` to the alias served by llama.cpp.

Set `VITE_API_BASE_URL=https://codebridge-api.duckdns.org/api/v1` in Netlify's build environment. The root [netlify.toml](../netlify.toml) runs `npm run build` from `frontend` and publishes `frontend/dist`. Vite copies [the SPA rewrite](../frontend/public/_redirects) into that directory. After publishing, open and refresh `/login`, `/register`, `/questions`, `/admin`, and `/assistant` directly to verify that the requests reach React.

With `NODE_ENV=production`, Express disables `/api/v1/db-test`. Verify that it returns `404` publicly and `/api/v1/health` still returns `200`.

Verify the deployment in a browser with an authorized test account:

1. Open `/login` directly. The API's `GET /api/v1/auth/me` returns `401 Authentication required` before sign-in.
2. Register if needed and sign in. Registration returns `201` and requires a separate login. The login preflight returns `204` with the exact frontend origin and `Access-Control-Allow-Credentials: true`. Successful login returns `200` and a host-only `HttpOnly; Secure; SameSite=None; Path=/api/v1` cookie.
3. Verify the following `/auth/me` returns `200` and that a reload keeps the session. With authorized test accounts, check the registered-user directory as an administrator, verify a regular user is denied, and request an AI suggestion. Sign out and confirm the logout response expires the same cookie and `/auth/me` returns `401` again. Inspect cookie attributes without copying or sharing its value.

Browser privacy settings or extensions can still block cross-site cookies. For reliable browser support, use two HTTPS subdomains of the same site, such as `app.example.com` and `api.example.com`, and return the cookie setting to `lax`. The frontend and API remain separate origins. [Third-party cookie behavior](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies).

## Alternative same-site Compose deployment

The optional `docker-compose.production.yml` runs Caddy, Express, PostgreSQL, and a CPU-only llama.cpp server on one VPS. Caddy serves the Vite build on `https://app.<domain>` and proxies `/api/v1/*` on `https://api.<domain>` without rewriting paths. The backend health check calls the HTTP health endpoint and runs a private PostgreSQL query. Only Caddy publishes ports. PostgreSQL and llama.cpp share an internal Docker network with Express and have no host ports. This stack pins PostgreSQL 17.12. The PostgreSQL-only `docker-compose.yml` pins 17.6. [PostgreSQL 17.12 release notes](https://www.postgresql.org/docs/17/release-17-12.html).

## Prepare the host and DNS

On a supported Ubuntu VPS, point DNS A records for `app.<domain>` and `api.<domain>` at the server. Add AAAA records only if IPv6 routes to the same server. Use lowercase DNS names. Allow inbound TCP 80 and 443 for Caddy and restrict SSH to your administration access. Allow UDP 443 if using HTTP/3. Check that no host service already owns ports 80 or 443. Docker publishes ports independently of some host firewall rules, so use the VPS firewall for ingress restrictions and keep service ports unpublished. Caddy uses public DNS and ACME to issue and renew certificates. [Docker on Ubuntu](https://docs.docker.com/engine/install/ubuntu/) and [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

On a fresh Ubuntu host without Docker Engine, run the following. Use an account authorized to run Docker or retain the `sudo` prefix in the commands below.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git openssl nano
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

ubuntu_codename=$(. /etc/os-release; printf '%s' "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $ubuntu_codename
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker compose version
```

## Configure production settings

Put the approved repository checkout on the VPS. Run the remaining commands from its root. Git must have permission to read the repository if cloning from a private remote.

```bash
if [ ! -e .env.production ]; then
  install -m 600 /dev/null .env.production
fi
chmod 600 .env.production
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
nano .env.production
```

Use a different generated value for each of the three secrets. Set the following values in `.env.production`. Keep it out of source control and logs. Docker administrators can inspect container environments. Use `config --quiet` when validating a real environment.

| Variable | Value |
| --- | --- |
| `SITE_DOMAIN` | The DNS suffix shared by the app and API, such as `example.com`. Enter a domain without a scheme, path, or port. |
| `ACME_EMAIL` | A monitored address for Caddy's ACME account. |
| `POSTGRES_PASSWORD` | PostgreSQL administrator password. Keep the original value when reusing a production volume. |
| `APP_DB_PASSWORD` | Password for the restricted `codebridge_app` role created on the first migration. Keep it stable across later migrations. |
| `JWT_SECRET` | At least 32 random bytes. Changing the secret invalidates active sessions. |
| `LLAMA_MODEL_PATH` | Absolute path to the existing, readable Qwen GGUF file on the VPS. |
| `LLAMA_IMAGE` | Optional official CPU server image override with `curl` for health checks. Compose pins the default image by digest. |
| `LLAMA_THREADS` | CPU inference thread count. Default `4`. Set this to fit the VPS allocation and leave capacity for the web stack. |
| `AI_TIMEOUT_MS` | Express inference timeout. Default `90000`, accepted range `1`–`120000`. |

Compose derives `VITE_API_BASE_URL=https://api.<domain>/api/v1` at build time and `CLIENT_ORIGIN=https://app.<domain>` at runtime. Rebuild the web image if the domain changes. The backend uses `PGHOST`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` on the internal network. Existing local `DATABASE_URL` settings stay in the local environment. `AI_SERVICE_URL=http://llama:8080` and the llama.cpp model alias are set together in Compose.

## Install the model file

Copy your existing official Q4_K_M file to the configured path or download and verify the file below. The model is mounted read-only and loaded at container startup. Its published size is about 2.1 GB. Measure actual memory use and inference latency on the VPS before opening access. Qwen publishes these weights under its research license, which requires a separate license for commercial use. Confirm the intended use before launch. [Official Qwen GGUF file and checksum](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/blob/main/qwen2.5-3b-instruct-q4_k_m.gguf), [Qwen license](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/blob/main/LICENSE), and [llama.cpp Docker instructions](https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md).

```bash
sudo install -d -m 0755 -o "$(id -u)" -g "$(id -g)" /opt/codebridge/models
model=/opt/codebridge/models/qwen2.5-3b-instruct-q4_k_m.gguf
sha256=626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d
if [ ! -f "$model" ]; then
  curl -fL --retry 3 -o "$model.part" \
    https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/7dabda4d13d513e3e842b20f0d435c732f172cbe/qwen2.5-3b-instruct-q4_k_m.gguf &&
    printf '%s  %s\n' "$sha256" "$model.part" | sha256sum --check - &&
    chmod 644 "$model.part" && mv -- "$model.part" "$model"
fi
printf '%s  %s\n' "$sha256" "$model" | sha256sum --check -
```

## Build and start

After DNS, credentials, and model verification, run the following in Bash. `prod` is a shell function for this session.

```bash
prod() { sudo docker compose --env-file .env.production -f docker-compose.production.yml "$@"; }
prod config --quiet &&
prod pull postgres llama &&
prod build --pull backend web &&
prod run --rm --no-deps web caddy validate --config /etc/caddy/Caddyfile &&
prod up -d --wait --wait-timeout 120 postgres
```

If importing an existing database into a fresh production volume, perform the import described below now. For an existing production volume, take a backup first. Then run the additive schema migration and start the remaining services.

```bash
prod run --rm migrate &&
prod up -d --wait --wait-timeout 180 backend llama web &&
prod ps
prod logs --tail=100 web backend postgres llama
```

Compose starts llama.cpp with a 4,096-token context and one inference slot. The `--wait` command checks the model server's internal health endpoint. Verify the configured model alias from Express without opening an inference port.

```bash
prod exec -T backend node -e 'fetch(process.env.AI_SERVICE_URL + "/v1/models").then(async r => { if (!r.ok) throw Error(`HTTP ${r.status}`); const {data} = await r.json(); if (!data.some(model => model.id === process.env.AI_MODEL)) throw Error("Model alias mismatch"); console.log(process.env.AI_MODEL) }).catch(e => { console.error(e); process.exit(1) })'
prod exec -T backend node -e 'const pool = require("./db"); pool.query("SELECT 1").then(() => console.log("PostgreSQL reachable")).catch(() => { console.error("PostgreSQL check failed"); process.exitCode = 1 }).finally(() => pool.end())'
```

## Back up, initialize, or migrate PostgreSQL

The optional stack has its own named Docker volume. On first start PostgreSQL creates `codebridge_ai`. `prod run --rm migrate` then creates the app role and applies `backend/db/schema.sql` in one transaction with `ON_ERROR_STOP`. The schema creates missing tables (answers, comments, votes, flags, tags, categories, favorites and site options), adds missing columns such as `last_edited_by`, `hidden`, user handles and question categories, backfills usernames, and recreates the `user_points` view. Rerunning it preserves rows and the existing app role password. The app role receives table and sequence privileges for the current API and no schema ownership. Coordinate password rotation through PostgreSQL and the production environment together. New schema changes need explicit migrations when `CREATE TABLE IF NOT EXISTS` cannot upgrade an existing table.

Before a schema or image update, take a private backup. Copy it to protected storage outside the VPS and test its restore in a separate database.

```bash
umask 077
mkdir -p "$HOME/codebridge-backups"
backup="$HOME/codebridge-backups/codebridge-$(date -u +%Y%m%dT%H%M%SZ).dump"
prod exec -T postgres pg_dump -U postgres -d codebridge_ai --format=custom > "$backup.part" &&
  prod exec -T postgres pg_restore --list < "$backup.part" >/dev/null &&
  mv -- "$backup.part" "$backup"
```

To carry over existing data, create a custom-format `pg_dump` from the source, transfer it securely, and restore it only into a verified empty production database after starting `postgres` and before applying the migration. For a live source, pause writes during the final backup and cutover to capture the last changes. The restore below preserves the source and aborts the target transaction on an error. If the target already contains data, stop and plan a separate import instead of restoring on top of it.

```bash
# On the source, with its normal PostgreSQL connection settings:
umask 077
pg_dump --format=custom --dbname=codebridge_ai --file=codebridge-source.dump

# On the VPS, with the dump transferred and only postgres started:
dump=/path/to/codebridge-source.dump
prod exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d codebridge_ai \
  -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';"
# After verifying that the result contains zero tables:
prod exec -T postgres pg_restore -U postgres -d codebridge_ai \
  --no-owner --no-privileges --single-transaction --exit-on-error < "$dump"
prod run --rm migrate
```

## Verify HTTPS and authentication

The two HTTPS origins share a site, so the host-only API cookie can accompany a request from the app to the API with `SameSite=Lax`. The frontend sends credentials, Express allows the exact frontend origin with credentialed CORS, and Caddy passes through `Origin` and `Set-Cookie`. Express validates `Origin` on writes and issues `Secure; HttpOnly; SameSite=Lax; Path=/api/v1` in production. Keep this same-site DNS layout. [Cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) and [Caddy reverse proxy headers](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers).

```bash
# Replace example.com with the configured SITE_DOMAIN.
site_domain=example.com
curl -fsS "https://app.$site_domain/login" >/dev/null
curl -fsS "https://api.$site_domain/api/v1/health"
curl -fsSi -X OPTIONS "https://api.$site_domain/api/v1/auth/login" \
  -H "Origin: https://app.$site_domain" \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Expect a `204` preflight with `Access-Control-Allow-Origin` set to the frontend origin and `Access-Control-Allow-Credentials: true`. In a browser, register and sign in using the frontend. Confirm login returns the API cookie with the listed attributes, reload and verify `/auth/me` succeeds, create and edit a test question, request a real AI suggestion, then sign out and confirm `/auth/me` returns `401`. Check `prod ps` for the published ports and confirm ports 3000, 5432 and 8080 are unreachable from outside the VPS.

Before opening this deployment to unrestricted users, decide how to handle abuse. The current application permits public registration, and the authenticated AI route has no per-user inference quota. Usage reporting still depends on unimplemented API routes.

## Hosted OpenAPI documentation

The backend serves Swagger UI at `/doc/` and its specification at `/doc/openapi.json`. Forward `/doc` and `/doc/*` through the active API-host Caddy configuration to the same Express process, preserving the path. The optional Compose Caddyfile already includes those paths; it does not update the external PM2 host automatically. Restart Express after installing the locked dependencies and deploying the documentation files. Verify `https://codebridge-api.duckdns.org/doc/` and all local CSS/JS assets after deployment.

The specification omits `/db-test` when diagnostics are disabled. API-origin Swagger writes remain subject to the existing frontend-only Origin policy and return 403; documentation must not weaken that policy. See [documentation verification and browser-cookie limitations](api-documentation.md).
