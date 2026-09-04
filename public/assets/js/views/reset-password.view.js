// assets/js/views/reset-password.view.js

(function () {
  "use strict";

  const mvc =
    window.InventoryMVC ||
    (window.InventoryMVC = {
      models: {},
      views: {},
      controllers: {}
    });

  mvc.views =
    mvc.views ||
    {};

  const selectors = Object.freeze({
    form: "#resetForm",
    submitButton: "#btnLogin",
    buttonText: "#btnText",
    spinner: "#btnSpinner",
    error: "#error-message",
    accountEmail: "#accountEmail",
    newPassword: "#newPassword",
    confirmPassword: "#confirmPassword"
  });

  function qs(
    selector,
    root = document
  ) {
    return root.querySelector(
      selector
    );
  }

  function escapeHtml(
    value = ""
  ) {
    return String(
      value ?? ""
    )
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setLoading(
    isLoading,
    text = "Procesando..."
  ) {
    const submitButton =
      qs(selectors.submitButton);

    const buttonText =
      qs(selectors.buttonText);

    const spinner =
      qs(selectors.spinner);

    if (submitButton) {
      submitButton.disabled =
        isLoading;

      submitButton.setAttribute(
        "aria-busy",
        isLoading
          ? "true"
          : "false"
      );
    }

    if (buttonText) {
      buttonText.textContent =
        isLoading
          ? text
          : "Cambiar contraseña";
    }

    if (spinner) {
      spinner.style.display =
        isLoading
          ? "inline-block"
          : "none";
    }
  }

  function showError(
    message
  ) {
    const errorElement =
      qs(selectors.error);

    if (errorElement) {
      errorElement.textContent =
        message;

      errorElement.style.display =
        "block";
    }

    if (
      typeof Swal !==
      "undefined"
    ) {
      Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "error",

        title:
          message,

        showConfirmButton:
          false,

        timer:
          3000
      });
    }
  }

  function clearError() {
    const errorElement =
      qs(selectors.error);

    if (errorElement) {
      errorElement.textContent =
        "";

      errorElement.style.display =
        "none";
    }
  }

  function disableForm(
    message = ""
  ) {
    setLoading(
      false
    );

    const submitButton =
      qs(selectors.submitButton);

    const accountEmail =
      qs(selectors.accountEmail);

    if (submitButton) {
      submitButton.disabled =
        true;
    }

    if (
      message &&
      accountEmail
    ) {
      accountEmail.textContent =
        message;
    }
  }

  function getElements() {
    return Object.fromEntries(
      Object.entries(
        selectors
      ).map(
        ([
          key,
          selector
        ]) => [
          key,
          qs(selector)
        ]
      )
    );
  }

  mvc.views.resetPassword = Object.freeze({
    selectors,
    qs,
    escapeHtml,
    setLoading,
    showError,
    clearError,
    disableForm,
    getElements
  });
})();
