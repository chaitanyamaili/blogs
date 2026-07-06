---
title: "Choosing Your Kubernetes Gateway Implementation: Envoy, Istio, Cilium, Kong, or Traefik"
description: "A decision framework backed by real benchmark data — including the CPU numbers nobody puts in the marketing copy — and which implementation wins for which use case. Part 3 of Kubernetes API Gateway in Production."
pubDate: 2026-07-06
tags: ["kubernetes", "api gateway", "platform engineering", "cloud-native", "envoy", "istio"]
readingTime: 13
series: "Kubernetes API Gateway in Production"
seriesPart: 3
---

The hardest infrastructure decisions are the ones that look like they have a clear right answer until you're six months in and realise you chose for the wrong reasons.

Gateway implementation is one of those. I've seen teams pick Istio because "it's what mature organisations use" — before they had more than five services and two engineers who understood Kubernetes. I've seen teams pick Traefik because it was easy to get started, then spend months trying to work around its limitations when their traffic management requirements grew. And I've seen teams run benchmarks, make a careful decision, deploy it — and discover that the benchmark they ran didn't measure the thing that mattered for their workload.

This is Part 3 of Kubernetes API Gateway in Production. We're going to look at the main implementation choices honestly — with the benchmark numbers the marketing copy doesn't include — and build a decision framework that actually accounts for your specific situation.

---

## What You're Actually Choosing

Every major implementation in this space implements the Kubernetes Gateway API spec. That's the point — your `HTTPRoute` and `Gateway` resources look the same regardless of which controller is running underneath. What differs is:

- **Data plane**: how traffic is actually processed (Envoy proxy, eBPF, NGINX, native cloud LB)
- **Control plane resource usage**: how much CPU/memory the controller and its agents consume
- **Extension model**: how you configure capabilities beyond the core spec (custom policies, plugins, Lua, CRDs)
- **Operational complexity**: what you're signing up to run, upgrade, and debug
- **Ecosystem**: support contracts, community size, tooling maturity

The implementations roughly fall into three tiers based on their scope:

1. **Gateway-only controllers** — implement Gateway API for north-south traffic, nothing more (Envoy Gateway, NGINX Gateway Fabric, Traefik)
2. **Service mesh with gateway** — full mesh capabilities plus Gateway API (Istio, Linkerd, Cilium)
3. **API management platforms** — Gateway API plus enterprise features like developer portals, plugin ecosystems, analytics (Kong, kgateway)

Knowing which tier fits your needs is the first cut of the decision.

---

## Envoy Gateway

Envoy Gateway is the CNCF project that turned Envoy proxy into a first-class Gateway API controller. It's opinionated in the right way: Gateway API is the API, Envoy is the data plane, and the project deliberately avoids growing into a service mesh.

What you get out of the box without plugins or custom configuration:
- JWT authentication via `SecurityPolicy`
- Rate limiting via `BackendTrafficPolicy`
- Circuit breaking and retries
- OIDC authentication
- mTLS for upstream connections
- Request/response modification

The YAML we used in Part 2 for SecurityPolicy and BackendTrafficPolicy is Envoy Gateway's extension API. These are CRDs layered on top of the core Gateway API spec — reasonably stable, and they give you production-grade capabilities without reaching for a service mesh.

Here's a complete working setup — Gateway, HTTPRoute, JWT enforcement, and rate limiting in one go:

```yaml
# 1. Install Envoy Gateway
helm install eg oci://docker.io/envoyproxy/gateway-helm \
  --version v1.3.0 \
  -n envoy-gateway-system \
  --create-namespace

# 2. GatewayClass (created automatically by Envoy Gateway, verify it exists)
kubectl get gatewayclass envoy-gateway
```

```yaml
# 3. Gateway — platform team owns this
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: eg
  namespace: envoy-gateway-system
spec:
  gatewayClassName: envoy-gateway
  listeners:
    - name: https
      port: 443
      protocol: HTTPS
      tls:
        mode: Terminate
        certificateRefs:
          - name: platform-tls       # cert-manager Secret
---
# 4. HTTPRoute — app team owns this in their namespace
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: payments-route
  namespace: payments
spec:
  parentRefs:
    - name: eg
      namespace: envoy-gateway-system
  hostnames:
    - payments.example.com
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /v1
      backendRefs:
        - name: payments-service
          port: 8080
---
# 5. JWT auth — rejects unauthenticated requests at the edge
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: jwt-policy
  namespace: payments
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: payments-route
  jwt:
    providers:
      - name: auth0
        issuer: "https://your-tenant.auth0.com/"
        audiences:
          - "https://api.example.com"
        remoteJWKS:
          uri: "https://your-tenant.auth0.com/.well-known/jwks.json"
---
# 6. Rate limiting — 100 req/min per user, 1000 overall
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: BackendTrafficPolicy
metadata:
  name: rate-limit
  namespace: payments
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: payments-route
  rateLimit:
    type: Global
    global:
      rules:
        - clientSelectors:
            - headers:
                - name: x-user-id
                  type: Distinct
          limit:
            requests: 100
            unit: Minute
        - limit:
            requests: 1000
            unit: Minute
```

