// assets/js/sales.js
//
// Ventas.
//
// Reglas:
// - stock actual = stockCurrentUnits / quantity.
// - Al registrar una venta se descuenta inventario.
// - Las ventas pertenecen a un local.
// - No existe información de clientes en este módulo.
//
// Fecha y hora de la venta:
// - La fecha y hora se muestran dentro del carrito.
// - Por defecto se cargan con la fecha y hora local actual.
// - El usuario puede modificarlas antes de finalizar.
// - El valor seleccionado se guarda en createdAt.
// - La edición de ventas también modifica esa fecha/hora.
//
// Optimización:
// - NO usa onSnapshot() para productos.
// - NO usa onSnapshot() para ventas.
// - Productos se cargan una sola vez con get().
// - Ventas se cargan una sola vez con get().
// - Las ventas del mes se calculan desde SALES_CACHE.
// - No existe una segunda consulta para las métricas mensuales.
// - Después de crear/editar/eliminar una venta se actualizan las
//   cachés locales sin volver a leer Firestore.
// - Se evita consultar empleados/local directamente.
// - El contexto se reutiliza desde app.js.
//
// Edición:
// - Solo Administrador.
// - Solo referencia, fecha y hora.
// - No cambia productos, cantidades, precios ni inventario.
//
// Eliminación:
// - Solo Administrador.
// - Devuelve las unidades al inventario.
// - Los movimientos anteriores no se eliminan.
// - Se registra un movimiento "eliminacion_venta".

