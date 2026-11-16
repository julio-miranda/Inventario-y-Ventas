//js/session/cache.js
import { auth, firebase } from "../config/firebase.js";

import {
  SESSION_CACHE_KEY,
  SESSION_CACHE_VERSION
} from "./session-constants.js";

import {
  SESSION_PRELOAD_COLLECTIONS
} from "./preload-config.js";

import { sessionState } from "./state.js";

import {
  getCanonicalRole,
  roleRequiresLocal,
  isDeveloperRole
} from "../security/roles.js";

import {
  getLocalIdFromData,
  getCurrentLocalId
} from "./local-context.js";


const asText = value => String(value ?? "").trim();

/*
 * ============================================================
 * LÍMITES DE ALMACENAMIENTO
 * ============================================================
 *
 * Estos límites afectan únicamente a la copia persistida en
 * sessionStorage. No recortan sessionState.sessionDataCache.
 *
 * sessionStorage suele tener una cuota reducida y compartida
 * con otras claves del mismo origen.
 */

const CACHE_STORAGE_MAX_CHARS = 420_000;

const CACHE_STORAGE_MAX_CONTEXT_CHARS = 20_000;

const CACHE_STORAGE_MAX_COLLECTION_CHARS = 100_000;

const CACHE_STORAGE_MAX_DOCUMENT_CHARS = 12_000;

const CACHE_STORAGE_MAX_ERROR_CHARS = 300;

let cacheStorageWarningShown = false;

// Evita reintentos repetidos después de confirmar que la cuota está agotada.
// La caché completa continúa funcionando en sessionState.sessionDataCache.
let cacheStorageUnavailable = false;


/*
 * ============================================================
 * ALMACENAMIENTO
 * ============================================================
 */

function getSessionStorage() {
  try {
    if (typeof window !== "undefined") {
      return window.sessionStorage;
    }

    if (typeof sessionStorage !== "undefined") {
      return sessionStorage;
    }
  } catch (error) {
    console.warn(
      "[Sesión] El almacenamiento de sesión no está disponible:",
      error
    );
  }

  return null;
}


function isQuotaExceededError(error) {
  return Boolean(
    error &&
    (
      error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22 ||
      error.code === 1014
    )
  );
}


function warnCacheStorage(message, error = null) {
  if (cacheStorageWarningShown) return;

  cacheStorageWarningShown = true;

  console.warn(
    message,
    error || ""
  );
}


/*
 * ============================================================
 * IDENTIDAD Y ÁMBITO DE SESIÓN
 * ============================================================
 */

function makeScopeKey(uid, role, localId) {
  const canonicalRole = getCanonicalRole(role);

  const scopedLocal = roleRequiresLocal(canonicalRole)
    ? asText(localId)
    : "*";

  return (
    `${asText(uid)}::` +
    `${canonicalRole || "SIN_ROL"}::` +
    `${scopedLocal}`
  );
}


function currentRoleFallback() {
  return getCanonicalRole(
    sessionState.currentUserContextCache?.role ||
    sessionState.currentUserContextCache?.position ||
    sessionState.sessionDataCache?.role ||
    sessionState.sessionDataCache?.context?.role ||
    sessionState.sessionDataCache?.context?.position ||
    ""
  );
}


function resolveIdentity(uid, idLocal = "", role = "") {
  const targetUid = asText(uid);

  const canonicalRole = getCanonicalRole(
    role || currentRoleFallback()
  );

  const previous = sessionState.sessionDataCache;

  const sameUser =
    previous &&
    asText(previous.uid) === targetUid;

  const contextLocal = getLocalIdFromData(
    sessionState.currentUserContextCache
  );

  const previousLocal =
    sameUser && previous.role === canonicalRole
      ? asText(previous.id_local)
      : "";

  const candidateLocal =
    asText(idLocal) ||
    contextLocal ||
    previousLocal;

  const targetLocal = roleRequiresLocal(canonicalRole)
    ? candidateLocal
    : "";

  return {
    uid: targetUid,
    role: canonicalRole,
    id_local: targetLocal,
    scopeKey: makeScopeKey(
      targetUid,
      canonicalRole,
      targetLocal
    )
  };
}


/*
 * ============================================================
 * NORMALIZACIÓN DE DATOS
 * ============================================================
 */

