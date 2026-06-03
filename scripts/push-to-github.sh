#!/usr/bin/env bash
# Diagnose and push main to GitHub (run in your own terminal, not the agent sandbox).
set -euo pipefail

LOG_PATH="$(cd "$(dirname "$0")/.." && pwd)/.cursor/debug-38f49b.log"
SESSION_ID="38f49b"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

log() {
  local msg=$1
  local data=${2:-{}}
  printf '{"sessionId":"%s","hypothesisId":"git-push","location":"scripts/push-to-github.sh","message":"%s","data":%s,"timestamp":%s}\n' \
    "$SESSION_ID" "$msg" "$data" "$(($(date +%s) * 1000))" >> "$LOG_PATH"
}

branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "unknown")
ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo "?")
remote=$(git remote get-url origin 2>/dev/null || echo "none")
has_gh=$(command -v gh >/dev/null && echo true || echo false)
has_ssh=$(test -f "$HOME/.ssh/id_ed25519" -o -f "$HOME/.ssh/id_rsa" && echo true || echo false)

log "pre-push diagnostics" "{\"branch\":\"$branch\",\"ahead\":$ahead,\"remote\":\"$remote\",\"has_gh\":$has_gh,\"has_ssh\":$has_ssh}"

if [[ "$branch" != "main" ]]; then
  echo "On branch '$branch'. Checkout main first: git checkout main"
  exit 1
fi

if [[ "$ahead" == "0" ]]; then
  echo "Already up to date with origin/main."
  log "nothing to push" "{}"
  exit 0
fi

echo "Pushing $ahead commit(s) to origin/main..."
if git push origin main; then
  log "push succeeded" "{\"ahead\":$ahead}"
  echo "Done. GitHub and Vercel workflows should run shortly."
  exit 0
fi

log "push failed" "{\"hint\":\"authenticate with gh auth login or SSH\"}"
echo ""
echo "Push failed — GitHub credentials are not available."
echo "Fix (pick one):"
echo "  1. gh auth login && git push origin main"
echo "  2. Add SSH key to GitHub, then:"
echo "     git remote set-url origin git@github.com:vikramravi173-cyber/DoD-Legislative-Tracker.git"
echo "     git push origin main"
exit 1
