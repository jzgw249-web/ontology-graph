/**
 * 地缘情报本体 Schema 定义
 * 从 redroom 实体关系图谱数据抽象提炼的概念层模型
 *
 * 结构：类层级(Class) + 属性(Property) + 关系(Relation) + 公理(Axiom)
 * 特色：每条公理绑定质量评价维度，实现"本体即质量规则"
 */

// ══════════════ 数据类型 ══════════════
export type DataType = "string" | "int" | "float" | "enum" | "date" | "geo" | "ref";

export interface PropertyDef {
  name: string;
  zh: string;
  type: DataType;
  required: boolean;
  enumValues?: string[];
  note?: string;
}

// ══════════════ 一、类层级 ══════════════
export interface ClassDef {
  id: string;
  zh: string;
  parent: string | null;      // 父类 id，顶层为 null
  properties: PropertyDef[];
}

// 通用属性（所有实体继承）
// ══════════════ 多语种支持 ══════════════
// 本体为每个实体提供多语言标签（multilingual labels），支持跨语言检索
export const SUPPORTED_LANGUAGES = [
  { code: "zh", name: "中文", field: "canonicalZh", coverage: "100%" },
  { code: "en", name: "英语", field: "canonicalEn", coverage: "100%" },
  { code: "ar", name: "阿拉伯语", field: "canonicalAr", coverage: "41%" },
];

const BASE_PROPS: PropertyDef[] = [
  { name: "id", zh: "标识", type: "string", required: true },
  { name: "canonicalZh", zh: "中文规范名", type: "string", required: true },
  { name: "canonicalEn", zh: "英文规范名", type: "string", required: false },
  { name: "canonicalAr", zh: "阿拉伯语规范名", type: "string", required: false, note: "多语种标签：源自 raw 阿语原文" },
  { name: "type", zh: "实体类型", type: "enum", required: true,
    enumValues: ["Country","Person","Organization","Location","Facility","Event","SourceArticle"] },
  { name: "freq", zh: "出现频次", type: "int", required: false, note: "可视化节点大小" },
  { name: "aliases", zh: "别名集", type: "string", required: false },
  { name: "lat", zh: "纬度", type: "geo", required: false, note: "地理可视化字段，数据待补" },
  { name: "lng", zh: "经度", type: "geo", required: false, note: "地理可视化字段，数据待补" },
];

