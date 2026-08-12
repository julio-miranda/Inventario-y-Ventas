// assets/js/gastos.js
//
// Dependencias:
// - assets/js/app.js
//
// app.js proporciona:
// - db
// - auth
// - formatMoney
// - getTodayBounds
// - getCurrentLocalId
// - getCurrentLocalInfo
// - getCurrentUserContext
// - renderNavigationForRole
// - getCanonicalRole
//
// Optimización:
// - No consulta empleados directamente.
// - No consulta local directamente.
// - Reutiliza el contexto central de app.js.
// - No ejecuta una consulta adicional para el resumen.
// - Solo mantiene:
//      1 listener para ventas del día.
//      1 listener para gastos del día.
// - El resumen se calcula desde las cachés.
// - Se evita crear listeners duplicados.
// - Los listeners se limpian al salir de la página.
//

const expenseConceptInput =
  document.getElementById(
    "expenseConcept"
  );

const expenseCategoryInput =
  document.getElementById(
    "expenseCategory"
  );

const expenseAmountInput =
  document.getElementById(
    "expenseAmount"
  );

const expensePaymentInput =
  document.getElementById(
    "expensePayment"
  );

const expenseNotesInput =
  document.getElementById(
    "expenseNotes"
  );

const btnAddExpense =
  document.getElementById(
    "btnAddExpense"
  );

const btnClearExpenseForm =
  document.getElementById(
    "btnClearExpenseForm"
  );

const expensesTableBody =
  document.querySelector(
    "#expensesTable tbody"
  );

const summarySalesEl =
  document.getElementById(
    "summarySales"
  );

const summaryExpensesEl =
  document.getElementById(
    "summaryExpenses"
  );

const summaryNetEl =
  document.getElementById(
    "summaryNet"
  );

let currentUserInfo = {
  uid: null,
  employeeId: "",
  name: "Usuario",
  role: "",
  id_local: ""
};

let expensesCache = [];
let salesCache = [];

let unsubscribeExpenses =
  null;

let unsubscribeSales =
  null;

let isAddingExpense =
  false;

let isDeletingExpense =
  false;

let expensesListenersStarted =
  false;

let currentContextLoaded =
  false;

/*
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

function escapeHtml(
  text
) {
  return String(
    text ?? ""
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

function numberOrZero(
  value
) {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}

function formatDateOnly(
  value
) {
  if (!value) {
    return "-";
  }

  const date =
    value.seconds
      ? new Date(
          value.seconds *
            1000
        )
      : new Date(value);

  if (
    isNaN(
      date.getTime()
    )
  ) {
    return "-";
  }

  return date.toLocaleDateString(
    "es-ES"
  );
}

function formatTimeOnly(
  value
) {
  if (!value) {
    return "-";
  }

  const date =
    value.seconds
      ? new Date(
          value.seconds *
            1000
        )
      : new Date(value);

  if (
    isNaN(
      date.getTime()
    )
  ) {
    return "-";
  }

  return date.toLocaleTimeString(
    "es-ES",
    {
      hour:
        "2-digit",

      minute:
        "2-digit"
    }
  );
}

function currency(
  value
) {
  if (
    typeof formatMoney ===
    "function"
  ) {
    return formatMoney(
      value
    );
  }

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
      value || 0
    )
  );
}

function getStoredUser() {
  try {
    return (
      JSON.parse(
        localStorage.getItem(
          "currentUser"
        )
      ) || null
    );
  } catch {
    return null;
  }
}

/*
 * ============================================================
 * PERMISOS
 * ============================================================
 */

function canManageExpenses(
  role = ""
) {
  const canonical =
    typeof window
      .getCanonicalRole ===
    "function"
      ? window.getCanonicalRole(
          role
        )
      : String(
          role || ""
        )
          .trim()
          .toLowerCase();

  return (
    canonical ===
      "Administrador" ||
    canonical ===
      "Cajero" ||
    canonical ===
      "Vendedor" ||
    canonical ===
      "administrador" ||
    canonical ===
      "cajero" ||
    canonical ===
      "vendedor"
  );
}

function isAdministratorRole(
  role = ""
) {
  const canonical =
    typeof window
      .getCanonicalRole ===
    "function"
      ? window.getCanonicalRole(
          role
        )
      : String(
          role || ""
        ).trim();

  return (
    canonical ===
    "Administrador"
  );
}

/*
 * ============================================================
 * CONTEXTO LOCAL
 * ============================================================
 */

