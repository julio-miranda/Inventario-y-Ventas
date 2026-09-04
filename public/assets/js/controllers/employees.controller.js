// assets/js/controllers/employees.controller.js

"use strict";

import employeesModel
    from "../models/employees.model.js";

import employeesView
    from "../views/employees.view.js";

const mvc =
    window.InventoryMVC ||
    (window.InventoryMVC = {
        models: {},
        views: {},
        controllers: {}
    });

mvc.controllers =
    mvc.controllers ||
    {};

let employees = [];

let currentContext =
    null;

let currentRole =
    "";

let employeesLoadingPromise =
    null;

let initialized =
    false;

let actionIds =
    new Set();

let isCreating =
    false;

function getCanonicalRole(
    role = ""
) {

    if (
        typeof window.getCanonicalRole ===
        "function"
    ) {

        return window.getCanonicalRole(
            role
        );

    }

    const normalized =
        String(
            role
        )
            .trim()
            .toLowerCase();

    if (
        normalized ===
        "admin" ||
        normalized ===
        "administrador"
    ) {

        return "Administrador";

    }

    return String(
        role
    ).trim();

}

function isAdmin() {

    return (
        getCanonicalRole(
            currentRole
        ) ===
        "Administrador"
    );

}

function getLocalId() {

    return employeesModel
        .getCurrentLocalId(
            currentContext
        );

}

function getLocalInfo() {

    return employeesModel
        .getCurrentLocalInfo(
            currentContext
        );

}

function sortEmployees() {

    employees.sort(
        (
            a,
            b
        ) =>

            String(
                a.name ||
                ""
            ).localeCompare(
                String(
                    b.name ||
                    ""
                ),
                "es"
            )

    );

}

function render() {

    const query =
        employeesView
            .getSearchValue();

    let filtered =
        [...employees];

    if (
        query
    ) {

        filtered =
            filtered.filter(
                employee => {

                    const haystack =
                        [

                            employee.name,

                            employee.email,

                            employee.position,

                            employee.phone,

                            employee.localNombre,

                            employee.localNumeroDocumento,

                            employee.localUbicacion,

                            employee.localContribuyente,

                            employee.localNIT,

                            employee.localNRC

                        ]
                            .map(
                                value =>
                                    String(
                                        value ||
                                        ""
                                    )
                                        .toLowerCase()
                            )
                            .join(
                                " "
                            );

                    return haystack.includes(
                        query
                    );

                }
            );

    }

    employeesView.renderEmployees(

        filtered,

        {

            canDelete:
                isAdmin(),

            localName:
                getLocalInfo()
                    .nombre,

            emptyMessage:
                "No hay empleados para este local."

        }

    );

}

function syncFromCache() {

    employees =
        employeesModel
            .getEmployeesFromSessionCache(
                currentContext
            );

    sortEmployees();

    render();

}

function verifyPermission(
    permission
) {

    const allowedRoles =
        employeesModel
            .permissions?.[
                permission
            ] ||
        [];

    return allowedRoles.includes(
        getCanonicalRole(
            currentRole
        )
    );

}

async function createEmployee() {

    if (
        isCreating
    ) {
        return;
    }

    if (
        !verifyPermission(
            "canCreate"
        )
    ) {

        await employeesView.showError(
            "No tienes permisos"
        );

        return;

    }

    const localId =
        getLocalId();

    if (
        !localId
    ) {

        await employeesView.showError(

            "Sin local asignado",

            "No se puede crear el empleado porque tu usuario no tiene id_local."

        );

        return;

    }

    const data =
        await employeesView.openCreateDialog(

            getLocalInfo(),

            employeesModel.positionOptions

        );

    if (
        !data
    ) {
        return;
    }

    isCreating =
        true;

    const newButton =
        employeesView
            .getElements()
            .newButton;

    if (
        newButton
    ) {

        newButton.disabled =
            true;

    }

    try {

        const normalizedEmail =
            String(
                data.email ||
                ""
            )
                .trim()
                .toLowerCase();

        const duplicate =
            employees.some(
                employee =>
                    String(
                        employee.email ||
                        ""
                    )
                        .trim()
                        .toLowerCase() ===
                        normalizedEmail &&
                    employeesModel.matchesCurrentLocal(
                        employee,
                        localId
                    )
            );

        if (
            duplicate
        ) {

            await employeesView.showWarning(

                "Correo duplicado",

                "Ya existe un empleado registrado con ese correo en este local."

            );

            return;

        }

        await employeesModel.createEmployee(

            data,

            currentContext

        );

        syncFromCache();

        await employeesView.showSuccess(

            "Empleado guardado",

            "La cuenta fue creada en Authentication y el perfil fue guardado en Firestore."

        );

    } catch (error) {

        console.error(
            "Error creando empleado:",
            error
        );

        await employeesView.showError(

            "Error",

            error.message ||
            "No se pudo crear el empleado."

        );

    } finally {

        isCreating =
            false;

        if (
            newButton
        ) {

            newButton.disabled =
                false;

        }

    }

}

function getEmployeeById(
    id
) {

    return employees.find(
        employee =>
            String(
                employee.id
            ) ===
            String(
                id
            )
    );

}

