import { readFileSync } from "node:fs";
import { loadBuffer } from "cheerio";

for (const id of [
  "cfpb-44", "cfpb-45", "cfpb-313",
  "cfpb-314", "cfpb-331", "cfpb-31"
]) {
  const $ = loadBuffer(
    readFileSync(`../data/raw/${id}.html`)
  );

  const main = $("main .u-layout-grid__main");

  console.log(`\nSOURCE: ${id}`);
  console.log("TITLE:", main.find("h1").first().text().trim());

  console.log("COUNTS:", {
    answerBlocks: main.children(".block")
      .not(".block--sub, .u-screen-only").length,
    leads: main.find(".lead-paragraph").length,
    answerText: main.find(".answer-text").length,
    directRows: main.find(".answer-text").children(".row").length
  });

  main.children().each((_, element) => {
    const node = $(element);

    console.log("MAIN CHILD:", {
      tag: element.tagName,
      class: node.attr("class") || "",
      preview: node.text().replace(/\s+/g, " ").trim().slice(0, 80)
    });
  });

  main.find(".answer-text").each((_, element) => {
    $(element).children().each((_, child) => {
      const node = $(child);

      console.log("ANSWER CHILD:", {
        tag: child.tagName,
        class: node.attr("class") || "",
        preview: node.text().replace(/\s+/g, " ").trim().slice(0, 80)
      });
    });
  });
}
