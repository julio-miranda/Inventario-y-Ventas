// assets/js/app.js

if (typeof firebase === "undefined") {
  console.error("Firebase no se ha cargado correctamente.");
  if (typeof Swal !== "undefined") {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "Firebase no se cargó. Revisa la conexión o los scripts.",
    });
  }
} else {
  console.log("Firebase cargado exitosamente.");
}

const firebaseConfig = {
  apiKey: "AIzaSyAMsdmYEeH_zOQfXj55SURnp1Nkk8mhj4M",
  authDomain: "inventario-y-venta.firebaseapp.com",
  projectId: "inventario-y-venta",
  storageBucket: "inventario-y-venta.appspot.com",
  messagingSenderId: "220141957917",
  appId: "1:220141957917:web:1af57bde6709dffdf327f4",
  measurementId: "G-ELPGSV8ZLP"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  console.log("Firebase inicializado correctamente.");
}

const auth = firebase.auth();
const db = firebase.firestore();

const normalizeRole = (role = "") => String(role).trim().toLowerCase();

function getCanonicalRole(role = "") {
  const r = normalizeRole(role);

  switch (r) {
    case "admin":
    case "administrador":
      return "Administrador";
    case "vendedor":
      return "Vendedor";
    case "cajero":
      return "Cajero";
    case "bodega":
    case "inventario":
      return "Bodega";
    case "desarrollador":
    case "developer":
      return "Desarrollador";
    default:
      return "";
  }
}

const ROLE_NAV = {
  Administrador: [
    { label: "Inicio", href: "dashboard.html" },
    { label: "Inventario", href: "inventory.html" },
    { label: "Ventas", href: "sales.html" },
    { label: "Gastos", href: "gastos.html" },
    { label: "Empleados", href: "employees.html" }
  ],
  Cajero: [
    { label: "Inicio", href: "dashboard.html" },
    { label: "Ventas", href: "sales.html" },
    { label: "Gastos", href: "gastos.html" }
  ],
  Vendedor: [
    { label: "Inicio", href: "dashboard.html" },
    { label: "Inventario", href: "inventory.html" },
    { label: "Ventas", href: "sales.html" },
    { label: "Gastos", href: "gastos.html" }
  ],
  Bodega: [
    { label: "Inicio", href: "dashboard.html" },
    { label: "Inventario", href: "inventory.html" }
  ],
  Desarrollador: [
    { label: "Locales", href: "locales.html" }
  ]
};

const ROLE_DEFAULT_PAGE = {
  Administrador: "public/dashboard.html",
  Cajero: "public/sales.html",
  Vendedor: "public/sales.html",
  Bodega: "public/inventory.html",
  Desarrollador: "public/locales.html"
};

const ROLE_ALLOWED_PAGES = {
  Administrador: ["dashboard.html", "inventory.html", "sales.html", "gastos.html", "employees.html"],
  Cajero: ["dashboard.html", "sales.html", "gastos.html"],
  Vendedor: ["dashboard.html", "inventory.html", "sales.html", "gastos.html"],
  Bodega: ["dashboard.html", "inventory.html"],
  Desarrollador: ["locales.html"]
};

const EMPLOYEE_COLLECTION_NAME = "empleados";
const LOCAL_COLLECTION_NAME = "local";
const LOGIN_ATTEMPTS_COLLECTION_NAME = "login_attempts";

let currentLocalContext = {
  id_local: "",
  nombre: "",
  numeroDocumento: "",
  ubicacion: ""
};

function getCurrentPageFile() {
  const file = window.location.pathname.split("/").pop().toLowerCase();
  return file || "index.html";
}

function getNavByRole(role = "") {
  const canonical = getCanonicalRole(role);
  return ROLE_NAV[canonical] || [{ label: "Inicio", href: "dashboard.html" }];
}

function canAccessPage(role = "", pageFile = "") {
  const canonical = getCanonicalRole(role);
  const allowed = ROLE_ALLOWED_PAGES[canonical] || [];
  return allowed.includes(pageFile);
}

function getDefaultPageForRole(role = "") {
  const canonical = getCanonicalRole(role);
  return ROLE_DEFAULT_PAGE[canonical] || "dashboard.html";
}

