# Public app pilot review — 21 October 2026

Status: assistant observations on a reviewed-question pilot; not independent human answer grades.

## Recorded run

[Raw responses](../evaluation/results/reviewed-pilot-2026-10-21T22-08-42-062Z.json)
contain 24/24 successful HTTP requests, all in source_excerpts mode, with
generation_attempts=0. The owner console also reported five passing Node tests
and passing corpus/chunk validation before the run. Those tests do not grade
the app's answers.

The saved pilot file's Git blob is 3fc94d71530b844e4bf47eb36c36faa37da1a544.
The recorded client Git head is 204e8f03d78066e357d1e1f6a968d2c56c8c0025. The remote deployment,
database and model identity are not independently attested by this client.

## Observations

| Question category | Observed response behavior |
| --- | --- |
| 16 approved answerable questions | All 16 returned relevant supporting material in assistant review; some responses contain excess or duplicate text. |
| 8 approved unanswerable questions | Five showed an evidence-limit message; three returned non-answering excerpts. |
| Source wording | 29 selected spans reconstructed from saved same-source passages using recorded offsets. Answer and grouped source-quote reconstruction matched; no cited IDs fell outside the returned known sources. |

These counts describe the saved run and assistant inspection. They are not
independently graded accuracy or refusal-success scores. quality_scores stays null.

## Three relevance/scope failures

- **fresh-candidate-018 — binding arbitration.** The app returned ordinary bureau/
  furnisher dispute instructions and the frivolous-dispute notice rule. None
  establishes whether this account has a binding arbitration obligation.
- **fresh-candidate-019 — accurate late-payment retention.** The app returned
  marketing-list exclusion periods for fraud alerts. These are a different
  concept from how long a late-payment entry remains on a report. Authentic
  two-/five-year wording can still mislead in this question's context.
- **fresh-candidate-021 — French-law deadline.** The app returned US CFPB dispute
  instructions containing five-business-day and 30-day periods. The corpus does
  not establish a French legal deadline. The jurisdiction condition was not
  satisfied by the selected material.

The generic warning that excerpts may not fully answer a question does not make
these selections sufficient. Exact copying removes a copying error; it does not
establish relevance, completeness, jurisdiction or personal applicability.

## Supported cases with presentation issues

- **007:** the first paragraph answers what to request after a furnisher says
  information is accurate. Additional paragraphs about generic disputes and the
  opposite investigation outcome are distracting.
- **016:** complaint forwarding, tracking and updates are supplied, but the same
  boilerplate is repeated from cfpb-313 and cfpb-331.

## Timing diagnostics

Across these 24 requests, median elapsed time was **1.12 seconds**, nearest-rank
sample p95 was **7.34 seconds**, and maximum was **7.67 seconds**.
Cold/warm status was not measured; do not label these as separate cold/warm
latencies or production service guarantees. The sample is small.

## Implication for the next change

Focus on relevance and scope, rather than citation-format repair or retraining
without evidence. A blanket cutoff increase is not a demonstrated solution:
the arbitration failure's top logit (-0.589) exceeds the supported balance/limit
case's top logit (-1.004), and also exceeds the complaint-workflow case (-0.750).
Any cutoff high enough to reject the arbitration selection would reject those
supported cases as well in this run.

Use separate development cases to design and calibrate a guard. After inspecting
these outputs, this pilot can supply regression cases, but must not be advertised
as an untouched final test after tuning to it. Broader corpus coverage and fresh
semantically reviewed test families remain needed for stronger claims.

The public path exercised here uses retrieved source excerpts. These results do
not measure LoRA generation improvement, and they do not justify promoting
experimental generated explanations.
