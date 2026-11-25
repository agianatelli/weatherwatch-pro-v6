FROM node:24-slim

WORKDIR /app

# Install production dependencies inside the image (zero host NODE_PATH dependency)
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source, static assets, and seed data
COPY . .

# Cloud Run injects PORT=8080 at runtime; 8080 is the explicit default
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
