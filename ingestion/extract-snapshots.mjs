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

if (!Array.isArray(sources) || sources.length === 0) {
  throw new Error("Expected a nonempty source array.");
}

const documents = sources.map((source) => {
  const raw = readFileSync(resolve(root, source.snapshot_path));

  if (sha256(raw) !== source.snapshot_sha256) {
    throw new Error(`Snapshot hash mismatch: ${source.id}`);
  }

  const $ = loadBuffer(raw);
  const main = $("main .u-layout-grid__main");
  const title = clean(main.find("h1").first().text());

  if (main.length !== 1 || title !== clean(source.title)) {
    throw new Error(`Unexpected article container or title: ${source.id}`);
  }

  const answer = main.children(".block")
    .not(".block--sub, .u-screen-only");
  const lead = answer.children(".lead-paragraph");
  const answerText = answer.children(".answer-text");
  const body = answerText.children(".row");

  if (answer.length !== 1 || lead.length !== 1 ||
      answerText.length !== 1 || body.length < 1) {
    throw new Error(`Article structure changed: ${source.id}`);
  }

  const selected = lead.add(body);

  selected.find(
    "script, style, form, button, [hidden], [aria-hidden='true']"
  ).remove();

  const blocks = [];
  let tableRows = 0;
  let listItems = 0;

  selected.find("h2, h3, h4, h5, h6, p, li, tr")
    .each((_, element) => {
      const node = $(element);
      const tag = element.tagName;
      let text;

      if (tag === "tr") {
        // Each cell stays separate, rather than becoming one joined word.
        if (node.parents("tr").length) return;

        text = node.children("th, td").map((_, cell) =>
          clean($(cell).text())
        ).get().join(" | ");

        if (text) tableRows++;
      } else {
        // Table rows are captured above.
        if (node.parents("table").length) return;

        if (tag === "li") {
          // Capture a parent item's label without duplicating nested items.
          const own = node.clone();
          own.find("ul, ol").remove();
          const label = clean(own.text());
          const depth = node.parents("li").length;

          text = label ? `${"  ".repeat(depth)}- ${label}` : "";
          if (text) listItems++;
        } else {
          // Paragraphs and headings inside an item are captured with that item.
          if (node.parents("li").length) return;
          text = clean(node.text());
        }
      }

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
    extractor_version: "0.3",
    answer_rows: body.length,
    table_rows: tableRows,
    list_items: listItems,
    validation_status: "pending_human_review",
    text
  };
});

// Extract every article successfully before writing new output.
mkdirSync(resolve(root, "data/processed"), { recursive: true });

for (const document of documents) {
  writeFileSync(
    resolve(root, `data/processed/${document.source_id}.txt`),
    document.text,
    "utf8"
  );

  console.log(
    `${document.source_id}: ${document.text.length} characters; ` +
    `${document.answer_rows} answer rows; ` +
    `${document.table_rows} table rows; ` +
    `${document.list_items} list items`
  );
}

writeFileSync(
  resolve(root, "data/processed/documents.jsonl"),
  documents.map(document => JSON.stringify(document)).join("\n") + "\n",
  "utf8"
);
