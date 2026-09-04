// assets/js/controllers/dashboard.controller.js

"use strict";


import dashboardModel from "../models/dashboard.model.js";

import dashboardView from "../views/dashboard.view.js";


const {

  qs,

  qsa,

  setText,

  setHtml,

  escapeHtml

} = dashboardView;


const {

  LOW_STOCK_THRESHOLD

} = dashboardModel.constants;


const {

  SALES_COLLECTION_NAME,

  EXPENSES_COLLECTION_NAME,

  MOVEMENTS_COLLECTION_NAME,

  PRODUCTS_COLLECTION_NAME,

  CASH_CLOSE_COLLECTION_NAME

} = {

  SALES_COLLECTION_NAME:
    "ventas",

  EXPENSES_COLLECTION_NAME:
    "gastos",

  MOVEMENTS_COLLECTION_NAME:
    "stock_movimientos",

  PRODUCTS_COLLECTION_NAME:
    "productos",

  CASH_CLOSE_COLLECTION_NAME:
    "cierres_caja"

};


const DEBUG_DASHBOARD =
  true;


let initialized =
  false;


let dashboardLoadingPromise =
  null;


let selectedRange = {

  from:
    null,

  to:
    null

};


let currentUserInfo = {

  uid:
    "",

  email:
    "",

  name:
    "Usuario",

  role:
    ""

};


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


let dashboardPermissions = {

  canCloseDay:
    false,

  canExport:
    false

};


let rawSalesDocs =
  [];

let rawExpensesDocs =
  [];

let rawMovementsDocs =
  [];

let rawProductsDocs =
  [];


let cachedSales =
  [];

let cachedExpenses =
  [];

let cachedMovements =
  [];


let visibleSales =
  [];

let visibleExpenses =
  [];

let visibleMovements =
  [];


let productsMap =
  new Map();


let elements =
  null;


/*
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

function debugLog(
  ...args
) {

  if (
    DEBUG_DASHBOARD
  ) {

    console.log(
      "[Dashboard]",
      ...args
    );

  }
}


function debugWarn(
  ...args
) {

  if (
    DEBUG_DASHBOARD
  ) {

    console.warn(
      "[Dashboard]",
      ...args
    );

  }
}


function debugError(
  ...args
) {

  if (
    DEBUG_DASHBOARD
  ) {

    console.error(
      "[Dashboard]",
      ...args
    );

  }
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


function isPlainObject(
  value
) {

  return (

    !!value &&

    typeof value ===
      "object" &&

    !Array.isArray(
      value
    )

  );
}


function formatMoney(
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


function sanitizeFilePart(
  value
) {

  return String(
    value ||
    ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/gi,
      "_"
    )
    .replace(
      /^_+|_+$/g,
      ""
    ) ||
    "local";
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

    return Number.isFinite(
      date.getTime()
    )
      ? date.getTime()
      : 0;
  }


  if (

    typeof value ===
      "object" &&

    typeof value.seconds ===
      "number"

  ) {

    return (
      value.seconds *
      1000
    );
  }


  if (
    typeof value ===
    "number"
  ) {

    return value;
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


  return Number.isFinite(
    date.getTime()
  )
    ? date.getTime()
    : 0;
}


function getDisplayDate(
  value
) {

  const timestamp =
    getTimestampMs(
      value
    );


  if (
    !timestamp
  ) {

    return "—";
  }


  return new Date(
    timestamp
  ).toLocaleDateString(
    "es-ES"
  );
}


function getDisplayTime(
  value
) {

  const timestamp =
    getTimestampMs(
      value
    );


  if (
    !timestamp
  ) {

    return "—";
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


function toLocalInputDate(
  date
) {

  const current =
    new Date(
      date
    );


  const year =
    current.getFullYear();


  const month =
    String(
      current.getMonth() +
      1
    ).padStart(
      2,
      "0"
    );


  const day =
    String(
      current.getDate()
    ).padStart(
      2,
      "0"
    );


  return `${year}-${month}-${day}`;
}


function startOfMonth(
  date =
    new Date()
) {

  return new Date(

    date.getFullYear(),

    date.getMonth(),

    1,

    0,

    0,

    0,

    0

  );
}


function endOfToday(
  date =
    new Date()
) {

  return new Date(

    date.getFullYear(),

    date.getMonth(),

    date.getDate(),

    23,

    59,

    59,

    999

  );
}


function startOfDay(
  dateString
) {

  if (
    !dateString
  ) {

    return null;
  }


  const date =
    new Date(
      `${dateString}T00:00:00`
    );


  return Number.isFinite(
    date.getTime()
  )
    ? date
    : null;
}


function endOfDay(
  dateString
) {

  if (
    !dateString
  ) {

    return null;
  }


  const date =
    new Date(
      `${dateString}T23:59:59.999`
    );


  return Number.isFinite(
    date.getTime()
  )
    ? date
    : null;
}


/*
 * ============================================================
 * ROL
 * ============================================================
 */

function canonicalRole(
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
      role ||
      ""
    )
      .trim()
      .toLowerCase();


  switch (
    normalized
  ) {

    case "admin":
    case "administrador":
      return "Administrador";

    case "cajero":
      return "Cajero";

    case "vendedor":
      return "Vendedor";

    case "bodega":
    case "inventario":
      return "Bodega";

    case "developer":
    case "desarrollador":
      return "Desarrollador";

    default:
      return "";

  }
}


function roleCanCloseDay(
  role
) {

  return dashboardModel
    .permissions
    .canCloseDay
    .includes(
      canonicalRole(
        role
      )
    );
}


function roleCanExport(
  role
) {

  return dashboardModel
    .permissions
    .canExport
    .includes(
      canonicalRole(
        role
      )
    );
}


function updatePermissionUI() {

  dashboardPermissions = {

    canCloseDay:
      roleCanCloseDay(
        currentUserInfo.role
      ),

    canExport:
      roleCanExport(
        currentUserInfo.role
      )

  };


  if (
    elements.btnCloseDay
  ) {

    elements.btnCloseDay.disabled =
      !dashboardPermissions.canCloseDay;
  }


  if (
    elements.btnExportSalesCSV
  ) {

    elements.btnExportSalesCSV.disabled =
      !dashboardPermissions.canExport;
  }


  if (
    elements.btnExportExpensesCSV
  ) {

    elements.btnExportExpensesCSV.disabled =
      !dashboardPermissions.canExport;
  }


  if (
    elements.btnExportMovementsExcel
  ) {

    elements.btnExportMovementsExcel.disabled =
      !dashboardPermissions.canExport;
  }
}


/*
 * ============================================================
 * CONTEXTO
 * ============================================================
 */

async function resolveDashboardContext(
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


  if (
    !context
  ) {

    throw new Error(
      "No se pudo resolver el contexto del usuario."
    );
  }


  currentUserInfo = {

    uid:
      context.uid ||
      user.uid,

    email:
      context.email ||
      user.email ||
      "",

    name:
      context.name ||
      user.displayName ||
      "Usuario",

    role:
      canonicalRole(
        context.role ||
        context.position ||
        ""
      )

  };


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


  if (
    elements.greetings?.length
  ) {

    elements.greetings.forEach(
      element => {

        element.textContent =
          `Hola, ${
            currentUserInfo.name ||
            "Usuario"
          } (${
            currentUserInfo.role ||
            ""
          })`;

      }
    );
  }


  if (
    typeof window.renderNavigationForRole ===
      "function"
  ) {

    window.renderNavigationForRole(
      currentUserInfo.role
    );
  }


  updatePermissionUI();

  renderLocalBanner();

  updateDocumentTitle();

  return context;
}


function renderLocalBanner() {

  if (
    !elements.heroNote
  ) {

    return;
  }


  elements.heroNote.innerHTML = `

    <p
      class="hero-subtitle"
      style="margin-top:0"
    >

      <strong>Local:</strong>
      ${escapeHtml(
        currentLocalInfo.nombre ||
        "—"
      )}

      <br>

      <strong>Número de documento:</strong>
      ${escapeHtml(
        currentLocalInfo.numeroDocumento ||
        "—"
      )}

      <br>

      <strong>Contribuyente:</strong>
      ${escapeHtml(
        currentLocalInfo.contribuyente ||
        "—"
      )}

      <br>

      <strong>Tipo de documento:</strong>
      ${escapeHtml(
        currentLocalInfo.tipoDocumento ||
        "—"
      )}

      <br>

      <strong>NIT:</strong>
      ${escapeHtml(
        currentLocalInfo.nit ||
        "—"
      )}

      <br>

      <strong>NRC:</strong>
      ${escapeHtml(
        currentLocalInfo.nrc ||
        "—"
      )}

      <br>

      <strong>Ubicación:</strong>
      ${escapeHtml(
        currentLocalInfo.ubicacion ||
        "—"
      )}

    </p>

    <p class="hero-subtitle">
      Los datos se cargan desde la caché de sesión.
    </p>

  `;
}


