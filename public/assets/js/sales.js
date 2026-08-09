// assets/js/sales.js
//
// Regla de stock:
// stock disponible = stock actual guardado en el producto.
// Al finalizar la venta SÍ se descuenta el inventario en la transacción.
// Inventory lee el mismo stock actual.
// Las ventas del mes se usan solo para reportes y validación visual.
//
// Referencia a libro:
// - Se captura una referencia por venta.
// - Si el input está vacío, la referencia será "venta" por defecto.
// - Se guarda en ventas.referenciaLibro.
// - Se guarda en stock_movimientos.referenciaLibro.
// - La referencia permite identificar posteriormente el movimiento
//   correspondiente desde el dashboard.
//
// Filtro por local:
// - Solo se muestran productos del local activo
// - Las ventas del mes se agregan solo del local activo
// - Las ventas, borradores y movimientos guardan id_local y datos del local
// - El local activo se obtiene desde currentUser / helpers de app.js

const productSelect = document.getElementById('productSelect');
const saleModeSelect = document.getElementById('saleMode');
const boxPriceGroup = document.getElementById('boxPriceGroup');
const boxPriceInput = document.getElementById('boxPrice');
const saleQuantityInput = document.getElementById('saleQuantity');
const saleQuantityLabel = document.getElementById('saleQuantityLabel');
const referenciaLibroInput = document.getElementById('referenciaLibro');

const btnAddToCart = document.getElementById('btnAddToCart');
const btnClearCart = document.getElementById('btnClearCart');
const cartTableBody = document.querySelector('#cartTable tbody');
const cartSubtotalEl = document.getElementById('cartSubtotal');
const btnFinalize = document.getElementById('btnFinalize');
const btnSaveDraft = document.getElementById('btnSaveDraft');
const salesTable = document.getElementById('salesTable');
const logoutBtn = document.getElementById('logoutButton');
const userGreeting = document.querySelectorAll('.userGreeting');

let salesDataTable = null;
let PRODUCTS_CACHE = {};
let MONTHLY_SOLD_UNITS = {};
let CART = [];

let isFinalizingSale = false;
let isSavingDraft = false;
let isAddingToCart = false;

let currentLocalId = '';
let currentLocalInfo = {
  id_local: '',
  nombre: '',
  numeroDocumento: '',
  ubicacion: ''
};

const currency = (n) => `$${Number(n || 0).toFixed(2)}`;

function isTinyScreen() {
  return window.innerWidth <= 425;
}

function numberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatDateOnly(v) {
  if (!v) return '-';

  const d = v.seconds
    ? new Date(v.seconds * 1000)
    : new Date(v);

  if (isNaN(d.getTime())) return '-';

  return d.toLocaleDateString();
}