function renderLinks(container, links, closeMenuAfterClick = false) {
  if (!container) return;

  container.innerHTML = links.map(link => `
    <li>
      <a href="${link.href}">${link.label}</a>
    </li>
  `).join("");

  if (closeMenuAfterClick) {
    container.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", () => {
        const fullscreenMenu = document.getElementById("fullscreenMenu");
        const menuToggle = document.getElementById("menuToggle");

        if (fullscreenMenu) fullscreenMenu.classList.remove("active");
        if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
        if (fullscreenMenu) fullscreenMenu.setAttribute("aria-hidden", "true");
      });
    });
  }
}

function renderNavigationForRole(role = "") {
  const links = getNavByRole(role);

  renderLinks(
    document.querySelector(".navbar-links ul"),
    links,
    false
  );

  renderLinks(
    document.querySelector(".menu-links"),
    links,
    true
  );
}

function setUserGreeting(name = "Usuario", role = "") {
  const greetingEls = document.querySelectorAll(".userGreeting");
  const roleText = role ? ` (${role})` : "";

  greetingEls.forEach(el => {
    el.textContent = `Hola, ${name}${roleText}`;
  });
}

function bindLogoutButtons() {
  const logoutButtons = [
    document.getElementById("logoutButton"),
    document.getElementById("logoutButtonMobile")
  ].filter(Boolean);

  logoutButtons.forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await auth.signOut();
      } finally {
        localStorage.removeItem("currentUser");
        window.location.href = "../index.html";
      }
    });
  });
}

function bindMobileMenu() {
  const menuToggle = document.getElementById("menuToggle");
  const fullscreenMenu = document.getElementById("fullscreenMenu");
  const closeMenu = document.getElementById("closeMenu");

  if (menuToggle && fullscreenMenu) {
    menuToggle.addEventListener("click", () => {
      fullscreenMenu.classList.add("active");
      menuToggle.setAttribute("aria-expanded", "true");
      fullscreenMenu.setAttribute("aria-hidden", "false");
    });
  }

  if (closeMenu && fullscreenMenu) {
    closeMenu.addEventListener("click", () => {
      fullscreenMenu.classList.remove("active");

      if (menuToggle) {
        menuToggle.setAttribute("aria-expanded", "false");
      }

      fullscreenMenu.setAttribute("aria-hidden", "true");
    });

    closeMenu.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        closeMenu.click();
      }
    });
  }
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

function patchStoredCurrentUser(patch = {}) {
  try {
    const current = getStoredCurrentUser() || {};

    setStoredCurrentUser({
      ...current,
      ...patch
    });
  } catch {
    // ignore
  }
}

function redirectAccordingToRole(role = "") {
  window.location.href = getDefaultPageForRole(role);
}

function getLocalDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function getTodayBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return {
    start: firebase.firestore.Timestamp.fromDate(start),
    end: firebase.firestore.Timestamp.fromDate(end),
    dayKey: getLocalDayKey(date)
  };
}

function getCurrentLocalId() {
  const stored = getStoredCurrentUser();

  return String(
    stored?.id_local ||
    stored?.idLocal ||
    stored?.localId ||
    currentLocalContext.id_local ||
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
      currentLocalContext.id_local ||
      ""
    ).trim(),

    nombre: String(
      stored.localNombre ||
      stored.localName ||
      currentLocalContext.nombre ||
      ""
    ).trim(),

    numeroDocumento: String(
      stored.localNumeroDocumento ||
      stored.localDocumentNumber ||
      currentLocalContext.numeroDocumento ||
      ""
    ).trim(),

    ubicacion: String(
      stored.localUbicacion ||
      stored.localLocation ||
      currentLocalContext.ubicacion ||
      ""
    ).trim()
  };
}

function matchesLocalContext(data = {}, localId = "") {
  const target = String(
    localId || getCurrentLocalId()
  ).trim();

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

async function loadLocalById(localId = "") {
  const target = String(localId).trim();

  if (!target) return null;

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
  } catch {
    // ignore
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
  } catch {
    // ignore
  }

  return null;
}

