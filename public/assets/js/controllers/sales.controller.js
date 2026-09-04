// assets/js/controllers/sales.controller.js

"use strict";


import salesModel
    from "../models/sales.model.js";

import salesView
    from "../views/sales.view.js";


let saleSaveTimers =
    {};

let resizeBound =
    false;


const state =
    salesModel.state;


/*
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

function getUser() {

    return salesModel.getAuthenticatedUser();
}


function showWarning(
    result
) {

    return salesView.fire(

        result.title ||
            "Advertencia",

        result.message ||
            "La operación no se pudo completar.",

        "warning"
    );
}


function renderCart() {

    salesView.renderCart(
        salesModel,
        {

            onQuantityChange:
                updateCartQuantity,

            onPriceChange:
                updateCartPrice,

            onRemove:
                removeCartItem,

            onWarning:
                showWarning
        }
    );
}


function renderAll() {

    salesView.refreshProductSelect(
        salesModel
    );

    salesView.syncModeFromProduct(
        salesModel
    );

    salesView.renderSalesTable(
        salesModel
    );

    renderCart();

    salesView.bindTableEvents({

        onSaleEdit:
            scheduleSaleSave,

        onSaleDelete:
            deleteSale
    });
}


/*
 * ============================================================
 * CARRITO
 * ============================================================
 */

async function addToCart() {

    if (
        state.addingToCart
    ) {
        return;
    }

    state.addingToCart =
        true;

    try {

        const elements =
            salesView.getElements();

        const productId =
            elements.productSelect?.value ||
            "";

        if (!productId) {

            await salesView.toast(
                "warning",
                "Selecciona un producto",
                1400
            );

            return;
        }

        const result =
            salesModel.addToCart({

                productId,

                mode:
                    elements.saleMode?.value ||
                    "unit",

                quantity:
                    elements.saleQuantity?.value ||
                    1,

                customBoxPrice:
                    elements.boxPriceInput?.value ||
                    0
            });


        if (
            !result.ok
        ) {

            await salesView.fire(

                result.title ||
                    "Error",

                result.message ||
                    "No se pudo añadir el producto.",

                result.title
                    ? "warning"
                    : "error"
            );

            return;
        }


        if (
            !elements.cartSaleDate?.value ||
            !elements.cartSaleTime?.value
        ) {

            salesView.setCartSaleDateTime(
                salesModel,
                new Date()
            );
        }


        renderCart();


        if (
            elements.saleQuantity
        ) {

            elements.saleQuantity.value =
                "1";
        }


        if (
            window.jQuery &&
            typeof $.fn.select2 ===
                "function" &&
            elements.productSelect
        ) {

            $(
                elements.productSelect
            )
                .val(
                    null
                )
                .trigger(
                    "change"
                );

        } else if (
            elements.productSelect
        ) {

            elements.productSelect.value =
                "";
        }


        salesView.updateSaleModeUI(
            salesModel
        );


        await salesView.toast(
            "success",
            "Producto añadido",
            1200
        );

    } finally {

        state.addingToCart =
            false;
    }
}


function updateCartQuantity(
    index,
    value
) {

    const result =
        salesModel.updateCartQuantity(
            index,
            value
        );

    if (
        result &&
        result.ok ===
            false
    ) {
        return result;
    }

    renderCart();

    return result;
}


function updateCartPrice(
    index,
    value
) {

    const result =
        salesModel.updateCartPrice(
            index,
            value
        );

    if (
        result &&
        result.ok ===
            false
    ) {
        return result;
    }

    renderCart();

    return result;
}


function removeCartItem(
    index
) {

    salesModel.removeCartItem(
        index
    );

    renderCart();
}


async function clearCart() {

    if (
        !state.cart.length
    ) {
        return;
    }

    const result =
        await salesView.alert({

            title:
                "¿Limpiar carrito?",

            icon:
                "question",

            showCancelButton:
                true,

            confirmButtonText:
                "Sí, limpiar",

            cancelButtonText:
                "Cancelar"
        });


    if (
        !result.isConfirmed
    ) {
        return;
    }


    salesModel.clearCart();

    renderCart();
}


