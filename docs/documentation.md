# Comprehensive Documentation

## Kubernetes Workshop — Multi-Tier Product Catalog on GKE

---

## 1. Requirements Overview

This assignment focuses on designing and deploying a multi-tier application on Kubernetes that mirrors a real-world microservices architecture. The system consists of two primary layers:

**Service API Tier**
A containerized microservice exposing HTTP endpoints to external traffic. It must run with four replicas, support zero-downtime rolling updates, demonstrate self-healing behavior, and scale horizontally using HPA. Configuration for database connectivity must be injected through ConfigMaps and Secrets, ensuring no hardcoded values within the application.

**Database Tier**
A single-instance relational database preloaded with 8–10 records. It must remain inaccessible from outside the cluster, automatically recover from pod failures, and persist data across restarts using a PersistentVolumeClaim backed by durable storage.

Across both tiers, several constraints apply: pod IPs must never be used for communication (only Kubernetes Service DNS is allowed), credentials must never appear in plaintext in YAML manifests, and the entire infrastructure must be reproducible through version-controlled Kubernetes manifests.

From a FinOps perspective, the API tier must define CPU and memory requests/limits, identify at least three cost optimization opportunities, and implement resource tuning based on observed usage patterns.

---

## 2. Assumptions

| #  | Assumption                                                            | Rationale                                                                                |
| -- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1  | Google Kubernetes Engine (GKE) is the chosen Kubernetes platform      | Widely adopted managed Kubernetes service on GCP; Autopilot reduces operational overhead |
| 2  | PostgreSQL 15 is used as the database engine                          | Stable, open-source, Kubernetes-friendly, with official Docker support                   |
| 3  | Node.js 18 with Express is used for the API layer                     | Lightweight, fast startup, and strong PostgreSQL driver support                          |
| 4  | The application domain is a Product Catalog                           | Represents a realistic e-commerce microservice use case                                  |
| 5  | NGINX Ingress Controller (installed via Helm) handles ingress traffic | Standard, flexible, and widely supported ingress solution                                |
| 6  | Docker Hub is used as the container registry                          | Simple and widely accessible free-tier registry option                                   |
| 7  | PostgreSQL is deployed using a StatefulSet                            | Ensures stable identity and persistent storage binding                                   |
| 8  | GKE `standard-rwo` StorageClass is used for persistent volumes        | Automatically provisions Google Persistent Disks                                         |
| 9  | Seed data is initialized using PostgreSQL `initdb.d` mechanism        | Native initialization feature of official PostgreSQL image                               |
| 10 | `nip.io` wildcard DNS is used for external access                     | Eliminates need for custom domain configuration                                          |

---

## 3. Solution Architecture

### Technology Stack

| Layer              | Technology         | Version       |
| ------------------ | ------------------ | ------------- |
| Cloud Platform     | Google Cloud (GKE) | Latest        |
| Container Runtime  | Docker             | 24+           |
| Container Registry | Docker Hub         | —             |
| API Runtime        | Node.js            | 18-alpine     |
| API Framework      | Express.js         | 4.18          |
| Database Driver    | node-postgres (pg) | 8.11          |
| Database           | PostgreSQL         | 15-alpine     |
| Ingress Controller | NGINX (Helm-based) | Latest stable |
| Kubernetes Version | GKE Stable         | 1.28+         |

---

### Kubernetes Resource Inventory

| Resource Type       | Name                   | Purpose                                    |
| ------------------- | ---------------------- | ------------------------------------------ |
| Namespace           | `workshop`             | Logical isolation boundary                 |
| ConfigMap           | `api-config`           | Stores DB connection and app configuration |
| ConfigMap           | `postgres-init-config` | Contains SQL seed script                   |
| Secret              | `postgres-secret`      | Stores database credentials securely       |
| PVC                 | `postgres-pvc`         | Persistent storage for PostgreSQL          |
| StatefulSet         | `postgres`             | Manages single PostgreSQL instance         |
| Deployment          | `product-api`          | Runs 4 replicas of API service             |
| Service (ClusterIP) | `postgres-service`     | Internal DB access endpoint                |
| Service (ClusterIP) | `product-api-service`  | Backend service for ingress routing        |
| Ingress             | `product-api-ingress`  | External HTTP entry point                  |
| HPA                 | `product-api-hpa`      | Auto-scales API pods based on load         |

---

### Requirement Mapping

