---
title: "Encoding Your Judgment: Context Files, Skills and Review Agents That Earn Their Keep"
description: "Context files and skills can help or just add cost. What to encode, how to test it, and how to keep it from going stale. Part 6 of 7."
pubDate: 2026-10-26
tags: ["ai agents", "agents.md", "skills", "staff engineer", "engineering leadership", "mentorship"]
readingTime: 11
series: "AI Agents for Staff+ Engineers"
seriesPart: 6
draft: true
---

The advice on this topic is nearly unanimous. Write a context file. Put your conventions in `CLAUDE.md` or `AGENTS.md`. Package your review standards as skills. Give every agent a written job description. Addy Osmani and most of the senior-engineer guides I read say some version of it (Osmani adds that humans, not agents, should write the file), and in Part 1 I said "own the context" myself.

Then I found the study that complicates it. In February 2026, researchers at ETH Zurich evaluated repository-level context files on coding agents. Across the settings they tested, the files did not generally improve task success and raised inference cost by more than 20% on average ([Gloaguen et al., arXiv 2602.11988](https://arxiv.org/abs/2602.11988)).

This is one study, and a second one disagrees on a narrower question. But it's the right kind of inconvenient finding for this series: a widely recommended practice with measured evidence that it often doesn't do what people think. So this is Part 6 of AI Agents for Staff+ Engineers, and it's about encoding your judgment for agents and for the engineers who work with them, without just assuming the encoding works.

---

## What the evidence says about context files

Here is the research as I found it, with its limits.

The ETH study tested two setups: SWE-bench tasks with LLM-generated context files, and a new benchmark of 138 instances from 12 repositories that already had developer-written context files. LLM-generated files changed resolution rates by about -0.5% and -2% on average, and developer-written files by about +2.4%. None of those differences was statistically significant. Cost rose by roughly 20 to 23% for LLM-generated files and by up to 19% for developer-written ones. The authors' explanation is that agents follow the instructions faithfully, but a lot of what's in the files, such as repository overviews, isn't useful. It sends agents off to test and explore more, which costs tokens and doesn't change the outcome. Their conclusion was that context files are useful for specifying non-standard practices, and that any attempt to improve performance should be evaluated rigorously before deployment.

A separate 2026 study by Lulla and colleagues found the opposite on a narrower measure. On 124 pull requests across 10 repositories, using one agent (GPT-5.2-Codex), files reduced median runtime by 28.6% and output tokens by 16.6%. The changes were small (at most 100 lines across 5 files), and the study measured efficiency, not correctness. A later ablation paper (arXiv 2607.27250) compares never, always-on and selectively retrieved context, and I couldn't see its final numbers, so I won't characterize them.

One way to reconcile these: a context file helps when it tells the agent something it can't work out from the repository, and it costs money when it restates what the agent could discover anyway. The Hacker News discussion of the ETH paper made the same point anecdotally, naming things like strict TDD rules and internal wrapper APIs as the kind of content worth writing down. That's commenters' opinion rather than evidence, so I'd hold it loosely.

> **Principal Engineer's take:** The ETH result doesn't say "don't write context files." It says "don't assume they work." Treat a context file as a hypothesis with a cost, and test it the way you'd test a performance optimization. The instinct to document everything is the instinct this study undermines.

---

## What is worth encoding

If agents can discover it, don't write it down. If they can't, it's a candidate. This is how to sort it.

| Encode it | Leave it out |
|---|---|
| Non-obvious conventions: "we wrap all outbound HTTP in `internal/httpx`, never call the client directly" | Directory tours and repository overviews the agent can read itself |
| Constraints that aren't in the code: "no new managed-database spend this quarter" | Generic best practice the model already knows |
| Decisions and their reasons: "we rejected Debezium here because we don't operate Kafka Connect" | Long lists of style rules your linter already enforces |
| The sharp edges: "this migration tool silently skips tables with no primary key" | Anything that changes weekly |
| What done means: acceptance criteria, how to run the tests, what to never delete | Auto-generated summaries of the codebase |

This is Staff+ knowledge in a precise sense. It's the context that lives in your head and in old Slack threads: why the system is shaped the way it is, what was tried, what to avoid. That is exactly the content a model can't infer and a new engineer takes six months to absorb. It's also the content that's most valuable to write down for people, which is a side benefit.

One finding from a large analysis of public skill files backs the same direction. Looking at 138,133 public SKILL.md files, researchers found exemplary ones share a few traits: descriptions that say when to use them, imperative instructions, local project-specific conventions rather than generic programming concepts, and no boilerplate like install steps or license text ([arXiv 2608.08453](https://arxiv.org/html/2608.08453v1)). The same study found 91.8% of files had at least one detected defect, most often missing guidance on when the skill should trigger. The authors note that most of those exemplar traits are partly built into their own detectors. Only the project-specific-knowledge trait emerged independently. So the bar for "good" is low and most people haven't met it.

---

## Skills: your review lens, packaged

A skill is a folder with a `SKILL.md` and optional scripts that an agent loads when its description matches the task. The format is an open standard supported across a number of tools, which is useful if you don't want to bet on one vendor. A context file is always on. A skill loads on demand, which makes it the better home for something like "how we review a database migration."

Here is a deliberately small example of the review lens worth encoding, in the shape the research suggests: a "use when" description, imperative steps, and local specifics. The tool names, thresholds and doc paths are invented for illustration. Swap in your own.

```markdown
---
name: review-db-migration
description: Use when reviewing a pull request that adds or changes a database
  migration. Do not use for application-only changes or for schema docs.
---

# Review a database migration

1. List every table the migration touches and whether it has a primary key.
   Our online-migration tool silently skips tables without one.
2. Flag any statement that takes a lock on a table over 10M rows
   (see /docs/large-tables.md for the current list).
3. Check the rollback path. A migration without a tested down-step is a
   Tier 3 change (see /docs/review-tiers.md).
4. State what you could not verify. Do not guess row counts.
5. Output: findings ordered by blast radius, each with the file and line.
```

Everything in that file is something an agent can't know. The primary-key quirk, the large-table list and the tier policy are all local. And step 4 is the same instruction I recommended in Part 1, because an agent that admits what it didn't check hands you the map of what remains.

Skills also give you something context files don't: they're shareable across a team as an artifact. A common suggestion is to give junior and mid-level engineers a "virtual principal engineer" review agent. That is a skill like this one. I'd be careful with the framing. The skill encodes your checklist, not your judgment. A junior engineer using it still has to decide whether a finding matters, and the agent can't coach that. It can raise the floor on what gets caught before a human reviewer sees the PR, which is worth having, but it isn't mentorship.

> **Principal Engineer's take:** Write the skill from the post-mortems, not from first principles. The best review rules are the ones that exist because something broke. A rule like "check for the missing primary key" earns its place if someone on your team has lost a night to it. If your skill reads like a textbook, it will tell the agent things it already knew and cost you tokens for nothing.

---

## Test it, or you're guessing

The ETH study's own recommendation is to evaluate before deploying, and few teams do. You don't need a benchmark. You need a small fixture set and an ablation.

Collect a handful of real past cases where you know the right answer: three migrations that caused problems and three that were fine, for example. Run the agent with and without your skill or context file. Compare what it caught, what it falsely flagged, and how many tokens it used.

```python
from dataclasses import dataclass

@dataclass
class Case:
    name: str
    diff: str
    expected_flags: set[str]      # what a good reviewer would raise

def evaluate(cases: list[Case], run_agent, with_skill: bool) -> dict:
    """run_agent(diff, with_skill) -> (flags: set[str], tokens: int). Yours to supply."""
    caught = false_alarms = total_expected = tokens = 0
    for c in cases:
        flags, used = run_agent(c.diff, with_skill)
        caught += len(flags & c.expected_flags)
        false_alarms += len(flags - c.expected_flags)
        total_expected += len(c.expected_flags)
        tokens += used
    return {
        "recall": caught / max(total_expected, 1),
        "false_alarms": false_alarms,
        "tokens": tokens,
    }

# baseline = evaluate(cases, run_agent, with_skill=False)
# treated  = evaluate(cases, run_agent, with_skill=True)
# Keep the skill only if it improves recall or cuts false alarms enough to
# justify the extra tokens. Rerun when the skill or the model changes.
```

A caveat on this sketch: with six cases you're measuring, not proving. The results will be noisy, a model can behave differently run to run, and the code hasn't been run against a real agent. Run each case several times if you can. The point is to replace "I think this helps" with "here's the difference on cases I trust." If the skill doesn't beat the baseline, delete it. A file that costs tokens and doesn't change outcomes is worse than no file.

---

## The part everyone skips: keeping it true

Instructions rot. The skill you wrote for the old repository layout keeps being followed, confidently, after the layout changed. One recent paper on exactly this, "Repository Skills Go Stale in Silence" ([arXiv 2608.21964](https://arxiv.org/abs/2608.21964)), built a benchmark from 57 repositories and 105 release transitions. Every transition invalidated part of the skill set, and six frontier agents scored only 29.9 to 69.7% macro F1 at finding what had gone stale. A Forte Group article makes a related point that skills are not code but behave like code: they execute in a model's context, so their failures are probabilistic and quiet.

A few practices follow, and none of them are exotic.

**Version it with the code and review it in the same PR.** If a change moves the thing a skill refers to, the PR that moves it updates the skill. A reviewer who sees the change to `/docs/large-tables.md` is positioned to ask whether the review skill still holds.

**Give it a named owner and a review date.** Among the production guidance I read, one recurring recommendation is to give each agent a named human owner and a written job description covering scope, allowed tools, escalation conditions and success metrics. I'd apply the same to a skill: an owner, a "last verified" date, and a rule that unverified files get deleted after, say, two quarters.

**Check what it points at.** The cheapest staleness check is mechanical. Scan each skill for the file paths, commands and config keys it mentions, and fail CI if any of them no longer exist:

```python
import pathlib
import re

def stale_references(skill_path: str, repo_root: str = ".") -> list[str]:
    text = pathlib.Path(skill_path).read_text()
    # paths like /docs/foo.md or `internal/httpx` mentioned in the skill
    refs = set(re.findall(r"(?<![\w/])(/?(?:[\w.-]+/)+[\w.-]+\.\w+)", text))
    return sorted(r for r in refs if not (pathlib.Path(repo_root) / r.lstrip("/")).exists())
```

It won't catch a rule that's become wrong while its file still exists, but it catches the most embarrassing kind of rot for almost no effort.

**Treat skills as a supply chain.** If your team pulls skills from public registries, know that a Snyk audit reported that about 37% (1,467) of the 3,984 skills it scanned in February 2026 had at least one security flaw, and 76 contained confirmed malicious payloads. That's a vendor's audit, so weigh it as such, but the sensible default is the same as for any dependency: read it before you install it, pin it, and prefer ones your team wrote.

`[YOUR STORY HERE: a time something you wrote down for agents, or for new engineers, went stale and misled one of them. Or a time a rule you encoded caught a real problem. Name the file, the rule, and how you found out. If you haven't built any of this yet, say what you'd encode first and why.]`

---

## What I wouldn't encode at all

There's a limit to what writing things down can do. Taste, the sense that a design is going to be painful in a year, and the ability to read a room and know that a proposal needs a different framing for a skeptical VP are not things a skill file captures. I'd be skeptical of anyone claiming to have bottled their principal-level judgment into a prompt. What you can bottle is your checklist, your history and your reasons. The judgment about when the checklist doesn't apply stays with you, which is a good reason to stay close to the work.

There's also a mentoring cost to weigh. If a skill answers every question a junior engineer would have asked you, they stop asking, and you lose the conversations where you'd have noticed they were stuck on something that mattered. I don't know the right balance here. I'd watch for it rather than assume the agent is a free upgrade to the mentoring relationship.

> **Principal Engineer's take:** Encoding your judgment is mostly an exercise in discovering how much of it you can't articulate. When you try to write the rule for why that design "feels wrong," you'll often find you can't, and that's information about where your real expertise lives. Write down the part you can, test it, keep it current, and spend the saved time on the part you can't.

---

Next in the series is the last one, Part 7: **Building a Tool Chain That Compounds**. The question many readers arrive with is how to get ahead of everyone else using these tools. I'll give you the answer the evidence supports, covering which parts of a chain earn their place, which are theatre, how to measure whether you're improving rather than just busier, and what the practitioners who seem to do this well have in common.

*Questions or pushback? Find me on [LinkedIn](https://www.linkedin.com/in/chaitanyamaili/).*
