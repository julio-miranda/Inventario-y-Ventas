// assets/js/views/inventory.view.js

"use strict";

/*
 * Módulo de inventario
 *
 * Responsabilidades:
 * - Renderizado del inventario.
 * - Configuración de DataTables.
 * - Renderizado alternativo sin DataTables.
 * - Selectores de proveedores.
 * - Formularios y modales de inventario.
 * - Historial de movimientos.
 * - Botones de conversión y movimientos.
 * - Utilidades auxiliares para MVC.
 *
 * Dependencias:
 * - inventory.calculations.js
 * - inventory.repository.js
 * - inventory.service.js
 * - inventory.controller.js
 *
 * Este archivo debe cargarse después de las dependencias
 * que proporcionan las funciones bioxInv* utilizadas aquí.
 */

/*
 * ============================================================
 * REFERENCIAS GENERALES DEL DOM
 * ============================================================
 */

function bioxInvGetInventoryTableBody() {
  return document.querySelector(
    "#inventoryTable tbody"
  );
}

function bioxInvGetLowStockPanel() {
  return document.getElementById(
    "lowStockPanel"
  );
}

function bioxInvGetInventorySearchInput() {
  return (
    document.getElementById("searchInventory") ||
    document.getElementById("inventorySearch") ||
    document.getElementById("productSearch") ||
    document.getElementById("salesSearch") ||
    document.querySelector("[data-inventory-search]")
  );
}

function bioxInvGetInventoryAddButton() {
  return (
    document.getElementById("btnAddProduct") ||
    document.getElementById("btnAdd")
  );
}

function bioxInvGetInventoryTotalProductsCard() {
  return document.getElementById(
    "totalProductsCard"
  );
}

function bioxInvGetInventoryTotalValueCard() {
  return document.getElementById(
    "totalValueCard"
  );
}

function bioxInvGetInventoryLowStockCard() {
  return document.getElementById(
    "lowStockCard"
  );
}

function bioxInvGetInventoryGreetingElements() {
  return document.querySelectorAll(
    ".userGreeting"
  );
}


/*
 * ============================================================
 * SELECTOR MÚLTIPLE DE PROVEEDORES
 * ============================================================
 */

function bioxInvBuildProviderMultiSelectHtml(
  selectorId,
  providers = [],
  selectedIds = []
) {
  const normalizedSelected = new Set(
    bioxInvNormalizeIdArray(selectedIds)
  );

  const safeProviders =
    bioxInvMergeProviderCollections(providers);

  return `
    <div
      id="${bioxInvEscapeHtml(selectorId)}"
      class="provider-multi-select"
      data-role="provider-selector"
    >
      <div class="provider-multi-header">
        <span>
          Selecciona uno o varios proveedores
        </span>

        <span
          class="provider-multi-count"
          data-role="provider-count"
        >
          ${normalizedSelected.size} seleccionados
        </span>
      </div>

      <input
        type="text"
        class="provider-multi-search"
        placeholder="Buscar proveedor..."
        autocomplete="off"
        data-role="provider-search"
      >

      <div
        class="provider-multi-options"
        data-role="provider-options"
      >
        ${
          safeProviders.length
            ? safeProviders.map(provider => {
                const providerId = String(
                  provider.id || ""
                ).trim();

                const checked =
                  normalizedSelected.has(providerId);

                const providerName =
                  bioxInvGetProviderName(provider) ||
                  bioxInvGetProviderBusinessName(provider) ||
                  providerId ||
                  "Proveedor";

                const businessName =
                  bioxInvGetProviderBusinessName(provider);

                const searchText =
                  bioxInvNormalizeText([
                    bioxInvGetProviderName(provider),
                    businessName,
                    bioxInvGetProviderDisplayName(provider),
                    providerId
                  ].filter(Boolean).join(" "));

                return `
                  <label
                    class="provider-multi-option"
                    data-provider-search="${bioxInvEscapeHtml(searchText)}"
                  >
                    <input
                      type="checkbox"
                      class="provider-multi-checkbox"
                      value="${bioxInvEscapeHtml(providerId)}"
                      ${checked ? "checked" : ""}
                    >

                    <span>
                      <strong>
                        ${bioxInvEscapeHtml(providerName)}
                      </strong>

                      ${
                        businessName
                          ? `
                            <small>
                              ${bioxInvEscapeHtml(businessName)}
                            </small>
                          `
                          : ""
                      }
                    </span>
                  </label>
                `;
              }).join("")
            : `
              <div class="provider-multi-empty">
                No hay proveedores disponibles para este local.
              </div>
            `
        }
      </div>

      <div
        class="provider-multi-summary"
        data-role="provider-summary"
      >
        ${
          safeProviders
            .filter(provider =>
              normalizedSelected.has(
                String(provider.id || "").trim()
              )
            )
            .map(provider =>
              bioxInvEscapeHtml(
                bioxInvGetProviderDisplayName(provider)
              )
            )
            .join(" | ") ||
          "Ningún proveedor seleccionado"
        }
      </div>
    </div>
  `;
}


function bioxInvGetProviderSelectorRoot(
  rowOrSelector
) {
  if (!rowOrSelector) {
    return null;
  }

  if (typeof rowOrSelector === "string") {
    return document.getElementById(rowOrSelector);
  }

  if (rowOrSelector instanceof Element) {
    return rowOrSelector.querySelector(
      '[data-role="provider-selector"]'
    );
  }

  return null;
}


function bioxInvGetSelectedProviderIdsFromSelector(
  root
) {
  if (!root) {
    return [];
  }

  return bioxInvNormalizeIdArray(
    Array.from(
      root.querySelectorAll(
        ".provider-multi-checkbox:checked"
      )
    ).map(input => input.value)
  );
}


function bioxInvUpdateProviderSelectorSummary(
  root
) {
  if (!root) {
    return;
  }

  const selectedIds =
    bioxInvGetSelectedProviderIdsFromSelector(root);

  const selectedSet = new Set(selectedIds);

  const providers =
    bioxInvCurrentProvidersList.filter(provider =>
      selectedSet.has(
        String(provider.id).trim()
      )
    );

  const summary = root.querySelector(
    '[data-role="provider-summary"]'
  );

  const count = root.querySelector(
    '[data-role="provider-count"]'
  );

  if (summary) {
    summary.textContent = providers
      .map(provider =>
        bioxInvGetProviderDisplayName(provider)
      )
      .filter(Boolean)
      .join(" | ") ||
      "Ningún proveedor seleccionado";
  }

  if (count) {
    count.textContent =
      `${selectedIds.length} seleccionado${selectedIds.length === 1 ? "" : "s"}`;
  }
}


function bioxInvBindProviderSelectorEvents(root) {
  if (!root) {
    return;
  }

  const search = root.querySelector(
    '[data-role="provider-search"]'
  );

  if (
    search &&
    search.dataset.bound !== "1"
  ) {
    search.dataset.bound = "1";

    search.addEventListener("input", () => {
      const text = bioxInvNormalizeText(
        search.value
      );

      root
        .querySelectorAll(".provider-multi-option")
        .forEach(option => {
          const searchText =
            option.dataset.providerSearch || "";

          option.classList.toggle(
            "is-filtered-out",
            Boolean(text) &&
            !searchText.includes(text)
          );
        });
    });
  }

  root
    .querySelectorAll(".provider-multi-checkbox")
    .forEach(checkbox => {
      if (checkbox.dataset.bound === "1") {
        return;
      }

      checkbox.dataset.bound = "1";

      checkbox.addEventListener("change", () => {
        bioxInvUpdateProviderSelectorSummary(root);
      });
    });
}


function bioxInvSetProviderSelector(
  root,
  providers,
  selectedIds,
  autoSelectFirst = false
) {
  if (!root) {
    return [];
  }

  const available =
    bioxInvMergeProviderCollections(providers);

  let selected =
    bioxInvNormalizeIdArray(selectedIds);

  const availableIds =
    bioxInvGetProviderIds(available);

  selected = selected.filter(id =>
    availableIds.includes(id)
  );

  if (
    !selected.length &&
    autoSelectFirst &&
    available.length
  ) {
    const firstId = String(
      available[0].id || ""
    ).trim();

    if (firstId) {
      selected = [firstId];
    }
  }

  root.innerHTML =
    bioxInvBuildProviderMultiSelectHtml(
      root.id,
      available,
      selected
    );

  bioxInvBindProviderSelectorEvents(root);

  return selected;
}


/*
 * ============================================================
 * RENDERIZADO DE LA TABLA
 * ============================================================
 */

