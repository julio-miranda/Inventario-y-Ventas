"use strict";

/*
 * ============================================================
 * FIREBASE COMPAT: INSTANCIA CANÓNICA DEL SERVICIO
 * ============================================================
 *
 * Este módulo utiliza exclusivamente la API compat del mismo
 * SDK expuesto en window.firebase. No debe mezclar referencias,
 * consultas, lotes o transacciones creados por la API modular
 * ni por otra copia/versión del SDK.
 *
 * La conexión al emulador se configura previamente en
 * js/config/firebase.js. Esta instancia hereda esa configuración.
 */

const bioxInvFirebaseSdk =
  typeof window !== "undefined" ? window.firebase : null;

if (
  !bioxInvFirebaseSdk ||
  typeof bioxInvFirebaseSdk.firestore !== "function" ||
  typeof bioxInvFirebaseSdk.auth !== "function"
) {
  throw new Error(
    "Firebase compat no está disponible. Carga js/config/firebase.js antes de inventory.service.js."
  );
}

const bioxInvFirestore = bioxInvFirebaseSdk.firestore();
const bioxInvAuth = bioxInvFirebaseSdk.auth();

if (
  !bioxInvFirestore ||
  typeof bioxInvFirestore.collection !== "function" ||
  typeof bioxInvFirestore.batch !== "function" ||
  typeof bioxInvFirestore.runTransaction !== "function"
) {
  throw new Error(
    "La instancia de Firestore no es compatible con la API compat esperada por inventory.service.js."
  );
}

function bioxInvServerTimestamp() {
  return bioxInvFirebaseSdk.firestore.FieldValue.serverTimestamp();
}

/*
 * Firestore acepta objetos Date nativos. Se utiliza esta conversión
 * al escribir marcas de tiempo de operación para evitar enviar un
 * Timestamp creado por otra copia/versión del SDK.
 *
 * El Timestamp original se conserva en las variables locales cuando
 * se necesita llamar toMillis() para cálculos y caché de sesión.
 */
function bioxInvToFirestoreDate(value) {
  let date = null;

  if (value instanceof Date) {
    date = new Date(value.getTime());
  } else if (value && typeof value.toDate === "function") {
    date = value.toDate();
    if (date instanceof Date) {
      date = new Date(date.getTime());
    }
  } else if (value && typeof value.toMillis === "function") {
    const milliseconds = Number(value.toMillis());
    if (Number.isFinite(milliseconds)) {
      date = new Date(milliseconds);
    }
  } else if (typeof value === "number" || typeof value === "string") {
    date = new Date(value);
  }

  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error(
      "No se pudo convertir la fecha de operación a una fecha válida para Firestore."
    );
  }

  return date;
}

console.info("[Inventario] Servicio conectado a una única instancia Firebase compat.", {
  projectId: bioxInvFirestore.app?.options?.projectId || "desconocido",
  sdkVersion: bioxInvFirebaseSdk.SDK_VERSION || "desconocida"
});

/*
 * Reparación histórica automática por local.
 * Evita repetir el barrido durante la misma sesión y evita
 * ejecutar dos reparaciones simultáneas para el mismo local.
 */
var bioxInvHistoricalRepairCompletedLocals =
  window.bioxInvHistoricalRepairCompletedLocals instanceof Set
    ? window.bioxInvHistoricalRepairCompletedLocals
    : new Set();

var bioxInvHistoricalRepairPendingLocals =
  window.bioxInvHistoricalRepairPendingLocals instanceof Map
    ? window.bioxInvHistoricalRepairPendingLocals
    : new Map();

window.bioxInvHistoricalRepairCompletedLocals =
  bioxInvHistoricalRepairCompletedLocals;

window.bioxInvHistoricalRepairPendingLocals =
  bioxInvHistoricalRepairPendingLocals;

function bioxInvGetValidatedOperationDate(value) {
  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : bioxInvParseOperationDate(value);
  if (
    !(date instanceof Date) ||
    !Number.isFinite(date.getTime())
  ) {
    return null;
  }
  return date;
}

function bioxInvAssertInventoryWriteAccess(user = null) {
  const authenticatedUser =
    user ||
    (
      typeof bioxInvAuth !== "undefined" &&
        bioxInvAuth
        ? bioxInvAuth.currentUser
        : null
    );
  if (
    !authenticatedUser ||
    !authenticatedUser.uid
  ) {
    throw new Error(
      "No existe un usuario autenticado válido."
    );
  }
  const localId =
    typeof bioxInvCurrentLocalId !== "undefined"
      ? String(
        bioxInvCurrentLocalId || ""
      ).trim()
      : "";
  if (!localId) {
    throw new Error(
      "No hay un local seleccionado para realizar esta operación."
    );
  }
  const canEdit =
    typeof bioxInvCanEditInventory !== "undefined" &&
    bioxInvCanEditInventory === true;
  if (!canEdit) {
    throw new Error(
      "No tienes permisos para modificar el inventario."
    );
  }
  return authenticatedUser;
}

async function bioxInvResolveInventoryContext(
  user,
  validatedRouteContext = null
) {
  if (!user || !user.uid) {
    throw new Error(
      "No existe un usuario autenticado válido."
    );
  }
  const userUid = String(user.uid).trim();
  let context = null;
  if (
    validatedRouteContext &&
    typeof validatedRouteContext === "object"
  ) {
    const contextUid = String(
      validatedRouteContext.uid || ""
    ).trim();
    if (contextUid !== userUid) {
      throw new Error(
        "El contexto recibido por el inventario no corresponde al usuario autenticado."
      );
    }
    context = validatedRouteContext;
  } else {
    if (
      typeof window.getCurrentUserContext !== "function"
    ) {
      throw new Error(
        "app.js no expuso getCurrentUserContext()."
      );
    }
    await bioxInvEnsureInventorySessionData(user);
    context = await window.getCurrentUserContext(user);
  }
  if (
    !context ||
    typeof context !== "object"
  ) {
    throw new Error(
      "No se pudo resolver un contexto válido para el usuario."
    );
  }
  const contextUid = String(
    context.uid || ""
  ).trim();
  if (
    contextUid &&
    contextUid !== userUid
  ) {
    throw new Error(
      "El contexto de inventario pertenece a otro usuario."
    );
  }
  bioxInvCurrentUserInventoryContext = context;
  const localId = String(
    bioxInvGetLocalFieldValue(context) || ""
  ).trim();
  if (!localId) {
    throw new Error(
      "No se pudo identificar el local asociado al usuario. Verifica que el contexto contenga id_local, idLocal, localId o idlocal."
    );
  }
  bioxInvCurrentLocalId = localId;
  bioxInvCurrentLocalInfo = {
    id_local: localId,
    nombre: String(
      context.localNombre || ""
    ).trim(),
    numeroDocumento: String(
      context.localNumeroDocumento || ""
    ).trim(),
    ubicacion: String(
      context.localUbicacion || ""
    ).trim(),
    contribuyente: String(
      context.localContribuyente || ""
    ).trim(),
    tipoDocumento: String(
      context.localTipoDocumento || ""
    ).trim(),
    nit: String(
      context.localNIT || ""
    ).trim(),
    nrc: String(
      context.localNRC || ""
    ).trim()
  };
  bioxInvCurrentRole = String(
    context.role || ""
  )
    .trim()
    .toLowerCase();
  bioxInvCanEditInventory = [
    "administrador",
    "admin",
    "bodega"
  ].includes(bioxInvCurrentRole);
  const greetingElements =
    bioxInvGetInventoryGreetingElements();
  if (
    greetingElements &&
    typeof greetingElements.forEach === "function"
  ) {
    greetingElements.forEach(element => {
      element.textContent =
        `Hola, ${context.name || "Usuario"} (${context.role || ""})`;
    });
  }
  const addButton =
    bioxInvGetInventoryAddButton();
  if (addButton) {
    addButton.style.display =
      bioxInvCanEditInventory ? "" : "none";
  }
  if (
    typeof bioxInvPatchStoredCurrentUser === "function"
  ) {
    bioxInvPatchStoredCurrentUser({
      id_local: bioxInvCurrentLocalId,
      localNombre:
        bioxInvCurrentLocalInfo.nombre,
      localNumeroDocumento:
        bioxInvCurrentLocalInfo.numeroDocumento,
      localUbicacion:
        bioxInvCurrentLocalInfo.ubicacion,
      localContribuyente:
        bioxInvCurrentLocalInfo.contribuyente,
      localTipoDocumento:
        bioxInvCurrentLocalInfo.tipoDocumento,
      localNIT:
        bioxInvCurrentLocalInfo.nit,
      localNRC:
        bioxInvCurrentLocalInfo.nrc
    });
  }
  /*
   * Al resolver el contexto del local, el servicio corrige
   * automáticamente los saldos históricos antes de mostrar
   * o modificar el inventario. Solo usuarios con permiso de
   * escritura pueden ejecutar esta reparación.
   */
  if (bioxInvCanEditInventory) {
    await bioxInvEnsureAutomaticHistoricalRepair();
  }

  return context;
}

async function bioxInvProcessBatchLines(
  lines,
  operationDate
) {
  const user =
    bioxInvAuth.currentUser || null;
  if (!user || !user.uid) {
    throw new Error(
      "No existe un usuario autenticado para registrar la entrada de inventario."
    );
  }
  if (!Array.isArray(lines)) {
    throw new Error(
      "Las líneas de la operación deben enviarse en una lista válida."
    );
  }
  if (!lines.length) {
    throw new Error(
      "Debes agregar al menos un producto para procesar la entrada."
    );
  }
  const validOperationDate =
    operationDate instanceof Date
      ? operationDate
      : bioxInvParseOperationDate(operationDate);
  if (
    !validOperationDate ||
    Number.isNaN(validOperationDate.getTime())
  ) {
    throw new Error(
      "La fecha de operación no es válida."
    );
  }
  const validatedLines = lines.map(
    (line, index) => {
      const label = `Producto ${index + 1}`;
      if (
        !line ||
        typeof line !== "object" ||
        Array.isArray(line)
      ) {
        throw new Error(
          `${label}: los datos del producto no son válidos.`
        );
      }
      const mode = String(
        line.mode || ""
      )
        .trim()
        .toLowerCase();
      if (mode === "existing") {
        if (
          !line.product ||
          typeof line.product !== "object"
        ) {
          throw new Error(
            `${label}: producto existente no encontrado.`
          );
        }
        if (
          !String(line.product.id || "").trim()
        ) {
          throw new Error(
            `${label}: el producto existente no tiene un identificador válido.`
          );
        }
        return {
          ...line,
          mode: "existing"
        };
      }
      if (mode === "new") {
        const productName = String(
          line.name || line.productText || ""
        ).trim();
        if (!productName) {
          throw new Error(
            `${label}: debes indicar el nombre del producto nuevo.`
          );
        }
        return {
          ...line,
          name: productName,
          mode: "new"
        };
      }
      throw new Error(
        `${label}: el tipo de operación "${mode || "no especificado"}" no es válido.`
      );
    }
  );
  /*
   * Antes de registrar una nueva compra, reparar una sola vez
   * el historial de todos los productos del local.
   */
  await bioxInvEnsureAutomaticHistoricalRepair();

  const results = [];
  for (
    let index = 0;
    index < validatedLines.length;
    index++
  ) {
    const line = validatedLines[index];
    const label = `Producto ${index + 1}`;
    try {
      let result;
      if (line.mode === "existing") {
        result =
          await bioxInvAddStockToExistingProduct(
            line.product,
            line,
            user,
            validOperationDate
          );
        results.push({
          ...result,
          name: line.product.name || line.name || label
        });
        continue;
      }
      result =
        await bioxInvCreateNewProductFromLine(
          line,
          user,
          validOperationDate
        );
      results.push({
        ...result,
        name: line.name
      });
    } catch (error) {
      const message =
        error && error.message
          ? error.message
          : "Error desconocido al procesar el producto.";

      console.error("[Inventario] Falló el procesamiento de una línea.", {
        producto: line.name || line.product?.name || line.productText || label,
        modo: line.mode,
        codigo: error?.code || null,
        tipoError: error?.name || "Error",
        mensaje: message,
        errorOriginal: error
      });

      const wrappedError = new Error(`${label}: ${message}`);
      wrappedError.cause = error;
      throw wrappedError;
    }
  }
  return results;
}

