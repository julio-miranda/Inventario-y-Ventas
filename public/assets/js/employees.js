// assets/js/employees.js
//
// Gestión de empleados.
//
// Optimización:
// - app.js resuelve el contexto del usuario.
// - employees.js reutiliza getCurrentUserContext().
// - No se vuelve a consultar empleados/{uid}.
// - No se vuelve a consultar local/{id_local}.
// - Solo se mantiene el listener del listado de empleados
//   pertenecientes al local actual.
//
// Permisos:
// - Solo Administrador puede crear empleados.
// - Solo Administrador puede eliminar empleados.
// - Solo Administrador puede editar empleados.
//
// Seguridad lógica:
// - Los empleados mostrados pertenecen únicamente al local actual.
// - Los empleados creados reciben el id_local actual.
// - El local de un empleado no puede cambiarse desde este módulo.

const tableBody =
    document.querySelector(
        "#employeesTable tbody"
    );

const searchInput =
    document.getElementById(
        "searchEmployee"
    );

const newEmployeeBtn =
    document.getElementById(
        "btnNewEmployee"
    );

const greetingEls =
    document.querySelectorAll(
        ".userGreeting"
    );

const EMPLOYEE_COLLECTION =
    window.EMPLOYEE_COLLECTION_NAME ||
    "empleados";

const POSITION_OPTIONS = [
    "Administrador",
    "Desarrollador",
    "Vendedor",
    "Cajero",
    "Bodega",
    "Asistencia"
];

let employees = [];

let currentRole =
    "";

let currentLocalId =
    "";