function bioxInvRenderStatusChip(status) {
  const statusClass =
    status === "Reponer"
      ? "inventory-status-chip--restock"
      : status === "Bajo"
        ? "inventory-status-chip--low"
        : "inventory-status-chip--ok";

  const label =
    status === "Reponer" || status === "Bajo"
      ? status
      : "OK";

  return `
    <span class="inventory-status-chip ${statusClass}">
      ${label}
    </span>
  `;
}


function bioxInvRenderStockDisplay(row) {
  const stock =
    bioxInvDecimalOrZero(row.stockUnits);

  const unitsPerBox =
    bioxInvDecimalOrZero(row.unitsPerBox);

  if (unitsPerBox > 0) {
    const boxesEquivalent =
      bioxInvDecimalOrZero(
        stock / unitsPerBox
      );

    return `
      <strong>
        ${bioxInvFormatQuantity(stock)}
      </strong>

      <br>

      <small>
        ${bioxInvFormatQuantity(boxesEquivalent)}
        ${boxesEquivalent === 1 ? "caja" : "cajas"}
        equivalentes
        ×
        ${bioxInvFormatQuantity(unitsPerBox)}
        unidades/caja
      </small>
    `;
  }

  return bioxInvFormatQuantity(stock);
}


function bioxInvRenderActions(row) {
  if (!bioxInvCanEditInventory) {
    return `
      <span class="small">
        Solo lectura
      </span>
    `;
  }

  const isAdmin =
    bioxInvIsAdministratorRole();

  return `
    <button
      type="button"
      class="btn-outline"
      data-action="movements"
      data-id="${bioxInvEscapeHtml(row.id)}"
    >
      <i class="fas fa-history"></i>
      Entradas
    </button>

    <button
      type="button"
      class="btn-outline inventory-delete-action"
      data-action="delete"
      data-id="${bioxInvEscapeHtml(row.id)}"
      data-name="${bioxInvEscapeHtml(row.name)}"
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
 * CONFIGURACIÓN DE DATATABLES
 * ============================================================
 */

function bioxInvViewEnsureInventoryDataTable() {
  if (typeof document === "undefined") {
    return null;
  }

  const table = document.getElementById(
    "inventoryTable"
  );

  if (!table) {
    if (typeof bioxInvInventoryDT !== "undefined") {
      bioxInvInventoryDT = null;
    }

    console.warn(
      "[Inventory View] No se encontró #inventoryTable."
    );

    return null;
  }

  const jq = window.jQuery || window.$;

  if (
    typeof jq !== "function" ||
    !jq.fn ||
    typeof jq.fn.DataTable !== "function"
  ) {
    if (typeof bioxInvInventoryDT !== "undefined") {
      bioxInvInventoryDT = null;
    }

    console.warn(
      "[Inventory View] jQuery DataTables no está disponible."
    );

    return null;
  }

  const columns = [
    {
      data: "name",
      title: "Nombre",

      render: (data, type, row) => {
        if (type === "filter") {
          return row?.searchText || data || "";
        }

        if (type === "display") {
          return bioxInvEscapeHtml(data || "");
        }

        return data || "";
      }
    },

    {
      data: "productCode",
      title: "Código",
      defaultContent: "",

      render: (data, type, row) => {
        const code = String(
          data ??
          row?.codigoProducto ??
          ""
        ).trim();

        if (type === "display") {
          return code
            ? bioxInvEscapeHtml(code)
            : "—";
        }

        return code;
      }
    },

    {
      data: "providerName",
      title: "Proveedores",

      render: (data, type) =>
        type === "display"
          ? bioxInvEscapeHtml(data || "Sin proveedor")
          : data
    },

    {
      data: "stockUnits",
      title: "Stock",

      render: (data, type, row) =>
        type === "display"
          ? bioxInvRenderStockDisplay(row)
          : data
    },

    {
      data: "price",
      title: "Precio",

      render: (data, type) =>
        type === "display"
          ? bioxInvCurrency(data)
          : data
    },

    {
      data: "soldMonthUnits",
      title: "Vendido Mes (Unid.)",

      render: (data, type) =>
        type === "display"
          ? bioxInvFormatQuantity(data)
          : data
    },

    {
      data: "soldMonthBoxes",
      title: "Vendido Mes (Cajas)",

      render: (data, type) =>
        type === "display"
          ? bioxInvFormatQuantity(data)
          : data
    },

    {
      data: "costPerUnit",
      title: "Costo por unidad",

      render: (data, type) =>
        type === "display"
          ? bioxInvCurrency(data)
          : data
    },

    {
      data: "suggestedPurchaseUnits",
      title: "Sugerido Compra (Unid.)",

      render: (data, type) =>
        type === "display"
          ? bioxInvFormatQuantity(data)
          : data
    },

    {
      data: "suggestedPurchaseBoxes",
      title: "Sugerido Compra (Cajas)",

      render: (data, type) =>
        type === "display"
          ? bioxInvFormatQuantity(data)
          : data
    },

    {
      data: "status",
      title: "Estado",

      render: (data, type) =>
        type === "display"
          ? bioxInvRenderStatusChip(data)
          : data
    },

    {
      data: null,
      title: "Acciones",
      orderable: false,
      searchable: false,

      render: (data, type, row) =>
        type === "display"
          ? bioxInvRenderActions(row)
          : ""
    }
  ];

  /*
   * La cantidad de encabezados del HTML debe coincidir
   * con la cantidad de columnas de DataTables.
   */
  const headerCount =
    table.querySelectorAll("thead th").length;

  if (headerCount !== columns.length) {
    console.error(
      "[Inventory View] La cantidad de encabezados no coincide con las columnas de DataTables.",
      {
        encabezadosHTML: headerCount,
        columnasDataTables: columns.length,
        tabla: "#inventoryTable"
      }
    );

    if (jq.fn.DataTable.isDataTable(table)) {
      try {
        jq(table).DataTable().clear().destroy();
      } catch (error) {
        console.error(
          "[Inventory View] No se pudo destruir la instancia incompatible de DataTables:",
          error
        );
      }
    }

    if (typeof bioxInvInventoryDT !== "undefined") {
      bioxInvInventoryDT = null;
    }

    delete table.dataset.bioxInventoryViewDataTable;

    return null;
  }

  /*
   * Reutilizar solamente una instancia creada
   * con esta configuración.
   */
  if (jq.fn.DataTable.isDataTable(table)) {
    const existingTable =
      jq(table).DataTable();

    let existingColumnCount = 0;

    try {
      existingColumnCount =
        existingTable.columns().count();
    } catch (error) {
      existingColumnCount = 0;
    }

    if (
      table.dataset.bioxInventoryViewDataTable === "1" &&
      existingColumnCount === columns.length
    ) {
      bioxInvInventoryDT = existingTable;

      return existingTable;
    }

    try {
      existingTable.clear();
      existingTable.destroy();
    } catch (error) {
      console.error(
        "[Inventory View] Error al reemplazar la instancia anterior de DataTables:",
        error
      );

      if (typeof bioxInvInventoryDT !== "undefined") {
        bioxInvInventoryDT = null;
      }

      return null;
    }
  }

  if (typeof bioxInvInventoryDT !== "undefined") {
    bioxInvInventoryDT = null;
  }

  try {
    const dataTable = jq(table).DataTable({
      data: [],
      columns,

      pageLength: 10,

      lengthMenu: [
        5,
        10,
        25,
        50
      ],

      order: [
        [0, "asc"]
      ],

      autoWidth: false,
      scrollX: true,
      scrollCollapse: true,
      deferRender: true,

      dom: 'rt<"bottom"ip><"clear">',

      language: {
        emptyTable: "No hay productos registrados.",
        zeroRecords: "No se encontraron coincidencias.",
        info: "Mostrando _START_ a _END_ de _TOTAL_",
        infoEmpty: "No hay registros",
        infoFiltered: "(filtrado de _MAX_ registros)",

        paginate: {
          previous: "‹",
          next: "›"
        }
      }
    });

    if (typeof bioxInvInventoryDT !== "undefined") {
      bioxInvInventoryDT = dataTable;
    }

    table.dataset.bioxInventoryViewDataTable = "1";

    /*
     * Eventos de acciones de inventario.
     */
    jq("#inventoryTable tbody")
      .off("click.inventoryMovements")
      .on(
        "click.inventoryMovements",
        "button[data-action='movements']",
        function () {
          if (!bioxInvCanEditInventory) {
            return;
          }

          bioxInvOpenMovementManagerModal(
            String(jq(this).data("id"))
          );
        }
      );

    jq("#inventoryTable tbody")
      .off("click.inventoryDelete")
      .on(
        "click.inventoryDelete",
        "button[data-action='delete']",
        function () {
          if (!bioxInvCanEditInventory) {
            return;
          }

          bioxInvConfirmDeleteProduct(
            String(jq(this).data("id")),
            String(jq(this).data("name") || "")
          );
        }
      );

    console.info(
      "[Inventory View] DataTables inicializado correctamente.",
      {
        columnas: columns.length,
        encabezados: headerCount,
        columnaCodigo: true
      }
    );

    return dataTable;

  } catch (error) {
    if (typeof bioxInvInventoryDT !== "undefined") {
      bioxInvInventoryDT = null;
    }

    delete table.dataset.bioxInventoryViewDataTable;

    console.error(
      "[Inventory View] No se pudo inicializar DataTables:",
      error
    );

    return null;
  }
}


/*
 * ============================================================
 * ACTUALIZACIÓN DE LA VISTA PRINCIPAL
 * ============================================================
 */

function bioxInvViewRefreshInventoryView() {
  const products = Array.isArray(
    bioxInvCurrentProductsList
  )
    ? bioxInvCurrentProductsList
    : [];

  if (
    typeof bioxInvBuildRowData !== "function"
  ) {
    throw new Error(
      "[Inventory View] bioxInvBuildRowData() no está disponible."
    );
  }

  /*
   * Preparar los datos de cada fila e incorporar
   * el código del producto.
   */
  const rows = products.map(product => {
    const row =
      bioxInvBuildRowData(product) || {};

    const productCode =
      typeof bioxInvGetProductCode === "function"
        ? String(
            bioxInvGetProductCode(product) || ""
          ).trim()
        : "";

    const searchText = [
      row.searchText || "",
      productCode
    ]
      .filter(Boolean)
      .join(" ");

    return {
      ...row,
      productCode,
      codigoProducto: productCode,
      searchText
    };
  });

  /*
   * Calcular el valor total del inventario.
   */
  const totalValue = rows.reduce(
    (sum, row) => {
      const stock =
        bioxInvNumberOrZero(row.stockUnits);

      const price =
        bioxInvNumberOrZero(row.price);

      return sum + stock * price;
    },
    0
  );

  /*
   * Identificar productos con stock bajo
   * o que requieren reposición.
   */
  const lowStock = rows.filter(
    row =>
      bioxInvNumberOrZero(row.stockUnits) <=
        bioxInvLOW_STOCK_THRESHOLD ||
      bioxInvNumberOrZero(
        row.suggestedPurchaseUnits
      ) > 0
  );

  /*
   * Actualizar tarjetas.
   */
  const totalProductsCard =
    bioxInvGetInventoryTotalProductsCard();

  const totalValueCard =
    bioxInvGetInventoryTotalValueCard();

  const lowStockCard =
    bioxInvGetInventoryLowStockCard();

  if (totalProductsCard) {
    totalProductsCard.textContent =
      String(rows.length);
  }

  if (totalValueCard) {
    totalValueCard.textContent =
      bioxInvCurrency(totalValue);
  }

  if (lowStockCard) {
    lowStockCard.textContent =
      String(lowStock.length);
  }

  /*
   * Actualizar panel de stock bajo.
   */
  bioxInvRenderLowStockPanel(lowStock);

  /*
   * Actualizar DataTables.
   */
  const dt =
    bioxInvViewEnsureInventoryDataTable();

  if (
    dt &&
    typeof dt.clear === "function" &&
    dt.rows &&
    typeof dt.rows.add === "function"
  ) {
    const searchInput =
      bioxInvGetInventorySearchInput();

    const searchValue = searchInput
      ? String(searchInput.value || "").trim()
      : "";

    dt.clear();

    if (rows.length > 0) {
      dt.rows.add(rows);
    }

    dt.search(searchValue).draw(false);

    return rows.length;
  }

  /*
   * Renderizado alternativo si DataTables no está disponible.
   */
  bioxInvRenderInventoryFallback(rows);

  return rows.length;
}


/*
 * ============================================================
 * RENDERIZADO ALTERNATIVO SIN DATATABLES
 * ============================================================
 */

function bioxInvRenderInventoryFallback(rows) {
  const inventoryTbody =
    bioxInvGetInventoryTableBody();

  if (!inventoryTbody) {
    return;
  }

  inventoryTbody.innerHTML = "";

  if (!rows.length) {
    inventoryTbody.innerHTML = `
      <tr>
        <td colspan="12">
          No hay productos registrados.
        </td>
      </tr>
    `;

    return;
  }

  rows.forEach(row => {
    const tr =
      document.createElement("tr");

    const productCode = String(
      row.productCode ??
      row.codigoProducto ??
      ""
    ).trim();

    tr.innerHTML = `
      <td>
        ${bioxInvEscapeHtml(row.name || "")}
      </td>

      <td>
        ${
          productCode
            ? bioxInvEscapeHtml(productCode)
            : "—"
        }
      </td>

      <td>
        ${bioxInvEscapeHtml(
          row.providerName || "Sin proveedor"
        )}
      </td>

      <td>
        ${bioxInvRenderStockDisplay(row)}
      </td>

      <td>
        ${bioxInvCurrency(row.price)}
      </td>

      <td>
        ${bioxInvFormatQuantity(row.soldMonthUnits)}
      </td>

      <td>
        ${bioxInvFormatQuantity(row.soldMonthBoxes)}
      </td>

      <td>
        ${bioxInvCurrency(row.costPerUnit)}
      </td>

      <td>
        ${bioxInvFormatQuantity(row.suggestedPurchaseUnits)}
      </td>

      <td>
        ${bioxInvFormatQuantity(row.suggestedPurchaseBoxes)}
      </td>

      <td>
        ${bioxInvRenderStatusChip(row.status)}
      </td>

      <td>
        ${bioxInvRenderActions(row)}
      </td>
    `;

    inventoryTbody.appendChild(tr);
  });
}


/*
 * ============================================================
 * PANEL DE STOCK BAJO
 * ============================================================
 */

function bioxInvRenderLowStockPanel(list = []) {
  const lowStockPanel =
    bioxInvGetLowStockPanel();

  if (!lowStockPanel) {
    return;
  }

  const products = Array.isArray(list)
    ? list
    : [];

  if (!products.length) {
    lowStockPanel.classList.add(
      "inventory-is-hidden"
    );

    lowStockPanel.innerHTML = "";

    return;
  }

  lowStockPanel.classList.remove(
    "inventory-is-hidden"
  );

  lowStockPanel.innerHTML = "";

  products.forEach(product => {
    const item =
      document.createElement("div");

    item.className = "low-stock-item";

    item.innerHTML = `
      <div>
        <strong>
          ${bioxInvEscapeHtml(
            product.name || "Producto"
          )}
        </strong>

        <div class="small">
          Proveedores:
          ${bioxInvEscapeHtml(
            product.providerName || "Sin proveedor"
          )}
        </div>
      </div>

      <div>
        Stock:
        <strong>
          ${bioxInvFormatQuantity(product.stockUnits)}
        </strong>

        |

        Vendido:
        <strong>
          ${bioxInvFormatQuantity(product.soldMonthUnits)}
        </strong>

        |

        Sugerido:
        <strong>
          ${bioxInvFormatQuantity(
            product.suggestedPurchaseUnits
          )}
        </strong>
      </div>
    `;

    lowStockPanel.appendChild(item);
  });
}


/*
 * ============================================================
 * COMBOBOX DE PRODUCTOS
 * ============================================================
 */

function bioxInvBuildProductCombobox(
  rowId,
  value = ""
) {
  return `
    <input
      id="batch-product-${bioxInvEscapeHtml(rowId)}"
      class="batch-product-input inv-combobox"
      type="text"
      list="batch-product-list-${bioxInvEscapeHtml(rowId)}"
      value="${bioxInvEscapeHtml(value)}"
      placeholder="Producto existente o nombre nuevo"
      autocomplete="off"
    >

    <datalist
      id="batch-product-list-${bioxInvEscapeHtml(rowId)}"
    >
      ${bioxInvGetProductComboOptionsHtml()}
    </datalist>
  `;
}


function bioxInvRefreshProductComboboxDatalist(
  rowElement
) {
  const input =
    rowElement.querySelector(
      ".batch-product-input"
    );

  if (!input) {
    return;
  }

  const listId =
    input.getAttribute("list");

  if (!listId) {
    return;
  }

  const list =
    document.getElementById(listId);

  if (!list) {
    return;
  }

  list.innerHTML =
    bioxInvGetProductComboOptionsHtml();
}


function bioxInvGetProductComboOptionsHtml() {
  return bioxInvCurrentProductsList
    .map(product => {
      const name = String(
        product.name || ""
      ).trim();

      const code =
        bioxInvGetProductCode(product);

      const providers =
        bioxInvGetProductProvidersDisplay(product);

      const display = [
        name,
        code,
        providers
      ]
        .filter(Boolean)
        .join(" — ");

      return `
        <option
          value="${bioxInvEscapeHtml(name)}"
          label="${bioxInvEscapeHtml(display)}"
        ></option>
      `;
    })
    .join("");
}


function bioxInvGetProductFilterOptionsHtml() {
  return bioxInvCurrentProductsList
    .map(product => {
      const name = String(
        product.name || ""
      ).trim();

      const code =
        bioxInvGetProductCode(product);

      const providers =
        bioxInvGetProductProvidersDisplay(product);

      const display = [
        name,
        code,
        providers
      ]
        .filter(Boolean)
        .join(" — ");

      return `
        <option
          value="${bioxInvEscapeHtml(name)}"
          label="${bioxInvEscapeHtml(display)}"
        ></option>
      `;
    })
    .join("");
}


/*
 * ============================================================
 * PROVEEDORES DE LÍNEAS DE ENTRADA
 * ============================================================
 */

function bioxInvGetBatchLineProviderOptions(line) {
  const productProviders =
    bioxInvGetProductProviders(line?.product);

  const lineProviders =
    bioxInvGetLineProviders(line);

  return bioxInvMergeProviderCollections(
    bioxInvCurrentProvidersList,
    productProviders,
    lineProviders
  );
}


/*
 * ============================================================
 * CONSTRUCCIÓN DE LÍNEAS DE ENTRADA MÚLTIPLE
 * ============================================================
 */

function bioxInvBuildBatchLineHtml(line) {
  const isExisting =
    line.mode === "existing";

  const availableProviders =
    bioxInvGetBatchLineProviderOptions(line);

  const selectedProviderIds =
    bioxInvGetProviderIds(line.proveedores);

  const lineElement =
    document.createElement("div");

  lineElement.className =
    "batch-product-row";

  lineElement.dataset.lineId =
    line.id;

  lineElement.innerHTML = `
    <div class="batch-row-header">
      <div>
        <strong>
          Producto
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
      >
        <i class="fas fa-times"></i>
        Quitar
      </button>
    </div>

    <div class="batch-grid">
      <div class="inv-field">
        <label>Tipo</label>

        <select class="batch-mode">
          <option
            value="existing"
            ${isExisting ? "selected" : ""}
          >
            Existente
          </option>

          <option
            value="new"
            ${!isExisting ? "selected" : ""}
          >
            Nuevo
          </option>
        </select>
      </div>

      <div class="inv-field batch-product-field">
        <label>Producto</label>

        <div class="batch-product-combobox">
          ${bioxInvBuildProductCombobox(
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
        <label>Código</label>

        <input
          type="text"
          class="batch-code"
          value="${bioxInvEscapeHtml(line.codigoProducto)}"
          placeholder="Código"
        >
      </div>

      <div class="inv-field batch-provider-field">
        <label>Proveedores</label>

        <div
          id="batch-provider-selector-container-${bioxInvEscapeHtml(line.id)}"
        >
          ${bioxInvBuildProviderMultiSelectHtml(
            `batch-provider-selector-${line.id}`,
            availableProviders,
            selectedProviderIds
          )}
        </div>

        <small>
          Todos los proveedores del local están disponibles.
          Puedes seleccionar uno o varios.
        </small>
      </div>

      <div class="inv-field">
        <label>Cajas</label>

        <input
          type="number"
          class="batch-boxes"
          min="0"
          step="any"
          inputmode="decimal"
          value="${bioxInvFormatQuantity(line.boxes)}"
        >
      </div>

      <div class="inv-field bonus-field">
        <label>Cajas bono</label>

        <input
          type="number"
          class="batch-bonus-boxes"
          min="0"
          step="any"
          inputmode="decimal"
          value="${bioxInvFormatQuantity(line.bonusBoxes)}"
        >
      </div>

      <div class="inv-field">
        <label>Unidades</label>

        <input
          type="number"
          class="batch-units"
          min="0"
          step="any"
          inputmode="decimal"
          value="${bioxInvFormatQuantity(line.units)}"
        >
      </div>

      <div class="inv-field bonus-field">
        <label>Unidades bono</label>

        <input
          type="number"
          class="batch-bonus-units"
          min="0"
          step="any"
          inputmode="decimal"
          value="${bioxInvFormatQuantity(line.bonusUnits)}"
        >
      </div>

      <div class="inv-field">
        <label>Unidades por caja</label>

        <input
          type="number"
          class="batch-units-per-box"
          min="0.000001"
          step="any"
          inputmode="decimal"
          value="${bioxInvFormatQuantity(line.unitsPerBox)}"
        >

        <small>
          Editable para productos nuevos y existentes.
        </small>
      </div>

      <div class="inv-field">
        <label>Costo por caja</label>

        <input
          type="number"
          class="batch-cost-box"
          min="0"
          step="0.01"
          inputmode="decimal"
          value="${line.lastCostPerBox}"
        >
      </div>

      <div class="inv-field">
        <label>Costo por unidad</label>

        <input
          type="text"
          class="batch-cost-unit"
          value="${line.lastCostPerUnit.toFixed(4)}"
          readonly
        >
      </div>

      <div class="inv-field">
        <label>Precio</label>

        <input
          type="number"
          class="batch-price"
          min="0"
          step="0.01"
          inputmode="decimal"
          value="${line.price}"
        >
      </div>

      <div class="inv-field">
        <label>Referencia libro</label>

        <input
          type="text"
          class="batch-reference"
          value="${bioxInvEscapeHtml(line.referenciaLibro)}"
          placeholder="Compra / Inventario"
        >
      </div>

      <div class="inv-field">
        <label>Documento</label>

        <input
          type="text"
          class="batch-document"
          value="${bioxInvEscapeHtml(line.numeroDocumento)}"
          placeholder="Factura / documento"
        >
      </div>
    </div>

    <div class="batch-row-summary">
      <span>
        Stock agregado:
        <strong data-role="total">0</strong>
        unidades
      </span>

      <span>
        Cajas totales:
        <strong data-role="total-boxes">0</strong>
      </span>

      <span>
        Normales:
        <strong data-role="normal-units">0</strong>
      </span>

      <span>
        Bonificadas:
        <strong data-role="bonus-units">0</strong>
      </span>
    </div>
  `;

  bioxInvBindBatchLineEvents(lineElement);

  bioxInvUpdateBatchLineState(lineElement);

  return lineElement;
}


/*
 * ============================================================
 * ACTUALIZACIÓN DEL SELECTOR DE PROVEEDORES
 * ============================================================
 */

function bioxInvRefreshBatchProviderSelector(
  row,
  product,
  currentProviderIds
) {
  const root = row.querySelector(
    '[data-role="provider-selector"]'
  );

  if (!root) {
    return [];
  }

  const currentIds =
    bioxInvNormalizeIdArray(currentProviderIds);

  const productProviders =
    bioxInvGetProductProviders(product);

  const currentSelectedProviders =
    currentIds.map(id =>
      bioxInvGetProviderById(id)
    );

  /*
   * Siempre incluir los proveedores del local,
   * además de los proveedores del producto y
   * los que ya estaban seleccionados.
   */
  const available =
    bioxInvMergeProviderCollections(
      bioxInvCurrentProvidersList,
      productProviders,
      currentSelectedProviders
    );

  const productId = String(
    product?.id || ""
  ).trim();

  const previousProductId = String(
    root.dataset.productId || ""
  ).trim();

  const productChanged =
    productId !== previousProductId;

  let selectedIds = currentIds;

  /*
   * Cuando cambia el producto, cargar inicialmente
   * los proveedores que ya tiene asociados.
   */
  if (productChanged) {
    selectedIds =
      bioxInvGetProviderIds(productProviders);

    root.dataset.productId = productId;
  }

  const availableIds =
    bioxInvGetProviderIds(available);

  selectedIds =
    bioxInvNormalizeIdArray(selectedIds)
      .filter(id => availableIds.includes(id));

  return bioxInvSetProviderSelector(
    root,
    available,
    selectedIds,
    false
  );
}


/*
 * ============================================================
 * EVENTOS DE LÍNEAS DE ENTRADA
 * ============================================================
 */

function bioxInvBindBatchLineEvents(row) {
  const modeElement =
    row.querySelector(".batch-mode");

  const productElement =
    row.querySelector(".batch-product-input");

  const removeButton =
    row.querySelector(".batch-remove-row");

  if (modeElement) {
    modeElement.addEventListener("change", () => {
      const providerRoot =
        row.querySelector(
          '[data-role="provider-selector"]'
        );

      if (providerRoot) {
        delete providerRoot.dataset.productId;
      }

      bioxInvUpdateBatchLineState(row);
    });
  }

  if (productElement) {
    ["input", "change"].forEach(eventName => {
      productElement.addEventListener(
        eventName,
        () => {
          bioxInvUpdateBatchLineState(row);
        }
      );
    });
  }

  row.querySelectorAll("input, select")
    .forEach(input => {
      if (
        input === productElement ||
        input === modeElement ||
        input.classList.contains("provider-multi-search") ||
        input.classList.contains("provider-multi-checkbox")
      ) {
        return;
      }

      input.addEventListener("input", () => {
        bioxInvUpdateBatchLineState(row);
      });

      input.addEventListener("change", () => {
        bioxInvUpdateBatchLineState(row);
      });
    });

  if (removeButton) {
    removeButton.addEventListener("click", () => {
      row.remove();

      bioxInvUpdateBatchLineNumbers();
    });
  }
}


function bioxInvUpdateBatchLineNumbers() {
  document
    .querySelectorAll(".batch-product-row")
    .forEach((row, index) => {
      const title = row.querySelector(
        ".batch-row-header strong"
      );

      if (title) {
        title.textContent =
          `Producto ${index + 1}`;
      }

      bioxInvRefreshProductComboboxDatalist(row);
    });
}


/*
 * ============================================================
 * MODAL DE ENTRADA MÚLTIPLE
 * ============================================================
 */

function bioxInvBuildBatchModalHtml() {
  return `
    <div class="batch-operation-date-box">
      <div class="inv-field">
        <label for="batch-operation-date">
          Fecha de operación
        </label>

        <input
          id="batch-operation-date"
          type="date"
          value="${bioxInvGetLocalDateInputValue()}"
        >

        <small>
          Esta fecha se utilizará para el movimiento
          y para el gasto automático.
        </small>
      </div>

      <div
        class="batch-operation-date-preview"
        id="batch-operation-date-preview"
      >
        Fecha seleccionada:
        <strong>
          ${bioxInvFormatOperationDate(new Date())}
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
      class="btn-primary batch-add-row-button"
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
        El selector muestra todos los proveedores disponibles
        del local y permite seleccionar uno o varios.
      </p>

      <p>
        Los proveedores que ya estén asociados al producto
        aparecerán seleccionados inicialmente.
      </p>

      <p>
        Los proveedores seleccionados en un producto
        existente se agregan a su lista de proveedores asociados.
      </p>

      <p>
        Las cajas bono y unidades bono aumentan
        el stock pero no generan costo.
      </p>

      <p>
        Las cantidades de cajas, unidades y unidades
        por caja admiten valores decimales.
      </p>

      <p>
        El gasto automático solamente considera
        las cantidades pagadas.
      </p>
    </div>
  `;
}


/*
 * ============================================================
 * FORMULARIO DE EDICIÓN DE MOVIMIENTO
 * ============================================================
 */

function bioxInvBuildMovementEditFormHtml(
  movement,
  product
) {
  const operationDate =
    bioxInvGetMovementOperationDateValue(movement);

  const breakdown =
    bioxInvGetMovementBreakdown(
      movement,
      product
    );

  const movementUnitsPerBox = Math.max(
    0.000001,
    bioxInvDecimalOrZero(
      movement.unidadesPorCaja ??
      movement.unitsPerBox
    ) ||
    breakdown.unitsPerBox ||
    1
  );

  let currentCostPerUnit =
    bioxInvNumberOrZero(movement.costoUnitario);

  let currentCostPerBox =
    bioxInvNumberOrZero(movement.costoPorCaja);

  if (
    currentCostPerUnit <= 0 &&
    currentCostPerBox > 0
  ) {
    currentCostPerUnit =
      currentCostPerBox / movementUnitsPerBox;
  }

  if (
    currentCostPerBox <= 0 &&
    currentCostPerUnit > 0
  ) {
    currentCostPerBox =
      currentCostPerUnit * movementUnitsPerBox;
  }

  if (
    currentCostPerUnit <= 0 &&
    currentCostPerBox <= 0
  ) {
    currentCostPerUnit =
      bioxInvGetCostPerUnit(product);

    currentCostPerBox =
      currentCostPerUnit * movementUnitsPerBox;
  }

  const currentSalePrice =
    bioxInvNumberOrZero(movement.precioVenta) ||
    bioxInvNumberOrZero(product?.price);

  const movementProviders =
    bioxInvNormalizeMovementProviders(movement);

  const availableProviders =
    bioxInvMergeProviderCollections(
      bioxInvCurrentProvidersList,
      bioxInvGetProductProviders(product),
      movementProviders
    );

  return `
    <div class="movement-edit-form">
      <div class="movement-edit-header">
        <div>
          <strong>
            ${bioxInvEscapeHtml(
              product?.name ||
              movement.productName ||
              "Producto"
            )}
          </strong>

          <span>
            Stock actual:
            <strong>
              ${bioxInvFormatQuantity(
                bioxInvGetCurrentStockUnits(product)
              )}
            </strong>
          </span>

          <span>
            Proveedores de esta entrada:
            <strong>
              ${bioxInvEscapeHtml(
                movement.providerDisplay ||
                bioxInvGetLineProvidersDisplay(movement)
              )}
            </strong>
          </span>
        </div>
      </div>

      <div class="movement-edit-grid">
        <div class="inv-field">
          <label>Fecha de operación</label>

          <input
            id="movement-edit-date"
            type="date"
            value="${bioxInvEscapeHtml(operationDate)}"
          >
        </div>

        <div class="inv-field movement-edit-provider-field">
          <label>
            Proveedores de esta entrada
          </label>

          <div id="movement-edit-provider-selector">
            ${bioxInvBuildProviderMultiSelectHtml(
              "movement-edit-provider-selector",
              availableProviders,
              bioxInvGetProviderIds(movementProviders)
            )}
          </div>

          <small>
            Todos los proveedores disponibles del local
            pueden seleccionarse.
          </small>
        </div>

        <div class="inv-field">
          <label>Unidades por caja</label>

          <input
            id="movement-edit-units-per-box"
            type="number"
            min="0.000001"
            step="any"
            inputmode="decimal"
            value="${bioxInvFormatQuantity(movementUnitsPerBox)}"
          >
        </div>

        <div class="inv-field">
          <label>Cajas</label>

          <input
            id="movement-edit-boxes"
            type="number"
            min="0"
            step="any"
            inputmode="decimal"
            value="${bioxInvFormatQuantity(breakdown.cajas)}"
          >
        </div>

        <div class="inv-field bonus-field">
          <label>Cajas bono</label>

          <input
            id="movement-edit-bonus-boxes"
            type="number"
            min="0"
            step="any"
            inputmode="decimal"
            value="${bioxInvFormatQuantity(breakdown.cajasBono)}"
          >
        </div>

        <div class="inv-field">
          <label>Unidades sueltas</label>

          <input
            id="movement-edit-units"
            type="number"
            min="0"
            step="any"
            inputmode="decimal"
            value="${bioxInvFormatQuantity(breakdown.unidades)}"
          >
        </div>

        <div class="inv-field bonus-field">
          <label>Unidades bono</label>

          <input
            id="movement-edit-bonus-units"
            type="number"
            min="0"
            step="any"
            inputmode="decimal"
            value="${bioxInvFormatQuantity(breakdown.unidadesBono)}"
          >
        </div>

        <div class="inv-field">
          <label>Costo por caja</label>

          <input
            id="movement-edit-cost-box"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            value="${currentCostPerBox.toFixed(2)}"
          >
        </div>

        <div class="inv-field">
          <label>Costo por unidad</label>

          <input
            id="movement-edit-cost-unit"
            type="number"
            min="0"
            step="any"
            inputmode="decimal"
            value="${currentCostPerUnit.toFixed(4)}"
          >
        </div>

        <div class="inv-field">
          <label>Precio de venta</label>

          <input
            id="movement-edit-sale-price"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            value="${currentSalePrice.toFixed(2)}"
          >
        </div>

        <div class="inv-field">
          <label>Entrada total</label>

          <input
            id="movement-edit-entry"
            type="text"
            value="${bioxInvFormatQuantity(breakdown.totalUnits)}"
            readonly
          >
        </div>

        <div class="inv-field movement-edit-full">
          <label>Código de producto</label>

          <input
            id="movement-edit-product-code"
            type="text"
            maxlength="100"
            value="${bioxInvEscapeHtml(
              movement.codigoProducto ||
              movement.productCode ||
              bioxInvGetProductCode(product)
            )}"
          >
        </div>

        <div class="inv-field movement-edit-full">
          <label>Referencia de libro</label>

          <input
            id="movement-edit-reference"
            type="text"
            value="${bioxInvEscapeHtml(
              movement.referenciaLibro || ""
            )}"
          >
        </div>

        <div class="inv-field movement-edit-full">
          <label>Documento</label>

          <input
            id="movement-edit-document"
            type="text"
            value="${bioxInvEscapeHtml(
              movement.numeroDocumento || ""
            )}"
          >
        </div>
      </div>

      <div
        id="movement-edit-preview"
        class="movement-edit-preview"
      ></div>

      <div class="movement-edit-warning">
        <strong>Importante:</strong>

        Puedes asignar uno o varios proveedores
        específicamente a esta entrada.

        <br><br>

        Los proveedores seleccionados no modifican
        el costo calculado de la entrada.

        <br><br>

        Al guardar, los proveedores seleccionados
        también quedarán asociados al producto para
        futuras entradas.

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
            <div class="movement-edit-linked">
              <i class="fas fa-link"></i>

              Esta entrada está vinculada a un gasto.
              El gasto se ajustará considerando solamente
              las cantidades pagadas.
            </div>
          `
          : `
            <div class="movement-edit-warning">
              <i class="fas fa-info-circle"></i>

              Esta entrada no tiene un gasto vinculado.
            </div>
          `
      }
    </div>
  `;
}


