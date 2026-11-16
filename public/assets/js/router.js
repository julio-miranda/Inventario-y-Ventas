// assets/js/router.js

"use strict";

/*
 * assets/js/router.js
 *
 * Router MVC de la aplicación.
 * El inventario carga sus scripts clásicos secuencialmente.
 */

let navigationToken = 0;

const registeredControllers = new Set();
const classicScriptPromises = new Map();

/*
 * ============================================================
 * RUTAS
 * ============================================================
 */

const routes = Object.freeze({

    "dashboard.html": {
        modelPath: "./models/dashboard.model.js",
        viewPath: "./views/dashboard.view.js",
        modulePath: "./controllers/dashboard.controller.js"
    },

    "inventory.html": {
        loadSequence: [

            // 1. Cálculos
            {
                type: "classic",
                path: "./calculations/inventory.calculations.js"
            },

            // 2. Modelo
            {
                type: "classic",
                path: "./models/inventory.model.js"
            },

            // 3. Repositorio
            {
                type: "classic",
                path: "./repository/inventory.repository.js"
            },

            // 4. Servicio
            {
                type: "classic",
                path: "./service/inventory.service.js"
            },

            // 5. Vista auxiliar MVC
            {
                type: "classic",
                path: "./views/inventory.view.js"
            },

            // 7. Dependencias de proveedores
            {
                type: "module",
                path: "./models/proveedores.model.js"
            },

            {
                type: "module",
                path: "./views/proveedores.view.js"
            },

            {
                type: "module",
                path: "./controllers/proveedores.controller.js"
            },

            // 8. Preparar repositorio
            {
                type: "prepare-inventory-repository"
            },

            // 9. Controlador principal
            {
                type: "classic",
                path: "./controllers/inventory.controller.js"
            }
        ]
    },

    "proveedores.html": {
        modelPath: "./models/proveedores.model.js",
        viewPath: "./views/proveedores.view.js",
        modulePath: "./controllers/proveedores.controller.js"
    },

    "sales.html": {
        modelPath: "./models/sales.model.js",
        viewPath: "./views/sales.view.js",
        modulePath: "./controllers/sales.controller.js"
    },

    "gastos.html": {
        modelPath: "./models/gastos.model.js",
        viewPath: "./views/gastos.view.js",
        modulePath: "./controllers/gastos.controller.js"
    },

    "employees.html": {
        modelPath: "./models/employees.model.js",
        viewPath: "./views/employees.view.js",
        modulePath: "./controllers/employees.controller.js"
    },

    "locales.html": {
        modelPath: "./models/locals.model.js",
        viewPath: "./views/locals.view.js",
        modulePath: "./controllers/locals.controller.js"
    },

    "reset-password.html": {
        modelPath: "./models/reset-password.model.js",
        viewPath: "./views/reset-password.view.js",
        modulePath: "./controllers/reset-password.controller.js"
    }

});


/*
 * ============================================================
 * PÁGINA ACTUAL
 * ============================================================
 */

function getCurrentPageFile() {

    const pathname = window.location.pathname.replace(/\\/g, "/");

    return pathname.split("/").pop().toLowerCase() || "index.html";
}


function normalizePage(value = "") {

    return String(value || "")
        .trim()
        .replace(/\\/g, "/")
        .split("/")
        .pop()
        .toLowerCase();
}


/*
 * ============================================================
 * ESPERAR A APP ROUTER
 * ============================================================
 */

async function waitForAppRouter(timeout = 10000) {

    const started = Date.now();

    while (Date.now() - started < timeout) {

        if (
            window.AppRouter &&
            typeof window.AppRouter.registerSecurePageController === "function"
        ) {
            return true;
        }

        await new Promise(resolve => setTimeout(resolve, 25));
    }

    return false;
}


/*
 * ============================================================
 * CARGAR SCRIPT CLÁSICO
 * ============================================================
 */

