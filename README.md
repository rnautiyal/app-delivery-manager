# Application Delivery Manager

AI-powered platform for centralized management and operations of Azure Application Gateways, Azure Firewalls, and cross-cloud app delivery services.

**Original Developer:** Rajesh Nautiyal ([@rnautiyal](https://github.com/rnautiyal))

## What Is It

A Container App that provides:

- **Command Center** — React dashboard for fleet-wide visibility across subscriptions, regions, and clouds
- **AppDelivery Genie** — AI chat assistant (Claude LLM) with 72 operational functions for natural language infrastructure management
- **Private Traffic Manager** — Health-based DNS failover for Azure Private DNS Zones (fills a gap Azure doesn't cover)
- **Firewall Manager** — Centralized view of Azure Firewalls and Firewall Policies
- **Multi-Cloud** — Azure AppGW + AWS ALB + GCP LB from one platform

## Architecture

```
User (Browser) → React Frontend → Express Backend → Claude LLM (decides) → Azure SDK (executes) → Azure ARM API
```

- **Frontend:** React 18 + TypeScript + Fluent UI + Vite
- **Backend:** Express + TypeScript + Azure SDK
- **AI:** Claude Sonnet 4 via @anthropic-ai/sdk (tool-use pattern)
- **Auth:** Azure AD (MSAL) → JWT
- **Deploy:** Azure Container Apps + ACR

## Features

| Category | Capabilities |
|----------|-------------|
| Gateway Operations | List, create, start, stop, delete, update gateways |
| Networking | VNet, Subnet, Public IP, NSG, DDoS, VNet Encryption |
| WAF & Security | WAF policies, custom rules, OWASP compliance, security scan |
| SSL/TLS | Certificate generation, HTTPS listeners, Key Vault integration |
| Monitoring | Access logs, WAF logs, KQL queries, 502 analysis, latency |
| Backup & DR | Full config backup, restore, compare with live |
| Templates | Save, apply, deploy as new, export ARM/Bicep/Terraform |
| Drift Detection | Save baseline, check drift, periodic monitoring |
| Private Traffic Manager | Health probes, auto-failover, Active/Active & Active/Standby |
| Firewall Manager | List firewalls, policies, rule collection groups |
| Multi-Cloud | AWS ALB, GCP LB integration |
| Alerting | Custom rules, evaluation, history |

## Getting Started

### Prerequisites

- Node.js 20+
- Azure subscription
- Anthropic API key (for AI chat)
- Azure AD app registration

### Setup

1. Clone the repo
```bash
git clone https://github.com/rnautiyal/AppDeliveryManager.git
cd AppDeliveryManager
```

2. Create `.env` file from example
```bash
cp .env.example .env
# Fill in your values
```

3. Install dependencies
```bash
cd src/backend && npm install
cd ../frontend && npm install
```

4. Run locally
```bash
# Backend
cd src/backend && npm run dev

# Frontend (separate terminal)
cd src/frontend && npm run dev
```

### Deploy to Azure

```bash
# Build & push to ACR
az acr build --registry <your-acr> --image app-delivery-manager:latest .

# Deploy to Container Apps
az containerapp update --name <your-app> --resource-group <your-rg> --image <your-acr>.azurecr.io/app-delivery-manager:latest
```

## Environment Variables

See [.env.example](.env.example) for required configuration.

## Project Structure

```
src/
├── backend/
│   ├── src/
│   │   ├── services/     # 32 services (Azure SDK, AI, DNS, etc.)
│   │   ├── routes/        # 24 API routes
│   │   ├── middleware/    # Auth, error handling
│   │   └── config/       # Azure, env, logger
│   └── data/             # JSON storage files
├── frontend/
│   ├── src/
│   │   ├── pages/        # 24 application pages
│   │   ├── components/   # 20+ UI components
│   │   ├── services/     # API client
│   │   └── hooks/        # React hooks
infra/
└── bicep/                # Infrastructure as Code
```

## Contributing

Contributions are welcome! Please:

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

[MIT](LICENSE)

## Author

**Rajesh Nautiyal** — Product Manager, Azure Application Gateway, Microsoft
