# Deploy: Railway (MySQL + BE) + Vercel (FE)

> **Date:** 2026-08-12  
> **Stack:** Spring Boot JAR on Railway · MySQL Railway plugin · TanStack Start FE on Vercel  
> **CI/CD:** Git push → auto deploy (Railway + Vercel). No GitHub Actions required for first cut.

---

## 0. Repo layout

Monorepo `CPN/`:


| Path                      | Platform                    | Root Directory           |
| ------------------------- | --------------------------- | ------------------------ |
| `BE/`                     | Railway service **cpn-api** | `BE`                     |
| Railway MySQL plugin      | same project                | —                        |
| `FE_react/Pixel Perfect/` | Vercel project **cpn-web**  | `FE_react/Pixel Perfect` |


Push code to GitHub first (private OK).

---



## 1. Railway — MySQL

1. New Project → **Add MySQL** (or “Database” → MySQL).
2. Note variables (Railway Variables tab), typically:
  - `MYSQLHOST` / `MYSQLPORT` / `MYSQLDATABASE` / `MYSQLUSER` / `MYSQLPASSWORD`  
  - or `MYSQL_URL` / `DATABASE_URL`

---



## 2. Railway — Backend

1. **New Service** → Deploy from GitHub → set **Root Directory** = `BE`.
2. Builder: Dockerfile (`BE/Dockerfile` + `BE/railway.toml`).
3. **Link** MySQL plugin to this service (Share variables).
4. Set Variables:


| Variable                                             | Value                                                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPRING_PROFILES_ACTIVE`                             | `prod,demo`                                                                                                                                                               |
| `SPRING_DATASOURCE_URL`                              | `jdbc:mysql://${MYSQLHOST}:${MYSQLPORT}/${MYSQLDATABASE}?useUnicode=true&characterEncoding=utf8&useSSL=true&allowPublicKeyRetrieval=true&serverTimezone=Asia/Ho_Chi_Minh` |
| `SPRING_DATASOURCE_USERNAME`                         | `${{MySQL.MYSQLUSER}}` (or paste user)                                                                                                                                    |
| `SPRING_DATASOURCE_PASSWORD`                         | `${{MySQL.MYSQLPASSWORD}}`                                                                                                                                                |
| `JHIPSTER_SECURITY_AUTHENTICATION_JWT_BASE64_SECRET` | output of `openssl rand -base64 64`                                                                                                                                       |
| `JHIPSTER_CORS_ALLOWED_ORIGIN_PATTERNS`              | `https://*.vercel.app`                                                                                                                                                    |
| `JHIPSTER_CORS_ALLOWED_ORIGINS`                      | `https://your-prod-domain.vercel.app` (exact FE URL after first deploy)                                                                                                   |
| `JHIPSTER_MAIL_BASE_URL`                             | public BE URL, e.g. `https://cpn-api-xxx.up.railway.app`                                                                                                                  |


5. Generate domain: Railway → Settings → Networking → **Generate Domain**.
6. Health: `/management/health` (already in `railway.toml`).

### Data on first boot (`prod,demo`)

| Layer | What you get |
|-------|----------------|
| Liquibase `prod` | Schema + migrations |
| Liquibase `seed` | Offices / routes / vehicles / drivers (same as local FE master) |
| `DemoStaffSeed` | Staff like local: `admin`, `quay.hn`, `kt.hn`, … password **`123`** (idempotent) |
| Orders / receipts | Still empty — create during demo (or dump local DB later) |

Dockerfile default: `SPRING_PROFILES_ACTIVE=prod,demo`. Override to `prod` only when locking down real production (no demo passwords / optional no seed).

**Login demo:** `admin` / `123` hoặc `quay.hn` / `123`. Đổi password trước khi share rộng.

---



## 3. Vercel — Frontend

1. Import GitHub repo → **Root Directory** = `FE_react/Pixel Perfect`.
2. Framework: Other / use `vercel.json` in that folder.
3. Env (Production + Preview):


| Variable            | Value                                                |
| ------------------- | ---------------------------------------------------- |
| `VITE_API_BASE_URL` | `https://YOUR-BE.up.railway.app` (no trailing slash) |
| `NITRO_PRESET`      | `vercel`                                             |


1. Deploy. Copy FE URL → paste into Railway `JHIPSTER_CORS_ALLOWED_ORIGINS` → redeploy BE if needed.

---



## 4. Smoke checklist (khách)

1. Open FE URL → login **`quay.hn` / `123`** hoặc **`admin` / `123`**.
2. Create order / open `/phieu-thu` with API (master VP đã seed).
3. Confirm Network calls hit Railway host, CORS OK, JWT present.
4. Change passwords + JWT secret before sharing broadly.
5. Hardened prod later: set `SPRING_PROFILES_ACTIVE=prod` (tắt `demo`).

---



## 5. CI/CD flow

```
git push → GitHub
         ├─ Railway watches BE/ → rebuild Docker → restart API
         └─ Vercel watches FE path → npm build (NITRO_PRESET=vercel) → edge/SSR
```

Optional later: GitHub Actions for `mvn test` before merge — not required for Railway/Vercel auto-deploy.

---



## 6. Files added


| File                                             | Role                                              |
| ------------------------------------------------ | ------------------------------------------------- |
| `BE/Dockerfile`                                  | JAR image; default profiles `prod,demo`           |
| `BE/.dockerignore`                               | Slimer build context                              |
| `BE/railway.toml`                                | Healthcheck + Docker builder                      |
| `BE/.../application-prod.yml`                    | `PORT`, CORS for Vercel                           |
| `BE/.../application-demo.yml`                    | Liquibase `prod,seed` when profile `demo`         |
| `DemoStaffSeed`                                  | Profiles `dev` + `demo` (password `123`)          |
| `FE_react/Pixel Perfect/vercel.json`             | Build/output for Vercel                           |
| `FE_react/Pixel Perfect/vite.config.ts`          | `nitro.preset` from env                           |
| `FE_react/Pixel Perfect/.env.production.example` | FE API URL template                               |


---



## 7. Cost / tip

- Railway Hobby đủ demo; watch MySQL + idle.  
- Vercel Hobby đủ FE.  
- Custom domain: Vercel DNS + Railway custom domain; update CORS origins.

