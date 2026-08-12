// assets/js/app.js

if (typeof firebase === "undefined") {
  console.error(
    "Firebase no se ha cargado correctamente."
  );

  if (typeof Swal !== "undefined") {
    Swal.fire({
      icon: "error",
      title: "Error",
      text:
        "Firebase no se cargó. Revisa la conexión o los scripts."
    });
  }
} else {
  console.log(
    "Firebase cargado exitosamente."
  );
}

const firebaseConfig = {
  apiKey:
    "AIzaSyAMsdmYEeH_zOQfXj55SURnp1Nkk8mhj4M",

  authDomain:
    "inventario-y-venta.firebaseapp.com",

  projectId:
    "inventario-y-venta",

  storageBucket:
    "inventario-y-venta.appspot.com",

  messagingSenderId:
    "220141957917",

  appId:
    "1:220141957917:web:1af57bde6709dffdf327f4",

  measurementId:
    "G-ELPGSV8ZLP"
};

if (!firebase.apps.length) {
  firebase.initializeApp(
    firebaseConfig
  );

  console.log(
    "Firebase inicializado correctamente."
  );
}

const auth =
  firebase.auth();

const db =
  firebase.firestore();

/*
 * ============================================================
 * CONSTANTES
 * ============================================================
 */

const EMPLOYEE_COLLECTION_NAME =
  "empleados";

const LOCAL_COLLECTION_NAME =
  "local";

const LOGIN_ATTEMPTS_COLLECTION_NAME =
  "login_attempts";

/*
 * ============================================================
 * CACHE DE CONTEXTO
 * ============================================================
 *
 * Evita que varios módulos que cargan al mismo tiempo
 * hagan nuevamente las mismas consultas.
 */

let currentUserContextCache =
  null;

let currentUserContextPromise =
  null;

let currentUserContextUid =
  "";

/*
 * ============================================================
 * ROLES
 * ============================================================
 */

const normalizeRole = (
  role = ""
) =>
  String(role)
    .trim()
    .toLowerCase();

function getCanonicalRole(
  role = ""
) {
  const r =
    normalizeRole(
      role
    );

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
    {
      label: "Inicio",
      href: "dashboard.html"
    },

    {
      label: "Inventario",
      href: "inventory.html"
    },

    {
      label: "Ventas",
      href: "sales.html"
    },

    {
      label: "Gastos",
      href: "gastos.html"
    },

    {
      label: "Empleados",
      href: "employees.html"
    }
  ],

  Cajero: [
    {
      label: "Inicio",
      href: "dashboard.html"
    },

    {
      label: "Ventas",
      href: "sales.html"
    },

    {
      label: "Gastos",
      href: "gastos.html"
    }
  ],

  Vendedor: [
    {
      label: "Inicio",
      href: "dashboard.html"
    },

    {
      label: "Inventario",
      href: "inventory.html"
    },

    {
      label: "Ventas",
      href: "sales.html"
    },

    {
      label: "Gastos",
      href: "gastos.html"
    }
  ],

  Bodega: [
    {
      label: "Inicio",
      href: "dashboard.html"
    },

    {
      label: "Inventario",
      href: "inventory.html"
    }
  ],

  Desarrollador: [
    {
      label: "Locales",
      href: "locales.html"
    }
  ]
};

const ROLE_DEFAULT_PAGE = {
  Administrador:
    "public/dashboard.html",

  Cajero:
    "public/sales.html",

  Vendedor:
    "public/sales.html",

  Bodega:
    "public/inventory.html",

  Desarrollador:
    "public/locales.html"
};

const ROLE_ALLOWED_PAGES = {
  Administrador: [
    "dashboard.html",
    "inventory.html",
    "sales.html",
    "gastos.html",
    "employees.html"
  ],

  Cajero: [
    "dashboard.html",
    "sales.html",
    "gastos.html"
  ],

  Vendedor: [
    "dashboard.html",
    "inventory.html",
    "sales.html",
    "gastos.html"
  ],

  Bodega: [
    "dashboard.html",
    "inventory.html"
  ],

  Desarrollador: [
    "locales.html"
  ]
};

/*
 * ============================================================
 * CONTEXTO LOCAL
 * ============================================================
 */

let currentLocalContext = {
  id_local: "",
  nombre: "",
  numeroDocumento: "",
  ubicacion: "",
  contribuyente: "",
  tipoDocumento: "",
  nit: "",
  nrc: ""
};

/*
 * ============================================================
 * NAVEGACIÓN
 * ============================================================
 */

function getCurrentPageFile() {
  const file =
    window.location.pathname
      .split("/")
      .pop()
      .toLowerCase();

  return (
    file ||
    "index.html"
  );
}

function getNavByRole(
  role = ""
) {
  const canonical =
    getCanonicalRole(
      role
    );

  return (
    ROLE_NAV[
      canonical
    ] || [
      {
        label: "Inicio",
        href: "dashboard.html"
      }
    ]
  );
}

function canAccessPage(
  role = "",
  pageFile = ""
) {
  const canonical =
    getCanonicalRole(
      role
    );

  const allowed =
    ROLE_ALLOWED_PAGES[
      canonical
    ] || [];

  return allowed.includes(
    pageFile
  );
}

