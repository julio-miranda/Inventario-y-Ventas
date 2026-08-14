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
  apiKey: "AIzaSyAMsdmYEeH_zOQfXj55SURnp1Nkk8mhj4M",
  authDomain: "inventario-y-venta.firebaseapp.com",
  projectId: "inventario-y-venta",
  storageBucket: "inventario-y-venta.appspot.com",
  messagingSenderId: "220141957917",
  appId: "1:220141957917:web:1af57bde6709dffdf327f4",
  measurementId: "G-ELPGSV8ZLP"
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

const SUPPLIER_COLLECTION_NAME =
  "proveedores";

const LOGIN_ATTEMPTS_COLLECTION_NAME =
  "login_attempts";

const SALES_COLLECTION_NAME =
  "ventas";

const EXPENSES_COLLECTION_NAME =
  "gastos";

const MOVEMENTS_COLLECTION_NAME =
  "stock_movimientos";

const PRODUCTS_COLLECTION_NAME =
  "productos";

const CASH_CLOSE_COLLECTION_NAME =
  "cierres_caja";

/*
 * ============================================================
 * CACHE DE CONTEXTO
 * ============================================================
 */

let currentUserContextCache =
  null;

let currentUserContextPromise =
  null;

let currentUserContextUid =
  "";

/*
 * ============================================================
 * CACHE DE SESIÓN
 * ============================================================
 *
 * La caché:
 *
 * - pertenece al usuario autenticado;
 * - para usuarios operativos pertenece al local actual;
 * - para Desarrollador no requiere id_local;
 * - vive únicamente en sessionStorage;
 * - desaparece al cerrar sesión;
 * - se reconstruye al iniciar una nueva sesión;
 * - permite que diferentes módulos reutilicen los mismos datos.
 *
 * MODELOS:
 *
 * Desarrollador:
 *
 * - empleados      -> TODOS
 * - local           -> TODOS
 * - login_attempts  -> TODOS
 *
 * Usuarios operativos:
 *
 * - empleados       -> SOLO su local
 * - proveedores     -> SOLO su local
 * - productos       -> SOLO su local
 * - ventas          -> SOLO su local
 * - gastos          -> SOLO su local
 * - movimientos     -> SOLO su local
 * - cierres_caja     -> SOLO su local
 */

const SESSION_CACHE_KEY =
  "CONTROL_ACCESO_SESSION_CACHE";

const SESSION_CACHE_VERSION =
  1;

let sessionDataCache =
  null;

let sessionDataCachePromise =
  null;

let sessionDataCacheUid =
  "";

/*
 * ============================================================
 * COLECCIONES PRELOAD
 * ============================================================
 *
 * "local-or-developer-all":
 *
 * - Desarrollador -> colección completa
 * - Usuarios operativos -> filtrada por id_local
 *
 * Se utiliza para empleados porque:
 *
 * - Desarrollador necesita todos los empleados.
 * - Administrador necesita únicamente empleados de su local.
 */

const SESSION_PRELOAD_COLLECTIONS = [
  {
    name:
      EMPLOYEE_COLLECTION_NAME,

    mode:
      "local-or-developer-all"
  },

  {
    name:
      SUPPLIER_COLLECTION_NAME,

    mode:
      "local"
  },

  {
    name:
      PRODUCTS_COLLECTION_NAME,

    mode:
      "local"
  },

  {
    name:
      SALES_COLLECTION_NAME,

    mode:
      "local"
  },

  {
    name:
      EXPENSES_COLLECTION_NAME,

    mode:
      "local"
  },

  {
    name:
      MOVEMENTS_COLLECTION_NAME,

    mode:
      "local"
  },

  {
    name:
      CASH_CLOSE_COLLECTION_NAME,

    mode:
      "local"
  },

  /*
   * Desarrollador administra todos los locales.
   */
  {
    name:
      LOCAL_COLLECTION_NAME,

    mode:
      "developer-all"
  },

  /*
   * Desarrollador necesita todos los intentos.
   */
  {
    name:
      LOGIN_ATTEMPTS_COLLECTION_NAME,

    mode:
      "developer-all"
  }
];

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

function roleRequiresLocal(
  role = ""
) {
  return (
    getCanonicalRole(
      role
    ) !==
    "Desarrollador"
  );
}

function isDeveloperRole(
  role = ""
) {
  return (
    getCanonicalRole(
      role
    ) ===
    "Desarrollador"
  );
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
      label: "Proveedores",
      href: "proveedores.html"
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
    },
    {
      label: "Proveedores",
      href: "proveedores.html"
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
    "proveedores.html",
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
    "inventory.html",
    "proveedores.html"
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
            clearSessionDataCache();

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

            window.currentLocalContext =
              currentLocalContext;

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
 * STORAGE
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
 * CACHE DE SESIÓN
 * ============================================================
 */

function cloneForSessionCache(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return value;
  }

  if (
    typeof value ===
      "string" ||
    typeof value ===
      "number" ||
    typeof value ===
      "boolean"
  ) {
    return value;
  }

  if (
    typeof value ===
    "bigint"
  ) {
    return Number(
      value
    );
  }

  if (
    value instanceof
    Date
  ) {
    return value.getTime();
  }

  if (
    typeof firebase !==
      "undefined" &&
    firebase.firestore &&
    firebase.firestore.Timestamp &&
    value instanceof
      firebase.firestore.Timestamp
  ) {
    return value.toMillis();
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      cloneForSessionCache
    );
  }

  if (
    typeof value ===
    "object"
  ) {
    const result =
      {};

    Object.entries(
      value
    ).forEach(
      ([
        key,
        child
      ]) => {
        try {
          result[
            key
          ] =
            cloneForSessionCache(
              child
            );
        } catch {
          // ignora propiedades no serializables
        }
      }
    );

    return result;
  }

  return String(
    value
  );
}

