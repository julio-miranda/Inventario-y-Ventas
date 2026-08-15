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
// - ensureSessionDataLoaded
// - getSessionCollection
// - getSessionCollectionData
// - upsertSessionDocument
// - removeSessionDocument
// - renderNavigationForRole
// - getCanonicalRole
//
// Características:
// - Los gastos se filtran por una fecha seleccionada.
// - El resumen financiero utiliza la fecha seleccionada.
// - Se puede registrar un gasto con una fecha determinada.
// - Se puede cambiar la fecha de un gasto existente.
// - Al cambiar la fecha se conserva la hora original.
// - La caché de sesión se mantiene como fuente de lectura.
// - No se agregan lecturas adicionales a Firestore después
//   de registrar, editar o eliminar.
//

(() => {
  "use strict";

  /*
   * ==========================================================
   * CONSTANTES
   * ==========================================================
   */

  const EXPENSES_COLLECTION =
    "gastos";

  const SALES_COLLECTION =
    "ventas";

  /*
   * ==========================================================
   * DOM
   * ==========================================================
   */

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

  const expenseDateInput =
    document.getElementById(
      "expenseDate"
    );

  const expenseNotesInput =
    document.getElementById(
      "expenseNotes"
    );

  const expenseFilterDateInput =
    document.getElementById(
      "expenseFilterDate"
    );

  const btnExpenseFilterToday =
    document.getElementById(
      "btnExpenseFilterToday"
    );

  const btnExpenseFilterYesterday =
    document.getElementById(
      "btnExpenseFilterYesterday"
    );

  const btnExpenseFilterReset =
    document.getElementById(
      "btnExpenseFilterReset"
    );

  const expenseSelectedDateLabel =
    document.getElementById(
      "expenseSelectedDateLabel"
    );

  const expensesTableTitle =
    document.getElementById(
      "expensesTableTitle"
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

  /*
   * ==========================================================
   * ESTADO
   * ==========================================================
   */

  let currentUserInfo = {
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

  let expensesCache =
    [];

  let salesCache =
    [];

  let isAddingExpense =
    false;

  let isDeletingExpense =
    false;

  let isChangingExpenseDate =
    false;

  let currentContextLoaded =
    false;

  let dataLoadedFromSession =
    false;

  let selectedDateKey =
    "";

  /*
   * ==========================================================
   * UTILIDADES
   * ==========================================================
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
      Number(
        value
      );

    return Number.isFinite(
      number
    )
      ? number
      : 0;
  }

  function pad2(
    value
  ) {
    return String(
      value
    ).padStart(
      2,
      "0"
    );
  }

  function getLocalDateKey(
    date = new Date()
  ) {
    return [
      date.getFullYear(),
      pad2(
        date.getMonth() + 1
      ),
      pad2(
        date.getDate()
      )
    ].join("-");
  }

  function parseDateInput(
    value
  ) {
    const raw =
      String(
        value ||
          ""
      ).trim();

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        raw
      )
    ) {
      return null;
    }

    const [
      year,
      month,
      day
    ] =
      raw
        .split("-")
        .map(
          Number
        );

    const date =
      new Date(
        year,
        month - 1,
        day,
        0,
        0,
        0,
        0
      );

    if (
      date.getFullYear() !==
        year ||
      date.getMonth() !==
        month - 1 ||
      date.getDate() !==
        day
    ) {
      return null;
    }

    return date;
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

      return Number.isNaN(
        date.getTime()
      )
        ? 0
        : date.getTime();
    }

    if (
      typeof value ===
        "object" &&
      typeof value.seconds ===
        "number"
    ) {
      const nanoseconds =
        typeof value.nanoseconds ===
        "number"
          ? value.nanoseconds
          : 0;

      return (
        value.seconds *
          1000 +
        Math.floor(
          nanoseconds /
            1000000
        )
      );
    }

    if (
      value instanceof
      Date
    ) {
      return value.getTime();
    }

    const numeric =
      Number(
        value
      );

    if (
      Number.isFinite(
        numeric
      )
    ) {
      return numeric;
    }

    const date =
      new Date(
        value
      );

    return Number.isNaN(
      date.getTime()
    )
      ? 0
      : date.getTime();
  }

  function getDateKeyFromTimestamp(
    value
  ) {
    const timestamp =
      getTimestampMs(
        value
      );

    if (
      !timestamp
    ) {
      return "";
    }

    return getLocalDateKey(
      new Date(
        timestamp
      )
    );
  }

  function formatDateOnly(
    value
  ) {
    const timestamp =
      getTimestampMs(
        value
      );

    if (
      !timestamp
    ) {
      return "-";
    }

    return new Date(
      timestamp
    ).toLocaleDateString(
      "es-ES"
    );
  }

  function formatTimeOnly(
    value
  ) {
    const timestamp =
      getTimestampMs(
        value
      );

    if (
      !timestamp
    ) {
      return "-";
    }

    return new Date(
      timestamp
    ).toLocaleTimeString(
      "es-ES",
      {
        hour:
          "2-digit",

        minute:
          "2-digit"
      }
    );
  }

  function formatDateKeyForLabel(
    dateKey
  ) {
    const date =
      parseDateInput(
        dateKey
      );

    if (
      !date
    ) {
      return dateKey;
    }

    return date.toLocaleDateString(
      "es-ES",
      {
        day:
          "2-digit",

        month:
          "2-digit",

        year:
          "numeric"
      }
    );
  }

  function currency(
    value
  ) {
    if (
      typeof window.formatMoney ===
      "function"
    ) {
      return window.formatMoney(
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
        value ||
          0
      )
    );
  }

  function getStoredUser() {
    try {
      return (
        JSON.parse(
          localStorage.getItem(
            "currentUser"
          ) ||
            "null"
        ) ||
        null
      );
    } catch {
      return null;
    }
  }

  function getTodayDateKey() {
    return getLocalDateKey(
      new Date()
    );
  }

  function getYesterdayDateKey() {
    const date =
      new Date();

    date.setDate(
      date.getDate() - 1
    );

    return getLocalDateKey(
      date
    );
  }

  /*
   * ==========================================================
   * CREACIÓN DE TIMESTAMP PARA FECHA SELECCIONADA
   * ==========================================================
   *
   * Utilizamos hora local.
   *
   * Al registrar:
   * - se utiliza la fecha seleccionada;
   * - se conserva la hora actual.
   *
   * Al editar:
   * - se utiliza la nueva fecha;
   * - se conserva la hora original.
   */

  function createLocalDateTimeFromDateKey(
    dateKey,
    referenceTimestamp =
      Date.now()
  ) {
    const baseDate =
      parseDateInput(
        dateKey
      );

    if (
      !baseDate
    ) {
      return null;
    }

    const referenceDate =
      new Date(
        getTimestampMs(
          referenceTimestamp
        ) ||
          Date.now()
      );

    baseDate.setHours(
      referenceDate.getHours(),
      referenceDate.getMinutes(),
      referenceDate.getSeconds(),
      referenceDate.getMilliseconds()
    );

    return baseDate;
  }

  function getCurrentDateInputValue() {
    return getTodayDateKey();
  }

  /*
   * ==========================================================
   * PERMISOS
   * ==========================================================
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
            role ||
              ""
          )
            .trim()
            .toLowerCase();

    return (
      canonical ===
        "Administrador" ||
      canonical ===
        "Cajero" ||
      canonical ===
        "Vendedor"
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
            role ||
              ""
          ).trim();

    return (
      canonical ===
      "Administrador"
    );
  }

  /*
   * ==========================================================
   * CONTEXTO LOCAL
   * ==========================================================
   */

  function getCurrentContextLocalId() {
    const contextId =
      String(
        currentUserInfo.id_local ||
          ""
      ).trim();

    if (
      contextId
    ) {
      return contextId;
    }

    if (
      typeof window.getCurrentLocalId ===
      "function"
    ) {
      const helperId =
        String(
          window.getCurrentLocalId() ||
            ""
        ).trim();

      if (
        helperId
      ) {
        return helperId;
      }
    }

    const stored =
      getStoredUser();

    return String(
      stored?.id_local ||
        stored?.idLocal ||
        stored?.localId ||
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

    if (
      !targetLocalId
    ) {
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
   * ==========================================================
   * CACHE DE SESIÓN
   * ==========================================================
   */

  function getSessionCollection(
    collectionName
  ) {
    if (
      typeof window.getSessionCollection !==
      "function"
    ) {
      throw new Error(
        "app.js no expuso getSessionCollection()."
      );
    }

    const documents =
      window.getSessionCollection(
        collectionName
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
          item &&
          typeof item ===
            "object"
      )
      .map(
        item => ({
          id:
            item.id ||
            "",

          data:
            item.data ||
            {}
        })
      );
  }

  function loadExpensesFromSession() {
    return getSessionCollection(
      EXPENSES_COLLECTION
    )
      .filter(
        ({
          data
        }) =>
          matchesCurrentLocal(
            data
          )
      )
      .map(
        ({
          id,
          data
        }) => ({
          id,

          ...data
        })
      )
      .sort(
        (
          a,
          b
        ) =>
          getTimestampMs(
            b.createdAt
          ) -
          getTimestampMs(
            a.createdAt
          )
      );
  }

  function loadSalesFromSession() {
    return getSessionCollection(
      SALES_COLLECTION
    )
      .filter(
        ({
          data
        }) =>
          matchesCurrentLocal(
            data
          )
      )
      .map(
        ({
          id,
          data
        }) => ({
          id,

          ...data
        })
      )
      .sort(
        (
          a,
          b
        ) =>
          getTimestampMs(
            b.createdAt
          ) -
          getTimestampMs(
            a.createdAt
          )
      );
  }

  /*
   * ==========================================================
   * FILTRADO POR FECHA
   * ==========================================================
   */

  function setSelectedDate(
    dateKey
  ) {
    const validDate =
      parseDateInput(
        dateKey
      );

    if (
      !validDate
    ) {
      selectedDateKey =
        getTodayDateKey();
    } else {
      selectedDateKey =
        dateKey;
    }

    if (
      expenseFilterDateInput
    ) {
      expenseFilterDateInput.value =
        selectedDateKey;
    }

    updateDateFilterLabels();

    rebuildDateCaches();

    renderExpenses(
      expensesCache
    );

    updateDailySummary();
  }

  function updateDateFilterLabels() {
    const formattedDate =
      formatDateKeyForLabel(
        selectedDateKey
      );

    const isTodaySelected =
      selectedDateKey ===
      getTodayDateKey();

    if (
      expenseSelectedDateLabel
    ) {
      expenseSelectedDateLabel.textContent =
        isTodaySelected
          ? `Mostrando gastos de hoy (${formattedDate}).`
          : `Mostrando gastos del ${formattedDate}.`;
    }

    if (
      expensesTableTitle
    ) {
      expensesTableTitle.textContent =
        isTodaySelected
          ? "Gastos registrados hoy"
          : `Gastos registrados del ${formattedDate}`;
    }
  }

  function getSelectedDateRange() {
    const selectedDate =
      parseDateInput(
        selectedDateKey
      );

    if (
      !selectedDate
    ) {
      return null;
    }

    const start =
      new Date(
        selectedDate
      );

    start.setHours(
      0,
      0,
      0,
      0
    );

    const end =
      new Date(
        selectedDate
      );

    end.setHours(
      23,
      59,
      59,
      999
    );

    return {
      start,
      end
    };
  }

  function belongsToSelectedDate(
    value
  ) {
    const timestamp =
      getTimestampMs(
        value
      );

    if (
      !timestamp
    ) {
      return false;
    }

    const range =
      getSelectedDateRange();

    if (
      !range
    ) {
      return false;
    }

    return (
      timestamp >=
        range.start.getTime() &&
      timestamp <=
        range.end.getTime()
    );
  }

  function rebuildDateCaches() {
    expensesCache =
      loadExpensesFromSession()
        .filter(
          item =>
            belongsToSelectedDate(
              item.createdAt
            )
        );

    salesCache =
      loadSalesFromSession()
        .filter(
          item =>
            belongsToSelectedDate(
              item.createdAt
            )
        );
  }

  /*
   * ==========================================================
   * RESUMEN
   * ==========================================================
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
   * ==========================================================
   * FORMULARIO
   * ==========================================================
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
      expenseDateInput
    ) {
      expenseDateInput.value =
        selectedDateKey ||
        getCurrentDateInputValue();
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
   * ==========================================================
   * PERMISOS POR GASTO
   * ==========================================================
   */

  function canDeleteExpenseItem(
    item
  ) {
    if (
      !item
    ) {
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

  function canChangeExpenseDate(
    item
  ) {
    if (
      !item
    ) {
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
   * ==========================================================
   * RENDER
   * ==========================================================
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
              No hay gastos registrados para esta fecha.
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

        const editDateButton =
          canChangeExpenseDate(
            item
          )
            ? `
              <button
                class="btn-outline"
                type="button"
                data-action="change-date"
                data-id="${escapeHtml(
                  item.id
                )}"
                style="margin-right:6px;"
              >
                <i class="fas fa-calendar-alt"></i>
                Cambiar fecha
              </button>
            `
            : "";

        const deleteButton =
          canDeleteExpenseItem(
            item
          )
            ? `
              <button
                class="btn-delete"
                type="button"
                data-action="delete"
                data-id="${escapeHtml(
                  item.id
                )}"
              >
                Eliminar
              </button>
            `
            : "";

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
            ${editDateButton}
            ${deleteButton || "-"}
          </td>
        `;

        expensesTableBody.appendChild(
          tr
        );
      }
    );

    expensesTableBody
      .querySelectorAll(
        "button[data-action]"
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
              const id =
                button.getAttribute(
                  "data-id"
                );

              const action =
                button.getAttribute(
                  "data-action"
                );

              if (
                action ===
                "delete"
              ) {
                await deleteExpense(
                  id
                );

                return;
              }

              if (
                action ===
                "change-date"
              ) {
                await changeExpenseDate(
                  id
                );
              }
            }
          );
        }
      );
  }

  /*
   * ==========================================================
   * AGREGAR GASTO
   * ==========================================================
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

    if (
      !id_local
    ) {
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

    const selectedExpenseDate =
      String(
        expenseDateInput?.value ||
          selectedDateKey ||
          ""
      ).trim();

    const notes =
      String(
        expenseNotesInput?.value ||
          ""
      ).trim();

    if (
      !concept
    ) {
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
      amount <=
        0
    ) {
      await Swal.fire(
        "Validación",
        "Ingresa un monto válido mayor que cero.",
        "warning"
      );

      return;
    }

    const validDate =
      parseDateInput(
        selectedExpenseDate
      );

    if (
      !validDate
    ) {
      await Swal.fire(
        "Validación",
        "Selecciona una fecha válida para el gasto.",
        "warning"
      );

      return;
    }

    if (
      !window.auth ||
      !window.auth.currentUser
    ) {
      await Swal.fire(
        "Sesión inválida",
        "La sesión actual no es válida. Inicia sesión nuevamente.",
        "error"
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
        typeof window.getCurrentLocalInfo ===
        "function"
          ? window.getCurrentLocalInfo()
          : {};

      /*
       * La fecha seleccionada se combina con la hora actual.
       */
      const expenseDate =
        createLocalDateTimeFromDateKey(
          selectedExpenseDate,
          Date.now()
        );

      if (
        !expenseDate
      ) {
        throw new Error(
          "No se pudo construir la fecha del gasto."
        );
      }

      const createdAtMillis =
        expenseDate.getTime();

      const expenseData = {
        concept,

        category,

        amount,

        paymentMethod,

        notes,

        dayKey:
          getLocalDateKey(
            expenseDate
          ),

        createdAt:
          firebase.firestore
            .Timestamp
            .fromDate(
              expenseDate
            ),

        userId:
          currentUserInfo.uid ||
          window.auth.currentUser.uid,

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
          "",

        updatedAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp()
      };

      const documentReference =
        await window.db
          .collection(
            EXPENSES_COLLECTION
          )
          .add(
            expenseData
          );

      /*
       * Para la caché utilizamos milisegundos.
       */
      const cacheData = {
        ...expenseData,

        createdAt:
          createdAtMillis,

        updatedAt:
          Date.now()
      };

      if (
        typeof window.upsertSessionDocument !==
        "function"
      ) {
        throw new Error(
          "app.js no expuso upsertSessionDocument()."
        );
      }

      window.upsertSessionDocument(
        EXPENSES_COLLECTION,
        documentReference.id,
        cacheData
      );

      /*
       * Recargar datos desde la caché central.
       */
      expensesCache =
        loadExpensesFromSession();

      salesCache =
        loadSalesFromSession();

      rebuildDateCaches();

      renderExpenses(
        expensesCache
      );

      updateDailySummary();

      await Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "success",

        title:
          "Gasto agregado",

        text:
          `Fecha: ${formatDateKeyForLabel(
            selectedExpenseDate
          )}`,

        showConfirmButton:
          false,

        timer:
          1600
      });

      clearForm();

    } catch (
      error
    ) {
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
   * ==========================================================
   * CAMBIAR FECHA DE UN GASTO
   * ==========================================================
   */

  async function changeExpenseDate(
    id
  ) {
    if (
      isChangingExpenseDate
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
        "No tienes permisos para modificar gastos.",
        "error"
      );

      return;
    }

    const allExpenses =
      loadExpensesFromSession();

    const target =
      allExpenses.find(
        item =>
          String(
            item.id
          ) ===
          String(
            id
          )
      );

    if (
      !target
    ) {
      await Swal.fire(
        "Error",
        "No se encontró el gasto.",
        "error"
      );

      return;
    }

    if (
      !canChangeExpenseDate(
        target
      )
    ) {
      await Swal.fire(
        "No tienes permisos",
        "Solo el creador o el administrador pueden cambiar la fecha de este gasto.",
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

    if (
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

    const currentTimestamp =
      getTimestampMs(
        target.createdAt
      );

    if (
      !currentTimestamp
    ) {
      await Swal.fire(
        "Error",
        "El gasto no tiene una fecha válida y no puede modificarse.",
        "error"
      );

      return;
    }

    const currentDateKey =
      getDateKeyFromTimestamp(
        target.createdAt
      );

    const result =
      await Swal.fire({
        title:
          "Cambiar fecha del gasto",

        html:
          `
            <div style="text-align:left;">
              <div style="margin-bottom:8px;">
                <strong>Concepto:</strong>
                ${escapeHtml(
                  target.concept ||
                  "-"
                )}
              </div>

              <div style="margin-bottom:8px;">
                <strong>Fecha actual:</strong>
                ${escapeHtml(
                  formatDateOnly(
                    target.createdAt
                  )
                )}
              </div>

              <label
                for="swalExpenseNewDate"
                style="
                  display:block;
                  margin-bottom:6px;
                "
              >
                Nueva fecha
              </label>

              <input
                id="swalExpenseNewDate"
                class="swal2-input"
                type="date"
                value="${escapeHtml(
                  currentDateKey
                )}"
                style="
                  width:calc(100% - 2em);
                  margin:0 auto;
                "
              >
            </div>
          `,

        showCancelButton:
          true,

        confirmButtonText:
          "Guardar fecha",

        cancelButtonText:
          "Cancelar",

        focusConfirm:
          false,

        preConfirm:
          () => {
            const input =
              document.getElementById(
                "swalExpenseNewDate"
              );

            const value =
              String(
                input?.value ||
                  ""
              ).trim();

            if (
              !parseDateInput(
                value
              )
            ) {
              Swal.showValidationMessage(
                "Selecciona una fecha válida."
              );

              return false;
            }

            return value;
          }
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    const newDateKey =
      String(
        result.value ||
          ""
      ).trim();

    if (
      !parseDateInput(
        newDateKey
      )
    ) {
      return;
    }

    if (
      newDateKey ===
      currentDateKey
    ) {
      await Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "info",

        title:
          "La fecha no cambió",

        showConfirmButton:
          false,

        timer:
          1200
      });

      return;
    }

    const newExpenseDate =
      createLocalDateTimeFromDateKey(
        newDateKey,
        currentTimestamp
      );

    if (
      !newExpenseDate
    ) {
      await Swal.fire(
        "Error",
        "No se pudo construir la nueva fecha.",
        "error"
      );

      return;
    }

    isChangingExpenseDate =
      true;

    try {
      const newCreatedAt =
        firebase.firestore
          .Timestamp
          .fromDate(
            newExpenseDate
          );

      await window.db
        .collection(
          EXPENSES_COLLECTION
        )
        .doc(
          id
        )
        .update({
          createdAt:
            newCreatedAt,

          dayKey:
            newDateKey,

          updatedAt:
            firebase.firestore
              .FieldValue
              .serverTimestamp()
        });

      /*
       * Actualizar la caché central.
       */
      if (
        typeof window.upsertSessionDocument !==
        "function"
      ) {
        throw new Error(
          "app.js no expuso upsertSessionDocument()."
        );
      }

      window.upsertSessionDocument(
        EXPENSES_COLLECTION,
        id,
        {
          createdAt:
            newExpenseDate.getTime(),

          dayKey:
            newDateKey,

          updatedAt:
            Date.now()
        }
      );

      /*
       * Volver a cargar desde la caché.
       */
      expensesCache =
        loadExpensesFromSession();

      salesCache =
        loadSalesFromSession();

      rebuildDateCaches();

      renderExpenses(
        expensesCache
      );

      updateDailySummary();

      await Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "success",

        title:
          "Fecha actualizada",

        text:
          `Nueva fecha: ${formatDateKeyForLabel(
            newDateKey
          )}`,

        showConfirmButton:
          false,

        timer:
          1600
      });

    } catch (
      error
    ) {
      console.error(
        "Error cambiando fecha del gasto:",
        error
      );

      await Swal.fire(
        "Error",
        error.message ||
          "No se pudo cambiar la fecha del gasto.",
        "error"
      );
    } finally {
      isChangingExpenseDate =
        false;
    }
  }

  /*
   * ==========================================================
   * ELIMINAR GASTO
   * ==========================================================
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

    const allExpenses =
      loadExpensesFromSession();

    const target =
      allExpenses.find(
        item =>
          String(
            item.id
          ) ===
          String(
            id
          )
      );

    if (
      !target
    ) {
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
      await window.db
        .collection(
          EXPENSES_COLLECTION
        )
        .doc(
          id
        )
        .delete();

      if (
        typeof window.removeSessionDocument !==
        "function"
      ) {
        throw new Error(
          "app.js no expuso removeSessionDocument()."
        );
      }

      window.removeSessionDocument(
        EXPENSES_COLLECTION,
        id
      );

      expensesCache =
        loadExpensesFromSession();

      salesCache =
        loadSalesFromSession();

      rebuildDateCaches();

      renderExpenses(
        expensesCache
      );

      updateDailySummary();

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

    } catch (
      error
    ) {
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
   * ==========================================================
   * CONTEXTO DE USUARIO
   * ==========================================================
   */

  async function initializeExpenseContext(
    user
  ) {
    if (
      !user
    ) {
      throw new Error(
        "No existe usuario autenticado."
      );
    }

    if (
      currentContextLoaded &&
      currentUserInfo.uid ===
        user.uid
    ) {
      if (
        typeof window.ensureSessionDataLoaded ===
        "function"
      ) {
        await window.ensureSessionDataLoaded(
          user
        );
      }

      return;
    }

    if (
      typeof window.getCurrentUserContext !==
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

    if (
      !context
    ) {
      throw new Error(
        "No se pudo resolver el contexto del usuario."
      );
    }

    if (
      typeof window.ensureSessionDataLoaded !==
      "function"
    ) {
      throw new Error(
        "app.js no expuso ensureSessionDataLoaded()."
      );
    }

    await window.ensureSessionDataLoaded(
      user
    );

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

    if (
      !currentUserInfo.id_local
    ) {
      throw new Error(
        "El usuario autenticado no tiene un id_local asignado."
      );
    }

    currentContextLoaded =
      true;

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

    if (
      typeof window.renderNavigationForRole ===
      "function"
    ) {
      window.renderNavigationForRole(
        currentUserInfo.role
      );
    }
  }

  /*
   * ==========================================================
   * CARGA INICIAL DESDE CACHÉ
   * ==========================================================
   */

  async function initializeExpenseData() {
    if (
      !window.auth ||
      !window.auth.currentUser
    ) {
      throw new Error(
        "No existe una sesión autenticada."
      );
    }

    if (
      typeof window.ensureSessionDataLoaded !==
      "function"
    ) {
      throw new Error(
        "app.js no expuso ensureSessionDataLoaded()."
      );
    }

    await window.ensureSessionDataLoaded(
      window.auth.currentUser
    );

    expensesCache =
      loadExpensesFromSession();

    salesCache =
      loadSalesFromSession();

    dataLoadedFromSession =
      true;

    setSelectedDate(
      selectedDateKey ||
        getTodayDateKey()
    );

    /*
     * El formulario de alta inicia con la fecha
     * actualmente seleccionada.
     */
    if (
      expenseDateInput
    ) {
      expenseDateInput.value =
        selectedDateKey;
    }

    console.log(
      "[Gastos] Datos cargados desde la caché de sesión:",
      {
        ventas:
          salesCache.length,

        gastos:
          expensesCache.length,

        fechaSeleccionada:
          selectedDateKey,

        id_local:
          currentUserInfo.id_local
      }
    );
  }

  /*
   * ==========================================================
   * ACTUALIZACIÓN DE VISTA
   * ==========================================================
   */

  function refreshExpenseViewFromSession() {
    if (
      !dataLoadedFromSession
    ) {
      return;
    }

    expensesCache =
      loadExpensesFromSession();

    salesCache =
      loadSalesFromSession();

    rebuildDateCaches();

    renderExpenses(
      expensesCache
    );

    updateDailySummary();
  }

  window.refreshExpenseViewFromSession =
    refreshExpenseViewFromSession;

  /*
   * ==========================================================
   * AUTH
   * ==========================================================
   */

  if (
    !window.auth ||
    typeof window.auth.onAuthStateChanged !==
      "function"
  ) {
    console.error(
      "[Gastos] app.js/auth no está disponible."
    );

    return;
  }

  window.auth.onAuthStateChanged(
    async user => {
      if (
        !user
      ) {
        currentContextLoaded =
          false;

        dataLoadedFromSession =
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

        expensesCache =
          [];

        salesCache =
          [];

        selectedDateKey =
          "";

        if (
          typeof window.clearSessionDataCache ===
          "function"
        ) {
          window.clearSessionDataCache();
        }

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

        await initializeExpenseData();

      } catch (
        error
      ) {
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
            "No se pudo resolver el usuario, su local o la caché de sesión."
        });

        window.location.href =
          "dashboard.html";
      }
    }
  );

  /*
   * ==========================================================
   * EVENTOS DOM
   * ==========================================================
   */

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      /*
       * --------------------------------------------------------
       * FECHA DEL FORMULARIO
       * --------------------------------------------------------
       */

      if (
        expenseDateInput
      ) {
        expenseDateInput.value =
          selectedDateKey ||
          getTodayDateKey();

        expenseDateInput.addEventListener(
          "change",
          () => {
            const value =
              expenseDateInput.value;

            if (
              !parseDateInput(
                value
              )
            ) {
              expenseDateInput.value =
                selectedDateKey ||
                getTodayDateKey();
            }
          }
        );
      }

      /*
       * --------------------------------------------------------
       * FILTRO PRINCIPAL
       * --------------------------------------------------------
       */

      if (
        expenseFilterDateInput
      ) {
        expenseFilterDateInput.value =
          getTodayDateKey();

        expenseFilterDateInput.addEventListener(
          "change",
          () => {
            const value =
              expenseFilterDateInput.value;

            if (
              !parseDateInput(
                value
              )
            ) {
              expenseFilterDateInput.value =
                selectedDateKey ||
                getTodayDateKey();

              return;
            }

            setSelectedDate(
              value
            );

            /*
             * Al cambiar el filtro también dejamos
             * el formulario listo para registrar en
             * la fecha seleccionada.
             */
            if (
              expenseDateInput
            ) {
              expenseDateInput.value =
                selectedDateKey;
            }
          }
        );
      }

      /*
       * --------------------------------------------------------
       * BOTÓN HOY
       * --------------------------------------------------------
       */

      if (
        btnExpenseFilterToday
      ) {
        btnExpenseFilterToday.addEventListener(
          "click",
          () => {
            setSelectedDate(
              getTodayDateKey()
            );

            if (
              expenseDateInput
            ) {
              expenseDateInput.value =
                selectedDateKey;
            }
          }
        );
      }

      /*
       * --------------------------------------------------------
       * BOTÓN AYER
       * --------------------------------------------------------
       */

      if (
        btnExpenseFilterYesterday
      ) {
        btnExpenseFilterYesterday.addEventListener(
          "click",
          () => {
            setSelectedDate(
              getYesterdayDateKey()
            );

            if (
              expenseDateInput
            ) {
              expenseDateInput.value =
                selectedDateKey;
            }
          }
        );
      }

      /*
       * --------------------------------------------------------
       * RESTABLECER
       * --------------------------------------------------------
       */

      if (
        btnExpenseFilterReset
      ) {
        btnExpenseFilterReset.addEventListener(
          "click",
          () => {
            setSelectedDate(
              getTodayDateKey()
            );

            clearForm();
          }
        );
      }

      /*
       * --------------------------------------------------------
       * AGREGAR
       * --------------------------------------------------------
       */

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

      /*
       * --------------------------------------------------------
       * LIMPIAR
       * --------------------------------------------------------
       */

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
       * --------------------------------------------------------
       * Inicialización visual inmediata
       * --------------------------------------------------------
       */

      selectedDateKey =
        getTodayDateKey();

      updateDateFilterLabels();
    }
  );
})();