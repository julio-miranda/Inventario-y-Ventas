"use strict";

/*
 * ============================================================
 * ROUTER MVC
 * ============================================================
 *
 * Responsabilidad:
 *
 * - Detectar la página actual.
 * - Cargar dinámicamente su controlador MVC.
 * - Resolver diferentes formas de exportación del controller.
 * - Validar que el controller corresponda a la página.
 * - Registrar el controller mediante AppRouter.
 *
 * La autorización real continúa en app.js.
 * Este archivo NO sustituye el control de acceso.
 * ============================================================
 */


/*
 * ============================================================
 * ESTADO DEL ROUTER
 * ============================================================
 */

let navigationToken = 0;

const registeredControllers =
    new Set();


/*
 * ============================================================
 * RUTAS MVC
 * ============================================================
 *
 * Cada ruta define exclusivamente cómo localizar su módulo.
 *
 * ============================================================
 */

const routes = Object.freeze({

    "dashboard.html": {

        modulePath:
            "./controllers/dashboard.controller.js"

    },


    "inventory.html": {

        modulePath:
            "./controllers/inventory.controller.js"

    },


    "proveedores.html": {

        modulePath:
            "./controllers/proveedores.controller.js"

    },


    "sales.html": {

        modulePath:
            "./controllers/sales.controller.js"

    },


    "gastos.html": {

        modulePath:
            "./controllers/gastos.controller.js"

    },


    "employees.html": {

        modulePath:
            "./controllers/employees.controller.js"

    },


    /*
     * ========================================================
     * LOCALES
     * ========================================================
     *
     * IMPORTANTE:
     *
     * El archivo correcto es:
     *
     * assets/js/controllers/locals.controller.js
     *
     * No:
     *
     * assets/controllers/js/locals.controller.js
     *
     * ========================================================
     */

    "locales.html": {

        modulePath:
            "./controllers/locals.controller.js"

    }

});


/*
 * ============================================================
 * PÁGINA ACTUAL
 * ============================================================
 */

function getCurrentPageFile() {

    const pathname =
        window.location.pathname
            .replace(
                /\\/g,
                "/"
            );


    const file =
        pathname
            .split("/")
            .pop()
            .toLowerCase();


    return (
        file ||
        "index.html"
    );

}


/*
 * ============================================================
 * NORMALIZACIÓN
 * ============================================================
 */

function normalizePage(
    value = ""
) {

    return String(
        value || ""
    )
        .trim()
        .replace(
            /\\/g,
            "/"
        )
        .split("/")
        .pop()
        .toLowerCase();

}


/*
 * ============================================================
 * ESPERAR A APP.JS
 * ============================================================
 */

async function waitForAppRouter(
    timeout = 10000
) {

    const started =
        Date.now();


    while (
        Date.now() - started < timeout
    ) {

        if (

            window.AppRouter &&

            typeof window.AppRouter
                .registerSecurePageController ===
            "function"

        ) {

            return true;

        }


        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    25
                )
        );

    }


    return false;

}


/*
 * ============================================================
 * OBTENER CONTROLLERS GLOBALES
 * ============================================================
 */

function getGlobalControllerCandidates(
    page
) {

    const candidates = [];


    const mvc =
        window.InventoryMVC;


    if (
        mvc &&
        mvc.controllers
    ) {

        const controllers =
            mvc.controllers;


        /*
         * inventory
         */

        if (
            page ===
            "inventory.html"
        ) {

            candidates.push(

                controllers.inventory,

                controllers.inventoryController,

                controllers.InventoryController

            );

        }


        /*
         * dashboard
         */

        if (
            page ===
            "dashboard.html"
        ) {

            candidates.push(

                controllers.dashboard,

                controllers.dashboardController,

                controllers.DashboardController

            );

        }


        /*
         * proveedores
         */

        if (
            page ===
            "proveedores.html"
        ) {

            candidates.push(

                controllers.proveedores,

                controllers.proveedoresController,

                controllers.ProveedoresController,

                controllers.suppliers,

                controllers.SuppliersController

            );

        }


        /*
         * sales
         */

        if (
            page ===
            "sales.html"
        ) {

            candidates.push(

                controllers.sales,

                controllers.salesController,

                controllers.SalesController

            );

        }


        /*
         * gastos
         */

        if (
            page ===
            "gastos.html"
        ) {

            candidates.push(

                controllers.gastos,

                controllers.gastosController,

                controllers.GastosController

            );

        }


        /*
         * employees
         */

        if (
            page ===
            "employees.html"
        ) {

            candidates.push(

                controllers.employees,

                controllers.employeesController,

                controllers.EmployeesController

            );

        }


        /*
         * locales
         */

        if (
            page ===
            "locales.html"
        ) {

            candidates.push(

                controllers.locales,

                controllers.localesController,

                controllers.LocalesController,

                controllers.locals,

                controllers.localsController,

                controllers.LocalsController

            );

        }

    }


    return candidates.filter(
        Boolean
    );

}


