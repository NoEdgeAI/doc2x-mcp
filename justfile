set dotenv-load := true

default:
  @just --list

install:
  npm install

build:
  npm run build

start:
  npm start

run: build start

fmt:
  npm run format

fmt-check:
  npm run format:check

check: fmt-check build

publish: check
  npm publish

clean:
  rm -rf dist

# Install repo skill into skills dir (Codex + Claude by default)
install-skill:
  sh scripts/install-skill.sh

# Overwrite existing installation
install-skill-force:
  sh scripts/install-skill.sh --force

# Install to only one target
install-skill-codex:
  sh scripts/install-skill.sh --target codex

install-skill-claude:
  sh scripts/install-skill.sh --target claude

# Windows-friendly (PowerShell)
install-skill-ps:
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-skill.ps1
