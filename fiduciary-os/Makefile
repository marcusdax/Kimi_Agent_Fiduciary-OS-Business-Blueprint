# Fiduciary OS™ - Makefile
# Quick commands for development, testing, and deployment

.PHONY: help install dev dev-frontend dev-backend build test lint format clean deploy-staging deploy-prod

# Default target
.DEFAULT_GOAL := help

# Colors for output
BLUE := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(BLUE)Fiduciary OS™$(NC) - Available Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

# Installation
install: ## Install all dependencies
	@echo "$(BLUE)Installing frontend dependencies...$(NC)"
	cd frontend && npm install
	@echo "$(BLUE)Installing backend dependencies...$(NC)"
	cd backend && npm install
	@echo "$(GREEN)✓ All dependencies installed$(NC)"

install-frontend: ## Install frontend dependencies only
	cd frontend && npm install

install-backend: ## Install backend dependencies only
	cd backend && npm install

# Development
dev: ## Start all development services with Docker Compose
	@echo "$(BLUE)Starting development environment...$(NC)"
	docker-compose up --build

dev-detached: ## Start all services in detached mode
	@echo "$(BLUE)Starting development environment (detached)...$(NC)"
	docker-compose up --build -d

dev-frontend: ## Start frontend development server only
	@echo "$(BLUE)Starting frontend development server...$(NC)"
	cd frontend && npm run dev

dev-backend: ## Start backend development server only
	@echo "$(BLUE)Starting backend development server...$(NC)"
	cd backend && npm run dev

# Database
db-migrate: ## Run database migrations
	@echo "$(BLUE)Running database migrations...$(NC)"
	cd backend && npx prisma migrate dev

db-generate: ## Generate Prisma client
	@echo "$(BLUE)Generating Prisma client...$(NC)"
	cd backend && npx prisma generate

db-seed: ## Seed database with sample data
	@echo "$(BLUE)Seeding database...$(NC)"
	cd backend && npx prisma db seed

db-studio: ## Open Prisma Studio
	@echo "$(BLUE)Opening Prisma Studio...$(NC)"
	cd backend && npx prisma studio

db-reset: ## Reset database (WARNING: Destroys all data)
	@echo "$(RED)WARNING: This will destroy all database data!$(NC)"
	@read -p "Are you sure? [y/N] " confirm && [ $$confirm = y ] && cd backend && npx prisma migrate reset --force || echo "Cancelled"

# Testing
test: ## Run all tests
	@echo "$(BLUE)Running frontend tests...$(NC)"
	cd frontend && npm test
	@echo "$(BLUE)Running backend tests...$(NC)"
	cd backend && npm test

test-frontend: ## Run frontend tests
	cd frontend && npm test

test-backend: ## Run backend tests
	cd backend && npm test

test-e2e: ## Run end-to-end tests
	cd frontend && npm run test:e2e

test-coverage: ## Run tests with coverage report
	cd frontend && npm run test:coverage
	cd backend && npm run test:coverage

# Code Quality
lint: ## Run linting on all code
	@echo "$(BLUE)Linting frontend...$(NC)"
	cd frontend && npm run lint
	@echo "$(BLUE)Linting backend...$(NC)"
	cd backend && npm run lint

lint-fix: ## Fix linting issues automatically
	cd frontend && npm run lint:fix
	cd backend && npm run lint:fix

format: ## Format code with Prettier
	@echo "$(BLUE)Formatting code...$(NC)"
	cd frontend && npm run format
	cd backend && npm run format

type-check: ## Run TypeScript type checking
	@echo "$(BLUE)Type checking frontend...$(NC)"
	cd frontend && npm run type-check
	@echo "$(BLUE)Type checking backend...$(NC)"
	cd backend && npm run type-check

# Build
build: ## Build all applications for production
	@echo "$(BLUE)Building frontend...$(NC)"
	cd frontend && npm run build
	@echo "$(BLUE)Building backend...$(NC)"
	cd backend && npm run build
	@echo "$(GREEN)✓ Build complete$(NC)"

build-frontend: ## Build frontend only
	cd frontend && npm run build

build-backend: ## Build backend only
	cd backend && npm run build

# Docker
docker-build: ## Build Docker images
	docker-compose build

docker-up: ## Start Docker containers
	docker-compose up -d

docker-down: ## Stop Docker containers
	docker-compose down

docker-logs: ## View Docker container logs
	docker-compose logs -f

docker-clean: ## Remove all Docker containers and volumes
	@echo "$(RED)WARNING: This will remove all containers and volumes!$(NC)"
	@read -p "Are you sure? [y/N] " confirm && [ $$confirm = y ] && docker-compose down -v --rmi all || echo "Cancelled"

# Deployment
deploy-staging: ## Deploy to staging environment
	@echo "$(BLUE)Deploying to staging...$(NC)"
	./infra/scripts/deploy-staging.sh

deploy-prod: ## Deploy to production environment
	@echo "$(YELLOW)Deploying to PRODUCTION...$(NC)"
	@read -p "Are you sure? [y/N] " confirm && [ $$confirm = y ] && ./infra/scripts/deploy-production.sh || echo "Cancelled"

# Infrastructure
infra-init: ## Initialize Terraform
	cd infra/terraform && terraform init

infra-plan: ## Plan Terraform changes
	cd infra/terraform && terraform plan

infra-apply: ## Apply Terraform changes
	@echo "$(YELLOW)Applying Terraform changes...$(NC)"
	cd infra/terraform && terraform apply

# Utilities
clean: ## Clean build artifacts and dependencies
	@echo "$(BLUE)Cleaning...$(NC)"
	rm -rf frontend/dist frontend/node_modules
	rm -rf backend/dist backend/node_modules
	rm -rf node_modules
	@echo "$(GREEN)✓ Clean complete$(NC)"

update-deps: ## Update all dependencies
	@echo "$(BLUE)Updating frontend dependencies...$(NC)"
	cd frontend && ncu -u && npm install
	@echo "$(BLUE)Updating backend dependencies...$(NC)"
	cd backend && ncu -u && npm install

security-audit: ## Run security audit
	@echo "$(BLUE)Running security audit...$(NC)"
	cd frontend && npm audit
	cd backend && npm audit

# Git hooks
setup-hooks: ## Setup Git hooks
	@echo "$(BLUE)Setting up Git hooks...$(NC)"
	cp .githooks/pre-commit .git/hooks/pre-commit
	chmod +x .git/hooks/pre-commit
	@echo "$(GREEN)✓ Git hooks installed$(NC)"

# Health check
health: ## Check service health
	@echo "$(BLUE)Checking service health...$(NC)"
	@curl -s http://localhost:3001/health | jq . || echo "$(RED)Backend not responding$(NC)"
	@curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 | grep -q "200\|301" && echo "$(GREEN)✓ Frontend responding$(NC)" || echo "$(RED)Frontend not responding$(NC)"
