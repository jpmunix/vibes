import { ComponentSelection, ElementType, VisualEditingChange } from "@/ipc/types";
import { atom } from "jotai";

export const selectedComponentsPreviewAtom = atom<ComponentSelection[]>([]);

export const visualEditingSelectedComponentAtom =
  atom<ComponentSelection | null>(null);

export const currentComponentCoordinatesAtom = atom<{
  top: number;
  left: number;
  width: number;
  height: number;
} | null>(null);

export const previewIframeRefAtom = atom<HTMLIFrameElement | null>(null);

export const annotatorModeAtom = atom<boolean>(false);

export const screenshotDataUrlAtom = atom<string | null>(null);
export const pendingVisualChangesAtom = atom<Map<string, VisualEditingChange>>(
  new Map(),
);

export const isDynamicComponentAtom = atom<boolean>(false);

export const hasStaticTextAtom = atom<boolean>(false);

export const elementTypeAtom = atom<ElementType>("unknown");

export const naturalEditingPanelOpenAtom = atom<boolean>(false);

export const isMakingPrettierAtom = atom<boolean>(false);

export const iconSelectorOpenAtom = atom<boolean>(false);

export const currentIconNameAtom = atom<string | null>(null);

export const iconLineAtom = atom<number | null>(null);

export const componentTextContentAtom = atom<string>("");
