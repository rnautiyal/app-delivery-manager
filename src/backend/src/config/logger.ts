import winston from "winston";
import Transport from "winston-transport";
import { config } from "./env";

// In-memory log buffer for the debug endpoint
const MAX_LOG_ENTRIES = 500;
const logBuffer: { timestamp: string; level: string; message: string; meta?: any }[] = [];

export function getLogBuffer() {
  return logBuffer;
}

class MemoryTransport extends Transport {
  log(info: any, callback: () => void) {
    const { timestamp, level, message, ...rest } = info;
    logBuffer.push({
      timestamp: timestamp || new Date().toISOString(),
      level,
      message,
      meta: rest,
    });
    if (logBuffer.length > MAX_LOG_ENTRIES) {
      logBuffer.splice(0, logBuffer.length - MAX_LOG_ENTRIES);
    }
    callback();
  }
}

export const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "appgw-manager" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new MemoryTransport(),
  ],
});
