# ontology-graph

从 redroom 采集的原始数据构建实体关系图谱，建立可视化的本体质量评价体系，并抽象出地缘情报领域本体 Schema。

## 数据来源

通过 MinIO / MySQL 读取 redroom 的数据（两个项目解耦，redroom 只写、本项目只读）：

- MinIO（redroom-raw bucket）— 按八大主题分目录的原始文章
- MySQL（redroom 库）— entitiesJson 实体字段 + entity_aliases 归一化表

## 阶段进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| 1 | 实体共现图谱构建 | 完成 |
| 2 | 五维度质量评价体系 | 完成 |
| 3 | 语义关系抽取（LLM 三元组） | 完成 |
| 4 | 本体 Schema 定义 | 完成 |
| 5 | 本体驱动评价 + MinIO 溯源打通 | 计划中 |

## 目录结构

- src/types.ts — 实体/图谱类型定义
- src/db.ts — 连接 redroom MySQL
- src/buildGraph.ts — 构建共现图谱，输出 data/graph.json
- src/evaluate.ts — 五维度质量评价，输出 data/quality-report.json
- src/extractRelations.ts — LLM 语义关系抽取，输出 data/relations.json
- src/ontology.ts — 地缘情报本体 Schema 定义（类/关系/公理）
- make-viz.mjs — 图谱降采样，输出 data/viz.json
- buildSemanticGraph.mjs — 语义关系合并为有向图
- export-ontology.mjs — 导出本体 Schema 为 JSON
- checkAlign2.mjs — 校验语义关系与图谱的实体对齐率
- graph.html — 共现图谱可视化（vis-network）
- semantic.html — 语义关系有向图可视化
- quality.html — 质量评价仪表盘（雷达图 + 维度卡片）
- ontology.html — 本体 Schema 可视化（类层级 + 关系矩阵 + 公理）
- data/ — 产物目录（不进 git，运行后生成）

## 用法

    npm install
    copy .env.example .env

    npx tsx src/buildGraph.ts        建共现图谱
    node make-viz.mjs                降采样
    npx tsx src/extractRelations.ts 100   语义关系抽取（试点100篇）
    node buildSemanticGraph.mjs      合并有向图
    npx tsx src/evaluate.ts          质量评价
    npx tsx export-ontology.mjs      导出本体 Schema

    npx serve .

起本地服务器后，浏览器打开 graph.html / semantic.html / quality.html / ontology.html。

前提：redroom 的 MinIO 和 MySQL 容器需运行（提供数据源）。

## 质量评价体系

五个一级维度，各含二级子指标：

1. 准确性 — 实体类型错配率、无效实体占比、实体属性错误率*
2. 完整性 — 实体归一覆盖率、实体必填属性完整率
3. 一致性 — 同名多类型冲突率、高相似实体未合并率、实体关系矛盾率
4. 连通性 — 孤立节点率、全局平均关联度、最大连通分量占比、分层连通度
5. 时效性 — 数据新鲜度、时间覆盖跨度

标*项依赖后续阶段（属性 schema），当前报告中标注为"待启用"。

## 本体 Schema

地缘情报领域本体，从图谱数据抽象提炼：

- 类层级：21 个类，6 大顶层类（Country / Person / Organization / Location / Facility / Event / SourceArticle），含子类
- 关系类型：14 种，分冲突 / 合作 / 外交 / 结构四组，带定义域、值域、基数、反向语义
- 公理约束：7 条，每条绑定质量评价维度并定义扣分规则，实现"本体即质量规则"

其中 Country 独立为顶层类（对应"国家不应标为组织"），SourceArticle 溯源类打通 MinIO 原始数据。