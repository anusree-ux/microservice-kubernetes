# GitOps Deployment Platform

A production-style Kubernetes platform demonstrating end-to-end DevOps practices: containerized microservices, automated CI/CD, GitOps-based deployment, observability, and security hardening — built from the ground up on a local Kind cluster.

**Application layer:** a simple microservices app (static frontend, two Node/Express services, PostgreSQL) — intentionally minimal so the majority of the engineering effort is visible in the platform layer below it.

**Platform layer:** Docker, Kubernetes (Kind), Kustomize, Jenkins, ArgoCD, Prometheus, Grafana, Loki/Promtail.

## Architecture

```
                                   ┌─────────────┐
                                   │   Browser   │
                                   └──────┬──────┘
                                          │
                                   ┌──────▼──────┐
                                   │ NGINX Ingress│
                                   └──────┬──────┘
                     ┌────────────────────┼────────────────────┐
                     │                    │                    │
              ┌──────▼──────┐     ┌──────▼──────┐      ┌──────▼──────┐
              │  frontend   │     │ user-service │      │order-service│
              │  (nginx)    │     │  (Express)   │◄─────┤  (Express)  │
              └─────────────┘     └──────┬───────┘      └──────┬──────┘
                                          │                     │
                                          └─────────┬───────────┘
                                                     │
                                              ┌──────▼──────┐
                                              │  PostgreSQL │
                                              └─────────────┘
```

**CI/CD flow:**

```
Git push → Jenkins (test → build → Trivy scan → push to Docker Hub →
update image tag in manifests → push to Git) → ArgoCD (auto-detect →
sync) → Kubernetes rolling update
```

## Services

| Service | Responsibility | Tech |
|---|---|---|
| frontend | Static dashboard UI | Nginx + vanilla JS |
| user-service | Users CRUD | Node/Express + PostgreSQL |
| order-service | Orders CRUD, calls user-service for enrichment | Node/Express + PostgreSQL |
| postgres | Shared data store | PostgreSQL 16 |

**Known simplification:** both services share one PostgreSQL instance/database rather than a database-per-service. Chosen for local-dev simplicity; in production this coupling would be removed to preserve service independence.

## Platform Components

| Layer | Tool | Purpose |
|---|---|---|
| Containerization | Docker (multi-stage builds) | Minimal, reproducible images |
| Local orchestration | Kind | Kubernetes cluster for local development |
| Traffic routing | NGINX Ingress Controller | Path-based routing to services |
| Manifest management | Kustomize (base + dev/prod overlays) | Environment-specific config without duplication |
| Network security | Kubernetes NetworkPolicies | Default-deny + explicit allow rules |
| CI | Jenkins | Test, build, scan, push |
| Image scanning | Trivy | Vulnerability scanning in CI |
| CD | ArgoCD | GitOps — Git as single source of truth |
| Metrics | Prometheus + Grafana (kube-prometheus-stack) | Resource usage, autoscaling triggers |
| Autoscaling | Horizontal Pod Autoscaler | CPU-based scaling |
| Logging | Loki + Promtail | Centralized log aggregation |

## Repository structure

```
microservice-app/
├── src/
│   ├── frontend/          # nginx + static HTML
│   ├── user-service/      # Node.js API
│   ├── order-service/     # Node.js API
│   └── db/init.sql        # schema + seed data
├── k8s/
│   ├── base/               # Deployments, Services, Ingress, NetworkPolicies, HPAs
│   └── overlays/
│       ├── dev/             # synced by ArgoCD
│       └── prod/            # patches replica count to 3
├── helm/
│   ├── prometheus/values.yaml   # kube-prometheus-stack overrides
│   └── loki/values.yaml         # loki-stack overrides
├── docker-compose.yml      # local dev without Kubernetes
├── kind-config.yaml        # kind cluster def, maps host ports 80/443
├── bootstrap.sh            # one-shot: kind cluster + app + monitoring
├── deploy.sh               # docker-compose start/stop/restart/status
├── Jenkinsfile              # CI/CD pipeline
├── .env.example
└── .gitignore
```

## Setup

### Prerequisites
- Docker
- [kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation)
- kubectl
- Helm 3
- A Docker Hub account (for image storage)

### Option A — Docker Compose (no Kubernetes)

```bash
cp .env.example .env   # edit values if needed
./deploy.sh start
```

- Frontend: `http://localhost:${FRONTEND_PORT}` (default 3000)
- User API: `http://localhost:${USER_SERVICE_PORT}`
- Order API: `http://localhost:${ORDER_SERVICE_PORT}`

Other commands: `./deploy.sh stop`, `./deploy.sh restart`, `./deploy.sh status`.

### Option B — Kubernetes (kind), fully automated

```bash
./bootstrap.sh
```

