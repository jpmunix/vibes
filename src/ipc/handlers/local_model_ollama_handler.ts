import log from "electron-log";
import { createTypedHandler } from "./base";
import { languageModelContracts } from "../types/language-model";
import type { LocalModel } from "../types/language-model";
import { readSettings } from "../../main/settings";

const logger = log.scope("ollama_handler");

export function parseOllamaHost(host?: string): string {
  if (!host) {
    return "http://localhost:11434";
  }

  // If it already has a protocol, use as-is
  if (host.startsWith("http://") || host.startsWith("https://")) {
    return host;
  }

  // Check for bracketed IPv6 with port: [::1]:8080
  if (host.startsWith("[") && host.includes("]:")) {
    return `http://${host}`;
  }

  // Check for regular host:port (but not plain IPv6)
  if (
    host.includes(":") &&
    !host.includes("::") &&
    host.split(":").length === 2
  ) {
    return `http://${host}`;
  }

  // Check if it's a plain IPv6 address (contains :: or multiple colons)
  if (host.includes("::") || host.split(":").length > 2) {
    return `http://[${host}]:11434`;
  }

  // If it's just a hostname, add default port
  return `http://${host}:11434`;
}

/**
 * Get the Ollama API URL. Priority:
 * 1. User setting (ollamaBaseUrl) — configurable from Settings UI
 * 2. OLLAMA_HOST env var — classic CLI override
 * 3. Default: http://localhost:11434
 */
export function getOllamaApiUrl(): string {
  const settings = readSettings();
  const fromSettings = (settings as any).ollamaBaseUrl;
  if (fromSettings && typeof fromSettings === "string" && fromSettings.trim()) {
    return fromSettings.replace(/\/+$/, "");
  }
  return parseOllamaHost(process.env.OLLAMA_HOST);
}

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export async function fetchOllamaModels(): Promise<{ models: LocalModel[] }> {
  const settings = readSettings();
  if (settings.ollamaEnabled === false) {
    return { models: [] };
  }

  try {
    const response = await fetch(`${getOllamaApiUrl()}/api/tags`);
    if (!response.ok) {
      throw new Error(`Failed to fetch model: ${response.statusText}`);
    }

    const data = await response.json();
    const ollamaModels: OllamaModel[] = data.models || [];

    const models: LocalModel[] = ollamaModels.map((model: OllamaModel) => {
      const parts = model.name.split(":");
      const baseName = parts[0]
        .replace(/-/g, " ")
        .replace(/(\d+)/, " $1 ")
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
        .trim();
      const tag = parts.slice(1).join(":");
      const displayName = tag ? `${baseName} (${tag})` : baseName;

      return {
        modelName: model.name,
        displayName,
        provider: "ollama",
      };
    });
    logger.info(`Successfully fetched ${models.length} models from Ollama`);
    return { models };
  } catch (error) {
    // Silently return empty list when Ollama is not available
    // This is expected behavior when users don't have Ollama installed/running
    if (
      error instanceof TypeError &&
      (error as Error).message.includes("fetch failed")
    ) {
      logger.debug(
        "Ollama not available at",
        getOllamaApiUrl(),
        "- returning empty model list",
      );
      return { models: [] };
    }
    logger.warn("Failed to fetch models from Ollama:", error);
    return { models: [] };
  }
}

/**
 * Check if the Ollama server is reachable and count available models.
 * Used by the Settings UI to show connection status.
 */
export async function checkOllamaStatus(): Promise<{ online: boolean; modelCount: number; url: string }> {
  const url = getOllamaApiUrl();
  const settings = readSettings();
  if (settings.ollamaEnabled === false) {
    return { online: false, modelCount: 0, url };
  }

  try {
    const response = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return { online: false, modelCount: 0, url };
    const data = await response.json();
    const modelCount = Array.isArray(data.models) ? data.models.length : 0;
    return { online: true, modelCount, url };
  } catch {
    return { online: false, modelCount: 0, url };
  }
}

export function registerOllamaHandlers() {
  createTypedHandler(languageModelContracts.listOllamaModels, async () => {
    return fetchOllamaModels();
  });

  createTypedHandler(languageModelContracts.checkOllamaStatus, async () => {
    return checkOllamaStatus();
  });
}
