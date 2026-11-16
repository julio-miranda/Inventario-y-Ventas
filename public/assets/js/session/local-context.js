import { sessionState } from "./state.js";
import { getCanonicalRole, isDeveloperRole } from "../security/roles.js";

export function getLocalIdFromData(data = {}) {
  if (!data || typeof data !== "object") return "";

  const candidates = [
    data.id_local,
    data.idLocal,
    data.localId,
    data.idlocal
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" && typeof candidate !== "number") continue;
    const value = String(candidate).trim();
    if (value) return value;
  }

  return "";
}

function getActiveContext() {
  const cachedContext = sessionState.currentUserContextCache;
  if (
    cachedContext &&
    sessionState.currentUserContextUid &&
    String(cachedContext.uid || "") === String(sessionState.currentUserContextUid)
  ) {
    return cachedContext;
  }

  return sessionState.sessionDataCache?.context || null;
}

function getActiveRole(context = getActiveContext()) {
  return getCanonicalRole(
    context?.role ||
    context?.position ||
    sessionState.sessionDataCache?.role ||
    ""
  );
}

export function getCurrentLocalId() {
  const context = getActiveContext();
  const role = getActiveRole(context);
  if (isDeveloperRole(role)) return "";

  const localContext = sessionState.currentLocalContext || {};
  return (
    getLocalIdFromData(context) ||
    getLocalIdFromData(localContext) ||
    getLocalIdFromData(sessionState.sessionDataCache)
  );
}

export function getCurrentLocalInfo() {
  const context = getActiveContext();
  const role = getActiveRole(context);

  if (isDeveloperRole(role)) {
    return {
      id_local: "",
      nombre: "",
      numeroDocumento: "",
      ubicacion: "",
      contribuyente: "",
      tipoDocumento: "",
      nit: "",
      nrc: ""
    };
  }

  const localContext = sessionState.currentLocalContext || {};

  return {
    id_local:
      getLocalIdFromData(context) ||
      getLocalIdFromData(localContext) ||
      getLocalIdFromData(sessionState.sessionDataCache),
    nombre: String(context?.localNombre || localContext.nombre || "").trim(),
    numeroDocumento: String(context?.localNumeroDocumento || localContext.numeroDocumento || "").trim(),
    ubicacion: String(context?.localUbicacion || localContext.ubicacion || "").trim(),
    contribuyente: String(
      context?.localContribuyente ||
      context?.localNombreContribuyente ||
      localContext.contribuyente ||
      ""
    ).trim(),
    tipoDocumento: String(context?.localTipoDocumento || localContext.tipoDocumento || "").trim(),
    nit: String(context?.localNIT || localContext.nit || "").trim(),
    nrc: String(context?.localNRC || localContext.nrc || "").trim()
  };
}

export function matchesLocalContext(data = {}, localId = "") {
  const target = String(localId || getCurrentLocalId()).trim();
  if (!target || !data || typeof data !== "object") return false;

  const docLocalId = String(
    data.id_local ??
    data.idLocal ??
    data.localId ??
    data.idlocal ??
    ""
  ).trim();

  return docLocalId === target;
}
