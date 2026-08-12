// assets/js/locals.js
// Módulo exclusivo del rol Desarrollador.
//
// Funciones:
// - CRUD de locales.
// - CRUD de usuarios por local.
// - Bloqueo / desbloqueo.
// - Visualización de intentos fallidos.
// - Visualización de último acceso.
// - Datos fiscales del local:
//   nombre del contribuyente.
//   tipo de documento.
//   NIT.
//   NRC.
//
// Importante:
// La autorización administrativa se verifica contra
// empleados/{Firebase Authentication UID}.
//
// Si el sistema antiguo tenía el perfil guardado con
// otro ID de documento, se intenta migrar automáticamente
// al documento canónico empleados/{auth.currentUser.uid}.

const greetingEls =
  document.querySelectorAll(".userGreeting");

const localsTableBody =
  document.querySelector("#localsTable tbody");

const usersTableBody =
  document.querySelector("#localUsersTable tbody");

const attemptsTableBody =
  document.querySelector("#loginAttemptsTable tbody");

const localFilter =
  document.getElementById("localFilter");

const globalSearch =
  document.getElementById("globalSearch");

const btnNewLocal =
  document.getElementById("btnNewLocal");

const btnNewUser =
  document.getElementById("btnNewUser");

const btnRefresh =
  document.getElementById("btnRefresh");

const statLocals =
  document.getElementById("statLocals");

const statUsers =
  document.getElementById("statUsers");

const statBlocked =
  document.getElementById("statBlocked");

const statFailed =
  document.getElementById("statFailed");

const localCountLabel =
  document.getElementById("localCountLabel");

const userCountLabel =
  document.getElementById("userCountLabel");

const attemptCountLabel =
  document.getElementById("attemptCountLabel");

const selectedLocalCard =
  document.getElementById("selectedLocalCard");

const LOCAL_COLLECTION = "local";
const EMPLOYEE_COLLECTION = "empleados";
const ATTEMPTS_COLLECTION = "login_attempts";

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

let currentUserInfo = {
  uid: "",
  email: "",
  name: "Usuario",
  role: ""
};

let localsCache = [];
let usersCache = [];
let attemptsCache = [];
let selectedLocalId = "";

let unsubscribeLocals = null;
let unsubscribeUsers = null;
let unsubscribeAttempts = null;

/*
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

function normalizeRoleLocal(role = "") {
  return String(role || "")
    .trim()
    .toLowerCase();
}

function isDeveloperRole(role = "") {
  const normalized =
    normalizeRoleLocal(role);

  return (
    normalized === "desarrollador" ||
    normalized === "developer"
  );
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function numberOrZero(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date =
    value.seconds !== undefined
      ? new Date(value.seconds * 1000)
      : new Date(value);

  if (isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("es-ES");
}

function formatDateOnly(value) {
  if (!value) {
    return "—";
  }

  const date =
    value.seconds !== undefined
      ? new Date(value.seconds * 1000)
      : new Date(value);

  if (isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("es-ES");
}

function formatTimeOnly(value) {
  if (!value) {
    return "—";
  }

  const date =
    value.seconds !== undefined
      ? new Date(value.seconds * 1000)
      : new Date(value);

  if (isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getFirestoreErrorMessage(
  error,
  fallback = "Ocurrió un error."
) {
  const code =
    String(error?.code || "").toLowerCase();

  const message =
    String(error?.message || "");

  if (
    code === "permission-denied" ||
    code.includes("permission-denied") ||
    message
      .toLowerCase()
      .includes(
        "missing or insufficient permissions"
      )
  ) {
    return (
      "Firestore rechazó la operación por permisos. " +
      "Verifica que las reglas publicadas correspondan " +
      "al perfil empleados/{UID} del usuario autenticado."
    );
  }

  if (
    code === "not-found" ||
    code.includes("not-found")
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
    icon: "error",
    title: "Operación no realizada",
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
      ) || "null"
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
      getStoredCurrentUser() || {};

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
 * RESOLUCIÓN / MIGRACIÓN DEL PERFIL
 * ============================================================
 *
 * Firestore Rules necesitan:
 *
 * empleados/{request.auth.uid}
 *
 * Pero versiones anteriores del sistema pudieron haber creado
 * empleados con un ID de documento diferente.
 *
 * Esta función localiza ese perfil y crea la copia canónica.
 */