let currentLocalInfo = {
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

let currentEmployeeContext =
    null;

let unsubscribeEmployees =
    null;

let employeesLoadStarted =
    false;

let isCreatingEmployee =
    false;

let employeeActionIds =
    new Set();

/*
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

function normalizeRoleLocal(
    role = ""
) {
    return String(
        role
    )
        .trim()
        .toLowerCase();
}

function isAdminRole(
    role = ""
) {
    if (
        typeof window
            .getCanonicalRole ===
        "function"
    ) {
        return (
            window.getCanonicalRole(
                role
            ) ===
            "Administrador"
        );
    }

    const r =
        normalizeRoleLocal(
            role
        );

    return (
        r ===
            "administrador" ||
        r === "admin"
    );
}

function escapeHtml(
    value = ""
) {
    return String(
        value
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}

function buildPositionOptions(
    selected = ""
) {
    return POSITION_OPTIONS
        .map(
            position => {
                const isSelected =
                    position ===
                    selected
                        ? "selected"
                        : "";

                return `
                    <option
                        value="${escapeHtml(
                            position
                        )}"
                        ${isSelected}
                    >
                        ${escapeHtml(
                            position
                        )}
                    </option>
                `;
            }
        )
        .join("");
}

/*
 * ============================================================
 * CONTEXTO DEL USUARIO
 * ============================================================
 */

async function resolveEmployeeContext(
    user
) {
    if (!user) {
        throw new Error(
            "No hay un usuario autenticado."
        );
    }

    if (
        typeof window
            .getCurrentUserContext !==
        "function"
    ) {
        throw new Error(
            "app.js no expuso getCurrentUserContext()."
        );
    }

    /*
     * Esta llamada reutiliza la caché de app.js.
     * No ejecuta consultas nuevas si el contexto ya existe.
     */
    const context =
        await window.getCurrentUserContext(
            user
        );

    if (!context) {
        throw new Error(
            "No se pudo resolver el contexto del usuario."
        );
    }

    currentEmployeeContext =
        context;

    currentRole =
        context.role ||
        "";

    currentLocalId =
        String(
            context.id_local ||
                ""
        ).trim();

    currentLocalInfo = {
        id_local:
            currentLocalId,

        nombre:
            String(
                context.localNombre ||
                    ""
            ).trim(),

        numeroDocumento:
            String(
                context.localNumeroDocumento ||
                    ""
            ).trim(),

        ubicacion:
            String(
                context.localUbicacion ||
                    ""
            ).trim(),

        contribuyente:
            String(
                context.localContribuyente ||
                    ""
            ).trim(),

        tipoDocumento:
            String(
                context.localTipoDocumento ||
                    ""
            ).trim(),

        nit:
            String(
                context.localNIT ||
                    ""
            ).trim(),

        nrc:
            String(
                context.localNRC ||
                    ""
            ).trim()
    };

    renderGreeting(
        context.name ||
            "Usuario",
        context.role ||
            ""
    );

    return context;
}

function renderGreeting(
    name = "Usuario",
    role = ""
) {
    greetingEls.forEach(
        el => {
            el.textContent =
                `Hola, ${name}${
                    role
                        ? ` (${role})`
                        : ""
                }`;
        }
    );
}

/*
 * ============================================================
 * CONTEXTO LOCAL
 * ============================================================
 */

function getCurrentLocalId() {
    if (
        currentEmployeeContext &&
        currentEmployeeContext.id_local
    ) {
        return String(
            currentEmployeeContext.id_local
        ).trim();
    }

    if (
        currentLocalId
    ) {
        return String(
            currentLocalId
        ).trim();
    }

    /*
     * Fallback únicamente de memoria local.
     * NO llama a window.getCurrentLocalId().
     *
     * Esto evita crear otra cadena de llamadas
     * entre módulos.
     */
    try {
        const stored =
            JSON.parse(
                localStorage.getItem(
                    "currentUser"
                ) || "null"
            );

        return String(
            stored?.id_local ||
                stored?.idLocal ||
                stored?.localId ||
                ""
        ).trim();
    } catch {
        return "";
    }
}

function getCurrentLocalInfo() {
    if (
        currentEmployeeContext
    ) {
        return {
            id_local:
                String(
                    currentEmployeeContext.id_local ||
                        ""
                ).trim(),

            nombre:
                String(
                    currentEmployeeContext.localNombre ||
                        ""
                ).trim(),

            numeroDocumento:
                String(
                    currentEmployeeContext.localNumeroDocumento ||
                        ""
                ).trim(),

            ubicacion:
                String(
                    currentEmployeeContext.localUbicacion ||
                        ""
                ).trim(),

            contribuyente:
                String(
                    currentEmployeeContext.localContribuyente ||
                        ""
                ).trim(),

            tipoDocumento:
                String(
                    currentEmployeeContext.localTipoDocumento ||
                        ""
                ).trim(),

            nit:
                String(
                    currentEmployeeContext.localNIT ||
                        ""
                ).trim(),

            nrc:
                String(
                    currentEmployeeContext.localNRC ||
                        ""
                ).trim()
        };
    }

    return {
        id_local:
            currentLocalId,

        nombre:
            currentLocalInfo.nombre ||
            "",

        numeroDocumento:
            currentLocalInfo.numeroDocumento ||
            "",

        ubicacion:
            currentLocalInfo.ubicacion ||
            "",

        contribuyente:
            currentLocalInfo.contribuyente ||
            "",

        tipoDocumento:
            currentLocalInfo.tipoDocumento ||
            "",

        nit:
            currentLocalInfo.nit ||
            "",

        nrc:
            currentLocalInfo.nrc ||
            ""
    };
}

function matchesCurrentLocal(
    data = {}
) {
    const target =
        getCurrentLocalId();

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
 * UI
 * ============================================================
 */

function renderLocalWarning() {
    const hasLocal =
        Boolean(
            getCurrentLocalId()
        );

    if (
        hasLocal
    ) {
        return;
    }

    if (
        typeof Swal !==
        "undefined"
    ) {
        Swal.fire({
            icon:
                "warning",

            title:
                "Sin local asignado",

            text:
                "Este usuario no tiene id_local, por lo que no se puede cargar ni guardar empleados por local."
        });
    }
}

function renderEmployees(
    list
) {
    if (!tableBody) {
        return;
    }

    tableBody.innerHTML =
        "";

    if (
        !list.length
    ) {
        tableBody.innerHTML =
            `
                <tr>
                    <td colspan="5">
                        No hay empleados para este local
                    </td>
                </tr>
            `;

        return;
    }

    const localInfo =
        getCurrentLocalInfo();

    list.forEach(
        emp => {
            const row =
                document.createElement(
                    "tr"
                );

            const localName =
                emp.localNombre ||
                localInfo.nombre ||
                "—";

            row.innerHTML =
                `
                    <td>
                        ${escapeHtml(
                            emp.name ||
                                ""
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            emp.position ||
                                ""
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            emp.phone ||
                                "-"
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            localName
                        )}
                    </td>

                    <td>
                        <button
                            type="button"
                            class="btn-edit"
                            data-action="edit"
                            data-id="${escapeHtml(
                                emp.id
                            )}"
                        >
                            Editar
                        </button>

                        ${
                            isAdminRole(
                                currentRole
                            )
                                ? `
                                    <button
                                        type="button"
                                        class="btn-delete"
                                        data-action="delete"
                                        data-id="${escapeHtml(
                                            emp.id
                                        )}"
                                    >
                                        Eliminar
                                    </button>
                                `
                                : ""
                        }
                    </td>
                `;

            tableBody.appendChild(
                row
            );
        }
    );

    tableBody
        .querySelectorAll(
            'button[data-action="edit"]'
        )
        .forEach(
            button => {
                button.addEventListener(
                    "click",
                    () => {
                        editEmployee(
                            String(
                                button.dataset.id ||
                                    ""
                            )
                        );
                    }
                );
            }
        );

    tableBody
        .querySelectorAll(
            'button[data-action="delete"]'
        )
        .forEach(
            button => {
                button.addEventListener(
                    "click",
                    () => {
                        deleteEmployee(
                            String(
                                button.dataset.id ||
                                    ""
                            )
                        );
                    }
                );
            }
        );
}

