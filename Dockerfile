FROM node:18-alpine

WORKDIR /app

# Install dependencies (use production install for smaller image)
COPY package*.json ./

# Copy app
COPY . .
RUN npm install
# Use the built-in non-root node user where possible
USER node

EXPOSE 3333
CMD ["node", "server.js"]
