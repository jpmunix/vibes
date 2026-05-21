export interface FlavorConfig {
  id: string;
  name: string; // Internal/package name
  productName: string; // Visible app name
  executableName: string; // Executable binary name
  iconFolder: string; // Subfolder in assets/
  userDataFolder: string; // Name of the folder in appData
}

export const FLAVORS: Record<string, FlavorConfig> = {
  default: {
    id: "default",
    name: "vibes",
    productName: "Vibes",
    executableName: "vibes",
    iconFolder: "icons/main",
    userDataFolder: "Vibes",
  },
  development: {
    id: "development",
    name: "vibes-dev",
    productName: "Vibes Dev",
    executableName: "vibes-dev",
    iconFolder: "icons/flavors/development",
    userDataFolder: "vibes-dev",
  },
};

export function getActiveFlavor(): FlavorConfig {
  // En entorno Node / Main process
  if (typeof process !== "undefined" && process.env) {
    const envFlavor = process.env.VIBES_FLAVOR || "";
    // Soporte para legado VIBES_PROFILE=vibes -> mapea a "default" pero podríamos manejarlo. 
    // Para simplificar, priorizamos VIBES_FLAVOR
    if (FLAVORS[envFlavor]) {
      return FLAVORS[envFlavor];
    }
  }

  // En entorno de renderizado (Vite inyectará VITE_APP_FLAVOR)
  if (typeof import.meta !== "undefined" && (import.meta as any).env && (import.meta as any).env.VITE_APP_FLAVOR) {
    const viteFlavor = (import.meta as any).env.VITE_APP_FLAVOR as string;
    if (FLAVORS[viteFlavor]) {
      return FLAVORS[viteFlavor];
    }
  }

  return FLAVORS.default;
}
