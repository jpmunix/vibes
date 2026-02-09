#!/bin/bash

# Script de debugging para Sharp en macOS
# Si la app sigue fallando, pide a tu jefe que ejecute este script
# y te envíe el output completo

echo "==================================="
echo "Sharp/libvips Debugging for macOS"
echo "==================================="
echo ""

APP_PATH="/Applications/minube-vibes.app"

if [ ! -d "$APP_PATH" ]; then
    echo "ERROR: App not found at $APP_PATH"
    exit 1
fi

echo "✓ App found at: $APP_PATH"
echo ""

# 1. Verificar estructura de Sharp en el bundle
echo "1. Checking Sharp locations in bundle..."
echo "-----------------------------------"

RESOURCES="$APP_PATH/Contents/Resources"
ASAR_UNPACKED="$RESOURCES/app.asar.unpacked"

# Sharp principal
SHARP_MAIN="$ASAR_UNPACKED/node_modules/sharp"
echo "Main Sharp: $SHARP_MAIN"
if [ -d "$SHARP_MAIN" ]; then
    echo "  ✓ Exists"
    echo "  Vendor directory:"
    ls -la "$SHARP_MAIN/vendor" 2>/dev/null || echo "  ✗ vendor/ not found"
else
    echo "  ✗ Not found"
fi

echo ""

# Sharp en @xenova/transformers
SHARP_XENOVA="$ASAR_UNPACKED/node_modules/@xenova/transformers/node_modules/sharp"
echo "Xenova Sharp: $SHARP_XENOVA"
if [ -d "$SHARP_XENOVA" ]; then
    echo "  ✓ Exists"
    echo "  Vendor directory:"
    ls -la "$SHARP_XENOVA/vendor" 2>/dev/null || echo "  ✗ vendor/ not found"
else
    echo "  ✗ Not found"
fi

echo ""
echo ""

# 2. Buscar todas las librerías .dylib de libvips
echo "2. Searching for libvips libraries..."
echo "-----------------------------------"
find "$ASAR_UNPACKED" -name "*.dylib" -path "*/sharp/*" 2>/dev/null | while read lib; do
    echo "Found: $lib"
    echo "  Size: $(du -h "$lib" | cut -f1)"
    echo "  Dependencies:"
    otool -L "$lib" 2>/dev/null | grep -E "(libvips|@rpath)" | sed 's/^/    /'
    echo ""
done

echo ""

# 3. Verificar arquitectura de la app y las librerías
echo "3. Architecture check..."
echo "-----------------------------------"
echo "System architecture:"
uname -m

echo ""
echo "App binary architecture:"
lipo -info "$APP_PATH/Contents/MacOS/minube-vibes" 2>/dev/null || echo "Could not read binary"

echo ""
echo "Sharp .node module architecture:"
SHARP_NODE=$(find "$ASAR_UNPACKED" -name "sharp-*.node" | head -1)
if [ -n "$SHARP_NODE" ]; then
    echo "Found: $SHARP_NODE"
    lipo -info "$SHARP_NODE" 2>/dev/null || echo "Could not read architecture"
else
    echo "✗ Sharp .node module not found"
fi

echo ""
echo ""

# 4. Información del sistema
echo "4. System information..."
echo "-----------------------------------"
echo "macOS version:"
sw_vers

echo ""
echo "Homebrew libvips (if installed):"
if command -v brew &> /dev/null; then
    brew list --versions libvips 2>/dev/null || echo "Not installed via Homebrew"
else
    echo "Homebrew not installed"
fi

echo ""
echo ""
echo "==================================="
echo "Debugging complete!"
echo "Please send this entire output"
echo "==================================="
