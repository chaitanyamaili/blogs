---
title: "From Task-Doer to System Manager: What Staff+ Engineers Actually Do With AI Agents"
description: "Agents write the first draft. A Staff+ engineer's value shifts to defining done, owning context, routing review and accountability. Part 1 of 7."
pubDate: 2026-10-27
tags: ["ai agents", "staff engineer", "engineering leadership", "llm", "productivity"]
readingTime: 10
series: "AI Agents for Staff+ Engineers"
seriesPart: 1
---

Last weekend I watched an agent rewrite my LinkedIn profile, update my personal site, scaffold this blog, and find a broken Google Analytics script I'd forgotten about for months. Work I'd have spread across a week of evenings took a few focused hours.

The uncomfortable part came afterwards. I didn't have a clear answer to "which of that was my work?" I picked the direction and rejected two drafts of the profile copy. Everything else was typing, and the typing was the part I used to count.

That question is the whole premise of this series. If the first draft is free, a Staff+ engineer's value has to live somewhere other than the first draft. Most of the advice I read on this says "shift from task-doer to system manager" and stops there, which is about as useful as telling a new manager to "focus on people." This part tries to be concrete about what that shift means, and where the popular version of it is wrong.

This is Part 1 of AI Agents for Staff+ Engineers. The later parts get specific: review, failure-mode analysis, adversarial agent loops, cost, and building a tool chain that compounds. First we need a working model of the job.

---

## The pitch, and the number everybody quotes

The standard framing goes like this. Delegate the groundwork to agents: data compilation, first code drafts, research synthesis, formatting, changelogs. Accept that you get about 80% of the way there fast. Spend your own energy on the last 20%: edge cases, tone, exact logic, review.

I think the framing is directionally right and the number is made up.

The 80/20 split is repeated everywhere, and nothing I read while researching this series backs it with data. It's a Pareto-flavoured rule of thumb that has been repeated until it sounds like a measurement. The measurements I did find point somewhere less flattering.

A 2026 Harvard working paper, not yet peer reviewed, studied 718 firms. Engineers at firms that adopted coding agents added roughly 30% more code. Resolved issues per worker barely moved, from a baseline of 3.67 to a gain of 0.12 per worker-month, which the authors couldn't distinguish from zero. The time from opening a pull request to merging it rose 49%, from about 7 days to about 10.5. Pull requests opened rose 23%, and the share sent back with requested changes nearly doubled.

Be careful with a single working paper. Lines of code is a weak proxy, and "more PRs" is not "worse engineering." But the direction matters more than the exact figures. Agents moved the bottleneck. They did not remove it.

Two other numbers temper all of this. In June 2025 Gartner predicted that more than 40% of agentic AI projects will be cancelled by the end of 2027. And on OSWorld 2.0 (108 long computer-use tasks, about 1.6 hours each for a human), the best agent at the June 2026 launch completed 20.6% end to end. Scores have likely moved since, so check the leaderboard before quoting that one. Neither says agents are useless. Both say that "the agent does 80%" depends heavily on which 80% you mean, and on who checks it.

> **Principal Engineer's take:** Treat 80/20 as a hypothesis you test per task type, not a budget you plan around. For some work, say boilerplate, migration scripts and changelogs, the agent really does produce something close to final. For other work, like a design where the hard part is the constraint nobody wrote down, the agent produces a confident draft of the easy 80% and leaves you the hard 20% plus the cost of discovering that it left it to you. Those two situations feel identical at the moment you hit enter.

---

## What "system manager" means when you're not a manager

The phrase is slippery because Staff+ engineers mostly don't manage people. So what do you manage?

I find it more useful to look at what a good engineering manager does that has nothing to do with headcount, and then see what transfers. There are four things.

**You define done before the work starts.** A junior engineer who gets "make the checkout service more resilient" will come back with something. So will an agent. The difference is that the agent will never ask what resilient means. It will pick an interpretation, implement it fluently, and tell you it's finished. Writing acceptance criteria used to be a courtesy. With agents it's the main lever you have.

**You own the context.** An agent knows what you gave it plus whatever it can retrieve. It doesn't know that the platform team is mid-migration off the queue you're designing around, or that finance froze new managed-database spend in Q4. Part of your job becomes curating the package of constraints, conventions and history that goes in with each task, and making that package reusable so you aren't retyping it.

**You decide who checks.** Work doesn't get reviewed because someone feels like reviewing it. It gets reviewed because a process routes it to someone qualified. Once output volume goes up, the routing question is the only one that matters: what gets a human, what gets a second agent, what gets a deterministic check, and what ships on trust.

**You carry the accountability.** The agent has no pager. When the design fails at 3am, "the agent suggested it" is not a postmortem finding. That sounds obvious, and it still changes behaviour. It means you can delegate the work and you cannot delegate the answer to "would I put my name on this?"

None of those four involves typing faster or prompting cleverly. They are all things Staff+ engineers were already supposed to be doing. Agents just remove the cover of "I was busy writing code."

---

## Brains and hands

One of the more durable ideas in agent workflow advice is to separate the planning from the execution of anything that needs to be exactly right.

Language models are good at drafting, summarising, proposing options and noticing patterns. They are unreliable at arithmetic, date logic, counting, and anything where an off-by-one is a real bug. The temptation is to ask the model to do all of it because it will, fluently, and the answer will look right.