function updateDocumentTitle() {

  const suffix =
    currentLocalInfo.nombre
      ? ` - ${currentLocalInfo.nombre}`
      : "";


  document.title =
    `Dashboard${suffix}`;
}


/*
 * ============================================================
 * LOCAL
 * ============================================================
 */

function getDocumentLocalId(
  data = {}
) {

  return String(

    data.id_local ??

    data.idLocal ??

    data.localId ??

    data.idlocal ??

    data.local_id ??

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

    getDocumentLocalId(
      data
    ) ===

    currentLocalId

  );
}


/*
 * ============================================================
 * CACHE
 * ============================================================
 */

function normalizeCachedDocument(
  item
) {

  if (
    !item
  ) {

    return null;
  }


  if (

    item.data &&

    typeof item.data ===
      "object"

  ) {

    return {

      id:
        String(
          item.id ||
          ""
        ),

      data:
        item.data ||
        {}

    };
  }


  return {

    id:
      String(
        item.id ||
        ""
      ),

    data: {
      ...item
    }

  };
}


function readCollectionFromAppCache(
  collectionName
) {

  if (
    typeof window.getSessionCollection ===
      "function"
  ) {

    try {

      const documents =
        window.getSessionCollection(
          collectionName,
          {
            uid:
              window.auth?.currentUser?.uid ||
              ""
          }
        );


      if (

        Array.isArray(
          documents
        ) &&

        documents.length

      ) {

        return documents

          .map(
            normalizeCachedDocument
          )

          .filter(
            Boolean
          );

      }

    } catch (
      error
    ) {

      debugWarn(

        `No se pudo leer ${collectionName} mediante getSessionCollection():`,

        error

      );
    }
  }


  try {

    const raw =
      sessionStorage.getItem(
        "CONTROL_ACCESO_SESSION_CACHE"
      );


    if (
      !raw
    ) {

      return [];
    }


    const parsed =
      JSON.parse(
        raw
      );


    const entry =
      parsed?.collections?.[
        collectionName
      ];


    if (

      !entry ||

      !Array.isArray(
        entry.docs
      )

    ) {

      return [];
    }


    return entry.docs

      .map(
        normalizeCachedDocument
      )

      .filter(
        Boolean
      );

  } catch (
    error
  ) {

    debugWarn(
      `No se pudo leer la caché raw de ${collectionName}:`,
      error
    );

    return [];
  }
}


function loadCollectionFromSession(
  collectionName
) {

  const documents =
    readCollectionFromAppCache(
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
        matchesCurrentLocal(
          item.data
        )
    )

    .sort(
      (
        a,
        b
      ) =>

        getTimestampMs(
          b.data?.createdAt
        ) -

        getTimestampMs(
          a.data?.createdAt
        )
    );
}


async function refreshRawCache() {

  /*
   * No hacemos lecturas de Firestore desde este controlador.
   */

  if (
    typeof window.ensureSessionDataLoaded ===
      "function"
  ) {

    await window.ensureSessionDataLoaded(
      window.auth?.currentUser
    );
  }


  rawSalesDocs =
    loadCollectionFromSession(
      SALES_COLLECTION_NAME
    );


  rawExpensesDocs =
    loadCollectionFromSession(
      EXPENSES_COLLECTION_NAME
    );


  rawMovementsDocs =
    loadCollectionFromSession(
      MOVEMENTS_COLLECTION_NAME
    );


  rawProductsDocs =
    loadCollectionFromSession(
      PRODUCTS_COLLECTION_NAME
    );


  debugLog(
    "Caché actual:",
    {

      local:
        currentLocalId,

      role:
        currentUserInfo.role,

      ventas:
        rawSalesDocs.length,

      gastos:
        rawExpensesDocs.length,

      movimientos:
        rawMovementsDocs.length,

      productos:
        rawProductsDocs.length

    }
  );
}


/*
 * ============================================================
 * PRODUCTOS
 * ============================================================
 */

function rebuildProductsMap() {

  productsMap =
    new Map();


  rawProductsDocs.forEach(
    ({
      id,
      data
    }) => {

      productsMap.set(

        String(
          id
        ),

        {
          id,
          ...data
        }

      );

    }
  );
}


function getUnitsPerBox(
  product
) {

  const units =
    numberOrZero(
      product?.unitsPerBox
    );


  return units >
    0
    ? units
    : 1;
}


