/**
 * 本体公理合规检测
 * 从 ontology.ts 读取公理定义，对图谱/关系数据逐条检测，
 * 按公理绑定的质量维度归类扣分 —— 实现"本体即质量规则"
 */
import fs from "node:fs";
import { AXIOMS, type AxiomDef } from "./ontology";
import { connectDb } from "./db";
import "dotenv/config";

const KNOWN_COUNTRIES = new Set([
  "伊朗","美国","以色列","沙特阿拉伯","埃及","叙利亚","伊拉克","黎巴嫩","约旦","土耳其",
  "卡塔尔","科威特","巴林","阿联酋","也门","利比亚","苏丹","突尼斯","阿尔及利亚","摩洛哥",
  "中国","俄罗斯","英国","法国","德国","意大利","西班牙","印度","巴基斯坦","阿富汗",
  "乌克兰","波兰","加拿大","巴西","阿根廷","日本","韩国","朝鲜","巴勒斯坦","欧盟",
]);

interface AxiomResult {
  id: string;
  zh: string;
  boundDimension: string;
  detectable: boolean;
  violations: number;       // 违规数量
  total: number;            // 检测基数
  violationRate: number;    // 违规率 %
  penalty: number;          // 实际扣分
  samples: string[];        // 违规样本
  note?: string;
}

async function main() {
  const graph = JSON.parse(fs.readFileSync("data/graph.json", "utf8"));
  const db = await connectDb();

  const results: AxiomResult[] = [];

  for (const ax of AXIOMS) {
    const r: AxiomResult = {
      id: ax.id, zh: ax.zh, boundDimension: ax.boundDimension,
      detectable: ax.detectable, violations: 0, total: 0, violationRate: 0, penalty: 0, samples: [],
    };

    if (!ax.detectable) {
      r.note = "待第二步属性/全量数据启用";
      results.push(r);
      continue;
    }

    // ── C1 国家独立性：已知国家被标为非 location/country 类型 ──
    if (ax.id === "C1") {
      const countries = graph.nodes.filter((n: any) => KNOWN_COUNTRIES.has(n.id));
      const bad = countries.filter((n: any) => n.type !== "location" && n.type !== "Country");
      r.total = countries.length;
      r.violations = bad.length;
      r.samples = bad.slice(0, 8).map((n: any) => `${n.id}(标为${n.type})`);
      r.penalty = r.total ? Number((r.violations / r.total * 20).toFixed(1)) : 0; // 最多扣20
    }

    // ── C3 攻击方向性：同一对实体 attack+support 并存 ──
    if (ax.id === "C3") {
      try {
        const triples = JSON.parse(fs.readFileSync("data/relations.json", "utf8"));
        const CONFLICT = new Set(["攻击","威胁","敌对","制裁","谴责"]);
        const FRIENDLY = new Set(["结盟","支持","谈判","协议"]);
        const pairs = new Map<string, { c: boolean; f: boolean }>();
        for (const t of triples) {
          if (t.subject === t.object) continue;
          const key = [t.subject, t.object].sort().join(" ↔ ");
          const rec = pairs.get(key) || { c: false, f: false };
          if (CONFLICT.has(t.relation)) rec.c = true;
          if (FRIENDLY.has(t.relation)) rec.f = true;
          pairs.set(key, rec);
        }
        const conflicts = [...pairs.entries()].filter(([, v]) => v.c && v.f);
        r.total = pairs.size;
        r.violations = conflicts.length;
        r.samples = conflicts.slice(0, 8).map(([k]) => k);
        r.penalty = r.total ? Number((r.violations / r.total * 15).toFixed(1)) : 0;
      } catch { r.note = "缺 relations.json"; }
    }

    // ── C5 规范名必填：实体缺 canonicalZh ──
    if (ax.id === "C5") {
      const [rows] = await db.execute<any[]>(
        "SELECT COUNT(*) AS total, SUM(CASE WHEN canonicalZh IS NULL OR canonicalZh='' THEN 1 ELSE 0 END) AS missing FROM entity_aliases WHERE isNoise=0"
      );
      r.total = rows[0].total || 0;
      r.violations = Number(rows[0].missing) || 0;
      r.penalty = r.total ? Number((r.violations / r.total * 10).toFixed(1)) : 0;
    }

    // ── C7 兜底关系比例：涉及关系占比超阈值 ──
    if (ax.id === "C7") {
      try {
        const triples = JSON.parse(fs.readFileSync("data/relations.json", "utf8"));
        const involveCount = triples.filter((t: any) => t.relation === "涉及").length;
        r.total = triples.length;
        r.violations = involveCount;
        r.violationRate = r.total ? Number((involveCount / r.total * 100).toFixed(1)) : 0;
        const THRESHOLD = 40; // 阈值 40%
        const excess = Math.max(0, r.violationRate - THRESHOLD);
        r.penalty = Number((excess / 100 * 20).toFixed(1)); // 超出部分按比例扣，最多20
        r.samples = [`涉及关系 ${involveCount}/${r.total} = ${r.violationRate}%（阈值${THRESHOLD}%）`];
      } catch { r.note = "缺 relations.json"; }
    }

    if (r.total && !r.violationRate) r.violationRate = Number((r.violations / r.total * 100).toFixed(1));
    results.push(r);
  }

  // 按质量维度汇总扣分
  const dimPenalty: Record<string, number> = { accuracy: 0, completeness: 0, consistency: 0, connectivity: 0 };
  for (const r of results) if (r.detectable) dimPenalty[r.boundDimension] += r.penalty;

  const report = { generatedAt: new Date().toISOString(), axioms: results, dimensionPenalty: dimPenalty };
  fs.writeFileSync("data/axiom-report.json", JSON.stringify(report, null, 2), "utf8");

  // 打印
  console.log("\n╔════════ 本体公理合规检测 ════════╗\n");
  const DIM_ZH: Record<string,string> = { accuracy:"准确性", completeness:"完整性", consistency:"一致性", connectivity:"连通性" };
  for (const r of results) {
    const status = r.detectable ? `违规 ${r.violations}/${r.total}（${r.violationRate}%）扣${r.penalty}分` : `[${r.note}]`;
    console.log(`${r.id} ${r.zh} → ${DIM_ZH[r.boundDimension]}`);
    console.log(`   ${status}`);
    if (r.samples.length) console.log(`   样本: ${r.samples.slice(0,4).join("、")}`);
    console.log("");
  }
  console.log("各维度公理扣分汇总:");
  for (const [dim, pen] of Object.entries(dimPenalty)) {
    console.log(`   ${DIM_ZH[dim]}: -${pen.toFixed(1)}`);
  }
  console.log("\n输出: data/axiom-report.json");
  console.log("╚═══════════════════════════════════╝");

  await db.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });