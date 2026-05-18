# BrandBased — Operations Runbook

Print this file to PDF: open in VS Code / browser → Print → Save as PDF.

---

## 1. Architecture (production)

| Layer | Host | Folder / service |
|-------|------|------------------|
| Frontend | Route 53 → CloudFront → S3 | `brandbased_frontend/` (static only) |
| API | `https://api.brandbased.ai` | `/var/www/brandbased/brandbased-backend-to-push-ec2` (Laravel) |
| Identity worker | EC2 (background) | `/var/www/brandbased/python-worker` → `brandbased-worker.service` |
| Smart-size / crop *(optional)* | `https://api.brandbased.ai/smart/` | uvicorn `:8001` + nginx |

**Flow:** Browser → Laravel API → DB (`pending`) → Python worker → Laravel (`verified` / `under_review`).

---

## 2. Frontend config (one file)

**File:** `brandbased_frontend/assets/js/app-config.js`

```javascript
const PRODUCTION_API = "https://api.brandbased.ai/api";
const PRODUCTION_SMART_SIZE = "https://api.brandbased.ai/smart";
```

- Localhost → `http://127.0.0.1:8000/api` and `:8001` automatically.
- After change: upload to S3 → invalidate CloudFront → hard refresh browser.

**S3 upload (AWS CLI):**

```powershell
cd H:\workspace\BrandBased\brandbased_frontend
aws s3 sync . s3://YOUR-BUCKET-NAME --exclude "premium-and-freemium-bb-modals-standalone/*"
```

---

## 3. Python worker — `.env` on EC2

**File:** `/var/www/brandbased/python-worker/.env`

```env
OPENAI_API_KEY=sk-...
LARAVEL_API_BASE=https://api.brandbased.ai/api
INTERNAL_API_TOKEN=
PROCESSOR_NAME=brandbased-processor-1
```

**Local dev `.env`:**

```env
LARAVEL_API_BASE=http://127.0.0.1:8000/api
```

---

## 4. Local development (3 terminals)

```powershell
# Terminal 1 — Laravel
cd brandbased-api
php artisan serve

# Terminal 2 — Frontend
cd brandbased_frontend
python -m http.server 5500
# Open http://127.0.0.1:5500/index.html

# Terminal 3 — Python worker
cd brandbased_py_processor
.\venv\Scripts\python.exe worker.py

# Optional — Smart-size (crop UI)
cd brandbased_frontend\premium-and-freemium-bb-modals-standalone
uvicorn bb_smart_sizing_server:app --port 8001
```

---

## 5. EC2 — deploy / update Python worker

**Upload via WinSCP to** `/var/www/brandbased/python-worker/`:

- `worker.py`, `config.py`, `requirements.txt`
- `services/` (all `.py`)
- `models/`
- **Do not upload:** `venv/`, `.env`

**After upload:**

```bash
cd /var/www/brandbased/python-worker
source venv/bin/activate
pip install -r requirements.txt

sudo systemctl restart brandbased-worker
sudo systemctl status brandbased-worker
```

---

## 6. EC2 — systemd worker service

**File:** `/etc/systemd/system/brandbased-worker.service`

```ini
[Unit]
Description=BrandBased identity worker
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/brandbased/python-worker
EnvironmentFile=/var/www/brandbased/python-worker/.env
Environment=PLAYWRIGHT_BROWSERS_PATH=/var/www/brandbased/python-worker/.playwright-browsers
ExecStart=/var/www/brandbased/python-worker/venv/bin/python worker.py
Restart=always
RestartSec=10
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

**Commands:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable brandbased-worker
sudo systemctl start brandbased-worker
sudo systemctl restart brandbased-worker
sudo systemctl status brandbased-worker
sudo journalctl -u brandbased-worker -f
```

---

## 7. Playwright on EC2 (first-time / after rebuild)

```bash
sudo mkdir -p /var/www/brandbased/python-worker/.playwright-browsers
sudo chown -R www-data:www-data /var/www/brandbased/python-worker/.playwright-browsers

sudo -u www-data bash -lc '
  cd /var/www/brandbased/python-worker &&
  source venv/bin/activate &&
  export PLAYWRIGHT_BROWSERS_PATH=/var/www/brandbased/python-worker/.playwright-browsers &&
  playwright install chromium
'

# System libraries (use venv path — sudo does not see "playwright" alone)
cd /var/www/brandbased/python-worker
sudo ./venv/bin/playwright install-deps chromium

# OR apt fallback:
sudo apt-get update
sudo apt-get install -y libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 \
  libnss3 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 libasound2 \
  libpango-1.0-0 libcairo2 libatspi2.0-0 libgtk-3-0 fonts-liberation
```