One script takes you from nothing to a running, observed cluster:
1. Creates a kind cluster from `kind-config.yaml` (reuses it if one already exists)
2. Builds `user-service`, `order-service`, and `frontend` images locally and loads them into the cluster
3. Installs the ingress-nginx controller
4. Applies `k8s/base` and points the deployments at the locally built images (`imagePullPolicy: Never`, so it never reaches for Docker Hub)
5. Waits for every deployment to roll out
6. Seeds the database via `src/db/init.sql`, waiting for Postgres to actually accept connections first
7. Installs the monitoring stack (Prometheus, Grafana, Loki, Promtail) via Helm, using `helm/prometheus/values.yaml` and `helm/loki/values.yaml`

It's safe to re-run: every step uses `apply` / `kubectl set image` / `helm upgrade --install`, so a re-run after a code change rebuilds and redeploys without a full teardown.

Once it finishes:
- App: `http://localhost/`
- Grafana: `kubectl port-forward -n monitoring svc/prometheus-grafana 3001:80` → `http://localhost:3001` (`admin` / `admin`)
- Prometheus: `kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090`

Tear down with `kind delete cluster --name microservice-app`.

> **Note:** `bootstrap.sh` applies `k8s/base` directly and is meant for a throwaway local kind cluster. On any cluster where ArgoCD is also running and watching `k8s/overlays/dev`, don't run `bootstrap.sh` — let ArgoCD own deployment there instead, to avoid the two fighting over the same resources (see GitOps section below).

## CI/CD Pipeline

**Jenkins** (`Jenkinsfile`): on every push to `main` —
1. Checkout
2. Run tests (`user-service`, `order-service` in parallel, via `node:20-alpine` containers)
3. Build multi-stage Docker images (parallel: frontend, user-service, order-service)
4. Trivy vulnerability scan (HIGH/CRITICAL)
5. Push to Docker Hub (build-numbered tag + `latest`)
6. Auto-update image tags in `k8s/base/*.yaml` and push back to Git

**ArgoCD:** watches the same repo (`k8s/overlays/dev`), auto-syncs on any change, self-heals drift.

This closes the full loop: a code push alone triggers a live, verified rolling update in the cluster — no manual `kubectl apply` at any point.

**Accessing ArgoCD:**
```bash
kubectl port-forward svc/argocd-server -n argocd 8081:443
# ArgoCD UI: localhost:8081
```

The ArgoCD `Application` is currently configured manually via the UI/CLI and is **not yet defined as a manifest in this repo** — so it isn't reproducible from a fresh clone. Codifying it (e.g. `argocd/application.yaml`) is on the roadmap.

## Monitoring configuration (Helm)

Prometheus/Grafana and Loki/Promtail are installed via Helm with values files checked into the repo rather than one-off `--set` flags, so the config is readable and versioned like the rest of the infra:

