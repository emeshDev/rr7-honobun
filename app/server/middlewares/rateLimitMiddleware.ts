// app/server/middlewares/rateLimitMiddleware.ts
import { createMiddleware } from "hono/factory";
import { Redis } from "@upstash/redis";
import type { Hono } from "hono";
import type { Context } from "hono";
import type { AppVariables } from "../types";

// Initialize Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL || "",
  token: process.env.UPSTASH_REDIS_TOKEN || "",
});

interface RateLimitOptions {
  // Maximum number of requests allowed within the window
  max: number;
  // Time window in seconds
  windowSec: number;
  // Custom message for when rate limit is exceeded
  message?: string;
  // By default we use IP, but can be customized to include user ID, etc.
  keyGenerator?: (c: Context) => string | Promise<string>;
  // Function to check if the request should be exempt from rate limiting
  isExempt?: (c: Context) => boolean | Promise<boolean>;
  // Headers to include in the response when rate limit info
  enableHeaders?: boolean;
}

const defaultOptions: RateLimitOptions = {
  max: 10,
  windowSec: 60,
  message: "Too many requests, please try again later.",
  enableHeaders: true,
};

/**
 * Get client IP address from various headers
 */
const getClientIp = (c: Context): string => {
  return (
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0].trim() ||
    c.req.header("X-Real-IP") ||
    "unknown-ip"
  );
};

/**
 * Create a rate limiter middleware for specific routes
 */
export const rateLimit = (options: Partial<RateLimitOptions> = {}) => {
  const config = { ...defaultOptions, ...options };

  return createMiddleware<{
    Variables: AppVariables;
  }>(async (c, next) => {
    // Check if the request should be exempt from rate limiting
    if (config.isExempt && (await config.isExempt(c))) {
      return next();
    }

    // Generate key for rate limiting
    const key = config.keyGenerator
      ? await config.keyGenerator(c)
      : `rate-limit:${getClientIp(c)}:${c.req.path}`;

    // Current timestamp in seconds
    const now = Math.floor(Date.now() / 1000);

    // Try/catch to handle Redis connection issues
    try {
      // Use Redis pipeline for better performance with multiple commands
      const pipeline = redis.pipeline();

      // Add current timestamp to sorted set
      pipeline.zadd(key, { score: now, member: `${now}-${Math.random()}` });

      // Remove entries outside the current window
      pipeline.zremrangebyscore(key, 0, now - config.windowSec);

      // Count entries in the current window
      pipeline.zcard(key);

      // Set expiry on the key
      pipeline.expire(key, config.windowSec);

      // Execute pipeline and get results
      const [, , count] = await pipeline.exec();

      // Calculate remaining requests
      const remaining = Math.max(0, config.max - (count as number));
      const resetTime = now + config.windowSec;

      // Add rate limit headers if enabled
      if (config.enableHeaders) {
        c.header("X-RateLimit-Limit", config.max.toString());
        c.header("X-RateLimit-Remaining", remaining.toString());
        c.header("X-RateLimit-Reset", resetTime.toString());
      }

      // Check if rate limit exceeded
      if ((count as number) > config.max) {
        // Add Retry-After header
        c.header("Retry-After", config.windowSec.toString());

        // Return rate limit exceeded response
        return c.json(
          {
            success: false,
            message: config.message,
            error: "rate_limit_exceeded",
          },
          429
        );
      }

      // Proceed with the request if not rate limited
      return next();
    } catch (error) {
      // Log error but allow request to proceed on Redis failure
      console.error("Rate limiter error:", error);
      return next();
    }
  });
};

/**
 * Auth rate limiter specially configured for login attempts
 * More strict limits to prevent brute force attacks
 */
export const authRateLimiter = rateLimit({
  max: 5, // 5 attempts
  windowSec: 60 * 15, // 15 minutes
  message: "Too many login attempts, please try again later.",
  keyGenerator: async (c) => {
    // Get client IP
    const ip = getClientIp(c);

    // Try to get email from request body for more precise limiting
    try {
      const body = await c.req.json();
      const email = body.email ? body.email.toLowerCase() : "unknown";

      // Rate limit by IP + email combination for more precise targeting
      return `rate-limit:auth:${ip}:${email}`;
    } catch (e) {
      // Fallback to IP-only if can't parse body
      return `rate-limit:auth:${ip}`;
    }
  },
  // Skip rate limiting in development mode
  isExempt: (c) =>
    process.env.NODE_ENV === "development" &&
    !process.env.ENABLE_DEV_RATE_LIMIT,
});

/**
 * Helper function to setup rate limiting for specific routes
 */
export const setupRateLimitMiddleware = (app: Hono) => {
  // Apply strict rate limiting to authentication endpoints
  app.use("/api/auth/login", authRateLimiter);

  // You can add more rate limits for other sensitive endpoints here
  // Examples:
  // app.use("/api/auth/register", authRateLimiter);
  // app.use("/api/auth/refresh", rateLimit({ max: 10, windowSec: 60 }));

  // Global rate limit for ALL API routes (less strict)
  // app.use("/api/*", rateLimit({ max: 100, windowSec: 60 }));
};
