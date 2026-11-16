import {
  EMPLOYEE_COLLECTION_NAME,
  LOCAL_COLLECTION_NAME,
  SUPPLIER_COLLECTION_NAME,
  LOGIN_ATTEMPTS_COLLECTION_NAME,
  SALES_COLLECTION_NAME,
  EXPENSES_COLLECTION_NAME,
  MOVEMENTS_COLLECTION_NAME,
  PRODUCTS_COLLECTION_NAME,
  CASH_CLOSE_COLLECTION_NAME
} from "../config/collections.js";

import { getCurrentPageFile } from "../utils/page.js";

export const SESSION_PRELOAD_COLLECTIONS = [
  { name: EMPLOYEE_COLLECTION_NAME, mode: "employee-role-aware" },
  { name: SUPPLIER_COLLECTION_NAME, mode: "local" },
  { name: PRODUCTS_COLLECTION_NAME, mode: "local" },
  { name: SALES_COLLECTION_NAME, mode: "local" },
  { name: EXPENSES_COLLECTION_NAME, mode: "local" },
  { name: MOVEMENTS_COLLECTION_NAME, mode: "local" },
  { name: CASH_CLOSE_COLLECTION_NAME, mode: "local" },
  { name: LOCAL_COLLECTION_NAME, mode: "developer-all" },
  { name: LOGIN_ATTEMPTS_COLLECTION_NAME, mode: "developer-all" }
];

/*
 * Login y rutas públicas no descargan colecciones de negocio.
 * Inventario solo precarga proveedores, productos y ventas del mes.
 * Movimientos y gastos se consultan bajo demanda.
 */
const SESSION_PAGE_COLLECTIONS = {
  "index.html": [],
  "login.html": [],
  "reset-password.html": [],
  "inventory.html": [
    SUPPLIER_COLLECTION_NAME,
    PRODUCTS_COLLECTION_NAME,
    SALES_COLLECTION_NAME
  ]
};

export function getSessionPreloadConfigs(options = {}) {
  const explicitNames = Array.isArray(options.collections)
    ? options.collections
    : null;

  const pageFile = String(
    options.pageFile || getCurrentPageFile()
  ).trim().toLowerCase();

  const selectedNames = explicitNames || (
    Object.prototype.hasOwnProperty.call(SESSION_PAGE_COLLECTIONS, pageFile)
      ? SESSION_PAGE_COLLECTIONS[pageFile]
      : SESSION_PRELOAD_COLLECTIONS.map(config => config.name)
  );

  const names = new Set(
    selectedNames
      .map(name => String(name || "").trim())
      .filter(Boolean)
  );

  return SESSION_PRELOAD_COLLECTIONS
    .filter(config => names.has(config.name))
    .map(config => {
      if (
        pageFile === "inventory.html" &&
        config.name === SALES_COLLECTION_NAME
      ) {
        return { ...config, mode: "local-current-month" };
      }
      return config;
    });
}