export function cloneForSessionCache(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (
    ["string", "number", "boolean"].includes(
      typeof value
    )
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (
    firebase?.firestore?.Timestamp &&
    value instanceof firebase.firestore.Timestamp
  ) {
    return value.toMillis();
  }

  if (Array.isArray(value)) {
    return value.map(cloneForSessionCache);
  }

  if (typeof value === "object") {
    const result = {};

    for (const [key, child] of Object.entries(value)) {
      try {
        result[key] = cloneForSessionCache(child);
      } catch (error) {
        console.warn(
          `[Sesión] No se pudo clonar el campo ${key}:`,
          error
        );
      }
    }

    return result;
  }

  return String(value);
}


/*
 * ============================================================
 * CONSTRUCCIÓN DE LA CACHÉ PERSISTIBLE
 * ============================================================
 *
 * La caché en memoria conserva todos los documentos.
 *
 * Esta función construye una copia reducida para
 * sessionStorage. Si se descartan documentos:
 *
 * - complete pasa a false.
 * - partial pasa a true.
 * - storageTruncated pasa a true.
 *
 * preload.js reconocerá esas colecciones como incompletas
 * y las consultará nuevamente cuando corresponda.
 */

function getPersistableContext(context) {
  if (!context) return null;

  try {
    const serialized = JSON.stringify(context);

    if (
      typeof serialized !== "string" ||
      serialized.length > CACHE_STORAGE_MAX_CONTEXT_CHARS
    ) {
      return null;
    }

    return context;
  } catch {
    return null;
  }
}


function getShortString(value, maxLength = 300) {
  return typeof value === "string"
    ? value.slice(0, maxLength)
    : null;
}


function buildPersistableCache(cache) {
  const context = getPersistableContext(cache.context);

  const payload = {
    version: cache.version,
    uid: cache.uid,
    role: cache.role,
    id_local: cache.id_local,
    scopeKey: cache.scopeKey,
    createdAt: cache.createdAt,
    updatedAt: cache.updatedAt,
    context,
    collections: {}
  };

  const entries = Object.entries(cache.collections || {});

  let remainingChars = Math.max(
    0,
    CACHE_STORAGE_MAX_CHARS - JSON.stringify(payload).length
  );

  for (let index = 0; index < entries.length; index += 1) {
    const [collectionName, originalEntry] = entries[index];

    const entry =
      originalEntry && typeof originalEntry === "object"
        ? originalEntry
        : {};

    const sourceDocs = Array.isArray(entry.docs)
      ? entry.docs
      : [];

    // Solo se persisten metadatos conocidos; no se copian propiedades
    // arbitrarias que puedan contener objetos grandes o duplicados.
    const persistedEntry = {
      loadedAt: Number.isFinite(entry.loadedAt)
        ? entry.loadedAt
        : null,
      docs: [],
      complete: entry.complete === true,
      partial: entry.partial === true || entry.complete !== true,
      source: getShortString(entry.source, 60),
      mode: getShortString(entry.mode, 80),
      localId: getShortString(entry.localId, 256) || "",
      period: ["string", "number"].includes(typeof entry.period)
        ? entry.period
        : null,
      sourceDocsCount: Number.isFinite(entry.sourceDocsCount)
        ? entry.sourceDocsCount
        : sourceDocs.length,
      queryKey: getShortString(entry.queryKey, 400),
      error: getShortString(entry.error, CACHE_STORAGE_MAX_ERROR_CHARS)
    };

    const metadataChars = JSON.stringify({
      [collectionName]: persistedEntry
    }).length + 1;

    remainingChars = Math.max(
      0,
      remainingChars - metadataChars
    );

    const remainingCollections = entries.length - index;

    const collectionBudget = Math.min(
      CACHE_STORAGE_MAX_COLLECTION_CHARS,
      Math.max(
        0,
        Math.floor(
          remainingChars / Math.max(1, remainingCollections)
        )
      )
    );

    const storedDocs = [];
    let usedChars = 0;
    let allDocsRetained = true;

    for (const doc of sourceDocs) {
      let serializedDoc;

      try {
        serializedDoc = JSON.stringify(doc);
      } catch {
        allDocsRetained = false;
        continue;
      }

      if (typeof serializedDoc !== "string") {
        allDocsRetained = false;
        continue;
      }

      const documentChars =
        serializedDoc.length + (storedDocs.length > 0 ? 1 : 0);

      if (serializedDoc.length > CACHE_STORAGE_MAX_DOCUMENT_CHARS) {
        allDocsRetained = false;
        continue;
      }

      if (
        usedChars + documentChars > collectionBudget ||
        usedChars + documentChars > remainingChars
      ) {
        allDocsRetained = false;
        break;
      }

      storedDocs.push(doc);
      usedChars += documentChars;
    }

    if (storedDocs.length !== sourceDocs.length) {
      allDocsRetained = false;
    }

    persistedEntry.docs = storedDocs;

    if (!allDocsRetained) {
      // Conserva la integridad lógica de la consulta original.
      // Los documentos faltantes se recuperarán desde IndexedDB de
      // Firestore y solo se aceptarán si coincide totalDocs.
      persistedEntry.complete = entry.complete === true && !entry.error;
      persistedEntry.partial = !persistedEntry.complete;
      persistedEntry.storageTruncated = true;
      persistedEntry.totalDocs = sourceDocs.length;
    }

    payload.collections[collectionName] = persistedEntry;
    remainingChars = Math.max(0, remainingChars - usedChars);
  }

  return payload;
}

/*
 * ============================================================
 * CACHÉ DE RESPALDO: SOLO METADATOS
 * ============================================================
 *
 * Se utiliza si la versión reducida todavía supera el límite.
 * Las colecciones con documentos se marcan como incompletas.
 */

function buildMetadataOnlyCache(cache) {
  const payload = {
    version: cache.version,
    uid: cache.uid,
    role: cache.role,
    id_local: cache.id_local,
    scopeKey: cache.scopeKey,
    createdAt: cache.createdAt,
    updatedAt: cache.updatedAt,
    context: getPersistableContext(cache.context),
    collections: {}
  };

  for (const [name, originalEntry] of Object.entries(
    cache.collections || {}
  )) {
    const entry =
      originalEntry && typeof originalEntry === "object"
        ? originalEntry
        : {};

    const docs = Array.isArray(entry.docs)
      ? entry.docs
      : [];

    const hasDocuments = docs.length > 0;
    const hasError = Boolean(entry.error);

    payload.collections[name] = {
      loadedAt: Number.isFinite(entry.loadedAt)
        ? entry.loadedAt
        : null,
      docs: [],
      // La consulta original puede seguir siendo completa aunque
      // los documentos se omitan de sessionStorage. preload.js
      // intentará recuperarlos desde la caché persistente de Firestore
      // y comprobará la cantidad antes de confiar en ella.
      complete:
        entry.complete === true &&
        !hasError,
      partial:
        entry.complete !== true ||
        hasError,
      source: getShortString(entry.source, 60),
      mode: getShortString(entry.mode, 80),
      localId: getShortString(entry.localId, 256) || "",
      period: ["string", "number"].includes(typeof entry.period)
        ? entry.period
        : null,
      sourceDocsCount: Number.isFinite(entry.sourceDocsCount)
        ? entry.sourceDocsCount
        : docs.length,
      queryKey: getShortString(entry.queryKey, 400),
      error: getShortString(
        entry.error,
        CACHE_STORAGE_MAX_ERROR_CHARS
      ),
      totalDocs: Number.isFinite(entry.totalDocs)
        ? entry.totalDocs
        : docs.length,
      storageTruncated: hasDocuments || Boolean(entry.storageTruncated)
    };
  }

  return payload;
}

/*
 * ============================================================
 * CACHÉ MÍNIMA
 * ============================================================
 *
 * Último recurso si incluso los metadatos superan el límite.
 * En ese caso se reconstruirá la información desde Firestore.
 */

function buildMinimalCache(cache) {
  return {
    version: cache.version,
    uid: cache.uid,
    role: cache.role,
    id_local: cache.id_local,
    scopeKey: cache.scopeKey,
    createdAt: cache.createdAt,
    updatedAt: cache.updatedAt,
    context: null,
    collections: {}
  };
}


function serializePersistableCache(cache) {
  const payloads = [
    buildPersistableCache(cache),
    buildMetadataOnlyCache(cache),
    buildMinimalCache(cache)
  ];

  const candidates = [];
  const seen = new Set();

  for (const payload of payloads) {
    let serialized;

    try {
      serialized = JSON.stringify(payload);
    } catch {
      continue;
    }

    if (
      typeof serialized !== "string" ||
      serialized.length > CACHE_STORAGE_MAX_CHARS ||
      seen.has(serialized)
    ) {
      continue;
    }

    seen.add(serialized);
    candidates.push(serialized);
  }

  if (!candidates.length) {
    throw new Error(
      "No se pudo construir una versión válida de la caché para almacenamiento."
    );
  }

  return candidates;
}

/*
 * ============================================================
 * GUARDAR CACHÉ
 * ============================================================
 */

export function saveSessionDataCache(
  cache = sessionState.sessionDataCache
) {
  if (
    !cache ||
    cache !== sessionState.sessionDataCache ||
    !cache.uid
  ) {
    return false;
  }

  if (cacheStorageUnavailable) {
    return false;
  }

  const storage = getSessionStorage();

  if (!storage) {
    warnCacheStorage(
      "[Sesión] sessionStorage no está disponible. " +
      "Los datos continúan disponibles en memoria."
    );
    return false;
  }

  let candidates;

  try {
    candidates = serializePersistableCache(cache);
  } catch (error) {
    warnCacheStorage(
      "[Sesión] No se pudo preparar la caché para almacenamiento:",
      error
    );
    return false;
  }

  let previousCacheRemoved = false;

  for (let index = 0; index < candidates.length; index += 1) {
    const serialized = candidates[index];

    try {
      storage.setItem(SESSION_CACHE_KEY, serialized);

      if (index > 0) {
        console.info(
          index === 1
            ? "[Sesión] Se persistieron solo los metadatos de la caché; los documentos completos permanecen en memoria."
            : "[Sesión] Se omitieron los datos persistidos por falta de espacio; se reconstruirán desde Firestore cuando sea necesario."
        );
      }

      return true;
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        warnCacheStorage(
          "[Sesión] No se pudo guardar la caché de sesión:",
          error
        );
        return false;
      }

      // Primero se libera únicamente la copia anterior de esta aplicación.
      // Después se reintenta la misma versión y, si aún no cabe, se prueba
      // una representación progresivamente más pequeña.
      if (!previousCacheRemoved) {
        previousCacheRemoved = true;

        try {
          storage.removeItem(SESSION_CACHE_KEY);
        } catch {
          // Se continúa con las alternativas reducidas.
        }

        try {
          storage.setItem(SESSION_CACHE_KEY, serialized);
          return true;
        } catch (retryError) {
          if (!isQuotaExceededError(retryError)) {
            warnCacheStorage(
              "[Sesión] No se pudo guardar la caché después de liberar la copia anterior:",
              retryError
            );
            return false;
          }
        }
      }
    }
  }

  // Ni siquiera la versión mínima cabe. Se deja de intentar escribir
  // durante esta carga de la aplicación para evitar errores repetidos.
  try {
    storage.removeItem(SESSION_CACHE_KEY);
  } catch {
    // El almacenamiento puede estar bloqueado.
  }

  cacheStorageUnavailable = true;

  warnCacheStorage(
    "[Sesión] sessionStorage agotó su cuota. Se omitió la persistencia de la caché; " +
    "los datos completos siguen disponibles en memoria y la aplicación puede continuar."
  );

  return false;
}