function renderFilteredEmployees() {
    const q =
        String(
            searchInput?.value ||
                ""
        )
            .trim()
            .toLowerCase();

    let filtered =
        [...employees];

    if (
        q
    ) {
        filtered =
            filtered.filter(
                emp => {
                    const haystack =
                        [
                            emp.name,
                            emp.email,
                            emp.position,
                            emp.phone,
                            emp.localNombre,
                            emp.localNumeroDocumento,
                            emp.localUbicacion
                        ]
                            .map(
                                value =>
                                    String(
                                        value ||
                                            ""
                                    ).toLowerCase()
                            )
                            .join(
                                " "
                            );

                    return haystack.includes(
                        q
                    );
                }
            );
    }

    renderEmployees(
        filtered
    );
}

/*
 * ============================================================
 * LISTENER DE EMPLEADOS
 * ============================================================
 */

function stopEmployeesListener() {
    if (
        typeof unsubscribeEmployees ===
        "function"
    ) {
        unsubscribeEmployees();

        unsubscribeEmployees =
            null;
    }

    employeesLoadStarted =
        false;
}

function loadEmployees() {
    const localId =
        getCurrentLocalId();

    if (
        !localId
    ) {
        employees =
            [];

        renderEmployees(
            []
        );

        renderLocalWarning();

        return null;
    }

    /*
     * Evita registrar dos listeners para el mismo módulo.
     */
    if (
        employeesLoadStarted &&
        unsubscribeEmployees
    ) {
        return unsubscribeEmployees;
    }

    employeesLoadStarted =
        true;

    /*
     * Si por algún motivo existiera un listener anterior,
     * se cancela antes de crear otro.
     */
    if (
        typeof unsubscribeEmployees ===
        "function"
    ) {
        unsubscribeEmployees();
    }

    unsubscribeEmployees =
        db
            .collection(
                EMPLOYEE_COLLECTION
            )
            .where(
                "id_local",
                "==",
                localId
            )
            .onSnapshot(
                snapshot => {
                    employees =
                        [];

                    const localInfo =
                        getCurrentLocalInfo();

                    snapshot.forEach(
                        doc => {
                            const data =
                                doc.data() ||
                                {};

                            /*
                             * Protección adicional.
                             */
                            if (
                                String(
                                    data.id_local ||
                                        data.idLocal ||
                                        data.localId ||
                                        data.idlocal ||
                                        ""
                                ).trim() !==
                                localId
                            ) {
                                return;
                            }

                            employees.push({
                                id:
                                    doc.id,

                                ...data,

                                localId:
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
                            });
                        }
                    );

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

                    renderFilteredEmployees();
                },

                err => {
                    console.error(
                        "Error cargando empleados:",
                        err
                    );

                    employees =
                        [];

                    if (
                        tableBody
                    ) {
                        tableBody.innerHTML =
                            `
                                <tr>
                                    <td colspan="5">
                                        Error cargando empleados
                                    </td>
                                </tr>
                            `;
                    }
                }
            );

    return unsubscribeEmployees;
}

