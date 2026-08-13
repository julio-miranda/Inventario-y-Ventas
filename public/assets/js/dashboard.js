// assets/js/dashboard.js
//
// DASHBOARD
//
// Arquitectura:
//
// - No usa onSnapshot().
// - No usa listeners realtime.
// - No consulta Firestore para leer ventas.
// - No consulta Firestore para leer gastos.
// - No consulta Firestore para leer stock_movimientos.
// - No consulta Firestore para leer productos.
//
// Los datos se obtienen de la caché de sesión creada por app.js.
//
// La primera vez que se inicia la sesión:
//
//     app.js -> Firestore -> sessionStorage
//
// Después:
//
//     dashboard.js -> sessionStorage
//
// Los filtros, búsquedas, estadísticas y exportaciones
// funcionan completamente en memoria.
//

document.addEventListener(
  "DOMContentLoaded",
  () => {
    "use strict";

    const DEBUG_DASHBOARD =
      true;

    const LOW_STOCK_THRESHOLD =
      5;

    const SALES_COLLECTION_NAME =
      "ventas";

    const EXPENSES_COLLECTION_NAME =
      "gastos";

    const MOVEMENTS_COLLECTION_NAME =
      "stock_movimientos";

    const PRODUCTS_COLLECTION_NAME =
      "productos";

    /*
     * ==========================================================
     * DOM
     * ==========================================================
     */

    const greetingEls =
      document.querySelectorAll(
        ".userGreeting"
      );

    const salesTableBody =
      document.querySelector(
        "#salesTable tbody"
      );

    const expensesTableBody =
      document.querySelector(
        "#expensesTable tbody"
      );

    const movementsTableBody =
      document.querySelector(
        "#movementsTable tbody"
      );

    const rangeFrom =
      document.getElementById(
        "rangeFrom"
      );

    const rangeTo =
      document.getElementById(
        "rangeTo"
      );

    const rangeSearch =
      document.getElementById(
        "rangeSearch"
      );

    const salesRangeLabel =
      document.getElementById(
        "salesRangeLabel"
      );

    const expenseRangeLabel =
      document.getElementById(
        "expenseRangeLabel"
      );

    const movementRangeLabel =
      document.getElementById(
        "movementRangeLabel"
      );

    const salesCountLabel =
      document.getElementById(
        "salesCountLabel"
      );

    const expenseCountLabel =
      document.getElementById(
        "expenseCountLabel"
      );

    const movementCountLabel =
      document.getElementById(
        "movementCountLabel"
      );

    const lowStockPanel =
      document.getElementById(
        "lowStockPanel"
      );

    const heroNote =
      document.querySelector(
        ".hero-note"
      );

    const btnGoInventory =
      document.getElementById(
        "btnGoInventory"
      );

    const btnCloseDay =
      document.getElementById(
        "btnCloseDay"
      );

    const btnExportSalesCSV =
      document.getElementById(
        "btnExportSalesCSV"
      );

    const btnExportExpensesCSV =
      document.getElementById(
        "btnExportExpensesCSV"
      );

    const btnExportMovementsExcel =
      document.getElementById(
        "btnExportMovementsExcel"
      );

    const btnApplyRange =
      document.getElementById(
        "btnApplyRange"
      );

    const btnResetRange =
      document.getElementById(
        "btnResetRange"
      );

    const statSalesEl =
      document.getElementById(
        "statSales"
      );

    const statExpensesEl =
      document.getElementById(
        "statExpenses"
      );

    const statNetEl =
      document.getElementById(
        "statNet"
      );

    const statUnitsSoldEl =
      document.getElementById(
        "statUnitsSold"
      );

    const statProductsSoldEl =
      document.getElementById(
        "statProductsSold"
      );

    const statLowStockEl =
      document.getElementById(
        "statLowStock"
      );

    /*
     * ==========================================================
     * CACHE RAW
     * ==========================================================
     */

    let rawSalesDocs =
      [];

    let rawExpensesDocs =
      [];

    let rawMovementsDocs =
      [];

    let rawProductsDocs =
      [];

    /*
     * ==========================================================
     * CACHE PROCESADA
     * ==========================================================
     */

    let cachedSales =
      [];

    let cachedExpenses =
      [];

    let cachedMovements =
      [];

    let visibleSales =
      [];

    let visibleExpenses =
      [];

    let visibleMovements =
      [];

    let productsMap =
      new Map();

    /*
     * ==========================================================
     * ESTADO
     * ==========================================================
     */

    let dashboardDataLoaded =
      false;

    let dashboardLoadingPromise =
      null;

    let initialized =
      false;

    let selectedRange = {
      from:
        null,

      to:
        null
    };

    let currentUserInfo = {
      uid:
        "",

      email:
        "",

      name:
        "Usuario",

      role:
        "Empleado"
    };

    let currentLocalId =
      "";

    let currentLocalInfo = {
      id:
        "",

      nombre:
        "",

      numeroDocumento:
        "",

      ubicacion:
        "",

      contribuyente:
        "",

      tipoDocumento:
        "",

      nit:
        "",

      nrc:
        ""
    };

    injectDashboardStyles();

    /*
     * ==========================================================
     * DEBUG
     * ==========================================================
     */

    function debugLog(
      ...args
    ) {
      if (
        DEBUG_DASHBOARD
      ) {
        console.log(
          "[Dashboard]",
          ...args
        );
      }
    }

    function debugWarn(
      ...args
    ) {
      if (
        DEBUG_DASHBOARD
      ) {
        console.warn(
          "[Dashboard]",
          ...args
        );
      }
    }

    function debugError(
      ...args
    ) {
      if (
        DEBUG_DASHBOARD
      ) {
        console.error(
          "[Dashboard]",
          ...args
        );
      }
    }

    /*
     * ==========================================================
     * UTILIDADES
     * ==========================================================
     */

    function numberOrZero(
      value
    ) {
      const n =
        Number(
          value
        );

      return Number.isFinite(
        n
      )
        ? n
        : 0;
    }

    function isPlainObject(
      value
    ) {
      return (
        !!value &&
        typeof value ===
        "object" &&
        !Array.isArray(
          value
        )
      );
    }

    function escapeHtml(
      value
    ) {
      return String(
        value ?? ""
      ).replace(
        /[&<>"'`=\/]/g,
        char =>
        ({
          "&":
            "&amp;",

          "<":
            "&lt;",

          ">":
            "&gt;",

          '"':
            "&quot;",

          "'":
            "&#39;",

          "/":
            "&#x2F;",

          "`":
            "&#96;",

          "=":
            "&#61;"
        }[
          char
        ])
      );
    }

    function formatMoney(
      value
    ) {
      if (
        typeof appChartUtils !==
        "undefined" &&
        typeof appChartUtils.formatCurrency ===
        "function"
      ) {
        return appChartUtils.formatCurrency(
          value
        );
      }

      return new Intl.NumberFormat(
        "es-ES",
        {
          style:
            "currency",

          currency:
            "USD"
        }
      ).format(
        Number(
          value || 0
        )
      );
    }

    function sanitizeFilePart(
      value
    ) {
      return String(
        value || ""
      )
        .trim()
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/gi,
          "_"
        )
        .replace(
          /^_+|_+$/g,
          ""
        ) ||
        "local";
    }

    function getTimestampMs(
      value
    ) {
      if (
        !value
      ) {
        return 0;
      }

      if (
        typeof value.toMillis ===
        "function"
      ) {
        return value.toMillis();
      }

      if (
        typeof value.toDate ===
        "function"
      ) {
        const date =
          value.toDate();

        return isNaN(
          date.getTime()
        )
          ? 0
          : date.getTime();
      }

      if (
        typeof value.seconds ===
        "number"
      ) {
        return (
          value.seconds *
          1000
        );
      }

      if (
        value instanceof
        Date
      ) {
        return value.getTime();
      }

      const date =
        new Date(
          value
        );

      return isNaN(
        date.getTime()
      )
        ? 0
        : date.getTime();
    }

    function getDisplayDate(
      value
    ) {
      const timestamp =
        getTimestampMs(
          value
        );

      if (
        !timestamp
      ) {
        return "—";
      }

      return new Date(
        timestamp
      ).toLocaleDateString(
        "es-ES"
      );
    }

    function getDisplayTime(
      value
    ) {
      const timestamp =
        getTimestampMs(
          value
        );

      if (
        !timestamp
      ) {
        return "—";
      }

      return new Date(
        timestamp
      ).toLocaleTimeString(
        "es-ES",
        {
          hour:
            "2-digit",

          minute:
            "2-digit"
        }
      );
    }

    function toLocalInputDate(
      date
    ) {
      const d =
        new Date(
          date
        );

      const y =
        d.getFullYear();

      const m =
        String(
          d.getMonth() + 1
        ).padStart(
          2,
          "0"
        );

      const day =
        String(
          d.getDate()
        ).padStart(
          2,
          "0"
        );

      return `${y}-${m}-${day}`;
    }

    function startOfMonth(
      date = new Date()
    ) {
      return new Date(
        date.getFullYear(),
        date.getMonth(),
        1,
        0,
        0,
        0,
        0
      );
    }

    function endOfToday(
      date = new Date()
    ) {
      return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        23,
        59,
        59,
        999
      );
    }

    function startOfDay(
      dateString
    ) {
      if (
        !dateString
      ) {
        return null;
      }

      const date =
        new Date(
          `${dateString}T00:00:00`
        );

      return isNaN(
        date.getTime()
      )
        ? null
        : date;
    }

    function endOfDay(
      dateString
    ) {
      if (
        !dateString
      ) {
        return null;
      }

      const date =
        new Date(
          `${dateString}T23:59:59.999`
        );

      return isNaN(
        date.getTime()
      )
        ? null
        : date;
    }

    /*
     * ==========================================================
     * CONTEXTO
     * ==========================================================
     */

    async function resolveDashboardContext(
      user
    ) {
      if (
        !user
      ) {
        throw new Error(
          "No existe un usuario autenticado."
        );
      }

      if (
        typeof window.getCurrentUserContext !==
        "function"
      ) {
        throw new Error(
          "app.js no expuso getCurrentUserContext()."
        );
      }

      const context =
        await window.getCurrentUserContext(
          user
        );

      if (
        !context
      ) {
        throw new Error(
          "No se pudo resolver el contexto del usuario."
        );
      }

      /*
       * Garantizar que la caché exista antes de
       * intentar leer sus colecciones.
       */
      if (
        typeof window.ensureSessionDataLoaded ===
        "function"
      ) {
        await window.ensureSessionDataLoaded(
          user
        );
      }

      currentUserInfo = {
        uid:
          context.uid ||
          user.uid,

        email:
          context.email ||
          user.email ||
          "",

        name:
          context.name ||
          user.displayName ||
          "Usuario",

        role:
          context.role ||
          "Empleado"
      };

      currentLocalId =
        String(
          context.id_local ||
          ""
        ).trim();

      currentLocalInfo = {
        id:
          currentLocalId,

        nombre:
          String(
            context.localNombre ||
            ""
          ).trim(),

        numeroDocumento:
          String(
            context.localNumeroDocumento ||
            ""
          ).trim(),

        ubicacion:
          String(
            context.localUbicacion ||
            ""
          ).trim(),

        contribuyente:
          String(
            context.localContribuyente ||
            ""
          ).trim(),

        tipoDocumento:
          String(
            context.localTipoDocumento ||
            ""
          ).trim(),

        nit:
          String(
            context.localNIT ||
            ""
          ).trim(),

        nrc:
          String(
            context.localNRC ||
            ""
          ).trim()
      };

      if (
        !currentLocalId
      ) {
        throw new Error(
          "El usuario autenticado no tiene un id_local asignado."
        );
      }

      greetingEls.forEach(
        element => {
          element.textContent =
            `Hola, ${currentUserInfo.name ||
            "Usuario"
            } (${currentUserInfo.role ||
            ""
            })`;
        }
      );

      if (
        typeof window.renderNavigationForRole ===
        "function"
      ) {
        window.renderNavigationForRole(
          currentUserInfo.role
        );
      }

      renderLocalBanner();

      updateDocumentTitle();

      return context;
    }

    function renderLocalBanner() {
      if (
        !heroNote
      ) {
        return;
      }

      heroNote.innerHTML = `
        <p
          class="hero-subtitle"
          style="margin-top:0"
        >
          <strong>Local:</strong>
          ${escapeHtml(
        currentLocalInfo.nombre ||
        "—"
      )}
          <br>

          <strong>Número de documento:</strong>
          ${escapeHtml(
        currentLocalInfo.numeroDocumento ||
        "—"
      )}
          <br>

          <strong>Contribuyente:</strong>
          ${escapeHtml(
        currentLocalInfo.contribuyente ||
        "—"
      )}
          <br>

          <strong>Tipo de documento:</strong>
          ${escapeHtml(
        currentLocalInfo.tipoDocumento ||
        "—"
      )}
          <br>

          <strong>NIT:</strong>
          ${escapeHtml(
        currentLocalInfo.nit ||
        "—"
      )}
          <br>

          <strong>NRC:</strong>
          ${escapeHtml(
        currentLocalInfo.nrc ||
        "—"
      )}
          <br>

          <strong>Ubicación:</strong>
          ${escapeHtml(
        currentLocalInfo.ubicacion ||
        "—"
      )}
        </p>

        <p class="hero-subtitle">
          Los datos de esta sesión se cargaron una sola vez.
          Los filtros y búsquedas trabajan en memoria.
        </p>
      `;
    }

    function updateDocumentTitle() {
      const suffix =
        currentLocalInfo.nombre
          ? ` - ${currentLocalInfo.nombre}`
          : "";

      document.title =
        `Dashboard${suffix}`;
    }

    /*
     * ==========================================================
     * PRODUCTOS
     * ==========================================================
     */

    function matchesCurrentLocal(
      data = {}
    ) {
      if (
        !currentLocalId
      ) {
        return false;
      }

      const documentLocalId =
        String(
          data.id_local ||
          data.idLocal ||
          data.localId ||
          data.idlocal ||
          ""
        ).trim();

      return (
        documentLocalId ===
        String(
          currentLocalId
        ).trim()
      );
    }

    function rebuildProductsMap() {
      productsMap =
        new Map();

      rawProductsDocs.forEach(
        ({
          id,
          data
        }) => {
          productsMap.set(
            id,
            {
              id,
              ...data
            }
          );
        }
      );
    }

    function getUnitsPerBox(
      product
    ) {
      const units =
        numberOrZero(
          product?.unitsPerBox
        );

      return units > 0
        ? units
        : 1;
    }

    function getStockUnits(
      product
    ) {
      if (
        !product
      ) {
        return 0;
      }

      const current =
        Number(
          product.stockCurrentUnits
        );

      if (
        Number.isFinite(
          current
        )
      ) {
        return Math.max(
          0,
          current
        );
      }

      const quantity =
        Number(
          product.quantity
        );

      if (
        Number.isFinite(
          quantity
        )
      ) {
        return Math.max(
          0,
          quantity
        );
      }

      const base =
        Number(
          product.stockBaseUnits
        );

      if (
        Number.isFinite(
          base
        )
      ) {
        return Math.max(
          0,
          base
        );
      }

      return 0;
    }

    function getStockBoxes(
      product
    ) {
      return (
        getStockUnits(
          product
        ) /
        getUnitsPerBox(
          product
        )
      );
    }

    function getProductUnitCost(
      product
    ) {
      if (
        !product
      ) {
        return 0;
      }

      const directUnitCosts = [
        product.unitCost,
        product.costoUnitario,
        product.costPerUnit,
        product.costoPorUnidad,
        product.lastCostPerUnit,
        product.ultimoCostoUnitario
      ];

      for (
        const candidate of
        directUnitCosts
      ) {
        const value =
          Number(
            candidate
          );

        if (
          Number.isFinite(
            value
          ) &&
          value > 0
        ) {
          return value;
        }
      }

      const boxCosts = [
        product.costPerBox,
        product.costoPorCaja,
        product.lastCostPerBox,
        product.ultimoCostoPorCaja
      ];

      for (
        const candidate of
        boxCosts
      ) {
        const value =
          Number(
            candidate
          );

        if (
          Number.isFinite(
            value
          ) &&
          value > 0
        ) {
          return (
            value /
            getUnitsPerBox(
              product
            )
          );
        }
      }

      return 0;
    }

    /*
     * ==========================================================
     * VENTAS
     * ==========================================================
     */

    function getSaleProducts(
      sale
    ) {
      return Array.isArray(
        sale?.products
      )
        ? sale.products
        : [];
    }

    function getSaleProductUnits(
      product
    ) {
      if (
        !product
      ) {
        return 0;
      }

      const explicitUnits =
        Number(
          product.unitsTotal
        );

      if (
        Number.isFinite(
          explicitUnits
        ) &&
        explicitUnits > 0
      ) {
        return explicitUnits;
      }

      const quantity =
        Number(
          product.quantity
        );

      if (
        Number.isFinite(
          quantity
        ) &&
        quantity > 0
      ) {
        const mode =
          String(
            product.mode ||
            product.saleMode ||
            product.saleType ||
            "unit"
          ).toLowerCase();

        if (
          mode === "box"
        ) {
          return (
            quantity *
            getUnitsPerBox(
              product
            )
          );
        }

        return quantity;
      }

      const boxes =
        Number(
          product.boxes
        );

      if (
        Number.isFinite(
          boxes
        ) &&
        boxes > 0
      ) {
        return (
          boxes *
          getUnitsPerBox(
            product
          )
        );
      }

      return 0;
    }

    function aggregateSales(
      source
    ) {
      const unitsMap =
        {};

      const boxesMap =
        {};

      let totalSales =
        0;

      let totalUnitsSold =
        0;

      source.forEach(
        ({
          data
        }) => {
          totalSales +=
            numberOrZero(
              data.total
            );

          getSaleProducts(
            data
          ).forEach(
            product => {
              const productId =
                String(
                  product.productId ||
                  product.productID ||
                  product.product_id ||
                  product.id ||
                  ""
                ).trim();

              if (
                !productId
              ) {
                return;
              }

              const units =
                getSaleProductUnits(
                  product
                );

              const unitsPerBox =
                getUnitsPerBox(
                  product
                );

              const mode =
                String(
                  product.mode ||
                  product.saleMode ||
                  product.saleType ||
                  ""
                ).toLowerCase();

              const boxes =
                mode === "box"
                  ? numberOrZero(
                    product.quantity ||
                    product.boxes
                  )
                  : (
                    unitsPerBox > 1
                      ? units /
                      unitsPerBox
                      : 0
                  );

              unitsMap[
                productId
              ] =
                (
                  unitsMap[
                  productId
                  ] || 0
                ) +
                units;

              boxesMap[
                productId
              ] =
                (
                  boxesMap[
                  productId
                  ] || 0
                ) +
                boxes;

              totalUnitsSold +=
                units;
            }
          );
        }
      );

      const distinctProductsSold =
        Object.keys(
          unitsMap
        ).filter(
          productId =>
            numberOrZero(
              unitsMap[
              productId
              ]
            ) > 0
        ).length;

      return {
        unitsMap,
        boxesMap,
        totalSales,
        totalUnitsSold,
        distinctProductsSold
      };
    }

    function getTextFromProducts(
      products
    ) {
      if (
        !Array.isArray(
          products
        ) ||
        !products.length
      ) {
        return "—";
      }

      return products
        .map(
          product => {
            const quantity =
              numberOrZero(
                product.quantity ||
                product.unitsTotal
              );

            return `${product.name ||
              product.productName ||
              "Producto"
              } x${quantity}`;
          }
        )
        .join(
          " | "
        );
    }

    /*
     * ==========================================================
     * MOVIMIENTOS
     * ==========================================================
     */

    function normalizeLookupValue(
      value
    ) {
      return String(
        value || ""
      )
        .trim()
        .toLowerCase();
    }

    function getMovementPrimaryProduct(
      movement
    ) {
      if (
        movement &&
        Array.isArray(
          movement.products
        ) &&
        movement.products.length
      ) {
        const candidate =
          movement.products[0];

        if (
          isPlainObject(
            candidate
          )
        ) {
          return candidate;
        }
      }

      const keys = [
        "product",
        "producto",
        "item",
        "detalleProducto"
      ];

      for (
        const key of
        keys
      ) {
        if (
          isPlainObject(
            movement?.[key]
          )
        ) {
          return movement[
            key
          ];
        }
      }

      return {};
    }

    function deepPickString(
      source,
      keys,
      defaultValue = "—",
      maxDepth = 3
    ) {
      const visited =
        new WeakSet();

      function walk(
        value,
        depth
      ) {
        if (
          !value ||
          depth < 0
        ) {
          return undefined;
        }

        if (
          typeof value ===
          "object"
        ) {
          if (
            visited.has(
              value
            )
          ) {
            return undefined;
          }

          visited.add(
            value
          );
        }

        if (
          Array.isArray(
            value
          )
        ) {
          for (
            const item of
            value
          ) {
            const found =
              walk(
                item,
                depth - 1
              );

            if (
              found !==
              undefined
            ) {
              return found;
            }
          }

          return undefined;
        }

        if (
          isPlainObject(
            value
          )
        ) {
          for (
            const key of
            keys
          ) {
            if (
              Object.prototype.hasOwnProperty.call(
                value,
                key
              )
            ) {
              const candidate =
                value[
                key
                ];

              if (
                candidate !==
                null &&
                candidate !==
                undefined &&
                String(
                  candidate
                ).trim()
              ) {
                return String(
                  candidate
                );
              }
            }
          }

          for (
            const key of
            Object.keys(
              value
            )
          ) {
            const found =
              walk(
                value[
                key
                ],
                depth - 1
              );

            if (
              found !==
              undefined
            ) {
              return found;
            }
          }
        }

        return undefined;
      }

      const result =
        walk(
          source,
          maxDepth
        );

      return (
        result !==
          undefined
          ? result
          : defaultValue
      );
    }

    function getMovementProductCode(
      movement
    ) {
      const product =
        getMovementPrimaryProduct(
          movement
        );

      return String(
        deepPickString(
          {
            direct:
              movement,

            product
          },
          [
            "codigoProducto",
            "productCode",
            "sku",
            "code",
            "codigo",
            "productId"
          ],
          ""
        )
      ).trim() ||
        "—";
    }

    function getMovementProductName(
      movement
    ) {
      const product =
        getMovementPrimaryProduct(
          movement
        );

      return String(
        deepPickString(
          {
            direct:
              movement,

            product
          },
          [
            "productName",
            "name",
            "nombre",
            "descripcion",
            "description"
          ],
          ""
        )
      ).trim() ||
        "—";
    }

    function getMovementSupplierName(
      movement
    ) {
      const supplier =
        movement?.proveedor ||
        movement?.supplier ||
        movement?.provider ||
        {};

      const supplierName =
        deepPickString(
          {
            direct:
              movement,

            proveedor:
              supplier,

            supplier,

            provider:
              movement?.provider ||
              {}
          },
          [
            "proveedorNombre",
            "nombreProveedor",
            "supplierName",
            "providerName",
            "nombre",
            "name",
            "razonSocial",
            "razon_social",
            "businessName",
            "business_name"
          ],
          ""
        );

      return String(
        supplierName ||
        ""
      ).trim() ||
        "—";
    }

    function getMovementDocumentNumber(
      movement
    ) {
      return String(
        movement &&
        (
          movement.numeroDocumento ||
          movement.documentNumber ||
          movement.docNumber ||
          "—"
        )
      );
    }

    function getMovementBookReference(
      movement
    ) {
      return String(
        movement &&
        (
          movement.libro ||
          movement.referenceBook ||
          movement.referenciaLibro ||
          movement.bookReference ||
          movement.libroReferencia ||
          ""
        )
      ).trim() ||
        "—";
    }

    function getMovementEntry(
      movement
    ) {
      return numberOrZero(
        movement &&
        (
          movement.entrada ??
          movement.entry ??
          movement.unitsIn ??
          0
        )
      );
    }

    function getMovementExit(
      movement
    ) {
      return numberOrZero(
        movement &&
        (
          movement.salida ??
          movement.exit ??
          movement.unitsOut ??
          0
        )
      );
    }

    function getMovementBalanceBefore(
      movement
    ) {
      return numberOrZero(
        movement &&
        (
          movement.saldoAnterior ??
          movement.balanceBefore ??
          movement.previousBalance ??
          0
        )
      );
    }

    function getMovementBalanceAfter(
      movement
    ) {
      return numberOrZero(
        movement &&
        (
          movement.saldoActual ??
          movement.balance ??
          movement.saldo ??
          movement.currentBalance ??
          0
        )
      );
    }

    function getMovementDetail(
      movement
    ) {
      return String(
        movement &&
        (
          movement.detalle ||
          movement.detail ||
          movement.notes ||
          ""
        )
      );
    }

    function getMovementUnitCost(
      movement,
      product
    ) {
      const movementCosts = [
        movement?.costoUnitario,
        movement?.unitCost,
        movement?.costPerUnit,
        movement?.costoPorUnidad
      ];

      for (
        const candidate of
        movementCosts
      ) {
        const value =
          Number(
            candidate
          );

        if (
          Number.isFinite(
            value
          ) &&
          value >= 0
        ) {
          return value;
        }
      }

      if (
        product
      ) {
        const productCosts = [
          product.unitCost,
          product.costoUnitario,
          product.costPerUnit,
          product.costoPorUnidad,
          product.lastCostPerUnit,
          product.ultimoCostoUnitario,
          product.cost,
          product.costo
        ];

        for (
          const candidate of
          productCosts
        ) {
          const value =
            Number(
              candidate
            );

          if (
            Number.isFinite(
              value
            ) &&
            value >= 0
          ) {
            return value;
          }
        }

        const unitsPerBox =
          getUnitsPerBox(
            product
          );

        const boxCosts = [
          product.costPerBox,
          product.costoPorCaja,
          product.lastCostPerBox,
          product.ultimoCostoPorCaja
        ];

        for (
          const candidate of
          boxCosts
        ) {
          const value =
            Number(
              candidate
            );

          if (
            Number.isFinite(
              value
            ) &&
            value >= 0
          ) {
            return (
              value /
              unitsPerBox
            );
          }
        }
      }

      return 0;
    }

    /*
     * ==========================================================
     * RANGO
     * ==========================================================
     */

    function isWithinSelectedRange(
      value
    ) {
      if (
        !selectedRange.from ||
        !selectedRange.to
      ) {
        return true;
      }

      const timestamp =
        getTimestampMs(
          value
        );

      if (
        !timestamp
      ) {
        return false;
      }

      const date =
        new Date(
          timestamp
        );

      return (
        date >=
        selectedRange.from &&
        date <=
        selectedRange.to
      );
    }

    function setDefaultRangeToMonth() {
      const today =
        new Date();

      selectedRange = {
        from:
          startOfMonth(
            today
          ),

        to:
          endOfToday(
            today
          )
      };

      if (
        rangeFrom
      ) {
        rangeFrom.value =
          toLocalInputDate(
            selectedRange.from
          );
      }

      if (
        rangeTo
      ) {
        rangeTo.value =
          toLocalInputDate(
            selectedRange.to
          );
      }

      updateRangeLabels();
    }

    function updateRangeLabels() {
      const fromText =
        selectedRange.from
          ? selectedRange.from.toLocaleDateString(
            "es-ES"
          )
          : "inicio";

      const toText =
        selectedRange.to
          ? selectedRange.to.toLocaleDateString(
            "es-ES"
          )
          : "hoy";

      const localText =
        currentLocalInfo.nombre
          ? ` del local ${currentLocalInfo.nombre}`
          : "";

      const text =
        `Mostrando resultados${localText} desde ${fromText} hasta ${toText}.`;

      if (
        salesRangeLabel
      ) {
        salesRangeLabel.textContent =
          text;
      }

      if (
        expenseRangeLabel
      ) {
        expenseRangeLabel.textContent =
          text;
      }

      if (
        movementRangeLabel
      ) {
        movementRangeLabel.textContent =
          text;
      }
    }

    /*
     * ==========================================================
     * LECTURAS DE SESIÓN
     * ==========================================================
     */

    function loadCollectionFromSession(
      collectionName
    ) {
      if (
        typeof window.getSessionCollection !==
        "function"
      ) {
        throw new Error(
          "app.js no expuso getSessionCollection()."
        );
      }

      const documents =
        window.getSessionCollection(
          collectionName
        );

      if (
        !Array.isArray(
          documents
        )
      ) {
        return [];
      }

      return documents
        .filter(
          ({
            data
          }) =>
            matchesCurrentLocal(
              data
            )
        )
        .map(
          ({
            id,
            data
          }) => ({
            id,
            data
          })
        )
        .sort(
          (
            a,
            b
          ) =>
            getTimestampMs(
              b.data.createdAt
            ) -
            getTimestampMs(
              a.data.createdAt
            )
        );
    }

    async function loadDashboardDataOnce() {
      if (
        dashboardDataLoaded
      ) {
        return;
      }

      if (
        dashboardLoadingPromise
      ) {
        return dashboardLoadingPromise;
      }

      if (
        !currentLocalId
      ) {
        throw new Error(
          "No hay un local asociado al usuario autenticado."
        );
      }

      dashboardLoadingPromise =
        (async () => {
          /*
           * Garantizar que la caché esté disponible.
           *
           * Normalmente esta función no genera lecturas porque
           * app.js ya preparó la sesión al iniciar sesión.
           */
          if (
            typeof window.ensureSessionDataLoaded ===
            "function"
          ) {
            await window.ensureSessionDataLoaded(
              auth.currentUser
            );
          }

          rawSalesDocs =
            loadCollectionFromSession(
              SALES_COLLECTION_NAME
            );

          rawExpensesDocs =
            loadCollectionFromSession(
              EXPENSES_COLLECTION_NAME
            );

          rawMovementsDocs =
            loadCollectionFromSession(
              MOVEMENTS_COLLECTION_NAME
            );

          rawProductsDocs =
            loadCollectionFromSession(
              PRODUCTS_COLLECTION_NAME
            );

          rebuildProductsMap();

          dashboardDataLoaded =
            true;

          debugLog(
            "Carga desde caché de sesión completada:",
            {
              ventas:
                rawSalesDocs.length,

              gastos:
                rawExpensesDocs.length,

              movimientos:
                rawMovementsDocs.length,

              productos:
                rawProductsDocs.length
            }
          );
        })()
          .catch(
            error => {
              dashboardDataLoaded =
                false;

              debugError(
                "Error leyendo la caché del dashboard:",
                error
              );

              throw error;
            }
          )
          .finally(
            () => {
              dashboardLoadingPromise =
                null;
            }
          );

      return dashboardLoadingPromise;
    }

    /*
     * ==========================================================
     * SALES CACHE
     * ==========================================================
     */

    function rebuildSalesCache() {
      cachedSales =
        rawSalesDocs
          .filter(
            ({
              data
            }) =>
              isWithinSelectedRange(
                data.createdAt
              )
          )
          .map(
            ({
              id,
              data
            }) => {
              const productText =
                getTextFromProducts(
                  getSaleProducts(
                    data
                  )
                );

              return {
                id,

                products:
                  productText,

                total:
                  numberOrZero(
                    data.total
                  ),

                userName:
                  data.userName ||
                  data.usuario ||
                  data.createdByName ||
                  "—",

                dateStr:
                  getDisplayDate(
                    data.createdAt
                  ),

                timeStr:
                  getDisplayTime(
                    data.createdAt
                  ),

                createdAtMs:
                  getTimestampMs(
                    data.createdAt
                  ),

                rawText:
                  [
                    productText,
                    data.total ||
                    "",
                    data.userName ||
                    ""
                  ].join(
                    " "
                  )
              };
            }
          )
          .sort(
            (
              a,
              b
            ) =>
              b.createdAtMs -
              a.createdAtMs
          );
    }

    /*
     * ==========================================================
     * EXPENSES CACHE
     * ==========================================================
     */

    function rebuildExpensesCache() {
      cachedExpenses =
        rawExpensesDocs
          .filter(
            ({
              data
            }) =>
              isWithinSelectedRange(
                data.createdAt
              )
          )
          .map(
            ({
              id,
              data
            }) => ({
              id,

              concept:
                data.concept ||
                data.concepto ||
                "",

              category:
                data.category ||
                data.categoria ||
                "",

              amount:
                numberOrZero(
                  data.amount
                ),

              paymentMethod:
                data.paymentMethod ||
                data.metodoPago ||
                "",

              userName:
                data.userName ||
                data.usuario ||
                data.createdByName ||
                "—",

              notes:
                data.notes ||
                data.observacion ||
                "",

              dateStr:
                getDisplayDate(
                  data.createdAt
                ),

              timeStr:
                getDisplayTime(
                  data.createdAt
                ),

              createdAtMs:
                getTimestampMs(
                  data.createdAt
                ),

              rawText:
                [
                  data.concept ||
                  "",
                  data.category ||
                  "",
                  data.paymentMethod ||
                  "",
                  data.userName ||
                  "",
                  data.notes ||
                  "",
                  data.amount ||
                  ""
                ].join(
                  " "
                )
            })
          )
          .sort(
            (
              a,
              b
            ) =>
              b.createdAtMs -
              a.createdAtMs
          );
    }

    /*
     * ==========================================================
     * MOVEMENTS CACHE
     * ==========================================================
     */

    function rebuildMovementsCache() {
      cachedMovements =
        rawMovementsDocs
          .filter(
            ({
              data
            }) =>
              isWithinSelectedRange(
                data.createdAt
              )
          )
          .map(
            ({
              id,
              data
            }) => {
              const productId =
                String(
                  data.productId ||
                  data.productID ||
                  data.product_id ||
                  ""
                ).trim();

              const product =
                productsMap.get(
                  productId
                ) ||
                {};

              const productName =
                String(
                  data.productName ||
                  data.name ||
                  data.nombre ||
                  product.name ||
                  "—"
                );

              const productCode =
                String(
                  data.codigoProducto ||
                  data.productCode ||
                  data.code ||
                  data.sku ||
                  product.codigoProducto ||
                  product.productCode ||
                  product.code ||
                  product.sku ||
                  "—"
                );

              const supplierName =
                getMovementSupplierName(
                  data
                );

              const docNumber =
                String(
                  data.numeroDocumento ||
                  data.documentNumber ||
                  data.docNumber ||
                  "—"
                );

              const bookReference =
                String(
                  data.referenciaLibro ||
                  data.referenceBook ||
                  data.bookReference ||
                  data.libro ||
                  "—"
                );

              const entry =
                numberOrZero(
                  data.entrada
                );

              const exit =
                numberOrZero(
                  data.salida
                );

              const balanceBefore =
                numberOrZero(
                  data.saldoAnterior
                );

              const balanceAfter =
                numberOrZero(
                  data.saldoActual
                );

              const unitCost =
                getMovementUnitCost(
                  data,
                  product
                );

              const inventoryValue =
                unitCost *
                balanceAfter;

              return {
                id,

                productCode,

                productName,

                supplierName,

                unitCost,

                inventoryValue,

                balanceBefore,

                balanceAfter,

                bookReference,

                docNumber,

                entry,

                exit,

                detail:
                  String(
                    data.detalle ||
                    data.detail ||
                    data.notes ||
                    ""
                  ),

                typeLabel:
                  String(
                    data.tipoMovimiento ||
                    ""
                  ),

                createdAtMs:
                  getTimestampMs(
                    data.createdAt
                  ),

                dateStr:
                  getDisplayDate(
                    data.createdAt
                  ),

                timeStr:
                  getDisplayTime(
                    data.createdAt
                  ),

                rawText:
                  [
                    productCode,
                    productName,
                    supplierName,
                    unitCost,
                    inventoryValue,
                    balanceBefore,
                    balanceAfter,
                    bookReference,
                    docNumber,
                    entry,
                    exit,
                    data.detalle ||
                    "",
                    data.tipoMovimiento ||
                    ""
                  ].join(
                    " "
                  )
              };
            }
          )
          .sort(
            (
              a,
              b
            ) => {
              const dateComparison =
                a.createdAtMs -
                b.createdAtMs;

              if (
                dateComparison !==
                0
              ) {
                return dateComparison;
              }

              return String(
                a.id ||
                ""
              ).localeCompare(
                String(
                  b.id ||
                  ""
                )
              );
            }
          );
    }

    /*
     * ==========================================================
     * RECONSTRUIR CACHE
     * ==========================================================
     */

    function rebuildCachesForRange() {
      rebuildProductsMap();

      rebuildSalesCache();

      rebuildExpensesCache();

      rebuildMovementsCache();

      visibleSales =
        [
          ...cachedSales
        ];

      visibleExpenses =
        [
          ...cachedExpenses
        ];

      visibleMovements =
        [
          ...cachedMovements
        ];
    }

    /*
     * ==========================================================
     * TABLA VENTAS
     * ==========================================================
     */

    function renderSalesTable(
      rows
    ) {
      if (
        !salesTableBody
      ) {
        return;
      }

      salesTableBody.innerHTML =
        "";

      if (
        !rows.length
      ) {
        salesTableBody.innerHTML =
          `
            <tr>
              <td colspan="5">
                No hay ventas en el rango seleccionado.
              </td>
            </tr>
          `;

        return;
      }

      rows.forEach(
        row => {
          const tr =
            document.createElement(
              "tr"
            );

          tr.innerHTML = `
            <td>
              ${escapeHtml(
            row.products
          )}
            </td>

            <td>
              ${formatMoney(
            row.total
          )}
            </td>

            <td>
              ${escapeHtml(
            row.userName
          )}
            </td>

            <td>
              ${escapeHtml(
            row.dateStr
          )}
            </td>

            <td>
              ${escapeHtml(
            row.timeStr
          )}
            </td>
          `;

          salesTableBody.appendChild(
            tr
          );
        }
      );
    }

    /*
     * ==========================================================
     * TABLA GASTOS
     * ==========================================================
     */

    function renderExpensesTable(
      rows
    ) {
      if (
        !expensesTableBody
      ) {
        return;
      }

      expensesTableBody.innerHTML =
        "";

      if (
        !rows.length
      ) {
        expensesTableBody.innerHTML =
          `
            <tr>
              <td colspan="8">
                No hay gastos en el rango seleccionado.
              </td>
            </tr>
          `;

        return;
      }

      rows.forEach(
        item => {
          const tr =
            document.createElement(
              "tr"
            );

          tr.innerHTML = `
            <td>
              ${escapeHtml(
            item.concept ||
            "—"
          )}
            </td>

            <td>
              ${escapeHtml(
            item.category ||
            "—"
          )}
            </td>

            <td>
              ${formatMoney(
            item.amount ||
            0
          )}
            </td>

            <td>
              ${escapeHtml(
            item.paymentMethod ||
            "—"
          )}
            </td>

            <td>
              ${escapeHtml(
            item.userName ||
            "—"
          )}
            </td>

            <td>
              ${escapeHtml(
            item.dateStr
          )}
            </td>

            <td>
              ${escapeHtml(
            item.timeStr
          )}
            </td>

            <td>
              ${escapeHtml(
            item.notes ||
            "—"
          )}
            </td>
          `;

          expensesTableBody.appendChild(
            tr
          );
        }
      );
    }

    /*
     * ==========================================================
     * TABLA MOVIMIENTOS
     * ==========================================================
     */

    function renderMovementsTable(
      rows
    ) {
      if (
        !movementsTableBody
      ) {
        return;
      }

      movementsTableBody.innerHTML =
        "";

      if (
        !rows.length
      ) {
        movementsTableBody.innerHTML =
          `
            <tr>
              <td colspan="13">
                No hay movimientos en el rango seleccionado.
              </td>
            </tr>
          `;

        return;
      }

      rows.forEach(
        item => {
          const tr =
            document.createElement(
              "tr"
            );

          tr.innerHTML = `
            <td>
              ${escapeHtml(
            item.dateStr
          )}
            </td>

            <td>
              ${escapeHtml(
            item.timeStr
          )}
            </td>

            <td>
              ${escapeHtml(
            item.productName ||
            "—"
          )}
            </td>

            <td>
              ${escapeHtml(
            item.productCode ||
            "—"
          )}
            </td>

            <td>
              ${escapeHtml(
            item.docNumber ||
            "—"
          )}
            </td>

            <td>
              ${escapeHtml(
            item.bookReference ||
            "—"
          )}
            </td>

            <td>
              ${formatMoney(
            item.unitCost ||
            0
          )}
            </td>

            <td>
              ${formatMoney(
            item.inventoryValue ||
            0
          )}
            </td>

            <td>
              ${numberOrZero(
            item.entry
          )}
            </td>

            <td>
              ${numberOrZero(
            item.exit
          )}
            </td>

            <td>
              ${numberOrZero(
            item.balanceBefore
          )}
            </td>

            <td>
              ${numberOrZero(
            item.balanceAfter
          )}
            </td>

            <td>
              ${escapeHtml(
            item.detail ||
            "—"
          )}
            </td>
          `;

          movementsTableBody.appendChild(
            tr
          );
        }
      );
    }

    function updateCounts() {
      if (
        salesCountLabel
      ) {
        salesCountLabel.textContent =
          `${visibleSales.length} registros`;
      }

      if (
        expenseCountLabel
      ) {
        expenseCountLabel.textContent =
          `${visibleExpenses.length} registros`;
      }

      if (
        movementCountLabel
      ) {
        movementCountLabel.textContent =
          `${visibleMovements.length} registros`;
      }
    }

    /*
     * ==========================================================
     * BÚSQUEDA
     * ==========================================================
     */

    function applySearchFilter() {
      const query =
        String(
          rangeSearch?.value ||
          ""
        )
          .trim()
          .toLowerCase();

      if (
        !query
      ) {
        visibleSales =
          [
            ...cachedSales
          ];

        visibleExpenses =
          [
            ...cachedExpenses
          ];

        visibleMovements =
          [
            ...cachedMovements
          ];
      } else {
        visibleSales =
          cachedSales.filter(
            item =>
              `${item.products} ${item.total} ${item.userName} ${item.dateStr} ${item.timeStr}`
                .toLowerCase()
                .includes(
                  query
                )
          );

        visibleExpenses =
          cachedExpenses.filter(
            item =>
              `${item.concept} ${item.category} ${item.amount} ${item.paymentMethod} ${item.userName} ${item.dateStr} ${item.timeStr} ${item.notes}`
                .toLowerCase()
                .includes(
                  query
                )
          );

        visibleMovements =
          cachedMovements.filter(
            item =>
              `${item.productCode} ${item.productName} ${item.supplierName} ${item.unitCost} ${item.inventoryValue} ${item.bookReference} ${item.docNumber} ${item.entry} ${item.exit} ${item.balanceBefore} ${item.balanceAfter} ${item.dateStr} ${item.timeStr} ${item.detail} ${item.typeLabel}`
                .toLowerCase()
                .includes(
                  query
                )
          );
      }

      renderSalesTable(
        visibleSales
      );

      renderExpensesTable(
        visibleExpenses
      );

      renderMovementsTable(
        visibleMovements
      );

      updateCounts();
    }

    /*
     * ==========================================================
     * UTILIDAD
     * ==========================================================
     */

    function renderProfitStatus(
      totalSales,
      totalExpenses,
      salesAgg
    ) {
      const profitEl =
        document.getElementById(
          "profitStatus"
        );

      if (
        !profitEl
      ) {
        return;
      }

      let estimatedCostOfSales =
        0;

      Object.entries(
        salesAgg.unitsMap
      ).forEach(
        ([
          productId,
          unitsSold
        ]) => {
          const product =
            productsMap.get(
              productId
            );

          estimatedCostOfSales +=
            numberOrZero(
              unitsSold
            ) *
            getProductUnitCost(
              product
            );
        }
      );

      const grossProfit =
        totalSales -
        estimatedCostOfSales;

      const netProfit =
        totalSales -
        totalExpenses;

      let tone =
        "success";

      let message =
        `Neto positivo del período: ${formatMoney(
          netProfit
        )}`;

      if (
        netProfit <
        0
      ) {
        tone =
          "danger";

        message =
          `Pérdida neta del período: ${formatMoney(
            netProfit
          )}`;
      } else if (
        netProfit <
        grossProfit *
        0.4
      ) {
        tone =
          "warning";

        message =
          `Neto por debajo de lo esperado: ${formatMoney(
            netProfit
          )}`;
      }

      profitEl.className =
        `info-card status-panel status-panel--${tone}`;

      profitEl.innerHTML = `
        <div class="status-panel__label">
          Utilidad del período
        </div>

        <div class="status-panel__value">
          ${escapeHtml(
        message
      )}
        </div>

        <div
          class="small"
          style="margin-top:8px;"
        >
          Costo estimado:
          <strong>
            ${formatMoney(
        estimatedCostOfSales
      )}
          </strong>

          ·

          Bruto estimado:
          <strong>
            ${formatMoney(
        grossProfit
      )}
          </strong>

          ·

          Neto:
          <strong>
            ${formatMoney(
        netProfit
      )}
          </strong>
        </div>
      `;
    }

    /*
     * ==========================================================
     * ALERTAS STOCK
     * ==========================================================
     */

    function renderLowStockAlerts(
      products,
      salesAgg
    ) {
      if (
        !lowStockPanel
      ) {
        return;
      }

      const lowStock =
        [];

      products.forEach(
        product => {
          const stockUnits =
            getStockUnits(
              product
            );

          const stockBoxes =
            getStockBoxes(
              product
            );

          const soldUnits =
            numberOrZero(
              salesAgg.unitsMap[
              product.id
              ]
            );

          let daysLeft =
            "-";

          if (
            soldUnits >
            0
          ) {
            const dailyRate =
              soldUnits /
              30;

            if (
              dailyRate >
              0
            ) {
              daysLeft =
                Math.floor(
                  stockUnits /
                  dailyRate
                );
            }
          }

          if (
            stockUnits <=
            LOW_STOCK_THRESHOLD
          ) {
            lowStock.push({
              name:
                product.name ||
                "Sin nombre",

              stockUnits,

              stockBoxes,

              unitsPerBox:
                getUnitsPerBox(
                  product
                ),

              daysLeft
            });
          }
        }
      );

      lowStock.sort(
        (
          a,
          b
        ) =>
          a.stockUnits -
          b.stockUnits
      );

      if (
        statLowStockEl
      ) {
        statLowStockEl.textContent =
          lowStock.length;
      }

      lowStockPanel.innerHTML =
        "";

      if (
        !lowStock.length
      ) {
        lowStockPanel.innerHTML =
          `
            <div class="no-alerts">
              No hay productos en stock crítico.
            </div>
          `;

        return;
      }

      lowStock
        .slice(
          0,
          10
        )
        .forEach(
          item => {
            const element =
              document.createElement(
                "div"
              );

            element.className =
              "low-stock-item low-stock-item--rich";

            element.innerHTML = `
              <div class="low-stock-item__left">

                <strong>
                  ${escapeHtml(
              item.name
            )}
                </strong>

                <div class="low-stock-item__muted">
                  Stock crítico detectado
                </div>

              </div>

              <div class="low-stock-item__right">

                <div>
                  <span>
                    Stock
                  </span>

                  <strong>
                    ${item.stockUnits}
                  </strong>
                </div>

                <div>
                  <span>
                    Cajas
                  </span>

                  <strong>
                    ${item.stockBoxes.toFixed(
              2
            )}
                  </strong>
                </div>

                <div>
                  <span>
                    U/caja
                  </span>

                  <strong>
                    ${item.unitsPerBox}
                  </strong>
                </div>

                <div>
                  <span>
                    Se agota en
                  </span>

                  <strong>
                    ${item.daysLeft ===
                "-"
                ? "-"
                : `${item.daysLeft} días`
              }
                  </strong>
                </div>

              </div>
            `;

            lowStockPanel.appendChild(
              element
            );
          }
        );
    }

    /*
     * ==========================================================
     * CHART + STATS
     * ==========================================================
     */

    function updateChartAndStats(
      {
        totalSales,
        totalExpenses,
        totalUnitsSold,
        distinctProductsSold,
        salesAgg,
        products
      }
    ) {
      if (
        typeof appChartUtils !==
        "undefined" &&
        typeof appChartUtils.drawSalesChart ===
        "function"
      ) {
        appChartUtils.drawSalesChart(
          "salesChart",
          totalSales,
          0,
          totalExpenses
        );
      }

      if (
        statSalesEl
      ) {
        statSalesEl.textContent =
          formatMoney(
            totalSales
          );
      }

      if (
        statExpensesEl
      ) {
        statExpensesEl.textContent =
          formatMoney(
            totalExpenses
          );
      }

      if (
        statNetEl
      ) {
        statNetEl.textContent =
          formatMoney(
            totalSales -
            totalExpenses
          );
      }

      if (
        statUnitsSoldEl
      ) {
        statUnitsSoldEl.textContent =
          numberOrZero(
            totalUnitsSold
          );
      }

      if (
        statProductsSoldEl
      ) {
        statProductsSoldEl.textContent =
          numberOrZero(
            distinctProductsSold
          );
      }

      renderProfitStatus(
        totalSales,
        totalExpenses,
        salesAgg
      );

      renderLowStockAlerts(
        products,
        salesAgg
      );
    }

    /*
     * ==========================================================
     * DASHBOARD
     * ==========================================================
     */

    async function loadDashboardForRange() {
      if (
        !currentLocalId
      ) {
        throw new Error(
          "No hay un local asociado al usuario autenticado."
        );
      }

      const from =
        rangeFrom?.value
          ? startOfDay(
            rangeFrom.value
          )
          : startOfMonth();

      const to =
        rangeTo?.value
          ? endOfDay(
            rangeTo.value
          )
          : endOfToday();

      if (
        !from ||
        !to
      ) {
        throw new Error(
          "El rango de fechas no es válido."
        );
      }

      if (
        from >
        to
      ) {
        throw new Error(
          "La fecha inicial no puede ser mayor que la fecha final."
        );
      }

      selectedRange = {
        from,
        to
      };

      updateRangeLabels();

      await loadDashboardDataOnce();

      rebuildCachesForRange();

      const salesInRange =
        rawSalesDocs.filter(
          ({
            data
          }) =>
            isWithinSelectedRange(
              data.createdAt
            )
        );

      const salesAgg =
        aggregateSales(
          salesInRange
        );

      const totalExpenses =
        cachedExpenses.reduce(
          (
            sum,
            item
          ) =>
            sum +
            numberOrZero(
              item.amount
            ),
          0
        );

      renderSalesTable(
        visibleSales
      );

      renderExpensesTable(
        visibleExpenses
      );

      renderMovementsTable(
        visibleMovements
      );

      updateCounts();

      updateChartAndStats({
        totalSales:
          salesAgg.totalSales,

        totalExpenses,

        totalUnitsSold:
          salesAgg.totalUnitsSold,

        distinctProductsSold:
          salesAgg.distinctProductsSold,

        salesAgg,

        products:
          Array.from(
            productsMap.values()
          )
      });

      applySearchFilter();
    }

    /*
     * ==========================================================
     * CSV
     * ==========================================================
     */

    function toCSVCell(
      value
    ) {
      return `"${String(
        value ?? ""
      ).replace(
        /"/g,
        '""'
      )}"`;
    }

    function downloadCSV(
      filename,
      headers,
      rows
    ) {
      const lines = [
        headers
          .map(
            toCSVCell
          )
          .join(";"),

        ...rows.map(
          row =>
            row
              .map(
                toCSVCell
              )
              .join(";")
        )
      ];

      const blob =
        new Blob(
          [
            "\uFEFF" +
            lines.join(
              "\n"
            )
          ],
          {
            type:
              "text/csv;charset=utf-8;"
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const link =
        document.createElement(
          "a"
        );

      link.href =
        url;

      link.download =
        filename;

      document.body.appendChild(
        link
      );

      link.click();

      document.body.removeChild(
        link
      );

      URL.revokeObjectURL(
        url
      );
    }

    function getExportRangeTags() {
      return {
        from:
          rangeFrom?.value ||
          "inicio",

        to:
          rangeTo?.value ||
          "fin"
      };
    }

    function exportSalesCSV() {
      const source =
        visibleSales.length
          ? visibleSales
          : cachedSales;

      if (
        !source.length
      ) {
        Swal.fire(
          "Sin datos",
          "No hay ventas para exportar.",
          "info"
        );

        return;
      }

      const headers = [
        "Local",
        "Número documento local",
        "Ubicación local",
        "Productos",
        "Total",
        "Usuario",
        "Fecha",
        "Hora"
      ];

      const rows =
        source.map(
          item => [
            currentLocalInfo.nombre ||
            "",

            currentLocalInfo.numeroDocumento ||
            "",

            currentLocalInfo.ubicacion ||
            "",

            item.products,

            formatMoney(
              item.total
            ),

            item.userName,

            item.dateStr,

            item.timeStr
          ]
        );

      const {
        from,
        to
      } =
        getExportRangeTags();

      const localTag =
        sanitizeFilePart(
          currentLocalInfo.nombre ||
          currentLocalInfo.id ||
          "local"
        );

      downloadCSV(
        `${localTag}_ventas_${from}_a_${to}.csv`,
        headers,
        rows
      );
    }

    function exportExpensesCSV() {
      const source =
        visibleExpenses.length
          ? visibleExpenses
          : cachedExpenses;

      if (
        !source.length
      ) {
        Swal.fire(
          "Sin datos",
          "No hay gastos para exportar.",
          "info"
        );

        return;
      }

      const headers = [
        "Local",
        "Número documento local",
        "Ubicación local",
        "Concepto",
        "Categoría",
        "Monto",
        "Método",
        "Usuario",
        "Fecha",
        "Hora",
        "Observación"
      ];

      const rows =
        source.map(
          item => [
            currentLocalInfo.nombre ||
            "",

            currentLocalInfo.numeroDocumento ||
            "",

            currentLocalInfo.ubicacion ||
            "",

            item.concept ||
            "",

            item.category ||
            "",

            formatMoney(
              item.amount ||
              0
            ),

            item.paymentMethod ||
            "",

            item.userName ||
            "",

            item.dateStr ||
            "",

            item.timeStr ||
            "",

            item.notes ||
            ""
          ]
        );

      const {
        from,
        to
      } =
        getExportRangeTags();

      const localTag =
        sanitizeFilePart(
          currentLocalInfo.nombre ||
          currentLocalInfo.id ||
          "local"
        );

      downloadCSV(
        `${localTag}_gastos_${from}_a_${to}.csv`,
        headers,
        rows
      );
    }

    /*
     * ==========================================================
     * EXCEL
     * ==========================================================
     */

    function formatPeriodForExcel() {
      const from =
        selectedRange.from
          ? selectedRange.from.toLocaleDateString(
            "es-ES"
          )
          : "—";

      const to =
        selectedRange.to
          ? selectedRange.to.toLocaleDateString(
            "es-ES"
          )
          : "—";

      return `${from} al ${to}`;
    }

    function exportMovementsExcel() {
      try {
        const source =
          (
            visibleMovements.length
              ? visibleMovements
              : cachedMovements
          )
            .slice()
            .sort(
              (
                a,
                b
              ) => {
                const dateComparison =
                  numberOrZero(
                    a.createdAtMs
                  ) -
                  numberOrZero(
                    b.createdAtMs
                  );

                if (
                  dateComparison !==
                  0
                ) {
                  return dateComparison;
                }

                return String(
                  a.id ||
                  ""
                ).localeCompare(
                  String(
                    b.id ||
                    ""
                  )
                );
              }
            );

        if (
          !source.length
        ) {
          Swal.fire(
            "Sin datos",
            "No hay movimientos de inventario para exportar.",
            "info"
          );

          return;
        }

        if (
          typeof XLSX ===
          "undefined"
        ) {
          Swal.fire(
            "Error",
            "La librería SheetJS no está cargada.",
            "error"
          );

          return;
        }

        const localName =
          currentLocalInfo.nombre ||
          "—";

        const contributor =
          currentLocalInfo.contribuyente ||
          "—";

        const documentType =
          currentLocalInfo.tipoDocumento ||
          "—";

        const nit =
          currentLocalInfo.nit ||
          "—";

        const nrc =
          currentLocalInfo.nrc ||
          "—";

        const documentNumber =
          currentLocalInfo.numeroDocumento ||
          "—";

        const location =
          currentLocalInfo.ubicacion ||
          "—";

        const period =
          formatPeriodForExcel();

        const headers = [
          "No.",
          "Fecha",
          "Producto",
          "Código",
          "Documento",
          "Libro",
          "Proveedor",
          "Costo",
          "Valor",
          "Entrada",
          "Salida",
          "Saldo ant.",
          "Saldo actual"
        ];

        const rows =
          source.map(
            (
              item,
              index
            ) => [
                index +
                1,

                item.dateStr ||
                "",

                item.productName ||
                "",

                item.productCode ||
                "",

                item.docNumber ||
                "",

                item.bookReference ||
                "",

                item.supplierName ||
                "—",

                numberOrZero(
                  item.unitCost
                ),

                numberOrZero(
                  item.inventoryValue
                ),

                numberOrZero(
                  item.entry
                ),

                numberOrZero(
                  item.exit
                ),

                numberOrZero(
                  item.balanceBefore
                ),

                numberOrZero(
                  item.balanceAfter
                )
              ]
          );

        const sheetData = [
          [
            "CONTROL DE INVENTARIO"
          ],

          [
            "Nombre del local",
            localName
          ],

          [
            "Nombre del contribuyente",
            contributor
          ],

          [
            "Tipo de documento",
            documentType,
            "",
            "",
            "NIT",
            nit,
            "",
            "",
            "NRC",
            nrc
          ],

          [
            "Número de documento",
            documentNumber,
            "",
            "",
            "Ubicación",
            location
          ],

          [
            "Período",
            period
          ],

          [],

          headers,

          ...rows
        ];

        const worksheet =
          XLSX.utils.aoa_to_sheet(
            sheetData
          );

        worksheet["!cols"] = [
          {
            wch:
              7
          },
          {
            wch:
              11
          },
          {
            wch:
              24
          },
          {
            wch:
              14
          },
          {
            wch:
              17
          },
          {
            wch:
              17
          },
          {
            wch:
              24
          },
          {
            wch:
              13
          },
          {
            wch:
              15
          },
          {
            wch:
              10
          },
          {
            wch:
              10
          },
          {
            wch:
              13
          },
          {
            wch:
              13
          }
        ];

        worksheet["!rows"] = [
          {
            hpt:
              24
          },
          {
            hpt:
              18
          },
          {
            hpt:
              18
          },
          {
            hpt:
              18
          },
          {
            hpt:
              18
          },
          {
            hpt:
              18
          },
          {
            hpt:
              7
          },
          {
            hpt:
              24
          }
        ];

        worksheet["!merges"] = [
          {
            s: {
              r:
                0,
              c:
                0
            },

            e: {
              r:
                0,
              c:
                12
            }
          },

          {
            s: {
              r:
                1,
              c:
                1
            },

            e: {
              r:
                1,
              c:
                12
            }
          },

          {
            s: {
              r:
                2,
              c:
                1
            },

            e: {
              r:
                2,
              c:
                12
            }
          },

          {
            s: {
              r:
                3,
              c:
                1
            },

            e: {
              r:
                3,
              c:
                3
            }
          },

          {
            s: {
              r:
                3,
              c:
                5
            },

            e: {
              r:
                3,
              c:
                7
            }
          },

          {
            s: {
              r:
                3,
              c:
                9
            },

            e: {
              r:
                3,
              c:
                12
            }
          },

          {
            s: {
              r:
                4,
              c:
                1
            },

            e: {
              r:
                4,
              c:
                3
            }
          },

          {
            s: {
              r:
                4,
              c:
                5
            },

            e: {
              r:
                4,
              c:
                12
            }
          },

          {
            s: {
              r:
                5,
              c:
                1
            },

            e: {
              r:
                5,
              c:
                12
            }
          }
        ];

        const firstDataRow =
          9;

        const lastDataRow =
          sheetData.length;

        for (
          let row =
            firstDataRow;

          row <=
          lastDataRow;

          row++
        ) {
          if (
            worksheet[
            `H${row}`
            ]
          ) {
            worksheet[
              `H${row}`
            ].z =
              "$#,##0.00";
          }

          if (
            worksheet[
            `I${row}`
            ]
          ) {
            worksheet[
              `I${row}`
            ].z =
              "$#,##0.00";
          }
        }

        worksheet[
          "!printArea"
        ] =
          `A1:M${lastDataRow}`;

        worksheet[
          "!pageSetup"
        ] = {
          paperSize:
            1,

          orientation:
            "landscape",

          fitToWidth:
            1,

          fitToHeight:
            1
        };

        worksheet[
          "!margins"
        ] = {
          left:
            0.20,

          right:
            0.20,

          top:
            0.35,

          bottom:
            0.35,

          header:
            0.15,

          footer:
            0.15
        };

        const workbook =
          XLSX.utils.book_new();

        workbook.Props = {
          Title:
            "Reporte de movimientos de inventario",

          Subject:
            "Movimientos de inventario",

          Author:
            currentUserInfo.name ||
            "Sistema de Gestión",

          Company:
            localName,

          CreatedDate:
            new Date()
        };

        XLSX.utils.book_append_sheet(
          workbook,
          worksheet,
          "Movimientos"
        );

        const {
          from,
          to
        } =
          getExportRangeTags();

        const localTag =
          sanitizeFilePart(
            currentLocalInfo.nombre ||
            currentLocalInfo.id ||
            "local"
          );

        const fileName =
          `${localTag}_movimientos_inventario_${from}_a_${to}.xlsx`;

        XLSX.writeFile(
          workbook,
          fileName,
          {
            bookType:
              "xlsx",

            compression:
              true
          }
        );

        Swal.fire(
          "Excel generado",
          "El reporte de movimientos fue generado correctamente.",
          "success"
        );
      } catch (
        error
      ) {
        debugError(
          "Error exportando movimientos a Excel:",
          error
        );

        Swal.fire(
          "Error",
          error.message ||
          "No se pudo generar el archivo Excel.",
          "error"
        );
      }
    }

    /*
     * ==========================================================
     * CIERRE DE CAJA
     * ==========================================================
     *
     * Esto sigue siendo una escritura en Firestore.
     * La lectura de ventas se realiza desde la caché.
     */

    async function closeDay() {
      const confirmation =
        await Swal.fire({
          title:
            "¿Registrar cierre de caja?",

          html:
            "Se calcularán las ventas registradas hoy y del local actual.",

          icon:
            "question",

          showCancelButton:
            true,

          confirmButtonText:
            "Sí, registrar",

          cancelButtonText:
            "Cancelar"
        });

      if (
        !confirmation.isConfirmed
      ) {
        return;
      }

      try {
        await loadDashboardDataOnce();

        const now =
          new Date();

        const start =
          new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            0,
            0,
            0,
            0
          );

        const end =
          new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );

        let total =
          0;

        rawSalesDocs.forEach(
          ({
            data
          }) => {
            const timestamp =
              getTimestampMs(
                data.createdAt
              );

            if (
              !timestamp
            ) {
              return;
            }

            const created =
              new Date(
                timestamp
              );

            if (
              created <
              start ||
              created >
              end
            ) {
              return;
            }

            total +=
              numberOrZero(
                data.total
              );
          }
        );

        const payload = {
          date:
            firebase.firestore
              .FieldValue
              .serverTimestamp(),

          dateString:
            toLocalInputDate(
              start
            ),

          total,

          createdBy:
            auth.currentUser
              ? auth.currentUser.uid
              : null,

          type:
            "ventas",

          id_local:
            currentLocalId,

          localNombre:
            currentLocalInfo.nombre ||
            "",

          localNumeroDocumento:
            currentLocalInfo.numeroDocumento ||
            "",

          localUbicacion:
            currentLocalInfo.ubicacion ||
            "",

          localContribuyente:
            currentLocalInfo.contribuyente ||
            "",

          localTipoDocumento:
            currentLocalInfo.tipoDocumento ||
            "",

          localNIT:
            currentLocalInfo.nit ||
            "",

          localNRC:
            currentLocalInfo.nrc ||
            ""
        };

        const ref =
          await db
            .collection(
              "cierres_caja"
            )
            .add(
              payload
            );

        /*
         * Mantener la colección de cierres de caja consistente
         * dentro de la caché durante esta sesión.
         */
        if (
          typeof window.upsertSessionDocument ===
          "function"
        ) {
          window.upsertSessionDocument(
            "cierres_caja",
            ref.id,
            {
              ...payload,

              date:
                Date.now()
            }
          );
        }

        await Swal.fire({
          icon:
            "success",

          title:
            "Cierre registrado",

          text:
            `Total del día: ${formatMoney(
              total
            )}`
        });
      } catch (
        error
      ) {
        debugError(
          "Error en cierre de caja:",
          error
        );

        Swal.fire(
          "Error",
          error.message ||
          "No se pudo registrar el cierre.",
          "error"
        );
      }
    }

    /*
     * ==========================================================
     * RANGO
     * ==========================================================
     */

    async function applyRange() {
      const fromValue =
        rangeFrom?.value ||
        "";

      const toValue =
        rangeTo?.value ||
        "";

      if (
        fromValue &&
        toValue
      ) {
        const from =
          startOfDay(
            fromValue
          );

        const to =
          endOfDay(
            toValue
          );

        if (
          from &&
          to &&
          from >
          to
        ) {
          await Swal.fire(
            "Rango inválido",
            "La fecha inicial no puede ser mayor que la fecha final.",
            "warning"
          );

          return;
        }
      }

      try {
        await loadDashboardForRange();
      } catch (
        error
      ) {
        debugError(
          "Error aplicando rango:",
          error
        );

        await Swal.fire(
          "Error",
          error.message ||
          "No se pudo aplicar el rango.",
          "error"
        );
      }
    }

    async function resetRange() {
      setDefaultRangeToMonth();

      if (
        rangeSearch
      ) {
        rangeSearch.value =
          "";
      }

      try {
        await loadDashboardForRange();
      } catch (
        error
      ) {
        debugError(
          "Error restaurando rango:",
          error
        );

        await Swal.fire(
          "Error",
          error.message ||
          "No se pudo restaurar el rango.",
          "error"
        );
      }
    }

    /*
     * ==========================================================
     * INICIALIZACIÓN
     * ==========================================================
     */

    async function initializeDashboard(
      user
    ) {
      if (
        initialized
      ) {
        return;
      }

      initialized =
        true;

      try {
        await resolveDashboardContext(
          user
        );

        setDefaultRangeToMonth();

        await loadDashboardForRange();
      } catch (
        error
      ) {
        initialized =
          false;

        debugError(
          "Error inicializando dashboard:",
          error
        );

        await Swal.fire({
          icon:
            "error",

          title:
            "No se pudo cargar el dashboard",

          text:
            error.message ||
            "No se pudo cargar la información del dashboard."
        });
      }
    }

    /*
     * ==========================================================
     * AUTH
     * ==========================================================
     */

    auth.onAuthStateChanged(
      async user => {
        if (
          !user
        ) {
          if (
            typeof window.clearSessionDataCache ===
            "function"
          ) {
            window.clearSessionDataCache();
          }

          window.location.href =
            "index.html";

          return;
        }

        await initializeDashboard(
          user
        );
      }
    );

    /*
     * ==========================================================
     * EVENTOS
     * ==========================================================
     */

    if (
      btnGoInventory
    ) {
      btnGoInventory.addEventListener(
        "click",
        () => {
          window.location.href =
            "inventory.html";
        }
      );
    }

    if (
      btnCloseDay
    ) {
      btnCloseDay.addEventListener(
        "click",
        closeDay
      );
    }

    if (
      btnApplyRange
    ) {
      btnApplyRange.addEventListener(
        "click",
        applyRange
      );
    }

    if (
      btnResetRange
    ) {
      btnResetRange.addEventListener(
        "click",
        resetRange
      );
    }

    if (
      btnExportSalesCSV
    ) {
      btnExportSalesCSV.addEventListener(
        "click",
        exportSalesCSV
      );
    }

    if (
      btnExportExpensesCSV
    ) {
      btnExportExpensesCSV.addEventListener(
        "click",
        exportExpensesCSV
      );
    }

    if (
      btnExportMovementsExcel
    ) {
      btnExportMovementsExcel.addEventListener(
        "click",
        exportMovementsExcel
      );
    }

    if (
      rangeSearch
    ) {
      rangeSearch.addEventListener(
        "input",
        applySearchFilter
      );
    }

    /*
     * ==========================================================
     * ESTILOS
     * ==========================================================
     */

    function injectDashboardStyles() {
      if (
        document.getElementById(
          "dashboardExtraStyles"
        )
      ) {
        return;
      }

      const style =
        document.createElement(
          "style"
        );

      style.id =
        "dashboardExtraStyles";

      style.textContent = `
        .dashboard-hero {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: stretch;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }

        .eyebrow {
          margin: 0 0 8px;
          text-transform: uppercase;
          letter-spacing: .08em;
          font-size: .8rem;
          font-weight: 800;
          color: #2563eb;
        }

        .hero-subtitle {
          margin: 8px 0 0;
          color: #6b7280;
        }

        .hero-note {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 16px;
          box-shadow: 0 6px 20px rgba(15,23,42,.08);
          min-width: 280px;
          flex: 1;
        }

        .chart-card,
        .panel-card,
        .table-section,
        .info-card,
        .filter-panel {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          box-shadow: 0 8px 24px rgba(15,23,42,.08);
        }

        .chart-card {
          padding: 18px;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.8fr) minmax(320px, 1fr);
          gap: 18px;
          margin-bottom: 24px;
        }

        .side-panel {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .panel-card {
          padding: 16px;
        }

        .panel-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .panel-actions button,
        .secondary-btn,
        .filter-actions button {
          border: 0;
          border-radius: 10px;
          padding: 10px 14px;
          font: inherit;
          font-weight: 700;
          cursor: pointer;
        }

        .secondary-btn {
          background: #eef2ff;
          color: #1d4ed8;
        }

        .table-section {
          padding: 18px;
          margin-bottom: 20px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }

        .section-header h2,
        .section-header h3 {
          margin: 0;
        }

        .section-header p {
          margin: 6px 0 0;
          color: #6b7280;
        }

        .section-header.compact {
          margin-bottom: 0;
        }

        .table-toolbar {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }

        .filter-panel {
          padding: 14px;
          margin-bottom: 18px;
        }

        .filter-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 12px;
        }

        .filter-field label {
          display: block;
          font-size: .9rem;
          font-weight: 700;
          margin-bottom: 6px;
          color: #374151;
        }

        .filter-field input {
          width: 100%;
        }

        .filter-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .loading,
        .no-alerts {
          color: #6b7280;
        }

        .status-panel__label {
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          opacity: 0.8;
          margin-bottom: 6px;
          font-weight: 700;
        }

        .status-panel__value {
          font-size: 1rem;
          font-weight: 800;
          line-height: 1.35;
        }

        .status-panel--danger {
          background: linear-gradient(135deg, #fee2e2, #fff);
          border-color: #fecaca;
          color: #991b1b;
        }

        .status-panel--warning {
          background: linear-gradient(135deg, #fef3c7, #fff);
          border-color: #fde68a;
          color: #92400e;
        }

        .status-panel--success {
          background: linear-gradient(135deg, #dcfce7, #fff);
          border-color: #bbf7d0;
          color: #166534;
        }

        .low-stock-item--rich {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-start;
          padding: 12px 14px;
          border: 1px solid #fde68a;
          border-radius: 12px;
          background: linear-gradient(135deg, #fff, #fffbeb);
          margin-bottom: 10px;
        }

        .low-stock-item__left {
          min-width: 0;
        }

        .low-stock-item__left strong {
          display: block;
          font-size: 0.98rem;
          color: #111827;
          margin-bottom: 4px;
        }

        .low-stock-item__muted {
          font-size: 0.85rem;
          color: #6b7280;
        }

        .low-stock-item__right {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 12px;
          min-width: 180px;
          text-align: right;
        }

        .low-stock-item__right span {
          display: block;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #6b7280;
        }

        .low-stock-item__right strong {
          display: block;
          font-size: 0.95rem;
          color: #111827;
        }

        @media (max-width: 992px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }

          .filter-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .low-stock-item--rich {
            flex-direction: column;
          }

          .low-stock-item__right {
            width: 100%;
            min-width: 0;
            text-align: left;
            grid-template-columns: 1fr 1fr;
          }
        }
      `;

      document.head.appendChild(
        style
      );
    }
  }
);