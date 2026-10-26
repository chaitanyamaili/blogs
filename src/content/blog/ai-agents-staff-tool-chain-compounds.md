---
title: "Building a Tool Chain That Compounds: What Actually Separates the Engineers Pulling Ahead"
description: "Everyone has the same agents. What a durable edge looks like, which tool-chain layers earn their place, and how to measure your own progress. Part 7 of 7."
pubDate: 2026-10-26
tags: ["ai agents", "staff engineer", "productivity", "engineering leadership", "career"]
readingTime: 11
series: "AI Agents for Staff+ Engineers"
seriesPart: 7
draft: true
---

In 2025, METR ran a randomized trial with 16 experienced open-source developers working on 246 real issues in repositories they knew well. The developers expected AI tools to make them about 24% faster. Afterwards they still believed it had made them about 20% faster. The measured result was that the tasks took 19% longer when AI was allowed.

I want to be careful with that number, because it gets misused in both directions. It's a small study. The tools were early-2025 versions of Cursor with Claude 3.5 and 3.7 Sonnet. METR itself now labels the result as out of date. In February 2026 it reported a follow-up with 57 developers and 800+ tasks. Returning developers showed an estimated speedup of 18% (confidence interval from a 38% speedup to a 9% slowdown) and new recruits 4%, but METR called this only very weak evidence. Selection effects, such as developers refusing to work without AI, and tasks they withheld, probably bias the estimate, so METR is redesigning the experiment. The 2025 result does not show that AI slows everyone down today, and the follow-up doesn't settle how much it speeds anyone up.

What the 2025 trial does show is something I find harder to dismiss: the people in it couldn't tell. Their sense of being faster was wrong in the direction of flattery. That matters for this final part of AI Agents for Staff+ Engineers, because the question most readers bring to this topic is how to use these tools, or a chain of them, to get ahead of everyone else. Before any chain, you need a way of knowing whether you're ahead, and your own impression isn't it.

---

## The answer to "beat everyone"

I'll state my position and then defend it. I don't think there's a tool chain that reliably puts you ahead of other engineers, and I think looking for one is a mistake. There are three reasons.

**The tools are a commodity.** Everyone gets the same models at the same prices. Whatever speed-up comes from raw generation is available to the person in the next seat, and to your competitors' engineers. An edge that anyone can buy for the cost of a subscription isn't an edge for long.

**Output isn't the scoreboard.** In the Harvard working paper from Part 2, firms adopting coding agents saw about 30% more code per engineer and no measurable rise in resolved issues, with review taking 49% longer. It's one unreviewed paper and I'd hold it loosely, but its direction matches the GitLab survey, where 85% of respondents said the bottleneck moved from writing code to reviewing it. If you win the race by generating more, you may just be building the queue faster than anyone can clear it.

**Longer chains cost more and fail more.** Part 4 covered how debate between agents can converge on shared errors. Part 5 covered how agent cost grows faster than the number of steps. The production guidance I read says the same thing in a line: start with the simplest thing that works, and add agents only when separate domains, tool overload or independent validation demand it. Multi-agent designs add coordination, latency, token use and failure points.

So "beat everyone" is the wrong frame. A better question is what makes your own judgment and output reliably better than they were last quarter, which is something you can measure.

> **Principal Engineer's take:** The competitive framing pushes you toward visible activity: more agents, more parallel runs, more generated code. The people I'd bet on are doing something less photogenic, which is getting better at specifying, checking and deciding. If you're racing, race yourself on outcomes: fewer escaped defects, faster time to a merged change that stays merged, and less rework.

---

## What the practitioners who seem to do this well have in common

I read a range of public accounts for this series: Simon Willison's agentic engineering patterns, Addy Osmani's workflow and parallel-agent writing, Kent Beck's "augmented coding", Martin Fowler's commentary, and a handful of staff-engineer workflow posts. They don't agree on everything. They converge on a short list.

