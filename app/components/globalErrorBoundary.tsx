import { isRouteErrorResponse, useRouteError } from "react-router";

export function GlobalErrorBoundary() {
  const error = useRouteError();

  // Untuk error tipe formData parsing
  if (
    error instanceof Error &&
    (error.message.includes("form data") ||
      error.message.includes("MIME type/boundary") ||
      error.message.includes("ERR_FORMDATA_PARSE_ERROR"))
  ) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md mx-auto my-8 max-w-xl">
        <h2 className="text-lg font-semibold text-red-800 mb-2">
          Form Submission Error
        </h2>
        <p className="text-sm text-red-700 mb-4">
          The form was submitted in an invalid format. Please try again using
          the form on the website.
        </p>
        <button
          onClick={() => (window.location.href = "/register")}
          className="px-3 py-1 bg-red-100 text-red-800 rounded-md text-sm"
        >
          Return to Registration
        </button>
      </div>
    );
  }

  // Untuk Route error responses (404, etc)
  if (isRouteErrorResponse(error)) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-md mx-auto my-8 max-w-xl">
        <h2 className="text-lg font-semibold text-amber-800 mb-2">
          {error.status} {error.statusText}
        </h2>
        <p className="text-sm text-amber-700 mb-4">
          {error.data?.message || "Something went wrong"}
        </p>
        <button
          onClick={() => (window.location.href = "/")}
          className="px-3 py-1 bg-amber-100 text-amber-800 rounded-md text-sm"
        >
          Return to Home
        </button>
      </div>
    );
  }

  // Untuk error umum
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-md mx-auto my-8 max-w-xl">
      <h2 className="text-lg font-semibold text-red-800 mb-2">
        Unexpected Error
      </h2>
      <p className="text-sm text-red-700 mb-4">
        An unexpected error occurred. Please try again later.
      </p>
      <button
        onClick={() => (window.location.href = "/")}
        className="px-3 py-1 bg-red-100 text-red-800 rounded-md text-sm"
      >
        Return to Home
      </button>
    </div>
  );
}
