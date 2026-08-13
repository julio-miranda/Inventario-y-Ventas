// assets/js/locals.js
// Módulo exclusivo del rol Desarrollador.
//
// Funciones:
// - CRUD de locales.
// - CRUD de usuarios por local.
// - Bloqueo / desbloqueo de usuarios.
// - Visualización de intentos fallidos.
// - Visualización de último acceso.
// - Datos fiscales del local.
//
// ============================================================
// ARQUITECTURA DE LECTURA
// ============================================================
//
// Este módulo NO utiliza:
//
// - onSnapshot()
// - listeners realtime para llenar las tablas.
// - consultas repetitivas para filtros.
// - consultas repetitivas para estadísticas.
// - consultas al cambiar de local.
//
// La fuente principal de lectura es la caché de sesión de app.js:
//
//     window.getSessionCollection()
//     window.getSessionCollectionData()
//     window.getSessionDocument()
//     window.upsertSessionDocument()
//     window.removeSessionDocument()
//     window.updateSessionDocumentsWhere()
//
// Para el rol Desarrollador se necesitan datos globales:
//
// - local
// - empleados
// - login_attempts
//
// app.js intenta precargar esas colecciones al iniciar sesión.
//
// Adicionalmente, este módulo utiliza:
//
//     window.getCurrentUserContext()
//
// para validar el perfil actual de forma centralizada.
//
// IMPORTANTE:
//
// El Desarrollador NO depende de su propio id_local.
//
// Puede administrar:
//
// - usuarios de cualquier local;
// - cambiar un usuario de local;
// - bloquear/desbloquear usuarios de cualquier local;
// - crear usuarios para cualquier local;
// - consultar todos los locales;
// - consultar todos los usuarios.
//
// Las operaciones de usuario utilizan primero la caché
// global de "empleados". Firestore solamente recibe la
// escritura correspondiente.
//
// Flujo:
//
//     UI
//      ↓
//     caché de sesión
//      ↓
//     Firestore
//      ↓
//     actualización inmediata de caché
//
// No se hace una lectura posterior del documento escrito.
//

/*
 * ============================================================
 * DOM
 * ============================================================
 */

const greetingEls =
  document.querySelectorAll(
    ".userGreeting"
  );

const localsTableBody =
  document.querySelector(
    "#localsTable tbody"
  );

const usersTableBody =
  document.querySelector(
    "#localUsersTable tbody"
  );

const attemptsTableBody =
  document.querySelector(
    "#loginAttemptsTable tbody"
  );

const localFilter =
  document.getElementById(
    "localFilter"
  );

const globalSearch =
  document.getElementById(
    "globalSearch"
  );

const btnNewLocal =
  document.getElementById(
    "btnNewLocal"
  );

const btnNewUser =
  document.getElementById(
    "btnNewUser"
  );

const btnRefresh =
  document.getElementById(
    "btnRefresh"
  );

const statLocals =
  document.getElementById(
    "statLocals"
  );

const statUsers =
  document.getElementById(
    "statUsers"
  );

const statBlocked =
  document.getElementById(
    "statBlocked"
  );

const statFailed =
  document.getElementById(
    "statFailed"
  );

const localCountLabel =
  document.getElementById(
    "localCountLabel"
  );

const userCountLabel =
  document.getElementById(
    "userCountLabel"
  );

const attemptCountLabel =
  document.getElementById(
    "attemptCountLabel"
  );

const selectedLocalCard =
  document.getElementById(
    "selectedLocalCard"
  );

const LOCAL_COLLECTION =
  window.LOCAL_COLLECTION_NAME ||
  "local";

const EMPLOYEE_COLLECTION =
  window.EMPLOYEE_COLLECTION_NAME ||
  "empleados";

const ATTEMPTS_COLLECTION =
  window.LOGIN_ATTEMPTS_COLLECTION_NAME ||
  "login_attempts";

const POSITION_OPTIONS =
  window.POSITION_OPTIONS || [
    "Administrador",
    "Desarrollador",
    "Vendedor",
    "Cajero",
    "Bodega",
    "Asistencia"
  ];

window.POSITION_OPTIONS =
  POSITION_OPTIONS;

const DOCUMENT_TYPE_OPTIONS = [
  "DUI",
  "Pasaporte",
  "Otro"
];

/*
 * ============================================================
 * ESTADO
 * ============================================================
 */

let currentUserInfo = {
  uid:
    "",

  email:
    "",

  name:
    "Usuario",

  role:
    ""
};

let localsCache =
  [];

let usersCache =
  [];

let attemptsCache =
  [];

let selectedLocalId =
  "";

let moduleInitialized =
  false;

let developerDataLoadPromise =
  null;

let isCreatingUser =
  false;

let isEditingUser =
  false;

let isTogglingUser =
  false;

/*
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

function normalizeRoleLocal(
  role = ""
) {
  return String(
    role || ""
  )
    .trim()
    .toLowerCase();
}

function isDeveloperRole(
  role = ""
) {
  const normalized =
    normalizeRoleLocal(
      role
    );

  return (
    normalized ===
      "desarrollador" ||
    normalized ===
      "developer"
  );
}

function escapeHtml(
  value = ""
) {
  return String(
    value
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

function numberOrZero(
  value
) {
  const number =
    Number(
      value
    );

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}

function getTimestampMs(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
    ""
  ) {
    return 0;
  }

  if (
    typeof value.toMillis ===
    "function"
  ) {
    return value.toMillis();
  }

  if (
    typeof value.toDate ===
    "function"
  ) {
    const date =
      value.toDate();

    return Number.isFinite(
      date.getTime()
    )
      ? date.getTime()
      : 0;
  }

  if (
    typeof value ===
      "object" &&
    typeof value.seconds ===
      "number"
  ) {
    return (
      value.seconds *
      1000
    );
  }

  if (
    typeof value ===
    "number"
  ) {
    return value;
  }

  if (
    value instanceof
    Date
  ) {
    return value.getTime();
  }

  const date =
    new Date(
      value
    );

  return Number.isFinite(
    date.getTime()
  )
    ? date.getTime()
    : 0;
}

function formatDateTime(
  value
) {
  const timestamp =
    getTimestampMs(
      value
    );

  if (
    !timestamp
  ) {
    return "—";
  }

  return new Date(
    timestamp
  ).toLocaleString(
    "es-ES"
  );
}

function formatDateOnly(
  value
) {
  const timestamp =
    getTimestampMs(
      value
    );

  if (
    !timestamp
  ) {
    return "—";
  }

  return new Date(
    timestamp
  ).toLocaleDateString(
    "es-ES"
  );
}

function formatTimeOnly(
  value
) {
  const timestamp =
    getTimestampMs(
      value
    );

  if (
    !timestamp
  ) {
    return "—";
  }

  return new Date(
    timestamp
  ).toLocaleTimeString(
    "es-ES",
    {
      hour:
        "2-digit",

      minute:
        "2-digit"
    }
  );
}

function getFirestoreErrorMessage(
  error,
  fallback =
    "Ocurrió un error."
) {
  const code =
    String(
      error?.code ||
        ""
    ).toLowerCase();

  const message =
    String(
      error?.message ||
        ""
    );

  if (
    code ===
      "permission-denied" ||
    code.includes(
      "permission-denied"
    ) ||
    message
      .toLowerCase()
      .includes(
        "missing or insufficient permissions"
      )
  ) {
    return (
      "Firestore rechazó la operación por permisos. " +
      "Verifica que las reglas publicadas permitan al " +
      "Desarrollador modificar este recurso."
    );
  }

  if (
    code ===
      "not-found" ||
    code.includes(
      "not-found"
    )
  ) {
    return (
      "El documento que se intentó modificar no existe."
    );
  }

  return (
    message ||
    fallback
  );
}

async function showOperationError(
  error,
  fallbackMessage
) {
  console.error(
    "Error Firestore:",
    error
  );

  await Swal.fire({
    icon:
      "error",

    title:
      "Operación no realizada",

    text:
      getFirestoreErrorMessage(
        error,
        fallbackMessage
      )
  });
}

/*
 * ============================================================
 * USUARIO AUTENTICADO
 * ============================================================
 */

function getStoredCurrentUser() {
  try {
    return JSON.parse(
      localStorage.getItem(
        "currentUser"
      ) ||
        "null"
    );
  } catch {
    return null;
  }
}

function setStoredCurrentUser(
  patch = {}
) {
  try {
    const current =
      getStoredCurrentUser() ||
      {};

    localStorage.setItem(
      "currentUser",
      JSON.stringify({
        ...current,
        ...patch
      })
    );
  } catch {
    // No hacer nada.
  }
}

/*
 * ============================================================
 * CACHE APP.JS
 * ============================================================
 */

function hasAppSessionCacheApi() {
  return (
    typeof window.getSessionCollection ===
      "function" &&
    typeof window.setSessionCollection ===
      "function" &&
    typeof window.upsertSessionDocument ===
      "function" &&
    typeof window.removeSessionDocument ===
      "function"
  );
}

function readSessionCollection(
  collectionName
) {
  if (
    typeof window.getSessionCollection !==
    "function"
  ) {
    return [];
  }

  const result =
    window.getSessionCollection(
      collectionName
    );

  if (
    !Array.isArray(
      result
    )
  ) {
    return [];
  }

  return result
    .map(
      item => ({
        id:
          item?.id ||
          "",

        ...(
          item?.data ||
          {}
        )
      })
    );
}

function writeSessionCollection(
  collectionName,
  documents = []
) {
  if (
    typeof window.setSessionCollection !==
    "function"
  ) {
    throw new Error(
      "app.js no expuso setSessionCollection()."
    );
  }

  window.setSessionCollection(
    collectionName,
    documents.map(
      item => ({
        id:
          item.id,

        data:
          {
            ...item
          }
      })
    )
  );
}

function upsertCachedDocument(
  collectionName,
  id,
  data
) {
  if (
    typeof window.upsertSessionDocument !==
    "function"
  ) {
    return;
  }

  window.upsertSessionDocument(
    collectionName,
    id,
    data
  );
}

function removeCachedDocument(
  collectionName,
  id
) {
  if (
    typeof window.removeSessionDocument !==
    "function"
  ) {
    return;
  }

  window.removeSessionDocument(
    collectionName,
    id
  );
}

function updateCachedDocumentsWhere(
  collectionName,
  predicate,
  patch = {}
) {
  if (
    typeof window.updateSessionDocumentsWhere !==
    "function"
  ) {
    return 0;
  }

  return (
    window.updateSessionDocumentsWhere(
      collectionName,
      predicate,
      patch
    ) || 0
  );
}

/*
 * ============================================================
 * PERFIL DESARROLLADOR DESDE APP.JS
 * ============================================================
 */

async function getDeveloperContextFromApp(
  user
) {
  if (
    !user
  ) {
    return null;
  }

  if (
    typeof window.getCurrentUserContext !==
    "function"
  ) {
    return null;
  }

  const context =
    await window.getCurrentUserContext(
      user
    );

  if (
    !context
  ) {
    return null;
  }

  if (
    !isDeveloperRole(
      context.role ||
      context.position ||
      ""
    )
  ) {
    return null;
  }

  return context;
}