/*
 * ============================================================
 * FIREBASE AUTH REST
 * ============================================================
 */

function getAuthApiKey() {
    try {
        return firebase
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
            errorMessage ||
                ""
        ).toUpperCase();

    switch (
        message
    ) {
        case "EMAIL_EXISTS":
            return "Ese correo ya está registrado en Authentication.";

        case "OPERATION_NOT_ALLOWED":
            return "El inicio de sesión con correo y contraseña no está habilitado en Firebase Authentication.";

        case "WEAK_PASSWORD : PASSWORD SHOULD BE AT LEAST 6 CHARACTERS":
        case "WEAK_PASSWORD":
            return "La contraseña debe tener al menos 6 caracteres.";

        case "INVALID_EMAIL":
            return "El correo ingresado no es válido.";

        default:
            return (
                errorMessage ||
                "No se pudo crear la cuenta en Authentication."
            );
    }
}

async function createAuthUserWithEmailPassword(
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
            data?.error
                ?.message ||
            "No se pudo crear la cuenta.";

        throw new Error(
            mapAuthRestError(
                errorMessage
            )
        );
    }

    return data;
}

/*
 * ============================================================
 * CREAR EMPLEADO
 * ============================================================
 */

async function createEmployeeInAuthAndFirestore(
    employee
) {
    const localId =
        getCurrentLocalId();

    if (
        !localId
    ) {
        throw new Error(
            "No hay un local asignado al usuario actual."
        );
    }

    const localInfo =
        getCurrentLocalInfo();

    /*
     * Authentication.
     */
    const authUser =
        await createAuthUserWithEmailPassword(
            employee.email,
            employee.password
        );

    const uid =
        authUser.localId;

    if (
        !uid
    ) {
        throw new Error(
            "Firebase Authentication no devolvió el UID del nuevo usuario."
        );
    }

    /*
     * Firestore.
     */
    await db
        .collection(
            EMPLOYEE_COLLECTION
        )
        .doc(
            uid
        )
        .set({
            uid,

            name:
                employee.name,

            email:
                employee.email,

            position:
                employee.position,

            phone:
                employee.phone,

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
                auth.currentUser
                    ? auth.currentUser.uid
                    : null,

            createdAt:
                firebase.firestore
                    .FieldValue
                    .serverTimestamp(),

            updatedAt:
                firebase.firestore
                    .FieldValue
                    .serverTimestamp()
        });

    return uid;
}