/*
 * ============================================================
 * RESTAURAR CACHÉ
 * ============================================================
 */

export function loadSessionDataCache(uid = "", options = {}) {
  const targetUid = asText(uid);

  if (!targetUid) return null;

  const storage = getSessionStorage();

  if (!storage) return null;

  try {
    const raw = storage.getItem(SESSION_CACHE_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      parsed.version !== SESSION_CACHE_VERSION ||
      asText(parsed.uid) !== targetUid ||
      !parsed.collections ||
      typeof parsed.collections !== "object"
    ) {
      storage.removeItem(SESSION_CACHE_KEY);
      return null;
    }

    const expectedRole = getCanonicalRole(
      options.role || ""
    );

    if (
      expectedRole &&
      getCanonicalRole(parsed.role) !== expectedRole
    ) {
      return null;
    }

    if (
      expectedRole &&
      roleRequiresLocal(expectedRole)
    ) {
      const expectedLocal = asText(
        options.id_local || options.localId
      );

      if (
        expectedLocal &&
        asText(parsed.id_local) !== expectedLocal
      ) {
        return null;
      }
    }

    const parsedRole = getCanonicalRole(
      parsed.role ||
      parsed.context?.role ||
      ""
    );

    const parsedLocal = roleRequiresLocal(parsedRole)
      ? asText(parsed.id_local)
      : "";

    const expectedScopeKey = makeScopeKey(
      targetUid,
      parsedRole,
      parsedLocal
    );

    /*
     * Las cachés creadas antes de la versión actual se
     * invalidan por versión.
     */

    if (parsed.scopeKey !== expectedScopeKey) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn(
      "[Sesión] No se pudo restaurar la caché:",
      error
    );

    try {
      storage.removeItem(SESSION_CACHE_KEY);
    } catch {
      // sessionStorage puede estar bloqueado.
    }

    return null;
  }
}


