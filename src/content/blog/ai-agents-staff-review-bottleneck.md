---
title: "The Review Bottleneck: Agents Write More Code, Not More Shipped Software"
description: "Coding agents raise output and slow review. How to route review by risk, make diffs cheap to check, and decide what not to delegate. Part 2 of 7."
pubDate: 2026-10-26
tags: ["ai agents", "code review", "engineering leadership", "governance", "staff engineer"]
readingTime: 10
series: "AI Agents for Staff+ Engineers"
seriesPart: 2
draft: true
---

Here is the most uncomfortable statistic I came across while researching this series: at firms that adopted coding agents, engineers added about 30% more code, and the time from opening a pull request to merging it rose 49%.

That comes from a 2026 Harvard working paper (Chen and Stratton, built on Jellyfish engineering data) covering 718 firms. It isn't peer reviewed, and I'll come back to how much to trust it. But set the exact figures aside and look at the shape. Generation got cheaper. Verification didn't. Somebody now has a bigger pile to check and the same number of hours to check it in.

If you're a Staff+ engineer, that somebody is often you. This is Part 2 of AI Agents for Staff+ Engineers. Part 1 argued that your value moves from writing to defining done, owning context, routing review and carrying accountability. This part is about the third of those, because it's where most teams are quietly losing the gains.

---

## What the numbers say, and how much to trust them

Here is the evidence I found, with my confidence attached.

The Harvard paper (Chen and Stratton) reports roughly 30% more code per engineer at adopting firms, 23% more pull requests, and a near doubling of the share of PRs sent back with requested changes. Resolved issues rose by 0.12 per worker-month on a baseline of 3.67, which the authors treat as statistically indistinguishable from zero. The share of people doing review rose 14% while the share writing code stayed flat. By March 2026, about 80% of the measured firms used AI code review, yet AI left comments on only about 11% of pull requests.

I trust the direction and distrust the precision. It's a working paper, "lines of code" is the weakest productivity proxy there is, and a single dataset can't tell you whether your team looks like those 718 firms.

A GitLab survey (Harris Poll, 1,528 developers and technology buyers) lines up with it from the practitioner side. 85% of respondents agreed AI has moved the bottleneck from writing code to reviewing and validating it. 84% said the biggest challenge is governing AI-generated code after it exists. And 43% said they can't reliably tell AI-written code from human-written code in their own codebase. That last number is the one I'd stare at. If you can't tell which changes came from an agent, you can't apply different scrutiny to them, and you can't measure whether the scrutiny is working.

On quality, an arXiv study of 302.6k AI-authored commits found 484,366 introduced issues. 89.3% were code smells rather than outright bugs, and 22.7% of those issues were still present at the latest revision. So the typical failure isn't a dramatic bug. It's low-grade debt that lands at volume and mostly stays.

One number to ignore: you'll see "741% more code" quoted in coverage of one study. It rests on lines of code, and I wouldn't build an argument on it.

> **Principal Engineer's take:** The data reads less as "agents make teams slower" than as "agents move the constraint", and most teams haven't moved their process with it. Sonar's Tom Howlett puts it concretely: if developers generate 50 times more code but keep the same review process, review time becomes the bottleneck. If you triple what goes in and don't change how you check it, you get a queue, and queues turn into rubber stamps.

---

## Why review gets slower, not just bigger

It's tempting to say review takes longer simply because there's more of it. I think there are at least three separate reasons, and they need different fixes.

**Volume.** More PRs, same reviewers. The cure is routing, covered below.

**Size and legibility.** An agent will happily produce a 1,200-line diff touching nine files because nothing stops it. A human author feels the pain of assembling that PR and tends to split it. The agent feels nothing. Large diffs are harder to review well, so reviewers either skim or stall.

**Misplaced trust.** Agent output is fluent and consistent in style, which hides the places it's wrong. A sloppy human PR is often easier to review than a polished agent one, because the sloppiness tells you where to look. Polish removes the signal.

Each of these points to a different intervention. Volume needs routing. Size needs limits at the source. Trust needs better pre-review evidence.

---

## Route review by risk, not by arrival order