function formatTimeOnly(v) {
  if (!v) return '-';

  const d = v.seconds
    ? new Date(v.seconds * 1000)
    : new Date(v);

  if (isNaN(d.getTime())) return '-';

  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getStoredUserName() {
  try {
    const stored = JSON.parse(
      localStorage.getItem('currentUser') || 'null'
    );

    if (stored && stored.name) {
      return stored.name;
    }
  } catch {
    // ignore
  }

  if (
    auth.currentUser &&
    auth.currentUser.displayName
  ) {
    return auth.currentUser.displayName;
  }

  return null;
}

function getStoredCurrentUser() {
  try {
    return JSON.parse(
      localStorage.getItem('currentUser') || 'null'
    );
  } catch {
    return null;
  }
}

function syncLocalContextFromStorage() {
  const stored = getStoredCurrentUser();

  if (stored) {
    currentLocalId = String(
      stored.id_local ||
      stored.idLocal ||
      stored.localId ||
      ''
    ).trim();

    currentLocalInfo = {
      id_local: currentLocalId,
      nombre: String(
        stored.localNombre ||
        stored.localName ||
        ''
      ).trim(),
      numeroDocumento: String(
        stored.localNumeroDocumento ||
        stored.localDocumentNumber ||
        ''
      ).trim(),
      ubicacion: String(
        stored.localUbicacion ||
        stored.localLocation ||
        ''
      ).trim()
    };
  }

  if (
    !currentLocalId &&
    typeof window.getCurrentLocalId === 'function'
  ) {
    currentLocalId = String(
      window.getCurrentLocalId() || ''
    ).trim();
  }

  if (
    (!currentLocalInfo.nombre ||
      !currentLocalInfo.numeroDocumento ||
      !currentLocalInfo.ubicacion) &&
    typeof window.getCurrentLocalInfo === 'function'
  ) {
    const info = window.getCurrentLocalInfo() || {};

    currentLocalInfo = {
      id_local:
        currentLocalId ||
        String(info.id_local || '').trim(),

      nombre:
        String(info.nombre || '').trim(),

      numeroDocumento:
        String(info.numeroDocumento || '').trim(),

      ubicacion:
        String(info.ubicacion || '').trim()
    };
  }

  if (
    typeof window.patchStoredCurrentUser === 'function'
  ) {
    window.patchStoredCurrentUser({
      id_local: currentLocalId || '',
      localNombre: currentLocalInfo.nombre || '',
      localNumeroDocumento:
        currentLocalInfo.numeroDocumento || '',
      localUbicacion:
        currentLocalInfo.ubicacion || ''
    });
  }
}

function normalizeUnitsPerBox(prod) {
  const v = numberOrZero(
    prod && prod.unitsPerBox
  );

  return v > 0 ? v : 1;
}

function isBoxProduct(prod) {
  return !!(
    prod &&
    (
      prod.saleByBox === true ||
      prod.saleMode === 'box' ||
      prod.saleType === 'box'
    )
  );
}

function getDefaultSaleMode(prod) {
  return isBoxProduct(prod)
    ? 'box'
    : 'unit';
}

function getDefaultBoxPrice(prod) {
  const unitsPerBox =
    normalizeUnitsPerBox(prod);

  const saved =
    numberOrZero(prod && prod.boxPrice);

  if (saved > 0) {
    return saved;
  }

  return (
    numberOrZero(prod && prod.price) *
    unitsPerBox
  );
}

function getProductStockField(prod) {
  if (!prod) return 0;

  const current =
    Number(prod.stockCurrentUnits);

  if (Number.isFinite(current)) {
    return Math.max(0, current);
  }

  const qty =
    Number(prod.quantity);

  if (Number.isFinite(qty)) {
    return Math.max(0, qty);
  }

  const base =
    Number(prod.stockBaseUnits);

  if (Number.isFinite(base)) {
    return Math.max(0, base);
  }

  return 0;
}

function getAvailableUnits(prod) {
  return getProductStockField(prod);
}

function getAvailableBoxes(prod) {
  const unitsPerBox =
    normalizeUnitsPerBox(prod);

  const availableUnits =
    getAvailableUnits(prod);

  return Math.floor(
    availableUnits / unitsPerBox
  );
}

function startOfCurrentMonth() {
  const d = new Date();

  d.setDate(1);
  d.setHours(0, 0, 0, 0);

  return d;
}

function getSaleProductId(p) {
  return p &&
    (
      p.productId ||
      p.productID ||
      p.product_id ||
      p.id
    )
    ? String(
        p.productId ||
        p.productID ||
        p.product_id ||
        p.id
      )
    : '';
}

function getLocalFieldValue(data = {}) {
  return String(
    data.id_local ||
    data.idLocal ||
    data.localId ||
    data.idlocal ||
    ''
  ).trim();
}

function matchesCurrentLocal(data = {}) {
  if (!currentLocalId) {
    return false;
  }

  return (
    getLocalFieldValue(data) ===
    String(currentLocalId).trim()
  );
}

function getMovementLocalPayload() {
  return {
    id_local: currentLocalId || '',
    localNombre:
      currentLocalInfo.nombre || '',
    localNumeroDocumento:
      currentLocalInfo.numeroDocumento || '',
    localUbicacion:
      currentLocalInfo.ubicacion || ''
  };
}

/*
 * Obtiene la referencia actualmente escrita.
 *
 * Si el input está vacío, se utiliza "venta"
 * como referencia predeterminada.
 */
function getReferenciaLibro() {
  const referencia =
    String(
      referenciaLibroInput
        ? referenciaLibroInput.value
        : ''
    ).trim();

  return referencia || 'venta';
}

/*
 * Limpia la referencia después de completar
 * correctamente una venta.
 */
function clearReferenciaLibro() {
  if (referenciaLibroInput) {
    referenciaLibroInput.value = '';
  }
}

function aggregateMonthlySales(snapshot) {
  const unitsMap = {};

  snapshot.forEach(doc => {
    const sale = doc.data();

    if (!matchesCurrentLocal(sale)) {
      return;
    }

    const products =
      Array.isArray(sale.products)
        ? sale.products
        : [];

    products.forEach(p => {
      const productId =
        getSaleProductId(p);

      if (!productId) {
        return;
      }

      const unitsPerBox =
        Math.max(
          1,
          numberOrZero(p.unitsPerBox)
        );

      const mode =
        String(
          p.mode ||
          p.saleMode ||
          p.saleType ||
          ''
        ).toLowerCase();

      const qty =
        numberOrZero(p.quantity);

      const totalUnits =
        numberOrZero(
          p.unitsTotal ||
          p.totalUnits
        );

      let soldUnits = 0;

      if (mode === 'box') {
        soldUnits =
          totalUnits > 0
            ? totalUnits
            : qty * unitsPerBox;

      } else if (mode === 'unit') {
        soldUnits =
          totalUnits > 0
            ? totalUnits
            : qty;

      } else if (totalUnits > 0) {
        soldUnits = totalUnits;

      } else if (
        numberOrZero(p.boxes) > 0
      ) {
        soldUnits =
          Math.floor(
            numberOrZero(p.boxes)
          ) * unitsPerBox;

      } else {
        soldUnits = qty;
      }

      unitsMap[productId] =
        (unitsMap[productId] || 0) +
        soldUnits;
    });
  });

  return unitsMap;
}

function initSelect2() {
  if (
    !window.jQuery ||
    typeof $.fn.select2 !== 'function' ||
    !productSelect
  ) {
    return;
  }

  try {
    if (
      $(productSelect)
        .hasClass('select2-hidden-accessible')
    ) {
      return;
    }

    $('#productSelect').select2({
      placeholder: 'Buscar producto...',
      width: '100%',
      allowClear: true,
      minimumResultsForSearch: 0
    });
  } catch (err) {
    console.warn(
      'No se pudo inicializar Select2:',
      err
    );
  }
}

function refreshSaleModeUI() {
  const productId =
    productSelect
      ? productSelect.value
      : '';

  const prod =
    productId
      ? PRODUCTS_CACHE[productId]
      : null;

  const mode =
    saleModeSelect
      ? saleModeSelect.value
      : 'unit';

  if (saleQuantityLabel) {
    saleQuantityLabel.textContent =
      mode === 'box'
        ? 'Cantidad (cajas)'
        : 'Cantidad (unidades)';
  }

  if (boxPriceGroup) {
    boxPriceGroup.style.display =
      mode === 'box'
        ? 'block'
        : 'none';
  }

  if (mode === 'box') {
    if (prod) {
      boxPriceInput.value =
        getDefaultBoxPrice(prod)
          .toFixed(2);
    } else if (
      !boxPriceInput.value ||
      numberOrZero(
        boxPriceInput.value
      ) <= 0
    ) {
      boxPriceInput.value = '0.00';
    }
  }
}

function syncModeFromProduct() {
  const productId =
    productSelect
      ? productSelect.value
      : '';

  const prod =
    productId
      ? PRODUCTS_CACHE[productId]
      : null;

  if (!saleModeSelect) {
    return;
  }

  saleModeSelect.value =
    prod
      ? getDefaultSaleMode(prod)
      : 'unit';

  refreshSaleModeUI();
}

function refreshProductSelectText() {
  if (!productSelect) {
    return;
  }

  const currentValue =
    productSelect.value;

  productSelect.innerHTML = '';

  const entries =
    Object.entries(PRODUCTS_CACHE);

  if (!entries.length) {
    const opt =
      document.createElement('option');

    opt.value = '';
    opt.textContent =
      'No hay productos';

    productSelect.appendChild(opt);

    return;
  }

  entries
    .sort((a, b) =>
      String(a[1].name || '')
        .localeCompare(
          String(b[1].name || '')
        )
    )
    .forEach(([id, p]) => {
      const availableUnits =
        getAvailableUnits(p);

      const unitsPerBox =
        normalizeUnitsPerBox(p);

      const availableBoxes =
        getAvailableBoxes(p);

      const boxPrice =
        getDefaultBoxPrice(p);

      const opt =
        document.createElement('option');

      opt.value = id;

      let label =
        `${p.name || '-'} — ${currency(p.price)} c/u`;

      if (unitsPerBox > 1) {
        label +=
          ` | ${currency(boxPrice)} caja (${unitsPerBox})`;

        label +=
          ` — stock: ${availableUnits} (${availableBoxes} cajas)`;
      } else {
        label +=
          ` — stock: ${availableUnits}`;
      }

      if (isBoxProduct(p)) {
        label +=
          ' — venta por cajas';
      }

      opt.textContent = label;

      productSelect.appendChild(opt);
    });

  if (currentValue) {
    productSelect.value =
      currentValue;
  }

  if (
    window.jQuery &&
    typeof $.fn.select2 === 'function'
  ) {
    $('#productSelect')
      .trigger('change.select2');
  }
}

auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href =
      'index.html';

    return;
  }

  try {
    const stored =
      JSON.parse(
        localStorage.getItem(
          'currentUser'
        ) || 'null'
      );

    if (stored && stored.name) {
      userGreeting.forEach(b => {
        b.textContent =
          `Hola, ${stored.name} (${stored.role || ''})`;
      });
    }
  } catch {
    // ignore
  }

  syncLocalContextFromStorage();
});

