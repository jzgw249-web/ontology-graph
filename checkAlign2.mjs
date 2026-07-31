import fs from "node:fs";

// 共现图谱的节点（中文规范名）
const graph = JSON.parse(fs.readFileSync("data/graph.json", "utf8"));
const graphNodes = new Set(graph.nodes.map(n => n.id));
console.log(`共现图谱节点: ${graphNodes.size} 个`);

// 三元组的实体名
const triples = JSON.parse(fs.readFileSync("data/relations.json", "utf8"));
const names = new Set();
for (const t of triples) { names.add(t.subject); names.add(t.object); }
console.log(`三元组实体名: ${names.size} 个\n`);

// 直接比对（都是中文规范名，应该能对上）
let matched = 0;
const unmatched = [];
for (const name of names) {
  if (graphNodes.has(name)) matched++;
  else unmatched.push(name);
}
console.log(`能对齐共现图谱: ${matched}/${names.size} (${(matched/names.size*100).toFixed(0)}%)`);
console.log(`\n未对齐的前 20 个:`);
unmatched.slice(0, 20).forEach(n => console.log("  " + n));