function getCurrentContextLocalId() {
  return String(
    currentUserInfo.id_local ||
      (
        typeof getCurrentLocalId ===
        "function"
          ? getCurrentLocalId()
          : ""
      ) ||
      ""
  ).trim();
}

function getDocumentLocalId(
  data = {}
) {
  return String(
    data.id_local ||
      data.idLocal ||
      data.localId ||
      data.idlocal ||
      ""
  ).trim();
}

function matchesCurrentLocal(
  data = {}
) {
  const targetLocalId =
    getCurrentContextLocalId();

  if (!targetLocalId) {
    return false;
  }

  return (
    getDocumentLocalId(
      data
    ) ===
    targetLocalId
  );
}

/*
 * ============================================================
 * RESUMEN
 * ============================================================
 *
 * NO hace consultas.
 *
 * Usa exclusivamente:
 * - salesCache
 * - expensesCache
 */

function updateDailySummary() {
  const totalSales =
    salesCache.reduce(
      (
        sum,
        item
      ) =>
        sum +
        numberOrZero(
          item.total
        ),
      0
    );

  const totalExpenses =
    expensesCache.reduce(
      (
        sum,
        item
      ) =>
        sum +
        numberOrZero(
          item.amount
        ),
      0
    );

  const net =
    totalSales -
    totalExpenses;

  if (
    summarySalesEl
  ) {
    summarySalesEl.textContent =
      currency(
        totalSales
      );
  }

  if (
    summaryExpensesEl
  ) {
    summaryExpensesEl.textContent =
      currency(
        totalExpenses
      );
  }

  if (
    summaryNetEl
  ) {
    summaryNetEl.textContent =
      currency(
        net
      );
  }
}

/*
 * ============================================================
 * FORMULARIO
 * ============================================================
 */

function clearForm() {
  if (
    expenseConceptInput
  ) {
    expenseConceptInput.value =
      "";
  }

  if (
    expenseCategoryInput
  ) {
    expenseCategoryInput.value =
      "Transporte";
  }

  if (
    expenseAmountInput
  ) {
    expenseAmountInput.value =
      "0";
  }

  if (
    expensePaymentInput
  ) {
    expensePaymentInput.value =
      "Efectivo";
  }

  if (
    expenseNotesInput
  ) {
    expenseNotesInput.value =
      "";
  }
}

function setExpenseButtonsDisabled(
  disabled
) {
  if (
    btnAddExpense
  ) {
    btnAddExpense.disabled =
      disabled;
  }

  if (
    btnClearExpenseForm
  ) {
    btnClearExpenseForm.disabled =
      disabled;
  }
}

/*
 * ============================================================
 * ELIMINACIÓN
 * ============================================================
 */

function canDeleteExpenseItem(
  item
) {
  if (!item) {
    return false;
  }

  const currentRole =
    currentUserInfo.role ||
    "";

  const isAdmin =
    isAdministratorRole(
      currentRole
    );

  const isOwner =
    item.userId &&
    currentUserInfo.uid &&
    String(
      item.userId
    ) ===
      String(
        currentUserInfo.uid
      );

  return (
    isAdmin ||
    isOwner
  );
}

/*
 * ============================================================
 * RENDER
 * ============================================================
 */

function renderExpenses(
  list
) {
  if (
    !expensesTableBody
  ) {
    return;
  }

  expensesTableBody.innerHTML =
    "";

  if (
    !list.length
  ) {
    expensesTableBody.innerHTML =
      `
        <tr>
          <td colspan="8">
            No hay gastos registrados hoy.
          </td>
        </tr>
      `;

    return;
  }

  list.forEach(
    item => {
      const tr =
        document.createElement(
          "tr"
        );

      tr.innerHTML = `
        <td>
          ${escapeHtml(
            item.concept ||
            "-"
          )}
        </td>

        <td>
          ${escapeHtml(
            item.category ||
            "-"
          )}
        </td>

        <td>
          ${currency(
            item.amount ||
            0
          )}
        </td>

        <td>
          ${escapeHtml(
            item.paymentMethod ||
            "-"
          )}
        </td>

        <td>
          ${escapeHtml(
            item.userName ||
            "-"
          )}
        </td>

        <td>
          ${escapeHtml(
            formatDateOnly(
              item.createdAt
            )
          )}
        </td>

        <td>
          ${escapeHtml(
            formatTimeOnly(
              item.createdAt
            )
          )}
        </td>

        <td>
          ${
            canDeleteExpenseItem(
              item
            )
              ? `
                <button
                  class="btn-delete"
                  type="button"
                  data-id="${escapeHtml(
                    item.id
                  )}"
                >
                  Eliminar
                </button>
              `
              : "-"
          }
        </td>
      `;

      expensesTableBody.appendChild(
        tr
      );
    }
  );

  expensesTableBody
    .querySelectorAll(
      "button[data-id]"
    )
    .forEach(
      button => {
        if (
          button.dataset.bound ===
          "1"
        ) {
          return;
        }

        button.dataset.bound =
          "1";

        button.addEventListener(
          "click",
          async () => {
            if (
              isDeletingExpense
            ) {
              return;
            }

            const id =
              button.getAttribute(
                "data-id"
              );

            await deleteExpense(
              id
            );
          }
        );
      }
    );
}