function getStockUnits(
  product
) {

  if (
    !product
  ) {

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

  return (

    getStockUnits(
      product
    ) /

    getUnitsPerBox(
      product
    )

  );
}


function getProductUnitCost(
  product
) {

  if (
    !product
  ) {

    return 0;
  }


  const candidates = [

    product.unitCost,

    product.costoUnitario,

    product.costPerUnit,

    product.costoPorUnidad,

    product.lastCostPerUnit,

    product.ultimoCostoUnitario

  ];


  for (
    const candidate of
      candidates
  ) {

    const value =
      Number(
        candidate
      );


    if (

      Number.isFinite(
        value
      ) &&

      value >
        0

    ) {

      return value;
    }
  }


  return 0;
}


/*
 * ============================================================
 * VENTAS
 * ============================================================
 */

function getSaleProducts(
  sale
) {

  return Array.isArray(
    sale?.products
  )
    ? sale.products
    : [];
}


function getSaleProductUnits(
  product
) {

  if (
    !product
  ) {

    return 0;
  }


  const explicitUnits =
    Number(
      product.unitsTotal
    );


  if (

    Number.isFinite(
      explicitUnits
    ) &&

    explicitUnits >
      0

  ) {

    return explicitUnits;
  }


  const quantity =
    Number(
      product.quantity
    );


  if (

    Number.isFinite(
      quantity
    ) &&

    quantity >
      0

  ) {

    const mode =
      String(

        product.mode ||

        product.saleMode ||

        product.saleType ||

        "unit"

      ).toLowerCase();


    if (
      mode ===
      "box"
    ) {

      return (

        quantity *

        getUnitsPerBox(
          product
        )

      );
    }


    return quantity;
  }


  return 0;
}


function aggregateSales(
  source
) {

  const unitsMap =
    {};


  let totalSales =
    0;


  let totalUnitsSold =
    0;


  source.forEach(
    ({
      data
    }) => {

      totalSales +=
        numberOrZero(
          data.total
        );


      getSaleProducts(
        data
      ).forEach(
        product => {

          const productId =
            String(

              product.productId ||

              product.productID ||

              product.product_id ||

              product.id ||

              ""

            ).trim();


          if (
            !productId
          ) {

            return;
          }


          const units =
            getSaleProductUnits(
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

            units;


          totalUnitsSold +=
            units;
        }
      );

    }
  );


  const distinctProductsSold =
    Object.keys(
      unitsMap
    ).filter(
      productId =>
        numberOrZero(
          unitsMap[
            productId
          ]
        ) >
        0
    ).length;


  return {

    unitsMap,

    totalSales,

    totalUnitsSold,

    distinctProductsSold

  };
}


function getTextFromProducts(
  products
) {

  if (

    !Array.isArray(
      products
    ) ||

    !products.length

  ) {

    return "—";
  }


  return products

    .map(

      product => {

        const quantity =
          numberOrZero(

            product.quantity ||

            product.unitsTotal

          );


        return `${

          product.name ||

          product.productName ||

          "Producto"

        } x${quantity}`;

      }

    ).join(
      " | "
    );
}


/*
 * ============================================================
 * RANGO
 * ============================================================
 */

function isWithinSelectedRange(
  value
) {

  if (

    !selectedRange.from ||

    !selectedRange.to

  ) {

    return true;
  }


  const timestamp =
    getTimestampMs(
      value
    );


  if (
    !timestamp
  ) {

    return false;
  }


  const date =
    new Date(
      timestamp
    );


  return (

    date >=
      selectedRange.from &&

    date <=
      selectedRange.to

  );
}


function setDefaultRangeToMonth() {

  const today =
    new Date();


  selectedRange = {

    from:
      startOfMonth(
        today
      ),

    to:
      endOfToday(
        today
      )

  };


  if (
    elements.rangeFrom
  ) {

    elements.rangeFrom.value =
      toLocalInputDate(
        selectedRange.from
      );
  }


  if (
    elements.rangeTo
  ) {

    elements.rangeTo.value =
      toLocalInputDate(
        selectedRange.to
      );
  }


  updateRangeLabels();
}


function updateRangeLabels() {

  const fromText =
    selectedRange.from

      ? selectedRange.from.toLocaleDateString(
          "es-ES"
        )

      : "inicio";


  const toText =
    selectedRange.to

      ? selectedRange.to.toLocaleDateString(
          "es-ES"
        )

      : "hoy";


  const localText =
    currentLocalInfo.nombre

      ? ` del local ${currentLocalInfo.nombre}`

      : "";


  const text =
    `Mostrando resultados${localText} desde ${fromText} hasta ${toText}.`;


  setText(
    elements.salesRangeLabel,
    text
  );


  setText(
    elements.expenseRangeLabel,
    text
  );


  setText(
    elements.movementRangeLabel,
    text
  );
}


/*
 * ============================================================
 * RECONSTRUIR DATOS
 * ============================================================
 */

function rebuildMovementsCache() {

  cachedMovements =
    rawMovementsDocs

      .filter(
        ({
          data
        }) =>
          isWithinSelectedRange(
            data.createdAt
          )
      )

      .map(
        ({
          id,
          data
        }) => {

          const productId =
            String(

              data.productId ||

              data.productID ||

              data.product_id ||

              ""

            ).trim();


          const product =
            productsMap.get(
              productId
            ) ||
            {};


          const productName =
            String(

              data.productName ||

              data.name ||

              data.nombre ||

              product.name ||

              product.productName ||

              "—"

            );


          const productCode =
            String(

              data.codigoProducto ||

              data.productCode ||

              data.code ||

              data.sku ||

              product.codigoProducto ||

              product.productCode ||

              product.code ||

              product.sku ||

              "—"

            );


          const unitCost =
            numberOrZero(

              data.costoUnitario ||

              data.unitCost ||

              data.costPerUnit ||

              data.costoPorUnidad ||

              getProductUnitCost(
                product
              )

            );


          const balanceAfter =
            numberOrZero(

              data.saldoActual ??

              data.balance ??

              data.saldo ??

              data.currentBalance

            );


          return {

            id,

            productCode,

            productName,

            supplierName:

              data.proveedorNombre ||

              data.nombreProveedor ||

              data.supplierName ||

              data.providerName ||

              "—",

            unitCost,

            inventoryValue:
              unitCost *
              balanceAfter,

            balanceBefore:

              numberOrZero(

                data.saldoAnterior ??

                data.balanceBefore ??

                data.previousBalance

              ),

            balanceAfter,

            bookReference:

              String(

                data.referenciaLibro ||

                data.referenceBook ||

                data.bookReference ||

                data.libro ||

                "—"

              ),

            docNumber:

              String(

                data.numeroDocumento ||

                data.documentNumber ||

                data.docNumber ||

                "—"

              ),

            entry:

              numberOrZero(

                data.entrada ??

                data.entry ??

                data.unitsIn

              ),

            exit:

              numberOrZero(

                data.salida ??

                data.exit ??

                data.unitsOut

              ),

            detail:

              String(

                data.detalle ||

                data.detail ||

                data.notes ||

                ""

              ),

            createdAtMs:

              getTimestampMs(
                data.createdAt
              ),

            dateStr:

              getDisplayDate(
                data.createdAt
              ),

            timeStr:

              getDisplayTime(
                data.createdAt
              )

          };

        }

      )

      .sort(

        (
          a,
          b
        ) =>

          a.createdAtMs -
          b.createdAtMs

      );
}


async function rebuildDashboardData() {

  await refreshRawCache();

  rebuildProductsMap();


  cachedSales =

    rawSalesDocs

      .filter(

        ({
          data
        }) =>
          isWithinSelectedRange(
            data.createdAt
          )

      )

      .map(

        ({
          id,
          data
        }) => ({

          id,

          products:
            getTextFromProducts(
              getSaleProducts(
                data
              )
            ),

          total:
            numberOrZero(
              data.total
            ),

          userName:

            data.userName ||

            data.usuario ||

            data.createdByName ||

            "—",

          dateStr:
            getDisplayDate(
              data.createdAt
            ),

          timeStr:
            getDisplayTime(
              data.createdAt
            ),

          createdAtMs:
            getTimestampMs(
              data.createdAt
            )

        })

      )

      .sort(

        (
          a,
          b
        ) =>

          b.createdAtMs -
          a.createdAtMs

      );


  cachedExpenses =

    rawExpensesDocs

      .filter(

        ({
          data
        }) =>
          isWithinSelectedRange(
            data.createdAt
          )

      )

      .map(

        ({
          id,
          data
        }) => ({

          id,

          concept:

            data.concept ||

            data.concepto ||

            "",

          category:

            data.category ||

            data.categoria ||

            "",

          amount:

            numberOrZero(
              data.amount
            ),

          paymentMethod:

            data.paymentMethod ||

            data.metodoPago ||

            "",

          userName:

            data.userName ||

            data.usuario ||

            data.createdByName ||

            "—",

          notes:

            data.notes ||

            data.observacion ||

            "",

          dateStr:

            getDisplayDate(
              data.createdAt
            ),

          timeStr:

            getDisplayTime(
              data.createdAt
            ),

          createdAtMs:

            getTimestampMs(
              data.createdAt
            )

        })

      )

      .sort(

        (
          a,
          b
        ) =>

          b.createdAtMs -
          a.createdAtMs

      );


  rebuildMovementsCache();


  visibleSales = [
    ...cachedSales
  ];


  visibleExpenses = [
    ...cachedExpenses
  ];


  visibleMovements = [
    ...cachedMovements
  ];

}


/*
 * ============================================================
 * RENDER TABLAS
 * ============================================================
 */

function renderSalesTable(
  rows
) {

  if (
    !elements.salesTableBody
  ) {

    return;
  }


  if (
    !rows.length
  ) {

    elements.salesTableBody.innerHTML = `

      <tr>

        <td colspan="5">

          No hay ventas en el rango seleccionado.

        </td>

      </tr>

    `;

    return;
  }


  elements.salesTableBody.innerHTML =

    rows.map(

      row => `

        <tr>

          <td>

            ${escapeHtml(
              row.products
            )}

          </td>

          <td>

            ${formatMoney(
              row.total
            )}

          </td>

          <td>

            ${escapeHtml(
              row.userName
            )}

          </td>

          <td>

            ${escapeHtml(
              row.dateStr
            )}

          </td>

          <td>

            ${escapeHtml(
              row.timeStr
            )}

          </td>

        </tr>

      `

    ).join(
      ""
    );
}


function renderExpensesTable(
  rows
) {

  if (
    !elements.expensesTableBody
  ) {

    return;
  }


  if (
    !rows.length
  ) {

    elements.expensesTableBody.innerHTML = `

      <tr>

        <td colspan="8">

          No hay gastos en el rango seleccionado.

        </td>

      </tr>

    `;

    return;
  }


  elements.expensesTableBody.innerHTML =

    rows.map(

      row => `

        <tr>

          <td>

            ${escapeHtml(
              row.concept ||
              "—"
            )}

          </td>

          <td>

            ${escapeHtml(
              row.category ||
              "—"
            )}

          </td>

          <td>

            ${formatMoney(
              row.amount
            )}

          </td>

          <td>

            ${escapeHtml(
              row.paymentMethod ||
              "—"
            )}

          </td>

          <td>

            ${escapeHtml(
              row.userName ||
              "—"
            )}

          </td>

          <td>

            ${escapeHtml(
              row.dateStr
            )}

          </td>

          <td>

            ${escapeHtml(
              row.timeStr
            )}

          </td>

          <td>

            ${escapeHtml(
              row.notes ||
              "—"
            )}

          </td>

        </tr>

      `

    ).join(
      ""
    );
}


function renderMovementsTable(
  rows
) {

  if (
    !elements.movementsTableBody
  ) {

    return;
  }


  if (
    !rows.length
  ) {

    elements.movementsTableBody.innerHTML = `

      <tr>

        <td colspan="13">

          No hay movimientos en el rango seleccionado.

        </td>

      </tr>

    `;

    return;
  }


  elements.movementsTableBody.innerHTML =

    rows.map(

      row => `

        <tr>

          <td>
            ${escapeHtml(
              row.dateStr
            )}
          </td>

          <td>
            ${escapeHtml(
              row.timeStr
            )}
          </td>

          <td>
            ${escapeHtml(
              row.productName
            )}
          </td>

          <td>
            ${escapeHtml(
              row.productCode
            )}
          </td>

          <td>
            ${escapeHtml(
              row.docNumber
            )}
          </td>

          <td>
            ${escapeHtml(
              row.bookReference
            )}
          </td>

          <td>
            ${formatMoney(
              row.unitCost
            )}
          </td>

          <td>
            ${formatMoney(
              row.inventoryValue
            )}
          </td>

          <td>
            ${numberOrZero(
              row.entry
            )}
          </td>

          <td>
            ${numberOrZero(
              row.exit
            )}
          </td>

          <td>
            ${numberOrZero(
              row.balanceBefore
            )}
          </td>

          <td>
            ${numberOrZero(
              row.balanceAfter
            )}
          </td>

          <td>
            ${escapeHtml(
              row.detail ||
              "—"
            )}
          </td>

        </tr>

      `

    ).join(
      ""
    );
}


function updateCounts() {

  setText(

    elements.salesCountLabel,

    `${visibleSales.length} registros`

  );


  setText(

    elements.expenseCountLabel,

    `${visibleExpenses.length} registros`

  );


  setText(

    elements.movementCountLabel,

    `${visibleMovements.length} registros`

  );
}


/*
 * ============================================================
 * BUSCADOR
 * ============================================================
 */

function applySearchFilter() {

  const query =
    String(
      elements.rangeSearch?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    !query
  ) {

    visibleSales = [
      ...cachedSales
    ];

    visibleExpenses = [
      ...cachedExpenses
    ];

    visibleMovements = [
      ...cachedMovements
    ];

  } else {

    visibleSales =
      cachedSales.filter(
        row =>
          [
            row.products,
            row.total,
            row.userName,
            row.dateStr,
            row.timeStr
          ]
            .join(
              " "
            )
            .toLowerCase()
            .includes(
              query
            )
      );


    visibleExpenses =
      cachedExpenses.filter(
        row =>
          [
            row.concept,
            row.category,
            row.amount,
            row.paymentMethod,
            row.userName,
            row.dateStr,
            row.timeStr,
            row.notes
          ]
            .join(
              " "
            )
            .toLowerCase()
            .includes(
              query
            )
      );


    visibleMovements =
      cachedMovements.filter(
        row =>
          [
            row.productCode,
            row.productName,
            row.supplierName,
            row.unitCost,
            row.inventoryValue,
            row.bookReference,
            row.docNumber,
            row.entry,
            row.exit,
            row.balanceBefore,
            row.balanceAfter,
            row.dateStr,
            row.timeStr,
            row.detail
          ]
            .join(
              " "
            )
            .toLowerCase()
            .includes(
              query
            )
      );

  }


  renderSalesTable(
    visibleSales
  );


  renderExpensesTable(
    visibleExpenses
  );


  renderMovementsTable(
    visibleMovements
  );


  updateCounts();
}


/*
 * ============================================================
 * ESTADÍSTICAS
 * ============================================================
 */

function renderProfitStatus(
  totalSales,
  totalExpenses,
  salesAgg
) {

  if (
    !elements.profitStatus
  ) {

    return;
  }


  let estimatedCostOfSales =
    0;


  Object.entries(
    salesAgg.unitsMap
  ).forEach(
    ([
      productId,
      unitsSold
    ]) => {

      const product =
        productsMap.get(
          String(
            productId
          )
        );


      estimatedCostOfSales +=

        numberOrZero(
          unitsSold
        ) *

        getProductUnitCost(
          product
        );

    }
  );


  const grossProfit =
    totalSales -
    estimatedCostOfSales;


  const netProfit =
    totalSales -
    totalExpenses;


  const tone =
    netProfit < 0
      ? "danger"
      : netProfit <
          grossProfit *
            0.4
        ? "warning"
        : "success";


  elements.profitStatus.className =
    `info-card status-panel status-panel--${tone}`;


  elements.profitStatus.innerHTML = `

    <div class="status-panel__label">
      Utilidad del período
    </div>

    <div class="status-panel__value">

      ${
        netProfit < 0
          ? "Pérdida neta del período"
          : "Resultado neto del período"
      }:

      ${formatMoney(
        netProfit
      )}

    </div>

    <div
      class="small"
      style="margin-top:8px;"
    >

      Costo estimado:
      <strong>
        ${formatMoney(
          estimatedCostOfSales
        )}
      </strong>

      ·

      Bruto estimado:
      <strong>
        ${formatMoney(
          grossProfit
        )}
      </strong>

      ·

      Neto:
      <strong>
        ${formatMoney(
          netProfit
        )}
      </strong>

    </div>

  `;
}


function renderLowStockAlerts(
  products,
  salesAgg
) {

  if (
    !elements.lowStockPanel
  ) {

    return;
  }


  const lowStock =
    [];


  products.forEach(
    product => {

      const stockUnits =
        getStockUnits(
          product
        );


      const stockBoxes =
        getStockBoxes(
          product
        );


      const soldUnits =
        numberOrZero(
          salesAgg.unitsMap[
            product.id
          ]
        );


      let daysLeft =
        "-";


      if (
        soldUnits >
        0
      ) {

        const dailyRate =
          soldUnits /
          30;


        if (
          dailyRate >
          0
        ) {

          daysLeft =
            Math.floor(
              stockUnits /
              dailyRate
            );
        }
      }


      if (
        stockUnits <=
        LOW_STOCK_THRESHOLD
      ) {

        lowStock.push({

          name:

            product.name ||

            product.productName ||

            "Sin nombre",

          stockUnits,

          stockBoxes,

          unitsPerBox:
            getUnitsPerBox(
              product
            ),

          daysLeft

        });
      }

    }
  );


  lowStock.sort(

    (
      a,
      b
    ) =>
      a.stockUnits -
      b.stockUnits

  );


  setText(

    elements.statLowStock,

    lowStock.length

  );


  if (
    !lowStock.length
  ) {

    elements.lowStockPanel.innerHTML = `

      <div class="no-alerts">

        No hay productos en stock crítico.

      </div>

    `;

    return;
  }


  elements.lowStockPanel.innerHTML =

    lowStock

      .slice(
        0,
        10
      )

      .map(

        item => `

          <div class="low-stock-item low-stock-item--rich">

            <div class="low-stock-item__left">

              <strong>

                ${escapeHtml(
                  item.name
                )}

              </strong>

              <div class="low-stock-item__muted">

                Stock crítico detectado

              </div>

            </div>

            <div class="low-stock-item__right">

              <div>

                <span>
                  Stock
                </span>

                <strong>
                  ${item.stockUnits}
                </strong>

              </div>

              <div>

                <span>
                  Cajas
                </span>

                <strong>
                  ${item.stockBoxes.toFixed(
                    2
                  )}
                </strong>

              </div>

              <div>

                <span>
                  U/caja
                </span>

                <strong>
                  ${item.unitsPerBox}
                </strong>

              </div>

              <div>

                <span>
                  Se agota en
                </span>

                <strong>

                  ${
                    item.daysLeft ===
                    "-"
                      ? "-"
                      : `${item.daysLeft} días`
                  }

                </strong>

              </div>

            </div>

          </div>

        `

      )

      .join(
        ""
      );
}


function updateChartAndStats(
  data
) {

  const {

    totalSales,

    totalExpenses,

    totalUnitsSold,

    distinctProductsSold,

    salesAgg,

    products

  } = data;


  if (

    typeof window.appChartUtils !==
      "undefined" &&

    typeof window.appChartUtils.drawSalesChart ===
      "function"

  ) {

    window.appChartUtils.drawSalesChart(

      "salesChart",

      totalSales,

      0,

      totalExpenses

    );
  }


  setText(

    elements.statSales,

    formatMoney(
      totalSales
    )

  );


  setText(

    elements.statExpenses,

    formatMoney(
      totalExpenses
    )

  );


  setText(

    elements.statNet,

    formatMoney(
      totalSales -
      totalExpenses
    )

  );


  setText(

    elements.statUnitsSold,

    totalUnitsSold

  );


  setText(

    elements.statProductsSold,

    distinctProductsSold

  );


  renderProfitStatus(

    totalSales,

    totalExpenses,

    salesAgg

  );


  renderLowStockAlerts(

    products,

    salesAgg

  );
}


/*
 * ============================================================
 * CARGAR DASHBOARD
 * ============================================================
 */

async function loadDashboardForRange() {

  if (
    !currentLocalId
  ) {

    throw new Error(
      "No hay un local asociado al usuario autenticado."
    );
  }


  const from =
    elements.rangeFrom?.value

      ? startOfDay(
          elements.rangeFrom.value
        )

      : startOfMonth();


  const to =
    elements.rangeTo?.value

      ? endOfDay(
          elements.rangeTo.value
        )

      : endOfToday();


  if (
    !from ||
    !to
  ) {

    throw new Error(
      "El rango de fechas no es válido."
    );
  }


  if (
    from >
    to
  ) {

    throw new Error(
      "La fecha inicial no puede ser mayor que la fecha final."
    );
  }


  selectedRange = {

    from,

    to

  };


  updateRangeLabels();


  await rebuildDashboardData();


  const salesInRange =
    rawSalesDocs.filter(
      ({
        data
      }) =>
        isWithinSelectedRange(
          data.createdAt
        )
    );


  const salesAgg =
    aggregateSales(
      salesInRange
    );


  const totalExpenses =
    cachedExpenses.reduce(

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


  renderSalesTable(
    visibleSales
  );


  renderExpensesTable(
    visibleExpenses
  );


  renderMovementsTable(
    visibleMovements
  );


  updateCounts();


  updateChartAndStats({

    totalSales:
      salesAgg.totalSales,

    totalExpenses,

    totalUnitsSold:
      salesAgg.totalUnitsSold,

    distinctProductsSold:
      salesAgg.distinctProductsSold,

    salesAgg,

    products:
      Array.from(
        productsMap.values()
      )

  });


  applySearchFilter();
}


async function refreshDashboard() {

  if (
    dashboardLoadingPromise
  ) {

    return dashboardLoadingPromise;
  }


  dashboardLoadingPromise =
    loadDashboardForRange()
      .finally(
        () => {

          dashboardLoadingPromise =
            null;

        }
      );


  return dashboardLoadingPromise;
}


/*
 * ============================================================
 * CSV
 * ============================================================
 */

function toCSVCell(
  value
) {

  return `"${String(
    value ?? ""
  ).replace(
    /"/g,
    '""'
  )}"`;
}


function downloadCSV(
  filename,
  headers,
  rows
) {

  const lines = [

    headers
      .map(
        toCSVCell
      )
      .join(";"),

    ...rows.map(

      row =>

        row

          .map(
            toCSVCell
          )

          .join(";")

    )

  ];


  const blob =
    new Blob(

      [

        "\uFEFF" +

        lines.join(
          "\n"
        )

      ],

      {

        type:
          "text/csv;charset=utf-8;"

      }

    );


  const url =
    URL.createObjectURL(
      blob
    );


  const link =
    document.createElement(
      "a"
    );


  link.href =
    url;


  link.download =
    filename;


  document.body.appendChild(
    link
  );


  link.click();


  link.remove();


  URL.revokeObjectURL(
    url
  );
}


function getExportRangeTags() {

  return {

    from:
      elements.rangeFrom?.value ||
      "inicio",

    to:
      elements.rangeTo?.value ||
      "fin"

  };
}


async function exportSalesCSV() {

  try {

    if (
      !dashboardPermissions.canExport
    ) {

      throw new Error(
        "Tu rol no tiene permiso para exportar información."
      );
    }


    await refreshDashboard();


    if (
      !visibleSales.length
    ) {

      await Swal.fire(

        "Sin datos",

        "No hay ventas para exportar con el rango y búsqueda seleccionados.",

        "info"

      );

      return;
    }


    const headers = [

      "Local",

      "Número documento local",

      "Ubicación",

      "Nombre del contribuyente",

      "NIT",

      "NRC",

      "Productos",

      "Total",

      "Usuario",

      "Fecha",

      "Hora"

    ];


    const rows =
      visibleSales.map(
        row => [

          currentLocalInfo.nombre ||
            "",

          currentLocalInfo.numeroDocumento ||
            "",

          currentLocalInfo.ubicacion ||
            "",

          currentLocalInfo.contribuyente ||
            "",

          currentLocalInfo.nit ||
            "",

          currentLocalInfo.nrc ||
            "",

          row.products ||
            "",

          numberOrZero(
            row.total
          ).toFixed(
            2
          ),

          row.userName ||
            "",

          row.dateStr ||
            "",

          row.timeStr ||
            ""

        ]
      );


    const {
      from,
      to
    } =
      getExportRangeTags();


    const localTag =
      sanitizeFilePart(

        currentLocalInfo.nombre ||

        currentLocalInfo.id_local

      );


    downloadCSV(

      `${localTag}_ventas_${from}_a_${to}.csv`,

      headers,

      rows

    );


    await Swal.fire({

      toast:
        true,

      position:
        "top-end",

      icon:
        "success",

      title:
        "Ventas exportadas",

      showConfirmButton:
        false,

      timer:
        1400

    });

  } catch (
    error
  ) {

    debugError(
      "Error exportando ventas:",
      error
    );


    await Swal.fire(

      "Error",

      error.message ||

      "No se pudo exportar las ventas.",

      "error"

    );
  }
}


async function exportExpensesCSV() {

  try {

    if (
      !dashboardPermissions.canExport
    ) {

      throw new Error(
        "Tu rol no tiene permiso para exportar información."
      );
    }


    await refreshDashboard();


    if (
      !visibleExpenses.length
    ) {

      await Swal.fire(

        "Sin datos",

        "No hay gastos para exportar con el rango y búsqueda seleccionados.",

        "info"

      );

      return;
    }


    const headers = [

      "Local",

      "Número documento local",

      "Ubicación",

      "Nombre del contribuyente",

      "NIT",

      "NRC",

      "Concepto",

      "Categoría",

      "Monto",

      "Método de pago",

      "Usuario",

      "Fecha",

      "Hora",

      "Observación"

    ];


    const rows =
      visibleExpenses.map(
        row => [

          currentLocalInfo.nombre ||
            "",

          currentLocalInfo.numeroDocumento ||
            "",

          currentLocalInfo.ubicacion ||
            "",

          currentLocalInfo.contribuyente ||
            "",

          currentLocalInfo.nit ||
            "",

          currentLocalInfo.nrc ||
            "",

          row.concept ||
            "",

          row.category ||
            "",

          numberOrZero(
            row.amount
          ).toFixed(
            2
          ),

          row.paymentMethod ||
            "",

          row.userName ||
            "",

          row.dateStr ||
            "",

          row.timeStr ||
            "",

          row.notes ||
            ""

        ]
      );


    const {
      from,
      to
    } =
      getExportRangeTags();


    const localTag =
      sanitizeFilePart(

        currentLocalInfo.nombre ||

        currentLocalInfo.id_local

      );


    downloadCSV(

      `${localTag}_gastos_${from}_a_${to}.csv`,

      headers,

      rows

    );


    await Swal.fire({

      toast:
        true,

      position:
        "top-end",

      icon:
        "success",

      title:
        "Gastos exportados",

      showConfirmButton:
        false,

      timer:
        1400

    });

  } catch (
    error
  ) {

    debugError(
      "Error exportando gastos:",
      error
    );


    await Swal.fire(

      "Error",

      error.message ||

      "No se pudo exportar los gastos.",

      "error"

    );
  }
}


/*
 * ============================================================
 * JSZIP
 * ============================================================
 */

let jszipLoadingPromise =
  null;


async function ensureJSZipLoaded() {

  if (
    typeof window.JSZip !==
      "undefined"
  ) {

    return window.JSZip;
  }


  if (
    jszipLoadingPromise
  ) {

    return jszipLoadingPromise;
  }


  jszipLoadingPromise =
    new Promise(

      (
        resolve,
        reject
      ) => {

        const script =
          document.createElement(
            "script"
          );


        script.src =
          "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";


        script.async =
          true;


        script.onload =
          () => {

            if (
              typeof window.JSZip !==
                "undefined"
            ) {

              resolve(
                window.JSZip
              );

            } else {

              reject(
                new Error(
                  "JSZip no está disponible."
                )
              );
            }
          };


        script.onerror =
          () => {

            reject(
              new Error(
                "No se pudo cargar JSZip."
              )
            );
          };


        document.head.appendChild(
          script
        );

      }

    )
      .finally(
        () => {

          jszipLoadingPromise =
            null;

        }
      );


  return jszipLoadingPromise;
}


/*
 * ============================================================
 * EXCEL - UTILIDADES XML
 * ============================================================
 */


/*
 * Elimina un elemento XML completo, tanto si está escrito como:
 *
 * <tag ...>...</tag>
 *
 * como si está escrito como:
 *
 * <tag .../>
 *
 * Se utiliza únicamente para los elementos de configuración de
 * impresión que controlamos nosotros.
 */

function removeXmlElement(
  xml,
  tagName
) {

  const pairPattern =
    new RegExp(

      `<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`,

      "gi"

    );


  const selfClosingPattern =
    new RegExp(

      `<${tagName}\\b[^>]*/>`,

      "gi"

    );


  return xml

    .replace(
      pairPattern,
      ""
    )

    .replace(
      selfClosingPattern,
      ""
    );
}


/*
 * Inserta contenido antes de la primera aparición de cualquiera
 * de los tags indicados.
 *
 * Esto evita colocar pageSetup en una posición inválida dentro
 * del orden OOXML de worksheet.xml.
 */

function insertXmlBeforeFirstTag(
  xml,
  tagNames,
  content
) {

  let position =
    -1;


  tagNames.forEach(
    tagName => {

      const tagPosition =
        xml.search(
          new RegExp(
            `<${tagName}\\b`,
            "i"
          )
        );


      if (
        tagPosition ===
        -1
      ) {

        return;
      }


      if (

        position ===
          -1 ||

        tagPosition <
          position

      ) {

        position =
          tagPosition;

      }

    }
  );


  if (
    position ===
    -1
  ) {

    return null;
  }


  return (

    xml.slice(
      0,
      position
    ) +

    content +

    xml.slice(
      position
    )

  );
}


/*
 * Si no existe ningún elemento posterior conocido, se inserta
 * justo antes de </worksheet>.
 */

function insertXmlBeforeWorksheetEnd(
  xml,
  content
) {

  const closingTag =
    "</worksheet>";


  const position =
    xml.lastIndexOf(
      closingTag
    );


  if (
    position ===
    -1
  ) {

    return null;
  }


  return (

    xml.slice(
      0,
      position
    ) +

    content +

    xml.slice(
      position
    )

  );
}


/*
 * ============================================================
 * EXCEL - CONFIGURACIÓN DE IMPRESIÓN
 * ============================================================
 *
 * Se configura directamente dentro del XLSX:
 *
 * Área de impresión:
 * A1:MúltimaFila
 *
 * Orientación:
 * Horizontal / landscape
 *
 * Escala:
 * 60%
 *
 * La función elimina primero cualquier configuración anterior
 * que pudiera existir, para evitar duplicados.
 */

async function enforceExcelPrintSettings(
  xlsxArrayBuffer,
  lastDataRow
) {

  const ZipClass =
    await ensureJSZipLoaded();


  const zip =
    await ZipClass.loadAsync(
      xlsxArrayBuffer
    );


  const sheetPath =
    "xl/worksheets/sheet1.xml";


  const workbookPath =
    "xl/workbook.xml";


  const sheetFile =
    zip.file(
      sheetPath
    );


  const workbookFile =
    zip.file(
      workbookPath
    );


  if (
    !sheetFile ||
    !workbookFile
  ) {

    throw new Error(
      "No se encontró la estructura XLSX esperada."
    );
  }


  /*
   * ========================================================
   * SHEET XML
   * ========================================================
   */

  let sheetXml =
    await sheetFile.async(
      "string"
    );


  /*
   * Eliminar configuraciones previas.
   */

  sheetXml =
    removeXmlElement(
      sheetXml,
      "printOptions"
    );


  sheetXml =
    removeXmlElement(
      sheetXml,
      "pageMargins"
    );


  sheetXml =
    removeXmlElement(
      sheetXml,
      "pageSetup"
    );


  /*
   * pageSetup se coloca después de las secciones que deben
   * precederlo y antes de los elementos posteriores de
   * worksheet.xml.
   *
   * Como SheetJS genera una hoja sencilla, normalmente la
   * posición efectiva será después de mergeCells y antes del
   * cierre de worksheet.
   *
   * También se contemplan elementos posteriores para mantener
   * un orden OOXML válido si aparecen.
   */

  const pageSetupXml =

    `<pageSetup orientation="landscape" scale="60"/>`;


  const elementsThatMustFollowPageSetup = [

    "headerFooter",

    "rowBreaks",

    "colBreaks",

    "customProperties",

    "cellWatches",

    "ignoredErrors",

    "smartTags",

    "drawing",

    "legacyDrawing",

    "legacyDrawingHF",

    "picture",

    "oleObjects",

    "controls",

    "webPublishItems",

    "tableParts",

    "extLst"

  ];


  let newSheetXml =
    insertXmlBeforeFirstTag(

      sheetXml,

      elementsThatMustFollowPageSetup,

      pageSetupXml

    );


  /*
   * Si la hoja no contiene ninguno de los elementos posteriores,
   * colocar pageSetup justo antes de </worksheet>.
   */

  if (
    newSheetXml ===
    null
  ) {

    newSheetXml =
      insertXmlBeforeWorksheetEnd(

        sheetXml,

        pageSetupXml

      );

  }


  if (
    newSheetXml ===
    null
  ) {

    throw new Error(
      "No se encontró una posición válida para pageSetup."
    );
  }


  sheetXml =
    newSheetXml;


  /*
   * ========================================================
   * WORKBOOK XML
   * ========================================================
   */

  let workbookXml =
    await workbookFile.async(
      "string"
    );


  /*
   * Eliminar cualquier Print_Area anterior contenido dentro
   * de definedNames.
   *
   * Primero eliminamos definedNames completo porque en este
   * controlador únicamente necesitamos establecer el área de
   * impresión de la hoja Movimientos.
   */

  workbookXml =
    removeXmlElement(
      workbookXml,
      "definedNames"
    );


  const safeLastDataRow =
    Math.max(
      1,
      Number(
        lastDataRow
      ) || 1
    );


  const definedNamesXml =

    `<definedNames>` +

      `<definedName name="_xlnm.Print_Area" localSheetId="0">` +

        `'Movimientos'!$A$1:$M$${safeLastDataRow}` +

      `</definedName>` +

    `</definedNames>`;


  /*
   * definedNames debe ir después de sheets.
   */

  const sheetsClosingTag =
    "</sheets>";


  const sheetsPosition =
    workbookXml.indexOf(
      sheetsClosingTag
    );


  if (
    sheetsPosition ===
    -1
  ) {

    throw new Error(
      "No se encontró la sección <sheets> dentro de workbook.xml."
    );

  }


  const workbookInsertionPosition =
    sheetsPosition +
    sheetsClosingTag.length;


  workbookXml =

    workbookXml.slice(
      0,
      workbookInsertionPosition
    ) +

    definedNamesXml +

    workbookXml.slice(
      workbookInsertionPosition
    );


  /*
   * ========================================================
   * GUARDAR XML
   * ========================================================
   */

  zip.file(

    sheetPath,

    sheetXml

  );


  zip.file(

    workbookPath,

    workbookXml

  );


  /*
   * Volver a generar el XLSX.
   */

  return zip.generateAsync({

    type:
      "blob",

    compression:
      "DEFLATE"

  });

}


/*
 * ============================================================
 * EXCEL - DESCARGA
 * ============================================================
 */

function downloadBlob(
  blob,
  filename
) {

  const url =
    URL.createObjectURL(
      blob
    );


  const link =
    document.createElement(
      "a"
    );


  link.href =
    url;


  link.download =
    filename;


  document.body.appendChild(
    link
  );


  link.click();


  link.remove();


  setTimeout(
    () => {

      URL.revokeObjectURL(
        url
      );

    },
    1000
  );
}


/*
 * ============================================================
 * EXCEL - MOVIMIENTOS DE INVENTARIO
 * ============================================================
 */

async function exportMovementsExcel() {

  try {

    if (
      !dashboardPermissions.canExport
    ) {

      throw new Error(

        "Tu rol no tiene permiso para exportar información."

      );

    }


    await refreshDashboard();


    if (
      !visibleMovements.length
    ) {

      await Swal.fire(

        "Sin datos",

        "No hay movimientos para exportar con el rango y búsqueda seleccionados.",

        "info"

      );

      return;

    }


    if (
      typeof window.XLSX ===
        "undefined"
    ) {

      throw new Error(

        "La librería SheetJS no está cargada."

      );

    }


    /*
     * ========================================================
     * CABECERAS
     * ========================================================
     */

    const headers = [

      "No.",

      "Fecha",

      "Producto",

      "Código",

      "Documento",

      "Libro",

      "Proveedor",

      "Costo",

      "Valor",

      "Entrada",

      "Salida",

      "Saldo ant.",

      "Saldo actual"

    ];


    /*
     * ========================================================
     * DATOS
     * ========================================================
     */

    const rows =

      visibleMovements

        .slice()

        .sort(

          (
            a,
            b
          ) =>

            numberOrZero(
              a.createdAtMs
            ) -

            numberOrZero(
              b.createdAtMs
            )

        )

        .map(

          (
            row,
            index
          ) => [

            index +
              1,

            row.dateStr,

            row.productName,

            row.productCode,

            row.docNumber,

            row.bookReference,

            row.supplierName,

            numberOrZero(
              row.unitCost
            ),

            numberOrZero(
              row.inventoryValue
            ),

            numberOrZero(
              row.entry
            ),

            numberOrZero(
              row.exit
            ),

            numberOrZero(
              row.balanceBefore
            ),

            numberOrZero(
              row.balanceAfter
            )

          ]

        );


    /*
     * ========================================================
     * HOJA
     * ========================================================
     *
     * Todas las filas tienen exactamente 13 columnas A:M.
     * ========================================================
     */

    const sheetData = [

      /*
       * Fila 1
       */
      [
        "CONTROL DE INVENTARIO",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        ""
      ],


      /*
       * Fila 2
       */
      [
        "Nombre del local",
        "",
        "",
        currentLocalInfo.nombre ||
          "—",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        ""
      ],


      /*
       * Fila 3
       */
      [
        "Nombre del contribuyente",
        "",
        "",
        currentLocalInfo.contribuyente ||
          "—",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        ""
      ],


      /*
       * Fila 4
       */
      [
        "Tipo de documento",
        "",
        currentLocalInfo.tipoDocumento ||
          "—",
        "",
        "NIT",
        "",
        currentLocalInfo.nit ||
          "—",
        "",
        "NRC",
        "",
        currentLocalInfo.nrc ||
          "—",
        ""
      ],


      /*
       * Fila 5
       */
      [
        "Número de documento",
        "",
        "",
        currentLocalInfo.numeroDocumento ||
          "—",
        "",
        "",
        "Ubicación",
        "",
        currentLocalInfo.ubicacion ||
          "—",
        "",
        "",
        "",
        ""
      ],


      /*
       * Fila 6
       */
      [
        "Período",
        "",
        "",
        formatPeriodForExcel(),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        ""
      ],


      /*
       * Fila 7
       */
      [
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        ""
      ],


      /*
       * Fila 8
       */
      headers,


      /*
       * Fila 9 en adelante
       */
      ...rows

    ];


    /*
     * ========================================================
     * CREAR WORKSHEET
     * ========================================================
     */

    const worksheet =
      window.XLSX.utils.aoa_to_sheet(
        sheetData
      );


    /*
     * ========================================================
     * COMBINACIONES DE CELDAS
     * ========================================================
     *
     * Las fusiones se generan mediante la API nativa de
     * SheetJS.
     *
     * No se modifican manualmente después.
     * ========================================================
     */

    worksheet["!merges"] = [

      /*
       * TÍTULO
       * A1:M1
       */
      {
        s: {
          r: 0,
          c: 0
        },

        e: {
          r: 0,
          c: 12
        }
      },


      /*
       * LOCAL
       * A2:C2
       * D2:M2
       */
      {
        s: {
          r: 1,
          c: 0
        },

        e: {
          r: 1,
          c: 2
        }
      },

      {
        s: {
          r: 1,
          c: 3
        },

        e: {
          r: 1,
          c: 12
        }
      },


      /*
       * CONTRIBUYENTE
       * A3:C3
       * D3:M3
       */
      {
        s: {
          r: 2,
          c: 0
        },

        e: {
          r: 2,
          c: 2
        }
      },

      {
        s: {
          r: 2,
          c: 3
        },

        e: {
          r: 2,
          c: 12
        }
      },


      /*
       * TIPO DE DOCUMENTO
       * A4:B4
       * C4:D4
       */
      {
        s: {
          r: 3,
          c: 0
        },

        e: {
          r: 3,
          c: 1
        }
      },

      {
        s: {
          r: 3,
          c: 2
        },

        e: {
          r: 3,
          c: 3
        }
      },


      /*
       * NIT
       * E4:F4
       * G4:H4
       */
      {
        s: {
          r: 3,
          c: 4
        },

        e: {
          r: 3,
          c: 5
        }
      },

      {
        s: {
          r: 3,
          c: 6
        },

        e: {
          r: 3,
          c: 7
        }
      },


      /*
       * NRC
       * I4:J4
       * K4:M4
       */
      {
        s: {
          r: 3,
          c: 8
        },

        e: {
          r: 3,
          c: 9
        }
      },

      {
        s: {
          r: 3,
          c: 10
        },

        e: {
          r: 3,
          c: 12
        }
      },


      /*
       * NÚMERO DE DOCUMENTO
       * A5:C5
       * D5:F5
       */
      {
        s: {
          r: 4,
          c: 0
        },

        e: {
          r: 4,
          c: 2
        }
      },

      {
        s: {
          r: 4,
          c: 3
        },

        e: {
          r: 4,
          c: 5
        }
      },


      /*
       * UBICACIÓN
       * G5:H5
       * I5:M5
       */
      {
        s: {
          r: 4,
          c: 6
        },

        e: {
          r: 4,
          c: 7
        }
      },

      {
        s: {
          r: 4,
          c: 8
        },

        e: {
          r: 4,
          c: 12
        }
      },


      /*
       * PERÍODO
       * A6:C6
       * D6:M6
       */
      {
        s: {
          r: 5,
          c: 0
        },

        e: {
          r: 5,
          c: 2
        }
      },

      {
        s: {
          r: 5,
          c: 3
        },

        e: {
          r: 5,
          c: 12
        }
      }

    ];


    /*
     * ========================================================
     * ANCHOS DE COLUMNA
     * ========================================================
     */

    worksheet["!cols"] = [

      {
        wch:
          6
      },

      {
        wch:
          11
      },

      {
        wch:
          24
      },

      {
        wch:
          14
      },

      {
        wch:
          17
      },

      {
        wch:
          17
      },

      {
        wch:
          24
      },

      {
        wch:
          12
      },

      {
        wch:
          14
      },

      {
        wch:
          10
      },

      {
        wch:
          10
      },

      {
        wch:
          12
      },

      {
        wch:
          13
      }

    ];


    /*
     * ========================================================
     * ALTURAS DE FILA
     * ========================================================
     */

    worksheet["!rows"] = [

      {
        hpt:
          28
      },

      {
        hpt:
          21
      },

      {
        hpt:
          21
      },

      {
        hpt:
          21
      },

      {
        hpt:
          21
      },

      {
        hpt:
          21
      },

      {
        hpt:
          8
      },

      {
        hpt:
          24
      }

    ];


    /*
     * ========================================================
     * WORKBOOK
     * ========================================================
     */

    const workbook =
      window.XLSX.utils.book_new();


    window.XLSX.utils.book_append_sheet(

      workbook,

      worksheet,

      "Movimientos"

    );


    /*
     * ========================================================
     * NOMBRE DE ARCHIVO
     * ========================================================
     */

    const {
      from,
      to
    } =
      getExportRangeTags();


    const localTag =
      sanitizeFilePart(

        currentLocalInfo.nombre ||

        currentLocalInfo.id_local ||

        "local"

      );


    const fileName =

      `${localTag}_movimientos_inventario_${from}_a_${to}.xlsx`;


    /*
     * ========================================================
     * GENERAR XLSX CON SHEETJS
     * ========================================================
     */

    const xlsxArray =
      window.XLSX.write(

        workbook,

        {

          bookType:
            "xlsx",

          type:
            "array",

          compression:
            true,

          cellStyles:
            true

        }

      );


    /*
     * ========================================================
     * CONFIGURACIÓN DE IMPRESIÓN
     * ========================================================
     *
     * Se aplica después de que SheetJS genera el XLSX.
     *
     * Esto permite conservar:
     *
     * - Las fusiones A1:M1, etc.
     * - Área de impresión
     * - Orientación Horizontal
     * - Escala 60%
     *
     * La modificación se hace sobre elementos OOXML válidos.
     * ========================================================
     */

    const finalBlob =
      await enforceExcelPrintSettings(

        xlsxArray,

        sheetData.length

      );


    /*
     * ========================================================
     * DESCARGA
     * ========================================================
     */

    downloadBlob(

      finalBlob,

      fileName

    );


    await Swal.fire({

      toast:
        true,

      position:
        "top-end",

      icon:
        "success",

      title:
        "Excel generado",

      showConfirmButton:
        false,

      timer:
        1800

    });

  } catch (
    error
  ) {

    debugError(

      "Error exportando movimientos:",

      error

    );


    await Swal.fire(

      "Error",

      error.message ||

      "No se pudo generar el archivo Excel.",

      "error"

    );

  }

}


function formatPeriodForExcel() {

  const from =
    selectedRange.from

      ? selectedRange.from.toLocaleDateString(
          "es-ES"
        )

      : "—";


  const to =
    selectedRange.to

      ? selectedRange.to.toLocaleDateString(
          "es-ES"
        )

      : "—";


  return `${from} al ${to}`;

}


/*
 * ============================================================
 * CIERRE DE CAJA
 * ============================================================
 */

async function closeDay() {

  if (
    !dashboardPermissions.canCloseDay
  ) {

    await Swal.fire(

      "Acceso denegado",

      "Tu rol no tiene permiso para registrar cierres de caja.",

      "warning"

    );

    return;
  }


  const confirmation =
    await Swal.fire({

      title:
        "¿Registrar cierre de caja?",

      html:
        "Se calcularán las ventas registradas hoy y del local actual.",

      icon:
        "question",

      showCancelButton:
        true,

      confirmButtonText:
        "Sí, registrar",

      cancelButtonText:
        "Cancelar"

    });


  if (
    !confirmation.isConfirmed
  ) {

    return;
  }


  try {

    await refreshDashboard();


    const now =
      new Date();


    const start =
      new Date(

        now.getFullYear(),

        now.getMonth(),

        now.getDate(),

        0,

        0,

        0,

        0

      );


    const end =
      new Date(

        now.getFullYear(),

        now.getMonth(),

        now.getDate(),

        23,

        59,

        59,

        999

      );


    let total =
      0;


    rawSalesDocs.forEach(

      ({
        data
      }) => {

        const timestamp =
          getTimestampMs(
            data.createdAt
          );


        if (
          !timestamp
        ) {

          return;
        }


        const created =
          new Date(
            timestamp
          );


        if (

          created <
            start ||

          created >
            end

        ) {

          return;
        }


        total +=
          numberOrZero(
            data.total
          );

      }

    );


    const payload = {

      date:
        window.firebase.firestore
          .FieldValue
          .serverTimestamp(),

      dateString:
        toLocalInputDate(
          start
        ),

      total,

      createdBy:
        window.auth?.currentUser?.uid ||
        null,

      type:
        "ventas",

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
        ""

    };


    const ref =
      await window.db
        .collection(
          CASH_CLOSE_COLLECTION_NAME
        )
        .add(
          payload
        );


    if (
      typeof window.upsertSessionDocument ===
        "function"
    ) {

      window.upsertSessionDocument(

        CASH_CLOSE_COLLECTION_NAME,

        ref.id,

        {

          ...payload,

          date:
            Date.now()

        }

      );
    }


    await Swal.fire({

      icon:
        "success",

      title:
        "Cierre registrado",

      text:
        `Total del día: ${formatMoney(
          total
        )}`

    });

  } catch (
    error
  ) {

    debugError(
      "Error en cierre de caja:",
      error
    );


    await Swal.fire(

      "Error",

      error.message ||

      "No se pudo registrar el cierre.",

      "error"

    );
  }
}


/*
 * ============================================================
 * RANGO
 * ============================================================
 */

async function applyRange() {

  const fromValue =
    elements.rangeFrom?.value ||
    "";


  const toValue =
    elements.rangeTo?.value ||
    "";


  if (
    fromValue &&
    toValue
  ) {

    const from =
      startOfDay(
        fromValue
      );


    const to =
      endOfDay(
        toValue
      );


    if (

      from &&

      to &&

      from >
        to

    ) {

      await Swal.fire(

        "Rango inválido",

        "La fecha inicial no puede ser mayor que la fecha final.",

        "warning"

      );


      return;
    }
  }


  try {

    await refreshDashboard();

  } catch (
    error
  ) {

    debugError(
      "Error aplicando rango:",
      error
    );


    await Swal.fire(

      "Error",

      error.message ||

      "No se pudo aplicar el rango.",

      "error"

    );
  }
}


async function resetRange() {

  setDefaultRangeToMonth();


  if (
    elements.rangeSearch
  ) {

    elements.rangeSearch.value =
      "";
  }


  try {

    await refreshDashboard();

  } catch (
    error
  ) {

    debugError(
      "Error restaurando rango:",
      error
    );


    await Swal.fire(

      "Error",

      error.message ||

      "No se pudo restaurar el rango.",

      "error"

    );
  }
}


/*
 * ============================================================
 * EVENTOS
 * ============================================================
 */

function bindEvents() {

  elements.btnGoInventory?.addEventListener(

    "click",

    () => {

      window.location.href =
        "inventory.html";

    }

  );


  elements.btnCloseDay?.addEventListener(

    "click",

    closeDay

  );


  elements.btnApplyRange?.addEventListener(

    "click",

    applyRange

  );


  elements.btnResetRange?.addEventListener(

    "click",

    resetRange

  );


  elements.btnExportSalesCSV?.addEventListener(

    "click",

    exportSalesCSV

  );


  elements.btnExportExpensesCSV?.addEventListener(

    "click",

    exportExpensesCSV

  );


  elements.btnExportMovementsExcel?.addEventListener(

    "click",

    exportMovementsExcel

  );


  elements.rangeSearch?.addEventListener(

    "input",

    applySearchFilter

  );

}


/*
 * ============================================================
 * ESTILOS
 * ============================================================
 */

function injectDashboardStyles() {

  if (
    document.getElementById(
      "dashboardExtraStyles"
    )
  ) {

    return;
  }


  const style =
    document.createElement(
      "style"
    );


  style.id =
    "dashboardExtraStyles";


  style.textContent = `

    .dashboard-hero {
      display:flex;
      justify-content:space-between;
      gap:16px;
      align-items:stretch;
      flex-wrap:wrap;
      margin-bottom:20px;
    }

    .eyebrow {
      margin:0 0 8px;
      text-transform:uppercase;
      letter-spacing:.08em;
      font-size:.8rem;
      font-weight:800;
      color:#2563eb;
    }

    .hero-subtitle {
      margin:8px 0 0;
      color:#6b7280;
    }

    .hero-note {
      background:#fff;
      border:1px solid #e5e7eb;
      border-radius:14px;
      padding:16px;
      box-shadow:0 6px 20px rgba(15,23,42,.08);
      min-width:280px;
      flex:1;
    }

    .chart-card,
    .panel-card,
    .table-section,
    .info-card,
    .filter-panel {
      background:#fff;
      border:1px solid #e5e7eb;
      border-radius:16px;
      box-shadow:0 8px 24px rgba(15,23,42,.08);
    }

    .chart-card {
      padding:18px;
    }

    .dashboard-grid {
      display:grid;
      grid-template-columns:minmax(0,1.8fr) minmax(320px,1fr);
      gap:18px;
      margin-bottom:24px;
    }

    .side-panel {
      display:flex;
      flex-direction:column;
      gap:14px;
    }

    .panel-card {
      padding:16px;
    }

    .panel-actions {
      display:flex;
      gap:10px;
      flex-wrap:wrap;
    }

    .panel-actions button,
    .secondary-btn,
    .filter-actions button {
      border:0;
      border-radius:10px;
      padding:10px 14px;
      font:inherit;
      font-weight:700;
      cursor:pointer;
    }

    .panel-actions button:disabled,
    .secondary-btn:disabled,
    .filter-actions button:disabled {
      cursor:not-allowed;
      opacity:.55;
    }

    .secondary-btn {
      background:#eef2ff;
      color:#1d4ed8;
    }

    .table-section {
      padding:18px;
      margin-bottom:20px;
    }

    .section-header {
      display:flex;
      justify-content:space-between;
      gap:12px;
      align-items:center;
      flex-wrap:wrap;
      margin-bottom:14px;
    }

    .section-header h2,
    .section-header h3 {
      margin:0;
    }

    .section-header p {
      margin:6px 0 0;
      color:#6b7280;
    }

    .table-toolbar {
      display:flex;
      justify-content:space-between;
      gap:12px;
      align-items:center;
      flex-wrap:wrap;
      margin-bottom:12px;
    }

    .filter-panel {
      padding:14px;
      margin-bottom:18px;
    }

    .filter-grid {
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:12px;
      margin-bottom:12px;
    }

    .filter-field label {
      display:block;
      font-size:.9rem;
      font-weight:700;
      margin-bottom:6px;
      color:#374151;
    }

    .filter-field input {
      width:100%;
    }

    .filter-actions {
      display:flex;
      gap:10px;
      flex-wrap:wrap;
    }

    .no-alerts {
      color:#6b7280;
    }

    .status-panel__label {
      font-size:.8rem;
      text-transform:uppercase;
      letter-spacing:.06em;
      opacity:.8;
      margin-bottom:6px;
      font-weight:700;
    }

    .status-panel__value {
      font-size:1rem;
      font-weight:800;
      line-height:1.35;
    }

    .status-panel--danger {
      background:linear-gradient(135deg,#fee2e2,#fff);
      border-color:#fecaca;
      color:#991b1b;
    }

    .status-panel--warning {
      background:linear-gradient(135deg,#fef3c7,#fff);
      border-color:#fde68a;
      color:#92400e;
    }

    .status-panel--success {
      background:linear-gradient(135deg,#dcfce7,#fff);
      border-color:#bbf7d0;
      color:#166534;
    }

    .low-stock-item--rich {
      display:flex;
      justify-content:space-between;
      gap:14px;
      align-items:flex-start;
      padding:12px 14px;
      border:1px solid #fde68a;
      border-radius:12px;
      background:linear-gradient(135deg,#fff,#fffbeb);
      margin-bottom:10px;
    }

    .low-stock-item__left {
      min-width:0;
    }

    .low-stock-item__left strong {
      display:block;
      font-size:.98rem;
      color:#111827;
      margin-bottom:4px;
    }

    .low-stock-item__muted {
      font-size:.85rem;
      color:#6b7280;
    }

    .low-stock-item__right {
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:6px 12px;
      min-width:180px;
      text-align:right;
    }

    .low-stock-item__right span {
      display:block;
      font-size:.72rem;
      text-transform:uppercase;
      letter-spacing:.04em;
      color:#6b7280;
    }

    .low-stock-item__right strong {
      display:block;
      font-size:.95rem;
      color:#111827;
    }

    @media (max-width:992px) {

      .dashboard-grid {
        grid-template-columns:1fr;
      }

      .filter-grid {
        grid-template-columns:1fr;
      }

    }

    @media (max-width:768px) {

      .low-stock-item--rich {
        flex-direction:column;
      }

      .low-stock-item__right {
        width:100%;
        min-width:0;
        text-align:left;
        grid-template-columns:1fr 1fr;
      }

    }

  `;


  document.head.appendChild(
    style
  );
}


/*
 * ============================================================
 * INIT
 * ============================================================
 */

async function init(
  user
) {

  if (
    initialized
  ) {

    return;
  }


  elements =
    dashboardView.getElements();


  if (
    !elements.salesTableBody ||
    !elements.rangeFrom ||
    !elements.rangeTo
  ) {

    throw new Error(
      "La vista dashboard.html no contiene todos los elementos requeridos."
    );
  }


  injectDashboardStyles();


  bindEvents();


  initialized =
    true;


  try {

    await resolveDashboardContext(
      user
    );


    setDefaultRangeToMonth();


    await refreshDashboard();


    debugLog(
      "Dashboard inicializado correctamente."
    );

  } catch (
    error
  ) {

    initialized =
      false;


    debugError(
      "Error inicializando dashboard:",
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
          "No se pudo cargar el dashboard",

        text:
          error.message ||

          "No se pudo cargar la información del dashboard."

      });
    }


    throw error;
  }
}


/*
 * ============================================================
 * CONTROLADOR EXPORTADO
 * ============================================================
 */

const dashboardController = Object.freeze({

  name:
    "dashboard",

  page:
    dashboardModel.page,

  roles:
    dashboardModel.roles,

  public:
    false,

  requiresLocal:
    dashboardModel.requiresLocal,

  init

});


export {

  init

};


export default dashboardController;