async function findLegacyEmployee(
  user
) {
  if (!user?.uid) {
    return null;
  }

  /*
   * 1. Buscar por campo uid.
   */
  try {
    const byUid =
      await db
        .collection(
          EMPLOYEE_COLLECTION
        )
        .where(
          "uid",
          "==",
          user.uid
        )
        .limit(1)
        .get();

    if (!byUid.empty) {
      const doc =
        byUid.docs[0];

      return {
        id: doc.id,
        data: doc.data() || {},
        source: "uid"
      };
    }
  } catch (error) {
    console.warn(
      "No se pudo buscar empleado por uid:",
      error
    );
  }

  /*
   * 2. Buscar por correo.
   */
  if (user.email) {
    try {
      const byEmail =
        await db
          .collection(
            EMPLOYEE_COLLECTION
          )
          .where(
            "email",
            "==",
            user.email
          )
          .limit(1)
          .get();

      if (!byEmail.empty) {
        const doc =
          byEmail.docs[0];

        return {
          id: doc.id,
          data: doc.data() || {},
          source: "email"
        };
      }
    } catch (error) {
      console.warn(
        "No se pudo buscar empleado por email:",
        error
      );
    }
  }

  return null;
}

/*
 * Crea empleados/{auth.uid} utilizando el perfil legado.
 *
 * Las reglas deben permitir la creación del propio documento
 * del usuario cuando empId == request.auth.uid.
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

  const targetRef =
    db
      .collection(
        EMPLOYEE_COLLECTION
      )
      .doc(user.uid);

  const existing =
    await targetRef.get();

  if (existing.exists) {
    return {
      id: existing.id,
      data: existing.data() || {}
    };
  }

  const legacyData =
    legacyEmployee.data || {};

  const migratedData = {
    ...legacyData,

    uid:
      user.uid,

    email:
      user.email ||
      legacyData.email ||
      "",

    updatedAt:
      firebase.firestore.FieldValue
        .serverTimestamp(),

    migratedFromEmployeeId:
      legacyEmployee.id
  };

  /*
   * No se modifica el documento antiguo.
   * Se crea el documento canónico.
   */
  await targetRef.set(
    migratedData,
    {
      merge: true
    }
  );

  const migratedSnap =
    await targetRef.get();

  if (!migratedSnap.exists) {
    throw new Error(
      "No fue posible crear el perfil canónico empleados/" +
      user.uid +
      "."
    );
  }

  return {
    id: migratedSnap.id,
    data:
      migratedSnap.data() || {}
  };
}

/*
 * ============================================================
 * VERIFICACIÓN REAL DEL DESARROLLADOR
 * ============================================================
 */

async function verifyDeveloperAccess(
  user
) {
  if (!user || !user.uid) {
    throw new Error(
      "No existe una sesión de Firebase válida."
    );
  }

  const targetRef =
    db
      .collection(
        EMPLOYEE_COLLECTION
      )
      .doc(user.uid);

  /*
   * Primero intentamos obtener el documento canónico.
   */
  let employeeSnap =
    await targetRef.get();

  /*
   * Si no existe, intentamos localizar un perfil legado.
   */
  if (!employeeSnap.exists) {
    const legacyEmployee =
      await findLegacyEmployee(
        user
      );

    if (legacyEmployee) {
      try {
        const migrated =
          await migrateEmployeeToAuthUid(
            user,
            legacyEmployee
          );

        if (migrated) {
          employeeSnap =
            await targetRef.get();
        }
      } catch (migrationError) {
        console.error(
          "Error migrando perfil:",
          migrationError
        );

        throw new Error(
          "Se encontró el perfil del usuario, " +
          "pero no fue posible crear empleados/" +
          user.uid +
          ". " +
          getFirestoreErrorMessage(
            migrationError,
            "Verifica las reglas de Firestore."
          )
        );
      }
    }
  }

  /*
   * Si después de la migración sigue sin existir,
   * realmente no hay perfil compatible.
   */
  if (!employeeSnap.exists) {
    throw new Error(
      "No existe un perfil asociado al usuario autenticado. " +
      "No se encontró empleados/" +
      user.uid +
      " ni un empleado asociado por uid o correo."
    );
  }

  const data =
    employeeSnap.data() || {};

  const role =
    String(
      data.position ||
      data.role ||
      ""
    ).trim();

  if (!isDeveloperRole(role)) {
    throw new Error(
      "Acceso denegado. El perfil de Firestore tiene " +
      "el rol '" +
      (role || "sin definir") +
      "', no 'Desarrollador'."
    );
  }

  currentUserInfo = {
    uid:
      user.uid,

    email:
      user.email ||
      data.email ||
      "",

    name:
      data.name ||
      "Usuario",

    role
  };

  setStoredCurrentUser({
    uid:
      currentUserInfo.uid,

    email:
      currentUserInfo.email,

    name:
      currentUserInfo.name,

    role:
      currentUserInfo.role,

    employeeId:
      user.uid
  });

  return data;
}

