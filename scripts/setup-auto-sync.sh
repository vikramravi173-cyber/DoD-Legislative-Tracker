#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

chmod +x .cursor/hooks/sync-github.sh
chmod +x .githooks/post-commit

git config core.hooksPath .githooks

echo "Auto-sync enabled:"
echo "  - Cursor: pushes after each agent session (.cursor/hooks.json)"
echo "  - Git: pushes after each commit on main (.githooks/post-commit)"
echo ""
echo "Ensure GitHub auth works: git push origin main"
