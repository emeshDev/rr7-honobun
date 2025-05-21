// app/server/middlewares/formDataErrorMiddleware.ts
import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";

export const formDataErrorMiddleware: MiddlewareHandler = async (c, next) => {
  // Simpan URL asli untuk pengecekan
  const url = c.req.url;

  try {
    // Lanjutkan ke middleware berikutnya
    await next();
  } catch (error) {
    // Cek jika ini error formData parsing
    if (
      error instanceof Error &&
      (error.message.includes("form data") ||
        error.message.includes("MIME type/boundary") ||
        error.message.includes("ERR_FORMDATA_PARSE_ERROR") ||
        (error as any).name === "ERR_FORMDATA_PARSE_ERROR")
    ) {
      console.error(
        "[FormDataMiddleware] Caught form data error:",
        error.message
      );

      // Untuk endpoint API (.data)
      if (url.includes(".data")) {
        return c.json(
          {
            success: false,
            message: "Invalid form submission",
            errors: {
              _form: [
                "The form was submitted with an invalid format. Please try again.",
              ],
            },
          },
          400
        );
      }

      // Untuk halaman biasa, tampilkan halaman error HTML
      return c.html(
        `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Form Submission Error</title>
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
            <h1>Form Submission Error</h1>
            <p>The form was submitted incorrectly. Please return to the form page and try again.</p>
            <button onclick="window.location.href='/register'">
              Return to Registration
            </button>
          </div>
        </body>
        </html>
      `,
        400
      );
    }

    // Re-throw errors lainnya untuk ditangani oleh error handler lain
    throw error;
  }
};
