//js/inventory/inventory.calculations.js
/*
 * Módulo de inventario
 * Cálculos y transformaciones puras del dominio.
 */
"use strict";

function bioxInvNumberOrZero(
  value
) {
  const number = Number(value);

    return Number.isFinite(number)
      ? number
      : 0;
}

function bioxInvDecimalOrZero(
  value
) {
  const number = Number(value);

    if (
      !Number.isFinite(
         number
      )
    ) {
      return 0;
    }

    return Math.max(
       0,
       Math.round(
          number * 1000000
       ) / 1000000
    );
}

function bioxInvIntegerOrZero(
  value
) {
  return bioxInvDecimalOrZero(value);
}

function bioxInvFormatQuantity(
  value
) {
  const number =
    bioxInvDecimalOrZero(value);

    return number
      .toFixed(6)
      .replace(
         /\.?0+$/,
         ""
      );
}

function bioxInvCurrency(
  value
) {
  return `$${bioxInvNumberOrZero(
    value
    ).toFixed(2)}`;
}

function bioxInvEscapeHtml(
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

function bioxInvNormalizeText(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase()
    .normalize(
       "NFD"
    )
    .replace(
       /[\u0300-\u036f]/g,
       ""
    );
}

function bioxInvNormalizeIdArray(
  values
) {
  const source =
    Array.isArray(values)
      ? values
      : values
         ? [values]
         : [];

    return Array.from(
      new Set(
             source
               .map(
                 value =>
                    String(
                      value || ""
                    ).trim()
               )
               .filter(Boolean)
         )
    );
}

function bioxInvGetTimestampMs(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return 0;
  }

 if (
   typeof value.toMillis ===
   "function"
 ) {
   return value.toMillis();
 }

 if (
   typeof value.toDate ===
   "function"
 ) {
   const date =
      value.toDate();

     return isNaN(
       date.getTime()
     )
       ? 0
       : date.getTime();
 }

 if (
   typeof value.seconds ===
   "number"
 ) {
   return (
      value.seconds *
      1000
   );
 }

 if (
   value instanceof Date
 ) {
   return value.getTime();
 }

 const date =
   new Date(value);

 return isNaN(
   date.getTime()
 )
      ? 0
      : date.getTime();
}

function bioxInvGetLocalDateInputValue(
  date = new Date()
) {
  const value =
    date instanceof Date
      ? date
      : new Date(date);

    if (
      isNaN(
         value.getTime()
      )
    ) {
      return "";
    }

    const year =
      value.getFullYear();

    const month =
      String(
         value.getMonth() + 1
      ).padStart(
         2,
         "0"
      );

    const day =
      String(
         value.getDate()
      ).padStart(
         2,
         "0"
      );

    return `${year}-${month}-${day}`;
}

function bioxInvParseOperationDate(
  value
) {
  const text =
    String(
      value || ""
    ).trim();

    if (!text) {
      return null;
    }

    const match =
      /^(\d{4})-(\d{2})-(\d{2})$/.exec(
         text
      );

    if (!match) {
        return null;
    }

    const year =
      Number(match[1]);

    const month =
      Number(match[2]);

    const day =
      Number(match[3]);

    const date =
      new Date(
         year,
         month - 1,
         day,
         12,
         0,
         0,
         0
      );

    if (
      date.getFullYear() !==
         year ||
      date.getMonth() !==
         month - 1 ||
      date.getDate() !==
         day
    ) {
      return null;
    }

    return date;
}

function bioxInvFormatOperationDate(
  date
) {
  if (!date) {
    return "—";
  }

    return date.toLocaleDateString(
       "es-ES"
    );
}

function bioxInvBuildOperationTimestamp(
  operationDate
) {
  const date =
    operationDate instanceof Date
      ? operationDate
      : new Date(operationDate);

    if (
      isNaN(
         date.getTime()
      )
    ) {
      throw new Error(
         "La fecha de operación no es válida."
      );
    }

    return firebase.firestore.Timestamp.fromDate(
       new Date(
         date.getFullYear(),
         date.getMonth(),
         date.getDate(),
         12,
         0,
         0,
         0
       )
    );
}

function bioxInvGetMovementOperationDateValue(
  movement
) {
  if (
    movement?.fechaOperacion
  ) {
    const parsed =
       bioxInvParseOperationDate(
          movement.fechaOperacion
       );

        if (parsed) {
          return movement.fechaOperacion;
        }
    }

    const timestampMs =
      bioxInvGetTimestampMs(
         movement?.createdAt
      );

    if (!timestampMs) {
      return "";
    }

    return bioxInvGetLocalDateInputValue(
       new Date(
         timestampMs
       )
    );
}

function bioxInvGetInventoryDayKey(
  date = new Date()
) {
  try {
    if (
      typeof window.getTodayBounds ===
      "function"
    ) {
        const bounds =
          window.getTodayBounds(
             date
          );

        if (
          bounds &&
          bounds.dayKey
        ) {
          return String(
             bounds.dayKey
          );
        }
      }
    } catch (
      error
    ) {
      console.warn(
         "No se pudo obtener dayKey:",
         error
      );
    }

    return bioxInvGetLocalDateInputValue(
       date
    );
}

function bioxInvBuildProjectionForProduct(
  product
) {
  const stockUnits =
    bioxInvGetCurrentStockUnits(
       product
    );

    const stockBoxes =
      bioxInvGetStockBoxes(
         product
      );

    const unitsPerBox =
      bioxInvGetUnitsPerBox(
         product
      );

    const soldUnits =
      bioxInvDecimalOrZero(
         bioxInvCurrentMonthlySalesMap[
           product.id
         ]
      );

    const soldBoxes =
      bioxInvDecimalOrZero(
         bioxInvCurrentMonthlyBoxesMap[
           product.id
         ]
      );

    const costPerUnit =
      bioxInvGetCostPerUnit(
         product
      );

    let suggestedUnits =
      soldUnits +
      bioxInvSAFETY_STOCK_DEFAULT -
      stockUnits;

    suggestedUnits =
      Math.max(
         0,
         suggestedUnits
      );

    const suggestedBoxes =
      unitsPerBox > 0
        ? bioxInvDecimalOrZero(
             suggestedUnits /
               unitsPerBox
          )
        : 0;

    let status =
      "OK";

    if (
      suggestedUnits >
      0
    ) {
      status =
         "Reponer";
    } else if (
      stockUnits <=
      bioxInvLOW_STOCK_THRESHOLD
    ) {
      status =
         "Bajo";
    }

    return {
       stockUnits,
       stockBoxes,
       unitsPerBox,
       soldUnits,
       soldBoxes,
       costPerUnit,
       suggestedUnits,
       suggestedBoxes,
       status
    };
}

function bioxInvBuildRowData(
  product
) {
  const projection =
    bioxInvBuildProjectionForProduct(
       product
    );

    const providerDisplay =
      bioxInvGetProductProvidersDisplay(
         product
      );
const productCode =
  bioxInvGetProductCode(
     product
  );

return {
  id:
    product.id,

 name:
   product.name ||
   "—",

 providerName:
   providerDisplay,

 providerReason:
   "",

 productCode,

 price:
   bioxInvNumberOrZero(
      product.price
   ),

 stockUnits:
   projection.stockUnits,

 stockBoxes:
   projection.stockBoxes,

 unitsPerBox:
   projection.unitsPerBox,

 soldMonthUnits:
   projection.soldUnits,

 soldMonthBoxes:
   projection.soldBoxes,

 costPerUnit:
   projection.costPerUnit,

 suggestedPurchaseUnits:
   projection.suggestedUnits,

 suggestedPurchaseBoxes:
   projection.suggestedBoxes,

 status:
   projection.status,

 searchText:
   [
     product.name,
     productCode,
     bioxInvGetProductProvidersSearchText(
       product
             )
         ]
             .filter(Boolean)
             .join(" ")
    };
}

function bioxInvFilterMovements(
  movements,
  {
    productId = "",
    dateFrom = "",
    dateTo = "",
    productText = ""
  } = {}
) {
  const normalizedProductText =
    bioxInvNormalizeText(
      productText
  );

return movements.filter(
  movement => {
    if (
      productId &&
      String(
         movement.productId
      ).trim() !==
         String(
           productId
         ).trim()
    ) {
      return false;
    }

       const date =
         bioxInvGetMovementOperationDateValue(
            movement
         );

       if (
         dateFrom &&
         (
            !date ||
            date <
              dateFrom
         )
       ) {
         return false;
       }

       if (
         dateTo &&
         (
            !date ||
            date >
              dateTo
         )
       ) {
         return false;
       }

       if (
         normalizedProductText
       ) {
         const searchable =
            [
              movement.productCurrentName ||
                movement.productName ||
                "",

             movement.codigoProducto ||
               "",

             movement.providerDisplay ||
               "",

             movement.proveedorNombre ||
               "",
                       movement.proveedorRazonSocial ||
                         ""
                   ]
                       .join(" ");

                 if (
                   !bioxInvNormalizeText(
                      searchable
                   ).includes(
                      normalizedProductText
                   )
                 ) {
                   return false;
                 }
             }

             return true;
         }
    );
}

function bioxInvGetProviderName(
  provider
) {
  return String(
    provider?.nombre ||
    provider?.name ||
    provider?.nombreProveedor ||
    ""
  ).trim();
}

function bioxInvGetProviderBusinessName(
  provider
) {
  return String(
    provider?.razonSocialDenominacion ||
    provider?.razonSocial ||
    provider?.razon_social ||
    provider?.denominacion ||
    provider?.denominacionSocial ||
    provider?.businessName ||
    ""
  ).trim();
}

function bioxInvGetProviderNationality(
  provider
) {
  return String(
    provider?.nacionalidad ||
    ""
  ).trim();
}

function bioxInvGetProviderDisplayName(
  provider
) {
  if (!provider) {
    return "";
  }

    const name =
      bioxInvGetProviderName(provider);

    const businessName =
      bioxInvGetProviderBusinessName(
         provider
      );

    if (
      name &&
      businessName
    ) {
      return `${name} — ${businessName}`;
    }

    return (
       name ||
       businessName ||
       String(
         provider?.id ||
         ""
       ).trim()
    );
}

function bioxInvNormalizeProviderObject(
  provider,
  fallbackId = ""
) {
  if (!provider) {
    return null;
  }

    const id =
      String(
        provider.id ||
        provider.id_proveedor ||
        provider.proveedorId ||
        provider.providerId ||
        fallbackId ||
        ""
      ).trim();

    const nombre =
      bioxInvGetProviderName(
         provider
      );

    const razonSocialDenominacion =
      bioxInvGetProviderBusinessName(
         provider
      );

    if (
      !id &&
      !nombre &&
      !razonSocialDenominacion
    ) {
      return null;
    }
    return {
      id,
      ...provider,

         nombre,

         razonSocialDenominacion,

         razonSocial:
           razonSocialDenominacion,

         denominacion:
           razonSocialDenominacion,

         nacionalidad:
           bioxInvGetProviderNationality(
             provider
           )
    };
}

