//js/session/preload.js
import { auth, db, firebase, firestoreReady } from "../config/firebase.js";

import {
  getCanonicalRole,
  roleRequiresLocal
} from "../security/roles.js";

import { getCurrentPageFile } from "../utils/page.js";

import { getTimestampMs } from "../utils/timestamps.js";

import { getCurrentUserContext } from "./user-context.js";

import {
  getLocalIdFromData,
  matchesLocalContext
} from "./local-context.js";

import { sessionState } from "./state.js";

import {
  getSessionPreloadConfigs
} from "./preload-config.js";

import {
  cloneForSessionCache,
  saveSessionDataCache,
  ensureSessionCacheContainer,
  clearSessionDataCache
} from "./cache.js";


const asText = value => String(value ?? "").trim();

let persistenceInfoShown = false;


/*
 * ============================================================
 * PERSISTENCIA SEGURA
 * ============================================================
 *
 * Un error al guardar sessionStorage no debe impedir que
 * la aplicación continúe utilizando los datos en memoria.
 */

function persistSessionCache(cache) {
  let saved = false;

  try {
    saved = saveSessionDataCache(cache);
  } catch (error) {
    // La persistencia es opcional: nunca debe interrumpir la precarga.
    if (!persistenceInfoShown) {
      persistenceInfoShown = true;

      console.info(
        "[Sesión] No se pudo persistir la caché. " +
        "Los datos precargados continúan disponibles en memoria.",
        error
      );
    }

    return false;
  }

  if (!saved && !persistenceInfoShown) {
    persistenceInfoShown = true;

    console.info(
      "[Sesión] La caché no se pudo persistir. " +
      "Los datos precargados continúan disponibles en memoria."
    );
  }

  return saved;
}


/*
 * ============================================================
 * UTILIDADES DE FECHA
 * ============================================================
 */

function getCurrentMonthKey(date = new Date()) {
  return (
    `${date.getFullYear()}-` +
    `${String(date.getMonth() + 1).padStart(2, "0")}`
  );
}


/*
 * ============================================================
 * CLAVE DE CONSULTA
 * ============================================================
 */

function getConfigQueryKey(config, localId, role) {
  const mode = asText(config?.mode);

  const base =
    `${config?.name || ""}::` +
    `${mode}::` +
    `${asText(role)}::` +
    `${asText(localId)}`;

  return mode === "local-current-month"
    ? `${base}::${getCurrentMonthKey()}`
    : base;
}


/*
 * ============================================================
 * VALIDAR SUFICIENCIA DE COLECCIÓN
 * ============================================================
 */

function isCollectionEntrySufficient(
  entry,
  config,
  queryKey
) {
  if (
    !entry ||
    !Array.isArray(entry.docs) ||
    entry.complete !== true ||
    entry.error ||
    (entry.storageTruncated === true && entry.docs.length === 0)
  ) {
    return false;
  }

  /*
   * Una colección completa con la misma clave de consulta
   * puede reutilizarse.
   */

  if (entry.queryKey === queryKey) {
    return true;
  }

  /*
   * Una descarga completa del local puede satisfacer
   * una solicitud mensual.
   */

  return (
    config?.mode === "local-current-month" &&
    entry.mode === "local" &&
    entry.localId === config.localId
  );
}


/*
 * ============================================================
 * VALIDAR SESIÓN ACTIVA
 * ============================================================
 */

function assertActiveSession(user, cache, scopeKey) {
  const activeUid = asText(
    auth.currentUser?.uid
  );

  if (
    activeUid &&
    activeUid !== asText(user?.uid)
  ) {
    throw new Error(
      "La sesión cambió mientras se precargaban los datos."
    );
  }

  if (
    sessionState.sessionDataCache !== cache ||
    cache?.scopeKey !== scopeKey ||
    asText(cache?.uid) !== asText(user?.uid)
  ) {
    throw new Error(
      "El contexto de usuario o local cambió durante la precarga."
    );
  }
}


/*
 * ============================================================
 * CONVERTIR SNAPSHOT A DOCUMENTOS
 * ============================================================
 */

function snapshotToDocuments(snapshot) {
  const documents = [];

  snapshot.forEach(doc => {
    documents.push({
      id: doc.id,
      data: doc.data() || {}
    });
  });

  return documents;
}


/*
 * ============================================================
 * CONSULTAR COLECCIÓN SEGÚN SU MODO
 * ============================================================
 */

async function getQuerySnapshot(query, config, localId, role) {
  await firestoreReady;

  const cache = sessionState.sessionDataCache;
  const entry = cache?.collections?.[config.name];
  const queryKey = getConfigQueryKey(config, localId, role);
  const canRestoreFromFirestoreCache = Boolean(
    entry &&
    entry.complete === true &&
    entry.storageTruncated === true &&
    entry.queryKey === queryKey &&
    Number.isInteger(entry.sourceDocsCount ?? entry.totalDocs) &&
    (entry.sourceDocsCount ?? entry.totalDocs) >= 0
  );

  if (canRestoreFromFirestoreCache) {
    try {
      const cachedSnapshot = await query.get({ source: "cache" });

      const expectedSourceCount = entry.sourceDocsCount ?? entry.totalDocs;

      if (cachedSnapshot.size === expectedSourceCount) {
        console.info(
          `[Sesión] ${config.name}: recuperados ${cachedSnapshot.size} documentos desde IndexedDB de Firestore.`
        );
        return cachedSnapshot;
      }

      console.info(
        `[Sesión] ${config.name}: la caché local contiene ${cachedSnapshot.size} de ${entry.totalDocs} documentos; se actualizará desde el servidor.`
      );
    } catch (error) {
      console.info(
        `[Sesión] ${config.name}: no se pudo restaurar desde la caché local; se consultará el servidor.`,
        error?.message || error
      );
    }

    return query.get({ source: "server" });
  }

  return query.get();
}


