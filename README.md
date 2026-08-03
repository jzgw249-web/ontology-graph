# ontology-graph

地缘情报知识工程系统：从 redroom 采集的原始数据出发，构建实体关系图谱、抽取语义关系、定义领域本体、建立可量化的质量评价体系，并实现情报完整可溯源。

## 数据流

    redroom 采集 → MinIO 按主题归档 → 共现图谱 → 语义关系 → 本体 Schema → 质量评价 → 溯源链

两个项目通过 MinIO / MySQL 解耦：redroom 只写数据，本项目只读。

## 数据来源

- MinIO（redroom-raw bucket）— 按八大主题分目录的原始文章 JSON
- MySQL（redroom 库）— entitiesJson 实体字段、entity_aliases 归一化表、articles 表（含 storageKey 指向 MinIO）

## 完整阶段

| 阶段 | 内容 | 可视化 |
|---|---|---|
| 1 | 实体共现图谱 | graph.html |
| 2 | 五维度质量评价 | quality.html |
| 3 | LLM 语义关系抽取 | semantic.html |
| 4 | 本体 Schema 定义 | ontology.html |
| 4b | 本体公理合规检测（本体驱动评价） | axioms.html |
| 5 | 情报溯源链 | trace.html |

## 目录结构

源码 src/：

- types.ts — 实体/图谱类型定义
- db.ts — 连接 redroom MySQL
- buildGraph.ts — 构建共现图谱 → data/graph.json
- evaluate.ts — 五维度质量评价 → data/quality-report.json
- extractRelations.ts — LLM 语义关系抽取（12 类关系）→ data/relations.json
- ontology.ts — 地缘情报本体 Schema（21 类 / 14 关系 / 7 公理）
- validateAxioms.ts — 本体公理合规检测 → data/axiom-report.json
- traceability.ts — 溯源链构建（关系→文章→MinIO）→ data/traceability.json

根目录脚本：

- make-viz.mjs — 图谱降采样 → data/viz.json
- buildSemanticGraph.mjs — 语义关系合并为有向图 → data/semantic-graph.json
- export-ontology.mjs — 导出本体 Schema → data/ontology.json
- checkAlign2.mjs — 校验语义关系与图谱的实体对齐率

可视化页面（浏览器打开）：

- graph.html — 共现图谱（vis-network）
- semantic.html — 语义关系有向图
- quality.html — 质量评价仪表盘（雷达图）
- ontology.html — 本体 Schema（类层级 + 关系矩阵 + 公理）
- axioms.html — 公理合规检测（维度扣分 + 违规明细）
- trace.html — 溯源链（实体→关系→源文章→MinIO 原文）

## 用法

    npm install
    copy .env.example .env

    npx tsx src/buildGraph.ts            建共现图谱
    node make-viz.mjs                    降采样
    npx tsx src/extractRelations.ts 100  语义关系抽取（试点 100 篇）
    node buildSemanticGraph.mjs          合并有向图
    npx tsx src/evaluate.ts              五维度质量评价
    npx tsx export-ontology.mjs          导出本体 Schema
    npx tsx src/validateAxioms.ts        公理合规检测
    npx tsx src/traceability.ts          构建溯源链

    npx serve .

起本地服务器后，浏览器打开六个 html 页面查看。前提：redroom 的 MinIO 和 MySQL 容器需运行。

## 质量评价体系

五个一级维度，各含二级子指标：

1. 准确性 — 实体类型错配率、无效实体占比、实体属性错误率*
2. 完整性 — 实体归一覆盖率、实体必填属性完整率
3. 一致性 — 同名多类型冲突率、高相似实体未合并率、实体关系矛盾率
4. 连通性 — 孤立节点率、全局平均关联度、最大连通分量占比、分层连通度
5. 时效性 — 数据新鲜度、时间覆盖跨度

标*项依赖属性 schema，当前标注为待启用。

## 本体 Schema

从图谱数据抽象的地缘情报领域本体：

- 类层级：21 个类，顶层含 Country（独立）/ Person / Organization / Location / Facility / Event / SourceArticle
- 关系类型：14 种，分冲突 / 合作 / 外交 / 结构四组，带定义域、值域、基数、反向语义
- 公理约束：7 条，每条绑定质量维度并定义扣分规则

## 三个核心特性

1. 本体公理驱动评价 — 质量指标从本体公理自动推导（validateAxioms.ts），改公理评价自动变，实现"Schema 规则自动计算质量指标"。当前 4 条公理可自动检测（C1/C3/C5/C7）。

2. 五维度可量化评价 — 每个指标有算法、有问题样本佐证，能揭示真实数据质量问题（如国家类型错配、实体关系矛盾）。

3. 情报完整可溯源 — 每条语义关系可追溯到源文章，并定位到 MinIO 中按主题归档的原始数据，实现情报可验证、可审计。