function buildCreateEmployeeHtml() {
    const localInfo =
        getCurrentLocalInfo();

    return `
        <div
            style="
                text-align:left;
                font-size:0.92rem;
                color:#374151;
                margin-bottom:10px;
            "
        >
            <strong>
                Local actual:
            </strong>
            ${escapeHtml(
                localInfo.nombre ||
                    "—"
            )}
            <br>

            <strong>
                Documento:
            </strong>
            ${escapeHtml(
                localInfo.numeroDocumento ||
                    "—"
            )}
            <br>

            <strong>
                Tipo de documento:
            </strong>
            ${escapeHtml(
                localInfo.tipoDocumento ||
                    "—"
            )}
            <br>

            <strong>
                NIT:
            </strong>
            ${escapeHtml(
                localInfo.nit ||
                    "—"
            )}
            <br>

            <strong>
                NRC:
            </strong>
            ${escapeHtml(
                localInfo.nrc ||
                    "—"
            )}
            <br>

            <strong>
                Ubicación:
            </strong>
            ${escapeHtml(
                localInfo.ubicacion ||
                    "—"
            )}
        </div>

        <input
            id="name"
            class="swal2-input"
            placeholder="Nombre"
            autocomplete="off"
        >

        <input
            id="email"
            class="swal2-input"
            placeholder="Correo electrónico"
            type="email"
            autocomplete="off"
        >

        <input
            id="password"
            class="swal2-input"
            placeholder="Contraseña temporal"
            type="password"
            autocomplete="new-password"
        >

        <input
            id="confirmPassword"
            class="swal2-input"
            placeholder="Confirmar contraseña"
            type="password"
            autocomplete="new-password"
        >

        <select
            id="position"
            class="swal2-input"
            style="
                height:auto;
                padding:12px 10px;
            "
        >
            <option value="">
                Seleccione una posición
            </option>

            ${buildPositionOptions(
                "Vendedor"
            )}
        </select>

        <input
            id="phone"
            class="swal2-input"
            placeholder="Teléfono"
            autocomplete="off"
        >

        <div
            style="
                text-align:left;
                font-size:0.9rem;
                color:#6b7280;
                margin-top:6px;
            "
        >
            El empleado se guardará con el mismo
            <strong>id_local</strong>
            del usuario autenticado.
        </div>
    `;
}

async function handleCreateEmployee() {
    if (
        isCreatingEmployee
    ) {
        return;
    }

    if (
        !isAdminRole(
            currentRole
        )
    ) {
        await Swal.fire(
            "No tienes permisos",
            "",
            "error"
        );

        return;
    }

    const localId =
        getCurrentLocalId();

    if (
        !localId
    ) {
        await Swal.fire(
            "Sin local asignado",
            "No se puede crear el empleado porque tu usuario no tiene id_local.",
            "error"
        );

        return;
    }

    const result =
        await Swal.fire({
            title:
                "Nuevo empleado",

            html:
                buildCreateEmployeeHtml(),

            confirmButtonText:
                "Guardar",

            showCancelButton:
                true,

            cancelButtonText:
                "Cancelar",

            focusConfirm:
                false,

            preConfirm:
                () => {
                    const name =
                        document
                            .getElementById(
                                "name"
                            )
                            ?.value
                            .trim() ||
                        "";

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

                    const confirmPassword =
                        document
                            .getElementById(
                                "confirmPassword"
                            )
                            ?.value ||
                        "";

                    const position =
                        document
                            .getElementById(
                                "position"
                            )
                            ?.value
                            .trim() ||
                        "";

                    const phone =
                        document
                            .getElementById(
                                "phone"
                            )
                            ?.value
                            .trim() ||
                        "";

                    if (
                        !name ||
                        !email ||
                        !password ||
                        !confirmPassword ||
                        !position
                    ) {
                        Swal.showValidationMessage(
                            "Nombre, correo, contraseña y posición son obligatorios."
                        );

                        return;
                    }

                    if (
                        password.length <
                        6
                    ) {
                        Swal.showValidationMessage(
                            "La contraseña debe tener al menos 6 caracteres."
                        );

                        return;
                    }

                    if (
                        password !==
                        confirmPassword
                    ) {
                        Swal.showValidationMessage(
                            "Las contraseñas no coinciden."
                        );

                        return;
                    }

                    return {
                        name,
                        email,
                        password,
                        position,
                        phone
                    };
                }
        });

    if (
        !result.isConfirmed
    ) {
        return;
    }

    isCreatingEmployee =
        true;

    if (
        newEmployeeBtn
    ) {
        newEmployeeBtn.disabled =
            true;
    }

    try {
        /*
         * Una sola consulta para comprobar duplicado.
         */
        const exists =
            await db
                .collection(
                    EMPLOYEE_COLLECTION
                )
                .where(
                    "email",
                    "==",
                    result.value.email
                )
                .where(
                    "id_local",
                    "==",
                    localId
                )
                .limit(
                    1
                )
                .get();

        if (
            !exists.empty
        ) {
            await Swal.fire(
                "Validación",
                "Ya existe un empleado registrado con ese correo en este local.",
                "warning"
            );

            return;
        }

        await createEmployeeInAuthAndFirestore(
            result.value
        );

        await Swal.fire(
            "Empleado guardado",
            "La cuenta también fue creada en Authentication.",
            "success"
        );
    } catch (err) {
        console.error(
            "Error creando empleado:",
            err
        );

        await Swal.fire(
            "Error",
            err.message ||
                "No se pudo crear el empleado.",
            "error"
        );
    } finally {
        isCreatingEmployee =
            false;

        if (
            newEmployeeBtn
        ) {
            newEmployeeBtn.disabled =
                false;
        }
    }
}

