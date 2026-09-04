// assets/js/views/sales.view.js

"use strict";


const selectors = Object.freeze({

    productSelect:
        "#productSelect",

    saleMode:
        "#saleMode",

    saleQuantity:
        "#saleQuantity",

    saleQuantityLabel:
        "#saleQuantityLabel",

    boxPriceGroup:
        "#boxPriceGroup",

    boxPriceInput:
        "#boxPrice",

    referenciaLibroInput:
        "#referenciaLibro",

    cartSaleDate:
        "#cartSaleDate",

    cartSaleTime:
        "#cartSaleTime",

    cartTable:
        "#cartTable",

    cartTableBody:
        "#cartTable tbody",

    cartSubtotal:
        "#cartSubtotal",

    finalizeButton:
        "#btnFinalize",

    saveDraftButton:
        "#btnSaveDraft",

    clearCartButton:
        "#btnClearCart",

    addToCartButton:
        "#btnAddToCart",

    salesTable:
        "#salesTable",

    greetings:
        ".userGreeting"
});


function qs(
    selector,
    root = document
) {

    return root.querySelector(
        selector
    );
}


function qsa(
    selector,
    root = document
) {

    return Array.from(
        root.querySelectorAll(
            selector
        )
    );
}


function escapeHtml(
    value = ""
) {

    return String(
        value ?? ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


function numberOrZero(
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
}


function currency(
    value
) {

    return `$${numberOrZero(
        value
    ).toFixed(
        2
    )}`;
}


function getElements() {

    return {

        productSelect:
            qs(
                selectors.productSelect
            ),

        saleMode:
            qs(
                selectors.saleMode
            ),

        saleQuantity:
            qs(
                selectors.saleQuantity
            ),

        saleQuantityLabel:
            qs(
                selectors.saleQuantityLabel
            ),

        boxPriceGroup:
            qs(
                selectors.boxPriceGroup
            ),

        boxPriceInput:
            qs(
                selectors.boxPriceInput
            ),

        referenciaLibroInput:
            qs(
                selectors.referenciaLibroInput
            ),

        cartSaleDate:
            qs(
                selectors.cartSaleDate
            ),

        cartSaleTime:
            qs(
                selectors.cartSaleTime
            ),

        cartTable:
            qs(
                selectors.cartTable
            ),

        cartTableBody:
            qs(
                selectors.cartTableBody
            ),

        cartSubtotal:
            qs(
                selectors.cartSubtotal
            ),

        finalizeButton:
            qs(
                selectors.finalizeButton
            ),

        saveDraftButton:
            qs(
                selectors.saveDraftButton
            ),

        clearCartButton:
            qs(
                selectors.clearCartButton
            ),

        addToCartButton:
            qs(
                selectors.addToCartButton
            ),

        salesTable:
            qs(
                selectors.salesTable
            ),

        greetings:
            qsa(
                selectors.greetings
            )
    };
}


function isTinyScreen() {

    return (
        window.innerWidth <=
        425
    );
}


function setGreeting(
    name,
    role
) {

    const text =
        `Hola, ${
            name ||
            "Usuario"
        }${
            role
                ? ` (${role})`
                : ""
        }`;

    getElements()
        .greetings
        .forEach(
            element => {

                element.textContent =
                    text;
            }
        );
}


function setCartSaleDateTime(
    model,
    date = new Date()
) {

    const elements =
        getElements();

    if (
        elements.cartSaleDate
    ) {

        elements.cartSaleDate.value =
            model.getLocalDateInputValue(
                date
            );
    }

    if (
        elements.cartSaleTime
    ) {

        elements.cartSaleTime.value =
            model.getLocalTimeInputValue(
                date
            );
    }
}


function getSaleDateTimeFromForm(
    model
) {

    const elements =
        getElements();

    const dateValue =
        elements.cartSaleDate?.value ||
        "";

    const timeValue =
        elements.cartSaleTime?.value ||
        "";

    if (
        !dateValue ||
        !timeValue
    ) {

        return {
            valid:
                false,

            message:
                "Debes indicar la fecha y la hora de la venta."
        };
    }

    const dateTime =
        model.buildLocalDateTime(
            dateValue,
            timeValue
        );

    if (!dateTime) {

        return {
            valid:
                false,

            message:
                "La fecha o la hora de la venta no son válidas."
        };
    }

    return {
        valid:
            true,

        dateTime
    };
}


function getReference() {

    const value =
        getElements()
            .referenciaLibroInput
            ?.value ||
        "";

    return (
        String(
            value
        ).trim() ||
        "venta"
    );
}


function setReference(
    value = ""
) {

    const input =
        getElements()
            .referenciaLibroInput;

    if (input) {
        input.value =
            value;
    }
}


function refreshProductSelect(
    model
) {

    const select =
        getElements()
            .productSelect;

    if (!select) {
        return;
    }

    const current =
        select.value;

    if (
        window.jQuery &&
        typeof $.fn.select2 ===
            "function" &&
        $(select).hasClass(
            "select2-hidden-accessible"
        )
    ) {

        $(select).select2(
            "destroy"
        );
    }

    select.innerHTML =
        "";

    const entries =
        Object.entries(
            model.state.products
        );

    if (
        !entries.length
    ) {

        const option =
            document.createElement(
                "option"
            );

        option.value =
            "";

        option.textContent =
            "No hay productos";

        select.appendChild(
            option
        );

        initializeSelect2();

        return;
    }

    entries.sort(
        (
            a,
            b
        ) =>
            String(
                a[1].name ||
                ""
            ).localeCompare(
                String(
                    b[1].name ||
                    ""
                ),
                "es",
                {
                    sensitivity:
                        "base"
                }
            )
    );

    entries.forEach(
        (
            [
                id,
                product
            ]
        ) => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                id;

            const stockUnits =
                model.getAvailableUnits(
                    product
                );

            const unitsPerBox =
                model.normalizeUnitsPerBox(
                    product
                );

            const boxes =
                model.getAvailableBoxes(
                    product
                );

            const boxPrice =
                model.getDefaultBoxPrice(
                    product
                );

            let label =
                `${product.name || "-"} — ${currency(
                    product.price
                )} c/u`;

            if (
                unitsPerBox >
                1
            ) {

                label +=
                    ` | ${currency(
                        boxPrice
                    )} caja (${unitsPerBox})`;

                label +=
                    ` — stock: ${stockUnits} (${boxes} cajas)`;

            } else {

                label +=
                    ` — stock: ${stockUnits}`;
            }

            if (
                model.isBoxProduct(
                    product
                )
            ) {

                label +=
                    " — venta por cajas";
            }

            option.textContent =
                label;

            select.appendChild(
                option
            );
        }
    );

    if (
        current &&
        model.state.products[
            current
        ]
    ) {

        select.value =
            current;
    }

    initializeSelect2();
}


function initializeSelect2() {

    const select =
        getElements()
            .productSelect;

    if (!select) {
        return;
    }

    if (
        !window.jQuery ||
        typeof $.fn.select2 !==
            "function"
    ) {
        return;
    }

    try {

        $(
            select
        ).select2({

            placeholder:
                "Buscar producto...",

            width:
                "100%",

            allowClear:
                true,

            minimumResultsForSearch:
                0
        });

    } catch (
        error
    ) {

        console.warn(
            "[SalesView] Select2:",
            error
        );
    }
}


function updateSaleModeUI(
    model
) {

    const elements =
        getElements();

    const product =
        model.state.products[
            elements.productSelect?.value ||
            ""
        ] ||
        null;

    const mode =
        elements.saleMode?.value ||
        "unit";

    if (
        elements.saleQuantityLabel
    ) {

        elements.saleQuantityLabel.textContent =
            mode ===
                "box"
                ? "Cantidad (cajas)"
                : "Cantidad (unidades)";
    }

    if (
        elements.boxPriceGroup
    ) {

        elements.boxPriceGroup.style.display =
            mode ===
                "box"
                ? "block"
                : "none";
    }

    if (
        mode ===
            "box" &&
        product &&
        elements.boxPriceInput
    ) {

        elements.boxPriceInput.value =
            model
                .getDefaultBoxPrice(
                    product
                )
                .toFixed(
                    2
                );
    }
}


function syncModeFromProduct(
    model
) {

    const elements =
        getElements();

    if (
        !elements.saleMode
    ) {
        return;
    }

    const product =
        model.state.products[
            elements.productSelect?.value ||
            ""
        ] ||
        null;

    elements.saleMode.value =
        product
            ? model.getDefaultSaleMode(
                product
            )
            : "unit";

    updateSaleModeUI(
        model
    );
}


function renderCart(
    model,
    callbacks = {}
) {

    const elements =
        getElements();

    const tbody =
        elements.cartTableBody;

    if (!tbody) {
        return;
    }

    tbody.innerHTML =
        "";

    if (
        !model.state.cart.length
    ) {

        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    El carrito está vacío.
                </td>
            </tr>
        `;

        updateCartSummary(
            model
        );

        return;
    }

    model.state.cart.forEach(
        (
            item,
            index
        ) => {

            const row =
                document.createElement(
                    "tr"
                );


            const name =
                document.createElement(
                    "td"
                );

            name.setAttribute(
                "data-label",
                "Producto"
            );

            name.innerHTML = `
                ${escapeHtml(
                    item.name
                )}
                <br>
                <small>
                    ${
                        item.mode ===
                            "box"
                            ? `${item.quantity} cajas (${item.unitsTotal} unidades)`
                            : `${item.quantity} unidades`
                    }
                </small>
            `;

            row.appendChild(
                name
            );


            const quantityCell =
                document.createElement(
                    "td"
                );

            quantityCell.setAttribute(
                "data-label",
                "Cantidad"
            );

            const quantity =
                document.createElement(
                    "input"
                );

            quantity.type =
                "number";

            quantity.min =
                "1";

            quantity.step =
                "1";

            quantity.value =
                item.quantity;

            quantity.style.width =
                isTinyScreen()
                    ? "100%"
                    : "70px";

            quantity.addEventListener(
                "change",
                event => {

                    const result =
                        callbacks.onQuantityChange?.(
                            index,
                            event.target.value
                        );

                    if (
                        result &&
                        result.ok ===
                            false
                    ) {

                        event.target.value =
                            item.quantity;

                        callbacks.onWarning?.(
                            result
                        );
                    }
                }
            );

            quantityCell.appendChild(
                quantity
            );

            row.appendChild(
                quantityCell
            );


            const priceCell =
                document.createElement(
                    "td"
                );

            priceCell.setAttribute(
                "data-label",
                "Precio"
            );

            const price =
                document.createElement(
                    "input"
                );

            price.type =
                "number";

            price.min =
                "0";

            price.step =
                "0.01";

            price.value =
                numberOrZero(
                    item.price
                ).toFixed(
                    2
                );

            price.style.width =
                isTinyScreen()
                    ? "100%"
                    : "90px";

            price.addEventListener(
                "change",
                event => {

                    const result =
                        callbacks.onPriceChange?.(
                            index,
                            event.target.value
                        );

                    if (
                        result &&
                        result.ok ===
                            false
                    ) {

                        event.target.value =
                            numberOrZero(
                                item.price
                            ).toFixed(
                                2
                            );

                        callbacks.onWarning?.(
                            result
                        );
                    }
                }
            );

            priceCell.appendChild(
                price
            );

            row.appendChild(
                priceCell
            );


            const total =
                document.createElement(
                    "td"
                );

            total.setAttribute(
                "data-label",
                "Total"
            );

            total.textContent =
                currency(
                    item.total
                );

            row.appendChild(
                total
            );


            const actionCell =
                document.createElement(
                    "td"
                );

            actionCell.setAttribute(
                "data-label",
                "Acciones"
            );

            const remove =
                document.createElement(
                    "button"
                );

            remove.type =
                "button";

            remove.className =
                "btn-outline";

            remove.innerHTML = `
                <i class="fas fa-trash"></i>
                Quitar
            `;

            remove.style.width =
                isTinyScreen()
                    ? "100%"
                    : "";

            remove.addEventListener(
                "click",
                () => {

                    callbacks.onRemove?.(
                        index
                    );
                }
            );

            actionCell.appendChild(
                remove
            );

            row.appendChild(
                actionCell
            );

            tbody.appendChild(
                row
            );
        }
    );

    updateCartSummary(
        model
    );
}


function updateCartSummary(
    model
) {

    const elements =
        getElements();

    const subtotal =
        model.getCartSubtotal();

    if (
        elements.cartSubtotal
    ) {

        elements.cartSubtotal.textContent =
            currency(
                subtotal
            );
    }

    if (
        elements.finalizeButton
    ) {

        elements.finalizeButton.disabled =
            model.state.cart.length ===
                0 ||
            model.state.finalizing;
    }
}


function ensureTableHeader() {

    const table =
        getElements()
            .salesTable;

    if (!table) {
        return;
    }

    let thead =
        table.querySelector(
            "thead"
        );

    if (!thead) {

        thead =
            document.createElement(
                "thead"
            );

        table.insertBefore(
            thead,
            table.firstChild
        );
    }

    let row =
        thead.querySelector(
            "tr"
        );

    if (!row) {

        row =
            document.createElement(
                "tr"
            );

        thead.appendChild(
            row
        );
    }

    const headers = [
        "Productos",
        "Unidades",
        "Total",
        "Referencia",
        "Usuario",
        "Fecha",
        "Hora",
        "Acciones"
    ];

    row.innerHTML =
        headers
            .map(
                header =>
                    `<th>${escapeHtml(
                        header
                    )}</th>`
            )
            .join("");
}


function buildSalesDataset(
    model
) {

    const entries =
        Object.entries(
            model.state.sales
        );

    entries.sort(
        (
            a,
            b
        ) =>
            (
                model.getDateTimeMillis(
                    b[1].createdAt
                ) ||
                0
            ) -
            (
                model.getDateTimeMillis(
                    a[1].createdAt
                ) ||
                0
            )
    );

    return entries.map(
        (
            [
                saleId,
                sale
            ]
        ) => {

            const products =
                model.normalizeSaleProducts(
                    sale.products
                );

            const units =
                products.reduce(
                    (
                        total,
                        product
                    ) =>
                        total +
                        numberOrZero(
                            product.unitsTotal
                        ),
                    0
                );

            const total =
                numberOrZero(
                    sale.total
                );

            const sortDate =
                model.getDateTimeMillis(
                    sale.createdAt
                ) ||
                0;

            const canEdit =
                model.hasRolePermission(
                    "canEdit"
                );

            const canDelete =
                model.hasRolePermission(
                    "canDelete"
                );

            const reference =
                String(
                    sale.referenciaLibro ||
                    "venta"
                );

            const productsHtml = `
                <div
                    class="sale-products-readonly"
                    data-sale-id="${escapeHtml(
                        saleId
                    )}"
                >
                    ${
                        products.length
                            ? products
                                .map(
                                    product =>
                                        `
                                        <div>
                                            ${escapeHtml(
                                                product.name
                                            )}
                                            x${product.quantity}
                                            ${
                                                product.mode ===
                                                    "box"
                                                    ? "(cajas)"
                                                    : "(unid.)"
                                            }
                                        </div>
                                        `
                                )
                                .join("")
                            : "-"
                    }
                </div>
            `;

            const referenceHtml =
                canEdit
                    ? `
                        <input
                            type="text"
                            class="inline-sale-reference"
                            data-sale-id="${escapeHtml(
                                saleId
                            )}"
                            value="${escapeHtml(
                                reference
                            )}"
                            maxlength="100"
                            autocomplete="off"
                            style="
                                width:100%;
                                min-width:100px;
                            "
                        >
                    `
                    : escapeHtml(
                        reference
                    );

            const dateValue =
                model.getLocalDateInputValue(
                    sale.createdAt
                );

            const timeValue =
                model.getLocalTimeInputValue(
                    sale.createdAt
                );

            const dateHtml =
                canEdit
                    ? `
                        <input
                            type="date"
                            class="inline-sale-date"
                            data-sale-id="${escapeHtml(
                                saleId
                            )}"
                            value="${escapeHtml(
                                dateValue
                            )}"
                            style="
                                width:100%;
                                min-width:125px;
                            "
                        >
                    `
                    : escapeHtml(
                        dateValue
                            ? new Date(
                                model.getDateTimeMillis(
                                    sale.createdAt
                                )
                            ).toLocaleDateString()
                            : "-"
                    );

            const timeHtml =
                canEdit
                    ? `
                        <input
                            type="time"
                            class="inline-sale-time"
                            data-sale-id="${escapeHtml(
                                saleId
                            )}"
                            value="${escapeHtml(
                                timeValue
                            )}"
                            style="
                                width:100%;
                                min-width:95px;
                            "
                        >
                    `
                    : escapeHtml(
                        timeValue
                            ? new Date(
                                model.getDateTimeMillis(
                                    sale.createdAt
                                )
                            ).toLocaleTimeString(
                                [],
                                {
                                    hour:
                                        "2-digit",

                                    minute:
                                        "2-digit"
                                }
                            )
                            : "-"
                    );

            const deleteHtml =
                canDelete
                    ? `
                        <button
                            type="button"
                            class="btn-outline btn-delete-sale"
                            data-sale-id="${escapeHtml(
                                saleId
                            )}"
                        >
                            <i class="fas fa-trash"></i>
                            Eliminar
                        </button>
                    `
                    : `
                        <span>
                            —
                        </span>
                    `;

            return [

                productsHtml,

                String(
                    units
                ),

                `
                    <strong>
                        ${currency(
                            total
                        )}
                    </strong>
                `,

                referenceHtml,

                escapeHtml(
                    sale.userName ||
                    "-"
                ),

                {
                    display:
                        dateHtml,

                    sort:
                        sortDate
                },

                {
                    display:
                        timeHtml,

                    sort:
                        sortDate
                },

                deleteHtml
            ];
        }
    );
}


function ensureDataTable() {

    const table =
        getElements()
            .salesTable;

    if (!table) {
        return null;
    }

    if (
        table.__salesDataTable
    ) {
        return table.__salesDataTable;
    }

    if (
        !window.jQuery ||
        !$.fn ||
        !$.fn.DataTable
    ) {
        return null;
    }

    ensureTableHeader();

    table.__salesDataTable =
        $(
            table
        ).DataTable({

            data:
                [],

            columns: [

                {
                    title:
                        "Productos",

                    orderable:
                        false
                },

                {
                    title:
                        "Unidades"
                },

                {
                    title:
                        "Total"
                },

                {
                    title:
                        "Referencia",

                    orderable:
                        false
                },

                {
                    title:
                        "Usuario"
                },

                {
                    title:
                        "Fecha",

                    render:
                        (
                            data,
                            type
                        ) =>
                            type ===
                                "display"
                                ? data.display
                                : data.sort
                },

                {
                    title:
                        "Hora",

                    render:
                        (
                            data,
                            type
                        ) =>
                            type ===
                                "display"
                                ? data.display
                                : data.sort
                },

                {
                    title:
                        "Acciones",

                    orderable:
                        false,

                    searchable:
                        false,

                    className:
                        "dt-body-center"
                }
            ],

            pageLength:
                5,

            lengthMenu:
                [
                    5,
                    10,
                    25,
                    50
                ],

            scrollY:
                "260px",

            scrollCollapse:
                true,

            scrollX:
                true,

            autoWidth:
                false,

            orderMulti:
                true,

            order:
                [
                    [
                        5,
                        "desc"
                    ],

                    [
                        6,
                        "desc"
                    ]
                ],

            dom:
                '<"sales-dt-top"lf>rt<"sales-dt-bottom"ip><"clear">',

            language: {

                search:
                    "",

                searchPlaceholder:
                    "Buscar ventas...",

                lengthMenu:
                    "Mostrar _MENU_",

                info:
                    "Mostrando _START_ a _END_ de _TOTAL_",

                infoEmpty:
                    "No hay ventas",

                infoFiltered:
                    "(filtrado de _MAX_ ventas)",

                paginate: {

                    next:
                        "›",

                    previous:
                        "‹"
                },

                zeroRecords:
                    "No hay ventas",

                emptyTable:
                    "No hay ventas"
            },

            columnDefs: [

                {
                    targets:
                        [
                            1,
                            2,
                            7
                        ],

                    className:
                        "dt-body-center"
                },

                {
                    targets:
                        [
                            0,
                            3,
                            4,
                            5,
                            6
                        ],

                    className:
                        "dt-body-left"
                }
            ]
        });

    return table.__salesDataTable;
}


function renderSalesTable(
    model
) {

    ensureTableHeader();

    const dataset =
        buildSalesDataset(
            model
        );

    const table =
        ensureDataTable();

    if (table) {

        const searchValue =
            $(
                "#salesTable_filter input"
            ).val() ||
            "";

        table.clear();

        table.rows.add(
            dataset
        );

        table.draw(
            false
        );

        if (
            searchValue
        ) {

            table.search(
                searchValue
            ).draw(
                false
            );
        }

        return;
    }

    const tbody =
        getElements()
            .salesTable
            ?.querySelector(
                "tbody"
            );

    if (!tbody) {
        return;
    }

    tbody.innerHTML =
        "";

    if (
        !dataset.length
    ) {

        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    No hay ventas registradas.
                </td>
            </tr>
        `;

        return;
    }

    dataset.forEach(
        row => {

            const tr =
                document.createElement(
                    "tr"
                );

            row.forEach(
                cell => {

                    const td =
                        document.createElement(
                            "td"
                        );

                    if (
                        cell &&
                        typeof cell ===
                            "object" &&
                        cell.display !==
                            undefined
                    ) {

                        td.innerHTML =
                            String(
                                cell.display
                            );

                    } else {

                        td.innerHTML =
                            String(
                                cell ??
                                ""
                            );
                    }

                    tr.appendChild(
                        td
                    );
                }
            );

            tbody.appendChild(
                tr
            );
        }
    );
}