function getDefaultPageForRole(
  role = ""
) {
  const canonical =
    getCanonicalRole(
      role
    );

  return (
    ROLE_DEFAULT_PAGE[
      canonical
    ] ||
    "dashboard.html"
  );
}

function renderLinks(
  container,
  links,
  closeMenuAfterClick = false
) {
  if (!container) {
    return;
  }

  container.innerHTML =
    links
      .map(
        link => `
          <li>
            <a href="${link.href}">
              ${link.label}
            </a>
          </li>
        `
      )
      .join("");

  if (
    closeMenuAfterClick
  ) {
    container
      .querySelectorAll(
        "a"
      )
      .forEach(
        a => {
          a.addEventListener(
            "click",
            () => {
              const fullscreenMenu =
                document.getElementById(
                  "fullscreenMenu"
                );

              const menuToggle =
                document.getElementById(
                  "menuToggle"
                );

              if (
                fullscreenMenu
              ) {
                fullscreenMenu.classList.remove(
                  "active"
                );

                fullscreenMenu.setAttribute(
                  "aria-hidden",
                  "true"
                );
              }

              if (
                menuToggle
              ) {
                menuToggle.setAttribute(
                  "aria-expanded",
                  "false"
                );
              }
            }
          );
        }
      );
  }
}

function renderNavigationForRole(
  role = ""
) {
  const links =
    getNavByRole(
      role
    );

  renderLinks(
    document.querySelector(
      ".navbar-links ul"
    ),
    links,
    false
  );

  renderLinks(
    document.querySelector(
      ".menu-links"
    ),
    links,
    true
  );
}

function setUserGreeting(
  name = "Usuario",
  role = ""
) {
  const greetingEls =
    document.querySelectorAll(
      ".userGreeting"
    );

  const roleText =
    role
      ? ` (${role})`
      : "";

  greetingEls.forEach(
    el => {
      el.textContent =
        `Hola, ${name}${roleText}`;
    }
  );
}

function bindLogoutButtons() {
  const logoutButtons =
    [
      document.getElementById(
        "logoutButton"
      ),

      document.getElementById(
        "logoutButtonMobile"
      )
    ].filter(Boolean);

  logoutButtons.forEach(
    btn => {
      if (
        btn.dataset.appLogoutBound ===
        "1"
      ) {
        return;
      }

      btn.dataset.appLogoutBound =
        "1";

      btn.addEventListener(
        "click",
        async () => {
          try {
            await auth.signOut();
          } finally {
            localStorage.removeItem(
              "currentUser"
            );

            currentUserContextCache =
              null;

            currentUserContextPromise =
              null;

            currentUserContextUid =
              "";

            currentLocalContext = {
              id_local: "",
              nombre: "",
              numeroDocumento: "",
              ubicacion: "",
              contribuyente: "",
              tipoDocumento: "",
              nit: "",
              nrc: ""
            };

            window.location.href =
              "../index.html";
          }
        }
      );
    }
  );
}

function bindMobileMenu() {
  const menuToggle =
    document.getElementById(
      "menuToggle"
    );

  const fullscreenMenu =
    document.getElementById(
      "fullscreenMenu"
    );

  const closeMenu =
    document.getElementById(
      "closeMenu"
    );

  if (
    menuToggle &&
    fullscreenMenu &&
    menuToggle.dataset.appMenuBound !==
      "1"
  ) {
    menuToggle.dataset.appMenuBound =
      "1";

    menuToggle.addEventListener(
      "click",
      () => {
        fullscreenMenu.classList.add(
          "active"
        );

        menuToggle.setAttribute(
          "aria-expanded",
          "true"
        );

        fullscreenMenu.setAttribute(
          "aria-hidden",
          "false"
        );
      }
    );
  }

  if (
    closeMenu &&
    fullscreenMenu &&
    closeMenu.dataset.appCloseMenuBound !==
      "1"
  ) {
    closeMenu.dataset.appCloseMenuBound =
      "1";

    closeMenu.addEventListener(
      "click",
      () => {
        fullscreenMenu.classList.remove(
          "active"
        );

        if (
          menuToggle
        ) {
          menuToggle.setAttribute(
            "aria-expanded",
            "false"
          );
        }

        fullscreenMenu.setAttribute(
          "aria-hidden",
          "true"
        );
      }
    );

    closeMenu.addEventListener(
      "keydown",
      e => {
        if (
          e.key ===
            "Enter" ||
          e.key ===
            " "
        ) {
          e.preventDefault();

          closeMenu.click();
        }
      }
    );
  }
}

/*
 * ============================================================
 * STORAGE LOCAL
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
  next
) {
  try {
    localStorage.setItem(
      "currentUser",
      JSON.stringify(
        next
      )
    );
  } catch {
    // ignore
  }
}

function patchStoredCurrentUser(
  patch = {}
) {
  try {
    const current =
      getStoredCurrentUser() ||
      {};

    setStoredCurrentUser({
      ...current,
      ...patch
    });
  } catch {
    // ignore
  }
}

/*
 * ============================================================
 * NAVEGACIÓN POR ROL
 * ============================================================
 */