function saveSessionDataCache() {
  if (
    !sessionDataCache
  ) {
    return false;
  }

  try {
    sessionStorage.setItem(
      SESSION_CACHE_KEY,
      JSON.stringify(
        sessionDataCache
      )
    );

    return true;
  } catch (
    error
  ) {
    console.warn(
      "No se pudo guardar toda la caché de sesión en sessionStorage. Se mantendrá en memoria mientras permanezca cargada esta página:",
      error
    );

    return false;
  }
}

function loadSessionDataCache(
  uid = ""
) {
  const targetUid =
    String(
      uid ||
        ""
    ).trim();

  if (
    !targetUid
  ) {
    return null;
  }

  try {
    const raw =
      sessionStorage.getItem(
        SESSION_CACHE_KEY
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(
        raw
      );

    if (
      !parsed ||
      parsed.version !==
        SESSION_CACHE_VERSION
    ) {
      sessionStorage.removeItem(
        SESSION_CACHE_KEY
      );

      return null;
    }

    if (
      String(
        parsed.uid ||
          ""
      ).trim() !==
      targetUid
    ) {
      return null;
    }

    return parsed;
  } catch (
    error
  ) {
    console.warn(
      "No se pudo restaurar la caché de sesión:",
      error
    );

    try {
      sessionStorage.removeItem(
        SESSION_CACHE_KEY
      );
    } catch {
      // ignore
    }

    return null;
  }
}

function createEmptySessionDataCache(
  uid,
  idLocal = "",
  role = ""
) {
  const now =
    Date.now();

  const canonicalRole =
    getCanonicalRole(
      role
    );

  sessionDataCache = {
    version:
      SESSION_CACHE_VERSION,

    uid:
      String(
        uid ||
          ""
      ).trim(),

    role:
      canonicalRole,

    id_local:
      roleRequiresLocal(
        canonicalRole
      )
        ? String(
          idLocal ||
            ""
        ).trim()
        : "",

    createdAt:
      now,

    updatedAt:
      now,

    collections:
      {},

    context:
      null
  };

  sessionDataCacheUid =
    sessionDataCache.uid;

  return sessionDataCache;
}

function ensureSessionCacheContainer(
  uid,
  idLocal = "",
  role = ""
) {
  const targetUid =
    String(
      uid ||
        ""
    ).trim();

  const targetRole =
    getCanonicalRole(
      role
    );

  const targetLocal =
    roleRequiresLocal(
      targetRole
    )
      ? String(
        idLocal ||
          ""
      ).trim()
      : "";

  if (
    sessionDataCache &&
    sessionDataCacheUid ===
      targetUid
  ) {
    if (
      targetRole
    ) {
      sessionDataCache.role =
        targetRole;
    }

    if (
      isDeveloperRole(
        targetRole
      )
    ) {
      sessionDataCache.id_local =
        "";
    } else if (
      targetLocal &&
      !sessionDataCache.id_local
    ) {
      sessionDataCache.id_local =
        targetLocal;
    }

    return sessionDataCache;
  }

  const restored =
    loadSessionDataCache(
      targetUid
    );

  if (
    restored
  ) {
    sessionDataCache =
      restored;

    sessionDataCacheUid =
      targetUid;

    if (
      targetRole
    ) {
      sessionDataCache.role =
        targetRole;
    }

    if (
      isDeveloperRole(
        targetRole
      )
    ) {
      sessionDataCache.id_local =
        "";
    } else if (
      targetLocal &&
      !sessionDataCache.id_local
    ) {
      sessionDataCache.id_local =
        targetLocal;
    }

    return sessionDataCache;
  }

  return createEmptySessionDataCache(
    targetUid,
    targetLocal,
    targetRole
  );
}

function setSessionContext(
  context
) {
  if (
    !context ||
    !context.uid
  ) {
    return;
  }

  const canonicalRole =
    getCanonicalRole(
      context.role ||
        context.position ||
        ""
    );

  const cache =
    ensureSessionCacheContainer(
      context.uid,
      context.id_local,
      canonicalRole
    );

  cache.context =
    cloneForSessionCache(
      context
    );

  cache.uid =
    context.uid;

  cache.role =
    canonicalRole;

  cache.id_local =
    roleRequiresLocal(
      canonicalRole
    )
      ? String(
        context.id_local ||
          ""
      ).trim()
      : "";

  cache.updatedAt =
    Date.now();

  saveSessionDataCache();
}

function getSessionContext(
  uid =
    auth.currentUser?.uid
) {
  const targetUid =
    String(
      uid ||
        ""
    ).trim();

  if (
    !targetUid
  ) {
    return null;
  }

  const cache =
    ensureSessionCacheContainer(
      targetUid
    );

  if (
    !cache ||
    !cache.context
  ) {
    return null;
  }

  if (
    String(
      cache.context.uid ||
        ""
    ).trim() !==
    targetUid
  ) {
    return null;
  }

  return {
    ...cache.context
  };
}

function seedSessionCollection(
  collectionName,
  documents = [],
  options = {}
) {
  const user =
    auth.currentUser;

  if (
    !user ||
    !collectionName
  ) {
    return;
  }

  const contextRole =
    options.role ||
    currentUserContextCache?.role ||
    sessionDataCache?.role ||
    "";

  const cache =
    ensureSessionCacheContainer(
      user.uid,
      options.id_local ||
        getCurrentLocalId(),
      contextRole
    );

  const docs =
    Array.isArray(
      documents
    )
      ? documents.map(
        item => ({
          id:
            String(
              item?.id ||
                ""
            ),

          data:
            cloneForSessionCache(
              item?.data ||
                {}
            )
        })
      )
      : [];

  cache.collections[
    collectionName
  ] = {
    loadedAt:
      Date.now(),

    docs
  };

  cache.updatedAt =
    Date.now();

  saveSessionDataCache();
}

function setSessionCollection(
  collectionName,
  documents = []
) {
  seedSessionCollection(
    collectionName,
    documents
  );
}

function getSessionCollection(
  collectionName,
  options = {}
) {
  const user =
    auth.currentUser;

  const targetUid =
    String(
      options.uid ||
        user?.uid ||
        ""
    ).trim();

  if (
    !targetUid ||
    !collectionName
  ) {
    return [];
  }

  const contextRole =
    options.role ||
    currentUserContextCache?.role ||
    sessionDataCache?.role ||
    "";

  const cache =
    ensureSessionCacheContainer(
      targetUid,
      options.id_local ||
        getCurrentLocalId(),
      contextRole
    );

  const entry =
    cache.collections?.[
      collectionName
    ];

  if (
    !entry ||
    !Array.isArray(
      entry.docs
    )
  ) {
    return [];
  }

  return entry.docs.map(
    doc => ({
      id:
        doc.id,

      data:
        {
          ...(doc.data ||
            {})
        }
    })
  );
}

function getSessionCollectionData(
  collectionName,
  options = {}
) {
  return getSessionCollection(
    collectionName,
    options
  ).map(
    item => ({
      id:
        item.id,

      ...item.data
    })
  );
}

function getSessionDocument(
  collectionName,
  documentId,
  options = {}
) {
  const docs =
    getSessionCollection(
      collectionName,
      options
    );

  const target =
    String(
      documentId ||
        ""
    ).trim();

  return (
    docs.find(
      doc =>
        String(
          doc.id ||
            ""
        ).trim() ===
        target
    ) ||
    null
  );
}

function upsertSessionDocument(
  collectionName,
  documentId,
  data = {}
) {
  const user =
    auth.currentUser;

  if (
    !user ||
    !collectionName ||
    !documentId
  ) {
    return;
  }

  const cache =
    ensureSessionCacheContainer(
      user.uid,
      getCurrentLocalId(),
      currentUserContextCache?.role ||
        sessionDataCache?.role ||
        ""
    );

  if (
    !cache.collections
  ) {
    cache.collections =
      {};
  }

  if (
    !cache.collections[
      collectionName
    ]
  ) {
    cache.collections[
      collectionName
    ] = {
      loadedAt:
        Date.now(),

      docs:
        []
    };
  }

  const entry =
    cache.collections[
      collectionName
    ];

  const normalizedId =
    String(
      documentId
    ).trim();

  const index =
    entry.docs.findIndex(
      doc =>
        String(
          doc.id ||
            ""
        ).trim() ===
        normalizedId
    );

  const normalizedData =
    cloneForSessionCache(
      data
    );

  if (
    index >=
    0
  ) {
    entry.docs[
      index
    ] = {
      id:
        normalizedId,

      data:
        {
          ...entry.docs[
            index
          ].data,

          ...normalizedData
        }
    };
  } else {
    entry.docs.push({
      id:
        normalizedId,

      data:
        normalizedData
    });
  }

  cache.updatedAt =
    Date.now();

  saveSessionDataCache();
}

function removeSessionDocument(
  collectionName,
  documentId
) {
  const user =
    auth.currentUser;

  if (
    !user ||
    !collectionName ||
    !documentId
  ) {
    return;
  }

  const cache =
    ensureSessionCacheContainer(
      user.uid,
      getCurrentLocalId(),
      currentUserContextCache?.role ||
        sessionDataCache?.role ||
        ""
    );

  const entry =
    cache.collections?.[
      collectionName
    ];

  if (
    !entry ||
    !Array.isArray(
      entry.docs
    )
  ) {
    return;
  }

  entry.docs =
    entry.docs.filter(
      doc =>
        String(
          doc.id ||
            ""
        ).trim() !==
        String(
          documentId
        ).trim()
    );

  cache.updatedAt =
    Date.now();

  saveSessionDataCache();
}

function updateSessionDocumentsWhere(
  collectionName,
  predicate,
  patch = {}
) {
  const user =
    auth.currentUser;

  if (
    !user ||
    !collectionName ||
    typeof predicate !==
      "function"
  ) {
    return 0;
  }

  const cache =
    ensureSessionCacheContainer(
      user.uid,
      getCurrentLocalId(),
      currentUserContextCache?.role ||
        sessionDataCache?.role ||
        ""
    );

  const entry =
    cache.collections?.[
      collectionName
    ];

  if (
    !entry ||
    !Array.isArray(
      entry.docs
    )
  ) {
    return 0;
  }

  let changed =
    0;

  entry.docs.forEach(
    doc => {
      if (
        predicate(
          doc
        )
      ) {
        doc.data = {
          ...doc.data,

          ...cloneForSessionCache(
            patch
          )
        };

        changed +=
          1;
      }
    }
  );

  if (
    changed
  ) {
    cache.updatedAt =
      Date.now();

    saveSessionDataCache();
  }

  return changed;
}

function clearSessionDataCache() {
  sessionDataCache =
    null;

  sessionDataCacheUid =
    "";

  sessionDataCachePromise =
    null;

  try {
    sessionStorage.removeItem(
      SESSION_CACHE_KEY
    );
  } catch {
    // ignore
  }
}

function getSessionCacheStatus(
  uid =
    auth.currentUser?.uid
) {
  const targetUid =
    String(
      uid ||
        ""
    ).trim();

  if (
    !targetUid
  ) {
    return {
      loaded:
        false,

      uid:
        "",

      role:
        "",

      requiresLocal:
        true,

      id_local:
        "",

      collections:
        []
    };
  }

  const cache =
    ensureSessionCacheContainer(
      targetUid
    );

  const role =
    getCanonicalRole(
      cache?.role ||
        cache?.context?.role ||
        ""
    );

  return {
    loaded:
      Boolean(
        cache
      ),

    uid:
      cache?.uid ||
      targetUid,

    role,

    requiresLocal:
      roleRequiresLocal(
        role
      ),

    id_local:
      isDeveloperRole(
        role
      )
        ? ""
        : (
          cache?.id_local ||
          ""
        ),

    collections:
      Object.keys(
        cache?.collections ||
          {}
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

  const storedRole =
    getCanonicalRole(
      stored?.role ||
        stored?.position ||
        currentUserContextCache?.role ||
        sessionDataCache?.role ||
        ""
    );

  if (
    isDeveloperRole(
      storedRole
    )
  ) {
    return "";
  }

  return String(
    stored?.id_local ||
      stored?.idLocal ||
      stored?.localId ||
      currentLocalContext.id_local ||
      sessionDataCache?.id_local ||
      ""
  ).trim();
}

function getCurrentLocalInfo() {
  const stored =
    getStoredCurrentUser() ||
    {};

  const role =
    getCanonicalRole(
      stored.role ||
        stored.position ||
        currentUserContextCache?.role ||
        sessionDataCache?.role ||
        ""
    );

  if (
    isDeveloperRole(
      role
    )
  ) {
    return {
      id_local:
        "",

      nombre:
        "",

      numeroDocumento:
        "",

      ubicacion:
        "",

      contribuyente:
        "",

      tipoDocumento:
        "",

      nit:
        "",

      nrc:
        ""
    };
  }

  return {
    id_local:
      String(
        stored.id_local ||
          stored.idLocal ||
          stored.localId ||
          currentLocalContext.id_local ||
          sessionDataCache?.id_local ||
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

  if (
    !target
  ) {
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
 * CARGAS FIRESTORE INDIVIDUALES
 * ============================================================
 */

async function loadLocalById(
  localId = ""
) {
  const target =
    String(
      localId
    ).trim();

  if (
    !target
  ) {
    return null;
  }

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
  } catch (
    error
  ) {
    console.warn(
      "No se pudo cargar el local por ID:",
      error
    );
  }

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
  } catch (
    error
  ) {
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
  if (
    !user
  ) {
    return null;
  }

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
  } catch (
    error
  ) {
    console.warn(
      "No se pudo cargar el empleado por UID:",
      error
    );
  }

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
    } catch (
      error
    ) {
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
 * CONTEXTO UNIFICADO
 * ============================================================
 */

function applyResolvedUserContext(
  context
) {
  currentUserContextCache =
    context;

  currentUserContextUid =
    context?.uid ||
    "";

  const canonicalRole =
    getCanonicalRole(
      context?.role ||
        context?.position ||
        ""
    );

  const requiresLocal =
    roleRequiresLocal(
      canonicalRole
    );

  currentLocalContext = {
    id_local:
      requiresLocal
        ? (
          context?.id_local ||
            ""
        )
        : "",

    nombre:
      requiresLocal
        ? (
          context?.localNombre ||
            ""
        )
        : "",

    numeroDocumento:
      requiresLocal
        ? (
          context?.localNumeroDocumento ||
            ""
        )
        : "",

    ubicacion:
      requiresLocal
        ? (
          context?.localUbicacion ||
            ""
        )
        : "",

    contribuyente:
      requiresLocal
        ? (
          context?.localContribuyente ||
            ""
        )
        : "",

    tipoDocumento:
      requiresLocal
        ? (
          context?.localTipoDocumento ||
            ""
        )
        : "",

    nit:
      requiresLocal
        ? (
          context?.localNIT ||
            ""
        )
        : "",

    nrc:
      requiresLocal
        ? (
          context?.localNRC ||
            ""
        )
        : ""
  };

  window.currentLocalContext =
    currentLocalContext;

  return context;
}

async function ensureCurrentUserContext(
  user,
  options = {}
) {
  if (
    !user
  ) {
    return null;
  }

  const forceRefresh =
    options.forceRefresh ===
    true;

  /*
   * ==========================================================
   * RESTAURAR CONTEXTO DESDE CACHE
   * ==========================================================
   */

  if (
    !forceRefresh
  ) {
    const cachedContext =
      getSessionContext(
        user.uid
      );

    if (
      cachedContext
    ) {
      const cachedRole =
        getCanonicalRole(
          cachedContext.role ||
            cachedContext.position ||
            ""
        );

      if (
        isDeveloperRole(
          cachedRole
        )
      ) {
        cachedContext.id_local =
          "";
      }

      return applyResolvedUserContext(
        cachedContext
      );
    }
  }

  if (
    currentUserContextPromise &&
    currentUserContextUid ===
      user.uid &&
    !forceRefresh
  ) {
    return (
      currentUserContextPromise
    );
  }

  if (
    !forceRefresh &&
    currentUserContextCache &&
    currentUserContextUid ===
      user.uid
  ) {
    const cachedRole =
      getCanonicalRole(
        currentUserContextCache.role ||
          currentUserContextCache.position ||
          ""
      );

    if (
      isDeveloperRole(
        cachedRole
      )
    ) {
      currentUserContextCache.id_local =
        "";
    }

    return (
      currentUserContextCache
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
       * ========================================================
       * PERFIL DESDE localStorage
       * ========================================================
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
            stored.position ||
            stored.role ||
            "",

          role:
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

          localBlocked:
            stored.localBlocked ===
            true,

          active:
            stored.active !==
            false,

          blocked:
            stored.blocked ===
            true,

          failedLoginAttempts:
            Number(
              stored.failedLoginAttempts ||
                0
            ) || 0
        };
      }

      /*
       * ========================================================
       * PERFIL DESDE FIRESTORE
       * ========================================================
       */

      if (
        !employee
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

      if (
        !role
      ) {
        throw new Error(
          "El usuario no tiene un rol válido configurado."
        );
      }

      const requiresLocal =
        roleRequiresLocal(
          role
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

      /*
       * Solo roles operativos necesitan local.
       */
      if (
        requiresLocal &&
        !id_local
      ) {
        throw new Error(
          "El usuario no tiene un id_local asignado."
        );
      }

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
          "",

        blocked:
          employee.localBlocked ===
            true ||
          employee.localBloqueado ===
            true ||
          stored?.localBlocked ===
            true
      };

      /*
       * Solo se lee el local cuando es necesario.
       * Desarrollador jamás necesita esta lectura.
       */

      const needsLocalRead =
        requiresLocal &&
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
              "",

            blocked:
              localDoc.blocked ===
                true ||
              localDoc.bloqueado ===
                true ||
              localInfo.blocked
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

        position:
          employee.position ||
          employee.role ||
          role,

        active:
          employee.active !==
          false,

        blocked:
          employee.blocked ===
          true,

        localBlocked:
          requiresLocal
            ? localInfo.blocked ===
              true
            : false,

        failedLoginAttempts:
          Number(
            employee.failedLoginAttempts ||
              0
          ) || 0,

        id_local:
          requiresLocal
            ? id_local
            : "",

        localNombre:
          requiresLocal
            ? String(
              localInfo.nombre ||
                ""
            ).trim()
            : "",

        localNumeroDocumento:
          requiresLocal
            ? String(
              localInfo.numeroDocumento ||
                ""
            ).trim()
            : "",

        localUbicacion:
          requiresLocal
            ? String(
              localInfo.ubicacion ||
                ""
            ).trim()
            : "",

        localContribuyente:
          requiresLocal
            ? String(
              localInfo.contribuyente ||
                ""
            ).trim()
            : "",

        localTipoDocumento:
          requiresLocal
            ? String(
              localInfo.tipoDocumento ||
                ""
            ).trim()
            : "",

        localNIT:
          requiresLocal
            ? String(
              localInfo.nit ||
                ""
            ).trim()
            : "",

        localNRC:
          requiresLocal
            ? String(
              localInfo.nrc ||
                ""
            ).trim()
            : ""
      };

      applyResolvedUserContext(
        context
      );

      setSessionContext(
        context
      );

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

  try {
    return await currentUserContextPromise;
  } finally {
    currentUserContextPromise =
      null;
  }
}

async function getCurrentUserContext(
  user = auth.currentUser
) {
  if (
    !user
  ) {
    return null;
  }

  return ensureCurrentUserContext(
    user
  );
}

/*
 * ============================================================
 * CARGA CENTRAL DE DATOS
 * ============================================================
 */

async function querySessionCollection(
  config,
  localId,
  role = ""
) {
  if (
    !config ||
    !config.name
  ) {
    return {
      name:
        "",

      documents:
        []
    };
  }

  const canonicalRole =
    getCanonicalRole(
      role
    );

  const targetLocalId =
    String(
      localId ||
        ""
    ).trim();

  /*
   * ==========================================================
   * MODO ID
   * ==========================================================
   */

  if (
    config.mode ===
    "id"
  ) {
    if (
      !targetLocalId
    ) {
      return {
        name:
          config.name,

        documents:
          []
      };
    }

    const doc =
      await db
        .collection(
          config.name
        )
        .doc(
          targetLocalId
        )
        .get();

    return {
      name:
        config.name,

      documents:
        doc.exists
          ? [
            {
              id:
                doc.id,

              data:
                doc.data() ||
                {}
            }
          ]
          : []
    };
  }

  /*
   * ==========================================================
   * MODO LOCAL
   * ==========================================================
   *
   * Solo roles con local.
   */

  if (
    config.mode ===
    "local"
  ) {
    if (
      !roleRequiresLocal(
        canonicalRole
      )
    ) {
      return {
        name:
          config.name,

        documents:
          []
      };
    }

    if (
      !targetLocalId
    ) {
      return {
        name:
          config.name,

        documents:
          []
      };
    }

    const snapshot =
      await db
        .collection(
          config.name
        )
        .where(
          "id_local",
          "==",
          targetLocalId
        )
        .get();

    const documents =
      [];

    snapshot.forEach(
      doc => {
        const data =
          doc.data() ||
          {};

        if (
          matchesLocalContext(
            data,
            targetLocalId
          )
        ) {
          documents.push({
            id:
              doc.id,

            data
          });
        }
      }
    );

    return {
      name:
        config.name,

      documents
    };
  }

  /*
   * ==========================================================
   * MODO LOCAL-OR-DEVELOPER-ALL
   * ==========================================================
   *
   * Caso utilizado por "empleados".
   *
   * Desarrollador:
   *
   *     collection.get()
   *
   * Usuarios operativos:
   *
   *     collection.where("id_local", "==", localId)
   */

  if (
    config.mode ===
    "local-or-developer-all"
  ) {
    /*
     * --------------------------------------------------------
     * DESARROLLADOR
     * --------------------------------------------------------
     */

    if (
      canonicalRole ===
      "Desarrollador"
    ) {
      const snapshot =
        await db
          .collection(
            config.name
          )
          .get();

      const documents =
        [];

      snapshot.forEach(
        doc => {
          documents.push({
            id:
              doc.id,

            data:
              doc.data() ||
              {}
          });
        }
      );

      return {
        name:
          config.name,

        documents
      };
    }

    /*
     * --------------------------------------------------------
     * USUARIO OPERATIVO
     * --------------------------------------------------------
     */

    if (
      !targetLocalId
    ) {
      return {
        name:
          config.name,

        documents:
          []
      };
    }

    const snapshot =
      await db
        .collection(
          config.name
        )
        .where(
          "id_local",
          "==",
          targetLocalId
        )
        .get();

    const documents =
      [];

    snapshot.forEach(
      doc => {
        const data =
          doc.data() ||
          {};

        /*
         * Doble validación local.
         */
        if (
          matchesLocalContext(
            data,
            targetLocalId
          )
        ) {
          documents.push({
            id:
              doc.id,

            data
          });
        }
      }
    );

    return {
      name:
        config.name,

      documents
    };
  }

  /*
   * ==========================================================
   * MODO DEVELOPER-ALL
   * ==========================================================
   *
   * Exclusivamente Desarrollador.
   */

  if (
    config.mode ===
    "developer-all"
  ) {
    if (
      canonicalRole !==
      "Desarrollador"
    ) {
      return {
        name:
          config.name,

        documents:
          []
      };
    }

    const snapshot =
      await db
        .collection(
          config.name
        )
        .get();

    const documents =
      [];

    snapshot.forEach(
      doc => {
        documents.push({
          id:
            doc.id,

          data:
            doc.data() ||
            {}
        });
      }
    );

    return {
      name:
        config.name,

      documents
    };
  }

  /*
   * ==========================================================
   * MODO FULL
   * ==========================================================
   */

  const snapshot =
    await db
      .collection(
        config.name
      )
      .get();

  const documents =
    [];

  snapshot.forEach(
    doc => {
      documents.push({
        id:
          doc.id,

        data:
          doc.data() ||
          {}
      });
    }
  );

  return {
    name:
      config.name,

    documents
  };
}

async function preloadSessionData(
  user = auth.currentUser,
  options = {}
) {
  if (
    !user
  ) {
    return null;
  }

  const forceRefresh =
    options.forceRefresh ===
    true;

  if (
    sessionDataCachePromise &&
    sessionDataCacheUid ===
      user.uid &&
    !forceRefresh
  ) {
    return sessionDataCachePromise;
  }

  if (
    !forceRefresh
  ) {
    const restored =
      loadSessionDataCache(
        user.uid
      );

    if (
      restored &&
      restored.context
    ) {
      sessionDataCache =
        restored;

      sessionDataCacheUid =
        user.uid;

      const restoredRole =
        getCanonicalRole(
          restored.role ||
            restored.context.role ||
            restored.context.position ||
            ""
        );

      restored.role =
        restoredRole;

      restored.id_local =
        roleRequiresLocal(
          restoredRole
        )
          ? String(
            restored.id_local ||
              restored.context.id_local ||
              ""
          ).trim()
          : "";

      return sessionDataCache;
    }
  }

  const context =
    await getCurrentUserContext(
      user
    );

  if (
    !context
  ) {
    throw new Error(
      "No existe contexto para la sesión actual."
    );
  }

  const canonicalRole =
    getCanonicalRole(
      context.role ||
        context.position ||
        ""
    );

  if (
    !canonicalRole
  ) {
    throw new Error(
      "El usuario autenticado no tiene un rol válido."
    );
  }

  const requiresLocal =
    roleRequiresLocal(
      canonicalRole
    );

  const localId =
    String(
      context.id_local ||
        ""
    ).trim();

  /*
   * Solo los roles operativos requieren local.
   */
  if (
    requiresLocal &&
    !localId
  ) {
    throw new Error(
      "El usuario autenticado no tiene un id_local válido."
    );
  }

  if (
    forceRefresh
  ) {
    clearSessionDataCache();
  }

  const cache =
    ensureSessionCacheContainer(
      user.uid,
      localId,
      canonicalRole
    );

  cache.context =
    cloneForSessionCache(
      context
    );

  cache.uid =
    user.uid;

  cache.role =
    canonicalRole;

  cache.id_local =
    requiresLocal
      ? localId
      : "";

  sessionDataCacheUid =
    user.uid;

  sessionDataCachePromise =
    (async () => {
      const results =
        await Promise.allSettled(
          SESSION_PRELOAD_COLLECTIONS.map(
            config =>
              querySessionCollection(
                config,
                localId,
                canonicalRole
              )
          )
        );

      results.forEach(
        (
          result,
          index
        ) => {
          const config =
            SESSION_PRELOAD_COLLECTIONS[
              index
            ];

          if (
            result.status ===
            "fulfilled"
          ) {
            const documents =
              result.value
                ?.documents ||
                [];

            cache.collections[
              config.name
            ] = {
              loadedAt:
                Date.now(),

              docs:
                documents.map(
                  doc => ({
                    id:
                      doc.id,

                    data:
                      cloneForSessionCache(
                        doc.data ||
                          {}
                      )
                  })
                )
            };

            console.log(
              `[Sesión] ${config.name}: ${documents.length} documentos cargados.`
            );
          } else {
            console.warn(
              `[Sesión] No se pudo precargar ${config.name}:`,
              result.reason
            );

            cache.collections[
              config.name
            ] = {
              loadedAt:
                Date.now(),

              docs:
                [],

              error:
                result.reason?.message ||
                String(
                  result.reason ||
                    ""
                )
            };
          }
        }
      );

      cache.updatedAt =
        Date.now();

      cache.id_local =
        isDeveloperRole(
          canonicalRole
        )
          ? ""
          : localId;

      saveSessionDataCache();

      console.log(
        "[Sesión] Caché de sesión preparada:",
        getSessionCacheStatus(
          user.uid
        )
      );

      return cache;
    })()
      .finally(
        () => {
          sessionDataCachePromise =
            null;
        }
      );

  return sessionDataCachePromise;
}

async function ensureSessionDataLoaded(
  user = auth.currentUser
) {
  if (
    !user
  ) {
    return null;
  }

  const restored =
    loadSessionDataCache(
      user.uid
    );

  if (
    restored &&
    restored.context
  ) {
    sessionDataCache =
      restored;

    sessionDataCacheUid =
      user.uid;

    const restoredRole =
      getCanonicalRole(
        restored.role ||
          restored.context.role ||
          restored.context.position ||
          ""
      );

    restored.role =
      restoredRole;

    if (
      isDeveloperRole(
        restoredRole
      )
    ) {
      restored.id_local =
        "";
    }

    return sessionDataCache;
  }

  return preloadSessionData(
    user,
    {
      forceRefresh:
        false
    }
  );
}

/*
 * ============================================================
 * REDIRECCIÓN
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

function getDocumentsFromSessionOrEmpty(
  collectionName
) {
  return getSessionCollection(
    collectionName
  );
}

function calculateDailyFinancialSummaryFromCache(
  date = new Date(),
  localId = getCurrentLocalId()
) {
  const targetLocalId =
    String(
      localId ||
        ""
    ).trim();

  const start =
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      0,
      0,
      0,
      0
    );

  const end =
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23,
      59,
      59,
      999
    );

  let sales =
    0;

  let expenses =
    0;

  const salesDocs =
    getDocumentsFromSessionOrEmpty(
      SALES_COLLECTION_NAME
    );

  salesDocs.forEach(
    ({
      data
    }) => {
      if (
        targetLocalId &&
        !matchesLocalContext(
          data,
          targetLocalId
        )
      ) {
        return;
      }

      const timestamp =
        getTimestampMs(
          data.createdAt
        );

      if (
        timestamp >=
          start.getTime() &&
        timestamp <=
          end.getTime()
      ) {
        sales +=
          Number(
            data.total ||
              0
          );
      }
    }
  );

  const expenseDocs =
    getDocumentsFromSessionOrEmpty(
      EXPENSES_COLLECTION_NAME
    );

  expenseDocs.forEach(
    ({
      data
    }) => {
      if (
        targetLocalId &&
        !matchesLocalContext(
          data,
          targetLocalId
        )
      ) {
        return;
      }

      const timestamp =
        getTimestampMs(
          data.createdAt
        );

      if (
        timestamp >=
          start.getTime() &&
        timestamp <=
          end.getTime()
      ) {
        expenses +=
          Number(
            data.amount ||
              0
          );
      }
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

async function getDailyFinancialSummary(
  date = new Date(),
  localId = getCurrentLocalId()
) {
  if (
    isDeveloperRole(
      currentUserContextCache?.role ||
        getStoredCurrentUser()?.role ||
        ""
    )
  ) {
    return {
      sales:
        0,

      expenses:
        0,

      net:
        0
    };
  }

  return calculateDailyFinancialSummaryFromCache(
    date,
    localId
  );
}

/*
 * ============================================================
 * LOGIN / AUDITORÍA
 * ============================================================
 */

async function recordLoginAttempt(
  payload = {}
) {
  try {
    const firestorePayload = {
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
    };

    const ref =
      await db
        .collection(
          LOGIN_ATTEMPTS_COLLECTION_NAME
        )
        .add(
          firestorePayload
        );

    upsertSessionDocument(
      LOGIN_ATTEMPTS_COLLECTION_NAME,
      ref.id,
      {
        ...payload,

        result:
          payload.success
            ? "exitoso"
            : "fallido",

        createdAt:
          Date.now()
      }
    );
  } catch (
    error
  ) {
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
  if (
    !employeeId
  ) {
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

    const safePatch =
      {};

    Object.entries(
      patch ||
        {}
    ).forEach(
      ([
        key,
        value
      ]) => {
        if (
          key ===
            "lastLoginAt" ||
          key ===
            "lastAccessAt" ||
          key ===
            "lastFailedAt" ||
          key ===
            "updatedAt"
        ) {
          safePatch[
            key
          ] =
            Date.now();
        } else {
          safePatch[
            key
          ] =
            value;
        }
      }
    );

    upsertSessionDocument(
      EMPLOYEE_COLLECTION_NAME,
      employeeId,
      safePatch
    );

    if (
      currentUserContextCache &&
      String(
        currentUserContextCache.employeeId ||
          ""
      ) ===
        String(
          employeeId
        )
    ) {
      currentUserContextCache = {
        ...currentUserContextCache,

        ...safePatch
      };

      setSessionContext(
        currentUserContextCache
      );
    }
  } catch (
    error
  ) {
    console.error(
      "No se pudo actualizar el acceso del empleado:",
      error
    );
  }
}

/*
 * ============================================================
 * LOGIN / UI
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
      isLoading,
      text =
        "Validando..."
    ) {
      if (
        !btnLogin
      ) {
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
            ? text
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
      } catch (
        error
      ) {
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
            true,
            "Validando..."
          );

          try {
            const userCredential =
              await auth.signInWithEmailAndPassword(
                email,
                password
              );

            const user =
              userCredential.user;

            clearSessionDataCache();

            const context =
              await ensureCurrentUserContext(
                user,
                {
                  forceRefresh:
                    true
                }
              );

            if (
              !context
            ) {
              setLoading(
                false
              );

              showError(
                "El usuario no tiene perfil en la base de datos."
              );

              return;
            }

            const role =
              getCanonicalRole(
                context.role ||
                  context.position ||
                  ""
              );

            if (
              !role
            ) {
              await auth.signOut();

              clearSessionDataCache();

              showError(
                "El usuario no tiene un rol válido configurado."
              );

              return;
            }

            const requiresLocal =
              roleRequiresLocal(
                role
              );

            const id_local =
              String(
                context.id_local ||
                  ""
              ).trim();

            if (
              requiresLocal &&
              !id_local
            ) {
              await auth.signOut();

              clearSessionDataCache();

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
                "El usuario no tiene un local asignado."
              );

              return;
            }

            if (
              context.blocked ===
                true ||
              context.active ===
                false
            ) {
              await recordLoginAttempt({
                email:
                  context.email ||
                  user.email ||
                  email,

                uid:
                  user.uid,

                id_local:
                  requiresLocal
                    ? id_local
                    : "",

                localNombre:
                  requiresLocal
                    ? context.localNombre
                    : "",

                success:
                  false,

                reason:
                  "usuario_bloqueado"
              });

              await updateEmployeeAccess(
                context.employeeId ||
                  user.uid,
                {
                  failedLoginAttempts:
                    (
                      Number(
                        context.failedLoginAttempts
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

              clearSessionDataCache();

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

            if (
              requiresLocal &&
              context.localBlocked ===
                true
            ) {
              await recordLoginAttempt({
                email:
                  context.email ||
                  user.email ||
                  email,

                uid:
                  user.uid,

                id_local:
                  id_local,

                localNombre:
                  context.localNombre,

                success:
                  false,

                reason:
                  "local_bloqueado"
              });

              await auth.signOut();

              clearSessionDataCache();

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
                context.employeeId ||
                user.uid,

              name:
                context.name ||
                "",

              email:
                context.email ||
                user.email ||
                "",

              phone:
                context.phone ||
                "",

              role,

              position:
                role,

              active:
                context.active !==
                false,

              blocked:
                false,

              localBlocked:
                false,

              failedLoginAttempts:
                0,

              id_local:
                requiresLocal
                  ? id_local
                  : "",

              localNombre:
                requiresLocal
                  ? (
                    context.localNombre ||
                    ""
                  )
                  : "",

              localNumeroDocumento:
                requiresLocal
                  ? (
                    context.localNumeroDocumento ||
                    ""
                  )
                  : "",

              localUbicacion:
                requiresLocal
                  ? (
                    context.localUbicacion ||
                    ""
                  )
                  : "",

              localContribuyente:
                requiresLocal
                  ? (
                    context.localContribuyente ||
                    ""
                  )
                  : "",

              localTipoDocumento:
                requiresLocal
                  ? (
                    context.localTipoDocumento ||
                    ""
                  )
                  : "",

              localNIT:
                requiresLocal
                  ? (
                    context.localNIT ||
                    ""
                  )
                  : "",

              localNRC:
                requiresLocal
                  ? (
                    context.localNRC ||
                    ""
                  )
                  : ""
            };

            setStoredCurrentUser(
              currentUser
            );

            currentLocalContext = {
              id_local:
                currentUser.id_local,

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

            window.currentLocalContext =
              currentLocalContext;

            currentUserContextCache =
              {
                ...context,
                ...currentUser
              };

            currentUserContextUid =
              user.uid;

            setSessionContext(
              currentUserContextCache
            );

            await updateEmployeeAccess(
              currentUser.employeeId,
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

              id_local:
                requiresLocal
                  ? id_local
                  : "",

              localNombre:
                requiresLocal
                  ? currentUser.localNombre
                  : "",

              success:
                true,

              reason:
                "login_ok"
            });

            setLoading(
              true,
              "Preparando datos..."
            );

            /*
             * IMPORTANTE:
             *
             * Para Administrador y demás roles operativos:
             *
             * empleados -> solo su local
             *
             * Para Desarrollador:
             *
             * empleados -> todos
             */
            await preloadSessionData(
              user,
              {
                forceRefresh:
                  true
              }
            );

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
              500
            );
          } catch (
            error
          ) {
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
     * AUTH STATE GLOBAL
     * ========================================================
     */

    auth.onAuthStateChanged(
      async user => {
        const currentPage =
          getCurrentPageFile();

        if (
          !user
        ) {
          clearSessionDataCache();

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
            !resolved
          ) {
            return;
          }

          const role =
            getCanonicalRole(
              resolved.role ||
                resolved.position ||
                ""
            );

          await ensureSessionDataLoaded(
            user
          );

          const displayName =
            resolved.name ||
            "Usuario";

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

              return;
            }
          }
        } catch (
          err
        ) {
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

window.isDeveloperRole =
  isDeveloperRole;

window.roleRequiresLocal =
  roleRequiresLocal;

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

window.getCurrentUserContext =
  getCurrentUserContext;

window.ensureCurrentUserContext =
  ensureCurrentUserContext;

window.preloadSessionData =
  preloadSessionData;

window.ensureSessionDataLoaded =
  ensureSessionDataLoaded;

window.getSessionCollection =
  getSessionCollection;

window.getSessionCollectionData =
  getSessionCollectionData;

window.getSessionDocument =
  getSessionDocument;

window.setSessionCollection =
  setSessionCollection;

window.seedSessionCollection =
  seedSessionCollection;

window.upsertSessionDocument =
  upsertSessionDocument;

window.removeSessionDocument =
  removeSessionDocument;

window.updateSessionDocumentsWhere =
  updateSessionDocumentsWhere;

window.clearSessionDataCache =
  clearSessionDataCache;

window.getSessionCacheStatus =
  getSessionCacheStatus;

window.EMPLOYEE_COLLECTION_NAME =
  EMPLOYEE_COLLECTION_NAME;

window.LOCAL_COLLECTION_NAME =
  LOCAL_COLLECTION_NAME;

window.SUPPLIER_COLLECTION_NAME =
  SUPPLIER_COLLECTION_NAME;

window.SALES_COLLECTION_NAME =
  SALES_COLLECTION_NAME;

window.EXPENSES_COLLECTION_NAME =
  EXPENSES_COLLECTION_NAME;

window.MOVEMENTS_COLLECTION_NAME =
  MOVEMENTS_COLLECTION_NAME;

window.PRODUCTS_COLLECTION_NAME =
  PRODUCTS_COLLECTION_NAME;

window.CASH_CLOSE_COLLECTION_NAME =
  CASH_CLOSE_COLLECTION_NAME;

window.LOGIN_ATTEMPTS_COLLECTION_NAME =
  LOGIN_ATTEMPTS_COLLECTION_NAME;