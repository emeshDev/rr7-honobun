// app/utils/cookieExpiryCheck.ts

/**
 * Gets the estimated expiry time of an authentication cookie.
 * Since HTTP-only cookies don't expose their expiry directly to JavaScript,
 * this function makes a best estimation based on available information.
 *
 * @returns {string|null} ISO string of estimated expiry time or null if no auth cookie
 */
export function getAuthCookieExpiry(): string | null {
  // Skip if not in browser
  if (typeof document === "undefined") return null;

  // Check if auth cookie exists
  const cookies = document.cookie.split(";").map((c) => c.trim());
  const hasAuthStatusCookie = cookies.some((c) => c.startsWith("auth_status="));
  const hasAccessTokenCookie = cookies.some((c) =>
    c.startsWith("access_token=")
  );

  if (!hasAuthStatusCookie && !hasAccessTokenCookie) {
    return null;
  }

  // For HTTP-only cookies, we can't directly access expiry from JS
  // We'll use several approaches to estimate expiry:

  // 1. Check if we have a lastSuccessfulAuth in sessionStorage
  try {
    const lastAuthData = sessionStorage.getItem("lastSuccessfulAuth");
    if (lastAuthData) {
      const authData = JSON.parse(lastAuthData);
      if (authData.expiryTime) {
        // Validate that it's not too far in the future (max 20 min from now)
        const expiryTime = new Date(authData.expiryTime).getTime();
        const maxReasonableExpiry = Date.now() + 20 * 60 * 1000;

        if (expiryTime <= maxReasonableExpiry) {
          return authData.expiryTime;
        }
      }
    }
  } catch (e) {
    console.error("Error parsing lastSuccessfulAuth:", e);
  }

  // 2. If a recent refresh happened, use that information
  // This is a more reliable estimate for session expiry
  try {
    const reduxState = sessionStorage.getItem("reduxState");
    if (reduxState) {
      const state = JSON.parse(reduxState);
      const lastRefresh = state.auth?.lastSuccessfulRefresh;

      if (lastRefresh) {
        const refreshTime = new Date(lastRefresh).getTime();
        // If refresh was recent (in the last 5 minutes), we can use it to estimate
        if (Date.now() - refreshTime < 5 * 60 * 1000) {
          // Standard token lifetime is 15 minutes from refresh
          return new Date(refreshTime + 15 * 60 * 1000).toISOString();
        }
      }
    }
  } catch (e) {
    console.error("Error parsing reduxState for refresh info:", e);
  }

  // 3. Default to standard token lifetime (15 minutes from now)
  // This is a reasonable fallback since tokens are typically refreshed well before expiry
  return new Date(Date.now() + 15 * 60 * 1000).toISOString();
}

/**
 * Gets the estimated expiry time for a specific cookie by name.
 * This is a best-effort function since JavaScript can't directly
 * access the expiry of HTTP-only cookies.
 *
 * @param {string} cookieName - The name of the cookie
 * @returns {string|null} ISO string of estimated expiry time or null if cookie not found
 */
export function getCookieExpiry(cookieName: string): string | null {
  if (typeof document === "undefined") return null;

  const cookies = document.cookie.split(";").map((c) => c.trim());
  const cookie = cookies.find((c) => c.startsWith(`${cookieName}=`));

  if (!cookie) return null;

  // For most browsers with non-HTTP-only cookies, we can't directly access
  // the expiry from JS. However, we know our auth tokens expire after 15 minutes,
  // so we'll use a conservative estimate

  // First try getting last-known expiry from sessionStorage
  try {
    const lastAuthData = sessionStorage.getItem("lastSuccessfulAuth");
    if (lastAuthData) {
      const authData = JSON.parse(lastAuthData);
      if (authData.expiryTime) {
        return authData.expiryTime;
      }
    }
  } catch (e) {
    console.error("Error reading lastSuccessfulAuth:", e);
  }

  // Fallback to standard expiry time: 15 minutes from now
  // This is the default token lifetime in your system
  return new Date(Date.now() + 15 * 60 * 1000).toISOString();
}

/**
 * Checks if the expiry time in Redux state is significantly different from
 * what we'd expect based on the presence of auth cookies.
 *
 * @param {string|null} stateExpiresAt - The expiresAt value from Redux state
 * @returns {boolean} True if there's a suspicious mismatch
 */
export function hasExpiryMismatch(stateExpiresAt: string | null): boolean {
  if (!stateExpiresAt) return false;
  if (!hasAuthCookie()) return true;

  const stateExpiry = new Date(stateExpiresAt).getTime();
  const now = Date.now();

  // Case 1: State says we're expired, but cookie exists
  if (stateExpiry < now) {
    return true;
  }

  // Case 2: State says we expire too far in the future (more than 20 min)
  // Tokens only last 15 minutes in your system
  const maxReasonableExpiry = now + 20 * 60 * 1000;
  if (stateExpiry > maxReasonableExpiry) {
    return true;
  }

  return false;
}

/**
 * Checks if an auth cookie exists in the browser
 */
export function hasAuthCookie(): boolean {
  return (
    typeof document !== "undefined" &&
    document.cookie.split(";").some((c) => c.trim().startsWith("auth_status="))
  );
}