function loadClassicScript(scriptPath) {

    if (!scriptPath) {
        return Promise.reject(
            new Error("No se especificó la ruta del script.")
        );
    }

    const absoluteUrl = new URL(scriptPath, import.meta.url).href;

    if (classicScriptPromises.has(absoluteUrl)) {
        return classicScriptPromises.get(absoluteUrl);
    }

    const existingScript = Array.from(document.scripts).find(
        script => script.src === absoluteUrl
    );

    if (existingScript) {

        if (existingScript.type === "module") {
            return Promise.reject(
                new Error(
                    `El archivo "${scriptPath}" ya está cargado como módulo ES.`
                )
            );
        }

        const resolved = Promise.resolve();

        classicScriptPromises.set(absoluteUrl, resolved);

        return resolved;
    }

    const script = document.createElement("script");

    script.src = absoluteUrl;
    script.async = false;
    script.dataset.routerDependency = "true";

    const promise = new Promise((resolve, reject) => {

        script.onload = () => {
            console.log("[Router] Script clásico cargado:", scriptPath);
            resolve();
        };

        script.onerror = () => {

            classicScriptPromises.delete(absoluteUrl);

            script.remove();

            reject(
                new Error(
                    `No se pudo cargar "${scriptPath}". URL: ${absoluteUrl}`
                )
            );
        };

        document.head.appendChild(script);
    });

    classicScriptPromises.set(absoluteUrl, promise);

    return promise;
}


/*
 * ============================================================
 * PREPARAR REPOSITORIO DE INVENTARIO
 * ============================================================
 */

function prepareInventoryRepository() {

    const repository =
        window.InventoryMVC?.models?.inventory;

    if (!repository || typeof repository !== "object") {

        throw new Error(
            "No se encontró window.InventoryMVC.models.inventory. " +
            "Verifica la carga de inventory.repository.js."
        );
    }

    if (typeof repository.loadData !== "function") {

        throw new Error(
            "El repositorio no expuso loadData(). " +
            "Verifica su interfaz."
        );
    }

    /*
     * Puente de compatibilidad para el controlador.
     */

    if (typeof window.bioxInvLoadInventoryData !== "function") {

        window.bioxInvLoadInventoryData = (...args) =>
            repository.loadData(...args);
    }

    if (
        typeof repository.loadProviders === "function" &&
        typeof window.bioxInvLoadInventoryProviders !== "function"
    ) {

        window.bioxInvLoadInventoryProviders = (...args) =>
            repository.loadProviders(...args);
    }

    if (
        typeof repository.loadAllEntryMovements === "function" &&
        typeof window.bioxInvLoadAllEntryMovements !== "function"
    ) {

        window.bioxInvLoadAllEntryMovements = (...args) =>
            repository.loadAllEntryMovements(...args);
    }

    if (
        typeof repository.loadProductStockMovements === "function" &&
        typeof window.bioxInvLoadProductStockMovements !== "function"
    ) {

        window.bioxInvLoadProductStockMovements = (...args) =>
            repository.loadProductStockMovements(...args);
    }

    if (
        typeof repository.findMovementById === "function" &&
        typeof window.bioxInvFindMovementById !== "function"
    ) {

        window.bioxInvFindMovementById = (...args) =>
            repository.findMovementById(...args);
    }

    console.log("[Router] Repositorio de inventario preparado:", {
        loadData: typeof repository.loadData,
        loadProviders: typeof repository.loadProviders,
        loadAllEntryMovements: typeof repository.loadAllEntryMovements,
        loadProductStockMovements: typeof repository.loadProductStockMovements,
        findMovementById: typeof repository.findMovementById
    });

    return repository;
}


/*
 * ============================================================
 * EJECUTAR SECUENCIA DE CARGA
 * ============================================================
 */

