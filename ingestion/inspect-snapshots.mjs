import { readFileSync } from "node:fs";
import { loadBuffer } from "cheerio";

for (const id of ["cfpb-47", "cfpb-1253"]) {
  const $ = loadBuffer(
    readFileSync(`../data/raw/${id}.html`)
  );

  const heading = $("h1").first();

  console.log(`\nSOURCE: ${id}`);
  console.log("TITLE:", heading.text().trim());
  console.log("MAIN ELEMENTS:", $("main").length);
  console.log("ARTICLE ELEMENTS:", $("article").length);
  console.log("EDITOR BLOCKS:", $(".o-editor").length);

  console.log("HEADING CONTAINERS:");
  heading.parents().slice(0, 5).each((_, element) => {
    console.log(
      element.tagName,
      $(element).attr("class") || "(no class)"
    );
  });
}
