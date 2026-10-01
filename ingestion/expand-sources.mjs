import { readFileSync, writeFileSync } from "node:fs";

const path = "../evaluation/datasets/sources.json";
const sources = JSON.parse(
  readFileSync(path, "utf8").replace(/^\uFEFF/, "")
);

if (!Array.isArray(sources)) {
  throw new Error("Expected a flat source array.");
}

const additions = [
  {
    id: "cfpb-44",
    title: "What is a credit card interest rate? What does APR mean?",
    slug: "what-is-a-credit-card-interest-rate-what-does-apr-mean-en-44"
  },
  {
    id: "cfpb-45",
    title: "What is the difference between a fixed APR and a variable APR?",
    slug: "what-is-the-difference-between-a-fixed-apr-and-a-variable-apr-en-45"
  },
  {
    id: "cfpb-313",
    title: "What are common credit report errors that I should look for on my credit report?",
    slug: "what-are-common-credit-report-errors-that-i-should-look-for-on-my-credit-report-en-313"
  },
  {
    id: "cfpb-314",
    title: "How do I dispute an error on my credit report?",
    slug: "how-do-i-dispute-an-error-on-my-credit-report-en-314"
  },
  {
    id: "cfpb-331",
    title: "What information does a debt collector have to give me about a debt they’re trying to collect from me?",
    slug: "what-information-does-a-debt-collector-have-to-give-me-about-the-debt-en-331"
  },
  {
    id: "cfpb-31",
    title: "What do I do if I am a victim of identity theft?",
    slug: "what-do-i-do-if-i-am-a-victim-of-identity-theft-en-31"
  }
];

for (const item of additions) {
  if (sources.some(source => source.id === item.id)) continue;

  sources.push({
    id: item.id,
    title: item.title,
    url: `https://www.consumerfinance.gov/ask-cfpb/${item.slug}/`,
    verified_on: "2026-10-01",
    snapshot_status: "pending"
  });
}

writeFileSync(path, JSON.stringify(sources, null, 2) + "\n", "utf8");
console.log(`Source registry contains ${sources.length} articles.`);