function bioxInvNormalizeProviderCollection(
  rawProviders,
  rawIds = []
) {
  const providers =
    [];

    if (
      Array.isArray(
         rawProviders
      )
    ) {
      rawProviders.forEach(
         provider => {
           if (
             typeof provider ===
             "string"
           ) {
             const resolved =
                bioxInvGetProviderById(
                   provider
                );

                if (
                  resolved
                ) {
                  providers.push(
                     resolved
                  );
                }

                return;
            }

            const normalized =
              bioxInvNormalizeProviderObject(
                 provider
              );
             if (
               normalized
             ) {
               const resolved =
                  normalized.id
                    ? bioxInvGetProviderById(
                        normalized.id
                      )
                    : null;

                 providers.push(
                    resolved
                      ? {
                          ...normalized,
                          ...resolved
                        }
                      : normalized
                 );
             }
         }
    );
}

bioxInvNormalizeIdArray(
  rawIds
).forEach(
  providerId => {
    const exists =
      providers.some(
         provider =>
           String(
             provider.id
           ).trim() ===
           providerId
      );

         if (
           exists
         ) {
           return;
         }

         const provider =
           bioxInvGetProviderById(
              providerId
           );

         if (
           provider
         ) {
           providers.push(
              provider
           );
         } else {
           providers.push(
              bioxInvNormalizeProviderObject(
                {
                  id:
                    providerId
                }
                  )
             );
         }
     }
);

const result =
  [];

const usedIds =
  new Set();

const usedTexts =
  new Set();

providers.forEach(
  provider => {
    if (!provider) {
      return;
    }

         const id =
           String(
             provider.id ||
             ""
           ).trim();

         const text =
           bioxInvNormalizeText(
              bioxInvGetProviderDisplayName(
                provider
              )
           );

         if (
           id
         ) {
           if (
              usedIds.has(id)
           ) {
              return;
           }

             usedIds.add(id);
             result.push(
                provider
             );
             return;
         }

         if (
           text &&
           usedTexts.has(text)
         ) {
           return;
         }

         if (
           text
         ) {
                 usedTexts.add(text);
             }

             result.push(
                provider
             );
         }
    );

    return result;
}

function bioxInvGetProviderIds(
  providers
) {
  return bioxInvNormalizeIdArray(
     (providers || [])
       .map(
         provider =>
           provider?.id ||
           provider
       )
  );
}

function bioxInvMergeProviderCollections(
  ...collections
) {
  const result =
    [];

    const seenIds =
      new Set();

    const seenTexts =
 new Set();

collections
  .flat()
  .forEach(
    provider => {
      const normalized =
        typeof provider ===
        "string"
          ? bioxInvGetProviderById(
               provider
            )
          : bioxInvNormalizeProviderObject(
               provider
            );

     if (!normalized) {
       return;
     }

     const id =
       String(
         normalized.id ||
         ""
       ).trim();

     const text =
       bioxInvNormalizeText(
          bioxInvGetProviderDisplayName(
            normalized
          )
       );

     if (
       id
     ) {
       if (
          seenIds.has(id)
       ) {
          return;
       }

         seenIds.add(id);
         result.push(
            normalized
         );
         return;
     }

     if (
       text &&
       seenTexts.has(text)
     ) {
       return;
     }

     if (
       text
     ) {
       seenTexts.add(text);
              }

              result.push(
                 normalized
              );
          }
     );

    return result;
}

function bioxInvGetProductProviders(
  product
) {
  if (!product) {
    return [];
  }

    const rawProviders =
      product.proveedores ||
      product.providers ||
      [];

    const rawProviderIds =
      product.proveedorIds ||
      product.providerIds ||
      [];

    const providers =
      bioxInvNormalizeProviderCollection(
         rawProviders,
         rawProviderIds
      );

    const legacyProvider =
      bioxInvNormalizeProviderObject({
        id:
          product.proveedorId ||
          product.providerId ||
          "",
        nombre:
          product.proveedorNombre ||
          product.providerName ||
          "",
        razonSocialDenominacion:
          product.proveedorRazonSocial ||
          product.proveedorRazonSocialDenominacion ||
          product.proveedorDenominacion ||
          product.providerBusinessName ||
          ""
      });

    return bioxInvMergeProviderCollections(
       providers,
       legacyProvider
    );
}

function bioxInvGetProductProviderIds(
  product
) {
  return bioxInvGetProviderIds(
     bioxInvGetProductProviders(
       product
     )
  );
}

function bioxInvGetProductProviderId(
  product
) {
  return (
     bioxInvGetProductProviderIds(
        product
     )[0] ||
     ""
  );
}

function bioxInvGetProductProviderName(
  product
) {
  const provider =
    bioxInvGetProductProviders(
      product
    )[0];

    return (
       bioxInvGetProviderName(
         provider
       ) ||
       String(
         product?.proveedorNombre ||
         ""
       ).trim()
    );
}

function bioxInvGetProductProviderReason(
  product
) {
  const provider =
    bioxInvGetProductProviders(
      product
    )[0];

    return (
       bioxInvGetProviderBusinessName(
         provider
       ) ||
       String(
         product?.proveedorRazonSocial ||
         product?.proveedorRazonSocialDenominacion ||
         product?.proveedorDenominacion ||
         ""
       ).trim()
    );
}

function bioxInvGetProductProvidersDisplay(
  product
) {
  const providers =
    bioxInvGetProductProviders(
       product
    );

    if (
      !providers.length
    ) {
      return "Sin proveedor";
    }

    return providers
      .map(
        provider =>
          bioxInvGetProviderDisplayName(
            provider
          )
      )
      .filter(Boolean)
      .join(" | ");
}

function bioxInvGetProductProvidersSearchText(
  product
) {
  return bioxInvGetProductProviders(
    product
  )
    .map(
      provider =>
        [
          bioxInvGetProviderName(
             provider
          ),
          bioxInvGetProviderBusinessName(
             provider
          ),
          bioxInvGetProviderDisplayName(
             provider
          )
        ]
          .filter(Boolean)
          .join(" ")
    )
    .join(" ");
}