Result: any unauthenticated request gets a 401 before touching your service; authenticated users are rate-limited at 100 req/min each; the whole cluster gets 1000 req/min. Zero application code changes.

**Where it excels:** teams that need a capable, standards-aligned gateway without the operational overhead of a full service mesh. If your requirements are in the capability map from Part 2 and you don't need east-west mTLS between all services, Envoy Gateway is the cleanest choice in 2026.

**Benchmark context:** In independent Gateway API benchmarks, Envoy Gateway uses approximately 2.9x the CPU of Istio at L7 under equivalent load. That sounds unfavourable, but it's measuring a different scope — Envoy Gateway is running only the gateway; Istio is running the gateway plus a full mesh data plane. For pure gateway workloads, the comparison is more nuanced.

**Principal Engineer's take:** Envoy Gateway is where I'd start for most new deployments. The project has strong CNCF governance, the extension API is well-designed (not annotation sprawl), and the scope is appropriately narrow. The one thing to check before committing: whether your specific advanced requirements are covered by the existing extension CRDs or require capabilities only available in the mesh-layer implementations.

---

## Istio (Ambient Mode)

Istio is a full service mesh that implements Gateway API. The key distinction: Istio is a mesh *that happens to have a gateway*, while Envoy Gateway is a *gateway that has no mesh ambitions*.

In 2026, the right way to run Istio is **Ambient mode** — the sidecar-free architecture that removes the per-pod Envoy proxy injection that made Istio operationally painful for years. Ambient uses a node-level proxy (`ztunnel`) for L4 and a shared `waypoint` proxy for L7, which dramatically reduces the resource overhead and the blast radius when the mesh has a bad day.

End-to-end Istio Ambient setup with a waypoint for L7 policies:

```bash
# Install Istio Ambient
istioctl install --set profile=ambient -y

# Enable ambient mode for your namespace
kubectl label namespace payments istio.io/dataplane-mode=ambient

# Deploy a waypoint proxy (required for L7 policies like AuthorizationPolicy)
istioctl waypoint apply --namespace payments --enroll-namespace
```

```yaml
# Gateway — uses the istio GatewayClass
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: istio-gateway
  namespace: istio-system
spec:
  gatewayClassName: istio
  listeners:
    - name: https
      port: 443
      protocol: HTTPS
      tls:
        mode: Terminate
        certificateRefs:
          - name: platform-tls
      allowedRoutes:
        namespaces:
          from: All
---
# HTTPRoute — same spec as any other Gateway API implementation
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: payments-route
  namespace: payments
spec:
  parentRefs:
    - name: istio-gateway
      namespace: istio-system
  hostnames:
    - payments.example.com
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /v1
      backendRefs:
        - name: payments-service
          port: 8080
---
# AuthorizationPolicy — enforced by the waypoint at L7
# Only services with the "frontend" service account can call payments
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: payments-authz
  namespace: payments
spec:
  targetRefs:
    - kind: Service
      name: payments-service
  action: ALLOW
  rules:
    - from:
        - source:
            principals:
              - "cluster.local/ns/frontend/sa/frontend"
```

What the waypoint buys you: `AuthorizationPolicy` is enforced at L7 with full HTTP context — you can allow/deny by method, path, header, and JWT claims. This is the capability Envoy Gateway doesn't have, because it has no east-west traffic view.

**The Istio case:** If you need mTLS between every service in your cluster, fine-grained traffic policies for east-west traffic, distributed tracing across all service-to-service calls, and you have the team to operate it — Istio Ambient is the right answer. The gateway capabilities come along for free, and the overall architecture is coherent.

**The Istio anti-case:** If you're running fewer than 10–15 services, or your team is still solidifying basic Kubernetes operations, or your primary need is north-south gateway capability — Istio is more than you need. You'll be operating a distributed system to solve a problem that a simpler gateway can handle.

