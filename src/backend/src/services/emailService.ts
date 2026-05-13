import { logger } from "../config/logger";
import { AlertHistoryEntry } from "../models/types";

let nodemailer: any;
try {
  nodemailer = require("nodemailer");
} catch {
  // nodemailer not installed — email disabled
}

const smtpConfig = {
  host: process.env.SMTP_HOST || "",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
};

const fromAddress = process.env.SMTP_FROM || "appgw-manager@noreply.com";

export class EmailService {
  isConfigured(): boolean {
    return !!(smtpConfig.host && smtpConfig.auth.user && nodemailer);
  }

  async sendAlertEmail(to: string, alerts: AlertHistoryEntry[]): Promise<void> {
    if (!this.isConfigured()) {
      logger.warn("Email not configured, skipping alert email", { to, alertCount: alerts.length });
      return;
    }

    try {
      const transporter = nodemailer.createTransport(smtpConfig);

      const severityColors: Record<string, string> = {
        critical: "#d13438",
        high: "#d83b01",
        medium: "#c19c00",
        low: "#0078d4",
      };

      const alertRows = alerts
        .map(
          (a) =>
            `<tr>
              <td style="padding:8px;border-bottom:1px solid #edebe9">
                <span style="background:${severityColors[a.severity] || "#605e5c"};color:white;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;text-transform:uppercase">${a.severity}</span>
              </td>
              <td style="padding:8px;border-bottom:1px solid #edebe9;font-weight:600">${a.ruleName}</td>
              <td style="padding:8px;border-bottom:1px solid #edebe9">${a.gatewayName}</td>
              <td style="padding:8px;border-bottom:1px solid #edebe9">${a.message}</td>
            </tr>`
        )
        .join("");

      const html = `
        <div style="font-family:'Segoe UI',sans-serif;max-width:700px;margin:0 auto">
          <div style="background:linear-gradient(135deg,#0078d4,#106ebe);padding:20px 24px;border-radius:8px 8px 0 0">
            <h2 style="color:white;margin:0">AppGW Manager — Alert Notification</h2>
          </div>
          <div style="background:white;border:1px solid #edebe9;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px">
            <p style="color:#323130;font-size:14px">${alerts.length} alert(s) triggered:</p>
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="border-bottom:2px solid #edebe9;text-align:left">
                  <th style="padding:8px">Severity</th>
                  <th style="padding:8px">Rule</th>
                  <th style="padding:8px">Gateway</th>
                  <th style="padding:8px">Message</th>
                </tr>
              </thead>
              <tbody>${alertRows}</tbody>
            </table>
            <p style="color:#605e5c;font-size:12px;margin-top:20px">
              This is an automated alert from AppGW Manager.
              <a href="${process.env.APP_URL || "https://appgw-manager.ambitiousriver-d987d50a.eastus.azurecontainerapps.io"}/alerts">View in dashboard</a>
            </p>
          </div>
        </div>`;

      await transporter.sendMail({
        from: fromAddress,
        to,
        subject: `[AppGW Alert] ${alerts.length} alert(s) triggered — ${alerts.filter((a) => a.severity === "critical").length} critical`,
        html,
      });

      logger.info("Alert email sent", { to, alertCount: alerts.length });
    } catch (error) {
      logger.error("Failed to send alert email", {
        to,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