/*
 * ============================================================
 * LISTENER DE VENTAS
 * ============================================================
 *
 * Una sola consulta/listener.
 */

function startSalesListener() {
  if (
    unsubscribeSales
  ) {
    return;
  }

  const {
    start,
    end
  } =
    getTodayBounds(
      new Date()
    );

  unsubscribeSales =
    db
      .collection(
        "ventas"
      )
      .where(
        "createdAt",
        ">=",
        start
      )
      .where(
        "createdAt",
        "<=",
        end
      )
      .onSnapshot(
        snapshot => {
          salesCache =
            [];

          snapshot.forEach(
            doc => {
              const data =
                doc.data() || {};

              if (
                !matchesCurrentLocal(
                  data
                )
              ) {
                return;
              }

              salesCache.push({
                id:
                  doc.id,

                ...data
              });
            }
          );

          updateDailySummary();
        },
        error => {
          console.error(
            "Error escuchando ventas del día:",
            error
          );

          salesCache =
            [];

          updateDailySummary();
        }
      );
}

/*
 * ============================================================
 * LISTENER DE GASTOS
 * ============================================================
 *
 * Una sola consulta/listener.
 */

function startExpensesListener() {
  if (
    unsubscribeExpenses
  ) {
    return;
  }

  const {
    start,
    end
  } =
    getTodayBounds(
      new Date()
    );

  unsubscribeExpenses =
    db
      .collection(
        "gastos"
      )
      .where(
        "createdAt",
        ">=",
        start
      )
      .where(
        "createdAt",
        "<=",
        end
      )
      .orderBy(
        "createdAt",
        "desc"
      )
      .onSnapshot(
        snapshot => {
          expensesCache =
            [];

          snapshot.forEach(
            doc => {
              const data =
                doc.data() || {};

              if (
                !matchesCurrentLocal(
                  data
                )
              ) {
                return;
              }

              expensesCache.push({
                id:
                  doc.id,

                ...data
              });
            }
          );

          renderExpenses(
            expensesCache
          );

          updateDailySummary();
        },
        error => {
          console.error(
            "Error escuchando gastos del día:",
            error
          );

          expensesCache =
            [];

          renderExpenses(
            expensesCache
          );

          updateDailySummary();
        }
      );
}

/*
 * ============================================================
 * AGREGAR GASTO
 * ============================================================
 */

