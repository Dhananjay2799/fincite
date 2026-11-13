import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { verifyHostedRows, retrieveHostedRows } from "../apps/web/src/lib/server/hosted-retrieval.mjs";
import { createHostedResponder } from "../apps/web/src/lib/server/hosted-service.mjs";

const text = "Cash advances generally accrue interest from the transaction date.";
const hash = createHash("sha256").update(text).digest("hex");
const row = { chunk_id: "test-chunk", source_id: "cfpb-47", document_sha256: "document-hash", chunk_sha256: hash,
  chunk_text: text, title: "Grace periods", url: "https://www.consumerfinance.gov/ask-cfpb/example/" };
const manifest = { chunks: [{ chunk_id: row.chunk_id, source_id: row.source_id, document_sha256: row.document_sha256, chunk_sha256: hash }],
  documents: [{ source_id: row.source_id, document_sha256: row.document_sha256, url: row.url }] };
const resources = { retrieve: async () => [row], rank: async (_, units) => units.map(u => ({ unit_id: u.unit_id, score: 5 })) };

test("hosted provenance checks actual text, document hash, source and canonical URL", () => {
  assert.deepEqual(verifyHostedRows([row], manifest), [row]);
  for (const change of [{ chunk_text: "Send original documents." }, { document_sha256: "stale" },
    { source_id: "cfpb-314" }, { chunk_id: "unknown" }, { url: "https://example.com" }, { chunk_sha256: "stale" }]) {
    assert.throws(() => verifyHostedRows([{ ...row, ...change }], manifest));
  }
});

test("the hosted SQL binds question and embedding, restricts corpus IDs and excludes stale embeddings", async () => {
  let called = false;
  const question = "'); DROP TABLE fincite_chunks; --";
  const sql = async (strings, ...values) => {
    called = true;
    assert.ok(values.includes(question));
    assert.ok(!strings.join("").includes(question));
    assert.match(strings.join(""), /e.input_sha256 = c.chunk_sha256/);
    assert.match(strings.join(""), /e.normalized = true/);
    assert.ok(values.some(v => Array.isArray(v) && v.includes(row.chunk_id)));
    return [row];
  };
  const rows = await retrieveHostedRows(sql, question, [1, 0], { dimensions: 2, document_prefix: "", model_id: "model", model_revision: "pinned" }, manifest);
  assert.ok(called); assert.equal(rows[0].chunk_text, text);
});

test("invalid embeddings fail before a database request", async () => {
  await assert.rejects(retrieveHostedRows(() => { throw new Error("Must not query"); }, "q", [NaN], { dimensions: 1, document_prefix: "" }, manifest), /Invalid query embedding/);
});

test("warm requests reuse resources and return excerpts without generation", async () => {
  let loads = 0;
  const answer = createHostedResponder(async () => { loads++; return resources; });
  for (let i = 0; i < 2; i++) {
    const result = await answer("Does a cash advance qualify?");
    assert.equal(result.answer, text + " [cfpb-47]");
    assert.equal(result.generation_attempts, 0);
  }
  assert.equal(loads, 1);
});

test("a failed cold initialization is recoverable rather than cached forever", async () => {
  let attempts = 0;
  const answer = createHostedResponder(async () => { if (++attempts === 1) throw new Error("Download failed"); return resources; });
  await assert.rejects(answer("q"), /Download failed/);
  assert.equal((await answer("q")).output_mode, "source_excerpts");
  assert.equal(attempts, 2);
});

test("overlapping requests cannot double-load model resources in one instance", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const answer = createHostedResponder(async () => { await pending; return resources; });
  const first = answer("q");
  await assert.rejects(answer("q"), { status: 429 });
  release(); await first;
  assert.equal((await answer("q")).output_mode, "source_excerpts");
});

test("a cancelled cold-start request does not proceed to retrieval and leaves resources reusable", async () => {
  const controller = new AbortController();
  let retrieved = 0;
  const answer = createHostedResponder(async () => { controller.abort(); return { ...resources,
    retrieve: async () => { retrieved++; return [row]; } }; });
  await assert.rejects(answer("q", { signal: controller.signal }), { name: "AbortError" });
  assert.equal(retrieved, 0);
  await answer("q");
  assert.equal(retrieved, 1);
});

test("hosted reranking receives a supporting passage beyond the old five-row cutoff", async () => {
 const invitation="If you have a problem with credit reporting, you can submit a complaint to the CFPB.";
 const workflow="If you have a complaint, tell us about your issue—we’ll forward your issue to the company, give you a tracking number, and keep you updated on the status of your complaint.";
 const fixtures=Array.from({length:6},(_,i)=>{
  const chunk_text=i===5?workflow:invitation;
  return {...row,chunk_id:"recall-"+i,source_id:"cfpb-313",chunk_text,
   chunk_sha256:createHash("sha256").update(chunk_text).digest("hex")};
 });
 const pinned={chunks:fixtures.map(r=>({chunk_id:r.chunk_id,source_id:r.source_id,document_sha256:r.document_sha256,chunk_sha256:r.chunk_sha256})),
  documents:[{source_id:"cfpb-313",document_sha256:row.document_sha256,url:row.url}]};
 const responder=createHostedResponder(async()=>({
  retrieve:q=>retrieveHostedRows(async()=>fixtures,q,[1,0],{dimensions:2,document_prefix:"",model_id:"model",model_revision:"pinned"},pinned),
  rank:async(_,units)=>units.map(u=>({unit_id:u.unit_id,score:u.text===workflow?8:0}))
 }));
 const response=await responder("What does the CFPB do after I submit a complaint?");
 assert.equal(response.answer,workflow+" [cfpb-313]");
 assert.equal(response.generation_attempts,0);
});
