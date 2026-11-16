//js/inventory/inventory.repository.js
/*
 * Módulo de inventario
 * Repositorio: sesión, caché y acceso/consulta de datos.
 *
 * Responsabilidades:
 * - Consultar y preparar datos.
 * - Administrar las cachés del repositorio.
 * - Retornar los resultados al controlador.
 *
 * El repositorio no debe invocar funciones de renderizado
 * ni depender directamente de inventory.view.js.
 */

"use strict";

/*
 * ============================================================
 * CACHÉ DE MOVIMIENTOS
 * ============================================================
 */

let bioxInvAllEntryMovementsCache = null;
let bioxInvAllEntryMovementsPending = null;


/*
 * ============================================================
 * VALIDACIÓN DE DEPENDENCIAS
 * ============================================================
 */

function bioxInvEnsureFirebaseDependencies() {
  if (
    typeof auth === "undefined" ||
    !auth ||
    !auth.currentUser
  ) {
    throw new Error(
      "No existe una sesión de Firebase Authentication activa."
    );
  }

  if (
    typeof db === "undefined" ||
    !db
  ) {
    throw new Error(
      "No existe una instancia válida de Firestore."
    );
  }
}


function bioxInvEnsureMovementCaches() {
  if (
    !(bioxInvProductStockMovementsCache instanceof Map)
  ) {
    bioxInvProductStockMovementsCache = new Map();
  }

  if (
    !(bioxInvProductStockMovementsPending instanceof Map)
  ) {
    bioxInvProductStockMovementsPending = new Map();
  }
}


/*
 * ============================================================
 * USUARIO Y SESIÓN
 * ============================================================
 */

function bioxInvGetStoredCurrentUser() {
  if (
    typeof window.getStoredCurrentUser === "function"
  ) {
    return window.getStoredCurrentUser() || null;
  }

  try {
    return JSON.parse(
      localStorage.getItem("currentUser") || "null"
    );

  } catch (error) {
    console.warn(
      "[Inventario] No se pudo recuperar el usuario almacenado:",
      error
    );

    return null;
  }
}


function bioxInvPatchStoredCurrentUser(patch = {}) {
  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch)
  ) {
    return;
  }

  if (
    typeof window.patchStoredCurrentUser === "function"
  ) {
    window.patchStoredCurrentUser(patch);
    return;
  }

  try {
    const current =
      bioxInvGetStoredCurrentUser() || {};

    localStorage.setItem(
      "currentUser",
      JSON.stringify({
        ...current,
        ...patch
      })
    );

  } catch (error) {
    console.warn(
      "[Inventario] No se pudo actualizar el usuario almacenado:",
      error
    );
  }
}


/*
 * ============================================================
 * ACCESO A LA CACHÉ DE SESIÓN
 * ============================================================
 */

function bioxInvGetSessionCollection(collectionName) {
  if (
    typeof window.getSessionCollection !== "function"
  ) {
    throw new Error(
      "app.js no expuso getSessionCollection()."
    );
  }

  const documents =
    window.getSessionCollection(collectionName);

  return Array.isArray(documents)
    ? documents
    : [];
}


function bioxInvUpsertSessionDocument(
  collectionName,
  documentId,
  data = {}
) {
  if (
    typeof window.upsertSessionDocument !== "function"
  ) {
    console.warn(
      "[Inventario] app.js no expuso upsertSessionDocument()."
    );

    return false;
  }

  window.upsertSessionDocument(
    collectionName,
    documentId,
    data
  );

  return true;
}


function bioxInvRemoveSessionDocument(
  collectionName,
  documentId
) {
  if (
    typeof window.removeSessionDocument !== "function"
  ) {
    console.warn(
      "[Inventario] app.js no expuso removeSessionDocument()."
    );

    return false;
  }

  window.removeSessionDocument(
    collectionName,
    documentId
  );

  return true;
}


/*
 * ============================================================
 * CARGA DE DATOS DE SESIÓN
 * ============================================================
 */

async function bioxInvEnsureInventorySessionData(
  user,
  options = {}
) {
  if (!user || !user.uid) {
    throw new Error(
      "No existe un usuario autenticado válido."
    );
  }

  if (
    typeof window.ensureSessionDataLoaded !== "function"
  ) {
    throw new Error(
      "app.js no expuso ensureSessionDataLoaded()."
    );
  }

  await window.ensureSessionDataLoaded(
    user,
    {
      pageFile: "inventory.html",
      ...options
    }
  );
}