async function loadEmployeeByUser(user) {
  if (!user) return null;

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
  } catch {
    // ignore
  }

  try {
    const byEmail = await db
      .collection(EMPLOYEE_COLLECTION_NAME)
      .where("email", "==", user.email)
      .limit(1)
      .get();

    if (!byEmail.empty) {
      const doc = byEmail.docs[0];

      return {
        id: doc.id,
        ...(doc.data() || {})
      };
    }
  } catch {
    // ignore
  }

  return null;
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD"
  }).format(Number(value || 0));
}

async function getDailyFinancialSummary(
  date = new Date(),
  localId = getCurrentLocalId()
) {
  const { start, end } = getTodayBounds(date);
  const targetLocalId = String(localId || "").trim();

  const [salesSnap, expensesSnap] = await Promise.all([
    db.collection("ventas")
      .where("createdAt", ">=", start)
      .where("createdAt", "<=", end)
      .get(),

    db.collection("gastos")
      .where("createdAt", ">=", start)
      .where("createdAt", "<=", end)
      .get()
  ]);

  let sales = 0;
  let expenses = 0;

  salesSnap.forEach(doc => {
    const data = doc.data() || {};

    if (
      targetLocalId &&
      !matchesLocalContext(data, targetLocalId)
    ) {
      return;
    }

    sales += Number(data.total || 0);
  });

  expensesSnap.forEach(doc => {
    const data = doc.data() || {};

    if (
      targetLocalId &&
      !matchesLocalContext(data, targetLocalId)
    ) {
      return;
    }

    expenses += Number(data.amount || 0);
  });

  return {
    sales,
    expenses,
    net: sales - expenses
  };
}

