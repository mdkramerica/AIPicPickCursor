/**
 * Centralized logging utility
 * Replaces console.log with structured logging
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogData {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: any;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === "development";

  private log(level: LogLevel, message: string, meta?: Record<string, any>) {
    const logData: LogData = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    };

    // In production, use JSON format for structured logging
    if (!this.isDevelopment) {
      console.log(JSON.stringify(logData));
      return;
    }

    // In development, use readable format
    const emoji = {
      debug: "🔍",
      info: "ℹ️",
      warn: "⚠️",
      error: "❌",
    }[level];

    console.log(`${emoji} [${level.toUpperCase()}] ${message}`, meta || "");
  }

  debug(message: string, meta?: Record<string, any>) {
    if (this.isDevelopment) {
      this.log("debug", message, meta);
    }
  }

  info(message: string, meta?: Record<string, any>) {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, any>) {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: Record<string, any>) {
    this.log("error", message, meta);
  }
}

export const logger = new Logger();
