export const EXCERPT_FOCUS_VERSION = "excerpt-focus-v1";
export const EXCERPT_FOCUS_POLICY = Object.freeze({ minimum_coverage: 0.4, minimum_body_terms: 2 });
const STOP_WORDS = ["option","section","function","a","an","the","and","or","but","if","then","than","of","to","for","from","with","without","as","at","by","in","on","into","about","after","before","between","during","through","within","out","up","down","over","under","against","among","all","any","both","each","every","some","more","most","other","same","such","no","nor","not","only","own","so","too","very","just","also","again","still","even","already","now","here","there","this","that","these","those","it","its","is","are","was","were","be","been","being","have","has","had","having","do","does","did","doing","can","could","would","should","may","might","must","will","shall","i","me","my","mine","we","us","our","ours","you","your","yours","he","him","his","she","her","hers","they","them","their","theirs","who","whom","whose","what","which","when","where","why","how","much","many","far","long","please","tell","say","said","says","state","states","describe","describes","described","explain","explanation","explains","include","includes","included","including","look","looking","get","give","take","use","used","using","let","want","need","like","possible","possibility","know","knows","knowing","information","thing","things","detail","details","question","questions","answer","answers","ask","asks","asked","asking","passage","passages","supplied","supply","article","articles","source","sources","evidence","guidance","according","based","provide","provided","establish","establishes","mean","means","mention","mentions","suggested","suggest","suggests","happen","happens","happening","listed","list","description","go","definition","condition","exception","requirement","obligation","action","duration","permission"];
function stemTerm(value) {
 let s=value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu,"");
 if(s.length>5&&/(?:ies|ied)$/u.test(s))s=s.slice(0,-3)+"y";
 else if(s.length>6&&/ing$/u.test(s)){s=s.slice(0,-3);if(/([b-df-hj-np-tv-z])\1$/u.test(s))s=s.slice(0,-1);}
 else if(s.length>=5&&/ed$/u.test(s))s=s.slice(0,-2);
 if(s.length>5&&/(?:sses|xes|zes|ches|shes)$/u.test(s))s=s.slice(0,-2);
 else if(s.length>3&&s.endsWith("s")&&!/(?:ss|us)$/u.test(s))s=s.slice(0,-1);
 if(s.length>4&&s.endsWith("e"))s=s.slice(0,-1);
 return s;
}
const STOP = new Set(STOP_WORDS.map(stemTerm));
export function focusTerms(text) {
  return [...new Set((text.match(/[\p{L}\p{N}]+/gu) ?? []).map(stemTerm).filter(term => term.length > 1 && !STOP.has(term)))];
}
export function buildFocusVocabulary(inventory, sourceInventoryBlob) {
  if (!Array.isArray(inventory.sources) || !inventory.sources.length) throw new Error("Missing vocabulary sources.");
  const seen = new Set(), frequency = Object.create(null), sourceTerms = Object.create(null);
  for (const source of inventory.sources) {
    if (!/^cfpb-\d+$/u.test(source.source_id) || seen.has(source.source_id)) throw new Error("Invalid vocabulary source.");
    seen.add(source.source_id);
    const terms = focusTerms(source.passages.map(p => p.text).join("\n"));
    sourceTerms[source.source_id] = terms.sort();
    for (const term of terms) frequency[term] = (frequency[term] ?? 0) + 1;
  }
  return { version: "excerpt-vocabulary-v1", source_inventory_git_blob: sourceInventoryBlob,
    document_count: seen.size, source_ids: [...seen].sort(), source_terms: Object.fromEntries(Object.entries(sourceTerms)),
    declared_scope: "US CFPB general consumer guidance",
    supported_scope_aliases: ["us", "usa", "united states", "united states of america", "american", "federal", "national", "federal consumer", "consumer protection", "credit reporting", "fair credit reporting", "debt collection", "equal credit opportunity", "fcra", "ecoa"],
    document_frequency: Object.fromEntries(Object.entries(frequency).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) };
}
export function assessLegalScope(question, vocabulary) {
  const scopes = [];
  const patterns = [
    /(?:\bunder|\baccording to|\bgoverned by|\bsubject to)\s+(?:the\s+)?([\p{L}][\p{L} .'-]{0,50}?)\s+(?:laws?|regulations?|legislation)\b/giu,
    /\b(?:[Ll]aws?|[Rr]egulations?|[Ll]egislation)\s+of\s+([\p{L}]+(?:\s+\p{Lu}[\p{L}]+){0,3})/gu
  ];
  for (const pattern of patterns) for (const match of question.matchAll(pattern)) {
    scopes.push(match[1].trim().toLowerCase().replace(/[.]/gu, "").replace(/\s+/gu, " "));
  }
  // A place name appearing in an address does not establish legal jurisdiction.
  const unsupported = scopes.filter(scope => !vocabulary.supported_scope_aliases.includes(scope));
  return { confirmed: unsupported.length === 0, extracted_scopes: scopes, unconfirmed_scopes: unsupported };
}
export function assessExcerptFocus(question, unit, vocabulary, policy = EXCERPT_FOCUS_POLICY) {
  if (typeof question !== "string" || !question.trim() || typeof unit.text !== "string" || !Number.isFinite(policy.minimum_coverage) ||
    policy.minimum_coverage < 0 || policy.minimum_coverage > 1 || !Number.isInteger(policy.minimum_body_terms) || policy.minimum_body_terms < 1) {
    throw new Error("Invalid focus input or policy.");
  }
  const query = focusTerms(question), body = new Set(focusTerms(unit.text));
  const contextual = new Set(vocabulary.source_terms?.[unit.source_id] ?? focusTerms((unit.title ?? "") + "\n" + unit.text));
  const weight = term => 1 + Math.log((vocabulary.document_count + 1) / ((Object.hasOwn(vocabulary.document_frequency, term) ? vocabulary.document_frequency[term] : 0) + 1));
  const total = query.reduce((sum, term) => sum + weight(term), 0);
  const matched = query.filter(term => contextual.has(term));
  const bodyMatches = query.filter(term => body.has(term));
  const coverage = total ? matched.reduce((sum, term) => sum + weight(term), 0) / total : 0;
  const scope = assessLegalScope(question, vocabulary);
  // Unseen formal process/document terms require evidence in the frozen corpus, not just a related topic.
  // This is a conservative lexical heuristic, not a semantic entailment or POS model.
  const unconfirmedTopics = query.filter(term => /(?:tion|ment)$/u.test(term) && !Object.hasOwn(vocabulary.document_frequency, term));
  const minimumBody = Math.min(policy.minimum_body_terms, query.length);
  return { accepted: query.length > 0 && scope.confirmed && unconfirmedTopics.length === 0 && coverage >= policy.minimum_coverage && bodyMatches.length >= minimumBody,
    coverage, query_terms: query, matched_terms: matched, body_matched_terms: bodyMatches,
    missing_terms: query.filter(term => !contextual.has(term)), unconfirmed_topic_terms: unconfirmedTopics, scope };
}
