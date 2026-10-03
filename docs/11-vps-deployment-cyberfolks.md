# 11 — Wdrożenie na VPS (cyberfolks) + CI/CD z GitHub Actions

> Cel: `dzwonilek.pl` stoi na lekkim VPS-ie (cyberfolks, **2 GB RAM / 1 vCPU**),
> a każdy merge do `main` automatycznie przechodzi testy, buduje obraz, publikuje
> go do Docker Hub (timosch99/dzwonilek) i wdraża na serwer przez SSH.

---

## 0. Jak działa pipeline (`.github/workflows/deploy-vps.yml`)

```
push do main
   │
   ▼
┌─────────┐   ┌──────────────┐   ┌────────────────┐   ┌─────────────────┐
│  test   │──▶│ build & push │──▶│ deploy (SSH)   │──▶│ VPS: pull + up  │
│ backend │   │ obraz do     │   │ scp compose    │   │ migracje + seed │
│ frontend│   │ Docker Hub   │   │ pull + restart │   │ (prestart.sh)   │
└─────────┘   └──────────────┘   └────────────────┘   └─────────────────┘
```

- **test** — pytest backendu (z prawdziwym Postgresem i Mailpitem z compose) + build frontendu (typecheck + bundling).
- **build & push** — jeden obraz `backend` (frontend jest wbudowany w obraz — `backend/Dockerfile`), tagowany `latest` + `sha`. Buduje się **na runnerze GitHuba**, nie na VPS — 1 vCPU/2 GB by tego nie udźwignął.
- **deploy** — SCP plików compose na VPS, potem `docker compose pull backend` + `up -d` (migracje + seed odpala `prestart.sh` w komendzie kontenera — wszystko idempotentne). Na serwerze nie ma repo ani gita.

Ręczne wywołanie: zakładka **Actions → Deploy to VPS → Run workflow**.

---

## 1. Jednorazowy setup VPS

### 1.1. Pierwsze logowanie + **rotacja hasła**

> ⚠️ **Hasło roota, które padło na czacie, uznaj za skompromitowane.**
> Po ustawieniu klucza SSH (krok 1.3) zmień je i **nie używaj nigdzie**:

```bash
ssh root@185.193.114.6        # ostatnie logowanie hasłem
passwd                         # ustaw nowe, mocne hasło (nigdzie go nie zapisuj)
```

### 1.2. Docker + swap (2 GB RAM nie zaszkodzi mieć poduszki)

```bash
curl -fsSL https://get.docker.com | sh

# swap 2G — ratuje przy skokach pamięci (cyberfolks często go nie ma)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 1.3. Klucz SSH dla CI/CD (na Twoim komputerze + na VPS)

```bash
# lokalnie (Git Bash / PowerShell):
ssh-keygen -t ed25519 -f dzwonilek_deploy -N ""        # klucz deployowy, bez hasła
ssh root@185.193.114.6 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys" < dzwonilek_deploy.pub
```

- **prywatny** klucz (`dzwonilek_deploy`) trafia do GitHub Secrets jako `VPS_SSH_KEY`,
- **publiczny** zostaje na VPS w `~/.ssh/authorized_keys`.
- Test: `ssh -i dzwonilek_deploy root@185.193.114.6` — ma wejść bez hasła.

### 1.4. Firewall — tylko to, co potrzebne

```bash
apt update && apt install -y ufw
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw enable
```

(docker publikuje porty przez iptables niezależnie od ufw — proxy/db/redis **nie** muszą
mieć otwartych portów na świat; cały ruch idzie przez Traefik na 80/443.)

### 1.5. Katalog + konfiguracja w `/opt/dzwonilek`

Pliki `compose.yml` i `compose.deploy.yml` dostarcza na serwer CI przy każdym deployu
(SCP w workflow) — **na VPS nie ma repo, gita ani kluczy do repo**:

```bash
mkdir -p /opt/dzwonilek
```

Utwórz `/opt/dzwonilek/.env` (**nie jest w gicie** — ten plik żyje tylko na serwerze):

```bash
cat > /opt/dzwonilek/.env <<'EOF'
# DzwoniLek — produkcja (dzwonilek.pl)
DOMAIN=dzwonilek.pl
PROJECT_NAME=DzwoniLek

