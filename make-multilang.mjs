import mysql from "mysql2/promise";
import fs from "node:fs";
import "dotenv/config";
const db = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || "redroom", password: process.env.DB_PASSWORD || "redroom",
  database: process.env.DB_NAME || "redroom",
});

// 拉所有实体的中/英/阿名。一个 canonicalZh 可能对应多个 raw，取阿语原文（含阿拉伯字符的）最常见的
const [rows] = await db.execute(`
  SELECT canonicalZh, canonicalEn, raw, freq
  FROM entity_aliases
  WHERE isNoise=0 AND canonicalZh IS NOT NULL AND canonicalZh != ''
`);

// 按中文名聚合三语
const langMap = new Map();  // zh -> {zh, en, ar, arFreq}
for (const r of rows) {
  const zh = r.canonicalZh.trim();
  if (!langMap.has(zh)) langMap.set(zh, { zh, en: r.canonicalEn || "", ar: "", arFreq: -1 });
  const rec = langMap.get(zh);
  if (!rec.en && r.canonicalEn) rec.en = r.canonicalEn;
  // raw 含阿拉伯字符则作为阿语候选，取 freq 最高的
  if (/[\u0600-\u06FF]/.test(r.raw || "")) {
    const f = r.freq || 0;
    if (f > rec.arFreq) { rec.ar = r.raw.trim(); rec.arFreq = f; }
  }
}

const labels = {};
for (const [zh, rec] of langMap) {
  labels[zh] = { zh: rec.zh, en: rec.en, ar: rec.ar };
}

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/multilang.json", JSON.stringify(labels, null, 2), "utf8");

const total = Object.keys(labels).length;
const withEn = Object.values(labels).filter(l => l.en).length;
const withAr = Object.values(labels).filter(l => l.ar).length;
console.log(`✓ 三语标签 ${total} 个实体 → data/multilang.json`);
console.log(`  有英文: ${withEn}（${(withEn/total*100).toFixed(0)}%）`);
console.log(`  有阿语: ${withAr}（${(withAr/total*100).toFixed(0)}%）`);
console.log("\n样本:");
["伊朗","以色列","加沙","沙特阿拉伯","哈马斯"].forEach(k => {
  if (labels[k]) console.log(`  ${k}: en=${labels[k].en} | ar=${labels[k].ar}`);
});

await db.end();
process.exit(0);