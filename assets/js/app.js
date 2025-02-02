// Verifica que Firebase está cargado correctamente
if (typeof firebase === "undefined") {
  console.error("Firebase no se ha cargado correctamente.");
} else {
  console.log("Firebase cargado exitosamente.");
}

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAMsdmYEeH_zOQfXj55SURnp1Nkk8mhj4M",
  authDomain: "inventario-y-venta.firebaseapp.com",
  projectId: "inventario-y-venta",
  storageBucket: "inventario-y-venta.appspot.com",
  messagingSenderId: "220141957917",
  appId: "1:220141957917:web:1af57bde6709dffdf327f4",
  measurementId: "G-ELPGSV8ZLP"
};

// Inicializa Firebase solo si no está inicializado
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  console.log("Firebase inicializado correctamente.");
}

// Función para manejar el login
document.addEventListener("DOMContentLoaded", function () {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();

      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      firebase.auth().signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
          console.log("Usuario autenticado:", userCredential.user);
          window.location.href = 'https://julio-miranda.github.io/Inventario-y-Ventas/dashboard.html';  // Redirigir al dashboard
        })
        .catch((error) => {
          console.error("Error al iniciar sesión:", error.message);
          const errorElement = document.getElementById('error-message');
          errorElement.textContent = error.message;
          errorElement.style.display = 'block';
        });
    });
  }

  // Función de cierre de sesión
  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', function () {
      firebase.auth().signOut().then(() => {
        window.location.href = 'https://julio-miranda.github.io/Inventario-y-Ventas/index.html';
      }).catch((error) => {
        console.error("Error al cerrar sesión:", error.message);
      });
    });
  }
});