/*
 * ============================================================
 * RECUPERACIÓN ROBUSTA DE COLECCIONES DEL LOCAL
 * ============================================================
 *
 * La caché de sesión es una optimización, no la fuente única
 * de datos del inventario. Si una colección no está precargada
 * o su copia persistida quedó incompleta, se consulta Firestore
 * usando el id_local de la sesión activa.
 *
 * Esta consulta no modifica ni elimina documentos.
 */

async function bioxInvTryEnsureInventorySessionData(user) {
  try {
    await bioxInvEnsureInventorySessionData(user);
    return true;

  } catch (error) {
    console.warn(
      "[Inventario] No se pudo completar la precarga de sesión. " +
      "Se intentará recuperar la colección directamente desde Firestore.",
      error
    );

    return false;
  }
}


function bioxInvGetLocalCollectionCacheStatus(collectionName) {
  if (
    typeof window.getSessionCollectionStatus !== "function"
  ) {
    return null;
  }

  try {
    return window.getSessionCollectionStatus(
      collectionName
    ) || null;

  } catch (error) {
    console.warn(
      `[Inventario] No se pudo consultar el estado de caché de ${collectionName}:`,
      error
    );

    return null;
  }
}


async function bioxInvGetLocalCollectionDocuments(collectionName) {
  bioxInvEnsureFirebaseDependencies();

  const localId = String(
    bioxInvCurrentLocalId || ""
  ).trim();

  if (!localId) {
    throw new Error(
      `No se puede consultar ${collectionName}: no hay un id_local activo.`
    );
  }

  let cachedDocuments = [];

  try {
    cachedDocuments = bioxInvGetSessionCollection(
      collectionName
    );

  } catch (error) {
    console.warn(
      `[Inventario] No se pudo leer la caché de ${collectionName}:`,
      error
    );
  }

  const localCachedDocuments = cachedDocuments.filter(document =>
    document &&
    document.id &&
    bioxInvMatchesCurrentLocal(
      document.data || {}
    )
  );

  const cacheStatus =
    bioxInvGetLocalCollectionCacheStatus(collectionName);

  /*
   * Reutilizar una copia de sesión que contenga documentos y
   * esté completa. Si no existe status API, una copia con datos
   * se acepta por compatibilidad con versiones anteriores.
   */
  if (
    cacheStatus?.complete === true &&
    !cacheStatus.error &&
    !cacheStatus.storageTruncated
  ) {
    return localCachedDocuments;
  }

  // Compatibilidad con versiones anteriores sin API de estado.
  if (!cacheStatus && localCachedDocuments.length > 0) {
    return localCachedDocuments;
  }

  console.info(
    `[Inventario] Consultando ${collectionName} en Firestore ` +
    `(local=${localId}; caché=${localCachedDocuments.length}; ` +
    `completa=${cacheStatus?.complete === true}).`
  );

  let snapshot;

  try {
    const query = db
      .collection(collectionName)
      .where("id_local", "==", localId);

    await (window.BIOX_FIRESTORE_READY || Promise.resolve());

    if (
      cacheStatus?.complete === true &&
      cacheStatus.storageTruncated === true &&
      Number.isInteger(cacheStatus.sourceDocsCount ?? cacheStatus.totalDocs)
    ) {
      try {
        const cachedSnapshot = await query.get({ source: "cache" });

        const expectedSourceCount = cacheStatus.sourceDocsCount ?? cacheStatus.totalDocs;

        if (cachedSnapshot.size === expectedSourceCount) {
          snapshot = cachedSnapshot;
          console.info(
            `[Inventario] ${collectionName}: restaurados ${snapshot.size} documentos desde IndexedDB.`
          );
        } else {
          console.info(
            `[Inventario] ${collectionName}: caché local incompleta (${cachedSnapshot.size}/${expectedSourceCount}); se consultará el servidor.`
          );
        }
      } catch (cacheError) {
        console.info(
          `[Inventario] No se pudo recuperar ${collectionName} desde IndexedDB:`,
          cacheError?.message || cacheError
        );
      }
    }

    if (!snapshot) {
      snapshot = await query.get({ source: "server" });
    }

  } catch (error) {
    console.error(
      `[Inventario] Falló la consulta directa de ${collectionName}:`,
      error
    );

    throw new Error(
      `No se pudieron recuperar los documentos de ${collectionName} ` +
      `para el local actual. ${error?.message || error}`
    );
  }

  const documents = [];

  snapshot.forEach(documentSnapshot => {
    const data = documentSnapshot.data() || {};

    if (
      !bioxInvMatchesCurrentLocal(data)
    ) {
      return;
    }

    documents.push({
      id: documentSnapshot.id,
      data
    });
  });

  console.info(
    `[Inventario] ${collectionName} recuperados desde Firestore/IndexedDB:`,
    documents.length
  );

  if (typeof window.replaceSessionCollection === "function") {
    const role = String(
      bioxInvCurrentRole ||
      window.BIOXSession?.usuario?.role ||
      ""
    ).trim();

    window.replaceSessionCollection(
      collectionName,
      documents,
      {
        complete: true,
        source: "inventory-repository",
        mode: "local",
        localId,
        totalDocs: documents.length,
        sourceDocsCount: snapshot.size,
        queryKey: `${collectionName}::local::${role}::${localId}`
      }
    );
  }

  return documents;
}


