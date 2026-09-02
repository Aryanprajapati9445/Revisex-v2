# Database workflow.
#
# Primary target: your Neon (cloud) database, configured via .env
# (copy .env.example -> .env and fill in DATABASE_URL). No local install is
# required for either tool — psql and golang-migrate both run from throwaway
# Docker containers that connect out to Neon over the network.
#
# Schema changes are versioned migrations under migrations/ (see
# db/README.md's Migrations section) — schema.sql no longer exists; there is
# exactly one source of truth for the schema now.
#
# Secondary target: a real local Postgres in Docker (the `local-*` targets),
# useful for load-testing or offline work without touching your Neon project.
# Runs the identical migrate image against the identical migrations/ files —
# only the connection target differs — so local dev exercises the same
# mechanism staging/production use. Not required for normal use.

PSQL_IMG    := postgres:16-alpine
MIGRATE_IMG := migrate/migrate:v4.18.1

CLOUD_PSQL     = docker run --rm -i --env-file .env $(PSQL_IMG) sh -c 'psql "$$DATABASE_URL" -v ON_ERROR_STOP=1'
CLOUD_MIGRATE  = docker run --rm -v "$(CURDIR)/migrations:/migrations" --env-file .env --entrypoint sh $(MIGRATE_IMG)
LOCAL_PSQL    := docker compose exec -T db psql -U postgres -d college_notes -v ON_ERROR_STOP=1
LOCAL_MIGRATE := docker compose run --rm migrate

.PHONY: check-env migrate-up migrate-down-1 migrate-version migrate-create \
        seed test queries psql \
        local-up local-down local-reset local-migrate-up local-migrate-down-1 \
        local-migrate-version local-seed local-test local-queries local-psql local-logs

check-env:
	@test -f .env || { echo "Missing .env — copy .env.example to .env and add your Neon DATABASE_URL" >&2; exit 1; }
	@grep -q '<password>' .env && { echo ".env still has the <user>:<password> placeholder — put your real Neon connection string in it" >&2; exit 1; } || true

migrate-up: check-env         ## apply every pending migration to Neon
	$(CLOUD_MIGRATE) -c 'migrate -path=/migrations -database "$$DATABASE_URL" up'

migrate-down-1: check-env     ## roll back the most recent migration on Neon
	$(CLOUD_MIGRATE) -c 'migrate -path=/migrations -database "$$DATABASE_URL" down 1'

migrate-version: check-env    ## show the currently applied migration version on Neon
	$(CLOUD_MIGRATE) -c 'migrate -path=/migrations -database "$$DATABASE_URL" version'

migrate-create:               ## scaffold a new migration: make migrate-create NAME=add_something
	@test -n "$(NAME)" || { echo "Usage: make migrate-create NAME=add_something" >&2; exit 1; }
	docker run --rm -v "$(CURDIR)/migrations:/migrations" $(MIGRATE_IMG) create -ext sql -dir /migrations -seq $(NAME)

seed: check-env        ## load sample data onto Neon (idempotent)
	$(CLOUD_PSQL) < seed.sql

test: check-env        ## run the constraint suite against Neon (rolls back; leaves no data)
	$(CLOUD_PSQL) -q < tests.sql

queries: check-env     ## run the representative queries against Neon (rolls back; leaves no data)
	$(CLOUD_PSQL) < queries.sql

psql: check-env        ## interactive shell against Neon
	docker run --rm -it --env-file .env $(PSQL_IMG) sh -c 'psql "$$DATABASE_URL"'

# --- Local Docker sandbox -----------------------------------------------------
# A real local Postgres 16, independent of Neon. Handy for bulk-load / index
# verification without spending your cloud project's compute or storage.

local-up:
	docker compose up -d --wait

local-down:
	docker compose down

local-reset:            ## destroy the local sandbox volume and rebuild from scratch
	docker compose down -v
	$(MAKE) local-up
	$(MAKE) local-migrate-up
	$(MAKE) local-seed

local-migrate-up: local-up          ## apply every pending migration to the local sandbox
	$(LOCAL_MIGRATE) up

local-migrate-down-1: local-up      ## roll back the most recent migration on the local sandbox
	$(LOCAL_MIGRATE) down 1

local-migrate-version: local-up     ## show the currently applied migration version locally
	$(LOCAL_MIGRATE) version

local-seed: local-up    ## load sample data into the local sandbox (idempotent)
	$(LOCAL_PSQL) < seed.sql

local-test: local-up    ## run the constraint suite locally — needs local-seed first (uses seeded rows)
	$(LOCAL_PSQL) -q < tests.sql

local-queries: local-up
	$(LOCAL_PSQL) < queries.sql

local-psql: local-up
	docker compose exec db psql -U postgres -d college_notes

local-logs:
	docker compose logs -f db
