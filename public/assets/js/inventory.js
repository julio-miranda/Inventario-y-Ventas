// assets/js/inventory.js
//
// INVENTARIO
//
// Características:
//
// - Stock visible = stock actual guardado en el producto.
// - Las ventas del mes se utilizan para métricas,
//   sugerencias y alertas.
// - Administrador/Bodega pueden editar y agregar.
// - Administrador puede eliminar.
// - Proveedor opcional.
// - Producto existente o nuevo.
// - Carga múltiple de productos en una sola operación.
// - Cada línea puede tener:
//      cajas
//      cajas bono
//      unidades
//      unidades bono
//      proveedor
//      costo
//      precio
//      referencia
//      documento
//
// - Producto existente:
//      se suma al stock actual.
//
// - Producto nuevo:
//      se crea con el stock inicial.
//
// - Las cajas bono y unidades bono agregan stock,
//   pero no agregan costo por sí mismas.
//
// - Producto y proveedor se seleccionan mediante
//   comboboxes basados en <input list="...">.
//
// - No se utilizan <select> para productos ni proveedores.
//
// - No usa onSnapshot().
// - No vuelve a leer productos después de guardar.
// - Mantiene los datos actualizados en memoria.
//
// - Las lecturas normales utilizan la caché de sesión
//   administrada por app.js.
//
// - Al registrar productos se genera automáticamente
//   un gasto en la colección "gastos" con el costo total
//   de las cantidades pagadas.
// - Las cantidades bono no generan costo.
// - Una carga múltiple genera un solo gasto consolidado.
//

