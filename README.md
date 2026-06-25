# Kubernetes Workshop — Multi-Tier Product Catalog

## Repository & Image Links

| Item | URL |
|------|-----|
| **GitHub Repo** | `https://github.com/ankit-sf/nagp-kubernetes-2026` 
| **Docker Hub Image** | `https://hub.docker.com/r/dreo1/product-api` 
| **Live API URL** | `http://api.34.131.184.223.nip.io/api/v1/products` 
     (live api may not be available, since i will be deleting to save money)
---

## Step-by-Step Deployment on Google Cloud (GKE)

### Prerequisites

Install these tools on your local machine:

```bash
# 1. Install Google Cloud SDK
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud --version

# 2. Install kubectl
gcloud components install kubectl

# 3. Install Docker Desktop (or Docker Engine on Linux)
docker --version

# 4. Verify all tools
gcloud --version && kubectl version --client && docker --version
```

---

### Step 1 — Set Up Google Cloud Project

```bash
# Log in to Google Cloud
gcloud auth login

# Create a new project (or use existing)
gcloud projects create kubernetes-nagp-ankit-2026 --name="K8s Workshop"

# Set it as active project
gcloud config set project kubernetes-nagp-ankit-2026

# Enable required APIs
gcloud services enable \
  container.googleapis.com \
  compute.googleapis.com \
  artifactregistry.googleapis.com

# Set default region/zone
gcloud config set compute/region asia-south2
gcloud config set compute/zone   asia-south2-a
```

---

### Step 2 — Create the GKE Cluster

```bash
# Create a cost-optimized Autopilot cluster (GKE manages nodes for you)
gcloud container clusters create-auto workshop-cluster \
  --region asia-south2 \
  --project kubernetes-nagp-ankit-2026

# OR create a Standard cluster with 3 nodes (more control)
# gcloud container clusters create workshop-cluster \
#   --num-nodes=3 \
#   --machine-type=e2-standard-2 \
#   --region=asia-south2 \
#   --enable-autoscaling \
#   --min-nodes=2 \
#   --max-nodes=5 \
#   --enable-ip-alias \
#   --project kubernetes-nagp-ankit-2026

# Fetch credentials for kubectl
gcloud container clusters get-credentials workshop-cluster \
  --region asia-south2 \
  --project kubernetes-nagp-ankit-2026

# Verify kubectl is connected
kubectl cluster-info
kubectl get nodes
```

---

### Step 3 — Install NGINX Ingress Controller

```bash
# Add the Helm repo
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# Install NGINX ingress controller (creates a GCP LoadBalancer)
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.replicaCount=2

# Wait for external IP to be assigned (takes ~2 minutes)
kubectl get service ingress-nginx-controller \
  --namespace ingress-nginx \
  --watch
# 34.131.184.223

# Once EXTERNAL-IP is assigned, save it:
export INGRESS_IP=$(kubectl get service ingress-nginx-controller \
  --namespace ingress-nginx \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Ingress IP: $INGRESS_IP"
```

---

### Step 4 — Build and Push the Docker Image

```bash
# Log in to Docker Hub
docker login

# Build the image (from the app/ directory)
cd app/
docker build -t dreo1/product-api:1.0.0 .

# Push to Docker Hub
docker push dreo1/product-api:1.0.0

# Verify locally (optional)
docker run -p 3000:3000 \
  -e DB_HOST=localhost \
  -e DB_PORT=5432 \
  -e DB_NAME=productdb \
  -e DB_USER=apiuser \
  -e DB_PASSWORD=test \
  dreo1/product-api:1.0.0
```

---

### Step 5 — Update YAML Files

Before deploying, check these files.




# 5a. in this file i have my docker hub username
  k8s/deployments/api-deployment.yaml

# 5b. in this file i have my ingress external ip
  k8s/ingress/ingress.yaml

# 5c. (Optional) Generate your own base64 passwords for the Secret
echo -n 'nagp@2026'  | base64   # copy this into postgres-secret.yaml DB_PASSWORD
echo -n 'nagproot@2026' | base64   # copy this into postgres-secret.yaml POSTGRES_PASSWORD
# Then edit k8s/secrets/postgres-secret.yaml and replace the values

---

### Step 6 — Deploy Everything to Kubernetes

```bash
# Apply in order: namespace → config → secrets → storage → workloads → networking

# 1. Namespace
kubectl apply -f k8s/namespace/namespace.yaml

# 2. ConfigMaps
kubectl apply -f k8s/configmaps/api-configmap.yaml
kubectl apply -f k8s/configmaps/postgres-init-configmap.yaml

# 3. Secrets
kubectl apply -f k8s/secrets/postgres-secret.yaml

# 4. PersistentVolumeClaim
kubectl apply -f k8s/pvc/postgres-pvc.yaml

# 5. Database (StatefulSet)
kubectl apply -f k8s/deployments/postgres-statefulset.yaml

# 6. Wait for DB to be ready
kubectl rollout status statefulset/postgres -n workshop
kubectl get pods -n workshop -l app=postgres

# 7. Services
kubectl apply -f k8s/services/services.yaml

# 8. API Deployment
kubectl apply -f k8s/deployments/api-deployment.yaml

# 9. Wait for API pods
kubectl rollout status deployment/product-api -n workshop

# 10. Ingress
kubectl apply -f k8s/ingress/ingress.yaml

# 11. HPA
kubectl apply -f k8s/hpa/api-hpa.yaml

# Verify all objects
kubectl get all -n workshop
```

