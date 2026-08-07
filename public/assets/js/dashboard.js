// assets/js/dashboard.js
// El rango de fechas seleccionado controla:
// - Historial de ventas
// - Historial de gastos
// - Historial de movimientos de inventario
// - Exportación CSV de ventas filtradas
// - Exportación CSV de gastos filtradas
// - Exportación CSV de movimientos de inventario
// - Tarjetas
// - Gráfico
// - Utilidades
// - Productos vendidos
// Vista predeterminada: mes actual
//
// Filtro por local:
// - Se obtiene id_local desde el usuario autenticado
// - Se consulta la colección "local"
// - Todas las vistas del dashboard se filtran por el local del usuario
// - El filtrado por fecha se hace en memoria para evitar índices compuestos

document.addEventListener("DOMContentLoaded", () => {
  const greetingEls = document.querySelectorAll(".userGreeting");
  const logoutButtons = document.querySelectorAll("#logoutButton, #logoutButtonMobile");

  const salesTableBody = document.querySelector("#salesTable tbody");
  const expensesTableBody = document.querySelector("#expensesTable tbody");
  const movementsTableBody = document.querySelector("#movementsTable tbody");

  const rangeFrom = document.getElementById("rangeFrom");
  const rangeTo = document.getElementById("rangeTo");
  const rangeSearch = document.getElementById("rangeSearch");

  const salesRangeLabel = document.getElementById("salesRangeLabel");
  const expenseRangeLabel = document.getElementById("expenseRangeLabel");
  const movementRangeLabel = document.getElementById("movementRangeLabel");

  const salesCountLabel = document.getElementById("salesCountLabel");
  const expenseCountLabel = document.getElementById("expenseCountLabel");
  const movementCountLabel = document.getElementById("movementCountLabel");

  const lowStockPanel = document.getElementById("lowStockPanel");
  const btnGoInventory = document.getElementById("btnGoInventory");
  const btnCloseDay = document.getElementById("btnCloseDay");
  const btnExportSalesCSV = document.getElementById("btnExportSalesCSV");
  const btnExportExpensesCSV = document.getElementById("btnExportExpensesCSV");
  const btnExportMovementsCSV = document.getElementById("btnExportMovementsCSV");
  const btnApplyRange = document.getElementById("btnApplyRange");
  const btnResetRange = document.getElementById("btnResetRange");

  const statSalesEl = document.getElementById("statSales");
  const statExpensesEl = document.getElementById("statExpenses");
  const statNetEl = document.getElementById("statNet");
  const statUnitsSoldEl = document.getElementById("statUnitsSold");
  const statProductsSoldEl = document.getElementById("statProductsSold");
  const statLowStockEl = document.getElementById("statLowStock");

  const heroNote = document.querySelector(".hero-note");

  const LOW_STOCK_THRESHOLD = 5;
  const EMPLOYEE_COLLECTION_NAME = "empleados";
  const LOCAL_COLLECTION_NAME = "local";

  let cachedSales = [];
  let cachedExpenses = [];
  let cachedMovements = [];

  let visibleSales = [];
  let visibleExpenses = [];
  let visibleMovements = [];

  let selectedRange = {
    from: null,
    to: null
  };

  let productsMap = new Map();

  let currentUserInfo = {
    uid: "",
    email: "",
    name: "Usuario",
    role: "Empleado"
  };

  let currentLocalId = "";
  let currentLocalInfo = {
    id: "",
    nombre: "",
    numeroDocumento: "",
    ubicacion: "",
    contribuyente: ""
  };

  injectDashboardStyles();

  function numberOrZero(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"'`=\/]/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "/": "&#x2F;",
      "`": "&#x60;",
      "=": "&#x3D;"
    }[c]));
  }

  function formatMoney(value) {
    if (typeof appChartUtils !== "undefined" && typeof appChartUtils.formatCurrency === "function") {
      return appChartUtils.formatCurrency(value);
    }

    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "USD"
    }).format(Number(value || 0));
  }

  function toLocalInputDate(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function startOfMonth(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  }

  function endOfToday(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  }

  function startOfDay(dateStr) {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }

  function endOfDay(dateStr) {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T23:59:59.999`);
    return isNaN(d.getTime()) ? null : d;
  }

  function sanitizeFilePart(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "") || "local";
  }

  function getStoredCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem("currentUser") || "null");
    } catch {
      return null;
    }
  }

  function saveStoredCurrentUserPatch(patch) {
    try {
      const stored = getStoredCurrentUser();
      if (!stored) return;

      localStorage.setItem("currentUser", JSON.stringify({
        ...stored,
        ...patch
      }));
    } catch {
      // ignore
    }
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

  function normalizeLocalInfo(data = {}, idFallback = "") {
    return {
      id: String(idFallback || data.id_local || data.idLocal || data.localId || "").trim(),
      nombre: String(data.nombre || data.name || data.localName || data.nombre_local || "").trim(),
      numeroDocumento: String(
        data.numeroDocumento ||
        data.numero_documento ||
        data.documentNumber ||
        data.nDocumento ||
        data.n_documento ||
        ""
      ).trim(),
      ubicacion: String(
        data.ubicacion ||
        data.location ||
        data.direccion ||
        data.address ||
        data.sede ||
        ""
      ).trim(),
      contribuyente: String(
        data.contribuyente ||
        data.nombreContribuyente ||
        data.nombre_contribuyente ||
        data.razonSocial ||
        data.razon_social ||
        data.companyName ||
        data.company_name ||
        ""
      ).trim()
    };
  }

  function getLocalDisplayText() {
    const parts = [
      currentLocalInfo.nombre,
      currentLocalInfo.numeroDocumento,
      currentLocalInfo.ubicacion
    ].filter(Boolean);

    if (!parts.length) return "Sin local asignado";
    return parts.join(" · ");
  }

  function renderLocalBanner() {
    if (!heroNote) return;

    if (!currentLocalId) {
      heroNote.innerHTML = `
        <p class="hero-subtitle">
          No se pudo identificar el local del usuario autenticado.
        </p>
      `;
      return;
    }

    heroNote.innerHTML = `
      <p class="hero-subtitle" style="margin-top:0">
        <strong>Local:</strong> ${escapeHtml(currentLocalInfo.nombre || "—")}<br>
        <strong>Número de documento:</strong> ${escapeHtml(currentLocalInfo.numeroDocumento || "—")}<br>
        <strong>Contribuyente:</strong> ${escapeHtml(currentLocalInfo.contribuyente || "—")}<br>
        <strong>Ubicación:</strong> ${escapeHtml(currentLocalInfo.ubicacion || "—")}
      </p>
      <p class="hero-subtitle">
        La vista se filtra automáticamente por este local.
      </p>
    `;
  }

  function setDocumentTitle() {
    const localName = currentLocalInfo.nombre ? ` - ${currentLocalInfo.nombre}` : "";
    document.title = `Dashboard${localName}`;
  }

  function refreshLocalHeader() {
    renderLocalBanner();
    setDocumentTitle();
    updateRangeLabels();
  }

  async function loadEmployeeAndLocalContext(user) {
    currentUserInfo.uid = user.uid;
    currentUserInfo.email = user.email || "";
    currentUserInfo.name = "Usuario";
    currentUserInfo.role = "Empleado";
    currentLocalId = "";
    currentLocalInfo = {
      id: "",
      nombre: "",
      numeroDocumento: "",
      ubicacion: "",
      contribuyente: ""
    };

    const stored = getStoredCurrentUser();

    if (stored && stored.uid === user.uid) {
      currentUserInfo.name = stored.name || currentUserInfo.name;
      currentUserInfo.role = stored.role || currentUserInfo.role;

      if (stored.email) currentUserInfo.email = stored.email;
      if (stored.id_local) currentLocalId = String(stored.id_local).trim();

      if (
        stored.localNombre ||
        stored.localNumeroDocumento ||
        stored.localUbicacion ||
        stored.localContribuyente
      ) {
        currentLocalInfo = normalizeLocalInfo({
          nombre: stored.localNombre || "",
          numeroDocumento: stored.localNumeroDocumento || "",
          ubicacion: stored.localUbicacion || "",
          contribuyente: stored.localContribuyente || ""
        }, currentLocalId);
      }
    }

    let employeeData = null;

    try {
      const direct = await db.collection(EMPLOYEE_COLLECTION_NAME).doc(user.uid).get();
      if (direct.exists) {
        employeeData = direct.data() || {};
      }
    } catch (err) {
      console.warn("No se pudo leer el empleado por UID:", err);
    }

    if (!employeeData) {
      try {
        const byEmail = await db.collection(EMPLOYEE_COLLECTION_NAME)
          .where("email", "==", user.email)
          .limit(1)
          .get();

        if (!byEmail.empty) {
          employeeData = byEmail.docs[0].data() || {};
        }
      } catch (err) {
        console.warn("No se pudo leer el empleado por email:", err);
      }
    }

    if (employeeData) {
      currentUserInfo.name = employeeData.name || currentUserInfo.name;
      currentUserInfo.role = employeeData.position || employeeData.role || currentUserInfo.role;
      currentLocalId = String(
        employeeData.id_local ||
        employeeData.idLocal ||
        employeeData.localId ||
        currentLocalId ||
        ""
      ).trim();

      saveStoredCurrentUserPatch({
        uid: currentUserInfo.uid,
        email: currentUserInfo.email,
        name: currentUserInfo.name,
        role: currentUserInfo.role,
        id_local: currentLocalId || null
      });
    }

    if (!currentLocalId) {
      currentLocalInfo = {
        id: "",
        nombre: "",
        numeroDocumento: "",
        ubicacion: "",
        contribuyente: ""
      };
      refreshLocalHeader();
      throw new Error("El usuario autenticado no tiene un id_local asignado.");
    }

    let localData = null;

    try {
      const directLocal = await db.collection(LOCAL_COLLECTION_NAME).doc(currentLocalId).get();
      if (directLocal.exists) {
        localData = directLocal.data() || {};
      }
    } catch (err) {
      console.warn("No se pudo leer el local por documento directo:", err);
    }

    if (!localData) {
      try {
        const byField = await db.collection(LOCAL_COLLECTION_NAME)
          .where("id_local", "==", currentLocalId)
          .limit(1)
          .get();

        if (!byField.empty) {
          localData = byField.docs[0].data() || {};
        }
      } catch (err) {
        console.warn("No se pudo leer el local por id_local:", err);
      }
    }

    currentLocalInfo = normalizeLocalInfo(localData || {}, currentLocalId);

    saveStoredCurrentUserPatch({
      id_local: currentLocalId,
      localNombre: currentLocalInfo.nombre || "",
      localNumeroDocumento: currentLocalInfo.numeroDocumento || "",
      localUbicacion: currentLocalInfo.ubicacion || "",
      localContribuyente: currentLocalInfo.contribuyente || ""
    });

    refreshLocalHeader();
  }

  function getUnitsPerBox(product) {
    const v = numberOrZero(product && product.unitsPerBox);
    return v > 0 ? v : 1;
  }

  function getStockUnits(product) {
    const qty = numberOrZero(product && product.quantity);
    if (qty > 0) return qty;

    const boxes = numberOrZero(product && product.boxes);
    const upb = getUnitsPerBox(product);
    return boxes > 0 ? boxes * upb : 0;
  }

  function getStockBoxes(product) {
    const boxes = numberOrZero(product && product.boxes);
    if (boxes > 0) return boxes;

    const units = getStockUnits(product);
    const upb = getUnitsPerBox(product);
    return upb > 0 ? units / upb : 0;
  }

  function getDisplayDate(createdAt) {
    if (!createdAt) return "—";
    if (createdAt.seconds) return new Date(createdAt.seconds * 1000).toLocaleDateString("es-ES");
    const d = new Date(createdAt);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-ES");
  }

  function getDisplayTime(createdAt) {
    if (!createdAt) return "—";
    const d = createdAt.seconds ? new Date(createdAt.seconds * 1000) : new Date(createdAt);
    return isNaN(d.getTime())
      ? "—"
      : d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }

  function getTextFromProducts(products) {
    if (!Array.isArray(products) || !products.length) return "—";
    return products
      .map(p => `${p.name || "Producto"} x${numberOrZero(p.quantity || p.unitsTotal || 0)}`)
      .join(" | ");
  }

  function getProductUnitCost(product) {
    const upb = getUnitsPerBox(product);

    const lastCostPerUnit = numberOrZero(product && product.lastCostPerUnit);
    if (lastCostPerUnit > 0) return lastCostPerUnit;

    const lastCostPerBox = numberOrZero(product && product.lastCostPerBox);
    if (lastCostPerBox > 0 && upb > 0) return lastCostPerBox / upb;

    const price = numberOrZero(product && product.price);
    if (price > 0) return price * 0.7;

    return 0;
  }

  function getSaleMode(item) {
    return String(item && (item.mode || item.saleMode || item.saleType) || "unit").toLowerCase();
  }

  function getSoldUnitsFromSaleProduct(p) {
    if (!p || !p.productId) return 0;

    const unitsPerBox = numberOrZero(p.unitsPerBox) > 0 ? numberOrZero(p.unitsPerBox) : 1;
    const mode = getSaleMode(p);

    if (Number.isFinite(Number(p.unitsTotal)) && Number(p.unitsTotal) > 0) {
      return numberOrZero(p.unitsTotal);
    }

    if (mode === "box") {
      const boxes = numberOrZero(p.quantity || p.boxes || 0);
      if (boxes > 0) return boxes * unitsPerBox;
    }

    if (Number.isFinite(Number(p.boxes)) && Number(p.boxes) > 0) {
      return numberOrZero(p.boxes) * unitsPerBox;
    }

    if (Number.isFinite(Number(p.totalUnits)) && Number(p.totalUnits) > 0) {
      return numberOrZero(p.totalUnits);
    }

    return numberOrZero(p.quantity || 0);
  }

  function getSoldBoxesFromSaleProduct(p) {
    if (!p || !p.productId) return 0;

    const unitsPerBox = numberOrZero(p.unitsPerBox) > 0 ? numberOrZero(p.unitsPerBox) : 1;
    const mode = getSaleMode(p);

    if (Number.isFinite(Number(p.boxes)) && Number(p.boxes) > 0) {
      return numberOrZero(p.boxes);
    }

    if (Number.isFinite(Number(p.unitsTotal)) && Number(p.unitsTotal) > 0 && unitsPerBox > 1) {
      return numberOrZero(p.unitsTotal) / unitsPerBox;
    }

    if (mode === "box") {
      return numberOrZero(p.quantity || 0);
    }

    return 0;
  }

  function getMovementProductCode(m) {
    return String(
      m && (
        m.codigoProducto ||
        m.productCode ||
        m.sku ||
        m.code ||
        m.codigo ||
        ""
      )
    ).trim() || "—";
  }

  function getMovementDocumentNumber(m) {
    return String(m && (m.numeroDocumento || m.documentNumber || m.docNumber || "—")) || "—";
  }

  function getMovementSalePrice(m) {
    return numberOrZero(
      m && (
        m.precioVenta ??
        m.salePrice ??
        m.unitSalePrice ??
        m.priceSale ??
        m.price ??
        0
      )
    );
  }

  function getMovementUnitsSold(m) {
    return numberOrZero(
      m && (
        m.unidadesVendidas ??
        m.unitsSold ??
        m.soldUnits ??
        m.quantitySold ??
        m.qtySold ??
        0
      )
    );
  }

  function getMovementEntry(m) {
    return numberOrZero(m && (m.entrada ?? m.entry ?? m.unitsIn ?? 0));
  }

  function getMovementExit(m) {
    return numberOrZero(m && (m.salida ?? m.exit ?? m.unitsOut ?? 0));
  }

  function getMovementBalanceBefore(m) {
    return numberOrZero(m && (m.saldoAnterior ?? m.balanceBefore ?? m.previousBalance ?? 0));
  }

  function getMovementBalanceAfter(m) {
    return numberOrZero(m && (m.saldoActual ?? m.balance ?? m.saldo ?? m.currentBalance ?? 0));
  }

  function getMovementDetail(m) {
    return String(m && (m.detalle || m.detail || m.notes || "")) || "";
  }

  function getMovementTypeLabel(m) {
    const type = String(m && (m.tipoMovimiento || m.type || "")).toLowerCase();
    if (type === "entrada") return "Entrada";
    if (type === "salida") return "Salida";
    if (type === "ajuste") return "Ajuste";
    return "Movimiento";
  }

  function getTimestampMs(createdAt) {
    if (!createdAt) return 0;
    if (createdAt.seconds) return createdAt.seconds * 1000;

    const d = new Date(createdAt);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  function buildMovementSortKey(data = {}) {
    const createdAtMs = getTimestampMs(data.createdAt);

    const datePart =
      String(data.fecha || data.date || data.fechaMovimiento || "").trim();

    const timePart =
      String(data.hora || data.time || data.horaMovimiento || "").trim();

    if (createdAtMs > 0) return createdAtMs;

    if (datePart) {
      const parsed = new Date(`${datePart}T${timePart || "00:00:00"}`);
      if (!isNaN(parsed.getTime())) return parsed.getTime();
    }

    return 0;
  }

  function matchesCurrentLocal(data = {}) {
    if (!currentLocalId) return false;
    return getLocalFieldValue(data) === String(currentLocalId).trim();
  }

  function isWithinSelectedRange(createdAt) {
    if (!selectedRange.from || !selectedRange.to) return true;

    const date = createdAt?.seconds
      ? new Date(createdAt.seconds * 1000)
      : new Date(createdAt);

    if (isNaN(date.getTime())) return false;
    return date >= selectedRange.from && date <= selectedRange.to;
  }

  function sortByCreatedAtDesc(a, b) {
    const da = a && a.createdAt && a.createdAt.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
    const db = b && b.createdAt && b.createdAt.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
    return db - da;
  }

  function sortByCreatedAtAsc(a, b) {
    const da = a && typeof a.createdAtMs === "number" ? a.createdAtMs : getTimestampMs(a?.createdAt);
    const db = b && typeof b.createdAtMs === "number" ? b.createdAtMs : getTimestampMs(b?.createdAt);
    return da - db;
  }

  async function loadCollectionDocs(collectionName) {
    const snap = await db.collection(collectionName)
      .orderBy("createdAt", "desc")
      .get();

    const docs = [];
    snap.forEach(doc => docs.push({ id: doc.id, data: doc.data() || {} }));
    return docs;
  }

  function aggregateSalesFromDocs(salesDocs) {
    const unitsMap = {};
    const boxesMap = {};
    let totalSales = 0;
    let totalUnitsSold = 0;

    salesDocs.forEach(({ data: sale }) => {
      totalSales += numberOrZero(sale.total);

      const products = Array.isArray(sale.products) ? sale.products : [];
      products.forEach(p => {
        if (!p || !p.productId) return;

        const soldUnits = getSoldUnitsFromSaleProduct(p);
        const soldBoxes = getSoldBoxesFromSaleProduct(p);

        unitsMap[p.productId] = (unitsMap[p.productId] || 0) + soldUnits;
        boxesMap[p.productId] = (boxesMap[p.productId] || 0) + soldBoxes;
        totalUnitsSold += soldUnits;
      });
    });

    const distinctProductsSold = Object.keys(unitsMap).filter(productId => numberOrZero(unitsMap[productId]) > 0).length;

    return {
      unitsMap,
      boxesMap,
      totalSales,
      totalUnitsSold,
      distinctProductsSold
    };
  }

  function setDefaultRangeToMonth() {
    const today = new Date();
    const from = startOfMonth(today);
    const to = today;

    selectedRange = { from, to };

    if (rangeFrom) rangeFrom.value = toLocalInputDate(from);
    if (rangeTo) rangeTo.value = toLocalInputDate(to);

    updateRangeLabels();
  }

  function updateRangeLabels() {
    const fromText = selectedRange.from ? selectedRange.from.toLocaleDateString("es-ES") : "inicio";
    const toText = selectedRange.to ? selectedRange.to.toLocaleDateString("es-ES") : "hoy";
    const localText = currentLocalInfo.nombre ? ` del local ${currentLocalInfo.nombre}` : "";

    if (salesRangeLabel) salesRangeLabel.textContent = `Mostrando resultados${localText} desde ${fromText} hasta ${toText}.`;
    if (expenseRangeLabel) expenseRangeLabel.textContent = `Mostrando resultados${localText} desde ${fromText} hasta ${toText}.`;
    if (movementRangeLabel) movementRangeLabel.textContent = `Mostrando resultados${localText} desde ${fromText} hasta ${toText}.`;
  }

  async function loadDashboardForRange() {
    try {
      if (!currentLocalId) {
        throw new Error("No hay local asociado al usuario autenticado.");
      }

      const range = {
        from: rangeFrom?.value ? startOfDay(rangeFrom.value) : startOfMonth(new Date()),
        to: rangeTo?.value ? endOfDay(rangeTo.value) : endOfToday(new Date())
      };

      if (!range.from || !range.to) {
        Swal.fire("Fecha inválida", "Revisa el rango seleccionado.", "warning");
        return;
      }

      if (range.from > range.to) {
        Swal.fire("Rango inválido", "La fecha inicial no puede ser mayor que la fecha final.", "warning");
        return;
      }

      selectedRange = range;
      updateRangeLabels();

      const [salesDocsRaw, expensesDocsRaw, movementsDocsRaw, productsDocsRaw] = await Promise.all([
        loadCollectionDocs("ventas"),
        loadCollectionDocs("gastos"),
        loadCollectionDocs("stock_movimientos"),
        loadCollectionDocs("productos")
      ]);

      const salesDocs = salesDocsRaw.filter(item => matchesCurrentLocal(item.data) && isWithinSelectedRange(item.data.createdAt));
      const expensesDocs = expensesDocsRaw.filter(item => matchesCurrentLocal(item.data) && isWithinSelectedRange(item.data.createdAt));
      const movementsDocs = movementsDocsRaw.filter(item => matchesCurrentLocal(item.data) && isWithinSelectedRange(item.data.createdAt));
      const productsDocs = productsDocsRaw.filter(item => matchesCurrentLocal(item.data));

      productsMap = new Map();
      const products = [];

      productsDocs.forEach(({ id, data }) => {
        const p = { id, ...data };
        products.push(p);
        productsMap.set(id, p);
      });

      products.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

      const salesAgg = aggregateSalesFromDocs(salesDocs);

      cachedSales = salesDocs.map(({ id, data: sale }) => {
        const saleProducts = Array.isArray(sale.products) ? sale.products : [];

        return {
          id,
          customerName: sale.customerName || sale.userName || sale.userId || "—",
          products: getTextFromProducts(saleProducts),
          total: numberOrZero(sale.total),
          userName: sale.userName || "—",
          dateStr: getDisplayDate(sale.createdAt),
          timeStr: getDisplayTime(sale.createdAt),
          createdAtMs: getTimestampMs(sale.createdAt),
          rawText: [
            sale.customerName || "",
            sale.userName || "",
            getTextFromProducts(saleProducts),
            sale.total ?? ""
          ].join(" ")
        };
      }).sort((a, b) => sortByCreatedAtDesc({ createdAt: a.createdAtMs }, { createdAt: b.createdAtMs }));

      cachedExpenses = expensesDocs.map(({ id, data }) => ({
        id,
        concept: data.concept || "",
        category: data.category || "",
        amount: numberOrZero(data.amount),
        paymentMethod: data.paymentMethod || "",
        userName: data.userName || "—",
        notes: data.notes || "",
        dateStr: getDisplayDate(data.createdAt),
        timeStr: getDisplayTime(data.createdAt),
        createdAtMs: getTimestampMs(data.createdAt),
        rawText: [
          data.concept || "",
          data.category || "",
          data.paymentMethod || "",
          data.userName || "",
          data.notes || "",
          data.amount ?? ""
        ].join(" ")
      }));

      cachedMovements = movementsDocs.map(({ id, data }) => ({
        id,
        productCode: getMovementProductCode(data),
        productName: data.productName || data.name || "—",
        salePrice: getMovementSalePrice(data),
        unitsSold: getMovementUnitsSold(data),
        docNumber: getMovementDocumentNumber(data),
        entry: getMovementEntry(data),
        exit: getMovementExit(data),
        balanceBefore: getMovementBalanceBefore(data),
        balanceAfter: getMovementBalanceAfter(data),
        userName: data.userName || "—",
        detail: getMovementDetail(data),
        typeLabel: getMovementTypeLabel(data),
        createdAtMs: buildMovementSortKey(data),
        dateStr: getDisplayDate(data.createdAt),
        timeStr: getDisplayTime(data.createdAt),
        rawText: [
          getMovementProductCode(data),
          data.productName || data.name || "—",
          getMovementSalePrice(data),
          getMovementUnitsSold(data),
          getMovementDocumentNumber(data),
          getMovementEntry(data),
          getMovementExit(data),
          getMovementBalanceBefore(data),
          getMovementBalanceAfter(data),
          data.userName || "",
          getMovementDetail(data),
          getMovementTypeLabel(data)
        ].join(" ")
      })).sort((a, b) => sortByCreatedAtAsc(a, b));

      visibleSales = [...cachedSales];
      visibleExpenses = [...cachedExpenses];
      visibleMovements = [...cachedMovements];

      renderSalesTable(visibleSales);
      renderExpensesTable(visibleExpenses);
      renderMovementsTable(visibleMovements);

      if (salesCountLabel) salesCountLabel.textContent = `${visibleSales.length} registros`;
      if (expenseCountLabel) expenseCountLabel.textContent = `${visibleExpenses.length} registros`;
      if (movementCountLabel) movementCountLabel.textContent = `${visibleMovements.length} registros`;

      const totalExpenses = cachedExpenses.reduce((sum, item) => sum + numberOrZero(item.amount), 0);
      const totalSales = salesAgg.totalSales;
      const totalUnitsSold = salesAgg.totalUnitsSold;
      const distinctProductsSold = salesAgg.distinctProductsSold;

      recalcGlobalIndicators({
        totalSales,
        totalExpenses,
        totalUnitsSold,
        distinctProductsSold,
        salesAgg,
        products
      });

      applySearchFilter();
    } catch (err) {
      console.error("Error cargando dashboard por rango:", err);

      if (salesTableBody) salesTableBody.innerHTML = "<tr><td colspan='6'>Error cargando ventas.</td></tr>";
      if (expensesTableBody) expensesTableBody.innerHTML = "<tr><td colspan='8'>Error cargando gastos.</td></tr>";
      if (movementsTableBody) movementsTableBody.innerHTML = "<tr><td colspan='13'>Error cargando movimientos.</td></tr>";

      Swal.fire({
        icon: "error",
        title: "No se pudo cargar el dashboard",
        text: err.message || "Revisa el local asignado al usuario y las reglas de Firestore."
      });
    }
  }

  function renderSalesTable(rows) {
    if (!salesTableBody) return;

    salesTableBody.innerHTML = "";

    if (!rows.length) {
      salesTableBody.innerHTML = "<tr><td colspan='6'>No hay ventas en el rango seleccionado.</td></tr>";
      return;
    }

    rows.forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(row.customerName)}</td>
        <td>${escapeHtml(row.products)}</td>
        <td>${formatMoney(row.total)}</td>
        <td>${escapeHtml(row.userName)}</td>
        <td>${escapeHtml(row.dateStr)}</td>
        <td>${escapeHtml(row.timeStr)}</td>
      `;
      salesTableBody.appendChild(tr);
    });
  }

  function renderExpensesTable(rows) {
    if (!expensesTableBody) return;

    expensesTableBody.innerHTML = "";

    if (!rows.length) {
      expensesTableBody.innerHTML = "<tr><td colspan='8'>No hay gastos en el rango seleccionado.</td></tr>";
      return;
    }

    rows.forEach(item => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(item.concept || "—")}</td>
        <td>${escapeHtml(item.category || "—")}</td>
        <td>${formatMoney(item.amount || 0)}</td>
        <td>${escapeHtml(item.paymentMethod || "—")}</td>
        <td>${escapeHtml(item.userName || "—")}</td>
        <td>${escapeHtml(item.dateStr)}</td>
        <td>${escapeHtml(item.timeStr)}</td>
        <td>${escapeHtml(item.notes || "—")}</td>
      `;
      expensesTableBody.appendChild(tr);
    });
  }

  function renderMovementsTable(rows) {
    if (!movementsTableBody) return;

    movementsTableBody.innerHTML = "";

    if (!rows.length) {
      movementsTableBody.innerHTML = "<tr><td colspan='13'>No hay movimientos en el rango seleccionado.</td></tr>";
      return;
    }

    rows.forEach(item => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(item.dateStr)}</td>
        <td>${escapeHtml(item.timeStr)}</td>
        <td>${escapeHtml(item.productName || "—")}</td>
        <td>${escapeHtml(item.productCode || "—")}</td>
        <td>${escapeHtml(item.docNumber || "—")}</td>
        <td>${formatMoney(item.salePrice || 0)}</td>
        <td>${numberOrZero(item.unitsSold)}</td>
        <td>${numberOrZero(item.entry)}</td>
        <td>${numberOrZero(item.exit)}</td>
        <td>${numberOrZero(item.balanceBefore)}</td>
        <td>${numberOrZero(item.balanceAfter)}</td>
        <td>${escapeHtml(item.userName || "—")}</td>
        <td>${escapeHtml(item.detail || "—")}</td>
      `;
      movementsTableBody.appendChild(tr);
    });
  }

  function applySearchFilter() {
    const q = String(rangeSearch?.value || "").toLowerCase().trim();

    if (!q) {
      visibleSales = [...cachedSales];
      visibleExpenses = [...cachedExpenses];
      visibleMovements = [...cachedMovements];
    } else {
      visibleSales = cachedSales.filter(row => {
        const haystack = `${row.customerName} ${row.products} ${row.total} ${row.userName} ${row.dateStr} ${row.timeStr} ${row.rawText}`.toLowerCase();
        return haystack.includes(q);
      });

      visibleExpenses = cachedExpenses.filter(row => {
        const haystack = `${row.concept} ${row.category} ${row.amount} ${row.paymentMethod} ${row.userName} ${row.dateStr} ${row.timeStr} ${row.notes} ${row.rawText}`.toLowerCase();
        return haystack.includes(q);
      });

      visibleMovements = cachedMovements.filter(row => {
        const haystack = `${row.productCode} ${row.productName} ${row.salePrice} ${row.unitsSold} ${row.docNumber} ${row.entry} ${row.exit} ${row.balanceBefore} ${row.balanceAfter} ${row.userName} ${row.dateStr} ${row.timeStr} ${row.detail} ${row.typeLabel} ${row.rawText}`.toLowerCase();
        return haystack.includes(q);
      });
    }

    renderSalesTable(visibleSales);
    renderExpensesTable(visibleExpenses);
    renderMovementsTable(visibleMovements);

    if (salesCountLabel) salesCountLabel.textContent = `${visibleSales.length} registros`;
    if (expenseCountLabel) expenseCountLabel.textContent = `${visibleExpenses.length} registros`;
    if (movementCountLabel) movementCountLabel.textContent = `${visibleMovements.length} registros`;
  }

  function updateChartAndStats({ totalSales, totalExpenses, totalUnitsSold, distinctProductsSold, salesAgg, products }) {
    if (typeof appChartUtils !== "undefined" && typeof appChartUtils.drawSalesChart === "function") {
      appChartUtils.drawSalesChart("salesChart", totalSales, 0, totalExpenses);
    }

    if (statSalesEl) statSalesEl.textContent = formatMoney(totalSales);
    if (statExpensesEl) statExpensesEl.textContent = formatMoney(totalExpenses);
    if (statNetEl) statNetEl.textContent = formatMoney(totalSales - totalExpenses);
    if (statUnitsSoldEl) statUnitsSoldEl.textContent = numberOrZero(totalUnitsSold);
    if (statProductsSoldEl) statProductsSoldEl.textContent = numberOrZero(distinctProductsSold);

    renderGoalInfo(products, totalSales, totalExpenses);
    renderProfitStatus(products, totalSales, totalExpenses, salesAgg);
    renderLowStockAlerts(products, salesAgg);
  }

  function recalcGlobalIndicators(payload) {
    updateChartAndStats(payload);
  }

  function renderGoalInfo(products, totalSales, totalExpenses) {
    const goalInfo = document.getElementById("goalInfo");
    if (!goalInfo) return;

    let initialInventoryUnits = 0;
    let initialInventoryValue = 0;

    products.forEach(p => {
      const stockUnits = getStockUnits(p);
      const price = numberOrZero(p.price);

      initialInventoryUnits += stockUnits;
      initialInventoryValue += stockUnits * price;
    });

    const monthlyGoal = Math.round(initialInventoryValue);
    const remaining = Math.max(0, monthlyGoal - totalSales);

    goalInfo.innerHTML = `
      <div class="info-card__title">Meta automática del período</div>
      <div class="info-card__amount">${formatMoney(monthlyGoal)}</div>
      <div class="info-card__meta">
        <span>Inventario actual: <strong>${initialInventoryUnits} unidades</strong></span>
        <span>Valor actual: <strong>${formatMoney(initialInventoryValue)}</strong></span>
        <span>Ventas: <strong>${formatMoney(totalSales)}</strong></span>
        <span>Gastos: <strong>${formatMoney(totalExpenses)}</strong></span>
        <span>Falta para meta: <strong>${formatMoney(remaining)}</strong></span>
      </div>
    `;
  }

  function renderProfitStatus(products, totalSales, totalExpenses, salesAgg) {
    const profitEl = document.getElementById("profitStatus");
    if (!profitEl) return;

    let estimatedCostOfSales = 0;

    Object.entries(salesAgg.unitsMap).forEach(([productId, unitsSold]) => {
      const product = productsMap.get(productId);
      const unitCost = getProductUnitCost(product);
      estimatedCostOfSales += numberOrZero(unitsSold) * unitCost;
    });

    const grossProfit = totalSales - estimatedCostOfSales;
    const netProfit = totalSales - totalExpenses;

    let tone = "success";
    let message = `Neto positivo del período: ${formatMoney(netProfit)}`;

    if (netProfit < 0) {
      tone = "danger";
      message = `Pérdida neta del período: ${formatMoney(netProfit)}`;
    } else if (netProfit < grossProfit * 0.4) {
      tone = "warning";
      message = `Neto por debajo de lo esperado: ${formatMoney(netProfit)}`;
    }

    profitEl.className = `info-card status-panel status-panel--${tone}`;
    profitEl.innerHTML = `
      <div class="status-panel__label">Utilidad del período</div>
      <div class="status-panel__value">${escapeHtml(message)}</div>
      <div class="small" style="margin-top:8px;">
        Costo estimado: <strong>${formatMoney(estimatedCostOfSales)}</strong> ·
        Bruto estimado: <strong>${formatMoney(grossProfit)}</strong> ·
        Neto: <strong>${formatMoney(netProfit)}</strong>
      </div>
    `;
  }

  function renderLowStockAlerts(products, salesAgg) {
    if (!lowStockPanel) return;

    const lowStock = [];

    products.forEach(p => {
      const stockUnits = getStockUnits(p);
      const stockBoxes = getStockBoxes(p);
      const soldUnitsMonth = numberOrZero(salesAgg.unitsMap[p.id]);
      let daysLeft = "-";

      if (soldUnitsMonth > 0) {
        const dailyRate = soldUnitsMonth / 30;
        daysLeft = dailyRate > 0 ? Math.floor(stockUnits / dailyRate) : "-";
      }

      if (stockUnits <= LOW_STOCK_THRESHOLD) {
        lowStock.push({
          name: p.name || "Sin nombre",
          stockUnits,
          stockBoxes,
          unitsPerBox: getUnitsPerBox(p),
          daysLeft
        });
      }
    });

    lowStock.sort((a, b) => a.stockUnits - b.stockUnits);

    if (statLowStockEl) statLowStockEl.textContent = lowStock.length;

    lowStockPanel.innerHTML = "";

    if (!lowStock.length) {
      lowStockPanel.innerHTML = "<div class='no-alerts'>No hay productos en stock crítico.</div>";
      return;
    }

    lowStock.slice(0, 10).forEach(item => {
      const el = document.createElement("div");
      el.className = "low-stock-item low-stock-item--rich";

      el.innerHTML = `
        <div class="low-stock-item__left">
          <strong>${escapeHtml(item.name)}</strong>
          <div class="low-stock-item__muted">Stock crítico detectado</div>
        </div>
        <div class="low-stock-item__right">
          <div><span>Stock</span><strong>${item.stockUnits}</strong></div>
          <div><span>Cajas</span><strong>${item.stockBoxes.toFixed(2)}</strong></div>
          <div><span>U/caja</span><strong>${item.unitsPerBox}</strong></div>
          <div><span>Se agota en</span><strong>${item.daysLeft} días</strong></div>
        </div>
      `;

      lowStockPanel.appendChild(el);
    });
  }

  function toCSVCell(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadCSV(filename, headers, rows) {
    const delimiter = ";";
    const csvLines = [
      headers.map(toCSVCell).join(delimiter),
      ...rows.map(row => row.map(toCSVCell).join(delimiter))
    ];

    const blob = new Blob(["\uFEFF" + csvLines.join("\n")], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportSalesCSV() {
    const source = visibleSales.length ? visibleSales : cachedSales;

    if (!source.length) {
      Swal.fire("Sin datos", "No hay ventas para exportar.", "info");
      return;
    }

    const headers = [
      "Local",
      "Número documento local",
      "Ubicación local",
      "Cliente",
      "Productos",
      "Total",
      "Usuario",
      "Fecha",
      "Hora"
    ];

    const rows = source.map(r => [
      currentLocalInfo.nombre || "",
      currentLocalInfo.numeroDocumento || "",
      currentLocalInfo.ubicacion || "",
      r.customerName,
      r.products,
      formatMoney(r.total),
      r.userName,
      r.dateStr,
      r.timeStr
    ]);

    const fromTag = rangeFrom?.value || "inicio";
    const toTag = rangeTo?.value || "fin";
    const localTag = sanitizeFilePart(currentLocalInfo.nombre || currentLocalInfo.id || "local");

    downloadCSV(`${localTag}_ventas_${fromTag}_a_${toTag}.csv`, headers, rows);
  }

  function exportExpensesCSV() {
    const source = visibleExpenses.length ? visibleExpenses : cachedExpenses;

    if (!source.length) {
      Swal.fire("Sin datos", "No hay gastos para exportar.", "info");
      return;
    }

    const headers = [
      "Local",
      "Número documento local",
      "Ubicación local",
      "Concepto",
      "Categoría",
      "Monto",
      "Método",
      "Usuario",
      "Fecha",
      "Hora",
      "Observación"
    ];

    const rows = source.map(item => [
      currentLocalInfo.nombre || "",
      currentLocalInfo.numeroDocumento || "",
      currentLocalInfo.ubicacion || "",
      item.concept || "",
      item.category || "",
      formatMoney(item.amount || 0),
      item.paymentMethod || "",
      item.userName || "",
      item.dateStr || "",
      item.timeStr || "",
      item.notes || ""
    ]);

    const fromTag = rangeFrom?.value || "inicio";
    const toTag = rangeTo?.value || "fin";
    const localTag = sanitizeFilePart(currentLocalInfo.nombre || currentLocalInfo.id || "local");

    downloadCSV(`${localTag}_gastos_${fromTag}_a_${toTag}.csv`, headers, rows);
  }

  function getMovementExportFileName(source) {
    const fromTag = rangeFrom?.value || "inicio";
    const toTag = rangeTo?.value || "fin";
    const localTag = sanitizeFilePart(currentLocalInfo.nombre || currentLocalInfo.id || "local");
    const companyDocTag = sanitizeFilePart(currentLocalInfo.numeroDocumento || "sin_documento");

    const first = source[0] || {};
    const codeTag = sanitizeFilePart(first.productCode || "codigo_producto");
    const nameTag = sanitizeFilePart(first.productName || "nombre_producto");

    return `${localTag}_${companyDocTag}_${codeTag}_${nameTag}_inventario_${fromTag}_a_${toTag}.csv`;
  }

  function exportMovementsCSV() {
    const source = visibleMovements.length ? visibleMovements : cachedMovements;

    if (!source.length) {
      Swal.fire("Sin datos", "No hay movimientos de inventario para exportar.", "info");
      return;
    }

    const first = source[0] || {};

    const reportHeaderRows = [
      ["Reporte de inventario"],
      ["Nombre del local", currentLocalInfo.nombre || ""],
      ["Nombre del contribuyente", currentLocalInfo.contribuyente || currentLocalInfo.nombre || ""],
      ["Número de documento de la empresa", currentLocalInfo.numeroDocumento || ""],
      ["Código de producto", first.productCode || ""],
      ["Nombre de producto", first.productName || ""],
      []
    ];

    const tableHeaders = [
      "Fecha",
      "Hora",
      "Producto",
      "Código producto",
      "Número documento",
      "Precio de venta",
      "Unidades vendidas",
      "Entrada",
      "Salida",
      "Saldo anterior",
      "Saldo actual",
      "Usuario",
      "Detalle"
    ];

    const tableRows = source.map(item => [
      item.dateStr || "",
      item.timeStr || "",
      item.productName || "",
      item.productCode || "",
      item.docNumber || "",
      formatMoney(item.salePrice || 0),
      item.unitsSold || 0,
      item.entry || 0,
      item.exit || 0,
      item.balanceBefore || 0,
      item.balanceAfter || 0,
      item.userName || "",
      item.detail || ""
    ]);

    const csvLines = [
      ...reportHeaderRows.map(row => row.map(toCSVCell).join(";")),
      tableHeaders.map(toCSVCell).join(";"),
      ...tableRows.map(row => row.map(toCSVCell).join(";"))
    ];

    const blob = new Blob(["\uFEFF" + csvLines.join("\n")], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = getMovementExportFileName(source);
    a.click();
    URL.revokeObjectURL(url);
  }

  async function refreshEverything() {
    await loadDashboardForRange();
  }

  async function applyRange() {
    const fromStr = rangeFrom?.value || "";
    const toStr = rangeTo?.value || "";

    if (fromStr && toStr) {
      const from = new Date(`${fromStr}T00:00:00`);
      const to = new Date(`${toStr}T23:59:59.999`);

      if (from > to) {
        Swal.fire("Rango inválido", "La fecha inicial no puede ser mayor que la fecha final.", "warning");
        return;
      }
    }

    await refreshEverything();
  }

  async function resetRange() {
    setDefaultRangeToMonth();
    if (rangeSearch) rangeSearch.value = "";
    await refreshEverything();
  }

  function closeDay() {
    const now = new Date();

    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    Swal.fire({
      title: "¿Registrar cierre de caja?",
      html: "Se calcularán solo las ventas registradas hoy y del local actual.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, registrar",
      cancelButtonText: "Cancelar"
    }).then(async (res) => {
      if (!res.isConfirmed) return;

      try {
        if (!currentLocalId) {
          throw new Error("No hay local asociado al usuario autenticado.");
        }

        const snapshot = await db.collection("ventas")
          .orderBy("createdAt", "desc")
          .get();

        let total = 0;
        snapshot.forEach(doc => {
          const data = doc.data() || {};
          if (!matchesCurrentLocal(data)) return;
          if (!isWithinSelectedRange(data.createdAt)) return;
          const created = data.createdAt?.seconds
            ? new Date(data.createdAt.seconds * 1000)
            : new Date(data.createdAt);
          if (created < start || created > end) return;

          total += numberOrZero(data.total || 0);
        });

        await db.collection("cierres_caja").add({
          date: firebase.firestore.FieldValue.serverTimestamp(),
          dateString: toLocalInputDate(start),
          total,
          createdBy: auth.currentUser ? auth.currentUser.uid : null,
          type: "ventas",
          id_local: currentLocalId,
          localNombre: currentLocalInfo.nombre || "",
          localNumeroDocumento: currentLocalInfo.numeroDocumento || "",
          localUbicacion: currentLocalInfo.ubicacion || "",
          localContribuyente: currentLocalInfo.contribuyente || ""
        });

        Swal.fire({
          icon: "success",
          title: "Cierre registrado",
          text: `Total del día: ${formatMoney(total)}`
        });
      } catch (err) {
        console.error(err);
        Swal.fire("Error", err.message || "No se pudo registrar el cierre.", "error");
      }
    });
  }

  async function bootUser(user) {
    try {
      const storedUser = getStoredCurrentUser();

      let displayName = "Usuario";
      let role = "Empleado";

      if (storedUser && storedUser.uid === user.uid) {
        displayName = storedUser.name || "Usuario";
        role = storedUser.role || "Empleado";
      } else {
        const snapshot = await db.collection(EMPLOYEE_COLLECTION_NAME)
          .where("email", "==", user.email)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          displayName = data.name || "Usuario";
          role = data.position || data.role || "Empleado";

          localStorage.setItem("currentUser", JSON.stringify({
            uid: user.uid,
            name: displayName,
            email: user.email,
            phone: data.phone || "",
            role,
            id_local: data.id_local || data.idLocal || data.localId || ""
          }));
        }
      }

      currentUserInfo.name = displayName;
      currentUserInfo.role = role;

      greetingEls.forEach(el => {
        el.textContent = `Hola, ${displayName} (${role})`;
      });

      if (typeof renderNavigationForRole === "function") {
        renderNavigationForRole(role);
      }

      await loadEmployeeAndLocalContext(user);

      greetingEls.forEach(el => {
        el.textContent = `Hola, ${currentUserInfo.name} (${currentUserInfo.role})`;
      });

      refreshLocalHeader();
    } catch (err) {
      console.error("Error leyendo usuario o local:", err);
      throw err;
    }
  }

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }

    try {
      await bootUser(user);
      setDefaultRangeToMonth();
      await refreshEverything();
    } catch (err) {
      console.error("Error inicializando dashboard:", err);
      Swal.fire({
        icon: "error",
        title: "Sin local asignado",
        text: err.message || "No se pudo cargar el local del usuario."
      });
    }
  });

  logoutButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      auth.signOut()
        .then(() => {
          localStorage.removeItem("currentUser");
          window.location.href = "index.html";
        })
        .catch(() => {
          Swal.fire("Error", "No se pudo cerrar sesión.", "error");
        });
    });
  });

  if (btnGoInventory) {
    btnGoInventory.addEventListener("click", () => {
      window.location.href = "inventory.html";
    });
  }

  if (btnCloseDay) {
    btnCloseDay.addEventListener("click", closeDay);
  }

  if (btnApplyRange) {
    btnApplyRange.addEventListener("click", applyRange);
  }

  if (btnResetRange) {
    btnResetRange.addEventListener("click", resetRange);
  }

  if (btnExportSalesCSV) {
    btnExportSalesCSV.addEventListener("click", exportSalesCSV);
  }

  if (btnExportExpensesCSV) {
    btnExportExpensesCSV.addEventListener("click", exportExpensesCSV);
  }

  if (btnExportMovementsCSV) {
    btnExportMovementsCSV.addEventListener("click", exportMovementsCSV);
  }

  if (rangeSearch) {
    rangeSearch.addEventListener("input", applySearchFilter);
  }

  function injectDashboardStyles() {
    if (document.getElementById("dashboardExtraStyles")) return;

    const style = document.createElement("style");
    style.id = "dashboardExtraStyles";
    style.textContent = `
      .dashboard-hero {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: stretch;
        flex-wrap: wrap;
        margin-bottom: 20px;
      }

      .eyebrow {
        margin: 0 0 8px;
        text-transform: uppercase;
        letter-spacing: .08em;
        font-size: .8rem;
        font-weight: 800;
        color: #2563eb;
      }

      .hero-subtitle {
        margin: 8px 0 0;
        color: #6b7280;
      }

      .hero-note {
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        padding: 16px;
        box-shadow: 0 6px 20px rgba(15,23,42,.08);
        min-width: 280px;
        flex: 1;
      }

      .chart-card,
      .panel-card,
      .table-section,
      .info-card,
      .filter-panel {
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 16px;
        box-shadow: 0 8px 24px rgba(15,23,42,.08);
      }

      .chart-card {
        padding: 18px;
      }

      .dashboard-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.8fr) minmax(320px, 1fr);
        gap: 18px;
        margin-bottom: 24px;
      }

      .side-panel {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .panel-card {
        padding: 16px;
      }

      .panel-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .panel-actions button,
      .secondary-btn,
      .filter-actions button {
        border: 0;
        border-radius: 10px;
        padding: 10px 14px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .secondary-btn {
        background: #eef2ff;
        color: #1d4ed8;
      }

      .table-section {
        padding: 18px;
        margin-bottom: 20px;
      }

      .section-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 14px;
      }

      .section-header h2,
      .section-header h3 {
        margin: 0;
      }

      .section-header p {
        margin: 6px 0 0;
        color: #6b7280;
      }

      .section-header.compact {
        margin-bottom: 0;
      }

      .table-toolbar {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }

      .filter-panel {
        padding: 14px;
        margin-bottom: 18px;
      }

      .filter-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 12px;
      }

      .filter-field label {
        display: block;
        font-size: .9rem;
        font-weight: 700;
        margin-bottom: 6px;
        color: #374151;
      }

      .filter-field input {
        width: 100%;
      }

      .filter-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .loading,
      .no-alerts {
        color: #6b7280;
      }

      .status-panel__label {
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        opacity: 0.8;
        margin-bottom: 6px;
        font-weight: 700;
      }

      .status-panel__value {
        font-size: 1rem;
        font-weight: 800;
        line-height: 1.35;
      }

      .status-panel--danger {
        background: linear-gradient(135deg, #fee2e2, #fff);
        border-color: #fecaca;
        color: #991b1b;
      }

      .status-panel--warning {
        background: linear-gradient(135deg, #fef3c7, #fff);
        border-color: #fde68a;
        color: #92400e;
      }

      .status-panel--success {
        background: linear-gradient(135deg, #dcfce7, #fff);
        border-color: #bbf7d0;
        color: #166534;
      }

      .info-card__title {
        font-size: 0.85rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #6b7280;
        margin-bottom: 8px;
      }

      .info-card__amount {
        font-size: 1.6rem;
        font-weight: 900;
        color: #111827;
        margin-bottom: 10px;
      }

      .info-card__meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 12px;
        font-size: 0.92rem;
        color: #374151;
      }

      .low-stock-item--rich {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        align-items: flex-start;
        padding: 12px 14px;
        border: 1px solid #fde68a;
        border-radius: 12px;
        background: linear-gradient(135deg, #fff, #fffbeb);
        margin-bottom: 10px;
      }

      .low-stock-item__left {
        min-width: 0;
      }

      .low-stock-item__left strong {
        display: block;
        font-size: 0.98rem;
        color: #111827;
        margin-bottom: 4px;
      }

      .low-stock-item__muted {
        font-size: 0.85rem;
        color: #6b7280;
      }

      .low-stock-item__right {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 12px;
        min-width: 180px;
        text-align: right;
      }

      .low-stock-item__right span {
        display: block;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #6b7280;
      }

      .low-stock-item__right strong {
        display: block;
        font-size: 0.95rem;
        color: #111827;
      }

      @media (max-width: 992px) {
        .dashboard-grid {
          grid-template-columns: 1fr;
        }

        .filter-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 768px) {
        .info-card__meta {
          grid-template-columns: 1fr;
        }

        .low-stock-item--rich {
          flex-direction: column;
        }

        .low-stock-item__right {
          width: 100%;
          min-width: 0;
          text-align: left;
          grid-template-columns: 1fr 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }
});