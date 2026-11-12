# App React em modo de desenvolvimento (Vite com recarga automática).
# Em produção quem faz o build é a Vercel, com o mesmo Node 26 (engines do package.json).
FROM node:26.13.1-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
