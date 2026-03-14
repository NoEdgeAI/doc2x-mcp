# Changelog

All notable changes to this project will be documented in this file.

## [0.1.4] - Unreleased

- feat: add project icon (`icon.png`)
- chore: upgrade `@modelcontextprotocol/sdk` to fix vulnerabilities
- feat: add display page support

## [0.1.3] - 2026-02-28

- feat: add v3-2026 parse model support (`doc2x_parse_pdf_submit`, `doc2x_parse_pdf_wait_text`)
- feat: add `doc2x_materialize_pdf_layout_json` tool for v3 layout JSON materialization
- feat: restructure source packages for better maintainability
- fix: support explicit `v2` parse model parameter

## [0.1.2] - 2026-01-19

- feat: add Skill installation scripts (Bash, PowerShell 7+, Windows PowerShell 5.1)
- fix: install skill shell script issues
- fix: update skill installation category from `local` to `public`
- fix: restrict `doc2x_parse_pdf_status` response to status fields only
- chore: streamline CI workflow

## [0.1.1] - 2026-01-17

- feat: cap parse output via `DOC2X_PARSE_PDF_MAX_OUTPUT_CHARS` and `DOC2X_PARSE_PDF_MAX_OUTPUT_PAGES`
- feat: improve developer ergonomics for MCP tools
- ci: set up GitHub Actions publish and build workflows

## [0.1.0] - Initial release

- feat: initial Doc2x MCP server implementation
- feat: PDF parse tools (`submit` / `status` / `wait_text`)
- feat: export tools (`submit` / `result` / `wait`)
- feat: image layout parse tools (sync / async)
- feat: download tools (`download_url_to_file`, `materialize_convert_zip`)
- feat: `doc2x_debug_config` diagnostics tool