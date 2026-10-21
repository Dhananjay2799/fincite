// Ranking context only. Never prepend metadata to copied source quotations.
export const RERANKER_INPUT_VERSION = "cfpb-publisher-context-v1";
export function excerptRankingText(unit) {
  const url = new URL(unit.url);
  if (url.protocol !== "https:" || url.hostname !== "www.consumerfinance.gov" ||
      !/^cfpb-\d+$/u.test(unit.source_id) || typeof unit.text !== "string") {
    throw new Error("Invalid CFPB ranking source.");
  }
  return "Consumer Financial Protection Bureau (CFPB) source excerpt:\n" + unit.text;
}
