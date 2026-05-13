import { useQuery } from "@tanstack/react-query";
import { ipc, type LanguageModelProvider } from "@/ipc/types";
import { useSettings } from "./useSettings";
import { cloudProviders } from "@/lib/schemas";
import { queryKeys } from "@/lib/queryKeys";
import { isProviderSetup as isProviderSetupUtil } from "@/lib/providerUtils";

export function useLanguageModelProviders() {
  const { settings, envVars, loading: settingsLoading } = useSettings();

  const queryResult = useQuery<LanguageModelProvider[], Error>({
    queryKey: queryKeys.languageModels.providers,
    queryFn: async () => {
      return ipc.languageModel.getProviders();
    },
  });

  // Composite loading: true while EITHER settings or providers are still loading.
  // This prevents consumers from seeing "no provider configured" during the
  // initial hydration window when providerSettings is still the empty default.
  const isLoading = settingsLoading || queryResult.isLoading;

  const isProviderSetup = (provider: string) => {
    return isProviderSetupUtil(provider, {
      settings,
      envVars,
      providerData: queryResult.data,
      isLoading,
    });
  };

  const isAnyProviderSetup = () => {
    // Check hardcoded cloud providers
    if (cloudProviders.some((provider) => isProviderSetup(provider))) {
      return true;
    }

    // Check custom providers
    const customProviders = queryResult.data?.filter(
      (provider) => provider.type === "custom",
    );
    return (
      customProviders?.some((provider) => isProviderSetup(provider.id)) ?? false
    );
  };

  return {
    ...queryResult,
    isLoading,
    isProviderSetup,
    isAnyProviderSetup,
  };
}
