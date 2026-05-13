import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { logger } from "../config/logger";

export interface AppUser {
  oid: string;
  name: string;
  email: string;
  roles: string[];
}

export interface AuthenticatedRequest extends Request {
  appUser?: AppUser;
}

const DEMO_TOKEN = process.env.DEMO_TOKEN || "demoview";

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  // Demo mode: allow access with demo token
  if (token === DEMO_TOKEN) {
    (req as AuthenticatedRequest).appUser = {
      oid: "demo-user",
      name: "Demo Viewer",
      email: "demo@appgw-manager.com",
      roles: ["reader"],
    };
    next();
    return;
  }

  if (!token) {
    res.status(401).json({ success: false, error: "Access token required" });
    return;
  }

  try {
    const decoded = jwt.decode(token) as any;

    if (!decoded) {
      res.status(401).json({ success: false, error: "Invalid token" });
      return;
    }

    if (decoded.iss !== config.auth.issuer && decoded.iss !== config.auth.issuerV1) {
      logger.warn("Token issuer mismatch", { expected: [config.auth.issuer, config.auth.issuerV1], actual: decoded.iss });
    }

    (req as AuthenticatedRequest).appUser = {
      oid: decoded.oid || decoded.sub,
      name: decoded.name || "",
      email: decoded.preferred_username || decoded.email || "",
      roles: decoded.roles || [],
    };

    next();
  } catch (error) {
    logger.error("Authentication failed", { error });
    res.status(403).json({ success: false, error: "Invalid or expired token" });
    return;
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.appUser) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const hasRole = roles.some((role) => authReq.appUser!.roles.includes(role));
    if (!hasRole) {
      res.status(403).json({ success: false, error: "Insufficient permissions" });
      return;
    }

    next();
  };
}
