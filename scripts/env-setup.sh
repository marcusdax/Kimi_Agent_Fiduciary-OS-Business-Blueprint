#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_CONTAINER="${PG_CONTAINER:-fiduciary-os-postgres-1}"
PG_USER="${PG_USER:-postgres}"
DEV_DB="${DEV_DB:-fiduciary_os}"
TEST_DB="${TEST_DB:-fiduciary_os_test}"
TEST_DATABASE_URL="postgresql://${PG_USER}:postgres@127.0.0.1:5432/${TEST_DB}"

FORCE_INSTALL=false
RUN_VERIFY=false

usage() {
  cat <<'EOF'
Usage: ./scripts/env-setup.sh [--force-install] [--verify] [-h|--help]

Idempotent environment setup and verification for the Unified AUCTUM.ATLAS &
AUCTUM Command (Fiduciary OS) repository.

Options:
  --force-install  Force `npm ci --no-audit --no-fund` across all 3 packages
  --verify         Run baseline type-check, lint, and test suites after setup
  -h, --help       Show this help message
EOF
}

for arg in "$@"; do
  case "$arg" in
    --force-install) FORCE_INSTALL=true ;;
    --verify) RUN_VERIFY=true ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "ERROR: Unknown option: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

log_section() {
  printf '\n==> %s\n' "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: Required command '$1' not found in PATH." >&2
    exit 1
  fi
}

log_section "1. Verifying runtime prerequisites"
require_cmd node
require_cmd npm
require_cmd python3
require_cmd docker

NODE_VER="$(node -v)"
NODE_MAJOR="${NODE_VER#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
if (( NODE_MAJOR < 22 )); then
  echo "ERROR: Node.js >= 22 is required (found ${NODE_VER})." >&2
  exit 1
fi

NPM_VER="$(npm -v)"
NPM_MAJOR="${NPM_VER%%.*}"
if (( NPM_MAJOR < 10 )); then
  echo "ERROR: npm >= 10 is required (found ${NPM_VER})." >&2
  exit 1
fi

PYTHON_VER="$(python3 --version 2>&1)"
DOCKER_VER="$(docker --version 2>&1)"
COMPOSE_VER="$(docker compose version 2>&1)"

echo "  node:           ${NODE_VER}"
echo "  npm:            ${NPM_VER}"
echo "  python3:        ${PYTHON_VER}"
echo "  docker:         ${DOCKER_VER}"
echo "  docker compose: ${COMPOSE_VER}"

log_section "2. Verifying Docker daemon and PostgreSQL container"
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not reachable. Start Docker and retry." >&2
  exit 1
fi

RUNNING_CONTAINERS="$(docker ps --format '{{.Names}}')"
if ! printf '%s\n' "$RUNNING_CONTAINERS" | grep -qx "$PG_CONTAINER"; then
  echo "ERROR: PostgreSQL container '${PG_CONTAINER}' is not running." >&2
  echo "Hint: Start the dev stack with:" >&2
  echo "  docker compose -f ${REPO_ROOT}/fiduciary-os/docker-compose.dev.yml up -d" >&2
  exit 1
fi

if ! docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -d "$DEV_DB" >/dev/null 2>&1; then
  echo "ERROR: PostgreSQL container '${PG_CONTAINER}' is running but not ready for connections." >&2
  echo "Hint: Inspect logs with: docker logs --tail 50 ${PG_CONTAINER}" >&2
  exit 1
fi
echo "  ✓ ${PG_CONTAINER} is running and ready"

for svc in fiduciary-os-redis-1 fiduciary-os-trust-core-1 fiduciary-os-backend-1 fiduciary-os-frontend-1; do
  if printf '%s\n' "$RUNNING_CONTAINERS" | grep -qx "$svc"; then
    echo "  ✓ ${svc} is running"
  else
    echo "  ! ${svc} is not running (optional for DB/unit test setup)"
  fi
done

log_section "3. Provisioning isolated test DB (${TEST_DB}) and PostgreSQL extensions"
if docker exec "$PG_CONTAINER" psql -U "$PG_USER" -tAc "SELECT 1 FROM pg_database WHERE datname='${TEST_DB}'" | grep -qx '1'; then
  echo "  ✓ Database '${TEST_DB}' already exists"
