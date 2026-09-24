import { splitSqlStatements } from "./sql-split.mjs";

const sql = [
  "COMMENT ON COLUMN x IS 'a; b';",
  "COMMENT ON COLUMN y IS 'c''d';",
].join("\n");

const s = splitSqlStatements(sql);
if (s.length !== 2) throw new Error(`expected 2, got ${s.length}: ${JSON.stringify(s)}`);
if (!s[0].includes("a; b")) throw new Error(`bad[0]: ${s[0]}`);
if (!s[1].includes("c''d")) throw new Error(`bad[1]: ${s[1]}`);
console.log("sql-split.selfcheck ok");