The default process in most teams is first in, first out, same bar for everything. With agent volume that breaks, because a typo fix and a change to the payment retry policy both wait in the same line and get the same fifteen minutes.

The alternative is to decide, up front, what a change needs based on what it can break. Here is a tiering table to start from. Treat the thresholds as placeholders to tune against your own incident history:

| Tier | What it covers | Who checks | Example |
|---|---|---|---|
| 0 | Docs, comments, test-only changes, generated files | Automated checks only | Fix README typo, regenerate a client |
| 1 | Contained logic with good tests, no shared interfaces | One reviewer, or an agent pre-review plus a human skim | Add a field to an internal DTO |
| 2 | Shared libraries, public API shapes, data migrations | Named owner of the code, plus an agent-generated blast-radius report | Change a response schema |
| 3 | Auth, payments, data deletion, infra and IAM, anything with money or PII | Two humans including a Staff+, no merge on agent approval alone | Modify retry and idempotency behaviour |

Two points on this. First, the tier is a property of the files and systems touched, not of who or what wrote the change. You want the same bar for a human's auth change and an agent's. Second, the tier should be computed, not self-declared. If the author, human or agent, picks the tier, the incentive is to pick a low one.

Here is a deliberately simple way to compute it. A path-based rules file that a CI step reads:

```yaml
# .github/review-tiers.yml  (consumed by a small CI script)
tiers:
  - tier: 3
    paths:
      - "services/payments/**"
      - "services/auth/**"
      - "infra/iam/**"
      - "**/migrations/**"
  - tier: 2
    paths:
      - "libs/shared/**"
      - "api/**/openapi*.yaml"
  - tier: 0
    paths:
      - "docs/**"
      - "**/*.md"
default_tier: 1
rule: highest_matching_tier_wins
```

```python
import fnmatch
import yaml

def pr_tier(changed_files: list[str], rules_path: str = ".github/review-tiers.yml") -> int:
    rules = yaml.safe_load(open(rules_path))
    highest = rules["default_tier"]
    for tier_rule in rules["tiers"]:
        for path in changed_files:
            if any(fnmatch.fnmatch(path, pat) for pat in tier_rule["paths"]):
                highest = max(highest, tier_rule["tier"])
    return highest
```

It's crude. `fnmatch` doesn't treat `**` the way a glob library would, and a real version should use one. But the principle matters more than the implementation: highest matching tier wins, and the decision is made by a deterministic script that neither the author nor an agent can talk its way around.

> **Principal Engineer's take:** If you take one thing from this post, make the review bar a function of blast radius and enforce it in CI. Everything else, including agent reviewers, is secondary. Teams that skip this step end up relying on reviewers noticing that something is risky, and noticing is exactly what degrades when volume rises.

---

## Make the diff cheap to review

You can't fix review by asking reviewers to try harder. You fix it by changing what lands in front of them. Three practices help.

**Cap the size at the source.** Tell agents, in the standing instructions you wrote once, to split work into reviewable units, and have CI fail PRs above a size you choose. The number is a judgement call. I'd start around 400 changed lines excluding generated files and adjust from there, but I don't have evidence that 400 is better than 300 or 600. The point is to have a limit rather than a feeling.

**Require a change summary that can be checked.** Ask the agent to produce, with each PR: what changed, what it deliberately did not change, which assumptions it made, and which files it considers highest risk. Then spot-check the "did not change" and "assumptions" sections, because that's where invented confidence hides. A summary that only says what the diff already shows is worthless. One that names what it skipped is useful.

**Pre-review for blast radius.** Before a human opens a Tier 2 or 3 change, run a pass that answers narrow, checkable questions. What imports or calls the changed symbols? Which services consume the changed schema? Which tests cover the changed paths and which don't? Which files deserve the first twenty minutes? Notice the shape: these are questions with evidence you can verify, not a request for "a review." Dependency lookups are things a deterministic tool can do better than a model, so have the model orchestrate and the tool answer.

---

## Should an agent review the agent's code?

Vendors are pushing hard on AI review, and about 80% of the firms in the Harvard data used it. Yet it commented on only about one PR in ten. One plausible reading is that people are cautious about relying on it, though the data doesn't say why.

