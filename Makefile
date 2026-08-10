SHELL := /bin/bash
.DEFAULT_GOAL := help

VAULT_PATH ?= $(HOME)/Journal/personal_journey
VAULT_PORT ?= 3721
CREATOR_STUDIO_PORT ?= 4310
CREATOR_STUDIO_WEB_PORT ?= 5173

.PHONY: help install dev dev-vault build test smoke smoke-vault smoke-studio \
	studio-install dev-studio dev-studio-web dev-studio-server studio-build studio-start \
	studio-typecheck studio-lint studio-test studio-test-foundation studio-smoke

help: ## ℹ️  Show available make targets
	@awk 'BEGIN {FS = ":.*## "; printf "Usage: make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-22s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## 📦 Install all workspace dependencies (pnpm)
	@echo "📦 Installing workspace dependencies..."
	pnpm install

dev: ## 🚀 Run vault-server + creator-studio (web + server) together
	@echo "🚀 Starting vault + creator-studio..."
	VAULT_PATH="$(VAULT_PATH)" PORT="$(VAULT_PORT)" CREATOR_STUDIO_PORT="$(CREATOR_STUDIO_PORT)" CREATOR_STUDIO_WEB_PORT="$(CREATOR_STUDIO_WEB_PORT)" pnpm run dev

dev-vault: ## 🔍 Run only the vault API server
	@echo "🔍 Starting vault API server on :$(VAULT_PORT)..."
	VAULT_PATH="$(VAULT_PATH)" PORT="$(VAULT_PORT)" pnpm run dev:vault

build: ## 🛠️  Build vault-server and creator-studio
	@echo "🛠️  Building vault-server + creator-studio..."
	pnpm run build

test: ## 🧪 Run creator-studio tests
	@echo "🧪 Running creator-studio tests..."
	pnpm test

smoke: smoke-vault smoke-studio ## ✅ Smoke test running services

smoke-vault: ## ✅ Check vault API health endpoint
	curl -fsS "http://localhost:$(VAULT_PORT)/status" | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); if (!j.ok) process.exit(1); console.log(`vault ok: $${j.docs} docs at $${j.vaultPath}`) })'

studio-install: ## 📦 Install creator-studio dependencies
	@echo "📦 Installing workspace dependencies..."
	pnpm install

dev-studio: ## 🎛️  Run creator-studio web + server together (web:5173, server:4310)
	@echo "🎛️  Starting creator-studio (web:$(CREATOR_STUDIO_WEB_PORT), server:$(CREATOR_STUDIO_PORT))..."
	CREATOR_STUDIO_PORT="$(CREATOR_STUDIO_PORT)" CREATOR_STUDIO_WEB_PORT="$(CREATOR_STUDIO_WEB_PORT)" pnpm run creator-studio:dev

dev-studio-web: ## 🌐 Run only creator-studio web (Vite, default 5173)
	@echo "🌐 Starting creator-studio web (Vite) on :$(CREATOR_STUDIO_WEB_PORT)..."
	CREATOR_STUDIO_PORT="$(CREATOR_STUDIO_PORT)" CREATOR_STUDIO_WEB_PORT="$(CREATOR_STUDIO_WEB_PORT)" pnpm run creator-studio:dev:web

dev-studio-server: ## ⚙️  Run only creator-studio server (Hono, default 4310)
	@echo "⚙️  Starting creator-studio server (Hono) on :$(CREATOR_STUDIO_PORT)..."
	CREATOR_STUDIO_PORT="$(CREATOR_STUDIO_PORT)" CREATOR_STUDIO_WEB_PORT="$(CREATOR_STUDIO_WEB_PORT)" pnpm run creator-studio:dev:server

studio-build: ## 🛠️  Build creator-studio (contracts + web + server)
	@echo "🛠️  Building creator-studio..."
	pnpm run creator-studio:build

studio-start: ## ▶️  Serve creator-studio production build (server:4310)
	@echo "▶️  Starting creator-studio production server..."
	CREATOR_STUDIO_PORT="$(CREATOR_STUDIO_PORT)" pnpm run creator-studio:start

studio-typecheck: ## 🔎 Typecheck all creator-studio workspaces
	@echo "🔎 Typechecking creator-studio..."
	pnpm run creator-studio:typecheck

studio-lint: ## 🧹 Lint creator-studio
	@echo "🧹 Linting creator-studio..."
	pnpm run creator-studio:lint

studio-test: ## 🧪 Run creator-studio unit tests (vitest)
	@echo "🧪 Running creator-studio tests..."
	pnpm run creator-studio:test

studio-test-foundation: ## 🏁 Run creator-studio full foundation gate
	@echo "🏁 Running creator-studio foundation gate..."
	pnpm run creator-studio:test:foundation

studio-smoke: ## ✅ Check creator-studio server health
	curl -fsS "http://127.0.0.1:$(CREATOR_STUDIO_PORT)/api/v1/health" | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); if (j.data?.status !== "ok") process.exit(1); console.log(`creator-studio ok: $${j.data.status} @ :$(CREATOR_STUDIO_PORT)`) })'
