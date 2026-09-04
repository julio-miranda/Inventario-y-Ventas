// assets/js/views/proveedores.view.js

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
    table: "#providersTable",
    addButton: "#btnAddProvider",
    totalCard: "#totalProvidersCard",
    searchInput: "#providersSearch"
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
      table:
        qs(selectors.table),
      addButton:
        qs(selectors.addButton),
      totalCard:
        qs(selectors.totalCard),
      searchInput:
        qs(selectors.searchInput)
    };
  }

  mvc.views.proveedores = Object.freeze({
    selectors,
    qs,
    qsa,
    escapeHtml,
    setText,
    setHtml,
    getElements
  });
})();
