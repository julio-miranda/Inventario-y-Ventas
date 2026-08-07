const tableBody = document.querySelector("#employeesTable tbody");
const searchInput = document.getElementById("searchEmployee");
const newEmployeeBtn = document.getElementById("btnNewEmployee");
const greetingEls = document.querySelectorAll(".userGreeting");

let employees = [];
let currentRole = "";
let currentLocalId = "";
let currentLocalInfo = {
  id_local: "",
  nombre: "",
  numeroDocumento: "",
  ubicacion: ""
};

const POSITION_OPTIONS = [
  "Administrador",
  "Desarrollador",
  "Vendedor",
  "Cajero",
  "Bodega",
  "Asistencia"
];

const EMPLOYEE_COLLECTION = window.EMPLOYEE_COLLECTION_NAME || "empleados";
const LOCAL_COLLECTION = window.LOCAL_COLLECTION_NAME || "local";

const normalizeRoleLocal = (role = "") => String(role).trim().toLowerCase();

function isAdminRole(role = "") {
  const r = normalizeRoleLocal(role);
  return r === "administrador" || r === "admin";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildPositionOptions(selected = "") {
  return POSITION_OPTIONS.map(position => {
    const isSelected = position === selected ? "selected" : "";
    return `<option value="${escapeHtml(position)}" ${isSelected}>${escapeHtml(position)}</option>`;
  }).join("");
}

function renderGreeting(name = "Usuario", role = "") {
  greetingEls.forEach(el => {
    el.textContent = `Hola, ${name}${role ? ` (${role})` : ""}`;
  });
}

function getStoredCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("currentUser") || "null");
  } catch {
    return null;
  }
}