- **`helm/prometheus/values.yaml`** — installs `kube-prometheus-stack`. Sets a fixed Grafana admin password for local dev convenience, disables Alertmanager (no routing configured yet), and trims Prometheus retention to 3 days.
- **`helm/loki/values.yaml`** — installs `loki-stack`/`grafana/loki` + `grafana/promtail`. Disables its bundled Grafana (kube-prometheus-stack's Grafana is used instead, to avoid running two separate instances) and enables Promtail for log shipping.

Applied automatically by `bootstrap.sh`, or manually:
```bash
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
  -n monitoring --values helm/prometheus/values.yaml --wait --timeout 5m
helm upgrade --install loki grafana/loki-stack \
  -n monitoring --values helm/loki/values.yaml --wait --timeout 5m
```

## Metrics

| Metric | Result |
|---|---|
| Docker image size (multi-stage vs single-stage) | Modest reduction; primary benefit was separating build/runtime dependencies, not size |
| Manual `kubectl apply` deploy time | ~1.1s to submit; pods fully Ready in ~10-15s on a cold cluster |
| CI pipeline (Jenkins) | Parallel test + build stages; full pipeline (test→build→scan→push→manifest update) completes in **[TODO: fill in from Jenkins build history]** |
| Full commit-to-cluster time | Code push → Jenkins → Docker Hub → manifest commit → ArgoCD sync → live pods: observed within single-digit minutes |
| Resource right-sizing | See table below |
| HPA scale-up | 1 → 5 replicas (max) within ~40s of load starting; CPU 5% → 750% of 50% target |
| HPA scale-down | CPU returned to baseline ~45s after load stopped; replica scale-down follows the default 5-min stabilization window |
| Load test | 5000 requests, concurrency 20, 241 req/sec, 0 failed requests |
| NetworkPolicy enforcement | frontend → postgres connection: open before policy, times out after (verified live) |

### Resource Right-Sizing (before/after)

**Before:** no resource requests/limits defined on any Deployment (QoS Class: BestEffort).

Observed usage (via `kubectl top pods` + metrics-server, idle/light load):

| Pod | CPU | Memory |
|---|---|---|
| frontend | 0m | 14Mi |
| order-service | 1m | 38Mi |
| postgres | 1m | 37Mi |
| user-service | 1m | 45Mi |

**After:** explicit requests set at ~1.5-2x observed baseline, limits at 5-10x requests for burst headroom (QoS Class: Burstable):

| Service | Requests (CPU/Mem) | Limits (CPU/Mem) |
|---|---|---|
| frontend | 10m / 32Mi | 100m / 64Mi |
| user-service | 20m / 64Mi | 150m / 128Mi |
| order-service | 20m / 64Mi | 150m / 128Mi |
| postgres | 50m / 128Mi | 300m / 256Mi |

### Network Policy Verification (live before/after)

```
# Without NetworkPolicy
$ kubectl exec -it deploy/frontend -- sh -c "nc -zv -w 3 postgres 5432"
postgres (10.96.153.16:5432) open

# With default-deny + explicit allow rules
$ kubectl exec -it deploy/frontend -- sh -c "nc -zv -w 3 postgres 5432"
nc: postgres (10.96.153.16:5432): Operation timed out
```

frontend has no legitimate reason to reach postgres directly — only user-service and order-service do. This is now enforced at the network layer, not just by convention.

### HPA Load Test

- Load: `ab -n 5000 -c 20 http://localhost/api/users`
- Result: 0 failed requests, 241 req/sec sustained
- Scaling: user-service CPU spiked 5% → 750% of the 50% target; HPA scaled 1 → 5 replicas (max) within ~40 seconds; all new pods Ready within ~13 seconds of being scheduled
- Recovery: CPU returned to baseline within ~45s of load stopping; replica count returns to 1 after the default 5-minute stabilization window
- Two pods briefly showed `Error` status during rapid scale churn — transient, self-resolved, and did not affect the 0% request failure rate observed via `ab`

### Centralized Logging (Before/After)

**Before:** debugging required `kubectl logs <pod-name>` per pod individually — no cross-service search.
**After:** single Grafana Explore query (`{namespace="default"}`) searches logs across all pods simultaneously, with live tailing and time-range filtering.

## Notable Issues & Fixes

A record of real problems hit and resolved during this build — kept because the debugging process is as representative of the skill set as the final working state.

- **Ingress rewrite-target regex** initially dropped the leading `/` on ID-based paths (`/api/users/2` → `/users2` instead of `/users/2`), causing DELETE and GET-by-id requests to 404. Fixed by including both regex capture groups (`$1$2`) instead of just `$2`.
- **Kustomize `commonLabels` on Deployment selectors:** `commonLabels` (deprecated) applied the environment label to `spec.selector.matchLabels`, which is immutable on existing Deployments — causing `field is immutable` errors on apply. Fixed by using the newer `labels` field with `includeSelectors: false`.
- **Docker-outside-of-Docker path resolution:** Jenkins runs as a container itself, using a bind-mounted home directory. `docker run -v` mounts are resolved by the host Docker daemon (needs host-real paths), while `docker build` context paths and git operations are resolved by the Jenkins container's own filesystem (needs Jenkins' internal `$WORKSPACE` path). Conflating the two caused `ENOENT`/path-not-found errors until each command used the correct path source.
- **Docker socket permission denied inside Jenkins:** fixed by adding the `jenkins` user to a group matching the host Docker socket's GID.
- **ArgoCD stale sync state:** `status.sync.revision` remained pinned to an older commit despite newer commits on `main`, showing `Synced` while running outdated manifests. Resolved with a forced hard-refresh (`argocd.argoproj.io/refresh: hard` annotation); root cause mitigated long-term by reducing `timeout.reconciliation` from the default poll interval to 30s.
- **NGINX Ingress admission webhook conflicts:** duplicate Ingress objects across namespaces (`default` vs `dev`, left over from pre-ArgoCD manual deploys) blocked new Ingress creation since host+path uniqueness is validated cluster-wide, not per-namespace.
- **Loki chart migration:** initial install via the deprecated `grafana/loki-stack` chart produced Loki 2.6.1, incompatible with the current Grafana's health-check query format (`parse error... unexpected IDENTIFIER`). Migrated to the current `grafana/loki` + `grafana/promtail` charts, which required explicit `deploymentMode=SingleBinary`, a test schema (`loki.useTestSchema=true`, appropriate for local dev), and correcting the datasource endpoint to the chart's `loki-gateway` routing service.

## Design Decisions

- **Kustomize over Helm for the application itself.** Helm is used only for third-party infrastructure (ingress-nginx, kube-prometheus-stack, loki, promtail) where community-maintained charts are the practical standard. The application's own manifests are plain YAML + Kustomize overlays — simpler to read, own, and explain at this project's scale, and a legitimate real-world pattern (raw manifests for owned services, Helm for third-party infra).
- **Single-repo GitOps.** App code and Kubernetes manifests live in one repository rather than split into app-repo/manifests-repo. Chosen for simplicity at solo-project scale; a team/production setting would likely split them to limit what CD tooling needs access to.
- **Jenkins (self-hosted) for CI, not GitHub Actions.** Demonstrates operating CI infrastructure directly (install, plugins, credentials, Docker-outside-of-Docker configuration) rather than consuming a fully managed service — a distinct, valuable skill from managed CI.

## Acknowledgments

Application services built from scratch for this project. All Kubernetes infrastructure, CI/CD pipeline (Jenkins), GitOps deployment (ArgoCD), monitoring (Prometheus/Grafana), and logging (Loki/Promtail) were independently designed and implemented.
