---
title: "Migrating Pantheon's Legacy Filesystem to Cloud-Native Storage"
description: "What we learned leading a large-scale filesystem migration — from legacy storage to a cloud-native architecture — and why the hardest parts had nothing to do with the code."
pubDate: 2025-06-01
tags: ["infrastructure", "cloud-native", "golang", "platform engineering"]
readingTime: 8
---

When I took on the filesystem modernization initiative at Pantheon, the brief was deceptively simple: move from legacy storage to a cloud-native architecture. What followed was one of the most complex, humbling, and ultimately satisfying pieces of work I've done in 15 years of engineering.

This is what I learned.

## Why the legacy system had to go

The existing filesystem had accumulated years of operational complexity. Not because of bad decisions — those choices made complete sense at the time they were made. But legacy systems have a way of becoming load-bearing walls: every workaround added to support them becomes something else that depends on them.

The symptoms were predictable: reliability incidents traced back to the storage layer, on-call pages that required deep institutional knowledge to resolve, and new feature development that was slower than it should have been because of how tightly coupled things had become.

The goal wasn't just "use cloud storage instead." It was to build something that other engineers wouldn't have to think about.

## Starting with discovery, not code

The first instinct on a project like this is to start building. Don't.

We spent the first several weeks doing nothing but understanding the current system. How it was used. What depended on it. Where the edge cases were. What the actual failure modes looked like in production.

This phase felt slow. It wasn't. Every hour spent here saved multiple hours of rework later. We found three integration points that weren't documented anywhere — they only surfaced by reading old incident reports and talking to engineers who'd been at Pantheon long enough to remember why certain decisions were made.

**The lesson:** When you're migrating a system that's already running in production, understanding the thing you're replacing is more important than designing the thing you're building.

## Architecture decisions that mattered

A few choices defined how the migration went:

**Strangler fig over big bang.** We ran old and new storage in parallel for a significant period. New writes went to the new system. Reads checked the new system first, fell back to legacy. This made the migration reversible at every step — which was critical for a system serving live customer traffic.

**Observability first.** Before migrating a single byte, we instrumented both systems exhaustively. We wanted to know the moment anything diverged. This turned out to be essential: we caught three subtle edge cases in the first week of parallel running that would have been very difficult to debug post-migration.

**Go for the implementation.** The migration service itself was written in Go. The concurrency model and the performance characteristics were the right fit for a system doing heavy I/O coordination. Terraform handled the infrastructure side.

## The hardest parts were human, not technical

The technical challenges were real but tractable. The harder problems were coordination and communication.

A migration of this scope touches a lot of people. Other teams have dependencies. Leadership wants progress updates that make sense without a full context transfer. Engineers on your own team need to stay aligned on an approach that evolves as you learn more.

A few things that helped:

- **Weekly written updates** shared broadly, not just to leadership. Not status reports — actual narrative about what we learned that week, what changed, and why.
- **Architecture decision records** for every significant choice. When someone joined the project mid-way or asked "why did you do it this way?", we had an answer that didn't require reconstructing the context from memory.
- **Making the current state visible.** We built a simple dashboard showing migration progress — what percentage of data had moved, current error rates on both systems, comparison charts. People could check it without pinging us.

## What I'd do differently

Be more aggressive about deprecating the legacy path earlier. We kept it running longer than necessary out of caution, which added operational overhead and made the codebase more complex during the transition. Once you have confidence in the new system — and confidence comes from the observability you built — move faster.

Also: write the post-migration runbook before the migration, not after. You'll understand the system better while you're building it than you will six months later.

## The result

The migration meaningfully reduced storage-related incidents and simplified a part of the system that had been a source of operational friction for a long time. More importantly, the new architecture is one that the next engineer on this team can understand, modify, and debug without needing a tribal knowledge download.

That was always the goal.

---

*If you're working on something similar and want to compare notes, I'm always happy to talk through it — find me on [LinkedIn](https://www.linkedin.com/in/chaitanyamaili/).*