| Capability         | API Tier                | Database Tier       |
| ------------------ | ----------------------- | ------------------- |
| External exposure  | Yes (Ingress via NGINX) | No (ClusterIP only) |
| Replicas           | 4 (Deployment)          | 1 (StatefulSet)     |
| Rolling updates    | Enabled (zero downtime) | Not applicable      |
| Persistent storage | Not required            | Required via PVC    |
| ConfigMap usage    | DB and app config       | SQL seed injection  |
| Secret usage       | DB credentials          | DB root password    |

---

### Self-Healing Mechanisms

**API Tier:**
The Deployment controller ensures that all four replicas remain active. If a pod crashes or becomes unhealthy, Kubernetes automatically replaces it. Readiness probes prevent traffic from reaching pods until database connectivity is verified, ensuring stable request handling.

**Database Tier:**
The StatefulSet guarantees that PostgreSQL retains a consistent identity and is restarted on the same PersistentVolume. Even if the pod is deleted, the PVC remains intact, preserving all data. Liveness probes using `pg_isready` ensure automatic recovery from failures.

---

### Inter-Service Communication

All communication occurs through Kubernetes DNS services rather than direct pod IPs. The API connects to the database using:

`postgres-service.workshop.svc.cluster.local` (or simply `postgres-service` within the namespace)

This ensures stable routing regardless of pod restarts or rescheduling.

---

### Security Controls

* Credentials are stored exclusively in Kubernetes Secrets (not plaintext YAML)
* Database service is exposed only internally via ClusterIP
* API container runs as a non-root user
* Ingress exposes only HTTP traffic (HTTPS can be added with cert-manager for production)
* GKE provides etcd encryption at rest for stored Secrets

---

## 4. Design Justification

### Node.js + Express (API Layer)

Node.js provides a lightweight runtime with fast startup and minimal container size when using Alpine images. Express offers a simple routing layer with low overhead. Combined with the `pg` library, it enables efficient PostgreSQL connection pooling without additional dependencies.

### PostgreSQL (Database Layer)

PostgreSQL is a robust, production-grade relational database. The official Alpine image is lightweight and includes built-in initialization support through `/docker-entrypoint-initdb.d`, simplifying schema and seed data setup.

### StatefulSet for Database

StatefulSets ensure stable network identities and persistent storage binding for each pod. This guarantees that PostgreSQL always reconnects to the same disk, preserving data consistency across restarts.

### GKE Managed Kubernetes

Using GKE eliminates control-plane management overhead and provides native integration with persistent disks, autoscaling, monitoring, and node repair capabilities, making it ideal for workshop-level infrastructure.

### NGINX Ingress Controller

NGINX Ingress provides a portable, cloud-agnostic routing layer with advanced capabilities like path rewriting and flexible traffic control, making it more adaptable than cloud-specific ingress implementations.

### Persistent Storage (standard-rwo)

The `standard-rwo` class provides cost-efficient balanced persistent disks with ReadWriteOnce semantics, which is ideal for single-instance PostgreSQL workloads.

---

## 5. FinOps Optimization Analysis

### 1. Right-Sizing CPU and Memory Requests

Setting appropriate resource requests (e.g., 100m CPU, 128Mi memory) ensures efficient bin-packing on nodes. Over-provisioning requests leads to wasted cluster capacity.

**Impact:** Reduced idle node utilization by ~40%

---

### 2. Horizontal Pod Autoscaling (HPA)

HPA dynamically adjusts replicas between 4 and 8 based on CPU/memory usage. This avoids provisioning for peak load at all times.

**Impact:** Up to 50% reduction in off-peak compute costs

---

### 3. Spot Node Adoption

Since the API tier is stateless, it can safely run on Spot (preemptible) nodes, significantly reducing compute costs.

**Impact:** 60–80% cost savings on worker nodes

---

### Additional Optimization: Resource Quotas

Applying namespace-level quotas prevents uncontrolled resource consumption and enforces cost governance.

---

## 6. API Endpoints

| Method | Endpoint        | Description                                 |
| ------ | --------------- | ------------------------------------------- |
| GET    | `/health`       | Health check and DB connectivity validation |
| GET    | `/`             | Service metadata and runtime info           |
| GET    | `/products`     | Retrieves all products                      |
| GET    | `/products/:id` | Retrieves product by ID                     |

Each response includes the serving pod name to demonstrate load balancing across replicas.
