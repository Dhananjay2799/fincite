import { readFileSync } from "node:fs";
import { loadBuffer } from "cheerio";

for (const id of ["cfpb-47", "cfpb-1253"]) {
  const $ = loadBuffer(
    readFileSync(`../data/raw/${id}.html`)
  );

  console.log(`\nSOURCE: ${id}`);

  const answer = $("main .u-layout-grid__main")
    .children(".block")
    .not(".block--sub, .u-screen-only");

  if (answer.length !== 1) {
    throw new Error(`Expected one answer block for ${id}`);
  }

  function inspect(parent, depth = 0) {
    parent.children().each((_, element) => {
      const node = $(element);

      console.log({
        depth,
        tag: element.tagName,
        class: node.attr("class") || "",
        preview: node.text().replace(/\s+/g, " ").trim().slice(0, 100)
      });

      if (depth < 2) inspect(node, depth + 1);
    });
  }

  inspect(answer);
}
