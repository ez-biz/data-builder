.PHONY: setup dev backend-dev frontend-dev docker-up docker-down migrate test

setup:
	cd backend && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
	cd frontend && pnpm install

dev:
	docker compose -f docker/docker-compose.yml up postgres redis -d
	$(MAKE) -j2 backend-dev frontend-dev

backend-dev:
	cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000

frontend-dev:
	cd frontend && pnpm run dev

docker-up:
	docker compose -f docker/docker-compose.yml up --build

docker-down:
	docker compose -f docker/docker-compose.yml down

migrate:
	cd backend && . .venv/bin/activate && alembic upgrade head

test:
	cd backend && . .venv/bin/activate && pytest -v
	cd frontend && pnpm test
