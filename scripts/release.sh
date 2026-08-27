#!/usr/bin/env bash
# Bump version, run checks, publish to npm, and push the release commit + tag.
#
# Usage:
#   ./scripts/release.sh          # patch (0.1.2 → 0.1.3)
#   ./scripts/release.sh minor
#   ./scripts/release.sh 1.2.3    # explicit version
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LEVEL="${1:-patch}"

if [[ "$LEVEL" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]]; then
  NEW_VERSION="$LEVEL"
  npm version "$NEW_VERSION" --no-git-tag-version
  git add package.json
  git commit -m "chore: release v${NEW_VERSION}"
  git tag "v${NEW_VERSION}"
else
  npm version "$LEVEL" -m "chore: release v%s"
  NEW_VERSION="$(node -p "require('./package.json').version")"
fi

echo "Releasing @hanxu131/dsh-autotitle@${NEW_VERSION} ..."
npm publish

git push
git push origin "v${NEW_VERSION}"

echo "Published @hanxu131/dsh-autotitle@${NEW_VERSION}"
echo "Install: dsh plugin --profile <name> update @hanxu131/dsh-autotitle"
