#!/bin/bash

set -e

CLUSTER="microservice-app"

echo "1. Creating Kind cluster (if not already running)..."
echo "=========================================================="
if kind get clusters | grep -q "^${CLUSTER}$"; then
  CLUSTER_EXISTED=true
else
  kind create cluster --config kind-config.yaml
  CLUSTER_EXISTED=false
fi

echo "2. Building images..."
echo "==========================================================="
docker build -t user-service:local ./src/user-service
docker build -t order-service:local ./src/order-service
docker build -t frontend:local ./src/frontend

echo "3. Loading images into Kind..."
echo "========================================================"
kind load docker-image user-service:local --name "$CLUSTER"
kind load docker-image order-service:local --name "$CLUSTER"
kind load docker-image frontend:local --name "$CLUSTER"

echo "=== 4. Deploying ingress-nginx controller ==="
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
echo "Waiting for ingress-nginx controller to be ready..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

echo "=== 5. Applying base Kubernetes manifests ==="
kubectl apply -k k8s/base

echo "6. Waiting for deployments to be ready..."
echo "============================================================="
kubectl rollout status deployment/postgres
kubectl rollout status deployment/user-service
kubectl rollout status deployment/order-service
kubectl rollout status deployment/frontend

echo "=== 7. Initializing Database Schema ==="
echo "Applying database migrations from ./src/db/init.sql..."
kubectl exec -i deployment/postgres -- psql -U appuser -d appdb < ./src/db/init.sql

echo ""
echo "Done. App running in 'http://localhost'"
kubectl get pods -n
