# ontology-graph

从 redroom 采集的原始数据构建实体关系图谱，后续扩展为本体库与质量评价体系。

## 数据来源
- MinIO（redroom-raw bucket，按主题分目录的原始文章）
- MySQL（redroom 库的 entitiesJson 实体字段 + entity_aliases 归一化表）

## 阶段
1. **共现图谱**（当前）— 同一文章内实体两两共现，建节点+边
2. 语义关系（LLM 抽三元组）
3. 本体库（概念层 schema）
4. 质量评价体系

## 用法
```
npm install
cp .env.example .env   # 按需改连接配置
npx tsx src/buildGraph.ts
```
输出 data/graph.json（节点+边）。

## 前提
redroom 的 MinIO 和 MySQL 容器需在运行（提供数据源）。
