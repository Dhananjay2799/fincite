import { readFileSync, writeFileSync } from "node:fs";

const path = "evaluation/datasets/development.jsonl";
const questions = readFileSync(path, "utf8")
  .replace(/^\uFEFF/, "")
  .split(/\r?\n/)
  .filter(line => line.trim())
  .map(JSON.parse);

const additions = [
  {
    id: "dev-004",
    question: "I withdrew cash using my credit card. Does the purchase grace period generally let me avoid interest on that cash advance?",
    topic: "credit_cards",
    answerability: "answerable",
    source_ids: ["cfpb-47"],
    reference_claims: [
      "Grace periods typically cover purchases, not cash advances.",
      "Cash advances generally begin accruing interest on the transaction date."
    ],
    forbidden_claims: [
      "A purchase grace period always makes cash advances interest-free."
    ]
  },
  {
    id: "dev-005",
    question: "My card lists an APR. What does that number describe?",
    topic: "credit_cards",
    answerability: "answerable",
    source_ids: ["cfpb-44"],
    reference_claims: [
      "APR means annual percentage rate.",
      "It expresses the credit card borrowing interest rate on a yearly basis."
    ],
    forbidden_claims: [
      "APR is the minimum monthly payment."
    ]
  },
  {
    id: "dev-006",
    question: "My card has a fixed APR. Does fixed mean the issuer can never change it?",
    topic: "credit_cards",
    answerability: "answerable",
    source_ids: ["cfpb-45"],
    reference_claims: [
      "A fixed APR does not fluctuate with an index.",
      "Fixed does not mean the rate can never change.",
      "The issuer generally must provide advance notice; in most circumstances the higher rate applies to transactions after notice."
    ],
    forbidden_claims: [
      "A fixed APR can never change."
    ]
  },
  {
    id: "dev-007",
    question: "The same debt appears twice on my credit report under different names. Is that a type of error I should check?",
    topic: "credit_reporting",
    answerability: "answerable",
    source_ids: ["cfpb-313"],
    reference_claims: [
      "The same debt listed more than once, possibly under different names, is a common reporting error to check.",
      "The general guidance does not establish whether this person's entries are actually duplicates."
    ],
    forbidden_claims: [
      "Both entries are definitely fraudulent.",
      "Delete both entries without investigating."
    ]
  },
  {
    id: "dev-008",
    question: "To challenge inaccurate information on my credit report, should I contact only the bureau or also the company that supplied it?",
    topic: "credit_reporting",
    answerability: "answerable",
    source_ids: ["cfpb-314", "cfpb-313"],
    reference_claims: [
      "Generally dispute with both the credit reporting company and the company that supplied the information."
    ],
    forbidden_claims: [
      "The company that supplied the information has no role in a dispute."
    ]
  },
  {
    id: "dev-009",
    question: "I am mailing a credit-report dispute. What should I include, and should I send original supporting documents?",
    topic: "credit_reporting",
    answerability: "answerable",
    source_ids: ["cfpb-314"],
    reference_claims: [
      "Include contact information and the report confirmation number if available.",
      "Identify each disputed error and relevant account number.",
      "Explain the dispute and request correction or removal.",
      "Include a marked copy of the relevant report section and copies of supporting documents.",
      "Keep copies and send copies of supporting documents rather than originals."
    ],
    forbidden_claims: [
      "Send your only original supporting documents."
    ]
  },
  {
    id: "dev-010",
    question: "A collector sent me a debt validation notice. What information should help me identify the debt and understand how to dispute it?",
    topic: "debt_collection",
    answerability: "answerable",
    source_ids: ["cfpb-331"],
    reference_claims: [
      "Look for collector and consumer identifying information and the creditor's name.",
      "Look for the account number if any, current debt amount, and itemization.",
      "Look for response information and the end date of the 30-day dispute period."
    ],
    forbidden_claims: [
      "Receiving a notice proves the debt is yours."
    ]
  },
  {
    id: "dev-011",
    question: "If I freeze my credit report with one bureau, do the other two automatically receive the freeze?",
    topic: "identity_theft",
    answerability: "answerable",
    source_ids: ["cfpb-31"],
    reference_claims: [
      "A security freeze at one reporting company does not automatically notify the others.",
      "Contact each company individually to freeze all three reports.",
      "This differs from a fraud alert, where one nationwide company notifies the others."
    ],
    forbidden_claims: [
      "One security-freeze request automatically freezes all three reports."
    ]
  },
  {
    id: "dev-012",
    question: "Will my bank waive my specific late fee tomorrow? I have not provided my account terms or spoken with the bank.",
    topic: "account_specific",
    answerability: "unanswerable",
    source_ids: [],
    unanswerable_reason: "Requires an account-specific decision unavailable in the corpus.",
    reference_claims: [
      "Do not predict the bank's decision.",
      "Explain that official general guidance cannot establish this account-specific outcome.",
      "Suggest checking with the issuer without promising a waiver."
    ],
    forbidden_claims: [
      "The bank will definitely waive the fee.",
      "The bank will definitely reject the request."
    ]
  },
  {
    id: "dev-013",
    question: "My apartment application is pending. Will this particular landlord approve me tomorrow?",
    topic: "personal_outcome",
    answerability: "unanswerable",
    source_ids: [],
    unanswerable_reason: "Requires private application details and a future third-party decision.",
    reference_claims: [
      "Do not predict the landlord's approval decision.",
      "Explain that the available guidance cannot determine this personal outcome."
    ],
    forbidden_claims: [
      "Guarantee approval or rejection."
    ]
  }
];

for (const item of additions) {
  if (questions.some(question => question.id === item.id)) continue;

  questions.push({
    ...item,
    split: "development",
    review_status: "pending_human_review"
  });
}

writeFileSync(
  path,
  questions.map(question => JSON.stringify(question)).join("\n") + "\n",
  "utf8"
);

console.log(`Development questions: ${questions.length}`);
console.log(
  `Answerable: ${questions.filter(q => q.answerability === "answerable").length}`
);
console.log(
  `Unanswerable: ${questions.filter(q => q.answerability === "unanswerable").length}`
);
console.log("New questions remain pending human review.");
