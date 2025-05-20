import type { Context } from "hono";
import { RegistrationController } from "../controllers/authController";

// Adapter functions for controllers to make them more usable in React Router
const registrationContext = {
  register: async (userData: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) => {
    // Create a mock context with the user data
    const mockContext = {
      req: {
        json: async () => userData,
      },
    } as unknown as Context;

    return await RegistrationController.register(mockContext);
  },

  verifyEmail: async (token: string) => {
    // Create a mock context with the token
    const mockContext = {
      req: {
        query: (name: string) => (name === "token" ? token : null),
      },
    } as unknown as Context;

    return await RegistrationController.verifyEmail(mockContext);
  },

  resendVerification: async (email: string) => {
    // Create a mock context with the email
    const mockContext = {
      req: {
        json: async () => ({ email }),
      },
    } as unknown as Context;

    return await RegistrationController.resendVerification(mockContext);
  },
};

export default registrationContext;
