/**
 * UI message dictionary — Spanish (es).
 *
 * Central dictionary for user-facing strings of the shell (Vibes): settings,
 * chat, navigation and main-flow toasts. Tool labels/descriptions live in
 * tools.es.ts (P1: localized strings are the shell's business, never the
 * runtime's).
 *
 * Structure: namespaced keys (`settings.*`, `chat.*`, `nav.*`, `toast.*`).
 * Plural keys follow the `{one,many}` shape (es and en only have two count
 * forms; the plural helper picks via Intl.PluralRules).
 *
 * Adding a new string = add the key here AND in messages.en.ts (the parity
 * test fails otherwise). Adding a new language = new messages.<lang>.ts.
 */

export interface PluralMessage {
  one: string;
  many: string;
}

export type MessageValue = string | PluralMessage | Messages;

export interface Messages {
  [key: string]: MessageValue;
}

export const messagesEs: Messages = {
  nav: {
    home: "Inicio",
    library: "Biblioteca",
    settings: "Ajustes",
    workspace: "Espacio de trabajo",
    hub: "Hub",
    appDetails: "Detalles de la app",
  },
  settings: {
    title: "Ajustes",
    searchPlaceholder: "Buscar ajustes...",
    searchEmpty: "Sin resultados para \"{query}\"",
    general: "General",
    appearance: "Apariencia",
    theme: "Tema",
    language: "Idioma",
    languageDescription: "Idioma del interfaz",
    agent: "Agente",
    aiBehavior: "Comportamiento del agente",
    aiBehaviorDescription: "Esfuerzo, verbosidad y modelos",
    permissions: "Permisos",
    permissionsDescription: "Permisos de las herramientas del agente",
    effort: "Esfuerzo",
    effortDescription: "Nivel de esfuerzo del agente al resolver tareas",
    verbosity: "Verbosidad",
    verbosityDescription: "Cuánto detalle incluye el agente en sus respuestas",
    model: "Modelo",
    modelDescription: "Modelo que usa el agente para responder",
    saved: "Ajustes guardados",
    sections: {
      general: "General",
      providers: "Proveedores de IA",
      agent: "Agente",
      customAgents: "Agentes Personalizados",
      prompts: "Prompts",
      guidelines: "Directrices",
      workflow: "Flujo de trabajo",
      integrations: "Integraciones",
      mcp: "Herramientas MCP",
      skills: "Skills",
    },
  },
  chat: {
    thinking: "Pensando",
    searching: "Buscando...",
    processing: "Procesando...",
    loading: "Cargando...",
    codeSearch: "Búsqueda de Código",
    allow: "Permitir",
    deny: "Denegar",
    allowAlways: "Permitir siempre",
    allowOnce: "Solo esta vez",
    reject: "Rechazar",
    showMore: "Mostrar más",
    showLess: "Mostrar menos",
    seeMore: "Ver más",
    seeLess: "Ver menos",
    permitQuestion: "¿Permitir {tool}?",
    ofTotal: "({current} de {total})",
    denyAlways: "Denegar siempre",
    ask: "Preguntar",
    toolRequest: "La herramienta quiere acceso:",
    version: "Versión",
    versions: "Versiones",
    versionHistory: "Historial de versiones",
    closeVersionPane: "Cerrar panel de versiones",
    noVersions: "No hay versiones disponibles",
    now: "ahora",
  },
  toast: {
    settingsSaved: "Ajustes guardados",
    errorGeneric: "Algo salió mal",
    saved: "Guardado",
    deleted: "Eliminado",
    created: "Creado",
  },
  common: {
    yes: "Sí",
    no: "No",
    cancel: "Cancelar",
    confirm: "Confirmar",
    close: "Cerrar",
    save: "Guardar",
    delete: "Eliminar",
    edit: "Editar",
    add: "Añadir",
    remove: "Quitar",
    retry: "Reintentar",
    back: "Volver",
    next: "Siguiente",
    search: "Buscar",
    loading: "Cargando...",
    empty: "Sin contenido",
    create: "Crear",
  },
  plural: {
    files: { one: "{count} archivo", many: "{count} archivos" },
    apps: { one: "{count} app", many: "{count} apps" },
    messages: { one: "{count} mensaje", many: "{count} mensajes" },
    minutes: { one: "hace {count} minuto", many: "hace {count} minutos" },
    seconds: { one: "hace {count} segundo", many: "hace {count} segundos" },
  },
  search: {
    noResults: "No se encontraron ajustes",
    noResultsHint: "Intenta con otros términos de búsqueda",
    import: "Importar",
    export: "Exportar",
    viewLogs: "Ver logs",
    restartApp: "Reiniciar OpenCode",
    testNotification: "Probar notificación",
    testNotificationBody: "Si escuchas esto, el sonido funciona correctamente",
    resetting: "Reseteando...",
    resetSettings: "Restablecer ajustes",
    sections: {
      general: "General",
      workflow: "Configuración del flujo de trabajo",
      agent: "Agente",
      providers: "Proveedores de IA",
      openrouter: "OpenRouter",
      integrations: "Integraciones",
      mcp: "Herramientas MCP",
      skills: "Skills",
      customAgents: "Agentes Personalizados",
    },
    items: {
      theme: {
        label: "Apariencia",
        description: "Define el tema visual principal de la interfaz",
      },
      primaryColor: {
        label: "Color primario",
        description: "Elige el color de acento principal para modo claro y oscuro",
      },
      font: {
        label: "Tipografía de la Interfaz",
        description: "Elige la fuente para toda la interfaz (menús, botones)",
      },
      chatFont: {
        label: "Tipografía del Chat",
        description: "Elige la fuente base para los mensajes del chat",
      },
      fontScale: {
        label: "Tamaño de fuente",
        description: "Ajusta el tamaño del texto por zona (interfaz, sidebar, chat)",
      },
      chatMode: {
        label: "Modo de chat predeterminado",
        description: "Seleccionar el modo de chat que se usa por defecto",
      },
      autoApprove: {
        label: "Confirmar cambios en git",
        description: "Confirma automáticamente los cambios de la IA en git",
      },
      autoExpandPreview: {
        label: "Expandir vista previa",
        description:
          "Abre automáticamente el panel de vista previa lateral cuando el código cambia",
      },
      chatCompletionNotification: {
        label: "Notificaciones de respuesta",
        description:
          "Muestra una notificación nativa del sistema cuando el chat termina de generar",
      },
      notificationSound: {
        label: "Reproducir sonido",
        description:
          "Reproduce un sonido al terminar la respuesta (útil en apps sin firmar en macOS)",
      },
      webSearch: {
        label: "Búsqueda web",
        description:
          "Permite al modelo buscar en internet cuando necesite información actualizada",
      },
      chatLanguage: {
        label: "Idioma",
        description: "Idioma de la interfaz y de la comunicación con el agente",
      },
      reasoningEffort: {
        label: "Esfuerzo de razonamiento",
        description:
          "Controla cuánto razonamiento usa el modelo antes de responder",
      },
      textVerbosity: {
        label: "Verbosidad",
        description: "Controla cuánto detalle incluye el agente en sus respuestas",
      },
      agentMaxIterations: {
        label: "Máx. iteraciones del agente",
        description: "Límite de pasos que el agente puede dar antes de detenerse",
      },
      agentMaxWallClock: {
        label: "Tiempo máximo de tarea",
        description: "Límite de reloj antes de que el agente detenga la tarea",
      },
      chatView: {
        label: "Vista del chat",
        description:
          "Respuestas limpias mostrando solo lo esencial o todos los pasos intermedios",
      },
      standardModel: {
        label: "Modelo para tareas internas",
        description: "Títulos, resúmenes y mantenimiento",
      },
      agentPermissions: {
        label: "Permisos del Agente",
        description: "Configurar qué herramientas puede usar el agente",
      },
      aiProviders: {
        label: "Proveedores de IA",
        description: "Configurar y cambiar entre proveedores de modelos de IA",
      },
      enabledModels: {
        label: "Modelos habilitados",
        description: "Gestiona qué modelos aparecen en el selector del chat",
      },
      providerSettings: {
        label: "Configuración de OpenRouter",
        description: "Configurar clave API de OpenRouter y modelos",
      },
      showCostDisplay: {
        label: "Mostrar gasto en chats",
        description:
          "Muestra el coste acumulado en la cabecera y el coste por mensaje",
      },
      github: {
        label: "GitHub",
        description: "Integración con GitHub",
      },
      vercel: {
        label: "Vercel",
        description: "Integración con Vercel para deploy",
      },
      supabase: {
        label: "Supabase",
        description: "Integración con Supabase",
      },
      neon: {
        label: "Neon",
        description: "Integración con Neon Database",
      },
      mcpServers: {
        label: "Servidores MCP",
        description:
          "Gestionar servidores Model Context Protocol para ampliar las herramientas del agente",
      },
      skillsSettings: {
        label: "Skills del Proyecto",
        description:
          "Gestionar agentes de conocimiento y directivas personalizadas (.claude/skills)",
      },
      resetAll: {
        label: "Valores por defecto",
        description: "Restaurar toda la configuración a valores por defecto",
      },
      customAgents: {
        label: "Agentes Personalizados",
        description:
          "Crea y administra tus propios agentes con instrucciones específicas y comandos slash personalizados",
      },
    },
  },
  errors: {
    fallback: "Ha ocurrido un error inesperado.",
    showDetails: "Ver detalles",
    retryingIn: "Reintentando en {seconds}s...",
    userMessage: {
      creditsExhausted: "Parece que se agotaron los creditos de IA de tu cuenta.",
      authInvalid:
        "Parece que hay un problema con tu clave API. Revisala en ajustes.",
      modelNotFound:
        "Parece que el modelo seleccionado no esta disponible. Prueba con otro.",
      contextExceeded:
        "Parece que el chat es demasiado largo para el modelo. Abre un nuevo chat o cambia a un modelo con mayor ventana de contexto.",
      contentFiltered:
        "Parece que el contenido fue bloqueado por los filtros de seguridad del modelo.",
      opencodeNotInstalled:
        "Parece que no se encontro el agente de IA. Reinicia Vibes para resolverlo.",
      diskFull:
        "Parece que no queda espacio en disco. Libera espacio e intentalo de nuevo.",
      rateLimit:
        "Se ha superado el limite de solicitudes. Espera un momento e intentalo de nuevo.",
      timeout: "La solicitud tardo demasiado. Intentalo de nuevo.",
      networkError:
        "Error de conexion con el proveedor de IA. Comprueba tu conexion a internet.",
      serverError:
        "Error del servidor de IA. Intentalo de nuevo en unos segundos.",
      sessionBusy: "El agente esta ocupado con otra tarea. Espera a que termine.",
      sessionNotFound:
        "No se pudo crear la sesion del agente. Intentalo de nuevo.",
      providerError:
        "El proveedor de IA devolvio un error. Intentalo de nuevo.",
      noOutput: "La IA no genero ninguna respuesta. Intentalo de nuevo.",
      serverCrash:
        "Error interno de la aplicacion. Reinicia Vibes para resolverlo.",
    },
    action: {
      reloadCredits: "Recargar creditos",
      changeModel: "Cambiar modelo",
      openSettings: "Abrir Ajustes",
      newChat: "Nuevo chat",
      retry: "Reintentar",
      retryIn10s: "Reintentar en 10s",
      retryIn3s: "Reintentar en 3s",
    },
  },
  models: {
    updateSettingsError: "No se pudieron actualizar los ajustes",
    customModelUpdated: "¡Modelo personalizado actualizado con éxito!",
    editCustomModelTitle: "Editar modelo personalizado",
  },
  configure: {
    startCommandsSaved: "Comandos de arranque guardados",
    saveCommandsError: "Error al guardar los comandos: {error}",
    envVarsSaved: "Variables de entorno guardadas",
    saveEnvVarsError: "Error al guardar las variables de entorno: {error}",
    bothRequired: "La clave y el valor son obligatorios",
    envVarExists: "Ya existe una variable de entorno con esta clave",
  },
  preview: {
    dataCleared: "Datos de vista previa borrados",
    clearDataError: "Error al borrar los datos de vista previa: {error}",
  },
  artifacts: {
    markdownCopied: "Markdown copiado al portapapeles",
    urlCopied: "URL del artefacto copiada al portapapeles",
  },
  home: {
    createAppError: "Error al crear la aplicación. {error}",
    phases: {
      thinkingName: {
        title: "Pensando un nombre genial",
        subtitle: "La IA está eligiendo el nombre perfecto para tu app…",
      },
      preparingProject: {
        title: "Preparando el proyecto",
        subtitle: "Creando la estructura de archivos y configuración…",
      },
      installingDeps: {
        title: "Instalando dependencias",
        subtitle: "Preparando todo lo necesario para tu nueva app…",
      },
      initializingRepo: {
        title: "Inicializando el repositorio",
        subtitle: "Configurando Git para control de versiones…",
      },
      applyingTheme: {
        title: "Aplicando tu tema",
        subtitle: "Personalizando los estilos y colores de la app…",
      },
      almostReady: {
        title: "¡Casi listo!",
        subtitle: "Abriendo el entorno de desarrollo…",
      },
    },
  },
  library: {
    title: "Biblioteca: Prompts",
    loading: "Cargando...",
    empty: "Aún no hay prompts. Crea uno para empezar.",
  },
  hub: {
    backendTitle: "Servicios de Backend",
    backendSubtitle: "Conéctate a servicios de backend para tus proyectos.",
  },
  dialogs: {
    addModelsTitle: "Añadir modelos",
    unexpectedCloseTitle: "Cierre inesperado detectado",
    accept: "Aceptar",
    editPrompt: "Editar prompt",
    createAppTitle: "Crear nueva aplicación",
    appNameLabel: "Nombre de la aplicación",
    cancel: "Cancelar",
    newProject: "Nuevo proyecto",
  },
  previewPanel: {
    discard: "Descartar",
    loading: "Cargando...",
    publishApp: "Publicar aplicación",
    allLevels: "Todos los niveles",
    allTypes: "Todos los tipos",
    dynamicStyle: "El estilo de este elemento cambia según condiciones",
    deselectComponent: "Deseleccionar componente",
    dynamicStyles: "Este componente tiene estilos dinámicos",
    fixWithAI: "Arreglar con IA",
    openInBrowser: "Abrir en navegador",
    deviceMode: "Modo de dispositivo",
    desktop: "Desktop",
    tablet: "Tablet",
    mobile: "Mobile",
    cancel: "Cancelar",
    color: "Color",
    deleteSelected: "Eliminar seleccionado",
    undo: "Deshacer",
    redo: "Rehacer",
    copyClipboard: "Copiar al portapapeles",
    saveAsFile: "Guardar como archivo",
    consoleReady: "Consola lista",
    info: "Info",
    warn: "Warn",
    error: "Error",
    server: "Server",
    client: "Client",
    edgeFunction: "Edge Function",
    noLogsToExport: "No hay logs para exportar",
    fileSaved: "Archivo guardado",
    attachScreenshotError: "Error al adjuntar la captura al chat",
    nativeScreenshotError: "Error al realizar la captura nativa",
    visualChangesSaved: "Cambios visuales guardados en los archivos fuente",
    saveChangesError: "Error al guardar los cambios: {error}",
    preview: "Vista previa",
    restart: "Reiniciar",
    addToChat: "Añadir al chat",
    closeAnnotator: "Cerrar anotador",
    installCommand: "Comando de instalación",
    startCommand: "Comando de inicio",
    key: "Clave",
    networkRequests: "Network Requests",
    allSources: "All Sources",
    clearLogs: "Clear logs",
    row: "Row",
    column: "Column",
    rowReverse: "Row Reverse",
    columnReverse: "Column Reverse",
    fullPage: "Página completa",
    selection: "Selección",
    stopServer: "Detener servidor",
    rebuild: "Reconstruir",
    clearCache: "Borrar caché",
    exploreCode: "Explorar código",
    exportLogsToFile: "Exportar logs a archivo",
    problems: "Problemas",
    database: "Base de datos",
    console: "Consola",
    guidelines: "Directrices",
    git: "Git",
    publish: "Publicar",
    configure: "Configurar",
  },
  workspace: {
    urlCopied: "URL copiada al portapapeles",
    planAttached: "Plan adjuntado al chat actual",
    appArchived: "\"{name}\" archivado",
    alreadyRegistered: "\"{name}\" ya estaba registrada. Abierta directamente.",
    opened: "Workspace \"{name}\" abierto con éxito.",
    openError: "Error al abrir workspace: {error}",
    chatArchived: "\"{name}\" archivado",
    chatDeleted: "Chat eliminado correctamente",
    deleteChatError: "Error al eliminar el chat: {error}",
    closeError: "Error al cerrar: {error}",
    appRenamed: "Nombre de la aplicación actualizado",
    renameAppError: "Error al renombrar la app: {error}",
    createChatError: "Error al crear chat: {error}",
    loading: "Cargando...",
    note: "Nota:",
    noteChangesAccepted: "Los cambios de código ya aceptados se mantendrán.",
    deleteChatConfirm: "Se eliminará \"{name}\" de forma permanente. Esta acción no se puede deshacer.",
  },
};
