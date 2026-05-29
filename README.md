# Plant Dashboard

A React + TypeScript + Vite dashboard scaffolded for local development and Ubuntu VPS deployment.

## 1) Local development

Prerequisites:

- Node.js 20+
- npm 9+

Steps:

1. Copy environment template:
   - cp .env.example .env
2. (Optional) Set VITE_API_BASE_URL in .env to point at your backend.
   - If left empty, the app uses built-in mock data.
3. Install dependencies:
   - npm ci
4. Start dev server:
   - npm run dev
5. Open:
   - http://localhost:5173

## 2) Production build

1. Install dependencies:
   - npm ci
2. Build:
   - npm run build
3. Test production output locally:
   - npm run preview
4. Open:
   - http://localhost:4173

## 3) Deploy on Ubuntu VPS (Nginx static hosting)

### Install runtime tools

```bash
sudo apt update
sudo apt install -y nginx curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Build on server

```bash
cd /opt
sudo git clone <your-repo-url> plant-dashboard
cd plant-dashboard
npm ci
cp .env.example .env
# Optional: edit .env and set VITE_API_BASE_URL
npm run build
```

### Publish built files

```bash
sudo mkdir -p /var/www/plant-dashboard
sudo rsync -av --delete dist/ /var/www/plant-dashboard/
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

### (Recommended) Enable HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 4) Deploy with Docker instead

```bash
docker compose up -d --build
```

This exposes the app on port 8080.

## API integration notes

The frontend expects these endpoints when VITE_API_BASE_URL is set:

- GET /api/plants
- POST /api/plants
- GET /api/plants/:id/snapshot

If no API base URL is set, the app runs with in-memory mock data.