function setStoredCurrentUser(next) {
  try {
    localStorage.setItem("currentUser", JSON.stringify(next));
  } catch {
    // ignore
  }
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

function getCurrentLocalId() {
  const stored = getStoredCurrentUser();
  return String(
    stored?.id_local ||
    stored?.idLocal ||
    stored?.localId ||
    currentLocalId ||
    ""
  ).trim();
}

function getCurrentLocalInfo() {
  const stored = getStoredCurrentUser() || {};

  return {
    id_local: String(
      stored.id_local ||
      stored.idLocal ||
      stored.localId ||
      currentLocalInfo.id_local ||
      ""
    ).trim(),
    nombre: String(
      stored.localNombre ||
      stored.localName ||
      currentLocalInfo.nombre ||
      ""
    ).trim(),
    numeroDocumento: String(
      stored.localNumeroDocumento ||
      stored.localDocumentNumber ||
      currentLocalInfo.numeroDocumento ||
      ""
    ).trim(),
    ubicacion: String(
      stored.localUbicacion ||
      stored.localLocation ||
      currentLocalInfo.ubicacion ||
      ""
    ).trim()
  };
}

function matchesCurrentLocal(data = {}) {
  const target = getCurrentLocalId();
  if (!target) return false;

  const docLocalId = String(
    data.id_local ||
    data.idLocal ||
    data.localId ||
    data.idlocal ||
    ""
  ).trim();

  return docLocalId === target;
}

function filterByCurrentLocal(list = []) {
  return list.filter(emp => matchesCurrentLocal(emp));
}

function renderLocalWarning() {
  const hasLocal = Boolean(getCurrentLocalId());
  if (hasLocal) return;

  if (typeof Swal !== "undefined") {
    Swal.fire({
      icon: "warning",
      title: "Sin local asignado",
      text: "Este usuario no tiene id_local, por eso no se puede filtrar ni guardar empleados por local."
    });
  }
}

function renderEmployees(list) {
  tableBody.innerHTML = "";

  if (list.length === 0) {
    tableBody.innerHTML = "<tr><td colspan='5'>No hay empleados para este local</td></tr>";
    return;
  }

  list.forEach(emp => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${escapeHtml(emp.name || "")}</td>
      <td>${escapeHtml(emp.position || "")}</td>
      <td>${escapeHtml(emp.phone || "-")}</td>
      <td>${escapeHtml(emp.localNombre || getCurrentLocalInfo().nombre || "-")}</td>
      <td>
        <button onclick="editEmployee('${emp.id}')" class="btn-edit">Editar</button>
        ${isAdminRole(currentRole) ? `<button onclick="deleteEmployee('${emp.id}')" class="btn-delete">Eliminar</button>` : ""}
      </td>
    `;

    tableBody.appendChild(row);
  });
}

function renderFilteredEmployees() {
  const q = String(searchInput?.value || "").trim().toLowerCase();

  let filtered = [...employees];

  if (q) {
    filtered = filtered.filter(emp => {
      const name = String(emp.name || "").toLowerCase();
      const position = String(emp.position || "").toLowerCase();
      const phone = String(emp.phone || "").toLowerCase();
      const localName = String(emp.localNombre || "").toLowerCase();
      const localDoc = String(emp.localNumeroDocumento || "").toLowerCase();
      const localUbicacion = String(emp.localUbicacion || "").toLowerCase();

      return (
        name.includes(q) ||
        position.includes(q) ||
        phone.includes(q) ||
        localName.includes(q) ||
        localDoc.includes(q) ||
        localUbicacion.includes(q)
      );
    });
  }

  renderEmployees(filtered);
}

function loadEmployees() {
  const localId = getCurrentLocalId();

  if (!localId) {
    employees = [];
    renderEmployees([]);
    renderLocalWarning();
    return null;
  }

  return db.collection(EMPLOYEE_COLLECTION)
    .where("id_local", "==", localId)
    .onSnapshot(snapshot => {
      employees = [];

      snapshot.forEach(doc => {
        const data = doc.data() || {};
        employees.push({
          id: doc.id,
          ...data,
          localId: data.id_local || data.idLocal || data.localId || "",
          localNombre: data.localNombre || getCurrentLocalInfo().nombre || "",
          localNumeroDocumento: data.localNumeroDocumento || getCurrentLocalInfo().numeroDocumento || "",
          localUbicacion: data.localUbicacion || getCurrentLocalInfo().ubicacion || ""
        });
      });

      renderFilteredEmployees();
    }, err => {
      console.error("Error cargando empleados:", err);
      tableBody.innerHTML = "<tr><td colspan='5'>Error cargando empleados</td></tr>";
    });
}

function getCurrentUserRoleFromStored(storedUser, fallback = "") {
  if (!storedUser) return fallback;
  return storedUser.role || fallback;
}

// Protección de ruta
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    const storedUser = getStoredCurrentUser();

    let displayName = "";
    let role = "";
    let localId = "";
    let localNombre = "";
    let localNumeroDocumento = "";
    let localUbicacion = "";

    if (storedUser) {
      displayName = storedUser.name || "Usuario";
      role = storedUser.role || "";
      localId = String(storedUser.id_local || storedUser.idLocal || storedUser.localId || "").trim();
      localNombre = storedUser.localNombre || "";
      localNumeroDocumento = storedUser.localNumeroDocumento || "";
      localUbicacion = storedUser.localUbicacion || "";
      currentRole = role;
      currentLocalId = localId;
      currentLocalInfo = {
        id_local: localId,
        nombre: localNombre,
        numeroDocumento: localNumeroDocumento,
        ubicacion: localUbicacion
      };
    } else {
      const doc = await db.collection(EMPLOYEE_COLLECTION).doc(user.uid).get();

      if (doc.exists) {
        const data = doc.data() || {};

        displayName = data.name || "Usuario";
        role = data.position || "";
        localId = String(data.id_local || data.idLocal || data.localId || "").trim();
        currentRole = role;
        currentLocalId = localId;

        let localData = null;
        if (localId) {
          try {
            const localDoc = await db.collection(LOCAL_COLLECTION).doc(localId).get();
            if (localDoc.exists) {
              localData = localDoc.data() || {};
            }
          } catch {
            // ignore
          }
        }

        currentLocalInfo = {
          id_local: localId,
          nombre: localData?.nombre || localData?.name || data.localNombre || "",
          numeroDocumento: localData?.numeroDocumento || localData?.numero_documento || data.localNumeroDocumento || "",
          ubicacion: localData?.ubicacion || localData?.location || data.localUbicacion || ""
        };

        const currentUser = {
          uid: user.uid,
          name: displayName,
          email: user.email,
          phone: data.phone || "",
          role: role,
          id_local: localId,
          localNombre: currentLocalInfo.nombre || "",
          localNumeroDocumento: currentLocalInfo.numeroDocumento || "",
          localUbicacion: currentLocalInfo.ubicacion || ""
        };

        setStoredCurrentUser(currentUser);
      }
    }

    renderGreeting(displayName, role);

    if (typeof renderNavigationForRole === "function") {
      renderNavigationForRole(role);
    }

    renderLocalWarning();
  } catch (err) {
    console.error("Error leyendo usuario:", err);
  }

  loadEmployees();
});

// Logout extra por compatibilidad
const btnLogout = document.getElementById("logoutButton");
if (btnLogout) {
  btnLogout.addEventListener("click", () => {
    auth.signOut().then(() => {
      localStorage.removeItem("currentUser");
      window.location.href = "index.html";
    });
  });
}

async function createEmployeeInAuthAndFirestore(employee) {
  const authUser = await createAuthUserWithEmailPassword(employee.email, employee.password);
  const uid = authUser.localId;
  const localId = getCurrentLocalId();
  const localInfo = getCurrentLocalInfo();

  await db.collection(EMPLOYEE_COLLECTION).doc(uid).set({
    uid,
    name: employee.name,
    email: employee.email,
    position: employee.position,
    phone: employee.phone,
    id_local: localId || "",
    localNombre: localInfo.nombre || "",
    localNumeroDocumento: localInfo.numeroDocumento || "",
    localUbicacion: localInfo.ubicacion || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    authCreatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    active: true
  });

  return uid;
}

function buildCreateEmployeeHtml() {
  const localInfo = getCurrentLocalInfo();

  return `
    <div style="text-align:left; font-size:0.92rem; color:#374151; margin-bottom:10px;">
      <strong>Local actual:</strong> ${escapeHtml(localInfo.nombre || "—")}<br>
      <strong>Documento:</strong> ${escapeHtml(localInfo.numeroDocumento || "—")}<br>
      <strong>Ubicación:</strong> ${escapeHtml(localInfo.ubicacion || "—")}
    </div>
    <input id="name" class="swal2-input" placeholder="Nombre">
    <input id="email" class="swal2-input" placeholder="Correo electrónico" type="email">
    <input id="password" class="swal2-input" placeholder="Contraseña temporal" type="password">
    <input id="confirmPassword" class="swal2-input" placeholder="Confirmar contraseña" type="password">
    <select id="position" class="swal2-input" style="height:auto;padding:12px 10px;">
      <option value="">Seleccione una posición</option>
      ${buildPositionOptions("Vendedor")}
    </select>
    <input id="phone" class="swal2-input" placeholder="Teléfono">
    <div style="text-align:left; font-size:0.9rem; color:#6b7280; margin-top:6px;">
      El empleado se guardará con el mismo id_local del usuario autenticado.
    </div>
  `;
}

// Crear empleado
if (newEmployeeBtn) {
  newEmployeeBtn.onclick = async () => {
    if (!isAdminRole(currentRole)) {
      Swal.fire("No tienes permisos", "", "error");
      return;
    }

    if (!getCurrentLocalId()) {
      Swal.fire("Sin local asignado", "No se puede crear el empleado porque tu usuario no tiene id_local.", "error");
      return;
    }

    const result = await Swal.fire({
      title: "Nuevo empleado",
      html: buildCreateEmployeeHtml(),
      confirmButtonText: "Guardar",
      showCancelButton: true,
      cancelButtonText: "Cancelar",
      focusConfirm: false,
      preConfirm: () => {
        const name = document.getElementById("name").value.trim();
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;
        const position = document.getElementById("position").value.trim();
        const phone = document.getElementById("phone").value.trim();

        if (!name || !email || !password || !confirmPassword || !position) {
          Swal.showValidationMessage("Nombre, correo, contraseña y posición son obligatorios");
          return;
        }

        if (password.length < 6) {
          Swal.showValidationMessage("La contraseña debe tener al menos 6 caracteres");
          return;
        }

        if (password !== confirmPassword) {
          Swal.showValidationMessage("Las contraseñas no coinciden");
          return;
        }

        return { name, email, password, position, phone };
      }
    });

    if (!result.isConfirmed) return;

    const employee = result.value;

    try {
      const existsInFirestore = await db.collection(EMPLOYEE_COLLECTION)
        .where("email", "==", employee.email)
        .where("id_local", "==", getCurrentLocalId())
        .limit(1)
        .get();

      if (!existsInFirestore.empty) {
        Swal.fire("Validación", "Ya existe un empleado registrado con ese correo en este local.", "warning");
        return;
      }

      await createEmployeeInAuthAndFirestore(employee);

      Swal.fire("Empleado guardado", "La cuenta también fue creada en Authentication.", "success");
    } catch (err) {
      console.error("Error creando empleado:", err);
      Swal.fire("Error", err.message || "No se pudo crear el empleado.", "error");
    }
  };
}

// Eliminar empleado
function deleteEmployee(id) {
  if (!isAdminRole(currentRole)) {
    Swal.fire("No tienes permisos", "", "error");
    return;
  }

  Swal.fire({
    title: "Eliminar empleado",
    text: "Esta acción no se puede deshacer",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Eliminar"
  }).then(result => {
    if (result.isConfirmed) {
      db.collection(EMPLOYEE_COLLECTION)
        .doc(id)
        .delete()
        .then(() => {
          Swal.fire("Empleado eliminado", "", "success");
        })
        .catch(err => {
          Swal.fire("Error", err.message, "error");
        });
    }
  });
}

function editEmployee(id) {
  const employee = employees.find(emp => emp.id === id);
  if (!employee) return;

  Swal.fire({
    title: "Editar empleado",
    html: `
      <div style="text-align:left; font-size:0.92rem; color:#374151; margin-bottom:10px;">
        <strong>Local:</strong> ${escapeHtml(employee.localNombre || currentLocalInfo.nombre || "—")}<br>
        <strong>Documento:</strong> ${escapeHtml(employee.localNumeroDocumento || currentLocalInfo.numeroDocumento || "—")}<br>
        <strong>Ubicación:</strong> ${escapeHtml(employee.localUbicacion || currentLocalInfo.ubicacion || "—")}
      </div>
      <input id="editName" class="swal2-input" placeholder="Nombre" value="${escapeHtml(employee.name || "")}">
      <input id="editEmail" class="swal2-input" placeholder="Correo electrónico" value="${escapeHtml(employee.email || "")}" readonly>
      <select id="editPosition" class="swal2-input" style="height:auto;padding:12px 10px;">
        ${buildPositionOptions(employee.position || "")}
      </select>
      <input id="editPhone" class="swal2-input" placeholder="Teléfono" value="${escapeHtml(employee.phone || "")}">
      <div style="text-align:left; font-size:0.9rem; color:#6b7280; margin-top:6px;">
        El correo se mantiene fijo para no desincronizar Authentication.
      </div>
    `,
    confirmButtonText: "Actualizar",
    showCancelButton: true,
    cancelButtonText: "Cancelar",
    focusConfirm: false,
    preConfirm: () => {
      const name = document.getElementById("editName").value.trim();
      const email = document.getElementById("editEmail").value.trim();
      const position = document.getElementById("editPosition").value.trim();
      const phone = document.getElementById("editPhone").value.trim();

      if (!name || !position) {
        Swal.showValidationMessage("Nombre y posición son obligatorios");
        return;
      }

      return { name, email, position, phone };
    }
  }).then(result => {
    if (result.isConfirmed) {
      db.collection(EMPLOYEE_COLLECTION)
        .doc(id)
        .update({
          name: result.value.name,
          email: result.value.email,
          position: result.value.position,
          phone: result.value.phone,
          id_local: getCurrentLocalId(),
          localNombre: getCurrentLocalInfo().nombre || "",
          localNumeroDocumento: getCurrentLocalInfo().numeroDocumento || "",
          localUbicacion: getCurrentLocalInfo().ubicacion || ""
        })
        .then(() => {
          Swal.fire("Empleado actualizado", "", "success");
        })
        .catch(err => {
          Swal.fire("Error", err.message, "error");
        });
    }
  });
}

// Buscador
if (searchInput) {
  searchInput.addEventListener("input", renderFilteredEmployees);
}