/*
 * ============================================================
 * COMPROBAR COMPLETITUD
 * ============================================================
 */

export function isSessionCacheComplete(
  cache,
  role = "",
  requiredCollectionNames = SESSION_PRELOAD_COLLECTIONS.map(
    config => config.name
  )
) {
  if (
    !cache?.context ||
    !cache.collections ||
    typeof cache.collections !== "object"
  ) {
    return false;
  }

  const canonicalRole = getCanonicalRole(
    role ||
    cache.role ||
    cache.context.role ||
    cache.context.position ||
    ""
  );

  if (!canonicalRole) return false;

  return requiredCollectionNames.every(name => {
    const entry = cache.collections[name];

    return Boolean(
      entry &&
      Array.isArray(entry.docs) &&
      entry.complete === true &&
      !entry.error
    );
  });
}


/*
 * ============================================================
 * CREAR CACHÉ VACÍA
 * ============================================================
 */

export function createEmptySessionDataCache(
  uid,
  idLocal = "",
  role = ""
) {
  const identity = resolveIdentity(
    uid,
    idLocal,
    role
  );

  const now = Date.now();

  const cache = {
    version: SESSION_CACHE_VERSION,
    uid: identity.uid,
    role: identity.role,
    id_local: identity.id_local,
    scopeKey: identity.scopeKey,
    createdAt: now,
    updatedAt: now,
    collections: {},
    context: null
  };

  sessionState.sessionDataCache = cache;
  sessionState.sessionDataCacheUid = identity.uid;

  return cache;
}


