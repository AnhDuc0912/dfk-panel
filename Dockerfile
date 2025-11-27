FROM node:18-alpine

WORKDIR /app

# Install dependencies (use production install for smaller image)
COPY package*.json ./
# Use npm ci with the newer flag to omit dev deps (npm no longer accepts --only=production)
# --no-audit and --no-fund reduce noise during image builds
RUN npm ci --omit=dev --no-audit --no-fund

# Copy app
COPY . .

# Use the built-in non-root node user where possible
USER node

EXPOSE 3000
CMD ["node", "server.js"]
