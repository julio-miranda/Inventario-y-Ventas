// assets/js/models/employees.model.js

"use strict";

const mvc =
    window.InventoryMVC ||
    (window.InventoryMVC = {
        models: {},
        views: {},
        controllers: {}
    });

mvc.models =
    mvc.models ||
    {};

const EMPLOYEE_COLLECTION =
    window.EMPLOYEE_COLLECTION_NAME ||
    "empleados";

const POSITION_OPTIONS = Object.freeze([
    "Administrador",
    "Desarrollador",
    "Vendedor",
    "Cajero",
    "Bodega",
    "Asistencia"
]);

function getAuth() {

    if (
        window.auth
    ) {
        return window.auth;
    }

    if (
        typeof firebase !==
        "undefined"
    ) {

        return firebase.auth();

    }

    throw new Error(
        "Firebase Authentication no está disponible."
    );
}

function getDb() {

    if (
        window.db
    ) {
        return window.db;
    }

    if (
        typeof firebase !==
        "undefined"
    ) {

        return firebase.firestore();

    }

    throw new Error(
        "Firestore no está disponible."
    );
}

function normalizeString(
    value = ""
) {

    return String(
        value ??
            ""
    ).trim();

}

function getCurrentLocalId(
    context = null
) {

    if (
        context?.id_local
    ) {

        return normalizeString(
            context.id_local
        );

    }

    if (
        typeof window.getCurrentLocalId ===
        "function"
    ) {

        return normalizeString(
            window.getCurrentLocalId()
        );

    }

    return "";

}

