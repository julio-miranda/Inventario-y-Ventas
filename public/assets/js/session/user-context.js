//js/session/user-context.js
import { auth, db } from "../config/firebase.js";

import {
  EMPLOYEE_COLLECTION_NAME,
  LOCAL_COLLECTION_NAME
} from "../config/collections.js";

import {
  getCanonicalRole,
  roleRequiresLocal
} from "../security/roles.js";

import {
  sessionState,
  setCurrentLocalContext
} from "./state.js";

import { getLocalIdFromData } from "./local-context.js";

import { setSessionContext } from "./cache.js";

import { setStoredCurrentUser } from "./storage.js";


/*
 * ============================================================
 * ERRORES DE SOLICITUD OBSOLETA
 * ============================================================
 */

const OBSOLETE_CONTEXT_ERROR =
  "app/context-request-obsolete";


function createObsoleteContextError() {
  const error = new Error(
    "La solicitud de contexto quedó obsoleta por un cambio de sesión."
  );

  error.code = OBSOLETE_CONTEXT_ERROR;

  return error;
}


export function isObsoleteContextRequest(error) {
  return error?.code === OBSOLETE_CONTEXT_ERROR;
}


/**
 * Comprueba que la solicitud siga perteneciendo
 * al usuario autenticado y al token vigente.
 */
function assertCurrentContextRequest(uid, requestToken) {
  const authenticatedUid = String(
    auth.currentUser?.uid || ""
  ).trim();

  const tokenIsCurrent =
    sessionState.currentUserContextRequestToken === requestToken;

  const userIsCurrent =
    authenticatedUid === uid;

  if (!tokenIsCurrent || !userIsCurrent) {
    throw createObsoleteContextError();
  }
}


/*
 * ============================================================
 * CARGA DEL LOCAL
 * ============================================================
 */

export async function loadLocalById(localId = "") {
  const target = String(localId).trim();

  if (!target) {
    return null;
  }

  try {
    const direct = await db
      .collection(LOCAL_COLLECTION_NAME)
      .doc(target)
      .get();

    if (direct.exists) {
      return {
        id: direct.id,
        ...(direct.data() || {})
      };
    }

  } catch (error) {
    console.warn(
      "No se pudo cargar el local por ID:",
      error
    );
  }

  try {
    const byField = await db
      .collection(LOCAL_COLLECTION_NAME)
      .where("id_local", "==", target)
      .limit(1)
      .get();

    if (!byField.empty) {
      const doc = byField.docs[0];

      return {
        id: doc.id,
        ...(doc.data() || {})
      };
    }

  } catch (error) {
    console.warn(
      "No se pudo cargar el local por campo id_local:",
      error
    );
  }

  return null;
}


/*
 * ============================================================
 * CARGA DEL EMPLEADO
 * ============================================================
 */

export async function loadEmployeeByUser(user) {
  if (!user?.uid) {
    return null;
  }

  try {
    const direct = await db
      .collection(EMPLOYEE_COLLECTION_NAME)
      .doc(user.uid)
      .get();

    if (direct.exists) {
      return {
        id: direct.id,
        ...(direct.data() || {})
      };
    }

    return null;

  } catch (error) {
    console.warn(
      "No se pudo cargar el empleado por UID:",
      error
    );

    throw error;
  }
}


/*
 * ============================================================
 * APLICAR CONTEXTO
 * ============================================================
 */

export function applyResolvedUserContext(context) {
  if (!context || typeof context !== "object") {
    throw new Error(
      "No se puede aplicar un contexto de usuario vacío."
    );
  }

  sessionState.currentUserContextCache = context;

  sessionState.currentUserContextUid =
    String(context.uid || "").trim();

  const canonicalRole = getCanonicalRole(
    context.role || context.position || ""
  );

  const requiresLocal = roleRequiresLocal(
    canonicalRole
  );

  setCurrentLocalContext({
    id_local: requiresLocal
      ? getLocalIdFromData(context)
      : "",

    nombre: requiresLocal
      ? context.localNombre || ""
      : "",

    numeroDocumento: requiresLocal
      ? context.localNumeroDocumento || ""
      : "",

    ubicacion: requiresLocal
      ? context.localUbicacion || ""
      : "",

    contribuyente: requiresLocal
      ? (
          context.localContribuyente ||
          context.localNombreContribuyente ||
          ""
        )
      : "",

    tipoDocumento: requiresLocal
      ? context.localTipoDocumento || ""
      : "",

    nit: requiresLocal
      ? context.localNIT || ""
      : "",

    nrc: requiresLocal
      ? context.localNRC || ""
      : ""
  });

  return context;
}


