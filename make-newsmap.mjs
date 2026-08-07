import mysql from "mysql2/promise";
import fs from "node:fs";
import "dotenv/config";

const db = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || "redroom", password: process.env.DB_PASSWORD || "redroom",
  database: process.env.DB_NAME || "redroom",
});

const GEO = JSON.parse(fs.readFileSync("data/geo-seed.json", "utf8"));

// 别名归一化（同 src/buildGraph.ts 的 normalize 写法），isNoise=0 的记录优先
const [aliasRows] = await db.execute(
  "SELECT raw, canonicalZh, canonicalEn, isNoise FROM entity_aliases"
);
const aliasMap = new Map();
for (const r of aliasRows) {
  const canon = (r.canonicalZh && r.canonicalZh.trim()) || (r.canonicalEn && r.canonicalEn.trim()) || null;
  if (r.raw && canon) aliasMap.set(r.raw.trim().toLowerCase(), canon);
}
for (const r of aliasRows) {
  if (r.isNoise !== 1 && r.raw) {
    const canon = (r.canonicalZh && r.canonicalZh.trim()) || (r.canonicalEn && r.canonicalEn.trim()) || null;
    if (canon) aliasMap.set(r.raw.trim().toLowerCase(), canon);
  }
}
function normalize(name) {
  const key = name.trim().toLowerCase();
  return aliasMap.get(key) || name.trim();
}

const [rows] = await db.execute(`
  SELECT id, title, titleZh, imageUrl, url, country, publishedAt, entitiesJson, topics, storageKey
  FROM articles
  WHERE publishedAt >= DATE_SUB(NOW(), INTERVAL 3 DAY)
  ORDER BY publishedAt DESC
`);
console.log(`近3天文章: ${rows.length} 篇`);

let matched = 0, skipped = 0;
const locationCounts = {};
const items = [];

for (const r of rows) {
  let locations = [];
  try {
    const e = typeof r.entitiesJson === "string" ? JSON.parse(r.entitiesJson) : r.entitiesJson;
    if (e && Array.isArray(e.locations)) locations = e.locations.filter(x => typeof x === "string");
  } catch {}

  let point = null;
  for (const raw of locations) {
    const canon = normalize(raw);
    if (GEO[canon]) { point = { name: canon, lng: GEO[canon][0], lat: GEO[canon][1] }; break; }
  }

  if (!point) { skipped++; continue; }
  matched++;

  let topics = [];
  try { topics = JSON.parse(r.topics ?? "[]"); } catch {}

  // 事件类型来自 MinIO 存储目录前缀（topics 字段实际为空，storageKey 是可靠来源）
  const eventType = r.storageKey && r.storageKey.includes("/")
    ? r.storageKey.split("/")[0]
    : "uncategorized";

  locationCounts[point.name] = (locationCounts[point.name] || 0) + 1;

  items.push({
    articleId: r.id,
    title: r.titleZh || r.title,
    publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
    lng: point.lng,
    lat: point.lat,
    locationName: point.name,
    imageUrl: r.imageUrl || null,
    topics,
    eventType,
    url: r.url,
    minioPath: r.storageKey ? `redroom-raw/${r.storageKey}` : null,
  });
}

items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/newsmap.json", JSON.stringify(items, null, 2), "utf8");

const top10 = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
const typeCounts = {};
items.forEach(n => typeCounts[n.eventType] = (typeCounts[n.eventType] || 0) + 1);

console.log(`\n=== 新闻地图生成完成 ===`);
console.log(`查询文章总数: ${rows.length}`);
console.log(`成功匹配坐标: ${matched}`);
console.log(`跳过（无匹配地点）: ${skipped}`);
console.log(`按地点分组 Top 10:`);
for (const [name, count] of top10) console.log(`  ${name} — ${count} 条`);
console.log(`按事件类型分组:`);
for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${type} — ${count} 条`);
console.log(`输出: data/newsmap.json`);

await db.end();
process.exit(0);
