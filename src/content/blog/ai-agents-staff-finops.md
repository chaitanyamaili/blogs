---
title: "FinOps for Your Own Agents: Budgets Enforced in Code, Not in Dashboards"
description: "Agent loops resend context each step, so cost outgrows the work. Budgets enforced in code and the metric to track: cost per accepted finding. Part 5 of 7."
pubDate: 2026-10-26
tags: ["ai agents", "finops", "cost optimization", "llm", "engineering leadership"]
readingTime: 10
series: "AI Agents for Staff+ Engineers"
seriesPart: 5
draft: true
---

One of the incident reports I found while researching this post describes a four-agent pipeline that looped between an analyzer and a verifier for eleven days before the billing dashboard showed it. The reported damage was $47,000. Another, a public bug report filed on Claude Code's GitHub tracker on 31 December 2025, describes a sub-agent that retried a failing `npm install` verbatim, over 300 identical tool calls and roughly 27 million tokens in about 4.6 hours. The issue was later closed as not planned.

A caution on those: they're mostly self-reported, one catalog notes there's no formal post-mortem for the $47,000 case, and I haven't verified any of them first-hand. I'm using them for the pattern, which is consistent across every account I read. Nothing enforced a cap. Somebody had an alert, and the alert fired after the money was spent.

This is Part 5 of AI Agents for Staff+ Engineers. The earlier parts each ended with a note about what the technique costs. This part pays those notes off. It covers why agent cost grows faster than the work, the controls that stop a bad run, and what to measure so that cost becomes a decision input rather than a surprise.

---

## Where the money goes

The FinOps Foundation's State of FinOps 2026 survey is the most credible source I found on the broader picture. It covered 1,192 practitioners, and 98% of the respondents who answered the AI question said they now manage AI spend, up from 63% in 2025 and 31% in 2024. Note the detail: the 98% is of the 693 people who answered that question, not of the full sample. The report calls AI cost management the single most desired skill set across organizations of all sizes, and lists visibility into AI costs, allocating them to business units and determining AI value as top challenges ([State of FinOps 2026](https://data.finops.org/)).

That tells you the problem is common and badly understood. It doesn't tell you what to do about your own agents. For that you need the arithmetic.

**Agents resend everything.** Each step of an agent loop sends the system prompt, the tool definitions, the task, and the whole conversation so far. The model has no memory between calls, so the context grows with every step and you pay for all of it again each time.

The model here is deliberately simple. These numbers are illustrative, not measurements. Assume a 10,000-token starting context, and each step adds 3,000 tokens of tool output and reasoning:

```python
def total_input_tokens(steps: int, base: int = 10_000, growth: int = 3_000) -> int:
    # step i sends base + growth*(i-1) tokens; sum over i = 1..steps
    return steps * base + growth * steps * (steps - 1) // 2

print(total_input_tokens(20))  # 20 steps ->   770,000
print(total_input_tokens(40))  # 40 steps -> 2,740,000
```

Doubling the steps from 20 to 40 more than triples the input tokens (about 3.6x). This is the superlinear shape the FinOps sources describe, and it's why "just let it run a few more rounds" is more expensive than it feels. Measure your own runs rather than trusting a quoted multiplier, since the figures in circulation come mostly from vendor blogs.

> **Principal Engineer's take:** The unit that matters isn't cost per token or even cost per call. It's cost per completed task, which includes every retry, every loop round and every step an agent took that you threw away. A cheap model that takes 40 steps can cost more than an expensive one that takes 8. If you're only watching the per-token price, you're optimizing the wrong number.

---

## The levers, and how much to believe about each

Most cost advice reduces to four levers. The savings figures you'll see quoted are mostly from blogs and vendors, so I'm giving you the mechanism and a confidence level instead of a headline percentage.

