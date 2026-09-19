// assets/js/controllers/conversion.js
//
// CONVERSIONES DE INVENTARIO
//
// Permite convertir UNO O VARIOS productos de origen
// en UN producto resultante.
//
// Ejemplos:
//
//   5 Cerdos -> 20 Chicharrón
//
//   5 Cerdos + 10 kg de Carne -> 30 Chicharrón
//
//   2 Cerdos + 5 Chicharrón -> 100 Tortillas con chicharrón
//
// Funcionamiento:
//
//   1. Descarga cada producto de origen.
//   2. Suma el costo de todos los productos consumidos.
//   3. Aumenta el producto de salida.
//   4. Calcula el costo generado:
//
//        costo total consumido
//        ---------------------
//        unidades producidas
//
//   5. Si el producto de salida ya existe,
//      recalcula su costo mediante promedio ponderado.
//
//   6. Si el producto de salida NO existe,
//      lo crea.
//
//   7. Crea UN movimiento de salida por cada
//      producto de origen.
//
//   8. Crea UN movimiento de entrada para
//      el producto resultante.
//
//   9. Crea un documento en "conversiones"
//      con el detalle completo de todos
//      los productos utilizados.
//
//  10. Actualiza la caché de sesión.
//
// No utiliza onSnapshot().
//
// ================================================================

