// assets/js/views/gastos.view.js

(function () {
  "use strict";

  const mvc =
    window.InventoryMVC ||
    (window.InventoryMVC = {
      models: {},
      views: {},
      controllers: {}
    });

  mvc.views =
    mvc.views ||
    {};

  const selectors = Object.freeze({
    conceptInput: "#expenseConcept",
    categoryInput: "#expenseCategory",
    amountInput: "#expenseAmount",
    paymentInput: "#expensePayment",
    dateInput: "#expenseDate",
    notesInput: "#expenseNotes",
    filterDateInput: "#expenseFilterDate",
    addButton: "#btnAddExpense",
    clearButton: "#btnClearExpenseForm",
    tableBody: "#expensesTable tbody",
    summarySales: "#summarySales",
    summaryExpenses: "#summaryExpenses",
    summaryNet: "#summaryNet"
  });

  function qs(
    selector,
    root = document
  ) {
    return root.querySelector(
      selector
    );
  }

  function qsa(
    selector,
    root = document
  ) {
    return Array.from(
      root.querySelectorAll(
        selector
      )
    );
  }

  function escapeHtml(
    value = ""
  ) {
    return String(
      value ?? ""
    )
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setText(
    selectorOrElement,
    value = ""
  ) {
    const element =
      typeof selectorOrElement ===
      "string"
        ? qs(selectorOrElement)
        : selectorOrElement;

    if (element) {
      element.textContent =
        value;
    }
  }

  function setHtml(
    selectorOrElement,
    html = ""
  ) {
    const element =
      typeof selectorOrElement ===
      "string"
        ? qs(selectorOrElement)
        : selectorOrElement;

    if (element) {
      element.innerHTML =
        html;
    }
  }

  function getElements() {
    return Object.fromEntries(
      Object.entries(
        selectors
      ).map(
        ([
          key,
          selector
        ]) => [
          key,
          qs(selector)
        ]
      )
    );
  }

  mvc.views.gastos = Object.freeze({
    selectors,
    qs,
    qsa,
    escapeHtml,
    setText,
    setHtml,
    getElements
  });
})();
