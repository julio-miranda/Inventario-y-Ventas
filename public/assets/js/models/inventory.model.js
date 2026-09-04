// assets/js/models/inventory.model.js

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
    name: "inventory",

    title: "Inventario",

    page: "inventory.html",

    public: false,

    requiresLocal: true,

    roles: [
      "Administrador",
      "Vendedor",
      "Bodega"
    ],

    collections: {
      products:
        window.PRODUCTS_COLLECTION_NAME ||
        "productos",

      sales:
        window.SALES_COLLECTION_NAME ||
        "ventas",

      movements:
        window.MOVEMENTS_COLLECTION_NAME ||
        "stock_movimientos",

      providers:
        window.SUPPLIER_COLLECTION_NAME ||
        "proveedores",

      expenses:
        window.EXPENSES_COLLECTION_NAME ||
        "gastos"
    },

    permissions: {
      canCreate: [
        "Administrador",
        "Bodega"
      ],

      canEdit: [
        "Administrador",
        "Bodega"
      ],

      canDelete: [
        "Administrador"
      ],

      canView: [
        "Administrador",
        "Vendedor",
        "Bodega"
      ]
    }
  });

  mvc.models.inventory =
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