function loadProductsRealtime() {
  db.collection('productos')
    .orderBy('name')
    .onSnapshot(snapshot => {
      PRODUCTS_CACHE = {};

      snapshot.forEach(doc => {
        const p = doc.data();

        if (!matchesCurrentLocal(p)) {
          return;
        }

        const currentStockUnits =
          Number.isFinite(
            Number(p.stockCurrentUnits)
          )
            ? Math.max(
                0,
                numberOrZero(
                  p.stockCurrentUnits
                )
              )
            : Number.isFinite(
                Number(p.quantity)
              )
              ? Math.max(
                  0,
                  numberOrZero(p.quantity)
                )
              : Number.isFinite(
                  Number(p.stockBaseUnits)
                )
                ? Math.max(
                    0,
                    numberOrZero(
                      p.stockBaseUnits
                    )
                  )
                : 0;

        PRODUCTS_CACHE[doc.id] = {
          id: doc.id,
          ...p,
          quantity:
            currentStockUnits,
          stockCurrentUnits:
            currentStockUnits,
          stockBaseUnits:
            numberOrZero(
              p.stockBaseUnits
            ),
          boxes:
            numberOrZero(p.boxes),
          unitsPerBox:
            normalizeUnitsPerBox(p),
          saleByBox:
            !!p.saleByBox
        };
      });

      refreshProductSelectText();
      syncModeFromProduct();
    }, err => {
      console.error(
        'Error cargando productos:',
        err
      );

      Swal.fire(
        'Error',
        'No se pudieron cargar los productos.',
        'error'
      );
    });
}