async function executeRouteLoadSequence(sequence, page) {

    if (!Array.isArray(sequence)) {
        throw new Error(
            `La secuencia de carga de "${page}" no es válida.`
        );
    }

    for (let index = 0; index < sequence.length; index++) {

        const entry = sequence[index];

        if (!entry || typeof entry !== "object") {
            throw new Error(
                `La dependencia ${index + 1} de "${page}" no es válida.`
            );
        }

        if (entry.type === "classic") {

            if (!entry.path) {
                throw new Error(
                    `La dependencia clásica ${index + 1} no tiene ruta.`
                );
            }

            console.log(
                `[Router] Cargando script clásico (${index + 1}/${sequence.length}):`,
                entry.path
            );

            await loadClassicScript(entry.path);

            continue;
        }

        if (entry.type === "module") {

            if (!entry.path) {
                throw new Error(
                    `La dependencia ES ${index + 1} no tiene ruta.`
                );
            }

            console.log(
                `[Router] Importando módulo (${index + 1}/${sequence.length}):`,
                entry.path
            );

            try {
                await import(entry.path);
            } catch (error) {

                console.error(
                    `[Router] Error importando "${entry.path}":`,
                    error
                );

                throw new Error(
                    `No se pudo importar "${entry.path}": ${error.message}`
                );
            }

            continue;
        }

        if (entry.type === "prepare-inventory-repository") {

            if (page !== "inventory.html") {
                throw new Error(
                    "La preparación del repositorio se solicitó desde otra página."
                );
            }

            prepareInventoryRepository();

            continue;
        }

        throw new Error(
            `Tipo de dependencia desconocido: ${entry.type || "no especificado"}`
        );
    }
}


/*
 * ============================================================
 * CONTROLADORES GLOBALES
 * ============================================================
 */

function getGlobalControllerCandidates(page) {

    const controllers = window.InventoryMVC?.controllers;

    if (!controllers) {
        return [];
    }

    const candidates = [];

    const names = {

        "reset-password.html": [
            "resetPassword",
            "resetPasswordController"
        ],

        "inventory.html": [
            "inventory",
            "inventoryController",
            "InventoryController"
        ],

        "dashboard.html": [
            "dashboard",
            "dashboardController",
            "DashboardController"
        ],

        "proveedores.html": [
            "proveedores",
            "proveedoresController",
            "ProveedoresController",
            "suppliers",
            "SuppliersController"
        ],

        "sales.html": [
            "sales",
            "salesController",
            "SalesController"
        ],

        "gastos.html": [
            "gastos",
            "gastosController",
            "GastosController"
        ],

        "employees.html": [
            "employees",
            "employeesController",
            "EmployeesController"
        ],

        "locales.html": [
            "locales",
            "localesController",
            "LocalesController",
            "locals",
            "localsController",
            "LocalsController"
        ]
    };

    for (const name of names[page] || []) {

        if (controllers[name]) {
            candidates.push(controllers[name]);
        }
    }

    return candidates.filter(Boolean);
}


/*
 * ============================================================
 * CONTROLADORES DE COMPATIBILIDAD
 * ============================================================
 */

function createCompatibilityController(page) {

    if (page === "proveedores.html") {

        const api = window.proveedoresAPI;

        if (api && typeof api.initialize === "function") {

            return {
                name: "proveedores",
                page: "proveedores.html",
                roles: ["Administrador", "Bodega"],
                init: api.initialize
            };
        }
    }

    const controller =
        window.InventoryMVC?.controllers?.[
            page === "inventory.html" ? "inventory" :
            page === "dashboard.html" ? "dashboard" :
            page === "sales.html" ? "sales" :
            page === "gastos.html" ? "gastos" :
            page === "employees.html" ? "employees" :
            page === "locales.html" ? "locales" :
            ""
        ];

    if (controller && typeof controller.init === "function") {
        return controller;
    }

    if (page === "locales.html") {

        const localsController =
            window.InventoryMVC?.controllers?.locals;

        if (
            localsController &&
            typeof localsController.init === "function"
        ) {
            return localsController;
        }
    }

    return null;
}


/*
 * ============================================================
 * RESOLVER CONTROLADOR DE MÓDULO
 * ============================================================
 */

