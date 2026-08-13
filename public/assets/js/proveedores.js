// assets/js/proveedores.js
//
// Proveedores.
//
// Datos:
// - Nombre
// - Razón Social o Denominación
// - Nacionalidad
// - NIT
// - NRC
// - Ubicación
//
// Reglas:
// - Cada proveedor pertenece a un id_local.
// - Administrador/Bodega pueden crear y editar.
// - Solo Administrador puede eliminar.
// - No se utilizan onSnapshot().
// - La lectura de proveedores se realiza una vez y queda
//   en caché para reutilizarla desde inventario.
// - El inventario almacena proveedorId y proveedorNombre.
//
// Compatibilidad:
// - Los proveedores antiguos que no tengan NIT, NRC o
//   ubicación seguirán funcionando y mostrarán esos campos vacíos.
//
// Este archivo puede utilizarse tanto en:
// - proveedores.html
// - inventory.html

(function () {
  "use strict";

  if (
    typeof firebase === "undefined"
  ) {
    console.error(
      "Firebase no se ha cargado correctamente."
    );

    return;
  }

  const db =
    window.db ||
    firebase.firestore();

  const SUPPLIER_COLLECTION =
    window.SUPPLIER_COLLECTION_NAME ||
    "proveedores";

  let providersCache = [];

  let providersLoadPromise =
    null;

  let providersCacheLocalId =
    "";

  let providersInitialized =
    false;

  let currentRole = "";

  let currentLocalId = "";

  let currentContext = null;

  let providersDT = null;

  /*
   * ============================================================
   * ELEMENTOS
   * ============================================================
   */

  const table =
    document.getElementById(
      "providersTable"
    );

  const btnAdd =
    document.getElementById(
      "btnAddProvider"
    );

  const totalProvidersCard =
    document.getElementById(
      "totalProvidersCard"
    );

  const providersSearch =
    document.getElementById(
      "providersSearch"
    );

  /*
   * ============================================================
   * UTILIDADES
   * ============================================================
   */

  function escapeHtml(
    value
  ) {
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

  function normalizeText(
    value
  ) {
    return String(
      value ?? ""
    )
      .trim()
      .toLowerCase();
  }

  function canManageProviders() {
    return (
      currentRole ===
        "administrador" ||
      currentRole ===
        "admin" ||
      currentRole ===
        "bodega"
    );
  }

  function canDeleteProviders() {
    return (
      currentRole ===
        "administrador" ||
      currentRole ===
        "admin"
    );
  }

  function getProviderName(
    provider
  ) {
    return String(
      provider?.nombre ||
        ""
    ).trim();
  }

  function getProviderBusinessName(
    provider
  ) {
    return String(
      provider?.razonSocialDenominacion ||
        provider?.razonSocial ||
        provider?.denominacion ||
        ""
    ).trim();
  }

  function getProviderNationality(
    provider
  ) {
    return String(
      provider?.nacionalidad ||
        ""
    ).trim();
  }

  function getProviderNIT(
    provider
  ) {
    return String(
      provider?.nit ||
        provider?.NIT ||
        provider?.numeroNIT ||
        provider?.numeroNit ||
        ""
    ).trim();
  }

  function getProviderNRC(
    provider
  ) {
    return String(
      provider?.nrc ||
        provider?.NRC ||
        provider?.numeroNRC ||
        provider?.numeroNrc ||
        ""
    ).trim();
  }

  function getProviderLocation(
    provider
  ) {
    return String(
      provider?.ubicacion ||
        provider?.location ||
        provider?.direccion ||
        provider?.address ||
        ""
    ).trim();
  }

  /*
   * ============================================================
   * CONTEXTO
   * ============================================================
   */

  async function resolveContext() {
    const user =
      window.auth?.currentUser ||
      firebase.auth().currentUser;

    if (!user) {
      throw new Error(
        "No hay un usuario autenticado."
      );
    }

    if (
      typeof window.getCurrentUserContext !==
      "function"
    ) {
      throw new Error(
        "app.js no expuso getCurrentUserContext()."
      );
    }

    const context =
      await window.getCurrentUserContext(
        user
      );

    if (!context) {
      throw new Error(
        "No se pudo resolver el contexto del usuario."
      );
    }

    currentContext =
      context;

    currentRole =
      String(
        context.role ||
          ""
      )
        .trim()
        .toLowerCase();

    currentLocalId =
      String(
        context.id_local ||
          ""
      ).trim();

    return context;
  }

  /*
   * ============================================================
   * CARGA DE PROVEEDORES
   * ============================================================
   *
   * Una sola lectura por local durante la sesión.
   */

  async function loadProviders(
    forceRefresh = false
  ) {
    if (!currentLocalId) {
      await resolveContext();
    }

    if (!currentLocalId) {
      throw new Error(
        "El usuario no tiene id_local asignado."
      );
    }

    if (
      !forceRefresh &&
      providersCacheLocalId ===
        currentLocalId &&
      providersCache.length > 0
    ) {
      return [
        ...providersCache
      ];
    }

    if (
      !forceRefresh &&
      providersCacheLocalId ===
        currentLocalId &&
      providersCache.length === 0 &&
      providersLoadPromise === null
    ) {
      return [];
    }

    if (
      providersLoadPromise
    ) {
      return providersLoadPromise;
    }

    providersLoadPromise =
      (async () => {
        const snapshot =
          await db
            .collection(
              SUPPLIER_COLLECTION
            )
            .where(
              "id_local",
              "==",
              currentLocalId
            )
            .get();

        const list = [];

        snapshot.forEach(
          doc => {
            const data =
              doc.data() ||
              {};

            list.push({
              id:
                doc.id,

              ...data,

              nombre:
                getProviderName(
                  data
                ),

              razonSocialDenominacion:
                getProviderBusinessName(
                  data
                ),

              nacionalidad:
                getProviderNationality(
                  data
                ),

              nit:
                getProviderNIT(
                  data
                ),

              nrc:
                getProviderNRC(
                  data
                ),

              ubicacion:
                getProviderLocation(
                  data
                ),

              id_local:
                data.id_local ||
                currentLocalId
            });
          }
        );

        list.sort(
          (
            a,
            b
          ) =>
            getProviderName(
              a
            ).localeCompare(
              getProviderName(
                b
              ),
              "es",
              {
                sensitivity:
                  "base"
              }
            )
        );

        providersCache =
          list;

        providersCacheLocalId =
          currentLocalId;

        return [
          ...providersCache
        ];
      })();

    try {
      return await providersLoadPromise;
    } finally {
      providersLoadPromise =
        null;
    }
  }

  /*
   * ============================================================
   * API PARA INVENTARIO
   * ============================================================
   */

  async function getProvidersForInventory() {
    return loadProviders(
      false
    );
  }

  function getProviderById(
    providerId
  ) {
    const target =
      String(
        providerId ||
          ""
      ).trim();

    if (!target) {
      return null;
    }

    return (
      providersCache.find(
        provider =>
          String(
            provider.id
          ) === target
      ) ||
      null
    );
  }

  function getProviderOptionsHtml(
    selectedId = "",
    options = {}
  ) {
    const includeEmpty =
      options.includeEmpty !==
      false;

    const disabled =
      options.disabled === true;

    const selected =
      String(
        selectedId ||
          ""
      ).trim();

    const html = [];

    if (
      includeEmpty
    ) {
      html.push(`
        <option value="">
          Selecciona un proveedor
        </option>
      `);
    }

    providersCache.forEach(
      provider => {
        const id =
          String(
            provider.id ||
              ""
          ).trim();

        const name =
          getProviderName(
            provider
          );

        const businessName =
          getProviderBusinessName(
            provider
          );

        const label =
          businessName
            ? `${name} — ${businessName}`
            : name;

        html.push(`
          <option
            value="${escapeHtml(
              id
            )}"
            ${
              id === selected
                ? "selected"
                : ""
            }
            ${
              disabled
                ? "disabled"
                : ""
            }
          >
            ${escapeHtml(
              label
            )}
          </option>
        `);
      }
    );

    return html.join("");
  }

  /*
   * ============================================================
   * CACHE
   * ============================================================
   */

  function getProvidersCache() {
    return [
      ...providersCache
    ];
  }

  function upsertProviderCache(
    provider
  ) {
    const normalizedProvider = {
      ...provider,

      nombre:
        getProviderName(
          provider
        ),

      razonSocialDenominacion:
        getProviderBusinessName(
          provider
        ),

      nacionalidad:
        getProviderNationality(
          provider
        ),

      nit:
        getProviderNIT(
          provider
        ),

      nrc:
        getProviderNRC(
          provider
        ),

      ubicacion:
        getProviderLocation(
          provider
        )
    };

    const index =
      providersCache.findIndex(
        item =>
          String(
            item.id
          ) ===
          String(
            normalizedProvider.id
          )
      );

    if (
      index >= 0
    ) {
      providersCache[
        index
      ] = {
        ...providersCache[
          index
        ],
        ...normalizedProvider
      };
    } else {
      providersCache.push(
        normalizedProvider
      );
    }

    providersCache.sort(
      (
        a,
        b
      ) =>
        getProviderName(
          a
        ).localeCompare(
          getProviderName(
            b
          ),
          "es",
          {
            sensitivity:
              "base"
          }
        )
    );
  }

  function removeProviderFromCache(
    providerId
  ) {
    providersCache =
      providersCache.filter(
        provider =>
          String(
            provider.id
          ) !==
          String(
            providerId
          )
      );
  }

  /*
   * ============================================================
   * VALIDACIÓN
   * ============================================================
   */

  function validateProviderData(
    values,
    ignoreId = ""
  ) {
    if (!values.nombre) {
      return "El nombre del proveedor es obligatorio.";
    }

    if (
      !values.razonSocialDenominacion
    ) {
      return (
        "La Razón Social o Denominación es obligatoria."
      );
    }

    if (!values.nacionalidad) {
      return "La nacionalidad del proveedor es obligatoria.";
    }

    /*
     * NIT, NRC y ubicación son opcionales.
     *
     * Esto permite registrar:
     * - proveedores que no poseen NRC;
     * - proveedores que operan sin NIT registrado;
     * - proveedores cuyo domicilio no se desea registrar.
     *
     * Si posteriormente se requiere hacer alguno de estos
     * campos obligatorio, la validación puede agregarse aquí
     * sin modificar el resto del módulo.
     */

    const duplicate =
      providersCache.find(
        provider => {
          if (
            String(
              provider.id
            ) ===
            String(
              ignoreId
            )
          ) {
            return false;
          }

          const sameName =
            normalizeText(
              provider.nombre
            ) ===
            normalizeText(
              values.nombre
            );

          const sameBusinessName =
            normalizeText(
              provider.razonSocialDenominacion
            ) ===
            normalizeText(
              values.razonSocialDenominacion
            );

          return (
            sameName &&
            sameBusinessName
          );
        }
      );

    if (
      duplicate
    ) {
      return (
        "Ya existe un proveedor con el mismo nombre y Razón Social o Denominación."
      );
    }

    return "";
  }

  /*
   * ============================================================
   * CREAR
   * ============================================================
   */

  async function createProvider(
    values
  ) {
    if (
      !canManageProviders()
    ) {
      throw new Error(
        "No tienes permisos para registrar proveedores."
      );
    }

    const validation =
      validateProviderData(
        values
      );

    if (
      validation
    ) {
      throw new Error(
        validation
      );
    }

    const normalizedValues = {
      nombre:
        String(
          values.nombre ||
            ""
        ).trim(),

      razonSocialDenominacion:
        String(
          values.razonSocialDenominacion ||
            ""
        ).trim(),

      nacionalidad:
        String(
          values.nacionalidad ||
            ""
        ).trim(),

      nit:
        String(
          values.nit ||
            ""
        ).trim(),

      nrc:
        String(
          values.nrc ||
            ""
        ).trim(),

      ubicacion:
        String(
          values.ubicacion ||
            ""
        ).trim()
    };

    const ref =
      await db
        .collection(
          SUPPLIER_COLLECTION
        )
        .add({
          nombre:
            normalizedValues.nombre,

          razonSocialDenominacion:
            normalizedValues.razonSocialDenominacion,

          nacionalidad:
            normalizedValues.nacionalidad,

          nit:
            normalizedValues.nit,

          nrc:
            normalizedValues.nrc,

          ubicacion:
            normalizedValues.ubicacion,

          id_local:
            currentLocalId,

          /*
           * Datos del local actual.
           * Se mantienen para conservar la trazabilidad
           * de los registros existentes.
           */
          localNombre:
            currentContext?.localNombre ||
            "",

          localNumeroDocumento:
            currentContext?.localNumeroDocumento ||
            "",

          localUbicacion:
            currentContext?.localUbicacion ||
            "",

          localContribuyente:
            currentContext?.localContribuyente ||
            "",

          localTipoDocumento:
            currentContext?.localTipoDocumento ||
            "",

          localNIT:
            currentContext?.localNIT ||
            "",

          localNRC:
            currentContext?.localNRC ||
            "",

          createdAt:
            firebase.firestore
              .FieldValue
              .serverTimestamp(),

          updatedAt:
            firebase.firestore
              .FieldValue
              .serverTimestamp()
        });

    const provider = {
      id:
        ref.id,

      nombre:
        normalizedValues.nombre,

      razonSocialDenominacion:
        normalizedValues.razonSocialDenominacion,

      nacionalidad:
        normalizedValues.nacionalidad,

      nit:
        normalizedValues.nit,

      nrc:
        normalizedValues.nrc,

      ubicacion:
        normalizedValues.ubicacion,

      id_local:
        currentLocalId
    };

    upsertProviderCache(
      provider
    );

    refreshProvidersTable();

    return provider;
  }

  /*
   * ============================================================
   * ACTUALIZAR
   * ============================================================
   */

  async function updateProvider(
    providerId,
    values
  ) {
    if (
      !canManageProviders()
    ) {
      throw new Error(
        "No tienes permisos para editar proveedores."
      );
    }

    const provider =
      getProviderById(
        providerId
      );

    if (!provider) {
      throw new Error(
        "El proveedor no existe."
      );
    }

    const validation =
      validateProviderData(
        values,
        providerId
      );

    if (
      validation
    ) {
      throw new Error(
        validation
      );
    }

    const normalizedValues = {
      nombre:
        String(
          values.nombre ||
            ""
        ).trim(),

      razonSocialDenominacion:
        String(
          values.razonSocialDenominacion ||
            ""
        ).trim(),

      nacionalidad:
        String(
          values.nacionalidad ||
            ""
        ).trim(),

      nit:
        String(
          values.nit ||
            ""
        ).trim(),

      nrc:
        String(
          values.nrc ||
            ""
        ).trim(),

      ubicacion:
        String(
          values.ubicacion ||
            ""
        ).trim()
    };

    await db
      .collection(
        SUPPLIER_COLLECTION
      )
      .doc(
        providerId
      )
      .update({
        nombre:
          normalizedValues.nombre,

        razonSocialDenominacion:
          normalizedValues.razonSocialDenominacion,

        nacionalidad:
          normalizedValues.nacionalidad,

        nit:
          normalizedValues.nit,

        nrc:
          normalizedValues.nrc,

        ubicacion:
          normalizedValues.ubicacion,

        updatedAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp()
      });

    upsertProviderCache({
      ...provider,

      nombre:
        normalizedValues.nombre,

      razonSocialDenominacion:
        normalizedValues.razonSocialDenominacion,

      nacionalidad:
        normalizedValues.nacionalidad,

      nit:
        normalizedValues.nit,

      nrc:
        normalizedValues.nrc,

      ubicacion:
        normalizedValues.ubicacion
    });

    refreshProvidersTable();
  }

  /*
   * ============================================================
   * ELIMINAR
   * ============================================================
   *
   * Antes de eliminar se verifica si el proveedor está
   * siendo utilizado por productos del mismo local.
   *
   * Esta lectura solo ocurre al intentar eliminar.
   */

  async function deleteProvider(
    providerId
  ) {
    if (
      !canDeleteProviders()
    ) {
      throw new Error(
        "Solo el administrador puede eliminar proveedores."
      );
    }

    const provider =
      getProviderById(
        providerId
      );

    if (!provider) {
      throw new Error(
        "El proveedor no existe."
      );
    }

    const productsSnapshot =
      await db
        .collection(
          "productos"
        )
        .where(
          "id_local",
          "==",
          currentLocalId
        )
        .get();

    let usedByProduct =
      false;

    productsSnapshot.forEach(
      doc => {
        const product =
          doc.data() ||
          {};

        if (
          String(
            product.proveedorId ||
              ""
          ) ===
          String(
            providerId
          )
        ) {
          usedByProduct =
            true;
        }
      }
    );

    if (
      usedByProduct
    ) {
      throw new Error(
        "No se puede eliminar este proveedor porque está asociado a uno o más productos."
      );
    }

    await db
      .collection(
        SUPPLIER_COLLECTION
      )
      .doc(
        providerId
      )
      .delete();

    removeProviderFromCache(
      providerId
    );

    refreshProvidersTable();
  }

  /*
   * ============================================================
   * FORMULARIO
   * ============================================================
   */

  function buildProviderFormHtml(
    provider = {}
  ) {
    return `
      <div
        style="
          text-align:left;
        "
      >

        <label
          for="provider-name"
          style="
            display:block;
            margin:0 0 6px;
            font-weight:600;
          "
        >
          Nombre del proveedor
        </label>

        <input
          id="provider-name"
          class="swal2-input"
          style="
            width:100%;
            margin:0 0 14px;
          "
          type="text"
          maxlength="150"
          placeholder="Nombre del proveedor"
          value="${escapeHtml(
            provider.nombre ||
              ""
          )}"
        >

        <label
          for="provider-business"
          style="
            display:block;
            margin:0 0 6px;
            font-weight:600;
          "
        >
          Razón Social o Denominación
        </label>

        <input
          id="provider-business"
          class="swal2-input"
          style="
            width:100%;
            margin:0 0 14px;
          "
          type="text"
          maxlength="200"
          placeholder="Razón Social o Denominación"
          value="${escapeHtml(
            provider.razonSocialDenominacion ||
              ""
          )}"
        >

        <label
          for="provider-nationality"
          style="
            display:block;
            margin:0 0 6px;
            font-weight:600;
          "
        >
          Nacionalidad
        </label>

        <input
          id="provider-nationality"
          class="swal2-input"
          style="
            width:100%;
            margin:0 0 14px;
          "
          type="text"
          maxlength="100"
          placeholder="Ej. Salvadoreña"
          value="${escapeHtml(
            provider.nacionalidad ||
              ""
          )}"
        >

        <label
          for="provider-nit"
          style="
            display:block;
            margin:0 0 6px;
            font-weight:600;
          "
        >
          NIT
        </label>

        <input
          id="provider-nit"
          class="swal2-input"
          style="
            width:100%;
            margin:0 0 14px;
          "
          type="text"
          maxlength="30"
          autocomplete="off"
          placeholder="NIT del proveedor"
          value="${escapeHtml(
            getProviderNIT(
              provider
            )
          )}"
        >

        <label
          for="provider-nrc"
          style="
            display:block;
            margin:0 0 6px;
            font-weight:600;
          "
        >
          NRC
        </label>

        <input
          id="provider-nrc"
          class="swal2-input"
          style="
            width:100%;
            margin:0 0 14px;
          "
          type="text"
          maxlength="30"
          autocomplete="off"
          placeholder="NRC del proveedor"
          value="${escapeHtml(
            getProviderNRC(
              provider
            )
          )}"
        >

        <label
          for="provider-location"
          style="
            display:block;
            margin:0 0 6px;
            font-weight:600;
          "
        >
          Ubicación
        </label>

        <textarea
          id="provider-location"
          class="swal2-textarea"
          style="
            width:100%;
            min-height:90px;
            margin:0;
            resize:vertical;
          "
          maxlength="300"
          placeholder="Dirección, ciudad, departamento o ubicación del proveedor"
        >${escapeHtml(
          getProviderLocation(
            provider
          )
        )}</textarea>

      </div>
    `;
  }

  function readProviderFormValues() {
    return {
      nombre:
        document
          .getElementById(
            "provider-name"
          )
          ?.value
          .trim() ||
        "",

      razonSocialDenominacion:
        document
          .getElementById(
            "provider-business"
          )
          ?.value
          .trim() ||
        "",

      nacionalidad:
        document
          .getElementById(
            "provider-nationality"
          )
          ?.value
          .trim() ||
        "",

      nit:
        document
          .getElementById(
            "provider-nit"
          )
          ?.value
          .trim() ||
        "",

      nrc:
        document
          .getElementById(
            "provider-nrc"
          )
          ?.value
          .trim() ||
        "",

      ubicacion:
        document
          .getElementById(
            "provider-location"
          )
          ?.value
          .trim() ||
        ""
    };
  }

  /*
   * ============================================================
   * MODAL CREAR
   * ============================================================
   */

  async function openCreateProviderModal() {
    if (
      !canManageProviders()
    ) {
      await Swal.fire(
        "Sin permisos",
        "No tienes permisos para registrar proveedores.",
        "warning"
      );

      return;
    }

    const result =
      await Swal.fire({
        title:
          "Nuevo proveedor",

        html:
          buildProviderFormHtml(),

        showCancelButton:
          true,

        confirmButtonText:
          "Guardar",

        cancelButtonText:
          "Cancelar",

        focusConfirm:
          false,

        preConfirm:
          () => {
            const values =
              readProviderFormValues();

            const validation =
              validateProviderData(
                values
              );

            if (
              validation
            ) {
              Swal.showValidationMessage(
                validation
              );

              return;
            }

            return values;
          }
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    try {
      await createProvider(
        result.value
      );

      await Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "success",

        title:
          "Proveedor registrado",

        showConfirmButton:
          false,

        timer:
          1500
      });
    } catch (
      error
    ) {
      console.error(
        "Error registrando proveedor:",
        error
      );

      await Swal.fire(
        "Error",
        error.message ||
          "No se pudo registrar el proveedor.",
        "error"
      );
    }
  }

  /*
   * ============================================================
   * MODAL EDITAR
   * ============================================================
   */

  async function openEditProviderModal(
    providerId
  ) {
    if (
      !canManageProviders()
    ) {
      await Swal.fire(
        "Sin permisos",
        "No tienes permisos para editar proveedores.",
        "warning"
      );

      return;
    }

    const provider =
      getProviderById(
        providerId
      );

    if (!provider) {
      await Swal.fire(
        "No encontrado",
        "El proveedor no existe.",
        "warning"
      );

      return;
    }

    const result =
      await Swal.fire({
        title:
          "Editar proveedor",

        html:
          buildProviderFormHtml(
            provider
          ),

        showCancelButton:
          true,

        confirmButtonText:
          "Actualizar",

        cancelButtonText:
          "Cancelar",

        focusConfirm:
          false,

        preConfirm:
          () => {
            const values =
              readProviderFormValues();

            const validation =
              validateProviderData(
                values,
                providerId
              );

            if (
              validation
            ) {
              Swal.showValidationMessage(
                validation
              );

              return;
            }

            return values;
          }
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    try {
      await updateProvider(
        providerId,
        result.value
      );

      await Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "success",

        title:
          "Proveedor actualizado",

        showConfirmButton:
          false,

        timer:
          1500
      });
    } catch (
      error
    ) {
      console.error(
        "Error actualizando proveedor:",
        error
      );

      await Swal.fire(
        "Error",
        error.message ||
          "No se pudo actualizar el proveedor.",
        "error"
      );
    }
  }

  /*
   * ============================================================
   * ELIMINAR DESDE UI
   * ============================================================
   */

  async function confirmDeleteProvider(
    providerId
  ) {
    if (
      !canDeleteProviders()
    ) {
      await Swal.fire(
        "Sin permisos",
        "Solo el administrador puede eliminar proveedores.",
        "warning"
      );

      return;
    }

    const provider =
      getProviderById(
        providerId
      );

    if (!provider) {
      return;
    }

    const result =
      await Swal.fire({
        title:
          `¿Eliminar "${provider.nombre}"?`,

        text:
          "El proveedor solo podrá eliminarse si no está asociado a ningún producto.",

        icon:
          "warning",

        showCancelButton:
          true,

        confirmButtonText:
          "Sí, eliminar",

        cancelButtonText:
          "Cancelar"
      });

    if (
      !result.isConfirmed
    ) {
      return;
    }

    try {
      await deleteProvider(
        providerId
      );

      await Swal.fire({
        toast:
          true,

        position:
          "top-end",

        icon:
          "success",

        title:
          "Proveedor eliminado",

        showConfirmButton:
          false,

        timer:
          1500
      });
    } catch (
      error
    ) {
      console.error(
        "Error eliminando proveedor:",
        error
      );

      await Swal.fire(
        "No se puede eliminar",
        error.message ||
          "No se pudo eliminar el proveedor.",
        "warning"
      );
    }
  }

  /*
   * ============================================================
   * DATATABLE
   * ============================================================
   */

  function ensureProvidersDataTable() {
    if (
      providersDT
    ) {
      return providersDT;
    }

    if (
      !window.jQuery ||
      !$.fn ||
      !$.fn.DataTable ||
      !table
    ) {
      return null;
    }

    providersDT =
      $("#providersTable")
        .DataTable({
          data: [],

          columns: [
            {
              data:
                "nombre",

              title:
                "Nombre",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? escapeHtml(
                        data
                      )
                    : data
            },

            {
              data:
                "razonSocialDenominacion",

              title:
                "Razón Social / Denominación",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? escapeHtml(
                        data
                      )
                    : data
            },

            {
              data:
                "nacionalidad",

              title:
                "Nacionalidad",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? escapeHtml(
                        data
                      )
                    : data
            },

            {
              data:
                "nit",

              title:
                "NIT",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? escapeHtml(
                        data || ""
                      )
                    : data || ""
            },

            {
              data:
                "nrc",

              title:
                "NRC",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? escapeHtml(
                        data || ""
                      )
                    : data || ""
            },

            {
              data:
                "ubicacion",

              title:
                "Ubicación",

              render:
                (
                  data,
                  type
                ) =>
                  type ===
                    "display"
                    ? escapeHtml(
                        data || ""
                      )
                    : data || ""
            },

            {
              data:
                null,

              title:
                "Acciones",

              orderable:
                false,

              searchable:
                false,

              render:
                (
                  data,
                  type,
                  row
                ) => {
                  if (
                    type !==
                    "display"
                  ) {
                    return "";
                  }

                  let html = "";

                  if (
                    canManageProviders()
                  ) {
                    html += `
                      <button
                        type="button"
                        class="btn-outline"
                        data-provider-action="edit"
                        data-id="${escapeHtml(
                          row.id
                        )}"
                      >
                        <i class="fas fa-edit"></i>
                        Editar
                      </button>
                    `;
                  }

                  if (
                    canDeleteProviders()
                  ) {
                    html += `
                      <button
                        type="button"
                        class="btn-outline"
                        data-provider-action="delete"
                        data-id="${escapeHtml(
                          row.id
                        )}"
                        style="margin-left:8px;"
                      >
                        <i class="fas fa-trash"></i>
                        Eliminar
                      </button>
                    `;
                  }

                  if (!html) {
                    html =
                      '<span class="small">Solo lectura</span>';
                  }

                  return html;
                }
            }
          ],

          pageLength:
            10,

          lengthMenu: [
            5,
            10,
            25,
            50
          ],

          order: [
            [
              0,
              "asc"
            ]
          ],

          autoWidth:
            false,

          scrollX:
            true,

          scrollCollapse:
            true,

          deferRender:
            true,

          dom:
            'rt<"bottom"ip><"clear">',

          language: {
            emptyTable:
              "No hay proveedores registrados.",

            zeroRecords:
              "No se encontraron coincidencias.",

            info:
              "Mostrando _START_ a _END_ de _TOTAL_",

            infoEmpty:
              "No hay registros",

            infoFiltered:
              "(filtrado de _MAX_ registros)",

            paginate: {
              previous:
                "‹",

              next:
                "›"
            }
          }
        });

    $("#providersTable tbody").on(
      "click",
      "button[data-provider-action='edit']",
      function () {
        openEditProviderModal(
          String(
            $(this).data(
              "id"
            )
          )
        );
      }
    );

    $("#providersTable tbody").on(
      "click",
      "button[data-provider-action='delete']",
      function () {
        confirmDeleteProvider(
          String(
            $(this).data(
              "id"
            )
          )
        );
      }
    );

    return providersDT;
  }

  function refreshProvidersTable() {
    const dt =
      ensureProvidersDataTable();

    if (
      totalProvidersCard
    ) {
      totalProvidersCard.textContent =
        String(
          providersCache.length
        );
    }

    if (dt) {
      const currentSearch =
        providersSearch
          ? providersSearch.value.trim()
          : "";

      dt.clear();

      dt.rows.add(
        providersCache
      );

      dt.draw(false);

      dt.search(
        currentSearch
      ).draw(false);

      return;
    }

    if (!table) {
      return;
    }

    const tbody =
      table.querySelector(
        "tbody"
      );

    if (!tbody) {
      return;
    }

    tbody.innerHTML =
      providersCache
        .map(
          provider => `
            <tr>

              <td>
                ${escapeHtml(
                  provider.nombre
                )}
              </td>

              <td>
                ${escapeHtml(
                  provider.razonSocialDenominacion
                )}
              </td>

              <td>
                ${escapeHtml(
                  provider.nacionalidad
                )}
              </td>

              <td>
                ${escapeHtml(
                  getProviderNIT(
                    provider
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  getProviderNRC(
                    provider
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  getProviderLocation(
                    provider
                  )
                )}
              </td>

              <td>
                ${
                  canManageProviders()
                    ? `
                      <button
                        type="button"
                        class="btn-outline"
                        data-provider-action="edit"
                        data-id="${escapeHtml(
                          provider.id
                        )}"
                      >
                        Editar
                      </button>
                    `
                    : ""
                }

                ${
                  canDeleteProviders()
                    ? `
                      <button
                        type="button"
                        class="btn-outline"
                        data-provider-action="delete"
                        data-id="${escapeHtml(
                          provider.id
                        )}"
                        style="margin-left:8px;"
                      >
                        Eliminar
                      </button>
                    `
                    : ""
                }

                ${
                  !canManageProviders() &&
                  !canDeleteProviders()
                    ? '<span class="small">Solo lectura</span>'
                    : ""
                }
              </td>

            </tr>
          `
        )
        .join("");
  }

  /*
   * ============================================================
   * INICIALIZACIÓN DEL MÓDULO
   * ============================================================
   */

  async function initializeProvidersModule(
    user
  ) {
    if (
      providersInitialized
    ) {
      return;
    }

    providersInitialized =
      true;

    try {
      await resolveContext();

      if (
        !currentLocalId
      ) {
        throw new Error(
          "El usuario no tiene un id_local asignado."
        );
      }

      if (
        typeof window.renderNavigationForRole ===
        "function"
      ) {
        window.renderNavigationForRole(
          currentContext.role ||
            ""
        );
      }

      ensureProvidersDataTable();

      await loadProviders();

      refreshProvidersTable();

      if (btnAdd) {
        btnAdd.style.display =
          canManageProviders()
            ? ""
            : "none";
      }
    } catch (
      error
    ) {
      providersInitialized =
        false;

      console.error(
        "Error inicializando proveedores:",
        error
      );

      if (
        table ||
        btnAdd
      ) {
        await Swal.fire({
          icon:
            "error",

          title:
            "Error",

          text:
            error.message ||
            "No se pudo cargar el módulo de proveedores."
        });
      }
    }
  }

  /*
   * ============================================================
   * EVENTOS DE PÁGINA
   * ============================================================
   */

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      if (
        btnAdd
      ) {
        btnAdd.addEventListener(
          "click",
          openCreateProviderModal
        );
      }

      if (
        providersSearch
      ) {
        providersSearch.addEventListener(
          "input",
          () => {
            const dt =
              ensureProvidersDataTable();

            if (dt) {
              dt.search(
                providersSearch.value
              ).draw();
            }
          }
        );
      }
    }
  );

  /*
   * ============================================================
   * AUTH
   * ============================================================
   */

  const initFromAuth =
    user => {
      if (!user) {
        return;
      }

      const currentPage =
        window.location.pathname
          .split("/")
          .pop()
          .toLowerCase();

      if (
        currentPage ===
        "proveedores.html"
      ) {
        initializeProvidersModule(
          user
        );
      }
    };

  if (
    firebase.auth().currentUser
  ) {
    initFromAuth(
      firebase.auth().currentUser
    );
  } else {
    firebase
      .auth()
      .onAuthStateChanged(
        initFromAuth
      );
  }

  /*
   * ============================================================
   * API GLOBAL
   * ============================================================
   */

  window.proveedoresAPI = {
    loadProviders,
    getProvidersForInventory,
    getProvidersCache,
    getProviderById,
    getProviderOptionsHtml,
    upsertProviderCache,
    removeProviderFromCache
  };
})();