function loadMonthlySalesRealtime() {
  const monthStart =
    startOfCurrentMonth();

  db.collection('ventas')
    .where(
      'createdAt',
      '>=',
      monthStart
    )
    .onSnapshot(snapshot => {
      MONTHLY_SOLD_UNITS =
        aggregateMonthlySales(
          snapshot
        );

      refreshProductSelectText();
      syncModeFromProduct();
      renderCart();
    }, err => {
      console.error(
        'Error cargando ventas del mes:',
        err
      );

      MONTHLY_SOLD_UNITS = {};

      refreshProductSelectText();
      syncModeFromProduct();
    });
}

function getLinePrice(
  prod,
  mode,
  customBoxPrice = null
) {
  if (mode === 'box') {
    const entered =
      numberOrZero(
        customBoxPrice
      );

    if (entered > 0) {
      return entered;
    }

    return getDefaultBoxPrice(prod);
  }

  return numberOrZero(prod.price);
}

function addToCart() {
  if (isAddingToCart) {
    return;
  }

  isAddingToCart = true;

  try {
    const productId =
      productSelect
        ? productSelect.value
        : '';

    if (!productId) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'warning',
        title: 'Selecciona un producto'
      });

      return;
    }

    const prod =
      PRODUCTS_CACHE[productId];

    if (!prod) {
      Swal.fire(
        'Error',
        'Producto no encontrado en caché.',
        'error'
      );

      return;
    }

    const mode =
      saleModeSelect
        ? saleModeSelect.value
        : getDefaultSaleMode(prod);

    const qty =
      Math.max(
        1,
        Number(
          saleQuantityInput.value || 1
        )
      );

    const unitsPerBox =
      normalizeUnitsPerBox(prod);

    const availableUnits =
      getAvailableUnits(prod);

    if (
      mode === 'box' &&
      unitsPerBox <= 1
    ) {
      Swal.fire({
        icon: 'warning',
        title: 'No se puede vender por cajas',
        text:
          'Este producto no tiene unidades por caja configuradas.'
      });

      return;
    }

    const linePrice =
      getLinePrice(
        prod,
        mode,
        boxPriceInput
          ? boxPriceInput.value
          : null
      );

    const unitsToDiscount =
      mode === 'box'
        ? qty * unitsPerBox
        : qty;

    const alreadyUnitsInCart =
      CART
        .filter(
          i => i.productId === productId
        )
        .reduce(
          (sum, i) =>
            sum +
            numberOrZero(
              i.unitsTotal
            ),
          0
        );

    if (
      alreadyUnitsInCart +
      unitsToDiscount >
      availableUnits
    ) {
      Swal.fire({
        icon: 'warning',
        title: 'Stock insuficiente',
        text:
          `Stock disponible: ${availableUnits} unidades`
      });

      return;
    }

    const currentInCart =
      CART.find(i =>
        i.productId === productId &&
        i.mode === mode &&
        Number(i.price) ===
          Number(linePrice)
      );

    if (currentInCart) {
      currentInCart.quantity += qty;

      currentInCart.unitsTotal +=
        unitsToDiscount;

      currentInCart.total =
        currentInCart.quantity *
        currentInCart.price;
    } else {
      CART.push({
        productId,
        name: prod.name,
        mode,
        price: linePrice,
        quantity: qty,
        unitsPerBox,
        unitsTotal:
          unitsToDiscount,
        total:
          qty * linePrice
      });
    }

    renderCart();

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Producto añadido',
      timer: 1200,
      showConfirmButton: false
    });

    saleQuantityInput.value = 1;

    if (
      mode === 'box' &&
      productId
    ) {
      boxPriceInput.value =
        getDefaultBoxPrice(prod)
          .toFixed(2);
    }

    if (
      window.jQuery &&
      typeof $.fn.select2 === 'function'
    ) {
      $('#productSelect')
        .val(null)
        .trigger('change');
    } else if (productSelect) {
      productSelect.value = '';
    }

    refreshSaleModeUI();

  } finally {
    isAddingToCart = false;
  }
}

function updateCartSummary() {
  const subtotal =
    CART.reduce(
      (sum, item) =>
        sum +
        Number(item.total || 0),
      0
    );

  cartSubtotalEl.textContent =
    currency(subtotal);

  btnFinalize.disabled =
    CART.length === 0 ||
    isFinalizingSale;

  return subtotal;
}

