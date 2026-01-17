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
