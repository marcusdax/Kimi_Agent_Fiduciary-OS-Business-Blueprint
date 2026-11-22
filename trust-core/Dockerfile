FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
ENV NODE_ENV=development
ENV HOST=0.0.0.0
ENV PORT=3002
ENV LEDGER_MODE=memory
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:3002/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "src/server.ts"]