function resolveControllerFromModule(module, page) {

    if (!module) {
        return null;
    }

    if (
        module.default &&
        typeof module.default.init === "function"
    ) {
        return module.default;
    }

    if (
        module.controller &&
        typeof module.controller.init === "function"
    ) {
        return module.controller;
    }

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

    for (const name of knownNames) {

        const candidate = module[name];

        if (candidate && typeof candidate.init === "function") {
            return candidate;
        }
    }

    for (const value of Object.values(module)) {

        if (
            value &&
            typeof value === "object" &&
            typeof value.init === "function"
        ) {
            return value;
        }
    }

    const globalController =
        getGlobalControllerCandidates(page).find(
            candidate =>
                candidate &&
                typeof candidate.init === "function"
        );

    if (globalController) {
        return globalController;
    }

    return createCompatibilityController(page);
}


/*
 * ============================================================
 * CARGAR CONTROLADOR DE PÁGINA
 * ============================================================
 */

async function loadControllerForPage(page) {

    const route = routes[page];

    if (!route) {
        return null;
    }

    /*
     * Rutas con secuencia personalizada.
     */

    if (Array.isArray(route.loadSequence)) {

        console.log(
            `[Router] Ejecutando secuencia de carga para "${page}".`
        );

        await executeRouteLoadSequence(
            route.loadSequence,
            page
        );

        const globalController =
            getGlobalControllerCandidates(page).find(
                candidate =>
                    candidate &&
                    typeof candidate.init === "function"
            );

        if (globalController) {
            return globalController;
        }

        const compatibilityController =
            createCompatibilityController(page);

        if (compatibilityController) {
            return compatibilityController;
        }

        throw new Error(
            `La secuencia de "${page}" terminó, pero no se registró ` +
            "un controlador válido en window.InventoryMVC."
        );
    }

    /*
     * Rutas convencionales con módulos ES.
     */

    if (!route.modulePath) {
        throw new Error(
            `La ruta "${page}" no tiene modulePath ni loadSequence.`
        );
    }

    const dependencies = [
        route.modelPath,
        route.viewPath,
        ...(Array.isArray(route.dependencies) ? route.dependencies : [])
    ].filter(Boolean);

    for (const dependencyPath of dependencies) {

        try {
            await import(dependencyPath);
        } catch (error) {

            console.error(
                `[Router] Error importando dependencia "${dependencyPath}":`,
                error
            );

            throw new Error(
                `No se pudo importar "${dependencyPath}": ${error.message}`
            );
        }
    }

    let module;

    try {
        module = await import(route.modulePath);
    } catch (error) {

        console.error(
            `[Router] Error importando controlador de "${page}":`,
            error
        );

        const fallback = createCompatibilityController(page);

        if (fallback) {
            return fallback;
        }

        throw new Error(
            `No se pudo importar el controlador de "${page}": ${error.message}`
        );
    }

    const controller =
        resolveControllerFromModule(module, page);

    if (controller) {
        return controller;
    }

    throw new Error(
        `No se encontró un controlador válido para "${page}". ` +
        `Exportaciones: ${Object.keys(module || {}).join(", ") || "ninguna"}.`
    );
}


/*
 * ============================================================
 * NORMALIZAR CONTROLADOR
 * ============================================================
 */

function normalizeController(controller, page) {

    if (!controller || typeof controller !== "object") {
        return null;
    }

    if (typeof controller.init !== "function") {
        return null;
    }

    const declaredPage = normalizePage(
        controller.page || controller.pageFile || ""
    );

    if (declaredPage && declaredPage !== page) {

        throw new Error(
            `El controlador declara "${declaredPage}", pero se carga para "${page}".`
        );
    }

    return {
        ...controller,
        page: declaredPage || page,
        pageFile: declaredPage || page,
        roles: Array.isArray(controller.roles)
            ? controller.roles.filter(Boolean)
            : [],
        name: String(
            controller.name ||
            page.replace(".html", "")
        ).trim()
    };
}


/*
 * ============================================================
 * VALIDAR CONTROLADOR
 * ============================================================
 */