/*
 * ============================================================
 * ASEGURAR CONTENEDOR DE CACHÉ
 * ============================================================
 */

export function ensureSessionCacheContainer(
  uid,
  idLocal = "",
  role = ""
) {
  const targetUid = asText(uid);

  if (!targetUid) return null;

  const resolvedRole = getCanonicalRole(
    role || currentRoleFallback()
  );

  if (!resolvedRole) {
    const currentWithoutRole =
      sessionState.sessionDataCache;

    if (
      currentWithoutRole &&
      asText(currentWithoutRole.uid) === targetUid &&
      currentWithoutRole.version === SESSION_CACHE_VERSION
    ) {
      return currentWithoutRole;
    }

    /*
     * En una recarga, getSessionContext() puede ejecutarse
     * antes de reconstruir currentUserContextCache.
     */

    const restoredWithoutRole = loadSessionDataCache(
      targetUid
    );

    if (restoredWithoutRole) {
      sessionState.sessionDataCache = restoredWithoutRole;
      sessionState.sessionDataCacheUid = targetUid;

      return restoredWithoutRole;
    }
  }

  const identity = resolveIdentity(
    targetUid,
    idLocal,
    resolvedRole
  );

  const current = sessionState.sessionDataCache;

  if (
    current &&
    asText(current.uid) === identity.uid &&
    current.scopeKey === identity.scopeKey &&
    current.version === SESSION_CACHE_VERSION
  ) {
    sessionState.sessionDataCacheUid = identity.uid;

    return current;
  }

  const restored = loadSessionDataCache(
    identity.uid,
    {
      role: identity.role,
      id_local: identity.id_local
    }
  );

  if (
    restored &&
    restored.scopeKey === identity.scopeKey
  ) {
    sessionState.sessionDataCache = restored;
    sessionState.sessionDataCacheUid = identity.uid;

    return restored;
  }

  /*
   * Un usuario, rol o local diferente nunca hereda
   * documentos de la caché anterior.
   */

  return createEmptySessionDataCache(
    identity.uid,
    identity.id_local,
    identity.role
  );
}


