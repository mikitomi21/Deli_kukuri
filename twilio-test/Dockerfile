FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY call-leki.js gateway.js ./
EXPOSE 3000
CMD ["node", "gateway.js"]
