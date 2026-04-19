import React, { useState } from "react";
import { useMcpServers, useMcpTools } from "@/hooks/useMcpServers";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { UnifiedSelector } from "@/components/ui/UnifiedSelector";
import { Plus, Trash2, Server, Globe, Terminal, RefreshCw, ChevronDown, ChevronRight, Check, Pencil } from "@/components/ui/icons";
import type { McpServer } from "@/ipc/types/mcp";
import { cn } from "@/lib/utils";

function McpToolsList({ serverId }: { serverId: number }) {
  const { data: tools, isLoading, isError, refetch } = useMcpTools(serverId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 typo-caption p-3">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> 
        Cargando tools...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="typo-caption text-red-500/80 p-3 flex flex-col gap-2 border border-red-500/20 rounded-lg bg-red-500/5 mt-2">
        <span>Error al conectar para obtener las tools. Asegúrate de que la configuración sea correcta y el servidor esté corriendo.</span>
        <Button variant={"outline"} size={"sm"} onClick={() => refetch()} className="w-fit">Reintentar</Button>
      </div>
    );
  }

  if (!tools || tools.length === 0) {
    return <div className="typo-caption p-3">No tools found for this server.</div>;
  }

  return (
    <div className="pt-3">
      <div className="typo-micro uppercase tracking-wider flex items-center justify-between mb-3">
        <span>{tools.length} TOOLS DISPONIBLES</span>
        <button onClick={(e) => { e.stopPropagation(); refetch(); }} className="hover:text-primary transition-colors hover:bg-primary/10 p-1 rounded">
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tools.map(tool => (
            <div key={tool.name} className="px-2.5 py-1 typo-mono-xs border border-border/80 bg-background/50 rounded-md hover:bg-background/80 transition-colors" title={tool.description || undefined}>
               {tool.name}
            </div>
        ))}
      </div>
    </div>
  );
}

