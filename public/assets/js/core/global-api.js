import { auth, db } from "../config/firebase.js";
import * as collections from "../config/collections.js";
import * as roles from "../security/roles.js";
import { ensureMvcNamespace, registerRoute, registerSecurePageController, registerPublicPageController, getRouteConfig, isPublicRoute, getRouteHref, redirectToRoute, redirectToLogin } from "../routing/app-router.js";
import { redirectAccordingToRole, renderNavigationForRole, canAccessPage } from "../ui/navigation.js";
import { getTodayBounds } from "../utils/dates.js";
import { getDailyFinancialSummary, formatMoney } from "../finance/financial.js";
import { getCurrentLocalId, getCurrentLocalInfo, matchesLocalContext } from "../session/local-context.js";
import { sessionState } from "../session/state.js";
import { getStoredCurrentUser, setStoredCurrentUser, patchStoredCurrentUser } from "../session/storage.js";
import { getCurrentUserContext, ensureCurrentUserContext } from "../session/user-context.js";
import { preloadSessionData, ensureSessionDataLoaded } from "../session/preload.js";
import { getSessionContext, getSessionCollection, getSessionCollectionData, getSessionCollectionStatus, getSessionDocument, setSessionCollection, seedSessionCollection, upsertSessionDocument, removeSessionDocument, updateSessionDocumentsWhere, invalidateSessionCollection, clearSessionDataCache, getSessionCacheStatus } from "../session/cache.js";

export function exposeGlobalApi() {
  window.auth = auth;
  window.db = db;

  for (const name of [
    "normalizeRole", "getCanonicalRole", "isDeveloperRole", "roleRequiresLocal",
    "canManageExpensesForRole", "canEditInventoryForRole", "canReduceStockForRole",
    "canCreateSalesForRole", "canManageOwnSaleForRole", "canCreateStockMovementForRole"
  ]) window[name] = roles[name];

  window.AppRouter = {
    registerRoute,
    registerSecurePageController,
    registerPublicPageController,
    getRouteConfig,
    isPublicRoute,
    canAccessPage,
    getRouteHref,
    redirectToRoute,
    redirectToLogin,
    redirectAccordingToRole
  };

  window.InventoryMVC = ensureMvcNamespace();
  window.renderNavigationForRole = renderNavigationForRole;
  window.redirectAccordingToRole = redirectAccordingToRole;
  window.getTodayBounds = getTodayBounds;
  window.getDailyFinancialSummary = getDailyFinancialSummary;
  window.getCurrentLocalId = getCurrentLocalId;
  window.getCurrentLocalInfo = getCurrentLocalInfo;
  window.matchesLocalContext = matchesLocalContext;
  window.formatMoney = formatMoney;
  window.getStoredCurrentUser = getStoredCurrentUser;
  window.setStoredCurrentUser = setStoredCurrentUser;
  window.patchStoredCurrentUser = patchStoredCurrentUser;
  window.currentLocalContext = sessionState.currentLocalContext;
  window.getCurrentUserContext = getCurrentUserContext;
  window.ensureCurrentUserContext = ensureCurrentUserContext;
  window.preloadSessionData = preloadSessionData;
  window.ensureSessionDataLoaded = ensureSessionDataLoaded;
  window.getSessionContext = getSessionContext;
  window.getSessionCollection = getSessionCollection;
  window.getSessionCollectionData = getSessionCollectionData;
  window.getSessionCollectionStatus = getSessionCollectionStatus;
  window.getSessionDocument = getSessionDocument;
  window.setSessionCollection = setSessionCollection;
  window.seedSessionCollection = seedSessionCollection;
  window.upsertSessionDocument = upsertSessionDocument;
  window.removeSessionDocument = removeSessionDocument;
  window.updateSessionDocumentsWhere = updateSessionDocumentsWhere;
  window.invalidateSessionCollection = invalidateSessionCollection;
  window.clearSessionDataCache = clearSessionDataCache;
  window.getSessionCacheStatus = getSessionCacheStatus;

  for (const [key, value] of Object.entries(collections)) {
    if (key.endsWith("_COLLECTION_NAME")) window[key] = value;
  }
}
