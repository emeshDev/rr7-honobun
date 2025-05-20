// app/server/middlewares/memoryRateLimitMiddleware.ts
import { createMiddleware } from "hono/factory";
import type { Hono } from "hono";
import type { Context } from "hono";
import type { AppVariables } from "../types";

// Interface untuk menyimpan data rate limit
interface RateLimitEntry {
  timestamps: number[]; // Array timestamp untuk sliding window
  lastUpdated: number; // Timestamp terakhir diperbarui
}

// Memory cache untuk menyimpan data rate limit
class MemoryRateLimit {
  private cache: Map<string, RateLimitEntry>;
  private interval: ReturnType<typeof setInterval>;

  constructor(private cleanupIntervalMs: number = 60000) {
    // Default cleanup setiap 1 menit
    this.cache = new Map();

    // Setup cleanup interval untuk menghapus entri yang expired
    this.interval = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);
  }

  /**
   * Cleanup untuk menghapus entri yang sudah tidak relevan
   */
  private cleanup() {
    const now = Date.now();
    const expiredKeys: string[] = [];

    // Identifikasi key yang sudah tidak aktif selama 1 jam
    this.cache.forEach((entry, key) => {
      if (now - entry.lastUpdated > 60 * 60 * 1000) {
        expiredKeys.push(key);
      }
    });

    // Hapus key yang expired
    expiredKeys.forEach((key) => {
      this.cache.delete(key);
    });

    console.log(
      `[MemoryRateLimit] Cleaned up ${expiredKeys.length} expired entries. Current cache size: ${this.cache.size}`
    );
  }

  /**
   * Hitung dan perbarui rate limit untuk key tertentu
   */
  public hit(
    key: string,
    windowMs: number
  ): { count: number; resetTime: number } {
    const now = Date.now();
    const windowStartTime = now - windowMs;

    // Ambil atau inisialisasi entri
    let entry = this.cache.get(key);
    if (!entry) {
      entry = { timestamps: [], lastUpdated: now };
      this.cache.set(key, entry);
    }

    // Filter timestamp yang masih dalam window
    entry.timestamps = entry.timestamps.filter(
      (time) => time > windowStartTime
    );

    // Tambahkan timestamp saat ini
    entry.timestamps.push(now);
    entry.lastUpdated = now;

    // Hitung kapan window akan reset (relative to earliest hit in the window)
    let resetTime: number;
    if (entry.timestamps.length > 0) {
      const oldestTimestamp = Math.min(...entry.timestamps);
      resetTime = oldestTimestamp + windowMs;
    } else {
      resetTime = now + windowMs;
    }

    return {
      count: entry.timestamps.length,
      resetTime,
    };
  }

  /**
   * Dapatkan jumlah hit saat ini tanpa menambahkan hit baru
   */
  public getHits(
    key: string,
    windowMs: number
  ): { count: number; resetTime: number } {
    const now = Date.now();
    const windowStartTime = now - windowMs;

    const entry = this.cache.get(key);
    if (!entry) {
      return { count: 0, resetTime: now + windowMs };
    }

    // Filter timestamp yang masih dalam window
    const validTimestamps = entry.timestamps.filter(
      (time) => time > windowStartTime
    );

    // Hitung kapan window akan reset
    let resetTime: number;
    if (validTimestamps.length > 0) {
      const oldestTimestamp = Math.min(...validTimestamps);
      resetTime = oldestTimestamp + windowMs;
    } else {
      resetTime = now + windowMs;
    }

    return {
      count: validTimestamps.length,
      resetTime,
    };
  }

  /**
   * Reset rate limit untuk key tertentu
   */
  public reset(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Stop interval cleanup
   */
  public stop(): void {
    clearInterval(this.interval);
  }
}

// Singleton instance untuk seluruh aplikasi
const limiter = new MemoryRateLimit();

// Pastikan cleanup interval dihentikan saat aplikasi shutdown
process.on("beforeExit", () => {
  limiter.stop();
});

interface RateLimitOptions {
  // Maximum number of requests allowed within the window
  max: number;
  // Time window in milliseconds
  windowMs: number;
  // Custom message for when rate limit is exceeded
  message?: string;
  // By default we use IP, but can be customized to include user ID, etc.
  keyGenerator?: (c: Context) => string | Promise<string>;
  // Function to check if the request should be exempt from rate limiting
  isExempt?: (c: Context) => boolean | Promise<boolean>;
  // Headers to include in the response
  enableHeaders?: boolean;
}

const defaultOptions: RateLimitOptions = {
  max: 10,
  windowMs: 60 * 1000, // 1 minute
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

    // Increment hit counter and get current count
    const { count, resetTime } = limiter.hit(key, config.windowMs);

    // Calculate remaining requests and reset time
    const remaining = Math.max(0, config.max - count);
    const resetTimeSec = Math.ceil(resetTime / 1000);

    // Add rate limit headers if enabled
    if (config.enableHeaders) {
      c.header("X-RateLimit-Limit", config.max.toString());
      c.header("X-RateLimit-Remaining", remaining.toString());
      c.header("X-RateLimit-Reset", resetTimeSec.toString());
    }

    // Check if rate limit exceeded
    if (count > config.max) {
      // Add Retry-After header
      const retryAfterSecs = Math.ceil((resetTime - Date.now()) / 1000);
      c.header("Retry-After", retryAfterSecs.toString());

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
  });
};

/**
 * Auth rate limiter specially configured for login attempts
 * More strict limits to prevent brute force attacks
 */
export const authRateLimiter = rateLimit({
  max: 5, // 5 attempts
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: "Terlalu banyak percobaan login, silakan coba lagi nanti.",
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
export const setupMemoryRateLimitMiddleware = (app: Hono) => {
  // Apply strict rate limiting to authentication endpoints
  app.use("/api/auth/login", authRateLimiter);
  app.use("/api/auth/register", authRateLimiter);
  app.use("/api/auth/verify-email", authRateLimiter);
  app.use("/api/auth/logout", authRateLimiter);

  // You can add more rate limits for other sensitive endpoints here
  // Examples:
  // app.use("/api/auth/register", authRateLimiter);
  // app.use("/api/auth/refresh", rateLimit({ max: 10, windowMs: 60 * 1000 }));
};
