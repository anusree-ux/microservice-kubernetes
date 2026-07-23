# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY index.html ./

# ---- Final stage ----
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/index.html /usr/share/nginx/html/index.html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