else
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TEST_DB}\";"
  echo "  ✓ Created database '${TEST_DB}'"
fi

for db in "$DEV_DB" "$TEST_DB"; do
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$db" -v ON_ERROR_STOP=1 -c \
    'CREATE EXTENSION IF NOT EXISTS "vector"; CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS "pgcrypto";' >/dev/null
  echo "  ✓ Enabled extensions (vector, uuid-ossp, pgcrypto) in '${db}'"
done

log_section "4. Ensuring gitignored fiduciary-os/backend/.env.test exists"
ENV_TEST_FILE="${REPO_ROOT}/fiduciary-os/backend/.env.test"
if [[ -f "$ENV_TEST_FILE" ]]; then
  echo "  ✓ ${ENV_TEST_FILE} already exists (preserved)"
else
  cat >"$ENV_TEST_FILE" <<EOF
NODE_ENV=test
DATABASE_URL=${TEST_DATABASE_URL}
DIRECT_URL=${TEST_DATABASE_URL}
JWT_SECRET=test-jwt-secret-fiduciary-os-at-least-32-chars
REDIS_ENABLED=false
ENABLE_AI_INSIGHTS=true
BCRYPT_ROUNDS=4
EOF
  echo "  ✓ Created ${ENV_TEST_FILE} with local test defaults"
fi

log_section "5. Verifying npm dependencies across all 3 packages"
ensure_npm_deps() {
  local pkg_dir="$1"
  local expected_bin="$2"
  local rel_dir="${pkg_dir#"${REPO_ROOT}/"}"
  local needs_install=false

  if [[ "$FORCE_INSTALL" == "true" ]]; then
    needs_install=true
  elif [[ ! -d "${pkg_dir}/node_modules" ]]; then
    needs_install=true
  elif [[ ! -x "${pkg_dir}/node_modules/.bin/${expected_bin}" ]]; then
    needs_install=true
  elif [[ -f "${pkg_dir}/package-lock.json" ]] && { [[ ! -f "${pkg_dir}/node_modules/.package-lock.json" ]] || [[ "${pkg_dir}/package-lock.json" -nt "${pkg_dir}/node_modules/.package-lock.json" ]]; }; then
    needs_install=true
  fi

  if [[ "$needs_install" == "true" ]]; then
    echo "  Installing dependencies in ${rel_dir} (npm ci --no-audit --no-fund)..."
    (cd "$pkg_dir" && npm ci --no-audit --no-fund)
    echo "  ✓ ${rel_dir}: dependencies installed"
  else
    echo "  ✓ ${rel_dir}: dependencies already installed and up to date (skipping npm ci)"
  fi
}

ensure_npm_deps "${REPO_ROOT}/fiduciary-os/backend" "prisma"
ensure_npm_deps "${REPO_ROOT}/fiduciary-os/frontend" "vitest"
ensure_npm_deps "${REPO_ROOT}/trust-core" "tsc"

log_section "6. Generating Prisma client and pushing schema to '${TEST_DB}' (dev DB '${DEV_DB}' untouched)"
(
  cd "${REPO_ROOT}/fiduciary-os/backend"
  npm run db:generate
  DATABASE_URL="${TEST_DATABASE_URL}" \
  DIRECT_URL="${TEST_DATABASE_URL}" \
    npx prisma db push --skip-generate
)

if [[ "$RUN_VERIFY" == "true" ]]; then
  log_section "7. Running baseline verification suite (--verify)"
  echo "  -> trust-core: type-check & test"
  (cd "${REPO_ROOT}/trust-core" && npm run type-check && npm test)

  echo "  -> fiduciary-os/frontend: type-check, lint:styles & test"
  (cd "${REPO_ROOT}/fiduciary-os/frontend" && npm run type-check && npm run lint:styles && npm run test)

  echo "  -> fiduciary-os/backend: type-check & test (against ${TEST_DB})"
  (
    cd "${REPO_ROOT}/fiduciary-os/backend"
    npm run type-check
    DATABASE_URL="${TEST_DATABASE_URL}" \
    DIRECT_URL="${TEST_DATABASE_URL}" \
      npm test
  )
fi

printf '\nEnvironment setup complete.\n'
