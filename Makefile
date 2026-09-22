.PHONY: help install db-reset seed bootstrap demo run worker test lint rules eval calibrate check

VENV ?= .venv
PY   := $(VENV)/bin/python
PIP  := $(VENV)/bin/pip

help:
	@grep -E '^[a-z-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## ساخت virtualenv و نصب وابستگی‌ها
	python3 -m venv $(VENV) && $(PIP) install -q -r requirements-dev.txt

db-reset: ## اجرای مهاجرت‌ها از صفر روی دیتابیس توسعه
	psql -v ON_ERROR_STOP=1 "$${DAADNO_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/daadno}" \
	  -f db/001_schema.sql -f db/002_search.sql -f db/003_app.sql

seed: ## لود دادهٔ اولیه (idempotent) و ساخت چانک‌ها
	$(PY) scripts/load_seed.py --reindex

bootstrap: ## کاربران کارمند، تعطیلات و مراجع نمونه
	$(PY) scripts/bootstrap_dev.py

demo: seed bootstrap ## دموی محلی: کاتالوگ به صورت ساختگی approve می‌شود
	$(PY) scripts/bootstrap_dev.py --approve-catalog

run: ## بالا آوردن API و صفحات SSR
	$(VENV)/bin/uvicorn daadno.app:app --reload --app-dir src --port 8000

worker: ## ورکر بازایندکس و یادآور
	$(PY) scripts/run_workers.py --interval 30

test: ## اجرای تست‌ها
	$(PY) -m pytest -q

lint: ## ruff
	$(VENV)/bin/ruff check src scripts tests
	$(VENV)/bin/ruff format --check src scripts tests

rules: ## بررسی قواعد مهندسی (T-006)
	$(PY) scripts/check_engineering_rules.py --strict

eval: ## اجرای مجموعهٔ طلایی (T-105)
	$(PY) scripts/run_eval.py

calibrate: ## کالیبراسیون دروازهٔ pre-flight
	$(PY) scripts/calibrate_thresholds.py

check: rules lint test ## هرچه CI اجرا می‌کند
