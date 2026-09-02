import { MODEL_PROVIDER_SEPARATOR } from "../../lib/schemas";

/**
 * Referencia canónica a un modelo: `provider` decide endpoint/credenciales y
 * `model` es exclusivamente el nombre que entiende ese endpoint.
 */
export interface ModelReference {
  provider: string;
  model: string;
}

/**
 * Parsea el formato persistido por los selectores de modelo.
 *
 * El string compuesto solo debe existir en la frontera de settings/IPC. El
 * resto del backend trabaja con `ModelReference`, evitando que referencias
 * como `custom::command-code::xiaomi/mimo-v2.5` terminen en el wire.
 */
export function parseModelReference(
  raw: string,
  fallbackProvider = "openrouter",
): ModelReference | null {
  const value = raw.trim();
  if (!value || value.startsWith(MODEL_PROVIDER_SEPARATOR)) return null;

  if (value.startsWith(`custom${MODEL_PROVIDER_SEPARATOR}`)) {
    const rest = value.slice(`custom${MODEL_PROVIDER_SEPARATOR}`.length);
    const lastSeparator = rest.lastIndexOf(MODEL_PROVIDER_SEPARATOR);

    if (lastSeparator > 0) {
      const providerId = rest.slice(0, lastSeparator).trim();
      const model = rest.slice(lastSeparator + MODEL_PROVIDER_SEPARATOR.length).trim();
      if (!providerId || !model) return null;
      return {
        provider: `custom${MODEL_PROVIDER_SEPARATOR}${providerId}`,
        model,
      };
    }

    // Forma legacy: custom::<model>, sin id de provider concreto.
    return rest.trim() ? { provider: "custom", model: rest.trim() } : null;
  }

  const separator = value.indexOf(MODEL_PROVIDER_SEPARATOR);
  if (separator > 0) {
    const provider = value.slice(0, separator).trim();
    const model = value.slice(separator + MODEL_PROVIDER_SEPARATOR.length).trim();
    return provider && model ? { provider, model } : null;
  }

  return { provider: fallbackProvider, model: value };
}

/** Serializa una referencia al formato compatible que ya guardan los settings. */
export function serializeModelReference(
  reference: ModelReference,
  fallbackProvider = "openrouter",
): string {
  const provider = reference.provider.trim();
  const model = reference.model.trim();
  if (!provider || !model) {
    throw new Error("ModelReference requires non-empty provider and model");
  }
  if (provider === fallbackProvider) return model;
  return `${provider}${MODEL_PROVIDER_SEPARATOR}${model}`;
}
