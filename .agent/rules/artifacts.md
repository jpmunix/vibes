# Artifacts — naming, ciclo de vida e inventario de features

> **CUÁNDO LEER ESTO:** Al crear cualquier artifact (plan, walkthrough, análisis) o al cerrar una slice en verde.
>
> **ESENCIA (si no lees más):** Los artifacts atados a una card se nombran `<tipo>-vibes-<cardNumber>.md` (`cardNumber` = `idShort` de Trello). Son borradores de trabajo: al terminar se suben a la card con `attach-file.mjs` y se eliminan del working tree — Trello es su destino final. Cada feature cerrada en verde se anota en el inventario (`feature_inventory.md`) con bullets verificables.

## Nombrado por card de Trello

Cuando un plan o walkthrough está atado a una card del board de Trello, el artifact se nombra `<tipo>-vibes-<cardNumber>.md`, donde `cardNumber` es el `idShort` que Trello expone (el número mostrado por el power-up como `#VIBES-92` → `92`).

- Tipo `plan` → para plans (`implementation_plan.md`).
- Tipo `walkthrough` → para walkthroughs (`walkthrough.md`).
- Ejemplos: `plan-vibes-92.md`, `walkthrough-vibes-92.md`.
- Si la card no tiene número claro, **preguntar antes** de crear el artifact. Si munix dice que no hay card, se crea un artifact normal sin sufijo.

El `cardNumber` es el `idShort`, visible en la salida de `node scripts/trello/list-cards.mjs --light` (cada card lleva su `idShort`). Si necesitas confirmarlo con detalle, redirige a fichero tmp:

```bash
node scripts/trello/list-cards.mjs --number <N> --detail > /tmp/card-<N>.json
```

y léelo con `view_file`. **Nunca pipes a `jq` ni `python`** (se trunca el output y produce parse errors — ver `trello-workflow.md`). También está `resolveCard` en `scripts/trello/lib.mjs`.

## Ciclo de vida del artifact de plan (convención)

> [!IMPORTANT]
> 1. **Mientras se pelotea la tarea**, el agente crea el plan como **artifact** (`<tipo>-vibes-<cardNumber>.md`), NO como documento del repo. Vive en el directorio de artifacts del agente (p. ej. `brain/<conversation-id>/`), fuera del working tree. Es un borrador de trabajo que puede iterarse con munix.
> 2. **Al terminar la tarea** (dejar el comentario `✅ [Review]` con evidencia; la card NO se mueve a `Review`, eso lo hace solo munix), el artifact se **sube como adjunto a la card**:
>    ```bash
>    node scripts/trello/attach-file.mjs --card "Título" --file "<ruta-del-artifact>/plan-vibes-NN.md"
>    ```
> 3. **Tras subirlo, se elimina** del working tree. El plan ya no vive en el repo: su destino final es Trello (la fuente de verdad).
> 4. El board de Trello es el **único** lugar donde persisten los planes. No se acumulan artifacts de planes terminados en el repo.

Los artifacts se suben **sin intervención del usuario**: si se generaron durante la tarea, se adjuntan (AGENTS.md §1.10.8). Límite 10 MB por fichero (API de Trello); si se excede, se avisa en el comentario (nunca se omite en silencio). El código fuente no se sube al board (vive en el repo); solo se adjunta si es evidencia relevante.

## Inventario de features listas para probar

Cada feature cerrada en verde se anota en el artifact de inventario (`feature_inventory.md`, ver AGENTS.md §1.9):

- **Formato:** bullets cortos, una línea por bullet. Sin prosa larga ni párrafos descriptivos.
- Cada bullet = **una acción verificable** ("pulsar X", "verificar Y", "esperar Z").
- Si la feature se subdivide en sub-slices (Slice 3.8 → 3.8.1/3.8.2/...) → agrupar visualmente con el mismo nivel de indentación.
- Si un bullet cambia de comportamiento (regresión, fix) → **actualizar el bullet** en lugar de añadir uno nuevo con "(fix)".
- Sección final **"Próximo test flight"** con los 5-10 bullets más críticos para probar primero.

Si el artifact no se actualiza con cada slice, perdemos el rastro de qué testear primero: munix necesita tener siempre a la vista qué se puede probar sin releer el walkthrough entero.

## Checklist de cumplimiento

- [ ] ¿El artifact lleva sufijo `-vibes-<idShort>` si está atado a una card?
- [ ] ¿Confirmé el `idShort` con `list-cards` antes de nombrar (sin asumir)?
- [ ] Al cerrar la tarea: ¿subí el artifact a la card con `attach-file.mjs`?
- [ ] ¿Eliminé el artifact del working tree tras subirlo?
- [ ] Si cerré una feature en verde: ¿actualicé el inventario con bullets verificables?
