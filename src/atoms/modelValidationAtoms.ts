import { atom } from "jotai";

/**
 * Slot de modelo inválido detectado por el validador de arranque (card #242).
 *
 * ⚠️ El backend NO manda texto traducido: manda `labelKey` (+ `labelParams`)
 * y la carcasa traduce. Ver la frontera P1 en `model_validator.ts`.
 */
export interface InvalidModelSlot {
  slotKey: string;
  /** Clave i18n del nombre visible del slot. */
  labelKey: string;
  /** Parámetros de interpolación de `labelKey` (p. ej. nombre del agente). */
  labelParams?: Record<string, string>;
  currentValue: string;
  providerId: string;
  modelName: string;
  reason:
    | "provider_missing"
    | "provider_disabled"
    | "model_not_found"
    | "model_unspecified";
}

export const invalidModelSlotsAtom = atom<InvalidModelSlot[]>([]);

export const hasInvalidModelSlotsAtom = atom<boolean>((get) => {
  return get(invalidModelSlotsAtom).length > 0;
});

/** Firma determinista de la combinación actual de slots rotos */
export function getInvalidSlotsSignature(slots: InvalidModelSlot[]): string {
  return slots
    .map((s) => `${s.slotKey}:${s.reason}:${s.currentValue}`)
    .sort()
    .join("|");
}

/** Controla si el diálogo de reasignación / configuración está abierto */
export const modelFixDialogOpenAtom = atom<boolean>(false);

/** Firma del conjunto de slots inválidos descartado por el usuario en prefs */
export const dismissedBannerSignatureAtom = atom<string | null>(null);

/** Si el banner debe mostrarse: hay slots rotos, el diálogo no está abierto y la firma no fue descartada */
export const showModelFixBannerAtom = atom<boolean>((get) => {
  const slots = get(invalidModelSlotsAtom);
  if (slots.length === 0) return false;
  if (get(modelFixDialogOpenAtom)) return false;
  const dismissedSig = get(dismissedBannerSignatureAtom);
  const currentSig = getInvalidSlotsSignature(slots);
  return dismissedSig !== currentSig;
});

/** Sección de /settings a la que hacer scroll y highlight (ej: 'models-connectivity') */
export const settingsFocusSectionAtom = atom<string | null>(null);

