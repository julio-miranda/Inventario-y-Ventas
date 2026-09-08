"use strict";

/*

* ============================================================
* CONTROLADOR MVC - PROVEEDORES
* ============================================================
*
* Este archivo reemplaza completamente al antiguo:
*
* 
  assets/js/proveedores.js
  
*
* Contiene:
*
* * Contexto del usuario
* * Permisos
* * Lectura desde caché central de app.js
* * CRUD de proveedores
* * Validación
* * Modales
* * DataTable
* * API para inventario
* * Actualización de caché
* * Inicialización MVC
*
* IMPORTANTE:
*
* router.js es el único responsable de registrar este
* controller en AppRouter.
*
* Este archivo:
*
* * NO llama registerSecurePageController().
* * NO registra el controller en InventoryMVC.controllers.
*
* Sí expone:
*
* 
  window.proveedoresAPI
  
*
* para que inventory.controller.js pueda reutilizar los
* proveedores.
*
* ============================================================
  */

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
* FIREBASE
* ============================================================
  */

if (
  typeof firebase ===
  "undefined"
) {

  console.error(
    "Firebase no se ha cargado correctamente."
  );

  throw new Error(
    "Firebase no está disponible."
  );

}

const db =
  window.db ||
  firebase.firestore();

const auth =
  window.auth ||
  firebase.auth();

/*

* ============================================================
* MODELO / VISTA
* ============================================================
  */

const model =
  mvc.models.proveedores ||
  {


    name:
      "proveedores",

    title:
      "Proveedores",

    page:
      "proveedores.html",

    public:
      false,

    requiresLocal:
      true,

    roles: [

      "Administrador",

      "Bodega"

    ],

    collections: {

      providers:
        window.SUPPLIER_COLLECTION_NAME ||
        "proveedores",

      products:
        window.PRODUCTS_COLLECTION_NAME ||
        "productos"

    },

    permissions: {

      canCreate: [

        "Administrador",

        "Bodega"

      ],

      canEdit: [

        "Administrador",

        "Bodega"

      ],

      canDelete: [

        "Administrador"

      ]

    }


  };

const view =
  mvc.views.proveedores ||
  null;

/*

* ============================================================
* COLECCIONES
* ============================================================
  */

const SUPPLIER_COLLECTION =

  model.collections?.providers ||

  window.SUPPLIER_COLLECTION_NAME ||

  "proveedores";

const PRODUCTS_COLLECTION =

  model.collections?.products ||

  window.PRODUCTS_COLLECTION_NAME ||

  "productos";

/*

* ============================================================
* ESTADO
* ============================================================
  */

let providersInitialized =
  false;

let providersInitializingPromise =
  null;

let providersLoadPromise =
  null;

let providersDT =
  null;

let currentUser =
  null;

let currentContext =
  null;

let currentRole =
  "";

let currentLocalId =
  "";

let domEventsBound =
  false;

/*

* ============================================================
* ELEMENTOS
* ============================================================
  */

function getElements() {

  if (


    view &&

    typeof view.getElements ===
    "function"


  ) {


    return view.getElements();


  }

  return {


    table:
      document.getElementById(
        "providersTable"
      ),

    tableBody:
      document.querySelector(
        "#providersTable tbody"
      ),

    addButton:
      document.getElementById(
        "btnAddProvider"
      ),

    totalCard:
      document.getElementById(
        "totalProvidersCard"
      ),

    searchInput:
      document.getElementById(
        "providersSearch"
      )


  };

}

/*

* ============================================================
* UTILIDADES
* ============================================================
  */

