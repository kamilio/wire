function compareStrings(left, right) {
    const leftCodePoints = Array.from(left, (character) => character.codePointAt(0));
    const rightCodePoints = Array.from(right, (character) => character.codePointAt(0));
    const length = Math.min(leftCodePoints.length, rightCodePoints.length);
    for (let index = 0; index < length; index += 1) {
        const difference = leftCodePoints[index] - rightCodePoints[index];
        if (difference !== 0) {
            return difference;
        }
    }
    return leftCodePoints.length - rightCodePoints.length;
}
function quote(value) {
    return JSON.stringify(value);
}
function serializeNumber(value) {
    if (Object.is(value, -0)) {
        return "-0.0";
    }
    if (Number.isInteger(value)) {
        return JSON.stringify(value);
    }
    const serialized = JSON.stringify(value);
    if (serialized.includes("e")) {
        return serialized.replace(/e([+-]?)(\d+)$/, (_, sign, exponent) => `e${sign === "" ? "+" : sign}${exponent.padStart(2, "0")}`);
    }
    const absolute = Math.abs(value);
    if (absolute !== 0 && absolute < 1e-4) {
        return value.toExponential().replace(/e([+-])(\d+)$/, (_, sign, exponent) => `e${sign}${exponent.padStart(2, "0")}`);
    }
    return serialized;
}
function serialize(value, indent, level) {
    if (value === null || typeof value === "boolean") {
        return JSON.stringify(value);
    }
    if (typeof value === "number") {
        return serializeNumber(value);
    }
    if (typeof value === "string") {
        return quote(value);
    }
    const currentIndent = indent === undefined ? "" : " ".repeat(indent * level);
    const childIndent = indent === undefined ? "" : " ".repeat(indent * (level + 1));
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return "[]";
        }
        const items = value.map((item) => serialize(item, indent, level + 1));
        return indent === undefined ? `[${items.join(",")}]` : `[\n${childIndent}${items.join(`,\n${childIndent}`)}\n${currentIndent}]`;
    }
    const entries = Object.entries(value).sort(([left], [right]) => compareStrings(left, right));
    if (entries.length === 0) {
        return "{}";
    }
    const items = entries.map(([key, item]) => `${quote(key)}${indent === undefined ? ":" : ": "}${serialize(item, indent, level + 1)}`);
    return indent === undefined ? `{${items.join(",")}}` : `{\n${childIndent}${items.join(`,\n${childIndent}`)}\n${currentIndent}}`;
}
export function stableJsonCompact(value) {
    return serialize(value, undefined, 0);
}
export function stableJsonPretty(value) {
    return serialize(value, 2, 0);
}
//# sourceMappingURL=json.js.map