/*
 * ============================================================
 * VISTA PREVIA DE EDICIÓN DE MOVIMIENTO
 * ============================================================
 */

function bioxInvUpdateMovementEditPreview(
  product,
  movement
) {
  const boxesInput =
    document.getElementById("movement-edit-boxes");

  const bonusBoxesInput =
    document.getElementById("movement-edit-bonus-boxes");

  const unitsInput =
    document.getElementById("movement-edit-units");

  const bonusUnitsInput =
    document.getElementById("movement-edit-bonus-units");

  const unitsPerBoxInput =
    document.getElementById("movement-edit-units-per-box");

  const costBoxInput =
    document.getElementById("movement-edit-cost-box");

  const costUnitInput =
    document.getElementById("movement-edit-cost-unit");

  const salePriceInput =
    document.getElementById("movement-edit-sale-price");

  const entryInput =
    document.getElementById("movement-edit-entry");

  const preview =
    document.getElementById("movement-edit-preview");

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
    bioxInvGetMovementBreakdown(
      movement,
      product
    );

  const oldUnitsPerBox = Math.max(
    0.000001,
    bioxInvDecimalOrZero(
      movement.unidadesPorCaja ??
      movement.unitsPerBox
    ) ||
    oldBreakdown.unitsPerBox ||
    1
  );

  const newUnitsPerBox = Math.max(
    0.000001,
    bioxInvDecimalOrZero(unitsPerBoxInput.value) ||
    oldUnitsPerBox
  );

  const cajas =
    bioxInvDecimalOrZero(boxesInput.value);

  const cajasBono =
    bioxInvDecimalOrZero(bonusBoxesInput.value);

  const unidades =
    bioxInvDecimalOrZero(unitsInput.value);

  const unidadesBono =
    bioxInvDecimalOrZero(bonusUnitsInput.value);

  const paidUnits =
    bioxInvDecimalOrZero(
      cajas * newUnitsPerBox + unidades
    );

  const bonusUnits =
    bioxInvDecimalOrZero(
      cajasBono * newUnitsPerBox + unidadesBono
    );

  const newEntry =
    bioxInvDecimalOrZero(
      paidUnits + bonusUnits
    );

  const oldEntry =
    bioxInvDecimalOrZero(
      oldBreakdown.cajas * oldUnitsPerBox +
      oldBreakdown.unidades +
      oldBreakdown.cajasBono * oldUnitsPerBox +
      oldBreakdown.unidadesBono
    );

  const difference =
    bioxInvDecimalOrZero(
      newEntry - oldEntry
    );

  const currentStock =
    bioxInvGetCurrentStockUnits(product);

  const resultingStock =
    bioxInvDecimalOrZero(
      currentStock + difference
    );

  const costPerBox = Math.max(
    0,
    bioxInvNumberOrZero(costBoxInput.value)
  );

  const costPerUnit =
    newUnitsPerBox > 0
      ? costPerBox / newUnitsPerBox
      : 0;

  const purchaseCost =
    paidUnits * costPerUnit;

  if (costUnitInput) {
    costUnitInput.value =
      costPerUnit.toFixed(4);
  }

  if (entryInput) {
    entryInput.value =
      bioxInvFormatQuantity(newEntry);
  }

  const salePrice = Math.max(
    0,
    bioxInvNumberOrZero(salePriceInput?.value)
  );

  preview.innerHTML = `
    <div>
      Entrada anterior
      <strong>
        ${bioxInvFormatQuantity(oldEntry)}
      </strong>
    </div>

    <div>
      Entrada pagada
      <strong>
        ${bioxInvFormatQuantity(paidUnits)}
      </strong>
    </div>

    <div>
      Entrada bono
      <strong>
        ${bioxInvFormatQuantity(bonusUnits)}
      </strong>
    </div>

    <div>
      Nueva entrada
      <strong>
        ${bioxInvFormatQuantity(newEntry)}
      </strong>
    </div>

    <div>
      Diferencia
      <strong>
        ${difference > 0 ? "+" : ""}
        ${bioxInvFormatQuantity(difference)}
      </strong>
    </div>

    <div>
      Stock actual
      <strong>
        ${bioxInvFormatQuantity(currentStock)}
      </strong>
    </div>

    <div>
      Stock resultante
      <strong>
        ${bioxInvFormatQuantity(resultingStock)}
      </strong>
    </div>

    <div>
      Costo por caja
      <strong>
        ${bioxInvCurrency(costPerBox)}
      </strong>
    </div>

    <div>
      Costo por unidad
      <strong>
        ${bioxInvCurrency(costPerUnit)}
      </strong>
    </div>

    <div>
      Precio de venta
      <strong>
        ${bioxInvCurrency(salePrice)}
      </strong>
    </div>

    <div>
      Costo de entrada
      <strong>
        ${bioxInvCurrency(purchaseCost)}
      </strong>
    </div>
  `;
}


