# Plant Dashboard

A React + TypeScript + Vite dashboard with a Node/Express API backed by a local SQLite database file.

The app now supports:

- persistent plants in `data/plants.db`
- historical moisture readings
- USB serial posting from the browser
- sparkline history dialog when clicking a plant card

## Local development

Prerequisites:

- Node.js 24+
- npm 10+

Steps:

1. Copy the environment template:
   - `cp .env.example .env`
2. Leave `VITE_API_BASE_URL` empty for local development.
   - Vite proxies `/api` to the local Node server.
3. Install dependencies:
   - `npm install`
4. Start both the API server and Vite dev server:
   - `npm run dev`
5. Open:
   - <http://localhost:5173>

Local persistence details:

- SQLite file: `data/plants.db`
- API server: <http://localhost:3001>
- Frontend dev server: <http://localhost:5173>

## Testing

Run all tests:

```bash
npm test
```

Run backend unit/security tests only:

```bash
npm run test:server
```

Run frontend unit/security tests only:

```bash
npm run test:client
```

## Production build

Build the frontend bundle:

```bash
npm run build
```

Run the Node server in production mode:

```bash
npm run start
```

The Node server serves both:

- frontend assets from `dist/`
- API routes from `/api/*`

Default production port:

- `3001`

## Ubuntu VPS deployment

### Install runtime tools

```bash
sudo apt update
sudo apt install -y nginx curl
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

### Clone and start the app

```bash
cd /opt
sudo git clone <your-repo-url> plant-dashboard
cd plant-dashboard
npm install
cp .env.example .env
npm run build
PORT=3001 npm run start
```

To keep it running, use a process manager such as `pm2` or a `systemd` service.

Important for admin login on VPS:

- set `ADMIN_JWT_SECRET` to a long random value
- set `ADMIN_PASSWORD_HASH` to a bcrypt hash (recommended)
- optional `ADMIN_USERNAME` (defaults to `admin`)
- optional `ADMIN_SESSION_TTL_MS` (defaults to 8 hours)

Legacy fallback:

- `ADMIN_PASSWORD` (plaintext) is still supported for local/dev use, but avoid it in production.

If using `deploy/plant-dashboard.service`, set these values there (or via an `EnvironmentFile`) and restart the service.

Generate secure values:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('bcryptjs').hashSync('your-admin-password', 12))"
```

Example with pm2:

```bash
sudo npm install -g pm2
cd /opt/plant-dashboard
pm2 start npm --name plant-dashboard -- run start
pm2 save
pm2 startup
```

### Configure Nginx

```bash
sudo cp deploy/nginx.vps.conf /etc/nginx/sites-available/plant-dashboard
# Edit server_name in /etc/nginx/sites-available/plant-dashboard
sudo ln -s /etc/nginx/sites-available/plant-dashboard /etc/nginx/sites-enabled/plant-dashboard
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### Enable HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Docker deployment

Build and run:

```bash
docker compose up -d --build
```

Container behavior:

- serves frontend and API on port `8080`
- persists SQLite data in a Docker volume mounted at `/app/data`

## API routes

The frontend uses these API endpoints:

- `GET /api/health`
- `GET /api/plants`
- `POST /api/plants`
- `GET /api/plants/:plantId`
- `PATCH /api/plants/:plantId`
- `DELETE /api/plants/:plantId`
- `POST /api/plants/:plantId/readings`
- `GET /api/plants/:plantId/readings?limit=60`
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/plants`
- `PATCH /api/admin/plants/:plantId`
- `DELETE /api/admin/plants/:plantId`

## Ownership and admin auth

Plant create now returns:

- `plant`: the created plant object
- `creatorToken`: one-time owner token for that plant

The frontend stores this owner token in browser local storage and sends it as a bearer token for plant updates/deletes.

Authorization rules:

- `PATCH /api/plants/:plantId` and `DELETE /api/plants/:plantId` require authorization.
- Use `Authorization: Bearer <creatorToken>` for plant owner access.
- Use `X-Admin-Session: <sessionToken>` for admin access.

Admin auth setup:

- set `ADMIN_JWT_SECRET` and `ADMIN_PASSWORD_HASH` to enable admin login in production
- optional local/dev fallback: `ADMIN_PASSWORD`
- optional `ADMIN_USERNAME` (default `admin`)
- optional `ADMIN_SESSION_TTL_MS` (default 8 hours)

## Optional workshop mirroring

You can forward each locally saved reading to the original workshop server too.

Set environment variables for the Node server:

- `WORKSHOP_MIRROR_BASE_URL=https://codepub-nl.site`
- `WORKSHOP_MIRROR_TIMEOUT_MS=1500` (optional)

Behavior:

- local SQLite write always happens first
- mirror runs in the background and does not block local success
- mirror failures are logged, but do not fail your local API request

## Data model

SQLite tables created automatically on first boot:

- `plants`
- `readings`

The server stores every reading historically and calculates moisture percentage from raw sensor values using the plant's wet threshold.