| Practice | Who says it | What it guards against |
|---|---|---|
| Spec and plan before code, kept small | Osmani, citing Les Orchard ("waterfall in 15 minutes") | Agents solving the wrong problem fluently |
| Small, committed steps | Osmani | Large unreviewable diffs, unrecoverable mistakes |
| Tests as the guardrail | Willison (test-first, then run the code), Beck (deleted or disabled tests are a warning sign) | Regressions, and agents "passing" by deleting tests |
| Never assume code works until it has run | Willison | Plausible-looking broken output |
| Context files kept short and non-obvious | Practitioner guides, and the ETH study | Token cost with no gain |
| Isolation for parallel work (worktrees) | Osmani, multiple guides | Agents overwriting each other |
| Human accountability for everything shipped | Osmani | Rubber-stamping |

Notice what's missing from that list: nothing about the number of agents or the sophistication of the orchestration. The shared habits are specifying, constraining and verifying, which is the same shift Part 1 described.

Two cautions on this evidence. First, it's nearly all self-reported by prominent practitioners who like these tools, which is survivorship bias by construction: you read the people for whom it works. Second, none of it is a controlled comparison of these workflows against alternatives. I trust it as a description of what experienced people do. I don't trust it as proof that doing the same will make you better.

Martin Fowler's May 2026 notes quote Ian Johnson, who ran with auto-approve off for about two months and concluded he was doing most of the thinking and half the typing. He later moved to an "on-the-loop" approach once tests, static analysis and architectural patterns were in place. Beck draws a similar line between vibe coding and what he calls augmented coding: in the latter "you care about the code, its complexity, the tests, & their coverage." I find that more interesting than most of the productivity claims. It suggests the realistic gain for careful work may be much smaller than the headline, and that this is fine.

---

## A stack that earns its place

Build the chain one layer at a time, and give each layer a test. The rule is that a layer stays only if it catches or saves something the previous stage didn't, at a cost you can justify.

