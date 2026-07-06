---
title: "What an API Gateway Actually Does: Capabilities Every Platform Engineer Should Know"
description: "TLS termination, authentication, rate limiting, traffic routing, observability, WebSocket and gRPC — a clear map of what the gateway layer owns and what belongs in your application. Part 2 of Kubernetes API Gateway in Production."
pubDate: 2026-07-06
tags: ["kubernetes", "api gateway", "platform engineering", "cloud-native", "networking"]
readingTime: 11
series: "Kubernetes API Gateway in Production"
seriesPart: 2
---

Every time I join a new team working on Kubernetes, I ask the same question: what is your API gateway responsible for?

The answers vary wildly. Sometimes it's "TLS and routing, that's it." Sometimes it's "everything — auth, rate limiting, request transformation, canary deploys." Sometimes the honest answer is a long pause followed by "...routing, I think? And maybe TLS?"

The variance isn't random. It tracks almost perfectly with how many production incidents the team has had that could have been prevented by a well-configured gateway. The teams that have gone through a DDoS that could have been rate-limited at the edge, or spent a week debugging why JWT validation logic was subtly different across five services, or discovered their WebSocket connections were silently being dropped — those teams know exactly what their gateway should own.

This is Part 2 of Kubernetes API Gateway in Production. Before we pick an implementation (Part 3) or configure specific integrations (Parts 4–6), we need a shared vocabulary: what does the gateway layer own, what are the capabilities you should expect any serious gateway to provide, and — critically — what does *not* belong there.

---

## The Gateway Layer's Job

An API gateway sits at the boundary between external traffic and your internal services. Everything that crosses that boundary passes through it.

That position gives the gateway a unique opportunity: it's the one place in your architecture where you can enforce cross-cutting concerns consistently, without duplicating logic in every service. TLS termination, authentication, rate limiting, request logging — all of these are the same problem whether you're handling a request to your users service or your payments service. The gateway is where you solve them once.

The failure mode I've seen most often: teams implement these concerns in individual services because they either don't know the gateway can handle them, or they don't trust it to handle them correctly. The result is duplicated logic, inconsistent enforcement, and a much harder time making changes. JWT validation done differently in three services means that when the token format changes, you're touching three codebases instead of one config file.

Let's go through what a mature gateway should provide.

---

## TLS Termination

