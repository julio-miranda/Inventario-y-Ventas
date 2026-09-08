// assets/js/router.js

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
 * - Resolver export default.
 * - Resolver export { controller }.
 * - Resolver exportaciones conocidas.
 * - Resolver controllers globales.
 * - Crear adapters de compatibilidad cuando sea necesario.
 * - Validar que el controller corresponda a la página.
 * - Registrar el controller mediante AppRouter.
 *
 * La autorización real continúa en app.js.
 *
 * ============================================================
 */


/*
 * ============================================================
 * ESTADO DEL ROUTER
 * ============================================================
 */

let navigationToken =
    0;


const registeredControllers =
    new Set();


/*
 * ============================================================
 * RUTAS MVC
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

        Date.now() -
        started <
        timeout

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

    const candidates =
        [];


    const mvc =
        window.InventoryMVC;


    if (

        !mvc ||

        !mvc.controllers

    ) {

        return candidates;

    }


    const controllers =
        mvc.controllers;


    /*
     * --------------------------------------------------------
     * INVENTORY
     * --------------------------------------------------------
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
     * --------------------------------------------------------
     * DASHBOARD
     * --------------------------------------------------------
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
     * --------------------------------------------------------
     * PROVEEDORES
     * --------------------------------------------------------
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
     * --------------------------------------------------------
     * SALES
     * --------------------------------------------------------
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
     * --------------------------------------------------------
     * GASTOS
     * --------------------------------------------------------
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
     * --------------------------------------------------------
     * EMPLOYEES
     * --------------------------------------------------------
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
     * --------------------------------------------------------
     * LOCALES
     * --------------------------------------------------------
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


    return candidates.filter(
        Boolean
    );

}


/*
 * ============================================================
 * ADAPTERS DE COMPATIBILIDAD
 * ============================================================
 *
 * Permiten continuar trabajando si un módulo antiguo todavía
 * no exporta un controller ES correctamente.
 * ============================================================
 */

