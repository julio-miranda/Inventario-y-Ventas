// assets/js/locals.js
// Módulo exclusivo del rol Desarrollador.
// Funciones:
// - CRUD de locales
// - CRUD de usuarios por local
// - Bloqueo / desbloqueo
// - Visualización de intentos fallidos
// - Visualización de último acceso

const greetingEls = document.querySelectorAll(".userGreeting");

const localsTableBody = document.querySelector("#localsTable tbody");
const usersTableBody = document.querySelector("#localUsersTable tbody");
const attemptsTableBody = document.querySelector("#loginAttemptsTable tbody");

const localFilter = document.getElementById("localFilter");
const globalSearch = document.getElementById("globalSearch");

const btnNewLocal = document.getElementById("btnNewLocal");
const btnNewUser = document.getElementById("btnNewUser");
const btnRefresh = document.getElementById("btnRefresh");

const statLocals = document.getElementById("statLocals");
const statUsers = document.getElementById("statUsers");
const statBlocked = document.getElementById("statBlocked");
const statFailed = document.getElementById("statFailed");

const localCountLabel = document.getElementById("localCountLabel");
const userCountLabel = document.getElementById("userCountLabel");
const attemptCountLabel = document.getElementById("attemptCountLabel");
const selectedLocalCard = document.getElementById("selectedLocalCard");

const LOCAL_COLLECTION = "local";
const EMPLOYEE_COLLECTION = "empleados";
const ATTEMPTS_COLLECTION = "login_attempts";

const POSITION_OPTIONS = window.POSITION_OPTIONS || [
  "Administrador",
  "Desarrollador",
  "Vendedor",
  "Cajero",
  "Bodega",
  "Asistencia"
];

window.POSITION_OPTIONS = POSITION_OPTIONS;

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

function normalizeRoleLocal(role = "") {
  return String(role).trim().toLowerCase();
}

function isDeveloperRole(role = "") {
  const r = normalizeRoleLocal(role);
  return r === "desarrollador" || r === "developer";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function numberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = value.seconds ? new Date(value.seconds * 1000) : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES");
}

function formatDateOnly(value) {
  if (!value) return "—";
  const d = value.seconds ? new Date(value.seconds * 1000) : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES");
}

function formatTimeOnly(value) {
  if (!value) return "—";
  const d = value.seconds ? new Date(value.seconds * 1000) : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function getStoredCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("currentUser") || "null");
  } catch {
    return null;
  }
}

function setStoredCurrentUser(patch = {}) {
  try {
    const current = getStoredCurrentUser() || {};
    localStorage.setItem("currentUser", JSON.stringify({ ...current, ...patch }));
  } catch {
    // ignore
  }
}

function getLocalName(local = {}) {
  return String(local.nombre || local.name || local.localName || "").trim();
}

function getLocalDocumentNumber(local = {}) {
  return String(
    local.numeroDocumento ||
    local.numero_documento ||
    local.documentNumber ||
    local.nDocumento ||
    ""
  ).trim();
}

function getLocalUbicacion(local = {}) {
  return String(
    local.ubicacion ||
    local.location ||
    local.direccion ||
    local.address ||
    ""
  ).trim();
}

function getUserLocalId(user = {}) {
  return String(
    user.id_local ||
    user.idLocal ||
    user.localId ||
    ""
  ).trim();
}

function getUserLocalInfo(user = {}) {
  return {
    id_local: getUserLocalId(user),
    nombre: String(user.localNombre || "").trim(),
    numeroDocumento: String(user.localNumeroDocumento || "").trim(),
    ubicacion: String(user.localUbicacion || "").trim()
  };
}

function getSelectedLocal() {
  return localsCache.find(l => String(l.id_local) === String(selectedLocalId)) || null;
}

function getLocalUsers(localId = "") {
  const target = String(localId || "").trim();
  if (!target) return [...usersCache];
  return usersCache.filter(u => String(getUserLocalId(u)) === target);
}

function getLocalAttempts(localId = "") {
  const target = String(localId || "").trim();
  if (!target) return [...attemptsCache];

  return attemptsCache.filter(attempt => {
    const attemptLocal = String(attempt.id_local || attempt.localId || "").trim();
    if (attemptLocal && attemptLocal === target) return true;

    const byEmail = usersCache.find(u => String(u.email || "").trim().toLowerCase() === String(attempt.email || "").trim().toLowerCase());
    if (byEmail && String(getUserLocalId(byEmail)) === target) return true;

    return false;
  });
}

function getCurrentSearch() {
  return String(globalSearch?.value || "").toLowerCase().trim();
}