function syncCartInputsLayout() {
  if (!cartTableBody) {
    return;
  }

  const widthQty =
    isTinyScreen()
      ? '100%'
      : '70px';

  const widthPrice =
    isTinyScreen()
      ? '100%'
      : '90px';

  cartTableBody
    .querySelectorAll(
      'input[data-cart-field="qty"]'
    )
    .forEach(input => {
      input.style.width =
        widthQty;
    });

  cartTableBody
    .querySelectorAll(
      'input[data-cart-field="price"]'
    )
    .forEach(input => {
      input.style.width =
        widthPrice;
    });

  cartTableBody
    .querySelectorAll(
      'button[data-cart-remove="1"]'
    )
    .forEach(btn => {
      btn.style.width =
        isTinyScreen()
          ? '100%'
          : '';
    });
}

function renderCart() {
  if (!cartTableBody) {
    return;
  }

  cartTableBody.innerHTML = '';

  if (!CART.length) {
    cartTableBody.innerHTML =
      '<tr><td colspan="5">El carrito está vacío.</td></tr>';

    cartSubtotalEl.textContent =
      currency(0);

    btnFinalize.disabled = true;

    return;
  }

  CART.forEach(
    (item, idx) => {
      const tr =
        document.createElement('tr');

      const tdName =
        document.createElement('td');

      tdName.setAttribute(
        'data-label',
        'Producto'
      );

      tdName.innerHTML = `
        ${escapeHtml(item.name)}
        <br>
        <small>
          ${
            item.mode === 'box'
              ? `${item.quantity} cajas (${item.unitsTotal} unidades)`
              : `${item.quantity} unidades`
          }
        </small>
      `;

      tr.appendChild(tdName);

      const tdQty =
        document.createElement('td');

      tdQty.setAttribute(
        'data-label',
        'Cantidad'
      );

      const qtyInput =
        document.createElement('input');

      qtyInput.type = 'number';
      qtyInput.min = 1;
      qtyInput.step = 1;
      qtyInput.inputMode = 'numeric';
      qtyInput.autocomplete = 'off';
      qtyInput.value =
        item.quantity;

      qtyInput.dataset.cartField =
        'qty';

      qtyInput.style.width =
        isTinyScreen()
          ? '100%'
          : '70px';

      qtyInput.addEventListener(
        'input',
        e => {
          const val =
            Number(e.target.value);

          if (
            !Number.isFinite(val) ||
            val < 1
          ) {
            return;
          }

          const prod =
            PRODUCTS_CACHE[
              item.productId
            ];

          const availableUnits =
            getAvailableUnits(prod);

          const unitsPerBox =
            normalizeUnitsPerBox(prod);

          const newUnitsTotal =
            item.mode === 'box'
              ? val * unitsPerBox
              : val;

          const currentInCartUnits =
            CART
              .filter(
                i =>
                  i.productId ===
                    item.productId &&
                  i !== item
              )
              .reduce(
                (sum, i) =>
                  sum +
                  numberOrZero(
                    i.unitsTotal
                  ),
                0
              );

          if (
            currentInCartUnits +
            newUnitsTotal >
            availableUnits
          ) {
            Swal.fire({
              icon: 'warning',
              title: 'Stock insuficiente',
              text:
                `Stock disponible: ${availableUnits} unidades`
            });

            e.target.value =
              item.quantity;

            return;
          }

          item.quantity = val;

          item.unitsTotal =
            newUnitsTotal;

          item.total =
            Number(item.price) *
            Number(item.quantity);

          totalCell.textContent =
            currency(item.total);

          updateCartSummary();
        }
      );

      tdQty.appendChild(
        qtyInput
      );

      tr.appendChild(tdQty);

      const tdPrice =
        document.createElement('td');

      tdPrice.setAttribute(
        'data-label',
        'Precio'
      );

      const priceInput =
        document.createElement('input');

      priceInput.type = 'number';
      priceInput.min = 0;
      priceInput.step = '0.01';
      priceInput.inputMode = 'decimal';
      priceInput.autocomplete = 'off';

      priceInput.value =
        Number(item.price)
          .toFixed(2);

      priceInput.dataset.cartField =
        'price';

      priceInput.style.width =
        isTinyScreen()
          ? '100%'
          : '90px';

      priceInput.addEventListener(
        'input',
        e => {
          const val =
            Number(e.target.value);

          if (
            !Number.isFinite(val) ||
            val < 0
          ) {
            return;
          }

          item.price = val;

          item.total =
            Number(item.price) *
            Number(item.quantity);

          totalCell.textContent =
            currency(item.total);

          updateCartSummary();
        }
      );

      tdPrice.appendChild(
        priceInput
      );

      tr.appendChild(tdPrice);

      const totalCell =
        document.createElement('td');

      totalCell.setAttribute(
        'data-label',
        'Total'
      );

      totalCell.textContent =
        currency(item.total);

      tr.appendChild(totalCell);

      const tdActions =
        document.createElement('td');

      tdActions.setAttribute(
        'data-label',
        'Acciones'
      );

      const removeBtn =
        document.createElement('button');

      removeBtn.className =
        'btn-outline';

      removeBtn.type =
        'button';

      removeBtn.dataset.cartRemove =
        '1';

      removeBtn.innerHTML =
        '<i class="fas fa-trash"></i> Quitar';

      removeBtn.style.width =
        isTinyScreen()
          ? '100%'
          : '';

      removeBtn.addEventListener(
        'click',
        () => {
          CART.splice(idx, 1);
          renderCart();
        }
      );

      tdActions.appendChild(
        removeBtn
      );

      tr.appendChild(tdActions);

      cartTableBody.appendChild(tr);
    }
  );

  updateCartSummary();
  syncCartInputsLayout();
}