/*
 * ============================================================
 * FINALIZAR VENTA
 * ============================================================
 */

async function finalizeSale() {

    if (
        state.finalizing
    ) {
        return;
    }

    if (
        !state.cart.length
    ) {

        await salesView.fire(

            "Carrito vacío",

            "Agrega productos al carrito antes de finalizar.",

            "info"
        );

        return;
    }


    if (
        !state.localId
    ) {

        await salesView.fire(

            "Sin local",

            "No se pudo identificar el local activo.",

            "error"
        );

        return;
    }


    const dateValidation =
        salesView.getSaleDateTimeFromForm(
            salesModel
        );


    if (
        !dateValidation.valid
    ) {

        await salesView.fire(

            "Fecha u hora requerida",

            dateValidation.message,

            "warning"
        );

        return;
    }


    const reference =
        salesView.getReference();

    const saleDateTime =
        dateValidation.dateTime;


    const confirmationHtml =
        state.cart
            .map(
                item =>
                    `
                    <div
                        style="
                            display:flex;
                            justify-content:space-between;
                            gap:12px;
                        "
                    >

                        <span>

                            ${salesView.escapeHtml(
                                item.name
                            )}

                            x${item.quantity}

                            ${
                                item.mode ===
                                    "box"
                                    ? "(cajas)"
                                    : "(unid.)"
                            }

                        </span>

                        <strong>
                            ${salesView.currency(
                                item.total
                            )}
                        </strong>

                    </div>
                    `
            )
            .join("");


    const confirmation =
        await salesView.alert({

            title:
                "Finalizar venta",

            html:
                `
                <div style="text-align:left;">

                    ${confirmationHtml}

                    <hr>

                    <div
                        style="
                            display:flex;
                            justify-content:space-between;
                            margin-top:6px;
                        "
                    >

                        <strong>
                            Fecha:
                        </strong>

                        <strong>
                            ${salesView.escapeHtml(
                                saleDateTime.toLocaleDateString()
                            )}
                        </strong>

                    </div>


                    <div
                        style="
                            display:flex;
                            justify-content:space-between;
                            margin-top:6px;
                        "
                    >

                        <strong>
                            Hora:
                        </strong>

                        <strong>
                            ${salesView.escapeHtml(
                                saleDateTime.toLocaleTimeString(
                                    [],
                                    {
                                        hour:
                                            "2-digit",

                                        minute:
                                            "2-digit"
                                    }
                                )
                            )}
                        </strong>

                    </div>


                    <div
                        style="
                            display:flex;
                            justify-content:space-between;
                            margin-top:6px;
                        "
                    >

                        <strong>
                            Referencia:
                        </strong>

                        <strong>
                            ${salesView.escapeHtml(
                                reference
                            )}
                        </strong>

                    </div>


                    <div
                        style="
                            display:flex;
                            justify-content:space-between;
                            margin-top:6px;
                        "
                    >

                        <strong>
                            Total:
                        </strong>

                        <strong>
                            ${salesView.currency(
                                salesModel.getCartSubtotal()
                            )}
                        </strong>

                    </div>

                </div>
                `,

            showCancelButton:
                true,

            confirmButtonText:
                "Confirmar venta",

            cancelButtonText:
                "Cancelar",

            width:
                500
        });


    if (
        !confirmation.isConfirmed
    ) {
        return;
    }


    state.finalizing =
        true;

    salesView.setControlsDisabled(
        true
    );


    try {

        const user =
            getUser();


        await salesModel.finalizeSale({

            reference,

            saleDateTime,

            user
        });


        salesView.refreshProductSelect(
            salesModel
        );

        salesView.syncModeFromProduct(
            salesModel
        );

        salesView.renderSalesTable(
            salesModel
        );

        salesView.bindTableEvents({

            onSaleEdit:
                scheduleSaleSave,

            onSaleDelete:
                deleteSale
        });


        salesView.setReference(
            ""
        );


        salesView.setCartSaleDateTime(
            salesModel,
            new Date()
        );


        renderCart();


        await salesView.toast(

            "success",

            "Venta registrada",

            1500
        );

    } catch (
        error
    ) {

        console.error(
            "[SalesController] Error finalizando venta:",
            error
        );


        await salesView.fire(

            "Error",

            error.message ||
                "No se pudo finalizar la venta.",

            "error"
        );

    } finally {

        state.finalizing =
            false;

        salesView.setControlsDisabled(
            false
        );

        salesView.updateCartSummary(
            salesModel
        );

        salesView.updateSaleModeUI(
            salesModel
        );
    }
}