function matchesSearchLocal(local = {}) {
  const q = getCurrentSearch();
  if (!q) return true;

  const haystack = [
    getLocalName(local),
    getLocalDocumentNumber(local),
    getLocalUbicacion(local),
    local.id_local,
    local.blockReason,
    local.blockedReason
  ].join(" ").toLowerCase();

  return haystack.includes(q);
}

function matchesSearchUser(user = {}) {
  const q = getCurrentSearch();
  if (!q) return true;

  const localInfo = getUserLocalInfo(user);
  const haystack = [
    user.name,
    user.email,
    user.position,
    user.phone,
    localInfo.nombre,
    localInfo.numeroDocumento,
    localInfo.ubicacion,
    user.failedLoginAttempts,
    user.lastLoginAt,
    user.lastAccessAt,
    user.blockReason
  ].join(" ").toLowerCase();

  return haystack.includes(q);
}

function matchesSearchAttempt(attempt = {}) {
  const q = getCurrentSearch();
  if (!q) return true;

  const byEmailLocal = usersCache.find(u => String(u.email || "").trim().toLowerCase() === String(attempt.email || "").trim().toLowerCase());
  const localInfo = byEmailLocal ? getUserLocalInfo(byEmailLocal) : null;

  const haystack = [
    attempt.email,
    attempt.reason,
    attempt.message,
    attempt.result,
    attempt.status,
    attempt.id_local,
    attempt.localNombre,
    attempt.localNumeroDocumento,
    attempt.localUbicacion,
    localInfo?.nombre,
    localInfo?.numeroDocumento,
    localInfo?.ubicacion
  ].join(" ").toLowerCase();

  return haystack.includes(q);
}

function renderEmptyRow(tbody, colspan, text) {
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${colspan}">${escapeHtml(text)}</td></tr>`;
}

function renderSelectedLocalCard() {
  if (!selectedLocalCard) return;

  const local = getSelectedLocal();

  if (!local) {
    selectedLocalCard.innerHTML = `
      <p class="hero-subtitle" style="margin-top:0">
        <strong>Local seleccionado:</strong> Todos
      </p>
      <p class="hero-subtitle">
        Se muestran todos los locales y usuarios.
      </p>
    `;
    return;
  }

  selectedLocalCard.innerHTML = `
    <p class="hero-subtitle" style="margin-top:0">
      <strong>Local:</strong> ${escapeHtml(getLocalName(local) || "—")}<br>
      <strong>Número de documento:</strong> ${escapeHtml(getLocalDocumentNumber(local) || "—")}<br>
      <strong>Ubicación:</strong> ${escapeHtml(getLocalUbicacion(local) || "—")}<br>
      <strong>Estado:</strong> ${local.bloqueado ? "Bloqueado" : "Activo"}
    </p>
    <p class="hero-subtitle">
      Filtrando usuarios e intentos por este local.
    </p>
  `;
}

function updateSummary() {
  const totalLocals = localsCache.length;
  const visibleUsers = getLocalUsers(selectedLocalId).filter(matchesSearchUser);
  const visibleAttempts = getLocalAttempts(selectedLocalId).filter(matchesSearchAttempt);
  const blocked = visibleUsers.filter(u => u.blocked === true || u.active === false).length;
  const failed = visibleUsers.reduce((sum, u) => sum + numberOrZero(u.failedLoginAttempts), 0) +
    visibleAttempts.filter(a => a.success === false || String(a.result || "").toLowerCase() === "fallido").length;

  if (statLocals) statLocals.textContent = totalLocals;
  if (statUsers) statUsers.textContent = visibleUsers.length;
  if (statBlocked) statBlocked.textContent = blocked;
  if (statFailed) statFailed.textContent = failed;

  if (localCountLabel) localCountLabel.textContent = `${localsCache.filter(matchesSearchLocal).length} registros`;
  if (userCountLabel) userCountLabel.textContent = `${visibleUsers.length} registros`;
  if (attemptCountLabel) attemptCountLabel.textContent = `${visibleAttempts.length} registros`;
}

function renderLocalFilterOptions() {
  if (!localFilter) return;

  const current = String(localFilter.value || "");
  localFilter.innerHTML = `<option value="">Todos los locales</option>`;

  localsCache
    .slice()
    .sort((a, b) => String(getLocalName(a)).localeCompare(String(getLocalName(b))))
    .forEach(local => {
      const option = document.createElement("option");
      option.value = String(local.id_local || local.id || "");
      option.textContent = `${getLocalName(local)} — ${getLocalDocumentNumber(local) || "Sin documento"}`;
      localFilter.appendChild(option);
    });

  localFilter.value = current && localsCache.some(l => String(l.id_local || l.id) === current) ? current : "";
  selectedLocalId = localFilter.value || "";
}