/*
 * ============================================================
 * PROVEEDORES
 * ============================================================
 */

function bioxInvGetProviderById(providerId) {
  const target = String(
    providerId || ""
  ).trim();

  if (!target) {
    return null;
  }

  if (!Array.isArray(bioxInvCurrentProvidersList)) {
    return null;
  }

  return (
    bioxInvCurrentProvidersList.find(provider =>
      String(provider.id || "").trim() === target
    ) || null
  );
}


function bioxInvFindProviderByText(value) {
  const text = bioxInvNormalizeText(value);

  if (!text) {
    return null;
  }

  if (!Array.isArray(bioxInvCurrentProvidersList)) {
    return null;
  }

  const providers = bioxInvCurrentProvidersList;

  const exactName = providers.find(provider =>
    bioxInvNormalizeText(
      bioxInvGetProviderName(provider)
    ) === text
  );

  if (exactName) {
    return exactName;
  }

  const exactBusiness = providers.find(provider =>
    bioxInvNormalizeText(
      bioxInvGetProviderBusinessName(provider)
    ) === text
  );

  if (exactBusiness) {
    return exactBusiness;
  }

  const exactDisplay = providers.find(provider =>
    bioxInvNormalizeText(
      bioxInvGetProviderDisplayName(provider)
    ) === text
  );

  if (exactDisplay) {
    return exactDisplay;
  }

  return (
    providers.find(provider =>
      bioxInvNormalizeText(
        bioxInvGetProviderDisplayName(provider)
      ).includes(text)
    ) || null
  );
}


function bioxInvResolveProviderSelection(value) {
  const text = String(
    value || ""
  ).trim();

  return text
    ? bioxInvFindProviderByText(text)
    : null;
}


async function bioxInvLoadInventoryProviders(options = {}) {
  bioxInvEnsureFirebaseDependencies();

  const user = auth.currentUser || null;

  if (!user || !user.uid) {
    bioxInvCurrentProvidersList = [];

    throw new Error(
      "No existe un usuario autenticado para cargar los proveedores."
    );
  }

  if (options.ensureSession !== false) {
    await bioxInvTryEnsureInventorySessionData(user);
  }

  if (!bioxInvCurrentLocalId) {
    bioxInvCurrentProvidersList = [];

    throw new Error(
      "No se puede cargar el inventario porque no se ha identificado el local actual."
    );
  }

  try {
    const providerDocs =
      await bioxInvGetLocalCollectionDocuments(
        bioxInvPROVIDERS_COLLECTION
      );

    const providers = [];

    providerDocs.forEach(document => {
      if (
        !document ||
        !document.id
      ) {
        return;
      }

      const data = document.data || {};

      if (
        !bioxInvMatchesCurrentLocal(data)
      ) {
        return;
      }

      const provider =
        bioxInvNormalizeProviderObject({
          ...data,
          id: document.id
        });

      if (provider) {
        providers.push(provider);
      }
    });

    providers.sort((a, b) =>
      bioxInvNormalizeText(
        bioxInvGetProviderDisplayName(a)
      ).localeCompare(
        bioxInvNormalizeText(
          bioxInvGetProviderDisplayName(b)
        ),
        "es"
      )
    );

    bioxInvCurrentProvidersList = providers;

    console.log(
      "[Inventario] Proveedores cargados:",
      providers.length
    );

    return providers;

  } catch (error) {
    bioxInvCurrentProvidersList = [];

    console.error(
      "[Inventario] Error al cargar proveedores:",
      error
    );

    throw error;
  }
}


