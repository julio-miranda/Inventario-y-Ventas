// assets/js/inventory.js
//
// Inventario con DataTable.
//
// Reglas:
// - stock visible = stock actual guardado en el producto.
// - Las ventas del mes se usan solo para métricas,
//   sugerencias y alertas.
// - Vendedor: acceso de solo lectura.
// - Administrador/Bodega: pueden editar y agregar stock.
// - Administrador: puede eliminar.
//
// Referencias de libro:
// - Las referencias se obtienen de stock_movimientos.
// - Al seleccionar una referencia se carga su número de documento.
// - También se puede introducir una referencia nueva.
//
// Filtro por local:
// - El contexto de usuario/local se obtiene exclusivamente desde app.js.
// - No se consultan empleados ni local desde este módulo.
// - app.js mantiene caché y deduplicación de consultas.
// - Productos y ventas se filtran por el local actual.
//
// OPTIMIZACIÓN:
// - No se consulta empleados.
// - No se consulta local.
// - No se registra otro listener de logout.
// - El contexto de usuario/local se resuelve una sola vez mediante app.js.
// - Las referencias de movimientos se cachean por producto.
// - Los listeners realtime de productos y ventas son los únicos listeners
//   permanentes de este módulo.

if (typeof firebase === "undefined") {
  console.error(
    "Firebase no se ha cargado correctamente."
  );

  if (typeof Swal !== "undefined") {
    Swal.fire({
      icon: "error",
      title: "Error",
      text:
        "Firebase no se cargó. Revisa la conexión o los scripts."
    });
  }
}

/*
 * ============================================================
 * ESTADO
 * ============================================================
 */

let currentRole = "";
let canEditInventory = false;

const LOW_STOCK_THRESHOLD = 5;
const SAFETY_STOCK_DEFAULT = 10;

let currentLocalId = "";

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

let currentUserInventoryContext = null;

let currentProductsList = [];
let currentMonthlySalesMap = {};
let currentMonthlyBoxesMap = {};

let productsUnsub = null;
let salesUnsub = null;
let inventoryDT = null;

/*
 * Caché de movimientos por producto.
 */
const productStockMovementsCache =
  new Map();

/*
 * Deduplicación de consultas de movimientos.
 */
const productStockMovementsPending =
  new Map();

/*
 * ============================================================
 * ELEMENTOS DOM
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

function currency(n) {
  return `$${Number(
    n || 0
  ).toFixed(2)}`;
}

function numberOrZero(v) {
  const n =
    Number(v);

  return Number.isFinite(n)
    ? n
    : 0;
}

function escapeHtml(str) {
  return String(
    str ?? ""
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
 * CONTEXTO CENTRAL
 * ============================================================
 *
 * IMPORTANTE:
 *
 * inventory.js NO consulta:
 *
 *   empleados
 *   local
 *
 * directamente.
 *
 * Todo se obtiene de app.js:
 *
 *   getCurrentUserContext()
 *
 * Esa función ya tiene:
 *
 *   employeeCache
 *   localCache
 *   pendingEmployeeLoads
 *   pendingLocalLoads
 *   currentUserContext
 *
 * Por tanto varias pantallas o listeners pueden
 * solicitar el contexto sin multiplicar consultas.
 */