function addContextProfileToUsersCache(
  context
) {
  if (
    !context
  ) {
    return null;
  }

  const canonicalUid =
    String(
      context.uid ||
        ""
    ).trim();

  if (
    !canonicalUid
  ) {
    return null;
  }

  const contextEmail =
    String(
      context.email ||
        ""
    )
      .trim()
      .toLowerCase();

  const existingIndex =
    usersCache.findIndex(
      employee =>
        String(
          employee.id ||
            ""
        ).trim() ===
          canonicalUid ||
        String(
          employee.uid ||
            ""
        ).trim() ===
          canonicalUid ||
        (
          contextEmail &&
          String(
            employee.email ||
              ""
          )
            .trim()
            .toLowerCase() ===
            contextEmail
        )
    );

  const profileData = {
    uid:
      canonicalUid,

    name:
      context.name ||
      "Usuario",

    email:
      context.email ||
      "",

    phone:
      context.phone ||
      "",

    position:
      context.position ||
      context.role ||
      "",

    role:
      context.role ||
      context.position ||
      "",

    id_local:
      String(
        context.id_local ||
          ""
      ).trim(),

    localNombre:
      context.localNombre ||
      "",

    localNombreContribuyente:
      context.localContribuyente ||
      "",

    localTipoDocumento:
      context.localTipoDocumento ||
      "",

    localNIT:
      context.localNIT ||
      "",

    localNRC:
      context.localNRC ||
      "",

    localNumeroDocumento:
      context.localNumeroDocumento ||
      "",

    localUbicacion:
      context.localUbicacion ||
      "",

    active:
      context.active !==
      false,

    blocked:
      context.blocked ===
      true,

    failedLoginAttempts:
      numberOrZero(
        context.failedLoginAttempts
      )
  };

  if (
    existingIndex >=
    0
  ) {
    usersCache[
      existingIndex
    ] = {
      ...usersCache[
        existingIndex
      ],

      ...profileData
    };

    return usersCache[
      existingIndex
    ];
  }

  usersCache.push({
    id:
      canonicalUid,

    ...profileData
  });

  return usersCache[
    usersCache.length -
      1
  ];
}

/*
 * ============================================================
 * CARGA GLOBAL DEL DESARROLLADOR
 * ============================================================
 */

async function loadDeveloperCollectionOnce(
  collectionName
) {
  const cached =
    readSessionCollection(
      collectionName
    );

  let cacheStatus =
    null;

  if (
    typeof window.getSessionCacheStatus ===
    "function"
  ) {
    cacheStatus =
      window.getSessionCacheStatus();
  }

  const collectionWasLoaded =
    Array.isArray(
      cacheStatus?.collections
    ) &&
    cacheStatus.collections.includes(
      collectionName
    );

  if (
    collectionWasLoaded
  ) {
    return cached;
  }

  const snapshot =
    await db
      .collection(
        collectionName
      )
      .get();

  const documents =
    [];

  snapshot.forEach(
    doc => {
      documents.push({
        id:
          doc.id,

        ...(
          doc.data() ||
          {}
        )
      });
    }
  );

  writeSessionCollection(
    collectionName,
    documents
  );

  return documents;
}

async function ensureDeveloperSessionData(
  user =
    auth.currentUser
) {
  if (
    developerDataLoadPromise
  ) {
    return developerDataLoadPromise;
  }

  developerDataLoadPromise =
    (async () => {
      if (
        !hasAppSessionCacheApi()
      ) {
        throw new Error(
          "app.js no está cargado correctamente o no expuso la API de caché de sesión."
        );
      }

      let context =
        null;

      if (
        user &&
        typeof window.getCurrentUserContext ===
          "function"
      ) {
        try {
          context =
            await getDeveloperContextFromApp(
              user
            );
        } catch (
          error
        ) {
          console.warn(
            "[Locals] No se pudo obtener inmediatamente el contexto desde app.js:",
            error
          );
        }
      }

      const results =
        await Promise.all([
          loadDeveloperCollectionOnce(
            LOCAL_COLLECTION
          ),

          loadDeveloperCollectionOnce(
            EMPLOYEE_COLLECTION
          ),

          loadDeveloperCollectionOnce(
            ATTEMPTS_COLLECTION
          )
        ]);

      localsCache =
        normalizeLocals(
          results[0]
        );

      usersCache =
        normalizeUsers(
          results[1]
        );

      attemptsCache =
        normalizeAttempts(
          results[2]
        );

      if (
        context
      ) {
        addContextProfileToUsersCache(
          context
        );

        upsertCachedDocument(
          EMPLOYEE_COLLECTION,
          context.employeeId ||
            context.uid,
          {
            uid:
              context.uid,

            name:
              context.name ||
              "",

            email:
              context.email ||
              "",

            phone:
              context.phone ||
              "",

            position:
              context.position ||
              context.role ||
              "",

            role:
              context.role ||
              context.position ||
              "",

            id_local:
              context.id_local ||
              "",

            localNombre:
              context.localNombre ||
              "",

            localNombreContribuyente:
              context.localContribuyente ||
              "",

            localTipoDocumento:
              context.localTipoDocumento ||
              "",

            localNIT:
              context.localNIT ||
              "",

            localNRC:
              context.localNRC ||
              "",

            localNumeroDocumento:
              context.localNumeroDocumento ||
              "",

            localUbicacion:
              context.localUbicacion ||
              "",

            active:
              context.active !==
              false,

            blocked:
              context.blocked ===
              true,

            failedLoginAttempts:
              numberOrZero(
                context.failedLoginAttempts
              )
          }
        );

        usersCache =
          normalizeUsers(
            readSessionCollection(
              EMPLOYEE_COLLECTION
            )
          );

        addContextProfileToUsersCache(
          context
        );
      }

      console.log(
        "[Locals] Caché del desarrollador preparada:",
        {
          locales:
            localsCache.length,

          usuarios:
            usersCache.length,

          intentos:
            attemptsCache.length,

          developerUid:
            user?.uid ||
            "",

          developerEmail:
            user?.email ||
            ""
        }
      );
    })()
      .finally(
        () => {
          developerDataLoadPromise =
            null;
        }
      );

  return developerDataLoadPromise;
}

/*
 * ============================================================
 * NORMALIZACIÓN
 * ============================================================
 */

function normalizeLocals(
  source = []
) {
  if (
    !Array.isArray(
      source
    )
  ) {
    return [];
  }

  return source.map(
    item => {
      const data =
        item ||
        {};

      return {
        id_local:
          String(
            data.id_local ||
            data.id ||
            ""
          ).trim(),

        id:
          data.id ||
          data.id_local ||
          "",

        ...data,

        bloqueado:
          data.bloqueado ===
            true ||
          data.blocked ===
            true,

        activo:
          data.activo !==
            false &&
          data.active !==
            false
      };
    }
  );
}

function normalizeUsers(
  source = []
) {
  if (
    !Array.isArray(
      source
    )
  ) {
    return [];
  }

  return source.map(
    item => {
      const data =
        item ||
        {};

      return {
        id:
          data.id ||
          "",

        ...data,

        blocked:
          data.blocked ===
          true,

        active:
          data.active !==
            false &&
          data.blocked !==
            true,

        failedLoginAttempts:
          numberOrZero(
            data.failedLoginAttempts
          ),

        id_local:
          String(
            data.id_local ||
            data.idLocal ||
            data.localId ||
            ""
          ).trim(),

        localNombre:
          data.localNombre ||
          "",

        localNombreContribuyente:
          data.localNombreContribuyente ||
          "",

        localTipoDocumento:
          data.localTipoDocumento ||
          "",

        localNIT:
          data.localNIT ||
          "",

        localNRC:
          data.localNRC ||
          "",

        localNumeroDocumento:
          data.localNumeroDocumento ||
          "",

        localUbicacion:
          data.localUbicacion ||
          ""
      };
    }
  );
}

function normalizeAttempts(
  source = []
) {
  if (
    !Array.isArray(
      source
    )
  ) {
    return [];
  }

  return source.map(
    item => ({
      id:
        item.id ||
        "",

      ...item
    })
  );
}

function refreshCachesFromApp() {
  localsCache =
    normalizeLocals(
      readSessionCollection(
        LOCAL_COLLECTION
      )
    );

  usersCache =
    normalizeUsers(
      readSessionCollection(
        EMPLOYEE_COLLECTION
      )
    );

  attemptsCache =
    normalizeAttempts(
      readSessionCollection(
        ATTEMPTS_COLLECTION
      )
    );

  const user =
    auth.currentUser;

  if (
    user &&
    currentUserInfo.role &&
    isDeveloperRole(
      currentUserInfo.role
    )
  ) {
    if (
      typeof window.getCurrentUserContext ===
      "function"
    ) {
      /*
       * El contexto ya fue resuelto durante el arranque.
       * No se hace una nueva lectura aquí.
       */
    }
  }
}

/*
 * ============================================================
 * RESOLUCIÓN DE USUARIO
 * ============================================================
 */

function findCachedEmployeeByUserId(
  userId
) {
  const target =
    String(
      userId ||
        ""
    ).trim();

  if (
    !target
  ) {
    return null;
  }

  return (
    usersCache.find(
      employee =>
        String(
          employee.id ||
            ""
        ).trim() ===
          target ||
        String(
          employee.uid ||
            ""
        ).trim() ===
          target
    ) ||
    null
  );
}

function findCachedEmployeeByEmail(
  email
) {
  const target =
    String(
      email ||
        ""
    )
      .trim()
      .toLowerCase();

  if (
    !target
  ) {
    return null;
  }

  return (
    usersCache.find(
      employee =>
        String(
          employee.email ||
            ""
        )
          .trim()
          .toLowerCase() ===
        target
    ) ||
    null
  );
}

function findCachedEmployeeByUser(
  user
) {
  if (
    !user
  ) {
    return null;
  }

  const byId =
    findCachedEmployeeByUserId(
      user.uid
    );

  if (
    byId
  ) {
    return byId;
  }

  return findCachedEmployeeByEmail(
    user.email
  );
}

function findEmployeeForOperation(
  identifier
) {
  const target =
    String(
      identifier ||
        ""
    ).trim();

  if (
    !target
  ) {
    return null;
  }

  return (
    usersCache.find(
      employee =>
        String(
          employee.id ||
            ""
        ).trim() ===
          target ||
        String(
          employee.uid ||
            ""
        ).trim() ===
          target
    ) ||
    null
  );
}

function findLegacyEmployee(
  user
) {
  const employee =
    findCachedEmployeeByUser(
      user
    );

  if (
    !employee
  ) {
    return null;
  }

  return {
    id:
      employee.id,

    data:
      {
        ...employee
      },

    source:
      String(
        employee.id ||
          ""
      ).trim() ===
        String(
          user?.uid ||
            ""
        ).trim()
        ? "document-id"
        : String(
            employee.uid ||
              ""
          ).trim() ===
            String(
              user?.uid ||
                ""
            ).trim()
          ? "uid"
          : "email"
  };
}

/*
 * ============================================================
 * SINCRONIZAR PERFIL DESARROLLADOR
 * ============================================================
 */

function cacheResolvedDeveloperProfile(
  context
) {
  if (
    !context?.uid
  ) {
    return null;
  }

  const profile =
    addContextProfileToUsersCache(
      context
    );

  const employeeDocumentId =
    String(
      context.employeeId ||
        context.uid ||
        ""
    ).trim();

  if (
    employeeDocumentId
  ) {
    upsertCachedDocument(
      EMPLOYEE_COLLECTION,
      employeeDocumentId,
      {
        uid:
          context.uid,

        name:
          context.name ||
          "",

        email:
          context.email ||
          "",

        phone:
          context.phone ||
          "",

        position:
          context.position ||
          context.role ||
          "",

        role:
          context.role ||
          context.position ||
          "",

        id_local:
          context.id_local ||
          "",

        localNombre:
          context.localNombre ||
          "",

        localNombreContribuyente:
          context.localContribuyente ||
          "",

        localTipoDocumento:
          context.localTipoDocumento ||
          "",

        localNIT:
          context.localNIT ||
          "",

        localNRC:
          context.localNRC ||
          "",

        localNumeroDocumento:
          context.localNumeroDocumento ||
          "",

        localUbicacion:
          context.localUbicacion ||
          "",

        active:
          context.active !==
          false,

        blocked:
          context.blocked ===
          true,

        failedLoginAttempts:
          numberOrZero(
            context.failedLoginAttempts
          )
      }
    );
  }

  return profile;
}