/*
 * ============================================================
 * PRODUCTOS
 * ============================================================
 */

function bioxInvFindProductById(id) {
  const target = String(
    id || ""
  ).trim();

  if (!target) {
    return null;
  }

  if (!Array.isArray(bioxInvCurrentProductsList)) {
    return null;
  }

  return (
    bioxInvCurrentProductsList.find(product =>
      String(product.id || "").trim() === target
    ) || null
  );
}


function bioxInvFindProductByText(value) {
  const text = bioxInvNormalizeText(value);

  if (!text) {
    return null;
  }

  if (!Array.isArray(bioxInvCurrentProductsList)) {
    return null;
  }

  const products = bioxInvCurrentProductsList;

  const exact = products.find(product =>
    bioxInvNormalizeText(
      product.name
    ) === text ||
    bioxInvNormalizeText(
      bioxInvGetProductCode(product)
    ) === text
  );

  if (exact) {
    return exact;
  }

  return (
    products.find(product =>
      bioxInvNormalizeText(
        product.name
      ).includes(text) ||
      bioxInvNormalizeText(
        bioxInvGetProductCode(product)
      ).includes(text) ||
      bioxInvNormalizeText(
        bioxInvGetProductProvidersSearchText(product)
      ).includes(text)
    ) || null
  );
}


/*
 * ============================================================
 * CARGA PRINCIPAL DEL INVENTARIO
 * ============================================================
 */

