// assets/js/controllers/reset-password.controller.js

(function () {
  "use strict";

  const mvc =
    window.InventoryMVC ||
    (window.InventoryMVC = {
      models: {},
      views: {},
      controllers: {}
    });

  mvc.models =
    mvc.models ||
    {};

  mvc.views =
    mvc.views ||
    {};

  mvc.controllers =
    mvc.controllers ||
    {};

  /*
   * ============================================================
   * MODELO
   * ============================================================
   */

  const model =
    mvc.models.resetPassword;

  if (
    !model
  ) {
    console.error(
      "[ResetPasswordController] No se encontró resetPassword.model."
    );

    return;
  }

  /*
   * ============================================================
   * VISTA
   * ============================================================
   */

  const view =
    mvc.views.resetPassword;

  if (
    !view
  ) {
    console.error(
      "[ResetPasswordController] No se encontró resetPassword.view."
    );

    return;
  }

  /*
   * ============================================================
   * FIREBASE AUTH
   * ============================================================
   */

  const auth =
    window.auth ||
    (
      typeof firebase !==
      "undefined" &&
      typeof firebase.auth ===
        "function"
        ? firebase.auth()
        : null
    );

  /*
   * ============================================================
   * ESTADO DEL CONTROLADOR
   * ============================================================
   */

  let initialized =
    false;

  let verifiedResetCode =
    "";

  let verifiedEmail =
    "";

  /*
   * ============================================================
   * CONFIGURACIÓN DEL MODELO
   * ============================================================
   */

  const requiredMode =
    String(
      model.security?.requiredMode ||
        "resetPassword"
    ).trim();

  const minPasswordLength =
    Math.max(
      1,
      Number(
        model.security?.minPasswordLength ||
          6
      )
    );

  /*
   * ============================================================
   * FIREBASE
   * ============================================================
   */

  function getFirebaseErrorMessage(
    error
  ) {
    switch (
      error?.code
    ) {
      case "auth/expired-action-code":
        return "El enlace de recuperación expiró. Solicita un nuevo enlace.";

      case "auth/invalid-action-code":
        return "El enlace de recuperación no es válido o ya fue utilizado.";

      case "auth/user-disabled":
        return "La cuenta asociada está deshabilitada.";

      case "auth/user-not-found":
        return "No se encontró la cuenta asociada.";

      case "auth/weak-password":
        return `La contraseña debe tener al menos ${minPasswordLength} caracteres.`;

      case "auth/network-request-failed":
        return "No se pudo conectar con Firebase. Revisa tu conexión a Internet.";

      case "auth/too-many-requests":
        return "Se realizaron demasiados intentos. Intenta nuevamente más tarde.";

      default:
        return (
          error?.message ||
          "No se pudo completar el restablecimiento de contraseña."
        );
    }
  }

  /*
   * ============================================================
   * URL / ACTION CODE
   * ============================================================
   */

  function getResetRequest() {
    const params =
      new URLSearchParams(
        window.location.search
      );

    return {
      mode:
        String(
          params.get(
            "mode"
          ) ||
            ""
        ).trim(),

      oobCode:
        String(
          params.get(
            "oobCode"
          ) ||
            ""
        ).trim()
    };
  }

  function isValidResetRequest(
    request
  ) {
    return (
      request &&
      request.mode ===
        requiredMode &&
      Boolean(
        request.oobCode
      )
    );
  }

  /*
   * ============================================================
   * UI
   * ============================================================
   */

  function showInvalidLink(
    message =
      "El enlace de recuperación no es válido o está incompleto."
  ) {
    view.disableForm(
      "Enlace inválido o incompleto."
    );

    view.showError(
      message
    );
  }

  function showVerificationError(
    error
  ) {
    console.error(
      "[ResetPasswordController] Error verificando enlace:",
      error
    );

    view.disableForm(
      "No se pudo validar el enlace."
    );

    view.showError(
      getFirebaseErrorMessage(
        error
      )
    );
  }

  function showAccountEmail(
    email
  ) {
    const elements =
      view.getElements();

    if (
      !elements.accountEmail
    ) {
      return;
    }

    /*
     * Se utiliza textContent para no introducir HTML
     * proveniente del correo.
     */
    elements.accountEmail.textContent =
      `Cuenta: ${email}`;
  }

  function clearFormError() {
    view.clearError();
  }

  /*
   * ============================================================
   * VALIDACIÓN DE CONTRASEÑA
   * ============================================================
   */

  function validatePasswords(
    newPassword,
    confirmPassword
  ) {
    if (
      !newPassword ||
      !confirmPassword
    ) {
      return "Completa ambos campos.";
    }

    if (
      newPassword.length <
      minPasswordLength
    ) {
      return `La contraseña debe tener al menos ${minPasswordLength} caracteres.`;
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      return "Las contraseñas no coinciden.";
    }

    return "";
  }

  /*
   * ============================================================
   * REDIRECCIÓN
   * ============================================================
   */

  function getLoginHref() {
    if (
      window.AppRouter &&
      typeof window.AppRouter.getRouteHref ===
        "function"
    ) {
      return window.AppRouter.getRouteHref(
        "index.html"
      );
    }

    return "../index.html";
  }

  function redirectToLogin() {
    window.location.href =
      getLoginHref();
  }

  /*
   * ============================================================
   * RESTABLECER CONTRASEÑA
   * ============================================================
   */

  async function handleSubmit(
    event
  ) {
    event.preventDefault();

    clearFormError();

    /*
     * Nunca se permite ejecutar confirmPasswordReset()
     * sin haber verificado previamente el código.
     */
    if (
      !verifiedResetCode
    ) {
      view.showError(
        "El enlace de recuperación no ha sido validado."
      );

      return;
    }

    const elements =
      view.getElements();

    const newPassword =
      elements.newPassword?.value ||
      "";

    const confirmPassword =
      elements.confirmPassword?.value ||
      "";

    const validationError =
      validatePasswords(
        newPassword,
        confirmPassword
      );

    if (
      validationError
    ) {
      view.showError(
        validationError
      );

      return;
    }

    view.setLoading(
      true,
      "Actualizando..."
    );

    try {
      await auth.confirmPasswordReset(
        verifiedResetCode,
        newPassword
      );

      /*
       * El código ya no debe reutilizarse.
       */
      verifiedResetCode =
        "";

      const successMessage =
        "Tu contraseña fue cambiada correctamente. Ya puedes iniciar sesión.";

      if (
        typeof Swal !==
        "undefined"
      ) {
        await Swal.fire({
          icon:
            "success",

          title:
            "Contraseña actualizada",

          text:
            successMessage,

          confirmButtonColor:
            "#4CAF50"
        });
      }

      redirectToLogin();
    } catch (
      error
    ) {
      console.error(
        "[ResetPasswordController] Error restableciendo contraseña:",
        error
      );

      view.setLoading(
        false
      );

      view.showError(
        getFirebaseErrorMessage(
          error
        )
      );
    }
  }

  /*
   * ============================================================
   * VALIDAR ENLACE DE RECUPERACIÓN
   * ============================================================
   */

  async function verifyResetLink() {
    const request =
      getResetRequest();

    if (
      !isValidResetRequest(
        request
      )
    ) {
      showInvalidLink();

      return false;
    }

    try {
      /*
       * Firebase valida:
       *
       * - existencia del código;
       * - expiración;
       * - usuario asociado;
       * - estado del action code.
       */
      const email =
        await auth.verifyPasswordResetCode(
          request.oobCode
        );

      verifiedResetCode =
        request.oobCode;

      verifiedEmail =
        String(
          email ||
            ""
        ).trim();

      showAccountEmail(
        verifiedEmail
      );

      return true;
    } catch (
      error
    ) {
      verifiedResetCode =
        "";

      verifiedEmail =
        "";

      showVerificationError(
        error
      );

      return false;
    }
  }

  /*
   * ============================================================
   * INICIALIZACIÓN
   * ============================================================
   */

  async function initializeResetPasswordPage() {
    if (
      initialized
    ) {
      return;
    }

    initialized =
      true;

    /*
     * ----------------------------------------------------------
     * Firebase Auth
     * ----------------------------------------------------------
     */

    if (
      !auth
    ) {
      console.error(
        "[ResetPasswordController] Firebase Auth no está disponible."
      );

      view.disableForm(
        "No se pudo cargar autenticación."
      );

      view.showError(
        "Firebase Auth no está disponible."
      );

      return;
    }

    /*
     * ----------------------------------------------------------
     * Elementos de la vista
     * ----------------------------------------------------------
     */

    const elements =
      view.getElements();

    if (
      !elements.form
    ) {
      console.error(
        "[ResetPasswordController] No se encontró #resetForm."
      );

      return;
    }

    /*
     * ----------------------------------------------------------
     * Estado inicial
     * ----------------------------------------------------------
     */

    view.clearError();

    view.setLoading(
      false
    );

    /*
     * ----------------------------------------------------------
     * Validación del enlace
     * ----------------------------------------------------------
     */

    const validLink =
      await verifyResetLink();

    if (
      !validLink
    ) {
      return;
    }

    /*
     * ----------------------------------------------------------
     * Formulario
     * ----------------------------------------------------------
     */

    elements.form.addEventListener(
      "submit",
      handleSubmit
    );
  }

  /*
   * ============================================================
   * CONTROLADOR MVC
   * ============================================================
   */

  const resetPasswordController = {
    name:
      model.name ||
      "resetPassword",

    page:
      model.page ||
      "reset-password.html",

    public:
      model.public ===
      true,

    requiresLocal:
      model.requiresLocal ===
      true,

    roles:
      Array.isArray(
        model.roles
      )
        ? model.roles
        : [],

    init:
      initializeResetPasswordPage
  };

  mvc.controllers.resetPassword =
    resetPasswordController;

  /*
   * ============================================================
   * REGISTRO EN APP.ROUTER
   * ============================================================
   */

  if (
    window.AppRouter &&
    typeof window.AppRouter.registerPublicPageController ===
      "function"
  ) {
    window.AppRouter.registerPublicPageController(
      resetPasswordController
    );
  } else {
    /*
     * Fallback únicamente para escenarios donde app.js
     * todavía no haya expuesto AppRouter.
     */
    document.addEventListener(
      "DOMContentLoaded",
      initializeResetPasswordPage,
      {
        once:
          true
      }
    );
  }
})();