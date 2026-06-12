---
title: "Kubernetes Service Communication Patterns: A Decision Guide for Platform Engineers"
description: "ClusterIP, NodePort, LoadBalancer, Ingress, service mesh — not as definitions, but as design decisions with real cost and operational trade-offs. Part 2 of the Kubernetes Design Patterns series."
pubDate: 2026-06-14
tags: ["kubernetes", "platform engineering", "cloud-native", "networking"]
readingTime: 13
---

Here's a conversation I've had more times than I can count:

Someone is setting up a new service. They need other things to talk to it. They reach for `LoadBalancer` because it's the one that sounds the most production-ready. Three months later, their cloud bill has a line item for 12 load balancers — one per service — and nobody can explain why the architecture ended up that way.

Or the opposite: they chose `ClusterIP` for everything, then spent a week debugging why their frontend couldn't reach the backend, not realising the service was only reachable inside the cluster.

Service communication in Kubernetes is one of those areas where the documentation is thorough, the options are clearly listed, and yet teams consistently make choices they later regret. Usually because they picked based on what sounded right, not based on a clear model of what each option actually does.

This is Part 2 of the Kubernetes Design Patterns series. We're going to build that model.

**Hands-on:** Work through Ingress and Service scenarios in the [KillerCoda CKA Course](https://killercoda.com/course/cka) or browse [free CKA scenarios](https://killercoda.com/cka). The networking labs are directly relevant to everything in this post.

---

## The Mental Model First

Before we get into the specific types, one framing that makes everything else clearer:

Kubernetes networking has two fundamentally different traffic directions:

- **East-west traffic** — service to service, inside the cluster
- **North-south traffic** — traffic coming in from or going out to the outside world

Most of your services only need to handle east-west traffic. They should never be directly reachable from the internet. A much smaller number of services — usually just your API gateway or frontend — need to handle north-south traffic.

Getting confused about which direction you're dealing with is the root cause of most Kubernetes networking mistakes.

---

## ClusterIP — The Default, and Usually the Right Choice

Every Kubernetes Service gets a stable virtual IP address called a ClusterIP. Traffic to that IP gets load-balanced across healthy pods matching the selector.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: payments-service
  namespace: backend
spec:
  selector:
    app: payments
  ports:
    - port: 8080
      targetPort: 8080
  type: ClusterIP  # This is the default — you don't even need to specify it
```

That's it. Any pod in the cluster can now reach your payments service at `payments-service.backend.svc.cluster.local:8080`. Kubernetes DNS handles the discovery automatically.

**ClusterIP is the right choice for:**
- Any service that only needs to be called by other services inside the cluster
- Databases, caches, internal APIs, worker services
- Basically everything that isn't your public-facing entry point

**The thing people miss:** Services with ClusterIP are completely unreachable from outside the cluster. Not "hard to reach" — unreachable. This is correct and intentional. If you're debugging why your browser can't hit a ClusterIP service directly, that's why.

**Principal Engineer's take:** If you're designing a new service and you're not sure which type to use, start with ClusterIP. It's the most secure option by default, it has no cost implications, and you can always change it later. The other types are additions to ClusterIP, not replacements.

---

## NodePort — Useful in Narrow Circumstances

NodePort does what ClusterIP does, plus it opens a specific port (30000-32767) on every node in your cluster. External traffic hitting `<any-node-ip>:<node-port>` gets forwarded to your service.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: debug-service
spec:
  selector:
    app: my-app
  ports:
    - port: 8080
      targetPort: 8080
      nodePort: 30080  # Optional — Kubernetes will assign one if omitted
  type: NodePort
```

**When NodePort actually makes sense:**
- Local development clusters (Minikube, kind) where you need to reach a service from your laptop
- On-premises environments where you don't have a cloud load balancer
- Temporary debugging access that you're removing once the issue is resolved

**When NodePort is the wrong choice:**
- Production cloud environments — use LoadBalancer or Ingress instead
- Anything you're tempted to leave running permanently
- When you need SSL termination, path-based routing, or any kind of traffic management

**The operational problem with NodePort in production:** You're now exposed on a high port across every node. Your firewall rules need to account for that. The port range is ugly (`:30080` in URLs). And you're bypassing a bunch of useful infrastructure (load balancer health checks, SSL, etc.) that you'll want in production anyway.

**Principal Engineer's take:** NodePort is a tool for getting something working quickly, not for designing a production architecture. I've seen NodePort used in production exactly once, intentionally — in an air-gapped environment with no cloud provider. Every other time I've seen it in production, it was an accident that should have been an Ingress.

---

## LoadBalancer — One Per Service Gets Expensive Fast

`LoadBalancer` provisions an actual cloud load balancer (ALB on AWS, Cloud Load Balancer on GCP) and points it at your service. External traffic hits the load balancer, which forwards to your nodes, which forward to your pods.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api-gateway
  annotations:
    # GCP-specific: use a regional internal load balancer
    cloud.google.com/load-balancer-type: "Internal"
spec:
  selector:
    app: api-gateway
  ports:
    - port: 443
      targetPort: 8443
  type: LoadBalancer
```

**LoadBalancer is appropriate for:**
- A single, well-justified entry point that genuinely needs its own cloud load balancer
- TCP/UDP services that can't use HTTP-based Ingress routing
- Situations where you need cloud-provider-specific features (GCP's internal load balancer for private traffic, AWS NLB for low-latency TCP)

**The cost trap:** Each `LoadBalancer` service provisions a dedicated cloud load balancer. On GCP, that's around $18/month per load balancer, plus traffic costs. On AWS, ALBs run similarly. Ten services with `LoadBalancer` type means ten load balancers — before you've accounted for traffic costs.

I've seen teams rack up $2,000+ monthly in load balancer costs alone, not because they were doing anything wrong per-service, but because nobody stepped back and asked whether each service needed its own load balancer. Usually it doesn't.

**Principal Engineer's take:** `LoadBalancer` is the right answer for a small number of well-defined entry points. The moment you find yourself creating more than 2-3, stop and ask whether Ingress would solve the same problem more efficiently.

---

## Ingress — The Pattern You Actually Want for HTTP Traffic

Ingress is a different kind of object — not a Service type, but a separate resource that sits in front of your ClusterIP services and provides HTTP/HTTPS routing.

One Ingress controller (backed by one load balancer) can route traffic to many different services based on hostname or path.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: platform-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - api.chaitanyamaili.in
        - admin.chaitanyamaili.in
      secretName: platform-tls
  rules:
    - host: api.chaitanyamaili.in
      http:
        paths:
          - path: /v1/users
            pathType: Prefix
            backend:
              service:
                name: users-service
                port:
                  number: 8080
          - path: /v1/payments
            pathType: Prefix
            backend:
              service:
                name: payments-service
                port:
                  number: 8080

    - host: admin.chaitanyamaili.in
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: admin-service
                port:
                  number: 3000
```

One Ingress. One load balancer behind it. Three services routed to — by host and path — with SSL termination handled at the Ingress level. Compare that to three LoadBalancer services with three load balancers and SSL managed per-service.

**Path-based vs host-based routing:**

- **Path-based** (`/api/users`, `/api/payments`) — useful when you want everything under one domain, differentiated by URL path
- **Host-based** (`api.example.com`, `admin.example.com`) — cleaner separation, easier to reason about per-service, requires DNS setup per subdomain

In practice, host-based routing is cleaner at scale. Path-based routing becomes a maintenance problem when paths collide or change.

**Ingress controllers — the choice matters:**

The `Ingress` resource is a spec; the controller is the implementation. Common choices:

| Controller | Best for |
|---|---|
| **nginx-ingress** | General purpose, widely supported, good defaults |
| **AWS Load Balancer Controller** | Native ALB/NLB integration on AWS |
| **GKE Ingress / GCP GLB** | Native integration on GCP, global load balancing |
| **Traefik** | Dynamic config, good for microservices-heavy setups |
| **Istio Gateway** | When you're already running Istio |

Pick based on your cloud provider and existing infrastructure, not based on which has the most GitHub stars.

**Principal Engineer's take:** For most teams, the right architecture is: one Ingress controller per cluster (sometimes one per environment), all HTTP/S services behind it using ClusterIP, with SSL terminated at the Ingress. This keeps costs predictable, centralises your entry-point configuration, and gives you one place to add authentication, rate limiting, and logging. If you catch yourself creating many Ingress resources for the same cluster, consolidate them — it gets unwieldy fast.

---

## Service Mesh — When the Complexity Is Worth It

A service mesh (Istio, Linkerd) adds a sidecar proxy to every pod that intercepts all network traffic. This gives you mTLS between services, fine-grained traffic management, distributed tracing, and circuit breaking — without changing application code.

```yaml
# With Istio installed, this VirtualService gives you
# traffic splitting between two versions of a service
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: payments-routing
spec:
  hosts:
    - payments-service
  http:
    - match:
        - headers:
            x-canary:
              exact: "true"
      route:
        - destination:
            host: payments-service
            subset: v2
    - route:
        - destination:
            host: payments-service
            subset: v1
          weight: 90
        - destination:
            host: payments-service
            subset: v2
          weight: 10
```

That's canary traffic splitting — 10% of traffic to v2, 90% to v1, with header-based override for testing. Doing this without a service mesh would require significant application changes or a custom proxy setup.

**When a service mesh is worth the operational cost:**
- You have strict security requirements and need verifiable mTLS between every service
- You need fine-grained traffic management (canary, A/B, circuit breaking) without application-level changes
- You have many services and observability is becoming a real problem

**When it's overkill:**
- You have fewer than ~10 services
- Your team is still figuring out basic Kubernetes operations
- You're running a monolith that you've containerised but haven't broken into microservices yet

The honest truth about service meshes: they add significant operational complexity. Istio, in particular, has a steep learning curve, adds resource overhead (every pod gets a sidecar), and when it breaks, it can break in ways that are genuinely hard to debug. Linkerd is lighter and simpler, but still an additional system to operate and upgrade.

Don't adopt a service mesh because it sounds like what mature engineering organizations do. Adopt it because you have a specific problem it solves — mTLS at scale, fine-grained traffic control, deep observability — that you can't solve more simply.

**Principal Engineer's take:** I'd put the threshold at roughly 15-20 services with real security or traffic management requirements before a service mesh starts paying for itself operationally. Below that, a well-configured Ingress with network policies and application-level instrumentation will take you further with less operational risk.

---

## The Decision Framework

Here's the actual flowchart I use:

```
Does this service need to be reachable from outside the cluster?
│
├── No → ClusterIP. Done.
│
└── Yes → Is it HTTP/HTTPS?
    │
    ├── Yes → Use Ingress with a ClusterIP backend.
    │         Add to an existing Ingress if one exists.
    │         Create a new one only if there's a strong reason.
    │
    └── No (TCP/UDP, or needs cloud-specific LB features)
        └── LoadBalancer. One per entry point, not one per service.

Do you need mTLS, fine-grained traffic management, or deep observability?
├── No → Network Policies + Ingress is sufficient.
└── Yes → Consider a service mesh. But do it deliberately, not by default.
```

---

## Practice

- [KillerCoda CKA Course](https://killercoda.com/course/cka) — includes dedicated Ingress and Service networking scenarios
- [Free CKA Scenarios](https://killercoda.com/cka) — pick the networking section; the hands-on time with Ingress configuration is invaluable
- [KodeKloud Kubernetes Networking](https://kodekloud.com/courses/certified-kubernetes-administrator-cka/) — the Services and Networking section of the CKA course covers this in depth

Build an Ingress that routes two paths to two different services. Add TLS. Break it deliberately and debug it. That exercise will teach you more than reading any blog post (including this one).

---

**Next in the series:** Resilience Patterns — liveness vs readiness vs startup probes (most teams configure these wrong), resource limits as a design decision, and what happens at scale when you get any of it wrong.

*Something I got wrong, or a pattern that deserves more coverage? Find me on [LinkedIn](https://www.linkedin.com/in/chaitanyamaili/).*
