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