export const CLASSES: ClassDef[] = [
  { id: "Entity", zh: "实体·根类", parent: null, properties: BASE_PROPS },

  // ── Country 独立顶层类 ──
  { id: "Country", zh: "国家", parent: "Entity", properties: [
    { name: "capital", zh: "首都", type: "string", required: false },
    { name: "region", zh: "所属地区", type: "string", required: false },
  ]},

  // ── Person ──
  { id: "Person", zh: "人物", parent: "Entity", properties: [
    { name: "nationality", zh: "国籍", type: "ref", required: false, note: "指向 Country，至多一个" },
    { name: "role", zh: "职务", type: "string", required: false },
    { name: "affiliation", zh: "所属组织", type: "ref", required: false },
  ]},

  // ── Organization + 子类 ──
  { id: "Organization", zh: "组织", parent: "Entity", properties: [] },
  { id: "GovernmentBody", zh: "政府机构", parent: "Organization", properties: [] },
  { id: "MilitaryOrg", zh: "军事组织", parent: "Organization", properties: [] },
  { id: "InternationalOrg", zh: "国际组织", parent: "Organization", properties: [] },

  // ── Location + 子类 ──
  { id: "Location", zh: "地点", parent: "Entity", properties: [] },
  { id: "City", zh: "城市", parent: "Location", properties: [
    { name: "country", zh: "所属国家", type: "ref", required: false },
  ]},
  { id: "Region", zh: "地区", parent: "Location", properties: [] },
  { id: "GeoFeature", zh: "地理特征", parent: "Location", properties: [] },

  // ── Facility + 子类 ──
  { id: "Facility", zh: "设施", parent: "Entity", properties: [
    { name: "locatedIn", zh: "所在国", type: "ref", required: true, note: "公理C2：必填" },
    { name: "facilityType", zh: "设施类型", type: "enum", required: false,
      enumValues: ["military","nuclear","energy","other"] },
  ]},
  { id: "MilitaryBase", zh: "军事基地", parent: "Facility", properties: [] },
  { id: "NuclearFacility", zh: "核设施", parent: "Facility", properties: [] },
  { id: "EnergyFacility", zh: "能源设施", parent: "Facility", properties: [] },

  // ── Event + 子类（含新增经济/人道）──
  { id: "Event", zh: "事件", parent: "Entity", properties: [
    { name: "eventDate", zh: "发生时间", type: "date", required: false },
    { name: "participants", zh: "参与方", type: "ref", required: false },
  ]},
  { id: "ConflictEvent", zh: "冲突事件", parent: "Event", properties: [] },
  { id: "DiplomaticEvent", zh: "外交事件", parent: "Event", properties: [] },
  { id: "EconomicEvent", zh: "经济事件", parent: "Event", properties: [] },
  { id: "HumanitarianEvent", zh: "人道事件", parent: "Event", properties: [] },

  // ── SourceArticle 溯源类 ──
  { id: "SourceArticle", zh: "溯源文章", parent: "Entity", properties: [
    { name: "title", zh: "标题", type: "string", required: true },
    { name: "publishedAt", zh: "发布时间", type: "date", required: true },
    { name: "agencyId", zh: "信源", type: "ref", required: false },
    { name: "country", zh: "国家", type: "string", required: false },
    { name: "language", zh: "语言", type: "string", required: false },
    { name: "url", zh: "原文链接", type: "string", required: false },
    { name: "storageKey", zh: "MinIO存储键", type: "string", required: false, note: "打通MinIO原始数据" },
    { name: "topics", zh: "主题", type: "string", required: false },
  ]},

  // ── MediaResource 多模态媒体资源类 ──
  { id: "MediaResource", zh: "媒体资源", parent: "Entity", properties: [
    { name: "url", zh: "资源链接", type: "string", required: true },
    { name: "mediaType", zh: "模态类型", type: "enum", required: true, enumValues: ["image","video","audio"] },
    { name: "sourceArticleId", zh: "所属文章", type: "ref", required: true, note: "多模态：关联到 SourceArticle" },
  ]},
];

// ══════════════ 二、关系类型（含反向、基数、值域）══════════════
export type Cardinality = "1:1" | "1:N" | "N:1" | "N:N";

export interface RelationDef {
  id: string;
  zh: string;
  group: "conflict" | "cooperation" | "diplomacy" | "structure";
  domain: string[];        // 定义域（主体可以是哪些类）
  range: string[];         // 值域（客体可以是哪些类）
  inverse: string;         // 反向语义
  cardinality: Cardinality;
  symmetric: boolean;      // 是否对称（敌对/结盟是对称的）
}

export const RELATIONS: RelationDef[] = [
  // 冲突类
  { id:"攻击", zh:"攻击", group:"conflict", domain:["Country","MilitaryOrg"], range:["Country","Facility","Location","Organization"], inverse:"被攻击", cardinality:"N:N", symmetric:false },
  { id:"威胁", zh:"威胁", group:"conflict", domain:["Country","Organization"], range:["Country","Organization"], inverse:"被威胁", cardinality:"N:N", symmetric:false },
  { id:"敌对", zh:"敌对", group:"conflict", domain:["Country","Organization"], range:["Country","Organization"], inverse:"敌对", cardinality:"N:N", symmetric:true },
  // 合作类
  { id:"结盟", zh:"结盟", group:"cooperation", domain:["Country","Organization"], range:["Country","Organization"], inverse:"结盟", cardinality:"N:N", symmetric:true },
  { id:"支持", zh:"支持", group:"cooperation", domain:["Country","Organization"], range:["Country","Organization","Person","Facility"], inverse:"受支持", cardinality:"N:N", symmetric:false },
  { id:"谈判", zh:"谈判", group:"cooperation", domain:["Country","Organization"], range:["Country","Organization"], inverse:"谈判", cardinality:"N:N", symmetric:true },
  // 外交类
  { id:"制裁", zh:"制裁", group:"diplomacy", domain:["Country","InternationalOrg"], range:["Country","Organization"], inverse:"被制裁", cardinality:"N:N", symmetric:false },
  { id:"谴责", zh:"谴责", group:"diplomacy", domain:["Country","Organization"], range:["Country","Organization","Person"], inverse:"被谴责", cardinality:"N:N", symmetric:false },
  { id:"协议", zh:"协议", group:"diplomacy", domain:["Country","Organization"], range:["Country","Organization"], inverse:"协议", cardinality:"N:N", symmetric:true },
  // 结构类
  { id:"隶属", zh:"隶属", group:"structure", domain:["Person","Organization"], range:["Organization","Country","InternationalOrg"], inverse:"下辖", cardinality:"N:1", symmetric:false },
  { id:"位于", zh:"位于", group:"structure", domain:["Facility","City"], range:["Country","Region"], inverse:"包含", cardinality:"N:1", symmetric:false },
  { id:"涉及", zh:"涉及", group:"structure", domain:["Entity"], range:["Event"], inverse:"涉及方", cardinality:"N:N", symmetric:false },
  // 溯源关系
  { id:"源自", zh:"源自", group:"structure", domain:["Entity"], range:["SourceArticle"], inverse:"衍生出", cardinality:"N:N", symmetric:false },
  { id:"报道", zh:"报道", group:"structure", domain:["SourceArticle"], range:["Event"], inverse:"被报道", cardinality:"N:N", symmetric:false },
  { id:"关联媒体", zh:"关联媒体", group:"structure", domain:["SourceArticle"], range:["MediaResource"], inverse:"媒体来源", cardinality:"N:N", symmetric:false },
];

