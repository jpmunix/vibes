import * as path from "path";
import * as fs from "fs";

function parseSectionDirectives(body: string) {
  const directives = [];
  const regex = /<!--\s*@section\s+(\S+)\s+"([^"]+)"\s*-->/g;
  let match;
  while ((match = regex.exec(body)) !== null) {
    directives.push({ target: match[1], title: match[2] });
  }
  return directives;
}

const content = fs.readFileSync("/home/munix/Desarrollo/GitRepo/minube-vibes/assets/release-notes/index.md", "utf-8");
console.log(parseSectionDirectives(content));
