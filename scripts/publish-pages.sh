#!/usr/bin/env bash
# Compila para GitHub Pages y fuerza la rama gh-pages, que es la que sirve el sitio.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
BRANCH="${PAGES_BRANCH:-gh-pages}"
REMOTE="${PAGES_REMOTE_URL:-$(git remote get-url origin)}"

echo "Publicando FLAC Play $VERSION en $BRANCH"

VITE_BASE=/flac-play/ VITE_API_BASE=https://flac-play.onrender.com npm run build

cp dist/index.html dist/404.html
touch dist/.nojekyll

cd dist
git init -q
git symbolic-ref HEAD "refs/heads/$BRANCH"
git add -A
git commit -qm "sitio estático de FLAC Play $VERSION"
git push --force "$REMOTE" "$BRANCH"