async function resolveInventoryContext(
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

  /*
   * Esta llamada es compartida con cualquier otro
   * módulo que esté resolviendo al mismo usuario.
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
    el => {
      el.textContent =
        `Hola, ${context.name || "Usuario"} (${context.role || ""})`;
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
  });

  return context;
}

/*
 * ============================================================
 * STOCK
 * ============================================================
 */

function getUnitsPerBox(
  product
) {
  const v =
    numberOrZero(
      product &&
      product.unitsPerBox
    );

  return v > 0
    ? v
    : 1;
}

function getProductCode(
  product
) {
  return String(
    product &&
    (
      product.codigoProducto ||
      product.productCode ||
      product.code ||
      product.sku ||
      ""
    )
  ).trim();
}

function getCurrentStockUnits(
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

function getStockBaseUnits(
  product
) {
  const base =
    numberOrZero(
      product &&
      product.stockBaseUnits
    );

  if (
    base > 0
  ) {
    return base;
  }

  return getCurrentStockUnits(
    product
  );
}

function getSoldUnitsForProduct(
  product
) {
  if (
    !product ||
    !product.id
  ) {
    return 0;
  }

  return numberOrZero(
    currentMonthlySalesMap[
      product.id
    ]
  );
}

function getSoldBoxesForProduct(
  product
) {
  if (
    !product ||
    !product.id
  ) {
    return 0;
  }

  return numberOrZero(
    currentMonthlyBoxesMap[
      product.id
    ]
  );
}

function getStockUnits(
  product
) {
  return getCurrentStockUnits(
    product
  );
}

function getStockBoxes(
  product
) {
  const unitsPerBox =
    getUnitsPerBox(
      product
    );

  const stockUnits =
    getStockUnits(
      product
    );

  return Math.floor(
    stockUnits /
    unitsPerBox
  );
}

function getCostPerUnit(
  product
) {
  const stored =
    numberOrZero(
      product &&
      product.lastCostPerUnit
    );

  if (
    stored > 0
  ) {
    return stored;
  }

  const costPerBox =
    numberOrZero(
      product &&
      product.lastCostPerBox
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

/*
 * ============================================================
 * LOCALES
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
 * VENTAS DEL MES
 * ============================================================
 */

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

function aggregateMonthlySales(
  snapshot
) {
  const unitsMap = {};
  const boxesMap = {};

  snapshot.forEach(
    doc => {
      const sale =
        doc.data() ||
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
        p => {
          const productId =
            getSaleProductId(
              p
            );

          if (!productId) {
            return;
          }

          const unitsPerBox =
            Math.max(
              1,
              numberOrZero(
                p.unitsPerBox
              )
            );

          const mode =
            String(
              p.mode ||
              p.saleMode ||
              p.saleType ||
              ""
            ).toLowerCase();

          const qty =
            numberOrZero(
              p.quantity
            );

          const totalUnits =
            numberOrZero(
              p.unitsTotal ||
              p.totalUnits
            );

          let soldUnits =
            0;

          let soldBoxes =
            0;

          if (
            mode === "box"
          ) {
            soldBoxes =
              qty > 0
                ? Math.floor(
                    qty
                  )
                : (
                    totalUnits >
                    0
                      ? Math.floor(
                          totalUnits /
                          unitsPerBox
                        )
                      : 0
                  );

            soldUnits =
              totalUnits >
              0
                ? totalUnits
                : soldBoxes *
                  unitsPerBox;

          } else if (
            mode === "unit"
          ) {
            soldUnits =
              totalUnits >
              0
                ? totalUnits
                : qty;

          } else if (
            totalUnits >
            0
          ) {
            soldUnits =
              totalUnits;

          } else if (
            numberOrZero(
              p.boxes
            ) > 0
          ) {
            soldBoxes =
              Math.floor(
                numberOrZero(
                  p.boxes
                )
              );

            soldUnits =
              soldBoxes *
              unitsPerBox;

          } else {
            soldUnits =
              qty;
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

/*
 * ============================================================
 * PROYECCIONES
 * ============================================================
 */

function buildProjectionForProduct(
  product
) {
  const stockUnits =
    getStockUnits(
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

  const costPerUnit =
    getCostPerUnit(
      product
    );

  const soldUnits =
    getSoldUnitsForProduct(
      product
    );

  const soldBoxes =
    Math.floor(
      getSoldBoxesForProduct(
        product
      )
    );

  let suggestedUnits =
    soldUnits +
    SAFETY_STOCK_DEFAULT -
    stockUnits;

  if (
    suggestedUnits <
    0
  ) {
    suggestedUnits =
      0;
  }

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
    suggestedUnits > 0
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
    soldMonthUnits:
      soldUnits,
    soldMonthBoxes:
      soldBoxes,
    costPerUnit,
    suggestedPurchaseUnits:
      suggestedUnits,
    suggestedPurchaseBoxes:
      suggestedBoxes,
    status,
    unitsPerBox
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

    code:
      getProductCode(
        product
      ),

    name:
      product.name ||
      "-",

    price:
      numberOrZero(
        product.price
      ),

    quantity:
      getCurrentStockUnits(
        product
      ),

    stockBaseUnits:
      getStockBaseUnits(
        product
      ),

    boxes:
      numberOrZero(
        product.boxes
      ),

    unitsPerBox:
      getUnitsPerBox(
        product
      ),

    lastCostPerBox:
      numberOrZero(
        product.lastCostPerBox
      ),

    lastCostPerUnit:
      numberOrZero(
        product.lastCostPerUnit
      ),

    stockUnits:
      projection.stockUnits,

    stockBoxes:
      projection.stockBoxes,

    soldMonthUnits:
      projection.soldMonthUnits,

    soldMonthBoxes:
      projection.soldMonthBoxes,

    costPerUnit:
      projection.costPerUnit,

    suggestedPurchaseUnits:
      projection.suggestedPurchaseUnits,

    suggestedPurchaseBoxes:
      projection.suggestedPurchaseBoxes,

    status:
      projection.status
  };
}

/*
 * ============================================================
 * PRESENTACIÓN
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

/*
 * ============================================================
 * DATATABLE
 * ============================================================
 */

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
              "Vendido Mes (Unid.)"
          },

          {
            data:
              "soldMonthBoxes",

            title:
              "Vendido Mes (Cajas)"
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
              ) => {
                if (
                  type !==
                  "display"
                ) {
                  return data;
                }

                return data > 0
                  ? `
                      <strong style="
                        color:#ef4444;
                      ">
                        ${data}
                      </strong>
                    `
                  : `
                      <strong style="
                        color:#16a34a;
                      ">
                        0
                      </strong>
                    `;
              }
          },

          {
            data:
              "suggestedPurchaseBoxes",

            title:
              "Sugerido Compra (Cajas)"
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

        order:
          [
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

  /*
   * Un único delegado de eventos.
   */
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
          ) || ""
        )
      );
    }
  );

  return inventoryDT;
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
          <td colspan="10">
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
          ${numberOrZero(
            row.soldMonthUnits
          )}
        </td>

        <td>
          ${Math.floor(
            numberOrZero(
              row.soldMonthBoxes
            )
          )}
        </td>

        <td>
          ${currency(
            row.costPerUnit
          )}
        </td>

        <td>
          ${
            row.suggestedPurchaseUnits >
            0
              ? `
                  <strong style="
                    color:#ef4444;
                  ">
                    ${row.suggestedPurchaseUnits}
                  </strong>
                `
              : `
                  <strong style="
                    color:#16a34a;
                  ">
                    0
                  </strong>
                `
          }
        </td>

        <td>
          ${Math.floor(
            numberOrZero(
              row.suggestedPurchaseBoxes
            )
          )}
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

function refreshInventoryView() {
  const rows =
    currentProductsList.map(
      buildRowData
    );

  const totalValue =
    rows.reduce(
      (
        sum,
        p
      ) =>
        sum +
        (
          numberOrZero(
            p.stockUnits
          ) *
          numberOrZero(
            p.price
          )
        ),
      0
    );

  const lowStockList =
    rows.filter(
      p =>
        p.stockUnits <=
          LOW_STOCK_THRESHOLD ||
        p.suggestedPurchaseUnits >
          0
    );

  if (
    totalProductsCard
  ) {
    totalProductsCard.textContent =
      rows.length;
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
      lowStockList.length;
  }

  renderLowStockPanel(
    lowStockList
  );

  const dt =
    ensureInventoryDataTable();

  if (dt) {
    dt.clear();

    dt.rows.add(
      rows
    );

    dt.draw(
      false
    );

    if (
      searchInput
    ) {
      dt.search(
        searchInput.value.trim()
      ).draw(
        false
      );
    }
  } else {
    renderInventoryFallback(
      rows
    );
  }
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
    p => {
      const div =
        document.createElement(
          "div"
        );

      div.className =
        "low-stock-item";

      const left =
        document.createElement(
          "div"
        );

      left.innerHTML = `
        <strong>
          ${escapeHtml(
            p.name
          )}
        </strong>
      `;

      const right =
        document.createElement(
          "div"
        );

      right.textContent =
        `Stock: ${p.stockUnits} unid. | ` +
        `Cajas: ${p.stockBoxes} | ` +
        `Vendido mes: ${p.soldMonthUnits} unid. | ` +
        `Sugerido compra: ${p.suggestedPurchaseUnits} unid. ` +
        `(${p.suggestedPurchaseBoxes} cajas)`;

      div.appendChild(
        left
      );

      div.appendChild(
        right
      );

      lowStockPanel.appendChild(
        div
      );
    }
  );
}

/*
 * ============================================================
 * LISTENERS REALTIME
 * ============================================================
 */

function stopRealtimeListeners() {
  if (
    typeof productsUnsub ===
    "function"
  ) {
    productsUnsub();

    productsUnsub =
      null;
  }

  if (
    typeof salesUnsub ===
    "function"
  ) {
    salesUnsub();

    salesUnsub =
      null;
  }
}

function startRealtimeListeners() {
  stopRealtimeListeners();

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

  const monthStart =
    new Date();

  monthStart.setDate(
    1
  );

  monthStart.setHours(
    0,
    0,
    0,
    0
  );

  /*
   * ==========================================================
   * VENTAS DEL MES
   * ==========================================================
   *
   * Una consulta realtime.
   */

  salesUnsub =
    db
      .collection(
        "ventas"
      )
      .where(
        "createdAt",
        ">=",
        monthStart
      )
      .onSnapshot(
        snapshot => {
          const {
            unitsMap,
            boxesMap
          } =
            aggregateMonthlySales(
              snapshot
            );

          currentMonthlySalesMap =
            unitsMap;

          currentMonthlyBoxesMap =
            boxesMap;

          refreshInventoryView();
        },

        err => {
          console.error(
            "Error cargando ventas del mes:",
            err
          );

          currentMonthlySalesMap =
            {};

          currentMonthlyBoxesMap =
            {};

          refreshInventoryView();
        }
      );

  /*
   * ==========================================================
   * PRODUCTOS
   * ==========================================================
   *
   * Una consulta realtime.
   */

  productsUnsub =
    db
      .collection(
        "productos"
      )
      .orderBy(
        "name"
      )
      .onSnapshot(
        snapshot => {
          const products =
            [];

          snapshot.forEach(
            doc => {
              const p =
                doc.data() ||
                {};

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

              products.push({
                id:
                  doc.id,

                ...p,

                id_local:
                  p.id_local ||
                  currentLocalId,

                localNombre:
                  p.localNombre ||
                  currentLocalInfo.nombre ||
                  "",

                localNumeroDocumento:
                  p.localNumeroDocumento ||
                  currentLocalInfo.numeroDocumento ||
                  "",

                localUbicacion:
                  p.localUbicacion ||
                  currentLocalInfo.ubicacion ||
                  "",

                codigoProducto:
                  getProductCode(
                    p
                  ),

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
                  numberOrZero(
                    p.unitsPerBox
                  ) > 0
                    ? numberOrZero(
                        p.unitsPerBox
                      )
                    : 1
              });
            }
          );

          currentProductsList =
            products;

          refreshInventoryView();
        },

        err => {
          console.error(
            "Error cargando inventario:",
            err
          );

          currentProductsList =
            [];

          refreshInventoryView();
        }
      );
}

/*
 * ============================================================
 * BÚSQUEDA
 * ============================================================
 */

function findProductByName(
  name
) {
  if (!name) {
    return null;
  }

  const lower =
    String(
      name
    )
      .trim()
      .toLowerCase();

  return (
    currentProductsList.find(
      p => {
        const n =
          String(
            p.name ||
            ""
          )
            .trim()
            .toLowerCase();

        const c =
          String(
            getProductCode(
              p
            ) ||
            ""
          )
            .trim()
            .toLowerCase();

        const id =
          String(
            p.id ||
            ""
          )
            .trim()
            .toLowerCase();

        return (
          n === lower ||
          c === lower ||
          id === lower
        );
      }
    ) ||
    null
  );
}

function findProductById(
  id
) {
  return (
    currentProductsList.find(
      p =>
        String(
          p.id
        ) ===
        String(
          id
        )
    ) ||
    null
  );
}

/*
 * ============================================================
 * REFERENCIAS DE LIBRO
 * ============================================================
 */

async function loadProductStockMovements(
  productId,
  forceRefresh = false
) {
  const targetId =
    String(
      productId ||
      ""
    ).trim();

  if (
    !targetId
  ) {
    return [];
  }

  if (
    !forceRefresh &&
    productStockMovementsCache.has(
      targetId
    )
  ) {
    return (
      productStockMovementsCache.get(
        targetId
      ) || []
    );
  }

  /*
   * Evita dos consultas simultáneas
   * para el mismo producto.
   */
  if (
    !forceRefresh &&
    productStockMovementsPending.has(
      targetId
    )
  ) {
    return productStockMovementsPending.get(
      targetId
    );
  }

  const promise =
    (async () => {
      try {
        const snapshot =
          await db
            .collection(
              "stock_movimientos"
            )
            .where(
              "productId",
              "==",
              targetId
            )
            .get();

        const movements =
          [];

        snapshot.forEach(
          doc => {
            const data =
              doc.data() ||
              {};

            const movementLocal =
              getLocalFieldValue(
                data
              );

            if (
              movementLocal &&
              currentLocalId &&
              movementLocal !==
                String(
                  currentLocalId
                ).trim()
            ) {
              return;
            }

            const referencia =
              String(
                data.referenciaLibro ||
                data.referenceBook ||
                data.bookReference ||
                ""
              ).trim();

            const numeroDocumento =
              String(
                data.numeroDocumento ||
                data.documentNumber ||
                data.numero_documento ||
                ""
              ).trim();

            if (
              !referencia &&
              !numeroDocumento
            ) {
              return;
            }

            let createdAtMs =
              0;

            if (
              data.createdAt &&
              typeof data.createdAt.toMillis ===
                "function"
            ) {
              createdAtMs =
                data.createdAt.toMillis();

            } else if (
              data.createdAt instanceof
              Date
            ) {
              createdAtMs =
                data.createdAt.getTime();

            } else if (
              data.createdAt &&
              typeof data.createdAt.seconds ===
                "number"
            ) {
              createdAtMs =
                data.createdAt.seconds *
                1000;
            }

            movements.push({
              id:
                doc.id,

              referenciaLibro:
                referencia,

              numeroDocumento,

              tipoMovimiento:
                String(
                  data.tipoMovimiento ||
                  ""
                ).trim(),

              detalle:
                String(
                  data.detalle ||
                  ""
                ).trim(),

              entrada:
                numberOrZero(
                  data.entrada
                ),

              salida:
                numberOrZero(
                  data.salida
                ),

              saldoAnterior:
                numberOrZero(
                  data.saldoAnterior
                ),

              saldoActual:
                numberOrZero(
                  data.saldoActual
                ),

              createdAtMs
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
          targetId,
          movements
        );

        return movements;
      } catch (
        err
      ) {
        console.error(
          "Error cargando referencias de libro:",
          err
        );

        return [];
      }
    })();

  productStockMovementsPending.set(
    targetId,
    promise
  );

  try {
    return await promise;
  } finally {
    productStockMovementsPending.delete(
      targetId
    );
  }
}

function invalidateProductStockMovementsCache(
  productId
) {
  const targetId =
    String(
      productId ||
      ""
    ).trim();

  if (
    targetId
  ) {
    productStockMovementsCache.delete(
      targetId
    );
  }
}

function getUniqueBookReferences(
  movements = []
) {
  const seen =
    new Set();

  const unique =
    [];

  movements.forEach(
    movement => {
      const key =
        [
          String(
            movement.referenciaLibro ||
            ""
          )
            .trim()
            .toLowerCase(),

          String(
            movement.numeroDocumento ||
            ""
          )
            .trim()
            .toLowerCase()
        ]
          .join("|");

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

      unique.push(
        movement
      );
    }
  );

  return unique;
}

function buildBookReferenceOptions(
  movements = [],
  selectedReference = "",
  selectedDocument = ""
) {
  const unique =
    getUniqueBookReferences(
      movements
    );

  const options = [
    `
      <option value="">
        Escribir nueva referencia
      </option>
    `
  ];

  unique.forEach(
    (
      movement,
      index
    ) => {
      const reference =
        movement.referenciaLibro ||
        "";

      const document =
        movement.numeroDocumento ||
        "";

      const labelParts =
        [];

      if (
        reference
      ) {
        labelParts.push(
          reference
        );
      }

      if (
        document
      ) {
        labelParts.push(
          `Documento: ${document}`
        );
      }

      if (
        movement.tipoMovimiento
      ) {
        labelParts.push(
          `Movimiento: ${movement.tipoMovimiento}`
        );
      }

      const value =
        String(
          index
        );

      const isSelected =
        reference ===
          selectedReference &&
        document ===
          selectedDocument;

      options.push(`
        <option
          value="${escapeHtml(
            value
          )}"
          ${
            isSelected
              ? "selected"
              : ""
          }
        >
          ${escapeHtml(
            labelParts.join(
              " — "
            )
          )}
        </option>
      `);
    }
  );

  return options.join(
    ""
  );
}

/*
 * ============================================================
 * FORMULARIO AGREGAR / REPONER
 * ============================================================
 */

function buildExistingProductOptions(
  selectedValue = ""
) {
  const options = [
    `
      <option value="">
        Selecciona un producto
      </option>
    `
  ];

  currentProductsList.forEach(
    p => {
      const code =
        getProductCode(
          p
        );

      options.push(
        `
          <option
            value="${escapeHtml(
              p.name
            )}"
          >
            ${escapeHtml(
              p.name
            )}
            ${
              code
                ? ` — ${escapeHtml(
                    code
                  )}`
                : ""
            }
          </option>
        `
      );

      if (
        code
      ) {
        options.push(
          `
            <option
              value="${escapeHtml(
                code
              )}"
            >
              ${escapeHtml(
                code
              )}
              ${
                p.name
                  ? ` — ${escapeHtml(
                      p.name
                    )}`
                  : ""
              }
            </option>
          `
        );
      }
    }
  );

  return options.join(
    ""
  );
}

function buildStockFormHtml(
  initial = {}
) {
  const hasProducts =
    currentProductsList.length >
    0;

  const defaultMode =
    initial.mode ||
    (
      hasProducts
        ? "existing"
        : "new"
    );

  const selectedProduct =
    initial.productName
      ? findProductByName(
          initial.productName
        )
      : null;

  const selectedUnitsPerBox =
    selectedProduct
      ? getUnitsPerBox(
          selectedProduct
        )
      : 1;

  const selectedCode =
    selectedProduct
      ? getProductCode(
          selectedProduct
        )
      : "";

  const productOptions =
    buildExistingProductOptions();

  return `
    <div class="inv-modal">
      <div class="inv-modal-grid">

        <div class="inv-field full">
          <label for="p-mode">
            Tipo de registro
          </label>

          <select id="p-mode">
            <option
              value="new"
              ${
                defaultMode ===
                "new"
                  ? "selected"
                  : ""
              }
            >
              Nuevo producto
            </option>

            <option
              value="existing"
              ${
                defaultMode ===
                "existing"
                  ? "selected"
                  : ""
              }
            >
              Agregar a producto existente
            </option>
          </select>
        </div>

        <div
          class="inv-field full"
          id="existingGroup"
        >
          <label for="p-existing">
            Producto existente
          </label>

          <input
            id="p-existing"
            type="text"
            list="productList"
            placeholder="Escribe para buscar un producto o su código..."
            value="${escapeHtml(
              initial.productName ||
              initial.codigoProducto ||
              ""
            )}"
            autocomplete="off"
          >

          <datalist id="productList">
            ${productOptions}
          </datalist>
        </div>

        <div
          class="inv-field full"
          id="nameGroup"
        >
          <label for="p-name">
            Nombre del producto
          </label>

          <input
            id="p-name"
            type="text"
            placeholder="Ej. Aceite 1L"
            value="${escapeHtml(
              initial.name ||
              ""
            )}"
          >
        </div>

        <div class="inv-field full">
          <label for="p-code">
            Código del producto
          </label>

          <input
            id="p-code"
            type="text"
            placeholder="Ej. ACE-001"
            value="${escapeHtml(
              initial.codigoProducto ||
              selectedCode ||
              ""
            )}"
          >
        </div>

        <div class="inv-field full">
          <label for="p-ref">
            Referencia a libro
          </label>

          <input
            id="p-ref"
            type="text"
            placeholder="Ej. Compra, Ajuste, Inventario inicial"
            value="${escapeHtml(
              initial.referenciaLibro ||
              ""
            )}"
          >
        </div>

        <div class="inv-field full">
          <label for="p-doc">
            Número de documento
          </label>

          <input
            id="p-doc"
            type="text"
            placeholder="FAC-00125 / AJ-00001 / INV-00001"
            value="${escapeHtml(
              initial.numeroDocumento ||
              ""
            )}"
          >
        </div>

        <div
          class="inv-helper"
          id="p-hint"
        >
          Cuando seleccionas un producto existente,
          el sistema suma las cajas y unidades sueltas
          al stock actual.
        </div>

        <div class="inv-field">
          <label for="p-boxes">
            Cajas a agregar
          </label>

          <input
            id="p-boxes"
            type="number"
            min="0"
            step="1"
            value="${Math.max(
              0,
              numberOrZero(
                initial.boxes
              )
            )}"
          >
        </div>

        <div class="inv-field">
          <label for="p-upb">
            Unidades por caja
          </label>

          <input
            id="p-upb"
            type="number"
            min="1"
            step="1"
            value="${Math.max(
              1,
              numberOrZero(
                initial.unitsPerBox ||
                selectedUnitsPerBox ||
                1
              )
            )}"
          >
        </div>

        <div class="inv-field">
          <label for="p-extra">
            Unidades sueltas
          </label>

          <input
            id="p-extra"
            type="number"
            min="0"
            step="1"
            value="${Math.max(
              0,
              numberOrZero(
                initial.extraUnits
              )
            )}"
          >
        </div>

        <div class="inv-field">
          <label for="p-costbox">
            Costo por caja
          </label>

          <input
            id="p-costbox"
            type="number"
            min="0"
            step="0.01"
            value="${Math.max(
              0,
              numberOrZero(
                initial.lastCostPerBox
              )
            )}"
          >
        </div>

        <div class="inv-field">
          <label for="p-price">
            Precio de venta
          </label>

          <input
            id="p-price"
            type="number"
            min="0"
            step="0.01"
            value="${Math.max(
              0,
              numberOrZero(
                initial.price
              )
            )}"
          >
        </div>

        <div class="inv-mini-summary">

          <div class="inv-mini-card">
            <span>Unidades a sumar</span>
            <strong id="p-total-units">
              0
            </strong>
          </div>

          <div class="inv-mini-card">
            <span>Cajas a sumar</span>
            <strong id="p-total-boxes">
              0
            </strong>
          </div>

          <div class="inv-mini-card">
            <span>Modo activo</span>
            <strong id="p-mode-label">
              Nuevo
            </strong>
          </div>

        </div>

      </div>
    </div>
  `;
}

function syncStockModalState() {
  const modeEl =
    document.getElementById(
      "p-mode"
    );

  const existingGroup =
    document.getElementById(
      "existingGroup"
    );

  const nameGroup =
    document.getElementById(
      "nameGroup"
    );

  const existingEl =
    document.getElementById(
      "p-existing"
    );

  const nameEl =
    document.getElementById(
      "p-name"
    );

  const codeEl =
    document.getElementById(
      "p-code"
    );

  const upbEl =
    document.getElementById(
      "p-upb"
    );

  const costBoxEl =
    document.getElementById(
      "p-costbox"
    );

  const priceEl =
    document.getElementById(
      "p-price"
    );

  const hintEl =
    document.getElementById(
      "p-hint"
    );

  const modeLabel =
    document.getElementById(
      "p-mode-label"
    );

  const totalUnitsEl =
    document.getElementById(
      "p-total-units"
    );

  const totalBoxesEl =
    document.getElementById(
      "p-total-boxes"
    );

  if (
    !modeEl ||
    !existingGroup ||
    !nameGroup ||
    !existingEl ||
    !nameEl ||
    !codeEl ||
    !upbEl ||
    !costBoxEl ||
    !priceEl ||
    !hintEl ||
    !modeLabel ||
    !totalUnitsEl ||
    !totalBoxesEl
  ) {
    return;
  }

  const refreshPreview =
    () => {
      const boxes =
        Math.max(
          0,
          numberOrZero(
            document.getElementById(
              "p-boxes"
            )?.value
          )
        );

      const upb =
        Math.max(
          1,
          numberOrZero(
            document.getElementById(
              "p-upb"
            )?.value
          )
        );

      const extra =
        Math.max(
          0,
          numberOrZero(
            document.getElementById(
              "p-extra"
            )?.value
          )
        );

      const totalUnits =
        boxes *
          upb +
        extra;

      totalUnitsEl.textContent =
        String(
          totalUnits
        );

      totalBoxesEl.textContent =
        String(
          boxes
        );
    };

  const applyExistingProduct =
    () => {
      const typed =
        String(
          existingEl.value ||
          ""
        ).trim();

      const product =
        findProductByName(
          typed
        );

      if (!product) {
        upbEl.disabled =
          false;

        hintEl.textContent =
          "Escribe el nombre o el código exacto del producto, o selecciónalo de las sugerencias.";

        return;
      }

      const unitsPerBox =
        getUnitsPerBox(
          product
        );

      const costPerBox =
        numberOrZero(
          product.lastCostPerBox
        );

      const price =
        numberOrZero(
          product.price
        );

      nameEl.value =
        product.name ||
        "";

      codeEl.value =
        getProductCode(
          product
        ) ||
        "";

      upbEl.value =
        unitsPerBox;

      upbEl.disabled =
        true;

      costBoxEl.value =
        costPerBox.toFixed(
          2
        );

      priceEl.value =
        price.toFixed(
          2
        );

      hintEl.innerHTML = `
        Producto encontrado:
        <strong>
          ${escapeHtml(
            product.name ||
            ""
          )}
        </strong>.

        El sistema usará
        <strong>
          ${unitsPerBox}
        </strong>
        unidades por caja.

        <br>

        Costo por caja registrado:
        <strong>
          ${currency(
            costPerBox
          )}
        </strong>

        <br>

        Precio de venta registrado:
        <strong>
          ${currency(
            price
          )}
        </strong>
      `;
    };

  const applyMode =
    () => {
      const mode =
        modeEl.value;

      if (
        mode ===
        "existing"
      ) {
        existingGroup.style.display =
          "flex";

        nameGroup.style.display =
          "none";

        modeLabel.textContent =
          "Reposición";

        applyExistingProduct();
      } else {
        existingGroup.style.display =
          "none";

        nameGroup.style.display =
          "flex";

        modeLabel.textContent =
          "Nuevo";

        upbEl.disabled =
          false;

        if (
          !existingEl.value.trim()
        ) {
          costBoxEl.value =
            "0";

          priceEl.value =
            "0";
        }

        hintEl.textContent =
          "Completa los datos del producto nuevo y su cantidad inicial.";
      }

      refreshPreview();
    };

  modeEl.addEventListener(
    "change",
    applyMode
  );

  existingEl.addEventListener(
    "input",
    () => {
      if (
        modeEl.value !==
        "existing"
      ) {
        return;
      }

      applyExistingProduct();
      refreshPreview();
    }
  );

  existingEl.addEventListener(
    "change",
    () => {
      if (
        modeEl.value !==
        "existing"
      ) {
        return;
      }

      applyExistingProduct();
      refreshPreview();
    }
  );

  [
    "p-boxes",
    "p-upb",
    "p-extra"
  ].forEach(
    id => {
      const el =
        document.getElementById(
          id
        );

      if (el) {
        el.addEventListener(
          "input",
          refreshPreview
        );
      }
    }
  );

  applyMode();
  refreshPreview();
}

function readStockFormValues() {
  const mode =
    document.getElementById(
      "p-mode"
    ).value;

  const existingName =
    document.getElementById(
      "p-existing"
    )
      ? document.getElementById(
          "p-existing"
        )
          .value
          .trim()
      : "";

  const name =
    document.getElementById(
      "p-name"
    )
      ? document.getElementById(
          "p-name"
        )
          .value
          .trim()
      : "";

  const codigoProducto =
    document.getElementById(
      "p-code"
    )
      ? document.getElementById(
          "p-code"
        )
          .value
          .trim()
      : "";

  const referenciaLibro =
    document.getElementById(
      "p-ref"
    )
      ? document.getElementById(
          "p-ref"
        )
          .value
          .trim()
      : "";

  const numeroDocumento =
    document.getElementById(
      "p-doc"
    )
      ? document.getElementById(
          "p-doc"
        )
          .value
          .trim()
      : "";

  const boxes =
    Math.max(
      0,
      numberOrZero(
        document.getElementById(
          "p-boxes"
        ).value
      )
    );

  const unitsPerBox =
    Math.max(
      1,
      numberOrZero(
        document.getElementById(
          "p-upb"
        ).value
      )
    );

  const extraUnits =
    Math.max(
      0,
      numberOrZero(
        document.getElementById(
          "p-extra"
        ).value
      )
    );

  const lastCostPerBox =
    Math.max(
      0,
      numberOrZero(
        document.getElementById(
          "p-costbox"
        ).value
      )
    );

  const price =
    Math.max(
      0,
      numberOrZero(
        document.getElementById(
          "p-price"
        ).value
      )
    );

  const quantity =
    boxes *
      unitsPerBox +
    extraUnits;

  return {
    mode,
    existingName,
    name,
    codigoProducto,
    boxes,
    unitsPerBox,
    extraUnits,
    lastCostPerBox,
    price,
    quantity,
    referenciaLibro,
    numeroDocumento
  };
}

/*
 * ============================================================
 * MOVIMIENTOS
 * ============================================================
 */

async function registrarMovimientoStock({
  productId,
  productName = "",
  codigoProducto = "",
  tipoMovimiento = "entrada",
  referenciaLibro = "",
  numeroDocumento = "",
  entrada = 0,
  salida = 0,
  saldoAnterior = 0,
  saldoActual = 0,
  detalle = ""
}) {
  try {
    const user =
      auth.currentUser ||
      null;

    const context =
      currentUserInventoryContext ||
      {};

    const userName =
      context.name ||
      (
        getStoredCurrentUser() || {}
      ).name ||
      (
        user
          ? user.email
          : ""
      );

    await db
      .collection(
        "stock_movimientos"
      )
      .add({
        productId,

        productName,

        codigoProducto,

        productCode:
          codigoProducto,

        tipoMovimiento,

        referenciaLibro,

        referenceBook:
          referenciaLibro,

        bookReference:
          referenciaLibro,

        numeroDocumento,

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

        detalle,

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

        userName,

        createdAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp()
      });

    invalidateProductStockMovementsCache(
      productId
    );
  } catch (
    err
  ) {
    console.error(
      "Error registrando movimiento de stock:",
      err
    );

    throw err;
  }
}

/*
 * ============================================================
 * CREAR PRODUCTO
 * ============================================================
 */

async function createNewProduct(
  values
) {
  const ref =
    await db
      .collection(
        "productos"
      )
      .add({
        name:
          values.name,

        codigoProducto:
          values.codigoProducto ||
          "",

        productCode:
          values.codigoProducto ||
          "",

        quantity:
          values.quantity,

        stockCurrentUnits:
          values.quantity,

        stockBaseUnits:
          values.quantity,

        boxes:
          Math.floor(
            values.quantity /
              Math.max(
                1,
                values.unitsPerBox
              )
          ),

        unitsPerBox:
          values.unitsPerBox,

        lastCostPerBox:
          values.lastCostPerBox,

        lastCostPerUnit:
          values.unitsPerBox >
          0
            ? values.lastCostPerBox /
              values.unitsPerBox
            : 0,

        price:
          values.price,

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

        createdAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp(),

        updatedAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp()
      });

  await registrarMovimientoStock({
    productId:
      ref.id,

    productName:
      values.name,

    codigoProducto:
      values.codigoProducto ||
      "",

    tipoMovimiento:
      "entrada",

    referenciaLibro:
      values.referenciaLibro ||
      "Inventario inicial",

    numeroDocumento:
      values.numeroDocumento ||
      ref.id,

    entrada:
      values.quantity,

    salida:
      0,

    saldoAnterior:
      0,

    saldoActual:
      values.quantity,

    detalle:
      "Alta inicial de producto"
  });
}

/*
 * ============================================================
 * AGREGAR STOCK
 * ============================================================
 */

async function addToExistingProduct(
  product,
  values
) {
  const currentUnitsPerBox =
    getUnitsPerBox(
      product
    );

  const unitsAdded =
    Math.max(
      0,
      values.boxes
    ) *
      currentUnitsPerBox +
    Math.max(
      0,
      values.extraUnits
    );

  if (
    unitsAdded <=
    0
  ) {
    throw new Error(
      "La cantidad a agregar debe ser mayor que cero."
    );
  }

  const productRef =
    db
      .collection(
        "productos"
      )
      .doc(
        product.id
      );

  let saldoAnterior =
    0;

  let saldoActual =
    0;

  await db.runTransaction(
    async t => {
      const snap =
        await t.get(
          productRef
        );

      if (
        !snap.exists
      ) {
        throw new Error(
          "El producto ya no existe."
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
          "Este producto no pertenece al local actual."
        );
      }

      const currentStock =
        getCurrentStockUnits(
          data
        );

      const nextQuantity =
        currentStock +
        unitsAdded;

      const nextBoxes =
        Math.floor(
          nextQuantity /
            currentUnitsPerBox
        );

      saldoAnterior =
        currentStock;

      saldoActual =
        nextQuantity;

      const nextLastCostPerBox =
        values.lastCostPerBox >
        0
          ? values.lastCostPerBox
          : numberOrZero(
              data.lastCostPerBox
            );

      const nextPrice =
        values.price >
        0
          ? values.price
          : numberOrZero(
              data.price
            );

      const nextCodigoProducto =
        values.codigoProducto ||
        getProductCode(
          data
        ) ||
        "";

      t.update(
        productRef,
        {
          name:
            values.name ||
            data.name ||
            "",

          codigoProducto:
            nextCodigoProducto,

          productCode:
            nextCodigoProducto,

          quantity:
            nextQuantity,

          stockCurrentUnits:
            nextQuantity,

          boxes:
            nextBoxes,

          unitsPerBox:
            currentUnitsPerBox,

          lastCostPerBox:
            nextLastCostPerBox,

          lastCostPerUnit:
            currentUnitsPerBox >
            0
              ? nextLastCostPerBox /
                currentUnitsPerBox
              : 0,

          price:
            nextPrice,

          id_local:
            currentLocalId ||
            data.id_local ||
            null,

          localNombre:
            currentLocalInfo.nombre ||
            data.localNombre ||
            "",

          localNumeroDocumento:
            currentLocalInfo.numeroDocumento ||
            data.localNumeroDocumento ||
            "",

          localUbicacion:
            currentLocalInfo.ubicacion ||
            data.localUbicacion ||
            "",

          updatedAt:
            firebase.firestore
              .FieldValue
              .serverTimestamp()
        }
      );
    }
  );

  await registrarMovimientoStock({
    productId:
      product.id,

    productName:
      values.name ||
      product.name ||
      "",

    codigoProducto:
      values.codigoProducto ||
      getProductCode(
        product
      ) ||
      "",

    tipoMovimiento:
      "entrada",

    referenciaLibro:
      values.referenciaLibro ||
      "Compra",

    numeroDocumento:
      values.numeroDocumento ||
      "",

    entrada:
      unitsAdded,

    salida:
      0,

    saldoAnterior,

    saldoActual,

    detalle:
      "Entrada de inventario"
  });
}

/*
 * ============================================================
 * MODAL AGREGAR
 * ============================================================
 */

async function showAddProductModal() {
  if (
    !canEditInventory
  ) {
    await Swal.fire(
      "Sin permisos",
      "No puedes agregar productos desde este rol.",
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

  if (
    !currentProductsList.length
  ) {
    const result =
      await Swal.fire({
        title:
          "Nuevo producto",

        html:
          buildStockFormHtml({
            mode:
              "new",

            boxes:
              0,

            unitsPerBox:
              1,

            extraUnits:
              0,

            lastCostPerBox:
              0,

            price:
              0,

            referenciaLibro:
              "Inventario inicial",

            numeroDocumento:
              "",

            codigoProducto:
              ""
          }),

        showCancelButton:
          true,

        confirmButtonText:
          "Guardar",

        cancelButtonText:
          "Cancelar",

        focusConfirm:
          false,

        didOpen:
          syncStockModalState,

        preConfirm:
          () => {
            const values =
              readStockFormValues();

            if (
              !values.name
            ) {
              Swal.showValidationMessage(
                "El nombre es obligatorio."
              );

              return;
            }

            if (
              !values.codigoProducto
            ) {
              Swal.showValidationMessage(
                "El código de producto es obligatorio."
              );

              return;
            }

            if (
              values.quantity <=
              0
            ) {
              Swal.showValidationMessage(
                "Debes ingresar cajas o unidades sueltas."
              );

              return;
            }

            return values;
          }
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    try {
      await createNewProduct(
        result.value
      );

      await Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "success",

        title:
          "Producto agregado",

        timer:
          1400,

        showConfirmButton:
          false
      });
    } catch (
      err
    ) {
      console.error(
        "Error guardando producto:",
        err
      );

      await Swal.fire(
        "Error",
        "No se pudo guardar el producto.",
        "error"
      );
    }

    return;
  }

  const initialProduct =
    currentProductsList[
      0
    ] ||
    null;

  const result =
    await Swal.fire({
      title:
        "Agregar / reponer producto",

      html:
        buildStockFormHtml({
          mode:
            "existing",

          productName:
            initialProduct
              ? initialProduct.name
              : "",

          codigoProducto:
            initialProduct
              ? getProductCode(
                  initialProduct
                )
              : "",

          boxes:
            0,

          unitsPerBox:
            initialProduct
              ? getUnitsPerBox(
                  initialProduct
                )
              : 1,

          extraUnits:
            0,

          lastCostPerBox:
            initialProduct
              ? numberOrZero(
                  initialProduct.lastCostPerBox
                )
              : 0,

          price:
            initialProduct
              ? numberOrZero(
                  initialProduct.price
                )
              : 0,

          referenciaLibro:
            "Compra",

          numeroDocumento:
            ""
        }),

      showCancelButton:
        true,

      confirmButtonText:
        "Guardar",

      cancelButtonText:
        "Cancelar",

      focusConfirm:
        false,

      didOpen:
        syncStockModalState,

      preConfirm:
        () => {
          const values =
            readStockFormValues();

          if (
            values.mode ===
            "existing"
          ) {
            if (
              !values.existingName
            ) {
              Swal.showValidationMessage(
                "Debes escribir o seleccionar un producto existente."
              );

              return;
            }

            if (
              !findProductByName(
                values.existingName
              )
            ) {
              Swal.showValidationMessage(
                "No se encontró el producto. Selecciónalo de las sugerencias."
              );

              return;
            }

            if (
              values.quantity <=
              0
            ) {
              Swal.showValidationMessage(
                "Debes ingresar cajas o unidades sueltas."
              );

              return;
            }

            return values;
          }

          if (
            !values.name
          ) {
            Swal.showValidationMessage(
              "El nombre es obligatorio."
            );

            return;
          }

          if (
            !values.codigoProducto
          ) {
            Swal.showValidationMessage(
              "El código de producto es obligatorio."
            );

            return;
          }

          if (
            findProductByName(
              values.name
            ) ||
            findProductByName(
              values.codigoProducto
            )
          ) {
            Swal.showValidationMessage(
              "Ese producto ya existe. Usa la opción de producto existente."
            );

            return;
          }

          if (
            values.quantity <=
            0
          ) {
            Swal.showValidationMessage(
              "Debes ingresar cajas o unidades sueltas."
            );

            return;
          }

          return values;
        }
    });

  if (
    !result.isConfirmed
  ) {
    return;
  }

  try {
    const values =
      result.value;

    if (
      values.mode ===
      "existing"
    ) {
      const product =
        findProductByName(
          values.existingName
        );

      if (
        !product
      ) {
        await Swal.fire(
          "No encontrado",
          "El producto seleccionado no existe.",
          "warning"
        );

        return;
      }

      await addToExistingProduct(
        product,
        values
      );

      await Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "success",

        title:
          "Stock agregado al producto",

        timer:
          1400,

        showConfirmButton:
          false
      });

      return;
    }

    await createNewProduct(
      values
    );

    await Swal.fire({
      toast:
        true,

      position:
        "top-end",

      icon:
        "success",

      title:
        "Producto agregado",

      timer:
        1400,

      showConfirmButton:
        false
    });
  } catch (
    err
  ) {
    console.error(
      "Error guardando producto:",
      err
    );

    await Swal.fire(
      "Error",
      "No se pudo guardar el producto.",
      "error"
    );
  }
}

/*
 * ============================================================
 * FORMULARIO DE EDICIÓN
 * ============================================================
 */

function buildProductFormHtml(
  initial = {}
) {
  return `
    <div style="text-align:left;">

      <input
        id="p-name"
        class="swal2-input"
        placeholder="Nombre del producto"
        value="${escapeHtml(
          initial.name ||
          ""
        )}"
      >

      <input
        id="p-code"
        class="swal2-input"
        placeholder="Código del producto"
        value="${escapeHtml(
          initial.codigoProducto ||
          ""
        )}"
      >

      <input
        id="p-boxes"
        type="number"
        class="swal2-input"
        placeholder="Número de cajas"
        min="0"
        value="${numberOrZero(
          initial.boxes
        )}"
      >

      <input
        id="p-upb"
        type="number"
        class="swal2-input"
        placeholder="Unidades por caja"
        min="1"
        value="${Math.max(
          1,
          numberOrZero(
            initial.unitsPerBox ||
            1
          )
        )}"
      >

      <input
        id="p-extra"
        type="number"
        class="swal2-input"
        placeholder="Unidades sueltas"
        min="0"
        value="${numberOrZero(
          initial.extraUnits
        )}"
      >

      <input
        id="p-costbox"
        type="number"
        class="swal2-input"
        placeholder="Costo por caja"
        step="0.01"
        min="0"
        value="${numberOrZero(
          initial.lastCostPerBox
        )}"
      >

      <input
        id="p-price"
        type="number"
        class="swal2-input"
        placeholder="Precio de venta"
        step="0.01"
        min="0"
        value="${numberOrZero(
          initial.price
        )}"
      >

      ${
        initial.bookReferencesHtml
          ? `
            <label
              for="p-ref-history"
              style="
                display:block;
                margin-top:12px;
                margin-bottom:5px;
                font-weight:600;
              "
            >
              Referencias a libro registradas
            </label>

            <select
              id="p-ref-history"
              class="swal2-select"
              style="
                width:100%;
                margin:0 0 8px 0;
              "
            >
              ${initial.bookReferencesHtml}
            </select>
          `
          : ""
      }

      <input
        id="p-ref"
        class="swal2-input"
        placeholder="Referencia a libro"
        value="${escapeHtml(
          initial.referenciaLibro ||
          ""
        )}"
      >

      <input
        id="p-doc"
        class="swal2-input"
        placeholder="Número de documento"
        value="${escapeHtml(
          initial.numeroDocumento ||
          ""
        )}"
      >

      ${
        initial.bookReferencesCount >
        0
          ? `
              <div
                style="
                  margin-top:8px;
                  padding:8px 10px;
                  border-radius:6px;
                  background:#f3f4f6;
                  color:#374151;
                  font-size:12px;
                "
              >
                Se encontraron
                <strong>
                  ${initial.bookReferencesCount}
                </strong>
                referencia(s) registradas para
                este producto.
              </div>
            `
          : `
              <div
                style="
                  margin-top:8px;
                  padding:8px 10px;
                  border-radius:6px;
                  background:#fef3c7;
                  color:#92400e;
                  font-size:12px;
                "
              >
                No se encontraron referencias
                anteriores en los movimientos de
                este producto.
              </div>
            `
      }

      <div
        style="
          text-align:left;
          margin-top:10px;
        "
      >
        <small>
          La cantidad total se calcula con
          cajas × unidades por caja +
          unidades sueltas.
        </small>
      </div>

    </div>
  `;
}

function readProductFormValues() {
  const name =
    document.getElementById(
      "p-name"
    )
      .value
      .trim();

  const codigoProducto =
    document.getElementById(
      "p-code"
    )
      .value
      .trim();

  const boxes =
    Math.max(
      0,
      numberOrZero(
        document.getElementById(
          "p-boxes"
        ).value
      )
    );

  const unitsPerBox =
    Math.max(
      1,
      numberOrZero(
        document.getElementById(
          "p-upb"
        ).value
      )
    );

  const extraUnits =
    Math.max(
      0,
      numberOrZero(
        document.getElementById(
          "p-extra"
        ).value
      )
    );

  const lastCostPerBox =
    Math.max(
      0,
      numberOrZero(
        document.getElementById(
          "p-costbox"
        ).value
      )
    );

  const price =
    Math.max(
      0,
      numberOrZero(
        document.getElementById(
          "p-price"
        ).value
      )
    );

  const referenciaLibro =
    document.getElementById(
      "p-ref"
    )
      ? document.getElementById(
          "p-ref"
        )
          .value
          .trim()
      : "";

  const numeroDocumento =
    document.getElementById(
      "p-doc"
    )
      ? document.getElementById(
          "p-doc"
        )
          .value
          .trim()
      : "";

  return {
    name,
    codigoProducto,
    boxes,
    unitsPerBox,
    extraUnits,
    lastCostPerBox,
    price,
    referenciaLibro,
    numeroDocumento,

    quantity:
      boxes *
        unitsPerBox +
      extraUnits
  };
}

/*
 * ============================================================
 * EDICIÓN
 * ============================================================
 */

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

  try {
    /*
     * No consulta productos.
     * El producto ya está en la caché del listener realtime.
     */
    const product =
      findProductById(
        productId
      );

    if (
      !product
    ) {
      await Swal.fire(
        "No encontrado",
        "El producto no existe o ya no pertenece al local actual.",
        "warning"
      );

      return;
    }

    if (
      !matchesCurrentLocal(
        product
      )
    ) {
      await Swal.fire(
        "Sin permisos",
        "Este producto no pertenece al local actual.",
        "error"
      );

      return;
    }

    /*
     * Única consulta adicional:
     * movimientos históricos del producto.
     *
     * También está cacheada.
     */
    const movements =
      await loadProductStockMovements(
        productId
      );

    const uniqueReferences =
      getUniqueBookReferences(
        movements
      );

    let initialReference =
      String(
        product.referenciaLibro ||
        product.referenceBook ||
        ""
      ).trim();

    let initialDocument =
      String(
        product.numeroDocumento ||
        product.documentNumber ||
        ""
      ).trim();

    if (
      !initialReference &&
      uniqueReferences.length >
        0
    ) {
      initialReference =
        uniqueReferences[0]
          .referenciaLibro ||
        "";

      initialDocument =
        uniqueReferences[0]
          .numeroDocumento ||
        "";
    }

    const bookReferencesHtml =
      buildBookReferenceOptions(
        uniqueReferences,
        initialReference,
        initialDocument
      );

    const currentUnitsPerBox =
      getUnitsPerBox(
        product
      );

    const currentUnits =
      getCurrentStockUnits(
        product
      );

    const currentBoxes =
      Math.floor(
        currentUnits /
          currentUnitsPerBox
      );

    const extraUnits =
      Math.max(
        0,
        currentUnits -
          (
            currentBoxes *
            currentUnitsPerBox
          )
      );

    const result =
      await Swal.fire({
        title:
          `Editar: ${product.name || ""}`,

        html:
          buildProductFormHtml({
            name:
              product.name ||
              "",

            codigoProducto:
              getProductCode(
                product
              ),

            boxes:
              currentBoxes,

            unitsPerBox:
              currentUnitsPerBox,

            extraUnits,

            lastCostPerBox:
              numberOrZero(
                product.lastCostPerBox
              ),

            price:
              numberOrZero(
                product.price
              ),

            referenciaLibro:
              initialReference,

            numeroDocumento:
              initialDocument,

            bookReferencesHtml,

            bookReferencesCount:
              uniqueReferences.length
          }),

        focusConfirm:
          false,

        showCancelButton:
          true,

        confirmButtonText:
          "Actualizar",

        cancelButtonText:
          "Cancelar",

        didOpen:
          () => {
            const historySelect =
              document.getElementById(
                "p-ref-history"
              );

            if (
              !historySelect
            ) {
              return;
            }

            historySelect.addEventListener(
              "change",
              () => {
                const index =
                  Number(
                    historySelect.value
                  );

                if (
                  !Number.isInteger(
                    index
                  ) ||
                  index < 0 ||
                  index >=
                    uniqueReferences.length
                ) {
                  return;
                }

                const selected =
                  uniqueReferences[
                    index
                  ];

                const refInput =
                  document.getElementById(
                    "p-ref"
                  );

                const docInput =
                  document.getElementById(
                    "p-doc"
                  );

                if (
                  refInput
                ) {
                  refInput.value =
                    selected.referenciaLibro ||
                    "";
                }

                if (
                  docInput
                ) {
                  docInput.value =
                    selected.numeroDocumento ||
                    "";
                }
              }
            );
          },

        preConfirm:
          () => {
            const values =
              readProductFormValues();

            if (
              !values.name
            ) {
              Swal.showValidationMessage(
                "El nombre es obligatorio."
              );

              return;
            }

            if (
              !values.codigoProducto
            ) {
              Swal.showValidationMessage(
                "El código de producto es obligatorio."
              );

              return;
            }

            return values;
          }
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    const values =
      result.value;

    const nextUnits =
      values.quantity;

    await db
      .collection(
        "productos"
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

        referenciaLibro:
          values.referenciaLibro,

        referenceBook:
          values.referenciaLibro,

        numeroDocumento:
          values.numeroDocumento,

        quantity:
          nextUnits,

        stockCurrentUnits:
          nextUnits,

        boxes:
          Math.floor(
            nextUnits /
              values.unitsPerBox
          ),

        unitsPerBox:
          values.unitsPerBox,

        lastCostPerBox:
          values.lastCostPerBox,

        lastCostPerUnit:
          values.unitsPerBox >
          0
            ? values.lastCostPerBox /
              values.unitsPerBox
            : 0,

        price:
          values.price,

        id_local:
          currentLocalId ||
          product.id_local ||
          null,

        localNombre:
          currentLocalInfo.nombre ||
          product.localNombre ||
          "",

        localNumeroDocumento:
          currentLocalInfo.numeroDocumento ||
          product.localNumeroDocumento ||
          "",

        localUbicacion:
          currentLocalInfo.ubicacion ||
          product.localUbicacion ||
          "",

        updatedAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp()
      });

    if (
      nextUnits !==
      currentUnits
    ) {
      await registrarMovimientoStock({
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
          `AJ-${Date.now()}`,

        entrada:
          Math.max(
            0,
            nextUnits -
              currentUnits
          ),

        salida:
          Math.max(
            0,
            currentUnits -
              nextUnits
          ),

        saldoAnterior:
          currentUnits,

        saldoActual:
          nextUnits,

        detalle:
          "Edición manual de stock"
      });
    }

    await Swal.fire({
      toast:
        true,

      position:
        "top-end",

      icon:
        "success",

      title:
        "Producto actualizado",

      timer:
        1400,

      showConfirmButton:
        false
    });
  } catch (
    err
  ) {
    console.error(
      "Error editando producto:",
      err
    );

    await Swal.fire(
      "Error",
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

function confirmDeleteProduct(
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
    Swal.fire(
      "No tienes permisos",
      "Solo el administrador puede eliminar productos.",
      "error"
    );

    return;
  }

  Swal.fire({
    title:
      `Eliminar "${productName}"?`,

    text:
      "Esta acción no se puede deshacer",

    icon:
      "warning",

    showCancelButton:
      true,

    confirmButtonText:
      "Sí, eliminar",

    cancelButtonText:
      "Cancelar"
  }).then(
    async result => {
      if (
        !result.isConfirmed
      ) {
        return;
      }

      try {
        await db
          .collection(
            "productos"
          )
          .doc(
            productId
          )
          .delete();

        invalidateProductStockMovementsCache(
          productId
        );

        Swal.fire({
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
            1400
        });
      } catch (
        err
      ) {
        console.error(
          "Error eliminando producto:",
          err
        );

        Swal.fire(
          "Error",
          "No se pudo eliminar el producto.",
          "error"
        );
      }
    }
  );
}

/*
 * ============================================================
 * BÚSQUEDA DATATABLE
 * ============================================================
 */

function filterWithDataTable() {
  const dt =
    ensureInventoryDataTable();

  if (
    !dt
  ) {
    return;
  }

  dt.search(
    searchInput
      ? searchInput.value.trim()
      : ""
  ).draw();
}

function destroyInventoryDataTable() {
  if (
    inventoryDT
  ) {
    inventoryDT.destroy();

    inventoryDT =
      null;
  }
}

/*
 * ============================================================
 * NORMALIZACIÓN OPCIONAL
 * ============================================================
 */

async function backfillStockBaseUnitsIfNeeded(
  products
) {
  if (
    !(
      currentRole ===
        "administrador" ||
      currentRole ===
        "admin" ||
      currentRole ===
        "bodega"
    )
  ) {
    return;
  }

  const batch =
    db.batch();

  let pending =
    0;

  products.forEach(
    product => {
      if (
        !Number.isFinite(
          Number(
            product.stockCurrentUnits
          )
        )
      ) {
        const ref =
          db
            .collection(
              "productos"
            )
            .doc(
              product.id
            );

        batch.update(
          ref,
          {
            stockCurrentUnits:
              getCurrentStockUnits(
                product
              ),

            updatedAt:
              firebase.firestore
                .FieldValue
                .serverTimestamp()
          }
        );

        pending +=
          1;
      }
    }
  );

  if (
    pending >
    0
  ) {
    try {
      await batch.commit();
    } catch (
      err
    ) {
      console.warn(
        "No se pudo completar la normalización de stockCurrentUnits:",
        err
      );
    }
  }
}

/*
 * ============================================================
 * INICIALIZACIÓN
 * ============================================================
 *
 * IMPORTANTE:
 * Este listener puede coexistir con el listener
 * de app.js.
 *
 * Ambos solicitan el mismo contexto.
 * app.js devuelve la caché/promesa compartida.
 *
 * No se vuelve a consultar:
 *   empleados
 *   local
 *
 * después de que getCurrentUserContext() haya
 * resuelto el contexto.
 */

auth.onAuthStateChanged(
  async user => {
    const page =
      window.location.pathname
        .split("/")
        .pop()
        .toLowerCase();

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

    try {
      /*
       * Esperar explícitamente a app.js.
       *
       * Este es el cambio más importante:
       * evita una carrera entre los dos onAuthStateChanged.
       */
      await resolveInventoryContext(
        user
      );

      if (
        !currentLocalId
      ) {
        await Swal.fire({
          icon:
            "warning",

          title:
            "Sin local",

          text:
            "El usuario no tiene id_local asignado. El inventario no puede filtrarse."
        });

        return;
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

      /*
       * Inicializar DataTable una sola vez.
       */
      ensureInventoryDataTable();

      /*
       * Iniciar los únicos listeners permanentes
       * del módulo.
       */
      startRealtimeListeners();

    } catch (
      err
    ) {
      console.error(
        "Error leyendo contexto del inventario:",
        err
      );

      await Swal.fire({
        icon:
          "error",

        title:
          "Error de contexto",

        text:
          err.message ||
          "No se pudo resolver el local del usuario."
      });
    }
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
    if (
      btnAdd
    ) {
      btnAdd.addEventListener(
        "click",
        showAddProductModal
      );
    }

    if (
      searchInput
    ) {
      searchInput.addEventListener(
        "input",
        filterWithDataTable
      );
    }

    /*
     * NO registrar logout aquí.
     *
     * app.js ya se encarga de:
     *
     * #logoutButton
     * #logoutButtonMobile
     *
     * Tener otro listener aquí provocaría
     * dos llamadas a signOut/navegación.
     */

    window.addEventListener(
      "beforeunload",
      () => {
        stopRealtimeListeners();

        destroyInventoryDataTable();

        productStockMovementsCache.clear();

        productStockMovementsPending.clear();
      }
    );
  }
);