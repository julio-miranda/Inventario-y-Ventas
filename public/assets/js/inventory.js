// assets/js/inventory.js
// Inventario con DataTable.
// Regla corregida:
// stock visible = stock actual guardado en el producto.
// Las ventas del mes se usan solo para métricas, sugerencias y alertas.
// Vendedor: acceso de solo lectura.
// Administrador/Bodega: pueden editar y agregar stock.
// Administrador: puede eliminar.
//
// Filtro por local:
// - Se toma el id_local del usuario autenticado.
// - Se usa la colección local para nombre, documento y ubicación.
// - Productos, ventas y movimientos se filtran por el local actual.

if (typeof firebase === "undefined") {
  console.error("Firebase no se ha cargado correctamente.");
  if (typeof Swal !== "undefined") {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "Firebase no se cargó. Revisa la conexión o los scripts."
    });
  }
}

let currentRole = "";
let canEditInventory = false;

const LOW_STOCK_THRESHOLD = 5;
const SAFETY_STOCK_DEFAULT = 10;

let currentLocalId = "";
let currentLocalInfo = {
  id_local: "",
  nombre: "",
  numeroDocumento: "",
  ubicacion: ""
};

let currentProductsList = [];
let currentMonthlySalesMap = {};
let currentMonthlyBoxesMap = {};

let productsUnsub = null;
let salesUnsub = null;
let inventoryDT = null;

const inventoryTbody = document.querySelector("#inventoryTable tbody");
const lowStockPanel = document.getElementById("lowStockPanel");
const searchInput = document.getElementById("salesSearch");
const btnAdd = document.getElementById("btnAdd");
const btnLogout = document.getElementById("logoutButton");
const btnLogoutMobile = document.getElementById("logoutButtonMobile");
const userGreeting = document.querySelectorAll(".userGreeting");

const totalProductsCard = document.getElementById("totalProductsCard");
const totalValueCard = document.getElementById("totalValueCard");
const lowStockCard = document.getElementById("lowStockCard");

function currency(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function numberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getStoredCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("currentUser") || "null");
  } catch {
    return null;
  }
}

function patchStoredCurrentUser(patch = {}) {
  try {
    const current = getStoredCurrentUser() || {};
    localStorage.setItem("currentUser", JSON.stringify({
      ...current,
      ...patch
    }));
  } catch {
    // ignore
  }
}

function getCurrentPageFile() {
  const file = window.location.pathname.split("/").pop().toLowerCase();
  return file || "index.html";
}

function startOfCurrentMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getUnitsPerBox(product) {
  const v = numberOrZero(product && product.unitsPerBox);
  return v > 0 ? v : 1;
}

