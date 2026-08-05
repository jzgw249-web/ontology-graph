import mysql from "mysql2/promise";
import fs from "node:fs";
import "dotenv/config";

const db = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || "redroom", password: process.env.DB_PASSWORD || "redroom",
  database: process.env.DB_NAME || "redroom",
});

// 拉所有带图文章 + 实体 + 主题
const [rows] = await db.execute(`
  SELECT id, title, titleZh, imageUrl, url, country, topics, entitiesJson, storageKey
  FROM articles
  WHERE imageUrl IS NOT NULL AND imageUrl != ''
  ORDER BY publishedAt DESC
`);
console.log(`带图文章: ${rows.length} 篇`);

const media = rows.map(r => {
  // 提取实体名（供检索）
  let entities = [];
  try {
    const e = typeof r.entitiesJson === "string" ? JSON.parse(r.entitiesJson) : r.entitiesJson;
    if (e) entities = [...(e.persons||[]), ...(e.organizations||[]), ...(e.locations||[]), ...(e.facilities||[]), ...(e.events||[])].filter(x => typeof x === "string");
  } catch {}
  let topics = [];
  try { topics = JSON.parse(r.topics ?? "[]"); } catch {}
  return {
    articleId: r.id,
    title: r.titleZh || r.title,
    imageUrl: r.imageUrl,
    url: r.url,
    country: r.country,
    topics,
    entities: [...new Set(entities)].slice(0, 15),
    minioPath: r.storageKey ? `redroom-raw/${r.storageKey}` : null,
  };
});

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/media.json", JSON.stringify(media, null, 2), "utf8");

// 统计
const allTopics = {};
media.forEach(m => m.topics.forEach(t => allTopics[t] = (allTopics[t]||0)+1));
console.log(`✓ 媒体资源 ${media.length} 条 → data/media.json`);
console.log("主题分布:", Object.entries(allTopics).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}=${v}`).join("、"));

await db.end();
process.exit(0);