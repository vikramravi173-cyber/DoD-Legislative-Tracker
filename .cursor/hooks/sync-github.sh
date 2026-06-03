#!/usr/bin/env bash
# Push project updates to GitHub after an agent session ends (main branch only).
set -euo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root"

branch=$(git symbolic-ref --short HEAD 2>/dev/null || true)
if [[ "$branch" != "main" ]]; then
  exit 0
fi

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Never commit secrets
if [[ -f .env ]]; then
  git update-index --assume-unchanged .env 2>/dev/null || true
fi

if [[ -n "$(git status --porcelain -- . ':!.env')" ]]; then
  git add -A
  git reset HEAD .env 2>/dev/null || true
  if ! git diff --staged --quiet; then
    git commit -m "Sync project updates from workspace."
  fi
fi

upstream="origin/${branch}"
if git rev-parse "$upstream" >/dev/null 2>&1; then
  ahead=$(git rev-list --count "${upstream}..HEAD" 2>/dev/null || echo 0)
  if [[ "$ahead" -eq 0 ]]; then
    exit 0
  fi
fi

git push origin "$branch" 2>/dev/null || exit 0