async function bioxInvReconcileProductsAgainstMovements(
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
    bioxInvCalculateMovementNetStockMap(
      movementDocuments
    );
  const salesStockMap =
    bioxInvAggregateAllTimeSalesMap(
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
        bioxInvDecimalOrZero(
          movementStockMap[
          productId
          ]
        );
      const historicalSales =
        bioxInvDecimalOrZero(
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
        bioxInvGetCurrentStockUnits(
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
      bioxInvFirestore.batch();
    chunk.forEach(
      ({
        product,
        stock
      }) => {
        const ref =
          bioxInvFirestore
            .collection(
              bioxInvPRODUCTS_COLLECTION
            )
            .doc(
              product.id
            );
        const unitsPerBox =
          bioxInvGetUnitsPerBox(
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
                ? bioxInvDecimalOrZero(
                  stock /
                  unitsPerBox
                )
                : 0,
            updatedAt:
              bioxInvServerTimestamp()
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
          bioxInvGetUnitsPerBox(
            product
          );
        product.quantity =
          stock;
        product.stockCurrentUnits =
          stock;
        product.boxes =
          unitsPerBox > 0
            ? bioxInvDecimalOrZero(
              stock /
              unitsPerBox
            )
            : 0;
        bioxInvUpsertSessionDocument(
          bioxInvPRODUCTS_COLLECTION,
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

function bioxInvBuildInventoryExpenseDetails(
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
          bioxInvCalculateLinePurchaseCost(
            line,
            product
          );
        const paidBoxes =
          bioxInvDecimalOrZero(
            line.boxes
          );
        const paidUnits =
          bioxInvDecimalOrZero(
            line.units
          );
        const bonusBoxes =
          bioxInvDecimalOrZero(
            line.bonusBoxes
          );
        const bonusUnits =
          bioxInvDecimalOrZero(
            line.bonusUnits
          );
        const unitsPerBox =
          bioxInvGetEffectiveUnitsPerBox(
            line,
            product
          );
        const costPerUnit =
          bioxInvGetEffectiveCostPerUnitForLine(
            line,
            product
          );
        const costPerBox =
          costPerUnit *
          unitsPerBox;
        const providerDisplay =
          bioxInvGetLineProvidersDisplay(
            line
          );
        return [
          `${index + 1
          }. ${line.name ||
          line.productText ||
          "Producto"
          }`,
          `Cajas pagadas: ${bioxInvFormatQuantity(
            paidBoxes
          )}`,
          `Unidades pagadas: ${bioxInvFormatQuantity(
            paidUnits
          )}`,
          `Cajas bono: ${bioxInvFormatQuantity(
            bonusBoxes
          )}`,
          `Unidades bono: ${bioxInvFormatQuantity(
            bonusUnits
          )}`,
          `Unidades por caja: ${bioxInvFormatQuantity(
            unitsPerBox
          )}`,
          `Costo por unidad: ${bioxInvCurrency(
            costPerUnit
          )}`,
          `Costo por caja: ${bioxInvCurrency(
            costPerBox
          )}`,
          `Costo línea: ${bioxInvCurrency(
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

async function bioxInvRegisterInventoryExpense(
  totalAmount,
  lines,
  user,
  operationDate
) {
  const amount = Math.max(0, bioxInvNumberOrZero(totalAmount));
  if (amount <= 0) {
    return {
      created: false,
      amount: 0,
      id: ""
    };
  }
  const validOperationDate =
    bioxInvGetValidatedOperationDate(operationDate);
  if (!validOperationDate) {
    throw new Error(
      "La fecha de operación no es válida para registrar el gasto."
    );
  }
  user = bioxInvAssertInventoryWriteAccess(user);
  const operationTimestamp =
    bioxInvBuildOperationTimestamp(validOperationDate);
  const context = bioxInvCurrentUserInventoryContext || {};
  const localInfo =
    bioxInvCurrentLocalInfo ||
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
            bioxInvGetEffectiveUnitsPerBox(
              line,
              product
            );
          return (
            sum +
            (
              bioxInvDecimalOrZero(
                line.boxes
              ) +
              bioxInvDecimalOrZero(
                line.bonusBoxes
              )
            ) *
            unitsPerBox +
            bioxInvDecimalOrZero(
              line.units
            ) +
            bioxInvDecimalOrZero(
              line.bonusUnits
            )
          );
        },
        0
      )
      : 0;
  const expenseRef =
    bioxInvFirestore
      .collection(
        bioxInvEXPENSES_COLLECTION
      )
      .doc();
  const concept =
    productCount ===
      1
      ? `Compra de inventario - ${lines[0]?.name ||
      lines[0]?.productText ||
      "Producto"
      }`
      : `Compra de inventario - ${productCount} productos`;
  const details =
    bioxInvBuildInventoryExpenseDetails(
      lines
    );
  const notes =
    [
      "Gasto generado automáticamente desde Inventario.",
      "Las cantidades bono no generan costo.",
      "El costo por caja equivale al costo por unidad multiplicado por las unidades por caja.",
      `Fecha de operación: ${bioxInvFormatOperationDate(
        validOperationDate
      )}`,
      `Productos ingresados: ${productCount}`,
      `Unidades totales ingresadas: ${bioxInvFormatQuantity(
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
      bioxInvGetInventoryDayKey(
        validOperationDate
      ),
    userId:
      user
        ? user.uid
        : bioxInvAuth.currentUser
          ? bioxInvAuth.currentUser.uid
          : null,
    userName:
      context.name ||
      user?.email ||
      "Usuario",
    id_local:
      bioxInvCurrentLocalId,
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
      bioxInvGetLocalDateInputValue(
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
      bioxInvToFirestoreDate(operationTimestamp)
  });
  bioxInvUpsertSessionDocument(
    bioxInvEXPENSES_COLLECTION,
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

async function bioxInvAttachExpenseToMovements(
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
    bioxInvFirestore.batch();
  movementIds.forEach(
    movementId => {
      batch.update(
        bioxInvFirestore
          .collection(
            bioxInvMOVEMENTS_COLLECTION
          )
          .doc(
            movementId
          ),
        {
          expenseId,
          updatedAt:
            bioxInvServerTimestamp()
        }
      );
    }
  );
  await batch.commit();
  movementIds.forEach(
    movementId => {
      const current =
        bioxInvGetSessionCollection(
          bioxInvMOVEMENTS_COLLECTION
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
        bioxInvUpsertSessionDocument(
          bioxInvMOVEMENTS_COLLECTION,
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
  bioxInvInvalidateAllMovementsCache();
}

/*
 * ============================================================
 * RECÁLCULO CRONOLÓGICO DE SALDOS
 * ============================================================
 *
 * Reconstruye saldoAnterior/saldoActual a partir de todos los
 * movimientos de un producto, sin asumir que el primer movimiento
 * registrado representa el inventario inicial.
 *
 * El saldo de apertura se obtiene como:
 *
 *   saldo de apertura = stock final conocido - movimientos netos
 *
 * Así se conserva el stock vigente aunque existan existencias
 * iniciales anteriores al historial disponible.
 */

function bioxInvCompareMovementTimelinePoints(left, right) {
  const leftDate = String(left.date || '').trim();
  const rightDate = String(right.date || '').trim();
  const dateOrder = leftDate.localeCompare(rightDate);

  if (dateOrder !== 0) {
    return dateOrder;
  }

  const leftTimestamp = bioxInvNumberOrZero(left.timestamp);
  const rightTimestamp = bioxInvNumberOrZero(right.timestamp);

  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }

  return String(left.id || '').localeCompare(String(right.id || ''));
}


function bioxInvGetTimelineMovementDelta(movement) {
  const normalized = movement && movement.tipoMovimiento !== undefined
    ? movement
    : bioxInvNormalizeMovementDocument(
      String(movement?.id || ''),
      movement?.data || {}
    );

  return bioxInvDecimalOrZero(
    bioxInvNumberOrZero(normalized.entrada) -
    bioxInvNumberOrZero(normalized.salida)
  );
}


function bioxInvBuildMovementTimelinePlan({
  targetStock,
  movementSnapshots = [],
  replacementMovement = null,
  excludedMovementIds = []
}) {
  const finalStock = bioxInvDecimalOrZero(
    bioxInvNumberOrZero(targetStock)
  );

  const excludedIds = new Set(
    (Array.isArray(excludedMovementIds) ? excludedMovementIds : [])
      .map(value => String(value || '').trim())
      .filter(Boolean)
  );

  const entries = [];

  (Array.isArray(movementSnapshots) ? movementSnapshots : []).forEach(snapshot => {
    if (!snapshot || !snapshot.exists || excludedIds.has(String(snapshot.id || '').trim())) {
      return;
    }

    const raw = snapshot.data() || {};

    if (!bioxInvMatchesCurrentLocal(raw)) {
      return;
    }

    const productId = String(
      raw.productId || raw.productID || raw.product_id || ''
    ).trim();

    if (!productId) {
      return;
    }

    const normalized = bioxInvNormalizeMovementDocument(snapshot.id, raw);
    const timestamp =
      bioxInvNumberOrZero(normalized.createdAtMs) ||
      bioxInvGetTimestampMs(raw.createdAt);

    let operationDate = String(
      bioxInvGetMovementOperationDateValue(normalized) || ''
    ).trim();

    if (!operationDate && timestamp > 0) {
      operationDate = bioxInvGetLocalDateInputValue(new Date(timestamp));
    }

    entries.push({
      id: String(snapshot.id),
      ref: snapshot.ref,
      raw,
      movement: normalized,
      date: operationDate || '0000-00-00',
      timestamp,
      delta: bioxInvGetTimelineMovementDelta(normalized),
      isReplacement: false
    });
  });

  if (replacementMovement && replacementMovement.id && replacementMovement.data) {
    const replacementId = String(replacementMovement.id).trim();

    if (!excludedIds.has(replacementId)) {
      const raw = replacementMovement.data;
      const normalized = bioxInvNormalizeMovementDocument(replacementId, raw);
      const timestamp = bioxInvNumberOrZero(
        replacementMovement.timestamp
      ) || bioxInvNumberOrZero(normalized.createdAtMs) ||
        bioxInvGetTimestampMs(raw.createdAt);

      const operationDate = String(
        replacementMovement.operationDate ||
        bioxInvGetMovementOperationDateValue(normalized) ||
        ''
      ).trim();

      entries.push({
        id: replacementId,
        ref: replacementMovement.ref || null,
        raw,
        movement: normalized,
        date: operationDate || '0000-00-00',
        timestamp,
        delta: bioxInvGetTimelineMovementDelta(normalized),
        isReplacement: true
      });
    }
  }

  entries.sort(bioxInvCompareMovementTimelinePoints);

  const movementNet = bioxInvDecimalOrZero(
    entries.reduce((sum, entry) => sum + entry.delta, 0)
  );

  let runningBalance = bioxInvDecimalOrZero(
    finalStock - movementNet
  );

  const openingBalance = runningBalance;
  const updates = [];
  let replacementBalance = null;

  entries.forEach(entry => {
    const saldoAnterior = bioxInvDecimalOrZero(runningBalance);
    const saldoActual = bioxInvDecimalOrZero(
      saldoAnterior + entry.delta
    );

    if (entry.isReplacement) {
      replacementBalance = {
        saldoAnterior,
        saldoActual
      };
    } else {
      const oldSaldoAnterior = bioxInvNumberOrZero(entry.raw.saldoAnterior);
      const oldSaldoActual = bioxInvNumberOrZero(entry.raw.saldoActual);
      const changed =
        Math.abs(oldSaldoAnterior - saldoAnterior) > 0.000001 ||
        Math.abs(oldSaldoActual - saldoActual) > 0.000001;

      if (changed) {
        updates.push({
          id: entry.id,
          ref: entry.ref,
          data: entry.raw,
          saldoAnterior,
          saldoActual
        });
      }
    }

    runningBalance = saldoActual;
  });

  if (replacementMovement && !replacementBalance) {
    throw new Error(
      'No se pudo incorporar el movimiento nuevo al cálculo cronológico del inventario.'
    );
  }

  if (updates.length > 498) {
    throw new Error(
      'El historial de este producto contiene demasiados movimientos para actualizar sus saldos en una sola transacción (límite seguro: 498 movimientos afectados). No se guardó ningún cambio.'
    );
  }

  if (Math.abs(runningBalance - finalStock) > 0.001) {
    throw new Error(
      'El recálculo del historial no coincide con las existencias finales del producto. No se guardaron los cambios.'
    );
  }

  return {
    openingBalance,
    finalStock,
    movementNet,
    entries,
    updates,
    replacementBalance
  };
}


async function bioxInvGetProductMovementSnapshotsForTransaction(
  transaction,
  productId
) {
  const targetProductId = String(productId || "").trim();
  const localId = String(bioxInvCurrentLocalId || "").trim();

  if (!targetProductId || !localId) {
    throw new Error(
      "No se pudo identificar el producto o el local para reconstruir el historial."
    );
  }

  const collection = bioxInvFirestore.collection(bioxInvMOVEMENTS_COLLECTION);

  /*
   * Se consultan las tres variantes históricas del identificador.
   * Así no quedan fuera movimientos antiguos que usaban productID
   * o product_id en lugar de productId.
   */
  /*
   * La API web de Firestore solo admite DocumentReference en
   * transaction.get(). No admite Query. Por eso primero se ejecutan
   * las consultas normales y después se vuelven a leer sus documentos
   * individualmente dentro de la transacción.
   *
   * Esta función se invoca dentro del callback transaccional; si Firestore
   * reintenta el callback por un conflicto, las consultas también se repiten.
   */
  const querySnapshots = await Promise.all([
    collection.where("productId", "==", targetProductId).get(),
    collection.where("productID", "==", targetProductId).get(),
    collection.where("product_id", "==", targetProductId).get()
  ]);

  const referencesById = new Map();

  querySnapshots.forEach(querySnapshot => {
    (querySnapshot.docs || []).forEach(document => {
      referencesById.set(document.id, document.ref);
    });
  });

  const currentSnapshots = await Promise.all(
    Array.from(referencesById.values()).map(reference =>
      transaction.get(reference)
    )
  );

  const documentsById = new Map();

  currentSnapshots.forEach(document => {
    if (!document || !document.exists) {
      return;
    }

    const raw = document.data() || {};
    const movementProductId = bioxInvGetMovementProductIdForRepair(raw);

    if (
      movementProductId === targetProductId &&
      bioxInvMatchesCurrentLocal(raw)
    ) {
      documentsById.set(document.id, document);
    }
  });

  return Array.from(documentsById.values());
}


function bioxInvGetLatestEntryFromTimeline(timelinePlan) {
  const entries = Array.isArray(timelinePlan?.entries)
    ? timelinePlan.entries
    : [];

  for (let index = entries.length - 1; index >= 0; index--) {
    const movement = entries[index].movement;

    if (
      String(movement?.tipoMovimiento || '').trim().toLowerCase() === 'entrada'
    ) {
      return movement;
    }
  }

  return null;
}


function bioxInvApplyTimelineUpdatesToSession(updates) {
  (Array.isArray(updates) ? updates : []).forEach(update => {
    if (!update || !update.id) {
      return;
    }

    const cached = bioxInvGetSessionCollection(
      bioxInvMOVEMENTS_COLLECTION
    ).find(item => String(item.id || '') === String(update.id));

    bioxInvUpsertSessionDocument(
      bioxInvMOVEMENTS_COLLECTION,
      update.id,
      {
        ...(cached?.data || update.data || {}),
        saldoAnterior: update.saldoAnterior,
        saldoActual: update.saldoActual,
        updatedAt: Date.now()
      }
    );
  });
}


async function bioxInvCreateNewProductFromLine(
  line,
  user,
  operationDate
) {
  const paidBoxes =
    bioxInvDecimalOrZero(
      line.boxes
    );
  const bonusBoxes =
    bioxInvDecimalOrZero(
      line.bonusBoxes
    );
  const paidUnits =
    bioxInvDecimalOrZero(
      line.units
    );
  const bonusUnits =
    bioxInvDecimalOrZero(
      line.bonusUnits
    );
  const unitsPerBox =
    Math.max(
      0.000001,
      bioxInvDecimalOrZero(
        line.unitsPerBox
      ) || 1
    );
  const totalPaidUnits =
    bioxInvDecimalOrZero(
      paidBoxes *
      unitsPerBox +
      paidUnits
    );
  const totalBonusUnits =
    bioxInvDecimalOrZero(
      bonusBoxes *
      unitsPerBox +
      bonusUnits
    );
  const totalUnits =
    bioxInvDecimalOrZero(
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
    bioxInvGetValidatedOperationDate(
      operationDate
    );
  if (
    !validOperationDate
  ) {
    throw new Error(
      `La fecha de operación no es válida para el producto
"${line.name}".`
    );
  }
  const operationTimestamp =
    bioxInvBuildOperationTimestamp(
      validOperationDate
    );
  const productRef =
    bioxInvFirestore
      .collection(
        bioxInvPRODUCTS_COLLECTION
      )
      .doc();
  const selectedProviders =
    bioxInvGetLineProviders(
      line
    );
  const providerIds =
    bioxInvGetProviderIds(
      selectedProviders
    );
  const primaryProvider =
    selectedProviders[0] ||
    null;
  const costPerUnit =
    bioxInvGetEffectiveCostPerUnitForLine(
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
      bioxInvNumberOrZero(
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
      bioxInvGetProviderName(
        primaryProvider
      ) ||
      "",
    proveedorRazonSocial:
      bioxInvGetProviderBusinessName(
        primaryProvider
      ) ||
      "",
    providerId:
      primaryProvider?.id ||
      null,
    providerName:
      bioxInvGetProviderName(
        primaryProvider
      ) ||
      "",
    providerBusinessName:
      bioxInvGetProviderBusinessName(
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
      bioxInvDecimalOrZero(
        totalUnits /
        unitsPerBox
      ),
    unitsPerBox,
    lastCostPerBox,
    lastCostPerUnit:
      costPerUnit,
    price,
    id_local:
      bioxInvCurrentLocalId,
    localNombre:
      bioxInvCurrentLocalInfo.nombre ||
      "",
    localNumeroDocumento:
      bioxInvCurrentLocalInfo.numeroDocumento ||
      "",
    localUbicacion:
      bioxInvCurrentLocalInfo.ubicacion ||
      "",
    localContribuyente:
      bioxInvCurrentLocalInfo.contribuyente ||
      "",
    localTipoDocumento:
      bioxInvCurrentLocalInfo.tipoDocumento ||
      "",
    localNIT:
      bioxInvCurrentLocalInfo.nit ||
      "",
    localNRC:
      bioxInvCurrentLocalInfo.nrc ||
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
      bioxInvGetLocalDateInputValue(
        validOperationDate
      )
  };
  const movementRef =
    bioxInvFirestore
      .collection(
        bioxInvMOVEMENTS_COLLECTION
      )
      .doc();
  const movementData =
    bioxInvBuildMovementData({
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
          `Cajas: ${bioxInvFormatQuantity(
            paidBoxes
          )}`,
          `Cajas bono: ${bioxInvFormatQuantity(
            bonusBoxes
          )}`,
          `Unidades: ${bioxInvFormatQuantity(
            paidUnits
          )}`,
          `Unidades bono: ${bioxInvFormatQuantity(
            bonusUnits
          )}`,
          `Entrada pagada: ${bioxInvFormatQuantity(
            totalPaidUnits
          )}`,
          `Entrada bono: ${bioxInvFormatQuantity(
            totalBonusUnits
          )}`,
          `Unidades por caja: ${bioxInvFormatQuantity(
            unitsPerBox
          )}`,
          `Costo por unidad: ${bioxInvCurrency(
            costPerUnit
          )}`,
          `Costo por caja: ${bioxInvCurrency(
            lastCostPerBox
          )}`,
          `Precio de venta: ${bioxInvCurrency(
            price
          )}`,
          `Costo total: ${bioxInvCurrency(
            totalPurchaseCost
          )}`,
          `Proveedores: ${bioxInvGetLineProvidersDisplay(
            line
          )}`,
          `Fecha de operación: ${bioxInvFormatOperationDate(
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
    bioxInvFirestore.batch();
  batch.set(
    productRef,
    {
      ...productData,
      createdAt:
        bioxInvToFirestoreDate(operationTimestamp),
      updatedAt:
        bioxInvServerTimestamp()
    }
  );
  batch.set(
    movementRef,
    {
      ...movementData,
      createdAt:
        bioxInvToFirestoreDate(operationTimestamp)
    }
  );
  await batch.commit();
  bioxInvUpsertSessionDocument(
    bioxInvPRODUCTS_COLLECTION,
    productRef.id,
    {
      ...productData,
      createdAt:
        operationTimestamp.toMillis(),
      updatedAt:
        Date.now()
    }
  );
  bioxInvUpsertSessionDocument(
    bioxInvMOVEMENTS_COLLECTION,
    movementRef.id,
    {
      ...movementData,
      createdAt:
        operationTimestamp.toMillis()
    }
  );
  bioxInvCurrentProductsList.push({
    id:
      productRef.id,
    ...productData,
    createdAt:
      operationTimestamp.toMillis(),
    updatedAt:
      Date.now()
  });
  bioxInvInvalidateAllMovementsCache();
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

async function bioxInvAddStockToExistingProduct(
  product,
  line,
  user,
  operationDate
) {
  const unitsPerBox = Math.max(
    0.000001,
    bioxInvDecimalOrZero(line.unitsPerBox) || bioxInvGetUnitsPerBox(product)
  );

  const paidBoxes = bioxInvDecimalOrZero(line.boxes);
  const bonusBoxes = bioxInvDecimalOrZero(line.bonusBoxes);
  const paidUnits = bioxInvDecimalOrZero(line.units);
  const bonusUnits = bioxInvDecimalOrZero(line.bonusUnits);

  const totalPaidUnits = bioxInvDecimalOrZero(
    paidBoxes * unitsPerBox + paidUnits
  );

  const totalBonusUnits = bioxInvDecimalOrZero(
    bonusBoxes * unitsPerBox + bonusUnits
  );

  const totalUnits = bioxInvDecimalOrZero(
    totalPaidUnits + totalBonusUnits
  );

  if (totalUnits <= 0) {
    throw new Error(
      `El producto "${product.name}" no tiene cantidad de entrada.`
    );
  }

  const validOperationDate = bioxInvGetValidatedOperationDate(operationDate);

  if (!validOperationDate) {
    throw new Error(
      `La fecha de operación no es válida para el producto "${product.name}".`
    );
  }

  const operationDateValue = bioxInvGetLocalDateInputValue(validOperationDate);
  const operationTimestamp = bioxInvBuildOperationTimestamp(validOperationDate);
  const productRef = bioxInvFirestore.collection(bioxInvPRODUCTS_COLLECTION).doc(product.id);
  const movementRef = bioxInvFirestore.collection(bioxInvMOVEMENTS_COLLECTION).doc();

  let previousStock = 0;
  let nextStock = 0;
  let productDataForCache = null;
  let nextProviders = [];
  let movementData = null;
  let timelineBalanceUpdates = [];
  let latestEntryMetadata = null;

  const transactionResult = await bioxInvFirestore.runTransaction(async transaction => {
    const productSnapshot = await transaction.get(productRef);

    if (!productSnapshot.exists) {
      throw new Error(`El producto "${product.name}" ya no existe.`);
    }

    const data = productSnapshot.data() || {};

    if (!bioxInvMatchesCurrentLocal(data)) {
      throw new Error(
        `El producto "${product.name}" no pertenece al local actual.`
      );
    }

    previousStock = bioxInvGetCurrentStockUnits(data);
    nextStock = bioxInvDecimalOrZero(previousStock + totalUnits);

    const relatedMovementSnapshots =
      await bioxInvGetProductMovementSnapshotsForTransaction(
        transaction,
        product.id
      );

    const inputCostPerBox = bioxInvNumberOrZero(line.lastCostPerBox);
    const inputCostPerUnit = bioxInvNumberOrZero(line.lastCostPerUnit);

    let entryCostPerUnit = 0;
    let entryCostPerBox = 0;

    if (inputCostPerBox > 0) {
      entryCostPerBox = inputCostPerBox;
      entryCostPerUnit = entryCostPerBox / unitsPerBox;
    } else if (inputCostPerUnit > 0) {
      entryCostPerUnit = inputCostPerUnit;
      entryCostPerBox = entryCostPerUnit * unitsPerBox;
    } else {
      entryCostPerBox = bioxInvNumberOrZero(data.lastCostPerBox);

      if (entryCostPerBox > 0) {
        entryCostPerUnit = entryCostPerBox / unitsPerBox;
      } else {
        entryCostPerUnit = bioxInvNumberOrZero(data.lastCostPerUnit);
        entryCostPerBox = entryCostPerUnit * unitsPerBox;
      }
    }

    const entryPrice = bioxInvNumberOrZero(line.price) > 0
      ? bioxInvNumberOrZero(line.price)
      : bioxInvNumberOrZero(data.price);

    const productProviders = bioxInvGetProductProviders(data);
    const selectedProviders = bioxInvGetLineProviders(line);
    nextProviders = bioxInvMergeProviderCollections(
      productProviders,
      selectedProviders
    );

    const movementProviders = selectedProviders.length
      ? selectedProviders
      : productProviders.length
        ? [productProviders[0]]
        : [];

    const movementProviderIds = bioxInvGetProviderIds(movementProviders);
    const totalPurchaseCost = totalPaidUnits * entryCostPerUnit;

    movementData = bioxInvBuildMovementData({
      productId: product.id,
      productName: line.name || data.name || '',
      codigoProducto: line.codigoProducto || bioxInvGetProductCode(data) || '',
      tipoMovimiento: 'entrada',
      referenciaLibro: line.referenciaLibro || 'Compra',
      numeroDocumento: line.numeroDocumento || '',
      entrada: totalUnits,
      salida: 0,
      saldoAnterior: 0,
      saldoActual: 0,
      cajas: paidBoxes,
      cajasBono: bonusBoxes,
      unidades: paidUnits,
      unidadesBono: bonusUnits,
      unidadesPorCaja: unitsPerBox,
      costoUnitario: entryCostPerUnit,
      costoPorCaja: entryCostPerBox,
      precioVenta: entryPrice,
      costoTotal: totalPurchaseCost,
      entradaPagada: totalPaidUnits,
      entradaBono: totalBonusUnits,
      proveedorIds: movementProviderIds,
      proveedores: movementProviders,
      detalle: [
        `Cajas: ${bioxInvFormatQuantity(paidBoxes)}`,
        `Cajas bono: ${bioxInvFormatQuantity(bonusBoxes)}`,
        `Unidades: ${bioxInvFormatQuantity(paidUnits)}`,
        `Unidades bono: ${bioxInvFormatQuantity(bonusUnits)}`,
        `Entrada pagada: ${bioxInvFormatQuantity(totalPaidUnits)}`,
        `Entrada bono: ${bioxInvFormatQuantity(totalBonusUnits)}`,
        `Unidades por caja: ${bioxInvFormatQuantity(unitsPerBox)}`,
        `Costo por unidad: ${bioxInvCurrency(entryCostPerUnit)}`,
        `Costo por caja: ${bioxInvCurrency(entryCostPerBox)}`,
        `Precio de venta: ${bioxInvCurrency(entryPrice)}`,
        `Costo total: ${bioxInvCurrency(totalPurchaseCost)}`,
        `Proveedores: ${bioxInvGetLineProvidersDisplay(line)}`,
        `Fecha de operación: ${bioxInvFormatOperationDate(validOperationDate)}`
      ].join(' | '),
      user,
      operationDate: validOperationDate
    });

    const timelinePlan = bioxInvBuildMovementTimelinePlan({
      targetStock: nextStock,
      movementSnapshots: relatedMovementSnapshots,
      replacementMovement: {
        id: movementRef.id,
        ref: movementRef,
        data: {
          ...movementData,
          createdAt: operationTimestamp
        },
        operationDate: operationDateValue,
        timestamp: operationTimestamp.toMillis()
      }
    });

    timelineBalanceUpdates = timelinePlan.updates;
    movementData.saldoAnterior = timelinePlan.replacementBalance.saldoAnterior;
    movementData.saldoActual = timelinePlan.replacementBalance.saldoActual;

    const latestEntry = bioxInvGetLatestEntryFromTimeline(timelinePlan);
    const latestMovement = latestEntry || bioxInvNormalizeMovementDocument(
      movementRef.id,
      movementData
    );

    const latestUnitsPerBox = Math.max(
      0.000001,
      bioxInvDecimalOrZero(
        latestMovement.unidadesPorCaja ?? latestMovement.unitsPerBox
      ) || unitsPerBox
    );

    let latestCostPerUnit = bioxInvNumberOrZero(latestMovement.costoUnitario);
    let latestCostPerBox = bioxInvNumberOrZero(latestMovement.costoPorCaja);

    if (latestCostPerUnit <= 0 && latestCostPerBox > 0) {
      latestCostPerUnit = latestCostPerBox / latestUnitsPerBox;
    }

    if (latestCostPerBox <= 0 && latestCostPerUnit > 0) {
      latestCostPerBox = latestCostPerUnit * latestUnitsPerBox;
    }

    const latestProviders = bioxInvNormalizeMovementProviders(latestMovement);
    const primaryProvider = latestProviders[0] || nextProviders[0] || null;
    const latestReference = String(latestMovement.referenciaLibro || '').trim();
    const latestDocumentNumber = String(latestMovement.numeroDocumento || '').trim();
    const latestOperationDateValue = bioxInvGetMovementOperationDateValue(latestMovement);
    const latestOperationDate = bioxInvParseOperationDate(latestOperationDateValue);
    const latestPrice = latestMovement.precioVenta !== undefined &&
      latestMovement.precioVenta !== null
      ? bioxInvNumberOrZero(latestMovement.precioVenta)
      : bioxInvNumberOrZero(data.price);

    latestEntryMetadata = {
      unitsPerBox: latestUnitsPerBox,
      costPerUnit: latestCostPerUnit,
      costPerBox: latestCostPerBox,
      price: latestPrice,
      reference: latestReference || String(data.referenciaLibro || ''),
      documentNumber: latestDocumentNumber || String(data.numeroDocumento || ''),
      operationDate: latestOperationDate
        ? bioxInvGetLocalDateInputValue(latestOperationDate)
        : String(data.fechaUltimaEntrada || operationDateValue),
      primaryProvider
    };

    productDataForCache = {
      ...data,
      codigoProducto: line.codigoProducto || bioxInvGetProductCode(data) || '',
      productCode: line.codigoProducto || bioxInvGetProductCode(data) || '',
      proveedorIds: bioxInvGetProviderIds(nextProviders),
      providerIds: bioxInvGetProviderIds(nextProviders),
      proveedores: nextProviders,
      proveedorId: primaryProvider?.id || null,
      proveedorNombre: bioxInvGetProviderName(primaryProvider) || '',
      proveedorRazonSocial: bioxInvGetProviderBusinessName(primaryProvider) || '',
      providerId: primaryProvider?.id || null,
      providerName: bioxInvGetProviderName(primaryProvider) || '',
      providerBusinessName: bioxInvGetProviderBusinessName(primaryProvider) || '',
      quantity: nextStock,
      stockCurrentUnits: nextStock,
      stockBaseUnits: bioxInvNumberOrZero(data.stockBaseUnits) || previousStock,
      boxes: bioxInvDecimalOrZero(nextStock / latestUnitsPerBox),
      unitsPerBox: latestUnitsPerBox,
      lastCostPerBox: latestCostPerBox,
      lastCostPerUnit: latestCostPerUnit,
      price: latestPrice,
      referenciaLibro: latestEntryMetadata.reference,
      referenceBook: latestEntryMetadata.reference,
      numeroDocumento: latestEntryMetadata.documentNumber,
      fechaUltimaEntrada: latestEntryMetadata.operationDate,
      updatedAt: bioxInvServerTimestamp()
    };

    // Todas las lecturas de la transacción se completaron antes de escribir.
    timelineBalanceUpdates.forEach(update => {
      transaction.update(update.ref, {
        saldoAnterior: update.saldoAnterior,
        saldoActual: update.saldoActual,
        updatedAt: bioxInvServerTimestamp()
      });
    });

    transaction.update(productRef, productDataForCache);

    transaction.set(movementRef, {
      ...movementData,
      createdAt: bioxInvToFirestoreDate(operationTimestamp)
    });

    return {
      movementId: movementRef.id,
      movementCostTotal: totalPurchaseCost,
      providerIds: movementProviderIds,
      timelineUpdated: timelineBalanceUpdates.length
    };
  });

  const updatedProductData = {
    ...productDataForCache,
    id_local: bioxInvCurrentLocalId,
    localNombre: bioxInvCurrentLocalInfo.nombre,
    localNumeroDocumento: bioxInvCurrentLocalInfo.numeroDocumento,
    localUbicacion: bioxInvCurrentLocalInfo.ubicacion,
    localContribuyente: bioxInvCurrentLocalInfo.contribuyente,
    localTipoDocumento: bioxInvCurrentLocalInfo.tipoDocumento,
    localNIT: bioxInvCurrentLocalInfo.nit,
    localNRC: bioxInvCurrentLocalInfo.nrc,
    updatedAt: Date.now()
  };

  bioxInvUpsertSessionDocument(
    bioxInvPRODUCTS_COLLECTION,
    product.id,
    updatedProductData
  );

  const localProduct = bioxInvFindProductById(product.id);

  if (localProduct) {
    Object.assign(localProduct, updatedProductData);
  }

  bioxInvUpsertSessionDocument(
    bioxInvMOVEMENTS_COLLECTION,
    movementRef.id,
    {
      ...movementData,
      createdAt: operationTimestamp.toMillis()
    }
  );

  bioxInvApplyTimelineUpdatesToSession(timelineBalanceUpdates);
  bioxInvInvalidateProductStockMovementsCache(product.id);

  console.info('[Inventario] Entrada agregada y saldos cronológicos recalculados.', {
    productId: product.id,
    fechaOperacion: operationDateValue,
    stockAnterior: previousStock,
    stockActual: nextStock,
    unidadesAgregadas: totalUnits,
    movimientosActualizados: transactionResult.timelineUpdated
  });

  return {
    type: 'existing',
    productId: product.id,
    totalUnits,
    previousStock,
    nextStock,
    movementId: transactionResult?.movementId || '',
    movementCostTotal: transactionResult?.movementCostTotal || 0,
    timelineUpdated: transactionResult?.timelineUpdated || 0
  };
}


function bioxInvValidateEntryEditNumbers(values) {
  if (
    !values ||
    typeof values !== "object" ||
    Array.isArray(values)
  ) {
    throw new Error(
      "Los datos de edición del movimiento no son válidos."
    );
  }
  const numericFields = [
    "cajas",
    "cajasBono",
    "unidades",
    "unidadesBono",
    "unidadesPorCaja",
    "costoPorCaja",
    "costoUnitario",
    "precioVenta"
  ];
  for (const field of numericFields) {
    const value = values[field];
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      continue;
    }
    const number = Number(value);
    if (
      !Number.isFinite(number) ||
      number < 0
    ) {
      throw new Error(
        "Las cantidades y los precios deben ser números válidos y no negativos."
      );
    }
  }
  const unitsPerBox =
    Number(values.unidadesPorCaja);
  if (
    !Number.isFinite(unitsPerBox) ||
    unitsPerBox <= 0
  ) {
    throw new Error(
      "Las unidades por caja deben ser mayores que cero."
    );
  }
}

function bioxInvCalculateEntryEditAmounts(movementId, values,
  oldMovementRaw, productData) {
  const oldMovement =
    bioxInvNormalizeMovementDocument(
      movementId,
      oldMovementRaw
    );
  const oldBreakdown =
    bioxInvGetMovementBreakdown(
      oldMovement,
      productData
    );
  const oldUnitsPerBox =
    Math.max(
      0.000001,
      bioxInvDecimalOrZero(
        oldMovementRaw.unidadesPorCaja ??
        oldMovementRaw.unitsPerBox
      ) ||
      oldBreakdown.unitsPerBox ||
      bioxInvDecimalOrZero(
        productData.unitsPerBox
      ) ||
      1
    );
  const newBoxes =
    bioxInvDecimalOrZero(
      values.cajas
    );
  const newBonusBoxes =
    bioxInvDecimalOrZero(
      values.cajasBono
    );
  const newUnits =
    bioxInvDecimalOrZero(
      values.unidades
    );
  const newBonusUnits =
    bioxInvDecimalOrZero(
      values.unidadesBono
    );
  const unitsPerBox =
    Math.max(
      0.000001,
      bioxInvDecimalOrZero(
        values.unidadesPorCaja
      ) ||
      oldUnitsPerBox
    );
  const newPaidUnits =
    bioxInvDecimalOrZero(
      newBoxes *
      unitsPerBox +
      newUnits
    );
  const newBonusUnitsTotal =
    bioxInvDecimalOrZero(
      newBonusBoxes *
      unitsPerBox +
      newBonusUnits
    );
  const newEntry =
    bioxInvDecimalOrZero(
      newPaidUnits +
      newBonusUnitsTotal
    );
  let newCostPerBox =
    Math.max(
      0,
      bioxInvNumberOrZero(
        values.costoPorCaja
      )
    );
  let newCostPerUnit =
    0;
  if (
    values.costoUnitario !==
    undefined &&
    values.costoUnitario !==
    null
  ) {
    newCostPerUnit =
      Math.max(
        0,
        bioxInvNumberOrZero(
          values.costoUnitario
        )
      );
    newCostPerBox =
      bioxInvDecimalOrZero(
        newCostPerUnit *
        unitsPerBox
      );
  } else {
    newCostPerUnit =
      unitsPerBox > 0
        ? newCostPerBox /
        unitsPerBox
        : 0;
  }
  const newSalePrice =
    Math.max(
      0,
      bioxInvNumberOrZero(
        values.precioVenta
      )
    );
  const oldEntry =
    bioxInvDecimalOrZero(
      oldBreakdown.cajas *
      oldUnitsPerBox +
      oldBreakdown.unidades +
      oldBreakdown.cajasBono *
      oldUnitsPerBox +
      oldBreakdown.unidadesBono
    );
  const currentStock =
    bioxInvGetCurrentStockUnits(
      productData
    );
  const difference =
    bioxInvDecimalOrZero(
      newEntry -
      oldEntry
    );
  return {
    oldMovement,
    oldBreakdown,
    oldUnitsPerBox,
    newBoxes,
    newBonusBoxes,
    newUnits,
    newBonusUnits,
    unitsPerBox,
    newPaidUnits,
    newBonusUnitsTotal,
    newEntry,
    newCostPerBox,
    newCostPerUnit,
    newSalePrice,
    oldEntry,
    currentStock,
    difference
  };
}

function bioxInvCalculateEntryEditTimeline({
  movementId,
  oldMovement,
  oldMovementRaw,
  operationDate,
  operationTimestamp,
  relatedMovementSnapshots,
  newEntry,
  currentStock,
  difference
}) {
  const nextStock = bioxInvDecimalOrZero(
    currentStock + difference
  );

  if (nextStock < 0) {
    throw new Error(
      `No se puede reducir la entrada a ${bioxInvFormatQuantity(
        newEntry
      )} unidades porque el stock actual (${bioxInvFormatQuantity(
        currentStock
      )}) quedaría en ${bioxInvFormatQuantity(
        nextStock
      )}.`
    );
  }

  const operationDateValue = bioxInvGetLocalDateInputValue(operationDate);
  const replacementData = {
    ...oldMovementRaw,
    tipoMovimiento: 'entrada',
    entrada: newEntry,
    salida: 0,
    fechaOperacion: operationDateValue,
    operationDate: operationDateValue,
    createdAt: operationTimestamp
  };

  const timelinePlan = bioxInvBuildMovementTimelinePlan({
    targetStock: nextStock,
    movementSnapshots: relatedMovementSnapshots,
    replacementMovement: {
      id: movementId,
      data: replacementData,
      operationDate: operationDateValue,
      timestamp: operationTimestamp.toMillis()
    }
  });

  return {
    compareTimelinePoints: bioxInvCompareMovementTimelinePoints,
    newTimelinePoint: {
      date: operationDateValue,
      timestamp: operationTimestamp.toMillis(),
      id: movementId
    },
    timelineBalanceUpdates: timelinePlan.updates,
    editedSaldoAnterior: timelinePlan.replacementBalance.saldoAnterior,
    editedSaldoActual: timelinePlan.replacementBalance.saldoActual,
    nextStock,
    openingBalance: timelinePlan.openingBalance
  };
}


async function bioxInvUpdateLinkedExpenseForEntryEdit(transaction, {
  oldMovement, oldBreakdown, oldUnitsPerBox,
  linkedExpenseMovementSnapshots, oldEntry, newEntry, operationDate,
  newPaidUnits, newCostPerUnit }) {
  const oldPaidUnits =
    bioxInvDecimalOrZero(
      oldBreakdown.cajas *
      oldUnitsPerBox +
      oldBreakdown.unidades
    );
  let oldCostPerUnit =
    bioxInvNumberOrZero(
      oldMovement.costoUnitario
    );
  if (
    oldCostPerUnit <=
    0
  ) {
    oldCostPerUnit =
      oldUnitsPerBox >
        0
        ? bioxInvNumberOrZero(
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
        bioxInvNumberOrZero(
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
      bioxInvFirestore
        .collection(
          bioxInvEXPENSES_COLLECTION
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
          bioxInvNumberOrZero(
            oldExpense.amount
          )
        );
      const expenseMovementEntries = [
        oldMovement
      ];
      linkedExpenseMovementSnapshots.forEach(
        snapshot => {
          if (
            !snapshot.exists
          ) {
            return;
          }
          const rawMovement =
            snapshot.data() ||
            {};
          if (
            !bioxInvMatchesCurrentLocal(
              rawMovement
            )
          ) {
            return;
          }
          const linkedMovement =
            bioxInvNormalizeMovementDocument(
              snapshot.id,
              rawMovement
            );
          if (
            linkedMovement.tipoMovimiento ===
            "entrada"
          ) {
            expenseMovementEntries.push(
              linkedMovement
            );
          }
        }
      );
      const expenseProductIds =
        new Set(
          expenseMovementEntries
            .map(
              movement =>
                String(
                  movement.productId ||
                  ""
                ).trim()
            )
            .filter(Boolean)
        );
      const expenseTotalUnits =
        Math.max(
          0,
          bioxInvDecimalOrZero(
            expenseMovementEntries.reduce(
              (sum, movement) =>
                sum +
                bioxInvNumberOrZero(
                  movement.entrada
                ),
              0
            ) -
            oldEntry +
            newEntry
          )
        );
      const targetExpenseDate =
        bioxInvGetLocalDateInputValue(
          operationDate
        );
      const hasMixedExpenseDates =
        linkedExpenseMovementSnapshots.some(
          snapshot => {
            if (
              !snapshot.exists
            ) {
              return false;
            }
            const rawMovement =
              snapshot.data() ||
              {};
            if (
              !bioxInvMatchesCurrentLocal(
                rawMovement
              )
            ) {
              return false;
            }
            const linkedMovement =
              bioxInvNormalizeMovementDocument(
                snapshot.id,
                rawMovement
              );
            return (
              linkedMovement.tipoMovimiento ===
              "entrada" &&
              bioxInvGetMovementOperationDateValue(
                linkedMovement
              ) !== targetExpenseDate
            );
          }
        );
      const expenseOperationDate =
        hasMixedExpenseDates
          ? String(
            oldExpense.inventoryOperationDate ||
            ""
          ).trim() ||
          targetExpenseDate
          : targetExpenseDate;
      const expenseDayKey =
        hasMixedExpenseDates
          ? String(
            oldExpense.dayKey ||
            ""
          ).trim() ||
          bioxInvGetInventoryDayKey(
            bioxInvParseOperationDate(
              expenseOperationDate
            ) || operationDate
          )
          : bioxInvGetInventoryDayKey(
            operationDate
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
          nextExpenseAmount,
        dayKey:
          expenseDayKey,
        inventoryOperationDate:
          expenseOperationDate,
        inventoryTotalUnits:
          expenseTotalUnits,
        inventoryProductCount:
          expenseProductIds.size
      };
      transaction.update(
        expenseRef,
        {
          amount:
            nextExpenseAmount,
          dayKey:
            expenseDayKey,
          inventoryOperationDate:
            expenseOperationDate,
          inventoryTotalUnits:
            expenseTotalUnits,
          inventoryProductCount:
            expenseProductIds.size,
          updatedAt:
            bioxInvServerTimestamp()
        }
      );
    }
  }
  return {
    oldPaidUnits,
    oldCostPerUnit,
    oldCostTotal,
    newCostTotal,
    expenseId,
    expenseData
  };
}

async function bioxInvUpdateEntryMovement(
  movementId,
  values
) {
  const movementRef =
    bioxInvFirestore
      .collection(
        bioxInvMOVEMENTS_COLLECTION
      )
      .doc(
        movementId
      );
  const user =
    bioxInvAssertInventoryWriteAccess(
      typeof bioxInvAuth !== "undefined"
        ? bioxInvAuth.currentUser
        : null
    );

  await bioxInvEnsureAutomaticHistoricalRepair();
  const operationDate =
    bioxInvParseOperationDate(
      values.fechaOperacion
    );
  const requestedEntryCode =
    String(
      values.codigoProducto ??
      ""
    ).trim();
  if (
    !requestedEntryCode ||
    requestedEntryCode.length > 100
  ) {
    throw new Error(
      "El código de producto es obligatorio y debe tener como máximo 100 caracteres."
    );
  }
  if (
    !operationDate
  ) {
    throw new Error(
      "La fecha de operación no es válida."
    );
  }
  const operationTimestamp =
    bioxInvBuildOperationTimestamp(
      operationDate
    );
  const explicitProviderIds =
    bioxInvNormalizeIdArray(
      values.proveedorIds
    );
  const selectedProviders =
    explicitProviderIds.map(
      providerId =>
        bioxInvGetProviderById(
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
  let timelineBalanceUpdates =
    [];
  await bioxInvFirestore.runTransaction(
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
        !bioxInvMatchesCurrentLocal(
          oldMovementRaw
        )
      ) {
        throw new Error(
          "El movimiento no pertenece al local actual."
        );
      }
      const linkedExpenseId =
        String(
          oldMovementRaw.expenseId ||
          ""
        ).trim();
      let linkedExpenseMovementSnapshots =
        [];
      if (
        linkedExpenseId
      ) {
        /*
         * transaction.get() no admite consultas. Se obtiene primero
         * el conjunto de referencias y luego cada documento se lee
         * individualmente dentro de la transacción.
         */
        const linkedExpenseQuerySnapshot =
          await bioxInvFirestore
            .collection(bioxInvMOVEMENTS_COLLECTION)
            .where("expenseId", "==", linkedExpenseId)
            .get();

        const linkedExpenseSnapshots = await Promise.all(
          linkedExpenseQuerySnapshot.docs
            .filter(document => document.id !== movementId)
            .map(document => transaction.get(document.ref))
        );

        linkedExpenseMovementSnapshots =
          linkedExpenseSnapshots.filter(document => document.exists);
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
        bioxInvFirestore
          .collection(
            bioxInvPRODUCTS_COLLECTION
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
        !bioxInvMatchesCurrentLocal(
          productData
        )
      ) {
        throw new Error(
          "El producto no pertenece al local actual."
        );
      }
      const previousMovementCode =
        String(
          oldMovementRaw.codigoProducto ||
          oldMovementRaw.productCode ||
          bioxInvGetProductCode(productData) ||
          ""
        ).trim();
      const nextProductCode =
        requestedEntryCode !==
          previousMovementCode
          ? requestedEntryCode
          : bioxInvGetProductCode(productData) ||
          requestedEntryCode;
      const relatedMovementSnapshots =
        (
          await bioxInvGetProductMovementSnapshotsForTransaction(
            transaction,
            productId
          )
        ).filter(
          document => document.id !== movementId
        );
      bioxInvValidateEntryEditNumbers(values);
      const editAmounts =
        bioxInvCalculateEntryEditAmounts(
          movementId,
          values,
          oldMovementRaw,
          productData
        );
      const {
        oldMovement,
        oldBreakdown,
        oldUnitsPerBox,
        newBoxes,
        newBonusBoxes,
        newUnits,
        newBonusUnits,
        unitsPerBox,
        newPaidUnits,
        newBonusUnitsTotal,
        newEntry,
        newCostPerBox,
        newCostPerUnit,
        newSalePrice,
        oldEntry,
        currentStock,
        difference
      } = editAmounts;
      const nextStock =
        bioxInvDecimalOrZero(
          currentStock + difference
        );

      if (nextStock < 0) {
        throw new Error(
          `La edición dejaría el stock en ${bioxInvFormatQuantity(nextStock)} unidades. No se guardó ningún cambio.`
        );
      }
      const expenseUpdate =
        await bioxInvUpdateLinkedExpenseForEntryEdit(
          transaction,
          {
            oldMovement,
            oldBreakdown,
            oldUnitsPerBox,
            linkedExpenseMovementSnapshots,
            oldEntry,
            newEntry,
            operationDate,
            newPaidUnits,
            newCostPerUnit
          }
        );
      const {
        oldPaidUnits,
        oldCostPerUnit,
        oldCostTotal,
        newCostTotal,
        expenseId,
        expenseData
      } = expenseUpdate;
      const productProviders =
        bioxInvGetProductProviders(
          productData
        );
      const mergedProductProviders =
        bioxInvMergeProviderCollections(
          productProviders,
          selectedProviders
        );
      let primaryProductProvider =
        selectedProviders[0] ||
        mergedProductProviders[0] ||
        null;
      const movementProviders =
        selectedProviders;
      const movementProviderIds =
        bioxInvGetProviderIds(
          movementProviders
        );
      const nextMovementData =
        bioxInvBuildMovementData({
          productId,
          productName:
            oldMovementRaw.productName ||
            productData.name ||
            "",
          codigoProducto:
            requestedEntryCode,
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
            0,
          saldoActual:
            0,
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
              `Cajas: ${bioxInvFormatQuantity(
                newBoxes
              )}`,
              `Cajas bono: ${bioxInvFormatQuantity(
                newBonusBoxes
              )}`,
              `Unidades: ${bioxInvFormatQuantity(
                newUnits
              )}`,
              `Unidades bono: ${bioxInvFormatQuantity(
                newBonusUnits
              )}`,
              `Entrada pagada: ${bioxInvFormatQuantity(
                newPaidUnits
              )}`,
              `Entrada bono: ${bioxInvFormatQuantity(
                newBonusUnitsTotal
              )}`,
              `Entrada total: ${bioxInvFormatQuantity(
                newEntry
              )}`,
              `Unidades por caja: ${bioxInvFormatQuantity(
                unitsPerBox
              )}`,
              `Costo por unidad: ${bioxInvCurrency(
                newCostPerUnit
              )}`,
              `Costo por caja: ${bioxInvCurrency(
                newCostPerBox
              )}`,
              `Precio de venta: ${bioxInvCurrency(
                newSalePrice
              )}`,
              `Costo total: ${bioxInvCurrency(
                newCostTotal
              )}`,
              `Proveedores: ${movementProviders.length
                ? movementProviders
                  .map(
                    provider =>
                      bioxInvGetProviderDisplayName(
                        provider
                      )
                  )
                  .filter(Boolean)
                  .join(
                    " | "
                  )
                : "Sin proveedor"
              }`,
              `Fecha de operación: ${bioxInvFormatOperationDate(
                operationDate
              )}`
            ].join(
              " | "
            ),
          user,
          operationDate
        });
      const operationDateValue =
        bioxInvGetLocalDateInputValue(
          operationDate
        );

      const timelinePlan =
        bioxInvBuildMovementTimelinePlan({
          targetStock: nextStock,
          movementSnapshots: relatedMovementSnapshots,
          replacementMovement: {
            id: movementId,
            ref: movementRef,
            data: {
              ...nextMovementData,
              createdAt: operationTimestamp
            },
            operationDate: operationDateValue,
            timestamp: operationTimestamp.toMillis()
          }
        });

      timelineBalanceUpdates =
        timelinePlan.updates;

      nextMovementData.saldoAnterior =
        timelinePlan.replacementBalance.saldoAnterior;

      nextMovementData.saldoActual =
        timelinePlan.replacementBalance.saldoActual;

      const latestEntry =
        bioxInvGetLatestEntryFromTimeline(
          timelinePlan
        ) ||
        bioxInvNormalizeMovementDocument(
          movementId,
          nextMovementData
        );
      const latestUnitsPerBox =
        Math.max(
          0.000001,
          bioxInvDecimalOrZero(
            latestEntry.unidadesPorCaja ??
            latestEntry.unitsPerBox
          ) ||
          bioxInvDecimalOrZero(
            productData.unitsPerBox
          ) ||
          1
        );
      const latestCostPerUnit =
        Math.max(
          0,
          bioxInvNumberOrZero(
            latestEntry.costoUnitario
          )
        );
      const latestCostPerBox =
        bioxInvDecimalOrZero(
          latestCostPerUnit *
          latestUnitsPerBox
        );
      const latestSalePrice =
        Math.max(
          0,
          bioxInvNumberOrZero(
            latestEntry.precioVenta
          )
        );
      const latestReference =
        String(
          latestEntry.referenciaLibro ||
          ""
        ).trim();
      const latestDocumentNumber =
        String(
          latestEntry.numeroDocumento ||
          ""
        ).trim();
      const latestOperationDate =
        bioxInvParseOperationDate(
          bioxInvGetMovementOperationDateValue(
            latestEntry
          )
        );
      primaryProductProvider =
        bioxInvNormalizeMovementProviders(
          latestEntry
        )[0] ||
        mergedProductProviders[0] ||
        null;
      const requiredWrites = timelineBalanceUpdates.length + 2 + (expenseData ? 1 : 0);

      if (requiredWrites > 500) {
        throw new Error(
          'El historial requiere más de 500 escrituras para editar esta entrada. No se guardó ningún cambio.'
        );
      }

      transaction.update(
        movementRef,
        {
          ...nextMovementData,
          createdAt:
            bioxInvToFirestoreDate(operationTimestamp),
          editado:
            true,
          fechaUltimaEdicion:
            bioxInvServerTimestamp(),
          usuarioUltimaEdicion:
            user
              ? user.uid
              : null,
          usuarioUltimaEdicionNombre:
            bioxInvCurrentUserInventoryContext?.name ||
            user?.email ||
            "",
          updatedAt:
            bioxInvServerTimestamp()
        }
      );
      timelineBalanceUpdates.forEach(
        movementUpdate => {
          transaction.update(
            movementUpdate.ref,
            {
              saldoAnterior:
                movementUpdate.saldoAnterior,
              saldoActual:
                movementUpdate.saldoActual,
              updatedAt:
                bioxInvServerTimestamp()
            }
          );
        }
      );
      transaction.update(
        productRef,
        {
          codigoProducto:
            nextProductCode,
          productCode:
            nextProductCode,
          code:
            nextProductCode,
          sku:
            nextProductCode,
          proveedorIds:
            bioxInvGetProviderIds(
              mergedProductProviders
            ),
          providerIds:
            bioxInvGetProviderIds(
              mergedProductProviders
            ),
          proveedores:
            mergedProductProviders,
          proveedorId:
            primaryProductProvider?.id ||
            productData.proveedorId ||
            null,
          proveedorNombre:
            bioxInvGetProviderName(
              primaryProductProvider
            ) ||
            productData.proveedorNombre ||
            "",
          proveedorRazonSocial:
            bioxInvGetProviderBusinessName(
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
            bioxInvGetProviderName(
              primaryProductProvider
            ) ||
            productData.providerName ||
            productData.proveedorNombre ||
            "",
          providerBusinessName:
            bioxInvGetProviderBusinessName(
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
            bioxInvDecimalOrZero(
              nextStock /
              latestUnitsPerBox
            ),
          unitsPerBox:
            latestUnitsPerBox,
          lastCostPerBox:
            latestCostPerBox,
          lastCostPerUnit:
            latestCostPerUnit,
          price:
            latestSalePrice,
          referenciaLibro:
            latestReference,
          referenceBook:
            latestReference,
          numeroDocumento:
            latestDocumentNumber,
          bookReference:
            latestReference,
          fechaUltimaEntrada:
            latestOperationDate
              ? bioxInvGetLocalDateInputValue(
                latestOperationDate
              )
              : "",
          updatedAt:
            bioxInvServerTimestamp()
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
        codigoProducto:
          nextProductCode,
        productCode:
          nextProductCode,
        code:
          nextProductCode,
        sku:
          nextProductCode,
        proveedorIds:
          bioxInvGetProviderIds(
            mergedProductProviders
          ),
        providerIds:
          bioxInvGetProviderIds(
            mergedProductProviders
          ),
        proveedores:
          mergedProductProviders,
        proveedorId:
          primaryProductProvider?.id ||
          productData.proveedorId ||
          null,
        proveedorNombre:
          bioxInvGetProviderName(
            primaryProductProvider
          ) ||
          productData.proveedorNombre ||
          "",
        proveedorRazonSocial:
          bioxInvGetProviderBusinessName(
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
          bioxInvGetProviderName(
            primaryProductProvider
          ) ||
          productData.providerName ||
          productData.proveedorNombre ||
          "",
        providerBusinessName:
          bioxInvGetProviderBusinessName(
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
          bioxInvDecimalOrZero(
            nextStock /
            latestUnitsPerBox
          ),
        unitsPerBox:
          latestUnitsPerBox,
        lastCostPerBox:
          latestCostPerBox,
        lastCostPerUnit:
          latestCostPerUnit,
        price:
          latestSalePrice,
        referenciaLibro:
          latestReference,
        referenceBook:
          latestReference,
        bookReference:
          latestReference,
        numeroDocumento:
          latestDocumentNumber,
        fechaUltimaEntrada:
          latestOperationDate
            ? bioxInvGetLocalDateInputValue(
              latestOperationDate
            )
            : "",
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
            expenseData.dayKey,
          inventoryOperationDate:
            expenseData.inventoryOperationDate,
          inventoryTotalUnits:
            expenseData.inventoryTotalUnits,
          inventoryProductCount:
            expenseData.inventoryProductCount,
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
  bioxInvUpsertSessionDocument(
    bioxInvPRODUCTS_COLLECTION,
    updatedProduct.id,
    updatedProduct
  );
  const localProduct =
    bioxInvFindProductById(
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
  bioxInvUpsertSessionDocument(
    bioxInvMOVEMENTS_COLLECTION,
    movementId,
    updatedMovement
  );
  timelineBalanceUpdates.forEach(
    movementUpdate => {
      const cachedMovement =
        bioxInvGetSessionCollection(
          bioxInvMOVEMENTS_COLLECTION
        ).find(
          item =>
            String(
              item.id
            ) ===
            String(
              movementUpdate.id
            )
        );
      bioxInvUpsertSessionDocument(
        bioxInvMOVEMENTS_COLLECTION,
        movementUpdate.id,
        {
          ...(cachedMovement?.data || {}),
          saldoAnterior:
            movementUpdate.saldoAnterior,
          saldoActual:
            movementUpdate.saldoActual,
          updatedAt:
            Date.now()
        }
      );
    }
  );
  if (
    updatedExpense &&
    updatedMovement.expenseId
  ) {
    bioxInvUpsertSessionDocument(
      bioxInvEXPENSES_COLLECTION,
      updatedMovement.expenseId,
      updatedExpense
    );
  }
  bioxInvInvalidateProductStockMovementsCache(
    updatedProduct.id
  );
  return {
    movement:
      bioxInvNormalizeMovementDocument(
        movementId,
        updatedMovement
      ),
    product:
      updatedProduct,
    expense:
      updatedExpense
  };
}

function bioxInvGetMovementProductIdForRepair(raw = {}) {
  return String(
    raw.productId ||
    raw.productID ||
    raw.product_id ||
    ""
  ).trim();
}


async function bioxInvRecalculateProductMovementBalances(productId) {
  const targetProductId = String(productId || "").trim();

  if (!targetProductId) {
    throw new Error("Debes indicar el identificador del producto.");
  }

  bioxInvAssertInventoryWriteAccess(
    typeof bioxInvAuth !== "undefined" ? bioxInvAuth.currentUser : null
  );

  const productRef = bioxInvFirestore
    .collection(bioxInvPRODUCTS_COLLECTION)
    .doc(targetProductId);

  let timelineBalanceUpdates = [];
  let finalStock = 0;
  let openingBalance = 0;
  let movementCount = 0;

  await bioxInvFirestore.runTransaction(async transaction => {
    const productSnapshot = await transaction.get(productRef);

    if (!productSnapshot.exists) {
      throw new Error("El producto indicado ya no existe.");
    }

    const productData = productSnapshot.data() || {};

    if (!bioxInvMatchesCurrentLocal(productData)) {
      throw new Error("El producto no pertenece al local actual.");
    }

    finalStock = bioxInvGetCurrentStockUnits(productData);

    const movementSnapshots =
      await bioxInvGetProductMovementSnapshotsForTransaction(
        transaction,
        targetProductId
      );

    movementCount = movementSnapshots.length;

    const timelinePlan = bioxInvBuildMovementTimelinePlan({
      targetStock: finalStock,
      movementSnapshots
    });

    timelineBalanceUpdates = timelinePlan.updates;
    openingBalance = timelinePlan.openingBalance;

    if (timelineBalanceUpdates.length > 500) {
      throw new Error(
        "El historial supera el límite de escrituras de Firestore. No se modificó ningún movimiento."
      );
    }

    timelineBalanceUpdates.forEach(update => {
      transaction.update(update.ref, {
        saldoAnterior: update.saldoAnterior,
        saldoActual: update.saldoActual,
        updatedAt: bioxInvServerTimestamp()
      });
    });
  });

  bioxInvApplyTimelineUpdatesToSession(timelineBalanceUpdates);
  bioxInvInvalidateProductStockMovementsCache(targetProductId);

  console.info("[Inventario] Saldos del producto reconstruidos.", {
    productId: targetProductId,
    movimientosEncontrados: movementCount,
    stockFinal: finalStock,
    saldoApertura: openingBalance,
    movimientosActualizados: timelineBalanceUpdates.length
  });

  return {
    productId: targetProductId,
    openingBalance,
    finalStock,
    movementsFound: movementCount,
    movementsUpdated: timelineBalanceUpdates.length
  };
}


/**
 * Reconstruye los saldos históricos de todos los productos del local.
 * No modifica quantity, stockCurrentUnits ni stockBaseUnits.
 * Únicamente actualiza saldoAnterior y saldoActual de cada movimiento.
 *
 * La lectura se limita al id_local activo. Los movimientos se agrupan
 * por productId/productID/product_id para incluir registros heredados.
 */
async function bioxInvRepairAllHistoricalMovementBalances() {
  bioxInvAssertInventoryWriteAccess(
    typeof bioxInvAuth !== "undefined" ? bioxInvAuth.currentUser : null
  );

  const localId = String(bioxInvCurrentLocalId || "").trim();
  if (!localId) {
    throw new Error("No se identificó el local para reparar el historial.");
  }

  const [productSnapshot, movementSnapshot] = await Promise.all([
    bioxInvFirestore.collection(bioxInvPRODUCTS_COLLECTION)
      .where("id_local", "==", localId)
      .get(),
    bioxInvFirestore.collection(bioxInvMOVEMENTS_COLLECTION)
      .where("id_local", "==", localId)
      .get()
  ]);

  const products = productSnapshot.docs.filter(snapshot => {
    const data = snapshot.data() || {};
    return bioxInvMatchesCurrentLocal(data);
  });

  const movementsByProduct = new Map();
  const movements = movementSnapshot.docs.filter(snapshot => {
    const data = snapshot.data() || {};
    return bioxInvMatchesCurrentLocal(data);
  });

  movements.forEach(snapshot => {
    const raw = snapshot.data() || {};
    const productId = bioxInvGetMovementProductIdForRepair(raw);
    if (!productId) return;

    if (!movementsByProduct.has(productId)) {
      movementsByProduct.set(productId, []);
    }

    movementsByProduct.get(productId).push(snapshot);
  });

  const allUpdates = [];
  const productErrors = [];
  let productsWithMovements = 0;

  products.forEach(snapshot => {
    const productId = snapshot.id;
    const productData = snapshot.data() || {};
    const productMovements = movementsByProduct.get(productId) || [];

    if (!productMovements.length) return;

    productsWithMovements += 1;

    try {
      const plan = bioxInvBuildMovementTimelinePlan({
        targetStock: bioxInvGetCurrentStockUnits(productData),
        movementSnapshots: productMovements
      });

      plan.updates.forEach(update => {
        allUpdates.push({
          ...update,
          productId
        });
      });
    } catch (error) {
      productErrors.push({
        productId,
        productName: String(productData.name || ""),
        message: error?.message || String(error)
      });
    }
  });

  if (productErrors.length) {
    console.error(
      "[Inventario] Algunos productos no pudieron repararse; no se modificaron sus movimientos.",
      productErrors
    );
  }

  for (let index = 0; index < allUpdates.length; index += 450) {
    const chunk = allUpdates.slice(index, index + 450);
    const batch = bioxInvFirestore.batch();

    chunk.forEach(update => {
      batch.update(update.ref, {
        saldoAnterior: update.saldoAnterior,
        saldoActual: update.saldoActual,
        updatedAt: bioxInvServerTimestamp()
      });
    });

    await batch.commit();
    bioxInvApplyTimelineUpdatesToSession(chunk);
  }

  bioxInvInvalidateAllMovementsCache();

  const result = {
    localId,
    productsScanned: products.length,
    productsWithMovements,
    movementsScanned: movements.length,
    movementsUpdated: allUpdates.length,
    productsWithErrors: productErrors.length,
    errors: productErrors
  };

  console.info("[Inventario] Reparación histórica del local finalizada.", result);
  return result;
}


async function bioxInvEnsureAutomaticHistoricalRepair() {
  const localId = String(bioxInvCurrentLocalId || "").trim();
  if (!localId) {
    throw new Error("No se identificó el local para verificar los saldos históricos.");
  }

  if (bioxInvHistoricalRepairCompletedLocals.has(localId)) {
    return {
      localId,
      skipped: true,
      reason: "already-repaired-in-this-session"
    };
  }

  if (bioxInvHistoricalRepairPendingLocals.has(localId)) {
    return bioxInvHistoricalRepairPendingLocals.get(localId);
  }

  const promise = (async () => {
    const result = await bioxInvRepairAllHistoricalMovementBalances();

    if (result.productsWithErrors > 0) {
      throw new Error(
        `La reparación histórica terminó con ${result.productsWithErrors} producto(s) sin corregir. Revisa los errores de consola antes de registrar nuevas operaciones.`
      );
    }

    bioxInvHistoricalRepairCompletedLocals.add(localId);
    return result;
  })();

  bioxInvHistoricalRepairPendingLocals.set(localId, promise);

  try {
    return await promise;
  } finally {
    if (bioxInvHistoricalRepairPendingLocals.get(localId) === promise) {
      bioxInvHistoricalRepairPendingLocals.delete(localId);
    }
  }
}


async function bioxInvDeleteEntryMovement(movementId) {
  const target = String(movementId || '').trim();

  if (!target) {
    throw new Error('No se indicó el movimiento.');
  }

  if (!bioxInvCanDeleteInventoryMovement()) {
    throw new Error(
      'Solo el administrador puede eliminar movimientos de entrada.'
    );
  }

  await bioxInvEnsureAutomaticHistoricalRepair();

  const movementRef = bioxInvFirestore.collection(bioxInvMOVEMENTS_COLLECTION).doc(target);

  let deletedProductId = '';
  let removedEntry = 0;
  let previousStock = 0;
  let nextStock = 0;
  let removedCostTotal = 0;
  let updatedExpense = null;
  let timelineBalanceUpdates = [];

  await bioxInvFirestore.runTransaction(async transaction => {
    const movementSnapshot = await transaction.get(movementRef);

    if (!movementSnapshot.exists) {
      throw new Error('El movimiento ya no existe.');
    }

    const oldMovementRaw = movementSnapshot.data() || {};

    if (String(oldMovementRaw.tipoMovimiento || '').trim().toLowerCase() !== 'entrada') {
      throw new Error('Solo se pueden eliminar movimientos de tipo entrada.');
    }

    if (!bioxInvMatchesCurrentLocal(oldMovementRaw)) {
      throw new Error('El movimiento no pertenece al local actual.');
    }

    if (oldMovementRaw.conversionId || oldMovementRaw.conversionType) {
      throw new Error(
        'Esta entrada fue generada por una conversión y no se puede eliminar desde el historial de compras.'
      );
    }

    deletedProductId = String(
      oldMovementRaw.productId ||
      oldMovementRaw.productID ||
      oldMovementRaw.product_id ||
      ''
    ).trim();

    if (!deletedProductId) {
      throw new Error('El movimiento no tiene un producto asociado.');
    }

    const productRef = bioxInvFirestore.collection(bioxInvPRODUCTS_COLLECTION).doc(deletedProductId);
    const productSnapshot = await transaction.get(productRef);

    if (!productSnapshot.exists) {
      throw new Error('El producto asociado al movimiento ya no existe.');
    }

    const productData = productSnapshot.data() || {};

    if (!bioxInvMatchesCurrentLocal(productData)) {
      throw new Error('El producto asociado no pertenece al local actual.');
    }

    const normalizedMovement = bioxInvNormalizeMovementDocument(
      target,
      oldMovementRaw
    );

    const breakdown = bioxInvGetMovementBreakdown(
      normalizedMovement,
      productData
    );

    removedEntry = breakdown.totalUnits > 0
      ? breakdown.totalUnits
      : Math.max(0, bioxInvNumberOrZero(oldMovementRaw.entrada));

    if (removedEntry <= 0) {
      throw new Error(
        'El movimiento no contiene una cantidad válida para revertir.'
      );
    }

    previousStock = bioxInvGetCurrentStockUnits(productData);
    nextStock = bioxInvDecimalOrZero(previousStock - removedEntry);

    if (nextStock < 0) {
      throw new Error(
        `No se puede eliminar esta entrada porque el stock actual (${bioxInvFormatQuantity(
          previousStock
        )}) es menor que la cantidad del movimiento (${bioxInvFormatQuantity(
          removedEntry
        )}).`
      );
    }

    const relatedMovementSnapshots =
      (
        await bioxInvGetProductMovementSnapshotsForTransaction(
          transaction,
          deletedProductId
        )
      ).filter(snapshot => snapshot.id !== target);

    const timelinePlan = bioxInvBuildMovementTimelinePlan({
      targetStock: nextStock,
      movementSnapshots: relatedMovementSnapshots,
      excludedMovementIds: [target]
    });

    timelineBalanceUpdates = timelinePlan.updates;

    const oldPaidUnits = breakdown.paidUnits;
    let oldCostPerUnit = bioxInvNumberOrZero(normalizedMovement.costoUnitario);

    if (oldCostPerUnit <= 0) {
      oldCostPerUnit = breakdown.unitsPerBox > 0
        ? bioxInvNumberOrZero(normalizedMovement.costoPorCaja) / breakdown.unitsPerBox
        : 0;
    }

    removedCostTotal = normalizedMovement.costoTotal !== undefined &&
      normalizedMovement.costoTotal !== null
      ? Math.max(0, bioxInvNumberOrZero(normalizedMovement.costoTotal))
      : Math.max(0, oldPaidUnits * oldCostPerUnit);

    const expenseId = String(oldMovementRaw.expenseId || '').trim();
    let expenseRef = null;
    let expenseSnapshot = null;
    let expenseData = null;
    let nextExpenseAmount = 0;

    if (expenseId) {
      expenseRef = bioxInvFirestore.collection(bioxInvEXPENSES_COLLECTION).doc(expenseId);
      expenseSnapshot = await transaction.get(expenseRef);

      if (expenseSnapshot.exists) {
        expenseData = expenseSnapshot.data() || {};
        const oldExpenseAmount = Math.max(0, bioxInvNumberOrZero(expenseData.amount));
        nextExpenseAmount = Math.max(0, oldExpenseAmount - removedCostTotal);
      }
    }

    const currentUnitsPerBox = bioxInvGetUnitsPerBox(productData);

    const requiredWrites = timelineBalanceUpdates.length + 2 + (
      expenseSnapshot && expenseSnapshot.exists ? 1 : 0
    );

    if (requiredWrites > 500) {
      throw new Error(
        'El historial requiere más de 500 escrituras para eliminar esta entrada. No se guardó ningún cambio.'
      );
    }

    // Todas las lecturas se completaron. A partir de aquí solo hay escrituras.
    timelineBalanceUpdates.forEach(update => {
      transaction.update(update.ref, {
        saldoAnterior: update.saldoAnterior,
        saldoActual: update.saldoActual,
        updatedAt: bioxInvServerTimestamp()
      });
    });

    transaction.update(productRef, {
      quantity: nextStock,
      stockCurrentUnits: nextStock,
      boxes: bioxInvDecimalOrZero(nextStock / currentUnitsPerBox),
      updatedAt: bioxInvServerTimestamp()
    });

    transaction.delete(movementRef);

    if (expenseSnapshot && expenseSnapshot.exists && expenseRef) {
      transaction.update(expenseRef, {
        amount: nextExpenseAmount,
        updatedAt: bioxInvServerTimestamp(),
        inventoryLastMovementDeletion: true
      });

      updatedExpense = {
        id: expenseId,
        data: expenseData,
        amount: nextExpenseAmount
      };
    }
  });

  bioxInvRemoveSessionDocument(bioxInvMOVEMENTS_COLLECTION, target);
  bioxInvApplyTimelineUpdatesToSession(timelineBalanceUpdates);

  const localProduct = bioxInvFindProductById(deletedProductId);

  if (localProduct) {
    const currentUnitsPerBox = bioxInvGetUnitsPerBox(localProduct);
    const updatedLocalProduct = {
      ...localProduct,
      quantity: nextStock,
      stockCurrentUnits: nextStock,
      boxes: bioxInvDecimalOrZero(nextStock / currentUnitsPerBox),
      updatedAt: Date.now()
    };

    Object.assign(localProduct, updatedLocalProduct);

    bioxInvUpsertSessionDocument(
      bioxInvPRODUCTS_COLLECTION,
      deletedProductId,
      updatedLocalProduct
    );
  }

  if (updatedExpense) {
    bioxInvUpsertSessionDocument(
      bioxInvEXPENSES_COLLECTION,
      updatedExpense.id,
      {
        ...updatedExpense.data,
        amount: updatedExpense.amount,
        updatedAt: Date.now(),
        inventoryLastMovementDeletion: true
      }
    );
  }

  bioxInvInvalidateProductStockMovementsCache(deletedProductId);

  console.info('[Inventario] Entrada eliminada y saldos cronológicos recalculados.', {
    productId: deletedProductId,
    movementId: target,
    stockAnterior: previousStock,
    stockActual: nextStock,
    unidadesEliminadas: removedEntry,
    movimientosActualizados: timelineBalanceUpdates.length
  });

  return {
    movementId: target,
    productId: deletedProductId,
    removedEntry,
    previousStock,
    nextStock,
    removedCostTotal,
    timelineUpdated: timelineBalanceUpdates.length,
    expense: updatedExpense
      ? {
        id: updatedExpense.id,
        amount: updatedExpense.amount
      }
      : null
  };
}

window.bioxInvRecalculateProductMovementBalances = bioxInvRecalculateProductMovementBalances;
window.bioxInvRepairAllHistoricalMovementBalances = bioxInvRepairAllHistoricalMovementBalances;


window.InventoryMVC = window.InventoryMVC || {};
window.InventoryMVC.services = window.InventoryMVC.services || {};
window.InventoryMVC.services.inventory = Object.assign(
  window.InventoryMVC.services.inventory || {},
  {
    processBatchLines: (...args) => bioxInvProcessBatchLines(...args),
    updateEntryMovement: (...args) =>
      bioxInvUpdateEntryMovement(...args),
    deleteEntryMovement: (...args) => bioxInvDeleteEntryMovement(...args),
    recalculateProductMovementBalances: (...args) => bioxInvRecalculateProductMovementBalances(...args),
    repairHistoricalMovementBalances: (...args) => bioxInvRepairAllHistoricalMovementBalances(...args)
  }
);