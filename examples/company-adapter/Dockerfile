# Source-overlay integration: an independently maintained converter is compiled at build time.
# Runtime image is Nginx only; Node, git, Yarn and Chromium are NOT shipped.
FROM node:22.16.0-bookworm AS builder
RUN apt-get update \
    && apt-get install -y --no-install-recommends git chromium ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /project
COPY . .

# Only these reviewed, downstream-controlled files customize the upstream app.
COPY examples/company-adapter/converter.ts src/extensions/company-results.ts
COPY examples/company-adapter/converters.ts src/config/converters.ts

RUN npm ci && npm run verify && npm run build:upstream
RUN CHROME_BIN=/usr/bin/chromium node scripts/smoke-external-adapter.mjs
RUN cp examples/company-adapter/example.company.json dist/demo/company-sample.json

FROM nginx:alpine AS runtime
COPY deployment/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /project/dist/ /usr/share/nginx/html/
EXPOSE 80