/*
 * ============================================================
 * MIGRACIÓN
 * ============================================================
 */

async function migrateEmployeeToAuthUid(
  user,
  legacyEmployee
) {
  if (
    !user?.uid ||
    !legacyEmployee?.data
  ) {
    return null;
  }

  const canonical =
    findCachedEmployeeByUser(
      user
    );

  if (
    canonical
  ) {
    return {
      id:
        canonical.id,

      data:
        {
          ...canonical
        }
    };
  }

  const legacyData =
    legacyEmployee.data ||
    {};

  const migratedData = {
    ...legacyData,

    uid:
      user.uid,

    email:
      user.email ||
      legacyData.email ||
      "",

    updatedAt:
      firebase.firestore
        .FieldValue
        .serverTimestamp(),

    migratedFromEmployeeId:
      legacyEmployee.id
  };

  await db
    .collection(
      EMPLOYEE_COLLECTION
    )
    .doc(
      user.uid
    )
    .set(
      migratedData,
      {
        merge:
          true
      }
    );

  const normalizedData = {
    ...legacyData,

    uid:
      user.uid,

    email:
      user.email ||
      legacyData.email ||
      "",

    migratedFromEmployeeId:
      legacyEmployee.id,

    updatedAt:
      Date.now()
  };

  upsertCachedDocument(
    EMPLOYEE_COLLECTION,
    user.uid,
    normalizedData
  );

  usersCache =
    normalizeUsers(
      readSessionCollection(
        EMPLOYEE_COLLECTION
      )
    );

  return {
    id:
      user.uid,

    data:
      normalizedData
  };
}

/*
 * ============================================================
 * VERIFICACIÓN DE DESARROLLADOR
 * ============================================================
 */

async function verifyDeveloperAccess(
  user
) {
  if (
    !user ||
    !user.uid
  ) {
    throw new Error(
      "No existe una sesión de Firebase válida."
    );
  }

  let appContext =
    null;

  if (
    typeof window.getCurrentUserContext ===
    "function"
  ) {
    try {
      appContext =
        await window.getCurrentUserContext(
          user
        );
    } catch (
      error
    ) {
      console.warn(
        "[Locals] No se pudo obtener contexto desde app.js:",
        error
      );
    }
  }

  if (
    appContext &&
    isDeveloperRole(
      appContext.role ||
        appContext.position ||
        ""
    )
  ) {
    currentUserInfo = {
      uid:
        user.uid,

      email:
        user.email ||
        appContext.email ||
        "",

      name:
        appContext.name ||
        user.email ||
        "Usuario",

      role:
        appContext.role ||
        appContext.position ||
        "Desarrollador"
    };

    cacheResolvedDeveloperProfile(
      appContext
    );

    setStoredCurrentUser({
      uid:
        currentUserInfo.uid,

      email:
        currentUserInfo.email,

      name:
        currentUserInfo.name,

      role:
        "Desarrollador",

      position:
        "Desarrollador",

      employeeId:
        appContext.employeeId ||
        user.uid,

      id_local:
        ""
    });

    return {
      id:
        appContext.employeeId ||
        user.uid,

      uid:
        user.uid,

      ...appContext,

      role:
        appContext.role ||
        appContext.position ||
        "Desarrollador"
    };
  }

  const cachedEmployee =
    findCachedEmployeeByUser(
      user
    );

  if (
    cachedEmployee
  ) {
    const role =
      cachedEmployee.position ||
      cachedEmployee.role ||
      "";

    if (
      !isDeveloperRole(
        role
      )
    ) {
      throw new Error(
        "Acceso denegado. El perfil autenticado no tiene el rol Desarrollador."
      );
    }

    currentUserInfo = {
      uid:
        user.uid,

      email:
        user.email ||
        cachedEmployee.email ||
        "",

      name:
        cachedEmployee.name ||
        "Usuario",

      role
    };

    return {
      id:
        cachedEmployee.id,

      data:
        {
          ...cachedEmployee
        }
    };
  }

  throw new Error(
    "No existe un perfil asociado al usuario autenticado. " +
    "No se encontró un perfil válido por UID, document ID o correo."
  );
}

async function ensureDeveloperPermission() {
  const user =
    auth.currentUser;

  if (
    !user
  ) {
    throw new Error(
      "La sesión de Firebase no está activa."
    );
  }

  await verifyDeveloperAccess(
    user
  );
}

/*
 * ============================================================
 * DATOS DEL LOCAL
 * ============================================================
 */

function getLocalName(
  local = {}
) {
  return String(
    local.nombre ||
    local.name ||
    local.localName ||
    ""
  ).trim();
}

function getLocalContributorName(
  local = {}
) {
  return String(
    local.nombreContribuyente ||
    local.nombre_contribuyente ||
    local.contribuyenteNombre ||
    local.taxpayerName ||
    ""
  ).trim();
}

function getLocalDocumentType(
  local = {}
) {
  return String(
    local.tipoDocumento ||
    local.tipo_documento ||
    local.documentType ||
    ""
  ).trim();
}

function getLocalNIT(
  local = {}
) {
  return String(
    local.nit ||
    local.NIT ||
    ""
  ).trim();
}

function getLocalNRC(
  local = {}
) {
  return String(
    local.nrc ||
    local.NRC ||
    ""
  ).trim();
}

function getLocalDocumentNumber(
  local = {}
) {
  return String(
    local.numeroDocumento ||
    local.numero_documento ||
    local.documentNumber ||
    local.nDocumento ||
    ""
  ).trim();
}

function getLocalUbicacion(
  local = {}
) {
  return String(
    local.ubicacion ||
    local.location ||
    local.direccion ||
    local.address ||
    ""
  ).trim();
}

function getUserLocalId(
  user = {}
) {
  return String(
    user.id_local ||
    user.idLocal ||
    user.localId ||
    ""
  ).trim();
}

function getUserLocalInfo(
  user = {}
) {
  return {
    id_local:
      getUserLocalId(
        user
      ),

    nombre:
      String(
        user.localNombre ||
        ""
      ).trim(),

    nombreContribuyente:
      String(
        user.localNombreContribuyente ||
        ""
      ).trim(),

    tipoDocumento:
      String(
        user.localTipoDocumento ||
        ""
      ).trim(),

    nit:
      String(
        user.localNIT ||
        ""
      ).trim(),

    nrc:
      String(
        user.localNRC ||
        ""
      ).trim(),

    numeroDocumento:
      String(
        user.localNumeroDocumento ||
        ""
      ).trim(),

    ubicacion:
      String(
        user.localUbicacion ||
        ""
      ).trim()
  };
}

function getSelectedLocal() {
  return (
    localsCache.find(
      local =>
        String(
          local.id_local
        ) ===
        String(
          selectedLocalId
        )
    ) ||
    null
  );
}

function getLocalUsers(
  localId = ""
) {
  const target =
    String(
      localId ||
        ""
    ).trim();

  /*
   * Sin local seleccionado:
   *
   * mostrar todos los usuarios.
   *
   * Esto es intencional para el Desarrollador.
   */
  if (
    !target
  ) {
    return [
      ...usersCache
    ];
  }

  return usersCache.filter(
    user =>
      String(
        getUserLocalId(
          user
        )
      ) ===
      target
  );
}

function getLocalAttempts(
  localId = ""
) {
  const target =
    String(
      localId ||
        ""
    ).trim();

  if (
    !target
  ) {
    return [
      ...attemptsCache
    ];
  }

  return attemptsCache.filter(
    attempt => {
      const attemptLocal =
        String(
          attempt.id_local ||
          attempt.localId ||
          ""
        ).trim();

      if (
        attemptLocal &&
        attemptLocal ===
          target
      ) {
        return true;
      }

      const byEmail =
        usersCache.find(
          user =>
            String(
              user.email ||
                ""
            )
              .trim()
              .toLowerCase() ===
            String(
              attempt.email ||
                ""
            )
              .trim()
              .toLowerCase()
        );

      if (
        byEmail &&
        String(
          getUserLocalId(
            byEmail
          )
        ) ===
          target
      ) {
        return true;
      }

      return false;
    }
  );
}

/*
 * ============================================================
 * BÚSQUEDA
 * ============================================================
 */

function getCurrentSearch() {
  return String(
    globalSearch?.value ||
      ""
  )
    .toLowerCase()
    .trim();
}

function matchesSearchLocal(
  local = {}
) {
  const query =
    getCurrentSearch();

  if (
    !query
  ) {
    return true;
  }

  const haystack = [
    getLocalName(
      local
    ),

    getLocalContributorName(
      local
    ),

    getLocalDocumentType(
      local
    ),

    getLocalNIT(
      local
    ),

    getLocalNRC(
      local
    ),

    getLocalDocumentNumber(
      local
    ),

    getLocalUbicacion(
      local
    ),

    local.id_local,

    local.blockReason,

    local.blockedReason
  ]
    .join(
      " "
    )
    .toLowerCase();

  return haystack.includes(
    query
  );
}

function matchesSearchUser(
  user = {}
) {
  const query =
    getCurrentSearch();

  if (
    !query
  ) {
    return true;
  }

  const localInfo =
    getUserLocalInfo(
      user
    );

  const local =
    localsCache.find(
      item =>
        String(
          item.id_local
        ) ===
        String(
          localInfo.id_local
        )
    );

  const haystack = [
    user.id,
    user.uid,
    user.name,
    user.email,
    user.position,
    user.role,
    user.phone,

    localInfo.nombre,
    localInfo.nombreContribuyente,
    localInfo.tipoDocumento,
    localInfo.nit,
    localInfo.nrc,
    localInfo.numeroDocumento,
    localInfo.ubicacion,

    getLocalName(
      local ||
      {}
    ),

    user.failedLoginAttempts,
    user.lastLoginAt,
    user.lastAccessAt,
    user.blockReason
  ]
    .join(
      " "
    )
    .toLowerCase();

  return haystack.includes(
    query
  );
}

function matchesSearchAttempt(
  attempt = {}
) {
  const query =
    getCurrentSearch();

  if (
    !query
  ) {
    return true;
  }

  const byEmailLocal =
    usersCache.find(
      user =>
        String(
          user.email ||
            ""
        )
          .trim()
          .toLowerCase() ===
        String(
          attempt.email ||
            ""
        )
          .trim()
          .toLowerCase()
    );

  const localInfo =
    byEmailLocal
      ? getUserLocalInfo(
          byEmailLocal
        )
      : null;

  const haystack = [
    attempt.email,
    attempt.reason,
    attempt.message,
    attempt.result,
    attempt.status,
    attempt.id_local,
    attempt.localNombre,
    attempt.localNombreContribuyente,
    attempt.localTipoDocumento,
    attempt.localNIT,
    attempt.localNRC,
    attempt.localNumeroDocumento,
    attempt.localUbicacion,

    localInfo?.nombre,
    localInfo?.nombreContribuyente,
    localInfo?.tipoDocumento,
    localInfo?.nit,
    localInfo?.nrc,
    localInfo?.numeroDocumento,
    localInfo?.ubicacion
  ]
    .join(
      " "
    )
    .toLowerCase();

  return haystack.includes(
    query
  );
}

/*
 * ============================================================
 * RENDER
 * ============================================================
 */

function renderEmptyRow(
  tbody,
  colspan,
  text
) {
  if (
    !tbody
  ) {
    return;
  }

  tbody.innerHTML = `
    <tr>
      <td colspan="${colspan}">
        ${escapeHtml(
          text
        )}
      </td>
    </tr>
  `;
}