async function editEmployee(
    id
) {

    if (
        !verifyPermission(
            "canEdit"
        )
    ) {

        await employeesView.showError(
            "No tienes permisos"
        );

        return;

    }

    const employee =
        getEmployeeById(
            id
        );

    if (
        !employee
    ) {

        await employeesView.showError(

            "Error",

            "No se encontró el empleado."

        );

        return;

    }

    if (
        !employeesModel.matchesCurrentLocal(
            employee,
            getLocalId()
        )
    ) {

        await employeesView.showError(

            "Acceso denegado",

            "El empleado no pertenece al local actual."

        );

        return;

    }

    const changes =
        await employeesView.openEditDialog(

            employee,

            getLocalInfo(),

            employeesModel.positionOptions

        );

    if (
        !changes
    ) {
        return;
    }

    if (
        actionIds.has(
            id
        )
    ) {
        return;
    }

    actionIds.add(
        id
    );

    try {

        await employeesModel.updateEmployee(

            id,

            changes,

            currentContext

        );

        syncFromCache();

        await employeesView.showSuccess(
            "Empleado actualizado"
        );

    } catch (error) {

        console.error(
            "Error actualizando empleado:",
            error
        );

        await employeesView.showError(

            "Error",

            error.message ||
            "No se pudo actualizar el empleado."

        );

    } finally {

        actionIds.delete(
            id
        );

    }

}

async function deleteEmployee(
    id
) {

    if (
        !verifyPermission(
            "canDelete"
        )
    ) {

        await employeesView.showError(
            "No tienes permisos"
        );

        return;

    }

    const employee =
        getEmployeeById(
            id
        );

    if (
        !employee
    ) {

        await employeesView.showError(

            "Error",

            "No se encontró el empleado."

        );

        return;

    }

    if (
        !employeesModel.matchesCurrentLocal(
            employee,
            getLocalId()
        )
    ) {

        await employeesView.showError(

            "Acceso denegado",

            "El empleado no pertenece al local actual."

        );

        return;

    }

    const confirmed =
        await employeesView.confirmDelete(
            employee
        );

    if (
        !confirmed
    ) {
        return;
    }

    if (
        actionIds.has(
            id
        )
    ) {
        return;
    }

    actionIds.add(
        id
    );

    try {

        await employeesModel.deleteEmployee(

            id,

            currentContext

        );

        syncFromCache();

        await employeesView.showSuccess(

            "Empleado eliminado",

            "El perfil del empleado fue eliminado de Firestore."

        );

    } catch (error) {

        console.error(
            "Error eliminando empleado:",
            error
        );

        await employeesView.showError(

            "Error",

            error.message ||
            "No se pudo eliminar el empleado."

        );

    } finally {

        actionIds.delete(
            id
        );

    }

}

function bindEvents() {

    const elements =
        employeesView.getElements();

    if (
        elements.newButton &&
        elements.newButton.dataset
            .employeesBound !==
            "1"
    ) {

        elements.newButton.dataset
            .employeesBound =
            "1";

        elements.newButton.addEventListener(

            "click",

            createEmployee

        );

    }

    if (
        elements.searchInput &&
        elements.searchInput.dataset
            .employeesBound !==
            "1"
    ) {

        elements.searchInput.dataset
            .employeesBound =
            "1";

        elements.searchInput.addEventListener(

            "input",

            render

        );

    }

    employeesView.bindTableActions({

        onEdit:
            editEmployee,

        onDelete:
            deleteEmployee

    });

}

async function loadEmployees(
    user
) {

    if (
        employeesLoadingPromise
    ) {

        return employeesLoadingPromise;

    }

    employeesLoadingPromise =
        (async () => {

            employeesView.renderLoading();

            employees =
                await employeesModel
                    .getEmployees(
                        user,
                        currentContext
                    );

            sortEmployees();

            render();

            return employees;

        })()
            .finally(
                () => {

                    employeesLoadingPromise =
                        null;

                }
            );

    return employeesLoadingPromise;

}

async function init(
    user,
    context
) {

    if (
        initialized &&
        currentContext?.uid ===
            context?.uid
    ) {

        syncFromCache();

        return;

    }

    if (
        !user
    ) {

        throw new Error(
            "No hay un usuario autenticado."
        );

    }

    if (
        !context
    ) {

        throw new Error(
            "No se pudo resolver el contexto del usuario."
        );

    }

    currentContext =
        context;

    currentRole =
        getCanonicalRole(

            context.role ||
            context.position ||
            ""

        );

    employeesView.setGreeting(

        context.name ||
        "Usuario",

        currentRole

    );

    employeesView.setNewButtonVisible(
        isAdmin()
    );

    bindEvents();

    if (
        !getLocalId()
    ) {

        employees =
            [];

        employeesView.renderEmpty(

            "No hay local asignado al usuario."

        );

        await employeesView.showLocalWarning();

        initialized =
            true;

        return;

    }

    await loadEmployees(
        user
    );

    if (
        typeof window.renderNavigationForRole ===
        "function"
    ) {

        window.renderNavigationForRole(
            currentRole
        );

    }

    initialized =
        true;

}

const controller = {

    name:
        "employees",

    page:
        "employees.html",

    roles:
        employeesModel.roles,

    init

};

mvc.controllers.employees =
    controller;

export default controller;