/*
 * ============================================================
 * ELIMINAR
 * ============================================================
 */

async function deleteEmployee(
    id
) {
    if (
        !isAdminRole(
            currentRole
        )
    ) {
        await Swal.fire(
            "No tienes permisos",
            "",
            "error"
        );

        return;
    }

    if (
        !id ||
        employeeActionIds.has(
            id
        )
    ) {
        return;
    }

    const employee =
        employees.find(
            emp =>
                String(
                    emp.id
                ) ===
                String(id)
        );

    if (
        !employee
    ) {
        await Swal.fire(
            "Error",
            "El empleado no se encuentra en el local actual.",
            "error"
        );

        return;
    }

    if (
        !matchesCurrentLocal(
            employee
        )
    ) {
        await Swal.fire(
            "Acceso denegado",
            "El empleado no pertenece al local actual.",
            "error"
        );

        return;
    }

    const confirmation =
        await Swal.fire({
            title:
                "Eliminar empleado",

            text:
                "Esta acción elimina el perfil de Firestore. La cuenta de Firebase Authentication no se elimina desde el cliente.",

            icon:
                "warning",

            showCancelButton:
                true,

            confirmButtonText:
                "Eliminar",

            cancelButtonText:
                "Cancelar"
        });

    if (
        !confirmation.isConfirmed
    ) {
        return;
    }

    employeeActionIds.add(
        id
    );

    try {
        await db
            .collection(
                EMPLOYEE_COLLECTION
            )
            .doc(
                id
            )
            .delete();

        await Swal.fire(
            "Empleado eliminado",
            "El perfil del empleado fue eliminado de Firestore.",
            "success"
        );
    } catch (err) {
        console.error(
            "Error eliminando empleado:",
            err
        );

        await Swal.fire(
            "Error",
            err.message ||
                "No se pudo eliminar el empleado.",
            "error"
        );
    } finally {
        employeeActionIds.delete(
            id
        );
    }
}

/*
 * ============================================================
 * EDITAR
 * ============================================================
 */

