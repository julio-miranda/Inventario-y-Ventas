// assets/js/controllers/inventory.controller.js
//
// INVENTARIO
//
// Características:
//
// - Stock visible = stock actual guardado en el producto.
// - Las ventas se utilizan para métricas, sugerencias y alertas.
// - Administrador/Bodega pueden editar y agregar.
// - Administrador puede eliminar.
// - Proveedor opcional.
// - Producto existente o nuevo.
// - Carga múltiple de productos.
//
// - Cada entrada registra:
//      cajas
//      cajas bono
//      unidades
//      unidades bono
//      unidades por caja
//      costo por caja
//      costo por unidad
//      precio
//      proveedor
//      referencia
//      documento
//
// - El proveedor del movimiento se guarda independientemente
//   del proveedor actual del producto.
//
// - La búsqueda de proveedores permite:
//      nombre
//      razón social / denominación
//      combinación nombre + razón social
//
// - La edición de una entrada modifica el stock mediante:
//
//      diferencia = nuevaEntrada - entradaAnterior
//
//      stockNuevo = stockActual + diferencia
//
// - Las cajas son editables.
// - Las unidades por caja son editables.
// - El proveedor específico del movimiento es editable.
// - El historial de entradas muestra todas las entradas por
//   defecto.
// - La búsqueda principal de inventario acepta nombre, código
//   y proveedor.
// - El historial de entradas acepta nombre, código y proveedor.
// - Se verifica la coherencia entre stock guardado y movimientos
//   cuando no existen ventas históricas que expliquen la diferencia.
//
// - No usa onSnapshot().
// - Las lecturas normales utilizan la caché de sesión administrada
//   por app.js.
// - Las entradas pagadas generan gasto automático.
//
// ================================================================