function bioxInvGetLocalFieldValue(
  data = {}
) {
  return String(
    data.id_local ||
    data.idLocal ||
    data.localId ||
    data.idlocal ||
    ""
    ).trim();
}

function bioxInvMatchesCurrentLocal(
  data = {}
) {
  if (!bioxInvCurrentLocalId) {
    return false;
  }

    return (
       bioxInvGetLocalFieldValue(
         data
       ) ===
       String(
         bioxInvCurrentLocalId
       ).trim()
    );
}

function bioxInvGetUnitsPerBox(
  product
) {
  const value =
    bioxInvDecimalOrZero(
       product?.unitsPerBox
    );

    return value > 0
      ? value
      : 1;
}

function bioxInvGetProductCode(
  product
) {
  return String(
    product?.codigoProducto ||
    product?.productCode ||
    product?.code ||
    product?.sku ||
    ""
  ).trim();
}

function bioxInvGetCurrentStockUnits(
  product
) {
  if (!product) {
    return 0;
  }

    const stockCurrent =
      Number(
           product.stockCurrentUnits
      );

    if (
      Number.isFinite(
         stockCurrent
      )
    ) {
      return Math.max(
         0,
         stockCurrent
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
}

function bioxInvGetStockBoxes(
  product
) {
  const unitsPerBox =
    bioxInvGetUnitsPerBox(
       product
    );

    return unitsPerBox > 0
      ? bioxInvDecimalOrZero(
          bioxInvGetCurrentStockUnits(
               product
             ) /
               unitsPerBox
        )
      : 0;
}

function bioxInvGetCostPerUnit(
  product
) {
  const direct =
    bioxInvNumberOrZero(
       product?.lastCostPerUnit
    );

    if (
      direct > 0
    ) {
      return direct;
    }

    const costPerBox =
      bioxInvNumberOrZero(
         product?.lastCostPerBox
      );

    const unitsPerBox =
      bioxInvGetUnitsPerBox(
         product
      );

    return costPerBox > 0 &&
      unitsPerBox > 0
      ? costPerBox /
           unitsPerBox
      : 0;
}

function bioxInvGetEffectiveUnitsPerBox(
  line,
  product = null
) {
  const value =
    bioxInvDecimalOrZero(
       product
         ? bioxInvGetUnitsPerBox(
             product
           )
         : line?.unitsPerBox
    );

    return value > 0
      ? value
      : 1;
}

function bioxInvGetEffectiveCostPerBoxForLine(
  line,
  product = null
) {
  const unitsPerBox =
    bioxInvGetEffectiveUnitsPerBox(
       line,
       product
    );

    const explicitCostPerBox =
      bioxInvNumberOrZero(
         line?.lastCostPerBox ??
           line?.costoPorCaja ??
           line?.costPerBox
      );

    if (
      explicitCostPerBox > 0
    ) {
      return explicitCostPerBox;
    }

    const explicitCostPerUnit =
      bioxInvNumberOrZero(
         line?.lastCostPerUnit ??
           line?.costoUnitario ??
           line?.costPerUnit
      );

    if (
      explicitCostPerUnit > 0
    ) {
      return (
         explicitCostPerUnit *
         unitsPerBox
      );
    }

    if (product) {
      const productBoxCost =
        bioxInvNumberOrZero(
           product.lastCostPerBox
        );
        if (
          productBoxCost > 0
        ) {
          return productBoxCost;
        }

        const productUnitCost =
          bioxInvNumberOrZero(
             product.lastCostPerUnit
          );

        if (
          productUnitCost > 0
        ) {
          return (
             productUnitCost *
             unitsPerBox
          );
        }
    }

    return 0;
}

function bioxInvGetEffectiveCostPerUnitForLine(
  line,
  product = null
) {
  const unitsPerBox =
    bioxInvGetEffectiveUnitsPerBox(
       line,
       product
    );

    const explicitCostPerUnit =
      bioxInvNumberOrZero(
         line?.lastCostPerUnit ??
           line?.costoUnitario ??
           line?.costPerUnit
      );

    if (
      explicitCostPerUnit > 0
    ) {
      return explicitCostPerUnit;
    }

    const costPerBox =
      bioxInvGetEffectiveCostPerBoxForLine(
         line,
         product
      );

    return unitsPerBox > 0
      ? costPerBox /
           unitsPerBox
      : 0;
}

function bioxInvCalculateLinePurchaseCost(
  line,
  product = null
) {
  if (!line) {
    return 0;
  }

    const paidBoxes =
      bioxInvDecimalOrZero(
         line.boxes
      );

    const paidUnits =
      bioxInvDecimalOrZero(
         line.units
      );

    const unitsPerBox =
      bioxInvGetEffectiveUnitsPerBox(
         line,
         product
      );

    const costPerUnit =
      bioxInvGetEffectiveCostPerUnitForLine(
         line,
         product
      );

    return Math.max(
       0,
       (
          paidBoxes *
            unitsPerBox +
          paidUnits
       ) *
          costPerUnit
    );
}

function bioxInvGetLineProviders(
  line
) {
  const arrayProviders =
    bioxInvNormalizeProviderCollection(
       line?.proveedores ||
         [],
       line?.proveedorIds ||
         []
    );

    const legacyProvider =
      bioxInvNormalizeProviderObject({
       id:
         line?.proveedorId ||
         "",
       nombre:
         line?.proveedorNombre ||
         "",
       razonSocialDenominacion:
         line?.proveedorRazonSocial ||
         ""
     });

    return bioxInvMergeProviderCollections(
       arrayProviders,
       legacyProvider
    );
}

function bioxInvGetLineProviderIds(
  line
) {
  return bioxInvGetProviderIds(
     bioxInvGetLineProviders(
       line
     )
  );
}

function bioxInvGetLineProvidersDisplay(
  line
) {
  const providers =
    bioxInvGetLineProviders(
       line
    );

    if (
      !providers.length
    ) {
      return "Sin proveedor";
    }

    return providers
      .map(
        provider =>
          bioxInvGetProviderDisplayName(
            provider
          )
      )
      .filter(Boolean)
      .join(" | ");
}

function bioxInvGetSaleProductId(
  product
) {
  return String(
    product?.productId ||
    product?.productID ||
    product?.product_id ||
    product?.id ||
    ""
  ).trim();
}

function bioxInvAggregateMonthlySales(
  documents
) {
  const unitsMap = {};

    const boxesMap = {};

    const now =
      new Date();

    const monthStart =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0,
        0,
       0,
       0
  );

const nextMonthStart =
  new Date(
     now.getFullYear(),
     now.getMonth() + 1,
     1,
     0,
     0,
     0,
     0
  );

documents.forEach(
  document => {
    const sale =
      document?.data ||
      {};

       if (
         !bioxInvMatchesCurrentLocal(
            sale
         )
       ) {
         return;
       }

       const createdAtMs =
         bioxInvGetTimestampMs(
            sale.createdAt
         );

       if (
         !createdAtMs ||
         createdAtMs <
            monthStart.getTime() ||
         createdAtMs >=
            nextMonthStart.getTime()
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
           const productId =
             bioxInvGetSaleProductId(
                product
             );

            if (!productId) {
              return;
}

const unitsPerBox =
  Math.max(
     0.000001,
     bioxInvNumberOrZero(
       product.unitsPerBox
     )
  );

const mode =
  bioxInvNormalizeText(
     product.mode ||
       product.saleMode ||
       product.saleType ||
       ""
  );

const quantity =
  bioxInvDecimalOrZero(
     product.quantity
  );

const totalUnits =
  bioxInvDecimalOrZero(
     product.unitsTotal ??
       product.totalUnits
  );

let soldUnits = 0;

let soldBoxes = 0;

if (
  mode ===
  "box"
) {
  soldBoxes =
     quantity > 0
       ? quantity
       : totalUnits > 0
         ? totalUnits /
           unitsPerBox
         : 0;

  soldUnits =
    totalUnits > 0
      ? totalUnits
      : soldBoxes *
         unitsPerBox;
} else if (
  mode ===
  "unit"
) {
  soldUnits =
    totalUnits > 0
      ? totalUnits
      : quantity;
} else if (
  totalUnits > 0
                      ) {
                        soldUnits =
                          totalUnits;
                      } else if (
                        bioxInvDecimalOrZero(
                          product.boxes
                        ) > 0
                      ) {
                        soldBoxes =
                          bioxInvDecimalOrZero(
                             product.boxes
                          );

                        soldUnits =
                          soldBoxes *
                            unitsPerBox;
                      } else {
                        soldUnits =
                          quantity;
                      }

                      unitsMap[
                        productId
                      ] =
                        (
                          unitsMap[
                            productId
                          ] || 0
                        ) +
                        soldUnits;

                      boxesMap[
                        productId
                      ] =
                        (
                          boxesMap[
                            productId
                          ] || 0
                        ) +
                        soldBoxes;
                  }
             );
         }
    );

    return {
       unitsMap,
       boxesMap
    };
}