/*
 * Verificación adicional antes de una mutación.
 */
async function ensureDeveloperPermission() {
  const user =
    auth.currentUser;

  if (!user) {
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

function getLocalName(local = {}) {
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

function getLocalNIT(local = {}) {
  return String(
    local.nit ||
    local.NIT ||
    ""
  ).trim();
}

function getLocalNRC(local = {}) {
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
      getUserLocalId(user),

    nombre:
      String(
        user.localNombre || ""
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
        user.localNIT || ""
      ).trim(),

    nrc:
      String(
        user.localNRC || ""
      ).trim(),

    numeroDocumento:
      String(
        user.localNumeroDocumento ||
        ""
      ).trim(),

    ubicacion:
      String(
        user.localUbicacion || ""
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
    ) || null
  );
}

function getLocalUsers(
  localId = ""
) {
  const target =
    String(localId || "")
      .trim();

  if (!target) {
    return [
      ...usersCache
    ];
  }

  return usersCache.filter(
    user =>
      String(
        getUserLocalId(user)
      ) === target
  );
}

function getLocalAttempts(
  localId = ""
) {
  const target =
    String(localId || "")
      .trim();

  if (!target) {
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
              user.email || ""
            )
              .trim()
              .toLowerCase() ===
            String(
              attempt.email || ""
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
        ) === target
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
    globalSearch?.value || ""
  )
    .toLowerCase()
    .trim();
}

function matchesSearchLocal(
  local = {}
) {
  const query =
    getCurrentSearch();

  if (!query) {
    return true;
  }

  const haystack = [
    getLocalName(local),
    getLocalContributorName(
      local
    ),
    getLocalDocumentType(
      local
    ),
    getLocalNIT(local),
    getLocalNRC(local),
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
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function matchesSearchUser(
  user = {}
) {
  const query =
    getCurrentSearch();

  if (!query) {
    return true;
  }

  const localInfo =
    getUserLocalInfo(user);

  const haystack = [
    user.name,
    user.email,
    user.position,
    user.phone,

    localInfo.nombre,
    localInfo.nombreContribuyente,
    localInfo.tipoDocumento,
    localInfo.nit,
    localInfo.nrc,
    localInfo.numeroDocumento,
    localInfo.ubicacion,

    user.failedLoginAttempts,
    user.lastLoginAt,
    user.lastAccessAt,
    user.blockReason
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function matchesSearchAttempt(
  attempt = {}
) {
  const query =
    getCurrentSearch();

  if (!query) {
    return true;
  }

  const byEmailLocal =
    usersCache.find(
      user =>
        String(
          user.email || ""
        )
          .trim()
          .toLowerCase() ===
        String(
          attempt.email || ""
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
    .join(" ")
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
  if (!tbody) {
    return;
  }

  tbody.innerHTML = `
    <tr>
      <td colspan="${colspan}">
        ${escapeHtml(text)}
      </td>
    </tr>
  `;
}

function renderSelectedLocalCard() {
  if (!selectedLocalCard) {
    return;
  }

  const local =
    getSelectedLocal();

  if (!local) {
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
        y usuarios.
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
        getLocalName(local) ||
          "—"
      )}
      <br>

      <strong>
        Contribuyente:
      </strong>
      ${escapeHtml(
        getLocalContributorName(
          local
        ) || "—"
      )}
      <br>

      <strong>
        Tipo de documento:
      </strong>
      ${escapeHtml(
        getLocalDocumentType(
          local
        ) || "—"
      )}
      <br>

      <strong>NIT:</strong>
      ${escapeHtml(
        getLocalNIT(local) ||
          "—"
      )}
      <br>

      <strong>NRC:</strong>
      ${escapeHtml(
        getLocalNRC(local) ||
          "—"
      )}
      <br>

      <strong>
        Número de documento:
      </strong>
      ${escapeHtml(
        getLocalDocumentNumber(
          local
        ) || "—"
      )}
      <br>

      <strong>
        Ubicación:
      </strong>
      ${escapeHtml(
        getLocalUbicacion(
          local
        ) || "—"
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
      Filtrando usuarios e intentos
      por este local.
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
        user.blocked === true ||
        user.active === false
    ).length;

  const failed =
    visibleUsers.reduce(
      (sum, user) =>
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
          attempt.result || ""
        )
          .toLowerCase() ===
          "fallido"
    ).length;

  if (statLocals) {
    statLocals.textContent =
      totalLocals;
  }

  if (statUsers) {
    statUsers.textContent =
      visibleUsers.length;
  }

  if (statBlocked) {
    statBlocked.textContent =
      blocked;
  }

  if (statFailed) {
    statFailed.textContent =
      failed;
  }

  if (localCountLabel) {
    localCountLabel.textContent =
      `${localsCache.filter(
        matchesSearchLocal
      ).length} registros`;
  }

  if (userCountLabel) {
    userCountLabel.textContent =
      `${visibleUsers.length} registros`;
  }

  if (attemptCountLabel) {
    attemptCountLabel.textContent =
      `${visibleAttempts.length} registros`;
  }
}

function renderLocalFilterOptions() {
  if (!localFilter) {
    return;
  }

  const current =
    String(
      localFilter.value || ""
    );

  localFilter.innerHTML = `
    <option value="">
      Todos los locales
    </option>
  `;

  localsCache
    .slice()
    .sort(
      (a, b) =>
        String(
          getLocalName(a)
        ).localeCompare(
          String(
            getLocalName(b)
          )
        )
    )
    .forEach(local => {
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
    });

  localFilter.value =
    current &&
    localsCache.some(
      local =>
        String(
          local.id_local ||
          local.id
        ) === current
    )
      ? current
      : "";

  selectedLocalId =
    localFilter.value ||
    "";
}

function renderLocals() {
  if (!localsTableBody) {
    return;
  }

  const visible =
    localsCache.filter(
      matchesSearchLocal
    );

  if (!visible.length) {
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

  visible.forEach(local => {
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
          (a, b) => {
            const dateA =
              a.seconds !==
              undefined
                ? a.seconds * 1000
                : new Date(
                    a
                  ).getTime();

            const dateB =
              b.seconds !==
              undefined
                ? b.seconds * 1000
                : new Date(
                    b
                  ).getTime();

            return (
              dateB -
              dateA
            );
          }
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
          ) || "—"
        )}
      </td>

      <td>
        ${escapeHtml(
          getLocalContributorName(
            local
          ) || "—"
        )}
      </td>

      <td>
        ${escapeHtml(
          getLocalDocumentType(
            local
          ) || "—"
        )}
      </td>

      <td>
        ${escapeHtml(
          getLocalNIT(
            local
          ) || "—"
        )}
      </td>

      <td>
        ${escapeHtml(
          getLocalNRC(
            local
          ) || "—"
        )}
      </td>

      <td>
        ${escapeHtml(
          getLocalDocumentNumber(
            local
          ) || "—"
        )}
      </td>

      <td>
        ${escapeHtml(
          getLocalUbicacion(
            local
          ) || "—"
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
  });

  localsTableBody
    .querySelectorAll(
      "button[data-action='select-local']"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          selectedLocalId =
            String(
              button.dataset.id ||
                ""
            );

          if (localFilter) {
            localFilter.value =
              selectedLocalId;
          }

          renderAll();
        }
      );
    });

  localsTableBody
    .querySelectorAll(
      "button[data-action='edit-local']"
    )
    .forEach(button => {
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
    });

  localsTableBody
    .querySelectorAll(
      "button[data-action='toggle-local']"
    )
    .forEach(button => {
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
    });

  localsTableBody
    .querySelectorAll(
      "button[data-action='delete-local']"
    )
    .forEach(button => {
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
    });

  updateSummary();
  renderSelectedLocalCard();
}

function renderUsers() {
  if (!usersTableBody) {
    return;
  }

  const visible =
    getLocalUsers(
      selectedLocalId
    ).filter(
      matchesSearchUser
    );

  if (!visible.length) {
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
    .sort(
      (a, b) =>
        String(
          a.name || ""
        ).localeCompare(
          String(
            b.name || ""
          )
        )
    )
    .forEach(user => {
      const localInfo =
        getUserLocalInfo(
          user
        );

      const blocked =
        user.blocked ===
        true;

      const active =
        user.active !== false &&
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
              user.id
            )}"
          >
            Editar
          </button>

          <button
            type="button"
            class="btn-outline"
            data-action="toggle-user"
            data-id="${escapeHtml(
              user.id
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
    });

  usersTableBody
    .querySelectorAll(
      "button[data-action='edit-user']"
    )
    .forEach(button => {
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
    });

  usersTableBody
    .querySelectorAll(
      "button[data-action='toggle-user']"
    )
    .forEach(button => {
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
    });

  updateSummary();
}

function renderAttempts() {
  if (!attemptsTableBody) {
    return;
  }

  const visible =
    getLocalAttempts(
      selectedLocalId
    ).filter(
      matchesSearchAttempt
    );

  if (!visible.length) {
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
    .sort(
      (a, b) => {
        const dateA =
          a.createdAt?.seconds !==
          undefined
            ? a.createdAt.seconds *
              1000
            : new Date(
                a.createdAt || 0
              ).getTime();

        const dateB =
          b.createdAt?.seconds !==
          undefined
            ? b.createdAt.seconds *
              1000
            : new Date(
                b.createdAt || 0
              ).getTime();

        return (
          dateB -
          dateA
        );
      }
    )
    .forEach(attempt => {
      const byEmailLocal =
        usersCache.find(
          user =>
            String(
              user.email || ""
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
    });

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
      errorMessage || ""
    ).toUpperCase();

  switch (message) {
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

  if (!apiKey) {
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
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken:
            true
        })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
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
 * LISTENERS
 * ============================================================
 */

function stopListeners() {
  if (
    typeof unsubscribeLocals ===
    "function"
  ) {
    unsubscribeLocals();
    unsubscribeLocals = null;
  }

  if (
    typeof unsubscribeUsers ===
    "function"
  ) {
    unsubscribeUsers();
    unsubscribeUsers = null;
  }

  if (
    typeof unsubscribeAttempts ===
    "function"
  ) {
    unsubscribeAttempts();
    unsubscribeAttempts = null;
  }
}

function loadLocalsRealtime() {
  if (unsubscribeLocals) {
    unsubscribeLocals();
  }

  unsubscribeLocals =
    db
      .collection(
        LOCAL_COLLECTION
      )
      .onSnapshot(
        snapshot => {
          localsCache = [];

          snapshot.forEach(
            doc => {
              const data =
                doc.data() || {};

              localsCache.push({
                id_local:
                  String(
                    data.id_local ||
                    doc.id ||
                    ""
                  ).trim(),

                id:
                  doc.id,

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
              });
            }
          );

          renderAll();
        },
        error => {
          console.error(
            "Error cargando locales:",
            error
          );

          renderEmptyRow(
            localsTableBody,
            11,
            "Error cargando locales"
          );
        }
      );
}

function loadUsersRealtime() {
  if (unsubscribeUsers) {
    unsubscribeUsers();
  }

  unsubscribeUsers =
    db
      .collection(
        EMPLOYEE_COLLECTION
      )
      .onSnapshot(
        snapshot => {
          usersCache = [];

          snapshot.forEach(
            doc => {
              const data =
                doc.data() || {};

              usersCache.push({
                id:
                  doc.id,

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
              });
            }
          );

          renderAll();
        },
        error => {
          console.error(
            "Error cargando usuarios:",
            error
          );

          renderEmptyRow(
            usersTableBody,
            12,
            "Error cargando usuarios"
          );
        }
      );
}

function loadAttemptsRealtime() {
  if (unsubscribeAttempts) {
    unsubscribeAttempts();
  }

  unsubscribeAttempts =
    db
      .collection(
        ATTEMPTS_COLLECTION
      )
      .onSnapshot(
        snapshot => {
          attemptsCache = [];

          snapshot.forEach(
            doc => {
              attemptsCache.push({
                id:
                  doc.id,
                ...doc.data()
              });
            }
          );

          renderAll();
        },
        error => {
          console.error(
            "Error cargando intentos:",
            error
          );

          renderEmptyRow(
            attemptsTableBody,
            6,
            "Error cargando intentos"
          );
        }
      );
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
          ${escapeHtml(type)}
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
        initial.nombre || ""
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
        initial.nit || ""
      )}"
    >

    <input
      id="localNRC"
      class="swal2-input"
      placeholder="NRC"
      value="${escapeHtml(
        initial.nrc || ""
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
        initial.ubicacion || ""
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
        )?.value || ""
      ).trim(),

    nombreContribuyente:
      String(
        document.getElementById(
          "localContributorName"
        )?.value || ""
      ).trim(),

    tipoDocumento:
      String(
        document.getElementById(
          "localDocumentType"
        )?.value || ""
      ).trim(),

    nit:
      String(
        document.getElementById(
          "localNIT"
        )?.value || ""
      ).trim(),

    nrc:
      String(
        document.getElementById(
          "localNRC"
        )?.value || ""
      ).trim(),

    numeroDocumento:
      String(
        document.getElementById(
          "localDocumentNumber"
        )?.value || ""
      ).trim(),

    ubicacion:
      String(
        document.getElementById(
          "localLocation"
        )?.value || ""
      ).trim()
  };
}

