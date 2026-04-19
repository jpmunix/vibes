import { useEffect } from "react";
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";

import { ipc, type SupabaseProject } from "@/ipc/types";
import { toast } from "sonner";
import { useSettings } from "@/hooks/useSettings";
import { useSupabase } from "@/hooks/useSupabase";
import { UnifiedSelector, type SelectorGroup, type SelectorOption } from "@/components/ui/UnifiedSelector";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { Database, Eye, EyeOff, Loader2, Save, SupabaseIcon } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoadApp } from "@/hooks/useLoadApp";
import { useDeepLink } from "@/contexts/DeepLinkContext";

import { ExternalLink, Plus, RefreshCw, Trash2 } from "@/components/ui/icons";
import { isSupabaseConnected } from "@/lib/schemas";

export function SupabaseConnector({ appId }: { appId: number }) {
  const { settings, refreshSettings } = useSettings();
  const { app, refreshApp } = useLoadApp(appId);
  const { lastDeepLink, clearLastDeepLink } = useDeepLink();

  // Check if there are any connected organizations
  const isConnected = isSupabaseConnected(settings);

  const branchesProjectId =
    app?.supabaseParentProjectId || app?.supabaseProjectId;

  const {
    organizations,
    projects,
    isLoadingProjects,
    isFetchingProjects,
    projectsError,
    refetchOrganizations,
    refetchProjects,
    deleteOrganization,
    setAppProject,
    unsetAppProject,
  } = useSupabase({
    branchesProjectId,
    branchesOrganizationSlug: app?.supabaseOrganizationSlug,
  });

  useEffect(() => {
    const handleDeepLink = async () => {
      if (lastDeepLink?.type === "supabase-oauth-return") {
        await refreshSettings();
        await refetchOrganizations();
        await refetchProjects();
        await refreshApp();
        clearLastDeepLink();
      }
    };
    handleDeepLink();
  }, [lastDeepLink?.timestamp]);

  const handleProjectSelect = async (projectValue: string) => {
    try {
      // projectValue format: "organizationSlug:projectId"
      const [organizationSlug, projectId] = projectValue.split(":");
      const project = projects.find(
        (p) => p.id === projectId && p.organizationSlug === organizationSlug,
      );
      if (!project) {
        throw new Error("Proyecto no encontrado");
      }
      await setAppProject({
        projectId,
        appId,
        organizationSlug,
      });
      toast.success("Proyecto conectado a la app con éxito");
      await refreshApp();
    } catch (error) {
      toast.error("Error al conectar el proyecto a la app: " + error);
    }
  };

  // Group projects by organization for display
  const groupedProjects = projects.reduce(
    (acc, project) => {
      const orgKey = project.organizationSlug;
      if (!acc[orgKey]) {
        // Find the organization info to get the name
        const orgInfo = organizations.find(
          (o) => o.organizationSlug === project.organizationSlug,
        );
        acc[orgKey] = {
          orgLabel:
            orgInfo?.name ||
            `Organization ${project.organizationSlug.slice(0, 8)}`,
          projects: [],
        };
      }
      acc[orgKey].projects.push(project);
      return acc;
    },
    {} as Record<string, { orgLabel: string; projects: SupabaseProject[] }>,
  );

  const handleAddAccount = async () => {
    if (settings?.isTestMode) {
      await ipc.supabase.fakeConnectAndSetProject({
        appId,
        fakeProjectId: "fake-project-id",
      });
    } else {
      await ipc.system.openExternalUrl(
        "https://supabase-oauth.dyad.sh/api/connect-supabase/login",
      );
    }
  };

  const handleUnsetProject = async () => {
    try {
      await unsetAppProject(appId);
      toast.success("Proyecto desconectado de la app con éxito");
      await refreshApp();
    } catch (error) {
      console.error("Failed to disconnect project:", error);
      toast.error("Error al desconectar el proyecto de la app");
    }
  };

  const handleDeleteOrganization = async (organizationSlug: string) => {
    try {
      await deleteOrganization({ organizationSlug });
      toast.success("Organización desconectada con éxito");
    } catch (error) {
      toast.error("Error al desconectar la organización: " + error);
    }
  };

  // Connected and has project set
  if (isConnected && app?.supabaseProjectName) {
    return (
      <CollapsibleCard
        title="Supabase"
        icon={<SupabaseIcon className="h-5 w-5" />}
        description={
          <>Esta app está conectada al proyecto:{" "}<Badge variant="secondary" className="ml-2 text-base font-bold px-3 py-1">{app.supabaseProjectName}</Badge></>
        }
      >
        <div className="pt-2 flex justify-end">
          <Button variant="ghost" size="sm" onClick={handleUnsetProject} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Desconectar proyecto
          </Button>
        </div>
      </CollapsibleCard>
    );
  }

  // Connected organizations exist, show project selector
  if (isConnected) {
    // Build current project value for the select
    const currentProjectValue =
      app?.supabaseOrganizationSlug && app?.supabaseProjectId
        ? `${app.supabaseOrganizationSlug}:${app.supabaseProjectId}`
        : "";

    return (
      <CollapsibleCard
        title="Supabase"
        icon={<SupabaseIcon className="h-5 w-5" />}
        description="Selecciona un proyecto de Supabase para conectar a esta app"
      >
        <div className="flex items-center justify-end gap-2 mb-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetchProjects()}
            disabled={isFetchingProjects}
            title="Refrescar proyectos"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetchingProjects ? "animate-spin" : ""}`}
            />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddAccount}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            Añadir organización
          </Button>
        </div>
        {isLoadingProjects || isFetchingProjects ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : projectsError ? (
          <div className="text-destructive">
            Error al cargar los proyectos: {projectsError.message}
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => refetchProjects()}
            >
              Reintentar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Connected organizations list */}
            <div className="space-y-2">
              <Label>Organizaciones conectadas</Label>
              <div className="space-y-1">
                {organizations.map((org) => (
                  <div
                    key={org.organizationSlug}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm gap-2"
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-medium truncate">
                        {org.name ||
                          `Organization ${org.organizationSlug.slice(0, 8)}`}
                      </span>
                      {org.ownerEmail && (
                        <span className="text-xs text-muted-foreground truncate">
                          {org.ownerEmail}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() =>
                        handleDeleteOrganization(org.organizationSlug)
                      }
                      title="Desconectar organización"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      <span className="text-xs">Desconectar</span>
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No se han encontrado proyectos en tus organizaciones de
                Supabase conectadas.
              </p>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="project-select">Proyecto</Label>
                <UnifiedSelector
                  value={currentProjectValue}
                  onChange={handleProjectSelect}
                  groups={Object.entries(groupedProjects).map(([orgKey, { orgLabel }]) => ({
                    id: orgKey,
                    heading: orgLabel,
                  }))}
                  options={Object.entries(groupedProjects).flatMap(
                    ([orgKey, { projects: orgProjects }]) =>
                      orgProjects.map((project) => ({
                        value: `${project.organizationSlug}:${project.id}`,
                        label: project.name || project.id,
                        group: orgKey,
                      })),
                  )}
                  triggerVariant="outline"
                  triggerSize="md"
                  placeholder="Selecciona un proyecto"
                  data-testid="project-select"
                />
              </div>
            )}
          </div>
        )}
      </CollapsibleCard>
    );
  }

  // No accounts connected, show connect button
  return (
    <CollapsibleCard
      title="Supabase"
      icon={<SupabaseIcon className="h-5 w-5" />}
      description="Conecta tu cuenta de Supabase para gestionar tu base de datos"
    >
      <Button
        onClick={handleAddAccount}
        variant="outline"
        className="w-full"
        data-testid="connect-supabase-button"
      >
        Conectar con Supabase
      </Button>
    </CollapsibleCard>
  );
}
