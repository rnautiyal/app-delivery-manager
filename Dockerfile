# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend

ARG VITE_AZURE_CLIENT_ID
ARG VITE_AZURE_TENANT_ID
ARG VITE_AZURE_REDIRECT_URI
ARG VITE_API_URL=/api

ENV VITE_AZURE_CLIENT_ID=$VITE_AZURE_CLIENT_ID
ENV VITE_AZURE_TENANT_ID=$VITE_AZURE_TENANT_ID
ENV VITE_AZURE_REDIRECT_URI=$VITE_AZURE_REDIRECT_URI
ENV VITE_API_URL=$VITE_API_URL

COPY src/frontend/package.json src/frontend/package-lock.json* ./
RUN npm install
COPY src/frontend/ ./
RUN node node_modules/typescript/bin/tsc && node node_modules/vite/bin/vite.js build

# Stage 2: Build backend
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY src/backend/package.json src/backend/package-lock.json* ./
RUN npm install
COPY src/backend/ ./
COPY src/backend/data ./data
RUN node node_modules/typescript/bin/tsc

# Stage 3: Production
FROM node:20-alpine AS production
RUN apk add --no-cache openssl
WORKDIR /app

# Copy backend
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/package.json ./
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/data ./data

# Copy frontend build to serve as static files
COPY --from=frontend-build /app/frontend/dist ./public

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/index.js"]
