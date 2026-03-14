#!/usr/bin/env bash
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
step() { echo -e "\n${BOLD}==> $1${NC}"; }

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# ── Prerequisites ──────────────────────────────────────────────
step "Checking prerequisites"

command -v python3 >/dev/null 2>&1 || { err "python3 not found. Install Python 3.9+"; exit 1; }
log "python3 found: $(python3 --version)"

command -v pnpm >/dev/null 2>&1 || { err "pnpm not found. Install with: npm install -g pnpm"; exit 1; }
log "pnpm found: $(pnpm --version)"

# ── PostgreSQL ─────────────────────────────────────────────────
step "Setting up PostgreSQL"

if command -v pg_isready >/dev/null 2>&1 && pg_isready -q 2>/dev/null; then
    log "PostgreSQL is already running"
elif command -v brew >/dev/null 2>&1; then
    if ! brew list postgresql@16 >/dev/null 2>&1; then
        warn "Installing PostgreSQL 16 via Homebrew..."
        brew install postgresql@16
    fi
    brew services start postgresql@16 2>/dev/null || true
    sleep 2
    log "PostgreSQL started via Homebrew"
elif command -v docker >/dev/null 2>&1; then
    warn "Starting PostgreSQL via Docker..."
    docker compose -f docker/docker-compose.yml up postgres -d
    sleep 3
    log "PostgreSQL started via Docker"
else
    err "No PostgreSQL found. Install via Homebrew (brew install postgresql@16) or Docker"
    exit 1
fi

# Find psql binary
PSQL=""
for p in psql /opt/homebrew/opt/postgresql@16/bin/psql /usr/local/opt/postgresql@16/bin/psql; do
    if command -v "$p" >/dev/null 2>&1; then PSQL="$p"; break; fi
done

if [ -n "$PSQL" ]; then
    $PSQL -U "$(whoami)" -d postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='databuilder'" 2>/dev/null | grep -q 1 || {
        $PSQL -U "$(whoami)" -d postgres -c "CREATE USER databuilder WITH PASSWORD 'localdev' CREATEDB;" 2>/dev/null || true
        log "Created databuilder user"
    }
    $PSQL -U "$(whoami)" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='databuilder'" 2>/dev/null | grep -q 1 || {
        $PSQL -U "$(whoami)" -d postgres -c "CREATE DATABASE databuilder OWNER databuilder;" 2>/dev/null || true
        log "Created databuilder database"
    }
    log "Database ready"
else
    warn "psql not in PATH — skipping DB/user creation (may already exist via Docker)"
fi

# ── Redis ──────────────────────────────────────────────────────
step "Setting up Redis"

if command -v redis-cli >/dev/null 2>&1 && redis-cli ping >/dev/null 2>&1; then
    log "Redis is already running"
elif command -v brew >/dev/null 2>&1; then
    if ! brew list redis >/dev/null 2>&1; then
        warn "Installing Redis via Homebrew..."
        brew install redis
    fi
    brew services start redis 2>/dev/null || true
    log "Redis started via Homebrew"
elif command -v docker >/dev/null 2>&1; then
    docker compose -f docker/docker-compose.yml up redis -d
    log "Redis started via Docker"
else
    warn "Redis not found — app will work without it (caching disabled)"
fi

# ── Backend ────────────────────────────────────────────────────
step "Setting up backend"

cd "$ROOT_DIR/backend"

if [ ! -d ".venv" ]; then
    python3 -m venv .venv
    log "Created Python virtual environment"
fi

source .venv/bin/activate
pip install --upgrade pip setuptools -q
pip install -e ".[dev]" -q
log "Backend dependencies installed"

# Run migrations
alembic upgrade head 2>&1 | tail -1
log "Database migrations applied"

cd "$ROOT_DIR"

# ── Frontend ───────────────────────────────────────────────────
step "Setting up frontend"

cd "$ROOT_DIR/frontend"
pnpm install --silent 2>/dev/null
log "Frontend dependencies installed"

cd "$ROOT_DIR"

# ── Environment ────────────────────────────────────────────────
if [ ! -f .env ]; then
    cp .env.example .env
    log "Created .env from .env.example"
else
    log ".env already exists"
fi

# ── Verify ─────────────────────────────────────────────────────
step "Running tests"

cd "$ROOT_DIR/backend"
source .venv/bin/activate
if python -m pytest tests/ -q 2>&1 | tail -1; then
    log "Backend tests passed"
else
    warn "Some tests failed — check output above"
fi

cd "$ROOT_DIR/frontend"
if pnpm run build --silent 2>/dev/null; then
    log "Frontend build passed"
else
    warn "Frontend build had issues"
fi

cd "$ROOT_DIR"

# ── Done ───────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}Setup complete!${NC}"
echo ""
echo "To start the app, run these in separate terminals:"
echo ""
echo -e "  ${BOLD}Backend:${NC}"
echo "    cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000"
echo ""
echo -e "  ${BOLD}Frontend:${NC}"
echo "    cd frontend && pnpm run dev"
echo ""
echo -e "  Or use: ${BOLD}make dev${NC}"
echo ""
echo -e "  App:      ${BOLD}http://localhost:5173${NC}"
echo -e "  API docs: ${BOLD}http://localhost:8000/docs${NC}"
echo ""