/*
 * ============================================================
 * CONTEXTO DE SESIÓN
 * ============================================================
 */

export function setSessionContext(context) {
  if (!context?.uid) return;

  const canonicalRole = getCanonicalRole(
    context.role || context.position || ""
  );

  const localId = roleRequiresLocal(canonicalRole)
    ? getLocalIdFromData(context)
    : "";

  const cache = ensureSessionCacheContainer(
    context.uid,
    localId,
    canonicalRole
  );

  if (!cache) return;

  cache.context = cloneForSessionCache(context);
  cache.uid = asText(context.uid);
  cache.role = canonicalRole;

  cache.id_local = roleRequiresLocal(canonicalRole)
    ? localId
    : "";

  cache.scopeKey = makeScopeKey(
    cache.uid,
    cache.role,
    cache.id_local
  );

  cache.updatedAt = Date.now();

  saveSessionDataCache(cache);
}


export function getSessionContext(
  uid = auth.currentUser?.uid
) {
  const targetUid = asText(uid);

  if (!targetUid) return null;

  const cache = ensureSessionCacheContainer(targetUid);

  if (
    !cache?.context ||
    asText(cache.context.uid) !== targetUid
  ) {
    return null;
  }

  return {
    ...cache.context
  };
}


/*
 * ============================================================
 * NORMALIZAR DOCUMENTOS
 * ============================================================
 */

function normalizeDocuments(documents = []) {
  if (!Array.isArray(documents)) return [];

  return documents
    .map(item => ({
      id: asText(item?.id),
      data: cloneForSessionCache(item?.data || {})
    }))
    .filter(item => item.id);
}


/*
 * ============================================================
 * GUARDAR COLECCIÓN
 * ============================================================
 */

export function seedSessionCollection(
  collectionName,
  documents = [],
  options = {}
) {
  const user = auth.currentUser;

  if (!user?.uid || !collectionName) return false;

  const contextRole =
    options.role || currentRoleFallback();

  const cache = ensureSessionCacheContainer(
    user.uid,
    options.id_local || getCurrentLocalId(),
    contextRole
  );

  if (!cache) return false;

  const complete = options.complete !== false;

  const normalizedDocuments = normalizeDocuments(documents);

  cache.collections[collectionName] = {
    loadedAt: Date.now(),

    docs: normalizedDocuments,

    complete,
    partial: !complete,

    source: options.source || "seed",
    mode: options.mode || "manual",
    localId: options.localId || "",
    period: options.period || null,
    sourceDocsCount: Number.isFinite(options.sourceDocsCount)
      ? options.sourceDocsCount
      : normalizedDocuments.length,
    totalDocs: normalizedDocuments.length,
    storageTruncated: false,
    queryKey: options.queryKey || null,
    error: options.error || null
  };

  cache.updatedAt = Date.now();

  saveSessionDataCache(cache);

  return true;
}


export function setSessionCollection(
  collectionName,
  documents = [],
  options = {}
) {
  return seedSessionCollection(
    collectionName,
    documents,
    options
  );
}


/*
 * ============================================================
 * LEER COLECCIÓN
 * ============================================================
 */

export function getSessionCollection(
  collectionName,
  options = {}
) {
  const user = auth.currentUser;

  const targetUid = asText(
    options.uid || user?.uid
  );

  if (!targetUid || !collectionName) return [];

  const contextRole =
    options.role || currentRoleFallback();

  const cache = ensureSessionCacheContainer(
    targetUid,
    options.id_local || getCurrentLocalId(),
    contextRole
  );

  const entry = cache?.collections?.[collectionName];

  if (!entry || !Array.isArray(entry.docs)) {
    return [];
  }

  return entry.docs.map(doc => ({
    id: doc.id,
    data: {
      ...(doc.data || {})
    }
  }));
}


export function getSessionCollectionData(
  collectionName,
  options = {}
) {
  return getSessionCollection(
    collectionName,
    options
  ).map(item => ({
    id: item.id,
    ...item.data
  }));
}


/*
 * ============================================================
 * ESTADO DE UNA COLECCIÓN
 * ============================================================
 */

