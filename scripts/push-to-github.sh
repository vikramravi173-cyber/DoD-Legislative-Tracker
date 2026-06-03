#!/usr/bin/env bash
# Diagnose and push main to GitHub. Run in Cursor's integrated terminal after auth is set up.
set -euo pipefail

LOG_PATH="$(cd "$(dirname "$0")/.." && pwd)/.cursor/debug-38f49b.log"
SESSION_ID="38f49b"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

log() {
  local msg=$1
  local hypothesis_id=${2:-git-push}
  local data=${3:-\{\}}
  printf '%s\n' "{\"sessionId\":\"$SESSION_ID\",\"hypothesisId\":\"$hypothesis_id\",\"location\":\"scripts/push-to-github.sh\",\"message\":\"$msg\",\"data\":$data,\"timestamp\":$(($(date +%s) * 1000))}" >> "$LOG_PATH"
}

# Optional: GITHUB_TOKEN in .env (never logged)
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "unknown")
ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo "0")
has_gh=false
has_ssh=false
has_token=false
gh_authed=false

command -v gh >/dev/null && has_gh=true
test -f "$HOME/.ssh/id_ed25519" -o -f "$HOME/.ssh/id_rsa" && has_ssh=true
[[ -n "${GITHUB_TOKEN:-}" ]] && has_token=true
if $has_gh && gh auth status >/dev/null 2>&1; then
  gh_authed=true
fi

log "pre-push diagnostics" "git-push" "{\"branch\":\"$branch\",\"ahead\":$ahead,\"has_gh\":$has_gh,\"gh_authed\":$gh_authed,\"has_ssh\":$has_ssh,\"has_token\":$has_token}"

if [[ "$branch" != "main" ]]; then
  echo "On branch '$branch'. Checkout main: git checkout main"
  exit 1
fi

if [[ "$ahead" == "0" ]]; then
  echo "Already up to date with origin/main."
  log "nothing to push" "git-push" "{}"
  exit 0
fi

push_with_token() {
  if ! $has_token; then
    return 1
  fi
  log "attempt token push" "H-token" "{}"
  git push "https://x-access-token:${GITHUB_TOKEN}@github.com/vikramravi173-cyber/DoD-Legislative-Tracker.git" main
}

push_with_gh() {
  if ! $gh_authed; then
    return 1
  fi
  log "attempt gh credential push" "H-gh" "{}"
  gh auth setup-git >/dev/null 2>&1 || true
  git push origin main
}

push_with_ssh() {
  if ! $has_ssh; then
    return 1
  fi
  log "attempt ssh push" "H-ssh" "{}"
  git remote set-url origin git@github.com:vikramravi173-cyber/DoD-Legislative-Tracker.git
  git push origin main
}

push_default() {
  log "attempt default push" "H-https" "{}"
  git push origin main
}

echo "Pushing $ahead commit(s) to origin/main..."

if push_with_gh || push_with_token || push_with_ssh || push_default; then
  log "push succeeded" "git-push" "{\"ahead\":$ahead}"
  echo "Done. GitHub and Vercel workflows should run shortly."
  exit 0
fi

log "push failed" "git-push" "{\"has_gh\":$has_gh,\"gh_authed\":$gh_authed,\"has_ssh\":$has_ssh,\"has_token\":$has_token}"
echo ""
echo "Push failed — set up GitHub auth, then run this script again:"
echo ""
echo "  Option A (recommended):"
echo "    brew install gh"
echo "    gh auth login"
echo "    gh auth setup-git"
echo "    ./scripts/push-to-github.sh"
echo ""
echo "  Option B — add to .env (gitignored):"
echo "    GITHUB_TOKEN=ghp_your_personal_access_token"
echo "    ./scripts/push-to-github.sh"
echo ""
echo "  Option C — SSH:"
echo "    ssh-keygen -t ed25519 -C \"your@email.com\""
echo "    # Add public key at https://github.com/settings/keys"
echo "    ./scripts/push-to-github.sh"
exit 1