function clearCart(confirmFirst = true) {
  if (!CART.length) {
    return;
  }

  if (confirmFirst) {
    Swal.fire({
      title: 'Limpiar carrito?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText:
        'Sí, limpiar',
      cancelButtonText:
        'Cancelar'
    }).then(res => {
      if (res.isConfirmed) {
        CART = [];
        renderCart();
      }
    });
  } else {
    CART = [];
    renderCart();
  }
}

async function finalizeSale() {
  if (isFinalizingSale) {
    return;
  }

  if (!CART.length) {
    Swal.fire(
      'Carrito vacío',
      'Agrega productos al carrito antes de finalizar.',
      'info'
    );

    return;
  }

  if (!currentLocalId) {
    Swal.fire(
      'Sin local',
      'No se pudo identificar el local activo.',
      'error'
    );

    return;
  }

  /*
   * Si el input está vacío, getReferenciaLibro()
   * devuelve automáticamente "venta".
   */
  const referenciaLibro =
    getReferenciaLibro();

  isFinalizingSale = true;

  btnFinalize.disabled = true;
  btnSaveDraft.disabled = true;
  btnAddToCart.disabled = true;
  btnClearCart.disabled = true;

  if (productSelect) {
    productSelect.disabled = true;
  }

  if (saleModeSelect) {
    saleModeSelect.disabled = true;
  }

  if (saleQuantityInput) {
    saleQuantityInput.disabled = true;
  }

  if (boxPriceInput) {
    boxPriceInput.disabled = true;
  }

  if (referenciaLibroInput) {
    referenciaLibroInput.disabled = true;
  }

  try {
    const summaryHtml =
      CART.map(i =>
        `<div style="display:flex;justify-content:space-between;gap:12px;">
          <span>
            ${escapeHtml(i.name)}
            x${i.quantity}
            ${i.mode === 'box'
              ? '(cajas)'
              : '(unid.)'}
          </span>

          <strong>
            ${currency(i.total)}
          </strong>
        </div>`
      ).join('');

    const total =
      CART.reduce(
        (s, i) =>
          s +
          Number(i.total),
        0
      );

    const resp =
      await Swal.fire({
        title: 'Finalizar venta',

        html:
          `<div style="text-align:left">
            ${summaryHtml}

            <hr>

            <div style="display:flex;justify-content:space-between">
              <strong>Referencia:</strong>
              <strong>${escapeHtml(referenciaLibro)}</strong>
            </div>

            <div style="display:flex;justify-content:space-between;margin-top:6px">
              <strong>Total:</strong>
              <strong>${currency(total)}</strong>
            </div>
          </div>`,

        showCancelButton: true,
        confirmButtonText:
          'Confirmar venta',
        cancelButtonText:
          'Cancelar',
        width: 500
      });

    if (!resp.isConfirmed) {
      return;
    }

    const storedUserName =
      getStoredUserName();

    const localPayload =
      getMovementLocalPayload();

    const ventaRef =
      db.collection('ventas').doc();

    await db.runTransaction(
      async (t) => {

        for (const item of CART) {
          const prodRef =
            db.collection('productos')
              .doc(item.productId);

          const prodSnap =
            await t.get(prodRef);

          if (!prodSnap.exists) {
            throw new Error(
              `El producto ${item.name} no existe.`
            );
          }

          const data =
            prodSnap.data() || {};

          if (!matchesCurrentLocal(data)) {
            throw new Error(
              `El producto ${item.name} no pertenece al local actual.`
            );
          }

          const currentUnits =
            Number.isFinite(
              Number(
                data.stockCurrentUnits
              )
            )
              ? Math.max(
                  0,
                  numberOrZero(
                    data.stockCurrentUnits
                  )
                )
              : Number.isFinite(
                  Number(data.quantity)
                )
                ? Math.max(
                    0,
                    numberOrZero(
                      data.quantity
                    )
                  )
                : Number.isFinite(
                    Number(
                      data.stockBaseUnits
                    )
                  )
                  ? Math.max(
                      0,
                      numberOrZero(
                        data.stockBaseUnits
                      )
                    )
                  : 0;

          const unitsToDiscount =
            numberOrZero(
              item.unitsTotal
            );

          if (
            unitsToDiscount >
            currentUnits
          ) {
            throw new Error(
              `Stock insuficiente para "${item.name}". Disponible: ${currentUnits}`
            );
          }

          const remainingUnits =
            currentUnits -
            unitsToDiscount;

          const unitsPerBox =
            Math.max(
              1,
              numberOrZero(
                data.unitsPerBox
              )
            );

          t.update(
            prodRef,
            {
              quantity:
                remainingUnits,

              stockCurrentUnits:
                remainingUnits,

              boxes:
                Math.floor(
                  remainingUnits /
                  unitsPerBox
                ),

              updatedAt:
                firebase.firestore
                  .FieldValue
                  .serverTimestamp()
            }
          );

          /*
           * MOVIMIENTO DE INVENTARIO
           *
           * Si no se introdujo una referencia,
           * se guarda "venta".
           */
          const movementRef =
            db.collection(
              'stock_movimientos'
            ).doc();

          t.set(
            movementRef,
            {
              productId:
                item.productId,

              productName:
                item.name,

              tipoMovimiento:
                'salida',

              referenciaLibro:
                referenciaLibro,

              numeroDocumento:
                ventaRef.id,

              entrada: 0,

              salida:
                unitsToDiscount,

              saldoAnterior:
                currentUnits,

              saldoActual:
                remainingUnits,

              detalle:
                `Salida por venta ${ventaRef.id} - Referencia: ${referenciaLibro}`,

              userId:
                (
                  auth.currentUser &&
                  auth.currentUser.uid
                )
                  ? auth.currentUser.uid
                  : null,

              userName:
                storedUserName || null,

              createdAt:
                firebase.firestore
                  .FieldValue
                  .serverTimestamp(),

              ...localPayload
            }
          );
        }

        /*
         * DOCUMENTO DE VENTA
         *
         * También se almacena la referencia.
         * Si el input estaba vacío, será "venta".
         */
        const ventaData = {
          products:
            CART.map(i => ({
              productId:
                i.productId,

              name:
                i.name,

              price:
                i.price,

              quantity:
                i.quantity,

              mode:
                i.mode,

              unitsPerBox:
                i.unitsPerBox,

              unitsTotal:
                i.unitsTotal,

              total:
                i.total
            })),

          total:
            Number(total),

          referenciaLibro:
            referenciaLibro,

          createdAt:
            firebase.firestore
              .FieldValue
              .serverTimestamp(),

          userId:
            (
              auth.currentUser &&
              auth.currentUser.uid
            )
              ? auth.currentUser.uid
              : null,

          userName:
            storedUserName || null,

          ...localPayload
        };

        t.set(
          ventaRef,
          ventaData
        );
      }
    );

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Venta registrada',
      showConfirmButton: false,
      timer: 1500
    });

    CART = [];

    clearReferenciaLibro();

    renderCart();

  } catch (err) {
    console.error(
      'Error finalizando venta:',
      err
    );

    Swal.fire(
      'Error',
      err.message ||
        'No se pudo finalizar la venta',
      'error'
    );

  } finally {
    isFinalizingSale = false;

    btnFinalize.disabled =
      CART.length === 0;

    btnSaveDraft.disabled =
      false;

    btnAddToCart.disabled =
      false;

    btnClearCart.disabled =
      false;

    if (productSelect) {
      productSelect.disabled =
        false;
    }

    if (saleModeSelect) {
      saleModeSelect.disabled =
        false;
    }

    if (saleQuantityInput) {
      saleQuantityInput.disabled =
        false;
    }

    if (boxPriceInput) {
      boxPriceInput.disabled =
        false;
    }

    if (referenciaLibroInput) {
      referenciaLibroInput.disabled =
        false;
    }
  }
}

