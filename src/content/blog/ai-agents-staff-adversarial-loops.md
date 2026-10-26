---
title: "Adversarial Agent Loops That Actually Disagree: Architect vs Chaos SRE, Without the Politeness"
description: "Two agents arguing often agree and compound errors. How to force falsifiable attacks, cap the cost, and skip the loop when it won't pay. Part 4 of 7."
pubDate: 2026-10-26
tags: ["ai agents", "multi-agent", "system design", "reliability", "llm"]
readingTime: 10
series: "AI Agents for Staff+ Engineers"
seriesPart: 4
draft: true
---

The pitch for adversarial agent loops is seductive. One agent plays the Architect and proposes the design and its mitigations. A second plays a Chaos SRE whose only job is to break them. They go two rounds, and you get a hardened design for the price of some tokens.

I like the shape of it. A single model asked to check its own work tends to defend what it wrote, so a separate critic with a different brief should help. The trouble is that "should" is doing a lot of work, and the research on multi-agent debate is mixed in ways that matter for how you build one.

This is Part 4 of AI Agents for Staff+ Engineers. Part 3 produced a validated list of failure modes with human scoring. This part is about the next step people reach for: pointing a second agent at the mitigations. I'll go through what the research says, the specific ways loops go wrong, a design that forces disagreement, a framework-agnostic implementation, and when to skip the whole thing.

---

## What the research says, which is "it depends"

