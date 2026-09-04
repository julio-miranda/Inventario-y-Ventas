// assets/js/models/proveedores.model.js

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
    name: "proveedores",
    title: "Proveedores",
    page: "proveedores.html",
    public: false,
    requiresLocal: true,
    roles: [
      "Administrador",
      "Bodega"
    ],
    collections: {
      providers:
        window.SUPPLIER_COLLECTION_NAME ||
        "proveedores",
      products:
        window.PRODUCTS_COLLECTION_NAME ||
        "productos"
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
      ]
    }
  });

  mvc.models.proveedores =
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
