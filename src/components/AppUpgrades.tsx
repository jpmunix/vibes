import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, ArrowUpCircle } from "lucide-react";
import { ipc, type AppUpgrade } from "@/ipc/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AppUpgrades({ appId }: { appId: number | null }) {
  const queryClient = useQueryClient();

  const {
    data: upgrades,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.appUpgrades.byApp({ appId }),
    queryFn: () => {
      if (!appId) {
        return Promise.resolve([]);
      }
      return ipc.upgrade.getAppUpgrades({ appId });
    },
    enabled: !!appId,
  });

  const {
    mutate: executeUpgrade,
    isPending: isUpgrading,
    error: mutationError,
    variables: upgradingVariables,
  } = useMutation({
    mutationFn: (upgradeId: string) => {
      if (!appId) {
        throw new Error("appId is not set");
      }
      return ipc.upgrade.executeAppUpgrade({
        appId,
        upgradeId,
      });
    },
    onSuccess: (_, upgradeId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.appUpgrades.byApp({ appId }),
      });
      if (upgradeId === "capacitor") {
        // Capacitor upgrade is done, so we need to invalidate the Capacitor
        // query to show the new status.
        queryClient.invalidateQueries({
          queryKey: queryKeys.appUpgrades.isCapacitor({ appId }),
        });
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.versions.list({ appId }),
      });
    },
  });

  const handleUpgrade = (upgradeId: string) => {
    executeUpgrade(upgradeId);
  };

  if (!appId) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="mt-1">
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (queryError) {
    return (
      <Card className="mt-1">
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertTitle>Error al cargar las actualizaciones</AlertTitle>
            <AlertDescription>{queryError.message}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const currentUpgrades = upgrades?.filter((u) => u.isNeeded && u.id !== "capacitor") ?? [];

  if (currentUpgrades.length === 0) {
    return null;
  }

  return (
    <>
      {currentUpgrades.map((upgrade: AppUpgrade) => (
        <Card key={upgrade.id} className="mt-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowUpCircle className="h-5 w-5" />
              {upgrade.id.charAt(0).toUpperCase() + upgrade.id.slice(1)}
            </CardTitle>
            <CardDescription>{upgrade.description}</CardDescription>
          </CardHeader>
          <CardContent className="pt-2 pb-4">
            <Button
              onClick={() => handleUpgrade(upgrade.id)}
              disabled={isUpgrading && upgradingVariables === upgrade.id}
              variant="outline"
              size="sm"
              data-testid={`app-upgrade-${upgrade.id}`}
            >
              {isUpgrading && upgradingVariables === upgrade.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Actualizar
            </Button>
          </CardContent>
          {mutationError && upgradingVariables === upgrade.id && (
            <CardContent className="pt-0">
              <Alert
                variant="destructive"
                className="dark:bg-destructive/15"
              >
                <Terminal className="h-4 w-4" />
                <AlertTitle className="dark:text-red-200">
                  Actualización fallida
                </AlertTitle>
                <AlertDescription className="text-xs text-red-400 dark:text-red-300">
                  {(mutationError as Error).message}{" "}
                  <a
                    onClick={(e) => {
                      e.stopPropagation();
                      ipc.system.openExternalUrl(
                        upgrade.manualUpgradeUrl ??
                        "https://github.com/jpmunix",
                      );
                    }}
                    className="underline font-medium hover:dark:text-red-200 cursor-pointer"
                  >
                    Instrucciones de actualización manual
                  </a>
                </AlertDescription>
              </Alert>
            </CardContent>
          )}
        </Card>
      ))}
    </>
  );
}