function redirectAccordingToRole(
  role = ""
) {
  window.location.href =
    getDefaultPageForRole(
      role
    );
}

/*
 * ============================================================
 * FECHAS
 * ============================================================
 */

function getLocalDayKey(
  date = new Date()
) {
  const y =
    date.getFullYear();

  const m =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const d =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${y}-${m}-${d}`;
}

function getTodayBounds(
  date = new Date()
) {
  const start =
    new Date(
      date
    );

  start.setHours(
    0,
    0,
    0,
    0
  );

  const end =
    new Date(
      date
    );

  end.setHours(
    23,
    59,
    59,
    999
  );

  return {
    start:
      firebase.firestore.Timestamp.fromDate(
        start
      ),

    end:
      firebase.firestore.Timestamp.fromDate(
        end
      ),

    dayKey:
      getLocalDayKey(
        date
      )
  };
}

/*
 * ============================================================
 * CONTEXTO LOCAL
 * ============================================================
 */

function getCurrentLocalId() {
  const stored =
    getStoredCurrentUser();

  return String(
    stored?.id_local ||
      stored?.idLocal ||
      stored?.localId ||
      currentLocalContext.id_local ||
      ""
  ).trim();
}

function getCurrentLocalInfo() {
  const stored =
    getStoredCurrentUser() ||
    {};

  return {
    id_local:
      String(
        stored.id_local ||
          stored.idLocal ||
          stored.localId ||
          currentLocalContext.id_local ||
          ""
      ).trim(),

    nombre:
      String(
        stored.localNombre ||
          stored.localName ||
          currentLocalContext.nombre ||
          ""
      ).trim(),

    numeroDocumento:
      String(
        stored.localNumeroDocumento ||
          stored.localDocumentNumber ||
          currentLocalContext.numeroDocumento ||
          ""
      ).trim(),

    ubicacion:
      String(
        stored.localUbicacion ||
          stored.localLocation ||
          currentLocalContext.ubicacion ||
          ""
      ).trim(),

    contribuyente:
      String(
        stored.localContribuyente ||
          stored.localNombreContribuyente ||
          currentLocalContext.contribuyente ||
          ""
      ).trim(),

    tipoDocumento:
      String(
        stored.localTipoDocumento ||
          stored.tipoDocumento ||
          currentLocalContext.tipoDocumento ||
          ""
      ).trim(),

    nit:
      String(
        stored.localNIT ||
          stored.nit ||
          currentLocalContext.nit ||
          ""
      ).trim(),

    nrc:
      String(
        stored.localNRC ||
          stored.nrc ||
          currentLocalContext.nrc ||
          ""
      ).trim()
  };
}

function matchesLocalContext(
  data = {},
  localId = ""
) {
  const target =
    String(
      localId ||
        getCurrentLocalId()
    ).trim();

  if (!target) {
    return false;
  }

  const docLocalId =
    String(
      data.id_local ||
        data.idLocal ||
        data.localId ||
        data.idlocal ||
        ""
    ).trim();

  return (
    docLocalId ===
    target
  );
}

/*
 * ============================================================
 * CARGAS DIRECTAS
 * ============================================================
 */

async function loadLocalById(
  localId = ""
) {
  const target =
    String(
      localId
    ).trim();

  if (!target) {
    return null;
  }

  /*
   * Primero se intenta por document ID.
   * En el diseño actual id_local coincide con doc.id.
   */
  try {
    const direct =
      await db
        .collection(
          LOCAL_COLLECTION_NAME
        )
        .doc(
          target
        )
        .get();

    if (
      direct.exists
    ) {
      return {
        id:
          direct.id,

        ...(direct.data() ||
          {})
      };
    }
  } catch (error) {
    console.warn(
      "No se pudo cargar el local por ID:",
      error
    );
  }

  /*
   * Compatibilidad con datos antiguos.
   */
  try {
    const byField =
      await db
        .collection(
          LOCAL_COLLECTION_NAME
        )
        .where(
          "id_local",
          "==",
          target
        )
        .limit(
          1
        )
        .get();

    if (
      !byField.empty
    ) {
      const doc =
        byField.docs[0];

      return {
        id:
          doc.id,

        ...(doc.data() ||
          {})
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

async function loadEmployeeByUser(
  user
) {
  if (!user) {
    return null;
  }

  /*
   * El diseño principal utiliza UID como ID
   * del documento empleado.
   */
  try {
    const direct =
      await db
        .collection(
          EMPLOYEE_COLLECTION_NAME
        )
        .doc(
          user.uid
        )
        .get();

    if (
      direct.exists
    ) {
      return {
        id:
          direct.id,

        ...(direct.data() ||
          {})
      };
    }
  } catch (error) {
    console.warn(
      "No se pudo cargar el empleado por UID:",
      error
    );
  }

  /*
   * Compatibilidad con perfiles antiguos.
   */
  if (
    user.email
  ) {
    try {
      const byEmail =
        await db
          .collection(
            EMPLOYEE_COLLECTION_NAME
          )
          .where(
            "email",
            "==",
            user.email
          )
          .limit(
            1
          )
          .get();

      if (
        !byEmail.empty
      ) {
        const doc =
          byEmail.docs[0];

        return {
          id:
            doc.id,

          ...(doc.data() ||
            {})
        };
      }
    } catch (error) {
      console.warn(
        "No se pudo cargar el empleado por correo:",
        error
      );
    }
  }

  return null;
}

/*
 * ============================================================
 * CONTEXTO UNIFICADO DEL USUARIO
 * ============================================================
 *
 * Esta es la función que deben reutilizar:
 *
 * employees.js
 * sales.js
 * dashboard.js
 * inventory.js
 * locales.js
 *
 * No deben volver a consultar empleados/{uid}
 * y local/{id_local} si solo necesitan el contexto.
 */

async function ensureCurrentUserContext(
  user,
  options = {}
) {
  if (!user) {
    return null;
  }

  const forceRefresh =
    options.forceRefresh ===
    true;

  /*
   * Si ya está resuelto para este UID,
   * reutilizarlo.
   */
  if (
    !forceRefresh &&
    currentUserContextCache &&
    currentUserContextUid ===
      user.uid
  ) {
    return (
      currentUserContextCache
    );
  }

  /*
   * Si una consulta idéntica ya está
   * en curso, esperar esa misma promesa.
   */
  if (
    !forceRefresh &&
    currentUserContextPromise &&
    currentUserContextUid ===
      user.uid
  ) {
    return (
      currentUserContextPromise
    );
  }

  currentUserContextUid =
    user.uid;

  currentUserContextPromise =
    (async () => {
      const stored =
        getStoredCurrentUser();

      let employee =
        null;

      /*
       * Si el storage coincide con el usuario,
       * se utiliza como primera fuente para reducir
       * consultas durante la navegación.
       *
       * IMPORTANTE:
       * para el primer acceso o cuando faltan datos,
       * se consulta Firestore.
       */
      if (
        stored &&
        stored.uid ===
          user.uid
      ) {
        employee = {
          id:
            stored.employeeId ||
            user.uid,

          uid:
            stored.uid,

          name:
            stored.name ||
            "",

          email:
            stored.email ||
            user.email ||
            "",

          phone:
            stored.phone ||
            "",

          position:
            stored.role ||
            "",

          id_local:
            stored.id_local ||
            stored.idLocal ||
            stored.localId ||
            "",

          localNombre:
            stored.localNombre ||
            "",

          localNumeroDocumento:
            stored.localNumeroDocumento ||
            "",

          localUbicacion:
            stored.localUbicacion ||
            "",

          localContribuyente:
            stored.localContribuyente ||
            stored.localNombreContribuyente ||
            "",

          localTipoDocumento:
            stored.localTipoDocumento ||
            "",

          localNIT:
            stored.localNIT ||
            "",

          localNRC:
            stored.localNRC ||
            "",

          active:
            stored.active !==
            false,

          blocked:
            stored.blocked ===
            true
        };
      }

      /*
       * Cuando el storage no tiene el contexto suficiente,
       * hacer una sola resolución en Firestore.
       */
      if (
        !employee ||
        !employee.id_local ||
        !employee.name ||
        !employee.position
      ) {
        const firestoreEmployee =
          await loadEmployeeByUser(
            user
          );

        if (
          firestoreEmployee
        ) {
          employee =
            firestoreEmployee;
        }
      }

      if (
        !employee
      ) {
        throw new Error(
          `No existe el documento de perfil para el usuario ${user.uid}.`
        );
      }

      const role =
        getCanonicalRole(
          employee.position ||
            employee.role ||
            ""
        );

      const name =
        employee.name ||
        user.displayName ||
        user.email ||
        "Usuario";

      const email =
        employee.email ||
        user.email ||
        "";

      const phone =
        employee.phone ||
        "";

      const id_local =
        String(
          employee.id_local ||
            employee.idLocal ||
            employee.localId ||
            stored?.id_local ||
            ""
        ).trim();

      let localInfo = {
        id_local,

        nombre:
          employee.localNombre ||
          stored?.localNombre ||
          "",

        numeroDocumento:
          employee.localNumeroDocumento ||
          stored?.localNumeroDocumento ||
          "",

        ubicacion:
          employee.localUbicacion ||
          stored?.localUbicacion ||
          "",

        contribuyente:
          employee.localNombreContribuyente ||
          employee.localContribuyente ||
          stored?.localNombreContribuyente ||
          stored?.localContribuyente ||
          "",

        tipoDocumento:
          employee.localTipoDocumento ||
          stored?.localTipoDocumento ||
          "",

        nit:
          employee.localNIT ||
          stored?.localNIT ||
          "",

        nrc:
          employee.localNRC ||
          stored?.localNRC ||
          ""
      };

      /*
       * Solo consultar el local cuando:
       * 1. existe id_local
       * 2. los datos principales faltan.
       *
       * Esto evita consultar local/{id} cada vez.
       */
      const needsLocalRead =
        Boolean(
          id_local
        ) &&
        (
          !localInfo.nombre ||
          !localInfo.numeroDocumento ||
          !localInfo.ubicacion ||
          !localInfo.tipoDocumento ||
          !localInfo.nit ||
          !localInfo.nrc
        );

      if (
        needsLocalRead
      ) {
        const localDoc =
          await loadLocalById(
            id_local
          );

        if (
          localDoc
        ) {
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
              ""
          };
        }
      }

      const context = {
        uid:
          user.uid,

        employeeId:
          employee.id ||
          employee.uid ||
          user.uid,

        name,

        email,

        phone,

        role,

        id_local,

        localNombre:
          String(
            localInfo.nombre ||
              ""
          ).trim(),

        localNumeroDocumento:
          String(
            localInfo.numeroDocumento ||
              ""
          ).trim(),

        localUbicacion:
          String(
            localInfo.ubicacion ||
              ""
          ).trim(),

        localContribuyente:
          String(
            localInfo.contribuyente ||
              ""
          ).trim(),

        localTipoDocumento:
          String(
            localInfo.tipoDocumento ||
              ""
          ).trim(),

        localNIT:
          String(
            localInfo.nit ||
              ""
          ).trim(),

        localNRC:
          String(
            localInfo.nrc ||
              ""
          ).trim()
      };

      currentLocalContext = {
        id_local:
          context.id_local,

        nombre:
          context.localNombre,

        numeroDocumento:
          context.localNumeroDocumento,

        ubicacion:
          context.localUbicacion,

        contribuyente:
          context.localContribuyente,

        tipoDocumento:
          context.localTipoDocumento,

        nit:
          context.localNIT,

        nrc:
          context.localNRC
      };

      currentUserContextCache =
        context;

      /*
       * Solo guardar contexto. No se vuelve a escribir
       * Firestore aquí.
       */
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

  try {
    return await currentUserContextPromise;
  } finally {
    /*
     * La caché queda disponible.
     * Solo se libera la referencia a la promesa
     * para que futuras llamadas utilicen la caché.
     */
    currentUserContextPromise =
      null;
  }
}

async function getCurrentUserContext(
  user = auth.currentUser
) {
  if (!user) {
    return null;
  }

  return ensureCurrentUserContext(
    user
  );
}

/*
 * ============================================================
 * FINANZAS
 * ============================================================
 */

function formatMoney(
  value
) {
  return new Intl.NumberFormat(
    "es-ES",
    {
      style:
        "currency",

      currency:
        "USD"
    }
  ).format(
    Number(
      value ||
        0
    )
  );
}

async function getDailyFinancialSummary(
  date = new Date(),
  localId = getCurrentLocalId()
) {
  const {
    start,
    end
  } =
    getTodayBounds(
      date
    );

  const targetLocalId =
    String(
      localId ||
        ""
    ).trim();

  const [
    salesSnap,
    expensesSnap
  ] =
    await Promise.all([
      db
        .collection(
          "ventas"
        )
        .where(
          "createdAt",
          ">=",
          start
        )
        .where(
          "createdAt",
          "<=",
          end
        )
        .get(),

      db
        .collection(
          "gastos"
        )
        .where(
          "createdAt",
          ">=",
          start
        )
        .where(
          "createdAt",
          "<=",
          end
        )
        .get()
    ]);

  let sales =
    0;

  let expenses =
    0;

  salesSnap.forEach(
    doc => {
      const data =
        doc.data() ||
        {};

      if (
        targetLocalId &&
        !matchesLocalContext(
          data,
          targetLocalId
        )
      ) {
        return;
      }

      sales +=
        Number(
          data.total ||
            0
        );
    }
  );

  expensesSnap.forEach(
    doc => {
      const data =
        doc.data() ||
        {};

      if (
        targetLocalId &&
        !matchesLocalContext(
          data,
          targetLocalId
        )
      ) {
        return;
      }

      expenses +=
        Number(
          data.amount ||
            0
        );
    }
  );

  return {
    sales,

    expenses,

    net:
      sales -
      expenses
  };
}

/*
 * ============================================================
 * LOGIN
 * ============================================================
 */

async function recordLoginAttempt(
  payload = {}
) {
  try {
    await db
      .collection(
        LOGIN_ATTEMPTS_COLLECTION_NAME
      )
      .add({
        email:
          payload.email ||
          "",

        uid:
          payload.uid ||
          null,

        id_local:
          payload.id_local ||
          "",

        localNombre:
          payload.localNombre ||
          "",

        success:
          Boolean(
            payload.success
          ),

        result:
          payload.success
            ? "exitoso"
            : "fallido",

        reason:
          payload.reason ||
          "",

        createdAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp()
      });
  } catch (error) {
    console.error(
      "No se pudo registrar el intento de acceso:",
      error
    );
  }
}

async function updateEmployeeAccess(
  employeeId = "",
  patch = {}
) {
  if (!employeeId) {
    return;
  }

  try {
    await db
      .collection(
        EMPLOYEE_COLLECTION_NAME
      )
      .doc(
        employeeId
      )
      .update({
        ...patch,

        updatedAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp()
      });
  } catch (error) {
    console.error(
      "No se pudo actualizar el acceso del empleado:",
      error
    );
  }
}

/*
 * ============================================================
 * PASSWORD RESET / LOGIN UI
 * ============================================================
 */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    const loginForm =
      document.getElementById(
        "loginForm"
      );

    const btnLogin =
      document.getElementById(
        "btnLogin"
      );

    const btnText =
      document.getElementById(
        "btnText"
      );

    const btnSpinner =
      document.getElementById(
        "btnSpinner"
      );

    const errorElement =
      document.getElementById(
        "error-message"
      );

    const rememberCheckbox =
      document.getElementById(
        "rememberMe"
      );

    const forgotPasswordLink =
      document.getElementById(
        "forgotPasswordLink"
      );

    const savedEmail =
      localStorage.getItem(
        "savedEmail"
      );

    if (
      savedEmail &&
      document.getElementById(
        "email"
      )
    ) {
      document.getElementById(
        "email"
      ).value =
        savedEmail;

      if (
        rememberCheckbox
      ) {
        rememberCheckbox.checked =
          true;
      }
    }

    function setLoading(
      isLoading
    ) {
      if (!btnLogin) {
        return;
      }

      btnLogin.disabled =
        isLoading;

      btnLogin.setAttribute(
        "aria-busy",
        isLoading
          ? "true"
          : "false"
      );

      if (
        btnText
      ) {
        btnText.textContent =
          isLoading
            ? "Validando..."
            : "Iniciar Sesión";
      }

      if (
        btnSpinner
      ) {
        btnSpinner.style.display =
          isLoading
            ? "inline-block"
            : "none";
      }
    }

    function showError(
      msg
    ) {
      if (
        errorElement
      ) {
        errorElement.textContent =
          msg;

        errorElement.style.display =
          "block";
      }

      if (
        typeof Swal !==
        "undefined"
      ) {
        Swal.fire({
          toast:
            true,

          position:
            "top-end",

          icon:
            "error",

          title:
            msg,

          showConfirmButton:
            false,

          timer:
            3000
        });
      }
    }

    function showSuccessToast(
      msg
    ) {
      if (
        typeof Swal !==
        "undefined"
      ) {
        Swal.fire({
          toast:
            true,

          position:
            "top-end",

          icon:
            "success",

          title:
            msg,

          showConfirmButton:
            false,

          timer:
            2500
        });
      }
    }

    function clearError() {
      if (
        errorElement
      ) {
        errorElement.textContent =
          "";

        errorElement.style.display =
          "none";
      }
    }

    async function handlePasswordReset() {
      const currentEmail =
        document
          .getElementById(
            "email"
          )
          ?.value
          .trim() ||
        "";

      const result =
        await Swal.fire({
          title:
            "Recuperar contraseña",

          text:
            "Ingresa el correo asociado a tu cuenta para enviarte el enlace de recuperación.",

          input:
            "email",

          inputValue:
            currentEmail,

          inputPlaceholder:
            "ejemplo@correo.com",

          showCancelButton:
            true,

          confirmButtonText:
            "Enviar enlace",

          cancelButtonText:
            "Cancelar",

          confirmButtonColor:
            "#4CAF50",

          cancelButtonColor:
            "#6b7280",

          inputValidator:
            value => {
              if (
                !value ||
                !value.trim()
              ) {
                return "Debes ingresar un correo válido.";
              }

              return undefined;
            }
        });

      if (
        !result.isConfirmed
      ) {
        return;
      }

      const email =
        result.value
          .trim();

      try {
        await auth.sendPasswordResetEmail(
          email
        );

        Swal.fire({
          icon:
            "success",

          title:
            "Correo enviado",

          text:
            "Revisa tu bandeja de entrada y también la carpeta de spam.",

          confirmButtonColor:
            "#4CAF50"
        });
      } catch (error) {
        console.error(
          "Error enviando recuperación:",
          error
        );

        let mensaje =
          "No se pudo enviar el correo de recuperación.";

        switch (
          error.code
        ) {
          case "auth/invalid-email":
            mensaje =
              "El correo ingresado no es válido.";
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
            mensaje =
              error.message ||
              mensaje;
        }

        Swal.fire({
          icon:
            "error",

          title:
            "Error",

          text:
            mensaje,

          confirmButtonColor:
            "#4CAF50"
        });
      }
    }

    /*
     * ========================================================
     * LOGIN
     * ========================================================
     */

    if (
      loginForm
    ) {
      loginForm.addEventListener(
        "submit",
        async e => {
          e.preventDefault();

          clearError();

          const email =
            document
              .getElementById(
                "email"
              )
              ?.value
              .trim() ||
            "";

          const password =
            document
              .getElementById(
                "password"
              )
              ?.value ||
            "";

          if (
            !email ||
            !password
          ) {
            showError(
              "Por favor completa todos los campos."
            );

            return;
          }

          setLoading(
            true
          );

          try {
            const userCredential =
              await auth.signInWithEmailAndPassword(
                email,
                password
              );

            const user =
              userCredential.user;

            /*
             * Una única resolución del contexto.
             */
            const context =
              await ensureCurrentUserContext(
                user,
                {
                  forceRefresh:
                    true
                }
              );

            const employee =
              await loadEmployeeByUser(
                user
              );

            /*
             * Si el contexto existe pero el perfil
             * no pudo resolverse, se considera error.
             */
            if (
              !employee &&
              !context
            ) {
              await recordLoginAttempt({
                email,

                uid:
                  user.uid,

                success:
                  false,

                reason:
                  "perfil_no_encontrado"
              });

              setLoading(
                false
              );

              showError(
                "El usuario no tiene perfil en la base de datos."
              );

              return;
            }

            const effectiveEmployee =
              employee || {
                id:
                  context.employeeId,

                uid:
                  context.uid,

                name:
                  context.name,

                email:
                  context.email,

                phone:
                  context.phone,

                position:
                  context.role,

                id_local:
                  context.id_local,

                localNombre:
                  context.localNombre,

                localNumeroDocumento:
                  context.localNumeroDocumento,

                localUbicacion:
                  context.localUbicacion,

                localNombreContribuyente:
                  context.localContribuyente,

                localTipoDocumento:
                  context.localTipoDocumento,

                localNIT:
                  context.localNIT,

                localNRC:
                  context.localNRC,

                active:
                  context.active !==
                  false,

                blocked:
                  context.blocked ===
                  true
              };

            const role =
              getCanonicalRole(
                effectiveEmployee.position ||
                  effectiveEmployee.role ||
                  "Vendedor"
              );

            const id_local =
              String(
                effectiveEmployee.id_local ||
                  effectiveEmployee.idLocal ||
                  effectiveEmployee.localId ||
                  context.id_local ||
                  ""
              ).trim();

            /*
             * El local ya está en el contexto.
             * No se consulta nuevamente aquí.
             */
            const localNombre =
              context.localNombre ||
              effectiveEmployee.localNombre ||
              "";

            if (
              effectiveEmployee.blocked ===
                true ||
              effectiveEmployee.active ===
                false
            ) {
              await recordLoginAttempt({
                email:
                  effectiveEmployee.email ||
                  user.email ||
                  email,

                uid:
                  user.uid,

                id_local,

                localNombre,

                success:
                  false,

                reason:
                  "usuario_bloqueado"
              });

              await updateEmployeeAccess(
                effectiveEmployee.id ||
                  user.uid,
                {
                  failedLoginAttempts:
                    (
                      Number(
                        effectiveEmployee.failedLoginAttempts
                      ) ||
                      0
                    ) +
                    1,

                  lastFailedAt:
                    firebase.firestore
                      .FieldValue
                      .serverTimestamp()
                }
              );

              await auth.signOut();

              localStorage.removeItem(
                "currentUser"
              );

              currentUserContextCache =
                null;

              currentUserContextPromise =
                null;

              currentUserContextUid =
                "";

              setLoading(
                false
              );

              showError(
                "Tu usuario está bloqueado."
              );

              return;
            }

            /*
             * El estado del local ya está disponible
             * en el contexto.
             */
            const localBlocked =
              Boolean(
                effectiveEmployee.localBlocked
              ) ||
              false;

            if (
              localBlocked
            ) {
              await recordLoginAttempt({
                email:
                  effectiveEmployee.email ||
                  user.email ||
                  email,

                uid:
                  user.uid,

                id_local,

                localNombre,

                success:
                  false,

                reason:
                  "local_bloqueado"
              });

              await auth.signOut();

              localStorage.removeItem(
                "currentUser"
              );

              currentUserContextCache =
                null;

              currentUserContextPromise =
                null;

              currentUserContextUid =
                "";

              setLoading(
                false
              );

              showError(
                "El local asignado está bloqueado."
              );

              return;
            }

            const currentUser = {
              uid:
                user.uid,

              employeeId:
                effectiveEmployee.id ||
                user.uid,

              name:
                effectiveEmployee.name ||
                context.name ||
                "",

              email:
                effectiveEmployee.email ||
                user.email ||
                "",

              phone:
                effectiveEmployee.phone ||
                context.phone ||
                "",

              role,

              id_local,

              localNombre:
                context.localNombre ||
                effectiveEmployee.localNombre ||
                "",

              localNumeroDocumento:
                context.localNumeroDocumento ||
                effectiveEmployee.localNumeroDocumento ||
                "",

              localUbicacion:
                context.localUbicacion ||
                effectiveEmployee.localUbicacion ||
                "",

              localContribuyente:
                context.localContribuyente ||
                effectiveEmployee.localNombreContribuyente ||
                effectiveEmployee.localContribuyente ||
                "",

              localTipoDocumento:
                context.localTipoDocumento ||
                effectiveEmployee.localTipoDocumento ||
                "",

              localNIT:
                context.localNIT ||
                effectiveEmployee.localNIT ||
                "",

              localNRC:
                context.localNRC ||
                effectiveEmployee.localNRC ||
                ""
            };

            setStoredCurrentUser(
              currentUser
            );

            currentLocalContext = {
              id_local,

              nombre:
                currentUser.localNombre,

              numeroDocumento:
                currentUser.localNumeroDocumento,

              ubicacion:
                currentUser.localUbicacion,

              contribuyente:
                currentUser.localContribuyente,

              tipoDocumento:
                currentUser.localTipoDocumento,

              nit:
                currentUser.localNIT,

              nrc:
                currentUser.localNRC
            };

            currentUserContextCache =
              {
                ...currentUser
              };

            currentUserContextUid =
              user.uid;

            await updateEmployeeAccess(
              effectiveEmployee.id ||
                user.uid,
              {
                lastLoginAt:
                  firebase.firestore
                    .FieldValue
                    .serverTimestamp(),

                lastAccessAt:
                  firebase.firestore
                    .FieldValue
                    .serverTimestamp(),

                failedLoginAttempts:
                  0,

                lastFailedAt:
                  null
              }
            );

            await recordLoginAttempt({
              email:
                currentUser.email ||
                email,

              uid:
                user.uid,

              id_local,

              localNombre:
                currentUser.localNombre,

              success:
                true,

              reason:
                "login_ok"
            });

            if (
              rememberCheckbox &&
              rememberCheckbox.checked
            ) {
              localStorage.setItem(
                "savedEmail",
                email
              );
            } else {
              localStorage.removeItem(
                "savedEmail"
              );
            }

            showSuccessToast(
              "Inicio de sesión correcto"
            );

            setTimeout(
              () => {
                redirectAccordingToRole(
                  currentUser.role
                );
              },
              800
            );
          } catch (error) {
            console.error(
              "Error auth:",
              error
            );

            setLoading(
              false
            );

            let mensajeError =
              "Ocurrió un error inesperado.";

            switch (
              error.code
            ) {
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
                  error.message ||
                  mensajeError;
            }

            showError(
              mensajeError
            );
          }
        }
      );
    }

    if (
      forgotPasswordLink
    ) {
      forgotPasswordLink.addEventListener(
        "click",
        handlePasswordReset
      );
    }

    bindMobileMenu();
    bindLogoutButtons();

    /*
     * ========================================================
     * AUTH STATE
     * ========================================================
     */

    auth.onAuthStateChanged(
      async user => {
        const currentPage =
          getCurrentPageFile();

        if (!user) {
          if (
            currentPage !==
              "index.html" &&
            currentPage !==
              "login.html"
          ) {
            window.location.href =
              "../index.html";
          }

          return;
        }

        try {
          const resolved =
            await getCurrentUserContext(
              user
            );

          if (
            resolved
          ) {
            const displayName =
              resolved.name ||
              "Usuario";

            const role =
              getCanonicalRole(
                resolved.role ||
                  ""
              );

            setUserGreeting(
              displayName,
              role
            );

            renderNavigationForRole(
              role
            );

            if (
              currentPage !==
                "index.html" &&
              currentPage !==
                "login.html"
            ) {
              if (
                !canAccessPage(
                  role,
                  currentPage
                )
              ) {
                window.location.href =
                  getDefaultPageForRole(
                    role
                  );
              }
            }
          }
        } catch (err) {
          console.error(
            "Error resolviendo contexto del usuario:",
            err
          );

          const storedUser =
            getStoredCurrentUser();

          const displayName =
            storedUser?.name ||
            "Usuario";

          const role =
            getCanonicalRole(
              storedUser?.role ||
                ""
            );

          setUserGreeting(
            displayName,
            role
          );

          renderNavigationForRole(
            role
          );

          if (
            currentPage !==
              "index.html" &&
            currentPage !==
              "login.html"
          ) {
            if (
              !canAccessPage(
                role,
                currentPage
              )
            ) {
              window.location.href =
                getDefaultPageForRole(
                  role
                );
            }
          }
        }
      }
    );
  }
);

/*
 * ============================================================
 * API GLOBAL
 * ============================================================
 */

window.auth =
  auth;

window.db =
  db;

window.normalizeRole =
  normalizeRole;

window.getCanonicalRole =
  getCanonicalRole;

window.renderNavigationForRole =
  renderNavigationForRole;

window.redirectAccordingToRole =
  redirectAccordingToRole;

window.getTodayBounds =
  getTodayBounds;

window.getDailyFinancialSummary =
  getDailyFinancialSummary;

window.getCurrentLocalId =
  getCurrentLocalId;

window.getCurrentLocalInfo =
  getCurrentLocalInfo;

window.matchesLocalContext =
  matchesLocalContext;

window.formatMoney =
  formatMoney;

window.getStoredCurrentUser =
  getStoredCurrentUser;

window.setStoredCurrentUser =
  setStoredCurrentUser;

window.patchStoredCurrentUser =
  patchStoredCurrentUser;

window.currentLocalContext =
  currentLocalContext;

/*
 * Función central reutilizable por los módulos.
 */
window.getCurrentUserContext =
  getCurrentUserContext;

window.ensureCurrentUserContext =
  ensureCurrentUserContext;

/*
 * Exponer constantes para módulos que las necesiten.
 */
window.EMPLOYEE_COLLECTION_NAME =
  EMPLOYEE_COLLECTION_NAME;

window.LOCAL_COLLECTION_NAME =
  LOCAL_COLLECTION_NAME;