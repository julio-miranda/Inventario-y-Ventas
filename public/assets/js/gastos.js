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
// Optimización:
// - NO consulta empleados.
// - NO consulta local.
// - NO consulta ventas directamente.
// - NO consulta gastos directamente.
// - NO utiliza onSnapshot().
// - NO mantiene listeners realtime.
// - NO hace una consulta adicional para el resumen.
//
// Todas las lecturas normales salen de la caché de sesión
// preparada por app.js.
//
// Las escrituras continúan realizándose en Firestore.
// Después de una escritura, se actualiza la caché de sesión
// para mantener la interfaz consistente sin otra lectura.
//

(() => {
  "use strict";

  /*
   * ==========================================================
   * CONSTANTES LOCALES
   * ==========================================================
   *
   * Se mantienen dentro de esta IIFE para evitar conflictos
   * con las constantes globales declaradas por app.js.
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

  let currentContextLoaded =
    false;

  let dataLoadedFromSession =
    false;

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
   * FILTRADO DEL DÍA
   * ==========================================================
   */

  function getTodayRange() {
    const today =
      new Date();

    const start =
      new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        0,
        0,
        0,
        0
      );

    const end =
      new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
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

  function isToday(
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

    const {
      start,
      end
    } =
      getTodayRange();

    return (
      timestamp >=
        start.getTime() &&
      timestamp <=
        end.getTime()
    );
  }

  function rebuildDailyCaches() {
    expensesCache =
      loadExpensesFromSession()
        .filter(
          item =>
            isToday(
              item.createdAt
            )
        );

    salesCache =
      loadSalesFromSession()
        .filter(
          item =>
            isToday(
              item.createdAt
            )
        );
  }

  /*
   * ==========================================================
   * RESUMEN
   * ==========================================================
   *
   * 100 % en memoria.
   *
   * No se consulta Firestore.
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
   * ELIMINACIÓN
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
   * ==========================================================
   * RECARGAR DESDE LA CACHÉ
   * ==========================================================
   */

  function refreshFromSessionCache() {
    if (
      !dataLoadedFromSession
    ) {
      return;
    }

    rebuildDailyCaches();

    renderExpenses(
      expensesCache
    );

    updateDailySummary();
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

      const createdAtMillis =
        Date.now();

      const expenseData = {
        concept,

        category,

        amount,

        paymentMethod,

        notes,

        dayKey:
          typeof window.getTodayBounds ===
          "function"
            ? window.getTodayBounds(
                new Date()
              ).dayKey
            : new Date()
                .toISOString()
                .slice(
                  0,
                  10
                ),

        /*
         * La escritura continúa utilizando el timestamp
         * del servidor de Firestore.
         */
        createdAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp(),

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
          ""
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
       * serverTimestamp() no está resuelto dentro del
       * objeto que conservamos localmente.
       *
       * Para la caché usamos el instante en el que se
       * registró correctamente la operación.
       */
      const cacheData = {
        ...expenseData,

        createdAt:
          createdAtMillis
      };

      /*
       * Actualizar caché central de app.js.
       *
       * NO hacemos .get() después del .add().
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
        documentReference.id,
        cacheData
      );

      /*
       * Actualizar caché local del módulo.
       */
      expensesCache.push({
        id:
          documentReference.id,

        ...cacheData
      });

      expensesCache.sort(
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

      renderExpenses(
        expensesCache.filter(
          item =>
            isToday(
              item.createdAt
            )
        )
      );

      rebuildDailyCaches();

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

        showConfirmButton:
          false,

        timer:
          1400
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

    const target =
      expensesCache.find(
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
      /*
       * Escritura únicamente.
       */
      await window.db
        .collection(
          EXPENSES_COLLECTION
        )
        .doc(
          id
        )
        .delete();

      /*
       * Eliminar de la caché central.
       *
       * NO hacemos .get() después del .delete().
       */
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

      /*
       * Eliminar del caché local.
       */
      expensesCache =
        expensesCache.filter(
          item =>
            String(
              item.id
            ) !==
            String(
              id
            )
        );

      /*
       * Recalcular desde la caché.
       */
      rebuildDailyCaches();

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
      /*
       * Verificar que la caché central exista.
       */
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

    /*
     * app.js es la fuente central del contexto.
     */
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

    /*
     * Garantizar la caché de la sesión.
     */
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

    /*
     * Saludo.
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
     * Navegación.
     */
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
   * CARGA INICIAL DESDE CACHE
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

    /*
     * Si la caché ya fue precargada durante el login,
     * esta operación solamente la recupera/reutiliza.
     */
    await window.ensureSessionDataLoaded(
      window.auth.currentUser
    );

    rebuildDailyCaches();

    dataLoadedFromSession =
      true;

    renderExpenses(
      expensesCache
    );

    updateDailySummary();

    console.log(
      "[Gastos] Datos cargados desde la caché de sesión:",
      {
        ventasDelDia:
          salesCache.length,

        gastosDelDia:
          expensesCache.length,

        id_local:
          currentUserInfo.id_local
      }
    );
  }

  /*
   * ==========================================================
   * ACTUALIZACIÓN DE VISTA
   * ==========================================================
   *
   * No realiza ninguna lectura a Firestore.
   */

  function refreshExpenseViewFromSession() {
    if (
      !dataLoadedFromSession
    ) {
      return;
    }

    rebuildDailyCaches();

    renderExpenses(
      expensesCache
    );

    updateDailySummary();
  }

  /*
   * ==========================================================
   * EXPONER SOLO LO NECESARIO
   * ==========================================================
   */

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

        /*
         * app.js también limpia esta caché durante
         * el cierre de sesión.
         */
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

        /*
         * Toda la lectura sale de app.js.
         */
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
   * DOM
   * ==========================================================
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
    }
  );
})();