(function () {
  "use strict";

  /*
   * ============================================================
   * ELEMENTOS DOM
   * ============================================================
   */

  const productSelect =
    document.getElementById(
      "productSelect"
    );

  const saleModeSelect =
    document.getElementById(
      "saleMode"
    );

  const boxPriceGroup =
    document.getElementById(
      "boxPriceGroup"
    );

  const boxPriceInput =
    document.getElementById(
      "boxPrice"
    );

  const saleQuantityInput =
    document.getElementById(
      "saleQuantity"
    );

  const saleQuantityLabel =
    document.getElementById(
      "saleQuantityLabel"
    );

  const referenciaLibroInput =
    document.getElementById(
      "referenciaLibro"
    );

  /*
   * Fecha y hora de la venta.
   * Se aplican al carrito completo.
   */
  const cartSaleDateInput =
    document.getElementById(
      "cartSaleDate"
    );

  const cartSaleTimeInput =
    document.getElementById(
      "cartSaleTime"
    );

  const btnAddToCart =
    document.getElementById(
      "btnAddToCart"
    );

  const btnClearCart =
    document.getElementById(
      "btnClearCart"
    );

  const cartTableBody =
    document.querySelector(
      "#cartTable tbody"
    );

  const cartSubtotalEl =
    document.getElementById(
      "cartSubtotal"
    );

  const btnFinalize =
    document.getElementById(
      "btnFinalize"
    );

  const btnSaveDraft =
    document.getElementById(
      "btnSaveDraft"
    );

  const salesTable =
    document.getElementById(
      "salesTable"
    );

  const userGreeting =
    document.querySelectorAll(
      ".userGreeting"
    );

  /*
   * ============================================================
   * ESTADO
   * ============================================================
   */

  let salesDataTable =
    null;

  let PRODUCTS_CACHE =
    {};

  let SALES_CACHE =
    {};

  let MONTHLY_SOLD_UNITS =
    {};

  let CART =
    [];

  let isFinalizingSale =
    false;

  let isSavingDraft =
    false;

  let isAddingToCart =
    false;

  const editingSaleIds =
    new Set();

  const deletingSaleIds =
    new Set();

  const saleSaveTimers =
    {};

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

  let currentSalesContext =
    null;

  let salesInitialized =
    false;

  let initialSalesLoadPromise =
    null;

  /*
   * ============================================================
   * UTILIDADES
   * ============================================================
   */

  function currency(
    value
  ) {
    return `$${Number(
      value || 0
    ).toFixed(2)}`;
  }

  function isTinyScreen() {
    return (
      window.innerWidth <=
      425
    );
  }

  function numberOrZero(
    value
  ) {
    const n =
      Number(value);

    return Number.isFinite(
      n
    )
      ? n
      : 0;
  }

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

  function escapeAttribute(
    text
  ) {
    return escapeHtml(
      text
    );
  }

  /*
   * ============================================================
   * FECHA Y HORA
   * ============================================================
   */

  function formatDateOnly(
    value
  ) {
    if (!value) {
      return "-";
    }

    const d =
      value.seconds
        ? new Date(
            value.seconds *
              1000
          )
        : new Date(
            value
          );

    if (
      isNaN(
        d.getTime()
      )
    ) {
      return "-";
    }

    return d.toLocaleDateString();
  }

  function formatTimeOnly(
    value
  ) {
    if (!value) {
      return "-";
    }

    const d =
      value.seconds
        ? new Date(
            value.seconds *
              1000
          )
        : new Date(
            value
          );

    if (
      isNaN(
        d.getTime()
      )
    ) {
      return "-";
    }

    return d.toLocaleTimeString(
      [],
      {
        hour:
          "2-digit",

        minute:
          "2-digit"
      }
    );
  }

  function getLocalDateInputValue(
    value
  ) {
    if (!value) {
      return "";
    }

    const d =
      value.seconds
        ? new Date(
            value.seconds *
              1000
          )
        : new Date(
            value
          );

    if (
      isNaN(
        d.getTime()
      )
    ) {
      return "";
    }

    const year =
      d.getFullYear();

    const month =
      String(
        d.getMonth() +
          1
      ).padStart(
        2,
        "0"
      );

    const day =
      String(
        d.getDate()
      ).padStart(
        2,
        "0"
      );

    return `${year}-${month}-${day}`;
  }

  function getLocalTimeInputValue(
    value
  ) {
    if (!value) {
      return "";
    }

    const d =
      value.seconds
        ? new Date(
            value.seconds *
              1000
          )
        : new Date(
            value
          );

    if (
      isNaN(
        d.getTime()
      )
    ) {
      return "";
    }

    const hours =
      String(
        d.getHours()
      ).padStart(
        2,
        "0"
      );

    const minutes =
      String(
        d.getMinutes()
      ).padStart(
        2,
        "0"
      );

    return `${hours}:${minutes}`;
  }

  function buildLocalDateTime(
    dateValue,
    timeValue
  ) {
    const date =
      String(
        dateValue || ""
      ).trim();

    const time =
      String(
        timeValue || ""
      ).trim();

    if (
      !date ||
      !time
    ) {
      return null;
    }

    const dateParts =
      date
        .split("-")
        .map(
          Number
        );

    const timeParts =
      time
        .split(":")
        .map(
          Number
        );

    if (
      dateParts.length !==
        3 ||
      timeParts.length <
        2
    ) {
      return null;
    }

    const [
      year,
      month,
      day
    ] = dateParts;

    const [
      hours,
      minutes
    ] = timeParts;

    if (
      !Number.isInteger(
        year
      ) ||
      !Number.isInteger(
        month
      ) ||
      !Number.isInteger(
        day
      ) ||
      !Number.isInteger(
        hours
      ) ||
      !Number.isInteger(
        minutes
      )
    ) {
      return null;
    }

    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }

    const result =
      new Date(
        year,
        month - 1,
        day,
        hours,
        minutes,
        0,
        0
      );

    if (
      result.getFullYear() !==
        year ||
      result.getMonth() !==
        month - 1 ||
      result.getDate() !==
        day ||
      result.getHours() !==
        hours ||
      result.getMinutes() !==
        minutes
    ) {
      return null;
    }

    return result;
  }

  function getDateTimeMillis(
    value
  ) {
    if (!value) {
      return null;
    }

    const d =
      value.seconds
        ? new Date(
            value.seconds *
              1000
          )
        : new Date(
            value
          );

    const time =
      d.getTime();

    return Number.isFinite(
      time
    )
      ? time
      : null;
  }

  /*
   * Obtiene la fecha/hora actual local para los campos del carrito.
   */
  function setCartSaleDateTime(
    date = new Date()
  ) {
    if (
      cartSaleDateInput
    ) {
      cartSaleDateInput.value =
        getLocalDateInputValue(
          date
        );
    }

    if (
      cartSaleTimeInput
    ) {
      cartSaleTimeInput.value =
        getLocalTimeInputValue(
          date
        );
    }
  }

  /*
   * Lee y valida la fecha/hora seleccionada en el carrito.
   */
  function getCartSaleDateTime() {
    const date =
      cartSaleDateInput
        ? cartSaleDateInput.value
        : "";

    const time =
      cartSaleTimeInput
        ? cartSaleTimeInput.value
        : "";

    return buildLocalDateTime(
      date,
      time
    );
  }

  function validateCartSaleDateTime() {
    const date =
      cartSaleDateInput
        ? cartSaleDateInput.value
        : "";

    const time =
      cartSaleTimeInput
        ? cartSaleTimeInput.value
        : "";

    if (
      !date ||
      !time
    ) {
      return {
        valid:
          false,

        message:
          "Debes indicar la fecha y la hora de la venta."
      };
    }

    const saleDateTime =
      buildLocalDateTime(
        date,
        time
      );

    if (
      !saleDateTime
    ) {
      return {
        valid:
          false,

        message:
          "La fecha o la hora de la venta no son válidas."
      };
    }

    return {
      valid:
        true,

      dateTime:
        saleDateTime
    };
  }

  function getCurrentPageFile() {
    const file =
      window.location.pathname
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
   * CONTEXTO CENTRAL
   * ============================================================
   */

  function getSalesStoredCurrentUser() {
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
        ) ||
          "null"
      );
    } catch {
      return null;
    }
  }

  function getStoredUserName() {
    if (
      currentSalesContext &&
      currentSalesContext.name
    ) {
      return currentSalesContext.name;
    }

    const stored =
      getSalesStoredCurrentUser();

    if (
      stored &&
      stored.name
    ) {
      return stored.name;
    }

    if (
      auth.currentUser &&
      auth.currentUser.displayName
    ) {
      return auth.currentUser.displayName;
    }

    return null;
  }

  function isAdministrator() {
    const context =
      currentSalesContext;

    const stored =
      getSalesStoredCurrentUser();

    const role =
      context?.role ||
      context?.position ||
      stored?.role ||
      stored?.position ||
      "";

    const canonical =
      typeof window.getCanonicalRole ===
      "function"
        ? window.getCanonicalRole(
            role
          )
        : String(
            role
          ).trim();

    return (
      canonical ===
      "Administrador"
    );
  }

  async function resolveSalesContext(
    user
  ) {
    if (!user) {
      throw new Error(
        "No hay un usuario autenticado."
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

    const context =
      await window.getCurrentUserContext(
        user
      );

    if (!context) {
      throw new Error(
        "No se pudo resolver el contexto del usuario."
      );
    }

    currentSalesContext =
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

    if (
      !currentLocalId
    ) {
      throw new Error(
        "El usuario autenticado no tiene un id_local asignado."
      );
    }

    userGreeting.forEach(
      element => {
        element.textContent =
          `Hola, ${
            context.name ||
            "Usuario"
          } (${
            context.role ||
            ""
          })`;
      }
    );

    return context;
  }

  function syncLocalContextFromStorage() {
    const stored =
      getSalesStoredCurrentUser();

    if (stored) {
      currentLocalId =
        String(
          stored.id_local ||
            stored.idLocal ||
            stored.localId ||
            ""
        ).trim();

      currentLocalInfo = {
        id_local:
          currentLocalId,

        nombre:
          String(
            stored.localNombre ||
              stored.localName ||
              ""
          ).trim(),

        numeroDocumento:
          String(
            stored.localNumeroDocumento ||
              stored.localDocumentNumber ||
              ""
          ).trim(),

        ubicacion:
          String(
            stored.localUbicacion ||
              stored.localLocation ||
              ""
          ).trim(),

        contribuyente:
          String(
            stored.localContribuyente ||
              stored.contribuyente ||
              ""
          ).trim(),

        tipoDocumento:
          String(
            stored.localTipoDocumento ||
              stored.tipoDocumento ||
              ""
          ).trim(),

        nit:
          String(
            stored.localNIT ||
              stored.nit ||
              ""
          ).trim(),

        nrc:
          String(
            stored.localNRC ||
              stored.nrc ||
              ""
          ).trim()
      };
    }

    if (
      !currentLocalId &&
      typeof window.getCurrentLocalId ===
        "function"
    ) {
      currentLocalId =
        String(
          window.getCurrentLocalId() ||
            ""
        ).trim();
    }

    if (
      (
        !currentLocalInfo.nombre ||
        !currentLocalInfo.numeroDocumento ||
        !currentLocalInfo.ubicacion
      ) &&
      typeof window.getCurrentLocalInfo ===
        "function"
    ) {
      const info =
        window.getCurrentLocalInfo() ||
        {};

      currentLocalInfo = {
        ...currentLocalInfo,

        id_local:
          currentLocalId ||
          String(
            info.id_local ||
              ""
          ).trim(),

        nombre:
          String(
            info.nombre ||
              ""
          ).trim(),

        numeroDocumento:
          String(
            info.numeroDocumento ||
              ""
          ).trim(),

        ubicacion:
          String(
            info.ubicacion ||
              ""
          ).trim(),

        contribuyente:
          String(
            info.contribuyente ||
              ""
          ).trim(),

        tipoDocumento:
          String(
            info.tipoDocumento ||
              ""
          ).trim(),

        nit:
          String(
            info.nit ||
              ""
          ).trim(),

        nrc:
          String(
            info.nrc ||
              ""
          ).trim()
      };
    }
  }

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
    if (
      !currentLocalId
    ) {
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

  function getMovementLocalPayload() {
    return {
      id_local:
        currentLocalId ||
        "",

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
        ""
    };
  }

  /*
   * ============================================================
   * PRODUCTOS
   * ============================================================
   */

  function normalizeUnitsPerBox(
    product
  ) {
    const value =
      numberOrZero(
        product &&
          product.unitsPerBox
      );

    return value >
      0
      ? value
      : 1;
  }

  function isBoxProduct(
    product
  ) {
    return Boolean(
      product &&
        (
          product.saleByBox ===
            true ||
          product.saleMode ===
            "box" ||
          product.saleType ===
            "box"
        )
    );
  }

  function getDefaultSaleMode(
    product
  ) {
    return isBoxProduct(
      product
    )
      ? "box"
      : "unit";
  }

  function getDefaultBoxPrice(
    product
  ) {
    const unitsPerBox =
      normalizeUnitsPerBox(
        product
      );

    const saved =
      numberOrZero(
        product &&
          product.boxPrice
      );

    if (
      saved > 0
    ) {
      return saved;
    }

    return (
      numberOrZero(
        product &&
          product.price
      ) *
      unitsPerBox
    );
  }

  function getProductStockField(
    product
  ) {
    if (!product) {
      return 0;
    }

    const current =
      Number(
        product.stockCurrentUnits
      );

    if (
      Number.isFinite(
        current
      )
    ) {
      return Math.max(
        0,
        current
      );
    }

    const qty =
      Number(
        product.quantity
      );

    if (
      Number.isFinite(
        qty
      )
    ) {
      return Math.max(
        0,
        qty
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

  function getAvailableUnits(
    product
  ) {
    return getProductStockField(
      product
    );
  }

  function getAvailableBoxes(
    product
  ) {
    const unitsPerBox =
      normalizeUnitsPerBox(
        product
      );

    return Math.floor(
      getAvailableUnits(
        product
      ) /
        unitsPerBox
    );
  }

  /*
   * ============================================================
   * VENTAS / MÉTRICAS
   * ============================================================
   */

  function getSaleProductId(
    product
  ) {
    if (!product) {
      return "";
    }

    const value =
      product.productId ||
      product.productID ||
      product.product_id ||
      product.id;

    return value
      ? String(
          value
        )
      : "";
  }

  function getSaleUnitsForProduct(
    product
  ) {
    if (!product) {
      return 0;
    }

    const unitsPerBox =
      Math.max(
        1,
        numberOrZero(
          product.unitsPerBox
        )
      );

    const mode =
      String(
        product.mode ||
          product.saleMode ||
          product.saleType ||
          ""
      ).toLowerCase();

    const quantity =
      numberOrZero(
        product.quantity
      );

    const explicitUnits =
      numberOrZero(
        product.unitsTotal ||
          product.totalUnits
      );

    if (
      explicitUnits >
      0
    ) {
      return explicitUnits;
    }

    if (
      mode ===
      "box"
    ) {
      return (
        quantity *
        unitsPerBox
      );
    }

    return quantity;
  }

  function getSaleCreatedAtMillis(
    sale
  ) {
    return getDateTimeMillis(
      sale &&
        sale.createdAt
    );
  }

  function isCurrentMonthSale(
    sale
  ) {
    const millis =
      getSaleCreatedAtMillis(
        sale
      );

    if (
      millis ===
      null
    ) {
      return false;
    }

    const now =
      new Date();

    const start =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0,
        0,
        0,
        0
      );

    const nextMonth =
      new Date(
        now.getFullYear(),
        now.getMonth() +
          1,
        1,
        0,
        0,
        0,
        0
      );

    return (
      millis >=
        start.getTime() &&
      millis <
        nextMonth.getTime()
    );
  }

  function aggregateMonthlySalesFromCache() {
    const unitsMap =
      {};

    Object.values(
      SALES_CACHE
    ).forEach(
      sale => {
        if (
          !matchesCurrentLocal(
            sale
          )
        ) {
          return;
        }

        if (
          !isCurrentMonthSale(
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

            const soldUnits =
              getSaleUnitsForProduct(
                product
              );

            unitsMap[
              productId
            ] =
              (
                unitsMap[
                  productId
                ] ||
                0
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
   * CARGA INICIAL SIN REALTIME
   * ============================================================
   */

  async function loadProductsOnce() {
    const snapshot =
      await db
        .collection(
          "productos"
        )
        .where(
          "id_local",
          "==",
          currentLocalId
        )
        .get();

    const products =
      {};

    snapshot.forEach(
      doc => {
        const data =
          doc.data() ||
          {};

        if (
          !matchesCurrentLocal(
            data
          )
        ) {
          return;
        }

        const currentStockUnits =
          Number.isFinite(
            Number(
              data.stockCurrentUnits
            )
          )
            ? Math.max(
                0,
                numberOrZero(
                  data.stockCurrentUnits
                )
              )
            : Number.isFinite(
                Number(
                  data.quantity
                )
              )
              ? Math.max(
                  0,
                  numberOrZero(
                    data.quantity
                  )
                )
              : Number.isFinite(
                  Number(
                    data.stockBaseUnits
                  )
                )
                ? Math.max(
                    0,
                    numberOrZero(
                      data.stockBaseUnits
                    )
                  )
                : 0;

        products[
          doc.id
        ] = {
          id:
            doc.id,

          ...data,

          quantity:
            currentStockUnits,

          stockCurrentUnits:
            currentStockUnits,

          stockBaseUnits:
            numberOrZero(
              data.stockBaseUnits
            ),

          boxes:
            numberOrZero(
              data.boxes
            ),

          unitsPerBox:
            normalizeUnitsPerBox(
              data
            )
        };
      }
    );

    PRODUCTS_CACHE =
      products;
  }

  async function loadSalesOnce() {
    const snapshot =
      await db
        .collection(
          "ventas"
        )
        .where(
          "id_local",
          "==",
          currentLocalId
        )
        .get();

    const sales =
      {};

    snapshot.forEach(
      doc => {
        const data =
          doc.data() ||
          {};

        if (
          !matchesCurrentLocal(
            data
          )
        ) {
          return;
        }

        sales[
          doc.id
        ] = {
          id:
            doc.id,

          ...data
        };
      }
    );

    SALES_CACHE =
      sales;

    MONTHLY_SOLD_UNITS =
      aggregateMonthlySalesFromCache();
  }

  async function loadInitialSalesData() {
    if (
      initialSalesLoadPromise
    ) {
      return initialSalesLoadPromise;
    }

    initialSalesLoadPromise =
      (async () => {
        if (
          !currentLocalId
        ) {
          throw new Error(
            "No se pudo determinar el local actual."
          );
        }

        await Promise.all([
          loadProductsOnce(),
          loadSalesOnce()
        ]);

        refreshProductSelectText();

        syncModeFromProduct();

        renderSalesTable();

        renderCart();
      })();

    try {
      return await initialSalesLoadPromise;
    } finally {
      initialSalesLoadPromise =
        null;
    }
  }

  /*
   * ============================================================
   * SELECT2
   * ============================================================
   */

  function initSelect2() {
    if (
      !window.jQuery ||
      typeof $.fn.select2 !==
        "function" ||
      !productSelect
    ) {
      return;
    }

    try {
      if (
        $(productSelect)
          .hasClass(
            "select2-hidden-accessible"
          )
      ) {
        return;
      }

      $("#productSelect").select2({
        placeholder:
          "Buscar producto...",

        width:
          "100%",

        allowClear:
          true,

        minimumResultsForSearch:
          0
      });
    } catch (
      err
    ) {
      console.warn(
        "No se pudo inicializar Select2:",
        err
      );
    }
  }

  /*
   * ============================================================
   * PRODUCT SELECT
   * ============================================================
   */

  function refreshProductSelectText() {
    if (
      !productSelect
    ) {
      return;
    }

    const currentValue =
      productSelect.value;

    productSelect.innerHTML =
      "";

    const entries =
      Object.entries(
        PRODUCTS_CACHE
      );

    if (
      !entries.length
    ) {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        "";

      option.textContent =
        "No hay productos";

      productSelect.appendChild(
        option
      );

      return;
    }

    entries
      .sort(
        (
          a,
          b
        ) =>
          String(
            a[1].name ||
              ""
          ).localeCompare(
            String(
              b[1].name ||
                ""
            ),
            "es",
            {
              sensitivity:
                "base"
            }
          )
      )
      .forEach(
        (
          [
            id,
            product
          ]
        ) => {
          const availableUnits =
            getAvailableUnits(
              product
            );

          const unitsPerBox =
            normalizeUnitsPerBox(
              product
            );

          const availableBoxes =
            getAvailableBoxes(
              product
            );

          const boxPrice =
            getDefaultBoxPrice(
              product
            );

          const option =
            document.createElement(
              "option"
            );

          option.value =
            id;

          let label =
            `${product.name || "-"} — ${currency(
              product.price
            )} c/u`;

          if (
            unitsPerBox >
            1
          ) {
            label +=
              ` | ${currency(
                boxPrice
              )} caja (${unitsPerBox})`;

            label +=
              ` — stock: ${availableUnits} (${availableBoxes} cajas)`;
          } else {
            label +=
              ` — stock: ${availableUnits}`;
          }

          if (
            isBoxProduct(
              product
            )
          ) {
            label +=
              " — venta por cajas";
          }

          option.textContent =
            label;

          productSelect.appendChild(
            option
          );
        }
      );

    if (
      currentValue &&
      PRODUCTS_CACHE[
        currentValue
      ]
    ) {
      productSelect.value =
        currentValue;
    }

    if (
      window.jQuery &&
      typeof $.fn.select2 ===
        "function"
    ) {
      $("#productSelect").trigger(
        "change.select2"
      );
    }
  }

  function refreshSaleModeUI() {
    const productId =
      productSelect
        ? productSelect.value
        : "";

    const product =
      productId
        ? PRODUCTS_CACHE[
            productId
          ]
        : null;

    const mode =
      saleModeSelect
        ? saleModeSelect.value
        : "unit";

    if (
      saleQuantityLabel
    ) {
      saleQuantityLabel.textContent =
        mode ===
        "box"
          ? "Cantidad (cajas)"
          : "Cantidad (unidades)";
    }

    if (
      boxPriceGroup
    ) {
      boxPriceGroup.style.display =
        mode ===
        "box"
          ? "block"
          : "none";
    }

    if (
      mode ===
      "box"
    ) {
      if (
        product
      ) {
        boxPriceInput.value =
          getDefaultBoxPrice(
            product
          ).toFixed(
            2
          );
      } else if (
        !boxPriceInput.value ||
        numberOrZero(
          boxPriceInput.value
        ) <=
          0
      ) {
        boxPriceInput.value =
          "0.00";
      }
    }
  }

  function syncModeFromProduct() {
    const productId =
      productSelect
        ? productSelect.value
        : "";

    const product =
      productId
        ? PRODUCTS_CACHE[
            productId
          ]
        : null;

    if (
      !saleModeSelect
    ) {
      return;
    }

    saleModeSelect.value =
      product
        ? getDefaultSaleMode(
            product
          )
        : "unit";

    refreshSaleModeUI();
  }

  /*
   * ============================================================
   * CARRITO
   * ============================================================
   */

  function getLinePrice(
    product,
    mode,
    customBoxPrice = null
  ) {
    if (
      mode ===
      "box"
    ) {
      const entered =
        numberOrZero(
          customBoxPrice
        );

      if (
        entered > 0
      ) {
        return entered;
      }

      return getDefaultBoxPrice(
        product
      );
    }

    return numberOrZero(
      product.price
    );
  }

  function addToCart() {
    if (
      isAddingToCart
    ) {
      return;
    }

    isAddingToCart =
      true;

    try {
      const productId =
        productSelect
          ? productSelect.value
          : "";

      if (
        !productId
      ) {
        Swal.fire({
          toast:
            true,

          position:
            "top-end",

          icon:
            "warning",

          title:
            "Selecciona un producto",

          showConfirmButton:
            false,

          timer:
            1400
        });

        return;
      }

      const product =
        PRODUCTS_CACHE[
          productId
        ];

      if (
        !product
      ) {
        Swal.fire(
          "Error",
          "Producto no encontrado en caché.",
          "error"
        );

        return;
      }

      const mode =
        saleModeSelect
          ? saleModeSelect.value
          : getDefaultSaleMode(
              product
            );

      const quantity =
        Math.max(
          1,
          Math.floor(
            Number(
              saleQuantityInput.value ||
                1
            )
          )
        );

      const unitsPerBox =
        normalizeUnitsPerBox(
          product
        );

      const availableUnits =
        getAvailableUnits(
          product
        );

      if (
        mode ===
          "box" &&
        unitsPerBox <=
          1
      ) {
        Swal.fire({
          icon:
            "warning",

          title:
            "No se puede vender por cajas",

          text:
            "Este producto no tiene unidades por caja configuradas."
        });

        return;
      }

      const linePrice =
        getLinePrice(
          product,
          mode,
          boxPriceInput
            ? boxPriceInput.value
            : null
        );

      const unitsToDiscount =
        mode ===
        "box"
          ? quantity *
            unitsPerBox
          : quantity;

      const alreadyUnitsInCart =
        CART
          .filter(
            item =>
              item.productId ===
              productId
          )
          .reduce(
            (
              sum,
              item
            ) =>
              sum +
              numberOrZero(
                item.unitsTotal
              ),
            0
          );

      if (
        alreadyUnitsInCart +
          unitsToDiscount >
        availableUnits
      ) {
        Swal.fire({
          icon:
            "warning",

          title:
            "Stock insuficiente",

          text:
            `Stock disponible: ${availableUnits} unidades`
        });

        return;
      }

      const currentInCart =
        CART.find(
          item =>
            item.productId ===
              productId &&
            item.mode ===
              mode &&
            Number(
              item.price
            ) ===
              Number(
                linePrice
              )
        );

      if (
        currentInCart
      ) {
        currentInCart.quantity +=
          quantity;

        currentInCart.unitsTotal +=
          unitsToDiscount;

        currentInCart.total =
          currentInCart.quantity *
          currentInCart.price;
      } else {
        CART.push({
          productId,

          name:
            product.name,

          mode,

          price:
            linePrice,

          quantity,

          unitsPerBox,

          unitsTotal:
            unitsToDiscount,

          total:
            quantity *
            linePrice
        });
      }

      /*
       * Garantizar que la fecha/hora tengan un valor
       * aunque el usuario haya tardado en empezar la venta.
       */
      if (
        !cartSaleDateInput?.value ||
        !cartSaleTimeInput?.value
      ) {
        setCartSaleDateTime(
          new Date()
        );
      }

      renderCart();

      Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "success",

        title:
          "Producto añadido",

        timer:
          1200,

        showConfirmButton:
          false
      });

      saleQuantityInput.value =
        "1";

      if (
        mode ===
          "box" &&
        productId
      ) {
        boxPriceInput.value =
          getDefaultBoxPrice(
            product
          ).toFixed(
            2
          );
      }

      if (
        window.jQuery &&
        typeof $.fn.select2 ===
          "function"
      ) {
        $("#productSelect")
          .val(
            null
          )
          .trigger(
            "change"
          );
      } else if (
        productSelect
      ) {
        productSelect.value =
          "";
      }

      refreshSaleModeUI();
    } finally {
      isAddingToCart =
        false;
    }
  }

  function updateCartSummary() {
    const subtotal =
      CART.reduce(
        (
          sum,
          item
        ) =>
          sum +
          Number(
            item.total ||
              0
          ),
        0
      );

    cartSubtotalEl.textContent =
      currency(
        subtotal
      );

    btnFinalize.disabled =
      CART.length ===
        0 ||
      isFinalizingSale;

    return subtotal;
  }

  function syncCartInputsLayout() {
    if (
      !cartTableBody
    ) {
      return;
    }

    const widthQty =
      isTinyScreen()
        ? "100%"
        : "70px";

    const widthPrice =
      isTinyScreen()
        ? "100%"
        : "90px";

    cartTableBody
      .querySelectorAll(
        'input[data-cart-field="qty"]'
      )
      .forEach(
        input => {
          input.style.width =
            widthQty;
        }
      );

    cartTableBody
      .querySelectorAll(
        'input[data-cart-field="price"]'
      )
      .forEach(
        input => {
          input.style.width =
            widthPrice;
        }
      );

    cartTableBody
      .querySelectorAll(
        'button[data-cart-remove="1"]'
      )
      .forEach(
        button => {
          button.style.width =
            isTinyScreen()
              ? "100%"
              : "";
        }
      );
  }

  function renderCart() {
    if (
      !cartTableBody
    ) {
      return;
    }

    cartTableBody.innerHTML =
      "";

    if (
      !CART.length
    ) {
      cartTableBody.innerHTML =
        `
          <tr>
            <td colspan="5">
              El carrito está vacío.
            </td>
          </tr>
        `;

      cartSubtotalEl.textContent =
        currency(
          0
        );

      btnFinalize.disabled =
        true;

      return;
    }

    CART.forEach(
      (
        item,
        index
      ) => {
        const tr =
          document.createElement(
            "tr"
          );

        const tdName =
          document.createElement(
            "td"
          );

        tdName.setAttribute(
          "data-label",
          "Producto"
        );

        tdName.innerHTML =
          `
            ${escapeHtml(
              item.name
            )}

            <br>

            <small>
              ${
                item.mode ===
                "box"
                  ? `${item.quantity} cajas (${item.unitsTotal} unidades)`
                  : `${item.quantity} unidades`
              }
            </small>
          `;

        tr.appendChild(
          tdName
        );

        const tdQty =
          document.createElement(
            "td"
          );

        tdQty.setAttribute(
          "data-label",
          "Cantidad"
        );

        const qtyInput =
          document.createElement(
            "input"
          );

        qtyInput.type =
          "number";

        qtyInput.min =
          "1";

        qtyInput.step =
          "1";

        qtyInput.inputMode =
          "numeric";

        qtyInput.autocomplete =
          "off";

        qtyInput.value =
          item.quantity;

        qtyInput.dataset.cartField =
          "qty";

        qtyInput.style.width =
          isTinyScreen()
            ? "100%"
            : "70px";

        qtyInput.addEventListener(
          "input",
          event => {
            const value =
              Number(
                event.target
                  .value
              );

            if (
              !Number.isFinite(
                value
              ) ||
              value < 1
            ) {
              return;
            }

            const product =
              PRODUCTS_CACHE[
                item.productId
              ];

            const availableUnits =
              getAvailableUnits(
                product
              );

            const unitsPerBox =
              normalizeUnitsPerBox(
                product
              );

            const newUnitsTotal =
              item.mode ===
                "box"
                ? value *
                  unitsPerBox
                : value;

            const currentInCartUnits =
              CART
                .filter(
                  other =>
                    other.productId ===
                      item.productId &&
                    other !==
                      item
                )
                .reduce(
                  (
                    sum,
                    other
                  ) =>
                    sum +
                    numberOrZero(
                      other.unitsTotal
                    ),
                  0
                );

            if (
              currentInCartUnits +
                newUnitsTotal >
              availableUnits
            ) {
              Swal.fire({
                icon:
                  "warning",

                title:
                  "Stock insuficiente",

                text:
                  `Stock disponible: ${availableUnits} unidades`
              });

              event.target.value =
                item.quantity;

              return;
            }

            item.quantity =
              value;

            item.unitsTotal =
              newUnitsTotal;

            item.total =
              Number(
                item.price
              ) *
              Number(
                item.quantity
              );

            totalCell.textContent =
              currency(
                item.total
              );

            updateCartSummary();
          }
        );

        tdQty.appendChild(
          qtyInput
        );

        tr.appendChild(
          tdQty
        );

        const tdPrice =
          document.createElement(
            "td"
          );

        tdPrice.setAttribute(
          "data-label",
          "Precio"
        );

        const priceInput =
          document.createElement(
            "input"
          );

        priceInput.type =
          "number";

        priceInput.min =
          "0";

        priceInput.step =
          "0.01";

        priceInput.inputMode =
          "decimal";

        priceInput.autocomplete =
          "off";

        priceInput.value =
          Number(
            item.price
          ).toFixed(
            2
          );

        priceInput.dataset.cartField =
          "price";

        priceInput.style.width =
          isTinyScreen()
            ? "100%"
            : "90px";

        priceInput.addEventListener(
          "input",
          event => {
            const value =
              Number(
                event.target
                  .value
              );

            if (
              !Number.isFinite(
                value
              ) ||
              value < 0
            ) {
              return;
            }

            item.price =
              value;

            item.total =
              Number(
                item.price
              ) *
              Number(
                item.quantity
              );

            totalCell.textContent =
              currency(
                item.total
              );

            updateCartSummary();
          }
        );

        tdPrice.appendChild(
          priceInput
        );

        tr.appendChild(
          tdPrice
        );

        const totalCell =
          document.createElement(
            "td"
          );

        totalCell.setAttribute(
          "data-label",
          "Total"
        );

        totalCell.textContent =
          currency(
            item.total
          );

        tr.appendChild(
          totalCell
        );

        const tdActions =
          document.createElement(
            "td"
          );

        tdActions.setAttribute(
          "data-label",
          "Acciones"
        );

        const removeButton =
          document.createElement(
            "button"
          );

        removeButton.className =
          "btn-outline";

        removeButton.type =
          "button";

        removeButton.dataset.cartRemove =
          "1";

        removeButton.innerHTML =
          `
            <i class="fas fa-trash"></i>
            Quitar
          `;

        removeButton.style.width =
          isTinyScreen()
            ? "100%"
            : "";

        removeButton.addEventListener(
          "click",
          () => {
            CART.splice(
              index,
              1
            );

            renderCart();
          }
        );

        tdActions.appendChild(
          removeButton
        );

        tr.appendChild(
          tdActions
        );

        cartTableBody.appendChild(
          tr
        );
      }
    );

    updateCartSummary();

    syncCartInputsLayout();
  }

  function clearCart(
    confirmFirst = true
  ) {
    if (
      !CART.length
    ) {
      return;
    }

    if (
      confirmFirst
    ) {
      Swal.fire({
        title:
          "¿Limpiar carrito?",

        icon:
          "question",

        showCancelButton:
          true,

        confirmButtonText:
          "Sí, limpiar",

        cancelButtonText:
          "Cancelar"
      }).then(
        result => {
          if (
            result.isConfirmed
          ) {
            CART =
              [];

            renderCart();
          }
        }
      );

      return;
    }

    CART =
      [];

    renderCart();
  }

  function serializeCart() {
    return CART.map(
      item => ({
        productId:
          item.productId,

        name:
          item.name,

        price:
          Number(
            item.price ||
              0
          ),

        quantity:
          Number(
            item.quantity ||
              0
          ),

        mode:
          item.mode,

        unitsPerBox:
          Number(
            item.unitsPerBox ||
              1
          ),

        unitsTotal:
          Number(
            item.unitsTotal ||
              0
          ),

        total:
          Number(
            item.total ||
              0
          )
      })
    );
  }

  /*
   * ============================================================
   * MOVIMIENTOS
   * ============================================================
   */

  function createMovementObject({
    productId,
    productName,
    tipoMovimiento,
    referenciaLibro,
    numeroDocumento,
    entrada,
    salida,
    saldoAnterior,
    saldoActual,
    detalle,
    userName,
    userId
  }) {
    return {
      productId,

      productName:
        productName ||
        "",

      tipoMovimiento,

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
        numberOrZero(
          entrada
        ),

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

      detalle:
        detalle ||
        "",

      userId:
        userId ||
        null,

      userName:
        userName ||
        null,

      createdAt:
        firebase.firestore
          .FieldValue
          .serverTimestamp(),

      ...getMovementLocalPayload()
    };
  }

  /*
   * ============================================================
   * FINALIZAR VENTA
   * ============================================================
   */

  async function finalizeSale() {
    if (
      isFinalizingSale
    ) {
      return;
    }

    if (
      !CART.length
    ) {
      Swal.fire(
        "Carrito vacío",
        "Agrega productos al carrito antes de finalizar.",
        "info"
      );

      return;
    }

    if (
      !currentLocalId
    ) {
      Swal.fire(
        "Sin local",
        "No se pudo identificar el local activo.",
        "error"
      );

      return;
    }

    /*
     * Validar la fecha/hora ANTES de abrir la confirmación.
     */
    const saleDateTimeValidation =
      validateCartSaleDateTime();

    if (
      !saleDateTimeValidation.valid
    ) {
      await Swal.fire(
        "Fecha u hora requerida",
        saleDateTimeValidation.message,
        "warning"
      );

      return;
    }

    const saleDateTime =
      saleDateTimeValidation.dateTime;

    const referenciaLibro =
      String(
        referenciaLibroInput
          ? referenciaLibroInput.value
          : ""
      ).trim() ||
      "venta";

    isFinalizingSale =
      true;

    btnFinalize.disabled =
      true;

    btnSaveDraft.disabled =
      true;

    btnAddToCart.disabled =
      true;

    btnClearCart.disabled =
      true;

    if (
      productSelect
    ) {
      productSelect.disabled =
        true;
    }

    if (
      saleModeSelect
    ) {
      saleModeSelect.disabled =
        true;
    }

    if (
      saleQuantityInput
    ) {
      saleQuantityInput.disabled =
        true;
    }

    if (
      boxPriceInput
    ) {
      boxPriceInput.disabled =
        true;
    }

    if (
      referenciaLibroInput
    ) {
      referenciaLibroInput.disabled =
        true;
    }

    if (
      cartSaleDateInput
    ) {
      cartSaleDateInput.disabled =
        true;
    }

    if (
      cartSaleTimeInput
    ) {
      cartSaleTimeInput.disabled =
        true;
    }

    try {
      const storedUserName =
        getStoredUserName();

      const userId =
        auth.currentUser
          ? auth.currentUser.uid
          : null;

      const localPayload =
        getMovementLocalPayload();

      const ventaRef =
        db
          .collection(
            "ventas"
          )
          .doc();

      const total =
        CART.reduce(
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

      /*
       * Firestore Timestamp basado en la fecha/hora
       * seleccionada por el usuario.
       */
      const selectedSaleTimestamp =
        firebase.firestore.Timestamp.fromDate(
          saleDateTime
        );

      const summaryHtml =
        CART
          .map(
            item =>
              `
                <div
                  style="
                    display:flex;
                    justify-content:space-between;
                    gap:12px;
                  "
                >
                  <span>
                    ${escapeHtml(
                      item.name
                    )}

                    x${item.quantity}

                    ${
                      item.mode ===
                      "box"
                        ? "(cajas)"
                        : "(unid.)"
                    }
                  </span>

                  <strong>
                    ${currency(
                      item.total
                    )}
                  </strong>
                </div>
              `
          )
          .join("");

      const response =
        await Swal.fire({
          title:
            "Finalizar venta",

          html:
            `
              <div style="text-align:left;">

                ${summaryHtml}

                <hr>

                <div
                  style="
                    display:flex;
                    justify-content:space-between;
                    gap:12px;
                    margin-top:6px;
                  "
                >
                  <strong>
                    Fecha:
                  </strong>

                  <strong>
                    ${escapeHtml(
                      saleDateTime.toLocaleDateString()
                    )}
                  </strong>
                </div>

                <div
                  style="
                    display:flex;
                    justify-content:space-between;
                    gap:12px;
                    margin-top:6px;
                  "
                >
                  <strong>
                    Hora:
                  </strong>

                  <strong>
                    ${escapeHtml(
                      saleDateTime.toLocaleTimeString(
                        [],
                        {
                          hour:
                            "2-digit",

                          minute:
                            "2-digit"
                        }
                      )
                    )}
                  </strong>
                </div>

                <div
                  style="
                    display:flex;
                    justify-content:space-between;
                    gap:12px;
                    margin-top:6px;
                  "
                >
                  <strong>
                    Referencia:
                  </strong>

                  <strong>
                    ${escapeHtml(
                      referenciaLibro
                    )}
                  </strong>
                </div>

                <div
                  style="
                    display:flex;
                    justify-content:space-between;
                    margin-top:6px;
                  "
                >
                  <strong>
                    Total:
                  </strong>

                  <strong>
                    ${currency(
                      total
                    )}
                  </strong>
                </div>

              </div>
            `,

          showCancelButton:
            true,

          confirmButtonText:
            "Confirmar venta",

          cancelButtonText:
            "Cancelar",

          width:
            500
        });

      if (
        !response.isConfirmed
      ) {
        return;
      }

      /*
       * Agrupar por producto para no leer
       * el mismo documento dos veces.
       */
      const unitsByProduct =
        {};

      CART.forEach(
        item => {
          const productId =
            String(
              item.productId
            );

          unitsByProduct[
            productId
          ] =
            (
              unitsByProduct[
                productId
              ] ||
              0
            ) +
            numberOrZero(
              item.unitsTotal
            );
        }
      );

      const productIds =
        Object.keys(
          unitsByProduct
        );

      const localCart =
        serializeCart();

      /*
       * Mantener exactamente el valor seleccionado
       * para actualizar la caché local.
       */
      const localCreatedTimestamp =
        selectedSaleTimestamp;

      await db.runTransaction(
        async transaction => {
          /*
           * ==================================================
           * LECTURAS
           * ==================================================
           */

          const productSnapshots =
            {};

          for (
            const productId
              of productIds
          ) {
            const productRef =
              db
                .collection(
                  "productos"
                )
                .doc(
                  productId
                );

            const productSnapshot =
              await transaction.get(
                productRef
              );

            if (
              !productSnapshot.exists
            ) {
              throw new Error(
                `El producto ${productId} no existe.`
              );
            }

            const data =
              productSnapshot.data() ||
              {};

            if (
              !matchesCurrentLocal(
                data
              )
            ) {
              throw new Error(
                `El producto ${
                  data.name ||
                  productId
                } no pertenece al local actual.`
              );
            }

            productSnapshots[
              productId
            ] = {
              ref:
                productRef,

              data
            };
          }

          /*
           * ==================================================
           * ESCRITURAS DE INVENTARIO
           * ==================================================
           */

          productIds.forEach(
            productId => {
              const productInfo =
                productSnapshots[
                  productId
                ];

              const data =
                productInfo.data;

              const unitsToDiscount =
                numberOrZero(
                  unitsByProduct[
                    productId
                  ]
                );

              const currentUnits =
                Number.isFinite(
                  Number(
                    data.stockCurrentUnits
                  )
                )
                  ? Math.max(
                      0,
                      numberOrZero(
                        data.stockCurrentUnits
                      )
                    )
                  : Number.isFinite(
                      Number(
                        data.quantity
                      )
                    )
                    ? Math.max(
                        0,
                        numberOrZero(
                          data.quantity
                        )
                      )
                    : Number.isFinite(
                        Number(
                          data.stockBaseUnits
                        )
                      )
                      ? Math.max(
                          0,
                          numberOrZero(
                            data.stockBaseUnits
                          )
                        )
                      : 0;

              if (
                unitsToDiscount >
                currentUnits
              ) {
                throw new Error(
                  `Stock insuficiente para "${data.name || productId}". Disponible: ${currentUnits}`
                );
              }

              const remainingUnits =
                currentUnits -
                unitsToDiscount;

              const unitsPerBox =
                Math.max(
                  1,
                  numberOrZero(
                    data.unitsPerBox
                  )
                );

              transaction.update(
                productInfo.ref,
                {
                  quantity:
                    remainingUnits,

                  stockCurrentUnits:
                    remainingUnits,

                  boxes:
                    Math.floor(
                      remainingUnits /
                        unitsPerBox
                    ),

                  updatedAt:
                    firebase.firestore
                      .FieldValue
                      .serverTimestamp()
                }
              );

              const movementRef =
                db
                  .collection(
                    "stock_movimientos"
                  )
                  .doc();

              transaction.set(
                movementRef,
                createMovementObject({
                  productId,

                  productName:
                    data.name ||
                    productId,

                  tipoMovimiento:
                    "salida",

                  referenciaLibro,

                  numeroDocumento:
                    ventaRef.id,

                  entrada:
                    0,

                  salida:
                    unitsToDiscount,

                  saldoAnterior:
                    currentUnits,

                  saldoActual:
                    remainingUnits,

                  detalle:
                    `Salida por venta ${ventaRef.id} - Referencia: ${referenciaLibro}`,

                  userName:
                    storedUserName,

                  userId
                })
              );
            }
          );

          /*
           * ==================================================
           * ESCRITURA DE LA VENTA
           * ==================================================
           */

          transaction.set(
            ventaRef,
            {
              products:
                localCart,

              total:
                Number(
                  total
                ),

              referenciaLibro,

              /*
               * Ahora representa la FECHA Y HORA DE LA VENTA
               * seleccionada por el usuario.
               */
              createdAt:
                selectedSaleTimestamp,

              userId,

              userName:
                storedUserName ||
                null,

              ...localPayload
            }
          );
        }
      );

      /*
       * ========================================================
       * ACTUALIZAR CACHÉS LOCALES
       * ========================================================
       */

      productIds.forEach(
        productId => {
          const product =
            PRODUCTS_CACHE[
              productId
            ];

          if (!product) {
            return;
          }

          const unitsToDiscount =
            numberOrZero(
              unitsByProduct[
                productId
              ]
            );

          const currentUnits =
            getAvailableUnits(
              product
            );

          const nextUnits =
            Math.max(
              0,
              currentUnits -
                unitsToDiscount
            );

          const unitsPerBox =
            normalizeUnitsPerBox(
              product
            );

          product.quantity =
            nextUnits;

          product.stockCurrentUnits =
            nextUnits;

          product.boxes =
            Math.floor(
              nextUnits /
                unitsPerBox
            );
        }
      );

      SALES_CACHE[
        ventaRef.id
      ] = {
        id:
          ventaRef.id,

        products:
          localCart,

        total:
          Number(
            total
          ),

        referenciaLibro,

        createdAt:
          localCreatedTimestamp,

        userId,

        userName:
          storedUserName ||
          null,

        ...localPayload
      };

      MONTHLY_SOLD_UNITS =
        aggregateMonthlySalesFromCache();

      refreshProductSelectText();

      syncModeFromProduct();

      renderSalesTable();

      CART =
        [];

      if (
        referenciaLibroInput
      ) {
        referenciaLibroInput.value =
          "";
      }

      /*
       * Después de guardar una venta se vuelve a colocar
       * la fecha y hora actuales como valor predeterminado
       * para la próxima venta.
       */
      setCartSaleDateTime(
        new Date()
      );

      renderCart();

      await Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "success",

        title:
          "Venta registrada",

        showConfirmButton:
          false,

        timer:
          1500
      });
    } catch (
      err
    ) {
      console.error(
        "Error finalizando venta:",
        err
      );

      await Swal.fire(
        "Error",
        err.message ||
          "No se pudo finalizar la venta.",
        "error"
      );
    } finally {
      isFinalizingSale =
        false;

      btnFinalize.disabled =
        CART.length ===
        0;

      btnSaveDraft.disabled =
        false;

      btnAddToCart.disabled =
        false;

      btnClearCart.disabled =
        false;

      if (
        productSelect
      ) {
        productSelect.disabled =
          false;
      }

      if (
        saleModeSelect
      ) {
        saleModeSelect.disabled =
          false;
      }

      if (
        saleQuantityInput
      ) {
        saleQuantityInput.disabled =
          false;
      }

      if (
        boxPriceInput
      ) {
        boxPriceInput.disabled =
          false;
      }

      if (
        referenciaLibroInput
      ) {
        referenciaLibroInput.disabled =
          false;
      }

      if (
        cartSaleDateInput
      ) {
        cartSaleDateInput.disabled =
          false;
      }

      if (
        cartSaleTimeInput
      ) {
        cartSaleTimeInput.disabled =
          false;
      }

      refreshSaleModeUI();
    }
  }

  /*
   * ============================================================
   * BORRADORES
   * ============================================================
   */

  async function saveDraft() {
    if (
      isSavingDraft
    ) {
      return;
    }

    if (
      !CART.length
    ) {
      Swal.fire(
        "Carrito vacío",
        "Agrega productos antes de guardar un borrador.",
        "info"
      );

      return;
    }

    if (
      !currentLocalId
    ) {
      Swal.fire(
        "Sin local",
        "No se pudo identificar el local activo.",
        "error"
      );

      return;
    }

    const saleDateTimeValidation =
      validateCartSaleDateTime();

    if (
      !saleDateTimeValidation.valid
    ) {
      await Swal.fire(
        "Fecha u hora requerida",
        saleDateTimeValidation.message,
        "warning"
      );

      return;
    }

    const saleDateTime =
      saleDateTimeValidation.dateTime;

    isSavingDraft =
      true;

    btnSaveDraft.disabled =
      true;

    try {
      const storedUserName =
        getStoredUserName();

      const localPayload =
        getMovementLocalPayload();

      const referenciaLibro =
        String(
          referenciaLibroInput
            ? referenciaLibroInput.value
            : ""
        ).trim() ||
        "venta";

      const draft = {
        products:
          serializeCart(),

        total:
          CART.reduce(
            (
              sum,
              item
            ) =>
              sum +
              numberOrZero(
                item.total
              ),
            0
          ),

        referenciaLibro,

        /*
         * El borrador también conserva la fecha/hora
         * que el usuario haya seleccionado.
         */
        createdAt:
          firebase.firestore.Timestamp.fromDate(
            saleDateTime
          ),

        userId:
          auth.currentUser
            ? auth.currentUser.uid
            : null,

        userName:
          storedUserName ||
          null,

        ...localPayload
      };

      await db
        .collection(
          "ventas_borrador"
        )
        .add(
          draft
        );

      await Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "success",

        title:
          "Borrador guardado",

        showConfirmButton:
          false,

        timer:
          1400
      });
    } catch (
      err
    ) {
      console.error(
        "Error guardando borrador:",
        err
      );

      await Swal.fire(
        "Error",
        "No se pudo guardar el borrador.",
        "error"
      );
    } finally {
      isSavingDraft =
        false;

      btnSaveDraft.disabled =
        false;
    }
  }

  /*
   * ============================================================
   * NORMALIZACIÓN DE VENTAS
   * ============================================================
   */

  function getOldSaleUnitsByProduct(
    sale
  ) {
    const result =
      {};

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

        const units =
          getSaleUnitsForProduct(
            product
          );

        result[
          productId
        ] =
          (
            result[
              productId
            ] ||
            0
          ) +
          units;
      }
    );

    return result;
  }

  function normalizeSaleProducts(
    products
  ) {
    return (
      Array.isArray(
        products
      )
        ? products
        : []
    ).map(
      product => {
        const productId =
          getSaleProductId(
            product
          );

        const cachedProduct =
          PRODUCTS_CACHE[
            productId
          ];

        const mode =
          String(
            product.mode ||
              product.saleMode ||
              product.saleType ||
              ""
          ).toLowerCase() ===
          "box"
            ? "box"
            : "unit";

        const unitsPerBox =
          Math.max(
            1,
            numberOrZero(
              product.unitsPerBox ||
                (
                  cachedProduct
                    ? cachedProduct.unitsPerBox
                    : 1
                )
            )
          );

        const quantity =
          Math.max(
            1,
            numberOrZero(
              product.quantity
            )
          );

        const price =
          Math.max(
            0,
            numberOrZero(
              product.price
            )
          );

        const unitsTotal =
          mode ===
          "box"
            ? quantity *
              unitsPerBox
            : quantity;

        return {
          productId,

          name:
            String(
              product.name ||
                (
                  cachedProduct
                    ? cachedProduct.name
                    : ""
                )
            ),

          price,

          quantity,

          mode,

          unitsPerBox,

          unitsTotal,

          total:
            quantity *
            price
        };
      }
    );
  }

  /*
   * ============================================================
   * TABLA DE VENTAS
   * ============================================================
   */

  function ensureSalesTableHeader() {
    if (
      !salesTable
    ) {
      return;
    }

    let thead =
      salesTable.querySelector(
        "thead"
      );

    if (!thead) {
      thead =
        document.createElement(
          "thead"
        );

      salesTable.insertBefore(
        thead,
        salesTable.firstChild
      );
    }

    let tr =
      thead.querySelector(
        "tr"
      );

    if (!tr) {
      tr =
        document.createElement(
          "tr"
        );

      thead.appendChild(
        tr
      );
    }

    const headers = [
      "Productos",
      "Unidades",
      "Total",
      "Referencia",
      "Usuario",
      "Fecha",
      "Hora",
      "Acciones"
    ];

    tr.innerHTML =
      headers
        .map(
          header =>
            `<th>${escapeHtml(
              header
            )}</th>`
        )
        .join("");
  }

  function buildProductsReadonlyHtml(
    saleId,
    products
  ) {
    if (
      !products.length
    ) {
      return `
        <div
          class="sale-products-readonly"
          data-sale-id="${escapeAttribute(
            saleId
          )}"
        >
          -
        </div>
      `;
    }

    return `
      <div
        class="sale-products-readonly"
        data-sale-id="${escapeAttribute(
          saleId
        )}"
        style="
          display:flex;
          flex-direction:column;
          gap:2px;
        "
      >
        ${
          products
            .map(
              product =>
                `
                  <div>
                    ${escapeHtml(
                      product.name
                    )}

                    x${
                      product.quantity
                    }

                    ${
                      product.mode ===
                      "box"
                        ? "(cajas)"
                        : "(unid.)"
                    }
                  </div>
                `
            )
            .join("")
        }
      </div>
    `;
  }

  function buildReferenceEditorHtml(
    saleId,
    reference
  ) {
    if (
      !isAdministrator()
    ) {
      return escapeHtml(
        reference ||
          "venta"
      );
    }

    return `
      <input
        type="text"
        class="inline-sale-reference"
        data-sale-id="${escapeAttribute(
          saleId
        )}"
        value="${escapeAttribute(
          reference ||
            "venta"
        )}"
        maxlength="100"
        autocomplete="off"
        style="
          width:100%;
          min-width:100px;
        "
      >
    `;
  }

  function buildDateEditorHtml(
    saleId,
    createdAt
  ) {
    const value =
      getLocalDateInputValue(
        createdAt
      );

    if (
      !isAdministrator()
    ) {
      return escapeHtml(
        formatDateOnly(
          createdAt
        )
      );
    }

    return `
      <input
        type="date"
        class="inline-sale-date"
        data-sale-id="${escapeAttribute(
          saleId
        )}"
        value="${escapeAttribute(
          value
        )}"
        title="Fecha de la venta"
        style="
          width:100%;
          min-width:125px;
        "
      >
    `;
  }

  function buildTimeEditorHtml(
    saleId,
    createdAt
  ) {
    const value =
      getLocalTimeInputValue(
        createdAt
      );

    if (
      !isAdministrator()
    ) {
      return escapeHtml(
        formatTimeOnly(
          createdAt
        )
      );
    }

    return `
      <input
        type="time"
        class="inline-sale-time"
        data-sale-id="${escapeAttribute(
          saleId
        )}"
        value="${escapeAttribute(
          value
        )}"
        title="Hora de la venta"
        style="
          width:100%;
          min-width:95px;
        "
      />
    `;
  }

  function buildDeleteButtonHtml(
    saleId
  ) {
    if (
      !isAdministrator()
    ) {
      return `
        <span class="sale-no-actions">
          —
        </span>
      `;
    }

    return `
      <button
        type="button"
        class="btn-outline btn-delete-sale"
        data-sale-id="${escapeAttribute(
          saleId
        )}"
        title="Eliminar venta"
      >
        <i class="fas fa-trash"></i>
        Eliminar
      </button>
    `;
  }

  function ensureSalesDataTable() {
    if (
      salesDataTable
    ) {
      return salesDataTable;
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

    ensureSalesTableHeader();

    salesDataTable =
      $("#salesTable")
        .DataTable({
          data: [],

          columns: [
            {
              title:
                "Productos",

              orderable:
                false
            },

            {
              title:
                "Unidades"
            },

            {
              title:
                "Total"
            },

            {
              title:
                "Referencia",

              orderable:
                false
            },

            {
              title:
                "Usuario"
            },

            {
              title:
                "Fecha",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? data.display
                    : data.sort
            },

            {
              title:
                "Hora",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? data.display
                    : data.sort
            },

            {
              title:
                "Acciones",

              orderable:
                false,

              searchable:
                false,

              className:
                "dt-body-center"
            }
          ],

          pageLength:
            5,

          lengthMenu:
            [
              5,
              10,
              25,
              50
            ],

          scrollY:
            "260px",

          scrollCollapse:
            true,

          scrollX:
            true,

          autoWidth:
            false,

          orderMulti:
            true,

          order:
            [
              [
                5,
                "desc"
              ],

              [
                6,
                "desc"
              ]
            ],

          dom:
            '<"sales-dt-top"lf>rt<"sales-dt-bottom"ip><"clear">',

          language: {
            search:
              "",

            searchPlaceholder:
              "Buscar ventas...",

            lengthMenu:
              "Mostrar _MENU_",

            info:
              "Mostrando _START_ a _END_ de _TOTAL_",

            infoEmpty:
              "No hay ventas",

            infoFiltered:
              "(filtrado de _MAX_ ventas)",

            paginate: {
              next:
                "›",

              previous:
                "‹"
            },

            zeroRecords:
              "No hay ventas",

            emptyTable:
              "No hay ventas"
          },

          columnDefs: [
            {
              targets:
                [
                  1,
                  2,
                  7
                ],

              className:
                "dt-body-center"
            },

            {
              targets:
                [
                  0,
                  3,
                  4,
                  5,
                  6
                ],

              className:
                "dt-body-left"
            }
          ]
        });

    return salesDataTable;
  }

  function renderSalesFallback(
    dataSet
  ) {
    if (
      !salesTable
    ) {
      return;
    }

    ensureSalesTableHeader();

    const tbody =
      salesTable.querySelector(
        "tbody"
      );

    if (!tbody) {
      return;
    }

    tbody.innerHTML =
      "";

    if (
      !dataSet.length
    ) {
      tbody.innerHTML =
        `
          <tr>
            <td colspan="8">
              No hay ventas registradas.
            </td>
          </tr>
        `;

      return;
    }

    dataSet.forEach(
      row => {
        const tr =
          document.createElement(
            "tr"
          );

        row.forEach(
          cell => {
            const td =
              document.createElement(
                "td"
              );

            if (
              cell &&
              typeof cell ===
                "object" &&
              cell.display !==
                undefined
            ) {
              td.innerHTML =
                String(
                  cell.display
                );
            } else {
              td.innerHTML =
                String(
                  cell ??
                    ""
                );
            }

            tr.appendChild(
              td
            );
          }
        );

        tbody.appendChild(
          tr
        );
      }
    );
  }

  function buildSalesDataSet() {
    const entries =
      Object.entries(
        SALES_CACHE
      );

    entries.sort(
      (
        a,
        b
      ) =>
        (
          getDateTimeMillis(
            b[1].createdAt
          ) || 0
        ) -
        (
          getDateTimeMillis(
            a[1].createdAt
          ) || 0
        )
    );

    return entries.map(
      (
        [
          saleId,
          sale
        ]
      ) => {
        const products =
          normalizeSaleProducts(
            sale.products
          );

        const units =
          products.reduce(
            (
              sum,
              product
            ) =>
              sum +
              numberOrZero(
                product.unitsTotal
              ),
            0
          );

        const total =
          numberOrZero(
            sale.total
          );

        const dateSort =
          getDateTimeMillis(
            sale.createdAt
          ) || 0;

        return [
          buildProductsReadonlyHtml(
            saleId,
            products
          ),

          String(
            units
          ),

          `
            <strong>
              ${currency(
                total
              )}
            </strong>
          `,

          buildReferenceEditorHtml(
            saleId,
            sale.referenciaLibro ||
              "venta"
          ),

          escapeHtml(
            sale.userName ||
              "-"
          ),

          {
            display:
              buildDateEditorHtml(
                saleId,
                sale.createdAt
              ),

            sort:
              dateSort
          },

          {
            display:
              buildTimeEditorHtml(
                saleId,
                sale.createdAt
              ),

            sort:
              dateSort
          },

          buildDeleteButtonHtml(
            saleId
          )
        ];
      }
    );
  }

  function renderSalesTable() {
    ensureSalesTableHeader();

    const dataSet =
      buildSalesDataSet();

    const dataTable =
      ensureSalesDataTable();

    if (
      dataTable
    ) {
      const currentSearch =
        $("#salesTable_filter input")
          .val() ||
        "";

      dataTable.clear();

      dataTable.rows.add(
        dataSet
      );

      dataTable.draw(
        false
      );

      if (
        currentSearch
      ) {
        dataTable.search(
          currentSearch
        ).draw(
          false
        );
      }
    } else {
      renderSalesFallback(
        dataSet
      );
    }

    bindInlineSaleEvents();
  }

  /*
   * ============================================================
   * EVENTOS DE EDICIÓN
   * ============================================================
   */

  function scheduleInlineSaleSave(
    saleId
  ) {
    if (
      !saleId
    ) {
      return;
    }

    if (
      saleSaveTimers[
        saleId
      ]
    ) {
      clearTimeout(
        saleSaveTimers[
          saleId
        ]
      );
    }

    saleSaveTimers[
      saleId
    ] =
      setTimeout(
        () => {
          delete saleSaveTimers[
            saleId
          ];

          saveInlineSale(
            saleId
          );
        },
        350
      );
  }

  function bindInlineSaleEvents() {
    document
      .querySelectorAll(
        ".inline-sale-reference, .inline-sale-date, .inline-sale-time"
      )
      .forEach(
        input => {
          if (
            input.dataset.bound ===
            "1"
          ) {
            return;
          }

          input.dataset.bound =
            "1";

          input.addEventListener(
            "blur",
            () => {
              scheduleInlineSaleSave(
                input.dataset.saleId
              );
            }
          );

          input.addEventListener(
            "keydown",
            event => {
              if (
                event.key !==
                "Enter"
              ) {
                return;
              }

              event.preventDefault();

              const saleId =
                input.dataset.saleId;

              if (
                !saleId
              ) {
                return;
              }

              if (
                saleSaveTimers[
                  saleId
                ]
              ) {
                clearTimeout(
                  saleSaveTimers[
                    saleId
                  ]
                );

                delete saleSaveTimers[
                  saleId
                ];
              }

              saveInlineSale(
                saleId
              );
            }
          );
        }
      );

    document
      .querySelectorAll(
        ".btn-delete-sale"
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
            () => {
              const saleId =
                button.dataset.saleId;

              if (
                saleId
              ) {
                deleteSale(
                  saleId
                );
              }
            }
          );
        }
      );
  }

  /*
   * ============================================================
   * EDICIÓN
   * ============================================================
   */

  async function saveInlineSale(
    saleId
  ) {
    if (
      !isAdministrator()
    ) {
      return;
    }

    if (
      editingSaleIds.has(
        saleId
      ) ||
      deletingSaleIds.has(
        saleId
      )
    ) {
      return;
    }

    const sale =
      SALES_CACHE[
        saleId
      ];

    if (!sale) {
      return;
    }

    if (
      !matchesCurrentLocal(
        sale
      )
    ) {
      await Swal.fire(
        "Acceso denegado",
        "La venta no pertenece al local actual.",
        "error"
      );

      return;
    }

    const referenceInput =
      document.querySelector(
        `.inline-sale-reference[data-sale-id="${CSS.escape(
          saleId
        )}"]`
      );

    const dateInput =
      document.querySelector(
        `.inline-sale-date[data-sale-id="${CSS.escape(
          saleId
        )}"]`
      );

    const timeInput =
      document.querySelector(
        `.inline-sale-time[data-sale-id="${CSS.escape(
          saleId
        )}"]`
      );

    const newReference =
      String(
        referenceInput
          ? referenceInput.value
          : (
              sale.referenciaLibro ||
              "venta"
            )
      ).trim() ||
      "venta";

    const oldDate =
      getLocalDateInputValue(
        sale.createdAt
      );

    const oldTime =
      getLocalTimeInputValue(
        sale.createdAt
      );

    const newDate =
      dateInput
        ? dateInput.value
        : oldDate;

    const newTime =
      timeInput
        ? timeInput.value
        : oldTime;

    const newCreatedAt =
      buildLocalDateTime(
        newDate,
        newTime
      );

    if (
      !newCreatedAt
    ) {
      await Swal.fire(
        "Fecha u hora inválida",
        "La fecha y la hora de la venta no son válidas.",
        "error"
      );

      return;
    }

    const oldReference =
      String(
        sale.referenciaLibro ||
          "venta"
      ).trim();

    const oldCreatedAtMillis =
      getDateTimeMillis(
        sale.createdAt
      );

    const newCreatedAtMillis =
      newCreatedAt.getTime();

    const referenceChanged =
      oldReference !==
      newReference;

    const dateTimeChanged =
      oldCreatedAtMillis !==
      newCreatedAtMillis;

    if (
      !referenceChanged &&
      !dateTimeChanged
    ) {
      return;
    }

    editingSaleIds.add(
      saleId
    );

    try {
      const editorUserName =
        getStoredUserName();

      const editorUserId =
        auth.currentUser
          ? auth.currentUser.uid
          : null;

      const saleRef =
        db
          .collection(
            "ventas"
          )
          .doc(
            saleId
          );

      await db.runTransaction(
        async transaction => {
          const latestSaleSnapshot =
            await transaction.get(
              saleRef
            );

          if (
            !latestSaleSnapshot.exists
          ) {
            throw new Error(
              "La venta ya no existe."
            );
          }

          const latestSale =
            latestSaleSnapshot.data() ||
            {};

          if (
            !matchesCurrentLocal(
              latestSale
            )
          ) {
            throw new Error(
              "La venta no pertenece al local actual."
            );
          }

          const latestReference =
            String(
              latestSale.referenciaLibro ||
                "venta"
            ).trim();

          const finalReference =
            referenceChanged
              ? newReference
              : latestReference;

          const finalCreatedAt =
            dateTimeChanged
              ? newCreatedAt
              : (
                  latestSale.createdAt ||
                  firebase.firestore.Timestamp.fromDate(
                    new Date()
                  )
                );

          transaction.update(
            saleRef,
            {
              referenciaLibro:
                finalReference,

              createdAt:
                finalCreatedAt,

              editedAt:
                firebase.firestore
                  .FieldValue
                  .serverTimestamp(),

              editedBy:
                editorUserId,

              editedByName:
                editorUserName ||
                null,

              ...getMovementLocalPayload()
            }
          );
        }
      );

      sale.referenciaLibro =
        newReference;

      sale.createdAt =
        firebase.firestore.Timestamp.fromDate(
          newCreatedAt
        );

      MONTHLY_SOLD_UNITS =
        aggregateMonthlySalesFromCache();

      renderSalesTable();

      await Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "success",

        title:
          "Venta actualizada",

        showConfirmButton:
          false,

        timer:
          1200
      });
    } catch (
      error
    ) {
      console.error(
        "Error actualizando venta:",
        error
      );

      await Swal.fire(
        "Error",
        error.message ||
          "No se pudo actualizar la venta.",
        "error"
      );
    } finally {
      editingSaleIds.delete(
        saleId
      );
    }
  }

  /*
   * ============================================================
   * ELIMINAR VENTA
   * ============================================================
   */

  async function deleteSale(
    saleId
  ) {
    if (
      !isAdministrator()
    ) {
      await Swal.fire(
        "Acceso denegado",
        "Solo un administrador puede eliminar ventas.",
        "error"
      );

      return;
    }

    if (
      deletingSaleIds.has(
        saleId
      )
    ) {
      return;
    }

    if (
      saleSaveTimers[
        saleId
      ]
    ) {
      clearTimeout(
        saleSaveTimers[
          saleId
        ]
      );

      delete saleSaveTimers[
        saleId
      ];
    }

    const sale =
      SALES_CACHE[
        saleId
      ];

    if (!sale) {
      await Swal.fire(
        "Error",
        "No se encontró la venta.",
        "error"
      );

      return;
    }

    if (
      !matchesCurrentLocal(
        sale
      )
    ) {
      await Swal.fire(
        "Acceso denegado",
        "La venta no pertenece al local actual.",
        "error"
      );

      return;
    }

    const products =
      normalizeSaleProducts(
        sale.products
      );

    if (
      !products.length
    ) {
      await Swal.fire(
        "Error",
        "La venta no contiene productos válidos.",
        "error"
      );

      return;
    }

    const confirmation =
      await Swal.fire({
        title:
          "¿Eliminar venta?",

        text:
          "La venta será eliminada y las unidades vendidas serán devueltas al inventario.",

        icon:
          "warning",

        showCancelButton:
          true,

        confirmButtonText:
          "Sí, eliminar",

        cancelButtonText:
          "Cancelar",

        confirmButtonColor:
          "#d33"
      });

    if (
      !confirmation.isConfirmed
    ) {
      return;
    }

    deletingSaleIds.add(
      saleId
    );

    try {
      const userName =
        getStoredUserName();

      const userId =
        auth.currentUser
          ? auth.currentUser.uid
          : null;

      const saleRef =
        db
          .collection(
            "ventas"
          )
          .doc(
            saleId
          );

      const unitsByProduct =
        getOldSaleUnitsByProduct(
          {
            products
          }
        );

      const productIds =
        Object.keys(
          unitsByProduct
        );

      if (
        !productIds.length
      ) {
        throw new Error(
          "No se pudieron determinar las unidades consumidas por la venta."
        );
      }

      await db.runTransaction(
        async transaction => {
          const productSnapshots =
            {};

          for (
            const productId
              of productIds
          ) {
            const productRef =
              db
                .collection(
                  "productos"
                )
                .doc(
                  productId
                );

            const productSnapshot =
              await transaction.get(
                productRef
              );

            if (
              !productSnapshot.exists
            ) {
              throw new Error(
                `El producto ${productId} no existe.`
              );
            }

            const productData =
              productSnapshot.data() ||
              {};

            if (
              !matchesCurrentLocal(
                productData
              )
            ) {
              throw new Error(
                `El producto ${
                  productData.name ||
                  productId
                } no pertenece al local actual.`
              );
            }

            productSnapshots[
              productId
            ] = {
              ref:
                productRef,

              data:
                productData
            };
          }

          productIds.forEach(
            productId => {
              const unitsToReturn =
                numberOrZero(
                  unitsByProduct[
                    productId
                  ]
                );

              if (
                unitsToReturn <=
                0
              ) {
                return;
              }

              const productInfo =
                productSnapshots[
                  productId
                ];

              const data =
                productInfo.data;

              const currentStock =
                Number.isFinite(
                  Number(
                    data.stockCurrentUnits
                  )
                )
                  ? Math.max(
                      0,
                      numberOrZero(
                        data.stockCurrentUnits
                      )
                    )
                  : Number.isFinite(
                      Number(
                        data.quantity
                      )
                    )
                    ? Math.max(
                        0,
                        numberOrZero(
                          data.quantity
                        )
                      )
                    : Number.isFinite(
                        Number(
                          data.stockBaseUnits
                        )
                      )
                      ? Math.max(
                          0,
                          numberOrZero(
                            data.stockBaseUnits
                          )
                        )
                      : 0;

              const resultingStock =
                currentStock +
                unitsToReturn;

              const unitsPerBox =
                Math.max(
                  1,
                  numberOrZero(
                    data.unitsPerBox
                  )
                );

              transaction.update(
                productInfo.ref,
                {
                  quantity:
                    resultingStock,

                  stockCurrentUnits:
                    resultingStock,

                  boxes:
                    Math.floor(
                      resultingStock /
                        unitsPerBox
                    ),

                  updatedAt:
                    firebase.firestore
                      .FieldValue
                      .serverTimestamp()
                }
              );

              const movementRef =
                db
                  .collection(
                    "stock_movimientos"
                  )
                  .doc();

              transaction.set(
                movementRef,
                {
                  productId,

                  productName:
                    data.name ||
                    productId,

                  tipoMovimiento:
                    "eliminacion_venta",

                  movimiento:
                    "entrada",

                  referenciaLibro:
                    sale.referenciaLibro ||
                    "venta",

                  numeroDocumento:
                    saleId,

                  entrada:
                    unitsToReturn,

                  salida:
                    0,

                  saldoAnterior:
                    currentStock,

                  saldoActual:
                    resultingStock,

                  diferencia:
                    unitsToReturn,

                  detalle:
                    `Devolución de ${unitsToReturn} unidades por eliminación de venta ${saleId}.`,

                  userId,

                  userName:
                    userName ||
                    null,

                  createdAt:
                    firebase.firestore
                      .FieldValue
                      .serverTimestamp(),

                  ...getMovementLocalPayload()
                }
              );
            }
          );

          transaction.delete(
            saleRef
          );
        }
      );

      productIds.forEach(
        productId => {
          const product =
            PRODUCTS_CACHE[
              productId
            ];

          if (
            !product
          ) {
            return;
          }

          const unitsToReturn =
            numberOrZero(
              unitsByProduct[
                productId
              ]
            );

          const currentStock =
            getAvailableUnits(
              product
            );

          const resultingStock =
            currentStock +
            unitsToReturn;

          const unitsPerBox =
            normalizeUnitsPerBox(
              product
            );

          product.quantity =
            resultingStock;

          product.stockCurrentUnits =
            resultingStock;

          product.boxes =
            Math.floor(
              resultingStock /
                unitsPerBox
            );
        }
      );

      delete SALES_CACHE[
        saleId
      ];

      MONTHLY_SOLD_UNITS =
        aggregateMonthlySalesFromCache();

      refreshProductSelectText();

      syncModeFromProduct();

      renderSalesTable();

      await Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "success",

        title:
          "Venta eliminada",

        text:
          "El inventario fue restaurado.",

        showConfirmButton:
          false,

        timer:
          1600
      });
    } catch (
      error
    ) {
      console.error(
        "Error eliminando venta:",
        error
      );

      await Swal.fire(
        "Error",
        error.message ||
          "No se pudo eliminar la venta.",
        "error"
      );
    } finally {
      deletingSaleIds.delete(
        saleId
      );
    }
  }

  /*
   * ============================================================
   * INICIALIZACIÓN
   * ============================================================
   */

  async function initializeSales(
    user
  ) {
    if (
      salesInitialized
    ) {
      return;
    }

    salesInitialized =
      true;

    try {
      await resolveSalesContext(
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
          currentSalesContext.role ||
            currentSalesContext.position ||
            ""
        );
      }

      ensureSalesTableHeader();

      ensureSalesDataTable();

      initSelect2();

      /*
       * Cargar por defecto la fecha y hora local actuales.
       */
      setCartSaleDateTime(
        new Date()
      );

      await loadInitialSalesData();
    } catch (
      error
    ) {
      salesInitialized =
        false;

      console.error(
        "Error inicializando ventas:",
        error
      );

      await Swal.fire(
        "Error",
        error.message ||
          "No se pudieron cargar las ventas.",
        "error"
      );
    }
  }

  /*
   * ============================================================
   * AUTH
   * ============================================================
   */

  auth.onAuthStateChanged(
    user => {
      const page =
        getCurrentPageFile();

      if (
        !user
      ) {
        if (
          page !==
            "index.html" &&
          page !==
            "login.html"
        ) {
          window.location.href =
            "index.html";
        }

        return;
      }

      initializeSales(
        user
      );
    }
  );

  /*
   * ============================================================
   * EVENTOS DOM
   * ============================================================
   */

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      syncLocalContextFromStorage();

      ensureSalesTableHeader();

      ensureSalesDataTable();

      initSelect2();

      /*
       * Inicializar fecha/hora antes de que el usuario
       * interactúe con el carrito.
       */
      setCartSaleDateTime(
        new Date()
      );

      if (
        productSelect
      ) {
        productSelect.addEventListener(
          "change",
          () => {
            syncModeFromProduct();
          }
        );
      }

      if (
        saleModeSelect
      ) {
        saleModeSelect.addEventListener(
          "change",
          () => {
            refreshSaleModeUI();
          }
        );
      }

      if (
        btnAddToCart
      ) {
        btnAddToCart.addEventListener(
          "click",
          event => {
            event.preventDefault();

            addToCart();
          }
        );
      }

      if (
        btnClearCart
      ) {
        btnClearCart.addEventListener(
          "click",
          event => {
            event.preventDefault();

            clearCart(
              true
            );
          }
        );
      }

      if (
        btnFinalize
      ) {
        btnFinalize.addEventListener(
          "click",
          event => {
            event.preventDefault();

            finalizeSale();
          }
        );
      }

      if (
        btnSaveDraft
      ) {
        btnSaveDraft.addEventListener(
          "click",
          event => {
            event.preventDefault();

            saveDraft();
          }
        );
      }

      window.addEventListener(
        "resize",
        () => {
          syncCartInputsLayout();
        }
      );

      refreshSaleModeUI();

      renderCart();
    }
  );

})();