**Benchmark numbers:** In the gateway-api-bench results, Istio and kgateway have the most efficient control planes among L7-capable implementations. Istio's control plane uses roughly 7x less CPU than Cilium's under equivalent conditions. At data-plane throughput, Istio Ambient performs competitively with Envoy Gateway on L7 workloads.

**Principal Engineer's take:** Istio Ambient is the answer I'd give to teams at 15+ services with security requirements (regulated industry, multi-tenant cluster, zero-trust mandate) that justify the operational investment. Below that threshold, you're paying the Istio tax without seeing the return. I've watched teams adopt Istio at five services and spend more time fighting the mesh than building product — don't do that.

---

## Cilium

Cilium uses eBPF — kernel-level networking code — instead of userspace proxies for its data plane. This is genuinely different architecture and it has genuine performance advantages at Layer 4: lower latency, higher throughput, less CPU for pure TCP/UDP routing.

```bash
# Install Cilium with Gateway API and kube-proxy replacement
helm install cilium cilium/cilium \
  --namespace kube-system \
  --set kubeProxyReplacement=true \
  --set gatewayAPI.enabled=true \
  --set gatewayAPI.secretsNamespace.name=kube-system

# Verify
kubectl get gatewayclass
# NAME     CONTROLLER                     ACCEPTED
# cilium   io.cilium/gateway-controller   True
```

For an L4 TCP workload — say, a Redis proxy or a custom TCP service — Cilium's `TCPRoute` is where it shines:

```yaml
# L4 TCP gateway (Cilium's eBPF advantage is here)
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: tcp-gateway
  namespace: platform
spec:
  gatewayClassName: cilium
  listeners:
    - name: redis
      port: 6379
      protocol: TCP
      allowedRoutes:
        kinds:
          - kind: TCPRoute
---
apiVersion: gateway.networking.k8s.io/v1alpha2
kind: TCPRoute
metadata:
  name: redis-route
  namespace: platform
spec:
  parentRefs:
    - name: tcp-gateway
      namespace: platform
      sectionName: redis
  rules:
    - backendRefs:
        - name: redis-service
          port: 6379
```

For HTTP traffic, Cilium falls back to Envoy in userspace — same Gateway API resource, different data path:

```yaml
# L7 HTTPRoute through Cilium (uses Envoy internally, not eBPF)
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: http-gateway
  namespace: platform
spec:
  gatewayClassName: cilium
  listeners:
    - name: https
      port: 443
      protocol: HTTPS
      tls:
        mode: Terminate
        certificateRefs:
          - name: platform-tls
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-route
  namespace: platform
spec:
  parentRefs:
    - name: http-gateway
      namespace: platform
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api-service
          port: 8080
```

**Where Cilium wins:** high-throughput L4 workloads — streaming media, gaming, financial data feeds — where you need to move a lot of TCP traffic with minimal overhead. eBPF-based packet processing bypasses a significant chunk of the Linux networking stack and it shows in the benchmarks.

**Where Cilium struggles:** at Layer 7. Once you need HTTP routing, JWT validation, or any request-level processing, Cilium has to escalate from eBPF to a userspace proxy. That transition has overhead, and the L7 capabilities are less mature than Envoy Gateway or Istio.

The benchmark numbers are stark: Cilium's control plane uses 7.5x the CPU of Istio in published benchmarks. Cilium also uses the most data-plane CPU of any implementation tested — significantly more than Nginx or Envoy Gateway — under equivalent L7 load. This is counter-intuitive if you've absorbed the "eBPF is fast" narrative, but it makes sense when you understand that the eBPF advantage is specifically at L4, and most web workloads are L7.

**Principal Engineer's take:** Cilium is the right answer for a specific class of problem — L4-heavy workloads at scale, or environments where you want a single CNI+gateway solution and are willing to accept the L7 trade-offs. It is not the "highest performance gateway" for typical web API traffic. Don't let the eBPF marketing abstract you from the actual benchmark numbers for your workload type. If the majority of your traffic is HTTP APIs, you're not getting the eBPF benefit at L7.

---

## Kong

Kong is an API management platform that now implements Kubernetes Gateway API, typically via the Kong Kubernetes Ingress Controller (KIC) or the Kong Operator. It's a different category from the others: where Envoy Gateway and Istio are infrastructure tools, Kong is positioned as an API management product — it ships with a plugin ecosystem, a developer portal, analytics, and a management API.

