import fs from "node:fs";
import { connectDb } from "./db";
import type { RawEntities, EntityType, Graph, GraphNode, GraphEdge } from "./types";
import "dotenv/config";

// 实体类型 → 节点 key 前缀（避免不同类型同名实体混淆）
const TYPE_FIELDS: { field: keyof RawEntities; type: EntityType }[] = [
  { field: "persons", type: "person" },
  { field: "organizations", type: "organization" },
  { field: "locations", type: "location" },
  { field: "facilities", type: "facility" },
  { field: "events", type: "event" },
];

// 噪音过滤：太短、纯数字、常见停用词
function isNoise(name: string): boolean {
  const n = name.trim();
  if (n.length < 2) return true;
  if (/^\d+$/.test(n)) return true;
  if (["the", "a", "an", "and", "of", "in", "on"].includes(n.toLowerCase())) return true;
  return false;
}

async function main() {
  const db = await connectDb();

  // 读别名映射（规范化用）
  const [aliasRows] = await db.execute<any[]>(
    "SELECT raw, canonicalZh, canonicalEn, isNoise FROM entity_aliases"
  );
  const aliasMap = new Map<string, string>();
  const noiseSet = new Set<string>();
  for (const r of aliasRows) {
    const canon = (r.canonicalZh && r.canonicalZh.trim()) || (r.canonicalEn && r.canonicalEn.trim()) || null;
    if (r.raw && canon) aliasMap.set(r.raw.trim().toLowerCase(), canon);
    if (r.isNoise === 1 && r.raw) noiseSet.add(r.raw.trim().toLowerCase());
  }
  console.log(`加载 ${aliasMap.size} 条别名映射，${noiseSet.size} 个噪音标记`);

  const normalize = (name: string) => {
    const key = name.trim().toLowerCase();
    return aliasMap.get(key) || name.trim();
  };

  // 读有实体的文章
  const [rows] = await db.execute<any[]>(
    "SELECT id, entitiesJson FROM articles WHERE entitiesJson IS NOT NULL"
  );
  console.log(`读取 ${rows.length} 篇文章`);

  const nodeMap = new Map<string, GraphNode>();     // id -> node
  const edgeMap = new Map<string, GraphEdge>();      // "a|b" -> edge
  let usedArticles = 0;

  for (const row of rows) {
    let ents: RawEntities;
    try {
      ents = typeof row.entitiesJson === "string" ? JSON.parse(row.entitiesJson) : row.entitiesJson;
    } catch { continue; }
    if (!ents) continue;

    // 收集这篇文章的所有实体（规范化 + 去噪 + 去重）
    const articleEntities: { id: string; type: EntityType }[] = [];
    const seen = new Set<string>();
    for (const { field, type } of TYPE_FIELDS) {
      const arr = ents[field];
      if (!Array.isArray(arr)) continue;
      for (const raw of arr) {
        if (typeof raw !== "string" || isNoise(raw)) continue;
        if (noiseSet.has(raw.trim().toLowerCase())) continue;
        const canon = normalize(raw);
        if (isNoise(canon)) continue;
        const id = canon;
        if (seen.has(id)) continue;
        seen.add(id);
        articleEntities.push({ id, type });
      }
    }

    if (articleEntities.length < 2) continue;  // 至少 2 个实体才能连边
    usedArticles++;

    // 更新节点计数
    for (const e of articleEntities) {
      const node = nodeMap.get(e.id);
      if (node) node.count++;
      else nodeMap.set(e.id, { id: e.id, type: e.type, count: 1 });
    }

    // 两两配对生成共现边
    for (let i = 0; i < articleEntities.length; i++) {
      for (let j = i + 1; j < articleEntities.length; j++) {
        const [a, b] = [articleEntities[i].id, articleEntities[j].id].sort();
        const key = `${a}|${b}`;
        const edge = edgeMap.get(key);
        if (edge) edge.weight++;
        else edgeMap.set(key, { source: a, target: b, weight: 1 });
      }
    }
  }

  const graph: Graph = {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    meta: { articleCount: usedArticles, generatedAt: new Date().toISOString() },
  };

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/graph.json", JSON.stringify(graph, null, 2), "utf8");

  console.log("\n=== 图谱构建完成 ===");
  console.log(`有效文章: ${usedArticles}`);
  console.log(`节点数: ${graph.nodes.length}`);
  console.log(`边数: ${graph.edges.length}`);
  console.log("输出: data/graph.json");

  // 打印 top 10 高频节点
  const top = [...graph.nodes].sort((a, b) => b.count - a.count).slice(0, 10);
  console.log("\nTop 10 高频实体:");
  for (const n of top) console.log(`  [${n.type}] ${n.id} — ${n.count} 篇`);

  await db.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