async function saveDraft() {
  if (isSavingDraft) {
    return;
  }

  if (!CART.length) {
    Swal.fire(
      'Carrito vacío',
      'Agrega productos antes de guardar un borrador.',
      'info'
    );

    return;
  }

  if (!currentLocalId) {
    Swal.fire(
      'Sin local',
      'No se pudo identificar el local activo.',
      'error'
    );

    return;
  }

  isSavingDraft = true;
  btnSaveDraft.disabled = true;

  try {
    const storedUserName =
      getStoredUserName();

    const localPayload =
      getMovementLocalPayload();

    /*
     * Si el input está vacío, la referencia
     * predeterminada también será "venta".
     */
    const referenciaLibro =
      getReferenciaLibro();

    const draft = {
      products:
        CART.map(i => ({
          productId:
            i.productId,

          name:
            i.name,

          price:
            i.price,

          quantity:
            i.quantity,

          mode:
            i.mode,

          unitsPerBox:
            i.unitsPerBox,

          unitsTotal:
            i.unitsTotal,

          total:
            i.total
        })),

      total:
        CART.reduce(
          (s, i) =>
            s +
            Number(i.total),
          0
        ),

      referenciaLibro:
        referenciaLibro,

      createdAt:
        firebase.firestore
          .FieldValue
          .serverTimestamp(),

      userId:
        (
          auth.currentUser &&
          auth.currentUser.uid
        )
          ? auth.currentUser.uid
          : null,

      userName:
        storedUserName || null,

      ...localPayload
    };

    await db.collection(
      'ventas_borrador'
    ).add(draft);

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Borrador guardado',
      showConfirmButton: false,
      timer: 1400
    });

  } catch (err) {
    console.error(
      'Error guardando borrador:',
      err
    );

    Swal.fire(
      'Error',
      'No se pudo guardar el borrador.',
      'error'
    );

  } finally {
    isSavingDraft = false;
    btnSaveDraft.disabled = false;
  }
}