function getProductCode(product) {
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

function getCurrentStockUnits(product) {
  if (!product) return 0;

  const current = Number(product.stockCurrentUnits);
  if (Number.isFinite(current)) return Math.max(0, current);

  const qty = Number(product.quantity);
  if (Number.isFinite(qty)) return Math.max(0, qty);

  const base = Number(product.stockBaseUnits);
  if (Number.isFinite(base)) return Math.max(0, base);

  return 0;
}

function getStockBaseUnits(product) {
  const base = numberOrZero(product && product.stockBaseUnits);
  if (base > 0) return base;
  return getCurrentStockUnits(product);
}

function getSoldUnitsForProduct(product) {
  if (!product || !product.id) return 0;
  return numberOrZero(currentMonthlySalesMap[product.id]);
}

function getSoldBoxesForProduct(product) {
  if (!product || !product.id) return 0;
  return numberOrZero(currentMonthlyBoxesMap[product.id]);
}

function getStockUnits(product) {
  return getCurrentStockUnits(product);
}

function getStockBoxes(product) {
  const unitsPerBox = getUnitsPerBox(product);
  const stockUnits = getStockUnits(product);
  return Math.floor(stockUnits / unitsPerBox);
}

function getCostPerUnit(product) {
  const stored = numberOrZero(product && product.lastCostPerUnit);
  if (stored > 0) return stored;

  const costPerBox = numberOrZero(product && product.lastCostPerBox);
  const unitsPerBox = getUnitsPerBox(product);

  if (costPerBox > 0 && unitsPerBox > 0) {
    return costPerBox / unitsPerBox;
  }

  return 0;
}

function getSaleProductId(p) {
  return p && (p.productId || p.productID || p.product_id || p.id)
    ? String(p.productId || p.productID || p.product_id || p.id)
    : "";
}

function getLocalFieldValue(data = {}) {
  return String(
    data.id_local ||
    data.idLocal ||
    data.localId ||
    data.idlocal ||
    ""
  ).trim();
}

function normalizeLocalInfo(data = {}, fallbackId = "") {
  return {
    id_local: String(
      fallbackId ||
      data.id_local ||
      data.idLocal ||
      data.localId ||
      ""
    ).trim(),
    nombre: String(
      data.nombre ||
      data.name ||
      data.localName ||
      data.local_nombre ||
      data.localNombre ||
      ""
    ).trim(),
    numeroDocumento: String(
      data.numeroDocumento ||
      data.numero_documento ||
      data.documentNumber ||
      data.nDocumento ||
      data.localNumeroDocumento ||
      ""
    ).trim(),
    ubicacion: String(
      data.ubicacion ||
      data.location ||
      data.direccion ||
      data.address ||
      data.localUbicacion ||
      ""
    ).trim()
  };
}

function matchesCurrentLocal(data = {}) {
  if (!currentLocalId) return false;
  return getLocalFieldValue(data) === String(currentLocalId).trim();
}

async function loadLocalDocById(localId) {
  const target = String(localId || "").trim();
  if (!target) return null;

  try {
    const direct = await db.collection("local").doc(target).get();
    if (direct.exists) {
      return { id: direct.id, ...(direct.data() || {}) };
    }
  } catch (err) {
    console.warn("No se pudo leer el local por documento directo:", err);
  }

  try {
    const byField = await db.collection("local")
      .where("id_local", "==", target)
      .limit(1)
      .get();

    if (!byField.empty) {
      const doc = byField.docs[0];
      return { id: doc.id, ...(doc.data() || {}) };
    }
  } catch (err) {
    console.warn("No se pudo leer el local por id_local:", err);
  }

  return null;
}

async function resolveCurrentLocalContext() {
  const stored = getStoredCurrentUser() || {};

  currentLocalId = String(
    (typeof getCurrentLocalId === "function" ? getCurrentLocalId() : "") ||
    stored.id_local ||
    stored.idLocal ||
    stored.localId ||
    ""
  ).trim();

  currentLocalInfo = normalizeLocalInfo(
    (typeof getCurrentLocalInfo === "function" ? getCurrentLocalInfo() : stored) || stored,
    currentLocalId
  );

  if (currentLocalId && (!currentLocalInfo.nombre || !currentLocalInfo.numeroDocumento || !currentLocalInfo.ubicacion)) {
    const localDoc = await loadLocalDocById(currentLocalId);
    if (localDoc) {
      currentLocalInfo = normalizeLocalInfo(localDoc, currentLocalId);
    }
  }

  patchStoredCurrentUser({
    id_local: currentLocalId,
    localNombre: currentLocalInfo.nombre || "",
    localNumeroDocumento: currentLocalInfo.numeroDocumento || "",
    localUbicacion: currentLocalInfo.ubicacion || ""
  });
}

function aggregateMonthlySales(snapshot) {
  const unitsMap = {};
  const boxesMap = {};

  snapshot.forEach(doc => {
    const sale = doc.data() || {};

    if (!matchesCurrentLocal(sale)) return;

    const products = Array.isArray(sale.products) ? sale.products : [];

    products.forEach(p => {
      const productId = getSaleProductId(p);
      if (!productId) return;

      const unitsPerBox = Math.max(1, numberOrZero(p.unitsPerBox));
      const mode = String(p.mode || p.saleMode || p.saleType || "").toLowerCase();
      const qty = numberOrZero(p.quantity);
      const totalUnits = numberOrZero(p.unitsTotal || p.totalUnits);

      let soldUnits = 0;
      let soldBoxes = 0;

      if (mode === "box") {
        soldBoxes = qty > 0 ? Math.floor(qty) : (totalUnits > 0 ? Math.floor(totalUnits / unitsPerBox) : 0);
        soldUnits = totalUnits > 0 ? totalUnits : soldBoxes * unitsPerBox;
      } else if (mode === "unit") {
        soldUnits = totalUnits > 0 ? totalUnits : qty;
      } else if (totalUnits > 0) {
        soldUnits = totalUnits;
      } else if (numberOrZero(p.boxes) > 0) {
        soldBoxes = Math.floor(numberOrZero(p.boxes));
        soldUnits = soldBoxes * unitsPerBox;
      } else {
        soldUnits = qty;
      }

      unitsMap[productId] = (unitsMap[productId] || 0) + soldUnits;
      boxesMap[productId] = (boxesMap[productId] || 0) + soldBoxes;
    });
  });

  return { unitsMap, boxesMap };
}

function buildProjectionForProduct(product) {
  const stockUnits = getStockUnits(product);
  const stockBoxes = getStockBoxes(product);
  const unitsPerBox = getUnitsPerBox(product);
  const costPerUnit = getCostPerUnit(product);

  const soldUnits = getSoldUnitsForProduct(product);
  const soldBoxes = Math.floor(getSoldBoxesForProduct(product));

  let suggestedUnits = soldUnits + SAFETY_STOCK_DEFAULT - stockUnits;
  if (suggestedUnits < 0) suggestedUnits = 0;

  const suggestedBoxes = unitsPerBox > 1
    ? Math.ceil(suggestedUnits / unitsPerBox)
    : suggestedUnits;

  let status = "OK";
  if (suggestedUnits > 0) {
    status = "Reponer";
  } else if (stockUnits <= LOW_STOCK_THRESHOLD) {
    status = "Bajo";
  }

  let coverageDays = "-";
  if (soldUnits > 0) {
    const dailyRate = soldUnits / 30;
    coverageDays = dailyRate > 0 ? Math.max(0, Math.floor(stockUnits / dailyRate)) : "-";
  }

  return {
    stockUnits,
    stockBoxes,
    soldMonthUnits: soldUnits,
    soldMonthBoxes: soldBoxes,
    costPerUnit,
    suggestedPurchaseUnits: suggestedUnits,
    suggestedPurchaseBoxes: suggestedBoxes,
    status,
    coverageDays,
    unitsPerBox
  };
}

function buildRowData(product) {
  const projection = buildProjectionForProduct(product);

  return {
    id: product.id,
    code: getProductCode(product),
    name: product.name || "-",
    price: numberOrZero(product.price),
    quantity: getCurrentStockUnits(product),
    stockBaseUnits: getStockBaseUnits(product),
    boxes: numberOrZero(product.boxes),
    unitsPerBox: getUnitsPerBox(product),
    lastCostPerBox: numberOrZero(product.lastCostPerBox),
    lastCostPerUnit: numberOrZero(product.lastCostPerUnit),
    stockUnits: projection.stockUnits,
    stockBoxes: projection.stockBoxes,
    soldMonthUnits: projection.soldMonthUnits,
    soldMonthBoxes: projection.soldMonthBoxes,
    costPerUnit: projection.costPerUnit,
    suggestedPurchaseUnits: projection.suggestedPurchaseUnits,
    suggestedPurchaseBoxes: projection.suggestedPurchaseBoxes,
    status: projection.status
  };
}

function renderStatusChip(status) {
  if (status === "Reponer") {
    return `<span style="padding:4px 8px;border-radius:999px;background:#fee2e2;color:#b91c1c;font-weight:700;">Reponer</span>`;
  }

  if (status === "Bajo") {
    return `<span style="padding:4px 8px;border-radius:999px;background:#fef3c7;color:#92400e;font-weight:700;">Bajo</span>`;
  }

  return `<span style="padding:4px 8px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:700;">OK</span>`;
}

function renderStockDisplay(row) {
  if (row.unitsPerBox > 1) {
    return `${row.stockUnits}<br><small>${row.stockBoxes} cajas x ${row.unitsPerBox}</small>`;
  }

  return `${row.stockUnits}`;
}

function renderActions(row) {
  if (!canEditInventory) {
    return `<span class="small">Solo lectura</span>`;
  }

  const isAdmin = currentRole === "administrador" || currentRole === "admin";

  return `
    <button type="button" class="btn-outline" data-action="edit" data-id="${row.id}">
      <i class="fas fa-edit"></i> Editar
    </button>
    <button type="button" class="btn-outline" data-action="delete" data-id="${row.id}" data-name="${escapeHtml(row.name)}" style="margin-left:8px;" ${isAdmin ? "" : "disabled title='Solo administrador puede eliminar productos'"}>
      <i class="fas fa-trash"></i> Eliminar
    </button>
  `;
}

function ensureInventoryDataTable() {
  if (inventoryDT) return inventoryDT;
  if (!window.jQuery || !$.fn || !$.fn.DataTable) return null;

  inventoryDT = $("#inventoryTable").DataTable({
    data: [],
    columns: [
      { data: "name", title: "Nombre", render: (data, type) => type === "display" ? escapeHtml(data) : data },
      { data: "stockUnits", title: "Stock", render: (data, type, row) => type === "display" ? renderStockDisplay(row) : data },
      { data: "price", title: "Precio", render: (data, type) => type === "display" ? currency(data) : data },
      { data: "soldMonthUnits", title: "Vendido Mes (Unid.)", render: (data, type) => type === "display" ? numberOrZero(data) : data },
      { data: "soldMonthBoxes", title: "Vendido Mes (Cajas)", render: (data, type) => type === "display" ? Math.floor(numberOrZero(data)) : data },
      { data: "costPerUnit", title: "Costo por unidad", render: (data, type) => type === "display" ? currency(data) : data },
      {
        data: "suggestedPurchaseUnits",
        title: "Sugerido Compra (Unid.)",
        render: (data, type) => {
          if (type !== "display") return data;
          return data > 0
            ? `<strong style="color:#ef4444;">${data}</strong>`
            : `<strong style="color:#16a34a;">0</strong>`;
        }
      },
      { data: "suggestedPurchaseBoxes", title: "Sugerido Compra (Cajas)", render: (data, type) => type === "display" ? Math.floor(numberOrZero(data)) : data },
      { data: "status", title: "Estado", render: (data, type) => type === "display" ? renderStatusChip(data) : data },
      { data: null, title: "Acciones", orderable: false, searchable: false, render: (data, type, row) => type === "display" ? renderActions(row) : "" }
    ],
    pageLength: 10,
    lengthMenu: [5, 10, 25, 50],
    order: [[0, "asc"]],
    autoWidth: false,
    scrollX: true,
    scrollCollapse: true,
    deferRender: true,
    dom: "rt<\"bottom\"ip><\"clear\">",
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

  $("#inventoryTable tbody").on("click", "button[data-action='edit']", function () {
    if (!canEditInventory) return;
    openEditModal(String($(this).data("id")));
  });

  $("#inventoryTable tbody").on("click", "button[data-action='delete']", function () {
    if (!canEditInventory) return;
    confirmDeleteProduct(String($(this).data("id")), String($(this).data("name") || ""));
  });

  return inventoryDT;
}

function renderInventoryFallback(rows) {
  if (!inventoryTbody) return;

  inventoryTbody.innerHTML = "";

  if (!rows.length) {
    inventoryTbody.innerHTML = "<tr><td colspan='10'>No hay productos registrados.</td></tr>";
    return;
  }

  rows.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.name)}</td>
      <td>${renderStockDisplay(row)}</td>
      <td>${currency(row.price)}</td>
      <td>${numberOrZero(row.soldMonthUnits)}</td>
      <td>${Math.floor(numberOrZero(row.soldMonthBoxes))}</td>
      <td>${currency(row.costPerUnit)}</td>
      <td>${row.suggestedPurchaseUnits > 0 ? `<strong style="color:#ef4444;">${row.suggestedPurchaseUnits}</strong>` : "<strong style='color:#16a34a;'>0</strong>"}</td>
      <td>${Math.floor(numberOrZero(row.suggestedPurchaseBoxes))}</td>
      <td>${renderStatusChip(row.status)}</td>
      <td>${renderActions(row)}</td>
    `;
    inventoryTbody.appendChild(tr);
  });
}

function refreshInventoryView() {
  const rows = currentProductsList.map(buildRowData);

  const totalValue = rows.reduce((sum, p) => sum + (numberOrZero(p.stockUnits) * numberOrZero(p.price)), 0);
  const lowStockList = rows.filter(p => p.stockUnits <= LOW_STOCK_THRESHOLD || p.suggestedPurchaseUnits > 0);

  if (totalProductsCard) totalProductsCard.textContent = rows.length;
  if (totalValueCard) totalValueCard.textContent = currency(totalValue);
  if (lowStockCard) lowStockCard.textContent = lowStockList.length;

  renderLowStockPanel(lowStockList);

  const dt = ensureInventoryDataTable();
  if (dt) {
    dt.clear();
    dt.rows.add(rows);
    dt.draw(false);
  } else {
    renderInventoryFallback(rows);
  }

  if (searchInput && dt) {
    dt.search(searchInput.value.trim()).draw(false);
  }
}

function renderLowStockPanel(list) {
  if (!lowStockPanel) return;

  if (!list.length) {
    lowStockPanel.style.display = "none";
    lowStockPanel.innerHTML = "";
    return;
  }

  lowStockPanel.style.display = "block";
  lowStockPanel.innerHTML = "";

  list.forEach(p => {
    const div = document.createElement("div");
    div.className = "low-stock-item";

    const left = document.createElement("div");
    left.innerHTML = `<strong>${escapeHtml(p.name)}</strong>`;

    const right = document.createElement("div");
    right.textContent =
      `Stock: ${p.stockUnits} unid. | ` +
      `Cajas: ${p.stockBoxes} | ` +
      `Vendido mes: ${p.soldMonthUnits} unid. | ` +
      `Sugerido compra: ${p.suggestedPurchaseUnits} unid. (${p.suggestedPurchaseBoxes} cajas)`;

    div.appendChild(left);
    div.appendChild(right);
    lowStockPanel.appendChild(div);
  });
}

function stopRealtimeListeners() {
  if (typeof productsUnsub === "function") {
    productsUnsub();
    productsUnsub = null;
  }

  if (typeof salesUnsub === "function") {
    salesUnsub();
    salesUnsub = null;
  }
}

function startRealtimeListeners() {
  stopRealtimeListeners();

  const monthStart = startOfCurrentMonth();

  salesUnsub = db.collection("ventas")
    .where("createdAt", ">=", monthStart)
    .onSnapshot(snapshot => {
      const { unitsMap, boxesMap } = aggregateMonthlySales(snapshot);
      currentMonthlySalesMap = unitsMap;
      currentMonthlyBoxesMap = boxesMap;
      refreshInventoryView();
    }, err => {
      console.error("Error cargando ventas del mes:", err);
      currentMonthlySalesMap = {};
      currentMonthlyBoxesMap = {};
      refreshInventoryView();
    });

  productsUnsub = db.collection("productos")
    .orderBy("name")
    .onSnapshot(snapshot => {
      const products = [];

      snapshot.forEach(doc => {
        const p = doc.data() || {};
        if (!matchesCurrentLocal(p)) return;

        const currentStockUnits =
          Number.isFinite(Number(p.stockCurrentUnits)) ? Math.max(0, numberOrZero(p.stockCurrentUnits)) :
            Number.isFinite(Number(p.quantity)) ? Math.max(0, numberOrZero(p.quantity)) :
              Number.isFinite(Number(p.stockBaseUnits)) ? Math.max(0, numberOrZero(p.stockBaseUnits)) :
                0;

        products.push({
          id: doc.id,
          ...p,
          id_local: p.id_local || currentLocalId,
          localNombre: p.localNombre || currentLocalInfo.nombre || "",
          localNumeroDocumento: p.localNumeroDocumento || currentLocalInfo.numeroDocumento || "",
          localUbicacion: p.localUbicacion || currentLocalInfo.ubicacion || "",
          codigoProducto: getProductCode(p),
          quantity: currentStockUnits,
          stockCurrentUnits: currentStockUnits,
          stockBaseUnits: numberOrZero(p.stockBaseUnits),
          boxes: numberOrZero(p.boxes),
          unitsPerBox: numberOrZero(p.unitsPerBox) > 0 ? numberOrZero(p.unitsPerBox) : 1
        });
      });

      currentProductsList = products;
      refreshInventoryView();
    }, err => {
      console.error("Error cargando inventario:", err);
      currentProductsList = [];
      refreshInventoryView();
    });
}

function findProductByName(name) {
  if (!name) return null;
  const lower = String(name).trim().toLowerCase();
  return currentProductsList.find(p => {
    const n = String(p.name || "").trim().toLowerCase();
    const c = String(getProductCode(p) || "").trim().toLowerCase();
    const id = String(p.id || "").trim().toLowerCase();
    return n === lower || c === lower || id === lower;
  }) || null;
}

function findProductById(id) {
  return currentProductsList.find(p => String(p.id) === String(id)) || null;
}

/* =======================
   Modal moderno para agregar / reponer
   ======================= */
function buildExistingProductOptions(selectedValue = "") {
  const options = [`<option value="">Selecciona un producto</option>`];

  currentProductsList.forEach(p => {
    const code = getProductCode(p);
    options.push(
      `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}${code ? ` — ${escapeHtml(code)}` : ""}</option>`
    );
    if (code) {
      options.push(
        `<option value="${escapeHtml(code)}">${escapeHtml(code)}${p.name ? ` — ${escapeHtml(p.name)}` : ""}</option>`
      );
    }
  });

  return options.join("");
}

function buildStockFormHtml(initial = {}) {
  const hasProducts = currentProductsList.length > 0;
  const defaultMode = initial.mode || (hasProducts ? "existing" : "new");
  const selectedProduct = initial.productName ? findProductByName(initial.productName) : null;
  const selectedUnitsPerBox = selectedProduct ? getUnitsPerBox(selectedProduct) : 1;
  const selectedCode = selectedProduct ? getProductCode(selectedProduct) : "";

  const productOptions = buildExistingProductOptions();

  return `
    <div class="inv-modal">
      <div class="inv-modal-grid">
        <div class="inv-field full">
          <label for="p-mode">Tipo de registro</label>
          <select id="p-mode">
            <option value="new" ${defaultMode === "new" ? "selected" : ""}>Nuevo producto</option>
            <option value="existing" ${defaultMode === "existing" ? "selected" : ""}>Agregar a producto existente</option>
          </select>
        </div>

        <div class="inv-field full" id="existingGroup">
          <label for="p-existing">Producto existente</label>
          <input
            id="p-existing"
            type="text"
            list="productList"
            placeholder="Escribe para buscar un producto o su código..."
            value="${escapeHtml(initial.productName || initial.codigoProducto || "")}"
            autocomplete="off"
          >
          <datalist id="productList">
            ${productOptions}
          </datalist>
        </div>

        <div class="inv-field full" id="nameGroup">
          <label for="p-name">Nombre del producto</label>
          <input id="p-name" type="text" placeholder="Ej. Aceite 1L" value="${escapeHtml(initial.name || "")}">
        </div>

        <div class="inv-field full">
          <label for="p-code">Código del producto</label>
          <input
            id="p-code"
            type="text"
            placeholder="Ej. ACE-001"
            value="${escapeHtml(initial.codigoProducto || selectedCode || "")}"
          >
        </div>

        <div class="inv-field full">
          <label for="p-ref">Referencia a libro</label>
          <input
            id="p-ref"
            type="text"
            placeholder="Ej. Compra, Ajuste, Inventario inicial"
            value="${escapeHtml(initial.referenciaLibro || "")}"
          >
        </div>

        <div class="inv-field full">
          <label for="p-doc">Número de documento</label>
          <input
            id="p-doc"
            type="text"
            placeholder="FAC-00125 / AJ-00001 / INV-00001"
            value="${escapeHtml(initial.numeroDocumento || "")}"
          >
        </div>

        <div class="inv-helper" id="p-hint">
          Cuando seleccionas un producto existente, el sistema suma las cajas y unidades sueltas al stock actual.
        </div>

        <div class="inv-field">
          <label for="p-boxes">Cajas a agregar</label>
          <input id="p-boxes" type="number" min="0" step="1" value="${Math.max(0, numberOrZero(initial.boxes))}">
        </div>

        <div class="inv-field">
          <label for="p-upb">Unidades por caja</label>
          <input id="p-upb" type="number" min="1" step="1" value="${Math.max(1, numberOrZero(initial.unitsPerBox || selectedUnitsPerBox || 1))}">
        </div>

        <div class="inv-field">
          <label for="p-extra">Unidades sueltas</label>
          <input id="p-extra" type="number" min="0" step="1" value="${Math.max(0, numberOrZero(initial.extraUnits))}">
        </div>

        <div class="inv-field">
          <label for="p-costbox">Costo por caja</label>
          <input id="p-costbox" type="number" min="0" step="0.01" value="${Math.max(0, numberOrZero(initial.lastCostPerBox))}">
        </div>

        <div class="inv-field">
          <label for="p-price">Precio de venta</label>
          <input id="p-price" type="number" min="0" step="0.01" value="${Math.max(0, numberOrZero(initial.price))}">
        </div>

        <div class="inv-mini-summary">
          <div class="inv-mini-card">
            <span>Unidades a sumar</span>
            <strong id="p-total-units">0</strong>
          </div>
          <div class="inv-mini-card">
            <span>Cajas a sumar</span>
            <strong id="p-total-boxes">0</strong>
          </div>
          <div class="inv-mini-card">
            <span>Modo activo</span>
            <strong id="p-mode-label">Nuevo</strong>
          </div>
        </div>
      </div>
    </div>
  `;
}

function syncStockModalState() {
  const modeEl = document.getElementById("p-mode");
  const existingGroup = document.getElementById("existingGroup");
  const nameGroup = document.getElementById("nameGroup");
  const existingEl = document.getElementById("p-existing");
  const nameEl = document.getElementById("p-name");
  const codeEl = document.getElementById("p-code");
  const refEl = document.getElementById("p-ref");
  const upbEl = document.getElementById("p-upb");
  const hintEl = document.getElementById("p-hint");
  const modeLabel = document.getElementById("p-mode-label");
  const totalUnitsEl = document.getElementById("p-total-units");
  const totalBoxesEl = document.getElementById("p-total-boxes");

  if (!modeEl || !existingGroup || !nameGroup || !existingEl || !nameEl || !codeEl || !refEl || !upbEl || !hintEl || !modeLabel || !totalUnitsEl || !totalBoxesEl) {
    return;
  }

  const refreshPreview = () => {
    const boxes = Math.max(0, numberOrZero(document.getElementById("p-boxes")?.value));
    const upb = Math.max(1, numberOrZero(document.getElementById("p-upb")?.value));
    const extra = Math.max(0, numberOrZero(document.getElementById("p-extra")?.value));
    const totalUnits = (boxes * upb) + extra;

    totalUnitsEl.textContent = String(totalUnits);
    totalBoxesEl.textContent = String(boxes);
  };

  const applyExistingProduct = () => {
    const typed = String(existingEl.value || "").trim();
    const product = findProductByName(typed);

    if (!product) {
      upbEl.disabled = false;
      hintEl.textContent = "Escribe el nombre o el código exacto del producto, o selecciónalo de las sugerencias.";
      return;
    }

    nameEl.value = product.name || "";
    codeEl.value = getProductCode(product) || codeEl.value || "";
    upbEl.value = getUnitsPerBox(product);
    upbEl.disabled = true;
    hintEl.innerHTML = `
      Producto encontrado: <strong>${escapeHtml(product.name || "")}</strong>.
      El sistema usará <strong>${getUnitsPerBox(product)}</strong> unidades por caja.
    `;
  };

  const applyMode = () => {
    const mode = modeEl.value;

    if (mode === "existing") {
      existingGroup.style.display = "flex";
      nameGroup.style.display = "none";
      modeLabel.textContent = "Reposición";
      applyExistingProduct();
    } else {
      existingGroup.style.display = "none";
      nameGroup.style.display = "flex";
      modeLabel.textContent = "Nuevo";
      upbEl.disabled = false;
      hintEl.textContent = "Completa los datos del producto nuevo y su cantidad inicial.";
    }

    refreshPreview();
  };

  modeEl.addEventListener("change", applyMode);
  existingEl.addEventListener("input", () => {
    if (modeEl.value === "existing") {
      applyExistingProduct();
      refreshPreview();
    }
  });

  ["p-boxes", "p-upb", "p-extra"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", refreshPreview);
    }
  });

  applyMode();
  refreshPreview();
}

function readStockFormValues() {
  const mode = document.getElementById("p-mode").value;
  const existingName = document.getElementById("p-existing") ? document.getElementById("p-existing").value.trim() : "";
  const name = document.getElementById("p-name") ? document.getElementById("p-name").value.trim() : "";
  const codigoProducto = document.getElementById("p-code") ? document.getElementById("p-code").value.trim() : "";
  const referenciaLibro = document.getElementById("p-ref") ? document.getElementById("p-ref").value.trim() : "";
  const numeroDocumento = document.getElementById("p-doc") ? document.getElementById("p-doc").value.trim() : "";
  const boxes = Math.max(0, numberOrZero(document.getElementById("p-boxes").value));
  const unitsPerBox = Math.max(1, numberOrZero(document.getElementById("p-upb").value));
  const extraUnits = Math.max(0, numberOrZero(document.getElementById("p-extra").value));
  const lastCostPerBox = Math.max(0, numberOrZero(document.getElementById("p-costbox").value));
  const price = Math.max(0, numberOrZero(document.getElementById("p-price").value));
  const quantity = (boxes * unitsPerBox) + extraUnits;

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
    const user = auth.currentUser || null;
    const stored = getStoredCurrentUser();
    const userName = (stored && stored.name) ? stored.name : (user ? user.email : "");

    await db.collection("stock_movimientos").add({
      productId,
      productName,
      codigoProducto,
      productCode: codigoProducto,
      tipoMovimiento,
      referenciaLibro,
      referenceBook: referenciaLibro,
      bookReference: referenciaLibro,
      numeroDocumento,
      entrada: numberOrZero(entrada),
      salida: numberOrZero(salida),
      saldoAnterior: numberOrZero(saldoAnterior),
      saldoActual: numberOrZero(saldoActual),
      detalle,
      id_local: currentLocalId || null,
      localNombre: currentLocalInfo.nombre || "",
      localNumeroDocumento: currentLocalInfo.numeroDocumento || "",
      localUbicacion: currentLocalInfo.ubicacion || "",
      userId: user ? user.uid : null,
      userName,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error("Error registrando movimiento de stock:", err);
  }
}

async function createNewProduct(values) {
  const ref = await db.collection("productos").add({
    name: values.name,
    codigoProducto: values.codigoProducto || "",
    productCode: values.codigoProducto || "",
    quantity: values.quantity,
    stockCurrentUnits: values.quantity,
    stockBaseUnits: values.quantity,
    boxes: Math.floor(values.quantity / Math.max(1, values.unitsPerBox)),
    unitsPerBox: values.unitsPerBox,
    lastCostPerBox: values.lastCostPerBox,
    lastCostPerUnit: values.unitsPerBox > 0 ? (values.lastCostPerBox / values.unitsPerBox) : 0,
    price: values.price,
    id_local: currentLocalId || null,
    localNombre: currentLocalInfo.nombre || "",
    localNumeroDocumento: currentLocalInfo.numeroDocumento || "",
    localUbicacion: currentLocalInfo.ubicacion || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  await registrarMovimientoStock({
    productId: ref.id,
    productName: values.name,
    codigoProducto: values.codigoProducto || "",
    tipoMovimiento: "entrada",
    referenciaLibro: values.referenciaLibro || "Inventario inicial",
    numeroDocumento: values.numeroDocumento || ref.id,
    entrada: values.quantity,
    salida: 0,
    saldoAnterior: 0,
    saldoActual: values.quantity,
    detalle: "Alta inicial de producto"
  });
}

async function addToExistingProduct(product, values) {
  const currentUnitsPerBox = getUnitsPerBox(product);
  const unitsAdded = (Math.max(0, values.boxes) * currentUnitsPerBox) + Math.max(0, values.extraUnits);

  if (unitsAdded <= 0) {
    throw new Error("La cantidad a agregar debe ser mayor que cero.");
  }

  const productRef = db.collection("productos").doc(product.id);

  let saldoAnterior = 0;
  let saldoActual = 0;

  await db.runTransaction(async (t) => {
    const snap = await t.get(productRef);

    if (!snap.exists) {
      throw new Error("El producto ya no existe.");
    }

    const data = snap.data() || {};
    if (!matchesCurrentLocal(data)) {
      throw new Error("Este producto no pertenece al local actual.");
    }

    const currentStock = getCurrentStockUnits(data);
    const nextQuantity = currentStock + unitsAdded;
    const nextBoxes = Math.floor(nextQuantity / currentUnitsPerBox);

    saldoAnterior = currentStock;
    saldoActual = nextQuantity;

    const nextLastCostPerBox = values.lastCostPerBox > 0
      ? values.lastCostPerBox
      : numberOrZero(data.lastCostPerBox);

    const nextPrice = values.price > 0
      ? values.price
      : numberOrZero(data.price);

    const nextCodigoProducto = values.codigoProducto || getProductCode(data) || "";

    t.update(productRef, {
      name: values.name || data.name || "",
      codigoProducto: nextCodigoProducto,
      productCode: nextCodigoProducto,
      quantity: nextQuantity,
      stockCurrentUnits: nextQuantity,
      boxes: nextBoxes,
      unitsPerBox: currentUnitsPerBox,
      lastCostPerBox: nextLastCostPerBox,
      lastCostPerUnit: currentUnitsPerBox > 0 ? (nextLastCostPerBox / currentUnitsPerBox) : 0,
      price: nextPrice,
      id_local: currentLocalId || data.id_local || null,
      localNombre: currentLocalInfo.nombre || data.localNombre || "",
      localNumeroDocumento: currentLocalInfo.numeroDocumento || data.localNumeroDocumento || "",
      localUbicacion: currentLocalInfo.ubicacion || data.localUbicacion || "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });

  await registrarMovimientoStock({
    productId: product.id,
    productName: values.name || product.name || "",
    codigoProducto: values.codigoProducto || getProductCode(product) || "",
    tipoMovimiento: "entrada",
    referenciaLibro: values.referenciaLibro || "Compra",
    numeroDocumento: values.numeroDocumento || "",
    entrada: unitsAdded,
    salida: 0,
    saldoAnterior,
    saldoActual,
    detalle: "Entrada de inventario"
  });
}

async function showAddProductModal() {
  if (!canEditInventory) {
    Swal.fire("Sin permisos", "No puedes agregar productos desde este rol.", "warning");
    return;
  }

  if (!currentLocalId) {
    Swal.fire("Sin local", "No se pudo identificar el local actual.", "error");
    return;
  }

  if (!currentProductsList.length) {
    const result = await Swal.fire({
      title: "Nuevo producto",
      html: buildStockFormHtml({
        mode: "new",
        boxes: 0,
        unitsPerBox: 1,
        extraUnits: 0,
        lastCostPerBox: 0,
        price: 0,
        referenciaLibro: "Inventario inicial",
        numeroDocumento: "",
        codigoProducto: ""
      }),
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      focusConfirm: false,
      didOpen: syncStockModalState,
      preConfirm: () => {
        const values = readStockFormValues();

        if (!values.name) {
          Swal.showValidationMessage("El nombre es obligatorio.");
          return;
        }

        if (!values.codigoProducto) {
          Swal.showValidationMessage("El código de producto es obligatorio.");
          return;
        }

        if (values.quantity <= 0) {
          Swal.showValidationMessage("Debes ingresar cajas o unidades sueltas.");
          return;
        }

        return values;
      }
    });

    if (!result.isConfirmed) return;

    try {
      await createNewProduct(result.value);
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Producto agregado",
        timer: 1400,
        showConfirmButton: false
      });
    } catch (err) {
      console.error("Error guardando producto:", err);
      Swal.fire("Error", "No se pudo guardar el producto.", "error");
    }

    return;
  }

  const defaultMode = "existing";
  const initialProduct = currentProductsList[0] || null;

  const result = await Swal.fire({
    title: "Agregar / reponer producto",
    html: buildStockFormHtml({
      mode: defaultMode,
      productId: initialProduct ? initialProduct.id : "",
      productName: initialProduct ? initialProduct.name : "",
      codigoProducto: initialProduct ? getProductCode(initialProduct) : "",
      boxes: 0,
      unitsPerBox: initialProduct ? getUnitsPerBox(initialProduct) : 1,
      extraUnits: 0,
      lastCostPerBox: initialProduct ? numberOrZero(initialProduct.lastCostPerBox) : 0,
      price: initialProduct ? numberOrZero(initialProduct.price) : 0,
      referenciaLibro: "Compra",
      numeroDocumento: ""
    }),
    showCancelButton: true,
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar",
    focusConfirm: false,
    didOpen: syncStockModalState,
    preConfirm: () => {
      const values = readStockFormValues();

      if (values.mode === "existing") {
        if (!values.existingName) {
          Swal.showValidationMessage("Debes escribir o seleccionar un producto existente.");
          return;
        }

        if (!findProductByName(values.existingName)) {
          Swal.showValidationMessage("No se encontró el producto. Selecciónalo de las sugerencias.");
          return;
        }

        if (values.quantity <= 0) {
          Swal.showValidationMessage("Debes ingresar cajas o unidades sueltas.");
          return;
        }

        return values;
      }

      if (!values.name) {
        Swal.showValidationMessage("El nombre es obligatorio.");
        return;
      }

      if (!values.codigoProducto) {
        Swal.showValidationMessage("El código de producto es obligatorio.");
        return;
      }

      if (findProductByName(values.name) || findProductByName(values.codigoProducto)) {
        Swal.showValidationMessage("Ese producto ya existe. Usa la opción de producto existente.");
        return;
      }

      if (values.quantity <= 0) {
        Swal.showValidationMessage("Debes ingresar cajas o unidades sueltas.");
        return;
      }

      return values;
    }
  });

  if (!result.isConfirmed) return;

  try {
    const values = result.value;

    if (values.mode === "existing") {
      const product = findProductByName(values.existingName);

      if (!product) {
        Swal.fire("No encontrado", "El producto seleccionado no existe.", "warning");
        return;
      }

      await addToExistingProduct(product, values);

      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Stock agregado al producto",
        timer: 1400,
        showConfirmButton: false
      });
      return;
    }

    await createNewProduct(values);
    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: "Producto agregado",
      timer: 1400,
      showConfirmButton: false
    });
  } catch (err) {
    console.error("Error guardando producto:", err);
    Swal.fire("Error", "No se pudo guardar el producto.", "error");
  }
}

/* =======================
   Modal de edición existente
   ======================= */
function buildProductFormHtml(initial = {}) {
  return `
    <input id="p-name" class="swal2-input" placeholder="Nombre del producto" value="${escapeHtml(initial.name || "")}">
    <input id="p-code" class="swal2-input" placeholder="Código del producto" value="${escapeHtml(initial.codigoProducto || "")}">
    <input id="p-boxes" type="number" class="swal2-input" placeholder="Número de cajas" min="0" value="${numberOrZero(initial.boxes)}">
    <input id="p-upb" type="number" class="swal2-input" placeholder="Unidades por caja" min="1" value="${Math.max(1, numberOrZero(initial.unitsPerBox || 1))}">
    <input id="p-extra" type="number" class="swal2-input" placeholder="Unidades sueltas" min="0" value="${numberOrZero(initial.extraUnits)}">
    <input id="p-costbox" type="number" class="swal2-input" placeholder="Costo por caja" step="0.01" min="0" value="${numberOrZero(initial.lastCostPerBox)}">
    <input id="p-price" type="number" class="swal2-input" placeholder="Precio de venta" step="0.01" min="0" value="${numberOrZero(initial.price)}">
    <input id="p-ref" class="swal2-input" placeholder="Referencia a libro" value="${escapeHtml(initial.referenciaLibro || "")}">
    <div style="text-align:left; margin-top:6px;">
      <small>La cantidad total se calcula con cajas × unidades por caja + unidades sueltas.</small>
    </div>
  `;
}

function readProductFormValues() {
  const name = document.getElementById("p-name").value.trim();
  const codigoProducto = document.getElementById("p-code").value.trim();
  const boxes = Math.max(0, numberOrZero(document.getElementById("p-boxes").value));
  const unitsPerBox = Math.max(1, numberOrZero(document.getElementById("p-upb").value));
  const extraUnits = Math.max(0, numberOrZero(document.getElementById("p-extra").value));
  const lastCostPerBox = Math.max(0, numberOrZero(document.getElementById("p-costbox").value));
  const price = Math.max(0, numberOrZero(document.getElementById("p-price").value));
  const referenciaLibro = document.getElementById("p-ref").value.trim();

  return {
    name,
    codigoProducto,
    boxes,
    unitsPerBox,
    extraUnits,
    lastCostPerBox,
    price,
    referenciaLibro,
    quantity: (boxes * unitsPerBox) + extraUnits
  };
}

async function openEditModal(productId) {
  if (!canEditInventory) {
    Swal.fire("Sin permisos", "No puedes editar productos desde este rol.", "warning");
    return;
  }

  try {
    const doc = await db.collection("productos").doc(productId).get();

    if (!doc.exists) {
      Swal.fire("No encontrado", "El producto no existe.", "warning");
      return;
    }

    const product = doc.data() || {};
    if (!matchesCurrentLocal(product)) {
      Swal.fire("Sin permisos", "Este producto no pertenece al local actual.", "error");
      return;
    }

    const currentUnitsPerBox = getUnitsPerBox(product);
    const currentUnits = getCurrentStockUnits(product);
    const currentBoxes = Math.floor(currentUnits / currentUnitsPerBox);
    const extraUnits = Math.max(0, currentUnits - (currentBoxes * currentUnitsPerBox));

    const result = await Swal.fire({
      title: `Editar: ${product.name || ""}`,
      html: buildProductFormHtml({
        name: product.name || "",
        codigoProducto: getProductCode(product),
        boxes: currentBoxes,
        unitsPerBox: currentUnitsPerBox,
        extraUnits,
        lastCostPerBox: numberOrZero(product.lastCostPerBox),
        price: numberOrZero(product.price),
        referenciaLibro: product.referenciaLibro || product.referenceBook || ""
      }),
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Actualizar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const values = readProductFormValues();

        if (!values.name) {
          Swal.showValidationMessage("El nombre es obligatorio.");
          return;
        }

        if (!values.codigoProducto) {
          Swal.showValidationMessage("El código de producto es obligatorio.");
          return;
        }

        return values;
      }
    });

    if (!result.isConfirmed) return;

    const values = result.value;
    const nextUnits = values.quantity;

    await db.collection("productos").doc(productId).update({
      name: values.name,
      codigoProducto: values.codigoProducto,
      productCode: values.codigoProducto,
      referenciaLibro: values.referenciaLibro,
      referenceBook: values.referenciaLibro,
      quantity: nextUnits,
      stockCurrentUnits: nextUnits,
      boxes: Math.floor(nextUnits / values.unitsPerBox),
      unitsPerBox: values.unitsPerBox,
      lastCostPerBox: values.lastCostPerBox,
      lastCostPerUnit: values.unitsPerBox > 0 ? (values.lastCostPerBox / values.unitsPerBox) : 0,
      price: values.price,
      id_local: currentLocalId || product.id_local || null,
      localNombre: currentLocalInfo.nombre || product.localNombre || "",
      localNumeroDocumento: currentLocalInfo.numeroDocumento || product.localNumeroDocumento || "",
      localUbicacion: currentLocalInfo.ubicacion || product.localUbicacion || "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    if (nextUnits !== currentUnits) {
      await registrarMovimientoStock({
        productId,
        productName: values.name,
        codigoProducto: values.codigoProducto,
        tipoMovimiento: "ajuste",
        referenciaLibro: values.referenciaLibro || "Ajuste manual",
        numeroDocumento: `AJ-${Date.now()}`,
        entrada: Math.max(0, nextUnits - currentUnits),
        salida: Math.max(0, currentUnits - nextUnits),
        saldoAnterior: currentUnits,
        saldoActual: nextUnits,
        detalle: "Edición manual de stock"
      });
    }

    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: "Producto actualizado",
      timer: 1400,
      showConfirmButton: false
    });
  } catch (err) {
    console.error("Error editando producto:", err);
    Swal.fire("Error", "No se pudo actualizar el producto.", "error");
  }
}

function confirmDeleteProduct(productId, productName) {
  if (!(currentRole === "administrador" || currentRole === "admin")) {
    Swal.fire("No tienes permisos", "Solo el administrador puede eliminar productos.", "error");
    return;
  }

  Swal.fire({
    title: `Eliminar "${productName}"?`,
    text: "Esta acción no se puede deshacer",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar"
  }).then(async (result) => {
    if (!result.isConfirmed) return;

    try {
      await db.collection("productos").doc(productId).delete();
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Producto eliminado",
        showConfirmButton: false,
        timer: 1400
      });
    } catch (err) {
      console.error("Error eliminando producto:", err);
      Swal.fire("Error", "No se pudo eliminar el producto.", "error");
    }
  });
}

function filterWithDataTable() {
  const dt = ensureInventoryDataTable();
  if (!dt) return;
  dt.search(searchInput ? searchInput.value.trim() : "").draw();
}

function destroyInventoryDataTable() {
  if (inventoryDT) {
    inventoryDT.destroy();
    inventoryDT = null;
  }
}

async function backfillStockBaseUnitsIfNeeded(products) {
  if (!(currentRole === "administrador" || currentRole === "admin" || currentRole === "bodega")) return;

  const batch = db.batch();
  let pending = 0;

  products.forEach((product) => {
    if (!Number.isFinite(Number(product.stockCurrentUnits))) {
      const ref = db.collection("productos").doc(product.id);
      batch.update(ref, {
        stockCurrentUnits: getCurrentStockUnits(product),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      pending += 1;
    }
  });

  if (pending > 0) {
    try {
      await batch.commit();
    } catch (err) {
      console.warn("No se pudo completar la normalización de stockCurrentUnits:", err);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    const page = getCurrentPageFile();

    if (!user) {
      if (page !== "index.html" && page !== "login.html") {
        window.location.href = "index.html";
      }
      return;
    }

    let displayName = "Usuario";
    let role = "Empleado";

    try {
      await resolveCurrentLocalContext();

      const storedUser = getStoredCurrentUser();

      if (storedUser && storedUser.uid === user.uid) {
        displayName = storedUser.name || "Usuario";
        role = storedUser.role || "Empleado";
      } else {
        const snapshot = await db
          .collection("empleados")
          .where("email", "==", user.email)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          displayName = data.name || "Usuario";
          role = data.position || data.role || "Empleado";

          currentLocalId = String(data.id_local || data.idLocal || data.localId || currentLocalId || "").trim();
          currentLocalInfo = normalizeLocalInfo({
            id_local: currentLocalId,
            nombre: data.localNombre || "",
            numeroDocumento: data.localNumeroDocumento || "",
            ubicacion: data.localUbicacion || ""
          }, currentLocalId);

          localStorage.setItem("currentUser", JSON.stringify({
            uid: user.uid,
            name: displayName,
            email: user.email,
            phone: data.phone || "",
            role,
            id_local: currentLocalId,
            localNombre: currentLocalInfo.nombre || "",
            localNumeroDocumento: currentLocalInfo.numeroDocumento || "",
            localUbicacion: currentLocalInfo.ubicacion || ""
          }));
        }
      }

      currentRole = String(role || "").trim().toLowerCase();
      canEditInventory = currentRole === "administrador" || currentRole === "admin" || currentRole === "bodega";

      userGreeting.forEach(el => {
        el.textContent = `Hola, ${displayName} (${role})`;
      });

      if (btnAdd) {
        btnAdd.style.display = canEditInventory && currentLocalId ? "" : "none";
      }

      if (typeof renderNavigationForRole === "function") {
        renderNavigationForRole(role);
      }

      if (!currentLocalId) {
        Swal.fire({
          icon: "warning",
          title: "Sin local",
          text: "El usuario no tiene id_local asignado. El inventario no puede filtrarse."
        });
      }
    } catch (err) {
      console.error("Error leyendo usuario:", err);
    }

    ensureInventoryDataTable();
    startRealtimeListeners();
  });

  if (btnAdd) {
    btnAdd.addEventListener("click", showAddProductModal);
  }

  if (searchInput) {
    searchInput.addEventListener("input", filterWithDataTable);
  }

  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      auth.signOut().then(() => {
        localStorage.removeItem("currentUser");
        window.location.href = "index.html";
      });
    });
  }

  if (btnLogoutMobile) {
    btnLogoutMobile.addEventListener("click", () => {
      auth.signOut().then(() => {
        localStorage.removeItem("currentUser");
        window.location.href = "index.html";
      });
    });
  }

  window.addEventListener("beforeunload", () => {
    stopRealtimeListeners();
    destroyInventoryDataTable();
  });
});