// Add Ask CFPB articles from the selected category listings to the source
// registry as pending entries. Existing entries, including their recorded
// snapshot hashes, are never changed. Run download-sources.mjs afterwards.
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import { load } from "cheerio";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registry = resolve(root, "evaluation/datasets/sources.json");
const origin = "https://www.consumerfinance.gov";
const categories = ["credit-cards", "credit-reports-and-scores", "debt-collection"];
const clean = text => text.replace(/\s+/g, " ").trim();

async function listing(category, page) {
  const url = `${origin}/consumer-tools/${category}/answers/?page=${page}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "FinCite/0.1 (consumer-finance research)", "Accept": "text/html" },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  if (new URL(response.url).hostname !== "www.consumerfinance.gov") throw new Error("Unexpected redirect destination.");
  return load(await response.text());
}

const sources = JSON.parse(readFileSync(registry, "utf8").replace(/^﻿/, ""));
if (!Array.isArray(sources)) throw new Error("Expected a flat source array.");
const known = new Set(sources.map(source => source.id));
const today = new Date().toISOString().slice(0, 10);
let added = 0;

for (const category of categories) {
  let pages = 1;
  for (let page = 1; page <= pages; page++) {
    const $ = await listing(category, page);
    if (page === 1) {
      const max = Number($(".m-pagination__current-page").first().attr("max") ?? 1);
      if (!Number.isInteger(max) || max < 1 || max > 50) throw new Error(`Unexpected page count: ${category}`);
      pages = max;
    }
    const links = $("article a[href^='/ask-cfpb/']");
    if (links.length === 0) throw new Error(`No article links: ${category} page ${page}`);
    links.each((_, element) => {
      const href = $(element).attr("href");
      const match = /^\/ask-cfpb\/[a-z0-9-]+-en-(\d+)\/$/.exec(href);
      const title = clean($(element).text());
      if (!match || !title) throw new Error(`Unexpected article link: ${href}`);
      const id = `cfpb-${match[1]}`;
      if (known.has(id)) return;
      known.add(id);
      sources.push({ id, title, url: origin + href, category, verified_on: today, snapshot_status: "pending" });
      added++;
    });
    console.log(`${category} page ${page}/${pages}: ${links.length} links`);
    await pause(1000);
  }
}

writeFileSync(`${registry}.tmp`, JSON.stringify(sources, null, 2) + "\n", "utf8");
renameSync(`${registry}.tmp`, registry);
console.log(`Added ${added} pending articles; registry contains ${sources.length}.`);