async function addExpense() {
  if (
    isAddingExpense
  ) {
    return;
  }

  if (
    !canManageExpenses(
      currentUserInfo.role
    )
  ) {
    await Swal.fire(
      "No tienes permisos",
      "No tienes permisos para registrar gastos.",
      "error"
    );

    return;
  }

  const id_local =
    getCurrentContextLocalId();

  if (!id_local) {
    console.error(
      "No se encontró id_local para el usuario actual:",
      currentUserInfo
    );

    await Swal.fire(
      "Error de configuración",
      "El usuario actual no tiene un local asociado. No se puede registrar el gasto.",
      "error"
    );

    return;
  }

  const concept =
    String(
      expenseConceptInput?.value ||
        ""
    ).trim();

  const category =
    String(
      expenseCategoryInput?.value ||
        ""
    ).trim();

  const amount =
    Number(
      expenseAmountInput?.value ||
        0
    );

  const paymentMethod =
    String(
      expensePaymentInput?.value ||
        ""
    ).trim();

  const notes =
    String(
      expenseNotesInput?.value ||
        ""
    ).trim();

  if (!concept) {
    await Swal.fire(
      "Validación",
      "El concepto del gasto es obligatorio.",
      "warning"
    );

    return;
  }

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {
    await Swal.fire(
      "Validación",
      "Ingresa un monto válido mayor que cero.",
      "warning"
    );

    return;
  }

  isAddingExpense =
    true;

  setExpenseButtonsDisabled(
    true
  );

  try {
    const localInfo =
      typeof getCurrentLocalInfo ===
      "function"
        ? getCurrentLocalInfo()
        : {};

    await db
      .collection(
        "gastos"
      )
      .add({
        concept,

        category,

        amount,

        paymentMethod,

        notes,

        dayKey:
          getTodayBounds(
            new Date()
          ).dayKey,

        createdAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp(),

        userId:
          currentUserInfo.uid ||
          (
            auth.currentUser
              ? auth.currentUser
                  .uid
              : null
          ),

        userName:
          currentUserInfo.name ||
          "Usuario",

        id_local,

        localNombre:
          localInfo.nombre ||
          "",

        localNumeroDocumento:
          localInfo.numeroDocumento ||
          "",

        localUbicacion:
          localInfo.ubicacion ||
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
          ""
      });

    await Swal.fire({
      toast:
        true,

      position:
        "top-end",

      icon:
        "success",

      title:
        "Gasto agregado",

      showConfirmButton:
        false,

      timer:
        1400
    });

    clearForm();

    /*
     * NO se ejecuta ninguna consulta adicional.
     *
     * El onSnapshot de gastos actualizará:
     * - expensesCache
     * - tabla
     * - resumen
     */
  } catch (error) {
    console.error(
      "Error agregando gasto:",
      error
    );

    await Swal.fire(
      "Error",
      error.message ||
        "No se pudo guardar el gasto.",
      "error"
    );
  } finally {
    isAddingExpense =
      false;

    setExpenseButtonsDisabled(
      false
    );
  }
}

/*
 * ============================================================
 * ELIMINAR GASTO
 * ============================================================
 */

