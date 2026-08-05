import fs from "node:fs";
import mysql from "mysql2/promise";
import "dotenv/config";

const graph = JSON.parse(fs.readFileSync("data/graph.json", "utf8"));
const graphNodes = new Map(graph.nodes.map(n => [n.id, n]));
const triples = JSON.parse(fs.readFileSync("data/relations.json", "utf8"));

// ── 二次翻译映射：连数据库读 canonicalEn/raw(小写) -> canonicalZh ──
const db = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || "redroom", password: process.env.DB_PASSWORD || "redroom",
  database: process.env.DB_NAME || "redroom",
});
const [aliasRows] = await db.execute("SELECT raw, canonicalEn, canonicalZh FROM entity_aliases WHERE isNoise=0 AND canonicalZh IS NOT NULL AND canonicalZh != ''");
const zhMap = new Map();
for (const r of aliasRows) {
  if (r.raw) zhMap.set(r.raw.trim().toLowerCase(), r.canonicalZh);
  if (r.canonicalEn) zhMap.set(r.canonicalEn.trim().toLowerCase(), r.canonicalZh);
}
await db.end();
// 补翻函数：中文原样返回，英文查映射，查不到保留原文
const toZh = (name) => {
  if (/[\u4e00-\u9fa5]/.test(name)) return name;  // 已含中文，不动
  return zhMap.get(name.trim().toLowerCase()) || name;
};

const REL_GROUP = {
  攻击: "conflict", 威胁: "conflict", 敌对: "conflict",
  结盟: "cooperation", 支持: "cooperation", 谈判: "cooperation",
  制裁: "diplomacy", 谴责: "diplomacy", 协议: "diplomacy",
  隶属: "structure", 位于: "structure", 涉及: "structure",
};
const GROUP_COLOR = { conflict: "#ef4444", cooperation: "#22c55e", diplomacy: "#f59e0b", structure: "#8b5cf6" };

const edgeMap = new Map();
const nodeSet = new Set();
for (const t of triples) {
  const key = `${t.subject}|${t.relation}|${t.object}`;
  nodeSet.add(t.subject); nodeSet.add(t.object);
  if (edgeMap.has(key)) { const e = edgeMap.get(key); e.weight++; e.confidence = Math.max(e.confidence, t.confidence); }
  else edgeMap.set(key, {
    from: t.subject, to: t.object, relation: t.relation,
    weight: 1, confidence: t.confidence, evidence: t.evidence,
    group: REL_GROUP[t.relation] || "structure",
  });
}

let fixedCount = 0;
const nodes = [...nodeSet].map(name => {
  const gn = graphNodes.get(name);
  const zhLabel = toZh(name);
  if (zhLabel !== name) fixedCount++;
  return {
    id: name, label: zhLabel,       // id 保持原值（边连接用），label 补中文（显示用）
    inGraph: !!gn,
    type: gn ? gn.type : "unknown",
    value: gn ? gn.count : 1,
  };
});

const edges = [...edgeMap.values()].map(e => ({
  ...e, color: GROUP_COLOR[e.group], label: e.relation,
  title: `${toZh(e.from)} —${e.relation}→ ${toZh(e.to)}（${e.weight}次，置信${e.confidence}）「${e.evidence}」`,
}));

fs.writeFileSync("data/semantic-graph.json", JSON.stringify({ nodes, edges }, null, 2), "utf8");

console.log("=== 语义关系图 ===");
console.log(`节点: ${nodes.length}（对齐共现图谱 ${nodes.filter(n=>n.inGraph).length}）`);
console.log(`二次补翻: ${fixedCount} 个英文实体补成中文`);
console.log(`有向边: ${edges.length}`);
const byGroup = {};
for (const e of edges) byGroup[e.group] = (byGroup[e.group]||0)+1;
console.log("关系分组:", Object.entries(byGroup).map(([k,v])=>`${k}=${v}`).join("、"));
console.log("输出: data/semantic-graph.json");