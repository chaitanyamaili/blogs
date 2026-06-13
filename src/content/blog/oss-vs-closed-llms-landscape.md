---
title: "The LLM Landscape in 2026: What You're Actually Choosing Between"
description: "GPT-4o, Claude, Gemini, Llama, Mistral, Qwen — not as a spec sheet, but as a decision space with real trade-offs. Part 1 of Open Source vs Closed LLMs."
pubDate: 2026-06-13
tags: ["ai", "llm", "open source", "platform engineering"]
readingTime: 12
series: "Open Source vs Closed LLMs"
seriesPart: 1
---

Six months ago I had to make a real decision: which LLM to use as the backbone of a new internal tool at Pantheon. Not in a demo. Not in a prototype. In something that would handle real traffic, process internal data, and need to stay reliable as the underlying models evolved.

I spent a week reading benchmarks. They were nearly useless.

Not because benchmarks are wrong — they're measuring something — but because they measure the wrong things for most production use cases. MMLU tells you how a model performs on multiple-choice academic questions. My tool needed to parse infrastructure configs and explain them to engineers. Those are different problems.

What I actually needed was a mental model for navigating the LLM landscape — not a ranking, but a framework for making the decision in context.

This is Part 1 of Open Source vs Closed LLMs: An Engineer's Decision Guide. We're going to map the terrain so the rest of the series has something to push against.

---

## The Two Camps (And Why "Open Source" Is Complicated)

The common framing is: closed models from big companies vs. open-source models from the community. The reality is messier.

**Closed models** are accessed exclusively via API. You send a request, you get a response, you pay per token. You never see the weights. You can't run them yourself. OpenAI's GPT series, Anthropic's Claude, and Google's Gemini are the main players.

**Open-weight models** (often called "open source," though the distinction matters) are models where the weights are publicly available. You can download and run them yourself, or use managed hosting. Meta's Llama series, Mistral's models, Alibaba's Qwen, and Microsoft's Phi are the prominent examples.

The "open source" label is worth scrutinising. Most of these models have:
- Publicly available weights ✓
- Published architecture details ✓
- Training data that is *not* fully disclosed ✗
- Licences that restrict commercial use in some cases ✗

Llama 3's licence, for example, restricts use by companies with more than 700 million monthly active users — which matters to almost nobody, but it's not truly open in the FSF sense. Mistral's models are generally more permissively licensed. This matters if you're building a commercial product and need to think about compliance.

When I say "open" in this series, I mean open-weight: the weights are available and you can run them. That's the meaningful distinction for most engineering decisions.

---

## The Closed Model Tier

These are the models you access via API, pay per token, and trust to be maintained and improved by someone else.

**OpenAI: GPT-4o and the o-series**

GPT-4o is the current flagship — multimodal (text, image, audio), fast, with a 128K context window. The `o1` and `o3` models in the reasoning series trade speed for substantially better performance on complex multi-step problems: coding challenges, mathematical reasoning, planning tasks.

Where GPT-4o genuinely excels: code generation, instruction following, structured output, and tasks where you need consistent quality at scale. The API is mature, the documentation is good, and the ecosystem of tooling (LangChain, LlamaIndex, etc.) is built around OpenAI's interface.

Where it struggles: it's expensive at high volume. As of mid-2026, GPT-4o input tokens cost around $5/million, output around $15/million. For a high-throughput production system, that arithmetic gets uncomfortable fast. The `gpt-4o-mini` variant is dramatically cheaper and handles a surprising amount of production workloads well — but you need to benchmark it for your task specifically, because the quality gap is real on complex reasoning.

**Anthropic: Claude 3.5 and Claude 4**

Claude models have earned a reputation for being particularly good at following nuanced instructions, handling long documents, and producing natural-sounding prose. The 200K context window is genuinely useful — not just a marketing number — for document-heavy use cases.

What I've noticed using Claude: it's more likely to acknowledge uncertainty and push back on unclear requests rather than confidently hallucinating an answer. Whether that's better depends on your use case. For a user-facing chatbot, a model that says "I'm not sure" is often better than one that confidently makes something up. For an extraction pipeline where you need a definitive output, it can be frustrating.

Claude's pricing is in the same range as GPT-4o at the top tier. The Haiku models offer a cheaper, faster option that's competitive with `gpt-4o-mini`.

**Google: Gemini 1.5 Pro and Gemini 2**

Gemini's headline feature is context: 1M token context window on the Pro model, and early access to 2M tokens. This is genuinely a different capability class for certain use cases — processing an entire codebase, analysing long video transcripts, or doing deep document analysis that would require chunking on other models.

The trade-off: Gemini has historically been less consistent at instruction following than OpenAI or Anthropic's flagship models, though this has improved significantly. The 1M context window is also expensive — you pay for tokens even if the model doesn't use all of them effectively.

Google's integration story is strong if you're already on GCP. Vertex AI gives you Gemini access with enterprise controls, data residency options, and tight integration with the rest of the Google Cloud stack. If you're running on GCP, this is worth evaluating seriously.

---

## The Open-Weight Tier

These are models where you have the weights, can run them yourself, and aren't dependent on a vendor's API.

**Meta: Llama 3 and Llama 3.1**

Llama 3 changed the landscape when it dropped. The 70B parameter model performs competitively with closed models that were considered state-of-the-art a year earlier. Llama 3.1 added longer context windows (128K) and meaningfully improved reasoning.

What Llama gives you: a highly capable base model you can run on your own infrastructure, fine-tune on your own data, and deploy without per-token API costs. The 8B model runs comfortably on a single A100 and handles a wide range of production tasks. The 70B model needs more serious hardware but delivers quality that's hard to distinguish from closed models on many tasks.

