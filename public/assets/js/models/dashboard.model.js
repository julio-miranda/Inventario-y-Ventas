// assets/js/models/dashboard.model.js

"use strict";

const dashboardModel = Object.freeze({

  name:
    "dashboard",

  title:
    "Dashboard",

  page:
    "dashboard.html",

  public:
    false,

  requiresLocal:
    true,

  roles: [
    "Administrador",
    "Cajero",
    "Vendedor",
    "Bodega"
  ],

  collections: {

    sales:
      "ventas",

    expenses:
      "gastos",

    movements:
      "stock_movimientos",

    products:
      "productos",

    cashClose:
      "cierres_caja"

  },

  permissions: {

    canViewFinancialSummary: [
      "Administrador",
      "Cajero",
      "Vendedor",
      "Bodega"
    ],

    canCloseDay: [
      "Administrador",
      "Cajero"
    ],

    canExport: [
      "Administrador",
      "Cajero",
      "Vendedor",
      "Bodega"
    ]

  },

  constants: {

    LOW_STOCK_THRESHOLD:
      5

  }

});


export default dashboardModel;