The fix is boring. Let the model decide what needs to be computed and then have it call something deterministic to compute it. Here is the shape, in Python:

```python
from datetime import date, timedelta
from typing import Callable

# Deterministic tools: tested, boring, no opinions.
def business_days_between(start: date, end: date) -> int:
    days, d = 0, start
    while d < end:
        if d.weekday() < 5:
            days += 1
        d += timedelta(days=1)
    return days

TOOLS: dict[str, Callable] = {
    "business_days_between": business_days_between,
}

def run_step(model_plan: dict) -> object:
    """The model chooses the tool and arguments. Code does the arithmetic."""
    tool = TOOLS.get(model_plan["tool"])
    if tool is None:
        raise ValueError(f"model asked for unknown tool: {model_plan['tool']!r}")
    return tool(**model_plan["args"])
```

The function matters less than the boundary. Everything on the model's side of the line is allowed to be wrong in ways you'll catch in review. Everything on the code side must be wrong only in ways your tests catch. As a Staff+ engineer you spend a growing share of your time deciding where that line sits for each workflow.

> **Principal Engineer's take:** If a step in your workflow has a correct answer you could write a test for, it shouldn't be a prompt. Every time I see someone asking an LLM to compute a date range or validate a schema, I see the same cause: the prompt was faster to write than the script, and nobody priced in the review cost of checking the output forever. Write the script once.

---

## Delegation is a skill, and most of us are bad at it

A failure I'd expect to be common, and worth checking for on any team, is less the model being wrong than the engineer delegating the way they'd delegate to someone they didn't trust: a one-line prompt, no context, no criteria, then a read of the result with a sinking feeling.

The better pattern looks like working with a capable junior colleague. You talk before you start. You describe the problem, ask what's unclear, push on the plan, and only then let it execute. You write down the conventions once (naming, style, what "done" means) so the next task starts from them. And when the output misses, you ask why it missed and change the instructions, instead of only fixing the output.

That last habit is the one that compounds. Every miss is information about a gap in your instructions, your context, or your acceptance criteria. If you only patch the output, you pay for the same miss next week.

Here is a deliberately small example of a reusable task brief. It isn't clever. It just makes the four responsibilities above visible:

```markdown
## Task
Draft an ADR for replacing the nightly reconciliation job with event-driven sync.

## Done means
- Options: at least three, including "do nothing."
- Each option names its failure modes and who is paged when it fails.
- A recommendation with the single assumption it's most sensitive to.

## Context you must use
- Stack constraints: see /docs/platform-constraints.md
- Q4 constraint: no new managed-database spend
- Platform team is migrating off RabbitMQ; do not propose it.

## Check before returning
- Every claim about our systems cites a file or says "assumed."
- List what you could not determine from the context provided.
```

The last section is the one people skip. An agent that is asked to list what it couldn't determine hands you a map of the remaining 20%. An agent that isn't asked will fill those gaps with plausible fiction.

---

## Where this goes wrong

Better to give you the failure modes now than let the rest of the series read as a sales pitch.

**Fluent wrongness.** Agents are most dangerous where they're most convincing. A design doc that is 90% correct and 10% quietly invented is harder to review than one that is obviously weak, because the polish lowers your guard.

**Review becomes the job, and nobody planned for that.** If output triples and review capacity stays flat, you haven't gained throughput. You've built a queue. Part 2 of this series is about exactly this.

**Context rot.** The instructions you wrote in March describe a system that changed in June. Reusable context is an asset that needs maintenance, like documentation, and teams that treat it as write-once end up with agents confidently following stale rules.

**Losing the muscle.** This is the one I take most seriously and have the least evidence about. If the agent always does the first draft, does your ability to produce one atrophy, and does that erode your ability to judge someone else's? I don't have a clean answer. I suspect the answer is yes for some skills and no for others, and I don't yet know which.

I've made this mistake myself. When I started using AI, I trusted it too much. One day I was writing technical docs with AI bots, and I realized the result had turned into clutter: too many words, and the same content duplicated across the docs. It's a mild version of fluent wrongness: the problem was volume, and an agent never pushes back on volume.

---

## A working definition

So here's the definition I'll use for the rest of the series, stated so you can disagree with it.

A Staff+ engineer using agents well is running a small production system whose output is decisions and artifacts. They set the acceptance criteria, curate the context, decide the routing of review, and own the result. The agents are fast, cheap and unreliable components inside it, and the engineer's job is to make the system as a whole more reliable than any component.

That definition has a consequence I find clarifying. If you're treating agents as components, then the questions you already know how to ask apply: what are the failure modes, how would I detect them, what's the blast radius, what does it cost to run, and who is on call. The rest of this series is those questions, one at a time.

> **Principal Engineer's take:** The people I expect to pull ahead aren't the ones with the most agents. They're the ones who are already good at the unglamorous parts of engineering: writing a testable definition of done, noticing what's missing from a design, saying no to a plausible-looking diff. Agents amplify whatever habits you already have. If your habit is skipping the careful read, you now skip it at three times the volume.

---

Next in the series: Part 2, **The Review Bottleneck**. If agents produce more code than your team can verify, you didn't speed anything up. I'll look at what the data says about where the queue forms, how to route review by risk rather than by line count, and which kinds of work I'd refuse to hand to an agent however good it looks.

*Questions or pushback? Find me on [LinkedIn](https://www.linkedin.com/in/chaitanyamaili/).*