1. **One agent, a clear spec, and tests.** This covers most of the value. Write the acceptance criteria before the prompt (Part 1), and make sure there's a test the agent can run.
2. **A deterministic verification step.** Linters, type checks, the test suite, schema validation. These are the "hands" from Part 1. They're cheap, they don't hallucinate, and they should gate everything after them.
3. **Risk-routed review** (Part 2). Tier changes by blast radius, enforce it in CI, and keep a named human on the consequential ones.
4. **A short, tested context file or skill** (Part 6), only for things the agent can't discover, with an ablation showing it helps.
5. **A budget guard** (Part 5) before you scale anything. A cap that refuses a call is the control. An alert isn't.
6. **Isolation, then parallelism, if the work decomposes.** Git worktrees are the baseline. Practical ranges from the sources run from 3 to 5 agents (Osmani's "sweet spot") up to 3 to 8 parallel features in a tool like Conductor. I couldn't verify any controlled speedup figure for parallel agents, so I'd budget for coordination overhead instead of assuming a multiplier. Osmani's warning is the useful part: ambiguous requirements propagate through parallel runs, each going slightly wrong in a slightly different direction. Parallelism multiplies whatever your spec quality already is.
7. **An adversarial second agent** (Part 4), only for expensive-to-reverse decisions, with falsifiable attacks and a hard stop.

Theatre is easy to spot against that list. Chains of five agents with no deterministic checker at the end. Agent personas with grand titles and no distinct information or objective. Auto-generated context files. Switching tools every time a benchmark moves. Dashboards of tokens burned and PRs opened, which measure activity. If a stage can't say what it catches that the stage before it missed, remove it.

`[YOUR STORY HERE: your own actual chain today, from what you open in the morning to what has to pass before you merge. Which layer would you cut first, and which one saved you something you can point to? If you've added a stage that turned out to be theatre, say so. That's the most useful paragraph in this series.]`

---

## What compounds, and what doesn't

Some assets get more valuable the longer you keep them. Others expire with the next model release.

**What compounds.** Your ability to write a testable definition of done. A library of fixtures from real past problems, which you can use to test any new tool or prompt. A set of rules derived from incidents (Part 6). Working examples you can hand an agent to combine, which is Willison's habit of hoarding things you know how to do. A track record of decisions you can review. A reputation for catching what others miss.

**What doesn't.** Prompt tricks tied to a particular model's quirks. Elaborate orchestration glued to one framework's API. Your familiarity with one vendor's interface. These aren't worthless, but treat them as depreciating assets and don't build your identity on them.

Start with the fixtures, because they pay twice. They test your agent setup now, and they test the next tool when it arrives. Without them every new release is a vibe check.

---

## The risk nobody wants to hear: your own skills

If you hand off enough, what happens to the thing you're relying on? The best evidence I found is an Anthropic randomized trial from January 2026 ([Shen and Tamkin, arXiv 2601.20245](https://arxiv.org/html/2601.20245v2)). It had 52 developers, all with over a year of Python experience and more than half with seven or more years, learn an unfamiliar async library (Trio) in 35 minutes, half with AI help and half coding by hand. On a 27-point quiz taken without AI, the AI group scored about 17% lower (a 4.15-point gap). The largest gap was on debugging questions, and AI gave no significant speedup. The authors attribute part of this to the control group hitting more errors and having to work through them: a median of three per session against one.

The limits matter. These were people learning an unfamiliar library in a short session, not experienced engineers working in a codebase they know. The result doesn't say that your skills are eroding. The paper also found that some ways of using AI, which involve staying cognitively engaged by asking for explanations or posing conceptual questions, preserved learning. I'd take that as the actionable part.

I don't have a clean answer to whether a Staff+ engineer's judgment atrophies under heavy delegation. I suspect it depends on whether you stay in the loop on the hard parts, and I'd rather treat it as a live risk than assume it away. The practical response is cheap: keep doing some of the hard diagnosis yourself, ask the agent to explain rather than just do, and occasionally debug something without it to find out whether you still can.

> **Principal Engineer's take:** The engineers I'd worry about aren't the ones who use agents too little. They're the ones whose verification has quietly turned into approval. If you can no longer tell when the agent is wrong, you've lost the one skill that made delegating safe. Protect it deliberately, the way you'd protect any capability you can't afford to lose.

---

## Measure yourself, because your impression isn't data

Given the METR gap between felt and measured speed, I'd run a small self-experiment instead of trusting a feeling. The method borrows the trial's design: randomize which tasks you do with and without the tool, and log what happens. It's an experiment with one subject, so it's noisy, and you shouldn't over-read a few weeks of it. It still beats an impression.

```python
import csv
import random
import time
from datetime import date

LOG = "ai_self_experiment.csv"

def assign(task_id: str) -> str:
    """Coin flip, decided before you look at the task in detail."""
    return random.choice(["with_agent", "without_agent"])

def log(task_id: str, arm: str, minutes: float, reworked_after_merge: bool,
        review_comments: int, est_usd: float):
    with open(LOG, "a", newline="") as f:
        csv.writer(f).writerow(
            [date.today(), task_id, arm, round(minutes, 1),
             int(reworked_after_merge), review_comments, est_usd]
        )

# Usage:
#   arm = assign("PROJ-123")
#   start = time.monotonic()
#   ... do the work in that arm ...
#   log("PROJ-123", arm, (time.monotonic() - start) / 60, False, 3, 0.80)
```

Track at least these: time to a merged change, whether it needed rework afterwards, review comments received, estimated agent cost, and, separately, how much of the agent's output you rewrote. Randomizing is the hard part, because in practice you'll want to give the agent the easy tasks and keep the hard ones, which biases the comparison. Flip the coin first and live with it. And randomize only tasks where working without the tool is a reasonable option. After a month, compare the arms. If you can't see a difference, that's a finding too.

---

## Where to start

The tool chain is the most replaceable part of this arrangement. The evidence I could find says the durable difference lies in specification, verification, taste and communication, which were scarce before agents existed and still are. So the first move isn't a tool. Write the spec before the prompt, keep a check that isn't a language model between the agent and your main branch, and measure your own outcomes instead of trusting the feeling of speed.

> **Principal Engineer's take:** If I had to give one instruction to someone starting tomorrow, it would be to pick one task type that's low-risk and repetitive, run it with an agent behind a test and a budget cap for a month, and log the real numbers. A single measured result on your own work will teach you more than any list of tools, including this series.

---

That closes the series. If this was useful, the follow-up I'd want to read is real numbers from running these practices on production work: cost per accepted output, review time, and what the guards caught. If you try the self-experiment or the ablations and get results, send them to me. I'd like to know where I'm wrong.

*Questions or pushback? Find me on [LinkedIn](https://www.linkedin.com/in/chaitanyamaili/).*
