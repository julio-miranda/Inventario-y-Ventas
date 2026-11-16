//js/controllers/inventory.controller.js
"use strict";

var bioxInvPRODUCTS_COLLECTION =
  window.PRODUCTS_COLLECTION_NAME ||
  "productos";

var bioxInvSALES_COLLECTION =
  window.SALES_COLLECTION_NAME ||
  "ventas";

var bioxInvMOVEMENTS_COLLECTION =
  window.MOVEMENTS_COLLECTION_NAME ||
  "stock_movimientos";

var bioxInvPROVIDERS_COLLECTION =
  window.SUPPLIER_COLLECTION_NAME ||
  "proveedores";

var bioxInvEXPENSES_COLLECTION =
  window.EXPENSES_COLLECTION_NAME ||
  "gastos";

var bioxInvLOW_STOCK_THRESHOLD = 5;

var bioxInvSAFETY_STOCK_DEFAULT = 10;

var bioxInvCurrentRole = "";

var bioxInvCanEditInventory = false;

var bioxInvCurrentLocalId = "";

var bioxInvCurrentLocalInfo = {
  id_local: "",
  nombre: "",
  numeroDocumento: "",
  ubicacion: "",
  contribuyente: "",
  tipoDocumento: "",
  nit: "",
  nrc: ""
};

var bioxInvCurrentUserInventoryContext = null;

var bioxInvCurrentProductsList = [];

var bioxInvCurrentProvidersList = [];

var bioxInvCurrentMonthlySalesMap = {};

var bioxInvCurrentMonthlyBoxesMap = {};

var bioxInvInventoryDT = null;

var bioxInvInventoryLoadPromise = null;

var bioxInvInventoryInitialized = false;

var bioxInvInventoryInitializationPromise = null;

var bioxInvInventoryInitializationUserUid = "";

var bioxInvInventoryInitializedUid = "";

var bioxInvProductStockMovementsCache =
  new Map();

var bioxInvProductStockMovementsPending =
  new Map();

var bioxInvBatchLineCounter = 0;

function bioxInvGetInventorySearchInput() {
  if (typeof document === "undefined") {
    return null;
  }

  return (
    document.getElementById("salesSearch") ||
    document.getElementById("inventorySearch")
  );
}

function bioxInvGetInventoryAddButton() {
  if (typeof document === "undefined") {
    return null;
  }

  return document.getElementById("btnAdd");
}

function bioxInvIsAdministratorRole() {
  return (
    bioxInvCurrentRole === "administrador" ||
    bioxInvCurrentRole === "admin"
  );
}

function bioxInvCanDeleteInventoryMovement() {
  return bioxInvIsAdministratorRole();
}

function bioxInvCreateBatchLineData(values = {}) {
  bioxInvBatchLineCounter += 1;

  const initialUnitsPerBox = Math.max(
    0.000001,
    bioxInvDecimalOrZero(values.unitsPerBox) || 1
  );

  const initialCostPerBox = bioxInvNumberOrZero(
    values.lastCostPerBox ??
    values.costoPorCaja
  );

  const initialCostPerUnit =
    initialCostPerBox > 0
      ? initialCostPerBox / initialUnitsPerBox
      : bioxInvNumberOrZero(
        values.lastCostPerUnit ??
        values.costoUnitario
      );

  const initialProviders =
    bioxInvGetLineProviders(values);

  return {
    id: `line-${bioxInvBatchLineCounter}`,

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
      bioxInvGetProviderIds(initialProviders),

    proveedores:
      initialProviders,

    proveedorId:
      bioxInvGetProviderIds(initialProviders)[0] ||
      "",

    proveedorNombre:
      bioxInvGetProviderName(initialProviders[0]) ||
      "",

    proveedorRazonSocial:
      bioxInvGetProviderBusinessName(initialProviders[0]) ||
      "",

    boxes:
      bioxInvDecimalOrZero(values.boxes),

    bonusBoxes:
      bioxInvDecimalOrZero(values.bonusBoxes),

    units:
      bioxInvDecimalOrZero(values.units),

    bonusUnits:
      bioxInvDecimalOrZero(values.bonusUnits),

    unitsPerBox:
      initialUnitsPerBox,

    lastCostPerBox:
      initialCostPerBox,

    lastCostPerUnit:
      initialCostPerUnit,

    price:
      bioxInvNumberOrZero(values.price),

    referenciaLibro:
      values.referenciaLibro ||
      "",

    numeroDocumento:
      values.numeroDocumento ||
      ""
  };
}


