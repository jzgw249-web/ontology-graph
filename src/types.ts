// 实体与图谱的类型定义

export type EntityType = "person" | "organization" | "location" | "facility" | "event";

export interface RawEntities {
  persons: string[];
  organizations: string[];
  locations: string[];
  facilities: string[];
  events: string[];
}

// 图谱节点
export interface GraphNode {
  id: string;          // 规范名
  type: EntityType;    // 实体类型
  count: number;       // 出现文章数
}

// 图谱边（共现关系）
export interface GraphEdge {
  source: string;      // 实体 A 规范名
  target: string;      // 实体 B 规范名
  weight: number;      // 共现次数
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: {
    articleCount: number;
    generatedAt: string;
  };
}