TLS termination is the gateway decrypting incoming HTTPS traffic and forwarding it to your services as plain HTTP (or re-encrypting for mTLS, but let's start with the common case).

Why at the gateway? Your internal services don't need to manage certificates. Certificate rotation happens in one place. TLS configuration — cipher suites, minimum protocol version, HSTS headers — is enforced consistently. And your services can use plain HTTP internally, which is simpler and faster.

With Kubernetes Gateway API, TLS is configured at the `Gateway` listener level:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: platform-gateway
  namespace: platform
spec:
  gatewayClassName: envoy-gateway
  listeners:
    - name: https
      port: 443
      protocol: HTTPS
      tls:
        mode: Terminate          # Decrypt here; forward as HTTP internally
        certificateRefs:
          - name: platform-tls   # cert-manager-managed Secret
            namespace: platform
    - name: http
      port: 80
      protocol: HTTP
      allowedRoutes:
        namespaces:
          from: All
```

**What this replaces:** In the Ingress era, TLS was configured per-Ingress resource, with cert-manager creating separate Secrets per namespace. At scale, this meant dozens of certificates to rotate, and no single place to enforce organisation-wide TLS policy. Gateway API centralises this at the Gateway — one certificate (or a few), one rotation event, consistent enforcement.

**Principal Engineer's take:** If your services are doing their own TLS today, that's the first thing to move to the gateway. The operational complexity of managing certificates at the service level adds up fast. The "but what about mTLS between services?" question is a separate concern — that's what a service mesh handles, and we'll get to it in Part 4. For north-south traffic coming in from the internet, terminate TLS at the gateway.

---

## Authentication and Authorisation

This is the capability teams most often implement in the wrong place.

A gateway can validate authentication tokens before requests ever reach your services. The most common pattern: JWT validation. The gateway checks that the JWT in the `Authorization` header is signed by a trusted issuer, that it hasn't expired, and (optionally) that the `aud` claim matches. If any of these fail, the gateway returns 401 and the request never hits your service.

With Envoy Gateway's `SecurityPolicy`:

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: jwt-policy
  namespace: platform
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
```

Any request to `payments-route` without a valid JWT from your Auth0 tenant gets rejected at the gateway. Your payments service sees only authenticated requests and never needs to implement JWT validation itself.

Kong's approach uses plugins:

```yaml
plugins:
  - name: jwt
    config:
      key_claim_name: kid
      claims_to_verify:
        - exp
        - nbf
```

**The authorisation distinction:** Authentication (who are you?) belongs at the gateway. Fine-grained authorisation (are you allowed to do *this specific thing*?) often belongs in the service, because it requires business context the gateway doesn't have. "Is this a valid user?" — gateway. "Is this user allowed to delete this specific resource they don't own?" — service. I've seen teams try to push too much authorisation logic into the gateway via Lua scripts or custom plugins. It works until it doesn't, and debugging auth failures in gateway config is miserable.

**Principal Engineer's take:** Gateway-level auth is worth the setup cost even for small teams. The moment you have more than two services, the alternative is maintaining auth logic in N places. The gateway approach also makes it trivially easy to add new services — they inherit auth enforcement by being attached to the Gateway, with no code changes required.

---

## Rate Limiting

Rate limiting at the gateway protects your services from traffic spikes, whether accidental (a client with a runaway retry loop) or intentional (an API abuse attempt).

A basic rate limit in Envoy Gateway:

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: BackendTrafficPolicy
metadata:
  name: rate-limit-policy
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: api-route
  rateLimit:
    type: Global
    global:
      rules:
        - clientSelectors:
            - headers:
                - name: x-user-id
                  type: Distinct   # Per-user limit
          limit:
            requests: 100
            unit: Minute
        - limit:
            requests: 1000         # Overall limit
            unit: Minute
```

This enforces 100 requests per minute per authenticated user, with a global ceiling of 1,000/minute. The request never reaches your service if it's over limit — you get a `429 Too Many Requests` response at the gateway edge.

The things worth knowing before you implement rate limiting:

**Global vs local rate limiting.** Local rate limiting happens per-gateway-instance — which means in a horizontally-scaled deployment, each replica has its own counter, and a client can exceed the "global" limit by a factor equal to your replica count. True global rate limiting requires a shared state store (Redis, typically). Make sure you understand which mode your implementation uses.

**What to limit on.** IP address is the blunt instrument. Authenticated user ID is more precise. API key is useful for B2B scenarios. The right answer depends on your use case — but know that IP-based rate limiting is trivially defeated by a distributed attacker.

---

## Traffic Routing

Routing is the core function of any gateway — deciding which backend service handles which request.

Gateway API's `HTTPRoute` provides four main matching dimensions:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-routing
spec:
  parentRefs:
    - name: platform-gateway
      namespace: platform
  hostnames:
    - api.example.com
  rules:
    # Path-based routing
    - matches:
        - path:
            type: PathPrefix
            value: /v1/users
      backendRefs:
        - name: users-service
          port: 8080

    # Header-based routing (canary / A/B)
    - matches:
        - headers:
            - name: x-canary
              value: "true"
      backendRefs:
        - name: payments-service-v2
          port: 8080

    # Method-based routing
    - matches:
        - method: GET
          path:
            type: PathPrefix
            value: /v1/payments
      backendRefs:
        - name: payments-read-service
          port: 8080
```

**What's new in Gateway API vs Ingress:** Ingress only supported path and hostname matching. Gateway API adds header-based matching, method matching, and query parameter matching natively — no annotations. This makes canary deployments and A/B testing expressible directly in the route spec.

---

## Traffic Management: Canary, Retries, and Timeouts

Beyond basic routing, a mature gateway handles traffic management — controlling how requests are distributed and what happens when things go wrong.

**Traffic splitting** is the foundation of canary deployments:

```yaml
rules:
  - backendRefs:
      - name: payments-service-v1
        port: 8080
        weight: 90
      - name: payments-service-v2
        port: 8080
        weight: 10
```

10% of traffic goes to v2. No service mesh required, no application changes, no custom tooling. This is native Gateway API — any conformant implementation supports it.

**Retries and timeouts** belong at the gateway for external-facing traffic:

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: BackendTrafficPolicy
spec:
  retry:
    numRetries: 3
    retryOn:
      - gateway-error
      - retriable-4xx
    perRetry:
      timeout: "2s"
  timeout:
    request: "10s"
```

**What doesn't belong at the gateway:** Retries between internal services are a different problem — retrying a failed call from service A to service B is the service mesh's territory, because the gateway doesn't see east-west traffic. The gateway handles retries on the external-facing leg; internal resilience is handled closer to the service.

---

## Observability: Logs, Metrics, and Traces

The gateway sees every request. That makes it a natural instrumentation point — and most modern gateways emit useful telemetry with minimal configuration.

**Access logs** at minimum: every request, response code, latency, upstream service, client IP. This is your first line of debugging for "why is this endpoint slow" and "where did that 500 spike come from."

**Metrics** that matter: request rate (RPS per route), error rate (4xx and 5xx, separately), latency percentiles (p50, p95, p99). These should be exported in Prometheus format and scraped by your monitoring stack. Envoy Gateway and most other implementations do this out of the box.

**Distributed tracing**: the gateway generates trace spans and propagates trace context (W3C `traceparent` header, or Zipkin/B3 format) to backend services. If your services are also instrumented, you get end-to-end traces from the gateway through every service a request touches. In 2026, OpenTelemetry is the standard — confirm your gateway implementation supports OTLP export.

Envoy Gateway trace config:

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: EnvoyProxy
spec:
  telemetry:
    tracing:
      samplingRate: 1.0     # 100% sampling — reduce in high-volume production
      provider:
        host: "otel-collector.monitoring.svc"
        port: 4317
        type: OpenTelemetry
```

**Principal Engineer's take:** If you're not getting gateway-level metrics and access logs today, fix that before anything else. The observability blind spot at the network edge is responsible for a disproportionate number of "we had no idea this was happening" incidents. It takes an afternoon to configure; the payoff is immediate.

---

## Protocol Support: WebSocket, gRPC, HTTP/2

This is where Ingress-era gateways have historically been painful and Gateway API is genuinely better.

**WebSocket** requires HTTP connection upgrade — the gateway needs to recognise the upgrade request and hold the connection open rather than treating it like a normal HTTP request. In ingress-nginx, this required an annotation. In Gateway API, it works by default on most implementations, though some require explicit configuration:

```yaml
# Envoy Gateway: explicit WebSocket upgrade
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: HTTPListenerPolicy
spec:
  targetRef:
    name: platform-gateway
  http1:
    enableTrailers: true
  http:
    upgradeConfig:
      - upgradeType: websocket
```

**gRPC** uses HTTP/2 by default. Gateway API has a dedicated `GRPCRoute` resource:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GRPCRoute
metadata:
  name: grpc-route
spec:
  parentRefs:
    - name: platform-gateway
  rules:
    - matches:
        - method:
            service: "payments.PaymentsService"
            method: "ProcessPayment"
      backendRefs:
        - name: payments-grpc-service
          port: 9090
```

No annotations, no workarounds, no ConfigMap side-channels. gRPC service name and method-level routing as a first-class resource.

---

## The Capability Map: Gateway vs Application

Here's how I think about the division of responsibility:

| Capability | Gateway layer | Application layer |
|---|---|---|
| TLS termination | ✓ Always | ✗ |
| JWT / token validation | ✓ Recommended | ✗ Avoid duplication |
| Coarse authorisation (authenticated?) | ✓ | |
| Fine authorisation (can this user do X?) | | ✓ Requires business context |
| Global rate limiting | ✓ | |
| Per-resource rate limiting | | ✓ Sometimes |
| Request routing | ✓ | |
| Traffic splitting / canary | ✓ | |
| Retry on external traffic | ✓ | |
| Retry on internal service calls | | ✓ (or service mesh) |
| Access logging | ✓ | ✓ (application events) |
| Request tracing (span generation) | ✓ | ✓ (propagate context) |
| Protocol translation (HTTP→gRPC) | ✓ Some gateways | |
| Business logic | ✗ | ✓ |
| Data transformation | Limited | ✓ |

The cleaner your gateway's responsibilities, the easier it is to reason about, operate, and debug. Gateways that accumulate business logic become black boxes that nobody wants to touch.

---

## What Ingress Couldn't Do That Gateway API Can

To close the loop with Part 1: most of the capabilities above were technically possible with ingress-nginx, but required controller-specific annotations, Lua scripting, or side-channel ConfigMaps. They were also tied to a single implementation — switch controllers, rewrite everything.

Gateway API standardises these capabilities across implementations. The `HTTPRoute` with traffic weights, the `SecurityPolicy` for JWT, the `BackendTrafficPolicy` for retries — these are spec-defined resources that work (with implementation-specific extensions for advanced cases) across Envoy Gateway, Istio, Kong, and others.

That portability is the underrated win of Gateway API. The capabilities themselves aren't new. Having them expressed as portable Kubernetes resources, with schemas that validate, RBAC that enforces ownership, and tooling that understands the structure — that's what changed.

---

**Next in the series:** Part 3 covers implementation choice — Envoy Gateway, Istio, Cilium, Kong, and Traefik compared with real benchmark data, and a decision framework for picking the right one for your stack.

*Something I got wrong about which layer owns what? Find me on [LinkedIn](https://www.linkedin.com/in/chaitanyamaili/).*