# wygeneruj: openssl rand -hex 32
SECRET_KEY=<WYGENEROWANY-LOSOWY-KLUCZ>
FIRST_SUPERUSER=admin@dzwonilek.pl
FIRST_SUPERUSER_PASSWORD=<WYGENEROWANE-MOCNE-HASLO>

# Postgres — wygeneruj: openssl rand -hex 16
POSTGRES_PASSWORD=<WYGENEROWANE-HASLO-DO-BAZY>
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5432/app

# Obraz z CI (dokładnie taka ścieżka, jak pokazuje push w GitHub Actions)
DOCKER_IMAGE_BACKEND=docker.io/timosch99/dzwonilek:latest

# E-mail (produkcja: SMTP cyberfolks albo dowolny dostawca; dev używał Mailpita)
SMTP_HOST=mail.<twoja-domena-mailowa>
SMTP_PORT=587
SMTP_USER=admin@dzwonilek.pl
SMTP_PASSWORD=<HASLO-SMTP>
EMAILS_FROM_EMAIL=no-reply@dzwonilek.pl
EOF
chmod 600 /opt/dzwonilek/.env
```

### 1.6. Docker Hub — dostęp do obrazu na VPS

CI pushuje obraz do repo `timosch99/dzwonilek` na Docker Hub.

- **Repo publiczne** (domyślne na Docker Hub): VPS ciągnie obraz anonimowo —
  nic do zrobienia.
- **Repo prywatne**: zaloguj się raz na VPS tokenem (Docker Hub → Account
  Settings → Security → New Access Token):

```bash
echo "<DOCKERHUB_TOKEN>" | docker login -u timosch99 --password-stdin
```

> Token do CI żyje w GitHub Secrets (`DOCKERHUB_TOKEN`) — ten sam, który masz
> w lokalnym `.env`; **nie** commitujemy go do żadnego repo.

### 1.7. DNS w panelu cyberfolks

| Rekord | Typ | Wartość |
|---|---|---|
| `@` (dzwonilek.pl) | A | `185.193.114.6` |
| `www` | A | `185.193.114.6` |
| `adminer` (opcjonalnie!) | A | `185.193.114.6` |

Po propagacji (`dig +short dzwonilek.pl`) Traefik sam wystawi certyfikat Let's Encrypt
(TLS challenge) przy pierwszym wejściu na https://dzwonilek.pl.

---

## 2. Pierwszy deploy

Po zrobieniu kroków 1.x i dodaniu sekretów z sekcji 3 odpal workflow ręcznie:
**GitHub → Actions → Deploy to VPS → Run workflow** (albo zwykły push do `main`.
CI wyśle pliki compose, ściągnie obraz i podniesie stack.

Na VPS możesz obserwować:

```bash
cd /opt/dzwonilek
docker compose --env-file .env -f compose.yml -f compose.deploy.yml up -d
docker compose --env-file .env -f compose.yml -f compose.deploy.yml logs -f backend
```

Checklista:
- https://dzwonilek.pl → panel (katalog leków zaseedowany automatycznie: 34 pozycje),
- https://dzwonilek.pl/docs → Swagger,
- `docker compose --env-file .env -f compose.yml -f compose.deploy.yml ps` — backend/worker/beat/db/redis healthy,
- Celery tyka: `docker compose ... logs worker | grep tick` (dispatcher co 60 s).

Co się wydarzyło przy starcie: `prestart.sh` → `alembic upgrade head` (migracje) +
seed (superuser + leki), potem `fastapi run --workers 2`.

---

## 3. Konfiguracja GitHub (sekrety CI/CD)

Repo → **Settings → Secrets and variables → Actions → Secrets**:

| Secret | Wartość |
|---|---|
| `VPS_HOST` | `185.193.114.6` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | **cała zawartość** prywatnego klucza `dzwonilek_deploy` (z kroku 1.3, łącznie z nagłówkiem `-----BEGIN...`) |
| `DOCKERHUB_USERNAME` | `timosch99` |
| `DOCKERHUB_TOKEN` | access token z Docker Hub (ten sam, co w lokalnym `.env`) |

Sekrety Docker Hub potrzebne są do **push**owania obrazu; deploy na VPS ich nie
używa (serwer ciągnie obraz z publicznego repo anonimowo, patrz krok 1.6).

---

## 4. Codzienna praca

```bash
git checkout -b feature/x
# ...zmiany...
git push origin feature/x        # PR → odpala się job "test"
# merge do main                  # → test → build → push → automatyczny deploy
```

**Rollback** do poprzedniej wersji (obrazy tagowane są SHA-m):

```bash
ssh root@185.193.114.6
cd /opt/dzwonilek
DOCKER_IMAGE_BACKEND=docker.io/timosch99/dzwonilek:<POPRZEDNI-SHA> \
  docker compose --env-file .env -f compose.yml -f compose.deploy.yml up -d backend
