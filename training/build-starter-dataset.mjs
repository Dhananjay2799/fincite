import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const inventory = JSON.parse(
  readFileSync("training/datasets/source-inventory.json", "utf8")
    .replace(/^\uFEFF/, "")
);
const output = "training/datasets/starter-candidates.jsonl";

if (existsSync(output)) {
  throw new Error(`${output} already exists. Keep it and share this message.`);
}

const seeds = [
  {
    source: "cfpb-47",
    question: "How far ahead of the payment due date must card companies arrange to mail or deliver bills?",
    quote: "Credit card companies must establish procedures to assure that their bills are mailed or delivered to you at least 21 days before the payment is due.",
    answer: "Credit card companies must establish procedures to ensure bills are mailed or delivered at least 21 days before payment is due [cfpb-47]."
  },
  {
    source: "cfpb-45",
    question: "Where can I get a copy of my credit card agreement if I cannot find it online?",
    quote: "You should be able to find a copy of the agreement on your card issuer’s website, and you can request a copy from your card issuer if it is not there.",
    answer: "Check your card issuer’s website. If the agreement is not there, request a copy from the issuer [cfpb-45]."
  },
  {
    source: "cfpb-45",
    question: "What external rate can a variable credit card APR move with?",
    quote: "A variable-rate APR or variable APR changes with the index interest rate, such as the prime rate published in the Wall Street Journal.",
    answer: "A variable APR changes with an index interest rate, such as the prime rate published in the Wall Street Journal [cfpb-45]."
  },
  {
    source: "cfpb-313",
    question: "My credit report says an account is open even though I closed it. Is that a reporting error to check?",
    quote: "Closed accounts reported as open",
    answer: "Yes. Closed accounts reported as open are one type of account-status error to check on a credit report [cfpb-313]."
  },
  {
    source: "cfpb-314",
    question: "After receiving my dispute, how long does a company that furnished credit-report information generally have to investigate and respond?",
    quote: "Furnishers generally must investigate and respond to your dispute within 30 days of when they receive the dispute.",
    answer: "Furnishers generally must investigate and respond within 30 days of receiving your dispute [cfpb-314]."
  },
  {
    source: "cfpb-331",
    question: "When is debt validation information generally provided after a collector first contacts someone?",
    quote: "Generally, this information is provided in a written notice sent as the initial communication to you or within five days of their first communication with you, and it may be sent by mail or electronically.",
    answer: "Generally, it is provided in a written notice sent with the initial communication or within five days of the first communication. The notice may be sent by mail or electronically [cfpb-331]."
  },
  {
    source: "cfpb-31",
    question: "How long does an extended fraud alert stay in effect?",
    quote: "An extended alert is good for seven years.",
    answer: "An extended fraud alert is good for seven years [cfpb-31]."
  },
  {
    source: "cfpb-31",
    question: "How long does an active-duty alert last, and what if deployment continues longer?",
    quote: "The alerts last for 12 months. You can request that the alert be removed sooner. If your deployment lasts longer than 12 months, you may place another alert on your credit file.",
    answer: "Active-duty alerts last for 12 months and can be removed sooner on request. If deployment lasts longer than 12 months, you may place another alert [cfpb-31]."
  }
];

const refusals = [
  {
    contextSeed: 2,
    question: "What is the daily ATM withdrawal limit on my checking account?",
    answer: "The supplied passage does not give your checking account’s ATM withdrawal limit."
  },
  {
    contextSeed: 3,
    question: "Which credit bureau received the most complaints this month?",
    answer: "The supplied passage does not contain complaint totals for this month, so I cannot identify which bureau received the most."
  },
  {
    contextSeed: 4,
    question: "Exactly how many points will paying off a $500 balance add to my credit score?",
    answer: "The supplied passage does not establish how paying off that balance would change your credit score. I cannot give an exact point increase from this evidence."
  },
  {
    contextSeed: 0,
    question: "What exchange rate will my card apply to a purchase in euros today?",
    answer: "The supplied passage does not give your card’s exchange rate for today."
  }
];

const normalize = s =>
  s.normalize("NFKC").replace(/\s+/g, " ").trim();

const reserved = new Set(
  inventory.reserved_development_questions.map(
    q => normalize(q.question).toLowerCase()
  )
);

const system = "Answer using only the supplied passages. Keep the answer brief and preserve conditions and exceptions. Cite supported factual claims using [source_id]. If the passages cannot answer the question, explain that limitation without guessing or inventing a citation.";

const contexts = seeds.map(seed => {
  const source = inventory.sources.find(
    s => s.source_id === seed.source
  );
  if (!source) throw new Error(`Missing source: ${seed.source}`);

  const passage = source.passages.find(
    p => normalize(p.text).includes(normalize(seed.quote))
  );

  if (!passage || typeof passage.chunk_id !== "string") {
    throw new Error(`Evidence or chunk ID missing: ${seed.source}`);
  }

  return {
    source_id: source.source_id,
    chunk_id: passage.chunk_id,
    text: passage.text
  };
});

function record(question, answer, passage, quote, answerability, index) {
  if (reserved.has(normalize(question).toLowerCase())) {
    throw new Error("Reserved development question reused.");
  }

  const citations = [...answer.matchAll(/\[([^\[\]]+)\]/g)]
    .map(m => m[1]);

  if (citations.some(id => id !== passage.source_id)) {
    throw new Error("Unknown citation ID.");
  }

  if (answerability === "answerable" && !citations.length) {
    throw new Error("Missing answer citation.");
  }

  return {
    id: `train-seed-${String(index + 1).padStart(3, "0")}`,
    status: "draft",
    review_status: "pending_review",
    provenance: "authored_seed",
    answerability,
    question,
    answer,
    passages: [passage],
    evidence_quotes: quote ? [{
      source_id: passage.source_id,
      chunk_id: passage.chunk_id,
      quote
    }] : [],
    context_sha256: createHash("sha256")
      .update(passage.text, "utf8").digest("hex"),
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `Question: ${question}\n\nSupplied passages:\n[${passage.source_id}]\n${passage.text}`
      },
      { role: "assistant", content: answer }
    ]
  };
}

const records = seeds.map((s, i) =>
  record(s.question, s.answer, contexts[i], s.quote, "answerable", i)
);

for (const [i, r] of refusals.entries()) {
  records.push(
    record(
      r.question, r.answer, contexts[r.contextSeed],
      null, "unanswerable", seeds.length + i
    )
  );
}

writeFileSync(
  output,
  records.map(r => JSON.stringify(r)).join("\n") + "\n",
  "utf8"
);

console.log("Saved: " + output);
console.log("Draft examples: 12; grounded: 8; evidence-limited refusals: 4");
console.log("PASS: evidence quotes and citation IDs checked.");
console.log("PASS: exact development questions excluded.");
console.log("Draft only: review and close-paraphrase checks remain.");