/*
 * ============================================================
 * RESOLVER CONTEXTO DEL USUARIO
 * ============================================================
 */

export async function ensureCurrentUserContext(user, options = {}) {
  if (!user?.uid) {
    return null;
  }

  const uid = String(user.uid).trim();

  const forceRefresh =
    options.forceRefresh === true;


  /*
   * 1. Evitar utilizar una identidad diferente
   *    a la que se encuentra autenticada.
   */

  if (
    String(auth.currentUser?.uid || "").trim() !== uid
  ) {
    throw createObsoleteContextError();
  }


  /*
   * 2. Si ya existe una solicitud para el mismo UID,
   *    reutilizarla.
   *
   * IMPORTANTE:
   * Esto también se aplica cuando forceRefresh=true.
   *
   * Una solicitud pendiente ya está consultando
   * los datos actuales de Firestore. No es necesario
   * crear otra y reemplazar su token.
   */

  if (
    sessionState.currentUserContextPromise &&
    sessionState.currentUserContextPromiseUid === uid
  ) {
    return sessionState.currentUserContextPromise;
  }


  /*
   * 3. Reutilizar el contexto terminado cuando
   *    no se ha solicitado una actualización forzada.
   */

  if (
    !forceRefresh &&
    sessionState.currentUserContextCache &&
    sessionState.currentUserContextUid === uid &&
    String(
      sessionState.currentUserContextCache.uid || ""
    ).trim() === uid
  ) {
    return sessionState.currentUserContextCache;
  }


  /*
   * 4. Evitar que quede visible el contexto
   *    correspondiente a otro usuario.
   */

  if (
    sessionState.currentUserContextUid &&
    sessionState.currentUserContextUid !== uid
  ) {
    sessionState.currentUserContextCache = null;

    setCurrentLocalContext();
  }


  /*
   * 5. Registrar una nueva solicitud.
   */

  const requestToken = Symbol(
    `user-context:${uid}`
  );

  sessionState.currentUserContextUid = uid;

  sessionState.currentUserContextPromiseUid = uid;

  sessionState.currentUserContextRequestToken =
    requestToken;


  /*
   * 6. Ejecutar la resolución.
   */

  const requestPromise = (async () => {

    // --------------------------------------------------------
    // EMPLEADO
    // --------------------------------------------------------

    let employee;

    try {
      employee = await loadEmployeeByUser(user);

    } catch (error) {
      assertCurrentContextRequest(uid, requestToken);

      throw error;
    }

    assertCurrentContextRequest(uid, requestToken);

    if (!employee) {
      throw new Error(
        "No existe el documento de perfil para el UID autenticado."
      );
    }


    // --------------------------------------------------------
    // ROL
    // --------------------------------------------------------

    const role = getCanonicalRole(
      employee.position ||
      employee.role ||
      ""
    );

    if (!role) {
      throw new Error(
        "El usuario no tiene un rol válido configurado."
      );
    }

    const requiresLocal = roleRequiresLocal(role);

    const id_local = getLocalIdFromData(employee);

    if (requiresLocal && !id_local) {
      throw new Error(
        "El usuario no tiene un id_local asignado."
      );
    }


    // --------------------------------------------------------
    // INFORMACIÓN INICIAL DEL LOCAL
    // --------------------------------------------------------

    let localInfo = {
      id_local,

      nombre:
        employee.localNombre || "",

      numeroDocumento:
        employee.localNumeroDocumento || "",

      ubicacion:
        employee.localUbicacion || "",

      contribuyente:
        employee.localNombreContribuyente ||
        employee.localContribuyente ||
        "",

      tipoDocumento:
        employee.localTipoDocumento || "",

      nit:
        employee.localNIT || "",

      nrc:
        employee.localNRC || "",

      blocked:
        employee.localBlocked === true ||
        employee.localBloqueado === true
    };


    // --------------------------------------------------------
    // CONSULTAR LOCAL SOLO CUANDO FALTEN DATOS
    // --------------------------------------------------------

    const needsLocalRead =
      requiresLocal &&
      Boolean(id_local) &&
      (
        !localInfo.nombre ||
        !localInfo.numeroDocumento ||
        !localInfo.ubicacion ||
        !localInfo.tipoDocumento ||
        !localInfo.nit ||
        !localInfo.nrc
      );


    if (needsLocalRead) {

      const localDoc = await loadLocalById(id_local);

      assertCurrentContextRequest(uid, requestToken);

      if (localDoc) {

        localInfo = {
          id_local,

          nombre:
            localDoc.nombre ||
            localDoc.name ||
            localDoc.localName ||
            localInfo.nombre ||
            "",

          numeroDocumento:
            localDoc.numeroDocumento ||
            localDoc.numero_documento ||
            localDoc.documentNumber ||
            localDoc.nDocumento ||
            localInfo.numeroDocumento ||
            "",

          ubicacion:
            localDoc.ubicacion ||
            localDoc.location ||
            localDoc.direccion ||
            localDoc.address ||
            localInfo.ubicacion ||
            "",

          contribuyente:
            localDoc.nombreContribuyente ||
            localDoc.nombre_contribuyente ||
            localDoc.contribuyente ||
            localInfo.contribuyente ||
            "",

          tipoDocumento:
            localDoc.tipoDocumento ||
            localDoc.tipo_documento ||
            localDoc.documentType ||
            localInfo.tipoDocumento ||
            "",

          nit:
            localDoc.nit ||
            localDoc.NIT ||
            localInfo.nit ||
            "",

          nrc:
            localDoc.nrc ||
            localDoc.NRC ||
            localInfo.nrc ||
            "",

          blocked:
            localDoc.blocked === true ||
            localDoc.bloqueado === true ||
            localInfo.blocked
        };
      }
    }


    // --------------------------------------------------------
    // CONSTRUIR CONTEXTO
    // --------------------------------------------------------

    const context = {

      uid,

      employeeId:
        employee.id ||
        employee.uid ||
        uid,

      name:
        employee.name ||
        user.displayName ||
        user.email ||
        "Usuario",

      email:
        employee.email ||
        user.email ||
        "",

      phone:
        employee.phone ||
        "",

      role,

      position:
        employee.position ||
        employee.role ||
        role,

      active:
        employee.active !== false,

      blocked:
        employee.blocked === true,

      localBlocked:
        requiresLocal
          ? localInfo.blocked === true
          : false,

      failedLoginAttempts:
        Number(employee.failedLoginAttempts || 0) || 0,

      id_local:
        requiresLocal
          ? id_local
          : "",

      localNombre:
        requiresLocal
          ? String(localInfo.nombre || "").trim()
          : "",

      localNumeroDocumento:
        requiresLocal
          ? String(localInfo.numeroDocumento || "").trim()
          : "",

      localUbicacion:
        requiresLocal
          ? String(localInfo.ubicacion || "").trim()
          : "",

      localContribuyente:
        requiresLocal
          ? String(localInfo.contribuyente || "").trim()
          : "",

      localTipoDocumento:
        requiresLocal
          ? String(localInfo.tipoDocumento || "").trim()
          : "",

      localNIT:
        requiresLocal
          ? String(localInfo.nit || "").trim()
          : "",

      localNRC:
        requiresLocal
          ? String(localInfo.nrc || "").trim()
          : ""
    };


    // --------------------------------------------------------
    // VALIDACIÓN FINAL ANTES DE MODIFICAR EL ESTADO
    // --------------------------------------------------------

    assertCurrentContextRequest(uid, requestToken);


    // --------------------------------------------------------
    // ACTUALIZAR CONTEXTO Y CACHÉ
    // --------------------------------------------------------

    applyResolvedUserContext(context);

    setSessionContext(context);


    // --------------------------------------------------------
    // GUARDAR USUARIO
    // --------------------------------------------------------

    setStoredCurrentUser({

      uid:
        context.uid,

      employeeId:
        context.employeeId,

      name:
        context.name,

      email:
        context.email,

      phone:
        context.phone,

      role:
        context.role,

      position:
        context.position,

      active:
        context.active,

      blocked:
        context.blocked,

      localBlocked:
        context.localBlocked,

      failedLoginAttempts:
        context.failedLoginAttempts,

      id_local:
        context.id_local,

      localNombre:
        context.localNombre,

      localNumeroDocumento:
        context.localNumeroDocumento,

      localUbicacion:
        context.localUbicacion,

      localContribuyente:
        context.localContribuyente,

      localTipoDocumento:
        context.localTipoDocumento,

      localNIT:
        context.localNIT,

      localNRC:
        context.localNRC

    });


    return context;

  })();


  sessionState.currentUserContextPromise =
    requestPromise;


  try {

    return await requestPromise;

  } finally {

    /*
     * Una solicitud anterior nunca debe borrar
     * la referencia a una solicitud más reciente.
     */

    if (
      sessionState.currentUserContextPromise ===
      requestPromise
    ) {

      sessionState.currentUserContextPromise = null;

      sessionState.currentUserContextPromiseUid = "";

    }

  }
}


/*
 * ============================================================
 * OBTENER CONTEXTO ACTUAL
 * ============================================================
 */

export async function getCurrentUserContext(
  user = auth.currentUser
) {

  if (!user?.uid) {
    return null;
  }

  return ensureCurrentUserContext(user);
}