"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/wire-vscode-extension/src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var import_node_child_process2 = require("node:child_process");
var import_node_fs3 = require("node:fs");
var import_promises5 = require("node:fs/promises");
var import_node_path4 = require("node:path");
var import_node_util = require("node:util");
var vscode = __toESM(require("vscode"));

// packages/wire-core/src/core/json.ts
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
  const currentIndent = indent === void 0 ? "" : " ".repeat(indent * level);
  const childIndent = indent === void 0 ? "" : " ".repeat(indent * (level + 1));
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    const items2 = value.map((item) => serialize(item, indent, level + 1));
    return indent === void 0 ? `[${items2.join(",")}]` : `[
${childIndent}${items2.join(`,
${childIndent}`)}
${currentIndent}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) => compareStrings(left, right));
  if (entries.length === 0) {
    return "{}";
  }
  const items = entries.map(([key2, item]) => `${quote(key2)}${indent === void 0 ? ":" : ": "}${serialize(item, indent, level + 1)}`);
  return indent === void 0 ? `{${items.join(",")}}` : `{
${childIndent}${items.join(`,
${childIndent}`)}
${currentIndent}}`;
}
function stableJsonCompact(value) {
  return serialize(value, void 0, 0);
}
function stableJsonPretty(value) {
  return serialize(value, 2, 0);
}

// packages/wire-core/src/core/resource.ts
function compareStrings2(left, right) {
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
function cloneValue(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneValue));
  }
  if (value !== null && typeof value === "object") {
    return cloneObject(value);
  }
  return value;
}
function cloneObject(value) {
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key2, item]) => [key2, cloneValue(item)])));
}
function resourceId(source) {
  return `${source.service}:${source.identifier}`;
}
function normalizeResource(resource) {
  return Object.freeze({
    id: resource.id,
    type: resource.type,
    identifiers: Object.freeze(
      resource.identifiers.map((identifier) => Object.freeze({ service: identifier.service, identifier: identifier.identifier })).sort((left, right) => compareStrings2(left.service, right.service) || compareStrings2(left.identifier, right.identifier))
    ),
    urls: Object.freeze([...resource.urls].sort(compareStrings2)),
    filesystem_links: Object.freeze(
      resource.filesystem_links.map((link) => Object.freeze({ path: link.path, role: link.role, data: cloneObject(link.data) })).sort((left, right) => compareStrings2(left.path, right.path) || compareStrings2(left.role, right.role))
    ),
    data: Object.freeze(
      resource.data.map((item) => Object.freeze({ namespace: item.namespace, key: item.key, value: cloneValue(item.value) })).sort((left, right) => compareStrings2(left.namespace, right.namespace) || compareStrings2(left.key, right.key))
    ),
    relationships: Object.freeze(
      resource.relationships.map(
        (relationship) => Object.freeze({ target_id: relationship.target_id, type: relationship.type, data: cloneObject(relationship.data) })
      ).sort((left, right) => compareStrings2(left.type, right.type) || compareStrings2(left.target_id, right.target_id))
    )
  });
}

// packages/wire-core/src/core/source.ts
function serviceForUrl(url, catalog) {
  const service = catalog.find((item) => item.matches(url));
  if (service === void 0) throw new Error(`Unsupported source URL: ${url}`);
  return service;
}
function defineService(service) {
  return Object.freeze(service);
}
function defineServiceCatalog(services) {
  return Object.freeze([...services]);
}
function createServiceRegistry() {
  const services = [];
  const registry = Object.freeze({
    use: (provider) => {
      services.push(...provider.services);
      return registry;
    },
    catalog: () => defineServiceCatalog(services)
  });
  return registry;
}
function parseSourceUrl(value, catalog) {
  const url = new URL(value);
  return Object.freeze(serviceForUrl(url, catalog).parse(url));
}
function fetchSource(input, value, catalog) {
  const url = new URL(value);
  const service = serviceForUrl(url, catalog);
  return service.fetch(input, value, service.parse(url));
}
function synchronizeSource(input, value, catalog, base, markdown, markdownPath) {
  const url = new URL(value);
  const service = serviceForUrl(url, catalog);
  const source = service.parse(url);
  return service.synchronize === void 0 ? service.fetch(input, value, source) : service.synchronize(input, value, source, base, markdown, markdownPath);
}
function uploadSource(input, catalog, markdown, markdownPath) {
  const service = catalog.find((item) => item.name === "notion" && item.upload !== void 0);
  if (service === void 0 || service.upload === void 0) throw new Error("No Notion upload service configured");
  return service.upload(input, markdown, markdownPath);
}

// packages/wire-core/src/core/transform.ts
function markdownFilename(title2) {
  const visible = title2.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return `${visible === "" ? "untitled" : visible}.md`;
}
var htmlEntities = Object.freeze({ "AElig": "\xC6", "AElig;": "\xC6", "AMP": "&", "AMP;": "&", "Aacute": "\xC1", "Aacute;": "\xC1", "Abreve;": "\u0102", "Acirc": "\xC2", "Acirc;": "\xC2", "Acy;": "\u0410", "Afr;": "\u{1D504}", "Agrave": "\xC0", "Agrave;": "\xC0", "Alpha;": "\u0391", "Amacr;": "\u0100", "And;": "\u2A53", "Aogon;": "\u0104", "Aopf;": "\u{1D538}", "ApplyFunction;": "\u2061", "Aring": "\xC5", "Aring;": "\xC5", "Ascr;": "\u{1D49C}", "Assign;": "\u2254", "Atilde": "\xC3", "Atilde;": "\xC3", "Auml": "\xC4", "Auml;": "\xC4", "Backslash;": "\u2216", "Barv;": "\u2AE7", "Barwed;": "\u2306", "Bcy;": "\u0411", "Because;": "\u2235", "Bernoullis;": "\u212C", "Beta;": "\u0392", "Bfr;": "\u{1D505}", "Bopf;": "\u{1D539}", "Breve;": "\u02D8", "Bscr;": "\u212C", "Bumpeq;": "\u224E", "CHcy;": "\u0427", "COPY": "\xA9", "COPY;": "\xA9", "Cacute;": "\u0106", "Cap;": "\u22D2", "CapitalDifferentialD;": "\u2145", "Cayleys;": "\u212D", "Ccaron;": "\u010C", "Ccedil": "\xC7", "Ccedil;": "\xC7", "Ccirc;": "\u0108", "Cconint;": "\u2230", "Cdot;": "\u010A", "Cedilla;": "\xB8", "CenterDot;": "\xB7", "Cfr;": "\u212D", "Chi;": "\u03A7", "CircleDot;": "\u2299", "CircleMinus;": "\u2296", "CirclePlus;": "\u2295", "CircleTimes;": "\u2297", "ClockwiseContourIntegral;": "\u2232", "CloseCurlyDoubleQuote;": "\u201D", "CloseCurlyQuote;": "\u2019", "Colon;": "\u2237", "Colone;": "\u2A74", "Congruent;": "\u2261", "Conint;": "\u222F", "ContourIntegral;": "\u222E", "Copf;": "\u2102", "Coproduct;": "\u2210", "CounterClockwiseContourIntegral;": "\u2233", "Cross;": "\u2A2F", "Cscr;": "\u{1D49E}", "Cup;": "\u22D3", "CupCap;": "\u224D", "DD;": "\u2145", "DDotrahd;": "\u2911", "DJcy;": "\u0402", "DScy;": "\u0405", "DZcy;": "\u040F", "Dagger;": "\u2021", "Darr;": "\u21A1", "Dashv;": "\u2AE4", "Dcaron;": "\u010E", "Dcy;": "\u0414", "Del;": "\u2207", "Delta;": "\u0394", "Dfr;": "\u{1D507}", "DiacriticalAcute;": "\xB4", "DiacriticalDot;": "\u02D9", "DiacriticalDoubleAcute;": "\u02DD", "DiacriticalGrave;": "`", "DiacriticalTilde;": "\u02DC", "Diamond;": "\u22C4", "DifferentialD;": "\u2146", "Dopf;": "\u{1D53B}", "Dot;": "\xA8", "DotDot;": "\u20DC", "DotEqual;": "\u2250", "DoubleContourIntegral;": "\u222F", "DoubleDot;": "\xA8", "DoubleDownArrow;": "\u21D3", "DoubleLeftArrow;": "\u21D0", "DoubleLeftRightArrow;": "\u21D4", "DoubleLeftTee;": "\u2AE4", "DoubleLongLeftArrow;": "\u27F8", "DoubleLongLeftRightArrow;": "\u27FA", "DoubleLongRightArrow;": "\u27F9", "DoubleRightArrow;": "\u21D2", "DoubleRightTee;": "\u22A8", "DoubleUpArrow;": "\u21D1", "DoubleUpDownArrow;": "\u21D5", "DoubleVerticalBar;": "\u2225", "DownArrow;": "\u2193", "DownArrowBar;": "\u2913", "DownArrowUpArrow;": "\u21F5", "DownBreve;": "\u0311", "DownLeftRightVector;": "\u2950", "DownLeftTeeVector;": "\u295E", "DownLeftVector;": "\u21BD", "DownLeftVectorBar;": "\u2956", "DownRightTeeVector;": "\u295F", "DownRightVector;": "\u21C1", "DownRightVectorBar;": "\u2957", "DownTee;": "\u22A4", "DownTeeArrow;": "\u21A7", "Downarrow;": "\u21D3", "Dscr;": "\u{1D49F}", "Dstrok;": "\u0110", "ENG;": "\u014A", "ETH": "\xD0", "ETH;": "\xD0", "Eacute": "\xC9", "Eacute;": "\xC9", "Ecaron;": "\u011A", "Ecirc": "\xCA", "Ecirc;": "\xCA", "Ecy;": "\u042D", "Edot;": "\u0116", "Efr;": "\u{1D508}", "Egrave": "\xC8", "Egrave;": "\xC8", "Element;": "\u2208", "Emacr;": "\u0112", "EmptySmallSquare;": "\u25FB", "EmptyVerySmallSquare;": "\u25AB", "Eogon;": "\u0118", "Eopf;": "\u{1D53C}", "Epsilon;": "\u0395", "Equal;": "\u2A75", "EqualTilde;": "\u2242", "Equilibrium;": "\u21CC", "Escr;": "\u2130", "Esim;": "\u2A73", "Eta;": "\u0397", "Euml": "\xCB", "Euml;": "\xCB", "Exists;": "\u2203", "ExponentialE;": "\u2147", "Fcy;": "\u0424", "Ffr;": "\u{1D509}", "FilledSmallSquare;": "\u25FC", "FilledVerySmallSquare;": "\u25AA", "Fopf;": "\u{1D53D}", "ForAll;": "\u2200", "Fouriertrf;": "\u2131", "Fscr;": "\u2131", "GJcy;": "\u0403", "GT": ">", "GT;": ">", "Gamma;": "\u0393", "Gammad;": "\u03DC", "Gbreve;": "\u011E", "Gcedil;": "\u0122", "Gcirc;": "\u011C", "Gcy;": "\u0413", "Gdot;": "\u0120", "Gfr;": "\u{1D50A}", "Gg;": "\u22D9", "Gopf;": "\u{1D53E}", "GreaterEqual;": "\u2265", "GreaterEqualLess;": "\u22DB", "GreaterFullEqual;": "\u2267", "GreaterGreater;": "\u2AA2", "GreaterLess;": "\u2277", "GreaterSlantEqual;": "\u2A7E", "GreaterTilde;": "\u2273", "Gscr;": "\u{1D4A2}", "Gt;": "\u226B", "HARDcy;": "\u042A", "Hacek;": "\u02C7", "Hat;": "^", "Hcirc;": "\u0124", "Hfr;": "\u210C", "HilbertSpace;": "\u210B", "Hopf;": "\u210D", "HorizontalLine;": "\u2500", "Hscr;": "\u210B", "Hstrok;": "\u0126", "HumpDownHump;": "\u224E", "HumpEqual;": "\u224F", "IEcy;": "\u0415", "IJlig;": "\u0132", "IOcy;": "\u0401", "Iacute": "\xCD", "Iacute;": "\xCD", "Icirc": "\xCE", "Icirc;": "\xCE", "Icy;": "\u0418", "Idot;": "\u0130", "Ifr;": "\u2111", "Igrave": "\xCC", "Igrave;": "\xCC", "Im;": "\u2111", "Imacr;": "\u012A", "ImaginaryI;": "\u2148", "Implies;": "\u21D2", "Int;": "\u222C", "Integral;": "\u222B", "Intersection;": "\u22C2", "InvisibleComma;": "\u2063", "InvisibleTimes;": "\u2062", "Iogon;": "\u012E", "Iopf;": "\u{1D540}", "Iota;": "\u0399", "Iscr;": "\u2110", "Itilde;": "\u0128", "Iukcy;": "\u0406", "Iuml": "\xCF", "Iuml;": "\xCF", "Jcirc;": "\u0134", "Jcy;": "\u0419", "Jfr;": "\u{1D50D}", "Jopf;": "\u{1D541}", "Jscr;": "\u{1D4A5}", "Jsercy;": "\u0408", "Jukcy;": "\u0404", "KHcy;": "\u0425", "KJcy;": "\u040C", "Kappa;": "\u039A", "Kcedil;": "\u0136", "Kcy;": "\u041A", "Kfr;": "\u{1D50E}", "Kopf;": "\u{1D542}", "Kscr;": "\u{1D4A6}", "LJcy;": "\u0409", "LT": "<", "LT;": "<", "Lacute;": "\u0139", "Lambda;": "\u039B", "Lang;": "\u27EA", "Laplacetrf;": "\u2112", "Larr;": "\u219E", "Lcaron;": "\u013D", "Lcedil;": "\u013B", "Lcy;": "\u041B", "LeftAngleBracket;": "\u27E8", "LeftArrow;": "\u2190", "LeftArrowBar;": "\u21E4", "LeftArrowRightArrow;": "\u21C6", "LeftCeiling;": "\u2308", "LeftDoubleBracket;": "\u27E6", "LeftDownTeeVector;": "\u2961", "LeftDownVector;": "\u21C3", "LeftDownVectorBar;": "\u2959", "LeftFloor;": "\u230A", "LeftRightArrow;": "\u2194", "LeftRightVector;": "\u294E", "LeftTee;": "\u22A3", "LeftTeeArrow;": "\u21A4", "LeftTeeVector;": "\u295A", "LeftTriangle;": "\u22B2", "LeftTriangleBar;": "\u29CF", "LeftTriangleEqual;": "\u22B4", "LeftUpDownVector;": "\u2951", "LeftUpTeeVector;": "\u2960", "LeftUpVector;": "\u21BF", "LeftUpVectorBar;": "\u2958", "LeftVector;": "\u21BC", "LeftVectorBar;": "\u2952", "Leftarrow;": "\u21D0", "Leftrightarrow;": "\u21D4", "LessEqualGreater;": "\u22DA", "LessFullEqual;": "\u2266", "LessGreater;": "\u2276", "LessLess;": "\u2AA1", "LessSlantEqual;": "\u2A7D", "LessTilde;": "\u2272", "Lfr;": "\u{1D50F}", "Ll;": "\u22D8", "Lleftarrow;": "\u21DA", "Lmidot;": "\u013F", "LongLeftArrow;": "\u27F5", "LongLeftRightArrow;": "\u27F7", "LongRightArrow;": "\u27F6", "Longleftarrow;": "\u27F8", "Longleftrightarrow;": "\u27FA", "Longrightarrow;": "\u27F9", "Lopf;": "\u{1D543}", "LowerLeftArrow;": "\u2199", "LowerRightArrow;": "\u2198", "Lscr;": "\u2112", "Lsh;": "\u21B0", "Lstrok;": "\u0141", "Lt;": "\u226A", "Map;": "\u2905", "Mcy;": "\u041C", "MediumSpace;": "\u205F", "Mellintrf;": "\u2133", "Mfr;": "\u{1D510}", "MinusPlus;": "\u2213", "Mopf;": "\u{1D544}", "Mscr;": "\u2133", "Mu;": "\u039C", "NJcy;": "\u040A", "Nacute;": "\u0143", "Ncaron;": "\u0147", "Ncedil;": "\u0145", "Ncy;": "\u041D", "NegativeMediumSpace;": "\u200B", "NegativeThickSpace;": "\u200B", "NegativeThinSpace;": "\u200B", "NegativeVeryThinSpace;": "\u200B", "NestedGreaterGreater;": "\u226B", "NestedLessLess;": "\u226A", "NewLine;": "\n", "Nfr;": "\u{1D511}", "NoBreak;": "\u2060", "NonBreakingSpace;": "\xA0", "Nopf;": "\u2115", "Not;": "\u2AEC", "NotCongruent;": "\u2262", "NotCupCap;": "\u226D", "NotDoubleVerticalBar;": "\u2226", "NotElement;": "\u2209", "NotEqual;": "\u2260", "NotEqualTilde;": "\u2242\u0338", "NotExists;": "\u2204", "NotGreater;": "\u226F", "NotGreaterEqual;": "\u2271", "NotGreaterFullEqual;": "\u2267\u0338", "NotGreaterGreater;": "\u226B\u0338", "NotGreaterLess;": "\u2279", "NotGreaterSlantEqual;": "\u2A7E\u0338", "NotGreaterTilde;": "\u2275", "NotHumpDownHump;": "\u224E\u0338", "NotHumpEqual;": "\u224F\u0338", "NotLeftTriangle;": "\u22EA", "NotLeftTriangleBar;": "\u29CF\u0338", "NotLeftTriangleEqual;": "\u22EC", "NotLess;": "\u226E", "NotLessEqual;": "\u2270", "NotLessGreater;": "\u2278", "NotLessLess;": "\u226A\u0338", "NotLessSlantEqual;": "\u2A7D\u0338", "NotLessTilde;": "\u2274", "NotNestedGreaterGreater;": "\u2AA2\u0338", "NotNestedLessLess;": "\u2AA1\u0338", "NotPrecedes;": "\u2280", "NotPrecedesEqual;": "\u2AAF\u0338", "NotPrecedesSlantEqual;": "\u22E0", "NotReverseElement;": "\u220C", "NotRightTriangle;": "\u22EB", "NotRightTriangleBar;": "\u29D0\u0338", "NotRightTriangleEqual;": "\u22ED", "NotSquareSubset;": "\u228F\u0338", "NotSquareSubsetEqual;": "\u22E2", "NotSquareSuperset;": "\u2290\u0338", "NotSquareSupersetEqual;": "\u22E3", "NotSubset;": "\u2282\u20D2", "NotSubsetEqual;": "\u2288", "NotSucceeds;": "\u2281", "NotSucceedsEqual;": "\u2AB0\u0338", "NotSucceedsSlantEqual;": "\u22E1", "NotSucceedsTilde;": "\u227F\u0338", "NotSuperset;": "\u2283\u20D2", "NotSupersetEqual;": "\u2289", "NotTilde;": "\u2241", "NotTildeEqual;": "\u2244", "NotTildeFullEqual;": "\u2247", "NotTildeTilde;": "\u2249", "NotVerticalBar;": "\u2224", "Nscr;": "\u{1D4A9}", "Ntilde": "\xD1", "Ntilde;": "\xD1", "Nu;": "\u039D", "OElig;": "\u0152", "Oacute": "\xD3", "Oacute;": "\xD3", "Ocirc": "\xD4", "Ocirc;": "\xD4", "Ocy;": "\u041E", "Odblac;": "\u0150", "Ofr;": "\u{1D512}", "Ograve": "\xD2", "Ograve;": "\xD2", "Omacr;": "\u014C", "Omega;": "\u03A9", "Omicron;": "\u039F", "Oopf;": "\u{1D546}", "OpenCurlyDoubleQuote;": "\u201C", "OpenCurlyQuote;": "\u2018", "Or;": "\u2A54", "Oscr;": "\u{1D4AA}", "Oslash": "\xD8", "Oslash;": "\xD8", "Otilde": "\xD5", "Otilde;": "\xD5", "Otimes;": "\u2A37", "Ouml": "\xD6", "Ouml;": "\xD6", "OverBar;": "\u203E", "OverBrace;": "\u23DE", "OverBracket;": "\u23B4", "OverParenthesis;": "\u23DC", "PartialD;": "\u2202", "Pcy;": "\u041F", "Pfr;": "\u{1D513}", "Phi;": "\u03A6", "Pi;": "\u03A0", "PlusMinus;": "\xB1", "Poincareplane;": "\u210C", "Popf;": "\u2119", "Pr;": "\u2ABB", "Precedes;": "\u227A", "PrecedesEqual;": "\u2AAF", "PrecedesSlantEqual;": "\u227C", "PrecedesTilde;": "\u227E", "Prime;": "\u2033", "Product;": "\u220F", "Proportion;": "\u2237", "Proportional;": "\u221D", "Pscr;": "\u{1D4AB}", "Psi;": "\u03A8", "QUOT": '"', "QUOT;": '"', "Qfr;": "\u{1D514}", "Qopf;": "\u211A", "Qscr;": "\u{1D4AC}", "RBarr;": "\u2910", "REG": "\xAE", "REG;": "\xAE", "Racute;": "\u0154", "Rang;": "\u27EB", "Rarr;": "\u21A0", "Rarrtl;": "\u2916", "Rcaron;": "\u0158", "Rcedil;": "\u0156", "Rcy;": "\u0420", "Re;": "\u211C", "ReverseElement;": "\u220B", "ReverseEquilibrium;": "\u21CB", "ReverseUpEquilibrium;": "\u296F", "Rfr;": "\u211C", "Rho;": "\u03A1", "RightAngleBracket;": "\u27E9", "RightArrow;": "\u2192", "RightArrowBar;": "\u21E5", "RightArrowLeftArrow;": "\u21C4", "RightCeiling;": "\u2309", "RightDoubleBracket;": "\u27E7", "RightDownTeeVector;": "\u295D", "RightDownVector;": "\u21C2", "RightDownVectorBar;": "\u2955", "RightFloor;": "\u230B", "RightTee;": "\u22A2", "RightTeeArrow;": "\u21A6", "RightTeeVector;": "\u295B", "RightTriangle;": "\u22B3", "RightTriangleBar;": "\u29D0", "RightTriangleEqual;": "\u22B5", "RightUpDownVector;": "\u294F", "RightUpTeeVector;": "\u295C", "RightUpVector;": "\u21BE", "RightUpVectorBar;": "\u2954", "RightVector;": "\u21C0", "RightVectorBar;": "\u2953", "Rightarrow;": "\u21D2", "Ropf;": "\u211D", "RoundImplies;": "\u2970", "Rrightarrow;": "\u21DB", "Rscr;": "\u211B", "Rsh;": "\u21B1", "RuleDelayed;": "\u29F4", "SHCHcy;": "\u0429", "SHcy;": "\u0428", "SOFTcy;": "\u042C", "Sacute;": "\u015A", "Sc;": "\u2ABC", "Scaron;": "\u0160", "Scedil;": "\u015E", "Scirc;": "\u015C", "Scy;": "\u0421", "Sfr;": "\u{1D516}", "ShortDownArrow;": "\u2193", "ShortLeftArrow;": "\u2190", "ShortRightArrow;": "\u2192", "ShortUpArrow;": "\u2191", "Sigma;": "\u03A3", "SmallCircle;": "\u2218", "Sopf;": "\u{1D54A}", "Sqrt;": "\u221A", "Square;": "\u25A1", "SquareIntersection;": "\u2293", "SquareSubset;": "\u228F", "SquareSubsetEqual;": "\u2291", "SquareSuperset;": "\u2290", "SquareSupersetEqual;": "\u2292", "SquareUnion;": "\u2294", "Sscr;": "\u{1D4AE}", "Star;": "\u22C6", "Sub;": "\u22D0", "Subset;": "\u22D0", "SubsetEqual;": "\u2286", "Succeeds;": "\u227B", "SucceedsEqual;": "\u2AB0", "SucceedsSlantEqual;": "\u227D", "SucceedsTilde;": "\u227F", "SuchThat;": "\u220B", "Sum;": "\u2211", "Sup;": "\u22D1", "Superset;": "\u2283", "SupersetEqual;": "\u2287", "Supset;": "\u22D1", "THORN": "\xDE", "THORN;": "\xDE", "TRADE;": "\u2122", "TSHcy;": "\u040B", "TScy;": "\u0426", "Tab;": "	", "Tau;": "\u03A4", "Tcaron;": "\u0164", "Tcedil;": "\u0162", "Tcy;": "\u0422", "Tfr;": "\u{1D517}", "Therefore;": "\u2234", "Theta;": "\u0398", "ThickSpace;": "\u205F\u200A", "ThinSpace;": "\u2009", "Tilde;": "\u223C", "TildeEqual;": "\u2243", "TildeFullEqual;": "\u2245", "TildeTilde;": "\u2248", "Topf;": "\u{1D54B}", "TripleDot;": "\u20DB", "Tscr;": "\u{1D4AF}", "Tstrok;": "\u0166", "Uacute": "\xDA", "Uacute;": "\xDA", "Uarr;": "\u219F", "Uarrocir;": "\u2949", "Ubrcy;": "\u040E", "Ubreve;": "\u016C", "Ucirc": "\xDB", "Ucirc;": "\xDB", "Ucy;": "\u0423", "Udblac;": "\u0170", "Ufr;": "\u{1D518}", "Ugrave": "\xD9", "Ugrave;": "\xD9", "Umacr;": "\u016A", "UnderBar;": "_", "UnderBrace;": "\u23DF", "UnderBracket;": "\u23B5", "UnderParenthesis;": "\u23DD", "Union;": "\u22C3", "UnionPlus;": "\u228E", "Uogon;": "\u0172", "Uopf;": "\u{1D54C}", "UpArrow;": "\u2191", "UpArrowBar;": "\u2912", "UpArrowDownArrow;": "\u21C5", "UpDownArrow;": "\u2195", "UpEquilibrium;": "\u296E", "UpTee;": "\u22A5", "UpTeeArrow;": "\u21A5", "Uparrow;": "\u21D1", "Updownarrow;": "\u21D5", "UpperLeftArrow;": "\u2196", "UpperRightArrow;": "\u2197", "Upsi;": "\u03D2", "Upsilon;": "\u03A5", "Uring;": "\u016E", "Uscr;": "\u{1D4B0}", "Utilde;": "\u0168", "Uuml": "\xDC", "Uuml;": "\xDC", "VDash;": "\u22AB", "Vbar;": "\u2AEB", "Vcy;": "\u0412", "Vdash;": "\u22A9", "Vdashl;": "\u2AE6", "Vee;": "\u22C1", "Verbar;": "\u2016", "Vert;": "\u2016", "VerticalBar;": "\u2223", "VerticalLine;": "|", "VerticalSeparator;": "\u2758", "VerticalTilde;": "\u2240", "VeryThinSpace;": "\u200A", "Vfr;": "\u{1D519}", "Vopf;": "\u{1D54D}", "Vscr;": "\u{1D4B1}", "Vvdash;": "\u22AA", "Wcirc;": "\u0174", "Wedge;": "\u22C0", "Wfr;": "\u{1D51A}", "Wopf;": "\u{1D54E}", "Wscr;": "\u{1D4B2}", "Xfr;": "\u{1D51B}", "Xi;": "\u039E", "Xopf;": "\u{1D54F}", "Xscr;": "\u{1D4B3}", "YAcy;": "\u042F", "YIcy;": "\u0407", "YUcy;": "\u042E", "Yacute": "\xDD", "Yacute;": "\xDD", "Ycirc;": "\u0176", "Ycy;": "\u042B", "Yfr;": "\u{1D51C}", "Yopf;": "\u{1D550}", "Yscr;": "\u{1D4B4}", "Yuml;": "\u0178", "ZHcy;": "\u0416", "Zacute;": "\u0179", "Zcaron;": "\u017D", "Zcy;": "\u0417", "Zdot;": "\u017B", "ZeroWidthSpace;": "\u200B", "Zeta;": "\u0396", "Zfr;": "\u2128", "Zopf;": "\u2124", "Zscr;": "\u{1D4B5}", "aacute": "\xE1", "aacute;": "\xE1", "abreve;": "\u0103", "ac;": "\u223E", "acE;": "\u223E\u0333", "acd;": "\u223F", "acirc": "\xE2", "acirc;": "\xE2", "acute": "\xB4", "acute;": "\xB4", "acy;": "\u0430", "aelig": "\xE6", "aelig;": "\xE6", "af;": "\u2061", "afr;": "\u{1D51E}", "agrave": "\xE0", "agrave;": "\xE0", "alefsym;": "\u2135", "aleph;": "\u2135", "alpha;": "\u03B1", "amacr;": "\u0101", "amalg;": "\u2A3F", "amp": "&", "amp;": "&", "and;": "\u2227", "andand;": "\u2A55", "andd;": "\u2A5C", "andslope;": "\u2A58", "andv;": "\u2A5A", "ang;": "\u2220", "ange;": "\u29A4", "angle;": "\u2220", "angmsd;": "\u2221", "angmsdaa;": "\u29A8", "angmsdab;": "\u29A9", "angmsdac;": "\u29AA", "angmsdad;": "\u29AB", "angmsdae;": "\u29AC", "angmsdaf;": "\u29AD", "angmsdag;": "\u29AE", "angmsdah;": "\u29AF", "angrt;": "\u221F", "angrtvb;": "\u22BE", "angrtvbd;": "\u299D", "angsph;": "\u2222", "angst;": "\xC5", "angzarr;": "\u237C", "aogon;": "\u0105", "aopf;": "\u{1D552}", "ap;": "\u2248", "apE;": "\u2A70", "apacir;": "\u2A6F", "ape;": "\u224A", "apid;": "\u224B", "apos;": "'", "approx;": "\u2248", "approxeq;": "\u224A", "aring": "\xE5", "aring;": "\xE5", "ascr;": "\u{1D4B6}", "ast;": "*", "asymp;": "\u2248", "asympeq;": "\u224D", "atilde": "\xE3", "atilde;": "\xE3", "auml": "\xE4", "auml;": "\xE4", "awconint;": "\u2233", "awint;": "\u2A11", "bNot;": "\u2AED", "backcong;": "\u224C", "backepsilon;": "\u03F6", "backprime;": "\u2035", "backsim;": "\u223D", "backsimeq;": "\u22CD", "barvee;": "\u22BD", "barwed;": "\u2305", "barwedge;": "\u2305", "bbrk;": "\u23B5", "bbrktbrk;": "\u23B6", "bcong;": "\u224C", "bcy;": "\u0431", "bdquo;": "\u201E", "becaus;": "\u2235", "because;": "\u2235", "bemptyv;": "\u29B0", "bepsi;": "\u03F6", "bernou;": "\u212C", "beta;": "\u03B2", "beth;": "\u2136", "between;": "\u226C", "bfr;": "\u{1D51F}", "bigcap;": "\u22C2", "bigcirc;": "\u25EF", "bigcup;": "\u22C3", "bigodot;": "\u2A00", "bigoplus;": "\u2A01", "bigotimes;": "\u2A02", "bigsqcup;": "\u2A06", "bigstar;": "\u2605", "bigtriangledown;": "\u25BD", "bigtriangleup;": "\u25B3", "biguplus;": "\u2A04", "bigvee;": "\u22C1", "bigwedge;": "\u22C0", "bkarow;": "\u290D", "blacklozenge;": "\u29EB", "blacksquare;": "\u25AA", "blacktriangle;": "\u25B4", "blacktriangledown;": "\u25BE", "blacktriangleleft;": "\u25C2", "blacktriangleright;": "\u25B8", "blank;": "\u2423", "blk12;": "\u2592", "blk14;": "\u2591", "blk34;": "\u2593", "block;": "\u2588", "bne;": "=\u20E5", "bnequiv;": "\u2261\u20E5", "bnot;": "\u2310", "bopf;": "\u{1D553}", "bot;": "\u22A5", "bottom;": "\u22A5", "bowtie;": "\u22C8", "boxDL;": "\u2557", "boxDR;": "\u2554", "boxDl;": "\u2556", "boxDr;": "\u2553", "boxH;": "\u2550", "boxHD;": "\u2566", "boxHU;": "\u2569", "boxHd;": "\u2564", "boxHu;": "\u2567", "boxUL;": "\u255D", "boxUR;": "\u255A", "boxUl;": "\u255C", "boxUr;": "\u2559", "boxV;": "\u2551", "boxVH;": "\u256C", "boxVL;": "\u2563", "boxVR;": "\u2560", "boxVh;": "\u256B", "boxVl;": "\u2562", "boxVr;": "\u255F", "boxbox;": "\u29C9", "boxdL;": "\u2555", "boxdR;": "\u2552", "boxdl;": "\u2510", "boxdr;": "\u250C", "boxh;": "\u2500", "boxhD;": "\u2565", "boxhU;": "\u2568", "boxhd;": "\u252C", "boxhu;": "\u2534", "boxminus;": "\u229F", "boxplus;": "\u229E", "boxtimes;": "\u22A0", "boxuL;": "\u255B", "boxuR;": "\u2558", "boxul;": "\u2518", "boxur;": "\u2514", "boxv;": "\u2502", "boxvH;": "\u256A", "boxvL;": "\u2561", "boxvR;": "\u255E", "boxvh;": "\u253C", "boxvl;": "\u2524", "boxvr;": "\u251C", "bprime;": "\u2035", "breve;": "\u02D8", "brvbar": "\xA6", "brvbar;": "\xA6", "bscr;": "\u{1D4B7}", "bsemi;": "\u204F", "bsim;": "\u223D", "bsime;": "\u22CD", "bsol;": "\\", "bsolb;": "\u29C5", "bsolhsub;": "\u27C8", "bull;": "\u2022", "bullet;": "\u2022", "bump;": "\u224E", "bumpE;": "\u2AAE", "bumpe;": "\u224F", "bumpeq;": "\u224F", "cacute;": "\u0107", "cap;": "\u2229", "capand;": "\u2A44", "capbrcup;": "\u2A49", "capcap;": "\u2A4B", "capcup;": "\u2A47", "capdot;": "\u2A40", "caps;": "\u2229\uFE00", "caret;": "\u2041", "caron;": "\u02C7", "ccaps;": "\u2A4D", "ccaron;": "\u010D", "ccedil": "\xE7", "ccedil;": "\xE7", "ccirc;": "\u0109", "ccups;": "\u2A4C", "ccupssm;": "\u2A50", "cdot;": "\u010B", "cedil": "\xB8", "cedil;": "\xB8", "cemptyv;": "\u29B2", "cent": "\xA2", "cent;": "\xA2", "centerdot;": "\xB7", "cfr;": "\u{1D520}", "chcy;": "\u0447", "check;": "\u2713", "checkmark;": "\u2713", "chi;": "\u03C7", "cir;": "\u25CB", "cirE;": "\u29C3", "circ;": "\u02C6", "circeq;": "\u2257", "circlearrowleft;": "\u21BA", "circlearrowright;": "\u21BB", "circledR;": "\xAE", "circledS;": "\u24C8", "circledast;": "\u229B", "circledcirc;": "\u229A", "circleddash;": "\u229D", "cire;": "\u2257", "cirfnint;": "\u2A10", "cirmid;": "\u2AEF", "cirscir;": "\u29C2", "clubs;": "\u2663", "clubsuit;": "\u2663", "colon;": ":", "colone;": "\u2254", "coloneq;": "\u2254", "comma;": ",", "commat;": "@", "comp;": "\u2201", "compfn;": "\u2218", "complement;": "\u2201", "complexes;": "\u2102", "cong;": "\u2245", "congdot;": "\u2A6D", "conint;": "\u222E", "copf;": "\u{1D554}", "coprod;": "\u2210", "copy": "\xA9", "copy;": "\xA9", "copysr;": "\u2117", "crarr;": "\u21B5", "cross;": "\u2717", "cscr;": "\u{1D4B8}", "csub;": "\u2ACF", "csube;": "\u2AD1", "csup;": "\u2AD0", "csupe;": "\u2AD2", "ctdot;": "\u22EF", "cudarrl;": "\u2938", "cudarrr;": "\u2935", "cuepr;": "\u22DE", "cuesc;": "\u22DF", "cularr;": "\u21B6", "cularrp;": "\u293D", "cup;": "\u222A", "cupbrcap;": "\u2A48", "cupcap;": "\u2A46", "cupcup;": "\u2A4A", "cupdot;": "\u228D", "cupor;": "\u2A45", "cups;": "\u222A\uFE00", "curarr;": "\u21B7", "curarrm;": "\u293C", "curlyeqprec;": "\u22DE", "curlyeqsucc;": "\u22DF", "curlyvee;": "\u22CE", "curlywedge;": "\u22CF", "curren": "\xA4", "curren;": "\xA4", "curvearrowleft;": "\u21B6", "curvearrowright;": "\u21B7", "cuvee;": "\u22CE", "cuwed;": "\u22CF", "cwconint;": "\u2232", "cwint;": "\u2231", "cylcty;": "\u232D", "dArr;": "\u21D3", "dHar;": "\u2965", "dagger;": "\u2020", "daleth;": "\u2138", "darr;": "\u2193", "dash;": "\u2010", "dashv;": "\u22A3", "dbkarow;": "\u290F", "dblac;": "\u02DD", "dcaron;": "\u010F", "dcy;": "\u0434", "dd;": "\u2146", "ddagger;": "\u2021", "ddarr;": "\u21CA", "ddotseq;": "\u2A77", "deg": "\xB0", "deg;": "\xB0", "delta;": "\u03B4", "demptyv;": "\u29B1", "dfisht;": "\u297F", "dfr;": "\u{1D521}", "dharl;": "\u21C3", "dharr;": "\u21C2", "diam;": "\u22C4", "diamond;": "\u22C4", "diamondsuit;": "\u2666", "diams;": "\u2666", "die;": "\xA8", "digamma;": "\u03DD", "disin;": "\u22F2", "div;": "\xF7", "divide": "\xF7", "divide;": "\xF7", "divideontimes;": "\u22C7", "divonx;": "\u22C7", "djcy;": "\u0452", "dlcorn;": "\u231E", "dlcrop;": "\u230D", "dollar;": "$", "dopf;": "\u{1D555}", "dot;": "\u02D9", "doteq;": "\u2250", "doteqdot;": "\u2251", "dotminus;": "\u2238", "dotplus;": "\u2214", "dotsquare;": "\u22A1", "doublebarwedge;": "\u2306", "downarrow;": "\u2193", "downdownarrows;": "\u21CA", "downharpoonleft;": "\u21C3", "downharpoonright;": "\u21C2", "drbkarow;": "\u2910", "drcorn;": "\u231F", "drcrop;": "\u230C", "dscr;": "\u{1D4B9}", "dscy;": "\u0455", "dsol;": "\u29F6", "dstrok;": "\u0111", "dtdot;": "\u22F1", "dtri;": "\u25BF", "dtrif;": "\u25BE", "duarr;": "\u21F5", "duhar;": "\u296F", "dwangle;": "\u29A6", "dzcy;": "\u045F", "dzigrarr;": "\u27FF", "eDDot;": "\u2A77", "eDot;": "\u2251", "eacute": "\xE9", "eacute;": "\xE9", "easter;": "\u2A6E", "ecaron;": "\u011B", "ecir;": "\u2256", "ecirc": "\xEA", "ecirc;": "\xEA", "ecolon;": "\u2255", "ecy;": "\u044D", "edot;": "\u0117", "ee;": "\u2147", "efDot;": "\u2252", "efr;": "\u{1D522}", "eg;": "\u2A9A", "egrave": "\xE8", "egrave;": "\xE8", "egs;": "\u2A96", "egsdot;": "\u2A98", "el;": "\u2A99", "elinters;": "\u23E7", "ell;": "\u2113", "els;": "\u2A95", "elsdot;": "\u2A97", "emacr;": "\u0113", "empty;": "\u2205", "emptyset;": "\u2205", "emptyv;": "\u2205", "emsp13;": "\u2004", "emsp14;": "\u2005", "emsp;": "\u2003", "eng;": "\u014B", "ensp;": "\u2002", "eogon;": "\u0119", "eopf;": "\u{1D556}", "epar;": "\u22D5", "eparsl;": "\u29E3", "eplus;": "\u2A71", "epsi;": "\u03B5", "epsilon;": "\u03B5", "epsiv;": "\u03F5", "eqcirc;": "\u2256", "eqcolon;": "\u2255", "eqsim;": "\u2242", "eqslantgtr;": "\u2A96", "eqslantless;": "\u2A95", "equals;": "=", "equest;": "\u225F", "equiv;": "\u2261", "equivDD;": "\u2A78", "eqvparsl;": "\u29E5", "erDot;": "\u2253", "erarr;": "\u2971", "escr;": "\u212F", "esdot;": "\u2250", "esim;": "\u2242", "eta;": "\u03B7", "eth": "\xF0", "eth;": "\xF0", "euml": "\xEB", "euml;": "\xEB", "euro;": "\u20AC", "excl;": "!", "exist;": "\u2203", "expectation;": "\u2130", "exponentiale;": "\u2147", "fallingdotseq;": "\u2252", "fcy;": "\u0444", "female;": "\u2640", "ffilig;": "\uFB03", "fflig;": "\uFB00", "ffllig;": "\uFB04", "ffr;": "\u{1D523}", "filig;": "\uFB01", "fjlig;": "fj", "flat;": "\u266D", "fllig;": "\uFB02", "fltns;": "\u25B1", "fnof;": "\u0192", "fopf;": "\u{1D557}", "forall;": "\u2200", "fork;": "\u22D4", "forkv;": "\u2AD9", "fpartint;": "\u2A0D", "frac12": "\xBD", "frac12;": "\xBD", "frac13;": "\u2153", "frac14": "\xBC", "frac14;": "\xBC", "frac15;": "\u2155", "frac16;": "\u2159", "frac18;": "\u215B", "frac23;": "\u2154", "frac25;": "\u2156", "frac34": "\xBE", "frac34;": "\xBE", "frac35;": "\u2157", "frac38;": "\u215C", "frac45;": "\u2158", "frac56;": "\u215A", "frac58;": "\u215D", "frac78;": "\u215E", "frasl;": "\u2044", "frown;": "\u2322", "fscr;": "\u{1D4BB}", "gE;": "\u2267", "gEl;": "\u2A8C", "gacute;": "\u01F5", "gamma;": "\u03B3", "gammad;": "\u03DD", "gap;": "\u2A86", "gbreve;": "\u011F", "gcirc;": "\u011D", "gcy;": "\u0433", "gdot;": "\u0121", "ge;": "\u2265", "gel;": "\u22DB", "geq;": "\u2265", "geqq;": "\u2267", "geqslant;": "\u2A7E", "ges;": "\u2A7E", "gescc;": "\u2AA9", "gesdot;": "\u2A80", "gesdoto;": "\u2A82", "gesdotol;": "\u2A84", "gesl;": "\u22DB\uFE00", "gesles;": "\u2A94", "gfr;": "\u{1D524}", "gg;": "\u226B", "ggg;": "\u22D9", "gimel;": "\u2137", "gjcy;": "\u0453", "gl;": "\u2277", "glE;": "\u2A92", "gla;": "\u2AA5", "glj;": "\u2AA4", "gnE;": "\u2269", "gnap;": "\u2A8A", "gnapprox;": "\u2A8A", "gne;": "\u2A88", "gneq;": "\u2A88", "gneqq;": "\u2269", "gnsim;": "\u22E7", "gopf;": "\u{1D558}", "grave;": "`", "gscr;": "\u210A", "gsim;": "\u2273", "gsime;": "\u2A8E", "gsiml;": "\u2A90", "gt": ">", "gt;": ">", "gtcc;": "\u2AA7", "gtcir;": "\u2A7A", "gtdot;": "\u22D7", "gtlPar;": "\u2995", "gtquest;": "\u2A7C", "gtrapprox;": "\u2A86", "gtrarr;": "\u2978", "gtrdot;": "\u22D7", "gtreqless;": "\u22DB", "gtreqqless;": "\u2A8C", "gtrless;": "\u2277", "gtrsim;": "\u2273", "gvertneqq;": "\u2269\uFE00", "gvnE;": "\u2269\uFE00", "hArr;": "\u21D4", "hairsp;": "\u200A", "half;": "\xBD", "hamilt;": "\u210B", "hardcy;": "\u044A", "harr;": "\u2194", "harrcir;": "\u2948", "harrw;": "\u21AD", "hbar;": "\u210F", "hcirc;": "\u0125", "hearts;": "\u2665", "heartsuit;": "\u2665", "hellip;": "\u2026", "hercon;": "\u22B9", "hfr;": "\u{1D525}", "hksearow;": "\u2925", "hkswarow;": "\u2926", "hoarr;": "\u21FF", "homtht;": "\u223B", "hookleftarrow;": "\u21A9", "hookrightarrow;": "\u21AA", "hopf;": "\u{1D559}", "horbar;": "\u2015", "hscr;": "\u{1D4BD}", "hslash;": "\u210F", "hstrok;": "\u0127", "hybull;": "\u2043", "hyphen;": "\u2010", "iacute": "\xED", "iacute;": "\xED", "ic;": "\u2063", "icirc": "\xEE", "icirc;": "\xEE", "icy;": "\u0438", "iecy;": "\u0435", "iexcl": "\xA1", "iexcl;": "\xA1", "iff;": "\u21D4", "ifr;": "\u{1D526}", "igrave": "\xEC", "igrave;": "\xEC", "ii;": "\u2148", "iiiint;": "\u2A0C", "iiint;": "\u222D", "iinfin;": "\u29DC", "iiota;": "\u2129", "ijlig;": "\u0133", "imacr;": "\u012B", "image;": "\u2111", "imagline;": "\u2110", "imagpart;": "\u2111", "imath;": "\u0131", "imof;": "\u22B7", "imped;": "\u01B5", "in;": "\u2208", "incare;": "\u2105", "infin;": "\u221E", "infintie;": "\u29DD", "inodot;": "\u0131", "int;": "\u222B", "intcal;": "\u22BA", "integers;": "\u2124", "intercal;": "\u22BA", "intlarhk;": "\u2A17", "intprod;": "\u2A3C", "iocy;": "\u0451", "iogon;": "\u012F", "iopf;": "\u{1D55A}", "iota;": "\u03B9", "iprod;": "\u2A3C", "iquest": "\xBF", "iquest;": "\xBF", "iscr;": "\u{1D4BE}", "isin;": "\u2208", "isinE;": "\u22F9", "isindot;": "\u22F5", "isins;": "\u22F4", "isinsv;": "\u22F3", "isinv;": "\u2208", "it;": "\u2062", "itilde;": "\u0129", "iukcy;": "\u0456", "iuml": "\xEF", "iuml;": "\xEF", "jcirc;": "\u0135", "jcy;": "\u0439", "jfr;": "\u{1D527}", "jmath;": "\u0237", "jopf;": "\u{1D55B}", "jscr;": "\u{1D4BF}", "jsercy;": "\u0458", "jukcy;": "\u0454", "kappa;": "\u03BA", "kappav;": "\u03F0", "kcedil;": "\u0137", "kcy;": "\u043A", "kfr;": "\u{1D528}", "kgreen;": "\u0138", "khcy;": "\u0445", "kjcy;": "\u045C", "kopf;": "\u{1D55C}", "kscr;": "\u{1D4C0}", "lAarr;": "\u21DA", "lArr;": "\u21D0", "lAtail;": "\u291B", "lBarr;": "\u290E", "lE;": "\u2266", "lEg;": "\u2A8B", "lHar;": "\u2962", "lacute;": "\u013A", "laemptyv;": "\u29B4", "lagran;": "\u2112", "lambda;": "\u03BB", "lang;": "\u27E8", "langd;": "\u2991", "langle;": "\u27E8", "lap;": "\u2A85", "laquo": "\xAB", "laquo;": "\xAB", "larr;": "\u2190", "larrb;": "\u21E4", "larrbfs;": "\u291F", "larrfs;": "\u291D", "larrhk;": "\u21A9", "larrlp;": "\u21AB", "larrpl;": "\u2939", "larrsim;": "\u2973", "larrtl;": "\u21A2", "lat;": "\u2AAB", "latail;": "\u2919", "late;": "\u2AAD", "lates;": "\u2AAD\uFE00", "lbarr;": "\u290C", "lbbrk;": "\u2772", "lbrace;": "{", "lbrack;": "[", "lbrke;": "\u298B", "lbrksld;": "\u298F", "lbrkslu;": "\u298D", "lcaron;": "\u013E", "lcedil;": "\u013C", "lceil;": "\u2308", "lcub;": "{", "lcy;": "\u043B", "ldca;": "\u2936", "ldquo;": "\u201C", "ldquor;": "\u201E", "ldrdhar;": "\u2967", "ldrushar;": "\u294B", "ldsh;": "\u21B2", "le;": "\u2264", "leftarrow;": "\u2190", "leftarrowtail;": "\u21A2", "leftharpoondown;": "\u21BD", "leftharpoonup;": "\u21BC", "leftleftarrows;": "\u21C7", "leftrightarrow;": "\u2194", "leftrightarrows;": "\u21C6", "leftrightharpoons;": "\u21CB", "leftrightsquigarrow;": "\u21AD", "leftthreetimes;": "\u22CB", "leg;": "\u22DA", "leq;": "\u2264", "leqq;": "\u2266", "leqslant;": "\u2A7D", "les;": "\u2A7D", "lescc;": "\u2AA8", "lesdot;": "\u2A7F", "lesdoto;": "\u2A81", "lesdotor;": "\u2A83", "lesg;": "\u22DA\uFE00", "lesges;": "\u2A93", "lessapprox;": "\u2A85", "lessdot;": "\u22D6", "lesseqgtr;": "\u22DA", "lesseqqgtr;": "\u2A8B", "lessgtr;": "\u2276", "lesssim;": "\u2272", "lfisht;": "\u297C", "lfloor;": "\u230A", "lfr;": "\u{1D529}", "lg;": "\u2276", "lgE;": "\u2A91", "lhard;": "\u21BD", "lharu;": "\u21BC", "lharul;": "\u296A", "lhblk;": "\u2584", "ljcy;": "\u0459", "ll;": "\u226A", "llarr;": "\u21C7", "llcorner;": "\u231E", "llhard;": "\u296B", "lltri;": "\u25FA", "lmidot;": "\u0140", "lmoust;": "\u23B0", "lmoustache;": "\u23B0", "lnE;": "\u2268", "lnap;": "\u2A89", "lnapprox;": "\u2A89", "lne;": "\u2A87", "lneq;": "\u2A87", "lneqq;": "\u2268", "lnsim;": "\u22E6", "loang;": "\u27EC", "loarr;": "\u21FD", "lobrk;": "\u27E6", "longleftarrow;": "\u27F5", "longleftrightarrow;": "\u27F7", "longmapsto;": "\u27FC", "longrightarrow;": "\u27F6", "looparrowleft;": "\u21AB", "looparrowright;": "\u21AC", "lopar;": "\u2985", "lopf;": "\u{1D55D}", "loplus;": "\u2A2D", "lotimes;": "\u2A34", "lowast;": "\u2217", "lowbar;": "_", "loz;": "\u25CA", "lozenge;": "\u25CA", "lozf;": "\u29EB", "lpar;": "(", "lparlt;": "\u2993", "lrarr;": "\u21C6", "lrcorner;": "\u231F", "lrhar;": "\u21CB", "lrhard;": "\u296D", "lrm;": "\u200E", "lrtri;": "\u22BF", "lsaquo;": "\u2039", "lscr;": "\u{1D4C1}", "lsh;": "\u21B0", "lsim;": "\u2272", "lsime;": "\u2A8D", "lsimg;": "\u2A8F", "lsqb;": "[", "lsquo;": "\u2018", "lsquor;": "\u201A", "lstrok;": "\u0142", "lt": "<", "lt;": "<", "ltcc;": "\u2AA6", "ltcir;": "\u2A79", "ltdot;": "\u22D6", "lthree;": "\u22CB", "ltimes;": "\u22C9", "ltlarr;": "\u2976", "ltquest;": "\u2A7B", "ltrPar;": "\u2996", "ltri;": "\u25C3", "ltrie;": "\u22B4", "ltrif;": "\u25C2", "lurdshar;": "\u294A", "luruhar;": "\u2966", "lvertneqq;": "\u2268\uFE00", "lvnE;": "\u2268\uFE00", "mDDot;": "\u223A", "macr": "\xAF", "macr;": "\xAF", "male;": "\u2642", "malt;": "\u2720", "maltese;": "\u2720", "map;": "\u21A6", "mapsto;": "\u21A6", "mapstodown;": "\u21A7", "mapstoleft;": "\u21A4", "mapstoup;": "\u21A5", "marker;": "\u25AE", "mcomma;": "\u2A29", "mcy;": "\u043C", "mdash;": "\u2014", "measuredangle;": "\u2221", "mfr;": "\u{1D52A}", "mho;": "\u2127", "micro": "\xB5", "micro;": "\xB5", "mid;": "\u2223", "midast;": "*", "midcir;": "\u2AF0", "middot": "\xB7", "middot;": "\xB7", "minus;": "\u2212", "minusb;": "\u229F", "minusd;": "\u2238", "minusdu;": "\u2A2A", "mlcp;": "\u2ADB", "mldr;": "\u2026", "mnplus;": "\u2213", "models;": "\u22A7", "mopf;": "\u{1D55E}", "mp;": "\u2213", "mscr;": "\u{1D4C2}", "mstpos;": "\u223E", "mu;": "\u03BC", "multimap;": "\u22B8", "mumap;": "\u22B8", "nGg;": "\u22D9\u0338", "nGt;": "\u226B\u20D2", "nGtv;": "\u226B\u0338", "nLeftarrow;": "\u21CD", "nLeftrightarrow;": "\u21CE", "nLl;": "\u22D8\u0338", "nLt;": "\u226A\u20D2", "nLtv;": "\u226A\u0338", "nRightarrow;": "\u21CF", "nVDash;": "\u22AF", "nVdash;": "\u22AE", "nabla;": "\u2207", "nacute;": "\u0144", "nang;": "\u2220\u20D2", "nap;": "\u2249", "napE;": "\u2A70\u0338", "napid;": "\u224B\u0338", "napos;": "\u0149", "napprox;": "\u2249", "natur;": "\u266E", "natural;": "\u266E", "naturals;": "\u2115", "nbsp": "\xA0", "nbsp;": "\xA0", "nbump;": "\u224E\u0338", "nbumpe;": "\u224F\u0338", "ncap;": "\u2A43", "ncaron;": "\u0148", "ncedil;": "\u0146", "ncong;": "\u2247", "ncongdot;": "\u2A6D\u0338", "ncup;": "\u2A42", "ncy;": "\u043D", "ndash;": "\u2013", "ne;": "\u2260", "neArr;": "\u21D7", "nearhk;": "\u2924", "nearr;": "\u2197", "nearrow;": "\u2197", "nedot;": "\u2250\u0338", "nequiv;": "\u2262", "nesear;": "\u2928", "nesim;": "\u2242\u0338", "nexist;": "\u2204", "nexists;": "\u2204", "nfr;": "\u{1D52B}", "ngE;": "\u2267\u0338", "nge;": "\u2271", "ngeq;": "\u2271", "ngeqq;": "\u2267\u0338", "ngeqslant;": "\u2A7E\u0338", "nges;": "\u2A7E\u0338", "ngsim;": "\u2275", "ngt;": "\u226F", "ngtr;": "\u226F", "nhArr;": "\u21CE", "nharr;": "\u21AE", "nhpar;": "\u2AF2", "ni;": "\u220B", "nis;": "\u22FC", "nisd;": "\u22FA", "niv;": "\u220B", "njcy;": "\u045A", "nlArr;": "\u21CD", "nlE;": "\u2266\u0338", "nlarr;": "\u219A", "nldr;": "\u2025", "nle;": "\u2270", "nleftarrow;": "\u219A", "nleftrightarrow;": "\u21AE", "nleq;": "\u2270", "nleqq;": "\u2266\u0338", "nleqslant;": "\u2A7D\u0338", "nles;": "\u2A7D\u0338", "nless;": "\u226E", "nlsim;": "\u2274", "nlt;": "\u226E", "nltri;": "\u22EA", "nltrie;": "\u22EC", "nmid;": "\u2224", "nopf;": "\u{1D55F}", "not": "\xAC", "not;": "\xAC", "notin;": "\u2209", "notinE;": "\u22F9\u0338", "notindot;": "\u22F5\u0338", "notinva;": "\u2209", "notinvb;": "\u22F7", "notinvc;": "\u22F6", "notni;": "\u220C", "notniva;": "\u220C", "notnivb;": "\u22FE", "notnivc;": "\u22FD", "npar;": "\u2226", "nparallel;": "\u2226", "nparsl;": "\u2AFD\u20E5", "npart;": "\u2202\u0338", "npolint;": "\u2A14", "npr;": "\u2280", "nprcue;": "\u22E0", "npre;": "\u2AAF\u0338", "nprec;": "\u2280", "npreceq;": "\u2AAF\u0338", "nrArr;": "\u21CF", "nrarr;": "\u219B", "nrarrc;": "\u2933\u0338", "nrarrw;": "\u219D\u0338", "nrightarrow;": "\u219B", "nrtri;": "\u22EB", "nrtrie;": "\u22ED", "nsc;": "\u2281", "nsccue;": "\u22E1", "nsce;": "\u2AB0\u0338", "nscr;": "\u{1D4C3}", "nshortmid;": "\u2224", "nshortparallel;": "\u2226", "nsim;": "\u2241", "nsime;": "\u2244", "nsimeq;": "\u2244", "nsmid;": "\u2224", "nspar;": "\u2226", "nsqsube;": "\u22E2", "nsqsupe;": "\u22E3", "nsub;": "\u2284", "nsubE;": "\u2AC5\u0338", "nsube;": "\u2288", "nsubset;": "\u2282\u20D2", "nsubseteq;": "\u2288", "nsubseteqq;": "\u2AC5\u0338", "nsucc;": "\u2281", "nsucceq;": "\u2AB0\u0338", "nsup;": "\u2285", "nsupE;": "\u2AC6\u0338", "nsupe;": "\u2289", "nsupset;": "\u2283\u20D2", "nsupseteq;": "\u2289", "nsupseteqq;": "\u2AC6\u0338", "ntgl;": "\u2279", "ntilde": "\xF1", "ntilde;": "\xF1", "ntlg;": "\u2278", "ntriangleleft;": "\u22EA", "ntrianglelefteq;": "\u22EC", "ntriangleright;": "\u22EB", "ntrianglerighteq;": "\u22ED", "nu;": "\u03BD", "num;": "#", "numero;": "\u2116", "numsp;": "\u2007", "nvDash;": "\u22AD", "nvHarr;": "\u2904", "nvap;": "\u224D\u20D2", "nvdash;": "\u22AC", "nvge;": "\u2265\u20D2", "nvgt;": ">\u20D2", "nvinfin;": "\u29DE", "nvlArr;": "\u2902", "nvle;": "\u2264\u20D2", "nvlt;": "<\u20D2", "nvltrie;": "\u22B4\u20D2", "nvrArr;": "\u2903", "nvrtrie;": "\u22B5\u20D2", "nvsim;": "\u223C\u20D2", "nwArr;": "\u21D6", "nwarhk;": "\u2923", "nwarr;": "\u2196", "nwarrow;": "\u2196", "nwnear;": "\u2927", "oS;": "\u24C8", "oacute": "\xF3", "oacute;": "\xF3", "oast;": "\u229B", "ocir;": "\u229A", "ocirc": "\xF4", "ocirc;": "\xF4", "ocy;": "\u043E", "odash;": "\u229D", "odblac;": "\u0151", "odiv;": "\u2A38", "odot;": "\u2299", "odsold;": "\u29BC", "oelig;": "\u0153", "ofcir;": "\u29BF", "ofr;": "\u{1D52C}", "ogon;": "\u02DB", "ograve": "\xF2", "ograve;": "\xF2", "ogt;": "\u29C1", "ohbar;": "\u29B5", "ohm;": "\u03A9", "oint;": "\u222E", "olarr;": "\u21BA", "olcir;": "\u29BE", "olcross;": "\u29BB", "oline;": "\u203E", "olt;": "\u29C0", "omacr;": "\u014D", "omega;": "\u03C9", "omicron;": "\u03BF", "omid;": "\u29B6", "ominus;": "\u2296", "oopf;": "\u{1D560}", "opar;": "\u29B7", "operp;": "\u29B9", "oplus;": "\u2295", "or;": "\u2228", "orarr;": "\u21BB", "ord;": "\u2A5D", "order;": "\u2134", "orderof;": "\u2134", "ordf": "\xAA", "ordf;": "\xAA", "ordm": "\xBA", "ordm;": "\xBA", "origof;": "\u22B6", "oror;": "\u2A56", "orslope;": "\u2A57", "orv;": "\u2A5B", "oscr;": "\u2134", "oslash": "\xF8", "oslash;": "\xF8", "osol;": "\u2298", "otilde": "\xF5", "otilde;": "\xF5", "otimes;": "\u2297", "otimesas;": "\u2A36", "ouml": "\xF6", "ouml;": "\xF6", "ovbar;": "\u233D", "par;": "\u2225", "para": "\xB6", "para;": "\xB6", "parallel;": "\u2225", "parsim;": "\u2AF3", "parsl;": "\u2AFD", "part;": "\u2202", "pcy;": "\u043F", "percnt;": "%", "period;": ".", "permil;": "\u2030", "perp;": "\u22A5", "pertenk;": "\u2031", "pfr;": "\u{1D52D}", "phi;": "\u03C6", "phiv;": "\u03D5", "phmmat;": "\u2133", "phone;": "\u260E", "pi;": "\u03C0", "pitchfork;": "\u22D4", "piv;": "\u03D6", "planck;": "\u210F", "planckh;": "\u210E", "plankv;": "\u210F", "plus;": "+", "plusacir;": "\u2A23", "plusb;": "\u229E", "pluscir;": "\u2A22", "plusdo;": "\u2214", "plusdu;": "\u2A25", "pluse;": "\u2A72", "plusmn": "\xB1", "plusmn;": "\xB1", "plussim;": "\u2A26", "plustwo;": "\u2A27", "pm;": "\xB1", "pointint;": "\u2A15", "popf;": "\u{1D561}", "pound": "\xA3", "pound;": "\xA3", "pr;": "\u227A", "prE;": "\u2AB3", "prap;": "\u2AB7", "prcue;": "\u227C", "pre;": "\u2AAF", "prec;": "\u227A", "precapprox;": "\u2AB7", "preccurlyeq;": "\u227C", "preceq;": "\u2AAF", "precnapprox;": "\u2AB9", "precneqq;": "\u2AB5", "precnsim;": "\u22E8", "precsim;": "\u227E", "prime;": "\u2032", "primes;": "\u2119", "prnE;": "\u2AB5", "prnap;": "\u2AB9", "prnsim;": "\u22E8", "prod;": "\u220F", "profalar;": "\u232E", "profline;": "\u2312", "profsurf;": "\u2313", "prop;": "\u221D", "propto;": "\u221D", "prsim;": "\u227E", "prurel;": "\u22B0", "pscr;": "\u{1D4C5}", "psi;": "\u03C8", "puncsp;": "\u2008", "qfr;": "\u{1D52E}", "qint;": "\u2A0C", "qopf;": "\u{1D562}", "qprime;": "\u2057", "qscr;": "\u{1D4C6}", "quaternions;": "\u210D", "quatint;": "\u2A16", "quest;": "?", "questeq;": "\u225F", "quot": '"', "quot;": '"', "rAarr;": "\u21DB", "rArr;": "\u21D2", "rAtail;": "\u291C", "rBarr;": "\u290F", "rHar;": "\u2964", "race;": "\u223D\u0331", "racute;": "\u0155", "radic;": "\u221A", "raemptyv;": "\u29B3", "rang;": "\u27E9", "rangd;": "\u2992", "range;": "\u29A5", "rangle;": "\u27E9", "raquo": "\xBB", "raquo;": "\xBB", "rarr;": "\u2192", "rarrap;": "\u2975", "rarrb;": "\u21E5", "rarrbfs;": "\u2920", "rarrc;": "\u2933", "rarrfs;": "\u291E", "rarrhk;": "\u21AA", "rarrlp;": "\u21AC", "rarrpl;": "\u2945", "rarrsim;": "\u2974", "rarrtl;": "\u21A3", "rarrw;": "\u219D", "ratail;": "\u291A", "ratio;": "\u2236", "rationals;": "\u211A", "rbarr;": "\u290D", "rbbrk;": "\u2773", "rbrace;": "}", "rbrack;": "]", "rbrke;": "\u298C", "rbrksld;": "\u298E", "rbrkslu;": "\u2990", "rcaron;": "\u0159", "rcedil;": "\u0157", "rceil;": "\u2309", "rcub;": "}", "rcy;": "\u0440", "rdca;": "\u2937", "rdldhar;": "\u2969", "rdquo;": "\u201D", "rdquor;": "\u201D", "rdsh;": "\u21B3", "real;": "\u211C", "realine;": "\u211B", "realpart;": "\u211C", "reals;": "\u211D", "rect;": "\u25AD", "reg": "\xAE", "reg;": "\xAE", "rfisht;": "\u297D", "rfloor;": "\u230B", "rfr;": "\u{1D52F}", "rhard;": "\u21C1", "rharu;": "\u21C0", "rharul;": "\u296C", "rho;": "\u03C1", "rhov;": "\u03F1", "rightarrow;": "\u2192", "rightarrowtail;": "\u21A3", "rightharpoondown;": "\u21C1", "rightharpoonup;": "\u21C0", "rightleftarrows;": "\u21C4", "rightleftharpoons;": "\u21CC", "rightrightarrows;": "\u21C9", "rightsquigarrow;": "\u219D", "rightthreetimes;": "\u22CC", "ring;": "\u02DA", "risingdotseq;": "\u2253", "rlarr;": "\u21C4", "rlhar;": "\u21CC", "rlm;": "\u200F", "rmoust;": "\u23B1", "rmoustache;": "\u23B1", "rnmid;": "\u2AEE", "roang;": "\u27ED", "roarr;": "\u21FE", "robrk;": "\u27E7", "ropar;": "\u2986", "ropf;": "\u{1D563}", "roplus;": "\u2A2E", "rotimes;": "\u2A35", "rpar;": ")", "rpargt;": "\u2994", "rppolint;": "\u2A12", "rrarr;": "\u21C9", "rsaquo;": "\u203A", "rscr;": "\u{1D4C7}", "rsh;": "\u21B1", "rsqb;": "]", "rsquo;": "\u2019", "rsquor;": "\u2019", "rthree;": "\u22CC", "rtimes;": "\u22CA", "rtri;": "\u25B9", "rtrie;": "\u22B5", "rtrif;": "\u25B8", "rtriltri;": "\u29CE", "ruluhar;": "\u2968", "rx;": "\u211E", "sacute;": "\u015B", "sbquo;": "\u201A", "sc;": "\u227B", "scE;": "\u2AB4", "scap;": "\u2AB8", "scaron;": "\u0161", "sccue;": "\u227D", "sce;": "\u2AB0", "scedil;": "\u015F", "scirc;": "\u015D", "scnE;": "\u2AB6", "scnap;": "\u2ABA", "scnsim;": "\u22E9", "scpolint;": "\u2A13", "scsim;": "\u227F", "scy;": "\u0441", "sdot;": "\u22C5", "sdotb;": "\u22A1", "sdote;": "\u2A66", "seArr;": "\u21D8", "searhk;": "\u2925", "searr;": "\u2198", "searrow;": "\u2198", "sect": "\xA7", "sect;": "\xA7", "semi;": ";", "seswar;": "\u2929", "setminus;": "\u2216", "setmn;": "\u2216", "sext;": "\u2736", "sfr;": "\u{1D530}", "sfrown;": "\u2322", "sharp;": "\u266F", "shchcy;": "\u0449", "shcy;": "\u0448", "shortmid;": "\u2223", "shortparallel;": "\u2225", "shy": "\xAD", "shy;": "\xAD", "sigma;": "\u03C3", "sigmaf;": "\u03C2", "sigmav;": "\u03C2", "sim;": "\u223C", "simdot;": "\u2A6A", "sime;": "\u2243", "simeq;": "\u2243", "simg;": "\u2A9E", "simgE;": "\u2AA0", "siml;": "\u2A9D", "simlE;": "\u2A9F", "simne;": "\u2246", "simplus;": "\u2A24", "simrarr;": "\u2972", "slarr;": "\u2190", "smallsetminus;": "\u2216", "smashp;": "\u2A33", "smeparsl;": "\u29E4", "smid;": "\u2223", "smile;": "\u2323", "smt;": "\u2AAA", "smte;": "\u2AAC", "smtes;": "\u2AAC\uFE00", "softcy;": "\u044C", "sol;": "/", "solb;": "\u29C4", "solbar;": "\u233F", "sopf;": "\u{1D564}", "spades;": "\u2660", "spadesuit;": "\u2660", "spar;": "\u2225", "sqcap;": "\u2293", "sqcaps;": "\u2293\uFE00", "sqcup;": "\u2294", "sqcups;": "\u2294\uFE00", "sqsub;": "\u228F", "sqsube;": "\u2291", "sqsubset;": "\u228F", "sqsubseteq;": "\u2291", "sqsup;": "\u2290", "sqsupe;": "\u2292", "sqsupset;": "\u2290", "sqsupseteq;": "\u2292", "squ;": "\u25A1", "square;": "\u25A1", "squarf;": "\u25AA", "squf;": "\u25AA", "srarr;": "\u2192", "sscr;": "\u{1D4C8}", "ssetmn;": "\u2216", "ssmile;": "\u2323", "sstarf;": "\u22C6", "star;": "\u2606", "starf;": "\u2605", "straightepsilon;": "\u03F5", "straightphi;": "\u03D5", "strns;": "\xAF", "sub;": "\u2282", "subE;": "\u2AC5", "subdot;": "\u2ABD", "sube;": "\u2286", "subedot;": "\u2AC3", "submult;": "\u2AC1", "subnE;": "\u2ACB", "subne;": "\u228A", "subplus;": "\u2ABF", "subrarr;": "\u2979", "subset;": "\u2282", "subseteq;": "\u2286", "subseteqq;": "\u2AC5", "subsetneq;": "\u228A", "subsetneqq;": "\u2ACB", "subsim;": "\u2AC7", "subsub;": "\u2AD5", "subsup;": "\u2AD3", "succ;": "\u227B", "succapprox;": "\u2AB8", "succcurlyeq;": "\u227D", "succeq;": "\u2AB0", "succnapprox;": "\u2ABA", "succneqq;": "\u2AB6", "succnsim;": "\u22E9", "succsim;": "\u227F", "sum;": "\u2211", "sung;": "\u266A", "sup1": "\xB9", "sup1;": "\xB9", "sup2": "\xB2", "sup2;": "\xB2", "sup3": "\xB3", "sup3;": "\xB3", "sup;": "\u2283", "supE;": "\u2AC6", "supdot;": "\u2ABE", "supdsub;": "\u2AD8", "supe;": "\u2287", "supedot;": "\u2AC4", "suphsol;": "\u27C9", "suphsub;": "\u2AD7", "suplarr;": "\u297B", "supmult;": "\u2AC2", "supnE;": "\u2ACC", "supne;": "\u228B", "supplus;": "\u2AC0", "supset;": "\u2283", "supseteq;": "\u2287", "supseteqq;": "\u2AC6", "supsetneq;": "\u228B", "supsetneqq;": "\u2ACC", "supsim;": "\u2AC8", "supsub;": "\u2AD4", "supsup;": "\u2AD6", "swArr;": "\u21D9", "swarhk;": "\u2926", "swarr;": "\u2199", "swarrow;": "\u2199", "swnwar;": "\u292A", "szlig": "\xDF", "szlig;": "\xDF", "target;": "\u2316", "tau;": "\u03C4", "tbrk;": "\u23B4", "tcaron;": "\u0165", "tcedil;": "\u0163", "tcy;": "\u0442", "tdot;": "\u20DB", "telrec;": "\u2315", "tfr;": "\u{1D531}", "there4;": "\u2234", "therefore;": "\u2234", "theta;": "\u03B8", "thetasym;": "\u03D1", "thetav;": "\u03D1", "thickapprox;": "\u2248", "thicksim;": "\u223C", "thinsp;": "\u2009", "thkap;": "\u2248", "thksim;": "\u223C", "thorn": "\xFE", "thorn;": "\xFE", "tilde;": "\u02DC", "times": "\xD7", "times;": "\xD7", "timesb;": "\u22A0", "timesbar;": "\u2A31", "timesd;": "\u2A30", "tint;": "\u222D", "toea;": "\u2928", "top;": "\u22A4", "topbot;": "\u2336", "topcir;": "\u2AF1", "topf;": "\u{1D565}", "topfork;": "\u2ADA", "tosa;": "\u2929", "tprime;": "\u2034", "trade;": "\u2122", "triangle;": "\u25B5", "triangledown;": "\u25BF", "triangleleft;": "\u25C3", "trianglelefteq;": "\u22B4", "triangleq;": "\u225C", "triangleright;": "\u25B9", "trianglerighteq;": "\u22B5", "tridot;": "\u25EC", "trie;": "\u225C", "triminus;": "\u2A3A", "triplus;": "\u2A39", "trisb;": "\u29CD", "tritime;": "\u2A3B", "trpezium;": "\u23E2", "tscr;": "\u{1D4C9}", "tscy;": "\u0446", "tshcy;": "\u045B", "tstrok;": "\u0167", "twixt;": "\u226C", "twoheadleftarrow;": "\u219E", "twoheadrightarrow;": "\u21A0", "uArr;": "\u21D1", "uHar;": "\u2963", "uacute": "\xFA", "uacute;": "\xFA", "uarr;": "\u2191", "ubrcy;": "\u045E", "ubreve;": "\u016D", "ucirc": "\xFB", "ucirc;": "\xFB", "ucy;": "\u0443", "udarr;": "\u21C5", "udblac;": "\u0171", "udhar;": "\u296E", "ufisht;": "\u297E", "ufr;": "\u{1D532}", "ugrave": "\xF9", "ugrave;": "\xF9", "uharl;": "\u21BF", "uharr;": "\u21BE", "uhblk;": "\u2580", "ulcorn;": "\u231C", "ulcorner;": "\u231C", "ulcrop;": "\u230F", "ultri;": "\u25F8", "umacr;": "\u016B", "uml": "\xA8", "uml;": "\xA8", "uogon;": "\u0173", "uopf;": "\u{1D566}", "uparrow;": "\u2191", "updownarrow;": "\u2195", "upharpoonleft;": "\u21BF", "upharpoonright;": "\u21BE", "uplus;": "\u228E", "upsi;": "\u03C5", "upsih;": "\u03D2", "upsilon;": "\u03C5", "upuparrows;": "\u21C8", "urcorn;": "\u231D", "urcorner;": "\u231D", "urcrop;": "\u230E", "uring;": "\u016F", "urtri;": "\u25F9", "uscr;": "\u{1D4CA}", "utdot;": "\u22F0", "utilde;": "\u0169", "utri;": "\u25B5", "utrif;": "\u25B4", "uuarr;": "\u21C8", "uuml": "\xFC", "uuml;": "\xFC", "uwangle;": "\u29A7", "vArr;": "\u21D5", "vBar;": "\u2AE8", "vBarv;": "\u2AE9", "vDash;": "\u22A8", "vangrt;": "\u299C", "varepsilon;": "\u03F5", "varkappa;": "\u03F0", "varnothing;": "\u2205", "varphi;": "\u03D5", "varpi;": "\u03D6", "varpropto;": "\u221D", "varr;": "\u2195", "varrho;": "\u03F1", "varsigma;": "\u03C2", "varsubsetneq;": "\u228A\uFE00", "varsubsetneqq;": "\u2ACB\uFE00", "varsupsetneq;": "\u228B\uFE00", "varsupsetneqq;": "\u2ACC\uFE00", "vartheta;": "\u03D1", "vartriangleleft;": "\u22B2", "vartriangleright;": "\u22B3", "vcy;": "\u0432", "vdash;": "\u22A2", "vee;": "\u2228", "veebar;": "\u22BB", "veeeq;": "\u225A", "vellip;": "\u22EE", "verbar;": "|", "vert;": "|", "vfr;": "\u{1D533}", "vltri;": "\u22B2", "vnsub;": "\u2282\u20D2", "vnsup;": "\u2283\u20D2", "vopf;": "\u{1D567}", "vprop;": "\u221D", "vrtri;": "\u22B3", "vscr;": "\u{1D4CB}", "vsubnE;": "\u2ACB\uFE00", "vsubne;": "\u228A\uFE00", "vsupnE;": "\u2ACC\uFE00", "vsupne;": "\u228B\uFE00", "vzigzag;": "\u299A", "wcirc;": "\u0175", "wedbar;": "\u2A5F", "wedge;": "\u2227", "wedgeq;": "\u2259", "weierp;": "\u2118", "wfr;": "\u{1D534}", "wopf;": "\u{1D568}", "wp;": "\u2118", "wr;": "\u2240", "wreath;": "\u2240", "wscr;": "\u{1D4CC}", "xcap;": "\u22C2", "xcirc;": "\u25EF", "xcup;": "\u22C3", "xdtri;": "\u25BD", "xfr;": "\u{1D535}", "xhArr;": "\u27FA", "xharr;": "\u27F7", "xi;": "\u03BE", "xlArr;": "\u27F8", "xlarr;": "\u27F5", "xmap;": "\u27FC", "xnis;": "\u22FB", "xodot;": "\u2A00", "xopf;": "\u{1D569}", "xoplus;": "\u2A01", "xotime;": "\u2A02", "xrArr;": "\u27F9", "xrarr;": "\u27F6", "xscr;": "\u{1D4CD}", "xsqcup;": "\u2A06", "xuplus;": "\u2A04", "xutri;": "\u25B3", "xvee;": "\u22C1", "xwedge;": "\u22C0", "yacute": "\xFD", "yacute;": "\xFD", "yacy;": "\u044F", "ycirc;": "\u0177", "ycy;": "\u044B", "yen": "\xA5", "yen;": "\xA5", "yfr;": "\u{1D536}", "yicy;": "\u0457", "yopf;": "\u{1D56A}", "yscr;": "\u{1D4CE}", "yucy;": "\u044E", "yuml": "\xFF", "yuml;": "\xFF", "zacute;": "\u017A", "zcaron;": "\u017E", "zcy;": "\u0437", "zdot;": "\u017C", "zeetrf;": "\u2128", "zeta;": "\u03B6", "zfr;": "\u{1D537}", "zhcy;": "\u0436", "zigrarr;": "\u21DD", "zopf;": "\u{1D56B}", "zscr;": "\u{1D4CF}", "zwj;": "\u200D", "zwnj;": "\u200C" });
function extractRelationships(markdown, currentId, catalog) {
  const relationships = /* @__PURE__ */ new Map();
  for (const match of markdown.matchAll(/https?:\/\/[^\s>)]+/g)) {
    const url = match[0].replace(/[".,]+$/g, "");
    if (!URL.canParse(url)) continue;
    const parsedUrl = new URL(url);
    const service = catalog.find((candidate) => candidate.matches(parsedUrl));
    if (service === void 0) {
      continue;
    }
    const targetId = resourceId(parseSourceUrl(url, [service]));
    if (targetId !== currentId) {
      if (!relationships.has(targetId)) relationships.set(targetId, Object.freeze({ target_id: targetId, type: "references", data: Object.freeze({ url }) }));
    }
  }
  return Object.freeze([...relationships.values()]);
}

// packages/wire-core/src/runtime/cookies.ts
function frozenCookie(cookie) {
  return Object.freeze(cookie);
}
function cookieDomain(value, domain) {
  return "domain" in value ? value["domain"].toString() : domain;
}
function cookiePath(value) {
  return "path" in value ? value["path"].toString() : "/";
}
function cookieExpires(value) {
  if ("expires" in value) return Number(value["expires"]);
  if ("expirationDate" in value) return Number(value["expirationDate"]);
  return 0;
}
function cookieHttpOnly(value) {
  return "httpOnly" in value ? value["httpOnly"] === true : false;
}
function cookieSecure(value) {
  return "secure" in value ? value["secure"] === true : true;
}
function cookieIncludeSubdomains(value, domain) {
  if ("includeSubdomains" in value) return value["includeSubdomains"] === true;
  if ("hostOnly" in value) return value["hostOnly"] !== true;
  return domain.startsWith(".");
}
function parseNetscapeCookies(contents) {
  return Object.freeze(contents.split(/\r?\n/).filter((line) => line.trim() !== "" && (!line.startsWith("#") || line.startsWith("#HttpOnly_"))).map((line) => {
    const httpOnly = line.startsWith("#HttpOnly_");
    const fields = (httpOnly ? line.slice("#HttpOnly_".length) : line).split("	");
    return frozenCookie({
      domain: fields[0],
      includeSubdomains: fields[1] === "TRUE",
      path: fields[2],
      secure: fields[3] === "TRUE",
      expires: Number(fields[4]),
      name: fields[5],
      value: fields.slice(6).join("	"),
      httpOnly
    });
  }));
}
function detectCookieFormat(contents) {
  const trimmed = contents.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  const netscapeLine = contents.split(/\r?\n/).find((line) => {
    if (line.trim() === "") return false;
    if (line.startsWith("#") && !line.startsWith("#HttpOnly_")) return false;
    const value = line.startsWith("#HttpOnly_") ? line.slice("#HttpOnly_".length) : line;
    return value.split("	").length >= 7;
  });
  return netscapeLine === void 0 ? "header" : "netscape";
}
function headerCookieText(contents) {
  const curlHeader = contents.match(/(?:-H|--header)\s+(['"])Cookie:\s*([\s\S]*?)\1/);
  if (curlHeader !== null) return curlHeader[2];
  const headerLine = contents.split(/\r?\n/).find((line) => line.toLowerCase().startsWith("cookie:"));
  return headerLine === void 0 ? contents.trim() : headerLine.slice(headerLine.indexOf(":") + 1).trim();
}
function parseCookieHeader(contents, domain) {
  return Object.freeze(headerCookieText(contents).split(";").map((pair) => pair.trim()).filter((pair) => pair !== "").map((pair) => {
    const index = pair.indexOf("=");
    if (index < 1) throw new Error(pair);
    return frozenCookie({
      domain,
      includeSubdomains: domain.startsWith("."),
      path: "/",
      secure: true,
      expires: 0,
      name: pair.slice(0, index),
      value: pair.slice(index + 1),
      httpOnly: false
    });
  }));
}
function jsonCookie(value, domain) {
  const cookie = value;
  const resolvedDomain = cookieDomain(cookie, domain);
  return frozenCookie({
    domain: resolvedDomain,
    includeSubdomains: cookieIncludeSubdomains(cookie, resolvedDomain),
    path: cookiePath(cookie),
    secure: cookieSecure(cookie),
    expires: cookieExpires(cookie),
    name: cookie["name"].toString(),
    value: cookie["value"].toString(),
    httpOnly: cookieHttpOnly(cookie)
  });
}
function parseJsonCookies(contents, domain) {
  const value = JSON.parse(contents);
  if (Array.isArray(value)) return Object.freeze(value.map((cookie) => jsonCookie(cookie, domain)));
  const object4 = value;
  if (Array.isArray(object4["cookies"])) return Object.freeze(object4["cookies"].map((cookie) => jsonCookie(cookie, domain)));
  if ("name" in object4 && "value" in object4) return Object.freeze([jsonCookie(object4, domain)]);
  return Object.freeze(Object.entries(object4).map(([name, cookieValue]) => frozenCookie({
    domain,
    includeSubdomains: domain.startsWith("."),
    path: "/",
    secure: true,
    expires: 0,
    name,
    value: cookieValue.toString(),
    httpOnly: false
  })));
}
function parsePastedCookies(contents, domain) {
  const format = detectCookieFormat(contents);
  if (format === "netscape") return parseNetscapeCookies(contents);
  if (format === "json") return parseJsonCookies(contents, domain);
  return parseCookieHeader(contents, domain);
}
function parseCookieMetadata(contents) {
  return Object.freeze(Object.fromEntries(contents.split(/\r?\n/).filter((line) => line.startsWith("# wire	")).map((line) => {
    const fields = line.split("	");
    return [fields[1], fields.slice(2).join("	")];
  })));
}
function parsePastedCookieMetadata(contents) {
  const format = detectCookieFormat(contents);
  if (format === "netscape") return parseCookieMetadata(contents);
  if (format === "header") return Object.freeze({});
  const value = JSON.parse(contents);
  if (!("metadata" in value)) return Object.freeze({});
  return Object.freeze(Object.fromEntries(Object.entries(value["metadata"]).map(([name, metadataValue]) => [name, metadataValue.toString()])));
}
function cookiesDirectory(home) {
  return `${home}/.wire/auth`;
}
function cookiesFile(home, service) {
  return `${cookiesDirectory(home)}/${service}_cookies.txt`;
}
function repositoryCookiesFile(repositoryRoot2, service) {
  return `${repositoryRoot2}/${service}_cookies.txt`;
}
async function existingCookiesFile(filesystem, paths) {
  for (const path of paths) if (await filesystem.exists(path)) return path;
  return null;
}
function serializeNetscapeCookies(cookies, metadata) {
  return `${["# Netscape HTTP Cookie File", ...Object.entries(metadata).map(([name, value]) => `# wire	${name}	${value}`), ...cookies.map((cookie) => `${cookie.httpOnly ? "#HttpOnly_" : ""}${cookie.domain}	${cookie.includeSubdomains ? "TRUE" : "FALSE"}	${cookie.path}	${cookie.secure ? "TRUE" : "FALSE"}	${cookie.expires}	${cookie.name}	${cookie.value}`)].join("\n")}
`;
}
function createCookiesCapability(filesystem, home, repositoryRoot2, overrideFile) {
  const paths = (service) => {
    const overridePath = overrideFile?.(service);
    const repositoryRootPath = repositoryRoot2?.();
    return [
      ...overridePath === void 0 ? [] : [overridePath],
      ...repositoryRootPath === void 0 ? [] : [repositoryCookiesFile(repositoryRootPath, service)],
      cookiesFile(home(), service)
    ];
  };
  return Object.freeze({
    loadSaved: async (service) => {
      const path = await existingCookiesFile(filesystem, paths(service));
      return path === null ? null : parseNetscapeCookies(await filesystem.readText(path));
    },
    load: async (service) => {
      const path = await existingCookiesFile(filesystem, paths(service));
      if (path !== null) return parseNetscapeCookies(await filesystem.readText(path));
      throw new Error(`${service} cookie authentication is missing. Run \`wire ${service} login\` once; other commands reuse saved cookies.`);
    },
    metadata: async (service) => {
      const path = await existingCookiesFile(filesystem, paths(service));
      if (path === null) throw new Error(`${service} cookie authentication is missing. Run \`wire ${service} login\` once; other commands reuse saved cookies.`);
      return parseCookieMetadata(await filesystem.readText(path));
    },
    save: async (service, cookies, metadata) => {
      const candidatePaths = paths(service);
      const contents = serializeNetscapeCookies(cookies, metadata);
      const existingPaths = [];
      for (const path of candidatePaths) if (await filesystem.exists(path)) existingPaths.push(path);
      for (const path of existingPaths.length === 0 ? [candidatePaths[0]] : existingPaths) await filesystem.writeText(path, contents);
    },
    delete: async (service) => {
      for (const path of paths(service)) if (await filesystem.exists(path)) await filesystem.delete(path);
    }
  });
}

// packages/wire-core/src/runtime/chrome.ts
var import_node_child_process = require("node:child_process");
var import_node_process = require("node:process");
var import_promises = require("node:readline/promises");
var import_promises2 = require("node:fs/promises");
function environmentValue(environment2, name) {
  const value = environment2[name];
  if (value === void 0) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
function chromeUserDataDir(environment2) {
  return `${environmentValue(environment2, "HOME")}/Library/Application Support/Wire/Chrome`;
}
async function chromeLaunchArguments(environment2, startUrl) {
  const userDataDir = chromeUserDataDir(environment2);
  return Object.freeze([
    `--user-data-dir=${userDataDir}`,
    "--remote-debugging-port=0",
    "--no-first-run",
    "--no-default-browser-check",
    "--restore-last-session",
    startUrl
  ]);
}
var ChromeConnection = class {
  socket;
  pending = /* @__PURE__ */ new Map();
  events = /* @__PURE__ */ new Map();
  nextId = 1;
  closed = false;
  constructor(url) {
    this.socket = new WebSocket(url);
    const rejectPending = () => {
      this.closed = true;
      const error = new Error("Chrome window closed before login completed");
      for (const request2 of this.pending.values()) request2.reject(error);
      this.pending.clear();
      for (const events of this.events.values()) for (const event of events) event.reject(error);
      this.events.clear();
    };
    this.socket.addEventListener("close", rejectPending, { once: true });
    this.socket.addEventListener("error", rejectPending, { once: true });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data.toString());
      if (message.id === void 0) {
        if (message.method !== void 0) {
          const events = this.events.get(message.method);
          if (events !== void 0) {
            const pending2 = events.shift();
            if (events.length === 0) this.events.delete(message.method);
            pending2.resolve(message.params);
          }
        }
        return;
      }
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error === void 0) pending.resolve(message.result);
      else pending.reject(new Error(JSON.stringify(message.error)));
    });
  }
  opened() {
    return new Promise((resolve4, reject) => {
      this.socket.addEventListener("open", () => resolve4(), { once: true });
      this.socket.addEventListener("error", (event) => reject(event), { once: true });
    });
  }
  request(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve4, reject) => {
      if (this.closed) {
        reject(new Error("Chrome window closed before login completed"));
        return;
      }
      this.pending.set(id, { resolve: resolve4, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  event(method) {
    return new Promise((resolve4, reject) => {
      if (this.closed) {
        reject(new Error("Chrome window closed before login completed"));
        return;
      }
      const events = this.events.get(method) ?? [];
      events.push({ resolve: resolve4, reject });
      this.events.set(method, events);
    });
  }
  close() {
    this.socket.close();
  }
};
function devtoolsUrl(stderr2) {
  return new Promise((resolve4, reject) => {
    let contents = "";
    stderr2.setEncoding("utf8");
    stderr2.on("data", (chunk) => {
      contents += chunk;
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(contents);
      if (match !== null) resolve4(match[1]);
    });
    stderr2.on("end", () => reject(new Error(contents)));
  });
}
async function closeChrome(chrome, connection, pageConnection) {
  const closed = new Promise((resolve4) => chrome.once("exit", resolve4));
  if (pageConnection !== void 0) pageConnection.close();
  connection.close();
  process.kill(-chrome.pid, "SIGTERM");
  await closed;
}
async function pageDevtoolsUrl(browserUrl, domains) {
  const endpoint = new URL(browserUrl);
  endpoint.protocol = "http:";
  endpoint.pathname = "/json/list";
  endpoint.search = "";
  endpoint.hash = "";
  const targets = await (await fetch(endpoint)).json();
  return targets.find((target) => target.type === "page" && domains.some((domain) => new URL(target.url).hostname === domain || new URL(target.url).hostname.endsWith(`.${domain}`))).webSocketDebuggerUrl;
}
async function chatgptBrowserMetadata(pageConnection) {
  const evaluation = await pageConnection.request("Runtime.evaluate", {
    expression: `new Promise((resolve) => {
      (async () => {
        if (location.hostname !== "chatgpt.com") {
          resolve({ ok: false });
          return;
        }
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const text = await response.text();
        if (!text.startsWith("{")) {
          resolve({ ok: false });
          return;
        }
        const session = JSON.parse(text);
        if (!("account" in session) || !("id" in session.account) || !("accessToken" in session) || "error" in session) {
          resolve({ ok: false });
          return;
        }
        const backend = await fetch("/backend-api/conversations?offset=0&limit=1&order=updated&is_archived=false&is_starred=false", {
          cache: "no-store",
          headers: {
            authorization: \`Bearer \${session.accessToken}\`,
            "chatgpt-account-id": session.account.id
          }
        });
        resolve({ ok: backend.ok, account_id: session.account.id });
      })().catch(() => resolve({ ok: false }));
    })`,
    awaitPromise: true,
    returnByValue: true
  });
  const value = evaluation.result.value;
  if (value.ok !== true) return null;
  return Object.freeze({ account_id: value.account_id });
}
async function chatgptChallengeUrl(pageConnection) {
  const evaluation = await pageConnection.request("Runtime.evaluate", {
    expression: `(() => ({ href: location.href, title: document.title, text: document.body.innerText }))()`,
    returnByValue: true
  });
  const value = evaluation.result.value;
  const pageText = `${value.href}
${value.title}
${value.text}`;
  if (/cdn-cgi\/challenge-platform|cf_chl|Just a moment|Verify you are human|Cloudflare/i.test(pageText)) return value.href;
  return null;
}
function chromeCookies(values2, domains) {
  return Object.freeze(values2.filter((cookie) => domains.some((domain) => cookie.domain === domain || cookie.domain.endsWith(`.${domain}`))).map((cookie) => Object.freeze({
    domain: cookie.domain,
    includeSubdomains: cookie.domain.startsWith("."),
    path: cookie.path,
    secure: cookie.secure,
    expires: cookie.expires < 0 ? 0 : Math.floor(cookie.expires),
    name: cookie.name,
    value: cookie.value,
    httpOnly: cookie.httpOnly
  })));
}
async function confirmSaveLogin() {
  const terminal = (0, import_promises.createInterface)({ input: import_node_process.stdin, output: import_node_process.stderr });
  const answer = await terminal.question("\nDo you want to save login? [y/N] ");
  terminal.close();
  return /^(y|yes)$/i.test(answer.trim());
}
function sleep(milliseconds) {
  return new Promise((resolve4) => setTimeout(resolve4, milliseconds));
}
async function extractChromeCookies(environment2, extraction) {
  const profile = chromeUserDataDir(environment2);
  await (0, import_promises2.mkdir)(profile, { recursive: true });
  const chrome = (0, import_node_child_process.spawn)("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [...await chromeLaunchArguments(environment2, extraction.startUrl)], { detached: true, stdio: ["ignore", "ignore", "pipe"] });
  let interrupted = false;
  let interrupting = false;
  let interruptResult;
  let interruptResolve = () => {
  };
  const interruptPromise = new Promise((resolve4) => {
    interruptResolve = resolve4;
  });
  let captureCookies;
  const captureInterrupt = async () => {
    if (!interrupted || interrupting || interruptResult !== void 0 || captureCookies === void 0) return;
    interrupting = true;
    const result = await captureCookies();
    const save = await confirmSaveLogin();
    interruptResult = save ? Object.freeze({ cookies: result.cookies, metadata: result.metadata, manual: true }) : null;
    interruptResolve();
  };
  const interrupt = () => {
    interrupted = true;
    void captureInterrupt();
  };
  process.on("SIGINT", interrupt);
  const browserUrl = await devtoolsUrl(chrome.stderr);
  const connection = new ChromeConnection(browserUrl);
  await connection.opened();
  const pageConnection = extraction.metadataExpression === void 0 && extraction.service !== "chatgpt" ? void 0 : new ChromeConnection(await pageDevtoolsUrl(browserUrl, extraction.domains));
  if (pageConnection !== void 0) await pageConnection.opened();
  if (pageConnection !== void 0) await Promise.race([sleep(2e3), interruptPromise]);
  const currentResult = async () => {
    const result = await connection.request("Storage.getCookies");
    const cookies = chromeCookies(result.cookies, extraction.domains);
    let metadata = Object.freeze({});
    if (extraction.metadataExpression !== void 0 && pageConnection !== void 0) {
      const evaluation = await pageConnection.request("Runtime.evaluate", { expression: extraction.metadataExpression, returnByValue: true });
      if (evaluation.result.value !== void 0) metadata = Object.freeze(evaluation.result.value);
    }
    return Object.freeze({ cookies, metadata });
  };
  captureCookies = currentResult;
  await captureInterrupt();
  const interruptedResult = async () => {
    if (interruptResult === void 0) return void 0;
    await closeChrome(chrome, connection, pageConnection);
    process.off("SIGINT", interrupt);
    if (interruptResult === null) throw new Error("Login not saved");
    return interruptResult;
  };
  for (; ; ) {
    if (extraction.service === "chatgpt") {
      const challengeUrl = await chatgptChallengeUrl(pageConnection);
      const manualResult2 = await interruptedResult();
      if (manualResult2 !== void 0) return manualResult2;
      if (challengeUrl !== null) {
        await closeChrome(chrome, connection, pageConnection);
        process.off("SIGINT", interrupt);
        throw new Error(`ChatGPT login is stuck on an HTML challenge: ${challengeUrl}`);
      }
    }
    const result = await currentResult();
    const manualResult = await interruptedResult();
    if (manualResult !== void 0) return manualResult;
    if (extraction.ready(result.cookies)) {
      let metadata = result.metadata;
      if (extraction.service === "chatgpt") {
        const chatgptMetadata = await Promise.race([chatgptBrowserMetadata(pageConnection), interruptPromise.then(() => void 0)]);
        const interruptedChatgptResult = await interruptedResult();
        if (interruptedChatgptResult !== void 0) return interruptedChatgptResult;
        if (chatgptMetadata === void 0) continue;
        if (chatgptMetadata === null) {
          await closeChrome(chrome, connection, pageConnection);
          process.off("SIGINT", interrupt);
          throw new Error("ChatGPT login is blocked by an HTML challenge. Complete `wire chatgpt login` in the opened Chrome window, then retry.");
        }
        metadata = chatgptMetadata;
      } else if (extraction.metadataExpression !== void 0) {
        if (Object.keys(metadata).length === 0) {
          await Promise.race([sleep(1e3), interruptPromise]);
          const interruptedMetadataResult = await interruptedResult();
          if (interruptedMetadataResult !== void 0) return interruptedMetadataResult;
          continue;
        }
      }
      if (extraction.service !== "chatgpt" && !await Promise.race([extraction.verify(result.cookies, metadata), interruptPromise.then(() => false)])) {
        const interruptedVerifyResult = await interruptedResult();
        if (interruptedVerifyResult !== void 0) return interruptedVerifyResult;
        await Promise.race([sleep(1e3), interruptPromise]);
        const interruptedSleepResult2 = await interruptedResult();
        if (interruptedSleepResult2 !== void 0) return interruptedSleepResult2;
        continue;
      }
      await closeChrome(chrome, connection, pageConnection);
      process.off("SIGINT", interrupt);
      return Object.freeze({ cookies: result.cookies, metadata });
    }
    await Promise.race([sleep(1e3), interruptPromise]);
    const interruptedSleepResult = await interruptedResult();
    if (interruptedSleepResult !== void 0) return interruptedSleepResult;
  }
}

// packages/wire-core/src/runtime/google.ts
function parseGoogleCredentials(contents) {
  const document = JSON.parse(contents);
  return Object.freeze(document.installed);
}
function parseGoogleToken(contents) {
  return Object.freeze(JSON.parse(contents));
}
function googleTokenExpired(token, now) {
  return token.expiry === void 0 || new Date(token.expiry).getTime() <= now.getTime();
}
function mergeGoogleRefresh(token, refresh, now) {
  const updated = {
    ...token,
    token: refresh.access_token,
    expiry: new Date(now.getTime() + refresh.expires_in * 1e3).toISOString()
  };
  if (refresh.refresh_token !== void 0) updated.refresh_token = refresh.refresh_token;
  if (refresh.token_type !== void 0) updated.token_type = refresh.token_type;
  if (refresh.scope !== void 0) updated.scopes = refresh.scope === "" ? [] : refresh.scope.split(/\s+/);
  if (refresh.id_token !== void 0) updated.id_token = refresh.id_token;
  return Object.freeze(updated);
}
function createGoogleTokensCapability(filesystem, http, clock, credentialsPath, tokenPath) {
  const refresh = async () => {
    const token = parseGoogleToken(await filesystem.readText(tokenPath));
    const credentials = parseGoogleCredentials(await filesystem.readText(credentialsPath));
    const body2 = new URLSearchParams({
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token"
    });
    const response = await http.request(credentials.token_uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body2
    });
    const bodyJson = await response.json();
    if (!response.ok) {
      const error = bodyJson;
      throw new Error(`Google OAuth refresh failed: HTTP ${response.status} ${error.error}${error.error_description === void 0 ? "" : `: ${error.error_description}`}`);
    }
    const refreshed = mergeGoogleRefresh(token, bodyJson, clock.now());
    await filesystem.writeText(tokenPath, JSON.stringify(refreshed));
    return refreshed;
  };
  return Object.freeze({
    load: async () => {
      const token = parseGoogleToken(await filesystem.readText(tokenPath));
      if (!googleTokenExpired(token, clock.now())) return token;
      return refresh();
    },
    refresh
  });
}

// packages/wire-core/src/storage/registry.ts
var import_node_crypto = require("node:crypto");
var import_node_fs = require("node:fs");
var import_promises3 = require("node:fs/promises");
var import_node_module = require("node:module");
var import_node_path = require("node:path");
var require2 = (0, import_node_module.createRequire)("/wire-core/storage/registry.js");
function compareStrings3(left, right) {
  const leftCodePoints = Array.from(left, (character) => character.codePointAt(0));
  const rightCodePoints = Array.from(right, (character) => character.codePointAt(0));
  const length = Math.min(leftCodePoints.length, rightCodePoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftCodePoints[index] - rightCodePoints[index];
    if (difference !== 0) return difference;
  }
  return leftCodePoints.length - rightCodePoints.length;
}
function storageResource(resource) {
  return normalizeResource({
    ...resource,
    filesystem_links: resource.filesystem_links.map((link) => ({ ...link, path: link.path.replaceAll(import_node_path.sep, "/") }))
  });
}
function fileResourceName(resourceId2) {
  if (resourceId2 !== "." && resourceId2 !== ".." && !resourceId2.includes("/") && !resourceId2.includes("\\") && !resourceId2.includes("\0")) return `${resourceId2}.json`;
  return `~${Buffer.from(resourceId2).toString("base64url")}.json`;
}
function parseResource(value) {
  return JSON.parse(value);
}
function assertUnique(values2) {
  if (new Set(values2).size !== values2.length) throw new Error(JSON.stringify(values2));
}
function assertUniqueFileResource(resource) {
  assertUnique(resource.identifiers.map((identifier) => JSON.stringify([identifier.service, identifier.identifier])));
  assertUnique(resource.urls);
  assertUnique(resource.filesystem_links.map((link) => JSON.stringify([link.path, link.role])));
  assertUnique(resource.data.map((item) => JSON.stringify([item.namespace, item.key])));
  assertUnique(resource.relationships.map((relationship) => JSON.stringify([resource.id, relationship.target_id, relationship.type])));
}
function missingResource(resourceId2) {
  return new Error(`Resource not found: ${resourceId2}`);
}
function missingIdentifier(service, identifier) {
  return new Error(`Resource identifier not found: ${service}/${identifier}`);
}
function missingUrl(url) {
  return new Error(`Resource URL not found: ${url}`);
}
var SqliteRegistry = class {
  path;
  constructor(path) {
    this.path = realpathSyncParent(path);
    const database = this.connect();
    database.exec(`
      PRAGMA journal_mode=DELETE;
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS resource_identifiers (
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        service TEXT NOT NULL,
        identifier TEXT NOT NULL,
        PRIMARY KEY (service, identifier),
        UNIQUE (resource_id, service, identifier)
      );
      CREATE TABLE IF NOT EXISTS resource_urls (
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        url TEXT NOT NULL PRIMARY KEY,
        UNIQUE (resource_id, url)
      );
      CREATE TABLE IF NOT EXISTS filesystem_links (
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        role TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (resource_id, path, role)
      );
      CREATE INDEX IF NOT EXISTS filesystem_links_path ON filesystem_links(path);
      CREATE TABLE IF NOT EXISTS resource_data (
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        PRIMARY KEY (resource_id, namespace, key)
      );
      CREATE TABLE IF NOT EXISTS resource_relationships (
        source_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL,
        type TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (source_id, target_id, type)
      );
      CREATE INDEX IF NOT EXISTS resource_relationships_target ON resource_relationships(target_id);
    `);
    database.close();
  }
  async put(resource) {
    const normalized = storageResource(resource);
    assertUniqueFileResource(normalized);
    const database = this.connect();
    for (const identifier of normalized.identifiers) {
      const row = database.prepare("SELECT resource_id FROM resource_identifiers WHERE service = ? AND identifier = ? AND resource_id != ?").get(identifier.service, identifier.identifier, normalized.id);
      if (row !== void 0) {
        database.close();
        throw new Error(`${identifier.service}/${identifier.identifier}`);
      }
    }
    for (const url of normalized.urls) {
      const row = database.prepare("SELECT resource_id FROM resource_urls WHERE url = ? AND resource_id != ?").get(url, normalized.id);
      if (row !== void 0) {
        database.close();
        throw new Error(url);
      }
    }
    database.exec("BEGIN");
    database.prepare("INSERT INTO resources (id, type) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET type=excluded.type").run(normalized.id, normalized.type);
    database.prepare("DELETE FROM resource_identifiers WHERE resource_id = ?").run(normalized.id);
    database.prepare("DELETE FROM resource_urls WHERE resource_id = ?").run(normalized.id);
    database.prepare("DELETE FROM filesystem_links WHERE resource_id = ?").run(normalized.id);
    database.prepare("DELETE FROM resource_data WHERE resource_id = ?").run(normalized.id);
    database.prepare("DELETE FROM resource_relationships WHERE source_id = ?").run(normalized.id);
    const insertIdentifier = database.prepare("INSERT INTO resource_identifiers (resource_id, service, identifier) VALUES (?, ?, ?)");
    for (const item of normalized.identifiers) insertIdentifier.run(normalized.id, item.service, item.identifier);
    const insertUrl = database.prepare("INSERT INTO resource_urls (resource_id, url) VALUES (?, ?)");
    for (const url of normalized.urls) insertUrl.run(normalized.id, url);
    const insertLink = database.prepare("INSERT INTO filesystem_links (resource_id, path, role, data_json) VALUES (?, ?, ?, ?)");
    for (const link of normalized.filesystem_links) insertLink.run(normalized.id, link.path, link.role, stableJsonCompact(link.data));
    const insertData = database.prepare("INSERT INTO resource_data (resource_id, namespace, key, value_json) VALUES (?, ?, ?, ?)");
    for (const item of normalized.data) insertData.run(normalized.id, item.namespace, item.key, stableJsonCompact(item.value));
    const insertRelationship = database.prepare("INSERT INTO resource_relationships (source_id, target_id, type, data_json) VALUES (?, ?, ?, ?)");
    for (const relationship of normalized.relationships) insertRelationship.run(normalized.id, relationship.target_id, relationship.type, stableJsonCompact(relationship.data));
    database.exec("COMMIT");
    database.close();
    return normalized;
  }
  async get(resourceId2) {
    const database = this.connect();
    const row = database.prepare("SELECT id FROM resources WHERE id = ?").get(resourceId2);
    if (row === void 0) {
      database.close();
      throw missingResource(resourceId2);
    }
    database.exec("BEGIN");
    const resource = this.getResource(database, resourceId2);
    database.exec("COMMIT");
    database.close();
    return resource;
  }
  async findByIdentifier(service, identifier) {
    const database = this.connect();
    database.exec("BEGIN");
    const row = database.prepare("SELECT resource_id FROM resource_identifiers WHERE service = ? AND identifier = ?").get(service, identifier);
    if (row === void 0) {
      database.close();
      throw missingIdentifier(service, identifier);
    }
    const resource = this.getResource(database, row.resource_id);
    database.exec("COMMIT");
    database.close();
    return resource;
  }
  async findByUrl(url) {
    const database = this.connect();
    database.exec("BEGIN");
    const row = database.prepare("SELECT resource_id FROM resource_urls WHERE url = ?").get(url);
    if (row === void 0) {
      database.close();
      throw missingUrl(url);
    }
    const resource = this.getResource(database, row.resource_id);
    database.exec("COMMIT");
    database.close();
    return resource;
  }
  async findByPath(path) {
    const database = this.connect();
    database.exec("BEGIN");
    const rows = database.prepare("SELECT DISTINCT resource_id FROM filesystem_links WHERE path = ? ORDER BY resource_id").all(path.replaceAll(import_node_path.sep, "/"));
    const resources = rows.map((row) => this.getResource(database, row.resource_id));
    database.exec("COMMIT");
    database.close();
    return resources;
  }
  async listResources() {
    const database = this.connect();
    database.exec("BEGIN");
    const rows = database.prepare("SELECT id FROM resources ORDER BY id").all();
    const resources = rows.map((row) => this.getResource(database, row.id));
    database.exec("COMMIT");
    database.close();
    return resources;
  }
  async delete(resourceId2) {
    const database = this.connect();
    database.prepare("DELETE FROM resources WHERE id = ?").run(resourceId2);
    database.close();
  }
  getResource(database, resourceId2) {
    const row = database.prepare("SELECT id, type FROM resources WHERE id = ?").get(resourceId2);
    if (row === void 0) throw missingResource(resourceId2);
    const identifiers = database.prepare("SELECT service, identifier FROM resource_identifiers WHERE resource_id = ? ORDER BY service, identifier").all(resourceId2);
    const urls = database.prepare("SELECT url FROM resource_urls WHERE resource_id = ? ORDER BY url").all(resourceId2);
    const links = database.prepare("SELECT path, role, data_json FROM filesystem_links WHERE resource_id = ? ORDER BY path, role").all(resourceId2);
    const data = database.prepare("SELECT namespace, key, value_json FROM resource_data WHERE resource_id = ? ORDER BY namespace, key").all(resourceId2);
    const relationships = database.prepare("SELECT target_id, type, data_json FROM resource_relationships WHERE source_id = ? ORDER BY type, target_id").all(resourceId2);
    return {
      id: row.id,
      type: row.type,
      identifiers: identifiers.map((identifier) => ({ service: identifier.service, identifier: identifier.identifier })),
      urls: urls.map((item) => item.url),
      filesystem_links: links.map((link) => ({ path: link.path, role: link.role, data: JSON.parse(link.data_json) })),
      data: data.map((item) => ({ namespace: item.namespace, key: item.key, value: JSON.parse(item.value_json) })),
      relationships: relationships.map((relationship) => ({ target_id: relationship.target_id, type: relationship.type, data: JSON.parse(relationship.data_json) }))
    };
  }
  connect() {
    const database = new (require2("node:sqlite")).DatabaseSync(this.path);
    database.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
    return database;
  }
};
var FileRegistry = class {
  path;
  constructor(path) {
    this.path = realpathSyncDirectory(path);
  }
  async put(resource) {
    const normalized = storageResource(resource);
    assertUniqueFileResource(normalized);
    const existingResources = (await this.listResources()).filter((existing) => existing.id !== normalized.id);
    const existingUrls = new Set(existingResources.flatMap((existing) => existing.urls));
    for (const identifier of normalized.identifiers) {
      if (existingResources.some((existing) => existing.identifiers.some((item) => item.service === identifier.service && item.identifier === identifier.identifier))) {
        throw new Error(`${identifier.service}/${identifier.identifier}`);
      }
    }
    for (const url of normalized.urls) {
      if (existingUrls.has(url)) throw new Error(url);
    }
    const tempPath = (0, import_node_path.join)(this.path, (0, import_node_crypto.randomUUID)());
    const handle = await (0, import_promises3.open)(tempPath, "wx", 384);
    await handle.writeFile(`${stableJsonPretty(normalized)}
`, "utf8");
    await handle.close();
    await (0, import_promises3.rename)(tempPath, this.resourcePath(normalized.id));
    return normalized;
  }
  async get(resourceId2) {
    if (!(0, import_node_fs.existsSync)(this.resourcePath(resourceId2))) throw missingResource(resourceId2);
    return parseResource(await (0, import_promises3.readFile)(this.resourcePath(resourceId2), "utf8"));
  }
  async findByIdentifier(service, identifier) {
    const resource = (await this.listResources()).find((item) => item.identifiers.some((value) => value.service === service && value.identifier === identifier));
    if (resource === void 0) throw missingIdentifier(service, identifier);
    return this.get(resource.id);
  }
  async findByUrl(url) {
    const resource = (await this.listResources()).find((item) => item.urls.includes(url));
    if (resource === void 0) throw missingUrl(url);
    return this.get(resource.id);
  }
  async findByPath(path) {
    const normalizedPath = path.replaceAll(import_node_path.sep, "/");
    return (await this.listResources()).filter((resource) => resource.filesystem_links.some((link) => link.path === normalizedPath));
  }
  async listResources() {
    const filenames = (await (0, import_promises3.readdir)(this.path)).filter((filename) => (0, import_node_path.extname)(filename) === ".json").sort(compareStrings3);
    const resources = await Promise.all(filenames.map(async (filename) => parseResource(await (0, import_promises3.readFile)((0, import_node_path.join)(this.path, filename), "utf8"))));
    return resources.sort((left, right) => compareStrings3(left.id, right.id));
  }
  async delete(resourceId2) {
    await (0, import_promises3.unlink)(this.resourcePath(resourceId2));
  }
  resourcePath(resourceId2) {
    return (0, import_node_path.join)(this.path, fileResourceName(resourceId2));
  }
};
function realpathSyncParent(path) {
  if ((0, import_node_fs.existsSync)(path)) return (0, import_node_fs.realpathSync)(path);
  const parent = (0, import_node_path.dirname)(path);
  (0, import_node_fs.mkdirSync)(parent, { recursive: true });
  return (0, import_node_path.join)((0, import_node_fs.realpathSync)(parent), (0, import_node_path.basename)(path));
}
function realpathSyncDirectory(path) {
  (0, import_node_fs.mkdirSync)(path, { recursive: true });
  return (0, import_node_fs.realpathSync)(path);
}

// packages/wire-core/src/storage/workspace.ts
var import_node_fs2 = require("node:fs");
var import_promises4 = require("node:fs/promises");
var import_node_path2 = require("node:path");
var defaultWireBackend = "files";
var defaultWireRegistryPath = "records";
function canonicalPath(path) {
  const resolved = (0, import_node_path2.resolve)(path);
  if ((0, import_node_fs2.existsSync)(resolved)) return (0, import_node_fs2.realpathSync)(resolved);
  return (0, import_node_path2.join)(canonicalPath((0, import_node_path2.dirname)(resolved)), (0, import_node_path2.basename)(resolved));
}
async function discoverWireRoot(path, home) {
  const homePath = canonicalPath(home);
  let currentPath = canonicalPath(path);
  if (!(0, import_node_fs2.existsSync)(currentPath) || !(0, import_node_fs2.statSync)(currentPath).isDirectory()) currentPath = (0, import_node_path2.dirname)(currentPath);
  while (true) {
    const wirePath = (0, import_node_path2.join)(currentPath, ".wire");
    if ((0, import_node_fs2.existsSync)(wirePath) && (0, import_node_fs2.statSync)(wirePath).isDirectory()) return wirePath;
    const parentPath = (0, import_node_path2.dirname)(currentPath);
    if (parentPath === currentPath) return (0, import_node_path2.join)(homePath, ".wire");
    currentPath = parentPath;
  }
}
async function configuredWireRoot(path, home) {
  const wireRoot2 = await discoverWireRoot(path, home);
  const configPath = (0, import_node_path2.join)(wireRoot2, "config.json");
  return (0, import_node_fs2.existsSync)(configPath) && (0, import_node_fs2.statSync)(configPath).isFile() ? wireRoot2 : null;
}
function wireRelativePath(path, wireRoot2) {
  return (0, import_node_path2.relative)((0, import_node_path2.dirname)(canonicalPath(wireRoot2)), canonicalPath(path)).replaceAll(import_node_path2.sep, "/");
}
async function loadWireConfig(wireRoot2) {
  return JSON.parse(await (0, import_promises4.readFile)((0, import_node_path2.join)(wireRoot2, "config.json"), "utf8"));
}
async function openWireRegistry(path, home) {
  const wireRoot2 = await discoverWireRoot(path, home);
  const config = await loadWireConfig(wireRoot2);
  const registryPath = (0, import_node_path2.join)(wireRoot2, config.path);
  if (config.backend === "sqlite") return new SqliteRegistry(registryPath);
  if (config.backend === "files") return new FileRegistry(registryPath);
  throw new Error(config.backend);
}
async function initializeWire(path, backend, registryPath) {
  const wireRoot2 = (0, import_node_path2.join)(canonicalPath(path), ".wire");
  await (0, import_promises4.mkdir)(wireRoot2, { recursive: true });
  const configPath = (0, import_node_path2.join)(wireRoot2, "config.json");
  if ((0, import_node_fs2.existsSync)(configPath) && (0, import_node_fs2.statSync)(configPath).isFile()) {
    const existing = await loadWireConfig(wireRoot2);
    if (existing.backend !== backend || existing.path !== registryPath) throw new Error(`Wire workspace already initialized with ${existing.backend} registry at ${existing.path}. Existing registries are not overwritten.`);
    return { root: wireRoot2, backend: existing.backend, path: (0, import_node_path2.join)(wireRoot2, existing.path), created: false };
  }
  const config = { backend, path: registryPath };
  await (0, import_promises4.writeFile)(configPath, `${stableJsonPretty(config)}
`, "utf8");
  const fullRegistryPath = (0, import_node_path2.join)(wireRoot2, registryPath);
  if (backend === "sqlite") new SqliteRegistry(fullRegistryPath);
  else if (backend === "files") new FileRegistry(fullRegistryPath);
  else throw new Error(backend);
  return { root: wireRoot2, backend, path: fullRegistryPath, created: true };
}

// packages/wire-core/src/operations.ts
var import_node_crypto2 = require("node:crypto");
var import_node_path3 = require("node:path");
async function wireRoot(dependencies, path) {
  const configured = await dependencies.workspace.configuredRoot(path, dependencies.home);
  if (configured !== null) return configured;
  return (await dependencies.workspace.initialize(path, dependencies.initialization.backend, dependencies.initialization.registryPath)).root;
}
async function existingWireRoot(dependencies, path) {
  const configured = await dependencies.workspace.configuredRoot(path, dependencies.home);
  if (configured !== null) return configured;
  throw new Error("Wire workspace not initialized. Run `wire init` or `wire <url>` first.");
}
function watchConfig(config) {
  return {
    mode: config.watch?.mode ?? "two-way",
    debounceMs: config.watch?.debounceMs ?? 1e3,
    pollMs: config.watch?.pollMs ?? 6e4
  };
}
function primaryLink(resource) {
  return resource.filesystem_links.find((link) => link.role === "primary");
}
function collisionFilename(title2, service, identifier) {
  const base = markdownFilename(title2).slice(0, -3);
  const suffix = `${service}-${identifier}`.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  const compact2 = suffix.length <= 48 ? suffix : `${suffix.slice(0, 32).replace(/[-_.]+$/g, "")}-${(0, import_node_crypto2.createHash)("sha256").update(suffix).digest("hex").slice(0, 10)}`;
  return `${base}-${compact2}.md`;
}
function markdownLines(markdown) {
  return markdown === "" ? [] : markdown.endsWith("\n") ? markdown.slice(0, -1).split("\n") : markdown.split("\n");
}
function changeSummary(before, after) {
  const beforeLines = markdownLines(before);
  const afterLines = markdownLines(after);
  let start = 0;
  while (start < beforeLines.length && start < afterLines.length && beforeLines[start] === afterLines[start]) start += 1;
  let beforeEnd = beforeLines.length;
  let afterEnd = afterLines.length;
  while (beforeEnd > start && afterEnd > start && beforeLines[beforeEnd - 1] === afterLines[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  const removed = beforeEnd - start;
  const added = afterEnd - start;
  const modified = Math.min(removed, added);
  return { added: added - modified, removed: removed - modified, modified };
}
async function existingResource(registry, service, identifier) {
  const resources = await registry.listResources();
  return resources.find((resource) => resource.identifiers.some((item) => item.service === service && item.identifier === identifier)) ?? null;
}
function jsonObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function syncBase(service, snapshot, data) {
  if (service !== "notion") return snapshot;
  const sync = data.find((item) => item.namespace === "notion" && item.key === "sync")?.value;
  if (sync === void 0 || !jsonObject(snapshot) || !jsonObject(sync) || sync["user_mentions"] === void 0) return snapshot;
  return { ...snapshot, user_mentions: sync["user_mentions"] };
}
function markdownSnapshot(snapshot) {
  if (!jsonObject(snapshot)) return null;
  const markdown = snapshot["markdown"];
  return typeof markdown === "string" ? markdown : null;
}
function pathLikeResourceValue(value) {
  return value === "." || value === ".." || value.startsWith("./") || value.startsWith("../") || value.startsWith("/") || value.includes("/") || value.includes("\\") || value.endsWith(".md");
}
function relativePathContains(parent, child) {
  return parent === "" || child === parent || child.startsWith(`${parent}/`);
}
function relativePathEscapes(path) {
  return path === ".." || path.startsWith("../");
}
function serviceCanSynchronize(url, catalog) {
  const parsed = new URL(url);
  return catalog.find((service) => service.matches(parsed)).synchronize !== void 0;
}
function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error["message"] === "string") return error["message"];
  if (typeof error === "object" && error !== null) return JSON.stringify(error);
  return String(error);
}
function composeWire(dependencies) {
  const store = async (url, path, fetched, previousMarkdown, action, fixedOutputPath, summaryMarkdown, summaryAfterMarkdown) => {
    const source = parseSourceUrl(url, dependencies.catalog);
    const root = await wireRoot(dependencies, path);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const current = await existingResource(registry, source.service, source.identifier);
    let outputPath;
    if (current !== null) outputPath = (0, import_node_path3.join)((0, import_node_path3.dirname)(root), primaryLink(current).path);
    else if (fixedOutputPath !== void 0) outputPath = fixedOutputPath;
    else {
      const cleanPath = (0, import_node_path3.join)((0, import_node_path3.resolve)(path), markdownFilename(fetched.title));
      outputPath = await dependencies.filesystem.exists(cleanPath) ? (0, import_node_path3.join)((0, import_node_path3.resolve)(path), collisionFilename(fetched.title, source.service, source.identifier)) : cleanPath;
    }
    const relativePath = dependencies.workspace.relativePath(outputPath, root);
    const previous = previousMarkdown === null ? await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : "" : previousMarkdown;
    if (action === "attached" && current !== null) {
      const snapshot = current.data.find((item) => item.namespace === source.service && item.key === "snapshot").value;
      const baseMarkdown = markdownSnapshot(syncBase(source.service, snapshot, current.data));
      if (baseMarkdown !== null && previous !== baseMarkdown) throw new Error(`Local edits exist for ${primaryLink(current).path}. Run \`wire sync ${primaryLink(current).path}\` before attaching this URL again.`);
    }
    await dependencies.filesystem.writeText(outputPath, fetched.markdown);
    const id = resourceId(source);
    const primary = current?.filesystem_links.find((link) => link.path === relativePath && link.role === "primary");
    const resource = {
      id,
      type: source.type,
      identifiers: [{ service: source.service, identifier: source.identifier }],
      urls: [url],
      filesystem_links: current === null ? [{ path: relativePath, role: "primary", data: { format: "markdown" } }] : [
        ...current.filesystem_links.filter((link) => !(link.path === relativePath && link.role === "primary")),
        primary ?? { path: relativePath, role: "primary", data: { format: "markdown" } }
      ],
      data: [
        ...current?.data.filter((item) => item.namespace !== "wire" && !(item.namespace === source.service && item.key === "snapshot")) ?? [],
        { namespace: "wire", key: "title", value: fetched.title },
        { namespace: "wire", key: "synced_at", value: dependencies.now().toISOString() },
        { namespace: source.service, key: "snapshot", value: fetched.data }
      ],
      relationships: extractRelationships(fetched.markdown, id, dependencies.catalog)
    };
    const stored = await registry.put(resource);
    const changes = changeSummary(summaryMarkdown ?? previous, summaryAfterMarkdown);
    const resolvedAction = action === "attached" && current !== null && previous !== "" ? changes.added === 0 && changes.modified === 0 && changes.removed === 0 ? "synced" : "downloaded" : action;
    return { resource: stored, path: outputPath, markdown: fetched.markdown, summary: { action: resolvedAction, ...changes, remote: url, local: outputPath } };
  };
  const attach = async (url, path) => {
    const fetched = await fetchSource(dependencies.fetchInput, url, dependencies.catalog);
    return store(url, path, fetched, null, "attached", void 0, void 0, fetched.markdown);
  };
  const create = attach;
  const view = (url) => fetchSource(dependencies.fetchInput, url, dependencies.catalog);
  const downloadSource = async (url, path) => {
    const fetched = await fetchSource(dependencies.fetchInput, url, dependencies.catalog);
    const source = parseSourceUrl(url, dependencies.catalog);
    const cleanPath = (0, import_node_path3.join)((0, import_node_path3.resolve)(path), markdownFilename(fetched.title));
    let outputPath = cleanPath;
    if (await dependencies.filesystem.exists(cleanPath)) {
      const root = await dependencies.workspace.configuredRoot(cleanPath, dependencies.home);
      const current = root === null ? null : await existingResource(await dependencies.workspace.openRegistry(root, dependencies.home), source.service, source.identifier);
      const currentPrimaryPath = current === null ? null : (0, import_node_path3.join)((0, import_node_path3.dirname)(root), primaryLink(current).path);
      const existingMarkdown = await dependencies.filesystem.readText(cleanPath);
      if (currentPrimaryPath !== cleanPath && existingMarkdown !== fetched.markdown) outputPath = (0, import_node_path3.join)((0, import_node_path3.resolve)(path), collisionFilename(fetched.title, source.service, source.identifier));
    }
    const previous = await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : "";
    await dependencies.filesystem.writeText(outputPath, fetched.markdown);
    const id = resourceId(source);
    const resource = {
      id,
      type: source.type,
      identifiers: [{ service: source.service, identifier: source.identifier }],
      urls: [url],
      filesystem_links: [{ path: (0, import_node_path3.basename)(outputPath), role: "primary", data: { format: "markdown" } }],
      data: [
        { namespace: "wire", key: "title", value: fetched.title },
        { namespace: "wire", key: "synced_at", value: dependencies.now().toISOString() },
        { namespace: source.service, key: "snapshot", value: fetched.data }
      ],
      relationships: extractRelationships(fetched.markdown, id, dependencies.catalog)
    };
    return { resource, path: outputPath, markdown: fetched.markdown, summary: { action: "downloaded", ...changeSummary(previous, fetched.markdown), remote: url, local: outputPath } };
  };
  const resolveResource = async (registry, value, root, path) => {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      const source = parseSourceUrl(value, dependencies.catalog);
      const resources2 = await registry.listResources();
      const resource = resources2.find((item) => item.identifiers.some((identifier) => identifier.service === source.service && identifier.identifier === source.identifier));
      if (resource === void 0) throw new Error(`Resource URL not found: ${value}`);
      return resource;
    }
    const candidatePath = (0, import_node_path3.resolve)(path, value);
    const relativePath = dependencies.workspace.relativePath(candidatePath, root);
    const resources = await registry.findByPath(relativePath);
    if (resources.length > 0 || await dependencies.filesystem.exists(candidatePath)) {
      if (resources.length === 0) throw new Error(`Resource path is not registered: ${value}`);
      if (resources.length > 1) throw new Error(`Ambiguous resource path ${relativePath}: ${resources.map((resource) => resource.id).join(", ")}. Use a resource id or URL.`);
      return resources[0];
    }
    if (pathLikeResourceValue(value)) throw new Error(`Resource path not found: ${value}`);
    return registry.get(value);
  };
  const sync = async (value, path) => {
    const candidatePath = (0, import_node_path3.resolve)(path, value);
    const root = await existingWireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const relativePath = dependencies.workspace.relativePath(candidatePath, root);
    const pathResources = await registry.findByPath(relativePath);
    if (pathResources.length === 0 && await dependencies.filesystem.exists(candidatePath)) {
      const markdown2 = await dependencies.filesystem.readText(candidatePath);
      const uploaded = await uploadSource(dependencies.fetchInput, dependencies.catalog, markdown2, candidatePath);
      return store(uploaded.url, (0, import_node_path3.dirname)(candidatePath), uploaded, markdown2, "uploaded", candidatePath, void 0, uploaded.markdown);
    }
    const resource = await resolveResource(registry, value, root, path);
    const outputPath = (0, import_node_path3.join)((0, import_node_path3.dirname)(root), primaryLink(resource).path);
    const outputDirectory = (0, import_node_path3.dirname)(outputPath);
    const source = parseSourceUrl(resource.urls[0], dependencies.catalog);
    const snapshot = resource.data.find((item) => item.namespace === source.service && item.key === "snapshot").value;
    if (!await dependencies.filesystem.exists(outputPath)) throw new Error(`Linked file missing: ${primaryLink(resource).path} - restore it or run wire detach`);
    const markdown = await dependencies.filesystem.readText(outputPath);
    const base = syncBase(source.service, snapshot, resource.data);
    const baseMarkdown = markdownSnapshot(base);
    const localChanged = baseMarkdown !== null && markdown !== baseMarkdown;
    if (localChanged && !serviceCanSynchronize(resource.urls[0], dependencies.catalog)) throw new Error(`${source.service} is download-only and the local file has edits. Run \`wire download ${primaryLink(resource).path}\` to discard them.`);
    const fetched = await synchronizeSource(dependencies.fetchInput, resource.urls[0], dependencies.catalog, base, markdown, outputPath);
    const action = localChanged ? fetched.markdown === baseMarkdown ? "synced" : "uploaded" : fetched.markdown === markdown ? "synced" : "downloaded";
    return store(resource.urls[0], outputDirectory, fetched, markdown, action, void 0, action === "uploaded" && baseMarkdown !== null ? baseMarkdown : void 0, action === "uploaded" ? markdown : fetched.markdown);
  };
  const download = async (value, path) => {
    const candidatePath = (0, import_node_path3.resolve)(path, value);
    const root = await existingWireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const resource = await resolveResource(registry, value, root, path);
    const outputPath = (0, import_node_path3.join)((0, import_node_path3.dirname)(root), primaryLink(resource).path);
    const markdown = await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : "";
    const fetched = await fetchSource(dependencies.fetchInput, resource.urls[0], dependencies.catalog);
    return store(resource.urls[0], (0, import_node_path3.dirname)(outputPath), fetched, markdown, "downloaded", void 0, void 0, fetched.markdown);
  };
  const detach = async (value, path) => {
    const candidatePath = (0, import_node_path3.resolve)(path, value);
    const root = await existingWireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const resource = await resolveResource(registry, value, root, path);
    const outputPath = (0, import_node_path3.join)((0, import_node_path3.dirname)(root), primaryLink(resource).path);
    const previous = await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : "";
    const fetched = await fetchSource(dependencies.fetchInput, resource.urls[0], dependencies.catalog);
    await dependencies.filesystem.writeText(outputPath, fetched.markdown);
    await registry.delete(resource.id);
    return { resource, path: outputPath, markdown: fetched.markdown, summary: { action: "detached", ...changeSummary(previous, fetched.markdown), remote: resource.urls[0], local: outputPath } };
  };
  const unlink2 = detach;
  const watch = async (value, path) => {
    const candidatePath = (0, import_node_path3.resolve)(path, value);
    const root = await existingWireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
    const config = watchConfig(await dependencies.workspace.loadConfig(root));
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const resource = await resolveResource(registry, value, root, path);
    const outputPath = (0, import_node_path3.join)((0, import_node_path3.dirname)(root), primaryLink(resource).path);
    const initial = await dependencies.filesystem.exists(outputPath) ? null : await download(value, path);
    let lastSyncedMarkdown = initial === null ? await dependencies.filesystem.readText(outputPath) : initial.markdown;
    let debounce;
    let resolveClosed;
    const closed = new Promise((resolveClosedPromise) => {
      resolveClosed = resolveClosedPromise;
    });
    const handles = [];
    const synchronize = async () => {
      const result = config.mode === "download" ? await download(value, path) : await sync(value, path);
      lastSyncedMarkdown = result.markdown;
    };
    const schedule = () => {
      if (debounce !== void 0) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = void 0;
        void synchronize();
      }, config.debounceMs);
    };
    handles.push(dependencies.watch.every(config.pollMs, synchronize));
    if (config.mode === "two-way") {
      handles.push(dependencies.watch.watchFile(outputPath, async () => {
        if (await dependencies.filesystem.readText(outputPath) !== lastSyncedMarkdown) schedule();
      }));
    }
    return Object.freeze({
      resource,
      path: outputPath,
      mode: config.mode,
      debounceMs: config.debounceMs,
      pollMs: config.pollMs,
      closed,
      close: () => {
        if (debounce !== void 0) clearTimeout(debounce);
        for (const handle of handles) handle.close();
        resolveClosed();
      }
    });
  };
  const openResource2 = async (value, path) => {
    const candidatePath = (0, import_node_path3.resolve)(path, value);
    const root = await existingWireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const resource = await resolveResource(registry, value, root, path);
    await dependencies.open(resource.urls[0]);
    return resource;
  };
  const syncAll = async (path) => {
    const root = await existingWireRoot(dependencies, path);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const scope = dependencies.workspace.relativePath(path, root);
    if (relativePathEscapes(scope)) throw new Error(`Sync scope is outside the Wire workspace: root ${(0, import_node_path3.dirname)(root)}, path ${path}`);
    const results = [];
    for (const resource of await registry.listResources()) {
      const outputPath = (0, import_node_path3.join)((0, import_node_path3.dirname)(root), primaryLink(resource).path);
      if (relativePathContains(scope, primaryLink(resource).path)) {
        try {
          results.push(await sync(resource.id, (0, import_node_path3.dirname)(outputPath)));
        } catch (error) {
          results.push({ resource, path: outputPath, markdown: "", summary: { action: "failed", added: 0, modified: 0, removed: 0, remote: resource.urls[0], local: outputPath, error: errorMessage(error) } });
        }
      }
    }
    return results;
  };
  const listResources = async (path) => {
    const root = await existingWireRoot(dependencies, path);
    return (await dependencies.workspace.openRegistry(root, dependencies.home)).listResources();
  };
  const showResource = async (value, path) => {
    const candidatePath = (0, import_node_path3.resolve)(path, value);
    const root = await existingWireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    return resolveResource(registry, value, root, path);
  };
  return Object.freeze({
    attach,
    create,
    view,
    downloadSource,
    sync,
    download,
    detach,
    unlink: unlink2,
    watch,
    openResource: openResource2,
    syncAll,
    listResources,
    showResource,
    init: dependencies.workspace.initialize,
    switchBackend: (path) => dependencies.workspace.switchBackend(path, dependencies.home)
  });
}

// packages/wire/src/auth.ts
function cookieHeader(cookies) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
async function responseJson(response) {
  const value = await response.json();
  return response.ok ? value : null;
}
async function verifyNotion(runtime2, cookies) {
  const response = await runtime2.http.request("https://www.notion.so/api/v3/getSpaces", { method: "POST", headers: { cookie: cookieHeader(cookies), "content-type": "application/json", "notion-client-version": "23.13.0.4595", "user-agent": "Mozilla/5.0" }, body: "{}" });
  const payload = await responseJson(response);
  if (payload === null) return null;
  const spaces = payload;
  const userId = cookies.find((cookie) => cookie.name === "notion_user_id")?.value;
  const user = Object.values(spaces)[0];
  if (userId === void 0 || user === void 0) return null;
  const view = Object.values(user.space_view)[0];
  if (view === void 0) return null;
  const spaceId = view.spaceId;
  return Object.freeze({ service: "notion", identity: Object.freeze({ user_id: userId, space_id: spaceId }) });
}
async function verifySlack(runtime2, cookies, metadata) {
  const cookie = cookieHeader(cookies);
  const origin = metadata["origin"];
  const token = metadata["token"];
  if (origin === void 0 || token === void 0) return null;
  const response = await runtime2.http.request(`${origin}/api/auth.test`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, body: new URLSearchParams({ token }) });
  const identity = await responseJson(response);
  if (identity === null) return null;
  if (identity["ok"] !== true) return null;
  return Object.freeze({ service: "slack", identity: Object.freeze({ user_id: identity["user_id"], user: identity["user"], team_id: identity["team_id"], team: identity["team"], url: identity["url"] }) });
}
async function verifyZoom(runtime2, cookies) {
  const cookie = cookieHeader(cookies);
  const jwtResponse = await runtime2.http.request("https://hub.zoom.us/nws/common/2.0/nak?pms=Hub%2CUser%3ABase%2CAICW&src=aicw", { headers: { cookie, "user-agent": zoomUserAgent, "x-requested-with": "XMLHttpRequest", referer: "https://hub.zoom.us/" } });
  const jwt = (await jwtResponse.text()).trim();
  const accountId = cookies.find((value) => value.name === "zm_aid")?.value;
  if (!jwtResponse.ok || jwt.split(".").length !== 3 || accountId === void 0) return null;
  return Object.freeze({ service: "zoom", identity: Object.freeze({ account_id: accountId }) });
}
var zoomUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
function zoomCookieKey(cookie) {
  return `${cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain}	${cookie.path}	${cookie.name}`;
}
function zoomCookieJar(cookies) {
  return new Map(cookies.map((cookie) => [zoomCookieKey(cookie), cookie]));
}
function zoomDomainMatches(cookie, hostname) {
  const domain = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
  return hostname === domain || cookie.includeSubdomains && hostname.endsWith(`.${domain}`);
}
function zoomPathMatches(cookiePath2, requestPath) {
  return requestPath === cookiePath2 || requestPath.startsWith(cookiePath2.endsWith("/") ? cookiePath2 : `${cookiePath2}/`);
}
function zoomRequestCookieHeader(jar, url, now) {
  const nowSeconds = Math.floor(now.getTime() / 1e3);
  return [...jar.values()].filter((cookie) => {
    if (cookie.expires !== 0 && cookie.expires <= nowSeconds) return false;
    if (cookie.secure && url.protocol !== "https:") return false;
    if (!zoomDomainMatches(cookie, url.hostname)) return false;
    return zoomPathMatches(cookie.path, url.pathname);
  }).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
function zoomDefaultCookiePath(pathname) {
  const index = pathname.lastIndexOf("/");
  return index <= 0 ? "/" : pathname.slice(0, index);
}
function zoomSplitSetCookieHeader(value) {
  return Object.freeze(value.split(/,(?=\s*[^;,]+=)/).map((item) => item.trim()));
}
function zoomSetCookieHeaders(response) {
  const headers2 = response.headers;
  const values2 = headers2.getSetCookie?.();
  if (values2 !== void 0) return Object.freeze(values2);
  const value = response.headers.get("set-cookie");
  if (value === null) return Object.freeze([]);
  return zoomSplitSetCookieHeader(value);
}
function zoomCookieAttributes(parts) {
  return new Map(parts.map((part) => {
    const index = part.indexOf("=");
    return index === -1 ? [part.toLowerCase(), ""] : [part.slice(0, index).toLowerCase(), part.slice(index + 1)];
  }));
}
function zoomSetCookieExpires(attributes, now) {
  if (attributes.has("max-age")) return Math.floor(now.getTime() / 1e3) + Number(attributes.get("max-age"));
  if (attributes.has("expires")) return Math.floor(Date.parse(attributes.get("expires")) / 1e3);
  return 0;
}
function zoomApplySetCookie(jar, url, header, now) {
  const parts = header.split(";").map((part) => part.trim());
  const pair = parts[0];
  const separator = pair.indexOf("=");
  const name = pair.slice(0, separator);
  const value = pair.slice(separator + 1);
  const attributes = zoomCookieAttributes(parts.slice(1));
  const domain = attributes.has("domain") ? attributes.get("domain") : url.hostname;
  const path = attributes.has("path") ? attributes.get("path") : zoomDefaultCookiePath(url.pathname);
  const expires = zoomSetCookieExpires(attributes, now);
  const cookie = Object.freeze({
    domain,
    includeSubdomains: attributes.has("domain") || domain.startsWith("."),
    path,
    secure: attributes.has("secure"),
    expires,
    name,
    value,
    httpOnly: attributes.has("httponly")
  });
  const key2 = zoomCookieKey(cookie);
  if (expires !== 0 && expires <= Math.floor(now.getTime() / 1e3)) return jar.delete(key2);
  const existing = jar.get(key2);
  jar.set(key2, cookie);
  return existing === void 0 || existing.value !== cookie.value || existing.expires !== cookie.expires || existing.secure !== cookie.secure || existing.httpOnly !== cookie.httpOnly || existing.includeSubdomains !== cookie.includeSubdomains;
}
function zoomApplyResponseCookies(jar, url, response, now) {
  let changed = false;
  for (const header of zoomSetCookieHeaders(response)) changed = zoomApplySetCookie(jar, url, header, now) || changed;
  return changed;
}
function zoomPruneExpiredCookies(jar, now) {
  let changed = false;
  const nowSeconds = Math.floor(now.getTime() / 1e3);
  for (const [key2, cookie] of jar.entries()) {
    if (cookie.expires !== 0 && cookie.expires <= nowSeconds) {
      jar.delete(key2);
      changed = true;
    }
  }
  return changed;
}
async function zoomAuthRequest(runtime2, jar, url, init) {
  const parsed = new URL(url);
  const response = await runtime2.http.request(url, { ...init, headers: { ...init.headers, cookie: zoomRequestCookieHeader(jar, parsed, runtime2.clock.now()) } });
  return Object.freeze({ response, changed: zoomApplyResponseCookies(jar, parsed, response, runtime2.clock.now()) });
}
async function verifyZoomCookieState(runtime2, cookies, metadata) {
  const jar = zoomCookieJar(cookies);
  let changed = zoomPruneExpiredCookies(jar, runtime2.clock.now());
  const jwt = await zoomAuthRequest(runtime2, jar, "https://hub.zoom.us/nws/common/2.0/nak?pms=Hub%2CUser%3ABase%2CAICW&src=aicw", { headers: { "user-agent": zoomUserAgent, "x-requested-with": "XMLHttpRequest", referer: "https://hub.zoom.us/" } });
  changed = jwt.changed || changed;
  const jwtText = (await jwt.response.text()).trim();
  const accountId = [...jar.values()].find((value) => value.name === "zm_aid")?.value;
  const result = jwt.response.ok && jwtText.split(".").length === 3 && accountId !== void 0 ? Object.freeze({ service: "zoom", identity: Object.freeze({ account_id: accountId }) }) : null;
  return Object.freeze({ result, cookies: Object.freeze([...jar.values()]), metadata, changed });
}
async function verifyChatgpt(runtime2, cookies) {
  const deviceId = cookies.find((cookie) => cookie.name === "oai-did")?.value;
  if (deviceId === void 0) return null;
  const response = await runtime2.http.request("https://chatgpt.com/api/auth/session", { headers: {
    cookie: cookieHeader(cookies),
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "oai-device-id": deviceId,
    "oai-language": "en-US",
    referer: "https://chatgpt.com/"
  } });
  const text2 = await response.text();
  if (!text2.startsWith("{")) return null;
  const session = JSON.parse(text2);
  if (!response.ok) return null;
  if ("error" in session) return null;
  const account = session["account"];
  return Object.freeze({ service: "chatgpt", identity: Object.freeze({ account_id: account["id"] }) });
}
async function verifyAsana(runtime2, cookies) {
  const response = await runtime2.http.request("https://app.asana.com/api/1.0/users/me?opt_fields=gid,name,email", { headers: { cookie: cookieHeader(cookies), accept: "application/json", "user-agent": "Mozilla/5.0" } });
  const payload = await responseJson(response);
  if (payload === null) return null;
  const data = payload.data;
  return Object.freeze({ service: "asana", identity: data });
}
async function verifyGmailCookies(runtime2, cookies) {
  const response = await runtime2.http.request("https://accounts.google.com/ListAccounts?gpsia=1&source=ChromiumBrowser&json=standard", { headers: { cookie: cookieHeader(cookies), accept: "application/json, text/plain, */*", "user-agent": "Mozilla/5.0" } });
  if (!response.ok) return null;
  const text2 = await response.text();
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text2)?.[0];
  if (email === void 0) return null;
  return Object.freeze({ service: "gmail", identity: Object.freeze({ email }) });
}
async function verifyGoogleDocsCookies(runtime2, cookies) {
  const response = await runtime2.http.request("https://docs.google.com/document/u/0/?tgif=d", { headers: { cookie: cookieHeader(cookies), accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0" } });
  if (!response.ok || !response.url.startsWith("https://docs.google.com/")) return null;
  const text2 = await response.text();
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text2)?.[0];
  return Object.freeze({ service: "google-docs", identity: Object.freeze(email === void 0 ? { service: "google-docs" } : { email }) });
}
function composeAuth(runtime2, environment2, extractCookies) {
  const cookieDomains = Object.freeze({ asana: ".asana.com", chatgpt: ".chatgpt.com", gmail: ".google.com", "google-docs": ".google.com", notion: ".notion.so", slack: ".slack.com", zoom: ".zoom.us" });
  const verifyCookies = (service, cookies, metadata) => service === "asana" ? verifyAsana(runtime2, cookies) : service === "chatgpt" ? verifyChatgpt(runtime2, cookies) : service === "gmail" ? verifyGmailCookies(runtime2, cookies) : service === "google-docs" ? verifyGoogleDocsCookies(runtime2, cookies) : service === "notion" ? verifyNotion(runtime2, cookies) : service === "slack" ? verifySlack(runtime2, cookies, metadata) : verifyZoom(runtime2, cookies);
  const verifyCookieState = async (service, cookies, metadata) => {
    if (service === "zoom") return verifyZoomCookieState(runtime2, cookies, metadata);
    return Object.freeze({ result: await verifyCookies(service, cookies, metadata), cookies, metadata, changed: false });
  };
  const cookieAuthError = (service) => new Error(`${service} cookie authentication is missing or expired. Run \`wire ${service} login\` once; other commands reuse saved cookies.`);
  const requiredReady = (required) => (values2) => required.every((name) => values2.some((cookie) => cookie.name === name));
  const googleReady = (values2) => values2.some((cookie) => (cookie.domain === ".google.com" || cookie.domain.endsWith(".google.com")) && ["SID", "__Secure-1PSID", "LSID", "__Host-1PLSID", "__Host-3PLSID"].includes(cookie.name));
  const status = async (service) => {
    const cookies = await runtime2.cookies.loadSaved(service);
    if (cookies === null) throw cookieAuthError(service);
    const state = await verifyCookieState(service, cookies, await runtime2.cookies.metadata(service));
    if (state.changed) await saveCookies(service, state.cookies, state.metadata);
    if (state.result !== null) return state.result;
    throw cookieAuthError(service);
  };
  const saveCookies = async (service, cookies, metadata) => {
    await runtime2.cookies.save(service, cookies, metadata);
  };
  const pasteCookies = async (service, contents) => {
    const cookies = parsePastedCookies(contents, cookieDomains[service]);
    const metadata = parsePastedCookieMetadata(contents);
    const state = await verifyCookieState(service, cookies, metadata);
    if (state.result === null) throw new Error(`${service} cookie authentication failed. Run \`wire ${service} login\` once; other commands reuse saved cookies.`);
    await saveCookies(service, state.cookies, state.metadata);
    return state.result;
  };
  const extract = async (service, startUrl, domains, ready, metadataExpression) => {
    const extraction = { service, startUrl, domains, ready, verify: async (values2, metadata) => (await verifyCookieState(service, values2, metadata)).result !== null, ...metadataExpression === void 0 ? {} : { metadataExpression } };
    const result = await extractCookies(environment2, extraction);
    if (result.manual === true) {
      await saveCookies(service, result.cookies, result.metadata);
      return Object.freeze({ service, identity: Object.freeze({ saved: true }) });
    }
    if (service === "chatgpt") {
      await saveCookies(service, result.cookies, result.metadata);
      const accountId = result.metadata["account_id"];
      if (accountId === void 0) throw new Error("chatgpt cookie authentication failed. Run `wire chatgpt login` once; other commands reuse saved cookies.");
      return Object.freeze({ service, identity: Object.freeze({ account_id: accountId }) });
    }
    const verified = await verifyCookieState(service, result.cookies, result.metadata);
    if (verified.result === null) throw new Error(`${service} cookie authentication failed. Run \`wire ${service} login\` once; other commands reuse saved cookies.`);
    await saveCookies(service, verified.cookies, verified.metadata);
    return verified.result;
  };
  const auth2 = Object.freeze({
    status,
    pasteCookies,
    logout: async (service) => {
      await runtime2.cookies.delete(service);
      return Object.freeze({ service, deleted: true });
    },
    extractAsana: () => extract("asana", "https://app.asana.com/", ["asana.com"], (values2) => values2.some((cookie) => cookie.domain === ".asana.com" || cookie.domain.endsWith(".asana.com"))),
    extractChatgpt: () => extract("chatgpt", "https://chatgpt.com/", ["chatgpt.com", "openai.com"], requiredReady(["oai-did", "__Secure-next-auth.session-token"])),
    extractGmail: () => extract("gmail", "https://mail.google.com/mail/u/0/", ["google.com"], googleReady),
    extractGoogleDocs: () => extract("google-docs", "https://docs.google.com/", ["google.com"], googleReady),
    extractNotion: () => extract("notion", "https://www.notion.so/login", ["notion.so", "notion.com"], requiredReady(["token_v2", "notion_user_id", "notion_users"])),
    extractSlack: () => extract("slack", "https://app.slack.com/client", ["slack.com"], requiredReady(["d"]), `(() => { const value = localStorage.getItem("localConfig_v2"); if (value === null) return {}; const team = Object.values(JSON.parse(value).teams)[0]; if (team === undefined) return {}; return { origin: new URL(team.url).origin, token: team.token }; })()`),
    extractZoom: () => extract("zoom", "https://hub.zoom.us/", ["zoom.us"], requiredReady(["zm_aid", "_zm_ssid"]))
  });
  return auth2;
}

// packages/provider-asana/src/asana-sync.ts
function gidFromUrl(value) {
  const parts = new URL(value).pathname.split("/").filter(Boolean);
  const task = parts.indexOf("task");
  if (task !== -1) return parts[task + 1];
  const project = parts.indexOf("project");
  if (project !== -1) return parts[project + 1];
  if (parts.at(-1) === "list") return parts.at(-2);
  return parts.at(-1) === "f" ? parts.at(-2) : parts.at(-1);
}
function taskUrl(projectGid, gid2) {
  return `https://app.asana.com/0/${projectGid}/task/${gid2}`;
}
function encodeName(value) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}
function decodeName(value) {
  let decoded = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\" && value[index + 1] === "n") {
      decoded += "\n";
      index += 1;
    } else if (value[index] === "\\" && value[index + 1] === "\\") {
      decoded += "\\";
      index += 1;
    } else if (value[index] === "\\" && (value[index + 1] === "[" || value[index + 1] === "]")) {
      decoded += value[index + 1];
      index += 1;
    } else decoded += value[index];
  }
  return decoded;
}
function linked(line) {
  const match = line.match(/^\[((?:\\.|[^\]\\])*)\]\((https:\/\/app\.asana\.com\/[^)]+)\)$/);
  return match === null ? { name: decodeName(line.trim()), gid: null } : { name: decodeName(match[1]), gid: gidFromUrl(match[2]) };
}
function checkbox(line) {
  const match = line.match(/^\[([ xX])\]\s+(.+)$/);
  return match === null ? { completed: false, value: line } : { completed: match[1].toLowerCase() === "x", value: match[2] };
}
function key(kind, gid2, index) {
  return gid2 === null ? `new:${kind}:${index}` : `${kind}:${gid2}`;
}
function parseAsanaMarkdown(markdown) {
  const entities2 = [];
  let projectGid = "";
  let projectUrl = "";
  let section = null;
  let task = null;
  let milestone = null;
  let topOrder = 0;
  let subtaskOrder = 0;
  let created = 0;
  const identities = /* @__PURE__ */ new Set();
  for (const [lineIndex, line] of markdown.split("\n").entries()) {
    if (line === "") continue;
    if (line.startsWith("# ")) {
      const value = linked(line.slice(2));
      if (value.gid === null || projectGid !== "") throw new Error(`Invalid Asana project heading at line ${lineIndex + 1}.`);
      projectGid = value.gid;
      projectUrl = `https://app.asana.com/0/${projectGid}/list`;
      entities2.push({ key: `project:${projectGid}`, gid: projectGid, kind: "project", name: value.name, completed: false, parent: null, section: null, milestone: null, order: 0 });
    } else if (line.startsWith("## ")) {
      if (projectGid === "") throw new Error(`Asana section appears before the project at line ${lineIndex + 1}.`);
      const match = line.slice(3).match(/^(.*?)\s*<!--\s*asana-section:([^\s]+)\s*-->$/);
      const gid2 = match === null ? null : match[2];
      const name = decodeName(match === null ? line.slice(3).trim() : match[1].trim());
      section = key("section", gid2, ++created);
      task = null;
      milestone = null;
      topOrder = 0;
      entities2.push({ key: section, gid: gid2, kind: "section", name, completed: false, parent: null, section: null, milestone: null, order: entities2.filter((entity) => entity.kind === "section").length });
    } else if (line.startsWith("### ")) {
      if (section === null) throw new Error(`Asana milestone appears outside a section at line ${lineIndex + 1}.`);
      const state = checkbox(line.slice(4));
      const value = linked(state.value);
      const entityKey = key("milestone", value.gid, ++created);
      milestone = entityKey;
      entities2.push({ key: entityKey, gid: value.gid, kind: "milestone", name: value.name, completed: state.completed, parent: null, section, milestone: null, order: topOrder++ });
      task = null;
    } else if (line.startsWith("- ")) {
      if (section === null) throw new Error(`Asana task appears outside a section at line ${lineIndex + 1}.`);
      const state = checkbox(line.slice(2));
      const value = linked(state.value);
      task = key("task", value.gid, ++created);
      subtaskOrder = 0;
      entities2.push({ key: task, gid: value.gid, kind: "task", name: value.name, completed: state.completed, parent: null, section, milestone, order: topOrder++ });
    } else if (line.startsWith("  - ")) {
      if (task === null) throw new Error(`Asana subtask appears without a task at line ${lineIndex + 1}.`);
      const state = checkbox(line.slice(4));
      const value = linked(state.value);
      entities2.push({ key: key("subtask", value.gid, ++created), gid: value.gid, kind: "subtask", name: value.name, completed: state.completed, parent: task, section, milestone, order: subtaskOrder++ });
    } else throw new Error(`Unsupported Asana Markdown at line ${lineIndex + 1}: ${line}`);
    const identity = entities2.at(-1).gid;
    if (identity !== null) {
      if (identities.has(identity)) throw new Error(`Duplicate Asana identity ${identity}.`);
      identities.add(identity);
    }
  }
  if (projectGid === "") throw new Error("Missing Asana project heading.");
  return { projectGid, projectUrl, entities: entities2 };
}
function renderAsanaMarkdown(document) {
  const project = document.entities.find((entity) => entity.kind === "project");
  const lines = [`# [${encodeName(project.name)}](${document.projectUrl})`, ""];
  for (const section of document.entities.filter((entity) => entity.kind === "section").sort((left, right) => left.order - right.order)) {
    lines.push(`## ${encodeName(section.name)}${section.gid === null ? "" : ` <!-- asana-section:${section.gid} -->`}`, "");
    const top = document.entities.filter((entity) => (entity.kind === "milestone" || entity.kind === "task") && entity.section === section.key).sort((left, right) => left.order - right.order);
    for (const entity of top) {
      const label = entity.gid === null ? encodeName(entity.name) : `[${encodeName(entity.name)}](${taskUrl(document.projectGid, entity.gid)})`;
      if (entity.kind === "milestone") lines.push(`### ${entity.completed ? "[x] " : ""}${label}`, "");
      else {
        lines.push(`- [${entity.completed ? "x" : " "}] ${label}`);
        for (const subtask of document.entities.filter((candidate) => candidate.kind === "subtask" && candidate.parent === entity.key).sort((left, right) => left.order - right.order)) {
          const child = subtask.gid === null ? encodeName(subtask.name) : `[${encodeName(subtask.name)}](${taskUrl(document.projectGid, subtask.gid)})`;
          lines.push(`  - [${subtask.completed ? "x" : " "}] ${child}`);
        }
      }
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}
`;
}
function values(document) {
  return new Map(document.entities.filter((entity) => entity.gid !== null).map((entity) => [entity.key, entity]));
}
function asanaChanges(base, other) {
  const baseValues = values(base);
  const otherValues = values(other);
  const changes = [];
  for (const entity of other.entities) {
    if (entity.gid === null) changes.push({ operation: "create", key: entity.key, field: null, value: entity });
    else if (!baseValues.has(entity.key)) changes.push({ operation: "create", key: entity.key, field: null, value: entity });
    else {
      const previous = baseValues.get(entity.key);
      for (const field of ["name", "completed", "parent", "section", "milestone"]) {
        if (previous[field] !== entity[field]) changes.push({ operation: "update", key: entity.key, field, value: entity[field] });
      }
    }
  }
  for (const entity of base.entities) if (entity.gid !== null && !otherValues.has(entity.key)) changes.push({ operation: "delete", key: entity.key, field: null, value: entity });
  const shared = new Set([...baseValues.keys()].filter((entityKey) => otherValues.has(entityKey)));
  const siblingGroup = (entity) => entity.kind === "section" ? "sections" : entity.kind === "subtask" ? `subtasks:${entity.parent}` : `top:${entity.section}`;
  const groups = new Set([...base.entities, ...other.entities].filter((entity) => shared.has(entity.key)).map(siblingGroup));
  for (const group of groups) {
    const ordered = (document) => document.entities.filter((entity) => shared.has(entity.key) && siblingGroup(entity) === group).sort((left, right) => left.order - right.order).map((entity) => entity.key);
    const before = ordered(base);
    const after = ordered(other);
    for (const [index, entityKey] of after.entries()) if (before[index] !== entityKey) changes.push({ operation: "update", key: entityKey, field: "order", value: index === 0 ? null : after[index - 1] });
  }
  return changes;
}
function changePath(change) {
  return change.operation === "update" ? `${change.key}.${change.field}` : change.key;
}
function asanaConflicts(local, remote) {
  const remotePaths = new Map(remote.map((change) => [changePath(change), change]));
  const remoteEntities = new Set(remote.map((change) => change.key));
  const conflicts = [];
  for (const change of local) {
    const path = changePath(change);
    const other = remotePaths.get(path);
    if (other !== void 0) {
      if (other.operation !== change.operation || JSON.stringify(other.value) !== JSON.stringify(change.value)) conflicts.push(path);
    } else if ((change.operation === "delete" || change.operation === "create") && remoteEntities.has(change.key)) conflicts.push(change.key);
    else if (remote.some((candidate) => candidate.key === change.key && candidate.operation === "delete")) conflicts.push(change.key);
  }
  return [...new Set(conflicts)].sort();
}
function asanaDocument(value) {
  return value;
}
function asanaSnapshot(document) {
  return document;
}

// packages/provider-asana/src/asana-project.ts
var projectViews = /* @__PURE__ */ new Set(["board", "calendar", "files", "forms", "gantt", "list", "overview", "timeline", "workflow"]);
function object(value) {
  return value;
}
function projectIdentifier(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname !== "app.asana.com") return void 0;
  if (parts[0] === "0" && (parts.length === 3 || parts.length === 4) && projectViews.has(parts[2])) return parts[1];
  if (parts[0] === "1" && (parts.length === 5 || parts.length === 6) && parts[2] === "project" && projectViews.has(parts[4])) return parts[3];
  return void 0;
}
function asanaAuthError() {
  return new Error("Asana authentication is missing or expired. Run `wire asana login` once; other commands reuse saved cookies.");
}
async function request(runtime2, method, path, parameters, data) {
  const url = new URL(`https://app.asana.com/api/1.0${path}`);
  if (parameters !== void 0) for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
  const cookies = await runtime2.cookies.loadSaved("asana");
  if (cookies === null) throw asanaAuthError();
  const response = await runtime2.http.request(url, {
    method,
    headers: {
      Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0"
    },
    ...data === void 0 ? {} : { body: JSON.stringify({ data }) }
  });
  if (response.status === 401) throw asanaAuthError();
  if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
  return object(await response.json());
}
async function paginate(runtime2, path, parameters) {
  const values2 = [];
  let offset;
  do {
    const page = await request(runtime2, "GET", path, offset === void 0 ? parameters : { ...parameters, offset });
    values2.push(...page["data"].map(object));
    const nextPage = page["next_page"];
    offset = nextPage === null ? void 0 : nextPage["offset"];
  } while (offset !== void 0);
  return values2;
}
async function fetchDocument(runtime2, url, source) {
  const project = object((await request(runtime2, "GET", `/projects/${source.identifier}`, { opt_fields: "gid,name,permalink_url" }))["data"]);
  const sections = await paginate(runtime2, `/projects/${source.identifier}/sections`, { limit: "100", opt_fields: "gid,name" });
  const tasks = await paginate(runtime2, `/projects/${source.identifier}/tasks`, { limit: "100", opt_fields: "gid,name,completed,parent,resource_subtype,permalink_url,memberships.project.gid,memberships.section.gid" });
  const entities2 = [{ key: `project:${source.identifier}`, gid: source.identifier, kind: "project", name: project["name"], completed: false, parent: null, section: null, milestone: null, order: 0 }];
  const memberships = tasks.map((task) => task["memberships"].map(object).find((value) => object(value["project"])["gid"] === source.identifier));
  const projectSections = tasks.some((_task, index) => memberships[index]["section"] === null) ? [...sections, { gid: "__unsectioned__", name: "No section" }] : sections;
  for (const [sectionOrder, section] of projectSections.entries()) {
    const sectionGid = section["gid"];
    const sectionKey = `section:${sectionGid}`;
    entities2.push({ key: sectionKey, gid: sectionGid, kind: "section", name: section["name"], completed: false, parent: null, section: null, milestone: null, order: sectionOrder });
    let milestone = null;
    let order = 0;
    for (const [taskIndex, task] of tasks.entries()) {
      const membership = memberships[taskIndex];
      const membershipSection = membership["section"] === null ? "__unsectioned__" : object(membership["section"])["gid"];
      if (membershipSection !== sectionGid || task["parent"] !== null) continue;
      const taskGid = task["gid"];
      const kind = task["resource_subtype"] === "milestone" ? "milestone" : "task";
      const taskKey = `${kind}:${taskGid}`;
      if (kind === "milestone") milestone = taskKey;
      entities2.push({ key: taskKey, gid: taskGid, kind, name: task["name"], completed: task["completed"], parent: null, section: sectionKey, milestone: kind === "milestone" ? null : milestone, order: order++ });
      if (kind === "task") {
        const subtasks = await paginate(runtime2, `/tasks/${taskGid}/subtasks`, { limit: "100", opt_fields: "gid,name,completed,parent,resource_subtype,permalink_url" });
        for (const [subtaskOrder, subtask] of subtasks.entries()) {
          const subtaskGid = subtask["gid"];
          entities2.push({ key: `subtask:${subtaskGid}`, gid: subtaskGid, kind: "subtask", name: subtask["name"], completed: subtask["completed"], parent: taskKey, section: sectionKey, milestone, order: subtaskOrder });
        }
      }
    }
  }
  const document = { projectGid: source.identifier, projectUrl: url, entities: entities2 };
  return Object.freeze({ title: project["name"], markdown: renderAsanaMarkdown(document), data: asanaSnapshot(document) });
}
function entityMap(document) {
  return new Map(document.entities.map((entity) => [entity.key, entity]));
}
function gid(entity, created) {
  return entity.gid === null ? created.get(entity.key) : entity.gid;
}
function referenceGid(key2, entities2, created) {
  return key2 === null ? null : gid(entities2.get(key2), created);
}
function placement(previous, next) {
  if (previous !== null) return { insert_after: previous };
  if (next !== null) return { insert_before: next };
  return {};
}
async function createEntity(runtime2, document, entity, entities2, created) {
  if (entity.gid !== null) return;
  let value;
  if (entity.kind === "section") value = object((await request(runtime2, "POST", `/projects/${document.projectGid}/sections`, void 0, { name: entity.name }))["data"]);
  else if (entity.kind === "subtask") value = object((await request(runtime2, "POST", `/tasks/${referenceGid(entity.parent, entities2, created)}/subtasks`, void 0, { name: entity.name, completed: entity.completed }))["data"]);
  else value = object((await request(runtime2, "POST", "/tasks", void 0, { name: entity.name, completed: entity.completed, projects: [document.projectGid], ...entity.kind === "milestone" ? { resource_subtype: "milestone" } : {} }))["data"]);
  created.set(entity.key, value["gid"]);
}
async function updateEntity(runtime2, change, entities2) {
  const entity = entities2.get(change.key);
  if (change.field === "name") {
    if (entity.kind === "project") await request(runtime2, "PUT", `/projects/${entity.gid}`, void 0, { name: change.value });
    else if (entity.kind === "section") await request(runtime2, "PUT", `/sections/${entity.gid}`, void 0, { name: change.value });
    else await request(runtime2, "PUT", `/tasks/${entity.gid}`, void 0, { name: change.value });
  } else if (change.field === "completed") await request(runtime2, "PUT", `/tasks/${entity.gid}`, void 0, { completed: change.value });
}
function siblings(document, entity) {
  return document.entities.filter((candidate) => entity.kind === "section" ? candidate.kind === "section" : entity.kind === "subtask" ? candidate.kind === "subtask" && candidate.parent === entity.parent : (candidate.kind === "task" || candidate.kind === "milestone") && candidate.section === entity.section).sort((left, right) => left.order - right.order);
}
async function placeEntity(runtime2, document, entity, entities2, created, placementKeys, placed) {
  if (entity.kind === "project") return;
  const entityGid = gid(entity, created);
  const ordered = siblings(document, entity);
  const index = ordered.findIndex((candidate) => candidate.key === entity.key);
  const previousEntity = ordered.slice(0, index).reverse().find((candidate) => !placementKeys.has(candidate.key) || placed.has(candidate.key));
  const nextEntity = ordered.slice(index + 1).find((candidate) => !placementKeys.has(candidate.key));
  const previous = previousEntity === void 0 ? null : gid(previousEntity, created);
  const next = nextEntity === void 0 ? null : gid(nextEntity, created);
  if (entity.kind === "section") {
    if (previous !== null) await request(runtime2, "POST", `/projects/${document.projectGid}/sections/insert`, void 0, { section: entityGid, after_section: previous });
    else if (next !== null) await request(runtime2, "POST", `/projects/${document.projectGid}/sections/insert`, void 0, { section: entityGid, before_section: next });
  } else if (entity.kind === "subtask") await request(runtime2, "POST", `/tasks/${entityGid}/setParent`, void 0, { parent: referenceGid(entity.parent, entities2, created), ...placement(previous, next) });
  else {
    const sectionGid = referenceGid(entity.section, entities2, created);
    if (sectionGid === "__unsectioned__") await request(runtime2, "POST", `/tasks/${entityGid}/addProject`, void 0, { project: document.projectGid, ...placement(previous, next) });
    else await request(runtime2, "POST", `/sections/${sectionGid}/addTask`, void 0, { task: entityGid, ...placement(previous, next) });
  }
}
async function deleteEntity(runtime2, entity) {
  if (entity.kind === "section" && entity.gid === "__unsectioned__") return;
  if (entity.kind === "section") await request(runtime2, "DELETE", `/sections/${entity.gid}`);
  else if (entity.kind !== "project") await request(runtime2, "DELETE", `/tasks/${entity.gid}`);
}
async function push(runtime2, document, changes) {
  const destructiveDeletes = changes.filter((change) => change.operation === "delete" && change.value.kind !== "section" && change.value.kind !== "project").map((change) => change.value);
  if (destructiveDeletes.length > 0) throw new Error(`Asana task removal is not supported from project Markdown: ${destructiveDeletes.map((entity) => entity.name).join(", ")}`);
  const entities2 = entityMap(document);
  const created = /* @__PURE__ */ new Map();
  for (const kind of ["section", "milestone", "task", "subtask"]) for (const change of changes) if (change.operation === "create" && change.value.kind === kind) await createEntity(runtime2, document, change.value, entities2, created);
  for (const change of changes) if (change.operation === "update") await updateEntity(runtime2, change, entities2);
  const placementKeys = new Set(changes.filter((change) => change.operation === "create" || change.field === "parent" || change.field === "section" || change.field === "milestone" || change.field === "order").map((change) => change.key));
  const placed = /* @__PURE__ */ new Set();
  for (const entity of document.entities) if (placementKeys.has(entity.key)) {
    await placeEntity(runtime2, document, entity, entities2, created, placementKeys, placed);
    placed.add(entity.key);
  }
  for (const kind of ["subtask", "task", "milestone", "section"]) for (const change of changes) if (change.operation === "delete" && change.value.kind === kind) await deleteEntity(runtime2, change.value);
}
var asanaProjectService = defineService({
  name: "asana-project",
  matches: (url) => projectIdentifier(url) !== void 0,
  parse: (url) => {
    return Object.freeze({ service: "asana-project", identifier: projectIdentifier(url), type: "project" });
  },
  fetch: fetchDocument,
  synchronize: async (runtime2, url, source, baseValue, markdown) => {
    const base = asanaDocument(baseValue);
    const local = parseAsanaMarkdown(markdown);
    if (local.projectGid !== base.projectGid) throw new Error(`Asana project identity changed from ${base.projectGid} to ${local.projectGid}.`);
    const remote = asanaDocument((await fetchDocument(runtime2, url, source)).data);
    const known = new Set([...base.entities, ...remote.entities].map((entity) => entity.gid).filter((value) => value !== null));
    const unknown = local.entities.find((entity) => entity.gid !== null && !known.has(entity.gid));
    if (unknown !== void 0) throw new Error(`Unknown Asana identity ${unknown.gid}. New entries must not include a URL.`);
    const localChanges = asanaChanges(base, local);
    const remoteChanges = asanaChanges(base, remote);
    const conflicts = asanaConflicts(localChanges, remoteChanges);
    if (conflicts.length > 0) throw new Error(`Conflicting Asana edits: ${conflicts.join(", ")}`);
    const remotePaths = new Map(remoteChanges.map((change) => [`${change.key}.${change.field}`, change]));
    const pending = localChanges.filter((change) => {
      const remoteChange = remotePaths.get(`${change.key}.${change.field}`);
      return remoteChange === void 0 || JSON.stringify(remoteChange.value) !== JSON.stringify(change.value);
    });
    await push(runtime2, local, pending);
    return fetchDocument(runtime2, url, source);
  }
});

// packages/provider-asana/src/asana-task.ts
function object2(value) {
  return value;
}
function asanaErrorMessage(body2) {
  const errors = body2["errors"];
  return errors.map((error) => error["message"]).join("; ");
}
function asanaAuthError2() {
  return new Error("Asana authentication is missing or expired. Run `wire asana login` once; other commands reuse saved cookies.");
}
async function asana(runtime2, path, parameters) {
  const url = new URL(`https://app.asana.com/api/1.0${path}`);
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
  const cookies = await runtime2.cookies.loadSaved("asana");
  if (cookies === null) throw asanaAuthError2();
  const response = await runtime2.http.request(url, {
    headers: {
      Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0"
    }
  });
  const body2 = object2(await response.json());
  if (response.status === 401) throw asanaAuthError2();
  if (!response.ok) throw new Error(`Asana API ${path} failed: HTTP ${response.status} ${asanaErrorMessage(body2)}`);
  return body2;
}
async function fetchTask(runtime2, identifier) {
  return object2((await asana(runtime2, `/tasks/${identifier}`, {
    opt_fields: "gid,name,notes,completed,completed_at,created_at,modified_at,due_on,due_at,permalink_url,assignee,assignee.name,assignee.email,memberships.project.gid,memberships.project.name,memberships.section.name,projects.name,tags.name"
  }))["data"]);
}
async function fetchStories(runtime2, identifier) {
  const stories = [];
  let offset;
  do {
    const parameters = { limit: "100", opt_fields: "gid,type,text,created_at,created_by.name,created_by.email,resource_subtype" };
    if (offset !== void 0) parameters["offset"] = offset;
    const page = await asana(runtime2, `/tasks/${identifier}/stories`, parameters);
    stories.push(...page["data"]);
    const nextPage = page["next_page"];
    offset = nextPage === null ? void 0 : nextPage["offset"];
  } while (offset !== void 0);
  return stories;
}
function taskIdentifier(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname !== "app.asana.com") return void 0;
  if (parts[0] === "1" && parts.length >= 4 && parts[2] === "task") return parts[3];
  if (parts[0] === "1" && parts.length >= 6 && parts[2] === "project" && parts[4] === "task") return parts[5];
  if (parts[0] !== "0") return void 0;
  if (parts.length === 4 && parts[2] === "task") return parts[3];
  if (parts.length === 4 && parts[3] === "f" && !["home", "inbox", "search"].includes(parts[1])) return parts[2];
  if (parts.length === 3 && !["home", "inbox", "search"].includes(parts[1])) return parts[2];
  return void 0;
}
var asanaTaskService = defineService({
  name: "asana-task",
  matches: (url) => taskIdentifier(url) !== void 0,
  parse: (url) => {
    return Object.freeze({ service: "asana-task", identifier: taskIdentifier(url), type: "task" });
  },
  fetch: async (runtime2, _url, source) => {
    const task = await fetchTask(runtime2, source.identifier);
    const stories = await fetchStories(runtime2, source.identifier);
    const assignee = task["assignee"];
    const lines = [`# ${task["name"]}`, "", `- Source: ${task["permalink_url"]}`, `- Completed: ${task["completed"] ? "True" : "False"}`];
    if (assignee !== null) lines.push(`- Assignee: ${assignee["name"]}`);
    lines.push("", task["notes"]);
    if (stories.length > 0) {
      lines.push("", "## Activity", "");
      for (const value of stories) {
        const story = object2(value);
        const createdBy = story["created_by"];
        lines.push(`- ${story["created_at"]} \u2014 ${createdBy === null ? "System" : createdBy["name"]}: ${story["text"]}`);
      }
    }
    return Object.freeze({ title: task["name"], markdown: `${lines.join("\n").trimEnd()}
`, data: { task, stories } });
  }
});

// packages/provider-asana/src/index.ts
var asanaProvider = Object.freeze({
  services: [asanaProjectService, asanaTaskService]
});

// packages/provider-chatgpt/src/chatgpt.ts
function chatgptAuthError() {
  return new Error("ChatGPT authentication is missing or expired. Run `wire chatgpt login` once; other commands reuse saved cookies.");
}
function cookieHeader2(cookies) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
function headers(cookies, referer) {
  return {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "oai-device-id": cookies.find((cookie) => cookie.name === "oai-did").value,
    "oai-language": "en-US",
    referer,
    cookie: cookieHeader2(cookies)
  };
}
function formatUpdateTime(value) {
  if (typeof value === "string") return value;
  return new Date(value * 1e3).toISOString();
}
function orderedMessages(conversation) {
  const mapping = conversation["mapping"];
  if (typeof conversation["current_node"] === "string") {
    const path = [];
    let nodeId = conversation["current_node"];
    while (nodeId !== null) {
      const node = mapping[nodeId];
      const message = node["message"];
      if (message !== null) path.push(message);
      nodeId = node["parent"];
    }
    return path.reverse();
  }
  const messages = [];
  for (const node of Object.values(mapping)) {
    const message = node["message"];
    if (message !== null) messages.push(message);
  }
  messages.sort((left, right) => {
    const leftTime = left["create_time"];
    const rightTime = right["create_time"];
    const leftKey = leftTime === null ? 0 : leftTime;
    const rightKey = rightTime === null ? 0 : rightTime;
    if (leftKey !== rightKey) return leftKey - rightKey;
    return left["id"].localeCompare(right["id"]);
  });
  return messages;
}
function multimodalText(value) {
  const parts = [];
  for (const part of value["parts"]) {
    if (typeof part === "string") parts.push(part);
    else if (part["content_type"] === "audio_transcription") parts.push(part["text"]);
    else if (part["content_type"] === "text") parts.push(part["text"]);
  }
  return parts.join("\n\n").trim();
}
function messageContent(message) {
  const content = message["content"];
  if (content["content_type"] === "text") {
    const parts = [];
    for (const part of content["parts"]) {
      if (typeof part === "string") {
        const stripped = part.trim();
        if (stripped.startsWith('{"content_type":"multimodal_text"') || stripped.startsWith('{"content_type": "multimodal_text"')) {
          parts.push(multimodalText(JSON.parse(stripped)));
        } else parts.push(part);
      } else parts.push(JSON.stringify(part));
    }
    return parts.join("\n\n").trim();
  }
  if (content["content_type"] === "multimodal_text") return multimodalText(content);
  if (content["content_type"] === "code") return content["text"];
  return JSON.stringify(content);
}
function readableBody(message) {
  const content = message["content"];
  if (content["content_type"] === "thoughts" || content["content_type"] === "reasoning_recap" || content["content_type"] === "model_editable_context") return "";
  const body2 = messageContent(message).trim();
  const role = message["author"]["role"];
  if (role === "assistant" && (body2.startsWith('{"content_type"') || body2.startsWith('{"content_type":'))) {
    const parsed = JSON.parse(body2);
    if (parsed["content_type"] === "thoughts" || parsed["content_type"] === "reasoning_recap" || parsed["content_type"] === "model_editable_context") return "";
  }
  return body2.replace(/cite[^]+/g, "").split("\n").map((line) => line.trimEnd()).join("\n").trim();
}
function conversationMarkdown(conversation) {
  const url = `https://chatgpt.com/c/${conversation["conversation_id"]}`;
  const lines = [
    `# ${conversation["title"]}`,
    "",
    `[Open in ChatGPT](${url})`,
    ""
  ];
  const entries = [];
  for (const message of orderedMessages(conversation)) {
    const role = message["author"]["role"];
    if (role === "system" || role === "tool") continue;
    const body2 = readableBody(message);
    if (body2 === "") continue;
    const label = role === "user" ? "You" : role === "assistant" ? "ChatGPT" : `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`;
    if (entries.length > 0 && entries[entries.length - 1][0] === label) entries[entries.length - 1][1].push(body2);
    else entries.push([label, [body2]]);
  }
  for (const [label, bodies] of entries) {
    lines.push(`## ${label}`, "", bodies.join("\n\n"), "");
  }
  return `${lines.join("\n").trimEnd()}
`;
}
function fetchedConversation(conversation) {
  const updated = formatUpdateTime(conversation["update_time"]);
  return Object.freeze({
    title: conversation["title"],
    markdown: conversationMarkdown(conversation),
    data: { conversation_id: conversation["conversation_id"], update_time: updated }
  });
}
var chatgptService = defineService({
  name: "chatgpt",
  matches: (url) => (url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com") && /^\/c\/[^/]+\/?$/.test(url.pathname),
  parse: (url) => Object.freeze({ service: "chatgpt", identifier: /^\/c\/([^/]+)\/?$/.exec(url.pathname)[1], type: "message-thread" }),
  fetch: async (runtime2, url, source) => {
    const cookies = await runtime2.cookies.loadSaved("chatgpt");
    if (cookies === null) throw chatgptAuthError();
    const sessionHeaders = headers(cookies, "https://chatgpt.com/");
    const sessionResponse = await runtime2.http.request("https://chatgpt.com/api/auth/session", { headers: sessionHeaders });
    const sessionText = await sessionResponse.text();
    if (!sessionText.startsWith("{")) throw chatgptAuthError();
    const session = JSON.parse(sessionText);
    if ("error" in session) throw chatgptAuthError();
    const account = session["account"];
    const conversationHeaders = {
      ...sessionHeaders,
      authorization: `Bearer ${session["accessToken"]}`,
      "chatgpt-account-id": account["id"],
      referer: url
    };
    const conversationResponse = await runtime2.http.request(`https://chatgpt.com/backend-api/conversation/${encodeURIComponent(source.identifier)}`, { headers: conversationHeaders });
    if (!conversationResponse.ok) throw new Error(`ChatGPT conversation download failed. Run \`wire chatgpt login\`. ${await conversationResponse.text()}`);
    return fetchedConversation(await conversationResponse.json());
  }
});

// packages/provider-chatgpt/src/index.ts
var chatgptProvider = Object.freeze({
  services: [chatgptService]
});

// packages/provider-gmail/src/gmail.ts
function decode(data) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function entities(text2) {
  return text2.replace(/&nbsp;/g, "\xA0").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}
function stripTags(html) {
  return html.replace(/<[^>]+>/g, "");
}
function htmlText(html) {
  return entities(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<a\b[^>]*\bhref=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_match, _quote, href, label) => `[${entities(stripTags(label)).trim()}](${entities(href)})`).replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, "")).split("\n").map((line) => line.trim()).filter((line) => line !== "").join("\n");
}
function body(payload) {
  const mimeType = payload["mimeType"];
  if (mimeType === "text/plain") return decode(payload["body"]["data"]);
  if (mimeType === "text/html") return htmlText(decode(payload["body"]["data"]));
  if (payload["parts"] === void 0) return "";
  const parts = payload["parts"];
  if (mimeType === "multipart/alternative") {
    const plain = parts.find((part) => part["mimeType"] === "text/plain");
    const html = parts.find((part) => part["mimeType"] === "text/html");
    if (plain !== void 0 && body(plain).trim() !== "") return body(plain);
    if (html !== void 0) return body(html);
    if (plain !== void 0) return body(plain);
  }
  return parts.filter((part) => part["mimeType"] !== "application/octet-stream").map(body).join("\n");
}
function threadIdentifier(url) {
  const fragmentPath = url.hash.slice(1).split("?")[0];
  const parts = fragmentPath.replace(/\/$/, "").split("/");
  const identifier = parts.at(-1);
  if (identifier === "") return void 0;
  if (["search", "label"].includes(parts[0])) return parts.length >= 3 ? identifier : void 0;
  if (parts[0] === "category") return parts.length === 3 ? identifier : void 0;
  if (["all", "drafts", "important", "inbox", "sent", "snoozed", "spam", "starred", "trash"].includes(parts[0])) return parts.length === 2 ? identifier : void 0;
  return void 0;
}
async function gmailJson(response, label) {
  const body2 = await response.json();
  if (!response.ok) {
    const error = body2["error"];
    throw new Error(`Gmail API ${label} failed: HTTP ${response.status} ${error["message"]}`);
  }
  return body2;
}
var gmailService = defineService({
  name: "gmail",
  matches: (url) => url.hostname === "mail.google.com" && threadIdentifier(url) !== void 0,
  parse: (url) => {
    return Object.freeze({ service: "gmail", identifier: threadIdentifier(url), type: "email-thread" });
  },
  fetch: async (runtime2, url, source) => {
    const token = await runtime2.gmailTokens.load();
    const response = await runtime2.http.request(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(source.identifier)}?format=full`, { headers: { Authorization: `Bearer ${token.token}` } });
    const thread = await gmailJson(response, "thread fetch");
    const messages = thread["messages"].map((message) => {
      const payload = message["payload"];
      const headers2 = Object.fromEntries(payload["headers"].map((header) => [header["name"].toLowerCase(), header["value"]]));
      const to = headers2["to"];
      const renderedBody = body(payload);
      if (to === void 0) return Object.freeze({ id: message["id"], from: headers2["from"], date: headers2["date"], subject: headers2["subject"], body: renderedBody });
      return Object.freeze({ id: message["id"], from: headers2["from"], to, date: headers2["date"], subject: headers2["subject"], body: renderedBody });
    });
    const lines = [`# ${messages[0].subject}`, "", `- Source: ${url}`, `- Thread ID: ${source.identifier}`, ""];
    for (const message of messages) {
      lines.push(`## ${message.from} \u2014 ${message.date}`, "");
      if ("to" in message) lines.push(`**To:** ${message.to}`, "");
      lines.push(message.body, "");
    }
    return Object.freeze({ title: messages[0].subject, markdown: `${lines.join("\n").trimEnd()}
`, data: { messages } });
  }
});

// packages/provider-gmail/src/index.ts
var gmailProvider = Object.freeze({
  services: [gmailService]
});

// packages/provider-google-docs/src/google-docs.ts
var import_node_zlib = require("node:zlib");
async function cookieHeader3(runtime2) {
  const cookies = await runtime2.cookies.loadSaved("google-docs");
  if (cookies === null) throw cookieAuthenticationError();
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
function cookieAuthenticationError() {
  return new Error("google-docs cookie authentication is missing or expired. Run `wire google-docs login` once; other commands reuse saved cookies.");
}
function filenameTitle(value, label) {
  const encoded = /filename\*=UTF-8'[^']*'([^;]+)/i.exec(value);
  const quoted = /filename="([^"]+)"/i.exec(value);
  const bare = /filename=([^;]+)/i.exec(value);
  if (encoded === null && quoted === null && bare === null) throw new Error(`Google ${label} did not include a filename`);
  const filename = encoded !== null ? decodeURIComponent(encoded[1]) : quoted !== null ? quoted[1] : bare[1].trim();
  return filename.replace(/\.(csv|html|md|pptx|txt|xlsx)$/i, "");
}
async function googleExport(runtime2, url, label) {
  const response = await runtime2.http.request(url, { headers: { Cookie: await cookieHeader3(runtime2) } });
  if (response.status === 401 || response.status === 403) throw cookieAuthenticationError();
  if (!response.ok) throw new Error(`Google ${label} failed: HTTP ${response.status}`);
  const disposition = response.headers.get("content-disposition");
  if (disposition === null) throw cookieAuthenticationError();
  return Object.freeze({ title: filenameTitle(disposition, label), text: await response.text() });
}
async function googleExportBytes(runtime2, url, label) {
  const response = await runtime2.http.request(url, { headers: { Cookie: await cookieHeader3(runtime2) } });
  if (response.status === 401 || response.status === 403) throw cookieAuthenticationError();
  if (!response.ok) throw new Error(`Google ${label} failed: HTTP ${response.status}`);
  const disposition = response.headers.get("content-disposition");
  if (disposition === null) throw cookieAuthenticationError();
  return Object.freeze({ title: filenameTitle(disposition, label), bytes: new Uint8Array(await response.arrayBuffer()) });
}
async function googleText(runtime2, url, label) {
  const response = await runtime2.http.request(url, { headers: { Cookie: await cookieHeader3(runtime2) } });
  if (response.status === 401 || response.status === 403) throw cookieAuthenticationError();
  if (!response.ok) throw new Error(`Google ${label} failed: HTTP ${response.status}`);
  return response.text();
}
function saveResult(text2, label) {
  if (/^\s*</.test(text2)) throw cookieAuthenticationError();
  if (!text2.startsWith(")]}'\n")) throw new Error(`Google ${label} save failed: unexpected response`);
  return JSON.parse(text2.slice(")]}'\n".length));
}
function objectValue(value) {
  const object4 = value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Google sync base must be an object");
  return object4;
}
function parseCsv(value) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quoted) {
      if (char === '"' && value[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell !== "" || row.length !== 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
function stringRows(value) {
  if (!Array.isArray(value)) throw new Error("Google Sheets sync base must include rows");
  return value.map((row) => {
    if (!Array.isArray(row)) throw new Error("Google Sheets sync base rows must be arrays");
    return row.map((cell) => {
      if (typeof cell !== "string") throw new Error("Google Sheets sync base cells must be strings");
      return cell;
    });
  });
}
function markdownTableCell(value) {
  const escaped2 = value.replace(/&amp;#(9|32);/g, "&amp;amp;#$1;").replace(/&#(9|32);/g, "&amp;#$1;").replace(/&amp;lt;br&amp;gt;/g, "&amp;amp;lt;br&amp;amp;gt;").replace(/&lt;br&gt;/g, "&amp;lt;br&amp;gt;").replace(/<br>/g, "&lt;br&gt;").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  const text2 = escaped2.replace(/^[ \t]+|[ \t]+$/g, (match) => match.replace(/ /g, "&#32;").replace(/\t/g, "&#9;"));
  return text2 === "" ? " " : text2;
}
function rowsMarkdown(rows) {
  if (rows.length === 0) return "";
  const columnCount = Math.max(...rows.map((row) => row.length));
  const tableRows = rows.map((row) => Array.from({ length: columnCount }, (_value, index) => markdownTableCell(index < row.length ? row[index] : "")));
  return `${[
    `| ${tableRows[0].join(" | ")} |`,
    `| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`,
    ...tableRows.slice(1).map((row) => `| ${row.join(" | ")} |`)
  ].join("\n")}
`;
}
function markdownTableRow(line) {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  const cells = [];
  let cell = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\" && value[index + 1] === "|") {
      cell += "|";
      index += 1;
    } else if (char === "|") {
      cells.push(cell.trim().replace(/<br>/g, "\n").replace(/&lt;br&gt;/g, "<br>").replace(/&amp;lt;br&amp;gt;/g, "&lt;br&gt;").replace(/&amp;amp;lt;br&amp;amp;gt;/g, "&amp;lt;br&amp;gt;").replace(/&#32;/g, " ").replace(/&#9;/g, "	").replace(/&amp;#(9|32);/g, "&#$1;").replace(/&amp;amp;#(9|32);/g, "&amp;#$1;"));
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim().replace(/<br>/g, "\n").replace(/&lt;br&gt;/g, "<br>").replace(/&amp;lt;br&amp;gt;/g, "&lt;br&gt;").replace(/&amp;amp;lt;br&amp;amp;gt;/g, "&amp;lt;br&amp;gt;").replace(/&#32;/g, " ").replace(/&#9;/g, "	").replace(/&amp;#(9|32);/g, "&#$1;").replace(/&amp;amp;#(9|32);/g, "&amp;#$1;"));
  return cells.map((item) => item === "" ? "" : item);
}
function parseMarkdownTable(markdown) {
  if (markdown.trim() === "") return [];
  const lines = markdown.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("Google Sheets sync requires a Markdown table with a header row and separator row");
  const nonTableLine = lines.findIndex((line) => !line.includes("|"));
  if (nonTableLine !== -1) throw new Error(`Google Sheets sync requires a Markdown table: line ${nonTableLine + 1} is not a table row`);
  const separator = markdownTableRow(lines[1]);
  if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) throw new Error("Google Sheets sync requires a Markdown table separator row at line 2");
  const rows = [markdownTableRow(lines[0]), ...lines.slice(2).map(markdownTableRow)];
  const rowLengths = [rows[0], separator, ...rows.slice(1)];
  const invalidRow = rowLengths.findIndex((row) => row.length !== rows[0].length);
  if (invalidRow !== -1) throw new Error(`Google Sheets sync requires every Markdown table row to have ${rows[0].length} cells: line ${invalidRow + 1} has ${rowLengths[invalidRow].length}`);
  return rows;
}
function resourceKey(source) {
  const key2 = source["resource_key"];
  return typeof key2 === "string" && key2 !== "" ? key2 : null;
}
function sheetEditUrl(documentId, gid2, key2) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(documentId)}/edit`);
  if (gid2 !== null) url.searchParams.set("gid", gid2);
  if (key2 !== null) url.searchParams.set("resourcekey", key2);
  return url.toString();
}
function docEditUrl(documentId, key2, tab) {
  const url = new URL(`https://docs.google.com/document/d/${encodeURIComponent(documentId)}/edit`);
  url.searchParams.set("tab", tab);
  if (key2 !== null) url.searchParams.set("resourcekey", key2);
  return url.toString();
}
function documentTab(source) {
  const tab = source["document_tab"];
  return typeof tab === "string" && tab !== "" ? tab : null;
}
function decodeXml(value) {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_match, entity) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    if (entity === "amp") return "&";
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "quot") return '"';
    if (entity === "apos") return "'";
    throw new Error(`PPTX XML unknown entity: ${entity}`);
  });
}
function xmlTagEnd(xml, start) {
  let quote2 = null;
  for (let index = start + 1; index < xml.length; index += 1) {
    const char = xml[index];
    if (quote2 === null && char === ">") return index;
    if (quote2 === null && (char === '"' || char === "'")) quote2 = char;
    else if (quote2 === char) quote2 = null;
  }
  throw new Error("PPTX XML tag is unterminated");
}
function parseAttributes(value) {
  const attributes = /* @__PURE__ */ new Map();
  let index = 0;
  while (index < value.length) {
    while (index < value.length && /\s/.test(value[index])) index += 1;
    if (index >= value.length) break;
    const nameStart = index;
    while (index < value.length && !/[\s=]/.test(value[index])) index += 1;
    const name = value.slice(nameStart, index);
    while (index < value.length && /\s/.test(value[index])) index += 1;
    if (value[index] !== "=") throw new Error(`PPTX XML attribute ${name} is invalid`);
    index += 1;
    while (index < value.length && /\s/.test(value[index])) index += 1;
    const quote2 = value[index];
    if (quote2 !== '"' && quote2 !== "'") throw new Error(`PPTX XML attribute ${name} is unquoted`);
    index += 1;
    const textStart = index;
    while (index < value.length && value[index] !== quote2) index += 1;
    attributes.set(name, decodeXml(value.slice(textStart, index)));
    index += 1;
  }
  return attributes;
}
function parseXml(xml) {
  const root = { name: "#document", attributes: /* @__PURE__ */ new Map(), children: [] };
  const stack = [root];
  let index = 0;
  while (index < xml.length) {
    if (xml.startsWith("<?", index)) {
      index = xml.indexOf("?>", index) + 2;
    } else if (xml.startsWith("<!--", index)) {
      index = xml.indexOf("-->", index) + 3;
    } else if (xml.startsWith("<![CDATA[", index)) {
      const end = xml.indexOf("]]>", index);
      stack[stack.length - 1].children.push(xml.slice(index + 9, end));
      index = end + 3;
    } else if (xml.startsWith("</", index)) {
      const end = xmlTagEnd(xml, index);
      const name = xml.slice(index + 2, end).trim();
      const node = stack.pop();
      if (node.name !== name) throw new Error(`PPTX XML closing tag mismatch: ${name}`);
      stack[stack.length - 1].children.push(Object.freeze({ name: node.name, attributes: node.attributes, children: Object.freeze(node.children) }));
      index = end + 1;
    } else if (xml[index] === "<") {
      const end = xmlTagEnd(xml, index);
      const raw = xml.slice(index + 1, end).trim();
      const selfClosing = raw.endsWith("/");
      const tag = selfClosing ? raw.slice(0, -1).trimEnd() : raw;
      const nameEnd = tag.search(/\s/);
      const name = nameEnd === -1 ? tag : tag.slice(0, nameEnd);
      const attributes = parseAttributes(nameEnd === -1 ? "" : tag.slice(nameEnd + 1));
      if (selfClosing) stack[stack.length - 1].children.push(Object.freeze({ name, attributes, children: Object.freeze([]) }));
      else stack.push({ name, attributes, children: [] });
      index = end + 1;
    } else {
      const end = xml.indexOf("<", index);
      const text2 = decodeXml(xml.slice(index, end === -1 ? xml.length : end));
      if (text2 !== "") stack[stack.length - 1].children.push(text2);
      index = end === -1 ? xml.length : end;
    }
  }
  if (stack.length !== 1) throw new Error("PPTX XML document is unclosed");
  return Object.freeze({ name: root.name, attributes: root.attributes, children: Object.freeze(root.children) });
}
function isXmlNode(value) {
  return typeof value !== "string";
}
function xmlChildren(node, name) {
  return node.children.filter(isXmlNode).filter((child) => child.name === name);
}
function xmlDescendants(node, name) {
  return node.children.filter(isXmlNode).flatMap((child) => child.name === name ? [child, ...xmlDescendants(child, name)] : xmlDescendants(child, name));
}
function xmlText(node) {
  return node.children.map((child) => typeof child === "string" ? child : xmlText(child)).join("");
}
function xmlAttribute(node, name) {
  const value = node.attributes.get(name);
  if (value === void 0) throw new Error(`PPTX XML missing ${name}`);
  return value;
}
function zipEndOfCentralDirectory(bytes) {
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (bytes[index] === 80 && bytes[index + 1] === 75 && bytes[index + 2] === 5 && bytes[index + 3] === 6) return index;
  }
  throw new Error("PPTX ZIP missing central directory");
}
function unzipFiles(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = zipEndOfCentralDirectory(bytes);
  const totalEntries = view.getUint16(end + 10, true);
  let centralOffset = view.getUint32(end + 16, true);
  const files = /* @__PURE__ */ new Map();
  const decoder = new TextDecoder();
  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
    if (view.getUint32(centralOffset, true) !== 33639248) throw new Error("PPTX ZIP central directory entry is invalid");
    const method = view.getUint16(centralOffset + 10, true);
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const nameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const name = decoder.decode(bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength));
    if (view.getUint32(localOffset, true) !== 67324752) throw new Error("PPTX ZIP local file entry is invalid");
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) files.set(name, compressed);
    else if (method === 8) files.set(name, (0, import_node_zlib.inflateRawSync)(compressed));
    else throw new Error(`PPTX ZIP compression method is unsupported: ${method}`);
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
function zipText(files, name) {
  const bytes = files.get(name);
  if (bytes === void 0) throw new Error(`PPTX missing ${name}`);
  return new TextDecoder().decode(bytes);
}
function relationshipTargets(xml) {
  const relationships = /* @__PURE__ */ new Map();
  for (const relationship of xmlDescendants(parseXml(xml), "Relationship")) relationships.set(xmlAttribute(relationship, "Id"), xmlAttribute(relationship, "Target"));
  return relationships;
}
function resolvePartPath(basePath, target) {
  const parts = basePath.split("/");
  parts.pop();
  for (const segment of target.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== ".") parts.push(segment);
  }
  return parts.join("/");
}
function slidePartPaths(files) {
  const presentation = parseXml(zipText(files, "ppt/presentation.xml"));
  const relationships = relationshipTargets(zipText(files, "ppt/_rels/presentation.xml.rels"));
  const slides = xmlDescendants(presentation, "p:sldId");
  if (slides.length === 0) throw new Error("PPTX presentation has no slides");
  return slides.map((slide) => {
    const id = xmlAttribute(slide, "r:id");
    const target = relationships.get(id);
    if (target === void 0) throw new Error(`PPTX presentation missing slide relationship ${id}`);
    return resolvePartPath("ppt/presentation.xml", target);
  });
}
function slideRelationshipsPath(slidePath) {
  const parts = slidePath.split("/");
  const filename = parts.pop();
  if (filename === void 0) throw new Error("PPTX slide path is invalid");
  parts.push("_rels", `${filename}.rels`);
  return parts.join("/");
}
function markdownSpan(value, left, right) {
  const leading = /^[ \t]*/.exec(value)[0];
  const trailing = /[ \t]*$/.exec(value)[0];
  const core = value.slice(leading.length, value.length - trailing.length);
  return core === "" ? value : `${leading}${left}${core}${right}${trailing}`;
}
function linkMarkdown(value, target) {
  const leading = /^[ \t]*/.exec(value)[0];
  const trailing = /[ \t]*$/.exec(value)[0];
  const core = value.slice(leading.length, value.length - trailing.length);
  return core === "" ? value : `${leading}[${core.replace(/[[\]\\]/g, "\\$&")}](${target.replace(/\)/g, "%29")})${trailing}`;
}
function formattedRunMarkdown(run, relationships) {
  const text2 = xmlDescendants(run, "a:t").map(xmlText).join("");
  const runProperties = xmlChildren(run, "a:rPr")[0];
  if (runProperties === void 0) return text2;
  const hyperlink = xmlDescendants(runProperties, "a:hlinkClick")[0];
  let markdown = text2;
  if (runProperties.attributes.get("u") !== void 0 && runProperties.attributes.get("u") !== "none" && hyperlink === void 0) markdown = markdownSpan(markdown, "<u>", "</u>");
  if (runProperties.attributes.get("strike") !== void 0 && runProperties.attributes.get("strike") !== "noStrike") markdown = markdownSpan(markdown, "~~", "~~");
  if (runProperties.attributes.get("b") === "1" && runProperties.attributes.get("i") === "1") markdown = markdownSpan(markdown, "***", "***");
  else if (runProperties.attributes.get("b") === "1") markdown = markdownSpan(markdown, "**", "**");
  else if (runProperties.attributes.get("i") === "1") markdown = markdownSpan(markdown, "_", "_");
  if (hyperlink !== void 0) {
    const id = xmlAttribute(hyperlink, "r:id");
    const target = relationships.get(id);
    if (target === void 0) throw new Error(`PPTX slide missing hyperlink relationship ${id}`);
    markdown = linkMarkdown(markdown, target);
  }
  return markdown;
}
function paragraphMarkdown(paragraph, relationships) {
  const pPr = xmlChildren(paragraph, "a:pPr")[0];
  const list = pPr === void 0 || xmlChildren(pPr, "a:buNone").length !== 0 ? null : xmlChildren(pPr, "a:buAutoNum").length !== 0 ? "number" : xmlChildren(pPr, "a:buChar").length !== 0 ? "bullet" : null;
  const levelValue = pPr === void 0 ? void 0 : pPr.attributes.get("lvl");
  const level = levelValue === void 0 ? 0 : Number(levelValue);
  const pieces = [];
  for (const child of paragraph.children.filter(isXmlNode)) {
    if (child.name === "a:br") pieces.push("\n");
    if (child.name === "a:r" || child.name === "a:fld") pieces.push(formattedRunMarkdown(child, relationships));
  }
  return Object.freeze({ text: pieces.join("").replace(/[ \t]+$/gm, ""), list, level });
}
function slideMarkdown(slide, relationships) {
  const paragraphs = xmlDescendants(slide, "a:p").map((paragraph) => paragraphMarkdown(paragraph, relationships)).filter((paragraph) => paragraph.text.trim() !== "");
  const lines = paragraphs.map((paragraph, index) => {
    if (index === 0 && paragraph.list === null) return `## ${paragraph.text.trim()}`;
    if (paragraph.list === "bullet") return `${"  ".repeat(paragraph.level)}- ${paragraph.text.trim()}`;
    if (paragraph.list === "number") return `${"  ".repeat(paragraph.level)}1. ${paragraph.text.trim()}`;
    return paragraph.text.trim();
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
function slidesMarkdown(bytes) {
  const files = unzipFiles(bytes);
  const slides = slidePartPaths(files).map((slidePath) => {
    const slide = parseXml(zipText(files, slidePath));
    const relationships = relationshipTargets(zipText(files, slideRelationshipsPath(slidePath)));
    return slideMarkdown(slide, relationships);
  });
  return `${slides.join("\n\n---\n\n")}
`;
}
function urlParam(url, name) {
  const query = url.searchParams.get(name);
  const hash2 = new URLSearchParams(url.hash.slice(1)).get(name);
  return query !== null && query !== "" ? query : hash2 !== null && hash2 !== "" ? hash2 : null;
}
function sheetSession(html) {
  const tokenMatch = /"info_params":\{"token":"([^"]+)"/.exec(html);
  if (tokenMatch === null) throw cookieAuthenticationError();
  const token = tokenMatch[1];
  const start = html.indexOf("var bootstrapData = ");
  const end = html.indexOf("; function loadWaffle()", start);
  if (start === -1 || end === -1) throw new Error("Google Sheets editor did not include save metadata");
  const bootstrap = JSON.parse(html.slice(start + "var bootstrapData = ".length, end));
  const changesValue = bootstrap["changes"];
  if (changesValue === void 0) throw new Error("Google Sheets editor did not include save metadata");
  const changes = objectValue(changesValue);
  const revision = changes["revision"];
  const sid = changes["sid"];
  const gridId = bootstrap["gridId"];
  if (typeof revision !== "number" || typeof sid !== "string" || typeof gridId !== "number") throw new Error("Google Sheets editor did not include save metadata");
  return Object.freeze({ token, revision, sid, gridId: String(gridId) });
}
function changedCells(baseRows, localRows) {
  const rowCount = Math.max(baseRows.length, localRows.length);
  const cells = [];
  for (let row = 0; row < rowCount; row += 1) {
    const baseRow = baseRows[row] ?? [];
    const localRow = localRows[row] ?? [];
    const columnCount = Math.max(baseRow.length, localRow.length);
    for (let column = 0; column < columnCount; column += 1) {
      const value = localRow[column] ?? "";
      if ((baseRow[column] ?? "") !== value) cells.push(Object.freeze({ row, column, value }));
    }
  }
  return cells;
}
function sheetCellCommand(gridId, row, column, value) {
  return [21299578, JSON.stringify([[gridId, row, row + 1, column, column + 1], [132274236, 3, [2, value], null, null, 0], [null, [[null, 513, [0], null, null, null, null, null, null, null, null, 0]]]])];
}
function formulaLikeCell(value) {
  return value.startsWith("=") || value.startsWith("+") || value.startsWith("@") || /^-(?!\d+(?:\.\d+)?$)/.test(value);
}
async function uploadSheetRows(runtime2, documentId, gid2, key2, cells) {
  const session = sheetSession(await googleText(runtime2, sheetEditUrl(documentId, gid2, key2), "Sheets editor"));
  const bundles = [{ commands: cells.map((cell) => sheetCellCommand(session.gridId, cell.row, cell.column, cell.value)), sid: session.sid, reqId: 0 }];
  const body2 = new URLSearchParams({ rev: String(session.revision), bundles: JSON.stringify(bundles) });
  const response = await runtime2.http.request(`https://docs.google.com/spreadsheets/u/0/d/${encodeURIComponent(documentId)}/save?id=${encodeURIComponent(documentId)}&token=${encodeURIComponent(session.token)}`, { method: "POST", headers: { Cookie: await cookieHeader3(runtime2), "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: body2.toString() });
  if (response.status === 401 || response.status === 403) throw cookieAuthenticationError();
  if (!response.ok) throw new Error(`Google Sheets save failed: HTTP ${response.status}`);
  const text2 = await response.text();
  const result = saveResult(text2, "Sheets");
  if (result["revisionRanges"] === void 0) throw new Error("Google Sheets save failed: missing revision ranges");
}
function docSession(html) {
  const tokenMatch = /"info_params":\{"token":"([^"]+)"/.exec(html);
  if (tokenMatch === null) throw cookieAuthenticationError();
  const token = tokenMatch[1];
  const ouidMatch = /"ouid":"([^"]+)"/.exec(html);
  const revisionMatch = /DOCS_warmStartDocumentLoader\.startLoad\(\s*([0-9.]+)/.exec(html);
  if (ouidMatch === null || revisionMatch === null) throw new Error("Google Docs editor did not include save metadata");
  const ouid = ouidMatch[1];
  const revision = Number(revisionMatch[1]);
  const chunks = [];
  const pattern = /DOCS_modelChunk = (\{[\s\S]*?\}); DOCS_modelChunkLoadStart/g;
  let match = pattern.exec(html);
  while (match !== null) {
    const chunk = JSON.parse(match[1]);
    for (const command of chunk.chunk) if (command["ty"] === "is") chunks.push(command["s"]);
    match = pattern.exec(html);
  }
  return Object.freeze({ token, ouid, revision, text: chunks.join("") });
}
function markdownDocTable(value) {
  const lines = value.trimEnd().split(/\r?\n/);
  const separator = lines.findIndex((line) => markdownTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell)));
  if (separator === -1) return value;
  return `${lines.filter((_line, index) => index !== separator).flatMap((line) => markdownTableRow(line)).join("\n")}
`;
}
function markdownEntities(value) {
  return value.replace(/&(amp|lt|gt|quot|#39);/g, (_match, entity) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[entity]);
}
function markdownHtmlTags(value) {
  return value.replace(/<\/?(?:u|sup|sub|mark|span)(?:\s+[^>]*)?>/gi, "");
}
function markdownCombinedEmphasis(value) {
  return value.replace(/\*\*\*([^*\n]+)\*\*\*/g, "$1").replace(/(^|[^\w])___([^_\n]+?)___(?=[^\w]|$)/g, "$1$2").replace(/\*\*_([^_\n]+)_\*\*/g, "$1").replace(/__\*([^*\n]+)\*__/g, "$1").replace(/\*__([^_\n]+)__\*/g, "$1").replace(/_\*\*([^*\n]+)\*\*_/g, "$1");
}
function markdownText(value) {
  return markdownEntities(markdownHtmlTags(markdownCombinedEmphasis(value.replace(/[ \t]{2,}(?=\r?\n|$)/g, "").replace(/(?:^[ \t]*\|.*\|[ \t]*(?:\r?\n|$)){2,}/gm, markdownDocTable).replace(/^```[^\n]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm, "$1").replace(/^[ \t]*!\[[^\]\n]*\]\([^)]+\)[ \t]*(?:\r?\n)?/gm, "").replace(/^[ \t]{0,3}\[[^\]\n]+\]:[ \t]+[^\n]*(?:\r?\n)?/gm, "").replace(/^[ \t]{0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*(?:\r?\n)*/gm, "").replace(/[ \t]*!\[[^\]\n]*\]\([^)]+\)[ \t]*/g, " ").replace(/[ \t]*!\[[^\]\n]*\]\[[^\]\n]*\][ \t]*/g, " ").replace(/\\([\\`*_{}\[\]()#+\-.!|=~])/g, "$1").replace(/^[ \t]*>+[ \t]?/gm, "").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, "").replace(/^\[(?: |x|X)\][ \t]+/gm, "").replace(/`([^`\n]+)`/g, "$1").replace(/~~([^~\n]+)~~/g, "$1").replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/\*([^*\n]+)\*/g, "$1").replace(/(^|[^\w])__([^_\n]+?)__(?=[^\w]|$)/g, "$1$2").replace(/(^|[^\w])_([^_\n]+?)_(?=[^\w]|$)/g, "$1$2").replace(/^#+ /gm, "").replace(/<((?:https?|mailto):[^>\s]+)>/g, "$1").replace(/\[([^\]\n]+)\]\[[^\]\n]*\]/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"))));
}
function comparableDocMarkdown(value) {
  return markdownEntities(markdownHtmlTags(markdownCombinedEmphasis(value.replace(/[ \t]{2,}(?=\r?\n|$)/g, "").replace(/\\([\\`*_{}\[\]()#+\-.!|=~])/g, "$1").replace(/\s+$/g, ""))));
}
function docMarkdownEqual(left, right) {
  return comparableDocMarkdown(left) === comparableDocMarkdown(right);
}
function textEdit(base, local) {
  let start = 0;
  while (start < base.length && start < local.length && base[start] === local[start]) start += 1;
  for (let window2 = 80; window2 >= 10; window2 -= 10) {
    for (let baseEnd2 = start; baseEnd2 <= Math.min(base.length - window2, start + 2e3); baseEnd2 += 1) {
      const anchor = base.slice(baseEnd2, baseEnd2 + window2);
      const localEnd2 = local.indexOf(anchor, start);
      if (localEnd2 !== -1 && localEnd2 <= start + 2e3) return Object.freeze({ base: base.slice(start, baseEnd2), local: local.slice(start, localEnd2), before: base.slice(0, start), after: base.slice(baseEnd2) });
    }
  }
  let baseEnd = base.length;
  let localEnd = local.length;
  while (baseEnd > start && localEnd > start && base[baseEnd - 1] === local[localEnd - 1]) {
    baseEnd -= 1;
    localEnd -= 1;
  }
  return Object.freeze({ base: base.slice(start, baseEnd), local: local.slice(start, localEnd), before: base.slice(0, start), after: base.slice(baseEnd) });
}
function context(value, side, length) {
  return side === "before" ? value.slice(Math.max(0, value.length - length)) : value.slice(0, length);
}
function followingWhitespaceEnd(text2, index) {
  let end = index;
  while (end < text2.length && /\s/.test(text2[end])) end += 1;
  return end;
}
function docTextRange(text2, edit) {
  const base = markdownText(edit.base);
  const beforeText = markdownText(edit.before);
  const afterText = markdownText(edit.after);
  const candidates = [];
  if (base === "") {
    if (beforeText !== "") {
      const anchor = context(beforeText, "before", Math.min(80, beforeText.length));
      const trimmed = anchor.replace(/\s+$/g, "");
      let index = 0;
      for (; ; ) {
        const found = text2.indexOf(anchor, index);
        if (found === -1) break;
        candidates.push(found + anchor.length);
        index = found + 1;
      }
      if (trimmed !== anchor) {
        index = 0;
        for (; ; ) {
          const found = text2.indexOf(trimmed, index);
          if (found === -1) break;
          candidates.push(followingWhitespaceEnd(text2, found + trimmed.length));
          index = found + 1;
        }
      }
    }
    if (afterText === "") {
      candidates.push(text2.length);
    } else {
      const anchor = context(afterText, "after", Math.min(80, afterText.length));
      let index = 0;
      for (; ; ) {
        const found = text2.indexOf(anchor, index);
        if (found === -1) break;
        candidates.push(found);
        index = found + 1;
      }
    }
  } else {
    let index = 0;
    for (; ; ) {
      const found = text2.indexOf(base, index);
      if (found === -1) break;
      candidates.push(found);
      index = found + 1;
    }
  }
  const uniqueCandidates = [...new Set(candidates)];
  for (const length of [80, 40, 20, 10, 0]) {
    const before = context(beforeText, "before", length);
    const after = context(afterText, "after", length);
    const matched = uniqueCandidates.filter((index) => text2.slice(Math.max(0, index - before.length), index) === before && text2.slice(index + base.length, index + base.length + after.length) === after);
    if (matched.length === 1) return Object.freeze({ start: matched[0], end: matched[0] + base.length });
  }
  throw new Error("Google Docs local edit cannot be mapped to the live document text");
}
async function uploadDocText(runtime2, documentId, key2, tab, baseMarkdown, localMarkdown) {
  const edit = textEdit(baseMarkdown, localMarkdown);
  const editUrl = docEditUrl(documentId, key2, tab);
  const session = docSession(await googleText(runtime2, editUrl, "Docs editor"));
  const range = docTextRange(session.text, edit);
  const sid = runtime2.clock.now().getTime().toString(16).padStart(16, "0").slice(-16);
  const commands2 = [
    ...range.start === range.end ? [] : [{ ty: "ds", si: range.start + 1, ei: range.end }],
    ...edit.local === "" ? [] : [{ ty: "is", ibi: range.start + 1, s: markdownText(edit.local) }]
  ];
  const params = new URLSearchParams({ id: documentId, sid, vc: "1", c: "1", w: "1", flr: "0", smv: "2147483647", smb: "[2147483647, AAE=]", token: session.token, ouid: session.ouid, includes_info_params: "true", cros_files: "false", nded: "false", tab });
  const body2 = new URLSearchParams({ rev: String(session.revision), bundles: JSON.stringify([{ commands: commands2, sid, reqId: 0 }]) });
  const response = await runtime2.http.request(`https://docs.google.com/document/d/${encodeURIComponent(documentId)}/save?${params}`, { method: "POST", headers: { Cookie: await cookieHeader3(runtime2), "content-type": "application/x-www-form-urlencoded;charset=UTF-8", origin: "https://docs.google.com", referer: editUrl }, body: body2.toString() });
  if (response.status === 401 || response.status === 403) throw cookieAuthenticationError();
  if (!response.ok) throw new Error(`Google Docs save failed: HTTP ${response.status}`);
  const text2 = await response.text();
  const result = saveResult(text2, "Docs");
  if (result["revisionRanges"] === void 0) throw new Error("Google Docs save failed: missing revision ranges");
}
async function fetchGoogleDocument(runtime2, source) {
  const documentId = source["document_id"] ?? source.identifier;
  let sheetGid = null;
  let exportUrl;
  let label;
  if (source["sheet_gid"] !== void 0) {
    const gid2 = source["sheet_gid"];
    const query = new URLSearchParams({ format: "csv" });
    if (gid2 !== null) query.set("gid", gid2);
    const key2 = resourceKey(source);
    if (key2 !== null) query.set("resourcekey", key2);
    exportUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(documentId)}/export?${query}`;
    label = "Sheets CSV export";
    sheetGid = gid2;
  } else if (source.type === "presentation") {
    const query = new URLSearchParams({ format: "pptx" });
    const key2 = resourceKey(source);
    if (key2 !== null) query.set("resourcekey", key2);
    exportUrl = `https://docs.google.com/presentation/d/${encodeURIComponent(documentId)}/export?${query}`;
    label = "Slides PPTX export";
  } else {
    const query = new URLSearchParams({ format: "md" });
    const key2 = resourceKey(source);
    if (key2 !== null) query.set("resourcekey", key2);
    const tab2 = documentTab(source);
    if (tab2 !== null) query.set("tab", tab2);
    exportUrl = `https://docs.google.com/document/d/${encodeURIComponent(documentId)}/export?${query}`;
    label = "Docs Markdown export";
  }
  if (source.type === "presentation") {
    const exported2 = await googleExportBytes(runtime2, exportUrl, label);
    const markdown2 = slidesMarkdown(exported2.bytes);
    return Object.freeze({ title: exported2.title, markdown: markdown2, data: { document_id: documentId, title: exported2.title, output_path: null, sheet_gid: sheetGid, markdown: markdown2, rows: null, presentation: true } });
  }
  const exported = await googleExport(runtime2, exportUrl, label);
  const rows = source["sheet_gid"] === void 0 ? null : parseCsv(exported.text);
  const markdown = rows === null ? exported.text : rowsMarkdown(rows);
  const tab = source["sheet_gid"] === void 0 ? documentTab(source) : null;
  return Object.freeze({ title: exported.title, markdown, data: { document_id: documentId, title: exported.title, output_path: null, sheet_gid: sheetGid, markdown, rows, ...tab === null ? {} : { document_tab: tab } } });
}
async function synchronizeGoogleDocument(runtime2, _url, source, base, markdown) {
  const remote = await fetchGoogleDocument(runtime2, source);
  if (source.type === "presentation") {
    const baseMarkdown2 = objectValue(base)["markdown"];
    if (typeof baseMarkdown2 !== "string") throw new Error("Google sync base must include markdown");
    if (markdown === baseMarkdown2 || markdown === remote.markdown) return remote;
    if (remote.markdown === baseMarkdown2) throw new Error("Google Slides sync is download-only. Revert local edits or use `wire download <url>` for a fresh copy.");
    throw new Error("Google Slides changed remotely and locally. Resolve the conflict in Google Slides or the local Markdown file before syncing again.");
  }
  const baseMarkdown = objectValue(base)["markdown"];
  const label = source["sheet_gid"] === void 0 ? "Google Docs" : "Google Sheets";
  if (typeof baseMarkdown !== "string") throw new Error("Google sync base must include markdown");
  if (source["sheet_gid"] === void 0 && (docMarkdownEqual(markdown, baseMarkdown) || docMarkdownEqual(markdown, remote.markdown))) return remote;
  if (source["sheet_gid"] !== void 0 && (markdown === baseMarkdown || markdown === remote.markdown)) return remote;
  if (remote.markdown === baseMarkdown && source["sheet_gid"] !== void 0) {
    const baseRows = stringRows(objectValue(base)["rows"]);
    const localRows = parseMarkdownTable(markdown);
    const cells = changedCells(baseRows, localRows);
    if (cells.length === 0) return remote;
    const formula = cells.find((cell) => formulaLikeCell(cell.value));
    if (formula !== void 0) throw new Error(`Google Sheets sync cannot upload formula-like cell text at row ${formula.row + 1}, column ${formula.column + 1}
Prefix it with an apostrophe or rewrite it as plain text before syncing.`);
    await uploadSheetRows(runtime2, source["document_id"] ?? source.identifier, source["sheet_gid"], resourceKey(source), cells);
    const uploaded = await fetchGoogleDocument(runtime2, source);
    if (uploaded.markdown !== rowsMarkdown(localRows)) throw new Error("Google Sheets save verification failed");
    return uploaded;
  }
  if (source["sheet_gid"] === void 0 && docMarkdownEqual(remote.markdown, baseMarkdown)) {
    if (markdownText(markdown) === markdownText(baseMarkdown)) throw new Error("Google Docs sync cannot upload formatting-only Markdown edits");
    await uploadDocText(runtime2, source["document_id"] ?? source.identifier, resourceKey(source), documentTab(source) ?? "t.0", baseMarkdown, markdown);
    const uploaded = await fetchGoogleDocument(runtime2, source);
    if (!docMarkdownEqual(uploaded.markdown, markdown)) throw new Error("Google Docs save verification failed");
    return uploaded;
  }
  throw new Error(`${label} changed remotely and locally. Resolve the conflict in ${label} or the local Markdown file before syncing again.`);
}
var googleDocsService = defineService({
  name: "google-docs",
  matches: (url) => url.hostname === "docs.google.com" && /^\/(document|presentation|spreadsheets)(?:\/u\/\d+)?\/d\/[^/]+(?:\/.*)?$/.test(url.pathname),
  parse: (url) => {
    const match = /^\/(document|presentation|spreadsheets)(?:\/u\/\d+)?\/d\/([^/]+)(?:\/.*)?$/.exec(url.pathname);
    const documentId = match[2];
    const key2 = urlParam(url, "resourcekey");
    const resource_key = key2 === null || key2 === "" ? {} : { resource_key: key2 };
    if (match[1] === "presentation") return Object.freeze({ service: "google-docs", identifier: documentId, type: "presentation", ...resource_key });
    if (match[1] === "spreadsheets") {
      const queryGid = url.searchParams.get("gid");
      const hashGid = new URLSearchParams(url.hash.slice(1)).get("gid");
      const gid2 = /^\d+$/.test(hashGid ?? "") ? hashGid : /^\d+$/.test(queryGid ?? "") ? queryGid : null;
      return Object.freeze({ service: "google-docs", identifier: `${documentId}#gid=${gid2 ?? "default"}`, type: "spreadsheet", document_id: documentId, sheet_gid: gid2, ...resource_key });
    }
    const tab = urlParam(url, "tab");
    if (tab !== null && tab !== "" && tab !== "t.0") return Object.freeze({ service: "google-docs", identifier: `${documentId}#tab=${tab}`, type: "document", document_id: documentId, document_tab: tab, ...resource_key });
    return Object.freeze({ service: "google-docs", identifier: documentId, type: "document", ...resource_key });
  },
  fetch: (runtime2, _url, source) => fetchGoogleDocument(runtime2, source),
  synchronize: (runtime2, url, source, base, markdown) => synchronizeGoogleDocument(runtime2, url, source, base, markdown)
});

// packages/provider-google-docs/src/google-forms.ts
function formId(url) {
  return /^\/forms(?:\/u\/\d+)?\/d\/([^/]+)(?:\/.*)?$/.exec(url.pathname)[1];
}
function formUrl(id) {
  return `https://docs.google.com/forms/d/${encodeURIComponent(id)}/edit`;
}
function formsAuthError() {
  return new Error("Google Forms API authentication is missing or expired. Set GOOGLE_FORMS_TOKEN_FILE to an OAuth token with Forms scopes, then retry.");
}
function apiDisabledError(body2) {
  const error = body2["error"];
  if (error === void 0) return null;
  const details = Array.isArray(error["details"]) ? error["details"] : [];
  const serviceDisabled = details.find((detail) => {
    const metadata2 = detail["metadata"];
    return metadata2 !== void 0 && metadata2["service"] === "forms.googleapis.com";
  });
  if (serviceDisabled === void 0) return null;
  const metadata = serviceDisabled["metadata"];
  const activationUrl = typeof metadata["activationUrl"] === "string" ? metadata["activationUrl"] : typeof metadata["containerInfo"] === "string" ? `https://console.developers.google.com/apis/api/forms.googleapis.com/overview?project=${metadata["containerInfo"]}` : "https://console.developers.google.com/apis/api/forms.googleapis.com/overview";
  return new Error(`Google Forms API is disabled. Enable it at ${activationUrl} then retry.`);
}
async function formsJson(runtime2, url, label) {
  const token = await runtime2.googleFormsTokens.load();
  const response = await runtime2.http.request(url, { headers: { authorization: `Bearer ${token.token}` } });
  const text2 = await response.text();
  const body2 = text2 === "" ? {} : JSON.parse(text2);
  if (response.status === 401) throw formsAuthError();
  if (!response.ok) {
    const disabled = apiDisabledError(body2);
    if (disabled !== null) throw disabled;
    const error = body2["error"];
    const message = typeof error?.["message"] === "string" ? error["message"] : text2;
    if (response.status === 403 && /insufficient authentication scopes/i.test(message)) throw new Error("Google Forms API token is missing required scopes. Regenerate GOOGLE_FORMS_TOKEN_FILE with forms.body and forms.responses.readonly scopes.");
    throw new Error(`Google Forms API ${label} failed: HTTP ${response.status}${message === "" ? "" : ` ${message}`}`);
  }
  return body2;
}
function optionalString(value) {
  return typeof value === "string" && value !== "" ? value : null;
}
function jsonObject2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function optionsMarkdown(options) {
  if (!Array.isArray(options)) return null;
  return options.map((option) => {
    const object4 = option;
    return object4["value"];
  }).join(", ");
}
function questionMarkdown(item) {
  const lines = [`- ${item["title"]}`];
  const questionItem = item["questionItem"];
  if (questionItem === void 0) return lines;
  const question = questionItem["question"];
  lines.push(`  - itemId: ${item["itemId"]}`);
  lines.push(`  - questionId: ${question["questionId"]}`);
  if (question["required"] !== void 0) lines.push(`  - required: ${String(question["required"])}`);
  const textQuestion = question["textQuestion"];
  if (textQuestion !== void 0) lines.push(`  - type: ${textQuestion["paragraph"] === true ? "paragraph" : "short_text"}`);
  const choiceQuestion = question["choiceQuestion"];
  if (choiceQuestion !== void 0) {
    lines.push(`  - type: ${choiceQuestion["type"]}`);
    const options = optionsMarkdown(choiceQuestion["options"]);
    if (options !== null) lines.push(`  - options: ${options}`);
  }
  const scaleQuestion = question["scaleQuestion"];
  if (scaleQuestion !== void 0) {
    lines.push("  - type: scale");
    lines.push(`  - range: ${String(scaleQuestion["low"])} to ${String(scaleQuestion["high"])}`);
    const lowLabel = optionalString(scaleQuestion["lowLabel"]);
    const highLabel = optionalString(scaleQuestion["highLabel"]);
    if (lowLabel !== null) lines.push(`  - lowLabel: ${lowLabel}`);
    if (highLabel !== null) lines.push(`  - highLabel: ${highLabel}`);
  }
  if (question["dateQuestion"] !== void 0) lines.push("  - type: date");
  if (question["timeQuestion"] !== void 0) lines.push("  - type: time");
  const ratingQuestion = question["ratingQuestion"];
  if (ratingQuestion !== void 0) {
    lines.push("  - type: rating");
    lines.push(`  - level: ${String(ratingQuestion["ratingScaleLevel"])}`);
    lines.push(`  - icon: ${String(ratingQuestion["iconType"])}`);
  }
  if (question["fileUploadQuestion"] !== void 0) lines.push("  - type: file_upload");
  if (question["rowQuestion"] !== void 0) lines.push("  - type: row");
  return lines;
}
function answerTexts(answer) {
  const textAnswers = answer["textAnswers"];
  if (textAnswers !== void 0 && Array.isArray(textAnswers["answers"])) return textAnswers["answers"].map((value) => value["value"]);
  return [JSON.stringify(answer)];
}
function formAnswers(response) {
  const answers = response["answers"];
  if (answers === void 0) return [];
  return Object.entries(answers).flatMap(([questionId, answer]) => answerTexts(answer).map((text2) => ({ questionId, text: text2 })));
}
function formMarkdown(form, responses) {
  const info = form["info"];
  const title2 = info["title"];
  const id = form["formId"];
  const lines = [`# ${title2}`, "", `- Form ID: ${id}`, `- Edit: ${formUrl(id)}`];
  const responder = optionalString(form["responderUri"]);
  if (responder !== null) lines.push(`- Responder: ${responder}`);
  const publish = form["publishSettings"]?.["publishState"];
  if (publish !== void 0) {
    lines.push(`- Published: ${String(publish["isPublished"])}`);
    lines.push(`- Accepting responses: ${String(publish["isAcceptingResponses"])}`);
  }
  lines.push("", "## Items");
  const items = form["items"];
  if (items === void 0 || items.length === 0) lines.push("No items.");
  else for (const item of items) lines.push(...questionMarkdown(item));
  lines.push("", "## Responses", "", `Response count: ${responses.length}`);
  for (const response of responses) {
    lines.push("", `### ${response["responseId"]}`);
    const createTime = optionalString(response["createTime"]);
    const submitted = optionalString(response["lastSubmittedTime"]);
    if (createTime !== null) lines.push(`- Created: ${createTime}`);
    if (submitted !== null) lines.push(`- Submitted: ${submitted}`);
    for (const answer of formAnswers(response)) lines.push(`- ${answer.questionId}: ${answer.text}`);
  }
  return `${lines.join("\n")}
`;
}
async function allResponses(runtime2, id) {
  const responses = [];
  let pageToken;
  for (; ; ) {
    const url = new URL(`https://forms.googleapis.com/v1/forms/${encodeURIComponent(id)}/responses`);
    if (pageToken !== void 0) url.searchParams.set("pageToken", pageToken);
    const body2 = await formsJson(runtime2, url.toString(), "responses.list");
    if (Array.isArray(body2["responses"])) responses.push(...body2["responses"]);
    if (typeof body2["nextPageToken"] !== "string") break;
    pageToken = body2["nextPageToken"];
  }
  return responses;
}
async function fetchGoogleForm(runtime2, source) {
  const form = await formsJson(runtime2, `https://forms.googleapis.com/v1/forms/${encodeURIComponent(source.identifier)}`, "forms.get");
  const responses = await allResponses(runtime2, source.identifier);
  const info = form["info"];
  const markdown = formMarkdown(form, responses);
  return Object.freeze({
    title: info["title"],
    markdown,
    data: { form, responses, markdown }
  });
}
var googleFormsService = defineService({
  name: "google-forms",
  matches: (url) => url.hostname === "docs.google.com" && /^\/forms(?:\/u\/\d+)?\/d\/[^/]+(?:\/.*)?$/.test(url.pathname),
  parse: (url) => Object.freeze({ service: "google-forms", identifier: formId(url), type: "form" }),
  fetch: (runtime2, _url, source) => fetchGoogleForm(runtime2, source),
  synchronize: async (runtime2, _url, source, base, markdown) => {
    const baseMarkdown = jsonObject2(base) && typeof base["markdown"] === "string" ? base["markdown"] : null;
    if (baseMarkdown !== null && markdown !== baseMarkdown) throw new Error("Google Forms sync is download-only. Revert local edits or use `wire download <url>` for a fresh copy.");
    return fetchGoogleForm(runtime2, source);
  }
});

// packages/provider-google-docs/src/index.ts
var googleDocsProvider = Object.freeze({
  services: [googleFormsService, googleDocsService]
});

// packages/provider-notion/src/notion-sync.ts
var import_node_crypto3 = require("node:crypto");
function object3(value) {
  return value;
}
function array(value) {
  return value;
}
function text(value) {
  return value;
}
function notionAuthError() {
  return new Error("notion cookie authentication is missing or expired. Run `wire notion login` once; other commands reuse saved cookies.");
}
function richTextText(value) {
  return value.map((segment) => segment[0]).join("");
}
function titleRichText(value) {
  return value === "" ? [] : [[value]];
}
function pointer(id, spaceId) {
  return { table: "block", id, spaceId };
}
function formatBlockId(id) {
  return id.length === 32 ? `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}` : id;
}
function compact(value) {
  return stableJsonCompact(value);
}
function hash(value) {
  return `sha256:${(0, import_node_crypto3.createHash)("sha256").update(compact(value)).digest("hex")}`;
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function unescapeHtml(value) {
  return value.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function inlineCode(value) {
  const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
  const ticks = "`".repeat(longest + 1);
  return `${ticks}${value}${ticks}`;
}
function escapeInlineMarkdown(value) {
  return value.replace(/\\/g, "\\\\").replace(/\*/g, "\\*").replace(/~/g, "\\~").replace(/`/g, "\\`").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}
function unescapeInlineMarkdown(value) {
  return value.replace(/\\([\\*~[\]()])/g, "$1");
}
function escaped(value, index) {
  let count = 0;
  for (let position = index - 1; position >= 0 && value[position] === "\\"; position -= 1) count += 1;
  return count % 2 === 1;
}
function closingDelimiter(value, start, delimiter) {
  for (let index = start; index < value.length; index += 1) if (!escaped(value, index) && value.startsWith(delimiter, index)) return index;
  return -1;
}
function markdownLink(value) {
  if (!value.startsWith("[")) return null;
  const labelEnd = closingDelimiter(value, 1, "]");
  if (labelEnd === -1 || value[labelEnd + 1] !== "(") return null;
  let depth = 0;
  for (let index = labelEnd + 2; index < value.length; index += 1) {
    if (escaped(value, index)) continue;
    if (value[index] === "(") depth += 1;
    else if (value[index] === ")") {
      if (depth === 0) return { label: value.slice(1, labelEnd), url: value.slice(labelEnd + 2, index), length: index + 1 };
      depth -= 1;
    }
  }
  return null;
}
function normalizeMarks(marks) {
  return marks.filter((mark) => Array.isArray(mark) && mark.length > 0 && array(mark)[0] !== "m").map((mark) => clone(mark)).sort((left, right) => compact(left).localeCompare(compact(right)));
}
function normalizeRichText(value) {
  const output = [];
  for (const raw of value) {
    const content = text(raw[0]).replace(/\r\n?/g, "\n");
    if (content === "") continue;
    const marks = raw.length > 1 ? normalizeMarks(raw[1]) : [];
    if (marks.length > 0 && content.match(/^ +/) !== null) output.push([content.match(/^ +/)[0]]);
    const trimmedContent = marks.length === 0 ? content : content.replace(/^ +| +$/g, "");
    const segment = marks.length === 0 ? [trimmedContent] : [trimmedContent, marks];
    if (trimmedContent === "") continue;
    const previous = output[output.length - 1];
    if (previous !== void 0 && compact(previous[1] ?? []) === compact(segment[1] ?? [])) previous[0] = `${previous[0]}${trimmedContent}`;
    else output.push(segment);
    if (marks.length > 0 && content.match(/ +$/) !== null) output.push([content.match(/ +$/)[0]]);
  }
  while (output.length > 0 && text(output[0][0]).trim() === "") output.shift();
  while (output.length > 0 && text(output[output.length - 1][0]).trim() === "") output.pop();
  if (output.length > 0) output[0][0] = text(output[0][0]).replace(/^ +/, "");
  if (output.length > 0) output[output.length - 1][0] = text(output[output.length - 1][0]).replace(/ +$/, "");
  return output;
}
function parseInline(value) {
  const segments = [];
  let rest = value;
  const push2 = (content, marks = []) => {
    if (content !== "") segments.push(marks.length === 0 ? [content] : [content, marks]);
  };
  const pushMarked = (content, mark) => {
    for (const segment of parseInline(content)) {
      const marks = normalizeMarks([...segment[1] ?? [], mark]);
      push2(segment[0], marks);
    }
  };
  while (rest.length > 0) {
    if (rest.startsWith("\\")) {
      push2(rest.length === 1 ? "\\" : rest[1]);
      rest = rest.slice(rest.length === 1 ? 1 : 2);
      continue;
    }
    const link = markdownLink(rest);
    if (link !== null) {
      pushMarked(link.label, ["a", link.url]);
      rest = rest.slice(link.length);
      continue;
    }
    const dateSpan = /^<span data-notion-date="([^"]+)">(.*?)<\/span>/.exec(rest);
    if (dateSpan !== null) {
      pushMarked(dateSpan[2], ["d", JSON.parse(unescapeHtml(dateSpan[1]))]);
      rest = rest.slice(dateSpan[0].length);
      continue;
    }
    const equationSpan = /^<span data-notion-equation="([^"]+)">(.*?)<\/span>/.exec(rest);
    if (equationSpan !== null) {
      pushMarked(equationSpan[2], ["e", unescapeHtml(equationSpan[1])]);
      rest = rest.slice(equationSpan[0].length);
      continue;
    }
    const mentionSpan = /^<span data-notion-mention="([pu])" data-notion-id="([^"]+)"(?: data-notion-space-id="([^"]+)")?>(.*?)<\/span>/.exec(rest);
    if (mentionSpan !== null) {
      pushMarked(mentionSpan[4], mentionSpan[1] === "p" ? ["p", unescapeHtml(mentionSpan[2]), unescapeHtml(mentionSpan[3])] : ["u", unescapeHtml(mentionSpan[2])]);
      rest = rest.slice(mentionSpan[0].length);
      continue;
    }
    if (rest.startsWith("**")) {
      const end = closingDelimiter(rest, 2, "**");
      if (end !== -1) {
        pushMarked(rest.slice(2, end), ["b"]);
        rest = rest.slice(end + 2);
        continue;
      }
    }
    if (rest.startsWith("*")) {
      const end = closingDelimiter(rest, 1, "*");
      if (end !== -1) {
        pushMarked(rest.slice(1, end), ["i"]);
        rest = rest.slice(end + 1);
        continue;
      }
    }
    if (rest.startsWith("~~")) {
      const end = closingDelimiter(rest, 2, "~~");
      if (end !== -1) {
        pushMarked(rest.slice(2, end), ["s"]);
        rest = rest.slice(end + 2);
        continue;
      }
    }
    const patterns = [
      { match: /^`([^`]+)`/, mark: ["c"] },
      { match: /^<u>(.*?)<\/u>/, mark: ["_"] },
      { match: /^<span data-notion-color="([^"]+)">(.*?)<\/span>/, mark: null }
    ];
    let matched = false;
    for (const pattern of patterns) {
      const match = pattern.match.exec(rest);
      if (match === null) continue;
      if (pattern.mark !== null) {
        const mark = pattern.mark;
        push2(mark[0] === "c" ? match[1] : unescapeInlineMarkdown(match[1]), [pattern.mark]);
      } else push2(unescapeInlineMarkdown(match[2]), [["h", match[1]]]);
      rest = rest.slice(match[0].length);
      matched = true;
      break;
    }
    if (matched) continue;
    const next = rest.search(/(\\|\*\*|\*|~~|`|\[|<u>|<span data-notion-(?:color|date|equation|mention)=)/);
    if (next === -1) {
      push2(rest);
      rest = "";
    } else if (next === 0) {
      push2(rest[0]);
      rest = rest.slice(1);
    } else {
      push2(rest.slice(0, next));
      rest = rest.slice(next);
    }
  }
  return segments;
}
function renderSegment(content, marks) {
  let rendered = marks.some((raw) => raw[0] === "c") ? content : escapeInlineMarkdown(content);
  let link = null;
  for (const raw of marks) {
    const mark = raw;
    if (mark[0] === "c") rendered = inlineCode(rendered);
    else if (mark[0] === "s") rendered = `~~${rendered}~~`;
    else if (mark[0] === "i") rendered = `*${rendered}*`;
    else if (mark[0] === "b") rendered = `**${rendered}**`;
    else if (mark[0] === "a") link = mark[1];
    else if (mark[0] === "_") rendered = `<u>${rendered}</u>`;
    else if (mark[0] === "h") rendered = `<span data-notion-color="${escapeHtml(mark[1])}">${rendered}</span>`;
    else if (mark[0] === "e") rendered = `<span data-notion-equation="${escapeHtml(mark[1])}">${rendered}</span>`;
    else if (mark[0] === "p" || mark[0] === "u") rendered = `<span data-notion-mention="${mark[0]}" data-notion-id="${escapeHtml(mark[1])}"${mark[0] === "p" ? ` data-notion-space-id="${escapeHtml(mark[2])}"` : ""}>${rendered}</span>`;
    else if (mark[0] === "d") rendered = `<span data-notion-date="${escapeHtml(compact(mark[1]))}">${rendered}</span>`;
  }
  return link === null ? rendered : `[${rendered}](${link})`;
}
function renderRichText(value) {
  return normalizeRichText(value).map((segment) => renderSegment(text(segment[0]), segment[1] ?? [])).join("");
}
function renderUserMentions(markdownText2, mentions) {
  let output = markdownText2;
  for (const [userId, handle] of Object.entries(mentions)) {
    output = output.replace(new RegExp(`<span data-notion-mention="u" data-notion-id="${escapeRegExp(escapeHtml(userId))}">(.*?)</span>`, "g"), (_match, content) => content.replaceAll("\u2023", `@${handle}`));
  }
  return output;
}
function hydrateUserMentions(markdownText2, mentions) {
  let output = markdownText2;
  for (const [userId, handle] of Object.entries(mentions)) {
    output = output.replace(new RegExp(`(?<![A-Za-z0-9_])@${escapeRegExp(handle)}(?![A-Za-z0-9_])`, "g"), `<span data-notion-mention="u" data-notion-id="${escapeHtml(userId)}">\u2023</span>`);
  }
  return output;
}
function baseUserMentions(base) {
  return base["user_mentions"];
}
function notionData(pageId, markdown, tree, mentions) {
  return mentions === void 0 ? { page_id: pageId, markdown, blocks: sidecarBlocksFromNotionTree(tree) } : { page_id: pageId, markdown, blocks: sidecarBlocksFromNotionTree(tree), user_mentions: mentions };
}
function lineIndent(line) {
  return Math.floor(line.match(/^ */)[0].length / 2);
}
function stripIndent(line) {
  return line.replace(/^ +/, "");
}
function tableCellText(value) {
  return value.trim().replace(/(^|[^\\])<br>/g, "$1\n").replace(/\\<br>/g, "<br>");
}
function tableCells(line) {
  const raw = line.replace(/^\||\|$/g, "");
  const cells = [];
  let current = "";
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === "\\" && index + 1 < raw.length && ["\\", "|"].includes(raw[index + 1])) {
      current += raw[index + 1];
      index += 1;
    } else if (character === "|") {
      cells.push(tableCellText(current));
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(tableCellText(current));
  return cells;
}
function isTableSeparator(row) {
  return row.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}
function markdownBlockStart(stripped) {
  return /^(#{1,6})\s+|^[-*]\s+|^\d+\.\s+|^-\s+\[[ xX]\]\s+|^```|^---$|^!\[|^>|^\||^:::/.test(stripped);
}
function escapeBlockMarkdownLine(line) {
  return markdownBlockStart(line) ? `\\${line}` : line;
}
function colonFenceBody(lines, index) {
  const body2 = [];
  let depth = 0;
  while (true) {
    const stripped = stripIndent(lines[index]);
    if (stripped === ":::") {
      if (depth === 0) return { body: body2, index: index + 1 };
      depth -= 1;
    } else if (stripped.startsWith(":::") && !stripped.startsWith(":::checked ") && !stripped.startsWith(":::format ")) depth += 1;
    body2.push(lines[index]);
    index += 1;
  }
}
function listContinuation(lines, index, baseIndent, indent, firstLine) {
  const content = [firstLine];
  while (index < lines.length && lines[index].trim() !== "" && baseIndent + lineIndent(lines[index]) === indent + 1 && !markdownBlockStart(stripIndent(lines[index]))) {
    content.push(stripIndent(lines[index]));
    index += 1;
  }
  return { content: content.join("\n"), index };
}
function parseLines(lines, baseIndent = 0) {
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const indent = baseIndent + lineIndent(line);
    const stripped = stripIndent(line);
    const heading = /^(#{1,6})\s+(.+?)(?:\s+\{toggle\})?$/.exec(stripped);
    if (heading !== null) {
      if (heading[1].length > 3) throw new Error("lossless Markdown headings deeper than level 3 are not supported");
      const type = ["header", "sub_header", "sub_sub_header"][heading[1].length - 1];
      const properties = stripped.endsWith("{toggle}") ? { format: { toggleable: true } } : {};
      blocks.push({ type, content: heading[2].replace(/\s+\{toggle\}$/, ""), properties, rich_text: parseInline(heading[2].replace(/\s+\{toggle\}$/, "")), indent });
      index += 1;
      continue;
    }
    const list = /^([-*])\s+(.+)$/.exec(stripped);
    const numbered = /^\d+\.\s+(.+)$/.exec(stripped);
    const todo = /^-\s+\[([ xX])\]\s+(.+)$/.exec(stripped);
    if (todo !== null) {
      index += 1;
      const continued = listContinuation(lines, index, baseIndent, indent, todo[2]);
      index = continued.index;
      blocks.push({ type: "to_do", content: continued.content, properties: { checked: todo[1].toLowerCase() === "x" }, rich_text: parseInline(continued.content), indent });
      continue;
    }
    if (list !== null) {
      index += 1;
      const continued = listContinuation(lines, index, baseIndent, indent, list[2]);
      index = continued.index;
      blocks.push({ type: "bulleted_list", content: continued.content, properties: {}, rich_text: parseInline(continued.content), indent });
      continue;
    }
    if (numbered !== null) {
      index += 1;
      const continued = listContinuation(lines, index, baseIndent, indent, numbered[1]);
      index = continued.index;
      blocks.push({ type: "numbered_list", content: continued.content, properties: {}, rich_text: parseInline(continued.content), indent });
      continue;
    }
    if (stripped === "---") {
      blocks.push({ type: "divider", content: "", properties: {}, rich_text: [], indent });
      index += 1;
      continue;
    }
    const image = stripped.startsWith("![") ? markdownLink(stripped.slice(1)) : null;
    if (image !== null && image.length + 1 === stripped.length) {
      blocks.push({ type: "image", content: "", properties: { alt_text: unescapeInlineMarkdown(image.label), source: decodeURI(image.url) }, rich_text: [], indent });
      index += 1;
      continue;
    }
    const codeFence = /^(`{3,})(.*)$/.exec(stripped);
    if (codeFence !== null) {
      const fence = codeFence[1];
      const fenceIndent = line.match(/^ */)[0].length;
      const language = codeFence[2].trim();
      const body2 = [];
      index += 1;
      while (index < lines.length && !stripIndent(lines[index]).startsWith(fence)) {
        body2.push(lines[index].slice(fenceIndent));
        index += 1;
      }
      index += 1;
      blocks.push({ type: "code", content: body2.join("\n"), properties: { language: language === "" ? "Plain Text" : language }, rich_text: [], indent });
      continue;
    }
    if (stripped.startsWith("> ")) {
      const content2 = [stripped.slice(2)];
      index += 1;
      while (index < lines.length && lines[index].trim() !== "" && baseIndent + lineIndent(lines[index]) === indent && stripIndent(lines[index]).startsWith("> ")) {
        content2.push(stripIndent(lines[index]).slice(2));
        index += 1;
      }
      blocks.push({ type: "quote", content: content2.join("\n"), properties: {}, rich_text: parseInline(content2.join("\n")), indent });
      continue;
    }
    if (stripped.startsWith("|")) {
      const tableLines = [];
      while (index < lines.length && stripIndent(lines[index]).startsWith("|")) {
        tableLines.push(stripIndent(lines[index]));
        index += 1;
      }
      const rows = tableLines.map((row) => tableCells(row)).filter((row) => !isTableSeparator(row));
      const columnIds = rows[0].map((_, column) => `column_${column}`);
      blocks.push({ type: "table", content: "", properties: { column_ids: columnIds, has_header: true, has_row_header: false }, rich_text: [], indent });
      for (const row of rows) blocks.push({ type: "table_row", content: "", properties: { cells: Object.fromEntries(columnIds.map((column, columnIndex) => [column, parseInline(row[columnIndex] ?? "")])) }, rich_text: [], indent: indent + 1 });
      continue;
    }
    if (stripped === ":::to-do") {
      index += 1;
      const checked = /^:::checked (true|false)$/.exec(stripIndent(lines[index]));
      blocks.push({ type: "to_do", content: "", properties: { checked: checked[1] === "true" }, rich_text: [], indent });
      index += 1;
      const fenced = colonFenceBody(lines, index);
      index = fenced.index;
      blocks.push(...parseLines(fenced.body, baseIndent));
      continue;
    }
    if (stripped === ":::callout" || stripped === ":::toggle") {
      const type = stripped.slice(3);
      index += 1;
      const title2 = stripIndent(lines[index]);
      blocks.push({ type, content: title2, properties: {}, rich_text: parseInline(title2), indent });
      index += 1;
      const fenced = colonFenceBody(lines, index);
      index = fenced.index;
      blocks.push(...parseLines(fenced.body, baseIndent));
      continue;
    }
    if (stripped === ":::equation") {
      index += 1;
      const fenced = colonFenceBody(lines, index);
      index = fenced.index;
      const content2 = fenced.body.map((bodyLine) => stripIndent(bodyLine)).join("\n");
      blocks.push({ type: "equation", content: content2, properties: {}, rich_text: parseInline(content2), indent });
      continue;
    }
    if (stripped === ":::text") {
      index += 1;
      const fenced = colonFenceBody(lines, index);
      index = fenced.index;
      const content2 = fenced.body.map((bodyLine) => stripIndent(bodyLine)).join("\n");
      blocks.push({ type: "text", content: content2, properties: {}, rich_text: parseInline(content2), indent });
      continue;
    }
    if (stripped === ":::page") {
      index += 1;
      const title2 = stripIndent(lines[index]);
      blocks.push({ type: "page", content: title2, properties: {}, rich_text: parseInline(title2), indent });
      index += 1;
      const fenced = colonFenceBody(lines, index);
      index = fenced.index;
      blocks.push(...parseLines(fenced.body, baseIndent));
      continue;
    }
    if (stripped === ":::columns" || stripped === ":::synced") {
      const type = stripped === ":::columns" ? "column_list" : "transclusion_container";
      index += 1;
      blocks.push({ type, content: "", properties: {}, rich_text: [], indent });
      const fenced = colonFenceBody(lines, index);
      index = fenced.index;
      blocks.push(...parseLines(fenced.body, baseIndent));
      continue;
    }
    if (stripped === ":::column") {
      index += 1;
      const properties = {};
      if (index < lines.length && lineIndent(lines[index]) === lineIndent(line) && /^-?\d+(?:\.\d+)?$/.test(stripIndent(lines[index]))) {
        properties["format"] = { column_ratio: Number(stripIndent(lines[index])) };
        index += 1;
      }
      blocks.push({ type: "column", content: "", properties, rich_text: [], indent });
      const fenced = colonFenceBody(lines, index);
      index = fenced.index;
      blocks.push(...parseLines(fenced.body, baseIndent));
      continue;
    }
    if (stripped === ":::notion-format") {
      index += 1;
      const fenced = colonFenceBody(lines, index);
      index = fenced.index;
      blocks.push(...parseLines(fenced.body.slice(1), baseIndent));
      continue;
    }
    if (stripped === ":::notion-opaque") {
      index += 1;
      const fenced = colonFenceBody(lines, index);
      index = fenced.index;
      const snapshot = JSON.parse(fenced.body.map((bodyLine) => stripIndent(bodyLine)).join("\n"));
      blocks.push({ type: snapshot["type"], content: "", properties: { notion_opaque: snapshot }, rich_text: [], indent });
      continue;
    }
    const paragraph = [stripped];
    index += 1;
    while (index < lines.length && lines[index].trim() !== "" && !markdownBlockStart(stripIndent(lines[index]))) {
      paragraph.push(stripIndent(lines[index]));
      index += 1;
    }
    const content = paragraph.join("\n");
    blocks.push({ type: "text", content, properties: {}, rich_text: parseInline(content), indent });
  }
  return blocks;
}
function parseNotionMarkdown(markdown) {
  return parseLines(markdown.replace(/^\ufeff/, "").split("\n"));
}
function tableRowCells(block, columnOrder) {
  const cells = object3(block.properties["cells"]);
  if (columnOrder === void 0) return cells;
  const localColumns = Object.keys(cells);
  return Object.fromEntries(columnOrder.map((column, index) => [column, cells[localColumns[index]]]));
}
function parserBlockToNotionBlock(block, id, parentId, parentTable, spaceId, userId, currentTime, columnOrder) {
  const base = { id, type: block.type, space_id: spaceId, parent_id: parentId, parent_table: parentTable, alive: true, created_time: currentTime, created_by_table: "notion_user", created_by_id: userId, last_edited_time: currentTime, last_edited_by_table: "notion_user", last_edited_by_id: userId };
  if (block.properties["notion_opaque"] !== void 0) return { ...object3(block.properties["notion_opaque"]), ...base };
  if (block.type === "divider") return base;
  if (block.type === "toggle") return { ...base, type: "text", properties: { title: block.rich_text }, format: { toggleable: true } };
  if (block.type === "code") return { ...base, properties: { title: [[block.content]], language: [[block.properties["language"]]] } };
  if (block.type === "to_do") return { ...base, properties: { title: block.rich_text, checked: [[block.properties["checked"] === true ? "Yes" : "No"]] } };
  if (block.type === "image") return { ...base, properties: { source: [[block.properties["source"]]], alt_text: [[block.properties["alt_text"]]], ...block.properties["caption"] === void 0 ? {} : { caption: block.properties["caption"] } } };
  if (block.type === "table") return { ...base, properties: {}, format: { table_block_column_order: block.properties["column_ids"], table_block_column_header: block.properties["has_header"], table_block_row_header: block.properties["has_row_header"] } };
  if (block.type === "table_row") return { ...base, properties: tableRowCells(block, columnOrder) };
  if (block.type === "column_list" || block.type === "transclusion_container") return { ...base, properties: {} };
  if (block.type === "column") return { ...base, properties: {}, ...block.properties["format"] === void 0 ? {} : { format: block.properties["format"] } };
  if (block.type === "callout") return { ...base, properties: { title: block.rich_text }, ...block.properties["format"] === void 0 ? {} : { format: block.properties["format"] } };
  if (["header", "sub_header", "sub_sub_header"].includes(block.type)) return { ...base, properties: { title: block.rich_text }, ...block.properties["format"] === void 0 ? {} : { format: block.properties["format"] } };
  return { ...base, properties: { title: block.rich_text } };
}
function buildNotionCreateOperations(blocks, pageId, spaceId, userId, currentTime, createId = () => (0, import_node_crypto3.randomUUID)(), initialTableColumnOrder) {
  const operations = [];
  const topLevelIds = [];
  const lastAtIndent = /* @__PURE__ */ new Map();
  const lastChildByParent = /* @__PURE__ */ new Map();
  let lastTableId = null;
  let tableColumnOrder = initialTableColumnOrder;
  for (const block of blocks) {
    const blockId = formatBlockId(createId().replaceAll("-", ""));
    let parentId = pageId;
    if (block.type === "table_row") parentId = lastTableId;
    else if (block.indent > 0) {
      const parent = lastAtIndent.get(block.indent - 1);
      if (parent === void 0) throw new Error(`Indented Notion Markdown block has no parent at indent ${block.indent - 1}`);
      parentId = parent;
    }
    if (block.type !== "table_row" && block.indent === 0) topLevelIds.push(blockId);
    const parentTable = "block";
    operations.push({ pointer: pointer(blockId, spaceId), path: [], command: "set", args: parserBlockToNotionBlock(block, blockId, parentId, parentTable, spaceId, userId, currentTime, block.type === "table_row" ? tableColumnOrder : void 0) });
    const after = lastChildByParent.get(parentId);
    operations.push({ pointer: pointer(parentId, spaceId), path: ["content"], command: after === void 0 ? "listBefore" : "listAfter", args: after === void 0 ? { id: blockId } : { id: blockId, after } });
    lastChildByParent.set(parentId, blockId);
    if (["bulleted_list", "numbered_list", "to_do", "quote", "callout", "toggle", "header", "sub_header", "sub_sub_header", "table", "page", "column_list", "column", "transclusion_container"].includes(block.type)) lastAtIndent.set(block.indent, blockId);
    if (block.type === "table") {
      lastTableId = blockId;
      tableColumnOrder = block.properties["column_ids"];
    }
  }
  if (operations.length > 0) operations.push({ pointer: pointer(pageId, spaceId), path: ["last_edited_time"], command: "set", args: currentTime });
  return { operations, topLevelIds };
}
function canonicalBlock(value, columnOrder) {
  const type = value["type"];
  if (type === "text" && object3(value["format"] ?? {})["toggleable"] === true) return { type: "toggle", title: normalizeRichText(object3(value["properties"])["title"]) };
  if (type === "code") return { type, title: normalizeRichText(object3(value["properties"])["title"]), language: object3(value["properties"])["language"] };
  if (type === "to_do") return { type, title: normalizeRichText(object3(value["properties"])["title"]), checked: object3(value["properties"])["checked"] ?? [["No"]] };
  if (type === "table") return { type, column_count: object3(value["format"])["table_block_column_order"].length };
  if (type === "table_row") return { type, cells: columnOrder.map((column) => normalizeRichText(object3(value["properties"])[column])) };
  if (type === "image") return { type, source: object3(value["properties"])["source"], alt_text: object3(value["properties"])["alt_text"], caption: object3(value["properties"])["caption"] ?? null };
  if (["divider", "column_list", "transclusion_container"].includes(type)) return { type };
  if (type === "column") return { type, column_ratio: object3(value["format"] ?? {})["column_ratio"] ?? null };
  if (["header", "sub_header", "sub_sub_header"].includes(type)) return { type, title: normalizeRichText(object3(value["properties"] ?? { title: [] })["title"] ?? []), toggleable: object3(value["format"] ?? {})["toggleable"] === true };
  return { type, title: normalizeRichText(object3(value["properties"] ?? { title: [] })["title"] ?? []) };
}
function canonicalParserBlock(block, columnOrder) {
  if (block.properties["notion_opaque"] !== void 0) return canonicalBlock(object3(block.properties["notion_opaque"]), columnOrder);
  if (block.type === "header" || block.type === "sub_header" || block.type === "sub_sub_header") return { type: block.type, title: normalizeRichText(block.rich_text), toggleable: object3(block.properties["format"] ?? {})["toggleable"] === true };
  if (block.type === "text" || block.type === "bulleted_list" || block.type === "numbered_list" || block.type === "quote" || block.type === "callout" || block.type === "toggle") return { type: block.type, title: normalizeRichText(block.rich_text) };
  if (block.type === "code") return { type: "code", title: normalizeRichText([[block.content]]), language: [[block.properties["language"]]] };
  if (block.type === "to_do") return { type: "to_do", title: normalizeRichText(block.rich_text), checked: [[block.properties["checked"] === true ? "Yes" : "No"]] };
  if (block.type === "table") return { type: "table", column_count: block.properties["column_ids"].length };
  if (block.type === "table_row") {
    const cells = tableRowCells(block, columnOrder);
    return { type: "table_row", cells: columnOrder.map((column) => normalizeRichText(cells[column])) };
  }
  if (block.type === "image") return { type: "image", source: [[block.properties["source"]]], alt_text: [[block.properties["alt_text"]]], caption: block.properties["caption"] ?? null };
  if (block.type === "column") return { type: "column", column_ratio: object3(block.properties["format"] ?? {})["column_ratio"] ?? null };
  if (block.type === "column_list" || block.type === "transclusion_container") return { type: block.type };
  return { type: block.type };
}
function notionBlockContentHash(block, columnOrder) {
  return hash("rich_text" in block ? canonicalParserBlock(block, columnOrder) : canonicalBlock(block, columnOrder));
}
function sidecarBlocksFromNotionTree(tree) {
  const blocks = [];
  const walk = (node, path, columnOrder) => {
    const type = node.block["type"];
    const nextColumnOrder = type === "table" ? object3(node.block["format"])["table_block_column_order"] : columnOrder;
    blocks.push({ id: node.id, path, type, hash: notionBlockContentHash(node.block, columnOrder), snapshot: canonicalBlock(node.block, columnOrder) });
    node.children.forEach((child, index) => walk(child, [...path, index], nextColumnOrder));
  };
  walk(tree, []);
  return blocks;
}
function localTree(blocks) {
  const roots = [];
  const stack = [{ indent: -1, children: roots }];
  for (const block of blocks) {
    const node = { block, children: [] };
    while (stack[stack.length - 1].indent >= block.indent) stack.pop();
    stack[stack.length - 1].children.push(node);
    if (["bulleted_list", "numbered_list", "to_do", "quote", "callout", "toggle", "header", "sub_header", "sub_sub_header", "table", "page", "column_list", "column", "transclusion_container"].includes(block.type)) stack.push({ indent: block.indent, children: node.children });
  }
  return roots;
}
function outputNode(node, remoteNode, parentId, remote, currentTime, columnOrder) {
  const id = remoteNode?.id ?? formatBlockId((0, import_node_crypto3.randomUUID)().replaceAll("-", ""));
  const block = parserBlockToNotionBlock(node.block, id, parentId, "block", remote.spaceId, remote.userId, currentTime, node.block.type === "table_row" ? columnOrder : void 0);
  const nextColumnOrder = block["type"] === "table" ? object3(block["format"])["table_block_column_order"] : columnOrder;
  return { id, block, children: node.children.map((child, index) => outputNode(child, remoteNode?.children[index], id, remote, currentTime, nextColumnOrder)) };
}
function emitUpdates(remote, local, blockId, spaceId, columnOrder) {
  const operations = [];
  const remoteType = remote["type"] === "text" && object3(remote["format"] ?? {})["toggleable"] === true ? "toggle" : remote["type"];
  const localType = local.type === "toggle" ? "text" : local.type;
  const typeChanged = remoteType !== local.type;
  if (typeChanged) operations.push({ pointer: pointer(blockId, spaceId), path: ["type"], command: "set", args: localType });
  const args = parserBlockToNotionBlock(local, blockId, remote["parent_id"] ?? "", "block", spaceId, "", 0, local.type === "table_row" ? columnOrder : void 0);
  const remoteProperties = object3(remote["properties"] ?? {});
  const nextProperties = object3(args["properties"] ?? {});
  if (typeChanged) {
    if (compact(remoteProperties) !== compact(nextProperties)) operations.push({ pointer: pointer(blockId, spaceId), path: ["properties"], command: "set", args: nextProperties });
  } else {
    for (const key2 of Object.keys(nextProperties)) if (compact(remoteProperties[key2] ?? null) !== compact(nextProperties[key2])) operations.push({ pointer: pointer(blockId, spaceId), path: ["properties", key2], command: "set", args: nextProperties[key2] });
  }
  const nextFormat = object3(args["format"] ?? {});
  if ((typeChanged || args["format"] !== void 0 || remote["format"] !== void 0) && compact(remote["format"] ?? {}) !== compact(nextFormat)) operations.push({ pointer: pointer(blockId, spaceId), path: ["format"], command: "set", args: nextFormat });
  return operations;
}
function flattenLocalSubtree(node) {
  const blocks = [];
  const walk = (value, indent) => {
    blocks.push({ ...value.block, indent });
    for (const child of value.children) walk(child, indent + 1);
  };
  walk(node, 0);
  return blocks;
}
function buildNotionCreateSubtreeOperations(node, parentId, ambient, columnOrder) {
  return buildNotionCreateOperations(flattenLocalSubtree(node), parentId, ambient.spaceId, ambient.userId, ambient.currentTime, void 0, columnOrder);
}
function positionRootCreateOperations(operations, parentId, spaceId, previousId) {
  return operations.map((operation) => {
    if (operation.pointer["id"] === parentId && operation.pointer["spaceId"] === spaceId && operation.path.length === 1 && operation.path[0] === "content") return { ...operation, command: previousId === void 0 ? "listBefore" : "listAfter", args: previousId === void 0 ? { id: object3(operation.args)["id"] } : { id: object3(operation.args)["id"], after: previousId } };
    return operation;
  });
}
function localSubtreeSize(node) {
  return 1 + node.children.reduce((total, child) => total + localSubtreeSize(child), 0);
}
function remoteSubtreeSize(node) {
  return 1 + node.children.reduce((total, child) => total + remoteSubtreeSize(child), 0);
}
function deleteRemoteSubtreeOperations(node, parentId, spaceId) {
  return [
    ...node.children.flatMap((child) => deleteRemoteSubtreeOperations(child, node.id, spaceId)),
    { pointer: pointer(node.id, spaceId), path: ["alive"], command: "set", args: false },
    { pointer: pointer(parentId, spaceId), path: ["content"], command: "listRemove", args: { id: node.id } }
  ];
}
function diffNotionChildLists(remoteParent, localChildren, ambient, summary, columnOrder) {
  const operations = [];
  const remoteChildren = [...remoteParent.children];
  const nextColumnOrder = remoteParent.block["type"] === "table" ? object3(remoteParent.block["format"])["table_block_column_order"] : columnOrder;
  const remoteHash = (index) => notionBlockContentHash(remoteChildren[index].block, nextColumnOrder);
  const localHash = (index) => notionBlockContentHash(localChildren[index].block, nextColumnOrder);
  let remoteIndex = 0;
  let localIndex = 0;
  let previousId;
  while (remoteIndex < remoteChildren.length && localIndex < localChildren.length) {
    const remoteNode = remoteChildren[remoteIndex];
    const localNode = localChildren[localIndex];
    if (remoteHash(remoteIndex) === localHash(localIndex)) {
      operations.push(...diffNotionChildLists(remoteNode, localNode.children, ambient, summary, nextColumnOrder));
      previousId = remoteNode.id;
      remoteIndex += 1;
      localIndex += 1;
      continue;
    }
    const remoteNodeAppearsLaterLocally = localChildren.some((child, index) => index > localIndex && notionBlockContentHash(child.block, nextColumnOrder) === remoteHash(remoteIndex));
    const movedRemoteIndex = remoteNodeAppearsLaterLocally ? remoteChildren.findIndex((child, index) => index > remoteIndex && notionBlockContentHash(child.block, nextColumnOrder) === localHash(localIndex)) : -1;
    if (movedRemoteIndex !== -1) {
      const moved = remoteChildren[movedRemoteIndex];
      operations.push({ pointer: pointer(remoteParent.id, ambient.spaceId), path: ["content"], command: previousId === void 0 ? "listBefore" : "listAfter", args: previousId === void 0 ? { id: moved.id } : { id: moved.id, after: previousId } });
      remoteChildren.splice(movedRemoteIndex, 1);
      remoteChildren.splice(remoteIndex, 0, moved);
      summary.moved += 1;
      continue;
    }
    if (localIndex + 1 < localChildren.length && remoteHash(remoteIndex) === localHash(localIndex + 1)) {
      const built = buildNotionCreateSubtreeOperations(localNode, remoteParent.id, ambient, nextColumnOrder);
      operations.push(...positionRootCreateOperations(built.operations, remoteParent.id, ambient.spaceId, previousId));
      summary.inserted += localSubtreeSize(localNode);
      previousId = built.topLevelIds[0];
      localIndex += 1;
      continue;
    }
    if (remoteIndex + 1 < remoteChildren.length && remoteHash(remoteIndex + 1) === localHash(localIndex)) {
      operations.push(...deleteRemoteSubtreeOperations(remoteNode, remoteParent.id, ambient.spaceId));
      summary.deleted += remoteSubtreeSize(remoteNode);
      remoteIndex += 1;
      continue;
    }
    const before = operations.length;
    operations.push(...emitUpdates(remoteNode.block, localNode.block, remoteNode.id, ambient.spaceId, nextColumnOrder));
    operations.push(...diffNotionChildLists(remoteNode, localNode.children, ambient, summary, nextColumnOrder));
    if (operations.length > before) summary.updated += 1;
    previousId = remoteNode.id;
    remoteIndex += 1;
    localIndex += 1;
  }
  while (localIndex < localChildren.length) {
    const localNode = localChildren[localIndex];
    const built = buildNotionCreateSubtreeOperations(localNode, remoteParent.id, ambient, nextColumnOrder);
    operations.push(...positionRootCreateOperations(built.operations, remoteParent.id, ambient.spaceId, previousId ?? remoteChildren[remoteChildren.length - 1]?.id));
    summary.inserted += localSubtreeSize(localNode);
    previousId = built.topLevelIds[0];
    localIndex += 1;
  }
  while (remoteIndex < remoteChildren.length) {
    const child = remoteChildren[remoteIndex];
    operations.push(...deleteRemoteSubtreeOperations(child, remoteParent.id, ambient.spaceId));
    summary.deleted += remoteSubtreeSize(child);
    remoteIndex += 1;
  }
  return operations;
}
function diffNotionBlockTrees(remoteTree, localBlocks, _sidecarBlocks, ambient) {
  const summary = { inserted: 0, updated: 0, deleted: 0, moved: 0 };
  const locals = localTree(localBlocks);
  const operations = diffNotionChildLists(remoteTree, locals, ambient, summary);
  if (operations.length > 0 && !operations.some((operation) => operation.path.length === 1 && operation.path[0] === "last_edited_time")) operations.push({ pointer: pointer(remoteTree.id, ambient.spaceId), path: ["last_edited_time"], command: "set", args: ambient.currentTime });
  return { operations, summary };
}
function renderNode(tree, indent, parentType = "") {
  const prefix = "  ".repeat(indent);
  const type = tree.block["type"] === "text" && object3(tree.block["format"] ?? {})["toggleable"] === true ? "toggle" : tree.block["type"];
  const properties = object3(tree.block["properties"] ?? {});
  const title2 = properties["title"] === void 0 ? "" : renderRichText(properties["title"]);
  const format = object3(tree.block["format"] ?? {});
  if (["header", "sub_header", "sub_sub_header"].includes(type)) {
    const marker = type === "header" ? "#" : type === "sub_header" ? "##" : "###";
    return [`${prefix}${marker} ${title2}${format["toggleable"] === true ? " {toggle}" : ""}`, ...tree.children.flatMap((child) => renderNode(child, indent + 1, type))];
  }
  if (type === "bulleted_list") {
    const lines = title2.split("\n");
    return [`${prefix}- ${lines[0]}`, ...lines.slice(1).map((line) => `${prefix}  ${escapeBlockMarkdownLine(line)}`), ...tree.children.flatMap((child) => renderNode(child, indent + 1, type))];
  }
  if (type === "numbered_list") {
    const lines = title2.split("\n");
    return [`${prefix}1. ${lines[0]}`, ...lines.slice(1).map((line) => `${prefix}   ${escapeBlockMarkdownLine(line)}`), ...tree.children.flatMap((child) => renderNode(child, indent + 1, type))];
  }
  if (type === "to_do") {
    const checked = richTextText(properties["checked"] ?? [["No"]]) === "Yes";
    if (title2 === "") return [`${prefix}:::to-do`, `${prefix}:::checked ${JSON.stringify(checked)}`, prefix, ...tree.children.flatMap((child) => renderNode(child, indent + 1, type)), `${prefix}:::`];
    const lines = title2.split("\n");
    return [`${prefix}- [${checked ? "x" : " "}] ${lines[0]}`, ...lines.slice(1).map((line) => `${prefix}  ${escapeBlockMarkdownLine(line)}`), ...tree.children.flatMap((child) => renderNode(child, indent + 1, type))];
  }
  if (type === "quote") return [...title2.split("\n").map((line) => `${prefix}> ${escapeBlockMarkdownLine(line)}`), ...tree.children.flatMap((child) => renderNode(child, indent + 1, type))];
  if (type === "divider") return [`${prefix}---`];
  if (type === "code") {
    const code = richTextText(properties["title"]);
    const longest = Math.max(0, ...[...code.matchAll(/`+/g)].map((match) => match[0].length));
    const fence = "`".repeat(Math.max(3, longest + 1));
    const language = richTextText(properties["language"]).replace("Plain Text", "");
    return [`${prefix}${fence}${language}`, ...code.split("\n").map((line) => `${prefix}${line}`), `${prefix}${fence}`];
  }
  if (type === "image") return [`${prefix}![${escapeInlineMarkdown(richTextText(properties["alt_text"]))}](${encodeURI(richTextText(properties["source"]))})`];
  if (type === "equation") return [`${prefix}:::equation`, ...title2.split("\n").map((line) => `${prefix}${line}`), `${prefix}:::`];
  if (type === "page") return [`${prefix}:::page`, `${prefix}${title2}`, ...tree.children.flatMap((child) => renderNode(child, indent + 1, type)), `${prefix}:::`];
  if (type === "column_list") return [`${prefix}:::columns`, ...tree.children.flatMap((child) => renderNode(child, indent + 1, type)), `${prefix}:::`];
  if (type === "column") return [`${prefix}:::column`, ...format["column_ratio"] === void 0 ? [] : [`${prefix}${format["column_ratio"]}`], ...tree.children.flatMap((child) => renderNode(child, indent + 1, type)), `${prefix}:::`];
  if (type === "transclusion_container") return [`${prefix}:::synced`, ...tree.children.flatMap((child) => renderNode(child, indent + 1, type)), `${prefix}:::`];
  if (type === "callout" || type === "toggle") return [`${prefix}:::${type}`, `${prefix}${title2}`, ...tree.children.flatMap((child) => renderNode(child, indent + 1, type)), `${prefix}:::`];
  if (type === "table") {
    const columns = object3(tree.block["format"])["table_block_column_order"];
    const rows = tree.children.map((child) => columns.map((column) => renderRichText(object3(child.block["properties"])[column]).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/<br>/g, "\\<br>").replace(/\n/g, "<br>")));
    return rows.flatMap((row, index) => index === 0 ? [`${prefix}| ${row.join(" | ")} |`, `${prefix}| ${columns.map(() => "---").join(" | ")} |`] : [`${prefix}| ${row.join(" | ")} |`]);
  }
  if (type !== "text") {
    const opaque = [`${prefix}:::notion-opaque`, ...stableJsonPretty(tree.block).split("\n").map((line) => `${prefix}${line}`), `${prefix}:::`];
    if (tree.block["format"] !== void 0) return [`${prefix}:::notion-format`, `${prefix}:::format ${compact(tree.block["format"])}`, ...opaque, `${prefix}:::`];
    return opaque;
  }
  if (title2 === "") return [`${prefix}:::text`, `${prefix}:::`];
  if (["bulleted_list", "numbered_list", "to_do"].includes(parentType)) return [`${prefix}:::text`, ...title2.split("\n").map((line) => `${prefix}${line}`), `${prefix}:::`];
  return title2.split("\n").map((line) => `${prefix}${escapeBlockMarkdownLine(line)}`);
}
function renderNotionTreeToMarkdown(tree, mentions) {
  const title2 = renderRichText(object3(tree.block["properties"])["title"]);
  const compactTypes = /* @__PURE__ */ new Set(["bulleted_list", "numbered_list", "to_do"]);
  const body2 = tree.children.flatMap((child, index) => [
    ...index === 0 || tree.children[index - 1].block["type"] === child.block["type"] && compactTypes.has(child.block["type"]) ? [] : [""],
    ...renderNode(child, 0)
  ]);
  const markdown = [`# ${title2}`, ...body2.length === 0 ? [] : ["", ...body2]].join("\n").trim();
  return mentions === void 0 ? markdown : renderUserMentions(markdown, mentions);
}
async function notionPost(runtime2, path, cookie, body2, headers2) {
  const response = await runtime2.http.request(`https://www.notion.so/api/v3/${path}`, { method: "POST", headers: { cookie, "content-type": "application/json", ...headers2 }, body: JSON.stringify(body2) });
  if (!response.ok) throw new Error(`POST ${path} failed: ${response.status} ${await response.text()}`);
  return await response.json();
}
async function fetchTree(runtime2, url, source) {
  const cookies = await runtime2.cookies.loadSaved("notion");
  if (cookies === null) throw notionAuthError();
  const cookie = cookies.map((value) => `${value.name}=${value.value}`).join("; ");
  const userId = cookies.find((value) => value.name === "notion_user_id").value;
  const csrf = cookies.find((value) => value.name === "csrf")?.value;
  await runtime2.http.request(url, { headers: { cookie } });
  const spaces = await notionPost(runtime2, "getSpaces", cookie, {}, {});
  const spaceView = object3(object3(spaces[userId])["space_view"]);
  const initialSpaceId = object3(spaceView[Object.keys(spaceView)[0]])["spaceId"];
  const pageId = formatBlockId(source.identifier);
  let headers2 = { "x-notion-active-user-header": userId, "x-notion-space-id": initialSpaceId, referer: url, ...csrf === void 0 ? {} : { "x-csrf-token": csrf } };
  const blocks = /* @__PURE__ */ new Map();
  let stack = [];
  let chunkNumber = 0;
  do {
    const data = await notionPost(runtime2, "loadCachedPageChunkV2", cookie, { page: { id: pageId }, limit: 100, cursor: { stack }, chunkNumber, verticalColumns: false }, headers2);
    for (const [blockId, wrapper] of Object.entries(object3(object3(data["recordMap"])["block"]))) blocks.set(blockId, object3(object3(object3(wrapper)["value"])["value"]));
    const cursors = data["cursors"];
    stack = cursors.length === 0 ? [] : cursors[0]["stack"];
    chunkNumber += 1;
  } while (stack.length > 0);
  const spaceId = blocks.get(pageId)["space_id"];
  headers2 = { ...headers2, "x-notion-space-id": spaceId };
  while (true) {
    const missing = /* @__PURE__ */ new Set();
    const pending = [pageId];
    const visited = /* @__PURE__ */ new Set();
    while (pending.length > 0) {
      const idValue = pending.pop();
      if (visited.has(idValue)) continue;
      visited.add(idValue);
      const block = blocks.get(idValue);
      if (block === void 0) {
        missing.add(idValue);
        continue;
      }
      if (idValue !== pageId && block["type"] === "page") continue;
      for (const child of block["content"] ?? []) pending.push(child);
    }
    if (missing.size === 0) break;
    const missingIds = [...missing];
    const data = await notionPost(runtime2, "getRecordValues", cookie, { requests: missingIds.map((idValue) => ({ table: "block", id: idValue })) }, headers2);
    for (const [index, result] of data["results"].entries()) {
      const block = object3(result["value"]);
      blocks.set(block["id"] ?? missingIds[index], block);
    }
  }
  const build = (idValue) => {
    const block = blocks.get(idValue);
    if (idValue !== pageId && block["type"] === "page") return { id: idValue, block, children: [] };
    return { id: idValue, block, children: (block["content"] ?? []).filter((child) => blocks.get(child)?.["alive"] !== false).map(build) };
  };
  return { tree: build(pageId), userId, spaceId, cookie, headers: headers2 };
}
async function fetchNotionDocument(runtime2, url, source) {
  const { tree } = await fetchTree(runtime2, url, source);
  const markdown = renderNotionTreeToMarkdown(tree);
  return { title: markdown.split("\n")[0].replace(/^# */, ""), markdown, data: notionData(source.identifier, markdown, tree, void 0) };
}
async function uploadNotionDocument(runtime2, markdown, _markdownPath) {
  const split = splitTitle(markdown);
  if (split.title === "") throw new Error("Markdown document requires a first heading");
  const cookies = await runtime2.cookies.loadSaved("notion");
  if (cookies === null) throw notionAuthError();
  const cookie = cookies.map((value) => `${value.name}=${value.value}`).join("; ");
  const userId = cookies.find((value) => value.name === "notion_user_id").value;
  const csrf = cookies.find((value) => value.name === "csrf")?.value;
  const spaces = await notionPost(runtime2, "getSpaces", cookie, {}, {});
  const spaceView = object3(object3(spaces[userId])["space_view"]);
  if (Object.keys(spaceView).length !== 1) throw new Error("Notion upload requires an explicit target workspace.");
  const spaceId = object3(spaceView[Object.keys(spaceView)[0]])["spaceId"];
  const pageId = (0, import_node_crypto3.randomUUID)();
  const compactPageId = pageId.replaceAll("-", "");
  const currentTime = runtime2.clock.now().getTime();
  const headers2 = { "x-notion-active-user-header": userId, "x-notion-space-id": spaceId, referer: `https://www.notion.so/${compactPageId}`, ...csrf === void 0 ? {} : { "x-csrf-token": csrf } };
  const pageOperation = {
    pointer: pointer(pageId, spaceId),
    path: [],
    command: "set",
    args: {
      id: pageId,
      type: "page",
      properties: { title: titleRichText(split.title) },
      space_id: spaceId,
      created_time: currentTime,
      created_by_table: "notion_user",
      created_by_id: userId,
      last_edited_time: currentTime,
      last_edited_by_table: "notion_user",
      last_edited_by_id: userId,
      parent_id: spaceId,
      parent_table: "space",
      alive: true,
      permissions: [{ type: "user_permission", role: "editor", user_id: userId }]
    }
  };
  const localBlocks = parseNotionMarkdown(split.body);
  const operations = [pageOperation, ...buildNotionCreateOperations(localBlocks, pageId, spaceId, userId, currentTime).operations];
  await notionPost(runtime2, "saveTransactionsFanout", cookie, { requestId: (0, import_node_crypto3.randomUUID)(), transactions: [{ id: (0, import_node_crypto3.randomUUID)(), spaceId, operations }] }, headers2);
  const pageTree = {
    id: pageId,
    block: pageOperation.args,
    children: localTree(localBlocks).map((node) => outputNode(node, void 0, pageId, { spaceId, userId }, currentTime))
  };
  const output = renderNotionTreeToMarkdown(pageTree);
  return { url: `https://www.notion.so/${compactPageId}`, title: split.title, markdown: output, data: notionData(compactPageId, output, pageTree, void 0) };
}
function splitTitle(markdown) {
  const lines = markdown.replace(/^\ufeff/, "").split("\n");
  const first = lines[0].trimStart();
  if (first === "#") return { title: "", body: lines.slice(1).join("\n") };
  if (/^#{1,6}\s+\S/.test(first)) return { title: first.replace(/^#+\s+/, "").trim(), body: lines.slice(1).join("\n") };
  return { title: "", body: markdown };
}
async function synchronizeNotionDocument(runtime2, url, base, markdown, _markdownPath) {
  const source = { service: "notion", identifier: /([a-f0-9]{32})/.exec(url)[1], type: "document" };
  const remote = await fetchTree(runtime2, url, source);
  const baseObject = object3(base);
  const mentions = baseUserMentions(baseObject);
  const currentMarkdown = renderNotionTreeToMarkdown(remote.tree, mentions);
  const baseMarkdown = baseObject["markdown"];
  let split = splitTitle(markdown);
  const currentSplit = splitTitle(currentMarkdown);
  const baseSplit = baseMarkdown === void 0 ? void 0 : splitTitle(baseMarkdown);
  let fieldMerged = false;
  if (baseSplit !== void 0) {
    const localTitleChanged = baseSplit.title !== split.title;
    const remoteTitleChanged = baseSplit.title !== currentSplit.title;
    const localBodyChanged = baseSplit.body !== split.body;
    const remoteBodyChanged = baseSplit.body !== currentSplit.body;
    if ((localTitleChanged || localBodyChanged) && (remoteTitleChanged || remoteBodyChanged)) {
      split = { title: localTitleChanged ? split.title : currentSplit.title, body: localBodyChanged ? split.body : currentSplit.body };
      fieldMerged = true;
    }
  }
  const targetMarkdown = split.title === "" ? split.body : `# ${split.title}
${split.body}`;
  if (mentions === void 0 && split.body === currentSplit.body && (baseSplit === void 0 || baseSplit.body === currentSplit.body)) {
    if (baseSplit !== void 0) {
      const localTitleChanged = baseSplit.title !== split.title;
      const remoteTitleChanged = baseSplit.title !== currentSplit.title;
      if (!localTitleChanged && remoteTitleChanged) return { title: currentSplit.title, markdown: currentMarkdown, data: notionData(remote.tree.id, currentMarkdown, remote.tree, mentions) };
      if (localTitleChanged && remoteTitleChanged && split.title !== currentSplit.title) throw new Error("Markdown and Notion changed since last sync");
      if (localTitleChanged && remoteTitleChanged) return { title: currentSplit.title, markdown: currentMarkdown, data: notionData(remote.tree.id, currentMarkdown, remote.tree, mentions) };
    }
    const titleRich2 = split.title === "" ? object3(remote.tree.block["properties"])["title"] : titleRichText(split.title);
    const titleChanged = split.title !== "" && compact(object3(remote.tree.block["properties"])["title"]) !== compact(titleRich2);
    if (titleChanged) await notionPost(runtime2, "saveTransactionsFanout", remote.cookie, { requestId: (0, import_node_crypto3.randomUUID)(), transactions: [{ id: (0, import_node_crypto3.randomUUID)(), spaceId: remote.spaceId, operations: [{ pointer: pointer(remote.tree.id, remote.spaceId), path: ["properties", "title"], command: "set", args: titleRich2 }, { pointer: pointer(remote.tree.id, remote.spaceId), path: ["last_edited_time"], command: "set", args: runtime2.clock.now().getTime() }] }] }, remote.headers);
    const outputTree2 = { ...remote.tree, block: { ...remote.tree.block, properties: { ...object3(remote.tree.block["properties"]), title: titleRich2 } } };
    const output2 = renderNotionTreeToMarkdown(outputTree2, mentions);
    return { title: output2.split("\n")[0].replace(/^# */, ""), markdown: output2, data: notionData(remote.tree.id, output2, outputTree2, mentions) };
  }
  if (baseMarkdown !== void 0) {
    const localChanged = baseMarkdown !== targetMarkdown;
    const remoteChanged = baseMarkdown !== currentMarkdown;
    if (!localChanged && remoteChanged) return { title: currentMarkdown.split("\n")[0].replace(/^# */, ""), markdown: currentMarkdown, data: notionData(remote.tree.id, currentMarkdown, remote.tree, mentions) };
    if (localChanged && remoteChanged && targetMarkdown !== currentMarkdown && !fieldMerged) throw new Error("Markdown and Notion changed since last sync");
    if (localChanged && remoteChanged && targetMarkdown === currentMarkdown) return { title: currentMarkdown.split("\n")[0].replace(/^# */, ""), markdown: currentMarkdown, data: notionData(remote.tree.id, currentMarkdown, remote.tree, mentions) };
  }
  const localBody = mentions === void 0 ? split.body : hydrateUserMentions(split.body, mentions);
  const localBlocks = parseNotionMarkdown(localBody);
  const ambient = { spaceId: remote.spaceId, userId: remote.userId, currentTime: runtime2.clock.now().getTime() };
  const diffResult = diffNotionBlockTrees(remote.tree, localBlocks, sidecarBlocksFromNotionTree(remote.tree), ambient);
  const operations = [...diffResult.operations];
  const titleRich = split.title === "" ? object3(remote.tree.block["properties"])["title"] : titleRichText(split.title);
  if (split.title !== "" && compact(object3(remote.tree.block["properties"])["title"]) !== compact(titleRich)) operations.unshift({ pointer: pointer(remote.tree.id, remote.spaceId), path: ["properties", "title"], command: "set", args: titleRich });
  if (operations.length > 0) await notionPost(runtime2, "saveTransactionsFanout", remote.cookie, { requestId: (0, import_node_crypto3.randomUUID)(), transactions: [{ id: (0, import_node_crypto3.randomUUID)(), spaceId: remote.spaceId, operations }] }, remote.headers);
  const outputTree = { id: remote.tree.id, block: { ...remote.tree.block, properties: { ...object3(remote.tree.block["properties"]), title: titleRich } }, children: localTree(localBlocks).map((node, index) => outputNode(node, remote.tree.children[index], remote.tree.id, remote, ambient.currentTime)) };
  const output = renderNotionTreeToMarkdown(outputTree, mentions);
  return { title: output.split("\n")[0].replace(/^# */, ""), markdown: output, data: notionData(remote.tree.id, output, outputTree, mentions) };
}

// packages/provider-notion/src/notion.ts
var notionPageId = /[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
var notionService = defineService({
  name: "notion",
  matches: (url) => (url.hostname === "www.notion.so" || url.hostname === "notion.so" || url.hostname === "app.notion.com" || url.hostname.endsWith(".notion.site")) && notionPageId.test(url.href),
  parse: (url) => Object.freeze({ service: "notion", identifier: notionPageId.exec(url.href)[0].replaceAll("-", "").toLowerCase(), type: "document" }),
  fetch: fetchNotionDocument,
  synchronize: (runtime2, url, _source, base, markdown, markdownPath) => synchronizeNotionDocument(runtime2, url, base, markdown, markdownPath),
  upload: uploadNotionDocument
});

// packages/provider-notion/src/index.ts
var notionProvider = Object.freeze({
  services: [notionService]
});

// packages/provider-slack/src/slack.ts
function slackAuthError() {
  return new Error("slack cookie authentication is missing or expired. Run `wire slack login` once; other commands reuse saved cookies.");
}
function decodeEntities(text2) {
  return text2.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function markdownLinkLabel(value) {
  return value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}
function cleanText(text2) {
  return decodeEntities(text2.replace(/<@([A-Z0-9]+)(?:\|([^>]+))?>/g, (_match, id, label) => `@${label ?? id}`).replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1").replace(/<#([A-Z0-9]+)>/g, "#$1").replace(/<!subteam\^[A-Z0-9]+\|([^>]+)>/g, "$1").replace(/<!(here|channel|everyone)>/g, "@$1").replace(/<(https?:\/\/[^|>\s]+)\|([^>]+)>/g, (_match, url, label) => `[${markdownLinkLabel(label)}](${url})`).replace(/<(https?:\/\/[^>]+)>/g, "$1").replace(/<(mailto:[^|>]+)\|([^>]+)>/g, "$2"));
}
async function api(runtime2, origin, token, cookie, method, parameters) {
  const body2 = new URLSearchParams({ token, ...parameters });
  const response = await runtime2.http.request(`${origin}/api/${method}`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36" }, body: body2 });
  const json = await response.json();
  if (!response.ok) throw new Error(`Slack API ${method} failed: HTTP ${response.status} ${JSON.stringify(json)}`);
  if (json["ok"] === false) throw new Error(`Slack API ${method} failed: ${json["error"]}`);
  return json;
}
function formatTimestamp(timestamp, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(Number(timestamp) * 1e3));
  const values2 = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values2["year"]}-${values2["month"]}-${values2["day"]} ${values2["hour"]}:${values2["minute"]}`;
}
function messageParts(url) {
  const archive = /^\/archives\/([^/]+)\/p([0-9]+)\/?$/.exec(url.pathname);
  if (url.hostname.endsWith(".slack.com") && archive !== null) return Object.freeze({ channel: archive[1], rawTimestamp: archive[2] });
  const app = /^\/client\/[^/]+\/([^/]+)\/p([0-9]+)\/?$/.exec(url.pathname);
  if (url.hostname === "app.slack.com" && app !== null) return Object.freeze({ channel: app[1], rawTimestamp: app[2] });
  const thread = /^\/client\/[^/]+\/([^/]+)\/thread\/[^-]+-([0-9]+\.[0-9]+)\/?$/.exec(url.pathname);
  if (url.hostname === "app.slack.com" && thread !== null) return Object.freeze({ channel: thread[1], rawTimestamp: thread[2] });
  return void 0;
}
function slackTimestamp(rawTimestamp) {
  if (rawTimestamp.includes(".")) return rawTimestamp;
  return `${rawTimestamp.slice(0, -6)}.${rawTimestamp.slice(-6)}`;
}
var slackService = defineService({
  name: "slack",
  matches: (url) => messageParts(url) !== void 0,
  parse: (url) => {
    const parts = messageParts(url);
    const timestamp = slackTimestamp(parts.rawTimestamp);
    const threadTimestamp = url.searchParams.has("thread_ts") ? url.searchParams.get("thread_ts") : timestamp;
    return Object.freeze({ service: "slack", identifier: `${parts.channel}:${threadTimestamp}`, type: "message-thread", channel_id: parts.channel, timestamp, thread_timestamp: threadTimestamp });
  },
  fetch: async (runtime2, url, source) => {
    const cookies = await runtime2.cookies.loadSaved("slack");
    if (cookies === null) throw slackAuthError();
    const cookie = cookies.map((value) => `${value.name}=${value.value}`).join("; ");
    const metadata = await runtime2.cookies.metadata("slack");
    const origin = new URL(url).hostname === "app.slack.com" ? metadata["origin"] : new URL(url).origin;
    const token = metadata["token"];
    const response = await api(runtime2, origin, token, cookie, "conversations.replies", { channel: source["channel_id"], ts: source["thread_timestamp"], limit: "999" });
    const userCache = /* @__PURE__ */ new Map();
    const botCache = /* @__PURE__ */ new Map();
    const resolveUser = async (id) => {
      if (!userCache.has(id)) {
        const profile = await api(runtime2, origin, token, cookie, "users.info", { user: id });
        const user = profile["user"];
        const userProfile = user["profile"];
        const realName = userProfile === void 0 ? void 0 : userProfile["real_name"];
        const name = user["name"];
        userCache.set(id, realName !== void 0 && realName !== "" ? realName : name !== void 0 && name !== "" ? name : id);
      }
      return userCache.get(id);
    };
    const messages = [];
    for (const raw of response["messages"]) {
      const userId = raw["user"];
      let userName;
      if (userId !== void 0) userName = await resolveUser(userId);
      else if (raw["username"] !== void 0) userName = raw["username"];
      else if (raw["bot_profile"] !== void 0) userName = raw["bot_profile"]["name"];
      else if (raw["bot_id"] !== void 0) {
        const botId = raw["bot_id"];
        if (!botCache.has(botId)) botCache.set(botId, (await api(runtime2, origin, token, cookie, "bots.info", { bot: botId }))["bot"]["name"]);
        userName = botCache.get(botId);
      } else userName = "unknown";
      let text2 = raw["text"];
      const files = raw["files"] === void 0 ? [] : raw["files"].map((file) => Object.freeze({ name: file["name"], url: file["url_private"] }));
      if (text2.trim() === "" && files.length > 0) text2 = files.map((file) => `- [${markdownLinkLabel(file.name)}](${file.url})`).join("\n");
      messages.push({ ts: raw["ts"], user_id: userId ?? "unknown", user_name: userName, text: text2, files });
    }
    const mentioned = new Set(messages.flatMap((message) => [...message.text.matchAll(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g)].map((match) => match[1])));
    for (const id of mentioned) await resolveUser(id);
    for (const message of messages) message.text = cleanText(message.text.replace(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g, (_match, id) => `@${userCache.get(id)}`)).replace(/```([^\n])/g, "```\n$1").replace(/([^\n])```/g, "$1\n```");
    const timezone = runtime2.clock.localTimezone();
    const date = formatTimestamp(messages[0].ts, timezone).slice(0, 10);
    const titleText = messages[0].text.replace(/https?:\/\/\S+/g, "").slice(0, 30).replace(/[^\p{L}\p{N}_\s-]/gu, "").replace(/[\s-]+/g, "_").replace(/^_+|_+$/g, "");
    const lines = [];
    for (const message of messages) lines.push(`## ${message.user_name} \u2014 ${formatTimestamp(message.ts, timezone)}`, "", message.text, "");
    return Object.freeze({ title: `${date}-${titleText}`, markdown: `${lines.join("\n").trimEnd()}
`, data: { channel_id: source["channel_id"], messages } });
  }
});

// packages/provider-slack/src/index.ts
var slackProvider = Object.freeze({
  services: [slackService]
});

// packages/provider-zoom/src/zoom-hub.ts
var userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
function zoomAuthError() {
  return new Error("Zoom authentication is missing or expired. Run `wire zoom login` once; other commands reuse saved cookies.");
}
function hubHeaders(jwt, contentType) {
  return { "user-agent": userAgent, authorization: `Bearer ${jwt}`, "x-zm-cluster-id": "aw1", "x-zm-docs-container": "drive/browser", "x-zm-docs-loading": "init", "x-requested-with": "XMLHttpRequest", accept: "application/json, text/plain, */*", referer: "https://hub.zoom.us/", ...contentType === void 0 ? {} : { "content-type": contentType } };
}
function formatMeetingStartTime(value, timezone) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}
function meetingDate(value, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const values2 = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values2["year"]}-${values2["month"]}-${values2["day"]}`;
}
function transcriptTitle(title2, startTime, timezone) {
  const base = title2.replace(/\b[0-9]{4}-[0-9]{2}-[0-9]{2}\b/g, " ").replace(/\b[0-9]{1,2}:?[0-9]{2}\s*\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return `${meetingDate(startTime, timezone)}-${base}`;
}
async function zoomText(response, label) {
  const text2 = await response.text();
  if (response.status === 401) throw zoomAuthError();
  if (!response.ok) throw new Error(`Zoom Hub ${label} failed: HTTP ${response.status} ${text2}`);
  return text2;
}
async function zoomJson(response, label) {
  const body2 = await response.json();
  if (response.status === 401) throw zoomAuthError();
  if (!response.ok) throw new Error(`Zoom Hub ${label} failed: HTTP ${response.status} ${JSON.stringify(body2)}`);
  return body2;
}
function zoomJwt(text2) {
  const token = text2.trim();
  if (token.split(".").length !== 3) throw zoomAuthError();
  return token;
}
function cookieKey(cookie) {
  return `${cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain}	${cookie.path}	${cookie.name}`;
}
function cookieJar(cookies) {
  return new Map(cookies.map((cookie) => [cookieKey(cookie), cookie]));
}
function domainMatches(cookie, hostname) {
  const domain = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
  return hostname === domain || cookie.includeSubdomains && hostname.endsWith(`.${domain}`);
}
function pathMatches(cookiePath2, requestPath) {
  return requestPath === cookiePath2 || requestPath.startsWith(cookiePath2.endsWith("/") ? cookiePath2 : `${cookiePath2}/`);
}
function requestCookies(jar, url, now) {
  const nowSeconds = Math.floor(now.getTime() / 1e3);
  return [...jar.values()].filter((cookie) => {
    if (cookie.expires !== 0 && cookie.expires <= nowSeconds) return false;
    if (cookie.secure && url.protocol !== "https:") return false;
    if (!domainMatches(cookie, url.hostname)) return false;
    return pathMatches(cookie.path, url.pathname);
  }).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
function defaultCookiePath(pathname) {
  const index = pathname.lastIndexOf("/");
  return index <= 0 ? "/" : pathname.slice(0, index);
}
function splitSetCookieHeader(value) {
  return Object.freeze(value.split(/,(?=\s*[^;,]+=)/).map((item) => item.trim()));
}
function setCookieHeaders(response) {
  const headers2 = response.headers;
  const values2 = headers2.getSetCookie?.();
  if (values2 !== void 0) return Object.freeze(values2);
  const value = response.headers.get("set-cookie");
  if (value === null) return Object.freeze([]);
  return splitSetCookieHeader(value);
}
function cookieAttributes(parts) {
  return new Map(parts.map((part) => {
    const index = part.indexOf("=");
    return index === -1 ? [part.toLowerCase(), ""] : [part.slice(0, index).toLowerCase(), part.slice(index + 1)];
  }));
}
function setCookieExpires(attributes, now) {
  if (attributes.has("max-age")) return Math.floor(now.getTime() / 1e3) + Number(attributes.get("max-age"));
  if (attributes.has("expires")) return Math.floor(Date.parse(attributes.get("expires")) / 1e3);
  return 0;
}
function applySetCookie(jar, url, header, now) {
  const parts = header.split(";").map((part) => part.trim());
  const pair = parts[0];
  const separator = pair.indexOf("=");
  const name = pair.slice(0, separator);
  const value = pair.slice(separator + 1);
  const attributes = cookieAttributes(parts.slice(1));
  const domain = attributes.has("domain") ? attributes.get("domain") : url.hostname;
  const path = attributes.has("path") ? attributes.get("path") : defaultCookiePath(url.pathname);
  const expires = setCookieExpires(attributes, now);
  const cookie = Object.freeze({
    domain,
    includeSubdomains: attributes.has("domain") || domain.startsWith("."),
    path,
    secure: attributes.has("secure"),
    expires,
    name,
    value,
    httpOnly: attributes.has("httponly")
  });
  const key2 = cookieKey(cookie);
  if (expires !== 0 && expires <= Math.floor(now.getTime() / 1e3)) return jar.delete(key2);
  const existing = jar.get(key2);
  jar.set(key2, cookie);
  return existing === void 0 || existing.value !== cookie.value || existing.expires !== cookie.expires || existing.secure !== cookie.secure || existing.httpOnly !== cookie.httpOnly || existing.includeSubdomains !== cookie.includeSubdomains;
}
function applyResponseCookies(jar, url, response, now) {
  let changed = false;
  for (const header of setCookieHeaders(response)) changed = applySetCookie(jar, url, header, now) || changed;
  return changed;
}
function pruneExpiredCookies(jar, now) {
  let changed = false;
  const nowSeconds = Math.floor(now.getTime() / 1e3);
  for (const [key2, cookie] of jar.entries()) {
    if (cookie.expires !== 0 && cookie.expires <= nowSeconds) {
      jar.delete(key2);
      changed = true;
    }
  }
  return changed;
}
var zoomHubService = defineService({
  name: "zoom-hub",
  matches: (url) => url.hostname === "hub.zoom.us" && /^\/doc\/[^/]+\/?$/.test(url.pathname),
  parse: (url) => Object.freeze({ service: "zoom-hub", identifier: /^\/doc\/([^/]+)\/?$/.exec(url.pathname)[1], type: "transcript" }),
  fetch: async (runtime2, _url, source) => {
    const cookies = await runtime2.cookies.loadSaved("zoom");
    if (cookies === null) throw zoomAuthError();
    const jar = cookieJar(cookies);
    const state = { metadata: await runtime2.cookies.metadata("zoom") };
    const save = () => runtime2.cookies.save("zoom", Object.freeze([...jar.values()]), state.metadata);
    if (pruneExpiredCookies(jar, runtime2.clock.now())) await save();
    const accountCookie = [...jar.values()].find((value) => value.name === "zm_aid");
    if (accountCookie === void 0) throw zoomAuthError();
    const accountId = accountCookie.value;
    const zoomRequest = async (url, init) => {
      const parsed = new URL(url);
      const response = await runtime2.http.request(url, { ...init, headers: { ...init.headers, cookie: requestCookies(jar, parsed, runtime2.clock.now()) } });
      if (applyResponseCookies(jar, parsed, response, runtime2.clock.now())) await save();
      return response;
    };
    const refreshJwt = async () => {
      const jwtResponse = await zoomRequest("https://hub.zoom.us/nws/common/2.0/nak?pms=Hub%2CUser%3ABase%2CAICW&src=aicw", { headers: { "user-agent": userAgent, "x-requested-with": "XMLHttpRequest", accept: "application/json, text/plain, */*", referer: "https://hub.zoom.us/" } });
      const jwt2 = zoomJwt(await zoomText(jwtResponse, "JWT"));
      state.metadata = Object.freeze({ ...state.metadata, hub_jwt: jwt2, hub_jwt_expires: String(runtime2.clock.now().getTime() + 18e5) });
      await save();
      return jwt2;
    };
    const cachedJwt = state.metadata["hub_jwt"];
    const cachedExpires = state.metadata["hub_jwt_expires"];
    let cached = cachedJwt !== void 0 && cachedExpires !== void 0 && runtime2.clock.now().getTime() < Number(cachedExpires);
    let jwt = cached ? cachedJwt : await refreshJwt();
    const docsRequest = async (url, init) => {
      const response = await zoomRequest(url, init(jwt));
      if (response.status !== 401 || !cached) return response;
      cached = false;
      jwt = await refreshJwt();
      return zoomRequest(url, init(jwt));
    };
    const fileResponse = await docsRequest("https://us01docs.zoom.us/api/file/files/action/batch_get", (token) => ({ method: "POST", headers: hubHeaders(token, "application/json"), body: JSON.stringify({ ids: [source.identifier], accountId }) }));
    const files = (await zoomJson(fileResponse, "file batch_get"))["successItems"];
    if (files.length === 0) throw new Error(`Zoom Hub file ${source.identifier} was not returned by batch_get`);
    const document = files[0];
    const notes = document["meetingNotes"];
    const meetingId = notes["meetingId"];
    const mainMeetingId = notes["mainMeetingId"];
    const base = { recording_id: source.identifier, title: document["title"], source_url: document["fileLink"], meeting_id: meetingId, main_meeting_id: mainMeetingId, owner: document["owner"]["ownerName"], created_at: document["createdInfo"]["time"], updated_at: document["updatedInfo"]["time"] };
    if (meetingId !== "") {
      const statusResponse = await docsRequest(`https://us01docs.zoom.us/api/meeting/transcript_status?meetingId=${encodeURIComponent(meetingId)}`, (token) => ({ headers: hubHeaders(token) }));
      const status = (await zoomJson(statusResponse, "transcript status"))["aicTranscript"];
      if (!status["exist"] || !status["canAccess"]) {
        const result2 = { ...base, transcript: "", state: status["exist"] ? "denied" : "missing" };
        const markdown = [`# ${result2.title}`, "", `- Transcript state: ${result2.state}`, `- Recording ID: ${result2.recording_id}`, `- Meeting ID: ${result2.meeting_id}`, `- Main meeting ID: ${result2.main_meeting_id}`, `- Owner: ${result2.owner}`, `- Zoom document: ${result2.source_url}`].join("\n");
        return Object.freeze({ title: result2.title, markdown, data: result2 });
      }
    }
    const transcriptResponse = await docsRequest(`https://us01docs.zoom.us/api/bridge/meeting/transcripts/v2?meetingId=${encodeURIComponent(meetingId)}&fileId=${encodeURIComponent(source.identifier)}`, (token) => ({ headers: hubHeaders(token) }));
    const raw = await zoomJson(transcriptResponse, "transcript");
    const speakers = raw["speakers"];
    const speakerMap = new Map(speakers.map((speaker) => [speaker["userId"], speaker["username"]]));
    const transcript = raw["items"].map((item) => {
      const userId = item["userId"];
      return `- [${item["startTime"]}] **${speakerMap.get(userId) ?? userId}:** ${item["text"]}`;
    }).join("\n");
    const result = { ...base, meeting_start_time: new Date(Number(raw["meetingStartTime"])).toISOString().replace("Z", "+00:00"), participants: speakers.map((speaker) => speaker["username"]), transcript, raw, state: "ready" };
    const lines = [`# ${result.title}`, "", `- Meeting start: ${formatMeetingStartTime(result.meeting_start_time, runtime2.clock.localTimezone())}`, `- Owner: ${result.owner}`, `- Zoom document: ${result.source_url}`, "", "## Transcript", "", result.transcript];
    return Object.freeze({ title: transcriptTitle(result.title, result.meeting_start_time, runtime2.clock.localTimezone()), markdown: lines.join("\n"), data: result });
  }
});

// packages/provider-zoom/src/index.ts
var zoomProvider = Object.freeze({
  services: [zoomHubService]
});

// packages/wire-vscode-extension/src/service-catalog.ts
var serviceCatalog = createServiceRegistry().use(zoomProvider).use(notionProvider).use(slackProvider).use(chatgptProvider).use(googleDocsProvider).use(gmailProvider).use(asanaProvider).catalog();

// packages/wire-vscode-extension/src/extension.ts
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process2.execFile);
var authServices = ["asana", "chatgpt", "gmail", "google-docs", "notion", "slack", "zoom"];
var wireStatus;
function environment(name) {
  const value = process.env[name];
  if (value === void 0 || value.trim() === "") throw new Error(`Missing environment variable: ${name}`);
  return value;
}
function repositoryRoot() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
function runtime() {
  const filesystem = {
    exists: async (path) => (0, import_node_fs3.existsSync)(path),
    readText: (path) => (0, import_promises5.readFile)(path, "utf8"),
    writeText: async (path, contents) => {
      await (0, import_promises5.mkdir)((0, import_node_path4.dirname)(path), { recursive: true });
      await (0, import_promises5.writeFile)(path, contents, "utf8");
    },
    delete: (path) => (0, import_promises5.rm)(path)
  };
  const clock = {
    now: () => /* @__PURE__ */ new Date(),
    localTimezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezone: (name) => new Intl.DateTimeFormat("en-US", { timeZone: name })
  };
  return {
    http: { request: (input, init) => fetch(input, init) },
    filesystem,
    process: { execute: async (command, args) => {
      const result = await execFileAsync(command, [...args], { encoding: "utf8" });
      return { stdout: result.stdout, stderr: result.stderr };
    } },
    clock,
    openFiles: { open: async (path) => {
      await vscode.env.openExternal(vscode.Uri.parse(path));
    } },
    configuration: { get: environment },
    secrets: { get: async (reference) => {
      throw new Error(`Missing secret provider for ${reference}`);
    } },
    cookies: createCookiesCapability(filesystem, () => environment("HOME"), repositoryRoot),
    gmailTokens: {
      load: () => createGoogleTokensCapability(filesystem, { request: (input, init) => fetch(input, init) }, clock, environment("GOOGLE_CREDENTIALS_FILE"), environment("GOOGLE_TOKEN_FILE")).load(),
      refresh: () => createGoogleTokensCapability(filesystem, { request: (input, init) => fetch(input, init) }, clock, environment("GOOGLE_CREDENTIALS_FILE"), environment("GOOGLE_TOKEN_FILE")).refresh()
    },
    googleFormsTokens: {
      load: () => createGoogleTokensCapability(filesystem, { request: (input, init) => fetch(input, init) }, clock, environment("GOOGLE_CREDENTIALS_FILE"), environment("GOOGLE_FORMS_TOKEN_FILE")).load(),
      refresh: () => createGoogleTokensCapability(filesystem, { request: (input, init) => fetch(input, init) }, clock, environment("GOOGLE_CREDENTIALS_FILE"), environment("GOOGLE_FORMS_TOKEN_FILE")).refresh()
    }
  };
}
function wire() {
  const capabilities = runtime();
  return composeWire({
    home: environment("HOME"),
    fetchInput: capabilities,
    catalog: serviceCatalog,
    filesystem: {
      exists: async (path) => (0, import_node_fs3.existsSync)(path),
      isFile: async (path) => (0, import_node_fs3.existsSync)(path) && (0, import_node_fs3.statSync)(path).isFile(),
      readText: capabilities.filesystem.readText,
      writeText: capabilities.filesystem.writeText
    },
    workspace: {
      configuredRoot: configuredWireRoot,
      initialize: initializeWire,
      loadConfig: loadWireConfig,
      openRegistry: openWireRegistry,
      relativePath: wireRelativePath
    },
    initialization: { backend: defaultWireBackend, registryPath: defaultWireRegistryPath },
    now: capabilities.clock.now,
    open: capabilities.openFiles.open
  });
}
function auth() {
  return composeAuth(runtime(), process.env, extractChromeCookies);
}
function setWireStatus(message) {
  wireStatus.text = `$(plug) Wire: ${message}`;
  wireStatus.tooltip = message;
  wireStatus.show();
}
function showWireStatus(message) {
  setWireStatus(message);
  vscode.window.showInformationMessage(message);
}
async function wireProgress(message, operation) {
  setWireStatus(message.toLowerCase());
  return vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `Wire - ${message}` }, operation);
}
function wireError(error) {
  if (!(error instanceof Error)) return null;
  const login = /Run `([^`]+)`/.exec(error.message);
  if (login !== null) return { message: `Wire - Login required. Run in terminal: ${login[1]}`, command: login[1] };
  const missingGoogle = /^Missing environment variable: (GOOGLE_CREDENTIALS_FILE|GOOGLE_TOKEN_FILE|GOOGLE_FORMS_TOKEN_FILE)$/.exec(error.message);
  if (missingGoogle !== null) return { message: "Wire - Google login required. Run in terminal: wire google-docs login", command: "wire google-docs login" };
  const unregisteredPath = /^Resource path is not registered: ([\s\S]+)$/.exec(error.message);
  if (unregisteredPath !== null) return { message: `Wire - Not attached: ${unregisteredPath[1]}. Use Wire - Attach to track a source URL, or Wire - Download for a one-time copy.` };
  const missingPath = /^Resource path not found: ([\s\S]+)$/.exec(error.message);
  if (missingPath !== null) return { message: `Wire - Not found: ${missingPath[1]}.` };
  const missingWorkspace = /^Wire workspace not initialized\. Run `wire init` or `wire <url>` first\.$/.exec(error.message);
  if (missingWorkspace !== null) return { message: "Wire - Workspace is not initialized. Use Wire - Attach to start tracking a source URL." };
  const unsupportedSource = /^Unsupported source URL: ([\s\S]+)$/.exec(error.message);
  if (unsupportedSource !== null) return { message: `Wire - Unsupported source URL: ${unsupportedSource[1]}. Supported sources: Asana, ChatGPT, Gmail, Google Docs/Sheets/Slides/Forms, Notion, Slack, Zoom.` };
  return null;
}
async function displayWireError(display) {
  setWireStatus("error");
  const action = display.command === void 0 ? await vscode.window.showErrorMessage(display.message) : await vscode.window.showErrorMessage(display.message, "Copy command");
  if (action === "Copy command") await vscode.env.clipboard.writeText(display.command);
}
function wireCommand(command) {
  return async (...args) => {
    try {
      await command(...args);
    } catch (error) {
      const display = wireError(error);
      if (display === null) throw error;
      await displayWireError(display);
    }
  };
}
function identityText(result) {
  const entries = Object.entries(result.identity);
  if (entries.length === 0) return result.service;
  return `${result.service} ${entries.map(([key2, value]) => `${key2}=${String(value).replace(/[\t\r\n]+/g, " ")}`).join(" ")}`;
}
function selectedPath(uri) {
  if (uri !== void 0 && uri.scheme === "file") return uri.fsPath;
  const editor = vscode.window.activeTextEditor;
  if (editor === void 0 || editor.document.uri.scheme !== "file") throw new Error("No file selected");
  return editor.document.uri.fsPath;
}
function selectedDirectory(uri) {
  const path = selectedPath(uri);
  return (0, import_node_fs3.existsSync)(path) && (0, import_node_fs3.statSync)(path).isDirectory() ? path : (0, import_node_path4.dirname)(path);
}
function projectDirectory() {
  const root = repositoryRoot();
  if (root === void 0) throw new Error("No workspace folder open");
  return root;
}
function resourceFile(uri) {
  const path = selectedPath(uri);
  if (!(0, import_node_fs3.statSync)(path).isFile()) throw new Error(`Expected file: ${path}`);
  return path;
}
function pathInsideDirectory(directory, path) {
  const normalizedDirectory = (0, import_node_path4.resolve)(directory);
  const normalizedPath = (0, import_node_path4.resolve)(path);
  return normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}/`);
}
async function saveDocument(path) {
  const document = vscode.workspace.textDocuments.find((candidate) => candidate.uri.scheme === "file" && candidate.uri.fsPath === path);
  if (document !== void 0 && document.isDirty && !await document.save()) throw new Error(`Could not save ${path}`);
}
async function saveDirtyDocumentsInDirectory(directory) {
  for (const document of vscode.workspace.textDocuments) if (document.uri.scheme === "file" && document.isDirty && pathInsideDirectory(directory, document.uri.fsPath) && !await document.save()) throw new Error(`Could not save ${document.uri.fsPath}`);
}
function title(resource) {
  return resource.data.find((item) => item.namespace === "wire" && item.key === "title").value;
}
function resultMessage(result) {
  return `Wire - ${result.summary.action[0].toUpperCase()}${result.summary.action.slice(1)}: ${title(result.resource)}`;
}
async function showWireResultStatus(result) {
  const message = resultMessage(result);
  setWireStatus(message);
  if (result.summary.action !== "uploaded") {
    vscode.window.showInformationMessage(message);
    return;
  }
  const action = await vscode.window.showInformationMessage(message, "Copy URL", "Open URL");
  if (action === "Copy URL") await vscode.env.clipboard.writeText(result.summary.remote);
  if (action === "Open URL") await vscode.env.openExternal(vscode.Uri.parse(result.summary.remote));
}
async function attachHere(uri) {
  const directory = selectedDirectory(uri);
  const url = await vscode.window.showInputBox({ prompt: "Source URL" });
  if (url === void 0 || url.trim() === "") throw new Error("Source URL required");
  const result = await wireProgress("Attaching", () => wire().attach(url, directory));
  await vscode.window.showTextDocument(vscode.Uri.file(result.path));
  await showWireResultStatus(result);
}
async function initProject() {
  const directory = projectDirectory();
  const existingRoot = await configuredWireRoot(directory, environment("HOME"));
  if (existingRoot !== null) {
    const config = await loadWireConfig(existingRoot);
    showWireStatus(`Wire - Project ready: ${config.backend}`);
    return;
  }
  const result = await wireProgress("Initializing project", () => initializeWire(directory, defaultWireBackend, defaultWireRegistryPath));
  showWireStatus(`Wire - Project initialized: ${result.backend}`);
}
async function downloadHere(uri) {
  const directory = selectedDirectory(uri);
  const url = await vscode.window.showInputBox({ prompt: "Source URL" });
  if (url === void 0 || url.trim() === "") throw new Error("Source URL required");
  const result = await wireProgress("Downloading", () => wire().downloadSource(url, directory));
  await vscode.window.showTextDocument(vscode.Uri.file(result.path));
  await showWireResultStatus(result);
}
async function previewUrl() {
  const url = await vscode.window.showInputBox({ prompt: "Source URL" });
  if (url === void 0 || url.trim() === "") throw new Error("Source URL required");
  const result = await wireProgress("Previewing", () => wire().view(url));
  const document = await vscode.workspace.openTextDocument({ language: "markdown", content: result.markdown });
  await vscode.window.showTextDocument(document);
  showWireStatus(`Wire - Previewed: ${result.title}`);
}
async function syncFile(uri) {
  const path = resourceFile(uri);
  await saveDocument(path);
  const result = await wireProgress("Syncing", () => wire().sync(path, (0, import_node_path4.dirname)(path)));
  await showWireResultStatus(result);
}
async function detachFile(uri) {
  const path = resourceFile(uri);
  const result = await wireProgress("Detaching", () => wire().detach(path, (0, import_node_path4.dirname)(path)));
  await showWireResultStatus(result);
}
async function openResource(uri) {
  const path = resourceFile(uri);
  const resource = await wireProgress("Opening", () => wire().openResource(path, (0, import_node_path4.dirname)(path)));
  showWireStatus(`Wire - Opened: ${title(resource)}`);
}
async function syncDirectory(uri) {
  const directory = selectedDirectory(uri);
  await saveDirtyDocumentsInDirectory(directory);
  const results = await wireProgress("Syncing all", () => wire().syncAll(directory));
  const failures = results.filter((result) => result.summary.action === "failed");
  const synced = results.length - failures.length;
  if (failures.length === 0) {
    showWireStatus(`Wire - Synced ${synced} resources`);
    return;
  }
  setWireStatus(`Wire - Synced ${synced}, failed ${failures.length}`);
  const first = failures[0];
  const display = wireError(new Error(first.summary.error));
  if (display === null) await vscode.window.showErrorMessage(`Wire - Synced ${synced}, failed ${failures.length}. ${first.summary.error}`);
  else await displayWireError({ ...display, message: `Wire - Synced ${synced}, failed ${failures.length}. ${display.message}` });
}
async function selectedAuthService() {
  const service = await vscode.window.showQuickPick([...authServices], { placeHolder: "Service" });
  if (service === void 0) throw new Error("Service required");
  return service;
}
async function authStatus() {
  const service = await selectedAuthService();
  const result = await wireProgress("Checking login", () => auth().status(service));
  showWireStatus(`Wire - Authenticated: ${identityText(result)}`);
}
async function authLogin() {
  const service = await selectedAuthService();
  const authClient = auth();
  const actions = {
    asana: authClient.extractAsana,
    chatgpt: authClient.extractChatgpt,
    gmail: authClient.extractGmail,
    "google-docs": authClient.extractGoogleDocs,
    notion: authClient.extractNotion,
    slack: authClient.extractSlack,
    zoom: authClient.extractZoom
  };
  const result = await wireProgress("Logging in", () => actions[service]());
  showWireStatus(`Wire - Login saved: ${identityText(result)}`);
}
async function authLogout() {
  const service = await selectedAuthService();
  await wireProgress("Logging out", () => auth().logout(service));
  showWireStatus(`Wire - Logged out: ${service}`);
}
async function compileAndReload() {
  const root = (0, import_node_path4.resolve)(__dirname, "..");
  await execFileAsync("node", ["bump-version.mjs", "patch"], { cwd: root });
  await execFileAsync("npm", ["run", "compile"], { cwd: root });
  await vscode.commands.executeCommand("workbench.action.reloadWindow");
}
function activate(context2) {
  wireStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  setWireStatus("ready");
  context2.subscriptions.push(
    wireStatus,
    vscode.commands.registerCommand("wire.initProject", wireCommand(initProject)),
    vscode.commands.registerCommand("wire.attachHere", wireCommand(attachHere)),
    vscode.commands.registerCommand("wire.downloadHere", wireCommand(downloadHere)),
    vscode.commands.registerCommand("wire.previewUrl", wireCommand(previewUrl)),
    vscode.commands.registerCommand("wire.syncFile", wireCommand(syncFile)),
    vscode.commands.registerCommand("wire.detachFile", wireCommand(detachFile)),
    vscode.commands.registerCommand("wire.openResource", wireCommand(openResource)),
    vscode.commands.registerCommand("wire.syncDirectory", wireCommand(syncDirectory)),
    vscode.commands.registerCommand("wire.authStatus", wireCommand(authStatus)),
    vscode.commands.registerCommand("wire.authLogin", wireCommand(authLogin)),
    vscode.commands.registerCommand("wire.authLogout", wireCommand(authLogout)),
    vscode.commands.registerCommand("wire.compileAndReload", wireCommand(compileAndReload))
  );
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
