// assets/js/views/inventory.view.js

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
    tableBody: "#inventoryTable tbody",
    lowStockPanel: "#lowStockPanel",

    /*
     * IMPORTANTE:
     *
     * El HTML utiliza #searchInventory.
     * Se conserva también compatibilidad con otros IDs.
     */
    searchInput: "#searchInventory",

    addButton: "#btnAddProduct",
    greetings: ".userGreeting"
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
    return {
      tableBody:
        qs(selectors.tableBody),

      lowStockPanel:
        qs(selectors.lowStockPanel),

      searchInput:
        qs(selectors.searchInput),

      addButton:
        qs(selectors.addButton),

      greetings:
        qsa(selectors.greetings)
    };
  }

  mvc.views.inventory = Object.freeze({
    selectors,
    qs,
    qsa,
    escapeHtml,
    setText,
    setHtml,
    getElements
  });
})();