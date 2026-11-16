import { getCanonicalRole, ROLE_ALLOWED_PAGES, getDefaultPageForRole } from "../security/roles.js";
import { getCurrentPageFile } from "../utils/page.js";

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

export function ensureMvcNamespace() {

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

export function registerRoute(
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

export function getRouteConfig(
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


export function isPublicRoute(
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

export function isRootLoginPage() {

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


export function isPublicFolderPage() {

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


export function getRouteHref(
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


export function redirectToRoute(
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


export function redirectToLogin() {

  redirectToRoute(
    "index.html"
  );

}


/*
 * ============================================================
 * CONTROLADORES SEGUROS
 * ============================================================
 */

export function normalizeControllerPage(
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


export function canControllerRun(
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


export async function runRegisteredControllers() {

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


export function registerSecurePageController(
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


  const normalizedName =
    String(
      normalizedController.name ||
      pageFile
    )
      .trim()
      .toLowerCase();

  const existingController =
    securePageControllers.find(
      current =>
        normalizeControllerPage(current) ===
          pageFile &&
        String(
          current.name ||
          pageFile
        )
          .trim()
          .toLowerCase() ===
          normalizedName
    );

  if (existingController) {
    return existingController;
  }


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


export function registerPublicPageController(
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


export function setSecureRouteState(
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
