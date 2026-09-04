// assets/js/app.js

import {
  router
} from "./router.js";


/*
 * ============================================================
 * ERRORES GLOBALES
 * ============================================================
 */

window.addEventListener(
  "error",
  event => {

    console.error(
      "ERROR GLOBAL:",
      event.error ||
      event.message
    );

  }
);


window.addEventListener(
  "unhandledrejection",
  event => {

    console.error(
      "PROMESA RECHAZADA:",
      event.reason
    );

  }
);


/*
 * ============================================================
 * FIREBASE
 * ============================================================
 */

if (
  typeof firebase === "undefined"
) {

  console.error(
    "Firebase no se ha cargado correctamente."
  );


  if (
    typeof Swal !== "undefined"
  ) {

    Swal.fire({

      icon:
        "error",

      title:
        "Error",

      text:
        "Firebase no se cargó. Revisa la conexión o los scripts."

    });

  }


  throw new Error(
    "Firebase no está disponible."
  );

} else {

  console.log(
    "Firebase cargado exitosamente."
  );

}


const firebaseConfig = {
  apiKey: "AIzaSyAMsdmYEeH_zOQfXj55SURnp1Nkk8mhj4M",
  authDomain: "inventario-y-venta.firebaseapp.com",
  databaseURL: "https://inventario-y-venta-default-rtdb.firebaseio.com",
  projectId: "inventario-y-venta",
  storageBucket: "inventario-y-venta.firebasestorage.app",
  messagingSenderId: "220141957917",
  appId: "1:220141957917:web:1af57bde6709dffdf327f4",
  measurementId: "G-ELPGSV8ZLP"
};