The early work on multi-agent debate was encouraging. The original "society of minds" paper (Du et al., 2023, [arXiv 2305.14325](https://arxiv.org/abs/2305.14325)) had several instances of the same model propose answers and debate them over rounds. Across six benchmarks (arithmetic, grade-school math, chess move prediction, computer-scientist biographies, MMLU and chess move validity), debate beat zero-shot chain of thought and reflection. In that paper, asking a model to critique itself gave only a modest boost on reasoning tasks and did poorly on factuality tasks, which is the case for bringing in a second voice. The authors also report cases where every agent started with a wrong answer and debate still reached the right one, though they present those as qualitative examples. These are 2023-era models on benchmark tasks, not design review.

Later work is more cautious, and the cautions are the useful part:

- **Sycophancy between agents.** ConsensAgent (ACL Findings 2025) describes agents reinforcing each other's answers instead of engaging critically. That inflates cost, because you need more rounds to reach a consensus that was shallow in the first place ([paper](https://aclanthology.org/2025.findings-acl.1141.pdf)).
- **Errors that spread.** "Talk Isn't Always Cheap" tested mixed-capability groups of small and mid-size models on three benchmarks. It found debate often lowered accuracy, with agents switching from right answers to wrong ones after seeing peers' reasoning. The authors hypothesize that sycophancy is the cause ([paper](https://arxiv.org/html/2509.05396v1)). It's a small study: 100 questions per task, two rounds.
- **Dependence on the starting answers.** One adversarial-debate study found the benefit depends on the quality of the initial responses.

Across these, debate helps when agents really disagree, the task has an answer that can be checked, and the initial proposals are decent. It hurts, or at least wastes money, when the agents are the same model with the same context and a costume. Most of the studies are on reasoning and QA benchmarks, not on architecture review, so applying them to design critique is an extrapolation. I haven't seen a rigorous study of Architect-versus-SRE loops on real systems, and I'd be suspicious of anyone who quotes you a number for it.

> **Principal Engineer's take:** Don't ask "does an adversarial loop work?" Ask "what in my setup makes the second agent's opinion independent of the first?" If the answer is "a different system prompt," you have one opinion twice. Independence has to come from somewhere real: different information, a different objective, a different model, or a checker that isn't a language model at all.

---

## Five ways these loops go wrong

Knowing the failure modes is most of the design, so here they are.

**1. Polite convergence.** The critic raises a concern, the architect says "good point, here's a mitigation," the critic says "that addresses it." Two rounds later you have a consensus and no evidence that anything was tested.

**2. Straw-man attacks.** A critic told to "find problems" finds problems that sound dramatic and don't follow from the design. This is the extrapolation problem from Part 3 again, now with a second model adding its own.

**3. The defender rewrites the goalposts.** When attacked, the architect quietly changes the design or its assumptions, and the critique then applies to a system that no longer matches the document. By round two, nobody remembers what was originally proposed.

**4. Gaming the evaluator.** Kent Beck lists "any indication that the genie was cheating, for example by disabling or deleting tests" among his warning signs that an agent has gone off track ([Beck, Augmented Coding: Beyond the Vibes](https://newsletter.kentbeck.com/p/augmented-coding-beyond-the-vibes)), and the Pragmatic Engineer's write-up of an interview with him says he has trouble stopping agents from doing it ([Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/tdd-ai-agents-and-coding-with-kent)). The loop equivalent is a defender that satisfies the critic's wording rather than the underlying risk. If "convince the critic" is the objective, convincing is what you'll get.

**5. Runaway cost.** Every round re-sends the design, the environment details and the whole conversation so far. Cost grows faster than the number of rounds, and more rounds are exactly what sycophancy produces.

---

## A design that forces disagreement

These constraints go on the loop. Each one targets one of the failures above.

**Make attacks falsifiable.** The critic may not say "this could cause a deadlock." It must produce a concrete scenario: preconditions, a numbered sequence of events, and the observable bad outcome. "Network partition X occurs while database Y is electing a new primary, the circuit breaker trips, and requests queue behind a held lock" is checkable against the design. "There might be concurrency issues" isn't.

**Make every attack cite the design.** Same rule as the `evidence` field in Part 3. An attack that quotes nothing from the design is an assumption, and it gets labelled as one.

**Freeze the design between rounds.** The defender can't edit the architecture silently. It must respond to each attack in one of three ways: *accept* (and propose a change as a separate, diffable proposal), *refute* (with a quote from the design that shows the scenario can't happen), or *needs data* (naming the number you must supply). The design document only changes when a human accepts a proposal.

**Separate the contexts.** The critic shouldn't see the defender's reasoning in round one, only the artifact. Otherwise it anchors on the defender's framing. A paper on debate bias reports that identity-driven sycophancy is widespread, much more common than self-bias, and argues that anonymizing agents reduces it ([arXiv 2510.07517](https://arxiv.org/abs/2510.07517)). From its abstract, the case for anonymization is a mechanism argument. I haven't checked the measured gains, so read the paper before leaning on them.

**Use a different model if you can, and treat that as a hypothesis.** The intuition is that a different model has different blind spots. I haven't seen strong evidence that this works for design review, so test it on your own past incidents instead of assuming it.

**Put a checker that isn't a model at the end.** The final judge is either you or a deterministic step. If a scenario is expressible as a test, a chaos experiment or a config calculation, run that rather than asking a third agent for its opinion.

> **Principal Engineer's take:** The unit of progress in an adversarial loop is a falsifiable scenario, not an argument. If a round ends and you can't point to something you could go and check, whether a timeout value, a code path or a game-day experiment, the round didn't produce anything. Agreement is not evidence.

---

## A framework-agnostic implementation

You don't need LangGraph or CrewAI for this. Here is the loop as plain Python, with the model call left as a function you supply. I haven't run this code against a real model, so treat it as a sketch with the structure worth keeping.

```python
import json
from dataclasses import dataclass, field

def call_model(role: str, prompt: str) -> tuple[str, int]:
    """Your provider call. Returns (text, tokens_used). Swap per role if you
    want a different model for the critic."""
    raise NotImplementedError

@dataclass
class Attack:
    id: str
    scenario_steps: list[str]   # numbered events, concrete
    design_quote: str           # verbatim from the design
    bad_outcome: str            # observable
    assumptions: list[str] = field(default_factory=list)

def valid(attack: Attack, design: str) -> bool:
    return (
        len(attack.scenario_steps) >= 3
        and attack.design_quote.strip() in design
        and bool(attack.bad_outcome.strip())
    )

def run_loop(design: str, max_rounds: int = 2, token_budget: int = 150_000):
    spent, open_findings, seen_ids = 0, [], set()
    for rnd in range(1, max_rounds + 1):
        text, used = call_model(
            "critic",
            f"DESIGN (do not modify):\n{design}\n\n"
            "Return JSON list of attacks. Each needs: id, scenario_steps "
            "(>=3 concrete events), design_quote (verbatim), bad_outcome, "
            "assumptions. Do not repeat these ids: " + ", ".join(sorted(seen_ids)),
        )
        spent += used
        attacks = [Attack(**a) for a in json.loads(text)]
        fresh = [a for a in attacks if a.id not in seen_ids and valid(a, design)]
        if not fresh:
            break  # no new falsifiable attacks: stop, don't pay for politeness
        seen_ids.update(a.id for a in fresh)

        for a in fresh:
            reply, used = call_model(
                "defender",
                f"DESIGN (frozen):\n{design}\n\nATTACK:\n{json.dumps(a.__dict__)}\n\n"
                'Answer with JSON {"verdict": "accept|refute|needs_data", '
                '"proposal_or_quote_or_data": "..."}. A refutation must quote '
                "the design. Do not change the design.",
            )
            spent += used
            open_findings.append((a, json.loads(reply)))

        if spent >= token_budget:
            break
    return open_findings, spent  # a human triages this; nothing is auto-merged
```

Four details earn their place. The loop stops when a round yields no new valid attacks, which is a better stopping rule than "two rounds because that's what the blog said." The budget is a hard cap, enforced in code. The `valid` check rejects straw-man attacks cheaply, using the same verbatim-quote trick as Part 3. And nothing is applied automatically: the output is a list of attack-and-response pairs for a human to triage, with the defender's "accept" proposals as diffs for you to take or leave.

---

## When I wouldn't run a loop at all

An adversarial loop costs more than a single pass and more than a self-critique pass. The options compare like this:

| Approach | What you get | Weakness | Reasonable when |
|---|---|---|---|
| Single enumeration pass (Part 3) | Wide list of failure modes | No challenge to mitigations | Most designs |
| Self-critique pass | Cheap second look | Tends to defend its own output | Early drafts |
| Two-agent loop | Mitigations get attacked | Sycophancy, cost, straw men | Tier 3 systems, irreversible decisions |
| Human review with agent-prepared attacks | Judgement on the real context | Slow, needs senior time | Anything touching money or data integrity |
| Game day or chaos experiment | Evidence from the real system | Needs a running system | Once a prototype exists |

My rule is that the loop earns its cost when the decision is expensive to reverse and the design is concrete enough to attack. A vague design produces vague attacks. A design that's already running should be tested with real fault injection, because a real experiment beats an argued scenario every time.

The loop is also a poor fit when you can't supply the environment details. If the critic doesn't know your pool sizes, timeouts and failover behaviour, it will invent them, and you'll spend your review time pruning fiction.

`[YOUR STORY HERE: a time a second opinion, from an agent or from a person, found a real flaw in a design you were confident about, or a time a two-agent loop just agreed with itself and gave you false comfort. What did it cost, and what did you check that settled it?]`

---

## What this costs

This is the part where the earlier posts' cost notes come due. Agentic work uses far more tokens than ordinary chat, because each step re-sends its context, so cost grows faster than linearly with steps. A loop has that structure by design: every critic and defender call carries the full design plus the environment plus prior findings.

The back-of-envelope version is the formula one guide gives: cost per task is (input plus output tokens) times price times steps. Plug in your design size, multiply by calls per round, rounds, and the number of attacks each defender call must answer, and you'll see how quickly it adds up. I won't quote a dollar figure for your case because it depends on your model and prompt sizes. Run one loop with the hard token cap on, read the actual usage, and write the number next to the findings it produced. That ratio, cost per valid finding that a human accepted, is the metric I'd track. Part 5 builds on exactly that.

If your loop's last round produced nothing a human acted on, that round was waste, and you should have stopped one round earlier. Instrument it: record how many attacks passed the validity check, how many you accepted after reading them, and what it cost. After a handful of runs you'll know whether the loop pays for itself on your kind of design, and that's a better basis for a decision than anything I can tell you.

---

Next in the series: Part 5, **FinOps for Your Own Agents**. Token economics, cost per run, budgets enforced in code, model routing and the specific reasons agent loops get expensive. I'll lean on the FinOps Foundation's State of FinOps 2026 survey as the most credible source, flag which vendor numbers I wouldn't trust, and show a budget guard you can drop into the loop above.

*Questions or pushback? Find me on [LinkedIn](https://www.linkedin.com/in/chaitanyamaili/).*