function bioxInvAggregateAllTimeSalesMap(
  documents
) {
  const unitsMap = {};

    documents.forEach(
      document => {
        const sale =
          document?.data ||
 {};

if (
  !bioxInvMatchesCurrentLocal(
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
    const productId =
      bioxInvGetSaleProductId(
         product
      );

   if (!productId) {
     return;
   }

   const unitsPerBox =
     Math.max(
        0.000001,
        bioxInvNumberOrZero(
          product.unitsPerBox
        )
     );

   const mode =
     bioxInvNormalizeText(
        product.mode ||
          product.saleMode ||
          product.saleType ||
          ""
     );

   const quantity =
     bioxInvDecimalOrZero(
        product.quantity
     );

   const totalUnits =
     bioxInvDecimalOrZero(
        product.unitsTotal ??
          product.totalUnits
     );

   let soldUnits = 0;

   if (
     mode ===
     "box"
                      ) {
                        soldUnits =
                          totalUnits > 0
                            ? totalUnits
                            : quantity *
                               unitsPerBox;
                      } else if (
                        mode ===
                        "unit"
                      ) {
                        soldUnits =
                          totalUnits > 0
                            ? totalUnits
                            : quantity;
                      } else if (
                        totalUnits > 0
                      ) {
                        soldUnits =
                          totalUnits;
                      } else if (
                        bioxInvDecimalOrZero(
                          product.boxes
                        ) > 0
                      ) {
                        soldUnits =
                          bioxInvDecimalOrZero(
                            product.boxes
                          ) *
                          unitsPerBox;
                      } else {
                        soldUnits =
                          quantity;
                      }

                      unitsMap[
                        productId
                      ] =
                        (
                          unitsMap[
                            productId
                          ] || 0
                        ) +
                        soldUnits;
                  }
             );
         }
    );

    return unitsMap;
}

function bioxInvCalculateMovementNetStockMap(
  movementDocuments
) {
    const stockMap = {};

    movementDocuments.forEach(
      ({
         id,
         data
      }) => {
         if (
           !bioxInvMatchesCurrentLocal(
              data
           )
         ) {
           return;
         }

             const productId =
               String(
                 data?.productId ||
                   data?.productID ||
                   data?.product_id ||
                   ""
               ).trim();

             if (!productId) {
               return;
             }

             const movement =
               bioxInvNormalizeMovementDocument(
                  id,
                  data
               );

             stockMap[
               productId
             ] =
               (
                  stockMap[
                    productId
                  ] || 0
               ) +
               (
                  bioxInvDecimalOrZero(
                    movement.entrada
                  ) -
                  bioxInvDecimalOrZero(
                    movement.salida
                  )
               );
         }
    );

    return stockMap;
}

function bioxInvGetMovementUnitsPerBox(
  movement,
  product = null
) {
  const movementValue =
    bioxInvDecimalOrZero(
       movement?.unidadesPorCaja ??
         movement?.unitsPerBox
    );

    if (
      movementValue > 0
    ) {
      return movementValue;
    }

    const productValue =
      product
        ? bioxInvDecimalOrZero(
             product.unitsPerBox
          )
        : 0;

    return productValue > 0
      ? productValue
      : 1;
}

function bioxInvGetMovementBreakdown(
  movement,
  product = null
) {
  const unitsPerBox =
    bioxInvGetMovementUnitsPerBox(
       movement,
       product
    );

    const hasExplicitBreakdown =
      movement?.cajas !==
        undefined ||
      movement?.cajasBono !==
        undefined ||
      movement?.unidades !==
        undefined ||
      movement?.unidadesBono !==
        undefined ||
      movement?.boxes !==
        undefined ||
      movement?.bonusBoxes !==
        undefined ||
      movement?.units !==
        undefined ||
      movement?.bonusUnits !==
        undefined;
let cajas =
  bioxInvDecimalOrZero(
     movement?.cajas ??
       movement?.boxes
  );

let cajasBono =
  bioxInvDecimalOrZero(
     movement?.cajasBono ??
       movement?.bonusBoxes
  );

let unidades =
  bioxInvDecimalOrZero(
     movement?.unidades ??
       movement?.units
  );

let unidadesBono =
  bioxInvDecimalOrZero(
     movement?.unidadesBono ??
       movement?.bonusUnits
  );

if (
  !hasExplicitBreakdown
) {
  let paidUnits =
     bioxInvDecimalOrZero(
        movement?.entradaPagada
     );

  let bonusUnits =
    bioxInvDecimalOrZero(
       movement?.entradaBono
    );

  if (
    paidUnits <=
       0 &&
    bonusUnits <=
       0
  ) {
    paidUnits =
       Math.max(
          0,
          bioxInvDecimalOrZero(
             movement?.entrada
          )
       );
  }

  cajas =
    unitsPerBox > 0
      ? bioxInvDecimalOrZero(
           paidUnits /
             unitsPerBox
        )
      : 0;
        unidades =
          0;

        cajasBono =
          unitsPerBox > 0
            ? bioxInvDecimalOrZero(
                 bonusUnits /
                   unitsPerBox
              )
            : 0;

        unidadesBono =
          0;
    }

    const paidUnits =
      bioxInvDecimalOrZero(
         cajas *
           unitsPerBox +
           unidades
      );

    const bonusUnits =
      bioxInvDecimalOrZero(
         cajasBono *
           unitsPerBox +
           unidadesBono
      );

    const totalUnits =
      bioxInvDecimalOrZero(
         paidUnits +
           bonusUnits
      );

    return {
       cajas,
       cajasBono,
       unidades,
       unidadesBono,
       unitsPerBox,
       paidUnits,
       bonusUnits,
       totalUnits
    };
}

function bioxInvNormalizeMovementProviders(
  source
) {
  const arrayProviders =
    bioxInvNormalizeProviderCollection(
       source?.proveedores ||
         source?.providers ||
         [],
       source?.proveedorIds ||
         source?.providerIds ||
         []
    );
    const legacy =
      bioxInvNormalizeProviderObject({
        id:
          source?.proveedorId ||
          source?.providerId ||
          "",
        nombre:
          source?.proveedorNombre ||
          source?.providerName ||
          "",
        razonSocialDenominacion:
          source?.proveedorRazonSocial ||
          source?.proveedorRazonSocialDenominacion ||
          source?.proveedorDenominacion ||
          source?.providerBusinessName ||
          ""
      });

    return bioxInvMergeProviderCollections(
       arrayProviders,
       legacy
    );
}