**Test Chromium as www-data:**

```bash
sudo -u www-data bash -lc '
  cd /var/www/brandbased/python-worker &&
  source venv/bin/activate &&
  export PLAYWRIGHT_BROWSERS_PATH=/var/www/brandbased/python-worker/.playwright-browsers &&
  python -c "from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    b.close()
print(\"OK\")"
'
```

---

## 8. EC2 — Laravel (quick commands)

```bash
cd /var/www/brandbased/brandbased-backend-to-push-ec2   # adjust path if different

composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan db:seed --class=BrandAiPromptSeeder
php artisan config:cache
php artisan route:cache

sudo systemctl restart php8.3-fpm    # your PHP version
sudo systemctl restart nginx
```

**`.env` reminders:**

```env
APP_URL=https://api.brandbased.ai
SANCTUM_STATEFUL_DOMAINS=app.brandbased.ai,brandbased.ai
AWS_BUCKET=...
```

---

## 9. curl — test API & trigger worker

**Health:**

```bash
curl -sS https://api.brandbased.ai/up
```

**Worker queue (internal):**

```bash
curl -sS https://api.brandbased.ai/api/internal/brand-verification/pending
```

**Login → token:**

```bash
curl -sS -X POST https://api.brandbased.ai/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}'

export TOKEN="paste-token"
```

**Create verification job:**

```bash
curl -sS -X POST https://api.brandbased.ai/api/brand-verification-requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "brand_name": "Test Brand",
    "website_url": "https://example.com",
    "light_logo_svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"#1030f5\"/></svg>",
    "dark_logo_svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"#fff\"/></svg>"
  }'
```

**Poll status:**

```bash
curl -sS "https://api.brandbased.ai/api/brand-verification-requests/REQUEST_ID/status" \
  -H "Authorization: Bearer $TOKEN"
```

Watch worker: `sudo journalctl -u brandbased-worker -f`

---

## 10. Smart-size / crop (optional)

**Upload to EC2:** `premium-and-freemium-bb-modals-standalone/` → `/var/www/brandbased_smart_sizing/`

- `bb_smart_sizing_server.py`, `bb_trim_svg_viewbox.py`, `requirements.txt`

```bash
cd /var/www/brandbased_smart_sizing
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# .env with OPENAI_API_KEY=
uvicorn bb_smart_sizing_server:app --host 127.0.0.1 --port 8001
```

**nginx** (inside `api.brandbased.ai` server block) — see `deploy/nginx-smart-size.conf`

**Test:**

```bash
curl -sS https://api.brandbased.ai/smart/api/bb/ping
```

---

## 11. WinSCP upload tips

- Upload to `/home/ubuntu/upload/` first if Permission denied on `/var/www/`
- Then: `sudo rsync -av /home/ubuntu/upload/ /var/www/brandbased/python-worker/ --exclude venv --exclude .env`
- Never overwrite production `.env` from your PC by mistake

---

## 12. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Stuck at 70% verification | Check worker logs; ensure `map_non_trained` import; restart worker |
| Playwright executable missing | `playwright install chromium` as `www-data` + `PLAYWRIGHT_BROWSERS_PATH` |
| `libatk-1.0.so.0` missing | `sudo ./venv/bin/playwright install-deps chromium` or apt packages (§7) |
| CORS on login | Laravel CORS + `SANCTUM_STATEFUL_DOMAINS` for app domain |
| Frontend calls localhost | Re-upload `app-config.js`; invalidate CloudFront |
| `playwright: command not found` with sudo | Use `./venv/bin/playwright` not bare `playwright` |

---

## 13. File map (repo)

```
brandbased_frontend/          → S3 (static)
brandbased-api/               → EC2 Laravel
brandbased_py_processor/      → EC2 python-worker
premium-and-freemium-.../       → EC2 smart-size only (not S3)
deploy/                       → nginx + systemd snippets
```

---

*Last updated from production setup: api.brandbased.ai + S3 frontend + python-worker on EC2.*
