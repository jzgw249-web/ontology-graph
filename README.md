# ontology-graph

从 redroom 采集的原始数据构建实体关系图谱，并建立可视化的本体质量评价体系。后续扩展语义关系与本体库。

## 数据来源

通过 MinIO / MySQL 读取 redroom 的数据（两个项目解耦，redroom 只写、本项目只读）：

- MinIO（redroom-raw bucket）— 按八大主题分目录的原始文章
- MySQL（redroom 库）— entitiesJson 实体字段 + entity_aliases 归一化表

## 阶段进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| 1 | 实体共现图谱构建 | 完成 |
| 2 | 图谱可视化 | 完成 |
| 3 | 五维度质量评价体系 | 完成 |
| 4 | 语义关系（LLM 三元组） | 计划中 |
| 5 | 本体库（概念 schema） | 计划中 |

## 目录结构

- src/types.ts — 实体/图谱类型定义
- src/db.ts — 连接 redroom MySQL
- src/buildGraph.ts — 构建共现图谱，输出 data/graph.json
- src/evaluate.ts — 五维度质量评价，输出 data/quality-report.json
- make-viz.mjs — 图谱降采样，输出 data/viz.json
- graph.html — 图谱可视化（vis-network）
- quality.html — 评价仪表盘（雷达图 + 维度卡片）
- data/ — 产物目录（不进 git，运行后生成）

## 用法

    npm install
    copy .env.example .env
    npx tsx src/buildGraph.ts
    node make-viz.mjs
    npx tsx src/evaluate.ts
    npx serve .

起本地服务器后，浏览器打开 graph.html 看图谱、quality.html 看评价仪表盘。

前提：redroom 的 MinIO 和 MySQL 容器需运行（提供数据源）。

## 质量评价体系

五个一级维度，各含二级子指标：

1. 准确性 — 实体类型错配率、无效实体占比、实体属性错误率*
2. 完整性 — 实体归一覆盖率、实体必填属性完整率
3. 一致性 — 同名多类型冲突率、高相似实体未合并率、实体关系矛盾率*
4. 连通性 — 孤立节点率、全局平均关联度、最大连通分量占比、分层连通度
5. 时效性 — 数据新鲜度、时间覆盖跨度

标*项依赖后续阶段（属性 schema / 语义关系），当前报告中标注为"待启用"。