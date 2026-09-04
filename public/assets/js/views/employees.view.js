// assets/js/views/employees.view.js

"use strict";

const mvc =
    window.InventoryMVC ||
    (window.InventoryMVC = {
        models: {},
        views: {},
        controllers: {}
    });

mvc.views =
    mvc.views ||
    {};

const selectors = Object.freeze({

    tableBody:
        "#employeesTable tbody",

    searchInput:
        "#searchEmployee",

    newButton:
        "#btnNewEmployee",

    greetings:
        ".userGreeting"

});

function qs(
    selector,
    root = document
) {

    return root.querySelector(
        selector
    );

}

function qsa(
    selector,
    root = document
) {

    return Array.from(
        root.querySelectorAll(
            selector
        )
    );

}

function escapeHtml(
    value = ""
) {

    return String(
        value ?? ""
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

function getElements() {

    return {

        tableBody:
            qs(
                selectors.tableBody
            ),

        searchInput:
            qs(
                selectors.searchInput
            ),

        newButton:
            qs(
                selectors.newButton
            ),

        greetings:
            qsa(
                selectors.greetings
            )

    };

}

function setGreeting(
    name = "Usuario",
    role = ""
) {

    const elements =
        qsa(
            selectors.greetings
        );

    elements.forEach(
        element => {

            element.textContent =
                `Hola, ${name}${
                    role
                        ? ` (${role})`
                        : ""
                }`;

        }
    );

}

function setNewButtonVisible(
    visible
) {

    const button =
        qs(
            selectors.newButton
        );

    if (
        !button
    ) {
        return;
    }

    button.style.display =
        visible
            ? ""
            : "none";

}

function renderLoading() {

    const tableBody =
        qs(
            selectors.tableBody
        );

    if (
        !tableBody
    ) {
        return;
    }

    tableBody.innerHTML =
        `
            <tr>
                <td colspan="5">
                    Cargando empleados...
                </td>
            </tr>
        `;

}

function renderEmpty(
    message = "No hay empleados para este local."
) {

    const tableBody =
        qs(
            selectors.tableBody
        );

    if (
        !tableBody
    ) {
        return;
    }

    tableBody.innerHTML =
        `
            <tr>
                <td colspan="5">
                    ${escapeHtml(
                        message
                    )}
                </td>
            </tr>
        `;

}

function renderEmployees(
    employees = [],
    options = {}
) {

    const tableBody =
        qs(
            selectors.tableBody
        );

    if (
        !tableBody
    ) {
        return;
    }

    tableBody.innerHTML =
        "";

    if (
        !Array.isArray(
            employees
        ) ||
        !employees.length
    ) {

        renderEmpty(
            options.emptyMessage ||
            "No hay empleados para este local."
        );

        return;

    }

    employees.forEach(
        employee => {

            const row =
                document.createElement(
                    "tr"
                );

            const localName =
                employee.localNombre ||
                options.localName ||
                "—";

            const canDelete =
                options.canDelete ===
                true;

            row.innerHTML =
                `

                    <td>
                        ${escapeHtml(
                            employee.name ||
                            ""
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            employee.position ||
                            ""
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            employee.phone ||
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
                                employee.id
                            )}"
                        >
                            Editar
                        </button>

                        ${
                            canDelete
                                ? `
                                    <button
                                        type="button"
                                        class="btn-delete"
                                        data-action="delete"
                                        data-id="${escapeHtml(
                                            employee.id
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

}

function getSearchValue() {

    return String(
        qs(
            selectors.searchInput
        )?.value ||
            ""
    )
        .trim()
        .toLowerCase();

}

function showLocalWarning() {

    if (
        typeof Swal ===
        "undefined"
    ) {
        return;
    }

    return Swal.fire({

        icon:
            "warning",

        title:
            "Sin local asignado",

        text:
            "Este usuario no tiene id_local, por lo que no se puede cargar ni guardar empleados por local."

    });

}

function buildPositionOptions(
    options = [],
    selected = ""
) {

    return options
        .map(
            position => {

                const selectedAttribute =
                    position ===
                    selected
                        ? "selected"
                        : "";

                return `
                    <option
                        value="${escapeHtml(
                            position
                        )}"
                        ${selectedAttribute}
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

function getLocalHtml(
    localInfo = {}
) {

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
                Local:
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

    `;

}

async function openCreateDialog(
    localInfo,
    positionOptions
) {

    const result =
        await Swal.fire({

            title:
                "Nuevo empleado",

            html:

                getLocalHtml(
                    localInfo
                ) +

                `

                    <input
                        id="employeeName"
                        class="swal2-input"
                        placeholder="Nombre"
                        autocomplete="off"
                    >

                    <input
                        id="employeeEmail"
                        class="swal2-input"
                        placeholder="Correo electrónico"
                        type="email"
                        autocomplete="off"
                    >

                    <input
                        id="employeePassword"
                        class="swal2-input"
                        placeholder="Contraseña temporal"
                        type="password"
                        autocomplete="new-password"
                    >

                    <input
                        id="employeeConfirmPassword"
                        class="swal2-input"
                        placeholder="Confirmar contraseña"
                        type="password"
                        autocomplete="new-password"
                    >

                    <select
                        id="employeePosition"
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
                            positionOptions,
                            "Vendedor"
                        )}

                    </select>

                    <input
                        id="employeePhone"
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
                        El empleado se guardará con el
                        <strong>id_local</strong>
                        del usuario autenticado.
                    </div>

                `,

            confirmButtonText:
                "Guardar",

            cancelButtonText:
                "Cancelar",

            showCancelButton:
                true,

            focusConfirm:
                false,

            preConfirm:
                () => {

                    const name =
                        qs(
                            "#employeeName"
                        )?.value
                            .trim() ||
                        "";

                    const email =
                        qs(
                            "#employeeEmail"
                        )?.value
                            .trim() ||
                        "";

                    const password =
                        qs(
                            "#employeePassword"
                        )?.value ||
                        "";

                    const confirmPassword =
                        qs(
                            "#employeeConfirmPassword"
                        )?.value ||
                        "";

                    const position =
                        qs(
                            "#employeePosition"
                        )?.value
                            .trim() ||
                        "";

                    const phone =
                        qs(
                            "#employeePhone"
                        )?.value
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

                        return false;

                    }

                    if (
                        password.length <
                        6
                    ) {

                        Swal.showValidationMessage(
                            "La contraseña debe tener al menos 6 caracteres."
                        );

                        return false;

                    }

                    if (
                        password !==
                        confirmPassword
                    ) {

                        Swal.showValidationMessage(
                            "Las contraseñas no coinciden."
                        );

                        return false;

                    }

                    return {

                        name,

                        email:
                            email.toLowerCase(),

                        password,

                        position,

                        phone

                    };

                }

        });

    return result.isConfirmed
        ? result.value
        : null;

}

async function openEditDialog(
    employee,
    localInfo,
    positionOptions
) {

    const result =
        await Swal.fire({

            title:
                "Editar empleado",

            html:

                getLocalHtml(
                    localInfo
                ) +

                `

                    <input
                        id="editEmployeeName"
                        class="swal2-input"
                        placeholder="Nombre"
                        value="${escapeHtml(
                            employee.name ||
                            ""
                        )}"
                    >

                    <input
                        id="editEmployeeEmail"
                        class="swal2-input"
                        placeholder="Correo electrónico"
                        value="${escapeHtml(
                            employee.email ||
                            ""
                        )}"
                        readonly
                    >

                    <select
                        id="editEmployeePosition"
                        class="swal2-input"
                        style="
                            height:auto;
                            padding:12px 10px;
                        "
                    >

                        ${buildPositionOptions(
                            positionOptions,
                            employee.position ||
                            ""
                        )}

                    </select>

                    <input
                        id="editEmployeePhone"
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
                        El correo se mantiene fijo para
                        no desincronizar Authentication.
                    </div>

                `,

            confirmButtonText:
                "Actualizar",

            cancelButtonText:
                "Cancelar",

            showCancelButton:
                true,

            focusConfirm:
                false,

            preConfirm:
                () => {

                    const name =
                        qs(
                            "#editEmployeeName"
                        )?.value
                            .trim() ||
                        "";

                    const position =
                        qs(
                            "#editEmployeePosition"
                        )?.value
                            .trim() ||
                        "";

                    const phone =
                        qs(
                            "#editEmployeePhone"
                        )?.value
                            .trim() ||
                        "";

                    if (
                        !name ||
                        !position
                    ) {

                        Swal.showValidationMessage(
                            "Nombre y posición son obligatorios."
                        );

                        return false;

                    }

                    return {

                        name,

                        position,

                        phone

                    };

                }

        });

    return result.isConfirmed
        ? result.value
        : null;

}

async function confirmDelete(
    employee
) {

    const result =
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

    return result.isConfirmed;

}

async function showSuccess(
    title,
    text = ""
) {

    return Swal.fire({

        icon:
            "success",

        title,

        text

    });

}

async function showError(
    title,
    text = ""
) {

    return Swal.fire({

        icon:
            "error",

        title,

        text

    });

}

async function showWarning(
    title,
    text = ""
) {

    return Swal.fire({

        icon:
            "warning",

        title,

        text

    });

}

function bindTableActions(
    {
        onEdit,
        onDelete
    } = {}
) {

    const tableBody =
        qs(
            selectors.tableBody
        );

    if (
        !tableBody
    ) {
        return;
    }

    tableBody.onclick =
        event => {

            const button =
                event.target.closest(
                    "button[data-action]"
                );

            if (
                !button
            ) {
                return;
            }

            const id =
                String(
                    button.dataset.id ||
                    ""
                ).trim();

            const action =
                button.dataset.action;

            if (
                !id
            ) {
                return;
            }

            if (
                action ===
                    "edit" &&
                typeof onEdit ===
                    "function"
            ) {

                onEdit(
                    id
                );

                return;

            }

            if (
                action ===
                    "delete" &&
                typeof onDelete ===
                    "function"
            ) {

                onDelete(
                    id
                );

            }

        };

}

const view = Object.freeze({

    selectors,

    qs,

    qsa,

    escapeHtml,

    getElements,

    getSearchValue,

    setGreeting,

    setNewButtonVisible,

    renderLoading,

    renderEmpty,

    renderEmployees,

    showLocalWarning,

    openCreateDialog,

    openEditDialog,

    confirmDelete,

    showSuccess,

    showError,

    showWarning,

    bindTableActions

});

mvc.views.employees =
    view;

export default view;