/*
 * ============================================================
 * BORRADOR
 * ============================================================
 */

async function saveDraft() {

    if (
        state.savingDraft
    ) {
        return;
    }


    if (
        !state.cart.length
    ) {

        await salesView.fire(

            "Carrito vacío",

            "Agrega productos antes de guardar un borrador.",

            "info"
        );

        return;
    }


    const dateValidation =
        salesView.getSaleDateTimeFromForm(
            salesModel
        );


    if (
        !dateValidation.valid
    ) {

        await salesView.fire(

            "Fecha u hora requerida",

            dateValidation.message,

            "warning"
        );

        return;
    }


    state.savingDraft =
        true;


    const elements =
        salesView.getElements();


    if (
        elements.saveDraftButton
    ) {

        elements.saveDraftButton.disabled =
            true;
    }


    try {

        const user =
            getUser();


        await salesModel.saveDraft({

            reference:
                salesView.getReference(),

            saleDateTime:
                dateValidation.dateTime,

            user
        });


        await salesView.toast(

            "success",

            "Borrador guardado",

            1400
        );

    } catch (
        error
    ) {

        console.error(
            "[SalesController] Error guardando borrador:",
            error
        );


        await salesView.fire(

            "Error",

            error.message ||
                "No se pudo guardar el borrador.",

            "error"
        );

    } finally {

        state.savingDraft =
            false;


        if (
            elements.saveDraftButton
        ) {

            elements.saveDraftButton.disabled =
                false;
        }
    }
}


/*
 * ============================================================
 * EDICIÓN
 * ============================================================
 */

function scheduleSaleSave(
    saleId
) {

    if (!saleId) {
        return;
    }


    if (
        saleSaveTimers[
            saleId
        ]
    ) {

        clearTimeout(
            saleSaveTimers[
                saleId
            ]
        );
    }


    saleSaveTimers[
        saleId
    ] =
        setTimeout(
            () => {

                delete saleSaveTimers[
                    saleId
                ];

                saveInlineSale(
                    saleId
                );
            },
            350
        );
}


async function saveInlineSale(
    saleId
) {

    if (
        !salesModel.hasRolePermission(
            "canEdit"
        )
    ) {
        return;
    }


    if (
        state.editingSaleIds.has(
            saleId
        ) ||
        state.deletingSaleIds.has(
            saleId
        )
    ) {
        return;
    }


    const sale =
        state.sales[
            saleId
        ];

    if (!sale) {
        return;
    }


    const values =
        salesView.getInlineSaleValues(
            saleId,
            salesModel
        );


    if (
        !values ||
        !values.createdAt
    ) {

        await salesView.fire(

            "Fecha u hora inválida",

            "La fecha y la hora de la venta no son válidas.",

            "error"
        );

        return;
    }


    const oldReference =
        String(
            sale.referenciaLibro ||
            "venta"
        ).trim();


    const oldMillis =
        salesModel.getDateTimeMillis(
            sale.createdAt
        );


    const newMillis =
        values.createdAt.getTime();


    if (
        oldReference ===
            values.reference &&
        oldMillis ===
            newMillis
    ) {
        return;
    }


    state.editingSaleIds.add(
        saleId
    );


    try {

        const user =
            getUser();


        await salesModel.updateSale({

            saleId,

            reference:
                values.reference,

            createdAt:
                values.createdAt,

            editorId:
                user.uid,

            editorName:
                salesModel.state.userContext?.name ||
                user.displayName ||
                user.email ||
                "Usuario"
        });


        salesView.renderSalesTable(
            salesModel
        );

        salesView.bindTableEvents({

            onSaleEdit:
                scheduleSaleSave,

            onSaleDelete:
                deleteSale
        });


        await salesView.toast(

            "success",

            "Venta actualizada",

            1200
        );

    } catch (
        error
    ) {

        console.error(
            "[SalesController] Error actualizando venta:",
            error
        );


        await salesView.fire(

            "Error",

            error.message ||
                "No se pudo actualizar la venta.",

            "error"
        );

    } finally {

        state.editingSaleIds.delete(
            saleId
        );
    }
}