```

**Wyłączenie / status:**

```bash
docker compose --env-file .env -f compose.yml -f compose.deploy.yml ps
docker compose --env-file .env -f compose.yml -f compose.deploy.yml down
```

---

## 5. Ograniczenia 2 GB / 1 vCPU — co już zrobione i o czym pamiętać

- **Build na runnerach, nie na VPS** — serwer tylko `pull`-uje gotowy obraz.
- **Limity pamięci** w `compose.deploy.yml` (db 512M, backend 512M, worker 256M,
  redis 96M, beat 96M, proxy 128M, adminer 96M) — suma kapsułkuje stack na <2 GB.
- **2 workery** FastAPI zamiast 4 (`--workers 2` w komendzie backendu).
- **Swap 2G** z kroku 1.2 — bez niego Postgres potrafi dostać OOM-kill.
- Jak stack nie wstaje z powodu pamięci: `free -h`, `docker stats`, ewentualnie
  dokręć limity albo dopnij więcej swapu.
- Playwright/Mailpit **nie** są w stacku produkcyjnym (testy/dev only).

---

## 6. Bezpieczeństwo — obowiązki przed życiem na produkcji

1. **Zmień hasło roota** (krok 1.1) — to hasło padło na czacie projektu.
2. Logowanie hasłem po SSH można wyłączyć całkiem:
   `/etc/ssh/sshd_config`: `PasswordAuthentication no` → `systemctl restart ssh`.
3. **Adminer** (`adminer.dzwonilek.pl`) jest dostępny publicznie w szablonie —
   na produkcji usuń usługę z `compose.deploy.yml` albo zasłoń dodatkowym authem
   (basic auth na routerze Traefika). Bez DNS-owego rekordu `adminer` jest nieosiągalny.
4. `.env` na serwerze: `chmod 600`, nigdy nie commitujemy (jest w `.gitignore`).
5. Sekrety w GitHub tylko jako **Secrets** (nigdy w kodzie/vars).

---

## 7. Troubleshooting

| Objaw | Diagnoza |
|---|---|
| `502/404` po wejściu na domenę | `docker compose ... logs proxy` — Traefik nie widzi backendu; sprawdź `DOMAIN` w `.env` i rekord DNS |
| Certyfikat się nie wystawia | DNS jeszcze nie zpropagowany / port 80 blokowany przez firewall |
| `denied` przy `pull` na VPS | Repo na Docker Hub prywatne i brak `docker login` (krok 1.6) |
| Deploy w Actions failuje na SSH | Zły `VPS_SSH_KEY` (skopiuj cały plik klucza, z nagłówkiem i końcówką) albo firewall blokuje port 22 |
| Backend restartuje się w kółko | `docker compose ... logs backend` — najczęściej błąd w `.env` lub migracja; prestart wykłada kontener celowo (`set -e`) |
| Wolne / OOM | `free -h`, `docker stats`; rozważ podbicie swapu |

---

## 8. Co celowo NIE jest częścią tego wdrożenia (na teraz)

- `deploy.yml` (FastAPI Cloud) — szablonowy, wymaga osobnych sekretów; wyłącz go,
  jeśli przeszkadza w zakładce Actions.
- `deploy-docker-compose.yml` (self-hosted runner + build na serwerze) — zastąpiony
  przez `deploy-vps.yml`; kandydat do usunięcia.
- Workflow szablonowe odpalają się na `master` — nasz pipeline patrzy na `main`.
