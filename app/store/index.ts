import {
  configureStore,
  createListenerMiddleware,
  combineReducers,
} from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { api } from "./api";
import { authApi, hasAuthCookie } from "./authApi";
import authReducer from "./authSlice";
import { getAuthCookieExpiry } from "~/utils/cookieExpiryCheck";

// Deteksi environment
const isServer = typeof window === "undefined";
const isClient = !isServer;

// Tambahkan listenerMiddleware untuk sinkronisasi state
const listenerMiddleware = createListenerMiddleware();

// Buat root reducer dengan combineReducers
const rootReducer = combineReducers({
  [api.reducerPath]: api.reducer,
  [authApi.reducerPath]: authApi.reducer,
  auth: authReducer,
});

// Buat store
export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) => {
    return getDefaultMiddleware()
      .concat(api.middleware)
      .concat(authApi.middleware)
      .concat(listenerMiddleware.middleware);
  },
  preloadedState: loadState(),
  // Gunakan devTools hanya di client dan non-production
  devTools: isClient && process.env.NODE_ENV !== "production",
});

// === Helper Functions ===

// Coba muat state dari sessionStorage atau window.__PRELOADED_STATE__
function loadState() {
  try {
    // On server, always return undefined
    if (typeof window === "undefined") return undefined;

    console.log("[Store] Checking for preloaded state...");

    // First check for preloaded state from window
    if (window.__PRELOADED_STATE__) {
      console.log("[Store] Found preloaded state from server");
      const preloadedState = window.__PRELOADED_STATE__;
      delete window.__PRELOADED_STATE__;
      return preloadedState;
    }

    console.log("[Store] No preloaded state, checking sessionStorage");

    // Fallback to sessionStorage
    const serializedState = sessionStorage.getItem("reduxState");
    if (!serializedState) return undefined;

    const parsedState = JSON.parse(serializedState);

    // VALIDATION 1: If we have user in state but no auth cookie, clear auth state
    if (parsedState.auth?.user && !hasAuthCookie()) {
      console.log(
        "[Store] Auth state found but no auth cookie, clearing auth state"
      );
      return {
        ...parsedState,
        auth: {
          user: null,
          expiresAt: null,
          isLoading: false,
          source: null,
          logoutInProgress: false,
          refreshInProgress: false,
          lastRefreshAttempt: null,
          lastSuccessfulRefresh: null,
        },
      };
    }

    // VALIDATION 2: If we have auth state and cookie, verify expiresAt is reasonable
    if (
      parsedState.auth?.user &&
      hasAuthCookie() &&
      parsedState.auth.expiresAt
    ) {
      const expiryTime = new Date(parsedState.auth.expiresAt).getTime();
      const now = Date.now();

      // Flag suspicious cases:
      // 1. If expiry is more than 20 minutes in future (tokens only last 15 min)
      // 2. If expired but cookie exists
      // 3. If expiry is unreasonably far in the past
      const isSuspiciousExpiry =
        expiryTime > now + 20 * 60 * 1000 || // too far in future
        (expiryTime < now && hasAuthCookie()) || // expired but cookie exists
        expiryTime < now - 60 * 60 * 1000; // unreasonably far in past

      if (isSuspiciousExpiry) {
        console.log(
          "[Store] Suspicious expiresAt detected in sessionStorage:",
          new Date(expiryTime).toLocaleString()
        );

        // Get a reliable expiresAt estimate based on cookie
        const cookieExpiry = getAuthCookieExpiry();

        if (cookieExpiry) {
          console.log(
            "[Store] Correcting expiresAt with cookie-based value:",
            new Date(cookieExpiry).toLocaleString()
          );

          return {
            ...parsedState,
            auth: {
              ...parsedState.auth,
              expiresAt: cookieExpiry,
            },
          };
        }
      }
    }

    return parsedState;
  } catch (e) {
    console.warn("[Store] Failed to load state from sessionStorage:", e);
    return undefined;
  }
}

// Fungsi untuk menyimpan state
const saveState = (state: RootState) => {
  try {
    // Skip di server
    if (isServer) return;

    const serializedState = JSON.stringify({
      auth: state.auth,
    });
    sessionStorage.setItem("reduxState", serializedState);
  } catch (e) {
    console.warn("Failed to save state to sessionStorage:", e);
  }
};

// Subscribe untuk menyimpan state ke sessionStorage (hanya di client)
if (isClient) {
  let throttleTimeout: ReturnType<typeof setTimeout> | null = null;

  store.subscribe(() => {
    if (throttleTimeout) clearTimeout(throttleTimeout);

    // Throttle untuk performa
    throttleTimeout = setTimeout(() => {
      saveState(store.getState());
    }, 1000);
  });
}

// Setup listeners untuk RTK Query
setupListeners(store.dispatch);

// Definisikan RootState berdasarkan store yang sudah dibuat
// Ini akan menghasilkan tipe yang spesifik untuk state saat ini
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