export function getSessionCollectionStatus(
  collectionName,
  options = {}
) {
  const user = auth.currentUser;

  const targetUid = asText(
    options.uid || user?.uid
  );

  if (!targetUid || !collectionName) {
    return {
      loaded: false,
      complete: false,
      partial: false,
      count: 0,
      error: null
    };
  }

  const cache = ensureSessionCacheContainer(
    targetUid,
    options.id_local || getCurrentLocalId(),
    options.role || currentRoleFallback()
  );

  const entry = cache?.collections?.[collectionName];

  const docs = Array.isArray(entry?.docs)
    ? entry.docs
    : [];

  return {
    loaded: Boolean(entry),

    complete:
      entry?.complete === true &&
      !entry?.error,

    partial:
      Boolean(entry) &&
      entry.complete !== true,

    count: docs.length,

    totalDocs: Number.isFinite(entry?.totalDocs)
      ? entry.totalDocs
      : docs.length,

    storageTruncated: entry?.storageTruncated === true,

    localId: entry?.localId || "",

    period: entry?.period || null,

    sourceDocsCount: Number.isFinite(entry?.sourceDocsCount)
      ? entry.sourceDocsCount
      : docs.length,

    loadedAt: entry?.loadedAt || null,

    mode: entry?.mode || null,

    queryKey: entry?.queryKey || null,

    error: entry?.error || null
  };
}


/*
 * ============================================================
 * LEER DOCUMENTO
 * ============================================================
 */

export function getSessionDocument(
  collectionName,
  documentId,
  options = {}
) {
  const target = asText(documentId);

  if (!target) return null;

  return (
    getSessionCollection(collectionName, options)
      .find(doc => asText(doc.id) === target) ||
    null
  );
}


/*
 * ============================================================
 * INSERTAR O ACTUALIZAR DOCUMENTO EN CACHÉ
 * ============================================================
 */

export function upsertSessionDocument(
  collectionName,
  documentId,
  data = {}
) {
  const user = auth.currentUser;

  const targetId = asText(documentId);

  if (
    !user?.uid ||
    !collectionName ||
    !targetId
  ) {
    return false;
  }

  const cache = ensureSessionCacheContainer(
    user.uid,
    getCurrentLocalId(),
    currentRoleFallback()
  );

  if (!cache) return false;

  if (!cache.collections[collectionName]) {
    cache.collections[collectionName] = {
      loadedAt: Date.now(),
      docs: [],
      complete: false,
      partial: true,
      source: "write-through",
      mode: "partial",
      queryKey: null
    };
  }

  const entry = cache.collections[collectionName];

  if (!Array.isArray(entry.docs)) {
    entry.docs = [];
  }

  const index = entry.docs.findIndex(
    doc => asText(doc.id) === targetId
  );

  const normalizedData = cloneForSessionCache(data);

  if (index >= 0) {
    entry.docs[index] = {
      id: targetId,
      data: {
        ...(entry.docs[index].data || {}),
        ...normalizedData
      }
    };
  } else {
    entry.docs.push({
      id: targetId,
      data: normalizedData
    });
  }

  /*
   * Una mutación individual no convierte una colección
   * parcial en completa.
   */

  entry.partial = entry.complete !== true;
  entry.source = "write-through";
  entry.updatedAt = Date.now();

  cache.updatedAt = Date.now();

  saveSessionDataCache(cache);

  return true;
}


/*
 * ============================================================
 * ELIMINAR DOCUMENTO DE LA CACHÉ
 * ============================================================
 */

export function removeSessionDocument(
  collectionName,
  documentId
) {
  const user = auth.currentUser;

  const targetId = asText(documentId);

  if (
    !user?.uid ||
    !collectionName ||
    !targetId
  ) {
    return false;
  }

  const cache = ensureSessionCacheContainer(
    user.uid,
    getCurrentLocalId(),
    currentRoleFallback()
  );

  const entry = cache?.collections?.[collectionName];

  if (!entry || !Array.isArray(entry.docs)) {
    return false;
  }

  const before = entry.docs.length;

  entry.docs = entry.docs.filter(
    doc => asText(doc.id) !== targetId
  );

  const changed = entry.docs.length !== before;

  if (changed) {
    entry.partial = entry.complete !== true;
    entry.source = "write-through";
    entry.updatedAt = Date.now();

    cache.updatedAt = Date.now();

    saveSessionDataCache(cache);
  }

  return changed;
}


/*
 * ============================================================
 * ACTUALIZAR DOCUMENTOS POR CONDICIÓN
 * ============================================================
 */

