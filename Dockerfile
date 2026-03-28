FROM node:22-alpine

RUN apk add --no-cache python3 make g++ su-exec

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

RUN addgroup -S planpush && adduser -S -G planpush planpush && \
    mkdir -p /app/data && chown -R planpush:planpush /app && \
    chmod +x /app/entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