function bioxInvNormalizeMovementDocument(
  id,
  data
) {
  const source =
    data || {};

    const productId =
      String(
        source.productId ||
          source.productID ||
          source.product_id ||
          ""
      ).trim();

    const product =
      bioxInvFindProductById(
         productId
      );

    const unitsPerBox =
      bioxInvGetMovementUnitsPerBox(
         source,
         product
      );

    const breakdown =
      bioxInvGetMovementBreakdown(
         source,
         product
      );

    const entrada =
      breakdown.totalUnits > 0
        ? breakdown.totalUnits
        : bioxInvDecimalOrZero(
           source.entrada
      );

const salida =
  bioxInvDecimalOrZero(
     source.salida
  );

const costoUnitario =
  bioxInvNumberOrZero(
    source.costoUnitario
  ) > 0
    ? bioxInvNumberOrZero(
         source.costoUnitario
      )
    : bioxInvNumberOrZero(
         source.costoPorUnidad
      );

const costoPorCaja =
  bioxInvNumberOrZero(
    source.costoPorCaja
  ) > 0
    ? bioxInvNumberOrZero(
        source.costoPorCaja
      )
    : costoUnitario *
      unitsPerBox;

const precioVenta =
  bioxInvNumberOrZero(
     source.precioVenta ??
       source.price
  );

const costoTotal =
  source.costoTotal !==
    undefined &&
  source.costoTotal !==
    null
    ? Math.max(
         0,
         bioxInvNumberOrZero(
            source.costoTotal
         )
      )
    : Math.max(
         0,
         breakdown.paidUnits *
            costoUnitario
      );

const providers =
  bioxInvNormalizeMovementProviders(
     source
  );

const providerIds =
  bioxInvGetProviderIds(
    providers
  );

const providerName =
  providers
    .map(
      provider =>
        bioxInvGetProviderName(
          provider
        )
    )
    .filter(Boolean)
    .join(" | ");

const providerReason =
  providers
    .map(
      provider =>
        bioxInvGetProviderBusinessName(
          provider
        )
    )
    .filter(Boolean)
    .join(" | ");

return {
  id,

  ...source,

  productId,

  productName:
    String(
      source.productName ||
        product?.name ||
        ""
    ).trim(),

  codigoProducto:
    String(
      source.codigoProducto ||
        source.productCode ||
        bioxInvGetProductCode(
           product
        ) ||
        ""
    ).trim(),

  proveedores:
    providers,

  proveedorIds:
    providerIds,

  providerIds:
    providerIds,

  providerList:
    providers,
providerDisplay:
  providers.length
    ? providers
        .map(
          provider =>
            bioxInvGetProviderDisplayName(
              provider
            )
        )
        .filter(Boolean)
        .join(" | ")
    : "Sin proveedor",

proveedorId:
  providerIds[0] ||
  bioxInvGetProductProviderId(
    product
  ) ||
  "",

proveedorNombre:
  providerName ||
  bioxInvGetProductProviderName(
    product
  ) ||
  "",

proveedorRazonSocial:
  providerReason ||
  bioxInvGetProductProviderReason(
    product
  ) ||
  "",

providerId:
  providerIds[0] ||
  bioxInvGetProductProviderId(
    product
  ) ||
  "",

providerName:
  providerName ||
  bioxInvGetProductProviderName(
    product
  ) ||
  "",

providerBusinessName:
  providerReason ||
  bioxInvGetProductProviderReason(
    product
  ) ||
  "",

tipoMovimiento:
  String(
    source.tipoMovimiento ||
      ""
  )
    .trim()
    .toLowerCase(),

referenciaLibro:
  String(
    source.referenciaLibro ||
      source.referenceBook ||
      source.bookReference ||
      ""
  ).trim(),

numeroDocumento:
  String(
    source.numeroDocumento ||
      source.documentNumber ||
      ""
  ).trim(),

entrada,

salida,

saldoAnterior:
  bioxInvNumberOrZero(
     source.saldoAnterior
  ),

saldoActual:
  bioxInvNumberOrZero(
     source.saldoActual
  ),

cajas:
  breakdown.cajas,

boxes:
  breakdown.cajas,

cajasBono:
  breakdown.cajasBono,

bonusBoxes:
  breakdown.cajasBono,

unidades:
  breakdown.unidades,

units:
  breakdown.unidades,

unidadesBono:
  breakdown.unidadesBono,

bonusUnits:
  breakdown.unidadesBono,

unidadesPorCaja:
  unitsPerBox,

unitsPerBox,
entradaPagada:
  breakdown.paidUnits,

entradaBono:
  breakdown.bonusUnits,

costoUnitario,

unitCost:
  costoUnitario,

costoPorUnidad:
  costoUnitario,

costoPorCaja,

lastCostPerBox:
  costoPorCaja,

precioVenta,

price:
  precioVenta,

costoTotal,

expenseId:
  String(
    source.expenseId ||
      ""
  ).trim(),

detalle:
  String(
     source.detalle ||
       ""
  ),

conversionId:
  String(
    source.conversionId ||
      ""
  ).trim(),

conversionType:
  String(
    source.conversionType ||
      ""
  ).trim(),

fechaOperacion:
  bioxInvGetMovementOperationDateValue(
     source
  ),

createdAtMs:
  bioxInvGetTimestampMs(
    source.createdAt
  )
    };
}

