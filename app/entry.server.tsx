// app/entry.server.tsx
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server.bun";
import type { AppLoadContext, EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { store } from "./store";
import {
  api,
  getRunningQueriesThunk,
  injectPreloadedState,
  type CustomStartQueryOptions,
} from "./store/api";
import { Provider } from "react-redux";
import { syncServerAuth } from "./store/authSlice";
import { isProtectedRoute } from "./utils/routeAuth";

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext
) {
  let shellRendered = false;
  const userAgent = request.headers.get("user-agent");
  const clientOrigin = request.headers.get("origin");
  const cookies = request.headers.get("Cookie") || "";
  const url = new URL(request.url);

  // IMPROVEMENT 1: Enhanced check for source map and development files
  if (
    url.pathname.endsWith(".map") ||
    url.pathname.includes("installHook.js") ||
    url.pathname.includes("__vite_") ||
    url.pathname.includes("_dev_")
  ) {
    console.log(`[Server] Skipping SSR for development file: ${url.pathname}`);
    return new Response(null, { status: 204 });
  }

  // IMPROVEMENT 2: Process Logout Detection
  const isLogoutRequest =
    url.pathname === "/api/auth/logout" ||
    url.pathname === "/api/auth/logout-all";

  if (isLogoutRequest) {
    // if there is request to logout endpoint, dont be rendered by SSR
    responseHeaders.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ success: true }), {
      headers: responseHeaders,
      status: 200,
    });
  }

  // Buat options dengan tipe yang benar
  const queryOptions: CustomStartQueryOptions = {
    extra: {
      origin: clientOrigin || undefined,
      userAgent: userAgent || undefined,
    },
  };

  // IMPROVEMENT 3: Check AUTH Status on Server Side - UPDATED to use routeAuth
  // Sekarang menggunakan isProtectedRoute dari routeAuth.ts
  if (isProtectedRoute(url.pathname)) {
    try {
      const cookies = request.headers.get("Cookie") || "";
      const hasAuthCookie =
        cookies.includes("access_token=") ||
        cookies.includes("auth_status=authenticated");

      if (hasAuthCookie) {
        console.log(
          `[Server] Checking authentication for protected route: ${url.pathname}`
        );
        try {
          const isAuthenticated = await _loadContext.isAuthenticated();

          if (isAuthenticated) {
            try {
              const user = await _loadContext.getCurrentUser();
              if (user) {
                console.log("[Server] User authenticated for SSR:", user.email);
                // Hydrate auth state for SSR
                store.dispatch(
                  syncServerAuth({
                    user,
                    expiresAt: new Date(
                      Date.now() + 15 * 60 * 1000
                    ).toISOString(),
                  })
                );
              }
            } catch (userError) {
              console.error("[Server] Error fetching user data:", userError);
            }
          }
        } catch (authError) {
          console.error("[Server] Auth verification error:", authError);
        }
      }
    } catch (error) {
      console.error("[Server] Auth check error:", error);
      // Don't fail the entire request if auth check fails
    }
  }

  // Pre-fetch data for certain routes - TETAP MENGGUNAKAN routeUtils.ts
  // try {
  //   console.log(`[Server] Analyzing route for prefetch: ${url.pathname}`);

  //   // Get prefetch configuration for this route - MENGGUNAKAN FUNGSI DARI routeUtils.ts
  //   const prefetchConfig = getRoutePrefetchConfig(url.pathname);

  //   // Check if we should prefetch for this route
  //   if (!prefetchConfig.shouldPrefetch) {
  //     console.log(
  //       `[Server] No prefetch needed: ${
  //         prefetchConfig.description || prefetchConfig.reason
  //       }`
  //     );
  //   } else {
  //     // Prepare query options
  //     const queryOptions: CustomStartQueryOptions = {
  //       subscribe: false,
  //       forceRefetch: true,
  //       extra: {
  //         origin: clientOrigin || undefined,
  //         userAgent: userAgent || undefined,
  //       },
  //     };

  //     console.log(
  //       `[Server] Prefetching for: ${prefetchConfig.description} (${url.pathname})`
  //     );

  //     // Dispatch the appropriate query based on endpoint from config
  //     if (prefetchConfig.endpoint === "getUsers") {
  //       console.log("[Server] Dispatching getUsers query");
  //       store.dispatch(
  //         api.endpoints.getUsers.initiate(undefined, queryOptions)
  //       );
  //     } else if (
  //       prefetchConfig.endpoint === "getUserById" &&
  //       typeof prefetchConfig.params === "number"
  //     ) {
  //       console.log(
  //         `[Server] Dispatching getUserById query for id: ${prefetchConfig.params}`
  //       );
  //       store.dispatch(
  //         api.endpoints.getUserById.initiate(
  //           prefetchConfig.params,
  //           queryOptions
  //         )
  //       );
  //     }

  //     // Wait for queries to complete
  //     console.log("[Server] Waiting for all queries to complete...");
  //     try {
  //       const timeoutPromise = new Promise((_, reject) =>
  //         setTimeout(() => reject(new Error("Query timeout")), 3000)
  //       );

  //       await Promise.race([
  //         Promise.all(store.dispatch(getRunningQueriesThunk())),
  //         timeoutPromise,
  //       ]);

  //       // Debug: Log state after prefetch
  //       if (process.env.NODE_ENV === "development") {
  //         const apiState = store.getState()[api.reducerPath];
  //         const queryCount = Object.keys(apiState?.queries || {}).length;
  //         console.log(
  //           `[Server] RTK Query state after prefetch: ${queryCount} queries`
  //         );
  //       }

  //       console.log("[Server] All queries completed successfully");
  //     } catch (queryError) {
  //       console.warn("[Server] Query timeout or error:", queryError);
  //     }
  //   }
  // } catch (prefetchError) {
  //   console.error("[Server] Prefetch error:", prefetchError);
  //   // Continue rendering even if prefetch fails
  // }

  // IMPROVEMENT 4: Improved error handling for renderToReadableStream
  try {
    // Rendering React app including redux store
    const stream = await renderToReadableStream(
      <Provider store={store}>
        <ServerRouter context={routerContext} url={request.url} />
      </Provider>,
      {
        onError(error: unknown) {
          console.error("[Server] Render error:", error);
          // Set responseStatusCode berdasarkan error
          if (error instanceof Response) {
            responseStatusCode = error.status;
          } else {
            responseStatusCode = 500;
          }

          if (shellRendered) {
            console.error(error);
          }
        },
        // IMPROVEMENT 5: Add signal for timeout/abort control
        signal: AbortSignal.timeout(5000), // 5 second timeout
      }
    );

    shellRendered = true;

    // IMPROVEMENT 6: Better bot detection and handling
    const isBot = userAgent && isbot(userAgent);

    if (isBot || routerContext.isSpaMode) {
      try {
        // Add timeout for bots/SPA mode too
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("allReady timeout")), 3000)
        );

        await Promise.race([stream.allReady, timeoutPromise]);
      } catch (allReadyError) {
        console.warn("[Server] allReady timeout or error:", allReadyError);
        // Continue anyway
      }
    }

    // Convert stream to string to inject the Redux state
    const html = await streamToString(stream);

    // Get current Redux state
    const preloadedState = store.getState();

    // Inject state into HTML
    const finalHtml = injectPreloadedState(html, preloadedState);

    // Set response headers
    responseHeaders.set("Content-Type", "text/html");

    // Return final HTML with injected state
    return new Response(finalHtml, {
      headers: responseHeaders,
      status: responseStatusCode,
    });
  } catch (streamError) {
    console.error("[Server] Stream error:", streamError);

    // Log error secara terperinci untuk debugging tapi tidak untuk response
    console.error(
      "[Server] Error details:",
      streamError instanceof Error
        ? {
            name: streamError.name,
            message: streamError.message,
            // Jangan log stack trace di production
            stack:
              process.env.NODE_ENV === "development"
                ? streamError.stack
                : undefined,
          }
        : streamError
    );

    // Deteksi formData error dengan lebih robust
    const isFormDataError = (() => {
      if (!(streamError instanceof Error)) return false;

      const errorMessage = String(streamError.message).toLowerCase();
      const errorStack = String(streamError.stack || "").toLowerCase();
      const errorName = String(streamError.name || "");

      return (
        errorMessage.includes("form data") ||
        errorMessage.includes("mime type") ||
        errorMessage.includes("boundary") ||
        errorMessage.includes("formdata") ||
        errorName === "err_formdata_parse_error" ||
        errorStack.includes("formdata")
      );
    })();

    // Set status code yang sesuai
    const statusCode = isFormDataError ? 400 : 500;

    // Menentukan tipe konten berdasarkan Accept header
    const acceptHeader = request.headers.get("Accept") || "";
    let isJsonResponse = acceptHeader.includes("application/json");

    // Jika ini adalah permintaan ke endpoint .data, selalu kembalikan JSON
    if (request.url.includes(".data")) {
      isJsonResponse = true;
    }

    if (isJsonResponse) {
      // Response JSON untuk endpoint API
      responseHeaders.set("Content-Type", "application/json");
      return new Response(
        JSON.stringify({
          success: false,
          message: isFormDataError
            ? "Invalid form submission"
            : "Internal server error",
          errors: {
            _form: [
              isFormDataError
                ? "The form was submitted with an invalid format. Please try again using the form provided on the website."
                : "An unexpected error occurred. Please try again later.",
            ],
          },
        }),
        {
          headers: responseHeaders,
          status: statusCode,
        }
      );
    } else {
      // HTML fallback untuk browser
      responseHeaders.set("Content-Type", "text/html");

      // Simple fallback HTML
      const fallbackHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${isFormDataError ? "Invalid Request" : "Server Error"}</title>
          <style>
            body { 
              font-family: system-ui, -apple-system, sans-serif;
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0;
              background-color: #f9fafb;
            }
            .error-container {
              text-align: center;
              padding: 2rem;
              border-radius: 0.5rem;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
              max-width: 500px;
              width: 100%;
              background-color: white;
            }
            h1 { color: #4338ca; margin-bottom: 0.5rem; }
            p { color: #4b5563; margin-bottom: 1.5rem; }
            button {
              background-color: #4f46e5;
              color: white;
              border: none;
              padding: 0.5rem 1rem;
              border-radius: 0.25rem;
              cursor: pointer;
            }
            button:hover { background-color: #4338ca; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1>${isFormDataError ? "Invalid Request" : "Server Error"}</h1>
            <p>${
              isFormDataError
                ? "The form was submitted incorrectly. Please return to the form page and try again."
                : "An unexpected error occurred. Our team has been notified."
            }</p>
            <button onclick="window.location.href='${
              isFormDataError ? "/register" : "/"
            }'">
              ${isFormDataError ? "Return to Registration" : "Return to Home"}
            </button>
          </div>
        </body>
        </html>
      `;

      return new Response(fallbackHtml, {
        headers: responseHeaders,
        status: statusCode,
      });
    }
  }
}

// Helper function react router stream to string
async function streamToString(stream: ReadableStream): Promise<string> {
  console.log("[Server] Converting stream to string for state injection...");

  // Gunakan Buffer untuk mengumpulkan chunks
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } catch (error) {
    console.error("[Server] Error while reading stream:", error);
    throw error;
  } finally {
    reader.releaseLock();
  }

  // Gabung semua chunks dan decode
  const buffer = new Uint8Array(
    chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  );
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  const decoder = new TextDecoder();
  const html = decoder.decode(buffer);

  console.log("[Server] Stream converted to string successfully");
  return html;
}