function bindTableEvents(
    callbacks = {}
) {

    document
        .querySelectorAll(
            ".inline-sale-reference, .inline-sale-date, .inline-sale-time"
        )
        .forEach(
            input => {

                if (
                    input.dataset.bound ===
                    "1"
                ) {
                    return;
                }

                input.dataset.bound =
                    "1";

                input.addEventListener(
                    "blur",
                    () => {

                        callbacks.onSaleEdit?.(
                            input.dataset.saleId
                        );
                    }
                );

                input.addEventListener(
                    "keydown",
                    event => {

                        if (
                            event.key !==
                            "Enter"
                        ) {
                            return;
                        }

                        event.preventDefault();

                        callbacks.onSaleEdit?.(
                            input.dataset.saleId
                        );
                    }
                );
            }
        );


    document
        .querySelectorAll(
            ".btn-delete-sale"
        )
        .forEach(
            button => {

                if (
                    button.dataset.bound ===
                    "1"
                ) {
                    return;
                }

                button.dataset.bound =
                    "1";

                button.addEventListener(
                    "click",
                    () => {

                        callbacks.onSaleDelete?.(
                            button.dataset.saleId
                        );
                    }
                );
            }
        );
}


function getInlineSaleValues(
    saleId,
    model
) {

    const escapeSelector =
        value =>
            typeof CSS !==
                "undefined" &&
            typeof CSS.escape ===
                "function"
                ? CSS.escape(
                    value
                )
                : String(
                    value
                ).replace(
                    /"/g,
                    '\\"'
                );

    const id =
        escapeSelector(
            saleId
        );

    const referenceInput =
        document.querySelector(
            `.inline-sale-reference[data-sale-id="${id}"]`
        );

    const dateInput =
        document.querySelector(
            `.inline-sale-date[data-sale-id="${id}"]`
        );

    const timeInput =
        document.querySelector(
            `.inline-sale-time[data-sale-id="${id}"]`
        );

    const sale =
        model.state.sales[
            saleId
        ];

    if (!sale) {
        return null;
    }

    const reference =
        String(
            referenceInput?.value ||
            sale.referenciaLibro ||
            "venta"
        ).trim() ||
        "venta";

    const date =
        dateInput?.value ||
        model.getLocalDateInputValue(
            sale.createdAt
        );

    const time =
        timeInput?.value ||
        model.getLocalTimeInputValue(
            sale.createdAt
        );

    const createdAt =
        model.buildLocalDateTime(
            date,
            time
        );

    return {
        reference,
        createdAt
    };
}


