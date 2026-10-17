FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm build
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY --from=build /app ./
EXPOSE 3000
CMD ["pnpm", "start", "-p", "3000"]
