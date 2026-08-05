/**
 * 溯源链构建：语义关系 → 源文章 → MinIO 原始数据
 * 实现情报可追溯：每条关系/实体能追溯到来源文章及其 MinIO 存储位置
 */
import fs from "node:fs";
import { connectDb } from "./db";
import "dotenv/config";

interface Triple {
  subject: string; relation: string; object: string;
  evidence: string; confidence: number; articleId: number;
}

interface TraceRecord {
  triple: { subject: string; relation: string; object: string };
  evidence: string;
  confidence: number;
  source: {
    articleId: number;
    title: string | null;
    url: string | null;
    publishedAt: string | null;
    agencyId: number | null;
    storageKey: string | null;      // MinIO 路径
    imageUrl: string | null;        // 配图（多模态）
    minioPath: string | null;       // 完整 MinIO 定位
  };
}

async function main() {
  const triples: Triple[] = JSON.parse(fs.readFileSync("data/relations.json", "utf8"));
  const db = await connectDb();

  // 收集所有涉及的文章 ID
  const articleIds = [...new Set(triples.map(t => t.articleId).filter(Boolean))];
  console.log(`语义关系涉及 ${articleIds.length} 篇源文章`);

  // 批量查文章元数据 + storageKey
  const placeholders = articleIds.map(() => "?").join(",");
  const [rows] = await db.execute<any[]>(
    `SELECT id, title, url, publishedAt, agencyId, storageKey, imageUrl FROM articles WHERE id IN (${placeholders})`,
    articleIds
  );
  const articleMap = new Map<number, any>();
  for (const r of rows) articleMap.set(r.id, r);

  const BUCKET = "redroom-raw";
  const MINIO_CONSOLE = "http://localhost:9001";

  // 构建溯源记录
  const traces: TraceRecord[] = triples.map(t => {
    const art = articleMap.get(t.articleId);
    const storageKey = art?.storageKey ?? null;
    return {
      triple: { subject: t.subject, relation: t.relation, object: t.object },
      evidence: t.evidence,
      confidence: t.confidence,
      source: {
        articleId: t.articleId,
        title: art?.title ?? null,
        url: art?.url ?? null,
        publishedAt: art?.publishedAt ?? null,
        agencyId: art?.agencyId ?? null,
        storageKey,
        imageUrl: art?.imageUrl ?? null,
        minioPath: storageKey ? `${BUCKET}/${storageKey}` : null,
      },
    };
  });

  // 统计溯源完整性
  const withSource = traces.filter(t => t.source.title).length;
  const withMinio = traces.filter(t => t.source.storageKey).length;
  const withImage = traces.filter(t => t.source.imageUrl).length;

  const report = {
    generatedAt: new Date().toISOString(),
    bucket: BUCKET,
    minioConsole: MINIO_CONSOLE,
    totalTraces: traces.length,
    withSourceArticle: withSource,
    withMinioStorage: withMinio,
    withImage: withImage,
    sourceCompleteness: traces.length ? Number((withSource / traces.length * 100).toFixed(1)) : 0,
    minioCompleteness: traces.length ? Number((withMinio / traces.length * 100).toFixed(1)) : 0,
    imageCompleteness: traces.length ? Number((withImage / traces.length * 100).toFixed(1)) : 0,
    traces,
  };

  fs.writeFileSync("data/traceability.json", JSON.stringify(report, null, 2), "utf8");

  console.log("\n=== 溯源链构建完成 ===");
  console.log(`溯源记录: ${traces.length} 条`);
  console.log(`可溯源到文章: ${withSource}/${traces.length}（${report.sourceCompleteness}%）`);
  console.log(`可定位 MinIO 原文: ${withMinio}/${traces.length}（${report.minioCompleteness}%）`);
  console.log(`关联配图（多模态）: ${withImage}/${traces.length}（${report.imageCompleteness}%）`);
  console.log("\n溯源样本（前 5 条）:");
  for (const t of traces.slice(0, 5)) {
    console.log(`  ${t.triple.subject} —${t.triple.relation}→ ${t.triple.object}`);
    console.log(`    ← 文章 ${t.source.articleId}: ${(t.source.title ?? "?").slice(0, 40)}`);
    console.log(`    ← MinIO: ${t.source.minioPath ?? "（未回填）"}`);
  }
  console.log("\n输出: data/traceability.json");

  await db.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });