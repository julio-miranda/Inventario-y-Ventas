// assets/js/sales.js
//
// Ventas:
// - Stock actual = stockCurrentUnits / quantity.
// - Al registrar una venta se descuenta inventario.
// - Las ventas pertenecen a un local.
// - No existe información de clientes en este módulo.
//
// Optimización:
// - El empleado y el local ya NO se consultan directamente aquí.
// - sales.js reutiliza window.getCurrentUserContext() definido en app.js.
// - app.js mantiene caché y deduplicación de consultas.
//
// Edición de ventas:
// - Solo Administrador puede editar.
// - SOLO se pueden modificar:
//     • Referencia
//     • Fecha
//     • Hora
// - Productos, cantidades, precios y total son de solo lectura.
// - Cambiar referencia, fecha u hora NO modifica inventario.
//
// Eliminación de ventas:
// - Solo Administrador puede eliminar.
// - Devuelve al inventario las unidades descontadas.
// - Los movimientos originales NO se eliminan.
// - Se genera un movimiento "eliminacion_venta".

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

const logoutBtn =
  document.getElementById(
    "logoutButton"
  );

const userGreeting =
  document.querySelectorAll(
    ".userGreeting"
  );

let salesDataTable =
  null;

let PRODUCTS_CACHE =
  {};

let MONTHLY_SOLD_UNITS =
  {};

let CART =
  [];

let SALES_CACHE =
  {};

let isFinalizingSale =
  false;

let isSavingDraft =
  false;

let isAddingToCart =
  false;

let editingSaleIds =
  new Set();

let deletingSaleIds =
  new Set();

let saleSaveTimers =
  {};

let currentLocalId =
  "";

let currentLocalInfo = {
  id_local: "",
  nombre: "",
  numeroDocumento: "",
  ubicacion: "",
  contribuyente: "",
  tipoDocumento: "",
  nit: "",
  nrc: ""
};

let currentSalesContext =
  null;

/*
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

const currency =
  n =>
    `$${Number(
      n || 0
    ).toFixed(2)}`;

function isTinyScreen() {
  return (
    window.innerWidth <=
    425
  );
}

function numberOrZero(
  v
) {
  const n =
    Number(v);

  return Number.isFinite(
    n
  )
    ? n
    : 0;
}

function formatDateOnly(
  v
) {
  if (!v) return "-";

  const d =
    v.seconds
      ? new Date(
          v.seconds * 1000
        )
      : new Date(v);

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
  v
) {
  if (!v) return "-";

  const d =
    v.seconds
      ? new Date(
          v.seconds * 1000
        )
      : new Date(v);

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
  v
) {
  if (!v) {
    return "";
  }

  const d =
    v.seconds
      ? new Date(
          v.seconds * 1000
        )
      : new Date(v);

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
      d.getMonth() + 1
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
  v
) {
  if (!v) {
    return "";
  }

  const d =
    v.seconds
      ? new Date(
          v.seconds * 1000
        )
      : new Date(v);

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
  ] =
    dateParts;

  const [
    hours,
    minutes
  ] =
    timeParts;

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
  v
) {
  if (!v) {
    return null;
  }

  const d =
    v.seconds
      ? new Date(
          v.seconds * 1000
        )
      : new Date(v);

  const time =
    d.getTime();

  return Number.isFinite(
    time
  )
    ? time
    : null;
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
 * CONTEXTO CENTRALIZADO
 * ============================================================
 */

function getStoredUserName() {
  const context =
    currentSalesContext;

  if (
    context &&
    context.name
  ) {
    return context.name;
  }

  if (
    typeof window
      .getStoredCurrentUser ===
    "function"
  ) {
    const stored =
      window.getStoredCurrentUser();

    if (
      stored &&
      stored.name
    ) {
      return stored.name;
    }
  }

  if (
    auth.currentUser &&
    auth.currentUser.displayName
  ) {
    return auth.currentUser.displayName;
  }

  return null;
}