function escapeHtml(
  value
) {

  if (
    view &&
    typeof view.escapeHtml ===
    "function"
  ) {

    return view.escapeHtml(
      value
    );

  }

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

/*

* ============================================================
* ROLES
* ============================================================
  */

function canonicalRole(
  role = ""
) {

  if (


    typeof window.getCanonicalRole ===
    "function"


  ) {


    return window.getCanonicalRole(
      role
    );


  }

  switch (


  String(
    role || ""
  )
    .trim()
    .toLowerCase()


  ) {


    case "admin":
    case "administrador":

      return "Administrador";


    case "bodega":
    case "inventario":

      return "Bodega";


    case "cajero":

      return "Cajero";


    case "vendedor":

      return "Vendedor";


    case "desarrollador":
    case "developer":

      return "Desarrollador";


    default:

      return "";


  }

}

/*

* ============================================================
* PERMISOS
* ============================================================
  */

function roleHasPermission(
  role,
  permissionName
) {

  const canonical =
    canonicalRole(
      role
    );

  const permissions =
    Array.isArray(
      model.permissions?.[
      permissionName
      ]
    )


      ? model.permissions[
      permissionName
      ]

      : [];


  return permissions.some(


    allowedRole =>

      canonicalRole(
        allowedRole
      ) ===
      canonical


  );

}

function canCreateProviders() {

  return roleHasPermission(


    currentRole,

    "canCreate"


  );

}

function canEditProviders() {

  return roleHasPermission(


    currentRole,

    "canEdit"


  );

}

function canDeleteProviders() {

  return roleHasPermission(


    currentRole,

    "canDelete"


  );

}

function canManageProviders() {

  return (


    canCreateProviders() ||

    canEditProviders()


  );

}

/*

* ============================================================
* CAMPOS DEL PROVEEDOR
* ============================================================
  */

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

async function resolveContext(
  user = auth.currentUser
) {

  const authenticatedUser =
    user ||
    auth.currentUser;

  if (
    !authenticatedUser
  ) {


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
      authenticatedUser
    );

  if (
    !context
  ) {


    throw new Error(
      "No se pudo resolver el contexto del usuario."
    );


  }

  currentUser =
    authenticatedUser;

  currentContext =
    context;

  currentRole =
    canonicalRole(


      context.role ||

      context.position ||

      ""

    );


  currentLocalId =
    String(


      context.id_local ||

      ""

    ).trim();


  if (
    !currentRole
  ) {


    throw new Error(
      "El usuario no tiene un rol válido configurado."
    );


  }

  const requiresLocal =


    typeof window.roleRequiresLocal ===
      "function"

      ? window.roleRequiresLocal(
        currentRole
      )

      : currentRole !==
      "Desarrollador";


  if (


    requiresLocal &&

    !currentLocalId


  ) {


    throw new Error(
      "El usuario no tiene un id_local asignado."
    );


  }

  return context;

}

/*

* ============================================================
* CACHE CENTRAL
* ============================================================
  */

function getSessionCollection(
  collectionName
) {

  if (


    typeof window.getSessionCollection !==
    "function"


  ) {


    throw new Error(
      "app.js no expuso getSessionCollection()."
    );


  }

  const documents =
    window.getSessionCollection(
      collectionName
    );

  return Array.isArray(
    documents
  )


    ? documents

    : [];


}

/*

* ============================================================
* PROVEEDORES DESDE CACHE
* ============================================================
  */

function getSessionProviders() {

  const documents =
    getSessionCollection(
      SUPPLIER_COLLECTION
    );

  return documents


    .map(
      item => {

        const id =
          String(

            item?.id ||

            ""

          ).trim();


        const data =
          item?.data ||
          {};


        return {

          id,

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

            data.idLocal ||

            data.localId ||

            data.idlocal ||

            currentLocalId

        };

      }
    )

    .filter(

      provider =>

        String(

          provider.id_local ||

          ""

        ).trim() ===

        String(

          currentLocalId ||

          ""

        ).trim()

    )

    .sort(

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

/*

* ============================================================
* PRODUCTOS DESDE CACHE
* ============================================================
  */

function getSessionProducts() {

  const documents =
    getSessionCollection(
      PRODUCTS_COLLECTION
    );

  return documents.filter(


    ({
      data
    }) => {

      const dataLocalId =
        String(

          data?.id_local ||

          data?.idLocal ||

          data?.localId ||

          data?.idlocal ||

          ""

        ).trim();


      return (

        dataLocalId ===
        currentLocalId

      );

    }


  );

}

/*

* ============================================================
* GARANTIZAR CACHE
* ============================================================
  */

async function ensureCentralSessionData() {

  if (
    !currentUser
  ) {


    throw new Error(
      "No existe usuario autenticado."
    );


  }

  if (


    typeof window.ensureSessionDataLoaded ===
    "function"


  ) {


    await window.ensureSessionDataLoaded(
      currentUser
    );


  }

  return getSessionProviders();

}

/*

* ============================================================
* CARGAR PROVEEDORES
* ============================================================
*
* No realiza lecturas directas a Firestore.
* ============================================================
  */

async function loadProviders(
  forceRefresh = false
) {

  if (


    !currentUser ||

    !currentContext ||

    !currentLocalId


  ) {


    await resolveContext();


  }

  if (
    !currentLocalId
  ) {


    throw new Error(
      "El usuario no tiene id_local asignado."
    );


  }

  if (
    forceRefresh
  ) {


    providersLoadPromise =
      null;


  }

  if (
    providersLoadPromise
  ) {


    return providersLoadPromise;


  }

  providersLoadPromise =
    Promise.resolve(
      getSessionProviders()
    );

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

  if (
    !target
  ) {


    return null;


  }

  return (


    getSessionProviders().find(

      provider =>

        String(
          provider.id
        ).trim() ===
        target

    ) ||

    null


  );

}

/*

* ============================================================
* OPTIONS DE PROVEEDORES
* ============================================================
  */

function getProviderOptionsHtml(
  selectedId = "",
  options = {}
) {

  const includeEmpty =
    options.includeEmpty !==
    false;

  const disabled =
    options.disabled ===
    true;

  const selected =
    String(
      selectedId ||
      ""
    ).trim();

  const providers =
    getSessionProviders();

  const html =
    [];

  if (
    includeEmpty
  ) {


    html.push(`

  <option value="">

    Selecciona un proveedor

  </option>

`);


  }

  providers.forEach(


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

      ${id === selected
          ? "selected"
          : ""
        }

      ${disabled
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
* CACHE - UPSERT
* ============================================================
  */

function normalizeProviderForCache(
  provider
) {

  return {


    ...provider,

    id_local:

      provider.id_local ||

      currentLocalId,

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

}

function upsertProviderCache(
  provider
) {

  if (


    typeof window.upsertSessionDocument !==
    "function"


  ) {


    console.warn(
      "app.js no expuso upsertSessionDocument()."
    );

    return;


  }

  const normalizedProvider =
    normalizeProviderForCache(
      provider
    );

  const providerId =
    String(


      normalizedProvider.id ||

      ""

    ).trim();


  if (
    !providerId
  ) {


    console.warn(
      "No se puede actualizar la caché: proveedor sin ID."
    );

    return;


  }

  /*
  
  * IMPORTANTE:
  *
  * upsertSessionDocument:
  *
  * * actualiza si el ID ya existe;
  * * agrega si el ID no existe.
  *
  * Nunca reemplaza la colección completa.
    */

  window.upsertSessionDocument(


    SUPPLIER_COLLECTION,

    providerId,

    normalizedProvider


  );

  providersLoadPromise =
    null;

  refreshProvidersTable();

}

function removeProviderFromCache(
  providerId
) {

  if (


    typeof window.removeSessionDocument !==
    "function"


  ) {


    console.warn(
      "app.js no expuso removeSessionDocument()."
    );

    return;


  }

  window.removeSessionDocument(


    SUPPLIER_COLLECTION,

    providerId


  );

  providersLoadPromise =
    null;

  refreshProvidersTable();

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

  const normalized = {


    nombre:
      String(
        values?.nombre ||
        ""
      ).trim(),

    razonSocialDenominacion:
      String(
        values?.razonSocialDenominacion ||
        ""
      ).trim(),

    nacionalidad:
      String(
        values?.nacionalidad ||
        ""
      ).trim(),

    nit:
      String(
        values?.nit ||
        ""
      ).trim(),

    nrc:
      String(
        values?.nrc ||
        ""
      ).trim(),

    ubicacion:
      String(
        values?.ubicacion ||
        ""
      ).trim()


  };

  if (
    !normalized.nombre
  ) {


    return (
      "El nombre del proveedor es obligatorio."
    );


  }

  if (
    !normalized.razonSocialDenominacion
  ) {


    return (
      "La Razón Social o Denominación es obligatoria."
    );


  }

  if (
    !normalized.nacionalidad
  ) {


    return (
      "La nacionalidad del proveedor es obligatoria."
    );


  }

  /*
  
  * ==========================================================
  * DUPLICADOS
  * ==========================================================
  *
  * Solamente se considera duplicado cuando coinciden:
  *
  * 
    Nombre
    
  *
  * y
  *
  * 
    Razón Social / Denominación
    
  *
  * simultáneamente.
    */

  const providers =
    getSessionProviders();

  const ignoredId =
    String(
      ignoreId ||
      ""
    ).trim();

  const duplicate =
    providers.find(


      provider => {

        const providerId =
          String(

            provider.id ||

            ""

          ).trim();


        if (

          ignoredId &&

          providerId ===
          ignoredId

        ) {

          return false;

        }


        const sameName =

          normalizeText(

            getProviderName(
              provider
            )

          ) ===

          normalizeText(
            normalized.nombre
          );


        const sameBusinessName =

          normalizeText(

            getProviderBusinessName(
              provider
            )

          ) ===

          normalizeText(

            normalized.razonSocialDenominacion

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
    !canCreateProviders()
  ) {


    throw new Error(

      "No tienes permisos para registrar proveedores."

    );


  }

  if (


    !currentUser ||

    !currentContext ||

    !currentLocalId


  ) {


    await resolveContext();


  }

  if (
    !currentLocalId
  ) {


    throw new Error(

      "El usuario no tiene id_local asignado."

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

  const payload = {


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


  };

  /*
  
  * ==========================================================
  * FIRESTORE
  * ==========================================================
  *
  * .add() siempre crea un documento nuevo.
  *
  * NO utiliza un ID fijo.
  * ==========================================================
    */

  const ref =
    await db


      .collection(
        SUPPLIER_COLLECTION
      )

      .add(
        payload
      );


  const provider = {


    id:
      ref.id,

    ...normalizedValues,

    id_local:
      currentLocalId


  };

  /*
  
  * ==========================================================
  * CACHE
  * ==========================================================
    */

  upsertProviderCache(
    provider
  );

  providersLoadPromise =
    null;

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
    !canEditProviders()
  ) {


    throw new Error(

      "No tienes permisos para editar proveedores."

    );


  }

  const targetId =
    String(
      providerId ||
      ""
    ).trim();

  if (
    !targetId
  ) {


    throw new Error(
      "El ID del proveedor no es válido."
    );


  }

  const provider =
    getProviderById(
      targetId
    );

  if (
    !provider
  ) {


    throw new Error(

      "El proveedor no existe en la sesión actual."

    );


  }

  const validation =
    validateProviderData(


      values,

      targetId

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
      targetId
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

    ...normalizedValues,

    id:
      targetId,

    id_local:
      currentLocalId


  });

  providersLoadPromise =
    null;

}

/*

* ============================================================
* ELIMINAR
* ============================================================
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

  const targetId =
    String(
      providerId ||
      ""
    ).trim();

  if (
    !targetId
  ) {


    throw new Error(
      "El ID del proveedor no es válido."
    );


  }

  const provider =
    getProviderById(
      targetId
    );

  if (
    !provider
  ) {


    throw new Error(

      "El proveedor no existe en la sesión actual."

    );


  }

  /*
  
  * ---
  * Verificar productos utilizando caché central.
  * ---
  
  */

  const products =
    getSessionProducts();

  const usedByProduct =
    products.some(


      ({
        data
      }) => {

        const productProviderId =
          String(

            data?.proveedorId ||

            data?.proveedor_id ||

            data?.supplierId ||

            ""

          ).trim();


        return (

          productProviderId ===
          targetId

        );

      }

    );


  if (
    usedByProduct
  ) {


    throw new Error(

      "No se puede eliminar este proveedor porque está asociado a uno o más productos."

    );


  }

  /*
  
  * ---
  * Eliminar Firestore.
  * ---
  
  */

  await db


    .collection(
      SUPPLIER_COLLECTION
    )

    .doc(
      targetId
    )

    .delete();


  /*
  
  * ---
  * Eliminar cache.
  * ---
  
  */

  removeProviderFromCache(
    targetId
  );

  providersLoadPromise =
    null;

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
    autocomplete="off"
    placeholder="Nombre del proveedor"
    value="${escapeHtml(

    getProviderName(
      provider
    )

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
    autocomplete="off"
    placeholder="Razón Social o Denominación"
    value="${escapeHtml(

    getProviderBusinessName(
      provider
    )

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
    autocomplete="off"
    placeholder="Ej. Salvadoreña"
    value="${escapeHtml(

    getProviderNationality(
      provider
    )

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

  const valueOf =
    id =>


      String(

        document
          .getElementById(
            id
          )
          ?.value ||

        ""

      ).trim();


  return {


    nombre:
      valueOf(
        "provider-name"
      ),

    razonSocialDenominacion:
      valueOf(
        "provider-business"
      ),

    nacionalidad:
      valueOf(
        "provider-nationality"
      ),

    nit:
      valueOf(
        "provider-nit"
      ),

    nrc:
      valueOf(
        "provider-nrc"
      ),

    ubicacion:
      valueOf(
        "provider-location"
      )


  };

}

/*

* ============================================================
* MODAL CREAR
* ============================================================
  */

async function openCreateProviderModal() {

  if (
    !canCreateProviders()
  ) {


    await Swal.fire(

      "Sin permisos",

      "No tienes permisos para registrar proveedores.",

      "warning"

    );


    return;


  }

  /*
  
  * Refrescar referencias desde caché antes de abrir
  * el formulario.
    */

  await ensureCentralSessionData();

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

      allowOutsideClick:
        () => !Swal.isLoading(),

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


            return false;

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
    !canEditProviders()
  ) {


    await Swal.fire(

      "Sin permisos",

      "No tienes permisos para editar proveedores.",

      "warning"

    );


    return;


  }

  const targetId =
    String(
      providerId ||
      ""
    ).trim();

  const provider =
    getProviderById(
      targetId
    );

  if (
    !provider
  ) {


    await Swal.fire(

      "No encontrado",

      "El proveedor no existe en la sesión actual.",

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

      allowOutsideClick:
        () => !Swal.isLoading(),

      preConfirm:
        () => {

          const values =
            readProviderFormValues();


          const validation =
            validateProviderData(

              values,

              targetId

            );


          if (
            validation
          ) {

            Swal.showValidationMessage(
              validation
            );


            return false;

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

      targetId,

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
* ELIMINAR
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

  const targetId =
    String(
      providerId ||
      ""
    ).trim();

  const provider =
    getProviderById(
      targetId
    );

  if (
    !provider
  ) {


    return;


  }

  const result =
    await Swal.fire({


      title:

        `¿Eliminar "${escapeHtml(

          getProviderName(
            provider
          )

        )}"?`,

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
      targetId
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

  const elements =
    getElements();

  const table =
    elements.table;

  if (
    providersDT
  ) {


    return providersDT;


  }

  if (


    !window.jQuery ||

    !window.jQuery.fn ||

    !window.jQuery.fn.DataTable ||

    !table


  ) {


    return null;


  }

  const $ =
    window.jQuery;

  providersDT =
    $("#providersTable")
      .DataTable({


        data:
          [],

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
                    data ||
                    ""
                  )

                  : data ||
                  ""

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
                    data ||
                    ""
                  )

                  : data ||
                  ""

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
                    data ||
                    ""
                  )

                  : data ||
                  ""

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


                let html =
                  "";


                if (
                  canEditProviders()
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

                  <i
                    class="fas fa-edit"
                  ></i>

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
                  style="
                    margin-left:8px;
                  "
                >

                  <i
                    class="fas fa-trash"
                  ></i>

                  Eliminar

                </button>

              `;

                }


                if (
                  !html
                ) {

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


  /*
  
  * ==========================================================
  * EVENTOS DATATABLE
  * ==========================================================
    */

  $(
    "#providersTable tbody"
  ).on(


    "click",

    "button[data-provider-action='edit']",

    function () {

      const id =
        String(

          $(this).data(
            "id"
          ) ||

          ""

        ).trim();


      openEditProviderModal(
        id
      );

    }


  );

  $(
    "#providersTable tbody"
  ).on(


    "click",

    "button[data-provider-action='delete']",

    function () {

      const id =
        String(

          $(this).data(
            "id"
          ) ||

          ""

        ).trim();


      confirmDeleteProvider(
        id
      );

    }


  );

  return providersDT;

}

/*

* ============================================================
* REFRESCAR TABLA
* ============================================================
  */

function refreshProvidersTable() {

  const elements =
    getElements();

  const dt =
    ensureProvidersDataTable();

  let providers =
    [];

  try {


    providers =
      getSessionProviders();


  } catch (
  error
  ) {


    console.error(

      "No se pudo obtener proveedores desde la caché:",

      error

    );


    providers =
      [];


  }

  if (
    elements.totalCard
  ) {


    elements.totalCard.textContent =
      String(
        providers.length
      );


  }

  /*
  
  * ---
  * DataTable
  * ---
  
  */

  if (
    dt
  ) {


    const currentSearch =

      elements.searchInput

        ? elements.searchInput.value.trim()

        : "";


    dt.clear();


    dt.rows.add(
      providers
    );


    dt.draw(
      false
    );


    if (
      currentSearch
    ) {

      dt.search(
        currentSearch
      ).draw(
        false
      );

    }


    return;


  }

  /*
  
  * ---
  * Fallback HTML
  * ---
  
  */

  const table =
    elements.table;

  if (
    !table
  ) {


    return;


  }

  const tbody =
    elements.tableBody ||
    table.querySelector(
      "tbody"
    );

  if (
    !tbody
  ) {


    return;


  }

  tbody.innerHTML =


    providers

      .map(

        provider => `

      <tr>

        <td>
          ${escapeHtml(
          getProviderName(
            provider
          )
        )}
        </td>

        <td>
          ${escapeHtml(
          getProviderBusinessName(
            provider
          )
        )}
        </td>

        <td>
          ${escapeHtml(
          getProviderNationality(
            provider
          )
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

          ${canEditProviders()

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

          ${canDeleteProviders()

            ? `

                <button
                  type="button"
                  class="btn-outline"
                  data-provider-action="delete"
                  data-id="${escapeHtml(
              provider.id
            )}"
                  style="
                    margin-left:8px;
                  "
                >

                  Eliminar

                </button>

              `

            : ""

          }

          ${!canEditProviders() &&
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
* EVENTOS DOM
* ============================================================
  */

function bindDomEvents() {

  if (
    domEventsBound
  ) {


    return;


  }

  const elements =
    getElements();

  /*
  
  * ---
  * Botón agregar
  * ---
  
  */

  if (
    elements.addButton
  ) {


    elements.addButton.addEventListener(

      "click",

      openCreateProviderModal

    );


  }

  /*
  
  * ---
  * Búsqueda
  * ---
  
  */

  if (
    elements.searchInput
  ) {


    elements.searchInput.addEventListener(

      "input",

      () => {

        const dt =
          ensureProvidersDataTable();


        if (
          dt
        ) {

          dt.search(
            elements.searchInput.value
          ).draw();

        } else {

          refreshProvidersTable();

        }

      }

    );


  }

  domEventsBound =
    true;

}

/*

* ============================================================
* UI DE PERMISOS
* ============================================================
  */

function syncPermissionUI() {

  const elements =
    getElements();

  if (
    elements.addButton
  ) {


    const allowed =
      canCreateProviders();


    elements.addButton.style.display =

      allowed
        ? ""
        : "none";


    elements.addButton.disabled =
      !allowed;


    if (
      allowed
    ) {

      elements.addButton.removeAttribute(
        "aria-disabled"
      );

    } else {

      elements.addButton.setAttribute(
        "aria-disabled",
        "true"
      );

    }


  }

  refreshProvidersTable();

}

/*

* ============================================================
* CONTEXTO GLOBAL DEL MÓDULO
* ============================================================
  */

function exposeContext() {

  const providerContext = {


    user:
      currentUser,

    context:
      currentContext,

    role:
      currentRole,

    id_local:
      currentLocalId,

    canCreate:
      canCreateProviders(),

    canEdit:
      canEditProviders(),

    canDelete:
      canDeleteProviders()


  };

  window.proveedoresContext =
    providerContext;

  window.currentProvidersContext =
    providerContext;

}

/*

* ============================================================
* INICIALIZACIÓN
* ============================================================
  */

async function init(
  user,
  context,
  state
) {

  /*
  
  * ---
  * Ya inicializado.
  * ---
  
  */

  if (
    providersInitialized
  ) {


    exposeContext();

    syncPermissionUI();

    return true;


  }

  /*
  
  * ---
  * Inicialización concurrente.
  * ---
  
  */

  if (
    providersInitializingPromise
  ) {


    return providersInitializingPromise;


  }

  providersInitializingPromise =
    (async () => {


      /*
       * --------------------------------------------------------
       * Resolver usuario/contexto.
       * --------------------------------------------------------
       */

      await resolveContext(
        user
      );


      /*
       * --------------------------------------------------------
       * Validar router.
       * --------------------------------------------------------
       */

      if (
        state
      ) {

        if (
          state.authorized ===
          false
        ) {

          throw new Error(

            "El acceso al módulo de proveedores no está autorizado."

          );

        }


        const stateRole =
          canonicalRole(
            state.role ||
            ""
          );


        if (

          stateRole &&

          stateRole !==
          currentRole

        ) {

          throw new Error(

            "El rol de la sesión no coincide con el contexto actual."

          );

        }

      }


      /*
       * --------------------------------------------------------
       * Roles permitidos.
       * --------------------------------------------------------
       */

      const allowedRole =

        currentRole ===
        "Administrador" ||

        currentRole ===
        "Bodega";


      if (
        !allowedRole
      ) {

        throw new Error(

          "Tu rol no tiene acceso al módulo de proveedores."

        );

      }


      /*
       * --------------------------------------------------------
       * Navegación.
       * --------------------------------------------------------
       */

      if (

        typeof window.renderNavigationForRole ===
        "function"

      ) {

        window.renderNavigationForRole(
          currentRole
        );

      }


      /*
       * --------------------------------------------------------
       * Cache.
       * --------------------------------------------------------
       */

      await ensureCentralSessionData();


      /*
       * --------------------------------------------------------
       * DOM.
       * --------------------------------------------------------
       */

      bindDomEvents();

      ensureProvidersDataTable();


      /*
       * --------------------------------------------------------
       * Proveedores.
       * --------------------------------------------------------
       */

      await loadProviders(
        false
      );


      /*
       * --------------------------------------------------------
       * Contexto.
       * --------------------------------------------------------
       */

      exposeContext();


      /*
       * --------------------------------------------------------
       * Tabla.
       * --------------------------------------------------------
       */

      refreshProvidersTable();


      syncPermissionUI();


      /*
       * --------------------------------------------------------
       * Finalizado.
       * --------------------------------------------------------
       */

      providersInitialized =
        true;


      console.log(

        "[Proveedores Controller] Inicializado correctamente:",

        {

          role:
            currentRole,

          id_local:
            currentLocalId,

          providers:

            getSessionProviders()
              .length

        }

      );


      return true;

    })();


  try {


    return await providersInitializingPromise;


  } catch (
  error
  ) {


    providersInitialized =
      false;


    console.error(

      "[Proveedores Controller] Error inicializando:",

      error

    );


    throw error;


  } finally {


    providersInitializingPromise =
      null;


  }

}

/*

* ============================================================
* API GLOBAL
* ============================================================
*
* Esta API sí debe permanecer global.
*
* inventory.controller.js puede utilizar:
*
* 
  window.proveedoresAPI.getProvidersForInventory()
  
*
* 
  window.proveedoresAPI.getProviderOptionsHtml()
  
*
* 
  window.proveedoresAPI.getProviderById()
  
*
* ============================================================
  */

const proveedoresAPI = {

  loadProviders,

  getProvidersForInventory,

  getProvidersCache:
    () =>
      getSessionProviders(),

  getProviderById,

  getProviderOptionsHtml,

  upsertProviderCache,

  removeProviderFromCache,

  createProvider,

  updateProvider,

  deleteProvider,

  validateProviderData,

  refreshProvidersTable,

  getContext:
    () => ({


      user:
        currentUser,

      context:
        currentContext,

      role:
        currentRole,

      id_local:
        currentLocalId,

      canCreate:
        canCreateProviders(),

      canEdit:
        canEditProviders(),

      canDelete:
        canDeleteProviders()

    })


};

window.proveedoresAPI =
  proveedoresAPI;

/*

* ============================================================
* CONTROLLER MVC
* ============================================================
*
* IMPORTANTE:
*
* Se exporta directamente.
*
* NO hacer:
*
* 
  mvc.controllers.proveedores = controller;
  
*
* porque router.js ya obtiene el controller desde la
* exportación del módulo y después lo registra.
*
* Esto evita el conflicto:
*
* 
  proveedores.html::proveedores
  
*
* ============================================================
  */

const controller = {

  name:
    model.name ||
    "proveedores",

  page:
    model.page ||
    "proveedores.html",

  pageFile:
    model.page ||
    "proveedores.html",

  public:
    model.public === true,

  requiresLocal:
    model.requiresLocal !== false,

  roles:


    Array.isArray(
      model.roles
    )

      ? model.roles

      : [

        "Administrador",

        "Bodega"

      ],


  init,

  getContext:
    () => ({


      user:
        currentUser,

      context:
        currentContext,

      role:
        currentRole,

      id_local:
        currentLocalId,

      canCreate:
        canCreateProviders(),

      canEdit:
        canEditProviders(),

      canDelete:
        canDeleteProviders()

    }),


  canCreate:
    canCreateProviders,

  canEdit:
    canEditProviders,

  canDelete:
    canDeleteProviders

};

/*

* ============================================================
* EXPORTACIÓN
* ============================================================
  */

export default controller;

export {

  controller,

  init,

  loadProviders,

  getProvidersForInventory,

  getProviderById,

  getProviderOptionsHtml,

  createProvider,

  updateProvider,

  deleteProvider

};