function bioxInvReadBatchLine(row) {
  if (!row || typeof row.querySelector !== "function") {
    throw new Error(
      "No se pudo leer una fila del formulario de inventario."
    );
  }

  const readText = selector =>
    String(
      row.querySelector(selector)?.value ?? ""
    ).trim();

  const readNumber = selector => {
    const rawValue = readText(selector);

    return rawValue === ""
      ? 0
      : Number(rawValue);
  };

  const mode = readText(
    ".batch-mode"
  ).toLowerCase();

  const productText = readText(
    ".batch-product-input"
  );

  const code = readText(
    ".batch-code"
  );

  const matchedProduct =
    mode === "existing"
      ? bioxInvFindExactBatchProduct(productText)
      : null;

  const providerRoot = row.querySelector(
    '[data-role="provider-selector"]'
  );

  const providerIds =
    bioxInvGetSelectedProviderIdsFromSelector(
      providerRoot
    );

  const providers = providerIds
    .map(providerId =>
      bioxInvGetProviderById(providerId)
    )
    .filter(Boolean);

  const boxes = readNumber(
    ".batch-boxes"
  );

  const bonusBoxes = readNumber(
    ".batch-bonus-boxes"
  );

  const units = readNumber(
    ".batch-units"
  );

  const bonusUnits = readNumber(
    ".batch-bonus-units"
  );

  const rawUnitsPerBox = readText(
    ".batch-units-per-box"
  );

  const defaultUnitsPerBox =
    matchedProduct
      ? bioxInvGetUnitsPerBox(matchedProduct)
      : 1;

  const unitsPerBox =
    rawUnitsPerBox === ""
      ? defaultUnitsPerBox
      : Number(rawUnitsPerBox);

  const lastCostPerBox = readNumber(
    ".batch-cost-box"
  );

  const lastCostPerUnit =
    Number.isFinite(unitsPerBox) &&
      unitsPerBox > 0 &&
      Number.isFinite(lastCostPerBox)
      ? lastCostPerBox / unitsPerBox
      : NaN;

  const price = readNumber(
    ".batch-price"
  );

  const referenciaLibro = readText(
    ".batch-reference"
  );

  const numeroDocumento = readText(
    ".batch-document"
  );

  return {
    id:
      row.dataset.lineId || "",

    mode,

    productText,

    product: matchedProduct,

    name:
      mode === "new"
        ? productText
        : (
          matchedProduct?.name ||
          productText
        ),

    codigoProducto:
      code ||
      bioxInvGetProductCode(matchedProduct) ||
      "",

    proveedorIds:
      providerIds,

    proveedores:
      providers,

    proveedorId:
      providerIds[0] || "",

    proveedorNombre:
      bioxInvGetProviderName(providers[0]) || "",

    proveedorRazonSocial:
      bioxInvGetProviderBusinessName(providers[0]) || "",

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


function bioxInvUpdateBatchLineState(row) {
  let data = bioxInvReadBatchLine(row);

  const product = data.product;

  const providerRoot = row.querySelector(
    '[data-role="provider-selector"]'
  );

  if (providerRoot) {
    const beforeIds =
      bioxInvGetSelectedProviderIdsFromSelector(
        providerRoot
      );

    const selectedIds =
      bioxInvRefreshBatchProviderSelector(
        row,
        product,
        beforeIds
      );

    if (
      selectedIds.join("|") !==
      beforeIds.join("|")
    ) {
      data = bioxInvReadBatchLine(row);
    }
  }

  const mode = data.mode;

  const codeInput = row.querySelector(
    ".batch-code"
  );

  const unitsPerBoxInput = row.querySelector(
    ".batch-units-per-box"
  );

  const costBoxInput = row.querySelector(
    ".batch-cost-box"
  );

  const costUnitInput = row.querySelector(
    ".batch-cost-unit"
  );

  const priceInput = row.querySelector(
    ".batch-price"
  );

  const status = row.querySelector(
    '[data-role="product-status"]'
  );

  const totalElement = row.querySelector(
    '[data-role="total"]'
  );

  const totalBoxesElement = row.querySelector(
    '[data-role="total-boxes"]'
  );

  const normalUnitsElement = row.querySelector(
    '[data-role="normal-units"]'
  );

  const bonusUnitsElement = row.querySelector(
    '[data-role="bonus-units"]'
  );

  const totalNormal = bioxInvDecimalOrZero(
    data.boxes * data.unitsPerBox +
    data.units
  );

  const totalBonus = bioxInvDecimalOrZero(
    data.bonusBoxes * data.unitsPerBox +
    data.bonusUnits
  );

  const totalUnits = bioxInvDecimalOrZero(
    totalNormal + totalBonus
  );

  const totalBoxes = bioxInvDecimalOrZero(
    data.boxes + data.bonusBoxes
  );

  const calculatedCostPerUnit =
    data.unitsPerBox > 0
      ? data.lastCostPerBox / data.unitsPerBox
      : 0;

  if (costUnitInput) {
    costUnitInput.value =
      calculatedCostPerUnit.toFixed(4);
  }

  if (totalElement) {
    totalElement.textContent =
      bioxInvFormatQuantity(totalUnits);
  }

  if (totalBoxesElement) {
    totalBoxesElement.textContent =
      bioxInvFormatQuantity(totalBoxes);
  }

  if (normalUnitsElement) {
    normalUnitsElement.textContent =
      bioxInvFormatQuantity(totalNormal);
  }

  if (bonusUnitsElement) {
    bonusUnitsElement.textContent =
      bioxInvFormatQuantity(totalBonus);
  }

  if (mode === "existing") {
    if (product) {
      const productUnitsPerBox =
        bioxInvGetUnitsPerBox(product);

      const enteredUnitsPerBox = Math.max(
        0.000001,
        bioxInvDecimalOrZero(
          unitsPerBoxInput?.value
        ) || productUnitsPerBox
      );

      if (
        unitsPerBoxInput &&
        !String(
          unitsPerBoxInput.value || ""
        ).trim()
      ) {
        unitsPerBoxInput.value =
          bioxInvFormatQuantity(productUnitsPerBox);
      }

      if (status) {
        const providerCount =
          bioxInvGetProductProviders(product).length;

        const totalAvailableProviders =
          bioxInvCurrentProvidersList.length;

        status.innerHTML = `
          <span class="batch-status success">
            Producto encontrado:
            ${bioxInvEscapeHtml(product.name)}
            · Stock actual:
            ${bioxInvFormatQuantity(
          bioxInvGetCurrentStockUnits(product)
        )}
            ·
            ${bioxInvFormatQuantity(enteredUnitsPerBox)}
            unid./caja
            ·
            ${providerCount}
            proveedor${providerCount === 1 ? "" : "es"}
            asociado${providerCount === 1 ? "" : "s"}
            ·
            ${totalAvailableProviders}
            disponible${totalAvailableProviders === 1 ? "" : "s"}
          </span>
        `;
      }

      if (
        codeInput &&
        !String(codeInput.value || "").trim()
      ) {
        codeInput.value =
          bioxInvGetProductCode(product) || "";
      }

      if (
        costBoxInput &&
        bioxInvNumberOrZero(costBoxInput.value) <= 0
      ) {
        const existingCostBox =
          bioxInvNumberOrZero(product.lastCostPerBox);

        const existingCostUnit =
          bioxInvNumberOrZero(product.lastCostPerUnit);

        costBoxInput.value = String(
          existingCostBox > 0
            ? existingCostBox
            : existingCostUnit * enteredUnitsPerBox
        );
      }

      if (
        priceInput &&
        bioxInvNumberOrZero(priceInput.value) <= 0
      ) {
        priceInput.value = String(
          bioxInvNumberOrZero(product.price)
        );
      }

    } else if (status) {
      status.innerHTML = `
        <span class="batch-status warning">
          Escribe o selecciona un producto existente.
        </span>
      `;
    }

  } else {
    if (status) {
      status.innerHTML = `
        <span class="batch-status info">
          Producto nuevo
        </span>
      `;
    }

    if (
      product &&
      bioxInvNormalizeText(product.name) ===
      bioxInvNormalizeText(data.name)
    ) {
      if (status) {
        status.innerHTML = `
          <span class="batch-status danger">
            Ese producto ya existe. Usa "Existente".
          </span>
        `;
      }
    }
  }
}


function bioxInvAddBatchLine(container, values = {}) {
  const line = bioxInvCreateBatchLineData(values);

  const row = bioxInvBuildBatchLineHtml(line);

  container.appendChild(row);

  bioxInvUpdateBatchLineNumbers();

  row
    .querySelector(".batch-product-input")
    ?.focus();

  return row;
}


function bioxInvValidateBatchLines(rows) {
  const errors = [];
  const parsed = [];

  if (!Array.isArray(rows)) {
    return {
      errors: [
        "Las filas del formulario no tienen un formato válido."
      ],
      parsed: []
    };
  }

  if (!rows.length) {
    return {
      errors: [
        "Debes agregar al menos un producto."
      ],
      parsed: []
    };
  }

  const currentProducts =
    Array.isArray(bioxInvCurrentProductsList)
      ? bioxInvCurrentProductsList
      : [];

  const namesForNew = new Set();

  rows.forEach((row, index) => {
    try {
      parsed.push(
        bioxInvReadBatchLine(row)
      );

    } catch (error) {
      parsed.push(null);

      errors.push(
        `Producto ${index + 1}: no se pudo leer la información de la fila.`
      );
    }
  });

  parsed.forEach((line, index) => {
    const label = `Producto ${index + 1}`;

    if (!line) {
      return;
    }

    if (!["existing", "new"].includes(line.mode)) {
      errors.push(
        `${label}: debes seleccionar si el producto es existente o nuevo.`
      );

      return;
    }

    if (!line.productText) {
      errors.push(
        `${label}: debes indicar el producto.`
      );
    }

    if (line.mode === "existing") {
      if (!line.product) {
        errors.push(
          `${label}: no se encontró una coincidencia exacta para el producto existente.`
        );

      } else {
        const currentProduct =
          bioxInvFindProductById(line.product.id);

        if (!currentProduct) {
          errors.push(
            `${label}: el producto seleccionado no pertenece a la lista actual del inventario.`
          );
        }
      }
    }

    if (line.mode === "new") {
      const name = String(
        line.name || ""
      ).trim();

      const normalizedName =
        bioxInvNormalizeText(name);

      if (!name) {
        errors.push(
          `${label}: el nombre del producto es obligatorio.`
        );

      } else {
        const alreadyExists =
          currentProducts.some(product =>
            bioxInvNormalizeText(product.name) === normalizedName
          );

        if (alreadyExists) {
          errors.push(
            `${label}: el nombre indicado ya corresponde a un producto existente. Selecciona la modalidad "Existente".`
          );
        }

        if (namesForNew.has(normalizedName)) {
          errors.push(
            `${label}: el mismo producto nuevo aparece más de una vez.`
          );
        }

        namesForNew.add(normalizedName);
      }

      if (!String(line.codigoProducto || "").trim()) {
        errors.push(
          `${label}: el código es obligatorio para un producto nuevo.`
        );
      }
    }

    const numericValues = [
      line.boxes,
      line.bonusBoxes,
      line.units,
      line.bonusUnits,
      line.unitsPerBox,
      line.lastCostPerBox,
      line.lastCostPerUnit,
      line.price
    ];

    const invalidNumbers =
      numericValues.some(value =>
        !Number.isFinite(value) ||
        value < 0
      );

    if (invalidNumbers) {
      errors.push(
        `${label}: las cantidades y los precios deben ser números válidos y no negativos.`
      );
    }

    if (
      !Number.isFinite(line.unitsPerBox) ||
      line.unitsPerBox <= 0
    ) {
      errors.push(
        `${label}: las unidades por caja deben ser mayores que cero.`
      );
    }

    const totalUnits =
      (
        line.boxes +
        line.bonusBoxes
      ) * line.unitsPerBox +
      line.units +
      line.bonusUnits;

    if (
      Number.isFinite(totalUnits) &&
      totalUnits <= 0
    ) {
      errors.push(
        `${label}: debes ingresar cajas, cajas bono, unidades o unidades bono.`
      );
    }

    const selectedIds =
      bioxInvNormalizeIdArray(line.proveedorIds);

    const missingProviders =
      selectedIds.filter(providerId =>
        !bioxInvGetProviderById(providerId)
      );

    if (missingProviders.length) {
      errors.push(
        `${label}: uno o más proveedores seleccionados no están disponibles en el local actual.`
      );
    }
  });

  return {
    errors,
    parsed
  };
}

async function bioxInvOpenBatchAddModal() {

  const inventoryView =
    window.InventoryMVC?.views?.inventory;

  /*
   * La vista completa registra el método en MVC y también
   * publica la función global por compatibilidad. Se admite
   * cualquiera de las dos referencias para evitar que una
   * vista auxiliar o un cambio de orden de carga impida abrir
   * el modal.
   */
  const buildBatchModalHtml =
    typeof inventoryView?.buildBatchModalHtml === "function"
      ? () => inventoryView.buildBatchModalHtml()
      : typeof window.bioxInvBuildBatchModalHtml === "function"
        ? window.bioxInvBuildBatchModalHtml
        : null;

  if (typeof buildBatchModalHtml !== "function") {
    console.error(
      "[Inventario] No está disponible el constructor del modal de carga múltiple.",
      {
        inventoryView,
        globalBuilder: typeof window.bioxInvBuildBatchModalHtml
      }
    );

    await Swal.fire(
      "Error de interfaz",
      "No se pudo cargar el formulario de productos. " +
      "Verifica que js/inventory/inventory.view.js se cargue antes de utilizar el inventario.",
      "error"
    );

    return;
  }

  if (!bioxInvCanEditInventory) {
    await Swal.fire(
      "Sin permisos",
      "No puedes modificar el inventario con este usuario.",
      "warning"
    );

    return;
  }

  if (!bioxInvCurrentLocalId) {
    await Swal.fire(
      "Sin local",
      "No se pudo identificar el local actual.",
      "error"
    );

    return;
  }

  const initialRow =
    bioxInvCreateBatchLineData({
      mode:
        bioxInvCurrentProductsList.length
          ? "existing"
          : "new"
    });

  const result = await Swal.fire({
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
      popup: "inventory-batch-modal"
    },

    didOpen: () => {
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

      if (!container || !addButton) {
        return;
      }

      bioxInvAddBatchLine(
        container,
        initialRow
      );

      addButton.addEventListener(
        "click",
        () => {
          bioxInvAddBatchLine(
            container,
            {
              mode:
                bioxInvCurrentProductsList.length
                  ? "existing"
                  : "new"
            }
          );
        }
      );

      if (dateInput && datePreview) {
        dateInput.addEventListener(
          "change",
          () => {
            const selectedDate =
              bioxInvParseOperationDate(
                dateInput.value
              );

            datePreview.innerHTML =
              selectedDate
                ? `
                  Fecha seleccionada:
                  <strong>
                    ${bioxInvEscapeHtml(
                  bioxInvFormatOperationDate(selectedDate)
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

    preConfirm: () => {
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
        bioxInvParseOperationDate(
          dateInput?.value
        );

      if (!operationDate) {
        Swal.showValidationMessage(
          "Debes seleccionar una fecha de operación válida."
        );

        return;
      }

      const rows = Array.from(
        container.querySelectorAll(
          ".batch-product-row"
        )
      );

      if (!rows.length) {
        Swal.showValidationMessage(
          "Debes agregar al menos un producto."
        );

        return;
      }

      const validation =
        bioxInvValidateBatchLines(rows);

      if (validation.errors.length) {
        Swal.showValidationMessage(
          validation.errors
            .slice(0, 5)
            .join("<br>")
        );

        return;
      }

      return {
        operationDate,
        operationDateValue: dateInput.value,
        lines: validation.parsed
      };
    }
  });

  if (!result.isConfirmed) {
    return;
  }

  const payload = result.value || {};

  const lines = Array.isArray(payload.lines)
    ? payload.lines
    : [];

  const operationDate =
    payload.operationDate instanceof Date
      ? payload.operationDate
      : bioxInvParseOperationDate(
        payload.operationDateValue
      );

  if (!lines.length || !operationDate) {
    return;
  }

  try {
    Swal.fire({
      title:
        "Procesando productos",

      html: `
        Preparando ${lines.length} producto(s)...
        <br><br>
        <strong>
          Fecha de operación:
        </strong>
        ${bioxInvEscapeHtml(
        bioxInvFormatOperationDate(operationDate)
      )}
      `,

      allowOutsideClick:
        false,

      allowEscapeKey:
        false,

      didOpen: () => {
        Swal.showLoading();
      }
    });

    const results =
      await bioxInvProcessBatchLines(
        lines,
        operationDate
      );

    const created = results.filter(
      result => result.type === "new"
    ).length;

    const existing = results.filter(
      result => result.type === "existing"
    ).length;

    const totalUnits = results.reduce(
      (sum, result) =>
        sum +
        bioxInvDecimalOrZero(result.totalUnits),
      0
    );

    const totalPurchaseCost = lines.reduce(
      (sum, line) =>
        sum +
        bioxInvCalculateLinePurchaseCost(
          line,
          line.product || null
        ),
      0
    );

    let expenseResult = null;
    let expenseError = null;

    try {
      expenseResult =
        await bioxInvRegisterInventoryExpense(
          totalPurchaseCost,
          lines,
          auth.currentUser || null,
          operationDate
        );

      if (expenseResult?.id) {
        await bioxInvAttachExpenseToMovements(
          expenseResult.id,
          results
        );
      }

    } catch (error) {
      expenseError = error;

      console.error(
        "Inventario guardado, pero falló el gasto automático:",
        error
      );
    }

    Swal.close();

    bioxInvRefreshInventoryView();

    await Swal.fire({
      icon:
        expenseError
          ? "warning"
          : "success",

      title:
        expenseError
          ? "Carga completada con advertencia"
          : "Carga completada",

      html: `
        <div style="text-align:left">

          <p>
            Fecha de operación:
            <strong>
              ${bioxInvEscapeHtml(
        bioxInvFormatOperationDate(operationDate)
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
              ${bioxInvFormatQuantity(totalUnits)}
            </strong>
          </p>

          <p>
            Costo total:
            <strong>
              ${bioxInvCurrency(totalPurchaseCost)}
            </strong>
          </p>

          ${expenseError
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
                    ${bioxInvCurrency(totalPurchaseCost)}
                  </strong>
                </p>
              `
        }

        </div>
      `
    });

  } catch (error) {
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

async function bioxInvOpenEditMovementModal(movement) {
  if (!bioxInvCanEditInventory) {
    await Swal.fire(
      "Sin permisos",
      "No puedes editar movimientos.",
      "warning"
    );

    return;
  }

  if (movement?.tipoMovimiento !== "entrada") {
    await Swal.fire(
      "Movimiento no válido",
      "Solo se pueden editar entradas.",
      "warning"
    );

    return;
  }

  const product =
    bioxInvFindProductById(movement.productId);

  if (!product) {
    await Swal.fire(
      "Producto no encontrado",
      "El producto asociado al movimiento ya no está disponible.",
      "warning"
    );

    return;
  }

  const normalizedMovement =
    bioxInvNormalizeMovementDocument(
      movement.id,
      movement
    );

  let costEditSource = "box";

  const result = await Swal.fire({
    title:
      "Editar entrada",

    html:
      bioxInvBuildMovementEditFormHtml(
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
      popup: "inventory-movement-edit-modal"
    },

    didOpen: () => {
      bioxInvBindProviderSelectorEvents(
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

      selectors.forEach(selector => {
        const element =
          document.querySelector(selector);

        if (!element) {
          return;
        }

        element.addEventListener(
          "input",
          () => {
            if (
              selector ===
              "#movement-edit-cost-box"
            ) {
              costEditSource = "box";
            }

            bioxInvUpdateMovementEditPreview(
              product,
              normalizedMovement
            );
          }
        );

        element.addEventListener(
          "change",
          () => {
            if (
              selector ===
              "#movement-edit-cost-box"
            ) {
              costEditSource = "box";
            }

            bioxInvUpdateMovementEditPreview(
              product,
              normalizedMovement
            );
          }
        );
      });

      const costUnitInput =
        document.getElementById(
          "movement-edit-cost-unit"
        );

      const costBoxInput =
        document.getElementById(
          "movement-edit-cost-box"
        );

      const unitsPerBoxInput =
        document.getElementById(
          "movement-edit-units-per-box"
        );

      const syncCostBoxFromUnit = () => {
        const costPerUnit =
          Number(costUnitInput?.value || 0);

        const unitsPerBox =
          Number(unitsPerBoxInput?.value || 0);

        costEditSource = "unit";

        if (
          costBoxInput &&
          Number.isFinite(costPerUnit) &&
          costPerUnit >= 0 &&
          Number.isFinite(unitsPerBox) &&
          unitsPerBox > 0
        ) {
          costBoxInput.value =
            (
              costPerUnit *
              unitsPerBox
            ).toFixed(4);
        }

        bioxInvUpdateMovementEditPreview(
          product,
          normalizedMovement
        );
      };

      costUnitInput?.addEventListener(
        "input",
        syncCostBoxFromUnit
      );

      costUnitInput?.addEventListener(
        "change",
        syncCostBoxFromUnit
      );

      bioxInvUpdateMovementEditPreview(
        product,
        normalizedMovement
      );
    },

    preConfirm: () => {
      const readNumber = id => {
        const rawValue = String(
          document.getElementById(id)?.value ?? ""
        ).trim();

        return rawValue === ""
          ? 0
          : Number(rawValue);
      };

      const fechaOperacion = String(
        document.getElementById(
          "movement-edit-date"
        )?.value || ""
      ).trim();

      const cajas = readNumber(
        "movement-edit-boxes"
      );

      const cajasBono = readNumber(
        "movement-edit-bonus-boxes"
      );

      const unidades = readNumber(
        "movement-edit-units"
      );

      const unidadesBono = readNumber(
        "movement-edit-bonus-units"
      );

      const unidadesPorCaja = readNumber(
        "movement-edit-units-per-box"
      );

      const costoPorCaja = readNumber(
        "movement-edit-cost-box"
      );

      const costoUnitario = readNumber(
        "movement-edit-cost-unit"
      );

      const precioVenta = readNumber(
        "movement-edit-sale-price"
      );

      const numericValues = [
        cajas,
        cajasBono,
        unidades,
        unidadesBono,
        unidadesPorCaja,
        costoPorCaja,
        costoUnitario,
        precioVenta
      ];

      if (
        numericValues.some(
          value =>
            !Number.isFinite(value) ||
            value < 0
        )
      ) {
        Swal.showValidationMessage(
          "Las cantidades y los precios deben ser números válidos y no negativos."
        );

        return;
      }

      if (unidadesPorCaja <= 0) {
        Swal.showValidationMessage(
          "Las unidades por caja deben ser mayores que cero."
        );

        return;
      }

      let costoPorCajaConsistente = costoPorCaja;
      let costoUnitarioConsistente = costoUnitario;

      if (costEditSource === "unit") {
        costoPorCajaConsistente =
          costoUnitario * unidadesPorCaja;

      } else {
        costoUnitarioConsistente =
          costoPorCaja / unidadesPorCaja;
      }

      const providerRoot =
        document.getElementById(
          "movement-edit-provider-selector"
        );

      const proveedorIds =
        bioxInvGetSelectedProviderIdsFromSelector(
          providerRoot
        );

      const referenciaLibro = String(
        document.getElementById(
          "movement-edit-reference"
        )?.value || ""
      ).trim();

      const numeroDocumento = String(
        document.getElementById(
          "movement-edit-document"
        )?.value || ""
      ).trim();

      const codigoProducto = String(
        document.getElementById(
          "movement-edit-product-code"
        )?.value || ""
      ).trim();

      if (
        !codigoProducto ||
        codigoProducto.length > 100
      ) {
        Swal.showValidationMessage(
          "El código de producto es obligatorio y debe tener como máximo 100 caracteres."
        );

        return;
      }

      const operationDate =
        bioxInvParseOperationDate(fechaOperacion);

      if (!operationDate) {
        Swal.showValidationMessage(
          "Debes seleccionar una fecha válida."
        );

        return;
      }

      const paidUnits = bioxInvDecimalOrZero(
        cajas * unidadesPorCaja + unidades
      );

      const bonusUnits = bioxInvDecimalOrZero(
        cajasBono * unidadesPorCaja + unidadesBono
      );

      const totalUnits = bioxInvDecimalOrZero(
        paidUnits + bonusUnits
      );

      if (totalUnits <= 0) {
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

        costoPorCaja:
          costoPorCajaConsistente,

        costoUnitario:
          costoUnitarioConsistente,

        precioVenta,

        proveedorIds,

        codigoProducto,

        referenciaLibro,

        numeroDocumento
      };
    }
  });

  if (!result.isConfirmed) {
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

      didOpen: () => {
        Swal.showLoading();
      }
    });

    const resultData =
      await bioxInvUpdateEntryMovement(
        normalizedMovement.id,
        result.value
      );

    Swal.close();

    bioxInvRefreshInventoryView();

    await Swal.fire({
      icon:
        "success",

      title:
        "Entrada actualizada",

      html: `
        <div style="text-align:left">

          <p>
            Producto:
            <strong>
              ${bioxInvEscapeHtml(
        resultData.product.name ||
        product.name ||
        ""
      )}
            </strong>
          </p>

          <p>
            Código de producto:
            <strong>
              ${bioxInvEscapeHtml(
        resultData.movement.codigoProducto || ""
      )}
            </strong>
          </p>

          <p>
            Proveedores de la entrada:
            <strong>
              ${bioxInvEscapeHtml(
        resultData.movement.providerDisplay ||
        "Sin proveedor"
      )}
            </strong>
          </p>

          <p>
            Cajas:
            <strong>
              ${bioxInvFormatQuantity(
        resultData.movement.cajas
      )}
            </strong>
          </p>

          <p>
            Unidades por caja:
            <strong>
              ${bioxInvFormatQuantity(
        resultData.movement.unidadesPorCaja
      )}
            </strong>
          </p>

          <p>
            Entrada pagada:
            <strong>
              ${bioxInvFormatQuantity(
        resultData.movement.entradaPagada
      )}
              unidades
            </strong>
          </p>

          <p>
            Entrada bono:
            <strong>
              ${bioxInvFormatQuantity(
        resultData.movement.entradaBono
      )}
              unidades
            </strong>
          </p>

          <p>
            Entrada total:
            <strong>
              ${bioxInvFormatQuantity(
        resultData.movement.entrada
      )}
              unidades
            </strong>
          </p>

          <p>
            Costo por caja:
            <strong>
              ${bioxInvCurrency(
        resultData.movement.costoPorCaja
      )}
            </strong>
          </p>

          <p>
            Costo por unidad:
            <strong>
              ${bioxInvCurrency(
        resultData.movement.costoUnitario
      )}
            </strong>
          </p>

          <p>
            Costo total:
            <strong>
              ${bioxInvCurrency(
        resultData.movement.costoTotal
      )}
            </strong>
          </p>

          <p>
            Nuevo stock:
            <strong>
              ${bioxInvFormatQuantity(
        resultData.product.stockCurrentUnits
      )}
              unidades
            </strong>
          </p>

          ${resultData.expense
          ? `
                <p>
                  Gasto actualizado:
                  <strong>
                    ${bioxInvCurrency(
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

    await bioxInvOpenMovementManagerModal(
      movement.productId
    );

  } catch (error) {
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

async function bioxInvConfirmDeleteEntryMovement(movementId) {
  if (!bioxInvCanDeleteInventoryMovement()) {
    await Swal.fire(
      "Sin permisos",
      "Solo el administrador puede eliminar movimientos de entrada.",
      "error"
    );

    return false;
  }

  const manager =
    document.getElementById("movement-manager");

  const managerProductId = manager
    ? String(
      manager.dataset.productId || ""
    ).trim()
    : "";

  const movement =
    await bioxInvFindMovementById(movementId);

  if (!movement) {
    await Swal.fire(
      "Movimiento no encontrado",
      "El movimiento ya no está disponible.",
      "warning"
    );

    return false;
  }

  if (movement.tipoMovimiento !== "entrada") {
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
    bioxInvFindProductById(movement.productId);

  const breakdown =
    bioxInvGetMovementBreakdown(
      movement,
      product
    );

  const removalUnits =
    breakdown.totalUnits > 0
      ? breakdown.totalUnits
      : Math.max(
        0,
        bioxInvDecimalOrZero(movement.entrada)
      );

  const confirmation = await Swal.fire({
    title:
      "¿Eliminar esta entrada?",

    html: `
      <div style="text-align:left">

        <p>
          Producto:
          <strong>
            ${bioxInvEscapeHtml(
      product?.name ||
      movement.productName ||
      "Producto"
    )}
          </strong>
        </p>

        <p>
          Fecha:
          <strong>
            ${bioxInvEscapeHtml(
      bioxInvGetMovementOperationDateValue(
        movement
      ) || "Sin fecha"
    )}
          </strong>
        </p>

        <p>
          Proveedores:
          <strong>
            ${bioxInvEscapeHtml(
      movement.providerDisplay ||
      "Sin proveedor"
    )}
          </strong>
        </p>

        <p>
          Entrada:
          <strong>
            ${bioxInvFormatQuantity(removalUnits)}
            unidades
          </strong>
        </p>

        <p>
          Costo total:
          <strong>
            ${bioxInvCurrency(movement.costoTotal)}
          </strong>
        </p>

        <p>
          Stock actual:
          <strong>
            ${bioxInvFormatQuantity(
      bioxInvGetCurrentStockUnits(product)
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

  if (!confirmation.isConfirmed) {
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

      didOpen: () => {
        Swal.showLoading();
      }
    });

    const result =
      await bioxInvDeleteEntryMovement(movementId);

    Swal.close();

    bioxInvRefreshInventoryView();

    await Swal.fire({
      icon:
        "success",

      title:
        "Entrada eliminada",

      html: `
        <div style="text-align:left">

          <p>
            Unidades retiradas:
            <strong>
              ${bioxInvFormatQuantity(
        result.removedEntry
      )}
            </strong>
          </p>

          <p>
            Stock anterior:
            <strong>
              ${bioxInvFormatQuantity(
        result.previousStock
      )}
            </strong>
          </p>

          <p>
            Nuevo stock:
            <strong>
              ${bioxInvFormatQuantity(
        result.nextStock
      )}
            </strong>
          </p>

          <p>
            Costo retirado:
            <strong>
              ${bioxInvCurrency(
        result.removedCostTotal
      )}
            </strong>
          </p>

          ${result.expense
          ? `
                <p>
                  Gasto actualizado:
                  <strong>
                    ${bioxInvCurrency(
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

    await bioxInvOpenMovementManagerModal(
      managerProductId
    );

    return true;

  } catch (error) {
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

async function bioxInvOpenMovementManagerModal(productId = "") {
  if (!bioxInvCanEditInventory) {
    await Swal.fire(
      "Sin permisos",
      "No puedes editar movimientos de inventario.",
      "warning"
    );

    return;
  }

  let movements = productId
    ? await bioxInvLoadProductStockMovements(productId)
    : await bioxInvLoadAllEntryMovements();

  movements = movements.filter(
    movement =>
      movement.tipoMovimiento === "entrada"
  );

  await Swal.fire({
    title:
      productId
        ? "Historial de entradas"
        : "Entradas de inventario",

    html:
      bioxInvBuildMovementManagerHtml(
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
      popup: "inventory-movement-manager-modal"
    },

    didOpen: () => {
      const applyButton =
        document.getElementById(
          "movement-filter-apply"
        );

      const clearButton =
        document.getElementById(
          "movement-filter-clear"
        );

      const renderFiltered = () => {
        const dateFrom = String(
          document.getElementById(
            "movement-filter-from"
          )?.value || ""
        ).trim();

        const dateTo = String(
          document.getElementById(
            "movement-filter-to"
          )?.value || ""
        ).trim();

        const productText = String(
          document.getElementById(
            "movement-filter-product"
          )?.value || ""
        ).trim();

        if (
          dateFrom &&
          dateTo &&
          dateFrom > dateTo
        ) {
          Swal.fire(
            "Filtro inválido",
            "La fecha inicial no puede ser posterior a la fecha final.",
            "warning"
          );

          return;
        }

        const filtered =
          bioxInvFilterMovements(
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

        if (summary) {
          summary.textContent =
            `${filtered.length} entrada${filtered.length === 1 ? "" : "s"
            }`;
        }

        if (wrapper) {
          wrapper.innerHTML =
            bioxInvRenderMovementTableHtml(
              filtered
            );
        }

        bioxInvBindMovementActionButtons();
      };

      if (applyButton) {
        applyButton.addEventListener(
          "click",
          renderFiltered
        );
      }

      if (clearButton) {
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

            if (from) {
              from.value = "";
            }

            if (to) {
              to.value = "";
            }

            if (product) {
              product.value = "";
            }

            renderFiltered();
          }
        );
      }

      const productFilter =
        document.getElementById(
          "movement-filter-product"
        );

      if (productFilter) {
        [
          "input",
          "change"
        ].forEach(eventName => {
          productFilter.addEventListener(
            eventName,
            renderFiltered
          );
        });
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
        .forEach(element => {
          element.addEventListener(
            "change",
            renderFiltered
          );
        });

      bioxInvBindMovementActionButtons();
    }
  });
}

async function bioxInvConfirmDeleteProduct(
  productId,
  productName
) {
  if (!bioxInvIsAdministratorRole()) {
    await Swal.fire(
      "Sin permisos",
      "Solo el administrador puede eliminar productos.",
      "error"
    );

    return false;
  }

  const targetId = String(
    productId || ""
  ).trim();

  if (!targetId) {
    await Swal.fire(
      "Producto no válido",
      "No se recibió un identificador válido del producto.",
      "warning"
    );

    return false;
  }

  if (!bioxInvCurrentLocalId) {
    await Swal.fire(
      "Sin local",
      "No se pudo identificar el local actual.",
      "error"
    );

    return false;
  }

  if (typeof db === "undefined" || !db) {
    await Swal.fire(
      "Error de conexión",
      "No está disponible la conexión con Firestore.",
      "error"
    );

    return false;
  }

  const productRef = db
    .collection(bioxInvPRODUCTS_COLLECTION)
    .doc(targetId);

  let productData = null;

  try {
    const snapshot = await productRef.get();

    if (!snapshot.exists) {
      await Swal.fire(
        "Producto no encontrado",
        "El producto ya no existe o fue eliminado previamente.",
        "warning"
      );

      return false;
    }

    productData = snapshot.data() || {};

    if (!bioxInvMatchesCurrentLocal(productData)) {
      await Swal.fire(
        "Operación no permitida",
        "El producto no pertenece al local actual.",
        "error"
      );

      return false;
    }

  } catch (error) {
    console.error(
      "[Inventario] No se pudo verificar el producto:",
      error
    );

    await Swal.fire(
      "Error",
      error.message ||
      "No se pudo verificar el producto antes de eliminarlo.",
      "error"
    );

    return false;
  }

  const resolvedProductName = String(
    productName ||
    productData.name ||
    productData.nombre ||
    "este producto"
  ).trim();

  const confirmation = await Swal.fire({
    titleText:
      `¿Eliminar "${resolvedProductName}"?`,

    text:
      "Esta acción eliminará el documento del producto en Firestore.",

    icon:
      "warning",

    showCancelButton:
      true,

    confirmButtonText:
      "Sí, eliminar",

    cancelButtonText:
      "Cancelar"
  });

  if (!confirmation.isConfirmed) {
    return false;
  }

  try {

    await db.runTransaction(
      async transaction => {
        const currentSnapshot =
          await transaction.get(productRef);

        if (!currentSnapshot.exists) {
          throw new Error(
            "El producto ya no existe en Firestore."
          );
        }

        const currentData =
          currentSnapshot.data() || {};

        if (!bioxInvMatchesCurrentLocal(currentData)) {
          throw new Error(
            "No se puede eliminar un producto que no pertenece al local actual."
          );
        }

        transaction.delete(productRef);
      }
    );

    if (
      typeof bioxInvRemoveSessionDocument === "function"
    ) {
      const removed =
        bioxInvRemoveSessionDocument(
          bioxInvPRODUCTS_COLLECTION,
          targetId
        );

      if (removed === false) {
        console.warn(
          "[Inventario] El producto se eliminó en Firestore, pero no se pudo confirmar su eliminación de la caché de sesión."
        );
      }
    }

    if (Array.isArray(bioxInvCurrentProductsList)) {
      bioxInvCurrentProductsList =
        bioxInvCurrentProductsList.filter(product =>
          String(product.id || "").trim() !== targetId
        );
    }

    if (
      typeof bioxInvInvalidateProductStockMovementsCache === "function"
    ) {
      bioxInvInvalidateProductStockMovementsCache(targetId);
    }

    bioxInvRefreshInventoryView();

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

    return true;

  } catch (error) {
    console.error(
      "[Inventario] Error eliminando producto:",
      error
    );

    await Swal.fire(
      "Error",
      error.message ||
      "No se pudo eliminar el producto.",
      "error"
    );

    return false;
  }
}

function bioxInvEnsureConversionModuleLoaded() {
  if (window.InventoryConversions) {
    return Promise.resolve(
      window.InventoryConversions
    );
  }

  return import("./conversion.js").then(
    () => {
      if (!window.InventoryConversions) {
        throw new Error(
          "No se pudo cargar el módulo de conversiones."
        );
      }

      return window.InventoryConversions;
    }
  );
}

function bioxInvApplySearch() {
  const searchInput =
    bioxInvGetInventorySearchInput();

  const value = searchInput
    ? String(searchInput.value || "").trim()
    : "";

  if (
    bioxInvInventoryDT &&
    typeof bioxInvInventoryDT.search === "function"
  ) {
    bioxInvInventoryDT
      .search(value)
      .draw();

    return;
  }

  const products = Array.isArray(
    bioxInvCurrentProductsList
  )
    ? bioxInvCurrentProductsList
    : [];

  const normalized =
    bioxInvNormalizeText(value);

  const filtered = !normalized
    ? products
    : products.filter(product => {
      return (
        bioxInvNormalizeText(
          product.name
        ).includes(normalized) ||

        bioxInvNormalizeText(
          bioxInvGetProductCode(product)
        ).includes(normalized) ||

        bioxInvNormalizeText(
          bioxInvGetProductProvidersSearchText(product)
        ).includes(normalized)
      );
    });

  if (
    typeof bioxInvRenderInventoryFallback === "function" &&
    typeof bioxInvBuildRowData === "function"
  ) {
    bioxInvRenderInventoryFallback(
      filtered.map(bioxInvBuildRowData)
    );

  } else {
    console.error(
      "[Inventario] No están disponibles las funciones de renderizado alternativo."
    );
  }
}

async function bioxInvReloadInventoryAfterConversion() {

  if (bioxInvInventoryLoadPromise) {
    await bioxInvInventoryLoadPromise;
  }

  if (
    typeof bioxInvInvalidateAllMovementsCache === "function"
  ) {
    bioxInvInvalidateAllMovementsCache();
  }

  await bioxInvLoadInventoryData();

  bioxInvRefreshInventoryView();

  if (
    typeof bioxInvEnsureGlobalMovementsButton === "function"
  ) {
    bioxInvEnsureGlobalMovementsButton();
  }

  if (
    typeof bioxInvEnsureConversionButton === "function"
  ) {
    bioxInvEnsureConversionButton();
  }
}

function bioxInvBindInventoryPageEvents() {
  if (typeof document === "undefined") {
    return;
  }

  const searchInput =
    bioxInvGetInventorySearchInput();

  const btnAdd =
    bioxInvGetInventoryAddButton();

  if (
    searchInput &&
    searchInput.dataset.inventorySearchBound !== "1"
  ) {
    searchInput.dataset.inventorySearchBound = "1";

    [
      "input",
      "change"
    ].forEach(eventName => {
      searchInput.addEventListener(
        eventName,
        bioxInvApplySearch
      );
    });
  }

  if (
    btnAdd &&
    btnAdd.dataset.inventoryAddBound !== "1"
  ) {
    btnAdd.dataset.inventoryAddBound = "1";

    btnAdd.addEventListener(
      "click",
      bioxInvOpenBatchAddModal
    );
  }
}

function bioxInvExtractLocalId(context = {}) {
  if (
    !context ||
    typeof context !== "object" ||
    Array.isArray(context)
  ) {
    return "";
  }

  const candidates = [
    context.id_local,
    context.idLocal,
    context.localId,
    context.idlocal,
    context.local_id,
    context.localID,

    context.local,

    context.localRef,
    context.localReference,

    context.local?.id_local,
    context.local?.idLocal,
    context.local?.localId,
    context.local?.local_id,
    context.local?.id,

    context.localRef?.id,
    context.localReference?.id
  ];

  for (const candidate of candidates) {
    if (
      typeof candidate === "string" ||
      typeof candidate === "number"
    ) {
      const value = String(candidate).trim();

      if (value) {
        return value;
      }

      continue;
    }

    if (
      candidate &&
      typeof candidate === "object"
    ) {
      const nestedCandidates = [
        candidate.id_local,
        candidate.idLocal,
        candidate.localId,
        candidate.local_id,
        candidate.id
      ];

      for (const nested of nestedCandidates) {
        if (
          typeof nested === "string" ||
          typeof nested === "number"
        ) {
          const value = String(nested).trim();

          if (value) {
            return value;
          }
        }
      }
    }
  }

  return "";
}

async function bioxInvResolveInventoryContext(
  user,
  validatedRouteContext = null
) {
  if (!user || !user.uid) {
    throw new Error(
      "No hay un usuario autenticado para cargar el inventario."
    );
  }

  const userUid = String(user.uid).trim();

  if (!userUid) {
    throw new Error(
      "El identificador del usuario autenticado no es válido."
    );
  }

  const routeContext =
    validatedRouteContext?.context ||
    validatedRouteContext ||
    null;

  if (
    routeContext &&
    typeof routeContext === "object" &&
    routeContext.uid &&
    String(routeContext.uid).trim() !== userUid
  ) {
    throw new Error(
      "El contexto recibido por el inventario no corresponde al usuario autenticado."
    );
  }

  let appContext = null;

  if (
    typeof window.getCurrentUserContext === "function"
  ) {
    try {
      appContext =
        await window.getCurrentUserContext(user);

    } catch (error) {
      if (
        !routeContext ||
        typeof routeContext !== "object"
      ) {
        throw error;
      }

      console.warn(
        "[Inventario] No se pudo recuperar el contexto desde app.js. Se utilizará el contexto validado por el router.",
        error
      );
    }

  } else if (
    !routeContext ||
    typeof routeContext !== "object"
  ) {
    throw new Error(
      "app.js no expuso getCurrentUserContext() y tampoco se recibió un contexto válido del router."
    );
  }

  if (
    appContext &&
    typeof appContext === "object" &&
    appContext.uid &&
    String(appContext.uid).trim() !== userUid
  ) {
    throw new Error(
      "El contexto de app.js pertenece a un usuario diferente del autenticado."
    );
  }

  if (
    !appContext ||
    typeof appContext !== "object"
  ) {
    appContext = routeContext;
  }

  if (
    !appContext ||
    typeof appContext !== "object"
  ) {
    throw new Error(
      "No se pudo obtener un contexto válido para el usuario."
    );
  }

  const context = {
    ...(routeContext || {}),
    ...appContext
  };

  let localId =
    bioxInvExtractLocalId(appContext) ||
    bioxInvExtractLocalId(routeContext);

  if (
    !localId &&
    typeof window.ensureCurrentUserContext === "function"
  ) {
    const refreshedContext =
      await window.ensureCurrentUserContext(
        user,
        {
          forceRefresh: true
        }
      );

    if (
      refreshedContext &&
      typeof refreshedContext === "object"
    ) {
      if (
        refreshedContext.uid &&
        String(refreshedContext.uid).trim() !== userUid
      ) {
        throw new Error(
          "El contexto actualizado pertenece a otro usuario."
        );
      }

      Object.assign(
        context,
        refreshedContext
      );

      localId =
        bioxInvExtractLocalId(refreshedContext) ||
        bioxInvExtractLocalId(context) ||
        bioxInvExtractLocalId(routeContext);
    }
  }

  if (
    !localId &&
    typeof window.getCurrentLocalId === "function"
  ) {
    localId = String(
      window.getCurrentLocalId() || ""
    ).trim();
  }

  if (!localId) {
    throw new Error(
      "El perfil del usuario no tiene un local asignado. " +
      "En Firestore, verifica que el documento del usuario " +
      "contenga id_local, idLocal o localId con el ID real " +
      "de un documento de la colección de locales."
    );
  }

  const rawRole = String(
    appContext.role ||
    context.role ||
    routeContext?.role ||
    appContext.position ||
    context.position ||
    ""
  ).trim();

  const canonicalRole =
    typeof window.getCanonicalRole === "function"
      ? window.getCanonicalRole(rawRole)
      : rawRole;

  if (
    !canonicalRole ||
    typeof canonicalRole !== "string"
  ) {
    throw new Error(
      "El perfil autenticado no contiene un rol válido."
    );
  }

  const localInfo =
    typeof window.getCurrentLocalInfo === "function"
      ? window.getCurrentLocalInfo() || {}
      : {};

  const nestedLocal =
    context.local &&
      typeof context.local === "object"
      ? context.local
      : {};

  bioxInvCurrentUserInventoryContext = {
    ...context,

    uid: userUid,

    role: canonicalRole,

    id_local: localId
  };

  bioxInvCurrentRole =
    canonicalRole.trim().toLowerCase();

  bioxInvCurrentLocalId = localId;

  bioxInvCurrentLocalInfo = {
    id_local: localId,

    nombre: String(
      context.localNombre ||
      nestedLocal.nombre ||
      localInfo.nombre ||
      ""
    ).trim(),

    numeroDocumento: String(
      context.localNumeroDocumento ||
      nestedLocal.numeroDocumento ||
      localInfo.numeroDocumento ||
      ""
    ).trim(),

    ubicacion: String(
      context.localUbicacion ||
      nestedLocal.ubicacion ||
      localInfo.ubicacion ||
      ""
    ).trim(),

    contribuyente: String(
      context.localContribuyente ||
      nestedLocal.contribuyente ||
      localInfo.contribuyente ||
      ""
    ).trim(),

    tipoDocumento: String(
      context.localTipoDocumento ||
      nestedLocal.tipoDocumento ||
      localInfo.tipoDocumento ||
      ""
    ).trim(),

    nit: String(
      context.localNIT ||
      nestedLocal.nit ||
      localInfo.nit ||
      ""
    ).trim(),

    nrc: String(
      context.localNRC ||
      nestedLocal.nrc ||
      localInfo.nrc ||
      ""
    ).trim()
  };

  bioxInvCanEditInventory =
    typeof window.canEditInventoryForRole === "function"
      ? Boolean(
        window.canEditInventoryForRole(canonicalRole)
      )
      : [
        "administrador",
        "admin",
        "bodega"
      ].includes(bioxInvCurrentRole);

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

  return bioxInvCurrentUserInventoryContext;
}

function bioxInvFindExactBatchProduct(value) {
  const text = bioxInvNormalizeText(value);

  if (!text) {
    return null;
  }

  if (!Array.isArray(bioxInvCurrentProductsList)) {
    return null;
  }

  return (
    bioxInvCurrentProductsList.find(product =>
      bioxInvNormalizeText(product.name) === text ||
      bioxInvNormalizeText(
        bioxInvGetProductCode(product)
      ) === text
    ) || null
  );
}

function bioxInvEnsureInventoryDataTable() {
  const view =
    window.InventoryMVC
      ?.views
      ?.inventory;

  if (
    !view ||
    typeof view.ensureDataTable !== "function"
  ) {
    console.error(
      "[Inventario] La vista MVC no tiene disponible ensureDataTable()."
    );

    bioxInvInventoryDT = null;
    return null;
  }

  const dataTable = view.ensureDataTable();

  bioxInvInventoryDT = dataTable || null;

  return bioxInvInventoryDT;
}

/**
 * Actualiza la tabla de inventario utilizando los productos
 * que mantiene el controlador en memoria.
 *
 * Prioridad:
 * 1. DataTables, si está disponible.
 * 2. Renderizado alternativo, si DataTables no está disponible.
 */
function bioxInvRefreshInventoryView() {
  const view =
    window.InventoryMVC
      ?.views
      ?.inventory;

  if (
    !view ||
    typeof view.refresh !== "function"
  ) {
    throw new Error(
      "[Inventario] La vista MVC no tiene disponible refresh()."
    );
  }

  return view.refresh();
}

/*
 * Publicar la función para que inventory.repository.js
 * pueda invocarla después de cargar los datos.
 */
window.bioxInvRefreshInventoryView =
  bioxInvRefreshInventoryView;

function bioxInvGetInventoryRepository() {
  const repository =
    window.InventoryMVC
      ?.models
      ?.inventory;

  if (
    !repository ||
    typeof repository.loadData !== "function"
  ) {
    throw new Error(
      "No se encontró el repositorio del inventario. " +
      "Verifica que inventory.repository.js se haya cargado " +
      "y registrado antes de inicializar inventory.controller.js."
    );
  }

  return repository;
}

window.bioxInvEnsureInventoryDataTable =
  bioxInvEnsureInventoryDataTable;

/*
 * ============================================================
 * REPARACIÓN HISTÓRICA AUTOMÁTICA
 * ============================================================
 *
 * La reparación se invoca desde el inicializador del controlador,
 * después de resolver y validar el local, y antes de cargar los
 * productos en la interfaz.
 *
 * Esta llamada explícita evita depender de cuál implementación de
 * bioxInvResolveInventoryContext() prevalezca si el controlador y
 * el servicio se cargan como scripts clásicos y ambos declaran
 * una función con ese mismo nombre.
 */
async function bioxInvRunAutomaticHistoricalRepair() {
  const localId = String(
    bioxInvCurrentLocalId || ""
  ).trim();

  if (!localId) {
    throw new Error(
      "No se puede iniciar la reparación histórica: no se ha identificado el local actual."
    );
  }

  if (!bioxInvCanEditInventory) {
    console.info(
      "[Inventario] Reparación histórica automática omitida: el usuario tiene permisos de solo lectura.",
      { localId }
    );

    return {
      localId,
      skipped: true,
      reason: "read-only-user"
    };
  }

  const repairFunction =
    typeof bioxInvEnsureAutomaticHistoricalRepair === "function"
      ? bioxInvEnsureAutomaticHistoricalRepair
      : typeof window.bioxInvEnsureAutomaticHistoricalRepair === "function"
        ? window.bioxInvEnsureAutomaticHistoricalRepair
        : null;

  if (typeof repairFunction !== "function") {
    throw new Error(
      "No está disponible bioxInvEnsureAutomaticHistoricalRepair(). " +
      "Verifica que js/inventory/inventory.service.js se cargue antes de inicializar el inventario."
    );
  }

  console.info(
    "[Inventario] Iniciando reparación histórica automática...",
    { localId }
  );

  const result = await repairFunction();

  if (
    result &&
    Number(result.productsWithErrors || 0) > 0
  ) {
    throw new Error(
      `La reparación histórica encontró ${result.productsWithErrors} producto(s) con errores. ` +
      "Consulta los detalles en la consola antes de utilizar el inventario."
    );
  }

  console.info(
    "[Inventario] Reparación histórica automática finalizada correctamente.",
    {
      localId,
      omitida: Boolean(result?.skipped),
      productosRevisados: result?.productsScanned ?? null,
      productosConMovimientos: result?.productsWithMovements ?? null,
      movimientosRevisados: result?.movementsScanned ?? null,
      movimientosActualizados: result?.movementsUpdated ?? null,
      motivoOmisión: result?.reason || null
    }
  );

  return result;
}

async function bioxInvInitializeInventory(
  user,
  validatedRouteContext = null
) {

  if (typeof firebase === "undefined") {
    console.error(
      "[Inventario] Firebase no se ha cargado correctamente."
    );

    if (typeof Swal !== "undefined") {
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: "Firebase no se cargó. Revisa la conexión o los scripts."
      });
    }

    return;
  }

  if (bioxInvInventoryInitialized) {
    bioxInvBindInventoryPageEvents();

    if (
      typeof bioxInvEnsureConversionButton === "function"
    ) {
      bioxInvEnsureConversionButton();
    }

    if (
      typeof bioxInvEnsureGlobalMovementsButton === "function"
    ) {
      bioxInvEnsureGlobalMovementsButton();
    }

    return;
  }

  if (bioxInvInventoryInitializationPromise) {
    return bioxInvInventoryInitializationPromise;
  }

  const initializationPromise = (async () => {
    bioxInvInventoryInitialized = true;

    try {

      bioxInvBindInventoryPageEvents();

      await bioxInvResolveInventoryContext(
        user,
        validatedRouteContext
      );

      if (!bioxInvCurrentLocalId) {
        const contextKeys = Object.keys(
          bioxInvCurrentUserInventoryContext || {}
        ).join(", ") || "ninguna";

        throw new Error(
          "No se encontró el identificador del local en el contexto " +
          "del usuario. Se esperaba uno de estos campos: " +
          "id_local, idLocal, localId o idlocal. " +
          `Propiedades recibidas: ${contextKeys}. ` +
          "Verifica la asignación del usuario y la función " +
          "getCurrentUserContext() de app.js."
        );
      }

      /*
       * La reparación se ejecuta antes de inicializar la tabla,
       * cargar los productos y mostrar las existencias.
       * El servicio evita repetir el barrido si ya se completó
       * para este local durante la sesión actual.
       */
      const historicalRepairResult =
        await bioxInvRunAutomaticHistoricalRepair();

      console.info(
        "[Inventario] Estado de reparación histórica:",
        historicalRepairResult
      );

      if (
        typeof window.renderNavigationForRole === "function"
      ) {
        window.renderNavigationForRole(
          bioxInvCurrentUserInventoryContext.role || ""
        );
      }

      const repository =
        bioxInvGetInventoryRepository();

      if (
        typeof window.bioxInvEnsureInventoryDataTable === "function"
      ) {
        window.bioxInvEnsureInventoryDataTable();
      } else {
        console.warn(
          "[Inventario] No se registró la función de inicialización de DataTables."
        );
      }

      await bioxInvEnsureConversionModuleLoaded();

      if (
        typeof bioxInvEnsureConversionButton === "function"
      ) {
        bioxInvEnsureConversionButton();
      }

      if (
        typeof bioxInvEnsureGlobalMovementsButton === "function"
      ) {
        bioxInvEnsureGlobalMovementsButton();
      }

      bioxInvBindInventoryPageEvents();

      console.log(
        "[Inventario] Cargando datos mediante el repositorio..."
      );

      const products =
        await repository.loadData();

      console.log(
        "[Inventario] Inicialización de datos completada:",
        {
          localId: bioxInvCurrentLocalId,

          productos: Array.isArray(products)
            ? products.length
            : bioxInvCurrentProductsList.length,

          proveedores: Array.isArray(bioxInvCurrentProvidersList)
            ? bioxInvCurrentProvidersList.length
            : 0
        }
      );

      if (
        typeof bioxInvEnsureConversionButton === "function"
      ) {
        bioxInvEnsureConversionButton();
      }

      if (
        typeof bioxInvEnsureGlobalMovementsButton === "function"
      ) {
        bioxInvEnsureGlobalMovementsButton();
      }

      const renderedProducts =
        bioxInvRefreshInventoryView();

      console.info(
        "[Inventario] Vista actualizada después de cargar los datos:",
        {
          productosCargados: Array.isArray(products)
            ? products.length
            : bioxInvCurrentProductsList.length,
          productosRenderizados: renderedProducts,
          dataTableInicializado: Boolean(
            bioxInvInventoryDT &&
            typeof bioxInvInventoryDT.rows === "function"
          )
        }
      );

      bioxInvInventoryInitializedUid =
        String(user?.uid || "").trim();

      return true;

    } catch (error) {
      bioxInvInventoryInitialized = false;
      bioxInvInventoryInitializedUid = "";

      console.error(
        "[Inventario] Error durante la inicialización:",
        error
      );

      if (typeof Swal !== "undefined") {
        await Swal.fire({
          icon: "error",
          title: "Error de inventario",
          text:
            error.message ||
            "No se pudo cargar el inventario."
        });
      }

      return false;
    }
  })();

  bioxInvInventoryInitializationPromise =
    initializationPromise;

  bioxInvInventoryInitializationUserUid =
    String(user?.uid || "").trim();

  try {
    return await initializationPromise;

  } finally {
    if (
      bioxInvInventoryInitializationPromise ===
      initializationPromise
    ) {
      bioxInvInventoryInitializationPromise = null;
      bioxInvInventoryInitializationUserUid = "";
    }
  }
}

function bioxInvInitializePageEventsWhenPossible() {
  if (typeof document === "undefined") {
    return;
  }

  const inventoryTable =
    document.getElementById("inventoryTable");

  if (!inventoryTable) {
    return;
  }

  bioxInvBindInventoryPageEvents();
}


if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      bioxInvInitializePageEventsWhenPossible,
      {
        once: true
      }
    );

  } else {
    bioxInvInitializePageEventsWhenPossible();
  }
}

(function bioxInvRegisterInventoryController() {
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

  const previousControllers =
    previousMVC.controllers &&
      typeof previousMVC.controllers === "object"
      ? previousMVC.controllers
      : {};

  const bioxInvInventoryModel =
    previousModels.inventory &&
      typeof previousModels.inventory === "object"
      ? previousModels.inventory
      : {};

  const bioxInvInventoryController = {
    name: "inventory",

    page:
      bioxInvInventoryModel.page ||
      "inventory.html",

    roles:
      Array.isArray(bioxInvInventoryModel.roles)
        ? bioxInvInventoryModel.roles
        : [],

    init:
      bioxInvInitializeInventory,

    reload:
      bioxInvReloadInventoryAfterConversion
  };

  window.InventoryMVC = {
    ...previousMVC,

    models: {
      ...previousModels
    },

    controllers: {
      ...previousControllers,

      inventory:
        bioxInvInventoryController
    }
  };

  const registeredController =
    window.InventoryMVC.controllers.inventory;

  if (
    !registeredController ||
    typeof registeredController.init !== "function"
  ) {
    throw new Error(
      "[Inventario] No se pudo registrar init() en el controlador MVC."
    );
  }

  console.info(
    "[Inventario] Controlador registrado correctamente.",
    {
      name: registeredController.name,
      page: registeredController.page,
      init: typeof registeredController.init,
      reload: typeof registeredController.reload
    }
  );
})();