(function () {
  "use strict";

  if (
    typeof firebase ===
    "undefined"
  ) {
    console.error(
      "Firebase no se ha cargado correctamente."
    );

    if (
      typeof Swal !==
      "undefined"
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
    "productos";

  const SALES_COLLECTION =
    "ventas";

  const MOVEMENTS_COLLECTION =
    "stock_movimientos";

  const PROVIDERS_COLLECTION =
    "proveedores";

  const EXPENSES_COLLECTION =
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

  /*
   * Caché local de movimientos.
   *
   * Estos datos se obtienen de app.js y ya no desde
   * db.collection("stock_movimientos") directamente.
   */
  const productStockMovementsCache =
    new Map();

  const productStockMovementsPending =
    new Map();

  /*
   * ============================================================
   * DOM
   * ============================================================
   */

  const inventoryTbody =
    document.querySelector(
      "#inventoryTable tbody"
    );

  const lowStockPanel =
    document.getElementById(
      "lowStockPanel"
    );

  const searchInput =
    document.getElementById(
      "salesSearch"
    );

  const btnAdd =
    document.getElementById(
      "btnAdd"
    );

  const userGreeting =
    document.querySelectorAll(
      ".userGreeting"
    );

  const totalProductsCard =
    document.getElementById(
      "totalProductsCard"
    );

  const totalValueCard =
    document.getElementById(
      "totalValueCard"
    );

  const lowStockCard =
    document.getElementById(
      "lowStockCard"
    );

  /*
   * ============================================================
   * UTILIDADES
   * ============================================================
   */

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
   * CACHÉ DE SESIÓN - APP.JS
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
    if (
      !user
    ) {
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
   * FECHAS / TIMESTAMPS
   * ============================================================
   */

  function getTimestampMs(
    value
  ) {
    if (
      value ===
        null ||
      value ===
        undefined
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
      value instanceof
      Date
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

    /*
     * Garantizar que la caché esté preparada.
     *
     * En una sesión nueva app.js precargará la información.
     *
     * En una navegación posterior simplemente restaurará
     * sessionStorage.
     */
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

    userGreeting.forEach(
      element => {
        element.textContent =
          `Hola, ${
            context.name ||
            "Usuario"
          } (${context.role || ""})`;
      }
    );

    if (
      btnAdd
    ) {
      btnAdd.style.display =
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
   *
   * Ya NO se realiza:
   *
   * db.collection("proveedores").where(...).get()
   *
   * La información proviene exclusivamente de app.js.
   */

  function normalizeProviderObject(
    provider,
    fallbackId = ""
  ) {
    if (
      !provider
    ) {
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
      String(
        provider.nombre ||
          provider.name ||
          provider.razonSocial ||
          provider.razon_social ||
          provider.nombreProveedor ||
          ""
      ).trim();

    if (
      !id &&
      !nombre
    ) {
      return null;
    }

    return {
      id,
      nombre,
      ...provider
    };
  }

  async function loadInventoryProviders() {
    /*
     * Primero se intenta garantizar que la sesión exista.
     * No se genera una nueva lectura si app.js ya la tiene.
     */
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

          if (
            provider
          ) {
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
            a.nombre
          ).localeCompare(
            normalizeText(
              b.nombre
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

    if (
      !target
    ) {
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

  function findProviderByText(
    value
  ) {
    const text =
      normalizeText(
        value
      );

    if (
      !text
    ) {
      return null;
    }

    return (
      currentProvidersList.find(
        provider =>
          normalizeText(
            provider.nombre
          ) ===
          text
      ) ||
      currentProvidersList.find(
        provider =>
          normalizeText(
            provider.nombre
          ).includes(
            text
          )
      ) ||
      null
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

  function getProviderComboboxHtml(
    inputId,
    listId,
    value = ""
  ) {
    return `
      <input
        id="${inputId}"
        type="text"
        class="inv-combobox batch-provider"
        list="${listId}"
        value="${escapeHtml(
          value
        )}"
        placeholder="Escribe para buscar..."
        autocomplete="off"
      >

      <datalist id="${listId}">
        ${currentProvidersList
          .map(
            provider => `
              <option
                value="${escapeHtml(
                  provider.nombre
                )}"
              ></option>
            `
          )
          .join("")}
      </datalist>
    `;
  }

  /*
   * ============================================================
   * PRODUCTOS / STOCK
   * ============================================================
   */

  function getUnitsPerBox(
    product
  ) {
    const value =
      numberOrZero(
        product?.unitsPerBox
      );

    return value >
      0
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
    if (
      !product
    ) {
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
      direct >
      0
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
      costPerBox >
        0 &&
      unitsPerBox >
        0
    ) {
      return (
        costPerBox /
        unitsPerBox
      );
    }

    return 0;
  }

  /*
   * ============================================================
   * COSTO DE LA ENTRADA
   * ============================================================
   */

  function getEffectiveCostPerBoxForLine(
    line,
    product = null
  ) {
    let costPerBox =
      numberOrZero(
        line?.lastCostPerBox
      );

    if (
      costPerBox <=
        0 &&
      product
    ) {
      costPerBox =
        numberOrZero(
          product.lastCostPerBox
        );
    }

    return Math.max(
      0,
      costPerBox
    );
  }

  function calculateLinePurchaseCost(
    line,
    product = null
  ) {
    if (
      !line
    ) {
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
      Math.max(
        1,
        integerOrZero(
          product
            ? getUnitsPerBox(
                product
              )
            : line.unitsPerBox
        ) ||
          1
      );

    const costPerBox =
      getEffectiveCostPerBoxForLine(
        line,
        product
      );

    const costPerUnit =
      unitsPerBox >
        0
        ? costPerBox /
          unitsPerBox
        : 0;

    const costFromBoxes =
      paidBoxes *
      costPerBox;

    const costFromUnits =
      paidUnits *
      costPerUnit;

    return Math.max(
      0,
      costFromBoxes +
        costFromUnits
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

    const year =
      date.getFullYear();

    const month =
      String(
        date.getMonth() +
          1
      ).padStart(
        2,
        "0"
      );

    const day =
      String(
        date.getDate()
      ).padStart(
        2,
        "0"
      );

    return `${year}-${month}-${day}`;
  }

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

          const costPerBox =
            getEffectiveCostPerBoxForLine(
              line,
              product
            );

          const unitsPerBox =
            Math.max(
              1,
              integerOrZero(
                product
                  ? getUnitsPerBox(
                      product
                    )
                  : line.unitsPerBox
              ) ||
                1
            );

          return [
            `${index + 1}. ${
              line.name ||
              line.productText ||
              "Producto"
            }`,

            `Cajas pagadas: ${paidBoxes}`,

            `Unidades pagadas: ${paidUnits}`,

            `Cajas bono: ${bonusBoxes}`,

            `Unidades bono: ${bonusUnits}`,

            `Unidades por caja: ${unitsPerBox}`,

            `Costo por caja: ${currency(
              costPerBox
            )}`,

            `Costo línea: ${currency(
              cost
            )}`
          ].join(
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
    user
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
                Math.max(
                  1,
                  integerOrZero(
                    product
                      ? getUnitsPerBox(
                          product
                        )
                      : line.unitsPerBox
                  ) ||
                    1
                );

              const totalLineUnits =
                (
                  (
                    integerOrZero(
                      line.boxes
                    ) +
                    integerOrZero(
                      line.bonusBoxes
                    )
                  ) *
                  unitsPerBox
                ) +
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
        ? `Compra de inventario - ${
            lines[0]?.name ||
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
          new Date()
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

      inventoryProductCount:
        productCount,

      inventoryTotalUnits:
        totalUnits
    };

    /*
     * La escritura sí continúa en Firestore.
     */
    await expenseRef.set({
      ...expenseData,

      createdAt:
        firebase.firestore
          .FieldValue
          .serverTimestamp()
    });

    /*
     * La caché recibe una representación localizable.
     * No se introduce FieldValue.serverTimestamp()
     * en sessionStorage.
     */
    upsertSessionDocument(
      EXPENSES_COLLECTION,
      expenseRef.id,
      {
        ...expenseData,

        createdAt:
          Date.now()
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

  /*
   * ============================================================
   * VENTAS
   * ============================================================
   *
   * Ahora recibe documentos de la caché:
   *
   * [
   *   { id, data }
   * ]
   */

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
        now.getMonth() +
          1,
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

        /*
         * Si una venta antigua no tiene createdAt
         * no se incluye en la métrica mensual.
         */
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
                quantity >
                  0
                  ? Math.floor(
                      quantity
                    )
                  : totalUnits >
                      0
                    ? Math.floor(
                        totalUnits /
                          unitsPerBox
                      )
                    : 0;

              soldUnits =
                totalUnits >
                  0
                  ? totalUnits
                  : soldBoxes *
                    unitsPerBox;
            } else if (
              mode ===
              "unit"
            ) {
              soldUnits =
                totalUnits >
                  0
                  ? totalUnits
                  : quantity;
            } else if (
              totalUnits >
              0
            ) {
              soldUnits =
                totalUnits;
            } else if (
              numberOrZero(
                product.boxes
              ) >
              0
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
                ] ||
                0
              ) +
              soldUnits;

            boxesMap[
              productId
            ] =
              (
                boxesMap[
                  productId
                ] ||
                0
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

  /*
   * ============================================================
   * PRODUCTO
   * ============================================================
   */

  function findProductById(
    id
  ) {
    const target =
      String(
        id ||
          ""
      ).trim();

    return (
      currentProductsList.find(
        product =>
          String(
            product.id
          ).trim() ===
          target
      ) ||
      null
    );
  }

  function findProductByText(
    value
  ) {
    const text =
      normalizeText(
        value
      );

    if (
      !text
    ) {
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
          )
      ) ||
      null
    );
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

          const display =
            [
              name,

              code
                ? code
                : "",

              provider
                ? provider
                : ""
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
            >
              ${escapeHtml(
                display
              )}
            </option>
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
      unitsPerBox >
        1
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

    return {
      id:
        product.id,

      name:
        product.name ||
        "—",

      providerName:
        getProductProviderName(
          product
        ),

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
        projection.status
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
      return `
        ${row.stockUnits}
        <br>
        <small>
          ${row.stockBoxes}
          cajas x
          ${row.unitsPerBox}
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
        data-action="edit"
        data-id="${escapeHtml(
          row.id
        )}"
      >
        <i class="fas fa-edit"></i>
        Editar
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
        ${
          isAdmin
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

    inventoryDT =
      $("#inventoryTable")
        .DataTable({
          data:
            [],

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
                  type
                ) =>
                  type ===
                    "display"
                    ? escapeHtml(
                        data ||
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

    $("#inventoryTable tbody").on(
      "click",
      "button[data-action='edit']",
      function () {
        if (
          !canEditInventory
        ) {
          return;
        }

        openEditModal(
          String(
            $(this).data(
              "id"
            )
          )
        );
      }
    );

    $("#inventoryTable tbody").on(
      "click",
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
            <td colspan="11">
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
              row.providerName ||
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
                product.providerName ||
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
   * CARGA DEL INVENTARIO DESDE APP.JS
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

        /*
         * ======================================================
         * PRODUCTOS
         * ======================================================
         *
         * No se consulta Firestore.
         */
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

            if (
              providerId &&
              !providerName
            ) {
              const provider =
                getProviderById(
                  providerId
                );

              if (
                provider
              ) {
                providerName =
                  String(
                    provider.nombre ||
                      ""
                  ).trim();
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
                  ) ||
                    1
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

        /*
         * ======================================================
         * VENTAS
         * ======================================================
         *
         * No se consulta Firestore.
         */
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
   *
   * Ya no se consulta Firestore para leer movimientos.
   *
   * La escritura permanece en Firestore.
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
      return (
        productStockMovementsPending.get(
          target
        )
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

              movements.push({
                id,

                referenciaLibro:
                  String(
                    data.referenciaLibro ||
                      data.referenceBook ||
                      data.bookReference ||
                      ""
                  ).trim(),

                numeroDocumento:
                  String(
                    data.numeroDocumento ||
                      data.documentNumber ||
                      ""
                  ).trim(),

                tipoMovimiento:
                  String(
                    data.tipoMovimiento ||
                      ""
                  ).trim(),

                createdAtMs:
                  getTimestampMs(
                    data.createdAt
                  )
              });
            }
          );

          movements.sort(
            (
              a,
              b
            ) =>
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

  function getUniqueBookReferences(
    movements
  ) {
    const seen =
      new Set();

    const result =
      [];

    movements.forEach(
      movement => {
        const key =
          [
            movement.referenciaLibro ||
              "",

            movement.numeroDocumento ||
              ""
          ]
            .join(
              "|"
            )
            .toLowerCase();

        if (
          seen.has(
            key
          )
        ) {
          return;
        }

        seen.add(
          key
        );

        result.push(
          movement
        );
      }
    );

    return result;
  }

  /*
   * ============================================================
   * REGISTRAR MOVIMIENTO
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
    detalle,
    user
  }) {
    const context =
      currentUserInventoryContext ||
      {};

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
    user
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
        ) ||
          1
      );

    const totalBoxes =
      paidBoxes +
      bonusBoxes;

    const totalUnits =
      (
        totalBoxes *
        unitsPerBox
      ) +
      paidUnits +
      bonusUnits;

    if (
      totalUnits <=
      0
    ) {
      throw new Error(
        `El producto "${line.name}" no tiene cantidad de inventario.`
      );
    }

    const productRef =
      db
        .collection(
          PRODUCTS_COLLECTION
        )
        .doc();

    const lastCostPerBox =
      Math.max(
        0,
        numberOrZero(
          line.lastCostPerBox
        )
      );

    const lastCostPerUnit =
      unitsPerBox >
        0
        ? lastCostPerBox /
          unitsPerBox
        : 0;

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

      unitsPerBox:
        unitsPerBox,

      lastCostPerBox:
        lastCostPerBox,

      lastCostPerUnit:
        lastCostPerUnit,

      price:
        Math.max(
          0,
          numberOrZero(
            line.price
          )
        ),

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
        ""
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

        detalle:
          [
            `Cajas: ${paidBoxes}`,

            `Cajas bono: ${bonusBoxes}`,

            `Unidades: ${paidUnits}`,

            `Unidades bono: ${bonusUnits}`
          ].join(
            " | "
          ),

        user
      });

    /*
     * Guardar producto + movimiento en una sola operación.
     */
    const batch =
      db.batch();

    batch.set(
      productRef,
      {
        ...productData,

        createdAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp(),

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
          firebase.firestore
            .FieldValue
            .serverTimestamp()
      }
    );

    await batch.commit();

    /*
     * ==========================================================
     * SINCRONIZACIÓN DE CACHÉ
     * ==========================================================
     */

    upsertSessionDocument(
      PRODUCTS_COLLECTION,
      productRef.id,
      {
        ...productData,

        createdAt:
          Date.now(),

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
          Date.now()
      }
    );

    currentProductsList.push({
      id:
        productRef.id,

      ...productData
    });

    return {
      type:
        "new",

      productId:
        productRef.id,

      totalUnits
    };
  }

  /*
   * ============================================================
   * AGREGAR A PRODUCTO EXISTENTE
   * ============================================================
   */

  async function addStockToExistingProduct(
    product,
    line,
    user
  ) {
    const unitsPerBox =
      getUnitsPerBox(
        product
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

    const totalUnits =
      (
        (
          paidBoxes +
          bonusBoxes
        ) *
        unitsPerBox
      ) +
      paidUnits +
      bonusUnits;

    if (
      totalUnits <=
      0
    ) {
      throw new Error(
        `El producto "${product.name}" no tiene cantidad de entrada.`
      );
    }

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

    let movementData =
      null;

    const transactionResult =
      await db.runTransaction(
        async transaction => {
          /*
           * ======================================================
           * ESTA LECTURA ES INTENCIONAL
           * ======================================================
           *
           * Se conserva únicamente en la transacción porque
           * necesitamos el valor más reciente de Firestore para
           * evitar perder actualizaciones concurrentes.
           *
           * Las lecturas normales del inventario ya no utilizan
           * Firestore.
           */
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

          const costPerBoxInput =
            numberOrZero(
              line.lastCostPerBox
            );

          nextCostPerBox =
            costPerBoxInput >
              0
              ? costPerBoxInput
              : numberOrZero(
                  data.lastCostPerBox
                );

          nextCostPerUnit =
            unitsPerBox >
              0
              ? nextCostPerBox /
                unitsPerBox
              : 0;

          nextPrice =
            numberOrZero(
              line.price
            ) >
              0
              ? numberOrZero(
                  line.price
                )
              : numberOrZero(
                  data.price
                );

          if (
            line.proveedorId
          ) {
            nextProviderId =
              line.proveedorId;

            nextProviderName =
              line.proveedorNombre ||
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
          }

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

              detalle:
                [
                  `Cajas: ${paidBoxes}`,

                  `Cajas bono: ${bonusBoxes}`,

                  `Unidades: ${paidUnits}`,

                  `Unidades bono: ${bonusUnits}`
                ].join(
                  " | "
                ),

              user
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

              unitsPerBox:
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
                firebase.firestore
                  .FieldValue
                  .serverTimestamp()
            }
          );

          return {
            movementId:
              movementRef.id
          };
        }
      );

    /*
     * ==========================================================
     * ACTUALIZAR CACHÉ DE PRODUCTO
     * ==========================================================
     */

    const localProduct =
      findProductById(
        product.id
      );

    const updatedProductData = {
      name:
        localProduct?.name ||
        product.name ||
        line.name ||
        "",

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

      unitsPerBox:
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

    /*
     * ==========================================================
     * ACTUALIZAR CACHÉ DEL MOVIMIENTO
     * ==========================================================
     */

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
            Date.now()
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

      movementId
    };
  }

  /*
   * ============================================================
   * COMBOBOX DE PRODUCTO
   * ============================================================
   */

  function buildProductCombobox(
    rowId,
    value = ""
  ) {
    return `
      <input
        id="batch-product-${rowId}"
        class="batch-product-input inv-combobox"
        type="text"
        list="batch-product-list-${rowId}"
        value="${escapeHtml(
          value
        )}"
        placeholder="Producto existente o nombre nuevo"
        autocomplete="off"
      >

      <datalist id="batch-product-list-${rowId}">
        ${getProductComboOptionsHtml()}
      </datalist>
    `;
  }

  function refreshProductComboboxDatalist(
    rowElement
  ) {
    const list =
      rowElement.querySelector(
        ".batch-product-list"
      );

    if (
      !list
    ) {
      return;
    }

    list.innerHTML =
      currentProductsList
        .map(
          product => `
            <option
              value="${escapeHtml(
                product.name ||
                  ""
              )}"
            >
            </option>
          `
        )
        .join("");
  }

  /*
   * ============================================================
   * FILA DE CARGA MÚLTIPLE
   * ============================================================
   */

  let batchLineCounter =
    0;

  function createBatchLineData(
    values = {}
  ) {
    batchLineCounter +=
      1;

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
        Math.max(
          1,
          integerOrZero(
            values.unitsPerBox
          ) ||
            1
        ),

      lastCostPerBox:
        numberOrZero(
          values.lastCostPerBox
        ),

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
              ${
                isExisting
                  ? "selected"
                  : ""
              }
            >
              Existente
            </option>

            <option
              value="new"
              ${
                !isExisting
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
            line.proveedorNombre
          )}

          <small>
            Opcional
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
      findProviderByText(
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
        ) ||
          1
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
          ? String(
              provider.nombre ||
                ""
            ).trim()
          : "",

      boxes,

      bonusBoxes,

      units,

      bonusUnits,

      unitsPerBox,

      lastCostPerBox,

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
      (
        data.boxes *
        data.unitsPerBox
      ) +
      data.units;

    const totalBonus =
      (
        data.bonusBoxes *
        data.unitsPerBox
      ) +
      data.bonusUnits;

    const totalUnits =
      totalNormal +
      totalBonus;

    const totalBoxes =
      data.boxes +
      data.bonusBoxes;

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
            </span>
          `;
        }

        if (
          codeInput
        ) {
          codeInput.value =
            getProductCode(
              product
            ) ||
            codeInput.value ||
            "";
        }

        const existingUnitsPerBox =
          getUnitsPerBox(
            product
          );

        if (
          unitsPerBoxInput
        ) {
          unitsPerBoxInput.value =
            String(
              existingUnitsPerBox
            );

          unitsPerBoxInput.disabled =
            true;
        }

        if (
          costBoxInput &&
          numberOrZero(
            costBoxInput.value
          ) <=
            0
        ) {
          costBoxInput.value =
            String(
              numberOrZero(
                product.lastCostPerBox
              )
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
          providerInput.value =
            getProductProviderName(
              product
            ) ||
            "";
        }

        row.dataset.providerAutofilled =
          "1";
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
          row.dataset.providerAutofilled =
            "";

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
              row.dataset.providerAutofilled =
                "";

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
              `Producto ${
                index +
                1
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
   * VALIDACIÓN DE LÍNEAS
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
          `Producto ${
            index + 1
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
            (
              line.boxes +
              line.bonusBoxes
            ) *
            line.unitsPerBox
          ) +
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
      }
    );

    return {
      errors,
      parsed
    };
  }

  /*
   * ============================================================
   * PROCESAMIENTO MÚLTIPLE
   * ============================================================
   */

  async function processBatchLines(
    lines
  ) {
    const user =
      auth.currentUser ||
      null;

    const results =
      [];

    for (
      let index =
        0;

      index <
      lines.length;

      index++
    ) {
      const line =
        lines[index];

      const label =
        `Producto ${
          index + 1
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
            user
          );

        results.push(
          {
            ...result,
            name:
              product.name
          }
        );

        continue;
      }

      const result =
        await createNewProductFromLine(
          line,
          user
        );

      results.push(
        {
          ...result,
          name:
            line.name
        }
      );
    }

    return results;
  }

  /*
   * ============================================================
   * MODAL MÚLTIPLE
   * ============================================================
   */

  function buildBatchModalHtml() {
    return `
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
          Cada fila se procesa de acuerdo con su tipo:
          los productos existentes reciben una entrada de stock
          y los productos nuevos se crean.
        </p>

        <p>
          Las cajas bono y unidades bono aumentan el stock
          igual que las cantidades normales, pero se conservan
          identificadas dentro del detalle del movimiento
          y no generan costo.
        </p>

        <p>
          El proveedor es opcional.
        </p>

        <p>
          El costo de las cantidades pagadas se registra
          automáticamente como gasto de inventario.
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
          },

        preConfirm:
          () => {
            const container =
              document.getElementById(
                "batch-products-container"
              );

            if (
              !container
            ) {
              Swal.showValidationMessage(
                "No se pudo construir el formulario."
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

            return validation.parsed;
          }
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    const lines =
      Array.isArray(
        result.value
      )
        ? result.value
        : [];

    if (
      !lines.length
    ) {
      return;
    }

    try {
      Swal.fire({
        title:
          "Procesando productos",

        html:
          `Preparando ${
            lines.length
          } producto(s)...`,

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
          lines
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

      /*
       * ========================================================
       * COSTO TOTAL
       * ========================================================
       */

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

      /*
       * ========================================================
       * GASTO AUTOMÁTICO
       * ========================================================
       */

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
              null
          );
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
                Debes revisar la colección "gastos".
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
                  <br>
                  No se creó un registro de gasto porque
                  el costo total de las cantidades pagadas
                  fue cero.
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
                Costo total de productos:
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
   * EDICIÓN INDIVIDUAL
   * ============================================================
   */

  function buildEditFormHtml(
    product
  ) {
    return `
      <div
        style="
          text-align:left;
        "
      >

        <div class="inv-field">
          <label>
            Nombre
          </label>

          <input
            id="edit-name"
            type="text"
            value="${escapeHtml(
              product.name ||
                ""
            )}"
          >
        </div>

        <div class="inv-field">
          <label>
            Código
          </label>

          <input
            id="edit-code"
            type="text"
            value="${escapeHtml(
              getProductCode(
                product
              )
            )}"
          >
        </div>

        <div class="inv-field">
          <label>
            Proveedor
          </label>

          ${getProviderComboboxHtml(
            "edit-provider",
            "edit-provider-list",
            getProductProviderName(
              product
            )
          )}

          <small>
            Opcional.
          </small>
        </div>

        <div class="edit-stock-grid">

          <div class="inv-field">
            <label>
              Cajas
            </label>

            <input
              id="edit-boxes"
              type="number"
              min="0"
              step="1"
              value="${getStockBoxes(
                product
              )}"
            >
          </div>

          <div class="inv-field">
            <label>
              Unidades por caja
            </label>

            <input
              id="edit-upb"
              type="number"
              min="1"
              step="1"
              value="${getUnitsPerBox(
                product
              )}"
            >
          </div>

          <div class="inv-field">
            <label>
              Unidades sueltas
            </label>

            <input
              id="edit-extra"
              type="number"
              min="0"
              step="1"
              value="${
                getCurrentStockUnits(
                  product
                ) -
                (
                  getStockBoxes(
                    product
                  ) *
                  getUnitsPerBox(
                    product
                  )
                )
              }"
            >
          </div>

        </div>

        <div class="inv-field">
          <label>
            Costo por caja
          </label>

          <input
            id="edit-cost"
            type="number"
            min="0"
            step="0.01"
            value="${numberOrZero(
              product.lastCostPerBox
            )}"
          >
        </div>

        <div class="inv-field">
          <label>
            Precio
          </label>

          <input
            id="edit-price"
            type="number"
            min="0"
            step="0.01"
            value="${numberOrZero(
              product.price
            )}"
          >
        </div>

        <div class="inv-field">
          <label>
            Referencia libro
          </label>

          <input
            id="edit-reference"
            type="text"
            value="${escapeHtml(
              product.referenciaLibro ||
                product.referenceBook ||
                ""
            )}"
          >
        </div>

        <div class="inv-field">
          <label>
            Documento
          </label>

          <input
            id="edit-document"
            type="text"
            value="${escapeHtml(
              product.numeroDocumento ||
                ""
            )}"
          >
        </div>

      </div>
    `;
  }

  async function openEditModal(
    productId
  ) {
    if (
      !canEditInventory
    ) {
      await Swal.fire(
        "Sin permisos",
        "No puedes editar productos desde este rol.",
        "warning"
      );

      return;
    }

    const product =
      findProductById(
        productId
      );

    if (
      !product
    ) {
      await Swal.fire(
        "No encontrado",
        "El producto ya no está disponible.",
        "warning"
      );

      return;
    }

    /*
     * Los movimientos salen de app.js.
     */
    const movements =
      await loadProductStockMovements(
        productId
      );

    const references =
      getUniqueBookReferences(
        movements
      );

    const result =
      await Swal.fire({
        title:
          `Editar: ${
            product.name ||
            ""
          }`,

        html:
          buildEditFormHtml(
            product
          ),

        width:
          "700px",

        showCancelButton:
          true,

        confirmButtonText:
          "Actualizar",

        cancelButtonText:
          "Cancelar",

        focusConfirm:
          false,

        preConfirm:
          () => {
            const name =
              String(
                document.getElementById(
                  "edit-name"
                )?.value ||
                  ""
              ).trim();

            const code =
              String(
                document.getElementById(
                  "edit-code"
                )?.value ||
                  ""
              ).trim();

            const providerText =
              String(
                document.getElementById(
                  "edit-provider"
                )?.value ||
                  ""
              ).trim();

            const provider =
              findProviderByText(
                providerText
              );

            const boxes =
              integerOrZero(
                document.getElementById(
                  "edit-boxes"
                )?.value
              );

            const unitsPerBox =
              Math.max(
                1,
                integerOrZero(
                  document.getElementById(
                    "edit-upb"
                  )?.value
                ) ||
                  1
              );

            const extraUnits =
              integerOrZero(
                document.getElementById(
                  "edit-extra"
                )?.value
              );

            const totalUnits =
              (
                boxes *
                unitsPerBox
              ) +
              extraUnits;

            const lastCostPerBox =
              Math.max(
                0,
                numberOrZero(
                  document.getElementById(
                    "edit-cost"
                  )?.value
                )
              );

            const price =
              Math.max(
                0,
                numberOrZero(
                  document.getElementById(
                    "edit-price"
                  )?.value
                )
              );

            const reference =
              String(
                document.getElementById(
                  "edit-reference"
                )?.value ||
                  ""
              ).trim();

            const documentNumber =
              String(
                document.getElementById(
                  "edit-document"
                )?.value ||
                  ""
              ).trim();

            if (
              !name
            ) {
              Swal.showValidationMessage(
                "El nombre es obligatorio."
              );

              return;
            }

            if (
              !code
            ) {
              Swal.showValidationMessage(
                "El código es obligatorio."
              );

              return;
            }

            if (
              totalUnits <
              0
            ) {
              Swal.showValidationMessage(
                "El stock no puede ser negativo."
              );

              return;
            }

            return {
              name,

              codigoProducto:
                code,

              proveedorId:
                provider
                  ? String(
                      provider.id
                    ).trim()
                  : "",

              proveedorNombre:
                provider
                  ? String(
                      provider.nombre ||
                        ""
                    ).trim()
                  : "",

              boxes,

              unitsPerBox,

              extraUnits,

              totalUnits,

              lastCostPerBox,

              lastCostPerUnit:
                unitsPerBox >
                  0
                  ? lastCostPerBox /
                    unitsPerBox
                  : 0,

              price,

              referenciaLibro:
                reference,

              numeroDocumento:
                documentNumber,

              references
            };
          }
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    const values =
      result.value;

    const oldStock =
      getCurrentStockUnits(
        product
      );

    const newStock =
      values.totalUnits;

    try {
      /*
       * ========================================================
       * ESCRITURA FIRESTORE
       * ========================================================
       */

      await db
        .collection(
          PRODUCTS_COLLECTION
        )
        .doc(
          productId
        )
        .update({
          name:
            values.name,

          codigoProducto:
            values.codigoProducto,

          productCode:
            values.codigoProducto,

          proveedorId:
            values.proveedorId ||
            null,

          proveedorNombre:
            values.proveedorNombre ||
            "",

          quantity:
            newStock,

          stockCurrentUnits:
            newStock,

          stockBaseUnits:
            numberOrZero(
              product.stockBaseUnits
            ) ||
            oldStock,

          boxes:
            values.boxes,

          unitsPerBox:
            values.unitsPerBox,

          lastCostPerBox:
            values.lastCostPerBox,

          lastCostPerUnit:
            values.lastCostPerUnit,

          price:
            values.price,

          referenciaLibro:
            values.referenciaLibro,

          referenceBook:
            values.referenciaLibro,

          numeroDocumento:
            values.numeroDocumento,

          updatedAt:
            firebase.firestore
              .FieldValue
              .serverTimestamp()
        });

      const difference =
        newStock -
        oldStock;

      let movementId =
        "";

      let movementData =
        null;

      if (
        difference !==
        0
      ) {
        const user =
          auth.currentUser ||
          null;

        const movementRef =
          db
            .collection(
              MOVEMENTS_COLLECTION
            )
            .doc();

        movementId =
          movementRef.id;

        movementData =
          buildMovementData({
            productId,

            productName:
              values.name,

            codigoProducto:
              values.codigoProducto,

            tipoMovimiento:
              "ajuste",

            referenciaLibro:
              values.referenciaLibro ||
              "Ajuste manual",

            numeroDocumento:
              values.numeroDocumento ||
              "",

            entrada:
              difference >
                0
                ? difference
                : 0,

            salida:
              difference <
                0
                ? Math.abs(
                    difference
                  )
                : 0,

            saldoAnterior:
              oldStock,

            saldoActual:
              newStock,

            detalle:
              "Ajuste manual de inventario",

            user
          });

        await movementRef.set({
          ...movementData,

          createdAt:
            firebase.firestore
              .FieldValue
              .serverTimestamp()
        });
      }

      /*
       * ========================================================
       * SINCRONIZAR CACHÉ DE PRODUCTO
       * ========================================================
       */

      const updatedProductData = {
        ...product,

        name:
          values.name,

        codigoProducto:
          values.codigoProducto,

        productCode:
          values.codigoProducto,

        proveedorId:
          values.proveedorId ||
          null,

        proveedorNombre:
          values.proveedorNombre ||
          "",

        quantity:
          newStock,

        stockCurrentUnits:
          newStock,

        stockBaseUnits:
          numberOrZero(
            product.stockBaseUnits
          ) ||
          oldStock,

        boxes:
          values.boxes,

        unitsPerBox:
          values.unitsPerBox,

        lastCostPerBox:
          values.lastCostPerBox,

        lastCostPerUnit:
          values.lastCostPerUnit,

        price:
          values.price,

        referenciaLibro:
          values.referenciaLibro,

        referenceBook:
          values.referenciaLibro,

        numeroDocumento:
          values.numeroDocumento,

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
        productId,
        updatedProductData
      );

      Object.assign(
        product,
        updatedProductData
      );

      /*
       * ========================================================
       * SINCRONIZAR MOVIMIENTO
       * ========================================================
       */

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
              Date.now()
          }
        );
      }

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
          "Producto actualizado",

        showConfirmButton:
          false,

        timer:
          1500
      });
    } catch (
      error
    ) {
      console.error(
        "Error actualizando producto:",
        error
      );

      await Swal.fire(
        "Error",
        error.message ||
          "No se pudo actualizar el producto.",
        "error"
      );
    }
  }

  /*
   * ============================================================
   * ELIMINAR
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

      /*
       * Actualizar cache primero.
       */
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
   * BÚSQUEDA
   * ============================================================
   */

  function applySearch() {
    if (
      !inventoryDT
    ) {
      return;
    }

    inventoryDT
      .search(
        searchInput
          ? searchInput.value.trim()
          : ""
      )
      .draw();
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
      .inventory-batch-modal {
        max-height: 94vh !important;
        overflow-y: auto !important;
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
          repeat(4, minmax(0, 1fr));
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

      .batch-product-combobox {
        width:100%;
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

      .edit-stock-grid {
        display:grid;
        grid-template-columns:
          repeat(3, minmax(0, 1fr));
        gap:10px;
      }

      @media (max-width:900px) {
        .batch-grid {
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
        }

        .batch-product-field {
          grid-column:span 2;
        }
      }

      @media (max-width:600px) {
        .batch-grid,
        .edit-stock-grid {
          grid-template-columns:1fr;
        }

        .batch-product-field {
          grid-column:span 1;
        }

        .batch-products-container {
          max-height:55vh;
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
      return;
    }

    inventoryInitialized =
      true;

    try {
      injectInventoryStyles();

      /*
       * app.js se encarga de garantizar que la sesión
       * y su caché estén disponibles.
       */
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

      /*
       * Proveedores:
       * exclusivamente desde app.js.
       */
      await loadInventoryProviders();

      /*
       * Productos + ventas:
       * exclusivamente desde app.js.
       */
      await loadInventoryData();
    } catch (
      error
    ) {
      inventoryInitialized =
        false;

      console.error(
        "Error leyendo contexto del inventario:",
        error
      );

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

  /*
   * ============================================================
   * EVENTOS
   * ============================================================
   */

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      injectInventoryStyles();

      if (
        btnAdd
      ) {
        btnAdd.addEventListener(
          "click",
          openBatchAddModal
        );
      }

      if (
        searchInput
      ) {
        searchInput.addEventListener(
          "input",
          applySearch
        );
      }
    }
  );

  /*
   * ============================================================
   * AUTH
   * ============================================================
   */

  auth.onAuthStateChanged(
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
    }
  );

})();