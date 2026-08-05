# ontology-graph

地缘情报多模态知识工程系统：从 redroom 采集的原始数据出发，构建实体关系图谱、抽取语义关系、定义领域本体、建立可量化的质量评价体系，实现情报完整可溯源、基于本体的地理可视化，以及文本-图像多模态检索。

## 数据流

    redroom 采集 → MinIO 按主题归档 → 共现图谱 → 语义关系 → 本体 Schema → 质量评价 → 溯源链 → 地理可视化 → 多模态检索

两个项目通过 MinIO / MySQL 解耦：redroom 只写数据，本项目只读。

## 数据来源

- MinIO（redroom-raw bucket）— 按八大主题分目录的原始文章 JSON
- MySQL（redroom 库）— entitiesJson 实体字段、entity_aliases 归一化表、articles 表（含 storageKey 指向 MinIO、imageUrl 配图）

## 完整阶段

| 阶段 | 内容 | 可视化 |
|---|---|---|
| 1 | 实体共现图谱 | graph.html |
| 2 | 五维度质量评价 | quality.html |
| 3 | LLM 语义关系抽取（全量） | semantic.html |
| 4 | 本体 Schema 定义（含多模态 MediaResource 类） | ontology.html |
| 4b | 本体公理合规检测（本体驱动评价 + C1 纠偏） | axioms.html |
| 5 | 情报溯源链（多模态：关联新闻配图） | trace.html |
| 6 | 本体地理可视化（MapLibre） | map.html |
| 7 | 多模态检索（文本→图像） | media.html |

## 目录结构

源码 src/：

- types.ts — 实体/图谱类型定义
- db.ts — 连接 redroom MySQL
- buildGraph.ts — 构建共现图谱 + 公理 C1 国家类型纠偏 → data/graph.json
- evaluate.ts — 五维度质量评价 → data/quality-report.json
- extractRelations.ts — LLM 语义关系抽取（12 类关系，支持分批）→ data/relations.json
- ontology.ts — 地缘情报本体 Schema（22 类 / 15 关系 / 7 公理，含多模态 MediaResource）
- validateAxioms.ts — 本体公理合规检测 → data/axiom-report.json
- traceability.ts — 溯源链构建（关系→文章→MinIO→配图）→ data/traceability.json

根目录脚本：

- make-viz.mjs — 图谱降采样 → data/viz.json
- buildSemanticGraph.mjs — 语义关系合并为有向图 + 二次补翻 → data/semantic-graph.json
- export-ontology.mjs — 导出本体 Schema → data/ontology.json
- make-geoseed.mjs — 地理坐标种子 + 匹配图谱 → data/geo-nodes.json
- make-media.mjs — 多模态媒体资源提取（带图文章）→ data/media.json
- checkAlign2.mjs — 校验语义关系与图谱的实体对齐率

可视化页面（浏览器打开）：

- graph.html — 共现图谱（vis-network）
- semantic.html — 语义关系有向图
- quality.html — 质量评价仪表盘（雷达图）
- ontology.html — 本体 Schema（类层级 + 关系矩阵 + 公理）
- axioms.html — 公理合规检测（维度扣分 + 违规明细）
- trace.html — 溯源链（实体→关系→源文章→MinIO 原文→配图）
- map.html — 地理可视化（MapLibre 3D 地球，点击实体飞到坐标）
- media.html — 多模态检索（按实体检索相关新闻图像）

## 用法

    npm install
    copy .env.example .env

    npx tsx src/buildGraph.ts            建共现图谱（含 C1 纠偏）
    node make-viz.mjs                    降采样
    npx tsx src/extractRelations.ts 600 0        语义关系抽取（首批）
    npx tsx src/extractRelations.ts 600 600 append   追加下一批
    node buildSemanticGraph.mjs          合并有向图 + 补翻
    npx tsx src/evaluate.ts              五维度质量评价
    npx tsx export-ontology.mjs          导出本体 Schema
    npx tsx src/validateAxioms.ts        公理合规检测
    npx tsx src/traceability.ts          构建溯源链（含配图）
    node make-geoseed.mjs                生成地理坐标数据
    node make-media.mjs                  提取多模态媒体资源

    npx serve .

起本地服务器后，浏览器打开八个 html 页面查看。前提：redroom 的 MinIO 和 MySQL 容器需运行。

分批抽取说明：extractRelations.ts 接受 <篇数> <偏移量> <append> 三个参数，可分批抽取全量文章，append 模式追加不覆盖。

## 质量评价体系

五个一级维度，各含二级子指标：

1. 准确性 — 实体类型错配率、无效实体占比、实体属性错误率*
2. 完整性 — 实体归一覆盖率、实体必填属性完整率
3. 一致性 — 同名多类型冲突率、高相似实体未合并率、实体关系矛盾率
4. 连通性 — 孤立节点率、全局平均关联度、最大连通分量占比、分层连通度
5. 时效性 — 数据新鲜度、时间覆盖跨度

标*项依赖属性 schema，当前标注为待启用。

## 本体 Schema

从图谱数据抽象的地缘情报多模态本体：

- 类层级：22 个类，顶层含 Country（独立）/ Person / Organization / Location / Facility / Event / SourceArticle / MediaResource（多模态媒体资源）
- 关系类型：15 种，分冲突 / 合作 / 外交 / 结构四组，含"关联媒体"多模态关系
- 公理约束：7 条，每条绑定质量维度并定义扣分规则（C1/C3/C5/C7 可自动检测）

## 核心特性

1. 本体公理驱动评价 — 质量指标从本体公理自动推导（validateAxioms.ts），改公理评价自动变。

2. 公理 C1 驱动数据改进闭环 — 评价发现国家类型错配 → 公理 C1 定义国家独立性 → 建图管线自动纠偏 → 重新评价验证。纠偏对新抓数据自动生效。

3. 五维度可量化评价 — 每个指标有算法、有问题样本佐证。

4. 情报完整可溯源 — 每条语义关系可追溯到源文章、MinIO 原始数据、以及新闻配图。

5. 基于本体的地理可视化 — 本体实体按坐标呈现在 MapLibre 3D 地球上，点击飞到对应位置。

6. 多模态知识图谱 — 本体建模媒体资源（MediaResource），情报关系关联新闻配图，支持文本→图像的跨模态检索。