async function editEmployee(
    id
) {
    if (
        !isAdminRole(
            currentRole
        )
    ) {
        await Swal.fire(
            "No tienes permisos",
            "",
            "error"
        );

        return;
    }

    const employee =
        employees.find(
            emp =>
                String(
                    emp.id
                ) ===
                String(id)
        );

    if (
        !employee
    ) {
        await Swal.fire(
            "Error",
            "No se encontró el empleado.",
            "error"
        );

        return;
    }

    if (
        !matchesCurrentLocal(
            employee
        )
    ) {
        await Swal.fire(
            "Acceso denegado",
            "El empleado no pertenece al local actual.",
            "error"
        );

        return;
    }

    const result =
        await Swal.fire({
            title:
                "Editar empleado",

            html:
                `
                    <div
                        style="
                            text-align:left;
                            font-size:0.92rem;
                            color:#374151;
                            margin-bottom:10px;
                        "
                    >
                        <strong>
                            Local:
                        </strong>
                        ${escapeHtml(
                            employee.localNombre ||
                                currentLocalInfo.nombre ||
                                "—"
                        )}
                        <br>

                        <strong>
                            Documento:
                        </strong>
                        ${escapeHtml(
                            employee.localNumeroDocumento ||
                                currentLocalInfo.numeroDocumento ||
                                "—"
                        )}
                        <br>

                        <strong>
                            Tipo de documento:
                        </strong>
                        ${escapeHtml(
                            employee.localTipoDocumento ||
                                currentLocalInfo.tipoDocumento ||
                                "—"
                        )}
                        <br>

                        <strong>
                            NIT:
                        </strong>
                        ${escapeHtml(
                            employee.localNIT ||
                                currentLocalInfo.nit ||
                                "—"
                        )}
                        <br>

                        <strong>
                            NRC:
                        </strong>
                        ${escapeHtml(
                            employee.localNRC ||
                                currentLocalInfo.nrc ||
                                "—"
                        )}
                        <br>

                        <strong>
                            Ubicación:
                        </strong>
                        ${escapeHtml(
                            employee.localUbicacion ||
                                currentLocalInfo.ubicacion ||
                                "—"
                        )}
                    </div>

                    <input
                        id="editName"
                        class="swal2-input"
                        placeholder="Nombre"
                        value="${escapeHtml(
                            employee.name ||
                                ""
                        )}"
                    >

                    <input
                        id="editEmail"
                        class="swal2-input"
                        placeholder="Correo electrónico"
                        value="${escapeHtml(
                            employee.email ||
                                ""
                        )}"
                        readonly
                    >

                    <select
                        id="editPosition"
                        class="swal2-input"
                        style="
                            height:auto;
                            padding:12px 10px;
                        "
                    >
                        ${buildPositionOptions(
                            employee.position ||
                                ""
                        )}
                    </select>

                    <input
                        id="editPhone"
                        class="swal2-input"
                        placeholder="Teléfono"
                        value="${escapeHtml(
                            employee.phone ||
                                ""
                        )}"
                    >

                    <div
                        style="
                            text-align:left;
                            font-size:0.9rem;
                            color:#6b7280;
                            margin-top:6px;
                        "
                    >
                        El local permanece fijo.
                        El correo se mantiene fijo
                        para no desincronizar Authentication.
                    </div>
                `,

            confirmButtonText:
                "Actualizar",

            showCancelButton:
                true,

            cancelButtonText:
                "Cancelar",

            focusConfirm:
                false,

            preConfirm:
                () => {
                    const name =
                        document
                            .getElementById(
                                "editName"
                            )
                            ?.value
                            .trim() ||
                        "";

                    const email =
                        document
                            .getElementById(
                                "editEmail"
                            )
                            ?.value
                            .trim() ||
                        "";

                    const position =
                        document
                            .getElementById(
                                "editPosition"
                            )
                            ?.value
                            .trim() ||
                        "";

                    const phone =
                        document
                            .getElementById(
                                "editPhone"
                            )
                            ?.value
                            .trim() ||
                        "";

                    if (
                        !name ||
                        !position
                    ) {
                        Swal.showValidationMessage(
                            "Nombre y posición son obligatorios."
                        );

                        return;
                    }

                    return {
                        name,
                        email,
                        position,
                        phone
                    };
                }
        });

    if (
        !result.isConfirmed
    ) {
        return;
    }

    if (
        employeeActionIds.has(
            id
        )
    ) {
        return;
    }

    employeeActionIds.add(
        id
    );

    try {
        const localInfo =
            getCurrentLocalInfo();

        const employeeRef =
            db
                .collection(
                    EMPLOYEE_COLLECTION
                )
                .doc(
                    id
                );

        /*
         * Esta lectura sí es necesaria:
         * confirma que el empleado no cambió
         * de local desde que se cargó la tabla.
         */
        const latestSnap =
            await employeeRef.get();

        if (
            !latestSnap.exists
        ) {
            throw new Error(
                "El empleado ya no existe."
            );
        }

        const latest =
            latestSnap.data() ||
            {};

        if (
            !matchesCurrentLocal(
                latest
            )
        ) {
            throw new Error(
                "El empleado no pertenece al local actual."
            );
        }

        await employeeRef.update({
            name:
                result.value.name,

            email:
                result.value.email,

            position:
                result.value.position,

            phone:
                result.value.phone,

            id_local:
                currentLocalId,

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

            localTipoDocumento:
                localInfo.tipoDocumento ||
                "",

            localNIT:
                localInfo.nit ||
                "",

            localNRC:
                localInfo.nrc ||
                "",

            updatedAt:
                firebase.firestore
                    .FieldValue
                    .serverTimestamp(),

            updatedBy:
                auth.currentUser
                    ? auth.currentUser.uid
                    : null
        });

        const index =
            employees.findIndex(
                emp =>
                    String(
                        emp.id
                    ) ===
                    String(id)
            );

        if (
            index >=
            0
        ) {
            employees[
                index
            ] = {
                ...employees[
                    index
                ],

                name:
                    result.value.name,

                email:
                    result.value.email,

                position:
                    result.value.position,

                phone:
                    result.value.phone,

                id_local:
                    currentLocalId,

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

                localTipoDocumento:
                    localInfo.tipoDocumento ||
                    "",

                localNIT:
                    localInfo.nit ||
                    "",

                localNRC:
                    localInfo.nrc ||
                    ""
            };
        }

        renderFilteredEmployees();

        await Swal.fire(
            "Empleado actualizado",
            "",
            "success"
        );
    } catch (err) {
        console.error(
            "Error actualizando empleado:",
            err
        );

        await Swal.fire(
            "Error",
            err.message ||
                "No se pudo actualizar el empleado.",
            "error"
        );
    } finally {
        employeeActionIds.delete(
            id
        );
    }
}