```bash
# Install Kong via the Kong Operator (recommended over KIC for new deployments)
helm repo add kong https://charts.konghq.com && helm repo update
helm install kong-operator kong/kong-operator -n kong-system --create-namespace

# Or via KIC (simpler, direct approach):
helm install kong kong/ingress \
  -n kong \
  --create-namespace \
  --set controller.ingressController.enabled=true \
  --set gateway.enabled=true
```

Full example: Gateway, HTTPRoute, and a plugin attached via `konghq.com/plugins` annotation:

```yaml
# GatewayClass — references the kong controller
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: kong
spec:
  controllerName: konghq.com/kic-gateway-controller
---
# Gateway
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: kong-gateway
  namespace: kong
spec:
  gatewayClassName: kong
  listeners:
    - name: https
      port: 443
      protocol: HTTPS
      tls:
        mode: Terminate
        certificateRefs:
          - name: platform-tls
      allowedRoutes:
        namespaces:
          from: All
---
# HTTPRoute with plugin annotation (Kong-specific extension)
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: payments-route
  namespace: payments
  annotations:
    konghq.com/plugins: rate-limiting-advanced,jwt-auth    # attach plugins here
spec:
  parentRefs:
    - name: kong-gateway
      namespace: kong
  hostnames:
    - payments.example.com
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /v1
      backendRefs:
        - name: payments-service
          port: 8080
---
# The plugins themselves — declarative, no GUI required
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: rate-limiting-advanced
  namespace: payments
plugin: rate-limiting-advanced
config:
  limit:
    - 100
  window_size:
    - 60
  sync_rate: -1          # -1 means sync immediately to Redis
  strategy: redis
  redis:
    host: redis.platform.svc
    port: 6379
---
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: jwt-auth
  namespace: payments
plugin: jwt
config:
  key_claim_name: kid
  claims_to_verify:
    - exp
    - nbf
```

The annotation `konghq.com/plugins: rate-limiting-advanced,jwt-auth` is Kong's extension point on top of Gateway API — it's still annotation-driven, but scoped to plugins rather than raw configuration, and the plugin CRDs have proper schemas.

Kong's plugin model is genuinely powerful. At last count, there are over 100 plugins available covering authentication (OAuth2, OIDC, LDAP, JWT), traffic management (rate limiting, proxy cache, canary), observability (Datadog, Prometheus, Zipkin), and request transformation. These are configurable without code:

```yaml
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: rate-limiting-advanced
plugin: rate-limiting-advanced
config:
  limit:
    - 100
  window_size:
    - 60
  sync_rate: -1        # Redis-backed global rate limiting
  strategy: redis
  redis:
    host: redis.default.svc
    port: 6379
```

**Where Kong makes sense:** organisations that need API management features beyond pure gateway routing — developer portals, API key management, plugin-based extensibility, a GUI for non-engineers to configure routing rules. Kong is particularly strong in multi-team environments where different teams need to manage their own API policies through a self-service interface.

**The trade-offs:** Kong's plugin model is powerful but opaque — when a plugin misbehaves, debugging it requires understanding Kong's internals in ways that Gateway API's declarative CRDs don't. Kong's enterprise offering (Kong Gateway Enterprise) adds significant capability but also significant licensing cost. And the surface area of Kong is larger than a pure gateway — more to understand, more to upgrade, more that can go wrong.

**Principal Engineer's take:** Kong is the right answer when you have API management requirements that a pure gateway doesn't address — developer self-service, rich analytics, a plugin ecosystem for business-level features. It's wrong when you're primarily looking for a gateway and don't need the management layer — you'll be paying the complexity tax without seeing the return.

---

## Traefik

Traefik takes a different approach: dynamic configuration and automatic service discovery. It watches Kubernetes for services and routes and configures itself without manual intervention.

```bash
# Install Traefik with Gateway API support enabled
helm repo add traefik https://traefik.github.io/charts && helm repo update
helm install traefik traefik/traefik \
  --namespace traefik \
  --create-namespace \
  --set providers.kubernetesGateway.enabled=true \
  --set gateway.enabled=true
```

Traefik's native `IngressRoute` CRD (still the most common approach):

```yaml
# Native Traefik CRD approach — simple and zero-config TLS
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: my-app
  namespace: default
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`app.example.com`) && PathPrefix(`/api`)
      kind: Rule
      services:
        - name: my-service
          port: 8080
      middlewares:
        - name: rate-limit
  tls:
    certResolver: letsencrypt    # Traefik auto-provisions from Let's Encrypt
---
# Rate limiting middleware (Traefik's extension model)
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: rate-limit
  namespace: default
spec:
  rateLimit:
    average: 100
    burst: 50
```

Traefik's Gateway API support (if you want the standard resources):