// ══════════════ 三、公理（约束规则，绑定质量维度）══════════════
export type QualityDim = "accuracy" | "completeness" | "consistency" | "connectivity";

export interface AxiomDef {
  id: string;
  zh: string;
  rule: string;              // 规则描述
  boundDimension: QualityDim; // 违规扣哪个质量维度
  penalty: string;           // 扣分方式
  detectable: boolean;       // 当前数据能否自动检测
}

export const AXIOMS: AxiomDef[] = [
  {
    id: "C1", zh: "国家独立性",
    rule: "Country 是独立顶层类，不能同时是 Organization 的实例",
    boundDimension: "accuracy",
    penalty: "每个被误标为 organization 的国家，准确性 -1 分权重",
    detectable: true,
  },
  {
    id: "C2", zh: "设施必有归属",
    rule: "Facility 必须有 locatedIn 关系指向某 Country",
    boundDimension: "completeness",
    penalty: "缺 locatedIn 的设施占比，计入完整性扣分",
    detectable: false,  // 需属性数据，第二步启用
  },
  {
    id: "C3", zh: "攻击方向性",
    rule: "同一对实体同时存在 attack + support 关系为逻辑矛盾，需人工复核",
    boundDimension: "consistency",
    penalty: "矛盾对数量 / 总关系对数，计入一致性扣分",
    detectable: true,
  },
  {
    id: "C4", zh: "人物单一国籍",
    rule: "Person 的 nationality 属性至多一个",
    boundDimension: "consistency",
    penalty: "多国籍人物占比，计入一致性扣分",
    detectable: false,  // 需属性数据
  },
  {
    id: "C5", zh: "规范名必填",
    rule: "每个实体必须有 canonicalZh 规范名",
    boundDimension: "completeness",
    penalty: "缺规范名实体占比，计入完整性扣分",
    detectable: true,
  },
  {
    id: "C6", zh: "地理唯一约束",
    rule: "一个实体（设施/城市）只能位于一个国家，locatedIn 基数为 N:1",
    boundDimension: "connectivity",
    penalty: "违反地理唯一（位于多国）的实体占比，计入连通性扣分",
    detectable: false,  // 需语义关系全量
  },
  {
    id: "C7", zh: "兜底关系比例",
    rule: "涉及(involve) 等兜底关系占比不应过高，过高说明关系抽取质量差",
    boundDimension: "accuracy",
    penalty: "兜底关系占比超过阈值(如40%)的部分，计入准确性扣分",
    detectable: true,
  },
];

// ══════════════ 辅助：类层级查询 ══════════════
export function getSubclasses(classId: string): string[] {
  return CLASSES.filter(c => c.parent === classId).map(c => c.id);
}
export function getAncestors(classId: string): string[] {
  const out: string[] = [];
  let cur = CLASSES.find(c => c.id === classId);
  while (cur && cur.parent) { out.push(cur.parent); cur = CLASSES.find(c => c.id === cur!.parent); }
  return out;
}
export function getRelationsByGroup(group: string): RelationDef[] {
  return RELATIONS.filter(r => r.group === group);
}
