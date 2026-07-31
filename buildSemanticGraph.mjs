import fs from "node:fs";

const graph = JSON.parse(fs.readFileSync("data/graph.json", "utf8"));
const graphNodes = new Map(graph.nodes.map(n => [n.id, n]));
const triples = JSON.parse(fs.readFileSync("data/relations.json", "utf8"));

// 关系类型分组着色
const REL_GROUP = {
  攻击: "conflict", 威胁: "conflict", 敌对: "conflict",
  结盟: "cooperation", 支持: "cooperation", 谈判: "cooperation",
  制裁: "diplomacy", 谴责: "diplomacy", 协议: "diplomacy",
  隶属: "structure", 位于: "structure", 涉及: "structure",
};
const GROUP_COLOR = {
  conflict: "#ef4444", cooperation: "#22c55e", diplomacy: "#f59e0b", structure: "#8b5cf6",
};

// 合并同主体-关系-客体（多篇文章支持同一关系 = 权重累加）
const edgeMap = new Map();
const nodeSet = new Set();
for (const t of triples) {
  const key = `${t.subject}|${t.relation}|${t.object}`;
  nodeSet.add(t.subject); nodeSet.add(t.object);
  if (edgeMap.has(key)) {
    const e = edgeMap.get(key);
    e.weight++;
    e.confidence = Math.max(e.confidence, t.confidence);
  } else {
    edgeMap.set(key, {
      from: t.subject, to: t.object, relation: t.relation,
      weight: 1, confidence: t.confidence, evidence: t.evidence,
      group: REL_GROUP[t.relation] || "structure",
    });
  }
}

// 节点（标注是否在共现图谱中）
const nodes = [...nodeSet].map(name => {
  const gn = graphNodes.get(name);
  return {
    id: name, label: name,
    inGraph: !!gn,
    type: gn ? gn.type : "unknown",
    value: gn ? gn.count : 1,
  };
});

const edges = [...edgeMap.values()].map(e => ({
  ...e,
  color: GROUP_COLOR[e.group],
  label: e.relation,
  title: `${e.from} —${e.relation}→ ${e.to}（${e.weight}次，置信${e.confidence}）「${e.evidence}」`,
}));

fs.writeFileSync("data/semantic-graph.json", JSON.stringify({ nodes, edges }, null, 2), "utf8");

console.log("=== 语义关系图 ===");
console.log(`节点: ${nodes.length}（对齐共现图谱 ${nodes.filter(n=>n.inGraph).length}）`);
console.log(`有向边: ${edges.length}`);
const byGroup = {};
for (const e of edges) byGroup[e.group] = (byGroup[e.group]||0)+1;
console.log("关系分组:", Object.entries(byGroup).map(([k,v])=>`${k}=${v}`).join("、"));
console.log("输出: data/semantic-graph.json");