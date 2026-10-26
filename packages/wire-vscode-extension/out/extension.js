"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
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

// ../../node_modules/toolcraft/node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/nodes/identity.js"(exports2) {
    "use strict";
    var ALIAS = Symbol.for("yaml.alias");
    var DOC = Symbol.for("yaml.document");
    var MAP = Symbol.for("yaml.map");
    var PAIR = Symbol.for("yaml.pair");
    var SCALAR = Symbol.for("yaml.scalar");
    var SEQ = Symbol.for("yaml.seq");
    var NODE_TYPE = Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports2.ALIAS = ALIAS;
    exports2.DOC = DOC;
    exports2.MAP = MAP;
    exports2.NODE_TYPE = NODE_TYPE;
    exports2.PAIR = PAIR;
    exports2.SCALAR = SCALAR;
    exports2.SEQ = SEQ;
    exports2.hasAnchor = hasAnchor;
    exports2.isAlias = isAlias;
    exports2.isCollection = isCollection;
    exports2.isDocument = isDocument;
    exports2.isMap = isMap;
    exports2.isNode = isNode;
    exports2.isPair = isPair;
    exports2.isScalar = isScalar;
    exports2.isSeq = isSeq;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/visit.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key2, node, visitor, path) {
      const ctrl = callVisitor(key2, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key2, path, ctrl);
        return visit_(key2, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = visit_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key2, node, visitor, path) {
      const ctrl = await callVisitor(key2, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key2, path, ctrl);
        return visitAsync_(key2, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key2, node, visitor, path) {
      if (typeof visitor === "function")
        return visitor(key2, node, path);
      if (identity.isMap(node))
        return visitor.Map?.(key2, node, path);
      if (identity.isSeq(node))
        return visitor.Seq?.(key2, node, path);
      if (identity.isPair(node))
        return visitor.Pair?.(key2, node, path);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key2, node, path);
      if (identity.isAlias(node))
        return visitor.Alias?.(key2, node, path);
      return void 0;
    }
    function replaceNode(key2, path, node) {
      const parent = path[path.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key2] = node;
      } else if (identity.isPair(parent)) {
        if (key2 === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports2.visit = visit;
    exports2.visitAsync = visitAsync;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/doc/directives.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports2.Directives = Directives;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/doc/anchors.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports2.anchorIsValid = anchorIsValid;
    exports2.anchorNames = anchorNames;
    exports2.createNodeAnchors = createNodeAnchors;
    exports2.findNewAnchor = findNewAnchor;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/doc/applyReviver.js"(exports2) {
    "use strict";
    function applyReviver(reviver, obj, key2, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key2, val);
    }
    exports2.applyReviver = applyReviver;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/nodes/toJS.js"(exports2) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports2.toJS = toJS;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/nodes/Node.js"(exports2) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports2.NodeBase = NodeBase;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/nodes/Alias.js"(exports2) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const { anchors: anchors2, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (!data) {
          toJS.toJS(source, null, ctx);
          data = anchors2.get(source);
        }
        if (data?.res === void 0) {
          const msg = "This should not happen: Alias anchor was not resolved?";
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
          data.count += 1;
          if (data.aliasCount === 0)
            data.aliasCount = getAliasCount(doc, source, anchors2);
          if (data.count * data.aliasCount > maxAliasCount) {
            const msg = "Excessive alias count indicates a resource exhaustion attack";
            throw new ReferenceError(msg);
          }
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports2.Alias = Alias;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/nodes/Scalar.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports2.Scalar = Scalar;
    exports2.isScalarValue = isScalarValue;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/doc/createNode.js"(exports2) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports2.createNode = createNode;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/nodes/Collection.js"(exports2) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path, value) {
      let v = value;
      for (let i = path.length - 1; i >= 0; --i) {
        const k = path[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path, value) {
        if (isEmptyPath(path))
          this.add(value);
        else {
          const [key2, ...rest] = path;
          const node = this.get(key2, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key2, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key2}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        const [key2, ...rest] = path;
        if (rest.length === 0)
          return this.delete(key2);
        const node = this.get(key2, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key2}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        const [key2, ...rest] = path;
        const node = this.get(key2, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path) {
        const [key2, ...rest] = path;
        if (rest.length === 0)
          return this.has(key2);
        const node = this.get(key2, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        const [key2, ...rest] = path;
        if (rest.length === 0) {
          this.set(key2, value);
        } else {
          const node = this.get(key2, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key2, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key2}. Remaining path: ${rest}`);
        }
      }
    };
    exports2.Collection = Collection;
    exports2.collectionFromPath = collectionFromPath;
    exports2.isEmptyPath = isEmptyPath;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/stringify/stringifyComment.js"(exports2) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports2.indentComment = indentComment;
    exports2.lineComment = lineComment;
    exports2.stringifyComment = stringifyComment;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/stringify/foldFlowLines.js"(exports2) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text3, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text3;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text3.length <= endStep)
        return text3;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text3, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text3[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text3[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text3, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text3[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text3[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text3;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text3;
      if (onFold)
        onFold();
      let res = text3.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text3.length;
        if (fold === 0)
          res = `
${indent}${text3.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text3[fold]}\\`;
          res += `
${indent}${text3.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text3, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text3[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text3[++i];
        } else {
          do {
            ch = text3[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text3[start];
        }
      }
      return end;
    }
    exports2.FOLD_BLOCK = FOLD_BLOCK;
    exports2.FOLD_FLOW = FOLD_FLOW;
    exports2.FOLD_QUOTED = FOLD_QUOTED;
    exports2.foldFlowLines = foldFlowLines;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/stringify/stringifyString.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body2 = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body2}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports2.stringifyString = stringifyString;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/stringify/stringify.js"(exports2) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify2(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports2.createStringifyContext = createStringifyContext;
    exports2.stringify = stringify2;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/stringify/stringifyPair.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key: key2, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key2) && key2.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key2) || !identity.isNode(key2) && typeof key2 === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key2 || keyComment && value == null && !ctx.inFlow || identity.isCollection(key2) || (identity.isScalar(key2) ? key2.type === Scalar.Scalar.BLOCK_FOLDED || key2.type === Scalar.Scalar.BLOCK_LITERAL : typeof key2 === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify2.stringify(key2, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify2.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports2.stringifyPair = stringifyPair;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/log.js"(exports2) {
    "use strict";
    var node_process = require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports2.debug = debug;
    exports2.warn = warn;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key2) => (merge.identify(key2) || identity.isScalar(key2) && (!key2.type || key2.type === Scalar.Scalar.PLAIN) && merge.identify(key2.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key2, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key2))
            map.set(key2, value2);
        } else if (map instanceof Set) {
          map.add(key2);
        } else if (!Object.prototype.hasOwnProperty.call(map, key2)) {
          Object.defineProperty(map, key2, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports2.addMergeToJSMap = addMergeToJSMap;
    exports2.isMergeKey = isMergeKey;
    exports2.merge = merge;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports2) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify2 = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key: key2, value }) {
      if (identity.isNode(key2) && key2.addToJSMap)
        key2.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key2))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key2, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key2, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key2, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key2) && ctx?.doc) {
        const strCtx = stringify2.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key2.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports2.addPairToJSMap = addPairToJSMap;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/nodes/Pair.js"(exports2) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key2, value, ctx) {
      const k = createNode.createNode(key2, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key2, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key2;
        this.value = value;
      }
      clone(schema) {
        let { key: key2, value } = this;
        if (identity.isNode(key2))
          key2 = key2.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key2, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports2.Pair = Pair;
    exports2.createPair = createPair;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/stringify/stringifyCollection.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify3 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify3(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items: items2 }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items2.length; ++i) {
        const item = items2[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify2.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items: items2 }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items2.length; ++i) {
        const item = items2[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify2.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items2.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports2.stringifyCollection = stringifyCollection;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/nodes/YAMLMap.js"(exports2) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items2, key2) {
      const k = identity.isScalar(key2) ? key2.value : key2;
      for (const it of items2) {
        if (identity.isPair(it)) {
          if (it.key === key2 || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key2, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key2, value);
          else if (Array.isArray(replacer) && !replacer.includes(key2))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key2, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key2, value] of obj)
            add(key2, value);
        } else if (obj && typeof obj === "object") {
          for (const key2 of Object.keys(obj))
            add(key2, obj[key2]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key2) {
        const it = findPair(this.items, key2);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key2, keepScalar) {
        const it = findPair(this.items, key2);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key2) {
        return !!findPair(this.items, key2);
      }
      set(key2, value) {
        this.add(new Pair.Pair(key2, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports2.YAMLMap = YAMLMap;
    exports2.findPair = findPair;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/common/map.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports2.map = map;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/nodes/YAMLSeq.js"(exports2) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key2) {
        const idx = asItemIndex(key2);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key2, keepScalar) {
        const idx = asItemIndex(key2);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key2) {
        const idx = asItemIndex(key2);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key2, value) {
        const idx = asItemIndex(key2);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key2}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key2 = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key2, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key2) {
      let idx = identity.isScalar(key2) ? key2.value : key2;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports2.YAMLSeq = YAMLSeq;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/common/seq.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports2.seq = seq;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/common/string.js"(exports2) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports2.string = string;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/common/null.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports2.nullTag = nullTag;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/core/bool.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports2.boolTag = boolTag;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/stringify/stringifyNumber.js"(exports2) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports2.stringifyNumber = stringifyNumber;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/core/float.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports2.float = float;
    exports2.floatExp = floatExp;
    exports2.floatNaN = floatNaN;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/core/int.js"(exports2) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports2.int = int;
    exports2.intHex = intHex;
    exports2.intOct = intOct;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/core/schema.js"(exports2) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports2.schema = schema;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/json/schema.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports2.schema = schema;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports2) {
    "use strict";
    var node_buffer = require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports2.binary = binary;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key2, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key2 = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key2 = keys[0];
              value = it[key2];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key2 = it;
          }
          pairs2.items.push(Pair.createPair(key2, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports2.createPairs = createPairs;
    exports2.pairs = pairs;
    exports2.resolvePairs = resolvePairs;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key2, value;
          if (identity.isPair(pair)) {
            key2 = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key2, ctx);
          } else {
            key2 = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key2))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key2, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key: key2 } of pairs$1.items) {
          if (identity.isScalar(key2)) {
            if (seenKeys.includes(key2.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key2.value}`);
            } else {
              seenKeys.push(key2.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports2.YAMLOMap = YAMLOMap;
    exports2.omap = omap;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports2.falseTag = falseTag;
    exports2.trueTag = trueTag;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports2.float = float;
    exports2.floatExp = floatExp;
    exports2.floatNaN = floatNaN;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports2) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports2.int = int;
    exports2.intBin = intBin;
    exports2.intHex = intHex;
    exports2.intOct = intOct;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key2) {
        let pair;
        if (identity.isPair(key2))
          pair = key2;
        else if (key2 && typeof key2 === "object" && "key" in key2 && "value" in key2 && key2.value === null)
          pair = new Pair.Pair(key2.key, null);
        else
          pair = new Pair.Pair(key2, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key2, keepPair) {
        const pair = YAMLMap.findPair(this.items, key2);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key2, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key2);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key2));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports2.YAMLSet = YAMLSet;
    exports2.set = set;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports2) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports2.floatTime = floatTime;
    exports2.intTime = intTime;
    exports2.timestamp = timestamp;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports2) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports2.schema = schema;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/tags.js"(exports2) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key2) => key2 !== "yaml11").map((key2) => JSON.stringify(key2)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key2) => JSON.stringify(key2)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports2.coreKnownTags = coreKnownTags;
    exports2.getTags = getTags;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/schema/Schema.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports2.Schema = Schema;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/stringify/stringifyDocument.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify2.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body2 = stringify2.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body2 += stringifyComment.lineComment(body2, "", commentString(contentComment));
        if ((body2[0] === "|" || body2[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body2}`;
        } else
          lines.push(body2);
      } else {
        lines.push(stringify2.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports2.stringifyDocument = stringifyDocument;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/doc/Document.js"(exports2) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key2, value, options = {}) {
        const k = this.createNode(key2, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key2) {
        return assertCollection(this.contents) ? this.contents.delete(key2) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key2, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key2, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key2) {
        return identity.isCollection(this.contents) ? this.contents.has(key2) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path) {
        if (Collection.isEmptyPath(path))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key2, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key2], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key2, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports2.Document = Document;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/errors.js"(exports2) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer2 = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer2}
`;
      }
    };
    exports2.YAMLError = YAMLError;
    exports2.YAMLParseError = YAMLParseError;
    exports2.YAMLWarning = YAMLWarning;
    exports2.prettifyError = prettifyError;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/compose/resolve-props.js"(exports2) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports2.resolveProps = resolveProps;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/compose/util-contains-newline.js"(exports2) {
    "use strict";
    function containsNewline(key2) {
      if (!key2)
        return null;
      switch (key2.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key2.source.includes("\n"))
            return true;
          if (key2.end) {
            for (const st of key2.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key2.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports2.containsNewline = containsNewline;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports2) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports2.flowIndentCheck = flowIndentCheck;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/compose/util-map-includes.js"(exports2) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items2, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items2.some((pair) => isEqual(pair.key, search));
    }
    exports2.mapIncludes = mapIncludes;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/compose/resolve-block-map.js"(exports2) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key: key2, sep: sep4, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key2 ?? sep4?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key2) {
            if (key2.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key2 && key2.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep4) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key2)) {
            onError(key2 ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key2 ? composeNode(ctx, key2, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key2, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep4 ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key2 || key2.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep4, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports2.resolveBlockMap = resolveBlockMap;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/compose/resolve-block-seq.js"(exports2) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports2.resolveBlockSeq = resolveBlockSeq;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/compose/resolve-end.js"(exports2) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep4 = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep4 + cb;
              sep4 = "";
              break;
            }
            case "newline":
              if (comment)
                sep4 += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports2.resolveEnd = resolveEnd;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key: key2, sep: sep4, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key2 ?? sep4?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep4 && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key2))
            onError(
              key2,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep4 && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep4, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key2 ? composeNode(ctx, key2, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key2))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep4 ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep4)
                for (const st of sep4) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep4, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports2.resolveFlowCollection = resolveFlowCollection;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/compose/compose-collection.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports2.composeCollection = composeCollection;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep4 = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep4 + indent.slice(trimIndent) + content;
          sep4 = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep4 === " ")
            sep4 = "\n";
          else if (!prevMoreIndented && sep4 === "\n")
            sep4 = "\n\n";
          value += sep4 + indent.slice(trimIndent) + content;
          sep4 = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep4 === "\n")
            value += "\n";
          else
            sep4 = "\n";
        } else {
          value += sep4 + content;
          sep4 = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports2.resolveBlockScalar = resolveBlockScalar;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return foldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first, line;
      try {
        first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
        line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
      } catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first.exec(source);
      if (!match)
        return source;
      let res = match[1];
      let sep4 = " ";
      let pos = first.lastIndex;
      line.lastIndex = pos;
      while (match = line.exec(source)) {
        if (match[1] === "") {
          if (sep4 === "\n")
            res += sep4;
          else
            sep4 = "\n";
        } else {
          res += sep4 + match[1];
          sep4 = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep4 + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports2.resolveFlowScalar = resolveFlowScalar;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/compose/compose-scalar.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports2.composeScalar = composeScalar;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports2) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports2.emptyScalarPosition = emptyScalarPosition;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/compose/compose-node.js"(exports2) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports2.composeEmptyNode = composeEmptyNode;
    exports2.composeNode = composeNode;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/compose/compose-doc.js"(exports2) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports2.composeDoc = composeDoc;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/compose/composer.js"(exports2) {
    "use strict";
    var node_process = require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports2.Composer = Composer;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/parse/cst-scalar.js"(exports2) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context2) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context2;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context2.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body2 = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body2 };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context2 = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context2;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body2 = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body2;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key2 of Object.keys(token))
          if (key2 !== "type" && key2 !== "offset")
            delete token[key2];
        Object.assign(token, { type: "block-scalar", indent, props, source: body2 });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key2 of Object.keys(token))
            if (key2 !== "type" && key2 !== "offset")
              delete token[key2];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports2.createScalarToken = createScalarToken;
    exports2.resolveAsScalar = resolveAsScalar;
    exports2.setScalarValue = setScalarValue;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/parse/cst-stringify.js"(exports2) {
    "use strict";
    var stringify2 = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key: key2, sep: sep4, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key2)
        res += stringifyToken(key2);
      if (sep4)
        for (const st of sep4)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports2.stringify = stringify2;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/parse/cst-visit.js"(exports2) {
    "use strict";
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path) => {
      let item = cst;
      for (const [field, index] of path) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path) => {
      const parent = visit.itemAtPath(cst, path.slice(0, -1));
      const field = path[path.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path, item, visitor) {
      let ctrl = visitor(item, path);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
    }
    exports2.visit = visit;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/parse/cst.js"(exports2) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports2.createScalarToken = cstScalar.createScalarToken;
    exports2.resolveAsScalar = cstScalar.resolveAsScalar;
    exports2.setScalarValue = cstScalar.setScalarValue;
    exports2.stringify = cstStringify.stringify;
    exports2.visit = cstVisit.visit;
    exports2.BOM = BOM;
    exports2.DOCUMENT = DOCUMENT;
    exports2.FLOW_END = FLOW_END;
    exports2.SCALAR = SCALAR;
    exports2.isCollection = isCollection;
    exports2.isScalar = isScalar;
    exports2.prettyToken = prettyToken;
    exports2.tokenType = tokenType;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/parse/lexer.js"(exports2) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote2 = this.charAt(0);
        let end = this.buffer.indexOf(quote2, this.pos + 1);
        if (quote2 === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports2.Lexer = Lexer;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/parse/line-counter.js"(exports2) {
    "use strict";
    var LineCounter2 = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports2.LineCounter = LineCounter2;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/parse/parser.js"(exports2) {
    "use strict";
    var node_process = require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep4;
          if (scalar.end) {
            sep4 = scalar.end;
            sep4.push(this.sourceToken);
            delete scalar.end;
          } else
            sep4 = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep: sep4 }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key2 = it.key;
                  const sep4 = it.sep;
                  sep4.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key: key2, sep: sep4 }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep4 = fc.end.splice(1, fc.end.length);
            sep4.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep: sep4 }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports2.Parser = Parser;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/public-api.js"(exports2) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument2(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse3(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument2(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify2(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports2.parse = parse3;
    exports2.parseAllDocuments = parseAllDocuments;
    exports2.parseDocument = parseDocument2;
    exports2.stringify = stringify2;
  }
});

// ../../node_modules/toolcraft/node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "../../node_modules/toolcraft/node_modules/yaml/dist/index.js"(exports2) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports2.Composer = composer.Composer;
    exports2.Document = Document.Document;
    exports2.Schema = Schema.Schema;
    exports2.YAMLError = errors.YAMLError;
    exports2.YAMLParseError = errors.YAMLParseError;
    exports2.YAMLWarning = errors.YAMLWarning;
    exports2.Alias = Alias.Alias;
    exports2.isAlias = identity.isAlias;
    exports2.isCollection = identity.isCollection;
    exports2.isDocument = identity.isDocument;
    exports2.isMap = identity.isMap;
    exports2.isNode = identity.isNode;
    exports2.isPair = identity.isPair;
    exports2.isScalar = identity.isScalar;
    exports2.isSeq = identity.isSeq;
    exports2.Pair = Pair.Pair;
    exports2.Scalar = Scalar.Scalar;
    exports2.YAMLMap = YAMLMap.YAMLMap;
    exports2.YAMLSeq = YAMLSeq.YAMLSeq;
    exports2.CST = cst;
    exports2.Lexer = lexer.Lexer;
    exports2.LineCounter = lineCounter.LineCounter;
    exports2.Parser = parser.Parser;
    exports2.parse = publicApi.parse;
    exports2.parseAllDocuments = publicApi.parseAllDocuments;
    exports2.parseDocument = publicApi.parseDocument;
    exports2.stringify = publicApi.stringify;
    exports2.visit = visit.visit;
    exports2.visitAsync = visit.visitAsync;
  }
});

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var import_node_child_process3 = require("node:child_process");
var import_node_fs4 = require("node:fs");
var import_promises7 = require("node:fs/promises");
var import_node_path5 = require("node:path");
var import_node_util2 = require("node:util");
var vscode = __toESM(require("vscode"));

// ../wire-core/src/core/json.ts
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
    const items3 = value.map((item) => serialize(item, indent, level + 1));
    return indent === void 0 ? `[${items3.join(",")}]` : `[
${childIndent}${items3.join(`,
${childIndent}`)}
${currentIndent}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) => compareStrings(left, right));
  if (entries.length === 0) {
    return "{}";
  }
  const items2 = entries.map(([key2, item]) => `${quote(key2)}${indent === void 0 ? ":" : ": "}${serialize(item, indent, level + 1)}`);
  return indent === void 0 ? `{${items2.join(",")}}` : `{
${childIndent}${items2.join(`,
${childIndent}`)}
${currentIndent}}`;
}
function stableJsonCompact(value) {
  return serialize(value, void 0, 0);
}
function stableJsonPretty(value) {
  return serialize(value, 2, 0);
}

// ../wire-core/src/core/resource.ts
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
      resource.identifiers.map((identifier2) => Object.freeze({ service: identifier2.service, identifier: identifier2.identifier })).sort((left, right) => compareStrings2(left.service, right.service) || compareStrings2(left.identifier, right.identifier))
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

// ../wire-core/src/core/source.ts
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

// ../wire-core/src/core/transform.ts
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

// ../wire-core/src/runtime/cookies.ts
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
  const object5 = value;
  if (Array.isArray(object5["cookies"])) return Object.freeze(object5["cookies"].map((cookie) => jsonCookie(cookie, domain)));
  if ("name" in object5 && "value" in object5) return Object.freeze([jsonCookie(object5, domain)]);
  return Object.freeze(Object.entries(object5).map(([name, cookieValue]) => frozenCookie({
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

// ../wire-core/src/runtime/chrome.ts
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
var chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
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
    return new Promise((resolve5, reject) => {
      this.socket.addEventListener("open", () => resolve5(), { once: true });
      this.socket.addEventListener("error", (event) => reject(event), { once: true });
    });
  }
  request(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve5, reject) => {
      if (this.closed) {
        reject(new Error("Chrome window closed before login completed"));
        return;
      }
      this.pending.set(id, { resolve: resolve5, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  event(method) {
    return new Promise((resolve5, reject) => {
      if (this.closed) {
        reject(new Error("Chrome window closed before login completed"));
        return;
      }
      const events = this.events.get(method) ?? [];
      events.push({ resolve: resolve5, reject });
      this.events.set(method, events);
    });
  }
  close() {
    this.socket.close();
  }
};
function devtoolsUrl(stderr2) {
  return new Promise((resolve5, reject) => {
    let contents = "";
    stderr2.setEncoding("utf8");
    stderr2.on("data", (chunk) => {
      contents += chunk;
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(contents);
      if (match !== null) resolve5(match[1]);
    });
    stderr2.on("end", () => reject(new Error(contents === "" ? "Chrome exited before DevTools started. A Wire Chrome window is already open from a previous login; close it and retry." : contents)));
  });
}
async function closeChrome(chrome, connection, pageConnection) {
  const closed = new Promise((resolve5) => chrome.once("exit", resolve5));
  if (pageConnection !== void 0) pageConnection.close();
  connection.close();
  process.kill(-chrome.pid, "SIGTERM");
  await closed;
}
async function pageDevtoolsUrl(browserUrl, domains) {
  const endpoint2 = new URL(browserUrl);
  endpoint2.protocol = "http:";
  endpoint2.pathname = "/json/list";
  endpoint2.search = "";
  endpoint2.hash = "";
  const targets = await (await fetch(endpoint2)).json();
  return targets.find((target) => target.type === "page" && domains.some((domain) => new URL(target.url).hostname === domain || new URL(target.url).hostname.endsWith(`.${domain}`))).webSocketDebuggerUrl;
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
  return new Promise((resolve5) => setTimeout(resolve5, milliseconds));
}
async function headlessChromeConnection(environment2) {
  const chrome = (0, import_node_child_process.spawn)(chromeExecutable, [`--user-data-dir=${chromeUserDataDir(environment2)}`, "--remote-debugging-port=0", "--headless=new", "--no-first-run", "--no-default-browser-check", "about:blank"], { detached: true, stdio: ["ignore", "ignore", "pipe"] });
  const connection = new ChromeConnection(await devtoolsUrl(chrome.stderr));
  await connection.opened();
  return Object.freeze({ chrome, connection });
}
async function expireServiceCookies(connection, domains) {
  const serviceDomain = (domain) => {
    const bare = domain.startsWith(".") ? domain.slice(1) : domain;
    return domains.some((value) => bare === value || bare.endsWith(`.${value}`));
  };
  const stored = await connection.request("Storage.getCookies");
  const expiredCopies = stored.cookies.filter((cookie) => serviceDomain(cookie.domain)).map((cookie) => ({
    name: cookie.name,
    value: "",
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    expires: 1,
    ...cookie.sameSite === void 0 ? {} : { sameSite: cookie.sameSite },
    ...cookie.sourceScheme === void 0 ? {} : { sourceScheme: cookie.sourceScheme },
    ...cookie.sourcePort === void 0 ? {} : { sourcePort: cookie.sourcePort },
    ...cookie.partitionKey === void 0 ? {} : { partitionKey: cookie.partitionKey }
  }));
  if (expiredCopies.length > 0) await connection.request("Storage.setCookies", { cookies: expiredCopies });
}
async function extractDetachedChromeCookies(environment2, extraction) {
  await (0, import_promises2.mkdir)(chromeUserDataDir(environment2), { recursive: true });
  const prep = await headlessChromeConnection(environment2);
  await expireServiceCookies(prep.connection, extraction.domains);
  await closeChrome(prep.chrome, prep.connection);
  const chrome = (0, import_node_child_process.spawn)(chromeExecutable, [`--user-data-dir=${chromeUserDataDir(environment2)}`, "--no-first-run", "--no-default-browser-check", extraction.startUrl], { detached: true, stdio: ["ignore", "ignore", "ignore"] });
  import_node_process.stderr.write(`
Log in to ${extraction.service} in the opened Chrome window, then quit Chrome (Cmd+Q). Wire picks up the session after Chrome exits.
`);
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    process.kill(-chrome.pid, "SIGTERM");
  };
  process.on("SIGINT", interrupt);
  await new Promise((resolve5) => chrome.once("exit", resolve5));
  process.off("SIGINT", interrupt);
  await sleep(500);
  const harvest = await headlessChromeConnection(environment2);
  const stored = await harvest.connection.request("Storage.getCookies");
  await closeChrome(harvest.chrome, harvest.connection);
  const cookies = chromeCookies(stored.cookies, extraction.domains);
  if (interrupted) {
    const save = await confirmSaveLogin();
    if (!save) throw new Error("Login not saved");
    return Object.freeze({ cookies, metadata: Object.freeze({}), manual: true });
  }
  if (!extraction.ready(cookies)) throw new Error(`${extraction.service} login did not complete: the Chrome window was quit before login finished.`);
  return Object.freeze({ cookies, metadata: Object.freeze({}) });
}
async function extractChromeCookies(environment2, extraction) {
  if (extraction.freshSession === true) return extractDetachedChromeCookies(environment2, extraction);
  const profile = chromeUserDataDir(environment2);
  await (0, import_promises2.mkdir)(profile, { recursive: true });
  const chrome = (0, import_node_child_process.spawn)(chromeExecutable, [...await chromeLaunchArguments(environment2, extraction.startUrl)], { detached: true, stdio: ["ignore", "ignore", "pipe"] });
  let interrupted = false;
  let interrupting = false;
  let interruptResult;
  let interruptResolve = () => {
  };
  const interruptPromise = new Promise((resolve5) => {
    interruptResolve = resolve5;
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
  const pageConnection = extraction.metadataExpression === void 0 ? void 0 : new ChromeConnection(await pageDevtoolsUrl(browserUrl, extraction.domains));
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
    const result = await currentResult();
    const manualResult = await interruptedResult();
    if (manualResult !== void 0) return manualResult;
    if (extraction.ready(result.cookies)) {
      const metadata = result.metadata;
      if (extraction.metadataExpression !== void 0) {
        if (Object.keys(metadata).length === 0) {
          await Promise.race([sleep(1e3), interruptPromise]);
          const interruptedMetadataResult = await interruptedResult();
          if (interruptedMetadataResult !== void 0) return interruptedMetadataResult;
          continue;
        }
      }
      if (!await Promise.race([extraction.verify(result.cookies, metadata), interruptPromise.then(() => false)])) {
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

// ../wire-core/src/runtime/google.ts
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

// ../wire-core/src/storage/registry.ts
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
function fileResourceName(resourceId3) {
  if (resourceId3 !== "." && resourceId3 !== ".." && !resourceId3.includes("/") && !resourceId3.includes("\\") && !resourceId3.includes("\0")) return `${resourceId3}.json`;
  return `~${Buffer.from(resourceId3).toString("base64url")}.json`;
}
function parseResource(value) {
  return JSON.parse(value);
}
function assertUnique(values2) {
  if (new Set(values2).size !== values2.length) throw new Error(JSON.stringify(values2));
}
function assertUniqueFileResource(resource) {
  assertUnique(resource.identifiers.map((identifier2) => JSON.stringify([identifier2.service, identifier2.identifier])));
  assertUnique(resource.urls);
  assertUnique(resource.filesystem_links.map((link) => JSON.stringify([link.path, link.role])));
  assertUnique(resource.data.map((item) => JSON.stringify([item.namespace, item.key])));
  assertUnique(resource.relationships.map((relationship) => JSON.stringify([resource.id, relationship.target_id, relationship.type])));
}
function missingResource(resourceId3) {
  return new Error(`Resource not found: ${resourceId3}`);
}
function missingIdentifier(service, identifier2) {
  return new Error(`Resource identifier not found: ${service}/${identifier2}`);
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
    for (const identifier2 of normalized.identifiers) {
      const row = database.prepare("SELECT resource_id FROM resource_identifiers WHERE service = ? AND identifier = ? AND resource_id != ?").get(identifier2.service, identifier2.identifier, normalized.id);
      if (row !== void 0) {
        database.close();
        throw new Error(`${identifier2.service}/${identifier2.identifier}`);
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
  async get(resourceId3) {
    const database = this.connect();
    const row = database.prepare("SELECT id FROM resources WHERE id = ?").get(resourceId3);
    if (row === void 0) {
      database.close();
      throw missingResource(resourceId3);
    }
    database.exec("BEGIN");
    const resource = this.getResource(database, resourceId3);
    database.exec("COMMIT");
    database.close();
    return resource;
  }
  async findByIdentifier(service, identifier2) {
    const database = this.connect();
    database.exec("BEGIN");
    const row = database.prepare("SELECT resource_id FROM resource_identifiers WHERE service = ? AND identifier = ?").get(service, identifier2);
    if (row === void 0) {
      database.close();
      throw missingIdentifier(service, identifier2);
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
  async delete(resourceId3) {
    const database = this.connect();
    database.prepare("DELETE FROM resources WHERE id = ?").run(resourceId3);
    database.close();
  }
  getResource(database, resourceId3) {
    const row = database.prepare("SELECT id, type FROM resources WHERE id = ?").get(resourceId3);
    if (row === void 0) throw missingResource(resourceId3);
    const identifiers = database.prepare("SELECT service, identifier FROM resource_identifiers WHERE resource_id = ? ORDER BY service, identifier").all(resourceId3);
    const urls = database.prepare("SELECT url FROM resource_urls WHERE resource_id = ? ORDER BY url").all(resourceId3);
    const links = database.prepare("SELECT path, role, data_json FROM filesystem_links WHERE resource_id = ? ORDER BY path, role").all(resourceId3);
    const data = database.prepare("SELECT namespace, key, value_json FROM resource_data WHERE resource_id = ? ORDER BY namespace, key").all(resourceId3);
    const relationships = database.prepare("SELECT target_id, type, data_json FROM resource_relationships WHERE source_id = ? ORDER BY type, target_id").all(resourceId3);
    return {
      id: row.id,
      type: row.type,
      identifiers: identifiers.map((identifier2) => ({ service: identifier2.service, identifier: identifier2.identifier })),
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
    for (const identifier2 of normalized.identifiers) {
      if (existingResources.some((existing) => existing.identifiers.some((item) => item.service === identifier2.service && item.identifier === identifier2.identifier))) {
        throw new Error(`${identifier2.service}/${identifier2.identifier}`);
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
  async get(resourceId3) {
    if (!(0, import_node_fs.existsSync)(this.resourcePath(resourceId3))) throw missingResource(resourceId3);
    return parseResource(await (0, import_promises3.readFile)(this.resourcePath(resourceId3), "utf8"));
  }
  async findByIdentifier(service, identifier2) {
    const resource = (await this.listResources()).find((item) => item.identifiers.some((value) => value.service === service && value.identifier === identifier2));
    if (resource === void 0) throw missingIdentifier(service, identifier2);
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
  async delete(resourceId3) {
    await (0, import_promises3.unlink)(this.resourcePath(resourceId3));
  }
  resourcePath(resourceId3) {
    return (0, import_node_path.join)(this.path, fileResourceName(resourceId3));
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

// ../wire-core/src/storage/workspace.ts
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
  const config2 = await loadWireConfig(wireRoot2);
  const registryPath = (0, import_node_path2.join)(wireRoot2, config2.path);
  if (config2.backend === "sqlite") return new SqliteRegistry(registryPath);
  if (config2.backend === "files") return new FileRegistry(registryPath);
  throw new Error(config2.backend);
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
  const config2 = { backend, path: registryPath };
  await (0, import_promises4.writeFile)(configPath, `${stableJsonPretty(config2)}
`, "utf8");
  const fullRegistryPath = (0, import_node_path2.join)(wireRoot2, registryPath);
  if (backend === "sqlite") new SqliteRegistry(fullRegistryPath);
  else if (backend === "files") new FileRegistry(fullRegistryPath);
  else throw new Error(backend);
  return { root: wireRoot2, backend, path: fullRegistryPath, created: true };
}

// ../wire-core/src/operations.ts
var import_node_crypto2 = require("node:crypto");
var import_node_path3 = require("node:path");
var wireWatchHooks = Symbol("wireWatchHooks");
async function wireRoot(dependencies, path) {
  const configured = await dependencies.workspace.configuredRoot(path, dependencies.home);
  if (configured !== null) return configured;
  return (await dependencies.workspace.initialize(dependencies.home, dependencies.initialization.backend, dependencies.initialization.registryPath)).root;
}
function watchConfig(config2) {
  return {
    mode: config2.watch?.mode ?? "two-way",
    debounceMs: config2.watch?.debounceMs ?? 1e3,
    pollMs: config2.watch?.pollMs ?? 6e4
  };
}
function primaryLink(resource) {
  return resource.filesystem_links.find((link) => link.role === "primary");
}
function collisionFilename(title2, service, identifier2) {
  const base = markdownFilename(title2).slice(0, -3);
  const suffix = `${service}-${identifier2}`.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  const compact2 = suffix.length <= 48 ? suffix : `${suffix.slice(0, 32).replace(/[-_.]+$/g, "")}-${(0, import_node_crypto2.createHash)("sha256").update(suffix).digest("hex").slice(0, 10)}`;
  return `${base}-${compact2}.md`;
}
async function availableMarkdownPath(directory, title2, service, identifier2, occupied) {
  const cleanPath = (0, import_node_path3.join)((0, import_node_path3.resolve)(directory), markdownFilename(title2));
  if (!await occupied(cleanPath)) return cleanPath;
  const fallback = (0, import_node_path3.join)((0, import_node_path3.resolve)(directory), collisionFilename(title2, service, identifier2));
  let candidate = fallback;
  let number = 2;
  while (await occupied(candidate)) candidate = `${fallback.slice(0, -3)}-${number++}.md`;
  return candidate;
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
async function existingResource(registry, service, identifier2) {
  const resources = await registry.listResources();
  return resources.find((resource) => resource.identifiers.some((item) => item.service === service && item.identifier === identifier2)) ?? null;
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
function storedSnapshot(fetched) {
  if (!jsonObject(fetched.data)) return fetched.data;
  return { ...fetched.data, markdown: fetched.markdown };
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
      outputPath = await availableMarkdownPath(path, fetched.title, source.service, source.identifier, async (candidate) => await dependencies.filesystem.exists(candidate) || (await registry.findByPath(dependencies.workspace.relativePath(candidate, root))).length > 0);
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
        { namespace: source.service, key: "snapshot", value: storedSnapshot(fetched) }
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
    const source = parseSourceUrl(url, dependencies.catalog);
    const directory = (0, import_node_path3.resolve)(path);
    const downloadPath = (path2) => {
      const target = (0, import_node_path3.resolve)(directory, path2);
      const child = (0, import_node_path3.relative)(directory, target);
      if ((0, import_node_path3.isAbsolute)(path2) || path2.includes("\\") || child === "" || child === ".." || child.startsWith(`..${import_node_path3.sep}`)) throw new Error(`Unsafe download path: ${path2}`);
      return target;
    };
    const service = dependencies.catalog.find((item) => item.matches(new URL(url)));
    const downloaded = await service.download?.(dependencies.fetchInput, url, source, async (relative3, contents) => {
      const target = downloadPath(relative3);
      if (typeof contents === "string") await dependencies.filesystem.writeText(target, contents);
      else {
        if (dependencies.filesystem.writeBytes === void 0) throw new Error("This filesystem does not support binary downloads");
        await dependencies.filesystem.writeBytes(target, contents);
      }
    });
    const fetched = downloaded ?? await fetchSource(dependencies.fetchInput, url, dependencies.catalog);
    const outputPath = downloaded == null ? await availableMarkdownPath(directory, fetched.title, source.service, source.identifier, async (candidate) => await dependencies.filesystem.exists(candidate) && (!await dependencies.filesystem.isFile(candidate) || await dependencies.filesystem.readText(candidate) !== fetched.markdown)) : downloadPath(downloaded.path);
    const previous = await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : "";
    await dependencies.filesystem.writeText(outputPath, fetched.markdown);
    const id = resourceId(source);
    const resource = {
      id,
      type: source.type,
      identifiers: [{ service: source.service, identifier: source.identifier }],
      urls: [url],
      filesystem_links: [{ path: (0, import_node_path3.relative)(directory, outputPath), role: "primary", data: { format: "markdown" } }],
      data: [
        { namespace: "wire", key: "title", value: fetched.title },
        { namespace: "wire", key: "synced_at", value: dependencies.now().toISOString() },
        { namespace: source.service, key: "snapshot", value: storedSnapshot(fetched) }
      ],
      relationships: extractRelationships(fetched.markdown, id, dependencies.catalog)
    };
    return { resource, path: outputPath, markdown: fetched.markdown, summary: { action: downloaded?.error === void 0 ? "downloaded" : "failed", ...changeSummary(previous, fetched.markdown), remote: url, local: outputPath, ...downloaded?.error === void 0 ? {} : { error: downloaded.error } } };
  };
  const resolveResource = async (registry, value, root, path) => {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      const source = parseSourceUrl(value, dependencies.catalog);
      const resources2 = await registry.listResources();
      const resource = resources2.find((item) => item.identifiers.some((identifier2) => identifier2.service === source.service && identifier2.identifier === source.identifier));
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
    const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
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
    const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const resource = await resolveResource(registry, value, root, path);
    const outputPath = (0, import_node_path3.join)((0, import_node_path3.dirname)(root), primaryLink(resource).path);
    const markdown = await dependencies.filesystem.exists(outputPath) ? await dependencies.filesystem.readText(outputPath) : "";
    const fetched = await fetchSource(dependencies.fetchInput, resource.urls[0], dependencies.catalog);
    return store(resource.urls[0], (0, import_node_path3.dirname)(outputPath), fetched, markdown, "downloaded", void 0, void 0, fetched.markdown);
  };
  const detach = async (value, path) => {
    const candidatePath = (0, import_node_path3.resolve)(path, value);
    const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
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
  const runWatchHooks = async (hooks, command, result) => {
    let current = result;
    for (const hook of hooks) current = await hook(command, current);
    return current;
  };
  const watchWithHooks = async (value, path, hooks) => {
    const candidatePath = (0, import_node_path3.resolve)(path, value);
    const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
    const config2 = watchConfig(await dependencies.workspace.loadConfig(root));
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const resource = await resolveResource(registry, value, root, path);
    const outputPath = (0, import_node_path3.join)((0, import_node_path3.dirname)(root), primaryLink(resource).path);
    const initial = await dependencies.filesystem.exists(outputPath) ? null : await runWatchHooks(hooks, "download", await download(value, path));
    let lastSyncedMarkdown = initial === null ? await dependencies.filesystem.readText(outputPath) : initial.markdown;
    let debounce;
    let resolveClosed;
    const closed = new Promise((resolveClosedPromise) => {
      resolveClosed = resolveClosedPromise;
    });
    const handles = [];
    const synchronize = async () => {
      const result = config2.mode === "download" ? await runWatchHooks(hooks, "download", await download(value, path)) : await runWatchHooks(hooks, "sync", await sync(value, path));
      lastSyncedMarkdown = result.markdown;
    };
    const schedule = () => {
      if (debounce !== void 0) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = void 0;
        void synchronize();
      }, config2.debounceMs);
    };
    handles.push(dependencies.watch.every(config2.pollMs, synchronize));
    if (config2.mode === "two-way") {
      handles.push(dependencies.watch.watchFile(outputPath, async () => {
        if (await dependencies.filesystem.readText(outputPath) !== lastSyncedMarkdown) schedule();
      }));
    }
    return Object.freeze({
      resource,
      path: outputPath,
      mode: config2.mode,
      debounceMs: config2.debounceMs,
      pollMs: config2.pollMs,
      closed,
      close: () => {
        if (debounce !== void 0) clearTimeout(debounce);
        for (const handle of handles) handle.close();
        resolveClosed();
      }
    });
  };
  const watch = (value, path) => watchWithHooks(value, path, []);
  const openResource2 = async (value, path) => {
    const candidatePath = (0, import_node_path3.resolve)(path, value);
    const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
    const registry = await dependencies.workspace.openRegistry(root, dependencies.home);
    const resource = await resolveResource(registry, value, root, path);
    await dependencies.open(resource.urls[0]);
    return resource;
  };
  const syncAll = async (path) => {
    const root = await wireRoot(dependencies, path);
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
    const root = await wireRoot(dependencies, path);
    return (await dependencies.workspace.openRegistry(root, dependencies.home)).listResources();
  };
  const showResource = async (value, path) => {
    const candidatePath = (0, import_node_path3.resolve)(path, value);
    const root = await wireRoot(dependencies, await dependencies.filesystem.exists(candidatePath) ? candidatePath : path);
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
    switchBackend: async (path) => {
      const root = await wireRoot(dependencies, path);
      return dependencies.workspace.switchBackend((0, import_node_path3.dirname)(root), dependencies.home);
    },
    [wireWatchHooks]: watchWithHooks
  });
}

// ../wire/src/auth.ts
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
  const headers = response.headers;
  const values2 = headers.getSetCookie?.();
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
  const text3 = await response.text();
  if (!text3.startsWith("{")) return null;
  const session = JSON.parse(text3);
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
  const text3 = await response.text();
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text3)?.[0];
  if (email === void 0) return null;
  return Object.freeze({ service: "gmail", identity: Object.freeze({ email }) });
}
async function verifyGoogleDocsCookies(runtime2, cookies) {
  const response = await runtime2.http.request("https://docs.google.com/document/u/0/?tgif=d", { headers: { cookie: cookieHeader(cookies), accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0" } });
  if (!response.ok || !response.url.startsWith("https://docs.google.com/")) return null;
  const text3 = await response.text();
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text3)?.[0];
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
  const extract = async (service, startUrl, domains, ready, metadataExpression, freshSession) => {
    const extraction = { service, startUrl, domains, ready, verify: async (values2, metadata) => (await verifyCookieState(service, values2, metadata)).result !== null, ...metadataExpression === void 0 ? {} : { metadataExpression }, ...freshSession === void 0 ? {} : { freshSession } };
    const result = await extractCookies(environment2, extraction);
    if (result.manual === true) {
      await saveCookies(service, result.cookies, result.metadata);
      return Object.freeze({ service, identity: Object.freeze({ saved: true }) });
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
    extractChatgpt: () => extract("chatgpt", "https://chatgpt.com/", ["chatgpt.com", "openai.com"], (values2) => values2.some((cookie) => cookie.name === "oai-did") && values2.some((cookie) => cookie.name === "__Secure-next-auth.session-token" || cookie.name === "__Secure-next-auth.session-token.0"), void 0, true),
    extractGmail: () => extract("gmail", "https://mail.google.com/mail/u/0/", ["google.com"], googleReady),
    extractGoogleDocs: () => extract("google-docs", "https://docs.google.com/", ["google.com"], googleReady),
    extractNotion: () => extract("notion", "https://www.notion.so/login", ["notion.so", "notion.com"], requiredReady(["token_v2", "notion_user_id", "notion_users"])),
    extractSlack: () => extract("slack", "https://app.slack.com/client", ["slack.com"], requiredReady(["d"]), `(() => { const value = localStorage.getItem("localConfig_v2"); if (value === null) return {}; const team = Object.values(JSON.parse(value).teams)[0]; if (team === undefined) return {}; return { origin: new URL(team.url).origin, token: team.token }; })()`),
    extractZoom: () => extract("zoom", "https://hub.zoom.us/", ["zoom.us"], requiredReady(["zm_aid", "_zm_ssid"]))
  });
  return auth2;
}

// ../wire/src/hooks.ts
var import_node_child_process2 = require("node:child_process");
var import_node_fs3 = require("node:fs");
var import_promises5 = require("node:fs/promises");
var import_node_path4 = require("node:path");
var import_node_util = require("node:util");

// ../wire-core/dist/core/transform.js
var htmlEntities2 = Object.freeze({ "AElig": "\xC6", "AElig;": "\xC6", "AMP": "&", "AMP;": "&", "Aacute": "\xC1", "Aacute;": "\xC1", "Abreve;": "\u0102", "Acirc": "\xC2", "Acirc;": "\xC2", "Acy;": "\u0410", "Afr;": "\u{1D504}", "Agrave": "\xC0", "Agrave;": "\xC0", "Alpha;": "\u0391", "Amacr;": "\u0100", "And;": "\u2A53", "Aogon;": "\u0104", "Aopf;": "\u{1D538}", "ApplyFunction;": "\u2061", "Aring": "\xC5", "Aring;": "\xC5", "Ascr;": "\u{1D49C}", "Assign;": "\u2254", "Atilde": "\xC3", "Atilde;": "\xC3", "Auml": "\xC4", "Auml;": "\xC4", "Backslash;": "\u2216", "Barv;": "\u2AE7", "Barwed;": "\u2306", "Bcy;": "\u0411", "Because;": "\u2235", "Bernoullis;": "\u212C", "Beta;": "\u0392", "Bfr;": "\u{1D505}", "Bopf;": "\u{1D539}", "Breve;": "\u02D8", "Bscr;": "\u212C", "Bumpeq;": "\u224E", "CHcy;": "\u0427", "COPY": "\xA9", "COPY;": "\xA9", "Cacute;": "\u0106", "Cap;": "\u22D2", "CapitalDifferentialD;": "\u2145", "Cayleys;": "\u212D", "Ccaron;": "\u010C", "Ccedil": "\xC7", "Ccedil;": "\xC7", "Ccirc;": "\u0108", "Cconint;": "\u2230", "Cdot;": "\u010A", "Cedilla;": "\xB8", "CenterDot;": "\xB7", "Cfr;": "\u212D", "Chi;": "\u03A7", "CircleDot;": "\u2299", "CircleMinus;": "\u2296", "CirclePlus;": "\u2295", "CircleTimes;": "\u2297", "ClockwiseContourIntegral;": "\u2232", "CloseCurlyDoubleQuote;": "\u201D", "CloseCurlyQuote;": "\u2019", "Colon;": "\u2237", "Colone;": "\u2A74", "Congruent;": "\u2261", "Conint;": "\u222F", "ContourIntegral;": "\u222E", "Copf;": "\u2102", "Coproduct;": "\u2210", "CounterClockwiseContourIntegral;": "\u2233", "Cross;": "\u2A2F", "Cscr;": "\u{1D49E}", "Cup;": "\u22D3", "CupCap;": "\u224D", "DD;": "\u2145", "DDotrahd;": "\u2911", "DJcy;": "\u0402", "DScy;": "\u0405", "DZcy;": "\u040F", "Dagger;": "\u2021", "Darr;": "\u21A1", "Dashv;": "\u2AE4", "Dcaron;": "\u010E", "Dcy;": "\u0414", "Del;": "\u2207", "Delta;": "\u0394", "Dfr;": "\u{1D507}", "DiacriticalAcute;": "\xB4", "DiacriticalDot;": "\u02D9", "DiacriticalDoubleAcute;": "\u02DD", "DiacriticalGrave;": "`", "DiacriticalTilde;": "\u02DC", "Diamond;": "\u22C4", "DifferentialD;": "\u2146", "Dopf;": "\u{1D53B}", "Dot;": "\xA8", "DotDot;": "\u20DC", "DotEqual;": "\u2250", "DoubleContourIntegral;": "\u222F", "DoubleDot;": "\xA8", "DoubleDownArrow;": "\u21D3", "DoubleLeftArrow;": "\u21D0", "DoubleLeftRightArrow;": "\u21D4", "DoubleLeftTee;": "\u2AE4", "DoubleLongLeftArrow;": "\u27F8", "DoubleLongLeftRightArrow;": "\u27FA", "DoubleLongRightArrow;": "\u27F9", "DoubleRightArrow;": "\u21D2", "DoubleRightTee;": "\u22A8", "DoubleUpArrow;": "\u21D1", "DoubleUpDownArrow;": "\u21D5", "DoubleVerticalBar;": "\u2225", "DownArrow;": "\u2193", "DownArrowBar;": "\u2913", "DownArrowUpArrow;": "\u21F5", "DownBreve;": "\u0311", "DownLeftRightVector;": "\u2950", "DownLeftTeeVector;": "\u295E", "DownLeftVector;": "\u21BD", "DownLeftVectorBar;": "\u2956", "DownRightTeeVector;": "\u295F", "DownRightVector;": "\u21C1", "DownRightVectorBar;": "\u2957", "DownTee;": "\u22A4", "DownTeeArrow;": "\u21A7", "Downarrow;": "\u21D3", "Dscr;": "\u{1D49F}", "Dstrok;": "\u0110", "ENG;": "\u014A", "ETH": "\xD0", "ETH;": "\xD0", "Eacute": "\xC9", "Eacute;": "\xC9", "Ecaron;": "\u011A", "Ecirc": "\xCA", "Ecirc;": "\xCA", "Ecy;": "\u042D", "Edot;": "\u0116", "Efr;": "\u{1D508}", "Egrave": "\xC8", "Egrave;": "\xC8", "Element;": "\u2208", "Emacr;": "\u0112", "EmptySmallSquare;": "\u25FB", "EmptyVerySmallSquare;": "\u25AB", "Eogon;": "\u0118", "Eopf;": "\u{1D53C}", "Epsilon;": "\u0395", "Equal;": "\u2A75", "EqualTilde;": "\u2242", "Equilibrium;": "\u21CC", "Escr;": "\u2130", "Esim;": "\u2A73", "Eta;": "\u0397", "Euml": "\xCB", "Euml;": "\xCB", "Exists;": "\u2203", "ExponentialE;": "\u2147", "Fcy;": "\u0424", "Ffr;": "\u{1D509}", "FilledSmallSquare;": "\u25FC", "FilledVerySmallSquare;": "\u25AA", "Fopf;": "\u{1D53D}", "ForAll;": "\u2200", "Fouriertrf;": "\u2131", "Fscr;": "\u2131", "GJcy;": "\u0403", "GT": ">", "GT;": ">", "Gamma;": "\u0393", "Gammad;": "\u03DC", "Gbreve;": "\u011E", "Gcedil;": "\u0122", "Gcirc;": "\u011C", "Gcy;": "\u0413", "Gdot;": "\u0120", "Gfr;": "\u{1D50A}", "Gg;": "\u22D9", "Gopf;": "\u{1D53E}", "GreaterEqual;": "\u2265", "GreaterEqualLess;": "\u22DB", "GreaterFullEqual;": "\u2267", "GreaterGreater;": "\u2AA2", "GreaterLess;": "\u2277", "GreaterSlantEqual;": "\u2A7E", "GreaterTilde;": "\u2273", "Gscr;": "\u{1D4A2}", "Gt;": "\u226B", "HARDcy;": "\u042A", "Hacek;": "\u02C7", "Hat;": "^", "Hcirc;": "\u0124", "Hfr;": "\u210C", "HilbertSpace;": "\u210B", "Hopf;": "\u210D", "HorizontalLine;": "\u2500", "Hscr;": "\u210B", "Hstrok;": "\u0126", "HumpDownHump;": "\u224E", "HumpEqual;": "\u224F", "IEcy;": "\u0415", "IJlig;": "\u0132", "IOcy;": "\u0401", "Iacute": "\xCD", "Iacute;": "\xCD", "Icirc": "\xCE", "Icirc;": "\xCE", "Icy;": "\u0418", "Idot;": "\u0130", "Ifr;": "\u2111", "Igrave": "\xCC", "Igrave;": "\xCC", "Im;": "\u2111", "Imacr;": "\u012A", "ImaginaryI;": "\u2148", "Implies;": "\u21D2", "Int;": "\u222C", "Integral;": "\u222B", "Intersection;": "\u22C2", "InvisibleComma;": "\u2063", "InvisibleTimes;": "\u2062", "Iogon;": "\u012E", "Iopf;": "\u{1D540}", "Iota;": "\u0399", "Iscr;": "\u2110", "Itilde;": "\u0128", "Iukcy;": "\u0406", "Iuml": "\xCF", "Iuml;": "\xCF", "Jcirc;": "\u0134", "Jcy;": "\u0419", "Jfr;": "\u{1D50D}", "Jopf;": "\u{1D541}", "Jscr;": "\u{1D4A5}", "Jsercy;": "\u0408", "Jukcy;": "\u0404", "KHcy;": "\u0425", "KJcy;": "\u040C", "Kappa;": "\u039A", "Kcedil;": "\u0136", "Kcy;": "\u041A", "Kfr;": "\u{1D50E}", "Kopf;": "\u{1D542}", "Kscr;": "\u{1D4A6}", "LJcy;": "\u0409", "LT": "<", "LT;": "<", "Lacute;": "\u0139", "Lambda;": "\u039B", "Lang;": "\u27EA", "Laplacetrf;": "\u2112", "Larr;": "\u219E", "Lcaron;": "\u013D", "Lcedil;": "\u013B", "Lcy;": "\u041B", "LeftAngleBracket;": "\u27E8", "LeftArrow;": "\u2190", "LeftArrowBar;": "\u21E4", "LeftArrowRightArrow;": "\u21C6", "LeftCeiling;": "\u2308", "LeftDoubleBracket;": "\u27E6", "LeftDownTeeVector;": "\u2961", "LeftDownVector;": "\u21C3", "LeftDownVectorBar;": "\u2959", "LeftFloor;": "\u230A", "LeftRightArrow;": "\u2194", "LeftRightVector;": "\u294E", "LeftTee;": "\u22A3", "LeftTeeArrow;": "\u21A4", "LeftTeeVector;": "\u295A", "LeftTriangle;": "\u22B2", "LeftTriangleBar;": "\u29CF", "LeftTriangleEqual;": "\u22B4", "LeftUpDownVector;": "\u2951", "LeftUpTeeVector;": "\u2960", "LeftUpVector;": "\u21BF", "LeftUpVectorBar;": "\u2958", "LeftVector;": "\u21BC", "LeftVectorBar;": "\u2952", "Leftarrow;": "\u21D0", "Leftrightarrow;": "\u21D4", "LessEqualGreater;": "\u22DA", "LessFullEqual;": "\u2266", "LessGreater;": "\u2276", "LessLess;": "\u2AA1", "LessSlantEqual;": "\u2A7D", "LessTilde;": "\u2272", "Lfr;": "\u{1D50F}", "Ll;": "\u22D8", "Lleftarrow;": "\u21DA", "Lmidot;": "\u013F", "LongLeftArrow;": "\u27F5", "LongLeftRightArrow;": "\u27F7", "LongRightArrow;": "\u27F6", "Longleftarrow;": "\u27F8", "Longleftrightarrow;": "\u27FA", "Longrightarrow;": "\u27F9", "Lopf;": "\u{1D543}", "LowerLeftArrow;": "\u2199", "LowerRightArrow;": "\u2198", "Lscr;": "\u2112", "Lsh;": "\u21B0", "Lstrok;": "\u0141", "Lt;": "\u226A", "Map;": "\u2905", "Mcy;": "\u041C", "MediumSpace;": "\u205F", "Mellintrf;": "\u2133", "Mfr;": "\u{1D510}", "MinusPlus;": "\u2213", "Mopf;": "\u{1D544}", "Mscr;": "\u2133", "Mu;": "\u039C", "NJcy;": "\u040A", "Nacute;": "\u0143", "Ncaron;": "\u0147", "Ncedil;": "\u0145", "Ncy;": "\u041D", "NegativeMediumSpace;": "\u200B", "NegativeThickSpace;": "\u200B", "NegativeThinSpace;": "\u200B", "NegativeVeryThinSpace;": "\u200B", "NestedGreaterGreater;": "\u226B", "NestedLessLess;": "\u226A", "NewLine;": "\n", "Nfr;": "\u{1D511}", "NoBreak;": "\u2060", "NonBreakingSpace;": "\xA0", "Nopf;": "\u2115", "Not;": "\u2AEC", "NotCongruent;": "\u2262", "NotCupCap;": "\u226D", "NotDoubleVerticalBar;": "\u2226", "NotElement;": "\u2209", "NotEqual;": "\u2260", "NotEqualTilde;": "\u2242\u0338", "NotExists;": "\u2204", "NotGreater;": "\u226F", "NotGreaterEqual;": "\u2271", "NotGreaterFullEqual;": "\u2267\u0338", "NotGreaterGreater;": "\u226B\u0338", "NotGreaterLess;": "\u2279", "NotGreaterSlantEqual;": "\u2A7E\u0338", "NotGreaterTilde;": "\u2275", "NotHumpDownHump;": "\u224E\u0338", "NotHumpEqual;": "\u224F\u0338", "NotLeftTriangle;": "\u22EA", "NotLeftTriangleBar;": "\u29CF\u0338", "NotLeftTriangleEqual;": "\u22EC", "NotLess;": "\u226E", "NotLessEqual;": "\u2270", "NotLessGreater;": "\u2278", "NotLessLess;": "\u226A\u0338", "NotLessSlantEqual;": "\u2A7D\u0338", "NotLessTilde;": "\u2274", "NotNestedGreaterGreater;": "\u2AA2\u0338", "NotNestedLessLess;": "\u2AA1\u0338", "NotPrecedes;": "\u2280", "NotPrecedesEqual;": "\u2AAF\u0338", "NotPrecedesSlantEqual;": "\u22E0", "NotReverseElement;": "\u220C", "NotRightTriangle;": "\u22EB", "NotRightTriangleBar;": "\u29D0\u0338", "NotRightTriangleEqual;": "\u22ED", "NotSquareSubset;": "\u228F\u0338", "NotSquareSubsetEqual;": "\u22E2", "NotSquareSuperset;": "\u2290\u0338", "NotSquareSupersetEqual;": "\u22E3", "NotSubset;": "\u2282\u20D2", "NotSubsetEqual;": "\u2288", "NotSucceeds;": "\u2281", "NotSucceedsEqual;": "\u2AB0\u0338", "NotSucceedsSlantEqual;": "\u22E1", "NotSucceedsTilde;": "\u227F\u0338", "NotSuperset;": "\u2283\u20D2", "NotSupersetEqual;": "\u2289", "NotTilde;": "\u2241", "NotTildeEqual;": "\u2244", "NotTildeFullEqual;": "\u2247", "NotTildeTilde;": "\u2249", "NotVerticalBar;": "\u2224", "Nscr;": "\u{1D4A9}", "Ntilde": "\xD1", "Ntilde;": "\xD1", "Nu;": "\u039D", "OElig;": "\u0152", "Oacute": "\xD3", "Oacute;": "\xD3", "Ocirc": "\xD4", "Ocirc;": "\xD4", "Ocy;": "\u041E", "Odblac;": "\u0150", "Ofr;": "\u{1D512}", "Ograve": "\xD2", "Ograve;": "\xD2", "Omacr;": "\u014C", "Omega;": "\u03A9", "Omicron;": "\u039F", "Oopf;": "\u{1D546}", "OpenCurlyDoubleQuote;": "\u201C", "OpenCurlyQuote;": "\u2018", "Or;": "\u2A54", "Oscr;": "\u{1D4AA}", "Oslash": "\xD8", "Oslash;": "\xD8", "Otilde": "\xD5", "Otilde;": "\xD5", "Otimes;": "\u2A37", "Ouml": "\xD6", "Ouml;": "\xD6", "OverBar;": "\u203E", "OverBrace;": "\u23DE", "OverBracket;": "\u23B4", "OverParenthesis;": "\u23DC", "PartialD;": "\u2202", "Pcy;": "\u041F", "Pfr;": "\u{1D513}", "Phi;": "\u03A6", "Pi;": "\u03A0", "PlusMinus;": "\xB1", "Poincareplane;": "\u210C", "Popf;": "\u2119", "Pr;": "\u2ABB", "Precedes;": "\u227A", "PrecedesEqual;": "\u2AAF", "PrecedesSlantEqual;": "\u227C", "PrecedesTilde;": "\u227E", "Prime;": "\u2033", "Product;": "\u220F", "Proportion;": "\u2237", "Proportional;": "\u221D", "Pscr;": "\u{1D4AB}", "Psi;": "\u03A8", "QUOT": '"', "QUOT;": '"', "Qfr;": "\u{1D514}", "Qopf;": "\u211A", "Qscr;": "\u{1D4AC}", "RBarr;": "\u2910", "REG": "\xAE", "REG;": "\xAE", "Racute;": "\u0154", "Rang;": "\u27EB", "Rarr;": "\u21A0", "Rarrtl;": "\u2916", "Rcaron;": "\u0158", "Rcedil;": "\u0156", "Rcy;": "\u0420", "Re;": "\u211C", "ReverseElement;": "\u220B", "ReverseEquilibrium;": "\u21CB", "ReverseUpEquilibrium;": "\u296F", "Rfr;": "\u211C", "Rho;": "\u03A1", "RightAngleBracket;": "\u27E9", "RightArrow;": "\u2192", "RightArrowBar;": "\u21E5", "RightArrowLeftArrow;": "\u21C4", "RightCeiling;": "\u2309", "RightDoubleBracket;": "\u27E7", "RightDownTeeVector;": "\u295D", "RightDownVector;": "\u21C2", "RightDownVectorBar;": "\u2955", "RightFloor;": "\u230B", "RightTee;": "\u22A2", "RightTeeArrow;": "\u21A6", "RightTeeVector;": "\u295B", "RightTriangle;": "\u22B3", "RightTriangleBar;": "\u29D0", "RightTriangleEqual;": "\u22B5", "RightUpDownVector;": "\u294F", "RightUpTeeVector;": "\u295C", "RightUpVector;": "\u21BE", "RightUpVectorBar;": "\u2954", "RightVector;": "\u21C0", "RightVectorBar;": "\u2953", "Rightarrow;": "\u21D2", "Ropf;": "\u211D", "RoundImplies;": "\u2970", "Rrightarrow;": "\u21DB", "Rscr;": "\u211B", "Rsh;": "\u21B1", "RuleDelayed;": "\u29F4", "SHCHcy;": "\u0429", "SHcy;": "\u0428", "SOFTcy;": "\u042C", "Sacute;": "\u015A", "Sc;": "\u2ABC", "Scaron;": "\u0160", "Scedil;": "\u015E", "Scirc;": "\u015C", "Scy;": "\u0421", "Sfr;": "\u{1D516}", "ShortDownArrow;": "\u2193", "ShortLeftArrow;": "\u2190", "ShortRightArrow;": "\u2192", "ShortUpArrow;": "\u2191", "Sigma;": "\u03A3", "SmallCircle;": "\u2218", "Sopf;": "\u{1D54A}", "Sqrt;": "\u221A", "Square;": "\u25A1", "SquareIntersection;": "\u2293", "SquareSubset;": "\u228F", "SquareSubsetEqual;": "\u2291", "SquareSuperset;": "\u2290", "SquareSupersetEqual;": "\u2292", "SquareUnion;": "\u2294", "Sscr;": "\u{1D4AE}", "Star;": "\u22C6", "Sub;": "\u22D0", "Subset;": "\u22D0", "SubsetEqual;": "\u2286", "Succeeds;": "\u227B", "SucceedsEqual;": "\u2AB0", "SucceedsSlantEqual;": "\u227D", "SucceedsTilde;": "\u227F", "SuchThat;": "\u220B", "Sum;": "\u2211", "Sup;": "\u22D1", "Superset;": "\u2283", "SupersetEqual;": "\u2287", "Supset;": "\u22D1", "THORN": "\xDE", "THORN;": "\xDE", "TRADE;": "\u2122", "TSHcy;": "\u040B", "TScy;": "\u0426", "Tab;": "	", "Tau;": "\u03A4", "Tcaron;": "\u0164", "Tcedil;": "\u0162", "Tcy;": "\u0422", "Tfr;": "\u{1D517}", "Therefore;": "\u2234", "Theta;": "\u0398", "ThickSpace;": "\u205F\u200A", "ThinSpace;": "\u2009", "Tilde;": "\u223C", "TildeEqual;": "\u2243", "TildeFullEqual;": "\u2245", "TildeTilde;": "\u2248", "Topf;": "\u{1D54B}", "TripleDot;": "\u20DB", "Tscr;": "\u{1D4AF}", "Tstrok;": "\u0166", "Uacute": "\xDA", "Uacute;": "\xDA", "Uarr;": "\u219F", "Uarrocir;": "\u2949", "Ubrcy;": "\u040E", "Ubreve;": "\u016C", "Ucirc": "\xDB", "Ucirc;": "\xDB", "Ucy;": "\u0423", "Udblac;": "\u0170", "Ufr;": "\u{1D518}", "Ugrave": "\xD9", "Ugrave;": "\xD9", "Umacr;": "\u016A", "UnderBar;": "_", "UnderBrace;": "\u23DF", "UnderBracket;": "\u23B5", "UnderParenthesis;": "\u23DD", "Union;": "\u22C3", "UnionPlus;": "\u228E", "Uogon;": "\u0172", "Uopf;": "\u{1D54C}", "UpArrow;": "\u2191", "UpArrowBar;": "\u2912", "UpArrowDownArrow;": "\u21C5", "UpDownArrow;": "\u2195", "UpEquilibrium;": "\u296E", "UpTee;": "\u22A5", "UpTeeArrow;": "\u21A5", "Uparrow;": "\u21D1", "Updownarrow;": "\u21D5", "UpperLeftArrow;": "\u2196", "UpperRightArrow;": "\u2197", "Upsi;": "\u03D2", "Upsilon;": "\u03A5", "Uring;": "\u016E", "Uscr;": "\u{1D4B0}", "Utilde;": "\u0168", "Uuml": "\xDC", "Uuml;": "\xDC", "VDash;": "\u22AB", "Vbar;": "\u2AEB", "Vcy;": "\u0412", "Vdash;": "\u22A9", "Vdashl;": "\u2AE6", "Vee;": "\u22C1", "Verbar;": "\u2016", "Vert;": "\u2016", "VerticalBar;": "\u2223", "VerticalLine;": "|", "VerticalSeparator;": "\u2758", "VerticalTilde;": "\u2240", "VeryThinSpace;": "\u200A", "Vfr;": "\u{1D519}", "Vopf;": "\u{1D54D}", "Vscr;": "\u{1D4B1}", "Vvdash;": "\u22AA", "Wcirc;": "\u0174", "Wedge;": "\u22C0", "Wfr;": "\u{1D51A}", "Wopf;": "\u{1D54E}", "Wscr;": "\u{1D4B2}", "Xfr;": "\u{1D51B}", "Xi;": "\u039E", "Xopf;": "\u{1D54F}", "Xscr;": "\u{1D4B3}", "YAcy;": "\u042F", "YIcy;": "\u0407", "YUcy;": "\u042E", "Yacute": "\xDD", "Yacute;": "\xDD", "Ycirc;": "\u0176", "Ycy;": "\u042B", "Yfr;": "\u{1D51C}", "Yopf;": "\u{1D550}", "Yscr;": "\u{1D4B4}", "Yuml;": "\u0178", "ZHcy;": "\u0416", "Zacute;": "\u0179", "Zcaron;": "\u017D", "Zcy;": "\u0417", "Zdot;": "\u017B", "ZeroWidthSpace;": "\u200B", "Zeta;": "\u0396", "Zfr;": "\u2128", "Zopf;": "\u2124", "Zscr;": "\u{1D4B5}", "aacute": "\xE1", "aacute;": "\xE1", "abreve;": "\u0103", "ac;": "\u223E", "acE;": "\u223E\u0333", "acd;": "\u223F", "acirc": "\xE2", "acirc;": "\xE2", "acute": "\xB4", "acute;": "\xB4", "acy;": "\u0430", "aelig": "\xE6", "aelig;": "\xE6", "af;": "\u2061", "afr;": "\u{1D51E}", "agrave": "\xE0", "agrave;": "\xE0", "alefsym;": "\u2135", "aleph;": "\u2135", "alpha;": "\u03B1", "amacr;": "\u0101", "amalg;": "\u2A3F", "amp": "&", "amp;": "&", "and;": "\u2227", "andand;": "\u2A55", "andd;": "\u2A5C", "andslope;": "\u2A58", "andv;": "\u2A5A", "ang;": "\u2220", "ange;": "\u29A4", "angle;": "\u2220", "angmsd;": "\u2221", "angmsdaa;": "\u29A8", "angmsdab;": "\u29A9", "angmsdac;": "\u29AA", "angmsdad;": "\u29AB", "angmsdae;": "\u29AC", "angmsdaf;": "\u29AD", "angmsdag;": "\u29AE", "angmsdah;": "\u29AF", "angrt;": "\u221F", "angrtvb;": "\u22BE", "angrtvbd;": "\u299D", "angsph;": "\u2222", "angst;": "\xC5", "angzarr;": "\u237C", "aogon;": "\u0105", "aopf;": "\u{1D552}", "ap;": "\u2248", "apE;": "\u2A70", "apacir;": "\u2A6F", "ape;": "\u224A", "apid;": "\u224B", "apos;": "'", "approx;": "\u2248", "approxeq;": "\u224A", "aring": "\xE5", "aring;": "\xE5", "ascr;": "\u{1D4B6}", "ast;": "*", "asymp;": "\u2248", "asympeq;": "\u224D", "atilde": "\xE3", "atilde;": "\xE3", "auml": "\xE4", "auml;": "\xE4", "awconint;": "\u2233", "awint;": "\u2A11", "bNot;": "\u2AED", "backcong;": "\u224C", "backepsilon;": "\u03F6", "backprime;": "\u2035", "backsim;": "\u223D", "backsimeq;": "\u22CD", "barvee;": "\u22BD", "barwed;": "\u2305", "barwedge;": "\u2305", "bbrk;": "\u23B5", "bbrktbrk;": "\u23B6", "bcong;": "\u224C", "bcy;": "\u0431", "bdquo;": "\u201E", "becaus;": "\u2235", "because;": "\u2235", "bemptyv;": "\u29B0", "bepsi;": "\u03F6", "bernou;": "\u212C", "beta;": "\u03B2", "beth;": "\u2136", "between;": "\u226C", "bfr;": "\u{1D51F}", "bigcap;": "\u22C2", "bigcirc;": "\u25EF", "bigcup;": "\u22C3", "bigodot;": "\u2A00", "bigoplus;": "\u2A01", "bigotimes;": "\u2A02", "bigsqcup;": "\u2A06", "bigstar;": "\u2605", "bigtriangledown;": "\u25BD", "bigtriangleup;": "\u25B3", "biguplus;": "\u2A04", "bigvee;": "\u22C1", "bigwedge;": "\u22C0", "bkarow;": "\u290D", "blacklozenge;": "\u29EB", "blacksquare;": "\u25AA", "blacktriangle;": "\u25B4", "blacktriangledown;": "\u25BE", "blacktriangleleft;": "\u25C2", "blacktriangleright;": "\u25B8", "blank;": "\u2423", "blk12;": "\u2592", "blk14;": "\u2591", "blk34;": "\u2593", "block;": "\u2588", "bne;": "=\u20E5", "bnequiv;": "\u2261\u20E5", "bnot;": "\u2310", "bopf;": "\u{1D553}", "bot;": "\u22A5", "bottom;": "\u22A5", "bowtie;": "\u22C8", "boxDL;": "\u2557", "boxDR;": "\u2554", "boxDl;": "\u2556", "boxDr;": "\u2553", "boxH;": "\u2550", "boxHD;": "\u2566", "boxHU;": "\u2569", "boxHd;": "\u2564", "boxHu;": "\u2567", "boxUL;": "\u255D", "boxUR;": "\u255A", "boxUl;": "\u255C", "boxUr;": "\u2559", "boxV;": "\u2551", "boxVH;": "\u256C", "boxVL;": "\u2563", "boxVR;": "\u2560", "boxVh;": "\u256B", "boxVl;": "\u2562", "boxVr;": "\u255F", "boxbox;": "\u29C9", "boxdL;": "\u2555", "boxdR;": "\u2552", "boxdl;": "\u2510", "boxdr;": "\u250C", "boxh;": "\u2500", "boxhD;": "\u2565", "boxhU;": "\u2568", "boxhd;": "\u252C", "boxhu;": "\u2534", "boxminus;": "\u229F", "boxplus;": "\u229E", "boxtimes;": "\u22A0", "boxuL;": "\u255B", "boxuR;": "\u2558", "boxul;": "\u2518", "boxur;": "\u2514", "boxv;": "\u2502", "boxvH;": "\u256A", "boxvL;": "\u2561", "boxvR;": "\u255E", "boxvh;": "\u253C", "boxvl;": "\u2524", "boxvr;": "\u251C", "bprime;": "\u2035", "breve;": "\u02D8", "brvbar": "\xA6", "brvbar;": "\xA6", "bscr;": "\u{1D4B7}", "bsemi;": "\u204F", "bsim;": "\u223D", "bsime;": "\u22CD", "bsol;": "\\", "bsolb;": "\u29C5", "bsolhsub;": "\u27C8", "bull;": "\u2022", "bullet;": "\u2022", "bump;": "\u224E", "bumpE;": "\u2AAE", "bumpe;": "\u224F", "bumpeq;": "\u224F", "cacute;": "\u0107", "cap;": "\u2229", "capand;": "\u2A44", "capbrcup;": "\u2A49", "capcap;": "\u2A4B", "capcup;": "\u2A47", "capdot;": "\u2A40", "caps;": "\u2229\uFE00", "caret;": "\u2041", "caron;": "\u02C7", "ccaps;": "\u2A4D", "ccaron;": "\u010D", "ccedil": "\xE7", "ccedil;": "\xE7", "ccirc;": "\u0109", "ccups;": "\u2A4C", "ccupssm;": "\u2A50", "cdot;": "\u010B", "cedil": "\xB8", "cedil;": "\xB8", "cemptyv;": "\u29B2", "cent": "\xA2", "cent;": "\xA2", "centerdot;": "\xB7", "cfr;": "\u{1D520}", "chcy;": "\u0447", "check;": "\u2713", "checkmark;": "\u2713", "chi;": "\u03C7", "cir;": "\u25CB", "cirE;": "\u29C3", "circ;": "\u02C6", "circeq;": "\u2257", "circlearrowleft;": "\u21BA", "circlearrowright;": "\u21BB", "circledR;": "\xAE", "circledS;": "\u24C8", "circledast;": "\u229B", "circledcirc;": "\u229A", "circleddash;": "\u229D", "cire;": "\u2257", "cirfnint;": "\u2A10", "cirmid;": "\u2AEF", "cirscir;": "\u29C2", "clubs;": "\u2663", "clubsuit;": "\u2663", "colon;": ":", "colone;": "\u2254", "coloneq;": "\u2254", "comma;": ",", "commat;": "@", "comp;": "\u2201", "compfn;": "\u2218", "complement;": "\u2201", "complexes;": "\u2102", "cong;": "\u2245", "congdot;": "\u2A6D", "conint;": "\u222E", "copf;": "\u{1D554}", "coprod;": "\u2210", "copy": "\xA9", "copy;": "\xA9", "copysr;": "\u2117", "crarr;": "\u21B5", "cross;": "\u2717", "cscr;": "\u{1D4B8}", "csub;": "\u2ACF", "csube;": "\u2AD1", "csup;": "\u2AD0", "csupe;": "\u2AD2", "ctdot;": "\u22EF", "cudarrl;": "\u2938", "cudarrr;": "\u2935", "cuepr;": "\u22DE", "cuesc;": "\u22DF", "cularr;": "\u21B6", "cularrp;": "\u293D", "cup;": "\u222A", "cupbrcap;": "\u2A48", "cupcap;": "\u2A46", "cupcup;": "\u2A4A", "cupdot;": "\u228D", "cupor;": "\u2A45", "cups;": "\u222A\uFE00", "curarr;": "\u21B7", "curarrm;": "\u293C", "curlyeqprec;": "\u22DE", "curlyeqsucc;": "\u22DF", "curlyvee;": "\u22CE", "curlywedge;": "\u22CF", "curren": "\xA4", "curren;": "\xA4", "curvearrowleft;": "\u21B6", "curvearrowright;": "\u21B7", "cuvee;": "\u22CE", "cuwed;": "\u22CF", "cwconint;": "\u2232", "cwint;": "\u2231", "cylcty;": "\u232D", "dArr;": "\u21D3", "dHar;": "\u2965", "dagger;": "\u2020", "daleth;": "\u2138", "darr;": "\u2193", "dash;": "\u2010", "dashv;": "\u22A3", "dbkarow;": "\u290F", "dblac;": "\u02DD", "dcaron;": "\u010F", "dcy;": "\u0434", "dd;": "\u2146", "ddagger;": "\u2021", "ddarr;": "\u21CA", "ddotseq;": "\u2A77", "deg": "\xB0", "deg;": "\xB0", "delta;": "\u03B4", "demptyv;": "\u29B1", "dfisht;": "\u297F", "dfr;": "\u{1D521}", "dharl;": "\u21C3", "dharr;": "\u21C2", "diam;": "\u22C4", "diamond;": "\u22C4", "diamondsuit;": "\u2666", "diams;": "\u2666", "die;": "\xA8", "digamma;": "\u03DD", "disin;": "\u22F2", "div;": "\xF7", "divide": "\xF7", "divide;": "\xF7", "divideontimes;": "\u22C7", "divonx;": "\u22C7", "djcy;": "\u0452", "dlcorn;": "\u231E", "dlcrop;": "\u230D", "dollar;": "$", "dopf;": "\u{1D555}", "dot;": "\u02D9", "doteq;": "\u2250", "doteqdot;": "\u2251", "dotminus;": "\u2238", "dotplus;": "\u2214", "dotsquare;": "\u22A1", "doublebarwedge;": "\u2306", "downarrow;": "\u2193", "downdownarrows;": "\u21CA", "downharpoonleft;": "\u21C3", "downharpoonright;": "\u21C2", "drbkarow;": "\u2910", "drcorn;": "\u231F", "drcrop;": "\u230C", "dscr;": "\u{1D4B9}", "dscy;": "\u0455", "dsol;": "\u29F6", "dstrok;": "\u0111", "dtdot;": "\u22F1", "dtri;": "\u25BF", "dtrif;": "\u25BE", "duarr;": "\u21F5", "duhar;": "\u296F", "dwangle;": "\u29A6", "dzcy;": "\u045F", "dzigrarr;": "\u27FF", "eDDot;": "\u2A77", "eDot;": "\u2251", "eacute": "\xE9", "eacute;": "\xE9", "easter;": "\u2A6E", "ecaron;": "\u011B", "ecir;": "\u2256", "ecirc": "\xEA", "ecirc;": "\xEA", "ecolon;": "\u2255", "ecy;": "\u044D", "edot;": "\u0117", "ee;": "\u2147", "efDot;": "\u2252", "efr;": "\u{1D522}", "eg;": "\u2A9A", "egrave": "\xE8", "egrave;": "\xE8", "egs;": "\u2A96", "egsdot;": "\u2A98", "el;": "\u2A99", "elinters;": "\u23E7", "ell;": "\u2113", "els;": "\u2A95", "elsdot;": "\u2A97", "emacr;": "\u0113", "empty;": "\u2205", "emptyset;": "\u2205", "emptyv;": "\u2205", "emsp13;": "\u2004", "emsp14;": "\u2005", "emsp;": "\u2003", "eng;": "\u014B", "ensp;": "\u2002", "eogon;": "\u0119", "eopf;": "\u{1D556}", "epar;": "\u22D5", "eparsl;": "\u29E3", "eplus;": "\u2A71", "epsi;": "\u03B5", "epsilon;": "\u03B5", "epsiv;": "\u03F5", "eqcirc;": "\u2256", "eqcolon;": "\u2255", "eqsim;": "\u2242", "eqslantgtr;": "\u2A96", "eqslantless;": "\u2A95", "equals;": "=", "equest;": "\u225F", "equiv;": "\u2261", "equivDD;": "\u2A78", "eqvparsl;": "\u29E5", "erDot;": "\u2253", "erarr;": "\u2971", "escr;": "\u212F", "esdot;": "\u2250", "esim;": "\u2242", "eta;": "\u03B7", "eth": "\xF0", "eth;": "\xF0", "euml": "\xEB", "euml;": "\xEB", "euro;": "\u20AC", "excl;": "!", "exist;": "\u2203", "expectation;": "\u2130", "exponentiale;": "\u2147", "fallingdotseq;": "\u2252", "fcy;": "\u0444", "female;": "\u2640", "ffilig;": "\uFB03", "fflig;": "\uFB00", "ffllig;": "\uFB04", "ffr;": "\u{1D523}", "filig;": "\uFB01", "fjlig;": "fj", "flat;": "\u266D", "fllig;": "\uFB02", "fltns;": "\u25B1", "fnof;": "\u0192", "fopf;": "\u{1D557}", "forall;": "\u2200", "fork;": "\u22D4", "forkv;": "\u2AD9", "fpartint;": "\u2A0D", "frac12": "\xBD", "frac12;": "\xBD", "frac13;": "\u2153", "frac14": "\xBC", "frac14;": "\xBC", "frac15;": "\u2155", "frac16;": "\u2159", "frac18;": "\u215B", "frac23;": "\u2154", "frac25;": "\u2156", "frac34": "\xBE", "frac34;": "\xBE", "frac35;": "\u2157", "frac38;": "\u215C", "frac45;": "\u2158", "frac56;": "\u215A", "frac58;": "\u215D", "frac78;": "\u215E", "frasl;": "\u2044", "frown;": "\u2322", "fscr;": "\u{1D4BB}", "gE;": "\u2267", "gEl;": "\u2A8C", "gacute;": "\u01F5", "gamma;": "\u03B3", "gammad;": "\u03DD", "gap;": "\u2A86", "gbreve;": "\u011F", "gcirc;": "\u011D", "gcy;": "\u0433", "gdot;": "\u0121", "ge;": "\u2265", "gel;": "\u22DB", "geq;": "\u2265", "geqq;": "\u2267", "geqslant;": "\u2A7E", "ges;": "\u2A7E", "gescc;": "\u2AA9", "gesdot;": "\u2A80", "gesdoto;": "\u2A82", "gesdotol;": "\u2A84", "gesl;": "\u22DB\uFE00", "gesles;": "\u2A94", "gfr;": "\u{1D524}", "gg;": "\u226B", "ggg;": "\u22D9", "gimel;": "\u2137", "gjcy;": "\u0453", "gl;": "\u2277", "glE;": "\u2A92", "gla;": "\u2AA5", "glj;": "\u2AA4", "gnE;": "\u2269", "gnap;": "\u2A8A", "gnapprox;": "\u2A8A", "gne;": "\u2A88", "gneq;": "\u2A88", "gneqq;": "\u2269", "gnsim;": "\u22E7", "gopf;": "\u{1D558}", "grave;": "`", "gscr;": "\u210A", "gsim;": "\u2273", "gsime;": "\u2A8E", "gsiml;": "\u2A90", "gt": ">", "gt;": ">", "gtcc;": "\u2AA7", "gtcir;": "\u2A7A", "gtdot;": "\u22D7", "gtlPar;": "\u2995", "gtquest;": "\u2A7C", "gtrapprox;": "\u2A86", "gtrarr;": "\u2978", "gtrdot;": "\u22D7", "gtreqless;": "\u22DB", "gtreqqless;": "\u2A8C", "gtrless;": "\u2277", "gtrsim;": "\u2273", "gvertneqq;": "\u2269\uFE00", "gvnE;": "\u2269\uFE00", "hArr;": "\u21D4", "hairsp;": "\u200A", "half;": "\xBD", "hamilt;": "\u210B", "hardcy;": "\u044A", "harr;": "\u2194", "harrcir;": "\u2948", "harrw;": "\u21AD", "hbar;": "\u210F", "hcirc;": "\u0125", "hearts;": "\u2665", "heartsuit;": "\u2665", "hellip;": "\u2026", "hercon;": "\u22B9", "hfr;": "\u{1D525}", "hksearow;": "\u2925", "hkswarow;": "\u2926", "hoarr;": "\u21FF", "homtht;": "\u223B", "hookleftarrow;": "\u21A9", "hookrightarrow;": "\u21AA", "hopf;": "\u{1D559}", "horbar;": "\u2015", "hscr;": "\u{1D4BD}", "hslash;": "\u210F", "hstrok;": "\u0127", "hybull;": "\u2043", "hyphen;": "\u2010", "iacute": "\xED", "iacute;": "\xED", "ic;": "\u2063", "icirc": "\xEE", "icirc;": "\xEE", "icy;": "\u0438", "iecy;": "\u0435", "iexcl": "\xA1", "iexcl;": "\xA1", "iff;": "\u21D4", "ifr;": "\u{1D526}", "igrave": "\xEC", "igrave;": "\xEC", "ii;": "\u2148", "iiiint;": "\u2A0C", "iiint;": "\u222D", "iinfin;": "\u29DC", "iiota;": "\u2129", "ijlig;": "\u0133", "imacr;": "\u012B", "image;": "\u2111", "imagline;": "\u2110", "imagpart;": "\u2111", "imath;": "\u0131", "imof;": "\u22B7", "imped;": "\u01B5", "in;": "\u2208", "incare;": "\u2105", "infin;": "\u221E", "infintie;": "\u29DD", "inodot;": "\u0131", "int;": "\u222B", "intcal;": "\u22BA", "integers;": "\u2124", "intercal;": "\u22BA", "intlarhk;": "\u2A17", "intprod;": "\u2A3C", "iocy;": "\u0451", "iogon;": "\u012F", "iopf;": "\u{1D55A}", "iota;": "\u03B9", "iprod;": "\u2A3C", "iquest": "\xBF", "iquest;": "\xBF", "iscr;": "\u{1D4BE}", "isin;": "\u2208", "isinE;": "\u22F9", "isindot;": "\u22F5", "isins;": "\u22F4", "isinsv;": "\u22F3", "isinv;": "\u2208", "it;": "\u2062", "itilde;": "\u0129", "iukcy;": "\u0456", "iuml": "\xEF", "iuml;": "\xEF", "jcirc;": "\u0135", "jcy;": "\u0439", "jfr;": "\u{1D527}", "jmath;": "\u0237", "jopf;": "\u{1D55B}", "jscr;": "\u{1D4BF}", "jsercy;": "\u0458", "jukcy;": "\u0454", "kappa;": "\u03BA", "kappav;": "\u03F0", "kcedil;": "\u0137", "kcy;": "\u043A", "kfr;": "\u{1D528}", "kgreen;": "\u0138", "khcy;": "\u0445", "kjcy;": "\u045C", "kopf;": "\u{1D55C}", "kscr;": "\u{1D4C0}", "lAarr;": "\u21DA", "lArr;": "\u21D0", "lAtail;": "\u291B", "lBarr;": "\u290E", "lE;": "\u2266", "lEg;": "\u2A8B", "lHar;": "\u2962", "lacute;": "\u013A", "laemptyv;": "\u29B4", "lagran;": "\u2112", "lambda;": "\u03BB", "lang;": "\u27E8", "langd;": "\u2991", "langle;": "\u27E8", "lap;": "\u2A85", "laquo": "\xAB", "laquo;": "\xAB", "larr;": "\u2190", "larrb;": "\u21E4", "larrbfs;": "\u291F", "larrfs;": "\u291D", "larrhk;": "\u21A9", "larrlp;": "\u21AB", "larrpl;": "\u2939", "larrsim;": "\u2973", "larrtl;": "\u21A2", "lat;": "\u2AAB", "latail;": "\u2919", "late;": "\u2AAD", "lates;": "\u2AAD\uFE00", "lbarr;": "\u290C", "lbbrk;": "\u2772", "lbrace;": "{", "lbrack;": "[", "lbrke;": "\u298B", "lbrksld;": "\u298F", "lbrkslu;": "\u298D", "lcaron;": "\u013E", "lcedil;": "\u013C", "lceil;": "\u2308", "lcub;": "{", "lcy;": "\u043B", "ldca;": "\u2936", "ldquo;": "\u201C", "ldquor;": "\u201E", "ldrdhar;": "\u2967", "ldrushar;": "\u294B", "ldsh;": "\u21B2", "le;": "\u2264", "leftarrow;": "\u2190", "leftarrowtail;": "\u21A2", "leftharpoondown;": "\u21BD", "leftharpoonup;": "\u21BC", "leftleftarrows;": "\u21C7", "leftrightarrow;": "\u2194", "leftrightarrows;": "\u21C6", "leftrightharpoons;": "\u21CB", "leftrightsquigarrow;": "\u21AD", "leftthreetimes;": "\u22CB", "leg;": "\u22DA", "leq;": "\u2264", "leqq;": "\u2266", "leqslant;": "\u2A7D", "les;": "\u2A7D", "lescc;": "\u2AA8", "lesdot;": "\u2A7F", "lesdoto;": "\u2A81", "lesdotor;": "\u2A83", "lesg;": "\u22DA\uFE00", "lesges;": "\u2A93", "lessapprox;": "\u2A85", "lessdot;": "\u22D6", "lesseqgtr;": "\u22DA", "lesseqqgtr;": "\u2A8B", "lessgtr;": "\u2276", "lesssim;": "\u2272", "lfisht;": "\u297C", "lfloor;": "\u230A", "lfr;": "\u{1D529}", "lg;": "\u2276", "lgE;": "\u2A91", "lhard;": "\u21BD", "lharu;": "\u21BC", "lharul;": "\u296A", "lhblk;": "\u2584", "ljcy;": "\u0459", "ll;": "\u226A", "llarr;": "\u21C7", "llcorner;": "\u231E", "llhard;": "\u296B", "lltri;": "\u25FA", "lmidot;": "\u0140", "lmoust;": "\u23B0", "lmoustache;": "\u23B0", "lnE;": "\u2268", "lnap;": "\u2A89", "lnapprox;": "\u2A89", "lne;": "\u2A87", "lneq;": "\u2A87", "lneqq;": "\u2268", "lnsim;": "\u22E6", "loang;": "\u27EC", "loarr;": "\u21FD", "lobrk;": "\u27E6", "longleftarrow;": "\u27F5", "longleftrightarrow;": "\u27F7", "longmapsto;": "\u27FC", "longrightarrow;": "\u27F6", "looparrowleft;": "\u21AB", "looparrowright;": "\u21AC", "lopar;": "\u2985", "lopf;": "\u{1D55D}", "loplus;": "\u2A2D", "lotimes;": "\u2A34", "lowast;": "\u2217", "lowbar;": "_", "loz;": "\u25CA", "lozenge;": "\u25CA", "lozf;": "\u29EB", "lpar;": "(", "lparlt;": "\u2993", "lrarr;": "\u21C6", "lrcorner;": "\u231F", "lrhar;": "\u21CB", "lrhard;": "\u296D", "lrm;": "\u200E", "lrtri;": "\u22BF", "lsaquo;": "\u2039", "lscr;": "\u{1D4C1}", "lsh;": "\u21B0", "lsim;": "\u2272", "lsime;": "\u2A8D", "lsimg;": "\u2A8F", "lsqb;": "[", "lsquo;": "\u2018", "lsquor;": "\u201A", "lstrok;": "\u0142", "lt": "<", "lt;": "<", "ltcc;": "\u2AA6", "ltcir;": "\u2A79", "ltdot;": "\u22D6", "lthree;": "\u22CB", "ltimes;": "\u22C9", "ltlarr;": "\u2976", "ltquest;": "\u2A7B", "ltrPar;": "\u2996", "ltri;": "\u25C3", "ltrie;": "\u22B4", "ltrif;": "\u25C2", "lurdshar;": "\u294A", "luruhar;": "\u2966", "lvertneqq;": "\u2268\uFE00", "lvnE;": "\u2268\uFE00", "mDDot;": "\u223A", "macr": "\xAF", "macr;": "\xAF", "male;": "\u2642", "malt;": "\u2720", "maltese;": "\u2720", "map;": "\u21A6", "mapsto;": "\u21A6", "mapstodown;": "\u21A7", "mapstoleft;": "\u21A4", "mapstoup;": "\u21A5", "marker;": "\u25AE", "mcomma;": "\u2A29", "mcy;": "\u043C", "mdash;": "\u2014", "measuredangle;": "\u2221", "mfr;": "\u{1D52A}", "mho;": "\u2127", "micro": "\xB5", "micro;": "\xB5", "mid;": "\u2223", "midast;": "*", "midcir;": "\u2AF0", "middot": "\xB7", "middot;": "\xB7", "minus;": "\u2212", "minusb;": "\u229F", "minusd;": "\u2238", "minusdu;": "\u2A2A", "mlcp;": "\u2ADB", "mldr;": "\u2026", "mnplus;": "\u2213", "models;": "\u22A7", "mopf;": "\u{1D55E}", "mp;": "\u2213", "mscr;": "\u{1D4C2}", "mstpos;": "\u223E", "mu;": "\u03BC", "multimap;": "\u22B8", "mumap;": "\u22B8", "nGg;": "\u22D9\u0338", "nGt;": "\u226B\u20D2", "nGtv;": "\u226B\u0338", "nLeftarrow;": "\u21CD", "nLeftrightarrow;": "\u21CE", "nLl;": "\u22D8\u0338", "nLt;": "\u226A\u20D2", "nLtv;": "\u226A\u0338", "nRightarrow;": "\u21CF", "nVDash;": "\u22AF", "nVdash;": "\u22AE", "nabla;": "\u2207", "nacute;": "\u0144", "nang;": "\u2220\u20D2", "nap;": "\u2249", "napE;": "\u2A70\u0338", "napid;": "\u224B\u0338", "napos;": "\u0149", "napprox;": "\u2249", "natur;": "\u266E", "natural;": "\u266E", "naturals;": "\u2115", "nbsp": "\xA0", "nbsp;": "\xA0", "nbump;": "\u224E\u0338", "nbumpe;": "\u224F\u0338", "ncap;": "\u2A43", "ncaron;": "\u0148", "ncedil;": "\u0146", "ncong;": "\u2247", "ncongdot;": "\u2A6D\u0338", "ncup;": "\u2A42", "ncy;": "\u043D", "ndash;": "\u2013", "ne;": "\u2260", "neArr;": "\u21D7", "nearhk;": "\u2924", "nearr;": "\u2197", "nearrow;": "\u2197", "nedot;": "\u2250\u0338", "nequiv;": "\u2262", "nesear;": "\u2928", "nesim;": "\u2242\u0338", "nexist;": "\u2204", "nexists;": "\u2204", "nfr;": "\u{1D52B}", "ngE;": "\u2267\u0338", "nge;": "\u2271", "ngeq;": "\u2271", "ngeqq;": "\u2267\u0338", "ngeqslant;": "\u2A7E\u0338", "nges;": "\u2A7E\u0338", "ngsim;": "\u2275", "ngt;": "\u226F", "ngtr;": "\u226F", "nhArr;": "\u21CE", "nharr;": "\u21AE", "nhpar;": "\u2AF2", "ni;": "\u220B", "nis;": "\u22FC", "nisd;": "\u22FA", "niv;": "\u220B", "njcy;": "\u045A", "nlArr;": "\u21CD", "nlE;": "\u2266\u0338", "nlarr;": "\u219A", "nldr;": "\u2025", "nle;": "\u2270", "nleftarrow;": "\u219A", "nleftrightarrow;": "\u21AE", "nleq;": "\u2270", "nleqq;": "\u2266\u0338", "nleqslant;": "\u2A7D\u0338", "nles;": "\u2A7D\u0338", "nless;": "\u226E", "nlsim;": "\u2274", "nlt;": "\u226E", "nltri;": "\u22EA", "nltrie;": "\u22EC", "nmid;": "\u2224", "nopf;": "\u{1D55F}", "not": "\xAC", "not;": "\xAC", "notin;": "\u2209", "notinE;": "\u22F9\u0338", "notindot;": "\u22F5\u0338", "notinva;": "\u2209", "notinvb;": "\u22F7", "notinvc;": "\u22F6", "notni;": "\u220C", "notniva;": "\u220C", "notnivb;": "\u22FE", "notnivc;": "\u22FD", "npar;": "\u2226", "nparallel;": "\u2226", "nparsl;": "\u2AFD\u20E5", "npart;": "\u2202\u0338", "npolint;": "\u2A14", "npr;": "\u2280", "nprcue;": "\u22E0", "npre;": "\u2AAF\u0338", "nprec;": "\u2280", "npreceq;": "\u2AAF\u0338", "nrArr;": "\u21CF", "nrarr;": "\u219B", "nrarrc;": "\u2933\u0338", "nrarrw;": "\u219D\u0338", "nrightarrow;": "\u219B", "nrtri;": "\u22EB", "nrtrie;": "\u22ED", "nsc;": "\u2281", "nsccue;": "\u22E1", "nsce;": "\u2AB0\u0338", "nscr;": "\u{1D4C3}", "nshortmid;": "\u2224", "nshortparallel;": "\u2226", "nsim;": "\u2241", "nsime;": "\u2244", "nsimeq;": "\u2244", "nsmid;": "\u2224", "nspar;": "\u2226", "nsqsube;": "\u22E2", "nsqsupe;": "\u22E3", "nsub;": "\u2284", "nsubE;": "\u2AC5\u0338", "nsube;": "\u2288", "nsubset;": "\u2282\u20D2", "nsubseteq;": "\u2288", "nsubseteqq;": "\u2AC5\u0338", "nsucc;": "\u2281", "nsucceq;": "\u2AB0\u0338", "nsup;": "\u2285", "nsupE;": "\u2AC6\u0338", "nsupe;": "\u2289", "nsupset;": "\u2283\u20D2", "nsupseteq;": "\u2289", "nsupseteqq;": "\u2AC6\u0338", "ntgl;": "\u2279", "ntilde": "\xF1", "ntilde;": "\xF1", "ntlg;": "\u2278", "ntriangleleft;": "\u22EA", "ntrianglelefteq;": "\u22EC", "ntriangleright;": "\u22EB", "ntrianglerighteq;": "\u22ED", "nu;": "\u03BD", "num;": "#", "numero;": "\u2116", "numsp;": "\u2007", "nvDash;": "\u22AD", "nvHarr;": "\u2904", "nvap;": "\u224D\u20D2", "nvdash;": "\u22AC", "nvge;": "\u2265\u20D2", "nvgt;": ">\u20D2", "nvinfin;": "\u29DE", "nvlArr;": "\u2902", "nvle;": "\u2264\u20D2", "nvlt;": "<\u20D2", "nvltrie;": "\u22B4\u20D2", "nvrArr;": "\u2903", "nvrtrie;": "\u22B5\u20D2", "nvsim;": "\u223C\u20D2", "nwArr;": "\u21D6", "nwarhk;": "\u2923", "nwarr;": "\u2196", "nwarrow;": "\u2196", "nwnear;": "\u2927", "oS;": "\u24C8", "oacute": "\xF3", "oacute;": "\xF3", "oast;": "\u229B", "ocir;": "\u229A", "ocirc": "\xF4", "ocirc;": "\xF4", "ocy;": "\u043E", "odash;": "\u229D", "odblac;": "\u0151", "odiv;": "\u2A38", "odot;": "\u2299", "odsold;": "\u29BC", "oelig;": "\u0153", "ofcir;": "\u29BF", "ofr;": "\u{1D52C}", "ogon;": "\u02DB", "ograve": "\xF2", "ograve;": "\xF2", "ogt;": "\u29C1", "ohbar;": "\u29B5", "ohm;": "\u03A9", "oint;": "\u222E", "olarr;": "\u21BA", "olcir;": "\u29BE", "olcross;": "\u29BB", "oline;": "\u203E", "olt;": "\u29C0", "omacr;": "\u014D", "omega;": "\u03C9", "omicron;": "\u03BF", "omid;": "\u29B6", "ominus;": "\u2296", "oopf;": "\u{1D560}", "opar;": "\u29B7", "operp;": "\u29B9", "oplus;": "\u2295", "or;": "\u2228", "orarr;": "\u21BB", "ord;": "\u2A5D", "order;": "\u2134", "orderof;": "\u2134", "ordf": "\xAA", "ordf;": "\xAA", "ordm": "\xBA", "ordm;": "\xBA", "origof;": "\u22B6", "oror;": "\u2A56", "orslope;": "\u2A57", "orv;": "\u2A5B", "oscr;": "\u2134", "oslash": "\xF8", "oslash;": "\xF8", "osol;": "\u2298", "otilde": "\xF5", "otilde;": "\xF5", "otimes;": "\u2297", "otimesas;": "\u2A36", "ouml": "\xF6", "ouml;": "\xF6", "ovbar;": "\u233D", "par;": "\u2225", "para": "\xB6", "para;": "\xB6", "parallel;": "\u2225", "parsim;": "\u2AF3", "parsl;": "\u2AFD", "part;": "\u2202", "pcy;": "\u043F", "percnt;": "%", "period;": ".", "permil;": "\u2030", "perp;": "\u22A5", "pertenk;": "\u2031", "pfr;": "\u{1D52D}", "phi;": "\u03C6", "phiv;": "\u03D5", "phmmat;": "\u2133", "phone;": "\u260E", "pi;": "\u03C0", "pitchfork;": "\u22D4", "piv;": "\u03D6", "planck;": "\u210F", "planckh;": "\u210E", "plankv;": "\u210F", "plus;": "+", "plusacir;": "\u2A23", "plusb;": "\u229E", "pluscir;": "\u2A22", "plusdo;": "\u2214", "plusdu;": "\u2A25", "pluse;": "\u2A72", "plusmn": "\xB1", "plusmn;": "\xB1", "plussim;": "\u2A26", "plustwo;": "\u2A27", "pm;": "\xB1", "pointint;": "\u2A15", "popf;": "\u{1D561}", "pound": "\xA3", "pound;": "\xA3", "pr;": "\u227A", "prE;": "\u2AB3", "prap;": "\u2AB7", "prcue;": "\u227C", "pre;": "\u2AAF", "prec;": "\u227A", "precapprox;": "\u2AB7", "preccurlyeq;": "\u227C", "preceq;": "\u2AAF", "precnapprox;": "\u2AB9", "precneqq;": "\u2AB5", "precnsim;": "\u22E8", "precsim;": "\u227E", "prime;": "\u2032", "primes;": "\u2119", "prnE;": "\u2AB5", "prnap;": "\u2AB9", "prnsim;": "\u22E8", "prod;": "\u220F", "profalar;": "\u232E", "profline;": "\u2312", "profsurf;": "\u2313", "prop;": "\u221D", "propto;": "\u221D", "prsim;": "\u227E", "prurel;": "\u22B0", "pscr;": "\u{1D4C5}", "psi;": "\u03C8", "puncsp;": "\u2008", "qfr;": "\u{1D52E}", "qint;": "\u2A0C", "qopf;": "\u{1D562}", "qprime;": "\u2057", "qscr;": "\u{1D4C6}", "quaternions;": "\u210D", "quatint;": "\u2A16", "quest;": "?", "questeq;": "\u225F", "quot": '"', "quot;": '"', "rAarr;": "\u21DB", "rArr;": "\u21D2", "rAtail;": "\u291C", "rBarr;": "\u290F", "rHar;": "\u2964", "race;": "\u223D\u0331", "racute;": "\u0155", "radic;": "\u221A", "raemptyv;": "\u29B3", "rang;": "\u27E9", "rangd;": "\u2992", "range;": "\u29A5", "rangle;": "\u27E9", "raquo": "\xBB", "raquo;": "\xBB", "rarr;": "\u2192", "rarrap;": "\u2975", "rarrb;": "\u21E5", "rarrbfs;": "\u2920", "rarrc;": "\u2933", "rarrfs;": "\u291E", "rarrhk;": "\u21AA", "rarrlp;": "\u21AC", "rarrpl;": "\u2945", "rarrsim;": "\u2974", "rarrtl;": "\u21A3", "rarrw;": "\u219D", "ratail;": "\u291A", "ratio;": "\u2236", "rationals;": "\u211A", "rbarr;": "\u290D", "rbbrk;": "\u2773", "rbrace;": "}", "rbrack;": "]", "rbrke;": "\u298C", "rbrksld;": "\u298E", "rbrkslu;": "\u2990", "rcaron;": "\u0159", "rcedil;": "\u0157", "rceil;": "\u2309", "rcub;": "}", "rcy;": "\u0440", "rdca;": "\u2937", "rdldhar;": "\u2969", "rdquo;": "\u201D", "rdquor;": "\u201D", "rdsh;": "\u21B3", "real;": "\u211C", "realine;": "\u211B", "realpart;": "\u211C", "reals;": "\u211D", "rect;": "\u25AD", "reg": "\xAE", "reg;": "\xAE", "rfisht;": "\u297D", "rfloor;": "\u230B", "rfr;": "\u{1D52F}", "rhard;": "\u21C1", "rharu;": "\u21C0", "rharul;": "\u296C", "rho;": "\u03C1", "rhov;": "\u03F1", "rightarrow;": "\u2192", "rightarrowtail;": "\u21A3", "rightharpoondown;": "\u21C1", "rightharpoonup;": "\u21C0", "rightleftarrows;": "\u21C4", "rightleftharpoons;": "\u21CC", "rightrightarrows;": "\u21C9", "rightsquigarrow;": "\u219D", "rightthreetimes;": "\u22CC", "ring;": "\u02DA", "risingdotseq;": "\u2253", "rlarr;": "\u21C4", "rlhar;": "\u21CC", "rlm;": "\u200F", "rmoust;": "\u23B1", "rmoustache;": "\u23B1", "rnmid;": "\u2AEE", "roang;": "\u27ED", "roarr;": "\u21FE", "robrk;": "\u27E7", "ropar;": "\u2986", "ropf;": "\u{1D563}", "roplus;": "\u2A2E", "rotimes;": "\u2A35", "rpar;": ")", "rpargt;": "\u2994", "rppolint;": "\u2A12", "rrarr;": "\u21C9", "rsaquo;": "\u203A", "rscr;": "\u{1D4C7}", "rsh;": "\u21B1", "rsqb;": "]", "rsquo;": "\u2019", "rsquor;": "\u2019", "rthree;": "\u22CC", "rtimes;": "\u22CA", "rtri;": "\u25B9", "rtrie;": "\u22B5", "rtrif;": "\u25B8", "rtriltri;": "\u29CE", "ruluhar;": "\u2968", "rx;": "\u211E", "sacute;": "\u015B", "sbquo;": "\u201A", "sc;": "\u227B", "scE;": "\u2AB4", "scap;": "\u2AB8", "scaron;": "\u0161", "sccue;": "\u227D", "sce;": "\u2AB0", "scedil;": "\u015F", "scirc;": "\u015D", "scnE;": "\u2AB6", "scnap;": "\u2ABA", "scnsim;": "\u22E9", "scpolint;": "\u2A13", "scsim;": "\u227F", "scy;": "\u0441", "sdot;": "\u22C5", "sdotb;": "\u22A1", "sdote;": "\u2A66", "seArr;": "\u21D8", "searhk;": "\u2925", "searr;": "\u2198", "searrow;": "\u2198", "sect": "\xA7", "sect;": "\xA7", "semi;": ";", "seswar;": "\u2929", "setminus;": "\u2216", "setmn;": "\u2216", "sext;": "\u2736", "sfr;": "\u{1D530}", "sfrown;": "\u2322", "sharp;": "\u266F", "shchcy;": "\u0449", "shcy;": "\u0448", "shortmid;": "\u2223", "shortparallel;": "\u2225", "shy": "\xAD", "shy;": "\xAD", "sigma;": "\u03C3", "sigmaf;": "\u03C2", "sigmav;": "\u03C2", "sim;": "\u223C", "simdot;": "\u2A6A", "sime;": "\u2243", "simeq;": "\u2243", "simg;": "\u2A9E", "simgE;": "\u2AA0", "siml;": "\u2A9D", "simlE;": "\u2A9F", "simne;": "\u2246", "simplus;": "\u2A24", "simrarr;": "\u2972", "slarr;": "\u2190", "smallsetminus;": "\u2216", "smashp;": "\u2A33", "smeparsl;": "\u29E4", "smid;": "\u2223", "smile;": "\u2323", "smt;": "\u2AAA", "smte;": "\u2AAC", "smtes;": "\u2AAC\uFE00", "softcy;": "\u044C", "sol;": "/", "solb;": "\u29C4", "solbar;": "\u233F", "sopf;": "\u{1D564}", "spades;": "\u2660", "spadesuit;": "\u2660", "spar;": "\u2225", "sqcap;": "\u2293", "sqcaps;": "\u2293\uFE00", "sqcup;": "\u2294", "sqcups;": "\u2294\uFE00", "sqsub;": "\u228F", "sqsube;": "\u2291", "sqsubset;": "\u228F", "sqsubseteq;": "\u2291", "sqsup;": "\u2290", "sqsupe;": "\u2292", "sqsupset;": "\u2290", "sqsupseteq;": "\u2292", "squ;": "\u25A1", "square;": "\u25A1", "squarf;": "\u25AA", "squf;": "\u25AA", "srarr;": "\u2192", "sscr;": "\u{1D4C8}", "ssetmn;": "\u2216", "ssmile;": "\u2323", "sstarf;": "\u22C6", "star;": "\u2606", "starf;": "\u2605", "straightepsilon;": "\u03F5", "straightphi;": "\u03D5", "strns;": "\xAF", "sub;": "\u2282", "subE;": "\u2AC5", "subdot;": "\u2ABD", "sube;": "\u2286", "subedot;": "\u2AC3", "submult;": "\u2AC1", "subnE;": "\u2ACB", "subne;": "\u228A", "subplus;": "\u2ABF", "subrarr;": "\u2979", "subset;": "\u2282", "subseteq;": "\u2286", "subseteqq;": "\u2AC5", "subsetneq;": "\u228A", "subsetneqq;": "\u2ACB", "subsim;": "\u2AC7", "subsub;": "\u2AD5", "subsup;": "\u2AD3", "succ;": "\u227B", "succapprox;": "\u2AB8", "succcurlyeq;": "\u227D", "succeq;": "\u2AB0", "succnapprox;": "\u2ABA", "succneqq;": "\u2AB6", "succnsim;": "\u22E9", "succsim;": "\u227F", "sum;": "\u2211", "sung;": "\u266A", "sup1": "\xB9", "sup1;": "\xB9", "sup2": "\xB2", "sup2;": "\xB2", "sup3": "\xB3", "sup3;": "\xB3", "sup;": "\u2283", "supE;": "\u2AC6", "supdot;": "\u2ABE", "supdsub;": "\u2AD8", "supe;": "\u2287", "supedot;": "\u2AC4", "suphsol;": "\u27C9", "suphsub;": "\u2AD7", "suplarr;": "\u297B", "supmult;": "\u2AC2", "supnE;": "\u2ACC", "supne;": "\u228B", "supplus;": "\u2AC0", "supset;": "\u2283", "supseteq;": "\u2287", "supseteqq;": "\u2AC6", "supsetneq;": "\u228B", "supsetneqq;": "\u2ACC", "supsim;": "\u2AC8", "supsub;": "\u2AD4", "supsup;": "\u2AD6", "swArr;": "\u21D9", "swarhk;": "\u2926", "swarr;": "\u2199", "swarrow;": "\u2199", "swnwar;": "\u292A", "szlig": "\xDF", "szlig;": "\xDF", "target;": "\u2316", "tau;": "\u03C4", "tbrk;": "\u23B4", "tcaron;": "\u0165", "tcedil;": "\u0163", "tcy;": "\u0442", "tdot;": "\u20DB", "telrec;": "\u2315", "tfr;": "\u{1D531}", "there4;": "\u2234", "therefore;": "\u2234", "theta;": "\u03B8", "thetasym;": "\u03D1", "thetav;": "\u03D1", "thickapprox;": "\u2248", "thicksim;": "\u223C", "thinsp;": "\u2009", "thkap;": "\u2248", "thksim;": "\u223C", "thorn": "\xFE", "thorn;": "\xFE", "tilde;": "\u02DC", "times": "\xD7", "times;": "\xD7", "timesb;": "\u22A0", "timesbar;": "\u2A31", "timesd;": "\u2A30", "tint;": "\u222D", "toea;": "\u2928", "top;": "\u22A4", "topbot;": "\u2336", "topcir;": "\u2AF1", "topf;": "\u{1D565}", "topfork;": "\u2ADA", "tosa;": "\u2929", "tprime;": "\u2034", "trade;": "\u2122", "triangle;": "\u25B5", "triangledown;": "\u25BF", "triangleleft;": "\u25C3", "trianglelefteq;": "\u22B4", "triangleq;": "\u225C", "triangleright;": "\u25B9", "trianglerighteq;": "\u22B5", "tridot;": "\u25EC", "trie;": "\u225C", "triminus;": "\u2A3A", "triplus;": "\u2A39", "trisb;": "\u29CD", "tritime;": "\u2A3B", "trpezium;": "\u23E2", "tscr;": "\u{1D4C9}", "tscy;": "\u0446", "tshcy;": "\u045B", "tstrok;": "\u0167", "twixt;": "\u226C", "twoheadleftarrow;": "\u219E", "twoheadrightarrow;": "\u21A0", "uArr;": "\u21D1", "uHar;": "\u2963", "uacute": "\xFA", "uacute;": "\xFA", "uarr;": "\u2191", "ubrcy;": "\u045E", "ubreve;": "\u016D", "ucirc": "\xFB", "ucirc;": "\xFB", "ucy;": "\u0443", "udarr;": "\u21C5", "udblac;": "\u0171", "udhar;": "\u296E", "ufisht;": "\u297E", "ufr;": "\u{1D532}", "ugrave": "\xF9", "ugrave;": "\xF9", "uharl;": "\u21BF", "uharr;": "\u21BE", "uhblk;": "\u2580", "ulcorn;": "\u231C", "ulcorner;": "\u231C", "ulcrop;": "\u230F", "ultri;": "\u25F8", "umacr;": "\u016B", "uml": "\xA8", "uml;": "\xA8", "uogon;": "\u0173", "uopf;": "\u{1D566}", "uparrow;": "\u2191", "updownarrow;": "\u2195", "upharpoonleft;": "\u21BF", "upharpoonright;": "\u21BE", "uplus;": "\u228E", "upsi;": "\u03C5", "upsih;": "\u03D2", "upsilon;": "\u03C5", "upuparrows;": "\u21C8", "urcorn;": "\u231D", "urcorner;": "\u231D", "urcrop;": "\u230E", "uring;": "\u016F", "urtri;": "\u25F9", "uscr;": "\u{1D4CA}", "utdot;": "\u22F0", "utilde;": "\u0169", "utri;": "\u25B5", "utrif;": "\u25B4", "uuarr;": "\u21C8", "uuml": "\xFC", "uuml;": "\xFC", "uwangle;": "\u29A7", "vArr;": "\u21D5", "vBar;": "\u2AE8", "vBarv;": "\u2AE9", "vDash;": "\u22A8", "vangrt;": "\u299C", "varepsilon;": "\u03F5", "varkappa;": "\u03F0", "varnothing;": "\u2205", "varphi;": "\u03D5", "varpi;": "\u03D6", "varpropto;": "\u221D", "varr;": "\u2195", "varrho;": "\u03F1", "varsigma;": "\u03C2", "varsubsetneq;": "\u228A\uFE00", "varsubsetneqq;": "\u2ACB\uFE00", "varsupsetneq;": "\u228B\uFE00", "varsupsetneqq;": "\u2ACC\uFE00", "vartheta;": "\u03D1", "vartriangleleft;": "\u22B2", "vartriangleright;": "\u22B3", "vcy;": "\u0432", "vdash;": "\u22A2", "vee;": "\u2228", "veebar;": "\u22BB", "veeeq;": "\u225A", "vellip;": "\u22EE", "verbar;": "|", "vert;": "|", "vfr;": "\u{1D533}", "vltri;": "\u22B2", "vnsub;": "\u2282\u20D2", "vnsup;": "\u2283\u20D2", "vopf;": "\u{1D567}", "vprop;": "\u221D", "vrtri;": "\u22B3", "vscr;": "\u{1D4CB}", "vsubnE;": "\u2ACB\uFE00", "vsubne;": "\u228A\uFE00", "vsupnE;": "\u2ACC\uFE00", "vsupne;": "\u228B\uFE00", "vzigzag;": "\u299A", "wcirc;": "\u0175", "wedbar;": "\u2A5F", "wedge;": "\u2227", "wedgeq;": "\u2259", "weierp;": "\u2118", "wfr;": "\u{1D534}", "wopf;": "\u{1D568}", "wp;": "\u2118", "wr;": "\u2240", "wreath;": "\u2240", "wscr;": "\u{1D4CC}", "xcap;": "\u22C2", "xcirc;": "\u25EF", "xcup;": "\u22C3", "xdtri;": "\u25BD", "xfr;": "\u{1D535}", "xhArr;": "\u27FA", "xharr;": "\u27F7", "xi;": "\u03BE", "xlArr;": "\u27F8", "xlarr;": "\u27F5", "xmap;": "\u27FC", "xnis;": "\u22FB", "xodot;": "\u2A00", "xopf;": "\u{1D569}", "xoplus;": "\u2A01", "xotime;": "\u2A02", "xrArr;": "\u27F9", "xrarr;": "\u27F6", "xscr;": "\u{1D4CD}", "xsqcup;": "\u2A06", "xuplus;": "\u2A04", "xutri;": "\u25B3", "xvee;": "\u22C1", "xwedge;": "\u22C0", "yacute": "\xFD", "yacute;": "\xFD", "yacy;": "\u044F", "ycirc;": "\u0177", "ycy;": "\u044B", "yen": "\xA5", "yen;": "\xA5", "yfr;": "\u{1D536}", "yicy;": "\u0457", "yopf;": "\u{1D56A}", "yscr;": "\u{1D4CE}", "yucy;": "\u044E", "yuml": "\xFF", "yuml;": "\xFF", "zacute;": "\u017A", "zcaron;": "\u017E", "zcy;": "\u0437", "zdot;": "\u017C", "zeetrf;": "\u2128", "zeta;": "\u03B6", "zfr;": "\u{1D537}", "zhcy;": "\u0436", "zigrarr;": "\u21DD", "zopf;": "\u{1D56B}", "zscr;": "\u{1D4CF}", "zwj;": "\u200D", "zwnj;": "\u200C" });

// ../wire-core/dist/operations.js
var wireWatchHooks2 = Symbol("wireWatchHooks");

// ../wire/src/hooks.ts
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process2.execFile);
function primaryFilesystemLink(resource) {
  return resource.filesystem_links.find((link) => link.role === "primary");
}
function wireTitle(resource) {
  return resource.data.find((item) => item.namespace === "wire" && item.key === "title").value;
}
async function hookCommandPaths(wireRoot2, event) {
  const hooksPath = (0, import_node_path4.join)(wireRoot2, "hooks");
  const eventPath = (0, import_node_path4.join)(hooksPath, event);
  const paths = [];
  if ((0, import_node_fs3.existsSync)(eventPath)) paths.push(eventPath);
  const directoryPath = (0, import_node_path4.join)(hooksPath, `${event}.d`);
  if ((0, import_node_fs3.existsSync)(directoryPath)) {
    const directory = (0, import_node_fs3.statSync)(directoryPath);
    if (!directory.isDirectory()) throw new Error(`Wire hook path is not a directory: ${directoryPath}`);
    for (const filename of (await (0, import_promises5.readdir)(directoryPath)).sort()) paths.push((0, import_node_path4.join)(directoryPath, filename));
  }
  for (const path of paths) {
    const file = (0, import_node_fs3.statSync)(path);
    if (!file.isFile()) throw new Error(`Wire hook path is not a file: ${path}`);
    if ((file.mode & 73) === 0) throw new Error(`Wire hook is not executable: ${path}`);
  }
  return paths;
}
function changedWireResult(result) {
  return result.summary.action !== "synced" || result.summary.added !== 0 || result.summary.modified !== 0 || result.summary.removed !== 0;
}
function stringEnvironment(environment2) {
  const result = {};
  for (const [name, value] of Object.entries(environment2)) if (value !== void 0) result[name] = value;
  return result;
}
function resourceEnvironment(command, currentDirectory, wireRoot2, result) {
  const primary = primaryFilesystemLink(result.resource);
  const service = result.resource.identifiers[0].service;
  return {
    WIRE_EVENT: "post-resource",
    WIRE_COMMAND: command,
    WIRE_CWD: currentDirectory,
    WIRE_WORKSPACE: (0, import_node_path4.dirname)(wireRoot2),
    WIRE_ROOT: wireRoot2,
    WIRE_RESOURCE_ID: result.resource.id,
    WIRE_SERVICE: service,
    WIRE_TITLE: wireTitle(result.resource),
    WIRE_PATH: result.path,
    WIRE_LOCAL: primary.path,
    WIRE_REMOTE: result.summary.remote,
    WIRE_ACTION: result.summary.action,
    WIRE_ADDED: String(result.summary.added),
    WIRE_MODIFIED: String(result.summary.modified),
    WIRE_REMOVED: String(result.summary.removed)
  };
}
function summaryEnvironment(event, command, currentDirectory, wireRoot2, results) {
  return {
    WIRE_EVENT: event,
    WIRE_COMMAND: command,
    WIRE_CWD: currentDirectory,
    WIRE_WORKSPACE: (0, import_node_path4.dirname)(wireRoot2),
    WIRE_ROOT: wireRoot2,
    WIRE_RESULT_COUNT: String(results.length),
    WIRE_CHANGED_COUNT: String(results.filter(changedWireResult).length),
    WIRE_FAILED_COUNT: String(results.filter((result) => result.summary.action === "failed").length)
  };
}
function outputEnvironment(stdout) {
  const values2 = {};
  for (const line of stdout.split(/\r\n|\n|\r/)) {
    if (!/^WIRE_[A-Za-z0-9_]+=/.test(line)) continue;
    const index = line.indexOf("=");
    values2[line.slice(0, index)] = line.slice(index + 1);
  }
  return values2;
}
async function updateMovedResult(options, wireRoot2, result, movedPath) {
  const workspace2 = (0, import_node_path4.dirname)(wireRoot2);
  const outputPath = (0, import_node_path4.isAbsolute)(movedPath) ? movedPath : (0, import_node_path4.resolve)(workspace2, movedPath);
  const relativePath = wireRelativePath(outputPath, wireRoot2);
  const primary = primaryFilesystemLink(result.resource);
  const resource = {
    ...result.resource,
    filesystem_links: [
      ...result.resource.filesystem_links.filter((link) => !(link.path === primary.path && link.role === "primary")),
      { ...primary, path: relativePath }
    ]
  };
  if (result.summary.action !== "detached") {
    const registry = await openWireRegistry(wireRoot2, options.home);
    if ((await registry.listResources()).some((item) => item.id === result.resource.id)) await registry.put(resource);
  }
  return { ...result, resource, path: outputPath, summary: { ...result.summary, local: outputPath } };
}
async function hookEnvironment(options, wireRoot2) {
  const config2 = await loadWireConfig(wireRoot2);
  return stringEnvironment({ ...options.environment, ...config2.env });
}
async function runHookCommands(wireRoot2, event, environment2) {
  let current = { ...environment2 };
  for (const path of await hookCommandPaths(wireRoot2, event)) {
    const result = await execFileAsync(path, [], { cwd: (0, import_node_path4.dirname)(wireRoot2), env: current, encoding: "utf8" });
    current = { ...current, ...outputEnvironment(result.stdout) };
  }
  return current;
}
async function runResourceHooks(options, command, result) {
  const wireRoot2 = await configuredWireRoot(result.path, options.home);
  if (wireRoot2 === null) return { result, environment: {} };
  let currentResult = result;
  let environment2 = {
    ...await hookEnvironment(options, wireRoot2),
    ...resourceEnvironment(command, options.currentDirectory, wireRoot2, currentResult)
  };
  for (const path of await hookCommandPaths(wireRoot2, "post-resource")) {
    const hookResult = await execFileAsync(path, [], { cwd: (0, import_node_path4.dirname)(wireRoot2), env: environment2, encoding: "utf8" });
    const output = outputEnvironment(hookResult.stdout);
    environment2 = { ...environment2, ...output };
    const outputPath = output["WIRE_PATH"];
    if (outputPath !== void 0 && (0, import_node_path4.resolve)((0, import_node_path4.dirname)(wireRoot2), outputPath) !== currentResult.path) {
      currentResult = await updateMovedResult(options, wireRoot2, currentResult, outputPath);
      environment2 = { ...environment2, ...resourceEnvironment(command, options.currentDirectory, wireRoot2, currentResult) };
    }
  }
  return { result: currentResult, environment: environment2 };
}
async function runSummaryHooks(options, event, command, rootPath, results, environment2) {
  const wireRoot2 = await configuredWireRoot(rootPath, options.home);
  if (wireRoot2 === null) return {};
  return runHookCommands(wireRoot2, event, {
    ...await hookEnvironment(options, wireRoot2),
    ...environment2,
    ...summaryEnvironment(event, command, options.currentDirectory, wireRoot2, results)
  });
}
async function runSingleResultHooks(options, command, result) {
  const state = result.summary.action === "failed" ? { result, environment: {} } : await runResourceHooks(options, command, result);
  await runSummaryHooks(options, "post-command", command, state.result.path, [state.result], state.environment);
  return state.result;
}
async function runBatchHooks(options, command, results) {
  const updated = [];
  let environment2 = {};
  for (const result of results) {
    if (result.summary.action === "failed") {
      updated.push(result);
    } else {
      const state = await runResourceHooks(options, command, result);
      updated.push(state.result);
      environment2 = { ...environment2, ...state.environment };
    }
  }
  const rootPath = updated[0]?.path ?? options.currentDirectory;
  environment2 = await runSummaryHooks(options, "post-batch", command, rootPath, updated, environment2);
  await runSummaryHooks(options, "post-command", command, rootPath, updated, environment2);
  return updated;
}
function withWireHooks(wire2, options) {
  const watchSyncHook = (command, result) => runSingleResultHooks(options, command, result);
  return Object.freeze({
    ...wire2,
    attach: async (url, path) => runSingleResultHooks(options, "attach", await wire2.attach(url, path)),
    create: async (url, path) => runSingleResultHooks(options, "attach", await wire2.create(url, path)),
    sync: async (value, path) => runSingleResultHooks(options, "sync", await wire2.sync(value, path)),
    downloadSource: async (url, path) => runSingleResultHooks(options, "download", await wire2.downloadSource(url, path)),
    download: async (value, path) => runSingleResultHooks(options, "download", await wire2.download(value, path)),
    detach: async (value, path) => runSingleResultHooks(options, "detach", await wire2.detach(value, path)),
    unlink: async (value, path) => runSingleResultHooks(options, "detach", await wire2.unlink(value, path)),
    watch: async (value, path) => wire2[wireWatchHooks2](value, path, [watchSyncHook]),
    syncAll: async (path) => runBatchHooks(options, "sync-all", await wire2.syncAll(path))
  });
}

// ../provider-asana/src/asana-sync.ts
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

// ../provider-asana/src/asana-project.ts
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

// ../provider-asana/src/asana-task.ts
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
async function fetchTask(runtime2, identifier2) {
  return object2((await asana(runtime2, `/tasks/${identifier2}`, {
    opt_fields: "gid,name,notes,completed,completed_at,created_at,modified_at,due_on,due_at,permalink_url,assignee,assignee.name,assignee.email,memberships.project.gid,memberships.project.name,memberships.section.name,projects.name,tags.name"
  }))["data"]);
}
async function fetchStories(runtime2, identifier2) {
  const stories = [];
  let offset;
  do {
    const parameters = { limit: "100", opt_fields: "gid,type,text,created_at,created_by.name,created_by.email,resource_subtype" };
    if (offset !== void 0) parameters["offset"] = offset;
    const page = await asana(runtime2, `/tasks/${identifier2}/stories`, parameters);
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

// ../provider-asana/src/index.ts
var asanaProvider = Object.freeze({
  services: [asanaProjectService, asanaTaskService]
});

// ../provider-chatgpt/src/cooldown.ts
var import_promises6 = require("node:timers/promises");
var ChatgptCooldownError = class extends Error {
  constructor(cooldown) {
    super(`ChatGPT is still rate-limited after ${cooldown.attempt} attempts. No further requests were sent. Retry no earlier than ${cooldown.retry_at} (${cooldown.source}).`);
    this.cooldown = cooldown;
  }
};
function responseCooldown(response, now, attempt, endpoint2) {
  const retryAfter = response.headers.get("retry-after")?.trim();
  let milliseconds = 1e3 * 2 ** (attempt - 1);
  let source = "exponential-backoff";
  if (retryAfter !== void 0 && /^\d+$/.test(retryAfter) && Number.isSafeInteger(Number(retryAfter) * 1e3)) {
    milliseconds = Number(retryAfter) * 1e3;
    source = "retry-after-seconds";
  } else if (retryAfter !== void 0 && /^[A-Za-z]/.test(retryAfter) && Number.isFinite(Date.parse(retryAfter))) {
    const serverDate = Date.parse(response.headers.get("date") ?? "");
    milliseconds = Math.max(0, Date.parse(retryAfter) - (Number.isFinite(serverDate) ? serverDate : now));
    source = "retry-after-date";
  }
  if (!Number.isFinite(new Date(now + milliseconds).getTime())) {
    milliseconds = 1e3 * 2 ** (attempt - 1);
    source = "exponential-backoff";
  }
  return { endpoint: endpoint2, status: response.status, attempt, delay_ms: milliseconds, retry_at: new Date(now + milliseconds).toISOString(), source };
}
function createChatgptRequester(http, onCooldown = async () => {
}, timing = { now: () => Date.now(), sleep: (milliseconds) => (0, import_promises6.setTimeout)(milliseconds) }) {
  const deadlines = /* @__PURE__ */ new Map();
  let stopped;
  return async (url, headers, endpoint2) => {
    if (stopped !== void 0) throw stopped;
    const origin = new URL(url).origin;
    for (let attempt = 1; ; attempt++) {
      while (timing.now() < (deadlines.get(origin) ?? 0)) await timing.sleep(Math.min(2147483647, deadlines.get(origin) - timing.now()));
      const response = await http.request(url, { headers, redirect: "manual", signal: AbortSignal.timeout(6e4) });
      if (![429, 500, 502, 503, 504].includes(response.status)) return response;
      const cooldown = responseCooldown(response, timing.now(), attempt, endpoint2);
      deadlines.set(origin, Math.max(deadlines.get(origin) ?? 0, Date.parse(cooldown.retry_at)));
      await onCooldown(cooldown);
      if (attempt === 5) {
        if (response.status !== 429) return response;
        await response.body?.cancel();
        stopped = new ChatgptCooldownError(cooldown);
        throw stopped;
      }
      await response.body?.cancel();
    }
  };
}

// ../provider-chatgpt/src/client.ts
function authError() {
  return new Error("ChatGPT authentication is missing or expired. Run `wire chatgpt login` once; other commands reuse saved cookies.");
}
function object3(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected ChatGPT object response");
  return value;
}
function text(value) {
  return typeof value === "string" && value !== "" ? value : void 0;
}
var ChatgptRequestError = class extends Error {
  constructor(status, endpoint2) {
    super(`ChatGPT request failed (${status}): ${endpoint2}${status === 401 || status === 403 ? ". Run `wire chatgpt login`." : ""}`);
    this.status = status;
    this.endpoint = endpoint2;
  }
};
async function connectChatgpt(runtime2, referer, onCooldown) {
  const cookies = await runtime2.cookies.loadSaved("chatgpt");
  if (cookies === null) throw authError();
  const device = cookies.find((cookie) => cookie.name === "oai-did")?.value;
  const headers = {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    ...device === void 0 ? {} : { "oai-device-id": device },
    "oai-language": "en-US",
    referer,
    cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ")
  };
  const response = await runtime2.http.request("https://chatgpt.com/api/auth/session", { headers, signal: AbortSignal.timeout(6e4), redirect: "error" });
  const contents = await response.text();
  if (!response.ok || !contents.trimStart().startsWith("{")) throw authError();
  const session = object3(JSON.parse(contents));
  if (session["error"] !== void 0 || text(session["accessToken"]) === void 0 || session["account"] == null) throw authError();
  const account = object3(session["account"]);
  const accountId = text(account["id"]);
  if (accountId === void 0) throw authError();
  headers["authorization"] = `Bearer ${session["accessToken"]}`;
  const request2 = createChatgptRequester(runtime2.http, onCooldown);
  const forAccount = (id) => {
    const authenticated = { ...headers, "chatgpt-account-id": id };
    const json = async (endpoint2) => {
      if (!endpoint2.startsWith("/backend-api/")) throw new Error("Invalid ChatGPT API endpoint");
      const result = await request2(`https://chatgpt.com${endpoint2}`, authenticated, endpoint2);
      if (!result.ok) throw new ChatgptRequestError(result.status, endpoint2);
      return await result.json();
    };
    const bytes = async (value) => {
      let url = new URL(value, "https://chatgpt.com");
      for (let redirects = 0; redirects <= 5; redirects++) {
        const trusted = url.hostname === "chatgpt.com" || url.hostname.endsWith(".oaiusercontent.com") || url.hostname.endsWith(".blob.core.windows.net");
        if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "" && url.port !== "443" || !trusted) throw new Error("Untrusted ChatGPT file download URL");
        const result = await request2(url.href, url.origin === "https://chatgpt.com" ? authenticated : {}, url.origin + url.pathname);
        if ([301, 302, 303, 307, 308].includes(result.status)) {
          const location = result.headers.get("location");
          await result.body?.cancel();
          if (location === null) throw new Error("ChatGPT file redirect is missing its destination");
          url = new URL(location, url);
          continue;
        }
        if (!result.ok) throw new ChatgptRequestError(result.status, url.origin + url.pathname);
        return new Uint8Array(await result.arrayBuffer());
      }
      throw new Error("Too many ChatGPT file redirects");
    };
    return { id, json, bytes };
  };
  return { accountId, forAccount };
}

// ../provider-chatgpt/src/download.ts
var import_node_crypto3 = require("node:crypto");
function segment(value) {
  const safe = value.replace(/[^\p{L}\p{N}._-]/gu, "-").slice(0, 64);
  return safe === value && safe !== "." && safe !== ".." && safe !== "" ? safe : `${safe || "item"}-${(0, import_node_crypto3.createHash)("sha256").update(value).digest("hex").slice(0, 12)}`;
}
function items(value) {
  if (!Array.isArray(value)) throw new Error("ChatGPT list response is missing items");
  return value.map((item) => object3(item));
}
function identifier(value) {
  const id = text(value["id"]) ?? text(value["conversation_id"]);
  if (id === void 0) throw new Error("ChatGPT item is missing its identifier");
  return id;
}
function endpoint(path, query) {
  return `${path}?${new URLSearchParams(query)}`;
}
function assets(value, context2) {
  const found = /* @__PURE__ */ new Map();
  const addFile = (id, name) => {
    const queryIndex = id.indexOf("?");
    const fileId = (queryIndex === -1 ? id : id.slice(0, queryIndex)).replaceAll("#", "*");
    const query = Object.fromEntries(new URLSearchParams(queryIndex === -1 ? "" : id.slice(queryIndex + 1)));
    if (context2.conversation !== void 0) query["conversation_id"] = context2.conversation;
    if (context2.project !== void 0) query["gizmo_id"] = context2.project;
    const key2 = `file:${id}`;
    found.set(key2, { key: key2, name: name ?? fileId, endpoint: endpoint(`/backend-api/files/download/${encodeURIComponent(fileId)}`, query) });
  };
  const visit = (node, message) => {
    if (typeof node === "string") {
      if (node.startsWith("file-service://") || node.startsWith("sediment://")) addFile(node.slice(node.indexOf("://") + 3));
      if (context2.conversation !== void 0 && message !== void 0) {
        for (const match of node.matchAll(/sandbox:(\/[^\s)\]<>"']+)/g)) {
          const path = match[1];
          const key2 = `sandbox:${message}:${path}`;
          found.set(key2, { key: key2, name: path.split("/").pop() || "file", endpoint: endpoint(`/backend-api/conversation/${encodeURIComponent(context2.conversation)}/interpreter/download`, { message_id: message, sandbox_path: path }) });
        }
      }
    } else if (Array.isArray(node)) {
      for (const child of node) visit(child, message);
    } else if (node !== null && typeof node === "object") {
      const record = node;
      const currentMessage = record["author"] !== void 0 ? text(record["id"]) ?? message : message;
      const fileId = text(record["file_id"]) ?? (/^file[-_]/.test(text(record["id"]) ?? "") ? text(record["id"]) : void 0);
      if (fileId !== void 0) addFile(fileId, text(record["name"]) ?? text(record["filename"]));
      const libraryId = text(record["library_file_id"]) ?? (text(record["id"])?.startsWith("libfile_") ? text(record["id"]) : void 0);
      if (fileId === void 0 && libraryId !== void 0) {
        const key2 = `library:${libraryId}`;
        found.set(key2, { key: key2, name: text(record["name"]) ?? libraryId, endpoint: `/backend-api/files/library/files/${encodeURIComponent(libraryId)}/content_url` });
      }
      for (const child of Object.values(record)) visit(child, currentMessage);
    }
  };
  visit(value, context2.message);
  return [...found.values()];
}
var DownloadWriteError = class extends Error {
};
async function downloadChatgpt(runtime2, url, source, write, render2) {
  if (source.type !== "project") return null;
  const wholeHistory = source.identifier === "history";
  const base = wholeHistory ? "chatgpt" : `chatgpt/projects/${segment(source.identifier)}`;
  const title2 = wholeHistory ? "ChatGPT history" : "ChatGPT project";
  const errors = [];
  const skipped = [];
  const records = [];
  const files = [];
  const cooldowns = [];
  const started = runtime2.clock.now().toISOString();
  const save = async (path2, contents) => {
    try {
      await write(path2, contents);
    } catch (error) {
      throw new DownloadWriteError(`Could not write ${path2}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const json = (path2, value) => save(path2, `${JSON.stringify(value, null, 2)}
`);
  const attempt = async (resource, action) => {
    try {
      return await action();
    } catch (error) {
      if (error instanceof DownloadWriteError || error instanceof ChatgptCooldownError) throw error;
      errors.push({ resource, error: error instanceof Error ? error.message : String(error) });
      return void 0;
    }
  };
  const session = await connectChatgpt(runtime2, url, async (cooldown) => {
    cooldowns.push(cooldown);
    await json(`${base}/manifest.json`, { status: "cooldown", source: url, started_at: started, records, files, errors, skipped, cooldowns, retry_at: cooldown.retry_at });
  });
  await json(`${base}/manifest.json`, { status: "in_progress", source: url, started_at: started });
  const paged = async (client, path2, query, output, consume, offsetMode = false, filter) => {
    const seen = /* @__PURE__ */ new Set();
    let cursor;
    let offset = 0;
    let pageNumber = 0;
    for (; ; ) {
      const parameters = { ...query, ...offsetMode ? { offset: String(offset) } : cursor === void 0 ? {} : { cursor } };
      const page = object3(await client.json(endpoint(path2, parameters)));
      const entries = items(page["items"]);
      await json(`${output}/${pageNumber++}.json`, filter === void 0 ? page : { ...page, items: entries.filter(filter) });
      for (const item of entries) consume(item);
      if (offsetMode) {
        if (page["offset"] !== void 0 && page["offset"] !== offset) throw new Error(`ChatGPT returned a different offset for ${path2}`);
        if (entries.length === 0) {
          if (typeof page["total"] === "number" && offset < page["total"]) throw new Error(`ChatGPT listing stopped before its reported total: ${path2}`);
          break;
        }
        const signature = entries.map(identifier).join("|");
        if (seen.has(signature)) throw new Error(`ChatGPT repeated a page: ${path2}`);
        seen.add(signature);
        offset += entries.length;
        if (typeof page["total"] === "number" && offset >= page["total"]) break;
      } else {
        if (!("cursor" in page) && !("next_cursor" in page) && page["has_more"] !== false) throw new Error(`ChatGPT list response is missing pagination metadata: ${path2}`);
        const next = page["cursor"] ?? page["next_cursor"];
        if (next == null || next === "") {
          if (page["has_more"] === true) throw new Error(`ChatGPT listing has more items but no cursor: ${path2}`);
          break;
        }
        if (typeof next !== "string" && typeof next !== "number") throw new Error(`Invalid ChatGPT pagination cursor: ${path2}`);
        cursor = String(next);
        if (seen.has(cursor)) throw new Error(`ChatGPT repeated a cursor: ${path2}`);
        seen.add(cursor);
      }
    }
  };
  const downloadAssets = async (client, references, directory) => {
    const links = [];
    for (const asset of references) {
      await attempt(asset.endpoint, async () => {
        const metadata = object3(await client.json(asset.endpoint));
        const downloadUrl = text(metadata["download_url"]) ?? text(metadata["content_url"]);
        if (downloadUrl === void 0) throw new Error(`ChatGPT file is unavailable (${String(metadata["status"] ?? "missing URL")})`);
        const bytes = await client.bytes(downloadUrl);
        const name = `${(0, import_node_crypto3.createHash)("sha256").update(asset.key).digest("hex").slice(0, 12)}-${segment(asset.name)}`;
        const path2 = `${directory}/assets/${name}`;
        await save(path2, bytes);
        files.push({ path: path2, source: asset.endpoint, bytes: bytes.byteLength, sha256: (0, import_node_crypto3.createHash)("sha256").update(bytes).digest("hex") });
        links.push(`- [${asset.name.replace(/[\[\]\r\n]/g, " ")}](assets/${encodeURIComponent(name)})`);
      });
    }
    return links;
  };
  const exportAccount = async (client, directory, projectId) => {
    const conversations = /* @__PURE__ */ new Map();
    const projects = /* @__PURE__ */ new Map();
    const projectConversations = /* @__PURE__ */ new Map();
    const addConversation = (entry, owner) => {
      const id = identifier(entry);
      conversations.set(id, { ...conversations.get(id), ...entry });
      const project = owner ?? text(entry["gizmo_id"]) ?? text(entry["conversation_template_id"]);
      if (project?.startsWith("g-p-")) {
        if (!projects.has(project)) projects.set(project, void 0);
        if (!projectConversations.has(project)) projectConversations.set(project, /* @__PURE__ */ new Set());
        projectConversations.get(project).add(id);
      }
    };
    for (const archived of [false, true]) for (const starred of [false, true]) {
      await attempt(`${client.id}: ${archived ? "archived" : "active"} ${starred ? "starred" : "unstarred"} conversations`, () => paged(client, "/backend-api/conversations", { limit: "100", order: "updated", is_archived: String(archived), is_starred: String(starred) }, `${directory}/listings/${archived ? "archived" : "active"}-${starred ? "starred" : "unstarred"}`, (entry) => {
        if (projectId === void 0 || entry["gizmo_id"] === projectId || entry["conversation_template_id"] === projectId) addConversation(entry);
      }, true, projectId === void 0 ? void 0 : (entry) => entry["gizmo_id"] === projectId || entry["conversation_template_id"] === projectId));
    }
    if (projectId === void 0) {
      await attempt(`${client.id}: projects`, () => paged(client, "/backend-api/gizmos/snorlax/sidebar", { owned_only: "false", conversations_per_gizmo: "5", limit: "20" }, `${directory}/listings/projects`, (entry) => {
        const wrapper = object3(entry["gizmo"]);
        const project = object3(wrapper["gizmo"]);
        const id = identifier(project);
        projects.set(id, wrapper);
        if (entry["conversations"] !== void 0) for (const conversation of items(object3(entry["conversations"])["items"])) addConversation(conversation, id);
      }));
    } else projects.set(projectId, void 0);
    for (const [id, fallback] of projects) {
      const projectDirectory2 = projectId === void 0 ? `${directory}/projects/${segment(id)}` : directory;
      const metadata = await attempt(`${client.id}: project ${id}`, () => client.json(`/backend-api/gizmos/${encodeURIComponent(id)}`));
      const detail = metadata ?? fallback;
      let projectTitle = id;
      let instructions = "";
      let fileLinks = [];
      if (detail !== void 0) {
        await json(`${projectDirectory2}/project.json`, detail);
        await attempt(`${id}: project metadata`, async () => {
          const wrapper = object3(detail);
          const project = object3(wrapper["gizmo"]);
          projectTitle = text(object3(project["display"])["name"]) ?? id;
          instructions = text(project["instructions"]) ?? "";
          fileLinks = await downloadAssets(client, assets(wrapper, { project: id }), projectDirectory2);
        });
      }
      await attempt(`${id}: project conversations`, () => paged(client, `/backend-api/gizmos/${encodeURIComponent(id)}/conversations`, { limit: "50", owned_only: "false" }, `${projectDirectory2}/listings/conversations`, (entry) => addConversation(entry, id)));
      await attempt(`${id}: project sources`, () => paged(client, `/backend-api/projects/${encodeURIComponent(id)}/connector_scopes`, { limit: "100" }, `${projectDirectory2}/sources`, () => {
      }));
      const ids = [...projectConversations.get(id) ?? []];
      const prefix = projectId === void 0 ? "../../" : "";
      const markdown2 = `# ${projectTitle}

## Instructions

${instructions || "No project instructions."}

## Conversations

${ids.map((conversationId) => `- [${conversationId}](${prefix}conversations/${segment(conversationId)}/index.md)`).join("\n") || "No conversations."}

## Files

${fileLinks.join("\n") || "See project.json and sources for source metadata."}
`;
      await save(`${projectDirectory2}/index.md`, markdown2);
      records.push({ type: "project", account_id: client.id, id, title: projectTitle, path: `${projectDirectory2}/index.md`, conversations: ids });
    }
    for (const [id, listing] of conversations) {
      const conversationDirectory = `${directory}/conversations/${segment(id)}`;
      await json(`${conversationDirectory}/listing.json`, listing);
      await attempt(`${client.id}: conversation ${id}`, async () => {
        const conversation = object3(await client.json(`/backend-api/conversation/${encodeURIComponent(id)}`));
        await json(`${conversationDirectory}/conversation.json`, conversation);
        records.push({ type: "conversation", account_id: client.id, id, title: text(conversation["title"]) ?? id, path: `${conversationDirectory}/index.md`, raw: `${conversationDirectory}/conversation.json` });
        const fileLinks = await downloadAssets(client, assets(conversation, { conversation: id }), conversationDirectory);
        await attempt(`${id}: canvases`, async () => {
          const canvases = await client.json(`/backend-api/conversation/${encodeURIComponent(id)}/textdocs`);
          await json(`${conversationDirectory}/textdocs.json`, canvases);
          for (const canvas of items(canvases)) {
            const content = text(canvas["content"]);
            if (content !== void 0) await save(`${conversationDirectory}/canvases/${segment(identifier(canvas))}.txt`, content);
          }
        });
        const markdown2 = await attempt(`${id}: readable transcript`, async () => render2(conversation));
        await save(`${conversationDirectory}/index.md`, `${markdown2 ?? `# ${text(conversation["title"]) ?? id}

The readable transcript could not be rendered; the full JSON is preserved.
`}
## Archive

[Complete conversation JSON (all branches and metadata)](conversation.json)

${fileLinks.join("\n")}
`);
      });
    }
    if (projectId === void 0) {
      const directories = [void 0];
      const seenDirectories = /* @__PURE__ */ new Set();
      const library = /* @__PURE__ */ new Map();
      for (const parent of directories) {
        await attempt(`${client.id}: library ${parent ?? "root"}`, () => paged(client, "/backend-api/files/library/nodes", { include_hidden_files: "true", include_saved_entities: "true", ...parent === void 0 ? {} : { parent_directory_id: parent } }, `${directory}/library/listings/${parent === void 0 ? "root" : segment(parent)}`, (entry) => {
          const id = text(entry["id"]) ?? text(entry["library_file_id"]);
          if (id === void 0) throw new Error("ChatGPT Library item is missing its identifier");
          if (entry["type"] === "folder" || entry["kind"] === "folder" || entry["kind"] === "directory" || entry["node_type"] === "directory") {
            if (!seenDirectories.has(id)) {
              seenDirectories.add(id);
              directories.push(id);
            }
          } else library.set(id, entry);
        }));
      }
      for (const [id, entry] of library) {
        const fileDirectory = `${directory}/library/files/${segment(id)}`;
        await json(`${fileDirectory}/metadata.json`, entry);
        const links = await downloadAssets(client, [{ key: `library:${id}`, name: text(entry["name"]) ?? id, endpoint: `/backend-api/files/library/files/${encodeURIComponent(id)}/content_url` }], fileDirectory);
        await save(`${fileDirectory}/index.md`, `# ${text(entry["name"]) ?? id}

${links.join("\n")}
`);
      }
      for (const path2 of ["me", "user_system_messages", "settings/user"]) {
        await attempt(`${client.id}: ${path2}`, async () => json(`${directory}/account/${path2.replaceAll("/", "-")}.json`, await client.json(`/backend-api/${path2}`)));
      }
    }
  };
  const exportAll = async () => {
    if (!wholeHistory) {
      await exportAccount(session.forAccount(session.accountId), base, source.identifier);
      return;
    }
    const current = session.forAccount(session.accountId);
    const accounts = await attempt("accounts", () => current.json("/backend-api/accounts/check/v4-2023-04-27"));
    const accountIds = /* @__PURE__ */ new Set([session.accountId]);
    if (accounts !== void 0) {
      await json(`${base}/accounts.json`, accounts);
      await attempt("account listing", async () => {
        for (const value of Object.values(object3(object3(accounts)["accounts"]))) {
          const entry = object3(value);
          const account = object3(entry["account"]);
          const id = text(account["account_id"]);
          if (id === void 0 || accountIds.has(id)) continue;
          if (entry["can_access_with_session"] === false || account["is_deactivated"] === true) skipped.push({ type: "account", id, reason: "Not accessible with the current session or deactivated" });
          else accountIds.add(id);
        }
      });
    }
    for (const id of accountIds) await exportAccount(session.forAccount(id), `${base}/accounts/${segment(id)}`);
  };
  try {
    await exportAll();
  } catch (error) {
    if (!(error instanceof ChatgptCooldownError)) throw error;
    errors.push({ resource: error.cooldown.endpoint, error: error.message, retry_at: error.cooldown.retry_at });
  }
  const status = errors.length === 0 ? "complete" : "partial";
  const manifest = { status, source: url, started_at: started, finished_at: runtime2.clock.now().toISOString(), records, files, errors, skipped, cooldowns };
  await json(`${base}/manifest.json`, manifest);
  const relative3 = (path2) => path2.slice(base.length + 1);
  const lines = records.map((record) => `- ${record["type"]}: [${String(record["title"]).replace(/[\[\]\r\n]/g, " ")}](${relative3(record["path"])})`);
  const markdown = `# ${title2}

Status: **${status}**

${records.filter((record) => record["type"] === "conversation").length} conversations, ${records.filter((record) => record["type"] === "project").length} projects, ${files.length} downloaded files.

[Export manifest](manifest.json) records every failure and unavailable account. Raw conversation JSON preserves all returned branches, messages, citations, and metadata; Markdown is the readable active branch. Deleted or expired server data cannot be recovered. Linked external sources are recorded, not recursively fetched.

${lines.join("\n")}
${errors.length === 0 ? "" : `
## Incomplete downloads

${errors.map((error) => `- ${error["resource"]}: ${error["error"]}`).join("\n")}
`}`;
  const path = `${base}/${wholeHistory ? "index" : "export"}.md`;
  const retryAt = errors.map((error) => text(error["retry_at"])).filter((value) => value !== void 0).sort().at(-1);
  return { title: title2, markdown, path, data: { status, manifest: `${base}/manifest.json`, conversations: records.filter((record) => record["type"] === "conversation").length, projects: records.filter((record) => record["type"] === "project").length, files: files.length, errors: errors.length }, ...errors.length === 0 ? {} : { error: `${errors.length} downloads failed. See ${base}/manifest.json; successfully downloaded data was retained.${retryAt === void 0 ? "" : ` Retry no earlier than ${retryAt}.`}` } };
}

// ../provider-chatgpt/src/chatgpt.ts
function formatUpdateTime(value) {
  if (typeof value === "string") return value;
  return new Date(value * 1e3).toISOString();
}
function orderedMessages(conversation) {
  const mapping = conversation["mapping"];
  if (typeof conversation["current_node"] === "string") {
    const path = [];
    const visited = /* @__PURE__ */ new Set();
    let nodeId = conversation["current_node"];
    while (nodeId !== null) {
      if (visited.has(nodeId) || mapping[nodeId] === void 0) throw new Error("Invalid ChatGPT conversation branch");
      visited.add(nodeId);
      const node = mapping[nodeId];
      const message = node["message"];
      if (message != null) path.push(message);
      nodeId = typeof node["parent"] === "string" ? node["parent"] : null;
    }
    return path.reverse();
  }
  const messages = [];
  for (const node of Object.values(mapping)) {
    const message = node["message"];
    if (message != null) messages.push(message);
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
function hiddenAssistantPayload(value) {
  const contentType = value["content_type"];
  return contentType === "thoughts" || contentType === "reasoning_recap" || contentType === "model_editable_context" || contentType === "tool_call" || value["product_query"] !== void 0;
}
function assistantPayloadText(value) {
  const stripped = value.trim();
  if (/^\{\s*"(?:content_type|product_query)"\s*:/.test(stripped)) return JSON.parse(stripped);
  return null;
}
function messageContent(message) {
  const content = message["content"];
  const role = message["author"]["role"];
  if (content["content_type"] === "text") {
    const parts = [];
    for (const part of content["parts"]) {
      if (typeof part === "string") {
        const stripped = part.trim();
        if (stripped.startsWith('{"content_type":"multimodal_text"') || stripped.startsWith('{"content_type": "multimodal_text"')) {
          parts.push(multimodalText(JSON.parse(stripped)));
        } else if (role === "assistant") {
          const payload = assistantPayloadText(stripped);
          if (payload === null || !hiddenAssistantPayload(payload)) parts.push(part);
        } else parts.push(part);
      } else if (role !== "assistant" || !hiddenAssistantPayload(part)) parts.push(JSON.stringify(part));
    }
    return parts.join("\n\n").trim();
  }
  if (content["content_type"] === "multimodal_text") return multimodalText(content);
  if (content["content_type"] === "code") return content["text"];
  return JSON.stringify(content);
}
function readableBody(message) {
  const content = message["content"];
  const recipient = message["recipient"];
  if (message["author"]["role"] === "assistant" && recipient !== void 0 && recipient !== "all") return "";
  if (hiddenAssistantPayload(content)) return "";
  const body2 = messageContent(message).trim();
  const role = message["author"]["role"];
  if (role === "assistant" && (body2.startsWith('{"content_type"') || body2.startsWith('{"content_type":'))) {
    const parsed = JSON.parse(body2);
    if (hiddenAssistantPayload(parsed)) return "";
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
  matches: (url) => (url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com") && (url.pathname === "/" || /^\/c\/[^/]+\/?$/.test(url.pathname) || /^\/g\/g-p-[^/]+\/project\/?$/.test(url.pathname) || /^\/g\/[^/]+\/c\/[^/]+\/?$/.test(url.pathname)),
  parse: (url) => {
    if (url.pathname === "/") return Object.freeze({ service: "chatgpt", identifier: "history", type: "project" });
    const project = /^\/g\/(g-p-[^/]+)\/project\/?$/.exec(url.pathname);
    if (project !== null) return Object.freeze({ service: "chatgpt", identifier: project[1], type: "project" });
    return Object.freeze({ service: "chatgpt", identifier: /\/c\/([^/]+)\/?$/.exec(url.pathname)[1], type: "message-thread" });
  },
  download: (runtime2, url, source, write) => downloadChatgpt(runtime2, url, source, write, conversationMarkdown),
  fetch: async (runtime2, url, source) => {
    if (source.type === "project") throw new Error("Use `wire download <url>` to export ChatGPT history or projects as a directory.");
    const session = await connectChatgpt(runtime2, url);
    const conversation = await session.forAccount(session.accountId).json(`/backend-api/conversation/${encodeURIComponent(source.identifier)}`);
    return fetchedConversation(object3(conversation));
  }
});

// ../provider-chatgpt/src/index.ts
var chatgptProvider = Object.freeze({
  services: [chatgptService]
});

// ../provider-gmail/src/gmail.ts
function decode(data) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function entities(text3) {
  return text3.replace(/&nbsp;/g, "\xA0").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}
function stripTags(html) {
  return html.replace(/<[^>]+>/g, "");
}
function htmlText(html) {
  return entities(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<a\b[^>]*\bhref=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_match, _quote, href, label) => `[${entities(stripTags(label)).trim()}](${entities(href)})`).replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, "")).split("\n").map((line) => line.trim()).filter((line) => line !== "").join("\n");
}
function attachmentLine(payload) {
  const body2 = payload["body"];
  return `- Attachment: ${payload["filename"]} (${payload["mimeType"]}, ${body2["size"]} bytes)`;
}
function body(payload) {
  const mimeType = payload["mimeType"];
  if (payload["body"] !== void 0 && payload["body"]["attachmentId"] !== void 0) return attachmentLine(payload);
  if (mimeType === "text/plain") return decode(payload["body"]["data"]);
  if (mimeType === "text/html") return htmlText(decode(payload["body"]["data"]));
  if (payload["parts"] === void 0) return attachmentLine(payload);
  const parts = payload["parts"];
  if (mimeType === "multipart/alternative") {
    const plain = parts.find((part) => part["mimeType"] === "text/plain");
    const html = parts.find((part) => part["mimeType"] === "text/html");
    if (plain !== void 0 && body(plain).trim() !== "") return body(plain);
    if (html !== void 0) return body(html);
    if (plain !== void 0) return body(plain);
  }
  return parts.map(body).filter((value) => value !== "").join("\n");
}
function threadIdentifier(url) {
  const fragmentPath = url.hash.slice(1).split("?")[0];
  const parts = fragmentPath.replace(/\/$/, "").split("/");
  const identifier2 = parts.at(-1);
  if (identifier2 === "") return void 0;
  if (["search", "label"].includes(parts[0])) return parts.length >= 3 ? identifier2 : void 0;
  if (parts[0] === "category") return parts.length === 3 ? identifier2 : void 0;
  if (["all", "drafts", "important", "inbox", "sent", "snoozed", "spam", "starred", "trash"].includes(parts[0])) return parts.length === 2 ? identifier2 : void 0;
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
      const headers = Object.fromEntries(payload["headers"].map((header) => [header["name"].toLowerCase(), header["value"]]));
      const to = headers["to"];
      const renderedBody = body(payload);
      if (to === void 0) return Object.freeze({ id: message["id"], from: headers["from"], date: headers["date"], subject: headers["subject"], body: renderedBody });
      return Object.freeze({ id: message["id"], from: headers["from"], to, date: headers["date"], subject: headers["subject"], body: renderedBody });
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

// ../provider-gmail/src/index.ts
var gmailProvider = Object.freeze({
  services: [gmailService]
});

// ../provider-google-docs/src/google-docs.ts
var import_node_zlib = require("node:zlib");
async function cookieHeader2(runtime2) {
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
  const response = await runtime2.http.request(url, { headers: { Cookie: await cookieHeader2(runtime2) } });
  if (response.status === 401 || response.status === 403) throw cookieAuthenticationError();
  if (!response.ok) throw new Error(`Google ${label} failed: HTTP ${response.status}`);
  const disposition = response.headers.get("content-disposition");
  if (disposition === null) throw cookieAuthenticationError();
  return Object.freeze({ title: filenameTitle(disposition, label), text: await response.text() });
}
async function googleExportBytes(runtime2, url, label) {
  const response = await runtime2.http.request(url, { headers: { Cookie: await cookieHeader2(runtime2) } });
  if (response.status === 401 || response.status === 403) throw cookieAuthenticationError();
  if (!response.ok) throw new Error(`Google ${label} failed: HTTP ${response.status}`);
  const disposition = response.headers.get("content-disposition");
  if (disposition === null) throw cookieAuthenticationError();
  return Object.freeze({ title: filenameTitle(disposition, label), bytes: new Uint8Array(await response.arrayBuffer()) });
}
async function googleText(runtime2, url, label) {
  const response = await runtime2.http.request(url, { headers: { Cookie: await cookieHeader2(runtime2) } });
  if (response.status === 401 || response.status === 403) throw cookieAuthenticationError();
  if (!response.ok) throw new Error(`Google ${label} failed: HTTP ${response.status}`);
  return response.text();
}
function saveResult(text3, label) {
  if (/^\s*</.test(text3)) throw cookieAuthenticationError();
  if (!text3.startsWith(")]}'\n")) throw new Error(`Google ${label} save failed: unexpected response`);
  return JSON.parse(text3.slice(")]}'\n".length));
}
function objectValue(value) {
  const object5 = value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Google sync base must be an object");
  return object5;
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
  const text3 = escaped2.replace(/^[ \t]+|[ \t]+$/g, (match) => match.replace(/ /g, "&#32;").replace(/\t/g, "&#9;"));
  return text3 === "" ? " " : text3;
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
function csvCell(value) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
function rowsCsv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}
`;
}
function sheetMarkdown(rows) {
  if (rows.length === 0) return "";
  const columnCount = Math.max(...rows.map((row) => row.length));
  if (rows[0].length === columnCount && rows[0].every((cell) => cell !== "")) return rowsMarkdown(rows);
  return `\`\`\`csv
${rowsCsv(rows)}\`\`\`
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
function parseSheetMarkdown(markdown) {
  if (markdown.trim() === "") return [];
  const value = markdown.trimEnd();
  if (!value.startsWith("```csv\n")) return parseMarkdownTable(markdown);
  if (!value.endsWith("\n```")) throw new Error("Google Sheets sync requires fenced CSV to end with ```");
  return parseCsv(value.slice("```csv\n".length, -"\n```".length));
}
function rowsEqual(left, right) {
  return left.length === right.length && left.every((row, rowIndex) => row.length === right[rowIndex].length && row.every((cell, columnIndex) => cell === right[rowIndex][columnIndex]));
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
      const text3 = decodeXml(xml.slice(index, end === -1 ? xml.length : end));
      if (text3 !== "") stack[stack.length - 1].children.push(text3);
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
  for (const segment2 of target.split("/")) {
    if (segment2 === "..") parts.pop();
    else if (segment2 !== ".") parts.push(segment2);
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
  const text3 = xmlDescendants(run, "a:t").map(xmlText).join("");
  const runProperties = xmlChildren(run, "a:rPr")[0];
  if (runProperties === void 0) return text3;
  const hyperlink = xmlDescendants(runProperties, "a:hlinkClick")[0];
  let markdown = text3;
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
  const response = await runtime2.http.request(`https://docs.google.com/spreadsheets/u/0/d/${encodeURIComponent(documentId)}/save?id=${encodeURIComponent(documentId)}&token=${encodeURIComponent(session.token)}`, { method: "POST", headers: { Cookie: await cookieHeader2(runtime2), "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: body2.toString() });
  if (response.status === 401 || response.status === 403) throw cookieAuthenticationError();
  if (!response.ok) throw new Error(`Google Sheets save failed: HTTP ${response.status}`);
  const text3 = await response.text();
  const result = saveResult(text3, "Sheets");
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
      if (localEnd2 !== -1 && localEnd2 <= start + 2e3) return Object.freeze({ base: base.slice(start, baseEnd2), local: local.slice(start, localEnd2), before: base.slice(0, start), localBefore: "", after: base.slice(baseEnd2), localAfter: local.slice(localEnd2) });
    }
  }
  let baseEnd = base.length;
  let localEnd = local.length;
  while (baseEnd > start && localEnd > start && base[baseEnd - 1] === local[localEnd - 1]) {
    baseEnd -= 1;
    localEnd -= 1;
  }
  return Object.freeze({ base: base.slice(start, baseEnd), local: local.slice(start, localEnd), before: base.slice(0, start), localBefore: "", after: base.slice(baseEnd), localAfter: local.slice(localEnd) });
}
function textEdits(base, local) {
  const edits = [];
  let basePrefix = "";
  let localPrefix = "";
  let baseRest = base;
  let localRest = local;
  while (baseRest !== localRest) {
    const edit = textEdit(baseRest, localRest);
    const before = `${basePrefix}${edit.before}`;
    const localBefore = `${localPrefix}${edit.before}`;
    edits.push(Object.freeze({ ...edit, before, localBefore }));
    basePrefix = base.slice(0, base.length - edit.after.length);
    localPrefix = local.slice(0, local.length - edit.localAfter.length);
    baseRest = edit.after;
    localRest = edit.localAfter;
  }
  return edits;
}
function inlineMarkdownSpans(value) {
  const spans = [];
  for (const pattern of [/\[[^\]\n]+\]\([^)]+\)/g, /!\[[^\]\n]*\]\([^)]+\)/g, /`[^`\n]+`/g, /~~[^~\n]+~~/g, /\*\*[^*\n]+\*\*/g, /\*[^*\n]+\*/g, /(^|[^\w])__[^_\n]+__(?=[^\w]|$)/g, /(^|[^\w])_[^_\n]+_(?=[^\w]|$)/g, /<((?:https?|mailto):[^>\s]+)>/g, /<\/?(?:u|sup|sub|mark|span)(?:\s+[^>]*)?>/gi]) {
    let match = pattern.exec(value);
    while (match !== null) {
      spans.push(Object.freeze({ start: match.index, end: match.index + match[0].length }));
      match = pattern.exec(value);
    }
  }
  return spans;
}
function editTouchesMarkdownSpan(before, value, edited) {
  const start = before.length;
  const end = start + edited.length;
  return inlineMarkdownSpans(value).some((span) => start === end ? start > span.start && start < span.end : start < span.end && end > span.start);
}
function context(value, side, length) {
  return side === "before" ? value.slice(Math.max(0, value.length - length)) : value.slice(0, length);
}
function followingWhitespaceEnd(text3, index) {
  let end = index;
  while (end < text3.length && /\s/.test(text3[end])) end += 1;
  return end;
}
function docTextRange(text3, edit) {
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
        const found = text3.indexOf(anchor, index);
        if (found === -1) break;
        candidates.push(found + anchor.length);
        index = found + 1;
      }
      if (trimmed !== anchor) {
        index = 0;
        for (; ; ) {
          const found = text3.indexOf(trimmed, index);
          if (found === -1) break;
          candidates.push(followingWhitespaceEnd(text3, found + trimmed.length));
          index = found + 1;
        }
      }
    }
    if (afterText === "") {
      candidates.push(text3.length);
    } else {
      const anchor = context(afterText, "after", Math.min(80, afterText.length));
      let index = 0;
      for (; ; ) {
        const found = text3.indexOf(anchor, index);
        if (found === -1) break;
        candidates.push(found);
        index = found + 1;
      }
    }
  } else {
    let index = 0;
    for (; ; ) {
      const found = text3.indexOf(base, index);
      if (found === -1) break;
      candidates.push(found);
      index = found + 1;
    }
  }
  const uniqueCandidates = [...new Set(candidates)];
  for (const length of [80, 40, 20, 10, 0]) {
    const before = context(beforeText, "before", length);
    const after = context(afterText, "after", length);
    const matched = uniqueCandidates.filter((index) => text3.slice(Math.max(0, index - before.length), index) === before && text3.slice(index + base.length, index + base.length + after.length) === after);
    if (matched.length === 1) return Object.freeze({ start: matched[0], end: matched[0] + base.length });
  }
  throw new Error("Google Docs local edit cannot be mapped to the live document text");
}
async function uploadDocText(runtime2, documentId, key2, tab, baseMarkdown, localMarkdown) {
  const edits = textEdits(baseMarkdown, localMarkdown);
  if (edits.some((edit) => editTouchesMarkdownSpan(edit.before, baseMarkdown, edit.base) || editTouchesMarkdownSpan(edit.localBefore, localMarkdown, edit.local))) throw new Error("Google Docs sync cannot preserve formatting in edited text");
  const editUrl = docEditUrl(documentId, key2, tab);
  const session = docSession(await googleText(runtime2, editUrl, "Docs editor"));
  const ranges = edits.map((edit) => ({ edit, range: docTextRange(session.text, edit) })).sort((left, right) => right.range.start - left.range.start);
  const sid = runtime2.clock.now().getTime().toString(16).padStart(16, "0").slice(-16);
  const commands2 = ranges.flatMap(({ edit, range }) => [
    ...range.start === range.end ? [] : [{ ty: "ds", si: range.start + 1, ei: range.end }],
    ...edit.local === "" ? [] : [{ ty: "is", ibi: range.start + 1, s: markdownText(edit.local) }]
  ]);
  const params = new URLSearchParams({ id: documentId, sid, vc: "1", c: "1", w: "1", flr: "0", smv: "2147483647", smb: "[2147483647, AAE=]", token: session.token, ouid: session.ouid, includes_info_params: "true", cros_files: "false", nded: "false", tab });
  const body2 = new URLSearchParams({ rev: String(session.revision), bundles: JSON.stringify([{ commands: commands2, sid, reqId: 0 }]) });
  const response = await runtime2.http.request(`https://docs.google.com/document/d/${encodeURIComponent(documentId)}/save?${params}`, { method: "POST", headers: { Cookie: await cookieHeader2(runtime2), "content-type": "application/x-www-form-urlencoded;charset=UTF-8", origin: "https://docs.google.com", referer: editUrl }, body: body2.toString() });
  if (response.status === 401 || response.status === 403) throw cookieAuthenticationError();
  if (!response.ok) throw new Error(`Google Docs save failed: HTTP ${response.status}`);
  const text3 = await response.text();
  const result = saveResult(text3, "Docs");
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
  const markdown = rows === null ? exported.text : sheetMarkdown(rows);
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
  if (source["sheet_gid"] !== void 0) {
    const baseObject = objectValue(base);
    if (baseObject["rows"] === void 0) {
      if (markdown === baseMarkdown || markdown === remote.markdown) return remote;
      if (remote.markdown !== baseMarkdown) throw new Error(`${label} changed remotely and locally. Resolve the conflict in ${label} or the local Markdown file before syncing again.`);
    }
    const baseRows = stringRows(baseObject["rows"]);
    const remoteRows = stringRows(objectValue(remote.data)["rows"]);
    const localRows = parseSheetMarkdown(markdown);
    if (rowsEqual(localRows, baseRows) || rowsEqual(localRows, remoteRows)) return remote;
    if (!rowsEqual(remoteRows, baseRows)) throw new Error(`${label} changed remotely and locally. Resolve the conflict in ${label} or the local Markdown file before syncing again.`);
    const cells = changedCells(baseRows, localRows);
    if (cells.length === 0) return remote;
    const formula = cells.find((cell) => formulaLikeCell(cell.value));
    if (formula !== void 0) throw new Error(`Google Sheets sync cannot upload formula-like cell text at row ${formula.row + 1}, column ${formula.column + 1}
Prefix it with an apostrophe or rewrite it as plain text before syncing.`);
    await uploadSheetRows(runtime2, source["document_id"] ?? source.identifier, source["sheet_gid"], resourceKey(source), cells);
    const uploaded = await fetchGoogleDocument(runtime2, source);
    if (!rowsEqual(stringRows(objectValue(uploaded.data)["rows"]), localRows)) throw new Error("Google Sheets save verification failed");
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

// ../provider-google-docs/src/google-forms.ts
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
  const text3 = await response.text();
  const body2 = text3 === "" ? {} : JSON.parse(text3);
  if (response.status === 401) throw formsAuthError();
  if (!response.ok) {
    const disabled = apiDisabledError(body2);
    if (disabled !== null) throw disabled;
    const error = body2["error"];
    const message = typeof error?.["message"] === "string" ? error["message"] : text3;
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
    const object5 = option;
    return object5["value"];
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
  return Object.entries(answers).flatMap(([questionId, answer]) => answerTexts(answer).map((text3) => ({ questionId, text: text3 })));
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
  const items2 = form["items"];
  if (items2 === void 0 || items2.length === 0) lines.push("No items.");
  else for (const item of items2) lines.push(...questionMarkdown(item));
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

// ../provider-google-docs/src/index.ts
var googleDocsProvider = Object.freeze({
  services: [googleFormsService, googleDocsService]
});

// ../provider-notion/src/notion-sync.ts
var import_node_crypto4 = require("node:crypto");
function object4(value) {
  return value;
}
function array(value) {
  return value;
}
function text2(value) {
  return value;
}
function notionAuthError() {
  return new Error("notion cookie authentication is missing or expired. Run `wire notion login` once; other commands reuse saved cookies.");
}
function richTextText(value) {
  return value.map((segment2) => segment2[0]).join("");
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
  return `sha256:${(0, import_node_crypto4.createHash)("sha256").update(compact(value)).digest("hex")}`;
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
function renderMarks(marks) {
  const priority = /* @__PURE__ */ new Map([["c", 0], ["_", 1], ["h", 2], ["e", 3], ["p", 4], ["u", 5], ["d", 6], ["s", 7], ["i", 8], ["b", 9], ["a", 10]]);
  return [...marks].sort((left, right) => priority.get(array(left)[0]) - priority.get(array(right)[0]) || compact(left).localeCompare(compact(right)));
}
function normalizeRichText(value) {
  const output = [];
  for (const raw of value) {
    const content = text2(raw[0]).replace(/\r\n?/g, "\n");
    if (content === "") continue;
    const marks = raw.length > 1 ? normalizeMarks(raw[1]) : [];
    if (marks.length > 0 && content.match(/^ +/) !== null) output.push([content.match(/^ +/)[0]]);
    const trimmedContent = marks.length === 0 ? content : content.replace(/^ +| +$/g, "");
    const segment2 = marks.length === 0 ? [trimmedContent] : [trimmedContent, marks];
    if (trimmedContent === "") continue;
    const previous = output[output.length - 1];
    if (previous !== void 0 && compact(previous[1] ?? []) === compact(segment2[1] ?? [])) previous[0] = `${previous[0]}${trimmedContent}`;
    else output.push(segment2);
    if (marks.length > 0 && content.match(/ +$/) !== null) output.push([content.match(/ +$/)[0]]);
  }
  while (output.length > 0 && text2(output[0][0]).trim() === "") output.shift();
  while (output.length > 0 && text2(output[output.length - 1][0]).trim() === "") output.pop();
  if (output.length > 0) output[0][0] = text2(output[0][0]).replace(/^ +/, "");
  if (output.length > 0) output[output.length - 1][0] = text2(output[output.length - 1][0]).replace(/ +$/, "");
  return output;
}
function parseInline(value) {
  const segments = [];
  let rest = value;
  const push2 = (content, marks = []) => {
    if (content !== "") segments.push(marks.length === 0 ? [content] : [content, marks]);
  };
  const pushMarked = (content, mark) => {
    for (const segment2 of parseInline(content)) {
      const marks = normalizeMarks([...segment2[1] ?? [], mark]);
      push2(segment2[0], marks);
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
    if (rest.startsWith("***")) {
      const end = closingDelimiter(rest, 3, "***");
      if (end !== -1) {
        for (const segment2 of parseInline(rest.slice(3, end))) {
          const marks = normalizeMarks([...segment2[1] ?? [], ["b"], ["i"]]);
          push2(segment2[0], marks);
        }
        rest = rest.slice(end + 3);
        continue;
      }
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
  for (const raw of renderMarks(marks)) {
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
  return normalizeRichText(value).map((segment2) => renderSegment(text2(segment2[0]), segment2[1] ?? [])).join("");
}
function renderUserMentions(markdownText3, mentions) {
  let output = markdownText3;
  for (const [userId, handle] of Object.entries(mentions)) {
    output = output.replace(new RegExp(`<span data-notion-mention="u" data-notion-id="${escapeRegExp(escapeHtml(userId))}">(.*?)</span>`, "g"), (_match, content) => content.replaceAll("\u2023", `@${handle}`));
  }
  return output;
}
function hydrateUserMentions(markdownText3, mentions) {
  let output = markdownText3;
  for (const [userId, handle] of Object.entries(mentions)) {
    output = output.replace(new RegExp(`(?<![A-Za-z0-9_])@${escapeRegExp(handle)}(?![A-Za-z0-9_])`, "g"), `<span data-notion-mention="u" data-notion-id="${escapeHtml(userId)}">\u2023</span>`);
  }
  return output;
}
function baseUserMentions(base) {
  return base["user_mentions"];
}
function notionData(pageId, markdown, tree, mentions, emailMentions = {}) {
  return { page_id: pageId, markdown, blocks: sidecarBlocksFromNotionTree(tree), ...mentions === void 0 ? {} : { user_mentions: mentions }, ...Object.keys(emailMentions).length === 0 ? {} : { email_mentions: emailMentions } };
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
  const cells = object4(block.properties["cells"]);
  if (columnOrder === void 0) return cells;
  const localColumns = Object.keys(cells);
  return Object.fromEntries(columnOrder.map((column, index) => [column, cells[localColumns[index]]]));
}
function tableColumnOrder(remote, local) {
  const localColumns = local.properties["column_ids"];
  if (remote === void 0) return localColumns;
  const remoteColumns = object4(remote["format"])["table_block_column_order"];
  const used = /* @__PURE__ */ new Set();
  return localColumns.map((column, index) => {
    const value = index < remoteColumns.length ? remoteColumns[index] : used.has(column) ? `column_${index}_${(0, import_node_crypto4.randomUUID)().replaceAll("-", "")}` : column;
    used.add(value);
    return value;
  });
}
function parserBlockToNotionBlock(block, id, parentId, parentTable, spaceId, userId, currentTime, columnOrder) {
  const base = { id, type: block.type, space_id: spaceId, parent_id: parentId, parent_table: parentTable, alive: true, created_time: currentTime, created_by_table: "notion_user", created_by_id: userId, last_edited_time: currentTime, last_edited_by_table: "notion_user", last_edited_by_id: userId };
  if (block.properties["notion_opaque"] !== void 0) return { ...object4(block.properties["notion_opaque"]), ...base };
  if (block.type === "divider") return base;
  if (block.type === "toggle") return { ...base, type: "text", properties: { title: block.rich_text }, format: { toggleable: true } };
  if (block.type === "code") return { ...base, properties: { title: [[block.content]], language: [[block.properties["language"]]] } };
  if (block.type === "to_do") return { ...base, properties: { title: block.rich_text, checked: [[block.properties["checked"] === true ? "Yes" : "No"]] } };
  if (block.type === "image") return { ...base, properties: { source: [[block.properties["source"]]], alt_text: [[block.properties["alt_text"]]], ...block.properties["caption"] === void 0 ? {} : { caption: block.properties["caption"] } } };
  if (block.type === "table") return { ...base, properties: {}, format: { table_block_column_order: columnOrder ?? block.properties["column_ids"], table_block_column_header: block.properties["has_header"], table_block_row_header: block.properties["has_row_header"] } };
  if (block.type === "table_row") return { ...base, properties: tableRowCells(block, columnOrder) };
  if (block.type === "column_list" || block.type === "transclusion_container") return { ...base, properties: {} };
  if (block.type === "column") return { ...base, properties: {}, ...block.properties["format"] === void 0 ? {} : { format: block.properties["format"] } };
  if (block.type === "callout") return { ...base, properties: { title: block.rich_text }, ...block.properties["format"] === void 0 ? {} : { format: block.properties["format"] } };
  if (["header", "sub_header", "sub_sub_header"].includes(block.type)) return { ...base, properties: { title: block.rich_text }, ...block.properties["format"] === void 0 ? {} : { format: block.properties["format"] } };
  return { ...base, properties: { title: block.rich_text } };
}
function buildNotionCreateOperations(blocks, pageId, spaceId, userId, currentTime, createId = () => (0, import_node_crypto4.randomUUID)(), initialTableColumnOrder) {
  const operations = [];
  const topLevelIds = [];
  const lastAtIndent = /* @__PURE__ */ new Map();
  const lastChildByParent = /* @__PURE__ */ new Map();
  let lastTableId = null;
  let tableColumnOrder2 = initialTableColumnOrder;
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
    operations.push({ pointer: pointer(blockId, spaceId), path: [], command: "set", args: parserBlockToNotionBlock(block, blockId, parentId, parentTable, spaceId, userId, currentTime, block.type === "table_row" ? tableColumnOrder2 : void 0) });
    const after = lastChildByParent.get(parentId);
    operations.push({ pointer: pointer(parentId, spaceId), path: ["content"], command: after === void 0 ? "listBefore" : "listAfter", args: after === void 0 ? { id: blockId } : { id: blockId, after } });
    lastChildByParent.set(parentId, blockId);
    if (["bulleted_list", "numbered_list", "to_do", "quote", "callout", "toggle", "header", "sub_header", "sub_sub_header", "table", "page", "column_list", "column", "transclusion_container"].includes(block.type)) lastAtIndent.set(block.indent, blockId);
    if (block.type === "table") {
      lastTableId = blockId;
      tableColumnOrder2 = block.properties["column_ids"];
    }
  }
  if (operations.length > 0) operations.push({ pointer: pointer(pageId, spaceId), path: ["last_edited_time"], command: "set", args: currentTime });
  return { operations, topLevelIds };
}
function canonicalBlock(value, columnOrder) {
  const type = value["type"];
  if (type === "text" && object4(value["format"] ?? {})["toggleable"] === true) return { type: "toggle", title: normalizeRichText(object4(value["properties"])["title"]) };
  if (type === "code") return { type, title: normalizeRichText(object4(value["properties"])["title"]), language: object4(value["properties"])["language"] };
  if (type === "to_do") return { type, title: normalizeRichText(object4(value["properties"])["title"]), checked: object4(value["properties"])["checked"] ?? [["No"]] };
  if (type === "table") return { type, column_count: object4(value["format"])["table_block_column_order"].length };
  if (type === "table_row") return { type, cells: columnOrder.map((column) => normalizeRichText(object4(value["properties"])[column] ?? [])) };
  if (type === "image") return { type, source: object4(value["properties"])["source"], alt_text: object4(value["properties"])["alt_text"], caption: object4(value["properties"])["caption"] ?? null };
  if (["divider", "column_list", "transclusion_container"].includes(type)) return { type };
  if (type === "column") return { type, column_ratio: object4(value["format"] ?? {})["column_ratio"] ?? null };
  if (["header", "sub_header", "sub_sub_header"].includes(type)) return { type, title: normalizeRichText(object4(value["properties"] ?? { title: [] })["title"] ?? []), toggleable: object4(value["format"] ?? {})["toggleable"] === true };
  return { type, title: normalizeRichText(object4(value["properties"] ?? { title: [] })["title"] ?? []) };
}
function canonicalParserBlock(block, columnOrder) {
  if (block.properties["notion_opaque"] !== void 0) return canonicalBlock(object4(block.properties["notion_opaque"]), columnOrder);
  if (block.type === "header" || block.type === "sub_header" || block.type === "sub_sub_header") return { type: block.type, title: normalizeRichText(block.rich_text), toggleable: object4(block.properties["format"] ?? {})["toggleable"] === true };
  if (block.type === "text" || block.type === "bulleted_list" || block.type === "numbered_list" || block.type === "quote" || block.type === "callout" || block.type === "toggle") return { type: block.type, title: normalizeRichText(block.rich_text) };
  if (block.type === "code") return { type: "code", title: normalizeRichText([[block.content]]), language: [[block.properties["language"]]] };
  if (block.type === "to_do") return { type: "to_do", title: normalizeRichText(block.rich_text), checked: [[block.properties["checked"] === true ? "Yes" : "No"]] };
  if (block.type === "table") return { type: "table", column_count: block.properties["column_ids"].length };
  if (block.type === "table_row") {
    const cells = tableRowCells(block, columnOrder);
    return { type: "table_row", cells: columnOrder.map((column) => normalizeRichText(cells[column] ?? [])) };
  }
  if (block.type === "image") return { type: "image", source: [[block.properties["source"]]], alt_text: [[block.properties["alt_text"]]], caption: block.properties["caption"] ?? null };
  if (block.type === "page" || block.type === "equation") return { type: block.type, title: normalizeRichText(block.rich_text) };
  if (block.type === "column") return { type: "column", column_ratio: object4(block.properties["format"] ?? {})["column_ratio"] ?? null };
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
    const nextColumnOrder = type === "table" ? object4(node.block["format"])["table_block_column_order"] : columnOrder;
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
  const id = remoteNode?.id ?? formatBlockId((0, import_node_crypto4.randomUUID)().replaceAll("-", ""));
  const block = parserBlockToNotionBlock(node.block, id, parentId, "block", remote.spaceId, remote.userId, currentTime, node.block.type === "table" ? tableColumnOrder(remoteNode?.block, node.block) : node.block.type === "table_row" ? columnOrder : void 0);
  const nextColumnOrder = block["type"] === "table" ? object4(block["format"])["table_block_column_order"] : columnOrder;
  return { id, block, children: node.children.map((child, index) => outputNode(child, remoteNode?.children[index], id, remote, currentTime, nextColumnOrder)) };
}
function emitUpdates(remote, local, blockId, spaceId, columnOrder) {
  const operations = [];
  const remoteType = remote["type"] === "text" && object4(remote["format"] ?? {})["toggleable"] === true ? "toggle" : remote["type"];
  const localType = local.type === "toggle" ? "text" : local.type;
  const typeChanged = remoteType !== local.type;
  if (typeChanged) operations.push({ pointer: pointer(blockId, spaceId), path: ["type"], command: "set", args: localType });
  const effectiveColumnOrder = local.type === "table" ? tableColumnOrder(remote, local) : columnOrder;
  const args = parserBlockToNotionBlock(local, blockId, remote["parent_id"] ?? "", "block", spaceId, "", 0, local.type === "table" || local.type === "table_row" ? effectiveColumnOrder : void 0);
  const remoteProperties = object4(remote["properties"] ?? {});
  const nextProperties = object4(args["properties"] ?? {});
  if (typeChanged) {
    if (compact(remoteProperties) !== compact(nextProperties)) operations.push({ pointer: pointer(blockId, spaceId), path: ["properties"], command: "updateBlockPropertyValue", args: { primitiveOp: { command: "set", args: nextProperties } } });
  } else {
    for (const key2 of Object.keys(nextProperties)) if (compact(remoteProperties[key2] ?? null) !== compact(nextProperties[key2])) operations.push({ pointer: pointer(blockId, spaceId), path: ["properties", key2], command: "updateBlockPropertyValue", args: { primitiveOp: { command: "set", args: nextProperties[key2] } } });
  }
  const nextFormat = object4(args["format"] ?? {});
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
    if (operation.pointer["id"] === parentId && operation.pointer["spaceId"] === spaceId && operation.path.length === 1 && operation.path[0] === "content") return { ...operation, command: previousId === void 0 ? "listBefore" : "listAfter", args: previousId === void 0 ? { id: object4(operation.args)["id"] } : { id: object4(operation.args)["id"], after: previousId } };
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
function diffNotionChildLists(remoteParent, localChildren, ambient, summary, columnOrder, localParent) {
  const operations = [];
  const remoteChildren = [...remoteParent.children];
  const nextColumnOrder = remoteParent.block["type"] === "table" ? tableColumnOrder(remoteParent.block, localParent) : columnOrder;
  const remoteHash = (index) => notionBlockContentHash(remoteChildren[index].block, nextColumnOrder);
  const localHash = (index) => notionBlockContentHash(localChildren[index].block, nextColumnOrder);
  let remoteIndex = 0;
  let localIndex = 0;
  let previousId;
  while (remoteIndex < remoteChildren.length && localIndex < localChildren.length) {
    const remoteNode = remoteChildren[remoteIndex];
    const localNode = localChildren[localIndex];
    if (remoteHash(remoteIndex) === localHash(localIndex)) {
      operations.push(...diffNotionChildLists(remoteNode, localNode.children, ambient, summary, nextColumnOrder, localNode.block));
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
    operations.push(...diffNotionChildLists(remoteNode, localNode.children, ambient, summary, nextColumnOrder, localNode.block));
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
  const type = tree.block["type"] === "text" && object4(tree.block["format"] ?? {})["toggleable"] === true ? "toggle" : tree.block["type"];
  const properties = object4(tree.block["properties"] ?? {});
  const title2 = properties["title"] === void 0 ? "" : renderRichText(properties["title"]);
  const format = object4(tree.block["format"] ?? {});
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
    const columns = object4(tree.block["format"])["table_block_column_order"];
    const rows = tree.children.map((child) => columns.map((column) => renderRichText(object4(child.block["properties"])[column]).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/<br>/g, "\\<br>").replace(/\n/g, "<br>")));
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
function renderNotionTreeToMarkdown(tree, mentions, emailMentions = {}) {
  const title2 = renderRichText(object4(tree.block["properties"])["title"]);
  const compactTypes = /* @__PURE__ */ new Set(["bulleted_list", "numbered_list", "to_do"]);
  const body2 = tree.children.flatMap((child, index) => [
    ...index === 0 || tree.children[index - 1].block["type"] === child.block["type"] && compactTypes.has(child.block["type"]) ? [] : [""],
    ...renderNode(child, 0)
  ]);
  let markdown = [`# ${title2}`, ...body2.length === 0 ? [] : ["", ...body2]].join("\n").trim();
  for (const [id, link] of Object.entries(emailMentions)) markdown = markdown.replace(new RegExp(`<span data-notion-mention="u" data-notion-id="${escapeRegExp(escapeHtml(id))}">.*?</span>`, "g"), () => link);
  return mentions === void 0 ? markdown : renderUserMentions(markdown, mentions);
}
async function notionPost(runtime2, path, cookie, body2, headers) {
  const response = await runtime2.http.request(`https://www.notion.so/api/v3/${path}`, { method: "POST", headers: { cookie, "content-type": "application/json", "notion-client-version": "23.13.0.4595", "user-agent": "Mozilla/5.0", ...headers }, body: JSON.stringify(body2) });
  if (!response.ok) throw new Error(`POST ${path} failed: ${response.status} ${await response.text()}`);
  return await response.json();
}
async function resolveNotionEmailMentions(runtime2, blocks, cookie, spaceId, headers, mentions) {
  const segments = [];
  const visit = (value) => {
    if (Array.isArray(value)) {
      if (typeof value[0] === "string" && value[0].startsWith("@") && Array.isArray(value[1]) && value[1].some((mark) => Array.isArray(mark) && mark[0] === "a" && typeof mark[1] === "string" && mark[1].startsWith("mailto:"))) segments.push(value);
      else for (const child of value) visit(child);
    } else if (value !== null && typeof value === "object") for (const child of Object.values(value)) visit(child);
  };
  for (const block of blocks) {
    if (block.type === "code" || block.properties["notion_opaque"] !== void 0) continue;
    visit(block.rich_text);
    visit(block.properties);
  }
  if (segments.length === 0) return;
  const response = await notionPost(runtime2, "getVisibleUsers", cookie, { spaceId }, headers);
  const users = response["users"];
  for (const segment2 of segments) {
    const marks = segment2[1];
    const link = marks.find((mark) => mark[0] === "a" && mark[1].startsWith("mailto:"));
    const email = decodeURIComponent(link[1].slice(7));
    if (!/^[^@\s?]+@[^@\s?]+$/.test(email)) throw new Error(`Invalid mention email: ${email}`);
    const matches = users.filter((user) => user["aliases"]?.some((alias) => alias.toLowerCase() === email.toLowerCase()));
    if (matches.length !== 1) throw new Error(`Expected one Notion user for ${email}, found ${matches.length}`);
    const id = matches[0]["userId"];
    mentions[id] = `[${escapeInlineMarkdown(segment2[0])}](mailto:${email})`;
    segment2[0] = "\u2023";
    link[0] = "u";
    link[1] = id;
  }
}
async function fetchTree(runtime2, url, source) {
  const cookies = await runtime2.cookies.loadSaved("notion");
  if (cookies === null) throw notionAuthError();
  const cookie = cookies.map((value) => `${value.name}=${value.value}`).join("; ");
  const userId = cookies.find((value) => value.name === "notion_user_id").value;
  const csrf = cookies.find((value) => value.name === "csrf")?.value;
  await runtime2.http.request(url, { headers: { cookie } });
  const spaces = await notionPost(runtime2, "getSpaces", cookie, {}, {});
  const spaceView = object4(object4(spaces[userId])["space_view"]);
  const initialSpaceId = object4(spaceView[Object.keys(spaceView)[0]])["spaceId"];
  const pageId = formatBlockId(source.identifier);
  let headers = { "x-notion-active-user-header": userId, "x-notion-space-id": initialSpaceId, referer: url, ...csrf === void 0 ? {} : { "x-csrf-token": csrf } };
  const pageData = await notionPost(runtime2, "getRecordValues", cookie, { requests: [{ table: "block", id: pageId }] }, headers);
  const page = object4(pageData["results"][0]["value"]);
  const blocks = /* @__PURE__ */ new Map([[pageId, page]]);
  const spaceId = blocks.get(pageId)["space_id"];
  headers = { ...headers, "x-notion-space-id": spaceId };
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
    const data = await notionPost(runtime2, "getRecordValues", cookie, { requests: missingIds.map((idValue) => ({ table: "block", id: idValue })) }, headers);
    for (const [index, result] of data["results"].entries()) {
      const block = object4(result["value"]);
      blocks.set(block["id"] ?? missingIds[index], block);
    }
  }
  const build = (idValue) => {
    const block = blocks.get(idValue);
    if (idValue !== pageId && block["type"] === "page") return { id: idValue, block, children: [] };
    return { id: idValue, block, children: (block["content"] ?? []).filter((child) => blocks.get(child)?.["alive"] !== false).map(build) };
  };
  return { tree: build(pageId), userId, spaceId, cookie, headers };
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
  const spaceView = object4(object4(spaces[userId])["space_view"]);
  if (Object.keys(spaceView).length !== 1) throw new Error("Notion upload requires an explicit target workspace.");
  const spaceId = object4(spaceView[Object.keys(spaceView)[0]])["spaceId"];
  const pageId = (0, import_node_crypto4.randomUUID)();
  const compactPageId = pageId.replaceAll("-", "");
  const currentTime = runtime2.clock.now().getTime();
  const headers = { "x-notion-active-user-header": userId, "x-notion-space-id": spaceId, referer: `https://www.notion.so/${compactPageId}`, ...csrf === void 0 ? {} : { "x-csrf-token": csrf } };
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
  const emailMentions = {};
  await resolveNotionEmailMentions(runtime2, localBlocks, cookie, spaceId, headers, emailMentions);
  const operations = [pageOperation, ...buildNotionCreateOperations(localBlocks, pageId, spaceId, userId, currentTime).operations];
  await notionPost(runtime2, "saveTransactionsFanout", cookie, { requestId: (0, import_node_crypto4.randomUUID)(), transactions: [{ id: (0, import_node_crypto4.randomUUID)(), spaceId, operations }] }, headers);
  const pageTree = {
    id: pageId,
    block: pageOperation.args,
    children: localTree(localBlocks).map((node) => outputNode(node, void 0, pageId, { spaceId, userId }, currentTime))
  };
  const output = renderNotionTreeToMarkdown(pageTree, void 0, emailMentions);
  return { url: `https://www.notion.so/${compactPageId}`, title: split.title, markdown: output, data: notionData(compactPageId, output, pageTree, void 0, emailMentions) };
}
function splitTitle(markdown) {
  const lines = markdown.replace(/^\ufeff/, "").split("\n");
  const first = lines[0].trimStart();
  if (first === "#") return { title: "", body: lines.slice(1).join("\n") };
  if (/^#{1,6}\s+\S/.test(first)) return { title: first.replace(/^#+\s+/, "").trim(), body: lines.slice(1).join("\n") };
  return { title: "", body: markdown };
}
async function synchronizeNotionDocument(runtime2, url, source, base, markdown, _markdownPath) {
  const remote = await fetchTree(runtime2, url, source);
  const baseObject = object4(base);
  const mentions = baseUserMentions(baseObject);
  const emailMentions = { ...baseObject["email_mentions"] };
  const currentMarkdown = renderNotionTreeToMarkdown(remote.tree, mentions, emailMentions);
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
    if (localTitleChanged && remoteTitleChanged && split.title !== "" && split.title !== currentSplit.title || localBodyChanged && remoteBodyChanged && split.body !== currentSplit.body) throw new Error("Markdown and Notion changed since last sync");
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
      if (!localTitleChanged && remoteTitleChanged) return { title: currentSplit.title, markdown: currentMarkdown, data: notionData(remote.tree.id, currentMarkdown, remote.tree, mentions, emailMentions) };
      if (localTitleChanged && remoteTitleChanged && split.title !== currentSplit.title) throw new Error("Markdown and Notion changed since last sync");
      if (localTitleChanged && remoteTitleChanged) return { title: currentSplit.title, markdown: currentMarkdown, data: notionData(remote.tree.id, currentMarkdown, remote.tree, mentions, emailMentions) };
    }
    const titleRich2 = split.title === "" ? object4(remote.tree.block["properties"])["title"] : titleRichText(split.title);
    const titleChanged = split.title !== "" && compact(object4(remote.tree.block["properties"])["title"]) !== compact(titleRich2);
    if (titleChanged) await notionPost(runtime2, "saveTransactionsFanout", remote.cookie, { requestId: (0, import_node_crypto4.randomUUID)(), transactions: [{ id: (0, import_node_crypto4.randomUUID)(), spaceId: remote.spaceId, operations: [{ pointer: pointer(remote.tree.id, remote.spaceId), path: ["properties", "title"], command: "updateBlockPropertyValue", args: { primitiveOp: { command: "set", args: titleRich2 } } }, { pointer: pointer(remote.tree.id, remote.spaceId), path: ["last_edited_time"], command: "set", args: runtime2.clock.now().getTime() }] }] }, remote.headers);
    const outputTree2 = { ...remote.tree, block: { ...remote.tree.block, properties: { ...object4(remote.tree.block["properties"]), title: titleRich2 } } };
    const output2 = renderNotionTreeToMarkdown(outputTree2, mentions, emailMentions);
    return { title: output2.split("\n")[0].replace(/^# */, ""), markdown: output2, data: notionData(remote.tree.id, output2, outputTree2, mentions, emailMentions) };
  }
  if (baseMarkdown !== void 0) {
    const localChanged = baseMarkdown !== targetMarkdown;
    const remoteChanged = baseMarkdown !== currentMarkdown;
    if (!localChanged && remoteChanged) return { title: currentMarkdown.split("\n")[0].replace(/^# */, ""), markdown: currentMarkdown, data: notionData(remote.tree.id, currentMarkdown, remote.tree, mentions, emailMentions) };
    if (localChanged && remoteChanged && targetMarkdown !== currentMarkdown && !fieldMerged) throw new Error("Markdown and Notion changed since last sync");
    if (localChanged && remoteChanged && targetMarkdown === currentMarkdown) return { title: currentMarkdown.split("\n")[0].replace(/^# */, ""), markdown: currentMarkdown, data: notionData(remote.tree.id, currentMarkdown, remote.tree, mentions, emailMentions) };
  }
  const localBody = mentions === void 0 ? split.body : hydrateUserMentions(split.body, mentions);
  const localBlocks = parseNotionMarkdown(localBody);
  await resolveNotionEmailMentions(runtime2, localBlocks, remote.cookie, remote.spaceId, remote.headers, emailMentions);
  const ambient = { spaceId: remote.spaceId, userId: remote.userId, currentTime: runtime2.clock.now().getTime() };
  const diffResult = diffNotionBlockTrees(remote.tree, localBlocks, sidecarBlocksFromNotionTree(remote.tree), ambient);
  const operations = [...diffResult.operations];
  const titleRich = split.title === "" ? object4(remote.tree.block["properties"])["title"] : titleRichText(split.title);
  if (split.title !== "" && compact(object4(remote.tree.block["properties"])["title"]) !== compact(titleRich)) operations.unshift({ pointer: pointer(remote.tree.id, remote.spaceId), path: ["properties", "title"], command: "updateBlockPropertyValue", args: { primitiveOp: { command: "set", args: titleRich } } });
  if (operations.length > 0) await notionPost(runtime2, "saveTransactionsFanout", remote.cookie, { requestId: (0, import_node_crypto4.randomUUID)(), transactions: [{ id: (0, import_node_crypto4.randomUUID)(), spaceId: remote.spaceId, operations }] }, remote.headers);
  const outputTree = { id: remote.tree.id, block: { ...remote.tree.block, properties: { ...object4(remote.tree.block["properties"]), title: titleRich } }, children: localTree(localBlocks).map((node, index) => outputNode(node, remote.tree.children[index], remote.tree.id, remote, ambient.currentTime)) };
  const output = renderNotionTreeToMarkdown(outputTree, mentions, emailMentions);
  return { title: output.split("\n")[0].replace(/^# */, ""), markdown: output, data: notionData(remote.tree.id, output, outputTree, mentions, emailMentions) };
}

// ../provider-notion/src/notion.ts
var notionPageId = /[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
var notionService = defineService({
  name: "notion",
  matches: (url) => (url.hostname === "www.notion.so" || url.hostname === "notion.so" || url.hostname === "app.notion.com" || url.hostname.endsWith(".notion.site")) && notionPageId.test(url.href),
  parse: (url) => Object.freeze({ service: "notion", identifier: notionPageId.exec(url.href)[0].replaceAll("-", "").toLowerCase(), type: "document" }),
  fetch: fetchNotionDocument,
  synchronize: (runtime2, url, source, base, markdown, markdownPath) => synchronizeNotionDocument(runtime2, url, source, base, markdown, markdownPath),
  upload: uploadNotionDocument
});

// ../provider-notion/src/index.ts
var notionProvider = Object.freeze({
  services: [notionService]
});

// ../../node_modules/toolcraft/node_modules/@poe-code/frontmatter/dist/parse.js
var import_yaml = __toESM(require_dist(), 1);

// ../../node_modules/toolcraft/node_modules/@poe-code/frontmatter/dist/stringify.js
var import_yaml2 = __toESM(require_dist(), 1);

// ../../node_modules/toolcraft/node_modules/toolcraft-design/dist/terminal-markdown/parser/frontmatter.js
var utf8Encoder = new TextEncoder();

// ../../node_modules/toolcraft/node_modules/toolcraft-design/dist/terminal-markdown/parser/block.js
var SOURCE_OFFSETS = Symbol("sourceOffsets");

// ../../node_modules/toolcraft/node_modules/toolcraft-design/dist/terminal-markdown/parser.js
var utf8Encoder2 = new TextEncoder();

// ../../node_modules/toolcraft/node_modules/toolcraft-design/dist/terminal-markdown/parser/code-highlight.js
var codeLanguages = [
  {
    id: "javascript",
    aliases: ["js", "javascript", "mjs", "cjs", "es6"],
    family: "lexical",
    spec: "javascript"
  },
  { id: "javascriptreact", aliases: ["jsx"], family: "lexical", spec: "javascript" },
  {
    id: "typescript",
    aliases: ["ts", "typescript", "mts", "cts"],
    family: "lexical",
    spec: "typescript"
  },
  { id: "typescriptreact", aliases: ["tsx"], family: "lexical", spec: "typescript" },
  { id: "json", aliases: ["json"], family: "data", spec: "json" },
  { id: "jsonc", aliases: ["jsonc"], family: "data", spec: "jsonc" },
  { id: "jsonl", aliases: ["jsonl"], family: "data", spec: "json" },
  { id: "yaml", aliases: ["yaml", "yml"], family: "data", spec: "yaml" },
  { id: "css", aliases: ["css"], family: "style", spec: "css" },
  { id: "scss", aliases: ["scss"], family: "style", spec: "css" },
  { id: "sass", aliases: ["sass"], family: "style", spec: "css" },
  { id: "less", aliases: ["less"], family: "style", spec: "css" },
  { id: "postcss", aliases: ["postcss"], family: "style", spec: "css" },
  { id: "shellscript", aliases: ["sh", "bash", "shell", "shellscript", "zsh", "fish"], family: "lexical", spec: "shell" },
  { id: "python", aliases: ["py", "python"], family: "lexical", spec: "python" },
  { id: "sql", aliases: ["sql", "ddl", "dml"], family: "lexical", spec: "sql" },
  { id: "html", aliases: ["html"], family: "markup", spec: "html" },
  { id: "xml", aliases: ["xml", "svg"], family: "markup", spec: "xml" },
  { id: "markdown", aliases: ["md", "markdown"], family: "line", spec: "markdown" },
  { id: "diff", aliases: ["diff", "patch"], family: "line", spec: "diff" },
  { id: "dockerfile", aliases: ["dockerfile", "docker"], family: "line", spec: "dockerfile" },
  { id: "ini", aliases: ["ini", "properties"], family: "data", spec: "ini" },
  { id: "toml", aliases: ["toml"], family: "data", spec: "toml" },
  { id: "plaintext", aliases: ["text", "txt", "plain", "plaintext"], plain: true },
  { id: "ruby", aliases: ["rb", "ruby"], family: "lexical", spec: "ruby" },
  { id: "go", aliases: ["go", "golang"], family: "lexical", spec: "go" },
  { id: "java", aliases: ["java"], family: "lexical", spec: "java" },
  { id: "kotlin", aliases: ["kt", "kotlin", "kts"], family: "lexical", spec: "kotlin" },
  { id: "swift", aliases: ["swift"], family: "lexical", spec: "swift" },
  { id: "dart", aliases: ["dart"], family: "lexical", spec: "dart" },
  { id: "scala", aliases: ["scala", "sc"], family: "lexical", spec: "scala" },
  { id: "groovy", aliases: ["groovy", "gvy", "gy", "gsp"], family: "lexical", spec: "groovy" },
  { id: "c", aliases: ["c"], family: "lexical", spec: "c" },
  { id: "cpp", aliases: ["cpp", "c++", "cc", "cxx"], family: "lexical", spec: "cpp" },
  { id: "csharp", aliases: ["cs", "csharp", "c#"], family: "lexical", spec: "csharp" },
  { id: "objective-c", aliases: ["objc", "objectivec", "objective-c", "m", "mm"], family: "lexical", spec: "objectivec" },
  { id: "rust", aliases: ["rs", "rust"], family: "lexical", spec: "rust" },
  { id: "php", aliases: ["php"], family: "lexical", spec: "php" },
  { id: "lua", aliases: ["lua"], family: "lexical", spec: "lua" },
  { id: "perl", aliases: ["pl", "perl", "pm"], family: "lexical", spec: "perl" },
  { id: "r", aliases: ["r", "rscript"], family: "lexical", spec: "r" },
  { id: "powershell", aliases: ["ps1", "powershell", "pwsh"], family: "lexical", spec: "powershell" },
  { id: "elixir", aliases: ["ex", "exs", "elixir"], family: "lexical", spec: "elixir" },
  { id: "erlang", aliases: ["erl", "erlang", "hrl"], family: "lexical", spec: "erlang" },
  { id: "haskell", aliases: ["hs", "haskell"], family: "lexical", spec: "haskell" },
  { id: "clojure", aliases: ["clj", "cljs", "cljc", "clojure"], family: "lexical", spec: "clojure" },
  { id: "fsharp", aliases: ["fs", "fsi", "fsx", "fsharp"], family: "lexical", spec: "fsharp" },
  { id: "vb", aliases: ["vb", "vbnet"], family: "lexical", spec: "vb" },
  { id: "graphql", aliases: ["graphql", "gql"], family: "lexical", spec: "graphql" },
  { id: "protobuf", aliases: ["proto", "protobuf"], family: "lexical", spec: "protobuf" },
  { id: "hcl", aliases: ["hcl", "tf", "terraform"], family: "lexical", spec: "hcl" },
  { id: "nginx", aliases: ["nginx", "nginxconf"], family: "lexical", spec: "nginx" },
  { id: "makefile", aliases: ["makefile", "mk"], family: "lexical", spec: "makefile" },
  { id: "cmake", aliases: ["cmake"], family: "lexical", spec: "cmake" },
  { id: "gradle", aliases: ["gradle"], family: "lexical", spec: "groovy" },
  { id: "env", aliases: ["env", "dotenv"], family: "data", spec: "ini" },
  { id: "vue", aliases: ["vue"], family: "markup", spec: "html" },
  { id: "svelte", aliases: ["svelte"], family: "markup", spec: "html" }
];
var languageByAlias = /* @__PURE__ */ new Map();
for (const language of codeLanguages) {
  languageByAlias.set(language.id.toLowerCase(), language);
  for (const alias of language.aliases) {
    languageByAlias.set(alias.toLowerCase(), language);
  }
}
var jsKeywords = /* @__PURE__ */ new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "get",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "of",
  "return",
  "set",
  "static",
  "super",
  "switch",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield"
]);
var tsKeywords = /* @__PURE__ */ new Set([
  ...jsKeywords,
  "abstract",
  "declare",
  "enum",
  "implements",
  "interface",
  "keyof",
  "namespace",
  "private",
  "protected",
  "public",
  "readonly",
  "satisfies",
  "type"
]);
var cKeywords = /* @__PURE__ */ new Set(["auto", "break", "case", "const", "continue", "default", "do", "else", "enum", "extern", "for", "goto", "if", "inline", "register", "restrict", "return", "sizeof", "static", "struct", "switch", "typedef", "union", "volatile", "while"]);
var cTypes = /* @__PURE__ */ new Set(["bool", "char", "double", "float", "int", "int16_t", "int32_t", "int64_t", "int8_t", "long", "short", "size_t", "uint16_t", "uint32_t", "uint64_t", "uint8_t", "void"]);
var cppKeywords = /* @__PURE__ */ new Set([...cKeywords, "alignas", "alignof", "and", "bitand", "bitor", "catch", "class", "concept", "constexpr", "consteval", "constinit", "decltype", "delete", "explicit", "export", "friend", "mutable", "namespace", "new", "noexcept", "not", "operator", "or", "private", "protected", "public", "requires", "template", "this", "throw", "try", "typename", "using", "virtual", "xor"]);
var cppTypes = /* @__PURE__ */ new Set([...cTypes, "auto", "bool", "char16_t", "char32_t", "std", "string", "wstring"]);
var objectiveCKeywords = /* @__PURE__ */ new Set([...cKeywords, "@autoreleasepool", "@catch", "@class", "@dynamic", "@end", "@finally", "@implementation", "@import", "@interface", "@optional", "@package", "@private", "@property", "@protected", "@protocol", "@public", "@selector", "@synthesize", "@throw", "@try", "YES", "NO", "nil", "self", "super"]);
var objectiveCTypes = /* @__PURE__ */ new Set([...cTypes, "BOOL", "Class", "CGFloat", "NSInteger", "NSObject", "NSString", "NSUInteger", "SEL", "id"]);

// ../../node_modules/toolcraft/node_modules/toolcraft-design/dist/internal/color-support.js
function supportsColor(env2 = process.env, stream = process.stdout) {
  if (env2.FORCE_COLOR !== void 0 && env2.FORCE_COLOR !== "0") {
    return true;
  }
  if (env2.NO_COLOR !== void 0) {
    return false;
  }
  if (stream.isTTY !== true) {
    return false;
  }
  return typeof env2.TERM === "string" && env2.TERM.length > 0 && env2.TERM !== "dumb";
}

// ../../node_modules/toolcraft/node_modules/toolcraft-design/dist/components/color.js
var reset = "\x1B[0m";
var ansiStyles = {
  reset: { open: reset },
  bold: { open: "\x1B[1m" },
  dim: { open: "\x1B[2m" },
  italic: { open: "\x1B[3m" },
  underline: { open: "\x1B[4m" },
  inverse: { open: "\x1B[7m" },
  strikethrough: { open: "\x1B[9m" },
  black: { open: "\x1B[30m" },
  red: { open: "\x1B[31m" },
  green: { open: "\x1B[32m" },
  yellow: { open: "\x1B[33m" },
  blue: { open: "\x1B[34m" },
  magenta: { open: "\x1B[35m" },
  cyan: { open: "\x1B[36m" },
  white: { open: "\x1B[37m" },
  gray: { open: "\x1B[90m" },
  magentaBright: { open: "\x1B[95m" },
  cyanBright: { open: "\x1B[96m" },
  bgRed: { open: "\x1B[41m" },
  bgGreen: { open: "\x1B[42m" },
  bgYellow: { open: "\x1B[43m" },
  bgBlue: { open: "\x1B[44m" },
  bgMagenta: { open: "\x1B[45m" }
};
var styleNames = Object.keys(ansiStyles);
function replaceAll(value, search, replacement) {
  return value.split(search).join(replacement);
}
function applyStyles(text3, styles) {
  if (!supportsColor() || styles.length === 0) {
    return text3;
  }
  const open2 = styles.map((style) => style.open).join("");
  const output = text3.includes(reset) ? replaceAll(text3, reset, `${reset}${open2}`) : text3;
  return `${open2}${output}${reset}`;
}
function clampRgb(value) {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(255, Math.max(0, Math.round(value)));
}
function hexChannel(value, offset) {
  return Number.parseInt(value.slice(offset, offset + 2), 16);
}
function normalizeHex(value) {
  const normalized = value.startsWith("#") ? value.slice(1) : value;
  if (normalized.length !== 3 && normalized.length !== 6 || Array.from(normalized).some((char) => !"0123456789abcdefABCDEF".includes(char))) {
    throw new Error(`Invalid hexadecimal color: ${value}`);
  }
  if (normalized.length === 3) {
    const red = normalized[0];
    const green = normalized[1];
    const blue = normalized[2];
    return [
      Number.parseInt(`${red}${red}`, 16),
      Number.parseInt(`${green}${green}`, 16),
      Number.parseInt(`${blue}${blue}`, 16)
    ];
  }
  return [
    hexChannel(normalized, 0),
    hexChannel(normalized, 2),
    hexChannel(normalized, 4)
  ];
}
function rgbStyle(red, green, blue) {
  return {
    open: `\x1B[38;2;${clampRgb(red)};${clampRgb(green)};${clampRgb(blue)}m`
  };
}
function bgRgbStyle(red, green, blue) {
  return {
    open: `\x1B[48;2;${clampRgb(red)};${clampRgb(green)};${clampRgb(blue)}m`
  };
}
function createColor(styles = []) {
  const builder = ((text3) => applyStyles(String(text3), styles));
  for (const name of styleNames) {
    Object.defineProperty(builder, name, {
      configurable: true,
      enumerable: true,
      get: () => createColor([...styles, ansiStyles[name]])
    });
  }
  builder.hex = (value) => {
    const [red, green, blue] = normalizeHex(value);
    return createColor([...styles, rgbStyle(red, green, blue)]);
  };
  builder.rgb = (red, green, blue) => createColor([...styles, rgbStyle(red, green, blue)]);
  builder.bgHex = (value) => {
    const [red, green, blue] = normalizeHex(value);
    return createColor([...styles, bgRgbStyle(red, green, blue)]);
  };
  builder.bgRgb = (red, green, blue) => createColor([...styles, bgRgbStyle(red, green, blue)]);
  return builder;
}
var color = createColor();

// ../../node_modules/toolcraft/node_modules/toolcraft-design/dist/internal/output-format.js
var import_node_async_hooks = require("node:async_hooks");
var formatStorage = new import_node_async_hooks.AsyncLocalStorage();

// ../../node_modules/toolcraft/node_modules/toolcraft-design/dist/tokens/brand.js
var brands = {
  purple: { name: "purple", primary: "#a200ff" },
  blue: { name: "blue", primary: "#2f6fed" },
  green: { name: "green", primary: "#1f9d57" }
};

// ../../node_modules/toolcraft/node_modules/toolcraft-design/dist/internal/theme-state.js
var defaults = {
  brand: "purple",
  label: "Poe"
};
var config = { ...defaults };
function getThemeConfig() {
  return { ...config };
}

// ../../node_modules/toolcraft/node_modules/toolcraft-design/dist/tokens/colors.js
var brand = brands.purple.primary;
function withStyles(palette, styles) {
  return Object.defineProperty(palette, "styles", {
    value: styles,
    enumerable: false
  });
}
function brandColor(activeBrand, purple) {
  return activeBrand.name === "purple" ? purple : color.hex(activeBrand.primary);
}
function brandBackground(activeBrand, purple) {
  return activeBrand.name === "purple" ? purple : color.bgHex(activeBrand.primary);
}
function createPalette(activeBrand, mode) {
  const isPurple = activeBrand.name === "purple";
  if (mode === "light") {
    const active2 = color.hex(activeBrand.primary);
    const prompt2 = isPurple ? color.hex("#006699") : active2;
    const number2 = isPurple ? color.hex("#0077cc") : active2;
    return withStyles({
      header: (text3) => active2.bold(text3),
      divider: (text3) => color.hex("#666666")(text3),
      prompt: (text3) => prompt2.bold(text3),
      number: (text3) => number2.bold(text3),
      intro: (text3) => color.bgHex(activeBrand.primary).white(` ${getThemeConfig().label} - ${text3} `),
      get resolvedSymbol() {
        return active2("\u25C7");
      },
      get errorSymbol() {
        return color.hex("#cc0000")("\u25A0");
      },
      accent: (text3) => prompt2.bold(text3),
      muted: (text3) => color.hex("#666666")(text3),
      success: (text3) => color.hex("#008800")(text3),
      warning: (text3) => color.hex("#cc6600")(text3),
      error: (text3) => color.hex("#cc0000")(text3),
      info: (text3) => active2(text3),
      badge: (text3) => color.bgHex("#cc6600").white(` ${text3} `)
    }, {
      accent: { fg: isPurple ? "#006699" : activeBrand.primary, bold: true },
      muted: { fg: "#666666" },
      success: { fg: "#008800" },
      warning: { fg: "#cc6600" },
      error: { fg: "#cc0000" },
      info: { fg: activeBrand.primary }
    });
  }
  const active = brandColor(activeBrand, color.magenta);
  const activeBright = brandColor(activeBrand, color.magentaBright);
  const activeBackground = brandBackground(activeBrand, color.bgMagenta);
  const prompt = isPurple ? color.cyan : active;
  const number = isPurple ? color.cyanBright : active;
  return withStyles({
    header: (text3) => activeBright.bold(text3),
    divider: (text3) => color.dim(text3),
    prompt: (text3) => prompt(text3),
    number: (text3) => number(text3),
    intro: (text3) => activeBackground.white(` ${getThemeConfig().label} - ${text3} `),
    get resolvedSymbol() {
      return active("\u25C7");
    },
    get errorSymbol() {
      return color.red("\u25A0");
    },
    accent: (text3) => prompt(text3),
    muted: (text3) => color.dim(text3),
    success: (text3) => color.green(text3),
    warning: (text3) => color.yellow(text3),
    error: (text3) => color.red(text3),
    info: (text3) => active(text3),
    badge: (text3) => color.bgYellow.black(` ${text3} `)
  }, {
    accent: { fg: isPurple ? "cyan" : activeBrand.primary, bold: true },
    muted: { dim: true },
    success: { fg: "green" },
    warning: { fg: "yellow" },
    error: { fg: "red" },
    info: { fg: isPurple ? "magenta" : activeBrand.primary }
  });
}
var dark = createPalette(brands.purple, "dark");
var light = createPalette(brands.purple, "light");

// ../../node_modules/toolcraft/node_modules/toolcraft-design/dist/dashboard/terminal-width.js
var graphemeSegmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });

// ../provider-slack/src/slack.ts
function slackAuthError() {
  return new Error("slack cookie authentication is missing or expired. Run `wire slack login` once; other commands reuse saved cookies.");
}
function decodeEntities(text3) {
  return text3.replace(/&(amp|lt|gt|quot|#39);/g, (_match, entity) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[entity]);
}
function cleanText(text3) {
  return text3.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, index) => {
    if (index % 2 === 1) return part.startsWith("```") ? `
${codeBlock(decodeEntities(part.slice(3, -3).replace(/^\n|\n$/g, "")))}
` : codeSpan(decodeEntities(part.slice(1, -1)));
    return part.split(/(<[^>]+>)/g).map((value, position) => {
      if (position % 2 === 0) return decodeEntities(value).replace(/[<>]/g, "\\$&").replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, "$1**$2**").replace(/(^|[\s(])~([^~\n]+)~(?=$|[\s).,!?:;])/g, "$1~~$2~~");
      return decodeEntities(value.replace(/<@([A-Z0-9]+)(?:\|([^>]+))?>/g, (_match, id, label) => `@${label === void 0 ? id : label}`).replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1").replace(/<#([A-Z0-9]+)>/g, "#$1").replace(/<!subteam\^[A-Z0-9]+\|([^>]+)>/g, "$1").replace(/<!(here|channel|everyone)>/g, "@$1").replace(/<(https?:\/\/[^|>\s]+)\|([^>]+)>/g, (_match, url, label) => `[${markdownText2(label)}](${url})`).replace(/<(https?:\/\/[^>]+)>/g, "$1").replace(/<(mailto:[^|>]+)\|([^>]+)>/g, (_match, url, label) => `[${markdownText2(label)}](${url})`).replace(/<!date\^[^|]+\|([^>]+)>/g, "$1"));
    }).join("");
  }).join("").trimEnd();
}
function markdownText2(value) {
  return value.replace(/[\\`*_{}\[\]<>~|]/g, "\\$&").replace(/^(\s*)([#>+\-=])/gm, "$1\\$2").replace(/^(\s*[0-9]+)([.)])/gm, "$1\\$2");
}
function codeSpan(value) {
  const fence = "`".repeat(Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length)) + 1);
  const padding = value.startsWith("`") || value.endsWith("`") || /^ .* $/.test(value) && value.trim() !== "" ? " " : "";
  return `${fence}${padding}${value}${padding}${fence}`;
}
function codeBlock(value) {
  const fence = "`".repeat(Math.max(2, ...[...value.matchAll(/`+/g)].map((match) => match[0].length)) + 1);
  return `${fence}
${value}
${fence}`;
}
function richInline(elements, users) {
  let output = "";
  let active = [];
  for (const element of elements) {
    const style = element["style"];
    let text3;
    switch (element["type"]) {
      case "text":
        text3 = style?.["code"] === true ? codeSpan(element["text"]) : markdownText2(element["text"]);
        break;
      case "link":
        text3 = `[${markdownText2(element["text"] === void 0 ? element["url"] : element["text"])}](<${element["url"].replace(/>/g, "%3E")}>)`;
        break;
      case "user": {
        const id = element["user_id"];
        text3 = users.has(id) ? `[@${markdownText2(users.get(id))}](slack://user?id=${id})` : `<@${id}>`;
        break;
      }
      case "channel":
        text3 = `<#${element["channel_id"]}>`;
        break;
      case "usergroup":
        text3 = `<!subteam^${element["usergroup_id"]}>`;
        break;
      case "broadcast":
        text3 = `<!${element["range"]}>`;
        break;
      case "emoji":
        text3 = typeof element["unicode"] === "string" ? String.fromCodePoint(...element["unicode"].split("-").map((part) => Number.parseInt(part, 16))) : `:${element["name"]}:`;
        break;
      case "date":
        text3 = element["fallback"] === void 0 ? new Date(Number(element["timestamp"]) * 1e3).toISOString() : markdownText2(element["fallback"]);
        break;
      case "color":
        text3 = codeSpan(element["value"]);
        break;
      default:
        throw new Error(`Unsupported Slack rich-text element: ${element["type"]}`);
    }
    const markers = [style?.["bold"] === true ? "**" : "", style?.["italic"] === true ? "*" : "", style?.["strike"] === true ? "~~" : ""].filter((marker) => marker !== "");
    const next = [...active.filter((marker) => markers.includes(marker)), ...markers.filter((marker) => !active.includes(marker))];
    let common = 0;
    while (common < active.length && active[common] === next[common]) common += 1;
    const trailing2 = /\s*$/.exec(output)[0];
    output = output.slice(0, output.length - trailing2.length) + active.slice(common).reverse().join("") + trailing2;
    const leading = /^\s*/.exec(text3)[0];
    output += leading + next.slice(common).join("") + text3.slice(leading.length);
    active = next;
  }
  const trailing = /\s*$/.exec(output)[0];
  return output.slice(0, output.length - trailing.length) + active.reverse().join("") + trailing;
}
function slackBlocksToMarkdown(blocks, users) {
  const render2 = (block) => {
    const elements = block["elements"];
    switch (block["type"]) {
      case "rich_text": {
        const output = [];
        for (const [index, child] of elements.entries()) {
          const previous = elements[index - 1];
          const adjacentLists = child["type"] === "rich_text_list" && previous?.["type"] === "rich_text_list" && (child["style"] === previous["style"] || child["indent"] !== previous["indent"]);
          output.push(`${index === 0 ? "" : adjacentLists ? "\n" : "\n\n"}${render2(child)}`);
        }
        return output.join("");
      }
      case "rich_text_section":
        return richInline(elements, users);
      case "rich_text_preformatted":
        return codeBlock(elements.map((element) => element["text"] === void 0 ? element["url"] : element["text"]).join(""));
      case "rich_text_quote":
        return richInline(elements, users).split("\n").map((line) => `> ${line}`).join("\n");
      case "rich_text_list":
        return elements.map((element, index) => {
          const indent = block["indent"] === void 0 ? 0 : block["indent"];
          const offset = block["offset"] === void 0 ? 0 : block["offset"];
          const prefix = block["style"] === "ordered" ? `${offset + index + 1}. ` : "- ";
          return `${"    ".repeat(indent)}${prefix}${richInline(element["elements"], users).replace(/\n/g, `
${"    ".repeat(indent)}${" ".repeat(prefix.length)}`)}`;
        }).join("\n");
      case "section":
        return [...block["text"] === void 0 ? [] : [render2(block["text"])], ...block["fields"] === void 0 ? [] : block["fields"].map(render2)].join("\n\n");
      case "mrkdwn":
        return cleanText(block["text"]);
      case "plain_text":
        return markdownText2(block["text"]);
      case "header":
        return `## ${render2(block["text"])}`;
      case "divider":
        return "---";
      case "context":
        return elements.map(render2).join(" \xB7 ");
      case "image":
        return `![${markdownText2(block["alt_text"])}](<${block["image_url"]}>)`;
      case "actions":
        return elements.map(render2).join(" \xB7 ");
      case "button":
        return block["url"] === void 0 ? render2(block["text"]) : `[${render2(block["text"])}](<${block["url"]}>)`;
      default:
        throw new Error(`Unsupported Slack block: ${block["type"]}`);
    }
  };
  return blocks.map(render2).join("\n\n");
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
function channelParts(url) {
  if (!url.hostname.endsWith(".slack.com")) return void 0;
  const match = /^\/archives\/([CDG][A-Z0-9]+)\/?$/.exec(url.pathname);
  if (match !== null) return match[1];
  if (url.hostname === "app.slack.com") return /^\/client\/[^/]+\/([CDG][A-Z0-9]+)\/?$/.exec(url.pathname)?.[1];
  return void 0;
}
async function slackSession(runtime2) {
  const cookies = await runtime2.cookies.loadSaved("slack");
  if (cookies === null) throw slackAuthError();
  const metadata = await runtime2.cookies.metadata("slack");
  return { origin: metadata["origin"], token: metadata["token"], cookie: cookies.map((value) => `${value.name}=${value.value}`).join("; ") };
}
var slackService = defineService({
  name: "slack",
  matches: (url) => messageParts(url) !== void 0 || channelParts(url) !== void 0,
  parse: (url) => {
    const channel = channelParts(url);
    if (channel !== void 0) return Object.freeze({ service: "slack", identifier: channel, type: "message-thread", channel_id: channel });
    const parts = messageParts(url);
    const timestamp = slackTimestamp(parts.rawTimestamp);
    const threadTimestamp = url.searchParams.has("thread_ts") ? url.searchParams.get("thread_ts") : timestamp;
    return Object.freeze({ service: "slack", identifier: `${parts.channel}:${threadTimestamp}`, type: "message-thread", channel_id: parts.channel, timestamp, thread_timestamp: threadTimestamp });
  },
  fetch: async (runtime2, url, source) => {
    const session = await slackSession(runtime2);
    const origin = new URL(url).hostname === "app.slack.com" ? session.origin : new URL(url).origin;
    const { token, cookie } = session;
    const replies = [];
    let cursor;
    do {
      const response = await api(runtime2, origin, token, cookie, source["thread_timestamp"] === void 0 ? "conversations.history" : "conversations.replies", { channel: source["channel_id"], ...source["thread_timestamp"] === void 0 ? {} : { ts: source["thread_timestamp"] }, limit: "200", ...cursor === void 0 ? {} : { cursor } });
      replies.push(...response["messages"]);
      cursor = response["response_metadata"]?.["next_cursor"];
    } while (cursor !== void 0 && cursor !== "");
    if (source["thread_timestamp"] === void 0) {
      for (const parent of [...replies]) {
        if (typeof parent["reply_count"] !== "number" || parent["reply_count"] === 0) continue;
        let cursor2;
        do {
          const response = await api(runtime2, origin, token, cookie, "conversations.replies", { channel: source["channel_id"], ts: parent["ts"], limit: "200", ...cursor2 === void 0 ? {} : { cursor: cursor2 } });
          replies.push(...response["messages"].filter((message) => message["ts"] !== parent["ts"]));
          cursor2 = response["response_metadata"]?.["next_cursor"];
        } while (cursor2 !== void 0 && cursor2 !== "");
      }
      replies.sort((left, right) => left["ts"].localeCompare(right["ts"]));
    }
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
    for (const raw of replies) {
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
      const text3 = raw["text"];
      const files = raw["files"] === void 0 ? [] : raw["files"].map((file) => Object.freeze({ name: file["name"], url: file["url_private"] }));
      messages.push({ ...raw, ts: raw["ts"], user_id: userId ?? "unknown", user_name: userName, text: text3, raw_text: text3, files });
    }
    const mentioned = new Set(replies.filter((raw) => raw["blocks"] === void 0 || raw["blocks"].length === 0).flatMap((raw) => [...raw["text"].replace(/```[\s\S]*?```|`[^`\n]*`/g, "").matchAll(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g)].map((match) => match[1])));
    const visit = (value) => {
      if (Array.isArray(value)) {
        for (const child of value) visit(child);
      } else if (value !== null && typeof value === "object") {
        const object5 = value;
        if (object5["type"] === "user") mentioned.add(object5["user_id"]);
        for (const child of Object.values(object5)) visit(child);
      }
    };
    for (const raw of replies) {
      visit(raw["blocks"]);
      visit(raw["attachments"]);
    }
    for (const id of mentioned) await resolveUser(id);
    for (const [index, message] of messages.entries()) {
      const raw = replies[index];
      const cleaned = raw["blocks"] !== void 0 && raw["blocks"].length > 0 ? slackBlocksToMarkdown(raw["blocks"], userCache) : cleanText(message.text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, index2) => index2 % 2 === 1 ? part : part.replace(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g, (_match, id) => `@${userCache.get(id)}`)).join(""));
      const fileLines = message.files.map((file) => `- [${markdownText2(file.name)}](${file.url})`).join("\n");
      const attachments = raw["attachments"] === void 0 ? [] : raw["attachments"].map((attachment) => {
        const parts = [];
        if (attachment["title"] !== void 0) parts.push(attachment["title_link"] === void 0 ? markdownText2(attachment["title"]) : `[${markdownText2(attachment["title"])}](<${attachment["title_link"]}>)`);
        if (attachment["pretext"] !== void 0) parts.push(cleanText(attachment["pretext"]));
        if (attachment["text"] !== void 0) parts.push(cleanText(attachment["text"]));
        if (attachment["blocks"] !== void 0) parts.push(slackBlocksToMarkdown(attachment["blocks"], userCache));
        if (attachment["fields"] !== void 0) for (const field of attachment["fields"]) parts.push(`**${markdownText2(field["title"])}**: ${cleanText(field["value"])}`);
        if (attachment["image_url"] !== void 0) parts.push(`![](<${attachment["image_url"]}>)`);
        if (attachment["footer"] !== void 0) parts.push(markdownText2(attachment["footer"]));
        return parts.join("\n\n");
      });
      message.text = [cleaned, ...attachments, fileLines].filter((part) => part.trim() !== "").join("\n\n");
    }
    const timezone = runtime2.clock.localTimezone();
    if (messages.length === 0) return { title: source["channel_id"], markdown: "", data: { channel_id: source["channel_id"], messages: [] } };
    const date = formatTimestamp(messages[0].ts, timezone).slice(0, 10);
    const titleText = messages[0].text.replace(/https?:\/\/\S+/g, "").slice(0, 30).replace(/[^\p{L}\p{N}_\s-]/gu, "").replace(/[\s-]+/g, "_").replace(/^_+|_+$/g, "");
    const lines = [];
    for (const [index, message] of messages.entries()) {
      lines.push(`## ${message.user_name} \u2014 ${formatTimestamp(message.ts, timezone)}`, "");
      const thread = replies[index]["thread_ts"];
      if (source["thread_timestamp"] === void 0 && thread !== void 0 && thread !== message.ts) lines.push(`[Thread](${origin}/archives/${source["channel_id"]}/p${thread.replace(".", "")})`, "");
      lines.push(message.text, "");
    }
    return Object.freeze({ title: `${date}-${titleText}`, markdown: `${lines.join("\n").trimEnd()}
`, data: { channel_id: source["channel_id"], messages } });
  }
});

// ../provider-slack/src/index.ts
var slackProvider = Object.freeze({
  services: [slackService]
});

// ../provider-zoom/src/zoom-hub.ts
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
  const text3 = await response.text();
  if (response.status === 401) throw zoomAuthError();
  if (!response.ok) throw new Error(`Zoom Hub ${label} failed: HTTP ${response.status} ${text3}`);
  return text3;
}
async function zoomJson(response, label) {
  const body2 = await response.json();
  if (response.status === 401) throw zoomAuthError();
  if (!response.ok) throw new Error(`Zoom Hub ${label} failed: HTTP ${response.status} ${JSON.stringify(body2)}`);
  return body2;
}
function zoomJwt(text3) {
  const token = text3.trim();
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
  const headers = response.headers;
  const values2 = headers.getSetCookie?.();
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

// ../provider-zoom/src/index.ts
var zoomProvider = Object.freeze({
  services: [zoomHubService]
});

// src/service-catalog.ts
var serviceCatalog = createServiceRegistry().use(zoomProvider).use(notionProvider).use(slackProvider).use(chatgptProvider).use(googleDocsProvider).use(gmailProvider).use(asanaProvider).catalog();

// src/extension.ts
var execFileAsync2 = (0, import_node_util2.promisify)(import_node_child_process3.execFile);
var authServices = ["asana", "chatgpt", "gmail", "google-docs", "notion", "slack", "zoom"];
var wireStatus;
function operationPath(value, path) {
  if (value.startsWith("http://") || value.startsWith("https://")) return path;
  return (0, import_node_path5.isAbsolute)(value) ? value : (0, import_node_path5.resolve)(path, value);
}
async function commandEnvironment(path) {
  const home = process.env["HOME"];
  if (home === void 0 || home.trim() === "") throw new Error("Missing environment variable: HOME");
  const wireRoot2 = await configuredWireRoot(path, home);
  if (wireRoot2 === null) return process.env;
  const config2 = await loadWireConfig(wireRoot2);
  return { ...process.env, ...config2.env };
}
function environment(values2, name) {
  const value = values2[name];
  if (value === void 0 || value.trim() === "") throw new Error(`Missing environment variable: ${name}`);
  return value;
}
function repositoryRoot() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
function runtime(values2) {
  const filesystem = {
    exists: async (path) => (0, import_node_fs4.existsSync)(path),
    readText: (path) => (0, import_promises7.readFile)(path, "utf8"),
    writeText: async (path, contents) => {
      await (0, import_promises7.mkdir)((0, import_node_path5.dirname)(path), { recursive: true });
      await (0, import_promises7.writeFile)(path, contents, "utf8");
    },
    delete: (path) => (0, import_promises7.rm)(path)
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
      const result = await execFileAsync2(command, [...args], { encoding: "utf8" });
      return { stdout: result.stdout, stderr: result.stderr };
    } },
    clock,
    openFiles: { open: async (path) => {
      await vscode.env.openExternal(vscode.Uri.parse(path));
    } },
    configuration: { get: (name) => environment(values2, name) },
    secrets: { get: async (reference) => {
      throw new Error(`Missing secret provider for ${reference}`);
    } },
    cookies: createCookiesCapability(filesystem, () => environment(values2, "HOME"), repositoryRoot),
    gmailTokens: {
      load: () => createGoogleTokensCapability(filesystem, { request: (input, init) => fetch(input, init) }, clock, environment(values2, "GOOGLE_CREDENTIALS_FILE"), environment(values2, "GOOGLE_TOKEN_FILE")).load(),
      refresh: () => createGoogleTokensCapability(filesystem, { request: (input, init) => fetch(input, init) }, clock, environment(values2, "GOOGLE_CREDENTIALS_FILE"), environment(values2, "GOOGLE_TOKEN_FILE")).refresh()
    },
    googleFormsTokens: {
      load: () => createGoogleTokensCapability(filesystem, { request: (input, init) => fetch(input, init) }, clock, environment(values2, "GOOGLE_CREDENTIALS_FILE"), environment(values2, "GOOGLE_FORMS_TOKEN_FILE")).load(),
      refresh: () => createGoogleTokensCapability(filesystem, { request: (input, init) => fetch(input, init) }, clock, environment(values2, "GOOGLE_CREDENTIALS_FILE"), environment(values2, "GOOGLE_FORMS_TOKEN_FILE")).refresh()
    }
  };
}
async function wire(path) {
  const values2 = await commandEnvironment(path);
  const capabilities = runtime(values2);
  const baseWire = composeWire({
    home: environment(values2, "HOME"),
    fetchInput: capabilities,
    catalog: serviceCatalog,
    filesystem: {
      exists: async (path2) => (0, import_node_fs4.existsSync)(path2),
      isFile: async (path2) => (0, import_node_fs4.existsSync)(path2) && (0, import_node_fs4.statSync)(path2).isFile(),
      readText: capabilities.filesystem.readText,
      writeText: capabilities.filesystem.writeText,
      writeBytes: async (path2, contents) => {
        await (0, import_promises7.mkdir)((0, import_node_path5.dirname)(path2), { recursive: true });
        await (0, import_promises7.writeFile)(path2, contents);
      }
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
  return withWireHooks(baseWire, { currentDirectory: projectDirectory(), home: environment(values2, "HOME"), environment: values2 });
}
async function auth() {
  const values2 = await commandEnvironment(projectDirectory());
  return composeAuth(runtime(values2), values2, extractChromeCookies);
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
  const missingGoogle = /^Missing environment variable: (GOOGLE_CREDENTIALS_FILE|GOOGLE_TOKEN_FILE|GOOGLE_FORMS_TOKEN_FILE)$/.exec(error.message);
  if (missingGoogle !== null) return { message: "Wire - Google login required. Run in terminal: wire google-docs login", command: "wire google-docs login" };
  const unregisteredPath = /^Resource path is not registered: ([\s\S]+)$/.exec(error.message);
  if (unregisteredPath !== null) return { message: `Wire - Not attached: ${unregisteredPath[1]}. Use Wire - Attach to track a source URL, or Wire - Download for a one-time copy.` };
  const missingPath = /^Resource path not found: ([\s\S]+)$/.exec(error.message);
  if (missingPath !== null) return { message: `Wire - Not found: ${missingPath[1]}.` };
  const unsupportedSource = /^Unsupported source URL: ([\s\S]+)$/.exec(error.message);
  if (unsupportedSource !== null) return { message: `Wire - Unsupported source URL: ${unsupportedSource[1]}. Supported sources: Asana, ChatGPT, Gmail, Google Docs/Sheets/Slides/Forms, Notion, Slack, Zoom.` };
  const login = /authentication (?:is missing or expired|is missing|failed|expired).*Run `([^`]+)`/i.exec(error.message);
  if (login !== null) return { message: `Wire - Login required. Run in terminal: ${login[1]}`, command: login[1] };
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
  return (0, import_node_fs4.existsSync)(path) && (0, import_node_fs4.statSync)(path).isDirectory() ? path : (0, import_node_path5.dirname)(path);
}
function projectDirectory() {
  const root = repositoryRoot();
  if (root === void 0) throw new Error("No workspace folder open");
  return root;
}
function resourceFile(uri) {
  const path = selectedPath(uri);
  if (!(0, import_node_fs4.statSync)(path).isFile()) throw new Error(`Expected file: ${path}`);
  return path;
}
function pathInsideDirectory(directory, path) {
  const normalizedDirectory = (0, import_node_path5.resolve)(directory);
  const normalizedPath = (0, import_node_path5.resolve)(path);
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
  const result = await wireProgress("Attaching", async () => (await wire(directory)).attach(url, directory));
  await vscode.window.showTextDocument(vscode.Uri.file(result.path));
  await showWireResultStatus(result);
}
async function initProject() {
  const directory = projectDirectory();
  const values2 = await commandEnvironment(directory);
  const existingRoot = await configuredWireRoot(directory, environment(values2, "HOME"));
  if (existingRoot !== null) {
    const config2 = await loadWireConfig(existingRoot);
    showWireStatus(`Wire - Project ready: ${config2.backend}`);
    return;
  }
  const result = await wireProgress("Initializing project", () => initializeWire(directory, defaultWireBackend, defaultWireRegistryPath));
  showWireStatus(`Wire - Project initialized: ${result.backend}`);
}
async function downloadHere(uri) {
  const directory = selectedDirectory(uri);
  const url = await vscode.window.showInputBox({ prompt: "Source URL" });
  if (url === void 0 || url.trim() === "") throw new Error("Source URL required");
  const result = await wireProgress("Downloading", async () => (await wire(directory)).downloadSource(url, directory));
  await vscode.window.showTextDocument(vscode.Uri.file(result.path));
  await showWireResultStatus(result);
}
async function previewUrl() {
  const url = await vscode.window.showInputBox({ prompt: "Source URL" });
  if (url === void 0 || url.trim() === "") throw new Error("Source URL required");
  const result = await wireProgress("Previewing", async () => (await wire(projectDirectory())).view(url));
  const document = await vscode.workspace.openTextDocument({ language: "markdown", content: result.markdown });
  await vscode.window.showTextDocument(document);
  showWireStatus(`Wire - Previewed: ${result.title}`);
}
async function syncFile(uri) {
  const path = resourceFile(uri);
  await saveDocument(path);
  const result = await wireProgress("Syncing", async () => (await wire(operationPath(path, (0, import_node_path5.dirname)(path)))).sync(path, (0, import_node_path5.dirname)(path)));
  await showWireResultStatus(result);
}
async function detachFile(uri) {
  const path = resourceFile(uri);
  const result = await wireProgress("Detaching", async () => (await wire(operationPath(path, (0, import_node_path5.dirname)(path)))).detach(path, (0, import_node_path5.dirname)(path)));
  await showWireResultStatus(result);
}
async function openResource(uri) {
  const path = resourceFile(uri);
  const resource = await wireProgress("Opening", async () => (await wire(operationPath(path, (0, import_node_path5.dirname)(path)))).openResource(path, (0, import_node_path5.dirname)(path)));
  showWireStatus(`Wire - Opened: ${title(resource)}`);
}
async function syncDirectory(uri) {
  const directory = selectedDirectory(uri);
  await saveDirtyDocumentsInDirectory(directory);
  const results = await wireProgress("Syncing all", async () => (await wire(directory)).syncAll(directory));
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
  const result = await wireProgress("Checking login", async () => (await auth()).status(service));
  showWireStatus(`Wire - Authenticated: ${identityText(result)}`);
}
async function authLogin() {
  const service = await selectedAuthService();
  const authClient = await auth();
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
  await wireProgress("Logging out", async () => (await auth()).logout(service));
  showWireStatus(`Wire - Logged out: ${service}`);
}
async function compileAndReload() {
  const root = (0, import_node_path5.resolve)(__dirname, "..");
  await execFileAsync2("node", ["bump-version.mjs", "patch"], { cwd: root });
  await execFileAsync2("npm", ["run", "compile"], { cwd: root });
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
