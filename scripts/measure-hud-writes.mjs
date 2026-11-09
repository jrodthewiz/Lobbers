import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = "client/src/ui/Hud.ts";
const baselineCommit = "d446891652f8dcf6bf2f0b3dcd425fa617d72f5d";
const baseline = execFileSync("git", ["show", `${baselineCommit}:${sourcePath}`], { cwd: root, encoding: "utf8" });
const candidate = await fs.readFile(path.join(root, sourcePath), "utf8");

// Extract the actual production setters and lookup method; do not copy their implementation.
const loadSetters = source => {
  const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const hudClass = ast.statements.find(s => ts.isClassDeclaration(s) && s.name?.text === "Hud");
  assert(hudClass);
  const methods = ["setText", "setBar", "byId"].map(name => {
    const method = hudClass.members.find(m => ts.isMethodDeclaration(m) && m.name.getText(ast) === name);
    assert(method, `Missing ${name}`);
    return method.getText(ast);
  });
  const isolated = `class HudSetters { ${methods.join("\n")} }\nHudSetters;`;
  const output = ts.transpileModule(isolated, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(output);
};

const measure = source => {
  const counts = { textContentAssignments: 0, widthAssignments: 0 };
  const nodes = new Map();
  const makeNode = () => {
    let text = "", width = "";
    return {
      get textContent() { return text; },
      set textContent(value) { counts.textContentAssignments++; text = value; },
      style: {
        get width() { return width; },
        set width(value) { counts.widthAssignments++; width = value; },
      },
    };
  };
  const Type = loadSetters(source);
  const hud = Object.assign(Object.create(Type.prototype), {
    root: { querySelector: selector => {
      if (!nodes.has(selector)) nodes.set(selector, makeNode());
      return nodes.get(selector);
    } },
  });
  // Same 60-sample, 100 ms mixed lobby/combat trace for both revisions.
  // Integer HP/charge/shield percentages avoid claiming browser fractional CSS serialization.
  for (let tick = 0; tick < 60; tick++) {
    hud.setText("statusText", tick < 10 ? "Ready" : tick < 20 ? "Waiting for rival" : "Connected");
    hud.setText("selectedAmmo", tick < 40 ? "Javelin" : "Shotput");
    hud.setText("blueHpText", tick < 35 ? "100 HP" : "72 HP");
    hud.setText("redHpText", tick < 45 ? "100 HP" : "44 HP");
    hud.setText("turnClock", tick < 20 ? "-" : String(7 - Math.floor((tick - 20) / 10)));
    hud.setBar("blueHpBar", tick < 35 ? 100 : 72);
    hud.setBar("redHpBar", tick < 45 ? 100 : 44);
    hud.setBar("chargeFill", tick >= 25 && tick <= 29 ? (tick - 24) * 20 : 0);
    hud.setBar("shieldFill", tick < 40 ? 100 : 50);
  }
  return { ...counts, totalAssignments: counts.textContentAssignments + counts.widthAssignments,
    finalValues: Object.fromEntries([...nodes].map(([key, n]) => [key, { text: n.textContent, width: n.style.width }])) };
};
const before = measure(baseline);
const after = measure(candidate);
assert.deepEqual(after.finalValues, before.finalValues);
const report = {
  baselineCommit, sourcePath, sourceSha256: {
    baseline: createHash("sha256").update(baseline).digest("hex"),
    candidate: createHash("sha256").update(candidate).digest("hex"),
  }, trace: { samples: 60, sampleIntervalMs: 100, labels: 5, bars: 4 },
  measurement: "Actual extracted production setters with DOM-like property instrumentation, integer percentages; not browser layout, elapsed-time, memory, or FPS measurement.",
  before, after, assignmentsAvoided: before.totalAssignments - after.totalAssignments,
  finalValuesEquivalent: true,
};
const json = JSON.stringify(report, null, 2) + "\n";
if (process.argv[2]) await fs.writeFile(path.resolve(process.argv[2]), json);
console.log(json);