/*
 * ============================================================
 * ELIMINAR VENTA
 * ============================================================
 */

async function deleteSale(
    saleId
) {

    if (
        !salesModel.hasRolePermission(
            "canDelete"
        )
    ) {

        await salesView.fire(

            "Acceso denegado",

            "Solo un administrador puede eliminar ventas.",

            "error"
        );

        return;
    }


    if (
        state.deletingSaleIds.has(
            saleId
        )
    ) {
        return;
    }


    if (
        saleSaveTimers[
            saleId
        ]
    ) {

        clearTimeout(
            saleSaveTimers[
                saleId
            ]
        );

        delete saleSaveTimers[
            saleId
        ];
    }


    const sale =
        state.sales[
            saleId
        ];

    if (!sale) {

        await salesView.fire(

            "Error",

            "No se encontró la venta.",

            "error"
        );

        return;
    }


    const confirmation =
        await salesView.alert({

            title:
                "¿Eliminar venta?",

            text:
                "La venta será eliminada y las unidades vendidas serán devueltas al inventario.",

            icon:
                "warning",

            showCancelButton:
                true,

            confirmButtonText:
                "Sí, eliminar",

            cancelButtonText:
                "Cancelar",

            confirmButtonColor:
                "#d33"
        });


    if (
        !confirmation.isConfirmed
    ) {
        return;
    }


    state.deletingSaleIds.add(
        saleId
    );


    try {

        const user =
            getUser();


        await salesModel.deleteSale({

            saleId,

            user
        });


        salesView.refreshProductSelect(
            salesModel
        );

        salesView.syncModeFromProduct(
            salesModel
        );

        salesView.renderSalesTable(
            salesModel
        );

        salesView.bindTableEvents({

            onSaleEdit:
                scheduleSaleSave,

            onSaleDelete:
                deleteSale
        });


        await salesView.toast(

            "success",

            "Venta eliminada",

            1600
        );

    } catch (
        error
    ) {

        console.error(
            "[SalesController] Error eliminando venta:",
            error
        );


        await salesView.fire(

            "Error",

            error.message ||
                "No se pudo eliminar la venta.",

            "error"
        );

    } finally {

        state.deletingSaleIds.delete(
            saleId
        );
    }
}


/*
 * ============================================================
 * EVENTOS DOM
 * ============================================================
 */

function bindDomEvents() {

    const elements =
        salesView.getElements();


    if (
        elements.productSelect &&
        elements.productSelect.dataset
            .salesControllerBound !==
            "1"
    ) {

        elements.productSelect.dataset
            .salesControllerBound =
            "1";


        elements.productSelect.addEventListener(
            "change",
            () => {

                salesView.syncModeFromProduct(
                    salesModel
                );
            }
        );
    }


    if (
        elements.saleMode &&
        elements.saleMode.dataset
            .salesControllerBound !==
            "1"
    ) {

        elements.saleMode.dataset
            .salesControllerBound =
            "1";


        elements.saleMode.addEventListener(
            "change",
            () => {

                salesView.updateSaleModeUI(
                    salesModel
                );
            }
        );
    }


    if (
        elements.addToCartButton &&
        elements.addToCartButton.dataset
            .salesControllerBound !==
            "1"
    ) {

        elements.addToCartButton.dataset
            .salesControllerBound =
            "1";


        elements.addToCartButton.addEventListener(
            "click",
            event => {

                event.preventDefault();

                addToCart();
            }
        );
    }


    if (
        elements.clearCartButton &&
        elements.clearCartButton.dataset
            .salesControllerBound !==
            "1"
    ) {

        elements.clearCartButton.dataset
            .salesControllerBound =
            "1";


        elements.clearCartButton.addEventListener(
            "click",
            event => {

                event.preventDefault();

                clearCart();
            }
        );
    }


    if (
        elements.finalizeButton &&
        elements.finalizeButton.dataset
            .salesControllerBound !==
            "1"
    ) {

        elements.finalizeButton.dataset
            .salesControllerBound =
            "1";


        elements.finalizeButton.addEventListener(
            "click",
            event => {

                event.preventDefault();

                finalizeSale();
            }
        );
    }


    if (
        elements.saveDraftButton &&
        elements.saveDraftButton.dataset
            .salesControllerBound !==
            "1"
    ) {

        elements.saveDraftButton.dataset
            .salesControllerBound =
            "1";


        elements.saveDraftButton.addEventListener(
            "click",
            event => {

                event.preventDefault();

                saveDraft();
            }
        );
    }


    if (
        !resizeBound
    ) {

        resizeBound =
            true;


        window.addEventListener(
            "resize",
            () => {

                renderCart();
            }
        );
    }
}