export async function querySessionCollection(
  config,
  localId,
  role = ""
) {
  if (!config?.name) {
    throw new Error(
      "La configuración de colección no es válida."
    );
  }

  const canonicalRole = getCanonicalRole(role);

  const targetLocalId = asText(localId);

  const mode = asText(config.mode);


  /*
   * ----------------------------------------------------------
   * MODO: ID
   * ----------------------------------------------------------
   */

  if (mode === "id") {
    const documentId = asText(
      config.documentId || targetLocalId
    );

    if (!documentId) {
      return {
        name: config.name,
        documents: [],
        mode,
        localId: targetLocalId
      };
    }

    const doc = await getQuerySnapshot(
      db.collection(config.name).doc(documentId),
      config,
      targetLocalId,
      canonicalRole
    );

    return {
      name: config.name,

      documents: doc.exists
        ? [
            {
              id: doc.id,
              data: doc.data() || {}
            }
          ]
        : [],

      mode,
      localId: targetLocalId
    };
  }


  /*
   * ----------------------------------------------------------
   * MODO: EMPLOYEE-ROLE-AWARE
   * ----------------------------------------------------------
   */

  if (mode === "employee-role-aware") {
    if (canonicalRole === "Desarrollador") {
      const snapshot = await getQuerySnapshot(
        db.collection(config.name),
        config,
        targetLocalId,
        canonicalRole
      );

      return {
        name: config.name,
        documents: snapshotToDocuments(snapshot),
        mode,
        localId: ""
      };
    }

    if (
      ["Administrador", "Bodega"].includes(
        canonicalRole
      )
    ) {
      if (!targetLocalId) {
        throw new Error(
          `No hay local asociado para consultar ${config.name}.`
        );
      }

      const snapshot = await getQuerySnapshot(
        db.collection(config.name).where("id_local", "==", targetLocalId),
        config,
        targetLocalId,
        canonicalRole
      );

      const documents = snapshotToDocuments(
        snapshot
      ).filter(item =>
        matchesLocalContext(
          item.data,
          targetLocalId
        )
      );

      return {
        name: config.name,
        documents,
        mode,
        localId: targetLocalId
      };
    }

    /*
     * Para los demás roles, una lista vacía es el resultado
     * autorizado por la política actual.
     */

    return {
      name: config.name,
      documents: [],
      mode,
      localId: targetLocalId
    };
  }


  /*
   * ----------------------------------------------------------
   * MODO: LOCAL-CURRENT-MONTH
   * ----------------------------------------------------------
   */

  if (mode === "local-current-month") {
    if (
      !roleRequiresLocal(canonicalRole) ||
      !targetLocalId
    ) {
      throw new Error(
        `No hay un local válido para consultar ${config.name}.`
      );
    }

    const now = new Date();

    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0
    );

    const nextMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
      0,
      0,
      0,
      0
    );

    /*
     * Este filtro se hace en memoria.
     *
     * Firestore entrega todos los documentos del local y
     * factura las lecturas de esos documentos, aunque luego
     * se descarte la mayoría.
     *
     * No se cambia a un filtro por createdAt hasta confirmar
     * que todos los registros históricos usan el mismo tipo
     * de dato y que existe el índice compuesto requerido.
     */

    const snapshot = await getQuerySnapshot(
      db.collection(config.name).where("id_local", "==", targetLocalId),
      config,
      targetLocalId,
      canonicalRole
    );

    const documents = snapshotToDocuments(
      snapshot
    ).filter(item => {
      if (
        !matchesLocalContext(
          item.data,
          targetLocalId
        )
      ) {
        return false;
      }

      const createdAtMs = getTimestampMs(
        item.data.createdAt
      );

      return (
        Boolean(createdAtMs) &&
        createdAtMs >= monthStart.getTime() &&
        createdAtMs < nextMonthStart.getTime()
      );
    });

    console.info(
      `[Sesión] ${config.name}: ` +
      `documentos leídos=${snapshot.size}, ` +
      `documentos del mes=${documents.length}, ` +
      `local=${targetLocalId}.`
    );

    return {
      name: config.name,
      documents,
      mode,
      localId: targetLocalId,
      period: getCurrentMonthKey(),
      sourceDocsCount: snapshot.size
    };
  }


  /*
   * ----------------------------------------------------------
   * MODO: LOCAL
   * ----------------------------------------------------------
   */

  if (mode === "local") {
    if (!roleRequiresLocal(canonicalRole)) {
      return {
        name: config.name,
        documents: [],
        mode,
        localId: ""
      };
    }

    if (!targetLocalId) {
      throw new Error(
        `No hay un local válido para consultar ${config.name}.`
      );
    }

    const snapshot = await getQuerySnapshot(
      db.collection(config.name).where("id_local", "==", targetLocalId),
      config,
      targetLocalId,
      canonicalRole
    );

    const documents = snapshotToDocuments(
      snapshot
    ).filter(item =>
      matchesLocalContext(
        item.data,
        targetLocalId
      )
    );

    console.info(
      `[Sesión] ${config.name}: ` +
      `documentos leídos=${snapshot.size}, ` +
      `documentos válidos=${documents.length}, ` +
      `local=${targetLocalId}.`
    );

    return {
      name: config.name,
      documents,
      mode,
      localId: targetLocalId
    };
  }


  /*
   * ----------------------------------------------------------
   * MODO: DEVELOPER-ALL
   * ----------------------------------------------------------
   */

  if (mode === "developer-all") {
    if (canonicalRole !== "Desarrollador") {
      return {
        name: config.name,
        documents: [],
        mode,
        localId: ""
      };
    }

    const snapshot = await getQuerySnapshot(
      db.collection(config.name),
      config,
      targetLocalId,
      canonicalRole
    );

    return {
      name: config.name,
      documents: snapshotToDocuments(snapshot),
      mode,
      localId: ""
    };
  }


  /*
   * ----------------------------------------------------------
   * MODO DESCONOCIDO
   * ----------------------------------------------------------
   *
   * Evita que un modo mal escrito termine descargando
   * accidentalmente toda una colección.
   */

  throw new Error(
    `Modo de precarga no reconocido: ${mode || "(vacío)"}.`
  );
}


/*
 * ============================================================
 * PRECARGAR DATOS DE SESIÓN
 * ============================================================
 */