function McpServerCard({ server, onUpdate, onDelete }: { server: McpServer; onUpdate: (id: number, enabled: boolean) => void; onDelete: (id: number) => void; }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "border border-border/40 bg-card/30 rounded-xl overflow-hidden transition-all duration-200",
      !server.enabled && "opacity-70 grayscale-[20%]"
    )}>
      <div 
        className={cn(
            "flex items-center justify-between p-4 cursor-pointer hover:bg-muted/40 transition-colors gap-8",
            expanded && "bg-muted/20 border-b border-border/20"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
             <div className="flex items-center gap-2">
                 <h3 className="typo-label">
                   {server.name.charAt(0).toUpperCase() + server.name.slice(1)}
                 </h3>
             </div>
             <p className="typo-mono mt-1 truncate max-w-md">
               {server.transport === "stdio" 
                  ? `${server.command} ${(typeof server.args === "string" ? JSON.parse(server.args) : server.args)?.join(" ") || ""}`
                  : server.url}
             </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 mr-2" onClick={(e) => e.stopPropagation()}>
             <Switch 
               checked={server.enabled}
               onCheckedChange={(c) => onUpdate(server.id, c)}
             />
             {server.name !== "context7" && (
               <>
                 <McpServerDialog existingServer={server} />
                 <DeleteConfirmationDialog 
                     itemName={server.name}
                     itemType="servidor"
                     onDelete={() => onDelete(server.id)}
                     trigger={
                         <Button 
                           variant="ghost" 
                           size="icon" 
                           className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10 h-8 w-8 rounded-lg"
                         >
                           <Trash2 className="h-4 w-4" />
                         </Button>
                     }
                 />
               </>
             )}
          </div>
          <div className="text-muted-foreground/50 transition-transform">
             {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </div>
        </div>
      </div>
      
      {expanded && (
          <div className="p-4 bg-muted/10 animate-in fade-in slide-in-from-top-1 duration-200">
             <McpToolsList serverId={server.id} />
          </div>
      )}
    </div>
  );
}
  
  function McpServerDialog({ existingServer }: { existingServer?: McpServer }) {
    const { createServer, updateServer, isCreating, isUpdating } = useMcpServers();
    const [open, setOpen] = useState(false);
    
    // Init state from existing or default
    const [name, setName] = useState(existingServer?.name || "");
    const [transport, setTransport] = useState<"stdio" | "http">(existingServer?.transport === "http" || existingServer?.transport === "sse" ? "http" : "stdio");
    const [command, setCommand] = useState(existingServer?.command || "");
    
    // Parse args
    let initialArgs = "";
    if (existingServer?.args) {
        try {
            initialArgs = (typeof existingServer.args === "string" ? JSON.parse(existingServer.args) : existingServer.args).join("\\n");
        } catch(e) {}
    }
    const [argsStr, setArgsStr] = useState(initialArgs);
    
    // Parse env
    let initialEnv = "";
    if (existingServer?.envJson) {
        try {
            const parsed = typeof existingServer.envJson === "string" ? JSON.parse(existingServer.envJson) : existingServer.envJson;
            initialEnv = Object.entries(parsed).map(([k,v]) => `${k}=${v}`).join("\\n");
        } catch(e) {}
    }
    const [envStr, setEnvStr] = useState(initialEnv);
    
    // Parse headers
    let initialHeaders = "";
    if (existingServer?.headersJson) {
        try {
            const parsed = typeof existingServer.headersJson === "string" ? JSON.parse(existingServer.headersJson) : existingServer.headersJson;
            initialHeaders = Object.entries(parsed).map(([k,v]) => `${k}=${v}`).join("\\n");
        } catch(e) {}
    }
    const [headersStr, setHeadersStr] = useState(initialHeaders);
    
    const [url, setUrl] = useState(existingServer?.url || "");
    
    const handleSave = async () => {
       if (!name.trim()) return;
       if (transport === "stdio" && !command.trim()) return;
       if (transport === "http" && !url.trim()) return;
       
       let parsedArgs: string[] | null = null;
       if (argsStr.trim()) {
          parsedArgs = argsStr.split("\\n").map(s => s.trim()).filter(s => s);
       }
       
       let parsedEnv: Record<string, string> | null = null;
       if (envStr.trim()) {
          parsedEnv = {};
          const lines = envStr.split("\\n");
          for (const line of lines) {
             const idx = line.indexOf("=");
             if (idx > 0) {
                 const k = line.slice(0, idx).trim();
                 const v = line.slice(idx + 1).trim();
                 if (k) parsedEnv[k] = v;
             }
          }
       }
       
       let parsedHeaders: Record<string, string> | null = null;
       if (headersStr.trim()) {
          parsedHeaders = {};
          const lines = headersStr.split("\\n");
          for (const line of lines) {
             const idx = line.indexOf("=");
             if (idx > 0) {
                 const k = line.slice(0, idx).trim();
                 const v = line.slice(idx + 1).trim();
                 if (k) parsedHeaders[k] = v;
             } else {
                 const headerIdx = line.indexOf(":");
                 if (headerIdx > 0) {
                     const k = line.slice(0, headerIdx).trim();
                     const v = line.slice(headerIdx + 1).trim();
                     if (k) parsedHeaders[k] = v;
                 }
             }
          }
       }
       
       if (existingServer) {
           await updateServer({
               id: existingServer.id,
               name: name.trim(),
               transport,
               command: command.trim() || undefined,
               args: parsedArgs || undefined,
               envJson: parsedEnv || undefined,
               headersJson: parsedHeaders || undefined,
               url: url.trim() || undefined,
           });
       } else {
           await createServer({
               name: name.trim(),
               transport,
               command: command.trim() || undefined,
               args: parsedArgs || undefined,
               envJson: parsedEnv || undefined,
               headersJson: parsedHeaders || undefined,
               url: url.trim() || undefined,
               enabled: true,
           });
       }
       
       setOpen(false);
       if (!existingServer) {
           setName("");
           setTransport("stdio");
           setCommand("");
           setArgsStr("");
           setEnvStr("");
           setHeadersStr("");
           setUrl("");
       }
    };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {existingServer ? (
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-muted h-8 w-8">
               <Pencil className="h-4 w-4" />
            </Button>
        ) : (
            <Button size="sm" className="gap-2">
               <Plus className="h-4 w-4" />
               Añadir Servidor
            </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{existingServer ? "Editar Servidor MCP" : "Añadir Servidor MCP"}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
             <label className="typo-label">Nombre</label>
             <Input placeholder="github, notion, postgres..." value={name} onChange={e => setName(e.target.value)} />
             <p className="typo-caption">Usado en referencias de tools. Usa minúsculas y guiones.</p>
          </div>
          
          <div className="space-y-2">
             <label className="typo-label">Tipo</label>
             <UnifiedSelector
               value={transport}
               onChange={(v) => setTransport(v as "stdio" | "http")}
               options={[
                 { value: "stdio", label: "Local (Stdio / Comando)" },
                 { value: "http", label: "Remoto (HTTP / SSE)" },
               ]}
               triggerVariant="default"
               triggerSize="md"
               popoverWidth="w-[260px]"
               itemLayout="compact"
             />
          </div>
          
          {transport === "stdio" ? (
             <>
               <div className="space-y-2">
                  <label className="typo-label">Comando</label>
                  <Input placeholder="npx, python, docker..." value={command} onChange={e => setCommand(e.target.value)} />
               </div>
               <div className="space-y-2">
                  <label className="typo-label flex justify-between">Argumentos <span className="typo-caption">Uno por línea</span></label>
                  <textarea 
                     className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 typo-mono-xs ring-offset-background placeholder:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                     placeholder="-y\n@modelcontextprotocol/server-github"
                     value={argsStr}
                     onChange={e => setArgsStr(e.target.value)}
                  />
               </div>
               <div className="space-y-2">
                  <label className="typo-label flex justify-between">Variables de Entorno <span className="typo-caption">Opcional, KEY=value por línea</span></label>
                  <textarea 
                     className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 typo-mono-xs ring-offset-background placeholder:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                     placeholder="GITHUB_PERSONAL_ACCESS_TOKEN=ghp_..."
                     value={envStr}
                     onChange={e => setEnvStr(e.target.value)}
                  />
               </div>
             </>
          ) : (
             <>
               <div className="space-y-2">
                 <label className="typo-label">URL</label>
                 <Input placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} />
               </div>
               <div className="space-y-2">
                  <label className="typo-label flex justify-between">Cabeceras HTTP (Headers) <span className="typo-caption">Opcional, KEY: value por línea</span></label>
                  <textarea 
                     className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 typo-mono-xs ring-offset-background placeholder:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                     placeholder="Authorization: Bearer my-key..."
                     value={headersStr}
                     onChange={e => setHeadersStr(e.target.value)}
                  />
               </div>
             </>
          )}
        </div>
        
        <DialogFooter>
           <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
           <Button onClick={handleSave} disabled={!name || (transport === "stdio" ? !command : !url) || isCreating || isUpdating}>
              <Check className="h-4 w-4 mr-2" /> Guardar
           </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function McpServersSettings() {
   const { servers, updateServer, deleteServer } = useMcpServers();

   return (
      <div className="space-y-6">
         <div className="flex items-center justify-between mb-2">
            <div>
               <h3 className="typo-subsection-title">Servidores instalados</h3>
               <p className="typo-caption mt-1">
                 Activa y desactiva servidores de Model Context Protocol (MCP). Los cambios se aplican automáticamente sin reiniciar el agente.
               </p>
            </div>
            <McpServerDialog />
         </div>
         
         {servers.length === 0 ? (
            <div className="text-center py-10 border border-dashed rounded-xl border-border/60 bg-muted/10">
               <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Server className="h-6 w-6 text-primary" />
               </div>
               <h4 className="typo-label mb-1">No hay servidores MCP</h4>
               <p className="typo-caption max-w-sm mx-auto">
                 Añade tu primer servidor para dar nuevas habilidades matemáticas, de conexión o herramientas al agente.
               </p>
            </div>
         ) : (
             <div className="space-y-3">
               {servers.map(s => (
                  <McpServerCard 
                     key={s.id} 
                     server={s} 
                     onUpdate={(id, enabled) => updateServer({ id, enabled })}
                     onDelete={deleteServer} 
                  />
               ))}
             </div>
         )}
      </div>
   );
}