export function updateSessionDocumentsWhere(
  collectionName,
  predicate,
  patch = {}
) {
  const user = auth.currentUser;

  if (
    !user?.uid ||
    !collectionName ||
    typeof predicate !== "function"
  ) {
    return 0;
  }

  const cache = ensureSessionCacheContainer(
    user.uid,
    getCurrentLocalId(),
    currentRoleFallback()
  );

  const entry = cache?.collections?.[collectionName];

  if (!entry || !Array.isArray(entry.docs)) {
    return 0;
  }

  let changed = 0;

  entry.docs.forEach(doc => {
    if (predicate(doc)) {
      doc.data = {
        ...(doc.data || {}),
        ...cloneForSessionCache(patch)
      };

      changed += 1;
    }
  });

  if (changed) {
    entry.source = "write-through";
    entry.updatedAt = Date.now();

    cache.updatedAt = Date.now();

    saveSessionDataCache(cache);
  }

  return changed;
}


/*
 * ============================================================
 * INVALIDAR COLECCIÓN
 * ============================================================
 */

export function invalidateSessionCollection(
  collectionName
) {
  const cache = sessionState.sessionDataCache;

  const entry = cache?.collections?.[collectionName];

  if (!entry) return false;

  entry.complete = false;
  entry.partial = true;
  entry.invalidatedAt = Date.now();

  cache.updatedAt = Date.now();

  saveSessionDataCache(cache);

  return true;
}


/*
 * ============================================================
 * LIMPIAR CACHÉ
 * ============================================================
 */

export function clearSessionDataCache() {
  cacheStorageUnavailable = false;
  cacheStorageWarningShown = false;

  sessionState.sessionDataCache = null;
  sessionState.sessionDataCacheUid = "";
  sessionState.sessionDataCachePromise = null;
  sessionState.sessionDataCachePromiseKey = "";

  const storage = getSessionStorage();

  try {
    storage?.removeItem(SESSION_CACHE_KEY);
  } catch {
    // sessionStorage puede no estar disponible.
  }
}


/*
 * ============================================================
 * ESTADO GENERAL DE LA CACHÉ
 * ============================================================
 */

export function getSessionCacheStatus(
  uid = auth.currentUser?.uid
) {
  const targetUid = asText(uid);

  if (!targetUid) {
    return {
      loaded: false,
      complete: false,
      uid: "",
      role: "",
      requiresLocal: true,
      id_local: "",
      scopeKey: "",
      collections: {}
    };
  }

  const cache = ensureSessionCacheContainer(targetUid);

  const role = getCanonicalRole(
    cache?.role ||
    cache?.context?.role ||
    ""
  );

  const collections = {};

  for (const [name, entry] of Object.entries(
    cache?.collections || {}
  )) {
    const docs = Array.isArray(entry?.docs)
      ? entry.docs
      : [];

    collections[name] = {
      count: docs.length,

      complete:
        entry?.complete === true &&
        !entry?.error,

      partial:
        Boolean(entry) &&
        entry.complete !== true,

      mode: entry?.mode || null,

      error: entry?.error || null
    };
  }

  const cachedNames = Object.keys(
    cache?.collections || {}
  );

  const completeForCachedCollections =
    cachedNames.length > 0 &&
    cachedNames.every(name => {
      const entry = cache.collections[name];

      return (
        entry?.complete === true &&
        !entry?.error
      );
    });

  return {
    loaded: Boolean(cache),

    /*
     * "complete" describe únicamente las colecciones
     * presentes en esta caché.
     *
     * Para comprobar una página concreta, utilizar
     * isSessionCacheComplete(cache, role, names).
     */

    complete: completeForCachedCollections,

    completeForDefaultPreload:
      isSessionCacheComplete(cache, role),

    uid: cache?.uid || targetUid,

    role,

    requiresLocal: roleRequiresLocal(role),

    id_local: isDeveloperRole(role)
      ? ""
      : (cache?.id_local || ""),

    scopeKey: cache?.scopeKey || "",

    collections
  };
}


/*
 * Puente para los módulos clásicos de inventario. Permite reemplazar
 * una colección completa sin duplicar la lógica de session/cache.js.
 */
if (typeof window !== "undefined") {
  window.replaceSessionCollection = (
    collectionName,
    documents = [],
    options = {}
  ) => setSessionCollection(collectionName, documents, options);
}