/*
 * ============================================================
 * EVENTOS
 * ============================================================
 */

if (
    newEmployeeBtn
) {
    newEmployeeBtn.addEventListener(
        "click",
        handleCreateEmployee
    );
}

if (
    searchInput
) {
    searchInput.addEventListener(
        "input",
        renderFilteredEmployees
    );
}

/*
 * ============================================================
 * INICIALIZACIÓN
 * ============================================================
 */

auth.onAuthStateChanged(
    async user => {
        if (!user) {
            stopEmployeesListener();

            window.location.href =
                "index.html";

            return;
        }

        try {
            const context =
                await resolveEmployeeContext(
                    user
                );

            if (
                !context.id_local
            ) {
                employees =
                    [];

                renderEmployees(
                    []
                );

                renderLocalWarning();

                return;
            }

            if (
                !isAdminRole(
                    context.role
                )
            ) {
                if (
                    newEmployeeBtn
                ) {
                    newEmployeeBtn.style.display =
                        "none";
                }
            } else if (
                newEmployeeBtn
            ) {
                newEmployeeBtn.style.display =
                    "";
            }

            if (
                typeof window
                    .renderNavigationForRole ===
                "function"
            ) {
                window.renderNavigationForRole(
                    context.role
                );
            }

            loadEmployees();
        } catch (err) {
            console.error(
                "Error inicializando empleados:",
                err
            );

            if (
                tableBody
            ) {
                tableBody.innerHTML =
                    `
                        <tr>
                            <td colspan="5">
                                No se pudo cargar el contexto del usuario.
                            </td>
                        </tr>
                    `;
            }

            await Swal.fire({
                icon:
                    "error",

                title:
                    "No se pudo cargar empleados",

                text:
                    err.message ||
                    "No se pudo resolver el usuario o local actual."
            });
        }
    }
);

/*
 * ============================================================
 * LIMPIEZA
 * ============================================================
 */

window.addEventListener(
    "beforeunload",
    () => {
        stopEmployeesListener();
    }
);

/*
 * ============================================================
 * API GLOBAL
 * ============================================================
 */

window.editEmployee =
    editEmployee;

window.deleteEmployee =
    deleteEmployee;