My position is that a second model is a useful pre-filter and a bad final authority, for a specific reason. A model reviewing a model's output shares many of its blind spots. Research on multi-agent critique is mixed: debate between agents can beat self-critique on some tasks, but agents also tend to converge politely, reinforcing each other's errors. I'll go deeper on that in Part 4. For now, the practical rule is that an agent reviewer can flag things for a human to look at, but a Tier 3 change doesn't merge because an agent said LGTM.

One caution from my own use: Copilot code review felt like the boy who cried wolf. A pre-filter that flags too much teaches people to stop reading it, and then it isn't filtering anything.

Some teams are doing this at scale. PostHog says its "StampHog" agent gives the final stamp on roughly one in three merged PRs in its main repo ([PostHog newsletter](https://newsletter.posthog.com/p/code-review-tips)). Another PostHog post puts the figure at about 20%, so treat the exact share as approximate. What matters is how it's gated: engineers opt in with a label, a deny-list keeps auth, secrets, billing and public APIs out, diffs must stay under 500 lines and 20 files, and the agent can approve but never merge. They routed by risk, which is the same idea as the table above.

I've hit the problem these gates exist for. In my early days of relying on AI coding through prompts, the code worked, but it wasn't efficient and it didn't cover edge cases. My peer reviews caught many of those gaps, which meant the review went through too many iterations. That is the failure a polished agent change produces: it passes the obvious check, and the cost sits in the cases nobody looked at.

---

## What I wouldn't hand to an agent, however good it looks

This list reflects judgement, not data, so treat it as an opinion to test against your own context.

I wouldn't delegate the decision of what to build or what to defer. An agent can lay out the tradeoffs but it doesn't know your roadmap, your team's capacity, or what leadership will tolerate. I wouldn't delegate sign-off on changes that move money, delete data or change access, because accountability there needs a human name attached. And I wouldn't delegate the first read of a design you will be asked to defend. If you only see the agent's summary, you won't be able to answer the third follow-up question in the room.

What I would delegate aggressively is the groundwork around those decisions: the diff summary, the dependency analysis, the test-gap list, the migration script draft, the changelog. These are the parts where a wrong answer is cheap to catch and a right one saves real hours.

---

## What this costs

Part 5 covers cost properly, but one note belongs here. In a 2026 study of ChatDev (30 tasks, a GPT-5 reasoning model), the iterative code-review phase used 59.4% of all tokens, and input tokens were 53.9% of the total ([Tokenomics, arXiv 2601.14470](https://arxiv.org/abs/2601.14470)). That's a simulation of a multi-agent system, so treat it as directional. It fits the nature of review-style work, though: every pass re-sends the diff and its context. So "just have another agent review it" has a price, and it grows with every round you add. Routing by tier is also a cost control. Spend the expensive passes only where blast radius justifies them.

---

## A starting point for Monday

If you only have an afternoon, do these in order:

1. Pull the last 30 days of merged PRs and count how many you could identify as agent-assisted. If you can't, that's your first finding.
2. Write the four-tier table for your own repo and run it against those 30 PRs. See how many land in each tier.
3. Add the path-based tier check to CI in report-only mode. Don't block anything yet.
4. Pick one Tier 2 change a week and run a blast-radius pre-review on it. Compare what it found to what the human reviewer found.

After a month you'll have your own numbers, which are worth more than the ones I've quoted.

The goal is to spend scarce human attention where it changes outcomes, not to review less. The teams I'd expect to hold up are the ones that treat review capacity as the constraint it is, measure it, and design around it, instead of discovering it after the incident that the rubber stamp let through.

---

Next in the series: Part 3, **Agent-Driven FMEA**. I'll go through how to get an agent to enumerate failure modes for a design, why severity and likelihood scoring should stay in human hands, and a worked Kafka and Postgres checkout example, including the places where the usual advice (Debezium-based outbox, strict read-your-writes) depends on your team's operational maturity.

*Questions or pushback? Find me on [LinkedIn](https://www.linkedin.com/in/chaitanyamaili/).*
