// assets/js/controllers/inventory.controller.js

(function () {
  "use strict";

  if (
    typeof firebase === "undefined"
  ) {
    console.error(
      "Firebase no se ha cargado correctamente."
    );

    if (
      typeof Swal !== "undefined"
    ) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text:
          "Firebase no se cargó. Revisa la conexión o los scripts."
      });
    }

    return;
  }

  /*
   * ============================================================
   * CONSTANTES
   * ============================================================
   */

  const PRODUCTS_COLLECTION =
    window.PRODUCTS_COLLECTION_NAME ||
    "productos";

  const SALES_COLLECTION =
    window.SALES_COLLECTION_NAME ||
    "ventas";

  const MOVEMENTS_COLLECTION =
    window.MOVEMENTS_COLLECTION_NAME ||
    "stock_movimientos";

  const PROVIDERS_COLLECTION =
    window.SUPPLIER_COLLECTION_NAME ||
    "proveedores";

  const EXPENSES_COLLECTION =
    window.EXPENSES_COLLECTION_NAME ||
    "gastos";

  const LOW_STOCK_THRESHOLD =
    5;

  const SAFETY_STOCK_DEFAULT =
    10;

  /*
   * ============================================================
   * ESTADO
   * ============================================================
   */

  let currentRole = "";

  let canEditInventory = false;

  let currentLocalId = "";

  let currentLocalInfo = {
    id_local: "",
    nombre: "",
    numeroDocumento: "",
    ubicacion: "",
    contribuyente: "",
    tipoDocumento: "",
    nit: "",
    nrc: ""
  };

  let currentUserInventoryContext = null;

  let currentProductsList = [];

  let currentProvidersList = [];

  let currentMonthlySalesMap = {};

  let currentMonthlyBoxesMap = {};

  let inventoryDT = null;

  let inventoryLoadPromise = null;

  let inventoryInitialized = false;

  const productStockMovementsCache =
    new Map();

  const productStockMovementsPending =
    new Map();

  let batchLineCounter = 0;

  /*
   * ============================================================
   * DOM
   * ============================================================
   */

  function getInventoryTableBody() {
    return document.querySelector(
      "#inventoryTable tbody"
    );
  }

  function getLowStockPanel() {
    return document.getElementById(
      "lowStockPanel"
    );
  }

  function getInventorySearchInput() {
    return (
      document.getElementById(
        "searchInventory"
      ) ||
      document.getElementById(
        "inventorySearch"
      ) ||
      document.getElementById(
        "productSearch"
      ) ||
      document.getElementById(
        "salesSearch"
      ) ||
      document.querySelector(
        "[data-inventory-search]"
      )
    );
  }

  function getInventoryAddButton() {
    return (
      document.getElementById(
        "btnAddProduct"
      ) ||
      document.getElementById(
        "btnAdd"
      )
    );
  }

  function getInventoryTotalProductsCard() {
    return document.getElementById(
      "totalProductsCard"
    );
  }

  function getInventoryTotalValueCard() {
    return document.getElementById(
      "totalValueCard"
    );
  }

  function getInventoryLowStockCard() {
    return document.getElementById(
      "lowStockCard"
    );
  }

  function getInventoryGreetingElements() {
    return document.querySelectorAll(
      ".userGreeting"
    );
  }

  /*
   * ============================================================
   * UTILIDADES
   * ============================================================
   */

  function numberOrZero(
    value
  ) {
    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : 0;
  }

  function decimalOrZero(
    value
  ) {
    const number = Number(value);

    if (
      !Number.isFinite(
        number
      )
    ) {
      return 0;
    }

    return Math.max(
      0,
      Math.round(
        number * 1000000
      ) / 1000000
    );
  }

  function integerOrZero(
    value
  ) {
    return decimalOrZero(value);
  }

  function formatQuantity(
    value
  ) {
    const number =
      decimalOrZero(value);

    return number
      .toFixed(6)
      .replace(
        /\.?0+$/,
        ""
      );
  }

  function currency(
    value
  ) {
    return `$${numberOrZero(
      value
    ).toFixed(2)}`;
  }

  function escapeHtml(
    value
  ) {
    return String(
      value ?? ""
    )
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );
  }

  function normalizeText(
    value
  ) {
    return String(
      value || ""
    )
      .trim()
      .toLowerCase()
      .normalize(
        "NFD"
      )
      .replace(
        /[\u0300-\u036f]/g,
        ""
      );
  }

  function normalizeIdArray(
    values
  ) {
    const source =
      Array.isArray(values)
        ? values
        : values
          ? [values]
          : [];

    return Array.from(
      new Set(
        source
          .map(
            value =>
              String(
                value || ""
              ).trim()
          )
          .filter(Boolean)
      )
    );
  }

  function isAdministratorRole() {
    return (
      currentRole ===
        "administrador" ||
      currentRole ===
        "admin"
    );
  }

  function canDeleteInventoryMovement() {
    return isAdministratorRole();
  }

  /*
   * ============================================================
   * USUARIO
   * ============================================================
   */

  function getStoredCurrentUser() {
    if (
      typeof window.getStoredCurrentUser ===
      "function"
    ) {
      return (
        window.getStoredCurrentUser() ||
        null
      );
    }

    try {
      return JSON.parse(
        localStorage.getItem(
          "currentUser"
        ) || "null"
      );
    } catch {
      return null;
    }
  }

  function patchStoredCurrentUser(
    patch = {}
  ) {
    if (
      typeof window.patchStoredCurrentUser ===
      "function"
    ) {
      window.patchStoredCurrentUser(
        patch
      );

      return;
    }

    try {
      const current =
        getStoredCurrentUser() ||
        {};

      localStorage.setItem(
        "currentUser",
        JSON.stringify({
          ...current,
          ...patch
        })
      );
    } catch {
      // ignore
    }
  }

  /*
   * ============================================================
   * CACHE DE SESIÓN
   * ============================================================
   */

  function getSessionCollection(
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

    return Array.isArray(
      documents
    )
      ? documents
      : [];
  }

  function upsertSessionDocument(
    collectionName,
    documentId,
    data = {}
  ) {
    if (
      typeof window.upsertSessionDocument !==
      "function"
    ) {
      console.warn(
        "app.js no expuso upsertSessionDocument()."
      );

      return;
    }

    window.upsertSessionDocument(
      collectionName,
      documentId,
      data
    );
  }

  function removeSessionDocument(
    collectionName,
    documentId
  ) {
    if (
      typeof window.removeSessionDocument !==
      "function"
    ) {
      console.warn(
        "app.js no expuso removeSessionDocument()."
      );

      return;
    }

    window.removeSessionDocument(
      collectionName,
      documentId
    );
  }

  async function ensureInventorySessionData(
    user
  ) {
    if (!user) {
      throw new Error(
        "No existe un usuario autenticado."
      );
    }

    if (
      typeof window.ensureSessionDataLoaded !==
      "function"
    ) {
      throw new Error(
        "app.js no expuso ensureSessionDataLoaded()."
      );
    }

    await window.ensureSessionDataLoaded(
      user
    );
  }

  /*
   * ============================================================
   * FECHAS
   * ============================================================
   */

  function getTimestampMs(
    value
  ) {
    if (
      value === null ||
      value === undefined
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
      value instanceof Date
    ) {
      return value.getTime();
    }

    const date =
      new Date(value);

    return isNaN(
      date.getTime()
    )
      ? 0
      : date.getTime();
  }

  function getLocalDateInputValue(
    date = new Date()
  ) {
    const value =
      date instanceof Date
        ? date
        : new Date(date);

    if (
      isNaN(
        value.getTime()
      )
    ) {
      return "";
    }

    const year =
      value.getFullYear();

    const month =
      String(
        value.getMonth() + 1
      ).padStart(
        2,
        "0"
      );

    const day =
      String(
        value.getDate()
      ).padStart(
        2,
        "0"
      );

    return `${year}-${month}-${day}`;
  }

  function parseOperationDate(
    value
  ) {
    const text =
      String(
        value || ""
      ).trim();

    if (!text) {
      return null;
    }

    const match =
      /^(\d{4})-(\d{2})-(\d{2})$/.exec(
        text
      );

    if (!match) {
      return null;
    }

    const year =
      Number(match[1]);

    const month =
      Number(match[2]);

    const day =
      Number(match[3]);

    const date =
      new Date(
        year,
        month - 1,
        day,
        12,
        0,
        0,
        0
      );

    if (
      date.getFullYear() !==
        year ||
      date.getMonth() !==
        month - 1 ||
      date.getDate() !==
        day
    ) {
      return null;
    }

    return date;
  }

  function formatOperationDate(
    date
  ) {
    if (!date) {
      return "—";
    }

    return date.toLocaleDateString(
      "es-ES"
    );
  }

  function buildOperationTimestamp(
    operationDate
  ) {
    const date =
      operationDate instanceof Date
        ? operationDate
        : new Date(operationDate);

    if (
      isNaN(
        date.getTime()
      )
    ) {
      throw new Error(
        "La fecha de operación no es válida."
      );
    }

    return firebase.firestore.Timestamp.fromDate(
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        12,
        0,
        0,
        0
      )
    );
  }

  function getMovementOperationDateValue(
    movement
  ) {
    if (
      movement?.fechaOperacion
    ) {
      const parsed =
        parseOperationDate(
          movement.fechaOperacion
        );

      if (parsed) {
        return movement.fechaOperacion;
      }
    }

    const timestampMs =
      getTimestampMs(
        movement?.createdAt
      );

    if (!timestampMs) {
      return "";
    }

    return getLocalDateInputValue(
      new Date(
        timestampMs
      )
    );
  }

  function getInventoryDayKey(
    date = new Date()
  ) {
    try {
      if (
        typeof window.getTodayBounds ===
        "function"
      ) {
        const bounds =
          window.getTodayBounds(
            date
          );

        if (
          bounds &&
          bounds.dayKey
        ) {
          return String(
            bounds.dayKey
          );
        }
      }
    } catch (
      error
    ) {
      console.warn(
        "No se pudo obtener dayKey:",
        error
      );
    }

    return getLocalDateInputValue(
      date
    );
  }

  /*
   * ============================================================
   * CONTEXTO
   * ============================================================
   */

  async function resolveInventoryContext(
    user
  ) {
    if (!user) {
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

    await ensureInventorySessionData(
      user
    );

    const context =
      await window.getCurrentUserContext(
        user
      );

    if (!context) {
      throw new Error(
        "No se pudo resolver el contexto del usuario."
      );
    }

    currentUserInventoryContext =
      context;

    currentLocalId =
      String(
        context.id_local ||
        ""
      ).trim();

    currentLocalInfo = {
      id_local:
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

    currentRole =
      String(
        context.role ||
        ""
      )
        .trim()
        .toLowerCase();

    canEditInventory =
      currentRole ===
        "administrador" ||
      currentRole ===
        "admin" ||
      currentRole ===
        "bodega";

    getInventoryGreetingElements().forEach(
      element => {
        element.textContent =
          `Hola, ${
            context.name ||
            "Usuario"
          } (${
            context.role ||
            ""
          })`;
      }
    );

    const addButton =
      getInventoryAddButton();

    if (addButton) {
      addButton.style.display =
        canEditInventory &&
        currentLocalId
          ? ""
          : "none";
    }

    patchStoredCurrentUser({
      id_local:
        currentLocalId,

      localNombre:
        currentLocalInfo.nombre,

      localNumeroDocumento:
        currentLocalInfo.numeroDocumento,

      localUbicacion:
        currentLocalInfo.ubicacion,

      localContribuyente:
        currentLocalInfo.contribuyente,

      localTipoDocumento:
        currentLocalInfo.tipoDocumento,

      localNIT:
        currentLocalInfo.nit,

      localNRC:
        currentLocalInfo.nrc
    });

    return context;
  }

  /*
   * ============================================================
   * PROVEEDORES
   * ============================================================
   */

  function getProviderName(
    provider
  ) {
    return String(
      provider?.nombre ||
      provider?.name ||
      provider?.nombreProveedor ||
      ""
    ).trim();
  }

  function getProviderBusinessName(
    provider
  ) {
    return String(
      provider?.razonSocialDenominacion ||
      provider?.razonSocial ||
      provider?.razon_social ||
      provider?.denominacion ||
      provider?.denominacionSocial ||
      provider?.businessName ||
      ""
    ).trim();
  }

  function getProviderNationality(
    provider
  ) {
    return String(
      provider?.nacionalidad ||
      ""
    ).trim();
  }

  function getProviderDisplayName(
    provider
  ) {
    if (!provider) {
      return "";
    }

    const name =
      getProviderName(provider);

    const businessName =
      getProviderBusinessName(
        provider
      );

    if (
      name &&
      businessName
    ) {
      return `${name} — ${businessName}`;
    }

    return (
      name ||
      businessName ||
      String(
        provider?.id ||
        ""
      ).trim()
    );
  }

  function normalizeProviderObject(
    provider,
    fallbackId = ""
  ) {
    if (!provider) {
      return null;
    }

    const id =
      String(
        provider.id ||
        provider.id_proveedor ||
        provider.proveedorId ||
        provider.providerId ||
        fallbackId ||
        ""
      ).trim();

    const nombre =
      getProviderName(
        provider
      );

    const razonSocialDenominacion =
      getProviderBusinessName(
        provider
      );

    if (
      !id &&
      !nombre &&
      !razonSocialDenominacion
    ) {
      return null;
    }

    return {
      id,
      ...provider,

      nombre,

      razonSocialDenominacion,

      razonSocial:
        razonSocialDenominacion,

      denominacion:
        razonSocialDenominacion,

      nacionalidad:
        getProviderNationality(
          provider
        )
    };
  }

  function normalizeProviderCollection(
    rawProviders,
    rawIds = []
  ) {
    const providers =
      [];

    if (
      Array.isArray(
        rawProviders
      )
    ) {
      rawProviders.forEach(
        provider => {
          if (
            typeof provider ===
            "string"
          ) {
            const resolved =
              getProviderById(
                provider
              );

            if (
              resolved
            ) {
              providers.push(
                resolved
              );
            }

            return;
          }

          const normalized =
            normalizeProviderObject(
              provider
            );

          if (
            normalized
          ) {
            const resolved =
              normalized.id
                ? getProviderById(
                    normalized.id
                  )
                : null;

            providers.push(
              resolved
                ? {
                    ...normalized,
                    ...resolved
                  }
                : normalized
            );
          }
        }
      );
    }

    normalizeIdArray(
      rawIds
    ).forEach(
      providerId => {
        const exists =
          providers.some(
            provider =>
              String(
                provider.id
              ).trim() ===
              providerId
          );

        if (
          exists
        ) {
          return;
        }

        const provider =
          getProviderById(
            providerId
          );

        if (
          provider
        ) {
          providers.push(
            provider
          );
        } else {
          providers.push(
            normalizeProviderObject(
              {
                id:
                  providerId
              }
            )
          );
        }
      }
    );

    const result =
      [];

    const usedIds =
      new Set();

    const usedTexts =
      new Set();

    providers.forEach(
      provider => {
        if (!provider) {
          return;
        }

        const id =
          String(
            provider.id ||
            ""
          ).trim();

        const text =
          normalizeText(
            getProviderDisplayName(
              provider
            )
          );

        if (
          id
        ) {
          if (
            usedIds.has(id)
          ) {
            return;
          }

          usedIds.add(id);
          result.push(
            provider
          );
          return;
        }

        if (
          text &&
          usedTexts.has(text)
        ) {
          return;
        }

        if (
          text
        ) {
          usedTexts.add(text);
        }

        result.push(
          provider
        );
      }
    );

    return result;
  }

  function getProviderById(
    providerId
  ) {
    const target =
      String(
        providerId ||
        ""
      ).trim();

    if (!target) {
      return null;
    }

    return (
      currentProvidersList.find(
        provider =>
          String(
            provider.id
          ).trim() ===
          target
      ) ||
      null
    );
  }

  function getProviderIds(
    providers
  ) {
    return normalizeIdArray(
      (providers || [])
        .map(
          provider =>
            provider?.id ||
            provider
        )
    );
  }

  function mergeProviderCollections(
    ...collections
  ) {
    const result =
      [];

    const seenIds =
      new Set();

    const seenTexts =
      new Set();

    collections
      .flat()
      .forEach(
        provider => {
          const normalized =
            typeof provider ===
            "string"
              ? getProviderById(
                  provider
                )
              : normalizeProviderObject(
                  provider
                );

          if (!normalized) {
            return;
          }

          const id =
            String(
              normalized.id ||
              ""
            ).trim();

          const text =
            normalizeText(
              getProviderDisplayName(
                normalized
              )
            );

          if (
            id
          ) {
            if (
              seenIds.has(id)
            ) {
              return;
            }

            seenIds.add(id);
            result.push(
              normalized
            );
            return;
          }

          if (
            text &&
            seenTexts.has(text)
          ) {
            return;
          }

          if (
            text
          ) {
            seenTexts.add(text);
          }

          result.push(
            normalized
          );
        }
      );

    return result;
  }

  function getProductProviders(
    product
  ) {
    if (!product) {
      return [];
    }

    const rawProviders =
      product.proveedores ||
      product.providers ||
      [];

    const rawProviderIds =
      product.proveedorIds ||
      product.providerIds ||
      [];

    const providers =
      normalizeProviderCollection(
        rawProviders,
        rawProviderIds
      );

    const legacyProvider =
      normalizeProviderObject({
        id:
          product.proveedorId ||
          product.providerId ||
          "",
        nombre:
          product.proveedorNombre ||
          product.providerName ||
          "",
        razonSocialDenominacion:
          product.proveedorRazonSocial ||
          product.proveedorRazonSocialDenominacion ||
          product.proveedorDenominacion ||
          product.providerBusinessName ||
          ""
      });

    return mergeProviderCollections(
      providers,
      legacyProvider
    );
  }

  function getProductProviderIds(
    product
  ) {
    return getProviderIds(
      getProductProviders(
        product
      )
    );
  }

  function getProductProviderId(
    product
  ) {
    return (
      getProductProviderIds(
        product
      )[0] ||
      ""
    );
  }

  function getProductProviderName(
    product
  ) {
    const provider =
      getProductProviders(
        product
      )[0];

    return (
      getProviderName(
        provider
      ) ||
      String(
        product?.proveedorNombre ||
        ""
      ).trim()
    );
  }

  function getProductProviderReason(
    product
  ) {
    const provider =
      getProductProviders(
        product
      )[0];

    return (
      getProviderBusinessName(
        provider
      ) ||
      String(
        product?.proveedorRazonSocial ||
        product?.proveedorRazonSocialDenominacion ||
        product?.proveedorDenominacion ||
        ""
      ).trim()
    );
  }

  function getProductProvidersDisplay(
    product
  ) {
    const providers =
      getProductProviders(
        product
      );

    if (
      !providers.length
    ) {
      return "Sin proveedor";
    }

    return providers
      .map(
        provider =>
          getProviderDisplayName(
            provider
          )
      )
      .filter(Boolean)
      .join(" | ");
  }

  function getProductProvidersSearchText(
    product
  ) {
    return getProductProviders(
      product
    )
      .map(
        provider =>
          [
            getProviderName(
              provider
            ),
            getProviderBusinessName(
              provider
            ),
            getProviderDisplayName(
              provider
            )
          ]
            .filter(Boolean)
            .join(" ")
      )
      .join(" ");
  }

  function findProviderByText(
    value
  ) {
    const text =
      normalizeText(value);

    if (!text) {
      return null;
    }

    const exactName =
      currentProvidersList.find(
        provider =>
          normalizeText(
            getProviderName(
              provider
            )
          ) ===
          text
      );

    if (
      exactName
    ) {
      return exactName;
    }

    const exactBusiness =
      currentProvidersList.find(
        provider =>
          normalizeText(
            getProviderBusinessName(
              provider
            )
          ) ===
          text
      );

    if (
      exactBusiness
    ) {
      return exactBusiness;
    }

    const exactDisplay =
      currentProvidersList.find(
        provider =>
          normalizeText(
            getProviderDisplayName(
              provider
            )
          ) ===
          text
      );

    if (
      exactDisplay
    ) {
      return exactDisplay;
    }

    return (
      currentProvidersList.find(
        provider =>
          normalizeText(
            getProviderDisplayName(
              provider
            )
          ).includes(
            text
          )
      ) ||
      null
    );
  }

  function resolveProviderSelection(
    value
  ) {
    const text =
      String(
        value ||
        ""
      ).trim();

    return text
      ? findProviderByText(
          text
        )
      : null;
  }

  async function loadInventoryProviders() {
    await ensureInventorySessionData(
      auth.currentUser
    );

    currentProvidersList =
      [];

    try {
      const providerDocs =
        getSessionCollection(
          PROVIDERS_COLLECTION
        );

      const providers =
        [];

      providerDocs.forEach(
        ({
          id,
          data
        }) => {
          if (
            !matchesCurrentLocal(
              data
            )
          ) {
            return;
          }

          const provider =
            normalizeProviderObject({
              id,
              ...(data || {})
            });

          if (
            provider
          ) {
            providers.push(
              provider
            );
          }
        }
      );

      providers.sort(
        (
          a,
          b
        ) =>
          normalizeText(
            getProviderDisplayName(
              a
            )
          ).localeCompare(
            normalizeText(
              getProviderDisplayName(
                b
              )
            ),
            "es"
          )
      );

      currentProvidersList =
        providers;

      return currentProvidersList;
    } catch (
      error
    ) {
      console.warn(
        "No se pudieron cargar proveedores:",
        error
      );

      currentProvidersList =
        [];

      return [];
    }
  }

  /*
   * ============================================================
   * LOCAL
   * ============================================================
   */

  function getLocalFieldValue(
    data = {}
  ) {
    return String(
      data.id_local ||
      data.idLocal ||
      data.localId ||
      data.idlocal ||
      ""
    ).trim();
  }

  function matchesCurrentLocal(
    data = {}
  ) {
    if (!currentLocalId) {
      return false;
    }

    return (
      getLocalFieldValue(
        data
      ) ===
      String(
        currentLocalId
      ).trim()
    );
  }

  /*
   * ============================================================
   * PRODUCTOS
   * ============================================================
   */

  function getUnitsPerBox(
    product
  ) {
    const value =
      decimalOrZero(
        product?.unitsPerBox
      );

    return value > 0
      ? value
      : 1;
  }

  function getProductCode(
    product
  ) {
    return String(
      product?.codigoProducto ||
      product?.productCode ||
      product?.code ||
      product?.sku ||
      ""
    ).trim();
  }

  function getCurrentStockUnits(
    product
  ) {
    if (!product) {
      return 0;
    }

    const stockCurrent =
      Number(
        product.stockCurrentUnits
      );

    if (
      Number.isFinite(
        stockCurrent
      )
    ) {
      return Math.max(
        0,
        stockCurrent
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
    const unitsPerBox =
      getUnitsPerBox(
        product
      );

    return unitsPerBox > 0
      ? decimalOrZero(
          getCurrentStockUnits(
            product
          ) /
            unitsPerBox
        )
      : 0;
  }

  function getCostPerUnit(
    product
  ) {
    const direct =
      numberOrZero(
        product?.lastCostPerUnit
      );

    if (
      direct > 0
    ) {
      return direct;
    }

    const costPerBox =
      numberOrZero(
        product?.lastCostPerBox
      );

    const unitsPerBox =
      getUnitsPerBox(
        product
      );

    return costPerBox > 0 &&
      unitsPerBox > 0
      ? costPerBox /
          unitsPerBox
      : 0;
  }

  function findProductById(
    id
  ) {
    const target =
      String(
        id || ""
      ).trim();

    return (
      currentProductsList.find(
        product =>
          String(
            product.id
          ).trim() ===
          target
      ) ||
      null
    );
  }

  function findProductByText(
    value
  ) {
    const text =
      normalizeText(value);

    if (!text) {
      return null;
    }

    const exact =
      currentProductsList.find(
        product =>
          normalizeText(
            product.name
          ) === text ||
          normalizeText(
            getProductCode(
              product
            )
          ) === text
      );

    if (exact) {
      return exact;
    }

    return (
      currentProductsList.find(
        product =>
          normalizeText(
            product.name
          ).includes(
            text
          ) ||
          normalizeText(
            getProductCode(
              product
            )
          ).includes(
            text
          ) ||
          normalizeText(
            getProductProvidersSearchText(
              product
            )
          ).includes(
            text
          )
      ) ||
      null
    );
  }

  /*
   * ============================================================
   * COSTOS
   * ============================================================
   */

  function getEffectiveUnitsPerBox(
    line,
    product = null
  ) {
    const value =
      decimalOrZero(
        product
          ? getUnitsPerBox(
              product
            )
          : line?.unitsPerBox
      );

    return value > 0
      ? value
      : 1;
  }

  function getEffectiveCostPerBoxForLine(
    line,
    product = null
  ) {
    const unitsPerBox =
      getEffectiveUnitsPerBox(
        line,
        product
      );

    const explicitCostPerBox =
      numberOrZero(
        line?.lastCostPerBox ??
          line?.costoPorCaja ??
          line?.costPerBox
      );

    if (
      explicitCostPerBox > 0
    ) {
      return explicitCostPerBox;
    }

    const explicitCostPerUnit =
      numberOrZero(
        line?.lastCostPerUnit ??
          line?.costoUnitario ??
          line?.costPerUnit
      );

    if (
      explicitCostPerUnit > 0
    ) {
      return (
        explicitCostPerUnit *
        unitsPerBox
      );
    }

    if (product) {
      const productBoxCost =
        numberOrZero(
          product.lastCostPerBox
        );

      if (
        productBoxCost > 0
      ) {
        return productBoxCost;
      }

      const productUnitCost =
        numberOrZero(
          product.lastCostPerUnit
        );

      if (
        productUnitCost > 0
      ) {
        return (
          productUnitCost *
          unitsPerBox
        );
      }
    }

    return 0;
  }

  function getEffectiveCostPerUnitForLine(
    line,
    product = null
  ) {
    const unitsPerBox =
      getEffectiveUnitsPerBox(
        line,
        product
      );

    const explicitCostPerUnit =
      numberOrZero(
        line?.lastCostPerUnit ??
          line?.costoUnitario ??
          line?.costPerUnit
      );

    if (
      explicitCostPerUnit > 0
    ) {
      return explicitCostPerUnit;
    }

    const costPerBox =
      getEffectiveCostPerBoxForLine(
        line,
        product
      );

    return unitsPerBox > 0
      ? costPerBox /
          unitsPerBox
      : 0;
  }

  function calculateLinePurchaseCost(
    line,
    product = null
  ) {
    if (!line) {
      return 0;
    }

    const paidBoxes =
      decimalOrZero(
        line.boxes
      );

    const paidUnits =
      decimalOrZero(
        line.units
      );

    const unitsPerBox =
      getEffectiveUnitsPerBox(
        line,
        product
      );

    const costPerUnit =
      getEffectiveCostPerUnitForLine(
        line,
        product
      );

    return Math.max(
      0,
      (
        paidBoxes *
          unitsPerBox +
        paidUnits
      ) *
        costPerUnit
    );
  }

  /*
   * ============================================================
   * PROVEEDORES EN LÍNEAS
   * ============================================================
   */

  function getLineProviders(
    line
  ) {
    const arrayProviders =
      normalizeProviderCollection(
        line?.proveedores ||
          [],
        line?.proveedorIds ||
          []
      );

    const legacyProvider =
      normalizeProviderObject({
        id:
          line?.proveedorId ||
          "",
        nombre:
          line?.proveedorNombre ||
          "",
        razonSocialDenominacion:
          line?.proveedorRazonSocial ||
          ""
      });

    return mergeProviderCollections(
      arrayProviders,
      legacyProvider
    );
  }

  function getLineProviderIds(
    line
  ) {
    return getProviderIds(
      getLineProviders(
        line
      )
    );
  }

  function getLineProvidersDisplay(
    line
  ) {
    const providers =
      getLineProviders(
        line
      );

    if (
      !providers.length
    ) {
      return "Sin proveedor";
    }

    return providers
      .map(
        provider =>
          getProviderDisplayName(
            provider
          )
      )
      .filter(Boolean)
      .join(" | ");
  }

  /*
   * ============================================================
   * SELECTOR MÚLTIPLE DE PROVEEDORES
   * ============================================================
   */

  function buildProviderMultiSelectHtml(
    selectorId,
    providers = [],
    selectedIds = []
  ) {
    const normalizedSelected =
      new Set(
        normalizeIdArray(
          selectedIds
        )
      );

    const safeProviders =
      mergeProviderCollections(
        providers
      );

    return `
      <div
        id="${escapeHtml(
          selectorId
        )}"
        class="provider-multi-select"
        data-role="provider-selector"
      >
        <div class="provider-multi-header">
          <span>
            Selecciona uno o varios proveedores
          </span>

          <span
            class="provider-multi-count"
            data-role="provider-count"
          >
            ${
              Array.from(
                normalizedSelected
              ).length
            } seleccionados
          </span>
        </div>

        <input
          type="text"
          class="provider-multi-search"
          placeholder="Buscar proveedor..."
          autocomplete="off"
          data-role="provider-search"
        >

        <div
          class="provider-multi-options"
          data-role="provider-options"
        >
          ${
            safeProviders.length
              ? safeProviders
                  .map(
                    provider => {
                      const providerId =
                        String(
                          provider.id ||
                          ""
                        ).trim();

                      const checked =
                        normalizedSelected.has(
                          providerId
                        );

                      return `
                        <label
                          class="provider-multi-option"
                          data-provider-search="${escapeHtml(
                            normalizeText(
                              [
                                getProviderName(
                                  provider
                                ),
                                getProviderBusinessName(
                                  provider
                                ),
                                getProviderDisplayName(
                                  provider
                                ),
                                providerId
                              ]
                                .filter(Boolean)
                                .join(" ")
                            )
                          )}"
                        >
                          <input
                            type="checkbox"
                            class="provider-multi-checkbox"
                            value="${escapeHtml(
                              providerId
                            )}"
                            ${
                              checked
                                ? "checked"
                                : ""
                            }
                          >

                          <span>
                            <strong>
                              ${escapeHtml(
                                getProviderName(
                                  provider
                                ) ||
                                  getProviderBusinessName(
                                    provider
                                  ) ||
                                  providerId ||
                                  "Proveedor"
                              )}
                            </strong>

                            ${
                              getProviderBusinessName(
                                provider
                              )
                                ? `
                                  <small>
                                    ${escapeHtml(
                                      getProviderBusinessName(
                                        provider
                                      )
                                    )}
                                  </small>
                                `
                                : ""
                            }
                          </span>
                        </label>
                      `;
                    }
                  )
                  .join("")
              : `
                  <div class="provider-multi-empty">
                    No hay proveedores disponibles para este local.
                  </div>
                `
          }
        </div>

        <div
          class="provider-multi-summary"
          data-role="provider-summary"
        >
          ${
            safeProviders
              .filter(
                provider =>
                  normalizedSelected.has(
                    String(
                      provider.id ||
                        ""
                    ).trim()
                  )
              )
              .map(
                provider =>
                  escapeHtml(
                    getProviderDisplayName(
                      provider
                    )
                  )
              )
              .join(" | ") ||
            "Ningún proveedor seleccionado"
          }
        </div>
      </div>
    `;
  }

  function getProviderSelectorRoot(
    rowOrSelector
  ) {
    if (
      !rowOrSelector
    ) {
      return null;
    }

    if (
      typeof rowOrSelector ===
      "string"
    ) {
      return document.getElementById(
        rowOrSelector
      );
    }

    if (
      rowOrSelector instanceof
      Element
    ) {
      return rowOrSelector.querySelector(
        '[data-role="provider-selector"]'
      );
    }

    return null;
  }

  function getSelectedProviderIdsFromSelector(
    root
  ) {
    if (!root) {
      return [];
    }

    return normalizeIdArray(
      Array.from(
        root.querySelectorAll(
          ".provider-multi-checkbox:checked"
        )
      ).map(
        input =>
          input.value
      )
    );
  }

  function updateProviderSelectorSummary(
    root
  ) {
    if (!root) {
      return;
    }

    const selectedIds =
      getSelectedProviderIdsFromSelector(
        root
      );

    const selectedSet =
      new Set(
        selectedIds
      );

    const providers =
      currentProvidersList
        .filter(
          provider =>
            selectedSet.has(
              String(
                provider.id
              ).trim()
            )
        );

    const summary =
      root.querySelector(
        '[data-role="provider-summary"]'
      );

    const count =
      root.querySelector(
        '[data-role="provider-count"]'
      );

    if (summary) {
      summary.textContent =
        providers
          .map(
            provider =>
              getProviderDisplayName(
                provider
              )
          )
          .filter(Boolean)
          .join(" | ") ||
        "Ningún proveedor seleccionado";
    }

    if (count) {
      count.textContent =
        `${selectedIds.length} seleccionado${
          selectedIds.length ===
          1
            ? ""
            : "s"
        }`;
    }
  }

  function bindProviderSelectorEvents(
    root
  ) {
    if (!root) {
      return;
    }

    const search =
      root.querySelector(
        '[data-role="provider-search"]'
      );

    if (
      search &&
      search.dataset.bound !==
        "1"
    ) {
      search.dataset.bound =
        "1";

      search.addEventListener(
        "input",
        () => {
          const text =
            normalizeText(
              search.value
            );

          root
            .querySelectorAll(
              ".provider-multi-option"
            )
            .forEach(
              option => {
                const searchText =
                  option.dataset
                    .providerSearch ||
                  "";

                option.style.display =
                  !text ||
                  searchText.includes(
                    text
                  )
                    ? ""
                    : "none";
              }
            );
        }
      );
    }

    root
      .querySelectorAll(
        ".provider-multi-checkbox"
      )
      .forEach(
        checkbox => {
          if (
            checkbox.dataset.bound ===
            "1"
          ) {
            return;
          }

          checkbox.dataset.bound =
            "1";

          checkbox.addEventListener(
            "change",
            () => {
              updateProviderSelectorSummary(
                root
              );
            }
          );
        }
      );
  }

  function setProviderSelector(
    root,
    providers,
    selectedIds,
    autoSelectFirst = false
  ) {
    if (!root) {
      return [];
    }

    const available =
      mergeProviderCollections(
        providers
      );

    let selected =
      normalizeIdArray(
        selectedIds
      );

    const availableIds =
      getProviderIds(
        available
      );

    selected =
      selected.filter(
        id =>
          availableIds.includes(
            id
          )
      );

    if (
      !selected.length &&
      autoSelectFirst &&
      available.length
    ) {
      const firstId =
        String(
          available[0].id ||
            ""
        ).trim();

      if (
        firstId
      ) {
        selected = [
          firstId
        ];
      }
    }

    root.innerHTML =
      buildProviderMultiSelectHtml(
        root.id,
        available,
        selected
      );

    bindProviderSelectorEvents(
      root
    );

    return selected;
  }

  /*
   * ============================================================
   * PROYECCIONES
   * ============================================================
   */

  function buildProjectionForProduct(
    product
  ) {
    const stockUnits =
      getCurrentStockUnits(
        product
      );

    const stockBoxes =
      getStockBoxes(
        product
      );

    const unitsPerBox =
      getUnitsPerBox(
        product
      );

    const soldUnits =
      decimalOrZero(
        currentMonthlySalesMap[
          product.id
        ]
      );

    const soldBoxes =
      decimalOrZero(
        currentMonthlyBoxesMap[
          product.id
        ]
      );

    const costPerUnit =
      getCostPerUnit(
        product
      );

    let suggestedUnits =
      soldUnits +
      SAFETY_STOCK_DEFAULT -
      stockUnits;

    suggestedUnits =
      Math.max(
        0,
        suggestedUnits
      );

    const suggestedBoxes =
      unitsPerBox > 0
        ? decimalOrZero(
            suggestedUnits /
              unitsPerBox
          )
        : 0;

    let status =
      "OK";

    if (
      suggestedUnits >
      0
    ) {
      status =
        "Reponer";
    } else if (
      stockUnits <=
      LOW_STOCK_THRESHOLD
    ) {
      status =
        "Bajo";
    }

    return {
      stockUnits,
      stockBoxes,
      unitsPerBox,
      soldUnits,
      soldBoxes,
      costPerUnit,
      suggestedUnits,
      suggestedBoxes,
      status
    };
  }

  function buildRowData(
    product
  ) {
    const projection =
      buildProjectionForProduct(
        product
      );

    const providerDisplay =
      getProductProvidersDisplay(
        product
      );

    const productCode =
      getProductCode(
        product
      );

    return {
      id:
        product.id,

      name:
        product.name ||
        "—",

      providerName:
        providerDisplay,

      providerReason:
        "",

      productCode,

      price:
        numberOrZero(
          product.price
        ),

      stockUnits:
        projection.stockUnits,

      stockBoxes:
        projection.stockBoxes,

      unitsPerBox:
        projection.unitsPerBox,

      soldMonthUnits:
        projection.soldUnits,

      soldMonthBoxes:
        projection.soldBoxes,

      costPerUnit:
        projection.costPerUnit,

      suggestedPurchaseUnits:
        projection.suggestedUnits,

      suggestedPurchaseBoxes:
        projection.suggestedBoxes,

      status:
        projection.status,

      searchText:
        [
          product.name,
          productCode,
          getProductProvidersSearchText(
            product
          )
        ]
          .filter(Boolean)
          .join(" ")
    };
  }

  function renderStatusChip(
    status
  ) {
    if (
      status ===
      "Reponer"
    ) {
      return `
        <span style="
          padding:4px 8px;
          border-radius:999px;
          background:#fee2e2;
          color:#b91c1c;
          font-weight:700;
        ">
          Reponer
        </span>
      `;
    }

    if (
      status ===
      "Bajo"
    ) {
      return `
        <span style="
          padding:4px 8px;
          border-radius:999px;
          background:#fef3c7;
          color:#92400e;
          font-weight:700;
        ">
          Bajo
        </span>
      `;
    }

    return `
      <span style="
        padding:4px 8px;
        border-radius:999px;
        background:#dcfce7;
        color:#166534;
        font-weight:700;
      ">
        OK
      </span>
    `;
  }

  function renderStockDisplay(
    row
  ) {
    const stock =
      decimalOrZero(
        row.stockUnits
      );

    const unitsPerBox =
      decimalOrZero(
        row.unitsPerBox
      );

    if (
      unitsPerBox > 0
    ) {
      const boxesEquivalent =
        decimalOrZero(
          stock /
            unitsPerBox
        );

      return `
        <strong>
          ${formatQuantity(
            stock
          )}
        </strong>

        <br>

        <small>
          ${formatQuantity(
            boxesEquivalent
          )}
          ${
            boxesEquivalent ===
            1
              ? "caja"
              : "cajas"
          }
          equivalentes
          ×
          ${formatQuantity(
            unitsPerBox
          )}
          unidades/caja
        </small>
      `;
    }

    return formatQuantity(
      stock
    );
  }

  function renderActions(
    row
  ) {
    if (
      !canEditInventory
    ) {
      return `
        <span class="small">
          Solo lectura
        </span>
      `;
    }

    const isAdmin =
      isAdministratorRole();

    return `
      <button
        type="button"
        class="btn-outline"
        data-action="movements"
        data-id="${escapeHtml(
          row.id
        )}"
      >
        <i class="fas fa-history"></i>
        Entradas
      </button>

      <button
        type="button"
        class="btn-outline"
        data-action="delete"
        data-id="${escapeHtml(
          row.id
        )}"
        data-name="${escapeHtml(
          row.name
        )}"
        style="margin-left:8px;"
        ${
          isAdmin
            ? ""
            : "disabled title='Solo administrador puede eliminar productos'"
        }
      >
        <i class="fas fa-trash"></i>
        Eliminar
      </button>
    `;
  }

  function ensureInventoryDataTable() {
    if (
      inventoryDT
    ) {
      return inventoryDT;
    }

    if (
      !window.jQuery ||
      !$.fn ||
      !$.fn.DataTable
    ) {
      return null;
    }

    const table =
      document.getElementById(
        "inventoryTable"
      );

    if (!table) {
      return null;
    }

    inventoryDT =
      $("#inventoryTable")
        .DataTable({
          data: [],

          columns: [
            {
              data:
                "name",

              title:
                "Nombre",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? escapeHtml(
                        data
                      )
                    : data
            },

            {
              data:
                "providerName",

              title:
                "Proveedores",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? escapeHtml(
                        data ||
                          "Sin proveedor"
                      )
                    : data
            },

            {
              data:
                "stockUnits",

              title:
                "Stock",

              render:
                (
                  data,
                  type,
                  row
                ) =>
                  type ===
                    "display"
                    ? renderStockDisplay(
                        row
                      )
                    : data
            },

            {
              data:
                "price",

              title:
                "Precio",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? currency(
                        data
                      )
                    : data
            },

            {
              data:
                "soldMonthUnits",

              title:
                "Vendido Mes (Unid.)",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? formatQuantity(
                        data
                      )
                    : data
            },

            {
              data:
                "soldMonthBoxes",

              title:
                "Vendido Mes (Cajas)",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? formatQuantity(
                        data
                      )
                    : data
            },

            {
              data:
                "costPerUnit",

              title:
                "Costo por unidad",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? currency(
                        data
                      )
                    : data
            },

            {
              data:
                "suggestedPurchaseUnits",

              title:
                "Sugerido Compra (Unid.)",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? formatQuantity(
                        data
                      )
                    : data
            },

            {
              data:
                "suggestedPurchaseBoxes",

              title:
                "Sugerido Compra (Cajas)",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? formatQuantity(
                        data
                      )
                    : data
            },

            {
              data:
                "status",

              title:
                "Estado",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? renderStatusChip(
                        data
                      )
                    : data
            },

            {
              data:
                "searchText",

              title:
                "Búsqueda",

              visible:
                false,

              searchable:
                true,

              orderable:
                false
            },

            {
              data:
                null,

              title:
                "Acciones",

              orderable:
                false,

              searchable:
                false,

              render:
                (
                  data,
                  type,
                  row
                ) =>
                  type ===
                    "display"
                    ? renderActions(
                        row
                      )
                    : ""
            }
          ],

          pageLength:
            10,

          lengthMenu:
            [
              5,
              10,
              25,
              50
            ],

          order: [
            [
              0,
              "asc"
            ]
          ],

          autoWidth:
            false,

          scrollX:
            true,

          scrollCollapse:
            true,

          deferRender:
            true,

          dom:
            'rt<"bottom"ip><"clear">',

          language: {
            emptyTable:
              "No hay productos registrados.",

            zeroRecords:
              "No se encontraron coincidencias.",

            info:
              "Mostrando _START_ a _END_ de _TOTAL_",

            infoEmpty:
              "No hay registros",

            infoFiltered:
              "(filtrado de _MAX_ registros)",

            paginate: {
              previous:
                "‹",

              next:
                "›"
            }
          }
        });

    $("#inventoryTable tbody")
      .off(
        "click.inventoryMovements"
      )
      .on(
        "click.inventoryMovements",
        "button[data-action='movements']",
        function () {
          if (
            !canEditInventory
          ) {
            return;
          }

          openMovementManagerModal(
            String(
              $(this).data(
                "id"
              )
            )
          );
        }
      );

    $("#inventoryTable tbody")
      .off(
        "click.inventoryDelete"
      )
      .on(
        "click.inventoryDelete",
        "button[data-action='delete']",
        function () {
          if (
            !canEditInventory
          ) {
            return;
          }

          confirmDeleteProduct(
            String(
              $(this).data(
                "id"
              )
            ),
            String(
              $(this).data(
                "name"
              ) ||
                ""
            )
          );
        }
      );

    return inventoryDT;
  }

  function refreshInventoryView() {
    const rows =
      currentProductsList.map(
        buildRowData
      );

    const totalValue =
      rows.reduce(
        (
          sum,
          row
        ) =>
          sum +
          numberOrZero(
            row.stockUnits
          ) *
            numberOrZero(
              row.price
            ),
        0
      );

    const lowStock =
      rows.filter(
        row =>
          row.stockUnits <=
            LOW_STOCK_THRESHOLD ||
          row.suggestedPurchaseUnits >
            0
      );

    const totalProductsCard =
      getInventoryTotalProductsCard();

    const totalValueCard =
      getInventoryTotalValueCard();

    const lowStockCard =
      getInventoryLowStockCard();

    if (
      totalProductsCard
    ) {
      totalProductsCard.textContent =
        String(
          rows.length
        );
    }

    if (
      totalValueCard
    ) {
      totalValueCard.textContent =
        currency(
          totalValue
        );
    }

    if (
      lowStockCard
    ) {
      lowStockCard.textContent =
        String(
          lowStock.length
        );
    }

    renderLowStockPanel(
      lowStock
    );

    const dt =
      ensureInventoryDataTable();

    if (dt) {
      const searchInput =
        getInventorySearchInput();

      const searchValue =
        searchInput
          ? searchInput.value.trim()
          : "";

      dt.clear();
      dt.rows.add(
        rows
      );
      dt.draw(false);

      dt.search(
        searchValue
      ).draw(false);

      return;
    }

    renderInventoryFallback(
      rows
    );
  }

  function renderInventoryFallback(
    rows
  ) {
    const inventoryTbody =
      getInventoryTableBody();

    if (
      !inventoryTbody
    ) {
      return;
    }

    inventoryTbody.innerHTML =
      "";

    if (
      !rows.length
    ) {
      inventoryTbody.innerHTML =
        `
          <tr>
            <td colspan="12">
              No hay productos registrados.
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
              row.name
            )}
          </td>

          <td>
            ${escapeHtml(
              row.providerName ||
                "Sin proveedor"
            )}
          </td>

          <td>
            ${renderStockDisplay(
              row
            )}
          </td>

          <td>
            ${currency(
              row.price
            )}
          </td>

          <td>
            ${formatQuantity(
              row.soldMonthUnits
            )}
          </td>

          <td>
            ${formatQuantity(
              row.soldMonthBoxes
            )}
          </td>

          <td>
            ${currency(
              row.costPerUnit
            )}
          </td>

          <td>
            ${formatQuantity(
              row.suggestedPurchaseUnits
            )}
          </td>

          <td>
            ${formatQuantity(
              row.suggestedPurchaseBoxes
            )}
          </td>

          <td>
            ${renderStatusChip(
              row.status
            )}
          </td>

          <td>
            ${renderActions(
              row
            )}
          </td>
        `;

        inventoryTbody.appendChild(
          tr
        );
      }
    );
  }

  function renderLowStockPanel(
    list
  ) {
    const lowStockPanel =
      getLowStockPanel();

    if (
      !lowStockPanel
    ) {
      return;
    }

    if (
      !list.length
    ) {
      lowStockPanel.style.display =
        "none";

      lowStockPanel.innerHTML =
        "";

      return;
    }

    lowStockPanel.style.display =
      "block";

    lowStockPanel.innerHTML =
      "";

    list.forEach(
      product => {
        const item =
          document.createElement(
            "div"
          );

        item.className =
          "low-stock-item";

        item.innerHTML = `
          <div>
            <strong>
              ${escapeHtml(
                product.name
              )}
            </strong>

            <div class="small">
              Proveedores:
              ${escapeHtml(
                product.providerName ||
                  "Sin proveedor"
              )}
            </div>
          </div>

          <div>
            Stock:
            <strong>
              ${formatQuantity(
                product.stockUnits
              )}
            </strong>

            |

            Vendido:
            <strong>
              ${formatQuantity(
                product.soldMonthUnits
              )}
            </strong>

            |

            Sugerido:
            <strong>
              ${formatQuantity(
                product.suggestedPurchaseUnits
              )}
            </strong>
          </div>
        `;

        lowStockPanel.appendChild(
          item
        );
      }
    );
  }

  /*
   * ============================================================
   * VENTAS
   * ============================================================
   */

  function getSaleProductId(
    product
  ) {
    return String(
      product?.productId ||
      product?.productID ||
      product?.product_id ||
      product?.id ||
      ""
    ).trim();
  }

  function aggregateMonthlySales(
    documents
  ) {
    const unitsMap = {};

    const boxesMap = {};

    const now =
      new Date();

    const monthStart =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0,
        0,
        0,
        0
      );

    const nextMonthStart =
      new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        1,
        0,
        0,
        0,
        0
      );

    documents.forEach(
      document => {
        const sale =
          document?.data ||
          {};

        if (
          !matchesCurrentLocal(
            sale
          )
        ) {
          return;
        }

        const createdAtMs =
          getTimestampMs(
            sale.createdAt
          );

        if (
          !createdAtMs ||
          createdAtMs <
            monthStart.getTime() ||
          createdAtMs >=
            nextMonthStart.getTime()
        ) {
          return;
        }

        const products =
          Array.isArray(
            sale.products
          )
            ? sale.products
            : [];

        products.forEach(
          product => {
            const productId =
              getSaleProductId(
                product
              );

            if (!productId) {
              return;
            }

            const unitsPerBox =
              Math.max(
                0.000001,
                numberOrZero(
                  product.unitsPerBox
                )
              );

            const mode =
              normalizeText(
                product.mode ||
                  product.saleMode ||
                  product.saleType ||
                  ""
              );

            const quantity =
              decimalOrZero(
                product.quantity
              );

            const totalUnits =
              decimalOrZero(
                product.unitsTotal ??
                  product.totalUnits
              );

            let soldUnits = 0;

            let soldBoxes = 0;

            if (
              mode ===
              "box"
            ) {
              soldBoxes =
                quantity > 0
                  ? quantity
                  : totalUnits > 0
                    ? totalUnits /
                      unitsPerBox
                    : 0;

              soldUnits =
                totalUnits > 0
                  ? totalUnits
                  : soldBoxes *
                    unitsPerBox;
            } else if (
              mode ===
              "unit"
            ) {
              soldUnits =
                totalUnits > 0
                  ? totalUnits
                  : quantity;
            } else if (
              totalUnits > 0
            ) {
              soldUnits =
                totalUnits;
            } else if (
              decimalOrZero(
                product.boxes
              ) > 0
            ) {
              soldBoxes =
                decimalOrZero(
                  product.boxes
                );

              soldUnits =
                soldBoxes *
                  unitsPerBox;
            } else {
              soldUnits =
                quantity;
            }

            unitsMap[
              productId
            ] =
              (
                unitsMap[
                  productId
                ] || 0
              ) +
              soldUnits;

            boxesMap[
              productId
            ] =
              (
                boxesMap[
                  productId
                ] || 0
              ) +
              soldBoxes;
          }
        );
      }
    );

    return {
      unitsMap,
      boxesMap
    };
  }

  function aggregateAllTimeSalesMap(
    documents
  ) {
    const unitsMap = {};

    documents.forEach(
      document => {
        const sale =
          document?.data ||
          {};

        if (
          !matchesCurrentLocal(
            sale
          )
        ) {
          return;
        }

        const products =
          Array.isArray(
            sale.products
          )
            ? sale.products
            : [];

        products.forEach(
          product => {
            const productId =
              getSaleProductId(
                product
              );

            if (!productId) {
              return;
            }

            const unitsPerBox =
              Math.max(
                0.000001,
                numberOrZero(
                  product.unitsPerBox
                )
              );

            const mode =
              normalizeText(
                product.mode ||
                  product.saleMode ||
                  product.saleType ||
                  ""
              );

            const quantity =
              decimalOrZero(
                product.quantity
              );

            const totalUnits =
              decimalOrZero(
                product.unitsTotal ??
                  product.totalUnits
              );

            let soldUnits = 0;

            if (
              mode ===
              "box"
            ) {
              soldUnits =
                totalUnits > 0
                  ? totalUnits
                  : quantity *
                    unitsPerBox;
            } else if (
              mode ===
              "unit"
            ) {
              soldUnits =
                totalUnits > 0
                  ? totalUnits
                  : quantity;
            } else if (
              totalUnits > 0
            ) {
              soldUnits =
                totalUnits;
            } else if (
              decimalOrZero(
                product.boxes
              ) > 0
            ) {
              soldUnits =
                decimalOrZero(
                  product.boxes
                ) *
                unitsPerBox;
            } else {
              soldUnits =
                quantity;
            }

            unitsMap[
              productId
            ] =
              (
                unitsMap[
                  productId
                ] || 0
              ) +
              soldUnits;
          }
        );
      }
    );

    return unitsMap;
  }

  /*
   * ============================================================
   * MOVIMIENTOS / RECONCILIACIÓN
   * ============================================================
   */

  function calculateMovementNetStockMap(
    movementDocuments
  ) {
    const stockMap = {};

    movementDocuments.forEach(
      ({
        id,
        data
      }) => {
        if (
          !matchesCurrentLocal(
            data
          )
        ) {
          return;
        }

        const productId =
          String(
            data?.productId ||
              data?.productID ||
              data?.product_id ||
              ""
          ).trim();

        if (!productId) {
          return;
        }

        const movement =
          normalizeMovementDocument(
            id,
            data
          );

        stockMap[
          productId
        ] =
          (
            stockMap[
              productId
            ] || 0
          ) +
          (
            decimalOrZero(
              movement.entrada
            ) -
            decimalOrZero(
              movement.salida
            )
          );
      }
    );

    return stockMap;
  }

  async function reconcileProductsAgainstMovements(
    products,
    movementDocuments,
    salesDocuments
  ) {
    if (
      !Array.isArray(
        products
      ) ||
      !products.length
    ) {
      return;
    }

    const movementStockMap =
      calculateMovementNetStockMap(
        movementDocuments
      );

    const salesStockMap =
      aggregateAllTimeSalesMap(
        salesDocuments
      );

    const updates = [];

    products.forEach(
      product => {
        const productId =
          String(
            product?.id ||
              ""
          ).trim();

        if (!productId) {
          return;
        }

        const movementNet =
          decimalOrZero(
            movementStockMap[
              productId
            ]
          );

        const historicalSales =
          decimalOrZero(
            salesStockMap[
              productId
            ]
          );

        if (
          movementNet <=
          0 ||
          historicalSales >
            0
        ) {
          return;
        }

        const currentStock =
          getCurrentStockUnits(
            product
          );

        if (
          currentStock ===
          movementNet
        ) {
          return;
        }

        updates.push({
          product,
          stock:
            movementNet
        });
      }
    );

    if (
      !updates.length
    ) {
      return;
    }

    for (
      let index = 0;
      index <
      updates.length;
      index +=
      450
    ) {
      const chunk =
        updates.slice(
          index,
          index + 450
        );

      const batch =
        db.batch();

      chunk.forEach(
        ({
          product,
          stock
        }) => {
          const ref =
            db
              .collection(
                PRODUCTS_COLLECTION
              )
              .doc(
                product.id
              );

          const unitsPerBox =
            getUnitsPerBox(
              product
            );

          batch.update(
            ref,
            {
              quantity:
                stock,

              stockCurrentUnits:
                stock,

              boxes:
                unitsPerBox > 0
                  ? decimalOrZero(
                      stock /
                        unitsPerBox
                    )
                  : 0,

              updatedAt:
                firebase.firestore
                  .FieldValue
                  .serverTimestamp()
            }
          );
        }
      );

      await batch.commit();

      chunk.forEach(
        ({
          product,
          stock
        }) => {
          const unitsPerBox =
            getUnitsPerBox(
              product
            );

          product.quantity =
            stock;

          product.stockCurrentUnits =
            stock;

          product.boxes =
            unitsPerBox > 0
              ? decimalOrZero(
                  stock /
                    unitsPerBox
                )
              : 0;

          upsertSessionDocument(
            PRODUCTS_COLLECTION,
            product.id,
            {
              ...product,
              quantity:
                stock,
              stockCurrentUnits:
                stock,
              boxes:
                product.boxes,
              updatedAt:
                Date.now()
            }
          );
        }
      );
    }
  }

  /*
   * ============================================================
   * CARGA DE INVENTARIO
   * ============================================================
   */

  async function loadInventoryData() {
    if (
      inventoryLoadPromise
    ) {
      return inventoryLoadPromise;
    }

    inventoryLoadPromise =
      (async () => {
        if (
          !currentLocalId
        ) {
          currentProductsList =
            [];

          currentMonthlySalesMap =
            {};

          currentMonthlyBoxesMap =
            {};

          refreshInventoryView();

          return;
        }

        const productDocuments =
          getSessionCollection(
            PRODUCTS_COLLECTION
          );

        const products =
          [];

        productDocuments.forEach(
          ({
            id,
            data
          }) => {
            if (
              !matchesCurrentLocal(
                data
              )
            ) {
              return;
            }

            const productProviders =
              getProductProviders(
                {
                  ...data
                }
              );

            const primaryProvider =
              productProviders[0] ||
              null;

            const stockUnits =
              getCurrentStockUnits(
                data
              );

            products.push({
              id,
              ...data,

              proveedorIds:
                getProviderIds(
                  productProviders
                ),

              proveedorIdsV2:
                getProviderIds(
                  productProviders
                ),

              proveedores:
                productProviders,

              proveedorId:
                primaryProvider?.id ||
                data.proveedorId ||
                null,

              proveedorNombre:
                getProviderName(
                  primaryProvider
                ) ||
                String(
                  data.proveedorNombre ||
                    ""
                ).trim(),

              proveedorRazonSocial:
                getProviderBusinessName(
                  primaryProvider
                ) ||
                String(
                  data.proveedorRazonSocial ||
                    data.proveedorRazonSocialDenominacion ||
                    data.proveedorDenominacion ||
                    ""
                ).trim(),

              id_local:
                currentLocalId,

              localNombre:
                data.localNombre ||
                currentLocalInfo.nombre ||
                "",

              localNumeroDocumento:
                data.localNumeroDocumento ||
                currentLocalInfo.numeroDocumento ||
                "",

              localUbicacion:
                data.localUbicacion ||
                currentLocalInfo.ubicacion ||
                "",

              localContribuyente:
                data.localContribuyente ||
                currentLocalInfo.contribuyente ||
                "",

              localTipoDocumento:
                data.localTipoDocumento ||
                currentLocalInfo.tipoDocumento ||
                "",

              localNIT:
                data.localNIT ||
                currentLocalInfo.nit ||
                "",

              localNRC:
                data.localNRC ||
                currentLocalInfo.nrc ||
                "",

              quantity:
                stockUnits,

              stockCurrentUnits:
                stockUnits,

              unitsPerBox:
                Math.max(
                  0.000001,
                  decimalOrZero(
                    data.unitsPerBox
                  ) || 1
                )
            });
          }
        );

        products.sort(
          (
            a,
            b
          ) =>
            normalizeText(
              a.name
            ).localeCompare(
              normalizeText(
                b.name
              ),
              "es"
            )
        );

        currentProductsList =
          products;

        const salesDocuments =
          getSessionCollection(
            SALES_COLLECTION
          );

        const sales =
          aggregateMonthlySales(
            salesDocuments
          );

        currentMonthlySalesMap =
          sales.unitsMap;

        currentMonthlyBoxesMap =
          sales.boxesMap;

        await reconcileProductsAgainstMovements(
          currentProductsList,
          getSessionCollection(
            MOVEMENTS_COLLECTION
          ),
          salesDocuments
        );

        refreshInventoryView();

        console.log(
          "[Inventario] Datos cargados:",
          {
            productos:
              currentProductsList.length,

            ventas:
              salesDocuments.length,

            proveedores:
              currentProvidersList.length
          }
        );
      })();

    try {
      return await inventoryLoadPromise;
    } finally {
      inventoryLoadPromise =
        null;
    }
  }

  /*
   * ============================================================
   * PRODUCT COMBO
   * ============================================================
   */

  function buildProductCombobox(
    rowId,
    value = ""
  ) {
    return `
      <input
        id="batch-product-${escapeHtml(
          rowId
        )}"
        class="batch-product-input inv-combobox"
        type="text"
        list="batch-product-list-${escapeHtml(
          rowId
        )}"
        value="${escapeHtml(
          value
        )}"
        placeholder="Producto existente o nombre nuevo"
        autocomplete="off"
      >

      <datalist
        id="batch-product-list-${escapeHtml(
          rowId
        )}"
      >
        ${getProductComboOptionsHtml()}
      </datalist>
    `;
  }

  function refreshProductComboboxDatalist(
    rowElement
  ) {
    const input =
      rowElement.querySelector(
        ".batch-product-input"
      );

    if (!input) {
      return;
    }

    const listId =
      input.getAttribute(
        "list"
      );

    if (!listId) {
      return;
    }

    const list =
      document.getElementById(
        listId
      );

    if (!list) {
      return;
    }

    list.innerHTML =
      getProductComboOptionsHtml();
  }

  function getProductComboOptionsHtml() {
    return currentProductsList
      .map(
        product => {
          const name =
            String(
              product.name ||
                ""
            ).trim();

          const code =
            getProductCode(
              product
            );

          const providers =
            getProductProvidersDisplay(
              product
            );

          const display =
            [
              name,
              code,
              providers
            ]
              .filter(Boolean)
              .join(
                " — "
              );

          return `
            <option
              value="${escapeHtml(
                name
              )}"
              label="${escapeHtml(
                display
              )}"
            ></option>
          `;
        }
      )
      .join("");
  }

  function getProductFilterOptionsHtml() {
    return currentProductsList
      .map(
        product => {
          const name =
            String(
              product.name ||
                ""
            ).trim();

          const code =
            getProductCode(
              product
            );

          const providers =
            getProductProvidersDisplay(
              product
            );

          const display =
            [
              name,
              code,
              providers
            ]
              .filter(Boolean)
              .join(
                " — "
              );

          return `
            <option
              value="${escapeHtml(
                name
              )}"
              label="${escapeHtml(
                display
              )}"
            ></option>
          `;
        }
      )
      .join("");
  }

  /*
   * ============================================================
   * LÍNEAS DE CARGA
   * ============================================================
   */

  function createBatchLineData(
    values = {}
  ) {
    batchLineCounter +=
      1;

    const initialUnitsPerBox =
      Math.max(
        0.000001,
        decimalOrZero(
          values.unitsPerBox
        ) || 1
      );

    const initialCostPerBox =
      numberOrZero(
        values.lastCostPerBox ??
          values.costoPorCaja
      );

    const initialCostPerUnit =
      initialCostPerBox > 0
        ? initialCostPerBox /
          initialUnitsPerBox
        : numberOrZero(
            values.lastCostPerUnit ??
              values.costoUnitario
          );

    const initialProviders =
      getLineProviders(
        values
      );

    return {
      id:
        `line-${batchLineCounter}`,

      mode:
        values.mode ||
        "existing",

      productText:
        values.productText ||
        "",

      product:
        values.product ||
        null,

      name:
        values.name ||
        "",

      codigoProducto:
        values.codigoProducto ||
        "",

      proveedorIds:
        getProviderIds(
          initialProviders
        ),

      proveedores:
        initialProviders,

      proveedorId:
        getProviderIds(
          initialProviders
        )[0] ||
        "",

      proveedorNombre:
        getProviderName(
          initialProviders[0]
        ) ||
        "",

      proveedorRazonSocial:
        getProviderBusinessName(
          initialProviders[0]
        ) ||
        "",

      boxes:
        decimalOrZero(
          values.boxes
        ),

      bonusBoxes:
        decimalOrZero(
          values.bonusBoxes
        ),

      units:
        decimalOrZero(
          values.units
        ),

      bonusUnits:
        decimalOrZero(
          values.bonusUnits
        ),

      unitsPerBox:
        initialUnitsPerBox,

      lastCostPerBox:
        initialCostPerBox,

      lastCostPerUnit:
        initialCostPerUnit,

      price:
        numberOrZero(
          values.price
        ),

      referenciaLibro:
        values.referenciaLibro ||
        "",

      numeroDocumento:
        values.numeroDocumento ||
        ""
    };
  }

  /*
   * ============================================================
   * CAMBIO IMPORTANTE:
   *
   * El selector de proveedores SIEMPRE debe mostrar todos los
   * proveedores disponibles del local.
   *
   * Los proveedores del producto y los proveedores ya seleccionados
   * se incorporan a la lista aunque no estén todavía en la caché
   * general, para evitar perder selecciones existentes.
   * ============================================================
   */

  function getBatchLineProviderOptions(
    line
  ) {
    const productProviders =
      getProductProviders(
        line?.product
      );

    const lineProviders =
      getLineProviders(
        line
      );

    return mergeProviderCollections(
      currentProvidersList,
      productProviders,
      lineProviders
    );
  }

  function buildBatchLineHtml(
    line
  ) {
    const isExisting =
      line.mode ===
      "existing";

    const availableProviders =
      getBatchLineProviderOptions(
        line
      );

    const selectedProviderIds =
      getProviderIds(
        line.proveedores
      );

    const lineElement =
      document.createElement(
        "div"
      );

    lineElement.className =
      "batch-product-row";

    lineElement.dataset.lineId =
      line.id;

    lineElement.innerHTML = `
      <div class="batch-row-header">

        <div>
          <strong>
            Producto
          </strong>

          <span
            class="batch-row-total"
            data-role="total"
          >
            0 unidades
          </span>
        </div>

        <button
          type="button"
          class="btn-outline batch-remove-row"
        >
          <i class="fas fa-times"></i>
          Quitar
        </button>

      </div>

      <div class="batch-grid">

        <div class="inv-field">
          <label>
            Tipo
          </label>

          <select class="batch-mode">
            <option
              value="existing"
              ${
                isExisting
                  ? "selected"
                  : ""
              }
            >
              Existente
            </option>

            <option
              value="new"
              ${
                !isExisting
                  ? "selected"
                  : ""
              }
            >
              Nuevo
            </option>
          </select>
        </div>

        <div class="inv-field batch-product-field">
          <label>
            Producto
          </label>

          <div class="batch-product-combobox">
            ${buildProductCombobox(
              line.id,
              line.productText
            )}
          </div>

          <div
            class="batch-product-status"
            data-role="product-status"
          ></div>
        </div>

        <div class="inv-field">
          <label>
            Código
          </label>

          <input
            type="text"
            class="batch-code"
            value="${escapeHtml(
              line.codigoProducto
            )}"
            placeholder="Código"
          >
        </div>

        <div class="inv-field batch-provider-field">
          <label>
            Proveedores
          </label>

          <div
            id="batch-provider-selector-container-${escapeHtml(
              line.id
            )}"
          >
            ${buildProviderMultiSelectHtml(
              `batch-provider-selector-${line.id}`,
              availableProviders,
              selectedProviderIds
            )}
          </div>

          <small>
            Todos los proveedores del local están disponibles.
            Puedes seleccionar uno o varios.
          </small>
        </div>

        <div class="inv-field">
          <label>
            Cajas
          </label>

          <input
            type="number"
            class="batch-boxes"
            min="0"
            step="any"
            inputmode="decimal"
            value="${formatQuantity(
              line.boxes
            )}"
          >
        </div>

        <div class="inv-field bonus-field">
          <label>
            Cajas bono
          </label>

          <input
            type="number"
            class="batch-bonus-boxes"
            min="0"
            step="any"
            inputmode="decimal"
            value="${formatQuantity(
              line.bonusBoxes
            )}"
          >
        </div>

        <div class="inv-field">
          <label>
            Unidades
          </label>

          <input
            type="number"
            class="batch-units"
            min="0"
            step="any"
            inputmode="decimal"
            value="${formatQuantity(
              line.units
            )}"
          >
        </div>

        <div class="inv-field bonus-field">
          <label>
            Unidades bono
          </label>

          <input
            type="number"
            class="batch-bonus-units"
            min="0"
            step="any"
            inputmode="decimal"
            value="${formatQuantity(
              line.bonusUnits
            )}"
          >
        </div>

        <div class="inv-field">
          <label>
            Unidades por caja
          </label>

          <input
            type="number"
            class="batch-units-per-box"
            min="0.000001"
            step="any"
            inputmode="decimal"
            value="${formatQuantity(
              line.unitsPerBox
            )}"
          >

          <small>
            Editable para productos nuevos y existentes.
          </small>
        </div>

        <div class="inv-field">
          <label>
            Costo por caja
          </label>

          <input
            type="number"
            class="batch-cost-box"
            min="0"
            step="0.01"
            inputmode="decimal"
            value="${line.lastCostPerBox}"
          >
        </div>

        <div class="inv-field">
          <label>
            Costo por unidad
          </label>

          <input
            type="text"
            class="batch-cost-unit"
            value="${line.lastCostPerUnit.toFixed(
              4
            )}"
            readonly
          >
        </div>

        <div class="inv-field">
          <label>
            Precio
          </label>

          <input
            type="number"
            class="batch-price"
            min="0"
            step="0.01"
            inputmode="decimal"
            value="${line.price}"
          >
        </div>

        <div class="inv-field">
          <label>
            Referencia libro
          </label>

          <input
            type="text"
            class="batch-reference"
            value="${escapeHtml(
              line.referenciaLibro
            )}"
            placeholder="Compra / Inventario"
          >
        </div>

        <div class="inv-field">
          <label>
            Documento
          </label>

          <input
            type="text"
            class="batch-document"
            value="${escapeHtml(
              line.numeroDocumento
            )}"
            placeholder="Factura / documento"
          >
        </div>

      </div>

      <div class="batch-row-summary">

        <span>
          Stock agregado:
          <strong data-role="total">
            0
          </strong>
          unidades
        </span>

        <span>
          Cajas totales:
          <strong data-role="total-boxes">
            0
          </strong>
        </span>

        <span>
          Normales:
          <strong data-role="normal-units">
            0
          </strong>
        </span>

        <span>
          Bonificadas:
          <strong data-role="bonus-units">
            0
          </strong>
        </span>

      </div>
    `;

    bindBatchLineEvents(
      lineElement
    );

    updateBatchLineState(
      lineElement
    );

    return lineElement;
  }

  function readBatchLine(
    row
  ) {
    const mode =
      String(
        row.querySelector(
          ".batch-mode"
        )?.value ||
        ""
      ).trim();

    const productText =
      String(
        row.querySelector(
          ".batch-product-input"
        )?.value ||
        ""
      ).trim();

    const code =
      String(
        row.querySelector(
          ".batch-code"
        )?.value ||
        ""
      ).trim();

    const providerRoot =
      row.querySelector(
        '[data-role="provider-selector"]'
      );

    const providerIds =
      getSelectedProviderIdsFromSelector(
        providerRoot
      );

    const providers =
      providerIds
        .map(
          providerId =>
            getProviderById(
              providerId
            )
        )
        .filter(Boolean);

    const boxes =
      decimalOrZero(
        row.querySelector(
          ".batch-boxes"
        )?.value
      );

    const bonusBoxes =
      decimalOrZero(
        row.querySelector(
          ".batch-bonus-boxes"
        )?.value
      );

    const units =
      decimalOrZero(
        row.querySelector(
          ".batch-units"
        )?.value
      );

    const bonusUnits =
      decimalOrZero(
        row.querySelector(
          ".batch-bonus-units"
        )?.value
      );

    const unitsPerBox =
      Math.max(
        0.000001,
        decimalOrZero(
          row.querySelector(
            ".batch-units-per-box"
          )?.value
        ) || 1
      );

    const lastCostPerBox =
      Math.max(
        0,
        numberOrZero(
          row.querySelector(
            ".batch-cost-box"
          )?.value
        )
      );

    const lastCostPerUnit =
      unitsPerBox > 0
        ? lastCostPerBox /
          unitsPerBox
        : 0;

    const price =
      Math.max(
        0,
        numberOrZero(
          row.querySelector(
            ".batch-price"
          )?.value
        )
      );

    const referenciaLibro =
      String(
        row.querySelector(
          ".batch-reference"
        )?.value ||
        ""
      ).trim();

    const numeroDocumento =
      String(
        row.querySelector(
          ".batch-document"
        )?.value ||
        ""
      ).trim();

    const matchedProduct =
      findProductByText(
        productText
      );

    return {
      id:
        row.dataset.lineId ||
        "",

      mode,

      productText,

      product:
        matchedProduct,

      name:
        mode ===
          "new"
          ? productText
          : (
              matchedProduct?.name ||
              productText
            ),

      codigoProducto:
        code ||
        getProductCode(
          matchedProduct
        ) ||
        "",

      proveedorIds:
        providerIds,

      proveedores:
        providers,

      proveedorId:
        providerIds[0] ||
        "",

      proveedorNombre:
        getProviderName(
          providers[0]
        ) ||
        "",

      proveedorRazonSocial:
        getProviderBusinessName(
          providers[0]
        ) ||
        "",

      boxes,

      bonusBoxes,

      units,

      bonusUnits,

      unitsPerBox,

      lastCostPerBox,

      lastCostPerUnit,

      price,

      referenciaLibro,

      numeroDocumento
    };
  }

  /*
   * ============================================================
   * REFRESCAR SELECTOR DE PROVEEDORES
   *
   * Ahora:
   * - siempre muestra todos los proveedores del local;
   * - incorpora los proveedores asociados al producto;
   * - incorpora selecciones previas;
   * - al cambiar de producto, marca inicialmente todos los
   *   proveedores ya asociados al nuevo producto;
   * - una vez inicializado ese producto, respeta exactamente
   *   lo que el usuario seleccione o quite.
   * ============================================================
   */

  function refreshBatchProviderSelector(
    row,
    product,
    currentProviderIds
  ) {
    const root =
      row.querySelector(
        '[data-role="provider-selector"]'
      );

    if (!root) {
      return [];
    }

    const currentIds =
      normalizeIdArray(
        currentProviderIds
      );

    const productProviders =
      getProductProviders(
        product
      );

    const currentSelectedProviders =
      currentIds.map(
        id =>
          getProviderById(
            id
          )
      );

    /*
     * IMPORTANTE:
     * Siempre incluir currentProvidersList.
     *
     * Antes el código hacía:
     *
     * productProviders.length
     *   ? productProviders
     *   : currentProvidersList
     *
     * Eso provocaba que al seleccionar un producto
     * desaparecieran todos los proveedores globales.
     */

    const available =
      mergeProviderCollections(
        currentProvidersList,
        productProviders,
        currentSelectedProviders
      );

    const productId =
      String(
        product?.id ||
        ""
      ).trim();

    const previousProductId =
      String(
        root.dataset.productId ||
        ""
      ).trim();

    const productChanged =
      productId !==
      previousProductId;

    let selectedIds =
      currentIds;

    /*
     * Cuando el usuario acaba de seleccionar otro producto,
     * se inicializa la selección con TODOS los proveedores
     * que ya estaban asociados a ese producto.
     *
     * Esto no vuelve a seleccionar automáticamente proveedores
     * después de que el usuario los quite, porque solamente
     * ocurre cuando cambia el productId.
     */

    if (
      productChanged
    ) {
      selectedIds =
        getProviderIds(
          productProviders
        );

      root.dataset.productId =
        productId;
    }

    /*
     * Solo conservar proveedores que realmente estén
     * disponibles en la lista mostrada.
     */

    const availableIds =
      getProviderIds(
        available
      );

    selectedIds =
      normalizeIdArray(
        selectedIds
      ).filter(
        id =>
          availableIds.includes(
            id
          )
      );

    return setProviderSelector(
      root,
      available,
      selectedIds,
      false
    );
  }

  function updateBatchLineState(
    row
  ) {
    let data =
      readBatchLine(
        row
      );

    const product =
      data.product;

    const providerRoot =
      row.querySelector(
        '[data-role="provider-selector"]'
      );

    if (
      providerRoot
    ) {
      const beforeIds =
        getSelectedProviderIdsFromSelector(
          providerRoot
        );

      const selectedIds =
        refreshBatchProviderSelector(
          row,
          product,
          beforeIds
        );

      if (
        selectedIds.join("|") !==
        beforeIds.join("|")
      ) {
        data =
          readBatchLine(
            row
          );
      }
    }

    const mode =
      data.mode;

    const codeInput =
      row.querySelector(
        ".batch-code"
      );

    const unitsPerBoxInput =
      row.querySelector(
        ".batch-units-per-box"
      );

    const costBoxInput =
      row.querySelector(
        ".batch-cost-box"
      );

    const costUnitInput =
      row.querySelector(
        ".batch-cost-unit"
      );

    const priceInput =
      row.querySelector(
        ".batch-price"
      );

    const status =
      row.querySelector(
        '[data-role="product-status"]'
      );

    const totalElement =
      row.querySelector(
        '[data-role="total"]'
      );

    const totalBoxesElement =
      row.querySelector(
        '[data-role="total-boxes"]'
      );

    const normalUnitsElement =
      row.querySelector(
        '[data-role="normal-units"]'
      );

    const bonusUnitsElement =
      row.querySelector(
        '[data-role="bonus-units"]'
      );

    const totalNormal =
      decimalOrZero(
        data.boxes *
          data.unitsPerBox +
          data.units
      );

    const totalBonus =
      decimalOrZero(
        data.bonusBoxes *
          data.unitsPerBox +
          data.bonusUnits
      );

    const totalUnits =
      decimalOrZero(
        totalNormal +
          totalBonus
      );

    const totalBoxes =
      decimalOrZero(
        data.boxes +
          data.bonusBoxes
      );

    const calculatedCostPerUnit =
      data.unitsPerBox > 0
        ? data.lastCostPerBox /
          data.unitsPerBox
        : 0;

    if (
      costUnitInput
    ) {
      costUnitInput.value =
        calculatedCostPerUnit.toFixed(
          4
        );
    }

    if (
      totalElement
    ) {
      totalElement.textContent =
        formatQuantity(
          totalUnits
        );
    }

    if (
      totalBoxesElement
    ) {
      totalBoxesElement.textContent =
        formatQuantity(
          totalBoxes
        );
    }

    if (
      normalUnitsElement
    ) {
      normalUnitsElement.textContent =
        formatQuantity(
          totalNormal
        );
    }

    if (
      bonusUnitsElement
    ) {
      bonusUnitsElement.textContent =
        formatQuantity(
          totalBonus
        );
    }

    if (
      mode ===
      "existing"
    ) {
      if (
        product
      ) {
        const productUnitsPerBox =
          getUnitsPerBox(
            product
          );

        const enteredUnitsPerBox =
          Math.max(
            0.000001,
            decimalOrZero(
              unitsPerBoxInput?.value
            ) ||
              productUnitsPerBox
          );

        if (
          unitsPerBoxInput &&
          !String(
            unitsPerBoxInput.value ||
              ""
          ).trim()
        ) {
          unitsPerBoxInput.value =
            formatQuantity(
              productUnitsPerBox
            );
        }

        if (
          status
        ) {
          const providerCount =
            getProductProviders(
              product
            ).length;

          const totalAvailableProviders =
            currentProvidersList.length;

          status.innerHTML = `
            <span class="batch-status success">
              Producto encontrado:
              ${escapeHtml(
                product.name
              )}
              · Stock actual:
              ${formatQuantity(
                getCurrentStockUnits(
                  product
                )
              )}
              ·
              ${formatQuantity(
                enteredUnitsPerBox
              )}
              unid./caja
              ·
              ${
                providerCount
              }
              proveedor${
                providerCount ===
                1
                  ? ""
                  : "es"
              }
              asociado${
                providerCount ===
                1
                  ? ""
                  : "s"
              }
              ·
              ${
                totalAvailableProviders
              }
              disponible${
                totalAvailableProviders ===
                1
                  ? ""
                  : "s"
              }
            </span>
          `;
        }

        if (
          codeInput &&
          !String(
            codeInput.value ||
              ""
          ).trim()
        ) {
          codeInput.value =
            getProductCode(
              product
            ) ||
            "";
        }

        if (
          costBoxInput &&
          numberOrZero(
            costBoxInput.value
          ) <=
            0
        ) {
          const existingCostBox =
            numberOrZero(
              product.lastCostPerBox
            );

          const existingCostUnit =
            numberOrZero(
              product.lastCostPerUnit
            );

          costBoxInput.value =
            String(
              existingCostBox > 0
                ? existingCostBox
                : existingCostUnit *
                  enteredUnitsPerBox
            );
        }

        if (
          priceInput &&
          numberOrZero(
            priceInput.value
          ) <=
            0
        ) {
          priceInput.value =
            String(
              numberOrZero(
                product.price
              )
            );
        }
      } else if (
        status
      ) {
        status.innerHTML = `
          <span class="batch-status warning">
            Escribe o selecciona un producto existente.
          </span>
        `;
      }
    } else {
      if (
        status
      ) {
        status.innerHTML = `
          <span class="batch-status info">
            Producto nuevo
          </span>
        `;
      }

      if (
        product &&
        normalizeText(
          product.name
        ) ===
          normalizeText(
            data.name
          )
      ) {
        if (
          status
        ) {
          status.innerHTML = `
            <span class="batch-status danger">
              Ese producto ya existe. Usa "Existente".
            </span>
          `;
        }
      }
    }
  }

  function bindBatchLineEvents(
    row
  ) {
    const modeElement =
      row.querySelector(
        ".batch-mode"
      );

    const productElement =
      row.querySelector(
        ".batch-product-input"
      );

    const removeButton =
      row.querySelector(
        ".batch-remove-row"
      );

    if (
      modeElement
    ) {
      modeElement.addEventListener(
        "change",
        () => {
          /*
           * Al cambiar de tipo, permitir que el selector
           * vuelva a sincronizarse con el producto actual.
           */
          const providerRoot =
            row.querySelector(
              '[data-role="provider-selector"]'
            );

          if (
            providerRoot
          ) {
            delete providerRoot.dataset.productId;
          }

          updateBatchLineState(
            row
          );
        }
      );
    }

    if (
      productElement
    ) {
      [
        "input",
        "change"
      ].forEach(
        eventName => {
          productElement.addEventListener(
            eventName,
            () => {
              updateBatchLineState(
                row
              );
            }
          );
        }
      );
    }

    row.querySelectorAll(
      "input, select"
    ).forEach(
      input => {
        if (
          input ===
            productElement ||
          input ===
            modeElement ||
          input.classList.contains(
            "provider-multi-search"
          ) ||
          input.classList.contains(
            "provider-multi-checkbox"
          )
        ) {
          return;
        }

        input.addEventListener(
          "input",
          () => {
            updateBatchLineState(
              row
            );
          }
        );

        input.addEventListener(
          "change",
          () => {
            updateBatchLineState(
              row
            );
          }
        );
      }
    );

    if (
      removeButton
    ) {
      removeButton.addEventListener(
        "click",
        () => {
          row.remove();

          updateBatchLineNumbers();
        }
      );
    }
  }

  function updateBatchLineNumbers() {
    document
      .querySelectorAll(
        ".batch-product-row"
      )
      .forEach(
        (
          row,
          index
        ) => {
          const title =
            row.querySelector(
              ".batch-row-header strong"
            );

          if (
            title
          ) {
            title.textContent =
              `Producto ${
                index + 1
              }`;
          }

          refreshProductComboboxDatalist(
            row
          );
        }
      );
  }

  function addBatchLine(
    container,
    values = {}
  ) {
    const line =
      createBatchLineData(
        values
      );

    const row =
      buildBatchLineHtml(
        line
      );

    container.appendChild(
      row
    );

    updateBatchLineNumbers();

    row
      .querySelector(
        ".batch-product-input"
      )
      ?.focus();

    return row;
  }

  /*
   * ============================================================
   * VALIDACIÓN BATCH
   * ============================================================
   */

  function validateBatchLines(
    rows
  ) {
    const errors =
      [];

    const parsed =
      rows.map(
        readBatchLine
      );

    const namesForNew =
      new Set();

    parsed.forEach(
      (
        line,
        index
      ) => {
        const label =
          `Producto ${
            index + 1
          }`;

        if (
          !line.productText
        ) {
          errors.push(
            `${label}: debes indicar el producto.`
          );

          return;
        }

        if (
          line.mode ===
          "existing"
        ) {
          if (
            !line.product
          ) {
            errors.push(
              `${label}: no se encontró el producto existente "${line.productText}".`
            );

            return;
          }
        }

        if (
          line.mode ===
          "new"
        ) {
          if (
            !line.name
          ) {
            errors.push(
              `${label}: el nombre es obligatorio.`
            );
          }

          const newKey =
            normalizeText(
              line.name
            );

          if (
            findProductByText(
              line.name
            )
          ) {
            errors.push(
              `${label}: "${line.name}" ya existe. Selecciona "Existente".`
            );
          }

          if (
            namesForNew.has(
              newKey
            )
          ) {
            errors.push(
              `${label}: el mismo producto nuevo aparece más de una vez.`
            );
          }

          namesForNew.add(
            newKey
          );

          if (
            !line.codigoProducto
          ) {
            errors.push(
              `${label}: el código es obligatorio para un producto nuevo.`
            );
          }
        }

        const totalUnits =
          decimalOrZero(
            (
              line.boxes +
              line.bonusBoxes
            ) *
              line.unitsPerBox +
              line.units +
              line.bonusUnits
          );

        if (
          totalUnits <=
          0
        ) {
          errors.push(
            `${label}: debes ingresar cajas, cajas bono, unidades o unidades bono.`
          );
        }

        if (
          line.unitsPerBox <=
          0
        ) {
          errors.push(
            `${label}: las unidades por caja deben ser mayores que cero.`
          );
        }

        if (
          line.lastCostPerBox <
          0
        ) {
          errors.push(
            `${label}: el costo por caja no puede ser negativo.`
          );
        }

        if (
          line.price <
          0
        ) {
          errors.push(
            `${label}: el precio no puede ser negativo.`
          );
        }

        /*
         * No obligamos a tener proveedor.
         * Pero si hay proveedores seleccionados,
         * todos deben existir en la lista actual.
         */
        const selectedIds =
          normalizeIdArray(
            line.proveedorIds
          );

        const missingProviders =
          selectedIds.filter(
            providerId =>
              !getProviderById(
                providerId
              )
          );

        if (
          missingProviders.length
        ) {
          errors.push(
            `${label}: uno o más proveedores seleccionados no están disponibles en el local actual.`
          );
        }
      }
    );

    return {
      errors,
      parsed
    };
  }

  /*
   * ============================================================
   * GASTO
   * ============================================================
   */

  function buildInventoryExpenseDetails(
    lines
  ) {
    return lines
      .map(
        (
          line,
          index
        ) => {
          const product =
            line.product ||
            null;

          const cost =
            calculateLinePurchaseCost(
              line,
              product
            );

          const paidBoxes =
            decimalOrZero(
              line.boxes
            );

          const paidUnits =
            decimalOrZero(
              line.units
            );

          const bonusBoxes =
            decimalOrZero(
              line.bonusBoxes
            );

          const bonusUnits =
            decimalOrZero(
              line.bonusUnits
            );

          const unitsPerBox =
            getEffectiveUnitsPerBox(
              line,
              product
            );

          const costPerUnit =
            getEffectiveCostPerUnitForLine(
              line,
              product
            );

          const costPerBox =
            costPerUnit *
            unitsPerBox;

          const providerDisplay =
            getLineProvidersDisplay(
              line
            );

          return [
            `${
              index + 1
            }. ${
              line.name ||
              line.productText ||
              "Producto"
            }`,

            `Cajas pagadas: ${formatQuantity(
              paidBoxes
            )}`,

            `Unidades pagadas: ${formatQuantity(
              paidUnits
            )}`,

            `Cajas bono: ${formatQuantity(
              bonusBoxes
            )}`,

            `Unidades bono: ${formatQuantity(
              bonusUnits
            )}`,

            `Unidades por caja: ${formatQuantity(
              unitsPerBox
            )}`,

            `Costo por unidad: ${currency(
              costPerUnit
            )}`,

            `Costo por caja: ${currency(
              costPerBox
            )}`,

            `Costo línea: ${currency(
              cost
            )}`,

            `Proveedores: ${providerDisplay}`
          ].join(
            " | "
          );
        }
      )
      .join(
        "\n"
      );
  }

  async function registerInventoryExpense(
    totalAmount,
    lines,
    user,
    operationDate
  ) {
    const amount =
      Math.max(
        0,
        numberOrZero(
          totalAmount
        )
      );

    if (
      amount <=
      0
    ) {
      return {
        created:
          false,

        amount:
          0,

        id:
          ""
      };
    }

    const validOperationDate =
      operationDate instanceof Date
        ? operationDate
        : parseOperationDate(
            operationDate
          );

    if (
      !validOperationDate
    ) {
      throw new Error(
        "La fecha de operación no es válida para registrar el gasto."
      );
    }

    const operationTimestamp =
      buildOperationTimestamp(
        validOperationDate
      );

    const context =
      currentUserInventoryContext ||
      {};

    const localInfo =
      currentLocalInfo ||
      {};

    const productCount =
      Array.isArray(
        lines
      )
        ? lines.length
        : 0;

    const totalUnits =
      Array.isArray(
        lines
      )
        ? lines.reduce(
            (
              sum,
              line
            ) => {
              const product =
                line.product ||
                null;

              const unitsPerBox =
                getEffectiveUnitsPerBox(
                  line,
                  product
                );

              return (
                sum +
                (
                  decimalOrZero(
                    line.boxes
                  ) +
                  decimalOrZero(
                    line.bonusBoxes
                  )
                ) *
                  unitsPerBox +
                decimalOrZero(
                  line.units
                ) +
                decimalOrZero(
                  line.bonusUnits
                )
              );
            },
            0
          )
        : 0;

    const expenseRef =
      db
        .collection(
          EXPENSES_COLLECTION
        )
        .doc();

    const concept =
      productCount ===
        1
        ? `Compra de inventario - ${
            lines[0]?.name ||
            lines[0]?.productText ||
            "Producto"
          }`
        : `Compra de inventario - ${productCount} productos`;

    const details =
      buildInventoryExpenseDetails(
        lines
      );

    const notes =
      [
        "Gasto generado automáticamente desde Inventario.",
        "Las cantidades bono no generan costo.",
        "El costo por caja equivale al costo por unidad multiplicado por las unidades por caja.",
        `Fecha de operación: ${formatOperationDate(
          validOperationDate
        )}`,
        `Productos ingresados: ${productCount}`,
        `Unidades totales ingresadas: ${formatQuantity(
          totalUnits
        )}`,
        "",
        details
      ].join(
        "\n"
      );

    const expenseData = {
      concept,

      category:
        "Inventario",

      amount,

      paymentMethod:
        "No especificado",

      notes,

      dayKey:
        getInventoryDayKey(
          validOperationDate
        ),

      userId:
        user
          ? user.uid
          : auth.currentUser
            ? auth.currentUser.uid
            : null,

      userName:
        context.name ||
        user?.email ||
        "Usuario",

      id_local:
        currentLocalId,

      localNombre:
        localInfo.nombre ||
        "",

      localNumeroDocumento:
        localInfo.numeroDocumento ||
        "",

      localUbicacion:
        localInfo.ubicacion ||
        "",

      localContribuyente:
        localInfo.contribuyente ||
        "",

      localTipoDocumento:
        localInfo.tipoDocumento ||
        "",

      localNIT:
        localInfo.nit ||
        "",

      localNRC:
        localInfo.nrc ||
        "",

      source:
        "inventario",

      inventoryOperation:
        true,

      inventoryOperationDate:
        getLocalDateInputValue(
          validOperationDate
        ),

      inventoryProductCount:
        productCount,

      inventoryTotalUnits:
        totalUnits
    };

    await expenseRef.set({
      ...expenseData,

      createdAt:
        operationTimestamp
    });

    upsertSessionDocument(
      EXPENSES_COLLECTION,
      expenseRef.id,
      {
        ...expenseData,

        createdAt:
          operationTimestamp.toMillis()
      }
    );

    return {
      created:
        true,

      amount,

      id:
        expenseRef.id
    };
  }

  async function attachExpenseToMovements(
    expenseId,
    results
  ) {
    const movementIds =
      Array.from(
        new Set(
          (results || [])
            .map(
              result =>
                String(
                  result?.movementId ||
                    ""
                ).trim()
            )
            .filter(Boolean)
        )
      );

    if (
      !expenseId ||
      !movementIds.length
    ) {
      return;
    }

    const batch =
      db.batch();

    movementIds.forEach(
      movementId => {
        batch.update(
          db
            .collection(
              MOVEMENTS_COLLECTION
            )
            .doc(
              movementId
            ),
          {
            expenseId,

            updatedAt:
              firebase.firestore
                .FieldValue
                .serverTimestamp()
          }
        );
      }
    );

    await batch.commit();

    movementIds.forEach(
      movementId => {
        const current =
          getSessionCollection(
            MOVEMENTS_COLLECTION
          ).find(
            item =>
              String(
                item.id
              ) ===
              movementId
          );

        if (
          current
        ) {
          upsertSessionDocument(
            MOVEMENTS_COLLECTION,
            movementId,
            {
              ...(current.data || {}),

              expenseId,

              updatedAt:
                Date.now()
            }
          );
        }
      }
    );

    invalidateAllMovementsCache();
  }

  /*
   * ============================================================
   * MOVIMIENTOS
   * ============================================================
   */

  function getMovementUnitsPerBox(
    movement,
    product = null
  ) {
    const movementValue =
      decimalOrZero(
        movement?.unidadesPorCaja ??
          movement?.unitsPerBox
      );

    if (
      movementValue > 0
    ) {
      return movementValue;
    }

    const productValue =
      product
        ? decimalOrZero(
            product.unitsPerBox
          )
        : 0;

    return productValue > 0
      ? productValue
      : 1;
  }

  function getMovementBreakdown(
    movement,
    product = null
  ) {
    const unitsPerBox =
      getMovementUnitsPerBox(
        movement,
        product
      );

    const hasExplicitBreakdown =
      movement?.cajas !==
        undefined ||
      movement?.cajasBono !==
        undefined ||
      movement?.unidades !==
        undefined ||
      movement?.unidadesBono !==
        undefined ||
      movement?.boxes !==
        undefined ||
      movement?.bonusBoxes !==
        undefined ||
      movement?.units !==
        undefined ||
      movement?.bonusUnits !==
        undefined;

    let cajas =
      decimalOrZero(
        movement?.cajas ??
          movement?.boxes
      );

    let cajasBono =
      decimalOrZero(
        movement?.cajasBono ??
          movement?.bonusBoxes
      );

    let unidades =
      decimalOrZero(
        movement?.unidades ??
          movement?.units
      );

    let unidadesBono =
      decimalOrZero(
        movement?.unidadesBono ??
          movement?.bonusUnits
      );

    if (
      !hasExplicitBreakdown
    ) {
      let paidUnits =
        decimalOrZero(
          movement?.entradaPagada
        );

      let bonusUnits =
        decimalOrZero(
          movement?.entradaBono
        );

      if (
        paidUnits <=
          0 &&
        bonusUnits <=
          0
      ) {
        paidUnits =
          Math.max(
            0,
            decimalOrZero(
              movement?.entrada
            )
          );
      }

      cajas =
        unitsPerBox > 0
          ? decimalOrZero(
              paidUnits /
                unitsPerBox
            )
          : 0;

      unidades =
        0;

      cajasBono =
        unitsPerBox > 0
          ? decimalOrZero(
              bonusUnits /
                unitsPerBox
            )
          : 0;

      unidadesBono =
        0;
    }

    const paidUnits =
      decimalOrZero(
        cajas *
          unitsPerBox +
          unidades
      );

    const bonusUnits =
      decimalOrZero(
        cajasBono *
          unitsPerBox +
          unidadesBono
      );

    const totalUnits =
      decimalOrZero(
        paidUnits +
          bonusUnits
      );

    return {
      cajas,
      cajasBono,
      unidades,
      unidadesBono,
      unitsPerBox,
      paidUnits,
      bonusUnits,
      totalUnits
    };
  }

  function normalizeMovementProviders(
    source
  ) {
    const arrayProviders =
      normalizeProviderCollection(
        source?.proveedores ||
          source?.providers ||
          [],
        source?.proveedorIds ||
          source?.providerIds ||
          []
      );

    const legacy =
      normalizeProviderObject({
        id:
          source?.proveedorId ||
          source?.providerId ||
          "",
        nombre:
          source?.proveedorNombre ||
          source?.providerName ||
          "",
        razonSocialDenominacion:
          source?.proveedorRazonSocial ||
          source?.proveedorRazonSocialDenominacion ||
          source?.proveedorDenominacion ||
          source?.providerBusinessName ||
          ""
      });

    return mergeProviderCollections(
      arrayProviders,
      legacy
    );
  }

  function normalizeMovementDocument(
    id,
    data
  ) {
    const source =
      data || {};

    const productId =
      String(
        source.productId ||
          source.productID ||
          source.product_id ||
          ""
      ).trim();

    const product =
      findProductById(
        productId
      );

    const unitsPerBox =
      getMovementUnitsPerBox(
        source,
        product
      );

    const breakdown =
      getMovementBreakdown(
        source,
        product
      );

    const entrada =
      breakdown.totalUnits > 0
        ? breakdown.totalUnits
        : decimalOrZero(
            source.entrada
          );

    const salida =
      decimalOrZero(
        source.salida
      );

    const costoUnitario =
      numberOrZero(
        source.costoUnitario
      ) > 0
        ? numberOrZero(
            source.costoUnitario
          )
        : numberOrZero(
            source.costoPorUnidad
          );

    const costoPorCaja =
      numberOrZero(
        source.costoPorCaja
      ) > 0
        ? numberOrZero(
            source.costoPorCaja
          )
        : costoUnitario *
          unitsPerBox;

    const precioVenta =
      numberOrZero(
        source.precioVenta ??
          source.price
      );

    const costoTotal =
      source.costoTotal !==
        undefined &&
      source.costoTotal !==
        null
        ? Math.max(
            0,
            numberOrZero(
              source.costoTotal
            )
          )
        : Math.max(
            0,
            breakdown.paidUnits *
              costoUnitario
          );

    const providers =
      normalizeMovementProviders(
        source
      );

    const providerIds =
      getProviderIds(
        providers
      );

    const providerName =
      providers
        .map(
          provider =>
            getProviderName(
              provider
            )
        )
        .filter(Boolean)
        .join(" | ");

    const providerReason =
      providers
        .map(
          provider =>
            getProviderBusinessName(
              provider
            )
        )
        .filter(Boolean)
        .join(" | ");

    return {
      id,

      ...source,

      productId,

      productName:
        String(
          source.productName ||
            product?.name ||
            ""
        ).trim(),

      codigoProducto:
        String(
          source.codigoProducto ||
            source.productCode ||
            getProductCode(
              product
            ) ||
            ""
        ).trim(),

      proveedores:
        providers,

      proveedorIds:
        providerIds,

      providerIds:
        providerIds,

      providerList:
        providers,

      providerDisplay:
        providers.length
          ? providers
              .map(
                provider =>
                  getProviderDisplayName(
                    provider
                  )
              )
              .filter(Boolean)
              .join(" | ")
          : "Sin proveedor",

      proveedorId:
        providerIds[0] ||
        getProductProviderId(
          product
        ) ||
        "",

      proveedorNombre:
        providerName ||
        getProductProviderName(
          product
        ) ||
        "",

      proveedorRazonSocial:
        providerReason ||
        getProductProviderReason(
          product
        ) ||
        "",

      providerId:
        providerIds[0] ||
        getProductProviderId(
          product
        ) ||
        "",

      providerName:
        providerName ||
        getProductProviderName(
          product
        ) ||
        "",

      providerBusinessName:
        providerReason ||
        getProductProviderReason(
          product
        ) ||
        "",

      tipoMovimiento:
        String(
          source.tipoMovimiento ||
            ""
        )
          .trim()
          .toLowerCase(),

      referenciaLibro:
        String(
          source.referenciaLibro ||
            source.referenceBook ||
            source.bookReference ||
            ""
        ).trim(),

      numeroDocumento:
        String(
          source.numeroDocumento ||
            source.documentNumber ||
            ""
        ).trim(),

      entrada,

      salida,

      saldoAnterior:
        numberOrZero(
          source.saldoAnterior
        ),

      saldoActual:
        numberOrZero(
          source.saldoActual
        ),

      cajas:
        breakdown.cajas,

      boxes:
        breakdown.cajas,

      cajasBono:
        breakdown.cajasBono,

      bonusBoxes:
        breakdown.cajasBono,

      unidades:
        breakdown.unidades,

      units:
        breakdown.unidades,

      unidadesBono:
        breakdown.unidadesBono,

      bonusUnits:
        breakdown.unidadesBono,

      unidadesPorCaja:
        unitsPerBox,

      unitsPerBox,

      entradaPagada:
        breakdown.paidUnits,

      entradaBono:
        breakdown.bonusUnits,

      costoUnitario,

      unitCost:
        costoUnitario,

      costoPorUnidad:
        costoUnitario,

      costoPorCaja,

      lastCostPerBox:
        costoPorCaja,

      precioVenta,

      price:
        precioVenta,

      costoTotal,

      expenseId:
        String(
          source.expenseId ||
            ""
        ).trim(),

      detalle:
        String(
          source.detalle ||
            ""
        ),

      conversionId:
        String(
          source.conversionId ||
            ""
        ).trim(),

      conversionType:
        String(
          source.conversionType ||
            ""
        ).trim(),

      fechaOperacion:
        getMovementOperationDateValue(
          source
        ),

      createdAtMs:
        getTimestampMs(
          source.createdAt
        )
    };
  }

  function buildMovementData({
    productId,
    productName,
    codigoProducto,
    tipoMovimiento,
    referenciaLibro,
    numeroDocumento,
    entrada,
    salida,
    saldoAnterior,
    saldoActual,

    cajas = 0,
    cajasBono = 0,
    unidades = 0,
    unidadesBono = 0,
    unidadesPorCaja = 1,

    costoUnitario = 0,
    costoPorCaja = 0,
    precioVenta = 0,

    costoTotal,
    entradaPagada,
    entradaBono,

    proveedorId = "",
    proveedorNombre = "",
    proveedorRazonSocial = "",

    proveedorIds = [],
    proveedores = [],

    detalle,
    user,
    operationDate,
    expenseId = "",

    conversionId = "",
    conversionType = ""
  }) {
    const context =
      currentUserInventoryContext ||
      {};

    const validOperationDate =
      operationDate instanceof Date
        ? operationDate
        : parseOperationDate(
            operationDate
          );

    const normalizedUnitsPerBox =
      Math.max(
        0.000001,
        decimalOrZero(
          unidadesPorCaja
        ) || 1
      );

    const normalizedBoxes =
      decimalOrZero(
        cajas
      );

    const normalizedBonusBoxes =
      decimalOrZero(
        cajasBono
      );

    const normalizedUnits =
      decimalOrZero(
        unidades
      );

    const normalizedBonusUnits =
      decimalOrZero(
        unidadesBono
      );

    const calculatedPaidUnits =
      decimalOrZero(
        normalizedBoxes *
          normalizedUnitsPerBox +
          normalizedUnits
      );

    const calculatedBonusUnits =
      decimalOrZero(
        normalizedBonusBoxes *
          normalizedUnitsPerBox +
          normalizedBonusUnits
      );

    const normalizedPaidUnits =
      entradaPagada !==
        undefined &&
      entradaPagada !==
        null
        ? decimalOrZero(
            entradaPagada
          )
        : calculatedPaidUnits;

    const normalizedBonusUnitsTotal =
      entradaBono !==
        undefined &&
      entradaBono !==
        null
        ? decimalOrZero(
            entradaBono
          )
        : calculatedBonusUnits;

    const normalizedEntry =
      entrada !==
        undefined &&
      entrada !==
        null
        ? decimalOrZero(
            entrada
          )
        : decimalOrZero(
            normalizedPaidUnits +
              normalizedBonusUnitsTotal
          );

    let normalizedCostUnit =
      Math.max(
        0,
        numberOrZero(
          costoUnitario
        )
      );

    let normalizedCostBox =
      Math.max(
        0,
        numberOrZero(
          costoPorCaja
        )
      );

    if (
      normalizedCostBox >
      0
    ) {
      normalizedCostUnit =
        normalizedCostBox /
        normalizedUnitsPerBox;

      normalizedCostBox =
        normalizedCostUnit *
        normalizedUnitsPerBox;
    } else {
      normalizedCostBox =
        normalizedCostUnit *
        normalizedUnitsPerBox;
    }

    const normalizedSalePrice =
      Math.max(
        0,
        numberOrZero(
          precioVenta
        )
      );

    const normalizedCostTotal =
      costoTotal !==
        undefined &&
      costoTotal !==
        null
        ? Math.max(
            0,
            numberOrZero(
              costoTotal
            )
          )
        : Math.max(
            0,
            normalizedPaidUnits *
              normalizedCostUnit
          );

    const providerCollection =
      mergeProviderCollections(
        proveedores,
        normalizeIdArray(
          proveedorIds
        ).map(
          id =>
            getProviderById(
              id
            )
        ),
        normalizeProviderObject({
          id:
            proveedorId,
          nombre:
            proveedorNombre,
          razonSocialDenominacion:
            proveedorRazonSocial
        })
      );

    const normalizedProviderIds =
      getProviderIds(
        providerCollection
      );

    const primaryProvider =
      providerCollection[0] ||
      null;

    const providerNames =
      providerCollection
        .map(
          provider =>
            getProviderName(
              provider
            )
        )
        .filter(Boolean);

    const providerReasons =
      providerCollection
        .map(
          provider =>
            getProviderBusinessName(
              provider
            )
        )
        .filter(Boolean);

    const providerDisplay =
      providerCollection.length
        ? providerCollection
            .map(
              provider =>
                getProviderDisplayName(
                  provider
                )
            )
            .filter(Boolean)
            .join(" | ")
        : "Sin proveedor";

    return {
      productId,

      productName:
        productName ||
        "",

      codigoProducto:
        codigoProducto ||
        "",

      productCode:
        codigoProducto ||
        "",

      tipoMovimiento:
        tipoMovimiento ||
        "entrada",

      referenciaLibro:
        referenciaLibro ||
        "",

      referenceBook:
        referenciaLibro ||
        "",

      bookReference:
        referenciaLibro ||
        "",

      numeroDocumento:
        numeroDocumento ||
        "",

      entrada:
        normalizedEntry,

      salida:
        decimalOrZero(
          salida
        ),

      saldoAnterior:
        decimalOrZero(
          saldoAnterior
        ),

      saldoActual:
        decimalOrZero(
          saldoActual
        ),

      cajas:
        normalizedBoxes,

      boxes:
        normalizedBoxes,

      cajasBono:
        normalizedBonusBoxes,

      bonusBoxes:
        normalizedBonusBoxes,

      unidades:
        normalizedUnits,

      units:
        normalizedUnits,

      unidadesBono:
        normalizedBonusUnits,

      bonusUnits:
        normalizedBonusUnits,

      unidadesPorCaja:
        normalizedUnitsPerBox,

      unitsPerBox:
        normalizedUnitsPerBox,

      entradaPagada:
        normalizedPaidUnits,

      entradaBono:
        normalizedBonusUnitsTotal,

      costoUnitario:
        normalizedCostUnit,

      unitCost:
        normalizedCostUnit,

      costoPorUnidad:
        normalizedCostUnit,

      costoPorCaja:
        normalizedCostBox,

      lastCostPerBox:
        normalizedCostBox,

      precioVenta:
        normalizedSalePrice,

      price:
        normalizedSalePrice,

      costoTotal:
        normalizedCostTotal,

      proveedores:
        providerCollection,

      proveedorIds:
        normalizedProviderIds,

      providerIds:
        normalizedProviderIds,

      providerList:
        providerCollection,

      providerDisplay,

      proveedorId:
        primaryProvider?.id ||
        "",

      proveedorNombre:
        providerNames.join(
          " | "
        ),

      proveedorRazonSocial:
        providerReasons.join(
          " | "
        ),

      providerId:
        primaryProvider?.id ||
        "",

      providerName:
        providerNames.join(
          " | "
        ),

      providerBusinessName:
        providerReasons.join(
          " | "
        ),

      expenseId:
        String(
          expenseId ||
            ""
        ).trim(),

      conversionId:
        String(
          conversionId ||
            ""
        ).trim(),

      conversionType:
        String(
          conversionType ||
            ""
        ).trim(),

      detalle:
        detalle ||
        "",

      fechaOperacion:
        validOperationDate
          ? getLocalDateInputValue(
              validOperationDate
            )
          : "",

      id_local:
        currentLocalId ||
        null,

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
        "",

      userId:
        user
          ? user.uid
          : null,

      userName:
        context.name ||
        user?.email ||
        ""
    };
  }

  async function loadProductStockMovements(
    productId
  ) {
    const target =
      String(
        productId ||
          ""
      ).trim();

    if (!target) {
      return [];
    }

    if (
      productStockMovementsCache.has(
        target
      )
    ) {
      return (
        productStockMovementsCache.get(
          target
        ) || []
      );
    }

    if (
      productStockMovementsPending.has(
        target
      )
    ) {
      return productStockMovementsPending.get(
        target
      );
    }

    const promise =
      (async () => {
        const movementDocuments =
          getSessionCollection(
            MOVEMENTS_COLLECTION
          );

        const movements =
          [];

        movementDocuments.forEach(
          ({
            id,
            data
          }) => {
            if (
              !matchesCurrentLocal(
                data
              )
            ) {
              return;
            }

            const movementProductId =
              String(
                data.productId ||
                  data.productID ||
                  data.product_id ||
                  ""
              ).trim();

            if (
              movementProductId !==
              target
            ) {
              return;
            }

            const movement =
              normalizeMovementDocument(
                id,
                data
              );

            const product =
              findProductById(
                target
              );

            movement.productCurrentName =
              product?.name ||
              movement.productName ||
              "Producto";

            movement.productCurrentProvider =
              getProductProvidersDisplay(
                product
              );

            movement.productCurrentStock =
              product
                ? getCurrentStockUnits(
                    product
                  )
                : movement.saldoActual;

            movement.productCurrentPrice =
              product
                ? numberOrZero(
                    product.price
                  )
                : movement.precioVenta;

            movements.push(
              movement
            );
          }
        );

        movements.sort(
          (
            a,
            b
          ) =>
            getMovementOperationDateValue(
              b
            ).localeCompare(
              getMovementOperationDateValue(
                a
              )
            ) ||
            numberOrZero(
              b.createdAtMs
            ) -
              numberOrZero(
                a.createdAtMs
              )
        );

        productStockMovementsCache.set(
          target,
          movements
        );

        return movements;
      })();

    productStockMovementsPending.set(
      target,
      promise
    );

    try {
      return await promise;
    } finally {
      productStockMovementsPending.delete(
        target
      );
    }
  }

  async function loadAllEntryMovements() {
    const movementDocuments =
      getSessionCollection(
        MOVEMENTS_COLLECTION
      );

    const movements = [];

    movementDocuments.forEach(
      ({
        id,
        data
      }) => {
        if (
          !matchesCurrentLocal(
            data
          )
        ) {
          return;
        }

        const movement =
          normalizeMovementDocument(
            id,
            data
          );

        if (
          movement.tipoMovimiento !==
          "entrada"
        ) {
          return;
        }

        if (
          !movement.productId
        ) {
          return;
        }

        const product =
          findProductById(
            movement.productId
          );

        movement.productCurrentName =
          product?.name ||
          movement.productName ||
          "Producto";

        movement.productCurrentProvider =
          getProductProvidersDisplay(
            product
          );

        movement.productCurrentStock =
          product
            ? getCurrentStockUnits(
                product
              )
            : movement.saldoActual;

        movement.productCurrentPrice =
          product
            ? numberOrZero(
                product.price
              )
            : movement.precioVenta;

        movements.push(
          movement
        );
      }
    );

    movements.sort(
      (
        a,
        b
      ) =>
        getMovementOperationDateValue(
          b
        ).localeCompare(
          getMovementOperationDateValue(
            a
          )
        ) ||
        b.createdAtMs -
          a.createdAtMs
    );

    return movements;
  }

  function invalidateProductStockMovementsCache(
    productId
  ) {
    const target =
      String(
        productId ||
          ""
      ).trim();

    if (target) {
      productStockMovementsCache.delete(
        target
      );
    }
  }

  function invalidateAllMovementsCache() {
    productStockMovementsCache.clear();
  }

  /*
   * ============================================================
   * CREAR PRODUCTO NUEVO
   * ============================================================
   */

  async function createNewProductFromLine(
    line,
    user,
    operationDate
  ) {
    const paidBoxes =
      decimalOrZero(
        line.boxes
      );

    const bonusBoxes =
      decimalOrZero(
        line.bonusBoxes
      );

    const paidUnits =
      decimalOrZero(
        line.units
      );

    const bonusUnits =
      decimalOrZero(
        line.bonusUnits
      );

    const unitsPerBox =
      Math.max(
        0.000001,
        decimalOrZero(
          line.unitsPerBox
        ) || 1
      );

    const totalPaidUnits =
      decimalOrZero(
        paidBoxes *
          unitsPerBox +
          paidUnits
      );

    const totalBonusUnits =
      decimalOrZero(
        bonusBoxes *
          unitsPerBox +
          bonusUnits
      );

    const totalUnits =
      decimalOrZero(
        totalPaidUnits +
          totalBonusUnits
      );

    if (
      totalUnits <=
      0
    ) {
      throw new Error(
        `El producto "${line.name}" no tiene cantidad de inventario.`
      );
    }

    const validOperationDate =
      operationDate instanceof Date
        ? operationDate
        : parseOperationDate(
            operationDate
          );

    if (
      !validOperationDate
    ) {
      throw new Error(
        `La fecha de operación no es válida para el producto "${line.name}".`
      );
    }

    const operationTimestamp =
      buildOperationTimestamp(
        validOperationDate
      );

    const productRef =
      db
        .collection(
          PRODUCTS_COLLECTION
        )
        .doc();

    const selectedProviders =
      getLineProviders(
        line
      );

    const providerIds =
      getProviderIds(
        selectedProviders
      );

    const primaryProvider =
      selectedProviders[0] ||
      null;

    const costPerUnit =
      getEffectiveCostPerUnitForLine(
        line,
        {
          ...line,
          unitsPerBox
        }
      );

    const lastCostPerBox =
      costPerUnit *
      unitsPerBox;

    const totalPurchaseCost =
      totalPaidUnits *
      costPerUnit;

    const price =
      Math.max(
        0,
        numberOrZero(
          line.price
        )
      );

    const productData = {
      name:
        line.name,

      codigoProducto:
        line.codigoProducto ||
        "",

      productCode:
        line.codigoProducto ||
        "",

      proveedorIds:
        providerIds,

      providerIds:
        providerIds,

      proveedores:
        selectedProviders,

      proveedorId:
        primaryProvider?.id ||
        null,

      proveedorNombre:
        getProviderName(
          primaryProvider
        ) ||
        "",

      proveedorRazonSocial:
        getProviderBusinessName(
          primaryProvider
        ) ||
        "",

      providerId:
        primaryProvider?.id ||
        null,

      providerName:
        getProviderName(
          primaryProvider
        ) ||
        "",

      providerBusinessName:
        getProviderBusinessName(
          primaryProvider
        ) ||
        "",

      quantity:
        totalUnits,

      stockCurrentUnits:
        totalUnits,

      stockBaseUnits:
        totalUnits,

      boxes:
        decimalOrZero(
          totalUnits /
            unitsPerBox
        ),

      unitsPerBox,

      lastCostPerBox,

      lastCostPerUnit:
        costPerUnit,

      price,

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
        "",

      referenciaLibro:
        line.referenciaLibro ||
        "Inventario inicial",

      referenceBook:
        line.referenciaLibro ||
        "Inventario inicial",

      numeroDocumento:
        line.numeroDocumento ||
        "",

      fechaOperacion:
        getLocalDateInputValue(
          validOperationDate
        )
    };

    const movementRef =
      db
        .collection(
          MOVEMENTS_COLLECTION
        )
        .doc();

    const movementData =
      buildMovementData({
        productId:
          productRef.id,

        productName:
          line.name,

        codigoProducto:
          line.codigoProducto,

        tipoMovimiento:
          "entrada",

        referenciaLibro:
          line.referenciaLibro ||
          "Inventario inicial",

        numeroDocumento:
          line.numeroDocumento ||
          productRef.id,

        entrada:
          totalUnits,

        salida:
          0,

        saldoAnterior:
          0,

        saldoActual:
          totalUnits,

        cajas:
          paidBoxes,

        cajasBono:
          bonusBoxes,

        unidades:
          paidUnits,

        unidadesBono:
          bonusUnits,

        unidadesPorCaja:
          unitsPerBox,

        costoUnitario:
          costPerUnit,

        costoPorCaja:
          lastCostPerBox,

        precioVenta:
          price,

        costoTotal:
          totalPurchaseCost,

        entradaPagada:
          totalPaidUnits,

        entradaBono:
          totalBonusUnits,

        proveedorIds:
          providerIds,

        proveedores:
          selectedProviders,

        detalle:
          [
            `Cajas: ${formatQuantity(
              paidBoxes
            )}`,

            `Cajas bono: ${formatQuantity(
              bonusBoxes
            )}`,

            `Unidades: ${formatQuantity(
              paidUnits
            )}`,

            `Unidades bono: ${formatQuantity(
              bonusUnits
            )}`,

            `Entrada pagada: ${formatQuantity(
              totalPaidUnits
            )}`,

            `Entrada bono: ${formatQuantity(
              totalBonusUnits
            )}`,

            `Unidades por caja: ${formatQuantity(
              unitsPerBox
            )}`,

            `Costo por unidad: ${currency(
              costPerUnit
            )}`,

            `Costo por caja: ${currency(
              lastCostPerBox
            )}`,

            `Precio de venta: ${currency(
              price
            )}`,

            `Costo total: ${currency(
              totalPurchaseCost
            )}`,

            `Proveedores: ${getLineProvidersDisplay(
              line
            )}`,

            `Fecha de operación: ${formatOperationDate(
              validOperationDate
            )}`
          ].join(
            " | "
          ),

        user,

        operationDate:
          validOperationDate
      });

    const batch =
      db.batch();

    batch.set(
      productRef,
      {
        ...productData,

        createdAt:
          operationTimestamp,

        updatedAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp()
      }
    );

    batch.set(
      movementRef,
      {
        ...movementData,

        createdAt:
          operationTimestamp
      }
    );

    await batch.commit();

    upsertSessionDocument(
      PRODUCTS_COLLECTION,
      productRef.id,
      {
        ...productData,

        createdAt:
          operationTimestamp.toMillis(),

        updatedAt:
          Date.now()
      }
    );

    upsertSessionDocument(
      MOVEMENTS_COLLECTION,
      movementRef.id,
      {
        ...movementData,

        createdAt:
          operationTimestamp.toMillis()
      }
    );

    currentProductsList.push({
      id:
        productRef.id,

      ...productData,

      createdAt:
        operationTimestamp.toMillis(),

      updatedAt:
        Date.now()
    });

    invalidateAllMovementsCache();

    return {
      type:
        "new",

      productId:
        productRef.id,

      totalUnits,

      movementId:
        movementRef.id,

      movementCostTotal:
        totalPurchaseCost
    };
  }

  /*
   * ============================================================
   * PRODUCTO EXISTENTE
   * ============================================================
   */

  async function addStockToExistingProduct(
    product,
    line,
    user,
    operationDate
  ) {
    const unitsPerBox =
      Math.max(
        0.000001,
        decimalOrZero(
          line.unitsPerBox
        ) ||
          getUnitsPerBox(
            product
          )
      );

    const paidBoxes =
      decimalOrZero(
        line.boxes
      );

    const bonusBoxes =
      decimalOrZero(
        line.bonusBoxes
      );

    const paidUnits =
      decimalOrZero(
        line.units
      );

    const bonusUnits =
      decimalOrZero(
        line.bonusUnits
      );

    const totalPaidUnits =
      decimalOrZero(
        paidBoxes *
          unitsPerBox +
          paidUnits
      );

    const totalBonusUnits =
      decimalOrZero(
        bonusBoxes *
          unitsPerBox +
          bonusUnits
      );

    const totalUnits =
      decimalOrZero(
        totalPaidUnits +
          totalBonusUnits
      );

    if (
      totalUnits <=
      0
    ) {
      throw new Error(
        `El producto "${product.name}" no tiene cantidad de entrada.`
      );
    }

    const validOperationDate =
      operationDate instanceof Date
        ? operationDate
        : parseOperationDate(
            operationDate
          );

    if (
      !validOperationDate
    ) {
      throw new Error(
        `La fecha de operación no es válida para el producto "${product.name}".`
      );
    }

    const operationTimestamp =
      buildOperationTimestamp(
        validOperationDate
      );

    const productRef =
      db
        .collection(
          PRODUCTS_COLLECTION
        )
        .doc(
          product.id
        );

    let previousStock =
      0;

    let nextStock =
      0;

    let nextCostPerBox =
      0;

    let nextCostPerUnit =
      0;

    let nextPrice =
      0;

    let nextProviders =
      [];

    let movementData =
      null;

    const transactionResult =
      await db.runTransaction(
        async transaction => {
          const snap =
            await transaction.get(
              productRef
            );

          if (
            !snap.exists
          ) {
            throw new Error(
              `El producto "${product.name}" ya no existe.`
            );
          }

          const data =
            snap.data() ||
            {};

          if (
            !matchesCurrentLocal(
              data
            )
          ) {
            throw new Error(
              `El producto "${product.name}" no pertenece al local actual.`
            );
          }

          previousStock =
            getCurrentStockUnits(
              data
            );

          nextStock =
            decimalOrZero(
              previousStock +
                totalUnits
            );

          const inputCostPerBox =
            numberOrZero(
              line.lastCostPerBox
            );

          const inputCostPerUnit =
            numberOrZero(
              line.lastCostPerUnit
            );

          if (
            inputCostPerBox >
            0
          ) {
            nextCostPerBox =
              inputCostPerBox;

            nextCostPerUnit =
              nextCostPerBox /
              unitsPerBox;
          } else if (
            inputCostPerUnit >
            0
          ) {
            nextCostPerUnit =
              inputCostPerUnit;

            nextCostPerBox =
              nextCostPerUnit *
              unitsPerBox;
          } else {
            nextCostPerBox =
              numberOrZero(
                data.lastCostPerBox
              );

            if (
              nextCostPerBox >
              0
            ) {
              nextCostPerUnit =
                nextCostPerBox /
                unitsPerBox;
            } else {
              nextCostPerUnit =
                numberOrZero(
                  data.lastCostPerUnit
                );

              nextCostPerBox =
                nextCostPerUnit *
                unitsPerBox;
            }
          }

          nextPrice =
            numberOrZero(
              line.price
            ) > 0
              ? numberOrZero(
                  line.price
                )
              : numberOrZero(
                  data.price
                );

          const productProviders =
            getProductProviders(
              data
            );

          const selectedProviders =
            getLineProviders(
              line
            );

          /*
           * La lista global del producto es la unión
           * de todos sus proveedores anteriores y los
           * proveedores seleccionados en la entrada.
           */

          nextProviders =
            mergeProviderCollections(
              productProviders,
              selectedProviders
            );

          const movementProviders =
            selectedProviders.length
              ? selectedProviders
              : productProviders.length
                ? [
                    productProviders[0]
                  ]
                : [];

          const primaryProvider =
            movementProviders[0] ||
            nextProviders[0] ||
            null;

          const nextProviderIds =
            getProviderIds(
              nextProviders
            );

          const movementProviderIds =
            getProviderIds(
              movementProviders
            );

          const totalPurchaseCost =
            totalPaidUnits *
            nextCostPerUnit;

          const movementRef =
            db
              .collection(
                MOVEMENTS_COLLECTION
              )
              .doc();

          movementData =
            buildMovementData({
              productId:
                product.id,

              productName:
                line.name ||
                data.name ||
                "",

              codigoProducto:
                line.codigoProducto ||
                getProductCode(
                  data
                ) ||
                "",

              tipoMovimiento:
                "entrada",

              referenciaLibro:
                line.referenciaLibro ||
                "Compra",

              numeroDocumento:
                line.numeroDocumento ||
                "",

              entrada:
                totalUnits,

              salida:
                0,

              saldoAnterior:
                previousStock,

              saldoActual:
                nextStock,

              cajas:
                paidBoxes,

              cajasBono:
                bonusBoxes,

              unidades:
                paidUnits,

              unidadesBono:
                bonusUnits,

              unidadesPorCaja:
                unitsPerBox,

              costoUnitario:
                nextCostPerUnit,

              costoPorCaja:
                nextCostPerBox,

              precioVenta:
                nextPrice,

              costoTotal:
                totalPurchaseCost,

              entradaPagada:
                totalPaidUnits,

              entradaBono:
                totalBonusUnits,

              proveedorIds:
                movementProviderIds,

              proveedores:
                movementProviders,

              detalle:
                [
                  `Cajas: ${formatQuantity(
                    paidBoxes
                  )}`,

                  `Cajas bono: ${formatQuantity(
                    bonusBoxes
                  )}`,

                  `Unidades: ${formatQuantity(
                    paidUnits
                  )}`,

                  `Unidades bono: ${formatQuantity(
                    bonusUnits
                  )}`,

                  `Entrada pagada: ${formatQuantity(
                    totalPaidUnits
                  )}`,

                  `Entrada bono: ${formatQuantity(
                    totalBonusUnits
                  )}`,

                  `Unidades por caja: ${formatQuantity(
                    unitsPerBox
                  )}`,

                  `Costo por unidad: ${currency(
                    nextCostPerUnit
                  )}`,

                  `Costo por caja: ${currency(
                    nextCostPerBox
                  )}`,

                  `Precio de venta: ${currency(
                    nextPrice
                  )}`,

                  `Costo total: ${currency(
                    totalPurchaseCost
                  )}`,

                  `Proveedores: ${
                    movementProviders.length
                      ? movementProviders
                          .map(
                            provider =>
                              getProviderDisplayName(
                                provider
                              )
                          )
                          .filter(Boolean)
                          .join(
                            " | "
                          )
                      : "Sin proveedor"
                  }`,

                  `Fecha de operación: ${formatOperationDate(
                    validOperationDate
                  )}`
                ].join(
                  " | "
                ),

              user,

              operationDate:
                validOperationDate
            });

          transaction.update(
            productRef,
            {
              codigoProducto:
                line.codigoProducto ||
                getProductCode(
                  data
                ) ||
                "",

              productCode:
                line.codigoProducto ||
                getProductCode(
                  data
                ) ||
                "",

              proveedorIds:
                nextProviderIds,

              providerIds:
                nextProviderIds,

              proveedores:
                nextProviders,

              proveedorId:
                primaryProvider?.id ||
                null,

              proveedorNombre:
                getProviderName(
                  primaryProvider
                ) ||
                "",

              proveedorRazonSocial:
                getProviderBusinessName(
                  primaryProvider
                ) ||
                "",

              providerId:
                primaryProvider?.id ||
                null,

              providerName:
                getProviderName(
                  primaryProvider
                ) ||
                "",

              providerBusinessName:
                getProviderBusinessName(
                  primaryProvider
                ) ||
                "",

              quantity:
                nextStock,

              stockCurrentUnits:
                nextStock,

              stockBaseUnits:
                numberOrZero(
                  data.stockBaseUnits
                ) ||
                previousStock,

              boxes:
                decimalOrZero(
                  nextStock /
                    unitsPerBox
                ),

              unitsPerBox,

              lastCostPerBox:
                nextCostPerBox,

              lastCostPerUnit:
                nextCostPerUnit,

              price:
                nextPrice,

              referenciaLibro:
                line.referenciaLibro ||
                data.referenciaLibro ||
                "",

              referenceBook:
                line.referenciaLibro ||
                data.referenceBook ||
                data.referenciaLibro ||
                "",

              numeroDocumento:
                line.numeroDocumento ||
                data.numeroDocumento ||
                "",

              fechaUltimaEntrada:
                getLocalDateInputValue(
                  validOperationDate
                ),

              updatedAt:
                firebase.firestore
                  .FieldValue
                  .serverTimestamp()
            }
          );

          transaction.set(
            movementRef,
            {
              ...movementData,

              createdAt:
                operationTimestamp
            }
          );

          return {
            movementId:
              movementRef.id,

            movementCostTotal:
              totalPurchaseCost,

            providerIds:
              movementProviderIds
          };
        }
      );

    const localProduct =
      findProductById(
        product.id
      );

    const primaryProvider =
      nextProviders[0] ||
      null;

    const updatedProductData = {
      ...(localProduct ||
        product),

      proveedorIds:
        getProviderIds(
          nextProviders
        ),

      providerIds:
        getProviderIds(
          nextProviders
        ),

      proveedores:
        nextProviders,

      proveedorId:
        primaryProvider?.id ||
        null,

      proveedorNombre:
        getProviderName(
          primaryProvider
        ) ||
        "",

      proveedorRazonSocial:
        getProviderBusinessName(
          primaryProvider
        ) ||
        "",

      providerId:
        primaryProvider?.id ||
        null,

      providerName:
        getProviderName(
          primaryProvider
        ) ||
        "",

      providerBusinessName:
        getProviderBusinessName(
          primaryProvider
        ) ||
        "",

      quantity:
        nextStock,

      stockCurrentUnits:
        nextStock,

      stockBaseUnits:
        numberOrZero(
          (
            localProduct ||
            product
          ).stockBaseUnits
        ) ||
        previousStock,

      boxes:
        decimalOrZero(
          nextStock /
            unitsPerBox
        ),

      unitsPerBox,

      lastCostPerBox:
        nextCostPerBox,

      lastCostPerUnit:
        nextCostPerUnit,

      price:
        nextPrice,

      referenciaLibro:
        line.referenciaLibro ||
        localProduct?.referenciaLibro ||
        product.referenciaLibro ||
        "",

      referenceBook:
        line.referenciaLibro ||
        localProduct?.referenceBook ||
        product.referenceBook ||
        "",

      numeroDocumento:
        line.numeroDocumento ||
        localProduct?.numeroDocumento ||
        product.numeroDocumento ||
        "",

      fechaUltimaEntrada:
        getLocalDateInputValue(
          validOperationDate
        ),

      id_local:
        currentLocalId,

      localNombre:
        currentLocalInfo.nombre,

      localNumeroDocumento:
        currentLocalInfo.numeroDocumento,

      localUbicacion:
        currentLocalInfo.ubicacion,

      localContribuyente:
        currentLocalInfo.contribuyente,

      localTipoDocumento:
        currentLocalInfo.tipoDocumento,

      localNIT:
        currentLocalInfo.nit,

      localNRC:
        currentLocalInfo.nrc,

      updatedAt:
        Date.now()
    };

    upsertSessionDocument(
      PRODUCTS_COLLECTION,
      product.id,
      updatedProductData
    );

    if (
      localProduct
    ) {
      Object.assign(
        localProduct,
        updatedProductData
      );
    }

    const movementId =
      transactionResult
        ?.movementId ||
      "";

    if (
      movementId &&
      movementData
    ) {
      upsertSessionDocument(
        MOVEMENTS_COLLECTION,
        movementId,
        {
          ...movementData,

          createdAt:
            operationTimestamp.toMillis()
        }
      );
    }

    invalidateProductStockMovementsCache(
      product.id
    );

    return {
      type:
        "existing",

      productId:
        product.id,

      totalUnits,

      previousStock,

      nextStock,

      movementId,

      movementCostTotal:
        transactionResult
          ?.movementCostTotal ||
        0
    };
  }

  /*
   * ============================================================
   * PROCESAMIENTO BATCH
   * ============================================================
   */

  async function processBatchLines(
    lines,
    operationDate
  ) {
    const user =
      auth.currentUser ||
      null;

    const validOperationDate =
      operationDate instanceof Date
        ? operationDate
        : parseOperationDate(
            operationDate
          );

    if (
      !validOperationDate
    ) {
      throw new Error(
        "La fecha de operación no es válida."
      );
    }

    const results =
      [];

    for (
      let index = 0;
      index <
      lines.length;
      index++
    ) {
      const line =
        lines[index];

      const label =
        `Producto ${
          index + 1
        }`;

      if (
        line.mode ===
        "existing"
      ) {
        if (
          !line.product
        ) {
          throw new Error(
            `${label}: producto existente no encontrado.`
          );
        }

        const result =
          await addStockToExistingProduct(
            line.product,
            line,
            user,
            validOperationDate
          );

        results.push({
          ...result,

          name:
            line.product.name
        });

        continue;
      }

      const result =
        await createNewProductFromLine(
          line,
          user,
          validOperationDate
        );

      results.push({
        ...result,

        name:
          line.name
      });
    }

    return results;
  }

  /*
   * ============================================================
   * MODAL BATCH
   * ============================================================
   */

  function buildBatchModalHtml() {
    return `
      <div class="batch-operation-date-box">

        <div class="inv-field">
          <label
            for="batch-operation-date"
          >
            Fecha de operación
          </label>

          <input
            id="batch-operation-date"
            type="date"
            value="${getLocalDateInputValue()}"
          >

          <small>
            Esta fecha se utilizará para el movimiento
            y para el gasto automático.
          </small>
        </div>

        <div
          class="batch-operation-date-preview"
          id="batch-operation-date-preview"
        >
          Fecha seleccionada:
          <strong>
            ${formatOperationDate(
              new Date()
            )}
          </strong>
        </div>
      </div>

      <div
        id="batch-products-container"
        class="batch-products-container"
      ></div>

      <button
        type="button"
        id="batch-add-row"
        class="btn-primary"
        style="
          width:100%;
          margin-top:12px;
        "
      >
        <i class="fas fa-plus"></i>
        Agregar otro producto
      </button>

      <div class="batch-info-box">
        <strong>
          Operación múltiple
        </strong>

        <p>
          Los productos existentes reciben una entrada
          y los nuevos se crean.
        </p>

        <p>
          El selector muestra todos los proveedores disponibles
          del local y permite seleccionar uno o varios.
        </p>

        <p>
          Los proveedores que ya estén asociados al producto
          aparecerán seleccionados inicialmente.
        </p>

        <p>
          Los proveedores seleccionados en un producto
          existente se agregan a su lista de proveedores asociados.
        </p>

        <p>
          Las cajas bono y unidades bono aumentan
          el stock pero no generan costo.
        </p>

        <p>
          Las cantidades de cajas, unidades y unidades
          por caja admiten valores decimales.
        </p>

        <p>
          El gasto automático solamente considera
          las cantidades pagadas.
        </p>
      </div>
    `;
  }

  async function openBatchAddModal() {
    if (
      !canEditInventory
    ) {
      await Swal.fire(
        "Sin permisos",
        "No puedes modificar el inventario con este usuario.",
        "warning"
      );

      return;
    }

    if (
      !currentLocalId
    ) {
      await Swal.fire(
        "Sin local",
        "No se pudo identificar el local actual.",
        "error"
      );

      return;
    }

    const initialRow =
      createBatchLineData({
        mode:
          currentProductsList.length
            ? "existing"
            : "new"
      });

    const result =
      await Swal.fire({
        title:
          "Agregar productos",

        html:
          buildBatchModalHtml(),

        width:
          "1150px",

        showCancelButton:
          true,

        confirmButtonText:
          "Guardar todo",

        cancelButtonText:
          "Cancelar",

        focusConfirm:
          false,

        customClass: {
          popup:
            "inventory-batch-modal"
        },

        didOpen:
          () => {
            const container =
              document.getElementById(
                "batch-products-container"
              );

            const addButton =
              document.getElementById(
                "batch-add-row"
              );

            const dateInput =
              document.getElementById(
                "batch-operation-date"
              );

            const datePreview =
              document.getElementById(
                "batch-operation-date-preview"
              );

            if (
              !container ||
              !addButton
            ) {
              return;
            }

            addBatchLine(
              container,
              initialRow
            );

            addButton.addEventListener(
              "click",
              () => {
                addBatchLine(
                  container,
                  {
                    mode:
                      currentProductsList.length
                        ? "existing"
                        : "new"
                  }
                );
              }
            );

            if (
              dateInput &&
              datePreview
            ) {
              dateInput.addEventListener(
                "change",
                () => {
                  const selectedDate =
                    parseOperationDate(
                      dateInput.value
                    );

                  datePreview.innerHTML =
                    selectedDate
                      ? `
                        Fecha seleccionada:
                        <strong>
                          ${escapeHtml(
                            formatOperationDate(
                              selectedDate
                            )
                          )}
                        </strong>
                      `
                      : `
                        <span style="
                          color:#b91c1c;
                          font-weight:700;
                        ">
                          Fecha no válida.
                        </span>
                      `;
                }
              );
            }
          },

        preConfirm:
          () => {
            const container =
              document.getElementById(
                "batch-products-container"
              );

            const dateInput =
              document.getElementById(
                "batch-operation-date"
              );

            if (!container) {
              Swal.showValidationMessage(
                "No se pudo construir el formulario."
              );

              return;
            }

            const operationDate =
              parseOperationDate(
                dateInput?.value
              );

            if (
              !operationDate
            ) {
              Swal.showValidationMessage(
                "Debes seleccionar una fecha de operación válida."
              );

              return;
            }

            const rows =
              Array.from(
                container.querySelectorAll(
                  ".batch-product-row"
                )
              );

            if (
              !rows.length
            ) {
              Swal.showValidationMessage(
                "Debes agregar al menos un producto."
              );

              return;
            }

            const validation =
              validateBatchLines(
                rows
              );

            if (
              validation.errors.length
            ) {
              Swal.showValidationMessage(
                validation.errors
                  .slice(
                    0,
                    5
                  )
                  .join(
                    "<br>"
                  )
              );

              return;
            }

            return {
              operationDate,
              operationDateValue:
                dateInput.value,
              lines:
                validation.parsed
            };
          }
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    const payload =
      result.value ||
      {};

    const lines =
      Array.isArray(
        payload.lines
      )
        ? payload.lines
        : [];

    const operationDate =
      payload.operationDate instanceof
      Date
        ? payload.operationDate
        : parseOperationDate(
            payload.operationDateValue
          );

    if (
      !lines.length ||
      !operationDate
    ) {
      return;
    }

    try {
      Swal.fire({
        title:
          "Procesando productos",

        html:
          `
            Preparando ${lines.length} producto(s)...
            <br><br>
            <strong>
              Fecha de operación:
            </strong>
            ${escapeHtml(
              formatOperationDate(
                operationDate
              )
            )}
          `,

        allowOutsideClick:
          false,

        allowEscapeKey:
          false,

        didOpen:
          () => {
            Swal.showLoading();
          }
      });

      const results =
        await processBatchLines(
          lines,
          operationDate
        );

      const created =
        results.filter(
          result =>
            result.type ===
            "new"
        ).length;

      const existing =
        results.filter(
          result =>
            result.type ===
            "existing"
        ).length;

      const totalUnits =
        results.reduce(
          (
            sum,
            result
          ) =>
            sum +
            decimalOrZero(
              result.totalUnits
            ),
          0
        );

      const totalPurchaseCost =
        lines.reduce(
          (
            sum,
            line
          ) =>
            sum +
            calculateLinePurchaseCost(
              line,
              line.product ||
                null
            ),
          0
        );

      let expenseResult =
        null;

      let expenseError =
        null;

      try {
        expenseResult =
          await registerInventoryExpense(
            totalPurchaseCost,
            lines,
            auth.currentUser ||
              null,
            operationDate
          );

        if (
          expenseResult?.id
        ) {
          await attachExpenseToMovements(
            expenseResult.id,
            results
          );
        }
      } catch (
        error
      ) {
        expenseError =
          error;

        console.error(
          "Inventario guardado, pero falló el gasto automático:",
          error
        );
      }

      Swal.close();

      refreshInventoryView();

      await Swal.fire({
        icon:
          expenseError
            ? "warning"
            : "success",

        title:
          expenseError
            ? "Carga completada con advertencia"
            : "Carga completada",

        html:
          `
            <div style="text-align:left">

              <p>
                Fecha de operación:
                <strong>
                  ${escapeHtml(
                    formatOperationDate(
                      operationDate
                    )
                  )}
                </strong>
              </p>

              <p>
                Productos procesados:
                <strong>
                  ${results.length}
                </strong>
              </p>

              <p>
                Nuevos:
                <strong>
                  ${created}
                </strong>
              </p>

              <p>
                Existentes:
                <strong>
                  ${existing}
                </strong>
              </p>

              <p>
                Unidades agregadas:
                <strong>
                  ${formatQuantity(
                    totalUnits
                  )}
                </strong>
              </p>

              <p>
                Costo total:
                <strong>
                  ${currency(
                    totalPurchaseCost
                  )}
                </strong>
              </p>

              ${
                expenseError
                  ? `
                    <p style="
                      color:#b91c1c;
                      font-weight:700;
                    ">
                      El inventario se guardó,
                      pero no se pudo registrar
                      el gasto automático.
                    </p>
                  `
                  : `
                    <p>
                      Gasto registrado:
                      <strong>
                        ${currency(
                          totalPurchaseCost
                        )}
                      </strong>
                    </p>
                  `
              }

            </div>
          `
      });
    } catch (
      error
    ) {
      Swal.close();

      console.error(
        "Error procesando carga:",
        error
      );

      await Swal.fire(
        "Error",
        error.message ||
          "No se pudo completar la operación.",
        "error"
      );
    }
  }

  /*
   * ============================================================
   * EDICIÓN DE MOVIMIENTO
   * ============================================================
   */

  function buildMovementEditFormHtml(
    movement,
    product
  ) {
    const operationDate =
      getMovementOperationDateValue(
        movement
      );

    const breakdown =
      getMovementBreakdown(
        movement,
        product
      );

    const movementUnitsPerBox =
      Math.max(
        0.000001,
        decimalOrZero(
          movement.unidadesPorCaja ??
            movement.unitsPerBox
        ) ||
          breakdown.unitsPerBox ||
          1
      );

    const productUnitsPerBox =
      getUnitsPerBox(
        product
      );

    let currentCostPerUnit =
      numberOrZero(
        movement.costoUnitario
      );

    let currentCostPerBox =
      numberOrZero(
        movement.costoPorCaja
      );

    if (
      currentCostPerUnit <=
        0 &&
      currentCostPerBox >
        0
    ) {
      currentCostPerUnit =
        currentCostPerBox /
        movementUnitsPerBox;
    }

    if (
      currentCostPerBox <=
        0 &&
      currentCostPerUnit >
        0
    ) {
      currentCostPerBox =
        currentCostPerUnit *
        movementUnitsPerBox;
    }

    if (
      currentCostPerUnit <=
        0 &&
      currentCostPerBox <=
        0
    ) {
      currentCostPerUnit =
        getCostPerUnit(
          product
        );

      currentCostPerBox =
        currentCostPerUnit *
        movementUnitsPerBox;
    }

    const currentSalePrice =
      numberOrZero(
        movement.precioVenta
      ) ||
      numberOrZero(
        product?.price
      );

    const movementProviders =
      normalizeMovementProviders(
        movement
      );

    const availableProviders =
      mergeProviderCollections(
        currentProvidersList,
        getProductProviders(
          product
        ),
        movementProviders
      );

    return `
      <div class="movement-edit-form">

        <div class="movement-edit-header">

          <div>
            <strong>
              ${escapeHtml(
                product?.name ||
                  movement.productName ||
                  "Producto"
              )}
            </strong>

            <span>
              Stock actual:
              <strong>
                ${formatQuantity(
                  getCurrentStockUnits(
                    product
                  )
                )}
              </strong>
            </span>

            <span>
              Proveedores de esta entrada:
              <strong>
                ${escapeHtml(
                  movement.providerDisplay ||
                    getLineProvidersDisplay(
                      movement
                    )
                )}
              </strong>
            </span>
          </div>

        </div>

        <div class="movement-edit-grid">

          <div class="inv-field">
            <label>
              Fecha de operación
            </label>

            <input
              id="movement-edit-date"
              type="date"
              value="${escapeHtml(
                operationDate
              )}"
            >
          </div>

          <div
            class="inv-field movement-edit-provider-field"
          >
            <label>
              Proveedores de esta entrada
            </label>

            <div
              id="movement-edit-provider-selector"
            >
              ${buildProviderMultiSelectHtml(
                "movement-edit-provider-selector",
                availableProviders,
                getProviderIds(
                  movementProviders
                )
              )}
            </div>

            <small>
              Todos los proveedores disponibles del local
              pueden seleccionarse.
            </small>
          </div>

          <div class="inv-field">
            <label>
              Unidades por caja
            </label>

            <input
              id="movement-edit-units-per-box"
              type="number"
              min="0.000001"
              step="any"
              inputmode="decimal"
              value="${formatQuantity(
                movementUnitsPerBox
              )}"
            >
          </div>

          <div class="inv-field">
            <label>
              Cajas
            </label>

            <input
              id="movement-edit-boxes"
              type="number"
              min="0"
              step="any"
              inputmode="decimal"
              value="${formatQuantity(
                breakdown.cajas
              )}"
            >
          </div>

          <div class="inv-field bonus-field">
            <label>
              Cajas bono
            </label>

            <input
              id="movement-edit-bonus-boxes"
              type="number"
              min="0"
              step="any"
              inputmode="decimal"
              value="${formatQuantity(
                breakdown.cajasBono
              )}"
            >
          </div>

          <div class="inv-field">
            <label>
              Unidades sueltas
            </label>

            <input
              id="movement-edit-units"
              type="number"
              min="0"
              step="any"
              inputmode="decimal"
              value="${formatQuantity(
                breakdown.unidades
              )}"
            >
          </div>

          <div class="inv-field bonus-field">
            <label>
              Unidades bono
            </label>

            <input
              id="movement-edit-bonus-units"
              type="number"
              min="0"
              step="any"
              inputmode="decimal"
              value="${formatQuantity(
                breakdown.unidadesBono
              )}"
            >
          </div>

          <div class="inv-field">
            <label>
              Costo por caja
            </label>

            <input
              id="movement-edit-cost-box"
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              value="${currentCostPerBox.toFixed(
                2
              )}"
            >
          </div>

          <div class="inv-field">
            <label>
              Costo por unidad
            </label>

            <input
              id="movement-edit-cost-unit"
              type="text"
              value="${currentCostPerUnit.toFixed(
                4
              )}"
              readonly
            >
          </div>

          <div class="inv-field">
            <label>
              Precio de venta
            </label>

            <input
              id="movement-edit-sale-price"
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              value="${currentSalePrice.toFixed(
                2
              )}"
            >
          </div>

          <div class="inv-field">
            <label>
              Entrada total
            </label>

            <input
              id="movement-edit-entry"
              type="text"
              value="${formatQuantity(
                breakdown.totalUnits
              )}"
              readonly
            >
          </div>

          <div
            class="inv-field movement-edit-full"
          >
            <label>
              Referencia de libro
            </label>

            <input
              id="movement-edit-reference"
              type="text"
              value="${escapeHtml(
                movement.referenciaLibro ||
                  ""
              )}"
            >
          </div>

          <div
            class="inv-field movement-edit-full"
          >
            <label>
              Documento
            </label>

            <input
              id="movement-edit-document"
              type="text"
              value="${escapeHtml(
                movement.numeroDocumento ||
                  ""
              )}"
            >
          </div>

        </div>

        <div
          id="movement-edit-preview"
          class="movement-edit-preview"
        ></div>

        <div class="movement-edit-warning">
          <strong>
            Importante:
          </strong>

          Puedes asignar uno o varios proveedores
          específicamente a esta entrada.

          <br><br>

          Los proveedores seleccionados no modifican
          el costo calculado de la entrada.

          <br><br>

          Al guardar, los proveedores seleccionados
          también quedarán asociados al producto para
          futuras entradas.

          <br><br>

          Se seguirá aplicando:

          <strong>
            nueva entrada - entrada anterior
          </strong>

          sobre el stock vigente.
        </div>

        ${
          movement.expenseId
            ? `
              <div class="movement-edit-linked">
                <i class="fas fa-link"></i>

                Esta entrada está vinculada a un gasto.
                El gasto se ajustará considerando solamente
                las cantidades pagadas.
              </div>
            `
            : `
              <div class="movement-edit-warning">
                <i class="fas fa-info-circle"></i>

                Esta entrada no tiene un gasto vinculado.
              </div>
            `
        }

      </div>
    `;
  }

  function updateMovementEditPreview(
    product,
    movement
  ) {
    const boxesInput =
      document.getElementById(
        "movement-edit-boxes"
      );

    const bonusBoxesInput =
      document.getElementById(
        "movement-edit-bonus-boxes"
      );

    const unitsInput =
      document.getElementById(
        "movement-edit-units"
      );

    const bonusUnitsInput =
      document.getElementById(
        "movement-edit-bonus-units"
      );

    const unitsPerBoxInput =
      document.getElementById(
        "movement-edit-units-per-box"
      );

    const costBoxInput =
      document.getElementById(
        "movement-edit-cost-box"
      );

    const costUnitInput =
      document.getElementById(
        "movement-edit-cost-unit"
      );

    const salePriceInput =
      document.getElementById(
        "movement-edit-sale-price"
      );

    const entryInput =
      document.getElementById(
        "movement-edit-entry"
      );

    const preview =
      document.getElementById(
        "movement-edit-preview"
      );

    if (
      !boxesInput ||
      !bonusBoxesInput ||
      !unitsInput ||
      !bonusUnitsInput ||
      !unitsPerBoxInput ||
      !costBoxInput ||
      !preview
    ) {
      return;
    }

    const oldBreakdown =
      getMovementBreakdown(
        movement,
        product
      );

    const oldUnitsPerBox =
      Math.max(
        0.000001,
        decimalOrZero(
          movement.unidadesPorCaja ??
            movement.unitsPerBox
        ) ||
          oldBreakdown.unitsPerBox ||
          1
      );

    const newUnitsPerBox =
      Math.max(
        0.000001,
        decimalOrZero(
          unitsPerBoxInput.value
        ) ||
          oldUnitsPerBox
      );

    const cajas =
      decimalOrZero(
        boxesInput.value
      );

    const cajasBono =
      decimalOrZero(
        bonusBoxesInput.value
      );

    const unidades =
      decimalOrZero(
        unitsInput.value
      );

    const unidadesBono =
      decimalOrZero(
        bonusUnitsInput.value
      );

    const paidUnits =
      decimalOrZero(
        cajas *
          newUnitsPerBox +
          unidades
      );

    const bonusUnits =
      decimalOrZero(
        cajasBono *
          newUnitsPerBox +
          unidadesBono
      );

    const newEntry =
      decimalOrZero(
        paidUnits +
          bonusUnits
      );

    const oldEntry =
      decimalOrZero(
        oldBreakdown.cajas *
          oldUnitsPerBox +
          oldBreakdown.unidades +
          oldBreakdown.cajasBono *
          oldUnitsPerBox +
          oldBreakdown.unidadesBono
      );

    const difference =
      decimalOrZero(
        newEntry -
          oldEntry
      );

    const currentStock =
      getCurrentStockUnits(
        product
      );

    const resultingStock =
      decimalOrZero(
        currentStock +
          difference
      );

    const costPerBox =
      Math.max(
        0,
        numberOrZero(
          costBoxInput.value
        )
      );

    const costPerUnit =
      newUnitsPerBox > 0
        ? costPerBox /
          newUnitsPerBox
        : 0;

    const purchaseCost =
      paidUnits *
      costPerUnit;

    if (
      costUnitInput
    ) {
      costUnitInput.value =
        costPerUnit.toFixed(
          4
        );
    }

    if (
      entryInput
    ) {
      entryInput.value =
        formatQuantity(
          newEntry
        );
    }

    const salePrice =
      Math.max(
        0,
        numberOrZero(
          salePriceInput?.value
        )
      );

    preview.innerHTML = `
      <div>
        Entrada anterior
        <strong>
          ${formatQuantity(
            oldEntry
          )}
        </strong>
      </div>

      <div>
        Entrada pagada
        <strong>
          ${formatQuantity(
            paidUnits
          )}
        </strong>
      </div>

      <div>
        Entrada bono
        <strong>
          ${formatQuantity(
            bonusUnits
          )}
        </strong>
      </div>

      <div>
        Nueva entrada
        <strong>
          ${formatQuantity(
            newEntry
          )}
        </strong>
      </div>

      <div>
        Diferencia
        <strong>
          ${
            difference > 0
              ? "+"
              : ""
          }${formatQuantity(
            difference
          )}
        </strong>
      </div>

      <div>
        Stock actual
        <strong>
          ${formatQuantity(
            currentStock
          )}
        </strong>
      </div>

      <div>
        Stock resultante
        <strong>
          ${formatQuantity(
            resultingStock
          )}
        </strong>
      </div>

      <div>
        Costo por caja
        <strong>
          ${currency(
            costPerBox
          )}
        </strong>
      </div>

      <div>
        Costo por unidad
        <strong>
          ${currency(
            costPerUnit
          )}
        </strong>
      </div>

      <div>
        Precio de venta
        <strong>
          ${currency(
            salePrice
          )}
        </strong>
      </div>

      <div>
        Costo de entrada
        <strong>
          ${currency(
            purchaseCost
          )}
        </strong>
      </div>
    `;
  }

  async function updateEntryMovement(
    movementId,
    values
  ) {
    const movementRef =
      db
        .collection(
          MOVEMENTS_COLLECTION
        )
        .doc(
          movementId
        );

    const user =
      auth.currentUser ||
      null;

    const operationDate =
      parseOperationDate(
        values.fechaOperacion
      );

    if (
      !operationDate
    ) {
      throw new Error(
        "La fecha de operación no es válida."
      );
    }

    const operationTimestamp =
      buildOperationTimestamp(
        operationDate
      );

    const explicitProviderIds =
      normalizeIdArray(
        values.proveedorIds
      );

    const selectedProviders =
      explicitProviderIds.map(
        providerId =>
          getProviderById(
            providerId
          )
      );

    if (
      explicitProviderIds.length !==
      selectedProviders.filter(
        Boolean
      ).length
    ) {
      throw new Error(
        "Uno o más de los proveedores seleccionados ya no están disponibles."
      );
    }

    let updatedMovement =
      null;

    let updatedProduct =
      null;

    let updatedExpense =
      null;

    await db.runTransaction(
      async transaction => {
        const movementSnap =
          await transaction.get(
            movementRef
          );

        if (
          !movementSnap.exists
        ) {
          throw new Error(
            "El movimiento ya no existe."
          );
        }

        const oldMovementRaw =
          movementSnap.data() ||
          {};

        if (
          String(
            oldMovementRaw.tipoMovimiento ||
              ""
          )
            .trim()
            .toLowerCase() !==
          "entrada"
        ) {
          throw new Error(
            "Solo se pueden editar movimientos de tipo entrada."
          );
        }

        if (
          !matchesCurrentLocal(
            oldMovementRaw
          )
        ) {
          throw new Error(
            "El movimiento no pertenece al local actual."
          );
        }

        const productId =
          String(
            oldMovementRaw.productId ||
              ""
          ).trim();

        if (!productId) {
          throw new Error(
            "El movimiento no tiene un producto asociado."
          );
        }

        const productRef =
          db
            .collection(
              PRODUCTS_COLLECTION
            )
            .doc(
              productId
            );

        const productSnap =
          await transaction.get(
            productRef
          );

        if (
          !productSnap.exists
        ) {
          throw new Error(
            "El producto asociado al movimiento ya no existe."
          );
        }

        const productData =
          productSnap.data() ||
          {};

        if (
          !matchesCurrentLocal(
            productData
          )
        ) {
          throw new Error(
            "El producto no pertenece al local actual."
          );
        }

        const oldMovement =
          normalizeMovementDocument(
            movementId,
            oldMovementRaw
          );

        const oldBreakdown =
          getMovementBreakdown(
            oldMovement,
            productData
          );

        const oldUnitsPerBox =
          Math.max(
            0.000001,
            decimalOrZero(
              oldMovementRaw.unidadesPorCaja ??
                oldMovementRaw.unitsPerBox
            ) ||
              oldBreakdown.unitsPerBox ||
              decimalOrZero(
                productData.unitsPerBox
              ) ||
              1
          );

        const newBoxes =
          decimalOrZero(
            values.cajas
          );

        const newBonusBoxes =
          decimalOrZero(
            values.cajasBono
          );

        const newUnits =
          decimalOrZero(
            values.unidades
          );

        const newBonusUnits =
          decimalOrZero(
            values.unidadesBono
          );

        const unitsPerBox =
          Math.max(
            0.000001,
            decimalOrZero(
              values.unidadesPorCaja
            ) ||
              oldUnitsPerBox
          );

        const newPaidUnits =
          decimalOrZero(
            newBoxes *
              unitsPerBox +
              newUnits
          );

        const newBonusUnitsTotal =
          decimalOrZero(
            newBonusBoxes *
              unitsPerBox +
              newBonusUnits
          );

        const newEntry =
          decimalOrZero(
            newPaidUnits +
              newBonusUnitsTotal
          );

        let newCostPerBox =
          Math.max(
            0,
            numberOrZero(
              values.costoPorCaja
            )
          );

        let newCostPerUnit =
          0;

        if (
          newCostPerBox >
          0
        ) {
          newCostPerUnit =
            newCostPerBox /
            unitsPerBox;

          newCostPerBox =
            newCostPerUnit *
            unitsPerBox;
        } else {
          newCostPerUnit =
            numberOrZero(
              oldMovement.costoUnitario
            );

          newCostPerBox =
            newCostPerUnit *
            unitsPerBox;
        }

        const newSalePrice =
          Math.max(
            0,
            numberOrZero(
              values.precioVenta
            )
          );

        const oldEntry =
          decimalOrZero(
            oldBreakdown.cajas *
              oldUnitsPerBox +
              oldBreakdown.unidades +
              oldBreakdown.cajasBono *
              oldUnitsPerBox +
              oldBreakdown.unidadesBono
          );

        const currentStock =
          getCurrentStockUnits(
            productData
          );

        const difference =
          decimalOrZero(
            newEntry -
              oldEntry
          );

        const nextStock =
          decimalOrZero(
            currentStock +
              difference
          );

        if (
          nextStock <
          0
        ) {
          throw new Error(
            `No se puede reducir la entrada a ${formatQuantity(
              newEntry
            )} unidades porque el stock actual (${formatQuantity(
              currentStock
            )}) quedaría en ${formatQuantity(
              nextStock
            )}.`
          );
        }

        const oldPaidUnits =
          decimalOrZero(
            oldBreakdown.cajas *
              oldUnitsPerBox +
              oldBreakdown.unidades
          );

        let oldCostPerUnit =
          numberOrZero(
            oldMovement.costoUnitario
          );

        if (
          oldCostPerUnit <=
          0
        ) {
          oldCostPerUnit =
            oldUnitsPerBox >
              0
              ? numberOrZero(
                  oldMovement.costoPorCaja
                ) /
                oldUnitsPerBox
              : 0;
        }

        const oldCostTotal =
          oldMovement.costoTotal !==
            undefined &&
          oldMovement.costoTotal !==
            null
            ? Math.max(
                0,
                numberOrZero(
                  oldMovement.costoTotal
                )
              )
            : Math.max(
                0,
                oldPaidUnits *
                  oldCostPerUnit
              );

        const newCostTotal =
          Math.max(
            0,
            newPaidUnits *
              newCostPerUnit
          );

        let expenseData =
          null;

        const expenseId =
          String(
            oldMovement.expenseId ||
              ""
          ).trim();

        if (
          expenseId
        ) {
          const expenseRef =
            db
              .collection(
                EXPENSES_COLLECTION
              )
              .doc(
                expenseId
              );

          const expenseSnap =
            await transaction.get(
              expenseRef
            );

          if (
            expenseSnap.exists
          ) {
            const oldExpense =
              expenseSnap.data() ||
              {};

            const oldExpenseAmount =
              Math.max(
                0,
                numberOrZero(
                  oldExpense.amount
                )
              );

            const expenseDifference =
              newCostTotal -
              oldCostTotal;

            const nextExpenseAmount =
              Math.max(
                0,
                oldExpenseAmount +
                  expenseDifference
              );

            expenseData = {
              expenseRef,

              data:
                oldExpense,

              amount:
                nextExpenseAmount
            };

            transaction.update(
              expenseRef,
              {
                amount:
                  nextExpenseAmount,

                dayKey:
                  getInventoryDayKey(
                    operationDate
                  ),

                inventoryOperationDate:
                  getLocalDateInputValue(
                    operationDate
                  ),

                updatedAt:
                  firebase.firestore
                    .FieldValue
                    .serverTimestamp()
              }
            );
          }
        }

        const productProviders =
          getProductProviders(
            productData
          );

        const mergedProductProviders =
          mergeProviderCollections(
            productProviders,
            selectedProviders
          );

        const primaryProductProvider =
          selectedProviders[0] ||
          mergedProductProviders[0] ||
          null;

        const movementProviders =
          selectedProviders;

        const movementProviderIds =
          getProviderIds(
            movementProviders
          );

        const nextMovementData =
          buildMovementData({
            productId,

            productName:
              oldMovementRaw.productName ||
              productData.name ||
              "",

            codigoProducto:
              oldMovementRaw.codigoProducto ||
              getProductCode(
                productData
              ) ||
              "",

            tipoMovimiento:
              "entrada",

            referenciaLibro:
              values.referenciaLibro,

            numeroDocumento:
              values.numeroDocumento,

            entrada:
              newEntry,

            salida:
              0,

            saldoAnterior:
              decimalOrZero(
                currentStock -
                  oldEntry
              ),

            saldoActual:
              nextStock,

            cajas:
              newBoxes,

            cajasBono:
              newBonusBoxes,

            unidades:
              newUnits,

            unidadesBono:
              newBonusUnits,

            unidadesPorCaja:
              unitsPerBox,

            costoUnitario:
              newCostPerUnit,

            costoPorCaja:
              newCostPerBox,

            precioVenta:
              newSalePrice,

            costoTotal:
              newCostTotal,

            entradaPagada:
              newPaidUnits,

            entradaBono:
              newBonusUnitsTotal,

            proveedorIds:
              movementProviderIds,

            proveedores:
              movementProviders,

            expenseId,

            detalle:
              [
                `Cajas: ${formatQuantity(
                  newBoxes
                )}`,

                `Cajas bono: ${formatQuantity(
                  newBonusBoxes
                )}`,

                `Unidades: ${formatQuantity(
                  newUnits
                )}`,

                `Unidades bono: ${formatQuantity(
                  newBonusUnits
                )}`,

                `Entrada pagada: ${formatQuantity(
                  newPaidUnits
                )}`,

                `Entrada bono: ${formatQuantity(
                  newBonusUnitsTotal
                )}`,

                `Entrada total: ${formatQuantity(
                  newEntry
                )}`,

                `Unidades por caja: ${formatQuantity(
                  unitsPerBox
                )}`,

                `Costo por unidad: ${currency(
                  newCostPerUnit
                )}`,

                `Costo por caja: ${currency(
                  newCostPerBox
                )}`,

                `Precio de venta: ${currency(
                  newSalePrice
                )}`,

                `Costo total: ${currency(
                  newCostTotal
                )}`,

                `Proveedores: ${
                  movementProviders.length
                    ? movementProviders
                        .map(
                          provider =>
                            getProviderDisplayName(
                              provider
                            )
                        )
                        .filter(Boolean)
                        .join(
                          " | "
                        )
                    : "Sin proveedor"
                }`,

                `Fecha de operación: ${formatOperationDate(
                  operationDate
                )}`
              ].join(
                " | "
              ),

            user,

            operationDate
          });

        transaction.update(
          movementRef,
          {
            ...nextMovementData,

            createdAt:
              operationTimestamp,

            editado:
              true,

            fechaUltimaEdicion:
              firebase.firestore
                .FieldValue
                .serverTimestamp(),

            usuarioUltimaEdicion:
              user
                ? user.uid
                : null,

            usuarioUltimaEdicionNombre:
              currentUserInventoryContext?.name ||
              user?.email ||
              "",

            updatedAt:
              firebase.firestore
                .FieldValue
                .serverTimestamp()
          }
        );

        transaction.update(
          productRef,
          {
            proveedorIds:
              getProviderIds(
                mergedProductProviders
              ),

            providerIds:
              getProviderIds(
                mergedProductProviders
              ),

            proveedores:
              mergedProductProviders,

            proveedorId:
              primaryProductProvider?.id ||
              productData.proveedorId ||
              null,

            proveedorNombre:
              getProviderName(
                primaryProductProvider
              ) ||
              productData.proveedorNombre ||
              "",

            proveedorRazonSocial:
              getProviderBusinessName(
                primaryProductProvider
              ) ||
              productData.proveedorRazonSocial ||
              "",

            providerId:
              primaryProductProvider?.id ||
              productData.providerId ||
              productData.proveedorId ||
              null,

            providerName:
              getProviderName(
                primaryProductProvider
              ) ||
              productData.providerName ||
              productData.proveedorNombre ||
              "",

            providerBusinessName:
              getProviderBusinessName(
                primaryProductProvider
              ) ||
              productData.providerBusinessName ||
              productData.proveedorRazonSocial ||
              "",

            quantity:
              nextStock,

            stockCurrentUnits:
              nextStock,

            boxes:
              decimalOrZero(
                nextStock /
                  unitsPerBox
              ),

            unitsPerBox,

            lastCostPerBox:
              newCostPerBox,

            lastCostPerUnit:
              newCostPerUnit,

            price:
              newSalePrice,

            referenciaLibro:
              values.referenciaLibro ||
              productData.referenciaLibro ||
              "",

            referenceBook:
              values.referenciaLibro ||
              productData.referenceBook ||
              productData.referenciaLibro ||
              "",

            numeroDocumento:
              values.numeroDocumento ||
              productData.numeroDocumento ||
              "",

            fechaUltimaEntrada:
              getLocalDateInputValue(
                operationDate
              ),

            updatedAt:
              firebase.firestore
                .FieldValue
                .serverTimestamp()
          }
        );

        updatedMovement = {
          ...oldMovementRaw,
          ...nextMovementData,

          proveedores:
            movementProviders,

          proveedorIds:
            movementProviderIds,

          providerIds:
            movementProviderIds,

          id:
            movementId,

          createdAt:
            operationTimestamp.toMillis(),

          updatedAt:
            Date.now(),

          editado:
            true
        };

        updatedProduct = {
          ...productData,

          proveedorIds:
            getProviderIds(
              mergedProductProviders
            ),

          providerIds:
            getProviderIds(
              mergedProductProviders
            ),

          proveedores:
            mergedProductProviders,

          proveedorId:
            primaryProductProvider?.id ||
            productData.proveedorId ||
            null,

          proveedorNombre:
            getProviderName(
              primaryProductProvider
            ) ||
            productData.proveedorNombre ||
            "",

          proveedorRazonSocial:
            getProviderBusinessName(
              primaryProductProvider
            ) ||
            productData.proveedorRazonSocial ||
            "",

          providerId:
            primaryProductProvider?.id ||
            productData.providerId ||
            productData.proveedorId ||
            null,

          providerName:
            getProviderName(
              primaryProductProvider
            ) ||
            productData.providerName ||
            productData.proveedorNombre ||
            "",

          providerBusinessName:
            getProviderBusinessName(
              primaryProductProvider
            ) ||
            productData.providerBusinessName ||
            productData.proveedorRazonSocial ||
            "",

          id:
            productId,

          quantity:
            nextStock,

          stockCurrentUnits:
            nextStock,

          boxes:
            decimalOrZero(
              nextStock /
                unitsPerBox
            ),

          unitsPerBox,

          lastCostPerBox:
            newCostPerBox,

          lastCostPerUnit:
            newCostPerUnit,

          price:
            newSalePrice,

          updatedAt:
            Date.now()
        };

        if (
          expenseData
        ) {
          updatedExpense = {
            ...expenseData.data,

            amount:
              expenseData.amount,

            dayKey:
              getInventoryDayKey(
                operationDate
              ),

            inventoryOperationDate:
              getLocalDateInputValue(
                operationDate
              ),

            updatedAt:
              Date.now()
          };
        }
      }
    );

    if (
      !updatedMovement ||
      !updatedProduct
    ) {
      throw new Error(
        "No se pudo construir la actualización."
      );
    }

    upsertSessionDocument(
      PRODUCTS_COLLECTION,
      updatedProduct.id,
      updatedProduct
    );

    const localProduct =
      findProductById(
        updatedProduct.id
      );

    if (
      localProduct
    ) {
      Object.assign(
        localProduct,
        updatedProduct
      );
    }

    upsertSessionDocument(
      MOVEMENTS_COLLECTION,
      movementId,
      updatedMovement
    );

    if (
      updatedExpense &&
      updatedMovement.expenseId
    ) {
      upsertSessionDocument(
        EXPENSES_COLLECTION,
        updatedMovement.expenseId,
        updatedExpense
      );
    }

    invalidateProductStockMovementsCache(
      updatedProduct.id
    );

    return {
      movement:
        normalizeMovementDocument(
          movementId,
          updatedMovement
        ),

      product:
        updatedProduct,

      expense:
        updatedExpense
    };
  }

  async function openEditMovementModal(
    movement
  ) {
    if (
      !canEditInventory
    ) {
      await Swal.fire(
        "Sin permisos",
        "No puedes editar movimientos.",
        "warning"
      );

      return;
    }

    if (
      movement?.tipoMovimiento !==
      "entrada"
    ) {
      await Swal.fire(
        "Movimiento no válido",
        "Solo se pueden editar entradas.",
        "warning"
      );

      return;
    }

    const product =
      findProductById(
        movement.productId
      );

    if (
      !product
    ) {
      await Swal.fire(
        "Producto no encontrado",
        "El producto asociado al movimiento ya no está disponible.",
        "warning"
      );

      return;
    }

    const normalizedMovement =
      normalizeMovementDocument(
        movement.id,
        movement
      );

    const result =
      await Swal.fire({
        title:
          "Editar entrada",

        html:
          buildMovementEditFormHtml(
            normalizedMovement,
            product
          ),

        width:
          "1050px",

        showCancelButton:
          true,

        confirmButtonText:
          "Guardar cambios",

        cancelButtonText:
          "Cancelar",

        focusConfirm:
          false,

        customClass: {
          popup:
            "inventory-movement-edit-modal"
        },

        didOpen:
          () => {
            bindProviderSelectorEvents(
              document.getElementById(
                "movement-edit-provider-selector"
              )
            );

            const selectors = [
              "#movement-edit-boxes",
              "#movement-edit-bonus-boxes",
              "#movement-edit-units",
              "#movement-edit-bonus-units",
              "#movement-edit-units-per-box",
              "#movement-edit-cost-box",
              "#movement-edit-sale-price"
            ];

            selectors.forEach(
              selector => {
                const element =
                  document.querySelector(
                    selector
                  );

                if (!element) {
                  return;
                }

                element.addEventListener(
                  "input",
                  () => {
                    updateMovementEditPreview(
                      product,
                      normalizedMovement
                    );
                  }
                );

                element.addEventListener(
                  "change",
                  () => {
                    updateMovementEditPreview(
                      product,
                      normalizedMovement
                    );
                  }
                );
              }
            );

            updateMovementEditPreview(
              product,
              normalizedMovement
            );
          },

        preConfirm:
          () => {
            const fechaOperacion =
              String(
                document.getElementById(
                  "movement-edit-date"
                )?.value ||
                  ""
              ).trim();

            const cajas =
              decimalOrZero(
                document.getElementById(
                  "movement-edit-boxes"
                )?.value
              );

            const cajasBono =
              decimalOrZero(
                document.getElementById(
                  "movement-edit-bonus-boxes"
                )?.value
              );

            const unidades =
              decimalOrZero(
                document.getElementById(
                  "movement-edit-units"
                )?.value
              );

            const unidadesBono =
              decimalOrZero(
                document.getElementById(
                  "movement-edit-bonus-units"
                )?.value
              );

            const unidadesPorCaja =
              Math.max(
                0.000001,
                decimalOrZero(
                  document.getElementById(
                    "movement-edit-units-per-box"
                  )?.value
                ) || 1
              );

            const costoPorCaja =
              Math.max(
                0,
                numberOrZero(
                  document.getElementById(
                    "movement-edit-cost-box"
                  )?.value
                )
              );

            const precioVenta =
              Math.max(
                0,
                numberOrZero(
                  document.getElementById(
                    "movement-edit-sale-price"
                  )?.value
                )
              );

            const providerRoot =
              document.getElementById(
                "movement-edit-provider-selector"
              );

            const proveedorIds =
              getSelectedProviderIdsFromSelector(
                providerRoot
              );

            const referenciaLibro =
              String(
                document.getElementById(
                  "movement-edit-reference"
                )?.value ||
                  ""
              ).trim();

            const numeroDocumento =
              String(
                document.getElementById(
                  "movement-edit-document"
                )?.value ||
                  ""
              ).trim();

            const operationDate =
              parseOperationDate(
                fechaOperacion
              );

            if (
              !operationDate
            ) {
              Swal.showValidationMessage(
                "Debes seleccionar una fecha válida."
              );

              return;
            }

            const paidUnits =
              decimalOrZero(
                cajas *
                  unidadesPorCaja +
                  unidades
              );

            const bonusUnits =
              decimalOrZero(
                cajasBono *
                  unidadesPorCaja +
                  unidadesBono
              );

            const totalUnits =
              decimalOrZero(
                paidUnits +
                  bonusUnits
              );

            if (
              totalUnits <=
              0
            ) {
              Swal.showValidationMessage(
                "Debes ingresar al menos una cantidad."
              );

              return;
            }

            return {
              fechaOperacion,

              cajas,

              cajasBono,

              unidades,

              unidadesBono,

              unidadesPorCaja,

              costoPorCaja,

              precioVenta,

              proveedorIds,

              referenciaLibro,

              numeroDocumento
            };
          }
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    try {
      Swal.fire({
        title:
          "Actualizando entrada",

        text:
          "Calculando diferencia de stock, costos y proveedores.",

        allowOutsideClick:
          false,

        allowEscapeKey:
          false,

        didOpen:
          () => {
            Swal.showLoading();
          }
      });

      const resultData =
        await updateEntryMovement(
          normalizedMovement.id,
          result.value
        );

      Swal.close();

      refreshInventoryView();

      await Swal.fire({
        icon:
          "success",

        title:
          "Entrada actualizada",

        html:
          `
            <div style="text-align:left">

              <p>
                Producto:
                <strong>
                  ${escapeHtml(
                    resultData.product.name ||
                      product.name ||
                      ""
                  )}
                </strong>
              </p>

              <p>
                Proveedores de la entrada:
                <strong>
                  ${escapeHtml(
                    resultData.movement.providerDisplay ||
                      "Sin proveedor"
                  )}
                </strong>
              </p>

              <p>
                Cajas:
                <strong>
                  ${formatQuantity(
                    resultData.movement.cajas
                  )}
                </strong>
              </p>

              <p>
                Unidades por caja:
                <strong>
                  ${formatQuantity(
                    resultData.movement.unidadesPorCaja
                  )}
                </strong>
              </p>

              <p>
                Entrada pagada:
                <strong>
                  ${formatQuantity(
                    resultData.movement.entradaPagada
                  )}
                  unidades
                </strong>
              </p>

              <p>
                Entrada bono:
                <strong>
                  ${formatQuantity(
                    resultData.movement.entradaBono
                  )}
                  unidades
                </strong>
              </p>

              <p>
                Entrada total:
                <strong>
                  ${formatQuantity(
                    resultData.movement.entrada
                  )}
                  unidades
                </strong>
              </p>

              <p>
                Costo por caja:
                <strong>
                  ${currency(
                    resultData.movement.costoPorCaja
                  )}
                </strong>
              </p>

              <p>
                Costo por unidad:
                <strong>
                  ${currency(
                    resultData.movement.costoUnitario
                  )}
                </strong>
              </p>

              <p>
                Costo total:
                <strong>
                  ${currency(
                    resultData.movement.costoTotal
                  )}
                </strong>
              </p>

              <p>
                Nuevo stock:
                <strong>
                  ${formatQuantity(
                    resultData.product.stockCurrentUnits
                  )}
                  unidades
                </strong>
              </p>

              ${
                resultData.expense
                  ? `
                    <p>
                      Gasto actualizado:
                      <strong>
                        ${currency(
                          resultData.expense.amount
                        )}
                      </strong>
                    </p>
                  `
                  : ""
              }

            </div>
          `
      });

      await openMovementManagerModal(
        movement.productId
      );
    } catch (
      error
    ) {
      Swal.close();

      console.error(
        "Error actualizando entrada:",
        error
      );

      await Swal.fire(
        "Error",
        error.message ||
          "No se pudo actualizar la entrada.",
        "error"
      );
    }
  }

  /*
   * ============================================================
   * ELIMINAR ENTRADA
   * ============================================================
   */

  async function deleteEntryMovement(
    movementId
  ) {
    const target =
      String(
        movementId ||
          ""
      ).trim();

    if (!target) {
      throw new Error(
        "No se indicó el movimiento."
      );
    }

    if (
      !canDeleteInventoryMovement()
    ) {
      throw new Error(
        "Solo el administrador puede eliminar movimientos de entrada."
      );
    }

    const movementRef =
      db
        .collection(
          MOVEMENTS_COLLECTION
        )
        .doc(
          target
        );

    let deletedProductId =
      "";

    let removedEntry =
      0;

    let previousStock =
      0;

    let nextStock =
      0;

    let removedCostTotal =
      0;

    let updatedExpense =
      null;

    await db.runTransaction(
      async transaction => {
        const movementSnap =
          await transaction.get(
            movementRef
          );

        if (
          !movementSnap.exists
        ) {
          throw new Error(
            "El movimiento ya no existe."
          );
        }

        const oldMovementRaw =
          movementSnap.data() ||
          {};

        if (
          String(
            oldMovementRaw.tipoMovimiento ||
              ""
          )
            .trim()
            .toLowerCase() !==
          "entrada"
        ) {
          throw new Error(
            "Solo se pueden eliminar movimientos de tipo entrada."
          );
        }

        if (
          !matchesCurrentLocal(
            oldMovementRaw
          )
        ) {
          throw new Error(
            "El movimiento no pertenece al local actual."
          );
        }

        const conversionId =
          String(
            oldMovementRaw.conversionId ||
              ""
          ).trim();

        const conversionType =
          String(
            oldMovementRaw.conversionType ||
              ""
          ).trim();

        if (
          conversionId ||
          conversionType
        ) {
          throw new Error(
            "Esta entrada fue generada por una conversión y no se puede eliminar desde el historial de compras."
          );
        }

        deletedProductId =
          String(
            oldMovementRaw.productId ||
              oldMovementRaw.productID ||
              oldMovementRaw.product_id ||
              ""
          ).trim();

        if (
          !deletedProductId
        ) {
          throw new Error(
            "El movimiento no tiene un producto asociado."
          );
        }

        const productRef =
          db
            .collection(
              PRODUCTS_COLLECTION
            )
            .doc(
              deletedProductId
            );

        const productSnap =
          await transaction.get(
            productRef
          );

        if (
          !productSnap.exists
        ) {
          throw new Error(
            "El producto asociado al movimiento ya no existe."
          );
        }

        const productData =
          productSnap.data() ||
          {};

        if (
          !matchesCurrentLocal(
            productData
          )
        ) {
          throw new Error(
            "El producto asociado no pertenece al local actual."
          );
        }

        const normalizedMovement =
          normalizeMovementDocument(
            target,
            oldMovementRaw
          );

        const breakdown =
          getMovementBreakdown(
            normalizedMovement,
            productData
          );

        removedEntry =
          breakdown.totalUnits >
          0
            ? breakdown.totalUnits
            : Math.max(
                0,
                numberOrZero(
                  oldMovementRaw.entrada
                )
              );

        if (
          removedEntry <=
          0
        ) {
          throw new Error(
            "El movimiento no contiene una cantidad válida para revertir."
          );
        }

        previousStock =
          getCurrentStockUnits(
            productData
          );

        nextStock =
          previousStock -
          removedEntry;

        if (
          nextStock <
          0
        ) {
          throw new Error(
            `No se puede eliminar esta entrada porque el stock actual (${formatQuantity(
              previousStock
            )}) es menor que la cantidad del movimiento (${formatQuantity(
              removedEntry
            )}).`
          );
        }

        const oldPaidUnits =
          breakdown.paidUnits;

        let oldCostPerUnit =
          numberOrZero(
            normalizedMovement.costoUnitario
          );

        if (
          oldCostPerUnit <=
          0
        ) {
          oldCostPerUnit =
            breakdown.unitsPerBox >
              0
              ? numberOrZero(
                  normalizedMovement.costoPorCaja
                ) /
                breakdown.unitsPerBox
              : 0;
        }

        removedCostTotal =
          normalizedMovement.costoTotal !==
            undefined &&
          normalizedMovement.costoTotal !==
            null
            ? Math.max(
                0,
                numberOrZero(
                  normalizedMovement.costoTotal
                )
              )
            : Math.max(
                0,
                oldPaidUnits *
                  oldCostPerUnit
              );

        const expenseId =
          String(
            oldMovementRaw.expenseId ||
              ""
          ).trim();

        let expenseRef =
          null;

        let expenseSnap =
          null;

        let expenseData =
          null;

        let nextExpenseAmount =
          0;

        if (
          expenseId
        ) {
          expenseRef =
            db
              .collection(
                EXPENSES_COLLECTION
              )
              .doc(
                expenseId
              );

          expenseSnap =
            await transaction.get(
              expenseRef
            );

          if (
            expenseSnap.exists
          ) {
            expenseData =
              expenseSnap.data() ||
              {};

            const oldExpenseAmount =
              Math.max(
                0,
                numberOrZero(
                  expenseData.amount
                )
              );

            nextExpenseAmount =
              Math.max(
                0,
                oldExpenseAmount -
                  removedCostTotal
              );
          }
        }

        const currentUnitsPerBox =
          getUnitsPerBox(
            productData
          );

        transaction.update(
          productRef,
          {
            quantity:
              nextStock,

            stockCurrentUnits:
              nextStock,

            boxes:
              decimalOrZero(
                nextStock /
                  currentUnitsPerBox
              ),

            updatedAt:
              firebase.firestore
                .FieldValue
                .serverTimestamp()
          }
        );

        transaction.delete(
          movementRef
        );

        if (
          expenseSnap &&
          expenseSnap.exists &&
          expenseRef
        ) {
          transaction.update(
            expenseRef,
            {
              amount:
                nextExpenseAmount,

              updatedAt:
                firebase.firestore
                  .FieldValue
                  .serverTimestamp(),

              inventoryLastMovementDeletion:
                true
            }
          );

          updatedExpense = {
            id:
              expenseId,

            data:
              expenseData,

            amount:
              nextExpenseAmount
          };
        }
      }
    );

    removeSessionDocument(
      MOVEMENTS_COLLECTION,
      target
    );

    const localProduct =
      findProductById(
        deletedProductId
      );

    if (
      localProduct
    ) {
      const currentUnitsPerBox =
        getUnitsPerBox(
          localProduct
        );

      const updatedLocalProduct = {
        ...localProduct,

        quantity:
          nextStock,

        stockCurrentUnits:
          nextStock,

        boxes:
          decimalOrZero(
            nextStock /
              currentUnitsPerBox
          ),

        updatedAt:
          Date.now()
      };

      Object.assign(
        localProduct,
        updatedLocalProduct
      );

      upsertSessionDocument(
        PRODUCTS_COLLECTION,
        deletedProductId,
        updatedLocalProduct
      );
    }

    if (
      updatedExpense
    ) {
      upsertSessionDocument(
        EXPENSES_COLLECTION,
        updatedExpense.id,
        {
          ...updatedExpense.data,

          amount:
            updatedExpense.amount,

          updatedAt:
            Date.now(),

          inventoryLastMovementDeletion:
            true
        }
      );
    }

    invalidateProductStockMovementsCache(
      deletedProductId
    );

    return {
      movementId:
        target,

      productId:
        deletedProductId,

      removedEntry,

      previousStock,

      nextStock,

      removedCostTotal,

      expense:
        updatedExpense
          ? {
              id:
                updatedExpense.id,

              amount:
                updatedExpense.amount
            }
          : null
    };
  }

  async function confirmDeleteEntryMovement(
    movementId
  ) {
    if (
      !canDeleteInventoryMovement()
    ) {
      await Swal.fire(
        "Sin permisos",
        "Solo el administrador puede eliminar movimientos de entrada.",
        "error"
      );

      return false;
    }

    const manager =
      document.getElementById(
        "movement-manager"
      );

    const managerProductId =
      manager
        ? String(
            manager.dataset.productId ||
              ""
          ).trim()
        : "";

    const movement =
      await findMovementById(
        movementId
      );

    if (!movement) {
      await Swal.fire(
        "Movimiento no encontrado",
        "El movimiento ya no está disponible.",
        "warning"
      );

      return false;
    }

    if (
      movement.tipoMovimiento !==
      "entrada"
    ) {
      await Swal.fire(
        "Movimiento no válido",
        "Solo se pueden eliminar entradas.",
        "warning"
      );

      return false;
    }

    if (
      movement.conversionId ||
      movement.conversionType
    ) {
      await Swal.fire(
        "Entrada de conversión",
        "Esta entrada fue generada por una conversión y debe gestionarse desde conversiones.",
        "warning"
      );

      return false;
    }

    const product =
      findProductById(
        movement.productId
      );

    const breakdown =
      getMovementBreakdown(
        movement,
        product
      );

    const removalUnits =
      breakdown.totalUnits > 0
        ? breakdown.totalUnits
        : Math.max(
            0,
            decimalOrZero(
              movement.entrada
            )
          );

    const confirmation =
      await Swal.fire({
        title:
          "¿Eliminar esta entrada?",

        html:
          `
            <div style="text-align:left">

              <p>
                Producto:
                <strong>
                  ${escapeHtml(
                    product?.name ||
                      movement.productName ||
                      "Producto"
                  )}
                </strong>
              </p>

              <p>
                Fecha:
                <strong>
                  ${escapeHtml(
                    getMovementOperationDateValue(
                      movement
                    ) ||
                      "Sin fecha"
                  )}
                </strong>
              </p>

              <p>
                Proveedores:
                <strong>
                  ${escapeHtml(
                    movement.providerDisplay ||
                      "Sin proveedor"
                  )}
                </strong>
              </p>

              <p>
                Entrada:
                <strong>
                  ${formatQuantity(
                    removalUnits
                  )}
                  unidades
                </strong>
              </p>

              <p>
                Costo total:
                <strong>
                  ${currency(
                    movement.costoTotal
                  )}
                </strong>
              </p>

              <p>
                Stock actual:
                <strong>
                  ${formatQuantity(
                    getCurrentStockUnits(
                      product
                    )
                  )}
                  unidades
                </strong>
              </p>

              <hr>

              <p style="
                color:#b91c1c;
                font-weight:700;
              ">
                Esta acción reducirá el stock y eliminará
                el movimiento.
              </p>

            </div>
          `,

        icon:
          "warning",

        showCancelButton:
          true,

        confirmButtonText:
          "Sí, eliminar",

        cancelButtonText:
          "Cancelar",

        confirmButtonColor:
          "#b91c1c"
      });

    if (
      !confirmation.isConfirmed
    ) {
      return false;
    }

    try {
      Swal.fire({
        title:
          "Eliminando entrada",

        text:
          "Revirtiendo stock y actualizando el gasto.",

        allowOutsideClick:
          false,

        allowEscapeKey:
          false,

        didOpen:
          () => {
            Swal.showLoading();
          }
      });

      const result =
        await deleteEntryMovement(
          movementId
        );

      Swal.close();

      refreshInventoryView();

      await Swal.fire({
        icon:
          "success",

        title:
          "Entrada eliminada",

        html:
          `
            <div style="text-align:left">

              <p>
                Unidades retiradas:
                <strong>
                  ${formatQuantity(
                    result.removedEntry
                  )}
                </strong>
              </p>

              <p>
                Stock anterior:
                <strong>
                  ${formatQuantity(
                    result.previousStock
                  )}
                </strong>
              </p>

              <p>
                Nuevo stock:
                <strong>
                  ${formatQuantity(
                    result.nextStock
                  )}
                </strong>
              </p>

              <p>
                Costo retirado:
                <strong>
                  ${currency(
                    result.removedCostTotal
                  )}
                </strong>
              </p>

              ${
                result.expense
                  ? `
                    <p>
                      Gasto actualizado:
                      <strong>
                        ${currency(
                          result.expense.amount
                        )}
                      </strong>
                    </p>
                  `
                  : ""
              }

            </div>
          `
      });

      await openMovementManagerModal(
        managerProductId
      );

      return true;
    } catch (
      error
    ) {
      Swal.close();

      await Swal.fire(
        "Error",
        error.message ||
          "No se pudo eliminar la entrada.",
        "error"
      );

      return false;
    }
  }

  /*
   * ============================================================
   * TABLA DE MOVIMIENTOS
   * ============================================================
   */

  function buildMovementManagerHtml(
    productId,
    movements
  ) {
    const product =
      productId
        ? findProductById(
            productId
          )
        : null;

    return `
      <div
        class="movement-manager"
        id="movement-manager"
        data-product-id="${escapeHtml(
          productId || ""
        )}"
      >

        <div class="movement-manager-title">

          <div>
            <strong>
              ${
                product
                  ? `Entradas de ${escapeHtml(
                      product.name
                    )}`
                  : "Entradas de inventario"
              }
            </strong>

            <small>
              ${
                product
                  ? "Historial completo de entradas de este producto."
                  : "Historial completo de entradas del local."
              }
            </small>
          </div>

          <div
            class="movement-manager-summary"
            id="movement-summary"
          >
            ${movements.length}
            ${
              movements.length ===
              1
                ? "entrada"
                : "entradas"
            }
          </div>

        </div>

        ${
          product
            ? `
              <div class="movement-current-stock-summary">

                <span>
                  Stock actual:
                  <strong>
                    ${formatQuantity(
                      getCurrentStockUnits(
                        product
                      )
                    )}
                  </strong>
                  unidades
                </span>

                <span>
                  Unidades/caja:
                  <strong>
                    ${formatQuantity(
                      getUnitsPerBox(
                        product
                      )
                    )}
                  </strong>
                </span>

                <span>
                  Cajas actuales:
                  <strong>
                    ${formatQuantity(
                      getStockBoxes(
                        product
                      )
                    )}
                  </strong>
                </span>

                <span>
                  Proveedores:
                  <strong>
                    ${escapeHtml(
                      getProductProvidersDisplay(
                        product
                      )
                    )}
                  </strong>
                </span>

              </div>
            `
            : ""
        }

        <div class="movement-filters">

          <div class="inv-field">
            <label>
              Fecha desde
            </label>

            <input
              id="movement-filter-from"
              type="date"
            >
          </div>

          <div class="inv-field">
            <label>
              Fecha hasta
            </label>

            <input
              id="movement-filter-to"
              type="date"
            >
          </div>

          ${
            product
              ? ""
              : `
                <div class="inv-field">
                  <label>
                    Producto / Proveedor
                  </label>

                  <input
                    id="movement-filter-product"
                    type="text"
                    list="movement-filter-product-list"
                    placeholder="Nombre, código, proveedor o razón social..."
                    autocomplete="off"
                  >

                  <datalist
                    id="movement-filter-product-list"
                  >
                    ${getProductFilterOptionsHtml()}
                  </datalist>
                </div>
              `
          }

          <div class="movement-filter-actions">

            <button
              type="button"
              class="btn-primary"
              id="movement-filter-apply"
            >
              <i class="fas fa-filter"></i>
              Filtrar
            </button>

            <button
              type="button"
              class="btn-outline"
              id="movement-filter-clear"
            >
              Limpiar
            </button>

          </div>

        </div>

        <div
          id="movement-table-wrapper"
          class="movement-table-wrapper"
        >
          ${renderMovementTableHtml(
            movements
          )}
        </div>

      </div>
    `;
  }

  function renderMovementTableHtml(
    movements
  ) {
    if (
      !movements.length
    ) {
      return `
        <div class="movement-empty">

          <i class="fas fa-box-open"></i>

          <strong>
            No hay entradas
          </strong>

          <span>
            No se encontraron movimientos de tipo entrada.
          </span>

        </div>
      `;
    }

    return `
      <div class="movement-table-scroll">

        <table class="movement-table">

          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Proveedores</th>
              <th>Entrada</th>
              <th>Costo por unidad</th>
              <th>Costo por caja</th>
              <th>Costo total</th>
              <th>Precio venta</th>
              <th>Referencia</th>
              <th>Documento</th>
              <th>Saldo</th>
              <th>Acción</th>
            </tr>
          </thead>

          <tbody>

            ${movements
              .map(
                movement => {
                  const hasConversionReference =
                    Boolean(
                      String(
                        movement.conversionId ||
                          ""
                      ).trim()
                    ) ||
                    Boolean(
                      String(
                        movement.conversionType ||
                          ""
                      ).trim()
                    );

                  const deleteDisabled =
                    !canDeleteInventoryMovement() ||
                    hasConversionReference;

                  const deleteTitle =
                    hasConversionReference
                      ? "Entrada generada por conversión"
                      : !canDeleteInventoryMovement()
                        ? "Solo administrador"
                        : "Eliminar entrada";

                  return `
                    <tr>

                      <td>
                        ${escapeHtml(
                          getMovementOperationDateValue(
                            movement
                          ) ||
                            "—"
                        )}
                      </td>

                      <td>
                        <strong>
                          ${escapeHtml(
                            movement.productCurrentName ||
                              movement.productName ||
                              "Producto"
                          )}
                        </strong>

                        ${
                          movement.codigoProducto
                            ? `
                              <small>
                                Código:
                                ${escapeHtml(
                                  movement.codigoProducto
                                )}
                              </small>
                            `
                            : ""
                        }
                      </td>

                      <td>
                        <strong>
                          ${escapeHtml(
                            movement.providerDisplay ||
                              "Sin proveedor"
                          )}
                        </strong>

                        ${
                          movement.proveedorRazonSocial
                            ? `
                              <small>
                                ${escapeHtml(
                                  movement.proveedorRazonSocial
                                )}
                              </small>
                            `
                            : ""
                        }
                      </td>

                      <td>

                        <strong>
                          ${formatQuantity(
                            movement.cajas
                          )}
                        </strong>

                        ${
                          decimalOrZero(
                            movement.cajas
                          ) === 1
                            ? "caja"
                            : "cajas"
                        }

                        ×

                        <strong>
                          ${formatQuantity(
                            movement.unidadesPorCaja
                          )}
                        </strong>

                        <small>
                          ${formatQuantity(
                            movement.unidades
                          )}
                          unidades sueltas
                        </small>

                        ${
                          decimalOrZero(
                            movement.cajasBono
                          ) > 0
                            ? `
                              <small>
                                +
                                ${formatQuantity(
                                  movement.cajasBono
                                )}
                                cajas bono
                              </small>
                            `
                            : ""
                        }

                        ${
                          decimalOrZero(
                            movement.unidadesBono
                          ) > 0
                            ? `
                              <small>
                                +
                                ${formatQuantity(
                                  movement.unidadesBono
                                )}
                                unidades bono
                              </small>
                            `
                            : ""
                        }

                        <small>
                          Total:
                          <strong>
                            ${formatQuantity(
                              movement.entrada
                            )}
                          </strong>
                          unidades
                        </small>

                      </td>

                      <td>
                        ${currency(
                          movement.costoUnitario
                        )}
                      </td>

                      <td>
                        ${currency(
                          movement.costoPorCaja
                        )}
                      </td>

                      <td>
                        <strong>
                          ${currency(
                            movement.costoTotal
                          )}
                        </strong>
                      </td>

                      <td>
                        ${currency(
                          movement.precioVenta
                        )}
                      </td>

                      <td>
                        ${escapeHtml(
                          movement.referenciaLibro ||
                            "—"
                        )}
                      </td>

                      <td>
                        ${escapeHtml(
                          movement.numeroDocumento ||
                            "—"
                        )}
                      </td>

                      <td>
                        ${formatQuantity(
                          movement.saldoActual
                        )}
                      </td>

                      <td>

                        <div class="movement-action-group">

                          <button
                            type="button"
                            class="btn-outline movement-edit-button"
                            data-movement-id="${escapeHtml(
                              movement.id
                            )}"
                          >
                            <i class="fas fa-edit"></i>
                            Editar
                          </button>

                          <button
                            type="button"
                            class="btn-outline movement-delete-button"
                            data-movement-id="${escapeHtml(
                              movement.id
                            )}"
                            ${
                              deleteDisabled
                                ? `disabled title="${escapeHtml(
                                    deleteTitle
                                  )}"`
                                : `title="${escapeHtml(
                                    deleteTitle
                                  )}"`
                            }
                          >
                            <i class="fas fa-trash"></i>
                            Eliminar
                          </button>

                        </div>

                      </td>

                    </tr>
                  `;
                }
              )
              .join("")}

          </tbody>

        </table>

      </div>
    `;
  }

  function filterMovements(
    movements,
    {
      productId = "",
      dateFrom = "",
      dateTo = "",
      productText = ""
    } = {}
  ) {
    const normalizedProductText =
      normalizeText(
        productText
      );

    return movements.filter(
      movement => {
        if (
          productId &&
          String(
            movement.productId
          ).trim() !==
            String(
              productId
            ).trim()
        ) {
          return false;
        }

        const date =
          getMovementOperationDateValue(
            movement
          );

        if (
          dateFrom &&
          (
            !date ||
            date <
              dateFrom
          )
        ) {
          return false;
        }

        if (
          dateTo &&
          (
            !date ||
            date >
              dateTo
          )
        ) {
          return false;
        }

        if (
          normalizedProductText
        ) {
          const searchable =
            [
              movement.productCurrentName ||
                movement.productName ||
                "",

              movement.codigoProducto ||
                "",

              movement.providerDisplay ||
                "",

              movement.proveedorNombre ||
                "",

              movement.proveedorRazonSocial ||
                ""
            ]
              .join(" ");

          if (
            !normalizeText(
              searchable
            ).includes(
              normalizedProductText
            )
          ) {
            return false;
          }
        }

        return true;
      }
    );
  }

  async function openMovementManagerModal(
    productId = ""
  ) {
    if (
      !canEditInventory
    ) {
      await Swal.fire(
        "Sin permisos",
        "No puedes editar movimientos de inventario.",
        "warning"
      );

      return;
    }

    let movements =
      productId
        ? await loadProductStockMovements(
            productId
          )
        : await loadAllEntryMovements();

    movements =
      movements.filter(
        movement =>
          movement.tipoMovimiento ===
          "entrada"
      );

    await Swal.fire({
      title:
        productId
          ? "Historial de entradas"
          : "Entradas de inventario",

      html:
        buildMovementManagerHtml(
          productId,
          movements
        ),

      width:
        "1400px",

      showCancelButton:
        false,

      showConfirmButton:
        false,

      focusConfirm:
        false,

      customClass: {
        popup:
          "inventory-movement-manager-modal"
      },

      didOpen:
        () => {
          const applyButton =
            document.getElementById(
              "movement-filter-apply"
            );

          const clearButton =
            document.getElementById(
              "movement-filter-clear"
            );

          const renderFiltered =
            () => {
              const dateFrom =
                String(
                  document.getElementById(
                    "movement-filter-from"
                  )?.value ||
                    ""
                ).trim();

              const dateTo =
                String(
                  document.getElementById(
                    "movement-filter-to"
                  )?.value ||
                    ""
                ).trim();

              const productText =
                String(
                  document.getElementById(
                    "movement-filter-product"
                  )?.value ||
                    ""
                ).trim();

              if (
                dateFrom &&
                dateTo &&
                dateFrom >
                  dateTo
              ) {
                Swal.fire(
                  "Filtro inválido",
                  "La fecha inicial no puede ser posterior a la fecha final.",
                  "warning"
                );

                return;
              }

              const filtered =
                filterMovements(
                  movements,
                  {
                    productId,
                    dateFrom,
                    dateTo,
                    productText
                  }
                );

              const summary =
                document.getElementById(
                  "movement-summary"
                );

              const wrapper =
                document.getElementById(
                  "movement-table-wrapper"
                );

              if (
                summary
              ) {
                summary.textContent =
                  `${filtered.length} entrada${
                    filtered.length ===
                    1
                      ? ""
                      : "s"
                  }`;
              }

              if (
                wrapper
              ) {
                wrapper.innerHTML =
                  renderMovementTableHtml(
                    filtered
                  );
              }

              bindMovementActionButtons();
            };

          if (
            applyButton
          ) {
            applyButton.addEventListener(
              "click",
              renderFiltered
            );
          }

          if (
            clearButton
          ) {
            clearButton.addEventListener(
              "click",
              () => {
                const from =
                  document.getElementById(
                    "movement-filter-from"
                  );

                const to =
                  document.getElementById(
                    "movement-filter-to"
                  );

                const product =
                  document.getElementById(
                    "movement-filter-product"
                  );

                if (
                  from
                ) {
                  from.value =
                    "";
                }

                if (
                  to
                ) {
                  to.value =
                    "";
                }

                if (
                  product
                ) {
                  product.value =
                    "";
                }

                renderFiltered();
              }
            );
          }

          const productFilter =
            document.getElementById(
              "movement-filter-product"
            );

          if (
            productFilter
          ) {
            [
              "input",
              "change"
            ].forEach(
              eventName => {
                productFilter.addEventListener(
                  eventName,
                  renderFiltered
                );
              }
            );
          }

          [
            document.getElementById(
              "movement-filter-from"
            ),
            document.getElementById(
              "movement-filter-to"
            )
          ]
            .filter(Boolean)
            .forEach(
              element => {
                element.addEventListener(
                  "change",
                  renderFiltered
                );
              }
            );

          bindMovementActionButtons();
        }
    });
  }

  function bindMovementEditButtons() {
    document
      .querySelectorAll(
        ".movement-edit-button"
      )
      .forEach(
        button => {
          if (
            button.dataset.bound ===
            "1"
          ) {
            return;
          }

          button.dataset.bound =
            "1";

          button.addEventListener(
            "click",
            async () => {
              const movementId =
                String(
                  button.dataset
                    .movementId ||
                    ""
                ).trim();

              if (!movementId) {
                return;
              }

              const movement =
                await findMovementById(
                  movementId
                );

              if (!movement) {
                await Swal.fire(
                  "Movimiento no encontrado",
                  "El movimiento ya no está disponible.",
                  "warning"
                );

                return;
              }

              await openEditMovementModal(
                movement
              );
            }
          );
        }
      );
  }

  function bindMovementDeleteButtons() {
    document
      .querySelectorAll(
        ".movement-delete-button"
      )
      .forEach(
        button => {
          if (
            button.dataset.bound ===
            "1"
          ) {
            return;
          }

          button.dataset.bound =
            "1";

          button.addEventListener(
            "click",
            async () => {
              if (
                button.disabled
              ) {
                return;
              }

              const movementId =
                String(
                  button.dataset
                    .movementId ||
                    ""
                ).trim();

              if (
                !movementId
              ) {
                return;
              }

              await confirmDeleteEntryMovement(
                movementId
              );
            }
          );
        }
      );
  }

  function bindMovementActionButtons() {
    bindMovementEditButtons();
    bindMovementDeleteButtons();
  }

  async function findMovementById(
    movementId
  ) {
    const target =
      String(
        movementId ||
          ""
      ).trim();

    if (!target) {
      return null;
    }

    const cached =
      getSessionCollection(
        MOVEMENTS_COLLECTION
      ).find(
        item =>
          String(
            item.id
          ).trim() ===
          target
      );

    if (
      cached &&
      matchesCurrentLocal(
        cached.data
      )
    ) {
      const movement =
        normalizeMovementDocument(
          cached.id,
          cached.data
        );

      const product =
        findProductById(
          movement.productId
        );

      movement.productCurrentName =
        product?.name ||
        movement.productName ||
        "Producto";

      movement.productCurrentProvider =
        getProductProvidersDisplay(
          product
        );

      movement.productCurrentStock =
        product
          ? getCurrentStockUnits(
              product
            )
          : movement.saldoActual;

      movement.providerDisplay =
        movement.providerDisplay ||
        getLineProvidersDisplay(
          movement
        );

      return movement;
    }

    return null;
  }

  /*
   * ============================================================
   * ELIMINAR PRODUCTO
   * ============================================================
   */

  async function confirmDeleteProduct(
    productId,
    productName
  ) {
    if (
      !isAdministratorRole()
    ) {
      await Swal.fire(
        "Sin permisos",
        "Solo el administrador puede eliminar productos.",
        "error"
      );

      return;
    }

    const confirmation =
      await Swal.fire({
        title:
          `¿Eliminar "${productName}"?`,

        text:
          "Esta acción no se puede deshacer.",

        icon:
          "warning",

        showCancelButton:
          true,

        confirmButtonText:
          "Sí, eliminar",

        cancelButtonText:
          "Cancelar"
      });

    if (
      !confirmation.isConfirmed
    ) {
      return;
    }

    try {
      await db
        .collection(
          PRODUCTS_COLLECTION
        )
        .doc(
          productId
        )
        .delete();

      removeSessionDocument(
        PRODUCTS_COLLECTION,
        productId
      );

      currentProductsList =
        currentProductsList.filter(
          product =>
            String(
              product.id
            ) !==
            String(
              productId
            )
        );

      invalidateProductStockMovementsCache(
        productId
      );

      refreshInventoryView();

      await Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "success",

        title:
          "Producto eliminado",

        showConfirmButton:
          false,

        timer:
          1500
      });
    } catch (
      error
    ) {
      console.error(
        "Error eliminando producto:",
        error
      );

      await Swal.fire(
        "Error",
        "No se pudo eliminar el producto.",
        "error"
      );
    }
  }

  /*
   * ============================================================
   * BOTONES
   * ============================================================
   */

  function ensureConversionModuleLoaded() {
    if (
      window.InventoryConversions
    ) {
      return Promise.resolve(
        window.InventoryConversions
      );
    }

    return import(
      "./conversion.js"
    ).then(
      () => {
        if (
          !window.InventoryConversions
        ) {
          throw new Error(
            "No se pudo cargar el módulo de conversiones."
          );
        }

        return window.InventoryConversions;
      }
    );
  }

  function ensureConversionButton() {
    const existing =
      document.getElementById(
        "btnConversions"
      );

    if (
      existing
    ) {
      existing.style.display =
        canEditInventory &&
        currentLocalId
          ? ""
          : "none";

      return existing;
    }

    const btnAdd =
      getInventoryAddButton();

    if (
      !btnAdd ||
      !canEditInventory ||
      !currentLocalId
    ) {
      return null;
    }

    const button =
      document.createElement(
        "button"
      );

    button.id =
      "btnConversions";

    button.type =
      "button";

    button.className =
      "btn-outline";

    button.innerHTML = `
      <i class="fas fa-arrows-alt-h"></i>
      Convertir productos
    `;

    button.style.marginLeft =
      "8px";

    button.addEventListener(
      "click",
      async () => {
        try {
          const module =
            await ensureConversionModuleLoaded();

          if (
            typeof module.openConversionModal !==
            "function"
          ) {
            throw new Error(
              "El módulo de conversiones no expone openConversionModal()."
            );
          }

          await module.openConversionModal();
        } catch (
          error
        ) {
          console.error(
            "Error abriendo conversiones:",
            error
          );

          await Swal.fire(
            "Error",
            error.message ||
              "No se pudo abrir el módulo de conversiones.",
            "error"
          );
        }
      }
    );

    btnAdd.parentNode?.insertBefore(
      button,
      btnAdd.nextSibling
    );

    return button;
  }

  function ensureGlobalMovementsButton() {
    const existing =
      document.getElementById(
        "btnMovements"
      );

    if (
      existing
    ) {
      existing.style.display =
        canEditInventory &&
        currentLocalId
          ? ""
          : "none";

      return existing;
    }

    const btnAdd =
      getInventoryAddButton();

    if (
      !btnAdd ||
      !canEditInventory ||
      !currentLocalId
    ) {
      return null;
    }

    const button =
      document.createElement(
        "button"
      );

    button.id =
      "btnMovements";

    button.type =
      "button";

    button.className =
      "btn-outline";

    button.innerHTML = `
      <i class="fas fa-history"></i>
      Movimientos de entrada
    `;

    button.style.marginLeft =
      "8px";

    button.addEventListener(
      "click",
      () =>
        openMovementManagerModal(
          ""
        )
    );

    btnAdd.parentNode?.insertBefore(
      button,
      btnAdd.nextSibling
    );

    return button;
  }

  /*
   * ============================================================
   * BÚSQUEDA
   * ============================================================
   */

  function applySearch() {
    const searchInput =
      getInventorySearchInput();

    const value =
      searchInput
        ? searchInput.value.trim()
        : "";

    if (
      inventoryDT
    ) {
      inventoryDT
        .search(
          value
        )
        .draw();

      return;
    }

    const normalized =
      normalizeText(
        value
      );

    const filtered =
      !normalized
        ? currentProductsList
        : currentProductsList.filter(
            product =>
              normalizeText(
                product.name
              ).includes(
                normalized
              ) ||
              normalizeText(
                getProductCode(
                  product
                )
              ).includes(
                normalized
              ) ||
              normalizeText(
                getProductProvidersSearchText(
                  product
                )
              ).includes(
                normalized
              )
          );

    renderInventoryFallback(
      filtered.map(
        buildRowData
      )
    );
  }

  /*
   * ============================================================
   * CONVERSIÓN RELOAD
   * ============================================================
   */

  async function reloadInventoryAfterConversion() {
    inventoryLoadPromise =
      null;

    currentProductsList =
      [];

    currentMonthlySalesMap =
      {};

    currentMonthlyBoxesMap =
      {};

    invalidateAllMovementsCache();

    await loadInventoryData();

    applySearch();

    ensureGlobalMovementsButton();
    ensureConversionButton();
  }

  /*
   * ============================================================
   * EVENTOS
   * ============================================================
   */

  function bindInventoryPageEvents() {
    const searchInput =
      getInventorySearchInput();

    const btnAdd =
      getInventoryAddButton();

    if (
      searchInput &&
      searchInput.dataset
        .inventorySearchBound !==
        "1"
    ) {
      searchInput.dataset
        .inventorySearchBound =
        "1";

      [
        "input",
        "keyup",
        "change"
      ].forEach(
        eventName => {
          searchInput.addEventListener(
            eventName,
            applySearch
          );
        }
      );
    }

    if (
      btnAdd &&
      btnAdd.dataset
        .inventoryAddBound !==
        "1"
    ) {
      btnAdd.dataset
        .inventoryAddBound =
        "1";

      btnAdd.addEventListener(
        "click",
        openBatchAddModal
      );
    }
  }

  /*
   * ============================================================
   * ESTILOS
   * ============================================================
   */

  function injectInventoryStyles() {
    if (
      document.getElementById(
        "inventoryBatchStyles"
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "inventoryBatchStyles";

    style.textContent = `
      .inventory-batch-modal,
      .inventory-movement-manager-modal,
      .inventory-movement-edit-modal {
        max-height:94vh !important;
        overflow-y:auto !important;
      }

      .batch-operation-date-box {
        display:grid;
        grid-template-columns:
          minmax(0,1fr)
          minmax(0,1fr);
        gap:12px;
        margin-bottom:14px;
        padding:12px;
        border:1px solid #dbeafe;
        border-radius:12px;
        background:#eff6ff;
        text-align:left;
      }

      .batch-operation-date-preview {
        display:flex;
        flex-direction:column;
        justify-content:center;
        padding:10px 12px;
        border-radius:10px;
        background:#ffffff;
        border:1px solid #bfdbfe;
        color:#374151;
        font-size:.85rem;
      }

      .batch-operation-date-preview strong {
        margin-top:4px;
        color:#1d4ed8;
        font-size:1rem;
      }

      .batch-products-container {
        display:flex;
        flex-direction:column;
        gap:14px;
        text-align:left;
        max-height:62vh;
        overflow-y:auto;
        padding:3px;
      }

      .batch-product-row {
        border:1px solid #e5e7eb;
        border-radius:14px;
        padding:14px;
        background:#f9fafb;
      }

      .batch-row-header {
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:center;
        margin-bottom:12px;
      }

      .batch-row-header strong {
        font-size:1rem;
        color:#111827;
      }

      .batch-row-total {
        display:inline-block;
        margin-left:10px;
        font-size:.8rem;
        color:#2563eb;
        font-weight:700;
      }

      .batch-grid {
        display:grid;
        grid-template-columns:
          repeat(4,minmax(0,1fr));
        gap:10px;
      }

      .inv-field {
        display:flex;
        flex-direction:column;
        gap:5px;
      }

      .inv-field label {
        font-size:.82rem;
        font-weight:700;
        color:#374151;
      }

      .inv-field input,
      .inv-field select,
      .inv-combobox {
        width:100%;
        min-height:40px;
        box-sizing:border-box;
      }

      .inv-field input[type="number"] {
        text-align:right;
        font-variant-numeric:tabular-nums;
      }

      .inv-field small {
        color:#6b7280;
        font-size:.72rem;
      }

      .batch-product-field {
        grid-column:span 2;
      }

      .batch-provider-field {
        grid-column:span 2;
      }

      .batch-product-status {
        min-height:18px;
      }

      .batch-status {
        display:inline-block;
        margin-top:3px;
        font-size:.72rem;
        font-weight:600;
      }

      .batch-status.success {
        color:#166534;
      }

      .batch-status.warning {
        color:#92400e;
      }

      .batch-status.info {
        color:#1d4ed8;
      }

      .batch-status.danger {
        color:#b91c1c;
      }

      .bonus-field {
        background:#fff7ed;
        border-radius:10px;
        padding:7px;
      }

      .bonus-field label {
        color:#9a3412;
      }

      .batch-row-summary {
        display:flex;
        flex-wrap:wrap;
        gap:12px;
        margin-top:12px;
        padding:10px;
        border-radius:10px;
        background:#eef2ff;
        color:#374151;
        font-size:.78rem;
      }

      .batch-row-summary strong {
        color:#111827;
      }

      .batch-info-box {
        margin-top:14px;
        padding:12px;
        border-radius:10px;
        background:#f3f4f6;
        text-align:left;
        color:#4b5563;
        font-size:.8rem;
      }

      .batch-info-box p {
        margin:5px 0;
      }

      .provider-multi-select {
        border:1px solid #d1d5db;
        border-radius:10px;
        background:#ffffff;
        padding:8px;
      }

      .provider-multi-header {
        display:flex;
        justify-content:space-between;
        gap:8px;
        align-items:center;
        margin-bottom:7px;
        font-size:.74rem;
        font-weight:700;
        color:#374151;
      }

      .provider-multi-count {
        color:#1d4ed8;
        white-space:nowrap;
      }

      .provider-multi-search {
        width:100%;
        min-height:36px;
        margin-bottom:7px;
        box-sizing:border-box;
      }

      .provider-multi-options {
        max-height:240px;
        overflow-y:auto;
        border:1px solid #e5e7eb;
        border-radius:8px;
        padding:5px;
        background:#f8fafc;
      }

      .provider-multi-option {
        display:flex;
        align-items:flex-start;
        gap:8px;
        padding:7px 8px;
        border-radius:7px;
        cursor:pointer;
        font-size:.76rem;
      }

      .provider-multi-option:hover {
        background:#eff6ff;
      }

      .provider-multi-option input {
        width:auto !important;
        min-height:auto !important;
        margin-top:3px;
      }

      .provider-multi-option span {
        display:flex;
        flex-direction:column;
        gap:2px;
        min-width:0;
      }

      .provider-multi-option small {
        color:#6b7280;
        font-size:.68rem;
      }

      .provider-multi-summary {
        margin-top:7px;
        padding:7px 8px;
        border-radius:7px;
        background:#eff6ff;
        color:#1d4ed8;
        font-size:.7rem;
        line-height:1.35;
      }

      .provider-multi-empty {
        padding:10px;
        text-align:center;
        color:#6b7280;
        font-size:.74rem;
      }

      .movement-manager {
        text-align:left;
      }

      .movement-manager-title {
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:center;
        margin-bottom:14px;
        padding:12px;
        border-radius:12px;
        background:#f8fafc;
        border:1px solid #e5e7eb;
      }

      .movement-manager-title > div:first-child {
        display:flex;
        flex-direction:column;
        gap:4px;
      }

      .movement-manager-title strong {
        color:#111827;
        font-size:1rem;
      }

      .movement-manager-title small {
        color:#6b7280;
      }

      .movement-manager-summary {
        font-weight:700;
        color:#1d4ed8;
        white-space:nowrap;
      }

      .movement-current-stock-summary {
        display:flex;
        flex-wrap:wrap;
        gap:14px;
        margin-bottom:12px;
        padding:11px 12px;
        border-radius:10px;
        background:#ecfdf5;
        border:1px solid #bbf7d0;
        color:#166534;
        font-size:.8rem;
      }

      .movement-current-stock-summary strong {
        color:#065f46;
      }

      .movement-filters {
        display:grid;
        grid-template-columns:
          repeat(4,minmax(0,1fr));
        gap:10px;
        padding:12px;
        margin-bottom:12px;
        border:1px solid #dbeafe;
        border-radius:12px;
        background:#eff6ff;
      }

      .movement-filter-actions {
        display:flex;
        align-items:end;
        gap:8px;
      }

      .movement-filter-actions button {
        min-height:40px;
      }

      .movement-table-scroll {
        overflow-x:auto;
        max-height:58vh;
        overflow-y:auto;
        border:1px solid #e5e7eb;
        border-radius:12px;
      }

      .movement-table {
        width:100%;
        border-collapse:collapse;
        font-size:.78rem;
        background:#ffffff;
      }

      .movement-table th,
      .movement-table td {
        padding:10px;
        border-bottom:1px solid #e5e7eb;
        text-align:left;
        vertical-align:middle;
        white-space:nowrap;
      }

      .movement-table th {
        position:sticky;
        top:0;
        z-index:1;
        background:#f8fafc;
        color:#374151;
        font-weight:700;
      }

      .movement-table td small {
        display:block;
        margin-top:3px;
        color:#6b7280;
      }

      .movement-action-group {
        display:flex;
        align-items:center;
        flex-wrap:wrap;
        gap:8px;
      }

      .movement-empty {
        min-height:200px;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:8px;
        color:#6b7280;
        border:1px dashed #cbd5e1;
        border-radius:12px;
        background:#f8fafc;
      }

      .movement-empty i {
        font-size:2rem;
        color:#94a3b8;
      }

      .movement-edit-form {
        text-align:left;
      }

      .movement-edit-header {
        display:flex;
        justify-content:space-between;
        gap:12px;
        padding:12px;
        margin-bottom:12px;
        border-radius:12px;
        background:#eff6ff;
        border:1px solid #bfdbfe;
      }

      .movement-edit-header > div {
        display:flex;
        flex-direction:column;
        gap:5px;
      }

      .movement-edit-header strong {
        color:#111827;
      }

      .movement-edit-header span {
        color:#475569;
        font-size:.82rem;
      }

      .movement-edit-header span strong {
        color:#1d4ed8;
      }

      .movement-edit-grid {
        display:grid;
        grid-template-columns:
          repeat(3,minmax(0,1fr));
        gap:10px;
      }

      .movement-edit-full {
        grid-column:span 3;
      }

      .movement-edit-provider-field {
        grid-column:span 2;
      }

      .movement-edit-preview {
        display:grid;
        grid-template-columns:
          repeat(4,minmax(0,1fr));
        gap:10px;
        margin-top:14px;
        padding:12px;
        border-radius:12px;
        background:#f8fafc;
        border:1px solid #e5e7eb;
      }

      .movement-edit-preview > div {
        display:flex;
        flex-direction:column;
        gap:4px;
        font-size:.78rem;
        color:#64748b;
      }

      .movement-edit-preview strong {
        font-size:1rem;
        color:#111827;
      }

      .movement-edit-warning,
      .movement-edit-linked {
        margin-top:12px;
        padding:11px 12px;
        border-radius:10px;
        font-size:.78rem;
        line-height:1.45;
      }

      .movement-edit-warning {
        background:#fff7ed;
        border:1px solid #fed7aa;
        color:#9a3412;
      }

      .movement-edit-linked {
        background:#ecfdf5;
        border:1px solid #bbf7d0;
        color:#166534;
      }

      @media (max-width:1100px) {
        .movement-edit-grid {
          grid-template-columns:
            repeat(2,minmax(0,1fr));
        }

        .movement-edit-full {
          grid-column:span 2;
        }
      }

      @media (max-width:1000px) {
        .movement-filters {
          grid-template-columns:
            repeat(2,minmax(0,1fr));
        }

        .movement-edit-preview {
          grid-template-columns:
            repeat(2,minmax(0,1fr));
        }
      }

      @media (max-width:900px) {
        .batch-operation-date-box {
          grid-template-columns:1fr;
        }

        .batch-grid {
          grid-template-columns:
            repeat(2,minmax(0,1fr));
        }

        .batch-product-field,
        .batch-provider-field {
          grid-column:span 2;
        }

        .movement-edit-provider-field {
          grid-column:span 2;
        }
      }

      @media (max-width:700px) {
        .movement-filters {
          grid-template-columns:1fr;
        }

        .movement-edit-grid {
          grid-template-columns:1fr;
        }

        .movement-edit-full,
        .movement-edit-provider-field {
          grid-column:span 1;
        }

        .movement-edit-preview {
          grid-template-columns:1fr;
        }

        .movement-filter-actions {
          align-items:stretch;
        }

        .movement-filter-actions button {
          flex:1;
        }
      }

      @media (max-width:600px) {
        .batch-grid {
          grid-template-columns:1fr;
        }

        .batch-product-field,
        .batch-provider-field {
          grid-column:span 1;
        }

        .batch-products-container {
          max-height:55vh;
        }

        .provider-multi-options {
          max-height:220px;
        }

        .movement-manager-title {
          flex-direction:column;
          align-items:flex-start;
        }
      }
    `;

    document.head.appendChild(
      style
    );
  }

  /*
   * ============================================================
   * INICIALIZACIÓN
   * ============================================================
   */

  async function initializeInventory(
    user
  ) {
    if (
      inventoryInitialized
    ) {
      bindInventoryPageEvents();

      ensureConversionButton();

      ensureGlobalMovementsButton();

      return;
    }

    inventoryInitialized =
      true;

    try {
      injectInventoryStyles();

      bindInventoryPageEvents();

      await resolveInventoryContext(
        user
      );

      if (
        !currentLocalId
      ) {
        throw new Error(
          "El usuario no tiene un local asignado."
        );
      }

      if (
        typeof window.renderNavigationForRole ===
        "function"
      ) {
        window.renderNavigationForRole(
          currentUserInventoryContext.role ||
            ""
        );
      }

      ensureInventoryDataTable();

      await ensureConversionModuleLoaded();

      ensureConversionButton();

      ensureGlobalMovementsButton();

      bindInventoryPageEvents();

      await loadInventoryProviders();

      await loadInventoryData();

      ensureConversionButton();

      ensureGlobalMovementsButton();

      applySearch();
    } catch (
      error
    ) {
      inventoryInitialized =
        false;

      console.error(
        "Error leyendo contexto del inventario:",
        error
      );

      if (
        typeof Swal !==
        "undefined"
      ) {
        await Swal.fire({
          icon:
            "error",

          title:
            "Error de inventario",

          text:
            error.message ||
            "No se pudo cargar el inventario."
        });
      }
    }
  }

  function initializePageEventsWhenPossible() {
    injectInventoryStyles();

    bindInventoryPageEvents();
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initializePageEventsWhenPossible,
      {
        once:
          true
      }
    );
  } else {
    initializePageEventsWhenPossible();
  }

  /*
   * ============================================================
   * CONTROLADOR MVC
   * ============================================================
   */

  const inventoryModel =
    window.InventoryMVC
      ?.models
      ?.inventory ||
    {};

  const inventoryController = {
    name:
      "inventory",

    page:
      inventoryModel.page ||
      "inventory.html",

    roles:
      inventoryModel.roles ||
      [],

    init:
      initializeInventory,

    reload:
      reloadInventoryAfterConversion
  };

  window.InventoryMVC.controllers.inventory =
    inventoryController;

  if (
    window.AppRouter &&
    typeof window.AppRouter.registerSecurePageController ===
      "function"
  ) {
    window.AppRouter.registerSecurePageController(
      inventoryController
    );
  } else {
    const initializeFallback =
      user => {
        const currentPage =
          window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();

        if (!user) {
          if (
            currentPage !==
              "index.html" &&
            currentPage !==
              "login.html"
          ) {
            window.location.href =
              "index.html";
          }

          return;
        }

        initializeInventory(
          user
        );
      };

    if (
      document.readyState ===
      "loading"
    ) {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          auth.onAuthStateChanged(
            initializeFallback
          );
        },
        {
          once:
            true
        }
      );
    } else {
      auth.onAuthStateChanged(
        initializeFallback
      );
    }
  }
})();