if (
  !firebase.apps.length
) {

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
 */

const SESSION_CACHE_KEY =
  "CONTROL_ACCESO_SESSION_CACHE";


const SESSION_CACHE_VERSION =
  4;


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
 */

const SESSION_PRELOAD_COLLECTIONS = [

  {
    name:
      EMPLOYEE_COLLECTION_NAME,

    mode:
      "employee-role-aware"
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

  {
    name:
      LOCAL_COLLECTION_NAME,

    mode:
      "developer-all"
  },

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
    getCanonicalRole(role) !==
    "Desarrollador"
  );

}


function isDeveloperRole(
  role = ""
) {

  return (
    getCanonicalRole(role) ===
    "Desarrollador"
  );

}


/*
 * ============================================================
 * PERMISOS
 * ============================================================
 */

function canManageExpensesForRole(
  role = ""
) {

  const canonical =
    getCanonicalRole(role);


  return [
    "Administrador",
    "Cajero",
    "Vendedor"
  ].includes(
    canonical
  );

}


function canEditInventoryForRole(
  role = ""
) {

  const canonical =
    getCanonicalRole(role);


  return [
    "Administrador",
    "Bodega",
    "Desarrollador"
  ].includes(
    canonical
  );

}


function canReduceStockForRole(
  role = ""
) {

  const canonical =
    getCanonicalRole(role);


  return [
    "Administrador",
    "Bodega",
    "Cajero",
    "Vendedor",
    "Desarrollador"
  ].includes(
    canonical
  );

}


function canCreateSalesForRole(
  role = ""
) {

  const canonical =
    getCanonicalRole(role);


  return [
    "Administrador",
    "Cajero",
    "Vendedor"
  ].includes(
    canonical
  );

}


function canManageOwnSaleForRole(
  role = ""
) {

  const canonical =
    getCanonicalRole(role);


  return [
    "Cajero",
    "Vendedor"
  ].includes(
    canonical
  );

}


function canCreateStockMovementForRole(
  role = ""
) {

  const canonical =
    getCanonicalRole(role);


  return [
    "Administrador",
    "Bodega",
    "Cajero",
    "Vendedor",
    "Desarrollador"
  ].includes(
    canonical
  );

}


/*
 * ============================================================
 * NAVEGACIÓN POR ROL
 * ============================================================
 */

const ROLE_NAV = {

  Administrador: [

    {
      label:
        "Inicio",

      href:
        "dashboard.html"
    },

    {
      label:
        "Inventario",

      href:
        "inventory.html"
    },

    {
      label:
        "Proveedores",

      href:
        "proveedores.html"
    },

    {
      label:
        "Ventas",

      href:
        "sales.html"
    },

    {
      label:
        "Gastos",

      href:
        "gastos.html"
    },

    {
      label:
        "Empleados",

      href:
        "employees.html"
    }

  ],


  Cajero: [

    {
      label:
        "Inicio",

      href:
        "dashboard.html"
    },

    {
      label:
        "Ventas",

      href:
        "sales.html"
    },

    {
      label:
        "Gastos",

      href:
        "gastos.html"
    }

  ],


  Vendedor: [

    {
      label:
        "Inicio",

      href:
        "dashboard.html"
    },

    {
      label:
        "Inventario",

      href:
        "inventory.html"
    },

    {
      label:
        "Ventas",

      href:
        "sales.html"
    },

    {
      label:
        "Gastos",

      href:
        "gastos.html"
    }

  ],


  Bodega: [

    {
      label:
        "Inicio",

      href:
        "dashboard.html"
    },

    {
      label:
        "Inventario",

      href:
        "inventory.html"
    },

    {
      label:
        "Proveedores",

      href:
        "proveedores.html"
    }

  ],


  Desarrollador: [

    {
      label:
        "Locales",

      href:
        "locales.html"
    }

  ]

};


const ROLE_DEFAULT_PAGE = {

  Administrador:
    "dashboard.html",

  Cajero:
    "sales.html",

  Vendedor:
    "sales.html",

  Bodega:
    "inventory.html",

  Desarrollador:
    "locales.html"

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
 * ROUTER SEGURO / MVC
 * ============================================================
 */

const PUBLIC_ROUTE_FILES = [

  "index.html",
  "login.html",
  "reset-password.html",
  "404.html"

];


const APP_ROUTE_REGISTRY =
  {};


const securePageControllers =
  [];


let secureRouteState = {

  settled:
    false,

  user:
    null,

  context:
    null,

  role:
    "",

  pageFile:
    "",

  authorized:
    false

};


/*
 * ============================================================
 * NAMESPACE MVC
 * ============================================================
 */

function ensureMvcNamespace() {

  window.InventoryMVC =
    window.InventoryMVC ||
    {};


  window.InventoryMVC.models =
    window.InventoryMVC.models ||
    {};


  window.InventoryMVC.views =
    window.InventoryMVC.views ||
    {};


  window.InventoryMVC.controllers =
    window.InventoryMVC.controllers ||
    {};


  return window.InventoryMVC;

}


/*
 * ============================================================
 * REGISTRO DE RUTAS
 * ============================================================
 */

function registerRoute(
  route = {}
) {

  const pageFile =
    String(
      route.page ||
      route.pageFile ||
      ""
    )
      .trim()
      .toLowerCase();


  if (!pageFile) {
    return null;
  }


  const roles =
    Array.isArray(route.roles)

      ? route.roles
        .map(getCanonicalRole)
        .filter(Boolean)

      : [];


  APP_ROUTE_REGISTRY[
    pageFile
  ] = {

    pageFile,

    public:
      route.public === true ||
      PUBLIC_ROUTE_FILES.includes(
        pageFile
      ),

    roles,

    requiresLocal:
      route.requiresLocal !== false &&
      pageFile !== "locales.html" &&
      !PUBLIC_ROUTE_FILES.includes(
        pageFile
      )

  };


  return APP_ROUTE_REGISTRY[
    pageFile
  ];

}


/*
 * ============================================================
 * REGISTRAR RUTAS POR ROL
 * ============================================================
 */

Object.entries(
  ROLE_ALLOWED_PAGES
).forEach(
  ([
    role,
    pages
  ]) => {

    pages.forEach(
      pageFile => {

        const key =
          String(pageFile)
            .trim()
            .toLowerCase();


        const existing =
          APP_ROUTE_REGISTRY[
          key
          ] ||
          {

            pageFile:
              key,

            public:
              false,

            roles:
              []

          };


        const canonicalRole =
          getCanonicalRole(
            role
          );


        if (

          canonicalRole &&

          !existing.roles.includes(
            canonicalRole
          )

        ) {

          existing.roles.push(
            canonicalRole
          );

        }


        existing.requiresLocal =
          key !== "locales.html";


        APP_ROUTE_REGISTRY[
          key
        ] =
          existing;

      }
    );

  }
);


/*
 * ============================================================
 * REGISTRAR RUTAS PÚBLICAS
 * ============================================================
 */

PUBLIC_ROUTE_FILES.forEach(
  pageFile => {

    registerRoute({

      page:
        pageFile,

      public:
        true,

      requiresLocal:
        false

    });

  }
);


/*
 * ============================================================
 * CONFIGURACIÓN DE RUTA
 * ============================================================
 */

function getRouteConfig(
  pageFile = getCurrentPageFile()
) {

  const key =
    String(pageFile || "")
      .trim()
      .toLowerCase();


  return (

    APP_ROUTE_REGISTRY[
    key
    ] ||

    {

      pageFile:
        key,

      public:
        false,

      roles:
        [],

      requiresLocal:
        true

    }

  );

}


function isPublicRoute(
  pageFile = getCurrentPageFile()
) {

  return (
    getRouteConfig(pageFile).public ===
    true
  );

}


/*
 * ============================================================
 * RUTAS / REDIRECCIONES
 * ============================================================
 */

function isRootLoginPage() {

  const pathname =
    window.location.pathname
      .replace(
        /\\/g,
        "/"
      )
      .toLowerCase();


  return (

    getCurrentPageFile() ===
    "index.html" &&

    !pathname.includes(
      "/public/"
    )

  );

}


function isPublicFolderPage() {

  return window.location.pathname

    .replace(
      /\\/g,
      "/"
    )

    .toLowerCase()

    .includes(
      "/public/"
    );

}


function getRouteHref(
  pageFile = ""
) {

  const target =
    String(
      pageFile || ""
    )
      .trim()
      .replace(
        /^public[\\/]/i,
        ""
      );


  if (!target) {
    return "";
  }


  if (

    target === "index.html" ||

    target === "login.html"

  ) {

    return isPublicFolderPage()
      ? "../index.html"
      : "index.html";

  }


  return isRootLoginPage()
    ? `public/${target}`
    : target;

}


function redirectToRoute(
  pageFile = ""
) {

  const href =
    getRouteHref(
      pageFile
    );


  if (href) {

    window.location.href =
      href;

  }

}


function redirectToLogin() {

  redirectToRoute(
    "index.html"
  );

}


/*
 * ============================================================
 * CONTROLADORES SEGUROS
 * ============================================================
 */

function normalizeControllerPage(
  controller = {}
) {

  return String(
    controller.page ||
    controller.pageFile ||
    ""
  )
    .trim()
    .toLowerCase();

}


function canControllerRun(
  controller,
  state
) {

  const pageFile =
    normalizeControllerPage(
      controller
    );


  if (

    pageFile &&

    pageFile !== state.pageFile

  ) {

    return false;

  }


  if (
    controller.public === true
  ) {

    return isPublicRoute(
      state.pageFile
    );

  }


  if (

    !state.authorized ||

    !state.user

  ) {

    return false;

  }


  const route =
    getRouteConfig(
      state.pageFile
    );


  const controllerRoles =
    Array.isArray(
      controller.roles
    )

      ? controller.roles
        .map(getCanonicalRole)
        .filter(Boolean)

      : [];


  const roles =
    controllerRoles.length
      ? controllerRoles
      : route.roles;


  if (!roles.length) {
    return true;
  }


  return roles.includes(
    getCanonicalRole(
      state.role
    )
  );

}


async function runRegisteredControllers() {

  const state = {
    ...secureRouteState
  };


  const controllersToRun =
    securePageControllers.filter(
      controller =>

        !controller.__hasRun &&

        canControllerRun(
          controller,
          state
        )

    );


  for (
    const controller of
    controllersToRun
  ) {

    controller.__hasRun =
      true;


    try {

      await controller.init(
        state.user,
        state.context,
        state
      );


    } catch (error) {

      controller.__hasRun =
        false;


      console.error(

        `[Router] Error inicializando ${controller.name ||
        controller.page ||
        "controlador"
        }:`,
        error

      );


      if (
        typeof Swal !== "undefined"
      ) {

        await Swal.fire({

          icon:
            "error",

          title:
            "No se pudo abrir la página",

          text:
            error.message ||
            "La validación de seguridad no permitió iniciar el módulo."

        });

      }


      if (
        !isPublicRoute(
          state.pageFile
        )
      ) {

        redirectToRoute(
          getDefaultPageForRole(
            state.role
          )
        );

      }

    }

  }

}


function registerSecurePageController(
  controller = {}
) {

  if (

    !controller ||

    typeof controller.init !==
    "function"

  ) {

    throw new Error(
      "El controlador seguro necesita una función init()."
    );

  }


  const pageFile =
    normalizeControllerPage(
      controller
    );


  const route =
    pageFile
      ? getRouteConfig(pageFile)
      : null;


  const normalizedController = {

    ...controller,

    page:
      pageFile,

    roles:

      Array.isArray(
        controller.roles
      )

        ? controller.roles

        : route?.roles || []

  };


  securePageControllers.push(
    normalizedController
  );


  /*
   * Si app.js ya terminó la autorización,
   * ejecutamos inmediatamente el controlador.
   */

  if (
    secureRouteState.settled
  ) {

    runRegisteredControllers()
      .catch(
        error => {

          console.error(

            "[Router] No se pudieron ejecutar los controladores registrados:",

            error

          );

        }
      );

  }


  return normalizedController;

}


function registerPublicPageController(
  controller = {}
) {

  return registerSecurePageController({

    ...controller,

    public:
      true,

    roles:
      []

  });

}


function setSecureRouteState(
  nextState = {}
) {

  secureRouteState = {

    ...secureRouteState,

    ...nextState,

    settled:
      true

  };

}


ensureMvcNamespace();


/*
 * ============================================================
 * CONTEXTO LOCAL
 * ============================================================
 */

let currentLocalContext = {

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
    ] ||

    [

      {
        label:
          "Inicio",

        href:
          "dashboard.html"
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


  const route =
    getRouteConfig(
      pageFile
    );


  if (
    route.public
  ) {

    return true;

  }


  if (
    route.roles?.length
  ) {

    return route.roles.includes(
      canonical
    );

  }


  const allowed =
    ROLE_ALLOWED_PAGES[
    canonical
    ] || [];


  return allowed.includes(
    String(
      pageFile
    )
      .trim()
      .toLowerCase()
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
      .querySelectorAll("a")
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


              if (fullscreenMenu) {

                fullscreenMenu.classList.remove(
                  "active"
                );


                fullscreenMenu.setAttribute(
                  "aria-hidden",
                  "true"
                );

              }


              if (menuToggle) {

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


/*
 * ============================================================
 * LOGOUT
 * ============================================================
 */

function bindLogoutButtons() {

  const logoutButtons = [

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

            clearSessionDataCache();


            currentUserContextCache =
              null;


            currentUserContextPromise =
              null;


            currentUserContextUid =
              "";


            currentLocalContext = {

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


            window.currentLocalContext =
              currentLocalContext;


            localStorage.removeItem(
              "currentUser"
            );


            await auth.signOut();

          } finally {

            window.location.href =
              "../index.html";

          }

        }
      );

    }
  );

}


/*
 * ============================================================
 * MENÚ MÓVIL
 * ============================================================
 */

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


        if (menuToggle) {

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
    Array.isArray(value)
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

          // ignore

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

      "No se pudo guardar toda la caché de sesión:",

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


    if (
      !raw
    ) {

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


      console.info(

        "[Sesión] Caché anterior invalidada por cambio de versión."

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


function isSessionCacheComplete(
  cache,
  role = ""
) {

  if (

    !cache ||

    !cache.context

  ) {

    return false;

  }


  const canonicalRole =
    getCanonicalRole(

      role ||

      cache.role ||

      cache.context.role ||

      cache.context.position ||

      ""

    );


  if (
    !canonicalRole
  ) {

    return false;

  }


  if (

    !cache.collections ||

    typeof cache.collections !==
    "object"

  ) {

    return false;

  }


  for (
    const config of
    SESSION_PRELOAD_COLLECTIONS
  ) {

    const entry =
      cache.collections[
      config.name
      ];


    if (

      !entry ||

      !Array.isArray(
        entry.docs
      )

    ) {

      return false;

    }


    if (
      entry.error
    ) {

      return false;

    }

  }


  return true;

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
      targetLocal
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
      targetLocal
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

      data: {

        ...(
          doc.data ||
          {}
        )

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

      data: {

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


  delete entry.error;


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

    complete:
      isSessionCacheComplete(
        cache,
        role
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

      Object.fromEntries(

        Object.entries(

          cache?.collections ||

          {}

        ).map(

          ([

            name,

            entry

          ]) => [

              name,

              {

                count:

                  Array.isArray(
                    entry?.docs
                  )

                    ? entry.docs.length

                    : 0,

                error:
                  entry?.error ||
                  null

              }

            ]

        )

      )

  };

}


/*
 * ============================================================
 * CONTEXTO LOCAL
 * ============================================================
 */

function getCurrentLocalId() {

  const context =

    currentUserContextCache ||

    sessionDataCache?.context ||

    null;


  const role =
    getCanonicalRole(

      context?.role ||

      context?.position ||

      sessionDataCache?.role ||

      ""

    );


  if (
    isDeveloperRole(
      role
    )
  ) {

    return "";

  }


  return String(

    context?.id_local ||

    sessionDataCache?.id_local ||

    currentLocalContext.id_local ||

    ""

  ).trim();

}


function getCurrentLocalInfo() {

  const context =

    currentUserContextCache ||

    sessionDataCache?.context ||

    null;


  const role =
    getCanonicalRole(

      context?.role ||

      context?.position ||

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

        context?.id_local ||

        currentLocalContext.id_local ||

        sessionDataCache?.id_local ||

        ""

      ).trim(),

    nombre:

      String(

        context?.localNombre ||

        currentLocalContext.nombre ||

        ""

      ).trim(),

    numeroDocumento:

      String(

        context?.localNumeroDocumento ||

        currentLocalContext.numeroDocumento ||

        ""

      ).trim(),

    ubicacion:

      String(

        context?.localUbicacion ||

        currentLocalContext.ubicacion ||

        ""

      ).trim(),

    contribuyente:

      String(

        context?.localContribuyente ||

        currentLocalContext.contribuyente ||

        ""

      ).trim(),

    tipoDocumento:

      String(

        context?.localTipoDocumento ||

        currentLocalContext.tipoDocumento ||

        ""

      ).trim(),

    nit:

      String(

        context?.localNIT ||

        currentLocalContext.nit ||

        ""

      ).trim(),

    nrc:

      String(

        context?.localNRC ||

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

        ...(

          direct.data() ||

          {}

        )

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
        byField.docs[
        0
        ];


      return {

        id:
          doc.id,

        ...(

          doc.data() ||

          {}

        )

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

        ...(

          direct.data() ||

          {}

        )

      };

    }

  } catch (
  error
  ) {

    console.warn(

      "No se pudo cargar el empleado por UID:",

      error

    );


    throw error;

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


  if (

    !forceRefresh &&

    currentUserContextCache &&

    currentUserContextUid ===
    user.uid

  ) {

    return currentUserContextCache;

  }


  if (

    currentUserContextPromise &&

    currentUserContextUid ===
    user.uid &&

    !forceRefresh

  ) {

    return currentUserContextPromise;

  }


  currentUserContextUid =
    user.uid;


  currentUserContextPromise =
    (async () => {

      const employee =
        await loadEmployeeByUser(
          user
        );


      if (
        !employee
      ) {

        throw new Error(

          "No existe el documento de perfil para el UID autenticado."

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


      const id_local =
        String(

          employee.id_local ||

          ""

        ).trim();


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
          "",

        numeroDocumento:
          employee.localNumeroDocumento ||
          "",

        ubicacion:
          employee.localUbicacion ||
          "",

        contribuyente:

          employee.localNombreContribuyente ||

          employee.localContribuyente ||

          "",

        tipoDocumento:
          employee.localTipoDocumento ||
          "",

        nit:
          employee.localNIT ||
          "",

        nrc:
          employee.localNRC ||
          "",

        blocked:

          employee.localBlocked ===
          true ||

          employee.localBloqueado ===
          true

      };


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


  if (
    config.mode ===
    "employee-role-aware"
  ) {

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


    if (

      canonicalRole ===
      "Administrador" ||

      canonicalRole ===
      "Bodega"

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


    return {

      name:
        config.name,

      documents:
        []

    };

  }


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


    console.log(

      `[Sesión] Consulta ${config.name}: local=${targetLocalId}, encontrados=${documents.length}`

    );


    return {

      name:
        config.name,

      documents

    };

  }


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


  if (

    requiresLocal &&

    !localId

  ) {

    throw new Error(

      "El usuario autenticado no tiene un id_local válido."

    );

  }


  if (
    !forceRefresh
  ) {

    const restored =
      loadSessionDataCache(
        user.uid
      );


    if (
      restored
    ) {

      const restoredRole =
        getCanonicalRole(

          restored.role ||

          restored.context?.role ||

          restored.context?.position ||

          ""

        );


      const restoredLocal =
        String(

          restored.id_local ||

          restored.context?.id_local ||

          ""

        ).trim();


      const currentContextLocal =

        requiresLocal

          ? localId

          : "";


      const sameContext =

        restoredRole ===
        canonicalRole &&

        restoredLocal ===
        currentContextLocal;


      const complete =
        isSessionCacheComplete(

          restored,

          canonicalRole

        );


      console.log(

        "[Sesión] Validación de caché restaurada:",

        {

          sameContext,

          complete,

          role:
            restoredRole,

          local:
            restoredLocal,

          expectedRole:
            canonicalRole,

          expectedLocal:
            currentContextLocal

        }

      );


      if (

        sameContext &&

        complete

      ) {

        sessionDataCache =
          restored;


        sessionDataCacheUid =
          user.uid;


        restored.role =
          restoredRole;


        restored.id_local =
          currentContextLocal;


        console.log(

          "[Sesión] Caché restaurada correctamente."

        );


        return sessionDataCache;

      }


      console.warn(

        "[Sesión] La caché anterior está incompleta o no coincide con el contexto actual. Se reconstruirá."

      );


      clearSessionDataCache();

    }

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


  cache.collections =
    {};


  cache.updatedAt =
    Date.now();


  sessionDataCacheUid =
    user.uid;


  if (
    sessionDataCachePromise
  ) {

    return sessionDataCachePromise;

  }


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


      let preloadErrors =
        0;


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

            preloadErrors +=
              1;


            const errorMessage =

              result.reason?.message ||

              String(

                result.reason ||

                ""

              );


            console.error(

              `[Sesión] ERROR precargando ${config.name}:`,

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
                errorMessage

            };

          }

        }

      );


      cache.updatedAt =
        Date.now();


      cache.id_local =

        requiresLocal

          ? localId

          : "";


      saveSessionDataCache();


      const status =
        getSessionCacheStatus(
          user.uid
        );


      console.log(

        "[Sesión] Caché de sesión preparada:",

        status

      );


      if (
        preloadErrors >
        0
      ) {

        console.error(

          `[Sesión] La precarga terminó con ${preloadErrors} error(es).`

        );

      }


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


  await getCurrentUserContext(
    user
  );


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

  redirectToRoute(

    getDefaultPageForRole(
      role
    )

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

      date.getMonth() +
      1

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

  localId =
    getCurrentLocalId()

) {

  if (

    isDeveloperRole(

      currentUserContextCache?.role ||

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

    const user =
      auth.currentUser;


    if (
      !user
    ) {

      return;

    }


    if (

      payload.uid &&

      payload.uid !==
      user.uid

    ) {

      console.warn(

        "Intento de registrar auditoría con UID diferente al autenticado."

      );


      return;

    }


    const firestorePayload = {

      email:

        payload.email ||

        user.email ||

        "",

      uid:
        user.uid,

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

        ...firestorePayload,

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
        result.value.trim();


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


          case "auth/network-request-failed":

            mensaje =
              "No se pudo conectar con Firebase. Revisa tu conexión.";

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


            currentUserContextCache =
              null;


            currentUserContextPromise =
              null;


            currentUserContextUid =
              "";


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

              await auth.signOut();


              throw new Error(

                "El usuario no tiene perfil en la base de datos."

              );

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


              throw new Error(

                "El usuario no tiene un rol válido configurado."

              );

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

                "Tu usuario está bloqueado o desactivado."

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

                Number(

                  context.failedLoginAttempts ||

                  0

                ) || 0,

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


            currentUserContextCache = {

              ...context,

              ...currentUser

            };


            currentUserContextUid =
              user.uid;


            setSessionContext(
              currentUserContextCache
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


            currentUserContextCache =
              null;


            currentUserContextPromise =
              null;


            currentUserContextUid =
              "";


            clearSessionDataCache();


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
                  "No se pudo validar el usuario.";

                break;


              case "auth/wrong-password":

                mensajeError =
                  "La contraseña es incorrecta.";

                break;


              case "auth/invalid-credential":

                mensajeError =
                  "El correo o la contraseña son incorrectos.";

                break;


              case "auth/invalid-email":

                mensajeError =
                  "El formato del correo no es válido.";

                break;


              case "auth/user-disabled":

                mensajeError =
                  "La cuenta ha sido deshabilitada.";

                break;


              case "auth/network-request-failed":

                mensajeError =
                  "No se pudo conectar con Firebase. Revisa tu conexión.";

                break;


              case "auth/too-many-requests":

                mensajeError =
                  "Se realizaron demasiados intentos. Intenta nuevamente más tarde.";

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
     * ==========================================================
     * AUTH STATE GLOBAL
     * ==========================================================
     */

    auth.onAuthStateChanged(

      async user => {

        const currentPage =
          getCurrentPageFile();


        const currentRoute =
          getRouteConfig(

            currentPage

          );


        if (
          !user
        ) {

          clearSessionDataCache();


          currentUserContextCache =
            null;


          currentUserContextPromise =
            null;


          currentUserContextUid =
            "";


          currentLocalContext = {

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


          window.currentLocalContext =
            currentLocalContext;


          if (
            currentRoute.public
          ) {

            setSecureRouteState({

              user:
                null,

              context:
                null,

              role:
                "",

              pageFile:
                currentPage,

              authorized:
                true

            });


            await runRegisteredControllers();


            return;

          }


          setSecureRouteState({

            user:
              null,

            context:
              null,

            role:
              "",

            pageFile:
              currentPage,

            authorized:
              false

          });


          redirectToLogin();


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

            throw new Error(

              "No se pudo resolver el perfil autenticado."

            );

          }


          const role =
            getCanonicalRole(

              resolved.role ||

              resolved.position ||

              ""

            );


          if (
            !role
          ) {

            throw new Error(

              "El usuario autenticado no tiene un rol válido."

            );

          }


          if (

            resolved.blocked ===
            true ||

            resolved.active ===
            false ||

            resolved.localBlocked ===
            true

          ) {

            await auth.signOut();


            clearSessionDataCache();


            throw new Error(

              "La cuenta o el local asociado no se encuentra habilitado."

            );

          }


          if (

            currentRoute.requiresLocal &&

            roleRequiresLocal(
              role
            ) &&

            !String(

              resolved.id_local ||

              ""

            ).trim()

          ) {

            throw new Error(

              "El usuario autenticado no tiene un local asignado."

            );

          }


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
            currentRoute.public
          ) {

            if (

              currentPage ===
              "index.html" ||

              currentPage ===
              "login.html"

            ) {

              redirectAccordingToRole(
                role
              );


              return;

            }


            setSecureRouteState({

              user,

              context:
                resolved,

              role,

              pageFile:
                currentPage,

              authorized:
                true

            });


            await runRegisteredControllers();


            return;

          }


          if (

            !canAccessPage(

              role,

              currentPage

            )

          ) {

            setSecureRouteState({

              user,

              context:
                resolved,

              role,

              pageFile:
                currentPage,

              authorized:
                false

            });


            redirectToRoute(

              getDefaultPageForRole(
                role
              )

            );


            return;

          }


          setSecureRouteState({

            user,

            context:
              resolved,

            role,

            pageFile:
              currentPage,

            authorized:
              true

          });


          await runRegisteredControllers();


        } catch (
        err
        ) {

          console.error(

            "Error resolviendo contexto del usuario:",

            err

          );


          currentUserContextCache =
            null;


          currentUserContextPromise =
            null;


          currentUserContextUid =
            "";


          clearSessionDataCache();


          try {

            await auth.signOut();

          } catch {

            // ignore

          }


          if (

            isPublicRoute(

              currentPage

            )

          ) {

            setSecureRouteState({

              user:
                null,

              context:
                null,

              role:
                "",

              pageFile:
                currentPage,

              authorized:
                true

            });


            await runRegisteredControllers();


            return;

          }


          setSecureRouteState({

            user:
              null,

            context:
              null,

            role:
              "",

            pageFile:
              currentPage,

            authorized:
              false

          });


          redirectToLogin();

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


window.canManageExpensesForRole =
  canManageExpensesForRole;


window.canEditInventoryForRole =
  canEditInventoryForRole;


window.canReduceStockForRole =
  canReduceStockForRole;


window.canCreateSalesForRole =
  canCreateSalesForRole;


window.canManageOwnSaleForRole =
  canManageOwnSaleForRole;


window.canCreateStockMovementForRole =
  canCreateStockMovementForRole;


window.AppRouter = {

  registerRoute,

  registerSecurePageController,

  registerPublicPageController,

  getRouteConfig,

  isPublicRoute,

  canAccessPage,

  getRouteHref,

  redirectToRoute,

  redirectToLogin,

  redirectAccordingToRole

};


window.InventoryMVC =
  ensureMvcNamespace();


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


window.getSessionContext =
  getSessionContext;


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


/*
 * ============================================================
 * ARRANQUE DEL ROUTER MVC
 * ============================================================
 *
 * Este patrón sigue el app.js que confirmaste que funciona.
 *
 * app.js:
 *
 * - Inicializa Firebase.
 * - Inicializa Auth/Firestore.
 * - Resuelve sesión, rol y local.
 * - Expone AppRouter.
 *
 * router.js:
 *
 * - Detecta la página.
 * - Carga dinámicamente el controller.
 * - Registra el controller.
 *
 * La autorización continúa siendo responsabilidad de app.js.
 * ============================================================
 */


/*
 * ------------------------------------------------------------
 * Ejecución segura del router
 * ------------------------------------------------------------
 */

function safeRouter() {

  router()
    .catch(
      error => {

        console.error(

          "Error no controlado en router:",

          error

        );

      }
    );

}


/*
 * ------------------------------------------------------------
 * Arranque
 * ------------------------------------------------------------
 *
 * Exactamente una ejecución cuando DOMContentLoaded sucede.
 * ------------------------------------------------------------
 */

if (
  document.readyState ===
  "loading"
) {

  window.addEventListener(

    "DOMContentLoaded",

    safeRouter,

    {
      once:
        true
    }

  );

} else {

  safeRouter();

}


/*
 * ------------------------------------------------------------
 * Navegación por hash
 * ------------------------------------------------------------
 *
 * Se conserva para mantener compatibilidad con navegación
 * basada en hash en caso de que algún módulo la utilice.
 * ------------------------------------------------------------
 */

window.addEventListener(
  "hashchange",
  safeRouter
);