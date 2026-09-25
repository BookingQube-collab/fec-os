import { parseKpiNumeric } from "./parse-kpi-numeric";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(parseKpiNumeric(42)?.to === 42, "number");
assert(parseKpiNumeric("1,234")?.to === 1234, "grouped");
assert(parseKpiNumeric("12%")?.suffix === "%", "percent suffix");
assert(parseKpiNumeric("—") == null, "emdash");
assert(parseKpiNumeric("2024-01-15") == null, "date");
assert(parseKpiNumeric("QAR 1,500.5")?.prefix.includes("QAR"), "currency prefix");

console.log("parse-kpi-numeric.selfcheck: ok");