async function deleteExpense(
  id
) {
  if (
    isDeletingExpense
  ) {
    return;
  }

  if (
    !canManageExpenses(
      currentUserInfo.role
    )
  ) {
    await Swal.fire(
      "No tienes permisos",
      "No tienes permisos para eliminar gastos.",
      "error"
    );

    return;
  }

  const target =
    expensesCache.find(
      item =>
        item.id ===
        id
    );

  if (!target) {
    await Swal.fire(
      "Error",
      "No se encontró el gasto.",
      "error"
    );

    return;
  }

  const currentRole =
    currentUserInfo.role ||
    "";

  const isAdmin =
    isAdministratorRole(
      currentRole
    );

  const isOwner =
    target.userId &&
    currentUserInfo.uid &&
    String(
      target.userId
    ) ===
      String(
        currentUserInfo.uid
      );

  if (
    !isAdmin &&
    !isOwner
  ) {
    await Swal.fire(
      "No tienes permisos",
      "Solo el creador o el administrador pueden eliminar este gasto.",
      "error"
    );

    return;
  }

  const currentLocalId =
    getCurrentContextLocalId();

  const expenseLocalId =
    getDocumentLocalId(
      target
    );

  /*
   * Este control adicional aplica a usuarios
   * que no sean administradores.
   */
  if (
    !isAdmin &&
    currentLocalId &&
    expenseLocalId &&
    currentLocalId !==
      expenseLocalId
  ) {
    await Swal.fire(
      "No tienes permisos",
      "Este gasto pertenece a otro local.",
      "error"
    );

    return;
  }

  const result =
    await Swal.fire({
      title:
        "Eliminar gasto",

      text:
        "Esta acción no se puede deshacer.",

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
    !result.isConfirmed
  ) {
    return;
  }

  isDeletingExpense =
    true;

  try {
    await db
      .collection(
        "gastos"
      )
      .doc(id)
      .delete();

    await Swal.fire({
      toast:
        true,

      position:
        "top-end",

      icon:
        "success",

      title:
        "Gasto eliminado",

      showConfirmButton:
        false,

      timer:
        1400
    });

    /*
     * No se consulta nuevamente Firestore.
     * El onSnapshot actualizará automáticamente
     * la tabla y el resumen.
     */
  } catch (error) {
    console.error(
      "Error eliminando gasto:",
      error
    );

    await Swal.fire(
      "Error",
      error.message ||
        "No se pudo eliminar el gasto.",
      "error"
    );
  } finally {
    isDeletingExpense =
      false;
  }
}

/*
 * ============================================================
 * CONTEXTO DE USUARIO
 * ============================================================
 */

async function initializeExpenseContext(
  user
) {
  if (
    currentContextLoaded &&
    currentUserInfo.uid ===
      user.uid
  ) {
    return;
  }

  /*
   * Utilizar el contexto central de app.js.
   * Esto evita otra consulta a empleados/local.
   */
  if (
    typeof window
      .getCurrentUserContext !==
    "function"
  ) {
    throw new Error(
      "app.js no tiene disponible getCurrentUserContext()."
    );
  }

  const context =
    await window.getCurrentUserContext(
      user
    );

  if (!context) {
    throw new Error(
      "No se pudo resolver el contexto del usuario."
    );
  }

  currentUserInfo = {
    uid:
      context.uid ||
      user.uid,

    employeeId:
      context.employeeId ||
      "",

    name:
      context.name ||
      user.email ||
      "Usuario",

    role:
      context.role ||
      "",

    id_local:
      String(
        context.id_local ||
          ""
      ).trim()
  };

  currentContextLoaded =
    true;

  /*
   * Actualizar saludo.
   */
  const greetingEls =
    document.querySelectorAll(
      ".userGreeting"
    );

  greetingEls.forEach(
    element => {
      element.textContent =
        `Hola, ${currentUserInfo.name} (${currentUserInfo.role || "Usuario"})`;
    }
  );

  /*
   * La navegación también se resuelve
   * utilizando el rol ya cargado.
   */
  if (
    typeof renderNavigationForRole ===
    "function"
  ) {
    renderNavigationForRole(
      currentUserInfo.role
    );
  }
}

/*
 * ============================================================
 * AUTH
 * ============================================================
 */

auth.onAuthStateChanged(
  async user => {
    if (!user) {
      currentContextLoaded =
        false;

      currentUserInfo = {
        uid:
          null,

        employeeId:
          "",

        name:
          "Usuario",

        role:
          "",

        id_local:
          ""
      };

      if (
        typeof unsubscribeSales ===
        "function"
      ) {
        unsubscribeSales();
      }

      if (
        typeof unsubscribeExpenses ===
        "function"
      ) {
        unsubscribeExpenses();
      }

      unsubscribeSales =
        null;

      unsubscribeExpenses =
        null;

      salesCache =
        [];

      expensesCache =
        [];

      window.location.href =
        "index.html";

      return;
    }

    try {
      await initializeExpenseContext(
        user
      );

      if (
        !canManageExpenses(
          currentUserInfo.role
        )
      ) {
        await Swal.fire({
          icon:
            "error",

          title:
            "Acceso denegado",

          text:
            "No tienes permisos para administrar gastos."
        });

        window.location.href =
          "dashboard.html";

        return;
      }

      if (
        !currentUserInfo.id_local
      ) {
        await Swal.fire({
          icon:
            "error",

          title:
            "Local no asignado",

          text:
            "Tu usuario no tiene un local asociado. No puedes administrar gastos hasta que se le asigne uno."
        });

        window.location.href =
          "dashboard.html";

        return;
      }

      if (
        !expensesListenersStarted
      ) {
        expensesListenersStarted =
          true;

        /*
         * EXACTAMENTE dos listeners de datos:
         *
         * 1. ventas del día
         * 2. gastos del día
         *
         * No se ejecuta ninguna consulta adicional
         * para construir el resumen.
         */
        startSalesListener();

        startExpensesListener();
      }

      updateDailySummary();

    } catch (error) {
      console.error(
        "Error inicializando gastos:",
        error
      );

      await Swal.fire({
        icon:
          "error",

        title:
          "No se pudo cargar Gastos",

        text:
          error.message ||
          "No se pudo resolver el usuario y su local."
      });

      window.location.href =
        "dashboard.html";
    }
  }
);

/*
 * ============================================================
 * DOM
 * ============================================================
 */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    if (
      btnAddExpense
    ) {
      btnAddExpense.addEventListener(
        "click",
        event => {
          event.preventDefault();

          addExpense();
        }
      );
    }

    if (
      btnClearExpenseForm
    ) {
      btnClearExpenseForm.addEventListener(
        "click",
        event => {
          event.preventDefault();

          clearForm();
        }
      );
    }

    /*
     * app.js ya registra estos botones.
     *
     * No añadimos listeners duplicados aquí.
     */

    window.addEventListener(
      "beforeunload",
      () => {
        if (
          typeof unsubscribeSales ===
          "function"
        ) {
          unsubscribeSales();
        }

        if (
          typeof unsubscribeExpenses ===
          "function"
        ) {
          unsubscribeExpenses();
        }

        unsubscribeSales =
          null;

        unsubscribeExpenses =
          null;

        expensesListenersStarted =
          false;
      }
    );
  }
);