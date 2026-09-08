// assets/js/views/proveedores.view.js

(function () {
  "use strict";

  /*
  
  * ============================================================
  * VIEW - PROVEEDORES
  * ============================================================
  *
  * Responsabilidad:
  *
  * * Acceso a elementos DOM.
  * * Utilidades para escapar HTML.
  * * Manipulación simple de texto/HTML.
  * * No contiene Firestore.
  * * No contiene autenticación.
  * * No contiene reglas de negocio.
  * * No registra controllers.
  *
  * El controller decide cuándo y cómo utilizar esta vista.
  * ============================================================
    */

  const mvc =
    window.InventoryMVC ||
    (window.InventoryMVC = {
      models: {},
      views: {},
      controllers: {}
    });

  mvc.models =
    mvc.models ||
    {};

  mvc.views =
    mvc.views ||
    {};

  mvc.controllers =
    mvc.controllers ||
    {};

  /*
  
  * ============================================================
  * SELECTORES
  * ============================================================
    */

  const selectors = Object.freeze({


    table:
      "#providersTable",

    tableBody:
      "#providersTable tbody",

    addButton:
      "#btnAddProvider",

    totalCard:
      "#totalProvidersCard",

    searchInput:
      "#providersSearch"


  });

  /*
  
  * ============================================================
  * DOM
  * ============================================================
    */

  function qs(
    selector,
    root = document
  ) {


    if (
      !selector
    ) {
      return null;
    }


    return root.querySelector(
      selector
    );


  }

  function qsa(
    selector,
    root = document
  ) {


    if (
      !selector
    ) {
      return [];
    }


    return Array.from(
      root.querySelectorAll(
        selector
      )
    );


  }

  function getElements() {


    return {

      table:
        qs(
          selectors.table
        ),

      tableBody:
        qs(
          selectors.tableBody
        ),

      addButton:
        qs(
          selectors.addButton
        ),

      totalCard:
        qs(
          selectors.totalCard
        ),

      searchInput:
        qs(
          selectors.searchInput
        )

    };


  }

  /*
  
  * ============================================================
  * HTML
  * ============================================================
    */

  function escapeHtml(
    value = ""
  ) {


    return String(
      value ?? ""
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

  function setText(
    selectorOrElement,
    value = ""
  ) {


    const element =
      typeof selectorOrElement ===
        "string"

        ? qs(
          selectorOrElement
        )

        : selectorOrElement;


    if (
      element
    ) {

      element.textContent =
        String(
          value ?? ""
        );

    }


  }

  function setHtml(
    selectorOrElement,
    html = ""
  ) {


    const element =
      typeof selectorOrElement ===
        "string"

        ? qs(
          selectorOrElement
        )

        : selectorOrElement;


    if (
      element
    ) {

      element.innerHTML =
        String(
          html ?? ""
        );

    }


  }

  function setValue(
    selectorOrElement,
    value = ""
  ) {


    const element =
      typeof selectorOrElement ===
        "string"

        ? qs(
          selectorOrElement
        )

        : selectorOrElement;


    if (
      element &&
      "value" in element
    ) {

      element.value =
        String(
          value ?? ""
        );

    }


  }

  function getValue(
    selectorOrElement
  ) {


    const element =
      typeof selectorOrElement ===
        "string"

        ? qs(
          selectorOrElement
        )

        : selectorOrElement;


    if (
      !element ||
      !("value" in element)
    ) {

      return "";

    }


    return String(
      element.value ?? ""
    ).trim();


  }

  function showElement(
    selectorOrElement
  ) {


    const element =
      typeof selectorOrElement ===
        "string"

        ? qs(
          selectorOrElement
        )

        : selectorOrElement;


    if (
      element
    ) {

      element.style.display =
        "";

    }


  }

  function hideElement(
    selectorOrElement
  ) {


    const element =
      typeof selectorOrElement ===
        "string"

        ? qs(
          selectorOrElement
        )

        : selectorOrElement;


    if (
      element
    ) {

      element.style.display =
        "none";

    }


  }

  function toggleElement(
    selectorOrElement,
    visible
  ) {


    if (
      visible
    ) {

      showElement(
        selectorOrElement
      );

    } else {

      hideElement(
        selectorOrElement
      );

    }


  }

  /*
  
  * ============================================================
  * DATA ATTRIBUTE
  * ============================================================
    */

  function getDataId(
    element,
    attribute = "id"
  ) {


    if (
      !element
    ) {

      return "";

    }


    const value =
      element.getAttribute(
        `data-${attribute}`
      );


    return String(
      value ?? ""
    ).trim();


  }

  /*
  
  * ============================================================
  * EXPORTACIÓN
  * ============================================================
    */

  mvc.views.proveedores = Object.freeze({


    selectors,

    qs,

    qsa,

    getElements,

    escapeHtml,

    setText,

    setHtml,

    setValue,

    getValue,

    showElement,

    hideElement,

    toggleElement,

    getDataId


  });

})();