/*
 * ============================================================
 * ADMINISTRADOR DE MOVIMIENTOS
 * ============================================================
 */

function bioxInvBuildMovementManagerHtml(
  productId,
  movements
) {
  const product = productId
    ? bioxInvFindProductById(productId)
    : null;

  return `
    <div
      class="movement-manager"
      id="movement-manager"
      data-product-id="${bioxInvEscapeHtml(productId || "")}"
    >
      <div class="movement-manager-title">
        <div>
          <strong>
            ${
              product
                ? `Entradas de ${bioxInvEscapeHtml(product.name)}`
                : "Entradas de inventario"
            }
          </strong>

          <small>
            ${
              product
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
          ${movements.length === 1 ? "entrada" : "entradas"}
        </div>
      </div>

      ${
        product
          ? `
            <div class="movement-current-stock-summary">
              <span>
                Stock actual:
                <strong>
                  ${bioxInvFormatQuantity(
                    bioxInvGetCurrentStockUnits(product)
                  )}
                </strong>
                unidades
              </span>

              <span>
                Unidades/caja:
                <strong>
                  ${bioxInvFormatQuantity(
                    bioxInvGetUnitsPerBox(product)
                  )}
                </strong>
              </span>

              <span>
                Cajas actuales:
                <strong>
                  ${bioxInvFormatQuantity(
                    bioxInvGetStockBoxes(product)
                  )}
                </strong>
              </span>

              <span>
                Proveedores:
                <strong>
                  ${bioxInvEscapeHtml(
                    bioxInvGetProductProvidersDisplay(product)
                  )}
                </strong>
              </span>
            </div>
          `
          : ""
      }

      <div class="movement-filters">
        <div class="inv-field">
          <label>Fecha desde</label>

          <input
            id="movement-filter-from"
            type="date"
          >
        </div>

        <div class="inv-field">
          <label>Fecha hasta</label>

          <input
            id="movement-filter-to"
            type="date"
          >
        </div>

        ${
          product
            ? ""
            : `
              <div class="inv-field">
                <label>Producto / Proveedor</label>

                <input
                  id="movement-filter-product"
                  type="text"
                  list="movement-filter-product-list"
                  placeholder="Nombre, código, proveedor o razón social..."
                  autocomplete="off"
                >

                <datalist id="movement-filter-product-list">
                  ${bioxInvGetProductFilterOptionsHtml()}
                </datalist>
              </div>
            `
        }

        <div class="movement-filter-actions">
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
        ${bioxInvRenderMovementTableHtml(movements)}
      </div>
    </div>
  `;
}