function renderSelectedLocalCard() {
  if (
    !selectedLocalCard
  ) {
    return;
  }

  const local =
    getSelectedLocal();

  if (
    !local
  ) {
    selectedLocalCard.innerHTML = `
      <p
        class="hero-subtitle"
        style="margin-top:0"
      >
        <strong>
          Local seleccionado:
        </strong>
        Todos
      </p>

      <p class="hero-subtitle">
        Se muestran todos los locales
        y todos los usuarios.
      </p>
    `;

    return;
  }

  selectedLocalCard.innerHTML = `
    <p
      class="hero-subtitle"
      style="margin-top:0"
    >
      <strong>Local:</strong>
      ${escapeHtml(
        getLocalName(
          local
        ) ||
        "—"
      )}
      <br>

      <strong>
        Contribuyente:
      </strong>
      ${escapeHtml(
        getLocalContributorName(
          local
        ) ||
        "—"
      )}
      <br>

      <strong>
        Tipo de documento:
      </strong>
      ${escapeHtml(
        getLocalDocumentType(
          local
        ) ||
        "—"
      )}
      <br>

      <strong>NIT:</strong>
      ${escapeHtml(
        getLocalNIT(
          local
        ) ||
        "—"
      )}
      <br>

      <strong>NRC:</strong>
      ${escapeHtml(
        getLocalNRC(
          local
        ) ||
        "—"
      )}
      <br>

      <strong>
        Número de documento:
      </strong>
      ${escapeHtml(
        getLocalDocumentNumber(
          local
        ) ||
        "—"
      )}
      <br>

      <strong>
        Ubicación:
      </strong>
      ${escapeHtml(
        getLocalUbicacion(
          local
        ) ||
        "—"
      )}
      <br>

      <strong>
        Estado:
      </strong>
      ${
        local.bloqueado
          ? "Bloqueado"
          : "Activo"
      }
    </p>

    <p class="hero-subtitle">
      El Desarrollador puede administrar
      usuarios de cualquier local.
    </p>
  `;
}

function updateSummary() {
  const totalLocals =
    localsCache.length;

  const visibleUsers =
    getLocalUsers(
      selectedLocalId
    ).filter(
      matchesSearchUser
    );

  const visibleAttempts =
    getLocalAttempts(
      selectedLocalId
    ).filter(
      matchesSearchAttempt
    );

  const blocked =
    visibleUsers.filter(
      user =>
        user.blocked ===
          true ||
        user.active ===
          false
    ).length;

  const failed =
    visibleUsers.reduce(
      (
        sum,
        user
      ) =>
        sum +
        numberOrZero(
          user.failedLoginAttempts
        ),
      0
    ) +
    visibleAttempts.filter(
      attempt =>
        attempt.success ===
          false ||
        String(
          attempt.result ||
            ""
        )
          .toLowerCase() ===
        "fallido"
    ).length;

  if (
    statLocals
  ) {
    statLocals.textContent =
      totalLocals;
  }

  if (
    statUsers
  ) {
    statUsers.textContent =
      visibleUsers.length;
  }

  if (
    statBlocked
  ) {
    statBlocked.textContent =
      blocked;
  }

  if (
    statFailed
  ) {
    statFailed.textContent =
      failed;
  }

  if (
    localCountLabel
  ) {
    localCountLabel.textContent =
      `${
        localsCache.filter(
          matchesSearchLocal
        ).length
      } registros`;
  }

  if (
    userCountLabel
  ) {
    userCountLabel.textContent =
      `${visibleUsers.length} registros`;
  }

  if (
    attemptCountLabel
  ) {
    attemptCountLabel.textContent =
      `${visibleAttempts.length} registros`;
  }
}

function renderLocalFilterOptions() {
  if (
    !localFilter
  ) {
    return;
  }

  const current =
    String(
      localFilter.value ||
        ""
    );

  localFilter.innerHTML = `
    <option value="">
      Todos los locales
    </option>
  `;

  localsCache
    .slice()
    .sort(
      (
        a,
        b
      ) =>
        String(
          getLocalName(
            a
          )
        ).localeCompare(
          String(
            getLocalName(
              b
            )
          )
        )
    )
    .forEach(
      local => {
        const option =
          document.createElement(
            "option"
          );

        option.value =
          String(
            local.id_local ||
            local.id ||
            ""
          );

        option.textContent =
          `${getLocalName(
            local
          )} — ` +
          `${
            getLocalContributorName(
              local
            ) ||
            "Sin contribuyente"
          }`;

        localFilter.appendChild(
          option
        );
      }
    );

  localFilter.value =
    current &&
    localsCache.some(
      local =>
        String(
          local.id_local ||
          local.id
        ) ===
        current
    )
      ? current
      : "";

  selectedLocalId =
    localFilter.value ||
    "";
}

function renderLocals() {
  if (
    !localsTableBody
  ) {
    return;
  }

  const visible =
    localsCache.filter(
      matchesSearchLocal
    );

  if (
    !visible.length
  ) {
    renderEmptyRow(
      localsTableBody,
      11,
      "No hay locales registrados."
    );

    updateSummary();
    renderSelectedLocalCard();

    return;
  }

  localsTableBody.innerHTML =
    "";

  visible.forEach(
    local => {
      const usersCount =
        usersCache.filter(
          user =>
            String(
              getUserLocalId(
                user
              )
            ) ===
            String(
              local.id_local
            )
        ).length;

      const lastAccess =
        usersCache
          .filter(
            user =>
              String(
                getUserLocalId(
                  user
                )
              ) ===
              String(
                local.id_local
              )
          )
          .map(
            user =>
              user.lastLoginAt ||
              user.lastAccessAt ||
              null
          )
          .filter(Boolean)
          .sort(
            (
              a,
              b
            ) =>
              getTimestampMs(
                b
              ) -
              getTimestampMs(
                a
              )
          )[0];

      const tr =
        document.createElement(
          "tr"
        );

      tr.innerHTML = `
        <td>
          ${escapeHtml(
            getLocalName(
              local
            ) ||
            "—"
          )}
        </td>

        <td>
          ${escapeHtml(
            getLocalContributorName(
              local
            ) ||
            "—"
          )}
        </td>

        <td>
          ${escapeHtml(
            getLocalDocumentType(
              local
            ) ||
            "—"
          )}
        </td>

        <td>
          ${escapeHtml(
            getLocalNIT(
              local
            ) ||
            "—"
          )}
        </td>

        <td>
          ${escapeHtml(
            getLocalNRC(
              local
            ) ||
            "—"
          )}
        </td>

        <td>
          ${escapeHtml(
            getLocalDocumentNumber(
              local
            ) ||
            "—"
          )}
        </td>

        <td>
          ${escapeHtml(
            getLocalUbicacion(
              local
            ) ||
            "—"
          )}
        </td>

        <td>
          ${
            local.bloqueado
              ? "Bloqueado"
              : "Activo"
          }
        </td>

        <td>
          ${usersCount}
        </td>

        <td>
          ${escapeHtml(
            formatDateTime(
              lastAccess
            )
          )}
        </td>

        <td>
          <button
            type="button"
            class="btn-outline"
            data-action="select-local"
            data-id="${escapeHtml(
              local.id_local
            )}"
          >
            Ver usuarios
          </button>

          <button
            type="button"
            class="btn-edit"
            data-action="edit-local"
            data-id="${escapeHtml(
              local.id_local
            )}"
          >
            Editar
          </button>

          <button
            type="button"
            class="btn-outline"
            data-action="toggle-local"
            data-id="${escapeHtml(
              local.id_local
            )}"
          >
            ${
              local.bloqueado
                ? "Desbloquear"
                : "Bloquear"
            }
          </button>

          <button
            type="button"
            class="btn-delete"
            data-action="delete-local"
            data-id="${escapeHtml(
              local.id_local
            )}"
          >
            Eliminar
          </button>
        </td>
      `;

      localsTableBody.appendChild(
        tr
      );
    }
  );

  localsTableBody
    .querySelectorAll(
      "button[data-action='select-local']"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            selectedLocalId =
              String(
                button.dataset.id ||
                  ""
              );

            if (
              localFilter
            ) {
              localFilter.value =
                selectedLocalId;
            }

            renderAll();
          }
        );
      }
    );

  localsTableBody
    .querySelectorAll(
      "button[data-action='edit-local']"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () =>
            editLocal(
              String(
                button.dataset.id ||
                  ""
              )
            )
        );
      }
    );

  localsTableBody
    .querySelectorAll(
      "button[data-action='toggle-local']"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () =>
            toggleLocalBlock(
              String(
                button.dataset.id ||
                  ""
              )
            )
        );
      }
    );

  localsTableBody
    .querySelectorAll(
      "button[data-action='delete-local']"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () =>
            deleteLocal(
              String(
                button.dataset.id ||
                  ""
              )
            )
        );
      }
    );

  updateSummary();
  renderSelectedLocalCard();
}

function renderUsers() {
  if (
    !usersTableBody
  ) {
    return;
  }

  /*
   * Si no se selecciona un local:
   *
   * se muestran TODOS los usuarios.
   *
   * Esto es parte de la administración global
   * del Desarrollador.
   */
  const visible =
    getLocalUsers(
      selectedLocalId
    ).filter(
      matchesSearchUser
    );

  if (
    !visible.length
  ) {
    renderEmptyRow(
      usersTableBody,
      12,
      "No hay usuarios para este filtro."
    );

    updateSummary();

    return;
  }

  usersTableBody.innerHTML =
    "";

  visible
    .slice()
    .sort(
      (
        a,
        b
      ) =>
        String(
          a.name ||
            ""
        ).localeCompare(
          String(
            b.name ||
              ""
          )
        )
    )
    .forEach(
      user => {
        const localInfo =
          getUserLocalInfo(
            user
          );

        const blocked =
          user.blocked ===
          true;

        const active =
          user.active !==
            false &&
          !blocked;

        const failedAttempts =
          numberOrZero(
            user.failedLoginAttempts
          );

        const lastAccess =
          user.lastLoginAt ||
          user.lastAccessAt ||
          null;

        const tr =
          document.createElement(
            "tr"
          );

        tr.innerHTML = `
          <td>
            ${escapeHtml(
              user.name ||
              "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              user.email ||
              "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              user.position ||
              user.role ||
              "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              user.phone ||
              "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              localInfo.nombre ||
              "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              localInfo.nombreContribuyente ||
              "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              localInfo.nit ||
              "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              localInfo.nrc ||
              "—"
            )}
          </td>

          <td>
            ${failedAttempts}
          </td>

          <td>
            ${escapeHtml(
              formatDateTime(
                lastAccess
              )
            )}
          </td>

          <td>
            ${
              active
                ? "Activo"
                : "Bloqueado"
            }
          </td>

          <td>
            <button
              type="button"
              class="btn-edit"
              data-action="edit-user"
              data-id="${escapeHtml(
                user.id ||
                user.uid
              )}"
            >
              Editar
            </button>

            <button
              type="button"
              class="btn-outline"
              data-action="toggle-user"
              data-id="${escapeHtml(
                user.id ||
                user.uid
              )}"
            >
              ${
                active
                  ? "Bloquear"
                  : "Desbloquear"
              }
            </button>
          </td>
        `;

        usersTableBody.appendChild(
          tr
        );
      }
    );

  usersTableBody
    .querySelectorAll(
      "button[data-action='edit-user']"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () =>
            editUser(
              String(
                button.dataset.id ||
                  ""
              )
            )
        );
      }
    );

  usersTableBody
    .querySelectorAll(
      "button[data-action='toggle-user']"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () =>
            toggleUserBlock(
              String(
                button.dataset.id ||
                  ""
              )
            )
        );
      }
    );

  updateSummary();
}

