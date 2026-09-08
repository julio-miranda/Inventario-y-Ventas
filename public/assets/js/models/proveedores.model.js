// assets/js/models/proveedores.model.js

(function () {
  "use strict";

  /*
  
  * ============================================================
  * MODEL - PROVEEDORES
  * ============================================================
  *
  * Responsabilidad:
  *
  * * Configuración del módulo.
  * * Nombre de la colección.
  * * Página.
  * * Roles autorizados.
  * * Permisos.
  *
  * No realiza consultas Firestore.
  * No manipula DOM.
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
  * COLECCIONES
  * ============================================================
    */

  const providersCollection =


    window.SUPPLIER_COLLECTION_NAME ||

    "proveedores";


  const productsCollection =


    window.PRODUCTS_COLLECTION_NAME ||

    "productos";


  /*
  
  * ============================================================
  * MODEL
  * ============================================================
    */

  const model = {


    name:
      "proveedores",

    title:
      "Proveedores",

    page:
      "proveedores.html",

    public:
      false,

    requiresLocal:
      true,

    roles: [

      "Administrador",

      "Bodega"

    ],

    collections: {

      providers:
        providersCollection,

      products:
        productsCollection

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

    },

    canCreate(
      role = ""
    ) {

      const canonical =
        typeof window.getCanonicalRole ===
          "function"

          ? window.getCanonicalRole(
            role
          )

          : String(
            role || ""
          )
            .trim()
            .toLowerCase();


      return this.permissions.canCreate
        .map(
          item =>
            typeof window.getCanonicalRole ===
              "function"

              ? window.getCanonicalRole(
                item
              )

              : item
        )
        .includes(
          canonical
        );

    },

    canEdit(
      role = ""
    ) {

      const canonical =
        typeof window.getCanonicalRole ===
          "function"

          ? window.getCanonicalRole(
            role
          )

          : String(
            role || ""
          )
            .trim()
            .toLowerCase();


      return this.permissions.canEdit
        .map(
          item =>
            typeof window.getCanonicalRole ===
              "function"

              ? window.getCanonicalRole(
                item
              )

              : item
        )
        .includes(
          canonical
        );

    },

    canDelete(
      role = ""
    ) {

      const canonical =
        typeof window.getCanonicalRole ===
          "function"

          ? window.getCanonicalRole(
            role
          )

          : String(
            role || ""
          )
            .trim()
            .toLowerCase();


      return this.permissions.canDelete
        .map(
          item =>
            typeof window.getCanonicalRole ===
              "function"

              ? window.getCanonicalRole(
                item
              )

              : item
        )
        .includes(
          canonical
        );

    }


  };

  /*
  
  * ============================================================
  * PUBLICAR MODEL
  * ============================================================
    */

  mvc.models.proveedores =
    Object.freeze(
      model
    );

  /*
  
  * ============================================================
  * REGISTRO DE RUTA
  * ============================================================
  *
  * Esto sí puede registrarse aquí porque corresponde a la
  * configuración del modelo/ruta.
  *
  * El controller NO se registra aquí.
  * ============================================================
    */

  if (


    window.AppRouter &&

    typeof window.AppRouter.registerRoute ===
    "function"


  ) {


    window.AppRouter.registerRoute({

      page:
        model.page,

      public:
        model.public,

      roles:
        model.roles,

      requiresLocal:
        model.requiresLocal

    });
  }

})();