/*
 * ============================================================
 * INICIALIZACIÓN
 * ============================================================
 */

async function initialize(
    user
) {

    if (
        state.initialized
    ) {
        return;
    }

    if (
        state.initializing
    ) {
        return;
    }

    state.initializing =
        true;


    try {

        if (!user) {

            throw new Error(
                "No hay un usuario autenticado."
            );
        }


        await salesModel.resolveContext(
            user
        );


        const role =
            state.userContext?.role ||
            "";


        if (
            !salesModel.roles.includes(
                role
            )
        ) {

            throw new Error(
                `El rol ${role || "actual"} no está autorizado para el módulo de ventas.`
            );
        }


        if (
            typeof window.renderNavigationForRole ===
            "function"
        ) {

            window.renderNavigationForRole(
                role
            );
        }


        salesView.setGreeting(

            state.userContext?.name ||
                "Usuario",

            role
        );


        bindDomEvents();


        salesView.ensureTableHeader();


        salesView.ensureDataTable();


        salesView.initializeSelect2();


        salesView.setCartSaleDateTime(

            salesModel,

            new Date()
        );


        await salesModel.loadInitialData();


        renderAll();


        state.initialized =
            true;

    } catch (
        error
    ) {

        state.initialized =
            false;

        console.error(
            "[SalesController] Error inicializando:",
            error
        );

        throw error;

    } finally {

        state.initializing =
            false;
    }
}


/*
 * ============================================================
 * CONTROLADOR PÚBLICO
 * ============================================================
 */

const salesController = {

    name:
        salesModel.name,

    page:
        salesModel.page,

    public:
        salesModel.public,

    requiresLocal:
        salesModel.requiresLocal,

    roles:
        salesModel.roles,

    init:
        initialize,

    state,

    refresh:
        async () => {

            const user =
                getUser();

            if (!user) {
                return;
            }

            state.initialized =
                false;

            await salesModel.resolveContext(
                user
            );

            await salesModel.loadInitialData();

            renderAll();

            state.initialized =
                true;
        },


    getCart:
        () =>
            state.cart.map(
                item => ({
                    ...item
                })
            ),


    getProducts:
        () =>
            ({
                ...state.products
            }),


    getSales:
        () =>
            ({
                ...state.sales
            }),


    addToCart,

    clearCart,

    finalizeSale,

    saveDraft,

    saveInlineSale,

    deleteSale
};


/*
 * ============================================================
 * API GLOBAL OPCIONAL
 * ============================================================
 *
 * Esto conserva compatibilidad con otros módulos que pudieran
 * estar utilizando window.SalesController.
 * ============================================================
 */

window.SalesController =
    salesController;


/*
 * También se conserva InventoryMVC para compatibilidad con
 * el resto del sistema.
 */

window.InventoryMVC =
    window.InventoryMVC ||
    {
        models: {},
        views: {},
        controllers: {}
    };

window.InventoryMVC.models =
    window.InventoryMVC.models ||
    {};

window.InventoryMVC.views =
    window.InventoryMVC.views ||
    {};

window.InventoryMVC.controllers =
    window.InventoryMVC.controllers ||
    {};

window.InventoryMVC.models.sales =
    salesModel;

window.InventoryMVC.views.sales =
    salesView;

window.InventoryMVC.controllers.sales =
    salesController;


export default salesController;