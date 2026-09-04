// assets/js/models/reset-password.model.js

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
    name: "resetPassword",
    title: "Restablecer contrasena",
    page: "reset-password.html",
    public: true,
    requiresLocal: false,
    roles: [],
    collections: {},
    security: {
      requiredMode: "resetPassword",
      minPasswordLength: 6
    }
  });

  mvc.models.resetPassword =
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
