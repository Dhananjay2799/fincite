import { readFileSync } from "node:fs";
import { loadBuffer } from "cheerio";

for (const id of ["cfpb-47", "cfpb-1253"]) {
  const $ = loadBuffer(
    readFileSync(`../data/raw/${id}.html`)
  );

  console.log(`\nSOURCE: ${id}`);

  const main = $("main .u-layout-grid__main");

  console.log("DIRECT CONTENT CONTAINERS:");
  main.children().each((_, element) => {
    const node = $(element);

    console.log({
      tag: element.tagName,
      class: node.attr("class") || "",
      preview: node.text().replace(/\s+/g, " ").trim().slice(0, 160)
    });
  });
}