/*
 * ============================================================
 * RESOLVER DE CONTROLLER
 * ============================================================
 */

function resolveControllerFromModule(
    module,
    page
) {

    if (
        !module
    ) {

        return null;

    }


    /*
     * --------------------------------------------------------
     * 1. export default
     * --------------------------------------------------------
     */

    if (
        module.default &&
        typeof module.default.init ===
        "function"
    ) {

        return module.default;

    }


    /*
     * --------------------------------------------------------
     * 2. export { controller }
     * --------------------------------------------------------
     */

    if (
        module.controller &&
        typeof module.controller.init ===
        "function"
    ) {

        return module.controller;

    }


    /*
     * --------------------------------------------------------
     * 3. exportaciones habituales
     * --------------------------------------------------------
     */

    const knownNames = [

        "inventoryController",
        "InventoryController",

        "dashboardController",
        "DashboardController",

        "proveedoresController",
        "ProveedoresController",

        "salesController",
        "SalesController",

        "gastosController",
        "GastosController",

        "employeesController",
        "EmployeesController",

        "localesController",
        "LocalesController",

        "localsController",
        "LocalsController"

    ];


    for (
        const name of knownNames
    ) {

        const candidate =
            module[name];


        if (

            candidate &&

            typeof candidate.init ===
            "function"

        ) {

            return candidate;

        }

    }


    /*
     * --------------------------------------------------------
     * 4. Buscar cualquier exportación que sea controller
     * --------------------------------------------------------
     */

    for (
        const value of
        Object.values(module)
    ) {

        if (

            value &&

            typeof value ===
            "object" &&

            typeof value.init ===
            "function"

        ) {

            return value;

        }

    }


    /*
     * --------------------------------------------------------
     * 5. Buscar en InventoryMVC.controllers
     * --------------------------------------------------------
     */

    const globalCandidates =
        getGlobalControllerCandidates(
            page
        );


    for (
        const candidate of
        globalCandidates
    ) {

        if (

            candidate &&

            typeof candidate.init ===
            "function"

        ) {

            return candidate;

        }

    }


    return null;

}


/*
 * ============================================================
 * CARGAR CONTROLLER
 * ============================================================
 */

async function loadControllerForPage(
    page
) {

    const route =
        routes[page];


    if (
        !route
    ) {

        return null;

    }


    if (
        !route.modulePath
    ) {

        throw new Error(

            `La ruta "${page}" no tiene modulePath configurado.`

        );

    }


    let module;


    try {

        module =
            await import(
                route.modulePath
            );

    } catch (
        error
    ) {

        console.error(

            `[Router] Error importando el módulo de "${page}":`,

            error

        );


        throw new Error(

            `No se pudo importar el controlador de "${page}". ` +
            `${error.message || error}`

        );

    }


    const controller =
        resolveControllerFromModule(
            module,
            page
        );


    if (
        controller
    ) {

        return controller;

    }


    const exportedKeys =
        Object.keys(
            module || {}
        );


    throw new Error(

        `No se encontró un controlador válido para "${page}". ` +

        `El módulo debe exportar un objeto con init(). ` +

        `Exportaciones encontradas: ` +

        (

            exportedKeys.length

                ? exportedKeys.join(
                    ", "
                )

                : "ninguna"

        )

    );

}


/*
 * ============================================================
 * NORMALIZAR CONTROLLER
 * ============================================================
 */

