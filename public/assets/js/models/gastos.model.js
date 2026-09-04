// assets/js/models/gastos.model.js

(function () {
  "use strict";

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

  const model = Object.freeze({
    name: "gastos",
    title: "Gastos",
    page: "gastos.html",
    public: false,
    requiresLocal: true,
    roles: [
      "Administrador",
      "Cajero",
      "Vendedor"
    ],
    collections: {
      expenses:
        window.EXPENSES_COLLECTION_NAME ||
        "gastos",
      sales:
        window.SALES_COLLECTION_NAME ||
        "ventas"
    },
    permissions: {
      canCreate: [
        "Administrador",
        "Cajero",
        "Vendedor"
      ],
      canEdit: [
        "Administrador",
        "Cajero",
        "Vendedor"
      ],
      canDelete: [
        "Administrador"
      ]
    }
  });

  mvc.models.gastos =
    model;

  if (
    window.AppRouter &&
    typeof window.AppRouter.registerRoute ===
      "function"
  ) {
    window.AppRouter.registerRoute(
      model
    );
  }
})();