async function bioxInvLoadInventoryData() {
  /*
   * Evita ejecutar varias cargas simultáneas.
   * Las llamadas adicionales reutilizan la promesa activa.
   */
  if (bioxInvInventoryLoadPromise) {
    return bioxInvInventoryLoadPromise;
  }

  const loadPromise = (async () => {
    bioxInvEnsureFirebaseDependencies();

    const user = auth.currentUser || null;

    if (!user || !user.uid) {
      throw new Error(
        "No existe un usuario autenticado para cargar el inventario."
      );
    }

    /*
     * Garantiza que las colecciones necesarias estén
     * disponibles antes de consultar la caché.
     */
    await bioxInvTryEnsureInventorySessionData(user);

    /*
     * Se valida el local antes de cargar proveedores.
     * Esto evita invocar la carga de proveedores cuando
     * todavía no existe un local asociado a la sesión.
     */
    if (!bioxInvCurrentLocalId) {
      bioxInvCurrentProvidersList = [];
      bioxInvCurrentProductsList = [];
      bioxInvCurrentMonthlySalesMap = {};
      bioxInvCurrentMonthlyBoxesMap = {};

      throw new Error(
        "No se pudo identificar el local actual del inventario."
      );
    }

    /*
     * La carga de proveedores se realiza antes de procesar
     * los productos, porque estos utilizan sus datos.
     */
    await bioxInvLoadInventoryProviders({ ensureSession: false });

    /*
     * --------------------------------------------------------
     * PRODUCTOS
     * --------------------------------------------------------
     */

    const productDocuments =
      await bioxInvGetLocalCollectionDocuments(
        bioxInvPRODUCTS_COLLECTION
      );

    const products = [];

    productDocuments.forEach(document => {
      if (
        !document ||
        !document.id
      ) {
        return;
      }

      const data = document.data || {};

      if (
        !bioxInvMatchesCurrentLocal(data)
      ) {
        return;
      }

      const productProviders =
        bioxInvGetProductProviders({
          ...data
        });

      const primaryProvider =
        productProviders[0] || null;

      const stockUnits =
        bioxInvGetCurrentStockUnits(data);

      products.push({
        ...data,

        /*
         * El ID del documento de Firestore tiene prioridad
         * sobre cualquier propiedad id almacenada en data.
         */
        id: document.id,

        proveedorIds:
          bioxInvGetProviderIds(
            productProviders
          ),

        proveedorIdsV2:
          bioxInvGetProviderIds(
            productProviders
          ),

        proveedores:
          productProviders,

        proveedorId:
          primaryProvider?.id ||
          data.proveedorId ||
          null,

        proveedorNombre:
          bioxInvGetProviderName(primaryProvider) ||
          String(
            data.proveedorNombre || ""
          ).trim(),

        proveedorRazonSocial:
          bioxInvGetProviderBusinessName(primaryProvider) ||
          String(
            data.proveedorRazonSocial ||
            data.proveedorRazonSocialDenominacion ||
            data.proveedorDenominacion ||
            ""
          ).trim(),

        id_local:
          bioxInvCurrentLocalId,

        localNombre:
          data.localNombre ||
          bioxInvCurrentLocalInfo.nombre ||
          "",

        localNumeroDocumento:
          data.localNumeroDocumento ||
          bioxInvCurrentLocalInfo.numeroDocumento ||
          "",

        localUbicacion:
          data.localUbicacion ||
          bioxInvCurrentLocalInfo.ubicacion ||
          "",

        localContribuyente:
          data.localContribuyente ||
          bioxInvCurrentLocalInfo.contribuyente ||
          "",

        localTipoDocumento:
          data.localTipoDocumento ||
          bioxInvCurrentLocalInfo.tipoDocumento ||
          "",

        localNIT:
          data.localNIT ||
          bioxInvCurrentLocalInfo.nit ||
          "",

        localNRC:
          data.localNRC ||
          bioxInvCurrentLocalInfo.nrc ||
          "",

        quantity:
          stockUnits,

        stockCurrentUnits:
          stockUnits,

        unitsPerBox:
          Math.max(
            0.000001,
            bioxInvDecimalOrZero(
              data.unitsPerBox
            ) || 1
          )
      });
    });

    products.sort((a, b) =>
      bioxInvNormalizeText(
        a.name
      ).localeCompare(
        bioxInvNormalizeText(
          b.name
        ),
        "es"
      )
    );

    /*
     * Actualiza el estado de productos del módulo.
     */
    bioxInvCurrentProductsList = products;

    /*
     * --------------------------------------------------------
     * VENTAS DEL LOCAL
     * --------------------------------------------------------
     */

    const salesDocuments =
      bioxInvGetSessionCollection(
        bioxInvSALES_COLLECTION
      );

    const localSalesDocuments =
      salesDocuments.filter(document => {
        if (!document) {
          return false;
        }

        return bioxInvMatchesCurrentLocal(
          document.data || {}
        );
      });

    const sales =
      bioxInvAggregateMonthlySales(
        localSalesDocuments
      );

    bioxInvCurrentMonthlySalesMap =
      sales.unitsMap || {};

    bioxInvCurrentMonthlyBoxesMap =
      sales.boxesMap || {};

    /*
     * --------------------------------------------------------
     * MOVIMIENTOS
     * --------------------------------------------------------
     *
     * No se descarga el historial completo de movimientos
     * al abrir inventario.
     *
     * El stock guardado en cada producto es la fuente
     * para la vista inicial.
     *
     * El historial se consulta bajo demanda.
     */

    /*
     * --------------------------------------------------------
     * RESULTADO
     * --------------------------------------------------------
     *
     * El repositorio no ejecuta funciones de la vista.
     *
     * La actualización del DOM y de DataTables corresponde
     * al controlador, que debe utilizar los datos retornados
     * por esta función.
     *
     * Se conserva el retorno original: arreglo de productos.
     */

    console.log(
      "[Inventario] Datos cargados:",
      {
        localId:
          bioxInvCurrentLocalId,

        productos:
          bioxInvCurrentProductsList.length,

        ventas:
          localSalesDocuments.length,

        proveedores:
          bioxInvCurrentProvidersList.length
      }
    );

    return bioxInvCurrentProductsList;
  })();

  bioxInvInventoryLoadPromise = loadPromise;

  try {
    return await loadPromise;

  } catch (error) {
    console.error(
      "[Inventario] Error al cargar los datos:",
      error
    );

    throw error;

  } finally {
    /*
     * Evita que una carga anterior borre una promesa
     * más reciente que pudiera haberse asignado.
     */
    if (
      bioxInvInventoryLoadPromise === loadPromise
    ) {
      bioxInvInventoryLoadPromise = null;
    }
  }
}