function setControlsDisabled(
    disabled
) {

    const elements =
        getElements();

    [

        elements.finalizeButton,

        elements.saveDraftButton,

        elements.clearCartButton,

        elements.addToCartButton,

        elements.productSelect,

        elements.saleMode,

        elements.saleQuantity,

        elements.boxPriceInput,

        elements.referenciaLibroInput,

        elements.cartSaleDate,

        elements.cartSaleTime

    ].forEach(
        element => {

            if (element) {
                element.disabled =
                    disabled;
            }
        }
    );
}


async function alert(
    options
) {

    if (
        typeof Swal !==
        "undefined"
    ) {
        return Swal.fire(
            options
        );
    }

    return {
        isConfirmed:
            false
    };
}


async function fire(
    title,
    text,
    icon = "info"
) {

    return alert({

        title,

        text,

        icon
    });
}


async function toast(
    icon,
    title,
    timer = 1400
) {

    return alert({

        toast:
            true,

        position:
            "top-end",

        icon,

        title,

        showConfirmButton:
            false,

        timer
    });
}


const salesView = {

    selectors,

    qs,

    qsa,

    escapeHtml,

    getElements,

    getSaleDateTimeFromForm,

    getReference,

    setReference,

    setGreeting,

    setCartSaleDateTime,

    refreshProductSelect,

    initializeSelect2,

    updateSaleModeUI,

    syncModeFromProduct,

    renderCart,

    updateCartSummary,

    ensureTableHeader,

    ensureDataTable,

    renderSalesTable,

    bindTableEvents,

    getInlineSaleValues,

    setControlsDisabled,

    alert,

    fire,

    toast,

    currency
};


export default salesView;