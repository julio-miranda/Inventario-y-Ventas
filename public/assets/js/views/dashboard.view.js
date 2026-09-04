// assets/js/views/dashboard.view.js

"use strict";


const selectors = Object.freeze({

  greetings:
    ".userGreeting",

  salesTableBody:
    "#salesTable tbody",

  expensesTableBody:
    "#expensesTable tbody",

  movementsTableBody:
    "#movementsTable tbody",

  rangeFrom:
    "#rangeFrom",

  rangeTo:
    "#rangeTo",

  rangeSearch:
    "#rangeSearch",

  heroNote:
    ".hero-note",

  lowStockPanel:
    "#lowStockPanel",

  profitStatus:
    "#profitStatus",

  salesRangeLabel:
    "#salesRangeLabel",

  expenseRangeLabel:
    "#expenseRangeLabel",

  movementRangeLabel:
    "#movementRangeLabel",

  salesCountLabel:
    "#salesCountLabel",

  expenseCountLabel:
    "#expenseCountLabel",

  movementCountLabel:
    "#movementCountLabel",

  btnGoInventory:
    "#btnGoInventory",

  btnCloseDay:
    "#btnCloseDay",

  btnExportSalesCSV:
    "#btnExportSalesCSV",

  btnExportExpensesCSV:
    "#btnExportExpensesCSV",

  btnExportMovementsExcel:
    "#btnExportMovementsExcel",

  btnApplyRange:
    "#btnApplyRange",

  btnResetRange:
    "#btnResetRange",

  statSales:
    "#statSales",

  statExpenses:
    "#statExpenses",

  statNet:
    "#statNet",

  statUnitsSold:
    "#statUnitsSold",

  statProductsSold:
    "#statProductsSold",

  statLowStock:
    "#statLowStock",

  salesChart:
    "#salesChart"

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


function setText(
  elementOrSelector,
  value = ""
) {

  const element =
    typeof elementOrSelector ===
      "string"

      ? qs(
          elementOrSelector
        )

      : elementOrSelector;


  if (
    element
  ) {

    element.textContent =
      value;

  }
}


function setHtml(
  elementOrSelector,
  html = ""
) {

  const element =
    typeof elementOrSelector ===
      "string"

      ? qs(
          elementOrSelector
        )

      : elementOrSelector;


  if (
    element
  ) {

    element.innerHTML =
      html;
  }
}


function escapeHtml(
  value = ""
) {

  return String(
    value ?? ""
  ).replace(
    /[&<>"'`=\/]/g,
    char =>
      ({
        "&":
          "&amp;",

        "<":
          "&lt;",

        ">":
          "&gt;",

        '"':
          "&quot;",

        "'":
          "&#39;",

        "`":
          "&#96;",

        "=":
          "&#61;",

        "/":
          "&#x2F;"

      }[
        char
      ])
  );
}


function getElements() {

  return {

    greetings:
      qsa(
        selectors.greetings
      ),

    salesTableBody:
      qs(
        selectors.salesTableBody
      ),

    expensesTableBody:
      qs(
        selectors.expensesTableBody
      ),

    movementsTableBody:
      qs(
        selectors.movementsTableBody
      ),

    rangeFrom:
      qs(
        selectors.rangeFrom
      ),

    rangeTo:
      qs(
        selectors.rangeTo
      ),

    rangeSearch:
      qs(
        selectors.rangeSearch
      ),

    heroNote:
      qs(
        selectors.heroNote
      ),

    lowStockPanel:
      qs(
        selectors.lowStockPanel
      ),

    profitStatus:
      qs(
        selectors.profitStatus
      ),

    salesRangeLabel:
      qs(
        selectors.salesRangeLabel
      ),

    expenseRangeLabel:
      qs(
        selectors.expenseRangeLabel
      ),

    movementRangeLabel:
      qs(
        selectors.movementRangeLabel
      ),

    salesCountLabel:
      qs(
        selectors.salesCountLabel
      ),

    expenseCountLabel:
      qs(
        selectors.expenseCountLabel
      ),

    movementCountLabel:
      qs(
        selectors.movementCountLabel
      ),

    btnGoInventory:
      qs(
        selectors.btnGoInventory
      ),

    btnCloseDay:
      qs(
        selectors.btnCloseDay
      ),

    btnExportSalesCSV:
      qs(
        selectors.btnExportSalesCSV
      ),

    btnExportExpensesCSV:
      qs(
        selectors.btnExportExpensesCSV
      ),

    btnExportMovementsExcel:
      qs(
        selectors.btnExportMovementsExcel
      ),

    btnApplyRange:
      qs(
        selectors.btnApplyRange
      ),

    btnResetRange:
      qs(
        selectors.btnResetRange
      ),

    statSales:
      qs(
        selectors.statSales
      ),

    statExpenses:
      qs(
        selectors.statExpenses
      ),

    statNet:
      qs(
        selectors.statNet
      ),

    statUnitsSold:
      qs(
        selectors.statUnitsSold
      ),

    statProductsSold:
      qs(
        selectors.statProductsSold
      ),

    statLowStock:
      qs(
        selectors.statLowStock
      ),

    salesChart:
      qs(
        selectors.salesChart
      )

  };
}


export {

  selectors,

  qs,

  qsa,

  setText,

  setHtml,

  escapeHtml,

  getElements

};


export default Object.freeze({

  selectors,

  qs,

  qsa,

  setText,

  setHtml,

  escapeHtml,

  getElements

});