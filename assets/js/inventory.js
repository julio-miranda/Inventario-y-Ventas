const db = firebase.firestore();
const inventoryTable = document.getElementById('inventoryTable').getElementsByTagName('tbody')[0];
const searchInput = document.getElementById('searchInput');
let products = [];
let currentPage = 1;
const itemsPerPage = 5;

// Cargar productos desde Firebase
function loadInventory() {
    db.collection("productos").get().then((querySnapshot) => {
        products = [];
        querySnapshot.forEach((doc) => {
            let product = { id: doc.id, ...doc.data() };
            products.push(product);
        });
        renderTable();
    });
}

// Renderizar la tabla con paginación y filtro
function renderTable() {
    let filteredProducts = products.filter(product =>
        product.name.toLowerCase().includes(searchInput.value.toLowerCase())
    );

    let start = (currentPage - 1) * itemsPerPage;
    let paginatedProducts = filteredProducts.slice(start, start + itemsPerPage);

    inventoryTable.innerHTML = "";
    paginatedProducts.forEach(product => {
        let row = inventoryTable.insertRow();
        row.innerHTML = `
            <td>${product.name}</td>
            <td>${product.quantity}</td>
            <td>${product.price}</td>
            <td>
                <button onclick="editProduct('${product.id}')" style="background-color:blue;">Editar</button>
                <button onclick="deleteProduct('${product.id}')" style="background-color:red;">Eliminar</button>
            </td>
        `;
    });

    document.getElementById('pageInfo').innerText = `Página ${currentPage} de ${Math.ceil(filteredProducts.length / itemsPerPage)}`;
}

// Filtrar productos por nombre
function filterTable() {
    currentPage = 1;
    renderTable();
}

// Paginación
function nextPage() {
    let filteredProducts = products.filter(product =>
        product.name.toLowerCase().includes(searchInput.value.toLowerCase())
    );
    if (currentPage * itemsPerPage < filteredProducts.length) {
        currentPage++;
        renderTable();
    }
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
}

// Agregar o actualizar producto
document.getElementById('productForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const productId = document.getElementById('productId').value;
    const name = document.getElementById('productName').value.trim();
    const quantity = parseInt(document.getElementById('productQuantity').value);
    const price = parseFloat(document.getElementById('productPrice').value);

    if (productId) {
        db.collection("productos").doc(productId).update({ name, quantity, price }).then(() => {
            loadInventory();
            hideAddProductForm();
        });
    } else {
        db.collection("productos").where("name", "==", name).get().then(snapshot => {
            if (!snapshot.empty) {
                let doc = snapshot.docs[0];
                let newQuantity = doc.data().quantity + quantity;
                db.collection("productos").doc(doc.id).update({ quantity: newQuantity }).then(() => {
                    loadInventory();
                    hideAddProductForm();
                });
            } else {
                db.collection("productos").add({ name, quantity, price }).then(() => {
                    loadInventory();
                    hideAddProductForm();
                });
            }
        });
    }
});

// Editar producto
function editProduct(productId) {
    db.collection("productos").doc(productId).get().then((doc) => {
        let product = doc.data();
        document.getElementById('productId').value = productId;
        document.getElementById('productName').value = product.name;
        document.getElementById('productQuantity').value = product.quantity;
        document.getElementById('productPrice').value = product.price;

        document.getElementById('addProductForm').style.display = 'block';
        document.getElementById('formTitle').innerText = 'Actualizar Producto';
    });
}

// Eliminar producto
function deleteProduct(productId) {
    db.collection("productos").doc(productId).delete().then(() => {
        loadInventory();
    });
}

// Mostrar/Ocultar formulario
function showAddProductForm() {
    document.getElementById('addProductForm').style.display = 'block';
    document.querySelector('.inventory').style.display = 'none';
    document.getElementById('formTitle').innerText = 'Nuevo Producto';
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
}

function hideAddProductForm() {
    document.getElementById('addProductForm').style.display = 'none';
    document.querySelector('.inventory').style.display = 'block';
}

// Cargar inventario al inicio
loadInventory();