async function recordLoginAttempt(payload = {}) {
  try {
    await db.collection(LOGIN_ATTEMPTS_COLLECTION_NAME).add({
      email: payload.email || "",
      uid: payload.uid || null,
      id_local: payload.id_local || "",
      localNombre: payload.localNombre || "",
      success: Boolean(payload.success),
      result: payload.success ? "exitoso" : "fallido",
      reason: payload.reason || "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch {
    // ignore
  }
}

async function updateEmployeeAccess(employeeId = "", patch = {}) {
  if (!employeeId) return;

  try {
    await db
      .collection(EMPLOYEE_COLLECTION_NAME)
      .doc(employeeId)
      .update({
        ...patch,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
  } catch {
    // ignore
  }
}

async function ensureCurrentUserContext(user) {
  if (!user) return null;

  const stored = getStoredCurrentUser();

  if (stored && stored.uid === user.uid) {
    currentLocalContext = {
      id_local: stored.id_local || "",
      nombre: stored.localNombre || "",
      numeroDocumento: stored.localNumeroDocumento || "",
      ubicacion: stored.localUbicacion || ""
    };

    return {
      uid: stored.uid || user.uid,
      name: stored.name || user.displayName || user.email || "Usuario",
      email: stored.email || user.email || "",
      phone: stored.phone || "",
      role: stored.role || "",
      id_local: stored.id_local || "",
      localNombre: stored.localNombre || "",
      localNumeroDocumento: stored.localNumeroDocumento || "",
      localUbicacion: stored.localUbicacion || "",
      employeeId: stored.employeeId || ""
    };
  }

  const employee = await loadEmployeeByUser(user);

  const role = getCanonicalRole(
    employee?.position ||
    employee?.role ||
    "Vendedor"
  );

  const name =
    employee?.name ||
    user.displayName ||
    user.email ||
    "Usuario";

  const id_local = String(
    employee?.id_local ||
    employee?.idLocal ||
    employee?.localId ||
    ""
  ).trim();

  let localInfo = {
    id_local,
    nombre: "",
    numeroDocumento: "",
    ubicacion: ""
  };

  if (id_local) {
    const localDoc = await loadLocalById(id_local);

    if (localDoc) {
      localInfo = {
        id_local,

        nombre: String(
          localDoc.nombre ||
          localDoc.name ||
          localDoc.localName ||
          ""
        ).trim(),

        numeroDocumento: String(
          localDoc.numeroDocumento ||
          localDoc.numero_documento ||
          localDoc.documentNumber ||
          localDoc.nDocumento ||
          ""
        ).trim(),

        ubicacion: String(
          localDoc.ubicacion ||
          localDoc.location ||
          localDoc.direccion ||
          localDoc.address ||
          ""
        ).trim()
      };
    }
  }

  currentLocalContext = {
    ...localInfo
  };

  setStoredCurrentUser({
    uid: user.uid,
    name,
    email: user.email || "",
    phone: employee?.phone || "",
    role,
    id_local,
    localNombre: localInfo.nombre || "",
    localNumeroDocumento: localInfo.numeroDocumento || "",
    localUbicacion: localInfo.ubicacion || ""
  });

  return {
    uid: user.uid,
    name,
    email: user.email || "",
    phone: employee?.phone || "",
    role,
    id_local,
    localNombre: localInfo.nombre || "",
    localNumeroDocumento: localInfo.numeroDocumento || "",
    localUbicacion: localInfo.ubicacion || "",
    employeeId: employee?.id || ""
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const btnLogin = document.getElementById("btnLogin");
  const btnText = document.getElementById("btnText");
  const btnSpinner = document.getElementById("btnSpinner");
  const errorElement = document.getElementById("error-message");
  const rememberCheckbox = document.getElementById("rememberMe");
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");

  const savedEmail = localStorage.getItem("savedEmail");

  if (savedEmail && document.getElementById("email")) {
    document.getElementById("email").value = savedEmail;

    if (rememberCheckbox) {
      rememberCheckbox.checked = true;
    }
  }

  function setLoading(isLoading) {
    if (!btnLogin) return;

    btnLogin.disabled = isLoading;

    btnLogin.setAttribute(
      "aria-busy",
      isLoading ? "true" : "false"
    );

    if (btnText) {
      btnText.textContent = isLoading
        ? "Validando..."
        : "Iniciar Sesión";
    }

    if (btnSpinner) {
      btnSpinner.style.display = isLoading
        ? "inline-block"
        : "none";
    }
  }

  function showError(msg) {
    if (errorElement) {
      errorElement.textContent = msg;
      errorElement.style.display = "block";
    }

    if (typeof Swal !== "undefined") {
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "error",
        title: msg,
        showConfirmButton: false,
        timer: 3000
      });
    }
  }

  function showSuccessToast(msg) {
    if (typeof Swal !== "undefined") {
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: msg,
        showConfirmButton: false,
        timer: 2500
      });
    }
  }

  function clearError() {
    if (errorElement) {
      errorElement.textContent = "";
      errorElement.style.display = "none";
    }
  }

  async function handlePasswordReset() {
    const currentEmail =
      document.getElementById("email")?.value.trim() || "";

    const result = await Swal.fire({
      title: "Recuperar contraseña",
      text: "Ingresa el correo asociado a tu cuenta para enviarte el enlace de recuperación.",
      input: "email",
      inputValue: currentEmail,
      inputPlaceholder: "ejemplo@correo.com",
      showCancelButton: true,
      confirmButtonText: "Enviar enlace",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#4CAF50",
      cancelButtonColor: "#6b7280",
      inputValidator: (value) => {
        if (!value || !value.trim()) {
          return "Debes ingresar un correo válido.";
        }
      }
    });

    if (!result.isConfirmed) return;

    const email = result.value.trim();

    try {
      await auth.sendPasswordResetEmail(email);

      Swal.fire({
        icon: "success",
        title: "Correo enviado",
        text: "Revisa tu bandeja de entrada y también la carpeta de spam.",
        confirmButtonColor: "#4CAF50"
      });
    } catch (error) {
      console.error("Error enviando recuperación:", error);

      let mensaje =
        "No se pudo enviar el correo de recuperación.";

      switch (error.code) {
        case "auth/invalid-email":
          mensaje = "El correo ingresado no es válido.";
          break;

        case "auth/user-not-found":
          mensaje =
            "No existe una cuenta registrada con ese correo.";
          break;

        case "auth/missing-android-pkg-name":
        case "auth/missing-continue-uri":
        case "auth/unauthorized-continue-uri":
          mensaje =
            "Revisa la configuración de dominios autorizados en Firebase.";
          break;

        default:
          mensaje = error.message || mensaje;
      }

      Swal.fire({
        icon: "error",
        title: "Error",
        text: mensaje,
        confirmButtonColor: "#4CAF50"
      });
    }
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearError();

      const email =
        document.getElementById("email")?.value.trim() || "";

      const password =
        document.getElementById("password")?.value || "";

      if (!email || !password) {
        showError("Por favor completa todos los campos.");
        return;
      }

      setLoading(true);

      try {
        const userCredential =
          await auth.signInWithEmailAndPassword(
            email,
            password
          );

        const user = userCredential.user;

        const employee = await loadEmployeeByUser(user);

        if (!employee) {
          await recordLoginAttempt({
            email,
            uid: user.uid,
            success: false,
            reason: "perfil_no_encontrado"
          });

          setLoading(false);
          showError(
            "El usuario no tiene perfil en la base de datos."
          );

          return;
        }

        const role = getCanonicalRole(
          employee.position ||
          employee.role ||
          "Vendedor"
        );

        const id_local = String(
          employee.id_local ||
          employee.idLocal ||
          employee.localId ||
          ""
        ).trim();

        let localNombre = "";
        let localNumeroDocumento = "";
        let localUbicacion = "";

        if (id_local) {
          const localDoc = await loadLocalById(id_local);

          if (localDoc) {
            localNombre = String(
              localDoc.nombre ||
              localDoc.name ||
              localDoc.localName ||
              ""
            ).trim();

            localNumeroDocumento = String(
              localDoc.numeroDocumento ||
              localDoc.numero_documento ||
              localDoc.documentNumber ||
              localDoc.nDocumento ||
              ""
            ).trim();

            localUbicacion = String(
              localDoc.ubicacion ||
              localDoc.location ||
              localDoc.direccion ||
              localDoc.address ||
              ""
            ).trim();
          }
        }

        if (
          employee.blocked === true ||
          employee.active === false
        ) {
          await recordLoginAttempt({
            email: employee.email || user.email || email,
            uid: user.uid,
            id_local,
            localNombre,
            success: false,
            reason: "usuario_bloqueado"
          });

          await updateEmployeeAccess(employee.id, {
            failedLoginAttempts:
              (Number(employee.failedLoginAttempts) || 0) + 1,

            lastFailedAt:
              firebase.firestore.FieldValue.serverTimestamp()
          });

          await auth.signOut();
          localStorage.removeItem("currentUser");

          setLoading(false);

          showError("Tu usuario está bloqueado.");
          return;
        }

        if (id_local) {
          const localDoc = await loadLocalById(id_local);

          if (
            localDoc &&
            (
              localDoc.bloqueado === true ||
              localDoc.blocked === true ||
              localDoc.activo === false ||
              localDoc.active === false
            )
          ) {
            await recordLoginAttempt({
              email: employee.email || user.email || email,
              uid: user.uid,
              id_local,
              localNombre,
              success: false,
              reason: "local_bloqueado"
            });

            await auth.signOut();
            localStorage.removeItem("currentUser");

            setLoading(false);

            showError("El local asignado está bloqueado.");
            return;
          }
        }

        const currentUser = {
          uid: user.uid,
          name: employee.name || "",
          email: employee.email || user.email,
          phone: employee.phone || "",
          role,
          id_local,
          localNombre,
          localNumeroDocumento,
          localUbicacion
        };

        setStoredCurrentUser(currentUser);

        currentLocalContext = {
          id_local,
          nombre: localNombre,
          numeroDocumento: localNumeroDocumento,
          ubicacion: localUbicacion
        };

        await updateEmployeeAccess(employee.id, {
          lastLoginAt:
            firebase.firestore.FieldValue.serverTimestamp(),

          lastAccessAt:
            firebase.firestore.FieldValue.serverTimestamp(),

          failedLoginAttempts: 0,
          lastFailedAt: null
        });

        await recordLoginAttempt({
          email: currentUser.email || email,
          uid: user.uid,
          id_local,
          localNombre,
          success: true,
          reason: "login_ok"
        });

        if (
          rememberCheckbox &&
          rememberCheckbox.checked
        ) {
          localStorage.setItem("savedEmail", email);
        } else {
          localStorage.removeItem("savedEmail");
        }

        showSuccessToast("Inicio de sesión correcto");

        setTimeout(() => {
          redirectAccordingToRole(currentUser.role);
        }, 800);

      } catch (error) {
        console.error("Error auth:", error);

        setLoading(false);

        let mensajeError =
          "Ocurrió un error inesperado.";

        switch (error.code) {
          case "auth/user-not-found":
            mensajeError =
              "El correo electrónico no está registrado.";
            break;

          case "auth/wrong-password":
            mensajeError =
              "La contraseña es incorrecta.";
            break;

          case "auth/invalid-email":
            mensajeError =
              "El formato del correo no es válido.";
            break;

          case "auth/user-disabled":
            mensajeError =
              "La cuenta ha sido deshabilitada.";
            break;

          default:
            mensajeError =
              error.message || mensajeError;
        }

        showError(mensajeError);
      }
    });
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener(
      "click",
      handlePasswordReset
    );
  }

  bindMobileMenu();
  bindLogoutButtons();

  auth.onAuthStateChanged(async (user) => {
    const currentPage = getCurrentPageFile();

    if (!user) {
      if (
        currentPage !== "index.html" &&
        currentPage !== "login.html"
      ) {
        window.location.href = "../index.html";
      }

      return;
    }

    let displayName = "Usuario";
    let role = "";

    try {
      const resolved =
        await ensureCurrentUserContext(user);

      if (resolved) {
        displayName =
          resolved.name || "Usuario";

        role =
          resolved.role || "";
      } else {
        const storedUser =
          getStoredCurrentUser();

        if (storedUser) {
          displayName =
            storedUser.name || "Usuario";

          role =
            getCanonicalRole(
              storedUser.role || ""
            );
        }
      }

      const roleForNav =
        getCanonicalRole(role);

      setUserGreeting(
        displayName,
        roleForNav
      );

      renderNavigationForRole(
        roleForNav
      );

      if (
        currentPage !== "index.html" &&
        currentPage !== "login.html"
      ) {
        if (
          !canAccessPage(
            roleForNav,
            currentPage
          )
        ) {
          window.location.href =
            getDefaultPageForRole(
              roleForNav
            );
        }
      }

    } catch (err) {
      console.error(
        "Error resolviendo contexto del usuario:",
        err
      );

      const storedUser =
        getStoredCurrentUser();

      if (storedUser) {
        displayName =
          storedUser.name || "Usuario";

        role =
          getCanonicalRole(
            storedUser.role || ""
          );
      }

      const roleForNav =
        getCanonicalRole(role);

      setUserGreeting(
        displayName,
        roleForNav
      );

      renderNavigationForRole(
        roleForNav
      );

      if (
        currentPage !== "index.html" &&
        currentPage !== "login.html"
      ) {
        if (
          !canAccessPage(
            roleForNav,
            currentPage
          )
        ) {
          window.location.href =
            getDefaultPageForRole(
              roleForNav
            );
        }
      }
    }
  });
});

window.auth = auth;
window.db = db;
window.normalizeRole = normalizeRole;
window.getCanonicalRole = getCanonicalRole;
window.renderNavigationForRole = renderNavigationForRole;
window.redirectAccordingToRole = redirectAccordingToRole;
window.getTodayBounds = getTodayBounds;
window.getDailyFinancialSummary = getDailyFinancialSummary;
window.getCurrentLocalId = getCurrentLocalId;
window.getCurrentLocalInfo = getCurrentLocalInfo;
window.matchesLocalContext = matchesLocalContext;
window.formatMoney = formatMoney;
window.getStoredCurrentUser = getStoredCurrentUser;
window.setStoredCurrentUser = setStoredCurrentUser;
window.patchStoredCurrentUser = patchStoredCurrentUser;
window.currentLocalContext = currentLocalContext;