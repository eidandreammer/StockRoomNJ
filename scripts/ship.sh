#!/usr/bin/env bash
set -euo pipefail

echo "Current changes:"
git status --short

read -rp "Commit message (blank = speedrun): " msg
msg=${msg:-speedrun}

git add -A

if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git commit -m "$msg"
  git push
fi

npm run deploy