function getCurrentLocalInfo(
    context = null
) {

    if (
        context
    ) {

        return {

            id_local:
                normalizeString(
                    context.id_local
                ),

            nombre:
                normalizeString(
                    context.localNombre
                ),

            numeroDocumento:
                normalizeString(
                    context.localNumeroDocumento
                ),

            ubicacion:
                normalizeString(
                    context.localUbicacion
                ),

            contribuyente:
                normalizeString(
                    context.localContribuyente
                ),

            tipoDocumento:
                normalizeString(
                    context.localTipoDocumento
                ),

            nit:
                normalizeString(
                    context.localNIT
                ),

            nrc:
                normalizeString(
                    context.localNRC
                )

        };

    }

    if (
        typeof window.getCurrentLocalInfo ===
        "function"
    ) {

        return window.getCurrentLocalInfo();

    }

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

function matchesCurrentLocal(
    employee,
    localId
) {

    const target =
        normalizeString(
            localId
        );

    if (
        !target
    ) {
        return false;
    }

    const documentLocalId =
        normalizeString(

            employee?.id_local ||

            employee?.idLocal ||

            employee?.localId ||

            employee?.idlocal

        );

    return (
        documentLocalId ===
        target
    );

}

function getEmployeesFromSessionCache(
    context = null
) {

    if (
        typeof window.getSessionCollection !==
        "function"
    ) {

        throw new Error(
            "app.js no expuso getSessionCollection()."
        );

    }

    const localId =
        getCurrentLocalId(
            context
        );

    const localInfo =
        getCurrentLocalInfo(
            context
        );

    const documents =
        window.getSessionCollection(
            EMPLOYEE_COLLECTION
        );

    if (
        !Array.isArray(
            documents
        )
    ) {

        return [];

    }

    return documents
        .filter(
            item =>
                matchesCurrentLocal(
                    item?.data || {},
                    localId
                )
        )
        .map(
            item => {

                const data =
                    item?.data ||
                    {};

                return {

                    id:
                        item.id,

                    ...data,

                    id_local:
                        localId,

                    localNombre:
                        data.localNombre ||
                        localInfo.nombre ||
                        "",

                    localNumeroDocumento:
                        data.localNumeroDocumento ||
                        localInfo.numeroDocumento ||
                        "",

                    localUbicacion:
                        data.localUbicacion ||
                        localInfo.ubicacion ||
                        "",

                    localContribuyente:
                        data.localNombreContribuyente ||
                        data.localContribuyente ||
                        localInfo.contribuyente ||
                        "",

                    localTipoDocumento:
                        data.localTipoDocumento ||
                        localInfo.tipoDocumento ||
                        "",

                    localNIT:
                        data.localNIT ||
                        localInfo.nit ||
                        "",

                    localNRC:
                        data.localNRC ||
                        localInfo.nrc ||
                        ""

                };

            }
        );

}

async function ensureSessionData(
    user
) {

    if (
        typeof window.ensureSessionDataLoaded ===
        "function"
    ) {

        await window.ensureSessionDataLoaded(
            user
        );

    }

}

async function getEmployees(
    user,
    context
) {

    if (
        !user
    ) {

        throw new Error(
            "No hay un usuario autenticado."
        );

    }

    await ensureSessionData(
        user
    );

    return getEmployeesFromSessionCache(
        context
    );

}

function getAuthApiKey() {

    try {

        return getAuth()
            .app
            ?.options
            ?.apiKey ||
            firebase
                .app()
                .options
                .apiKey;

    } catch {

        return null;

    }

}

function mapAuthRestError(
    errorMessage = ""
) {

    const message =
        String(
            errorMessage
        )
            .toUpperCase();

    switch (
        message
    ) {

        case "EMAIL_EXISTS":

            return (
                "Ese correo ya está registrado en Authentication."
            );

        case "OPERATION_NOT_ALLOWED":

            return (
                "El inicio de sesión con correo y contraseña no está habilitado en Firebase Authentication."
            );

        case "WEAK_PASSWORD":

        case "WEAK_PASSWORD : PASSWORD SHOULD BE AT LEAST 6 CHARACTERS":

            return (
                "La contraseña debe tener al menos 6 caracteres."
            );

        case "INVALID_EMAIL":

            return (
                "El correo ingresado no es válido."
            );

        default:

            return (
                errorMessage ||
                "No se pudo crear la cuenta en Authentication."
            );

    }

}

async function createAuthUser(
    email,
    password
) {

    const apiKey =
        getAuthApiKey();

    if (
        !apiKey
    ) {

        throw new Error(
            "No se pudo leer la API key de Firebase."
        );

    }

    const response =
        await fetch(

            `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(
                apiKey
            )}`,

            {

                method:
                    "POST",

                headers: {

                    "Content-Type":
                        "application/json"

                },

                body:
                    JSON.stringify({

                        email,
                        password,
                        returnSecureToken:
                            true

                    })

            }

        );

    const data =
        await response.json();

    if (
        !response.ok
    ) {

        const errorMessage =
            data?.error?.message ||
            "No se pudo crear la cuenta.";

        throw new Error(
            mapAuthRestError(
                errorMessage
            )
        );

    }

    return data;

}

async function createEmployee(
    employee,
    context
) {

    const auth =
        getAuth();

    const db =
        getDb();

    const localId =
        getCurrentLocalId(
            context
        );

    if (
        !localId
    ) {

        throw new Error(
            "No hay un local asignado al usuario actual."
        );

    }

    const localInfo =
        getCurrentLocalInfo(
            context
        );

    const email =
        normalizeString(
            employee.email
        )
            .toLowerCase();

    const name =
        normalizeString(
            employee.name
        );

    const position =
        normalizeString(
            employee.position
        );

    const phone =
        normalizeString(
            employee.phone
        );

    const password =
        String(
            employee.password ||
                ""
        );

    if (
        !name ||
        !email ||
        !position ||
        !password
    ) {

        throw new Error(
            "Nombre, correo, contraseña y posición son obligatorios."
        );

    }

    const currentUser =
        auth.currentUser;

    const authResult =
        await createAuthUser(
            email,
            password
        );

    const uid =
        authResult?.localId;

    if (
        !uid
    ) {

        throw new Error(
            "Firebase Authentication no devolvió el UID del nuevo usuario."
        );

    }

    const employeeData = {

        uid,

        name,

        email,

        position,

        phone,

        id_local:
            localId,

        localNombre:
            localInfo.nombre ||
            "",

        localNumeroDocumento:
            localInfo.numeroDocumento ||
            "",

        localUbicacion:
            localInfo.ubicacion ||
            "",

        localNombreContribuyente:
            localInfo.contribuyente ||
            "",

        localContribuyente:
            localInfo.contribuyente ||
            "",

        localTipoDocumento:
            localInfo.tipoDocumento ||
            "",

        localNIT:
            localInfo.nit ||
            "",

        localNRC:
            localInfo.nrc ||
            "",

        active:
            true,

        blocked:
            false,

        failedLoginAttempts:
            0,

        lastLoginAt:
            null,

        lastAccessAt:
            null,

        lastFailedAt:
            null,

        createdBy:
            currentUser?.uid ||
            null,

        createdAt:
            Date.now(),

        updatedAt:
            Date.now()

    };

    try {

        await db
            .collection(
                EMPLOYEE_COLLECTION
            )
            .doc(
                uid
            )
            .set({

                ...employeeData,

                createdAt:
                    firebase.firestore
                        .FieldValue
                        .serverTimestamp(),

                updatedAt:
                    firebase.firestore
                        .FieldValue
                        .serverTimestamp()

            });

    } catch (error) {

        throw new Error(

            `La cuenta de Authentication fue creada, pero no se pudo guardar el perfil de Firestore: ${
                error.message ||
                error
            }`

        );

    }

    if (
        typeof window.upsertSessionDocument ===
        "function"
    ) {

        window.upsertSessionDocument(

            EMPLOYEE_COLLECTION,

            uid,

            employeeData

        );

    }

    return {

        uid,

        employee:
            employeeData

    };

}

async function updateEmployee(
    id,
    changes,
    context
) {

    const auth =
        getAuth();

    const db =
        getDb();

    const localId =
        getCurrentLocalId(
            context
        );

    const localInfo =
        getCurrentLocalInfo(
            context
        );

    if (
        !id
    ) {

        throw new Error(
            "El ID del empleado es obligatorio."
        );

    }

    if (
        !localId
    ) {

        throw new Error(
            "No hay un local asignado al usuario actual."
        );

    }

    const employeeList =
        getEmployeesFromSessionCache(
            context
        );

    const existing =
        employeeList.find(
            employee =>
                String(
                    employee.id
                ) ===
                String(id)
        );

    if (
        !existing
    ) {

        throw new Error(
            "El empleado no se encuentra en el local actual."
        );

    }

    if (
        !matchesCurrentLocal(
            existing,
            localId
        )
    ) {

        throw new Error(
            "El empleado no pertenece al local actual."
        );

    }

    const updatedEmployee = {

        name:
            normalizeString(
                changes.name
            ),

        email:
            normalizeString(
                existing.email
            )
                .toLowerCase(),

        position:
            normalizeString(
                changes.position
            ),

        phone:
            normalizeString(
                changes.phone
            ),

        id_local:
            localId,

        localNombre:
            localInfo.nombre ||
            "",

        localNumeroDocumento:
            localInfo.numeroDocumento ||
            "",

        localUbicacion:
            localInfo.ubicacion ||
            "",

        localNombreContribuyente:
            localInfo.contribuyente ||
            "",

        localContribuyente:
            localInfo.contribuyente ||
            "",

        localTipoDocumento:
            localInfo.tipoDocumento ||
            "",

        localNIT:
            localInfo.nit ||
            "",

        localNRC:
            localInfo.nrc ||
            "",

        updatedBy:
            auth.currentUser?.uid ||
            null,

        updatedAt:
            Date.now()

    };

    if (
        !updatedEmployee.name ||
        !updatedEmployee.position
    ) {

        throw new Error(
            "Nombre y posición son obligatorios."
        );

    }

    await db
        .collection(
            EMPLOYEE_COLLECTION
        )
        .doc(
            id
        )
        .update({

            ...updatedEmployee,

            updatedAt:
                firebase.firestore
                    .FieldValue
                    .serverTimestamp()

        });

    if (
        typeof window.upsertSessionDocument ===
        "function"
    ) {

        window.upsertSessionDocument(

            EMPLOYEE_COLLECTION,

            id,

            updatedEmployee

        );

    }

    return updatedEmployee;

}

async function deleteEmployee(
    id,
    context
) {

    const db =
        getDb();

    if (
        !id
    ) {

        throw new Error(
            "El ID del empleado es obligatorio."
        );

    }

    const localId =
        getCurrentLocalId(
            context
        );

    const employeeList =
        getEmployeesFromSessionCache(
            context
        );

    const employee =
        employeeList.find(
            item =>
                String(
                    item.id
                ) ===
                String(id)
        );

    if (
        !employee
    ) {

        throw new Error(
            "El empleado no se encuentra en el local actual."
        );

    }

    if (
        !matchesCurrentLocal(
            employee,
            localId
        )
    ) {

        throw new Error(
            "El empleado no pertenece al local actual."
        );

    }

    await db
        .collection(
            EMPLOYEE_COLLECTION
        )
        .doc(
            id
        )
        .delete();

    if (
        typeof window.removeSessionDocument ===
        "function"
    ) {

        window.removeSessionDocument(
            EMPLOYEE_COLLECTION,
            id
        );

    }

    return true;

}

const model = Object.freeze({

    name:
        "employees",

    title:
        "Empleados",

    page:
        "employees.html",

    public:
        false,

    requiresLocal:
        true,

    roles: [
        "Administrador"
    ],

    collections: {

        employees:
            EMPLOYEE_COLLECTION

    },

    permissions: {

        canCreate: [
            "Administrador"
        ],

        canEdit: [
            "Administrador"
        ],

        canDelete: [
            "Administrador"
        ]

    },

    positionOptions:
        POSITION_OPTIONS,

    getCurrentLocalId,

    getCurrentLocalInfo,

    matchesCurrentLocal,

    getEmployeesFromSessionCache,

    getEmployees,

    createEmployee,

    updateEmployee,

    deleteEmployee

});

mvc.models.employees =
    model;

if (
    window.AppRouter &&
    typeof window.AppRouter.registerRoute ===
        "function"
) {

    window.AppRouter.registerRoute(
        model
    );

}

export default model;