/*
 * ============================================================
 * TABLA DE MOVIMIENTOS
 * ============================================================
 */

function bioxInvRenderMovementTableHtml(movements) {
  if (!movements.length) {
    return `
      <div class="movement-empty">
        <i class="fas fa-box-open"></i>

        <strong>
          No hay entradas
        </strong>

        <span>
          No se encontraron movimientos de tipo entrada.
        </span>
      </div>
    `;
  }

  return `
    <div class="movement-table-scroll">
      <table class="movement-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Producto</th>
            <th>Proveedores</th>
            <th>Entrada</th>
            <th>Costo por unidad</th>
            <th>Costo por caja</th>
            <th>Costo total</th>
            <th>Precio venta</th>
            <th>Referencia</th>
            <th>Documento</th>
            <th>Saldo</th>
            <th>Acción</th>
          </tr>
        </thead>

        <tbody>
          ${
            movements.map(movement => {
              const hasConversionReference =
                Boolean(
                  String(movement.conversionId || "").trim()
                ) ||
                Boolean(
                  String(movement.conversionType || "").trim()
                );

              const deleteDisabled =
                !bioxInvCanDeleteInventoryMovement() ||
                hasConversionReference;

              const deleteTitle =
                hasConversionReference
                  ? "Entrada generada por conversión"
                  : !bioxInvCanDeleteInventoryMovement()
                    ? "Solo administrador"
                    : "Eliminar entrada";

              return `
                <tr>
                  <td>
                    ${bioxInvEscapeHtml(
                      bioxInvGetMovementOperationDateValue(movement) || "—"
                    )}
                  </td>

                  <td>
                    <strong>
                      ${bioxInvEscapeHtml(
                        movement.productCurrentName ||
                        movement.productName ||
                        "Producto"
                      )}
                    </strong>

                    ${
                      movement.codigoProducto
                        ? `
                          <small>
                            Código:
                            ${bioxInvEscapeHtml(
                              movement.codigoProducto
                            )}
                          </small>
                        `
                        : ""
                    }
                  </td>

                  <td>
                    <strong>
                      ${bioxInvEscapeHtml(
                        movement.providerDisplay ||
                        "Sin proveedor"
                      )}
                    </strong>

                    ${
                      movement.proveedorRazonSocial
                        ? `
                          <small>
                            ${bioxInvEscapeHtml(
                              movement.proveedorRazonSocial
                            )}
                          </small>
                        `
                        : ""
                    }
                  </td>

                  <td>
                    <strong>
                      ${bioxInvFormatQuantity(movement.cajas)}
                    </strong>

                    ${
                      bioxInvDecimalOrZero(movement.cajas) === 1
                        ? "caja"
                        : "cajas"
                    }

                    ×

                    <strong>
                      ${bioxInvFormatQuantity(
                        movement.unidadesPorCaja
                      )}
                    </strong>

                    <small>
                      ${bioxInvFormatQuantity(movement.unidades)}
                      unidades sueltas
                    </small>

                    ${
                      bioxInvDecimalOrZero(movement.cajasBono) > 0
                        ? `
                          <small>
                            +
                            ${bioxInvFormatQuantity(
                              movement.cajasBono
                            )}
                            cajas bono
                          </small>
                        `
                        : ""
                    }

                    ${
                      bioxInvDecimalOrZero(movement.unidadesBono) > 0
                        ? `
                          <small>
                            +
                            ${bioxInvFormatQuantity(
                              movement.unidadesBono
                            )}
                            unidades bono
                          </small>
                        `
                        : ""
                    }

                    <small>
                      Total:
                      <strong>
                        ${bioxInvFormatQuantity(
                          movement.entrada
                        )}
                      </strong>
                      unidades
                    </small>
                  </td>

                  <td>
                    ${bioxInvCurrency(movement.costoUnitario)}
                  </td>

                  <td>
                    ${bioxInvCurrency(movement.costoPorCaja)}
                  </td>

                  <td>
                    <strong>
                      ${bioxInvCurrency(movement.costoTotal)}
                    </strong>
                  </td>

                  <td>
                    ${bioxInvCurrency(movement.precioVenta)}
                  </td>

                  <td>
                    ${bioxInvEscapeHtml(
                      movement.referenciaLibro || "—"
                    )}
                  </td>

                  <td>
                    ${bioxInvEscapeHtml(
                      movement.numeroDocumento || "—"
                    )}
                  </td>

                  <td>
                    ${bioxInvFormatQuantity(
                      movement.saldoActual
                    )}
                  </td>

                  <td>
                    <div class="movement-action-group">
                      <button
                        type="button"
                        class="btn-outline movement-edit-button"
                        data-movement-id="${bioxInvEscapeHtml(movement.id)}"
                      >
                        <i class="fas fa-edit"></i>
                        Editar
                      </button>

                      <button
                        type="button"
                        class="btn-outline movement-delete-button"
                        data-movement-id="${bioxInvEscapeHtml(movement.id)}"
                        ${
                          deleteDisabled
                            ? `disabled title="${bioxInvEscapeHtml(deleteTitle)}"`
                            : `title="${bioxInvEscapeHtml(deleteTitle)}"`
                        }
                      >
                        <i class="fas fa-trash"></i>
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")
          }
        </tbody>
      </table>
    </div>
  `;
}


/*
 * ============================================================
 * EVENTOS DE EDICIÓN DE MOVIMIENTOS
 * ============================================================
 */

function bioxInvBindMovementEditButtons() {
  document
    .querySelectorAll(".movement-edit-button")
    .forEach(button => {
      if (button.dataset.bound === "1") {
        return;
      }

      button.dataset.bound = "1";

      button.addEventListener("click", async () => {
        const movementId = String(
          button.dataset.movementId || ""
        ).trim();

        if (!movementId) {
          return;
        }

        const movement =
          await bioxInvFindMovementById(movementId);

        if (!movement) {
          await Swal.fire(
            "Movimiento no encontrado",
            "El movimiento ya no está disponible.",
            "warning"
          );

          return;
        }

        await bioxInvOpenEditMovementModal(movement);
      });
    });
}


function bioxInvBindMovementDeleteButtons() {
  document
    .querySelectorAll(".movement-delete-button")
    .forEach(button => {
      if (button.dataset.bound === "1") {
        return;
      }

      button.dataset.bound = "1";

      button.addEventListener("click", async () => {
        if (button.disabled) {
          return;
        }

        const movementId = String(
          button.dataset.movementId || ""
        ).trim();

        if (!movementId) {
          return;
        }

        await bioxInvConfirmDeleteEntryMovement(
          movementId
        );
      });
    });
}


function bioxInvBindMovementActionButtons() {
  bioxInvBindMovementEditButtons();
  bioxInvBindMovementDeleteButtons();
}


/*
 * ============================================================
 * BOTÓN DE CONVERSIONES
 * ============================================================
 */

function bioxInvEnsureConversionButton() {
  const existing =
    document.getElementById("btnConversions");

  if (existing) {
    existing.classList.toggle(
      "inventory-is-hidden",
      !(
        bioxInvCanEditInventory &&
        bioxInvCurrentLocalId
      )
    );

    return existing;
  }

  const btnAdd =
    bioxInvGetInventoryAddButton();

  if (
    !btnAdd ||
    !bioxInvCanEditInventory ||
    !bioxInvCurrentLocalId
  ) {
    return null;
  }

  const button =
    document.createElement("button");

  button.id = "btnConversions";
  button.type = "button";

  button.className =
    "btn-outline inventory-toolbar-action";

  button.innerHTML = `
    <i class="fas fa-arrows-alt-h"></i>
    Convertir productos
  `;

  button.addEventListener("click", async () => {
    try {
      const module =
        await bioxInvEnsureConversionModuleLoaded();

      if (
        typeof module.openConversionModal !== "function"
      ) {
        throw new Error(
          "El módulo de conversiones no expone openConversionModal()."
        );
      }

      await module.openConversionModal();

    } catch (error) {
      console.error(
        "Error abriendo conversiones:",
        error
      );

      await Swal.fire(
        "Error",
        error.message ||
          "No se pudo abrir el módulo de conversiones.",
        "error"
      );
    }
  });

  btnAdd.parentNode?.insertBefore(
    button,
    btnAdd.nextSibling
  );

  return button;
}


/*
 * ============================================================
 * BOTÓN DE MOVIMIENTOS GLOBALES
 * ============================================================
 */

function bioxInvEnsureGlobalMovementsButton() {
  const existing =
    document.getElementById("btnMovements");

  if (existing) {
    existing.classList.toggle(
      "inventory-is-hidden",
      !(
        bioxInvCanEditInventory &&
        bioxInvCurrentLocalId
      )
    );

    return existing;
  }

  const btnAdd =
    bioxInvGetInventoryAddButton();

  if (
    !btnAdd ||
    !bioxInvCanEditInventory ||
    !bioxInvCurrentLocalId
  ) {
    return null;
  }

  const button =
    document.createElement("button");

  button.id = "btnMovements";
  button.type = "button";

  button.className =
    "btn-outline inventory-toolbar-action";

  button.innerHTML = `
    <i class="fas fa-history"></i>
    Movimientos de entrada
  `;

  button.addEventListener("click", () => {
    bioxInvOpenMovementManagerModal("");
  });

  btnAdd.parentNode?.insertBefore(
    button,
    btnAdd.nextSibling
  );

  return button;
}


/*
 * ============================================================
 * UTILIDADES AUXILIARES MVC
 * Integradas desde assets/js/views/inventory.view.js
 * ============================================================
 */

const bioxInvInventoryViewSelectors = Object.freeze({
  tableBody: "#inventoryTable tbody",
  lowStockPanel: "#lowStockPanel",
  searchInput: "#salesSearch",
  addButton: "#btnAdd",
  greetings: ".userGreeting"
});


function bioxInvViewQs(
  selector,
  root = document
) {
  if (
    !root ||
    typeof root.querySelector !== "function"
  ) {
    return null;
  }

  return root.querySelector(selector);
}


function bioxInvViewQsa(
  selector,
  root = document
) {
  if (
    !root ||
    typeof root.querySelectorAll !== "function"
  ) {
    return [];
  }

  return Array.from(
    root.querySelectorAll(selector)
  );
}


function bioxInvViewEscapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function bioxInvViewSetText(
  selectorOrElement,
  value = ""
) {
  const element =
    typeof selectorOrElement === "string"
      ? bioxInvViewQs(selectorOrElement)
      : selectorOrElement;

  if (element) {
    element.textContent = value;
  }
}


function bioxInvViewSetHtml(
  selectorOrElement,
  html = ""
) {
  const element =
    typeof selectorOrElement === "string"
      ? bioxInvViewQs(selectorOrElement)
      : selectorOrElement;

  if (element) {
    element.innerHTML = html;
  }
}


function bioxInvViewGetElements() {
  return {
    tableBody:
      bioxInvGetInventoryTableBody(),

    lowStockPanel:
      bioxInvGetLowStockPanel(),

    searchInput:
      bioxInvGetInventorySearchInput(),

    addButton:
      bioxInvGetInventoryAddButton(),

    greetings:
      bioxInvGetInventoryGreetingElements()
  };
}


/*
 * ============================================================
 * REGISTRO ÚNICO DE LA VISTA EN MVC
 * ============================================================
 */

function bioxInvRegisterInventoryView() {
  const previousMVC =
    window.InventoryMVC &&
    typeof window.InventoryMVC === "object"
      ? window.InventoryMVC
      : {};

  const previousViews =
    previousMVC.views &&
    typeof previousMVC.views === "object"
      ? previousMVC.views
      : {};

  const previousInventoryView =
    previousViews.inventory &&
    typeof previousViews.inventory === "object"
      ? previousViews.inventory
      : {};

  /*
   * Todas las funcionalidades de la vista se registran
   * en un único objeto.
   *
   * No se crea un segundo registro independiente.
   */
  const inventoryView = {
    ...previousInventoryView,

    /*
     * Selectores auxiliares.
     */
    selectors:
      bioxInvInventoryViewSelectors,

    /*
     * Consultas DOM.
     */
    qs: function (
      selector,
      root = document
    ) {
      return bioxInvViewQs(
        selector,
        root
      );
    },

    qsa: function (
      selector,
      root = document
    ) {
      return bioxInvViewQsa(
        selector,
        root
      );
    },

    /*
     * Utilidad para escapar HTML.
     */
    escapeHtml: function (value = "") {
      return bioxInvViewEscapeHtml(value);
    },

    /*
     * Actualizar texto de un elemento.
     */
    setText: function (
      selectorOrElement,
      value = ""
    ) {
      return bioxInvViewSetText(
        selectorOrElement,
        value
      );
    },

    /*
     * Actualizar HTML de un elemento.
     */
    setHtml: function (
      selectorOrElement,
      html = ""
    ) {
      return bioxInvViewSetHtml(
        selectorOrElement,
        html
      );
    },

    /*
     * Recuperar elementos principales de la vista.
     */
    getElements: function () {
      return bioxInvViewGetElements();
    },

    /*
     * Renderizado principal.
     */
    render: function () {
      return bioxInvViewRefreshInventoryView();
    },

    /*
     * Actualización de la vista.
     */
    refresh: function () {
      return bioxInvViewRefreshInventoryView();
    },

    /*
     * Inicialización o recuperación de DataTables.
     */
    ensureDataTable: function () {
      return bioxInvViewEnsureInventoryDataTable();
    },

    /*
     * Modal de entrada múltiple.
     */
    buildBatchModalHtml: function () {
      return bioxInvBuildBatchModalHtml();
    },

    /*
     * Panel de productos con stock bajo.
     */
    renderLowStock: function (list = null) {
      if (Array.isArray(list)) {
        bioxInvRenderLowStockPanel(list);
        return;
      }

      const products = Array.isArray(
        bioxInvCurrentProductsList
      )
        ? bioxInvCurrentProductsList
        : [];

      if (
        typeof bioxInvBuildRowData !== "function"
      ) {
        bioxInvRenderLowStockPanel([]);
        return;
      }

      const lowStock = products
        .map(product =>
          bioxInvBuildRowData(product)
        )
        .filter(row =>
          bioxInvNumberOrZero(row.stockUnits) <=
            bioxInvLOW_STOCK_THRESHOLD ||
          bioxInvNumberOrZero(
            row.suggestedPurchaseUnits
          ) > 0
        );

      bioxInvRenderLowStockPanel(lowStock);
    },

    /*
     * La vista no necesita inyectar estilos adicionales.
     */
    injectStyles: function () {
      return true;
    }
  };

  /*
   * Conservar los demás módulos MVC.
   *
   * Se reemplaza únicamente la referencia de la vista
   * inventory, sin sobrescribir el resto del MVC.
   */
  window.InventoryMVC = {
    ...previousMVC,

    views: {
      ...previousViews,

      inventory: inventoryView
    }
  };

  /*
   * Publicar funciones globales necesarias
   * para mantener compatibilidad con el controlador.
   */
  window.bioxInvBuildBatchModalHtml =
    bioxInvBuildBatchModalHtml;

  window.bioxInvViewRefreshInventoryView =
    bioxInvViewRefreshInventoryView;

  window.bioxInvViewEnsureInventoryDataTable =
    bioxInvViewEnsureInventoryDataTable;

  /*
   * Verificar que todos los métodos requeridos
   * estén registrados.
   */
  const registeredView =
    window.InventoryMVC.views.inventory;

  const requiredMethods = [
    "render",
    "refresh",
    "ensureDataTable",
    "buildBatchModalHtml",
    "renderLowStock",
    "injectStyles",
    "qs",
    "qsa",
    "escapeHtml",
    "setText",
    "setHtml",
    "getElements"
  ];

  const missingMethods =
    requiredMethods.filter(method =>
      typeof registeredView[method] !== "function"
    );

  if (missingMethods.length > 0) {
    throw new Error(
      "[Inventario] No se pudieron registrar los métodos de la vista: " +
      missingMethods.join(", ")
    );
  }

  console.info(
    "[Inventario] Vista única MVC registrada correctamente.",
    {
      render:
        typeof registeredView.render,

      refresh:
        typeof registeredView.refresh,

      ensureDataTable:
        typeof registeredView.ensureDataTable,

      buildBatchModalHtml:
        typeof registeredView.buildBatchModalHtml,

      renderLowStock:
        typeof registeredView.renderLowStock,

      injectStyles:
        typeof registeredView.injectStyles,

      qs:
        typeof registeredView.qs,

      qsa:
        typeof registeredView.qsa,

      escapeHtml:
        typeof registeredView.escapeHtml,

      setText:
        typeof registeredView.setText,

      setHtml:
        typeof registeredView.setHtml,

      getElements:
        typeof registeredView.getElements
    }
  );

  return registeredView;
}


/*
 * ============================================================
 * REGISTRO DE LA VISTA
 * ============================================================
 */

bioxInvRegisterInventoryView();