function bioxInvBuildMovementData({
  productId,
  productName,
  codigoProducto,
  tipoMovimiento,
  referenciaLibro,
  numeroDocumento,
  entrada,
  salida,
  saldoAnterior,
  saldoActual,

    cajas = 0,
    cajasBono = 0,
    unidades = 0,
    unidadesBono = 0,
    unidadesPorCaja = 1,

    costoUnitario = 0,
    costoPorCaja = 0,
    precioVenta = 0,

    costoTotal,
    entradaPagada,
    entradaBono,

    proveedorId = "",
    proveedorNombre = "",
    proveedorRazonSocial = "",

    proveedorIds = [],
    proveedores = [],

    detalle,
    user,
    operationDate,
    expenseId = "",

  conversionId = "",
  conversionType = ""
}) {
  const context =
     bioxInvCurrentUserInventoryContext ||
     {};

    const validOperationDate =
      operationDate instanceof Date
        ? operationDate
        : bioxInvParseOperationDate(
             operationDate
          );

    const normalizedUnitsPerBox =
      Math.max(
        0.000001,
        bioxInvDecimalOrZero(
          unidadesPorCaja
       ) || 1
  );

const normalizedBoxes =
  bioxInvDecimalOrZero(
     cajas
  );

const normalizedBonusBoxes =
  bioxInvDecimalOrZero(
     cajasBono
  );

const normalizedUnits =
  bioxInvDecimalOrZero(
     unidades
  );

const normalizedBonusUnits =
  bioxInvDecimalOrZero(
     unidadesBono
  );

const calculatedPaidUnits =
  bioxInvDecimalOrZero(
     normalizedBoxes *
       normalizedUnitsPerBox +
       normalizedUnits
  );

const calculatedBonusUnits =
  bioxInvDecimalOrZero(
     normalizedBonusBoxes *
       normalizedUnitsPerBox +
       normalizedBonusUnits
  );

const normalizedPaidUnits =
  entradaPagada !==
    undefined &&
  entradaPagada !==
    null
    ? bioxInvDecimalOrZero(
         entradaPagada
      )
    : calculatedPaidUnits;

const normalizedBonusUnitsTotal =
  entradaBono !==
    undefined &&
  entradaBono !==
    null
    ? bioxInvDecimalOrZero(
         entradaBono
      )
    : calculatedBonusUnits;

const normalizedEntry =
  entrada !==
    undefined &&
  entrada !==
    null
    ? bioxInvDecimalOrZero(
         entrada
      )
    : bioxInvDecimalOrZero(
         normalizedPaidUnits +
           normalizedBonusUnitsTotal
      );

let normalizedCostUnit =
  Math.max(
     0,
     bioxInvNumberOrZero(
        costoUnitario
     )
  );

let normalizedCostBox =
  Math.max(
     0,
     bioxInvNumberOrZero(
        costoPorCaja
     )
  );

if (
  normalizedCostBox >
  0
) {
  normalizedCostUnit =
     normalizedCostBox /
     normalizedUnitsPerBox;

  normalizedCostBox =
    normalizedCostUnit *
    normalizedUnitsPerBox;
} else {
  normalizedCostBox =
    normalizedCostUnit *
    normalizedUnitsPerBox;
}

const normalizedSalePrice =
  Math.max(
     0,
     bioxInvNumberOrZero(
        precioVenta
     )
  );

const normalizedCostTotal =
  costoTotal !==
    undefined &&
  costoTotal !==
    null
    ? Math.max(
         0,
         bioxInvNumberOrZero(
            costoTotal
         )
      )
    : Math.max(
         0,
         normalizedPaidUnits *
            normalizedCostUnit
      );

const providerCollection =
  bioxInvMergeProviderCollections(
     proveedores,
     bioxInvNormalizeIdArray(
        proveedorIds
     ).map(
        id =>
          bioxInvGetProviderById(
            id
          )
     ),
     bioxInvNormalizeProviderObject({
        id:
          proveedorId,
        nombre:
          proveedorNombre,
        razonSocialDenominacion:
          proveedorRazonSocial
     })
  );

const normalizedProviderIds =
  bioxInvGetProviderIds(
     providerCollection
  );

const primaryProvider =
  providerCollection[0] ||
  null;

const providerNames =
  providerCollection
    .map(
      provider =>
        bioxInvGetProviderName(
          provider
        )
    )
    .filter(Boolean);

const providerReasons =
  providerCollection
    .map(
      provider =>
        bioxInvGetProviderBusinessName(
          provider
        )
    )
    .filter(Boolean);

const providerDisplay =
  providerCollection.length
    ? providerCollection
        .map(
          provider =>
            bioxInvGetProviderDisplayName(
              provider
            )
        )
        .filter(Boolean)
        .join(" | ")
    : "Sin proveedor";

return {
  productId,

  productName:
    productName ||
    "",

  codigoProducto:
    codigoProducto ||
    "",

  productCode:
    codigoProducto ||
    "",

  tipoMovimiento:
    tipoMovimiento ||
    "entrada",

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
    normalizedEntry,

  salida:
    bioxInvDecimalOrZero(
       salida
    ),

  saldoAnterior:
    bioxInvDecimalOrZero(
       saldoAnterior
    ),

  saldoActual:
 bioxInvDecimalOrZero(
    saldoActual
 ),

cajas:
  normalizedBoxes,

boxes:
  normalizedBoxes,

cajasBono:
  normalizedBonusBoxes,

bonusBoxes:
  normalizedBonusBoxes,

unidades:
  normalizedUnits,

units:
  normalizedUnits,

unidadesBono:
  normalizedBonusUnits,

bonusUnits:
  normalizedBonusUnits,

unidadesPorCaja:
  normalizedUnitsPerBox,

unitsPerBox:
  normalizedUnitsPerBox,

entradaPagada:
  normalizedPaidUnits,

entradaBono:
  normalizedBonusUnitsTotal,

costoUnitario:
  normalizedCostUnit,

unitCost:
  normalizedCostUnit,

costoPorUnidad:
  normalizedCostUnit,

costoPorCaja:
  normalizedCostBox,

lastCostPerBox:
  normalizedCostBox,

precioVenta:
  normalizedSalePrice,

price:
  normalizedSalePrice,
costoTotal:
  normalizedCostTotal,

proveedores:
  providerCollection,

proveedorIds:
  normalizedProviderIds,

providerIds:
  normalizedProviderIds,

providerList:
  providerCollection,

providerDisplay,

proveedorId:
  primaryProvider?.id ||
  "",

proveedorNombre:
  providerNames.join(
     " | "
  ),

proveedorRazonSocial:
  providerReasons.join(
     " | "
  ),

providerId:
  primaryProvider?.id ||
  "",

providerName:
  providerNames.join(
     " | "
  ),

providerBusinessName:
  providerReasons.join(
     " | "
  ),

expenseId:
  String(
    expenseId ||
      ""
  ).trim(),

conversionId:
  String(
    conversionId ||
      ""
  ).trim(),

conversionType:
  String(
             conversionType ||
               ""
           ).trim(),

         detalle:
           detalle ||
           "",

         fechaOperacion:
           validOperationDate
             ? bioxInvGetLocalDateInputValue(
                 validOperationDate
               )
             : "",

         id_local:
           bioxInvCurrentLocalId ||
           null,

         localNombre:
           bioxInvCurrentLocalInfo.nombre ||
           "",

         localNumeroDocumento:
           bioxInvCurrentLocalInfo.numeroDocumento ||
           "",

         localUbicacion:
           bioxInvCurrentLocalInfo.ubicacion ||
           "",

         localContribuyente:
           bioxInvCurrentLocalInfo.contribuyente ||
           "",

         localTipoDocumento:
           bioxInvCurrentLocalInfo.tipoDocumento ||
           "",

         localNIT:
           bioxInvCurrentLocalInfo.nit ||
           "",

         localNRC:
           bioxInvCurrentLocalInfo.nrc ||
           "",

         userId:
           user
             ? user.uid
             : null,

         userName:
           context.name ||
           user?.email ||
           ""
    };
}