export async function preloadSessionData(
  user = auth.currentUser,
  options = {}
) {
  if (!user?.uid) return null;


  /*
   * ----------------------------------------------------------
   * VALIDAR USUARIO AUTENTICADO
   * ----------------------------------------------------------
   */

  if (
    auth.currentUser?.uid &&
    auth.currentUser.uid !== user.uid
  ) {
    throw new Error(
      "El usuario solicitado no coincide con la sesión autenticada."
    );
  }


  /*
   * ----------------------------------------------------------
   * FORZAR ACTUALIZACIÓN
   * ----------------------------------------------------------
   */

  if (options.forceRefresh === true) {
    clearSessionDataCache();
  }


  /*
   * ----------------------------------------------------------
   * OBTENER CONFIGURACIÓN Y CONTEXTO
   * ----------------------------------------------------------
   */

  const requiredConfigs = getSessionPreloadConfigs(
    options
  );

  const context = await getCurrentUserContext(user);

  if (!context) {
    throw new Error(
      "No existe contexto para la sesión actual."
    );
  }

  const canonicalRole = getCanonicalRole(
    context.role || context.position || ""
  );

  if (!canonicalRole) {
    throw new Error(
      "El usuario autenticado no tiene un rol válido."
    );
  }


  /*
   * ----------------------------------------------------------
   * VALIDAR LOCAL
   * ----------------------------------------------------------
   */

  const requiresLocal = roleRequiresLocal(
    canonicalRole
  );

  const localId = requiresLocal
    ? getLocalIdFromData(context)
    : "";

  if (requiresLocal && !localId) {
    throw new Error(
      "El usuario autenticado no tiene un id_local válido."
    );
  }


  /*
   * ----------------------------------------------------------
   * OBTENER CONTENEDOR DE CACHÉ
   * ----------------------------------------------------------
   */

  const cache = ensureSessionCacheContainer(
    user.uid,
    localId,
    canonicalRole
  );

  if (!cache) {
    throw new Error(
      "No se pudo inicializar la caché de la sesión."
    );
  }

  const scopeKey = cache.scopeKey;


  /*
   * ----------------------------------------------------------
   * ACTUALIZAR CONTEXTO EN MEMORIA
   * ----------------------------------------------------------
   *
   * Se compara el contexto anterior con el nuevo para evitar
   * una escritura innecesaria cuando no hay cambios.
   */

  let previousContextText = "";
  let nextContextText = "";

  try {
    previousContextText = JSON.stringify(
      cache.context ?? null
    );
  } catch {
    previousContextText = "";
  }

  const nextContext = cloneForSessionCache(context);

  try {
    nextContextText = JSON.stringify(
      nextContext ?? null
    );
  } catch {
    nextContextText = "";
  }

  const contextChanged =
    previousContextText !== nextContextText;

  const identityChanged =
    asText(cache.uid) !== asText(user.uid) ||
    cache.role !== canonicalRole ||
    asText(cache.id_local) !== asText(localId);

  cache.context = nextContext;
  cache.uid = user.uid;
  cache.role = canonicalRole;

  cache.id_local = requiresLocal
    ? localId
    : "";

  cache.updatedAt =
    contextChanged || identityChanged
      ? Date.now()
      : cache.updatedAt;


  /*
   * ----------------------------------------------------------
   * ESPERAR UNA PRECARGA DEL MISMO ÁMBITO
   * ----------------------------------------------------------
   *
   * Una precarga del mismo usuario, rol y local se comparte.
   * Una precarga de otro usuario/local no puede escribir sobre
   * la caché activa.
   */

  if (
    sessionState.sessionDataCachePromise &&
    sessionState.sessionDataCachePromiseKey === scopeKey
  ) {
    await sessionState.sessionDataCachePromise;

    assertActiveSession(
      user,
      cache,
      scopeKey
    );
  }


  /*
   * ----------------------------------------------------------
   * DETERMINAR COLECCIONES PENDIENTES
   * ----------------------------------------------------------
   */

  const missingConfigs = requiredConfigs.filter(
    config => {
      const queryKey = getConfigQueryKey(
        config,
        localId,
        canonicalRole
      );

      const entry = cache.collections?.[config.name];

      return !isCollectionEntrySufficient(
        entry,
        {
          ...config,
          localId
        },
        queryKey
      );
    }
  );


  /*
   * ----------------------------------------------------------
   * SI NO HAY COLECCIONES PENDIENTES
   * ----------------------------------------------------------
   *
   * Solo se guarda nuevamente si cambió el contexto o la
   * identidad. No se vuelve a serializar toda la caché
   * innecesariamente.
   */

  if (!missingConfigs.length) {
    if (contextChanged || identityChanged) {
      persistSessionCache(cache);
    }

    return cache;
  }


  /*
   * ----------------------------------------------------------
   * EJECUTAR CONSULTAS
   * ----------------------------------------------------------
   */

  const preloadPromise = (async () => {
    const results = await Promise.allSettled(
      missingConfigs.map(config =>
        querySessionCollection(
          config,
          localId,
          canonicalRole
        )
      )
    );

    assertActiveSession(
      user,
      cache,
      scopeKey
    );

    let preloadErrors = 0;


    /*
     * --------------------------------------------------------
     * PROCESAR RESULTADOS
     * --------------------------------------------------------
     */

    results.forEach((result, index) => {
      const config = missingConfigs[index];

      const queryKey = getConfigQueryKey(
        config,
        localId,
        canonicalRole
      );


      /*
       * CONSULTA EXITOSA
       */

      if (result.status === "fulfilled") {
        const value = result.value;

        const documents = Array.isArray(
          value.documents
        )
          ? value.documents
          : [];

        cache.collections[config.name] = {
          loadedAt: Date.now(),

          docs: documents.map(doc => ({
            id: asText(doc.id),

            data: cloneForSessionCache(
              doc.data || {}
            )
          })),

          complete: true,
          partial: false,
          totalDocs: documents.length,
          sourceDocsCount: Number.isFinite(value.sourceDocsCount)
            ? value.sourceDocsCount
            : documents.length,
          storageTruncated: false,

          source: "preload",

          mode: value.mode || config.mode,

          localId: value.localId || "",

          period: value.period || null,

          queryKey
        };

        console.info(
          `[Sesión] ${config.name}: ` +
          `${documents.length} documentos almacenados ` +
          `(modo=${value.mode || config.mode}).`
        );

        return;
      }


      /*
       * CONSULTA FALLIDA
       */

      preloadErrors += 1;

      const errorMessage =
        result.reason?.message ||
        String(
          result.reason ||
          "Error desconocido"
        );

      console.error(
        `[Sesión] Error precargando ${config.name}:`,
        result.reason
      );

      cache.collections[config.name] = {
        loadedAt: Date.now(),

        docs: [],

        complete: false,
        partial: true,

        source: "preload",

        mode: config.mode,

        localId,

        queryKey,

        error: errorMessage
      };
    });


    /*
     * --------------------------------------------------------
     * VALIDAR SESIÓN Y ACTUALIZAR CACHÉ
     * --------------------------------------------------------
     */

    assertActiveSession(
      user,
      cache,
      scopeKey
    );

    cache.updatedAt = Date.now();


    /*
     * --------------------------------------------------------
     * PERSISTIR UNA SOLA VEZ AL FINAL
     * --------------------------------------------------------
     *
     * saveSessionDataCache construye una copia limitada para
     * sessionStorage. La caché completa permanece en memoria.
     */

    persistSessionCache(cache);


    /*
     * --------------------------------------------------------
     * INFORMAR ERRORES DE PRECARGA
     * --------------------------------------------------------
     */

    if (preloadErrors > 0) {
      console.error(
        `[Sesión] La precarga terminó con ${preloadErrors} error(es).`
      );
    }

    return cache;
  })();


  /*
   * ----------------------------------------------------------
   * REGISTRAR PROMESA ACTIVA
   * ----------------------------------------------------------
   */

  sessionState.sessionDataCachePromise = preloadPromise;

  sessionState.sessionDataCachePromiseKey = scopeKey;


  /*
   * ----------------------------------------------------------
   * ESPERAR Y LIMPIAR PROMESA
   * ----------------------------------------------------------
   */

  try {
    return await preloadPromise;
  } finally {
    if (
      sessionState.sessionDataCachePromise ===
      preloadPromise
    ) {
      sessionState.sessionDataCachePromise = null;

      sessionState.sessionDataCachePromiseKey = "";
    }
  }
}


/*
 * ============================================================
 * ASEGURAR DATOS DE SESIÓN
 * ============================================================
 */

export async function ensureSessionDataLoaded(
  user = auth.currentUser,
  options = {}
) {
  if (!user?.uid) return null;

  return preloadSessionData(user, {
    ...options,

    pageFile:
      options.pageFile ||
      getCurrentPageFile()
  });
}
