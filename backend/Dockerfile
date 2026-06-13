# Built from the repository root so npm can use the shared workspace lockfile.
FROM node:24-alpine AS build
WORKDIR /app
ENV HUSKY=0

# Copy workspace manifests first so dependency installation is cached separately
# from source changes.
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY canton-connect-kit/package.json canton-connect-kit/
RUN npm ci --ignore-scripts

# Build the backend and keep the mock bootstrap fixture beside the compiled
# config module, which resolves the fixture relative to dist at runtime.
COPY backend/tsconfig.json backend/
COPY backend/src backend/src
RUN npm run build --workspace @canton-dappbooster/dark-pool-service
RUN cp backend/src/mock-bootstrap.json backend/dist/mock-bootstrap.json

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV HUSKY=0
ENV DARK_POOL_MOCK=1
ENV DARK_POOL_SERVICE_PORT=3020
ENV CORS_ORIGINS=*
ENV MATCH_INTERVAL_MS=300000

# Install only runtime dependencies for the backend workspace.
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY canton-connect-kit/package.json canton-connect-kit/
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/backend/dist backend/dist
WORKDIR /app/backend
EXPOSE 3020
CMD ["npm", "run", "start"]