```yaml
# GatewayClass (auto-created by Traefik Helm chart)
# kubectl get gatewayclass traefik

# Gateway — Traefik picks this up automatically
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: traefik-gateway
  namespace: traefik
spec:
  gatewayClassName: traefik
  listeners:
    - name: web
      port: 80
      protocol: HTTP
    - name: websecure
      port: 443
      protocol: HTTPS
      tls:
        mode: Terminate
        certificateRefs:
          - name: platform-tls
---
# Standard HTTPRoute — works the same as any other implementation
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: my-app-route
  namespace: default
spec:
  parentRefs:
    - name: traefik-gateway
      namespace: traefik
  hostnames:
    - app.example.com
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: my-service
          port: 8080
```

The simplicity is real: zero annotation wrangling, automatic certificate provisioning, dynamic service discovery. Traefik notices new services via label selectors and configures itself.

Traefik also supports Kubernetes Gateway API in recent versions, though its native CRDs (IngressRoute) remain widely used.

**Where Traefik wins:** smaller deployments, teams that value operational simplicity over extensibility, environments where automatic certificate management (via Let's Encrypt integration) and zero-config service discovery are the primary requirements. Traefik has the gentlest learning curve of any gateway in this list.

**Where it struggles:** at scale. Traefik's dynamic configuration model becomes a liability when you have hundreds of services — changes anywhere can trigger reconfiguration across the whole proxy. The traffic management features (rate limiting, circuit breaking) are less mature than Envoy Gateway or Kong. And the Gateway API support, while present, lags behind the native CRDs in capability.

**Principal Engineer's take:** Traefik is the right answer for a team that needs a working gateway today with minimal configuration, and whose requirements won't grow significantly. It's the wrong answer if you're building a platform others will deploy dozens of services onto.

---

## The Decision Framework

Here's how I actually make this choice:

| If your primary need is… | Start with |
|---|---|
| Gateway-only, standards-aligned, no mesh | **Envoy Gateway** |
| mTLS + east-west mesh + gateway | **Istio Ambient** |
| L4/TCP performance at high scale | **Cilium** (with L7 caveats) |
| API management, developer portal, plugin ecosystem | **Kong** |
| Simple start, small team, quick setup | **Traefik** |
| Enterprise + AI gateway + Istio integration | **kgateway** |

And the questions to pressure-test the choice:

1. **How many services?** Under 10 — almost anything works. Over 15 with security requirements — evaluate Istio Ambient seriously. Over 50 with multi-team self-service needs — look at Kong.

2. **Does your team understand the data plane?** Istio debugging requires understanding Envoy. Cilium debugging requires understanding eBPF. If neither of those is on your team's skill map today, factor in the learning investment.

3. **What's your cloud provider?** GKE, EKS, and AKS all have managed gateway options that implement Gateway API with native cloud integration. If you're already deep in one cloud provider's ecosystem, the managed option often has better economics than running your own.

4. **Do you have existing external gateways?** If you're already running Kong or AWS API Gateway externally, there's a strong argument for extending that into Kubernetes rather than introducing a second gateway technology. We'll cover exactly how to do that in Parts 4 and 5.

5. **What's your upgrade tolerance?** All of these projects are evolving. Istio Ambient went GA in 2024; Envoy Gateway 1.x is stable. Cilium's Gateway API support is newer. Ask yourself how much churn you can absorb in your platform team's backlog.

---

## The Honest Version of "It Depends"

Every implementation comparison eventually ends up at "it depends," and that answer is almost always a cop-out. Here's the honest version:

For a team starting fresh in 2026 with typical web API workloads: **Envoy Gateway**. It's the most focused tool for the job, has excellent CNCF governance, and the extension API covers the capabilities Part 2 laid out without reaching for a mesh.

For a team with strong service mesh requirements: **Istio Ambient** — but only if you have at least one engineer who will own it as a first-class platform concern, not a fire-and-forget deployment.

For a team running on a managed cloud with budget for managed services: check your cloud provider's native Gateway API implementation first. GKE Gateway, AWS Gateway API Controller, AKS AGIC — these have native integrations that often beat running your own at equivalent capability with lower operational overhead.

---

**Next in the series:** Part 4 covers Kong Gateway specifically — how to run it both as an external API gateway and as your in-cluster gateway, KIC setup, Kong Operator, and the hybrid deployment patterns that work in production.

*Disagree with my implementation ranking, or running something I didn't cover? Find me on [LinkedIn](https://www.linkedin.com/in/chaitanyamaili/).*