**Prompt caching.** Because agents resend a large, mostly identical prefix, caching it is the biggest structural win. Per Anthropic's docs, cache reads cost 0.1 times the base input price for most models and less for some newer ones. A write costs 1.25 times for the 5-minute cache and 2 times for the 1-hour cache. OpenAI's discount varies by model. Output tokens aren't discounted. The practical rule is to put static content first (system prompt, tool schemas, the design document) and variable content last, because cache hits depend on a stable prefix. Pricing and cache lifetimes change often. Check the providers' pricing pages for current numbers before you build a budget on them.

**Model routing.** Send simple steps (classification, extraction, format checks) to a cheap model and escalate to a stronger one on low confidence or hard steps. List prices differ widely across model tiers, so routing is probably the largest single lever. It also has a cost I rarely see mentioned: you now need an evaluation to know the cheap model is good enough for each step, or you save money and quietly lose quality.

**Pruning context.** Stale tool results sitting in the conversation get resent every step. Dropping or summarizing them cuts input tokens directly. Pruning also risks removing something the agent needed, so treat it as something to test.

**Capping steps and time.** The cheapest token is the one never sent. A hard ceiling on turns, recursion depth and wall-clock time bounds the worst case.

---

## Alerts tell you what already happened

The strongest point in the incident write-ups is the distinction between an alert and an enforcement. A dashboard alert fires after the calls were made and billed. A budget guard that runs before each call and refuses it is the only thing that stops a loop mid-flight.

This guard wraps the model call from the adversarial loop in Part 4. The prices are parameters you fill in from your provider's current rates. I haven't run this against a real model.

```python
import time
from collections import deque

class BudgetExceeded(Exception):
    pass

class Budget:
    def __init__(self, max_usd: float, max_tokens: int, max_seconds: float,
                 max_depth: int, max_tokens_per_min: int,
                 price_in_per_mtok: float, price_out_per_mtok: float):
        self.max_usd, self.max_tokens = max_usd, max_tokens
        self.deadline = time.monotonic() + max_seconds
        self.max_depth, self.max_rate = max_depth, max_tokens_per_min
        self.p_in, self.p_out = price_in_per_mtok, price_out_per_mtok
        self.usd = 0.0
        self.tokens = 0
        self.recent = deque()            # (timestamp, tokens) for the rate breaker
        self.seen_calls: dict[str, int] = {}

    def check_before(self, depth: int, call_signature: str, est_tokens: int):
        """Runs BEFORE the model call. Refusing here is what stops the spend."""
        if time.monotonic() > self.deadline:
            raise BudgetExceeded("wall-clock limit")
        if depth > self.max_depth:
            raise BudgetExceeded("recursion depth limit")
        if self.tokens + est_tokens > self.max_tokens:
            raise BudgetExceeded("token ceiling")
        if self.usd >= self.max_usd:
            raise BudgetExceeded("dollar ceiling")
        # Identical call repeated: the classic retry-the-same-thing loop.
        n = self.seen_calls.get(call_signature, 0) + 1
        self.seen_calls[call_signature] = n
        if n > 3:
            raise BudgetExceeded("identical call repeated 3+ times")
        now = time.monotonic()
        while self.recent and now - self.recent[0][0] > 60:
            self.recent.popleft()
        if sum(t for _, t in self.recent) + est_tokens > self.max_rate:
            raise BudgetExceeded("token spend rate breaker")

    def record(self, tokens_in: int, tokens_out: int):
        """Runs AFTER the call with the provider's reported usage."""
        self.tokens += tokens_in + tokens_out
        self.usd += (tokens_in * self.p_in + tokens_out * self.p_out) / 1_000_000
        self.recent.append((time.monotonic(), tokens_in + tokens_out))
```

Here is the wiring. Every model call in the Part 4 loop goes through one function that checks first and records afterwards:

```python
def guarded_call(budget: Budget, role: str, prompt: str, depth: int = 0) -> str:
    est_in = len(prompt) // 4  # rough estimate; use your provider's token counter
    budget.check_before(depth, f"{role}:{hash(prompt)}", est_in)
    text, used = call_model(role, prompt)  # call_model from Part 4
    # call_model returns total tokens here; split into input and output
    # using the provider's reported usage fields if you have them.
    budget.record(tokens_in=est_in, tokens_out=max(used - est_in, 0))
    return text
```