---

### Step 7 — Verify Deployment

```bash
# Show all objects in the workshop namespace
kubectl get all -n workshop

# Expected output:
# NAME                              READY   STATUS    RESTARTS   AGE
# pod/postgres-0                    1/1     Running   0          3m
# pod/product-api-xxxxxxxxx-xxxxx   1/1     Running   0          2m
# pod/product-api-xxxxxxxxx-yyyyy   1/1     Running   0          2m
# pod/product-api-xxxxxxxxx-zzzzz   1/1     Running   0          2m
# pod/product-api-xxxxxxxxx-wwwww   1/1     Running   0          2m
#
# NAME                       TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)
# service/postgres-service   ClusterIP   10.x.x.x     <none>        5432/TCP
# service/product-api-service ClusterIP  10.x.x.x     <none>        80/TCP
#
# NAME                          READY   UP-TO-DATE   AVAILABLE
# deployment.apps/product-api   4/4     4            4
#
# NAME                                    READY   AGE
# statefulset.apps/postgres               1/1     3m

# Check PVC is bound
kubectl get pvc -n workshop

# Check Ingress
kubectl get ingress -n workshop
kubectl describe ingress product-api-ingress -n workshop

# Check HPA
kubectl get hpa -n workshop
```

---

### Step 8 — API Call Demonstration

```bash
# Set the API base URL
export API_URL="http://api.$INGRESS_IP.nip.io/api/v1"

# Health check
curl $API_URL/health

# Fetch all products (shows records from PostgreSQL)
curl $API_URL/products | python3 -m json.tool

# Fetch a single product by ID
curl $API_URL/products/1

# Expected response:
# {
#   "success": true,
#   "count": 8,
#   "pod": "product-api-6d5f8b9c7-abc12",
#   "data": [
#     { "id": 1, "name": "Laptop Pro 15", "category": "Electronics", ... },
#     ...
#   ]
# }
```

---

### Step 9 — Self-Healing Demonstration

#### Kill an API Pod (Self-Healing)

```bash
# Get running API pods
kubectl get pods -n workshop -l app=product-api

# Kill one pod
kubectl delete pod -n workshop $(kubectl get pods -n workshop -l app=product-api \
  -o jsonpath='{.items[0].metadata.name}')

# Watch it regenerate immediately (Deployment controller recreates it)
kubectl get pods -n workshop -l app=product-api --watch

# API is still available (other 3 pods kept serving)
curl $API_URL/health
```

#### Kill the Database Pod (Self-Healing + Persistence)

```bash
# Delete the database pod
kubectl delete pod -n workshop postgres-0

# StatefulSet controller immediately recreates postgres-0
# Watch the pod come back
kubectl get pods -n workshop -l app=postgres --watch

# Once Running, verify ALL data is preserved
curl $API_URL/products | python3 -m json.tool
# All 8 products still present — PVC kept the data!
```

---

### Step 10 — Rolling Update Demonstration

```bash
# Build and push a v2 image (even if identical, forces a rollout)
docker build -t dreo1/product-api:2.0.0 ./app/
docker push dreo1/product-api:2.0.0

# Trigger rolling update
kubectl set image deployment/product-api \
  product-api=dreo1/product-api:2.0.0 \
  -n workshop

# Watch rolling update (maxSurge:1, maxUnavailable:0 → zero downtime)
kubectl rollout status deployment/product-api -n workshop

# Keep hitting the API during update — no downtime
watch -n 0.5 "curl -s $API_URL/health | python3 -m json.tool"

# Rollback if needed
kubectl rollout undo deployment/product-api -n workshop
```

---

### Step 11 — HPA Load Test

```bash
# Install hey (HTTP load generator)
go install github.com/rakyll/hey@latest
# OR use Apache Bench:
apt-get install apache2-utils

# Generate load to trigger HPA scale-up
hey -z 60s -c 50 $API_URL/products

# Watch HPA scale from 4 → up to 8 pods
kubectl get hpa -n workshop --watch

# Also watch pods
kubectl get pods -n workshop -l app=product-api --watch
```

---

### Cleanup (Delete Everything)

```bash
# Delete all workshop resources
kubectl delete namespace workshop

# Delete the GKE cluster (stops all billing)
gcloud container clusters delete workshop-cluster \
  --region asia-south2 \
  --project kubernetes-nagp-ankit-2026

# Delete the Ingress LoadBalancer
helm uninstall ingress-nginx --namespace ingress-nginx
```

---

## FinOps Cost Optimization Notes

Three opportunities identified and implemented:

1. **Right-sized resource requests/limits** — API pods request only 100m CPU / 128Mi RAM instead of over-provisioning. This reduces the node footprint needed.

2. **HPA min/max bounds** — Pods scale down to 4 when idle and up to 8 under load. Without HPA, you'd need to permanently provision for peak load.

3. **Node Auto-provisioning (GKE Autopilot)** — Using `create-auto` provisions node capacity exactly matching pod requests. No idle node waste.

Additional recommendations: use Spot/Preemptible nodes for the API tier (`--spot` flag), use a smaller `e2-micro` or `e2-small` machine type for the DB node, and set Pod Disruption Budgets to safely reduce cluster size during off-hours.
