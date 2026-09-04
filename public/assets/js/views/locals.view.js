// assets/js/views/locals.view.js

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
    greetings: ".userGreeting",
    localsTableBody: "#localsTable tbody",
    usersTableBody: "#localUsersTable tbody",
    attemptsTableBody: "#loginAttemptsTable tbody",
    localFilter: "#localFilter",
    globalSearch: "#globalSearch",
    newLocalButton: "#btnNewLocal",
    newUserButton: "#btnNewUser",
    refreshButton: "#btnRefresh",
    selectedLocalCard: "#selectedLocalCard"
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
      greetings:
        qsa(selectors.greetings),
      localsTableBody:
        qs(selectors.localsTableBody),
      usersTableBody:
        qs(selectors.usersTableBody),
      attemptsTableBody:
        qs(selectors.attemptsTableBody),
      localFilter:
        qs(selectors.localFilter),
      globalSearch:
        qs(selectors.globalSearch),
      newLocalButton:
        qs(selectors.newLocalButton),
      newUserButton:
        qs(selectors.newUserButton),
      refreshButton:
        qs(selectors.refreshButton),
      selectedLocalCard:
        qs(selectors.selectedLocalCard)
    };
  }

  mvc.views.locals = Object.freeze({
    selectors,
    qs,
    qsa,
    escapeHtml,
    setText,
    setHtml,
    getElements
  });
})();
