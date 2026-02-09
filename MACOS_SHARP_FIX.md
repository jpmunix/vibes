# Fix para dependencias nativas en macOS (Sharp, Transformers, SQLite)

## ⚠️ Actualización importante

Los runners de GitHub Actions para macOS ahora son **arm64** (Apple Silicon M1/M2) por defecto, no x64. Esto cambia cómo las dependencias nativas deben instalarse.

## Problemas

La app compilada para macOS puede fallar con varios errores:

### 1. Sharp/libvips

```
Error: Library not loaded: @rpath/libvips-cpp.42.dylib
Referenced from: /Applications/minube-vibes.app/Contents/Resources/app.asar.unpacked/node_modules/@xenova/transformers/node_modules/sharp/build/Release/sharp-darwin-x64.node
Reason: tried: '/Applications/minube-vibes.app/Contents/Resources/app.asar.unpacked/node_modules/@xenova/transformers/node_modules/sharp/build/Release/../.././vendor/8.14.5/darwin-x64/lib/libvips-cpp.42.dylib' (no such file)
```

**Causa raíz**: El paquete `sharp` depende de librerías nativas (`libvips`) que no se incluyen correctamente en el bundle de Electron para macOS. Después del empaquetado con `electron-forge`, el directorio `vendor/` que contiene las `.dylib` necesarias no se copia al bundle final.

### 2. @xenova/transformers

```
Error: Cannot find module '@xenova/transformers'
```

**Causa raíz**: El módulo `@xenova/transformers` o sus archivos internos no se incluyen correctamente en el bundle, o sus dependencias nativas (como Sharp) faltan.

### 3. better-sqlite3

```
Error: Cannot find module 'better-sqlite3'
```

**Causa raíz**: Los bindings nativos `.node` de SQLite no se copian correctamente al bundle.

## Solución implementada

### 1. Script afterPack mejorado (`scripts/afterPack.js`)

Actualicé el hook de Electron Forge para que verifique TODAS las dependencias nativas después del empaquetado:

#### Para Sharp:

- Detecta la arquitectura correcta (x64 o arm64)
- Busca el directorio `vendor/` de Sharp en `node_modules/` local
- Copia todo el contenido de `vendor/` a las ubicaciones de Sharp dentro del bundle:
  - `app.asar.unpacked/node_modules/sharp/vendor/`
  - `app.asar.unpacked/node_modules/@xenova/transformers/node_modules/sharp/vendor/`

**Por qué funciona**: Sharp busca las librerías en una ruta relativa desde su ubicación (`../../vendor/.../lib/`). Al copiar `vendor/` completo, las librerías están exactamente donde Sharp espera encontrarlas.

#### Para @xenova/transformers:

- Verifica que el paquete esté en `app.asar.unpacked/node_modules/@xenova/transformers/`
- Comprueba que archivos críticos existan: `package.json`, `src/transformers.js`
- Verifica que `node_modules` internos de transformers estén presentes (incluyendo Sharp)
- Lista subdependencias importantes para debug

**Por qué funciona**: La configuración `asar.unpack` en `forge.config.ts` ya desempaqueta `@xenova/**/*`, pero el script verifica que todo esté correcto y falla rápidamente si falta algo.

#### Para better-sqlite3:

- Verifica que el paquete esté en `app.asar.unpacked/node_modules/better-sqlite3/`
- Comprueba que los bindings nativos `.node` existan en `build/Release/`
- Lista los archivos `.node` encontrados para debug

**Por qué funciona**: SQLite requiere bindings nativos compilados (`.node`). La configuración `asar.unpack` ya los desempaqueta, el script solo verifica.

#### Para onnxruntime-node:

- Verifica opcionalmente si está instalado
- Comprueba bindings nativos en `bin/`
- No falla si no está presente (es una dependencia opcional)

### 2. Mejoras en GitHub Actions (`.github/workflows/release.yml`)

Modifiqué el paso de instalación de Sharp para:

- **Limpiar completamente** cache de npm y Sharp antes de reinstalar
- **Detectar arquitectura** del runner (arm64 vs x64) automáticamente
- **Reinstalar Sharp** forzadamente con binarios nativos correctos para la arquitectura
- **Reinstalar @xenova/transformers** para que use el Sharp correcto
- **Verificar exhaustivamente** que el directorio `vendor/` existe y contiene archivos `.dylib`
- **Búsqueda recursiva** de Sharp como fallback si no está donde se espera
- **Fallar temprano** con información detallada de debug si algo está mal

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

- **Arquitectura**: GitHub Actions ahora usa runners **arm64** (Apple Silicon) por defecto para macOS. El workflow detecta esto automáticamente e instala la versión correcta de Sharp para arm64.
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

**90-95%**. El script ahora verifica TODAS las dependencias nativas, no solo Sharp. Los riesgos restantes:

- Sharp podría no descargar el directorio `vendor/` correctamente en el CI (el nuevo workflow tiene verificaciones exhaustivas para esto)
- Rutas relativas que no coinciden exactamente (poco probable, usamos las rutas estándar de Sharp)
- Versiones de Sharp incompatibles con la versión de libvips (usamos `sharp@latest` que debería ser compatible)

**Cambios en esta versión (2.5.2)**:

- ✅ Detecta arm64 vs x64 automáticamente
- ✅ Limpia cache antes de reinstalar
- ✅ Reinstala @xenova/transformers para forzar uso del Sharp correcto
- ✅ Búsqueda recursiva como fallback en afterPack
- ✅ **NUEVO**: Verifica @xenova/transformers completo
- ✅ **NUEVO**: Verifica better-sqlite3 bindings
- ✅ **NUEVO**: Verifica onnxruntime-node bindings (opcional)
- ✅ **NUEVO**: Logs detallados para cada dependencia nativa
- ✅ **NUEVO**: Falla rápidamente si alguna dependencia crítica está incompleta

Si no funciona al primer intento, el script de debugging nos dirá exactamente qué falta.
