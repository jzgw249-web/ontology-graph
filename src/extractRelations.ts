import fs from "node:fs";
import { connectDb } from "./db";
import "dotenv/config";

// ── 12 种预定义关系类型 ──
const RELATION_TYPES = [
  "攻击", "威胁", "敌对",      // 冲突类
  "结盟", "支持", "谈判",      // 合作类
  "制裁", "谴责", "协议",      // 外交类
  "隶属", "位于", "涉及",      // 结构类
];

const LLM_URL = process.env.LLM_API_URL!;
const LLM_KEY = process.env.LLM_API_KEY!;
const LLM_MODEL = process.env.LLM_MODEL || "deepseek-chat";

interface Triple {
  subject: string;
  relation: string;
  object: string;
  evidence: string;
  confidence: number;
  articleId: number;
}

// 调 LLM 抽三元组
async function extractFromArticle(
  articleId: number, title: string, content: string, entities: string[]
): Promise<Triple[]> {
  const sys = `你是地缘政治情报关系抽取专家。从新闻中抽取实体间的关系三元组。
关系类型只能是以下12种之一：${RELATION_TYPES.join("、")}。
- 攻击/威胁/敌对：军事或对抗关系
- 结盟/支持/谈判：合作关系
- 制裁/谴责/协议：外交行为
- 隶属/位于/涉及：结构关系（涉及为兜底）
只抽取文中明确表达的关系，不臆测。【重要】主体和客体必须从给定的实体列表中选择，直接使用列表中的中文名称，不要用英文或文中其他表述。涉及的实体不在列表中则跳过该关系。
严格返回JSON数组，格式：[{"subject":"主体","relation":"关系类型","object":"客体","evidence":"原文依据(20字内)","confidence":0.0到1.0}]
无明确关系则返回 []。只返回JSON，不要其他文字。`;

  const user = `实体列表：${entities.join("、")}
标题：${title}
正文：${content.slice(0, 800)}`;

  try {
    const resp = await fetch(`${LLM_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LLM_KEY}` },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) { console.error(`  文章 ${articleId} LLM ${resp.status}`); return []; }
    const data: any = await resp.json();
    let text = data.choices?.[0]?.message?.content || "";
    text = text.replace(/```json|```/g, "").trim();

    // LLM 可能返回 {"relations":[...]} 或直接 [...]
    let arr: any[];
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) arr = parsed;
    else if (Array.isArray(parsed.relations)) arr = parsed.relations;
    else if (Array.isArray(parsed.triples)) arr = parsed.triples;
    else arr = Object.values(parsed).find(v => Array.isArray(v)) as any[] || [];

    return arr
      .filter(t => t.subject && t.relation && t.object && RELATION_TYPES.includes(t.relation))
      .map(t => ({
        subject: String(t.subject).trim(),
        relation: t.relation,
        object: String(t.object).trim(),
        evidence: String(t.evidence || "").slice(0, 40),
        confidence: typeof t.confidence === "number" ? t.confidence : 0.5,
        articleId,
      }));
  } catch (e) {
    console.error(`  文章 ${articleId} 抽取失败: ${(e as Error).message}`);
    return [];
  }
}

async function main() {
  const LIMIT = Number(process.argv[2] || 100);
  const OFFSET = Number(process.argv[3] || 0);
  const APPEND = process.argv[4] === "append";
  const db = await connectDb();

  const [aliasRows] = await db.execute<any[]>(
    "SELECT raw, canonicalZh, canonicalEn FROM entity_aliases WHERE isNoise=0"
  );
  const aliasMap = new Map<string, string>();
  for (const r of aliasRows) {
    const canon = (r.canonicalZh && r.canonicalZh.trim()) || (r.canonicalEn && r.canonicalEn.trim());
    if (r.raw && canon) aliasMap.set(r.raw.trim().toLowerCase(), canon);
  }
  const normalize = (name: string) => aliasMap.get(name.trim().toLowerCase()) || name.trim();
  console.log(`加载 ${aliasMap.size} 条别名映射`);

  const [rows] = await db.execute<any[]>(
    `SELECT id, title, content, entitiesJson FROM articles
     WHERE CHAR_LENGTH(content) > 100 AND entitiesJson IS NOT NULL
     ORDER BY id DESC LIMIT ${LIMIT} OFFSET ${OFFSET}`
  );
  console.log(`抽取 ${rows.length} 篇文章的语义关系...\n`);

  const allTriples: Triple[] = [];
  let processed = 0;

  for (const row of rows) {
    // 收集实体名（供 LLM 参考）
    let entities: string[] = [];
    try {
      const e = typeof row.entitiesJson === "string" ? JSON.parse(row.entitiesJson) : row.entitiesJson;
      entities = [
        ...(e.persons || []), ...(e.organizations || []),
        ...(e.locations || []), ...(e.facilities || []), ...(e.events || []),
      ].filter((x: any) => typeof x === "string" && x.length >= 2);
    } catch {}
    if (entities.length < 2) continue;  // 至少 2 个实体

    const canonEntities = [...new Set(entities.map(normalize))].filter(e => e.length >= 2);
    const triples = await extractFromArticle(row.id, row.title, row.content, canonEntities.slice(0, 20));
    allTriples.push(...triples);
    processed++;
    if (processed % 10 === 0) console.log(`  已处理 ${processed}/${rows.length}，累计 ${allTriples.length} 三元组`);
  }

  // 输出
  fs.mkdirSync("data", { recursive: true });
  let finalTriples = allTriples;
  if (APPEND) {
    try {
      const existing = JSON.parse(fs.readFileSync("data/relations.json", "utf8"));
      finalTriples = [...existing, ...allTriples];
      console.log(`追加模式：已有 ${existing.length} + 新增 ${allTriples.length} = ${finalTriples.length}`);
    } catch { console.log("追加模式：无已有文件，从头写"); }
  }
  fs.writeFileSync("data/relations.json", JSON.stringify(finalTriples, null, 2), "utf8");

  // 统计
  const byType: Record<string, number> = {};
  for (const t of allTriples) byType[t.relation] = (byType[t.relation] || 0) + 1;

  console.log("\n=== 语义关系抽取完成 ===");
  console.log(`处理文章: ${processed}`);
  console.log(`抽取三元组: ${allTriples.length}`);
  console.log("\n关系类型分布:");
  for (const [rel, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${rel}: ${n}`);
  }
  console.log("\n样本（前 8 条）:");
  for (const t of allTriples.slice(0, 8)) {
    console.log(`  ${t.subject} —${t.relation}→ ${t.object}  (${t.confidence}) 「${t.evidence}」`);
  }
  console.log("\n输出: data/relations.json");

  await db.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });