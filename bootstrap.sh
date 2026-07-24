#!/bin/bash
set -e
CLUSTER="microservice-app"

echo "1. Creating Kind cluster (if not already running)..."
echo "=========================================================="
if kind get clusters | grep -q "^${CLUSTER}$"; then
  echo "Cluster already exists, reusing it."
else
  kind create cluster --config kind-config.yaml
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

echo "=== 5b. Pointing deployments at the local images just built ==="
# Without this, the deployments still pull anusree15/*:6 from Docker Hub
# and ignore the images we just built and loaded in steps 2-3.
kubectl set image deployment/user-service  user-service=user-service:local
kubectl set image deployment/order-service order-service=order-service:local
kubectl set image deployment/frontend      frontend=frontend:local
kubectl patch deployment user-service  -p '{"spec":{"template":{"spec":{"containers":[{"name":"user-service","imagePullPolicy":"Never"}]}}}}'
kubectl patch deployment order-service -p '{"spec":{"template":{"spec":{"containers":[{"name":"order-service","imagePullPolicy":"Never"}]}}}}'
kubectl patch deployment frontend      -p '{"spec":{"template":{"spec":{"containers":[{"name":"frontend","imagePullPolicy":"Never"}]}}}}'

echo "6. Waiting for deployments to be ready..."
echo "============================================================="
kubectl rollout status deployment/postgres
kubectl rollout status deployment/user-service
kubectl rollout status deployment/order-service
kubectl rollout status deployment/frontend

echo "=== 7. Initializing Database Schema ==="
echo "Waiting for postgres to accept connections..."
until kubectl exec deployment/postgres -- pg_isready -U appuser -d appdb >/dev/null 2>&1; do
  sleep 2
done
echo "Applying database migrations from ./src/db/init.sql..."
kubectl exec -i deployment/postgres -- psql -U appuser -d appdb < ./src/db/init.sql

echo "=== 8. Installing monitoring stack (Prometheus, Grafana, Loki, Promtail) ==="
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null 2>&1 || true
helm repo add grafana https://grafana.github.io/helm-charts >/dev/null 2>&1 || true
helm repo update >/dev/null

kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --values helm/prometheus/values.yaml \
  --wait --timeout 5m

helm upgrade --install loki grafana/loki-stack \
  --namespace monitoring \
  --values helm/loki/values.yaml \
  --wait --timeout 5m

echo ""
echo "Done. App running at http://localhost"
kubectl get pods
echo ""
echo "Monitoring stack (namespace: monitoring):"
kubectl get pods -n monitoring
echo ""
echo "Grafana:    kubectl port-forward -n monitoring svc/prometheus-grafana 3001:80"
echo "            then open http://localhost:3001 (user: admin, pass: admin)"
echo "Prometheus: kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090"