/*
 * ============================================================
 * CONSULTA DE MOVIMIENTOS POR LOCAL
 * ============================================================
 */

async function bioxInvQueryLocalMovementDocuments(
  productId = ""
) {
  bioxInvEnsureFirebaseDependencies();

  const localId = String(
    bioxInvCurrentLocalId || ""
  ).trim();

  const targetProductId = String(
    productId || ""
  ).trim();

  if (!localId) {
    throw new Error(
      "No se puede consultar el historial porque no se ha identificado el local actual."
    );
  }

  let snapshot;

  try {
    let query = db
      .collection(bioxInvMOVEMENTS_COLLECTION)
      .where("id_local", "==", localId);

    if (targetProductId) {
      query = query.where(
        "productId",
        "==",
        targetProductId
      );
    }

    snapshot = await query.get();

  } catch (queryError) {
    if (!targetProductId) {
      throw queryError;
    }

    /*
     * Fallback para datos antiguos o instalaciones
     * sin el índice compuesto.
     *
     * La consulta sigue limitada al local actual.
     */
    console.warn(
      "[Inventario] No se pudo filtrar el historial por producto. Se consultarán los movimientos del local.",
      queryError
    );

    snapshot = await db
      .collection(bioxInvMOVEMENTS_COLLECTION)
      .where("id_local", "==", localId)
      .get();
  }

  const documents = [];

  snapshot.forEach(doc => {
    const data = doc.data() || {};

    if (
      !bioxInvMatchesCurrentLocal(data)
    ) {
      return;
    }

    if (targetProductId) {
      const documentProductId = String(
        data.productId ||
        data.productID ||
        data.product_id ||
        ""
      ).trim();

      if (
        documentProductId !== targetProductId
      ) {
        return;
      }
    }

    documents.push({
      id: doc.id,
      data
    });

    /*
     * Guarda el movimiento en la caché de sesión
     * para reutilizarlo en las operaciones posteriores.
     */
    bioxInvUpsertSessionDocument(
      bioxInvMOVEMENTS_COLLECTION,
      doc.id,
      data
    );
  });

  return documents;
}


/*
 * ============================================================
 * NORMALIZACIÓN DE MOVIMIENTOS PARA INVENTARIO
 * ============================================================
 */

function bioxInvDecorateMovementForInventory(document) {
  const movement =
    bioxInvNormalizeMovementDocument(
      document.id,
      document.data || {}
    );

  const product =
    bioxInvFindProductById(
      movement.productId
    );

  movement.productCurrentName =
    product?.name ||
    movement.productName ||
    "Producto";

  movement.productCurrentProvider =
    bioxInvGetProductProvidersDisplay(
      product
    );

  movement.productCurrentStock = product
    ? bioxInvGetCurrentStockUnits(product)
    : movement.saldoActual;

  movement.productCurrentPrice = product
    ? bioxInvNumberOrZero(product.price)
    : movement.precioVenta;

  movement.providerDisplay =
    movement.providerDisplay ||
    bioxInvGetLineProvidersDisplay(movement);

  return movement;
}


/*
 * ============================================================
 * MOVIMIENTOS DE UN PRODUCTO
 * ============================================================
 */

async function bioxInvLoadProductStockMovements(
  productId
) {
  bioxInvEnsureMovementCaches();

  const target = String(
    productId || ""
  ).trim();

  if (!target) {
    return [];
  }

  if (
    bioxInvProductStockMovementsCache.has(target)
  ) {
    return (
      bioxInvProductStockMovementsCache.get(target) || []
    );
  }

  if (
    bioxInvProductStockMovementsPending.has(target)
  ) {
    return bioxInvProductStockMovementsPending.get(target);
  }

  const promise = (async () => {
    const documents =
      await bioxInvQueryLocalMovementDocuments(target);

    const movements = documents
      .map(
        bioxInvDecorateMovementForInventory
      )
      .sort((a, b) =>
        bioxInvGetMovementOperationDateValue(b).localeCompare(
          bioxInvGetMovementOperationDateValue(a)
        ) ||
        bioxInvNumberOrZero(b.createdAtMs) -
        bioxInvNumberOrZero(a.createdAtMs)
      );

    bioxInvProductStockMovementsCache.set(
      target,
      movements
    );

    return movements;
  })();

  bioxInvProductStockMovementsPending.set(
    target,
    promise
  );

  try {
    return await promise;

  } finally {
    /*
     * Solo elimina la promesa si sigue siendo la misma.
     */
    if (
      bioxInvProductStockMovementsPending.get(target) === promise
    ) {
      bioxInvProductStockMovementsPending.delete(target);
    }
  }
}