function validateControllerForPage(controller, page) {

    if (!controller) {
        throw new Error(
            `No se encontró un controlador válido para "${page}".`
        );
    }

    if (typeof controller.init !== "function") {
        throw new Error(
            `El controlador de "${page}" no contiene init().`
        );
    }

    const controllerPage = normalizePage(
        controller.page || controller.pageFile || ""
    );

    if (controllerPage && controllerPage !== page) {
        throw new Error(
            `El controlador declara "${controllerPage}", pero se carga para "${page}".`
        );
    }

    return true;
}


/*
 * ============================================================
 * REGISTRAR CONTROLADOR
 * ============================================================
 */

function getControllerKey(controller, page) {

    const name = String(
        controller?.name || page || "controller"
    ).trim().toLowerCase();

    return `${page}::${name}`;
}


function registerController(controller, page) {

    if (
        !window.AppRouter ||
        typeof window.AppRouter.registerSecurePageController !== "function"
    ) {
        throw new Error(
            "AppRouter.registerSecurePageController() no está disponible."
        );
    }

    const normalizedController =
        normalizeController(controller, page);

    validateControllerForPage(normalizedController, page);

    const controllerKey =
        getControllerKey(normalizedController, page);

    if (registeredControllers.has(controllerKey)) {
        console.log(
            `[Router] Controller ya registrado: ${controllerKey}`
        );

        return normalizedController;
    }

    const register =
        normalizedController.public === true
            ? window.AppRouter.registerPublicPageController
            : window.AppRouter.registerSecurePageController;

    if (typeof register !== "function") {
        throw new Error(
            normalizedController.public === true
                ? "AppRouter.registerPublicPageController() no está disponible."
                : "AppRouter.registerSecurePageController() no está disponible."
        );
    }

    registeredControllers.add(controllerKey);

    try {

        const result = register.call(
            window.AppRouter,
            normalizedController
        );

        console.log(
            `[Router] Controller registrado: ${controllerKey}`
        );

        return result || normalizedController;

    } catch (error) {

        registeredControllers.delete(controllerKey);

        throw error;
    }
}


/*
 * ============================================================
 * DIAGNÓSTICO DE CONTROLADORES DUPLICADOS
 * ============================================================
 */

function removeDuplicateGlobalController(page, controller) {

    const controllers =
        window.InventoryMVC?.controllers;

    if (!controllers) {
        return;
    }

    const key = getControllerKey(controller, page);

    Object.entries(controllers).forEach(([name, candidate]) => {

        if (!candidate || candidate === controller) {
            return;
        }

        const candidatePage = normalizePage(
            candidate.page || candidate.pageFile || ""
        );

        if (!candidatePage) {
            return;
        }

        const candidateKey =
            getControllerKey(candidate, candidatePage);

        if (
            candidateKey === key &&
            candidate.init !== controller.init
        ) {
            console.warn(
                `[Router] Existe otro controller global con la misma clave: ${candidateKey}.`
            );
        }
    });
}


/*
 * ============================================================
 * ROUTER PRINCIPAL
 * ============================================================
 */

export async function router() {

    const token = ++navigationToken;

    try {

        const page = getCurrentPageFile();

        console.log(
            `[Router] Iniciando navegación para: ${page}`
        );

        const route = routes[page];

        if (!route) {

            console.log(
                `[Router] "${page}" no requiere controlador MVC.`
            );

            return;
        }

        const ready = await waitForAppRouter();

        if (!ready) {
            throw new Error(
                "app.js no expuso AppRouter."
            );
        }

        if (token !== navigationToken) {
            return;
        }

        const controller =
            await loadControllerForPage(page);

        if (token !== navigationToken) {
            return;
        }

        validateControllerForPage(controller, page);

        const normalizedController =
            normalizeController(controller, page);

        removeDuplicateGlobalController(
            page,
            normalizedController
        );

        registerController(
            normalizedController,
            page
        );

        console.log(
            `[Router] Módulo MVC preparado correctamente: ${page}`
        );

    } catch (error) {

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
    loadClassicScript,
    executeRouteLoadSequence,
    prepareInventoryRepository,
    validateControllerForPage,
    normalizeController,
    resolveControllerFromModule,
    createCompatibilityController,
    getGlobalControllerCandidates
};