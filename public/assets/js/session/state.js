
/** Estado compartido de autenticación, contexto local y caché. */

const emptyLocalContext = () => ({
  id_local: "",
  nombre: "",
  numeroDocumento: "",
  ubicacion: "",
  contribuyente: "",
  tipoDocumento: "",
  nit: "",
  nrc: ""
});

export const sessionState = {
  // Contexto del usuario.
  currentUserContextCache: null,
  currentUserContextPromise: null,
  currentUserContextUid: "",

  // Control de solicitudes concurrentes.
  currentUserContextPromiseUid: "",
  currentUserContextRequestToken: null,

  // Caché de sesión.
  sessionDataCache: null,
  sessionDataCachePromise: null,
  sessionDataCacheUid: "",

  // Contexto del local.
  currentLocalContext: emptyLocalContext()
};

if (typeof window !== "undefined") {
  window.currentLocalContext = sessionState.currentLocalContext;
}

/**
 * Actualiza el contexto del local.
 */
export function setCurrentLocalContext(value = {}) {
  sessionState.currentLocalContext = {
    ...emptyLocalContext(),
    ...value
  };

  if (typeof window !== "undefined") {
    window.currentLocalContext = sessionState.currentLocalContext;
  }

  return sessionState.currentLocalContext;
}

/**
 * Invalida todas las referencias al contexto anterior.
 *
 * Las solicitudes que sigan ejecutándose detectarán
 * que su token dejó de ser válido.
 */
export function resetUserContextState() {
  sessionState.currentUserContextRequestToken = null;

  sessionState.currentUserContextCache = null;
  sessionState.currentUserContextPromise = null;

  sessionState.currentUserContextUid = "";
  sessionState.currentUserContextPromiseUid = "";

  setCurrentLocalContext();
}