function renderAttempts() {
  if (
    !attemptsTableBody
  ) {
    return;
  }

  const visible =
    getLocalAttempts(
      selectedLocalId
    ).filter(
      matchesSearchAttempt
    );

  if (
    !visible.length
  ) {
    renderEmptyRow(
      attemptsTableBody,
      6,
      "No hay intentos fallidos para este filtro."
    );

    updateSummary();

    return;
  }

  attemptsTableBody.innerHTML =
    "";

  visible
    .slice()
    .sort(
      (
        a,
        b
      ) =>
        getTimestampMs(
          b.createdAt
        ) -
        getTimestampMs(
          a.createdAt
        )
    )
    .forEach(
      attempt => {
        const byEmailLocal =
          usersCache.find(
            user =>
              String(
                user.email ||
                  ""
              )
                .trim()
                .toLowerCase() ===
              String(
                attempt.email ||
                  ""
              )
                .trim()
                .toLowerCase()
          );

        const localInfo =
          byEmailLocal
            ? getUserLocalInfo(
                byEmailLocal
              )
            : {
                nombre:
                  attempt.localNombre ||
                  "—",

                nombreContribuyente:
                  attempt.localNombreContribuyente ||
                  "",

                tipoDocumento:
                  attempt.localTipoDocumento ||
                  "",

                nit:
                  attempt.localNIT ||
                  "",

                nrc:
                  attempt.localNRC ||
                  "",

                numeroDocumento:
                  attempt.localNumeroDocumento ||
                  "",

                ubicacion:
                  attempt.localUbicacion ||
                  ""
              };

        const result =
          attempt.success ===
              false ||
            String(
              attempt.result ||
                ""
            ).toLowerCase() ===
              "fallido"
            ? "Fallido"
            : "Correcto";

        const tr =
          document.createElement(
            "tr"
          );

        tr.innerHTML = `
          <td>
            ${escapeHtml(
              attempt.email ||
              "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              localInfo.nombre ||
              "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              result
            )}
          </td>

          <td>
            ${escapeHtml(
              attempt.reason ||
              attempt.message ||
              "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              formatDateOnly(
                attempt.createdAt
              )
            )}
          </td>

          <td>
            ${escapeHtml(
              formatTimeOnly(
                attempt.createdAt
              )
            )}
          </td>
        `;

        attemptsTableBody.appendChild(
          tr
        );
      }
    );

  updateSummary();
}

function renderAll() {
  renderLocalFilterOptions();
  renderLocals();
  renderUsers();
  renderAttempts();
  renderSelectedLocalCard();
}

function syncSelectionFromFilter() {
  selectedLocalId =
    String(
      localFilter?.value ||
        ""
    );

  renderAll();
}

/*
 * ============================================================
 * FIREBASE AUTH REST
 * ============================================================
 */

function getAuthApiKey() {
  try {
    return firebase
      .app()
      .options
      .apiKey;
  } catch {
    return null;
  }
}

function mapAuthRestError(
  errorMessage = ""
) {
  const message =
    String(
      errorMessage ||
        ""
    ).toUpperCase();

  switch (
    message
  ) {
    case "EMAIL_EXISTS":
      return (
        "Ese correo ya está registrado en Authentication."
      );

    case "OPERATION_NOT_ALLOWED":
      return (
        "El inicio de sesión con correo y contraseña " +
        "no está habilitado en Firebase Authentication."
      );

    case "WEAK_PASSWORD : PASSWORD SHOULD BE AT LEAST 6 CHARACTERS":
    case "WEAK_PASSWORD":
      return (
        "La contraseña debe tener al menos 6 caracteres."
      );

    case "INVALID_EMAIL":
      return (
        "El correo ingresado no es válido."
      );

    default:
      return (
        errorMessage ||
        "No se pudo crear la cuenta en Authentication."
      );
  }
}

async function createAuthUserWithEmailPassword(
  email,
  password
) {
  const apiKey =
    getAuthApiKey();

  if (
    !apiKey
  ) {
    throw new Error(
      "No se pudo leer la API key de Firebase."
    );
  }

  const response =
    await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            email,
            password,
            returnSecureToken:
              true
          })
      }
    );

  const data =
    await response.json();

  if (
    !response.ok
  ) {
    const errorMessage =
      data?.error?.message ||
      "No se pudo crear la cuenta.";

    throw new Error(
      mapAuthRestError(
        errorMessage
      )
    );
  }

  return data;
}

/*
 * ============================================================
 * MODAL DE LOCALES
 * ============================================================
 */

function buildDocumentTypeOptions(
  selectedValue = ""
) {
  return DOCUMENT_TYPE_OPTIONS
    .map(
      type => `
        <option
          value="${escapeHtml(
            type
          )}"
          ${
            type ===
            selectedValue
              ? "selected"
              : ""
          }
        >
          ${escapeHtml(
            type
          )}
        </option>
      `
    )
    .join("");
}

function buildLocalModalHtml(
  initial = {}
) {
  return `
    <input
      id="localName"
      class="swal2-input"
      placeholder="Nombre del local"
      value="${escapeHtml(
        initial.nombre ||
          ""
      )}"
    >

    <input
      id="localContributorName"
      class="swal2-input"
      placeholder="Nombre del contribuyente"
      value="${escapeHtml(
        initial.nombreContribuyente ||
          ""
      )}"
    >

    <select
      id="localDocumentType"
      class="swal2-input"
      style="
        height:auto;
        padding:12px 10px;
      "
    >
      <option value="">
        Seleccione tipo de documento
      </option>

      ${buildDocumentTypeOptions(
        initial.tipoDocumento ||
          ""
      )}
    </select>

    <input
      id="localNIT"
      class="swal2-input"
      placeholder="NIT"
      value="${escapeHtml(
        initial.nit ||
          ""
      )}"
    >

    <input
      id="localNRC"
      class="swal2-input"
      placeholder="NRC"
      value="${escapeHtml(
        initial.nrc ||
          ""
      )}"
    >

    <input
      id="localDocumentNumber"
      class="swal2-input"
      placeholder="Número de documento"
      value="${escapeHtml(
        initial.numeroDocumento ||
          ""
      )}"
    >

    <input
      id="localLocation"
      class="swal2-input"
      placeholder="Ubicación"
      value="${escapeHtml(
        initial.ubicacion ||
          ""
      )}"
    >

    <div
      style="
        text-align:left;
        font-size:0.9rem;
        color:#6b7280;
        margin-top:6px;
      "
    >
      El ID del local se utiliza para relacionar
      los usuarios y se guarda como
      <strong>id_local</strong>.
    </div>
  `;
}

function readLocalModalValues() {
  return {
    nombre:
      String(
        document.getElementById(
          "localName"
        )?.value ||
          ""
      ).trim(),

    nombreContribuyente:
      String(
        document.getElementById(
          "localContributorName"
        )?.value ||
          ""
      ).trim(),

    tipoDocumento:
      String(
        document.getElementById(
          "localDocumentType"
        )?.value ||
          ""
      ).trim(),

    nit:
      String(
        document.getElementById(
          "localNIT"
        )?.value ||
          ""
      ).trim(),

    nrc:
      String(
        document.getElementById(
          "localNRC"
        )?.value ||
          ""
      ).trim(),

    numeroDocumento:
      String(
        document.getElementById(
          "localDocumentNumber"
        )?.value ||
          ""
      ).trim(),

    ubicacion:
      String(
        document.getElementById(
          "localLocation"
        )?.value ||
          ""
      ).trim()
  };
}

function validateLocalValues(
  values
) {
  if (
    !values.nombre
  ) {
    Swal.showValidationMessage(
      "El nombre del local es obligatorio."
    );

    return false;
  }

  if (
    !values.nombreContribuyente
  ) {
    Swal.showValidationMessage(
      "El nombre del contribuyente es obligatorio."
    );

    return false;
  }

  if (
    !values.tipoDocumento
  ) {
    Swal.showValidationMessage(
      "El tipo de documento es obligatorio."
    );

    return false;
  }

  if (
    !values.nit
  ) {
    Swal.showValidationMessage(
      "El NIT es obligatorio."
    );

    return false;
  }

  if (
    !values.nrc
  ) {
    Swal.showValidationMessage(
      "El NRC es obligatorio."
    );

    return false;
  }

  if (
    !values.numeroDocumento
  ) {
    Swal.showValidationMessage(
      "El número de documento es obligatorio."
    );

    return false;
  }

  if (
    !values.ubicacion
  ) {
    Swal.showValidationMessage(
      "La ubicación es obligatoria."
    );

    return false;
  }

  return true;
}

/*
 * ============================================================
 * CREAR LOCAL
 * ============================================================
 */