function ensureSalesDataTable() {
  if (salesDataTable) {
    return salesDataTable;
  }

  if (
    !window.jQuery ||
    !$.fn ||
    !$.fn.DataTable
  ) {
    console.warn(
      'DataTables no está cargado. Se mostrará la tabla sin DataTable.'
    );

    return null;
  }

  salesDataTable =
    $('#salesTable').DataTable({
      data: [],

      columns: [
        { title: 'Productos' },
        { title: 'Unidades' },
        { title: 'Total' },
        { title: 'Usuario' },
        { title: 'Fecha' },
        { title: 'Hora' }
      ],

      pageLength: 5,

      lengthMenu:
        [5, 10, 25, 50],

      scrollY:
        '260px',

      scrollCollapse:
        true,

      scrollX:
        false,

      autoWidth:
        false,

      orderMulti:
        true,

      order:
        [
          [4, 'desc'],
          [5, 'desc']
        ],

      dom:
        '<"sales-dt-top"lf>rt<"sales-dt-bottom"ip><"clear">',

      language: {
        search: '',
        searchPlaceholder:
          'Buscar ventas...',

        lengthMenu:
          'Mostrar _MENU_',

        info:
          'Mostrando _START_ a _END_ de _TOTAL_',

        infoEmpty:
          'No hay ventas',

        infoFiltered:
          '(filtrado de _MAX_ ventas)',

        paginate: {
          next: '›',
          previous: '‹'
        },

        zeroRecords:
          'No hay ventas'
      },

      columnDefs: [
        {
          targets: [1, 2],
          className:
            'dt-body-center'
        },

        {
          targets:
            [0, 3, 4, 5],

          className:
            'dt-body-left'
        }
      ]
    });

  return salesDataTable;
}

function renderSalesFallback(dataSet) {
  if (!salesTable) {
    return;
  }

  const tbody =
    salesTable.querySelector(
      'tbody'
    );

  if (!tbody) {
    return;
  }

  tbody.innerHTML = '';

  if (!dataSet.length) {
    tbody.innerHTML =
      '<tr><td colspan="6">No hay ventas registradas.</td></tr>';

    return;
  }

  dataSet.forEach(row => {
    const tr =
      document.createElement('tr');

    row.forEach(cell => {
      const td =
        document.createElement('td');

      td.textContent = cell;

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

function listenSalesRealtime() {
  db.collection('ventas')
    .orderBy(
      'createdAt',
      'desc'
    )
    .onSnapshot(snapshot => {
      const dataSet = [];

      snapshot.forEach(doc => {
        const v = doc.data();

        if (!matchesCurrentLocal(v)) {
          return;
        }

        const productos =
          (v.products || [])
            .map(p => p.name)
            .join(', ') ||
          '-';

        const unidades =
          (v.products || [])
            .reduce(
              (sum, p) =>
                sum +
                Number(
                  p.unitsTotal ||
                  p.quantity ||
                  0
                ),
              0
            );

        dataSet.push([
          productos,
          unidades,
          currency(v.total),
          v.userName || '-',
          formatDateOnly(
            v.createdAt
          ),
          formatTimeOnly(
            v.createdAt
          )
        ]);
      });

      const dt =
        ensureSalesDataTable();

      if (dt) {
        dt.clear();
        dt.rows.add(dataSet);
        dt.draw();
      } else {
        renderSalesFallback(
          dataSet
        );
      }

    }, err => {
      console.error(
        'Error listen ventas:',
        err
      );

      if (salesDataTable) {
        salesDataTable
          .clear()
          .draw();
      } else {
        renderSalesFallback([]);
      }
    });
}

document.addEventListener(
  'DOMContentLoaded',
  () => {
    syncLocalContextFromStorage();

    initSelect2();

    loadProductsRealtime();

    loadMonthlySalesRealtime();

    listenSalesRealtime();

    if (productSelect) {
      productSelect.addEventListener(
        'change',
        () => {
          syncModeFromProduct();
        }
      );
    }

    if (saleModeSelect) {
      saleModeSelect.addEventListener(
        'change',
        () => {
          refreshSaleModeUI();
        }
      );
    }

    if (btnAddToCart) {
      btnAddToCart.addEventListener(
        'click',
        e => {
          e.preventDefault();
          addToCart();
        }
      );
    }

    if (btnClearCart) {
      btnClearCart.addEventListener(
        'click',
        e => {
          e.preventDefault();
          clearCart(true);
        }
      );
    }

    if (btnFinalize) {
      btnFinalize.addEventListener(
        'click',
        e => {
          e.preventDefault();
          finalizeSale();
        }
      );
    }

    if (btnSaveDraft) {
      btnSaveDraft.addEventListener(
        'click',
        e => {
          e.preventDefault();
          saveDraft();
        }
      );
    }

    if (logoutBtn) {
      logoutBtn.addEventListener(
        'click',
        () => {
          auth.signOut()
            .then(() => {
              localStorage.removeItem(
                'currentUser'
              );

              window.location.href =
                'index.html';
            });
        }
      );
    }

    window.addEventListener(
      'resize',
      () => {
        syncCartInputsLayout();
      }
    );

    refreshSaleModeUI();

    renderCart();
  }
);