(function () {
  "use strict";

  if (
    typeof firebase === "undefined"
  ) {
    console.error(
      "Firebase no se ha cargado correctamente."
    );

    if (
      typeof Swal !== "undefined"
    ) {
      Swal.fire({
        icon:
          "error",

        title:
          "Error",

        text:
          "Firebase no se cargó. Revisa la conexión o los scripts."
      });
    }

    return;
  }

  /*
   * ============================================================
   * CONSTANTES
   * ============================================================
   */

  const PRODUCTS_COLLECTION =
    window.PRODUCTS_COLLECTION_NAME ||
    "productos";

  const SALES_COLLECTION =
    window.SALES_COLLECTION_NAME ||
    "ventas";

  const MOVEMENTS_COLLECTION =
    window.MOVEMENTS_COLLECTION_NAME ||
    "stock_movimientos";

  const PROVIDERS_COLLECTION =
    window.SUPPLIER_COLLECTION_NAME ||
    "proveedores";

  const EXPENSES_COLLECTION =
    window.EXPENSES_COLLECTION_NAME ||
    "gastos";

  const LOW_STOCK_THRESHOLD =
    5;

  const SAFETY_STOCK_DEFAULT =
    10;

  /*
   * ============================================================
   * ESTADO
   * ============================================================
   */

  let currentRole =
    "";

  let canEditInventory =
    false;

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

  let currentUserInventoryContext =
    null;

  let currentProductsList =
    [];

  let currentProvidersList =
    [];

  let currentMonthlySalesMap =
    {};

  let currentMonthlyBoxesMap =
    {};

  let inventoryDT =
    null;

  let inventoryLoadPromise =
    null;

  let inventoryInitialized =
    false;

  const productStockMovementsCache =
    new Map();

  const productStockMovementsPending =
    new Map();

  /*
   * ============================================================
   * DOM
   * ============================================================
   */

  function getInventoryTableBody() {
    return document.querySelector(
      "#inventoryTable tbody"
    );
  }

  function getLowStockPanel() {
    return document.getElementById(
      "lowStockPanel"
    );
  }

  function getInventorySearchInput() {
    return (
      document.getElementById(
        "searchInventory"
      ) ||
      document.getElementById(
        "inventorySearch"
      ) ||
      document.getElementById(
        "productSearch"
      ) ||
      document.getElementById(
        "salesSearch"
      ) ||
      document.querySelector(
        "[data-inventory-search]"
      )
    );
  }

  function getInventoryAddButton() {
    return (
      document.getElementById(
        "btnAddProduct"
      ) ||
      document.getElementById(
        "btnAdd"
      )
    );
  }

  function getInventoryTotalProductsCard() {
    return document.getElementById(
      "totalProductsCard"
    );
  }

  function getInventoryTotalValueCard() {
    return document.getElementById(
      "totalValueCard"
    );
  }

  function getInventoryLowStockCard() {
    return document.getElementById(
      "lowStockCard"
    );
  }

  function getInventoryGreetingElements() {
    return document.querySelectorAll(
      ".userGreeting"
    );
  }

  /*
   * ============================================================
   * UTILIDADES
   * ============================================================
   */

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

  function integerOrZero(
    value
  ) {
    return Math.max(
      0,
      Math.floor(
        numberOrZero(
          value
        )
      )
    );
  }

  function currency(
    value
  ) {
    return `$${numberOrZero(
      value
    ).toFixed(2)}`;
  }

  function escapeHtml(
    value
  ) {
    return String(
      value ?? ""
    )
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );
  }

  function normalizeText(
    value
  ) {
    return String(
      value || ""
    )
      .trim()
      .toLowerCase()
      .normalize(
        "NFD"
      )
      .replace(
        /[\u0300-\u036f]/g,
        ""
      );
  }

  /*
   * ============================================================
   * USUARIO
   * ============================================================
   */

  function getStoredCurrentUser() {
    if (
      typeof window.getStoredCurrentUser ===
      "function"
    ) {
      return (
        window.getStoredCurrentUser() ||
        null
      );
    }

    try {
      return JSON.parse(
        localStorage.getItem(
          "currentUser"
        ) || "null"
      );
    } catch {
      return null;
    }
  }

  function patchStoredCurrentUser(
    patch = {}
  ) {
    if (
      typeof window.patchStoredCurrentUser ===
      "function"
    ) {
      window.patchStoredCurrentUser(
        patch
      );

      return;
    }

    try {
      const current =
        getStoredCurrentUser() ||
        {};

      localStorage.setItem(
        "currentUser",
        JSON.stringify({
          ...current,
          ...patch
        })
      );
    } catch {
      // ignore
    }
  }

  /*
   * ============================================================
   * CACHE DE SESIÓN
   * ============================================================
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

    return Array.isArray(
      documents
    )
      ? documents
      : [];
  }

  function upsertSessionDocument(
    collectionName,
    documentId,
    data = {}
  ) {
    if (
      typeof window.upsertSessionDocument !==
      "function"
    ) {
      console.warn(
        "app.js no expuso upsertSessionDocument()."
      );

      return;
    }

    window.upsertSessionDocument(
      collectionName,
      documentId,
      data
    );
  }

  function removeSessionDocument(
    collectionName,
    documentId
  ) {
    if (
      typeof window.removeSessionDocument !==
      "function"
    ) {
      console.warn(
        "app.js no expuso removeSessionDocument()."
      );

      return;
    }

    window.removeSessionDocument(
      collectionName,
      documentId
    );
  }

  async function ensureInventorySessionData(
    user
  ) {
    if (!user) {
      throw new Error(
        "No existe un usuario autenticado."
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
  }

  /*
   * ============================================================
   * FECHAS
   * ============================================================
   */

  function getTimestampMs(
    value
  ) {
    if (
      value === null ||
      value === undefined
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

      return isNaN(
        date.getTime()
      )
        ? 0
        : date.getTime();
    }

    if (
      typeof value.seconds ===
      "number"
    ) {
      return (
        value.seconds *
        1000
      );
    }

    if (
      value instanceof Date
    ) {
      return value.getTime();
    }

    const date =
      new Date(
        value
      );

    return isNaN(
      date.getTime()
    )
      ? 0
      : date.getTime();
  }

  function getLocalDateInputValue(
    date = new Date()
  ) {
    const value =
      date instanceof Date
        ? date
        : new Date(
          date
        );

    if (
      isNaN(
        value.getTime()
      )
    ) {
      return "";
    }

    const year =
      value.getFullYear();

    const month =
      String(
        value.getMonth() + 1
      ).padStart(
        2,
        "0"
      );

    const day =
      String(
        value.getDate()
      ).padStart(
        2,
        "0"
      );

    return `${year}-${month}-${day}`;
  }

  function parseOperationDate(
    value
  ) {
    const text =
      String(
        value || ""
      ).trim();

    if (!text) {
      return null;
    }

    const match =
      /^(\d{4})-(\d{2})-(\d{2})$/.exec(
        text
      );

    if (!match) {
      return null;
    }

    const year =
      Number(
        match[1]
      );

    const month =
      Number(
        match[2]
      );

    const day =
      Number(
        match[3]
      );

    const date =
      new Date(
        year,
        month - 1,
        day,
        12,
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

  function formatOperationDate(
    date
  ) {
    if (!date) {
      return "—";
    }

    return date.toLocaleDateString(
      "es-ES"
    );
  }

  function buildOperationTimestamp(
    operationDate
  ) {
    const date =
      operationDate instanceof Date
        ? operationDate
        : new Date(
          operationDate
        );

    if (
      isNaN(
        date.getTime()
      )
    ) {
      throw new Error(
        "La fecha de operación no es válida."
      );
    }

    return firebase.firestore.Timestamp.fromDate(
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        12,
        0,
        0,
        0
      )
    );
  }

  function getMovementOperationDateValue(
    movement
  ) {
    if (
      movement?.fechaOperacion
    ) {
      const parsed =
        parseOperationDate(
          movement.fechaOperacion
        );

      if (parsed) {
        return movement.fechaOperacion;
      }
    }

    const timestampMs =
      getTimestampMs(
        movement?.createdAt
      );

    if (!timestampMs) {
      return "";
    }

    return getLocalDateInputValue(
      new Date(
        timestampMs
      )
    );
  }

  function getInventoryDayKey(
    date = new Date()
  ) {
    try {
      if (
        typeof window.getTodayBounds ===
        "function"
      ) {
        const bounds =
          window.getTodayBounds(
            date
          );

        if (
          bounds &&
          bounds.dayKey
        ) {
          return String(
            bounds.dayKey
          );
        }
      }
    } catch (
      error
    ) {
      console.warn(
        "No se pudo obtener dayKey mediante getTodayBounds:",
        error
      );
    }

    return getLocalDateInputValue(
      date
    );
  }

  /*
   * ============================================================
   * CONTEXTO
   * ============================================================
   */

  async function resolveInventoryContext(
    user
  ) {
    if (!user) {
      throw new Error(
        "No existe un usuario autenticado."
      );
    }

    if (
      typeof window.getCurrentUserContext !==
      "function"
    ) {
      throw new Error(
        "app.js no expuso getCurrentUserContext()."
      );
    }

    await ensureInventorySessionData(
      user
    );

    const context =
      await window.getCurrentUserContext(
        user
      );

    if (!context) {
      throw new Error(
        "No se pudo resolver el contexto del usuario."
      );
    }

    currentUserInventoryContext =
      context;

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

    currentRole =
      String(
        context.role ||
        ""
      )
        .trim()
        .toLowerCase();

    canEditInventory =
      currentRole ===
      "administrador" ||
      currentRole ===
      "admin" ||
      currentRole ===
      "bodega";

    getInventoryGreetingElements().forEach(
      element => {
        element.textContent =
          `Hola, ${context.name ||
          "Usuario"
          } (${context.role || ""})`;
      }
    );

    const addButton =
      getInventoryAddButton();

    if (addButton) {
      addButton.style.display =
        canEditInventory &&
          currentLocalId
          ? ""
          : "none";
    }

    patchStoredCurrentUser({
      id_local:
        currentLocalId,

      localNombre:
        currentLocalInfo.nombre,

      localNumeroDocumento:
        currentLocalInfo.numeroDocumento,

      localUbicacion:
        currentLocalInfo.ubicacion,

      localContribuyente:
        currentLocalInfo.contribuyente,

      localTipoDocumento:
        currentLocalInfo.tipoDocumento,

      localNIT:
        currentLocalInfo.nit,

      localNRC:
        currentLocalInfo.nrc
    });

    return context;
  }

  /*
   * ============================================================
   * PROVEEDORES
   * ============================================================
   */

  function getProviderName(
    provider
  ) {
    return String(
      provider?.nombre ||
      provider?.name ||
      provider?.nombreProveedor ||
      ""
    ).trim();
  }

  function getProviderBusinessName(
    provider
  ) {
    return String(
      provider?.razonSocialDenominacion ||
      provider?.razonSocial ||
      provider?.razon_social ||
      provider?.denominacion ||
      provider?.denominacionSocial ||
      provider?.businessName ||
      ""
    ).trim();
  }

  function getProviderNationality(
    provider
  ) {
    return String(
      provider?.nacionalidad ||
      ""
    ).trim();
  }

  function getProviderDisplayName(
    provider
  ) {
    if (!provider) {
      return "";
    }

    const name =
      getProviderName(
        provider
      );

    const businessName =
      getProviderBusinessName(
        provider
      );

    if (
      name &&
      businessName
    ) {
      return `${name} — ${businessName}`;
    }

    return (
      name ||
      businessName ||
      ""
    );
  }

  function normalizeProviderObject(
    provider,
    fallbackId = ""
  ) {
    if (!provider) {
      return null;
    }

    const id =
      String(
        provider.id ||
        provider.id_proveedor ||
        provider.proveedorId ||
        fallbackId ||
        ""
      ).trim();

    const nombre =
      getProviderName(
        provider
      );

    const razonSocialDenominacion =
      getProviderBusinessName(
        provider
      );

    if (
      !id &&
      !nombre &&
      !razonSocialDenominacion
    ) {
      return null;
    }

    return {
      id,

      ...provider,

      nombre,

      razonSocialDenominacion,

      razonSocial:
        razonSocialDenominacion,

      denominacion:
        razonSocialDenominacion,

      nacionalidad:
        getProviderNationality(
          provider
        )
    };
  }

  async function loadInventoryProviders() {
    await ensureInventorySessionData(
      auth.currentUser
    );

    currentProvidersList =
      [];

    try {
      const providerDocs =
        getSessionCollection(
          PROVIDERS_COLLECTION
        );

      const providers =
        [];

      providerDocs.forEach(
        ({
          id,
          data
        }) => {
          if (
            !matchesCurrentLocal(
              data
            )
          ) {
            return;
          }

          const provider =
            normalizeProviderObject(
              {
                id,
                ...(data || {})
              }
            );

          if (provider) {
            providers.push(
              provider
            );
          }
        }
      );

      providers.sort(
        (
          a,
          b
        ) =>
          normalizeText(
            getProviderDisplayName(
              a
            )
          ).localeCompare(
            normalizeText(
              getProviderDisplayName(
                b
              )
            ),
            "es"
          )
      );

      currentProvidersList =
        providers;

      return currentProvidersList;
    } catch (
      error
    ) {
      console.warn(
        "No se pudieron cargar proveedores desde la caché de sesión:",
        error
      );

      currentProvidersList =
        [];

      return [];
    }
  }

  function getProviderById(
    providerId
  ) {
    const target =
      String(
        providerId ||
        ""
      ).trim();

    if (!target) {
      return null;
    }

    return (
      currentProvidersList.find(
        provider =>
          String(
            provider.id
          ).trim() ===
          target
      ) ||
      null
    );
  }

  /*
   * Búsqueda de proveedor:
   *
   * 1. Nombre exacto.
   * 2. Razón social exacta.
   * 3. Denominación exacta.
   * 4. Nombre + razón social exacto.
   * 5. Contiene en nombre.
   * 6. Contiene en razón social.
   * 7. Contiene en denominación.
   * 8. Contiene en el texto combinado.
   */

  function findProviderByText(
    value
  ) {
    const text =
      normalizeText(
        value
      );

    if (!text) {
      return null;
    }

    const exactName =
      currentProvidersList.find(
        provider =>
          normalizeText(
            getProviderName(
              provider
            )
          ) ===
          text
      );

    if (
      exactName
    ) {
      return exactName;
    }

    const exactBusinessName =
      currentProvidersList.find(
        provider =>
          normalizeText(
            getProviderBusinessName(
              provider
            )
          ) ===
          text
      );

    if (
      exactBusinessName
    ) {
      return exactBusinessName;
    }

    const exactDisplay =
      currentProvidersList.find(
        provider =>
          normalizeText(
            getProviderDisplayName(
              provider
            )
          ) ===
          text
      );

    if (
      exactDisplay
    ) {
      return exactDisplay;
    }

    const containsName =
      currentProvidersList.find(
        provider =>
          normalizeText(
            getProviderName(
              provider
            )
          ).includes(
            text
          )
      );

    if (
      containsName
    ) {
      return containsName;
    }

    const containsBusinessName =
      currentProvidersList.find(
        provider =>
          normalizeText(
            getProviderBusinessName(
              provider
            )
          ).includes(
            text
          )
      );

    if (
      containsBusinessName
    ) {
      return containsBusinessName;
    }

    return (
      currentProvidersList.find(
        provider =>
          normalizeText(
            getProviderDisplayName(
              provider
            )
          ).includes(
            text
          )
      ) || null
    );
  }

  /*
   * Resuelve un proveedor introducido en un input.
   *
   * Si está vacío, devuelve null.
   *
   * Si corresponde a un proveedor existente, devuelve el objeto.
   *
   * Permite:
   *   "Distribuidora XYZ"
   *   "Distribuidora XYZ S.A. de C.V."
   *   "Distribuidora XYZ — Distribuidora XYZ S.A. de C.V."
   */

  function resolveProviderSelection(
    value
  ) {
    const text =
      String(
        value ||
        ""
      ).trim();

    if (!text) {
      return null;
    }

    return findProviderByText(
      text
    );
  }

  function getProviderComboboxHtml(
    inputId,
    listId,
    value = "",
    className = ""
  ) {
    const currentValue =
      String(
        value ||
        ""
      ).trim();

    return `
      <input
        id="${escapeHtml(
      inputId
    )}"
        type="text"
        class="inv-combobox batch-provider ${escapeHtml(
      className
    )}"
        list="${escapeHtml(
      listId
    )}"
        value="${escapeHtml(
      currentValue
    )}"
        placeholder="Nombre o razón social..."
        autocomplete="off"
      >

      <datalist
        id="${escapeHtml(
      listId
    )}"
      >
        ${currentProvidersList
        .map(
          provider => {
            const name =
              getProviderName(
                provider
              );

            const businessName =
              getProviderBusinessName(
                provider
              );

            const display =
              getProviderDisplayName(
                provider
              );

            return `
              <option
                value="${escapeHtml(
              display
            )}"
                label="${escapeHtml(
              name
            )}${businessName
                ? ` — ${escapeHtml(
                  businessName
                )}`
                : ""
              }"
              ></option>
            `;
          }
        )
        .join("")}
      </datalist>
    `;
  }

  /*
   * ============================================================
   * LOCAL
   * ============================================================
   */

  function getLocalFieldValue(
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
    if (!currentLocalId) {
      return false;
    }

    return (
      getLocalFieldValue(
        data
      ) ===
      String(
        currentLocalId
      ).trim()
    );
  }

  /*
   * ============================================================
   * PRODUCTOS
   * ============================================================
   */

  function getUnitsPerBox(
    product
  ) {
    const value =
      numberOrZero(
        product?.unitsPerBox
      );

    return value > 0
      ? value
      : 1;
  }

  function getProductCode(
    product
  ) {
    return String(
      product?.codigoProducto ||
      product?.productCode ||
      product?.code ||
      product?.sku ||
      ""
    ).trim();
  }

  function getCurrentStockUnits(
    product
  ) {
    if (!product) {
      return 0;
    }

    const stockCurrent =
      Number(
        product.stockCurrentUnits
      );

    if (
      Number.isFinite(
        stockCurrent
      )
    ) {
      return Math.max(
        0,
        stockCurrent
      );
    }

    const quantity =
      Number(
        product.quantity
      );

    if (
      Number.isFinite(
        quantity
      )
    ) {
      return Math.max(
        0,
        quantity
      );
    }

    const base =
      Number(
        product.stockBaseUnits
      );

    if (
      Number.isFinite(
        base
      )
    ) {
      return Math.max(
        0,
        base
      );
    }

    return 0;
  }

  function getStockBoxes(
    product
  ) {
    const unitsPerBox =
      getUnitsPerBox(
        product
      );

    return Math.floor(
      getCurrentStockUnits(
        product
      ) /
      unitsPerBox
    );
  }

  function getCostPerUnit(
    product
  ) {
    const direct =
      numberOrZero(
        product?.lastCostPerUnit
      );

    if (
      direct > 0
    ) {
      return direct;
    }

    const costPerBox =
      numberOrZero(
        product?.lastCostPerBox
      );

    const unitsPerBox =
      getUnitsPerBox(
        product
      );

    if (
      costPerBox > 0 &&
      unitsPerBox > 0
    ) {
      return (
        costPerBox /
        unitsPerBox
      );
    }

    return 0;
  }

  function findProductById(
    id
  ) {
    const target =
      String(
        id || ""
      ).trim();

    return (
      currentProductsList.find(
        product =>
          String(
            product.id
          ).trim() ===
          target
      ) || null
    );
  }

  function getProductProviderId(
    product
  ) {
    return String(
      product?.proveedorId ||
      ""
    ).trim();
  }

  function getProductProviderName(
    product
  ) {
    return String(
      product?.proveedorNombre ||
      ""
    ).trim();
  }

  function getProductProviderReason(
    product
  ) {
    return String(
      product?.proveedorRazonSocial ||
      product?.proveedorRazonSocialDenominacion ||
      product?.proveedorDenominacion ||
      ""
    ).trim();
  }

  function findProductByText(
    value
  ) {
    const text =
      normalizeText(
        value
      );

    if (!text) {
      return null;
    }

    const exact =
      currentProductsList.find(
        product =>
          normalizeText(
            product.name
          ) ===
          text ||
          normalizeText(
            getProductCode(
              product
            )
          ) ===
          text
      );

    if (
      exact
    ) {
      return exact;
    }

    return (
      currentProductsList.find(
        product =>
          normalizeText(
            product.name
          ).includes(
            text
          ) ||
          normalizeText(
            getProductCode(
              product
            )
          ).includes(
            text
          ) ||
          normalizeText(
            getProductProviderName(
              product
            )
          ).includes(
            text
          ) ||
          normalizeText(
            getProductProviderReason(
              product
            )
          ).includes(
            text
          )
      ) || null
    );
  }

  /*
   * ============================================================
   * COSTOS
   * ============================================================
   */

  function getEffectiveUnitsPerBox(
    line,
    product = null
  ) {
    return Math.max(
      1,
      integerOrZero(
        product
          ? getUnitsPerBox(
            product
          )
          : line?.unitsPerBox
      ) || 1
    );
  }

  function getEffectiveCostPerBoxForLine(
    line,
    product = null
  ) {
    const unitsPerBox =
      getEffectiveUnitsPerBox(
        line,
        product
      );

    const explicitCostPerBox =
      numberOrZero(
        line?.lastCostPerBox ??
        line?.costoPorCaja ??
        line?.costPerBox
      );

    if (
      explicitCostPerBox > 0
    ) {
      return explicitCostPerBox;
    }

    const explicitCostPerUnit =
      numberOrZero(
        line?.lastCostPerUnit ??
        line?.costoUnitario ??
        line?.costPerUnit
      );

    if (
      explicitCostPerUnit > 0
    ) {
      return (
        explicitCostPerUnit *
        unitsPerBox
      );
    }

    if (
      product
    ) {
      const productBoxCost =
        numberOrZero(
          product.lastCostPerBox
        );

      if (
        productBoxCost > 0
      ) {
        return productBoxCost;
      }

      const productUnitCost =
        numberOrZero(
          product.lastCostPerUnit
        );

      if (
        productUnitCost > 0
      ) {
        return (
          productUnitCost *
          unitsPerBox
        );
      }
    }

    return 0;
  }

  function getEffectiveCostPerUnitForLine(
    line,
    product = null
  ) {
    const unitsPerBox =
      getEffectiveUnitsPerBox(
        line,
        product
      );

    const explicitCostPerUnit =
      numberOrZero(
        line?.lastCostPerUnit ??
        line?.costoUnitario ??
        line?.costPerUnit
      );

    if (
      explicitCostPerUnit > 0
    ) {
      return explicitCostPerUnit;
    }

    const costPerBox =
      getEffectiveCostPerBoxForLine(
        line,
        product
      );

    return unitsPerBox > 0
      ? costPerBox /
      unitsPerBox
      : 0;
  }

  function calculateLinePurchaseCost(
    line,
    product = null
  ) {
    if (!line) {
      return 0;
    }

    const paidBoxes =
      integerOrZero(
        line.boxes
      );

    const paidUnits =
      integerOrZero(
        line.units
      );

    const unitsPerBox =
      getEffectiveUnitsPerBox(
        line,
        product
      );

    const costPerUnit =
      getEffectiveCostPerUnitForLine(
        line,
        product
      );

    return Math.max(
      0,
      (
        paidBoxes *
        unitsPerBox +
        paidUnits
      ) *
      costPerUnit
    );
  }

  /*
   * ============================================================
   * GASTO
   * ============================================================
   */

  function buildInventoryExpenseDetails(
    lines
  ) {
    return lines
      .map(
        (
          line,
          index
        ) => {
          const product =
            line.product ||
            null;

          const cost =
            calculateLinePurchaseCost(
              line,
              product
            );

          const paidBoxes =
            integerOrZero(
              line.boxes
            );

          const paidUnits =
            integerOrZero(
              line.units
            );

          const bonusBoxes =
            integerOrZero(
              line.bonusBoxes
            );

          const bonusUnits =
            integerOrZero(
              line.bonusUnits
            );

          const unitsPerBox =
            getEffectiveUnitsPerBox(
              line,
              product
            );

          const costPerUnit =
            getEffectiveCostPerUnitForLine(
              line,
              product
            );

          const costPerBox =
            costPerUnit *
            unitsPerBox;

          return [
            `${index + 1}. ${line.name ||
            line.productText ||
            "Producto"
            }`,

            `Cajas pagadas: ${paidBoxes}`,

            `Unidades pagadas: ${paidUnits}`,

            `Cajas bono: ${bonusBoxes}`,

            `Unidades bono: ${bonusUnits}`,

            `Unidades por caja: ${unitsPerBox}`,

            `Costo por unidad: ${currency(
              costPerUnit
            )}`,

            `Costo por caja: ${currency(
              costPerBox
            )}`,

            `Costo línea: ${currency(
              cost
            )}`,

            line.proveedorNombre
              ? `Proveedor: ${line.proveedorNombre}`
              : "",

            line.proveedorRazonSocial
              ? `Razón Social: ${line.proveedorRazonSocial}`
              : ""
          ]
            .filter(
              Boolean
            )
            .join(
              " | "
            );
        }
      )
      .join(
        "\n"
      );
  }

  async function registerInventoryExpense(
    totalAmount,
    lines,
    user,
    operationDate
  ) {
    const amount =
      Math.max(
        0,
        numberOrZero(
          totalAmount
        )
      );

    if (
      amount <=
      0
    ) {
      return {
        created:
          false,

        amount:
          0,

        id:
          ""
      };
    }

    const validOperationDate =
      operationDate instanceof Date
        ? operationDate
        : parseOperationDate(
          operationDate
        );

    if (
      !validOperationDate
    ) {
      throw new Error(
        "La fecha de operación no es válida para registrar el gasto."
      );
    }

    const operationTimestamp =
      buildOperationTimestamp(
        validOperationDate
      );

    const context =
      currentUserInventoryContext ||
      {};

    const localInfo =
      currentLocalInfo ||
      {};

    const productCount =
      Array.isArray(
        lines
      )
        ? lines.length
        : 0;

    const totalUnits =
      Array.isArray(
        lines
      )
        ? lines.reduce(
          (
            sum,
            line
          ) => {
            const product =
              line.product ||
              null;

            const unitsPerBox =
              getEffectiveUnitsPerBox(
                line,
                product
              );

            const totalLineUnits =
              (
                integerOrZero(
                  line.boxes
                ) +
                integerOrZero(
                  line.bonusBoxes
                )
              ) *
              unitsPerBox +
              integerOrZero(
                line.units
              ) +
              integerOrZero(
                line.bonusUnits
              );

            return (
              sum +
              totalLineUnits
            );
          },
          0
        )
        : 0;

    const expenseRef =
      db
        .collection(
          EXPENSES_COLLECTION
        )
        .doc();

    const concept =
      productCount ===
        1
        ? `Compra de inventario - ${lines[0]?.name ||
        lines[0]?.productText ||
        "Producto"
        }`
        : `Compra de inventario - ${productCount} productos`;

    const details =
      buildInventoryExpenseDetails(
        lines
      );

    const notes =
      [
        "Gasto generado automáticamente desde Inventario.",

        "Las cantidades bono no generan costo.",

        "El costo por caja equivale al costo por unidad multiplicado por las unidades por caja.",

        `Fecha de operación: ${formatOperationDate(
          validOperationDate
        )}`,

        `Productos ingresados: ${productCount}`,

        `Unidades totales ingresadas: ${totalUnits}`,

        "",

        details
      ].join(
        "\n"
      );

    const expenseData = {
      concept,

      category:
        "Inventario",

      amount,

      paymentMethod:
        "No especificado",

      notes,

      dayKey:
        getInventoryDayKey(
          validOperationDate
        ),

      userId:
        user
          ? user.uid
          : auth.currentUser
            ? auth.currentUser.uid
            : null,

      userName:
        context.name ||
        user?.email ||
        "Usuario",

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

      source:
        "inventario",

      inventoryOperation:
        true,

      inventoryOperationDate:
        getLocalDateInputValue(
          validOperationDate
        ),

      inventoryProductCount:
        productCount,

      inventoryTotalUnits:
        totalUnits
    };

    await expenseRef.set({
      ...expenseData,

      createdAt:
        operationTimestamp
    });

    upsertSessionDocument(
      EXPENSES_COLLECTION,
      expenseRef.id,
      {
        ...expenseData,

        createdAt:
          operationTimestamp.toMillis()
      }
    );

    return {
      created:
        true,

      amount,

      id:
        expenseRef.id
    };
  }

  async function attachExpenseToMovements(
    expenseId,
    results
  ) {
    const movementIds =
      Array.from(
        new Set(
          (results || [])
            .map(
              result =>
                String(
                  result?.movementId ||
                  ""
                ).trim()
            )
            .filter(
              Boolean
            )
        )
      );

    if (
      !expenseId ||
      !movementIds.length
    ) {
      return;
    }

    const batch =
      db.batch();

    movementIds.forEach(
      movementId => {
        batch.update(
          db
            .collection(
              MOVEMENTS_COLLECTION
            )
            .doc(
              movementId
            ),
          {
            expenseId,

            updatedAt:
              firebase.firestore
                .FieldValue
                .serverTimestamp()
          }
        );
      }
    );

    await batch.commit();

    movementIds.forEach(
      movementId => {
        const current =
          getSessionCollection(
            MOVEMENTS_COLLECTION
          ).find(
            item =>
              String(
                item.id
              ) ===
              movementId
          );

        if (
          current
        ) {
          upsertSessionDocument(
            MOVEMENTS_COLLECTION,
            movementId,
            {
              ...(current.data || {}),

              expenseId,

              updatedAt:
                Date.now()
            }
          );
        }
      }
    );

    invalidateAllMovementsCache();
  }

  /*
   * ============================================================
   * VENTAS
   * ============================================================
   */

  function getSaleProductId(
    product
  ) {
    return String(
      product?.productId ||
      product?.productID ||
      product?.product_id ||
      product?.id ||
      ""
    ).trim();
  }

  function aggregateMonthlySales(
    documents
  ) {
    const unitsMap =
      {};

    const boxesMap =
      {};

    const now =
      new Date();

    const monthStart =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0,
        0,
        0,
        0
      );

    const nextMonthStart =
      new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        1,
        0,
        0,
        0,
        0
      );

    documents.forEach(
      document => {
        const sale =
          document?.data ||
          {};

        if (
          !matchesCurrentLocal(
            sale
          )
        ) {
          return;
        }

        const createdAtMs =
          getTimestampMs(
            sale.createdAt
          );

        if (
          createdAtMs &&
          (
            createdAtMs <
            monthStart.getTime() ||
            createdAtMs >=
            nextMonthStart.getTime()
          )
        ) {
          return;
        }

        if (
          !createdAtMs
        ) {
          return;
        }

        const products =
          Array.isArray(
            sale.products
          )
            ? sale.products
            : [];

        products.forEach(
          product => {
            const productId =
              getSaleProductId(
                product
              );

            if (
              !productId
            ) {
              return;
            }

            const unitsPerBox =
              Math.max(
                1,
                numberOrZero(
                  product.unitsPerBox
                )
              );

            const mode =
              normalizeText(
                product.mode ||
                product.saleMode ||
                product.saleType ||
                ""
              );

            const quantity =
              numberOrZero(
                product.quantity
              );

            const totalUnits =
              numberOrZero(
                product.unitsTotal ||
                product.totalUnits
              );

            let soldUnits =
              0;

            let soldBoxes =
              0;

            if (
              mode ===
              "box"
            ) {
              soldBoxes =
                quantity > 0
                  ? Math.floor(
                    quantity
                  )
                  : totalUnits > 0
                    ? Math.floor(
                      totalUnits /
                      unitsPerBox
                    )
                    : 0;

              soldUnits =
                totalUnits > 0
                  ? totalUnits
                  : soldBoxes *
                  unitsPerBox;
            } else if (
              mode ===
              "unit"
            ) {
              soldUnits =
                totalUnits > 0
                  ? totalUnits
                  : quantity;
            } else if (
              totalUnits > 0
            ) {
              soldUnits =
                totalUnits;
            } else if (
              numberOrZero(
                product.boxes
              ) > 0
            ) {
              soldBoxes =
                integerOrZero(
                  product.boxes
                );

              soldUnits =
                soldBoxes *
                unitsPerBox;
            } else {
              soldUnits =
                quantity;
            }

            unitsMap[
              productId
            ] =
              (
                unitsMap[
                productId
                ] || 0
              ) +
              soldUnits;

            boxesMap[
              productId
            ] =
              (
                boxesMap[
                productId
                ] || 0
              ) +
              soldBoxes;
          }
        );
      }
    );

    return {
      unitsMap,
      boxesMap
    };
  }

  /*
   * ============================================================
   * VENTAS HISTÓRICAS
   * ============================================================
   */

  function aggregateAllTimeSalesMap(
    documents
  ) {
    const unitsMap =
      {};

    documents.forEach(
      document => {
        const sale =
          document?.data ||
          {};

        if (
          !matchesCurrentLocal(
            sale
          )
        ) {
          return;
        }

        const products =
          Array.isArray(
            sale.products
          )
            ? sale.products
            : [];

        products.forEach(
          product => {
            const productId =
              getSaleProductId(
                product
              );

            if (
              !productId
            ) {
              return;
            }

            const unitsPerBox =
              Math.max(
                1,
                numberOrZero(
                  product.unitsPerBox
                )
              );

            const mode =
              normalizeText(
                product.mode ||
                product.saleMode ||
                product.saleType ||
                ""
              );

            const quantity =
              numberOrZero(
                product.quantity
              );

            const totalUnits =
              numberOrZero(
                product.unitsTotal ||
                product.totalUnits
              );

            let soldUnits =
              0;

            if (
              mode ===
              "box"
            ) {
              soldUnits =
                totalUnits > 0
                  ? totalUnits
                  : Math.floor(
                    quantity
                  ) *
                  unitsPerBox;
            } else if (
              mode ===
              "unit"
            ) {
              soldUnits =
                totalUnits > 0
                  ? totalUnits
                  : quantity;
            } else if (
              totalUnits > 0
            ) {
              soldUnits =
                totalUnits;
            } else if (
              numberOrZero(
                product.boxes
              ) > 0
            ) {
              soldUnits =
                integerOrZero(
                  product.boxes
                ) *
                unitsPerBox;
            } else {
              soldUnits =
                quantity;
            }

            unitsMap[
              productId
            ] =
              (
                unitsMap[
                productId
                ] || 0
              ) +
              soldUnits;
          }
        );
      }
    );

    return unitsMap;
  }

  /*
   * ============================================================
   * SUMA MOVIMIENTOS
   * ============================================================
   */

  function calculateMovementNetStockMap(
    movementDocuments
  ) {
    const stockMap =
      {};

    movementDocuments.forEach(
      ({
        id,
        data
      }) => {
        if (
          !matchesCurrentLocal(
            data
          )
        ) {
          return;
        }

        const productId =
          String(
            data?.productId ||
            data?.productID ||
            data?.product_id ||
            ""
          ).trim();

        if (
          !productId
        ) {
          return;
        }

        const movement =
          normalizeMovementDocument(
            id,
            data
          );

        const entry =
          numberOrZero(
            movement.entrada
          );

        const exit =
          numberOrZero(
            movement.salida
          );

        stockMap[
          productId
        ] =
          (
            stockMap[
            productId
            ] || 0
          ) +
          (
            entry -
            exit
          );
      }
    );

    return stockMap;
  }

  /*
   * ============================================================
   * RECONCILIACIÓN
   * ============================================================
   */

  async function reconcileProductsAgainstMovements(
    products,
    movementDocuments,
    salesDocuments
  ) {
    if (
      !Array.isArray(
        products
      ) ||
      !products.length
    ) {
      return;
    }

    const movementStockMap =
      calculateMovementNetStockMap(
        movementDocuments
      );

    const salesStockMap =
      aggregateAllTimeSalesMap(
        salesDocuments
      );

    const updates =
      [];

    products.forEach(
      product => {
        const productId =
          String(
            product?.id ||
            ""
          ).trim();

        if (
          !productId
        ) {
          return;
        }

        const movementNet =
          numberOrZero(
            movementStockMap[
            productId
            ]
          );

        const historicalSales =
          numberOrZero(
            salesStockMap[
            productId
            ]
          );

        if (
          movementNet <=
          0
        ) {
          return;
        }

        if (
          historicalSales >
          0
        ) {
          return;
        }

        const currentStock =
          getCurrentStockUnits(
            product
          );

        if (
          currentStock ===
          movementNet
        ) {
          return;
        }

        updates.push({
          product,

          previousStock:
            currentStock,

          stock:
            movementNet
        });
      }
    );

    if (
      !updates.length
    ) {
      return;
    }

    const chunks =
      [];

    for (
      let index = 0;
      index <
      updates.length;
      index +=
      450
    ) {
      chunks.push(
        updates.slice(
          index,
          index + 450
        )
      );
    }

    for (
      const chunk of chunks
    ) {
      const batch =
        db.batch();

      chunk.forEach(
        ({
          product,
          stock
        }) => {
          const ref =
            db
              .collection(
                PRODUCTS_COLLECTION
              )
              .doc(
                product.id
              );

          const unitsPerBox =
            getUnitsPerBox(
              product
            );

          batch.update(
            ref,
            {
              quantity:
                stock,

              stockCurrentUnits:
                stock,

              boxes:
                Math.floor(
                  stock /
                  unitsPerBox
                ),

              updatedAt:
                firebase.firestore
                  .FieldValue
                  .serverTimestamp()
            }
          );
        }
      );

      await batch.commit();

      chunk.forEach(
        ({
          product,
          stock
        }) => {
          const unitsPerBox =
            getUnitsPerBox(
              product
            );

          product.quantity =
            stock;

          product.stockCurrentUnits =
            stock;

          product.boxes =
            Math.floor(
              stock /
              unitsPerBox
            );

          upsertSessionDocument(
            PRODUCTS_COLLECTION,
            product.id,
            {
              ...product,

              quantity:
                stock,

              stockCurrentUnits:
                stock,

              boxes:
                Math.floor(
                  stock /
                  unitsPerBox
                ),

              updatedAt:
                Date.now()
            }
          );
        }
      );
    }
  }

  /*
   * ============================================================
   * COMBOBOX PRODUCTO
   * ============================================================
   */

  let batchLineCounter =
    0;

  function buildProductCombobox(
    rowId,
    value = ""
  ) {
    return `
      <input
        id="batch-product-${escapeHtml(
      rowId
    )}"
        class="batch-product-input inv-combobox"
        type="text"
        list="batch-product-list-${escapeHtml(
      rowId
    )}"
        value="${escapeHtml(
      value
    )}"
        placeholder="Producto existente o nombre nuevo"
        autocomplete="off"
      >

      <datalist
        id="batch-product-list-${escapeHtml(
      rowId
    )}"
      >
        ${getProductComboOptionsHtml()}
      </datalist>
    `;
  }

  function refreshProductComboboxDatalist(
    rowElement
  ) {
    const input =
      rowElement.querySelector(
        ".batch-product-input"
      );

    if (
      !input
    ) {
      return;
    }

    const listId =
      input.getAttribute(
        "list"
      );

    if (
      !listId
    ) {
      return;
    }

    const list =
      document.getElementById(
        listId
      );

    if (
      !list
    ) {
      return;
    }

    list.innerHTML =
      getProductComboOptionsHtml();
  }

  function createBatchLineData(
    values = {}
  ) {
    batchLineCounter +=
      1;

    const initialUnitsPerBox =
      Math.max(
        1,
        integerOrZero(
          values.unitsPerBox
        ) || 1
      );

    const initialCostPerBox =
      numberOrZero(
        values.lastCostPerBox ??
        values.costoPorCaja
      );

    const initialCostPerUnit =
      initialCostPerBox >
        0
        ? initialCostPerBox /
        initialUnitsPerBox
        : numberOrZero(
          values.lastCostPerUnit ??
          values.costoUnitario
        );

    return {
      id:
        `line-${batchLineCounter}`,

      mode:
        values.mode ||
        "existing",

      productText:
        values.productText ||
        "",

      name:
        values.name ||
        "",

      codigoProducto:
        values.codigoProducto ||
        "",

      proveedorId:
        values.proveedorId ||
        "",

      proveedorNombre:
        values.proveedorNombre ||
        "",

      proveedorRazonSocial:
        values.proveedorRazonSocial ||
        values.proveedorRazonSocialDenominacion ||
        "",

      boxes:
        integerOrZero(
          values.boxes
        ),

      bonusBoxes:
        integerOrZero(
          values.bonusBoxes
        ),

      units:
        integerOrZero(
          values.units
        ),

      bonusUnits:
        integerOrZero(
          values.bonusUnits
        ),

      unitsPerBox:
        initialUnitsPerBox,

      lastCostPerBox:
        initialCostPerBox,

      lastCostPerUnit:
        initialCostPerUnit,

      price:
        numberOrZero(
          values.price
        ),

      referenciaLibro:
        values.referenciaLibro ||
        "",

      numeroDocumento:
        values.numeroDocumento ||
        ""
    };
  }

  function getProductComboOptionsHtml() {
    return currentProductsList
      .map(
        product => {
          const name =
            String(
              product.name ||
              ""
            ).trim();

          const code =
            getProductCode(
              product
            );

          const provider =
            getProductProviderName(
              product
            );

          const providerReason =
            getProductProviderReason(
              product
            );

          const display =
            [
              name,
              code ||
              "",
              provider ||
              "",
              providerReason ||
              ""
            ]
              .filter(
                Boolean
              )
              .join(
                " — "
              );

          return `
            <option
              value="${escapeHtml(
            name
          )}"
              label="${escapeHtml(
            display
          )}"
            ></option>
          `;
        }
      )
      .join("");
  }

  function getProductFilterOptionsHtml() {
    return currentProductsList
      .map(
        product => {
          const name =
            String(
              product.name ||
              ""
            ).trim();

          const code =
            getProductCode(
              product
            );

          const provider =
            getProductProviderName(
              product
            );

          const providerReason =
            getProductProviderReason(
              product
            );

          const display =
            [
              name,
              code ||
              "",
              provider ||
              "",
              providerReason ||
              ""
            ]
              .filter(
                Boolean
              )
              .join(
                " — "
              );

          return `
            <option
              value="${escapeHtml(
            name
          )}"
              label="${escapeHtml(
            display
          )}"
            ></option>
          `;
        }
      )
      .join("");
  }

  /*
   * ============================================================
   * PROYECCIONES
   * ============================================================
   */

  function buildProjectionForProduct(
    product
  ) {
    const stockUnits =
      getCurrentStockUnits(
        product
      );

    const stockBoxes =
      getStockBoxes(
        product
      );

    const unitsPerBox =
      getUnitsPerBox(
        product
      );

    const soldUnits =
      numberOrZero(
        currentMonthlySalesMap[
        product.id
        ]
      );

    const soldBoxes =
      Math.floor(
        numberOrZero(
          currentMonthlyBoxesMap[
          product.id
          ]
        )
      );

    const costPerUnit =
      getCostPerUnit(
        product
      );

    let suggestedUnits =
      soldUnits +
      SAFETY_STOCK_DEFAULT -
      stockUnits;

    suggestedUnits =
      Math.max(
        0,
        suggestedUnits
      );

    const suggestedBoxes =
      unitsPerBox > 1
        ? Math.ceil(
          suggestedUnits /
          unitsPerBox
        )
        : suggestedUnits;

    let status =
      "OK";

    if (
      suggestedUnits >
      0
    ) {
      status =
        "Reponer";
    } else if (
      stockUnits <=
      LOW_STOCK_THRESHOLD
    ) {
      status =
        "Bajo";
    }

    return {
      stockUnits,

      stockBoxes,

      unitsPerBox,

      soldUnits,

      soldBoxes,

      costPerUnit,

      suggestedUnits,

      suggestedBoxes,

      status
    };
  }

  function buildRowData(
    product
  ) {
    const projection =
      buildProjectionForProduct(
        product
      );

    const providerName =
      getProductProviderName(
        product
      );

    const providerReason =
      getProductProviderReason(
        product
      );

    const productCode =
      getProductCode(
        product
      );

    return {
      id:
        product.id,

      name:
        product.name ||
        "—",

      providerName,

      providerReason,

      productCode,

      price:
        numberOrZero(
          product.price
        ),

      stockUnits:
        projection.stockUnits,

      stockBoxes:
        projection.stockBoxes,

      unitsPerBox:
        projection.unitsPerBox,

      soldMonthUnits:
        projection.soldUnits,

      soldMonthBoxes:
        projection.soldBoxes,

      costPerUnit:
        projection.costPerUnit,

      suggestedPurchaseUnits:
        projection.suggestedUnits,

      suggestedPurchaseBoxes:
        projection.suggestedBoxes,

      status:
        projection.status,

      searchText:
        [
          product.name,
          productCode,
          providerName,
          providerReason
        ]
          .filter(Boolean)
          .join(" ")
    };
  }

  /*
   * ============================================================
   * TABLA
   * ============================================================
   */

  function renderStatusChip(
    status
  ) {
    if (
      status ===
      "Reponer"
    ) {
      return `
        <span style="
          padding:4px 8px;
          border-radius:999px;
          background:#fee2e2;
          color:#b91c1c;
          font-weight:700;
        ">
          Reponer
        </span>
      `;
    }

    if (
      status ===
      "Bajo"
    ) {
      return `
        <span style="
          padding:4px 8px;
          border-radius:999px;
          background:#fef3c7;
          color:#92400e;
          font-weight:700;
        ">
          Bajo
        </span>
      `;
    }

    return `
      <span style="
        padding:4px 8px;
        border-radius:999px;
        background:#dcfce7;
        color:#166534;
        font-weight:700;
      ">
        OK
      </span>
    `;
  }

  function renderStockDisplay(
    row
  ) {
    if (
      row.unitsPerBox >
      1
    ) {
      const boxes =
        Math.floor(
          numberOrZero(
            row.stockUnits
          ) /
          row.unitsPerBox
        );

      const remainder =
        numberOrZero(
          row.stockUnits
        ) %
        row.unitsPerBox;

      return `
        <strong>
          ${row.stockUnits}
        </strong>

        <br>

        <small>
          ${boxes}
          ${boxes === 1
          ? "caja"
          : "cajas"
        }

          ×

          ${row.unitsPerBox}
          unidades

          ${remainder > 0
          ? `
                +
                ${remainder}
                sueltas
              `
          : ""
        }
        </small>
      `;
    }

    return `${row.stockUnits}`;
  }

  function renderActions(
    row
  ) {
    if (
      !canEditInventory
    ) {
      return `
        <span class="small">
          Solo lectura
        </span>
      `;
    }

    const isAdmin =
      currentRole ===
      "administrador" ||
      currentRole ===
      "admin";

    return `
      <button
        type="button"
        class="btn-outline"
        data-action="movements"
        data-id="${escapeHtml(
      row.id
    )}"
        title="Editar entradas de este producto"
      >
        <i class="fas fa-history"></i>
        Entradas
      </button>

      <button
        type="button"
        class="btn-outline"
        data-action="delete"
        data-id="${escapeHtml(
      row.id
    )}"
        data-name="${escapeHtml(
      row.name
    )}"
        style="margin-left:8px;"
        ${isAdmin
        ? ""
        : "disabled title='Solo administrador puede eliminar productos'"
      }
      >
        <i class="fas fa-trash"></i>
        Eliminar
      </button>
    `;
  }

  function ensureInventoryDataTable() {
    if (
      inventoryDT
    ) {
      return inventoryDT;
    }

    if (
      !window.jQuery ||
      !$.fn ||
      !$.fn.DataTable
    ) {
      console.warn(
        "DataTables no está cargado."
      );

      return null;
    }

    const table =
      document.getElementById(
        "inventoryTable"
      );

    if (!table) {
      console.warn(
        "No existe #inventoryTable."
      );

      return null;
    }

    inventoryDT =
      $("#inventoryTable")
        .DataTable({
          data: [],

          columns: [
            {
              data:
                "name",

              title:
                "Nombre",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? escapeHtml(
                      data
                    )
                    : data
            },

            {
              data:
                "providerName",

              title:
                "Proveedor",

              render:
                (
                  data,
                  type,
                  row
                ) =>
                  type ===
                    "display"
                    ? escapeHtml(
                      row.providerReason
                        ? `${data || "Sin proveedor"} — ${row.providerReason}`
                        : data ||
                        "Sin proveedor"
                    )
                    : data
            },

            {
              data:
                "stockUnits",

              title:
                "Stock",

              render:
                (
                  data,
                  type,
                  row
                ) =>
                  type ===
                    "display"
                    ? renderStockDisplay(
                      row
                    )
                    : data
            },

            {
              data:
                "price",

              title:
                "Precio",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? currency(
                      data
                    )
                    : data
            },

            {
              data:
                "soldMonthUnits",

              title:
                "Vendido Mes (Unid.)",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? numberOrZero(
                      data
                    )
                    : data
            },

            {
              data:
                "soldMonthBoxes",

              title:
                "Vendido Mes (Cajas)",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? integerOrZero(
                      data
                    )
                    : data
            },

            {
              data:
                "costPerUnit",

              title:
                "Costo por unidad",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? currency(
                      data
                    )
                    : data
            },

            {
              data:
                "suggestedPurchaseUnits",

              title:
                "Sugerido Compra (Unid.)",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? numberOrZero(
                      data
                    )
                    : data
            },

            {
              data:
                "suggestedPurchaseBoxes",

              title:
                "Sugerido Compra (Cajas)",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? integerOrZero(
                      data
                    )
                    : data
            },

            {
              data:
                "status",

              title:
                "Estado",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? renderStatusChip(
                      data
                    )
                    : data
            },

            {
              data:
                "searchText",

              title:
                "Búsqueda",

              visible:
                false,

              searchable:
                true,

              orderable:
                false
            },

            {
              data:
                null,

              title:
                "Acciones",

              orderable:
                false,

              searchable:
                false,

              render:
                (
                  data,
                  type,
                  row
                ) =>
                  type ===
                    "display"
                    ? renderActions(
                      row
                    )
                    : ""
            }
          ],

          pageLength:
            10,

          lengthMenu:
            [
              5,
              10,
              25,
              50
            ],

          order: [
            [
              0,
              "asc"
            ]
          ],

          autoWidth:
            false,

          scrollX:
            true,

          scrollCollapse:
            true,

          deferRender:
            true,

          dom:
            'rt<"bottom"ip><"clear">',

          language: {
            emptyTable:
              "No hay productos registrados.",

            zeroRecords:
              "No se encontraron coincidencias.",

            info:
              "Mostrando _START_ a _END_ de _TOTAL_",

            infoEmpty:
              "No hay registros",

            infoFiltered:
              "(filtrado de _MAX_ registros)",

            paginate: {
              previous:
                "‹",

              next:
                "›"
            }
          }
        });

    $("#inventoryTable tbody")
      .off(
        "click.inventoryMovements"
      )
      .on(
        "click.inventoryMovements",
        "button[data-action='movements']",
        function () {
          if (
            !canEditInventory
          ) {
            return;
          }

          openMovementManagerModal(
            String(
              $(this).data(
                "id"
              )
            )
          );
        }
      );

    $("#inventoryTable tbody")
      .off(
        "click.inventoryDelete"
      )
      .on(
        "click.inventoryDelete",
        "button[data-action='delete']",
        function () {
          if (
            !canEditInventory
          ) {
            return;
          }

          confirmDeleteProduct(
            String(
              $(this).data(
                "id"
              )
            ),
            String(
              $(this).data(
                "name"
              ) ||
              ""
            )
          );
        }
      );

    return inventoryDT;
  }

  /*
   * ============================================================
   * RESUMEN
   * ============================================================
   */

  function refreshInventoryView() {
    const rows =
      currentProductsList.map(
        buildRowData
      );

    const totalValue =
      rows.reduce(
        (
          sum,
          row
        ) =>
          sum +
          (
            numberOrZero(
              row.stockUnits
            ) *
            numberOrZero(
              row.price
            )
          ),
        0
      );

    const lowStock =
      rows.filter(
        row =>
          row.stockUnits <=
          LOW_STOCK_THRESHOLD ||
          row.suggestedPurchaseUnits >
          0
      );

    const totalProductsCard =
      getInventoryTotalProductsCard();

    const totalValueCard =
      getInventoryTotalValueCard();

    const lowStockCard =
      getInventoryLowStockCard();

    if (
      totalProductsCard
    ) {
      totalProductsCard.textContent =
        String(
          rows.length
        );
    }

    if (
      totalValueCard
    ) {
      totalValueCard.textContent =
        currency(
          totalValue
        );
    }

    if (
      lowStockCard
    ) {
      lowStockCard.textContent =
        String(
          lowStock.length
        );
    }

    renderLowStockPanel(
      lowStock
    );

    const dt =
      ensureInventoryDataTable();

    if (
      dt
    ) {
      const searchInput =
        getInventorySearchInput();

      const searchValue =
        searchInput
          ? searchInput.value.trim()
          : "";

      dt.clear();

      dt.rows.add(
        rows
      );

      dt.draw(
        false
      );

      dt.search(
        searchValue
      ).draw(
        false
      );

      return;
    }

    renderInventoryFallback(
      rows
    );
  }

  function renderInventoryFallback(
    rows
  ) {
    const inventoryTbody =
      getInventoryTableBody();

    if (
      !inventoryTbody
    ) {
      return;
    }

    inventoryTbody.innerHTML =
      "";

    if (
      !rows.length
    ) {
      inventoryTbody.innerHTML =
        `
          <tr>
            <td colspan="12">
              No hay productos registrados.
            </td>
          </tr>
        `;

      return;
    }

    rows.forEach(
      row => {
        const tr =
          document.createElement(
            "tr"
          );

        tr.innerHTML = `
          <td>
            ${escapeHtml(
          row.name
        )}
          </td>

          <td>
            ${escapeHtml(
          row.providerReason
            ? `${row.providerName ||
            "Sin proveedor"
            } — ${row.providerReason}`
            : row.providerName ||
            "Sin proveedor"
        )}
          </td>

          <td>
            ${renderStockDisplay(
          row
        )}
          </td>

          <td>
            ${currency(
          row.price
        )}
          </td>

          <td>
            ${row.soldMonthUnits}
          </td>

          <td>
            ${row.soldMonthBoxes}
          </td>

          <td>
            ${currency(
          row.costPerUnit
        )}
          </td>

          <td>
            ${row.suggestedPurchaseUnits}
          </td>

          <td>
            ${row.suggestedPurchaseBoxes}
          </td>

          <td>
            ${renderStatusChip(
          row.status
        )}
          </td>

          <td>
            ${renderActions(
          row
        )}
          </td>
        `;

        inventoryTbody.appendChild(
          tr
        );
      }
    );
  }

  function renderLowStockPanel(
    list
  ) {
    const lowStockPanel =
      getLowStockPanel();

    if (
      !lowStockPanel
    ) {
      return;
    }

    if (
      !list.length
    ) {
      lowStockPanel.style.display =
        "none";

      lowStockPanel.innerHTML =
        "";

      return;
    }

    lowStockPanel.style.display =
      "block";

    lowStockPanel.innerHTML =
      "";

    list.forEach(
      product => {
        const item =
          document.createElement(
            "div"
          );

        item.className =
          "low-stock-item";

        item.innerHTML = `
          <div>
            <strong>
              ${escapeHtml(
          product.name
        )}
            </strong>

            <div class="small">
              Proveedor:
              ${escapeHtml(
          product.providerReason
            ? `${product.providerName ||
            "Sin proveedor"
            } — ${product.providerReason}`
            : product.providerName ||
            "Sin proveedor"
        )}
            </div>
          </div>

          <div>
            Stock:
            <strong>
              ${product.stockUnits}
            </strong>

            |

            Vendido:
            <strong>
              ${product.soldMonthUnits}
            </strong>

            |

            Sugerido:
            <strong>
              ${product.suggestedPurchaseUnits}
            </strong>
          </div>
        `;

        lowStockPanel.appendChild(
          item
        );
      }
    );
  }

  /*
   * ============================================================
   * CARGA INVENTARIO
   * ============================================================
   */

  async function loadInventoryData() {
    if (
      inventoryLoadPromise
    ) {
      return inventoryLoadPromise;
    }

    inventoryLoadPromise =
      (async () => {
        if (
          !currentLocalId
        ) {
          currentProductsList =
            [];

          currentMonthlySalesMap =
            {};

          currentMonthlyBoxesMap =
            {};

          refreshInventoryView();

          return;
        }

        const productDocuments =
          getSessionCollection(
            PRODUCTS_COLLECTION
          );

        const products =
          [];

        productDocuments.forEach(
          ({
            id,
            data
          }) => {
            if (
              !matchesCurrentLocal(
                data
              )
            ) {
              return;
            }

            const providerId =
              String(
                data.proveedorId ||
                ""
              ).trim();

            let providerName =
              String(
                data.proveedorNombre ||
                ""
              ).trim();

            let providerReason =
              String(
                data.proveedorRazonSocial ||
                data.proveedorRazonSocialDenominacion ||
                data.proveedorDenominacion ||
                ""
              ).trim();

            if (
              providerId
            ) {
              const provider =
                getProviderById(
                  providerId
                );

              if (
                provider
              ) {
                providerName =
                  getProviderName(
                    provider
                  ) ||
                  providerName;

                providerReason =
                  getProviderBusinessName(
                    provider
                  ) ||
                  providerReason;
              }
            }

            const stockUnits =
              getCurrentStockUnits(
                data
              );

            products.push({
              id,

              ...data,

              proveedorId:
                providerId ||
                null,

              proveedorNombre:
                providerName,

              proveedorRazonSocial:
                providerReason,

              id_local:
                currentLocalId,

              localNombre:
                data.localNombre ||
                currentLocalInfo.nombre ||
                "",

              localNumeroDocumento:
                data.localNumeroDocumento ||
                currentLocalInfo.numeroDocumento ||
                "",

              localUbicacion:
                data.localUbicacion ||
                currentLocalInfo.ubicacion ||
                "",

              localContribuyente:
                data.localContribuyente ||
                currentLocalInfo.contribuyente ||
                "",

              localTipoDocumento:
                data.localTipoDocumento ||
                currentLocalInfo.tipoDocumento ||
                "",

              localNIT:
                data.localNIT ||
                currentLocalInfo.nit ||
                "",

              localNRC:
                data.localNRC ||
                currentLocalInfo.nrc ||
                "",

              quantity:
                stockUnits,

              stockCurrentUnits:
                stockUnits,

              unitsPerBox:
                Math.max(
                  1,
                  numberOrZero(
                    data.unitsPerBox
                  ) || 1
                )
            });
          }
        );

        products.sort(
          (
            a,
            b
          ) =>
            normalizeText(
              a.name
            ).localeCompare(
              normalizeText(
                b.name
              ),
              "es"
            )
        );

        currentProductsList =
          products;

        const salesDocuments =
          getSessionCollection(
            SALES_COLLECTION
          );

        const sales =
          aggregateMonthlySales(
            salesDocuments
          );

        currentMonthlySalesMap =
          sales.unitsMap;

        currentMonthlyBoxesMap =
          sales.boxesMap;

        await reconcileProductsAgainstMovements(
          currentProductsList,
          getSessionCollection(
            MOVEMENTS_COLLECTION
          ),
          salesDocuments
        );

        refreshInventoryView();

        console.log(
          "[Inventario] Datos cargados desde caché:",
          {
            productos:
              currentProductsList.length,

            ventas:
              salesDocuments.length,

            proveedores:
              currentProvidersList.length
          }
        );
      })();

    try {
      return await inventoryLoadPromise;
    } finally {
      inventoryLoadPromise =
        null;
    }
  }

  /*
   * ============================================================
   * MOVIMIENTOS
   * ============================================================
   */

  function invalidateProductStockMovementsCache(
    productId
  ) {
    const target =
      String(
        productId ||
        ""
      ).trim();

    if (
      target
    ) {
      productStockMovementsCache.delete(
        target
      );
    }
  }

  function invalidateAllMovementsCache() {
    productStockMovementsCache.clear();
  }

  function getMovementUnitsPerBox(
    movement,
    product = null
  ) {
    const movementValue =
      integerOrZero(
        movement?.unidadesPorCaja ??
        movement?.unitsPerBox
      );

    if (
      movementValue > 0
    ) {
      return movementValue;
    }

    const productValue =
      product
        ? integerOrZero(
          product.unitsPerBox
        )
        : 0;

    return Math.max(
      1,
      productValue || 1
    );
  }

  function getMovementBreakdown(
    movement,
    product = null
  ) {
    const unitsPerBox =
      getMovementUnitsPerBox(
        movement,
        product
      );

    const hasExplicitBreakdown =
      movement?.cajas !==
      undefined ||
      movement?.cajasBono !==
      undefined ||
      movement?.unidades !==
      undefined ||
      movement?.unidadesBono !==
      undefined ||
      movement?.boxes !==
      undefined ||
      movement?.bonusBoxes !==
      undefined ||
      movement?.units !==
      undefined ||
      movement?.bonusUnits !==
      undefined;

    let cajas =
      integerOrZero(
        movement?.cajas ??
        movement?.boxes
      );

    let cajasBono =
      integerOrZero(
        movement?.cajasBono ??
        movement?.bonusBoxes
      );

    let unidades =
      integerOrZero(
        movement?.unidades ??
        movement?.units
      );

    let unidadesBono =
      integerOrZero(
        movement?.unidadesBono ??
        movement?.bonusUnits
      );

    if (
      !hasExplicitBreakdown
    ) {
      let paidUnits =
        integerOrZero(
          movement?.entradaPagada
        );

      let bonusUnits =
        integerOrZero(
          movement?.entradaBono
        );

      if (
        paidUnits <=
        0 &&
        bonusUnits <=
        0
      ) {
        paidUnits =
          Math.max(
            0,
            integerOrZero(
              movement?.entrada
            )
          );
      }

      cajas =
        Math.floor(
          paidUnits /
          unitsPerBox
        );

      unidades =
        paidUnits %
        unitsPerBox;

      cajasBono =
        Math.floor(
          bonusUnits /
          unitsPerBox
        );

      unidadesBono =
        bonusUnits %
        unitsPerBox;
    }

    const paidUnits =
      cajas *
      unitsPerBox +
      unidades;

    const bonusUnits =
      cajasBono *
      unitsPerBox +
      unidadesBono;

    const totalUnits =
      paidUnits +
      bonusUnits;

    return {
      cajas,

      cajasBono,

      unidades,

      unidadesBono,

      unitsPerBox,

      paidUnits,

      bonusUnits,

      totalUnits
    };
  }

  function normalizeMovementDocument(
    id,
    data
  ) {
    const source =
      data || {};

    const productId =
      String(
        source.productId ||
        source.productID ||
        source.product_id ||
        ""
      ).trim();

    const product =
      findProductById(
        productId
      );

    const unitsPerBox =
      getMovementUnitsPerBox(
        source,
        product
      );

    const breakdown =
      getMovementBreakdown(
        source,
        product
      );

    const entrada =
      breakdown.totalUnits > 0
        ? breakdown.totalUnits
        : numberOrZero(
          source.entrada
        );

    const salida =
      numberOrZero(
        source.salida
      );

    const costoUnitario =
      numberOrZero(
        source.costoUnitario
      ) > 0
        ? numberOrZero(
          source.costoUnitario
        )
        : numberOrZero(
          source.costoPorUnidad
        );

    const costoPorCaja =
      numberOrZero(
        source.costoPorCaja
      ) > 0
        ? numberOrZero(
          source.costoPorCaja
        )
        : costoUnitario *
        unitsPerBox;

    const precioVenta =
      numberOrZero(
        source.precioVenta ??
        source.price
      );

    const costoTotal =
      source.costoTotal !==
        undefined &&
        source.costoTotal !==
        null
        ? Math.max(
          0,
          numberOrZero(
            source.costoTotal
          )
        )
        : Math.max(
          0,
          breakdown.paidUnits *
          costoUnitario
        );

    /*
     * El proveedor del movimiento tiene prioridad.
     *
     * Si el movimiento antiguo no tiene proveedor, se usa
     * el proveedor del producto únicamente como fallback visual.
     */
    const movementProviderId =
      String(
        source.proveedorId ||
        ""
      ).trim();

    const movementProviderName =
      String(
        source.proveedorNombre ||
        ""
      ).trim();

    const movementProviderReason =
      String(
        source.proveedorRazonSocial ||
        source.proveedorRazonSocialDenominacion ||
        source.proveedorDenominacion ||
        ""
      ).trim();

    const providerById =
      getProviderById(
        movementProviderId
      );

    const providerName =
      movementProviderName ||
      getProviderName(
        providerById
      ) ||
      getProductProviderName(
        product
      ) ||
      "";

    const providerReason =
      movementProviderReason ||
      getProviderBusinessName(
        providerById
      ) ||
      getProductProviderReason(
        product
      ) ||
      "";

    return {
      id,

      ...source,

      productId,

      productName:
        String(
          source.productName ||
          product?.name ||
          ""
        ).trim(),

      codigoProducto:
        String(
          source.codigoProducto ||
          source.productCode ||
          getProductCode(
            product
          ) ||
          ""
        ).trim(),

      providerName,

      proveedorId:
        movementProviderId ||
        getProductProviderId(
          product
        ) ||
        "",

      proveedorNombre:
        providerName,

      proveedorRazonSocial:
        providerReason,

      tipoMovimiento:
        String(
          source.tipoMovimiento ||
          ""
        )
          .trim()
          .toLowerCase(),

      referenciaLibro:
        String(
          source.referenciaLibro ||
          source.referenceBook ||
          source.bookReference ||
          ""
        ).trim(),

      numeroDocumento:
        String(
          source.numeroDocumento ||
          source.documentNumber ||
          ""
        ).trim(),

      entrada,

      salida,

      saldoAnterior:
        numberOrZero(
          source.saldoAnterior
        ),

      saldoActual:
        numberOrZero(
          source.saldoActual
        ),

      cajas:
        breakdown.cajas,

      boxes:
        breakdown.cajas,

      cajasBono:
        breakdown.cajasBono,

      bonusBoxes:
        breakdown.cajasBono,

      unidades:
        breakdown.unidades,

      units:
        breakdown.unidades,

      unidadesBono:
        breakdown.unidadesBono,

      bonusUnits:
        breakdown.unidadesBono,

      unidadesPorCaja:
        unitsPerBox,

      unitsPerBox,

      entradaPagada:
        breakdown.paidUnits,

      entradaBono:
        breakdown.bonusUnits,

      costoUnitario,

      unitCost:
        costoUnitario,

      costoPorUnidad:
        costoUnitario,

      costoPorCaja,

      lastCostPerBox:
        costoPorCaja,

      precioVenta,

      price:
        precioVenta,

      costoTotal,

      expenseId:
        String(
          source.expenseId ||
          ""
        ).trim(),

      detalle:
        String(
          source.detalle ||
          ""
        ),

      fechaOperacion:
        getMovementOperationDateValue(
          source
        ),

      createdAtMs:
        getTimestampMs(
          source.createdAt
        )
    };
  }

  async function loadProductStockMovements(
    productId
  ) {
    const target =
      String(
        productId ||
        ""
      ).trim();

    if (
      !target
    ) {
      return [];
    }

    if (
      productStockMovementsCache.has(
        target
      )
    ) {
      return (
        productStockMovementsCache.get(
          target
        ) || []
      );
    }

    if (
      productStockMovementsPending.has(
        target
      )
    ) {
      return productStockMovementsPending.get(
        target
      );
    }

    const promise =
      (async () => {
        try {
          const movementDocuments =
            getSessionCollection(
              MOVEMENTS_COLLECTION
            );

          const movements =
            [];

          movementDocuments.forEach(
            ({
              id,
              data
            }) => {
              if (
                !matchesCurrentLocal(
                  data
                )
              ) {
                return;
              }

              const movementProductId =
                String(
                  data.productId ||
                  data.productID ||
                  data.product_id ||
                  ""
                ).trim();

              if (
                movementProductId !==
                target
              ) {
                return;
              }

              const movement =
                normalizeMovementDocument(
                  id,
                  data
                );

              const product =
                findProductById(
                  target
                );

              movement.productCurrentName =
                product?.name ||
                movement.productName ||
                "Producto";

              movement.productCurrentProvider =
                getProductProviderName(
                  product
                );

              movement.productCurrentProviderReason =
                getProductProviderReason(
                  product
                );

              movement.productCurrentStock =
                product
                  ? getCurrentStockUnits(
                    product
                  )
                  : movement.saldoActual;

              movement.productCurrentPrice =
                product
                  ? numberOrZero(
                    product.price
                  )
                  : movement.precioVenta;

              movement.productCurrentCostPerBox =
                product
                  ? numberOrZero(
                    product.lastCostPerBox
                  )
                  : movement.costoPorCaja;

              movements.push(
                movement
              );
            }
          );

          movements.sort(
            (
              a,
              b
            ) =>
              getMovementOperationDateValue(
                b
              ).localeCompare(
                getMovementOperationDateValue(
                  a
                )
              ) ||
              numberOrZero(
                b.createdAtMs
              ) -
              numberOrZero(
                a.createdAtMs
              )
          );

          productStockMovementsCache.set(
            target,
            movements
          );

          return movements;
        } catch (
          error
        ) {
          console.error(
            "Error leyendo movimientos desde la caché:",
            error
          );

          return [];
        }
      })();

    productStockMovementsPending.set(
      target,
      promise
    );

    try {
      return await promise;
    } finally {
      productStockMovementsPending.delete(
        target
      );
    }
  }

  async function loadAllEntryMovements() {
    const movementDocuments =
      getSessionCollection(
        MOVEMENTS_COLLECTION
      );

    const movements =
      [];

    movementDocuments.forEach(
      ({
        id,
        data
      }) => {
        if (
          !matchesCurrentLocal(
            data
          )
        ) {
          return;
        }

        const movement =
          normalizeMovementDocument(
            id,
            data
          );

        if (
          movement.tipoMovimiento !==
          "entrada"
        ) {
          return;
        }

        if (
          !movement.productId
        ) {
          return;
        }

        const product =
          findProductById(
            movement.productId
          );

        movement.productCurrentName =
          product?.name ||
          movement.productName ||
          "Producto";

        movement.productCurrentProvider =
          getProductProviderName(
            product
          );

        movement.productCurrentProviderReason =
          getProductProviderReason(
            product
          );

        movement.productCurrentStock =
          product
            ? getCurrentStockUnits(
              product
            )
            : movement.saldoActual;

        movement.productCurrentPrice =
          product
            ? numberOrZero(
              product.price
            )
            : movement.precioVenta;

        movement.productCurrentCostPerBox =
          product
            ? numberOrZero(
              product.lastCostPerBox
            )
            : movement.costoPorCaja;

        movements.push(
          movement
        );
      }
    );

    movements.sort(
      (
        a,
        b
      ) =>
        getMovementOperationDateValue(
          b
        ).localeCompare(
          getMovementOperationDateValue(
            a
          )
        ) ||
        b.createdAtMs -
        a.createdAtMs
    );

    return movements;
  }

  /*
   * ============================================================
   * MOVIMIENTO
   * ============================================================
   */

  function buildMovementData({
    productId,
    productName,
    codigoProducto,
    tipoMovimiento,
    referenciaLibro,
    numeroDocumento,
    entrada,
    salida,
    saldoAnterior,
    saldoActual,

    cajas = 0,
    cajasBono = 0,
    unidades = 0,
    unidadesBono = 0,
    unidadesPorCaja = 1,

    costoUnitario = 0,
    costoPorCaja = 0,
    precioVenta = 0,

    costoTotal,
    entradaPagada,
    entradaBono,

    proveedorId = "",
    proveedorNombre = "",
    proveedorRazonSocial = "",

    detalle,
    user,
    operationDate,
    expenseId = ""
  }) {
    const context =
      currentUserInventoryContext ||
      {};

    const validOperationDate =
      operationDate instanceof Date
        ? operationDate
        : parseOperationDate(
          operationDate
        );

    const normalizedUnitsPerBox =
      Math.max(
        1,
        integerOrZero(
          unidadesPorCaja
        ) || 1
      );

    const normalizedBoxes =
      integerOrZero(
        cajas
      );

    const normalizedBonusBoxes =
      integerOrZero(
        cajasBono
      );

    const normalizedUnits =
      integerOrZero(
        unidades
      );

    const normalizedBonusUnits =
      integerOrZero(
        unidadesBono
      );

    const calculatedPaidUnits =
      normalizedBoxes *
      normalizedUnitsPerBox +
      normalizedUnits;

    const calculatedBonusUnits =
      normalizedBonusBoxes *
      normalizedUnitsPerBox +
      normalizedBonusUnits;

    const normalizedPaidUnits =
      entradaPagada !==
        undefined &&
        entradaPagada !==
        null
        ? integerOrZero(
          entradaPagada
        )
        : calculatedPaidUnits;

    const normalizedBonusUnitsTotal =
      entradaBono !==
        undefined &&
        entradaBono !==
        null
        ? integerOrZero(
          entradaBono
        )
        : calculatedBonusUnits;

    const normalizedEntry =
      entrada !==
        undefined &&
        entrada !==
        null
        ? numberOrZero(
          entrada
        )
        : normalizedPaidUnits +
        normalizedBonusUnitsTotal;

    let normalizedCostUnit =
      Math.max(
        0,
        numberOrZero(
          costoUnitario
        )
      );

    let normalizedCostBox =
      Math.max(
        0,
        numberOrZero(
          costoPorCaja
        )
      );

    if (
      normalizedCostBox >
      0
    ) {
      normalizedCostUnit =
        normalizedCostBox /
        normalizedUnitsPerBox;

      normalizedCostBox =
        normalizedCostUnit *
        normalizedUnitsPerBox;
    } else {
      normalizedCostBox =
        normalizedCostUnit *
        normalizedUnitsPerBox;
    }

    const normalizedSalePrice =
      Math.max(
        0,
        numberOrZero(
          precioVenta
        )
      );

    const normalizedCostTotal =
      costoTotal !==
        undefined &&
        costoTotal !==
        null
        ? Math.max(
          0,
          numberOrZero(
            costoTotal
          )
        )
        : Math.max(
          0,
          normalizedPaidUnits *
          normalizedCostUnit
        );

    return {
      productId,

      productName:
        productName ||
        "",

      codigoProducto:
        codigoProducto ||
        "",

      productCode:
        codigoProducto ||
        "",

      tipoMovimiento:
        tipoMovimiento ||
        "entrada",

      referenciaLibro:
        referenciaLibro ||
        "",

      referenceBook:
        referenciaLibro ||
        "",

      bookReference:
        referenciaLibro ||
        "",

      numeroDocumento:
        numeroDocumento ||
        "",

      entrada:
        normalizedEntry,

      salida:
        numberOrZero(
          salida
        ),

      saldoAnterior:
        numberOrZero(
          saldoAnterior
        ),

      saldoActual:
        numberOrZero(
          saldoActual
        ),

      cajas:
        normalizedBoxes,

      boxes:
        normalizedBoxes,

      cajasBono:
        normalizedBonusBoxes,

      bonusBoxes:
        normalizedBonusBoxes,

      unidades:
        normalizedUnits,

      units:
        normalizedUnits,

      unidadesBono:
        normalizedBonusUnits,

      bonusUnits:
        normalizedBonusUnits,

      unidadesPorCaja:
        normalizedUnitsPerBox,

      unitsPerBox:
        normalizedUnitsPerBox,

      entradaPagada:
        normalizedPaidUnits,

      entradaBono:
        normalizedBonusUnitsTotal,

      costoUnitario:
        normalizedCostUnit,

      unitCost:
        normalizedCostUnit,

      costoPorUnidad:
        normalizedCostUnit,

      costoPorCaja:
        normalizedCostBox,

      lastCostPerBox:
        normalizedCostBox,

      precioVenta:
        normalizedSalePrice,

      price:
        normalizedSalePrice,

      costoTotal:
        normalizedCostTotal,

      /*
       * PROVEEDOR ESPECÍFICO DEL MOVIMIENTO
       */
      proveedorId:
        String(
          proveedorId ||
          ""
        ).trim(),

      proveedorNombre:
        String(
          proveedorNombre ||
          ""
        ).trim(),

      proveedorRazonSocial:
        String(
          proveedorRazonSocial ||
          ""
        ).trim(),

      /*
       * Alias para compatibilidad.
       */
      providerId:
        String(
          proveedorId ||
          ""
        ).trim(),

      providerName:
        String(
          proveedorNombre ||
          ""
        ).trim(),

      providerBusinessName:
        String(
          proveedorRazonSocial ||
          ""
        ).trim(),

      expenseId:
        String(
          expenseId ||
          ""
        ).trim(),

      detalle:
        detalle ||
        "",

      fechaOperacion:
        validOperationDate
          ? getLocalDateInputValue(
            validOperationDate
          )
          : "",

      id_local:
        currentLocalId ||
        null,

      localNombre:
        currentLocalInfo.nombre ||
        "",

      localNumeroDocumento:
        currentLocalInfo.numeroDocumento ||
        "",

      localUbicacion:
        currentLocalInfo.ubicacion ||
        "",

      localContribuyente:
        currentLocalInfo.contribuyente ||
        "",

      localTipoDocumento:
        currentLocalInfo.tipoDocumento ||
        "",

      localNIT:
        currentLocalInfo.nit ||
        "",

      localNRC:
        currentLocalInfo.nrc ||
        "",

      userId:
        user
          ? user.uid
          : null,

      userName:
        context.name ||
        user?.email ||
        ""
    };
  }

  /*
   * ============================================================
   * CREAR PRODUCTO NUEVO
   * ============================================================
   */

  async function createNewProductFromLine(
    line,
    user,
    operationDate
  ) {
    const paidBoxes =
      integerOrZero(
        line.boxes
      );

    const bonusBoxes =
      integerOrZero(
        line.bonusBoxes
      );

    const paidUnits =
      integerOrZero(
        line.units
      );

    const bonusUnits =
      integerOrZero(
        line.bonusUnits
      );

    const unitsPerBox =
      Math.max(
        1,
        integerOrZero(
          line.unitsPerBox
        ) || 1
      );

    const totalPaidUnits =
      paidBoxes *
      unitsPerBox +
      paidUnits;

    const totalBonusUnits =
      bonusBoxes *
      unitsPerBox +
      bonusUnits;

    const totalUnits =
      totalPaidUnits +
      totalBonusUnits;

    if (
      totalUnits <=
      0
    ) {
      throw new Error(
        `El producto "${line.name}" no tiene cantidad de inventario.`
      );
    }

    const validOperationDate =
      operationDate instanceof Date
        ? operationDate
        : parseOperationDate(
          operationDate
        );

    if (
      !validOperationDate
    ) {
      throw new Error(
        `La fecha de operación no es válida para el producto "${line.name}".`
      );
    }

    const operationTimestamp =
      buildOperationTimestamp(
        validOperationDate
      );

    const productRef =
      db
        .collection(
          PRODUCTS_COLLECTION
        )
        .doc();

    const costPerUnit =
      getEffectiveCostPerUnitForLine(
        line,
        {
          ...line,
          unitsPerBox
        }
      );

    const lastCostPerBox =
      costPerUnit *
      unitsPerBox;

    const totalPurchaseCost =
      totalPaidUnits *
      costPerUnit;

    const price =
      Math.max(
        0,
        numberOrZero(
          line.price
        )
      );

    const productData = {
      name:
        line.name,

      codigoProducto:
        line.codigoProducto ||
        "",

      productCode:
        line.codigoProducto ||
        "",

      proveedorId:
        line.proveedorId ||
        null,

      proveedorNombre:
        line.proveedorNombre ||
        "",

      proveedorRazonSocial:
        line.proveedorRazonSocial ||
        "",

      quantity:
        totalUnits,

      stockCurrentUnits:
        totalUnits,

      stockBaseUnits:
        totalUnits,

      boxes:
        Math.floor(
          totalUnits /
          unitsPerBox
        ),

      unitsPerBox,

      lastCostPerBox,

      lastCostPerUnit:
        costPerUnit,

      price,

      id_local:
        currentLocalId,

      localNombre:
        currentLocalInfo.nombre ||
        "",

      localNumeroDocumento:
        currentLocalInfo.numeroDocumento ||
        "",

      localUbicacion:
        currentLocalInfo.ubicacion ||
        "",

      localContribuyente:
        currentLocalInfo.contribuyente ||
        "",

      localTipoDocumento:
        currentLocalInfo.tipoDocumento ||
        "",

      localNIT:
        currentLocalInfo.nit ||
        "",

      localNRC:
        currentLocalInfo.nrc ||
        "",

      referenciaLibro:
        line.referenciaLibro ||
        "Inventario inicial",

      referenceBook:
        line.referenciaLibro ||
        "Inventario inicial",

      numeroDocumento:
        line.numeroDocumento ||
        "",

      fechaOperacion:
        getLocalDateInputValue(
          validOperationDate
        )
    };

    const movementRef =
      db
        .collection(
          MOVEMENTS_COLLECTION
        )
        .doc();

    const movementData =
      buildMovementData({
        productId:
          productRef.id,

        productName:
          line.name,

        codigoProducto:
          line.codigoProducto,

        tipoMovimiento:
          "entrada",

        referenciaLibro:
          line.referenciaLibro ||
          "Inventario inicial",

        numeroDocumento:
          line.numeroDocumento ||
          productRef.id,

        entrada:
          totalUnits,

        salida:
          0,

        saldoAnterior:
          0,

        saldoActual:
          totalUnits,

        cajas:
          paidBoxes,

        cajasBono:
          bonusBoxes,

        unidades:
          paidUnits,

        unidadesBono:
          bonusUnits,

        unidadesPorCaja:
          unitsPerBox,

        costoUnitario:
          costPerUnit,

        costoPorCaja:
          lastCostPerBox,

        precioVenta:
          price,

        costoTotal:
          totalPurchaseCost,

        entradaPagada:
          totalPaidUnits,

        entradaBono:
          totalBonusUnits,

        proveedorId:
          line.proveedorId,

        proveedorNombre:
          line.proveedorNombre,

        proveedorRazonSocial:
          line.proveedorRazonSocial,

        detalle:
          [
            `Cajas: ${paidBoxes}`,
            `Cajas bono: ${bonusBoxes}`,
            `Unidades: ${paidUnits}`,
            `Unidades bono: ${bonusUnits}`,
            `Entrada pagada: ${totalPaidUnits}`,
            `Entrada bono: ${totalBonusUnits}`,
            `Unidades por caja: ${unitsPerBox}`,
            `Costo por unidad: ${currency(
              costPerUnit
            )}`,
            `Costo por caja: ${currency(
              lastCostPerBox
            )}`,
            `Precio de venta: ${currency(
              price
            )}`,
            `Costo total: ${currency(
              totalPurchaseCost
            )}`,
            line.proveedorNombre
              ? `Proveedor: ${line.proveedorNombre}`
              : "",
            line.proveedorRazonSocial
              ? `Razón Social: ${line.proveedorRazonSocial}`
              : "",
            `Fecha de operación: ${formatOperationDate(
              validOperationDate
            )}`
          ]
            .filter(
              Boolean
            )
            .join(
              " | "
            ),

        user,

        operationDate:
          validOperationDate
      });

    const batch =
      db.batch();

    batch.set(
      productRef,
      {
        ...productData,

        createdAt:
          operationTimestamp,

        updatedAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp()
      }
    );

    batch.set(
      movementRef,
      {
        ...movementData,

        createdAt:
          operationTimestamp
      }
    );

    await batch.commit();

    upsertSessionDocument(
      PRODUCTS_COLLECTION,
      productRef.id,
      {
        ...productData,

        createdAt:
          operationTimestamp.toMillis(),

        updatedAt:
          Date.now()
      }
    );

    upsertSessionDocument(
      MOVEMENTS_COLLECTION,
      movementRef.id,
      {
        ...movementData,

        createdAt:
          operationTimestamp.toMillis()
      }
    );

    currentProductsList.push({
      id:
        productRef.id,

      ...productData,

      createdAt:
        operationTimestamp.toMillis(),

      updatedAt:
        Date.now()
    });

    invalidateAllMovementsCache();

    return {
      type:
        "new",

      productId:
        productRef.id,

      totalUnits,

      movementId:
        movementRef.id,

      movementCostTotal:
        totalPurchaseCost
    };
  }

  /*
   * ============================================================
   * AGREGAR STOCK A PRODUCTO EXISTENTE
   * ============================================================
   */

  async function addStockToExistingProduct(
    product,
    line,
    user,
    operationDate
  ) {
    const unitsPerBox =
      Math.max(
        1,
        integerOrZero(
          line.unitsPerBox
        ) ||
        getUnitsPerBox(
          product
        )
      );

    const paidBoxes =
      integerOrZero(
        line.boxes
      );

    const bonusBoxes =
      integerOrZero(
        line.bonusBoxes
      );

    const paidUnits =
      integerOrZero(
        line.units
      );

    const bonusUnits =
      integerOrZero(
        line.bonusUnits
      );

    const totalPaidUnits =
      paidBoxes *
      unitsPerBox +
      paidUnits;

    const totalBonusUnits =
      bonusBoxes *
      unitsPerBox +
      bonusUnits;

    const totalUnits =
      totalPaidUnits +
      totalBonusUnits;

    if (
      totalUnits <=
      0
    ) {
      throw new Error(
        `El producto "${product.name}" no tiene cantidad de entrada.`
      );
    }

    const validOperationDate =
      operationDate instanceof Date
        ? operationDate
        : parseOperationDate(
          operationDate
        );

    if (
      !validOperationDate
    ) {
      throw new Error(
        `La fecha de operación no es válida para el producto "${product.name}".`
      );
    }

    const operationTimestamp =
      buildOperationTimestamp(
        validOperationDate
      );

    const productRef =
      db
        .collection(
          PRODUCTS_COLLECTION
        )
        .doc(
          product.id
        );

    let previousStock =
      0;

    let nextStock =
      0;

    let nextCostPerBox =
      0;

    let nextCostPerUnit =
      0;

    let nextPrice =
      0;

    let nextProviderId =
      null;

    let nextProviderName =
      "";

    let nextProviderRazonSocial =
      "";

    let movementData =
      null;

    const transactionResult =
      await db.runTransaction(
        async transaction => {
          const snap =
            await transaction.get(
              productRef
            );

          if (
            !snap.exists
          ) {
            throw new Error(
              `El producto "${product.name}" ya no existe.`
            );
          }

          const data =
            snap.data() ||
            {};

          if (
            !matchesCurrentLocal(
              data
            )
          ) {
            throw new Error(
              `El producto "${product.name}" no pertenece al local actual.`
            );
          }

          previousStock =
            getCurrentStockUnits(
              data
            );

          nextStock =
            previousStock +
            totalUnits;

          const inputCostPerBox =
            numberOrZero(
              line.lastCostPerBox
            );

          const inputCostPerUnit =
            numberOrZero(
              line.lastCostPerUnit
            );

          if (
            inputCostPerBox >
            0
          ) {
            nextCostPerBox =
              inputCostPerBox;

            nextCostPerUnit =
              nextCostPerBox /
              unitsPerBox;
          } else if (
            inputCostPerUnit >
            0
          ) {
            nextCostPerUnit =
              inputCostPerUnit;

            nextCostPerBox =
              nextCostPerUnit *
              unitsPerBox;
          } else {
            nextCostPerBox =
              numberOrZero(
                data.lastCostPerBox
              );

            if (
              nextCostPerBox >
              0
            ) {
              nextCostPerUnit =
                nextCostPerBox /
                unitsPerBox;
            } else {
              nextCostPerUnit =
                numberOrZero(
                  data.lastCostPerUnit
                );

              nextCostPerBox =
                nextCostPerUnit *
                unitsPerBox;
            }
          }

          const normalizedPrice =
            numberOrZero(
              line.price
            );

          nextPrice =
            normalizedPrice > 0
              ? normalizedPrice
              : numberOrZero(
                data.price
              );

          /*
           * Proveedor del producto:
           *
           * Cuando se registra una nueva entrada, la selección
           * del formulario puede actualizar también el proveedor
           * general del producto.
           */
          if (
            line.proveedorId
          ) {
            nextProviderId =
              line.proveedorId;

            nextProviderName =
              line.proveedorNombre ||
              "";

            nextProviderRazonSocial =
              line.proveedorRazonSocial ||
              "";
          } else {
            nextProviderId =
              data.proveedorId ||
              null;

            nextProviderName =
              String(
                data.proveedorNombre ||
                ""
              ).trim();

            nextProviderRazonSocial =
              String(
                data.proveedorRazonSocial ||
                data.proveedorRazonSocialDenominacion ||
                ""
              ).trim();
          }

          const totalPurchaseCost =
            totalPaidUnits *
            nextCostPerUnit;

          const movementRef =
            db
              .collection(
                MOVEMENTS_COLLECTION
              )
              .doc();

          movementData =
            buildMovementData({
              productId:
                product.id,

              productName:
                line.name ||
                data.name ||
                "",

              codigoProducto:
                line.codigoProducto ||
                getProductCode(
                  data
                ) ||
                "",

              tipoMovimiento:
                "entrada",

              referenciaLibro:
                line.referenciaLibro ||
                "Compra",

              numeroDocumento:
                line.numeroDocumento ||
                "",

              entrada:
                totalUnits,

              salida:
                0,

              saldoAnterior:
                previousStock,

              saldoActual:
                nextStock,

              cajas:
                paidBoxes,

              cajasBono:
                bonusBoxes,

              unidades:
                paidUnits,

              unidadesBono:
                bonusUnits,

              unidadesPorCaja:
                unitsPerBox,

              costoUnitario:
                nextCostPerUnit,

              costoPorCaja:
                nextCostPerBox,

              precioVenta:
                nextPrice,

              costoTotal:
                totalPurchaseCost,

              entradaPagada:
                totalPaidUnits,

              entradaBono:
                totalBonusUnits,

              proveedorId:
                nextProviderId,

              proveedorNombre:
                nextProviderName,

              proveedorRazonSocial:
                nextProviderRazonSocial,

              detalle:
                [
                  `Cajas: ${paidBoxes}`,
                  `Cajas bono: ${bonusBoxes}`,
                  `Unidades: ${paidUnits}`,
                  `Unidades bono: ${bonusUnits}`,
                  `Entrada pagada: ${totalPaidUnits}`,
                  `Entrada bono: ${totalBonusUnits}`,
                  `Unidades por caja: ${unitsPerBox}`,
                  `Costo por unidad: ${currency(
                    nextCostPerUnit
                  )}`,
                  `Costo por caja: ${currency(
                    nextCostPerBox
                  )}`,
                  `Precio de venta: ${currency(
                    nextPrice
                  )}`,
                  `Costo total: ${currency(
                    totalPurchaseCost
                  )}`,
                  nextProviderName
                    ? `Proveedor: ${nextProviderName}`
                    : "",
                  nextProviderRazonSocial
                    ? `Razón Social: ${nextProviderRazonSocial}`
                    : "",
                  `Fecha de operación: ${formatOperationDate(
                    validOperationDate
                  )}`
                ]
                  .filter(
                    Boolean
                  )
                  .join(
                    " | "
                  ),

              user,

              operationDate:
                validOperationDate
            });

          transaction.update(
            productRef,
            {
              codigoProducto:
                line.codigoProducto ||
                getProductCode(
                  data
                ) ||
                "",

              productCode:
                line.codigoProducto ||
                getProductCode(
                  data
                ) ||
                "",

              proveedorId:
                nextProviderId,

              proveedorNombre:
                nextProviderName,

              proveedorRazonSocial:
                nextProviderRazonSocial,

              quantity:
                nextStock,

              stockCurrentUnits:
                nextStock,

              stockBaseUnits:
                numberOrZero(
                  data.stockBaseUnits
                ) ||
                previousStock,

              boxes:
                Math.floor(
                  nextStock /
                  unitsPerBox
                ),

              unitsPerBox,

              lastCostPerBox:
                nextCostPerBox,

              lastCostPerUnit:
                nextCostPerUnit,

              price:
                nextPrice,

              referenciaLibro:
                line.referenciaLibro ||
                data.referenciaLibro ||
                "",

              referenceBook:
                line.referenciaLibro ||
                data.referenceBook ||
                data.referenciaLibro ||
                "",

              numeroDocumento:
                line.numeroDocumento ||
                data.numeroDocumento ||
                "",

              fechaUltimaEntrada:
                getLocalDateInputValue(
                  validOperationDate
                ),

              updatedAt:
                firebase.firestore
                  .FieldValue
                  .serverTimestamp()
            }
          );

          transaction.set(
            movementRef,
            {
              ...movementData,

              createdAt:
                operationTimestamp
            }
          );

          return {
            movementId:
              movementRef.id,

            movementCostTotal:
              totalPurchaseCost
          };
        }
      );

    const localProduct =
      findProductById(
        product.id
      );

    const updatedProductData = {
      ...(localProduct ||
        product),

      codigoProducto:
        line.codigoProducto ||
        getProductCode(
          localProduct ||
          product
        ) ||
        "",

      productCode:
        line.codigoProducto ||
        getProductCode(
          localProduct ||
          product
        ) ||
        "",

      proveedorId:
        nextProviderId,

      proveedorNombre:
        nextProviderName,

      proveedorRazonSocial:
        nextProviderRazonSocial,

      quantity:
        nextStock,

      stockCurrentUnits:
        nextStock,

      stockBaseUnits:
        numberOrZero(
          localProduct?.stockBaseUnits ||
          product.stockBaseUnits
        ) ||
        previousStock,

      boxes:
        Math.floor(
          nextStock /
          unitsPerBox
        ),

      unitsPerBox,

      lastCostPerBox:
        nextCostPerBox,

      lastCostPerUnit:
        nextCostPerUnit,

      price:
        nextPrice,

      referenciaLibro:
        line.referenciaLibro ||
        localProduct?.referenciaLibro ||
        product.referenciaLibro ||
        "",

      referenceBook:
        line.referenciaLibro ||
        localProduct?.referenceBook ||
        product.referenceBook ||
        "",

      numeroDocumento:
        line.numeroDocumento ||
        localProduct?.numeroDocumento ||
        product.numeroDocumento ||
        "",

      fechaUltimaEntrada:
        getLocalDateInputValue(
          validOperationDate
        ),

      id_local:
        currentLocalId,

      localNombre:
        currentLocalInfo.nombre,

      localNumeroDocumento:
        currentLocalInfo.numeroDocumento,

      localUbicacion:
        currentLocalInfo.ubicacion,

      localContribuyente:
        currentLocalInfo.contribuyente,

      localTipoDocumento:
        currentLocalInfo.tipoDocumento,

      localNIT:
        currentLocalInfo.nit,

      localNRC:
        currentLocalInfo.nrc,

      updatedAt:
        Date.now()
    };

    upsertSessionDocument(
      PRODUCTS_COLLECTION,
      product.id,
      updatedProductData
    );

    if (
      localProduct
    ) {
      Object.assign(
        localProduct,
        updatedProductData
      );
    }

    const movementId =
      transactionResult
        ?.movementId ||
      "";

    if (
      movementId &&
      movementData
    ) {
      upsertSessionDocument(
        MOVEMENTS_COLLECTION,
        movementId,
        {
          ...movementData,

          createdAt:
            operationTimestamp.toMillis()
        }
      );
    }

    invalidateProductStockMovementsCache(
      product.id
    );

    return {
      type:
        "existing",

      productId:
        product.id,

      totalUnits,

      previousStock,

      nextStock,

      movementId,

      movementCostTotal:
        transactionResult
          ?.movementCostTotal ||
        0
    };
  }

  /*
   * ============================================================
   * COMBOBOX / LÍNEAS DE CARGA
   * ============================================================
   */

  function buildBatchLineHtml(
    line
  ) {
    const isExisting =
      line.mode ===
      "existing";

    const lineElement =
      document.createElement(
        "div"
      );

    lineElement.className =
      "batch-product-row";

    lineElement.dataset.lineId =
      line.id;

    const providerValue =
      line.proveedorId
        ? getProviderDisplayName(
          getProviderById(
            line.proveedorId
          )
        ) ||
        line.proveedorNombre
        : line.proveedorNombre;

    lineElement.innerHTML = `
      <div class="batch-row-header">

        <div>
          <strong>
            Producto ${batchLineCounter}
          </strong>

          <span
            class="batch-row-total"
            data-role="total"
          >
            0 unidades
          </span>
        </div>

        <button
          type="button"
          class="btn-outline batch-remove-row"
          data-action="remove"
        >
          <i class="fas fa-times"></i>
          Quitar
        </button>

      </div>

      <div class="batch-grid">

        <div class="inv-field">
          <label>
            Tipo
          </label>

          <select
            class="batch-mode"
          >
            <option
              value="existing"
              ${isExisting
        ? "selected"
        : ""
      }
            >
              Existente
            </option>

            <option
              value="new"
              ${!isExisting
        ? "selected"
        : ""
      }
            >
              Nuevo
            </option>
          </select>
        </div>

        <div class="inv-field batch-product-field">
          <label>
            Producto
          </label>

          <div class="batch-product-combobox">
            ${buildProductCombobox(
        line.id,
        line.productText
      )}
          </div>

          <div
            class="batch-product-status"
            data-role="product-status"
          ></div>
        </div>

        <div class="inv-field">
          <label>
            Código
          </label>

          <input
            type="text"
            class="batch-code"
            value="${escapeHtml(
        line.codigoProducto
      )}"
            placeholder="Código"
          >
        </div>

        <div class="inv-field">
          <label>
            Proveedor
          </label>

          ${getProviderComboboxHtml(
        `batch-provider-${line.id}`,
        `batch-provider-list-${line.id}`,
        providerValue
      )}

          <small>
            Busca por nombre o razón social.
          </small>
        </div>

        <div class="inv-field">
          <label>
            Cajas
          </label>

          <input
            type="number"
            class="batch-boxes"
            min="0"
            step="1"
            value="${line.boxes}"
          >
        </div>

        <div class="inv-field bonus-field">
          <label>
            Cajas bono
          </label>

          <input
            type="number"
            class="batch-bonus-boxes"
            min="0"
            step="1"
            value="${line.bonusBoxes}"
          >
        </div>

        <div class="inv-field">
          <label>
            Unidades
          </label>

          <input
            type="number"
            class="batch-units"
            min="0"
            step="1"
            value="${line.units}"
          >
        </div>

        <div class="inv-field bonus-field">
          <label>
            Unidades bono
          </label>

          <input
            type="number"
            class="batch-bonus-units"
            min="0"
            step="1"
            value="${line.bonusUnits}"
          >
        </div>

        <div class="inv-field">
          <label>
            Unidades por caja
          </label>

          <input
            type="number"
            class="batch-units-per-box"
            min="1"
            step="1"
            value="${line.unitsPerBox}"
          >

          <small>
            Editable también para productos existentes.
          </small>
        </div>

        <div class="inv-field">
          <label>
            Costo por caja
          </label>

          <input
            type="number"
            class="batch-cost-box"
            min="0"
            step="0.01"
            value="${line.lastCostPerBox}"
          >
        </div>

        <div class="inv-field">
          <label>
            Costo por unidad
          </label>

          <input
            type="text"
            class="batch-cost-unit"
            value="${line.lastCostPerUnit.toFixed(
        4
      )}"
            readonly
          >
        </div>

        <div class="inv-field">
          <label>
            Precio
          </label>

          <input
            type="number"
            class="batch-price"
            min="0"
            step="0.01"
            value="${line.price}"
          >
        </div>

        <div class="inv-field">
          <label>
            Referencia libro
          </label>

          <input
            type="text"
            class="batch-reference"
            value="${escapeHtml(
        line.referenciaLibro
      )}"
            placeholder="Compra / Inventario"
          >
        </div>

        <div class="inv-field">
          <label>
            Documento
          </label>

          <input
            type="text"
            class="batch-document"
            value="${escapeHtml(
        line.numeroDocumento
      )}"
            placeholder="Factura / documento"
          >
        </div>

      </div>

      <div class="batch-row-summary">

        <span>
          Stock agregado:
          <strong data-role="total">
            0
          </strong>
          unidades
        </span>

        <span>
          Cajas totales:
          <strong data-role="total-boxes">
            0
          </strong>
        </span>

        <span>
          Normales:
          <strong data-role="normal-units">
            0
          </strong>
        </span>

        <span>
          Bonificadas:
          <strong data-role="bonus-units">
            0
          </strong>
        </span>

      </div>
    `;

    bindBatchLineEvents(
      lineElement
    );

    updateBatchLineState(
      lineElement
    );

    return lineElement;
  }

  function readBatchLine(
    row
  ) {
    const mode =
      String(
        row.querySelector(
          ".batch-mode"
        )?.value ||
        ""
      ).trim();

    const productText =
      String(
        row.querySelector(
          ".batch-product-input"
        )?.value ||
        ""
      ).trim();

    const code =
      String(
        row.querySelector(
          ".batch-code"
        )?.value ||
        ""
      ).trim();

    const providerElement =
      row.querySelector(
        ".batch-provider"
      );

    const providerValue =
      String(
        providerElement?.value ||
        ""
      ).trim();

    const provider =
      resolveProviderSelection(
        providerValue
      );

    const boxes =
      integerOrZero(
        row.querySelector(
          ".batch-boxes"
        )?.value
      );

    const bonusBoxes =
      integerOrZero(
        row.querySelector(
          ".batch-bonus-boxes"
        )?.value
      );

    const units =
      integerOrZero(
        row.querySelector(
          ".batch-units"
        )?.value
      );

    const bonusUnits =
      integerOrZero(
        row.querySelector(
          ".batch-bonus-units"
        )?.value
      );

    const unitsPerBox =
      Math.max(
        1,
        integerOrZero(
          row.querySelector(
            ".batch-units-per-box"
          )?.value
        ) || 1
      );

    const lastCostPerBox =
      Math.max(
        0,
        numberOrZero(
          row.querySelector(
            ".batch-cost-box"
          )?.value
        )
      );

    const lastCostPerUnit =
      unitsPerBox > 0
        ? lastCostPerBox /
        unitsPerBox
        : 0;

    const price =
      Math.max(
        0,
        numberOrZero(
          row.querySelector(
            ".batch-price"
          )?.value
        )
      );

    const referenciaLibro =
      String(
        row.querySelector(
          ".batch-reference"
        )?.value ||
        ""
      ).trim();

    const numeroDocumento =
      String(
        row.querySelector(
          ".batch-document"
        )?.value ||
        ""
      ).trim();

    const matchedProduct =
      findProductByText(
        productText
      );

    return {
      id:
        row.dataset.lineId ||
        "",

      mode,

      productText,

      product:
        matchedProduct,

      name:
        mode ===
          "new"
          ? productText
          : (
            matchedProduct?.name ||
            productText
          ),

      codigoProducto:
        code ||
        getProductCode(
          matchedProduct
        ) ||
        "",

      proveedorId:
        provider
          ? String(
            provider.id
          ).trim()
          : "",

      proveedorNombre:
        provider
          ? getProviderName(
            provider
          )
          : "",

      proveedorRazonSocial:
        provider
          ? getProviderBusinessName(
            provider
          )
          : "",

      boxes,

      bonusBoxes,

      units,

      bonusUnits,

      unitsPerBox,

      lastCostPerBox,

      lastCostPerUnit,

      price,

      referenciaLibro,

      numeroDocumento
    };
  }

  function updateBatchLineState(
    row
  ) {
    const data =
      readBatchLine(
        row
      );

    const mode =
      data.mode;

    const product =
      data.product;

    const codeInput =
      row.querySelector(
        ".batch-code"
      );

    const unitsPerBoxInput =
      row.querySelector(
        ".batch-units-per-box"
      );

    const costBoxInput =
      row.querySelector(
        ".batch-cost-box"
      );

    const costUnitInput =
      row.querySelector(
        ".batch-cost-unit"
      );

    const priceInput =
      row.querySelector(
        ".batch-price"
      );

    const providerInput =
      row.querySelector(
        ".batch-provider"
      );

    const status =
      row.querySelector(
        '[data-role="product-status"]'
      );

    const totalElement =
      row.querySelector(
        '[data-role="total"]'
      );

    const totalBoxesElement =
      row.querySelector(
        '[data-role="total-boxes"]'
      );

    const normalUnitsElement =
      row.querySelector(
        '[data-role="normal-units"]'
      );

    const bonusUnitsElement =
      row.querySelector(
        '[data-role="bonus-units"]'
      );

    const totalNormal =
      data.boxes *
      data.unitsPerBox +
      data.units;

    const totalBonus =
      data.bonusBoxes *
      data.unitsPerBox +
      data.bonusUnits;

    const totalUnits =
      totalNormal +
      totalBonus;

    const totalBoxes =
      data.boxes +
      data.bonusBoxes;

    const calculatedCostPerUnit =
      data.unitsPerBox > 0
        ? data.lastCostPerBox /
        data.unitsPerBox
        : 0;

    if (
      costUnitInput
    ) {
      costUnitInput.value =
        calculatedCostPerUnit.toFixed(
          4
        );
    }

    if (
      totalElement
    ) {
      totalElement.textContent =
        String(
          totalUnits
        );
    }

    if (
      totalBoxesElement
    ) {
      totalBoxesElement.textContent =
        String(
          totalBoxes
        );
    }

    if (
      normalUnitsElement
    ) {
      normalUnitsElement.textContent =
        String(
          totalNormal
        );
    }

    if (
      bonusUnitsElement
    ) {
      bonusUnitsElement.textContent =
        String(
          totalBonus
        );
    }

    if (
      mode ===
      "existing"
    ) {
      if (
        product
      ) {
        const productUnitsPerBox =
          getUnitsPerBox(
            product
          );

        const enteredUnitsPerBox =
          Math.max(
            1,
            integerOrZero(
              unitsPerBoxInput?.value
            ) ||
            productUnitsPerBox
          );

        if (
          unitsPerBoxInput &&
          !String(
            unitsPerBoxInput.value ||
            ""
          ).trim()
        ) {
          unitsPerBoxInput.value =
            String(
              productUnitsPerBox
            );
        }

        const unitsPerBoxChanged =
          enteredUnitsPerBox !==
          productUnitsPerBox;

        if (
          status
        ) {
          status.innerHTML = `
            <span class="batch-status success">
              Producto encontrado:
              ${escapeHtml(
            product.name
          )}
              · Stock actual:
              ${getCurrentStockUnits(
            product
          )}
              ·
              ${enteredUnitsPerBox}
              unid./caja

              ${unitsPerBoxChanged
              ? `
                    <br>
                    <span
                      style="
                        color:#9a3412;
                        font-weight:700;
                      "
                    >
                      Se actualizará el empaque:
                      ${productUnitsPerBox}
                      →
                      ${enteredUnitsPerBox}
                      unidades/caja
                    </span>
                  `
              : ""
            }
            </span>
          `;
        }

        if (
          codeInput &&
          !String(
            codeInput.value ||
            ""
          ).trim()
        ) {
          codeInput.value =
            getProductCode(
              product
            ) ||
            "";
        }

        if (
          unitsPerBoxInput
        ) {
          unitsPerBoxInput.disabled =
            false;
        }

        if (
          costBoxInput &&
          numberOrZero(
            costBoxInput.value
          ) <=
          0
        ) {
          const existingCostBox =
            numberOrZero(
              product.lastCostPerBox
            );

          const existingCostUnit =
            numberOrZero(
              product.lastCostPerUnit
            );

          costBoxInput.value =
            String(
              existingCostBox > 0
                ? existingCostBox
                : existingCostUnit *
                enteredUnitsPerBox
            );
        }

        if (
          priceInput &&
          numberOrZero(
            priceInput.value
          ) <=
          0
        ) {
          priceInput.value =
            String(
              numberOrZero(
                product.price
              )
            );
        }

        if (
          providerInput &&
          !providerInput.value
        ) {
          const provider =
            getProviderById(
              getProductProviderId(
                product
              )
            );

          providerInput.value =
            provider
              ? getProviderDisplayName(
                provider
              )
              : getProductProviderName(
                product
              ) || "";
        }
      } else {
        if (
          status
        ) {
          status.innerHTML = `
            <span class="batch-status warning">
              Escribe o selecciona un producto existente.
            </span>
          `;
        }

        if (
          unitsPerBoxInput
        ) {
          unitsPerBoxInput.disabled =
            false;
        }
      }
    } else {
      if (
        status
      ) {
        status.innerHTML = `
          <span class="batch-status info">
            Producto nuevo
          </span>
        `;
      }

      if (
        unitsPerBoxInput
      ) {
        unitsPerBoxInput.disabled =
          false;
      }

      if (
        product &&
        normalizeText(
          product.name
        ) ===
        normalizeText(
          data.name
        )
      ) {
        if (
          status
        ) {
          status.innerHTML = `
            <span class="batch-status danger">
              Ese producto ya existe. Usa "Existente".
            </span>
          `;
        }
      }
    }
  }

  function bindBatchLineEvents(
    row
  ) {
    const modeElement =
      row.querySelector(
        ".batch-mode"
      );

    const productElement =
      row.querySelector(
        ".batch-product-input"
      );

    const removeButton =
      row.querySelector(
        ".batch-remove-row"
      );

    if (
      modeElement
    ) {
      modeElement.addEventListener(
        "change",
        () => {
          updateBatchLineState(
            row
          );
        }
      );
    }

    if (
      productElement
    ) {
      [
        "input",
        "change"
      ].forEach(
        eventName => {
          productElement.addEventListener(
            eventName,
            () => {
              updateBatchLineState(
                row
              );
            }
          );
        }
      );
    }

    row.querySelectorAll(
      "input, select"
    ).forEach(
      input => {
        if (
          input ===
          productElement ||
          input ===
          modeElement
        ) {
          return;
        }

        input.addEventListener(
          "input",
          () => {
            updateBatchLineState(
              row
            );
          }
        );

        input.addEventListener(
          "change",
          () => {
            updateBatchLineState(
              row
            );
          }
        );
      }
    );

    if (
      removeButton
    ) {
      removeButton.addEventListener(
        "click",
        () => {
          row.remove();

          updateBatchLineNumbers();
        }
      );
    }
  }

  function updateBatchLineNumbers() {
    document
      .querySelectorAll(
        ".batch-product-row"
      )
      .forEach(
        (
          row,
          index
        ) => {
          const title =
            row.querySelector(
              ".batch-row-header strong"
            );

          if (
            title
          ) {
            title.textContent =
              `Producto ${index + 1
              }`;
          }

          refreshProductComboboxDatalist(
            row
          );
        }
      );
  }

  function addBatchLine(
    container,
    values = {}
  ) {
    const line =
      createBatchLineData(
        values
      );

    const row =
      buildBatchLineHtml(
        line
      );

    container.appendChild(
      row
    );

    updateBatchLineNumbers();

    row
      .querySelector(
        ".batch-product-input"
      )
      ?.focus();

    return row;
  }

  /*
   * ============================================================
   * VALIDACIÓN BATCH
   * ============================================================
   */

  function validateBatchLines(
    rows
  ) {
    const errors =
      [];

    const parsed =
      rows.map(
        readBatchLine
      );

    const namesForNew =
      new Set();

    parsed.forEach(
      (
        line,
        index
      ) => {
        const label =
          `Producto ${index + 1
          }`;

        if (
          !line.productText
        ) {
          errors.push(
            `${label}: debes indicar el producto.`
          );

          return;
        }

        if (
          line.mode ===
          "existing"
        ) {
          if (
            !line.product
          ) {
            errors.push(
              `${label}: no se encontró el producto existente "${line.productText}".`
            );

            return;
          }
        }

        if (
          line.mode ===
          "new"
        ) {
          if (
            !line.name
          ) {
            errors.push(
              `${label}: el nombre es obligatorio.`
            );
          }

          const newKey =
            normalizeText(
              line.name
            );

          if (
            findProductByText(
              line.name
            )
          ) {
            errors.push(
              `${label}: "${line.name}" ya existe. Selecciona "Existente".`
            );
          }

          if (
            namesForNew.has(
              newKey
            )
          ) {
            errors.push(
              `${label}: el mismo producto nuevo aparece más de una vez.`
            );
          }

          namesForNew.add(
            newKey
          );

          if (
            !line.codigoProducto
          ) {
            errors.push(
              `${label}: el código es obligatorio para un producto nuevo.`
            );
          }
        }

        const totalUnits =
          (
            line.boxes +
            line.bonusBoxes
          ) *
          line.unitsPerBox +
          line.units +
          line.bonusUnits;

        if (
          totalUnits <=
          0
        ) {
          errors.push(
            `${label}: debes ingresar cajas, cajas bono, unidades o unidades bono.`
          );
        }

        if (
          line.unitsPerBox <=
          0
        ) {
          errors.push(
            `${label}: las unidades por caja deben ser mayores que cero.`
          );
        }

        if (
          line.lastCostPerBox <
          0
        ) {
          errors.push(
            `${label}: el costo por caja no puede ser negativo.`
          );
        }

        if (
          line.price <
          0
        ) {
          errors.push(
            `${label}: el precio no puede ser negativo.`
          );
        }
      }
    );

    return {
      errors,
      parsed
    };
  }

  /*
   * ============================================================
   * PROCESAMIENTO BATCH
   * ============================================================
   */

  async function processBatchLines(
    lines,
    operationDate
  ) {
    const user =
      auth.currentUser ||
      null;

    const validOperationDate =
      operationDate instanceof Date
        ? operationDate
        : parseOperationDate(
          operationDate
        );

    if (
      !validOperationDate
    ) {
      throw new Error(
        "La fecha de operación no es válida."
      );
    }

    const results =
      [];

    for (
      let index = 0;
      index <
      lines.length;
      index++
    ) {
      const line =
        lines[
        index
        ];

      const label =
        `Producto ${index + 1
        }`;

      if (
        line.mode ===
        "existing"
      ) {
        const product =
          line.product;

        if (
          !product
        ) {
          throw new Error(
            `${label}: producto existente no encontrado.`
          );
        }

        const result =
          await addStockToExistingProduct(
            product,
            line,
            user,
            validOperationDate
          );

        results.push({
          ...result,

          name:
            product.name
        });

        continue;
      }

      const result =
        await createNewProductFromLine(
          line,
          user,
          validOperationDate
        );

      results.push({
        ...result,

        name:
          line.name
      });
    }

    return results;
  }

  /*
   * ============================================================
   * MODAL BATCH
   * ============================================================
   */

  function buildBatchModalHtml() {
    return `
      <div
        class="batch-operation-date-box"
      >
        <div class="inv-field">
          <label
            for="batch-operation-date"
          >
            Fecha de operación
          </label>

          <input
            id="batch-operation-date"
            type="date"
            value="${getLocalDateInputValue()}"
          >

          <small>
            Esta fecha se utilizará para el movimiento
            de inventario y para el gasto automático.
          </small>
        </div>

        <div
          class="batch-operation-date-preview"
          id="batch-operation-date-preview"
        >
          Fecha seleccionada:
          <strong>
            ${formatOperationDate(
      new Date()
    )}
          </strong>
        </div>
      </div>

      <div
        id="batch-products-container"
        class="batch-products-container"
      ></div>

      <button
        type="button"
        id="batch-add-row"
        class="btn-primary"
        style="
          width:100%;
          margin-top:12px;
        "
      >
        <i class="fas fa-plus"></i>
        Agregar otro producto
      </button>

      <div class="batch-info-box">
        <strong>
          Operación múltiple
        </strong>

        <p>
          Los productos existentes reciben una entrada
          y los nuevos se crean.
        </p>

        <p>
          Las cajas bono y unidades bono aumentan
          el stock pero no generan costo.
        </p>

        <p>
          El costo por caja corresponde al costo por unidad
          multiplicado por las unidades por caja.
        </p>

        <p>
          El proveedor puede buscarse por nombre o razón social.
        </p>

        <p>
          El gasto automático solamente considera
          las cantidades pagadas.
        </p>
      </div>
    `;
  }

  async function openBatchAddModal() {
    if (
      !canEditInventory
    ) {
      await Swal.fire(
        "Sin permisos",
        "No puedes modificar el inventario con este usuario.",
        "warning"
      );

      return;
    }

    if (
      !currentLocalId
    ) {
      await Swal.fire(
        "Sin local",
        "No se pudo identificar el local actual.",
        "error"
      );

      return;
    }

    const initialRow =
      createBatchLineData({
        mode:
          currentProductsList.length
            ? "existing"
            : "new"
      });

    const result =
      await Swal.fire({
        title:
          "Agregar productos",

        html:
          buildBatchModalHtml(),

        width:
          "1100px",

        showCancelButton:
          true,

        confirmButtonText:
          "Guardar todo",

        cancelButtonText:
          "Cancelar",

        focusConfirm:
          false,

        customClass: {
          popup:
            "inventory-batch-modal"
        },

        didOpen:
          () => {
            const container =
              document.getElementById(
                "batch-products-container"
              );

            const addButton =
              document.getElementById(
                "batch-add-row"
              );

            const dateInput =
              document.getElementById(
                "batch-operation-date"
              );

            const datePreview =
              document.getElementById(
                "batch-operation-date-preview"
              );

            if (
              !container ||
              !addButton
            ) {
              return;
            }

            addBatchLine(
              container,
              initialRow
            );

            addButton.addEventListener(
              "click",
              () => {
                addBatchLine(
                  container,
                  {
                    mode:
                      currentProductsList.length
                        ? "existing"
                        : "new"
                  }
                );
              }
            );

            if (
              dateInput &&
              datePreview
            ) {
              dateInput.addEventListener(
                "change",
                () => {
                  const selectedDate =
                    parseOperationDate(
                      dateInput.value
                    );

                  if (
                    selectedDate
                  ) {
                    datePreview.innerHTML = `
                      Fecha seleccionada:
                      <strong>
                        ${escapeHtml(
                      formatOperationDate(
                        selectedDate
                      )
                    )}
                      </strong>
                    `;
                  } else {
                    datePreview.innerHTML = `
                      <span
                        style="
                          color:#b91c1c;
                          font-weight:700;
                        "
                      >
                        Fecha no válida.
                      </span>
                    `;
                  }
                }
              );
            }
          },

        preConfirm:
          () => {
            const container =
              document.getElementById(
                "batch-products-container"
              );

            const dateInput =
              document.getElementById(
                "batch-operation-date"
              );

            if (
              !container
            ) {
              Swal.showValidationMessage(
                "No se pudo construir el formulario."
              );

              return;
            }

            if (
              !dateInput
            ) {
              Swal.showValidationMessage(
                "No se pudo obtener la fecha de operación."
              );

              return;
            }

            const operationDate =
              parseOperationDate(
                dateInput.value
              );

            if (
              !operationDate
            ) {
              Swal.showValidationMessage(
                "Debes seleccionar una fecha de operación válida."
              );

              return;
            }

            const rows =
              Array.from(
                container.querySelectorAll(
                  ".batch-product-row"
                )
              );

            if (
              !rows.length
            ) {
              Swal.showValidationMessage(
                "Debes agregar al menos un producto."
              );

              return;
            }

            const validation =
              validateBatchLines(
                rows
              );

            if (
              validation.errors.length
            ) {
              Swal.showValidationMessage(
                validation.errors
                  .slice(
                    0,
                    5
                  )
                  .join(
                    "<br>"
                  )
              );

              return;
            }

            return {
              operationDate,

              operationDateValue:
                dateInput.value,

              lines:
                validation.parsed
            };
          }
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    const payload =
      result.value ||
      {};

    const lines =
      Array.isArray(
        payload.lines
      )
        ? payload.lines
        : [];

    const operationDate =
      payload.operationDate instanceof
        Date
        ? payload.operationDate
        : parseOperationDate(
          payload.operationDateValue
        );

    if (
      !lines.length
    ) {
      return;
    }

    if (
      !operationDate
    ) {
      await Swal.fire(
        "Fecha inválida",
        "La fecha de operación seleccionada no es válida.",
        "error"
      );

      return;
    }

    try {
      Swal.fire({
        title:
          "Procesando productos",

        html:
          `
            <div>
              Preparando ${lines.length
          } producto(s)...
              <br><br>
              <strong>
                Fecha de operación:
              </strong>
              ${escapeHtml(
            formatOperationDate(
              operationDate
            )
          )}
            </div>
          `,

        allowOutsideClick:
          false,

        allowEscapeKey:
          false,

        didOpen:
          () => {
            Swal.showLoading();
          }
      });

      const results =
        await processBatchLines(
          lines,
          operationDate
        );

      const created =
        results.filter(
          result =>
            result.type ===
            "new"
        ).length;

      const existing =
        results.filter(
          result =>
            result.type ===
            "existing"
        ).length;

      const totalUnits =
        results.reduce(
          (
            sum,
            result
          ) =>
            sum +
            numberOrZero(
              result.totalUnits
            ),
          0
        );

      const totalPurchaseCost =
        lines.reduce(
          (
            sum,
            line
          ) =>
            sum +
            calculateLinePurchaseCost(
              line,
              line.product ||
              null
            ),
          0
        );

      let expenseResult =
        null;

      let expenseError =
        null;

      try {
        expenseResult =
          await registerInventoryExpense(
            totalPurchaseCost,
            lines,
            auth.currentUser ||
            null,
            operationDate
          );

        if (
          expenseResult?.id
        ) {
          await attachExpenseToMovements(
            expenseResult.id,
            results
          );
        }
      } catch (
        error
      ) {
        expenseError =
          error;

        console.error(
          "El inventario fue guardado, pero no se pudo registrar el gasto automático:",
          error
        );
      }

      Swal.close();

      refreshInventoryView();

      const expenseStatus =
        expenseError
          ? `
              <p
                style="
                  color:#b91c1c;
                  font-weight:700;
                "
              >
                Advertencia:
                el inventario se guardó correctamente,
                pero el gasto automático no pudo registrarse.
              </p>
            `
          : totalPurchaseCost >
            0
            ? `
                <p>
                  Gasto registrado:
                  <strong>
                    ${currency(
              totalPurchaseCost
            )}
                  </strong>
                </p>
              `
            : `
                <p>
                  Gasto registrado:
                  <strong>
                    $0.00
                  </strong>
                </p>
              `;

      await Swal.fire({
        icon:
          expenseError
            ? "warning"
            : "success",

        title:
          expenseError
            ? "Carga completada con advertencia"
            : "Carga completada",

        html:
          `
            <div
              style="
                text-align:left;
              "
            >
              <p>
                Fecha de operación:
                <strong>
                  ${escapeHtml(
            formatOperationDate(
              operationDate
            )
          )}
                </strong>
              </p>

              <p>
                Productos procesados:
                <strong>
                  ${results.length}
                </strong>
              </p>

              <p>
                Nuevos:
                <strong>
                  ${created}
                </strong>
              </p>

              <p>
                Existentes:
                <strong>
                  ${existing}
                </strong>
              </p>

              <p>
                Unidades agregadas:
                <strong>
                  ${totalUnits}
                </strong>
              </p>

              <p>
                Costo total:
                <strong>
                  ${currency(
            totalPurchaseCost
          )}
                </strong>
              </p>

              ${expenseStatus}
            </div>
          `,

        confirmButtonText:
          "Aceptar"
      });
    } catch (
      error
    ) {
      Swal.close();

      console.error(
        "Error procesando carga múltiple:",
        error
      );

      await Swal.fire(
        "Error",
        error.message ||
        "No se pudo completar la operación.",
        "error"
      );
    }
  }

  /*
   * ============================================================
   * FORMULARIO DE EDICIÓN
   * ============================================================
   */

  function buildMovementEditFormHtml(
    movement,
    product
  ) {
    const operationDate =
      getMovementOperationDateValue(
        movement
      );

    const breakdown =
      getMovementBreakdown(
        movement,
        product
      );

    const movementUnitsPerBox =
      Math.max(
        1,
        integerOrZero(
          movement.unidadesPorCaja ??
          movement.unitsPerBox
        ) ||
        breakdown.unitsPerBox ||
        1
      );

    const productUnitsPerBox =
      getUnitsPerBox(
        product
      );

    let currentCostPerUnit =
      numberOrZero(
        movement.costoUnitario
      );

    let currentCostPerBox =
      numberOrZero(
        movement.costoPorCaja
      );

    if (
      currentCostPerUnit <=
      0 &&
      currentCostPerBox >
      0
    ) {
      currentCostPerUnit =
        currentCostPerBox /
        movementUnitsPerBox;
    }

    if (
      currentCostPerBox <=
      0 &&
      currentCostPerUnit >
      0
    ) {
      currentCostPerBox =
        currentCostPerUnit *
        movementUnitsPerBox;
    }

    if (
      currentCostPerUnit <=
      0 &&
      currentCostPerBox <=
      0
    ) {
      currentCostPerUnit =
        getCostPerUnit(
          product
        );

      currentCostPerBox =
        currentCostPerUnit *
        movementUnitsPerBox;
    }

    const currentSalePrice =
      numberOrZero(
        movement.precioVenta
      ) ||
      numberOrZero(
        product?.price
      );

    /*
     * EL PROVEEDOR DEL MOVIMIENTO TIENE PRIORIDAD.
     */
    const movementProvider =
      getProviderById(
        movement.proveedorId
      );

    const movementProviderDisplay =
      movementProvider
        ? getProviderDisplayName(
          movementProvider
        )
        : (
          [
            movement.proveedorNombre,
            movement.proveedorRazonSocial
          ]
            .filter(Boolean)
            .join(
              " — "
            )
        );

    return `
      <div
        class="movement-edit-form"
      >

        <div
          class="movement-edit-header"
        >
          <div>
            <strong>
              ${escapeHtml(
      product?.name ||
      movement.productName ||
      "Producto"
    )}
            </strong>

            <span>
              Stock actual:
              <strong>
                ${getCurrentStockUnits(
      product
    )}
              </strong>
            </span>

            <span>
              Unidades por caja del producto:
              <strong>
                ${productUnitsPerBox}
              </strong>
            </span>

            <span>
              Unidades por caja de esta entrada:
              <strong>
                ${movementUnitsPerBox}
              </strong>
            </span>

            <span>
              Proveedor del movimiento:
              <strong>
                ${escapeHtml(
      movementProviderDisplay ||
      "Sin proveedor"
    )}
              </strong>
            </span>
          </div>
        </div>

        <div
          class="movement-edit-grid"
        >

          <div class="inv-field">
            <label>
              Fecha de operación
            </label>

            <input
              id="movement-edit-date"
              type="date"
              value="${escapeHtml(
      operationDate
    )}"
            >
          </div>

          <div class="inv-field">
            <label>
              Proveedor
            </label>

            ${getProviderComboboxHtml(
      "movement-edit-provider",
      "movement-edit-provider-list",
      movementProviderDisplay,
      "movement-edit-provider-input"
    )}

            <small>
              Puedes buscar por nombre o Razón Social / Denominación.
            </small>
          </div>

          <div class="inv-field">
            <label>
              Unidades por caja
            </label>

            <input
              id="movement-edit-units-per-box"
              type="number"
              min="1"
              step="1"
              value="${movementUnitsPerBox}"
            >

            <small>
              Editable. Al cambiarlo se recalculan
              las unidades de las cajas y el stock.
            </small>
          </div>

          <div class="inv-field">
            <label>
              Cajas
            </label>

            <input
              id="movement-edit-boxes"
              type="number"
              min="0"
              step="1"
              value="${breakdown.cajas}"
            >

            <small>
              Cantidad de cajas pagadas.
            </small>
          </div>

          <div
            class="inv-field bonus-field"
          >
            <label>
              Cajas bono
            </label>

            <input
              id="movement-edit-bonus-boxes"
              type="number"
              min="0"
              step="1"
              value="${breakdown.cajasBono}"
            >
          </div>

          <div class="inv-field">
            <label>
              Unidades sueltas
            </label>

            <input
              id="movement-edit-units"
              type="number"
              min="0"
              step="1"
              value="${breakdown.unidades}"
            >
          </div>

          <div
            class="inv-field bonus-field"
          >
            <label>
              Unidades bono
            </label>

            <input
              id="movement-edit-bonus-units"
              type="number"
              min="0"
              step="1"
              value="${breakdown.unidadesBono}"
            >
          </div>

          <div class="inv-field">
            <label>
              Costo por caja
            </label>

            <input
              id="movement-edit-cost-box"
              type="number"
              min="0"
              step="0.01"
              value="${currentCostPerBox.toFixed(
      2
    )}"
            >
          </div>

          <div class="inv-field">
            <label>
              Costo por unidad
            </label>

            <input
              id="movement-edit-cost-unit"
              type="text"
              value="${currentCostPerUnit.toFixed(
      4
    )}"
              readonly
            >
          </div>

          <div class="inv-field">
            <label>
              Precio de venta
            </label>

            <input
              id="movement-edit-sale-price"
              type="number"
              min="0"
              step="0.01"
              value="${currentSalePrice.toFixed(
      2
    )}"
            >
          </div>

          <div class="inv-field">
            <label>
              Entrada total
            </label>

            <input
              id="movement-edit-entry"
              type="text"
              value="${breakdown.totalUnits}"
              readonly
            >
          </div>

          <div
            class="inv-field movement-edit-full"
          >
            <label>
              Referencia de libro
            </label>

            <input
              id="movement-edit-reference"
              type="text"
              value="${escapeHtml(
      movement.referenciaLibro ||
      ""
    )}"
            >
          </div>

          <div
            class="inv-field movement-edit-full"
          >
            <label>
              Documento
            </label>

            <input
              id="movement-edit-document"
              type="text"
              value="${escapeHtml(
      movement.numeroDocumento ||
      ""
    )}"
            >
          </div>

        </div>

        <div
          id="movement-edit-preview"
          class="movement-edit-preview"
        ></div>

        <div
          class="movement-edit-warning"
        >
          <strong>
            Importante:
          </strong>

          Las cajas, unidades por caja y proveedor
          son editables.

          <br><br>

          El proveedor seleccionado aquí corresponde
          específicamente a esta entrada.

          <br><br>

          Cambiar el proveedor del movimiento
          no cambia el proveedor global del producto.

          <br><br>

          Se seguirá aplicando:

          <strong>
            nueva entrada - entrada anterior
          </strong>

          sobre el stock vigente.
        </div>

        ${
      movement.expenseId
        ? `
              <div
                class="movement-edit-linked"
              >
                <i class="fas fa-link"></i>

                Esta entrada está vinculada a un gasto.
                El gasto se ajustará considerando solamente
                las cantidades pagadas.
              </div>
            `
        : `
              <div
                class="movement-edit-warning"
              >
                <i class="fas fa-info-circle"></i>

                Esta entrada no tiene un gasto vinculado.
              </div>
            `
    }

      </div>
    `;
  }

  function updateMovementEditPreview(
    product,
    movement
  ) {
    const boxesInput =
      document.getElementById(
        "movement-edit-boxes"
      );

    const bonusBoxesInput =
      document.getElementById(
        "movement-edit-bonus-boxes"
      );

    const unitsInput =
      document.getElementById(
        "movement-edit-units"
      );

    const bonusUnitsInput =
      document.getElementById(
        "movement-edit-bonus-units"
      );

    const unitsPerBoxInput =
      document.getElementById(
        "movement-edit-units-per-box"
      );

    const costBoxInput =
      document.getElementById(
        "movement-edit-cost-box"
      );

    const costUnitInput =
      document.getElementById(
        "movement-edit-cost-unit"
      );

    const salePriceInput =
      document.getElementById(
        "movement-edit-sale-price"
      );

    const entryInput =
      document.getElementById(
        "movement-edit-entry"
      );

    const preview =
      document.getElementById(
        "movement-edit-preview"
      );

    if (
      !boxesInput ||
      !bonusBoxesInput ||
      !unitsInput ||
      !bonusUnitsInput ||
      !unitsPerBoxInput ||
      !costBoxInput ||
      !preview
    ) {
      return;
    }

    const oldBreakdown =
      getMovementBreakdown(
        movement,
        product
      );

    const oldUnitsPerBox =
      Math.max(
        1,
        integerOrZero(
          movement.unidadesPorCaja ??
          movement.unitsPerBox
        ) ||
        oldBreakdown.unitsPerBox ||
        1
      );

    const newUnitsPerBox =
      Math.max(
        1,
        integerOrZero(
          unitsPerBoxInput.value
        ) ||
        oldUnitsPerBox
      );

    const cajas =
      integerOrZero(
        boxesInput.value
      );

    const cajasBono =
      integerOrZero(
        bonusBoxesInput.value
      );

    const unidades =
      integerOrZero(
        unitsInput.value
      );

    const unidadesBono =
      integerOrZero(
        bonusUnitsInput.value
      );

    const paidUnits =
      cajas *
      newUnitsPerBox +
      unidades;

    const bonusUnits =
      cajasBono *
      newUnitsPerBox +
      unidadesBono;

    const newEntry =
      paidUnits +
      bonusUnits;

    const oldEntry =
      (
        oldBreakdown.cajas *
        oldUnitsPerBox
      ) +
      oldBreakdown.unidades +
      (
        oldBreakdown.cajasBono *
        oldUnitsPerBox
      ) +
      oldBreakdown.unidadesBono;

    const difference =
      newEntry -
      oldEntry;

    const currentStock =
      getCurrentStockUnits(
        product
      );

    const resultingStock =
      currentStock +
      difference;

    const costPerBox =
      Math.max(
        0,
        numberOrZero(
          costBoxInput.value
        )
      );

    const costPerUnit =
      newUnitsPerBox > 0
        ? costPerBox /
        newUnitsPerBox
        : 0;

    const purchaseCost =
      paidUnits *
      costPerUnit;

    if (
      costUnitInput
    ) {
      costUnitInput.value =
        costPerUnit.toFixed(
          4
        );
    }

    if (
      entryInput
    ) {
      entryInput.value =
        String(
          newEntry
        );
    }

    const salePrice =
      Math.max(
        0,
        numberOrZero(
          salePriceInput?.value
        )
      );

    preview.innerHTML = `
      <div>
        Unidades/caja anterior
        <strong>
          ${oldUnitsPerBox}
        </strong>
      </div>

      <div>
        Nuevas unidades/caja
        <strong>
          ${newUnitsPerBox}
        </strong>
      </div>

      <div>
        Cajas
        <strong>
          ${cajas}
        </strong>
      </div>

      <div>
        Cajas bono
        <strong>
          ${cajasBono}
        </strong>
      </div>

      <div>
        Unidades sueltas
        <strong>
          ${unidades}
        </strong>
      </div>

      <div>
        Unidades bono
        <strong>
          ${unidadesBono}
        </strong>
      </div>

      <div>
        Entrada anterior
        <strong>
          ${oldEntry}
        </strong>
      </div>

      <div>
        Entrada pagada
        <strong>
          ${paidUnits}
        </strong>
      </div>

      <div>
        Entrada bono
        <strong>
          ${bonusUnits}
        </strong>
      </div>

      <div>
        Nueva entrada
        <strong>
          ${newEntry}
        </strong>
      </div>

      <div>
        Diferencia
        <strong
          style="
            color:${difference > 0
        ? "#166534"
        : difference < 0
          ? "#b91c1c"
          : "#374151"
      };
          "
        >
          ${difference > 0
        ? "+"
        : ""
      }${difference}
        </strong>
      </div>

      <div>
        Stock actual
        <strong>
          ${currentStock}
        </strong>
      </div>

      <div>
        Stock resultante
        <strong
          style="
            color:${resultingStock < 0
        ? "#b91c1c"
        : "#1d4ed8"
      };
          "
        >
          ${resultingStock}
        </strong>
      </div>

      <div>
        Costo por caja
        <strong>
          ${currency(
        costPerBox
      )}
        </strong>
      </div>

      <div>
        Costo por unidad
        <strong>
          ${currency(
        costPerUnit
      )}
        </strong>
      </div>

      <div>
        Precio de venta
        <strong>
          ${currency(
        salePrice
      )}
        </strong>
      </div>

      <div>
        Costo de entrada
        <strong>
          ${currency(
        purchaseCost
      )}
        </strong>
      </div>
    `;
  }

  async function updateEntryMovement(
    movementId,
    values
  ) {
    const movementRef =
      db
        .collection(
          MOVEMENTS_COLLECTION
        )
        .doc(
          movementId
        );

    const user =
      auth.currentUser ||
      null;

    const operationDate =
      parseOperationDate(
        values.fechaOperacion
      );

    if (
      !operationDate
    ) {
      throw new Error(
        "La fecha de operación no es válida."
      );
    }

    const operationTimestamp =
      buildOperationTimestamp(
        operationDate
      );

    /*
     * Resolver proveedor ANTES de abrir la transacción.
     *
     * El proveedor se guarda en el movimiento y NO se modifica
     * automáticamente el proveedor global del producto.
     */
    const providerText =
      String(
        values.proveedorTexto ||
        ""
      ).trim();

    const selectedProvider =
      providerText
        ? resolveProviderSelection(
          providerText
        )
        : null;

    if (
      providerText &&
      !selectedProvider
    ) {
      throw new Error(
        `No se encontró un proveedor que coincida con "${providerText}" por nombre o razón social.`
      );
    }

    const selectedProviderId =
      selectedProvider
        ? String(
          selectedProvider.id
        ).trim()
        : "";

    const selectedProviderName =
      selectedProvider
        ? getProviderName(
          selectedProvider
        )
        : "";

    const selectedProviderReason =
      selectedProvider
        ? getProviderBusinessName(
          selectedProvider
        )
        : "";

    let updatedMovement =
      null;

    let updatedProduct =
      null;

    let updatedExpense =
      null;

    await db.runTransaction(
      async transaction => {
        const movementSnap =
          await transaction.get(
            movementRef
          );

        if (
          !movementSnap.exists
        ) {
          throw new Error(
            "El movimiento ya no existe."
          );
        }

        const oldMovementRaw =
          movementSnap.data() ||
          {};

        if (
          String(
            oldMovementRaw.tipoMovimiento ||
            ""
          )
            .trim()
            .toLowerCase() !==
          "entrada"
        ) {
          throw new Error(
            "Solo se pueden editar movimientos de tipo entrada."
          );
        }

        if (
          !matchesCurrentLocal(
            oldMovementRaw
          )
        ) {
          throw new Error(
            "El movimiento no pertenece al local actual."
          );
        }

        const productId =
          String(
            oldMovementRaw.productId ||
            ""
          ).trim();

        if (
          !productId
        ) {
          throw new Error(
            "El movimiento no tiene un producto asociado."
          );
        }

        const productRef =
          db
            .collection(
              PRODUCTS_COLLECTION
            )
            .doc(
              productId
            );

        const productSnap =
          await transaction.get(
            productRef
          );

        if (
          !productSnap.exists
        ) {
          throw new Error(
            "El producto asociado al movimiento ya no existe."
          );
        }

        const productData =
          productSnap.data() ||
          {};

        if (
          !matchesCurrentLocal(
            productData
          )
        ) {
          throw new Error(
            "El producto no pertenece al local actual."
          );
        }

        const oldMovement =
          normalizeMovementDocument(
            movementId,
            oldMovementRaw
          );

        const oldBreakdown =
          getMovementBreakdown(
            oldMovement,
            productData
          );

        /*
         * ========================================================
         * UNIDADES POR CAJA ANTERIORES
         * ========================================================
         */

        const oldUnitsPerBox =
          Math.max(
            1,
            integerOrZero(
              oldMovementRaw.unidadesPorCaja ??
              oldMovementRaw.unitsPerBox
            ) ||
            oldBreakdown.unitsPerBox ||
            integerOrZero(
              productData.unitsPerBox
            ) ||
            1
          );

        /*
         * ========================================================
         * NUEVO DESGLOSE
         * ========================================================
         */

        const newBoxes =
          integerOrZero(
            values.cajas
          );

        const newBonusBoxes =
          integerOrZero(
            values.cajasBono
          );

        const newUnits =
          integerOrZero(
            values.unidades
          );

        const newBonusUnits =
          integerOrZero(
            values.unidadesBono
          );

        const unitsPerBox =
          Math.max(
            1,
            integerOrZero(
              values.unidadesPorCaja
            ) ||
            oldUnitsPerBox
          );

        const newPaidUnits =
          newBoxes *
          unitsPerBox +
          newUnits;

        const newBonusUnitsTotal =
          newBonusBoxes *
          unitsPerBox +
          newBonusUnits;

        const newEntry =
          newPaidUnits +
          newBonusUnitsTotal;

        /*
         * ========================================================
         * COSTO
         * ========================================================
         */

        let newCostPerBox =
          Math.max(
            0,
            numberOrZero(
              values.costoPorCaja
            )
          );

        let newCostPerUnit =
          0;

        if (
          newCostPerBox >
          0
        ) {
          newCostPerUnit =
            newCostPerBox /
            unitsPerBox;

          newCostPerBox =
            newCostPerUnit *
            unitsPerBox;
        } else {
          newCostPerUnit =
            numberOrZero(
              oldMovement.costoUnitario
            );

          newCostPerBox =
            newCostPerUnit *
            unitsPerBox;
        }

        /*
         * ========================================================
         * PRECIO
         * ========================================================
         */

        const newSalePrice =
          Math.max(
            0,
            numberOrZero(
              values.precioVenta
            )
          );

        /*
         * ========================================================
         * STOCK
         * ========================================================
         */

        const oldEntry =
          (
            oldBreakdown.cajas *
            oldUnitsPerBox
          ) +
          oldBreakdown.unidades +
          (
            oldBreakdown.cajasBono *
            oldUnitsPerBox
          ) +
          oldBreakdown.unidadesBono;

        const currentStock =
          getCurrentStockUnits(
            productData
          );

        const difference =
          newEntry -
          oldEntry;

        const nextStock =
          currentStock +
          difference;

        if (
          nextStock <
          0
        ) {
          throw new Error(
            `No se puede reducir la entrada a ${newEntry} unidades porque el stock actual (${currentStock}) quedaría en ${nextStock}.`
          );
        }

        /*
         * ========================================================
         * COSTO DE ENTRADA ANTERIOR
         * ========================================================
         */

        const oldPaidUnits =
          oldBreakdown.cajas *
          oldUnitsPerBox +
          oldBreakdown.unidades;

        let oldCostPerUnit =
          numberOrZero(
            oldMovement.costoUnitario
          );

        if (
          oldCostPerUnit <=
          0
        ) {
          const oldCostPerBox =
            numberOrZero(
              oldMovement.costoPorCaja
            );

          oldCostPerUnit =
            oldUnitsPerBox >
            0
              ? oldCostPerBox /
              oldUnitsPerBox
              : 0;
        }

        const oldCostTotal =
          oldMovement.costoTotal !==
            undefined &&
            oldMovement.costoTotal !==
            null
            ? Math.max(
              0,
              numberOrZero(
                oldMovement.costoTotal
              )
            )
            : Math.max(
              0,
              oldPaidUnits *
              oldCostPerUnit
            );

        /*
         * ========================================================
         * NUEVO COSTO
         * ========================================================
         */

        const newCostTotal =
          Math.max(
            0,
            newPaidUnits *
            newCostPerUnit
          );

        /*
         * ========================================================
         * GASTO
         * ========================================================
         */

        let expenseData =
          null;

        const expenseId =
          String(
            oldMovement.expenseId ||
            ""
          ).trim();

        if (
          expenseId
        ) {
          const expenseRef =
            db
              .collection(
                EXPENSES_COLLECTION
              )
              .doc(
                expenseId
              );

          const expenseSnap =
            await transaction.get(
              expenseRef
            );

          if (
            expenseSnap.exists
          ) {
            const oldExpense =
              expenseSnap.data() ||
              {};

            const oldExpenseAmount =
              Math.max(
                0,
                numberOrZero(
                  oldExpense.amount
                )
              );

            const expenseDifference =
              newCostTotal -
              oldCostTotal;

            const nextExpenseAmount =
              Math.max(
                0,
                oldExpenseAmount +
                expenseDifference
              );

            expenseData = {
              expenseRef,

              data:
                oldExpense,

              amount:
                nextExpenseAmount
            };

            transaction.update(
              expenseRef,
              {
                amount:
                  nextExpenseAmount,

                dayKey:
                  getInventoryDayKey(
                    operationDate
                  ),

                inventoryOperationDate:
                  getLocalDateInputValue(
                    operationDate
                  ),

                updatedAt:
                  firebase.firestore
                    .FieldValue
                    .serverTimestamp()
              }
            );
          }
        }

        /*
         * ========================================================
         * MOVIMIENTO ACTUALIZADO
         * ========================================================
         */

        const nextMovementData = {
          ...oldMovementRaw,

          entrada:
            newEntry,

          saldoAnterior:
            currentStock -
            oldEntry,

          saldoActual:
            nextStock,

          cajas:
            newBoxes,

          boxes:
            newBoxes,

          cajasBono:
            newBonusBoxes,

          bonusBoxes:
            newBonusBoxes,

          unidades:
            newUnits,

          units:
            newUnits,

          unidadesBono:
            newBonusUnits,

          bonusUnits:
            newBonusUnits,

          unidadesPorCaja:
            unitsPerBox,

          unitsPerBox,

          entradaPagada:
            newPaidUnits,

          entradaBono:
            newBonusUnitsTotal,

          costoUnitario:
            newCostPerUnit,

          unitCost:
            newCostPerUnit,

          costoPorUnidad:
            newCostPerUnit,

          costoPorCaja:
            newCostPerBox,

          lastCostPerBox:
            newCostPerBox,

          costoTotal:
            newCostTotal,

          precioVenta:
            newSalePrice,

          price:
            newSalePrice,

          fechaOperacion:
            getLocalDateInputValue(
              operationDate
            ),

          createdAt:
            operationTimestamp,

          referenciaLibro:
            values.referenciaLibro,

          referenceBook:
            values.referenciaLibro,

          bookReference:
            values.referenciaLibro,

          numeroDocumento:
            values.numeroDocumento,

          /*
           * =====================================================
           * PROVEEDOR ESPECÍFICO DEL MOVIMIENTO
           * =====================================================
           *
           * Esto es independiente del proveedor del producto.
           *
           * Si el input queda vacío:
           *     proveedor = null / vacío.
           *
           * Si se selecciona uno:
           *     se guardan ID, nombre y razón social.
           */

          proveedorId:
            selectedProviderId ||
            null,

          proveedorNombre:
            selectedProviderName,

          proveedorRazonSocial:
            selectedProviderReason,

          providerId:
            selectedProviderId ||
            null,

          providerName:
            selectedProviderName,

          providerBusinessName:
            selectedProviderReason,

          detalle:
            [
              `Cajas: ${newBoxes}`,
              `Cajas bono: ${newBonusBoxes}`,
              `Unidades: ${newUnits}`,
              `Unidades bono: ${newBonusUnits}`,
              `Entrada pagada: ${newPaidUnits}`,
              `Entrada bono: ${newBonusUnitsTotal}`,
              `Entrada total: ${newEntry}`,
              `Unidades por caja: ${unitsPerBox}`,
              `Costo por unidad: ${currency(
                newCostPerUnit
              )}`,
              `Costo por caja: ${currency(
                newCostPerBox
              )}`,
              `Precio de venta: ${currency(
                newSalePrice
              )}`,
              `Costo total: ${currency(
                newCostTotal
              )}`,
              selectedProviderName
                ? `Proveedor: ${selectedProviderName}`
                : "Proveedor: Sin proveedor",

              selectedProviderReason
                ? `Razón Social: ${selectedProviderReason}`
                : "Razón Social: Sin especificar",

              `Fecha de operación: ${formatOperationDate(
                operationDate
              )}`
            ].join(
              " | "
            ),

          updatedAt:
            firebase.firestore
              .FieldValue
              .serverTimestamp(),

          editado:
            true,

          fechaUltimaEdicion:
            firebase.firestore
              .FieldValue
              .serverTimestamp(),

          usuarioUltimaEdicion:
            user
              ? user.uid
              : null,

          usuarioUltimaEdicionNombre:
            currentUserInventoryContext?.name ||
            user?.email ||
            ""
        };

        transaction.update(
          movementRef,
          nextMovementData
        );

        /*
         * ========================================================
         * PRODUCTO ACTUALIZADO
         * ========================================================
         *
         * El proveedor global del producto NO se cambia aquí.
         * Solo se modifica el movimiento.
         */

        const nextProductData = {
          quantity:
            nextStock,

          stockCurrentUnits:
            nextStock,

          boxes:
            Math.floor(
              nextStock /
              unitsPerBox
            ),

          unitsPerBox,

          lastCostPerBox:
            newCostPerBox,

          lastCostPerUnit:
            newCostPerUnit,

          price:
            newSalePrice,

          /*
           * IMPORTANTE:
           *
           * NO se agregan:
           *
           * proveedorId
           * proveedorNombre
           * proveedorRazonSocial
           *
           * a este objeto.
           *
           * Así el proveedor editado queda exclusivamente
           * asociado a esta entrada.
           */

          referenciaLibro:
            values.referenciaLibro ||
            productData.referenciaLibro ||
            "",

          referenceBook:
            values.referenciaLibro ||
            productData.referenceBook ||
            productData.referenciaLibro ||
            "",

          numeroDocumento:
            values.numeroDocumento ||
            productData.numeroDocumento ||
            "",

          fechaUltimaEntrada:
            getLocalDateInputValue(
              operationDate
            ),

          updatedAt:
            firebase.firestore
              .FieldValue
              .serverTimestamp()
        };

        transaction.update(
          productRef,
          nextProductData
        );

        updatedMovement = {
          ...oldMovementRaw,
          ...nextMovementData,

          id:
            movementId,

          createdAt:
            operationTimestamp.toMillis(),

          updatedAt:
            Date.now()
        };

        updatedProduct = {
          ...productData,
          ...nextProductData,

          id:
            productId,

          quantity:
            nextStock,

          stockCurrentUnits:
            nextStock,

          boxes:
            Math.floor(
              nextStock /
              unitsPerBox
            ),

          unitsPerBox,

          lastCostPerBox:
            newCostPerBox,

          lastCostPerUnit:
            newCostPerUnit,

          price:
            newSalePrice,

          updatedAt:
            Date.now()
        };

        if (
          expenseData
        ) {
          updatedExpense = {
            ...expenseData.data,

            amount:
              expenseData.amount,

            dayKey:
              getInventoryDayKey(
                operationDate
              ),

            inventoryOperationDate:
              getLocalDateInputValue(
                operationDate
              ),

            updatedAt:
              Date.now()
          };
        }
      }
    );

    if (
      !updatedMovement ||
      !updatedProduct
    ) {
      throw new Error(
        "No se pudo construir la actualización del movimiento."
      );
    }

    upsertSessionDocument(
      PRODUCTS_COLLECTION,
      updatedProduct.id,
      updatedProduct
    );

    const localProduct =
      findProductById(
        updatedProduct.id
      );

    if (
      localProduct
    ) {
      Object.assign(
        localProduct,
        updatedProduct
      );
    }

    upsertSessionDocument(
      MOVEMENTS_COLLECTION,
      movementId,
      updatedMovement
    );

    if (
      updatedExpense &&
      updatedMovement.expenseId
    ) {
      upsertSessionDocument(
        EXPENSES_COLLECTION,
        updatedMovement.expenseId,
        updatedExpense
      );
    }

    invalidateProductStockMovementsCache(
      updatedProduct.id
    );

    return {
      movement:
        normalizeMovementDocument(
          movementId,
          updatedMovement
        ),

      product:
        updatedProduct,

      expense:
        updatedExpense
    };
  }

  async function openEditMovementModal(
    movement
  ) {
    if (
      !canEditInventory
    ) {
      await Swal.fire(
        "Sin permisos",
        "No puedes editar movimientos.",
        "warning"
      );

      return;
    }

    if (
      movement?.tipoMovimiento !==
      "entrada"
    ) {
      await Swal.fire(
        "Movimiento no válido",
        "Solo se pueden editar entradas.",
        "warning"
      );

      return;
    }

    const product =
      findProductById(
        movement.productId
      );

    if (
      !product
    ) {
      await Swal.fire(
        "Producto no encontrado",
        "El producto asociado al movimiento ya no está disponible.",
        "warning"
      );

      return;
    }

    const normalizedMovement =
      normalizeMovementDocument(
        movement.id,
        movement
      );

    const result =
      await Swal.fire({
        title:
          "Editar entrada",

        html:
          buildMovementEditFormHtml(
            normalizedMovement,
            product
          ),

        width:
          "980px",

        showCancelButton:
          true,

        confirmButtonText:
          "Guardar cambios",

        cancelButtonText:
          "Cancelar",

        focusConfirm:
          false,

        customClass: {
          popup:
            "inventory-movement-edit-modal"
        },

        didOpen:
          () => {
            const selectors = [
              "#movement-edit-boxes",
              "#movement-edit-bonus-boxes",
              "#movement-edit-units",
              "#movement-edit-bonus-units",
              "#movement-edit-units-per-box",
              "#movement-edit-cost-box",
              "#movement-edit-sale-price"
            ];

            selectors.forEach(
              selector => {
                const element =
                  document.querySelector(
                    selector
                  );

                if (
                  !element
                ) {
                  return;
                }

                element.addEventListener(
                  "input",
                  () => {
                    updateMovementEditPreview(
                      product,
                      normalizedMovement
                    );
                  }
                );

                element.addEventListener(
                  "change",
                  () => {
                    updateMovementEditPreview(
                      product,
                      normalizedMovement
                    );
                  }
                );
              }
            );

            updateMovementEditPreview(
              product,
              normalizedMovement
            );
          },

        preConfirm:
          () => {
            const fechaOperacion =
              String(
                document.getElementById(
                  "movement-edit-date"
                )?.value ||
                ""
              ).trim();

            const cajas =
              integerOrZero(
                document.getElementById(
                  "movement-edit-boxes"
                )?.value
              );

            const cajasBono =
              integerOrZero(
                document.getElementById(
                  "movement-edit-bonus-boxes"
                )?.value
              );

            const unidades =
              integerOrZero(
                document.getElementById(
                  "movement-edit-units"
                )?.value
              );

            const unidadesBono =
              integerOrZero(
                document.getElementById(
                  "movement-edit-bonus-units"
                )?.value
              );

            const unidadesPorCaja =
              Math.max(
                1,
                integerOrZero(
                  document.getElementById(
                    "movement-edit-units-per-box"
                  )?.value
                ) || 1
              );

            const costoPorCaja =
              Math.max(
                0,
                numberOrZero(
                  document.getElementById(
                    "movement-edit-cost-box"
                  )?.value
                )
              );

            const precioVenta =
              Math.max(
                0,
                numberOrZero(
                  document.getElementById(
                    "movement-edit-sale-price"
                  )?.value
                )
              );

            const proveedorTexto =
              String(
                document.getElementById(
                  "movement-edit-provider"
                )?.value ||
                ""
              ).trim();

            const referenciaLibro =
              String(
                document.getElementById(
                  "movement-edit-reference"
                )?.value ||
                ""
              ).trim();

            const numeroDocumento =
              String(
                document.getElementById(
                  "movement-edit-document"
                )?.value ||
                ""
              ).trim();

            const operationDate =
              parseOperationDate(
                fechaOperacion
              );

            if (
              !operationDate
            ) {
              Swal.showValidationMessage(
                "Debes seleccionar una fecha válida."
              );

              return;
            }

            /*
             * Validación de proveedor:
             *
             * Vacío = quitar proveedor del movimiento.
             *
             * Texto = debe coincidir con un proveedor existente
             * por nombre, razón social o combinación.
             */
            if (
              proveedorTexto
            ) {
              const provider =
                resolveProviderSelection(
                  proveedorTexto
                );

              if (
                !provider
              ) {
                Swal.showValidationMessage(
                  `No se encontró el proveedor "${escapeHtml(
                    proveedorTexto
                  )}". Puedes buscarlo por nombre o razón social.`
                );

                return;
              }
            }

            if (
              unidadesPorCaja <=
              0
            ) {
              Swal.showValidationMessage(
                "Las unidades por caja deben ser mayores que cero."
              );

              return;
            }

            const paidUnits =
              cajas *
              unidadesPorCaja +
              unidades;

            const bonusUnits =
              cajasBono *
              unidadesPorCaja +
              unidadesBono;

            const totalUnits =
              paidUnits +
              bonusUnits;

            if (
              totalUnits <=
              0
            ) {
              Swal.showValidationMessage(
                "Debes ingresar al menos una cantidad."
              );

              return;
            }

            return {
              fechaOperacion,

              cajas,

              cajasBono,

              unidades,

              unidadesBono,

              unidadesPorCaja,

              costoPorCaja,

              precioVenta,

              proveedorTexto,

              referenciaLibro,

              numeroDocumento
            };
          }
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    try {
      Swal.fire({
        title:
          "Actualizando entrada",

        text:
          "Calculando diferencia de stock, costos, proveedor y valores del movimiento.",

        allowOutsideClick:
          false,

        allowEscapeKey:
          false,

        didOpen:
          () => {
            Swal.showLoading();
          }
      });

      const resultData =
        await updateEntryMovement(
          normalizedMovement.id,
          result.value
        );

      Swal.close();

      refreshInventoryView();

      await Swal.fire({
        icon:
          "success",

        title:
          "Entrada actualizada",

        html:
          `
            <div
              style="
                text-align:left;
              "
            >
              <p>
                Producto:
                <strong>
                  ${escapeHtml(
            resultData.product.name ||
            product.name ||
            ""
          )}
                </strong>
              </p>

              <p>
                Proveedor del movimiento:
                <strong>
                  ${escapeHtml(
            resultData.movement.proveedorNombre ||
            "Sin proveedor"
          )}
                </strong>
              </p>

              ${
                resultData.movement.proveedorRazonSocial
                  ? `
                    <p>
                      Razón Social / Denominación:
                      <strong>
                        ${escapeHtml(
                          resultData.movement.proveedorRazonSocial
                        )}
                      </strong>
                    </p>
                  `
                  : ""
              }

              <p>
                Cajas:
                <strong>
                  ${integerOrZero(
            resultData.movement.cajas
          )}
                </strong>
              </p>

              <p>
                Unidades por caja:
                <strong>
                  ${integerOrZero(
            resultData.movement.unidadesPorCaja
          )}
                </strong>
              </p>

              <p>
                Entrada pagada:
                <strong>
                  ${integerOrZero(
            resultData.movement.entradaPagada
          )}
                  unidades
                </strong>
              </p>

              <p>
                Cajas bono:
                <strong>
                  ${integerOrZero(
            resultData.movement.cajasBono
          )}
                </strong>
              </p>

              <p>
                Unidades bono:
                <strong>
                  ${integerOrZero(
            resultData.movement.unidadesBono
          )}
                </strong>
              </p>

              <p>
                Entrada total:
                <strong>
                  ${integerOrZero(
            resultData.movement.entrada
          )}
                  unidades
                </strong>
              </p>

              <p>
                Costo por caja:
                <strong>
                  ${currency(
            resultData.movement.costoPorCaja
          )}
                </strong>
              </p>

              <p>
                Costo por unidad:
                <strong>
                  ${currency(
            resultData.movement.costoUnitario
          )}
                </strong>
              </p>

              <p>
                Precio de venta:
                <strong>
                  ${currency(
            resultData.movement.precioVenta
          )}
                </strong>
              </p>

              <p>
                Costo total de la entrada:
                <strong>
                  ${currency(
            resultData.movement.costoTotal
          )}
                </strong>
              </p>

              <p>
                Nuevo stock:
                <strong>
                  ${numberOrZero(
            resultData.product.stockCurrentUnits
          )}
                  unidades
                </strong>
              </p>

              ${
                resultData.expense
                  ? `
                    <p>
                      Gasto actualizado:
                      <strong>
                        ${currency(
                          resultData.expense.amount
                        )}
                      </strong>
                    </p>
                  `
                  : ""
              }
            </div>
          `,

        confirmButtonText:
          "Aceptar"
      });

      await openMovementManagerModal(
        movement.productId
      );
    } catch (
      error
    ) {
      Swal.close();

      console.error(
        "Error actualizando entrada:",
        error
      );

      await Swal.fire(
        "Error",
        error.message ||
        "No se pudo actualizar la entrada.",
        "error"
      );
    }
  }

  /*
   * ============================================================
   * TABLA DE MOVIMIENTOS
   * ============================================================
   */

  function buildMovementManagerHtml(
    productId,
    movements
  ) {
    const product =
      productId
        ? findProductById(
          productId
        )
        : null;

    const defaultDateTo =
      "";

    const defaultDateFrom =
      "";

    return `
      <div
        class="movement-manager"
        id="movement-manager"
        data-product-id="${escapeHtml(
      productId || ""
    )}"
      >

        <div
          class="movement-manager-title"
        >
          <div>
            <strong>
              ${product
        ? `Entradas de ${escapeHtml(
          product.name
        )}`
        : "Entradas de inventario"
      }
            </strong>

            <small>
              ${product
        ? "Historial completo de entradas de este producto."
        : "Historial completo de entradas del local."
      }
            </small>
          </div>

          <div
            class="movement-manager-summary"
            id="movement-summary"
          >
            ${movements.length}
            entradas
          </div>
        </div>

        ${product
        ? `
              <div
                class="movement-current-stock-summary"
              >
                <span>
                  Stock actual:
                  <strong>
                    ${getCurrentStockUnits(
          product
        )}
                  </strong>
                  unidades
                </span>

                <span>
                  Unidades/caja:
                  <strong>
                    ${getUnitsPerBox(
          product
        )}
                  </strong>
                </span>

                <span>
                  Cajas actuales:
                  <strong>
                    ${getStockBoxes(
          product
        )}
                  </strong>
                </span>
              </div>
            `
        : ""
      }

        <div
          class="movement-filters"
        >

          <div class="inv-field">
            <label>
              Fecha desde
            </label>

            <input
              id="movement-filter-from"
              type="date"
              value="${defaultDateFrom}"
            >
          </div>

          <div class="inv-field">
            <label>
              Fecha hasta
            </label>

            <input
              id="movement-filter-to"
              type="date"
              value="${defaultDateTo}"
            >
          </div>

          ${product
        ? ""
        : `
                <div class="inv-field">
                  <label>
                    Producto / Proveedor
                  </label>

                  <input
                    id="movement-filter-product"
                    type="text"
                    list="movement-filter-product-list"
                    placeholder="Nombre, código, proveedor o razón social..."
                    autocomplete="off"
                  >

                  <datalist id="movement-filter-product-list">
                    ${getProductFilterOptionsHtml()}
                  </datalist>
                </div>
              `
      }

          <div
            class="movement-filter-actions"
          >
            <button
              type="button"
              class="btn-primary"
              id="movement-filter-apply"
            >
              <i class="fas fa-filter"></i>
              Filtrar
            </button>

            <button
              type="button"
              class="btn-outline"
              id="movement-filter-clear"
            >
              Limpiar
            </button>
          </div>

        </div>

        <div
          id="movement-table-wrapper"
          class="movement-table-wrapper"
        >
          ${renderMovementTableHtml(
        movements
      )}
        </div>

      </div>
    `;
  }

  function renderMovementTableHtml(
    movements
  ) {
    if (
      !movements.length
    ) {
      return `
        <div
          class="movement-empty"
        >
          <i class="fas fa-box-open"></i>

          <strong>
            No hay entradas
          </strong>

          <span>
            No se encontraron movimientos de tipo entrada
            con los filtros actuales.
          </span>
        </div>
      `;
    }

    return `
      <div
        class="movement-table-scroll"
      >
        <table
          class="movement-table"
        >
          <thead>
            <tr>
              <th>
                Fecha
              </th>

              <th>
                Producto
              </th>

              <th>
                Proveedor
              </th>

              <th>
                Entrada
              </th>

              <th>
                Costo por unidad
              </th>

              <th>
                Costo por caja
              </th>

              <th>
                Costo total
              </th>

              <th>
                Precio venta
              </th>

              <th>
                Referencia
              </th>

              <th>
                Documento
              </th>

              <th>
                Saldo
              </th>

              <th>
                Acción
              </th>
            </tr>
          </thead>

          <tbody>
            ${movements
        .map(
          movement => `
                  <tr>
                    <td>
                      ${escapeHtml(
            getMovementOperationDateValue(
              movement
            ) ||
            "—"
          )}
                    </td>

                    <td>
                      <strong>
                        ${escapeHtml(
            movement.productCurrentName ||
            movement.productName ||
            "Producto"
          )}
                      </strong>

                      ${movement.codigoProducto
              ? `
                            <small>
                              Código:
                              ${escapeHtml(
                movement.codigoProducto
              )}
                            </small>
                          `
              : ""
            }
                    </td>

                    <td>
                      <strong>
                        ${escapeHtml(
              movement.proveedorNombre ||
              "Sin proveedor"
            )}
                      </strong>

                      ${
                        movement.proveedorRazonSocial
                          ? `
                            <small>
                              ${escapeHtml(
                            movement.proveedorRazonSocial
                          )}
                            </small>
                          `
                          : ""
                      }
                    </td>

                    <td>
                      <strong>
                        ${integerOrZero(
              movement.cajas
            )}
                      </strong>
                      ${integerOrZero(
              movement.cajas
            ) === 1
              ? "caja"
              : "cajas"
            }

                      ×

                      <strong>
                        ${integerOrZero(
              movement.unidadesPorCaja
            )}
                      </strong>

                      <small>
                        ${integerOrZero(
              movement.unidades
            )}
                        unidades sueltas
                      </small>

                      ${integerOrZero(
              movement.cajasBono
            ) > 0
              ? `
                            <small>
                              +
                              ${integerOrZero(
                movement.cajasBono
              )}
                              cajas bono
                            </small>
                          `
              : ""
            }

                      ${integerOrZero(
              movement.unidadesBono
            ) > 0
              ? `
                            <small>
                              +
                              ${integerOrZero(
                movement.unidadesBono
              )}
                              unidades bono
                            </small>
                          `
              : ""
            }

                      <br>

                      <small>
                        Total:
                        <strong>
                          ${integerOrZero(
              movement.entrada
            )}
                        </strong>
                        unidades
                      </small>
                    </td>

                    <td>
                      ${currency(
              movement.costoUnitario
            )}
                    </td>

                    <td>
                      ${currency(
              movement.costoPorCaja
            )}
                    </td>

                    <td>
                      <strong>
                        ${currency(
              movement.costoTotal
            )}
                      </strong>
                    </td>

                    <td>
                      ${currency(
              movement.precioVenta
            )}
                    </td>

                    <td>
                      ${escapeHtml(
              movement.referenciaLibro ||
              "—"
            )}
                    </td>

                    <td>
                      ${escapeHtml(
              movement.numeroDocumento ||
              "—"
            )}
                    </td>

                    <td>
                      ${integerOrZero(
              movement.saldoActual
            )}
                    </td>

                    <td>
                      <button
                        type="button"
                        class="btn-outline movement-edit-button"
                        data-movement-id="${escapeHtml(
              movement.id
            )}"
                      >
                        <i class="fas fa-edit"></i>
                        Editar
                      </button>
                    </td>
                  </tr>
                `
        )
        .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function filterMovements(
    movements,
    {
      productId = "",
      dateFrom = "",
      dateTo = "",
      productText = ""
    } = {}
  ) {
    const normalizedProductText =
      normalizeText(
        productText
      );

    return movements.filter(
      movement => {
        if (
          productId &&
          String(
            movement.productId
          ).trim() !==
          String(
            productId
          ).trim()
        ) {
          return false;
        }

        const date =
          getMovementOperationDateValue(
            movement
          );

        if (
          dateFrom &&
          (
            !date ||
            date <
            dateFrom
          )
        ) {
          return false;
        }

        if (
          dateTo &&
          (
            !date ||
            date >
            dateTo
          )
        ) {
          return false;
        }

        if (
          normalizedProductText
        ) {
          const productName =
            normalizeText(
              movement.productCurrentName ||
              movement.productName
            );

          const code =
            normalizeText(
              movement.codigoProducto
            );

          /*
           * IMPORTANTE:
           *
           * La búsqueda del historial usa el proveedor DEL
           * MOVIMIENTO, no únicamente el proveedor actual
           * del producto.
           */
          const movementProviderName =
            normalizeText(
              movement.proveedorNombre
            );

          const movementProviderReason =
            normalizeText(
              movement.proveedorRazonSocial
            );

          /*
           * Como fallback también se revisa el proveedor actual
           * del producto.
           */
          const productProviderName =
            normalizeText(
              movement.productCurrentProvider
            );

          const productProviderReason =
            normalizeText(
              movement.productCurrentProviderReason
            );

          const matches =
            productName.includes(
              normalizedProductText
            ) ||
            code.includes(
              normalizedProductText
            ) ||
            movementProviderName.includes(
              normalizedProductText
            ) ||
            movementProviderReason.includes(
              normalizedProductText
            ) ||
            productProviderName.includes(
              normalizedProductText
            ) ||
            productProviderReason.includes(
              normalizedProductText
            );

          if (
            !matches
          ) {
            return false;
          }
        }

        return true;
      }
    );
  }

  async function openMovementManagerModal(
    productId = ""
  ) {
    if (
      !canEditInventory
    ) {
      await Swal.fire(
        "Sin permisos",
        "No puedes editar movimientos de inventario.",
        "warning"
      );

      return;
    }

    let movements =
      productId
        ? await loadProductStockMovements(
          productId
        )
        : await loadAllEntryMovements();

    movements =
      movements.filter(
        movement =>
          movement.tipoMovimiento ===
          "entrada"
      );

    await Swal.fire({
      title:
        productId
          ? "Historial de entradas"
          : "Entradas de inventario",

      html:
        buildMovementManagerHtml(
          productId,
          movements
        ),

      width:
        "1380px",

      showCancelButton:
        false,

      showConfirmButton:
        false,

      focusConfirm:
        false,

      customClass: {
        popup:
          "inventory-movement-manager-modal"
      },

      didOpen:
        () => {
          const applyButton =
            document.getElementById(
              "movement-filter-apply"
            );

          const clearButton =
            document.getElementById(
              "movement-filter-clear"
            );

          const renderFiltered =
            () => {
              const dateFrom =
                String(
                  document.getElementById(
                    "movement-filter-from"
                  )?.value ||
                  ""
                ).trim();

              const dateTo =
                String(
                  document.getElementById(
                    "movement-filter-to"
                  )?.value ||
                  ""
                ).trim();

              const productText =
                String(
                  document.getElementById(
                    "movement-filter-product"
                  )?.value ||
                  ""
                ).trim();

              if (
                dateFrom &&
                dateTo &&
                dateFrom >
                dateTo
              ) {
                Swal.fire(
                  "Filtro inválido",
                  "La fecha inicial no puede ser posterior a la fecha final.",
                  "warning"
                );

                return;
              }

              const filtered =
                filterMovements(
                  movements,
                  {
                    productId,
                    dateFrom,
                    dateTo,
                    productText
                  }
                );

              const summary =
                document.getElementById(
                  "movement-summary"
                );

              const wrapper =
                document.getElementById(
                  "movement-table-wrapper"
                );

              if (
                summary
              ) {
                summary.textContent =
                  `${filtered.length} entrada${filtered.length ===
                    1
                    ? ""
                    : "s"
                  }`;
              }

              if (
                wrapper
              ) {
                wrapper.innerHTML =
                  renderMovementTableHtml(
                    filtered
                  );
              }

              bindMovementEditButtons();
            };

          if (
            applyButton
          ) {
            applyButton.addEventListener(
              "click",
              renderFiltered
            );
          }

          if (
            clearButton
          ) {
            clearButton.addEventListener(
              "click",
              () => {
                const from =
                  document.getElementById(
                    "movement-filter-from"
                  );

                const to =
                  document.getElementById(
                    "movement-filter-to"
                  );

                const product =
                  document.getElementById(
                    "movement-filter-product"
                  );

                if (
                  from
                ) {
                  from.value =
                    "";
                }

                if (
                  to
                ) {
                  to.value =
                    "";
                }

                if (
                  product
                ) {
                  product.value =
                    "";
                }

                renderFiltered();
              }
            );
          }

          const productFilter =
            document.getElementById(
              "movement-filter-product"
            );

          if (
            productFilter
          ) {
            [
              "input",
              "change"
            ].forEach(
              eventName => {
                productFilter.addEventListener(
                  eventName,
                  () => {
                    renderFiltered();
                  }
                );
              }
            );
          }

          const dateFrom =
            document.getElementById(
              "movement-filter-from"
            );

          const dateTo =
            document.getElementById(
              "movement-filter-to"
            );

          [
            dateFrom,
            dateTo
          ]
            .filter(
              Boolean
            )
            .forEach(
              element => {
                element.addEventListener(
                  "change",
                  () => {
                    renderFiltered();
                  }
                );
              }
            );

          bindMovementEditButtons();
        }
    });
  }

  function bindMovementEditButtons() {
    document
      .querySelectorAll(
        ".movement-edit-button"
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
              const movementId =
                String(
                  button.dataset
                    .movementId ||
                  ""
                ).trim();

              if (
                !movementId
              ) {
                return;
              }

              const movement =
                await findMovementById(
                  movementId
                );

              if (
                !movement
              ) {
                await Swal.fire(
                  "Movimiento no encontrado",
                  "El movimiento ya no está disponible en la caché de sesión.",
                  "warning"
                );

                return;
              }

              await openEditMovementModal(
                movement
              );
            }
          );
        }
      );
  }

  async function findMovementById(
    movementId
  ) {
    const target =
      String(
        movementId ||
        ""
      ).trim();

    if (
      !target
    ) {
      return null;
    }

    const cached =
      getSessionCollection(
        MOVEMENTS_COLLECTION
      ).find(
        item =>
          String(
            item.id
          ).trim() ===
          target
      );

    if (
      cached &&
      matchesCurrentLocal(
        cached.data
      )
    ) {
      const movement =
        normalizeMovementDocument(
          cached.id,
          cached.data
        );

      const product =
        findProductById(
          movement.productId
        );

      movement.productCurrentName =
        product?.name ||
        movement.productName ||
        "Producto";

      movement.productCurrentProvider =
        getProductProviderName(
          product
        );

      movement.productCurrentProviderReason =
        getProductProviderReason(
          product
        );

      movement.productCurrentStock =
        product
          ? getCurrentStockUnits(
            product
          )
          : movement.saldoActual;

      return movement;
    }

    return null;
  }

  async function openEditModal(
    productId
  ) {
    return openMovementManagerModal(
      productId
    );
  }

  /*
   * ============================================================
   * ELIMINAR PRODUCTO
   * ============================================================
   */

  async function confirmDeleteProduct(
    productId,
    productName
  ) {
    if (
      !(
        currentRole ===
        "administrador" ||
        currentRole ===
        "admin"
      )
    ) {
      await Swal.fire(
        "Sin permisos",
        "Solo el administrador puede eliminar productos.",
        "error"
      );

      return;
    }

    const confirmation =
      await Swal.fire({
        title:
          `¿Eliminar "${productName}"?`,

        text:
          "Esta acción no se puede deshacer.",

        icon:
          "warning",

        showCancelButton:
          true,

        confirmButtonText:
          "Sí, eliminar",

        cancelButtonText:
          "Cancelar"
      });

    if (
      !confirmation.isConfirmed
    ) {
      return;
    }

    try {
      await db
        .collection(
          PRODUCTS_COLLECTION
        )
        .doc(
          productId
        )
        .delete();

      removeSessionDocument(
        PRODUCTS_COLLECTION,
        productId
      );

      currentProductsList =
        currentProductsList.filter(
          product =>
            String(
              product.id
            ) !==
            String(
              productId
            )
        );

      invalidateProductStockMovementsCache(
        productId
      );

      refreshInventoryView();

      await Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "success",

        title:
          "Producto eliminado",

        showConfirmButton:
          false,

        timer:
          1500
      });
    } catch (
      error
    ) {
      console.error(
        "Error eliminando producto:",
        error
      );

      await Swal.fire(
        "Error",
        "No se pudo eliminar el producto.",
        "error"
      );
    }
  }

  /*
   * ============================================================
   * BOTÓN GENERAL
   * ============================================================
   */

  function ensureGlobalMovementsButton() {
    const existing =
      document.getElementById(
        "btnMovements"
      );

    if (
      existing
    ) {
      return existing;
    }

    const btnAdd =
      getInventoryAddButton();

    if (
      !btnAdd ||
      !canEditInventory
    ) {
      return null;
    }

    const button =
      document.createElement(
        "button"
      );

    button.id =
      "btnMovements";

    button.type =
      "button";

    button.className =
      "btn-outline";

    button.innerHTML = `
      <i class="fas fa-history"></i>
      Movimientos de entrada
    `;

    button.style.marginLeft =
      "8px";

    button.addEventListener(
      "click",
      () =>
        openMovementManagerModal(
          ""
        )
    );

    btnAdd.parentNode?.insertBefore(
      button,
      btnAdd.nextSibling
    );

    return button;
  }

  /*
   * ============================================================
   * BÚSQUEDA PRINCIPAL
   * ============================================================
   */

  function applySearch() {
    const searchInput =
      getInventorySearchInput();

    const value =
      searchInput
        ? searchInput.value.trim()
        : "";

    if (
      inventoryDT
    ) {
      inventoryDT
        .search(
          value
        )
        .draw();

      return;
    }

    const normalized =
      normalizeText(
        value
      );

    const filtered =
      !normalized
        ? currentProductsList
        : currentProductsList.filter(
          product =>
            normalizeText(
              product.name
            ).includes(
              normalized
            ) ||
            normalizeText(
              getProductCode(
                product
              )
            ).includes(
              normalized
            ) ||
            normalizeText(
              getProductProviderName(
                product
              )
            ).includes(
              normalized
            ) ||
            normalizeText(
              getProductProviderReason(
                product
              )
            ).includes(
              normalized
            )
        );

    renderInventoryFallback(
      filtered.map(
        buildRowData
      )
    );
  }

  /*
   * ============================================================
   * EVENTOS
   * ============================================================
   */

  function bindInventoryPageEvents() {
    const searchInput =
      getInventorySearchInput();

    const btnAdd =
      getInventoryAddButton();

    if (
      searchInput &&
      searchInput.dataset.inventorySearchBound !==
      "1"
    ) {
      searchInput.dataset.inventorySearchBound =
        "1";

      [
        "input",
        "keyup",
        "change"
      ].forEach(
        eventName => {
          searchInput.addEventListener(
            eventName,
            applySearch
          );
        }
      );
    }

    if (
      btnAdd &&
      btnAdd.dataset.inventoryAddBound !==
      "1"
    ) {
      btnAdd.dataset.inventoryAddBound =
        "1";

      btnAdd.addEventListener(
        "click",
        openBatchAddModal
      );
    }
  }

  /*
   * ============================================================
   * ESTILOS
   * ============================================================
   */

  function injectInventoryStyles() {
    if (
      document.getElementById(
        "inventoryBatchStyles"
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "inventoryBatchStyles";

    style.textContent = `
      .inventory-batch-modal,
      .inventory-movement-manager-modal,
      .inventory-movement-edit-modal {
        max-height:94vh !important;
        overflow-y:auto !important;
      }

      .batch-operation-date-box {
        display:grid;
        grid-template-columns:
          minmax(0,1fr)
          minmax(0,1fr);
        gap:12px;
        margin-bottom:14px;
        padding:12px;
        border:1px solid #dbeafe;
        border-radius:12px;
        background:#eff6ff;
        text-align:left;
      }

      .batch-operation-date-preview {
        display:flex;
        flex-direction:column;
        justify-content:center;
        padding:10px 12px;
        border-radius:10px;
        background:#ffffff;
        border:1px solid #bfdbfe;
        color:#374151;
        font-size:.85rem;
      }

      .batch-operation-date-preview strong {
        margin-top:4px;
        color:#1d4ed8;
        font-size:1rem;
      }

      .batch-products-container {
        display:flex;
        flex-direction:column;
        gap:14px;
        text-align:left;
        max-height:62vh;
        overflow-y:auto;
        padding:3px;
      }

      .batch-product-row {
        border:1px solid #e5e7eb;
        border-radius:14px;
        padding:14px;
        background:#f9fafb;
      }

      .batch-row-header {
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:center;
        margin-bottom:12px;
      }

      .batch-row-header strong {
        font-size:1rem;
        color:#111827;
      }

      .batch-row-total {
        display:inline-block;
        margin-left:10px;
        font-size:.8rem;
        color:#2563eb;
        font-weight:700;
      }

      .batch-grid {
        display:grid;
        grid-template-columns:
          repeat(4,minmax(0,1fr));
        gap:10px;
      }

      .inv-field {
        display:flex;
        flex-direction:column;
        gap:5px;
      }

      .inv-field label {
        font-size:.82rem;
        font-weight:700;
        color:#374151;
      }

      .inv-field input,
      .inv-field select,
      .inv-combobox {
        width:100%;
        min-height:40px;
        box-sizing:border-box;
      }

      .inv-field small {
        color:#6b7280;
        font-size:.72rem;
      }

      .batch-product-field {
        grid-column:span 2;
      }

      .batch-product-status {
        min-height:18px;
      }

      .batch-status {
        display:inline-block;
        margin-top:3px;
        font-size:.72rem;
        font-weight:600;
      }

      .batch-status.success {
        color:#166534;
      }

      .batch-status.warning {
        color:#92400e;
      }

      .batch-status.info {
        color:#1d4ed8;
      }

      .batch-status.danger {
        color:#b91c1c;
      }

      .bonus-field {
        background:#fff7ed;
        border-radius:10px;
        padding:7px;
      }

      .bonus-field label {
        color:#9a3412;
      }

      .batch-row-summary {
        display:flex;
        flex-wrap:wrap;
        gap:12px;
        margin-top:12px;
        padding:10px;
        border-radius:10px;
        background:#eef2ff;
        color:#374151;
        font-size:.78rem;
      }

      .batch-row-summary strong {
        color:#111827;
      }

      .batch-info-box {
        margin-top:14px;
        padding:12px;
        border-radius:10px;
        background:#f3f4f6;
        text-align:left;
        color:#4b5563;
        font-size:.8rem;
      }

      .batch-info-box p {
        margin:5px 0;
      }

      .movement-manager {
        text-align:left;
      }

      .movement-manager-title {
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:center;
        margin-bottom:14px;
        padding:12px;
        border-radius:12px;
        background:#f8fafc;
        border:1px solid #e5e7eb;
      }

      .movement-manager-title > div:first-child {
        display:flex;
        flex-direction:column;
        gap:4px;
      }

      .movement-manager-title strong {
        color:#111827;
        font-size:1rem;
      }

      .movement-manager-title small {
        color:#6b7280;
      }

      .movement-manager-summary {
        font-weight:700;
        color:#1d4ed8;
        white-space:nowrap;
      }

      .movement-current-stock-summary {
        display:flex;
        flex-wrap:wrap;
        gap:14px;
        margin-bottom:12px;
        padding:11px 12px;
        border-radius:10px;
        background:#ecfdf5;
        border:1px solid #bbf7d0;
        color:#166534;
        font-size:.8rem;
      }

      .movement-current-stock-summary strong {
        color:#065f46;
      }

      .movement-filters {
        display:grid;
        grid-template-columns:
          repeat(4,minmax(0,1fr));
        gap:10px;
        padding:12px;
        margin-bottom:12px;
        border:1px solid #dbeafe;
        border-radius:12px;
        background:#eff6ff;
      }

      .movement-filter-actions {
        display:flex;
        align-items:end;
        gap:8px;
      }

      .movement-filter-actions button {
        min-height:40px;
      }

      .movement-table-wrapper {
        width:100%;
      }

      .movement-table-scroll {
        overflow-x:auto;
        max-height:58vh;
        overflow-y:auto;
        border:1px solid #e5e7eb;
        border-radius:12px;
      }

      .movement-table {
        width:100%;
        border-collapse:collapse;
        font-size:.78rem;
        background:#ffffff;
      }

      .movement-table th,
      .movement-table td {
        padding:10px;
        border-bottom:1px solid #e5e7eb;
        text-align:left;
        vertical-align:middle;
        white-space:nowrap;
      }

      .movement-table th {
        position:sticky;
        top:0;
        z-index:1;
        background:#f8fafc;
        color:#374151;
        font-weight:700;
      }

      .movement-table td small {
        display:block;
        margin-top:3px;
        color:#6b7280;
      }

      .movement-empty {
        min-height:200px;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:8px;
        color:#6b7280;
        border:1px dashed #cbd5e1;
        border-radius:12px;
        background:#f8fafc;
      }

      .movement-empty i {
        font-size:2rem;
        color:#94a3b8;
      }

      .movement-edit-form {
        text-align:left;
      }

      .movement-edit-header {
        display:flex;
        justify-content:space-between;
        gap:12px;
        padding:12px;
        margin-bottom:12px;
        border-radius:12px;
        background:#eff6ff;
        border:1px solid #bfdbfe;
      }

      .movement-edit-header > div {
        display:flex;
        flex-direction:column;
        gap:5px;
      }

      .movement-edit-header strong {
        color:#111827;
      }

      .movement-edit-header span {
        color:#475569;
        font-size:.82rem;
      }

      .movement-edit-header span strong {
        color:#1d4ed8;
      }

      .movement-edit-grid {
        display:grid;
        grid-template-columns:
          repeat(3,minmax(0,1fr));
        gap:10px;
      }

      .movement-edit-full {
        grid-column:span 3;
      }

      .movement-edit-preview {
        display:grid;
        grid-template-columns:
          repeat(4,minmax(0,1fr));
        gap:10px;
        margin-top:14px;
        padding:12px;
        border-radius:12px;
        background:#f8fafc;
        border:1px solid #e5e7eb;
      }

      .movement-edit-preview > div {
        display:flex;
        flex-direction:column;
        gap:4px;
        font-size:.78rem;
        color:#64748b;
      }

      .movement-edit-preview strong {
        font-size:1rem;
        color:#111827;
      }

      .movement-edit-warning,
      .movement-edit-linked {
        margin-top:12px;
        padding:11px 12px;
        border-radius:10px;
        font-size:.78rem;
        line-height:1.45;
      }

      .movement-edit-warning {
        background:#fff7ed;
        border:1px solid #fed7aa;
        color:#9a3412;
      }

      .movement-edit-linked {
        background:#ecfdf5;
        border:1px solid #bbf7d0;
        color:#166534;
      }

      #movement-edit-provider {
        width:100%;
        min-height:40px;
        box-sizing:border-box;
      }

      @media (max-width:1100px) {
        .movement-edit-grid {
          grid-template-columns:
            repeat(2,minmax(0,1fr));
        }

        .movement-edit-full {
          grid-column:span 2;
        }
      }

      @media (max-width:1000px) {
        .movement-filters {
          grid-template-columns:
            repeat(2,minmax(0,1fr));
        }

        .movement-edit-preview {
          grid-template-columns:
            repeat(2,minmax(0,1fr));
        }
      }

      @media (max-width:900px) {
        .batch-operation-date-box {
          grid-template-columns:1fr;
        }

        .batch-grid {
          grid-template-columns:
            repeat(2,minmax(0,1fr));
        }

        .batch-product-field {
          grid-column:span 2;
        }
      }

      @media (max-width:700px) {
        .movement-filters {
          grid-template-columns:1fr;
        }

        .movement-edit-grid {
          grid-template-columns:1fr;
        }

        .movement-edit-full {
          grid-column:span 1;
        }

        .movement-edit-preview {
          grid-template-columns:1fr;
        }

        .movement-filter-actions {
          align-items:stretch;
        }

        .movement-filter-actions button {
          flex:1;
        }
      }

      @media (max-width:600px) {
        .batch-grid {
          grid-template-columns:1fr;
        }

        .batch-product-field {
          grid-column:span 1;
        }

        .batch-products-container {
          max-height:55vh;
        }

        .movement-manager-title {
          flex-direction:column;
          align-items:flex-start;
        }
      }
    `;

    document.head.appendChild(
      style
    );
  }

  /*
   * ============================================================
   * INICIALIZACIÓN
   * ============================================================
   */

  async function initializeInventory(
    user
  ) {
    if (
      inventoryInitialized
    ) {
      bindInventoryPageEvents();

      return;
    }

    inventoryInitialized =
      true;

    try {
      injectInventoryStyles();

      bindInventoryPageEvents();

      await resolveInventoryContext(
        user
      );

      if (
        !currentLocalId
      ) {
        throw new Error(
          "El usuario no tiene un local asignado."
        );
      }

      if (
        typeof window.renderNavigationForRole ===
        "function"
      ) {
        window.renderNavigationForRole(
          currentUserInventoryContext.role ||
          ""
        );
      }

      ensureInventoryDataTable();

      ensureGlobalMovementsButton();

      bindInventoryPageEvents();

      await loadInventoryProviders();

      await loadInventoryData();

      applySearch();
    } catch (
      error
    ) {
      inventoryInitialized =
        false;

      console.error(
        "Error leyendo contexto del inventario:",
        error
      );

      if (
        typeof Swal !==
        "undefined"
      ) {
        await Swal.fire({
          icon:
            "error",

          title:
            "Error de inventario",

          text:
            error.message ||
            "No se pudo cargar el inventario."
        });
      }
    }
  }

  /*
   * ============================================================
   * DOM READY
   * ============================================================
   */

  function initializePageEventsWhenPossible() {
    injectInventoryStyles();

    bindInventoryPageEvents();
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initializePageEventsWhenPossible,
      {
        once:
          true
      }
    );
  } else {
    initializePageEventsWhenPossible();
  }

  /*
   * ============================================================
   * CONTROLADOR MVC
   * ============================================================
   */

  const inventoryModel =
    window.InventoryMVC
      ?.models
      ?.inventory ||
    {};

  const inventoryController = {
    name:
      "inventory",

    page:
      inventoryModel.page ||
      "inventory.html",

    roles:
      inventoryModel.roles ||
      [],

    init:
      initializeInventory
  };

  window.InventoryMVC.controllers.inventory =
    inventoryController;

  if (
    window.AppRouter &&
    typeof window.AppRouter.registerSecurePageController ===
    "function"
  ) {
    window.AppRouter.registerSecurePageController(
      inventoryController
    );
  } else {
    const initializeFallback =
      user => {
        const currentPage =
          window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();

        if (
          !user
        ) {
          if (
            currentPage !==
            "index.html" &&
            currentPage !==
            "login.html"
          ) {
            window.location.href =
              "index.html";
          }

          return;
        }

        initializeInventory(
          user
        );
      };

    if (
      document.readyState ===
      "loading"
    ) {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          auth.onAuthStateChanged(
            initializeFallback
          );
        },
        {
          once:
            true
        }
      );
    } else {
      auth.onAuthStateChanged(
        initializeFallback
      );
    }
  }

})();