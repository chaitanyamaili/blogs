---
title: "How LLMs Actually Work: What Every Engineer Needs to Know Before Building with AI"
description: "Tokens, context windows, temperature, and the mental model that makes everything else click. Part 1 of Generative AI in Production."
pubDate: 2026-06-13
tags: ["ai", "llm", "generative ai", "platform engineering"]
readingTime: 11
series: "Generative AI in Production"
seriesPart: 1
---

Early in my time building with LLMs, a product manager walked up to my desk and said: "The AI gave a wrong answer. Can you just make it smarter?"

I didn't know how to explain why that wasn't a thing I could do — not because AI can't be improved, but because "smarter" doesn't map to any parameter I could turn up. There's no knob labelled *intelligence*. What there is: a model, a prompt, a context window, a temperature setting, and a whole lot of probabilistic mathematics that produce outputs that feel like thinking.

That conversation was the moment I realised that building *with* LLMs requires understanding what they actually are, not just what they feel like from the outside. Not at a research-paper level — but at the level where you can make informed engineering decisions.

This is Part 1 of Generative AI in Production. We're building the mental model you need before everything else in this series makes sense.

---

## What a Language Model Is Actually Doing

Here's the honest one-sentence version: a large language model is a system that, given a sequence of text, predicts what text is most likely to come next.

That's it. It's a very sophisticated next-token predictor, trained on an enormous amount of text, with billions of parameters tuned to make those predictions as useful as possible.

When you send a message to GPT-4o or Claude and it writes you a detailed explanation of Kubernetes networking — it didn't look it up. It didn't reason through it from first principles. It predicted, token by token, what text was most likely to follow your prompt, based on patterns learned from training data that included a lot of text about Kubernetes networking.

This is not a knock on what these models can do. The emergent capability that falls out of doing next-token prediction at scale is genuinely remarkable. But it matters for understanding *why* they fail in the ways they do, and what you can and can't fix.

---

## Tokens: The Unit That Actually Matters

When you type a message to an LLM, it doesn't see words. It sees **tokens** — chunks of text that are somewhere between a character and a word, determined by the model's tokenizer.

Some rough intuitions for English text:
- 1 word ≈ 1.3 tokens on average
- 1,000 words ≈ ~1,300 tokens
- A paragraph ≈ 100-200 tokens
- This blog post ≈ ~3,000 tokens

Why does this matter in practice?

