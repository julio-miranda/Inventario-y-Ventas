// assets/js/models/locals.model.js

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
    name: "locals",
    title: "Locales",
    page: "locales.html",
    public: false,
    requiresLocal: false,
    roles: [
      "Desarrollador"
    ],
    collections: {
      locals:
        window.LOCAL_COLLECTION_NAME ||
        "local",
      employees:
        window.EMPLOYEE_COLLECTION_NAME ||
        "empleados",
      loginAttempts:
        window.LOGIN_ATTEMPTS_COLLECTION_NAME ||
        "login_attempts"
    },
    permissions: {
      canManageLocals: [
        "Desarrollador"
      ],
      canManageUsers: [
        "Desarrollador"
      ],
      canViewAudit: [
        "Desarrollador"
      ]
    }
  });

  mvc.models.locals =
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