(function () {
  "use strict";

  /*
   * ============================================================
   * FIREBASE
   * ============================================================
   */

  if (typeof firebase === "undefined") {
    console.error(
      "Firebase no se ha cargado correctamente."
    );

    return;
  }

  /*
   * ============================================================
   * COLECCIONES
   * ============================================================
   */

  const PRODUCTS_COLLECTION =
    window.PRODUCTS_COLLECTION_NAME ||
    "productos";

  const MOVEMENTS_COLLECTION =
    window.MOVEMENTS_COLLECTION_NAME ||
    "stock_movimientos";

  const CONVERSIONS_COLLECTION =
    window.CONVERSIONS_COLLECTION_NAME ||
    "conversiones";

  /*
   * ============================================================
   * FIRESTORE
   * ============================================================
   */

  const db =
    window.db ||
    firebase.firestore();

  /*
   * ============================================================
   * ESTADO
   * ============================================================
   */

  let localProducts = [];

  /*
   * ============================================================
   * UTILIDADES
   * ============================================================
   */

  function numberOrZero(value) {
    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : 0;
  }

  function integerOrZero(value) {
    return Math.max(
      0,
      Math.floor(
        numberOrZero(value)
      )
    );
  }

  function normalizeText(value) {
    return String(
      value || ""
    )
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      );
  }

  function escapeHtml(value) {
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

  function currency(value) {
    return `$${numberOrZero(
      value
    ).toFixed(2)}`;
  }

  /*
   * ============================================================
   * FECHAS
   * ============================================================
   */

  function getLocalDateInputValue(
    date = new Date()
  ) {
    const value =
      date instanceof Date
        ? date
        : new Date(date);

    if (
      !Number.isFinite(
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

    const match =
      /^(\d{4})-(\d{2})-(\d{2})$/.exec(
        text
      );

    if (!match) {
      return null;
    }

    const year =
      Number(
        match[1]
      );

    const month =
      Number(
        match[2]
      );

    const day =
      Number(
        match[3]
      );

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
      date.getFullYear() !== year ||
      date.getMonth() !==
        month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return date;
  }

  function buildOperationTimestamp(
    operationDate
  ) {
    if (
      !(
        operationDate instanceof
        Date
      ) ||
      !Number.isFinite(
        operationDate.getTime()
      )
    ) {
      throw new Error(
        "La fecha de operación no es válida."
      );
    }

    return firebase.firestore.Timestamp.fromDate(
      new Date(
        operationDate.getFullYear(),
        operationDate.getMonth(),
        operationDate.getDate(),
        12,
        0,
        0,
        0
      )
    );
  }

  /*
   * ============================================================
   * CONTEXTO LOCAL
   * ============================================================
   */

  function getCurrentLocalId() {
    if (
      typeof window.getCurrentLocalId ===
      "function"
    ) {
      return String(
        window.getCurrentLocalId() ||
        ""
      ).trim();
    }

    return String(
      window.currentLocalContext
        ?.id_local ||
      ""
    ).trim();
  }

  function matchesCurrentLocal(
    data = {}
  ) {
    const localId =
      getCurrentLocalId();

    if (!localId) {
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
      localId
    );
  }

  function getCurrentLocalInfo() {
    const stored =
      window.getCurrentLocalInfo?.() ||
      {};

    const context =
      getCurrentUserContext();

    return {
      id_local:
        getCurrentLocalId(),

      nombre:
        stored.nombre ||
        context.localNombre ||
        "",

      numeroDocumento:
        stored.numeroDocumento ||
        context.localNumeroDocumento ||
        "",

      ubicacion:
        stored.ubicacion ||
        context.localUbicacion ||
        "",

      contribuyente:
        stored.contribuyente ||
        context.localContribuyente ||
        "",

      tipoDocumento:
        stored.tipoDocumento ||
        context.localTipoDocumento ||
        "",

      nit:
        stored.nit ||
        context.localNIT ||
        "",

      nrc:
        stored.nrc ||
        context.localNRC ||
        ""
    };
  }

  /*
   * ============================================================
   * CACHE
   * ============================================================
   */

  function getSessionCollection(
    collectionName
  ) {
    if (
      typeof window.getSessionCollection !==
      "function"
    ) {
      return [];
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
      return;
    }

    window.upsertSessionDocument(
      collectionName,
      documentId,
      data
    );
  }

  /*
   * ============================================================
   * USUARIO
   * ============================================================
   */

  function getCurrentUser() {
    return (
      firebase.auth().currentUser ||
      null
    );
  }

  function getCurrentUserContext() {
    return (
      window.getStoredCurrentUser?.() ||
      {}
    );
  }

  /*
   * ============================================================
   * PRODUCTOS
   * ============================================================
   */

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

  function getProductStock(
    product
  ) {
    const stock =
      Number(
        product?.stockCurrentUnits
      );

    if (
      Number.isFinite(
        stock
      )
    ) {
      return Math.max(
        0,
        stock
      );
    }

    const quantity =
      Number(
        product?.quantity
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
        product?.stockBaseUnits
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

  function getProductUnitsPerBox(
    product
  ) {
    return Math.max(
      1,
      numberOrZero(
        product?.unitsPerBox
      ) || 1
    );
  }

  function getProductCostPerUnit(
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
      getProductUnitsPerBox(
        product
      );

    if (
      costPerBox > 0 &&
      unitsPerBox > 0
    ) {
      return (
        costPerBox /
        unitsPerBox
      );
    }

    return 0;
  }

  function findProductById(
    id,
    source = localProducts
  ) {
    const target =
      String(
        id || ""
      ).trim();

    return (
      source.find(
        product =>
          String(
            product.id ||
            ""
          ).trim() === target
      ) || null
    );
  }

  function findProductByText(
    value,
    source = localProducts
  ) {
    const text =
      normalizeText(
        value
      );

    if (!text) {
      return null;
    }

    const exact =
      source.find(
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

    if (
      exact
    ) {
      return exact;
    }

    return (
      source.find(
        product =>
          normalizeText(
            product.name
          ).includes(text) ||
          normalizeText(
            getProductCode(
              product
            )
          ).includes(text)
      ) || null
    );
  }

  function loadLocalProducts() {
    const documents =
      getSessionCollection(
        PRODUCTS_COLLECTION
      );

    localProducts =
      documents
        .filter(
          ({
            data
          }) =>
            matchesCurrentLocal(
              data || {}
            )
        )
        .map(
          ({
            id,
            data
          }) => ({
            id,
            ...(data || {})
          })
        )
        .sort(
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

    return localProducts;
  }

  /*
   * ============================================================
   * OPCIONES DE PRODUCTOS
   * ============================================================
   */

  function productOptionLabel(
    product
  ) {
    const name =
      String(
        product?.name ||
        ""
      ).trim();

    const code =
      getProductCode(
        product
      );

    const stock =
      getProductStock(
        product
      );

    return [
      name,

      code
        ? `Código: ${code}`
        : "",

      `Stock: ${stock}`
    ]
      .filter(
        Boolean
      )
      .join(
        " — "
      );
  }

  function buildProductOptions(
    products = localProducts
  ) {
    return products
      .map(
        product => {
          const name =
            String(
              product.name ||
              ""
            ).trim();

          const label =
            productOptionLabel(
              product
            );

          return `
            <option
              value="${escapeHtml(
                name
              )}"
              label="${escapeHtml(
                label
              )}"
            ></option>
          `;
        }
      )
      .join("");
  }

  /*
   * ============================================================
   * FILAS DE PRODUCTOS DE ORIGEN
   * ============================================================
   */

  function buildSourceRowHtml(
    index
  ) {
    return `
      <div
        class="conversion-source-row"
        data-source-index="${index}"
      >

        <div class="conversion-source-row-number">
          <strong>
            Producto ${index + 1}
          </strong>
        </div>

        <div class="inv-field">
          <label>
            Producto de origen
          </label>

          <input
            class="conversion-source-product-input"
            type="text"
            list="conversion-source-list"
            placeholder="Cerdo, carne, chicharrón..."
            autocomplete="off"
          >

          <small
            class="conversion-source-status"
          ></small>

          <small
            class="conversion-source-stock"
          ></small>
        </div>

        <div class="inv-field conversion-source-quantity-field">
          <label>
            Cantidad consumida
          </label>

          <input
            class="conversion-source-quantity-input"
            type="number"
            min="1"
            step="1"
            value="1"
          >
        </div>

        <button
          type="button"
          class="conversion-remove-source"
          title="Eliminar producto de origen"
          aria-label="Eliminar producto de origen"
        >
          ×
        </button>

      </div>
    `;
  }

  function renumberSourceRows() {
    const rows =
      document.querySelectorAll(
        ".conversion-source-row"
      );

    rows.forEach(
      (
        row,
        index
      ) => {
        row.dataset.sourceIndex =
          String(index);

        const title =
          row.querySelector(
            ".conversion-source-row-number strong"
          );

        if (
          title
        ) {
          title.textContent =
            `Producto ${index + 1}`;
        }
      }
    );
  }

  function updateSourceRemoveButtons() {
    const rows =
      document.querySelectorAll(
        ".conversion-source-row"
      );

    rows.forEach(
      row => {
        const button =
          row.querySelector(
            ".conversion-remove-source"
          );

        if (
          button
        ) {
          button.disabled =
            rows.length <= 1;
        }
      }
    );
  }

  function addSourceRow() {
    const container =
      document.getElementById(
        "conversion-source-rows"
      );

    if (
      !container
    ) {
      return;
    }

    const index =
      container.querySelectorAll(
        ".conversion-source-row"
      ).length;

    container.insertAdjacentHTML(
      "beforeend",
      buildSourceRowHtml(
        index
      )
    );

    renumberSourceRows();
    updateSourceRemoveButtons();
    updatePreview();
  }

  function removeSourceRow(
    row
  ) {
    const container =
      document.getElementById(
        "conversion-source-rows"
      );

    if (
      !container ||
      !row
    ) {
      return;
    }

    const rows =
      container.querySelectorAll(
        ".conversion-source-row"
      );

    if (
      rows.length <= 1
    ) {
      return;
    }

    row.remove();

    renumberSourceRows();
    updateSourceRemoveButtons();
    updatePreview();
  }

  /*
   * ============================================================
   * MODAL
   * ============================================================
   */

  function buildModalHtml() {
    loadLocalProducts();

    return `
      <div
        class="conversion-form"
        id="conversion-form"
      >

        <div
          class="conversion-info-box"
        >
          <strong>
            Conversión de inventario
          </strong>

          <p>
            Puedes utilizar uno o varios productos
            de origen para producir un único producto.
          </p>

          <p>
            Ejemplo:
            <strong>
              2 Cerdos + 5 Chicharrones
              → 20 Tortillas con chicharrón
            </strong>
          </p>

          <p>
            El costo total de producción es la suma
            del costo de todos los productos consumidos.
          </p>

          <p>
            El producto de salida puede ser
            <strong>existente</strong>
            o
            <strong>nuevo</strong>.
          </p>

          <p>
            No se genera gasto de compra.
            El costo del producto producido
            se obtiene trasladando el costo
            de los productos consumidos.
          </p>
        </div>

        <div
          class="conversion-grid"
        >

          <!-- =================================================
               FECHA
               ================================================= -->

          <div
            class="inv-field conversion-full"
          >
            <label
              for="conversion-operation-date"
            >
              Fecha de operación
            </label>

            <input
              id="conversion-operation-date"
              type="date"
              value="${getLocalDateInputValue()}"
            >
          </div>

          <!-- =================================================
               PRODUCTOS ORIGEN
               ================================================= -->

          <div
            class="conversion-source-section conversion-full"
          >

            <div
              class="conversion-section-header"
            >
              <div>
                <strong>
                  Productos consumidos
                </strong>

                <small>
                  Agrega uno o varios productos
                  de origen.
                </small>
              </div>

              <button
                type="button"
                id="conversion-add-source"
                class="conversion-add-source"
              >
                + Agregar producto
              </button>
            </div>

            <div
              id="conversion-source-rows"
            >
              ${buildSourceRowHtml(0)}
            </div>

          </div>

          <datalist
            id="conversion-source-list"
          >
            ${buildProductOptions()}
          </datalist>

          <!-- =================================================
               MODO SALIDA
               ================================================= -->

          <div
            class="inv-field conversion-full"
          >
            <label
              for="conversion-output-mode"
            >
              Producto de salida
            </label>

            <select
              id="conversion-output-mode"
            >
              <option
                value="existing"
              >
                Usar producto existente
              </option>

              <option
                value="new"
              >
                Crear producto nuevo
              </option>
            </select>

            <small>
              El producto resultante puede existir
              previamente o crearse automáticamente.
            </small>
          </div>

          <!-- =================================================
               SALIDA EXISTENTE
               ================================================= -->

          <div
            class="inv-field conversion-output-existing-field conversion-full"
            id="conversion-output-existing-field"
          >
            <label
              for="conversion-output-product"
            >
              Producto existente
            </label>

            <input
              id="conversion-output-product"
              type="text"
              list="conversion-output-list"
              placeholder="Selecciona un producto existente"
              autocomplete="off"
            >

            <datalist
              id="conversion-output-list"
            >
              ${buildProductOptions()}
            </datalist>

            <small
              id="conversion-output-status"
            ></small>
          </div>

          <!-- =================================================
               PRODUCTO NUEVO
               ================================================= -->

          <div
            class="inv-field conversion-new-only"
            id="conversion-new-name-field"
          >
            <label
              for="conversion-output-new-name"
            >
              Nombre del nuevo producto
            </label>

            <input
              id="conversion-output-new-name"
              type="text"
              placeholder="Ejemplo: Chicharrón"
              autocomplete="off"
            >

            <small>
              Este nombre puede no existir todavía
              en Inventario.
            </small>
          </div>

          <!-- =================================================
               CANTIDAD PRODUCIDA
               ================================================= -->

          <div
            class="inv-field"
          >
            <label
              for="conversion-output-quantity"
            >
              Cantidad producida
            </label>

            <input
              id="conversion-output-quantity"
              type="number"
              min="1"
              step="1"
              value="1"
            >
          </div>

          <!-- =================================================
               CAMPOS PRODUCTO NUEVO
               ================================================= -->

          <div
            class="inv-field conversion-new-only"
            id="conversion-new-code-field"
          >
            <label
              for="conversion-output-code"
            >
              Código del producto
            </label>

            <input
              id="conversion-output-code"
              type="text"
              placeholder="Opcional"
            >

            <small>
              Puede dejarse vacío.
            </small>
          </div>

          <div
            class="inv-field conversion-new-only"
            id="conversion-new-price-field"
          >
            <label
              for="conversion-output-price"
            >
              Precio de venta
            </label>

            <input
              id="conversion-output-price"
              type="number"
              min="0"
              step="0.01"
              value="0"
            >

            <small>
              Opcional. Por defecto $0.00.
            </small>
          </div>

          <div
            class="inv-field conversion-new-only"
            id="conversion-new-units-box-field"
          >
            <label
              for="conversion-output-units-box"
            >
              Unidades por caja
            </label>

            <input
              id="conversion-output-units-box"
              type="number"
              min="1"
              step="1"
              value="1"
            >

            <small>
              Opcional. Por defecto 1.
            </small>
          </div>

          <div
            class="inv-field conversion-new-only"
            id="conversion-new-reference-field"
          >
            <label
              for="conversion-output-reference"
            >
              Referencia libro
            </label>

            <input
              id="conversion-output-reference"
              type="text"
              value="Producción / Conversión"
            >
          </div>

          <!-- =================================================
               PREVISUALIZACIÓN
               ================================================= -->

          <div
            class="conversion-preview conversion-full"
            id="conversion-preview"
          ></div>

        </div>
      </div>
    `;
  }

  /*
   * ============================================================
   * UI DEL MODO DE SALIDA
   * ============================================================
   */

  function updateModeUI() {
    const mode =
      String(
        document.getElementById(
          "conversion-output-mode"
        )?.value ||
        "existing"
      ).trim();

    const existingField =
      document.getElementById(
        "conversion-output-existing-field"
      );

    const newFields =
      document.querySelectorAll(
        ".conversion-new-only"
      );

    if (
      existingField
    ) {
      existingField.style.display =
        mode ===
          "existing"
          ? "flex"
          : "none";
    }

    newFields.forEach(
      field => {
        field.style.display =
          mode === "new"
            ? "flex"
            : "none";
      }
    );

    updatePreview();
  }

  /*
   * ============================================================
   * LECTURA DE PRODUCTOS DE ORIGEN
   * ============================================================
   */

  function readSourceRowsFromDom() {
    const rows =
      document.querySelectorAll(
        ".conversion-source-row"
      );

    return Array.from(
      rows
    ).map(
      row => {
        const productText =
          String(
            row.querySelector(
              ".conversion-source-product-input"
            )?.value ||
            ""
          ).trim();

        const quantity =
          integerOrZero(
            row.querySelector(
              ".conversion-source-quantity-input"
            )?.value
          );

        const product =
          findProductByText(
            productText
          );

        return {
          productText,
          quantity,
          product,
          row
        };
      }
    );
  }

  /*
   * ============================================================
   * NORMALIZACIÓN DE VALORES
   * ============================================================
   *
   * Mantiene compatibilidad con la antigua estructura:
   *
   *   sourceProduct
   *   sourceQuantity
   *
   * cuando executeConversion() sea llamado
   * desde otro módulo.
   */

  function normalizeConversionValues(
    values = {}
  ) {
    let sourceItems =
      Array.isArray(
        values.sourceItems
      )
        ? values.sourceItems
            .map(
              item => ({
                productText:
                  String(
                    item?.productText ||
                    item?.product?.name ||
                    ""
                  ).trim(),

                quantity:
                  integerOrZero(
                    item?.quantity ??
                    item?.sourceQuantity
                  ),

                product:
                  item?.product ||
                  findProductById(
                    item?.productId
                  ) ||
                  findProductByText(
                    item?.productText ||
                    item?.product?.name
                  )
              })
            )
        : [];

    /*
     * Compatibilidad con el formato anterior.
     */

    if (
      !sourceItems.length &&
      values.sourceProduct
    ) {
      const legacyProduct =
        values.sourceProduct;

      sourceItems = [
        {
          productText:
            String(
              legacyProduct.name ||
              values.sourceText ||
              ""
            ).trim(),

          quantity:
            integerOrZero(
              values.sourceQuantity
            ),

          product:
            legacyProduct
        }
      ];
    }

    const totalSourceQuantity =
      sourceItems.reduce(
        (
          total,
          item
        ) =>
          total +
          integerOrZero(
            item.quantity
          ),
        0
      );

    const totalConversionCost =
      sourceItems.reduce(
        (
          total,
          item
        ) => {
          const cost =
            getProductCostPerUnit(
              item.product
            );

          return (
            total +
            (
              integerOrZero(
                item.quantity
              ) *
              cost
            )
          );
        },
        0
      );

    const outputQuantity =
      integerOrZero(
        values.outputQuantity
      );

    return {
      ...values,

      sourceItems,

      totalSourceQuantity,

      totalConversionCost,

      generatedUnitCost:
        outputQuantity > 0
          ? totalConversionCost /
            outputQuantity
          : 0
    };
  }

  /*
   * ============================================================
   * LECTURA DEL FORMULARIO
   * ============================================================
   */

  function resolveFormValues() {
    const sourceItems =
      readSourceRowsFromDom();

    const outputMode =
      String(
        document.getElementById(
          "conversion-output-mode"
        )?.value ||
        "existing"
      ).trim();

    const existingOutputText =
      String(
        document.getElementById(
          "conversion-output-product"
        )?.value ||
        ""
      ).trim();

    const newOutputName =
      String(
        document.getElementById(
          "conversion-output-new-name"
        )?.value ||
        ""
      ).trim();

    const outputProduct =
      outputMode === "existing"
        ? findProductByText(
          existingOutputText
        )
        : null;

    const outputQuantity =
      integerOrZero(
        document.getElementById(
          "conversion-output-quantity"
        )?.value
      );

    const outputCode =
      String(
        document.getElementById(
          "conversion-output-code"
        )?.value ||
        ""
      ).trim();

    const outputPrice =
      Math.max(
        0,
        numberOrZero(
          document.getElementById(
            "conversion-output-price"
          )?.value
        )
      );

    const outputUnitsPerBox =
      Math.max(
        1,
        integerOrZero(
          document.getElementById(
            "conversion-output-units-box"
          )?.value
        ) || 1
      );

    const reference =
      String(
        document.getElementById(
          "conversion-output-reference"
        )?.value ||
        ""
      ).trim();

    const dateValue =
      String(
        document.getElementById(
          "conversion-operation-date"
        )?.value ||
        ""
      ).trim();

    const operationDate =
      parseOperationDate(
        dateValue
      );

    return normalizeConversionValues({
      sourceItems,

      outputMode,

      existingOutputText,

      newOutputName,

      outputText:
        outputMode === "new"
          ? newOutputName
          : existingOutputText,

      outputProduct,

      outputQuantity,

      outputCode,

      outputPrice,

      outputUnitsPerBox,

      reference,

      dateValue,

      operationDate
    });
  }

  /*
   * ============================================================
   * RESUMEN DE PRODUCTOS ORIGEN
   * ============================================================
   */

  function buildSourceSummaryText(
    sourceItems = []
  ) {
    return sourceItems
      .map(
        item =>
          `${item.product?.name || item.productText || "Producto"} (${item.quantity} unidades)`
      )
      .join(
        " + "
      );
  }

  function buildSourceNames(
    sourceItems = []
  ) {
    return sourceItems
      .map(
        item =>
          String(
            item.product?.name ||
            item.productText ||
            ""
          ).trim()
      )
      .filter(
        Boolean
      );
  }

  function buildSourceIds(
    sourceItems = []
  ) {
    return sourceItems
      .map(
        item =>
          String(
            item.product?.id ||
            ""
          ).trim()
      )
      .filter(
        Boolean
      );
  }

  /*
   * ============================================================
   * ACTUALIZAR ESTADO DE FILAS
   * ============================================================
   */

  function updateSourceRowsStatus(
    sourceItems
  ) {
    sourceItems.forEach(
      item => {
        const row =
          item.row;

        if (
          !row
        ) {
          return;
        }

        const status =
          row.querySelector(
            ".conversion-source-status"
          );

        const stock =
          row.querySelector(
            ".conversion-source-stock"
          );

        if (
          status
        ) {
          if (
            item.product
          ) {
            const cost =
              getProductCostPerUnit(
                item.product
              );

            status.textContent =
              `Stock actual: ${getProductStock(
                item.product
              )} | Costo unitario: ${currency(
                cost
              )}`;

            const insufficient =
              item.quantity >
              getProductStock(
                item.product
              );

            status.style.color =
              insufficient
                ? "#b91c1c"
                : "#166534";
          } else {
            status.textContent =
              item.productText
                ? "No se encontró el producto."
                : "Selecciona un producto existente.";

            status.style.color =
              "#b91c1c";
          }
        }

        if (
          stock
        ) {
          if (
            item.product
          ) {
            const remaining =
              getProductStock(
                item.product
              ) -
              item.quantity;

            stock.textContent =
              `Stock después de convertir: ${remaining} unidades`;

            stock.style.color =
              remaining < 0
                ? "#b91c1c"
                : "#6b7280";
          } else {
            stock.textContent =
              "";
          }
        }
      }
    );
  }

  /*
   * ============================================================
   * PREVISUALIZACIÓN
   * ============================================================
   */

  function updatePreview() {
    const preview =
      document.getElementById(
        "conversion-preview"
      );

    const outputStatus =
      document.getElementById(
        "conversion-output-status"
      );

    if (!preview) {
      return;
    }

    const values =
      resolveFormValues();

    const sourceItems =
      values.sourceItems;

    const output =
      values.outputProduct;

    updateSourceRowsStatus(
      sourceItems
    );

    /*
     * ----------------------------------------------------------
     * COSTOS
     * ----------------------------------------------------------
     */

    const totalConversionCost =
      sourceItems.reduce(
        (
          total,
          item
        ) =>
          total +
          (
            integerOrZero(
              item.quantity
            ) *
            getProductCostPerUnit(
              item.product
            )
          ),
        0
      );

    const outputCost =
      values.outputQuantity >
        0
        ? totalConversionCost /
          values.outputQuantity
        : 0;

    /*
     * ----------------------------------------------------------
     * SALIDA
     * ----------------------------------------------------------
     */

    if (
      outputStatus
    ) {
      if (
        values.outputMode ===
        "existing"
      ) {
        if (
          output
        ) {
          outputStatus.textContent =
            `Stock actual: ${getProductStock(
              output
            )} | Costo unitario actual: ${currency(
              getProductCostPerUnit(
                output
              )
            )}`;

          outputStatus.style.color =
            "#166534";
        } else {
          outputStatus.textContent =
            values.existingOutputText
              ? "No se encontró ese producto en Inventario."
              : "Selecciona un producto existente.";

          outputStatus.style.color =
            "#b91c1c";
        }
      } else {
        outputStatus.textContent =
          "";
      }
    }

    const outputName =
      values.outputMode ===
        "existing"
        ? (
          output?.name ||
          values.existingOutputText
        )
        : values.newOutputName;

    const outputCurrentStock =
      values.outputMode ===
        "existing" &&
        output
        ? getProductStock(
          output
        )
        : 0;

    const outputResultStock =
      values.outputMode ===
        "existing"
        ? outputCurrentStock +
          values.outputQuantity
        : values.outputQuantity;

    preview.innerHTML = `
      <div class="conversion-preview-source-summary">
        <span>
          Productos consumidos
        </span>

        <strong>
          ${escapeHtml(
            buildSourceSummaryText(
              sourceItems
            ) ||
            "—"
          )}
        </strong>
      </div>

      <div>
        <span>
          Productos de origen
        </span>

        <strong>
          ${sourceItems.length}
        </strong>
      </div>

      <div>
        <span>
          Total unidades consumidas
        </span>

        <strong>
          ${values.totalSourceQuantity}
        </strong>
      </div>

      <div>
        <span>
          Costo total transferido
        </span>

        <strong>
          ${currency(
            totalConversionCost
          )}
        </strong>
      </div>

      <div>
        <span>
          Producto producido
        </span>

        <strong>
          ${escapeHtml(
            outputName ||
            "—"
          )}
        </strong>
      </div>

      <div>
        <span>
          Cantidad producida
        </span>

        <strong>
          ${values.outputQuantity}
        </strong>
      </div>

      <div>
        <span>
          Stock final salida
        </span>

        <strong>
          ${outputResultStock}
        </strong>
      </div>

      <div>
        <span>
          Costo unitario generado
        </span>

        <strong>
          ${currency(
            outputCost
          )}
        </strong>
      </div>

      <div>
        <span>
          Tipo de salida
        </span>

        <strong>
          ${
            values.outputMode ===
            "existing"
              ? "Producto existente"
              : "Producto nuevo"
          }
        </strong>
      </div>

      <div>
        <span>
          Gasto generado
        </span>

        <strong>
          $0.00
        </strong>
      </div>
    `;
  }

  /*
   * ============================================================
   * EVENTOS DEL MODAL
   * ============================================================
   */

  function bindModalEvents() {
    const form =
      document.getElementById(
        "conversion-form"
      );

    if (
      !form
    ) {
      return;
    }

    form.addEventListener(
      "input",
      event => {
        if (
          event.target.matches(
            "input, select"
          )
        ) {
          updatePreview();
        }
      }
    );

    form.addEventListener(
      "change",
      event => {
        if (
          event.target.matches(
            "input, select"
          )
        ) {
          updatePreview();
        }
      }
    );

    form.addEventListener(
      "click",
      event => {
        const addButton =
          event.target.closest(
            "#conversion-add-source"
          );

        if (
          addButton
        ) {
          addSourceRow();
          return;
        }

        const removeButton =
          event.target.closest(
            ".conversion-remove-source"
          );

        if (
          removeButton
        ) {
          removeSourceRow(
            removeButton.closest(
              ".conversion-source-row"
            )
          );
        }
      }
    );

    updateSourceRemoveButtons();
    updateModeUI();
    updatePreview();
  }

  /*
   * ============================================================
   * VALIDACIÓN
   * ============================================================
   */

  function validateValues(
    values
  ) {
    values =
      normalizeConversionValues(
        values
      );

    /*
     * ----------------------------------------------------------
     * FECHA
     * ----------------------------------------------------------
     */

    if (
      !values.operationDate
    ) {
      throw new Error(
        "Selecciona una fecha de operación válida."
      );
    }

    /*
     * ----------------------------------------------------------
     * ORÍGENES
     * ----------------------------------------------------------
     */

    if (
      !Array.isArray(
        values.sourceItems
      ) ||
      !values.sourceItems.length
    ) {
      throw new Error(
        "Debes agregar al menos un producto de origen."
      );
    }

    const sourceIds =
      new Set();

    values.sourceItems.forEach(
      (
        item,
        index
      ) => {
        const position =
          index + 1;

        if (
          !item.productText ||
          !item.product
        ) {
          throw new Error(
            `Debes seleccionar un producto válido en el producto de origen #${position}.`
          );
        }

        if (
          item.quantity <=
          0
        ) {
          throw new Error(
            `La cantidad consumida del producto "${item.product.name}" debe ser mayor que cero.`
          );
        }

        const productId =
          String(
            item.product.id ||
            ""
          ).trim();

        if (
          !productId
        ) {
          throw new Error(
            `No se pudo identificar el producto "${item.product.name}".`
          );
        }

        if (
          sourceIds.has(
            productId
          )
        ) {
          throw new Error(
            `El producto "${item.product.name}" está repetido en la conversión. Agrupa su cantidad en una sola fila.`
          );
        }

        sourceIds.add(
          productId
        );

        const stock =
          getProductStock(
            item.product
          );

        if (
          item.quantity >
          stock
        ) {
          throw new Error(
            `No hay suficiente stock de ${item.product.name}. Stock actual: ${stock}.`
          );
        }
      }
    );

    /*
     * ----------------------------------------------------------
     * SALIDA
     * ----------------------------------------------------------
     */

    if (
      values.outputQuantity <=
      0
    ) {
      throw new Error(
        "La cantidad producida debe ser mayor que cero."
      );
    }

    /*
     * ----------------------------------------------------------
     * SALIDA EXISTENTE
     * ----------------------------------------------------------
     */

    if (
      values.outputMode ===
      "existing"
    ) {
      if (
        !values.existingOutputText
      ) {
        throw new Error(
          "Debes seleccionar el producto de salida existente."
        );
      }

      if (
        !values.outputProduct
      ) {
        throw new Error(
          `No se encontró el producto existente "${values.existingOutputText}".`
        );
      }

      const outputId =
        String(
          values.outputProduct.id ||
          ""
        ).trim();

      if (
        sourceIds.has(
          outputId
        )
      ) {
        throw new Error(
          "Uno de los productos de origen no puede ser el mismo producto de salida."
        );
      }

      return;
    }

    /*
     * ----------------------------------------------------------
     * SALIDA NUEVA
     * ----------------------------------------------------------
     */

    if (
      values.outputMode ===
      "new"
    ) {
      if (
        !values.newOutputName
      ) {
        throw new Error(
          "Debes escribir el nombre del nuevo producto."
        );
      }

      const normalizedName =
        normalizeText(
          values.newOutputName
        );

      const existingByName =
        localProducts.find(
          product =>
            normalizeText(
              product.name
            ) ===
            normalizedName
        );

      if (
        existingByName
      ) {
        throw new Error(
          `"${values.newOutputName}" ya existe en Inventario. Usa el modo "Usar producto existente".`
        );
      }

      if (
        values.outputCode
      ) {
        const normalizedCode =
          normalizeText(
            values.outputCode
          );

        const existingByCode =
          localProducts.find(
            product =>
              normalizeText(
                getProductCode(
                  product
                )
              ) ===
              normalizedCode
          );

        if (
          existingByCode
        ) {
          throw new Error(
            `El código "${values.outputCode}" ya pertenece a otro producto.`
          );
        }
      }

      return;
    }

    throw new Error(
      "El modo de producto de salida no es válido."
    );
  }

  /*
   * ============================================================
   * DATOS DEL LOCAL
   * ============================================================
   */

  function buildCommonLocalData() {
    const context =
      getCurrentUserContext();

    const localInfo =
      getCurrentLocalInfo();

    return {
      id_local:
        getCurrentLocalId(),

      localNombre:
        localInfo.nombre ||
        context.localNombre ||
        "",

      localNumeroDocumento:
        localInfo.numeroDocumento ||
        context.localNumeroDocumento ||
        "",

      localUbicacion:
        localInfo.ubicacion ||
        context.localUbicacion ||
        "",

      localContribuyente:
        localInfo.contribuyente ||
        context.localContribuyente ||
        "",

      localTipoDocumento:
        localInfo.tipoDocumento ||
        context.localTipoDocumento ||
        "",

      localNIT:
        localInfo.nit ||
        context.localNIT ||
        "",

      localNRC:
        localInfo.nrc ||
        context.localNRC ||
        ""
    };
  }

  /*
   * ============================================================
   * DETALLE DE COSTOS DE ORIGEN
   * ============================================================
   */

  function buildSourceCostDetails(
    sourceItems
  ) {
    return sourceItems.map(
      item => {
        const unitCost =
          getProductCostPerUnit(
            item.product
          );

        const totalCost =
          integerOrZero(
            item.quantity
          ) *
          unitCost;

        return {
          productId:
            item.product?.id ||
            "",

          productName:
            item.product?.name ||
            item.productText ||
            "",

          productCode:
            getProductCode(
              item.product
            ),

          quantity:
            integerOrZero(
              item.quantity
            ),

          stockBefore:
            getProductStock(
              item.product
            ),

          stockAfter:
            getProductStock(
              item.product
            ) -
            integerOrZero(
              item.quantity
            ),

          unitCost,

          totalCost,

          unitsPerBox:
            getProductUnitsPerBox(
              item.product
            )
        };
      }
    );
  }

  /*
   * ============================================================
   * EJECUTAR CONVERSIÓN
   * ============================================================
   */

  async function executeConversion(
    rawValues
  ) {
    const values =
      normalizeConversionValues(
        rawValues
      );

    validateValues(
      values
    );

    const user =
      getCurrentUser();

    const context =
      getCurrentUserContext();

    const localId =
      getCurrentLocalId();

    if (!user) {
      throw new Error(
        "No existe un usuario autenticado."
      );
    }

    if (!localId) {
      throw new Error(
        "No se pudo identificar el local actual."
      );
    }

    /*
     * ----------------------------------------------------------
     * REFERENCIAS DE PRODUCTOS ORIGEN
     * ----------------------------------------------------------
     */

    const sourceRefs =
      values.sourceItems.map(
        item =>
          db
            .collection(
              PRODUCTS_COLLECTION
            )
            .doc(
              item.product.id
            )
      );

    /*
     * ----------------------------------------------------------
     * REFERENCIA SALIDA
     * ----------------------------------------------------------
     */

    const outputRef =
      values.outputMode ===
        "existing"
        ? db
          .collection(
            PRODUCTS_COLLECTION
          )
          .doc(
            values.outputProduct.id
          )
        : db
          .collection(
            PRODUCTS_COLLECTION
          )
          .doc();

    /*
     * ----------------------------------------------------------
     * REFERENCIAS DE AUDITORÍA
     * ----------------------------------------------------------
     */

    const conversionRef =
      db
        .collection(
          CONVERSIONS_COLLECTION
        )
        .doc();

    const sourceMovementRefs =
      values.sourceItems.map(
        () =>
          db
            .collection(
              MOVEMENTS_COLLECTION
            )
            .doc()
      );

    const outputMovementRef =
      db
        .collection(
          MOVEMENTS_COLLECTION
        )
        .doc();

    const operationTimestamp =
      buildOperationTimestamp(
        values.operationDate
      );

    const commonLocalData =
      buildCommonLocalData();

    let result =
      null;

    /*
     * ==========================================================
     * TRANSACTION
     * ==========================================================
     */

    await db.runTransaction(
      async transaction => {
        /*
         * ------------------------------------------------------
         * LECTURAS
         * ------------------------------------------------------
         */

        const sourceSnapshots =
          [];

        for (
          const sourceRef
          of sourceRefs
        ) {
          sourceSnapshots.push(
            await transaction.get(
              sourceRef
            )
          );
        }

        const outputSnap =
          values.outputMode ===
            "existing"
            ? await transaction.get(
              outputRef
            )
            : null;

        /*
         * ------------------------------------------------------
         * DATOS ORIGEN
         * ------------------------------------------------------
         */

        const sourceRecords =
          sourceSnapshots.map(
            (
              sourceSnap,
              index
            ) => {
              if (
                !sourceSnap.exists
              ) {
                throw new Error(
                  `El producto de origen #${index + 1} ya no existe.`
                );
              }

              const sourceData =
                sourceSnap.data() ||
                {};

              if (
                !matchesCurrentLocal(
                  sourceData
                )
              ) {
                throw new Error(
                  `El producto de origen "${sourceData.name || "Producto"}" no pertenece al local actual.`
                );
              }

              const formItem =
                values.sourceItems[
                  index
                ];

              const sourceStock =
                getProductStock(
                  sourceData
                );

              const sourceQuantity =
                integerOrZero(
                  formItem.quantity
                );

              if (
                sourceQuantity >
                sourceStock
              ) {
                throw new Error(
                  `Stock insuficiente. ${sourceData.name || "Producto"} tiene ${sourceStock} y se requieren ${sourceQuantity}.`
                );
              }

              const sourceUnitsPerBox =
                Math.max(
                  1,
                  numberOrZero(
                    sourceData.unitsPerBox
                  ) || 1
                );

              const sourceCostPerUnit =
                getProductCostPerUnit(
                  sourceData
                );

              const totalCost =
                sourceQuantity *
                sourceCostPerUnit;

              const nextSourceStock =
                sourceStock -
                sourceQuantity;

              return {
                ref:
                  sourceRefs[
                    index
                  ],

                movementRef:
                  sourceMovementRefs[
                    index
                  ],

                formItem,

                sourceData,

                sourceStock,

                sourceQuantity,

                sourceUnitsPerBox,

                sourceCostPerUnit,

                totalCost,

                nextSourceStock
              };
            }
          );

        /*
         * ------------------------------------------------------
         * COSTO TOTAL DE LA CONVERSIÓN
         * ------------------------------------------------------
         */

        const totalConversionCost =
          sourceRecords.reduce(
            (
              total,
              record
            ) =>
              total +
              record.totalCost,
            0
          );

        const totalSourceQuantity =
          sourceRecords.reduce(
            (
              total,
              record
            ) =>
              total +
              record.sourceQuantity,
            0
          );

        const generatedUnitCost =
          values.outputQuantity >
            0
            ? totalConversionCost /
            values.outputQuantity
            : 0;

        /*
         * ------------------------------------------------------
         * PATCHES ORIGEN
         * ------------------------------------------------------
         */

        const sourceProductPatches =
          sourceRecords.map(
            record => ({
              quantity:
                record.nextSourceStock,

              stockCurrentUnits:
                record.nextSourceStock,

              boxes:
                Math.floor(
                  record.nextSourceStock /
                  record.sourceUnitsPerBox
                ),

              updatedAt:
                firebase.firestore
                  .FieldValue
                  .serverTimestamp(),

              ultimaConversionId:
                conversionRef.id,

              ultimaConversionTipo:
                "salida",

              fechaUltimaConversion:
                values.dateValue
            })
          );

        /*
         * ------------------------------------------------------
         * VARIABLES SALIDA
         * ------------------------------------------------------
         */

        let outputData =
          null;

        let outputProductPatch =
          null;

        let outputStockBefore =
          0;

        let outputStockAfter =
          0;

        let outputUnitCostBefore =
          0;

        let outputUnitCostAfter =
          generatedUnitCost;

        let outputUnitsPerBox =
          1;

        let outputName =
          "";

        let outputCode =
          "";

        let outputPrice =
          0;

        const sourceProductIds =
          sourceRecords.map(
            record =>
              record.ref.id
          );

        const sourceProductNames =
          sourceRecords.map(
            record =>
              String(
                record.sourceData.name ||
                ""
              ).trim()
          );

        /*
         * ======================================================
         * SALIDA EXISTENTE
         * ======================================================
         */

        if (
          values.outputMode ===
          "existing"
        ) {
          if (
            !outputSnap ||
            !outputSnap.exists
          ) {
            throw new Error(
              "El producto de salida seleccionado ya no existe."
            );
          }

          outputData =
            outputSnap.data() ||
            {};

          if (
            !matchesCurrentLocal(
              outputData
            )
          ) {
            throw new Error(
              "El producto de salida no pertenece al local actual."
            );
          }

          outputName =
            String(
              outputData.name ||
              values.existingOutputText ||
              ""
            ).trim();

          outputCode =
            getProductCode(
              outputData
            );

          outputPrice =
            Math.max(
              0,
              numberOrZero(
                outputData.price
              )
            );

          outputUnitsPerBox =
            Math.max(
              1,
              numberOrZero(
                outputData.unitsPerBox
              ) || 1
            );

          outputStockBefore =
            getProductStock(
              outputData
            );

          outputUnitCostBefore =
            getProductCostPerUnit(
              outputData
            );

          outputStockAfter =
            outputStockBefore +
            values.outputQuantity;

          /*
           * ----------------------------------------------------
           * PROMEDIO PONDERADO
           * ----------------------------------------------------
           */

          const oldInventoryValue =
            outputStockBefore *
            outputUnitCostBefore;

          const conversionInventoryValue =
            values.outputQuantity *
            generatedUnitCost;

          outputUnitCostAfter =
            outputStockAfter >
              0
              ? (
                oldInventoryValue +
                conversionInventoryValue
              ) /
              outputStockAfter
              : generatedUnitCost;

          outputProductPatch = {
            quantity:
              outputStockAfter,

            stockCurrentUnits:
              outputStockAfter,

            boxes:
              Math.floor(
                outputStockAfter /
                outputUnitsPerBox
              ),

            unitsPerBox:
              outputUnitsPerBox,

            lastCostPerUnit:
              outputUnitCostAfter,

            lastCostPerBox:
              outputUnitCostAfter *
              outputUnitsPerBox,

            updatedAt:
              firebase.firestore
                .FieldValue
                .serverTimestamp(),

            ultimoMovimientoTipo:
              "conversion_entrada",

            ultimaConversionId:
              conversionRef.id,

            fechaUltimaConversion:
              values.dateValue,

            esProductoTransformado:
              true,

            tipoProducto:
              "transformado",

            /*
             * Compatibilidad con el modelo anterior:
             * se conserva el primer producto origen
             * y además se guardan todos.
             */

            productoOrigenId:
              sourceProductIds[0] ||
              null,

            productoOrigenNombre:
              sourceProductNames.join(
                " + "
              ),

            productoOrigenIds:
              sourceProductIds,

            productoOrigenNombres:
              sourceProductNames,

            conversionMultiplesOrigenes:
              sourceProductIds.length >
              1
          };
        }

        /*
         * ======================================================
         * SALIDA NUEVA
         * ======================================================
         */

        else if (
          values.outputMode ===
          "new"
        ) {
          outputName =
            values.newOutputName;

          outputCode =
            values.outputCode;

          outputPrice =
            Math.max(
              0,
              numberOrZero(
                values.outputPrice
              )
            );

          outputUnitsPerBox =
            Math.max(
              1,
              integerOrZero(
                values.outputUnitsPerBox
              ) || 1
            );

          outputStockBefore =
            0;

          outputStockAfter =
            values.outputQuantity;

          outputUnitCostBefore =
            0;

          outputUnitCostAfter =
            generatedUnitCost;

          outputProductPatch = {
            name:
              outputName,

            codigoProducto:
              outputCode,

            productCode:
              outputCode,

            proveedorId:
              null,

            proveedorNombre:
              "",

            proveedorRazonSocial:
              "",

            quantity:
              outputStockAfter,

            stockCurrentUnits:
              outputStockAfter,

            stockBaseUnits:
              outputStockAfter,

            boxes:
              Math.floor(
                outputStockAfter /
                outputUnitsPerBox
              ),

            unitsPerBox:
              outputUnitsPerBox,

            lastCostPerUnit:
              outputUnitCostAfter,

            lastCostPerBox:
              outputUnitCostAfter *
              outputUnitsPerBox,

            price:
              outputPrice,

            ...commonLocalData,

            referenciaLibro:
              values.reference ||
              "Producción / Conversión",

            referenceBook:
              values.reference ||
              "Producción / Conversión",

            numeroDocumento:
              conversionRef.id,

            fechaOperacion:
              values.dateValue,

            esProductoTransformado:
              true,

            tipoProducto:
              "transformado",

            productoOrigenId:
              sourceProductIds[0] ||
              null,

            productoOrigenNombre:
              sourceProductNames.join(
                " + "
              ),

            productoOrigenIds:
              sourceProductIds,

            productoOrigenNombres:
              sourceProductNames,

            conversionMultiplesOrigenes:
              sourceProductIds.length >
              1,

            conversionOrigenId:
              conversionRef.id,

            createdAt:
              operationTimestamp,

            updatedAt:
              firebase.firestore
                .FieldValue
                .serverTimestamp()
          };
        }

        else {
          throw new Error(
            "El modo de salida no es válido."
          );
        }

        /*
         * ------------------------------------------------------
         * MOVIMIENTOS DE SALIDA
         * ------------------------------------------------------
         */

        const sourceMovementDataList =
          sourceRecords.map(
            record => ({
              productId:
                record.ref.id,

              productName:
                record.sourceData.name ||
                "",

              codigoProducto:
                getProductCode(
                  record.sourceData
                ),

              productCode:
                getProductCode(
                  record.sourceData
                ),

              tipoMovimiento:
                "conversion_salida",

              tipoOperacion:
                "conversion",

              conversionRole:
                "source",

              conversionId:
                conversionRef.id,

              conversionSourceProductId:
                record.ref.id,

              conversionSourceProductIds:
                sourceProductIds,

              conversionSourceProductNames:
                sourceProductNames,

              conversionOutputProductId:
                outputRef.id,

              entrada:
                0,

              salida:
                record.sourceQuantity,

              saldoAnterior:
                record.sourceStock,

              saldoActual:
                record.nextSourceStock,

              entradaPagada:
                0,

              entradaBono:
                0,

              cajas:
                0,

              boxes:
                0,

              cajasBono:
                0,

              bonusBoxes:
                0,

              unidades:
                0,

              units:
                0,

              unidadesBono:
                0,

              bonusUnits:
                0,

              unidadesPorCaja:
                record.sourceUnitsPerBox,

              unitsPerBox:
                record.sourceUnitsPerBox,

              costoUnitario:
                record.sourceCostPerUnit,

              unitCost:
                record.sourceCostPerUnit,

              costoPorUnidad:
                record.sourceCostPerUnit,

              costoPorCaja:
                record.sourceCostPerUnit *
                record.sourceUnitsPerBox,

              lastCostPerBox:
                record.sourceCostPerUnit *
                record.sourceUnitsPerBox,

              precioVenta:
                numberOrZero(
                  record.sourceData.price
                ),

              price:
                numberOrZero(
                  record.sourceData.price
                ),

              costoTotal:
                record.totalCost,

              detalle:
                [
                  `Conversión: ${buildSourceSummaryText(
                    values.sourceItems
                  )} -> ${outputName}`,

                  `Consumo: ${record.sourceQuantity} unidades`,

                  `Producto origen: ${
                    record.sourceData.name ||
                    "Producto"
                  }`,

                  `Costo unitario origen: ${currency(
                    record.sourceCostPerUnit
                  )}`,

                  `Costo transferido de este origen: ${currency(
                    record.totalCost
                  )}`,

                  `Costo total de la conversión: ${currency(
                    totalConversionCost
                  )}`,

                  `Producto resultante: ${outputName}`,

                  `Fecha de operación: ${values.dateValue}`
                ].join(
                  " | "
                ),

              fechaOperacion:
                values.dateValue,

              conversionFecha:
                values.dateValue,

              userId:
                user.uid,

              userName:
                context.name ||
                user.email ||
                "Usuario",

              ...commonLocalData,

              createdAt:
                operationTimestamp
            })
          );

        /*
         * ------------------------------------------------------
         * MOVIMIENTO DE ENTRADA
         * ------------------------------------------------------
         */

        const outputMovementData = {
          productId:
            outputRef.id,

          productName:
            outputName,

          codigoProducto:
            outputCode,

          productCode:
            outputCode,

          tipoMovimiento:
            "conversion_entrada",

          tipoOperacion:
            "conversion",

          conversionRole:
            "output",

          conversionId:
            conversionRef.id,

          /*
           * Campos antiguos conservados para compatibilidad.
           */

          conversionSourceProductId:
            sourceProductIds[0] ||
            null,

          conversionSourceProductIds:
            sourceProductIds,

          conversionSourceProductNames:
            sourceProductNames,

          conversionOutputProductId:
            outputRef.id,

          entrada:
            values.outputQuantity,

          salida:
            0,

          saldoAnterior:
            outputStockBefore,

          saldoActual:
            outputStockAfter,

          entradaPagada:
            values.outputQuantity,

          entradaBono:
            0,

          cajas:
            Math.floor(
              values.outputQuantity /
              outputUnitsPerBox
            ),

          boxes:
            Math.floor(
              values.outputQuantity /
              outputUnitsPerBox
            ),

          cajasBono:
            0,

          bonusBoxes:
            0,

          unidades:
            values.outputQuantity %
            outputUnitsPerBox,

          units:
            values.outputQuantity %
            outputUnitsPerBox,

          unidadesBono:
            0,

          bonusUnits:
            0,

          unidadesPorCaja:
            outputUnitsPerBox,

          unitsPerBox:
            outputUnitsPerBox,

          costoUnitario:
            outputUnitCostAfter,

          unitCost:
            outputUnitCostAfter,

          costoPorUnidad:
            outputUnitCostAfter,

          costoPorCaja:
            outputUnitCostAfter *
            outputUnitsPerBox,

          lastCostPerBox:
            outputUnitCostAfter *
            outputUnitsPerBox,

          precioVenta:
            outputPrice,

          price:
            outputPrice,

          costoTotal:
            values.outputQuantity *
            outputUnitCostAfter,

          proveedorId:
            null,

          proveedorNombre:
            "",

          proveedorRazonSocial:
            "",

          detalle:
            [
              `Conversión: ${buildSourceSummaryText(
                values.sourceItems
              )} -> ${outputName}`,

              `Producción: ${values.outputQuantity} unidades`,

              `Costo total consumido: ${currency(
                totalConversionCost
              )}`,

              `Costo unitario generado: ${currency(
                outputUnitCostAfter
              )}`,

              `Costo total generado: ${currency(
                values.outputQuantity *
                outputUnitCostAfter
              )}`,

              `Tipo de producto: ${
                values.outputMode ===
                "new"
                  ? "Nuevo"
                  : "Existente"
              }`,

              `Fecha de operación: ${values.dateValue}`
            ].join(
              " | "
            ),

          fechaOperacion:
            values.dateValue,

          conversionFecha:
            values.dateValue,

          userId:
            user.uid,

          userName:
            context.name ||
            user.email ||
            "Usuario",

          ...commonLocalData,

          createdAt:
            operationTimestamp
        };

        /*
         * ------------------------------------------------------
         * DATOS DE ORIGEN PARA TRAZABILIDAD
         * ------------------------------------------------------
         */

        const sourceDetails =
          sourceRecords.map(
            record => ({
              productId:
                record.ref.id,

              productName:
                record.sourceData.name ||
                "",

              productCode:
                getProductCode(
                  record.sourceData
                ),

              quantity:
                record.sourceQuantity,

              stockBefore:
                record.sourceStock,

              stockAfter:
                record.nextSourceStock,

              costPerUnit:
                record.sourceCostPerUnit,

              totalCost:
                record.totalCost,

              unitsPerBox:
                record.sourceUnitsPerBox
            })
          );

        /*
         * ------------------------------------------------------
         * DOCUMENTO CONVERSIÓN
         * ------------------------------------------------------
         */

        const conversionData = {
          tipo:
            "conversion",

          estado:
            "completada",

          /*
           * Campos antiguos:
           * se conservan tomando el primer origen.
           */

          sourceProductId:
            sourceProductIds[0] ||
            null,

          sourceProductName:
            sourceProductNames[0] ||
            "",

          sourceProductCode:
            sourceRecords[0]
              ? getProductCode(
                sourceRecords[0].sourceData
              )
              : "",

          sourceQuantity:
            sourceRecords[0]
              ? sourceRecords[0].sourceQuantity
              : 0,

          sourceStockBefore:
            sourceRecords[0]
              ? sourceRecords[0].sourceStock
              : 0,

          sourceStockAfter:
            sourceRecords[0]
              ? sourceRecords[0].nextSourceStock
              : 0,

          sourceCostPerUnit:
            sourceRecords[0]
              ? sourceRecords[0].sourceCostPerUnit
              : 0,

          /*
           * Nuevos campos múltiples.
           */

          sourceProducts:
            sourceDetails,

          sourceProductIds:
            sourceProductIds,

          sourceProductNames:
            sourceProductNames,

          sourceCount:
            sourceRecords.length,

          sourceTotalQuantity:
            totalSourceQuantity,

          sourceTotalCost:
            totalConversionCost,

          totalConversionCost:
            totalConversionCost,

          outputProductId:
            outputRef.id,

          outputProductName:
            outputName,

          outputProductCode:
            outputCode,

          outputQuantity:
            values.outputQuantity,

          outputStockBefore:
            outputStockBefore,

          outputStockAfter:
            outputStockAfter,

          generatedUnitCost:
            generatedUnitCost,

          outputUnitCostBefore:
            outputUnitCostBefore,

          outputUnitCostAfter:
            outputUnitCostAfter,

          outputMode:
            values.outputMode,

          outputWasCreated:
            values.outputMode ===
            "new",

          multipleSourceProducts:
            sourceRecords.length >
            1,

          reference:
            values.reference ||
            "Producción / Conversión",

          fechaOperacion:
            values.dateValue,

          userId:
            user.uid,

          userName:
            context.name ||
            user.email ||
            "Usuario",

          ...commonLocalData,

          sourceMovementIds:
            sourceMovementRefs.map(
              ref =>
                ref.id
            ),

          outputMovementId:
            outputMovementRef.id,

          createdAt:
            operationTimestamp,

          updatedAt:
            firebase.firestore
              .FieldValue
              .serverTimestamp()
        };

        /*
         * ------------------------------------------------------
         * ACTUALIZAR TODOS LOS PRODUCTOS ORIGEN
         * ------------------------------------------------------
         */

        sourceRecords.forEach(
          (
            record,
            index
          ) => {
            transaction.update(
              record.ref,
              {
                ...sourceProductPatches[
                  index
                ],

                ...commonLocalData
              }
            );
          }
        );

        /*
         * ------------------------------------------------------
         * ACTUALIZAR / CREAR PRODUCTO SALIDA
         * ------------------------------------------------------
         */

        if (
          values.outputMode ===
          "existing"
        ) {
          transaction.update(
            outputRef,
            {
              ...outputProductPatch,

              ...commonLocalData
            }
          );
        } else {
          transaction.set(
            outputRef,
            {
              ...outputProductPatch,

              ...commonLocalData,

              id_local:
                localId
            }
          );
        }

        /*
         * ------------------------------------------------------
         * MOVIMIENTOS DE SALIDA
         * ------------------------------------------------------
         */

        sourceMovementDataList.forEach(
          (
            movementData,
            index
          ) => {
            transaction.set(
              sourceMovementRefs[
                index
              ],
              movementData
            );
          }
        );

        /*
         * ------------------------------------------------------
         * MOVIMIENTO DE ENTRADA
         * ------------------------------------------------------
         */

        transaction.set(
          outputMovementRef,
          outputMovementData
        );

        /*
         * ------------------------------------------------------
         * TRAZABILIDAD
         * ------------------------------------------------------
         */

        transaction.set(
          conversionRef,
          conversionData
        );

        /*
         * ------------------------------------------------------
         * PRODUCTOS RESULTANTES LOCALES
         * ------------------------------------------------------
         */

        const sourceProductDataList =
          sourceRecords.map(
            (
              record,
              index
            ) => ({
              ...record.sourceData,

              ...sourceProductPatches[
                index
              ],

              ...commonLocalData,

              id:
                record.ref.id,

              quantity:
                record.nextSourceStock,

              stockCurrentUnits:
                record.nextSourceStock,

              boxes:
                Math.floor(
                  record.nextSourceStock /
                  record.sourceUnitsPerBox
                )
            })
          );

        const outputProductData = {
          ...(outputData || {}),

          ...outputProductPatch,

          ...commonLocalData,

          id:
            outputRef.id,

          name:
            outputName,

          codigoProducto:
            outputCode,

          productCode:
            outputCode,

          quantity:
            outputStockAfter,

          stockCurrentUnits:
            outputStockAfter,

          boxes:
            Math.floor(
              outputStockAfter /
              outputUnitsPerBox
            ),

          unitsPerBox:
            outputUnitsPerBox,

          lastCostPerUnit:
            outputUnitCostAfter,

          lastCostPerBox:
            outputUnitCostAfter *
            outputUnitsPerBox,

          price:
            outputPrice
        };

        /*
         * ------------------------------------------------------
         * RESULTADO LOCAL
         * ------------------------------------------------------
         */

        result = {
          conversionId:
            conversionRef.id,

          sourceMovementIds:
            sourceMovementRefs.map(
              ref =>
                ref.id
            ),

          outputMovementId:
            outputMovementRef.id,

          /*
           * Compatibilidad con llamadas
           * que esperaban un solo ID.
           */

          sourceMovementId:
            sourceMovementRefs[0]
              ?.id ||
            null,

          sourceProductId:
            sourceProductIds[0] ||
            null,

          sourceProductName:
            sourceProductNames[0] ||
            "",

          sourceQuantity:
            sourceRecords[0]
              ? sourceRecords[0].sourceQuantity
              : 0,

          sourceProductIds:
            sourceProductIds,

          sourceProductNames:
            sourceProductNames,

          sourceProducts:
            sourceDetails,

          sourceCount:
            sourceRecords.length,

          sourceTotalQuantity:
            totalSourceQuantity,

          sourceStockBefore:
            sourceRecords[0]
              ? sourceRecords[0].sourceStock
              : 0,

          sourceStockAfter:
            sourceRecords[0]
              ? sourceRecords[0].nextSourceStock
              : 0,

          sourceCostPerUnit:
            sourceRecords[0]
              ? sourceRecords[0].sourceCostPerUnit
              : 0,

          sourceTotalCost:
            totalConversionCost,

          totalConversionCost:
            totalConversionCost,

          outputProductId:
            outputRef.id,

          outputProductName:
            outputName,

          outputQuantity:
            values.outputQuantity,

          outputStockBefore:
            outputStockBefore,

          outputStockAfter:
            outputStockAfter,

          generatedUnitCost:
            generatedUnitCost,

          outputUnitCostAfter:
            outputUnitCostAfter,

          outputMode:
            values.outputMode,

          outputWasCreated:
            values.outputMode ===
            "new",

          outputPrice:
            outputPrice,

          outputCode:
            outputCode,

          multipleSourceProducts:
            sourceRecords.length >
            1,

          sourceProductDataList,

          /*
           * Compatibilidad con el resultado
           * anterior: sourceProductData.
           */

          sourceProductData:
            sourceProductDataList[0] ||
            null,

          outputProductData,

          sourceMovementDataList,

          /*
           * Compatibilidad con el resultado
           * anterior.
           */

          sourceMovementData:
            sourceMovementDataList[0] ||
            null,

          outputMovementData,

          conversionData
        };
      }
    );

    /*
     * ==========================================================
     * VALIDACIÓN DEL RESULTADO
     * ==========================================================
     */

    if (!result) {
      throw new Error(
        "No se pudo completar la conversión."
      );
    }

    /*
     * ==========================================================
     * ACTUALIZAR CACHÉ DE PRODUCTOS
     * ==========================================================
     */

    result.sourceProductDataList.forEach(
      sourceProductData => {
        upsertSessionDocument(
          PRODUCTS_COLLECTION,
          sourceProductData.id,
          sourceProductData
        );
      }
    );

    upsertSessionDocument(
      PRODUCTS_COLLECTION,
      result.outputProductId,
      result.outputProductData
    );

    /*
     * ==========================================================
     * ACTUALIZAR CACHÉ DE MOVIMIENTOS
     * ==========================================================
     */

    result.sourceMovementDataList.forEach(
      (
        movementData,
        index
      ) => {
        upsertSessionDocument(
          MOVEMENTS_COLLECTION,
          result.sourceMovementIds[
            index
          ],
          {
            ...movementData,

            createdAt:
              operationTimestamp.toMillis()
          }
        );
      }
    );

    upsertSessionDocument(
      MOVEMENTS_COLLECTION,
      result.outputMovementId,
      {
        ...result.outputMovementData,

        createdAt:
          operationTimestamp.toMillis()
      }
    );

    /*
     * ==========================================================
     * ACTUALIZAR CACHÉ DE CONVERSIONES
     * ==========================================================
     */

    upsertSessionDocument(
      CONVERSIONS_COLLECTION,
      result.conversionId,
      {
        ...result.conversionData,

        createdAt:
          operationTimestamp.toMillis(),

        updatedAt:
          Date.now()
      }
    );

    /*
     * ==========================================================
     * ACTUALIZAR COLECCIÓN LOCAL EN MEMORIA
     * ==========================================================
     */

    const sourceIdsToRemove =
      new Set(
        result.sourceProductIds.map(
          id =>
            String(
              id
            )
        )
      );

    localProducts =
      localProducts.filter(
        product => {
          const productId =
            String(
              product.id ||
              ""
            );

          return (
            !sourceIdsToRemove.has(
              productId
            ) &&
            productId !==
              String(
                result.outputProductId
              )
          );
        }
      );

    result.sourceProductDataList.forEach(
      sourceProductData => {
        localProducts.push(
          sourceProductData
        );
      }
    );

    localProducts.push(
      result.outputProductData
    );

    localProducts.sort(
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

    return result;
  }

  /*
   * ============================================================
   * MODAL PRINCIPAL
   * ============================================================
   */

  async function openConversionModal() {
    const storedUser =
      getCurrentUserContext();

    const role =
      String(
        storedUser.role ||
        storedUser.position ||
        ""
      )
        .trim()
        .toLowerCase();

    const canEdit =
      role ===
        "administrador" ||
      role ===
        "admin" ||
      role ===
        "bodega";

    if (!canEdit) {
      await Swal.fire(
        "Sin permisos",
        "Solo Administrador o Bodega pueden realizar conversiones.",
        "warning"
      );

      return null;
    }

    if (!getCurrentLocalId()) {
      await Swal.fire(
        "Sin local",
        "No se pudo identificar el local actual.",
        "error"
      );

      return null;
    }

    loadLocalProducts();

    if (!localProducts.length) {
      await Swal.fire(
        "Sin productos",
        "Primero debes registrar al menos un producto de origen.",
        "warning"
      );

      return null;
    }

    const result =
      await Swal.fire({
        title:
          "Convertir productos",

        html:
          buildModalHtml(),

        width:
          "1050px",

        showCancelButton:
          true,

        confirmButtonText:
          "Ejecutar conversión",

        cancelButtonText:
          "Cancelar",

        focusConfirm:
          false,

        customClass: {
          popup:
            "inventory-conversion-modal"
        },

        didOpen:
          () => {
            bindModalEvents();
          },

        preConfirm:
          () => {
            const values =
              resolveFormValues();

            try {
              validateValues(
                values
              );

              return values;
            } catch (
              error
            ) {
              Swal.showValidationMessage(
                escapeHtml(
                  error.message ||
                  "Los datos de la conversión no son válidos."
                )
              );

              return false;
            }
          }
      });

    if (
      !result.isConfirmed
    ) {
      return null;
    }

    /*
     * ==========================================================
     * EJECUCIÓN
     * ==========================================================
     */

    try {
      Swal.fire({
        title:
          "Ejecutando conversión",

        text:
          "Actualizando todos los productos de origen, producto resultante, movimientos y trazabilidad.",

        allowOutsideClick:
          false,

        allowEscapeKey:
          false,

        didOpen:
          () => {
            Swal.showLoading();
          }
      });

      const conversionResult =
        await executeConversion(
          result.value
        );

      Swal.close();

      /*
       * --------------------------------------------------------
       * RECARGAR INVENTARIO
       * --------------------------------------------------------
       */

      if (
        window.InventoryMVC
          ?.controllers
          ?.inventory
          ?.reload &&
        typeof window.InventoryMVC
          .controllers
          .inventory
          .reload ===
          "function"
      ) {
        await window.InventoryMVC
          .controllers
          .inventory
          .reload();
      }

      /*
       * --------------------------------------------------------
       * CONSTRUIR DETALLE DE RESULTADO
       * --------------------------------------------------------
       */

      const sourceRowsHtml =
        conversionResult
          .sourceProducts
          .map(
            source => `
              <tr>
                <td>
                  ${escapeHtml(
                    source.productName
                  )}
                </td>

                <td>
                  ${source.quantity}
                </td>

                <td>
                  ${currency(
                    source.costPerUnit
                  )}
                </td>

                <td>
                  ${currency(
                    source.totalCost
                  )}
                </td>
              </tr>
            `
          )
          .join("");

      /*
       * --------------------------------------------------------
       * RESULTADO
       * --------------------------------------------------------
       */

      await Swal.fire({
        icon:
          "success",

        title:
          "Conversión completada",

        html:
          `
            <div
              style="
                text-align:left;
              "
            >

              <p>
                <strong>
                  Productos consumidos
                </strong>
              </p>

              <div
                style="
                  overflow-x:auto;
                  margin-bottom:16px;
                "
              >
                <table
                  style="
                    width:100%;
                    border-collapse:collapse;
                    font-size:13px;
                  "
                >
                  <thead>
                    <tr>
                      <th
                        style="
                          text-align:left;
                          padding:6px;
                          border-bottom:1px solid #ddd;
                        "
                      >
                        Producto
                      </th>

                      <th
                        style="
                          text-align:right;
                          padding:6px;
                          border-bottom:1px solid #ddd;
                        "
                      >
                        Cantidad
                      </th>

                      <th
                        style="
                          text-align:right;
                          padding:6px;
                          border-bottom:1px solid #ddd;
                        "
                      >
                        Costo unitario
                      </th>

                      <th
                        style="
                          text-align:right;
                          padding:6px;
                          border-bottom:1px solid #ddd;
                        "
                      >
                        Costo transferido
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    ${sourceRowsHtml}
                  </tbody>
                </table>
              </div>

              <p>
                Total unidades consumidas:
                <strong>
                  ${conversionResult.sourceTotalQuantity}
                </strong>
              </p>

              <p>
                Costo total transferido:
                <strong>
                  ${currency(
                    conversionResult.totalConversionCost
                  )}
                </strong>
              </p>

              <hr>

              <p>
                Producto producido:
                <strong>
                  ${escapeHtml(
                    conversionResult.outputProductName
                  )}
                </strong>
              </p>

              <p>
                Cantidad producida:
                <strong>
                  ${conversionResult.outputQuantity}
                </strong>
                unidades
              </p>

              <p>
                Tipo:
                <strong>
                  ${
                    conversionResult.outputWasCreated
                      ? "Producto nuevo"
                      : "Producto existente"
                  }
                </strong>
              </p>

              <p>
                Costo unitario generado:
                <strong>
                  ${currency(
                    conversionResult.generatedUnitCost
                  )}
                </strong>
              </p>

              <p>
                Costo unitario final:
                <strong>
                  ${currency(
                    conversionResult.outputUnitCostAfter
                  )}
                </strong>
              </p>

              <p>
                Stock final del producto resultante:
                <strong>
                  ${conversionResult.outputStockAfter}
                </strong>
                unidades
              </p>

              ${
                conversionResult.outputWasCreated
                  ? `
                    <p
                      style="
                        color:#166534;
                        font-weight:700;
                      "
                    >
                      El producto fue creado
                      automáticamente y ya está
                      disponible en Inventario y Ventas.
                    </p>
                  `
                  : `
                    <p
                      style="
                        color:#166534;
                        font-weight:700;
                      "
                    >
                      El stock y costo del producto
                      existente fueron actualizados.
                    </p>
                  `
              }

              <p>
                Movimientos de salida generados:
                <strong>
                  ${conversionResult.sourceMovementIds.length}
                </strong>
              </p>

              <p>
                Movimiento de entrada generado:
                <strong>
                  1
                </strong>
              </p>

              <p>
                Gasto generado:
                <strong>
                  $0.00
                </strong>
              </p>

            </div>
          `,

        confirmButtonText:
          "Aceptar"
      });

      return conversionResult;

    } catch (
      error
    ) {
      Swal.close();

      console.error(
        "Error ejecutando conversión:",
        error
      );

      await Swal.fire(
        "Error",
        error.message ||
        "No se pudo completar la conversión.",
        "error"
      );

      return null;
    }
  }

  /*
   * ============================================================
   * ESTILOS
   * ============================================================
   */

  function injectConversionStyles() {
    if (
      document.getElementById(
        "inventoryConversionStyles"
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "inventoryConversionStyles";

    style.textContent = `
      .inventory-conversion-modal {
        max-height:94vh !important;
        overflow-y:auto !important;
      }

      .conversion-info-box {
        text-align:left;
        padding:12px;
        margin-bottom:14px;
        border:1px solid #bfdbfe;
        border-radius:12px;
        background:#eff6ff;
        color:#374151;
        font-size:.8rem;
        line-height:1.45;
      }

      .conversion-info-box strong {
        color:#1d4ed8;
        font-size:.95rem;
      }

      .conversion-info-box p {
        margin:5px 0;
      }

      .conversion-grid {
        display:grid;
        grid-template-columns:
          repeat(2,minmax(0,1fr));
        gap:10px;
        text-align:left;
      }

      .conversion-full {
        grid-column:span 2;
      }

      .conversion-source-section {
        border:1px solid #e5e7eb;
        border-radius:12px;
        padding:12px;
        background:#ffffff;
      }

      .conversion-section-header {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-bottom:10px;
      }

      .conversion-section-header > div {
        display:flex;
        flex-direction:column;
        gap:3px;
      }

      .conversion-section-header strong {
        color:#111827;
        font-size:.95rem;
      }

      .conversion-section-header small {
        color:#6b7280;
        font-size:.75rem;
      }

      .conversion-add-source {
        border:0;
        border-radius:8px;
        padding:8px 12px;
        background:#1d4ed8;
        color:#ffffff;
        font-weight:700;
        cursor:pointer;
      }

      .conversion-add-source:hover {
        opacity:.92;
      }

      .conversion-source-row {
        position:relative;
        display:grid;
        grid-template-columns:
          92px
          minmax(0,2fr)
          minmax(150px,1fr)
          34px;
        gap:10px;
        padding:10px;
        margin-top:8px;
        border:1px solid #e5e7eb;
        border-radius:10px;
        background:#f8fafc;
        align-items:start;
      }

      .conversion-source-row-number {
        display:flex;
        align-items:center;
        min-height:38px;
        color:#374151;
        font-size:.8rem;
      }

      .conversion-source-row-number strong {
        font-size:.8rem;
      }

      .conversion-remove-source {
        width:32px;
        height:32px;
        border:1px solid #fecaca;
        border-radius:8px;
        background:#fef2f2;
        color:#b91c1c;
        font-size:20px;
        line-height:1;
        cursor:pointer;
      }

      .conversion-remove-source:hover:not(:disabled) {
        background:#fee2e2;
      }

      .conversion-remove-source:disabled {
        opacity:.45;
        cursor:not-allowed;
      }

      .conversion-preview {
        display:grid;
        grid-template-columns:
          repeat(3,minmax(0,1fr));
        gap:10px;
        padding:12px;
        border:1px solid #e5e7eb;
        border-radius:12px;
        background:#f8fafc;
      }

      .conversion-preview > div {
        display:flex;
        flex-direction:column;
        gap:4px;
        color:#64748b;
        font-size:.76rem;
      }

      .conversion-preview strong {
        color:#111827;
        font-size:.92rem;
      }

      .conversion-preview-source-summary {
        grid-column:span 3;
      }

      .conversion-preview-source-summary strong {
        line-height:1.4;
      }

      .conversion-new-only {
        display:none;
      }

      #conversion-output-status {
        min-height:17px;
        font-weight:600;
      }

      .conversion-source-status {
        min-height:17px;
        font-weight:600;
      }

      .conversion-source-stock {
        min-height:17px;
      }

      @media (max-width:850px) {
        .conversion-source-row {
          grid-template-columns:
            1fr 1fr 34px;
        }

        .conversion-source-row-number {
          grid-column:span 2;
          min-height:auto;
        }

        .conversion-remove-source {
          grid-column:3;
          grid-row:1;
        }
      }

      @media (max-width:700px) {
        .conversion-grid {
          grid-template-columns:1fr;
        }

        .conversion-full {
          grid-column:span 1;
        }

        .conversion-preview {
          grid-template-columns:1fr;
        }

        .conversion-preview-source-summary {
          grid-column:span 1;
        }

        .conversion-section-header {
          flex-direction:column;
          align-items:stretch;
        }

        .conversion-add-source {
          width:100%;
        }

        .conversion-source-row {
          grid-template-columns:1fr 34px;
        }

        .conversion-source-row-number {
          grid-column:1;
          grid-row:1;
        }

        .conversion-remove-source {
          grid-column:2;
          grid-row:1;
        }

        .conversion-source-row .inv-field:nth-child(2) {
          grid-column:span 2;
        }

        .conversion-source-quantity-field {
          grid-column:span 2;
        }
      }
    `;

    document.head.appendChild(
      style
    );
  }

  /*
   * ============================================================
   * API PÚBLICA
   * ============================================================
   */

  const api = {
    name:
      "conversion",

    loadLocalProducts,

    openConversionModal,

    executeConversion
  };

  window.InventoryConversions =
    api;

  window.InventoryMVC =
    window.InventoryMVC ||
    {
      models: {},

      views: {},

      controllers: {}
    };

  injectConversionStyles();

})();