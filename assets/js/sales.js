// assets/js/sales.js
const db = firebase.firestore();
const productSelect = document.getElementById('productSelect');
const saleQuantity = document.getElementById('saleQuantity');
const addProductButton = document.getElementById('addProductButton');
const cartTable = document.getElementById('cartTable').getElementsByTagName('tbody')[0];
const registerSaleButton = document.getElementById('registerSaleButton');
const salesTable = document.getElementById('salesTable').getElementsByTagName('tbody')[0];

let cart = []; // Lista de productos en la venta actual

// Cargar productos en el selector
function loadProducts() {
    db.collection("productos").get().then((querySnapshot) => {
        productSelect.innerHTML = ''; // Limpiar antes de llenar
        querySnapshot.forEach((doc) => {
            const product = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = `${product.name} - $${product.price}`;
            productSelect.appendChild(option);
        });
    });
}

// Agregar producto al carrito
function addToCart() {
    const productId = productSelect.value;
    const quantity = parseInt(saleQuantity.value);

    if (!productId || quantity <= 0) {
        alert("Selecciona un producto y una cantidad válida.");
        return;
    }

    db.collection("productos").doc(productId).get().then((doc) => {
        if (doc.exists) {
            const product = doc.data();

            // Verificar stock
            if (quantity > product.quantity) {
                alert("No hay suficiente stock.");
                return;
            }

            // Agregar al carrito
            const existingProduct = cart.find(item => item.productId === productId);
            if (existingProduct) {
                existingProduct.quantity += quantity;
                existingProduct.total += quantity * product.price;
            } else {
                cart.push({
                    productId,
                    productName: product.name,
                    quantity,
                    price: product.price,
                    total: quantity * product.price
                });
            }

            updateCartTable();
        }
    });
}

// Actualizar tabla del carrito
function updateCartTable() {
    cartTable.innerHTML = "";
    cart.forEach((item, index) => {
        const row = cartTable.insertRow();
        row.innerHTML = `
            <td>${item.productName}</td>
            <td>${item.quantity}</td>
            <td>$${item.total.toFixed(2)}</td>
            <td><button onclick="removeFromCart(${index})">🗑️</button></td>
        `;
    });
}

// Eliminar producto del carrito
function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartTable();
}

// Registrar la venta final
registerSaleButton.addEventListener("click", function () {
    if (cart.length === 0) {
        alert("Agrega productos antes de registrar la venta.");
        return;
    }

    const totalSale = cart.reduce((sum, item) => sum + item.total, 0);

    db.collection("ventas").add({
        products: cart,
        total: totalSale,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        // Actualizar stock en la base de datos
        cart.forEach(item => {
            db.collection("productos").doc(item.productId).update({
                quantity: firebase.firestore.FieldValue.increment(-item.quantity)
            });
        });

        // Limpiar carrito y recargar ventas
        cart = [];
        updateCartTable();
        loadSales();
        alert("Venta registrada correctamente.");
    });
});

// Cargar ventas en la tabla de historial
function loadSales() {
    db.collection("ventas").orderBy("timestamp", "desc").onSnapshot((querySnapshot) => {
        salesTable.innerHTML = ''; // Limpiar la tabla
        querySnapshot.forEach((doc) => {
            const sale = doc.data();

            // Verificar si sale.products es un array antes de usar .map()
            const productsList = Array.isArray(sale.products)
                ? sale.products.map(p => `<li>${p.productName}</li>`).join('')
                : "<li>Datos no disponibles</li>";
            const productsList2 = Array.isArray(sale.products)
                ? sale.products.map(p => `<li>x${p.quantity}</li>`).join('')
                : "<li>Datos no disponibles</li>";
            const row = salesTable.insertRow();
            row.innerHTML = `
                <td><ul>${productsList}</ul></td>
                <td><ul>${productsList2}</ul></td>
                <td>$${sale.total.toFixed(2)}</td>
            `;
        });
    });
}

// Agregar evento para el botón de agregar producto al carrito
addProductButton.addEventListener("click", addToCart);

// Cargar los productos y ventas al iniciar
loadProducts();
loadSales();