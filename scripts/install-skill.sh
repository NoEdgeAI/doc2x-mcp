#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Install doc2x-mcp skill into Codex CLI / Claude Code skills directory.

Usage:
  sh install-skill.sh [--target auto|codex|claude] [--force]
  curl -fsSL <URL>/scripts/install-skill.sh | sh

Options:
  --target    auto|codex|claude (default: auto; auto installs to both)
  --category  category under skills root (default: local)
  --name      skill directory name (default: doc2x-mcp)
  --dest      explicit destination directory (overrides target/category/name)
  --force     overwrite if destination exists
  --dry-run   print planned paths only

Env:
  CODEX_HOME            override Codex home (default: ~/.codex)
  CLAUDE_HOME           override Claude home (default: ~/.claude)
  CLAUDE_CODE_HOME      alternative Claude home env
  DOC2X_MCP_RAW_BASE    raw base URL (default: https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/main)
EOF
}

TARGET="auto"
CATEGORY="local"
NAME="doc2x-mcp"
FORCE="0"
DRY_RUN="0"
DEST=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --category)
      CATEGORY="${2:-}"
      shift 2
      ;;
    --name)
      NAME="${2:-}"
      shift 2
      ;;
    --dest)
      DEST="${2:-}"
      shift 2
      ;;
    --force)
      FORCE="1"
      shift 1
      ;;
    --dry-run)
      DRY_RUN="1"
      shift 1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ "$TARGET" != "auto" ] && [ "$TARGET" != "codex" ] && [ "$TARGET" != "claude" ]; then
  echo "Invalid --target: $TARGET (expected auto|codex|claude)" >&2
  exit 1
fi

HOME_DIR="${HOME:-}"
if [ -z "$HOME_DIR" ]; then
  echo "\$HOME is not set" >&2
  exit 1
fi

CODEX_HOME_DIR="${CODEX_HOME:-$HOME_DIR/.codex}"
CLAUDE_HOME_DIR="${CLAUDE_HOME:-${CLAUDE_CODE_HOME:-$HOME_DIR/.claude}}"

CODEX_SKILLS_ROOT="$CODEX_HOME_DIR/skills"
CLAUDE_SKILLS_ROOT="$CLAUDE_HOME_DIR/skills"

pick_skills_roots() {
  if [ "$TARGET" = "codex" ]; then
    printf '%s\n' "$CODEX_SKILLS_ROOT"
    return
  fi
  if [ "$TARGET" = "claude" ]; then
    printf '%s\n' "$CLAUDE_SKILLS_ROOT"
    return
  fi

  printf '%s\n' "$CODEX_SKILLS_ROOT"
  printf '%s\n' "$CLAUDE_SKILLS_ROOT"
}

SKILLS_ROOTS="$(pick_skills_roots)"

RAW_BASE="${DOC2X_MCP_RAW_BASE:-https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/main}"
REMOTE_SKILL_MD_URL="$RAW_BASE/skills/doc2x-mcp/SKILL.md"

LOCAL_SKILL_MD_PATH=""
if [ -f "./skills/doc2x-mcp/SKILL.md" ]; then
  LOCAL_SKILL_MD_PATH="./skills/doc2x-mcp/SKILL.md"
fi

count_lines() {
  echo "$1" | awk 'NF{c++} END{print c+0}'
}

ROOTS_COUNT="$(count_lines "$SKILLS_ROOTS")"
if [ -n "$DEST" ] && [ "$ROOTS_COUNT" -gt 1 ]; then
  echo "--dest cannot be used when installing to multiple targets (auto found both Codex/Claude)." >&2
  exit 1
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "skills_roots=$(echo "$SKILLS_ROOTS" | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  echo "remote_skill_md_url=$REMOTE_SKILL_MD_URL"
  echo "local_skill_md_path=$LOCAL_SKILL_MD_PATH"
  echo "category=$CATEGORY"
  echo "name=$NAME"
  echo "dest=$DEST"
  exit 0
fi

tmp_skill_md=""
tmp_skill_md_is_temp="0"
cleanup() {
  if [ "${tmp_skill_md_is_temp:-0}" = "1" ] && [ -n "${tmp_skill_md:-}" ] && [ -f "$tmp_skill_md" ]; then
    rm -f "$tmp_skill_md"
  fi
}
trap cleanup EXIT INT TERM

prepare_skill_md() {
  if [ -n "$LOCAL_SKILL_MD_PATH" ]; then
    tmp_skill_md="$LOCAL_SKILL_MD_PATH"
    tmp_skill_md_is_temp="0"
    return
  fi
  tmp_skill_md="$(mktemp -t doc2x-mcp-skill.XXXXXX 2>/dev/null || mktemp)"
  tmp_skill_md_is_temp="1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$REMOTE_SKILL_MD_URL" -o "$tmp_skill_md"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -qO "$tmp_skill_md" "$REMOTE_SKILL_MD_URL"
    return
  fi
  echo "Neither curl nor wget found; cannot download SKILL.md" >&2
  exit 1
}

install_to_root() {
  root="$1"
  dest_dir="${DEST:-$root/$CATEGORY/$NAME}"

  if [ -e "$dest_dir" ]; then
    if [ "$FORCE" != "1" ]; then
      echo "Destination already exists: $dest_dir" >&2
      echo "Re-run with --force to overwrite." >&2
      exit 1
    fi
    rm -rf "$dest_dir"
  fi

  mkdir -p "$dest_dir"
  cp "$tmp_skill_md" "$dest_dir/SKILL.md"
  echo "Installed skill to: $dest_dir"
}

prepare_skill_md

while IFS= read -r root; do
  [ -n "$root" ] || continue
  install_to_root "$root"
done <<EOF
$SKILLS_ROOTS
EOF
