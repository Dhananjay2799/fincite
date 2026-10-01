import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBuffer } from "cheerio";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clean = (text) => text.replace(/\s+/g, " ").trim();
const sha256 = (data) =>
  createHash("sha256").update(data).digest("hex");

const sources = JSON.parse(
  readFileSync(
    resolve(root, "evaluation/datasets/sources.json"),
    "utf8"
  ).replace(/^\uFEFF/, "")
);

if (!Array.isArray(sources)) {
  throw new Error("sources.json must contain an array.");
}

const documents = sources.map((source) => {
  const raw = readFileSync(resolve(root, source.snapshot_path));

  if (sha256(raw) !== source.snapshot_sha256) {
    throw new Error(`Snapshot hash mismatch: ${source.id}`);
  }

  const $ = loadBuffer(raw);
  const main = $("main .u-layout-grid__main");

  if (main.length !== 1) {
    throw new Error(`Expected one main container: ${source.id}`);
  }

  const title = clean(main.find("h1").first().text());

  if (title !== clean(source.title)) {
    throw new Error(`Unexpected article title: ${source.id}`);
  }

  const answer = main.children(".block")
    .not(".block--sub, .u-screen-only");

  const lead = answer.children(".lead-paragraph");
  const body = answer.children(".answer-text").children(".row");

  if (answer.length !== 1 || lead.length !== 1 || body.length !== 1) {
    throw new Error(`Article structure changed: ${source.id}`);
  }

  const selected = lead.add(body);

  selected.find(
    "script, style, form, button, [hidden], [aria-hidden='true']"
  ).remove();

  const blocks = [];

  selected.find("h2, h3, p, li").each((_, element) => {
    // Capture paragraphs inside list items only through their parent item.
    if ($(element).parents("li").length) return;

    const text = clean($(element).text());
    if (text) blocks.push(text);
  });

  const text = [title, ...blocks].join("\n\n");

  if (blocks.length < 2 || text.length < 300) {
    throw new Error(`Too little article content: ${source.id}`);
  }

  return {
    source_id: source.id,
    title,
    url: source.url,
    raw_sha256: source.snapshot_sha256,
    text_sha256: sha256(text),
    extractor_version: "0.2",
    validation_status: "pending_human_review",
    text
  };
});

mkdirSync(resolve(root, "data/processed"), { recursive: true });

for (const document of documents) {
  writeFileSync(
    resolve(root, `data/processed/${document.source_id}.txt`),
    document.text,
    "utf8"
  );

  console.log(
    `${document.source_id}: extracted ${document.text.length} characters`
  );
}

writeFileSync(
  resolve(root, "data/processed/documents.jsonl"),
  documents.map((document) => JSON.stringify(document)).join("\n") + "\n",
  "utf8"
);
