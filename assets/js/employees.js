const db = firebase.firestore();
const auth = firebase.auth();

const employeeSearch = document.getElementById('employeeSearch');
const employeeTableBody = document.getElementById('employeeTableBody');
const addEmployeeButton = document.getElementById('addEmployeeButton');
const newEmployeeForm = document.getElementById('newEmployeeForm');
const saveEmployeeButton = document.getElementById('saveEmployeeButton');
const cancelButton = document.getElementById('cancelButton');
const newEmployeeName = document.getElementById('newEmployeeName');
const newEmployeePosition = document.getElementById('newEmployeePosition');
const newEmployeePhone = document.getElementById('newEmployeePhone');
const newEmployeeEmail = document.getElementById('newEmployeeEmail');
const newEmployeePassword = document.getElementById('newEmployeePassword');

// Función para cargar empleados desde Firestore
function loadEmployees() {
    db.collection("empleados").get().then((querySnapshot) => {
        employeeTableBody.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const employee = doc.data();
            const row = employeeTableBody.insertRow();
            const nameCell = row.insertCell(0);
            const positionCell = row.insertCell(1);
            const phoneCell = row.insertCell(2);
            const actionsCell = row.insertCell(3);

            nameCell.textContent = employee.name;
            positionCell.textContent = employee.position;
            phoneCell.textContent = employee.phone;
            actionsCell.innerHTML = `
                <button class="editButton" data-id="${doc.id}" data-uid="${employee.uid}" data-name="${employee.name}" data-position="${employee.position}" data-phone="${employee.phone}" data-email="${employee.email}" style="background-color:blue;">Editar</button>
                <button class="deleteButton" data-id="${doc.id}" data-email="${employee.email}" style="background-color:red;">Eliminar</button>
            `;
        });

        initializeDataTable();
        addEditEventListeners();
    });
}

function initializeDataTable() {
    if ($.fn.DataTable.isDataTable("#employeeTable")) {
        $('#employeeTable').DataTable().destroy();
    }
    $('#employeeTable').DataTable({
        "paging": true,
        "searching": true,
        "ordering": true,
        "language": {
            "lengthMenu": "Mostrar _MENU_ registros",
            "zeroRecords": "No se encontraron resultados",
            "info": "Mostrando _START_ a _END_ de _TOTAL_ productos",
            "infoFiltered": "(filtrado de _MAX_ total)",
            "search": "Buscar:",
            paginate: {
                first: "Primero",
                last: "Último",
                next: "Siguiente",
                previous: "Anterior"
            }
        }
    });
}

// Función para registrar un nuevo empleado
saveEmployeeButton.addEventListener('click', () => {
    const name = newEmployeeName.value;
    const position = newEmployeePosition.value;
    const phone = newEmployeePhone.value;
    const email = newEmployeeEmail.value;
    const password = newEmployeePassword.value;

    if (name && position && phone && email && password) {
        // Registrar en Firebase Authentication
        auth.createUserWithEmailAndPassword(email, password).then((userCredential) => {
            const user = userCredential.user;
            // Registrar los datos del empleado en Firestore
            db.collection("empleados").add({
                name: name,
                position: position,
                email: email,
                phone: phone,
                uid: user.uid
            }).then(() => {
                alert("Empleado registrado");
                window.location.href = 'employee.html';
            }).catch((error) => {
                alert("Error al registrar el empleado: " + error.message);
            });
        }).catch((error) => {
            alert("Error al registrar usuario: " + error.message);
        });
    } else {
        alert("Por favor complete todos los campos.");
    }
});

// Mostrar el formulario de nuevo empleado
addEmployeeButton.addEventListener('click', () => {
    // Mostrar el formulario y ocultar la vista de empleados
    newEmployeeForm.style.display = 'block';
    document.querySelector('.employees').style.display = 'none';
});

// Cancelar el registro de nuevo empleado
cancelButton.addEventListener('click', () => {
    newEmployeeForm.style.display = 'none';
    document.querySelector('.employees').removeAttribute("style",'display:none;');
});

// Cargar empleados al inicio
loadEmployees();