function renderLocals() {
  if (!localsTableBody) return;

  const visible = localsCache.filter(matchesSearchLocal);

  if (!visible.length) {
    renderEmptyRow(localsTableBody, 7, "No hay locales registrados.");
    updateSummary();
    renderSelectedLocalCard();
    return;
  }

  localsTableBody.innerHTML = "";

  visible.forEach(local => {
    const usersCount = usersCache.filter(u => String(getUserLocalId(u)) === String(local.id_local)).length;
    const lastAccess = usersCache
      .filter(u => String(getUserLocalId(u)) === String(local.id_local))
      .map(u => u.lastLoginAt || u.lastAccessAt || null)
      .filter(Boolean)
      .sort((a, b) => {
        const da = a.seconds ? a.seconds * 1000 : new Date(a).getTime();
        const db = b.seconds ? b.seconds * 1000 : new Date(b).getTime();
        return db - da;
      })[0];

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(getLocalName(local) || "—")}</td>
      <td>${escapeHtml(getLocalDocumentNumber(local) || "—")}</td>
      <td>${escapeHtml(getLocalUbicacion(local) || "—")}</td>
      <td>${local.bloqueado ? "Bloqueado" : "Activo"}</td>
      <td>${usersCount}</td>
      <td>${escapeHtml(formatDateTime(lastAccess) || "—")}</td>
      <td>
        <button type="button" class="btn-outline" data-action="select-local" data-id="${escapeHtml(local.id_local)}">Ver usuarios</button>
        <button type="button" class="btn-edit" data-action="edit-local" data-id="${escapeHtml(local.id_local)}">Editar</button>
        <button type="button" class="btn-outline" data-action="toggle-local" data-id="${escapeHtml(local.id_local)}">
          ${local.bloqueado ? "Desbloquear" : "Bloquear"}
        </button>
        <button type="button" class="btn-delete" data-action="delete-local" data-id="${escapeHtml(local.id_local)}">Eliminar</button>
      </td>
    `;

    localsTableBody.appendChild(tr);
  });

  localsTableBody.querySelectorAll("button[data-action='select-local']").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedLocalId = String(btn.dataset.id || "");
      if (localFilter) localFilter.value = selectedLocalId;
      renderAll();
    });
  });

  localsTableBody.querySelectorAll("button[data-action='edit-local']").forEach(btn => {
    btn.addEventListener("click", () => editLocal(String(btn.dataset.id || "")));
  });

  localsTableBody.querySelectorAll("button[data-action='toggle-local']").forEach(btn => {
    btn.addEventListener("click", () => toggleLocalBlock(String(btn.dataset.id || "")));
  });

  localsTableBody.querySelectorAll("button[data-action='delete-local']").forEach(btn => {
    btn.addEventListener("click", () => deleteLocal(String(btn.dataset.id || "")));
  });

  updateSummary();
  renderSelectedLocalCard();
}

function renderUsers() {
  if (!usersTableBody) return;

  const visible = getLocalUsers(selectedLocalId).filter(matchesSearchUser);

  if (!visible.length) {
    renderEmptyRow(usersTableBody, 9, "No hay usuarios para este filtro.");
    updateSummary();
    return;
  }

  usersTableBody.innerHTML = "";

  visible
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .forEach(user => {
      const localInfo = getUserLocalInfo(user);
      const blocked = user.blocked === true;
      const active = user.active !== false && !blocked;
      const failedAttempts = numberOrZero(user.failedLoginAttempts);
      const lastAccess = user.lastLoginAt || user.lastAccessAt || null;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(user.name || "—")}</td>
        <td>${escapeHtml(user.email || "—")}</td>
        <td>${escapeHtml(user.position || "—")}</td>
        <td>${escapeHtml(user.phone || "—")}</td>
        <td>${escapeHtml(localInfo.nombre || "—")}</td>
        <td>${failedAttempts}</td>
        <td>${escapeHtml(formatDateTime(lastAccess) || "—")}</td>
        <td>${active ? "Activo" : "Bloqueado"}</td>
        <td>
          <button type="button" class="btn-edit" data-action="edit-user" data-id="${escapeHtml(user.id)}">Editar</button>
          <button type="button" class="btn-outline" data-action="toggle-user" data-id="${escapeHtml(user.id)}">
            ${active ? "Bloquear" : "Desbloquear"}
          </button>
        </td>
      `;

      usersTableBody.appendChild(tr);
    });

  usersTableBody.querySelectorAll("button[data-action='edit-user']").forEach(btn => {
    btn.addEventListener("click", () => editUser(String(btn.dataset.id || "")));
  });

  usersTableBody.querySelectorAll("button[data-action='toggle-user']").forEach(btn => {
    btn.addEventListener("click", () => toggleUserBlock(String(btn.dataset.id || "")));
  });

  updateSummary();
}