/*
 * ============================================================
 * TODAS LAS ENTRADAS DE INVENTARIO
 * ============================================================
 */

async function bioxInvLoadAllEntryMovements() {
  if (
    Array.isArray(bioxInvAllEntryMovementsCache)
  ) {
    return bioxInvAllEntryMovementsCache;
  }

  if (bioxInvAllEntryMovementsPending) {
    return bioxInvAllEntryMovementsPending;
  }

  const promise = (async () => {
    const documents =
      await bioxInvQueryLocalMovementDocuments();

    const movements = documents
      .map(
        bioxInvDecorateMovementForInventory
      )
      .filter(movement =>
        movement.tipoMovimiento === "entrada" &&
        Boolean(movement.productId)
      )
      .sort((a, b) =>
        bioxInvGetMovementOperationDateValue(b).localeCompare(
          bioxInvGetMovementOperationDateValue(a)
        ) ||
        bioxInvNumberOrZero(b.createdAtMs) -
        bioxInvNumberOrZero(a.createdAtMs)
      );

    bioxInvAllEntryMovementsCache = movements;

    return movements;
  })();

  bioxInvAllEntryMovementsPending = promise;

  try {
    return await promise;

  } finally {
    if (
      bioxInvAllEntryMovementsPending === promise
    ) {
      bioxInvAllEntryMovementsPending = null;
    }
  }
}


/*
 * ============================================================
 * INVALIDACIÓN DE CACHÉ DE MOVIMIENTOS
 * ============================================================
 */

function bioxInvInvalidateProductStockMovementsCache(
  productId
) {
  bioxInvEnsureMovementCaches();

  const target = String(
    productId || ""
  ).trim();

  if (target) {
    bioxInvProductStockMovementsCache.delete(target);
  }

  /*
   * Un cambio en un producto también invalida
   * el historial global de entradas.
   */
  bioxInvAllEntryMovementsCache = null;
}


function bioxInvInvalidateAllMovementsCache() {
  bioxInvEnsureMovementCaches();

  bioxInvProductStockMovementsCache.clear();

  bioxInvAllEntryMovementsCache = null;
}


/*
 * ============================================================
 * BÚSQUEDA DE MOVIMIENTO POR IDENTIFICADOR
 * ============================================================
 */

async function bioxInvFindMovementById(
  movementId
) {
  bioxInvEnsureFirebaseDependencies();

  const target = String(
    movementId || ""
  ).trim();

  if (!target) {
    return null;
  }

  if (!bioxInvCurrentLocalId) {
    throw new Error(
      "No se puede consultar el movimiento porque no se ha identificado el local actual."
    );
  }

  /*
   * Primero se intenta recuperar el documento desde
   * la caché de sesión.
   */
  const cachedDocuments =
    bioxInvGetSessionCollection(
      bioxInvMOVEMENTS_COLLECTION
    );

  const cached = cachedDocuments.find(item =>
    String(item.id || "").trim() === target
  );

  let data = null;

  if (cached) {
    data = cached.data || {};

    /*
     * Si está en caché, pero pertenece a otro local,
     * no debe devolverse.
     */
    if (
      !bioxInvMatchesCurrentLocal(data)
    ) {
      return null;
    }

  } else {
    /*
     * Si no está en caché, se consulta el documento
     * individualmente en Firestore.
     *
     * Después de recuperarlo se comprueba su local.
     */
    try {
      const documentSnapshot = await db
        .collection(bioxInvMOVEMENTS_COLLECTION)
        .doc(target)
        .get();

      if (!documentSnapshot.exists) {
        return null;
      }

      data = documentSnapshot.data() || {};

      if (
        !bioxInvMatchesCurrentLocal(data)
      ) {
        return null;
      }

      bioxInvUpsertSessionDocument(
        bioxInvMOVEMENTS_COLLECTION,
        documentSnapshot.id,
        data
      );

    } catch (error) {
      console.error(
        "[Inventario] No se pudo consultar el movimiento:",
        error
      );

      throw error;
    }
  }

  const movement =
    bioxInvNormalizeMovementDocument(
      target,
      data
    );

  const product =
    bioxInvFindProductById(
      movement.productId
    );

  movement.productCurrentName =
    product?.name ||
    movement.productName ||
    "Producto";

  movement.productCurrentProvider =
    bioxInvGetProductProvidersDisplay(
      product
    );

  movement.productCurrentStock = product
    ? bioxInvGetCurrentStockUnits(product)
    : movement.saldoActual;

  movement.productCurrentPrice = product
    ? bioxInvNumberOrZero(product.price)
    : movement.precioVenta;

  movement.providerDisplay =
    movement.providerDisplay ||
    bioxInvGetLineProvidersDisplay(movement);

  return movement;
}