function normalizeController(
    controller,
    page
) {

    if (
        !controller
    ) {

        return null;

    }


    if (

        typeof controller !==
        "object"

    ) {

        return null;

    }


    if (

        typeof controller.init !==
        "function"

    ) {

        return null;

    }


    const declaredPage =
        normalizePage(

            controller.page ||

            controller.pageFile ||

            ""

        );


    const normalizedPage =
        declaredPage ||
        page;


    if (
        declaredPage &&
        declaredPage !== page
    ) {

        throw new Error(

            `El controlador "${controller.name || "controller"}" ` +

            `declara la página "${declaredPage}", ` +

            `pero se está cargando para "${page}".`

        );

    }


    const normalized = {

        ...controller,

        page:
            normalizedPage,

        pageFile:
            normalizedPage,

        name:

            String(

                controller.name ||

                normalizedPage
                    .replace(
                        ".html",
                        ""
                    )

            ).trim()

    };


    return normalized;

}


/*
 * ============================================================
 * VALIDAR CONTROLLER
 * ============================================================
 */

function validateControllerForPage(
    controller,
    page
) {

    if (
        !controller
    ) {

        throw new Error(

            `No se encontró un controlador válido para "${page}".`

        );

    }


    if (

        typeof controller.init !==
        "function"

    ) {

        throw new Error(

            `El controlador de "${page}" no contiene una función init().`

        );

    }


    const controllerPage =
        normalizePage(

            controller.page ||

            controller.pageFile ||

            ""

        );


    if (
        !controllerPage
    ) {

        return true;

    }


    if (
        controllerPage !== page
    ) {

        throw new Error(

            `El controlador declara la página "${controllerPage}", ` +

            `pero se está cargando para "${page}".`

        );

    }


    return true;

}


/*
 * ============================================================
 * REGISTRAR CONTROLLER
 * ============================================================
 */

function registerController(
    controller,
    page
) {

    if (

        !window.AppRouter ||

        typeof window.AppRouter
            .registerSecurePageController !==
        "function"

    ) {

        throw new Error(

            "AppRouter.registerSecurePageController() no está disponible."

        );

    }


    const normalizedController =
        normalizeController(
            controller,
            page
        );


    validateControllerForPage(

        normalizedController,

        page

    );


    const controllerName =
        String(

            normalizedController.name ||

            page

        )
            .trim();


    const controllerKey =
        `${page}::${controllerName}`;


    if (
        registeredControllers.has(
            controllerKey
        )
    ) {

        console.log(

            `[Router] Controller ya registrado: ${controllerKey}`

        );


        return normalizedController;

    }


    registeredControllers.add(
        controllerKey
    );


    const registered =
        window.AppRouter
            .registerSecurePageController(
                normalizedController
            );


    console.log(

        `[Router] Controller registrado correctamente: ${controllerKey}`

    );


    return (
        registered ||
        normalizedController
    );

}


/*
 * ============================================================
 * ROUTER PRINCIPAL
 * ============================================================
 */

export async function router() {

    const token =
        ++navigationToken;


    try {

        const page =
            getCurrentPageFile();


        console.log(

            `[Router] Iniciando navegación para: ${page}`

        );


        const route =
            routes[page];


        if (
            !route
        ) {

            console.log(

                `[Router] "${page}" no requiere controlador MVC.`

            );


            return;

        }


        const ready =
            await waitForAppRouter();


        if (
            !ready
        ) {

            throw new Error(

                "app.js no expuso AppRouter."

            );

        }


        if (
            token !== navigationToken
        ) {

            console.log(

                `[Router] Navegación cancelada para "${page}".`

            );


            return;

        }


        const controller =
            await loadControllerForPage(
                page
            );


        if (
            token !== navigationToken
        ) {

            console.log(

                `[Router] Navegación descartada después de cargar "${page}".`

            );


            return;

        }


        validateControllerForPage(

            controller,

            page

        );


        const normalizedController =
            normalizeController(

                controller,

                page

            );


        registerController(

            normalizedController,

            page

        );


        console.log(

            `[Router] Módulo MVC preparado correctamente: ${page}`

        );


    } catch (
        error
    ) {

        console.error(

            "[Router] Error cargando módulo:",

            error

        );


        throw error;

    }

}


/*
 * ============================================================
 * EXPORTACIONES
 * ============================================================
 */

export {

    routes,

    getCurrentPageFile,

    loadControllerForPage,

    validateControllerForPage,

    normalizeController

};