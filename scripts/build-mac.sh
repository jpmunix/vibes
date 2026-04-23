#!/bin/bash
set -euo pipefail

# ─── Build macOS ARM64 release from Linux ─────────────────────────────
# Equivalent to .github/workflows/release-mac.yml but for local execution
# Usage: ./scripts/build-mac.sh [--upload]
#   --upload  Also upload to BunnyCDN and update release.txt

UPLOAD=false
if [ "${1:-}" = "--upload" ]; then
  UPLOAD=true
fi

echo "══════════════════════════════════════════════════"
echo "  🍎 Building macOS ARM64 from Linux"
echo "══════════════════════════════════════════════════"
echo ""

# ─── 1. Clean previous build ─────────────────────────────────────────
echo "🧹 Cleaning previous build..."
npx rimraf out

# ─── 2. Replace dugite git with macOS ARM64 binary ───────────────────
echo ""
echo "🔄 Downloading macOS ARM64 git binary for dugite..."

DUGITE_URL=$(node -p "require('./node_modules/dugite/script/embedded-git.json')['darwin-arm64'].url")
DUGITE_CHECKSUM=$(node -p "require('./node_modules/dugite/script/embedded-git.json')['darwin-arm64'].checksum")

echo "   URL: $DUGITE_URL"

TMPFILE=$(mktemp)
curl -sL "$DUGITE_URL" -o "$TMPFILE"

ACTUAL_CHECKSUM=$(sha256sum "$TMPFILE" | cut -d' ' -f1)
if [ "$ACTUAL_CHECKSUM" != "$DUGITE_CHECKSUM" ]; then
  echo "   ❌ Checksum mismatch! Expected: $DUGITE_CHECKSUM, Got: $ACTUAL_CHECKSUM"
  rm "$TMPFILE"
  exit 1
fi

# Save Linux git to restore later
if [ ! -d "node_modules/dugite/git.linux-backup" ]; then
  cp -r node_modules/dugite/git node_modules/dugite/git.linux-backup
fi

rm -rf node_modules/dugite/git
mkdir -p node_modules/dugite/git
tar -xzf "$TMPFILE" -C node_modules/dugite/git
rm "$TMPFILE"
echo "   ✅ Dugite git → macOS ARM64"

# ─── 3. Replace ripgrep with macOS ARM64 binary ─────────────────────
echo ""
echo "🔄 Downloading macOS ARM64 ripgrep binary..."

RG_VERSION="v15.0.0"
RG_TARGET="aarch64-apple-darwin"
RG_ASSET="ripgrep-${RG_VERSION}-${RG_TARGET}.tar.gz"
RG_URL="https://github.com/microsoft/ripgrep-prebuilt/releases/download/${RG_VERSION}/${RG_ASSET}"

TMPFILE=$(mktemp)
curl -sL "$RG_URL" -o "$TMPFILE"

# Save Linux ripgrep to restore later
if [ ! -d "node_modules/@vscode/ripgrep/bin.linux-backup" ]; then
  cp -r node_modules/@vscode/ripgrep/bin node_modules/@vscode/ripgrep/bin.linux-backup
fi

rm -rf node_modules/@vscode/ripgrep/bin
mkdir -p node_modules/@vscode/ripgrep/bin
tar -xzf "$TMPFILE" -C node_modules/@vscode/ripgrep/bin
rm "$TMPFILE"

if [ -f "node_modules/@vscode/ripgrep/bin/rg" ]; then
  echo "   ✅ Ripgrep → macOS ARM64"
else
  echo "   ❌ Ripgrep binary not found after extraction"
  exit 1
fi

# ─── 4. Build ────────────────────────────────────────────────────────
echo ""
echo "🔨 Building macOS ARM64 app..."
NODE_OPTIONS="--max-old-space-size=6144" npx electron-forge make --platform darwin --arch arm64

# ─── 5. Verify ───────────────────────────────────────────────────────
echo ""
ZIP_FILE=$(find out/make -name "*.zip" | head -1)
if [ -z "$ZIP_FILE" ]; then
  echo "❌ No .zip file found in out/make"
  exit 1
fi
VERSION=$(node -p "require('./package.json').version")
echo "✅ Build completado: $ZIP_FILE ($(du -h "$ZIP_FILE" | cut -f1))"

# ─── 6. Upload (optional) ───────────────────────────────────────────
if [ "$UPLOAD" = true ]; then
  echo ""
  echo "📤 Uploading to BunnyCDN..."

  curl --request PUT \
       --url "https://storage.bunnycdn.com/minube-vibes/mac/${VERSION}.zip" \
       --header "AccessKey: d77a3ad3-1def-4842-b4b2bda55195-7dd9-4647" \
       --header "Content-Type: application/octet-stream" \
       --data-binary @"$ZIP_FILE" \
       --fail --show-error

  echo "   ✅ Subido como ${VERSION}.zip"

  echo -n "$VERSION" | curl --request PUT \
       --url "https://storage.bunnycdn.com/minube-vibes/release.txt" \
       --header "AccessKey: d77a3ad3-1def-4842-b4b2bda55195-7dd9-4647" \
       --header "Content-Type: text/plain" \
       --data-binary @- \
       --fail --show-error

  echo "   ✅ release.txt → ${VERSION}"
fi

# ─── 7. Restore Linux binaries ───────────────────────────────────────
echo ""
echo "🔄 Restaurando binarios de Linux..."

if [ -d "node_modules/dugite/git.linux-backup" ]; then
  rm -rf node_modules/dugite/git
  mv node_modules/dugite/git.linux-backup node_modules/dugite/git
  echo "   ✅ Dugite git → Linux (restaurado)"
fi

if [ -d "node_modules/@vscode/ripgrep/bin.linux-backup" ]; then
  rm -rf node_modules/@vscode/ripgrep/bin
  mv node_modules/@vscode/ripgrep/bin.linux-backup node_modules/@vscode/ripgrep/bin
  echo "   ✅ Ripgrep → Linux (restaurado)"
fi

echo ""
echo "══════════════════════════════════════════════════"
echo "  ✅ Done!"
if [ "$UPLOAD" = true ]; then
  echo "  📦 Versión ${VERSION} subida a BunnyCDN"
else
  echo "  📦 ZIP en: $ZIP_FILE"
  echo "  Para subir: ./scripts/build-mac.sh --upload"
fi
echo "══════════════════════════════════════════════════"
