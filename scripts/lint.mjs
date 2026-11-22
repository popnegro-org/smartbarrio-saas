import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const roots = ["app", "components", "lib"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const files = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (extensions.has(path.extname(entry.name))) files.push(full);
  }
}

for (const root of roots) walk(root);
if (fs.existsSync("middleware.ts")) files.push("middleware.ts");

let failures = 0;
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".jsx") ? ts.ScriptKind.JSX : file.endsWith(".js") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  for (const diagnostic of parsed.parseDiagnostics) {
    const point = parsed.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    process.stderr.write(file + ":" + (point.line + 1) + ":" + (point.character + 1) + " " + ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n") + "\n");
    failures += 1;
  }
  if (/^(<<<<<<<|=======|>>>>>>>)( |$)/m.test(source)) {
    process.stderr.write(file + ": merge conflict marker detected\n");
    failures += 1;
  }
}
if (failures) process.exit(1);
process.stdout.write("Source syntax and conflict-marker checks passed (" + files.length + " files).\n");
