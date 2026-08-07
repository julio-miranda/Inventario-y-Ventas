// assets/js/reset-password.js

if (typeof firebase === "undefined") {
  console.error("Firebase no se ha cargado correctamente.");
  Swal.fire({
    icon: 'error',
    title: 'Error',
    text: 'Firebase no se cargó. Revisa la conexión o los scripts.',
  });
} else {
  console.log("Firebase cargado exitosamente.");
}

const firebaseConfig = {
  apiKey: "AIzaSyAMsdmYEeH_zOQfXj55SURnp1Nkk8mhj4M",
  authDomain: "inventario-y-venta.firebaseapp.com",
  projectId: "inventario-y-venta",
  storageBucket: "inventario-y-venta.appspot.com",
  messagingSenderId: "220141957917",
  appId: "1:220141957917:web:1af57bde6709dffdf327f4",
  measurementId: "G-ELPGSV8ZLP"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  console.log("Firebase inicializado correctamente.");
}

const auth = firebase.auth();

document.addEventListener("DOMContentLoaded", () => {
  const resetForm = document.getElementById('resetForm');
  const btnLogin = document.getElementById('btnLogin');
  const btnText = document.getElementById('btnText');
  const btnSpinner = document.getElementById('btnSpinner');
  const errorElement = document.getElementById('error-message');
  const accountEmail = document.getElementById('accountEmail');

  const params = new URLSearchParams(window.location.search);
  const oobCode = params.get('oobCode');
  const mode = params.get('mode');

  function setLoading(isLoading) {
    btnLogin.disabled = isLoading;
    btnLogin.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    btnText.textContent = isLoading ? 'Procesando...' : 'Cambiar contraseña';
    btnSpinner.style.display = isLoading ? 'inline-block' : 'none';
  }

  function showError(msg) {
    errorElement.textContent = msg;
    errorElement.style.display = 'block';

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'error',
      title: msg,
      showConfirmButton: false,
      timer: 3000
    });
  }

  function clearError() {
    errorElement.textContent = '';
    errorElement.style.display = 'none';
  }

  function disableForm(message) {
    setLoading(false);
    btnLogin.disabled = true;

    if (message) {
      accountEmail.textContent = message;
    }
  }

  if (!oobCode || mode !== 'resetPassword') {
    accountEmail.textContent = 'Enlace inválido o incompleto.';
    disableForm('Enlace inválido o incompleto.');
    showError('El enlace de recuperación no es válido.');
    return;
  }

  auth.verifyPasswordResetCode(oobCode)
    .then((email) => {
      accountEmail.innerHTML = `Cuenta: <strong>${email}</strong>`;
      localStorage.setItem('savedEmail', email);
    })
    .catch((error) => {
      console.error("Error verificando código:", error);
      disableForm('No se pudo validar el enlace.');
      showError('El enlace de recuperación ya expiró o no es válido.');
    });

  if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();

      const newPassword = document.getElementById('newPassword').value.trim();
      const confirmPassword = document.getElementById('confirmPassword').value.trim();

      if (!newPassword || !confirmPassword) {
        showError('Completa ambos campos.');
        return;
      }

      if (newPassword.length < 6) {
        showError('La contraseña debe tener al menos 6 caracteres.');
        return;
      }

      if (newPassword !== confirmPassword) {
        showError('Las contraseñas no coinciden.');
        return;
      }

      setLoading(true);

      try {
        await auth.confirmPasswordReset(oobCode, newPassword);

        Swal.fire({
          icon: 'success',
          title: 'Contraseña actualizada',
          text: 'Tu contraseña fue cambiada correctamente. Ya puedes iniciar sesión.',
          confirmButtonColor: '#4CAF50'
        }).then(() => {
          window.location.href = 'index.html';
        });
      } catch (error) {
        console.error("Error restableciendo contraseña:", error);

        let mensaje = 'No se pudo cambiar la contraseña.';

        switch (error.code) {
          case 'auth/expired-action-code':
            mensaje = 'El enlace expiró. Solicita uno nuevo.';
            break;
          case 'auth/invalid-action-code':
            mensaje = 'El enlace no es válido.';
            break;
          case 'auth/user-disabled':
            mensaje = 'La cuenta ha sido deshabilitada.';
            break;
          case 'auth/weak-password':
            mensaje = 'La contraseña es demasiado débil.';
            break;
          default:
            mensaje = error.message || mensaje;
        }

        setLoading(false);
        showError(mensaje);
      }
    });
  }
});