function validateLocalValues(
  values
) {
  if (!values.nombre) {
    Swal.showValidationMessage(
      "El nombre del local es obligatorio."
    );

    return false;
  }

  if (!values.nombreContribuyente) {
    Swal.showValidationMessage(
      "El nombre del contribuyente es obligatorio."
    );

    return false;
  }

  if (!values.tipoDocumento) {
    Swal.showValidationMessage(
      "El tipo de documento es obligatorio."
    );

    return false;
  }

  if (!values.nit) {
    Swal.showValidationMessage(
      "El NIT es obligatorio."
    );

    return false;
  }

  if (!values.nrc) {
    Swal.showValidationMessage(
      "El NRC es obligatorio."
    );

    return false;
  }

  if (!values.numeroDocumento) {
    Swal.showValidationMessage(
      "El número de documento es obligatorio."
    );

    return false;
  }

  if (!values.ubicacion) {
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

    if (!result.isConfirmed) {
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

    await ref.set({
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
    });

    await Swal.fire(
      "Local guardado",
      "El local fue creado correctamente.",
      "success"
    );
  } catch (error) {
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

    if (!local) {
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

    if (!result.isConfirmed) {
      return;
    }

    const values =
      result.value;

    /*
     * Comprobar nuevamente el perfil
     * justo antes de la escritura.
     */
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

    const localSnap =
      await localRef.get();

    if (!localSnap.exists) {
      throw new Error(
        "El documento del local ya no existe en Firestore."
      );
    }

    const usersSnap =
      await db
        .collection(
          EMPLOYEE_COLLECTION
        )
        .where(
          "id_local",
          "==",
          String(
            local.id_local
          )
        )
        .get();

    const batch =
      db.batch();

    batch.update(
      localRef,
      {
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
      }
    );

    usersSnap.forEach(
      employeeDoc => {
        batch.update(
          employeeDoc.ref,
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

    await Swal.fire(
      "Actualizado",
      "El local y los usuarios asociados fueron actualizados correctamente.",
      "success"
    );
  } catch (error) {
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

    if (!local) {
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

    if (!result.isConfirmed) {
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

    const usersSnap =
      await db
        .collection(
          EMPLOYEE_COLLECTION
        )
        .where(
          "id_local",
          "==",
          String(
            local.id_local
          )
        )
        .get();

    const batch =
      db.batch();

    batch.update(
      localRef,
      {
        bloqueado:
          nextBlocked,

        activo:
          !nextBlocked,

        updatedAt:
          firebase.firestore.FieldValue
            .serverTimestamp()
      }
    );

    usersSnap.forEach(
      employeeDoc => {
        batch.update(
          employeeDoc.ref,
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

    await Swal.fire(
      "Listo",
      nextBlocked
        ? "Local bloqueado."
        : "Local desbloqueado.",
      "success"
    );
  } catch (error) {
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

    if (!local) {
      throw new Error(
        "No se encontró el local seleccionado."
      );
    }

    const usersSnap =
      await db
        .collection(
          EMPLOYEE_COLLECTION
        )
        .where(
          "id_local",
          "==",
          String(
            local.id_local
          )
        )
        .get();

    if (!usersSnap.empty) {
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

    if (!result.isConfirmed) {
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

    await Swal.fire(
      "Eliminado",
      "El local fue eliminado.",
      "success"
    );
  } catch (error) {
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
        initial.name || ""
      )}"
    >

    <input
      id="userEmail"
      class="swal2-input"
      placeholder="Correo electrónico"
      type="email"
      value="${escapeHtml(
        initial.email || ""
      )}"
    >

    <input
      id="userPassword"
      class="swal2-input"
      placeholder="Contraseña temporal"
      type="password"
      value="${escapeHtml(
        initial.password || ""
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
        initial.phone || ""
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
          initial.active !== false
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
      (a, b) =>
        String(
          getLocalName(a)
        ).localeCompare(
          String(
            getLocalName(b)
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
            ) || "Local"
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
        )?.value || ""
      ).trim(),

    email:
      String(
        document.getElementById(
          "userEmail"
        )?.value || ""
      ).trim(),

    password:
      String(
        document.getElementById(
          "userPassword"
        )?.value || ""
      ).trim(),

    position:
      String(
        document.getElementById(
          "userPosition"
        )?.value || ""
      ).trim(),

    phone:
      String(
        document.getElementById(
          "userPhone"
        )?.value || ""
      ).trim(),

    id_local:
      String(
        document.getElementById(
          "userLocal"
        )?.value || ""
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
 * CREAR USUARIO
 * ============================================================
 */

async function createUser() {
  try {
    await ensureDeveloperPermission();

    if (!localsCache.length) {
      await Swal.fire(
        "Sin locales",
        "Primero crea un local.",
        "warning"
      );

      return;
    }

    const result =
      await Swal.fire({
        title:
          "Nuevo usuario",

        html:
          buildUserModalHtml(
            buildLocalOptions(
              selectedLocalId
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

          return values;
        }
      });

    if (!result.isConfirmed) {
      return;
    }

    const values =
      result.value;

    await ensureDeveloperPermission();

    const local =
      localsCache.find(
        item =>
          String(
            item.id_local
          ) ===
          String(
            values.id_local
          )
      );

    if (!local) {
      throw new Error(
        "El local seleccionado no existe."
      );
    }

    const exists =
      await db
        .collection(
          EMPLOYEE_COLLECTION
        )
        .where(
          "email",
          "==",
          values.email
        )
        .where(
          "id_local",
          "==",
          values.id_local
        )
        .limit(1)
        .get();

    if (!exists.empty) {
      await Swal.fire(
        "Validación",
        "Ya existe un usuario con ese correo en este local.",
        "warning"
      );

      return;
    }

    const authUser =
      await createAuthUserWithEmailPassword(
        values.email,
        values.password
      );

    /*
     * La cuenta REST devuelve el UID real de Authentication.
     *
     * Se utiliza directamente como ID del documento empleado.
     */
    await db
      .collection(
        EMPLOYEE_COLLECTION
      )
      .doc(
        authUser.localId
      )
      .set({
        uid:
          authUser.localId,

        name:
          values.name,

        email:
          values.email,

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
      });

    await Swal.fire(
      "Usuario creado",
      "La cuenta fue creada en Authentication y Firestore.",
      "success"
    );
  } catch (error) {
    await showOperationError(
      error,
      "No se pudo crear el usuario."
    );
  }
}

/*
 * ============================================================
 * EDITAR USUARIO
 * ============================================================
 */

async function editUser(
  userId
) {
  try {
    await ensureDeveloperPermission();

    const user =
      usersCache.find(
        item =>
          String(item.id) ===
          String(userId)
      );

    if (!user) {
      throw new Error(
        "No se encontró el usuario seleccionado."
      );
    }

    const result =
      await Swal.fire({
        title:
          "Editar usuario",

        html: `
          <input
            id="editUserName"
            class="swal2-input"
            placeholder="Nombre"
            value="${escapeHtml(
              user.name || ""
            )}"
          >

          <input
            id="editUserEmail"
            class="swal2-input"
            placeholder="Correo"
            value="${escapeHtml(
              user.email || ""
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
              user.phone || ""
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
            ${buildLocalOptions(
              getUserLocalId(
                user
              )
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
              )?.value || ""
            ).trim();

          const position =
            String(
              document.getElementById(
                "editUserPosition"
              )?.value || ""
            ).trim();

          const phone =
            String(
              document.getElementById(
                "editUserPhone"
              )?.value || ""
            ).trim();

          const id_local =
            String(
              document.getElementById(
                "editUserLocal"
              )?.value || ""
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

    if (!result.isConfirmed) {
      return;
    }

    const values =
      result.value;

    await ensureDeveloperPermission();

    const local =
      localsCache.find(
        item =>
          String(
            item.id_local
          ) ===
          String(
            values.id_local
          )
      );

    if (!local) {
      throw new Error(
        "El local seleccionado no existe."
      );
    }

    await db
      .collection(
        EMPLOYEE_COLLECTION
      )
      .doc(user.id)
      .update({
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
      });

    await Swal.fire(
      "Actualizado",
      "El usuario quedó actualizado.",
      "success"
    );
  } catch (error) {
    await showOperationError(
      error,
      "No se pudo actualizar el usuario."
    );
  }
}

/*
 * ============================================================
 * BLOQUEAR / DESBLOQUEAR USUARIO
 * ============================================================
 */

async function toggleUserBlock(
  userId
) {
  try {
    await ensureDeveloperPermission();

    const user =
      usersCache.find(
        item =>
          String(item.id) ===
          String(userId)
      );

    if (!user) {
      throw new Error(
        "No se encontró el usuario seleccionado."
      );
    }

    const nextBlocked =
      !(
        user.blocked ===
        true
      );

    const result =
      await Swal.fire({
        title:
          nextBlocked
            ? "Bloquear usuario"
            : "Desbloquear usuario",

        text:
          nextBlocked
            ? "El usuario no podrá entrar al sistema."
            : "El usuario podrá volver a entrar al sistema.",

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

    if (!result.isConfirmed) {
      return;
    }

    await ensureDeveloperPermission();

    await db
      .collection(
        EMPLOYEE_COLLECTION
      )
      .doc(user.id)
      .update({
        blocked:
          nextBlocked,

        active:
          !nextBlocked,

        updatedAt:
          firebase.firestore.FieldValue
            .serverTimestamp()
      });

    await Swal.fire(
      "Listo",
      nextBlocked
        ? "Usuario bloqueado."
        : "Usuario desbloqueado.",
      "success"
    );
  } catch (error) {
    await showOperationError(
      error,
      "No se pudo cambiar el estado del usuario."
    );
  }
}

/*
 * ============================================================
 * INICIO DEL MÓDULO
 * ============================================================
 */

async function bootDeveloper(
  user
) {
  /*
   * Aquí ocurre la migración automática si el perfil
   * existe con un ID antiguo.
   */
  await verifyDeveloperAccess(
    user
  );
}

document.addEventListener(
  "DOMContentLoaded",
  () => {
    if (globalSearch) {
      globalSearch.addEventListener(
        "input",
        renderAll
      );
    }

    if (localFilter) {
      localFilter.addEventListener(
        "change",
        syncSelectionFromFilter
      );
    }

    if (btnNewLocal) {
      btnNewLocal.addEventListener(
        "click",
        createLocal
      );
    }

    if (btnNewUser) {
      btnNewUser.addEventListener(
        "click",
        createUser
      );
    }

    if (btnRefresh) {
      btnRefresh.addEventListener(
        "click",
        renderAll
      );
    }

    auth.onAuthStateChanged(
      async user => {
        if (!user) {
          window.location.href =
            "index.html";

          return;
        }

        try {
          await bootDeveloper(
            user
          );
        } catch (error) {
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
          typeof renderNavigationForRole ===
          "function"
        ) {
          renderNavigationForRole(
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

        loadLocalsRealtime();
        loadUsersRealtime();
        loadAttemptsRealtime();

        renderAll();
      }
    );

    const logoutBtn =
      document.getElementById(
        "logoutButton"
      );

    if (logoutBtn) {
      logoutBtn.addEventListener(
        "click",
        () => {
          auth
            .signOut()
            .then(() => {
              localStorage.removeItem(
                "currentUser"
              );

              window.location.href =
                "index.html";
            });
        }
      );
    }

    const logoutBtnMobile =
      document.getElementById(
        "logoutButtonMobile"
      );

    if (logoutBtnMobile) {
      logoutBtnMobile.addEventListener(
        "click",
        () => {
          auth
            .signOut()
            .then(() => {
              localStorage.removeItem(
                "currentUser"
              );

              window.location.href =
                "index.html";
            });
        }
      );
    }

    window.addEventListener(
      "beforeunload",
      () => {
        stopListeners();
      }
    );
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