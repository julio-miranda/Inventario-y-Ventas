// assets/js/models/sales.model.js

"use strict";


const firebase =
    window.firebase;

const db =
    window.db;


/*
 * ============================================================
 * MODELO DE VENTAS
 * ============================================================
 */

const salesModel = {

    name:
        "sales",

    title:
        "Ventas",

    page:
        "sales.html",

    public:
        false,

    requiresLocal:
        true,

    roles: [
        "Administrador",
        "Cajero",
        "Vendedor"
    ],


    collections: {

        products:
            window.PRODUCTS_COLLECTION_NAME ||
            "productos",

        sales:
            window.SALES_COLLECTION_NAME ||
            "ventas",

        movements:
            window.MOVEMENTS_COLLECTION_NAME ||
            "stock_movimientos",

        drafts:
            "ventas_borrador"
    },


    permissions: {

        canCreate: [
            "Administrador",
            "Cajero",
            "Vendedor"
        ],

        canEdit: [
            "Administrador"
        ],

        canDelete: [
            "Administrador"
        ]
    },


    state: {

        initialized:
            false,

        initializing:
            false,

        localId:
            "",

        localInfo: {

            id_local:
                "",

            nombre:
                "",

            numeroDocumento:
                "",

            ubicacion:
                "",

            contribuyente:
                "",

            tipoDocumento:
                "",

            nit:
                "",

            nrc:
                ""
        },

        userContext:
            null,

        products:
            {},

        sales:
            {},

        monthlySoldUnits:
            {},

        cart:
            [],

        finalizing:
            false,

        savingDraft:
            false,

        addingToCart:
            false,

        editingSaleIds:
            new Set(),

        deletingSaleIds:
            new Set()
    },


    numberOrZero(
        value
    ) {

        const number =
            Number(
                value
            );

        return Number.isFinite(
            number
        )
            ? number
            : 0;
    },


    getAuthenticatedUser() {

        return (
            window.auth?.currentUser ||
            firebase?.auth?.().currentUser ||
            null
        );
    },


    hasRolePermission(
        permission
    ) {

        const role =
            this.state.userContext?.role ||
            this.state.userContext?.position ||
            "";

        const canonical =
            typeof window.getCanonicalRole ===
            "function"
                ? window.getCanonicalRole(
                    role
                )
                : String(
                    role
                ).trim();

        const roles =
            Array.isArray(
                this.permissions?.[permission]
            )
                ? this.permissions[
                    permission
                ]
                : [];

        return roles.includes(
            canonical
        );
    },


    async resolveContext(
        user
    ) {

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
                "No se pudo resolver el contexto autorizado."
            );
        }

        const role =
            typeof window.getCanonicalRole ===
            "function"
                ? window.getCanonicalRole(
                    context.role ||
                    context.position ||
                    ""
                )
                : String(
                    context.role ||
                    context.position ||
                    ""
                ).trim();

        if (!role) {
            throw new Error(
                "El usuario no tiene un rol válido."
            );
        }

        this.state.userContext = {
            ...context,

            role
        };

        this.state.localId =
            String(
                context.id_local ||
                ""
            ).trim();

        if (!this.state.localId) {
            throw new Error(
                "El usuario autenticado no tiene un id_local asignado."
            );
        }

        this.state.localInfo = {

            id_local:
                this.state.localId,

            nombre:
                String(
                    context.localNombre ||
                    ""
                ).trim(),

            numeroDocumento:
                String(
                    context.localNumeroDocumento ||
                    ""
                ).trim(),

            ubicacion:
                String(
                    context.localUbicacion ||
                    ""
                ).trim(),

            contribuyente:
                String(
                    context.localContribuyente ||
                    ""
                ).trim(),

            tipoDocumento:
                String(
                    context.localTipoDocumento ||
                    ""
                ).trim(),

            nit:
                String(
                    context.localNIT ||
                    ""
                ).trim(),

            nrc:
                String(
                    context.localNRC ||
                    ""
                ).trim()
        };

        return this.state.userContext;
    },


    getLocalPayload() {

        return {

            id_local:
                this.state.localId ||
                "",

            localNombre:
                this.state.localInfo.nombre ||
                "",

            localNumeroDocumento:
                this.state.localInfo.numeroDocumento ||
                "",

            localUbicacion:
                this.state.localInfo.ubicacion ||
                "",

            localContribuyente:
                this.state.localInfo.contribuyente ||
                "",

            localTipoDocumento:
                this.state.localInfo.tipoDocumento ||
                "",

            localNIT:
                this.state.localInfo.nit ||
                "",

            localNRC:
                this.state.localInfo.nrc ||
                ""
        };
    },


    getLocalField(
        data = {}
    ) {

        return String(
            data.id_local ||
            data.idLocal ||
            data.localId ||
            data.idlocal ||
            ""
        ).trim();
    },


    belongsToCurrentLocal(
        data = {}
    ) {

        if (
            !this.state.localId
        ) {
            return false;
        }

        return (
            this.getLocalField(
                data
            ) ===
            this.state.localId
        );
    },


    async ensureSessionCache(
        user
    ) {

        if (!user) {
            throw new Error(
                "No hay un usuario autenticado."
            );
        }

        if (
            typeof window.ensureSessionDataLoaded !==
            "function"
        ) {
            throw new Error(
                "app.js no expuso ensureSessionDataLoaded()."
            );
        }

        await window.ensureSessionDataLoaded(
            user
        );
    },


    readSessionCollection(
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

        const result =
            window.getSessionCollection(
                collectionName
            );

        return Array.isArray(
            result
        )
            ? result
            : [];
    },


    upsertSharedDocument(
        collectionName,
        documentId,
        data
    ) {

        if (
            typeof window.upsertSessionDocument !==
            "function"
        ) {
            return;
        }

        window.upsertSessionDocument(
            collectionName,
            documentId,
            data
        );
    },


    removeSharedDocument(
        collectionName,
        documentId
    ) {

        if (
            typeof window.removeSessionDocument !==
            "function"
        ) {
            return;
        }

        window.removeSessionDocument(
            collectionName,
            documentId
        );
    },


    getDateTimeMillis(
        value
    ) {

        if (
            value ===
                null ||
            value ===
                undefined ||
            value ===
                ""
        ) {
            return null;
        }

        let date;

        if (
            typeof value.toDate ===
            "function"
        ) {

            date =
                value.toDate();

        } else if (
            typeof value.toMillis ===
            "function"
        ) {

            date =
                new Date(
                    value.toMillis()
                );

        } else if (
            typeof value.seconds ===
            "number"
        ) {

            date =
                new Date(
                    value.seconds *
                    1000
                );

        } else if (
            value instanceof
            Date
        ) {

            date =
                value;

        } else {

            date =
                new Date(
                    value
                );
        }

        const millis =
            date.getTime();

        return Number.isFinite(
            millis
        )
            ? millis
            : null;
    },


    getLocalDateInputValue(
        value
    ) {

        const millis =
            this.getDateTimeMillis(
                value
            );

        if (
            millis ===
            null
        ) {
            return "";
        }

        const date =
            new Date(
                millis
            );

        return `${date.getFullYear()}-${String(
            date.getMonth() + 1
        ).padStart(
            2,
            "0"
        )}-${String(
            date.getDate()
        ).padStart(
            2,
            "0"
        )}`;
    },


    getLocalTimeInputValue(
        value
    ) {

        const millis =
            this.getDateTimeMillis(
                value
            );

        if (
            millis ===
            null
        ) {
            return "";
        }

        const date =
            new Date(
                millis
            );

        return `${String(
            date.getHours()
        ).padStart(
            2,
            "0"
        )}:${String(
            date.getMinutes()
        ).padStart(
            2,
            "0"
        )}`;
    },


    buildLocalDateTime(
        dateValue,
        timeValue
    ) {

        const date =
            String(
                dateValue ||
                ""
            ).trim();

        const time =
            String(
                timeValue ||
                ""
            ).trim();

        if (
            !date ||
            !time
        ) {
            return null;
        }

        const dateParts =
            date
                .split("-")
                .map(
                    Number
                );

        const timeParts =
            time
                .split(":")
                .map(
                    Number
                );

        if (
            dateParts.length !==
                3 ||
            timeParts.length <
                2
        ) {
            return null;
        }

        const [
            year,
            month,
            day
        ] =
            dateParts;

        const [
            hours,
            minutes
        ] =
            timeParts;

        if (
            ![
                year,
                month,
                day,
                hours,
                minutes
            ].every(
                Number.isInteger
            )
        ) {
            return null;
        }

        if (
            month < 1 ||
            month > 12 ||
            day < 1 ||
            day > 31 ||
            hours < 0 ||
            hours > 23 ||
            minutes < 0 ||
            minutes > 59
        ) {
            return null;
        }

        const result =
            new Date(
                year,
                month - 1,
                day,
                hours,
                minutes,
                0,
                0
            );

        if (
            result.getFullYear() !==
                year ||
            result.getMonth() !==
                month - 1 ||
            result.getDate() !==
                day ||
            result.getHours() !==
                hours ||
            result.getMinutes() !==
                minutes
        ) {
            return null;
        }

        return result;
    },


    normalizeUnitsPerBox(
        product
    ) {

        const value =
            this.numberOrZero(
                product?.unitsPerBox
            );

        return value >
            0
            ? value
            : 1;
    },


    isBoxProduct(
        product
    ) {

        return Boolean(
            product &&
            (
                product.saleByBox ===
                    true ||
                product.saleMode ===
                    "box" ||
                product.saleType ===
                    "box"
            )
        );
    },


    getDefaultSaleMode(
        product
    ) {

        return this.isBoxProduct(
            product
        )
            ? "box"
            : "unit";
    },


    getDefaultBoxPrice(
        product
    ) {

        const unitsPerBox =
            this.normalizeUnitsPerBox(
                product
            );

        const saved =
            this.numberOrZero(
                product?.boxPrice
            );

        if (
            saved >
            0
        ) {
            return saved;
        }

        return (
            this.numberOrZero(
                product?.price
            ) *
            unitsPerBox
        );
    },


    getAvailableUnits(
        product
    ) {

        if (!product) {
            return 0;
        }

        const stock =
            Number(
                product.stockCurrentUnits
            );

        if (
            Number.isFinite(
                stock
            )
        ) {
            return Math.max(
                0,
                stock
            );
        }

        const quantity =
            Number(
                product.quantity
            );

        if (
            Number.isFinite(
                quantity
            )
        ) {
            return Math.max(
                0,
                quantity
            );
        }

        const base =
            Number(
                product.stockBaseUnits
            );

        if (
            Number.isFinite(
                base
            )
        ) {
            return Math.max(
                0,
                base
            );
        }

        return 0;
    },


    getAvailableBoxes(
        product
    ) {

        return Math.floor(
            this.getAvailableUnits(
                product
            ) /
            this.normalizeUnitsPerBox(
                product
            )
        );
    },


    getProductUnitCost(
        product
    ) {

        if (!product) {
            return 0;
        }

        const directCandidates = [
            product.unitCost,
            product.costoUnitario,
            product.costPerUnit,
            product.costoPorUnidad,
            product.lastCostPerUnit,
            product.ultimoCostoUnitario,
            product.cost,
            product.costo
        ];

        for (
            const candidate of
                directCandidates
        ) {

            const value =
                Number(
                    candidate
                );

            if (
                Number.isFinite(
                    value
                ) &&
                value >=
                    0
            ) {
                return value;
            }
        }

        const unitsPerBox =
            this.normalizeUnitsPerBox(
                product
            );

        const boxCandidates = [
            product.costPerBox,
            product.costoPorCaja,
            product.lastCostPerBox,
            product.ultimoCostoPorCaja
        ];

        for (
            const candidate of
                boxCandidates
        ) {

            const value =
                Number(
                    candidate
                );

            if (
                Number.isFinite(
                    value
                ) &&
                value >=
                    0
            ) {
                return (
                    value /
                    unitsPerBox
                );
            }
        }

        return 0;
    },


    getProductSupplierName(
        product
    ) {

        if (!product) {
            return "";
        }

        const supplier =
            product.proveedor ||
            product.supplier ||
            product.provider ||
            {};

        const candidates = [

            product.proveedorNombre,
            product.nombreProveedor,
            product.supplierName,
            product.providerName,
            product.nombreSupplier,
            product.proveedor_nombre,
            product.supplier_name,
            product.provider_name,

            supplier.proveedorNombre,
            supplier.nombreProveedor,
            supplier.supplierName,
            supplier.providerName,
            supplier.nombre,
            supplier.name,
            supplier.razonSocial,
            supplier.razon_social,
            supplier.businessName,
            supplier.business_name,
            supplier.nombreComercial,
            supplier.commercialName
        ];

        for (
            const candidate of
                candidates
        ) {

            if (
                candidate !==
                    null &&
                candidate !==
                    undefined &&
                String(
                    candidate
                ).trim()
            ) {
                return String(
                    candidate
                ).trim();
            }
        }

        return "";
    },


    async loadProducts() {

        const documents =
            this.readSessionCollection(
                this.collections.products
            );

        const products =
            {};

        documents.forEach(
            document => {

                const id =
                    String(
                        document?.id ||
                        ""
                    ).trim();

                const data =
                    document?.data ||
                    {};

                if (
                    !id ||
                    !this.belongsToCurrentLocal(
                        data
                    )
                ) {
                    return;
                }

                const currentStock =
                    this.getAvailableUnits(
                        data
                    );

                products[id] = {

                    id,

                    ...data,

                    quantity:
                        currentStock,

                    stockCurrentUnits:
                        currentStock,

                    boxes:
                        this.numberOrZero(
                            data.boxes
                        ),

                    unitsPerBox:
                        this.normalizeUnitsPerBox(
                            data
                        )
                };
            }
        );

        this.state.products =
            products;
    },


    async loadSales() {

        const documents =
            this.readSessionCollection(
                this.collections.sales
            );

        const sales =
            {};

        documents.forEach(
            document => {

                const id =
                    String(
                        document?.id ||
                        ""
                    ).trim();

                const data =
                    document?.data ||
                    {};

                if (
                    !id ||
                    !this.belongsToCurrentLocal(
                        data
                    )
                ) {
                    return;
                }

                sales[id] = {

                    id,

                    ...data
                };
            }
        );

        this.state.sales =
            sales;

        this.state.monthlySoldUnits =
            this.aggregateMonthlySales();
    },


    async loadInitialData() {

        await this.ensureSessionCache(
            this.getAuthenticatedUser()
        );

        await Promise.all([
            this.loadProducts(),
            this.loadSales()
        ]);
    },


    getCartSubtotal() {

        return this.state.cart.reduce(
            (
                total,
                item
            ) =>
                total +
                this.numberOrZero(
                    item.total
                ),
            0
        );
    },


    addToCart({
        productId,
        mode,
        quantity,
        customBoxPrice
    }) {

        const product =
            this.state.products[
                productId
            ];

        if (!product) {

            return {
                ok:
                    false,

                title:
                    "Error",

                message:
                    "Producto no encontrado en la sesión."
            };
        }

        const normalizedMode =
            mode ===
                "box"
                ? "box"
                : "unit";

        const normalizedQuantity =
            Math.max(
                1,
                Math.floor(
                    this.numberOrZero(
                        quantity
                    )
                )
            );

        const unitsPerBox =
            this.normalizeUnitsPerBox(
                product
            );

        const availableUnits =
            this.getAvailableUnits(
                product
            );

        if (
            normalizedMode ===
                "box" &&
            unitsPerBox <=
                1
        ) {

            return {
                ok:
                    false,

                title:
                    "No se puede vender por cajas",

                message:
                    "Este producto no tiene unidades por caja configuradas."
            };
        }

        let price;

        if (
            normalizedMode ===
                "box"
        ) {

            const entered =
                this.numberOrZero(
                    customBoxPrice
                );

            price =
                entered >
                    0
                    ? entered
                    : this.getDefaultBoxPrice(
                        product
                    );

        } else {

            price =
                this.numberOrZero(
                    product.price
                );
        }

        const unitsToDiscount =
            normalizedMode ===
                "box"
                ? normalizedQuantity *
                    unitsPerBox
                : normalizedQuantity;

        const currentCartUnits =
            this.state.cart
                .filter(
                    item =>
                        item.productId ===
                        productId
                )
                .reduce(
                    (
                        total,
                        item
                    ) =>
                        total +
                        this.numberOrZero(
                            item.unitsTotal
                        ),
                    0
                );

        if (
            currentCartUnits +
                unitsToDiscount >
            availableUnits
        ) {

            return {
                ok:
                    false,

                title:
                    "Stock insuficiente",

                message:
                    `Stock disponible: ${availableUnits} unidades`
            };
        }

        const existing =
            this.state.cart.find(
                item =>
                    item.productId ===
                        productId &&
                    item.mode ===
                        normalizedMode &&
                    Number(
                        item.price
                    ) ===
                        Number(
                            price
                        )
            );

        if (existing) {

            existing.quantity +=
                normalizedQuantity;

            existing.unitsTotal +=
                unitsToDiscount;

            existing.total =
                existing.quantity *
                existing.price;

        } else {

            this.state.cart.push({

                productId,

                name:
                    product.name ||
                    "",

                mode:
                    normalizedMode,

                price,

                quantity:
                    normalizedQuantity,

                unitsPerBox,

                unitsTotal:
                    unitsToDiscount,

                total:
                    normalizedQuantity *
                    price
            });
        }

        return {
            ok:
                true
        };
    },


    updateCartQuantity(
        index,
        value
    ) {

        const item =
            this.state.cart[
                index
            ];

        if (!item) {
            return {
                ok:
                    false
            };
        }

        const quantity =
            Number(
                value
            );

        if (
            !Number.isFinite(
                quantity
            ) ||
            quantity <
                1
        ) {

            return {
                ok:
                    false,

                message:
                    "La cantidad no es válida."
            };
        }

        const product =
            this.state.products[
                item.productId
            ];

        const available =
            this.getAvailableUnits(
                product
            );

        const unitsPerBox =
            this.normalizeUnitsPerBox(
                product
            );

        const newUnitsTotal =
            item.mode ===
                "box"
                ? quantity *
                    unitsPerBox
                : quantity;

        const otherUnits =
            this.state.cart
                .filter(
                    (
                        other,
                        otherIndex
                    ) =>
                        otherIndex !==
                            index &&
                        other.productId ===
                            item.productId
                )
                .reduce(
                    (
                        total,
                        other
                    ) =>
                        total +
                        this.numberOrZero(
                            other.unitsTotal
                        ),
                    0
                );

        if (
            otherUnits +
                newUnitsTotal >
            available
        ) {

            return {
                ok:
                    false,

                message:
                    `Stock disponible: ${available} unidades`
            };
        }

        item.quantity =
            quantity;

        item.unitsTotal =
            newUnitsTotal;

        item.total =
            this.numberOrZero(
                item.price
            ) *
            quantity;

        return {
            ok:
                true
        };
    },


    updateCartPrice(
        index,
        value
    ) {

        const item =
            this.state.cart[
                index
            ];

        if (!item) {
            return {
                ok:
                    false
            };
        }

        const price =
            Number(
                value
            );

        if (
            !Number.isFinite(
                price
            ) ||
            price <
                0
        ) {

            return {
                ok:
                    false,

                message:
                    "El precio no es válido."
            };
        }

        item.price =
            price;

        item.total =
            price *
            this.numberOrZero(
                item.quantity
            );

        return {
            ok:
                true
        };
    },


    removeCartItem(
        index
    ) {

        if (
            index <
                0 ||
            index >=
                this.state.cart.length
        ) {
            return;
        }

        this.state.cart.splice(
            index,
            1
        );
    },


    clearCart() {

        this.state.cart =
            [];
    },


    serializeCart() {

        return this.state.cart.map(
            item => ({

                productId:
                    item.productId,

                name:
                    item.name,

                price:
                    this.numberOrZero(
                        item.price
                    ),

                quantity:
                    this.numberOrZero(
                        item.quantity
                    ),

                mode:
                    item.mode,

                unitsPerBox:
                    this.numberOrZero(
                        item.unitsPerBox
                    ) ||
                    1,

                unitsTotal:
                    this.numberOrZero(
                        item.unitsTotal
                    ),

                total:
                    this.numberOrZero(
                        item.total
                    )
            })
        );
    },


    createMovementPayload({

        productId,

        productName,

        tipoMovimiento,

        referenciaLibro,

        numeroDocumento,

        entrada,

        salida,

        saldoAnterior,

        saldoActual,

        detalle,

        userName,

        userId,

        costoUnitario,

        supplierName,

        createdAt

    }) {

        const cost =
            this.numberOrZero(
                costoUnitario
            );

        const supplier =
            String(
                supplierName ||
                ""
            ).trim();

        return {

            productId,

            productName:
                productName ||
                "",

            tipoMovimiento,

            referenciaLibro:
                referenciaLibro ||
                "",

            referenceBook:
                referenciaLibro ||
                "",

            bookReference:
                referenciaLibro ||
                "",

            numeroDocumento:
                numeroDocumento ||
                "",

            entrada:
                this.numberOrZero(
                    entrada
                ),

            salida:
                this.numberOrZero(
                    salida
                ),

            saldoAnterior:
                this.numberOrZero(
                    saldoAnterior
                ),

            saldoActual:
                this.numberOrZero(
                    saldoActual
                ),

            costoUnitario:
                cost,

            unitCost:
                cost,

            costoPorUnidad:
                cost,

            proveedorNombre:
                supplier,

            nombreProveedor:
                supplier,

            supplierName:
                supplier,

            providerName:
                supplier,

            detalle:
                detalle ||
                "",

            userId:
                userId ||
                null,

            userName:
                userName ||
                null,

            createdAt:
                createdAt ??
                Date.now(),

            ...this.getLocalPayload()
        };
    },


    getSaleProductId(
        product
    ) {

        return String(
            product?.productId ||
            product?.productID ||
            product?.product_id ||
            product?.id ||
            ""
        ).trim();
    },


    getSaleUnits(
        product
    ) {

        if (!product) {
            return 0;
        }

        const unitsPerBox =
            Math.max(
                1,
                this.numberOrZero(
                    product.unitsPerBox
                )
            );

        const mode =
            String(
                product.mode ||
                product.saleMode ||
                product.saleType ||
                ""
            ).toLowerCase();

        const quantity =
            this.numberOrZero(
                product.quantity
            );

        const explicitUnits =
            this.numberOrZero(
                product.unitsTotal ||
                product.totalUnits
            );

        if (
            explicitUnits >
                0
        ) {
            return explicitUnits;
        }

        if (
            mode ===
            "box"
        ) {
            return (
                quantity *
                unitsPerBox
            );
        }

        return quantity;
    },


    normalizeSaleProducts(
        products
    ) {

        return (
            Array.isArray(
                products
            )
                ? products
                : []
        ).map(
            product => {

                const productId =
                    this.getSaleProductId(
                        product
                    );

                const cached =
                    this.state.products[
                        productId
                    ];

                const mode =
                    String(
                        product.mode ||
                        product.saleMode ||
                        product.saleType ||
                        ""
                    ).toLowerCase() ===
                        "box"
                        ? "box"
                        : "unit";

                const unitsPerBox =
                    Math.max(
                        1,
                        this.numberOrZero(
                            product.unitsPerBox ||
                            cached?.unitsPerBox ||
                            1
                        )
                    );

                const quantity =
                    Math.max(
                        1,
                        this.numberOrZero(
                            product.quantity
                        )
                    );

                const price =
                    Math.max(
                        0,
                        this.numberOrZero(
                            product.price
                        )
                    );

                const unitsTotal =
                    mode ===
                        "box"
                        ? quantity *
                            unitsPerBox
                        : quantity;

                return {

                    productId,

                    name:
                        String(
                            product.name ||
                            cached?.name ||
                            ""
                        ),

                    price,

                    quantity,

                    mode,

                    unitsPerBox,

                    unitsTotal,

                    total:
                        quantity *
                        price
                };
            }
        );
    },


    getSaleUnitsByProduct(
        sale
    ) {

        const result =
            {};

        const products =
            Array.isArray(
                sale?.products
            )
                ? sale.products
                : [];

        products.forEach(
            product => {

                const productId =
                    this.getSaleProductId(
                        product
                    );

                if (!productId) {
                    return;
                }

                const units =
                    this.getSaleUnits(
                        product
                    );

                result[
                    productId
                ] =
                    (
                        result[
                            productId
                        ] ||
                        0
                    ) +
                    units;
            }
        );

        return result;
    },


    isCurrentMonth(
        sale
    ) {

        const millis =
            this.getDateTimeMillis(
                sale?.createdAt
            );

        if (
            millis ===
            null
        ) {
            return false;
        }

        const now =
            new Date();

        const start =
            new Date(
                now.getFullYear(),
                now.getMonth(),
                1,
                0,
                0,
                0,
                0
            );

        const next =
            new Date(
                now.getFullYear(),
                now.getMonth() +
                    1,
                1,
                0,
                0,
                0,
                0
            );

        return (
            millis >=
                start.getTime() &&
            millis <
                next.getTime()
        );
    },


    aggregateMonthlySales() {

        const result =
            {};

        Object.values(
            this.state.sales
        ).forEach(
            sale => {

                if (
                    !this.belongsToCurrentLocal(
                        sale
                    )
                ) {
                    return;
                }

                if (
                    !this.isCurrentMonth(
                        sale
                    )
                ) {
                    return;
                }

                const products =
                    Array.isArray(
                        sale.products
                    )
                        ? sale.products
                        : [];

                products.forEach(
                    product => {

                        const id =
                            this.getSaleProductId(
                                product
                            );

                        if (!id) {
                            return;
                        }

                        const units =
                            this.getSaleUnits(
                                product
                            );

                        result[id] =
                            (
                                result[id] ||
                                0
                            ) +
                            units;
                    }
                );
            }
        );

        return result;
    },


    async finalizeSale({
        reference,
        saleDateTime,
        user
    }) {

        if (
            !this.state.cart.length
        ) {
            throw new Error(
                "El carrito está vacío."
            );
        }

        if (
            !this.state.localId
        ) {
            throw new Error(
                "No se pudo identificar el local activo."
            );
        }

        if (!user) {
            throw new Error(
                "La sesión ya no está disponible."
            );
        }

        if (!db) {
            throw new Error(
                "La conexión con Firestore no está disponible."
            );
        }

        const saleRef =
            db
                .collection(
                    this.collections.sales
                )
                .doc();

        const total =
            this.getCartSubtotal();

        const saleTimestamp =
            firebase.firestore.Timestamp.fromDate(
                saleDateTime
            );

        const userId =
            user.uid;

        const userName =
            this.state.userContext?.name ||
            user.displayName ||
            user.email ||
            "Usuario";

        const unitsByProduct =
            {};

        this.state.cart.forEach(
            item => {

                const id =
                    String(
                        item.productId
                    );

                unitsByProduct[id] =
                    (
                        unitsByProduct[id] ||
                        0
                    ) +
                    this.numberOrZero(
                        item.unitsTotal
                    );
            }
        );

        const productIds =
            Object.keys(
                unitsByProduct
            );

        const saleProducts =
            this.serializeCart();

        const movementRefs =
            {};

        const movementPayloads =
            {};

        productIds.forEach(
            id => {

                movementRefs[id] =
                    db
                        .collection(
                            this.collections.movements
                        )
                        .doc();
            }
        );


        await db.runTransaction(
            async transaction => {

                const products =
                    {};

                for (
                    const productId of
                        productIds
                ) {

                    const productRef =
                        db
                            .collection(
                                this.collections.products
                            )
                            .doc(
                                productId
                            );

                    const snapshot =
                        await transaction.get(
                            productRef
                        );

                    if (
                        !snapshot.exists
                    ) {
                        throw new Error(
                            `El producto ${productId} no existe.`
                        );
                    }

                    const data =
                        snapshot.data() ||
                        {};

                    if (
                        !this.belongsToCurrentLocal(
                            data
                        )
                    ) {
                        throw new Error(
                            `El producto ${data.name || productId} no pertenece al local actual.`
                        );
                    }

                    products[
                        productId
                    ] = {

                        ref:
                            productRef,

                        data
                    };
                }


                productIds.forEach(
                    productId => {

                        const info =
                            products[
                                productId
                            ];

                        const product =
                            info.data;

                        const units =
                            this.numberOrZero(
                                unitsByProduct[
                                    productId
                                ]
                            );

                        const current =
                            this.getAvailableUnits(
                                product
                            );

                        if (
                            units >
                            current
                        ) {
                            throw new Error(
                                `Stock insuficiente para "${product.name || productId}". Disponible: ${current}`
                            );
                        }

                        const next =
                            current -
                            units;

                        const unitsPerBox =
                            this.normalizeUnitsPerBox(
                                product
                            );

                        transaction.update(
                            info.ref,
                            {

                                quantity:
                                    next,

                                stockCurrentUnits:
                                    next,

                                boxes:
                                    Math.floor(
                                        next /
                                        unitsPerBox
                                    ),

                                updatedAt:
                                    firebase.firestore
                                        .FieldValue
                                        .serverTimestamp()
                            }
                        );


                        const movement =
                            this.createMovementPayload({

                                productId,

                                productName:
                                    product.name ||
                                    productId,

                                tipoMovimiento:
                                    "salida",

                                referenciaLibro:
                                    reference,

                                numeroDocumento:
                                    saleRef.id,

                                entrada:
                                    0,

                                salida:
                                    units,

                                saldoAnterior:
                                    current,

                                saldoActual:
                                    next,

                                costoUnitario:
                                    this.getProductUnitCost(
                                        product
                                    ),

                                supplierName:
                                    this.getProductSupplierName(
                                        product
                                    ),

                                detalle:
                                    `Salida por venta ${saleRef.id} - Referencia: ${reference}`,

                                userId,

                                userName,

                                createdAt:
                                    Date.now()
                            });


                        movementPayloads[
                            productId
                        ] =
                            movement;


                        transaction.set(
                            movementRefs[
                                productId
                            ],
                            {

                                ...movement,

                                createdAt:
                                    firebase.firestore
                                        .FieldValue
                                        .serverTimestamp()
                            }
                        );
                    }
                );


                transaction.set(
                    saleRef,
                    {

                        products:
                            saleProducts,

                        total,

                        referenciaLibro:
                            reference,

                        createdAt:
                            saleTimestamp,

                        userId,

                        userName,

                        ...this.getLocalPayload()
                    }
                );
            }
        );


        productIds.forEach(
            productId => {

                const product =
                    this.state.products[
                        productId
                    ];

                if (!product) {
                    return;
                }

                const units =
                    this.numberOrZero(
                        unitsByProduct[
                            productId
                        ]
                    );

                const current =
                    this.getAvailableUnits(
                        product
                    );

                const next =
                    Math.max(
                        0,
                        current -
                        units
                    );

                const unitsPerBox =
                    this.normalizeUnitsPerBox(
                        product
                    );

                product.quantity =
                    next;

                product.stockCurrentUnits =
                    next;

                product.boxes =
                    Math.floor(
                        next /
                        unitsPerBox
                    );


                this.upsertSharedDocument(
                    this.collections.products,
                    productId,
                    {

                        quantity:
                            next,

                        stockCurrentUnits:
                            next,

                        boxes:
                            Math.floor(
                                next /
                                unitsPerBox
                            ),

                        updatedAt:
                            Date.now()
                    }
                );
            }
        );


        const saleCache = {

            id:
                saleRef.id,

            products:
                saleProducts,

            total,

            referenciaLibro:
                reference,

            createdAt:
                saleDateTime.getTime(),

            userId,

            userName,

            ...this.getLocalPayload()
        };


        this.state.sales[
            saleRef.id
        ] =
            saleCache;


        this.upsertSharedDocument(
            this.collections.sales,
            saleRef.id,
            saleCache
        );


        productIds.forEach(
            productId => {

                const movementRef =
                    movementRefs[
                        productId
                    ];

                const payload =
                    movementPayloads[
                        productId
                    ];

                if (
                    !movementRef ||
                    !payload
                ) {
                    return;
                }

                this.upsertSharedDocument(
                    this.collections.movements,
                    movementRef.id,
                    {

                        ...payload,

                        id:
                            movementRef.id,

                        createdAt:
                            Date.now()
                    }
                );
            }
        );


        this.state.monthlySoldUnits =
            this.aggregateMonthlySales();

        this.clearCart();

        return saleCache;
    },


    async saveDraft({
        reference,
        saleDateTime,
        user
    }) {

        if (!user) {
            throw new Error(
                "La sesión ya no está disponible."
            );
        }

        const payload = {

            products:
                this.serializeCart(),

            total:
                this.getCartSubtotal(),

            referenciaLibro:
                reference,

            createdAt:
                firebase.firestore.Timestamp.fromDate(
                    saleDateTime
                ),

            userId:
                user.uid,

            userName:
                this.state.userContext?.name ||
                user.displayName ||
                user.email ||
                null,

            ...this.getLocalPayload()
        };

        return db
            .collection(
                this.collections.drafts
            )
            .add(
                payload
            );
    },


    async updateSale({
        saleId,
        reference,
        createdAt,
        editorId,
        editorName
    }) {

        if (
            !this.hasRolePermission(
                "canEdit"
            )
        ) {
            throw new Error(
                "No tienes permiso para editar ventas."
            );
        }

        const sale =
            this.state.sales[
                saleId
            ];

        if (!sale) {
            throw new Error(
                "La venta no existe."
            );
        }

        if (
            !this.belongsToCurrentLocal(
                sale
            )
        ) {
            throw new Error(
                "La venta no pertenece al local actual."
            );
        }

        const saleRef =
            db
                .collection(
                    this.collections.sales
                )
                .doc(
                    saleId
                );

        await db.runTransaction(
            async transaction => {

                const snapshot =
                    await transaction.get(
                        saleRef
                    );

                if (
                    !snapshot.exists
                ) {
                    throw new Error(
                        "La venta ya no existe."
                    );
                }

                const current =
                    snapshot.data() ||
                    {};

                if (
                    !this.belongsToCurrentLocal(
                        current
                    )
                ) {
                    throw new Error(
                        "La venta no pertenece al local actual."
                    );
                }

                transaction.update(
                    saleRef,
                    {

                        referenciaLibro:
                            reference,

                        createdAt:
                            firebase.firestore
                                .Timestamp
                                .fromDate(
                                    createdAt
                                ),

                        editedAt:
                            firebase.firestore
                                .FieldValue
                                .serverTimestamp(),

                        editedBy:
                            editorId,

                        editedByName:
                            editorName,

                        ...this.getLocalPayload()
                    }
                );
            }
        );


        const millis =
            createdAt.getTime();

        sale.referenciaLibro =
            reference;

        sale.createdAt =
            millis;

        sale.editedAt =
            Date.now();

        sale.editedBy =
            editorId;

        sale.editedByName =
            editorName;

        Object.assign(
            sale,
            this.getLocalPayload()
        );


        this.upsertSharedDocument(
            this.collections.sales,
            saleId,
            {

                referenciaLibro:
                    reference,

                createdAt:
                    millis,

                editedAt:
                    Date.now(),

                editedBy:
                    editorId,

                editedByName:
                    editorName,

                ...this.getLocalPayload()
            }
        );


        this.state.monthlySoldUnits =
            this.aggregateMonthlySales();

        return sale;
    },


    async deleteSale({
        saleId,
        user
    }) {

        if (
            !this.hasRolePermission(
                "canDelete"
            )
        ) {
            throw new Error(
                "Solo un administrador puede eliminar ventas."
            );
        }

        if (!user) {
            throw new Error(
                "La sesión ya no está disponible."
            );
        }

        const sale =
            this.state.sales[
                saleId
            ];

        if (!sale) {
            throw new Error(
                "No se encontró la venta."
            );
        }

        if (
            !this.belongsToCurrentLocal(
                sale
            )
        ) {
            throw new Error(
                "La venta no pertenece al local actual."
            );
        }

        const products =
            this.normalizeSaleProducts(
                sale.products
            );

        if (!products.length) {
            throw new Error(
                "La venta no contiene productos válidos."
            );
        }

        const unitsByProduct =
            this.getSaleUnitsByProduct({
                products
            });

        const productIds =
            Object.keys(
                unitsByProduct
            );

        if (!productIds.length) {
            throw new Error(
                "No se pudieron determinar las unidades consumidas."
            );
        }

        const userId =
            user.uid;

        const userName =
            this.state.userContext?.name ||
            user.displayName ||
            user.email ||
            "Usuario";

        const saleRef =
            db
                .collection(
                    this.collections.sales
                )
                .doc(
                    saleId
                );

        const movementRefs =
            {};

        const movementPayloads =
            {};

        productIds.forEach(
            productId => {

                movementRefs[
                    productId
                ] =
                    db
                        .collection(
                            this.collections.movements
                        )
                        .doc();
            }
        );


        await db.runTransaction(
            async transaction => {

                const saleSnapshot =
                    await transaction.get(
                        saleRef
                    );

                if (
                    !saleSnapshot.exists
                ) {
                    throw new Error(
                        "La venta ya no existe."
                    );
                }

                const latestSale =
                    saleSnapshot.data() ||
                    {};

                if (
                    !this.belongsToCurrentLocal(
                        latestSale
                    )
                ) {
                    throw new Error(
                        "La venta no pertenece al local actual."
                    );
                }

                const productsCache =
                    {};

                for (
                    const productId of
                        productIds
                ) {

                    const productRef =
                        db
                            .collection(
                                this.collections.products
                            )
                            .doc(
                                productId
                            );

                    const snapshot =
                        await transaction.get(
                            productRef
                        );

                    if (
                        !snapshot.exists
                    ) {
                        throw new Error(
                            `El producto ${productId} no existe.`
                        );
                    }

                    const data =
                        snapshot.data() ||
                        {};

                    if (
                        !this.belongsToCurrentLocal(
                            data
                        )
                    ) {
                        throw new Error(
                            `El producto ${data.name || productId} no pertenece al local actual.`
                        );
                    }

                    productsCache[
                        productId
                    ] = {

                        ref:
                            productRef,

                        data
                    };
                }


                productIds.forEach(
                    productId => {

                        const units =
                            this.numberOrZero(
                                unitsByProduct[
                                    productId
                                ]
                            );

                        if (
                            units <=
                            0
                        ) {
                            return;
                        }

                        const info =
                            productsCache[
                                productId
                            ];

                        const current =
                            this.getAvailableUnits(
                                info.data
                            );

                        const next =
                            current +
                            units;

                        const unitsPerBox =
                            this.normalizeUnitsPerBox(
                                info.data
                            );

                        transaction.update(
                            info.ref,
                            {

                                quantity:
                                    next,

                                stockCurrentUnits:
                                    next,

                                boxes:
                                    Math.floor(
                                        next /
                                        unitsPerBox
                                    ),

                                updatedAt:
                                    firebase.firestore
                                        .FieldValue
                                        .serverTimestamp()
                            }
                        );


                        const movement =
                            this.createMovementPayload({

                                productId,

                                productName:
                                    info.data.name ||
                                    productId,

                                tipoMovimiento:
                                    "eliminacion_venta",

                                referenciaLibro:
                                    latestSale.referenciaLibro ||
                                    "venta",

                                numeroDocumento:
                                    saleId,

                                entrada:
                                    units,

                                salida:
                                    0,

                                saldoAnterior:
                                    current,

                                saldoActual:
                                    next,

                                costoUnitario:
                                    this.getProductUnitCost(
                                        info.data
                                    ),

                                supplierName:
                                    this.getProductSupplierName(
                                        info.data
                                    ),

                                detalle:
                                    `Devolución de ${units} unidades por eliminación de venta ${saleId}.`,

                                userId,

                                userName,

                                createdAt:
                                    Date.now()
                            });


                        movementPayloads[
                            productId
                        ] =
                            movement;


                        transaction.set(
                            movementRefs[
                                productId
                            ],
                            {

                                ...movement,

                                createdAt:
                                    firebase.firestore
                                        .FieldValue
                                        .serverTimestamp()
                            }
                        );
                    }
                );


                transaction.delete(
                    saleRef
                );
            }
        );


        productIds.forEach(
            productId => {

                const product =
                    this.state.products[
                        productId
                    ];

                if (!product) {
                    return;
                }

                const units =
                    this.numberOrZero(
                        unitsByProduct[
                            productId
                        ]
                    );

                const current =
                    this.getAvailableUnits(
                        product
                    );

                const next =
                    current +
                    units;

                const unitsPerBox =
                    this.normalizeUnitsPerBox(
                        product
                    );

                product.quantity =
                    next;

                product.stockCurrentUnits =
                    next;

                product.boxes =
                    Math.floor(
                        next /
                        unitsPerBox
                    );

                this.upsertSharedDocument(
                    this.collections.products,
                    productId,
                    {

                        quantity:
                            next,

                        stockCurrentUnits:
                            next,

                        boxes:
                            Math.floor(
                                next /
                                unitsPerBox
                            ),

                        updatedAt:
                            Date.now()
                    }
                );
            }
        );


        delete this.state.sales[
            saleId
        ];

        this.removeSharedDocument(
            this.collections.sales,
            saleId
        );


        productIds.forEach(
            productId => {

                const movementRef =
                    movementRefs[
                        productId
                    ];

                const payload =
                    movementPayloads[
                        productId
                    ];

                if (
                    !movementRef ||
                    !payload
                ) {
                    return;
                }

                this.upsertSharedDocument(
                    this.collections.movements,
                    movementRef.id,
                    {

                        ...payload,

                        id:
                            movementRef.id,

                        createdAt:
                            Date.now()
                    }
                );
            }
        );


        this.state.monthlySoldUnits =
            this.aggregateMonthlySales();

        return true;
    }
};


export default salesModel;