import fs from "node:fs";
import { connectDb } from "./db";
import "dotenv/config";

const KNOWN_COUNTRIES = new Set([
  "伊朗","美国","以色列","沙特阿拉伯","埃及","叙利亚","伊拉克","黎巴嫩","约旦","土耳其",
  "卡塔尔","科威特","巴林","阿联酋","也门","利比亚","苏丹","突尼斯","阿尔及利亚","摩洛哥",
  "中国","俄罗斯","英国","法国","德国","意大利","西班牙","印度","巴基斯坦","阿富汗",
  "乌克兰","波兰","加拿大","巴西","阿根廷","日本","韩国","朝鲜","巴勒斯坦","欧盟",
]);

interface GraphNode { id: string; type: string; count: number; }
interface GraphEdge { source: string; target: string; weight: number; }
interface Graph { nodes: GraphNode[]; edges: GraphEdge[]; meta: any; }

// 编辑距离（检测高相似实体）
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return dp[m][n];
}

async function main() {
  const graph: Graph = JSON.parse(fs.readFileSync("data/graph.json", "utf8"));
  const db = await connectDb();
  const report: any = { generatedAt: new Date().toISOString(), dimensions: {} };
  const PENDING = "待后续阶段启用";

  // ═══ 维度1：准确性 ═══
  const acc: any = { name: "准确性", sub: {} };
  // 1.1 实体类型错配率
  let typeErrors = 0; const errSamples: string[] = [];
  const checkedCountries = graph.nodes.filter(n => KNOWN_COUNTRIES.has(n.id));
  for (const n of checkedCountries) {
    if (n.type !== "location") { typeErrors++; if (errSamples.length < 8) errSamples.push(`${n.id}→${n.type}`); }
  }
  acc.sub.typeMismatch = {
    name: "实体类型错配率", value: checkedCountries.length ? Number((typeErrors/checkedCountries.length*100).toFixed(1)) : 0,
    unit: "%", detail: `${typeErrors}/${checkedCountries.length} 已知国家名类型错配`, samples: errSamples,
  };
  // 1.2 无效实体占比（isNoise）
  const [noiseRows] = await db.execute<any[]>("SELECT COUNT(*) AS total, SUM(isNoise) AS noise FROM entity_aliases");
  const nTotal = noiseRows[0].total || 0, nNoise = Number(noiseRows[0].noise) || 0;
  acc.sub.invalidRate = {
    name: "无效实体占比", value: nTotal ? Number((nNoise/nTotal*100).toFixed(1)) : 0,
    unit: "%", detail: `${nNoise}/${nTotal} 被标记为噪音`,
  };
  // 1.3 属性错误率（待启用）
  acc.sub.attrError = { name: "实体属性错误率", value: null, status: PENDING, detail: "需先建立实体属性 schema" };
  // 准确性得分 = 100 - 类型错配率 - 无效占比（有效指标平均）
  acc.score = Number((100 - (acc.sub.typeMismatch.value + acc.sub.invalidRate.value) / 2).toFixed(1));
  report.dimensions.accuracy = acc;

  // ═══ 维度2：完整性 ═══
  const comp: any = { name: "完整性", sub: {} };
  // 2.1 归一覆盖率
  const [aRows] = await db.execute<any[]>(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN canonicalZh IS NOT NULL AND canonicalZh!='' THEN 1 ELSE 0 END) AS mapped FROM entity_aliases WHERE isNoise=0"
  );
  const cTotal = aRows[0].total || 0, cMapped = Number(aRows[0].mapped) || 0;
  comp.sub.normalizeCoverage = {
    name: "实体归一覆盖率", value: cTotal ? Number((cMapped/cTotal*100).toFixed(1)) : 0,
    unit: "%", detail: `${cMapped}/${cTotal} 已映射规范名`,
  };
  // 2.2 必填属性完整率（现有必填=类型+规范名）
  const [reqRows] = await db.execute<any[]>(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN entityType IS NOT NULL AND entityType!='' AND canonicalZh IS NOT NULL AND canonicalZh!='' THEN 1 ELSE 0 END) AS complete FROM entity_aliases WHERE isNoise=0"
  );
  const rTotal = reqRows[0].total || 0, rComplete = Number(reqRows[0].complete) || 0;
  comp.sub.requiredAttr = {
    name: "实体必填属性完整率", value: rTotal ? Number((rComplete/rTotal*100).toFixed(1)) : 0,
    unit: "%", detail: `${rComplete}/${rTotal} 类型+规范名齐全（当前必填项）`,
  };
  comp.score = Number(((comp.sub.normalizeCoverage.value + comp.sub.requiredAttr.value) / 2).toFixed(1));
  report.dimensions.completeness = comp;

  // ═══ 维度3：一致性 ═══
  const cons: any = { name: "一致性", sub: {} };
  // 3.1 同名多类型冲突率
  const [multiType] = await db.execute<any[]>(
    `SELECT canonicalZh, COUNT(DISTINCT entityType) AS types FROM entity_aliases
     WHERE isNoise=0 AND canonicalZh IS NOT NULL AND canonicalZh!='' GROUP BY canonicalZh HAVING types>1`
  );
  const distinctCanon = new Set(graph.nodes.map(n => n.id)).size;
  cons.sub.multiTypeConflict = {
    name: "同名多类型冲突率", value: distinctCanon ? Number((multiType.length/distinctCanon*100).toFixed(1)) : 0,
    unit: "%", detail: `${multiType.length} 个规范名对应多种类型`,
    samples: multiType.slice(0, 8).map((r: any) => `${r.canonicalZh}(${r.types}类)`),
  };
  // 3.2 高相似实体未合并率（节点两两比编辑距离，短名相似疑似未合并）
  const nodeIds = graph.nodes.map(n => n.id).filter(id => id.length >= 2 && id.length <= 8);
  let similarPairs = 0; const simSamples: string[] = [];
  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      const a = nodeIds[i], b = nodeIds[j];
      if (Math.abs(a.length - b.length) > 2) continue;
      // 一方包含另一方，或编辑距离=1
      if ((a.includes(b) || b.includes(a) || levenshtein(a, b) === 1)) {
        similarPairs++;
        if (simSamples.length < 8) simSamples.push(`${a}↔${b}`);
      }
    }
  }
  cons.sub.unmergedSimilar = {
    name: "高相似实体未合并率", value: distinctCanon ? Number((similarPairs/distinctCanon*100).toFixed(1)) : 0,
    unit: "%", detail: `${similarPairs} 对高相似实体疑似未合并`, samples: simSamples,
  };
  // 3.3 关系矛盾率（待启用，需语义关系）
  cons.sub.relationConflict = { name: "实体关系矛盾率", value: null, status: PENDING, detail: "需先构建语义关系（当前为共现关系，无方向语义）" };
  cons.score = Number((100 - (cons.sub.multiTypeConflict.value + cons.sub.unmergedSimilar.value) / 2).toFixed(1));
  report.dimensions.consistency = cons;

  // ═══ 维度4：连通性 ═══
  const conn: any = { name: "连通性", sub: {} };
  const nodeCount = graph.nodes.length, edgeCount = graph.edges.length;
  const degree = new Map<string, number>();
  graph.nodes.forEach(n => degree.set(n.id, 0));
  graph.edges.forEach(e => { degree.set(e.source,(degree.get(e.source)||0)+1); degree.set(e.target,(degree.get(e.target)||0)+1); });
  const isolated = [...degree.values()].filter(d => d === 0).length;
  const avgDegree = nodeCount ? (edgeCount*2)/nodeCount : 0;
  // 最大连通分量 BFS
  const adj = new Map<string, string[]>();
  graph.nodes.forEach(n => adj.set(n.id, []));
  graph.edges.forEach(e => { adj.get(e.source)?.push(e.target); adj.get(e.target)?.push(e.source); });
  const visited = new Set<string>(); let maxComp = 0;
  for (const n of graph.nodes) {
    if (visited.has(n.id)) continue;
    let size = 0; const q = [n.id]; visited.add(n.id);
    while (q.length) { const c = q.shift()!; size++; for (const nb of adj.get(c)||[]) if (!visited.has(nb)) { visited.add(nb); q.push(nb); } }
    maxComp = Math.max(maxComp, size);
  }
  conn.sub.isolatedRate = { name: "孤立实体节点率", value: nodeCount ? Number((isolated/nodeCount*100).toFixed(1)) : 0, unit: "%", detail: `${isolated}/${nodeCount} 孤立节点` };
  conn.sub.avgDegree = { name: "全局平均关联度", value: Number(avgDegree.toFixed(2)), unit: "", detail: `平均每个实体连接 ${avgDegree.toFixed(2)} 个其他实体` };
  conn.sub.maxComponent = { name: "最大连通分量占比", value: nodeCount ? Number((maxComp/nodeCount*100).toFixed(1)) : 0, unit: "%", detail: `${maxComp}/${nodeCount} 在最大连通子图` };
  // 4.4 分层连通度（按实体类型：每种类型节点的平均类内度）
  const typeMap = new Map<string, string>();
  graph.nodes.forEach(n => typeMap.set(n.id, n.type));
  const intraEdges: Record<string, number> = {}, typeNodes: Record<string, number> = {};
  graph.nodes.forEach(n => { typeNodes[n.type] = (typeNodes[n.type]||0)+1; });
  graph.edges.forEach(e => { if (typeMap.get(e.source) === typeMap.get(e.target)) { const t = typeMap.get(e.source)!; intraEdges[t] = (intraEdges[t]||0)+1; } });
  const layered: Record<string, number> = {};
  for (const t of Object.keys(typeNodes)) layered[t] = typeNodes[t] ? Number(((intraEdges[t]||0)/typeNodes[t]).toFixed(2)) : 0;
  conn.sub.layeredConnectivity = { name: "分层连通度", value: null, detail: "各实体类型的类内平均连接数", byType: layered };
  conn.score = Number(((100 - conn.sub.isolatedRate.value) * 0.4 + conn.sub.maxComponent.value * 0.6).toFixed(1));
  report.dimensions.connectivity = conn;

  // ═══ 维度5：时效性 ═══
  const time: any = { name: "时效性", sub: {} };
  const [freshRows] = await db.execute<any[]>("SELECT MAX(publishedAt) AS latest, MIN(publishedAt) AS earliest FROM articles WHERE publishedAt IS NOT NULL");
  const latest = freshRows[0].latest ? new Date(freshRows[0].latest) : null;
  const earliest = freshRows[0].earliest ? new Date(freshRows[0].earliest) : null;
  const now = new Date();
  const hoursOld = latest ? (now.getTime() - latest.getTime()) / 3600000 : null;
  const spanDays = (latest && earliest) ? (latest.getTime() - earliest.getTime()) / 86400000 : null;
  time.sub.freshness = {
    name: "数据新鲜度", value: hoursOld !== null ? Number(hoursOld.toFixed(1)) : null, unit: "小时",
    detail: latest ? `最新数据距今 ${hoursOld!.toFixed(1)} 小时（${latest.toISOString().slice(0,16)}）` : "无数据",
  };
  time.sub.timeSpan = {
    name: "时间覆盖跨度", value: spanDays !== null ? Number(spanDays.toFixed(1)) : null, unit: "天",
    detail: (latest && earliest) ? `${earliest.toISOString().slice(0,10)} ~ ${latest.toISOString().slice(0,10)}，跨度 ${spanDays!.toFixed(1)} 天` : "无数据",
  };
  // 时效性得分：新鲜度<24h 满分，越旧越低
  time.score = hoursOld !== null ? Number(Math.max(0, 100 - hoursOld / 24 * 10).toFixed(1)) : null;
  report.dimensions.timeliness = time;

  // ═══ 综合评分（仅计入有分数的维度）═══
  const scored = Object.values(report.dimensions).map((d: any) => d.score).filter((s: any) => s !== null);
  report.overallScore = Number((scored.reduce((a: number, b: number) => a + b, 0) / scored.length).toFixed(1));

  fs.writeFileSync("data/quality-report.json", JSON.stringify(report, null, 2), "utf8");

  // ═══ 打印 ═══
  console.log("\n╔══════════ 本体质量评价报告 ══════════╗");
  console.log(`综合评分: ${report.overallScore} / 100\n`);
  for (const d of Object.values(report.dimensions) as any[]) {
    console.log(`【${d.name}】${d.score !== null ? d.score + "分" : "（部分待启用）"}`);
    for (const s of Object.values(d.sub) as any[]) {
      const v = s.value !== null && s.value !== undefined ? `${s.value}${s.unit || ""}` : `[${s.status || "—"}]`;
      console.log(`   ${s.name}: ${v}  ${s.detail || ""}`);
      if (s.samples?.length) console.log(`      样本: ${s.samples.slice(0,5).join("、")}`);
      if (s.byType) console.log(`      分层: ${Object.entries(s.byType).map(([k,v])=>`${k}=${v}`).join("、")}`);
    }
    console.log("");
  }
  console.log("输出: data/quality-report.json");
  console.log("╚═══════════════════════════════════════╝");

  await db.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });