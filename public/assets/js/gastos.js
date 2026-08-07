// assets/js/gastos.js
// Depende de `db`, `auth`, `getTodayBounds`, `getDailyFinancialSummary`, `formatMoney` definidos en assets/js/app.js

const expenseConceptInput = document.getElementById("expenseConcept");
const expenseCategoryInput = document.getElementById("expenseCategory");
const expenseAmountInput = document.getElementById("expenseAmount");
const expensePaymentInput = document.getElementById("expensePayment");
const expenseNotesInput = document.getElementById("expenseNotes");
const btnAddExpense = document.getElementById("btnAddExpense");
const btnClearExpenseForm = document.getElementById("btnClearExpenseForm");
const expensesTableBody = document.querySelector("#expensesTable tbody");
const summarySalesEl = document.getElementById("summarySales");
const summaryExpensesEl = document.getElementById("summaryExpenses");
const summaryNetEl = document.getElementById("summaryNet");

let currentUserInfo = {
  uid: null,
  name: "Usuario",
  role: ""
};

let expensesCache = [];
let unsubscribeExpenses = null;
let unsubscribeSales = null;

let isAddingExpense = false;
let isDeletingExpense = false;

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function numberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatDateOnly(v) {
  if (!v) return "-";
  const d = v.seconds ? new Date(v.seconds * 1000) : new Date(v);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("es-ES");
}

function formatTimeOnly(v) {
  if (!v) return "-";
  const d = v.seconds ? new Date(v.seconds * 1000) : new Date(v);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function currency(value) {
  if (typeof formatMoney === "function") {
    return formatMoney(value);
  }

  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD"
  }).format(Number(value || 0));
}

/* Vendedor sí puede entrar al módulo.
   Administrador, Cajero y Vendedor pueden registrar gastos.
   La eliminación la valida Firestore por dueño o administrador. */
function canManageExpenses(role = "") {
  const r = String(role || "").trim().toLowerCase();
  return r === "administrador" || r === "admin" || r === "cajero" || r === "vendedor";
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("currentUser")) || null;
  } catch {
    return null;
  }
}

function setSummary(sales = 0, expenses = 0) {
  const net = Number(sales) - Number(expenses);

  if (summarySalesEl) summarySalesEl.textContent = currency(sales);
  if (summaryExpensesEl) summaryExpensesEl.textContent = currency(expenses);
  if (summaryNetEl) summaryNetEl.textContent = currency(net);
}

function clearForm() {
  if (expenseConceptInput) expenseConceptInput.value = "";
  if (expenseCategoryInput) expenseCategoryInput.value = "Transporte";
  if (expenseAmountInput) expenseAmountInput.value = "0";
  if (expensePaymentInput) expensePaymentInput.value = "Efectivo";
  if (expenseNotesInput) expenseNotesInput.value = "";
}

function setExpenseButtonsDisabled(disabled) {
  if (btnAddExpense) btnAddExpense.disabled = disabled;
  if (btnClearExpenseForm) btnClearExpenseForm.disabled = disabled;
}

function canDeleteExpenseItem(item) {
  const isAdmin = String(currentUserInfo.role || "").trim().toLowerCase() === "administrador" ||
    String(currentUserInfo.role || "").trim().toLowerCase() === "admin";

  const isOwner = item && item.userId && currentUserInfo.uid && String(item.userId) === String(currentUserInfo.uid);

  return isAdmin || isOwner;
}

function renderExpenses(list) {
  if (!expensesTableBody) return;

  expensesTableBody.innerHTML = "";

  if (!list.length) {
    expensesTableBody.innerHTML = "<tr><td colspan='8'>No hay gastos registrados hoy.</td></tr>";
    return;
  }

  list.forEach(item => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHtml(item.concept || "-")}</td>
      <td>${escapeHtml(item.category || "-")}</td>
      <td>${currency(item.amount || 0)}</td>
      <td>${escapeHtml(item.paymentMethod || "-")}</td>
      <td>${escapeHtml(item.userName || "-")}</td>
      <td>${escapeHtml(formatDateOnly(item.createdAt))}</td>
      <td>${escapeHtml(formatTimeOnly(item.createdAt))}</td>
      <td>
        ${canDeleteExpenseItem(item)
          ? `<button class="btn-delete" type="button" data-id="${item.id}">Eliminar</button>`
          : "-"}
      </td>
    `;

    expensesTableBody.appendChild(tr);
  });

  expensesTableBody.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (isDeletingExpense) return;
      const id = btn.getAttribute("data-id");
      await deleteExpense(id);
    });
  });
}

async function refreshDailySummary() {
  try {
    if (typeof getDailyFinancialSummary === "function") {
      const current = await getDailyFinancialSummary(new Date());
      setSummary(current.sales, current.expenses);
      return;
    }

    const { start, end } = getTodayBounds(new Date());

    const [salesSnap, expensesSnap] = await Promise.all([
      db.collection("ventas")
        .where("createdAt", ">=", start)
        .where("createdAt", "<=", end)
        .get(),
      db.collection("gastos")
        .where("createdAt", ">=", start)
        .where("createdAt", "<=", end)
        .get()
    ]);

    let sales = 0;
    let expenses = 0;

    salesSnap.forEach(doc => {
      sales += Number(doc.data().total || 0);
    });

    expensesSnap.forEach(doc => {
      expenses += Number(doc.data().amount || 0);
    });

    setSummary(sales, expenses);
  } catch (err) {
    console.error("Error cargando resumen diario:", err);
    setSummary(0, 0);
  }
}

function listenTodaySales() {
  const { start, end } = getTodayBounds(new Date());

  if (unsubscribeSales) {
    unsubscribeSales();
    unsubscribeSales = null;
  }

  unsubscribeSales = db.collection("ventas")
    .where("createdAt", ">=", start)
    .where("createdAt", "<=", end)
    .onSnapshot(snapshot => {
      let totalSales = 0;

      snapshot.forEach(doc => {
        totalSales += Number(doc.data().total || 0);
      });

      const totalExpenses = expensesCache.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      setSummary(totalSales, totalExpenses);
    }, err => {
      console.error("Error escuchando ventas del día:", err);
    });
}

function listenTodayExpenses() {
  const { start, end } = getTodayBounds(new Date());

  if (unsubscribeExpenses) {
    unsubscribeExpenses();
    unsubscribeExpenses = null;
  }

  unsubscribeExpenses = db.collection("gastos")
    .where("createdAt", ">=", start)
    .where("createdAt", "<=", end)
    .orderBy("createdAt", "desc")
    .onSnapshot(snapshot => {
      expensesCache = [];

      snapshot.forEach(doc => {
        expensesCache.push({
          id: doc.id,
          ...doc.data()
        });
      });

      renderExpenses(expensesCache);

      const totalExpenses = expensesCache.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      refreshDailySummary().catch(() => {
        const totalSales = 0;
        setSummary(totalSales, totalExpenses);
      });
    }, err => {
      console.error("Error escuchando gastos del día:", err);
      expensesCache = [];
      renderExpenses(expensesCache);
    });
}

async function addExpense() {
  if (isAddingExpense) return;

  if (!canManageExpenses(currentUserInfo.role)) {
    Swal.fire("No tienes permisos", "", "error");
    return;
  }

  const concept = String(expenseConceptInput?.value || "").trim();
  const category = String(expenseCategoryInput?.value || "").trim();
  const amount = Number(expenseAmountInput?.value || 0);
  const paymentMethod = String(expensePaymentInput?.value || "").trim();
  const notes = String(expenseNotesInput?.value || "").trim();

  if (!concept) {
    Swal.fire("Validación", "El concepto del gasto es obligatorio.", "warning");
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    Swal.fire("Validación", "Ingresa un monto válido mayor que cero.", "warning");
    return;
  }

  isAddingExpense = true;
  setExpenseButtonsDisabled(true);

  try {
    await db.collection("gastos").add({
      concept,
      category,
      amount,
      paymentMethod,
      notes,
      dayKey: getTodayBounds(new Date()).dayKey,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      userId: currentUserInfo.uid || null,
      userName: currentUserInfo.name || "Usuario"
    });

    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: "Gasto agregado",
      showConfirmButton: false,
      timer: 1400
    });

    clearForm();
    await refreshDailySummary();
  } catch (err) {
    console.error("Error agregando gasto:", err);
    Swal.fire("Error", err.message || "No se pudo guardar el gasto.", "error");
  } finally {
    isAddingExpense = false;
    setExpenseButtonsDisabled(false);
  }
}

async function deleteExpense(id) {
  if (isDeletingExpense) return;

  if (!canManageExpenses(currentUserInfo.role)) {
    Swal.fire("No tienes permisos", "No tienes permisos para eliminar gastos.", "error");
    return;
  }

  const target = expensesCache.find(item => item.id === id);
  const isAdmin = String(currentUserInfo.role || "").trim().toLowerCase() === "administrador" ||
    String(currentUserInfo.role || "").trim().toLowerCase() === "admin";
  const isOwner = target && target.userId && currentUserInfo.uid && String(target.userId) === String(currentUserInfo.uid);

  if (!isAdmin && !isOwner) {
    Swal.fire("No tienes permisos", "Solo el creador o el administrador pueden eliminar este gasto.", "error");
    return;
  }

  const result = await Swal.fire({
    title: "Eliminar gasto",
    text: "Esta acción no se puede deshacer.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Eliminar",
    cancelButtonText: "Cancelar"
  });

  if (!result.isConfirmed) return;

  isDeletingExpense = true;

  try {
    await db.collection("gastos").doc(id).delete();
    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: "Gasto eliminado",
      showConfirmButton: false,
      timer: 1400
    });
    await refreshDailySummary();
  } catch (err) {
    console.error("Error eliminando gasto:", err);
    Swal.fire("Error", err.message || "No se pudo eliminar el gasto.", "error");
  } finally {
    isDeletingExpense = false;
  }
}

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const stored = getStoredUser();

  if (stored) {
    currentUserInfo.uid = stored.uid || user.uid;
    currentUserInfo.name = stored.name || user.email || "Usuario";
    currentUserInfo.role = stored.role || "";
  } else {
    currentUserInfo.uid = user.uid;
    currentUserInfo.name = user.email || "Usuario";
    currentUserInfo.role = "";
  }

  // Aquí está el cambio importante: vendedor sí entra.
  if (!canManageExpenses(currentUserInfo.role)) {
    Swal.fire({
      icon: "error",
      title: "Acceso denegado",
      text: "No tienes permisos para administrar gastos."
    }).then(() => {
      window.location.href = "dashboard.html";
    });
    return;
  }

  if (typeof renderNavigationForRole === "function") {
    renderNavigationForRole(currentUserInfo.role);
  }

  const greetingEls = document.querySelectorAll(".userGreeting");
  greetingEls.forEach(el => {
    el.textContent = `Hola, ${currentUserInfo.name} (${currentUserInfo.role || "Usuario"})`;
  });

  await refreshDailySummary();
  listenTodaySales();
  listenTodayExpenses();
});

document.addEventListener("DOMContentLoaded", () => {
  if (btnAddExpense) {
    btnAddExpense.addEventListener("click", (e) => {
      e.preventDefault();
      addExpense();
    });
  }

  if (btnClearExpenseForm) {
    btnClearExpenseForm.addEventListener("click", (e) => {
      e.preventDefault();
      clearForm();
    });
  }

  const logoutBtn = document.getElementById("logoutButton");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      auth.signOut().then(() => {
        localStorage.removeItem("currentUser");
        window.location.href = "index.html";
      });
    });
  }

  const logoutBtnMobile = document.getElementById("logoutButtonMobile");
  if (logoutBtnMobile) {
    logoutBtnMobile.addEventListener("click", () => {
      auth.signOut().then(() => {
        localStorage.removeItem("currentUser");
        window.location.href = "index.html";
      });
    });
  }
});