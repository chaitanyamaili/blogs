---
title: "The Ingress Problem: Why Kubernetes Needed a New API Gateway"
description: "Why the Ingress resource was always a temporary fix, what broke at scale, and why the March 2026 EOL of ingress-nginx is the forcing function you can't ignore. Part 1 of Kubernetes API Gateway in Production."
pubDate: 2026-07-06
tags: ["kubernetes", "api gateway", "platform engineering", "cloud-native", "networking"]
readingTime: 10
series: "Kubernetes API Gateway in Production"
seriesPart: 1
---

The email landed in our platform team's inbox on a Tuesday afternoon. Subject line: "ingress-nginx EOL — action required." I'd seen the discussions in Slack for months, but seeing it framed as an action item with a hard deadline made it real in a way the GitHub issues hadn't.

March 31, 2026. After that date: no security patches, no bug fixes, no compatibility guarantees with newer Kubernetes releases. We had six clusters running ingress-nginx, somewhere around 200 Ingress resources across them, and a team that had spent two years learning its quirks. And now we had a deadline.

I spent the next week going deep on Kubernetes Gateway API — the thing we were supposed to migrate to. What I found wasn't just a replacement for Ingress. It was a rethink of a design that had been quietly accumulating technical debt since Kubernetes 1.1.

This is Part 1 of Kubernetes API Gateway in Production. Before we can talk about Gateway API, we need to understand what was wrong with Ingress — not in the abstract, but concretely, in the ways that manifest as real operational problems.

---

## What Ingress Was Actually Designed For

Kubernetes Ingress was introduced in Kubernetes 1.1, in 2015. The goal was modest: provide a way to expose HTTP and HTTPS services to external traffic, with basic routing by hostname and path.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app
spec:
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-app-service
                port:
                  number: 80
```

That's the canonical Ingress. It's clean. It answers a real question: "how do I get external HTTP traffic to my service?" And for 2015-era Kubernetes usage — a handful of services, one team, one cluster — it was fine.

The problem is that "fine for 2015" held on as the default for a decade, while the things teams were trying to do with Kubernetes became dramatically more complex.

---

## The Annotation Problem

By the time most teams reach production scale, their Ingress resources stop looking like the canonical example. They look more like this:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: payments-api
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "120"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "10"
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-origin: "https://app.example.com"
    nginx.ingress.kubernetes.io/auth-url: "https://auth.example.com/validate"
    nginx.ingress.kubernetes.io/auth-signin: "https://auth.example.com/login"
    nginx.ingress.kubernetes.io/configuration-snippet: |
      more_set_headers "X-Frame-Options: DENY";
      more_set_headers "X-Content-Type-Options: nosniff";
spec:
  ingressClassName: nginx
  rules:
    - host: payments.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: payments-service
                port:
                  number: 8080
```

This is annotation sprawl — and it's not a team discipline problem, it's a design problem. The Ingress spec deliberately left advanced capabilities out of the standard resource, pushing them into controller-specific annotations. The result: every feature beyond basic routing lives in a string inside a metadata block, with no schema, no validation, and no portability.

What happens in practice:

**No schema validation.** A typo in an annotation key silently fails. `nginx.ingress.kubernetes.io/rate-limt: "100"` (note the missing `i`) does nothing. No error, no warning, just your rate limiting mysteriously not working in production.

**Zero portability.** Those annotations are specific to ingress-nginx. If you switch to Traefik, Contour, or any other controller, every annotation needs to be rewritten from scratch. I've seen this trip teams up during cloud provider migrations when they assumed their Ingress YAML would just work.

**No ownership model.** The Ingress resource is typically owned by whoever has permissions to modify it — often the platform team. But the annotations that control application-level behaviour (CORS, timeouts, auth) are mixed in the same resource as infrastructure-level configuration (TLS, ingress class). There's no way to say "app teams can modify these settings; platform teams own those."

**`configuration-snippet` is a security hole.** The `configuration-snippet` annotation lets you inject raw nginx config. It's powerful and frequently necessary — and it means any team with Ingress write access can inject arbitrary nginx directives into the configuration of your shared ingress controller. Several CVEs in ingress-nginx have been exploited through this surface.

**Principal Engineer's take:** The annotation model isn't a quirk to work around — it's a symptom of a design that tried to be extensible without actually designing for extensibility. The right solution was always to extend the API itself, not to bolt configuration onto metadata strings. Gateway API does this. Ingress never could.

---

## The Protocol Problem

Ingress only speaks HTTP and HTTPS. That's it.

In 2015, that was fine. By 2020, teams were running gRPC services, WebSocket-heavy applications, and TCP-based databases inside Kubernetes. Getting any of that to work through Ingress required either controller-specific workarounds or running a completely separate load balancer for non-HTTP traffic.

The ingress-nginx workaround for TCP looks like this:

```yaml
# ConfigMap required in the ingress-nginx namespace
apiVersion: v1
kind: ConfigMap
metadata:
  name: tcp-services
  namespace: ingress-nginx
data:
  9000: "default/my-tcp-service:9000"
```

Plus a command-line argument change to the controller, plus a Service update to expose the port. It works, but it's fragile — the ConfigMap is global, so any team that needs TCP exposure is touching shared infrastructure. And there's nothing in the Ingress spec for any of this; it's all side-channel configuration.

Gateway API handles this natively with dedicated route types: `HTTPRoute`, `GRPCRoute`, `TCPRoute`, `UDPRoute`, `TLSRoute`. Each has a proper schema. Each can be managed independently. No workarounds required.