function getStoredCurrentUser() {
  if (
    typeof window
      .getStoredCurrentUser ===
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

function isAdministrator() {
  const context =
    currentSalesContext;

  const role =
    context?.role ||
    getStoredCurrentUser()
      ?.role ||
    "";

  const canonical =
    typeof window
      .getCanonicalRole ===
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

  /*
   * Reutilizar el contexto central de app.js.
   */
  if (
    typeof window
      .getCurrentUserContext !==
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

  if (!currentLocalId) {
    throw new Error(
      "El usuario autenticado no tiene un id_local asignado."
    );
  }

  userGreeting.forEach(
    element => {
      element.textContent =
        `Hola, ${context.name || "Usuario"} (${context.role || ""})`;
    }
  );

  return context;
}

function syncLocalContextFromStorage() {
  const stored =
    getStoredCurrentUser();

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
    typeof window
      .getCurrentLocalId ===
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
    typeof window
      .getCurrentLocalInfo ===
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
          info.id_local || ""
        ).trim(),

      nombre:
        String(
          info.nombre || ""
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
 * PRODUCTOS / INVENTARIO
 * ============================================================
 */

function normalizeUnitsPerBox(
  prod
) {
  const v =
    numberOrZero(
      prod &&
      prod.unitsPerBox
    );

  return v > 0
    ? v
    : 1;
}

function isBoxProduct(
  prod
) {
  return Boolean(
    prod &&
    (
      prod.saleByBox === true ||
      prod.saleMode === "box" ||
      prod.saleType === "box"
    )
  );
}

function getDefaultSaleMode(
  prod
) {
  return isBoxProduct(
    prod
  )
    ? "box"
    : "unit";
}

function getDefaultBoxPrice(
  prod
) {
  const unitsPerBox =
    normalizeUnitsPerBox(
      prod
    );

  const saved =
    numberOrZero(
      prod &&
      prod.boxPrice
    );

  if (saved > 0) {
    return saved;
  }

  return (
    numberOrZero(
      prod &&
      prod.price
    ) *
    unitsPerBox
  );
}

function getProductStockField(
  prod
) {
  if (!prod) {
    return 0;
  }

  const current =
    Number(
      prod.stockCurrentUnits
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
      prod.quantity
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
      prod.stockBaseUnits
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
  prod
) {
  return getProductStockField(
    prod
  );
}

function getAvailableBoxes(
  prod
) {
  const unitsPerBox =
    normalizeUnitsPerBox(
      prod
    );

  const availableUnits =
    getAvailableUnits(
      prod
    );

  return Math.floor(
    availableUnits /
    unitsPerBox
  );
}

/*
 * ============================================================
 * FUNCIONES DE VENTA
 * ============================================================
 */

function startOfCurrentMonth() {
  const d =
    new Date();

  d.setDate(
    1
  );

  d.setHours(
    0,
    0,
    0,
    0
  );

  return d;
}

function getSaleProductId(
  p
) {
  if (!p) {
    return "";
  }

  const value =
    p.productId ||
    p.productID ||
    p.product_id ||
    p.id;

  return value
    ? String(value)
    : "";
}

function getReferenciaLibro() {
  const referencia =
    String(
      referenciaLibroInput
        ? referenciaLibroInput.value
        : ""
    ).trim();

  return (
    referencia ||
    "venta"
  );
}

function clearReferenciaLibro() {
  if (
    referenciaLibroInput
  ) {
    referenciaLibroInput.value =
      "";
  }
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
    explicitUnits > 0
  ) {
    return explicitUnits;
  }

  if (
    mode === "box"
  ) {
    return (
      quantity *
      unitsPerBox
    );
  }

  return quantity;
}

function aggregateMonthlySales(
  snapshot
) {
  const unitsMap =
    {};

  snapshot.forEach(
    doc => {
      const sale =
        doc.data();

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
        p => {
          const productId =
            getSaleProductId(
              p
            );

          if (!productId) {
            return;
          }

          const soldUnits =
            getSaleUnitsForProduct(
              p
            );

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
  } catch (err) {
    console.warn(
      "No se pudo inicializar Select2:",
      err
    );
  }
}

function refreshSaleModeUI() {
  const productId =
    productSelect
      ? productSelect.value
      : "";

  const prod =
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
      mode === "box"
        ? "Cantidad (cajas)"
        : "Cantidad (unidades)";
  }

  if (
    boxPriceGroup
  ) {
    boxPriceGroup.style.display =
      mode === "box"
        ? "block"
        : "none";
  }

  if (
    mode === "box"
  ) {
    if (prod) {
      boxPriceInput.value =
        getDefaultBoxPrice(
          prod
        ).toFixed(2);
    } else if (
      !boxPriceInput.value ||
      numberOrZero(
        boxPriceInput.value
      ) <= 0
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

  const prod =
    productId
      ? PRODUCTS_CACHE[
          productId
        ]
      : null;

  if (!saleModeSelect) {
    return;
  }

  saleModeSelect.value =
    prod
      ? getDefaultSaleMode(
          prod
        )
      : "unit";

  refreshSaleModeUI();
}

function refreshProductSelectText() {
  if (!productSelect) {
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

  if (!entries.length) {
    const opt =
      document.createElement(
        "option"
      );

    opt.value =
      "";

    opt.textContent =
      "No hay productos";

    productSelect.appendChild(
      opt
    );

    return;
  }

  entries
    .sort(
      (a, b) =>
        String(
          a[1].name || ""
        ).localeCompare(
          String(
            b[1].name || ""
          )
        )
    )
    .forEach(
      ([id, p]) => {
        const availableUnits =
          getAvailableUnits(
            p
          );

        const unitsPerBox =
          normalizeUnitsPerBox(
            p
          );

        const availableBoxes =
          getAvailableBoxes(
            p
          );

        const boxPrice =
          getDefaultBoxPrice(
            p
          );

        const opt =
          document.createElement(
            "option"
          );

        opt.value =
          id;

        let label =
          `${p.name || "-"} — ${currency(
            p.price
          )} c/u`;

        if (
          unitsPerBox > 1
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
            p
          )
        ) {
          label +=
            " — venta por cajas";
        }

        opt.textContent =
          label;

        productSelect.appendChild(
          opt
        );
      }
    );

  if (currentValue) {
    productSelect.value =
      currentValue;
  }

  if (
    window.jQuery &&
    typeof $.fn.select2 ===
      "function"
  ) {
    $("#productSelect")
      .trigger(
        "change.select2"
      );
  }
}

/*
 * Listener de productos.
 *
 * Se filtra en memoria por local porque Firestore
 * ya está entregando la colección necesaria para el
 * módulo.
 */
function loadProductsRealtime() {
  db.collection(
    "productos"
  )
    .orderBy(
      "name"
    )
    .onSnapshot(
      snapshot => {
        PRODUCTS_CACHE =
          {};

        snapshot.forEach(
          doc => {
            const p =
              doc.data();

            if (
              !matchesCurrentLocal(
                p
              )
            ) {
              return;
            }

            const currentStockUnits =
              Number.isFinite(
                Number(
                  p.stockCurrentUnits
                )
              )
                ? Math.max(
                    0,
                    numberOrZero(
                      p.stockCurrentUnits
                    )
                  )
                : Number.isFinite(
                    Number(
                      p.quantity
                    )
                  )
                  ? Math.max(
                      0,
                      numberOrZero(
                        p.quantity
                      )
                    )
                  : Number.isFinite(
                      Number(
                        p.stockBaseUnits
                      )
                    )
                    ? Math.max(
                        0,
                        numberOrZero(
                          p.stockBaseUnits
                        )
                      )
                    : 0;

            PRODUCTS_CACHE[
              doc.id
            ] = {
              id:
                doc.id,

              ...p,

              quantity:
                currentStockUnits,

              stockCurrentUnits:
                currentStockUnits,

              stockBaseUnits:
                numberOrZero(
                  p.stockBaseUnits
                ),

              boxes:
                numberOrZero(
                  p.boxes
                ),

              unitsPerBox:
                normalizeUnitsPerBox(
                  p
                ),

              saleByBox:
                !!p.saleByBox
            };
          }
        );

        refreshProductSelectText();

        syncModeFromProduct();
      },
      err => {
        console.error(
          "Error cargando productos:",
          err
        );

        Swal.fire(
          "Error",
          "No se pudieron cargar los productos.",
          "error"
        );
      }
    );
}

function loadMonthlySalesRealtime() {
  const monthStart =
    startOfCurrentMonth();

  db.collection(
    "ventas"
  )
    .where(
      "createdAt",
      ">=",
      monthStart
    )
    .onSnapshot(
      snapshot => {
        MONTHLY_SOLD_UNITS =
          aggregateMonthlySales(
            snapshot
          );

        refreshProductSelectText();

        syncModeFromProduct();

        renderCart();
      },
      err => {
        console.error(
          "Error cargando ventas del mes:",
          err
        );

        MONTHLY_SOLD_UNITS =
          {};

        refreshProductSelectText();

        syncModeFromProduct();
      }
    );
}

function getLinePrice(
  prod,
  mode,
  customBoxPrice = null
) {
  if (
    mode === "box"
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
      prod
    );
  }

  return numberOrZero(
    prod.price
  );
}

/*
 * ============================================================
 * CARRITO
 * ============================================================
 */

function addToCart() {
  if (isAddingToCart) {
    return;
  }

  isAddingToCart =
    true;

  try {
    const productId =
      productSelect
        ? productSelect.value
        : "";

    if (!productId) {
      Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "warning",

        title:
          "Selecciona un producto"
      });

      return;
    }

    const prod =
      PRODUCTS_CACHE[
        productId
      ];

    if (!prod) {
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
            prod
          );

    const qty =
      Math.max(
        1,
        Number(
          saleQuantityInput.value ||
          1
        )
      );

    const unitsPerBox =
      normalizeUnitsPerBox(
        prod
      );

    const availableUnits =
      getAvailableUnits(
        prod
      );

    if (
      mode === "box" &&
      unitsPerBox <= 1
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
        prod,
        mode,
        boxPriceInput
          ? boxPriceInput.value
          : null
      );

    const unitsToDiscount =
      mode === "box"
        ? qty *
          unitsPerBox
        : qty;

    const alreadyUnitsInCart =
      CART
        .filter(
          i =>
            i.productId ===
            productId
        )
        .reduce(
          (sum, i) =>
            sum +
            numberOrZero(
              i.unitsTotal
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
        i =>
          i.productId ===
            productId &&
          i.mode ===
            mode &&
          Number(
            i.price
          ) ===
            Number(
              linePrice
            )
      );

    if (currentInCart) {
      currentInCart.quantity +=
        qty;

      currentInCart.unitsTotal +=
        unitsToDiscount;

      currentInCart.total =
        currentInCart.quantity *
        currentInCart.price;
    } else {
      CART.push({
        productId,

        name:
          prod.name,

        mode,

        price:
          linePrice,

        quantity:
          qty,

        unitsPerBox,

        unitsTotal:
          unitsToDiscount,

        total:
          qty *
          linePrice
      });
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
      1;

    if (
      mode === "box" &&
      productId
    ) {
      boxPriceInput.value =
        getDefaultBoxPrice(
          prod
        ).toFixed(2);
    }

    if (
      window.jQuery &&
      typeof $.fn.select2 ===
        "function"
    ) {
      $("#productSelect")
        .val(null)
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
      (sum, item) =>
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
    CART.length === 0 ||
    isFinalizingSale;

  return subtotal;
}

function syncCartInputsLayout() {
  if (!cartTableBody) {
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
      btn => {
        btn.style.width =
          isTinyScreen()
            ? "100%"
            : "";
      }
    );
}

function renderCart() {
  if (!cartTableBody) {
    return;
  }

  cartTableBody.innerHTML =
    "";

  if (!CART.length) {
    cartTableBody.innerHTML =
      '<tr><td colspan="5">El carrito está vacío.</td></tr>';

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
      idx
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

      tdName.innerHTML = `
        ${escapeHtml(
          item.name
        )}
        <br>
        <small>
          ${
            item.mode === "box"
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
        1;

      qtyInput.step =
        1;

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
        e => {
          const val =
            Number(
              e.target.value
            );

          if (
            !Number.isFinite(
              val
            ) ||
            val < 1
          ) {
            return;
          }

          const prod =
            PRODUCTS_CACHE[
              item.productId
            ];

          const availableUnits =
            getAvailableUnits(
              prod
            );

          const unitsPerBox =
            normalizeUnitsPerBox(
              prod
            );

          const newUnitsTotal =
            item.mode === "box"
              ? val *
                unitsPerBox
              : val;

          const currentInCartUnits =
            CART
              .filter(
                i =>
                  i.productId ===
                    item.productId &&
                  i !== item
              )
              .reduce(
                (sum, i) =>
                  sum +
                  numberOrZero(
                    i.unitsTotal
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

            e.target.value =
              item.quantity;

            return;
          }

          item.quantity =
            val;

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
        0;

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
        e => {
          const val =
            Number(
              e.target.value
            );

          if (
            !Number.isFinite(
              val
            ) ||
            val < 0
          ) {
            return;
          }

          item.price =
            val;

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

      const removeBtn =
        document.createElement(
          "button"
        );

      removeBtn.className =
        "btn-outline";

      removeBtn.type =
        "button";

      removeBtn.dataset.cartRemove =
        "1";

      removeBtn.innerHTML =
        '<i class="fas fa-trash"></i> Quitar';

      removeBtn.style.width =
        isTinyScreen()
          ? "100%"
          : "";

      removeBtn.addEventListener(
        "click",
        () => {
          CART.splice(
            idx,
            1
          );

          renderCart();
        }
      );

      tdActions.appendChild(
        removeBtn
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
  if (!CART.length) {
    return;
  }

  if (confirmFirst) {
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
      res => {
        if (
          res.isConfirmed
        ) {
          CART = [];
          renderCart();
        }
      }
    );
  } else {
    CART = [];
    renderCart();
  }
}

function serializeCart() {
  return CART.map(
    i => ({
      productId:
        i.productId,

      name:
        i.name,

      price:
        Number(
          i.price ||
          0
        ),

      quantity:
        Number(
          i.quantity ||
          0
        ),

      mode:
        i.mode,

      unitsPerBox:
        Number(
          i.unitsPerBox ||
          1
        ),

      unitsTotal:
        Number(
          i.unitsTotal ||
          0
        ),

      total:
        Number(
          i.total ||
          0
        )
    })
  );
}

/*
 * ============================================================
 * FINALIZAR VENTA
 * ============================================================
 */

async function finalizeSale() {
  if (isFinalizingSale) {
    return;
  }

  if (!CART.length) {
    Swal.fire(
      "Carrito vacío",
      "Agrega productos al carrito antes de finalizar.",
      "info"
    );

    return;
  }

  if (!currentLocalId) {
    Swal.fire(
      "Sin local",
      "No se pudo identificar el local activo.",
      "error"
    );

    return;
  }

  const referenciaLibro =
    getReferenciaLibro();

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

  if (productSelect) {
    productSelect.disabled =
      true;
  }

  if (saleModeSelect) {
    saleModeSelect.disabled =
      true;
  }

  if (saleQuantityInput) {
    saleQuantityInput.disabled =
      true;
  }

  if (boxPriceInput) {
    boxPriceInput.disabled =
      true;
  }

  if (referenciaLibroInput) {
    referenciaLibroInput.disabled =
      true;
  }

  try {
    const storedUserName =
      getStoredUserName();

    const localPayload =
      getMovementLocalPayload();

    const ventaRef =
      db
        .collection(
          "ventas"
        )
        .doc();

    const summaryHtml =
      CART
        .map(
          i =>
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
                    i.name
                  )}

                  x${i.quantity}

                  ${
                    i.mode === "box"
                      ? "(cajas)"
                      : "(unid.)"
                  }
                </span>

                <strong>
                  ${currency(
                    i.total
                  )}
                </strong>
              </div>
            `
        )
        .join("");

    const total =
      CART.reduce(
        (s, i) =>
          s +
          Number(
            i.total
          ),
        0
      );

    const resp =
      await Swal.fire({
        title:
          "Finalizar venta",

        html:
          `
            <div
              style="
                text-align:left
              "
            >
              ${summaryHtml}

              <hr>

              <div
                style="
                  display:flex;
                  justify-content:space-between;
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
      !resp.isConfirmed
    ) {
      return;
    }

    await db.runTransaction(
      async t => {
        /*
         * Firestore exige que las lecturas precedan
         * a las escrituras dentro de la transacción.
         */

        const productSnapshots =
          [];

        for (
          const item
          of CART
        ) {
          const prodRef =
            db
              .collection(
                "productos"
              )
              .doc(
                item.productId
              );

          const prodSnap =
            await t.get(
              prodRef
            );

          if (
            !prodSnap.exists
          ) {
            throw new Error(
              `El producto ${item.name} no existe.`
            );
          }

          const data =
            prodSnap.data() ||
            {};

          if (
            !matchesCurrentLocal(
              data
            )
          ) {
            throw new Error(
              `El producto ${item.name} no pertenece al local actual.`
            );
          }

          productSnapshots.push({
            item,
            prodRef,
            data
          });
        }

        for (
          const {
            item,
            prodRef,
            data
          } of productSnapshots
        ) {
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

          const unitsToDiscount =
            numberOrZero(
              item.unitsTotal
            );

          if (
            unitsToDiscount >
            currentUnits
          ) {
            throw new Error(
              `Stock insuficiente para "${item.name}". Disponible: ${currentUnits}`
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

          t.update(
            prodRef,
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

          t.set(
            movementRef,
            {
              productId:
                item.productId,

              productName:
                item.name,

              tipoMovimiento:
                "salida",

              referenciaLibro:
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

              userId:
                auth.currentUser
                  ? auth.currentUser.uid
                  : null,

              userName:
                storedUserName ||
                null,

              createdAt:
                firebase.firestore
                  .FieldValue
                  .serverTimestamp(),

              ...localPayload
            }
          );
        }

        t.set(
          ventaRef,
          {
            products:
              serializeCart(),

            total:
              Number(
                total
              ),

            referenciaLibro:
              referenciaLibro,

            createdAt:
              firebase.firestore
                .FieldValue
                .serverTimestamp(),

            userId:
              auth.currentUser
                ? auth.currentUser.uid
                : null,

            userName:
              storedUserName ||
              null,

            ...localPayload
          }
        );
      }
    );

    Swal.fire({
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

    CART = [];

    clearReferenciaLibro();

    renderCart();
  } catch (err) {
    console.error(
      "Error finalizando venta:",
      err
    );

    Swal.fire(
      "Error",
      err.message ||
        "No se pudo finalizar la venta",
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

    if (productSelect) {
      productSelect.disabled =
        false;
    }

    if (saleModeSelect) {
      saleModeSelect.disabled =
        false;
    }

    if (saleQuantityInput) {
      saleQuantityInput.disabled =
        false;
    }

    if (boxPriceInput) {
      boxPriceInput.disabled =
        false;
    }

    if (referenciaLibroInput) {
      referenciaLibroInput.disabled =
        false;
    }
  }
}

/*
 * ============================================================
 * BORRADORES
 * ============================================================
 */

async function saveDraft() {
  if (isSavingDraft) {
    return;
  }

  if (!CART.length) {
    Swal.fire(
      "Carrito vacío",
      "Agrega productos antes de guardar un borrador.",
      "info"
    );

    return;
  }

  if (!currentLocalId) {
    Swal.fire(
      "Sin local",
      "No se pudo identificar el local activo.",
      "error"
    );

    return;
  }

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
      getReferenciaLibro();

    const draft = {
      products:
        serializeCart(),

      total:
        CART.reduce(
          (s, i) =>
            s +
            Number(
              i.total
            ),
          0
        ),

      referenciaLibro:
        referenciaLibro,

      createdAt:
        firebase.firestore
          .FieldValue
          .serverTimestamp(),

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

    Swal.fire({
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
  } catch (err) {
    console.error(
      "Error guardando borrador:",
      err
    );

    Swal.fire(
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
 * ELIMINACIÓN
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
    p => {
      const productId =
        getSaleProductId(
          p
        );

      if (!productId) {
        return;
      }

      const units =
        getSaleUnitsForProduct(
          p
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
    p => {
      const productId =
        getSaleProductId(
          p
        );

      const prod =
        PRODUCTS_CACHE[
          productId
        ];

      const mode =
        String(
          p.mode ||
          p.saleMode ||
          p.saleType ||
          ""
        ).toLowerCase() ===
        "box"
          ? "box"
          : "unit";

      const unitsPerBox =
        Math.max(
          1,
          numberOrZero(
            p.unitsPerBox ||
            (
              prod
                ? prod.unitsPerBox
                : 1
            )
          )
        );

      const quantity =
        Math.max(
          1,
          numberOrZero(
            p.quantity
          )
        );

      const price =
        Math.max(
          0,
          numberOrZero(
            p.price
          )
        );

      const unitsTotal =
        mode === "box"
          ? quantity *
            unitsPerBox
          : quantity;

      return {
        productId,

        name:
          String(
            p.name ||
            (
              prod
                ? prod.name
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
 * EDICIÓN
 * ============================================================
 */

function buildProductsReadonlyHtml(
  saleId,
  products
) {
  if (!products.length) {
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
            p => `
              <div>
                ${escapeHtml(
                  p.name
                )}
                x${p.quantity}
                ${
                  p.mode === "box"
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
  if (!isAdministrator()) {
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
        reference || "venta"
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

  if (!isAdministrator()) {
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

  if (!isAdministrator()) {
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

function buildInlineTotalHtml(
  total
) {
  return `
    <strong>
      ${currency(
        total
      )}
    </strong>
  `;
}

function buildDeleteButtonHtml(
  saleId
) {
  if (!isAdministrator()) {
    return `
      <span
        class="sale-no-actions"
      >
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

function scheduleInlineSaleSave(
  saleId
) {
  if (!saleId) {
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
            const saleId =
              input.dataset.saleId;

            if (!saleId) {
              return;
            }

            scheduleInlineSaleSave(
              saleId
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

            if (saleId) {
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

            if (saleId) {
              deleteSale(
                saleId
              );
            }
          }
        );
      }
    );
}

async function saveInlineSale(
  saleId
) {
  if (!isAdministrator()) {
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
    Swal.fire(
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

  if (!newCreatedAt) {
    Swal.fire(
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

    const localPayload =
      getMovementLocalPayload();

    const saleRef =
      db
        .collection(
          "ventas"
        )
        .doc(
          saleId
        );

    await db.runTransaction(
      async t => {
        const latestSaleSnap =
          await t.get(
            saleRef
          );

        if (
          !latestSaleSnap.exists
        ) {
          throw new Error(
            "La venta ya no existe."
          );
        }

        const latestSale =
          latestSaleSnap.data() ||
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

        t.update(
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

            ...localPayload
          }
        );
      }
    );

    Swal.fire({
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
  } catch (err) {
    console.error(
      "Error actualizando venta:",
      err
    );

    Swal.fire(
      "Error",
      err.message ||
        "No se pudo actualizar la venta.",
      "error"
    );
  } finally {
    editingSaleIds.delete(
      saleId
    );
  }
}

async function deleteSale(
  saleId
) {
  if (!isAdministrator()) {
    Swal.fire(
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
    Swal.fire(
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
    Swal.fire(
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

  if (!products.length) {
    Swal.fire(
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

    const localPayload =
      getMovementLocalPayload();

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
      async t => {
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

          const productSnap =
            await t.get(
              productRef
            );

          if (
            !productSnap.exists
          ) {
            throw new Error(
              `El producto ${productId} no existe.`
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
              `El producto ${productData.name || productId} no pertenece al local actual.`
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

        for (
          const productId
          of productIds
        ) {
          const unitsToReturn =
            numberOrZero(
              unitsByProduct[
                productId
              ]
            );

          if (
            unitsToReturn <= 0
          ) {
            continue;
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

          t.update(
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

          t.set(
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

              ...localPayload
            }
          );
        }

        t.delete(
          saleRef
        );
      }
    );

    Swal.fire({
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
  } catch (err) {
    console.error(
      "Error eliminando venta:",
      err
    );

    Swal.fire(
      "Error",
      err.message ||
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
 * TABLA
 * ============================================================
 */

function ensureSalesTableHeader() {
  if (!salesTable) {
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

function ensureSalesDataTable() {
  if (salesDataTable) {
    return salesDataTable;
  }

  if (
    !window.jQuery ||
    !$.fn ||
    !$.fn.DataTable
  ) {
    console.warn(
      "DataTables no está cargado. Se mostrará la tabla sin DataTable."
    );

    return null;
  }

  ensureSalesTableHeader();

  salesDataTable =
    $("#salesTable").DataTable({
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

          orderable:
            true,

          render:
            function (
              data,
              type
            ) {
              if (
                type ===
                "display"
              ) {
                return data.display;
              }

              return data.sort;
            }
        },

        {
          title:
            "Hora",

          orderable:
            true,

          render:
            function (
              data,
              type
            ) {
              if (
                type ===
                "display"
              ) {
                return data.display;
              }

              return data.sort;
            }
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
  if (!salesTable) {
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

  if (!dataSet.length) {
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
                cell ?? ""
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

/*
 * ============================================================
 * LISTENER DE VENTAS
 * ============================================================
 */

function listenSalesRealtime() {
  db.collection(
    "ventas"
  )
    .orderBy(
      "createdAt",
      "desc"
    )
    .onSnapshot(
      snapshot => {
        const dataSet =
          [];

        SALES_CACHE =
          {};

        snapshot.forEach(
          doc => {
            const v =
              doc.data();

            if (
              !matchesCurrentLocal(
                v
              )
            ) {
              return;
            }

            SALES_CACHE[
              doc.id
            ] = {
              id:
                doc.id,

              ...v
            };

            const products =
              normalizeSaleProducts(
                v.products
              );

            const productosHtml =
              buildProductsReadonlyHtml(
                doc.id,
                products
              );

            const unidades =
              products.reduce(
                (
                  sum,
                  p
                ) =>
                  sum +
                  numberOrZero(
                    p.unitsTotal
                  ),
                0
              );

            const total =
              products.reduce(
                (
                  sum,
                  p
                ) =>
                  sum +
                  numberOrZero(
                    p.total
                  ),
                0
              );

            const totalHtml =
              buildInlineTotalHtml(
                total
              );

            const referenceHtml =
              buildReferenceEditorHtml(
                doc.id,
                v.referenciaLibro ||
                  "venta"
              );

            const dateSort =
              getDateTimeMillis(
                v.createdAt
              ) || 0;

            const dateHtml =
              buildDateEditorHtml(
                doc.id,
                v.createdAt
              );

            const timeSort =
              getDateTimeMillis(
                v.createdAt
              ) || 0;

            const timeHtml =
              buildTimeEditorHtml(
                doc.id,
                v.createdAt
              );

            const actionHtml =
              buildDeleteButtonHtml(
                doc.id
              );

            dataSet.push([
              productosHtml,

              String(
                unidades
              ),

              totalHtml,

              referenceHtml,

              escapeHtml(
                v.userName ||
                "-"
              ),

              {
                display:
                  dateHtml,

                sort:
                  dateSort
              },

              {
                display:
                  timeHtml,

                sort:
                  timeSort
              },

              actionHtml
            ]);
          }
        );

        ensureSalesTableHeader();

        const dt =
          ensureSalesDataTable();

        if (dt) {
          dt.clear();

          dt.rows.add(
            dataSet
          );

          dt.draw(
            false
          );

          bindInlineSaleEvents();
        } else {
          renderSalesFallback(
            dataSet
          );

          bindInlineSaleEvents();
        }
      },
      err => {
        console.error(
          "Error listen ventas:",
          err
        );

        if (
          salesDataTable
        ) {
          salesDataTable
            .clear()
            .draw();
        } else {
          renderSalesFallback(
            []
          );
        }
      }
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
      return;
    }

    try {
      /*
       * IMPORTANTE:
       *
       * No se consulta empleados ni local aquí.
       * Se utiliza el contexto central de app.js.
       */
      await resolveSalesContext(
        user
      );

      if (
        !currentLocalId
      ) {
        throw new Error(
          "El usuario autenticado no tiene un local asignado."
        );
      }

      /*
       * Se actualiza el saludo solamente.
       */
      const role =
        currentSalesContext?.role ||
        "";

      const name =
        currentSalesContext?.name ||
        "Usuario";

      userGreeting.forEach(
        element => {
          element.textContent =
            `Hola, ${name} (${role})`;
        }
      );
    } catch (err) {
      console.error(
        "Error resolviendo contexto de ventas:",
        err
      );

      Swal.fire(
        "Error",
        err.message ||
          "No se pudo cargar el contexto del usuario.",
        "error"
      );
    }
  }
);

document.addEventListener(
  "DOMContentLoaded",
  () => {
    /*
     * El contexto puede venir ya resuelto
     * por app.js. Solo se sincroniza storage
     * como fallback visual.
     */
    syncLocalContextFromStorage();

    ensureSalesTableHeader();

    initSelect2();

    if (productSelect) {
      productSelect.addEventListener(
        "change",
        () => {
          syncModeFromProduct();
        }
      );
    }

    if (saleModeSelect) {
      saleModeSelect.addEventListener(
        "change",
        () => {
          refreshSaleModeUI();
        }
      );
    }

    if (btnAddToCart) {
      btnAddToCart.addEventListener(
        "click",
        e => {
          e.preventDefault();
          addToCart();
        }
      );
    }

    if (btnClearCart) {
      btnClearCart.addEventListener(
        "click",
        e => {
          e.preventDefault();
          clearCart(
            true
          );
        }
      );
    }

    if (btnFinalize) {
      btnFinalize.addEventListener(
        "click",
        e => {
          e.preventDefault();
          finalizeSale();
        }
      );
    }

    if (btnSaveDraft) {
      btnSaveDraft.addEventListener(
        "click",
        e => {
          e.preventDefault();
          saveDraft();
        }
      );
    }

    /*
     * Ya no se agrega un segundo listener de logout
     * específico de ventas si app.js lo maneja.
     *
     * Solo queda como fallback.
     */
    if (
      logoutBtn &&
      !logoutBtn.dataset.salesLogoutBound
    ) {
      logoutBtn.dataset.salesLogoutBound =
        "1";

      logoutBtn.addEventListener(
        "click",
        async () => {
          try {
            await auth.signOut();
          } finally {
            localStorage.removeItem(
              "currentUser"
            );

            window.location.href =
              "index.html";
          }
        }
      );
    }

    /*
     * Cargar los listeners de datos solamente una vez.
     */
    loadProductsRealtime();

    loadMonthlySalesRealtime();

    listenSalesRealtime();

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