async function createLocal() {
  try {
    await ensureDeveloperPermission();

    const result =
      await Swal.fire({
        title:
          "Nuevo local",

        html:
          buildLocalModalHtml(),

        confirmButtonText:
          "Guardar",

        showCancelButton:
          true,

        cancelButtonText:
          "Cancelar",

        focusConfirm:
          false,

        preConfirm: () => {
          const values =
            readLocalModalValues();

          if (
            !validateLocalValues(
              values
            )
          ) {
            return;
          }

          return values;
        }
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    const values =
      result.value;

    await ensureDeveloperPermission();

    const ref =
      db
        .collection(
          LOCAL_COLLECTION
        )
        .doc();

    const payload = {
      id_local:
        ref.id,

      nombre:
        values.nombre,

      nombreContribuyente:
        values.nombreContribuyente,

      tipoDocumento:
        values.tipoDocumento,

      nit:
        values.nit,

      nrc:
        values.nrc,

      numeroDocumento:
        values.numeroDocumento,

      ubicacion:
        values.ubicacion,

      bloqueado:
        false,

      activo:
        true,

      createdAt:
        firebase.firestore.FieldValue
          .serverTimestamp(),

      updatedAt:
        firebase.firestore.FieldValue
          .serverTimestamp(),

      createdBy:
        currentUserInfo.uid ||
        null
    };

    await ref.set(
      payload
    );

    upsertCachedDocument(
      LOCAL_COLLECTION,
      ref.id,
      {
        ...payload,

        id_local:
          ref.id,

        createdAt:
          Date.now(),

        updatedAt:
          Date.now()
      }
    );

    refreshCachesFromApp();

    renderAll();

    await Swal.fire(
      "Local guardado",
      "El local fue creado correctamente.",
      "success"
    );
  } catch (
    error
  ) {
    await showOperationError(
      error,
      "No se pudo crear el local."
    );
  }
}

/*
 * ============================================================
 * EDITAR LOCAL
 * ============================================================
 */

async function editLocal(
  localId
) {
  try {
    await ensureDeveloperPermission();

    const local =
      localsCache.find(
        item =>
          String(
            item.id_local
          ) ===
          String(
            localId
          )
      );

    if (
      !local
    ) {
      throw new Error(
        "No se encontró el local seleccionado."
      );
    }

    const result =
      await Swal.fire({
        title:
          "Editar local",

        html: `
          <div
            style="
              text-align:left;
              margin-bottom:10px;
            "
          >
            <div class="small">
              ID local:
              <span class="mono">
                ${escapeHtml(
                  local.id_local
                )}
              </span>
            </div>
          </div>

          ${buildLocalModalHtml({
            nombre:
              getLocalName(
                local
              ),

            nombreContribuyente:
              getLocalContributorName(
                local
              ),

            tipoDocumento:
              getLocalDocumentType(
                local
              ),

            nit:
              getLocalNIT(
                local
              ),

            nrc:
              getLocalNRC(
                local
              ),

            numeroDocumento:
              getLocalDocumentNumber(
                local
              ),

            ubicacion:
              getLocalUbicacion(
                local
              )
          })}
        `,

        confirmButtonText:
          "Actualizar",

        showCancelButton:
          true,

        cancelButtonText:
          "Cancelar",

        focusConfirm:
          false,

        preConfirm: () => {
          const values =
            readLocalModalValues();

          if (
            !validateLocalValues(
              values
            )
          ) {
            return;
          }

          return values;
        }
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    const values =
      result.value;

    await ensureDeveloperPermission();

    const localRef =
      db
        .collection(
          LOCAL_COLLECTION
        )
        .doc(
          String(
            local.id_local
          )
        );

    const localPatch = {
      nombre:
        values.nombre,

      nombreContribuyente:
        values.nombreContribuyente,

      tipoDocumento:
        values.tipoDocumento,

      nit:
        values.nit,

      nrc:
        values.nrc,

      numeroDocumento:
        values.numeroDocumento,

      ubicacion:
        values.ubicacion,

      updatedAt:
        firebase.firestore.FieldValue
          .serverTimestamp()
    };

    const localUsers =
      getLocalUsers(
        local.id_local
      );

    const batch =
      db.batch();

    batch.update(
      localRef,
      localPatch
    );

    localUsers.forEach(
      employee => {
        batch.update(
          db
            .collection(
              EMPLOYEE_COLLECTION
            )
            .doc(
              employee.id
            ),
          {
            localNombre:
              values.nombre,

            localNombreContribuyente:
              values.nombreContribuyente,

            localTipoDocumento:
              values.tipoDocumento,

            localNIT:
              values.nit,

            localNRC:
              values.nrc,

            localNumeroDocumento:
              values.numeroDocumento,

            localUbicacion:
              values.ubicacion,

            updatedAt:
              firebase.firestore.FieldValue
                .serverTimestamp()
          }
        );
      }
    );

    await batch.commit();

    upsertCachedDocument(
      LOCAL_COLLECTION,
      String(
        local.id_local
      ),
      {
        ...localPatch,

        updatedAt:
          Date.now()
      }
    );

    localUsers.forEach(
      employee => {
        upsertCachedDocument(
          EMPLOYEE_COLLECTION,
          employee.id,
          {
            localNombre:
              values.nombre,

            localNombreContribuyente:
              values.nombreContribuyente,

            localTipoDocumento:
              values.tipoDocumento,

            localNIT:
              values.nit,

            localNRC:
              values.nrc,

            localNumeroDocumento:
              values.numeroDocumento,

            localUbicacion:
              values.ubicacion,

            updatedAt:
              Date.now()
          }
        );
      }
    );

    refreshCachesFromApp();

    renderAll();

    await Swal.fire(
      "Actualizado",
      "El local y los usuarios asociados fueron actualizados correctamente.",
      "success"
    );
  } catch (
    error
  ) {
    await showOperationError(
      error,
      "No se pudo actualizar el local."
    );
  }
}

/*
 * ============================================================
 * BLOQUEAR / DESBLOQUEAR LOCAL
 * ============================================================
 */

async function toggleLocalBlock(
  localId
) {
  try {
    await ensureDeveloperPermission();

    const local =
      localsCache.find(
        item =>
          String(
            item.id_local
          ) ===
          String(
            localId
          )
      );

    if (
      !local
    ) {
      throw new Error(
        "No se encontró el local seleccionado."
      );
    }

    const nextBlocked =
      !(
        local.bloqueado ===
          true ||
        local.blocked ===
          true
      );

    const result =
      await Swal.fire({
        title:
          nextBlocked
            ? "Bloquear local"
            : "Desbloquear local",

        text:
          nextBlocked
            ? "Todos los usuarios de este local quedarán bloqueados."
            : "Todos los usuarios de este local quedarán habilitados.",

        icon:
          "warning",

        showCancelButton:
          true,

        confirmButtonText:
          nextBlocked
            ? "Bloquear"
            : "Desbloquear",

        cancelButtonText:
          "Cancelar"
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    await ensureDeveloperPermission();

    const localRef =
      db
        .collection(
          LOCAL_COLLECTION
        )
        .doc(
          String(
            local.id_local
          )
        );

    const localUsers =
      getLocalUsers(
        local.id_local
      );

    const batch =
      db.batch();

    const localPatch = {
      bloqueado:
        nextBlocked,

      activo:
        !nextBlocked,

      updatedAt:
        firebase.firestore.FieldValue
          .serverTimestamp()
    };

    batch.update(
      localRef,
      localPatch
    );

    localUsers.forEach(
      employee => {
        batch.update(
          db
            .collection(
              EMPLOYEE_COLLECTION
            )
            .doc(
              employee.id
            ),
          {
            blocked:
              nextBlocked,

            active:
              !nextBlocked,

            updatedAt:
              firebase.firestore.FieldValue
                .serverTimestamp()
          }
        );
      }
    );

    await batch.commit();

    upsertCachedDocument(
      LOCAL_COLLECTION,
      String(
        local.id_local
      ),
      {
        ...localPatch,

        updatedAt:
          Date.now()
      }
    );

    localUsers.forEach(
      employee => {
        upsertCachedDocument(
          EMPLOYEE_COLLECTION,
          employee.id,
          {
            blocked:
              nextBlocked,

            active:
              !nextBlocked,

            updatedAt:
              Date.now()
          }
        );
      }
    );

    refreshCachesFromApp();

    renderAll();

    await Swal.fire(
      "Listo",
      nextBlocked
        ? "Local bloqueado."
        : "Local desbloqueado.",
      "success"
    );
  } catch (
    error
  ) {
    await showOperationError(
      error,
      "No se pudo cambiar el estado del local."
    );
  }
}

/*
 * ============================================================
 * ELIMINAR LOCAL
 * ============================================================
 */

async function deleteLocal(
  localId
) {
  try {
    await ensureDeveloperPermission();

    const local =
      localsCache.find(
        item =>
          String(
            item.id_local
          ) ===
          String(
            localId
          )
      );

    if (
      !local
    ) {
      throw new Error(
        "No se encontró el local seleccionado."
      );
    }

    const users =
      getLocalUsers(
        local.id_local
      );

    if (
      users.length
    ) {
      await Swal.fire(
        "No se puede eliminar",
        "Este local tiene usuarios asignados. Primero reubica o elimina esos usuarios.",
        "warning"
      );

      return;
    }

    const result =
      await Swal.fire({
        title:
          "Eliminar local",

        text:
          "Esta acción no se puede deshacer.",

        icon:
          "warning",

        showCancelButton:
          true,

        confirmButtonText:
          "Eliminar",

        cancelButtonText:
          "Cancelar"
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    await ensureDeveloperPermission();

    await db
      .collection(
        LOCAL_COLLECTION
      )
      .doc(
        String(
          local.id_local
        )
      )
      .delete();

    removeCachedDocument(
      LOCAL_COLLECTION,
      String(
        local.id_local
      )
    );

    refreshCachesFromApp();

    if (
      String(
        selectedLocalId
      ) ===
      String(
        local.id_local
      )
    ) {
      selectedLocalId =
        "";
    }

    renderAll();

    await Swal.fire(
      "Eliminado",
      "El local fue eliminado.",
      "success"
    );
  } catch (
    error
  ) {
    await showOperationError(
      error,
      "No se pudo eliminar el local."
    );
  }
}

/*
 * ============================================================
 * MODAL DE USUARIOS
 * ============================================================
 */

function buildUserModalHtml(
  localOptions = "",
  initial = {}
) {
  return `
    <input
      id="userName"
      class="swal2-input"
      placeholder="Nombre"
      value="${escapeHtml(
        initial.name ||
          ""
      )}"
    >

    <input
      id="userEmail"
      class="swal2-input"
      placeholder="Correo electrónico"
      type="email"
      value="${escapeHtml(
        initial.email ||
          ""
      )}"
    >

    <input
      id="userPassword"
      class="swal2-input"
      placeholder="Contraseña temporal"
      type="password"
      value="${escapeHtml(
        initial.password ||
          ""
      )}"
    >

    <select
      id="userPosition"
      class="swal2-input"
      style="
        height:auto;
        padding:12px 10px;
      "
    >
      <option value="">
        Seleccione posición
      </option>

      ${
        Array.isArray(
          POSITION_OPTIONS
        )
          ? POSITION_OPTIONS
              .map(
                position => `
                  <option
                    value="${escapeHtml(
                      position
                    )}"
                    ${
                      position ===
                      initial.position
                        ? "selected"
                        : ""
                    }
                  >
                    ${escapeHtml(
                      position
                    )}
                  </option>
                `
              )
              .join("")
          : ""
      }
    </select>

    <input
      id="userPhone"
      class="swal2-input"
      placeholder="Teléfono"
      value="${escapeHtml(
        initial.phone ||
          ""
      )}"
    >

    <select
      id="userLocal"
      class="swal2-input"
      style="
        height:auto;
        padding:12px 10px;
      "
    >
      <option value="">
        Seleccione local
      </option>

      ${localOptions}
    </select>

    <label
      style="
        display:flex;
        align-items:center;
        gap:8px;
        margin-top:8px;
        font-size:0.95rem;
      "
    >
      <input
        id="userActive"
        type="checkbox"
        ${
          initial.active !==
          false
            ? "checked"
            : ""
        }
      >

      Usuario activo
    </label>

    <div
      style="
        text-align:left;
        font-size:0.9rem;
        color:#6b7280;
        margin-top:6px;
      "
    >
      El usuario se crea en Authentication
      y luego se guarda en Firestore.
    </div>
  `;
}

function buildLocalOptions(
  selectedLocalId = ""
) {
  return localsCache
    .slice()
    .sort(
      (
        a,
        b
      ) =>
        String(
          getLocalName(
            a
          )
        ).localeCompare(
          String(
            getLocalName(
              b
            )
          )
        )
    )
    .map(
      local => `
        <option
          value="${escapeHtml(
            local.id_local
          )}"
          ${
            String(
              local.id_local
            ) ===
            String(
              selectedLocalId
            )
              ? "selected"
              : ""
          }
        >
          ${escapeHtml(
            getLocalName(
              local
            ) ||
              "Local"
          )}
          —
          ${escapeHtml(
            getLocalContributorName(
              local
            ) ||
              "Sin contribuyente"
          )}
        </option>
      `
    )
    .join("");
}

function readUserModalValues() {
  return {
    name:
      String(
        document.getElementById(
          "userName"
        )?.value ||
          ""
      ).trim(),

    email:
      String(
        document.getElementById(
          "userEmail"
        )?.value ||
          ""
      ).trim(),

    password:
      String(
        document.getElementById(
          "userPassword"
        )?.value ||
          ""
      ).trim(),

    position:
      String(
        document.getElementById(
          "userPosition"
        )?.value ||
          ""
      ).trim(),

    phone:
      String(
        document.getElementById(
          "userPhone"
        )?.value ||
          ""
      ).trim(),

    id_local:
      String(
        document.getElementById(
          "userLocal"
        )?.value ||
          ""
      ).trim(),

    active:
      Boolean(
        document.getElementById(
          "userActive"
        )?.checked
      )
  };
}

/*
 * ============================================================
 * VALIDAR DESTINO DE USUARIO
 * ============================================================
 */

function getUserTargetLocalId(
  requestedLocalId = ""
) {
  const explicit =
    String(
      requestedLocalId ||
        ""
    ).trim();

  if (
    explicit
  ) {
    return explicit;
  }

  const selected =
    String(
      selectedLocalId ||
        ""
    ).trim();

  return selected;
}

function findLocalById(
  localId
) {
  const target =
    String(
      localId ||
        ""
    ).trim();

  if (
    !target
  ) {
    return null;
  }

  return (
    localsCache.find(
      local =>
        String(
          local.id_local
        ).trim() ===
        target
    ) ||
    null
  );
}

function buildUserLocalSummary(
  localId
) {
  const local =
    findLocalById(
      localId
    );

  if (
    !local
  ) {
    return "Sin local seleccionado";
  }

  return (
    getLocalName(
      local
    ) ||
    "Local"
  );
}

/*
 * ============================================================
 * CREAR USUARIO
 * ============================================================
 */

async function createUser() {
  if (
    isCreatingUser
  ) {
    return;
  }

  isCreatingUser =
    true;

  try {
    await ensureDeveloperPermission();

    if (
      !localsCache.length
    ) {
      await Swal.fire(
        "Sin locales",
        "Primero crea un local.",
        "warning"
      );

      return;
    }

    /*
     * El local actualmente seleccionado se utiliza como
     * valor inicial, pero el desarrollador puede cambiarlo.
     */
    const defaultLocalId =
      getUserTargetLocalId();

    const result =
      await Swal.fire({
        title:
          "Nuevo usuario",

        html:
          buildUserModalHtml(
            buildLocalOptions(
              defaultLocalId
            )
          ),

        confirmButtonText:
          "Guardar",

        showCancelButton:
          true,

        cancelButtonText:
          "Cancelar",

        focusConfirm:
          false,

        preConfirm: () => {
          const values =
            readUserModalValues();

          if (
            !values.name ||
            !values.email ||
            !values.password ||
            !values.position ||
            !values.id_local
          ) {
            Swal.showValidationMessage(
              "Nombre, correo, contraseña, posición y local son obligatorios."
            );

            return;
          }

          if (
            values.password.length <
            6
          ) {
            Swal.showValidationMessage(
              "La contraseña debe tener al menos 6 caracteres."
            );

            return;
          }

          if (
            !findLocalById(
              values.id_local
            )
          ) {
            Swal.showValidationMessage(
              "El local seleccionado no existe."
            );

            return;
          }

          return values;
        }
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    const values =
      result.value;

    await ensureDeveloperPermission();

    /*
     * ========================================================
     * LOCAL DESTINO
     * ========================================================
     */

    const local =
      findLocalById(
        values.id_local
      );

    if (
      !local
    ) {
      throw new Error(
        "El local seleccionado no existe."
      );
    }

    /*
     * No se necesita una consulta para validar duplicados.
     *
     * La colección completa de empleados ya está en memoria.
     *
     * Authentication también impone unicidad global del correo.
     */
    const normalizedEmail =
      values.email
        .trim()
        .toLowerCase();

    const exists =
      usersCache.some(
        employee =>
          String(
            employee.email ||
              ""
          )
            .trim()
            .toLowerCase() ===
          normalizedEmail
      );

    if (
      exists
    ) {
      await Swal.fire(
        "Validación",
        "Ya existe un usuario con ese correo electrónico.",
        "warning"
      );

      return;
    }

    /*
     * ========================================================
     * CREAR CUENTA AUTH
     * ========================================================
     */

    const authUser =
      await createAuthUserWithEmailPassword(
        values.email,
        values.password
      );

    const authUid =
      String(
        authUser.localId ||
          ""
      ).trim();

    if (
      !authUid
    ) {
      throw new Error(
        "Firebase Authentication no devolvió el UID del nuevo usuario."
      );
    }

    /*
     * ========================================================
     * DOCUMENTO EMPLEADO
     * ========================================================
     */

    const employeeRef =
      db
        .collection(
          EMPLOYEE_COLLECTION
        )
        .doc(
          authUid
        );

    const employeeData = {
      uid:
        authUid,

      name:
        values.name,

      email:
        normalizedEmail,

      position:
        values.position,

      phone:
        values.phone,

      id_local:
        values.id_local,

      localNombre:
        getLocalName(
          local
        ),

      localNombreContribuyente:
        getLocalContributorName(
          local
        ),

      localTipoDocumento:
        getLocalDocumentType(
          local
        ),

      localNIT:
        getLocalNIT(
          local
        ),

      localNRC:
        getLocalNRC(
          local
        ),

      localNumeroDocumento:
        getLocalDocumentNumber(
          local
        ),

      localUbicacion:
        getLocalUbicacion(
          local
        ),

      active:
        values.active,

      blocked:
        !values.active,

      failedLoginAttempts:
        0,

      lastLoginAt:
        null,

      lastAccessAt:
        null,

      lastFailedAt:
        null,

      createdAt:
        firebase.firestore.FieldValue
          .serverTimestamp(),

      updatedAt:
        firebase.firestore.FieldValue
          .serverTimestamp(),

      createdBy:
        currentUserInfo.uid ||
        null
    };

    await employeeRef.set(
      employeeData
    );

    /*
     * ========================================================
     * ACTUALIZAR CACHE
     * ========================================================
     */

    upsertCachedDocument(
      EMPLOYEE_COLLECTION,
      authUid,
      {
        ...employeeData,

        uid:
          authUid,

        createdAt:
          Date.now(),

        updatedAt:
          Date.now()
      }
    );

    refreshCachesFromApp();

    /*
     * Mantener el local seleccionado.
     */
    if (
      !selectedLocalId
    ) {
      selectedLocalId =
        values.id_local;
    }

    renderAll();

    await Swal.fire({
      icon:
        "success",

      title:
        "Usuario creado",

      text:
        `El usuario fue creado y asignado a ${buildUserLocalSummary(
          values.id_local
        )}.`
    });
  } catch (
    error
  ) {
    await showOperationError(
      error,
      "No se pudo crear el usuario."
    );
  } finally {
    isCreatingUser =
      false;
  }
}

/*
 * ============================================================
 * EDITAR USUARIO
 * ============================================================
 */

async function editUser(
  userIdentifier
) {
  if (
    isEditingUser
  ) {
    return;
  }

  isEditingUser =
    true;

  try {
    await ensureDeveloperPermission();

    /*
     * Buscar primero en memoria.
     *
     * Se acepta:
     *
     * - document ID
     * - UID
     */
    const user =
      findEmployeeForOperation(
        userIdentifier
      );

    if (
      !user
    ) {
      throw new Error(
        "No se encontró el usuario seleccionado en la caché de sesión."
      );
    }

    const currentLocalId =
      getUserLocalId(
        user
      );

    const result =
      await Swal.fire({
        title:
          "Editar usuario",

        html: `
          <div
            style="
              text-align:left;
              margin-bottom:10px;
              font-size:0.9rem;
              color:#6b7280;
            "
          >
            <strong>Usuario:</strong>
            ${escapeHtml(
              user.email ||
              "—"
            )}
            <br>

            <strong>UID:</strong>
            <span class="mono">
              ${escapeHtml(
                user.uid ||
                user.id ||
                "—"
              )}
            </span>
          </div>

          <input
            id="editUserName"
            class="swal2-input"
            placeholder="Nombre"
            value="${escapeHtml(
              user.name ||
                ""
            )}"
          >

          <input
            id="editUserEmail"
            class="swal2-input"
            placeholder="Correo"
            value="${escapeHtml(
              user.email ||
                ""
            )}"
            readonly
          >

          <select
            id="editUserPosition"
            class="swal2-input"
            style="
              height:auto;
              padding:12px 10px;
            "
          >
            <option value="">
              Seleccione posición
            </option>

            ${
              Array.isArray(
                POSITION_OPTIONS
              )
                ? POSITION_OPTIONS
                    .map(
                      position => `
                        <option
                          value="${escapeHtml(
                            position
                          )}"
                          ${
                            position ===
                            user.position
                              ? "selected"
                              : ""
                          }
                        >
                          ${escapeHtml(
                            position
                          )}
                        </option>
                      `
                    )
                    .join("")
                : ""
            }
          </select>

          <input
            id="editUserPhone"
            class="swal2-input"
            placeholder="Teléfono"
            value="${escapeHtml(
              user.phone ||
                ""
            )}"
          >

          <select
            id="editUserLocal"
            class="swal2-input"
            style="
              height:auto;
              padding:12px 10px;
            "
          >
            <option value="">
              Seleccione local
            </option>

            ${buildLocalOptions(
              currentLocalId
            )}
          </select>

          <label
            style="
              display:flex;
              align-items:center;
              gap:8px;
              margin-top:8px;
              font-size:0.95rem;
            "
          >
            <input
              id="editUserActive"
              type="checkbox"
              ${
                user.active !==
                  false &&
                !user.blocked
                  ? "checked"
                  : ""
              }
            >

            Usuario activo
          </label>

          <label
            style="
              display:flex;
              align-items:center;
              gap:8px;
              margin-top:8px;
              font-size:0.95rem;
            "
          >
            <input
              id="editUserBlocked"
              type="checkbox"
              ${
                user.blocked ===
                true
                  ? "checked"
                  : ""
              }
            >

            Bloqueado
          </label>

          <div
            style="
              text-align:left;
              font-size:0.85rem;
              color:#6b7280;
              margin-top:8px;
            "
          >
            El Desarrollador puede cambiar el usuario
            de un local a otro.
          </div>
        `,

        confirmButtonText:
          "Actualizar",

        showCancelButton:
          true,

        cancelButtonText:
          "Cancelar",

        focusConfirm:
          false,

        preConfirm: () => {
          const name =
            String(
              document.getElementById(
                "editUserName"
              )?.value ||
                ""
            ).trim();

          const position =
            String(
              document.getElementById(
                "editUserPosition"
              )?.value ||
                ""
            ).trim();

          const phone =
            String(
              document.getElementById(
                "editUserPhone"
              )?.value ||
                ""
            ).trim();

          const id_local =
            String(
              document.getElementById(
                "editUserLocal"
              )?.value ||
                ""
            ).trim();

          const active =
            Boolean(
              document.getElementById(
                "editUserActive"
              )?.checked
            );

          const blocked =
            Boolean(
              document.getElementById(
                "editUserBlocked"
              )?.checked
            );

          if (
            !name ||
            !position ||
            !id_local
          ) {
            Swal.showValidationMessage(
              "Nombre, posición y local son obligatorios."
            );

            return;
          }

          if (
            !findLocalById(
              id_local
            )
          ) {
            Swal.showValidationMessage(
              "El local seleccionado no existe."
            );

            return;
          }

          return {
            name,

            position,

            phone,

            id_local,

            active,

            blocked
          };
        }
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    const values =
      result.value;

    await ensureDeveloperPermission();

    const local =
      findLocalById(
        values.id_local
      );

    if (
      !local
    ) {
      throw new Error(
        "El local seleccionado no existe."
      );
    }

    /*
     * ========================================================
     * RESOLVER DOCUMENT ID REAL
     * ========================================================
     *
     * user.id puede ser:
     *
     * - UID
     * - document ID histórico
     *
     * Nunca hacemos una lectura para descubrirlo;
     * ya está en la caché.
     */
    const employeeDocumentId =
      String(
        user.id ||
          user.uid ||
          ""
      ).trim();

    if (
      !employeeDocumentId
    ) {
      throw new Error(
        "No se pudo determinar el documento del usuario."
      );
    }

    const employeePatch = {
      name:
        values.name,

      position:
        values.position,

      phone:
        values.phone,

      id_local:
        values.id_local,

      localNombre:
        getLocalName(
          local
        ),

      localNombreContribuyente:
        getLocalContributorName(
          local
        ),

      localTipoDocumento:
        getLocalDocumentType(
          local
        ),

      localNIT:
        getLocalNIT(
          local
        ),

      localNRC:
        getLocalNRC(
          local
        ),

      localNumeroDocumento:
        getLocalDocumentNumber(
          local
        ),

      localUbicacion:
        getLocalUbicacion(
          local
        ),

      active:
        values.blocked
          ? false
          : values.active,

      blocked:
        values.blocked,

      updatedAt:
        firebase.firestore.FieldValue
          .serverTimestamp()
    };

    await db
      .collection(
        EMPLOYEE_COLLECTION
      )
      .doc(
        employeeDocumentId
      )
      .update(
        employeePatch
      );

    /*
     * Actualizar inmediatamente la caché.
     */
    upsertCachedDocument(
      EMPLOYEE_COLLECTION,
      employeeDocumentId,
      {
        ...employeePatch,

        updatedAt:
          Date.now()
      }
    );

    /*
     * Si la caché usa el UID y el document ID es diferente,
     * actualizar también la entrada encontrada por UID.
     */
    const uid =
      String(
        user.uid ||
          ""
      ).trim();

    if (
      uid &&
      uid !==
        employeeDocumentId
    ) {
      updateCachedDocumentsWhere(
        EMPLOYEE_COLLECTION,
        document =>
          String(
            document.id ||
              ""
          ).trim() ===
            employeeDocumentId ||
          String(
            document.data?.uid ||
              ""
          ).trim() ===
            uid,
        employeePatch
      );
    }

    /*
     * Si se modificó el usuario actual, actualizar memoria
     * local del contexto.
     */
    const currentUid =
      String(
        currentUserInfo.uid ||
          ""
      ).trim();

    const editedUid =
      String(
        user.uid ||
          user.id ||
          ""
      ).trim();

    if (
      currentUid &&
      editedUid ===
        currentUid
    ) {
      currentUserInfo =
        {
          ...currentUserInfo,

          name:
            values.name,

          role:
            values.position
        };

      setStoredCurrentUser({
        name:
          values.name,

        role:
          values.position,

        position:
          values.position,

        id_local:
          ""
      });
    }

    refreshCachesFromApp();

    renderAll();

    await Swal.fire({
      icon:
        "success",

      title:
        "Usuario actualizado",

      text:
        `El usuario quedó asignado a ${buildUserLocalSummary(
          values.id_local
        )}.`
    });
  } catch (
    error
  ) {
    await showOperationError(
      error,
      "No se pudo actualizar el usuario."
    );
  } finally {
    isEditingUser =
      false;
  }
}

/*
 * ============================================================
 * BLOQUEAR / DESBLOQUEAR USUARIO
 * ============================================================
 */

async function toggleUserBlock(
  userIdentifier
) {
  if (
    isTogglingUser
  ) {
    return;
  }

  isTogglingUser =
    true;

  try {
    await ensureDeveloperPermission();

    /*
     * Buscar exclusivamente desde la caché.
     *
     * No importa si el identificador recibido es:
     *
     * - document ID
     * - UID
     */
    const user =
      findEmployeeForOperation(
        userIdentifier
      );

    if (
      !user
    ) {
      throw new Error(
        "No se encontró el usuario seleccionado en la caché de sesión."
      );
    }

    const nextBlocked =
      !(
        user.blocked ===
        true
      );

    const currentLocal =
      findLocalById(
        getUserLocalId(
          user
        )
      );

    const result =
      await Swal.fire({
        title:
          nextBlocked
            ? "Bloquear usuario"
            : "Desbloquear usuario",

        html:
          `
            <p>
              ${
                nextBlocked
                  ? "El usuario no podrá iniciar sesión."
                  : "El usuario podrá volver a iniciar sesión."
              }
            </p>

            <p
              style="
                margin-top:6px;
                color:#6b7280;
              "
            >
              <strong>Usuario:</strong>
              ${escapeHtml(
                user.name ||
                user.email ||
                "—"
              )}

              <br>

              <strong>Correo:</strong>
              ${escapeHtml(
                user.email ||
                "—"
              )}

              <br>

              <strong>Local:</strong>
              ${escapeHtml(
                getLocalName(
                  currentLocal ||
                  {}
                ) ||
                "—"
              )}
            </p>
          `,

        icon:
          "warning",

        showCancelButton:
          true,

        confirmButtonText:
          nextBlocked
            ? "Bloquear"
            : "Desbloquear",

        cancelButtonText:
          "Cancelar"
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    await ensureDeveloperPermission();

    const employeeDocumentId =
      String(
        user.id ||
          user.uid ||
          ""
      ).trim();

    if (
      !employeeDocumentId
    ) {
      throw new Error(
        "No se pudo determinar el documento del usuario."
      );
    }

    const employeePatch = {
      blocked:
        nextBlocked,

      active:
        !nextBlocked,

      updatedAt:
        firebase.firestore.FieldValue
          .serverTimestamp()
    };

    /*
     * ÚNICAMENTE se actualiza el documento del usuario.
     *
     * No se consulta empleados.
     */
    await db
      .collection(
        EMPLOYEE_COLLECTION
      )
      .doc(
        employeeDocumentId
      )
      .update(
        employeePatch
      );

    /*
     * Actualizar caché.
     */
    upsertCachedDocument(
      EMPLOYEE_COLLECTION,
      employeeDocumentId,
      {
        ...employeePatch,

        updatedAt:
          Date.now()
      }
    );

    const uid =
      String(
        user.uid ||
          ""
      ).trim();

    if (
      uid &&
      uid !==
        employeeDocumentId
    ) {
      updateCachedDocumentsWhere(
        EMPLOYEE_COLLECTION,
        document =>
          String(
            document.id ||
              ""
          ).trim() ===
            employeeDocumentId ||
          String(
            document.data?.uid ||
              ""
          ).trim() ===
            uid,
        employeePatch
      );
    }

    refreshCachesFromApp();

    renderAll();

    await Swal.fire({
      icon:
        "success",

      title:
        nextBlocked
          ? "Usuario bloqueado"
          : "Usuario desbloqueado",

      text:
        `${user.name ||
          user.email ||
          "El usuario"
        } fue ${
          nextBlocked
            ? "bloqueado"
            : "desbloqueado"
        } correctamente.`
    });
  } catch (
    error
  ) {
    await showOperationError(
      error,
      "No se pudo cambiar el estado del usuario."
    );
  } finally {
    isTogglingUser =
      false;
  }
}

/*
 * ============================================================
 * CARGA DEL MÓDULO
 * ============================================================
 */

async function bootDeveloper(
  user
) {
  /*
   * ==========================================================
   * 1. Resolver contexto desde app.js
   * ==========================================================
   */

  let context =
    null;

  if (
    typeof window.getCurrentUserContext ===
    "function"
  ) {
    context =
      await window.getCurrentUserContext(
        user
      );
  }

  if (
    !context
  ) {
    throw new Error(
      "No se pudo resolver el contexto del usuario autenticado."
    );
  }

  if (
    !isDeveloperRole(
      context.role ||
        context.position ||
        ""
    )
  ) {
    throw new Error(
      "Acceso denegado. El usuario autenticado no tiene el rol Desarrollador."
    );
  }

  /*
   * El Desarrollador NO requiere id_local.
   */
  const developerContext = {
    ...context,

    id_local:
      ""
  };

  currentUserInfo = {
    uid:
      user.uid,

    email:
      user.email ||
      context.email ||
      "",

    name:
      context.name ||
      user.email ||
      "Usuario",

    role:
      context.role ||
      context.position ||
      "Desarrollador"
  };

  cacheResolvedDeveloperProfile(
    developerContext
  );

  /*
   * ==========================================================
   * 2. Garantizar caché global
   * ==========================================================
   */

  await ensureDeveloperSessionData(
    user
  );

  /*
   * ==========================================================
   * 3. Verificar autorización
   * ==========================================================
   */

  await verifyDeveloperAccess(
    user
  );

  /*
   * ==========================================================
   * 4. Sincronizar únicamente desde caché
   * ==========================================================
   */

  refreshCachesFromApp();

  cacheResolvedDeveloperProfile(
    developerContext
  );

  /*
   * Asegurar que la selección inicial no apunte
   * a un local inexistente.
   */
  if (
    selectedLocalId &&
    !findLocalById(
      selectedLocalId
    )
  ) {
    selectedLocalId =
      "";
  }
}

document.addEventListener(
  "DOMContentLoaded",
  () => {
    if (
      globalSearch
    ) {
      globalSearch.addEventListener(
        "input",
        renderAll
      );
    }

    if (
      localFilter
    ) {
      localFilter.addEventListener(
        "change",
        syncSelectionFromFilter
      );
    }

    /*
     * ========================================================
     * NUEVO LOCAL
     * ========================================================
     */

    if (
      btnNewLocal
    ) {
      btnNewLocal.addEventListener(
        "click",
        createLocal
      );
    }

    /*
     * ========================================================
     * NUEVO USUARIO
     * ========================================================
     *
     * El desarrollador puede crear usuarios para cualquier
     * local visible en la caché.
     */

    if (
      btnNewUser
    ) {
      btnNewUser.addEventListener(
        "click",
        createUser
      );
    }

    /*
     * ========================================================
     * ACTUALIZAR
     * ========================================================
     *
     * No consulta Firestore.
     *
     * Únicamente reconstruye la UI con la caché.
     */

    if (
      btnRefresh
    ) {
      btnRefresh.addEventListener(
        "click",
        () => {
          refreshCachesFromApp();

          renderAll();
        }
      );
    }

    /*
     * ========================================================
     * AUTH
     * ========================================================
     */

    auth.onAuthStateChanged(
      async user => {
        if (
          !user
        ) {
          if (
            typeof window.clearSessionDataCache ===
            "function"
          ) {
            window.clearSessionDataCache();
          }

          window.location.href =
            "index.html";

          return;
        }

        try {
          await bootDeveloper(
            user
          );
        } catch (
          error
        ) {
          console.error(
            "Error de autorización:",
            error
          );

          await Swal.fire({
            icon:
              "error",

            title:
              "Acceso denegado",

            text:
              error.message ||
              "No se pudo validar el perfil del usuario."
          });

          window.location.href =
            "dashboard.html";

          return;
        }

        if (
          typeof window.renderNavigationForRole ===
          "function"
        ) {
          window.renderNavigationForRole(
            "Desarrollador"
          );
        }

        const greetingText =
          `Hola, ${
            currentUserInfo.name
          } (Desarrollador)`;

        greetingEls.forEach(
          element => {
            element.textContent =
              greetingText;
          }
        );

        renderAll();

        moduleInitialized =
          true;
      }
    );

    /*
     * ========================================================
     * LOGOUT DESKTOP
     * ========================================================
     */

    const logoutBtn =
      document.getElementById(
        "logoutButton"
      );

    if (
      logoutBtn
    ) {
      logoutBtn.addEventListener(
        "click",
        async () => {
          try {
            await auth.signOut();
          } finally {
            if (
              typeof window.clearSessionDataCache ===
              "function"
            ) {
              window.clearSessionDataCache();
            }

            localStorage.removeItem(
              "currentUser"
            );

            window.location.href =
              "index.html";
          }
        }
      );
    }

    /*
     * ========================================================
     * LOGOUT MOBILE
     * ========================================================
     */

    const logoutBtnMobile =
      document.getElementById(
        "logoutButtonMobile"
      );

    if (
      logoutBtnMobile
    ) {
      logoutBtnMobile.addEventListener(
        "click",
        async () => {
          try {
            await auth.signOut();
          } finally {
            if (
              typeof window.clearSessionDataCache ===
              "function"
            ) {
              window.clearSessionDataCache();
            }

            localStorage.removeItem(
              "currentUser"
            );

            window.location.href =
              "index.html";
          }
        }
      );
    }
  }
);

/*
 * ============================================================
 * API GLOBAL
 * ============================================================
 */

window.editLocal =
  editLocal;

window.deleteLocal =
  deleteLocal;

window.toggleLocalBlock =
  toggleLocalBlock;

window.createUser =
  createUser;

window.editUser =
  editUser;

window.toggleUserBlock =
  toggleUserBlock;

window.verifyDeveloperAccess =
  verifyDeveloperAccess;

window.findLegacyEmployee =
  findLegacyEmployee;

window.migrateEmployeeToAuthUid =
  migrateEmployeeToAuthUid;

window.ensureDeveloperSessionData =
  ensureDeveloperSessionData;

window.refreshCachesFromApp =
  refreshCachesFromApp;

window.findEmployeeForOperation =
  findEmployeeForOperation;

window.getLocalUsers =
  getLocalUsers;