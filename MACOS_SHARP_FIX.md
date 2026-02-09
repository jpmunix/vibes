# Fix para Sharp/libvips en macOS

## Problema

La app compilada para macOS falla al iniciar con este error:

```
Error: Library not loaded: @rpath/libvips-cpp.42.dylib
Referenced from: /Applications/minube-vibes.app/Contents/Resources/app.asar.unpacked/node_modules/@xenova/transformers/node_modules/sharp/build/Release/sharp-darwin-x64.node
Reason: tried: '/Applications/minube-vibes.app/Contents/Resources/app.asar.unpacked/node_modules/@xenova/transformers/node_modules/sharp/build/Release/../.././vendor/8.14.5/darwin-x64/lib/libvips-cpp.42.dylib' (no such file)
```

**Causa raíz**: El paquete `sharp` depende de librerías nativas (`libvips`) que no se incluyen correctamente en el bundle de Electron para macOS. Después del empaquetado con `electron-forge`, el directorio `vendor/` que contiene las `.dylib` necesarias no se copia al bundle final.

## Solución implementada

### 1. Script afterPack (`scripts/afterPack.js`)

Creé un hook de Electron Forge que se ejecuta después del empaquetado y:

- Detecta la arquitectura correcta (x64 o arm64)
- Busca el directorio `vendor/` de Sharp en `node_modules/` local
- Copia todo el contenido de `vendor/` a las ubicaciones de Sharp dentro del bundle:
  - `app.asar.unpacked/node_modules/sharp/vendor/`
  - `app.asar.unpacked/node_modules/@xenova/transformers/node_modules/sharp/vendor/`

**Por qué funciona**: Sharp busca las librerías en una ruta relativa desde su ubicación (`../../vendor/.../lib/`). Al copiar `vendor/` completo, las librerías están exactamente donde Sharp espera encontrarlas.

### 2. Mejoras en GitHub Actions (`.github/workflows/release.yml`)

Modifiqué el paso de instalación de Sharp para:

- Reinstalar Sharp con `--foreground-scripts` (asegura descarga de binarios nativos)
- Verificar que el directorio `vendor/` existe y contiene archivos `.dylib`
- Fallar temprano si algo está mal, antes de perder tiempo compilando

### 3. Simplificación de scripts npm

Eliminé el script complejo `install:mac-deps` que intentaba instalar paquetes `@img/sharp-*` manualmente. Ahora todo se maneja automáticamente durante el build.

## Cómo probar

### Si tienes acceso a un Mac

1. Haz un build local:

   ```bash
   npm run make:mac
   ```

2. La app se genera en `out/make/zip/darwin/x64/`

3. Descomprímela e instálala en `/Applications/`

4. Abre la app normalmente

5. Si falla, ejecuta el script de debugging:

   ```bash
   bash scripts/debug-sharp-macos.sh > debug-output.txt
   ```

   Y envíame el archivo `debug-output.txt`

### Desde GitHub Actions

1. Push de estos cambios al repo
2. Ejecuta el workflow "Create Release (Linux & Mac)"
3. Descarga el `.zip` generado
4. Prueba la app en un Mac

## Archivos modificados

- ✅ `forge.config.ts` - Añadido hook `afterPack`
- ✅ `scripts/afterPack.js` - Nuevo script que copia librerías nativas
- ✅ `.github/workflows/release.yml` - Mejorado paso de instalación de Sharp
- ✅ `package.json` - Simplificados scripts de build para macOS
- ✅ `scripts/debug-sharp-macos.sh` - Script de debugging (solo para diagnóstico)

## Referencias técnicas

- [Sharp installation docs](https://sharp.pixelplumbing.com/install#cross-platform)
- [Electron-forge afterPack hook](https://www.electronforge.io/config/hooks#packager-hooks)
- Issue similar en @xenova/transformers: https://github.com/xenova/transformers.js/issues/16

## Notas adicionales

- **Arquitectura**: GitHub Actions usa runners x64 por defecto. Si necesitas builds arm64 nativos, tendrías que usar runners M1/M2 (más caros) o hacer cross-compilation (más complejo).
- **Tamaño del bundle**: Las librerías `libvips` añaden ~8-10 MB al bundle final, es normal.
- **Alternativas no intentadas**:
  - Usar `electron-builder` en vez de `electron-forge` (diferentes defaults)
  - Pre-compilar Sharp desde un Mac real
  - Usar Docker con herramientas de cross-compilation para macOS

## Si sigue fallando

1. Ejecuta `scripts/debug-sharp-macos.sh` en el Mac donde falla
2. Verifica en el output:
   - ¿Existe `vendor/` en el bundle?
   - ¿Existen los archivos `.dylib`?
   - ¿Las arquitecturas coinciden (x64 vs arm64)?
3. Comparte el output completo del script

## Confianza de que funciona

**80-90%**. Esta es la solución estándar para problemas de Sharp en Electron. Los riesgos:

- Diferencias entre arquitecturas (runner x64 compilando para app que se ejecuta en arm64)
- Rutas relativas que no coinciden exactamente
- Versiones de Sharp incompatibles con la versión de libvips

Si no funciona al primer intento, el script de debugging nos dirá exactamente qué falta.