In `run_loop`, replace each `call_model(...)` with `guarded_call(budget, ...)` and catch `BudgetExceeded` to return whatever findings exist so far, along with the reason it stopped.

Five checks, each matching an incident pattern: a dollar and token ceiling, a wall-clock limit, a depth limit for agents that spawn agents, a repeated-identical-call detector for the verbatim-retry loop, and a rate breaker that catches a fast burn in about a minute where an absolute ceiling would only trip at the end. When any trips, the right response is to stop and page a human. Don't have the agent retry the same call with a smaller prompt.

Two more points. Give each agent or workflow its own budget and its own API key if your provider supports it. One reported weakness of provider-level spending limits is that a single shared key lets one runaway agent drain everyone's budget. And treat a provider's monthly cap as a backstop, not the control.

> **Principal Engineer's take:** If your agent setup has no code path that can say "no" before spending money, you have cost observation, not cost control. Observation is useful for learning and useless for the 3am run that's burning through a month's budget. I'd put the guard in before I wrote the second prompt.

---

## Measure the thing you're deciding about

Cost dashboards that show spend by model are the easy part and the least useful. These are the metrics to track instead.

| Metric | Why it matters | How to get it |
|---|---|---|
| Cost per completed task | The real unit, includes retries and dead ends | Sum `Budget.usd` per run, divide by accepted outputs |
| Cost per accepted finding | Ties spend to value for loops and reviews (Parts 3 and 4) | Cost of run divided by findings a human acted on |
| Steps per task, and its trend | Rising steps with flat output signals context bloat or a looping prompt | Count calls per run |
| Cache hit rate | Tells you if prompt ordering is wasting the prefix | Provider usage fields |
| Share of runs hitting a guard | A guard that never trips is too loose, one that trips constantly is too tight | Count `BudgetExceeded` by reason |
| Review time per agent artifact | The hidden cost from Part 2: human hours dwarf token cost | Track reviewer time on agent PRs |

That last row deserves emphasis. Every number above is a machine cost. In Part 2 the data pointed to review time as the real bottleneck, and a senior engineer's hour almost certainly costs more than the tokens that produced the thing they're reading. A cost model that counts tokens and ignores review hours will conclude that more agent output is always cheaper. I'd rather include a rough human-hours estimate, even a crude one, than present a spend figure that flatters the agents.

`[YOUR STORY HERE: your own first surprise bill or near-miss with an agent, if you have one. What ran, what did it cost, what did you notice first, and what guard did you add afterwards? If you don't have one, say what you currently do to cap spend. A candid "I don't measure this yet" is also a fine and useful thing to write.]`

---

## A budget conversation you can have with a manager

FinOps practice is to cap each workload at expected volume times measured per-task cost times a headroom factor of two to three. It's a sound default, with one catch: "measured" means you ran it a few dozen times and wrote the numbers down. If you can't give your manager a per-task cost and a rough monthly figure with a range, you can't defend the line item when someone asks.

Bring three things to that conversation: the cost per accepted output from your own runs, the guard configuration that bounds the worst case, and a plain statement of the review hours the agent work creates. The last one is the one that makes the conversation credible. State what you saved and what it displaced.

Staff+ engineers have an unusual position on AI spend: you're often the person who decides which workflows get agents, and you're also the person who can tell whether they're worth it. Don't outsource that judgement to a vendor's savings calculator. A model that saves 70% of a number nobody measured hasn't saved anything.

---

Next in the series: Part 6, **Encoding Your Judgment**. How to turn what you know into something a team can reuse: context files, ADR and RFC templates, review skills and agent job descriptions. I'll use practitioner patterns from Addy Osmani and others, along with the research that complicates them, and cover the part that gets skipped: how to keep those instructions from going stale and how to tell if they're working.

*Questions or pushback? Find me on [LinkedIn](https://www.linkedin.com/in/chaitanyamaili/).*
