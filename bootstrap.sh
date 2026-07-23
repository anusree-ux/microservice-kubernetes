#!/bin/bash
# bootstrap.sh — build, load, and deploy microservice-app to Kind
set -e

CLUSTER="microservice-app"
NAMESPACE="microservice-app"

echo "1. Creating Kind cluster (if not already running)..."
echo "=========================================================="
if kind get clusters | grep -q "^${CLUSTER}$"; then
  CLUSTER_EXISTED=true
else
  kind create cluster --config k8s/kind-config.yaml
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

echo "4. Applying Kubernetes manifests..."
echo "=========================================================="
kubectl apply -k k8s/overlays/local

if [ "$CLUSTER_EXISTED" = true ]; then
  echo "5. Restarting deployments to pick up new images..."
  echo "========================================================="
  kubectl rollout restart deployment/user-service deployment/order-service deployment/frontend -n "$NAMESPACE"
else
  echo "5. Skipping restart — cluster was just created, fresh images already in use."
fi

echo "6. Waiting for deployments to be ready..."
echo "============================================================="
kubectl rollout status deployment/db -n "$NAMESPACE" --timeout=120s
kubectl rollout status deployment/user-service -n "$NAMESPACE" --timeout=120s
kubectl rollout status deployment/order-service -n "$NAMESPACE" --timeout=120s
kubectl rollout status deployment/frontend -n "$NAMESPACE" --timeout=120s

echo ""
echo "Done. App running at http://localhost:3000"
kubectl get pods -n "$NAMESPACE"
