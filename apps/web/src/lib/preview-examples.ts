import type { ChatAnswer } from "./chat-types";
export type PreviewExample = ChatAnswer & { id: string; topic: string; title: string; question: string; icon: "card" | "percent" | "shield" | "spark" };

// Curated UI examples, not model outputs or live retrieval. Never use as
// benchmark predictions. Only explicit example buttons select these answers.
export const previewExamples: PreviewExample[] = [
  { id: "grace", topic: "CREDIT CARDS", title: "Minimum payment, still interest?", icon: "card",
    question: "Why am I charged interest when I pay my credit card minimum payment on time?",
    answer: "Paying the minimum on time does not necessarily prevent interest.\n\nIf your card offers a grace period and you are not carrying a balance, you can avoid interest on new purchases by paying your balance in full by the due date.\n\nNot paying in full can cause you to lose that grace period. Interest can then apply to the unpaid balance and to new purchases from the date of each purchase.",
    disposition: "answer", sources: [{ id: "cfpb-47", title: "What is a grace period for a credit card?", url: "https://www.consumerfinance.gov/ask-cfpb/what-is-a-grace-period-for-a-credit-card-en-47/", quote: "If your card gives a grace period and you are not carrying a balance, then you can avoid paying interest on new purchases if you pay your balance in full by the due date." }] },
  { id: "apr", topic: "THE BASICS", title: "What does APR actually mean?", icon: "percent",
    question: "My card lists an APR. What does that number describe?",
    answer: "APR stands for annual percentage rate. It expresses your credit card’s borrowing interest rate on a yearly basis.",
    disposition: "answer", sources: [{ id: "cfpb-44", title: "What is a credit card interest rate? What does APR mean?", url: "https://www.consumerfinance.gov/ask-cfpb/what-is-a-credit-card-interest-rate-what-does-apr-mean-en-44/", quote: "For credit cards, the interest rates are typically stated as a yearly rate. This is called the annual percentage rate (APR)." }] },
  { id: "freeze", topic: "CREDIT REPORTS", title: "One freeze. All three bureaus?", icon: "shield",
    question: "If I freeze my credit report with one bureau, do the other two automatically receive the freeze?",
    answer: "No. A security freeze at one credit reporting company does not automatically notify the others. You need to contact each company individually to freeze all three reports.\n\nA fraud alert works differently: placing one with a nationwide credit reporting company triggers notification to the other two.",
    disposition: "answer", sources: [{ id: "cfpb-31", title: "What do I do if I am a victim of identity theft?", url: "https://www.consumerfinance.gov/ask-cfpb/what-do-i-do-if-i-am-a-victim-of-identity-theft-en-31/", quote: "Unlike fraud alerts, if you place a security freeze with one credit reporting company, they do not notify the other credit reporting companies. You must contact each credit reporting company individually if you would like to place a security freeze with all three nationwide credit reporting companies." }] },
  { id: "limits", topic: "EVIDENCE LIMITS", title: "Can it predict Bitcoin’s price?", icon: "spark",
    question: "What will Bitcoin be worth next December?", answer: "The available CFPB guidance does not establish a future Bitcoin price. I cannot give a price prediction from this evidence.", disposition: "evidence_limited", sources: [] },
];
