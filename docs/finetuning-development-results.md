# Fine-tuning development experiment v01

Qwen3-1.7B with a fresh LoRA adapter was trained on 48 assistant-authored
examples. Twelve validation questions in six related groups were used
for checkpoint selection and the generation comparison.

Training completed 36 finite optimizer updates over three epochs.
Validation reference-answer loss decreased from 4.4014 to 1.2258.
Epoch 3 was selected.

## Preliminary answer findings

- Questions 004 and 008: the adapter corrected clear factual errors.
- Questions 009 and 010: unsupported compensation claims were replaced
  with evidence-limited responses.
- Questions 005 and 007: supported answers still lacked citations.
- Question 001: the answer omitted the per-company and 12-month limits.

These observations are assistant review notes, not independent human grades.

## Limits

The corpus contains eight articles. Evidence used in this experiment
consists of short source snippets. Validation also selected the checkpoint,
so this is not a final held-out benchmark or an end-to-end RAG evaluation.
Candidate review statuses remain pending.

Lower reference-answer loss does not establish a reduction in unsupported
answer rate. Broader held-out evaluation and citation improvements remain.