**Cost.** You pay per token — both input (your prompt) and output (the model's response). A system prompt that's 2,000 tokens, running 10,000 requests a day, adds up fast. I've seen teams burn significant budget on verbose system prompts they never trimmed because nobody was watching the token counts.

**Limits.** Every model has a context window — the maximum number of tokens it can process at once. If your input + output exceeds that, the model truncates, hallucinates, or errors. You need to know your model's limit before you design your data pipeline around it.

**Non-obvious tokenisation.** Code, URLs, and non-English text tokenise very differently from plain English prose. A function name like `getUserByEmailAddress` might tokenise as `get`, `User`, `By`, `Email`, `Address` — five tokens for what feels like one thing. Languages like Chinese and Japanese tokenise more efficiently per concept than English; languages with complex morphology can be surprisingly expensive.

```python
import tiktoken  # OpenAI's tokenizer, works for GPT models

enc = tiktoken.encoding_for_model("gpt-4o")
tokens = enc.encode("How do I configure an Ingress controller in Kubernetes?")
print(len(tokens))  # 12 tokens for this sentence
print(tokens)       # [4438, 656, 358, 25928, 459, 657, 1886, 10575, ...]
```

Get used to thinking in tokens, not characters or words. It'll change how you write prompts and how you think about cost.

---

## The Context Window: Your Working Memory Budget

The context window is the total amount of text the model can "see" at once — your system prompt, the conversation history, any documents you've injected, and the space left for the model's response.

Modern models have gotten generous. GPT-4o supports 128K tokens. Claude 3.5 Sonnet supports 200K. Gemini 1.5 Pro goes to 1M. But bigger isn't just better — there are real trade-offs.

**The needle-in-a-haystack problem.** Models degrade on long contexts. Specifically, information in the *middle* of a long context tends to be recalled less reliably than information at the beginning or end. This has been documented in benchmarks and is a real production issue: if you stuff 150K tokens of documents into a context and hope the model finds the relevant bit, it often doesn't — not because the token limit is exceeded, but because attention patterns degrade.

**Cost scales linearly.** Sending 100K tokens of context on every request costs money proportional to those tokens, every time. Caching helps (more on this in a later post), but naive long-context usage is expensive.

**Latency scales too.** More tokens in = more time before you get the first token back. This matters if you're building interactive features where perceived responsiveness matters.

The practical implication: treat the context window as a budget. Be deliberate about what you put in it. Sending everything and hoping the model figures it out is not a strategy.

---

## Temperature and Sampling: Why the Same Prompt Gives Different Answers

Every LLM call produces output through a sampling process. After the model computes probabilities for the next token, it doesn't just always pick the most likely one. It samples — which introduces randomness.

**Temperature** controls how much randomness. At `temperature=0`, the model always picks the highest-probability token. At `temperature=1` (roughly), it samples proportionally from the probability distribution. At higher temperatures, it starts making weirder, less likely choices.

```python
# Low temperature — deterministic, factual, consistent
response = client.chat.completions.create(
    model="gpt-4o",
    temperature=0.1,
    messages=[{"role": "user", "content": "What is the capital of France?"}]
)

# Higher temperature — more varied, creative, unpredictable
response = client.chat.completions.create(
    model="gpt-4o",
    temperature=0.9,
    messages=[{"role": "user", "content": "Write an opening line for a short story."}]
)
```

This has direct engineering implications:

- For **factual retrieval, classification, or structured output** — use low temperature (0.0–0.2). You want consistency.
- For **creative tasks, brainstorming, varied suggestions** — higher temperature (0.7–1.0) gives more interesting outputs.
- For **most production API calls** — something in the middle (0.3–0.5) balances reliability and naturalness.

The "same prompt gives different answers" problem that drives product teams crazy is usually temperature in action. Understanding this means you can tune it for your use case instead of just being frustrated by it.

---

## Why "Make It Smarter" Isn't a Real Request

Back to my product manager. What could I actually have changed?

If the model gave a wrong answer, the real diagnostic questions are:

**Was the information not in the context?** The model can only work with what it's given. If you need it to know something specific — recent data, your company's internal knowledge, a particular document — it needs to be in the prompt or retrieved via RAG. This is probably the most common failure mode.

**Was the prompt ambiguous?** Models are very good at making reasonable interpretations of vague prompts. Sometimes the reasonable interpretation is wrong. Specificity in prompts is engineering work, not just writing.

**Is this a reasoning task that exceeds the model's capability?** Some tasks require multi-step reasoning that models genuinely struggle with. Breaking the task down, using chain-of-thought prompting, or routing to a stronger model are all real options.

**Is temperature too high?** If answers are inconsistent, bring temperature down.

**Is the wrong model being used?** A `gpt-4o-mini` will confidently produce plausible-sounding but subtly wrong answers on tasks that `gpt-4o` handles correctly. Model selection is a real design decision.

None of these is "make it smarter." They're all specific, diagnosable, fixable problems.

---

## The Hallucination Problem (And Why It's Structural)

LLMs hallucinate — they produce confident, fluent, plausible-sounding text that is factually wrong. This isn't a bug that will be patched. It's a structural consequence of how these models work.

Because the model is predicting likely next tokens, not retrieving verified facts, it can produce text that sounds right without having any ground truth to check against. The model has no mechanism to say "I don't know this" and refuse to answer — unless it's been specifically trained to do so (and even then, imperfectly).

Practical implications:

- Never use an LLM as the sole source of truth for factual claims without verification
- Design your system to surface uncertainty rather than hide it
- Retrieval-Augmented Generation (RAG) helps significantly — if the model's answer must be grounded in documents you provide, hallucination rates drop
- Evaluate your system for hallucination explicitly; don't assume it won't happen in your use case

I've seen production systems where the LLM confidently cited non-existent papers, invented plausible-looking API endpoints, and gave wrong-but-confident medical information. In every case, the team was surprised. They shouldn't have been — this is the baseline behaviour of these systems without mitigation.

---

## What Training Actually Gives You

A brief note on what "the model was trained on X" means in practice.

Training is the process of adjusting billions of numerical parameters to minimise prediction error across a huge corpus of text. What the model "knows" is encoded in those parameters as statistical associations, not as a lookup table of facts.

This has a few implications:

**Knowledge has a cutoff.** The training corpus ends at some date. After that, the model has no information. Asking `gpt-4o` about something that happened last month will either produce a refusal or, worse, a confident hallucination. If your use case requires current information, you need retrieval, not just the base model.

**The model reflects its training data.** If certain topics, languages, or perspectives are underrepresented in training data, the model performs worse on them. This is worth testing explicitly for your use case.

**Fine-tuning changes behaviour, not core capability.** You can fine-tune a model on your data to improve performance on specific tasks or formats. But fine-tuning doesn't make a fundamentally weak model strong — it adjusts style and behaviour within the model's existing capabilities.

---

## The One Mental Model That Ties This Together

When I'm debugging an AI feature that isn't working, I keep this framing in mind:

> The model is doing its best to predict what a useful response looks like, given the text it can see, based on patterns learned from training data. If the output isn't what you want, something in that chain is wrong.

Either the context doesn't have what it needs, the prompt isn't specific enough, the model isn't capable of the task, or the output format doesn't match your expectations. Every LLM debugging session reduces to finding which of those is the problem.

The moment you internalise that the model is a very sophisticated pattern matcher — not a thinking agent with goals — a lot of the surprising behaviour starts making sense.

---

**Next in the series:** Prompt Engineering as a Discipline — system prompts, few-shot examples, output formatting, and the difference between prompts that work in a demo and prompts that hold up in production.

*Something I got wrong, or a concept that deserves more depth? Find me on [LinkedIn](https://www.linkedin.com/in/chaitanyamaili/).*