function renderAttempts() {
  if (!attemptsTableBody) return;

  const visible = getLocalAttempts(selectedLocalId).filter(matchesSearchAttempt);

  if (!visible.length) {
    renderEmptyRow(attemptsTableBody, 6, "No hay intentos fallidos para este filtro.");
    updateSummary();
    return;
  }

  attemptsTableBody.innerHTML = "";

  visible
    .sort((a, b) => {
      const da = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
      const db = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
      return db - da;
    })
    .forEach(attempt => {
      const byEmailLocal = usersCache.find(u => String(u.email || "").trim().toLowerCase() === String(attempt.email || "").trim().toLowerCase());
      const localInfo = byEmailLocal ? getUserLocalInfo(byEmailLocal) : {
        nombre: attempt.localNombre || "—",
        numeroDocumento: attempt.localNumeroDocumento || "",
        ubicacion: attempt.localUbicacion || ""
      };

      const result = attempt.success === false || String(attempt.result || "").toLowerCase() === "fallido"
        ? "Fallido"
        : "Correcto";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(attempt.email || "—")}</td>
        <td>${escapeHtml(localInfo.nombre || "—")}</td>
        <td>${escapeHtml(result)}</td>
        <td>${escapeHtml(attempt.reason || attempt.message || "—")}</td>
        <td>${escapeHtml(formatDateOnly(attempt.createdAt))}</td>
        <td>${escapeHtml(formatTimeOnly(attempt.createdAt))}</td>
      `;
      attemptsTableBody.appendChild(tr);
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
  selectedLocalId = String(localFilter?.value || "");
  renderAll();
}

function getAuthApiKey() {
  try {
    return firebase.app().options.apiKey;
  } catch {
    return null;
  }
}

function mapAuthRestError(errorMessage = "") {
  const message = String(errorMessage || "").toUpperCase();

  switch (message) {
    case "EMAIL_EXISTS":
      return "Ese correo ya está registrado en Authentication.";
    case "OPERATION_NOT_ALLOWED":
      return "El inicio de sesión con correo y contraseña no está habilitado en Firebase Authentication.";
    case "WEAK_PASSWORD : PASSWORD SHOULD BE AT LEAST 6 CHARACTERS":
    case "WEAK_PASSWORD":
      return "La contraseña debe tener al menos 6 caracteres.";
    case "INVALID_EMAIL":
      return "El correo ingresado no es válido.";
    default:
      return errorMessage || "No se pudo crear la cuenta en Authentication.";
  }
}

async function createAuthUserWithEmailPassword(email, password) {
  const apiKey = getAuthApiKey();

  if (!apiKey) {
    throw new Error("No se pudo leer la API key de Firebase.");
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data?.error?.message || "No se pudo crear la cuenta.";
    throw new Error(mapAuthRestError(errorMessage));
  }

  return data;
}

function stopListeners() {
  if (typeof unsubscribeLocals === "function") {
    unsubscribeLocals();
    unsubscribeLocals = null;
  }

  if (typeof unsubscribeUsers === "function") {
    unsubscribeUsers();
    unsubscribeUsers = null;
  }

  if (typeof unsubscribeAttempts === "function") {
    unsubscribeAttempts();
    unsubscribeAttempts = null;
  }
}

function loadLocalsRealtime() {
  if (unsubscribeLocals) unsubscribeLocals();

  unsubscribeLocals = db.collection(LOCAL_COLLECTION).onSnapshot(snapshot => {
    localsCache = [];
    snapshot.forEach(doc => {
      const data = doc.data() || {};
      localsCache.push({
        id_local: String(data.id_local || doc.id || "").trim(),
        id: doc.id,
        ...data,
        bloqueado: data.bloqueado === true || data.blocked === true,
        activo: data.activo !== false && data.active !== false
      });
    });

    renderAll();
  }, err => {
    console.error("Error cargando locales:", err);
    renderEmptyRow(localsTableBody, 7, "Error cargando locales");
  });
}

function loadUsersRealtime() {
  if (unsubscribeUsers) unsubscribeUsers();

  unsubscribeUsers = db.collection(EMPLOYEE_COLLECTION).onSnapshot(snapshot => {
    usersCache = [];
    snapshot.forEach(doc => {
      const data = doc.data() || {};
      usersCache.push({
        id: doc.id,
        ...data,
        blocked: data.blocked === true,
        active: data.active !== false && data.blocked !== true,
        failedLoginAttempts: numberOrZero(data.failedLoginAttempts),
        id_local: String(data.id_local || data.idLocal || data.localId || "").trim(),
        localNombre: data.localNombre || "",
        localNumeroDocumento: data.localNumeroDocumento || "",
        localUbicacion: data.localUbicacion || ""
      });
    });

    renderAll();
  }, err => {
    console.error("Error cargando usuarios:", err);
    renderEmptyRow(usersTableBody, 9, "Error cargando usuarios");
  });
}

function loadAttemptsRealtime() {
  if (unsubscribeAttempts) unsubscribeAttempts();

  unsubscribeAttempts = db.collection(ATTEMPTS_COLLECTION).onSnapshot(snapshot => {
    attemptsCache = [];
    snapshot.forEach(doc => {
      attemptsCache.push({
        id: doc.id,
        ...doc.data()
      });
    });

    renderAll();
  }, err => {
    console.error("Error cargando intentos:", err);
    renderEmptyRow(attemptsTableBody, 6, "Error cargando intentos");
  });
}

function buildLocalModalHtml(initial = {}) {
  return `
    <input id="localName" class="swal2-input" placeholder="Nombre del local" value="${escapeHtml(initial.nombre || "")}">
    <input id="localDocumentNumber" class="swal2-input" placeholder="Número de documento" value="${escapeHtml(initial.numeroDocumento || "")}">
    <input id="localLocation" class="swal2-input" placeholder="Ubicación" value="${escapeHtml(initial.ubicacion || "")}">
    <div style="text-align:left;font-size:0.9rem;color:#6b7280;margin-top:6px;">
      El ID del local se usa para relacionar usuarios. Se guarda como id_local.
    </div>
  `;
}

function readLocalModalValues() {
  return {
    nombre: String(document.getElementById("localName")?.value || "").trim(),
    numeroDocumento: String(document.getElementById("localDocumentNumber")?.value || "").trim(),
    ubicacion: String(document.getElementById("localLocation")?.value || "").trim()
  };
}

async function createLocal() {
  const result = await Swal.fire({
    title: "Nuevo local",
    html: buildLocalModalHtml(),
    confirmButtonText: "Guardar",
    showCancelButton: true,
    cancelButtonText: "Cancelar",
    focusConfirm: false,
    preConfirm: () => {
      const values = readLocalModalValues();
      if (!values.nombre) {
        Swal.showValidationMessage("El nombre del local es obligatorio.");
        return;
      }
      if (!values.numeroDocumento) {
        Swal.showValidationMessage("El número de documento es obligatorio.");
        return;
      }
      if (!values.ubicacion) {
        Swal.showValidationMessage("La ubicación es obligatoria.");
        return;
      }
      return values;
    }
  });

  if (!result.isConfirmed) return;

  const values = result.value;
  const ref = db.collection(LOCAL_COLLECTION).doc();

  await ref.set({
    id_local: ref.id,
    nombre: values.nombre,
    numeroDocumento: values.numeroDocumento,
    ubicacion: values.ubicacion,
    bloqueado: false,
    activo: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: currentUserInfo.uid || null
  });

  await Swal.fire("Local guardado", "El local fue creado correctamente.", "success");
}

async function editLocal(localId) {
  const local = localsCache.find(l => String(l.id_local) === String(localId));
  if (!local) return;

  const result = await Swal.fire({
    title: "Editar local",
    html: `
      <div style="text-align:left; margin-bottom:10px;">
        <div class="small">ID local: <span class="mono">${escapeHtml(local.id_local)}</span></div>
      </div>
      ${buildLocalModalHtml({
        nombre: getLocalName(local),
        numeroDocumento: getLocalDocumentNumber(local),
        ubicacion: getLocalUbicacion(local)
      })}
    `,
    confirmButtonText: "Actualizar",
    showCancelButton: true,
    cancelButtonText: "Cancelar",
    focusConfirm: false,
    preConfirm: () => {
      const values = readLocalModalValues();
      if (!values.nombre) {
        Swal.showValidationMessage("El nombre del local es obligatorio.");
        return;
      }
      if (!values.numeroDocumento) {
        Swal.showValidationMessage("El número de documento es obligatorio.");
        return;
      }
      if (!values.ubicacion) {
        Swal.showValidationMessage("La ubicación es obligatoria.");
        return;
      }
      return values;
    }
  });

  if (!result.isConfirmed) return;

  const values = result.value;
  const localRef = db.collection(LOCAL_COLLECTION).doc(String(local.id_local));

  const usersSnap = await db.collection(EMPLOYEE_COLLECTION)
    .where("id_local", "==", String(local.id_local))
    .get();

  const batch = db.batch();

  batch.update(localRef, {
    nombre: values.nombre,
    numeroDocumento: values.numeroDocumento,
    ubicacion: values.ubicacion,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  usersSnap.forEach(doc => {
    batch.update(doc.ref, {
      localNombre: values.nombre,
      localNumeroDocumento: values.numeroDocumento,
      localUbicacion: values.ubicacion,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });

  await batch.commit();
  await Swal.fire("Actualizado", "El local y sus usuarios quedaron sincronizados.", "success");
}

async function toggleLocalBlock(localId) {
  const local = localsCache.find(l => String(l.id_local) === String(localId));
  if (!local) return;

  const nextBlocked = !(local.bloqueado === true || local.blocked === true);

  const result = await Swal.fire({
    title: nextBlocked ? "Bloquear local" : "Desbloquear local",
    text: nextBlocked
      ? "Todos los usuarios de este local quedarán bloqueados."
      : "Todos los usuarios de este local quedarán habilitados.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: nextBlocked ? "Bloquear" : "Desbloquear",
    cancelButtonText: "Cancelar"
  });

  if (!result.isConfirmed) return;

  const localRef = db.collection(LOCAL_COLLECTION).doc(String(local.id_local));
  const usersSnap = await db.collection(EMPLOYEE_COLLECTION)
    .where("id_local", "==", String(local.id_local))
    .get();

  const batch = db.batch();

  batch.update(localRef, {
    bloqueado: nextBlocked,
    activo: !nextBlocked,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  usersSnap.forEach(doc => {
    batch.update(doc.ref, {
      blocked: nextBlocked,
      active: !nextBlocked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });

  await batch.commit();
  await Swal.fire("Listo", nextBlocked ? "Local bloqueado." : "Local desbloqueado.", "success");
}

async function deleteLocal(localId) {
  const local = localsCache.find(l => String(l.id_local) === String(localId));
  if (!local) return;

  const usersSnap = await db.collection(EMPLOYEE_COLLECTION)
    .where("id_local", "==", String(local.id_local))
    .get();

  if (!usersSnap.empty) {
    await Swal.fire(
      "No se puede eliminar",
      "Este local tiene usuarios asignados. Primero reubica o elimina esos usuarios.",
      "warning"
    );
    return;
  }

  const result = await Swal.fire({
    title: "Eliminar local",
    text: "Esta acción no se puede deshacer.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Eliminar",
    cancelButtonText: "Cancelar"
  });

  if (!result.isConfirmed) return;

  await db.collection(LOCAL_COLLECTION).doc(String(local.id_local)).delete();
  await Swal.fire("Eliminado", "El local fue eliminado.", "success");
}

function buildUserModalHtml(localOptions = "", initial = {}) {
  return `
    <input id="userName" class="swal2-input" placeholder="Nombre" value="${escapeHtml(initial.name || "")}">
    <input id="userEmail" class="swal2-input" placeholder="Correo electrónico" type="email" value="${escapeHtml(initial.email || "")}">
    <input id="userPassword" class="swal2-input" placeholder="Contraseña temporal" type="password" value="${escapeHtml(initial.password || "")}">
    <select id="userPosition" class="swal2-input" style="height:auto;padding:12px 10px;">
      <option value="">Seleccione posición</option>
      ${(Array.isArray(POSITION_OPTIONS) ? POSITION_OPTIONS : [])
        .map(pos => `<option value="${escapeHtml(pos)}" ${pos === initial.position ? "selected" : ""}>${escapeHtml(pos)}</option>`)
        .join("")}
    </select>
    <input id="userPhone" class="swal2-input" placeholder="Teléfono" value="${escapeHtml(initial.phone || "")}">
    <select id="userLocal" class="swal2-input" style="height:auto;padding:12px 10px;">
      <option value="">Seleccione local</option>
      ${localOptions}
    </select>
    <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:0.95rem;">
      <input id="userActive" type="checkbox" ${initial.active !== false ? "checked" : ""}>
      Usuario activo
    </label>
    <div style="text-align:left;font-size:0.9rem;color:#6b7280;margin-top:6px;">
      El usuario se crea en Authentication y luego se guarda en Firestore.
    </div>
  `;
}

function buildLocalOptions(selectedLocalId = "") {
  return localsCache
    .slice()
    .sort((a, b) => String(getLocalName(a)).localeCompare(String(getLocalName(b))))
    .map(local => `
      <option value="${escapeHtml(local.id_local)}" ${String(local.id_local) === String(selectedLocalId) ? "selected" : ""}>
        ${escapeHtml(getLocalName(local) || "Local")} — ${escapeHtml(getLocalDocumentNumber(local) || "Sin documento")}
      </option>
    `).join("");
}

function readUserModalValues() {
  return {
    name: String(document.getElementById("userName")?.value || "").trim(),
    email: String(document.getElementById("userEmail")?.value || "").trim(),
    password: String(document.getElementById("userPassword")?.value || "").trim(),
    position: String(document.getElementById("userPosition")?.value || "").trim(),
    phone: String(document.getElementById("userPhone")?.value || "").trim(),
    id_local: String(document.getElementById("userLocal")?.value || "").trim(),
    active: Boolean(document.getElementById("userActive")?.checked)
  };
}

async function createUser() {
  if (!localsCache.length) {
    await Swal.fire("Sin locales", "Primero crea un local.", "warning");
    return;
  }

  const result = await Swal.fire({
    title: "Nuevo usuario",
    html: buildUserModalHtml(buildLocalOptions(selectedLocalId)),
    confirmButtonText: "Guardar",
    showCancelButton: true,
    cancelButtonText: "Cancelar",
    focusConfirm: false,
    preConfirm: () => {
      const values = readUserModalValues();
      if (!values.name || !values.email || !values.password || !values.position || !values.id_local) {
        Swal.showValidationMessage("Nombre, correo, contraseña, posición y local son obligatorios.");
        return;
      }
      if (values.password.length < 6) {
        Swal.showValidationMessage("La contraseña debe tener al menos 6 caracteres.");
        return;
      }
      return values;
    }
  });

  if (!result.isConfirmed) return;

  const values = result.value;
  const local = localsCache.find(l => String(l.id_local) === String(values.id_local));

  if (!local) {
    await Swal.fire("Validación", "El local seleccionado no existe.", "warning");
    return;
  }

  const exists = await db.collection(EMPLOYEE_COLLECTION)
    .where("email", "==", values.email)
    .where("id_local", "==", values.id_local)
    .limit(1)
    .get();

  if (!exists.empty) {
    await Swal.fire("Validación", "Ya existe un usuario con ese correo en este local.", "warning");
    return;
  }

  const authUser = await createAuthUserWithEmailPassword(values.email, values.password);

  await db.collection(EMPLOYEE_COLLECTION).doc(authUser.localId).set({
    uid: authUser.localId,
    name: values.name,
    email: values.email,
    position: values.position,
    phone: values.phone,
    id_local: values.id_local,
    localNombre: getLocalName(local),
    localNumeroDocumento: getLocalDocumentNumber(local),
    localUbicacion: getLocalUbicacion(local),
    active: values.active,
    blocked: !values.active,
    failedLoginAttempts: 0,
    lastLoginAt: null,
    lastAccessAt: null,
    lastFailedAt: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: currentUserInfo.uid || null
  });

  await Swal.fire("Usuario creado", "La cuenta fue creada en Authentication y Firestore.", "success");
}

async function editUser(userId) {
  const user = usersCache.find(u => String(u.id) === String(userId));
  if (!user) return;

  const result = await Swal.fire({
    title: "Editar usuario",
    html: `
      <input id="editUserName" class="swal2-input" placeholder="Nombre" value="${escapeHtml(user.name || "")}">
      <input id="editUserEmail" class="swal2-input" placeholder="Correo" value="${escapeHtml(user.email || "")}" readonly>
      <select id="editUserPosition" class="swal2-input" style="height:auto;padding:12px 10px;">
        ${(Array.isArray(POSITION_OPTIONS) ? POSITION_OPTIONS : [])
          .map(pos => `<option value="${escapeHtml(pos)}" ${pos === user.position ? "selected" : ""}>${escapeHtml(pos)}</option>`)
          .join("")}
      </select>
      <input id="editUserPhone" class="swal2-input" placeholder="Teléfono" value="${escapeHtml(user.phone || "")}">
      <select id="editUserLocal" class="swal2-input" style="height:auto;padding:12px 10px;">
        ${buildLocalOptions(getUserLocalId(user))}
      </select>
      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:0.95rem;">
        <input id="editUserActive" type="checkbox" ${user.active !== false && !user.blocked ? "checked" : ""}>
        Usuario activo
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:0.95rem;">
        <input id="editUserBlocked" type="checkbox" ${user.blocked === true ? "checked" : ""}>
        Bloqueado
      </label>
    `,
    confirmButtonText: "Actualizar",
    showCancelButton: true,
    cancelButtonText: "Cancelar",
    focusConfirm: false,
    preConfirm: () => {
      const name = String(document.getElementById("editUserName")?.value || "").trim();
      const position = String(document.getElementById("editUserPosition")?.value || "").trim();
      const phone = String(document.getElementById("editUserPhone")?.value || "").trim();
      const id_local = String(document.getElementById("editUserLocal")?.value || "").trim();
      const active = Boolean(document.getElementById("editUserActive")?.checked);
      const blocked = Boolean(document.getElementById("editUserBlocked")?.checked);

      if (!name || !position || !id_local) {
        Swal.showValidationMessage("Nombre, posición y local son obligatorios.");
        return;
      }

      return { name, position, phone, id_local, active, blocked };
    }
  });

  if (!result.isConfirmed) return;

  const values = result.value;
  const local = localsCache.find(l => String(l.id_local) === String(values.id_local));

  await db.collection(EMPLOYEE_COLLECTION).doc(user.id).update({
    name: values.name,
    position: values.position,
    phone: values.phone,
    id_local: values.id_local,
    localNombre: getLocalName(local || {}),
    localNumeroDocumento: getLocalDocumentNumber(local || {}),
    localUbicacion: getLocalUbicacion(local || {}),
    active: values.blocked ? false : values.active,
    blocked: values.blocked,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  await Swal.fire("Actualizado", "El usuario quedó actualizado.", "success");
}

async function toggleUserBlock(userId) {
  const user = usersCache.find(u => String(u.id) === String(userId));
  if (!user) return;

  const nextBlocked = !(user.blocked === true);

  const result = await Swal.fire({
    title: nextBlocked ? "Bloquear usuario" : "Desbloquear usuario",
    text: nextBlocked ? "El usuario no podrá entrar al sistema." : "El usuario podrá volver a entrar al sistema.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: nextBlocked ? "Bloquear" : "Desbloquear",
    cancelButtonText: "Cancelar"
  });

  if (!result.isConfirmed) return;

  await db.collection(EMPLOYEE_COLLECTION).doc(user.id).update({
    blocked: nextBlocked,
    active: !nextBlocked,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  await Swal.fire("Listo", nextBlocked ? "Usuario bloqueado." : "Usuario desbloqueado.", "success");
}

async function bootDeveloper(user) {
  const stored = getStoredCurrentUser();

  if (stored && isDeveloperRole(stored.role || "")) {
    currentUserInfo.uid = stored.uid || user.uid;
    currentUserInfo.email = stored.email || user.email || "";
    currentUserInfo.name = stored.name || "Usuario";
    currentUserInfo.role = stored.role || "Desarrollador";
    return;
  }

  const doc = await db.collection(EMPLOYEE_COLLECTION).doc(user.uid).get();
  if (!doc.exists) {
    throw new Error("No se pudo cargar el perfil del usuario.");
  }

  const data = doc.data() || {};
  const role = String(data.position || data.role || "").trim();

  currentUserInfo = {
    uid: user.uid,
    email: user.email || "",
    name: data.name || "Usuario",
    role
  };

  setStoredCurrentUser({
    uid: user.uid,
    name: currentUserInfo.name,
    email: currentUserInfo.email,
    role
  });

  if (!isDeveloperRole(role)) {
    throw new Error("Acceso denegado. Este módulo es exclusivo para el rol Desarrollador.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (globalSearch) {
    globalSearch.addEventListener("input", renderAll);
  }

  if (localFilter) {
    localFilter.addEventListener("change", syncSelectionFromFilter);
  }

  if (btnNewLocal) {
    btnNewLocal.addEventListener("click", createLocal);
  }

  if (btnNewUser) {
    btnNewUser.addEventListener("click", createUser);
  }

  if (btnRefresh) {
    btnRefresh.addEventListener("click", renderAll);
  }

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }

    try {
      await bootDeveloper(user);
    } catch (err) {
      console.error(err);
      await Swal.fire({
        icon: "error",
        title: "Acceso denegado",
        text: err.message || "Este módulo es exclusivo para el rol Desarrollador."
      });
      window.location.href = "dashboard.html";
      return;
    }

    if (typeof renderNavigationForRole === "function") {
      renderNavigationForRole("Desarrollador");
    }

    const greetingText = `Hola, ${currentUserInfo.name} (Desarrollador)`;
    greetingEls.forEach(el => {
      el.textContent = greetingText;
    });

    loadLocalsRealtime();
    loadUsersRealtime();
    loadAttemptsRealtime();
    renderAll();
  });

  const logoutBtn = document.getElementById("logoutButton");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      auth.signOut().then(() => {
        localStorage.removeItem("currentUser");
        window.location.href = "index.html";
      });
    });
  }

  const logoutBtnMobile = document.getElementById("logoutButtonMobile");
  if (logoutBtnMobile) {
    logoutBtnMobile.addEventListener("click", () => {
      auth.signOut().then(() => {
        localStorage.removeItem("currentUser");
        window.location.href = "index.html";
      });
    });
  }

  window.addEventListener("beforeunload", () => {
    stopListeners();
  });
});

window.editLocal = editLocal;
window.deleteLocal = deleteLocal;
window.toggleLocalBlock = toggleLocalBlock;
window.editUser = editUser;
window.toggleUserBlock = toggleUserBlock;