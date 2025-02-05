const db = firebase.firestore();
const employeeSelect = document.getElementById('employeeSelect');
const attendanceForm = document.getElementById('attendanceForm');
const attendanceTable = document.getElementById('attendanceTable').getElementsByTagName('tbody')[0];

function loadEmployees() {
    db.collection("empleados").get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            const employee = doc.data();
            const option = document.createElement("option");
            option.value = doc.id;
            option.textContent = employee.name;
            employeeSelect.appendChild(option);
        });
    });
}

function loadAttendance() {
    while (attendanceTable.rows.length > 0) {
        attendanceTable.deleteRow(0);
    }

    db.collection("asistencia").orderBy("date", "desc").get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            const attendance = doc.data();
            db.collection("empleados").doc(attendance.employeeId).get().then((empDoc) => {
                const employee = empDoc.data();
                const row = attendanceTable.insertRow();
                const employeeCell = row.insertCell(0);
                const dateCell = row.insertCell(1);
                const statusCell = row.insertCell(2);

                employeeCell.textContent = employee.name;
                dateCell.textContent = new Date(attendance.date.seconds * 1000).toLocaleDateString("es-ES");
                statusCell.textContent = attendance.status;
            });
        });
    });
}

attendanceForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const employeeId = employeeSelect.value;
    const status = document.getElementById('attendanceStatus').value;
    const date = new Date();

    db.collection("asistencia").add({
        employeeId: employeeId,
        status: status,
        date: firebase.firestore.Timestamp.fromDate(date)
    }).then(() => {
        alert("Asistencia registrada");
        loadAttendance();
    }).catch((error) => {
        alert("Error al registrar la asistencia: " + error);
    });
});

loadEmployees();
loadAttendance();

// Verificar si el usuario está autenticado
firebase.auth().onAuthStateChanged(user => {
    if (!user) {
        // Redirigir al login si no está autenticado
        window.location.href = 'index.html';
    } else {
        //console.log('Usuario autenticado:', user);
    }
});