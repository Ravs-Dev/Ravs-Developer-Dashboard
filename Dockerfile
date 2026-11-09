FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/client ./client
COPY --from=build /app/index.html ./index.html
RUN mkdir -p /var/data/sessions && chown -R node:node /app /var/data
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