The practical catch: "running it yourself" is doing a lot of work in that sentence. You need GPU infrastructure, you need to manage serving (vLLM, llama.cpp, or similar), you need to handle scaling, and you need someone who knows what they're doing when things go wrong. More on this in Part 3.

**Mistral: Mistral 7B, Mixtral 8x7B, Mistral Large**

Mistral AI has consistently punched above their model size. Mistral 7B was the first model that genuinely made people rethink the assumption that bigger is always better — it outperformed models twice its size on several benchmarks.

Mixtral 8x7B introduced a Mixture-of-Experts architecture that uses only a subset of parameters per forward pass — giving you the quality of a larger model with the inference cost of a smaller one. For production deployments where you want to maximise quality-per-dollar on your own hardware, Mixtral is worth serious consideration.

Mistral also offers managed API access via `api.mistral.ai`, which is notably cheaper than OpenAI or Anthropic at comparable quality tiers. If you want open-weight quality without the infrastructure burden, their hosted API is an underrated option.

**Alibaba: Qwen 2.5**

Qwen (pronounced "chwen") came out of Alibaba's research and has become one of the most capable open-weight model families available. Qwen 2.5 — particularly the 72B model — performs at or near Llama 3.1 70B quality and, in some benchmarks, edges ahead.

What makes Qwen interesting beyond the benchmark numbers: strong multilingual performance, particularly for Asian languages. If you're building for a global audience or need reliable Chinese/Japanese/Korean capabilities, Qwen is worth evaluating seriously — it's not an afterthought on those languages the way some Western-developed models are.

The licence is Apache 2.0 on most sizes, which is about as permissive as it gets.

**Microsoft: Phi-3 and Phi-4**

The Phi series is Microsoft's bet on small but capable models. Phi-3 Mini (3.8B parameters) fits in constrained environments — edge devices, on-device inference, services where you want sub-second latency without GPU infrastructure. The quality for its size is remarkable.

Phi-4 (14B) pushes further into "genuinely useful for production tasks at small scale." If you're building something that needs to run on a laptop, a mobile device, or a small VPS, Phi is the model family to watch.

---

## The Dimensions That Actually Matter

Here's a comparison across the dimensions I actually use when making decisions — not benchmark scores:

| Model | Context | Approximate Cost | Self-hostable | Best for |
|---|---|---|---|---|
| GPT-4o | 128K | $$$$ | No | General production, code, structured output |
| GPT-4o mini | 128K | $$ | No | High-volume, cost-sensitive tasks |
| Claude Sonnet 3.5 | 200K | $$$$ | No | Long documents, nuanced instruction following |
| Claude Haiku | 200K | $$ | No | Fast, affordable Claude-quality output |
| Gemini 1.5 Pro | 1M | $$$$ | No | Massive context, GCP integration |
| Llama 3.1 70B | 128K | Infrastructure cost | Yes | Privacy, fine-tuning, cost at volume |
| Llama 3.1 8B | 128K | Infrastructure cost | Yes | Edge of what a small model can do |
| Mixtral 8x7B | 32K | Infrastructure cost | Yes | Quality-per-compute on own infra |
| Qwen 2.5 72B | 128K | Infrastructure cost | Yes | Multilingual, competitive quality |
| Phi-4 14B | 16K | Infrastructure cost | Yes | Edge/constrained environments |

---

## What "Open Source" Actually Costs You

The pitch for open models is: no per-token cost, data stays on your infrastructure, full control. All true. Here's what the pitch leaves out:

**GPU infrastructure is not free.** An A100 80GB GPU on AWS costs around $3.20/hour on-demand, or roughly $2,300/month if you need it running continuously. A Llama 3.1 70B deployment with reasonable throughput needs multiple A100s. The break-even point against API costs depends heavily on your traffic volume — but at low to medium volume, the API is often cheaper when you factor in engineering time.

**You own the ops.** Model updates, serving infrastructure, scaling, latency optimisation, failure handling — that's now your team's problem. Closed API providers absorb this. With open models, you're running a service. That's not insurmountable, but it's not free either.

**Fine-tuning is non-trivial.** The ability to fine-tune is a real advantage of open models. Actually doing it well — collecting training data, running QLoRA fine-tuning, evaluating the result, deploying without regression — requires expertise and time that's easy to underestimate.

I'm not saying open models aren't worth it. For the right use cases (privacy requirements, high volume, specific domain fine-tuning), they're clearly the better choice. But the TCO analysis needs to be honest. We'll go deep on the numbers in Part 6.

---

## The Gap Is Closing, and That Changes the Decision

Eighteen months ago, the quality gap between closed models and open models was significant. GPT-4 was meaningfully better than anything you could run yourself at reasonable cost.

That gap has narrowed substantially. Llama 3.1 70B and Qwen 2.5 72B are competitive with GPT-3.5-class models across most tasks, and they're closing on GPT-4-class on many. The trajectory is clear: open-weight model quality is improving faster than closed model quality is pulling ahead.

This changes the decision calculus. A year ago, "I need the best possible quality" reliably pointed to closed models. Today, it's more nuanced — and a year from now, the quality argument for closed models may be even weaker.

What remains as durable advantages for closed models: frontier capabilities at the absolute cutting edge, no infrastructure burden, and built-in enterprise features (audit logging, data processing agreements, SLA guarantees). For open models: cost at volume, data privacy, customisation via fine-tuning.

---

**Next in the series:** Benchmarks vs. Reality — why MMLU, HumanEval, and MMMU scores don't predict how a model will perform on your specific task, and how to actually evaluate models for your use case.

*Disagree with my take on any of these models? I'd genuinely like to hear it — find me on [LinkedIn](https://www.linkedin.com/in/chaitanyamaili/).*
