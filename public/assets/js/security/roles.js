/*
 * ============================================================
 * ROLES
 * ============================================================
 */

export const normalizeRole = (
  role = ""
) =>
  String(role)
    .trim()
    .toLowerCase();


export function getCanonicalRole(
  role = ""
) {

  const r =
    normalizeRole(
      role
    );


  switch (r) {

    case "admin":
    case "administrador":

      return "Administrador";


    case "vendedor":

      return "Vendedor";


    case "cajero":

      return "Cajero";


    case "bodega":
    case "inventario":

      return "Bodega";


    case "desarrollador":
    case "developer":

      return "Desarrollador";


    default:

      return "";

  }

}


export function roleRequiresLocal(
  role = ""
) {

  return (
    getCanonicalRole(role) !==
    "Desarrollador"
  );

}


export function isDeveloperRole(
  role = ""
) {

  return (
    getCanonicalRole(role) ===
    "Desarrollador"
  );

}


/*
 * ============================================================
 * PERMISOS
 * ============================================================
 */

export function canManageExpensesForRole(
  role = ""
) {

  const canonical =
    getCanonicalRole(role);


  return [
    "Administrador",
    "Cajero",
    "Vendedor"
  ].includes(
    canonical
  );

}


export function canEditInventoryForRole(
  role = ""
) {

  const canonical =
    getCanonicalRole(role);


  return [
    "Administrador",
    "Bodega",
    "Desarrollador"
  ].includes(
    canonical
  );

}


export function canReduceStockForRole(
  role = ""
) {

  const canonical =
    getCanonicalRole(role);


  return [
    "Administrador",
    "Bodega",
    "Cajero",
    "Vendedor",
    "Desarrollador"
  ].includes(
    canonical
  );

}


export function canCreateSalesForRole(
  role = ""
) {

  const canonical =
    getCanonicalRole(role);


  return [
    "Administrador",
    "Cajero",
    "Vendedor"
  ].includes(
    canonical
  );

}


export function canManageOwnSaleForRole(
  role = ""
) {

  const canonical =
    getCanonicalRole(role);


  return [
    "Cajero",
    "Vendedor"
  ].includes(
    canonical
  );

}


export function canCreateStockMovementForRole(
  role = ""
) {

  const canonical =
    getCanonicalRole(role);


  return [
    "Administrador",
    "Bodega",
    "Cajero",
    "Vendedor",
    "Desarrollador"
  ].includes(
    canonical
  );

}


/*
 * ============================================================
 * NAVEGACIÓN POR ROL
 * ============================================================
 */

export const ROLE_NAV = {

  Administrador: [

    {
      label:
        "Inicio",

      href:
        "dashboard.html"
    },

    {
      label:
        "Inventario",

      href:
        "inventory.html"
    },

    {
      label:
        "Proveedores",

      href:
        "proveedores.html"
    },

    {
      label:
        "Ventas",

      href:
        "sales.html"
    },

    {
      label:
        "Gastos",

      href:
        "gastos.html"
    },

    {
      label:
        "Empleados",

      href:
        "employees.html"
    }

  ],


  Cajero: [

    {
      label:
        "Inicio",

      href:
        "dashboard.html"
    },

    {
      label:
        "Ventas",

      href:
        "sales.html"
    },

    {
      label:
        "Gastos",

      href:
        "gastos.html"
    }

  ],


  Vendedor: [

    {
      label:
        "Inicio",

      href:
        "dashboard.html"
    },

    {
      label:
        "Inventario",

      href:
        "inventory.html"
    },

    {
      label:
        "Ventas",

      href:
        "sales.html"
    },

    {
      label:
        "Gastos",

      href:
        "gastos.html"
    }

  ],


  Bodega: [

    {
      label:
        "Inicio",

      href:
        "dashboard.html"
    },

    {
      label:
        "Inventario",

      href:
        "inventory.html"
    },

    {
      label:
        "Proveedores",

      href:
        "proveedores.html"
    }

  ],


  Desarrollador: [

    {
      label:
        "Locales",

      href:
        "locales.html"
    }

  ]

};


export const ROLE_DEFAULT_PAGE = {

  Administrador:
    "dashboard.html",

  Cajero:
    "sales.html",

  Vendedor:
    "sales.html",

  Bodega:
    "inventory.html",

  Desarrollador:
    "locales.html"

};


export const ROLE_ALLOWED_PAGES = {

  Administrador: [

    "dashboard.html",
    "inventory.html",
    "proveedores.html",
    "sales.html",
    "gastos.html",
    "employees.html"

  ],


  Cajero: [

    "dashboard.html",
    "sales.html",
    "gastos.html"

  ],


  Vendedor: [

    "dashboard.html",
    "inventory.html",
    "sales.html",
    "gastos.html"

  ],


  Bodega: [

    "dashboard.html",
    "inventory.html",
    "proveedores.html"

  ],


  Desarrollador: [

    "locales.html"

  ]

};


export function getDefaultPageForRole(role = "") {
  const canonical = getCanonicalRole(role);
  return ROLE_DEFAULT_PAGE[canonical] || "dashboard.html";
}