function createCompatibilityController(
    page
) {

    /*
     * --------------------------------------------------------
     * PROVEEDORES
     * --------------------------------------------------------
     *
     * Si proveedores.js ya expuso proveedoresAPI, podemos crear
     * un controller MVC válido sin depender de una exportación
     * ES del archivo controller.
     * --------------------------------------------------------
     */

    if (
        page ===
        "proveedores.html"
    ) {

        const api =
            window.proveedoresAPI;


        if (

            api &&

            typeof api.initialize ===
            "function"

        ) {

            return {

                name:
                    "proveedores",

                page:
                    "proveedores.html",

                roles: [

                    "Administrador",

                    "Bodega"

                ],

                init:
                    api.initialize

            };

        }

    }


    /*
     * --------------------------------------------------------
     * INVENTARIO
     * --------------------------------------------------------
     */

    if (
        page ===
        "inventory.html"
    ) {

        const controller =
            window.InventoryMVC
                ?.controllers
                ?.inventory;


        if (

            controller &&

            typeof controller.init ===
            "function"

        ) {

            return controller;

        }

    }


    /*
     * --------------------------------------------------------
     * DASHBOARD
     * --------------------------------------------------------
     */

    if (
        page ===
        "dashboard.html"
    ) {

        const controller =
            window.InventoryMVC
                ?.controllers
                ?.dashboard;


        if (

            controller &&

            typeof controller.init ===
            "function"

        ) {

            return controller;

        }

    }


    /*
     * --------------------------------------------------------
     * SALES
     * --------------------------------------------------------
     */

    if (
        page ===
        "sales.html"
    ) {

        const controller =
            window.InventoryMVC
                ?.controllers
                ?.sales;


        if (

            controller &&

            typeof controller.init ===
            "function"

        ) {

            return controller;

        }

    }


    /*
     * --------------------------------------------------------
     * GASTOS
     * --------------------------------------------------------
     */

    if (
        page ===
        "gastos.html"
    ) {

        const controller =
            window.InventoryMVC
                ?.controllers
                ?.gastos;


        if (

            controller &&

            typeof controller.init ===
            "function"

        ) {

            return controller;

        }

    }


    /*
     * --------------------------------------------------------
     * EMPLOYEES
     * --------------------------------------------------------
     */

    if (
        page ===
        "employees.html"
    ) {

        const controller =
            window.InventoryMVC
                ?.controllers
                ?.employees;


        if (

            controller &&

            typeof controller.init ===
            "function"

        ) {

            return controller;

        }

    }


    /*
     * --------------------------------------------------------
     * LOCALES
     * --------------------------------------------------------
     */

    if (
        page ===
        "locales.html"
    ) {

        const controller =
            window.InventoryMVC
                ?.controllers
                ?.locales;


        if (

            controller &&

            typeof controller.init ===
            "function"

        ) {

            return controller;

        }


        const localsController =
            window.InventoryMVC
                ?.controllers
                ?.locals;


        if (

            localsController &&

            typeof localsController.init ===
            "function"

        ) {

            return localsController;

        }

    }


    return null;

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

    /*
     * --------------------------------------------------------
     * Validación inicial
     * --------------------------------------------------------
     */

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
     * 3. Exportaciones conocidas
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
        const name of
        knownNames
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
     * 4. Buscar cualquier exportación válida
     * --------------------------------------------------------
     */

    for (
        const value of
        Object.values(
            module
        )
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
     * 5. Buscar controller global
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


    /*
     * --------------------------------------------------------
     * 6. Adapter de compatibilidad
     * --------------------------------------------------------
     */

    const compatibilityController =
        createCompatibilityController(
            page
        );


    if (
        compatibilityController
    ) {

        console.warn(

            `[Router] Utilizando controller de compatibilidad para "${page}".`

        );


        return compatibilityController;

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


        /*
         * Intentamos utilizar un controller global ya cargado
         * por compatibilidad antes de considerar que la ruta
         * no puede iniciar.
         */

        const compatibilityController =
            createCompatibilityController(
                page
            );


        if (
            compatibilityController
        ) {

            console.warn(

                `[Router] Se utilizará el controller de compatibilidad para "${page}" después de fallar la importación.`

            );


            return compatibilityController;

        }


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


    /*
     * Incluso si el módulo no exportó nada, hacemos una última
     * revisión del namespace global.
     */

    const globalFallback =
        createCompatibilityController(
            page
        );


    if (
        globalFallback
    ) {

        return globalFallback;

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


    const normalizedRoles =

        Array.isArray(
            controller.roles
        )

            ? controller.roles
                .filter(Boolean)

            : [];


    const normalized = {

        ...controller,

        page:
            normalizedPage,

        pageFile:
            normalizedPage,

        roles:
            normalizedRoles,

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
 * OBTENER KEY DEL CONTROLLER
 * ============================================================
 */

function getControllerKey(
    controller,
    page
) {

    const controllerName =
        String(

            controller?.name ||

            page ||

            "controller"

        )
            .trim()
            .toLowerCase();


    return `${page}::${controllerName}`;

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


    const controllerKey =
        getControllerKey(

            normalizedController,

            page

        );


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
 * EVITAR DUPLICADOS DEL APROUTER
 * ============================================================
 *
 * Esta función también limpia registrations antiguos si un
 * archivo controller fue cargado previamente por un mecanismo
 * legacy.
 * ============================================================
 */

function removeDuplicateGlobalController(
    page,
    controller
) {

    const mvc =
        window.InventoryMVC;


    if (

        !mvc ||

        !mvc.controllers

    ) {

        return;

    }


    const key =
        getControllerKey(
            controller,
            page
        );


    Object.entries(
        mvc.controllers
    ).forEach(
        ([
            name,
            candidate
        ]) => {

            if (
                !candidate
            ) {

                return;

            }


            if (

                candidate ===
                controller

            ) {

                return;

            }


            const candidatePage =
                normalizePage(

                    candidate.page ||

                    candidate.pageFile ||

                    ""

                );


            if (
                !candidatePage
            ) {

                return;

            }


            const candidateKey =
                getControllerKey(

                    candidate,

                    candidatePage

                );


            if (
                candidateKey ===
                key
            ) {

                /*
                 * No eliminamos el objeto global porque otros
                 * módulos podrían estar utilizándolo.
                 *
                 * Solamente informamos para diagnóstico.
                 */

                console.warn(

                    `[Router] Existe otro controller global con la misma clave: ${candidateKey}.`

                );

            }

        }
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


        /*
         * --------------------------------------------------------
         * Esperar a AppRouter.
         * --------------------------------------------------------
         */

        const ready =
            await waitForAppRouter();


        if (
            !ready
        ) {

            throw new Error(

                "app.js no expuso AppRouter."

            );

        }


        /*
         * --------------------------------------------------------
         * Cancelar navegación obsoleta.
         * --------------------------------------------------------
         */

        if (
            token !== navigationToken
        ) {

            console.log(

                `[Router] Navegación cancelada para "${page}".`

            );


            return;

        }


        /*
         * --------------------------------------------------------
         * Cargar controller.
         * --------------------------------------------------------
         */

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


        /*
         * --------------------------------------------------------
         * Validar.
         * --------------------------------------------------------
         */

        validateControllerForPage(

            controller,

            page

        );


        /*
         * --------------------------------------------------------
         * Normalizar.
         * --------------------------------------------------------
         */

        const normalizedController =
            normalizeController(

                controller,

                page

            );


        /*
         * --------------------------------------------------------
         * Diagnóstico de duplicados.
         * --------------------------------------------------------
         */

        removeDuplicateGlobalController(

            page,

            normalizedController

        );


        /*
         * --------------------------------------------------------
         * Registrar.
         * --------------------------------------------------------
         */

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

    normalizeController,

    resolveControllerFromModule,

    createCompatibilityController

};