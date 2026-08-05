import { CLASSES, RELATIONS, AXIOMS, SUPPORTED_LANGUAGES } from "./src/ontology.ts";
import fs from "node:fs";
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/ontology.json", JSON.stringify({ classes: CLASSES, relations: RELATIONS, axioms: AXIOMS, languages: SUPPORTED_LANGUAGES }, null, 2), "utf8");
console.log("✓ 导出 data/ontology.json");
console.log(`  ${CLASSES.length} 类, ${RELATIONS.length} 关系, ${AXIOMS.length} 公理`);