/*
 * ============================================================
 * REGISTRO DEL REPOSITORIO EN MVC
 * ============================================================
 *
 * IMPORTANTE:
 *
 * No se utiliza Object.assign() sobre el repositorio anterior.
 * El objeto anterior podría estar congelado o tener propiedades
 * de solo lectura, como ocurrió con la propiedad "page".
 *
 * Se crea un objeto nuevo y se conservan sus propiedades
 * enumerables anteriores.
 */

(function bioxInvRegisterInventoryRepository() {
  const previousMVC =
    window.InventoryMVC &&
    typeof window.InventoryMVC === "object"
      ? window.InventoryMVC
      : {};

  const previousModels =
    previousMVC.models &&
    typeof previousMVC.models === "object"
      ? previousMVC.models
      : {};

  const previousRepository =
    previousModels.inventory &&
    typeof previousModels.inventory === "object"
      ? previousModels.inventory
      : {};

  const inventoryRepository = {
    ...previousRepository,

    page: "inventory.html",

    loadProviders: function () {
      return bioxInvLoadInventoryProviders();
    },

    loadData: function () {
      return bioxInvLoadInventoryData();
    },

    loadAllEntryMovements: function () {
      return bioxInvLoadAllEntryMovements();
    },

    loadProductStockMovements: function (productId) {
      return bioxInvLoadProductStockMovements(productId);
    },

    findMovementById: function (movementId) {
      return bioxInvFindMovementById(movementId);
    },

    invalidateProductMovements: function (productId) {
      return bioxInvInvalidateProductStockMovementsCache(
        productId
      );
    },

    invalidateAllMovements: function () {
      return bioxInvInvalidateAllMovementsCache();
    }
  };

  /*
   * Se reemplaza el objeto models y el objeto InventoryMVC.
   * Esto evita modificar directamente objetos anteriores
   * que pudieran estar congelados.
   */
  window.InventoryMVC = {
    ...previousMVC,

    models: {
      ...previousModels,

      inventory: inventoryRepository
    }
  };

  /*
   * Compatibilidad con código anterior que invoque
   * las funciones directamente desde window.
   */
  window.bioxInvLoadInventoryProviders =
    bioxInvLoadInventoryProviders;

  window.bioxInvLoadInventoryData =
    bioxInvLoadInventoryData;

  /*
   * Verificación del registro.
   */
  const registeredRepository =
    window.InventoryMVC.models.inventory;

  if (
    !registeredRepository ||
    typeof registeredRepository.loadData !== "function"
  ) {
    throw new Error(
      "[Inventario] No se pudo registrar loadData() en el repositorio."
    );
  }

  if (
    typeof registeredRepository.loadProviders !== "function"
  ) {
    throw new Error(
      "[Inventario] No se pudo registrar loadProviders() en el repositorio."
    );
  }

  console.info(
    "[Inventario] Repositorio registrado correctamente.",
    {
      page: registeredRepository.page,

      loadData:
        typeof registeredRepository.loadData,

      loadProviders:
        typeof registeredRepository.loadProviders,

      loadAllEntryMovements:
        typeof registeredRepository.loadAllEntryMovements,

      loadProductStockMovements:
        typeof registeredRepository.loadProductStockMovements,

      findMovementById:
        typeof registeredRepository.findMovementById
    }
  );
})();
