import { answerWithExcerpts } from "../../../../../ingestion/source-excerpts.mjs";
import { buildEvidenceUnits } from "../../../../../ingestion/evidence-units.mjs";

// Reuse immutable model resources within one warm instance. This is not a
// persistent cache or a distributed rate limit. Bound inference to one request.
export function createHostedResponder(loadResources) {
  let resourcesPromise;
  let busy = false;
  return async function answerHostedQuestion(question, { signal } = {}) {
    signal?.throwIfAborted();
    if (busy) throw Object.assign(new Error("This instance is busy."), { status: 429 });
    busy = true;
    try {
      resourcesPromise ??= Promise.resolve().then(loadResources).catch(error => {
        resourcesPromise = undefined;
        throw error;
      });
      const resources = await resourcesPromise;
      signal?.throwIfAborted();
      return await answerWithExcerpts(question, { retrieve: q => resources.retrieve(q, signal),
        buildUnits: buildEvidenceUnits, rank: resources.rank, signal });
    } finally { busy = false; }
  };
}
