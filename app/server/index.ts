// app/server/index.ts
import { createHonoServer } from "react-router-hono-server/bun";

import { setupMiddlewares } from "./middlewares";
import { setupApiRoutes } from "./api-routes";
import type { AppVariables } from "./types";
import type { Todo, User } from "~/db/schema";
import { getCurrentUserController } from "./controllers/getCurrentUser.controller";
import createTodoContext from "./context/todoContext";
import registrationContext from "./context/authContext";

// Definisi tipe untuk objek auth
interface AuthInfo {
  user: Omit<User, "passwordHash"> | null;
  isAuthenticated: boolean;
}

declare module "react-router" {
  interface AppLoadContext {
    serverInfo: {
      version: string;
      environment: string;
      timestamp: string;
    };
    isAuthenticated: () => Promise<boolean>;
    getCurrentUser: () => Promise<Omit<User, "passwordHash"> | null>;
    auth: AuthInfo;
    // Auth controllers for React Router - simplified method signatures untuk kemudahan penggunaan
    registrationControllers: {
      register: (userData: {
        email: string;
        password: string;
        firstName?: string;
        lastName?: string;
      }) => Promise<{
        success: boolean;
        user?: Omit<User, "passwordHash">;
        message?: string;
        requiresVerification?: boolean;
        errors?: Record<string, string[]>;
      }>;
      verifyEmail: (token: string) => Promise<{
        success: boolean;
        user?: Omit<User, "passwordHash">;
        message?: string;
        errors?: Record<string, string[]>;
      }>;
      resendVerification: (email: string) => Promise<{
        success: boolean;
        message: string;
        errors?: Record<string, string[]>;
      }>;
    };
    todoControllers: {
      getTodos: (options?: {
        status?: "all" | "active" | "completed";
        search?: string;
        sortBy?: "title" | "priority" | "dueDate" | "createdAt";
        sortDirection?: "asc" | "desc";
      }) => Promise<{
        success: boolean;
        todos?: Todo[];
        message?: string;
        errors?: Record<string, string[]>;
      }>;
      getTodo: (id: number) => Promise<{
        success: boolean;
        todo?: Todo;
        message?: string;
      }>;
      createTodo: (data: {
        title: string;
        description?: string;
        priority?: number;
        dueDate?: string;
      }) => Promise<{
        success: boolean;
        todo?: Todo;
        message?: string;
        errors?: Record<string, string[]>;
      }>;
      updateTodo: (
        id: number,
        data: {
          title?: string;
          description?: string;
          completed?: boolean;
          priority?: number;
          dueDate?: string | null;
        }
      ) => Promise<{
        success: boolean;
        todo?: Todo;
        message?: string;
        errors?: Record<string, string[]>;
      }>;
      toggleTodo: (id: number) => Promise<{
        success: boolean;
        todo?: Todo;
        message?: string;
      }>;
      deleteTodo: (id: number) => Promise<{
        success: boolean;
        message?: string;
      }>;
      clearCompletedTodos: () => Promise<{
        success: boolean;
        count?: number;
        message?: string;
      }>;
    };
  }
}

declare module "hono" {
  interface ContextVariableMap extends AppVariables {}
}

export default await createHonoServer({
  // Opsi untuk konfigurasi server
  defaultLogger: true,

  // Konfigurasi middleware dan API endpoints
  async configure(app) {
    // Setup semua middleware global
    setupMiddlewares(app);

    // Setup semua API routes
    setupApiRoutes(app);

    // Tambahkan global error handler
    app.onError((err, c) => {
      console.error("[Hono] Global error:", err);

      // Jika error adalah Response
      if (err instanceof Response) {
        return new Response(err.body, {
          status: err.status,
          headers: err.headers,
        });
      }

      // Default error response
      return c.json(
        {
          success: false,
          message:
            err instanceof Error ? err.message : "An unexpected error occurred",
        },
        500
      );
    });
  },

  getLoadContext(c, options) {
    const user = c.var.user;
    // Gunakan destructuring untuk menghilangkan passwordHash
    const safeUser = user ? (({ passwordHash, ...rest }) => rest)(user) : null;
    // Auth info object
    const authInfo: AuthInfo = {
      user: safeUser,
      isAuthenticated: !!user,
    };

    return {
      serverInfo: {
        version: "1.0.0",
        environment: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
      },
      isAuthenticated: async () => {
        return getCurrentUserController.isAuthenticated(c);
      },
      getCurrentUser: async () => {
        return getCurrentUserController.getUser(c);
      },
      // Auth info - objek non-async yang sudah dihitung
      auth: authInfo,

      // Auth Controllers
      registrationControllers: registrationContext,
      todoControllers: createTodoContext(c),
    };
  },
});