---

## The Multi-Tenancy Problem

Here's a scenario I've seen play out multiple times: a platform team runs a shared ingress controller. Multiple application teams create Ingress resources. One team's misconfigured annotation causes the controller to reload with invalid config. Everything goes down.

This happens because the Ingress model has no real isolation between tenants. You can use RBAC to control who can create Ingress resources, but you can't cleanly separate "this team can manage routing for their services" from "this team cannot affect the shared controller configuration."

There's also no hierarchical ownership. A platform team can't say: "here is a Gateway that listens on port 443 with a specific TLS certificate, and application teams can attach routes to it, but they cannot modify the Gateway itself." In Ingress, the resource that handles entry-point configuration and the resource that handles routing rules are the same resource.

For a team running one application, this doesn't matter. For a platform team supporting fifty teams, it's a fundamental design limitation.

---

## March 2026: The Forcing Function

Kubernetes ingress-nginx (the community controller maintained under kubernetes/ingress-nginx) announced its retirement timeline in late 2025. Best-effort maintenance through March 31, 2026 — then no further releases, no security patches, no bug fixes, no compatibility updates as Kubernetes itself continues to evolve.

This matters more than the typical "project going into maintenance mode" announcement for a few reasons:

**ingress-nginx is everywhere.** It's the default Ingress controller for many Kubernetes distributions, the one most tutorials point to, and the one most teams adopted when they first set up a cluster. The blast radius of this EOL is significant.

**"Best-effort maintenance" already means reduced attention.** If you're still running ingress-nginx today, you're already downstream of a project whose maintainers are winding down active development. Security vulnerabilities discovered after EOL simply won't be fixed.

**The alternative exists and is mature.** This isn't a case where teams are being asked to move to something experimental. Kubernetes Gateway API graduated to GA in 2024. Major implementations — Istio, Envoy Gateway, Cilium, Kong — are all production-ready in 2026. The migration path exists. The tooling (ingress2gateway CLI) exists. There's no good reason to stay on ingress-nginx beyond inertia.

**Principal Engineer's take:** In my experience, EOL dates for infrastructure components are the only deadlines that force teams to actually do migration work they've been deferring. The teams I've seen stay current on their infrastructure are the ones who treat vendor EOL timelines as hard dates, not suggestions. If you haven't started your ingress-nginx migration, the time is now — not because Gateway API is perfect, but because continuing to accumulate dependency on an unmaintained security-critical component is a risk you're choosing to carry.

---

## Why Gateway API Is a Rethink, Not a Replacement

It would be easy to look at Gateway API and read it as "Ingress, but better." That framing undersells what changed.

The core insight of Gateway API is that HTTP routing in Kubernetes involves multiple stakeholders with different concerns and different ownership boundaries:

- **Infrastructure providers** (cloud vendors, CNI plugins) define what kinds of gateways are available — this is `GatewayClass`
- **Platform/cluster operators** configure the actual entry points — this is `Gateway`  
- **Application teams** configure routing rules for their services — this is `HTTPRoute`, `GRPCRoute`, etc.

These are separate resources with separate RBAC controls. A platform team can create a Gateway and give application teams permission to attach routes to it — without giving them permission to modify the Gateway itself. An application team can manage their own HTTPRoute without touching anything else.

```yaml
# Platform team owns this
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: platform-gateway
  namespace: platform
spec:
  gatewayClassName: nginx
  listeners:
    - name: https
      port: 443
      protocol: HTTPS
      tls:
        certificateRefs:
          - name: platform-tls
      allowedRoutes:
        namespaces:
          from: All  # Allow routes from any namespace
---
# App team owns this, in their own namespace
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: payments-route
  namespace: payments-team
spec:
  parentRefs:
    - name: platform-gateway
      namespace: platform
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
```

The Gateway belongs to the platform namespace. The HTTPRoute belongs to the payments-team namespace. The RBAC for each is independent. Neither team can accidentally affect the other's configuration.

This is what clean multi-tenancy looks like.

---

## The Migration Path

If you're running ingress-nginx today, the migration is not a flip-a-switch operation — but it's not as painful as it sounds, either.

The `ingress2gateway` CLI (a CNCF project that hit 1.0 in March 2026) converts Ingress YAML to Gateway API YAML:

```bash
# Install
go install sigs.k8s.io/ingress2gateway@latest

# Convert
ingress2gateway print \
  --input-file ingress.yaml \
  --provider nginx \
  > gateway-resources.yaml
```

It handles the common cases well. What it can't do: translate controller-specific annotations that have no Gateway API equivalent, handle `configuration-snippet` content, or make decisions about Gateway ownership boundaries that depend on your team structure.

The recommended approach: run Ingress and Gateway API side-by-side during the transition. Most controllers support both APIs simultaneously. Start with low-traffic services, verify the Gateway routing matches the Ingress behaviour, then cut over. Don't try to migrate everything at once.

We'll go deep on the migration process — including the cert-manager quirks, WebSocket gotchas, and annotation translation decisions — in Part 7 of this series.

---

**Next in the series:** Part 2 covers what an API gateway actually does — TLS termination, auth, rate limiting, traffic routing, observability — so you have a clear capability map before we get into the implementation decisions.

*Something I got wrong, or a different migration experience? Find me on [LinkedIn](https://www.linkedin.com/in/chaitanyamaili/).*