// Función para eliminar un empleado
employeeTableBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('deleteButton')) {
        const employeeId = e.target.getAttribute('data-id');

        db.collection("empleados").doc(employeeId).get()
            .then((doc) => {
                if (doc.exists) {
                    const userUid = doc.data().uid; // Obtener UID del usuario en Authentication

                    // Eliminar de Firestore
                    db.collection("empleados").doc(employeeId).delete().then(() => {
                        alert("Empleado eliminado de Firestore");

                        // Eliminar de Authentication
                        auth.currentUser.delete().then(() => {
                            alert("Usuario eliminado de Authentication");

                            // Recargar empleados sin redireccionar
                            loadEmployees();
                        }).catch((error) => {
                            console.error("Error al eliminar usuario de Authentication:", error.message);
                        });

                    }).catch((error) => {
                        console.error("Error al eliminar empleado de Firestore:", error.message);
                    });

                } else {
                    console.error("No se encontró el empleado.");
                }
            })
            .catch((error) => {
                console.error("Error al obtener el empleado:", error.message);
            });
    }
});

const editEmployeeForm = document.getElementById('editEmployeeForm');
const editEmployeeName = document.getElementById('editEmployeeName');
const editEmployeePosition = document.getElementById('editEmployeePosition');
const editEmployeePhone = document.getElementById('editEmployeePhone');
const editEmployeeEmail = document.getElementById('editEmployeeEmail');
const editEmployeePassword = document.getElementById('editEmployeePassword');
const updateEmployeeButton = document.getElementById('updateEmployeeButton');
const cancelEditButton = document.getElementById('cancelEditButton');

let currentEmployeeId = "";
let currentEmployeeUid = "";
let currentEmployeeEmail = "";

// Escuchar clic en botón "Editar"
function addEditEventListeners() {
    document.querySelectorAll('.editButton').forEach(button => {
        button.addEventListener('click', (event) => {
            const button = event.target;
            currentEmployeeId = button.getAttribute('data-id');
            currentEmployeeUid = button.getAttribute('data-uid');
            currentEmployeeEmail = button.getAttribute('data-email');

            editEmployeeName.value = button.getAttribute('data-name');
            editEmployeePosition.value = button.getAttribute('data-position');
            editEmployeePhone.value = button.getAttribute('data-phone');
            editEmployeeEmail.value = currentEmployeeEmail; // Bloqueado para evitar cambios

            editEmployeeForm.style.display = 'block';
            document.querySelector('.employees').style.display = 'none';
        });
    });
}

// Función para actualizar empleado
updateEmployeeButton.addEventListener('click', () => {
    const updatedName = editEmployeeName.value;
    const updatedPosition = editEmployeePosition.value;
    const updatedPhone = editEmployeePhone.value;
    const updatedPassword = editEmployeePassword.value;

    if (!updatedName || !updatedPosition || !updatedPhone) {
        alert("Por favor, complete todos los campos obligatorios.");
        return;
    }

    // Actualizar datos en Firestore
    db.collection("empleados").doc(currentEmployeeId).update({
        name: updatedName,
        position: updatedPosition,
        phone: updatedPhone
    }).then(() => {
        alert("Datos del empleado actualizados con éxito.");
        window.location.href = 'employee.html';

        // Actualizar contraseña si se ingresó una nueva
        if (updatedPassword) {
            updateEmployeePassword(updatedPassword);
        }
    }).catch(error => {
        alert("Error al actualizar los datos del empleado: " + error.message);
    });
});

// Función para actualizar contraseña en Firebase Authentication
function updateEmployeePassword(newPassword) {
    const user = auth.currentUser;

    if (user) {
        auth.signInWithEmailAndPassword(currentEmployeeEmail, newPassword).then(() => {
            user.updatePassword(newPassword).then(() => {
                alert("Contraseña actualizada con éxito.");
            }).catch(error => {
                alert("Error al actualizar la contraseña: " + error.message);
            });
        }).catch(error => {
            alert("Error al autenticar usuario: " + error.message);
        });
    } else {
        alert("No se pudo actualizar la contraseña. Asegúrese de estar autenticado.");
    }
}

// Cancelar edición de empleado
cancelEditButton.addEventListener('click', () => {
    editEmployeeForm.style.display = 'none';
    document.querySelector('.employees').removeAttribute("style", 'display:none;');
});

// Función para mostrar el formulario de edición
function showEditForm(employee) {
    editEmployeeName.value = employee.name;
    editEmployeePosition.value = employee.position;
    editEmployeePhone.value = employee.phone;
    editEmployeeEmail.value = employee.email;
    employeeIdToEdit = employee.id; // Guardar el ID del empleado a editar
    editEmployeeForm.style.display = 'block';
    document.querySelector('.employees').style.display = 'none'; // Ocultar la vista principal
}

// Verificar si el usuario está autenticado
firebase.auth().onAuthStateChanged(user => {
    if (!user) {
        // Redirigir al login si no está autenticado
        window.location.href = 'index.html';
    } else {
        //console.log('Usuario autenticado:', user);
    }
});