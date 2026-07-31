import fs from "node:fs";

// 读完整图谱
const graph = JSON.parse(fs.readFileSync("data/graph.json", "utf8"));
console.log(`完整图谱: ${graph.nodes.length} 节点, ${graph.edges.length} 边`);

// ── 过滤参数（可调）──
const TOP_NODES = 150;   // 保留出现次数最高的前 N 个节点
const MIN_EDGE_WEIGHT = 3;  // 边至少共现 3 次才画

// 1. 选 Top N 高频节点
const topNodes = [...graph.nodes]
  .sort((a, b) => b.count - a.count)
  .slice(0, TOP_NODES);
const keepIds = new Set(topNodes.map(n => n.id));

// 2. 只保留两端都在 Top N、且权重达标的边
const keepEdges = graph.edges.filter(
  e => keepIds.has(e.source) && keepIds.has(e.target) && e.weight >= MIN_EDGE_WEIGHT
);

// 3. 去掉过滤后变成孤立点的节点（没有边连接的）
const connectedIds = new Set();
for (const e of keepEdges) { connectedIds.add(e.source); connectedIds.add(e.target); }
const finalNodes = topNodes.filter(n => connectedIds.has(n.id));

// 类型 → 颜色
const TYPE_COLOR = {
  person: "#ef4444",
  organization: "#8b5cf6",
  location: "#22d3ee",
  facility: "#f59e0b",
  event: "#22c55e",
};
const TYPE_LABEL = {
  person: "人物", organization: "组织", location: "地点",
  facility: "设施", event: "事件",
};

// 转成 vis-network 格式
const visNodes = finalNodes.map(n => ({
  id: n.id,
  label: n.id,
  value: n.count,              // 节点大小 = 出现次数
  color: TYPE_COLOR[n.type] || "#999",
  title: `${TYPE_LABEL[n.type] || n.type}｜出现 ${n.count} 篇`,
  group: n.type,
}));
const visEdges = keepEdges.map(e => ({
  from: e.source,
  to: e.target,
  value: e.weight,             // 边粗细 = 共现次数
  title: `共现 ${e.weight} 次`,
}));

fs.writeFileSync("data/viz.json", JSON.stringify({ nodes: visNodes, edges: visEdges }, null, 2), "utf8");
console.log(`可视化子图: ${visNodes.length} 节点, ${visEdges.length} 边`);
console.log("输出: data/viz.json");