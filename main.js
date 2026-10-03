var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// node_modules/@laginae/note-reader-core/src/pdf-layout.js
var require_pdf_layout = __commonJS({
  "node_modules/@laginae/note-reader-core/src/pdf-layout.js"(exports2, module2) {
    "use strict";
    function normalizeLineBreaks2(text) {
      return String(text || "").replace(/\r\n?/g, "\n");
    }
    function isCjkCharacter(character) {
      return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(String(character || ""));
    }
    function shouldJoinPdfTextTokens(currentLine, token) {
      const previous = currentLine.slice(-1);
      const next = token.charAt(0);
      if (!previous || !next) {
        return true;
      }
      if (/[([{\u3008-\u3010\u3014\uff08]/.test(previous)) {
        return true;
      }
      if (/[),.;:!?%\]}\u3001\u3002\u3009-\u3011\u3015\uff01\uff09\uff0c\uff0e\uff1a\uff1b\uff1f]/.test(next)) {
        return true;
      }
      return isCjkCharacter(previous) && isCjkCharacter(next);
    }
    function joinTokens(tokens) {
      let line = "";
      for (const token of tokens) {
        const value = String(token || "").replace(/[ \t]+/g, " ").trim();
        if (!value) {
          continue;
        }
        line = line && !shouldJoinPdfTextTokens(line, value) ? `${line} ${value}` : `${line}${value}`;
      }
      return line.trim();
    }
    function cleanupExtractedText(lines) {
      return (Array.isArray(lines) ? lines : []).map((line) => String(line || "").trim()).filter(Boolean).join("\n").replace(/([A-Za-z])-\n(?=[a-z])/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
    }
    function extractTextInItemOrder(items) {
      const lines = [];
      let currentLine = "";
      const flushLine = () => {
        const line = currentLine.trim();
        if (line) {
          lines.push(line);
        }
        currentLine = "";
      };
      for (const item of Array.isArray(items) ? items : []) {
        if (!item || typeof item.str !== "string") {
          continue;
        }
        const parts = normalizeLineBreaks2(item.str).split("\n");
        parts.forEach((part, index) => {
          const token = part.replace(/[ \t]+/g, " ").trim();
          if (token) {
            currentLine = currentLine && !shouldJoinPdfTextTokens(currentLine, token) ? `${currentLine} ${token}` : `${currentLine}${token}`;
          }
          if (index < parts.length - 1) {
            flushLine();
          }
        });
        if (item.hasEOL) {
          flushLine();
        }
      }
      flushLine();
      return cleanupExtractedText(lines);
    }
    function median(values) {
      const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
      if (!sorted.length) {
        return 0;
      }
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }
    function normalizePositionedItem(item) {
      if (!item || typeof item.str !== "string" || !item.str.trim()) {
        return null;
      }
      const transform = Array.isArray(item.transform) || ArrayBuffer.isView(item.transform) ? item.transform : null;
      const rawX = typeof item.x !== "undefined" ? item.x : transform ? transform[4] : void 0;
      const rawY = typeof item.y !== "undefined" ? item.y : transform ? transform[5] : void 0;
      if (rawX === null || rawY === null || typeof rawX === "undefined" || typeof rawY === "undefined") {
        return null;
      }
      const x = Number(rawX);
      const y = Number(rawY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }
      const transformHeight = transform ? Math.max(Math.abs(Number(transform[1]) || 0), Math.abs(Number(transform[3]) || 0)) : 0;
      const height = Math.max(1, Math.abs(Number(item.height) || 0), transformHeight);
      const width = Math.max(0, Math.abs(Number(item.width) || 0));
      return { height, str: item.str, width, x, y };
    }
    function getHorizontalMetrics(entries, requestedPageWidth = 0) {
      const normalized = (Array.isArray(entries) ? entries : []).map((entry) => {
        const xMin = Number(typeof entry.xMin !== "undefined" ? entry.xMin : entry.x);
        const xMax = Number(typeof entry.xMax !== "undefined" ? entry.xMax : Number(entry.x) + Math.max(0, Number(entry.width) || 0));
        return Number.isFinite(xMin) && Number.isFinite(xMax) && xMax >= xMin ? { xMax, xMin } : null;
      }).filter(Boolean);
      const pageWidth = Number.isFinite(Number(requestedPageWidth)) && Number(requestedPageWidth) > 0 ? Number(requestedPageWidth) : 0;
      if (!normalized.length) {
        const fallbackWidth = Math.max(1, pageWidth);
        return {
          contentWidth: fallbackWidth,
          midpoint: fallbackWidth / 2
        };
      }
      const contentLeft = Math.min(...normalized.map((entry) => entry.xMin));
      const contentRight = Math.max(...normalized.map((entry) => entry.xMax));
      const contentWidth = Math.max(1, contentRight - contentLeft);
      return {
        contentWidth,
        midpoint: (contentLeft + contentRight) / 2
      };
    }
    function groupItemsIntoLines(items, requestedPageWidth = 0, options = {}) {
      const positioned = (Array.isArray(items) ? items : []).map(normalizePositionedItem).filter(Boolean);
      if (positioned.length < 2) {
        return [];
      }
      const tolerance = Math.max(2, median(positioned.map((item) => item.height)) * 0.5);
      const pageWidth = Number.isFinite(Number(requestedPageWidth)) && Number(requestedPageWidth) > 0 ? Number(requestedPageWidth) : Math.max(...positioned.map((item) => item.x + item.width), 1);
      const splitColumns = options.splitColumns !== false;
      const horizontal = getHorizontalMetrics(positioned, pageWidth);
      const minimumCentralGap = Math.max(4, horizontal.contentWidth * 0.012);
      positioned.sort((left, right) => right.y - left.y || left.x - right.x);
      const baselines = [];
      for (const item of positioned) {
        let line = baselines.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
        if (!line) {
          line = { items: [], y: item.y };
          baselines.push(line);
        }
        line.items.push(item);
        line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length;
      }
      const lineClusters = [];
      for (const baseline of baselines) {
        baseline.items.sort((left, right) => left.x - right.x);
        let cluster = [];
        for (const item of baseline.items) {
          const previous = cluster[cluster.length - 1];
          const gap = previous ? item.x - (previous.x + previous.width) : 0;
          const crossesMidpoint = previous && previous.x + previous.width <= horizontal.midpoint && item.x >= horizontal.midpoint;
          if (splitColumns && crossesMidpoint && gap >= minimumCentralGap) {
            lineClusters.push({ items: cluster, y: baseline.y });
            cluster = [];
          }
          cluster.push(item);
        }
        if (cluster.length) {
          lineClusters.push({ items: cluster, y: baseline.y });
        }
      }
      return lineClusters.map((line) => {
        const xMin = Math.min(...line.items.map((item) => item.x));
        const xMax = Math.max(...line.items.map((item) => item.x + item.width));
        return {
          text: joinTokens(line.items.map((item) => item.str)),
          xMax,
          xMin,
          y: line.y
        };
      }).filter((line) => line.text).sort((left, right) => right.y - left.y || left.xMin - right.xMin);
    }
    function getLineLayoutMetrics(lines, pageWidth) {
      const horizontal = getHorizontalMetrics(lines, pageWidth);
      return {
        fullWidth: horizontal.contentWidth * 0.62,
        gutter: Math.max(6, horizontal.contentWidth * 0.025),
        midpoint: horizontal.midpoint
      };
    }
    function classifyLine(line, pageWidth, requestedMetrics = null) {
      const metrics = requestedMetrics || getLineLayoutMetrics([line], pageWidth);
      const { fullWidth, gutter, midpoint } = metrics;
      const lineWidth = Math.max(0, line.xMax - line.xMin);
      if (lineWidth >= fullWidth || line.xMin < midpoint - gutter && line.xMax > midpoint + gutter) {
        return "full";
      }
      if (line.xMax <= midpoint + gutter && (line.xMin + line.xMax) / 2 < midpoint) {
        return "left";
      }
      if (line.xMin >= midpoint - gutter && (line.xMin + line.xMax) / 2 >= midpoint) {
        return "right";
      }
      return "full";
    }
    function hasTwoColumnLayout(lines, pageWidth) {
      const metrics = getLineLayoutMetrics(lines, pageWidth);
      const left = lines.filter((line) => classifyLine(line, pageWidth, metrics) === "left");
      const right = lines.filter((line) => classifyLine(line, pageWidth, metrics) === "right");
      if (left.length < 2 || right.length < 2) {
        return false;
      }
      const directionalCount = left.length + right.length;
      if (directionalCount < Math.max(4, Math.ceil(lines.length * 0.35))) {
        return false;
      }
      const leftTop = Math.max(...left.map((line) => line.y));
      const leftBottom = Math.min(...left.map((line) => line.y));
      const rightTop = Math.max(...right.map((line) => line.y));
      const rightBottom = Math.min(...right.map((line) => line.y));
      return Math.min(leftTop, rightTop) > Math.max(leftBottom, rightBottom);
    }
    function orderTwoColumnLines(lines, pageWidth) {
      const output = [];
      let band = [];
      const metrics = getLineLayoutMetrics(lines, pageWidth);
      const flushBand = () => {
        if (!band.length) {
          return;
        }
        const left = band.filter((line) => classifyLine(line, pageWidth, metrics) === "left").sort((a, b) => b.y - a.y);
        const right = band.filter((line) => classifyLine(line, pageWidth, metrics) === "right").sort((a, b) => b.y - a.y);
        const columnsOverlap = left.length && right.length && Math.min(left[0].y, right[0].y) > Math.max(left[left.length - 1].y, right[right.length - 1].y);
        if (columnsOverlap) {
          output.push(...left, ...right);
        } else {
          output.push(...band.slice().sort((a, b) => b.y - a.y || a.xMin - b.xMin));
        }
        band = [];
      };
      for (const line of lines) {
        if (classifyLine(line, pageWidth, metrics) === "full") {
          flushBand();
          output.push(line);
        } else {
          band.push(line);
        }
      }
      flushBand();
      return output;
    }
    function extractPdfTextLayout2(items, options = {}) {
      const textItems = (Array.isArray(items) ? items : []).filter((item) => item && typeof item.str === "string" && item.str.trim());
      const positionedCount = textItems.filter((item) => normalizePositionedItem(item)).length;
      const viewportWidth = Number(options.viewport && options.viewport.width);
      const viewportHeight = Number(options.viewport && options.viewport.height);
      if (positionedCount < Math.max(2, Math.ceil(textItems.length * 0.7))) {
        return {
          lines: [],
          pageHeight: Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0,
          pageWidth: Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0,
          text: extractTextInItemOrder(items),
          twoColumn: false
        };
      }
      const positionedItems = textItems.map(normalizePositionedItem).filter(Boolean);
      const requestedPageWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : Math.max(...positionedItems.map((item) => item.x + item.width), 1);
      const candidateLines = groupItemsIntoLines(items, requestedPageWidth, { splitColumns: true });
      if (!candidateLines.length) {
        return {
          lines: [],
          pageHeight: Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0,
          pageWidth: requestedPageWidth,
          text: extractTextInItemOrder(items),
          twoColumn: false
        };
      }
      const pageWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : Math.max(...candidateLines.map((line) => line.xMax), 1);
      const twoColumn = hasTwoColumnLayout(candidateLines, pageWidth);
      const lines = twoColumn ? candidateLines : groupItemsIntoLines(items, requestedPageWidth, { splitColumns: false });
      const ordered = twoColumn ? orderTwoColumnLines(lines, pageWidth) : lines;
      return {
        lines: ordered.map((line) => ({ ...line })),
        pageHeight: Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0,
        pageWidth,
        text: cleanupExtractedText(ordered.map((line) => line.text)),
        twoColumn
      };
    }
    function extractTextFromPdfItems2(items, options = {}) {
      return extractPdfTextLayout2(items, options).text;
    }
    module2.exports = {
      extractPdfTextLayout: extractPdfTextLayout2,
      extractTextFromPdfItems: extractTextFromPdfItems2,
      extractTextInItemOrder,
      groupItemsIntoLines,
      hasTwoColumnLayout,
      orderTwoColumnLines
    };
  }
});

// src/pdf-layout.js
var require_pdf_layout2 = __commonJS({
  "src/pdf-layout.js"(exports2, module2) {
    "use strict";
    module2.exports = require_pdf_layout();
  }
});

// node_modules/entities/dist/commonjs/generated/decode-data-html.js
var require_decode_data_html = __commonJS({
  "node_modules/entities/dist/commonjs/generated/decode-data-html.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.htmlDecodeTree = void 0;
    exports2.htmlDecodeTree = new Uint16Array(
      // prettier-ignore
      /* @__PURE__ */ '\u1D41<\xD5\u0131\u028A\u049D\u057B\u05D0\u0675\u06DE\u07A2\u07D6\u080F\u0A4A\u0A91\u0DA1\u0E6D\u0F09\u0F26\u10CA\u1228\u12E1\u1415\u149D\u14C3\u14DF\u1525\0\0\0\0\0\0\u156B\u16CD\u198D\u1C12\u1DDD\u1F7E\u2060\u21B0\u228D\u23C0\u23FB\u2442\u2824\u2912\u2D08\u2E48\u2FCE\u3016\u32BA\u3639\u37AC\u38FE\u3A28\u3A71\u3AE0\u3B2E\u0800EMabcfglmnoprstu\\bfms\x7F\x84\x8B\x90\x95\x98\xA6\xB3\xB9\xC8\xCFlig\u803B\xC6\u40C6P\u803B&\u4026cute\u803B\xC1\u40C1reve;\u4102\u0100iyx}rc\u803B\xC2\u40C2;\u4410r;\uC000\u{1D504}rave\u803B\xC0\u40C0pha;\u4391acr;\u4100d;\u6A53\u0100gp\x9D\xA1on;\u4104f;\uC000\u{1D538}plyFunction;\u6061ing\u803B\xC5\u40C5\u0100cs\xBE\xC3r;\uC000\u{1D49C}ign;\u6254ilde\u803B\xC3\u40C3ml\u803B\xC4\u40C4\u0400aceforsu\xE5\xFB\xFE\u0117\u011C\u0122\u0127\u012A\u0100cr\xEA\xF2kslash;\u6216\u0176\xF6\xF8;\u6AE7ed;\u6306y;\u4411\u0180crt\u0105\u010B\u0114ause;\u6235noullis;\u612Ca;\u4392r;\uC000\u{1D505}pf;\uC000\u{1D539}eve;\u42D8c\xF2\u0113mpeq;\u624E\u0700HOacdefhilorsu\u014D\u0151\u0156\u0180\u019E\u01A2\u01B5\u01B7\u01BA\u01DC\u0215\u0273\u0278\u027Ecy;\u4427PY\u803B\xA9\u40A9\u0180cpy\u015D\u0162\u017Aute;\u4106\u0100;i\u0167\u0168\u62D2talDifferentialD;\u6145leys;\u612D\u0200aeio\u0189\u018E\u0194\u0198ron;\u410Cdil\u803B\xC7\u40C7rc;\u4108nint;\u6230ot;\u410A\u0100dn\u01A7\u01ADilla;\u40B8terDot;\u40B7\xF2\u017Fi;\u43A7rcle\u0200DMPT\u01C7\u01CB\u01D1\u01D6ot;\u6299inus;\u6296lus;\u6295imes;\u6297o\u0100cs\u01E2\u01F8kwiseContourIntegral;\u6232eCurly\u0100DQ\u0203\u020FoubleQuote;\u601Duote;\u6019\u0200lnpu\u021E\u0228\u0247\u0255on\u0100;e\u0225\u0226\u6237;\u6A74\u0180git\u022F\u0236\u023Aruent;\u6261nt;\u622FourIntegral;\u622E\u0100fr\u024C\u024E;\u6102oduct;\u6210nterClockwiseContourIntegral;\u6233oss;\u6A2Fcr;\uC000\u{1D49E}p\u0100;C\u0284\u0285\u62D3ap;\u624D\u0580DJSZacefios\u02A0\u02AC\u02B0\u02B4\u02B8\u02CB\u02D7\u02E1\u02E6\u0333\u048D\u0100;o\u0179\u02A5trahd;\u6911cy;\u4402cy;\u4405cy;\u440F\u0180grs\u02BF\u02C4\u02C7ger;\u6021r;\u61A1hv;\u6AE4\u0100ay\u02D0\u02D5ron;\u410E;\u4414l\u0100;t\u02DD\u02DE\u6207a;\u4394r;\uC000\u{1D507}\u0100af\u02EB\u0327\u0100cm\u02F0\u0322ritical\u0200ADGT\u0300\u0306\u0316\u031Ccute;\u40B4o\u0174\u030B\u030D;\u42D9bleAcute;\u42DDrave;\u4060ilde;\u42DCond;\u62C4ferentialD;\u6146\u0470\u033D\0\0\0\u0342\u0354\0\u0405f;\uC000\u{1D53B}\u0180;DE\u0348\u0349\u034D\u40A8ot;\u60DCqual;\u6250ble\u0300CDLRUV\u0363\u0372\u0382\u03CF\u03E2\u03F8ontourIntegra\xEC\u0239o\u0274\u0379\0\0\u037B\xBB\u0349nArrow;\u61D3\u0100eo\u0387\u03A4ft\u0180ART\u0390\u0396\u03A1rrow;\u61D0ightArrow;\u61D4e\xE5\u02CAng\u0100LR\u03AB\u03C4eft\u0100AR\u03B3\u03B9rrow;\u67F8ightArrow;\u67FAightArrow;\u67F9ight\u0100AT\u03D8\u03DErrow;\u61D2ee;\u62A8p\u0241\u03E9\0\0\u03EFrrow;\u61D1ownArrow;\u61D5erticalBar;\u6225n\u0300ABLRTa\u0412\u042A\u0430\u045E\u047F\u037Crrow\u0180;BU\u041D\u041E\u0422\u6193ar;\u6913pArrow;\u61F5reve;\u4311eft\u02D2\u043A\0\u0446\0\u0450ightVector;\u6950eeVector;\u695Eector\u0100;B\u0459\u045A\u61BDar;\u6956ight\u01D4\u0467\0\u0471eeVector;\u695Fector\u0100;B\u047A\u047B\u61C1ar;\u6957ee\u0100;A\u0486\u0487\u62A4rrow;\u61A7\u0100ct\u0492\u0497r;\uC000\u{1D49F}rok;\u4110\u0800NTacdfglmopqstux\u04BD\u04C0\u04C4\u04CB\u04DE\u04E2\u04E7\u04EE\u04F5\u0521\u052F\u0536\u0552\u055D\u0560\u0565G;\u414AH\u803B\xD0\u40D0cute\u803B\xC9\u40C9\u0180aiy\u04D2\u04D7\u04DCron;\u411Arc\u803B\xCA\u40CA;\u442Dot;\u4116r;\uC000\u{1D508}rave\u803B\xC8\u40C8ement;\u6208\u0100ap\u04FA\u04FEcr;\u4112ty\u0253\u0506\0\0\u0512mallSquare;\u65FBerySmallSquare;\u65AB\u0100gp\u0526\u052Aon;\u4118f;\uC000\u{1D53C}silon;\u4395u\u0100ai\u053C\u0549l\u0100;T\u0542\u0543\u6A75ilde;\u6242librium;\u61CC\u0100ci\u0557\u055Ar;\u6130m;\u6A73a;\u4397ml\u803B\xCB\u40CB\u0100ip\u056A\u056Fsts;\u6203onentialE;\u6147\u0280cfios\u0585\u0588\u058D\u05B2\u05CCy;\u4424r;\uC000\u{1D509}lled\u0253\u0597\0\0\u05A3mallSquare;\u65FCerySmallSquare;\u65AA\u0370\u05BA\0\u05BF\0\0\u05C4f;\uC000\u{1D53D}All;\u6200riertrf;\u6131c\xF2\u05CB\u0600JTabcdfgorst\u05E8\u05EC\u05EF\u05FA\u0600\u0612\u0616\u061B\u061D\u0623\u066C\u0672cy;\u4403\u803B>\u403Emma\u0100;d\u05F7\u05F8\u4393;\u43DCreve;\u411E\u0180eiy\u0607\u060C\u0610dil;\u4122rc;\u411C;\u4413ot;\u4120r;\uC000\u{1D50A};\u62D9pf;\uC000\u{1D53E}eater\u0300EFGLST\u0635\u0644\u064E\u0656\u065B\u0666qual\u0100;L\u063E\u063F\u6265ess;\u62DBullEqual;\u6267reater;\u6AA2ess;\u6277lantEqual;\u6A7Eilde;\u6273cr;\uC000\u{1D4A2};\u626B\u0400Aacfiosu\u0685\u068B\u0696\u069B\u069E\u06AA\u06BE\u06CARDcy;\u442A\u0100ct\u0690\u0694ek;\u42C7;\u405Eirc;\u4124r;\u610ClbertSpace;\u610B\u01F0\u06AF\0\u06B2f;\u610DizontalLine;\u6500\u0100ct\u06C3\u06C5\xF2\u06A9rok;\u4126mp\u0144\u06D0\u06D8ownHum\xF0\u012Fqual;\u624F\u0700EJOacdfgmnostu\u06FA\u06FE\u0703\u0707\u070E\u071A\u071E\u0721\u0728\u0744\u0778\u078B\u078F\u0795cy;\u4415lig;\u4132cy;\u4401cute\u803B\xCD\u40CD\u0100iy\u0713\u0718rc\u803B\xCE\u40CE;\u4418ot;\u4130r;\u6111rave\u803B\xCC\u40CC\u0180;ap\u0720\u072F\u073F\u0100cg\u0734\u0737r;\u412AinaryI;\u6148lie\xF3\u03DD\u01F4\u0749\0\u0762\u0100;e\u074D\u074E\u622C\u0100gr\u0753\u0758ral;\u622Bsection;\u62C2isible\u0100CT\u076C\u0772omma;\u6063imes;\u6062\u0180gpt\u077F\u0783\u0788on;\u412Ef;\uC000\u{1D540}a;\u4399cr;\u6110ilde;\u4128\u01EB\u079A\0\u079Ecy;\u4406l\u803B\xCF\u40CF\u0280cfosu\u07AC\u07B7\u07BC\u07C2\u07D0\u0100iy\u07B1\u07B5rc;\u4134;\u4419r;\uC000\u{1D50D}pf;\uC000\u{1D541}\u01E3\u07C7\0\u07CCr;\uC000\u{1D4A5}rcy;\u4408kcy;\u4404\u0380HJacfos\u07E4\u07E8\u07EC\u07F1\u07FD\u0802\u0808cy;\u4425cy;\u440Cppa;\u439A\u0100ey\u07F6\u07FBdil;\u4136;\u441Ar;\uC000\u{1D50E}pf;\uC000\u{1D542}cr;\uC000\u{1D4A6}\u0580JTaceflmost\u0825\u0829\u082C\u0850\u0863\u09B3\u09B8\u09C7\u09CD\u0A37\u0A47cy;\u4409\u803B<\u403C\u0280cmnpr\u0837\u083C\u0841\u0844\u084Dute;\u4139bda;\u439Bg;\u67EAlacetrf;\u6112r;\u619E\u0180aey\u0857\u085C\u0861ron;\u413Ddil;\u413B;\u441B\u0100fs\u0868\u0970t\u0500ACDFRTUVar\u087E\u08A9\u08B1\u08E0\u08E6\u08FC\u092F\u095B\u0390\u096A\u0100nr\u0883\u088FgleBracket;\u67E8row\u0180;BR\u0899\u089A\u089E\u6190ar;\u61E4ightArrow;\u61C6eiling;\u6308o\u01F5\u08B7\0\u08C3bleBracket;\u67E6n\u01D4\u08C8\0\u08D2eeVector;\u6961ector\u0100;B\u08DB\u08DC\u61C3ar;\u6959loor;\u630Aight\u0100AV\u08EF\u08F5rrow;\u6194ector;\u694E\u0100er\u0901\u0917e\u0180;AV\u0909\u090A\u0910\u62A3rrow;\u61A4ector;\u695Aiangle\u0180;BE\u0924\u0925\u0929\u62B2ar;\u69CFqual;\u62B4p\u0180DTV\u0937\u0942\u094CownVector;\u6951eeVector;\u6960ector\u0100;B\u0956\u0957\u61BFar;\u6958ector\u0100;B\u0965\u0966\u61BCar;\u6952ight\xE1\u039Cs\u0300EFGLST\u097E\u098B\u0995\u099D\u09A2\u09ADqualGreater;\u62DAullEqual;\u6266reater;\u6276ess;\u6AA1lantEqual;\u6A7Dilde;\u6272r;\uC000\u{1D50F}\u0100;e\u09BD\u09BE\u62D8ftarrow;\u61DAidot;\u413F\u0180npw\u09D4\u0A16\u0A1Bg\u0200LRlr\u09DE\u09F7\u0A02\u0A10eft\u0100AR\u09E6\u09ECrrow;\u67F5ightArrow;\u67F7ightArrow;\u67F6eft\u0100ar\u03B3\u0A0Aight\xE1\u03BFight\xE1\u03CAf;\uC000\u{1D543}er\u0100LR\u0A22\u0A2CeftArrow;\u6199ightArrow;\u6198\u0180cht\u0A3E\u0A40\u0A42\xF2\u084C;\u61B0rok;\u4141;\u626A\u0400acefiosu\u0A5A\u0A5D\u0A60\u0A77\u0A7C\u0A85\u0A8B\u0A8Ep;\u6905y;\u441C\u0100dl\u0A65\u0A6FiumSpace;\u605Flintrf;\u6133r;\uC000\u{1D510}nusPlus;\u6213pf;\uC000\u{1D544}c\xF2\u0A76;\u439C\u0480Jacefostu\u0AA3\u0AA7\u0AAD\u0AC0\u0B14\u0B19\u0D91\u0D97\u0D9Ecy;\u440Acute;\u4143\u0180aey\u0AB4\u0AB9\u0ABEron;\u4147dil;\u4145;\u441D\u0180gsw\u0AC7\u0AF0\u0B0Eative\u0180MTV\u0AD3\u0ADF\u0AE8ediumSpace;\u600Bhi\u0100cn\u0AE6\u0AD8\xEB\u0AD9eryThi\xEE\u0AD9ted\u0100GL\u0AF8\u0B06reaterGreate\xF2\u0673essLes\xF3\u0A48Line;\u400Ar;\uC000\u{1D511}\u0200Bnpt\u0B22\u0B28\u0B37\u0B3Areak;\u6060BreakingSpace;\u40A0f;\u6115\u0680;CDEGHLNPRSTV\u0B55\u0B56\u0B6A\u0B7C\u0BA1\u0BEB\u0C04\u0C5E\u0C84\u0CA6\u0CD8\u0D61\u0D85\u6AEC\u0100ou\u0B5B\u0B64ngruent;\u6262pCap;\u626DoubleVerticalBar;\u6226\u0180lqx\u0B83\u0B8A\u0B9Bement;\u6209ual\u0100;T\u0B92\u0B93\u6260ilde;\uC000\u2242\u0338ists;\u6204reater\u0380;EFGLST\u0BB6\u0BB7\u0BBD\u0BC9\u0BD3\u0BD8\u0BE5\u626Fqual;\u6271ullEqual;\uC000\u2267\u0338reater;\uC000\u226B\u0338ess;\u6279lantEqual;\uC000\u2A7E\u0338ilde;\u6275ump\u0144\u0BF2\u0BFDownHump;\uC000\u224E\u0338qual;\uC000\u224F\u0338e\u0100fs\u0C0A\u0C27tTriangle\u0180;BE\u0C1A\u0C1B\u0C21\u62EAar;\uC000\u29CF\u0338qual;\u62ECs\u0300;EGLST\u0C35\u0C36\u0C3C\u0C44\u0C4B\u0C58\u626Equal;\u6270reater;\u6278ess;\uC000\u226A\u0338lantEqual;\uC000\u2A7D\u0338ilde;\u6274ested\u0100GL\u0C68\u0C79reaterGreater;\uC000\u2AA2\u0338essLess;\uC000\u2AA1\u0338recedes\u0180;ES\u0C92\u0C93\u0C9B\u6280qual;\uC000\u2AAF\u0338lantEqual;\u62E0\u0100ei\u0CAB\u0CB9verseElement;\u620CghtTriangle\u0180;BE\u0CCB\u0CCC\u0CD2\u62EBar;\uC000\u29D0\u0338qual;\u62ED\u0100qu\u0CDD\u0D0CuareSu\u0100bp\u0CE8\u0CF9set\u0100;E\u0CF0\u0CF3\uC000\u228F\u0338qual;\u62E2erset\u0100;E\u0D03\u0D06\uC000\u2290\u0338qual;\u62E3\u0180bcp\u0D13\u0D24\u0D4Eset\u0100;E\u0D1B\u0D1E\uC000\u2282\u20D2qual;\u6288ceeds\u0200;EST\u0D32\u0D33\u0D3B\u0D46\u6281qual;\uC000\u2AB0\u0338lantEqual;\u62E1ilde;\uC000\u227F\u0338erset\u0100;E\u0D58\u0D5B\uC000\u2283\u20D2qual;\u6289ilde\u0200;EFT\u0D6E\u0D6F\u0D75\u0D7F\u6241qual;\u6244ullEqual;\u6247ilde;\u6249erticalBar;\u6224cr;\uC000\u{1D4A9}ilde\u803B\xD1\u40D1;\u439D\u0700Eacdfgmoprstuv\u0DBD\u0DC2\u0DC9\u0DD5\u0DDB\u0DE0\u0DE7\u0DFC\u0E02\u0E20\u0E22\u0E32\u0E3F\u0E44lig;\u4152cute\u803B\xD3\u40D3\u0100iy\u0DCE\u0DD3rc\u803B\xD4\u40D4;\u441Eblac;\u4150r;\uC000\u{1D512}rave\u803B\xD2\u40D2\u0180aei\u0DEE\u0DF2\u0DF6cr;\u414Cga;\u43A9cron;\u439Fpf;\uC000\u{1D546}enCurly\u0100DQ\u0E0E\u0E1AoubleQuote;\u601Cuote;\u6018;\u6A54\u0100cl\u0E27\u0E2Cr;\uC000\u{1D4AA}ash\u803B\xD8\u40D8i\u016C\u0E37\u0E3Cde\u803B\xD5\u40D5es;\u6A37ml\u803B\xD6\u40D6er\u0100BP\u0E4B\u0E60\u0100ar\u0E50\u0E53r;\u603Eac\u0100ek\u0E5A\u0E5C;\u63DEet;\u63B4arenthesis;\u63DC\u0480acfhilors\u0E7F\u0E87\u0E8A\u0E8F\u0E92\u0E94\u0E9D\u0EB0\u0EFCrtialD;\u6202y;\u441Fr;\uC000\u{1D513}i;\u43A6;\u43A0usMinus;\u40B1\u0100ip\u0EA2\u0EADncareplan\xE5\u069Df;\u6119\u0200;eio\u0EB9\u0EBA\u0EE0\u0EE4\u6ABBcedes\u0200;EST\u0EC8\u0EC9\u0ECF\u0EDA\u627Aqual;\u6AAFlantEqual;\u627Cilde;\u627Eme;\u6033\u0100dp\u0EE9\u0EEEuct;\u620Fortion\u0100;a\u0225\u0EF9l;\u621D\u0100ci\u0F01\u0F06r;\uC000\u{1D4AB};\u43A8\u0200Ufos\u0F11\u0F16\u0F1B\u0F1FOT\u803B"\u4022r;\uC000\u{1D514}pf;\u611Acr;\uC000\u{1D4AC}\u0600BEacefhiorsu\u0F3E\u0F43\u0F47\u0F60\u0F73\u0FA7\u0FAA\u0FAD\u1096\u10A9\u10B4\u10BEarr;\u6910G\u803B\xAE\u40AE\u0180cnr\u0F4E\u0F53\u0F56ute;\u4154g;\u67EBr\u0100;t\u0F5C\u0F5D\u61A0l;\u6916\u0180aey\u0F67\u0F6C\u0F71ron;\u4158dil;\u4156;\u4420\u0100;v\u0F78\u0F79\u611Cerse\u0100EU\u0F82\u0F99\u0100lq\u0F87\u0F8Eement;\u620Builibrium;\u61CBpEquilibrium;\u696Fr\xBB\u0F79o;\u43A1ght\u0400ACDFTUVa\u0FC1\u0FEB\u0FF3\u1022\u1028\u105B\u1087\u03D8\u0100nr\u0FC6\u0FD2gleBracket;\u67E9row\u0180;BL\u0FDC\u0FDD\u0FE1\u6192ar;\u61E5eftArrow;\u61C4eiling;\u6309o\u01F5\u0FF9\0\u1005bleBracket;\u67E7n\u01D4\u100A\0\u1014eeVector;\u695Dector\u0100;B\u101D\u101E\u61C2ar;\u6955loor;\u630B\u0100er\u102D\u1043e\u0180;AV\u1035\u1036\u103C\u62A2rrow;\u61A6ector;\u695Biangle\u0180;BE\u1050\u1051\u1055\u62B3ar;\u69D0qual;\u62B5p\u0180DTV\u1063\u106E\u1078ownVector;\u694FeeVector;\u695Cector\u0100;B\u1082\u1083\u61BEar;\u6954ector\u0100;B\u1091\u1092\u61C0ar;\u6953\u0100pu\u109B\u109Ef;\u611DndImplies;\u6970ightarrow;\u61DB\u0100ch\u10B9\u10BCr;\u611B;\u61B1leDelayed;\u69F4\u0680HOacfhimoqstu\u10E4\u10F1\u10F7\u10FD\u1119\u111E\u1151\u1156\u1161\u1167\u11B5\u11BB\u11BF\u0100Cc\u10E9\u10EEHcy;\u4429y;\u4428FTcy;\u442Ccute;\u415A\u0280;aeiy\u1108\u1109\u110E\u1113\u1117\u6ABCron;\u4160dil;\u415Erc;\u415C;\u4421r;\uC000\u{1D516}ort\u0200DLRU\u112A\u1134\u113E\u1149ownArrow\xBB\u041EeftArrow\xBB\u089AightArrow\xBB\u0FDDpArrow;\u6191gma;\u43A3allCircle;\u6218pf;\uC000\u{1D54A}\u0272\u116D\0\0\u1170t;\u621Aare\u0200;ISU\u117B\u117C\u1189\u11AF\u65A1ntersection;\u6293u\u0100bp\u118F\u119Eset\u0100;E\u1197\u1198\u628Fqual;\u6291erset\u0100;E\u11A8\u11A9\u6290qual;\u6292nion;\u6294cr;\uC000\u{1D4AE}ar;\u62C6\u0200bcmp\u11C8\u11DB\u1209\u120B\u0100;s\u11CD\u11CE\u62D0et\u0100;E\u11CD\u11D5qual;\u6286\u0100ch\u11E0\u1205eeds\u0200;EST\u11ED\u11EE\u11F4\u11FF\u627Bqual;\u6AB0lantEqual;\u627Dilde;\u627FTh\xE1\u0F8C;\u6211\u0180;es\u1212\u1213\u1223\u62D1rset\u0100;E\u121C\u121D\u6283qual;\u6287et\xBB\u1213\u0580HRSacfhiors\u123E\u1244\u1249\u1255\u125E\u1271\u1276\u129F\u12C2\u12C8\u12D1ORN\u803B\xDE\u40DEADE;\u6122\u0100Hc\u124E\u1252cy;\u440By;\u4426\u0100bu\u125A\u125C;\u4009;\u43A4\u0180aey\u1265\u126A\u126Fron;\u4164dil;\u4162;\u4422r;\uC000\u{1D517}\u0100ei\u127B\u1289\u01F2\u1280\0\u1287efore;\u6234a;\u4398\u0100cn\u128E\u1298kSpace;\uC000\u205F\u200ASpace;\u6009lde\u0200;EFT\u12AB\u12AC\u12B2\u12BC\u623Cqual;\u6243ullEqual;\u6245ilde;\u6248pf;\uC000\u{1D54B}ipleDot;\u60DB\u0100ct\u12D6\u12DBr;\uC000\u{1D4AF}rok;\u4166\u0AE1\u12F7\u130E\u131A\u1326\0\u132C\u1331\0\0\0\0\0\u1338\u133D\u1377\u1385\0\u13FF\u1404\u140A\u1410\u0100cr\u12FB\u1301ute\u803B\xDA\u40DAr\u0100;o\u1307\u1308\u619Fcir;\u6949r\u01E3\u1313\0\u1316y;\u440Eve;\u416C\u0100iy\u131E\u1323rc\u803B\xDB\u40DB;\u4423blac;\u4170r;\uC000\u{1D518}rave\u803B\xD9\u40D9acr;\u416A\u0100di\u1341\u1369er\u0100BP\u1348\u135D\u0100ar\u134D\u1350r;\u405Fac\u0100ek\u1357\u1359;\u63DFet;\u63B5arenthesis;\u63DDon\u0100;P\u1370\u1371\u62C3lus;\u628E\u0100gp\u137B\u137Fon;\u4172f;\uC000\u{1D54C}\u0400ADETadps\u1395\u13AE\u13B8\u13C4\u03E8\u13D2\u13D7\u13F3rrow\u0180;BD\u1150\u13A0\u13A4ar;\u6912ownArrow;\u61C5ownArrow;\u6195quilibrium;\u696Eee\u0100;A\u13CB\u13CC\u62A5rrow;\u61A5own\xE1\u03F3er\u0100LR\u13DE\u13E8eftArrow;\u6196ightArrow;\u6197i\u0100;l\u13F9\u13FA\u43D2on;\u43A5ing;\u416Ecr;\uC000\u{1D4B0}ilde;\u4168ml\u803B\xDC\u40DC\u0480Dbcdefosv\u1427\u142C\u1430\u1433\u143E\u1485\u148A\u1490\u1496ash;\u62ABar;\u6AEBy;\u4412ash\u0100;l\u143B\u143C\u62A9;\u6AE6\u0100er\u1443\u1445;\u62C1\u0180bty\u144C\u1450\u147Aar;\u6016\u0100;i\u144F\u1455cal\u0200BLST\u1461\u1465\u146A\u1474ar;\u6223ine;\u407Ceparator;\u6758ilde;\u6240ThinSpace;\u600Ar;\uC000\u{1D519}pf;\uC000\u{1D54D}cr;\uC000\u{1D4B1}dash;\u62AA\u0280cefos\u14A7\u14AC\u14B1\u14B6\u14BCirc;\u4174dge;\u62C0r;\uC000\u{1D51A}pf;\uC000\u{1D54E}cr;\uC000\u{1D4B2}\u0200fios\u14CB\u14D0\u14D2\u14D8r;\uC000\u{1D51B};\u439Epf;\uC000\u{1D54F}cr;\uC000\u{1D4B3}\u0480AIUacfosu\u14F1\u14F5\u14F9\u14FD\u1504\u150F\u1514\u151A\u1520cy;\u442Fcy;\u4407cy;\u442Ecute\u803B\xDD\u40DD\u0100iy\u1509\u150Drc;\u4176;\u442Br;\uC000\u{1D51C}pf;\uC000\u{1D550}cr;\uC000\u{1D4B4}ml;\u4178\u0400Hacdefos\u1535\u1539\u153F\u154B\u154F\u155D\u1560\u1564cy;\u4416cute;\u4179\u0100ay\u1544\u1549ron;\u417D;\u4417ot;\u417B\u01F2\u1554\0\u155BoWidt\xE8\u0AD9a;\u4396r;\u6128pf;\u6124cr;\uC000\u{1D4B5}\u0BE1\u1583\u158A\u1590\0\u15B0\u15B6\u15BF\0\0\0\0\u15C6\u15DB\u15EB\u165F\u166D\0\u1695\u169B\u16B2\u16B9\0\u16BEcute\u803B\xE1\u40E1reve;\u4103\u0300;Ediuy\u159C\u159D\u15A1\u15A3\u15A8\u15AD\u623E;\uC000\u223E\u0333;\u623Frc\u803B\xE2\u40E2te\u80BB\xB4\u0306;\u4430lig\u803B\xE6\u40E6\u0100;r\xB2\u15BA;\uC000\u{1D51E}rave\u803B\xE0\u40E0\u0100ep\u15CA\u15D6\u0100fp\u15CF\u15D4sym;\u6135\xE8\u15D3ha;\u43B1\u0100ap\u15DFc\u0100cl\u15E4\u15E7r;\u4101g;\u6A3F\u0264\u15F0\0\0\u160A\u0280;adsv\u15FA\u15FB\u15FF\u1601\u1607\u6227nd;\u6A55;\u6A5Clope;\u6A58;\u6A5A\u0380;elmrsz\u1618\u1619\u161B\u161E\u163F\u164F\u1659\u6220;\u69A4e\xBB\u1619sd\u0100;a\u1625\u1626\u6221\u0461\u1630\u1632\u1634\u1636\u1638\u163A\u163C\u163E;\u69A8;\u69A9;\u69AA;\u69AB;\u69AC;\u69AD;\u69AE;\u69AFt\u0100;v\u1645\u1646\u621Fb\u0100;d\u164C\u164D\u62BE;\u699D\u0100pt\u1654\u1657h;\u6222\xBB\xB9arr;\u637C\u0100gp\u1663\u1667on;\u4105f;\uC000\u{1D552}\u0380;Eaeiop\u12C1\u167B\u167D\u1682\u1684\u1687\u168A;\u6A70cir;\u6A6F;\u624Ad;\u624Bs;\u4027rox\u0100;e\u12C1\u1692\xF1\u1683ing\u803B\xE5\u40E5\u0180cty\u16A1\u16A6\u16A8r;\uC000\u{1D4B6};\u402Amp\u0100;e\u12C1\u16AF\xF1\u0288ilde\u803B\xE3\u40E3ml\u803B\xE4\u40E4\u0100ci\u16C2\u16C8onin\xF4\u0272nt;\u6A11\u0800Nabcdefiklnoprsu\u16ED\u16F1\u1730\u173C\u1743\u1748\u1778\u177D\u17E0\u17E6\u1839\u1850\u170D\u193D\u1948\u1970ot;\u6AED\u0100cr\u16F6\u171Ek\u0200ceps\u1700\u1705\u170D\u1713ong;\u624Cpsilon;\u43F6rime;\u6035im\u0100;e\u171A\u171B\u623Dq;\u62CD\u0176\u1722\u1726ee;\u62BDed\u0100;g\u172C\u172D\u6305e\xBB\u172Drk\u0100;t\u135C\u1737brk;\u63B6\u0100oy\u1701\u1741;\u4431quo;\u601E\u0280cmprt\u1753\u175B\u1761\u1764\u1768aus\u0100;e\u010A\u0109ptyv;\u69B0s\xE9\u170Cno\xF5\u0113\u0180ahw\u176F\u1771\u1773;\u43B2;\u6136een;\u626Cr;\uC000\u{1D51F}g\u0380costuvw\u178D\u179D\u17B3\u17C1\u17D5\u17DB\u17DE\u0180aiu\u1794\u1796\u179A\xF0\u0760rc;\u65EFp\xBB\u1371\u0180dpt\u17A4\u17A8\u17ADot;\u6A00lus;\u6A01imes;\u6A02\u0271\u17B9\0\0\u17BEcup;\u6A06ar;\u6605riangle\u0100du\u17CD\u17D2own;\u65BDp;\u65B3plus;\u6A04e\xE5\u1444\xE5\u14ADarow;\u690D\u0180ako\u17ED\u1826\u1835\u0100cn\u17F2\u1823k\u0180lst\u17FA\u05AB\u1802ozenge;\u69EBriangle\u0200;dlr\u1812\u1813\u1818\u181D\u65B4own;\u65BEeft;\u65C2ight;\u65B8k;\u6423\u01B1\u182B\0\u1833\u01B2\u182F\0\u1831;\u6592;\u65914;\u6593ck;\u6588\u0100eo\u183E\u184D\u0100;q\u1843\u1846\uC000=\u20E5uiv;\uC000\u2261\u20E5t;\u6310\u0200ptwx\u1859\u185E\u1867\u186Cf;\uC000\u{1D553}\u0100;t\u13CB\u1863om\xBB\u13CCtie;\u62C8\u0600DHUVbdhmptuv\u1885\u1896\u18AA\u18BB\u18D7\u18DB\u18EC\u18FF\u1905\u190A\u1910\u1921\u0200LRlr\u188E\u1890\u1892\u1894;\u6557;\u6554;\u6556;\u6553\u0280;DUdu\u18A1\u18A2\u18A4\u18A6\u18A8\u6550;\u6566;\u6569;\u6564;\u6567\u0200LRlr\u18B3\u18B5\u18B7\u18B9;\u655D;\u655A;\u655C;\u6559\u0380;HLRhlr\u18CA\u18CB\u18CD\u18CF\u18D1\u18D3\u18D5\u6551;\u656C;\u6563;\u6560;\u656B;\u6562;\u655Fox;\u69C9\u0200LRlr\u18E4\u18E6\u18E8\u18EA;\u6555;\u6552;\u6510;\u650C\u0280;DUdu\u06BD\u18F7\u18F9\u18FB\u18FD;\u6565;\u6568;\u652C;\u6534inus;\u629Flus;\u629Eimes;\u62A0\u0200LRlr\u1919\u191B\u191D\u191F;\u655B;\u6558;\u6518;\u6514\u0380;HLRhlr\u1930\u1931\u1933\u1935\u1937\u1939\u193B\u6502;\u656A;\u6561;\u655E;\u653C;\u6524;\u651C\u0100ev\u0123\u1942bar\u803B\xA6\u40A6\u0200ceio\u1951\u1956\u195A\u1960r;\uC000\u{1D4B7}mi;\u604Fm\u0100;e\u171A\u171Cl\u0180;bh\u1968\u1969\u196B\u405C;\u69C5sub;\u67C8\u016C\u1974\u197El\u0100;e\u1979\u197A\u6022t\xBB\u197Ap\u0180;Ee\u012F\u1985\u1987;\u6AAE\u0100;q\u06DC\u06DB\u0CE1\u19A7\0\u19E8\u1A11\u1A15\u1A32\0\u1A37\u1A50\0\0\u1AB4\0\0\u1AC1\0\0\u1B21\u1B2E\u1B4D\u1B52\0\u1BFD\0\u1C0C\u0180cpr\u19AD\u19B2\u19DDute;\u4107\u0300;abcds\u19BF\u19C0\u19C4\u19CA\u19D5\u19D9\u6229nd;\u6A44rcup;\u6A49\u0100au\u19CF\u19D2p;\u6A4Bp;\u6A47ot;\u6A40;\uC000\u2229\uFE00\u0100eo\u19E2\u19E5t;\u6041\xEE\u0693\u0200aeiu\u19F0\u19FB\u1A01\u1A05\u01F0\u19F5\0\u19F8s;\u6A4Don;\u410Ddil\u803B\xE7\u40E7rc;\u4109ps\u0100;s\u1A0C\u1A0D\u6A4Cm;\u6A50ot;\u410B\u0180dmn\u1A1B\u1A20\u1A26il\u80BB\xB8\u01ADptyv;\u69B2t\u8100\xA2;e\u1A2D\u1A2E\u40A2r\xE4\u01B2r;\uC000\u{1D520}\u0180cei\u1A3D\u1A40\u1A4Dy;\u4447ck\u0100;m\u1A47\u1A48\u6713ark\xBB\u1A48;\u43C7r\u0380;Ecefms\u1A5F\u1A60\u1A62\u1A6B\u1AA4\u1AAA\u1AAE\u65CB;\u69C3\u0180;el\u1A69\u1A6A\u1A6D\u42C6q;\u6257e\u0261\u1A74\0\0\u1A88rrow\u0100lr\u1A7C\u1A81eft;\u61BAight;\u61BB\u0280RSacd\u1A92\u1A94\u1A96\u1A9A\u1A9F\xBB\u0F47;\u64C8st;\u629Birc;\u629Aash;\u629Dnint;\u6A10id;\u6AEFcir;\u69C2ubs\u0100;u\u1ABB\u1ABC\u6663it\xBB\u1ABC\u02EC\u1AC7\u1AD4\u1AFA\0\u1B0Aon\u0100;e\u1ACD\u1ACE\u403A\u0100;q\xC7\xC6\u026D\u1AD9\0\0\u1AE2a\u0100;t\u1ADE\u1ADF\u402C;\u4040\u0180;fl\u1AE8\u1AE9\u1AEB\u6201\xEE\u1160e\u0100mx\u1AF1\u1AF6ent\xBB\u1AE9e\xF3\u024D\u01E7\u1AFE\0\u1B07\u0100;d\u12BB\u1B02ot;\u6A6Dn\xF4\u0246\u0180fry\u1B10\u1B14\u1B17;\uC000\u{1D554}o\xE4\u0254\u8100\xA9;s\u0155\u1B1Dr;\u6117\u0100ao\u1B25\u1B29rr;\u61B5ss;\u6717\u0100cu\u1B32\u1B37r;\uC000\u{1D4B8}\u0100bp\u1B3C\u1B44\u0100;e\u1B41\u1B42\u6ACF;\u6AD1\u0100;e\u1B49\u1B4A\u6AD0;\u6AD2dot;\u62EF\u0380delprvw\u1B60\u1B6C\u1B77\u1B82\u1BAC\u1BD4\u1BF9arr\u0100lr\u1B68\u1B6A;\u6938;\u6935\u0270\u1B72\0\0\u1B75r;\u62DEc;\u62DFarr\u0100;p\u1B7F\u1B80\u61B6;\u693D\u0300;bcdos\u1B8F\u1B90\u1B96\u1BA1\u1BA5\u1BA8\u622Arcap;\u6A48\u0100au\u1B9B\u1B9Ep;\u6A46p;\u6A4Aot;\u628Dr;\u6A45;\uC000\u222A\uFE00\u0200alrv\u1BB5\u1BBF\u1BDE\u1BE3rr\u0100;m\u1BBC\u1BBD\u61B7;\u693Cy\u0180evw\u1BC7\u1BD4\u1BD8q\u0270\u1BCE\0\0\u1BD2re\xE3\u1B73u\xE3\u1B75ee;\u62CEedge;\u62CFen\u803B\xA4\u40A4earrow\u0100lr\u1BEE\u1BF3eft\xBB\u1B80ight\xBB\u1BBDe\xE4\u1BDD\u0100ci\u1C01\u1C07onin\xF4\u01F7nt;\u6231lcty;\u632D\u0980AHabcdefhijlorstuwz\u1C38\u1C3B\u1C3F\u1C5D\u1C69\u1C75\u1C8A\u1C9E\u1CAC\u1CB7\u1CFB\u1CFF\u1D0D\u1D7B\u1D91\u1DAB\u1DBB\u1DC6\u1DCDr\xF2\u0381ar;\u6965\u0200glrs\u1C48\u1C4D\u1C52\u1C54ger;\u6020eth;\u6138\xF2\u1133h\u0100;v\u1C5A\u1C5B\u6010\xBB\u090A\u016B\u1C61\u1C67arow;\u690Fa\xE3\u0315\u0100ay\u1C6E\u1C73ron;\u410F;\u4434\u0180;ao\u0332\u1C7C\u1C84\u0100gr\u02BF\u1C81r;\u61CAtseq;\u6A77\u0180glm\u1C91\u1C94\u1C98\u803B\xB0\u40B0ta;\u43B4ptyv;\u69B1\u0100ir\u1CA3\u1CA8sht;\u697F;\uC000\u{1D521}ar\u0100lr\u1CB3\u1CB5\xBB\u08DC\xBB\u101E\u0280aegsv\u1CC2\u0378\u1CD6\u1CDC\u1CE0m\u0180;os\u0326\u1CCA\u1CD4nd\u0100;s\u0326\u1CD1uit;\u6666amma;\u43DDin;\u62F2\u0180;io\u1CE7\u1CE8\u1CF8\u40F7de\u8100\xF7;o\u1CE7\u1CF0ntimes;\u62C7n\xF8\u1CF7cy;\u4452c\u026F\u1D06\0\0\u1D0Arn;\u631Eop;\u630D\u0280lptuw\u1D18\u1D1D\u1D22\u1D49\u1D55lar;\u4024f;\uC000\u{1D555}\u0280;emps\u030B\u1D2D\u1D37\u1D3D\u1D42q\u0100;d\u0352\u1D33ot;\u6251inus;\u6238lus;\u6214quare;\u62A1blebarwedg\xE5\xFAn\u0180adh\u112E\u1D5D\u1D67ownarrow\xF3\u1C83arpoon\u0100lr\u1D72\u1D76ef\xF4\u1CB4igh\xF4\u1CB6\u0162\u1D7F\u1D85karo\xF7\u0F42\u026F\u1D8A\0\0\u1D8Ern;\u631Fop;\u630C\u0180cot\u1D98\u1DA3\u1DA6\u0100ry\u1D9D\u1DA1;\uC000\u{1D4B9};\u4455l;\u69F6rok;\u4111\u0100dr\u1DB0\u1DB4ot;\u62F1i\u0100;f\u1DBA\u1816\u65BF\u0100ah\u1DC0\u1DC3r\xF2\u0429a\xF2\u0FA6angle;\u69A6\u0100ci\u1DD2\u1DD5y;\u445Fgrarr;\u67FF\u0900Dacdefglmnopqrstux\u1E01\u1E09\u1E19\u1E38\u0578\u1E3C\u1E49\u1E61\u1E7E\u1EA5\u1EAF\u1EBD\u1EE1\u1F2A\u1F37\u1F44\u1F4E\u1F5A\u0100Do\u1E06\u1D34o\xF4\u1C89\u0100cs\u1E0E\u1E14ute\u803B\xE9\u40E9ter;\u6A6E\u0200aioy\u1E22\u1E27\u1E31\u1E36ron;\u411Br\u0100;c\u1E2D\u1E2E\u6256\u803B\xEA\u40EAlon;\u6255;\u444Dot;\u4117\u0100Dr\u1E41\u1E45ot;\u6252;\uC000\u{1D522}\u0180;rs\u1E50\u1E51\u1E57\u6A9Aave\u803B\xE8\u40E8\u0100;d\u1E5C\u1E5D\u6A96ot;\u6A98\u0200;ils\u1E6A\u1E6B\u1E72\u1E74\u6A99nters;\u63E7;\u6113\u0100;d\u1E79\u1E7A\u6A95ot;\u6A97\u0180aps\u1E85\u1E89\u1E97cr;\u4113ty\u0180;sv\u1E92\u1E93\u1E95\u6205et\xBB\u1E93p\u01001;\u1E9D\u1EA4\u0133\u1EA1\u1EA3;\u6004;\u6005\u6003\u0100gs\u1EAA\u1EAC;\u414Bp;\u6002\u0100gp\u1EB4\u1EB8on;\u4119f;\uC000\u{1D556}\u0180als\u1EC4\u1ECE\u1ED2r\u0100;s\u1ECA\u1ECB\u62D5l;\u69E3us;\u6A71i\u0180;lv\u1EDA\u1EDB\u1EDF\u43B5on\xBB\u1EDB;\u43F5\u0200csuv\u1EEA\u1EF3\u1F0B\u1F23\u0100io\u1EEF\u1E31rc\xBB\u1E2E\u0269\u1EF9\0\0\u1EFB\xED\u0548ant\u0100gl\u1F02\u1F06tr\xBB\u1E5Dess\xBB\u1E7A\u0180aei\u1F12\u1F16\u1F1Als;\u403Dst;\u625Fv\u0100;D\u0235\u1F20D;\u6A78parsl;\u69E5\u0100Da\u1F2F\u1F33ot;\u6253rr;\u6971\u0180cdi\u1F3E\u1F41\u1EF8r;\u612Fo\xF4\u0352\u0100ah\u1F49\u1F4B;\u43B7\u803B\xF0\u40F0\u0100mr\u1F53\u1F57l\u803B\xEB\u40EBo;\u60AC\u0180cip\u1F61\u1F64\u1F67l;\u4021s\xF4\u056E\u0100eo\u1F6C\u1F74ctatio\xEE\u0559nential\xE5\u0579\u09E1\u1F92\0\u1F9E\0\u1FA1\u1FA7\0\0\u1FC6\u1FCC\0\u1FD3\0\u1FE6\u1FEA\u2000\0\u2008\u205Allingdotse\xF1\u1E44y;\u4444male;\u6640\u0180ilr\u1FAD\u1FB3\u1FC1lig;\u8000\uFB03\u0269\u1FB9\0\0\u1FBDg;\u8000\uFB00ig;\u8000\uFB04;\uC000\u{1D523}lig;\u8000\uFB01lig;\uC000fj\u0180alt\u1FD9\u1FDC\u1FE1t;\u666Dig;\u8000\uFB02ns;\u65B1of;\u4192\u01F0\u1FEE\0\u1FF3f;\uC000\u{1D557}\u0100ak\u05BF\u1FF7\u0100;v\u1FFC\u1FFD\u62D4;\u6AD9artint;\u6A0D\u0100ao\u200C\u2055\u0100cs\u2011\u2052\u03B1\u201A\u2030\u2038\u2045\u2048\0\u2050\u03B2\u2022\u2025\u2027\u202A\u202C\0\u202E\u803B\xBD\u40BD;\u6153\u803B\xBC\u40BC;\u6155;\u6159;\u615B\u01B3\u2034\0\u2036;\u6154;\u6156\u02B4\u203E\u2041\0\0\u2043\u803B\xBE\u40BE;\u6157;\u615C5;\u6158\u01B6\u204C\0\u204E;\u615A;\u615D8;\u615El;\u6044wn;\u6322cr;\uC000\u{1D4BB}\u0880Eabcdefgijlnorstv\u2082\u2089\u209F\u20A5\u20B0\u20B4\u20F0\u20F5\u20FA\u20FF\u2103\u2112\u2138\u0317\u213E\u2152\u219E\u0100;l\u064D\u2087;\u6A8C\u0180cmp\u2090\u2095\u209Dute;\u41F5ma\u0100;d\u209C\u1CDA\u43B3;\u6A86reve;\u411F\u0100iy\u20AA\u20AErc;\u411D;\u4433ot;\u4121\u0200;lqs\u063E\u0642\u20BD\u20C9\u0180;qs\u063E\u064C\u20C4lan\xF4\u0665\u0200;cdl\u0665\u20D2\u20D5\u20E5c;\u6AA9ot\u0100;o\u20DC\u20DD\u6A80\u0100;l\u20E2\u20E3\u6A82;\u6A84\u0100;e\u20EA\u20ED\uC000\u22DB\uFE00s;\u6A94r;\uC000\u{1D524}\u0100;g\u0673\u061Bmel;\u6137cy;\u4453\u0200;Eaj\u065A\u210C\u210E\u2110;\u6A92;\u6AA5;\u6AA4\u0200Eaes\u211B\u211D\u2129\u2134;\u6269p\u0100;p\u2123\u2124\u6A8Arox\xBB\u2124\u0100;q\u212E\u212F\u6A88\u0100;q\u212E\u211Bim;\u62E7pf;\uC000\u{1D558}\u0100ci\u2143\u2146r;\u610Am\u0180;el\u066B\u214E\u2150;\u6A8E;\u6A90\u8300>;cdlqr\u05EE\u2160\u216A\u216E\u2173\u2179\u0100ci\u2165\u2167;\u6AA7r;\u6A7Aot;\u62D7Par;\u6995uest;\u6A7C\u0280adels\u2184\u216A\u2190\u0656\u219B\u01F0\u2189\0\u218Epro\xF8\u209Er;\u6978q\u0100lq\u063F\u2196les\xF3\u2088i\xED\u066B\u0100en\u21A3\u21ADrtneqq;\uC000\u2269\uFE00\xC5\u21AA\u0500Aabcefkosy\u21C4\u21C7\u21F1\u21F5\u21FA\u2218\u221D\u222F\u2268\u227Dr\xF2\u03A0\u0200ilmr\u21D0\u21D4\u21D7\u21DBrs\xF0\u1484f\xBB\u2024il\xF4\u06A9\u0100dr\u21E0\u21E4cy;\u444A\u0180;cw\u08F4\u21EB\u21EFir;\u6948;\u61ADar;\u610Firc;\u4125\u0180alr\u2201\u220E\u2213rts\u0100;u\u2209\u220A\u6665it\xBB\u220Alip;\u6026con;\u62B9r;\uC000\u{1D525}s\u0100ew\u2223\u2229arow;\u6925arow;\u6926\u0280amopr\u223A\u223E\u2243\u225E\u2263rr;\u61FFtht;\u623Bk\u0100lr\u2249\u2253eftarrow;\u61A9ightarrow;\u61AAf;\uC000\u{1D559}bar;\u6015\u0180clt\u226F\u2274\u2278r;\uC000\u{1D4BD}as\xE8\u21F4rok;\u4127\u0100bp\u2282\u2287ull;\u6043hen\xBB\u1C5B\u0AE1\u22A3\0\u22AA\0\u22B8\u22C5\u22CE\0\u22D5\u22F3\0\0\u22F8\u2322\u2367\u2362\u237F\0\u2386\u23AA\u23B4cute\u803B\xED\u40ED\u0180;iy\u0771\u22B0\u22B5rc\u803B\xEE\u40EE;\u4438\u0100cx\u22BC\u22BFy;\u4435cl\u803B\xA1\u40A1\u0100fr\u039F\u22C9;\uC000\u{1D526}rave\u803B\xEC\u40EC\u0200;ino\u073E\u22DD\u22E9\u22EE\u0100in\u22E2\u22E6nt;\u6A0Ct;\u622Dfin;\u69DCta;\u6129lig;\u4133\u0180aop\u22FE\u231A\u231D\u0180cgt\u2305\u2308\u2317r;\u412B\u0180elp\u071F\u230F\u2313in\xE5\u078Ear\xF4\u0720h;\u4131f;\u62B7ed;\u41B5\u0280;cfot\u04F4\u232C\u2331\u233D\u2341are;\u6105in\u0100;t\u2338\u2339\u621Eie;\u69DDdo\xF4\u2319\u0280;celp\u0757\u234C\u2350\u235B\u2361al;\u62BA\u0100gr\u2355\u2359er\xF3\u1563\xE3\u234Darhk;\u6A17rod;\u6A3C\u0200cgpt\u236F\u2372\u2376\u237By;\u4451on;\u412Ff;\uC000\u{1D55A}a;\u43B9uest\u803B\xBF\u40BF\u0100ci\u238A\u238Fr;\uC000\u{1D4BE}n\u0280;Edsv\u04F4\u239B\u239D\u23A1\u04F3;\u62F9ot;\u62F5\u0100;v\u23A6\u23A7\u62F4;\u62F3\u0100;i\u0777\u23AElde;\u4129\u01EB\u23B8\0\u23BCcy;\u4456l\u803B\xEF\u40EF\u0300cfmosu\u23CC\u23D7\u23DC\u23E1\u23E7\u23F5\u0100iy\u23D1\u23D5rc;\u4135;\u4439r;\uC000\u{1D527}ath;\u4237pf;\uC000\u{1D55B}\u01E3\u23EC\0\u23F1r;\uC000\u{1D4BF}rcy;\u4458kcy;\u4454\u0400acfghjos\u240B\u2416\u2422\u2427\u242D\u2431\u2435\u243Bppa\u0100;v\u2413\u2414\u43BA;\u43F0\u0100ey\u241B\u2420dil;\u4137;\u443Ar;\uC000\u{1D528}reen;\u4138cy;\u4445cy;\u445Cpf;\uC000\u{1D55C}cr;\uC000\u{1D4C0}\u0B80ABEHabcdefghjlmnoprstuv\u2470\u2481\u2486\u248D\u2491\u250E\u253D\u255A\u2580\u264E\u265E\u2665\u2679\u267D\u269A\u26B2\u26D8\u275D\u2768\u278B\u27C0\u2801\u2812\u0180art\u2477\u247A\u247Cr\xF2\u09C6\xF2\u0395ail;\u691Barr;\u690E\u0100;g\u0994\u248B;\u6A8Bar;\u6962\u0963\u24A5\0\u24AA\0\u24B1\0\0\0\0\0\u24B5\u24BA\0\u24C6\u24C8\u24CD\0\u24F9ute;\u413Amptyv;\u69B4ra\xEE\u084Cbda;\u43BBg\u0180;dl\u088E\u24C1\u24C3;\u6991\xE5\u088E;\u6A85uo\u803B\xAB\u40ABr\u0400;bfhlpst\u0899\u24DE\u24E6\u24E9\u24EB\u24EE\u24F1\u24F5\u0100;f\u089D\u24E3s;\u691Fs;\u691D\xEB\u2252p;\u61ABl;\u6939im;\u6973l;\u61A2\u0180;ae\u24FF\u2500\u2504\u6AABil;\u6919\u0100;s\u2509\u250A\u6AAD;\uC000\u2AAD\uFE00\u0180abr\u2515\u2519\u251Drr;\u690Crk;\u6772\u0100ak\u2522\u252Cc\u0100ek\u2528\u252A;\u407B;\u405B\u0100es\u2531\u2533;\u698Bl\u0100du\u2539\u253B;\u698F;\u698D\u0200aeuy\u2546\u254B\u2556\u2558ron;\u413E\u0100di\u2550\u2554il;\u413C\xEC\u08B0\xE2\u2529;\u443B\u0200cqrs\u2563\u2566\u256D\u257Da;\u6936uo\u0100;r\u0E19\u1746\u0100du\u2572\u2577har;\u6967shar;\u694Bh;\u61B2\u0280;fgqs\u258B\u258C\u0989\u25F3\u25FF\u6264t\u0280ahlrt\u2598\u25A4\u25B7\u25C2\u25E8rrow\u0100;t\u0899\u25A1a\xE9\u24F6arpoon\u0100du\u25AF\u25B4own\xBB\u045Ap\xBB\u0966eftarrows;\u61C7ight\u0180ahs\u25CD\u25D6\u25DErrow\u0100;s\u08F4\u08A7arpoon\xF3\u0F98quigarro\xF7\u21F0hreetimes;\u62CB\u0180;qs\u258B\u0993\u25FAlan\xF4\u09AC\u0280;cdgs\u09AC\u260A\u260D\u261D\u2628c;\u6AA8ot\u0100;o\u2614\u2615\u6A7F\u0100;r\u261A\u261B\u6A81;\u6A83\u0100;e\u2622\u2625\uC000\u22DA\uFE00s;\u6A93\u0280adegs\u2633\u2639\u263D\u2649\u264Bppro\xF8\u24C6ot;\u62D6q\u0100gq\u2643\u2645\xF4\u0989gt\xF2\u248C\xF4\u099Bi\xED\u09B2\u0180ilr\u2655\u08E1\u265Asht;\u697C;\uC000\u{1D529}\u0100;E\u099C\u2663;\u6A91\u0161\u2669\u2676r\u0100du\u25B2\u266E\u0100;l\u0965\u2673;\u696Alk;\u6584cy;\u4459\u0280;acht\u0A48\u2688\u268B\u2691\u2696r\xF2\u25C1orne\xF2\u1D08ard;\u696Bri;\u65FA\u0100io\u269F\u26A4dot;\u4140ust\u0100;a\u26AC\u26AD\u63B0che\xBB\u26AD\u0200Eaes\u26BB\u26BD\u26C9\u26D4;\u6268p\u0100;p\u26C3\u26C4\u6A89rox\xBB\u26C4\u0100;q\u26CE\u26CF\u6A87\u0100;q\u26CE\u26BBim;\u62E6\u0400abnoptwz\u26E9\u26F4\u26F7\u271A\u272F\u2741\u2747\u2750\u0100nr\u26EE\u26F1g;\u67ECr;\u61FDr\xEB\u08C1g\u0180lmr\u26FF\u270D\u2714eft\u0100ar\u09E6\u2707ight\xE1\u09F2apsto;\u67FCight\xE1\u09FDparrow\u0100lr\u2725\u2729ef\xF4\u24EDight;\u61AC\u0180afl\u2736\u2739\u273Dr;\u6985;\uC000\u{1D55D}us;\u6A2Dimes;\u6A34\u0161\u274B\u274Fst;\u6217\xE1\u134E\u0180;ef\u2757\u2758\u1800\u65CAnge\xBB\u2758ar\u0100;l\u2764\u2765\u4028t;\u6993\u0280achmt\u2773\u2776\u277C\u2785\u2787r\xF2\u08A8orne\xF2\u1D8Car\u0100;d\u0F98\u2783;\u696D;\u600Eri;\u62BF\u0300achiqt\u2798\u279D\u0A40\u27A2\u27AE\u27BBquo;\u6039r;\uC000\u{1D4C1}m\u0180;eg\u09B2\u27AA\u27AC;\u6A8D;\u6A8F\u0100bu\u252A\u27B3o\u0100;r\u0E1F\u27B9;\u601Arok;\u4142\u8400<;cdhilqr\u082B\u27D2\u2639\u27DC\u27E0\u27E5\u27EA\u27F0\u0100ci\u27D7\u27D9;\u6AA6r;\u6A79re\xE5\u25F2mes;\u62C9arr;\u6976uest;\u6A7B\u0100Pi\u27F5\u27F9ar;\u6996\u0180;ef\u2800\u092D\u181B\u65C3r\u0100du\u2807\u280Dshar;\u694Ahar;\u6966\u0100en\u2817\u2821rtneqq;\uC000\u2268\uFE00\xC5\u281E\u0700Dacdefhilnopsu\u2840\u2845\u2882\u288E\u2893\u28A0\u28A5\u28A8\u28DA\u28E2\u28E4\u0A83\u28F3\u2902Dot;\u623A\u0200clpr\u284E\u2852\u2863\u287Dr\u803B\xAF\u40AF\u0100et\u2857\u2859;\u6642\u0100;e\u285E\u285F\u6720se\xBB\u285F\u0100;s\u103B\u2868to\u0200;dlu\u103B\u2873\u2877\u287Bow\xEE\u048Cef\xF4\u090F\xF0\u13D1ker;\u65AE\u0100oy\u2887\u288Cmma;\u6A29;\u443Cash;\u6014asuredangle\xBB\u1626r;\uC000\u{1D52A}o;\u6127\u0180cdn\u28AF\u28B4\u28C9ro\u803B\xB5\u40B5\u0200;acd\u1464\u28BD\u28C0\u28C4s\xF4\u16A7ir;\u6AF0ot\u80BB\xB7\u01B5us\u0180;bd\u28D2\u1903\u28D3\u6212\u0100;u\u1D3C\u28D8;\u6A2A\u0163\u28DE\u28E1p;\u6ADB\xF2\u2212\xF0\u0A81\u0100dp\u28E9\u28EEels;\u62A7f;\uC000\u{1D55E}\u0100ct\u28F8\u28FDr;\uC000\u{1D4C2}pos\xBB\u159D\u0180;lm\u2909\u290A\u290D\u43BCtimap;\u62B8\u0C00GLRVabcdefghijlmoprstuvw\u2942\u2953\u297E\u2989\u2998\u29DA\u29E9\u2A15\u2A1A\u2A58\u2A5D\u2A83\u2A95\u2AA4\u2AA8\u2B04\u2B07\u2B44\u2B7F\u2BAE\u2C34\u2C67\u2C7C\u2CE9\u0100gt\u2947\u294B;\uC000\u22D9\u0338\u0100;v\u2950\u0BCF\uC000\u226B\u20D2\u0180elt\u295A\u2972\u2976ft\u0100ar\u2961\u2967rrow;\u61CDightarrow;\u61CE;\uC000\u22D8\u0338\u0100;v\u297B\u0C47\uC000\u226A\u20D2ightarrow;\u61CF\u0100Dd\u298E\u2993ash;\u62AFash;\u62AE\u0280bcnpt\u29A3\u29A7\u29AC\u29B1\u29CCla\xBB\u02DEute;\u4144g;\uC000\u2220\u20D2\u0280;Eiop\u0D84\u29BC\u29C0\u29C5\u29C8;\uC000\u2A70\u0338d;\uC000\u224B\u0338s;\u4149ro\xF8\u0D84ur\u0100;a\u29D3\u29D4\u666El\u0100;s\u29D3\u0B38\u01F3\u29DF\0\u29E3p\u80BB\xA0\u0B37mp\u0100;e\u0BF9\u0C00\u0280aeouy\u29F4\u29FE\u2A03\u2A10\u2A13\u01F0\u29F9\0\u29FB;\u6A43on;\u4148dil;\u4146ng\u0100;d\u0D7E\u2A0Aot;\uC000\u2A6D\u0338p;\u6A42;\u443Dash;\u6013\u0380;Aadqsx\u0B92\u2A29\u2A2D\u2A3B\u2A41\u2A45\u2A50rr;\u61D7r\u0100hr\u2A33\u2A36k;\u6924\u0100;o\u13F2\u13F0ot;\uC000\u2250\u0338ui\xF6\u0B63\u0100ei\u2A4A\u2A4Ear;\u6928\xED\u0B98ist\u0100;s\u0BA0\u0B9Fr;\uC000\u{1D52B}\u0200Eest\u0BC5\u2A66\u2A79\u2A7C\u0180;qs\u0BBC\u2A6D\u0BE1\u0180;qs\u0BBC\u0BC5\u2A74lan\xF4\u0BE2i\xED\u0BEA\u0100;r\u0BB6\u2A81\xBB\u0BB7\u0180Aap\u2A8A\u2A8D\u2A91r\xF2\u2971rr;\u61AEar;\u6AF2\u0180;sv\u0F8D\u2A9C\u0F8C\u0100;d\u2AA1\u2AA2\u62FC;\u62FAcy;\u445A\u0380AEadest\u2AB7\u2ABA\u2ABE\u2AC2\u2AC5\u2AF6\u2AF9r\xF2\u2966;\uC000\u2266\u0338rr;\u619Ar;\u6025\u0200;fqs\u0C3B\u2ACE\u2AE3\u2AEFt\u0100ar\u2AD4\u2AD9rro\xF7\u2AC1ightarro\xF7\u2A90\u0180;qs\u0C3B\u2ABA\u2AEAlan\xF4\u0C55\u0100;s\u0C55\u2AF4\xBB\u0C36i\xED\u0C5D\u0100;r\u0C35\u2AFEi\u0100;e\u0C1A\u0C25i\xE4\u0D90\u0100pt\u2B0C\u2B11f;\uC000\u{1D55F}\u8180\xAC;in\u2B19\u2B1A\u2B36\u40ACn\u0200;Edv\u0B89\u2B24\u2B28\u2B2E;\uC000\u22F9\u0338ot;\uC000\u22F5\u0338\u01E1\u0B89\u2B33\u2B35;\u62F7;\u62F6i\u0100;v\u0CB8\u2B3C\u01E1\u0CB8\u2B41\u2B43;\u62FE;\u62FD\u0180aor\u2B4B\u2B63\u2B69r\u0200;ast\u0B7B\u2B55\u2B5A\u2B5Flle\xEC\u0B7Bl;\uC000\u2AFD\u20E5;\uC000\u2202\u0338lint;\u6A14\u0180;ce\u0C92\u2B70\u2B73u\xE5\u0CA5\u0100;c\u0C98\u2B78\u0100;e\u0C92\u2B7D\xF1\u0C98\u0200Aait\u2B88\u2B8B\u2B9D\u2BA7r\xF2\u2988rr\u0180;cw\u2B94\u2B95\u2B99\u619B;\uC000\u2933\u0338;\uC000\u219D\u0338ghtarrow\xBB\u2B95ri\u0100;e\u0CCB\u0CD6\u0380chimpqu\u2BBD\u2BCD\u2BD9\u2B04\u0B78\u2BE4\u2BEF\u0200;cer\u0D32\u2BC6\u0D37\u2BC9u\xE5\u0D45;\uC000\u{1D4C3}ort\u026D\u2B05\0\0\u2BD6ar\xE1\u2B56m\u0100;e\u0D6E\u2BDF\u0100;q\u0D74\u0D73su\u0100bp\u2BEB\u2BED\xE5\u0CF8\xE5\u0D0B\u0180bcp\u2BF6\u2C11\u2C19\u0200;Ees\u2BFF\u2C00\u0D22\u2C04\u6284;\uC000\u2AC5\u0338et\u0100;e\u0D1B\u2C0Bq\u0100;q\u0D23\u2C00c\u0100;e\u0D32\u2C17\xF1\u0D38\u0200;Ees\u2C22\u2C23\u0D5F\u2C27\u6285;\uC000\u2AC6\u0338et\u0100;e\u0D58\u2C2Eq\u0100;q\u0D60\u2C23\u0200gilr\u2C3D\u2C3F\u2C45\u2C47\xEC\u0BD7lde\u803B\xF1\u40F1\xE7\u0C43iangle\u0100lr\u2C52\u2C5Ceft\u0100;e\u0C1A\u2C5A\xF1\u0C26ight\u0100;e\u0CCB\u2C65\xF1\u0CD7\u0100;m\u2C6C\u2C6D\u43BD\u0180;es\u2C74\u2C75\u2C79\u4023ro;\u6116p;\u6007\u0480DHadgilrs\u2C8F\u2C94\u2C99\u2C9E\u2CA3\u2CB0\u2CB6\u2CD3\u2CE3ash;\u62ADarr;\u6904p;\uC000\u224D\u20D2ash;\u62AC\u0100et\u2CA8\u2CAC;\uC000\u2265\u20D2;\uC000>\u20D2nfin;\u69DE\u0180Aet\u2CBD\u2CC1\u2CC5rr;\u6902;\uC000\u2264\u20D2\u0100;r\u2CCA\u2CCD\uC000<\u20D2ie;\uC000\u22B4\u20D2\u0100At\u2CD8\u2CDCrr;\u6903rie;\uC000\u22B5\u20D2im;\uC000\u223C\u20D2\u0180Aan\u2CF0\u2CF4\u2D02rr;\u61D6r\u0100hr\u2CFA\u2CFDk;\u6923\u0100;o\u13E7\u13E5ear;\u6927\u1253\u1A95\0\0\0\0\0\0\0\0\0\0\0\0\0\u2D2D\0\u2D38\u2D48\u2D60\u2D65\u2D72\u2D84\u1B07\0\0\u2D8D\u2DAB\0\u2DC8\u2DCE\0\u2DDC\u2E19\u2E2B\u2E3E\u2E43\u0100cs\u2D31\u1A97ute\u803B\xF3\u40F3\u0100iy\u2D3C\u2D45r\u0100;c\u1A9E\u2D42\u803B\xF4\u40F4;\u443E\u0280abios\u1AA0\u2D52\u2D57\u01C8\u2D5Alac;\u4151v;\u6A38old;\u69BClig;\u4153\u0100cr\u2D69\u2D6Dir;\u69BF;\uC000\u{1D52C}\u036F\u2D79\0\0\u2D7C\0\u2D82n;\u42DBave\u803B\xF2\u40F2;\u69C1\u0100bm\u2D88\u0DF4ar;\u69B5\u0200acit\u2D95\u2D98\u2DA5\u2DA8r\xF2\u1A80\u0100ir\u2D9D\u2DA0r;\u69BEoss;\u69BBn\xE5\u0E52;\u69C0\u0180aei\u2DB1\u2DB5\u2DB9cr;\u414Dga;\u43C9\u0180cdn\u2DC0\u2DC5\u01CDron;\u43BF;\u69B6pf;\uC000\u{1D560}\u0180ael\u2DD4\u2DD7\u01D2r;\u69B7rp;\u69B9\u0380;adiosv\u2DEA\u2DEB\u2DEE\u2E08\u2E0D\u2E10\u2E16\u6228r\xF2\u1A86\u0200;efm\u2DF7\u2DF8\u2E02\u2E05\u6A5Dr\u0100;o\u2DFE\u2DFF\u6134f\xBB\u2DFF\u803B\xAA\u40AA\u803B\xBA\u40BAgof;\u62B6r;\u6A56lope;\u6A57;\u6A5B\u0180clo\u2E1F\u2E21\u2E27\xF2\u2E01ash\u803B\xF8\u40F8l;\u6298i\u016C\u2E2F\u2E34de\u803B\xF5\u40F5es\u0100;a\u01DB\u2E3As;\u6A36ml\u803B\xF6\u40F6bar;\u633D\u0AE1\u2E5E\0\u2E7D\0\u2E80\u2E9D\0\u2EA2\u2EB9\0\0\u2ECB\u0E9C\0\u2F13\0\0\u2F2B\u2FBC\0\u2FC8r\u0200;ast\u0403\u2E67\u2E72\u0E85\u8100\xB6;l\u2E6D\u2E6E\u40B6le\xEC\u0403\u0269\u2E78\0\0\u2E7Bm;\u6AF3;\u6AFDy;\u443Fr\u0280cimpt\u2E8B\u2E8F\u2E93\u1865\u2E97nt;\u4025od;\u402Eil;\u6030enk;\u6031r;\uC000\u{1D52D}\u0180imo\u2EA8\u2EB0\u2EB4\u0100;v\u2EAD\u2EAE\u43C6;\u43D5ma\xF4\u0A76ne;\u660E\u0180;tv\u2EBF\u2EC0\u2EC8\u43C0chfork\xBB\u1FFD;\u43D6\u0100au\u2ECF\u2EDFn\u0100ck\u2ED5\u2EDDk\u0100;h\u21F4\u2EDB;\u610E\xF6\u21F4s\u0480;abcdemst\u2EF3\u2EF4\u1908\u2EF9\u2EFD\u2F04\u2F06\u2F0A\u2F0E\u402Bcir;\u6A23ir;\u6A22\u0100ou\u1D40\u2F02;\u6A25;\u6A72n\u80BB\xB1\u0E9Dim;\u6A26wo;\u6A27\u0180ipu\u2F19\u2F20\u2F25ntint;\u6A15f;\uC000\u{1D561}nd\u803B\xA3\u40A3\u0500;Eaceinosu\u0EC8\u2F3F\u2F41\u2F44\u2F47\u2F81\u2F89\u2F92\u2F7E\u2FB6;\u6AB3p;\u6AB7u\xE5\u0ED9\u0100;c\u0ECE\u2F4C\u0300;acens\u0EC8\u2F59\u2F5F\u2F66\u2F68\u2F7Eppro\xF8\u2F43urlye\xF1\u0ED9\xF1\u0ECE\u0180aes\u2F6F\u2F76\u2F7Approx;\u6AB9qq;\u6AB5im;\u62E8i\xED\u0EDFme\u0100;s\u2F88\u0EAE\u6032\u0180Eas\u2F78\u2F90\u2F7A\xF0\u2F75\u0180dfp\u0EEC\u2F99\u2FAF\u0180als\u2FA0\u2FA5\u2FAAlar;\u632Eine;\u6312urf;\u6313\u0100;t\u0EFB\u2FB4\xEF\u0EFBrel;\u62B0\u0100ci\u2FC0\u2FC5r;\uC000\u{1D4C5};\u43C8ncsp;\u6008\u0300fiopsu\u2FDA\u22E2\u2FDF\u2FE5\u2FEB\u2FF1r;\uC000\u{1D52E}pf;\uC000\u{1D562}rime;\u6057cr;\uC000\u{1D4C6}\u0180aeo\u2FF8\u3009\u3013t\u0100ei\u2FFE\u3005rnion\xF3\u06B0nt;\u6A16st\u0100;e\u3010\u3011\u403F\xF1\u1F19\xF4\u0F14\u0A80ABHabcdefhilmnoprstux\u3040\u3051\u3055\u3059\u30E0\u310E\u312B\u3147\u3162\u3172\u318E\u3206\u3215\u3224\u3229\u3258\u326E\u3272\u3290\u32B0\u32B7\u0180art\u3047\u304A\u304Cr\xF2\u10B3\xF2\u03DDail;\u691Car\xF2\u1C65ar;\u6964\u0380cdenqrt\u3068\u3075\u3078\u307F\u308F\u3094\u30CC\u0100eu\u306D\u3071;\uC000\u223D\u0331te;\u4155i\xE3\u116Emptyv;\u69B3g\u0200;del\u0FD1\u3089\u308B\u308D;\u6992;\u69A5\xE5\u0FD1uo\u803B\xBB\u40BBr\u0580;abcfhlpstw\u0FDC\u30AC\u30AF\u30B7\u30B9\u30BC\u30BE\u30C0\u30C3\u30C7\u30CAp;\u6975\u0100;f\u0FE0\u30B4s;\u6920;\u6933s;\u691E\xEB\u225D\xF0\u272El;\u6945im;\u6974l;\u61A3;\u619D\u0100ai\u30D1\u30D5il;\u691Ao\u0100;n\u30DB\u30DC\u6236al\xF3\u0F1E\u0180abr\u30E7\u30EA\u30EEr\xF2\u17E5rk;\u6773\u0100ak\u30F3\u30FDc\u0100ek\u30F9\u30FB;\u407D;\u405D\u0100es\u3102\u3104;\u698Cl\u0100du\u310A\u310C;\u698E;\u6990\u0200aeuy\u3117\u311C\u3127\u3129ron;\u4159\u0100di\u3121\u3125il;\u4157\xEC\u0FF2\xE2\u30FA;\u4440\u0200clqs\u3134\u3137\u313D\u3144a;\u6937dhar;\u6969uo\u0100;r\u020E\u020Dh;\u61B3\u0180acg\u314E\u315F\u0F44l\u0200;ips\u0F78\u3158\u315B\u109Cn\xE5\u10BBar\xF4\u0FA9t;\u65AD\u0180ilr\u3169\u1023\u316Esht;\u697D;\uC000\u{1D52F}\u0100ao\u3177\u3186r\u0100du\u317D\u317F\xBB\u047B\u0100;l\u1091\u3184;\u696C\u0100;v\u318B\u318C\u43C1;\u43F1\u0180gns\u3195\u31F9\u31FCht\u0300ahlrst\u31A4\u31B0\u31C2\u31D8\u31E4\u31EErrow\u0100;t\u0FDC\u31ADa\xE9\u30C8arpoon\u0100du\u31BB\u31BFow\xEE\u317Ep\xBB\u1092eft\u0100ah\u31CA\u31D0rrow\xF3\u0FEAarpoon\xF3\u0551ightarrows;\u61C9quigarro\xF7\u30CBhreetimes;\u62CCg;\u42DAingdotse\xF1\u1F32\u0180ahm\u320D\u3210\u3213r\xF2\u0FEAa\xF2\u0551;\u600Foust\u0100;a\u321E\u321F\u63B1che\xBB\u321Fmid;\u6AEE\u0200abpt\u3232\u323D\u3240\u3252\u0100nr\u3237\u323Ag;\u67EDr;\u61FEr\xEB\u1003\u0180afl\u3247\u324A\u324Er;\u6986;\uC000\u{1D563}us;\u6A2Eimes;\u6A35\u0100ap\u325D\u3267r\u0100;g\u3263\u3264\u4029t;\u6994olint;\u6A12ar\xF2\u31E3\u0200achq\u327B\u3280\u10BC\u3285quo;\u603Ar;\uC000\u{1D4C7}\u0100bu\u30FB\u328Ao\u0100;r\u0214\u0213\u0180hir\u3297\u329B\u32A0re\xE5\u31F8mes;\u62CAi\u0200;efl\u32AA\u1059\u1821\u32AB\u65B9tri;\u69CEluhar;\u6968;\u611E\u0D61\u32D5\u32DB\u32DF\u332C\u3338\u3371\0\u337A\u33A4\0\0\u33EC\u33F0\0\u3428\u3448\u345A\u34AD\u34B1\u34CA\u34F1\0\u3616\0\0\u3633cute;\u415Bqu\xEF\u27BA\u0500;Eaceinpsy\u11ED\u32F3\u32F5\u32FF\u3302\u330B\u330F\u331F\u3326\u3329;\u6AB4\u01F0\u32FA\0\u32FC;\u6AB8on;\u4161u\xE5\u11FE\u0100;d\u11F3\u3307il;\u415Frc;\u415D\u0180Eas\u3316\u3318\u331B;\u6AB6p;\u6ABAim;\u62E9olint;\u6A13i\xED\u1204;\u4441ot\u0180;be\u3334\u1D47\u3335\u62C5;\u6A66\u0380Aacmstx\u3346\u334A\u3357\u335B\u335E\u3363\u336Drr;\u61D8r\u0100hr\u3350\u3352\xEB\u2228\u0100;o\u0A36\u0A34t\u803B\xA7\u40A7i;\u403Bwar;\u6929m\u0100in\u3369\xF0nu\xF3\xF1t;\u6736r\u0100;o\u3376\u2055\uC000\u{1D530}\u0200acoy\u3382\u3386\u3391\u33A0rp;\u666F\u0100hy\u338B\u338Fcy;\u4449;\u4448rt\u026D\u3399\0\0\u339Ci\xE4\u1464ara\xEC\u2E6F\u803B\xAD\u40AD\u0100gm\u33A8\u33B4ma\u0180;fv\u33B1\u33B2\u33B2\u43C3;\u43C2\u0400;deglnpr\u12AB\u33C5\u33C9\u33CE\u33D6\u33DE\u33E1\u33E6ot;\u6A6A\u0100;q\u12B1\u12B0\u0100;E\u33D3\u33D4\u6A9E;\u6AA0\u0100;E\u33DB\u33DC\u6A9D;\u6A9Fe;\u6246lus;\u6A24arr;\u6972ar\xF2\u113D\u0200aeit\u33F8\u3408\u340F\u3417\u0100ls\u33FD\u3404lsetm\xE9\u336Ahp;\u6A33parsl;\u69E4\u0100dl\u1463\u3414e;\u6323\u0100;e\u341C\u341D\u6AAA\u0100;s\u3422\u3423\u6AAC;\uC000\u2AAC\uFE00\u0180flp\u342E\u3433\u3442tcy;\u444C\u0100;b\u3438\u3439\u402F\u0100;a\u343E\u343F\u69C4r;\u633Ff;\uC000\u{1D564}a\u0100dr\u344D\u0402es\u0100;u\u3454\u3455\u6660it\xBB\u3455\u0180csu\u3460\u3479\u349F\u0100au\u3465\u346Fp\u0100;s\u1188\u346B;\uC000\u2293\uFE00p\u0100;s\u11B4\u3475;\uC000\u2294\uFE00u\u0100bp\u347F\u348F\u0180;es\u1197\u119C\u3486et\u0100;e\u1197\u348D\xF1\u119D\u0180;es\u11A8\u11AD\u3496et\u0100;e\u11A8\u349D\xF1\u11AE\u0180;af\u117B\u34A6\u05B0r\u0165\u34AB\u05B1\xBB\u117Car\xF2\u1148\u0200cemt\u34B9\u34BE\u34C2\u34C5r;\uC000\u{1D4C8}tm\xEE\xF1i\xEC\u3415ar\xE6\u11BE\u0100ar\u34CE\u34D5r\u0100;f\u34D4\u17BF\u6606\u0100an\u34DA\u34EDight\u0100ep\u34E3\u34EApsilo\xEE\u1EE0h\xE9\u2EAFs\xBB\u2852\u0280bcmnp\u34FB\u355E\u1209\u358B\u358E\u0480;Edemnprs\u350E\u350F\u3511\u3515\u351E\u3523\u352C\u3531\u3536\u6282;\u6AC5ot;\u6ABD\u0100;d\u11DA\u351Aot;\u6AC3ult;\u6AC1\u0100Ee\u3528\u352A;\u6ACB;\u628Alus;\u6ABFarr;\u6979\u0180eiu\u353D\u3552\u3555t\u0180;en\u350E\u3545\u354Bq\u0100;q\u11DA\u350Feq\u0100;q\u352B\u3528m;\u6AC7\u0100bp\u355A\u355C;\u6AD5;\u6AD3c\u0300;acens\u11ED\u356C\u3572\u3579\u357B\u3326ppro\xF8\u32FAurlye\xF1\u11FE\xF1\u11F3\u0180aes\u3582\u3588\u331Bppro\xF8\u331Aq\xF1\u3317g;\u666A\u0680123;Edehlmnps\u35A9\u35AC\u35AF\u121C\u35B2\u35B4\u35C0\u35C9\u35D5\u35DA\u35DF\u35E8\u35ED\u803B\xB9\u40B9\u803B\xB2\u40B2\u803B\xB3\u40B3;\u6AC6\u0100os\u35B9\u35BCt;\u6ABEub;\u6AD8\u0100;d\u1222\u35C5ot;\u6AC4s\u0100ou\u35CF\u35D2l;\u67C9b;\u6AD7arr;\u697Bult;\u6AC2\u0100Ee\u35E4\u35E6;\u6ACC;\u628Blus;\u6AC0\u0180eiu\u35F4\u3609\u360Ct\u0180;en\u121C\u35FC\u3602q\u0100;q\u1222\u35B2eq\u0100;q\u35E7\u35E4m;\u6AC8\u0100bp\u3611\u3613;\u6AD4;\u6AD6\u0180Aan\u361C\u3620\u362Drr;\u61D9r\u0100hr\u3626\u3628\xEB\u222E\u0100;o\u0A2B\u0A29war;\u692Alig\u803B\xDF\u40DF\u0BE1\u3651\u365D\u3660\u12CE\u3673\u3679\0\u367E\u36C2\0\0\0\0\0\u36DB\u3703\0\u3709\u376C\0\0\0\u3787\u0272\u3656\0\0\u365Bget;\u6316;\u43C4r\xEB\u0E5F\u0180aey\u3666\u366B\u3670ron;\u4165dil;\u4163;\u4442lrec;\u6315r;\uC000\u{1D531}\u0200eiko\u3686\u369D\u36B5\u36BC\u01F2\u368B\0\u3691e\u01004f\u1284\u1281a\u0180;sv\u3698\u3699\u369B\u43B8ym;\u43D1\u0100cn\u36A2\u36B2k\u0100as\u36A8\u36AEppro\xF8\u12C1im\xBB\u12ACs\xF0\u129E\u0100as\u36BA\u36AE\xF0\u12C1rn\u803B\xFE\u40FE\u01EC\u031F\u36C6\u22E7es\u8180\xD7;bd\u36CF\u36D0\u36D8\u40D7\u0100;a\u190F\u36D5r;\u6A31;\u6A30\u0180eps\u36E1\u36E3\u3700\xE1\u2A4D\u0200;bcf\u0486\u36EC\u36F0\u36F4ot;\u6336ir;\u6AF1\u0100;o\u36F9\u36FC\uC000\u{1D565}rk;\u6ADA\xE1\u3362rime;\u6034\u0180aip\u370F\u3712\u3764d\xE5\u1248\u0380adempst\u3721\u374D\u3740\u3751\u3757\u375C\u375Fngle\u0280;dlqr\u3730\u3731\u3736\u3740\u3742\u65B5own\xBB\u1DBBeft\u0100;e\u2800\u373E\xF1\u092E;\u625Cight\u0100;e\u32AA\u374B\xF1\u105Aot;\u65ECinus;\u6A3Alus;\u6A39b;\u69CDime;\u6A3Bezium;\u63E2\u0180cht\u3772\u377D\u3781\u0100ry\u3777\u377B;\uC000\u{1D4C9};\u4446cy;\u445Brok;\u4167\u0100io\u378B\u378Ex\xF4\u1777head\u0100lr\u3797\u37A0eftarro\xF7\u084Fightarrow\xBB\u0F5D\u0900AHabcdfghlmoprstuw\u37D0\u37D3\u37D7\u37E4\u37F0\u37FC\u380E\u381C\u3823\u3834\u3851\u385D\u386B\u38A9\u38CC\u38D2\u38EA\u38F6r\xF2\u03EDar;\u6963\u0100cr\u37DC\u37E2ute\u803B\xFA\u40FA\xF2\u1150r\u01E3\u37EA\0\u37EDy;\u445Eve;\u416D\u0100iy\u37F5\u37FArc\u803B\xFB\u40FB;\u4443\u0180abh\u3803\u3806\u380Br\xF2\u13ADlac;\u4171a\xF2\u13C3\u0100ir\u3813\u3818sht;\u697E;\uC000\u{1D532}rave\u803B\xF9\u40F9\u0161\u3827\u3831r\u0100lr\u382C\u382E\xBB\u0957\xBB\u1083lk;\u6580\u0100ct\u3839\u384D\u026F\u383F\0\0\u384Arn\u0100;e\u3845\u3846\u631Cr\xBB\u3846op;\u630Fri;\u65F8\u0100al\u3856\u385Acr;\u416B\u80BB\xA8\u0349\u0100gp\u3862\u3866on;\u4173f;\uC000\u{1D566}\u0300adhlsu\u114B\u3878\u387D\u1372\u3891\u38A0own\xE1\u13B3arpoon\u0100lr\u3888\u388Cef\xF4\u382Digh\xF4\u382Fi\u0180;hl\u3899\u389A\u389C\u43C5\xBB\u13FAon\xBB\u389Aparrows;\u61C8\u0180cit\u38B0\u38C4\u38C8\u026F\u38B6\0\0\u38C1rn\u0100;e\u38BC\u38BD\u631Dr\xBB\u38BDop;\u630Eng;\u416Fri;\u65F9cr;\uC000\u{1D4CA}\u0180dir\u38D9\u38DD\u38E2ot;\u62F0lde;\u4169i\u0100;f\u3730\u38E8\xBB\u1813\u0100am\u38EF\u38F2r\xF2\u38A8l\u803B\xFC\u40FCangle;\u69A7\u0780ABDacdeflnoprsz\u391C\u391F\u3929\u392D\u39B5\u39B8\u39BD\u39DF\u39E4\u39E8\u39F3\u39F9\u39FD\u3A01\u3A20r\xF2\u03F7ar\u0100;v\u3926\u3927\u6AE8;\u6AE9as\xE8\u03E1\u0100nr\u3932\u3937grt;\u699C\u0380eknprst\u34E3\u3946\u394B\u3952\u395D\u3964\u3996app\xE1\u2415othin\xE7\u1E96\u0180hir\u34EB\u2EC8\u3959op\xF4\u2FB5\u0100;h\u13B7\u3962\xEF\u318D\u0100iu\u3969\u396Dgm\xE1\u33B3\u0100bp\u3972\u3984setneq\u0100;q\u397D\u3980\uC000\u228A\uFE00;\uC000\u2ACB\uFE00setneq\u0100;q\u398F\u3992\uC000\u228B\uFE00;\uC000\u2ACC\uFE00\u0100hr\u399B\u399Fet\xE1\u369Ciangle\u0100lr\u39AA\u39AFeft\xBB\u0925ight\xBB\u1051y;\u4432ash\xBB\u1036\u0180elr\u39C4\u39D2\u39D7\u0180;be\u2DEA\u39CB\u39CFar;\u62BBq;\u625Alip;\u62EE\u0100bt\u39DC\u1468a\xF2\u1469r;\uC000\u{1D533}tr\xE9\u39AEsu\u0100bp\u39EF\u39F1\xBB\u0D1C\xBB\u0D59pf;\uC000\u{1D567}ro\xF0\u0EFBtr\xE9\u39B4\u0100cu\u3A06\u3A0Br;\uC000\u{1D4CB}\u0100bp\u3A10\u3A18n\u0100Ee\u3980\u3A16\xBB\u397En\u0100Ee\u3992\u3A1E\xBB\u3990igzag;\u699A\u0380cefoprs\u3A36\u3A3B\u3A56\u3A5B\u3A54\u3A61\u3A6Airc;\u4175\u0100di\u3A40\u3A51\u0100bg\u3A45\u3A49ar;\u6A5Fe\u0100;q\u15FA\u3A4F;\u6259erp;\u6118r;\uC000\u{1D534}pf;\uC000\u{1D568}\u0100;e\u1479\u3A66at\xE8\u1479cr;\uC000\u{1D4CC}\u0AE3\u178E\u3A87\0\u3A8B\0\u3A90\u3A9B\0\0\u3A9D\u3AA8\u3AAB\u3AAF\0\0\u3AC3\u3ACE\0\u3AD8\u17DC\u17DFtr\xE9\u17D1r;\uC000\u{1D535}\u0100Aa\u3A94\u3A97r\xF2\u03C3r\xF2\u09F6;\u43BE\u0100Aa\u3AA1\u3AA4r\xF2\u03B8r\xF2\u09EBa\xF0\u2713is;\u62FB\u0180dpt\u17A4\u3AB5\u3ABE\u0100fl\u3ABA\u17A9;\uC000\u{1D569}im\xE5\u17B2\u0100Aa\u3AC7\u3ACAr\xF2\u03CEr\xF2\u0A01\u0100cq\u3AD2\u17B8r;\uC000\u{1D4CD}\u0100pt\u17D6\u3ADCr\xE9\u17D4\u0400acefiosu\u3AF0\u3AFD\u3B08\u3B0C\u3B11\u3B15\u3B1B\u3B21c\u0100uy\u3AF6\u3AFBte\u803B\xFD\u40FD;\u444F\u0100iy\u3B02\u3B06rc;\u4177;\u444Bn\u803B\xA5\u40A5r;\uC000\u{1D536}cy;\u4457pf;\uC000\u{1D56A}cr;\uC000\u{1D4CE}\u0100cm\u3B26\u3B29y;\u444El\u803B\xFF\u40FF\u0500acdefhiosw\u3B42\u3B48\u3B54\u3B58\u3B64\u3B69\u3B6D\u3B74\u3B7A\u3B80cute;\u417A\u0100ay\u3B4D\u3B52ron;\u417E;\u4437ot;\u417C\u0100et\u3B5D\u3B61tr\xE6\u155Fa;\u43B6r;\uC000\u{1D537}cy;\u4436grarr;\u61DDpf;\uC000\u{1D56B}cr;\uC000\u{1D4CF}\u0100jn\u3B85\u3B87;\u600Dj;\u600C'.split("").map((c) => c.charCodeAt(0))
    );
  }
});

// node_modules/entities/dist/commonjs/generated/decode-data-xml.js
var require_decode_data_xml = __commonJS({
  "node_modules/entities/dist/commonjs/generated/decode-data-xml.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.xmlDecodeTree = void 0;
    exports2.xmlDecodeTree = new Uint16Array(
      // prettier-ignore
      /* @__PURE__ */ "\u0200aglq	\x1B\u026D\0\0p;\u4026os;\u4027t;\u403Et;\u403Cuot;\u4022".split("").map((c) => c.charCodeAt(0))
    );
  }
});

// node_modules/entities/dist/commonjs/decode-codepoint.js
var require_decode_codepoint = __commonJS({
  "node_modules/entities/dist/commonjs/decode-codepoint.js"(exports2) {
    "use strict";
    var _a;
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.fromCodePoint = void 0;
    exports2.replaceCodePoint = replaceCodePoint;
    exports2.decodeCodePoint = decodeCodePoint;
    var decodeMap = /* @__PURE__ */ new Map([
      [0, 65533],
      // C1 Unicode control character reference replacements
      [128, 8364],
      [130, 8218],
      [131, 402],
      [132, 8222],
      [133, 8230],
      [134, 8224],
      [135, 8225],
      [136, 710],
      [137, 8240],
      [138, 352],
      [139, 8249],
      [140, 338],
      [142, 381],
      [145, 8216],
      [146, 8217],
      [147, 8220],
      [148, 8221],
      [149, 8226],
      [150, 8211],
      [151, 8212],
      [152, 732],
      [153, 8482],
      [154, 353],
      [155, 8250],
      [156, 339],
      [158, 382],
      [159, 376]
    ]);
    exports2.fromCodePoint = // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, n/no-unsupported-features/es-builtins
    (_a = String.fromCodePoint) !== null && _a !== void 0 ? _a : function(codePoint) {
      let output = "";
      if (codePoint > 65535) {
        codePoint -= 65536;
        output += String.fromCharCode(codePoint >>> 10 & 1023 | 55296);
        codePoint = 56320 | codePoint & 1023;
      }
      output += String.fromCharCode(codePoint);
      return output;
    };
    function replaceCodePoint(codePoint) {
      var _a2;
      if (codePoint >= 55296 && codePoint <= 57343 || codePoint > 1114111) {
        return 65533;
      }
      return (_a2 = decodeMap.get(codePoint)) !== null && _a2 !== void 0 ? _a2 : codePoint;
    }
    function decodeCodePoint(codePoint) {
      return (0, exports2.fromCodePoint)(replaceCodePoint(codePoint));
    }
  }
});

// node_modules/entities/dist/commonjs/decode.js
var require_decode = __commonJS({
  "node_modules/entities/dist/commonjs/decode.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.fromCodePoint = exports2.replaceCodePoint = exports2.decodeCodePoint = exports2.xmlDecodeTree = exports2.htmlDecodeTree = exports2.EntityDecoder = exports2.DecodingMode = exports2.BinTrieFlags = void 0;
    exports2.determineBranch = determineBranch;
    exports2.decodeHTML = decodeHTML;
    exports2.decodeHTMLAttribute = decodeHTMLAttribute;
    exports2.decodeHTMLStrict = decodeHTMLStrict;
    exports2.decodeXML = decodeXML;
    var decode_data_html_js_1 = require_decode_data_html();
    var decode_data_xml_js_1 = require_decode_data_xml();
    var decode_codepoint_js_1 = require_decode_codepoint();
    var CharCodes;
    (function(CharCodes2) {
      CharCodes2[CharCodes2["NUM"] = 35] = "NUM";
      CharCodes2[CharCodes2["SEMI"] = 59] = "SEMI";
      CharCodes2[CharCodes2["EQUALS"] = 61] = "EQUALS";
      CharCodes2[CharCodes2["ZERO"] = 48] = "ZERO";
      CharCodes2[CharCodes2["NINE"] = 57] = "NINE";
      CharCodes2[CharCodes2["LOWER_A"] = 97] = "LOWER_A";
      CharCodes2[CharCodes2["LOWER_F"] = 102] = "LOWER_F";
      CharCodes2[CharCodes2["LOWER_X"] = 120] = "LOWER_X";
      CharCodes2[CharCodes2["LOWER_Z"] = 122] = "LOWER_Z";
      CharCodes2[CharCodes2["UPPER_A"] = 65] = "UPPER_A";
      CharCodes2[CharCodes2["UPPER_F"] = 70] = "UPPER_F";
      CharCodes2[CharCodes2["UPPER_Z"] = 90] = "UPPER_Z";
    })(CharCodes || (CharCodes = {}));
    var TO_LOWER_BIT = 32;
    var BinTrieFlags;
    (function(BinTrieFlags2) {
      BinTrieFlags2[BinTrieFlags2["VALUE_LENGTH"] = 49152] = "VALUE_LENGTH";
      BinTrieFlags2[BinTrieFlags2["BRANCH_LENGTH"] = 16256] = "BRANCH_LENGTH";
      BinTrieFlags2[BinTrieFlags2["JUMP_TABLE"] = 127] = "JUMP_TABLE";
    })(BinTrieFlags || (exports2.BinTrieFlags = BinTrieFlags = {}));
    function isNumber(code) {
      return code >= CharCodes.ZERO && code <= CharCodes.NINE;
    }
    function isHexadecimalCharacter(code) {
      return code >= CharCodes.UPPER_A && code <= CharCodes.UPPER_F || code >= CharCodes.LOWER_A && code <= CharCodes.LOWER_F;
    }
    function isAsciiAlphaNumeric(code) {
      return code >= CharCodes.UPPER_A && code <= CharCodes.UPPER_Z || code >= CharCodes.LOWER_A && code <= CharCodes.LOWER_Z || isNumber(code);
    }
    function isEntityInAttributeInvalidEnd(code) {
      return code === CharCodes.EQUALS || isAsciiAlphaNumeric(code);
    }
    var EntityDecoderState;
    (function(EntityDecoderState2) {
      EntityDecoderState2[EntityDecoderState2["EntityStart"] = 0] = "EntityStart";
      EntityDecoderState2[EntityDecoderState2["NumericStart"] = 1] = "NumericStart";
      EntityDecoderState2[EntityDecoderState2["NumericDecimal"] = 2] = "NumericDecimal";
      EntityDecoderState2[EntityDecoderState2["NumericHex"] = 3] = "NumericHex";
      EntityDecoderState2[EntityDecoderState2["NamedEntity"] = 4] = "NamedEntity";
    })(EntityDecoderState || (EntityDecoderState = {}));
    var DecodingMode;
    (function(DecodingMode2) {
      DecodingMode2[DecodingMode2["Legacy"] = 0] = "Legacy";
      DecodingMode2[DecodingMode2["Strict"] = 1] = "Strict";
      DecodingMode2[DecodingMode2["Attribute"] = 2] = "Attribute";
    })(DecodingMode || (exports2.DecodingMode = DecodingMode = {}));
    var EntityDecoder = class {
      constructor(decodeTree, emitCodePoint, errors) {
        this.decodeTree = decodeTree;
        this.emitCodePoint = emitCodePoint;
        this.errors = errors;
        this.state = EntityDecoderState.EntityStart;
        this.consumed = 1;
        this.result = 0;
        this.treeIndex = 0;
        this.excess = 1;
        this.decodeMode = DecodingMode.Strict;
      }
      /** Resets the instance to make it reusable. */
      startEntity(decodeMode) {
        this.decodeMode = decodeMode;
        this.state = EntityDecoderState.EntityStart;
        this.result = 0;
        this.treeIndex = 0;
        this.excess = 1;
        this.consumed = 1;
      }
      /**
       * Write an entity to the decoder. This can be called multiple times with partial entities.
       * If the entity is incomplete, the decoder will return -1.
       *
       * Mirrors the implementation of `getDecoder`, but with the ability to stop decoding if the
       * entity is incomplete, and resume when the next string is written.
       *
       * @param input The string containing the entity (or a continuation of the entity).
       * @param offset The offset at which the entity begins. Should be 0 if this is not the first call.
       * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
       */
      write(input, offset) {
        switch (this.state) {
          case EntityDecoderState.EntityStart: {
            if (input.charCodeAt(offset) === CharCodes.NUM) {
              this.state = EntityDecoderState.NumericStart;
              this.consumed += 1;
              return this.stateNumericStart(input, offset + 1);
            }
            this.state = EntityDecoderState.NamedEntity;
            return this.stateNamedEntity(input, offset);
          }
          case EntityDecoderState.NumericStart: {
            return this.stateNumericStart(input, offset);
          }
          case EntityDecoderState.NumericDecimal: {
            return this.stateNumericDecimal(input, offset);
          }
          case EntityDecoderState.NumericHex: {
            return this.stateNumericHex(input, offset);
          }
          case EntityDecoderState.NamedEntity: {
            return this.stateNamedEntity(input, offset);
          }
        }
      }
      /**
       * Switches between the numeric decimal and hexadecimal states.
       *
       * Equivalent to the `Numeric character reference state` in the HTML spec.
       *
       * @param input The string containing the entity (or a continuation of the entity).
       * @param offset The current offset.
       * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
       */
      stateNumericStart(input, offset) {
        if (offset >= input.length) {
          return -1;
        }
        if ((input.charCodeAt(offset) | TO_LOWER_BIT) === CharCodes.LOWER_X) {
          this.state = EntityDecoderState.NumericHex;
          this.consumed += 1;
          return this.stateNumericHex(input, offset + 1);
        }
        this.state = EntityDecoderState.NumericDecimal;
        return this.stateNumericDecimal(input, offset);
      }
      addToNumericResult(input, start, end, base) {
        if (start !== end) {
          const digitCount = end - start;
          this.result = this.result * Math.pow(base, digitCount) + Number.parseInt(input.substr(start, digitCount), base);
          this.consumed += digitCount;
        }
      }
      /**
       * Parses a hexadecimal numeric entity.
       *
       * Equivalent to the `Hexademical character reference state` in the HTML spec.
       *
       * @param input The string containing the entity (or a continuation of the entity).
       * @param offset The current offset.
       * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
       */
      stateNumericHex(input, offset) {
        const startIndex = offset;
        while (offset < input.length) {
          const char = input.charCodeAt(offset);
          if (isNumber(char) || isHexadecimalCharacter(char)) {
            offset += 1;
          } else {
            this.addToNumericResult(input, startIndex, offset, 16);
            return this.emitNumericEntity(char, 3);
          }
        }
        this.addToNumericResult(input, startIndex, offset, 16);
        return -1;
      }
      /**
       * Parses a decimal numeric entity.
       *
       * Equivalent to the `Decimal character reference state` in the HTML spec.
       *
       * @param input The string containing the entity (or a continuation of the entity).
       * @param offset The current offset.
       * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
       */
      stateNumericDecimal(input, offset) {
        const startIndex = offset;
        while (offset < input.length) {
          const char = input.charCodeAt(offset);
          if (isNumber(char)) {
            offset += 1;
          } else {
            this.addToNumericResult(input, startIndex, offset, 10);
            return this.emitNumericEntity(char, 2);
          }
        }
        this.addToNumericResult(input, startIndex, offset, 10);
        return -1;
      }
      /**
       * Validate and emit a numeric entity.
       *
       * Implements the logic from the `Hexademical character reference start
       * state` and `Numeric character reference end state` in the HTML spec.
       *
       * @param lastCp The last code point of the entity. Used to see if the
       *               entity was terminated with a semicolon.
       * @param expectedLength The minimum number of characters that should be
       *                       consumed. Used to validate that at least one digit
       *                       was consumed.
       * @returns The number of characters that were consumed.
       */
      emitNumericEntity(lastCp, expectedLength) {
        var _a;
        if (this.consumed <= expectedLength) {
          (_a = this.errors) === null || _a === void 0 ? void 0 : _a.absenceOfDigitsInNumericCharacterReference(this.consumed);
          return 0;
        }
        if (lastCp === CharCodes.SEMI) {
          this.consumed += 1;
        } else if (this.decodeMode === DecodingMode.Strict) {
          return 0;
        }
        this.emitCodePoint((0, decode_codepoint_js_1.replaceCodePoint)(this.result), this.consumed);
        if (this.errors) {
          if (lastCp !== CharCodes.SEMI) {
            this.errors.missingSemicolonAfterCharacterReference();
          }
          this.errors.validateNumericCharacterReference(this.result);
        }
        return this.consumed;
      }
      /**
       * Parses a named entity.
       *
       * Equivalent to the `Named character reference state` in the HTML spec.
       *
       * @param input The string containing the entity (or a continuation of the entity).
       * @param offset The current offset.
       * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
       */
      stateNamedEntity(input, offset) {
        const { decodeTree } = this;
        let current = decodeTree[this.treeIndex];
        let valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
        for (; offset < input.length; offset++, this.excess++) {
          const char = input.charCodeAt(offset);
          this.treeIndex = determineBranch(decodeTree, current, this.treeIndex + Math.max(1, valueLength), char);
          if (this.treeIndex < 0) {
            return this.result === 0 || // If we are parsing an attribute
            this.decodeMode === DecodingMode.Attribute && // We shouldn't have consumed any characters after the entity,
            (valueLength === 0 || // And there should be no invalid characters.
            isEntityInAttributeInvalidEnd(char)) ? 0 : this.emitNotTerminatedNamedEntity();
          }
          current = decodeTree[this.treeIndex];
          valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
          if (valueLength !== 0) {
            if (char === CharCodes.SEMI) {
              return this.emitNamedEntityData(this.treeIndex, valueLength, this.consumed + this.excess);
            }
            if (this.decodeMode !== DecodingMode.Strict) {
              this.result = this.treeIndex;
              this.consumed += this.excess;
              this.excess = 0;
            }
          }
        }
        return -1;
      }
      /**
       * Emit a named entity that was not terminated with a semicolon.
       *
       * @returns The number of characters consumed.
       */
      emitNotTerminatedNamedEntity() {
        var _a;
        const { result, decodeTree } = this;
        const valueLength = (decodeTree[result] & BinTrieFlags.VALUE_LENGTH) >> 14;
        this.emitNamedEntityData(result, valueLength, this.consumed);
        (_a = this.errors) === null || _a === void 0 ? void 0 : _a.missingSemicolonAfterCharacterReference();
        return this.consumed;
      }
      /**
       * Emit a named entity.
       *
       * @param result The index of the entity in the decode tree.
       * @param valueLength The number of bytes in the entity.
       * @param consumed The number of characters consumed.
       *
       * @returns The number of characters consumed.
       */
      emitNamedEntityData(result, valueLength, consumed) {
        const { decodeTree } = this;
        this.emitCodePoint(valueLength === 1 ? decodeTree[result] & ~BinTrieFlags.VALUE_LENGTH : decodeTree[result + 1], consumed);
        if (valueLength === 3) {
          this.emitCodePoint(decodeTree[result + 2], consumed);
        }
        return consumed;
      }
      /**
       * Signal to the parser that the end of the input was reached.
       *
       * Remaining data will be emitted and relevant errors will be produced.
       *
       * @returns The number of characters consumed.
       */
      end() {
        var _a;
        switch (this.state) {
          case EntityDecoderState.NamedEntity: {
            return this.result !== 0 && (this.decodeMode !== DecodingMode.Attribute || this.result === this.treeIndex) ? this.emitNotTerminatedNamedEntity() : 0;
          }
          // Otherwise, emit a numeric entity if we have one.
          case EntityDecoderState.NumericDecimal: {
            return this.emitNumericEntity(0, 2);
          }
          case EntityDecoderState.NumericHex: {
            return this.emitNumericEntity(0, 3);
          }
          case EntityDecoderState.NumericStart: {
            (_a = this.errors) === null || _a === void 0 ? void 0 : _a.absenceOfDigitsInNumericCharacterReference(this.consumed);
            return 0;
          }
          case EntityDecoderState.EntityStart: {
            return 0;
          }
        }
      }
    };
    exports2.EntityDecoder = EntityDecoder;
    function getDecoder(decodeTree) {
      let returnValue = "";
      const decoder = new EntityDecoder(decodeTree, (data) => returnValue += (0, decode_codepoint_js_1.fromCodePoint)(data));
      return function decodeWithTrie(input, decodeMode) {
        let lastIndex = 0;
        let offset = 0;
        while ((offset = input.indexOf("&", offset)) >= 0) {
          returnValue += input.slice(lastIndex, offset);
          decoder.startEntity(decodeMode);
          const length = decoder.write(
            input,
            // Skip the "&"
            offset + 1
          );
          if (length < 0) {
            lastIndex = offset + decoder.end();
            break;
          }
          lastIndex = offset + length;
          offset = length === 0 ? lastIndex + 1 : lastIndex;
        }
        const result = returnValue + input.slice(lastIndex);
        returnValue = "";
        return result;
      };
    }
    function determineBranch(decodeTree, current, nodeIndex, char) {
      const branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
      const jumpOffset = current & BinTrieFlags.JUMP_TABLE;
      if (branchCount === 0) {
        return jumpOffset !== 0 && char === jumpOffset ? nodeIndex : -1;
      }
      if (jumpOffset) {
        const value = char - jumpOffset;
        return value < 0 || value >= branchCount ? -1 : decodeTree[nodeIndex + value] - 1;
      }
      let lo = nodeIndex;
      let hi = lo + branchCount - 1;
      while (lo <= hi) {
        const mid = lo + hi >>> 1;
        const midValue = decodeTree[mid];
        if (midValue < char) {
          lo = mid + 1;
        } else if (midValue > char) {
          hi = mid - 1;
        } else {
          return decodeTree[mid + branchCount];
        }
      }
      return -1;
    }
    var htmlDecoder = /* @__PURE__ */ getDecoder(decode_data_html_js_1.htmlDecodeTree);
    var xmlDecoder = /* @__PURE__ */ getDecoder(decode_data_xml_js_1.xmlDecodeTree);
    function decodeHTML(htmlString, mode = DecodingMode.Legacy) {
      return htmlDecoder(htmlString, mode);
    }
    function decodeHTMLAttribute(htmlAttribute) {
      return htmlDecoder(htmlAttribute, DecodingMode.Attribute);
    }
    function decodeHTMLStrict(htmlString) {
      return htmlDecoder(htmlString, DecodingMode.Strict);
    }
    function decodeXML(xmlString) {
      return xmlDecoder(xmlString, DecodingMode.Strict);
    }
    var decode_data_html_js_2 = require_decode_data_html();
    Object.defineProperty(exports2, "htmlDecodeTree", { enumerable: true, get: function() {
      return decode_data_html_js_2.htmlDecodeTree;
    } });
    var decode_data_xml_js_2 = require_decode_data_xml();
    Object.defineProperty(exports2, "xmlDecodeTree", { enumerable: true, get: function() {
      return decode_data_xml_js_2.xmlDecodeTree;
    } });
    var decode_codepoint_js_2 = require_decode_codepoint();
    Object.defineProperty(exports2, "decodeCodePoint", { enumerable: true, get: function() {
      return decode_codepoint_js_2.decodeCodePoint;
    } });
    Object.defineProperty(exports2, "replaceCodePoint", { enumerable: true, get: function() {
      return decode_codepoint_js_2.replaceCodePoint;
    } });
    Object.defineProperty(exports2, "fromCodePoint", { enumerable: true, get: function() {
      return decode_codepoint_js_2.fromCodePoint;
    } });
  }
});

// node_modules/htmlparser2/dist/commonjs/Tokenizer.js
var require_Tokenizer = __commonJS({
  "node_modules/htmlparser2/dist/commonjs/Tokenizer.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.QuoteType = void 0;
    var decode_1 = require_decode();
    var CharCodes;
    (function(CharCodes2) {
      CharCodes2[CharCodes2["Tab"] = 9] = "Tab";
      CharCodes2[CharCodes2["NewLine"] = 10] = "NewLine";
      CharCodes2[CharCodes2["FormFeed"] = 12] = "FormFeed";
      CharCodes2[CharCodes2["CarriageReturn"] = 13] = "CarriageReturn";
      CharCodes2[CharCodes2["Space"] = 32] = "Space";
      CharCodes2[CharCodes2["ExclamationMark"] = 33] = "ExclamationMark";
      CharCodes2[CharCodes2["Number"] = 35] = "Number";
      CharCodes2[CharCodes2["Amp"] = 38] = "Amp";
      CharCodes2[CharCodes2["SingleQuote"] = 39] = "SingleQuote";
      CharCodes2[CharCodes2["DoubleQuote"] = 34] = "DoubleQuote";
      CharCodes2[CharCodes2["Dash"] = 45] = "Dash";
      CharCodes2[CharCodes2["Slash"] = 47] = "Slash";
      CharCodes2[CharCodes2["Zero"] = 48] = "Zero";
      CharCodes2[CharCodes2["Nine"] = 57] = "Nine";
      CharCodes2[CharCodes2["Semi"] = 59] = "Semi";
      CharCodes2[CharCodes2["Lt"] = 60] = "Lt";
      CharCodes2[CharCodes2["Eq"] = 61] = "Eq";
      CharCodes2[CharCodes2["Gt"] = 62] = "Gt";
      CharCodes2[CharCodes2["Questionmark"] = 63] = "Questionmark";
      CharCodes2[CharCodes2["UpperA"] = 65] = "UpperA";
      CharCodes2[CharCodes2["LowerA"] = 97] = "LowerA";
      CharCodes2[CharCodes2["UpperF"] = 70] = "UpperF";
      CharCodes2[CharCodes2["LowerF"] = 102] = "LowerF";
      CharCodes2[CharCodes2["UpperZ"] = 90] = "UpperZ";
      CharCodes2[CharCodes2["LowerZ"] = 122] = "LowerZ";
      CharCodes2[CharCodes2["LowerX"] = 120] = "LowerX";
      CharCodes2[CharCodes2["OpeningSquareBracket"] = 91] = "OpeningSquareBracket";
    })(CharCodes || (CharCodes = {}));
    var State;
    (function(State2) {
      State2[State2["Text"] = 1] = "Text";
      State2[State2["BeforeTagName"] = 2] = "BeforeTagName";
      State2[State2["InTagName"] = 3] = "InTagName";
      State2[State2["InSelfClosingTag"] = 4] = "InSelfClosingTag";
      State2[State2["BeforeClosingTagName"] = 5] = "BeforeClosingTagName";
      State2[State2["InClosingTagName"] = 6] = "InClosingTagName";
      State2[State2["AfterClosingTagName"] = 7] = "AfterClosingTagName";
      State2[State2["BeforeAttributeName"] = 8] = "BeforeAttributeName";
      State2[State2["InAttributeName"] = 9] = "InAttributeName";
      State2[State2["AfterAttributeName"] = 10] = "AfterAttributeName";
      State2[State2["BeforeAttributeValue"] = 11] = "BeforeAttributeValue";
      State2[State2["InAttributeValueDq"] = 12] = "InAttributeValueDq";
      State2[State2["InAttributeValueSq"] = 13] = "InAttributeValueSq";
      State2[State2["InAttributeValueNq"] = 14] = "InAttributeValueNq";
      State2[State2["BeforeDeclaration"] = 15] = "BeforeDeclaration";
      State2[State2["InDeclaration"] = 16] = "InDeclaration";
      State2[State2["InProcessingInstruction"] = 17] = "InProcessingInstruction";
      State2[State2["BeforeComment"] = 18] = "BeforeComment";
      State2[State2["CDATASequence"] = 19] = "CDATASequence";
      State2[State2["InSpecialComment"] = 20] = "InSpecialComment";
      State2[State2["InCommentLike"] = 21] = "InCommentLike";
      State2[State2["BeforeSpecialS"] = 22] = "BeforeSpecialS";
      State2[State2["BeforeSpecialT"] = 23] = "BeforeSpecialT";
      State2[State2["SpecialStartSequence"] = 24] = "SpecialStartSequence";
      State2[State2["InSpecialTag"] = 25] = "InSpecialTag";
      State2[State2["InEntity"] = 26] = "InEntity";
    })(State || (State = {}));
    function isWhitespace(c) {
      return c === CharCodes.Space || c === CharCodes.NewLine || c === CharCodes.Tab || c === CharCodes.FormFeed || c === CharCodes.CarriageReturn;
    }
    function isEndOfTagSection(c) {
      return c === CharCodes.Slash || c === CharCodes.Gt || isWhitespace(c);
    }
    function isASCIIAlpha(c) {
      return c >= CharCodes.LowerA && c <= CharCodes.LowerZ || c >= CharCodes.UpperA && c <= CharCodes.UpperZ;
    }
    var QuoteType;
    (function(QuoteType2) {
      QuoteType2[QuoteType2["NoValue"] = 0] = "NoValue";
      QuoteType2[QuoteType2["Unquoted"] = 1] = "Unquoted";
      QuoteType2[QuoteType2["Single"] = 2] = "Single";
      QuoteType2[QuoteType2["Double"] = 3] = "Double";
    })(QuoteType || (exports2.QuoteType = QuoteType = {}));
    var Sequences = {
      Cdata: new Uint8Array([67, 68, 65, 84, 65, 91]),
      // CDATA[
      CdataEnd: new Uint8Array([93, 93, 62]),
      // ]]>
      CommentEnd: new Uint8Array([45, 45, 62]),
      // `-->`
      ScriptEnd: new Uint8Array([60, 47, 115, 99, 114, 105, 112, 116]),
      // `</script`
      StyleEnd: new Uint8Array([60, 47, 115, 116, 121, 108, 101]),
      // `</style`
      TitleEnd: new Uint8Array([60, 47, 116, 105, 116, 108, 101]),
      // `</title`
      TextareaEnd: new Uint8Array([
        60,
        47,
        116,
        101,
        120,
        116,
        97,
        114,
        101,
        97
      ]),
      // `</textarea`
      XmpEnd: new Uint8Array([60, 47, 120, 109, 112])
      // `</xmp`
    };
    var Tokenizer = class {
      constructor({ xmlMode = false, decodeEntities = true }, cbs) {
        this.cbs = cbs;
        this.state = State.Text;
        this.buffer = "";
        this.sectionStart = 0;
        this.index = 0;
        this.entityStart = 0;
        this.baseState = State.Text;
        this.isSpecial = false;
        this.running = true;
        this.offset = 0;
        this.currentSequence = void 0;
        this.sequenceIndex = 0;
        this.xmlMode = xmlMode;
        this.decodeEntities = decodeEntities;
        this.entityDecoder = new decode_1.EntityDecoder(xmlMode ? decode_1.xmlDecodeTree : decode_1.htmlDecodeTree, (cp, consumed) => this.emitCodePoint(cp, consumed));
      }
      reset() {
        this.state = State.Text;
        this.buffer = "";
        this.sectionStart = 0;
        this.index = 0;
        this.baseState = State.Text;
        this.currentSequence = void 0;
        this.running = true;
        this.offset = 0;
      }
      write(chunk) {
        this.offset += this.buffer.length;
        this.buffer = chunk;
        this.parse();
      }
      end() {
        if (this.running)
          this.finish();
      }
      pause() {
        this.running = false;
      }
      resume() {
        this.running = true;
        if (this.index < this.buffer.length + this.offset) {
          this.parse();
        }
      }
      stateText(c) {
        if (c === CharCodes.Lt || !this.decodeEntities && this.fastForwardTo(CharCodes.Lt)) {
          if (this.index > this.sectionStart) {
            this.cbs.ontext(this.sectionStart, this.index);
          }
          this.state = State.BeforeTagName;
          this.sectionStart = this.index;
        } else if (this.decodeEntities && c === CharCodes.Amp) {
          this.startEntity();
        }
      }
      stateSpecialStartSequence(c) {
        const isEnd = this.sequenceIndex === this.currentSequence.length;
        const isMatch = isEnd ? (
          // If we are at the end of the sequence, make sure the tag name has ended
          isEndOfTagSection(c)
        ) : (
          // Otherwise, do a case-insensitive comparison
          (c | 32) === this.currentSequence[this.sequenceIndex]
        );
        if (!isMatch) {
          this.isSpecial = false;
        } else if (!isEnd) {
          this.sequenceIndex++;
          return;
        }
        this.sequenceIndex = 0;
        this.state = State.InTagName;
        this.stateInTagName(c);
      }
      /** Look for an end tag. For <title> tags, also decode entities. */
      stateInSpecialTag(c) {
        if (this.sequenceIndex === this.currentSequence.length) {
          if (c === CharCodes.Gt || isWhitespace(c)) {
            const endOfText = this.index - this.currentSequence.length;
            if (this.sectionStart < endOfText) {
              const actualIndex = this.index;
              this.index = endOfText;
              this.cbs.ontext(this.sectionStart, endOfText);
              this.index = actualIndex;
            }
            this.isSpecial = false;
            this.sectionStart = endOfText + 2;
            this.stateInClosingTagName(c);
            return;
          }
          this.sequenceIndex = 0;
        }
        if ((c | 32) === this.currentSequence[this.sequenceIndex]) {
          this.sequenceIndex += 1;
        } else if (this.sequenceIndex === 0) {
          if (this.currentSequence === Sequences.TitleEnd) {
            if (this.decodeEntities && c === CharCodes.Amp) {
              this.startEntity();
            }
          } else if (this.fastForwardTo(CharCodes.Lt)) {
            this.sequenceIndex = 1;
          }
        } else {
          this.sequenceIndex = Number(c === CharCodes.Lt);
        }
      }
      stateCDATASequence(c) {
        if (c === Sequences.Cdata[this.sequenceIndex]) {
          if (++this.sequenceIndex === Sequences.Cdata.length) {
            this.state = State.InCommentLike;
            this.currentSequence = Sequences.CdataEnd;
            this.sequenceIndex = 0;
            this.sectionStart = this.index + 1;
          }
        } else {
          this.sequenceIndex = 0;
          this.state = State.InDeclaration;
          this.stateInDeclaration(c);
        }
      }
      /**
       * When we wait for one specific character, we can speed things up
       * by skipping through the buffer until we find it.
       *
       * @returns Whether the character was found.
       */
      fastForwardTo(c) {
        while (++this.index < this.buffer.length + this.offset) {
          if (this.buffer.charCodeAt(this.index - this.offset) === c) {
            return true;
          }
        }
        this.index = this.buffer.length + this.offset - 1;
        return false;
      }
      /**
       * Comments and CDATA end with `-->` and `]]>`.
       *
       * Their common qualities are:
       * - Their end sequences have a distinct character they start with.
       * - That character is then repeated, so we have to check multiple repeats.
       * - All characters but the start character of the sequence can be skipped.
       */
      stateInCommentLike(c) {
        if (c === this.currentSequence[this.sequenceIndex]) {
          if (++this.sequenceIndex === this.currentSequence.length) {
            if (this.currentSequence === Sequences.CdataEnd) {
              this.cbs.oncdata(this.sectionStart, this.index, 2);
            } else {
              this.cbs.oncomment(this.sectionStart, this.index, 2);
            }
            this.sequenceIndex = 0;
            this.sectionStart = this.index + 1;
            this.state = State.Text;
          }
        } else if (this.sequenceIndex === 0) {
          if (this.fastForwardTo(this.currentSequence[0])) {
            this.sequenceIndex = 1;
          }
        } else if (c !== this.currentSequence[this.sequenceIndex - 1]) {
          this.sequenceIndex = 0;
        }
      }
      /**
       * HTML only allows ASCII alpha characters (a-z and A-Z) at the beginning of a tag name.
       *
       * XML allows a lot more characters here (@see https://www.w3.org/TR/REC-xml/#NT-NameStartChar).
       * We allow anything that wouldn't end the tag.
       */
      isTagStartChar(c) {
        return this.xmlMode ? !isEndOfTagSection(c) : isASCIIAlpha(c);
      }
      startSpecial(sequence, offset) {
        this.isSpecial = true;
        this.currentSequence = sequence;
        this.sequenceIndex = offset;
        this.state = State.SpecialStartSequence;
      }
      stateBeforeTagName(c) {
        if (c === CharCodes.ExclamationMark) {
          this.state = State.BeforeDeclaration;
          this.sectionStart = this.index + 1;
        } else if (c === CharCodes.Questionmark) {
          this.state = State.InProcessingInstruction;
          this.sectionStart = this.index + 1;
        } else if (this.isTagStartChar(c)) {
          const lower = c | 32;
          this.sectionStart = this.index;
          if (this.xmlMode) {
            this.state = State.InTagName;
          } else if (lower === Sequences.ScriptEnd[2]) {
            this.state = State.BeforeSpecialS;
          } else if (lower === Sequences.TitleEnd[2] || lower === Sequences.XmpEnd[2]) {
            this.state = State.BeforeSpecialT;
          } else {
            this.state = State.InTagName;
          }
        } else if (c === CharCodes.Slash) {
          this.state = State.BeforeClosingTagName;
        } else {
          this.state = State.Text;
          this.stateText(c);
        }
      }
      stateInTagName(c) {
        if (isEndOfTagSection(c)) {
          this.cbs.onopentagname(this.sectionStart, this.index);
          this.sectionStart = -1;
          this.state = State.BeforeAttributeName;
          this.stateBeforeAttributeName(c);
        }
      }
      stateBeforeClosingTagName(c) {
        if (isWhitespace(c)) {
        } else if (c === CharCodes.Gt) {
          this.state = State.Text;
        } else {
          this.state = this.isTagStartChar(c) ? State.InClosingTagName : State.InSpecialComment;
          this.sectionStart = this.index;
        }
      }
      stateInClosingTagName(c) {
        if (c === CharCodes.Gt || isWhitespace(c)) {
          this.cbs.onclosetag(this.sectionStart, this.index);
          this.sectionStart = -1;
          this.state = State.AfterClosingTagName;
          this.stateAfterClosingTagName(c);
        }
      }
      stateAfterClosingTagName(c) {
        if (c === CharCodes.Gt || this.fastForwardTo(CharCodes.Gt)) {
          this.state = State.Text;
          this.sectionStart = this.index + 1;
        }
      }
      stateBeforeAttributeName(c) {
        if (c === CharCodes.Gt) {
          this.cbs.onopentagend(this.index);
          if (this.isSpecial) {
            this.state = State.InSpecialTag;
            this.sequenceIndex = 0;
          } else {
            this.state = State.Text;
          }
          this.sectionStart = this.index + 1;
        } else if (c === CharCodes.Slash) {
          this.state = State.InSelfClosingTag;
        } else if (!isWhitespace(c)) {
          this.state = State.InAttributeName;
          this.sectionStart = this.index;
        }
      }
      stateInSelfClosingTag(c) {
        if (c === CharCodes.Gt) {
          this.cbs.onselfclosingtag(this.index);
          this.state = State.Text;
          this.sectionStart = this.index + 1;
          this.isSpecial = false;
        } else if (!isWhitespace(c)) {
          this.state = State.BeforeAttributeName;
          this.stateBeforeAttributeName(c);
        }
      }
      stateInAttributeName(c) {
        if (c === CharCodes.Eq || isEndOfTagSection(c)) {
          this.cbs.onattribname(this.sectionStart, this.index);
          this.sectionStart = this.index;
          this.state = State.AfterAttributeName;
          this.stateAfterAttributeName(c);
        }
      }
      stateAfterAttributeName(c) {
        if (c === CharCodes.Eq) {
          this.state = State.BeforeAttributeValue;
        } else if (c === CharCodes.Slash || c === CharCodes.Gt) {
          this.cbs.onattribend(QuoteType.NoValue, this.sectionStart);
          this.sectionStart = -1;
          this.state = State.BeforeAttributeName;
          this.stateBeforeAttributeName(c);
        } else if (!isWhitespace(c)) {
          this.cbs.onattribend(QuoteType.NoValue, this.sectionStart);
          this.state = State.InAttributeName;
          this.sectionStart = this.index;
        }
      }
      stateBeforeAttributeValue(c) {
        if (c === CharCodes.DoubleQuote) {
          this.state = State.InAttributeValueDq;
          this.sectionStart = this.index + 1;
        } else if (c === CharCodes.SingleQuote) {
          this.state = State.InAttributeValueSq;
          this.sectionStart = this.index + 1;
        } else if (!isWhitespace(c)) {
          this.sectionStart = this.index;
          this.state = State.InAttributeValueNq;
          this.stateInAttributeValueNoQuotes(c);
        }
      }
      handleInAttributeValue(c, quote) {
        if (c === quote || !this.decodeEntities && this.fastForwardTo(quote)) {
          this.cbs.onattribdata(this.sectionStart, this.index);
          this.sectionStart = -1;
          this.cbs.onattribend(quote === CharCodes.DoubleQuote ? QuoteType.Double : QuoteType.Single, this.index + 1);
          this.state = State.BeforeAttributeName;
        } else if (this.decodeEntities && c === CharCodes.Amp) {
          this.startEntity();
        }
      }
      stateInAttributeValueDoubleQuotes(c) {
        this.handleInAttributeValue(c, CharCodes.DoubleQuote);
      }
      stateInAttributeValueSingleQuotes(c) {
        this.handleInAttributeValue(c, CharCodes.SingleQuote);
      }
      stateInAttributeValueNoQuotes(c) {
        if (isWhitespace(c) || c === CharCodes.Gt) {
          this.cbs.onattribdata(this.sectionStart, this.index);
          this.sectionStart = -1;
          this.cbs.onattribend(QuoteType.Unquoted, this.index);
          this.state = State.BeforeAttributeName;
          this.stateBeforeAttributeName(c);
        } else if (this.decodeEntities && c === CharCodes.Amp) {
          this.startEntity();
        }
      }
      stateBeforeDeclaration(c) {
        if (c === CharCodes.OpeningSquareBracket) {
          this.state = State.CDATASequence;
          this.sequenceIndex = 0;
        } else {
          this.state = c === CharCodes.Dash ? State.BeforeComment : State.InDeclaration;
        }
      }
      stateInDeclaration(c) {
        if (c === CharCodes.Gt || this.fastForwardTo(CharCodes.Gt)) {
          this.cbs.ondeclaration(this.sectionStart, this.index);
          this.state = State.Text;
          this.sectionStart = this.index + 1;
        }
      }
      stateInProcessingInstruction(c) {
        if (c === CharCodes.Gt || this.fastForwardTo(CharCodes.Gt)) {
          this.cbs.onprocessinginstruction(this.sectionStart, this.index);
          this.state = State.Text;
          this.sectionStart = this.index + 1;
        }
      }
      stateBeforeComment(c) {
        if (c === CharCodes.Dash) {
          this.state = State.InCommentLike;
          this.currentSequence = Sequences.CommentEnd;
          this.sequenceIndex = 2;
          this.sectionStart = this.index + 1;
        } else {
          this.state = State.InDeclaration;
        }
      }
      stateInSpecialComment(c) {
        if (c === CharCodes.Gt || this.fastForwardTo(CharCodes.Gt)) {
          this.cbs.oncomment(this.sectionStart, this.index, 0);
          this.state = State.Text;
          this.sectionStart = this.index + 1;
        }
      }
      stateBeforeSpecialS(c) {
        const lower = c | 32;
        if (lower === Sequences.ScriptEnd[3]) {
          this.startSpecial(Sequences.ScriptEnd, 4);
        } else if (lower === Sequences.StyleEnd[3]) {
          this.startSpecial(Sequences.StyleEnd, 4);
        } else {
          this.state = State.InTagName;
          this.stateInTagName(c);
        }
      }
      stateBeforeSpecialT(c) {
        const lower = c | 32;
        switch (lower) {
          case Sequences.TitleEnd[3]: {
            this.startSpecial(Sequences.TitleEnd, 4);
            break;
          }
          case Sequences.TextareaEnd[3]: {
            this.startSpecial(Sequences.TextareaEnd, 4);
            break;
          }
          case Sequences.XmpEnd[3]: {
            this.startSpecial(Sequences.XmpEnd, 4);
            break;
          }
          default: {
            this.state = State.InTagName;
            this.stateInTagName(c);
          }
        }
      }
      startEntity() {
        this.baseState = this.state;
        this.state = State.InEntity;
        this.entityStart = this.index;
        this.entityDecoder.startEntity(this.xmlMode ? decode_1.DecodingMode.Strict : this.baseState === State.Text || this.baseState === State.InSpecialTag ? decode_1.DecodingMode.Legacy : decode_1.DecodingMode.Attribute);
      }
      stateInEntity() {
        const length = this.entityDecoder.write(this.buffer, this.index - this.offset);
        if (length >= 0) {
          this.state = this.baseState;
          if (length === 0) {
            this.index = this.entityStart;
          }
        } else {
          this.index = this.offset + this.buffer.length - 1;
        }
      }
      /**
       * Remove data that has already been consumed from the buffer.
       */
      cleanup() {
        if (this.running && this.sectionStart !== this.index) {
          if (this.state === State.Text || this.state === State.InSpecialTag && this.sequenceIndex === 0) {
            this.cbs.ontext(this.sectionStart, this.index);
            this.sectionStart = this.index;
          } else if (this.state === State.InAttributeValueDq || this.state === State.InAttributeValueSq || this.state === State.InAttributeValueNq) {
            this.cbs.onattribdata(this.sectionStart, this.index);
            this.sectionStart = this.index;
          }
        }
      }
      shouldContinue() {
        return this.index < this.buffer.length + this.offset && this.running;
      }
      /**
       * Iterates through the buffer, calling the function corresponding to the current state.
       *
       * States that are more likely to be hit are higher up, as a performance improvement.
       */
      parse() {
        while (this.shouldContinue()) {
          const c = this.buffer.charCodeAt(this.index - this.offset);
          switch (this.state) {
            case State.Text: {
              this.stateText(c);
              break;
            }
            case State.SpecialStartSequence: {
              this.stateSpecialStartSequence(c);
              break;
            }
            case State.InSpecialTag: {
              this.stateInSpecialTag(c);
              break;
            }
            case State.CDATASequence: {
              this.stateCDATASequence(c);
              break;
            }
            case State.InAttributeValueDq: {
              this.stateInAttributeValueDoubleQuotes(c);
              break;
            }
            case State.InAttributeName: {
              this.stateInAttributeName(c);
              break;
            }
            case State.InCommentLike: {
              this.stateInCommentLike(c);
              break;
            }
            case State.InSpecialComment: {
              this.stateInSpecialComment(c);
              break;
            }
            case State.BeforeAttributeName: {
              this.stateBeforeAttributeName(c);
              break;
            }
            case State.InTagName: {
              this.stateInTagName(c);
              break;
            }
            case State.InClosingTagName: {
              this.stateInClosingTagName(c);
              break;
            }
            case State.BeforeTagName: {
              this.stateBeforeTagName(c);
              break;
            }
            case State.AfterAttributeName: {
              this.stateAfterAttributeName(c);
              break;
            }
            case State.InAttributeValueSq: {
              this.stateInAttributeValueSingleQuotes(c);
              break;
            }
            case State.BeforeAttributeValue: {
              this.stateBeforeAttributeValue(c);
              break;
            }
            case State.BeforeClosingTagName: {
              this.stateBeforeClosingTagName(c);
              break;
            }
            case State.AfterClosingTagName: {
              this.stateAfterClosingTagName(c);
              break;
            }
            case State.BeforeSpecialS: {
              this.stateBeforeSpecialS(c);
              break;
            }
            case State.BeforeSpecialT: {
              this.stateBeforeSpecialT(c);
              break;
            }
            case State.InAttributeValueNq: {
              this.stateInAttributeValueNoQuotes(c);
              break;
            }
            case State.InSelfClosingTag: {
              this.stateInSelfClosingTag(c);
              break;
            }
            case State.InDeclaration: {
              this.stateInDeclaration(c);
              break;
            }
            case State.BeforeDeclaration: {
              this.stateBeforeDeclaration(c);
              break;
            }
            case State.BeforeComment: {
              this.stateBeforeComment(c);
              break;
            }
            case State.InProcessingInstruction: {
              this.stateInProcessingInstruction(c);
              break;
            }
            case State.InEntity: {
              this.stateInEntity();
              break;
            }
          }
          this.index++;
        }
        this.cleanup();
      }
      finish() {
        if (this.state === State.InEntity) {
          this.entityDecoder.end();
          this.state = this.baseState;
        }
        this.handleTrailingData();
        this.cbs.onend();
      }
      /** Handle any trailing data. */
      handleTrailingData() {
        const endIndex = this.buffer.length + this.offset;
        if (this.sectionStart >= endIndex) {
          return;
        }
        if (this.state === State.InCommentLike) {
          if (this.currentSequence === Sequences.CdataEnd) {
            this.cbs.oncdata(this.sectionStart, endIndex, 0);
          } else {
            this.cbs.oncomment(this.sectionStart, endIndex, 0);
          }
        } else if (this.state === State.InTagName || this.state === State.BeforeAttributeName || this.state === State.BeforeAttributeValue || this.state === State.AfterAttributeName || this.state === State.InAttributeName || this.state === State.InAttributeValueSq || this.state === State.InAttributeValueDq || this.state === State.InAttributeValueNq || this.state === State.InClosingTagName) {
        } else {
          this.cbs.ontext(this.sectionStart, endIndex);
        }
      }
      emitCodePoint(cp, consumed) {
        if (this.baseState !== State.Text && this.baseState !== State.InSpecialTag) {
          if (this.sectionStart < this.entityStart) {
            this.cbs.onattribdata(this.sectionStart, this.entityStart);
          }
          this.sectionStart = this.entityStart + consumed;
          this.index = this.sectionStart - 1;
          this.cbs.onattribentity(cp);
        } else {
          if (this.sectionStart < this.entityStart) {
            this.cbs.ontext(this.sectionStart, this.entityStart);
          }
          this.sectionStart = this.entityStart + consumed;
          this.index = this.sectionStart - 1;
          this.cbs.ontextentity(cp, this.sectionStart);
        }
      }
    };
    exports2.default = Tokenizer;
  }
});

// node_modules/htmlparser2/dist/commonjs/Parser.js
var require_Parser = __commonJS({
  "node_modules/htmlparser2/dist/commonjs/Parser.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Parser = void 0;
    var Tokenizer_js_1 = __importStar(require_Tokenizer());
    var decode_1 = require_decode();
    var formTags = /* @__PURE__ */ new Set([
      "input",
      "option",
      "optgroup",
      "select",
      "button",
      "datalist",
      "textarea"
    ]);
    var pTag = /* @__PURE__ */ new Set(["p"]);
    var tableSectionTags = /* @__PURE__ */ new Set(["thead", "tbody"]);
    var ddtTags = /* @__PURE__ */ new Set(["dd", "dt"]);
    var rtpTags = /* @__PURE__ */ new Set(["rt", "rp"]);
    var openImpliesClose = /* @__PURE__ */ new Map([
      ["tr", /* @__PURE__ */ new Set(["tr", "th", "td"])],
      ["th", /* @__PURE__ */ new Set(["th"])],
      ["td", /* @__PURE__ */ new Set(["thead", "th", "td"])],
      ["body", /* @__PURE__ */ new Set(["head", "link", "script"])],
      ["li", /* @__PURE__ */ new Set(["li"])],
      ["p", pTag],
      ["h1", pTag],
      ["h2", pTag],
      ["h3", pTag],
      ["h4", pTag],
      ["h5", pTag],
      ["h6", pTag],
      ["select", formTags],
      ["input", formTags],
      ["output", formTags],
      ["button", formTags],
      ["datalist", formTags],
      ["textarea", formTags],
      ["option", /* @__PURE__ */ new Set(["option"])],
      ["optgroup", /* @__PURE__ */ new Set(["optgroup", "option"])],
      ["dd", ddtTags],
      ["dt", ddtTags],
      ["address", pTag],
      ["article", pTag],
      ["aside", pTag],
      ["blockquote", pTag],
      ["details", pTag],
      ["div", pTag],
      ["dl", pTag],
      ["fieldset", pTag],
      ["figcaption", pTag],
      ["figure", pTag],
      ["footer", pTag],
      ["form", pTag],
      ["header", pTag],
      ["hr", pTag],
      ["main", pTag],
      ["nav", pTag],
      ["ol", pTag],
      ["pre", pTag],
      ["section", pTag],
      ["table", pTag],
      ["ul", pTag],
      ["rt", rtpTags],
      ["rp", rtpTags],
      ["tbody", tableSectionTags],
      ["tfoot", tableSectionTags]
    ]);
    var voidElements = /* @__PURE__ */ new Set([
      "area",
      "base",
      "basefont",
      "br",
      "col",
      "command",
      "embed",
      "frame",
      "hr",
      "img",
      "input",
      "isindex",
      "keygen",
      "link",
      "meta",
      "param",
      "source",
      "track",
      "wbr"
    ]);
    var foreignContextElements = /* @__PURE__ */ new Set(["math", "svg"]);
    var htmlIntegrationElements = /* @__PURE__ */ new Set([
      "mi",
      "mo",
      "mn",
      "ms",
      "mtext",
      "annotation-xml",
      "foreignobject",
      "desc",
      "title"
    ]);
    var reNameEnd = /\s|\//;
    var Parser = class {
      constructor(cbs, options = {}) {
        var _a, _b, _c, _d, _e, _f;
        this.options = options;
        this.startIndex = 0;
        this.endIndex = 0;
        this.openTagStart = 0;
        this.tagname = "";
        this.attribname = "";
        this.attribvalue = "";
        this.attribs = null;
        this.stack = [];
        this.buffers = [];
        this.bufferOffset = 0;
        this.writeIndex = 0;
        this.ended = false;
        this.cbs = cbs !== null && cbs !== void 0 ? cbs : {};
        this.htmlMode = !this.options.xmlMode;
        this.lowerCaseTagNames = (_a = options.lowerCaseTags) !== null && _a !== void 0 ? _a : this.htmlMode;
        this.lowerCaseAttributeNames = (_b = options.lowerCaseAttributeNames) !== null && _b !== void 0 ? _b : this.htmlMode;
        this.recognizeSelfClosing = (_c = options.recognizeSelfClosing) !== null && _c !== void 0 ? _c : !this.htmlMode;
        this.tokenizer = new ((_d = options.Tokenizer) !== null && _d !== void 0 ? _d : Tokenizer_js_1.default)(this.options, this);
        this.foreignContext = [!this.htmlMode];
        (_f = (_e = this.cbs).onparserinit) === null || _f === void 0 ? void 0 : _f.call(_e, this);
      }
      // Tokenizer event handlers
      /** @internal */
      ontext(start, endIndex) {
        var _a, _b;
        const data = this.getSlice(start, endIndex);
        this.endIndex = endIndex - 1;
        (_b = (_a = this.cbs).ontext) === null || _b === void 0 ? void 0 : _b.call(_a, data);
        this.startIndex = endIndex;
      }
      /** @internal */
      ontextentity(cp, endIndex) {
        var _a, _b;
        this.endIndex = endIndex - 1;
        (_b = (_a = this.cbs).ontext) === null || _b === void 0 ? void 0 : _b.call(_a, (0, decode_1.fromCodePoint)(cp));
        this.startIndex = endIndex;
      }
      /**
       * Checks if the current tag is a void element. Override this if you want
       * to specify your own additional void elements.
       */
      isVoidElement(name) {
        return this.htmlMode && voidElements.has(name);
      }
      /** @internal */
      onopentagname(start, endIndex) {
        this.endIndex = endIndex;
        let name = this.getSlice(start, endIndex);
        if (this.lowerCaseTagNames) {
          name = name.toLowerCase();
        }
        this.emitOpenTag(name);
      }
      emitOpenTag(name) {
        var _a, _b, _c, _d;
        this.openTagStart = this.startIndex;
        this.tagname = name;
        const impliesClose = this.htmlMode && openImpliesClose.get(name);
        if (impliesClose) {
          while (this.stack.length > 0 && impliesClose.has(this.stack[0])) {
            const element = this.stack.shift();
            (_b = (_a = this.cbs).onclosetag) === null || _b === void 0 ? void 0 : _b.call(_a, element, true);
          }
        }
        if (!this.isVoidElement(name)) {
          this.stack.unshift(name);
          if (this.htmlMode) {
            if (foreignContextElements.has(name)) {
              this.foreignContext.unshift(true);
            } else if (htmlIntegrationElements.has(name)) {
              this.foreignContext.unshift(false);
            }
          }
        }
        (_d = (_c = this.cbs).onopentagname) === null || _d === void 0 ? void 0 : _d.call(_c, name);
        if (this.cbs.onopentag)
          this.attribs = {};
      }
      endOpenTag(isImplied) {
        var _a, _b;
        this.startIndex = this.openTagStart;
        if (this.attribs) {
          (_b = (_a = this.cbs).onopentag) === null || _b === void 0 ? void 0 : _b.call(_a, this.tagname, this.attribs, isImplied);
          this.attribs = null;
        }
        if (this.cbs.onclosetag && this.isVoidElement(this.tagname)) {
          this.cbs.onclosetag(this.tagname, true);
        }
        this.tagname = "";
      }
      /** @internal */
      onopentagend(endIndex) {
        this.endIndex = endIndex;
        this.endOpenTag(false);
        this.startIndex = endIndex + 1;
      }
      /** @internal */
      onclosetag(start, endIndex) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        this.endIndex = endIndex;
        let name = this.getSlice(start, endIndex);
        if (this.lowerCaseTagNames) {
          name = name.toLowerCase();
        }
        if (this.htmlMode && (foreignContextElements.has(name) || htmlIntegrationElements.has(name))) {
          this.foreignContext.shift();
        }
        if (!this.isVoidElement(name)) {
          const pos = this.stack.indexOf(name);
          if (pos !== -1) {
            for (let index = 0; index <= pos; index++) {
              const element = this.stack.shift();
              (_b = (_a = this.cbs).onclosetag) === null || _b === void 0 ? void 0 : _b.call(_a, element, index !== pos);
            }
          } else if (this.htmlMode && name === "p") {
            this.emitOpenTag("p");
            this.closeCurrentTag(true);
          }
        } else if (this.htmlMode && name === "br") {
          (_d = (_c = this.cbs).onopentagname) === null || _d === void 0 ? void 0 : _d.call(_c, "br");
          (_f = (_e = this.cbs).onopentag) === null || _f === void 0 ? void 0 : _f.call(_e, "br", {}, true);
          (_h = (_g = this.cbs).onclosetag) === null || _h === void 0 ? void 0 : _h.call(_g, "br", false);
        }
        this.startIndex = endIndex + 1;
      }
      /** @internal */
      onselfclosingtag(endIndex) {
        this.endIndex = endIndex;
        if (this.recognizeSelfClosing || this.foreignContext[0]) {
          this.closeCurrentTag(false);
          this.startIndex = endIndex + 1;
        } else {
          this.onopentagend(endIndex);
        }
      }
      closeCurrentTag(isOpenImplied) {
        var _a, _b;
        const name = this.tagname;
        this.endOpenTag(isOpenImplied);
        if (this.stack[0] === name) {
          (_b = (_a = this.cbs).onclosetag) === null || _b === void 0 ? void 0 : _b.call(_a, name, !isOpenImplied);
          this.stack.shift();
        }
      }
      /** @internal */
      onattribname(start, endIndex) {
        this.startIndex = start;
        const name = this.getSlice(start, endIndex);
        this.attribname = this.lowerCaseAttributeNames ? name.toLowerCase() : name;
      }
      /** @internal */
      onattribdata(start, endIndex) {
        this.attribvalue += this.getSlice(start, endIndex);
      }
      /** @internal */
      onattribentity(cp) {
        this.attribvalue += (0, decode_1.fromCodePoint)(cp);
      }
      /** @internal */
      onattribend(quote, endIndex) {
        var _a, _b;
        this.endIndex = endIndex;
        (_b = (_a = this.cbs).onattribute) === null || _b === void 0 ? void 0 : _b.call(_a, this.attribname, this.attribvalue, quote === Tokenizer_js_1.QuoteType.Double ? '"' : quote === Tokenizer_js_1.QuoteType.Single ? "'" : quote === Tokenizer_js_1.QuoteType.NoValue ? void 0 : null);
        if (this.attribs && !Object.prototype.hasOwnProperty.call(this.attribs, this.attribname)) {
          this.attribs[this.attribname] = this.attribvalue;
        }
        this.attribvalue = "";
      }
      getInstructionName(value) {
        const index = value.search(reNameEnd);
        let name = index < 0 ? value : value.substr(0, index);
        if (this.lowerCaseTagNames) {
          name = name.toLowerCase();
        }
        return name;
      }
      /** @internal */
      ondeclaration(start, endIndex) {
        this.endIndex = endIndex;
        const value = this.getSlice(start, endIndex);
        if (this.cbs.onprocessinginstruction) {
          const name = this.getInstructionName(value);
          this.cbs.onprocessinginstruction(`!${name}`, `!${value}`);
        }
        this.startIndex = endIndex + 1;
      }
      /** @internal */
      onprocessinginstruction(start, endIndex) {
        this.endIndex = endIndex;
        const value = this.getSlice(start, endIndex);
        if (this.cbs.onprocessinginstruction) {
          const name = this.getInstructionName(value);
          this.cbs.onprocessinginstruction(`?${name}`, `?${value}`);
        }
        this.startIndex = endIndex + 1;
      }
      /** @internal */
      oncomment(start, endIndex, offset) {
        var _a, _b, _c, _d;
        this.endIndex = endIndex;
        (_b = (_a = this.cbs).oncomment) === null || _b === void 0 ? void 0 : _b.call(_a, this.getSlice(start, endIndex - offset));
        (_d = (_c = this.cbs).oncommentend) === null || _d === void 0 ? void 0 : _d.call(_c);
        this.startIndex = endIndex + 1;
      }
      /** @internal */
      oncdata(start, endIndex, offset) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        this.endIndex = endIndex;
        const value = this.getSlice(start, endIndex - offset);
        if (!this.htmlMode || this.options.recognizeCDATA) {
          (_b = (_a = this.cbs).oncdatastart) === null || _b === void 0 ? void 0 : _b.call(_a);
          (_d = (_c = this.cbs).ontext) === null || _d === void 0 ? void 0 : _d.call(_c, value);
          (_f = (_e = this.cbs).oncdataend) === null || _f === void 0 ? void 0 : _f.call(_e);
        } else {
          (_h = (_g = this.cbs).oncomment) === null || _h === void 0 ? void 0 : _h.call(_g, `[CDATA[${value}]]`);
          (_k = (_j = this.cbs).oncommentend) === null || _k === void 0 ? void 0 : _k.call(_j);
        }
        this.startIndex = endIndex + 1;
      }
      /** @internal */
      onend() {
        var _a, _b;
        if (this.cbs.onclosetag) {
          this.endIndex = this.startIndex;
          for (let index = 0; index < this.stack.length; index++) {
            this.cbs.onclosetag(this.stack[index], true);
          }
        }
        (_b = (_a = this.cbs).onend) === null || _b === void 0 ? void 0 : _b.call(_a);
      }
      /**
       * Resets the parser to a blank state, ready to parse a new HTML document
       */
      reset() {
        var _a, _b, _c, _d;
        (_b = (_a = this.cbs).onreset) === null || _b === void 0 ? void 0 : _b.call(_a);
        this.tokenizer.reset();
        this.tagname = "";
        this.attribname = "";
        this.attribs = null;
        this.stack.length = 0;
        this.startIndex = 0;
        this.endIndex = 0;
        (_d = (_c = this.cbs).onparserinit) === null || _d === void 0 ? void 0 : _d.call(_c, this);
        this.buffers.length = 0;
        this.foreignContext.length = 0;
        this.foreignContext.unshift(!this.htmlMode);
        this.bufferOffset = 0;
        this.writeIndex = 0;
        this.ended = false;
      }
      /**
       * Resets the parser, then parses a complete document and
       * pushes it to the handler.
       *
       * @param data Document to parse.
       */
      parseComplete(data) {
        this.reset();
        this.end(data);
      }
      getSlice(start, end) {
        while (start - this.bufferOffset >= this.buffers[0].length) {
          this.shiftBuffer();
        }
        let slice = this.buffers[0].slice(start - this.bufferOffset, end - this.bufferOffset);
        while (end - this.bufferOffset > this.buffers[0].length) {
          this.shiftBuffer();
          slice += this.buffers[0].slice(0, end - this.bufferOffset);
        }
        return slice;
      }
      shiftBuffer() {
        this.bufferOffset += this.buffers[0].length;
        this.writeIndex--;
        this.buffers.shift();
      }
      /**
       * Parses a chunk of data and calls the corresponding callbacks.
       *
       * @param chunk Chunk to parse.
       */
      write(chunk) {
        var _a, _b;
        if (this.ended) {
          (_b = (_a = this.cbs).onerror) === null || _b === void 0 ? void 0 : _b.call(_a, new Error(".write() after done!"));
          return;
        }
        this.buffers.push(chunk);
        if (this.tokenizer.running) {
          this.tokenizer.write(chunk);
          this.writeIndex++;
        }
      }
      /**
       * Parses the end of the buffer and clears the stack, calls onend.
       *
       * @param chunk Optional final chunk to parse.
       */
      end(chunk) {
        var _a, _b;
        if (this.ended) {
          (_b = (_a = this.cbs).onerror) === null || _b === void 0 ? void 0 : _b.call(_a, new Error(".end() after done!"));
          return;
        }
        if (chunk)
          this.write(chunk);
        this.ended = true;
        this.tokenizer.end();
      }
      /**
       * Pauses parsing. The parser won't emit events until `resume` is called.
       */
      pause() {
        this.tokenizer.pause();
      }
      /**
       * Resumes parsing after `pause` was called.
       */
      resume() {
        this.tokenizer.resume();
        while (this.tokenizer.running && this.writeIndex < this.buffers.length) {
          this.tokenizer.write(this.buffers[this.writeIndex++]);
        }
        if (this.ended)
          this.tokenizer.end();
      }
      /**
       * Alias of `write`, for backwards compatibility.
       *
       * @param chunk Chunk to parse.
       * @deprecated
       */
      parseChunk(chunk) {
        this.write(chunk);
      }
      /**
       * Alias of `end`, for backwards compatibility.
       *
       * @param chunk Optional final chunk to parse.
       * @deprecated
       */
      done(chunk) {
        this.end(chunk);
      }
    };
    exports2.Parser = Parser;
  }
});

// node_modules/domelementtype/lib/index.js
var require_lib = __commonJS({
  "node_modules/domelementtype/lib/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Doctype = exports2.CDATA = exports2.Tag = exports2.Style = exports2.Script = exports2.Comment = exports2.Directive = exports2.Text = exports2.Root = exports2.isTag = exports2.ElementType = void 0;
    var ElementType;
    (function(ElementType2) {
      ElementType2["Root"] = "root";
      ElementType2["Text"] = "text";
      ElementType2["Directive"] = "directive";
      ElementType2["Comment"] = "comment";
      ElementType2["Script"] = "script";
      ElementType2["Style"] = "style";
      ElementType2["Tag"] = "tag";
      ElementType2["CDATA"] = "cdata";
      ElementType2["Doctype"] = "doctype";
    })(ElementType = exports2.ElementType || (exports2.ElementType = {}));
    function isTag(elem) {
      return elem.type === ElementType.Tag || elem.type === ElementType.Script || elem.type === ElementType.Style;
    }
    exports2.isTag = isTag;
    exports2.Root = ElementType.Root;
    exports2.Text = ElementType.Text;
    exports2.Directive = ElementType.Directive;
    exports2.Comment = ElementType.Comment;
    exports2.Script = ElementType.Script;
    exports2.Style = ElementType.Style;
    exports2.Tag = ElementType.Tag;
    exports2.CDATA = ElementType.CDATA;
    exports2.Doctype = ElementType.Doctype;
  }
});

// node_modules/domhandler/lib/node.js
var require_node = __commonJS({
  "node_modules/domhandler/lib/node.js"(exports2) {
    "use strict";
    var __extends = exports2 && exports2.__extends || /* @__PURE__ */ (function() {
      var extendStatics = function(d, b) {
        extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
          d2.__proto__ = b2;
        } || function(d2, b2) {
          for (var p in b2) if (Object.prototype.hasOwnProperty.call(b2, p)) d2[p] = b2[p];
        };
        return extendStatics(d, b);
      };
      return function(d, b) {
        if (typeof b !== "function" && b !== null)
          throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() {
          this.constructor = d;
        }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
      };
    })();
    var __assign = exports2 && exports2.__assign || function() {
      __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
        }
        return t;
      };
      return __assign.apply(this, arguments);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.cloneNode = exports2.hasChildren = exports2.isDocument = exports2.isDirective = exports2.isComment = exports2.isText = exports2.isCDATA = exports2.isTag = exports2.Element = exports2.Document = exports2.CDATA = exports2.NodeWithChildren = exports2.ProcessingInstruction = exports2.Comment = exports2.Text = exports2.DataNode = exports2.Node = void 0;
    var domelementtype_1 = require_lib();
    var Node = (
      /** @class */
      (function() {
        function Node2() {
          this.parent = null;
          this.prev = null;
          this.next = null;
          this.startIndex = null;
          this.endIndex = null;
        }
        Object.defineProperty(Node2.prototype, "parentNode", {
          // Read-write aliases for properties
          /**
           * Same as {@link parent}.
           * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
           */
          get: function() {
            return this.parent;
          },
          set: function(parent) {
            this.parent = parent;
          },
          enumerable: false,
          configurable: true
        });
        Object.defineProperty(Node2.prototype, "previousSibling", {
          /**
           * Same as {@link prev}.
           * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
           */
          get: function() {
            return this.prev;
          },
          set: function(prev) {
            this.prev = prev;
          },
          enumerable: false,
          configurable: true
        });
        Object.defineProperty(Node2.prototype, "nextSibling", {
          /**
           * Same as {@link next}.
           * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
           */
          get: function() {
            return this.next;
          },
          set: function(next) {
            this.next = next;
          },
          enumerable: false,
          configurable: true
        });
        Node2.prototype.cloneNode = function(recursive) {
          if (recursive === void 0) {
            recursive = false;
          }
          return cloneNode(this, recursive);
        };
        return Node2;
      })()
    );
    exports2.Node = Node;
    var DataNode = (
      /** @class */
      (function(_super) {
        __extends(DataNode2, _super);
        function DataNode2(data) {
          var _this = _super.call(this) || this;
          _this.data = data;
          return _this;
        }
        Object.defineProperty(DataNode2.prototype, "nodeValue", {
          /**
           * Same as {@link data}.
           * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
           */
          get: function() {
            return this.data;
          },
          set: function(data) {
            this.data = data;
          },
          enumerable: false,
          configurable: true
        });
        return DataNode2;
      })(Node)
    );
    exports2.DataNode = DataNode;
    var Text = (
      /** @class */
      (function(_super) {
        __extends(Text2, _super);
        function Text2() {
          var _this = _super !== null && _super.apply(this, arguments) || this;
          _this.type = domelementtype_1.ElementType.Text;
          return _this;
        }
        Object.defineProperty(Text2.prototype, "nodeType", {
          get: function() {
            return 3;
          },
          enumerable: false,
          configurable: true
        });
        return Text2;
      })(DataNode)
    );
    exports2.Text = Text;
    var Comment = (
      /** @class */
      (function(_super) {
        __extends(Comment2, _super);
        function Comment2() {
          var _this = _super !== null && _super.apply(this, arguments) || this;
          _this.type = domelementtype_1.ElementType.Comment;
          return _this;
        }
        Object.defineProperty(Comment2.prototype, "nodeType", {
          get: function() {
            return 8;
          },
          enumerable: false,
          configurable: true
        });
        return Comment2;
      })(DataNode)
    );
    exports2.Comment = Comment;
    var ProcessingInstruction = (
      /** @class */
      (function(_super) {
        __extends(ProcessingInstruction2, _super);
        function ProcessingInstruction2(name, data) {
          var _this = _super.call(this, data) || this;
          _this.name = name;
          _this.type = domelementtype_1.ElementType.Directive;
          return _this;
        }
        Object.defineProperty(ProcessingInstruction2.prototype, "nodeType", {
          get: function() {
            return 1;
          },
          enumerable: false,
          configurable: true
        });
        return ProcessingInstruction2;
      })(DataNode)
    );
    exports2.ProcessingInstruction = ProcessingInstruction;
    var NodeWithChildren = (
      /** @class */
      (function(_super) {
        __extends(NodeWithChildren2, _super);
        function NodeWithChildren2(children) {
          var _this = _super.call(this) || this;
          _this.children = children;
          return _this;
        }
        Object.defineProperty(NodeWithChildren2.prototype, "firstChild", {
          // Aliases
          /** First child of the node. */
          get: function() {
            var _a;
            return (_a = this.children[0]) !== null && _a !== void 0 ? _a : null;
          },
          enumerable: false,
          configurable: true
        });
        Object.defineProperty(NodeWithChildren2.prototype, "lastChild", {
          /** Last child of the node. */
          get: function() {
            return this.children.length > 0 ? this.children[this.children.length - 1] : null;
          },
          enumerable: false,
          configurable: true
        });
        Object.defineProperty(NodeWithChildren2.prototype, "childNodes", {
          /**
           * Same as {@link children}.
           * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
           */
          get: function() {
            return this.children;
          },
          set: function(children) {
            this.children = children;
          },
          enumerable: false,
          configurable: true
        });
        return NodeWithChildren2;
      })(Node)
    );
    exports2.NodeWithChildren = NodeWithChildren;
    var CDATA = (
      /** @class */
      (function(_super) {
        __extends(CDATA2, _super);
        function CDATA2() {
          var _this = _super !== null && _super.apply(this, arguments) || this;
          _this.type = domelementtype_1.ElementType.CDATA;
          return _this;
        }
        Object.defineProperty(CDATA2.prototype, "nodeType", {
          get: function() {
            return 4;
          },
          enumerable: false,
          configurable: true
        });
        return CDATA2;
      })(NodeWithChildren)
    );
    exports2.CDATA = CDATA;
    var Document = (
      /** @class */
      (function(_super) {
        __extends(Document2, _super);
        function Document2() {
          var _this = _super !== null && _super.apply(this, arguments) || this;
          _this.type = domelementtype_1.ElementType.Root;
          return _this;
        }
        Object.defineProperty(Document2.prototype, "nodeType", {
          get: function() {
            return 9;
          },
          enumerable: false,
          configurable: true
        });
        return Document2;
      })(NodeWithChildren)
    );
    exports2.Document = Document;
    var Element = (
      /** @class */
      (function(_super) {
        __extends(Element2, _super);
        function Element2(name, attribs, children, type) {
          if (children === void 0) {
            children = [];
          }
          if (type === void 0) {
            type = name === "script" ? domelementtype_1.ElementType.Script : name === "style" ? domelementtype_1.ElementType.Style : domelementtype_1.ElementType.Tag;
          }
          var _this = _super.call(this, children) || this;
          _this.name = name;
          _this.attribs = attribs;
          _this.type = type;
          return _this;
        }
        Object.defineProperty(Element2.prototype, "nodeType", {
          get: function() {
            return 1;
          },
          enumerable: false,
          configurable: true
        });
        Object.defineProperty(Element2.prototype, "tagName", {
          // DOM Level 1 aliases
          /**
           * Same as {@link name}.
           * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
           */
          get: function() {
            return this.name;
          },
          set: function(name) {
            this.name = name;
          },
          enumerable: false,
          configurable: true
        });
        Object.defineProperty(Element2.prototype, "attributes", {
          get: function() {
            var _this = this;
            return Object.keys(this.attribs).map(function(name) {
              var _a, _b;
              return {
                name,
                value: _this.attribs[name],
                namespace: (_a = _this["x-attribsNamespace"]) === null || _a === void 0 ? void 0 : _a[name],
                prefix: (_b = _this["x-attribsPrefix"]) === null || _b === void 0 ? void 0 : _b[name]
              };
            });
          },
          enumerable: false,
          configurable: true
        });
        return Element2;
      })(NodeWithChildren)
    );
    exports2.Element = Element;
    function isTag(node) {
      return (0, domelementtype_1.isTag)(node);
    }
    exports2.isTag = isTag;
    function isCDATA(node) {
      return node.type === domelementtype_1.ElementType.CDATA;
    }
    exports2.isCDATA = isCDATA;
    function isText(node) {
      return node.type === domelementtype_1.ElementType.Text;
    }
    exports2.isText = isText;
    function isComment(node) {
      return node.type === domelementtype_1.ElementType.Comment;
    }
    exports2.isComment = isComment;
    function isDirective(node) {
      return node.type === domelementtype_1.ElementType.Directive;
    }
    exports2.isDirective = isDirective;
    function isDocument(node) {
      return node.type === domelementtype_1.ElementType.Root;
    }
    exports2.isDocument = isDocument;
    function hasChildren(node) {
      return Object.prototype.hasOwnProperty.call(node, "children");
    }
    exports2.hasChildren = hasChildren;
    function cloneNode(node, recursive) {
      if (recursive === void 0) {
        recursive = false;
      }
      var result;
      if (isText(node)) {
        result = new Text(node.data);
      } else if (isComment(node)) {
        result = new Comment(node.data);
      } else if (isTag(node)) {
        var children = recursive ? cloneChildren(node.children) : [];
        var clone_1 = new Element(node.name, __assign({}, node.attribs), children);
        children.forEach(function(child) {
          return child.parent = clone_1;
        });
        if (node.namespace != null) {
          clone_1.namespace = node.namespace;
        }
        if (node["x-attribsNamespace"]) {
          clone_1["x-attribsNamespace"] = __assign({}, node["x-attribsNamespace"]);
        }
        if (node["x-attribsPrefix"]) {
          clone_1["x-attribsPrefix"] = __assign({}, node["x-attribsPrefix"]);
        }
        result = clone_1;
      } else if (isCDATA(node)) {
        var children = recursive ? cloneChildren(node.children) : [];
        var clone_2 = new CDATA(children);
        children.forEach(function(child) {
          return child.parent = clone_2;
        });
        result = clone_2;
      } else if (isDocument(node)) {
        var children = recursive ? cloneChildren(node.children) : [];
        var clone_3 = new Document(children);
        children.forEach(function(child) {
          return child.parent = clone_3;
        });
        if (node["x-mode"]) {
          clone_3["x-mode"] = node["x-mode"];
        }
        result = clone_3;
      } else if (isDirective(node)) {
        var instruction = new ProcessingInstruction(node.name, node.data);
        if (node["x-name"] != null) {
          instruction["x-name"] = node["x-name"];
          instruction["x-publicId"] = node["x-publicId"];
          instruction["x-systemId"] = node["x-systemId"];
        }
        result = instruction;
      } else {
        throw new Error("Not implemented yet: ".concat(node.type));
      }
      result.startIndex = node.startIndex;
      result.endIndex = node.endIndex;
      if (node.sourceCodeLocation != null) {
        result.sourceCodeLocation = node.sourceCodeLocation;
      }
      return result;
    }
    exports2.cloneNode = cloneNode;
    function cloneChildren(childs) {
      var children = childs.map(function(child) {
        return cloneNode(child, true);
      });
      for (var i = 1; i < children.length; i++) {
        children[i].prev = children[i - 1];
        children[i - 1].next = children[i];
      }
      return children;
    }
  }
});

// node_modules/domhandler/lib/index.js
var require_lib2 = __commonJS({
  "node_modules/domhandler/lib/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DomHandler = void 0;
    var domelementtype_1 = require_lib();
    var node_js_1 = require_node();
    __exportStar(require_node(), exports2);
    var defaultOpts = {
      withStartIndices: false,
      withEndIndices: false,
      xmlMode: false
    };
    var DomHandler = (
      /** @class */
      (function() {
        function DomHandler2(callback, options, elementCB) {
          this.dom = [];
          this.root = new node_js_1.Document(this.dom);
          this.done = false;
          this.tagStack = [this.root];
          this.lastNode = null;
          this.parser = null;
          if (typeof options === "function") {
            elementCB = options;
            options = defaultOpts;
          }
          if (typeof callback === "object") {
            options = callback;
            callback = void 0;
          }
          this.callback = callback !== null && callback !== void 0 ? callback : null;
          this.options = options !== null && options !== void 0 ? options : defaultOpts;
          this.elementCB = elementCB !== null && elementCB !== void 0 ? elementCB : null;
        }
        DomHandler2.prototype.onparserinit = function(parser) {
          this.parser = parser;
        };
        DomHandler2.prototype.onreset = function() {
          this.dom = [];
          this.root = new node_js_1.Document(this.dom);
          this.done = false;
          this.tagStack = [this.root];
          this.lastNode = null;
          this.parser = null;
        };
        DomHandler2.prototype.onend = function() {
          if (this.done)
            return;
          this.done = true;
          this.parser = null;
          this.handleCallback(null);
        };
        DomHandler2.prototype.onerror = function(error) {
          this.handleCallback(error);
        };
        DomHandler2.prototype.onclosetag = function() {
          this.lastNode = null;
          var elem = this.tagStack.pop();
          if (this.options.withEndIndices) {
            elem.endIndex = this.parser.endIndex;
          }
          if (this.elementCB)
            this.elementCB(elem);
        };
        DomHandler2.prototype.onopentag = function(name, attribs) {
          var type = this.options.xmlMode ? domelementtype_1.ElementType.Tag : void 0;
          var element = new node_js_1.Element(name, attribs, void 0, type);
          this.addNode(element);
          this.tagStack.push(element);
        };
        DomHandler2.prototype.ontext = function(data) {
          var lastNode = this.lastNode;
          if (lastNode && lastNode.type === domelementtype_1.ElementType.Text) {
            lastNode.data += data;
            if (this.options.withEndIndices) {
              lastNode.endIndex = this.parser.endIndex;
            }
          } else {
            var node = new node_js_1.Text(data);
            this.addNode(node);
            this.lastNode = node;
          }
        };
        DomHandler2.prototype.oncomment = function(data) {
          if (this.lastNode && this.lastNode.type === domelementtype_1.ElementType.Comment) {
            this.lastNode.data += data;
            return;
          }
          var node = new node_js_1.Comment(data);
          this.addNode(node);
          this.lastNode = node;
        };
        DomHandler2.prototype.oncommentend = function() {
          this.lastNode = null;
        };
        DomHandler2.prototype.oncdatastart = function() {
          var text = new node_js_1.Text("");
          var node = new node_js_1.CDATA([text]);
          this.addNode(node);
          text.parent = node;
          this.lastNode = text;
        };
        DomHandler2.prototype.oncdataend = function() {
          this.lastNode = null;
        };
        DomHandler2.prototype.onprocessinginstruction = function(name, data) {
          var node = new node_js_1.ProcessingInstruction(name, data);
          this.addNode(node);
        };
        DomHandler2.prototype.handleCallback = function(error) {
          if (typeof this.callback === "function") {
            this.callback(error, this.dom);
          } else if (error) {
            throw error;
          }
        };
        DomHandler2.prototype.addNode = function(node) {
          var parent = this.tagStack[this.tagStack.length - 1];
          var previousSibling = parent.children[parent.children.length - 1];
          if (this.options.withStartIndices) {
            node.startIndex = this.parser.startIndex;
          }
          if (this.options.withEndIndices) {
            node.endIndex = this.parser.endIndex;
          }
          parent.children.push(node);
          if (previousSibling) {
            node.prev = previousSibling;
            previousSibling.next = node;
          }
          node.parent = parent;
          this.lastNode = null;
        };
        return DomHandler2;
      })()
    );
    exports2.DomHandler = DomHandler;
    exports2.default = DomHandler;
  }
});

// node_modules/dom-serializer/node_modules/entities/lib/generated/decode-data-html.js
var require_decode_data_html2 = __commonJS({
  "node_modules/dom-serializer/node_modules/entities/lib/generated/decode-data-html.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = new Uint16Array(
      // prettier-ignore
      '\u1D41<\xD5\u0131\u028A\u049D\u057B\u05D0\u0675\u06DE\u07A2\u07D6\u080F\u0A4A\u0A91\u0DA1\u0E6D\u0F09\u0F26\u10CA\u1228\u12E1\u1415\u149D\u14C3\u14DF\u1525\0\0\0\0\0\0\u156B\u16CD\u198D\u1C12\u1DDD\u1F7E\u2060\u21B0\u228D\u23C0\u23FB\u2442\u2824\u2912\u2D08\u2E48\u2FCE\u3016\u32BA\u3639\u37AC\u38FE\u3A28\u3A71\u3AE0\u3B2E\u0800EMabcfglmnoprstu\\bfms\x7F\x84\x8B\x90\x95\x98\xA6\xB3\xB9\xC8\xCFlig\u803B\xC6\u40C6P\u803B&\u4026cute\u803B\xC1\u40C1reve;\u4102\u0100iyx}rc\u803B\xC2\u40C2;\u4410r;\uC000\u{1D504}rave\u803B\xC0\u40C0pha;\u4391acr;\u4100d;\u6A53\u0100gp\x9D\xA1on;\u4104f;\uC000\u{1D538}plyFunction;\u6061ing\u803B\xC5\u40C5\u0100cs\xBE\xC3r;\uC000\u{1D49C}ign;\u6254ilde\u803B\xC3\u40C3ml\u803B\xC4\u40C4\u0400aceforsu\xE5\xFB\xFE\u0117\u011C\u0122\u0127\u012A\u0100cr\xEA\xF2kslash;\u6216\u0176\xF6\xF8;\u6AE7ed;\u6306y;\u4411\u0180crt\u0105\u010B\u0114ause;\u6235noullis;\u612Ca;\u4392r;\uC000\u{1D505}pf;\uC000\u{1D539}eve;\u42D8c\xF2\u0113mpeq;\u624E\u0700HOacdefhilorsu\u014D\u0151\u0156\u0180\u019E\u01A2\u01B5\u01B7\u01BA\u01DC\u0215\u0273\u0278\u027Ecy;\u4427PY\u803B\xA9\u40A9\u0180cpy\u015D\u0162\u017Aute;\u4106\u0100;i\u0167\u0168\u62D2talDifferentialD;\u6145leys;\u612D\u0200aeio\u0189\u018E\u0194\u0198ron;\u410Cdil\u803B\xC7\u40C7rc;\u4108nint;\u6230ot;\u410A\u0100dn\u01A7\u01ADilla;\u40B8terDot;\u40B7\xF2\u017Fi;\u43A7rcle\u0200DMPT\u01C7\u01CB\u01D1\u01D6ot;\u6299inus;\u6296lus;\u6295imes;\u6297o\u0100cs\u01E2\u01F8kwiseContourIntegral;\u6232eCurly\u0100DQ\u0203\u020FoubleQuote;\u601Duote;\u6019\u0200lnpu\u021E\u0228\u0247\u0255on\u0100;e\u0225\u0226\u6237;\u6A74\u0180git\u022F\u0236\u023Aruent;\u6261nt;\u622FourIntegral;\u622E\u0100fr\u024C\u024E;\u6102oduct;\u6210nterClockwiseContourIntegral;\u6233oss;\u6A2Fcr;\uC000\u{1D49E}p\u0100;C\u0284\u0285\u62D3ap;\u624D\u0580DJSZacefios\u02A0\u02AC\u02B0\u02B4\u02B8\u02CB\u02D7\u02E1\u02E6\u0333\u048D\u0100;o\u0179\u02A5trahd;\u6911cy;\u4402cy;\u4405cy;\u440F\u0180grs\u02BF\u02C4\u02C7ger;\u6021r;\u61A1hv;\u6AE4\u0100ay\u02D0\u02D5ron;\u410E;\u4414l\u0100;t\u02DD\u02DE\u6207a;\u4394r;\uC000\u{1D507}\u0100af\u02EB\u0327\u0100cm\u02F0\u0322ritical\u0200ADGT\u0300\u0306\u0316\u031Ccute;\u40B4o\u0174\u030B\u030D;\u42D9bleAcute;\u42DDrave;\u4060ilde;\u42DCond;\u62C4ferentialD;\u6146\u0470\u033D\0\0\0\u0342\u0354\0\u0405f;\uC000\u{1D53B}\u0180;DE\u0348\u0349\u034D\u40A8ot;\u60DCqual;\u6250ble\u0300CDLRUV\u0363\u0372\u0382\u03CF\u03E2\u03F8ontourIntegra\xEC\u0239o\u0274\u0379\0\0\u037B\xBB\u0349nArrow;\u61D3\u0100eo\u0387\u03A4ft\u0180ART\u0390\u0396\u03A1rrow;\u61D0ightArrow;\u61D4e\xE5\u02CAng\u0100LR\u03AB\u03C4eft\u0100AR\u03B3\u03B9rrow;\u67F8ightArrow;\u67FAightArrow;\u67F9ight\u0100AT\u03D8\u03DErrow;\u61D2ee;\u62A8p\u0241\u03E9\0\0\u03EFrrow;\u61D1ownArrow;\u61D5erticalBar;\u6225n\u0300ABLRTa\u0412\u042A\u0430\u045E\u047F\u037Crrow\u0180;BU\u041D\u041E\u0422\u6193ar;\u6913pArrow;\u61F5reve;\u4311eft\u02D2\u043A\0\u0446\0\u0450ightVector;\u6950eeVector;\u695Eector\u0100;B\u0459\u045A\u61BDar;\u6956ight\u01D4\u0467\0\u0471eeVector;\u695Fector\u0100;B\u047A\u047B\u61C1ar;\u6957ee\u0100;A\u0486\u0487\u62A4rrow;\u61A7\u0100ct\u0492\u0497r;\uC000\u{1D49F}rok;\u4110\u0800NTacdfglmopqstux\u04BD\u04C0\u04C4\u04CB\u04DE\u04E2\u04E7\u04EE\u04F5\u0521\u052F\u0536\u0552\u055D\u0560\u0565G;\u414AH\u803B\xD0\u40D0cute\u803B\xC9\u40C9\u0180aiy\u04D2\u04D7\u04DCron;\u411Arc\u803B\xCA\u40CA;\u442Dot;\u4116r;\uC000\u{1D508}rave\u803B\xC8\u40C8ement;\u6208\u0100ap\u04FA\u04FEcr;\u4112ty\u0253\u0506\0\0\u0512mallSquare;\u65FBerySmallSquare;\u65AB\u0100gp\u0526\u052Aon;\u4118f;\uC000\u{1D53C}silon;\u4395u\u0100ai\u053C\u0549l\u0100;T\u0542\u0543\u6A75ilde;\u6242librium;\u61CC\u0100ci\u0557\u055Ar;\u6130m;\u6A73a;\u4397ml\u803B\xCB\u40CB\u0100ip\u056A\u056Fsts;\u6203onentialE;\u6147\u0280cfios\u0585\u0588\u058D\u05B2\u05CCy;\u4424r;\uC000\u{1D509}lled\u0253\u0597\0\0\u05A3mallSquare;\u65FCerySmallSquare;\u65AA\u0370\u05BA\0\u05BF\0\0\u05C4f;\uC000\u{1D53D}All;\u6200riertrf;\u6131c\xF2\u05CB\u0600JTabcdfgorst\u05E8\u05EC\u05EF\u05FA\u0600\u0612\u0616\u061B\u061D\u0623\u066C\u0672cy;\u4403\u803B>\u403Emma\u0100;d\u05F7\u05F8\u4393;\u43DCreve;\u411E\u0180eiy\u0607\u060C\u0610dil;\u4122rc;\u411C;\u4413ot;\u4120r;\uC000\u{1D50A};\u62D9pf;\uC000\u{1D53E}eater\u0300EFGLST\u0635\u0644\u064E\u0656\u065B\u0666qual\u0100;L\u063E\u063F\u6265ess;\u62DBullEqual;\u6267reater;\u6AA2ess;\u6277lantEqual;\u6A7Eilde;\u6273cr;\uC000\u{1D4A2};\u626B\u0400Aacfiosu\u0685\u068B\u0696\u069B\u069E\u06AA\u06BE\u06CARDcy;\u442A\u0100ct\u0690\u0694ek;\u42C7;\u405Eirc;\u4124r;\u610ClbertSpace;\u610B\u01F0\u06AF\0\u06B2f;\u610DizontalLine;\u6500\u0100ct\u06C3\u06C5\xF2\u06A9rok;\u4126mp\u0144\u06D0\u06D8ownHum\xF0\u012Fqual;\u624F\u0700EJOacdfgmnostu\u06FA\u06FE\u0703\u0707\u070E\u071A\u071E\u0721\u0728\u0744\u0778\u078B\u078F\u0795cy;\u4415lig;\u4132cy;\u4401cute\u803B\xCD\u40CD\u0100iy\u0713\u0718rc\u803B\xCE\u40CE;\u4418ot;\u4130r;\u6111rave\u803B\xCC\u40CC\u0180;ap\u0720\u072F\u073F\u0100cg\u0734\u0737r;\u412AinaryI;\u6148lie\xF3\u03DD\u01F4\u0749\0\u0762\u0100;e\u074D\u074E\u622C\u0100gr\u0753\u0758ral;\u622Bsection;\u62C2isible\u0100CT\u076C\u0772omma;\u6063imes;\u6062\u0180gpt\u077F\u0783\u0788on;\u412Ef;\uC000\u{1D540}a;\u4399cr;\u6110ilde;\u4128\u01EB\u079A\0\u079Ecy;\u4406l\u803B\xCF\u40CF\u0280cfosu\u07AC\u07B7\u07BC\u07C2\u07D0\u0100iy\u07B1\u07B5rc;\u4134;\u4419r;\uC000\u{1D50D}pf;\uC000\u{1D541}\u01E3\u07C7\0\u07CCr;\uC000\u{1D4A5}rcy;\u4408kcy;\u4404\u0380HJacfos\u07E4\u07E8\u07EC\u07F1\u07FD\u0802\u0808cy;\u4425cy;\u440Cppa;\u439A\u0100ey\u07F6\u07FBdil;\u4136;\u441Ar;\uC000\u{1D50E}pf;\uC000\u{1D542}cr;\uC000\u{1D4A6}\u0580JTaceflmost\u0825\u0829\u082C\u0850\u0863\u09B3\u09B8\u09C7\u09CD\u0A37\u0A47cy;\u4409\u803B<\u403C\u0280cmnpr\u0837\u083C\u0841\u0844\u084Dute;\u4139bda;\u439Bg;\u67EAlacetrf;\u6112r;\u619E\u0180aey\u0857\u085C\u0861ron;\u413Ddil;\u413B;\u441B\u0100fs\u0868\u0970t\u0500ACDFRTUVar\u087E\u08A9\u08B1\u08E0\u08E6\u08FC\u092F\u095B\u0390\u096A\u0100nr\u0883\u088FgleBracket;\u67E8row\u0180;BR\u0899\u089A\u089E\u6190ar;\u61E4ightArrow;\u61C6eiling;\u6308o\u01F5\u08B7\0\u08C3bleBracket;\u67E6n\u01D4\u08C8\0\u08D2eeVector;\u6961ector\u0100;B\u08DB\u08DC\u61C3ar;\u6959loor;\u630Aight\u0100AV\u08EF\u08F5rrow;\u6194ector;\u694E\u0100er\u0901\u0917e\u0180;AV\u0909\u090A\u0910\u62A3rrow;\u61A4ector;\u695Aiangle\u0180;BE\u0924\u0925\u0929\u62B2ar;\u69CFqual;\u62B4p\u0180DTV\u0937\u0942\u094CownVector;\u6951eeVector;\u6960ector\u0100;B\u0956\u0957\u61BFar;\u6958ector\u0100;B\u0965\u0966\u61BCar;\u6952ight\xE1\u039Cs\u0300EFGLST\u097E\u098B\u0995\u099D\u09A2\u09ADqualGreater;\u62DAullEqual;\u6266reater;\u6276ess;\u6AA1lantEqual;\u6A7Dilde;\u6272r;\uC000\u{1D50F}\u0100;e\u09BD\u09BE\u62D8ftarrow;\u61DAidot;\u413F\u0180npw\u09D4\u0A16\u0A1Bg\u0200LRlr\u09DE\u09F7\u0A02\u0A10eft\u0100AR\u09E6\u09ECrrow;\u67F5ightArrow;\u67F7ightArrow;\u67F6eft\u0100ar\u03B3\u0A0Aight\xE1\u03BFight\xE1\u03CAf;\uC000\u{1D543}er\u0100LR\u0A22\u0A2CeftArrow;\u6199ightArrow;\u6198\u0180cht\u0A3E\u0A40\u0A42\xF2\u084C;\u61B0rok;\u4141;\u626A\u0400acefiosu\u0A5A\u0A5D\u0A60\u0A77\u0A7C\u0A85\u0A8B\u0A8Ep;\u6905y;\u441C\u0100dl\u0A65\u0A6FiumSpace;\u605Flintrf;\u6133r;\uC000\u{1D510}nusPlus;\u6213pf;\uC000\u{1D544}c\xF2\u0A76;\u439C\u0480Jacefostu\u0AA3\u0AA7\u0AAD\u0AC0\u0B14\u0B19\u0D91\u0D97\u0D9Ecy;\u440Acute;\u4143\u0180aey\u0AB4\u0AB9\u0ABEron;\u4147dil;\u4145;\u441D\u0180gsw\u0AC7\u0AF0\u0B0Eative\u0180MTV\u0AD3\u0ADF\u0AE8ediumSpace;\u600Bhi\u0100cn\u0AE6\u0AD8\xEB\u0AD9eryThi\xEE\u0AD9ted\u0100GL\u0AF8\u0B06reaterGreate\xF2\u0673essLes\xF3\u0A48Line;\u400Ar;\uC000\u{1D511}\u0200Bnpt\u0B22\u0B28\u0B37\u0B3Areak;\u6060BreakingSpace;\u40A0f;\u6115\u0680;CDEGHLNPRSTV\u0B55\u0B56\u0B6A\u0B7C\u0BA1\u0BEB\u0C04\u0C5E\u0C84\u0CA6\u0CD8\u0D61\u0D85\u6AEC\u0100ou\u0B5B\u0B64ngruent;\u6262pCap;\u626DoubleVerticalBar;\u6226\u0180lqx\u0B83\u0B8A\u0B9Bement;\u6209ual\u0100;T\u0B92\u0B93\u6260ilde;\uC000\u2242\u0338ists;\u6204reater\u0380;EFGLST\u0BB6\u0BB7\u0BBD\u0BC9\u0BD3\u0BD8\u0BE5\u626Fqual;\u6271ullEqual;\uC000\u2267\u0338reater;\uC000\u226B\u0338ess;\u6279lantEqual;\uC000\u2A7E\u0338ilde;\u6275ump\u0144\u0BF2\u0BFDownHump;\uC000\u224E\u0338qual;\uC000\u224F\u0338e\u0100fs\u0C0A\u0C27tTriangle\u0180;BE\u0C1A\u0C1B\u0C21\u62EAar;\uC000\u29CF\u0338qual;\u62ECs\u0300;EGLST\u0C35\u0C36\u0C3C\u0C44\u0C4B\u0C58\u626Equal;\u6270reater;\u6278ess;\uC000\u226A\u0338lantEqual;\uC000\u2A7D\u0338ilde;\u6274ested\u0100GL\u0C68\u0C79reaterGreater;\uC000\u2AA2\u0338essLess;\uC000\u2AA1\u0338recedes\u0180;ES\u0C92\u0C93\u0C9B\u6280qual;\uC000\u2AAF\u0338lantEqual;\u62E0\u0100ei\u0CAB\u0CB9verseElement;\u620CghtTriangle\u0180;BE\u0CCB\u0CCC\u0CD2\u62EBar;\uC000\u29D0\u0338qual;\u62ED\u0100qu\u0CDD\u0D0CuareSu\u0100bp\u0CE8\u0CF9set\u0100;E\u0CF0\u0CF3\uC000\u228F\u0338qual;\u62E2erset\u0100;E\u0D03\u0D06\uC000\u2290\u0338qual;\u62E3\u0180bcp\u0D13\u0D24\u0D4Eset\u0100;E\u0D1B\u0D1E\uC000\u2282\u20D2qual;\u6288ceeds\u0200;EST\u0D32\u0D33\u0D3B\u0D46\u6281qual;\uC000\u2AB0\u0338lantEqual;\u62E1ilde;\uC000\u227F\u0338erset\u0100;E\u0D58\u0D5B\uC000\u2283\u20D2qual;\u6289ilde\u0200;EFT\u0D6E\u0D6F\u0D75\u0D7F\u6241qual;\u6244ullEqual;\u6247ilde;\u6249erticalBar;\u6224cr;\uC000\u{1D4A9}ilde\u803B\xD1\u40D1;\u439D\u0700Eacdfgmoprstuv\u0DBD\u0DC2\u0DC9\u0DD5\u0DDB\u0DE0\u0DE7\u0DFC\u0E02\u0E20\u0E22\u0E32\u0E3F\u0E44lig;\u4152cute\u803B\xD3\u40D3\u0100iy\u0DCE\u0DD3rc\u803B\xD4\u40D4;\u441Eblac;\u4150r;\uC000\u{1D512}rave\u803B\xD2\u40D2\u0180aei\u0DEE\u0DF2\u0DF6cr;\u414Cga;\u43A9cron;\u439Fpf;\uC000\u{1D546}enCurly\u0100DQ\u0E0E\u0E1AoubleQuote;\u601Cuote;\u6018;\u6A54\u0100cl\u0E27\u0E2Cr;\uC000\u{1D4AA}ash\u803B\xD8\u40D8i\u016C\u0E37\u0E3Cde\u803B\xD5\u40D5es;\u6A37ml\u803B\xD6\u40D6er\u0100BP\u0E4B\u0E60\u0100ar\u0E50\u0E53r;\u603Eac\u0100ek\u0E5A\u0E5C;\u63DEet;\u63B4arenthesis;\u63DC\u0480acfhilors\u0E7F\u0E87\u0E8A\u0E8F\u0E92\u0E94\u0E9D\u0EB0\u0EFCrtialD;\u6202y;\u441Fr;\uC000\u{1D513}i;\u43A6;\u43A0usMinus;\u40B1\u0100ip\u0EA2\u0EADncareplan\xE5\u069Df;\u6119\u0200;eio\u0EB9\u0EBA\u0EE0\u0EE4\u6ABBcedes\u0200;EST\u0EC8\u0EC9\u0ECF\u0EDA\u627Aqual;\u6AAFlantEqual;\u627Cilde;\u627Eme;\u6033\u0100dp\u0EE9\u0EEEuct;\u620Fortion\u0100;a\u0225\u0EF9l;\u621D\u0100ci\u0F01\u0F06r;\uC000\u{1D4AB};\u43A8\u0200Ufos\u0F11\u0F16\u0F1B\u0F1FOT\u803B"\u4022r;\uC000\u{1D514}pf;\u611Acr;\uC000\u{1D4AC}\u0600BEacefhiorsu\u0F3E\u0F43\u0F47\u0F60\u0F73\u0FA7\u0FAA\u0FAD\u1096\u10A9\u10B4\u10BEarr;\u6910G\u803B\xAE\u40AE\u0180cnr\u0F4E\u0F53\u0F56ute;\u4154g;\u67EBr\u0100;t\u0F5C\u0F5D\u61A0l;\u6916\u0180aey\u0F67\u0F6C\u0F71ron;\u4158dil;\u4156;\u4420\u0100;v\u0F78\u0F79\u611Cerse\u0100EU\u0F82\u0F99\u0100lq\u0F87\u0F8Eement;\u620Builibrium;\u61CBpEquilibrium;\u696Fr\xBB\u0F79o;\u43A1ght\u0400ACDFTUVa\u0FC1\u0FEB\u0FF3\u1022\u1028\u105B\u1087\u03D8\u0100nr\u0FC6\u0FD2gleBracket;\u67E9row\u0180;BL\u0FDC\u0FDD\u0FE1\u6192ar;\u61E5eftArrow;\u61C4eiling;\u6309o\u01F5\u0FF9\0\u1005bleBracket;\u67E7n\u01D4\u100A\0\u1014eeVector;\u695Dector\u0100;B\u101D\u101E\u61C2ar;\u6955loor;\u630B\u0100er\u102D\u1043e\u0180;AV\u1035\u1036\u103C\u62A2rrow;\u61A6ector;\u695Biangle\u0180;BE\u1050\u1051\u1055\u62B3ar;\u69D0qual;\u62B5p\u0180DTV\u1063\u106E\u1078ownVector;\u694FeeVector;\u695Cector\u0100;B\u1082\u1083\u61BEar;\u6954ector\u0100;B\u1091\u1092\u61C0ar;\u6953\u0100pu\u109B\u109Ef;\u611DndImplies;\u6970ightarrow;\u61DB\u0100ch\u10B9\u10BCr;\u611B;\u61B1leDelayed;\u69F4\u0680HOacfhimoqstu\u10E4\u10F1\u10F7\u10FD\u1119\u111E\u1151\u1156\u1161\u1167\u11B5\u11BB\u11BF\u0100Cc\u10E9\u10EEHcy;\u4429y;\u4428FTcy;\u442Ccute;\u415A\u0280;aeiy\u1108\u1109\u110E\u1113\u1117\u6ABCron;\u4160dil;\u415Erc;\u415C;\u4421r;\uC000\u{1D516}ort\u0200DLRU\u112A\u1134\u113E\u1149ownArrow\xBB\u041EeftArrow\xBB\u089AightArrow\xBB\u0FDDpArrow;\u6191gma;\u43A3allCircle;\u6218pf;\uC000\u{1D54A}\u0272\u116D\0\0\u1170t;\u621Aare\u0200;ISU\u117B\u117C\u1189\u11AF\u65A1ntersection;\u6293u\u0100bp\u118F\u119Eset\u0100;E\u1197\u1198\u628Fqual;\u6291erset\u0100;E\u11A8\u11A9\u6290qual;\u6292nion;\u6294cr;\uC000\u{1D4AE}ar;\u62C6\u0200bcmp\u11C8\u11DB\u1209\u120B\u0100;s\u11CD\u11CE\u62D0et\u0100;E\u11CD\u11D5qual;\u6286\u0100ch\u11E0\u1205eeds\u0200;EST\u11ED\u11EE\u11F4\u11FF\u627Bqual;\u6AB0lantEqual;\u627Dilde;\u627FTh\xE1\u0F8C;\u6211\u0180;es\u1212\u1213\u1223\u62D1rset\u0100;E\u121C\u121D\u6283qual;\u6287et\xBB\u1213\u0580HRSacfhiors\u123E\u1244\u1249\u1255\u125E\u1271\u1276\u129F\u12C2\u12C8\u12D1ORN\u803B\xDE\u40DEADE;\u6122\u0100Hc\u124E\u1252cy;\u440By;\u4426\u0100bu\u125A\u125C;\u4009;\u43A4\u0180aey\u1265\u126A\u126Fron;\u4164dil;\u4162;\u4422r;\uC000\u{1D517}\u0100ei\u127B\u1289\u01F2\u1280\0\u1287efore;\u6234a;\u4398\u0100cn\u128E\u1298kSpace;\uC000\u205F\u200ASpace;\u6009lde\u0200;EFT\u12AB\u12AC\u12B2\u12BC\u623Cqual;\u6243ullEqual;\u6245ilde;\u6248pf;\uC000\u{1D54B}ipleDot;\u60DB\u0100ct\u12D6\u12DBr;\uC000\u{1D4AF}rok;\u4166\u0AE1\u12F7\u130E\u131A\u1326\0\u132C\u1331\0\0\0\0\0\u1338\u133D\u1377\u1385\0\u13FF\u1404\u140A\u1410\u0100cr\u12FB\u1301ute\u803B\xDA\u40DAr\u0100;o\u1307\u1308\u619Fcir;\u6949r\u01E3\u1313\0\u1316y;\u440Eve;\u416C\u0100iy\u131E\u1323rc\u803B\xDB\u40DB;\u4423blac;\u4170r;\uC000\u{1D518}rave\u803B\xD9\u40D9acr;\u416A\u0100di\u1341\u1369er\u0100BP\u1348\u135D\u0100ar\u134D\u1350r;\u405Fac\u0100ek\u1357\u1359;\u63DFet;\u63B5arenthesis;\u63DDon\u0100;P\u1370\u1371\u62C3lus;\u628E\u0100gp\u137B\u137Fon;\u4172f;\uC000\u{1D54C}\u0400ADETadps\u1395\u13AE\u13B8\u13C4\u03E8\u13D2\u13D7\u13F3rrow\u0180;BD\u1150\u13A0\u13A4ar;\u6912ownArrow;\u61C5ownArrow;\u6195quilibrium;\u696Eee\u0100;A\u13CB\u13CC\u62A5rrow;\u61A5own\xE1\u03F3er\u0100LR\u13DE\u13E8eftArrow;\u6196ightArrow;\u6197i\u0100;l\u13F9\u13FA\u43D2on;\u43A5ing;\u416Ecr;\uC000\u{1D4B0}ilde;\u4168ml\u803B\xDC\u40DC\u0480Dbcdefosv\u1427\u142C\u1430\u1433\u143E\u1485\u148A\u1490\u1496ash;\u62ABar;\u6AEBy;\u4412ash\u0100;l\u143B\u143C\u62A9;\u6AE6\u0100er\u1443\u1445;\u62C1\u0180bty\u144C\u1450\u147Aar;\u6016\u0100;i\u144F\u1455cal\u0200BLST\u1461\u1465\u146A\u1474ar;\u6223ine;\u407Ceparator;\u6758ilde;\u6240ThinSpace;\u600Ar;\uC000\u{1D519}pf;\uC000\u{1D54D}cr;\uC000\u{1D4B1}dash;\u62AA\u0280cefos\u14A7\u14AC\u14B1\u14B6\u14BCirc;\u4174dge;\u62C0r;\uC000\u{1D51A}pf;\uC000\u{1D54E}cr;\uC000\u{1D4B2}\u0200fios\u14CB\u14D0\u14D2\u14D8r;\uC000\u{1D51B};\u439Epf;\uC000\u{1D54F}cr;\uC000\u{1D4B3}\u0480AIUacfosu\u14F1\u14F5\u14F9\u14FD\u1504\u150F\u1514\u151A\u1520cy;\u442Fcy;\u4407cy;\u442Ecute\u803B\xDD\u40DD\u0100iy\u1509\u150Drc;\u4176;\u442Br;\uC000\u{1D51C}pf;\uC000\u{1D550}cr;\uC000\u{1D4B4}ml;\u4178\u0400Hacdefos\u1535\u1539\u153F\u154B\u154F\u155D\u1560\u1564cy;\u4416cute;\u4179\u0100ay\u1544\u1549ron;\u417D;\u4417ot;\u417B\u01F2\u1554\0\u155BoWidt\xE8\u0AD9a;\u4396r;\u6128pf;\u6124cr;\uC000\u{1D4B5}\u0BE1\u1583\u158A\u1590\0\u15B0\u15B6\u15BF\0\0\0\0\u15C6\u15DB\u15EB\u165F\u166D\0\u1695\u169B\u16B2\u16B9\0\u16BEcute\u803B\xE1\u40E1reve;\u4103\u0300;Ediuy\u159C\u159D\u15A1\u15A3\u15A8\u15AD\u623E;\uC000\u223E\u0333;\u623Frc\u803B\xE2\u40E2te\u80BB\xB4\u0306;\u4430lig\u803B\xE6\u40E6\u0100;r\xB2\u15BA;\uC000\u{1D51E}rave\u803B\xE0\u40E0\u0100ep\u15CA\u15D6\u0100fp\u15CF\u15D4sym;\u6135\xE8\u15D3ha;\u43B1\u0100ap\u15DFc\u0100cl\u15E4\u15E7r;\u4101g;\u6A3F\u0264\u15F0\0\0\u160A\u0280;adsv\u15FA\u15FB\u15FF\u1601\u1607\u6227nd;\u6A55;\u6A5Clope;\u6A58;\u6A5A\u0380;elmrsz\u1618\u1619\u161B\u161E\u163F\u164F\u1659\u6220;\u69A4e\xBB\u1619sd\u0100;a\u1625\u1626\u6221\u0461\u1630\u1632\u1634\u1636\u1638\u163A\u163C\u163E;\u69A8;\u69A9;\u69AA;\u69AB;\u69AC;\u69AD;\u69AE;\u69AFt\u0100;v\u1645\u1646\u621Fb\u0100;d\u164C\u164D\u62BE;\u699D\u0100pt\u1654\u1657h;\u6222\xBB\xB9arr;\u637C\u0100gp\u1663\u1667on;\u4105f;\uC000\u{1D552}\u0380;Eaeiop\u12C1\u167B\u167D\u1682\u1684\u1687\u168A;\u6A70cir;\u6A6F;\u624Ad;\u624Bs;\u4027rox\u0100;e\u12C1\u1692\xF1\u1683ing\u803B\xE5\u40E5\u0180cty\u16A1\u16A6\u16A8r;\uC000\u{1D4B6};\u402Amp\u0100;e\u12C1\u16AF\xF1\u0288ilde\u803B\xE3\u40E3ml\u803B\xE4\u40E4\u0100ci\u16C2\u16C8onin\xF4\u0272nt;\u6A11\u0800Nabcdefiklnoprsu\u16ED\u16F1\u1730\u173C\u1743\u1748\u1778\u177D\u17E0\u17E6\u1839\u1850\u170D\u193D\u1948\u1970ot;\u6AED\u0100cr\u16F6\u171Ek\u0200ceps\u1700\u1705\u170D\u1713ong;\u624Cpsilon;\u43F6rime;\u6035im\u0100;e\u171A\u171B\u623Dq;\u62CD\u0176\u1722\u1726ee;\u62BDed\u0100;g\u172C\u172D\u6305e\xBB\u172Drk\u0100;t\u135C\u1737brk;\u63B6\u0100oy\u1701\u1741;\u4431quo;\u601E\u0280cmprt\u1753\u175B\u1761\u1764\u1768aus\u0100;e\u010A\u0109ptyv;\u69B0s\xE9\u170Cno\xF5\u0113\u0180ahw\u176F\u1771\u1773;\u43B2;\u6136een;\u626Cr;\uC000\u{1D51F}g\u0380costuvw\u178D\u179D\u17B3\u17C1\u17D5\u17DB\u17DE\u0180aiu\u1794\u1796\u179A\xF0\u0760rc;\u65EFp\xBB\u1371\u0180dpt\u17A4\u17A8\u17ADot;\u6A00lus;\u6A01imes;\u6A02\u0271\u17B9\0\0\u17BEcup;\u6A06ar;\u6605riangle\u0100du\u17CD\u17D2own;\u65BDp;\u65B3plus;\u6A04e\xE5\u1444\xE5\u14ADarow;\u690D\u0180ako\u17ED\u1826\u1835\u0100cn\u17F2\u1823k\u0180lst\u17FA\u05AB\u1802ozenge;\u69EBriangle\u0200;dlr\u1812\u1813\u1818\u181D\u65B4own;\u65BEeft;\u65C2ight;\u65B8k;\u6423\u01B1\u182B\0\u1833\u01B2\u182F\0\u1831;\u6592;\u65914;\u6593ck;\u6588\u0100eo\u183E\u184D\u0100;q\u1843\u1846\uC000=\u20E5uiv;\uC000\u2261\u20E5t;\u6310\u0200ptwx\u1859\u185E\u1867\u186Cf;\uC000\u{1D553}\u0100;t\u13CB\u1863om\xBB\u13CCtie;\u62C8\u0600DHUVbdhmptuv\u1885\u1896\u18AA\u18BB\u18D7\u18DB\u18EC\u18FF\u1905\u190A\u1910\u1921\u0200LRlr\u188E\u1890\u1892\u1894;\u6557;\u6554;\u6556;\u6553\u0280;DUdu\u18A1\u18A2\u18A4\u18A6\u18A8\u6550;\u6566;\u6569;\u6564;\u6567\u0200LRlr\u18B3\u18B5\u18B7\u18B9;\u655D;\u655A;\u655C;\u6559\u0380;HLRhlr\u18CA\u18CB\u18CD\u18CF\u18D1\u18D3\u18D5\u6551;\u656C;\u6563;\u6560;\u656B;\u6562;\u655Fox;\u69C9\u0200LRlr\u18E4\u18E6\u18E8\u18EA;\u6555;\u6552;\u6510;\u650C\u0280;DUdu\u06BD\u18F7\u18F9\u18FB\u18FD;\u6565;\u6568;\u652C;\u6534inus;\u629Flus;\u629Eimes;\u62A0\u0200LRlr\u1919\u191B\u191D\u191F;\u655B;\u6558;\u6518;\u6514\u0380;HLRhlr\u1930\u1931\u1933\u1935\u1937\u1939\u193B\u6502;\u656A;\u6561;\u655E;\u653C;\u6524;\u651C\u0100ev\u0123\u1942bar\u803B\xA6\u40A6\u0200ceio\u1951\u1956\u195A\u1960r;\uC000\u{1D4B7}mi;\u604Fm\u0100;e\u171A\u171Cl\u0180;bh\u1968\u1969\u196B\u405C;\u69C5sub;\u67C8\u016C\u1974\u197El\u0100;e\u1979\u197A\u6022t\xBB\u197Ap\u0180;Ee\u012F\u1985\u1987;\u6AAE\u0100;q\u06DC\u06DB\u0CE1\u19A7\0\u19E8\u1A11\u1A15\u1A32\0\u1A37\u1A50\0\0\u1AB4\0\0\u1AC1\0\0\u1B21\u1B2E\u1B4D\u1B52\0\u1BFD\0\u1C0C\u0180cpr\u19AD\u19B2\u19DDute;\u4107\u0300;abcds\u19BF\u19C0\u19C4\u19CA\u19D5\u19D9\u6229nd;\u6A44rcup;\u6A49\u0100au\u19CF\u19D2p;\u6A4Bp;\u6A47ot;\u6A40;\uC000\u2229\uFE00\u0100eo\u19E2\u19E5t;\u6041\xEE\u0693\u0200aeiu\u19F0\u19FB\u1A01\u1A05\u01F0\u19F5\0\u19F8s;\u6A4Don;\u410Ddil\u803B\xE7\u40E7rc;\u4109ps\u0100;s\u1A0C\u1A0D\u6A4Cm;\u6A50ot;\u410B\u0180dmn\u1A1B\u1A20\u1A26il\u80BB\xB8\u01ADptyv;\u69B2t\u8100\xA2;e\u1A2D\u1A2E\u40A2r\xE4\u01B2r;\uC000\u{1D520}\u0180cei\u1A3D\u1A40\u1A4Dy;\u4447ck\u0100;m\u1A47\u1A48\u6713ark\xBB\u1A48;\u43C7r\u0380;Ecefms\u1A5F\u1A60\u1A62\u1A6B\u1AA4\u1AAA\u1AAE\u65CB;\u69C3\u0180;el\u1A69\u1A6A\u1A6D\u42C6q;\u6257e\u0261\u1A74\0\0\u1A88rrow\u0100lr\u1A7C\u1A81eft;\u61BAight;\u61BB\u0280RSacd\u1A92\u1A94\u1A96\u1A9A\u1A9F\xBB\u0F47;\u64C8st;\u629Birc;\u629Aash;\u629Dnint;\u6A10id;\u6AEFcir;\u69C2ubs\u0100;u\u1ABB\u1ABC\u6663it\xBB\u1ABC\u02EC\u1AC7\u1AD4\u1AFA\0\u1B0Aon\u0100;e\u1ACD\u1ACE\u403A\u0100;q\xC7\xC6\u026D\u1AD9\0\0\u1AE2a\u0100;t\u1ADE\u1ADF\u402C;\u4040\u0180;fl\u1AE8\u1AE9\u1AEB\u6201\xEE\u1160e\u0100mx\u1AF1\u1AF6ent\xBB\u1AE9e\xF3\u024D\u01E7\u1AFE\0\u1B07\u0100;d\u12BB\u1B02ot;\u6A6Dn\xF4\u0246\u0180fry\u1B10\u1B14\u1B17;\uC000\u{1D554}o\xE4\u0254\u8100\xA9;s\u0155\u1B1Dr;\u6117\u0100ao\u1B25\u1B29rr;\u61B5ss;\u6717\u0100cu\u1B32\u1B37r;\uC000\u{1D4B8}\u0100bp\u1B3C\u1B44\u0100;e\u1B41\u1B42\u6ACF;\u6AD1\u0100;e\u1B49\u1B4A\u6AD0;\u6AD2dot;\u62EF\u0380delprvw\u1B60\u1B6C\u1B77\u1B82\u1BAC\u1BD4\u1BF9arr\u0100lr\u1B68\u1B6A;\u6938;\u6935\u0270\u1B72\0\0\u1B75r;\u62DEc;\u62DFarr\u0100;p\u1B7F\u1B80\u61B6;\u693D\u0300;bcdos\u1B8F\u1B90\u1B96\u1BA1\u1BA5\u1BA8\u622Arcap;\u6A48\u0100au\u1B9B\u1B9Ep;\u6A46p;\u6A4Aot;\u628Dr;\u6A45;\uC000\u222A\uFE00\u0200alrv\u1BB5\u1BBF\u1BDE\u1BE3rr\u0100;m\u1BBC\u1BBD\u61B7;\u693Cy\u0180evw\u1BC7\u1BD4\u1BD8q\u0270\u1BCE\0\0\u1BD2re\xE3\u1B73u\xE3\u1B75ee;\u62CEedge;\u62CFen\u803B\xA4\u40A4earrow\u0100lr\u1BEE\u1BF3eft\xBB\u1B80ight\xBB\u1BBDe\xE4\u1BDD\u0100ci\u1C01\u1C07onin\xF4\u01F7nt;\u6231lcty;\u632D\u0980AHabcdefhijlorstuwz\u1C38\u1C3B\u1C3F\u1C5D\u1C69\u1C75\u1C8A\u1C9E\u1CAC\u1CB7\u1CFB\u1CFF\u1D0D\u1D7B\u1D91\u1DAB\u1DBB\u1DC6\u1DCDr\xF2\u0381ar;\u6965\u0200glrs\u1C48\u1C4D\u1C52\u1C54ger;\u6020eth;\u6138\xF2\u1133h\u0100;v\u1C5A\u1C5B\u6010\xBB\u090A\u016B\u1C61\u1C67arow;\u690Fa\xE3\u0315\u0100ay\u1C6E\u1C73ron;\u410F;\u4434\u0180;ao\u0332\u1C7C\u1C84\u0100gr\u02BF\u1C81r;\u61CAtseq;\u6A77\u0180glm\u1C91\u1C94\u1C98\u803B\xB0\u40B0ta;\u43B4ptyv;\u69B1\u0100ir\u1CA3\u1CA8sht;\u697F;\uC000\u{1D521}ar\u0100lr\u1CB3\u1CB5\xBB\u08DC\xBB\u101E\u0280aegsv\u1CC2\u0378\u1CD6\u1CDC\u1CE0m\u0180;os\u0326\u1CCA\u1CD4nd\u0100;s\u0326\u1CD1uit;\u6666amma;\u43DDin;\u62F2\u0180;io\u1CE7\u1CE8\u1CF8\u40F7de\u8100\xF7;o\u1CE7\u1CF0ntimes;\u62C7n\xF8\u1CF7cy;\u4452c\u026F\u1D06\0\0\u1D0Arn;\u631Eop;\u630D\u0280lptuw\u1D18\u1D1D\u1D22\u1D49\u1D55lar;\u4024f;\uC000\u{1D555}\u0280;emps\u030B\u1D2D\u1D37\u1D3D\u1D42q\u0100;d\u0352\u1D33ot;\u6251inus;\u6238lus;\u6214quare;\u62A1blebarwedg\xE5\xFAn\u0180adh\u112E\u1D5D\u1D67ownarrow\xF3\u1C83arpoon\u0100lr\u1D72\u1D76ef\xF4\u1CB4igh\xF4\u1CB6\u0162\u1D7F\u1D85karo\xF7\u0F42\u026F\u1D8A\0\0\u1D8Ern;\u631Fop;\u630C\u0180cot\u1D98\u1DA3\u1DA6\u0100ry\u1D9D\u1DA1;\uC000\u{1D4B9};\u4455l;\u69F6rok;\u4111\u0100dr\u1DB0\u1DB4ot;\u62F1i\u0100;f\u1DBA\u1816\u65BF\u0100ah\u1DC0\u1DC3r\xF2\u0429a\xF2\u0FA6angle;\u69A6\u0100ci\u1DD2\u1DD5y;\u445Fgrarr;\u67FF\u0900Dacdefglmnopqrstux\u1E01\u1E09\u1E19\u1E38\u0578\u1E3C\u1E49\u1E61\u1E7E\u1EA5\u1EAF\u1EBD\u1EE1\u1F2A\u1F37\u1F44\u1F4E\u1F5A\u0100Do\u1E06\u1D34o\xF4\u1C89\u0100cs\u1E0E\u1E14ute\u803B\xE9\u40E9ter;\u6A6E\u0200aioy\u1E22\u1E27\u1E31\u1E36ron;\u411Br\u0100;c\u1E2D\u1E2E\u6256\u803B\xEA\u40EAlon;\u6255;\u444Dot;\u4117\u0100Dr\u1E41\u1E45ot;\u6252;\uC000\u{1D522}\u0180;rs\u1E50\u1E51\u1E57\u6A9Aave\u803B\xE8\u40E8\u0100;d\u1E5C\u1E5D\u6A96ot;\u6A98\u0200;ils\u1E6A\u1E6B\u1E72\u1E74\u6A99nters;\u63E7;\u6113\u0100;d\u1E79\u1E7A\u6A95ot;\u6A97\u0180aps\u1E85\u1E89\u1E97cr;\u4113ty\u0180;sv\u1E92\u1E93\u1E95\u6205et\xBB\u1E93p\u01001;\u1E9D\u1EA4\u0133\u1EA1\u1EA3;\u6004;\u6005\u6003\u0100gs\u1EAA\u1EAC;\u414Bp;\u6002\u0100gp\u1EB4\u1EB8on;\u4119f;\uC000\u{1D556}\u0180als\u1EC4\u1ECE\u1ED2r\u0100;s\u1ECA\u1ECB\u62D5l;\u69E3us;\u6A71i\u0180;lv\u1EDA\u1EDB\u1EDF\u43B5on\xBB\u1EDB;\u43F5\u0200csuv\u1EEA\u1EF3\u1F0B\u1F23\u0100io\u1EEF\u1E31rc\xBB\u1E2E\u0269\u1EF9\0\0\u1EFB\xED\u0548ant\u0100gl\u1F02\u1F06tr\xBB\u1E5Dess\xBB\u1E7A\u0180aei\u1F12\u1F16\u1F1Als;\u403Dst;\u625Fv\u0100;D\u0235\u1F20D;\u6A78parsl;\u69E5\u0100Da\u1F2F\u1F33ot;\u6253rr;\u6971\u0180cdi\u1F3E\u1F41\u1EF8r;\u612Fo\xF4\u0352\u0100ah\u1F49\u1F4B;\u43B7\u803B\xF0\u40F0\u0100mr\u1F53\u1F57l\u803B\xEB\u40EBo;\u60AC\u0180cip\u1F61\u1F64\u1F67l;\u4021s\xF4\u056E\u0100eo\u1F6C\u1F74ctatio\xEE\u0559nential\xE5\u0579\u09E1\u1F92\0\u1F9E\0\u1FA1\u1FA7\0\0\u1FC6\u1FCC\0\u1FD3\0\u1FE6\u1FEA\u2000\0\u2008\u205Allingdotse\xF1\u1E44y;\u4444male;\u6640\u0180ilr\u1FAD\u1FB3\u1FC1lig;\u8000\uFB03\u0269\u1FB9\0\0\u1FBDg;\u8000\uFB00ig;\u8000\uFB04;\uC000\u{1D523}lig;\u8000\uFB01lig;\uC000fj\u0180alt\u1FD9\u1FDC\u1FE1t;\u666Dig;\u8000\uFB02ns;\u65B1of;\u4192\u01F0\u1FEE\0\u1FF3f;\uC000\u{1D557}\u0100ak\u05BF\u1FF7\u0100;v\u1FFC\u1FFD\u62D4;\u6AD9artint;\u6A0D\u0100ao\u200C\u2055\u0100cs\u2011\u2052\u03B1\u201A\u2030\u2038\u2045\u2048\0\u2050\u03B2\u2022\u2025\u2027\u202A\u202C\0\u202E\u803B\xBD\u40BD;\u6153\u803B\xBC\u40BC;\u6155;\u6159;\u615B\u01B3\u2034\0\u2036;\u6154;\u6156\u02B4\u203E\u2041\0\0\u2043\u803B\xBE\u40BE;\u6157;\u615C5;\u6158\u01B6\u204C\0\u204E;\u615A;\u615D8;\u615El;\u6044wn;\u6322cr;\uC000\u{1D4BB}\u0880Eabcdefgijlnorstv\u2082\u2089\u209F\u20A5\u20B0\u20B4\u20F0\u20F5\u20FA\u20FF\u2103\u2112\u2138\u0317\u213E\u2152\u219E\u0100;l\u064D\u2087;\u6A8C\u0180cmp\u2090\u2095\u209Dute;\u41F5ma\u0100;d\u209C\u1CDA\u43B3;\u6A86reve;\u411F\u0100iy\u20AA\u20AErc;\u411D;\u4433ot;\u4121\u0200;lqs\u063E\u0642\u20BD\u20C9\u0180;qs\u063E\u064C\u20C4lan\xF4\u0665\u0200;cdl\u0665\u20D2\u20D5\u20E5c;\u6AA9ot\u0100;o\u20DC\u20DD\u6A80\u0100;l\u20E2\u20E3\u6A82;\u6A84\u0100;e\u20EA\u20ED\uC000\u22DB\uFE00s;\u6A94r;\uC000\u{1D524}\u0100;g\u0673\u061Bmel;\u6137cy;\u4453\u0200;Eaj\u065A\u210C\u210E\u2110;\u6A92;\u6AA5;\u6AA4\u0200Eaes\u211B\u211D\u2129\u2134;\u6269p\u0100;p\u2123\u2124\u6A8Arox\xBB\u2124\u0100;q\u212E\u212F\u6A88\u0100;q\u212E\u211Bim;\u62E7pf;\uC000\u{1D558}\u0100ci\u2143\u2146r;\u610Am\u0180;el\u066B\u214E\u2150;\u6A8E;\u6A90\u8300>;cdlqr\u05EE\u2160\u216A\u216E\u2173\u2179\u0100ci\u2165\u2167;\u6AA7r;\u6A7Aot;\u62D7Par;\u6995uest;\u6A7C\u0280adels\u2184\u216A\u2190\u0656\u219B\u01F0\u2189\0\u218Epro\xF8\u209Er;\u6978q\u0100lq\u063F\u2196les\xF3\u2088i\xED\u066B\u0100en\u21A3\u21ADrtneqq;\uC000\u2269\uFE00\xC5\u21AA\u0500Aabcefkosy\u21C4\u21C7\u21F1\u21F5\u21FA\u2218\u221D\u222F\u2268\u227Dr\xF2\u03A0\u0200ilmr\u21D0\u21D4\u21D7\u21DBrs\xF0\u1484f\xBB\u2024il\xF4\u06A9\u0100dr\u21E0\u21E4cy;\u444A\u0180;cw\u08F4\u21EB\u21EFir;\u6948;\u61ADar;\u610Firc;\u4125\u0180alr\u2201\u220E\u2213rts\u0100;u\u2209\u220A\u6665it\xBB\u220Alip;\u6026con;\u62B9r;\uC000\u{1D525}s\u0100ew\u2223\u2229arow;\u6925arow;\u6926\u0280amopr\u223A\u223E\u2243\u225E\u2263rr;\u61FFtht;\u623Bk\u0100lr\u2249\u2253eftarrow;\u61A9ightarrow;\u61AAf;\uC000\u{1D559}bar;\u6015\u0180clt\u226F\u2274\u2278r;\uC000\u{1D4BD}as\xE8\u21F4rok;\u4127\u0100bp\u2282\u2287ull;\u6043hen\xBB\u1C5B\u0AE1\u22A3\0\u22AA\0\u22B8\u22C5\u22CE\0\u22D5\u22F3\0\0\u22F8\u2322\u2367\u2362\u237F\0\u2386\u23AA\u23B4cute\u803B\xED\u40ED\u0180;iy\u0771\u22B0\u22B5rc\u803B\xEE\u40EE;\u4438\u0100cx\u22BC\u22BFy;\u4435cl\u803B\xA1\u40A1\u0100fr\u039F\u22C9;\uC000\u{1D526}rave\u803B\xEC\u40EC\u0200;ino\u073E\u22DD\u22E9\u22EE\u0100in\u22E2\u22E6nt;\u6A0Ct;\u622Dfin;\u69DCta;\u6129lig;\u4133\u0180aop\u22FE\u231A\u231D\u0180cgt\u2305\u2308\u2317r;\u412B\u0180elp\u071F\u230F\u2313in\xE5\u078Ear\xF4\u0720h;\u4131f;\u62B7ed;\u41B5\u0280;cfot\u04F4\u232C\u2331\u233D\u2341are;\u6105in\u0100;t\u2338\u2339\u621Eie;\u69DDdo\xF4\u2319\u0280;celp\u0757\u234C\u2350\u235B\u2361al;\u62BA\u0100gr\u2355\u2359er\xF3\u1563\xE3\u234Darhk;\u6A17rod;\u6A3C\u0200cgpt\u236F\u2372\u2376\u237By;\u4451on;\u412Ff;\uC000\u{1D55A}a;\u43B9uest\u803B\xBF\u40BF\u0100ci\u238A\u238Fr;\uC000\u{1D4BE}n\u0280;Edsv\u04F4\u239B\u239D\u23A1\u04F3;\u62F9ot;\u62F5\u0100;v\u23A6\u23A7\u62F4;\u62F3\u0100;i\u0777\u23AElde;\u4129\u01EB\u23B8\0\u23BCcy;\u4456l\u803B\xEF\u40EF\u0300cfmosu\u23CC\u23D7\u23DC\u23E1\u23E7\u23F5\u0100iy\u23D1\u23D5rc;\u4135;\u4439r;\uC000\u{1D527}ath;\u4237pf;\uC000\u{1D55B}\u01E3\u23EC\0\u23F1r;\uC000\u{1D4BF}rcy;\u4458kcy;\u4454\u0400acfghjos\u240B\u2416\u2422\u2427\u242D\u2431\u2435\u243Bppa\u0100;v\u2413\u2414\u43BA;\u43F0\u0100ey\u241B\u2420dil;\u4137;\u443Ar;\uC000\u{1D528}reen;\u4138cy;\u4445cy;\u445Cpf;\uC000\u{1D55C}cr;\uC000\u{1D4C0}\u0B80ABEHabcdefghjlmnoprstuv\u2470\u2481\u2486\u248D\u2491\u250E\u253D\u255A\u2580\u264E\u265E\u2665\u2679\u267D\u269A\u26B2\u26D8\u275D\u2768\u278B\u27C0\u2801\u2812\u0180art\u2477\u247A\u247Cr\xF2\u09C6\xF2\u0395ail;\u691Barr;\u690E\u0100;g\u0994\u248B;\u6A8Bar;\u6962\u0963\u24A5\0\u24AA\0\u24B1\0\0\0\0\0\u24B5\u24BA\0\u24C6\u24C8\u24CD\0\u24F9ute;\u413Amptyv;\u69B4ra\xEE\u084Cbda;\u43BBg\u0180;dl\u088E\u24C1\u24C3;\u6991\xE5\u088E;\u6A85uo\u803B\xAB\u40ABr\u0400;bfhlpst\u0899\u24DE\u24E6\u24E9\u24EB\u24EE\u24F1\u24F5\u0100;f\u089D\u24E3s;\u691Fs;\u691D\xEB\u2252p;\u61ABl;\u6939im;\u6973l;\u61A2\u0180;ae\u24FF\u2500\u2504\u6AABil;\u6919\u0100;s\u2509\u250A\u6AAD;\uC000\u2AAD\uFE00\u0180abr\u2515\u2519\u251Drr;\u690Crk;\u6772\u0100ak\u2522\u252Cc\u0100ek\u2528\u252A;\u407B;\u405B\u0100es\u2531\u2533;\u698Bl\u0100du\u2539\u253B;\u698F;\u698D\u0200aeuy\u2546\u254B\u2556\u2558ron;\u413E\u0100di\u2550\u2554il;\u413C\xEC\u08B0\xE2\u2529;\u443B\u0200cqrs\u2563\u2566\u256D\u257Da;\u6936uo\u0100;r\u0E19\u1746\u0100du\u2572\u2577har;\u6967shar;\u694Bh;\u61B2\u0280;fgqs\u258B\u258C\u0989\u25F3\u25FF\u6264t\u0280ahlrt\u2598\u25A4\u25B7\u25C2\u25E8rrow\u0100;t\u0899\u25A1a\xE9\u24F6arpoon\u0100du\u25AF\u25B4own\xBB\u045Ap\xBB\u0966eftarrows;\u61C7ight\u0180ahs\u25CD\u25D6\u25DErrow\u0100;s\u08F4\u08A7arpoon\xF3\u0F98quigarro\xF7\u21F0hreetimes;\u62CB\u0180;qs\u258B\u0993\u25FAlan\xF4\u09AC\u0280;cdgs\u09AC\u260A\u260D\u261D\u2628c;\u6AA8ot\u0100;o\u2614\u2615\u6A7F\u0100;r\u261A\u261B\u6A81;\u6A83\u0100;e\u2622\u2625\uC000\u22DA\uFE00s;\u6A93\u0280adegs\u2633\u2639\u263D\u2649\u264Bppro\xF8\u24C6ot;\u62D6q\u0100gq\u2643\u2645\xF4\u0989gt\xF2\u248C\xF4\u099Bi\xED\u09B2\u0180ilr\u2655\u08E1\u265Asht;\u697C;\uC000\u{1D529}\u0100;E\u099C\u2663;\u6A91\u0161\u2669\u2676r\u0100du\u25B2\u266E\u0100;l\u0965\u2673;\u696Alk;\u6584cy;\u4459\u0280;acht\u0A48\u2688\u268B\u2691\u2696r\xF2\u25C1orne\xF2\u1D08ard;\u696Bri;\u65FA\u0100io\u269F\u26A4dot;\u4140ust\u0100;a\u26AC\u26AD\u63B0che\xBB\u26AD\u0200Eaes\u26BB\u26BD\u26C9\u26D4;\u6268p\u0100;p\u26C3\u26C4\u6A89rox\xBB\u26C4\u0100;q\u26CE\u26CF\u6A87\u0100;q\u26CE\u26BBim;\u62E6\u0400abnoptwz\u26E9\u26F4\u26F7\u271A\u272F\u2741\u2747\u2750\u0100nr\u26EE\u26F1g;\u67ECr;\u61FDr\xEB\u08C1g\u0180lmr\u26FF\u270D\u2714eft\u0100ar\u09E6\u2707ight\xE1\u09F2apsto;\u67FCight\xE1\u09FDparrow\u0100lr\u2725\u2729ef\xF4\u24EDight;\u61AC\u0180afl\u2736\u2739\u273Dr;\u6985;\uC000\u{1D55D}us;\u6A2Dimes;\u6A34\u0161\u274B\u274Fst;\u6217\xE1\u134E\u0180;ef\u2757\u2758\u1800\u65CAnge\xBB\u2758ar\u0100;l\u2764\u2765\u4028t;\u6993\u0280achmt\u2773\u2776\u277C\u2785\u2787r\xF2\u08A8orne\xF2\u1D8Car\u0100;d\u0F98\u2783;\u696D;\u600Eri;\u62BF\u0300achiqt\u2798\u279D\u0A40\u27A2\u27AE\u27BBquo;\u6039r;\uC000\u{1D4C1}m\u0180;eg\u09B2\u27AA\u27AC;\u6A8D;\u6A8F\u0100bu\u252A\u27B3o\u0100;r\u0E1F\u27B9;\u601Arok;\u4142\u8400<;cdhilqr\u082B\u27D2\u2639\u27DC\u27E0\u27E5\u27EA\u27F0\u0100ci\u27D7\u27D9;\u6AA6r;\u6A79re\xE5\u25F2mes;\u62C9arr;\u6976uest;\u6A7B\u0100Pi\u27F5\u27F9ar;\u6996\u0180;ef\u2800\u092D\u181B\u65C3r\u0100du\u2807\u280Dshar;\u694Ahar;\u6966\u0100en\u2817\u2821rtneqq;\uC000\u2268\uFE00\xC5\u281E\u0700Dacdefhilnopsu\u2840\u2845\u2882\u288E\u2893\u28A0\u28A5\u28A8\u28DA\u28E2\u28E4\u0A83\u28F3\u2902Dot;\u623A\u0200clpr\u284E\u2852\u2863\u287Dr\u803B\xAF\u40AF\u0100et\u2857\u2859;\u6642\u0100;e\u285E\u285F\u6720se\xBB\u285F\u0100;s\u103B\u2868to\u0200;dlu\u103B\u2873\u2877\u287Bow\xEE\u048Cef\xF4\u090F\xF0\u13D1ker;\u65AE\u0100oy\u2887\u288Cmma;\u6A29;\u443Cash;\u6014asuredangle\xBB\u1626r;\uC000\u{1D52A}o;\u6127\u0180cdn\u28AF\u28B4\u28C9ro\u803B\xB5\u40B5\u0200;acd\u1464\u28BD\u28C0\u28C4s\xF4\u16A7ir;\u6AF0ot\u80BB\xB7\u01B5us\u0180;bd\u28D2\u1903\u28D3\u6212\u0100;u\u1D3C\u28D8;\u6A2A\u0163\u28DE\u28E1p;\u6ADB\xF2\u2212\xF0\u0A81\u0100dp\u28E9\u28EEels;\u62A7f;\uC000\u{1D55E}\u0100ct\u28F8\u28FDr;\uC000\u{1D4C2}pos\xBB\u159D\u0180;lm\u2909\u290A\u290D\u43BCtimap;\u62B8\u0C00GLRVabcdefghijlmoprstuvw\u2942\u2953\u297E\u2989\u2998\u29DA\u29E9\u2A15\u2A1A\u2A58\u2A5D\u2A83\u2A95\u2AA4\u2AA8\u2B04\u2B07\u2B44\u2B7F\u2BAE\u2C34\u2C67\u2C7C\u2CE9\u0100gt\u2947\u294B;\uC000\u22D9\u0338\u0100;v\u2950\u0BCF\uC000\u226B\u20D2\u0180elt\u295A\u2972\u2976ft\u0100ar\u2961\u2967rrow;\u61CDightarrow;\u61CE;\uC000\u22D8\u0338\u0100;v\u297B\u0C47\uC000\u226A\u20D2ightarrow;\u61CF\u0100Dd\u298E\u2993ash;\u62AFash;\u62AE\u0280bcnpt\u29A3\u29A7\u29AC\u29B1\u29CCla\xBB\u02DEute;\u4144g;\uC000\u2220\u20D2\u0280;Eiop\u0D84\u29BC\u29C0\u29C5\u29C8;\uC000\u2A70\u0338d;\uC000\u224B\u0338s;\u4149ro\xF8\u0D84ur\u0100;a\u29D3\u29D4\u666El\u0100;s\u29D3\u0B38\u01F3\u29DF\0\u29E3p\u80BB\xA0\u0B37mp\u0100;e\u0BF9\u0C00\u0280aeouy\u29F4\u29FE\u2A03\u2A10\u2A13\u01F0\u29F9\0\u29FB;\u6A43on;\u4148dil;\u4146ng\u0100;d\u0D7E\u2A0Aot;\uC000\u2A6D\u0338p;\u6A42;\u443Dash;\u6013\u0380;Aadqsx\u0B92\u2A29\u2A2D\u2A3B\u2A41\u2A45\u2A50rr;\u61D7r\u0100hr\u2A33\u2A36k;\u6924\u0100;o\u13F2\u13F0ot;\uC000\u2250\u0338ui\xF6\u0B63\u0100ei\u2A4A\u2A4Ear;\u6928\xED\u0B98ist\u0100;s\u0BA0\u0B9Fr;\uC000\u{1D52B}\u0200Eest\u0BC5\u2A66\u2A79\u2A7C\u0180;qs\u0BBC\u2A6D\u0BE1\u0180;qs\u0BBC\u0BC5\u2A74lan\xF4\u0BE2i\xED\u0BEA\u0100;r\u0BB6\u2A81\xBB\u0BB7\u0180Aap\u2A8A\u2A8D\u2A91r\xF2\u2971rr;\u61AEar;\u6AF2\u0180;sv\u0F8D\u2A9C\u0F8C\u0100;d\u2AA1\u2AA2\u62FC;\u62FAcy;\u445A\u0380AEadest\u2AB7\u2ABA\u2ABE\u2AC2\u2AC5\u2AF6\u2AF9r\xF2\u2966;\uC000\u2266\u0338rr;\u619Ar;\u6025\u0200;fqs\u0C3B\u2ACE\u2AE3\u2AEFt\u0100ar\u2AD4\u2AD9rro\xF7\u2AC1ightarro\xF7\u2A90\u0180;qs\u0C3B\u2ABA\u2AEAlan\xF4\u0C55\u0100;s\u0C55\u2AF4\xBB\u0C36i\xED\u0C5D\u0100;r\u0C35\u2AFEi\u0100;e\u0C1A\u0C25i\xE4\u0D90\u0100pt\u2B0C\u2B11f;\uC000\u{1D55F}\u8180\xAC;in\u2B19\u2B1A\u2B36\u40ACn\u0200;Edv\u0B89\u2B24\u2B28\u2B2E;\uC000\u22F9\u0338ot;\uC000\u22F5\u0338\u01E1\u0B89\u2B33\u2B35;\u62F7;\u62F6i\u0100;v\u0CB8\u2B3C\u01E1\u0CB8\u2B41\u2B43;\u62FE;\u62FD\u0180aor\u2B4B\u2B63\u2B69r\u0200;ast\u0B7B\u2B55\u2B5A\u2B5Flle\xEC\u0B7Bl;\uC000\u2AFD\u20E5;\uC000\u2202\u0338lint;\u6A14\u0180;ce\u0C92\u2B70\u2B73u\xE5\u0CA5\u0100;c\u0C98\u2B78\u0100;e\u0C92\u2B7D\xF1\u0C98\u0200Aait\u2B88\u2B8B\u2B9D\u2BA7r\xF2\u2988rr\u0180;cw\u2B94\u2B95\u2B99\u619B;\uC000\u2933\u0338;\uC000\u219D\u0338ghtarrow\xBB\u2B95ri\u0100;e\u0CCB\u0CD6\u0380chimpqu\u2BBD\u2BCD\u2BD9\u2B04\u0B78\u2BE4\u2BEF\u0200;cer\u0D32\u2BC6\u0D37\u2BC9u\xE5\u0D45;\uC000\u{1D4C3}ort\u026D\u2B05\0\0\u2BD6ar\xE1\u2B56m\u0100;e\u0D6E\u2BDF\u0100;q\u0D74\u0D73su\u0100bp\u2BEB\u2BED\xE5\u0CF8\xE5\u0D0B\u0180bcp\u2BF6\u2C11\u2C19\u0200;Ees\u2BFF\u2C00\u0D22\u2C04\u6284;\uC000\u2AC5\u0338et\u0100;e\u0D1B\u2C0Bq\u0100;q\u0D23\u2C00c\u0100;e\u0D32\u2C17\xF1\u0D38\u0200;Ees\u2C22\u2C23\u0D5F\u2C27\u6285;\uC000\u2AC6\u0338et\u0100;e\u0D58\u2C2Eq\u0100;q\u0D60\u2C23\u0200gilr\u2C3D\u2C3F\u2C45\u2C47\xEC\u0BD7lde\u803B\xF1\u40F1\xE7\u0C43iangle\u0100lr\u2C52\u2C5Ceft\u0100;e\u0C1A\u2C5A\xF1\u0C26ight\u0100;e\u0CCB\u2C65\xF1\u0CD7\u0100;m\u2C6C\u2C6D\u43BD\u0180;es\u2C74\u2C75\u2C79\u4023ro;\u6116p;\u6007\u0480DHadgilrs\u2C8F\u2C94\u2C99\u2C9E\u2CA3\u2CB0\u2CB6\u2CD3\u2CE3ash;\u62ADarr;\u6904p;\uC000\u224D\u20D2ash;\u62AC\u0100et\u2CA8\u2CAC;\uC000\u2265\u20D2;\uC000>\u20D2nfin;\u69DE\u0180Aet\u2CBD\u2CC1\u2CC5rr;\u6902;\uC000\u2264\u20D2\u0100;r\u2CCA\u2CCD\uC000<\u20D2ie;\uC000\u22B4\u20D2\u0100At\u2CD8\u2CDCrr;\u6903rie;\uC000\u22B5\u20D2im;\uC000\u223C\u20D2\u0180Aan\u2CF0\u2CF4\u2D02rr;\u61D6r\u0100hr\u2CFA\u2CFDk;\u6923\u0100;o\u13E7\u13E5ear;\u6927\u1253\u1A95\0\0\0\0\0\0\0\0\0\0\0\0\0\u2D2D\0\u2D38\u2D48\u2D60\u2D65\u2D72\u2D84\u1B07\0\0\u2D8D\u2DAB\0\u2DC8\u2DCE\0\u2DDC\u2E19\u2E2B\u2E3E\u2E43\u0100cs\u2D31\u1A97ute\u803B\xF3\u40F3\u0100iy\u2D3C\u2D45r\u0100;c\u1A9E\u2D42\u803B\xF4\u40F4;\u443E\u0280abios\u1AA0\u2D52\u2D57\u01C8\u2D5Alac;\u4151v;\u6A38old;\u69BClig;\u4153\u0100cr\u2D69\u2D6Dir;\u69BF;\uC000\u{1D52C}\u036F\u2D79\0\0\u2D7C\0\u2D82n;\u42DBave\u803B\xF2\u40F2;\u69C1\u0100bm\u2D88\u0DF4ar;\u69B5\u0200acit\u2D95\u2D98\u2DA5\u2DA8r\xF2\u1A80\u0100ir\u2D9D\u2DA0r;\u69BEoss;\u69BBn\xE5\u0E52;\u69C0\u0180aei\u2DB1\u2DB5\u2DB9cr;\u414Dga;\u43C9\u0180cdn\u2DC0\u2DC5\u01CDron;\u43BF;\u69B6pf;\uC000\u{1D560}\u0180ael\u2DD4\u2DD7\u01D2r;\u69B7rp;\u69B9\u0380;adiosv\u2DEA\u2DEB\u2DEE\u2E08\u2E0D\u2E10\u2E16\u6228r\xF2\u1A86\u0200;efm\u2DF7\u2DF8\u2E02\u2E05\u6A5Dr\u0100;o\u2DFE\u2DFF\u6134f\xBB\u2DFF\u803B\xAA\u40AA\u803B\xBA\u40BAgof;\u62B6r;\u6A56lope;\u6A57;\u6A5B\u0180clo\u2E1F\u2E21\u2E27\xF2\u2E01ash\u803B\xF8\u40F8l;\u6298i\u016C\u2E2F\u2E34de\u803B\xF5\u40F5es\u0100;a\u01DB\u2E3As;\u6A36ml\u803B\xF6\u40F6bar;\u633D\u0AE1\u2E5E\0\u2E7D\0\u2E80\u2E9D\0\u2EA2\u2EB9\0\0\u2ECB\u0E9C\0\u2F13\0\0\u2F2B\u2FBC\0\u2FC8r\u0200;ast\u0403\u2E67\u2E72\u0E85\u8100\xB6;l\u2E6D\u2E6E\u40B6le\xEC\u0403\u0269\u2E78\0\0\u2E7Bm;\u6AF3;\u6AFDy;\u443Fr\u0280cimpt\u2E8B\u2E8F\u2E93\u1865\u2E97nt;\u4025od;\u402Eil;\u6030enk;\u6031r;\uC000\u{1D52D}\u0180imo\u2EA8\u2EB0\u2EB4\u0100;v\u2EAD\u2EAE\u43C6;\u43D5ma\xF4\u0A76ne;\u660E\u0180;tv\u2EBF\u2EC0\u2EC8\u43C0chfork\xBB\u1FFD;\u43D6\u0100au\u2ECF\u2EDFn\u0100ck\u2ED5\u2EDDk\u0100;h\u21F4\u2EDB;\u610E\xF6\u21F4s\u0480;abcdemst\u2EF3\u2EF4\u1908\u2EF9\u2EFD\u2F04\u2F06\u2F0A\u2F0E\u402Bcir;\u6A23ir;\u6A22\u0100ou\u1D40\u2F02;\u6A25;\u6A72n\u80BB\xB1\u0E9Dim;\u6A26wo;\u6A27\u0180ipu\u2F19\u2F20\u2F25ntint;\u6A15f;\uC000\u{1D561}nd\u803B\xA3\u40A3\u0500;Eaceinosu\u0EC8\u2F3F\u2F41\u2F44\u2F47\u2F81\u2F89\u2F92\u2F7E\u2FB6;\u6AB3p;\u6AB7u\xE5\u0ED9\u0100;c\u0ECE\u2F4C\u0300;acens\u0EC8\u2F59\u2F5F\u2F66\u2F68\u2F7Eppro\xF8\u2F43urlye\xF1\u0ED9\xF1\u0ECE\u0180aes\u2F6F\u2F76\u2F7Approx;\u6AB9qq;\u6AB5im;\u62E8i\xED\u0EDFme\u0100;s\u2F88\u0EAE\u6032\u0180Eas\u2F78\u2F90\u2F7A\xF0\u2F75\u0180dfp\u0EEC\u2F99\u2FAF\u0180als\u2FA0\u2FA5\u2FAAlar;\u632Eine;\u6312urf;\u6313\u0100;t\u0EFB\u2FB4\xEF\u0EFBrel;\u62B0\u0100ci\u2FC0\u2FC5r;\uC000\u{1D4C5};\u43C8ncsp;\u6008\u0300fiopsu\u2FDA\u22E2\u2FDF\u2FE5\u2FEB\u2FF1r;\uC000\u{1D52E}pf;\uC000\u{1D562}rime;\u6057cr;\uC000\u{1D4C6}\u0180aeo\u2FF8\u3009\u3013t\u0100ei\u2FFE\u3005rnion\xF3\u06B0nt;\u6A16st\u0100;e\u3010\u3011\u403F\xF1\u1F19\xF4\u0F14\u0A80ABHabcdefhilmnoprstux\u3040\u3051\u3055\u3059\u30E0\u310E\u312B\u3147\u3162\u3172\u318E\u3206\u3215\u3224\u3229\u3258\u326E\u3272\u3290\u32B0\u32B7\u0180art\u3047\u304A\u304Cr\xF2\u10B3\xF2\u03DDail;\u691Car\xF2\u1C65ar;\u6964\u0380cdenqrt\u3068\u3075\u3078\u307F\u308F\u3094\u30CC\u0100eu\u306D\u3071;\uC000\u223D\u0331te;\u4155i\xE3\u116Emptyv;\u69B3g\u0200;del\u0FD1\u3089\u308B\u308D;\u6992;\u69A5\xE5\u0FD1uo\u803B\xBB\u40BBr\u0580;abcfhlpstw\u0FDC\u30AC\u30AF\u30B7\u30B9\u30BC\u30BE\u30C0\u30C3\u30C7\u30CAp;\u6975\u0100;f\u0FE0\u30B4s;\u6920;\u6933s;\u691E\xEB\u225D\xF0\u272El;\u6945im;\u6974l;\u61A3;\u619D\u0100ai\u30D1\u30D5il;\u691Ao\u0100;n\u30DB\u30DC\u6236al\xF3\u0F1E\u0180abr\u30E7\u30EA\u30EEr\xF2\u17E5rk;\u6773\u0100ak\u30F3\u30FDc\u0100ek\u30F9\u30FB;\u407D;\u405D\u0100es\u3102\u3104;\u698Cl\u0100du\u310A\u310C;\u698E;\u6990\u0200aeuy\u3117\u311C\u3127\u3129ron;\u4159\u0100di\u3121\u3125il;\u4157\xEC\u0FF2\xE2\u30FA;\u4440\u0200clqs\u3134\u3137\u313D\u3144a;\u6937dhar;\u6969uo\u0100;r\u020E\u020Dh;\u61B3\u0180acg\u314E\u315F\u0F44l\u0200;ips\u0F78\u3158\u315B\u109Cn\xE5\u10BBar\xF4\u0FA9t;\u65AD\u0180ilr\u3169\u1023\u316Esht;\u697D;\uC000\u{1D52F}\u0100ao\u3177\u3186r\u0100du\u317D\u317F\xBB\u047B\u0100;l\u1091\u3184;\u696C\u0100;v\u318B\u318C\u43C1;\u43F1\u0180gns\u3195\u31F9\u31FCht\u0300ahlrst\u31A4\u31B0\u31C2\u31D8\u31E4\u31EErrow\u0100;t\u0FDC\u31ADa\xE9\u30C8arpoon\u0100du\u31BB\u31BFow\xEE\u317Ep\xBB\u1092eft\u0100ah\u31CA\u31D0rrow\xF3\u0FEAarpoon\xF3\u0551ightarrows;\u61C9quigarro\xF7\u30CBhreetimes;\u62CCg;\u42DAingdotse\xF1\u1F32\u0180ahm\u320D\u3210\u3213r\xF2\u0FEAa\xF2\u0551;\u600Foust\u0100;a\u321E\u321F\u63B1che\xBB\u321Fmid;\u6AEE\u0200abpt\u3232\u323D\u3240\u3252\u0100nr\u3237\u323Ag;\u67EDr;\u61FEr\xEB\u1003\u0180afl\u3247\u324A\u324Er;\u6986;\uC000\u{1D563}us;\u6A2Eimes;\u6A35\u0100ap\u325D\u3267r\u0100;g\u3263\u3264\u4029t;\u6994olint;\u6A12ar\xF2\u31E3\u0200achq\u327B\u3280\u10BC\u3285quo;\u603Ar;\uC000\u{1D4C7}\u0100bu\u30FB\u328Ao\u0100;r\u0214\u0213\u0180hir\u3297\u329B\u32A0re\xE5\u31F8mes;\u62CAi\u0200;efl\u32AA\u1059\u1821\u32AB\u65B9tri;\u69CEluhar;\u6968;\u611E\u0D61\u32D5\u32DB\u32DF\u332C\u3338\u3371\0\u337A\u33A4\0\0\u33EC\u33F0\0\u3428\u3448\u345A\u34AD\u34B1\u34CA\u34F1\0\u3616\0\0\u3633cute;\u415Bqu\xEF\u27BA\u0500;Eaceinpsy\u11ED\u32F3\u32F5\u32FF\u3302\u330B\u330F\u331F\u3326\u3329;\u6AB4\u01F0\u32FA\0\u32FC;\u6AB8on;\u4161u\xE5\u11FE\u0100;d\u11F3\u3307il;\u415Frc;\u415D\u0180Eas\u3316\u3318\u331B;\u6AB6p;\u6ABAim;\u62E9olint;\u6A13i\xED\u1204;\u4441ot\u0180;be\u3334\u1D47\u3335\u62C5;\u6A66\u0380Aacmstx\u3346\u334A\u3357\u335B\u335E\u3363\u336Drr;\u61D8r\u0100hr\u3350\u3352\xEB\u2228\u0100;o\u0A36\u0A34t\u803B\xA7\u40A7i;\u403Bwar;\u6929m\u0100in\u3369\xF0nu\xF3\xF1t;\u6736r\u0100;o\u3376\u2055\uC000\u{1D530}\u0200acoy\u3382\u3386\u3391\u33A0rp;\u666F\u0100hy\u338B\u338Fcy;\u4449;\u4448rt\u026D\u3399\0\0\u339Ci\xE4\u1464ara\xEC\u2E6F\u803B\xAD\u40AD\u0100gm\u33A8\u33B4ma\u0180;fv\u33B1\u33B2\u33B2\u43C3;\u43C2\u0400;deglnpr\u12AB\u33C5\u33C9\u33CE\u33D6\u33DE\u33E1\u33E6ot;\u6A6A\u0100;q\u12B1\u12B0\u0100;E\u33D3\u33D4\u6A9E;\u6AA0\u0100;E\u33DB\u33DC\u6A9D;\u6A9Fe;\u6246lus;\u6A24arr;\u6972ar\xF2\u113D\u0200aeit\u33F8\u3408\u340F\u3417\u0100ls\u33FD\u3404lsetm\xE9\u336Ahp;\u6A33parsl;\u69E4\u0100dl\u1463\u3414e;\u6323\u0100;e\u341C\u341D\u6AAA\u0100;s\u3422\u3423\u6AAC;\uC000\u2AAC\uFE00\u0180flp\u342E\u3433\u3442tcy;\u444C\u0100;b\u3438\u3439\u402F\u0100;a\u343E\u343F\u69C4r;\u633Ff;\uC000\u{1D564}a\u0100dr\u344D\u0402es\u0100;u\u3454\u3455\u6660it\xBB\u3455\u0180csu\u3460\u3479\u349F\u0100au\u3465\u346Fp\u0100;s\u1188\u346B;\uC000\u2293\uFE00p\u0100;s\u11B4\u3475;\uC000\u2294\uFE00u\u0100bp\u347F\u348F\u0180;es\u1197\u119C\u3486et\u0100;e\u1197\u348D\xF1\u119D\u0180;es\u11A8\u11AD\u3496et\u0100;e\u11A8\u349D\xF1\u11AE\u0180;af\u117B\u34A6\u05B0r\u0165\u34AB\u05B1\xBB\u117Car\xF2\u1148\u0200cemt\u34B9\u34BE\u34C2\u34C5r;\uC000\u{1D4C8}tm\xEE\xF1i\xEC\u3415ar\xE6\u11BE\u0100ar\u34CE\u34D5r\u0100;f\u34D4\u17BF\u6606\u0100an\u34DA\u34EDight\u0100ep\u34E3\u34EApsilo\xEE\u1EE0h\xE9\u2EAFs\xBB\u2852\u0280bcmnp\u34FB\u355E\u1209\u358B\u358E\u0480;Edemnprs\u350E\u350F\u3511\u3515\u351E\u3523\u352C\u3531\u3536\u6282;\u6AC5ot;\u6ABD\u0100;d\u11DA\u351Aot;\u6AC3ult;\u6AC1\u0100Ee\u3528\u352A;\u6ACB;\u628Alus;\u6ABFarr;\u6979\u0180eiu\u353D\u3552\u3555t\u0180;en\u350E\u3545\u354Bq\u0100;q\u11DA\u350Feq\u0100;q\u352B\u3528m;\u6AC7\u0100bp\u355A\u355C;\u6AD5;\u6AD3c\u0300;acens\u11ED\u356C\u3572\u3579\u357B\u3326ppro\xF8\u32FAurlye\xF1\u11FE\xF1\u11F3\u0180aes\u3582\u3588\u331Bppro\xF8\u331Aq\xF1\u3317g;\u666A\u0680123;Edehlmnps\u35A9\u35AC\u35AF\u121C\u35B2\u35B4\u35C0\u35C9\u35D5\u35DA\u35DF\u35E8\u35ED\u803B\xB9\u40B9\u803B\xB2\u40B2\u803B\xB3\u40B3;\u6AC6\u0100os\u35B9\u35BCt;\u6ABEub;\u6AD8\u0100;d\u1222\u35C5ot;\u6AC4s\u0100ou\u35CF\u35D2l;\u67C9b;\u6AD7arr;\u697Bult;\u6AC2\u0100Ee\u35E4\u35E6;\u6ACC;\u628Blus;\u6AC0\u0180eiu\u35F4\u3609\u360Ct\u0180;en\u121C\u35FC\u3602q\u0100;q\u1222\u35B2eq\u0100;q\u35E7\u35E4m;\u6AC8\u0100bp\u3611\u3613;\u6AD4;\u6AD6\u0180Aan\u361C\u3620\u362Drr;\u61D9r\u0100hr\u3626\u3628\xEB\u222E\u0100;o\u0A2B\u0A29war;\u692Alig\u803B\xDF\u40DF\u0BE1\u3651\u365D\u3660\u12CE\u3673\u3679\0\u367E\u36C2\0\0\0\0\0\u36DB\u3703\0\u3709\u376C\0\0\0\u3787\u0272\u3656\0\0\u365Bget;\u6316;\u43C4r\xEB\u0E5F\u0180aey\u3666\u366B\u3670ron;\u4165dil;\u4163;\u4442lrec;\u6315r;\uC000\u{1D531}\u0200eiko\u3686\u369D\u36B5\u36BC\u01F2\u368B\0\u3691e\u01004f\u1284\u1281a\u0180;sv\u3698\u3699\u369B\u43B8ym;\u43D1\u0100cn\u36A2\u36B2k\u0100as\u36A8\u36AEppro\xF8\u12C1im\xBB\u12ACs\xF0\u129E\u0100as\u36BA\u36AE\xF0\u12C1rn\u803B\xFE\u40FE\u01EC\u031F\u36C6\u22E7es\u8180\xD7;bd\u36CF\u36D0\u36D8\u40D7\u0100;a\u190F\u36D5r;\u6A31;\u6A30\u0180eps\u36E1\u36E3\u3700\xE1\u2A4D\u0200;bcf\u0486\u36EC\u36F0\u36F4ot;\u6336ir;\u6AF1\u0100;o\u36F9\u36FC\uC000\u{1D565}rk;\u6ADA\xE1\u3362rime;\u6034\u0180aip\u370F\u3712\u3764d\xE5\u1248\u0380adempst\u3721\u374D\u3740\u3751\u3757\u375C\u375Fngle\u0280;dlqr\u3730\u3731\u3736\u3740\u3742\u65B5own\xBB\u1DBBeft\u0100;e\u2800\u373E\xF1\u092E;\u625Cight\u0100;e\u32AA\u374B\xF1\u105Aot;\u65ECinus;\u6A3Alus;\u6A39b;\u69CDime;\u6A3Bezium;\u63E2\u0180cht\u3772\u377D\u3781\u0100ry\u3777\u377B;\uC000\u{1D4C9};\u4446cy;\u445Brok;\u4167\u0100io\u378B\u378Ex\xF4\u1777head\u0100lr\u3797\u37A0eftarro\xF7\u084Fightarrow\xBB\u0F5D\u0900AHabcdfghlmoprstuw\u37D0\u37D3\u37D7\u37E4\u37F0\u37FC\u380E\u381C\u3823\u3834\u3851\u385D\u386B\u38A9\u38CC\u38D2\u38EA\u38F6r\xF2\u03EDar;\u6963\u0100cr\u37DC\u37E2ute\u803B\xFA\u40FA\xF2\u1150r\u01E3\u37EA\0\u37EDy;\u445Eve;\u416D\u0100iy\u37F5\u37FArc\u803B\xFB\u40FB;\u4443\u0180abh\u3803\u3806\u380Br\xF2\u13ADlac;\u4171a\xF2\u13C3\u0100ir\u3813\u3818sht;\u697E;\uC000\u{1D532}rave\u803B\xF9\u40F9\u0161\u3827\u3831r\u0100lr\u382C\u382E\xBB\u0957\xBB\u1083lk;\u6580\u0100ct\u3839\u384D\u026F\u383F\0\0\u384Arn\u0100;e\u3845\u3846\u631Cr\xBB\u3846op;\u630Fri;\u65F8\u0100al\u3856\u385Acr;\u416B\u80BB\xA8\u0349\u0100gp\u3862\u3866on;\u4173f;\uC000\u{1D566}\u0300adhlsu\u114B\u3878\u387D\u1372\u3891\u38A0own\xE1\u13B3arpoon\u0100lr\u3888\u388Cef\xF4\u382Digh\xF4\u382Fi\u0180;hl\u3899\u389A\u389C\u43C5\xBB\u13FAon\xBB\u389Aparrows;\u61C8\u0180cit\u38B0\u38C4\u38C8\u026F\u38B6\0\0\u38C1rn\u0100;e\u38BC\u38BD\u631Dr\xBB\u38BDop;\u630Eng;\u416Fri;\u65F9cr;\uC000\u{1D4CA}\u0180dir\u38D9\u38DD\u38E2ot;\u62F0lde;\u4169i\u0100;f\u3730\u38E8\xBB\u1813\u0100am\u38EF\u38F2r\xF2\u38A8l\u803B\xFC\u40FCangle;\u69A7\u0780ABDacdeflnoprsz\u391C\u391F\u3929\u392D\u39B5\u39B8\u39BD\u39DF\u39E4\u39E8\u39F3\u39F9\u39FD\u3A01\u3A20r\xF2\u03F7ar\u0100;v\u3926\u3927\u6AE8;\u6AE9as\xE8\u03E1\u0100nr\u3932\u3937grt;\u699C\u0380eknprst\u34E3\u3946\u394B\u3952\u395D\u3964\u3996app\xE1\u2415othin\xE7\u1E96\u0180hir\u34EB\u2EC8\u3959op\xF4\u2FB5\u0100;h\u13B7\u3962\xEF\u318D\u0100iu\u3969\u396Dgm\xE1\u33B3\u0100bp\u3972\u3984setneq\u0100;q\u397D\u3980\uC000\u228A\uFE00;\uC000\u2ACB\uFE00setneq\u0100;q\u398F\u3992\uC000\u228B\uFE00;\uC000\u2ACC\uFE00\u0100hr\u399B\u399Fet\xE1\u369Ciangle\u0100lr\u39AA\u39AFeft\xBB\u0925ight\xBB\u1051y;\u4432ash\xBB\u1036\u0180elr\u39C4\u39D2\u39D7\u0180;be\u2DEA\u39CB\u39CFar;\u62BBq;\u625Alip;\u62EE\u0100bt\u39DC\u1468a\xF2\u1469r;\uC000\u{1D533}tr\xE9\u39AEsu\u0100bp\u39EF\u39F1\xBB\u0D1C\xBB\u0D59pf;\uC000\u{1D567}ro\xF0\u0EFBtr\xE9\u39B4\u0100cu\u3A06\u3A0Br;\uC000\u{1D4CB}\u0100bp\u3A10\u3A18n\u0100Ee\u3980\u3A16\xBB\u397En\u0100Ee\u3992\u3A1E\xBB\u3990igzag;\u699A\u0380cefoprs\u3A36\u3A3B\u3A56\u3A5B\u3A54\u3A61\u3A6Airc;\u4175\u0100di\u3A40\u3A51\u0100bg\u3A45\u3A49ar;\u6A5Fe\u0100;q\u15FA\u3A4F;\u6259erp;\u6118r;\uC000\u{1D534}pf;\uC000\u{1D568}\u0100;e\u1479\u3A66at\xE8\u1479cr;\uC000\u{1D4CC}\u0AE3\u178E\u3A87\0\u3A8B\0\u3A90\u3A9B\0\0\u3A9D\u3AA8\u3AAB\u3AAF\0\0\u3AC3\u3ACE\0\u3AD8\u17DC\u17DFtr\xE9\u17D1r;\uC000\u{1D535}\u0100Aa\u3A94\u3A97r\xF2\u03C3r\xF2\u09F6;\u43BE\u0100Aa\u3AA1\u3AA4r\xF2\u03B8r\xF2\u09EBa\xF0\u2713is;\u62FB\u0180dpt\u17A4\u3AB5\u3ABE\u0100fl\u3ABA\u17A9;\uC000\u{1D569}im\xE5\u17B2\u0100Aa\u3AC7\u3ACAr\xF2\u03CEr\xF2\u0A01\u0100cq\u3AD2\u17B8r;\uC000\u{1D4CD}\u0100pt\u17D6\u3ADCr\xE9\u17D4\u0400acefiosu\u3AF0\u3AFD\u3B08\u3B0C\u3B11\u3B15\u3B1B\u3B21c\u0100uy\u3AF6\u3AFBte\u803B\xFD\u40FD;\u444F\u0100iy\u3B02\u3B06rc;\u4177;\u444Bn\u803B\xA5\u40A5r;\uC000\u{1D536}cy;\u4457pf;\uC000\u{1D56A}cr;\uC000\u{1D4CE}\u0100cm\u3B26\u3B29y;\u444El\u803B\xFF\u40FF\u0500acdefhiosw\u3B42\u3B48\u3B54\u3B58\u3B64\u3B69\u3B6D\u3B74\u3B7A\u3B80cute;\u417A\u0100ay\u3B4D\u3B52ron;\u417E;\u4437ot;\u417C\u0100et\u3B5D\u3B61tr\xE6\u155Fa;\u43B6r;\uC000\u{1D537}cy;\u4436grarr;\u61DDpf;\uC000\u{1D56B}cr;\uC000\u{1D4CF}\u0100jn\u3B85\u3B87;\u600Dj;\u600C'.split("").map(function(c) {
        return c.charCodeAt(0);
      })
    );
  }
});

// node_modules/dom-serializer/node_modules/entities/lib/generated/decode-data-xml.js
var require_decode_data_xml2 = __commonJS({
  "node_modules/dom-serializer/node_modules/entities/lib/generated/decode-data-xml.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = new Uint16Array(
      // prettier-ignore
      "\u0200aglq	\x1B\u026D\0\0p;\u4026os;\u4027t;\u403Et;\u403Cuot;\u4022".split("").map(function(c) {
        return c.charCodeAt(0);
      })
    );
  }
});

// node_modules/dom-serializer/node_modules/entities/lib/decode_codepoint.js
var require_decode_codepoint2 = __commonJS({
  "node_modules/dom-serializer/node_modules/entities/lib/decode_codepoint.js"(exports2) {
    "use strict";
    var _a;
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.replaceCodePoint = exports2.fromCodePoint = void 0;
    var decodeMap = /* @__PURE__ */ new Map([
      [0, 65533],
      // C1 Unicode control character reference replacements
      [128, 8364],
      [130, 8218],
      [131, 402],
      [132, 8222],
      [133, 8230],
      [134, 8224],
      [135, 8225],
      [136, 710],
      [137, 8240],
      [138, 352],
      [139, 8249],
      [140, 338],
      [142, 381],
      [145, 8216],
      [146, 8217],
      [147, 8220],
      [148, 8221],
      [149, 8226],
      [150, 8211],
      [151, 8212],
      [152, 732],
      [153, 8482],
      [154, 353],
      [155, 8250],
      [156, 339],
      [158, 382],
      [159, 376]
    ]);
    exports2.fromCodePoint = // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, node/no-unsupported-features/es-builtins
    (_a = String.fromCodePoint) !== null && _a !== void 0 ? _a : function(codePoint) {
      var output = "";
      if (codePoint > 65535) {
        codePoint -= 65536;
        output += String.fromCharCode(codePoint >>> 10 & 1023 | 55296);
        codePoint = 56320 | codePoint & 1023;
      }
      output += String.fromCharCode(codePoint);
      return output;
    };
    function replaceCodePoint(codePoint) {
      var _a2;
      if (codePoint >= 55296 && codePoint <= 57343 || codePoint > 1114111) {
        return 65533;
      }
      return (_a2 = decodeMap.get(codePoint)) !== null && _a2 !== void 0 ? _a2 : codePoint;
    }
    exports2.replaceCodePoint = replaceCodePoint;
    function decodeCodePoint(codePoint) {
      return (0, exports2.fromCodePoint)(replaceCodePoint(codePoint));
    }
    exports2.default = decodeCodePoint;
  }
});

// node_modules/dom-serializer/node_modules/entities/lib/decode.js
var require_decode2 = __commonJS({
  "node_modules/dom-serializer/node_modules/entities/lib/decode.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.decodeXML = exports2.decodeHTMLStrict = exports2.decodeHTMLAttribute = exports2.decodeHTML = exports2.determineBranch = exports2.EntityDecoder = exports2.DecodingMode = exports2.BinTrieFlags = exports2.fromCodePoint = exports2.replaceCodePoint = exports2.decodeCodePoint = exports2.xmlDecodeTree = exports2.htmlDecodeTree = void 0;
    var decode_data_html_js_1 = __importDefault(require_decode_data_html2());
    exports2.htmlDecodeTree = decode_data_html_js_1.default;
    var decode_data_xml_js_1 = __importDefault(require_decode_data_xml2());
    exports2.xmlDecodeTree = decode_data_xml_js_1.default;
    var decode_codepoint_js_1 = __importStar(require_decode_codepoint2());
    exports2.decodeCodePoint = decode_codepoint_js_1.default;
    var decode_codepoint_js_2 = require_decode_codepoint2();
    Object.defineProperty(exports2, "replaceCodePoint", { enumerable: true, get: function() {
      return decode_codepoint_js_2.replaceCodePoint;
    } });
    Object.defineProperty(exports2, "fromCodePoint", { enumerable: true, get: function() {
      return decode_codepoint_js_2.fromCodePoint;
    } });
    var CharCodes;
    (function(CharCodes2) {
      CharCodes2[CharCodes2["NUM"] = 35] = "NUM";
      CharCodes2[CharCodes2["SEMI"] = 59] = "SEMI";
      CharCodes2[CharCodes2["EQUALS"] = 61] = "EQUALS";
      CharCodes2[CharCodes2["ZERO"] = 48] = "ZERO";
      CharCodes2[CharCodes2["NINE"] = 57] = "NINE";
      CharCodes2[CharCodes2["LOWER_A"] = 97] = "LOWER_A";
      CharCodes2[CharCodes2["LOWER_F"] = 102] = "LOWER_F";
      CharCodes2[CharCodes2["LOWER_X"] = 120] = "LOWER_X";
      CharCodes2[CharCodes2["LOWER_Z"] = 122] = "LOWER_Z";
      CharCodes2[CharCodes2["UPPER_A"] = 65] = "UPPER_A";
      CharCodes2[CharCodes2["UPPER_F"] = 70] = "UPPER_F";
      CharCodes2[CharCodes2["UPPER_Z"] = 90] = "UPPER_Z";
    })(CharCodes || (CharCodes = {}));
    var TO_LOWER_BIT = 32;
    var BinTrieFlags;
    (function(BinTrieFlags2) {
      BinTrieFlags2[BinTrieFlags2["VALUE_LENGTH"] = 49152] = "VALUE_LENGTH";
      BinTrieFlags2[BinTrieFlags2["BRANCH_LENGTH"] = 16256] = "BRANCH_LENGTH";
      BinTrieFlags2[BinTrieFlags2["JUMP_TABLE"] = 127] = "JUMP_TABLE";
    })(BinTrieFlags = exports2.BinTrieFlags || (exports2.BinTrieFlags = {}));
    function isNumber(code) {
      return code >= CharCodes.ZERO && code <= CharCodes.NINE;
    }
    function isHexadecimalCharacter(code) {
      return code >= CharCodes.UPPER_A && code <= CharCodes.UPPER_F || code >= CharCodes.LOWER_A && code <= CharCodes.LOWER_F;
    }
    function isAsciiAlphaNumeric(code) {
      return code >= CharCodes.UPPER_A && code <= CharCodes.UPPER_Z || code >= CharCodes.LOWER_A && code <= CharCodes.LOWER_Z || isNumber(code);
    }
    function isEntityInAttributeInvalidEnd(code) {
      return code === CharCodes.EQUALS || isAsciiAlphaNumeric(code);
    }
    var EntityDecoderState;
    (function(EntityDecoderState2) {
      EntityDecoderState2[EntityDecoderState2["EntityStart"] = 0] = "EntityStart";
      EntityDecoderState2[EntityDecoderState2["NumericStart"] = 1] = "NumericStart";
      EntityDecoderState2[EntityDecoderState2["NumericDecimal"] = 2] = "NumericDecimal";
      EntityDecoderState2[EntityDecoderState2["NumericHex"] = 3] = "NumericHex";
      EntityDecoderState2[EntityDecoderState2["NamedEntity"] = 4] = "NamedEntity";
    })(EntityDecoderState || (EntityDecoderState = {}));
    var DecodingMode;
    (function(DecodingMode2) {
      DecodingMode2[DecodingMode2["Legacy"] = 0] = "Legacy";
      DecodingMode2[DecodingMode2["Strict"] = 1] = "Strict";
      DecodingMode2[DecodingMode2["Attribute"] = 2] = "Attribute";
    })(DecodingMode = exports2.DecodingMode || (exports2.DecodingMode = {}));
    var EntityDecoder = (
      /** @class */
      (function() {
        function EntityDecoder2(decodeTree, emitCodePoint, errors) {
          this.decodeTree = decodeTree;
          this.emitCodePoint = emitCodePoint;
          this.errors = errors;
          this.state = EntityDecoderState.EntityStart;
          this.consumed = 1;
          this.result = 0;
          this.treeIndex = 0;
          this.excess = 1;
          this.decodeMode = DecodingMode.Strict;
        }
        EntityDecoder2.prototype.startEntity = function(decodeMode) {
          this.decodeMode = decodeMode;
          this.state = EntityDecoderState.EntityStart;
          this.result = 0;
          this.treeIndex = 0;
          this.excess = 1;
          this.consumed = 1;
        };
        EntityDecoder2.prototype.write = function(str, offset) {
          switch (this.state) {
            case EntityDecoderState.EntityStart: {
              if (str.charCodeAt(offset) === CharCodes.NUM) {
                this.state = EntityDecoderState.NumericStart;
                this.consumed += 1;
                return this.stateNumericStart(str, offset + 1);
              }
              this.state = EntityDecoderState.NamedEntity;
              return this.stateNamedEntity(str, offset);
            }
            case EntityDecoderState.NumericStart: {
              return this.stateNumericStart(str, offset);
            }
            case EntityDecoderState.NumericDecimal: {
              return this.stateNumericDecimal(str, offset);
            }
            case EntityDecoderState.NumericHex: {
              return this.stateNumericHex(str, offset);
            }
            case EntityDecoderState.NamedEntity: {
              return this.stateNamedEntity(str, offset);
            }
          }
        };
        EntityDecoder2.prototype.stateNumericStart = function(str, offset) {
          if (offset >= str.length) {
            return -1;
          }
          if ((str.charCodeAt(offset) | TO_LOWER_BIT) === CharCodes.LOWER_X) {
            this.state = EntityDecoderState.NumericHex;
            this.consumed += 1;
            return this.stateNumericHex(str, offset + 1);
          }
          this.state = EntityDecoderState.NumericDecimal;
          return this.stateNumericDecimal(str, offset);
        };
        EntityDecoder2.prototype.addToNumericResult = function(str, start, end, base) {
          if (start !== end) {
            var digitCount = end - start;
            this.result = this.result * Math.pow(base, digitCount) + parseInt(str.substr(start, digitCount), base);
            this.consumed += digitCount;
          }
        };
        EntityDecoder2.prototype.stateNumericHex = function(str, offset) {
          var startIdx = offset;
          while (offset < str.length) {
            var char = str.charCodeAt(offset);
            if (isNumber(char) || isHexadecimalCharacter(char)) {
              offset += 1;
            } else {
              this.addToNumericResult(str, startIdx, offset, 16);
              return this.emitNumericEntity(char, 3);
            }
          }
          this.addToNumericResult(str, startIdx, offset, 16);
          return -1;
        };
        EntityDecoder2.prototype.stateNumericDecimal = function(str, offset) {
          var startIdx = offset;
          while (offset < str.length) {
            var char = str.charCodeAt(offset);
            if (isNumber(char)) {
              offset += 1;
            } else {
              this.addToNumericResult(str, startIdx, offset, 10);
              return this.emitNumericEntity(char, 2);
            }
          }
          this.addToNumericResult(str, startIdx, offset, 10);
          return -1;
        };
        EntityDecoder2.prototype.emitNumericEntity = function(lastCp, expectedLength) {
          var _a;
          if (this.consumed <= expectedLength) {
            (_a = this.errors) === null || _a === void 0 ? void 0 : _a.absenceOfDigitsInNumericCharacterReference(this.consumed);
            return 0;
          }
          if (lastCp === CharCodes.SEMI) {
            this.consumed += 1;
          } else if (this.decodeMode === DecodingMode.Strict) {
            return 0;
          }
          this.emitCodePoint((0, decode_codepoint_js_1.replaceCodePoint)(this.result), this.consumed);
          if (this.errors) {
            if (lastCp !== CharCodes.SEMI) {
              this.errors.missingSemicolonAfterCharacterReference();
            }
            this.errors.validateNumericCharacterReference(this.result);
          }
          return this.consumed;
        };
        EntityDecoder2.prototype.stateNamedEntity = function(str, offset) {
          var decodeTree = this.decodeTree;
          var current = decodeTree[this.treeIndex];
          var valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
          for (; offset < str.length; offset++, this.excess++) {
            var char = str.charCodeAt(offset);
            this.treeIndex = determineBranch(decodeTree, current, this.treeIndex + Math.max(1, valueLength), char);
            if (this.treeIndex < 0) {
              return this.result === 0 || // If we are parsing an attribute
              this.decodeMode === DecodingMode.Attribute && // We shouldn't have consumed any characters after the entity,
              (valueLength === 0 || // And there should be no invalid characters.
              isEntityInAttributeInvalidEnd(char)) ? 0 : this.emitNotTerminatedNamedEntity();
            }
            current = decodeTree[this.treeIndex];
            valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
            if (valueLength !== 0) {
              if (char === CharCodes.SEMI) {
                return this.emitNamedEntityData(this.treeIndex, valueLength, this.consumed + this.excess);
              }
              if (this.decodeMode !== DecodingMode.Strict) {
                this.result = this.treeIndex;
                this.consumed += this.excess;
                this.excess = 0;
              }
            }
          }
          return -1;
        };
        EntityDecoder2.prototype.emitNotTerminatedNamedEntity = function() {
          var _a;
          var _b = this, result = _b.result, decodeTree = _b.decodeTree;
          var valueLength = (decodeTree[result] & BinTrieFlags.VALUE_LENGTH) >> 14;
          this.emitNamedEntityData(result, valueLength, this.consumed);
          (_a = this.errors) === null || _a === void 0 ? void 0 : _a.missingSemicolonAfterCharacterReference();
          return this.consumed;
        };
        EntityDecoder2.prototype.emitNamedEntityData = function(result, valueLength, consumed) {
          var decodeTree = this.decodeTree;
          this.emitCodePoint(valueLength === 1 ? decodeTree[result] & ~BinTrieFlags.VALUE_LENGTH : decodeTree[result + 1], consumed);
          if (valueLength === 3) {
            this.emitCodePoint(decodeTree[result + 2], consumed);
          }
          return consumed;
        };
        EntityDecoder2.prototype.end = function() {
          var _a;
          switch (this.state) {
            case EntityDecoderState.NamedEntity: {
              return this.result !== 0 && (this.decodeMode !== DecodingMode.Attribute || this.result === this.treeIndex) ? this.emitNotTerminatedNamedEntity() : 0;
            }
            // Otherwise, emit a numeric entity if we have one.
            case EntityDecoderState.NumericDecimal: {
              return this.emitNumericEntity(0, 2);
            }
            case EntityDecoderState.NumericHex: {
              return this.emitNumericEntity(0, 3);
            }
            case EntityDecoderState.NumericStart: {
              (_a = this.errors) === null || _a === void 0 ? void 0 : _a.absenceOfDigitsInNumericCharacterReference(this.consumed);
              return 0;
            }
            case EntityDecoderState.EntityStart: {
              return 0;
            }
          }
        };
        return EntityDecoder2;
      })()
    );
    exports2.EntityDecoder = EntityDecoder;
    function getDecoder(decodeTree) {
      var ret = "";
      var decoder = new EntityDecoder(decodeTree, function(str) {
        return ret += (0, decode_codepoint_js_1.fromCodePoint)(str);
      });
      return function decodeWithTrie(str, decodeMode) {
        var lastIndex = 0;
        var offset = 0;
        while ((offset = str.indexOf("&", offset)) >= 0) {
          ret += str.slice(lastIndex, offset);
          decoder.startEntity(decodeMode);
          var len = decoder.write(
            str,
            // Skip the "&"
            offset + 1
          );
          if (len < 0) {
            lastIndex = offset + decoder.end();
            break;
          }
          lastIndex = offset + len;
          offset = len === 0 ? lastIndex + 1 : lastIndex;
        }
        var result = ret + str.slice(lastIndex);
        ret = "";
        return result;
      };
    }
    function determineBranch(decodeTree, current, nodeIdx, char) {
      var branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
      var jumpOffset = current & BinTrieFlags.JUMP_TABLE;
      if (branchCount === 0) {
        return jumpOffset !== 0 && char === jumpOffset ? nodeIdx : -1;
      }
      if (jumpOffset) {
        var value = char - jumpOffset;
        return value < 0 || value >= branchCount ? -1 : decodeTree[nodeIdx + value] - 1;
      }
      var lo = nodeIdx;
      var hi = lo + branchCount - 1;
      while (lo <= hi) {
        var mid = lo + hi >>> 1;
        var midVal = decodeTree[mid];
        if (midVal < char) {
          lo = mid + 1;
        } else if (midVal > char) {
          hi = mid - 1;
        } else {
          return decodeTree[mid + branchCount];
        }
      }
      return -1;
    }
    exports2.determineBranch = determineBranch;
    var htmlDecoder = getDecoder(decode_data_html_js_1.default);
    var xmlDecoder = getDecoder(decode_data_xml_js_1.default);
    function decodeHTML(str, mode) {
      if (mode === void 0) {
        mode = DecodingMode.Legacy;
      }
      return htmlDecoder(str, mode);
    }
    exports2.decodeHTML = decodeHTML;
    function decodeHTMLAttribute(str) {
      return htmlDecoder(str, DecodingMode.Attribute);
    }
    exports2.decodeHTMLAttribute = decodeHTMLAttribute;
    function decodeHTMLStrict(str) {
      return htmlDecoder(str, DecodingMode.Strict);
    }
    exports2.decodeHTMLStrict = decodeHTMLStrict;
    function decodeXML(str) {
      return xmlDecoder(str, DecodingMode.Strict);
    }
    exports2.decodeXML = decodeXML;
  }
});

// node_modules/dom-serializer/node_modules/entities/lib/generated/encode-html.js
var require_encode_html = __commonJS({
  "node_modules/dom-serializer/node_modules/entities/lib/generated/encode-html.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    function restoreDiff(arr) {
      for (var i = 1; i < arr.length; i++) {
        arr[i][0] += arr[i - 1][0] + 1;
      }
      return arr;
    }
    exports2.default = new Map(/* @__PURE__ */ restoreDiff([[9, "&Tab;"], [0, "&NewLine;"], [22, "&excl;"], [0, "&quot;"], [0, "&num;"], [0, "&dollar;"], [0, "&percnt;"], [0, "&amp;"], [0, "&apos;"], [0, "&lpar;"], [0, "&rpar;"], [0, "&ast;"], [0, "&plus;"], [0, "&comma;"], [1, "&period;"], [0, "&sol;"], [10, "&colon;"], [0, "&semi;"], [0, { v: "&lt;", n: 8402, o: "&nvlt;" }], [0, { v: "&equals;", n: 8421, o: "&bne;" }], [0, { v: "&gt;", n: 8402, o: "&nvgt;" }], [0, "&quest;"], [0, "&commat;"], [26, "&lbrack;"], [0, "&bsol;"], [0, "&rbrack;"], [0, "&Hat;"], [0, "&lowbar;"], [0, "&DiacriticalGrave;"], [5, { n: 106, o: "&fjlig;" }], [20, "&lbrace;"], [0, "&verbar;"], [0, "&rbrace;"], [34, "&nbsp;"], [0, "&iexcl;"], [0, "&cent;"], [0, "&pound;"], [0, "&curren;"], [0, "&yen;"], [0, "&brvbar;"], [0, "&sect;"], [0, "&die;"], [0, "&copy;"], [0, "&ordf;"], [0, "&laquo;"], [0, "&not;"], [0, "&shy;"], [0, "&circledR;"], [0, "&macr;"], [0, "&deg;"], [0, "&PlusMinus;"], [0, "&sup2;"], [0, "&sup3;"], [0, "&acute;"], [0, "&micro;"], [0, "&para;"], [0, "&centerdot;"], [0, "&cedil;"], [0, "&sup1;"], [0, "&ordm;"], [0, "&raquo;"], [0, "&frac14;"], [0, "&frac12;"], [0, "&frac34;"], [0, "&iquest;"], [0, "&Agrave;"], [0, "&Aacute;"], [0, "&Acirc;"], [0, "&Atilde;"], [0, "&Auml;"], [0, "&angst;"], [0, "&AElig;"], [0, "&Ccedil;"], [0, "&Egrave;"], [0, "&Eacute;"], [0, "&Ecirc;"], [0, "&Euml;"], [0, "&Igrave;"], [0, "&Iacute;"], [0, "&Icirc;"], [0, "&Iuml;"], [0, "&ETH;"], [0, "&Ntilde;"], [0, "&Ograve;"], [0, "&Oacute;"], [0, "&Ocirc;"], [0, "&Otilde;"], [0, "&Ouml;"], [0, "&times;"], [0, "&Oslash;"], [0, "&Ugrave;"], [0, "&Uacute;"], [0, "&Ucirc;"], [0, "&Uuml;"], [0, "&Yacute;"], [0, "&THORN;"], [0, "&szlig;"], [0, "&agrave;"], [0, "&aacute;"], [0, "&acirc;"], [0, "&atilde;"], [0, "&auml;"], [0, "&aring;"], [0, "&aelig;"], [0, "&ccedil;"], [0, "&egrave;"], [0, "&eacute;"], [0, "&ecirc;"], [0, "&euml;"], [0, "&igrave;"], [0, "&iacute;"], [0, "&icirc;"], [0, "&iuml;"], [0, "&eth;"], [0, "&ntilde;"], [0, "&ograve;"], [0, "&oacute;"], [0, "&ocirc;"], [0, "&otilde;"], [0, "&ouml;"], [0, "&div;"], [0, "&oslash;"], [0, "&ugrave;"], [0, "&uacute;"], [0, "&ucirc;"], [0, "&uuml;"], [0, "&yacute;"], [0, "&thorn;"], [0, "&yuml;"], [0, "&Amacr;"], [0, "&amacr;"], [0, "&Abreve;"], [0, "&abreve;"], [0, "&Aogon;"], [0, "&aogon;"], [0, "&Cacute;"], [0, "&cacute;"], [0, "&Ccirc;"], [0, "&ccirc;"], [0, "&Cdot;"], [0, "&cdot;"], [0, "&Ccaron;"], [0, "&ccaron;"], [0, "&Dcaron;"], [0, "&dcaron;"], [0, "&Dstrok;"], [0, "&dstrok;"], [0, "&Emacr;"], [0, "&emacr;"], [2, "&Edot;"], [0, "&edot;"], [0, "&Eogon;"], [0, "&eogon;"], [0, "&Ecaron;"], [0, "&ecaron;"], [0, "&Gcirc;"], [0, "&gcirc;"], [0, "&Gbreve;"], [0, "&gbreve;"], [0, "&Gdot;"], [0, "&gdot;"], [0, "&Gcedil;"], [1, "&Hcirc;"], [0, "&hcirc;"], [0, "&Hstrok;"], [0, "&hstrok;"], [0, "&Itilde;"], [0, "&itilde;"], [0, "&Imacr;"], [0, "&imacr;"], [2, "&Iogon;"], [0, "&iogon;"], [0, "&Idot;"], [0, "&imath;"], [0, "&IJlig;"], [0, "&ijlig;"], [0, "&Jcirc;"], [0, "&jcirc;"], [0, "&Kcedil;"], [0, "&kcedil;"], [0, "&kgreen;"], [0, "&Lacute;"], [0, "&lacute;"], [0, "&Lcedil;"], [0, "&lcedil;"], [0, "&Lcaron;"], [0, "&lcaron;"], [0, "&Lmidot;"], [0, "&lmidot;"], [0, "&Lstrok;"], [0, "&lstrok;"], [0, "&Nacute;"], [0, "&nacute;"], [0, "&Ncedil;"], [0, "&ncedil;"], [0, "&Ncaron;"], [0, "&ncaron;"], [0, "&napos;"], [0, "&ENG;"], [0, "&eng;"], [0, "&Omacr;"], [0, "&omacr;"], [2, "&Odblac;"], [0, "&odblac;"], [0, "&OElig;"], [0, "&oelig;"], [0, "&Racute;"], [0, "&racute;"], [0, "&Rcedil;"], [0, "&rcedil;"], [0, "&Rcaron;"], [0, "&rcaron;"], [0, "&Sacute;"], [0, "&sacute;"], [0, "&Scirc;"], [0, "&scirc;"], [0, "&Scedil;"], [0, "&scedil;"], [0, "&Scaron;"], [0, "&scaron;"], [0, "&Tcedil;"], [0, "&tcedil;"], [0, "&Tcaron;"], [0, "&tcaron;"], [0, "&Tstrok;"], [0, "&tstrok;"], [0, "&Utilde;"], [0, "&utilde;"], [0, "&Umacr;"], [0, "&umacr;"], [0, "&Ubreve;"], [0, "&ubreve;"], [0, "&Uring;"], [0, "&uring;"], [0, "&Udblac;"], [0, "&udblac;"], [0, "&Uogon;"], [0, "&uogon;"], [0, "&Wcirc;"], [0, "&wcirc;"], [0, "&Ycirc;"], [0, "&ycirc;"], [0, "&Yuml;"], [0, "&Zacute;"], [0, "&zacute;"], [0, "&Zdot;"], [0, "&zdot;"], [0, "&Zcaron;"], [0, "&zcaron;"], [19, "&fnof;"], [34, "&imped;"], [63, "&gacute;"], [65, "&jmath;"], [142, "&circ;"], [0, "&caron;"], [16, "&breve;"], [0, "&DiacriticalDot;"], [0, "&ring;"], [0, "&ogon;"], [0, "&DiacriticalTilde;"], [0, "&dblac;"], [51, "&DownBreve;"], [127, "&Alpha;"], [0, "&Beta;"], [0, "&Gamma;"], [0, "&Delta;"], [0, "&Epsilon;"], [0, "&Zeta;"], [0, "&Eta;"], [0, "&Theta;"], [0, "&Iota;"], [0, "&Kappa;"], [0, "&Lambda;"], [0, "&Mu;"], [0, "&Nu;"], [0, "&Xi;"], [0, "&Omicron;"], [0, "&Pi;"], [0, "&Rho;"], [1, "&Sigma;"], [0, "&Tau;"], [0, "&Upsilon;"], [0, "&Phi;"], [0, "&Chi;"], [0, "&Psi;"], [0, "&ohm;"], [7, "&alpha;"], [0, "&beta;"], [0, "&gamma;"], [0, "&delta;"], [0, "&epsi;"], [0, "&zeta;"], [0, "&eta;"], [0, "&theta;"], [0, "&iota;"], [0, "&kappa;"], [0, "&lambda;"], [0, "&mu;"], [0, "&nu;"], [0, "&xi;"], [0, "&omicron;"], [0, "&pi;"], [0, "&rho;"], [0, "&sigmaf;"], [0, "&sigma;"], [0, "&tau;"], [0, "&upsi;"], [0, "&phi;"], [0, "&chi;"], [0, "&psi;"], [0, "&omega;"], [7, "&thetasym;"], [0, "&Upsi;"], [2, "&phiv;"], [0, "&piv;"], [5, "&Gammad;"], [0, "&digamma;"], [18, "&kappav;"], [0, "&rhov;"], [3, "&epsiv;"], [0, "&backepsilon;"], [10, "&IOcy;"], [0, "&DJcy;"], [0, "&GJcy;"], [0, "&Jukcy;"], [0, "&DScy;"], [0, "&Iukcy;"], [0, "&YIcy;"], [0, "&Jsercy;"], [0, "&LJcy;"], [0, "&NJcy;"], [0, "&TSHcy;"], [0, "&KJcy;"], [1, "&Ubrcy;"], [0, "&DZcy;"], [0, "&Acy;"], [0, "&Bcy;"], [0, "&Vcy;"], [0, "&Gcy;"], [0, "&Dcy;"], [0, "&IEcy;"], [0, "&ZHcy;"], [0, "&Zcy;"], [0, "&Icy;"], [0, "&Jcy;"], [0, "&Kcy;"], [0, "&Lcy;"], [0, "&Mcy;"], [0, "&Ncy;"], [0, "&Ocy;"], [0, "&Pcy;"], [0, "&Rcy;"], [0, "&Scy;"], [0, "&Tcy;"], [0, "&Ucy;"], [0, "&Fcy;"], [0, "&KHcy;"], [0, "&TScy;"], [0, "&CHcy;"], [0, "&SHcy;"], [0, "&SHCHcy;"], [0, "&HARDcy;"], [0, "&Ycy;"], [0, "&SOFTcy;"], [0, "&Ecy;"], [0, "&YUcy;"], [0, "&YAcy;"], [0, "&acy;"], [0, "&bcy;"], [0, "&vcy;"], [0, "&gcy;"], [0, "&dcy;"], [0, "&iecy;"], [0, "&zhcy;"], [0, "&zcy;"], [0, "&icy;"], [0, "&jcy;"], [0, "&kcy;"], [0, "&lcy;"], [0, "&mcy;"], [0, "&ncy;"], [0, "&ocy;"], [0, "&pcy;"], [0, "&rcy;"], [0, "&scy;"], [0, "&tcy;"], [0, "&ucy;"], [0, "&fcy;"], [0, "&khcy;"], [0, "&tscy;"], [0, "&chcy;"], [0, "&shcy;"], [0, "&shchcy;"], [0, "&hardcy;"], [0, "&ycy;"], [0, "&softcy;"], [0, "&ecy;"], [0, "&yucy;"], [0, "&yacy;"], [1, "&iocy;"], [0, "&djcy;"], [0, "&gjcy;"], [0, "&jukcy;"], [0, "&dscy;"], [0, "&iukcy;"], [0, "&yicy;"], [0, "&jsercy;"], [0, "&ljcy;"], [0, "&njcy;"], [0, "&tshcy;"], [0, "&kjcy;"], [1, "&ubrcy;"], [0, "&dzcy;"], [7074, "&ensp;"], [0, "&emsp;"], [0, "&emsp13;"], [0, "&emsp14;"], [1, "&numsp;"], [0, "&puncsp;"], [0, "&ThinSpace;"], [0, "&hairsp;"], [0, "&NegativeMediumSpace;"], [0, "&zwnj;"], [0, "&zwj;"], [0, "&lrm;"], [0, "&rlm;"], [0, "&dash;"], [2, "&ndash;"], [0, "&mdash;"], [0, "&horbar;"], [0, "&Verbar;"], [1, "&lsquo;"], [0, "&CloseCurlyQuote;"], [0, "&lsquor;"], [1, "&ldquo;"], [0, "&CloseCurlyDoubleQuote;"], [0, "&bdquo;"], [1, "&dagger;"], [0, "&Dagger;"], [0, "&bull;"], [2, "&nldr;"], [0, "&hellip;"], [9, "&permil;"], [0, "&pertenk;"], [0, "&prime;"], [0, "&Prime;"], [0, "&tprime;"], [0, "&backprime;"], [3, "&lsaquo;"], [0, "&rsaquo;"], [3, "&oline;"], [2, "&caret;"], [1, "&hybull;"], [0, "&frasl;"], [10, "&bsemi;"], [7, "&qprime;"], [7, { v: "&MediumSpace;", n: 8202, o: "&ThickSpace;" }], [0, "&NoBreak;"], [0, "&af;"], [0, "&InvisibleTimes;"], [0, "&ic;"], [72, "&euro;"], [46, "&tdot;"], [0, "&DotDot;"], [37, "&complexes;"], [2, "&incare;"], [4, "&gscr;"], [0, "&hamilt;"], [0, "&Hfr;"], [0, "&Hopf;"], [0, "&planckh;"], [0, "&hbar;"], [0, "&imagline;"], [0, "&Ifr;"], [0, "&lagran;"], [0, "&ell;"], [1, "&naturals;"], [0, "&numero;"], [0, "&copysr;"], [0, "&weierp;"], [0, "&Popf;"], [0, "&Qopf;"], [0, "&realine;"], [0, "&real;"], [0, "&reals;"], [0, "&rx;"], [3, "&trade;"], [1, "&integers;"], [2, "&mho;"], [0, "&zeetrf;"], [0, "&iiota;"], [2, "&bernou;"], [0, "&Cayleys;"], [1, "&escr;"], [0, "&Escr;"], [0, "&Fouriertrf;"], [1, "&Mellintrf;"], [0, "&order;"], [0, "&alefsym;"], [0, "&beth;"], [0, "&gimel;"], [0, "&daleth;"], [12, "&CapitalDifferentialD;"], [0, "&dd;"], [0, "&ee;"], [0, "&ii;"], [10, "&frac13;"], [0, "&frac23;"], [0, "&frac15;"], [0, "&frac25;"], [0, "&frac35;"], [0, "&frac45;"], [0, "&frac16;"], [0, "&frac56;"], [0, "&frac18;"], [0, "&frac38;"], [0, "&frac58;"], [0, "&frac78;"], [49, "&larr;"], [0, "&ShortUpArrow;"], [0, "&rarr;"], [0, "&darr;"], [0, "&harr;"], [0, "&updownarrow;"], [0, "&nwarr;"], [0, "&nearr;"], [0, "&LowerRightArrow;"], [0, "&LowerLeftArrow;"], [0, "&nlarr;"], [0, "&nrarr;"], [1, { v: "&rarrw;", n: 824, o: "&nrarrw;" }], [0, "&Larr;"], [0, "&Uarr;"], [0, "&Rarr;"], [0, "&Darr;"], [0, "&larrtl;"], [0, "&rarrtl;"], [0, "&LeftTeeArrow;"], [0, "&mapstoup;"], [0, "&map;"], [0, "&DownTeeArrow;"], [1, "&hookleftarrow;"], [0, "&hookrightarrow;"], [0, "&larrlp;"], [0, "&looparrowright;"], [0, "&harrw;"], [0, "&nharr;"], [1, "&lsh;"], [0, "&rsh;"], [0, "&ldsh;"], [0, "&rdsh;"], [1, "&crarr;"], [0, "&cularr;"], [0, "&curarr;"], [2, "&circlearrowleft;"], [0, "&circlearrowright;"], [0, "&leftharpoonup;"], [0, "&DownLeftVector;"], [0, "&RightUpVector;"], [0, "&LeftUpVector;"], [0, "&rharu;"], [0, "&DownRightVector;"], [0, "&dharr;"], [0, "&dharl;"], [0, "&RightArrowLeftArrow;"], [0, "&udarr;"], [0, "&LeftArrowRightArrow;"], [0, "&leftleftarrows;"], [0, "&upuparrows;"], [0, "&rightrightarrows;"], [0, "&ddarr;"], [0, "&leftrightharpoons;"], [0, "&Equilibrium;"], [0, "&nlArr;"], [0, "&nhArr;"], [0, "&nrArr;"], [0, "&DoubleLeftArrow;"], [0, "&DoubleUpArrow;"], [0, "&DoubleRightArrow;"], [0, "&dArr;"], [0, "&DoubleLeftRightArrow;"], [0, "&DoubleUpDownArrow;"], [0, "&nwArr;"], [0, "&neArr;"], [0, "&seArr;"], [0, "&swArr;"], [0, "&lAarr;"], [0, "&rAarr;"], [1, "&zigrarr;"], [6, "&larrb;"], [0, "&rarrb;"], [15, "&DownArrowUpArrow;"], [7, "&loarr;"], [0, "&roarr;"], [0, "&hoarr;"], [0, "&forall;"], [0, "&comp;"], [0, { v: "&part;", n: 824, o: "&npart;" }], [0, "&exist;"], [0, "&nexist;"], [0, "&empty;"], [1, "&Del;"], [0, "&Element;"], [0, "&NotElement;"], [1, "&ni;"], [0, "&notni;"], [2, "&prod;"], [0, "&coprod;"], [0, "&sum;"], [0, "&minus;"], [0, "&MinusPlus;"], [0, "&dotplus;"], [1, "&Backslash;"], [0, "&lowast;"], [0, "&compfn;"], [1, "&radic;"], [2, "&prop;"], [0, "&infin;"], [0, "&angrt;"], [0, { v: "&ang;", n: 8402, o: "&nang;" }], [0, "&angmsd;"], [0, "&angsph;"], [0, "&mid;"], [0, "&nmid;"], [0, "&DoubleVerticalBar;"], [0, "&NotDoubleVerticalBar;"], [0, "&and;"], [0, "&or;"], [0, { v: "&cap;", n: 65024, o: "&caps;" }], [0, { v: "&cup;", n: 65024, o: "&cups;" }], [0, "&int;"], [0, "&Int;"], [0, "&iiint;"], [0, "&conint;"], [0, "&Conint;"], [0, "&Cconint;"], [0, "&cwint;"], [0, "&ClockwiseContourIntegral;"], [0, "&awconint;"], [0, "&there4;"], [0, "&becaus;"], [0, "&ratio;"], [0, "&Colon;"], [0, "&dotminus;"], [1, "&mDDot;"], [0, "&homtht;"], [0, { v: "&sim;", n: 8402, o: "&nvsim;" }], [0, { v: "&backsim;", n: 817, o: "&race;" }], [0, { v: "&ac;", n: 819, o: "&acE;" }], [0, "&acd;"], [0, "&VerticalTilde;"], [0, "&NotTilde;"], [0, { v: "&eqsim;", n: 824, o: "&nesim;" }], [0, "&sime;"], [0, "&NotTildeEqual;"], [0, "&cong;"], [0, "&simne;"], [0, "&ncong;"], [0, "&ap;"], [0, "&nap;"], [0, "&ape;"], [0, { v: "&apid;", n: 824, o: "&napid;" }], [0, "&backcong;"], [0, { v: "&asympeq;", n: 8402, o: "&nvap;" }], [0, { v: "&bump;", n: 824, o: "&nbump;" }], [0, { v: "&bumpe;", n: 824, o: "&nbumpe;" }], [0, { v: "&doteq;", n: 824, o: "&nedot;" }], [0, "&doteqdot;"], [0, "&efDot;"], [0, "&erDot;"], [0, "&Assign;"], [0, "&ecolon;"], [0, "&ecir;"], [0, "&circeq;"], [1, "&wedgeq;"], [0, "&veeeq;"], [1, "&triangleq;"], [2, "&equest;"], [0, "&ne;"], [0, { v: "&Congruent;", n: 8421, o: "&bnequiv;" }], [0, "&nequiv;"], [1, { v: "&le;", n: 8402, o: "&nvle;" }], [0, { v: "&ge;", n: 8402, o: "&nvge;" }], [0, { v: "&lE;", n: 824, o: "&nlE;" }], [0, { v: "&gE;", n: 824, o: "&ngE;" }], [0, { v: "&lnE;", n: 65024, o: "&lvertneqq;" }], [0, { v: "&gnE;", n: 65024, o: "&gvertneqq;" }], [0, { v: "&ll;", n: new Map(/* @__PURE__ */ restoreDiff([[824, "&nLtv;"], [7577, "&nLt;"]])) }], [0, { v: "&gg;", n: new Map(/* @__PURE__ */ restoreDiff([[824, "&nGtv;"], [7577, "&nGt;"]])) }], [0, "&between;"], [0, "&NotCupCap;"], [0, "&nless;"], [0, "&ngt;"], [0, "&nle;"], [0, "&nge;"], [0, "&lesssim;"], [0, "&GreaterTilde;"], [0, "&nlsim;"], [0, "&ngsim;"], [0, "&LessGreater;"], [0, "&gl;"], [0, "&NotLessGreater;"], [0, "&NotGreaterLess;"], [0, "&pr;"], [0, "&sc;"], [0, "&prcue;"], [0, "&sccue;"], [0, "&PrecedesTilde;"], [0, { v: "&scsim;", n: 824, o: "&NotSucceedsTilde;" }], [0, "&NotPrecedes;"], [0, "&NotSucceeds;"], [0, { v: "&sub;", n: 8402, o: "&NotSubset;" }], [0, { v: "&sup;", n: 8402, o: "&NotSuperset;" }], [0, "&nsub;"], [0, "&nsup;"], [0, "&sube;"], [0, "&supe;"], [0, "&NotSubsetEqual;"], [0, "&NotSupersetEqual;"], [0, { v: "&subne;", n: 65024, o: "&varsubsetneq;" }], [0, { v: "&supne;", n: 65024, o: "&varsupsetneq;" }], [1, "&cupdot;"], [0, "&UnionPlus;"], [0, { v: "&sqsub;", n: 824, o: "&NotSquareSubset;" }], [0, { v: "&sqsup;", n: 824, o: "&NotSquareSuperset;" }], [0, "&sqsube;"], [0, "&sqsupe;"], [0, { v: "&sqcap;", n: 65024, o: "&sqcaps;" }], [0, { v: "&sqcup;", n: 65024, o: "&sqcups;" }], [0, "&CirclePlus;"], [0, "&CircleMinus;"], [0, "&CircleTimes;"], [0, "&osol;"], [0, "&CircleDot;"], [0, "&circledcirc;"], [0, "&circledast;"], [1, "&circleddash;"], [0, "&boxplus;"], [0, "&boxminus;"], [0, "&boxtimes;"], [0, "&dotsquare;"], [0, "&RightTee;"], [0, "&dashv;"], [0, "&DownTee;"], [0, "&bot;"], [1, "&models;"], [0, "&DoubleRightTee;"], [0, "&Vdash;"], [0, "&Vvdash;"], [0, "&VDash;"], [0, "&nvdash;"], [0, "&nvDash;"], [0, "&nVdash;"], [0, "&nVDash;"], [0, "&prurel;"], [1, "&LeftTriangle;"], [0, "&RightTriangle;"], [0, { v: "&LeftTriangleEqual;", n: 8402, o: "&nvltrie;" }], [0, { v: "&RightTriangleEqual;", n: 8402, o: "&nvrtrie;" }], [0, "&origof;"], [0, "&imof;"], [0, "&multimap;"], [0, "&hercon;"], [0, "&intcal;"], [0, "&veebar;"], [1, "&barvee;"], [0, "&angrtvb;"], [0, "&lrtri;"], [0, "&bigwedge;"], [0, "&bigvee;"], [0, "&bigcap;"], [0, "&bigcup;"], [0, "&diam;"], [0, "&sdot;"], [0, "&sstarf;"], [0, "&divideontimes;"], [0, "&bowtie;"], [0, "&ltimes;"], [0, "&rtimes;"], [0, "&leftthreetimes;"], [0, "&rightthreetimes;"], [0, "&backsimeq;"], [0, "&curlyvee;"], [0, "&curlywedge;"], [0, "&Sub;"], [0, "&Sup;"], [0, "&Cap;"], [0, "&Cup;"], [0, "&fork;"], [0, "&epar;"], [0, "&lessdot;"], [0, "&gtdot;"], [0, { v: "&Ll;", n: 824, o: "&nLl;" }], [0, { v: "&Gg;", n: 824, o: "&nGg;" }], [0, { v: "&leg;", n: 65024, o: "&lesg;" }], [0, { v: "&gel;", n: 65024, o: "&gesl;" }], [2, "&cuepr;"], [0, "&cuesc;"], [0, "&NotPrecedesSlantEqual;"], [0, "&NotSucceedsSlantEqual;"], [0, "&NotSquareSubsetEqual;"], [0, "&NotSquareSupersetEqual;"], [2, "&lnsim;"], [0, "&gnsim;"], [0, "&precnsim;"], [0, "&scnsim;"], [0, "&nltri;"], [0, "&NotRightTriangle;"], [0, "&nltrie;"], [0, "&NotRightTriangleEqual;"], [0, "&vellip;"], [0, "&ctdot;"], [0, "&utdot;"], [0, "&dtdot;"], [0, "&disin;"], [0, "&isinsv;"], [0, "&isins;"], [0, { v: "&isindot;", n: 824, o: "&notindot;" }], [0, "&notinvc;"], [0, "&notinvb;"], [1, { v: "&isinE;", n: 824, o: "&notinE;" }], [0, "&nisd;"], [0, "&xnis;"], [0, "&nis;"], [0, "&notnivc;"], [0, "&notnivb;"], [6, "&barwed;"], [0, "&Barwed;"], [1, "&lceil;"], [0, "&rceil;"], [0, "&LeftFloor;"], [0, "&rfloor;"], [0, "&drcrop;"], [0, "&dlcrop;"], [0, "&urcrop;"], [0, "&ulcrop;"], [0, "&bnot;"], [1, "&profline;"], [0, "&profsurf;"], [1, "&telrec;"], [0, "&target;"], [5, "&ulcorn;"], [0, "&urcorn;"], [0, "&dlcorn;"], [0, "&drcorn;"], [2, "&frown;"], [0, "&smile;"], [9, "&cylcty;"], [0, "&profalar;"], [7, "&topbot;"], [6, "&ovbar;"], [1, "&solbar;"], [60, "&angzarr;"], [51, "&lmoustache;"], [0, "&rmoustache;"], [2, "&OverBracket;"], [0, "&bbrk;"], [0, "&bbrktbrk;"], [37, "&OverParenthesis;"], [0, "&UnderParenthesis;"], [0, "&OverBrace;"], [0, "&UnderBrace;"], [2, "&trpezium;"], [4, "&elinters;"], [59, "&blank;"], [164, "&circledS;"], [55, "&boxh;"], [1, "&boxv;"], [9, "&boxdr;"], [3, "&boxdl;"], [3, "&boxur;"], [3, "&boxul;"], [3, "&boxvr;"], [7, "&boxvl;"], [7, "&boxhd;"], [7, "&boxhu;"], [7, "&boxvh;"], [19, "&boxH;"], [0, "&boxV;"], [0, "&boxdR;"], [0, "&boxDr;"], [0, "&boxDR;"], [0, "&boxdL;"], [0, "&boxDl;"], [0, "&boxDL;"], [0, "&boxuR;"], [0, "&boxUr;"], [0, "&boxUR;"], [0, "&boxuL;"], [0, "&boxUl;"], [0, "&boxUL;"], [0, "&boxvR;"], [0, "&boxVr;"], [0, "&boxVR;"], [0, "&boxvL;"], [0, "&boxVl;"], [0, "&boxVL;"], [0, "&boxHd;"], [0, "&boxhD;"], [0, "&boxHD;"], [0, "&boxHu;"], [0, "&boxhU;"], [0, "&boxHU;"], [0, "&boxvH;"], [0, "&boxVh;"], [0, "&boxVH;"], [19, "&uhblk;"], [3, "&lhblk;"], [3, "&block;"], [8, "&blk14;"], [0, "&blk12;"], [0, "&blk34;"], [13, "&square;"], [8, "&blacksquare;"], [0, "&EmptyVerySmallSquare;"], [1, "&rect;"], [0, "&marker;"], [2, "&fltns;"], [1, "&bigtriangleup;"], [0, "&blacktriangle;"], [0, "&triangle;"], [2, "&blacktriangleright;"], [0, "&rtri;"], [3, "&bigtriangledown;"], [0, "&blacktriangledown;"], [0, "&dtri;"], [2, "&blacktriangleleft;"], [0, "&ltri;"], [6, "&loz;"], [0, "&cir;"], [32, "&tridot;"], [2, "&bigcirc;"], [8, "&ultri;"], [0, "&urtri;"], [0, "&lltri;"], [0, "&EmptySmallSquare;"], [0, "&FilledSmallSquare;"], [8, "&bigstar;"], [0, "&star;"], [7, "&phone;"], [49, "&female;"], [1, "&male;"], [29, "&spades;"], [2, "&clubs;"], [1, "&hearts;"], [0, "&diamondsuit;"], [3, "&sung;"], [2, "&flat;"], [0, "&natural;"], [0, "&sharp;"], [163, "&check;"], [3, "&cross;"], [8, "&malt;"], [21, "&sext;"], [33, "&VerticalSeparator;"], [25, "&lbbrk;"], [0, "&rbbrk;"], [84, "&bsolhsub;"], [0, "&suphsol;"], [28, "&LeftDoubleBracket;"], [0, "&RightDoubleBracket;"], [0, "&lang;"], [0, "&rang;"], [0, "&Lang;"], [0, "&Rang;"], [0, "&loang;"], [0, "&roang;"], [7, "&longleftarrow;"], [0, "&longrightarrow;"], [0, "&longleftrightarrow;"], [0, "&DoubleLongLeftArrow;"], [0, "&DoubleLongRightArrow;"], [0, "&DoubleLongLeftRightArrow;"], [1, "&longmapsto;"], [2, "&dzigrarr;"], [258, "&nvlArr;"], [0, "&nvrArr;"], [0, "&nvHarr;"], [0, "&Map;"], [6, "&lbarr;"], [0, "&bkarow;"], [0, "&lBarr;"], [0, "&dbkarow;"], [0, "&drbkarow;"], [0, "&DDotrahd;"], [0, "&UpArrowBar;"], [0, "&DownArrowBar;"], [2, "&Rarrtl;"], [2, "&latail;"], [0, "&ratail;"], [0, "&lAtail;"], [0, "&rAtail;"], [0, "&larrfs;"], [0, "&rarrfs;"], [0, "&larrbfs;"], [0, "&rarrbfs;"], [2, "&nwarhk;"], [0, "&nearhk;"], [0, "&hksearow;"], [0, "&hkswarow;"], [0, "&nwnear;"], [0, "&nesear;"], [0, "&seswar;"], [0, "&swnwar;"], [8, { v: "&rarrc;", n: 824, o: "&nrarrc;" }], [1, "&cudarrr;"], [0, "&ldca;"], [0, "&rdca;"], [0, "&cudarrl;"], [0, "&larrpl;"], [2, "&curarrm;"], [0, "&cularrp;"], [7, "&rarrpl;"], [2, "&harrcir;"], [0, "&Uarrocir;"], [0, "&lurdshar;"], [0, "&ldrushar;"], [2, "&LeftRightVector;"], [0, "&RightUpDownVector;"], [0, "&DownLeftRightVector;"], [0, "&LeftUpDownVector;"], [0, "&LeftVectorBar;"], [0, "&RightVectorBar;"], [0, "&RightUpVectorBar;"], [0, "&RightDownVectorBar;"], [0, "&DownLeftVectorBar;"], [0, "&DownRightVectorBar;"], [0, "&LeftUpVectorBar;"], [0, "&LeftDownVectorBar;"], [0, "&LeftTeeVector;"], [0, "&RightTeeVector;"], [0, "&RightUpTeeVector;"], [0, "&RightDownTeeVector;"], [0, "&DownLeftTeeVector;"], [0, "&DownRightTeeVector;"], [0, "&LeftUpTeeVector;"], [0, "&LeftDownTeeVector;"], [0, "&lHar;"], [0, "&uHar;"], [0, "&rHar;"], [0, "&dHar;"], [0, "&luruhar;"], [0, "&ldrdhar;"], [0, "&ruluhar;"], [0, "&rdldhar;"], [0, "&lharul;"], [0, "&llhard;"], [0, "&rharul;"], [0, "&lrhard;"], [0, "&udhar;"], [0, "&duhar;"], [0, "&RoundImplies;"], [0, "&erarr;"], [0, "&simrarr;"], [0, "&larrsim;"], [0, "&rarrsim;"], [0, "&rarrap;"], [0, "&ltlarr;"], [1, "&gtrarr;"], [0, "&subrarr;"], [1, "&suplarr;"], [0, "&lfisht;"], [0, "&rfisht;"], [0, "&ufisht;"], [0, "&dfisht;"], [5, "&lopar;"], [0, "&ropar;"], [4, "&lbrke;"], [0, "&rbrke;"], [0, "&lbrkslu;"], [0, "&rbrksld;"], [0, "&lbrksld;"], [0, "&rbrkslu;"], [0, "&langd;"], [0, "&rangd;"], [0, "&lparlt;"], [0, "&rpargt;"], [0, "&gtlPar;"], [0, "&ltrPar;"], [3, "&vzigzag;"], [1, "&vangrt;"], [0, "&angrtvbd;"], [6, "&ange;"], [0, "&range;"], [0, "&dwangle;"], [0, "&uwangle;"], [0, "&angmsdaa;"], [0, "&angmsdab;"], [0, "&angmsdac;"], [0, "&angmsdad;"], [0, "&angmsdae;"], [0, "&angmsdaf;"], [0, "&angmsdag;"], [0, "&angmsdah;"], [0, "&bemptyv;"], [0, "&demptyv;"], [0, "&cemptyv;"], [0, "&raemptyv;"], [0, "&laemptyv;"], [0, "&ohbar;"], [0, "&omid;"], [0, "&opar;"], [1, "&operp;"], [1, "&olcross;"], [0, "&odsold;"], [1, "&olcir;"], [0, "&ofcir;"], [0, "&olt;"], [0, "&ogt;"], [0, "&cirscir;"], [0, "&cirE;"], [0, "&solb;"], [0, "&bsolb;"], [3, "&boxbox;"], [3, "&trisb;"], [0, "&rtriltri;"], [0, { v: "&LeftTriangleBar;", n: 824, o: "&NotLeftTriangleBar;" }], [0, { v: "&RightTriangleBar;", n: 824, o: "&NotRightTriangleBar;" }], [11, "&iinfin;"], [0, "&infintie;"], [0, "&nvinfin;"], [4, "&eparsl;"], [0, "&smeparsl;"], [0, "&eqvparsl;"], [5, "&blacklozenge;"], [8, "&RuleDelayed;"], [1, "&dsol;"], [9, "&bigodot;"], [0, "&bigoplus;"], [0, "&bigotimes;"], [1, "&biguplus;"], [1, "&bigsqcup;"], [5, "&iiiint;"], [0, "&fpartint;"], [2, "&cirfnint;"], [0, "&awint;"], [0, "&rppolint;"], [0, "&scpolint;"], [0, "&npolint;"], [0, "&pointint;"], [0, "&quatint;"], [0, "&intlarhk;"], [10, "&pluscir;"], [0, "&plusacir;"], [0, "&simplus;"], [0, "&plusdu;"], [0, "&plussim;"], [0, "&plustwo;"], [1, "&mcomma;"], [0, "&minusdu;"], [2, "&loplus;"], [0, "&roplus;"], [0, "&Cross;"], [0, "&timesd;"], [0, "&timesbar;"], [1, "&smashp;"], [0, "&lotimes;"], [0, "&rotimes;"], [0, "&otimesas;"], [0, "&Otimes;"], [0, "&odiv;"], [0, "&triplus;"], [0, "&triminus;"], [0, "&tritime;"], [0, "&intprod;"], [2, "&amalg;"], [0, "&capdot;"], [1, "&ncup;"], [0, "&ncap;"], [0, "&capand;"], [0, "&cupor;"], [0, "&cupcap;"], [0, "&capcup;"], [0, "&cupbrcap;"], [0, "&capbrcup;"], [0, "&cupcup;"], [0, "&capcap;"], [0, "&ccups;"], [0, "&ccaps;"], [2, "&ccupssm;"], [2, "&And;"], [0, "&Or;"], [0, "&andand;"], [0, "&oror;"], [0, "&orslope;"], [0, "&andslope;"], [1, "&andv;"], [0, "&orv;"], [0, "&andd;"], [0, "&ord;"], [1, "&wedbar;"], [6, "&sdote;"], [3, "&simdot;"], [2, { v: "&congdot;", n: 824, o: "&ncongdot;" }], [0, "&easter;"], [0, "&apacir;"], [0, { v: "&apE;", n: 824, o: "&napE;" }], [0, "&eplus;"], [0, "&pluse;"], [0, "&Esim;"], [0, "&Colone;"], [0, "&Equal;"], [1, "&ddotseq;"], [0, "&equivDD;"], [0, "&ltcir;"], [0, "&gtcir;"], [0, "&ltquest;"], [0, "&gtquest;"], [0, { v: "&leqslant;", n: 824, o: "&nleqslant;" }], [0, { v: "&geqslant;", n: 824, o: "&ngeqslant;" }], [0, "&lesdot;"], [0, "&gesdot;"], [0, "&lesdoto;"], [0, "&gesdoto;"], [0, "&lesdotor;"], [0, "&gesdotol;"], [0, "&lap;"], [0, "&gap;"], [0, "&lne;"], [0, "&gne;"], [0, "&lnap;"], [0, "&gnap;"], [0, "&lEg;"], [0, "&gEl;"], [0, "&lsime;"], [0, "&gsime;"], [0, "&lsimg;"], [0, "&gsiml;"], [0, "&lgE;"], [0, "&glE;"], [0, "&lesges;"], [0, "&gesles;"], [0, "&els;"], [0, "&egs;"], [0, "&elsdot;"], [0, "&egsdot;"], [0, "&el;"], [0, "&eg;"], [2, "&siml;"], [0, "&simg;"], [0, "&simlE;"], [0, "&simgE;"], [0, { v: "&LessLess;", n: 824, o: "&NotNestedLessLess;" }], [0, { v: "&GreaterGreater;", n: 824, o: "&NotNestedGreaterGreater;" }], [1, "&glj;"], [0, "&gla;"], [0, "&ltcc;"], [0, "&gtcc;"], [0, "&lescc;"], [0, "&gescc;"], [0, "&smt;"], [0, "&lat;"], [0, { v: "&smte;", n: 65024, o: "&smtes;" }], [0, { v: "&late;", n: 65024, o: "&lates;" }], [0, "&bumpE;"], [0, { v: "&PrecedesEqual;", n: 824, o: "&NotPrecedesEqual;" }], [0, { v: "&sce;", n: 824, o: "&NotSucceedsEqual;" }], [2, "&prE;"], [0, "&scE;"], [0, "&precneqq;"], [0, "&scnE;"], [0, "&prap;"], [0, "&scap;"], [0, "&precnapprox;"], [0, "&scnap;"], [0, "&Pr;"], [0, "&Sc;"], [0, "&subdot;"], [0, "&supdot;"], [0, "&subplus;"], [0, "&supplus;"], [0, "&submult;"], [0, "&supmult;"], [0, "&subedot;"], [0, "&supedot;"], [0, { v: "&subE;", n: 824, o: "&nsubE;" }], [0, { v: "&supE;", n: 824, o: "&nsupE;" }], [0, "&subsim;"], [0, "&supsim;"], [2, { v: "&subnE;", n: 65024, o: "&varsubsetneqq;" }], [0, { v: "&supnE;", n: 65024, o: "&varsupsetneqq;" }], [2, "&csub;"], [0, "&csup;"], [0, "&csube;"], [0, "&csupe;"], [0, "&subsup;"], [0, "&supsub;"], [0, "&subsub;"], [0, "&supsup;"], [0, "&suphsub;"], [0, "&supdsub;"], [0, "&forkv;"], [0, "&topfork;"], [0, "&mlcp;"], [8, "&Dashv;"], [1, "&Vdashl;"], [0, "&Barv;"], [0, "&vBar;"], [0, "&vBarv;"], [1, "&Vbar;"], [0, "&Not;"], [0, "&bNot;"], [0, "&rnmid;"], [0, "&cirmid;"], [0, "&midcir;"], [0, "&topcir;"], [0, "&nhpar;"], [0, "&parsim;"], [9, { v: "&parsl;", n: 8421, o: "&nparsl;" }], [44343, { n: new Map(/* @__PURE__ */ restoreDiff([[56476, "&Ascr;"], [1, "&Cscr;"], [0, "&Dscr;"], [2, "&Gscr;"], [2, "&Jscr;"], [0, "&Kscr;"], [2, "&Nscr;"], [0, "&Oscr;"], [0, "&Pscr;"], [0, "&Qscr;"], [1, "&Sscr;"], [0, "&Tscr;"], [0, "&Uscr;"], [0, "&Vscr;"], [0, "&Wscr;"], [0, "&Xscr;"], [0, "&Yscr;"], [0, "&Zscr;"], [0, "&ascr;"], [0, "&bscr;"], [0, "&cscr;"], [0, "&dscr;"], [1, "&fscr;"], [1, "&hscr;"], [0, "&iscr;"], [0, "&jscr;"], [0, "&kscr;"], [0, "&lscr;"], [0, "&mscr;"], [0, "&nscr;"], [1, "&pscr;"], [0, "&qscr;"], [0, "&rscr;"], [0, "&sscr;"], [0, "&tscr;"], [0, "&uscr;"], [0, "&vscr;"], [0, "&wscr;"], [0, "&xscr;"], [0, "&yscr;"], [0, "&zscr;"], [52, "&Afr;"], [0, "&Bfr;"], [1, "&Dfr;"], [0, "&Efr;"], [0, "&Ffr;"], [0, "&Gfr;"], [2, "&Jfr;"], [0, "&Kfr;"], [0, "&Lfr;"], [0, "&Mfr;"], [0, "&Nfr;"], [0, "&Ofr;"], [0, "&Pfr;"], [0, "&Qfr;"], [1, "&Sfr;"], [0, "&Tfr;"], [0, "&Ufr;"], [0, "&Vfr;"], [0, "&Wfr;"], [0, "&Xfr;"], [0, "&Yfr;"], [1, "&afr;"], [0, "&bfr;"], [0, "&cfr;"], [0, "&dfr;"], [0, "&efr;"], [0, "&ffr;"], [0, "&gfr;"], [0, "&hfr;"], [0, "&ifr;"], [0, "&jfr;"], [0, "&kfr;"], [0, "&lfr;"], [0, "&mfr;"], [0, "&nfr;"], [0, "&ofr;"], [0, "&pfr;"], [0, "&qfr;"], [0, "&rfr;"], [0, "&sfr;"], [0, "&tfr;"], [0, "&ufr;"], [0, "&vfr;"], [0, "&wfr;"], [0, "&xfr;"], [0, "&yfr;"], [0, "&zfr;"], [0, "&Aopf;"], [0, "&Bopf;"], [1, "&Dopf;"], [0, "&Eopf;"], [0, "&Fopf;"], [0, "&Gopf;"], [1, "&Iopf;"], [0, "&Jopf;"], [0, "&Kopf;"], [0, "&Lopf;"], [0, "&Mopf;"], [1, "&Oopf;"], [3, "&Sopf;"], [0, "&Topf;"], [0, "&Uopf;"], [0, "&Vopf;"], [0, "&Wopf;"], [0, "&Xopf;"], [0, "&Yopf;"], [1, "&aopf;"], [0, "&bopf;"], [0, "&copf;"], [0, "&dopf;"], [0, "&eopf;"], [0, "&fopf;"], [0, "&gopf;"], [0, "&hopf;"], [0, "&iopf;"], [0, "&jopf;"], [0, "&kopf;"], [0, "&lopf;"], [0, "&mopf;"], [0, "&nopf;"], [0, "&oopf;"], [0, "&popf;"], [0, "&qopf;"], [0, "&ropf;"], [0, "&sopf;"], [0, "&topf;"], [0, "&uopf;"], [0, "&vopf;"], [0, "&wopf;"], [0, "&xopf;"], [0, "&yopf;"], [0, "&zopf;"]])) }], [8906, "&fflig;"], [0, "&filig;"], [0, "&fllig;"], [0, "&ffilig;"], [0, "&ffllig;"]]));
  }
});

// node_modules/dom-serializer/node_modules/entities/lib/escape.js
var require_escape = __commonJS({
  "node_modules/dom-serializer/node_modules/entities/lib/escape.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.escapeText = exports2.escapeAttribute = exports2.escapeUTF8 = exports2.escape = exports2.encodeXML = exports2.getCodePoint = exports2.xmlReplacer = void 0;
    exports2.xmlReplacer = /["&'<>$\x80-\uFFFF]/g;
    var xmlCodeMap = /* @__PURE__ */ new Map([
      [34, "&quot;"],
      [38, "&amp;"],
      [39, "&apos;"],
      [60, "&lt;"],
      [62, "&gt;"]
    ]);
    exports2.getCodePoint = // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    String.prototype.codePointAt != null ? function(str, index) {
      return str.codePointAt(index);
    } : (
      // http://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
      function(c, index) {
        return (c.charCodeAt(index) & 64512) === 55296 ? (c.charCodeAt(index) - 55296) * 1024 + c.charCodeAt(index + 1) - 56320 + 65536 : c.charCodeAt(index);
      }
    );
    function encodeXML(str) {
      var ret = "";
      var lastIdx = 0;
      var match;
      while ((match = exports2.xmlReplacer.exec(str)) !== null) {
        var i = match.index;
        var char = str.charCodeAt(i);
        var next = xmlCodeMap.get(char);
        if (next !== void 0) {
          ret += str.substring(lastIdx, i) + next;
          lastIdx = i + 1;
        } else {
          ret += "".concat(str.substring(lastIdx, i), "&#x").concat((0, exports2.getCodePoint)(str, i).toString(16), ";");
          lastIdx = exports2.xmlReplacer.lastIndex += Number((char & 64512) === 55296);
        }
      }
      return ret + str.substr(lastIdx);
    }
    exports2.encodeXML = encodeXML;
    exports2.escape = encodeXML;
    function getEscaper(regex, map) {
      return function escape(data) {
        var match;
        var lastIdx = 0;
        var result = "";
        while (match = regex.exec(data)) {
          if (lastIdx !== match.index) {
            result += data.substring(lastIdx, match.index);
          }
          result += map.get(match[0].charCodeAt(0));
          lastIdx = match.index + 1;
        }
        return result + data.substring(lastIdx);
      };
    }
    exports2.escapeUTF8 = getEscaper(/[&<>'"]/g, xmlCodeMap);
    exports2.escapeAttribute = getEscaper(/["&\u00A0]/g, /* @__PURE__ */ new Map([
      [34, "&quot;"],
      [38, "&amp;"],
      [160, "&nbsp;"]
    ]));
    exports2.escapeText = getEscaper(/[&<>\u00A0]/g, /* @__PURE__ */ new Map([
      [38, "&amp;"],
      [60, "&lt;"],
      [62, "&gt;"],
      [160, "&nbsp;"]
    ]));
  }
});

// node_modules/dom-serializer/node_modules/entities/lib/encode.js
var require_encode = __commonJS({
  "node_modules/dom-serializer/node_modules/entities/lib/encode.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.encodeNonAsciiHTML = exports2.encodeHTML = void 0;
    var encode_html_js_1 = __importDefault(require_encode_html());
    var escape_js_1 = require_escape();
    var htmlReplacer = /[\t\n!-,./:-@[-`\f{-}$\x80-\uFFFF]/g;
    function encodeHTML(data) {
      return encodeHTMLTrieRe(htmlReplacer, data);
    }
    exports2.encodeHTML = encodeHTML;
    function encodeNonAsciiHTML(data) {
      return encodeHTMLTrieRe(escape_js_1.xmlReplacer, data);
    }
    exports2.encodeNonAsciiHTML = encodeNonAsciiHTML;
    function encodeHTMLTrieRe(regExp, str) {
      var ret = "";
      var lastIdx = 0;
      var match;
      while ((match = regExp.exec(str)) !== null) {
        var i = match.index;
        ret += str.substring(lastIdx, i);
        var char = str.charCodeAt(i);
        var next = encode_html_js_1.default.get(char);
        if (typeof next === "object") {
          if (i + 1 < str.length) {
            var nextChar = str.charCodeAt(i + 1);
            var value = typeof next.n === "number" ? next.n === nextChar ? next.o : void 0 : next.n.get(nextChar);
            if (value !== void 0) {
              ret += value;
              lastIdx = regExp.lastIndex += 1;
              continue;
            }
          }
          next = next.v;
        }
        if (next !== void 0) {
          ret += next;
          lastIdx = i + 1;
        } else {
          var cp = (0, escape_js_1.getCodePoint)(str, i);
          ret += "&#x".concat(cp.toString(16), ";");
          lastIdx = regExp.lastIndex += Number(cp !== char);
        }
      }
      return ret + str.substr(lastIdx);
    }
  }
});

// node_modules/dom-serializer/node_modules/entities/lib/index.js
var require_lib3 = __commonJS({
  "node_modules/dom-serializer/node_modules/entities/lib/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.decodeXMLStrict = exports2.decodeHTML5Strict = exports2.decodeHTML4Strict = exports2.decodeHTML5 = exports2.decodeHTML4 = exports2.decodeHTMLAttribute = exports2.decodeHTMLStrict = exports2.decodeHTML = exports2.decodeXML = exports2.DecodingMode = exports2.EntityDecoder = exports2.encodeHTML5 = exports2.encodeHTML4 = exports2.encodeNonAsciiHTML = exports2.encodeHTML = exports2.escapeText = exports2.escapeAttribute = exports2.escapeUTF8 = exports2.escape = exports2.encodeXML = exports2.encode = exports2.decodeStrict = exports2.decode = exports2.EncodingMode = exports2.EntityLevel = void 0;
    var decode_js_1 = require_decode2();
    var encode_js_1 = require_encode();
    var escape_js_1 = require_escape();
    var EntityLevel;
    (function(EntityLevel2) {
      EntityLevel2[EntityLevel2["XML"] = 0] = "XML";
      EntityLevel2[EntityLevel2["HTML"] = 1] = "HTML";
    })(EntityLevel = exports2.EntityLevel || (exports2.EntityLevel = {}));
    var EncodingMode;
    (function(EncodingMode2) {
      EncodingMode2[EncodingMode2["UTF8"] = 0] = "UTF8";
      EncodingMode2[EncodingMode2["ASCII"] = 1] = "ASCII";
      EncodingMode2[EncodingMode2["Extensive"] = 2] = "Extensive";
      EncodingMode2[EncodingMode2["Attribute"] = 3] = "Attribute";
      EncodingMode2[EncodingMode2["Text"] = 4] = "Text";
    })(EncodingMode = exports2.EncodingMode || (exports2.EncodingMode = {}));
    function decode(data, options) {
      if (options === void 0) {
        options = EntityLevel.XML;
      }
      var level = typeof options === "number" ? options : options.level;
      if (level === EntityLevel.HTML) {
        var mode = typeof options === "object" ? options.mode : void 0;
        return (0, decode_js_1.decodeHTML)(data, mode);
      }
      return (0, decode_js_1.decodeXML)(data);
    }
    exports2.decode = decode;
    function decodeStrict(data, options) {
      var _a;
      if (options === void 0) {
        options = EntityLevel.XML;
      }
      var opts = typeof options === "number" ? { level: options } : options;
      (_a = opts.mode) !== null && _a !== void 0 ? _a : opts.mode = decode_js_1.DecodingMode.Strict;
      return decode(data, opts);
    }
    exports2.decodeStrict = decodeStrict;
    function encode(data, options) {
      if (options === void 0) {
        options = EntityLevel.XML;
      }
      var opts = typeof options === "number" ? { level: options } : options;
      if (opts.mode === EncodingMode.UTF8)
        return (0, escape_js_1.escapeUTF8)(data);
      if (opts.mode === EncodingMode.Attribute)
        return (0, escape_js_1.escapeAttribute)(data);
      if (opts.mode === EncodingMode.Text)
        return (0, escape_js_1.escapeText)(data);
      if (opts.level === EntityLevel.HTML) {
        if (opts.mode === EncodingMode.ASCII) {
          return (0, encode_js_1.encodeNonAsciiHTML)(data);
        }
        return (0, encode_js_1.encodeHTML)(data);
      }
      return (0, escape_js_1.encodeXML)(data);
    }
    exports2.encode = encode;
    var escape_js_2 = require_escape();
    Object.defineProperty(exports2, "encodeXML", { enumerable: true, get: function() {
      return escape_js_2.encodeXML;
    } });
    Object.defineProperty(exports2, "escape", { enumerable: true, get: function() {
      return escape_js_2.escape;
    } });
    Object.defineProperty(exports2, "escapeUTF8", { enumerable: true, get: function() {
      return escape_js_2.escapeUTF8;
    } });
    Object.defineProperty(exports2, "escapeAttribute", { enumerable: true, get: function() {
      return escape_js_2.escapeAttribute;
    } });
    Object.defineProperty(exports2, "escapeText", { enumerable: true, get: function() {
      return escape_js_2.escapeText;
    } });
    var encode_js_2 = require_encode();
    Object.defineProperty(exports2, "encodeHTML", { enumerable: true, get: function() {
      return encode_js_2.encodeHTML;
    } });
    Object.defineProperty(exports2, "encodeNonAsciiHTML", { enumerable: true, get: function() {
      return encode_js_2.encodeNonAsciiHTML;
    } });
    Object.defineProperty(exports2, "encodeHTML4", { enumerable: true, get: function() {
      return encode_js_2.encodeHTML;
    } });
    Object.defineProperty(exports2, "encodeHTML5", { enumerable: true, get: function() {
      return encode_js_2.encodeHTML;
    } });
    var decode_js_2 = require_decode2();
    Object.defineProperty(exports2, "EntityDecoder", { enumerable: true, get: function() {
      return decode_js_2.EntityDecoder;
    } });
    Object.defineProperty(exports2, "DecodingMode", { enumerable: true, get: function() {
      return decode_js_2.DecodingMode;
    } });
    Object.defineProperty(exports2, "decodeXML", { enumerable: true, get: function() {
      return decode_js_2.decodeXML;
    } });
    Object.defineProperty(exports2, "decodeHTML", { enumerable: true, get: function() {
      return decode_js_2.decodeHTML;
    } });
    Object.defineProperty(exports2, "decodeHTMLStrict", { enumerable: true, get: function() {
      return decode_js_2.decodeHTMLStrict;
    } });
    Object.defineProperty(exports2, "decodeHTMLAttribute", { enumerable: true, get: function() {
      return decode_js_2.decodeHTMLAttribute;
    } });
    Object.defineProperty(exports2, "decodeHTML4", { enumerable: true, get: function() {
      return decode_js_2.decodeHTML;
    } });
    Object.defineProperty(exports2, "decodeHTML5", { enumerable: true, get: function() {
      return decode_js_2.decodeHTML;
    } });
    Object.defineProperty(exports2, "decodeHTML4Strict", { enumerable: true, get: function() {
      return decode_js_2.decodeHTMLStrict;
    } });
    Object.defineProperty(exports2, "decodeHTML5Strict", { enumerable: true, get: function() {
      return decode_js_2.decodeHTMLStrict;
    } });
    Object.defineProperty(exports2, "decodeXMLStrict", { enumerable: true, get: function() {
      return decode_js_2.decodeXML;
    } });
  }
});

// node_modules/dom-serializer/lib/foreignNames.js
var require_foreignNames = __commonJS({
  "node_modules/dom-serializer/lib/foreignNames.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.attributeNames = exports2.elementNames = void 0;
    exports2.elementNames = new Map([
      "altGlyph",
      "altGlyphDef",
      "altGlyphItem",
      "animateColor",
      "animateMotion",
      "animateTransform",
      "clipPath",
      "feBlend",
      "feColorMatrix",
      "feComponentTransfer",
      "feComposite",
      "feConvolveMatrix",
      "feDiffuseLighting",
      "feDisplacementMap",
      "feDistantLight",
      "feDropShadow",
      "feFlood",
      "feFuncA",
      "feFuncB",
      "feFuncG",
      "feFuncR",
      "feGaussianBlur",
      "feImage",
      "feMerge",
      "feMergeNode",
      "feMorphology",
      "feOffset",
      "fePointLight",
      "feSpecularLighting",
      "feSpotLight",
      "feTile",
      "feTurbulence",
      "foreignObject",
      "glyphRef",
      "linearGradient",
      "radialGradient",
      "textPath"
    ].map(function(val) {
      return [val.toLowerCase(), val];
    }));
    exports2.attributeNames = new Map([
      "definitionURL",
      "attributeName",
      "attributeType",
      "baseFrequency",
      "baseProfile",
      "calcMode",
      "clipPathUnits",
      "diffuseConstant",
      "edgeMode",
      "filterUnits",
      "glyphRef",
      "gradientTransform",
      "gradientUnits",
      "kernelMatrix",
      "kernelUnitLength",
      "keyPoints",
      "keySplines",
      "keyTimes",
      "lengthAdjust",
      "limitingConeAngle",
      "markerHeight",
      "markerUnits",
      "markerWidth",
      "maskContentUnits",
      "maskUnits",
      "numOctaves",
      "pathLength",
      "patternContentUnits",
      "patternTransform",
      "patternUnits",
      "pointsAtX",
      "pointsAtY",
      "pointsAtZ",
      "preserveAlpha",
      "preserveAspectRatio",
      "primitiveUnits",
      "refX",
      "refY",
      "repeatCount",
      "repeatDur",
      "requiredExtensions",
      "requiredFeatures",
      "specularConstant",
      "specularExponent",
      "spreadMethod",
      "startOffset",
      "stdDeviation",
      "stitchTiles",
      "surfaceScale",
      "systemLanguage",
      "tableValues",
      "targetX",
      "targetY",
      "textLength",
      "viewBox",
      "viewTarget",
      "xChannelSelector",
      "yChannelSelector",
      "zoomAndPan"
    ].map(function(val) {
      return [val.toLowerCase(), val];
    }));
  }
});

// node_modules/dom-serializer/lib/index.js
var require_lib4 = __commonJS({
  "node_modules/dom-serializer/lib/index.js"(exports2) {
    "use strict";
    var __assign = exports2 && exports2.__assign || function() {
      __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
        }
        return t;
      };
      return __assign.apply(this, arguments);
    };
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.render = void 0;
    var ElementType = __importStar(require_lib());
    var entities_1 = require_lib3();
    var foreignNames_js_1 = require_foreignNames();
    var unencodedElements = /* @__PURE__ */ new Set([
      "style",
      "script",
      "xmp",
      "iframe",
      "noembed",
      "noframes",
      "plaintext",
      "noscript"
    ]);
    function replaceQuotes(value) {
      return value.replace(/"/g, "&quot;");
    }
    function formatAttributes(attributes, opts) {
      var _a;
      if (!attributes)
        return;
      var encode = ((_a = opts.encodeEntities) !== null && _a !== void 0 ? _a : opts.decodeEntities) === false ? replaceQuotes : opts.xmlMode || opts.encodeEntities !== "utf8" ? entities_1.encodeXML : entities_1.escapeAttribute;
      return Object.keys(attributes).map(function(key) {
        var _a2, _b;
        var value = (_a2 = attributes[key]) !== null && _a2 !== void 0 ? _a2 : "";
        if (opts.xmlMode === "foreign") {
          key = (_b = foreignNames_js_1.attributeNames.get(key)) !== null && _b !== void 0 ? _b : key;
        }
        if (!opts.emptyAttrs && !opts.xmlMode && value === "") {
          return key;
        }
        return "".concat(key, '="').concat(encode(value), '"');
      }).join(" ");
    }
    var singleTag = /* @__PURE__ */ new Set([
      "area",
      "base",
      "basefont",
      "br",
      "col",
      "command",
      "embed",
      "frame",
      "hr",
      "img",
      "input",
      "isindex",
      "keygen",
      "link",
      "meta",
      "param",
      "source",
      "track",
      "wbr"
    ]);
    function render(node, options) {
      if (options === void 0) {
        options = {};
      }
      var nodes = "length" in node ? node : [node];
      var output = "";
      for (var i = 0; i < nodes.length; i++) {
        output += renderNode(nodes[i], options);
      }
      return output;
    }
    exports2.render = render;
    exports2.default = render;
    function renderNode(node, options) {
      switch (node.type) {
        case ElementType.Root:
          return render(node.children, options);
        // @ts-expect-error We don't use `Doctype` yet
        case ElementType.Doctype:
        case ElementType.Directive:
          return renderDirective(node);
        case ElementType.Comment:
          return renderComment(node);
        case ElementType.CDATA:
          return renderCdata(node);
        case ElementType.Script:
        case ElementType.Style:
        case ElementType.Tag:
          return renderTag(node, options);
        case ElementType.Text:
          return renderText(node, options);
      }
    }
    var foreignModeIntegrationPoints = /* @__PURE__ */ new Set([
      "mi",
      "mo",
      "mn",
      "ms",
      "mtext",
      "annotation-xml",
      "foreignObject",
      "desc",
      "title"
    ]);
    var foreignElements = /* @__PURE__ */ new Set(["svg", "math"]);
    function renderTag(elem, opts) {
      var _a;
      if (opts.xmlMode === "foreign") {
        elem.name = (_a = foreignNames_js_1.elementNames.get(elem.name)) !== null && _a !== void 0 ? _a : elem.name;
        if (elem.parent && foreignModeIntegrationPoints.has(elem.parent.name)) {
          opts = __assign(__assign({}, opts), { xmlMode: false });
        }
      }
      if (!opts.xmlMode && foreignElements.has(elem.name)) {
        opts = __assign(__assign({}, opts), { xmlMode: "foreign" });
      }
      var tag = "<".concat(elem.name);
      var attribs = formatAttributes(elem.attribs, opts);
      if (attribs) {
        tag += " ".concat(attribs);
      }
      if (elem.children.length === 0 && (opts.xmlMode ? (
        // In XML mode or foreign mode, and user hasn't explicitly turned off self-closing tags
        opts.selfClosingTags !== false
      ) : (
        // User explicitly asked for self-closing tags, even in HTML mode
        opts.selfClosingTags && singleTag.has(elem.name)
      ))) {
        if (!opts.xmlMode)
          tag += " ";
        tag += "/>";
      } else {
        tag += ">";
        if (elem.children.length > 0) {
          tag += render(elem.children, opts);
        }
        if (opts.xmlMode || !singleTag.has(elem.name)) {
          tag += "</".concat(elem.name, ">");
        }
      }
      return tag;
    }
    function renderDirective(elem) {
      return "<".concat(elem.data, ">");
    }
    function renderText(elem, opts) {
      var _a;
      var data = elem.data || "";
      if (((_a = opts.encodeEntities) !== null && _a !== void 0 ? _a : opts.decodeEntities) !== false && !(!opts.xmlMode && elem.parent && unencodedElements.has(elem.parent.name))) {
        data = opts.xmlMode || opts.encodeEntities !== "utf8" ? (0, entities_1.encodeXML)(data) : (0, entities_1.escapeText)(data);
      }
      return data;
    }
    function renderCdata(elem) {
      return "<![CDATA[".concat(elem.children[0].data, "]]>");
    }
    function renderComment(elem) {
      return "<!--".concat(elem.data, "-->");
    }
  }
});

// node_modules/domutils/lib/stringify.js
var require_stringify = __commonJS({
  "node_modules/domutils/lib/stringify.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getOuterHTML = getOuterHTML;
    exports2.getInnerHTML = getInnerHTML;
    exports2.getText = getText;
    exports2.textContent = textContent;
    exports2.innerText = innerText;
    var domhandler_1 = require_lib2();
    var dom_serializer_1 = __importDefault(require_lib4());
    var domelementtype_1 = require_lib();
    function getOuterHTML(node, options) {
      return (0, dom_serializer_1.default)(node, options);
    }
    function getInnerHTML(node, options) {
      return (0, domhandler_1.hasChildren)(node) ? node.children.map(function(node2) {
        return getOuterHTML(node2, options);
      }).join("") : "";
    }
    function getText(node) {
      if (Array.isArray(node))
        return node.map(getText).join("");
      if ((0, domhandler_1.isTag)(node))
        return node.name === "br" ? "\n" : getText(node.children);
      if ((0, domhandler_1.isCDATA)(node))
        return getText(node.children);
      if ((0, domhandler_1.isText)(node))
        return node.data;
      return "";
    }
    function textContent(node) {
      if (Array.isArray(node))
        return node.map(textContent).join("");
      if ((0, domhandler_1.hasChildren)(node) && !(0, domhandler_1.isComment)(node)) {
        return textContent(node.children);
      }
      if ((0, domhandler_1.isText)(node))
        return node.data;
      return "";
    }
    function innerText(node) {
      if (Array.isArray(node))
        return node.map(innerText).join("");
      if ((0, domhandler_1.hasChildren)(node) && (node.type === domelementtype_1.ElementType.Tag || (0, domhandler_1.isCDATA)(node))) {
        return innerText(node.children);
      }
      if ((0, domhandler_1.isText)(node))
        return node.data;
      return "";
    }
  }
});

// node_modules/domutils/lib/traversal.js
var require_traversal = __commonJS({
  "node_modules/domutils/lib/traversal.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getChildren = getChildren;
    exports2.getParent = getParent;
    exports2.getSiblings = getSiblings;
    exports2.getAttributeValue = getAttributeValue;
    exports2.hasAttrib = hasAttrib;
    exports2.getName = getName;
    exports2.nextElementSibling = nextElementSibling;
    exports2.prevElementSibling = prevElementSibling;
    var domhandler_1 = require_lib2();
    function getChildren(elem) {
      return (0, domhandler_1.hasChildren)(elem) ? elem.children : [];
    }
    function getParent(elem) {
      return elem.parent || null;
    }
    function getSiblings(elem) {
      var _a, _b;
      var parent = getParent(elem);
      if (parent != null)
        return getChildren(parent);
      var siblings = [elem];
      var prev = elem.prev, next = elem.next;
      while (prev != null) {
        siblings.unshift(prev);
        _a = prev, prev = _a.prev;
      }
      while (next != null) {
        siblings.push(next);
        _b = next, next = _b.next;
      }
      return siblings;
    }
    function getAttributeValue(elem, name) {
      var _a;
      return (_a = elem.attribs) === null || _a === void 0 ? void 0 : _a[name];
    }
    function hasAttrib(elem, name) {
      return elem.attribs != null && Object.prototype.hasOwnProperty.call(elem.attribs, name) && elem.attribs[name] != null;
    }
    function getName(elem) {
      return elem.name;
    }
    function nextElementSibling(elem) {
      var _a;
      var next = elem.next;
      while (next !== null && !(0, domhandler_1.isTag)(next))
        _a = next, next = _a.next;
      return next;
    }
    function prevElementSibling(elem) {
      var _a;
      var prev = elem.prev;
      while (prev !== null && !(0, domhandler_1.isTag)(prev))
        _a = prev, prev = _a.prev;
      return prev;
    }
  }
});

// node_modules/domutils/lib/manipulation.js
var require_manipulation = __commonJS({
  "node_modules/domutils/lib/manipulation.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.removeElement = removeElement;
    exports2.replaceElement = replaceElement;
    exports2.appendChild = appendChild;
    exports2.append = append;
    exports2.prependChild = prependChild;
    exports2.prepend = prepend;
    function removeElement(elem) {
      if (elem.prev)
        elem.prev.next = elem.next;
      if (elem.next)
        elem.next.prev = elem.prev;
      if (elem.parent) {
        var childs = elem.parent.children;
        var childsIndex = childs.lastIndexOf(elem);
        if (childsIndex >= 0) {
          childs.splice(childsIndex, 1);
        }
      }
      elem.next = null;
      elem.prev = null;
      elem.parent = null;
    }
    function replaceElement(elem, replacement) {
      var prev = replacement.prev = elem.prev;
      if (prev) {
        prev.next = replacement;
      }
      var next = replacement.next = elem.next;
      if (next) {
        next.prev = replacement;
      }
      var parent = replacement.parent = elem.parent;
      if (parent) {
        var childs = parent.children;
        childs[childs.lastIndexOf(elem)] = replacement;
        elem.parent = null;
      }
    }
    function appendChild(parent, child) {
      removeElement(child);
      child.next = null;
      child.parent = parent;
      if (parent.children.push(child) > 1) {
        var sibling = parent.children[parent.children.length - 2];
        sibling.next = child;
        child.prev = sibling;
      } else {
        child.prev = null;
      }
    }
    function append(elem, next) {
      removeElement(next);
      var parent = elem.parent;
      var currNext = elem.next;
      next.next = currNext;
      next.prev = elem;
      elem.next = next;
      next.parent = parent;
      if (currNext) {
        currNext.prev = next;
        if (parent) {
          var childs = parent.children;
          childs.splice(childs.lastIndexOf(currNext), 0, next);
        }
      } else if (parent) {
        parent.children.push(next);
      }
    }
    function prependChild(parent, child) {
      removeElement(child);
      child.parent = parent;
      child.prev = null;
      if (parent.children.unshift(child) !== 1) {
        var sibling = parent.children[1];
        sibling.prev = child;
        child.next = sibling;
      } else {
        child.next = null;
      }
    }
    function prepend(elem, prev) {
      removeElement(prev);
      var parent = elem.parent;
      if (parent) {
        var childs = parent.children;
        childs.splice(childs.indexOf(elem), 0, prev);
      }
      if (elem.prev) {
        elem.prev.next = prev;
      }
      prev.parent = parent;
      prev.prev = elem.prev;
      prev.next = elem;
      elem.prev = prev;
    }
  }
});

// node_modules/domutils/lib/querying.js
var require_querying = __commonJS({
  "node_modules/domutils/lib/querying.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.filter = filter;
    exports2.find = find;
    exports2.findOneChild = findOneChild;
    exports2.findOne = findOne;
    exports2.existsOne = existsOne;
    exports2.findAll = findAll;
    var domhandler_1 = require_lib2();
    function filter(test, node, recurse, limit) {
      if (recurse === void 0) {
        recurse = true;
      }
      if (limit === void 0) {
        limit = Infinity;
      }
      return find(test, Array.isArray(node) ? node : [node], recurse, limit);
    }
    function find(test, nodes, recurse, limit) {
      var result = [];
      var nodeStack = [Array.isArray(nodes) ? nodes : [nodes]];
      var indexStack = [0];
      for (; ; ) {
        if (indexStack[0] >= nodeStack[0].length) {
          if (indexStack.length === 1) {
            return result;
          }
          nodeStack.shift();
          indexStack.shift();
          continue;
        }
        var elem = nodeStack[0][indexStack[0]++];
        if (test(elem)) {
          result.push(elem);
          if (--limit <= 0)
            return result;
        }
        if (recurse && (0, domhandler_1.hasChildren)(elem) && elem.children.length > 0) {
          indexStack.unshift(0);
          nodeStack.unshift(elem.children);
        }
      }
    }
    function findOneChild(test, nodes) {
      return nodes.find(test);
    }
    function findOne(test, nodes, recurse) {
      if (recurse === void 0) {
        recurse = true;
      }
      var searchedNodes = Array.isArray(nodes) ? nodes : [nodes];
      for (var i = 0; i < searchedNodes.length; i++) {
        var node = searchedNodes[i];
        if ((0, domhandler_1.isTag)(node) && test(node)) {
          return node;
        }
        if (recurse && (0, domhandler_1.hasChildren)(node) && node.children.length > 0) {
          var found = findOne(test, node.children, true);
          if (found)
            return found;
        }
      }
      return null;
    }
    function existsOne(test, nodes) {
      return (Array.isArray(nodes) ? nodes : [nodes]).some(function(node) {
        return (0, domhandler_1.isTag)(node) && test(node) || (0, domhandler_1.hasChildren)(node) && existsOne(test, node.children);
      });
    }
    function findAll(test, nodes) {
      var result = [];
      var nodeStack = [Array.isArray(nodes) ? nodes : [nodes]];
      var indexStack = [0];
      for (; ; ) {
        if (indexStack[0] >= nodeStack[0].length) {
          if (nodeStack.length === 1) {
            return result;
          }
          nodeStack.shift();
          indexStack.shift();
          continue;
        }
        var elem = nodeStack[0][indexStack[0]++];
        if ((0, domhandler_1.isTag)(elem) && test(elem))
          result.push(elem);
        if ((0, domhandler_1.hasChildren)(elem) && elem.children.length > 0) {
          indexStack.unshift(0);
          nodeStack.unshift(elem.children);
        }
      }
    }
  }
});

// node_modules/domutils/lib/legacy.js
var require_legacy = __commonJS({
  "node_modules/domutils/lib/legacy.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.testElement = testElement;
    exports2.getElements = getElements;
    exports2.getElementById = getElementById;
    exports2.getElementsByTagName = getElementsByTagName;
    exports2.getElementsByClassName = getElementsByClassName;
    exports2.getElementsByTagType = getElementsByTagType;
    var domhandler_1 = require_lib2();
    var querying_js_1 = require_querying();
    var Checks = {
      tag_name: function(name) {
        if (typeof name === "function") {
          return function(elem) {
            return (0, domhandler_1.isTag)(elem) && name(elem.name);
          };
        } else if (name === "*") {
          return domhandler_1.isTag;
        }
        return function(elem) {
          return (0, domhandler_1.isTag)(elem) && elem.name === name;
        };
      },
      tag_type: function(type) {
        if (typeof type === "function") {
          return function(elem) {
            return type(elem.type);
          };
        }
        return function(elem) {
          return elem.type === type;
        };
      },
      tag_contains: function(data) {
        if (typeof data === "function") {
          return function(elem) {
            return (0, domhandler_1.isText)(elem) && data(elem.data);
          };
        }
        return function(elem) {
          return (0, domhandler_1.isText)(elem) && elem.data === data;
        };
      }
    };
    function getAttribCheck(attrib, value) {
      if (typeof value === "function") {
        return function(elem) {
          return (0, domhandler_1.isTag)(elem) && value(elem.attribs[attrib]);
        };
      }
      return function(elem) {
        return (0, domhandler_1.isTag)(elem) && elem.attribs[attrib] === value;
      };
    }
    function combineFuncs(a, b) {
      return function(elem) {
        return a(elem) || b(elem);
      };
    }
    function compileTest(options) {
      var funcs = Object.keys(options).map(function(key) {
        var value = options[key];
        return Object.prototype.hasOwnProperty.call(Checks, key) ? Checks[key](value) : getAttribCheck(key, value);
      });
      return funcs.length === 0 ? null : funcs.reduce(combineFuncs);
    }
    function testElement(options, node) {
      var test = compileTest(options);
      return test ? test(node) : true;
    }
    function getElements(options, nodes, recurse, limit) {
      if (limit === void 0) {
        limit = Infinity;
      }
      var test = compileTest(options);
      return test ? (0, querying_js_1.filter)(test, nodes, recurse, limit) : [];
    }
    function getElementById(id, nodes, recurse) {
      if (recurse === void 0) {
        recurse = true;
      }
      if (!Array.isArray(nodes))
        nodes = [nodes];
      return (0, querying_js_1.findOne)(getAttribCheck("id", id), nodes, recurse);
    }
    function getElementsByTagName(tagName, nodes, recurse, limit) {
      if (recurse === void 0) {
        recurse = true;
      }
      if (limit === void 0) {
        limit = Infinity;
      }
      return (0, querying_js_1.filter)(Checks["tag_name"](tagName), nodes, recurse, limit);
    }
    function getElementsByClassName(className, nodes, recurse, limit) {
      if (recurse === void 0) {
        recurse = true;
      }
      if (limit === void 0) {
        limit = Infinity;
      }
      return (0, querying_js_1.filter)(getAttribCheck("class", className), nodes, recurse, limit);
    }
    function getElementsByTagType(type, nodes, recurse, limit) {
      if (recurse === void 0) {
        recurse = true;
      }
      if (limit === void 0) {
        limit = Infinity;
      }
      return (0, querying_js_1.filter)(Checks["tag_type"](type), nodes, recurse, limit);
    }
  }
});

// node_modules/domutils/lib/helpers.js
var require_helpers = __commonJS({
  "node_modules/domutils/lib/helpers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DocumentPosition = void 0;
    exports2.removeSubsets = removeSubsets;
    exports2.compareDocumentPosition = compareDocumentPosition;
    exports2.uniqueSort = uniqueSort;
    var domhandler_1 = require_lib2();
    function removeSubsets(nodes) {
      var idx = nodes.length;
      while (--idx >= 0) {
        var node = nodes[idx];
        if (idx > 0 && nodes.lastIndexOf(node, idx - 1) >= 0) {
          nodes.splice(idx, 1);
          continue;
        }
        for (var ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
          if (nodes.includes(ancestor)) {
            nodes.splice(idx, 1);
            break;
          }
        }
      }
      return nodes;
    }
    var DocumentPosition;
    (function(DocumentPosition2) {
      DocumentPosition2[DocumentPosition2["DISCONNECTED"] = 1] = "DISCONNECTED";
      DocumentPosition2[DocumentPosition2["PRECEDING"] = 2] = "PRECEDING";
      DocumentPosition2[DocumentPosition2["FOLLOWING"] = 4] = "FOLLOWING";
      DocumentPosition2[DocumentPosition2["CONTAINS"] = 8] = "CONTAINS";
      DocumentPosition2[DocumentPosition2["CONTAINED_BY"] = 16] = "CONTAINED_BY";
    })(DocumentPosition || (exports2.DocumentPosition = DocumentPosition = {}));
    function compareDocumentPosition(nodeA, nodeB) {
      var aParents = [];
      var bParents = [];
      if (nodeA === nodeB) {
        return 0;
      }
      var current = (0, domhandler_1.hasChildren)(nodeA) ? nodeA : nodeA.parent;
      while (current) {
        aParents.unshift(current);
        current = current.parent;
      }
      current = (0, domhandler_1.hasChildren)(nodeB) ? nodeB : nodeB.parent;
      while (current) {
        bParents.unshift(current);
        current = current.parent;
      }
      var maxIdx = Math.min(aParents.length, bParents.length);
      var idx = 0;
      while (idx < maxIdx && aParents[idx] === bParents[idx]) {
        idx++;
      }
      if (idx === 0) {
        return DocumentPosition.DISCONNECTED;
      }
      var sharedParent = aParents[idx - 1];
      var siblings = sharedParent.children;
      var aSibling = aParents[idx];
      var bSibling = bParents[idx];
      if (siblings.indexOf(aSibling) > siblings.indexOf(bSibling)) {
        if (sharedParent === nodeB) {
          return DocumentPosition.FOLLOWING | DocumentPosition.CONTAINED_BY;
        }
        return DocumentPosition.FOLLOWING;
      }
      if (sharedParent === nodeA) {
        return DocumentPosition.PRECEDING | DocumentPosition.CONTAINS;
      }
      return DocumentPosition.PRECEDING;
    }
    function uniqueSort(nodes) {
      nodes = nodes.filter(function(node, i, arr) {
        return !arr.includes(node, i + 1);
      });
      nodes.sort(function(a, b) {
        var relative = compareDocumentPosition(a, b);
        if (relative & DocumentPosition.PRECEDING) {
          return -1;
        } else if (relative & DocumentPosition.FOLLOWING) {
          return 1;
        }
        return 0;
      });
      return nodes;
    }
  }
});

// node_modules/domutils/lib/feeds.js
var require_feeds = __commonJS({
  "node_modules/domutils/lib/feeds.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getFeed = getFeed;
    var stringify_js_1 = require_stringify();
    var legacy_js_1 = require_legacy();
    function getFeed(doc) {
      var feedRoot = getOneElement(isValidFeed, doc);
      return !feedRoot ? null : feedRoot.name === "feed" ? getAtomFeed(feedRoot) : getRssFeed(feedRoot);
    }
    function getAtomFeed(feedRoot) {
      var _a;
      var childs = feedRoot.children;
      var feed = {
        type: "atom",
        items: (0, legacy_js_1.getElementsByTagName)("entry", childs).map(function(item) {
          var _a2;
          var children = item.children;
          var entry = { media: getMediaElements(children) };
          addConditionally(entry, "id", "id", children);
          addConditionally(entry, "title", "title", children);
          var href2 = (_a2 = getOneElement("link", children)) === null || _a2 === void 0 ? void 0 : _a2.attribs["href"];
          if (href2) {
            entry.link = href2;
          }
          var description = fetch("summary", children) || fetch("content", children);
          if (description) {
            entry.description = description;
          }
          var pubDate = fetch("updated", children);
          if (pubDate) {
            entry.pubDate = new Date(pubDate);
          }
          return entry;
        })
      };
      addConditionally(feed, "id", "id", childs);
      addConditionally(feed, "title", "title", childs);
      var href = (_a = getOneElement("link", childs)) === null || _a === void 0 ? void 0 : _a.attribs["href"];
      if (href) {
        feed.link = href;
      }
      addConditionally(feed, "description", "subtitle", childs);
      var updated = fetch("updated", childs);
      if (updated) {
        feed.updated = new Date(updated);
      }
      addConditionally(feed, "author", "email", childs, true);
      return feed;
    }
    function getRssFeed(feedRoot) {
      var _a, _b;
      var childs = (_b = (_a = getOneElement("channel", feedRoot.children)) === null || _a === void 0 ? void 0 : _a.children) !== null && _b !== void 0 ? _b : [];
      var feed = {
        type: feedRoot.name.substr(0, 3),
        id: "",
        items: (0, legacy_js_1.getElementsByTagName)("item", feedRoot.children).map(function(item) {
          var children = item.children;
          var entry = { media: getMediaElements(children) };
          addConditionally(entry, "id", "guid", children);
          addConditionally(entry, "title", "title", children);
          addConditionally(entry, "link", "link", children);
          addConditionally(entry, "description", "description", children);
          var pubDate = fetch("pubDate", children) || fetch("dc:date", children);
          if (pubDate)
            entry.pubDate = new Date(pubDate);
          return entry;
        })
      };
      addConditionally(feed, "title", "title", childs);
      addConditionally(feed, "link", "link", childs);
      addConditionally(feed, "description", "description", childs);
      var updated = fetch("lastBuildDate", childs);
      if (updated) {
        feed.updated = new Date(updated);
      }
      addConditionally(feed, "author", "managingEditor", childs, true);
      return feed;
    }
    var MEDIA_KEYS_STRING = ["url", "type", "lang"];
    var MEDIA_KEYS_INT = [
      "fileSize",
      "bitrate",
      "framerate",
      "samplingrate",
      "channels",
      "duration",
      "height",
      "width"
    ];
    function getMediaElements(where) {
      return (0, legacy_js_1.getElementsByTagName)("media:content", where).map(function(elem) {
        var attribs = elem.attribs;
        var media = {
          medium: attribs["medium"],
          isDefault: !!attribs["isDefault"]
        };
        for (var _i = 0, MEDIA_KEYS_STRING_1 = MEDIA_KEYS_STRING; _i < MEDIA_KEYS_STRING_1.length; _i++) {
          var attrib = MEDIA_KEYS_STRING_1[_i];
          if (attribs[attrib]) {
            media[attrib] = attribs[attrib];
          }
        }
        for (var _a = 0, MEDIA_KEYS_INT_1 = MEDIA_KEYS_INT; _a < MEDIA_KEYS_INT_1.length; _a++) {
          var attrib = MEDIA_KEYS_INT_1[_a];
          if (attribs[attrib]) {
            media[attrib] = parseInt(attribs[attrib], 10);
          }
        }
        if (attribs["expression"]) {
          media.expression = attribs["expression"];
        }
        return media;
      });
    }
    function getOneElement(tagName, node) {
      return (0, legacy_js_1.getElementsByTagName)(tagName, node, true, 1)[0];
    }
    function fetch(tagName, where, recurse) {
      if (recurse === void 0) {
        recurse = false;
      }
      return (0, stringify_js_1.textContent)((0, legacy_js_1.getElementsByTagName)(tagName, where, recurse, 1)).trim();
    }
    function addConditionally(obj, prop, tagName, where, recurse) {
      if (recurse === void 0) {
        recurse = false;
      }
      var val = fetch(tagName, where, recurse);
      if (val)
        obj[prop] = val;
    }
    function isValidFeed(value) {
      return value === "rss" || value === "feed" || value === "rdf:RDF";
    }
  }
});

// node_modules/domutils/lib/index.js
var require_lib5 = __commonJS({
  "node_modules/domutils/lib/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.hasChildren = exports2.isDocument = exports2.isComment = exports2.isText = exports2.isCDATA = exports2.isTag = void 0;
    __exportStar(require_stringify(), exports2);
    __exportStar(require_traversal(), exports2);
    __exportStar(require_manipulation(), exports2);
    __exportStar(require_querying(), exports2);
    __exportStar(require_legacy(), exports2);
    __exportStar(require_helpers(), exports2);
    __exportStar(require_feeds(), exports2);
    var domhandler_1 = require_lib2();
    Object.defineProperty(exports2, "isTag", { enumerable: true, get: function() {
      return domhandler_1.isTag;
    } });
    Object.defineProperty(exports2, "isCDATA", { enumerable: true, get: function() {
      return domhandler_1.isCDATA;
    } });
    Object.defineProperty(exports2, "isText", { enumerable: true, get: function() {
      return domhandler_1.isText;
    } });
    Object.defineProperty(exports2, "isComment", { enumerable: true, get: function() {
      return domhandler_1.isComment;
    } });
    Object.defineProperty(exports2, "isDocument", { enumerable: true, get: function() {
      return domhandler_1.isDocument;
    } });
    Object.defineProperty(exports2, "hasChildren", { enumerable: true, get: function() {
      return domhandler_1.hasChildren;
    } });
  }
});

// node_modules/htmlparser2/dist/commonjs/index.js
var require_commonjs = __commonJS({
  "node_modules/htmlparser2/dist/commonjs/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DomUtils = exports2.getFeed = exports2.ElementType = exports2.QuoteType = exports2.Tokenizer = exports2.DefaultHandler = exports2.DomHandler = exports2.Parser = void 0;
    exports2.parseDocument = parseDocument;
    exports2.parseDOM = parseDOM;
    exports2.createDocumentStream = createDocumentStream;
    exports2.createDomStream = createDomStream;
    exports2.parseFeed = parseFeed;
    var Parser_js_1 = require_Parser();
    var Parser_js_2 = require_Parser();
    Object.defineProperty(exports2, "Parser", { enumerable: true, get: function() {
      return Parser_js_2.Parser;
    } });
    var domhandler_1 = require_lib2();
    var domhandler_2 = require_lib2();
    Object.defineProperty(exports2, "DomHandler", { enumerable: true, get: function() {
      return domhandler_2.DomHandler;
    } });
    Object.defineProperty(exports2, "DefaultHandler", { enumerable: true, get: function() {
      return domhandler_2.DomHandler;
    } });
    function parseDocument(data, options) {
      const handler = new domhandler_1.DomHandler(void 0, options);
      new Parser_js_1.Parser(handler, options).end(data);
      return handler.root;
    }
    function parseDOM(data, options) {
      return parseDocument(data, options).children;
    }
    function createDocumentStream(callback, options, elementCallback) {
      const handler = new domhandler_1.DomHandler((error) => callback(error, handler.root), options, elementCallback);
      return new Parser_js_1.Parser(handler, options);
    }
    function createDomStream(callback, options, elementCallback) {
      const handler = new domhandler_1.DomHandler(callback, options, elementCallback);
      return new Parser_js_1.Parser(handler, options);
    }
    var Tokenizer_js_1 = require_Tokenizer();
    Object.defineProperty(exports2, "Tokenizer", { enumerable: true, get: function() {
      return __importDefault(Tokenizer_js_1).default;
    } });
    Object.defineProperty(exports2, "QuoteType", { enumerable: true, get: function() {
      return Tokenizer_js_1.QuoteType;
    } });
    exports2.ElementType = __importStar(require_lib());
    var domutils_1 = require_lib5();
    var domutils_2 = require_lib5();
    Object.defineProperty(exports2, "getFeed", { enumerable: true, get: function() {
      return domutils_2.getFeed;
    } });
    var parseFeedDefaultOptions = { xmlMode: true };
    function parseFeed(feed, options = parseFeedDefaultOptions) {
      return (0, domutils_1.getFeed)(parseDOM(feed, options));
    }
    exports2.DomUtils = __importStar(require_lib5());
  }
});

// src/html-text.js
var require_html_text = __commonJS({
  "src/html-text.js"(exports2, module2) {
    "use strict";
    var { parseDocument } = require_commonjs();
    var MAX_HTML_BYTES2 = 50 * 1024 * 1024;
    var MAX_HTML_TEXT_CHARS = 5e6;
    var MAX_HTML_NODES = 2e5;
    var OMIT_TAGS = /* @__PURE__ */ new Set([
      "head",
      "script",
      "style",
      "template",
      "noscript",
      "svg",
      "canvas",
      "iframe",
      "object",
      "embed",
      "audio",
      "video",
      "nav",
      "footer",
      "form",
      "input",
      "button",
      "select",
      "textarea"
    ]);
    var BLOCK_TAGS = /* @__PURE__ */ new Set([
      "address",
      "article",
      "aside",
      "blockquote",
      "caption",
      "dd",
      "details",
      "div",
      "dl",
      "dt",
      "figcaption",
      "figure",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "header",
      "hr",
      "li",
      "main",
      "ol",
      "p",
      "pre",
      "section",
      "summary",
      "table",
      "tr",
      "ul"
    ]);
    function isHtmlFile2(file) {
      return Boolean(file && ["html", "htm"].includes(String(file.extension || "").toLowerCase()));
    }
    function normalizeHtmlWhitespace(text) {
      return String(text || "").replace(/\r\n?/g, "\n").replace(/[\t\f\v \u00a0]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    }
    function nodeInfo(node) {
      if (node.nodeType === 3 || node.type === "text") {
        return { text: node.nodeType === 3 ? node.nodeValue : node.data, children: [] };
      }
      const tag = String(node.localName || node.name || "").toLowerCase();
      const attr = (name) => typeof node.getAttribute === "function" ? node.getAttribute(name) : node.attribs && node.attribs[name];
      const style = String(attr("style") || "");
      const hidden = attr("hidden") != null || attr("aria-hidden") === "true" || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:!important)?\s*(?:;|$)/i.test(style);
      return { tag, omit: hidden || OMIT_TAGS.has(tag), children: Array.from(node.childNodes || node.children || []) };
    }
    function extractHtmlTreeText(root, range = null) {
      const pieces = [];
      let length = 0;
      let count = 0;
      let start = null;
      let end = null;
      const append = (text2) => {
        const value = String(text2 || "");
        length += value.length;
        if (length > MAX_HTML_TEXT_CHARS) throw new Error("HTML readable text exceeds the size limit.");
        pieces.push(value);
      };
      const mark = (node, offset) => {
        if (!range) return;
        if (range.startContainer === node && range.startOffset === offset) start = length;
        if (range.endContainer === node && range.endOffset === offset) end = length;
      };
      const stack = [{ node: root }];
      while (stack.length) {
        const action = stack.pop();
        if (action.boundary !== void 0) {
          mark(action.node, action.boundary);
          continue;
        }
        if (action.close) {
          if (BLOCK_TAGS.has(action.tag)) append("\n");
          if (action.tag === "td" || action.tag === "th") append("; ");
          continue;
        }
        if (++count > MAX_HTML_NODES) throw new Error("HTML contains too many elements.");
        const node = action.node;
        const info = nodeInfo(node);
        if (info.omit) continue;
        if (info.text !== void 0) {
          const text2 = String(info.text || "");
          if (range && range.startContainer === node) start = length + Math.min(text2.length, range.startOffset);
          if (range && range.endContainer === node) end = length + Math.min(text2.length, range.endOffset);
          append(text2);
          continue;
        }
        if (BLOCK_TAGS.has(info.tag) || info.tag === "br") append("\n");
        stack.push({ node, tag: info.tag, close: true });
        stack.push({ node, boundary: info.children.length });
        for (let index = info.children.length - 1; index >= 0; index -= 1) {
          stack.push({ node: info.children[index] });
          stack.push({ node, boundary: index });
        }
      }
      const raw = pieces.join("");
      const text = normalizeHtmlWhitespace(raw);
      if (start === null || end === null || end <= start) return { text, selection: null };
      let startOffset = normalizeHtmlWhitespace(raw.slice(0, start)).length;
      const endOffset = normalizeHtmlWhitespace(raw.slice(0, end)).length;
      while (/\s/.test(text[startOffset] || "") && startOffset < endOffset) startOffset += 1;
      const selectedText = text.slice(startOffset, endOffset).trim();
      return { text, selection: selectedText ? { startOffset, endOffset, selectedText } : null };
    }
    function extractHtmlText2(source) {
      const value = String(source || "");
      if (Buffer.byteLength(value, "utf8") > MAX_HTML_BYTES2) throw new Error("HTML file exceeds the 50 MiB size limit.");
      return extractHtmlTreeText(parseDocument(value, { decodeEntities: true })).text;
    }
    function getHtmlReaderDocument2(view) {
      try {
        const frame = view && view.mainView && view.mainView.iframe || (view && view.contentEl && typeof view.contentEl.querySelector === "function" ? view.contentEl.querySelector("#ohpIframe") : null);
        return frame && (frame.contentDocument || frame.contentWindow && frame.contentWindow.document) || null;
      } catch (_) {
        return null;
      }
    }
    function captureHtmlSelection2(doc, filePath, fileMtime) {
      try {
        const selection = doc && typeof doc.getSelection === "function" && doc.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount || !doc.body) return null;
        const range = selection.getRangeAt(0);
        if (!doc.body.contains(range.startContainer) || !doc.body.contains(range.endContainer)) return null;
        const result = extractHtmlTreeText(doc.body, range);
        if (!result.selection) return null;
        return { ...result.selection, text: result.text, filePath, fileMtime };
      } catch (_) {
        return null;
      }
    }
    module2.exports = {
      MAX_HTML_BYTES: MAX_HTML_BYTES2,
      captureHtmlSelection: captureHtmlSelection2,
      extractHtmlText: extractHtmlText2,
      extractHtmlTreeText,
      getHtmlReaderDocument: getHtmlReaderDocument2,
      isHtmlFile: isHtmlFile2,
      normalizeHtmlWhitespace
    };
  }
});

// src/playback-estimate.js
var require_playback_estimate = __commonJS({
  "src/playback-estimate.js"(exports2, module2) {
    function estimateTextSeconds(text, speed = 1) {
      const value = String(text || "");
      const han = (value.match(/\p{Script=Han}/gu) || []).length;
      const words = (value.replace(/\p{Script=Han}/gu, " ").match(/[\p{L}\p{N}]+/gu) || []).length;
      return (han / 4 + words / 2.5) / (Number(speed) > 0 ? Number(speed) : 1);
    }
    function estimatePlayback2(session, index, time, speed = 1, playbackSpeed = 1) {
      if (!Array.isArray(session?.chunks) || !session.chunks.length || session.kind === "audio-export") return null;
      const durations = session.chunks.map((text, i) => {
        const measured = session.audioDurations?.[i];
        return Number.isFinite(measured) && measured > 0 ? measured : estimateTextSeconds(text, session.synthesisSpeeds?.[i] || speed);
      });
      index = Math.max(0, Math.min(durations.length - 1, Math.floor(Number(index) || 0)));
      const rate = Number.isFinite(playbackSpeed) && playbackSpeed > 0 ? playbackSpeed : 1;
      return {
        total: durations.reduce((a, b) => a + b, 0) / rate,
        remaining: (Math.max(0, durations[index] - Math.max(0, Number(time) || 0)) + durations.slice(index + 1).reduce((a, b) => a + b, 0)) / rate,
        partial: session.kind === "pdf-progressive" && !session.productionComplete
      };
    }
    function formatDuration2(seconds) {
      const n = Math.max(0, Math.ceil(Number(seconds) || 0));
      const hours = Math.floor(n / 3600);
      const minutes = Math.floor(n % 3600 / 60);
      const tail = String(n % 60).padStart(2, "0");
      return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${tail}` : `${minutes}:${tail}`;
    }
    module2.exports = { estimateTextSeconds, estimatePlayback: estimatePlayback2, formatDuration: formatDuration2 };
  }
});

// node_modules/@laginae/note-reader-core/src/semantic-chunker.js
var require_semantic_chunker = __commonJS({
  "node_modules/@laginae/note-reader-core/src/semantic-chunker.js"(exports2, module2) {
    "use strict";
    var DEFAULT_CHUNK_LIMITS2 = [40, 80, 120, 160, 280, 320];
    function parseChunkLimits2(value, fallback = DEFAULT_CHUNK_LIMITS2) {
      const list = Array.isArray(value) ? value : String(value || "").split(",").map((item) => item.trim());
      const limits = list.map((item) => Math.floor(Number(item))).filter((item) => Number.isFinite(item) && item > 0);
      const fallbackLimits = Array.isArray(fallback) ? fallback.filter((item) => Number.isFinite(item) && item > 0) : [];
      return limits.length ? limits : fallbackLimits.length ? fallbackLimits.slice() : DEFAULT_CHUNK_LIMITS2.slice();
    }
    function normalizeChunkText(text) {
      return String(text || "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    }
    function findLastBoundary(search, pattern, limit) {
      let match;
      let best = -1;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(search)) !== null) {
        const end = match.index + match[0].length;
        if (end > 0 && end <= limit) {
          best = end;
        }
        if (match[0].length === 0) {
          pattern.lastIndex += 1;
        }
      }
      return best;
    }
    function chooseChunkCut(text, limit) {
      const safeLimit = Math.max(1, Math.floor(Number(limit) || 1));
      const search = String(text || "").slice(0, safeLimit + 1);
      const minUsefulCut = Math.max(1, Math.floor(safeLimit * 0.35));
      const boundaries = [
        /\n{2,}/g,
        /\n/g,
        /[。！？!?](?:["'\u2019\u201d\u3009-\u3011\u3015\uff09])?\s*/g,
        /\.(?!\d)(?:["'\u2019\u201d])?\s+/g,
        /[，,；;：:]\s*/g,
        /\s+/g
      ];
      for (const pattern of boundaries) {
        const cut = findLastBoundary(search, pattern, safeLimit);
        if (cut >= minUsefulCut) {
          return cut;
        }
      }
      return safeLimit;
    }
    function splitTextForSpeechChunks2(text, maxLengths = DEFAULT_CHUNK_LIMITS2) {
      const limits = parseChunkLimits2(maxLengths);
      let remaining = normalizeChunkText(text);
      const chunks = [];
      while (remaining) {
        const limit = limits[Math.min(chunks.length, limits.length - 1)];
        if (remaining.length <= limit) {
          chunks.push(remaining);
          break;
        }
        const cut = chooseChunkCut(remaining, limit);
        const chunk = remaining.slice(0, cut).trim();
        remaining = remaining.slice(cut).trim();
        if (chunk) {
          chunks.push(chunk);
        }
      }
      return chunks;
    }
    function createIncrementalSpeechChunker2(maxLengths = DEFAULT_CHUNK_LIMITS2, options = {}) {
      const limits = parseChunkLimits2(maxLengths);
      const detailed = options && options.detailed === true;
      let buffer = "";
      let chunkCount = 0;
      let spans = [];
      const appendSpan = (length, metadata) => {
        if (length <= 0) {
          return;
        }
        const previous = spans[spans.length - 1];
        if (previous && previous.metadata === metadata) {
          previous.length += length;
        } else {
          spans.push({ length, metadata });
        }
      };
      const consumeSpans = (count) => {
        let remaining = count;
        while (remaining > 0 && spans.length) {
          if (remaining >= spans[0].length) {
            remaining -= spans[0].length;
            spans.shift();
          } else {
            spans[0].length -= remaining;
            remaining = 0;
          }
        }
      };
      const consumeBuffer = (count) => {
        let next = buffer.slice(count);
        const leadingWhitespace = /^\s*/.exec(next)[0].length;
        consumeSpans(count + leadingWhitespace);
        buffer = next.slice(leadingWhitespace);
      };
      const firstMetadata = () => {
        const span = spans.find((entry) => entry.metadata !== null && typeof entry.metadata !== "undefined");
        return span ? span.metadata : null;
      };
      const formatChunk = (text) => detailed ? { metadata: firstMetadata(), text } : text;
      const takeReadyChunks = (flush) => {
        const chunks = [];
        while (buffer) {
          const limit = limits[Math.min(chunkCount, limits.length - 1)];
          if (buffer.length <= limit) {
            if (flush) {
              const chunk2 = buffer.trim();
              if (chunk2) {
                chunks.push(formatChunk(chunk2));
                chunkCount += 1;
              }
              buffer = "";
              spans = [];
            }
            break;
          }
          const cut = chooseChunkCut(buffer, limit);
          const chunk = buffer.slice(0, cut).trim();
          if (chunk) {
            chunks.push(formatChunk(chunk));
            chunkCount += 1;
          }
          consumeBuffer(cut);
        }
        return chunks;
      };
      return {
        push(text, metadata = null) {
          const normalized = normalizeChunkText(text);
          if (normalized) {
            if (buffer) {
              buffer += "\n\n";
              appendSpan(2, null);
            }
            buffer += normalized;
            appendSpan(normalized.length, metadata);
          }
          return takeReadyChunks(false);
        },
        finish() {
          return takeReadyChunks(true);
        }
      };
    }
    module2.exports = {
      DEFAULT_CHUNK_LIMITS: DEFAULT_CHUNK_LIMITS2,
      chooseChunkCut,
      createIncrementalSpeechChunker: createIncrementalSpeechChunker2,
      normalizeChunkText,
      parseChunkLimits: parseChunkLimits2,
      splitTextForSpeechChunks: splitTextForSpeechChunks2
    };
  }
});

// src/semantic-chunker.js
var require_semantic_chunker2 = __commonJS({
  "src/semantic-chunker.js"(exports2, module2) {
    "use strict";
    var core = require_semantic_chunker();
    var sentenceSegmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(void 0, { granularity: "sentence" }) : null;
    function openingSentenceCut(text, threshold) {
      const segments = sentenceSegmenter ? sentenceSegmenter.segment(text) : Array.from(text.matchAll(/.*?(?:[。！？!?]|\.(?!\d)(?=\s|$)|$)/g), (match) => ({ index: match.index, segment: match[0] }));
      for (const segment of segments) {
        const sentence = segment.segment.trimEnd();
        if (!sentence.trim()) continue;
        if (/(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|Fig|Figs|Eq|Eqs|Sec|Vol|No|e\.g|i\.e)|\b[A-Z](?:\.[A-Z])*)\.$/i.test(sentence)) continue;
        const end = segment.index + sentence.length;
        if (/[。！？!?.]["'\u2019\u201d\u3009-\u3011\u3015\uff09]*$/.test(sentence) && Array.from(text.slice(0, end).replace(/\s/g, "")).length >= threshold) return end;
      }
      return text.length;
    }
    function splitOpeningAudioParts(text) {
      let remaining = core.normalizeChunkText(text);
      const parts = [];
      for (const threshold of [20, 40]) {
        if (!remaining) break;
        const cut = openingSentenceCut(remaining, threshold);
        parts.push(remaining.slice(0, cut).trim());
        remaining = remaining.slice(cut).trim();
      }
      if (remaining) parts.push(remaining);
      return parts;
    }
    module2.exports = { ...core, splitOpeningAudioParts };
  }
});

// src/speech-parts.js
var require_speech_parts = __commonJS({
  "src/speech-parts.js"(exports2, module2) {
    "use strict";
    var { splitOpeningAudioParts } = require_semantic_chunker2();
    var { estimateTextSeconds } = require_playback_estimate();
    function getSpeechParts2(session, index) {
      const text = session?.chunks?.[index];
      if (typeof text !== "string") return [];
      session.audioParts || (session.audioParts = {});
      if (!session.audioParts[index]) {
        session.audioParts[index] = index === 0 && session.kind !== "audio-export" ? splitOpeningAudioParts(text) : [text];
      }
      return session.audioParts[index];
    }
    function adjacentSpeechPart2(session, index, part, delta) {
      const parts = getSpeechParts2(session, index);
      if (delta > 0) {
        if (part + 1 < parts.length) return { index, part: part + 1 };
        if (index + 1 < session.chunks.length) return { index: index + 1, part: 0 };
      } else {
        if (part > 0) return { index, part: part - 1 };
        if (index > 0) return { index: index - 1, part: getSpeechParts2(session, index - 1).length - 1 };
      }
      return null;
    }
    function getSpeechPartTiming2(session, index, part = 0, time = 0, speed = 1) {
      const durations = getSpeechParts2(session, index).map((text, p) => {
        const measured = session.partDurations?.[`${index}:${p}`];
        return measured > 0 ? measured : Math.max(0.1, estimateTextSeconds(text, session.synthesisSpeeds?.[index] || speed));
      });
      const offset = durations.slice(0, part).reduce((sum, value) => sum + value, 0);
      const duration = durations.reduce((sum, value) => sum + value, 0);
      return { durations, offset, duration, current: Math.min(duration, offset + Math.max(0, time)) };
    }
    module2.exports = { getSpeechParts: getSpeechParts2, adjacentSpeechPart: adjacentSpeechPart2, getSpeechPartTiming: getSpeechPartTiming2 };
  }
});

// src/audio-export.js
var require_audio_export = __commonJS({
  "src/audio-export.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var path2 = require("path");
    var MAX_EXPORTED_AUDIO_BYTES2 = 256 * 1024 * 1024;
    function bufferToArrayBuffer2(buffer) {
      const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    function sanitizeExportBaseName(value) {
      const sanitized = String(value || "note").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "").trim();
      return sanitized || "note";
    }
    function buildExportAudioFileName2(noteBaseName, extension, scope = "entire") {
      const normalizedExtension = String(extension || "").toLowerCase() === "mp3" ? "mp3" : "wav";
      const suffix = scope === "selection" ? "selection narration" : scope === "from-selection" ? "continued narration" : "narration";
      return `${sanitizeExportBaseName(noteBaseName)} - ${suffix}.${normalizedExtension}`;
    }
    function parseWaveBuffer(value) {
      const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
      if (buffer.length < 12 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
        throw new Error("The local speech engine returned an invalid WAV file.");
      }
      let formatChunk = null;
      const dataChunks = [];
      let offset = 12;
      while (offset + 8 <= buffer.length) {
        const chunkId = buffer.toString("ascii", offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);
        const chunkStart = offset + 8;
        const chunkEnd = chunkStart + chunkSize;
        if (chunkEnd > buffer.length) {
          throw new Error("The local speech engine returned a truncated WAV file.");
        }
        if (chunkId === "fmt " && !formatChunk) {
          formatChunk = Buffer.from(buffer.subarray(chunkStart, chunkEnd));
        } else if (chunkId === "data" && chunkSize > 0) {
          dataChunks.push(buffer.subarray(chunkStart, chunkEnd));
        }
        offset = chunkEnd + chunkSize % 2;
      }
      if (!formatChunk || formatChunk.length < 16 || !dataChunks.length) {
        throw new Error("The local speech engine returned a WAV file without PCM audio data.");
      }
      const audioFormat = formatChunk.readUInt16LE(0);
      const channels = formatChunk.readUInt16LE(2);
      const sampleRate = formatChunk.readUInt32LE(4);
      const byteRate = formatChunk.readUInt32LE(8);
      const blockAlign = formatChunk.readUInt16LE(12);
      const bitsPerSample = formatChunk.readUInt16LE(14);
      const isPcm = audioFormat === 1;
      const isExtensiblePcm = audioFormat === 65534 && formatChunk.length >= 40 && formatChunk.readUInt16LE(24) === 1;
      if (!isPcm && !isExtensiblePcm) {
        throw new Error(`WAV export supports PCM audio only; received format ${audioFormat}.`);
      }
      if (!channels || !sampleRate || !byteRate || !blockAlign || !bitsPerSample) {
        throw new Error("The local speech engine returned an invalid WAV format header.");
      }
      const dataBytes = dataChunks.reduce((total, chunk) => total + chunk.length, 0);
      if (dataBytes % blockAlign !== 0) {
        throw new Error("The local speech engine returned misaligned WAV audio data.");
      }
      return {
        audioFormat,
        bitsPerSample,
        blockAlign,
        byteRate,
        channels,
        dataBytes,
        dataChunks,
        formatChunk,
        sampleRate
      };
    }
    function getWaveFormatSignature(parsed) {
      return [
        parsed.audioFormat,
        parsed.channels,
        parsed.sampleRate,
        parsed.byteRate,
        parsed.blockAlign,
        parsed.bitsPerSample,
        parsed.formatChunk.toString("hex")
      ].join(":");
    }
    function createWaveHeader(formatChunkValue, dataBytes) {
      const formatChunk = Buffer.from(formatChunkValue);
      const formatPadding = formatChunk.length % 2;
      const headerLength = 12 + 8 + formatChunk.length + formatPadding + 8;
      const riffSize = headerLength + dataBytes - 8;
      if (!Number.isSafeInteger(dataBytes) || dataBytes < 0 || riffSize > 4294967295) {
        throw new Error("The exported WAV file is too large for the WAV format.");
      }
      const header = Buffer.alloc(headerLength);
      header.write("RIFF", 0, "ascii");
      header.writeUInt32LE(riffSize, 4);
      header.write("WAVE", 8, "ascii");
      header.write("fmt ", 12, "ascii");
      header.writeUInt32LE(formatChunk.length, 16);
      formatChunk.copy(header, 20);
      const dataHeaderOffset = 20 + formatChunk.length + formatPadding;
      header.write("data", dataHeaderOffset, "ascii");
      header.writeUInt32LE(dataBytes, dataHeaderOffset + 4);
      return header;
    }
    async function writeBufferAt(fileHandle, buffer, position) {
      let offset = 0;
      while (offset < buffer.length) {
        const result = await fileHandle.write(buffer, offset, buffer.length - offset, position + offset);
        if (!result || !result.bytesWritten) {
          throw new Error("Unable to write the exported audio file.");
        }
        offset += result.bytesWritten;
      }
      return position + buffer.length;
    }
    function trimWaveBoundary(parsed, index, count) {
      const data = Buffer.concat(parsed.dataChunks);
      if (parsed.audioFormat !== 1 || parsed.bitsPerSample !== 16 || parsed.blockAlign !== parsed.channels * 2 || count < 2) return data;
      const frames = data.length / parsed.blockAlign;
      const silent = (frame) => {
        for (let channel = 0; channel < parsed.channels; channel += 1) {
          if (Math.abs(data.readInt16LE(frame * parsed.blockAlign + channel * 2)) > 1) return false;
        }
        return true;
      };
      let first = 0;
      while (first < frames && silent(first)) first += 1;
      if (first === frames) return data;
      let last = frames;
      while (last > first && silent(last - 1)) last -= 1;
      const threshold = Math.ceil(parsed.sampleRate * 0.6);
      const keep = Math.ceil(parsed.sampleRate * 0.15);
      const start = index > 0 && first > threshold ? first - keep : 0;
      const end = index < count - 1 && frames - last > threshold ? last + keep : frames;
      return data.subarray(start * parsed.blockAlign, end * parsed.blockAlign);
    }
    async function mergeWaveFiles(inputPaths, outputPath, options = {}) {
      const paths = Array.isArray(inputPaths) ? inputPaths.filter(Boolean) : [];
      if (!paths.length) {
        throw new Error("No WAV segments were generated for export.");
      }
      const maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : MAX_EXPORTED_AUDIO_BYTES2;
      let expectedSignature = "";
      let formatChunk = null;
      let totalDataBytes = 0;
      for (const [index, inputPath] of paths.entries()) {
        const parsed = parseWaveBuffer(await fs2.promises.readFile(inputPath));
        const signature = getWaveFormatSignature(parsed);
        if (expectedSignature && signature !== expectedSignature) {
          throw new Error("The generated WAV segments use different audio formats and cannot be merged safely.");
        }
        expectedSignature = signature;
        formatChunk = parsed.formatChunk;
        totalDataBytes += trimWaveBoundary(parsed, index, paths.length).length;
        if (totalDataBytes > maxBytes) {
          throw new Error(`The exported audio exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB safety limit.`);
        }
      }
      const header = createWaveHeader(formatChunk, totalDataBytes);
      if (header.length + totalDataBytes > maxBytes) {
        throw new Error(`The exported audio exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB safety limit.`);
      }
      let handle = null;
      try {
        await fs2.promises.mkdir(path2.dirname(outputPath), { recursive: true });
        handle = await fs2.promises.open(outputPath, "w", 384);
        let outputOffset = await writeBufferAt(handle, header, 0);
        for (const [index, inputPath] of paths.entries()) {
          const parsed = parseWaveBuffer(await fs2.promises.readFile(inputPath));
          outputOffset = await writeBufferAt(handle, trimWaveBoundary(parsed, index, paths.length), outputOffset);
        }
      } catch (error) {
        if (handle) {
          await handle.close().catch(() => {
          });
          handle = null;
        }
        await fs2.promises.unlink(outputPath).catch(() => {
        });
        throw error;
      } finally {
        if (handle) {
          await handle.close().catch(() => {
          });
        }
      }
      return {
        bytes: header.length + totalDataBytes,
        extension: "wav",
        segments: paths.length
      };
    }
    var MPEG1_LAYER3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    var MPEG2_LAYER3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    function parseMp3FrameHeader(buffer, offset) {
      if (offset + 4 > buffer.length) {
        return null;
      }
      const header = buffer.readUInt32BE(offset) >>> 0;
      if ((header >>> 21 & 2047) !== 2047) {
        return null;
      }
      const versionBits = header >>> 19 & 3;
      const layerBits = header >>> 17 & 3;
      const bitrateIndex = header >>> 12 & 15;
      const sampleRateIndex = header >>> 10 & 3;
      if (versionBits === 1 || layerBits !== 1 || bitrateIndex < 1 || bitrateIndex > 14 || sampleRateIndex === 3) {
        return null;
      }
      const baseSampleRates = [44100, 48e3, 32e3];
      const sampleRateDivisor = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 4;
      const sampleRate = baseSampleRates[sampleRateIndex] / sampleRateDivisor;
      const bitrateKbps = (versionBits === 3 ? MPEG1_LAYER3_BITRATES : MPEG2_LAYER3_BITRATES)[bitrateIndex];
      const padding = header >>> 9 & 1;
      const frameLength = Math.floor(
        (versionBits === 3 ? 144 : 72) * bitrateKbps * 1e3 / sampleRate
      ) + padding;
      if (frameLength <= 4 || offset + frameLength > buffer.length) {
        return null;
      }
      const channelMode = header >>> 6 & 3;
      return {
        bitrateKbps,
        channels: channelMode === 3 ? 1 : 2,
        frameLength,
        layerBits,
        sampleRate,
        versionBits
      };
    }
    function readSynchsafeInteger(buffer, offset) {
      if (offset + 4 > buffer.length) {
        return -1;
      }
      const bytes = buffer.subarray(offset, offset + 4);
      if (Array.from(bytes).some((byte) => byte & 128)) {
        return -1;
      }
      return bytes[0] << 21 | bytes[1] << 14 | bytes[2] << 7 | bytes[3];
    }
    function skipLeadingId3Tags(buffer) {
      let offset = 0;
      while (offset + 10 <= buffer.length && buffer.toString("ascii", offset, offset + 3) === "ID3") {
        const tagSize = readSynchsafeInteger(buffer, offset + 6);
        if (tagSize < 0) {
          throw new Error("The online speech engine returned an invalid MP3 metadata tag.");
        }
        const hasFooter = Boolean(buffer[offset + 5] & 16);
        const nextOffset = offset + 10 + tagSize + (hasFooter ? 10 : 0);
        if (nextOffset > buffer.length) {
          throw new Error("The online speech engine returned a truncated MP3 metadata tag.");
        }
        offset = nextOffset;
      }
      return offset;
    }
    function isMp3MetadataFrame(frame) {
      const sample = frame.subarray(0, Math.min(frame.length, 192)).toString("latin1");
      return sample.includes("Xing") || sample.includes("Info") || sample.includes("VBRI");
    }
    function isIgnorableMp3Tail(buffer, offset) {
      if (offset >= buffer.length) {
        return true;
      }
      if (buffer.length - offset === 128 && buffer.toString("ascii", offset, offset + 3) === "TAG") {
        return true;
      }
      for (let index = offset; index < buffer.length; index += 1) {
        if (buffer[index] !== 0) {
          return false;
        }
      }
      return true;
    }
    function extractMp3Frames(value) {
      const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
      let offset = skipLeadingId3Tags(buffer);
      let skippedBeforeFirstFrame = 0;
      const frames = [];
      let format = null;
      while (offset + 4 <= buffer.length) {
        if (buffer.length - offset === 128 && buffer.toString("ascii", offset, offset + 3) === "TAG") {
          break;
        }
        const header = parseMp3FrameHeader(buffer, offset);
        if (!header) {
          if (frames.length) {
            if (isIgnorableMp3Tail(buffer, offset)) {
              break;
            }
            throw new Error("The online speech engine returned malformed MP3 audio frames.");
          }
          offset += 1;
          skippedBeforeFirstFrame += 1;
          if (skippedBeforeFirstFrame > 4096) {
            break;
          }
          continue;
        }
        const frame = buffer.subarray(offset, offset + header.frameLength);
        if (format && [
          header.versionBits,
          header.layerBits,
          header.sampleRate,
          header.channels
        ].join(":") !== [
          format.versionBits,
          format.layerBits,
          format.sampleRate,
          format.channels
        ].join(":")) {
          throw new Error("The online speech engine returned inconsistent MP3 audio frames.");
        }
        frames.push(frame);
        format = format || header;
        offset += header.frameLength;
      }
      if (frames.length > 1 && isMp3MetadataFrame(frames[0])) {
        frames.shift();
      }
      if (!frames.length || !format) {
        throw new Error("The online speech engine returned an MP3 file without readable audio frames.");
      }
      return {
        bytes: frames.reduce((total, frame) => total + frame.length, 0),
        format,
        frames
      };
    }
    function getMp3FormatSignature(parsed) {
      return [
        parsed.format.versionBits,
        parsed.format.layerBits,
        parsed.format.sampleRate,
        parsed.format.channels
      ].join(":");
    }
    async function mergeMp3Files(inputPaths, outputPath, options = {}) {
      const paths = Array.isArray(inputPaths) ? inputPaths.filter(Boolean) : [];
      if (!paths.length) {
        throw new Error("No MP3 segments were generated for export.");
      }
      const maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : MAX_EXPORTED_AUDIO_BYTES2;
      let expectedSignature = "";
      let totalBytes = 0;
      let totalFrames = 0;
      let handle = null;
      try {
        await fs2.promises.mkdir(path2.dirname(outputPath), { recursive: true });
        handle = await fs2.promises.open(outputPath, "w", 384);
        let outputOffset = 0;
        for (const inputPath of paths) {
          const parsed = extractMp3Frames(await fs2.promises.readFile(inputPath));
          const signature = getMp3FormatSignature(parsed);
          if (expectedSignature && signature !== expectedSignature) {
            throw new Error("The generated MP3 segments use different sample formats and cannot be merged safely.");
          }
          expectedSignature = signature;
          totalBytes += parsed.bytes;
          if (totalBytes > maxBytes) {
            throw new Error(`The exported audio exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB safety limit.`);
          }
          for (const frame of parsed.frames) {
            outputOffset = await writeBufferAt(handle, frame, outputOffset);
            totalFrames += 1;
          }
        }
      } catch (error) {
        if (handle) {
          await handle.close().catch(() => {
          });
          handle = null;
        }
        await fs2.promises.unlink(outputPath).catch(() => {
        });
        throw error;
      } finally {
        if (handle) {
          await handle.close().catch(() => {
          });
        }
      }
      return {
        bytes: totalBytes,
        extension: "mp3",
        frames: totalFrames,
        segments: paths.length
      };
    }
    async function mergeAudioFiles2(inputPaths, outputPath, extension, options = {}) {
      return String(extension || "").toLowerCase() === "mp3" ? mergeMp3Files(inputPaths, outputPath, options) : mergeWaveFiles(inputPaths, outputPath, options);
    }
    module2.exports = {
      MAX_EXPORTED_AUDIO_BYTES: MAX_EXPORTED_AUDIO_BYTES2,
      bufferToArrayBuffer: bufferToArrayBuffer2,
      buildExportAudioFileName: buildExportAudioFileName2,
      createWaveHeader,
      extractMp3Frames,
      mergeAudioFiles: mergeAudioFiles2,
      mergeMp3Files,
      mergeWaveFiles,
      parseMp3FrameHeader,
      parseWaveBuffer,
      sanitizeExportBaseName
    };
  }
});

// src/mimo-tts.js
var require_mimo_tts = __commonJS({
  "src/mimo-tts.js"(exports2, module2) {
    var MIMO_ENDPOINT2 = "https://api.xiaomimimo.com/v1/chat/completions";
    var { parseWaveBuffer } = require_audio_export();
    var MIMO_MAX_CHUNK_CHARS2 = 200;
    var MIMO_DEFAULTS2 = {
      mimoConsent: false,
      mimoChunkLimit: 200,
      mimoCredentialSource: "obsidian-secret",
      mimoSecretName: "",
      mimoKeyPath: "",
      mimoVoice: "\u767D\u6866"
    };
    var MIMO_VOICES2 = [
      ["Dean", "English male", "\u82F1\u6587\u7537\u58F0"],
      ["Milo", "English male", "\u82F1\u6587\u7537\u58F0"],
      ["Mia", "English female", "\u82F1\u6587\u5973\u58F0"],
      ["Chloe", "English female", "\u82F1\u6587\u5973\u58F0"],
      ["\u82CF\u6253", "Chinese male", "\u4E2D\u6587\u7537\u58F0"],
      ["\u767D\u6866", "Chinese male", "\u4E2D\u6587\u7537\u58F0"],
      ["\u51B0\u7CD6", "Chinese female", "\u4E2D\u6587\u5973\u58F0"],
      ["\u8309\u8389", "Chinese female", "\u4E2D\u6587\u5973\u58F0"]
    ];
    function normalizeMimoSettings2(settings) {
      settings.mimoChunkLimit = Math.max(50, Math.min(2e3, Math.floor(Number(settings.mimoChunkLimit) || MIMO_MAX_CHUNK_CHARS2)));
      settings.mimoConsent = settings.mimoConsent === true;
      settings.mimoCredentialSource = settings.mimoCredentialSource === "key-file" ? "key-file" : "obsidian-secret";
      settings.mimoSecretName = String(settings.mimoSecretName || "").trim();
      settings.mimoKeyPath = String(settings.mimoKeyPath || "").trim();
      settings.mimoVoice = MIMO_VOICES2.some(([id]) => id === settings.mimoVoice) ? settings.mimoVoice : MIMO_DEFAULTS2.mimoVoice;
    }
    function buildMimoRequestBody2(text, settings) {
      const normalized = { ...settings };
      normalizeMimoSettings2(normalized);
      const speed = Number(settings.speed);
      const rate = Number.isFinite(speed) ? Math.min(2, Math.max(0.5, speed)) : 1;
      return JSON.stringify({
        model: "mimo-v2.5-tts",
        messages: [
          { role: "user", content: `Read the supplied text faithfully in a calm, neutral academic narration style at ${rate} times normal speaking speed. Do not summarize or add words.` },
          { role: "assistant", content: String(text) }
        ],
        audio: { format: "wav", voice: normalized.mimoVoice },
        stream: false
      });
    }
    function decodeMimoAudio2(bytes) {
      let data;
      let choice;
      try {
        const response = JSON.parse(bytes.toString("utf8"));
        choice = response.choices?.[0];
        data = choice?.message?.audio?.data;
        if (response.error) throw new Error();
      } catch {
        throw new Error("MiMo TTS returned an invalid audio response.");
      }
      if (choice?.finish_reason !== "stop") {
        const reason = choice?.finish_reason;
        const detail = reason === "length" ? "Generation reached its length limit; the audio may omit the end of this segment." : reason === "content_filter" ? "The provider blocked this segment with its content filter." : "The provider did not confirm normal completion.";
        throw new Error(`MiMo TTS: ${detail} Reading stopped without advancing. Select this segment and retry with shorter chunks. / \u672C\u6BB5\u672A\u786E\u8BA4\u5B8C\u6574\u751F\u6210\uFF0C\u5DF2\u505C\u6B62\uFF0C\u672A\u8DF3\u5230\u4E0B\u4E00\u6BB5\uFF1B\u8BF7\u7F29\u77ED\u5206\u6BB5\u540E\u91CD\u8BD5\u3002`);
      }
      if (typeof data !== "string" || !data.length || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
        throw new Error("MiMo TTS returned missing or invalid base64 audio.");
      }
      const audio = Buffer.from(data, "base64");
      if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE") {
        throw new Error("MiMo TTS returned invalid WAV audio.");
      }
      try {
        if (audio.readUInt32LE(4) + 8 !== audio.length) throw new Error();
        parseWaveBuffer(audio);
      } catch {
        throw new Error("MiMo TTS returned truncated or invalid WAV data. Reading stopped without advancing. / \u97F3\u9891\u4E0D\u5B8C\u6574\uFF0C\u5DF2\u505C\u6B62\uFF0C\u672A\u8DF3\u5230\u4E0B\u4E00\u6BB5\u3002");
      }
      return audio;
    }
    module2.exports = { MIMO_ENDPOINT: MIMO_ENDPOINT2, MIMO_DEFAULTS: MIMO_DEFAULTS2, MIMO_VOICES: MIMO_VOICES2, MIMO_MAX_CHUNK_CHARS: MIMO_MAX_CHUNK_CHARS2, normalizeMimoSettings: normalizeMimoSettings2, buildMimoRequestBody: buildMimoRequestBody2, decodeMimoAudio: decodeMimoAudio2 };
  }
});

// node_modules/@laginae/note-reader-core/src/reading-position.js
var require_reading_position = __commonJS({
  "node_modules/@laginae/note-reader-core/src/reading-position.js"(exports2, module2) {
    "use strict";
    var MAX_READING_POSITIONS = 100;
    var MAX_ANCHOR_LENGTH = 180;
    function normalizeAnchorText(text) {
      return String(text || "").normalize("NFKC").replace(/\u00ad/g, "").replace(/([A-Za-z])-\s+(?=[a-z])/g, "$1").replace(/\s+/g, " ").trim();
    }
    function createReadingAnchor2(text) {
      return normalizeAnchorText(text).slice(0, MAX_ANCHOR_LENGTH);
    }
    function normalizeReadingPosition(value, filePath = "") {
      if (!value || typeof value !== "object") {
        return null;
      }
      const normalizedPath = String(filePath || value.filePath || "").trim().slice(0, 1024);
      const anchor = createReadingAnchor2(value.anchor);
      const kind = value.kind === "pdf" ? "pdf" : value.kind === "markdown" ? "markdown" : "";
      if (!normalizedPath || !anchor || !kind) {
        return null;
      }
      const pageNumber = kind === "pdf" ? Math.max(1, Math.floor(Number(value.pageNumber) || 1)) : null;
      return {
        anchor,
        chunkIndex: Math.max(0, Math.floor(Number(value.chunkIndex) || 0)),
        fileMtime: Math.max(0, Math.floor(Number(value.fileMtime) || 0)),
        filePath: normalizedPath,
        kind,
        pageNumber,
        updatedAt: Math.max(0, Math.floor(Number(value.updatedAt) || Date.now()))
      };
    }
    function normalizeReadingPositions2(value, maxEntries = MAX_READING_POSITIONS) {
      const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      const normalized = Object.entries(source).map(([filePath, position]) => normalizeReadingPosition(position, filePath)).filter(Boolean).sort((left, right) => right.updatedAt - left.updatedAt).slice(0, Math.max(1, Math.floor(Number(maxEntries) || MAX_READING_POSITIONS)));
      return Object.fromEntries(normalized.map((position) => [position.filePath, position]));
    }
    function upsertReadingPosition2(positions, position, maxEntries = MAX_READING_POSITIONS) {
      const normalized = normalizeReadingPosition(position, position && position.filePath);
      if (!normalized) {
        return normalizeReadingPositions2(positions, maxEntries);
      }
      return normalizeReadingPositions2({
        ...normalizeReadingPositions2(positions, maxEntries),
        [normalized.filePath]: normalized
      }, maxEntries);
    }
    function removeReadingPosition2(positions, filePath) {
      const normalized = normalizeReadingPositions2(positions);
      delete normalized[String(filePath || "")];
      return normalized;
    }
    function sliceTextFromReadingPosition2(text, position) {
      const normalizedText = normalizeAnchorText(text);
      const anchor = createReadingAnchor2(position && position.anchor);
      if (!normalizedText || !anchor) {
        return { matched: false, text: normalizedText };
      }
      const candidateLengths = [anchor.length, 140, 100, 72, 48, 32, 20, 12].map((length) => Math.min(anchor.length, length)).filter((length, index, values) => length >= 12 && values.indexOf(length) === index);
      const lowerText = normalizedText.toLocaleLowerCase();
      for (const length of candidateLengths) {
        const candidate = anchor.slice(0, length);
        let index = normalizedText.indexOf(candidate);
        if (index < 0) {
          index = lowerText.indexOf(candidate.toLocaleLowerCase());
        }
        if (index >= 0) {
          return { matched: true, text: normalizedText.slice(index) };
        }
      }
      return { matched: false, text: normalizedText };
    }
    module2.exports = {
      MAX_ANCHOR_LENGTH,
      MAX_READING_POSITIONS,
      createReadingAnchor: createReadingAnchor2,
      normalizeAnchorText,
      normalizeReadingPosition,
      normalizeReadingPositions: normalizeReadingPositions2,
      removeReadingPosition: removeReadingPosition2,
      sliceTextFromReadingPosition: sliceTextFromReadingPosition2,
      upsertReadingPosition: upsertReadingPosition2
    };
  }
});

// src/reading-position.js
var require_reading_position2 = __commonJS({
  "src/reading-position.js"(exports2, module2) {
    "use strict";
    var core = require_reading_position();
    function normalizeReadingPosition(value, filePath = "") {
      const normalized = core.normalizeReadingPosition(
        value && value.kind === "html" ? { ...value, kind: "markdown" } : value,
        filePath
      );
      if (normalized && value.kind === "html") normalized.kind = "html";
      return normalized;
    }
    function normalizeReadingPositions2(value, maxEntries) {
      const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      const htmlPaths = new Set(Object.entries(source).filter(([, entry]) => entry && entry.kind === "html").map(([key]) => String(key).trim().slice(0, 1024)));
      const adapted = Object.fromEntries(Object.entries(source).map(([key, entry]) => [
        key,
        entry && entry.kind === "html" ? { ...entry, kind: "markdown" } : entry
      ]));
      const normalized = core.normalizeReadingPositions(adapted, maxEntries);
      for (const [key, entry] of Object.entries(normalized)) {
        if (htmlPaths.has(key)) entry.kind = "html";
      }
      return normalized;
    }
    function upsertReadingPosition2(positions, value, maxEntries) {
      const normalized = normalizeReadingPosition(value, value && value.filePath);
      if (!normalized) return normalizeReadingPositions2(positions, maxEntries);
      return normalizeReadingPositions2({ ...normalizeReadingPositions2(positions, maxEntries), [normalized.filePath]: normalized }, maxEntries);
    }
    function removeReadingPosition2(positions, filePath) {
      const result = normalizeReadingPositions2(positions);
      delete result[String(filePath || "")];
      return result;
    }
    module2.exports = { ...core, normalizeReadingPosition, normalizeReadingPositions: normalizeReadingPositions2, upsertReadingPosition: upsertReadingPosition2, removeReadingPosition: removeReadingPosition2 };
  }
});

// node_modules/@laginae/note-reader-core/src/task-state.js
var require_task_state = __commonJS({
  "node_modules/@laginae/note-reader-core/src/task-state.js"(exports2, module2) {
    "use strict";
    var PHASE_TRANSITIONS = {
      idle: /* @__PURE__ */ new Set(["extracting", "queued"]),
      extracting: /* @__PURE__ */ new Set(["complete", "error", "paused", "playing", "queued", "stopping", "synthesizing"]),
      queued: /* @__PURE__ */ new Set(["complete", "error", "extracting", "paused", "playing", "stopping", "synthesizing"]),
      synthesizing: /* @__PURE__ */ new Set(["complete", "error", "extracting", "paused", "playing", "queued", "stopping"]),
      playing: /* @__PURE__ */ new Set(["complete", "error", "extracting", "paused", "queued", "stopping", "synthesizing"]),
      paused: /* @__PURE__ */ new Set(["error", "extracting", "playing", "queued", "stopping", "synthesizing"]),
      stopping: /* @__PURE__ */ new Set(["error", "idle"]),
      complete: /* @__PURE__ */ new Set(["extracting", "idle", "queued", "stopping"]),
      error: /* @__PURE__ */ new Set(["extracting", "idle", "queued", "stopping"])
    };
    function createTaskState2(sessionId, phase = "idle") {
      const normalizedPhase = Object.prototype.hasOwnProperty.call(PHASE_TRANSITIONS, phase) ? phase : "idle";
      return {
        phase: normalizedPhase,
        revision: 0,
        sessionId: Number(sessionId) || 0
      };
    }
    function canTransitionTaskState(fromPhase, toPhase) {
      if (fromPhase === toPhase) {
        return true;
      }
      const allowed = PHASE_TRANSITIONS[fromPhase];
      return Boolean(allowed && allowed.has(toPhase));
    }
    function transitionTaskState2(state, nextPhase, sessionId = state && state.sessionId) {
      const current = state || createTaskState2(sessionId);
      if (Number(sessionId) !== current.sessionId) {
        return current;
      }
      if (!Object.prototype.hasOwnProperty.call(PHASE_TRANSITIONS, nextPhase)) {
        throw new Error(`Unknown reading task phase: ${nextPhase}`);
      }
      if (!canTransitionTaskState(current.phase, nextPhase)) {
        throw new Error(`Invalid reading task transition: ${current.phase} -> ${nextPhase}`);
      }
      if (current.phase === nextPhase) {
        return current;
      }
      return {
        phase: nextPhase,
        revision: current.revision + 1,
        sessionId: current.sessionId
      };
    }
    module2.exports = {
      PHASE_TRANSITIONS,
      canTransitionTaskState,
      createTaskState: createTaskState2,
      transitionTaskState: transitionTaskState2
    };
  }
});

// src/task-state.js
var require_task_state2 = __commonJS({
  "src/task-state.js"(exports2, module2) {
    "use strict";
    module2.exports = require_task_state();
  }
});

// src/main.js
var { ItemView, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, SecretComponent, Setting, loadPdfJs, setIcon } = require("obsidian");
var crypto = require("crypto");
var fs = require("fs");
var https = require("https");
var os = require("os");
var path = require("path");
var { spawn } = require("child_process");
var { pathToFileURL } = require("url");
var { extractPdfTextLayout, extractTextFromPdfItems } = require_pdf_layout2();
var { MAX_HTML_BYTES, captureHtmlSelection, extractHtmlText, getHtmlReaderDocument, isHtmlFile } = require_html_text();
var { estimatePlayback, formatDuration } = require_playback_estimate();
var { getSpeechParts, adjacentSpeechPart, getSpeechPartTiming } = require_speech_parts();
var { MIMO_ENDPOINT, MIMO_DEFAULTS, MIMO_VOICES, MIMO_MAX_CHUNK_CHARS, normalizeMimoSettings, buildMimoRequestBody, decodeMimoAudio } = require_mimo_tts();
var {
  MAX_EXPORTED_AUDIO_BYTES,
  bufferToArrayBuffer,
  buildExportAudioFileName,
  mergeAudioFiles
} = require_audio_export();
var {
  createReadingAnchor,
  normalizeReadingPositions,
  removeReadingPosition,
  sliceTextFromReadingPosition,
  upsertReadingPosition
} = require_reading_position2();
var {
  createIncrementalSpeechChunker,
  parseChunkLimits,
  splitTextForSpeechChunks
} = require_semantic_chunker2();
var {
  createTaskState,
  transitionTaskState
} = require_task_state2();
var PLUGIN_ID = "note-reader-cosyvoice";
var VIEW_TYPE = "note-reader-cosyvoice-control";
var GITHUB_ISSUES_URL = "https://github.com/laginae/note-reader-cosyvoice/issues";
var AZURE_TTS_PRIVACY_URL = "https://learn.microsoft.com/azure/ai-foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security";
var DEFAULT_CHUNK_LIMITS = [40, 80, 120, 160, 280, 320];
var DEFAULT_ONLINE_CHUNK_LIMITS = [200, 400, 800];
var MAX_ONLINE_PREFETCH_CHUNKS = 1;
var DEFAULT_MATH_READING_LANGUAGE = "english";
var DEFAULT_EDGE_TTS_VOICE = "en-GB-RyanNeural";
var DEFAULT_EDGE_TTS_EXECUTABLE = "edge-tts";
var DEFAULT_AZURE_SPEECH_VOICE = "en-GB-RyanNeural";
var DEFAULT_OPENROUTER_TTS_MODEL = "fish-audio/s2.1-pro";
var DEFAULT_OPENROUTER_TTS_VOICE = "b7f1aae6de274690b20cfe990b953b67";
var AZURE_SPEECH_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
var OPENROUTER_TTS_ENDPOINT = "https://openrouter.ai/api/v1/audio/speech";
var RECOMMENDED_SCRIPT_PATH = "%LOCALAPPDATA%\\note-reader-cosyvoice\\cosyvoice-wrapper.ps1";
var SPEED_PRESETS = [1, 1.25, 1.5, 2, 1.1, 1.2, 1.3, 1.4];
var KEYBOARD_SEEK_SECONDS = 5;
var LATEX_FORMULA_MAX_CHARS = 12;
var MATH_READING_LANGUAGES = ["english", "chinese", "skip"];
var SETTINGS_LANGUAGES = ["english", "chinese"];
var AUDIO_EXPORT_LOCATIONS = ["obsidian-attachment", "note-folder", "custom-folder"];
var AUDIO_EXPORT_SCOPES = ["entire", "selection", "from-selection"];
var CREDENTIAL_SOURCES = ["obsidian-secret", "key-file"];
var SPEECH_ENGINES = ["local-cosyvoice", "edge-tts", "azure-speech", "openrouter-tts", "mimo-tts"];
var AZURE_SPEECH_CLOUDS = ["public", "china"];
var REMOTE_TTS_MAX_AUDIO_BYTES = 20 * 1024 * 1024;
var REMOTE_TTS_MAX_ATTEMPTS = 3;
var REMOTE_TTS_RETRY_DELAYS_MS = [750, 1500];
var REMOTE_TTS_RETRY_AFTER_MAX_MS = 1e4;
var REMOTE_TTS_RETRYABLE_STATUS_CODES = /* @__PURE__ */ new Set([408, 425, 429, 500, 502, 503, 504, 524, 529]);
var REMOTE_TTS_RETRYABLE_ERROR_CODES = /* @__PURE__ */ new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETRESET",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT"
]);
var RUNTIME_LOG_MAX_BYTES = 1024 * 1024;
var PDF_MAX_BYTES = 200 * 1024 * 1024;
var PDF_MAX_PAGES = 2e3;
var PDF_MAX_TEXT_CHARS = 5e6;
var OWNED_CACHE_FILE_PATTERN = /^\d{10,}-\d+-(?:\d+(?:-\d+)?|export)\.(?:txt|wav|mp3)$/i;
var MICROSOFT_VOICE_PRESETS = [
  ["zh-CN-XiaoxiaoNeural", "Mandarin Chinese - Xiaoxiao (female, warm)", "\u4E2D\u6587\u666E\u901A\u8BDD - \u5C0F\u6653\uFF08\u5973\u58F0\uFF0C\u6E29\u6696\uFF09"],
  ["zh-CN-XiaoyiNeural", "Mandarin Chinese - Xiaoyi (female, lively)", "\u4E2D\u6587\u666E\u901A\u8BDD - \u5C0F\u827A\uFF08\u5973\u58F0\uFF0C\u6D3B\u6CFC\uFF09"],
  ["zh-CN-YunxiNeural", "Mandarin Chinese - Yunxi (male, lively)", "\u4E2D\u6587\u666E\u901A\u8BDD - \u4E91\u5E0C\uFF08\u7537\u58F0\uFF0C\u6D3B\u6CFC\uFF09"],
  ["zh-CN-YunyangNeural", "Mandarin Chinese - Yunyang (male, professional)", "\u4E2D\u6587\u666E\u901A\u8BDD - \u4E91\u626C\uFF08\u7537\u58F0\uFF0C\u4E13\u4E1A\uFF09"],
  ["zh-HK-HiuMaanNeural", "Cantonese Chinese - HiuMaan (female)", "\u4E2D\u6587\u7CA4\u8BED - \u6653\u66FC\uFF08\u5973\u58F0\uFF09"],
  ["zh-TW-HsiaoChenNeural", "Taiwan Chinese - HsiaoChen (female)", "\u4E2D\u6587\u53F0\u6E7E - \u6653\u81FB\uFF08\u5973\u58F0\uFF09"],
  ["en-US-JennyNeural", "English (US) - Jenny (female)", "\u7F8E\u5F0F\u82F1\u8BED - Jenny\uFF08\u5973\u58F0\uFF09"],
  ["en-US-GuyNeural", "English (US) - Guy (male)", "\u7F8E\u5F0F\u82F1\u8BED - Guy\uFF08\u7537\u58F0\uFF09"],
  ["en-US-AriaNeural", "English (US) - Aria (female)", "\u7F8E\u5F0F\u82F1\u8BED - Aria\uFF08\u5973\u58F0\uFF09"],
  ["en-GB-SoniaNeural", "English (UK) - Sonia (female)", "\u82F1\u5F0F\u82F1\u8BED - Sonia\uFF08\u5973\u58F0\uFF09"],
  ["en-GB-RyanNeural", "English (UK) - Ryan (male)", "\u82F1\u5F0F\u82F1\u8BED - Ryan\uFF08\u7537\u58F0\uFF09"]
];
var OPENROUTER_TTS_MODELS = [
  [
    "microsoft/mai-voice-2.1-flash",
    "en-GB-Harry:MAI-Voice-2.1-Flash",
    "Microsoft MAI-Voice-2.1 Flash - low latency, UK English male default",
    "Microsoft MAI-Voice-2.1 Flash - \u4F4E\u5EF6\u8FDF\u3001\u9ED8\u8BA4\u82F1\u5F0F\u82F1\u8BED\u7537\u58F0",
    "A low-latency Microsoft model with 23 languages and 97 OpenRouter-listed voices. Defaults to UK English male Harry. Curated presets cover Mandarin, UK English and US English, with male and female choices. Currently $15 per million characters; every request still requires ZDR.",
    "\u5FAE\u8F6F\u4F4E\u5EF6\u8FDF\u8BED\u97F3\u6A21\u578B\uFF0C\u652F\u6301 23 \u79CD\u8BED\u8A00\uFF0COpenRouter \u5217\u51FA 97 \u4E2A\u97F3\u8272\u3002\u9ED8\u8BA4\u4F7F\u7528\u82F1\u5F0F\u82F1\u8BED\u7537\u58F0 Harry\uFF1B\u7CBE\u9009\u97F3\u8272\u8986\u76D6\u4E2D\u6587\u3001\u82F1\u5F0F\u548C\u7F8E\u5F0F\u82F1\u8BED\u7684\u7537\u5973\u58F0\u3002\u5F53\u524D\u6BCF\u767E\u4E07\u5B57\u7B26 $15\uFF1B\u6BCF\u6B21\u8BF7\u6C42\u4ECD\u5F3A\u5236 ZDR\u3002"
  ],
  [
    "microsoft/mai-voice-2-flash",
    "en-US-Ethan:MAI-Voice-2-Flash",
    "Microsoft MAI-Voice-2 Flash - low latency, US English male default",
    "Microsoft MAI-Voice-2 Flash - \u4F4E\u5EF6\u8FDF\u3001\u9ED8\u8BA4\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0",
    "A low-latency Microsoft model for responsive playback. Ethan is the US English male default from Microsoft's MAI catalog. It and the additional Microsoft-published voices are compatibility presets because OpenRouter does not list them all. For UK English presets, select MAI-Voice-2.1 Flash.",
    "\u5FAE\u8F6F\u4F4E\u5EF6\u8FDF\u8BED\u97F3\u6A21\u578B\uFF0C\u9002\u5408\u5FEB\u901F\u5F00\u59CB\u64AD\u653E\u3002\u9ED8\u8BA4\u4F7F\u7528\u5FAE\u8F6F MAI \u5B98\u65B9\u76EE\u5F55\u4E2D\u7684\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0 Ethan\uFF1BEthan \u53CA\u5176\u4ED6\u5FAE\u8F6F\u5B98\u65B9\u97F3\u8272\u5C5E\u4E8E\u517C\u5BB9\u9884\u8BBE\uFF0C\u56E0\u4E3A OpenRouter \u672A\u5B8C\u6574\u5217\u51FA\u3002\u9700\u8981\u82F1\u5F0F\u82F1\u8BED\u9884\u8BBE\u65F6\uFF0C\u53EF\u9009\u62E9 MAI-Voice-2.1 Flash\u3002"
  ],
  [
    "microsoft/mai-voice-2",
    "en-US-Ethan:MAI-Voice-2",
    "Microsoft MAI-Voice-2 - expressive, US English male default",
    "Microsoft MAI-Voice-2 - \u8868\u73B0\u529B\u5F3A\u3001\u9ED8\u8BA4\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0",
    "An expressive Microsoft model for natural long-form narration. Ethan is the US English male default. The plugin also offers other Microsoft-published English and Mandarin ShortNames as compatibility presets even when OpenRouter metadata omits them. For UK English presets, select MAI-Voice-2.1 Flash.",
    "\u5FAE\u8F6F\u8868\u73B0\u529B\u8BED\u97F3\u6A21\u578B\uFF0C\u9002\u5408\u81EA\u7136\u957F\u6587\u53D9\u8FF0\u3002\u9ED8\u8BA4\u4F7F\u7528\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0 Ethan\uFF1B\u63D2\u4EF6\u8FD8\u63D0\u4F9B OpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\u3001\u4F46\u7531\u5FAE\u8F6F\u5B98\u65B9\u53D1\u5E03\u7684\u5176\u4ED6\u82F1\u6587\u548C\u666E\u901A\u8BDD ShortName \u4F5C\u4E3A\u517C\u5BB9\u9884\u8BBE\u3002\u9700\u8981\u82F1\u5F0F\u82F1\u8BED\u9884\u8BBE\u65F6\uFF0C\u53EF\u9009\u62E9 MAI-Voice-2.1 Flash\u3002"
  ],
  [
    "google/gemini-3.1-flash-tts-preview",
    "Charon",
    "Google Gemini 3.1 Flash TTS Preview - 30 multilingual voices",
    "Google Gemini 3.1 Flash TTS \u9884\u89C8\u7248 - 30 \u4E2A\u591A\u8BED\u8A00\u97F3\u8272",
    "OpenRouter lists 30 multilingual voices. Charon is the informative default for academic reading. Google describes voices by delivery style rather than fixed gender or US/UK accent, so the plugin does not make an unsupported male or accent claim.",
    "OpenRouter \u5217\u51FA 30 \u4E2A\u591A\u8BED\u8A00\u97F3\u8272\u3002\u9ED8\u8BA4\u4F7F\u7528\u66F4\u9002\u5408\u5B66\u672F\u6717\u8BFB\u7684\u4FE1\u606F\u578B Charon\u3002Google \u6309\u6717\u8BFB\u98CE\u683C\u800C\u975E\u56FA\u5B9A\u6027\u522B\u6216\u82F1\u7F8E\u53E3\u97F3\u63CF\u8FF0\u97F3\u8272\uFF0C\u56E0\u6B64\u63D2\u4EF6\u4E0D\u4F1A\u628A\u67D0\u4E2A\u97F3\u8272\u65E0\u4F9D\u636E\u5730\u6807\u4E3A\u7537\u58F0\u6216\u7279\u5B9A\u53E3\u97F3\u3002"
  ],
  [
    "fish-audio/s2.1-pro",
    DEFAULT_OPENROUTER_TTS_VOICE,
    "Fish Audio S2.1 Pro - expressive multilingual narration, 6 voice presets",
    "Fish Audio S2.1 Pro - \u591A\u8BED\u8A00\u8868\u73B0\u529B\u6717\u8BFB\uFF0C\u63D0\u4F9B 6 \u79CD\u97F3\u8272\u9884\u8BBE",
    "Expressive multilingual narration with Fish Audio public voice IDs. Defaults to a measured UK English male voice. OpenRouter currently bills this model per UTF-8 byte, not per character.",
    "\u591A\u8BED\u8A00\u8868\u73B0\u529B\u6717\u8BFB\uFF0C\u4F7F\u7528 Fish Audio \u516C\u5F00\u97F3\u8272 ID\u3002\u9ED8\u8BA4\u9009\u62E9\u6C89\u7A33\u7684\u82F1\u5F0F\u82F1\u8BED\u7537\u58F0\u3002OpenRouter \u5F53\u524D\u6309 UTF-8 \u5B57\u8282\u800C\u975E\u5B57\u7B26\u8BA1\u8D39\u3002"
  ],
  [
    "hexgrad/kokoro-82m",
    "bm_george",
    "Kokoro 82M - low-cost multilingual TTS, 12 curated voices",
    "Kokoro 82M - \u4F4E\u6210\u672C\u591A\u8BED\u8A00\u8BED\u97F3\uFF0C\u63D0\u4F9B 12 \u79CD\u7CBE\u9009\u97F3\u8272",
    "A lightweight, low-cost model with preset voices for Chinese, US English, and UK English. OpenRouter lists provider-dependent rates; the lowest currently shown is about $0.62 per million characters, but the ZDR-eligible route may cost more.",
    "\u8F7B\u91CF\u4F4E\u6210\u672C\u6A21\u578B\uFF0C\u9884\u8BBE\u8986\u76D6\u4E2D\u6587\u3001\u7F8E\u5F0F\u82F1\u8BED\u548C\u82F1\u5F0F\u82F1\u8BED\u3002OpenRouter \u6309\u4F9B\u5E94\u5546\u663E\u793A\u4E0D\u540C\u8D39\u7387\uFF1B\u5F53\u524D\u9875\u9762\u6700\u4F4E\u7EA6\u4E3A\u6BCF\u767E\u4E07\u5B57\u7B26 $0.62\uFF0C\u4F46\u7B26\u5408 ZDR \u7684\u5B9E\u9645\u8DEF\u7531\u53EF\u80FD\u66F4\u8D35\u3002"
  ]
];
var OPENROUTER_TTS_PRESETS = [
  // IDs verified in OpenRouter's speech + ZDR catalog on 2026-10-02.
  ["microsoft/mai-voice-2.1-flash", "en-GB-Harry:MAI-Voice-2.1-Flash", "Harry (UK English male, default)", "Harry\uFF08\u82F1\u5F0F\u82F1\u8BED\u7537\u58F0\uFF0C\u9ED8\u8BA4\uFF09"],
  ["microsoft/mai-voice-2.1-flash", "en-GB-Emily:MAI-Voice-2.1-Flash", "Emily (UK English female)", "Emily\uFF08\u82F1\u5F0F\u82F1\u8BED\u5973\u58F0\uFF09"],
  ["microsoft/mai-voice-2.1-flash", "en-US-Ethan:MAI-Voice-2.1-Flash", "Ethan (US English male)", "Ethan\uFF08\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0\uFF09"],
  ["microsoft/mai-voice-2.1-flash", "en-US-Grant:MAI-Voice-2.1-Flash", "Grant (US English male)", "Grant\uFF08\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0\uFF09"],
  ["microsoft/mai-voice-2.1-flash", "en-US-Harper:MAI-Voice-2.1-Flash", "Harper (US English female)", "Harper\uFF08\u7F8E\u5F0F\u82F1\u8BED\u5973\u58F0\uFF09"],
  ["microsoft/mai-voice-2.1-flash", "en-US-Olivia:MAI-Voice-2.1-Flash", "Olivia (US English female)", "Olivia\uFF08\u7F8E\u5F0F\u82F1\u8BED\u5973\u58F0\uFF09"],
  ["microsoft/mai-voice-2.1-flash", "zh-CN-Bo:MAI-Voice-2.1-Flash", "Bo (Mandarin male)", "Bo\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u7537\u58F0\uFF09"],
  ["microsoft/mai-voice-2.1-flash", "zh-CN-Wei:MAI-Voice-2.1-Flash", "Wei (Mandarin male)", "Wei\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u7537\u58F0\uFF09"],
  ["microsoft/mai-voice-2.1-flash", "zh-CN-Lan:MAI-Voice-2.1-Flash", "Lan (Mandarin female)", "Lan\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u5973\u58F0\uFF09"],
  ["microsoft/mai-voice-2.1-flash", "zh-CN-Mei:MAI-Voice-2.1-Flash", "Mei (Mandarin female)", "Mei\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u5973\u58F0\uFF09"],
  ["microsoft/mai-voice-2-flash", "en-US-Ethan:MAI-Voice-2-Flash", "Ethan (US English male; not listed in OpenRouter metadata)", "Ethan\uFF08\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2-flash", "en-US-Olivia:MAI-Voice-2-Flash", "Olivia (US English female; Microsoft compatibility preset)", "Olivia\uFF08\u7F8E\u5F0F\u82F1\u8BED\u5973\u58F0\uFF1B\u5FAE\u8F6F\u517C\u5BB9\u9884\u8BBE\uFF09"],
  ["microsoft/mai-voice-2-flash", "zh-CN-Bo:MAI-Voice-2-Flash", "Bo (Mandarin male; not listed in OpenRouter metadata)", "Bo\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u7537\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2-flash", "zh-CN-Wei:MAI-Voice-2-Flash", "Wei (Mandarin male; not listed in OpenRouter metadata)", "Wei\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u7537\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2-flash", "zh-CN-Lan:MAI-Voice-2-Flash", "Lan (Mandarin female; not listed in OpenRouter metadata)", "Lan\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u5973\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2-flash", "zh-CN-Mei:MAI-Voice-2-Flash", "Mei (Mandarin female; not listed in OpenRouter metadata)", "Mei\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u5973\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2-flash", "en-US-Harper:MAI-Voice-2", "Harper (US English female; OpenRouter-listed ID)", "Harper\uFF08\u7F8E\u5F0F\u82F1\u8BED\u5973\u58F0\uFF1BOpenRouter \u5DF2\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2-flash", "es-MX-Valeria:MAI-Voice-2", "Valeria (Mexican Spanish)", "Valeria\uFF08\u58A8\u897F\u54E5\u897F\u73ED\u7259\u8BED\uFF09"],
  ["microsoft/mai-voice-2-flash", "fr-FR-Soleil:MAI-Voice-2", "Soleil (French)", "Soleil\uFF08\u6CD5\u8BED\uFF09"],
  ["microsoft/mai-voice-2-flash", "de-DE-Klaus:MAI-Voice-2", "Klaus (German)", "Klaus\uFF08\u5FB7\u8BED\uFF09"],
  ["microsoft/mai-voice-2", "en-US-Ethan:MAI-Voice-2", "Ethan (US English male; not listed in OpenRouter metadata)", "Ethan\uFF08\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2", "en-US-Grant:MAI-Voice-2", "Grant (US English male; Microsoft compatibility preset)", "Grant\uFF08\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0\uFF1B\u5FAE\u8F6F\u517C\u5BB9\u9884\u8BBE\uFF09"],
  ["microsoft/mai-voice-2", "en-US-Jasper:MAI-Voice-2", "Jasper (US English male; Microsoft compatibility preset)", "Jasper\uFF08\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0\uFF1B\u5FAE\u8F6F\u517C\u5BB9\u9884\u8BBE\uFF09"],
  ["microsoft/mai-voice-2", "zh-CN-Bo:MAI-Voice-2", "Bo (Mandarin male; not listed in OpenRouter metadata)", "Bo\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u7537\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2", "zh-CN-Lan:MAI-Voice-2", "Lan (Mandarin female; not listed in OpenRouter metadata)", "Lan\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u5973\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2", "zh-CN-Mei:MAI-Voice-2", "Mei (Mandarin female; not listed in OpenRouter metadata)", "Mei\uFF08\u4E2D\u6587\u666E\u901A\u8BDD\u5973\u58F0\uFF1BOpenRouter \u5143\u6570\u636E\u672A\u5217\u51FA\uFF09"],
  ["microsoft/mai-voice-2", "en-US-Harper:MAI-Voice-2", "Harper (US English)", "Harper\uFF08\u7F8E\u5F0F\u82F1\u8BED\uFF09"],
  ["microsoft/mai-voice-2", "es-MX-Valeria:MAI-Voice-2", "Valeria (Mexican Spanish)", "Valeria\uFF08\u58A8\u897F\u54E5\u897F\u73ED\u7259\u8BED\uFF09"],
  ["microsoft/mai-voice-2", "fr-FR-Soleil:MAI-Voice-2", "Soleil (French)", "Soleil\uFF08\u6CD5\u8BED\uFF09"],
  ["microsoft/mai-voice-2", "de-DE-Klaus:MAI-Voice-2", "Klaus (German)", "Klaus\uFF08\u5FB7\u8BED\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Charon", "Charon (multilingual, informative)", "Charon\uFF08\u591A\u8BED\u8A00\uFF0C\u4FE1\u606F\u578B\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Rasalgethi", "Rasalgethi (multilingual, informative)", "Rasalgethi\uFF08\u591A\u8BED\u8A00\uFF0C\u4FE1\u606F\u578B\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Sadaltager", "Sadaltager (multilingual, knowledgeable)", "Sadaltager\uFF08\u591A\u8BED\u8A00\uFF0C\u535A\u5B66\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Schedar", "Schedar (multilingual, even)", "Schedar\uFF08\u591A\u8BED\u8A00\uFF0C\u5E73\u7A33\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Iapetus", "Iapetus (multilingual, clear)", "Iapetus\uFF08\u591A\u8BED\u8A00\uFF0C\u6E05\u6670\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Erinome", "Erinome (multilingual, clear)", "Erinome\uFF08\u591A\u8BED\u8A00\uFF0C\u6E05\u6670\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Kore", "Kore (multilingual, firm)", "Kore\uFF08\u591A\u8BED\u8A00\uFF0C\u575A\u5B9A\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Orus", "Orus (multilingual, firm)", "Orus\uFF08\u591A\u8BED\u8A00\uFF0C\u575A\u5B9A\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Gacrux", "Gacrux (multilingual, mature)", "Gacrux\uFF08\u591A\u8BED\u8A00\uFF0C\u6210\u719F\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Sulafat", "Sulafat (multilingual, warm)", "Sulafat\uFF08\u591A\u8BED\u8A00\uFF0C\u6E29\u6696\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Vindemiatrix", "Vindemiatrix (multilingual, gentle)", "Vindemiatrix\uFF08\u591A\u8BED\u8A00\uFF0C\u6E29\u548C\uFF09"],
  ["google/gemini-3.1-flash-tts-preview", "Aoede", "Aoede (multilingual, breezy)", "Aoede\uFF08\u591A\u8BED\u8A00\uFF0C\u8F7B\u5FEB\uFF09"],
  ["fish-audio/s2.1-pro", "36ef842120654ee6b38ef43c8f08535a", "Mandarin male - deep, formal narration", "\u4E2D\u6587\u7537\u58F0 - \u6D51\u539A\u3001\u6B63\u5F0F\u65C1\u767D"],
  ["fish-audio/s2.1-pro", "89ca9f5f239946d6b20cdc49bdd40ff7", "Mandarin female - calm storytelling", "\u4E2D\u6587\u5973\u58F0 - \u5E73\u9759\u53D9\u8FF0"],
  ["fish-audio/s2.1-pro", "653bbd5adbe34b3d8c867a5311f461c4", "US English male - calm, measured narrator", "\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0 - \u6C89\u7A33\u3001\u8BED\u901F\u5E73\u7F13"],
  ["fish-audio/s2.1-pro", "552756381a5044ba916aeb596ed443bb", "US English female - clear, measured narrator", "\u7F8E\u5F0F\u82F1\u8BED\u5973\u58F0 - \u6E05\u6670\u3001\u8BED\u901F\u5E73\u7F13"],
  ["fish-audio/s2.1-pro", "b7f1aae6de274690b20cfe990b953b67", "UK English male - measured narrator (default)", "\u82F1\u5F0F\u82F1\u8BED\u7537\u58F0 - \u6C89\u7A33\u65C1\u767D\uFF08\u9ED8\u8BA4\uFF09"],
  ["fish-audio/s2.1-pro", "7fe3682ee0e44dc88d1b12000cc15268", "UK English female - calm, informative narrator", "\u82F1\u5F0F\u82F1\u8BED\u5973\u58F0 - \u5E73\u9759\u3001\u4FE1\u606F\u578B\u65C1\u767D"],
  ["hexgrad/kokoro-82m", "zf_xiaoxiao", "Xiaoxiao (Chinese female)", "\u5C0F\u6653\uFF08\u4E2D\u6587\u5973\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "zf_xiaoyi", "Xiaoyi (Chinese female)", "\u5C0F\u827A\uFF08\u4E2D\u6587\u5973\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "zm_yunjian", "Yunjian (Chinese male)", "\u4E91\u5065\uFF08\u4E2D\u6587\u7537\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "zm_yunyang", "Yunyang (Chinese male)", "\u4E91\u626C\uFF08\u4E2D\u6587\u7537\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "af_heart", "Heart (US English female)", "Heart\uFF08\u7F8E\u5F0F\u82F1\u8BED\u5973\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "af_bella", "Bella (US English female)", "Bella\uFF08\u7F8E\u5F0F\u82F1\u8BED\u5973\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "am_michael", "Michael (US English male)", "Michael\uFF08\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "am_fenrir", "Fenrir (US English male)", "Fenrir\uFF08\u7F8E\u5F0F\u82F1\u8BED\u7537\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "bf_emma", "Emma (UK English female)", "Emma\uFF08\u82F1\u5F0F\u82F1\u8BED\u5973\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "bf_isabella", "Isabella (UK English female)", "Isabella\uFF08\u82F1\u5F0F\u82F1\u8BED\u5973\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "bm_george", "George (UK English male)", "George\uFF08\u82F1\u5F0F\u82F1\u8BED\u7537\u58F0\uFF09"],
  ["hexgrad/kokoro-82m", "bm_fable", "Fable (UK English male)", "Fable\uFF08\u82F1\u5F0F\u82F1\u8BED\u7537\u58F0\uFF09"]
];
var SETTINGS_UI_TEXT = {
  english: {
    settingsLanguageName: "Settings language",
    settingsLanguageDesc: "Choose the language for settings and reader controls.",
    settingsLanguageEnglish: "English",
    settingsLanguageChinese: "\u4E2D\u6587",
    speechEngineName: "Speech engine",
    speechEngineDesc: "Choose local CosyVoice, Edge, Azure, OpenRouter, or Xiaomi MiMo TTS. Online modes send text to their service providers.",
    speechEngineLocal: "Local CosyVoice",
    speechEngineEdge: "Microsoft Edge online voice",
    speechEngineAzure: "Microsoft Azure Speech",
    speechEngineOpenRouter: "OpenRouter TTS",
    localScriptName: "CosyVoice script",
    localScriptDesc: "PowerShell wrapper used in Local CosyVoice mode.",
    edgeConsentName: "Allow Edge online processing",
    edgeConsentDesc: "Required for Edge mode. Each text chunk is sent to Microsoft Edge TTS. The edge-tts interface used here does not provide an explicit ZDR guarantee for this plugin; keep this off for private or sensitive notes.",
    edgeExecutableName: "Edge TTS executable",
    edgeExecutableDesc: "Use an absolute edge-tts.exe path to avoid PATH ambiguity. The default value resolves edge-tts from the Obsidian process PATH.",
    edgeCommonVoicesName: "Common Edge TTS voices",
    edgeCommonVoicesDesc: "Common Chinese, US English, and UK English online voices. Selecting one fills the Voice ID below.",
    customVoiceOption: "Custom voice ID",
    edgeVoiceName: "Edge TTS voice",
    edgeVoiceDesc: "Voice ID used by Edge mode. Keep a preset above or enter any ID returned by edge-tts --list-voices.",
    azureConsentName: "Allow Azure online processing",
    azureConsentDesc: "Required for Azure mode. Each text chunk is sent by HTTPS to the selected Azure Speech cloud and region. Keep this off for private notes unless that processing is acceptable.",
    azurePrivacyName: "Azure real-time privacy",
    azurePrivacyDesc: "This plugin uses Azure's real-time prebuilt-voice API. Microsoft states that input text and output audio are not retained or stored, so no separate privacy switch is required in Azure. Text is still processed in the selected Azure region. This does not cover batch synthesis, custom voice, or avatar services.",
    azurePrivacyButton: "Microsoft privacy statement",
    azurePrivacyTooltip: "Open Microsoft's text-to-speech privacy statement",
    credentialSourceName: "API key storage",
    credentialSourceDesc: "Use Obsidian SecretStorage on Obsidian 1.11.4 or later, or keep a one-line key file outside the vault as a compatibility fallback.",
    credentialSourceSecret: "Obsidian SecretStorage (recommended)",
    credentialSourceFile: "External one-line key file",
    secretStorageUnavailableName: "Obsidian SecretStorage unavailable",
    secretStorageUnavailableDesc: "Update Obsidian to 1.11.4 or later, or select the external key-file option.",
    azureCloudName: "Azure cloud",
    azureCloudDesc: "Select the cloud that owns the Speech resource and subscription key.",
    azurePublicCloud: "Azure public cloud",
    azureChinaCloud: "Azure China operated by 21Vianet",
    azureRegionName: "Azure Speech region",
    azureRegionDesc: "Region identifier from the Azure resource, for example eastasia, southeastasia, chinaeast2, or chinanorth3.",
    azureKeyFileName: "Azure Speech key file",
    azureKeyFileDesc: "Compatibility fallback: absolute path to a one-line Speech resource key file outside the Obsidian vault. The key itself is not saved in data.json.",
    azureSecretName: "Azure Speech secret",
    azureSecretDesc: "Select or create an Obsidian secret containing the Speech resource key. Only the secret name is saved in data.json.",
    azureCommonVoicesName: "Common Azure Speech voices",
    azureCommonVoicesDesc: "Common Chinese, US English, and UK English Azure voices. Selecting one fills the Voice ID below.",
    azureVoiceName: "Azure Speech voice",
    azureVoiceDesc: "Prebuilt Azure Speech voice ID, for example zh-CN-XiaoxiaoNeural or en-US-JennyNeural.",
    openRouterConsentName: "Allow OpenRouter online processing",
    openRouterConsentDesc: "Required for OpenRouter mode. This permits sending text to OpenRouter and an eligible upstream TTS provider, but never relaxes ZDR routing.",
    openRouterKeyFileName: "OpenRouter API key file",
    openRouterKeyFileDesc: "Compatibility fallback: absolute path to a one-line OpenRouter API key file outside the Obsidian vault. The key itself is not saved in data.json.",
    openRouterSecretName: "OpenRouter API secret",
    openRouterSecretDesc: "Select or create an Obsidian secret containing the OpenRouter API key. Only the secret name is saved in data.json.",
    openRouterModelsName: "ZDR-compatible OpenRouter TTS models",
    openRouterModelsDesc: "Built-in choices verified against OpenRouter's speech and ZDR model filter for this release. Availability can change; every request still enforces ZDR.",
    customModelOption: "Custom model ID",
    openRouterModelName: "OpenRouter TTS model",
    openRouterModelDesc: "Speech-output model ID. A custom model works only when OpenRouter has an eligible ZDR endpoint for it.",
    openRouterModelInfoName: "Selected model characteristics",
    customModelInfo: "Custom model: check its language, voice, and speech-output support in OpenRouter. The request fails if no ZDR endpoint is eligible.",
    openRouterVoicesName: "Common voices for this model",
    openRouterVoicesDesc: "Model-specific presets are listed. MAI-Voice-2 also includes Microsoft-published Mandarin IDs that OpenRouter may accept even when its supported_voices metadata omits them; availability can vary by endpoint.",
    openRouterVoiceName: "OpenRouter TTS voice",
    openRouterVoiceDesc: "Voice ID supported by the selected model. Voice catalogs differ between models.",
    openRouterVoiceHelpName: "Find a custom voice ID",
    openRouterVoiceHelpDesc: "Open the model page and voice catalog to find an ID, then select Custom voice and paste it into OpenRouter TTS voice. MAI requires the full model suffix, for example en-GB-Harry:MAI-Voice-2.1-Flash. Confirm the ID is accepted by the selected OpenRouter model; catalogs can include voices not exposed by its endpoint.",
    openRouterModelPageButton: "Model page",
    openRouterVoiceCatalogButton: "Voice catalog",
    openRouterVoiceHelpTooltip: "Open the official reference for the currently selected model",
    openRouterPrivacyName: "OpenRouter privacy routing",
    openRouterPrivacyDesc: "Always enforced: provider.zdr is true and provider data collection is denied. The plugin never falls back to a non-ZDR endpoint. Keep OpenRouter account-level input/output logging and data sharing disabled for private content.",
    speedName: "Synthesis speed",
    speedDesc: "Synthesis speed for new segments only; playing and already prepared audio remain unchanged. MiMo treats speed as an instruction, not an exact rate.",
    chunkLimitsName: "Local chunk limits",
    chunkLimitsDesc: "Character limits for Local CosyVoice. The first segment plays in up to three audio parts: complete sentences reaching 20 characters, then 40 more, then the remainder (excluding whitespace). It remains one segment in the progress bar.",
    onlineChunkLimitsName: "Online chunk limits",
    onlineChunkLimitsDesc: "Used by Edge, Azure, OpenRouter, and MiMo for notes, PDFs and HTML (default 200,400,800). The first segment plays in up to three audio parts: sentences reaching 20 characters, then 40 more, then the remainder. It remains one visible segment; this can add up to two requests. Prefetch counts audio parts.",
    onlinePrefetchName: "Online synthesis prefetch",
    onlinePrefetchDesc: "How many future audio parts an online engine may synthesize early, including the smaller parts inside the first segment. Default 1; choose 0 for strict on-demand synthesis.",
    onlinePrefetchNone: "0 - synthesize only when needed",
    onlinePrefetchOne: "1 - prefetch one chunk",
    audioExportLocationName: "Audio export save location",
    audioExportLocationDesc: "Choose where audio exported from notes, PDFs or HTML is saved. The confirmation dialog shows the selected scope and planned vault path before synthesis starts.",
    audioExportLocationAttachment: "Obsidian attachment folder (default)",
    audioExportLocationNote: "Same folder as the note",
    audioExportLocationCustom: "Custom folder in this vault",
    audioExportFolderName: "Custom audio folder",
    audioExportFolderDesc: "Enter a vault-relative folder such as Audio exports. Absolute paths and parent-directory segments are rejected.",
    audioExportFolderPlaceholder: "Audio exports",
    stripMarkdownName: "Strip Markdown",
    stripMarkdownDesc: "Remove frontmatter, links, headings, embeds, and common formatting before synthesis.",
    mathLanguageName: "Math reading language",
    mathLanguageDesc: "Choose how short LaTeX formulas are verbalized. Long formulas are skipped in all modes.",
    mathEnglish: "English",
    mathChinese: "Chinese",
    mathSkip: "Skip math",
    rememberPositionName: "Remember reading position",
    rememberPositionDesc: "Off by default. When enabled, the plugin stores only the file path, page or chunk number, a short text anchor, and a timestamp. It never stores the note, PDF or HTML body in reading history.",
    clearPositionsName: "Clear saved reading positions",
    clearPositionsDesc: "Remove all saved resume anchors without changing speech settings or API credentials.",
    clearPositionsButton: "Clear positions",
    positionsClearedNotice: "CosyVoice: saved reading positions cleared.",
    cleanupName: "Clean temporary audio",
    cleanupDesc: "Delete temporary text and audio after reading, and clear stale files when the plugin starts. Temporary data is stored outside the Obsidian vault.",
    diagnosticName: "Diagnostic logging",
    diagnosticDesc: "Off by default. When enabled, only bounded failure metadata is stored in the system temporary directory; note names and child-process output are excluded.",
    clearTemporaryName: "Clear temporary data",
    clearTemporaryDesc: "Stop reading and remove plugin-owned temporary text, audio, legacy cache files, and diagnostic logs now.",
    clearNowButton: "Clear now",
    restoreDefaultsName: "Restore default settings",
    restoreDefaultsDesc: "Reset every setting on this page to its default value and save immediately.",
    restoreDefaultsButton: "Restore defaults",
    settingsRestoredNotice: "CosyVoice: settings restored to defaults.",
    temporaryDataClearedNotice: "CosyVoice: temporary text, audio, and diagnostic logs cleared.",
    feedbackName: "Feedback and bug reports",
    feedbackDesc: "Open GitHub Issues to report a problem, request a feature, or follow existing reports. Do not include API keys or private note text.",
    feedbackButton: "Open GitHub Issues",
    feedbackTooltip: "Open the feedback page in your browser",
    commandsFooter: "Commands also include resume the current file, seek backward or forward 5 seconds, and move to the previous or next reading chunk."
  },
  chinese: {
    settingsLanguageName: "\u8BBE\u7F6E\u754C\u9762\u8BED\u8A00",
    settingsLanguageDesc: "\u9009\u62E9\u63D2\u4EF6\u8BBE\u7F6E\u548C\u6717\u8BFB\u63A7\u5236\u9762\u677F\u4F7F\u7528\u7684\u8BED\u8A00\u3002",
    settingsLanguageEnglish: "English",
    settingsLanguageChinese: "\u4E2D\u6587",
    speechEngineName: "\u8BED\u97F3\u5F15\u64CE",
    speechEngineDesc: "\u9009\u62E9\u672C\u5730 CosyVoice\u3001Edge\u3001Azure\u3001OpenRouter \u6216\u5C0F\u7C73 MiMo TTS\u3002\u5728\u7EBF\u6A21\u5F0F\u4F1A\u628A\u6587\u672C\u53D1\u9001\u7ED9\u76F8\u5E94\u670D\u52A1\u5546\u3002",
    speechEngineLocal: "\u672C\u5730 CosyVoice",
    speechEngineEdge: "Microsoft Edge \u5728\u7EBF\u8BED\u97F3",
    speechEngineAzure: "Microsoft Azure Speech",
    speechEngineOpenRouter: "OpenRouter TTS",
    localScriptName: "CosyVoice \u811A\u672C",
    localScriptDesc: "\u672C\u5730 CosyVoice \u6A21\u5F0F\u4F7F\u7528\u7684 PowerShell \u5305\u88C5\u811A\u672C\u3002",
    edgeConsentName: "\u5141\u8BB8 Edge \u5728\u7EBF\u5904\u7406",
    edgeConsentDesc: "Edge \u6A21\u5F0F\u5FC5\u987B\u5F00\u542F\u3002\u6BCF\u4E2A\u6587\u672C\u5206\u6BB5\u90FD\u4F1A\u53D1\u9001\u7ED9 Microsoft Edge TTS\u3002\u672C\u63D2\u4EF6\u4F7F\u7528\u7684 edge-tts \u8C03\u7528\u63A5\u53E3\u672A\u5BF9\u672C\u63D2\u4EF6\u8BF7\u6C42\u63D0\u4F9B\u660E\u786E\u7684 ZDR \u4FDD\u8BC1\uFF1B\u79C1\u5BC6\u6216\u654F\u611F\u7B14\u8BB0\u5EFA\u8BAE\u4FDD\u6301\u5173\u95ED\u3002",
    edgeExecutableName: "Edge TTS \u53EF\u6267\u884C\u6587\u4EF6",
    edgeExecutableDesc: "\u5EFA\u8BAE\u586B\u5199 edge-tts.exe \u7684\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u907F\u514D PATH \u6307\u5411\u4E0D\u660E\u786E\u3002\u9ED8\u8BA4\u503C\u4ECE Obsidian \u8FDB\u7A0B\u7684 PATH \u4E2D\u67E5\u627E edge-tts\u3002",
    edgeCommonVoicesName: "\u5E38\u7528 Edge TTS \u97F3\u8272",
    edgeCommonVoicesDesc: "\u5E38\u7528\u4E2D\u6587\u3001\u7F8E\u5F0F\u82F1\u8BED\u548C\u82F1\u5F0F\u82F1\u8BED\u5728\u7EBF\u97F3\u8272\u3002\u9009\u62E9\u540E\u4F1A\u81EA\u52A8\u586B\u5199\u4E0B\u65B9\u7684\u97F3\u8272 ID\u3002",
    customVoiceOption: "\u81EA\u5B9A\u4E49\u97F3\u8272 ID",
    edgeVoiceName: "Edge TTS \u97F3\u8272",
    edgeVoiceDesc: "Edge \u6A21\u5F0F\u4F7F\u7528\u7684\u97F3\u8272 ID\u3002\u53EF\u4F7F\u7528\u4E0A\u65B9\u9884\u8BBE\uFF0C\u6216\u586B\u5199 edge-tts --list-voices \u8FD4\u56DE\u7684\u4EFB\u610F ID\u3002",
    azureConsentName: "\u5141\u8BB8 Azure \u5728\u7EBF\u5904\u7406",
    azureConsentDesc: "Azure \u6A21\u5F0F\u5FC5\u987B\u5F00\u542F\u3002\u6BCF\u4E2A\u6587\u672C\u5206\u6BB5\u4F1A\u901A\u8FC7 HTTPS \u53D1\u9001\u5230\u6240\u9009 Azure Speech \u4E91\u73AF\u5883\u548C\u533A\u57DF\u3002\u9664\u975E\u53EF\u4EE5\u63A5\u53D7\u8BE5\u5904\u7406\uFF0C\u5426\u5219\u79C1\u5BC6\u7B14\u8BB0\u5E94\u4FDD\u6301\u5173\u95ED\u3002",
    azurePrivacyName: "Azure \u5B9E\u65F6\u63A5\u53E3\u9690\u79C1\u8BF4\u660E",
    azurePrivacyDesc: "\u672C\u63D2\u4EF6\u4F7F\u7528 Azure \u5B9E\u65F6\u9884\u6784\u5EFA\u97F3\u8272\u63A5\u53E3\u3002Microsoft \u8868\u793A\u8F93\u5165\u6587\u672C\u548C\u8F93\u51FA\u97F3\u9891\u4E0D\u4F1A\u88AB\u4FDD\u7559\u6216\u5B58\u50A8\uFF0C\u65E0\u9700\u5728 Azure \u95E8\u6237\u989D\u5916\u5F00\u542F\u72EC\u7ACB\u9690\u79C1\u5F00\u5173\uFF1B\u6587\u672C\u4ECD\u4F1A\u53D1\u9001\u5230\u6240\u9009 Azure \u533A\u57DF\u5904\u7406\u3002\u6B64\u8BF4\u660E\u4E0D\u9002\u7528\u4E8E\u6279\u91CF\u5408\u6210\u3001\u5B9A\u5236\u97F3\u8272\u6216\u865A\u62DF\u4EBA\u670D\u52A1\u3002",
    azurePrivacyButton: "\u67E5\u770B Microsoft \u9690\u79C1\u8BF4\u660E",
    azurePrivacyTooltip: "\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00 Microsoft \u5B98\u65B9\u9690\u79C1\u8BF4\u660E",
    credentialSourceName: "API \u5BC6\u94A5\u5B58\u50A8\u65B9\u5F0F",
    credentialSourceDesc: "Obsidian 1.11.4 \u53CA\u4EE5\u4E0A\u7248\u672C\u5EFA\u8BAE\u4F7F\u7528 SecretStorage\uFF1B\u4E5F\u53EF\u4EE5\u7EE7\u7EED\u4F7F\u7528 Obsidian \u5E93\u5916\u7684\u5355\u884C\u5BC6\u94A5\u6587\u4EF6\u4F5C\u4E3A\u517C\u5BB9\u56DE\u9000\u3002",
    credentialSourceSecret: "Obsidian SecretStorage\uFF08\u63A8\u8350\uFF09",
    credentialSourceFile: "\u5E93\u5916\u5355\u884C\u5BC6\u94A5\u6587\u4EF6",
    secretStorageUnavailableName: "Obsidian SecretStorage \u4E0D\u53EF\u7528",
    secretStorageUnavailableDesc: "\u8BF7\u628A Obsidian \u66F4\u65B0\u5230 1.11.4 \u6216\u66F4\u9AD8\u7248\u672C\uFF0C\u6216\u6539\u9009\u5E93\u5916\u5BC6\u94A5\u6587\u4EF6\u3002",
    azureCloudName: "Azure \u4E91\u73AF\u5883",
    azureCloudDesc: "\u9009\u62E9 Speech \u8D44\u6E90\u548C\u8BA2\u9605\u5BC6\u94A5\u6240\u5C5E\u7684\u4E91\u73AF\u5883\u3002",
    azurePublicCloud: "Azure \u516C\u6709\u4E91",
    azureChinaCloud: "\u7531\u4E16\u7EAA\u4E92\u8054\u8FD0\u8425\u7684 Azure \u4E2D\u56FD\u533A",
    azureRegionName: "Azure Speech \u533A\u57DF",
    azureRegionDesc: "Azure \u8D44\u6E90\u4E2D\u7684\u533A\u57DF\u6807\u8BC6\uFF0C\u4F8B\u5982 eastasia\u3001southeastasia\u3001chinaeast2 \u6216 chinanorth3\u3002",
    azureKeyFileName: "Azure Speech \u5BC6\u94A5\u6587\u4EF6",
    azureKeyFileDesc: "\u517C\u5BB9\u56DE\u9000\u65B9\u5F0F\uFF1A\u586B\u5199 Obsidian \u5E93\u5916\u5355\u884C Speech \u8D44\u6E90\u5BC6\u94A5\u6587\u4EF6\u7684\u7EDD\u5BF9\u8DEF\u5F84\u3002\u5BC6\u94A5\u672C\u8EAB\u4E0D\u4F1A\u4FDD\u5B58\u5230 data.json\u3002",
    azureSecretName: "Azure Speech \u79D8\u5BC6",
    azureSecretDesc: "\u9009\u62E9\u6216\u521B\u5EFA\u4E00\u4E2A\u4FDD\u5B58 Speech \u8D44\u6E90\u5BC6\u94A5\u7684 Obsidian \u79D8\u5BC6\u3002data.json \u53EA\u4FDD\u5B58\u79D8\u5BC6\u540D\u79F0\uFF0C\u4E0D\u4FDD\u5B58\u5BC6\u94A5\u503C\u3002",
    azureCommonVoicesName: "\u5E38\u7528 Azure Speech \u97F3\u8272",
    azureCommonVoicesDesc: "\u5E38\u7528\u4E2D\u6587\u3001\u7F8E\u5F0F\u82F1\u8BED\u548C\u82F1\u5F0F\u82F1\u8BED Azure \u97F3\u8272\u3002\u9009\u62E9\u540E\u4F1A\u81EA\u52A8\u586B\u5199\u4E0B\u65B9\u7684\u97F3\u8272 ID\u3002",
    azureVoiceName: "Azure Speech \u97F3\u8272",
    azureVoiceDesc: "Azure Speech \u9884\u6784\u5EFA\u97F3\u8272 ID\uFF0C\u4F8B\u5982 zh-CN-XiaoxiaoNeural \u6216 en-US-JennyNeural\u3002",
    openRouterConsentName: "\u5141\u8BB8 OpenRouter \u5728\u7EBF\u5904\u7406",
    openRouterConsentDesc: "OpenRouter \u6A21\u5F0F\u5FC5\u987B\u5F00\u542F\u3002\u5B83\u53EA\u8868\u793A\u5141\u8BB8\u628A\u6587\u672C\u53D1\u9001\u7ED9 OpenRouter \u53CA\u7B26\u5408\u6761\u4EF6\u7684\u4E0A\u6E38 TTS \u670D\u52A1\u5546\uFF0C\u4E0D\u4F1A\u653E\u5BBD ZDR \u8DEF\u7531\u3002",
    openRouterKeyFileName: "OpenRouter API \u5BC6\u94A5\u6587\u4EF6",
    openRouterKeyFileDesc: "\u517C\u5BB9\u56DE\u9000\u65B9\u5F0F\uFF1A\u586B\u5199 Obsidian \u5E93\u5916\u5355\u884C OpenRouter API \u5BC6\u94A5\u6587\u4EF6\u7684\u7EDD\u5BF9\u8DEF\u5F84\u3002\u5BC6\u94A5\u672C\u8EAB\u4E0D\u4F1A\u4FDD\u5B58\u5230 data.json\u3002",
    openRouterSecretName: "OpenRouter API \u79D8\u5BC6",
    openRouterSecretDesc: "\u9009\u62E9\u6216\u521B\u5EFA\u4E00\u4E2A\u4FDD\u5B58 OpenRouter API \u5BC6\u94A5\u7684 Obsidian \u79D8\u5BC6\u3002data.json \u53EA\u4FDD\u5B58\u79D8\u5BC6\u540D\u79F0\uFF0C\u4E0D\u4FDD\u5B58\u5BC6\u94A5\u503C\u3002",
    openRouterModelsName: "\u652F\u6301 ZDR \u7684 OpenRouter TTS \u6A21\u578B",
    openRouterModelsDesc: "\u5185\u7F6E\u9009\u9879\u5DF2\u6309\u672C\u7248\u672C\u53D1\u5E03\u65F6 OpenRouter \u7684\u8BED\u97F3\u4E0E ZDR \u6A21\u578B\u8FC7\u6EE4\u7ED3\u679C\u6838\u5BF9\u3002\u53EF\u7528\u6027\u53EF\u80FD\u53D8\u5316\uFF0C\u4F46\u6BCF\u6B21\u8BF7\u6C42\u4ECD\u4F1A\u5F3A\u5236\u4F7F\u7528 ZDR\u3002",
    customModelOption: "\u81EA\u5B9A\u4E49\u6A21\u578B ID",
    openRouterModelName: "OpenRouter TTS \u6A21\u578B",
    openRouterModelDesc: "\u652F\u6301\u8BED\u97F3\u8F93\u51FA\u7684\u6A21\u578B ID\u3002\u81EA\u5B9A\u4E49\u6A21\u578B\u53EA\u6709\u5728 OpenRouter \u5B58\u5728\u7B26\u5408\u6761\u4EF6\u7684 ZDR \u7AEF\u70B9\u65F6\u624D\u80FD\u4F7F\u7528\u3002",
    openRouterModelInfoName: "\u6240\u9009\u6A21\u578B\u7279\u70B9",
    customModelInfo: "\u81EA\u5B9A\u4E49\u6A21\u578B\uFF1A\u8BF7\u5728 OpenRouter \u6838\u5BF9\u5176\u8BED\u8A00\u3001\u97F3\u8272\u548C\u8BED\u97F3\u8F93\u51FA\u80FD\u529B\uFF1B\u5982\u679C\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684 ZDR \u7AEF\u70B9\uFF0C\u8BF7\u6C42\u4F1A\u5931\u8D25\u3002",
    openRouterVoicesName: "\u8BE5\u6A21\u578B\u7684\u5E38\u7528\u97F3\u8272",
    openRouterVoicesDesc: "\u8FD9\u91CC\u53EA\u5217\u51FA\u4E0E\u6240\u9009\u6A21\u578B\u5BF9\u5E94\u7684\u9884\u8BBE\u3002MAI-Voice-2 \u8FD8\u52A0\u5165\u4E86\u5FAE\u8F6F\u5B98\u65B9\u53D1\u5E03\u3001\u4F46 OpenRouter supported_voices \u5143\u6570\u636E\u53EF\u80FD\u9057\u6F0F\u7684\u666E\u901A\u8BDD\u97F3\u8272\uFF1B\u5B9E\u9645\u53EF\u7528\u6027\u53EF\u80FD\u968F\u7AEF\u70B9\u53D8\u5316\u3002",
    openRouterVoiceName: "OpenRouter TTS \u97F3\u8272",
    openRouterVoiceDesc: "\u6240\u9009\u6A21\u578B\u652F\u6301\u7684\u97F3\u8272 ID\u3002\u4E0D\u540C\u6A21\u578B\u7684\u97F3\u8272\u76EE\u5F55\u5E76\u4E0D\u76F8\u540C\u3002",
    openRouterVoiceHelpName: "\u67E5\u8BE2\u81EA\u5B9A\u4E49\u97F3\u8272 ID",
    openRouterVoiceHelpDesc: "\u6253\u5F00\u6A21\u578B\u9875\u9762\u548C\u97F3\u8272\u76EE\u5F55\u67E5\u8BE2 ID\uFF0C\u9009\u62E9\u201C\u81EA\u5B9A\u4E49\u97F3\u8272\u201D\u540E\u586B\u5165\u201COpenRouter TTS \u97F3\u8272\u201D\u3002MAI \u5FC5\u987B\u5305\u542B\u5B8C\u6574\u6A21\u578B\u540E\u7F00\uFF0C\u4F8B\u5982 en-GB-Harry:MAI-Voice-2.1-Flash\u3002\u8BF7\u786E\u8BA4\u8BE5 ID \u53EF\u7528\u4E8E\u6240\u9009 OpenRouter \u6A21\u578B\uFF1B\u5B98\u65B9\u76EE\u5F55\u4E2D\u7684\u90E8\u5206\u97F3\u8272\u53EF\u80FD\u5C1A\u672A\u7531\u5BF9\u5E94\u7AEF\u70B9\u5F00\u653E\u3002",
    openRouterModelPageButton: "\u6A21\u578B\u9875\u9762",
    openRouterVoiceCatalogButton: "\u97F3\u8272\u76EE\u5F55",
    openRouterVoiceHelpTooltip: "\u6253\u5F00\u5F53\u524D\u6240\u9009\u6A21\u578B\u7684\u5B98\u65B9\u67E5\u8BE2\u8D44\u6599",
    openRouterPrivacyName: "OpenRouter \u9690\u79C1\u8DEF\u7531",
    openRouterPrivacyDesc: "\u59CB\u7EC8\u5F3A\u5236\u6267\u884C\uFF1Aprovider.zdr \u4E3A true\uFF0C\u5E76\u62D2\u7EDD\u4F9B\u5E94\u5546\u6536\u96C6\u6570\u636E\u3002\u63D2\u4EF6\u4E0D\u4F1A\u964D\u7EA7\u5230\u975E ZDR \u7AEF\u70B9\u3002\u6717\u8BFB\u79C1\u5BC6\u5185\u5BB9\u65F6\uFF0C\u8FD8\u5E94\u5173\u95ED OpenRouter \u8D26\u6237\u7EA7\u8F93\u5165\u8F93\u51FA\u65E5\u5FD7\u548C\u6570\u636E\u5171\u4EAB\u3002",
    speedName: "\u5408\u6210\u8BED\u901F",
    speedDesc: "\u4EC5\u5BF9\u65B0\u5408\u6210\u7684\u5206\u6BB5\u751F\u6548\uFF0C\u6B63\u5728\u64AD\u653E\u53CA\u5DF2\u9884\u5408\u6210\u7684\u97F3\u9891\u4E0D\u53D8\u3002MiMo \u5C06\u901F\u5EA6\u4F5C\u4E3A\u6307\u4EE4\u7406\u89E3\uFF0C\u5E76\u975E\u7CBE\u786E\u500D\u901F\u3002",
    chunkLimitsName: "\u672C\u5730\u5206\u6BB5\u957F\u5EA6",
    chunkLimitsDesc: "\u672C\u5730 CosyVoice \u7684\u5B57\u7B26\u6570\u4E0A\u9650\uFF0C\u4EE5\u82F1\u6587\u9017\u53F7\u5206\u9694\u3002\u7B2C\u4E00\u6BB5\u5185\u90E8\u6309\u6574\u53E5\u7D2F\u52A0\u81F3 20 \u5B57\uFF0C\u518D\u4ECE\u5269\u4F59\u5185\u5BB9\u7D2F\u52A0\u81F3 40 \u5B57\uFF0C\u6700\u540E\u5408\u6210\u4F59\u6587\uFF08\u4E0D\u8BA1\u7A7A\u767D\uFF09\uFF0C\u6700\u591A\u4E09\u6BB5\u97F3\u9891\uFF1B\u8FDB\u5EA6\u6761\u4ECD\u663E\u793A\u4E3A\u540C\u4E00\u6BB5\u3002",
    onlineChunkLimitsName: "\u5728\u7EBF\u5206\u6BB5\u957F\u5EA6",
    onlineChunkLimitsDesc: "Edge\u3001Azure\u3001OpenRouter \u548C MiMo \u6717\u8BFB\u7B14\u8BB0\u3001PDF \u6216 HTML \u65F6\u4F7F\u7528\uFF08\u9ED8\u8BA4 200,400,800\uFF09\u3002\u7B2C\u4E00\u6BB5\u5185\u90E8\u6309\u6574\u53E5\u7D2F\u52A0\u81F3 20 \u5B57\uFF0C\u518D\u7D2F\u52A0\u65B0\u7684 40 \u5B57\uFF0C\u6700\u540E\u5408\u6210\u4F59\u6587\uFF08\u4E0D\u8BA1\u7A7A\u767D\uFF09\uFF0C\u754C\u9762\u4ECD\u663E\u793A\u540C\u4E00\u6BB5\u3002\u6700\u591A\u589E\u52A0\u4E24\u6B21\u8BF7\u6C42\uFF0C\u9884\u5408\u6210\u6570\u91CF\u6309\u5C0F\u97F3\u9891\u8BA1\u7B97\u3002",
    onlinePrefetchName: "\u5728\u7EBF\u5408\u6210\u9884\u53D6",
    onlinePrefetchDesc: "\u5141\u8BB8\u5728\u7EBF\u5F15\u64CE\u63D0\u524D\u5408\u6210\u7684\u540E\u7EED\u97F3\u9891\u6570\u91CF\uFF0C\u7B2C\u4E00\u6BB5\u5185\u90E8\u7684\u5C0F\u97F3\u9891\u4E5F\u5404\u7B97\u4E00\u6B21\u3002\u9ED8\u8BA4 1\uFF1B\u9009\u62E9 0 \u53EF\u4E25\u683C\u6309\u9700\u5408\u6210\u3002",
    onlinePrefetchNone: "0 - \u9700\u8981\u65F6\u624D\u5408\u6210",
    onlinePrefetchOne: "1 - \u63D0\u524D\u5408\u6210\u4E00\u6BB5",
    audioExportLocationName: "\u97F3\u9891\u5BFC\u51FA\u4FDD\u5B58\u4F4D\u7F6E",
    audioExportLocationDesc: "\u9009\u62E9\u4ECE\u7B14\u8BB0\u3001PDF \u6216 HTML \u5BFC\u51FA\u7684\u97F3\u9891\u4FDD\u5B58\u4F4D\u7F6E\u3002\u5F00\u59CB\u5408\u6210\u524D\uFF0C\u786E\u8BA4\u7A97\u53E3\u4F1A\u663E\u793A\u6240\u9009\u8303\u56F4\u548C\u9884\u8BA1\u7684\u5E93\u5185\u8DEF\u5F84\u3002",
    audioExportLocationAttachment: "Obsidian \u9644\u4EF6\u76EE\u5F55\uFF08\u9ED8\u8BA4\uFF09",
    audioExportLocationNote: "\u4E0E\u539F\u7B14\u8BB0\u76F8\u540C\u7684\u76EE\u5F55",
    audioExportLocationCustom: "\u672C\u5E93\u5185\u7684\u81EA\u5B9A\u4E49\u76EE\u5F55",
    audioExportFolderName: "\u81EA\u5B9A\u4E49\u97F3\u9891\u76EE\u5F55",
    audioExportFolderDesc: "\u586B\u5199\u5E93\u5185\u76F8\u5BF9\u76EE\u5F55\uFF0C\u4F8B\u5982\u201C\u5BFC\u51FA\u97F3\u9891\u201D\u3002\u4E0D\u5141\u8BB8\u7EDD\u5BF9\u8DEF\u5F84\u6216\u8FD4\u56DE\u4E0A\u7EA7\u76EE\u5F55\u7684\u8DEF\u5F84\u3002",
    audioExportFolderPlaceholder: "\u5BFC\u51FA\u97F3\u9891",
    stripMarkdownName: "\u79FB\u9664 Markdown \u683C\u5F0F",
    stripMarkdownDesc: "\u5408\u6210\u524D\u79FB\u9664 frontmatter\u3001\u94FE\u63A5\u3001\u6807\u9898\u3001\u5D4C\u5165\u5185\u5BB9\u548C\u5E38\u89C1\u683C\u5F0F\u6807\u8BB0\u3002",
    mathLanguageName: "\u6570\u5B66\u516C\u5F0F\u6717\u8BFB\u8BED\u8A00",
    mathLanguageDesc: "\u9009\u62E9\u77ED LaTeX \u516C\u5F0F\u7684\u6717\u8BFB\u65B9\u5F0F\u3002\u6240\u6709\u6A21\u5F0F\u90FD\u4F1A\u8DF3\u8FC7\u8FC7\u957F\u516C\u5F0F\u3002",
    mathEnglish: "\u82F1\u8BED",
    mathChinese: "\u4E2D\u6587",
    mathSkip: "\u8DF3\u8FC7\u516C\u5F0F",
    rememberPositionName: "\u8BB0\u4F4F\u6717\u8BFB\u4F4D\u7F6E",
    rememberPositionDesc: "\u9ED8\u8BA4\u5173\u95ED\u3002\u5F00\u542F\u540E\u53EA\u4FDD\u5B58\u6587\u4EF6\u8DEF\u5F84\u3001\u9875\u7801\u6216\u5206\u6BB5\u5E8F\u53F7\u3001\u77ED\u6587\u672C\u951A\u70B9\u548C\u65F6\u95F4\uFF0C\u4E0D\u4F1A\u628A\u7B14\u8BB0\u3001PDF \u6216 HTML \u6B63\u6587\u4FDD\u5B58\u5230\u6717\u8BFB\u5386\u53F2\u4E2D\u3002",
    clearPositionsName: "\u6E05\u9664\u5DF2\u4FDD\u5B58\u7684\u6717\u8BFB\u4F4D\u7F6E",
    clearPositionsDesc: "\u5220\u9664\u5168\u90E8\u7EE7\u7EED\u6717\u8BFB\u951A\u70B9\uFF0C\u4E0D\u6539\u53D8\u8BED\u97F3\u8BBE\u7F6E\u6216 API \u51ED\u636E\u3002",
    clearPositionsButton: "\u6E05\u9664\u4F4D\u7F6E",
    positionsClearedNotice: "CosyVoice\uFF1A\u5DF2\u6E05\u9664\u4FDD\u5B58\u7684\u6717\u8BFB\u4F4D\u7F6E\u3002",
    cleanupName: "\u6E05\u7406\u4E34\u65F6\u97F3\u9891",
    cleanupDesc: "\u6717\u8BFB\u540E\u5220\u9664\u4E34\u65F6\u6587\u672C\u548C\u97F3\u9891\uFF0C\u5E76\u5728\u63D2\u4EF6\u542F\u52A8\u65F6\u6E05\u7406\u8FC7\u671F\u6587\u4EF6\u3002\u4E34\u65F6\u6570\u636E\u4FDD\u5B58\u5728 Obsidian \u5E93\u5916\u3002",
    diagnosticName: "\u8BCA\u65AD\u65E5\u5FD7",
    diagnosticDesc: "\u9ED8\u8BA4\u5173\u95ED\u3002\u5F00\u542F\u540E\u53EA\u5728\u7CFB\u7EDF\u4E34\u65F6\u76EE\u5F55\u4FDD\u5B58\u6709\u5927\u5C0F\u9650\u5236\u7684\u5931\u8D25\u5143\u6570\u636E\uFF0C\u4E0D\u5305\u542B\u7B14\u8BB0\u540D\u79F0\u6216\u5B50\u8FDB\u7A0B\u8F93\u51FA\u3002",
    clearTemporaryName: "\u6E05\u9664\u4E34\u65F6\u6570\u636E",
    clearTemporaryDesc: "\u7ACB\u5373\u505C\u6B62\u6717\u8BFB\uFF0C\u5E76\u5220\u9664\u672C\u63D2\u4EF6\u4EA7\u751F\u7684\u4E34\u65F6\u6587\u672C\u3001\u97F3\u9891\u3001\u65E7\u7F13\u5B58\u6587\u4EF6\u548C\u8BCA\u65AD\u65E5\u5FD7\u3002",
    clearNowButton: "\u7ACB\u5373\u6E05\u9664",
    restoreDefaultsName: "\u6062\u590D\u9ED8\u8BA4\u8BBE\u7F6E",
    restoreDefaultsDesc: "\u628A\u672C\u9875\u9762\u7684\u6240\u6709\u8BBE\u7F6E\u6062\u590D\u4E3A\u9ED8\u8BA4\u503C\u5E76\u7ACB\u5373\u4FDD\u5B58\u3002",
    restoreDefaultsButton: "\u6062\u590D\u9ED8\u8BA4\u503C",
    settingsRestoredNotice: "CosyVoice\uFF1A\u8BBE\u7F6E\u5DF2\u6062\u590D\u4E3A\u9ED8\u8BA4\u503C\u3002",
    temporaryDataClearedNotice: "CosyVoice\uFF1A\u4E34\u65F6\u6587\u672C\u3001\u97F3\u9891\u548C\u8BCA\u65AD\u65E5\u5FD7\u5DF2\u6E05\u9664\u3002",
    feedbackName: "\u53CD\u9988\u4E0E\u95EE\u9898\u62A5\u544A",
    feedbackDesc: "\u6253\u5F00 GitHub Issues \u62A5\u544A\u95EE\u9898\u3001\u63D0\u51FA\u529F\u80FD\u5EFA\u8BAE\u6216\u67E5\u770B\u73B0\u6709\u53CD\u9988\u3002\u8BF7\u52FF\u63D0\u4EA4 API \u5BC6\u94A5\u6216\u79C1\u5BC6\u7B14\u8BB0\u6B63\u6587\u3002",
    feedbackButton: "\u6253\u5F00 GitHub Issues",
    feedbackTooltip: "\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00\u53CD\u9988\u9875\u9762",
    commandsFooter: "\u547D\u4EE4\u8FD8\u5305\u62EC\u4ECE\u5F53\u524D\u6587\u4EF6\u4FDD\u5B58\u7684\u4F4D\u7F6E\u7EE7\u7EED\u6717\u8BFB\u3001\u540E\u9000\u6216\u524D\u8FDB 5 \u79D2\uFF0C\u4EE5\u53CA\u8DF3\u5230\u4E0A\u4E00\u4E2A\u6216\u4E0B\u4E00\u4E2A\u6717\u8BFB\u5206\u6BB5\u3002"
  }
};
var LATEX_COMMAND_REPLACEMENTS = {
  chinese: [
    ["\\rightarrow", "\u5230"],
    ["\\leftarrow", "\u5230"],
    ["\\approx", "\u7EA6\u7B49\u4E8E"],
    ["\\times", "\u4E58\u4EE5"],
    ["\\cdot", "\u70B9\u4E58"],
    ["\\leq", "\u5C0F\u4E8E\u7B49\u4E8E"],
    ["\\geq", "\u5927\u4E8E\u7B49\u4E8E"],
    ["\\neq", "\u4E0D\u7B49\u4E8E"],
    ["\\ne", "\u4E0D\u7B49\u4E8E"],
    ["\\le", "\u5C0F\u4E8E\u7B49\u4E8E"],
    ["\\ge", "\u5927\u4E8E\u7B49\u4E8E"],
    ["\\pm", "\u6B63\u8D1F"],
    ["\\mp", "\u8D1F\u6B63"],
    ["\\infty", "\u65E0\u7A77"],
    ["\\alpha", "alpha"],
    ["\\beta", "beta"],
    ["\\gamma", "gamma"],
    ["\\delta", "delta"],
    ["\\epsilon", "epsilon"],
    ["\\theta", "theta"],
    ["\\lambda", "lambda"],
    ["\\mu", "mu"],
    ["\\pi", "pi"],
    ["\\sigma", "sigma"],
    ["\\omega", "omega"],
    ["\\sum", "\u6C42\u548C"],
    ["\\int", "\u79EF\u5206"],
    ["\\to", "\u5230"],
    ["\\left", ""],
    ["\\right", ""]
  ],
  english: [
    ["\\rightarrow", "to"],
    ["\\leftarrow", "from"],
    ["\\approx", "approximately equal to"],
    ["\\times", "times"],
    ["\\cdot", "dot"],
    ["\\leq", "less than or equal to"],
    ["\\geq", "greater than or equal to"],
    ["\\neq", "not equal to"],
    ["\\ne", "not equal to"],
    ["\\le", "less than or equal to"],
    ["\\ge", "greater than or equal to"],
    ["\\pm", "plus or minus"],
    ["\\mp", "minus or plus"],
    ["\\infty", "infinity"],
    ["\\alpha", "alpha"],
    ["\\beta", "beta"],
    ["\\gamma", "gamma"],
    ["\\delta", "delta"],
    ["\\epsilon", "epsilon"],
    ["\\theta", "theta"],
    ["\\lambda", "lambda"],
    ["\\mu", "mu"],
    ["\\pi", "pi"],
    ["\\sigma", "sigma"],
    ["\\omega", "omega"],
    ["\\sum", "sum"],
    ["\\int", "integral"],
    ["\\to", "to"],
    ["\\left", ""],
    ["\\right", ""]
  ]
};
var DEFAULT_SETTINGS = {
  settingsLanguage: "english",
  scriptPath: resolveDefaultScriptPath(),
  speechEngine: "local-cosyvoice",
  audioExportLocation: "obsidian-attachment",
  audioExportFolder: "",
  edgeTtsConsent: false,
  edgeTtsExecutable: DEFAULT_EDGE_TTS_EXECUTABLE,
  edgeTtsVoice: DEFAULT_EDGE_TTS_VOICE,
  azureSpeechCloud: "public",
  azureSpeechConsent: false,
  azureSpeechCredentialSource: "obsidian-secret",
  azureSpeechKeyPath: "",
  azureSpeechRegion: "",
  azureSpeechSecretName: "",
  azureSpeechVoice: DEFAULT_AZURE_SPEECH_VOICE,
  openRouterConsent: false,
  openRouterCredentialSource: "obsidian-secret",
  openRouterKeyPath: "",
  openRouterModel: DEFAULT_OPENROUTER_TTS_MODEL,
  openRouterSecretName: "",
  openRouterVoice: DEFAULT_OPENROUTER_TTS_VOICE,
  speed: 1,
  stripMarkdown: true,
  cleanupCache: true,
  diagnosticLogging: false,
  mathReadingLanguage: DEFAULT_MATH_READING_LANGUAGE,
  chunkLimits: DEFAULT_CHUNK_LIMITS.join(","),
  onlineChunkLimits: DEFAULT_ONLINE_CHUNK_LIMITS.join(","),
  onlinePrefetchChunks: 1,
  rememberReadingPosition: false,
  readingPositions: {}
};
function normalizeLineBreaks(text) {
  return String(text || "").replace(/\r\n?/g, "\n");
}
function isPdfFile(file) {
  return Boolean(file && String(file.extension || "").toLowerCase() === "pdf");
}
function getPdfFileIdentity(file) {
  return String(file && (file.path || file.name) || "");
}
function getFileMtime(file) {
  return Math.max(0, Math.floor(Number(file && file.stat && file.stat.mtime) || 0));
}
function getPdfPageInfoFromNode(node, root) {
  let element = node && node.nodeType === 1 ? node : node && node.parentElement;
  while (element) {
    const getAttribute = typeof element.getAttribute === "function" ? (name) => element.getAttribute(name) : () => null;
    const pageNumberValue = getAttribute("data-page-number");
    const pageNumber = Number(pageNumberValue);
    if (pageNumberValue !== null && Number.isInteger(pageNumber) && pageNumber >= 1) {
      return { element, pageNumber };
    }
    const pageIndexValue = getAttribute("data-page-index");
    const pageIndex = Number(pageIndexValue);
    if (pageIndexValue !== null && Number.isInteger(pageIndex) && pageIndex >= 0) {
      return { element, pageNumber: pageIndex + 1 };
    }
    const identity = `${getAttribute("id") || ""} ${getAttribute("aria-label") || ""}`;
    const identityMatch = /(?:pageContainer|page[-_]|\bpage\s+)(\d+)\b/i.exec(identity);
    if (identityMatch) {
      return { element, pageNumber: Number(identityMatch[1]) };
    }
    if (element === root) {
      break;
    }
    element = element.parentElement;
  }
  return null;
}
function getPdfPageNumberFromNode(node, root) {
  const pageInfo = getPdfPageInfoFromNode(node, root);
  return pageInfo ? pageInfo.pageNumber : null;
}
function getFirstRangeRect(range) {
  if (!range) {
    return null;
  }
  try {
    if (typeof range.getClientRects === "function") {
      const rects = range.getClientRects();
      if (rects && rects.length) {
        return rects[0];
      }
    }
    if (typeof range.getBoundingClientRect === "function") {
      return range.getBoundingClientRect();
    }
  } catch (error) {
    return null;
  }
  return null;
}
function getPdfSelectionPosition(range, pageElement) {
  if (!range || !pageElement || typeof pageElement.getBoundingClientRect !== "function") {
    return null;
  }
  let pageRect;
  try {
    pageRect = pageElement.getBoundingClientRect();
  } catch (error) {
    return null;
  }
  const pageLeft = Number(pageRect && pageRect.left);
  const pageTop = Number(pageRect && pageRect.top);
  const pageWidth = Number(pageRect && pageRect.width);
  const pageHeight = Number(pageRect && pageRect.height);
  if (![pageLeft, pageTop, pageWidth, pageHeight].every(Number.isFinite) || pageWidth <= 0 || pageHeight <= 0) {
    return null;
  }
  let selectionRect = null;
  if (typeof range.cloneRange === "function") {
    try {
      const startRange = range.cloneRange();
      if (startRange && typeof startRange.collapse === "function") {
        startRange.collapse(true);
        selectionRect = getFirstRangeRect(startRange);
      }
    } catch (error) {
      selectionRect = null;
    }
  }
  const isRectInsidePage = (rect) => {
    const left = Number(rect && rect.left);
    const top = Number(rect && rect.top);
    const width = Math.max(0, Number(rect && rect.width) || 0);
    const height = Math.max(0, Number(rect && rect.height) || 0);
    return Number.isFinite(left) && Number.isFinite(top) && (width > 0 || height > 0) && left >= pageLeft - 2 && left <= pageLeft + pageWidth + 2 && top >= pageTop - 2 && top <= pageTop + pageHeight + 2;
  };
  if (!isRectInsidePage(selectionRect)) {
    selectionRect = getFirstRangeRect(range);
  }
  if (!isRectInsidePage(selectionRect)) {
    return null;
  }
  const selectionLeft = Number(selectionRect.left);
  const selectionTop = Number(selectionRect.top);
  const selectionHeight = Math.max(0, Number(selectionRect.height) || 0);
  const clampRatio = (value) => Math.max(0, Math.min(1, value));
  return {
    xRatio: clampRatio((selectionLeft - pageLeft) / pageWidth),
    yRatio: clampRatio((selectionTop + selectionHeight / 2 - pageTop) / pageHeight)
  };
}
function getPdfSelectionContext(selection, leaves, fallbackFile = null, capturedAt = Date.now()) {
  if (!selection || typeof selection.toString !== "function" || typeof selection.getRangeAt !== "function") {
    return null;
  }
  const selectedText = selection.toString().trim();
  if (!selectedText || Number(selection.rangeCount) < 1) {
    return null;
  }
  let range;
  try {
    range = selection.getRangeAt(0);
  } catch (error) {
    return null;
  }
  const startNode = range && range.startContainer;
  if (!startNode) {
    return null;
  }
  for (const leaf of Array.isArray(leaves) ? leaves : []) {
    const view = leaf && leaf.view;
    const root = view && (view.containerEl || view.contentEl);
    if (!root || typeof root.contains !== "function" || !root.contains(startNode)) {
      continue;
    }
    const file = isPdfFile(view.file) ? view.file : fallbackFile;
    if (!isPdfFile(file)) {
      continue;
    }
    const pageInfo = getPdfPageInfoFromNode(startNode, root);
    if (!pageInfo) {
      continue;
    }
    const selectionPosition = getPdfSelectionPosition(range, pageInfo.element);
    return {
      capturedAt: Number(capturedAt) || Date.now(),
      filePath: getPdfFileIdentity(file),
      pageNumber: pageInfo.pageNumber,
      selectedText: selectedText.slice(0, 2e3),
      ...selectionPosition ? { selectionPosition } : {}
    };
  }
  return null;
}
function normalizePdfSelectionText(text) {
  return normalizeLineBreaks(text).normalize("NFKC").replace(/\u00ad/g, "").replace(/([A-Za-z])-\s+(?=[a-z])/g, "$1").replace(/\s+/g, " ").trim();
}
function createNormalizedPdfLayoutMap(layout) {
  const sourceLines = layout && Array.isArray(layout.lines) ? layout.lines : [];
  const lines = [];
  let text = "";
  for (const sourceLine of sourceLines) {
    const lineText = normalizePdfSelectionText(sourceLine && sourceLine.text);
    if (!lineText) {
      continue;
    }
    let start = 0;
    if (text) {
      if (/[A-Za-z]-$/.test(text) && /^[a-z]/.test(lineText)) {
        text = text.slice(0, -1);
        start = text.length;
      } else {
        text += " ";
        start = text.length;
      }
    }
    text += lineText;
    lines.push({
      ...sourceLine,
      normalizedEnd: text.length,
      normalizedStart: start
    });
  }
  return { lines, text };
}
function getPdfSpatialLineAnchor(pageText, layout, selectionPosition) {
  const xRatio = Number(selectionPosition && selectionPosition.xRatio);
  const yRatio = Number(selectionPosition && selectionPosition.yRatio);
  const pageWidth = Number(layout && layout.pageWidth);
  const pageHeight = Number(layout && layout.pageHeight);
  if (![xRatio, yRatio, pageWidth, pageHeight].every(Number.isFinite) || xRatio < 0 || xRatio > 1 || yRatio < 0 || yRatio > 1 || pageWidth <= 0 || pageHeight <= 0) {
    return null;
  }
  const mapped = createNormalizedPdfLayoutMap(layout);
  if (!mapped.lines.length || mapped.text !== pageText) {
    return null;
  }
  const targetX = xRatio * pageWidth;
  const targetY = (1 - yRatio) * pageHeight;
  let best = null;
  for (const line of mapped.lines) {
    const xMin = Number(line.xMin);
    const xMax = Number(line.xMax);
    const y = Number(line.y);
    if (![xMin, xMax, y].every(Number.isFinite)) {
      continue;
    }
    const horizontalDistance = targetX < xMin ? xMin - targetX : targetX > xMax ? targetX - xMax : 0;
    const verticalDistance = Math.abs(targetY - y);
    const score = verticalDistance + horizontalDistance * 0.4;
    if (!best || score < best.score) {
      best = { horizontalDistance, line, score, verticalDistance };
    }
  }
  if (!best || best.verticalDistance > Math.max(24, pageHeight * 0.04) || best.horizontalDistance > Math.max(30, pageWidth * 0.12)) {
    return null;
  }
  return best.line.normalizedStart;
}
function findPdfSelectionMatchIndices(pageLower, candidateLower) {
  const indexes = [];
  let searchFrom = 0;
  while (candidateLower && searchFrom <= pageLower.length) {
    const index = pageLower.indexOf(candidateLower, searchFrom);
    if (index < 0) {
      break;
    }
    indexes.push(index);
    searchFrom = index + 1;
  }
  return indexes;
}
function slicePdfTextFromSelection(pageText, selectedText, options = {}) {
  const page = normalizePdfSelectionText(pageText);
  const selected = normalizePdfSelectionText(selectedText);
  if (!page || !selected) {
    return { matched: false, text: page };
  }
  const spatialAnchor = getPdfSpatialLineAnchor(
    page,
    options.layout,
    options.selectionPosition
  );
  const minimumCandidateLength = spatialAnchor === null ? 8 : 2;
  const candidateLengths = [selected.length, 400, 240, 160, 100, 60, 30, 16, 8, 4, 2].map((length) => Math.min(selected.length, length)).filter((length, index, values) => length >= minimumCandidateLength && values.indexOf(length) === index);
  const pageLower = page.toLocaleLowerCase();
  for (const length of candidateLengths) {
    const candidate = selected.slice(0, length);
    if (spatialAnchor === null) {
      let matchIndex = page.indexOf(candidate);
      if (matchIndex < 0) {
        matchIndex = pageLower.indexOf(candidate.toLocaleLowerCase());
      }
      if (matchIndex >= 0) {
        return { matched: true, text: page.slice(matchIndex) };
      }
      continue;
    }
    const matchIndices = findPdfSelectionMatchIndices(
      pageLower,
      candidate.toLocaleLowerCase()
    );
    if (!matchIndices.length) {
      continue;
    }
    const closestIndex = matchIndices.reduce((closest, current) => Math.abs(current - spatialAnchor) < Math.abs(closest - spatialAnchor) ? current : closest);
    if (Math.abs(closestIndex - spatialAnchor) <= Math.max(240, selected.length)) {
      return { matched: true, text: page.slice(closestIndex) };
    }
  }
  if (spatialAnchor !== null) {
    return { matched: true, text: page.slice(spatialAnchor) };
  }
  return { matched: false, text: page };
}
function joinPdfPageText(pageTexts) {
  return (Array.isArray(pageTexts) ? pageTexts : []).map((text) => normalizeLineBreaks(text).trim()).filter(Boolean).join("\n\n");
}
function getPdfExtractionErrorMessage(error) {
  const message = messageFromError(error);
  if (/password/i.test(`${error && error.name ? error.name : ""} ${message}`)) {
    return "This PDF is password-protected. Unlock it before reading.";
  }
  if (/invalidpdf|invalid pdf|malformed pdf/i.test(`${error && error.name ? error.name : ""} ${message}`)) {
    return "This PDF is invalid or damaged and its text could not be extracted.";
  }
  return message;
}
function splitMarkdownTableRow(line) {
  let value = String(line || "").trim();
  if (!value.includes("|")) {
    return [];
  }
  if (value.startsWith("|")) {
    value = value.slice(1);
  }
  if (hasUnescapedTrailingPipe(value)) {
    value = value.slice(0, -1);
  }
  const cells = [];
  let current = "";
  let inCode = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\" && value[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (character === "`") {
      inCode = !inCode;
      current += character;
      continue;
    }
    if (character === "|" && !inCode) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current.trim());
  return cells;
}
function hasUnescapedTrailingPipe(value) {
  if (!value.endsWith("|")) {
    return false;
  }
  let backslashes = 0;
  for (let index = value.length - 2; index >= 0 && value[index] === "\\"; index -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 0;
}
function isMarkdownTableDelimiterLine(line) {
  const cells = splitMarkdownTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}
function formatMarkdownTableForSpeech(headers, rows) {
  const tableText = headers.concat(...rows).join(" ");
  const useChineseLabels = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(tableText);
  const output = [];
  const headerLabels = headers.map((header) => header.trim()).filter(Boolean);
  if (headerLabels.length) {
    output.push(`${useChineseLabels ? "\u8868\u683C\u5217" : "Table columns"}: ${headerLabels.join("; ")}${useChineseLabels ? "\u3002" : "."}`);
  }
  rows.forEach((cells, rowIndex) => {
    const values = [];
    const cellCount = Math.max(headers.length, cells.length);
    for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
      const cell = String(cells[cellIndex] || "").trim();
      if (!cell) {
        continue;
      }
      const header = String(headers[cellIndex] || "").trim();
      values.push(header ? `${header}: ${cell}` : cell);
    }
    if (values.length) {
      const rowLabel = useChineseLabels ? `\u7B2C ${rowIndex + 1} \u884C` : `Row ${rowIndex + 1}`;
      output.push(`${rowLabel}. ${values.join("; ")}${useChineseLabels ? "\u3002" : "."}`);
    }
  });
  return output.join("\n");
}
function sanitizeMarkdownTablesForSpeech(text) {
  const lines = normalizeLineBreaks(text).split("\n");
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const headerLine = lines[index];
    const delimiterLine = lines[index + 1];
    if (headerLine.includes("|") && isMarkdownTableDelimiterLine(delimiterLine)) {
      const headers = splitMarkdownTableRow(headerLine);
      const rows = [];
      let rowIndex = index + 2;
      while (rowIndex < lines.length && lines[rowIndex].trim() && lines[rowIndex].includes("|")) {
        const cells = splitMarkdownTableRow(lines[rowIndex]);
        if (isMarkdownTableDelimiterLine(lines[rowIndex])) {
          break;
        }
        rows.push(cells);
        rowIndex += 1;
      }
      output.push(formatMarkdownTableForSpeech(headers, rows));
      index = rowIndex - 1;
      continue;
    }
    if (!isMarkdownTableDelimiterLine(headerLine)) {
      output.push(headerLine);
    }
  }
  return output.join("\n");
}
function joinCitationSpeechParts(parts, useChineseLabels) {
  if (useChineseLabels) {
    return parts.join("\u3001");
  }
  if (parts.length <= 1) {
    return parts[0] || "";
  }
  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}
function verbalizeNumericCitationsForSpeech(text) {
  const value = String(text || "");
  const useChineseLabels = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(value);
  return value.replace(
    /\[(\d+(?:\s*(?:[,;]|[-–—])\s*\d+)*)\](?:\([^)]*\))?/g,
    (match, content) => {
      const numbers = content.match(/\d+/g) || [];
      if (!numbers.length || numbers.some((number) => Number(number) < 1 || Number(number) > 999)) {
        return match;
      }
      const parts = content.split(/\s*[,;]\s*/).map((part) => {
        const range = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(part);
        if (!range) {
          return part.trim();
        }
        return `${range[1]} ${useChineseLabels ? "\u5230" : "to"} ${range[2]}`;
      }).filter(Boolean);
      const isPlural = parts.length > 1 || /[-–—]/.test(content);
      const label = useChineseLabels ? "\u53C2\u8003\u6587\u732E" : isPlural ? "references" : "reference";
      return ` ${label} ${joinCitationSpeechParts(parts, useChineseLabels)} `;
    }
  );
}
function sanitizeTextForSpeech(text, options = {}) {
  let value = sanitizeLatexForSpeech(normalizeLineBreaks(text), options);
  value = value.replace(/^---\n[\s\S]*?\n---\n?/, "");
  value = value.replace(/```[\s\S]*?```/g, " ");
  value = value.replace(/!\[\[[^\]]+\]\]/g, " ");
  value = value.replace(/!\[[^\]]*]\([^)]*\)/g, " ");
  value = value.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  value = value.replace(/\[\[([^\]]+)\]\]/g, "$1");
  value = verbalizeNumericCitationsForSpeech(value);
  value = value.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  value = sanitizeMarkdownTablesForSpeech(value);
  value = value.replace(/`([^`]+)`/g, "$1");
  value = value.replace(/<[^>]+>/g, " ");
  value = value.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  value = value.replace(/^\s*>\s?/gm, "");
  value = value.replace(/^\s*[-+*]\s+/gm, "");
  value = value.replace(/[*_~]/g, "");
  value = value.replace(/\|/g, " ");
  value = value.replace(/[ \t]+/g, " ");
  value = value.replace(/[ \t]+([，。、；：！？,.])/g, "$1");
  value = value.replace(/([，。、；：！？])[ \t]+/g, "$1");
  return value.split("\n").map((line) => line.trim()).filter(Boolean).join("\n").trim();
}
function sanitizeLatexForSpeech(text, options = {}) {
  let value = normalizeLineBreaks(text);
  const mathReadingLanguage = normalizeMathReadingLanguage(options.mathReadingLanguage);
  value = value.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => replaceLatexFormula(match, content, mathReadingLanguage));
  value = value.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => replaceLatexFormula(match, content, mathReadingLanguage));
  value = value.replace(/\\\(([\s\S]*?)\\\)/g, (match, content) => replaceLatexFormula(match, content, mathReadingLanguage));
  value = value.replace(/\$([^$\n]+?)\$/g, (match, content) => replaceLatexFormula(match, content, mathReadingLanguage));
  return verbalizeLatexCommands(value, mathReadingLanguage);
}
function replaceLatexFormula(match, content, mathReadingLanguage) {
  if (mathReadingLanguage === "skip" || isLongLatexFormula(content)) {
    return " ";
  }
  return ` ${verbalizeShortLatex(content, mathReadingLanguage)} `;
}
function isLongLatexFormula(content) {
  return stripLatexDelimiters(content).replace(/\s+/g, "").length > LATEX_FORMULA_MAX_CHARS;
}
function stripLatexDelimiters(content) {
  let value = String(content || "").trim();
  value = value.replace(/^\$\$([\s\S]*?)\$\$$/, "$1");
  value = value.replace(/^\\\[([\s\S]*?)\\\]$/, "$1");
  value = value.replace(/^\\\(([\s\S]*?)\\\)$/, "$1");
  value = value.replace(/^\$([^$]*)\$$/, "$1");
  return value.trim();
}
function verbalizeShortLatex(content, mathReadingLanguage = DEFAULT_MATH_READING_LANGUAGE) {
  let value = stripLatexDelimiters(content);
  const language = normalizeMathReadingLanguage(mathReadingLanguage);
  value = verbalizeLatexCommands(value, language);
  value = verbalizeLatexAbsoluteValues(value, language);
  value = value.replace(/_/g, language === "chinese" ? " \u4E0B\u6807 " : " subscript ");
  value = value.replace(/\^/g, language === "chinese" ? " \u4E0A\u6807 " : " superscript ");
  value = value.replace(/\+/g, language === "chinese" ? " \u52A0 " : " plus ");
  value = value.replace(/=/g, language === "chinese" ? " \u7B49\u4E8E " : " equals ");
  value = value.replace(/[{}()[\]]/g, " ");
  value = value.replace(/\\/g, " ");
  return cleanupLatexSpeech(value);
}
function verbalizeLatexAbsoluteValues(text, mathReadingLanguage) {
  let value = String(text || "").replace(/\\(?:lvert|rvert|vert)\b/g, "|");
  value = value.replace(/\|([^|\n]+)\|/g, (_match, inner) => mathReadingLanguage === "chinese" ? `${inner} \u7684\u7EDD\u5BF9\u503C` : `absolute value of ${inner}`);
  return value.replace(/\|/g, " ");
}
function verbalizeLatexCommands(text, mathReadingLanguage = DEFAULT_MATH_READING_LANGUAGE) {
  const language = normalizeMathReadingLanguage(mathReadingLanguage);
  let value = replaceLatexCommands(String(text || ""), language);
  value = replaceLatexSymbolCommands(value, language);
  return cleanupLatexSpeechPreservingLines(value);
}
function replaceLatexCommands(text, mathReadingLanguage) {
  let value = String(text || "");
  let previous = "";
  const fractionSpeech = mathReadingLanguage === "chinese" ? "$1 \u5206\u4E4B $2" : "$1 over $2";
  while (value !== previous) {
    previous = value;
    value = value.replace(/\\(?:textbf|mathbf|boldsymbol|textit|emph|mathrm|operatorname|text)\s*\{([^{}]*)\}/g, "$1");
    value = value.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, fractionSpeech);
  }
  return value;
}
function replaceLatexSymbolCommands(text, mathReadingLanguage) {
  let value = String(text || "");
  const replacements = LATEX_COMMAND_REPLACEMENTS[mathReadingLanguage] || LATEX_COMMAND_REPLACEMENTS[DEFAULT_MATH_READING_LANGUAGE];
  for (const [command, speech] of replacements) {
    const replacement = speech ? ` ${speech} ` : " ";
    value = value.replace(new RegExp(`${escapeRegExp(command)}\\b`, "g"), replacement);
  }
  return value;
}
function cleanupLatexSpeech(text) {
  return String(text || "").replace(/\s+/g, " ").replace(/\s+([，。、；：！？,.])/g, "$1").replace(/([，。、；：！？])\s+/g, "$1").trim();
}
function cleanupLatexSpeechPreservingLines(text) {
  return String(text || "").split("\n").map((line) => cleanupLatexSpeech(line)).join("\n");
}
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function resolveDefaultScriptPath() {
  return "";
}
function normalizeVolume(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}
function normalizeSpeed(value) {
  const speed = Number(value);
  if (!Number.isFinite(speed)) {
    return 1;
  }
  return Math.min(2, Math.max(0.5, speed));
}
function normalizeMathReadingLanguage(value) {
  const language = String(value || DEFAULT_MATH_READING_LANGUAGE).toLowerCase();
  return MATH_READING_LANGUAGES.includes(language) ? language : DEFAULT_MATH_READING_LANGUAGE;
}
function normalizeSettingsLanguage(value) {
  const language = String(value || DEFAULT_SETTINGS.settingsLanguage).toLowerCase();
  return SETTINGS_LANGUAGES.includes(language) ? language : DEFAULT_SETTINGS.settingsLanguage;
}
function normalizeCredentialSource(value) {
  const source = String(value || "obsidian-secret").trim().toLowerCase();
  return CREDENTIAL_SOURCES.includes(source) ? source : "obsidian-secret";
}
function getSettingsUiText(language) {
  return SETTINGS_UI_TEXT[normalizeSettingsLanguage(language)];
}
function openExternalUrl(url) {
  if (typeof window === "undefined" || typeof window.open !== "function") {
    return false;
  }
  return Boolean(window.open(url, "_blank", "noopener,noreferrer"));
}
function openGitHubIssues() {
  return openExternalUrl(GITHUB_ISSUES_URL);
}
function openAzureTtsPrivacyDocs() {
  return openExternalUrl(AZURE_TTS_PRIVACY_URL);
}
function getOpenRouterVoiceHelpLinks(modelId, language = "english") {
  const model = normalizeOpenRouterModel(modelId);
  const modelPage = `https://openrouter.ai/${model.split("/").map(encodeURIComponent).join("/")}`;
  let voiceCatalog = "https://openrouter.ai/api/v1/models?output_modalities=speech";
  if (model.startsWith("microsoft/mai-voice-")) {
    const locale = normalizeSettingsLanguage(language) === "chinese" ? "zh-cn" : "en-us";
    voiceCatalog = `https://learn.microsoft.com/${locale}/azure/ai-services/speech-service/mai-voices`;
  } else if (model.startsWith("google/gemini-")) {
    voiceCatalog = "https://ai.google.dev/gemini-api/docs/speech-generation#voice-options";
  } else if (model.startsWith("fish-audio/")) {
    voiceCatalog = "https://fish.audio/discovery/";
  } else if (model === "hexgrad/kokoro-82m") {
    voiceCatalog = modelPage;
  }
  return { modelPage, voiceCatalog };
}
function normalizeSpeechEngine(value) {
  const engine = String(value || DEFAULT_SETTINGS.speechEngine).toLowerCase();
  return SPEECH_ENGINES.includes(engine) ? engine : DEFAULT_SETTINGS.speechEngine;
}
function isOnlineSpeechEngine(value) {
  return normalizeSpeechEngine(value) !== "local-cosyvoice";
}
function normalizeOnlinePrefetchChunks(value) {
  const count = Math.floor(Number(value));
  return Number.isFinite(count) ? Math.min(MAX_ONLINE_PREFETCH_CHUNKS, Math.max(0, count)) : DEFAULT_SETTINGS.onlinePrefetchChunks;
}
function getChunkLimitsForSpeechEngine(settings, speechEngine = normalizeSpeechEngine(settings && settings.speechEngine)) {
  if (isOnlineSpeechEngine(speechEngine)) {
    const limits = parseChunkLimits(settings && settings.onlineChunkLimits, DEFAULT_ONLINE_CHUNK_LIMITS);
    const mimoLimit = Math.max(50, Math.min(2e3, Math.floor(Number(settings && settings.mimoChunkLimit) || MIMO_MAX_CHUNK_CHARS)));
    return speechEngine === "mimo-tts" ? limits.map((limit) => Math.min(limit, mimoLimit)) : limits;
  }
  return parseChunkLimits(settings && settings.chunkLimits, DEFAULT_CHUNK_LIMITS);
}
function getSynthesisPrefetchCount(settings, speechEngine = normalizeSpeechEngine(settings && settings.speechEngine)) {
  return isOnlineSpeechEngine(speechEngine) ? normalizeOnlinePrefetchChunks(settings && settings.onlinePrefetchChunks) : 1;
}
function normalizeEdgeTtsVoice(value) {
  const voice = String(value || "").trim();
  return voice || DEFAULT_EDGE_TTS_VOICE;
}
function normalizeEdgeTtsExecutable(value) {
  const executable = String(value || "").trim();
  return executable || DEFAULT_EDGE_TTS_EXECUTABLE;
}
function normalizeAzureSpeechCloud(value) {
  const cloud = String(value || "").trim().toLowerCase();
  return AZURE_SPEECH_CLOUDS.includes(cloud) ? cloud : "public";
}
function normalizeAzureSpeechRegion(value) {
  const region = String(value || "").trim().toLowerCase();
  return /^[a-z0-9]{2,32}$/.test(region) ? region : "";
}
function normalizeAzureSpeechVoice(value) {
  const voice = String(value || "").trim();
  return /^[a-z]{2,3}-[a-z]{2}-[a-z0-9][a-z0-9._:-]{1,190}$/i.test(voice) ? voice : DEFAULT_AZURE_SPEECH_VOICE;
}
function normalizeOpenRouterModel(value) {
  const model = String(value || "").trim();
  return /^[a-z0-9][a-z0-9._-]{0,79}\/[a-z0-9][a-z0-9._-]{1,149}(?::[a-z0-9._-]+)?$/i.test(model) ? model : DEFAULT_OPENROUTER_TTS_MODEL;
}
function normalizeOpenRouterVoice(value) {
  const voice = String(value || "").trim();
  return /^[a-z0-9][a-z0-9._:-]{0,199}$/i.test(voice) ? voice : DEFAULT_OPENROUTER_TTS_VOICE;
}
function hasObsidianSecretStorage(app) {
  return Boolean(app && app.secretStorage && typeof app.secretStorage.getSecret === "function");
}
function hasObsidianSecretStorageUi(app) {
  return hasObsidianSecretStorage(app) && typeof SecretComponent === "function";
}
function getCredentialValueError(value, serviceLabel) {
  const secret = String(value || "").replace(/^\uFEFF/, "").trim();
  if (!secret) {
    return `${serviceLabel} secret is empty or unavailable.`;
  }
  if (/[\r\n]/.test(secret)) {
    return `${serviceLabel} secret must contain exactly one non-empty line.`;
  }
  return "";
}
function readObsidianSecretValue(secretNameValue, app, serviceLabel) {
  const secretName = String(secretNameValue || "").trim();
  if (!secretName) {
    throw new Error(`Select or create an Obsidian SecretStorage entry for ${serviceLabel}.`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(secretName)) {
    throw new Error(`${serviceLabel} secret name must use lowercase letters, numbers, and dashes.`);
  }
  if (!hasObsidianSecretStorage(app)) {
    throw new Error("Obsidian SecretStorage requires Obsidian 1.11.4 or later. Select the external key-file option on older versions.");
  }
  let value;
  try {
    value = app.secretStorage.getSecret(secretName);
  } catch (error) {
    throw new Error(`Could not read the ${serviceLabel} secret from Obsidian SecretStorage.`);
  }
  const valueError = getCredentialValueError(value, serviceLabel);
  if (valueError) {
    throw new Error(valueError);
  }
  return String(value).trim();
}
function getObsidianSecretConfigurationError(secretNameValue, app, serviceLabel) {
  try {
    readObsidianSecretValue(secretNameValue, app, serviceLabel);
    return "";
  } catch (error) {
    return error && error.message ? String(error.message) : `Could not read the ${serviceLabel} secret from Obsidian SecretStorage.`;
  }
}
function getSecretFileConfigurationError(keyPathValue, vaultBasePath, serviceLabel) {
  const keyPath = String(keyPathValue || "").trim();
  if (!keyPath || !path.isAbsolute(keyPath)) {
    return `Set an absolute ${serviceLabel} key file path in the plugin settings.`;
  }
  if (vaultBasePath && isInsideDirectory(keyPath, vaultBasePath)) {
    return `The ${serviceLabel} key file must be stored outside the Obsidian vault.`;
  }
  if (!fs.existsSync(keyPath)) {
    return `${serviceLabel} key file not found: ${keyPath}`;
  }
  return "";
}
function getRemoteCredentialConfigurationError({ credentialSource, secretName, keyPath }, vaultBasePath, app, serviceLabel) {
  if (normalizeCredentialSource(credentialSource) === "obsidian-secret") {
    return getObsidianSecretConfigurationError(secretName, app, serviceLabel);
  }
  return getSecretFileConfigurationError(keyPath, vaultBasePath, serviceLabel);
}
function buildAzureSpeechEndpoint(settings = {}) {
  const cloud = String(settings.azureSpeechCloud || "public").trim().toLowerCase();
  const region = normalizeAzureSpeechRegion(settings.azureSpeechRegion);
  if (!AZURE_SPEECH_CLOUDS.includes(cloud)) {
    throw new Error("Invalid Azure Speech cloud.");
  }
  if (!region) {
    throw new Error("Invalid Azure Speech region.");
  }
  const domain = cloud === "china" ? "tts.speech.azure.cn" : "tts.speech.microsoft.com";
  return `https://${region}.${domain}/cognitiveservices/v1`;
}
function escapeXml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function buildAzureSpeechSsml(text, settings = {}) {
  const voice = normalizeAzureSpeechVoice(settings.azureSpeechVoice);
  const locale = voice.split("-").slice(0, 2).join("-");
  const rate = formatEdgeTtsRate(settings.speed);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeXml(locale)}"><voice name="${escapeXml(voice)}"><prosody rate="${rate}">${escapeXml(text)}</prosody></voice></speak>`;
}
function getAzureSpeechConfigurationError(settings = {}, vaultBasePath = "", app = null) {
  const cloud = String(settings.azureSpeechCloud || "public").trim().toLowerCase();
  if (!AZURE_SPEECH_CLOUDS.includes(cloud)) {
    return "Select a valid Azure Speech cloud in the plugin settings.";
  }
  const region = String(settings.azureSpeechRegion || "").trim().toLowerCase();
  if (!region || normalizeAzureSpeechRegion(region) !== region) {
    return "Set a valid Azure Speech region in the plugin settings.";
  }
  if (normalizeAzureSpeechVoice(settings.azureSpeechVoice) !== String(settings.azureSpeechVoice || "").trim()) {
    return "Set a valid Azure Speech voice ID in the plugin settings.";
  }
  return getRemoteCredentialConfigurationError({
    credentialSource: settings.azureSpeechCredentialSource,
    secretName: settings.azureSpeechSecretName,
    keyPath: settings.azureSpeechKeyPath
  }, vaultBasePath, app, "Azure Speech");
}
function getOpenRouterConfigurationError(settings = {}, vaultBasePath = "", app = null) {
  if (normalizeOpenRouterModel(settings.openRouterModel) !== String(settings.openRouterModel || "").trim()) {
    return "Set a valid OpenRouter TTS model ID in the plugin settings.";
  }
  if (normalizeOpenRouterVoice(settings.openRouterVoice) !== String(settings.openRouterVoice || "").trim()) {
    return "Set a valid OpenRouter TTS voice ID in the plugin settings.";
  }
  return getRemoteCredentialConfigurationError({
    credentialSource: settings.openRouterCredentialSource,
    secretName: settings.openRouterSecretName,
    keyPath: settings.openRouterKeyPath
  }, vaultBasePath, app, "OpenRouter API");
}
function buildOpenRouterTtsRequestBody(text, settings = {}) {
  return JSON.stringify({
    model: normalizeOpenRouterModel(settings.openRouterModel),
    input: String(text || ""),
    voice: normalizeOpenRouterVoice(settings.openRouterVoice),
    response_format: "mp3",
    speed: normalizeSpeed(settings.speed),
    provider: {
      data_collection: "deny",
      zdr: true
    }
  });
}
function getMicrosoftVoicePresets(language) {
  const labelIndex = normalizeSettingsLanguage(language) === "chinese" ? 2 : 1;
  return MICROSOFT_VOICE_PRESETS.map((preset) => [preset[0], preset[labelIndex]]);
}
function getEdgeTtsVoicePresets(language) {
  return getMicrosoftVoicePresets(language);
}
function getAzureSpeechVoicePresets(language) {
  return getMicrosoftVoicePresets(language);
}
function getOpenRouterTtsModels(language) {
  const normalizedLanguage = normalizeSettingsLanguage(language);
  const labelIndex = normalizedLanguage === "chinese" ? 3 : 2;
  const infoIndex = normalizedLanguage === "chinese" ? 5 : 4;
  return OPENROUTER_TTS_MODELS.map((model) => [model[0], model[1], model[labelIndex], model[infoIndex]]);
}
function getDefaultOpenRouterVoiceForModel(modelId) {
  const selected = OPENROUTER_TTS_MODELS.find(([model]) => model === String(modelId || "").trim());
  return selected ? selected[1] : DEFAULT_OPENROUTER_TTS_VOICE;
}
function getOpenRouterTtsPresets(language) {
  const labelIndex = normalizeSettingsLanguage(language) === "chinese" ? 3 : 2;
  return OPENROUTER_TTS_PRESETS.map((preset) => [preset[0], preset[1], preset[labelIndex]]);
}
function getOpenRouterTtsVoicePresets(modelId, language) {
  const selectedModel = String(modelId || "").trim();
  return getOpenRouterTtsPresets(language).filter(([model]) => model === selectedModel);
}
function hasEdgeTtsConsent(settings = {}) {
  return normalizeSpeechEngine(settings.speechEngine) !== "edge-tts" || settings.edgeTtsConsent === true;
}
function hasAzureSpeechConsent(settings = {}) {
  return normalizeSpeechEngine(settings.speechEngine) !== "azure-speech" || settings.azureSpeechConsent === true;
}
function hasOpenRouterConsent(settings = {}) {
  return normalizeSpeechEngine(settings.speechEngine) !== "openrouter-tts" || settings.openRouterConsent === true;
}
function getPluginTempCacheDir(vaultBasePath, tempBasePath = os.tmpdir()) {
  const resolvedVaultPath = path.resolve(String(vaultBasePath || ""));
  const vaultKey = crypto.createHash("sha256").update(resolvedVaultPath).digest("hex").slice(0, 16);
  return path.join(tempBasePath, PLUGIN_ID, vaultKey);
}
function isOwnedCacheFileName(fileName) {
  const name = String(fileName || "");
  return OWNED_CACHE_FILE_PATTERN.test(name) || name === "diagnostic.log";
}
function createSafeRuntimeLogEvent(stage, settings = {}, timestamp = (/* @__PURE__ */ new Date()).toISOString()) {
  if (stage !== "failed") {
    return null;
  }
  return {
    time: timestamp,
    stage: "failed",
    engine: getSpeechEngineLabel(settings)
  };
}
function formatEdgeTtsRate(speed) {
  const rate = Math.round((normalizeSpeed(speed) - 1) * 100);
  return `${rate >= 0 ? "+" : ""}${rate}%`;
}
function buildEdgeTtsArgs(inputPath, outputPath, settings = {}) {
  return [
    "--voice",
    normalizeEdgeTtsVoice(settings.edgeTtsVoice),
    `--rate=${formatEdgeTtsRate(settings.speed)}`,
    "--file",
    inputPath,
    "--write-media",
    outputPath
  ];
}
function getSpeechEngineLabel(settings = {}) {
  const speechEngine = normalizeSpeechEngine(settings.speechEngine);
  if (speechEngine === "mimo-tts") return "Xiaomi MiMo TTS";
  if (speechEngine === "edge-tts") {
    return "Edge TTS";
  }
  if (speechEngine === "azure-speech") {
    return "Azure Speech";
  }
  if (speechEngine === "openrouter-tts") {
    return "OpenRouter TTS";
  }
  return "CosyVoice";
}
function getSpeedPresets() {
  return SPEED_PRESETS.slice();
}
function formatSpeedLabel(speed) {
  return `${normalizeSpeed(speed).toString()}x`;
}
function selectKnownSettings(defaults, candidate) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  return Object.fromEntries(Object.entries(defaults).map(([key, defaultValue]) => [
    key,
    Object.prototype.hasOwnProperty.call(source, key) ? source[key] : defaultValue
  ]));
}
function createDefaultSettings() {
  return {
    ...MIMO_DEFAULTS,
    playbackVolume: 1,
    playbackSpeed: 1,
    audioExportFolder: normalizeAudioExportFolder(DEFAULT_SETTINGS.audioExportFolder),
    audioExportLocation: normalizeAudioExportLocation(DEFAULT_SETTINGS.audioExportLocation),
    azureSpeechCloud: normalizeAzureSpeechCloud(DEFAULT_SETTINGS.azureSpeechCloud),
    azureSpeechConsent: DEFAULT_SETTINGS.azureSpeechConsent,
    azureSpeechCredentialSource: normalizeCredentialSource(DEFAULT_SETTINGS.azureSpeechCredentialSource),
    azureSpeechKeyPath: DEFAULT_SETTINGS.azureSpeechKeyPath,
    azureSpeechRegion: DEFAULT_SETTINGS.azureSpeechRegion,
    azureSpeechSecretName: DEFAULT_SETTINGS.azureSpeechSecretName,
    azureSpeechVoice: normalizeAzureSpeechVoice(DEFAULT_SETTINGS.azureSpeechVoice),
    cleanupCache: DEFAULT_SETTINGS.cleanupCache,
    chunkLimits: parseChunkLimits(DEFAULT_SETTINGS.chunkLimits).join(","),
    onlineChunkLimits: parseChunkLimits(
      DEFAULT_SETTINGS.onlineChunkLimits,
      DEFAULT_ONLINE_CHUNK_LIMITS
    ).join(","),
    onlinePrefetchChunks: normalizeOnlinePrefetchChunks(DEFAULT_SETTINGS.onlinePrefetchChunks),
    readingPositions: normalizeReadingPositions(DEFAULT_SETTINGS.readingPositions),
    rememberReadingPosition: DEFAULT_SETTINGS.rememberReadingPosition,
    diagnosticLogging: DEFAULT_SETTINGS.diagnosticLogging,
    edgeTtsConsent: DEFAULT_SETTINGS.edgeTtsConsent,
    edgeTtsExecutable: normalizeEdgeTtsExecutable(DEFAULT_SETTINGS.edgeTtsExecutable),
    edgeTtsVoice: normalizeEdgeTtsVoice(DEFAULT_SETTINGS.edgeTtsVoice),
    mathReadingLanguage: normalizeMathReadingLanguage(DEFAULT_SETTINGS.mathReadingLanguage),
    openRouterConsent: DEFAULT_SETTINGS.openRouterConsent,
    openRouterCredentialSource: normalizeCredentialSource(DEFAULT_SETTINGS.openRouterCredentialSource),
    openRouterKeyPath: DEFAULT_SETTINGS.openRouterKeyPath,
    openRouterModel: normalizeOpenRouterModel(DEFAULT_SETTINGS.openRouterModel),
    openRouterSecretName: DEFAULT_SETTINGS.openRouterSecretName,
    openRouterVoice: normalizeOpenRouterVoice(DEFAULT_SETTINGS.openRouterVoice),
    settingsLanguage: normalizeSettingsLanguage(DEFAULT_SETTINGS.settingsLanguage),
    scriptPath: resolveDefaultScriptPath(),
    speechEngine: normalizeSpeechEngine(DEFAULT_SETTINGS.speechEngine),
    speed: normalizeSpeed(DEFAULT_SETTINGS.speed),
    stripMarkdown: DEFAULT_SETTINGS.stripMarkdown
  };
}
function createReaderState(overrides = {}) {
  return normalizeReaderState({
    canPause: false,
    canNextChunk: false,
    canPreviousChunk: false,
    canSeek: false,
    canStop: false,
    currentChunk: 0,
    currentText: "",
    error: "",
    isPaused: false,
    label: "CosyVoice idle",
    phase: "idle",
    progress: 0,
    source: "",
    status: "idle",
    totalChunks: 0,
    ...overrides
  });
}
function normalizeReaderState(state) {
  const totalChunks = Math.max(0, Math.floor(Number(state.totalChunks) || 0));
  const currentChunk = Math.max(0, Math.min(totalChunks || Number.MAX_SAFE_INTEGER, Math.floor(Number(state.currentChunk) || 0)));
  return {
    canPause: Boolean(state.canPause),
    canNextChunk: Boolean(state.canNextChunk),
    canPreviousChunk: Boolean(state.canPreviousChunk),
    canSeek: Boolean(state.canSeek),
    canStop: Boolean(state.canStop),
    currentChunk,
    currentText: String(state.currentText || ""),
    error: String(state.error || ""),
    isPaused: Boolean(state.isPaused),
    label: String(state.label || "CosyVoice idle"),
    phase: String(state.phase || "idle"),
    progress: clampProgress(state.progress),
    source: String(state.source || ""),
    status: String(state.status || "idle"),
    totalChunks
  };
}
function calculateCurrentChunkSeekTime({ progress, currentChunk, totalChunks, duration }) {
  const total = Math.max(0, Math.floor(Number(totalChunks) || 0));
  const chunk = Math.max(0, Math.floor(Number(currentChunk) || 0));
  const seconds = Number(duration);
  if (!total || !chunk || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const chunkStart = (chunk - 1) / total;
  const chunkEnd = chunk / total;
  const clampedProgress = Math.min(chunkEnd, Math.max(chunkStart, clampProgress(progress)));
  const localProgress = (clampedProgress - chunkStart) / (chunkEnd - chunkStart);
  return Math.round(seconds * localProgress * 1e3) / 1e3;
}
function getTextFromPositionToEnd(lines, position) {
  const sourceLines = Array.isArray(lines) ? lines.map((line2) => String(line2 || "")) : [];
  const line = Math.max(0, Math.min(sourceLines.length - 1, Math.floor(Number(position && position.line) || 0)));
  const ch = Math.max(0, Math.floor(Number(position && position.ch) || 0));
  if (!sourceLines.length) {
    return "";
  }
  const firstLine = sourceLines[line] || "";
  return [firstLine.slice(ch), ...sourceLines.slice(line + 1)].join("\n").trim();
}
function clampProgress(value) {
  const progress = Number(value);
  if (!Number.isFinite(progress)) {
    return 0;
  }
  return Math.min(1, Math.max(0, progress));
}
function formatProgressLabel(state) {
  const currentChunk = Math.max(0, Math.floor(Number(state.currentChunk) || 0));
  const totalChunks = Math.max(0, Math.floor(Number(state.totalChunks) || 0));
  return `${currentChunk} / ${totalChunks}`;
}
function isSpaceKeyEvent(event) {
  return event && (event.code === "Space" || event.key === " " || event.key === "Spacebar");
}
function getKeyboardSeekDeltaSeconds(event) {
  if (!event) {
    return 0;
  }
  if (event.code === "ArrowLeft" || event.key === "ArrowLeft") {
    return -KEYBOARD_SEEK_SECONDS;
  }
  if (event.code === "ArrowRight" || event.key === "ArrowRight") {
    return KEYBOARD_SEEK_SECONDS;
  }
  return 0;
}
function isInteractiveKeyboardTarget(target) {
  if (!target || !target.tagName) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  if (typeof target.closest === "function" && target.closest('.cm-editor, .markdown-source-view, [contenteditable="true"]')) {
    return true;
  }
  const tagName = String(target.tagName).toLowerCase();
  if (tagName === "textarea" || tagName === "select") {
    return true;
  }
  if (tagName !== "input") {
    return false;
  }
  const type = String(
    target.type || target.attributes && target.attributes.type || "text"
  ).toLowerCase();
  return !["button", "checkbox", "radio", "range", "reset", "submit"].includes(type);
}
function getChunkNavigationState(currentChunk, totalChunks) {
  const total = Math.max(0, Math.floor(Number(totalChunks) || 0));
  const current = Math.max(0, Math.min(total || Number.MAX_SAFE_INTEGER, Math.floor(Number(currentChunk) || 0)));
  return {
    canNextChunk: Boolean(current && current < total),
    canPreviousChunk: current > 1
  };
}
function previewText(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 320);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function parseRetryAfterMs(value, nowMs = Date.now()) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const normalized = String(rawValue || "").trim();
  if (!normalized) {
    return null;
  }
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return Math.min(REMOTE_TTS_RETRY_AFTER_MAX_MS, Math.max(0, Math.ceil(Number(normalized) * 1e3)));
  }
  const retryAtMs = Date.parse(normalized);
  if (!Number.isFinite(retryAtMs)) {
    return null;
  }
  return Math.min(REMOTE_TTS_RETRY_AFTER_MAX_MS, Math.max(0, retryAtMs - nowMs));
}
function isRetryableRemoteError(error) {
  if (!error) {
    return false;
  }
  const statusCode = Number(error.statusCode) || 0;
  if (statusCode) {
    return REMOTE_TTS_RETRYABLE_STATUS_CODES.has(statusCode);
  }
  return REMOTE_TTS_RETRYABLE_ERROR_CODES.has(String(error.code || "").toUpperCase());
}
function getRemoteHttpErrorDetail(statusCode, failureHint) {
  const fallback = failureHint || "Check the service configuration and account status.";
  if (statusCode === 400 || statusCode === 422) {
    return `The provider rejected the request. Check the selected model, voice, text length, and request format. ${fallback}`;
  }
  if (statusCode === 401) {
    return "Authentication failed. The API key may be missing, invalid, expired, or associated with a different service account.";
  }
  if (statusCode === 402) {
    return "Account credit, balance, or spending limit is exhausted. Add credit or raise the provider budget before retrying.";
  }
  if (statusCode === 403) {
    return `The request was forbidden. Check API-key permissions, model or provider access, and required privacy routing. ${fallback}`;
  }
  if (statusCode === 404) {
    return `The requested endpoint, model, voice, region, or resource was not found. ${fallback}`;
  }
  if (statusCode === 413) {
    return "The text request is too large for the provider. Reduce the online chunk limits and try again.";
  }
  if (statusCode === 429) {
    return "The service rate limit or request quota has been reached. Wait for the provider reset time, reduce request frequency, or review the account limits.";
  }
  if (statusCode === 408 || statusCode === 425 || statusCode >= 500) {
    return "The upstream service is temporarily unavailable, busy, or timed out.";
  }
  return fallback;
}
function createRemoteHttpError(serviceLabel, statusCode, failureHint, retryAfterValue) {
  const retryAfterMs = parseRetryAfterMs(retryAfterValue);
  const retryAfterDetail = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? ` A Retry-After delay of ${Math.ceil(retryAfterMs / 1e3)} seconds will be observed before the next attempt.` : "";
  const error = new Error(
    `${serviceLabel} returned HTTP ${statusCode}. ${getRemoteHttpErrorDetail(statusCode, failureHint)}${retryAfterDetail}`
  );
  error.statusCode = statusCode;
  error.retryAfterMs = retryAfterMs;
  error.category = statusCode === 402 ? "quota" : statusCode === 429 ? "rate-limit" : statusCode === 401 ? "authentication" : statusCode === 403 ? "access" : REMOTE_TTS_RETRYABLE_STATUS_CODES.has(statusCode) ? "temporary" : "request";
  return error;
}
function createRemoteRetryExhaustedError(serviceLabel, error, attempts) {
  const statusCode = Number(error && error.statusCode) || 0;
  const failure = statusCode ? `HTTP ${statusCode}` : messageFromError(error);
  const detail = statusCode === 429 ? "The rate limit or request quota is still exceeded. Wait for the provider reset time or review the account limits." : "The upstream provider may be temporarily unavailable. Try again shortly or select another model.";
  const exhaustedError = new Error(
    `${serviceLabel} returned ${failure} after ${attempts} attempts. ` + detail
  );
  exhaustedError.statusCode = statusCode || void 0;
  exhaustedError.code = error && error.code;
  exhaustedError.category = error && error.category;
  exhaustedError.retryAfterMs = error && error.retryAfterMs;
  return exhaustedError;
}
function focusElementWithoutScroll(element) {
  if (!element || typeof element.focus !== "function") {
    return;
  }
  try {
    element.focus({ preventScroll: true });
  } catch (error) {
    element.focus();
  }
}
function toVaultRelativePath(basePath, filePath) {
  const relative = path.relative(path.resolve(basePath), path.resolve(filePath));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return relative.split(path.sep).join("/");
}
function getAudioUrlForFile(adapter, basePath, filePath) {
  const vaultPath = toVaultRelativePath(basePath, filePath);
  if (vaultPath && adapter && typeof adapter.getResourcePath === "function") {
    return adapter.getResourcePath(vaultPath);
  }
  return pathToFileURL(filePath).href;
}
function getAudioMimeType(filePath) {
  return path.extname(String(filePath || "")).toLowerCase() === ".wav" ? "audio/wav" : "audio/mpeg";
}
function createBlobAudioSource(audioBytes, filePath, runtime = globalThis) {
  if (!audioBytes || typeof audioBytes.length !== "number" || audioBytes.length === 0) {
    return null;
  }
  const BlobConstructor = runtime && runtime.Blob;
  const urlApi = runtime && runtime.URL;
  if (typeof BlobConstructor !== "function" || !urlApi || typeof urlApi.createObjectURL !== "function" || typeof urlApi.revokeObjectURL !== "function") {
    return null;
  }
  try {
    const mimeType = getAudioMimeType(filePath);
    const objectUrl = urlApi.createObjectURL(new BlobConstructor([audioBytes], { type: mimeType }));
    if (!objectUrl) {
      return null;
    }
    let released = false;
    return {
      mimeType,
      url: String(objectUrl),
      release() {
        if (released) {
          return;
        }
        released = true;
        try {
          urlApi.revokeObjectURL(objectUrl);
        } catch (error) {
          console.warn(`[${PLUGIN_ID}] Could not release temporary audio URL`, error);
        }
      }
    };
  } catch (error) {
    return null;
  }
}
function describeMediaError(mediaError) {
  const code = Number(mediaError && mediaError.code) || 0;
  const descriptions = {
    1: "playback was aborted",
    2: "the audio source could not be loaded",
    3: "the audio could not be decoded",
    4: "the audio source or format is unsupported"
  };
  return code ? ` (media error ${code}: ${descriptions[code] || "unknown media failure"})` : "";
}
function resolvePowerShellExecutable() {
  return "powershell.exe";
}
function isMarkdownFile(file) {
  return Boolean(file && String(file.extension || "").toLowerCase() === "md");
}
function getAudioExportExtension(speechEngine) {
  return ["local-cosyvoice", "mimo-tts"].includes(normalizeSpeechEngine(speechEngine)) ? "wav" : "mp3";
}
function normalizeAudioExportScope(value) {
  const normalized = String(value || "").trim();
  return AUDIO_EXPORT_SCOPES.includes(normalized) ? normalized : "entire";
}
function normalizeAudioExportLocation(value) {
  const normalized = String(value || "").trim();
  return AUDIO_EXPORT_LOCATIONS.includes(normalized) ? normalized : "obsidian-attachment";
}
function normalizeVaultRelativeAudioPath(value) {
  const source = String(value || "");
  if (source.includes("\0")) {
    return "";
  }
  const normalized = source.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
  const segments = normalized.split("/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || segments.some((segment) => segment.trim() === "." || segment.trim() === "..")) {
    return "";
  }
  return normalized;
}
function normalizeAudioExportFolder(value) {
  return normalizeVaultRelativeAudioPath(value);
}
function getAvailableVaultAudioPath(vault, requestedPath) {
  const normalizedPath = normalizeVaultRelativeAudioPath(requestedPath);
  if (!normalizedPath) {
    throw new Error("The audio export path must stay inside the current Obsidian vault.");
  }
  if (!vault || typeof vault.getAbstractFileByPath !== "function") {
    return normalizedPath;
  }
  const extension = path.posix.extname(normalizedPath);
  const stem = extension ? normalizedPath.slice(0, -extension.length) : normalizedPath;
  for (let suffix = 0; suffix < 1e4; suffix += 1) {
    const candidate = `${stem}${suffix ? ` ${suffix}` : ""}${extension}`;
    if (!vault.getAbstractFileByPath(candidate)) {
      return candidate;
    }
  }
  throw new Error("Could not choose a non-conflicting name for the exported audio.");
}
function selectMarkdownAudioExportText(documentText, selectionText, selectionStart, scopeValue) {
  const scope = normalizeAudioExportScope(scopeValue);
  if (scope === "selection") {
    return String(selectionText || "").trim();
  }
  if (scope === "from-selection") {
    return getTextFromPositionToEnd(
      normalizeLineBreaks(documentText).split("\n"),
      selectionStart
    ).trim();
  }
  return String(documentText || "").trim();
}
function createAudioExportSummary(options = {}) {
  return {
    chunkCount: Math.max(0, Math.floor(Number(options.chunkCount) || 0)),
    documentKind: ["pdf", "html"].includes(options.documentKind) ? options.documentKind : "markdown",
    engineLabel: String(options.engineLabel || "Speech engine"),
    fileName: String(options.fileName || options.noteName || "document"),
    insertAfterExport: options.insertAfterExport === true,
    isOnline: isOnlineSpeechEngine(options.speechEngine),
    noteName: String(options.fileName || options.noteName || "document"),
    scope: normalizeAudioExportScope(options.scope),
    speechEngine: normalizeSpeechEngine(options.speechEngine),
    targetPath: String(options.targetPath || "").trim(),
    textLength: Math.max(0, Math.floor(Number(options.textLength) || 0))
  };
}
function getAudioExportScopeLabel(languageValue, scopeValue) {
  const useChinese = normalizeSettingsLanguage(languageValue) === "chinese";
  const scope = normalizeAudioExportScope(scopeValue);
  const labels = useChinese ? {
    entire: "\u5168\u90E8\u5185\u5BB9",
    selection: "\u4EC5\u9009\u4E2D\u5185\u5BB9",
    "from-selection": "\u4ECE\u9009\u4E2D\u4F4D\u7F6E\u5230\u672B\u5C3E"
  } : {
    entire: "Entire document",
    selection: "Selected text only",
    "from-selection": "From selection to end"
  };
  return labels[scope];
}
function getAudioExportScopeUiText(languageValue, context = {}) {
  const useChinese = normalizeSettingsLanguage(languageValue) === "chinese";
  const isPdf = context.documentKind === "pdf";
  const isHtml = context.documentKind === "html";
  const hasSelection = context.hasSelection === true;
  if (useChinese) {
    return {
      cancel: "\u53D6\u6D88",
      continue: "\u7EE7\u7EED",
      description: isPdf ? "\u9009\u62E9\u8981\u4ECE\u5F53\u524D\u6587\u672C\u578B PDF \u5BFC\u51FA\u7684\u5185\u5BB9\u8303\u56F4\u3002\u4E0B\u4E00\u6B65\u4F1A\u5148\u5728\u672C\u5730\u89E3\u6790\u5E76\u8BA1\u7B97\u51C6\u786E\u5206\u6BB5\uFF0C\u518D\u8981\u6C42\u786E\u8BA4\u3002" : isHtml ? "\u9009\u62E9\u8981\u4ECE\u5F53\u524D HTML \u6587\u4EF6\u5BFC\u51FA\u7684\u6B63\u6587\u8303\u56F4\u3002\u4E0B\u4E00\u6B65\u4F1A\u5728\u672C\u5730\u63D0\u53D6\u6587\u5B57\u3001\u8BA1\u7B97\u51C6\u786E\u5206\u6BB5\u5E76\u8981\u6C42\u786E\u8BA4\u3002" : "\u9009\u62E9\u8981\u4ECE\u5F53\u524D Markdown \u7B14\u8BB0\u5BFC\u51FA\u7684\u5185\u5BB9\u8303\u56F4\u3002\u4E0B\u4E00\u6B65\u4F1A\u8BA1\u7B97\u51C6\u786E\u5206\u6BB5\u5E76\u8981\u6C42\u786E\u8BA4\u3002",
      entire: "\u5168\u90E8\u5185\u5BB9",
      fileLabel: isPdf ? "PDF" : isHtml ? "HTML" : "\u7B14\u8BB0",
      fromSelection: "\u4ECE\u9009\u4E2D\u4F4D\u7F6E\u5230\u672B\u5C3E",
      noSelection: "\u5F53\u524D\u6587\u4EF6\u6CA1\u6709\u53EF\u7528\u9009\u533A\u3002\u8BF7\u5148\u9009\u4E2D\u6587\u5B57\uFF0C\u518D\u4F7F\u7528\u540E\u4E24\u79CD\u8303\u56F4\u3002",
      scopeLabel: "\u5BFC\u51FA\u8303\u56F4",
      selection: "\u4EC5\u9009\u4E2D\u5185\u5BB9",
      selectionAvailable: hasSelection,
      title: "\u9009\u62E9\u97F3\u9891\u5BFC\u51FA\u8303\u56F4"
    };
  }
  return {
    cancel: "Cancel",
    continue: "Continue",
    description: isPdf ? "Choose what to export from the current text-based PDF. The plugin will parse locally, calculate exact segments, and then ask for confirmation." : isHtml ? "Choose what to export from the current HTML file. Readable text is extracted locally before the estimate and confirmation." : "Choose what to export from the current Markdown note. The plugin will calculate exact segments and then ask for confirmation.",
    entire: "Entire document",
    fileLabel: isPdf ? "PDF" : isHtml ? "HTML" : "Note",
    fromSelection: "From selection to end",
    noSelection: "There is no usable selection in the current file. Select text first to use the other two scopes.",
    scopeLabel: "Export scope",
    selection: "Selected text only",
    selectionAvailable: hasSelection,
    title: "Choose audio export scope"
  };
}
function getAudioExportUiText(languageValue, summaryValue) {
  const summary = createAudioExportSummary(summaryValue);
  const useChinese = normalizeSettingsLanguage(languageValue) === "chinese";
  const numberFormatter = new Intl.NumberFormat(useChinese ? "zh-CN" : "en-US");
  if (useChinese) {
    return {
      acknowledge: summary.isOnline ? "\u6211\u4E86\u89E3\uFF1A\u4E0A\u8FF0\u8303\u56F4\u5185\u7684\u53EF\u6717\u8BFB\u6587\u672C\u5C06\u5206\u6BB5\u53D1\u9001\u7ED9\u6240\u9009\u5728\u7EBF\u8BED\u97F3\u670D\u52A1\uFF0C\u5E76\u53EF\u80FD\u6D88\u8017 API \u989D\u5EA6\u6216\u4EA7\u751F\u8D39\u7528\u3002" : "\u6211\u4E86\u89E3\uFF1A\u63D2\u4EF6\u5C06\u4E3A\u4E0A\u8FF0\u8303\u56F4\u6267\u884C\u672C\u5730\u8BED\u97F3\u5408\u6210\uFF0C\u8FC7\u7A0B\u53EF\u80FD\u9700\u8981\u8F83\u957F\u65F6\u95F4\u3002",
      cancel: "\u53D6\u6D88",
      characterLabel: "\u53EF\u6717\u8BFB\u5B57\u7B26\u6570",
      confirm: summary.insertAfterExport ? "\u5BFC\u51FA\u5E76\u63D2\u5165" : "\u5BFC\u51FA\u97F3\u9891",
      description: summary.insertAfterExport ? "\u5168\u90E8\u5206\u6BB5\u6210\u529F\u540E\uFF0C\u97F3\u9891\u4F1A\u4FDD\u5B58\u5230\u4E0B\u65B9\u4F4D\u7F6E\u5E76\u63D2\u5165\u539F\u7B14\u8BB0\u3002" : "\u5168\u90E8\u5206\u6BB5\u6210\u529F\u540E\uFF0C\u97F3\u9891\u4F1A\u4FDD\u5B58\u5230\u4E0B\u65B9\u4F4D\u7F6E\u3002",
      engineLabel: "\u8BED\u97F3\u5F15\u64CE",
      fileLabel: summary.documentKind === "pdf" ? "PDF" : summary.documentKind === "html" ? "HTML" : "\u7B14\u8BB0",
      locationLabel: "\u9884\u8BA1\u4FDD\u5B58\u4F4D\u7F6E",
      quotaWarning: summary.isOnline ? `\u5C06\u53D1\u9001 ${numberFormatter.format(summary.textLength)} \u4E2A\u5B57\u7B26\uFF0C\u8BA1\u5212\u6309 ${numberFormatter.format(summary.chunkCount)} \u4E2A\u5206\u6BB5\u987A\u5E8F\u5408\u6210\uFF1B\u4E34\u65F6\u5931\u8D25\u53EF\u80FD\u89E6\u53D1\u6709\u9650\u91CD\u8BD5\uFF0C\u56E0\u6B64\u5B9E\u9645\u7F51\u7EDC\u5C1D\u8BD5\u6B21\u6570\u53EF\u80FD\u66F4\u9AD8\u3002\u4E0D\u4F1A\u4E3A\u64AD\u653E\u8FDE\u7EED\u6027\u989D\u5916\u9884\u5408\u6210\u3002\u5B9E\u9645\u989D\u5EA6\u6216\u8D39\u7528\u7531\u670D\u52A1\u5546\u548C\u6A21\u578B\u51B3\u5B9A\u3002` : `\u5C06\u6267\u884C ${numberFormatter.format(summary.chunkCount)} \u4E2A\u672C\u5730\u5408\u6210\u5206\u6BB5\uFF1B\u4E0D\u4F1A\u8C03\u7528\u5728\u7EBF API\u3002`,
      requestLabel: summary.isOnline ? "\u9884\u8BA1\u5728\u7EBF\u8BF7\u6C42" : "\u5408\u6210\u5206\u6BB5",
      scopeLabel: "\u5BFC\u51FA\u8303\u56F4",
      scopeValue: getAudioExportScopeLabel("chinese", summary.scope),
      title: "\u786E\u8BA4\u5BFC\u51FA\u97F3\u9891\uFF1F"
    };
  }
  return {
    acknowledge: summary.isOnline ? "I understand that readable text in the selected scope will be sent in chunks to the selected online speech service and may use API quota or incur charges." : "I understand that the selected scope will be synthesized locally and may take a long time.",
    cancel: "Cancel",
    characterLabel: "Readable characters",
    confirm: summary.insertAfterExport ? "Export and insert" : "Export audio",
    description: summary.insertAfterExport ? "After every segment succeeds, the audio will be saved at the location below and embedded in the original note." : "After every segment succeeds, the audio will be saved at the location below.",
    engineLabel: "Speech engine",
    fileLabel: summary.documentKind === "pdf" ? "PDF" : summary.documentKind === "html" ? "HTML" : "Note",
    locationLabel: "Planned save location",
    quotaWarning: summary.isOnline ? `${numberFormatter.format(summary.textLength)} characters will be sent in ${numberFormatter.format(summary.chunkCount)} planned sequential segments. Temporary failures may trigger bounded retries, so the network attempt count can be higher. No playback-continuity chunks are prefetched. Actual quota or cost depends on the provider and model.` : `${numberFormatter.format(summary.chunkCount)} local synthesis segments will run. No online API is used.`,
    requestLabel: summary.isOnline ? "Estimated online requests" : "Synthesis segments",
    scopeLabel: "Export scope",
    scopeValue: getAudioExportScopeLabel("english", summary.scope),
    title: "Confirm audio export?"
  };
}
var AudioExportScopeModal = class extends Modal {
  constructor(app, language, context) {
    super(app);
    this.language = language;
    this.context = context || {};
    this.settled = false;
    this.resultPromise = new Promise((resolve) => {
      this.resolveResult = resolve;
    });
  }
  finish(result) {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolveResult(result ? normalizeAudioExportScope(result) : null);
    this.close();
  }
  openAndWait() {
    this.open();
    return this.resultPromise;
  }
  onOpen() {
    const ui = getAudioExportScopeUiText(this.language, this.context);
    this.titleEl.setText(ui.title);
    this.contentEl.empty();
    this.contentEl.addClass("note-reader-cosyvoice-export-modal");
    this.contentEl.createEl("p", { text: ui.description });
    const fileSummary = this.contentEl.createEl("dl", { cls: "note-reader-cosyvoice-export-summary" });
    fileSummary.createEl("dt", { text: ui.fileLabel });
    fileSummary.createEl("dd", { text: String(this.context.fileName || "document") });
    const scopeRow = this.contentEl.createEl("label", { cls: "note-reader-cosyvoice-export-scope" });
    scopeRow.createSpan({ text: ui.scopeLabel });
    const select = scopeRow.createEl("select", { attr: { "aria-label": ui.scopeLabel } });
    const addOption = (value, label, disabled = false) => {
      const option = select.createEl("option", { attr: { value }, text: label });
      option.disabled = disabled;
    };
    addOption("entire", ui.entire);
    addOption("selection", ui.selection, !ui.selectionAvailable);
    addOption("from-selection", ui.fromSelection, !ui.selectionAvailable);
    select.value = "entire";
    if (!ui.selectionAvailable) {
      this.contentEl.createDiv({ cls: "note-reader-cosyvoice-export-hint", text: ui.noSelection });
    }
    const actions = this.contentEl.createDiv({ cls: "note-reader-cosyvoice-export-actions" });
    const cancelButton = actions.createEl("button", { text: ui.cancel });
    const continueButton = actions.createEl("button", { cls: "mod-cta", text: ui.continue });
    cancelButton.addEventListener("click", () => this.finish(null));
    continueButton.addEventListener("click", () => this.finish(select.value));
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveResult(null);
    }
  }
};
var AudioExportConfirmModal = class extends Modal {
  constructor(app, language, summary) {
    super(app);
    this.language = language;
    this.summary = createAudioExportSummary(summary);
    this.settled = false;
    this.resultPromise = new Promise((resolve) => {
      this.resolveResult = resolve;
    });
  }
  finish(result) {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolveResult(Boolean(result));
    this.close();
  }
  openAndWait() {
    this.open();
    return this.resultPromise;
  }
  onOpen() {
    const ui = getAudioExportUiText(this.language, this.summary);
    this.titleEl.setText(ui.title);
    this.contentEl.empty();
    this.contentEl.addClass("note-reader-cosyvoice-export-modal");
    this.contentEl.createEl("p", { text: ui.description });
    const summaryEl = this.contentEl.createEl("dl", { cls: "note-reader-cosyvoice-export-summary" });
    const addSummaryRow = (label, value) => {
      summaryEl.createEl("dt", { text: label });
      summaryEl.createEl("dd", { text: String(value) });
    };
    addSummaryRow(ui.fileLabel, this.summary.fileName);
    addSummaryRow(ui.scopeLabel, ui.scopeValue);
    addSummaryRow(ui.engineLabel, this.summary.engineLabel);
    addSummaryRow(ui.locationLabel, this.summary.targetPath);
    addSummaryRow(ui.characterLabel, new Intl.NumberFormat().format(this.summary.textLength));
    addSummaryRow(ui.requestLabel, new Intl.NumberFormat().format(this.summary.chunkCount));
    this.contentEl.createDiv({
      cls: "note-reader-cosyvoice-export-warning",
      text: ui.quotaWarning
    });
    const acknowledgement = this.contentEl.createEl("label", {
      cls: "note-reader-cosyvoice-export-acknowledgement"
    });
    const checkbox = acknowledgement.createEl("input", {
      attr: { type: "checkbox" }
    });
    acknowledgement.createSpan({ text: ui.acknowledge });
    const actions = this.contentEl.createDiv({ cls: "note-reader-cosyvoice-export-actions" });
    const cancelButton = actions.createEl("button", { text: ui.cancel });
    const confirmButton = actions.createEl("button", {
      cls: "mod-cta",
      text: ui.confirm
    });
    confirmButton.disabled = true;
    checkbox.addEventListener("change", () => {
      confirmButton.disabled = !checkbox.checked;
    });
    cancelButton.addEventListener("click", () => this.finish(false));
    confirmButton.addEventListener("click", () => {
      if (checkbox.checked) {
        this.finish(true);
      }
    });
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveResult(false);
    }
  }
};
var CosyVoiceReaderPlugin = class extends Plugin {
  async onload() {
    this.sequence = 0;
    this.activeSession = null;
    this.currentAudio = null;
    this.currentProcess = null;
    this.currentRequests = /* @__PURE__ */ new Set();
    this.lastMarkdownView = null;
    this.lastReadableFile = null;
    this.lastPdfSelection = null;
    this.lastHtmlSelection = null;
    this.htmlSelectionObservers = /* @__PURE__ */ new Map();
    this.htmlSelectionTimers = /* @__PURE__ */ new Set();
    this.register(() => this.clearHtmlSelectionObservers());
    this.pendingAudioMerge = null;
    this.pauseRequested = false;
    this.readerState = createReaderState();
    this.readerViews = /* @__PURE__ */ new Set();
    this.vaultBasePath = null;
    this.cacheDir = null;
    this.legacyCacheDir = null;
    this.legacyLogPath = null;
    this.logPath = null;
    this.statusBar = this.addStatusBarItem();
    await this.loadSettings();
    await this.ensureCacheDir();
    this.registerView(VIEW_TYPE, (leaf) => new CosyVoiceReaderView(leaf, this));
    this.lastMarkdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const initiallyActiveFile = typeof this.app.workspace.getActiveFile === "function" ? this.app.workspace.getActiveFile() : null;
    if (isMarkdownFile(initiallyActiveFile) || isPdfFile(initiallyActiveFile) || isHtmlFile(initiallyActiveFile)) {
      this.lastReadableFile = initiallyActiveFile;
    }
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.editor) {
          this.lastMarkdownView = view;
        }
        const file = typeof this.app.workspace.getActiveFile === "function" ? this.app.workspace.getActiveFile() : null;
        if (isMarkdownFile(file) || isPdfFile(file) || isHtmlFile(file)) {
          this.lastReadableFile = file;
        }
        this.observeHtmlSelections();
        this.renderReaderViews();
      })
    );
    if (typeof document !== "undefined") {
      this.registerDomEvent(document, "selectionchange", () => {
        this.capturePdfSelection();
      });
    }
    if (typeof window !== "undefined" && typeof this.registerInterval === "function") {
      this.registerInterval(window.setInterval(() => this.observeHtmlSelections(), 750));
      this.observeHtmlSelections();
    }
    this.addRibbonIcon("volume-2", "Open voice reader controls", () => {
      void this.activateControlView();
    });
    this.addCommand({
      id: "open-control-panel",
      name: "Open voice reader controls",
      callback: () => {
        void this.activateControlView();
      }
    });
    this.addCommand({
      id: "read-current-note",
      name: "Read current note, PDF or HTML aloud",
      callback: () => {
        void this.runUserAction("Read file", () => this.readCurrentNote());
      }
    });
    this.addCommand({
      id: "export-current-note-audio",
      name: "Export audio from current note, PDF or HTML",
      checkCallback: (checking) => {
        if (!this.canExportCurrentFile()) {
          return false;
        }
        if (!checking) {
          void this.runUserAction("Export audio", () => this.exportCurrentFileAudio({ insertAfterExport: false }));
        }
        return true;
      }
    });
    this.addCommand({
      id: "export-current-note-audio-and-insert",
      name: "Export audio from the current note and insert it",
      checkCallback: (checking) => {
        if (!this.canInsertAudioExportIntoCurrentNote()) {
          return false;
        }
        if (!checking) {
          void this.runUserAction("Export and insert audio", () => this.exportCurrentFileAudio({ insertAfterExport: true }));
        }
        return true;
      }
    });
    this.addCommand({
      id: "retry-audio-export-merge",
      name: "Retry pending audio export merge only",
      checkCallback: (checking) => {
        if (!this.hasPendingAudioMerge()) {
          return false;
        }
        if (!checking) {
          void this.runUserAction("Retry merge only", () => this.retryPendingAudioMerge());
        }
        return true;
      }
    });
    this.addCommand({
      id: "resume-current-file",
      name: "Resume reading current note, PDF or HTML",
      checkCallback: (checking) => {
        if (!this.canResumeCurrentFile()) {
          return false;
        }
        if (!checking) {
          void this.runUserAction("Resume reading", () => this.resumeCurrentFile());
        }
        return true;
      }
    });
    this.addCommand({
      id: "read-current-pdf",
      name: "Read current PDF aloud",
      checkCallback: (checking) => {
        const file = typeof this.app.workspace.getActiveFile === "function" ? this.app.workspace.getActiveFile() : null;
        if (!isPdfFile(file)) {
          return false;
        }
        if (!checking) {
          void this.readCurrentPdf(file);
        }
        return true;
      }
    });
    this.addCommand({
      id: "read-current-pdf-from-selection",
      name: "Read current PDF from selection aloud",
      checkCallback: (checking) => {
        const file = typeof this.app.workspace.getActiveFile === "function" ? this.app.workspace.getActiveFile() : null;
        if (!isPdfFile(file)) {
          return false;
        }
        if (!checking) {
          void this.readCurrentPdfFromSelection(file);
        }
        return true;
      }
    });
    this.addCommand({
      id: "read-selection",
      name: "Read selection aloud",
      callback: () => {
        void this.runUserAction("Read selection", () => this.readSelection());
      }
    });
    this.addCommand({
      id: "read-from-selection",
      name: "Read from selection aloud",
      callback: () => {
        void this.runUserAction("Read from selection", () => this.readFromSelection());
      }
    });
    this.addCommand({
      id: "pause-or-resume",
      name: "Pause or resume voice reading",
      callback: () => {
        void this.pauseOrResume();
      }
    });
    this.addCommand({
      id: "seek-backward-5-seconds",
      name: "Seek backward 5 seconds",
      checkCallback: (checking) => {
        if (!this.readerState.canSeek) {
          return false;
        }
        if (!checking) {
          this.seekCurrentAudioBySeconds(-KEYBOARD_SEEK_SECONDS);
        }
        return true;
      }
    });
    this.addCommand({
      id: "seek-forward-5-seconds",
      name: "Seek forward 5 seconds",
      checkCallback: (checking) => {
        if (!this.readerState.canSeek) {
          return false;
        }
        if (!checking) {
          this.seekCurrentAudioBySeconds(KEYBOARD_SEEK_SECONDS);
        }
        return true;
      }
    });
    this.addCommand({
      id: "previous-reading-chunk",
      name: "Move to previous reading chunk",
      checkCallback: (checking) => {
        if (!this.readerState.canPreviousChunk) {
          return false;
        }
        if (!checking) {
          this.jumpToAdjacentChunk(-1);
        }
        return true;
      }
    });
    this.addCommand({
      id: "next-reading-chunk",
      name: "Move to next reading chunk",
      checkCallback: (checking) => {
        if (!this.readerState.canNextChunk) {
          return false;
        }
        if (!checking) {
          this.jumpToAdjacentChunk(1);
        }
        return true;
      }
    });
    this.addCommand({
      id: "stop-reading",
      name: "Stop voice reading",
      callback: () => {
        void this.stopReading();
      }
    });
    this.addSettingTab(new CosyVoiceReaderSettingTab(this.app, this));
    this.register(() => {
      void this.stopReading({ silent: true });
    });
    this.updateStatus("CosyVoice idle");
  }
  async onunload() {
    this.clearHtmlSelectionObservers();
    for (const timer of this.htmlSelectionTimers || []) clearTimeout(timer);
    if (this.htmlSelectionTimers) this.htmlSelectionTimers.clear();
    this.lastHtmlSelection = null;
    await this.stopReading({ silent: true });
    if (this.settings && this.settings.cleanupCache) {
      await this.discardPendingAudioMerge({ silent: true });
    }
  }
  async loadSettings() {
    const defaults = createDefaultSettings();
    const savedSettings = await this.loadData();
    const source = savedSettings && typeof savedSettings === "object" ? savedSettings : {};
    const removedObsoleteSettings = Object.keys(source).some(
      (key) => !Object.prototype.hasOwnProperty.call(defaults, key)
    );
    const missingKnownSettings = Object.keys(defaults).some(
      (key) => !Object.prototype.hasOwnProperty.call(source, key)
    );
    const hadAzureCredentialSource = Object.prototype.hasOwnProperty.call(source, "azureSpeechCredentialSource");
    const hadOpenRouterCredentialSource = Object.prototype.hasOwnProperty.call(source, "openRouterCredentialSource");
    this.settings = selectKnownSettings(defaults, source);
    this.settings.playbackVolume = normalizeVolume(this.settings.playbackVolume);
    this.settings.playbackSpeed = normalizeSpeed(this.settings.playbackSpeed);
    normalizeMimoSettings(this.settings);
    this.settings.audioExportFolder = normalizeAudioExportFolder(this.settings.audioExportFolder);
    this.settings.audioExportLocation = normalizeAudioExportLocation(this.settings.audioExportLocation);
    this.settings.speed = normalizeSpeed(this.settings.speed);
    this.settings.speechEngine = normalizeSpeechEngine(this.settings.speechEngine);
    this.settings.azureSpeechCloud = normalizeAzureSpeechCloud(this.settings.azureSpeechCloud);
    this.settings.azureSpeechConsent = this.settings.azureSpeechConsent === true;
    this.settings.azureSpeechCredentialSource = !hadAzureCredentialSource && String(source.azureSpeechKeyPath || "").trim() ? "key-file" : normalizeCredentialSource(this.settings.azureSpeechCredentialSource);
    this.settings.azureSpeechKeyPath = String(this.settings.azureSpeechKeyPath || "").trim();
    this.settings.azureSpeechRegion = normalizeAzureSpeechRegion(this.settings.azureSpeechRegion);
    this.settings.azureSpeechSecretName = String(this.settings.azureSpeechSecretName || "").trim();
    this.settings.azureSpeechVoice = normalizeAzureSpeechVoice(this.settings.azureSpeechVoice);
    this.settings.edgeTtsConsent = this.settings.edgeTtsConsent === true;
    this.settings.edgeTtsExecutable = normalizeEdgeTtsExecutable(this.settings.edgeTtsExecutable);
    this.settings.edgeTtsVoice = normalizeEdgeTtsVoice(this.settings.edgeTtsVoice);
    this.settings.diagnosticLogging = this.settings.diagnosticLogging === true;
    this.settings.mathReadingLanguage = normalizeMathReadingLanguage(this.settings.mathReadingLanguage);
    this.settings.openRouterConsent = this.settings.openRouterConsent === true;
    this.settings.openRouterCredentialSource = !hadOpenRouterCredentialSource && String(source.openRouterKeyPath || "").trim() ? "key-file" : normalizeCredentialSource(this.settings.openRouterCredentialSource);
    this.settings.openRouterKeyPath = String(this.settings.openRouterKeyPath || "").trim();
    this.settings.openRouterModel = normalizeOpenRouterModel(this.settings.openRouterModel);
    this.settings.openRouterSecretName = String(this.settings.openRouterSecretName || "").trim();
    this.settings.openRouterVoice = normalizeOpenRouterVoice(this.settings.openRouterVoice);
    this.settings.settingsLanguage = normalizeSettingsLanguage(this.settings.settingsLanguage);
    this.settings.scriptPath = String(this.settings.scriptPath || defaults.scriptPath);
    this.settings.chunkLimits = parseChunkLimits(this.settings.chunkLimits).join(",");
    this.settings.onlineChunkLimits = parseChunkLimits(
      this.settings.onlineChunkLimits,
      DEFAULT_ONLINE_CHUNK_LIMITS
    ).join(",");
    this.settings.onlinePrefetchChunks = normalizeOnlinePrefetchChunks(this.settings.onlinePrefetchChunks);
    this.settings.readingPositions = normalizeReadingPositions(this.settings.readingPositions);
    this.settings.rememberReadingPosition = this.settings.rememberReadingPosition === true;
    if (removedObsoleteSettings || missingKnownSettings) {
      await this.saveData(this.settings);
    }
  }
  async saveSettings() {
    this.settings = selectKnownSettings(createDefaultSettings(), this.settings);
    this.settings.playbackSpeed = normalizeSpeed(this.settings.playbackSpeed);
    this.settings.playbackVolume = normalizeVolume(this.settings.playbackVolume);
    normalizeMimoSettings(this.settings);
    this.settings.audioExportFolder = normalizeAudioExportFolder(this.settings.audioExportFolder);
    this.settings.audioExportLocation = normalizeAudioExportLocation(this.settings.audioExportLocation);
    this.settings.speed = normalizeSpeed(this.settings.speed);
    this.settings.speechEngine = normalizeSpeechEngine(this.settings.speechEngine);
    this.settings.azureSpeechCloud = normalizeAzureSpeechCloud(this.settings.azureSpeechCloud);
    this.settings.azureSpeechConsent = this.settings.azureSpeechConsent === true;
    this.settings.azureSpeechCredentialSource = normalizeCredentialSource(this.settings.azureSpeechCredentialSource);
    this.settings.azureSpeechKeyPath = String(this.settings.azureSpeechKeyPath || "").trim();
    this.settings.azureSpeechRegion = normalizeAzureSpeechRegion(this.settings.azureSpeechRegion);
    this.settings.azureSpeechSecretName = String(this.settings.azureSpeechSecretName || "").trim();
    this.settings.azureSpeechVoice = normalizeAzureSpeechVoice(this.settings.azureSpeechVoice);
    this.settings.edgeTtsConsent = this.settings.edgeTtsConsent === true;
    this.settings.edgeTtsExecutable = normalizeEdgeTtsExecutable(this.settings.edgeTtsExecutable);
    this.settings.edgeTtsVoice = normalizeEdgeTtsVoice(this.settings.edgeTtsVoice);
    this.settings.diagnosticLogging = this.settings.diagnosticLogging === true;
    this.settings.mathReadingLanguage = normalizeMathReadingLanguage(this.settings.mathReadingLanguage);
    this.settings.openRouterConsent = this.settings.openRouterConsent === true;
    this.settings.openRouterCredentialSource = normalizeCredentialSource(this.settings.openRouterCredentialSource);
    this.settings.openRouterKeyPath = String(this.settings.openRouterKeyPath || "").trim();
    this.settings.openRouterModel = normalizeOpenRouterModel(this.settings.openRouterModel);
    this.settings.openRouterSecretName = String(this.settings.openRouterSecretName || "").trim();
    this.settings.openRouterVoice = normalizeOpenRouterVoice(this.settings.openRouterVoice);
    this.settings.settingsLanguage = normalizeSettingsLanguage(this.settings.settingsLanguage);
    this.settings.chunkLimits = parseChunkLimits(this.settings.chunkLimits).join(",");
    this.settings.onlineChunkLimits = parseChunkLimits(
      this.settings.onlineChunkLimits,
      DEFAULT_ONLINE_CHUNK_LIMITS
    ).join(",");
    this.settings.onlinePrefetchChunks = normalizeOnlinePrefetchChunks(this.settings.onlinePrefetchChunks);
    this.settings.readingPositions = normalizeReadingPositions(this.settings.readingPositions);
    this.settings.rememberReadingPosition = this.settings.rememberReadingPosition === true;
    await this.saveData(this.settings);
  }
  async resetSettingsToDefaults() {
    this.settings = createDefaultSettings();
    if (this.currentAudio) {
      this.currentAudio.volume = this.settings.playbackVolume;
      this.currentAudio.playbackRate = this.settings.playbackSpeed;
      this.currentAudio.defaultPlaybackRate = this.settings.playbackSpeed;
    }
    await this.saveSettings();
    this.renderReaderViews();
  }
  async setSpeechSpeed(speed) {
    if (!this.settings) {
      this.settings = createDefaultSettings();
    }
    this.settings.speed = normalizeSpeed(speed);
    await this.saveSettings();
    this.renderReaderViews();
    return this.settings.speed;
  }
  async setPlaybackSpeed(value) {
    if (!this.settings) this.settings = createDefaultSettings();
    this.settings.playbackSpeed = normalizeSpeed(value);
    if (this.currentAudio) {
      this.currentAudio.preservesPitch = true;
      this.currentAudio.defaultPlaybackRate = this.settings.playbackSpeed;
      this.currentAudio.playbackRate = this.settings.playbackSpeed;
    }
    this.renderReaderViews();
    await this.saveSettings();
  }
  setPlaybackVolume(value) {
    if (!this.settings) this.settings = createDefaultSettings();
    this.settings.playbackVolume = normalizeVolume(value);
    if (this.currentAudio) this.currentAudio.volume = this.settings.playbackVolume;
    return this.settings.playbackVolume;
  }
  async ensureCacheDir() {
    const adapter = this.app.vault.adapter;
    if (!adapter || typeof adapter.getBasePath !== "function") {
      throw new Error("Note and PDF Voice Reader requires the desktop FileSystemAdapter.");
    }
    this.vaultBasePath = adapter.getBasePath();
    this.legacyCacheDir = path.join(this.vaultBasePath, ".obsidian", "plugins", PLUGIN_ID, "cache");
    this.legacyLogPath = path.join(this.vaultBasePath, ".obsidian", "plugins", PLUGIN_ID, "last-error.log");
    this.cacheDir = getPluginTempCacheDir(this.vaultBasePath);
    this.logPath = path.join(this.cacheDir, "diagnostic.log");
    await fs.promises.mkdir(this.cacheDir, { recursive: true });
    if (this.settings.cleanupCache) {
      await this.cleanupStaleTemporaryData();
    }
  }
  async cleanupOwnedFilesInDirectory(directoryPath) {
    if (!directoryPath) {
      return;
    }
    let entries;
    try {
      entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !isOwnedCacheFileName(entry.name)) {
        continue;
      }
      try {
        await fs.promises.unlink(path.join(directoryPath, entry.name));
      } catch (error) {
        if (!error || error.code !== "ENOENT") {
          console.warn(`[${PLUGIN_ID}] Could not remove stale temporary file`, entry.name, error);
        }
      }
    }
  }
  async removeLegacyRuntimeLog() {
    if (!this.legacyLogPath) {
      return;
    }
    try {
      await fs.promises.unlink(this.legacyLogPath);
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        console.warn(`[${PLUGIN_ID}] Could not remove legacy runtime log`, error);
      }
    }
  }
  async cleanupStaleTemporaryData() {
    await this.cleanupOwnedFilesInDirectory(this.cacheDir);
    await this.cleanupOwnedFilesInDirectory(this.legacyCacheDir);
    await this.removeLegacyRuntimeLog();
    if (this.legacyCacheDir) {
      try {
        await fs.promises.rmdir(this.legacyCacheDir);
      } catch (error) {
        if (!error || !["ENOENT", "ENOTEMPTY"].includes(error.code)) {
          console.warn(`[${PLUGIN_ID}] Could not remove empty legacy cache directory`, error);
        }
      }
    }
  }
  async clearTemporaryData() {
    await this.stopReading({ silent: true });
    this.pendingAudioMerge = null;
    await this.cleanupStaleTemporaryData();
    new Notice(getSettingsUiText(this.settings.settingsLanguage).temporaryDataClearedNotice);
  }
  async activateControlView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) {
        new Notice("CosyVoice: unable to open reader controls.");
        return null;
      }
      await leaf.setViewState({
        type: VIEW_TYPE,
        active: true
      });
    }
    this.app.workspace.revealLeaf(leaf);
    return leaf;
  }
  registerReaderView(view) {
    this.readerViews.add(view);
    view.render();
  }
  unregisterReaderView(view) {
    this.readerViews.delete(view);
  }
  renderReaderViews() {
    for (const view of this.readerViews) {
      view.render();
    }
  }
  setReaderState(patch) {
    this.readerState = createReaderState({
      ...this.readerState,
      ...patch
    });
    this.renderReaderViews();
  }
  async runUserAction(label, action) {
    try {
      return await action();
    } catch (error) {
      const message = messageFromError(error);
      if (!this.activeSession) {
        this.updateStatus(`CosyVoice ${label} error`, {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          error: message,
          isPaused: false,
          phase: "error",
          status: "error"
        });
      }
      if (typeof this.writeRuntimeLog === "function") {
        await this.writeRuntimeLog("failed", { message: `${label}: ${message}` });
      }
      new Notice(`CosyVoice ${label} failed: ${message}`, 1e4);
      return null;
    }
  }
  capturePdfSelection() {
    if (typeof document === "undefined" || typeof document.getSelection !== "function") {
      return null;
    }
    const selection = document.getSelection();
    const selectedText = selection && typeof selection.toString === "function" ? selection.toString().trim() : "";
    if (!selectedText) {
      return null;
    }
    const workspace = this.app && this.app.workspace;
    const leaves = workspace && typeof workspace.getLeavesOfType === "function" ? workspace.getLeavesOfType("pdf") : [];
    const activeFile = workspace && typeof workspace.getActiveFile === "function" ? workspace.getActiveFile() : null;
    const context = getPdfSelectionContext(selection, leaves, activeFile);
    this.lastPdfSelection = context;
    return context;
  }
  getPdfSelectionForFile(file) {
    const liveSelection = this.capturePdfSelection();
    const context = liveSelection || this.lastPdfSelection;
    return context && context.filePath === getPdfFileIdentity(file) ? context : null;
  }
  getHtmlReaderLeaves() {
    const workspace = this.app && this.app.workspace;
    return workspace && typeof workspace.getLeavesOfType === "function" ? workspace.getLeavesOfType("html-view") || [] : [];
  }
  observeHtmlSelections() {
    if (!this.htmlSelectionObservers) this.htmlSelectionObservers = /* @__PURE__ */ new Map();
    if (!this.htmlSelectionTimers) this.htmlSelectionTimers = /* @__PURE__ */ new Set();
    const currentDocuments = /* @__PURE__ */ new Set();
    for (const leaf of this.getHtmlReaderLeaves()) {
      const view = leaf && leaf.view;
      const doc = getHtmlReaderDocument(view);
      if (!isHtmlFile(view && view.file) || !doc || typeof doc.addEventListener !== "function") continue;
      currentDocuments.add(doc);
      if (this.htmlSelectionObservers.has(doc)) continue;
      const filePath = getPdfFileIdentity(view.file);
      let timer = null;
      const capture = () => {
        if (timer) {
          clearTimeout(timer);
          this.htmlSelectionTimers.delete(timer);
        }
        timer = setTimeout(() => {
          this.htmlSelectionTimers.delete(timer);
          timer = null;
          if (getHtmlReaderDocument(view) !== doc || getPdfFileIdentity(view.file) !== filePath) return;
          const context = captureHtmlSelection(doc, filePath, getFileMtime(view.file));
          if (context) this.lastHtmlSelection = context;
        }, 100);
        this.htmlSelectionTimers.add(timer);
      };
      const events = ["selectionchange", "mouseup", "keyup"];
      for (const event of events) doc.addEventListener(event, capture);
      this.htmlSelectionObservers.set(doc, () => {
        for (const event of events) doc.removeEventListener(event, capture);
        if (timer) {
          clearTimeout(timer);
          this.htmlSelectionTimers.delete(timer);
        }
      });
    }
    for (const [doc, dispose] of this.htmlSelectionObservers) {
      if (!currentDocuments.has(doc)) {
        dispose();
        this.htmlSelectionObservers.delete(doc);
      }
    }
  }
  clearHtmlSelectionObservers() {
    for (const dispose of (this.htmlSelectionObservers || /* @__PURE__ */ new Map()).values()) dispose();
    if (this.htmlSelectionObservers) this.htmlSelectionObservers.clear();
  }
  getHtmlSelectionForFile(file) {
    const filePath = getPdfFileIdentity(file);
    for (const leaf of this.getHtmlReaderLeaves()) {
      const view = leaf && leaf.view;
      if (getPdfFileIdentity(view && view.file) !== filePath) continue;
      const context2 = captureHtmlSelection(getHtmlReaderDocument(view), filePath, getFileMtime(file));
      if (context2) {
        this.lastHtmlSelection = context2;
        return context2;
      }
    }
    const context = this.lastHtmlSelection;
    return context && context.filePath === filePath && context.fileMtime === getFileMtime(file) ? context : null;
  }
  async getHtmlFileText(file) {
    if (file.stat && file.stat.size > MAX_HTML_BYTES) throw new Error("HTML file exceeds the 50 MiB size limit.");
    return extractHtmlText(await this.app.vault.cachedRead(file));
  }
  prepareHtmlSpeechText(text) {
    return sanitizeLatexForSpeech(verbalizeNumericCitationsForSpeech(normalizeLineBreaks(text)), {
      mathReadingLanguage: this.settings.mathReadingLanguage
    }).trim();
  }
  async readCurrentHtml(file, scope = "entire", options = {}) {
    let text;
    if (scope === "entire") {
      text = await this.getHtmlFileText(file);
    } else {
      const context = this.getHtmlSelectionForFile(file);
      if (!context) {
        new Notice(normalizeSettingsLanguage(this.settings.settingsLanguage) === "chinese" ? "\u8BF7\u5148\u5728 HTML Reader \u4E2D\u9009\u4E2D\u6587\u5B57\uFF0C\u518D\u4F7F\u7528\u9009\u533A\u6717\u8BFB\u3002" : "Select text in HTML Reader before using a selection reading action.", 8e3);
        return;
      }
      text = scope === "selection" ? context.selectedText : context.text.slice(context.startOffset);
    }
    if (options.resumePosition) {
      const resumed = sliceTextFromReadingPosition(this.prepareHtmlSpeechText(text), options.resumePosition);
      text = resumed.text;
      if (!resumed.matched) new Notice("CosyVoice HTML: saved text changed; reading from the beginning.", 8e3);
    }
    await this.activateControlView();
    await this.startReading(text, `${file.basename || file.name || "HTML"} (HTML: ${getAudioExportScopeLabel(this.settings.settingsLanguage, scope)})`, {
      file,
      plainText: true,
      sourceKind: scope === "selection" ? "" : "html"
    });
  }
  getCurrentReadableFile() {
    const workspace = this.app && this.app.workspace;
    const activeFile = workspace && typeof workspace.getActiveFile === "function" ? workspace.getActiveFile() : null;
    if (activeFile) {
      if (isMarkdownFile(activeFile) || isPdfFile(activeFile) || isHtmlFile(activeFile)) {
        this.lastReadableFile = activeFile;
      }
      return activeFile;
    }
    return this.lastReadableFile || null;
  }
  findMarkdownViewForFile(file) {
    if (!isMarkdownFile(file)) {
      return null;
    }
    const targetPath = getPdfFileIdentity(file);
    const workspace = this.app && this.app.workspace;
    const candidates = [];
    if (workspace && typeof workspace.getActiveViewOfType === "function") {
      candidates.push(workspace.getActiveViewOfType(MarkdownView));
    }
    candidates.push(this.lastMarkdownView);
    if (workspace && typeof workspace.getLeavesOfType === "function") {
      const leaves = workspace.getLeavesOfType("markdown");
      for (const leaf of Array.isArray(leaves) ? leaves : []) {
        candidates.push(leaf && leaf.view);
      }
    }
    const view = candidates.find((candidate) => candidate && candidate.editor && getPdfFileIdentity(candidate.file) === targetPath);
    if (view) {
      this.lastMarkdownView = view;
    }
    return view || null;
  }
  getCurrentMarkdownContext(options = {}) {
    const notify = options.notify !== false;
    const file = this.getCurrentReadableFile();
    const view = this.findMarkdownViewForFile(file);
    if (!file || !view) {
      if (notify) {
        new Notice("CosyVoice: open a Markdown note before using this action.", 8e3);
      }
      return null;
    }
    return { file, view };
  }
  getActiveMarkdownView() {
    const context = this.getCurrentMarkdownContext({ notify: true });
    return context ? context.view : null;
  }
  getCurrentAudioExportContext(options = {}) {
    const notify = options.notify !== false;
    const file = this.getCurrentReadableFile();
    if (isMarkdownFile(file)) {
      const view = this.findMarkdownViewForFile(file);
      if (!view || !view.editor) {
        if (notify) {
          new Notice("CosyVoice: open the Markdown note before exporting audio.", 8e3);
        }
        return null;
      }
      const documentText = String(view.editor.getValue() || "");
      const selectionText = typeof view.editor.getSelection === "function" ? String(view.editor.getSelection() || "") : "";
      const selectionStart = typeof view.editor.getCursor === "function" ? view.editor.getCursor("from") : null;
      return {
        documentKind: "markdown",
        documentText,
        file,
        fileMtime: getFileMtime(file),
        fileName: file.basename || file.name || "note",
        hasSelection: Boolean(selectionText.trim()),
        selectionStart,
        selectionText,
        view
      };
    }
    if (isPdfFile(file)) {
      const selectionContext = this.getPdfSelectionForFile(file);
      return {
        documentKind: "pdf",
        file,
        fileMtime: getFileMtime(file),
        fileName: file.basename || file.name || "PDF",
        hasSelection: Boolean(selectionContext && selectionContext.selectedText),
        selectionContext
      };
    }
    if (isHtmlFile(file)) {
      const selectionContext = options.captureSelection === false ? null : this.getHtmlSelectionForFile(file);
      return {
        documentKind: "html",
        file,
        fileMtime: getFileMtime(file),
        fileName: file.basename || file.name || "HTML",
        hasSelection: Boolean(selectionContext && selectionContext.selectedText),
        selectionContext
      };
    }
    if (notify) {
      new Notice("CosyVoice: open a Markdown note, text-based PDF or HTML file before exporting audio.", 8e3);
    }
    return null;
  }
  canExportCurrentFile() {
    return Boolean(this.getCurrentAudioExportContext({ notify: false, captureSelection: false }));
  }
  canInsertAudioExportIntoCurrentNote() {
    const context = this.getCurrentAudioExportContext({ notify: false, captureSelection: false });
    return Boolean(context && context.documentKind === "markdown");
  }
  canExportCurrentNote() {
    return this.canInsertAudioExportIntoCurrentNote();
  }
  getCurrentNoteExportContext() {
    return this.getCurrentMarkdownContext({ notify: true });
  }
  requestAudioExportScope(context) {
    const modal = new AudioExportScopeModal(
      this.app,
      this.settings && this.settings.settingsLanguage,
      context
    );
    return modal.openAndWait();
  }
  requestAudioExportConfirmation(summary) {
    const modal = new AudioExportConfirmModal(
      this.app,
      this.settings && this.settings.settingsLanguage,
      summary
    );
    return modal.openAndWait();
  }
  async getAudioExportTargetPlan(noteFile, extension, scope = "entire") {
    const normalizedExtension = String(extension || "").trim().toLowerCase().replace(/^\./, "");
    if (!["mp3", "wav"].includes(normalizedExtension)) {
      throw new Error("The selected speech engine returned an unsupported export format.");
    }
    const fileName = buildExportAudioFileName(
      noteFile && (noteFile.basename || noteFile.name) || "note",
      normalizedExtension,
      normalizeAudioExportScope(scope)
    );
    const location = normalizeAudioExportLocation(
      this.settings && this.settings.audioExportLocation
    );
    let requestedPath = "";
    if (location === "obsidian-attachment" && this.app.fileManager && typeof this.app.fileManager.getAvailablePathForAttachment === "function") {
      requestedPath = await this.app.fileManager.getAvailablePathForAttachment(
        fileName,
        noteFile && noteFile.path
      );
    } else {
      let folder = "";
      if (location === "custom-folder") {
        folder = normalizeAudioExportFolder(this.settings && this.settings.audioExportFolder);
        if (!folder) {
          throw new Error("Choose a valid custom audio folder in the plugin settings before exporting.");
        }
      } else {
        const noteFolder = path.posix.dirname(String(noteFile && noteFile.path || ""));
        folder = noteFolder && noteFolder !== "." ? noteFolder : "";
      }
      requestedPath = folder ? `${folder}/${fileName}` : fileName;
    }
    return {
      location,
      targetPath: getAvailableVaultAudioPath(this.app.vault, requestedPath)
    };
  }
  async ensureAudioExportFolder(folderPath) {
    const normalizedFolder = normalizeAudioExportFolder(folderPath);
    if (!normalizedFolder) {
      return;
    }
    const vault = this.app && this.app.vault;
    if (!vault || typeof vault.getAbstractFileByPath !== "function" || typeof vault.createFolder !== "function") {
      throw new Error("This Obsidian version cannot create the custom audio export folder.");
    }
    let currentPath = "";
    for (const segment of normalizedFolder.split("/")) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const existing = vault.getAbstractFileByPath(currentPath);
      if (existing) {
        if (!Array.isArray(existing.children)) {
          throw new Error(`Cannot create the audio export folder because ${currentPath} is a file.`);
        }
        continue;
      }
      try {
        await vault.createFolder(currentPath);
      } catch (error) {
        const concurrentlyCreated = vault.getAbstractFileByPath(currentPath);
        if (!concurrentlyCreated || !Array.isArray(concurrentlyCreated.children)) {
          throw error;
        }
      }
    }
  }
  async createVaultAudioAttachment(noteFile, temporaryAudioPath, extension, targetPlan = null) {
    if (!this.app.vault || typeof this.app.vault.createBinary !== "function") {
      throw new Error("This Obsidian version cannot create binary attachments.");
    }
    const normalizedExtension = String(extension || "").trim().toLowerCase().replace(/^\./, "");
    const plan = targetPlan && targetPlan.targetPath ? {
      location: normalizeAudioExportLocation(targetPlan.location),
      targetPath: targetPlan.targetPath
    } : await this.getAudioExportTargetPlan(noteFile, normalizedExtension);
    let targetPath = normalizeVaultRelativeAudioPath(plan.targetPath);
    if (!targetPath || path.posix.extname(targetPath).toLowerCase() !== `.${normalizedExtension}`) {
      throw new Error("Obsidian returned an invalid attachment path for the exported audio.");
    }
    if (typeof this.app.vault.getAbstractFileByPath === "function" && this.app.vault.getAbstractFileByPath(targetPath)) {
      targetPath = getAvailableVaultAudioPath(this.app.vault, targetPath);
    }
    if (plan.location === "custom-folder") {
      const targetFolder = path.posix.dirname(targetPath);
      await this.ensureAudioExportFolder(targetFolder === "." ? "" : targetFolder);
    }
    const audioBytes = await fs.promises.readFile(temporaryAudioPath);
    if (!audioBytes.length || audioBytes.length > MAX_EXPORTED_AUDIO_BYTES) {
      throw new Error(`The exported audio is empty or exceeds the ${Math.floor(MAX_EXPORTED_AUDIO_BYTES / (1024 * 1024))} MB safety limit.`);
    }
    return this.app.vault.createBinary(targetPath, bufferToArrayBuffer(audioBytes));
  }
  async insertAudioAttachmentIntoNote(noteFile, audioFile) {
    const generatedLink = this.app.fileManager && typeof this.app.fileManager.generateMarkdownLink === "function" ? this.app.fileManager.generateMarkdownLink(audioFile, noteFile.path) : `[[${audioFile.path}]]`;
    const embed = generatedLink.startsWith("!") ? generatedLink : `!${generatedLink}`;
    const workspace = this.app && this.app.workspace;
    const activeView = workspace && typeof workspace.getActiveViewOfType === "function" ? workspace.getActiveViewOfType(MarkdownView) : null;
    if (activeView && activeView.editor && getPdfFileIdentity(activeView.file) === getPdfFileIdentity(noteFile)) {
      activeView.editor.replaceRange(`
${embed}
`, activeView.editor.getCursor());
      return "cursor";
    }
    if (this.app.vault && typeof this.app.vault.process === "function") {
      await this.app.vault.process(noteFile, (content) => {
        const trimmed = String(content || "").replace(/\s*$/, "");
        return `${trimmed}${trimmed ? "\n\n" : ""}${embed}
`;
      });
      return "end";
    }
    throw new Error("The audio was exported, but the original note is no longer open and cannot be updated safely.");
  }
  getPendingAudioMerge() {
    const pending = this.pendingAudioMerge;
    const preparedPaths = pending && Array.isArray(pending.preparedPaths) ? pending.preparedPaths : [];
    const isValid = Boolean(
      pending && preparedPaths.length && preparedPaths.every((filePath) => this.cacheDir && isInsideDirectory(filePath, this.cacheDir) && fs.existsSync(filePath))
    );
    if (!isValid) {
      this.pendingAudioMerge = null;
      return null;
    }
    return pending;
  }
  hasPendingAudioMerge() {
    return Boolean(this.getPendingAudioMerge());
  }
  preservePendingAudioMerge(job, session) {
    const preparedPaths = Array.isArray(job && job.preparedPaths) ? job.preparedPaths.filter((filePath) => this.cacheDir && isInsideDirectory(filePath, this.cacheDir) && fs.existsSync(filePath)) : [];
    if (!preparedPaths.length) {
      return false;
    }
    this.pendingAudioMerge = {
      ...job,
      preparedPaths: preparedPaths.slice()
    };
    if (session) {
      session.preservedAudioPaths = preparedPaths.slice();
    }
    this.renderReaderViews();
    return true;
  }
  async discardPendingAudioMerge(options = {}) {
    const pending = this.pendingAudioMerge;
    this.pendingAudioMerge = null;
    const paths = pending ? [
      ...Array.isArray(pending.preparedPaths) ? pending.preparedPaths : [],
      pending.temporaryOutputPath
    ].filter(Boolean) : [];
    for (const filePath of paths) {
      await this.removeTempFile(filePath);
    }
    this.renderReaderViews();
    if (!options.silent && pending) {
      new Notice("CosyVoice: kept export segments were removed.");
    }
  }
  createAudioMergeRetryError(error, segmentCount, stage = "merge") {
    const action = stage === "merge" ? "Audio merging" : "Audio export finalization";
    const retryError = new Error(
      `${action} failed: ${messageFromError(error)} ${segmentCount} synthesized segments were kept locally. Use "Retry merge only"; it reuses those files and does not call the TTS API again.`
    );
    retryError.code = "AUDIO_MERGE_RETRY_AVAILABLE";
    retryError.cause = error;
    return retryError;
  }
  async finalizeMergedAudioExport(job, merged, session) {
    const audioFile = await this.createVaultAudioAttachment(
      job.context.file,
      job.temporaryOutputPath,
      job.extension,
      job.exportPlan
    );
    if (!this.isActive(session)) {
      new Notice(`CosyVoice: the completed audio was saved to ${audioFile.path} after export was stopped.`, 1e4);
      return audioFile;
    }
    let insertionLocation = "";
    let insertionError = null;
    if (job.insertAfterExport) {
      try {
        insertionLocation = await this.insertAudioAttachmentIntoNote(job.context.file, audioFile);
      } catch (error) {
        insertionError = error;
      }
    }
    this.updateStatus(`${job.configuration.engineLabel} audio export complete`, {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: false,
      currentChunk: job.preparedPaths.length,
      currentText: audioFile.path,
      error: insertionError ? messageFromError(insertionError) : "",
      isPaused: false,
      phase: "complete",
      progress: 1,
      status: "complete",
      totalChunks: job.preparedPaths.length
    });
    await this.writeRuntimeLog("audio-export-complete", {
      bytes: merged.bytes,
      chunks: job.preparedPaths.length,
      documentKind: job.context.documentKind,
      inserted: Boolean(insertionLocation),
      scope: job.scope
    });
    this.activeSession = null;
    const insertedMessage = insertionLocation === "cursor" ? " and inserted at the current cursor" : insertionLocation === "end" ? " and appended to the original note" : "";
    if (insertionError) {
      new Notice(
        `CosyVoice: audio was exported to ${audioFile.path}, but it could not be inserted: ${messageFromError(insertionError)}`,
        12e3
      );
    } else {
      new Notice(`CosyVoice: exported ${audioFile.path}${insertedMessage}.`, 1e4);
    }
    return audioFile;
  }
  async retryPendingAudioMerge() {
    const job = this.getPendingAudioMerge();
    if (!job) {
      new Notice("CosyVoice: no synthesized export segments are available for merge retry.", 6e3);
      this.renderReaderViews();
      return null;
    }
    await this.activateControlView();
    await this.stopReading({ silent: true });
    this.pauseRequested = false;
    const segmentCount = job.preparedPaths.length;
    const session = this.createSpeechSession(
      Array.from({ length: segmentCount }, () => "kept audio segment"),
      job.sourceLabel,
      job.configuration,
      {
        file: job.context.file,
        kind: "audio-export",
        sourceKind: job.context.documentKind
      }
    );
    session.files.push(...job.preparedPaths, job.temporaryOutputPath);
    this.activeSession = session;
    this.updateStatus(`${job.configuration.engineLabel} retrying merge`, {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: true,
      currentChunk: segmentCount,
      currentText: `Combining ${segmentCount} kept synthesized segments without new TTS requests...`,
      error: "",
      isPaused: false,
      phase: "synthesizing",
      progress: 0.99,
      source: job.sourceLabel,
      status: "running",
      totalChunks: segmentCount
    });
    new Notice(
      `CosyVoice: retrying the merge from ${segmentCount} kept segments. No TTS API request will be made.`,
      8e3
    );
    try {
      const merged = await mergeAudioFiles(
        job.preparedPaths,
        job.temporaryOutputPath,
        job.extension
      );
      if (!this.isActive(session)) {
        throw new Error("Audio export stopped.");
      }
      const audioFile = await this.finalizeMergedAudioExport(job, merged, session);
      this.pendingAudioMerge = null;
      this.renderReaderViews();
      return audioFile;
    } catch (error) {
      if (this.isActive(session)) {
        this.preservePendingAudioMerge(job, session);
        const retryError = error && error.code === "AUDIO_MERGE_RETRY_AVAILABLE" ? error : this.createAudioMergeRetryError(error, segmentCount, "merge");
        const message = messageFromError(retryError);
        this.updateStatus(`${job.configuration.engineLabel} merge retry error`, {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          error: message,
          isPaused: false,
          phase: "error",
          status: "error"
        });
        await this.writeRuntimeLog("failed", { message });
        new Notice(`CosyVoice merge retry failed: ${message}`, 12e3);
        await this.cancelSessionOperations(session);
        this.activeSession = null;
        this.renderReaderViews();
      }
      return null;
    } finally {
      if (this.settings.cleanupCache) {
        await this.cleanupSessionFiles(session, {
          preservePaths: session.preservedAudioPaths
        });
      }
    }
  }
  sanitizeAudioExportText(value) {
    return this.settings.stripMarkdown ? sanitizeTextForSpeech(value, {
      mathReadingLanguage: this.settings.mathReadingLanguage
    }) : normalizeLineBreaks(value).trim();
  }
  isAudioExportContextCurrent(context) {
    const currentFile = this.getCurrentReadableFile();
    if (!currentFile || getPdfFileIdentity(currentFile) !== getPdfFileIdentity(context.file)) {
      return false;
    }
    if (context.documentKind === "markdown") {
      const view = this.findMarkdownViewForFile(currentFile);
      return Boolean(view && view.editor && String(view.editor.getValue() || "") === context.documentText);
    }
    return getFileMtime(currentFile) === context.fileMtime;
  }
  async extractPdfAudioExportText(context, scope, configuration) {
    await this.activateControlView();
    await this.stopReading({ silent: true });
    this.pauseRequested = false;
    const sourceLabel = `${context.fileName} (PDF export preparation)`;
    const session = this.createSpeechSession([], sourceLabel, configuration, {
      file: context.file,
      kind: "audio-export",
      sourceKind: "pdf"
    });
    this.activeSession = session;
    this.updateStatus("PDF export preparation", {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: true,
      currentChunk: 0,
      currentText: scope === "from-selection" ? `Extracting PDF from page ${context.selectionContext.pageNumber}...` : "Extracting complete PDF text...",
      error: "",
      isPaused: false,
      phase: "extracting PDF",
      progress: 0,
      source: sourceLabel,
      status: "running",
      totalChunks: 0
    });
    try {
      const selectionContext = scope === "from-selection" ? context.selectionContext : null;
      const extractedText = await this.extractPdfText(context.file, session, {
        reportProgress: true,
        selectedText: selectionContext ? selectionContext.selectedText : "",
        selectionPosition: selectionContext ? selectionContext.selectionPosition : null,
        startPageNumber: selectionContext ? selectionContext.pageNumber : 1
      });
      if (!this.isActive(session)) {
        return null;
      }
      if (selectionContext && session.pdfSelectionMatched === false) {
        throw new Error("The selected PDF position could not be matched reliably. Select a slightly longer phrase and try again.");
      }
      const text = this.sanitizeAudioExportText(extractedText);
      if (!text) {
        throw new Error("No extractable text was found. This PDF may be scanned or image-only; run OCR first and try again.");
      }
      this.updateStatus("PDF export preparation complete", {
        canPause: false,
        canNextChunk: false,
        canPreviousChunk: false,
        canSeek: false,
        canStop: false,
        currentText: previewText(text),
        isPaused: false,
        phase: "complete",
        progress: 1,
        status: "complete"
      });
      session.stopped = true;
      this.activeSession = null;
      return text;
    } catch (error) {
      if (this.isActive(session)) {
        const message = getPdfExtractionErrorMessage(error);
        this.updateStatus("PDF export preparation error", {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          error: message,
          isPaused: false,
          phase: "error",
          status: "error"
        });
        await this.writeRuntimeLog("failed", { message });
        new Notice(`CosyVoice PDF export failed: ${message}`, 1e4);
        await this.cancelSessionOperations(session);
        this.activeSession = null;
      }
      return null;
    } finally {
      if (this.settings.cleanupCache) {
        await this.cleanupSessionFiles(session);
      }
    }
  }
  async exportCurrentFileAudio(options = {}) {
    if (this.hasPendingAudioMerge()) {
      new Notice(
        'CosyVoice: a previous export is waiting for "Retry merge only". Retry it first, or use Clear temporary data in settings to discard the kept segments.',
        12e3
      );
      return null;
    }
    const context = this.getCurrentAudioExportContext({ notify: true });
    if (!context) {
      return null;
    }
    if (options.expectedDocumentKind && context.documentKind !== options.expectedDocumentKind) {
      new Notice("CosyVoice: open a Markdown note before using this action.", 8e3);
      return null;
    }
    const insertAfterExport = options.insertAfterExport === true;
    if (insertAfterExport && context.documentKind !== "markdown") {
      new Notice("CosyVoice: PDF or HTML audio can be saved as an attachment. Inserting audio is available for Markdown notes only.", 8e3);
      return null;
    }
    const scope = Object.prototype.hasOwnProperty.call(options, "scope") ? normalizeAudioExportScope(options.scope) : await this.requestAudioExportScope(context);
    if (!scope) {
      return null;
    }
    if (scope !== "entire" && !context.hasSelection) {
      new Notice("CosyVoice: select text before using the selected-text export scopes.", 8e3);
      return null;
    }
    const configuration = this.getSpeechConfiguration();
    if (!configuration) {
      return null;
    }
    const extension = getAudioExportExtension(configuration.speechEngine);
    const exportPlan = await this.getAudioExportTargetPlan(context.file, extension, scope);
    let text = "";
    if (context.documentKind === "markdown") {
      text = this.sanitizeAudioExportText(selectMarkdownAudioExportText(
        context.documentText,
        context.selectionText,
        context.selectionStart,
        scope
      ));
    } else if (context.documentKind === "html") {
      const htmlText = scope === "entire" ? await this.getHtmlFileText(context.file) : scope === "selection" ? context.selectionContext.selectedText : context.selectionContext.text.slice(context.selectionContext.startOffset);
      text = this.prepareHtmlSpeechText(htmlText);
    } else if (scope === "selection") {
      text = this.sanitizeAudioExportText(context.selectionContext.selectedText);
    } else {
      text = await this.extractPdfAudioExportText(context, scope, configuration);
      if (!text) {
        return null;
      }
    }
    const chunks = splitTextForSpeechChunks(text, configuration.chunkLimits);
    if (!text || !chunks.length) {
      new Notice("CosyVoice: nothing readable in the selected export scope.", 6e3);
      return null;
    }
    const summary = createAudioExportSummary({
      chunkCount: chunks.length,
      documentKind: context.documentKind,
      engineLabel: configuration.engineLabel,
      fileName: context.fileName,
      insertAfterExport,
      scope,
      speechEngine: configuration.speechEngine,
      targetPath: exportPlan.targetPath,
      textLength: text.length
    });
    if (!await this.requestAudioExportConfirmation(summary)) {
      return null;
    }
    if (!this.isAudioExportContextCurrent(context)) {
      new Notice("CosyVoice: the active file changed while export was being prepared. Start again to review a new estimate.", 8e3);
      return null;
    }
    await this.activateControlView();
    await this.stopReading({ silent: true });
    this.pauseRequested = false;
    const sourceLabel = `${context.fileName} (${getAudioExportScopeLabel("english", scope)} audio export)`;
    const session = this.createSpeechSession(chunks, sourceLabel, configuration, {
      file: context.file,
      kind: "audio-export",
      sourceKind: context.documentKind
    });
    this.activeSession = session;
    this.updateStatus(`${configuration.engineLabel} export 0/${chunks.length}`, {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: true,
      currentChunk: 0,
      currentText: previewText(chunks[0]),
      error: "",
      isPaused: false,
      phase: "queued",
      progress: 0,
      source: sourceLabel,
      status: "running",
      totalChunks: chunks.length
    });
    await this.writeRuntimeLog("audio-export-start", {
      chunks: chunks.length,
      documentKind: context.documentKind,
      insertAfterExport,
      scope,
      textLength: text.length
    });
    new Notice(`${configuration.engineLabel}: exporting ${chunks.length} audio segments.`, 6e3);
    const temporaryOutputPath = path.join(
      this.cacheDir,
      `${Date.now()}-${session.id}-export.${extension}`
    );
    session.files.push(temporaryOutputPath);
    const preparedPaths = [];
    let exportStage = "synthesis";
    let synthesisComplete = false;
    const createMergeJob = () => ({
      configuration: {
        engineLabel: configuration.engineLabel,
        prefetchChunks: 0,
        speechEngine: configuration.speechEngine
      },
      context: {
        documentKind: context.documentKind,
        file: context.file,
        fileName: context.fileName
      },
      exportPlan: { ...exportPlan },
      extension,
      insertAfterExport,
      preparedPaths: preparedPaths.slice(),
      scope,
      sourceLabel,
      temporaryOutputPath
    });
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        if (!this.isActive(session)) {
          throw new Error("Audio export stopped.");
        }
        session.currentChunkIndex = index;
        const prepared = await this.prepareChunk(chunks[index], index, session);
        preparedPaths.push(prepared.outputPath);
      }
      synthesisComplete = preparedPaths.length === chunks.length;
      if (!this.isActive(session)) {
        throw new Error("Audio export stopped.");
      }
      exportStage = "merge";
      this.updateStatus(`${configuration.engineLabel} merging audio`, {
        canPause: false,
        canNextChunk: false,
        canPreviousChunk: false,
        canSeek: false,
        canStop: true,
        currentChunk: chunks.length,
        currentText: `Combining ${chunks.length} synthesized segments...`,
        isPaused: false,
        phase: "synthesizing",
        progress: 0.99,
        status: "running",
        totalChunks: chunks.length
      });
      const merged = await mergeAudioFiles(preparedPaths, temporaryOutputPath, extension);
      if (!this.isActive(session)) {
        throw new Error("Audio export stopped.");
      }
      exportStage = "finalization";
      return await this.finalizeMergedAudioExport(createMergeJob(), merged, session);
    } catch (error) {
      if (this.isActive(session)) {
        let reportedError = error;
        if (synthesisComplete && preparedPaths.length === chunks.length) {
          const mergeJob = createMergeJob();
          if (this.preservePendingAudioMerge(mergeJob, session)) {
            reportedError = this.createAudioMergeRetryError(
              error,
              preparedPaths.length,
              exportStage === "merge" ? "merge" : "finalization"
            );
          }
        }
        const message = messageFromError(reportedError);
        this.updateStatus(`${configuration.engineLabel} audio export error`, {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          error: message,
          isPaused: false,
          phase: "error",
          status: "error"
        });
        await this.writeRuntimeLog("failed", { message });
        new Notice(`CosyVoice audio export failed: ${message}`, 1e4);
        await this.cancelSessionOperations(session);
        this.activeSession = null;
        this.renderReaderViews();
      }
      return null;
    } finally {
      if (this.settings.cleanupCache) {
        await this.cleanupSessionFiles(session, {
          preservePaths: session.preservedAudioPaths
        });
      }
    }
  }
  async exportCurrentNoteAudio(options = {}) {
    return this.exportCurrentFileAudio({
      ...options,
      expectedDocumentKind: "markdown",
      scope: Object.prototype.hasOwnProperty.call(options, "scope") ? options.scope : "entire"
    });
  }
  async readCurrentNote() {
    const activeFile = this.getCurrentReadableFile();
    if (isHtmlFile(activeFile)) {
      await this.readCurrentHtml(activeFile);
      return;
    }
    if (isPdfFile(activeFile)) {
      await this.readCurrentPdf(activeFile);
      return;
    }
    if (!isMarkdownFile(activeFile)) {
      new Notice("CosyVoice: open a Markdown note, PDF or HTML file before reading.", 8e3);
      return;
    }
    const view = this.getActiveMarkdownView();
    if (!view) {
      return;
    }
    await this.activateControlView();
    await this.startReading(
      view.editor.getValue(),
      view.file?.basename || "note",
      { file: view.file, sourceKind: "markdown" }
    );
  }
  getSavedReadingPosition(file) {
    const filePath = getPdfFileIdentity(file);
    if (!filePath || !this.settings || !this.settings.rememberReadingPosition) {
      return null;
    }
    return normalizeReadingPositions(this.settings.readingPositions)[filePath] || null;
  }
  canResumeCurrentFile() {
    const file = this.getCurrentReadableFile();
    return Boolean(this.getSavedReadingPosition(file));
  }
  async resumeCurrentFile() {
    if (!this.settings || !this.settings.rememberReadingPosition) {
      new Notice("CosyVoice: enable Remember reading position in the plugin settings first.", 8e3);
      return;
    }
    const file = this.getCurrentReadableFile();
    const position = this.getSavedReadingPosition(file);
    if (!file || !position) {
      new Notice("CosyVoice: no saved reading position for the current file.", 6e3);
      return;
    }
    if (isHtmlFile(file)) {
      await this.readCurrentHtml(file, "entire", { resumePosition: position });
      return;
    }
    if (isPdfFile(file)) {
      await this.readCurrentPdf(file, { resumePosition: position });
      return;
    }
    const view = this.getActiveMarkdownView();
    if (!view || getPdfFileIdentity(view.file) !== position.filePath) {
      new Notice("CosyVoice: open the saved note before resuming.", 6e3);
      return;
    }
    const fullText = this.settings.stripMarkdown ? sanitizeTextForSpeech(view.editor.getValue(), { mathReadingLanguage: this.settings.mathReadingLanguage }) : normalizeLineBreaks(view.editor.getValue()).trim();
    let resumeSlice = sliceTextFromReadingPosition(fullText, position);
    if (!resumeSlice.matched) {
      const configuration = this.getSpeechConfiguration();
      if (!configuration) {
        return;
      }
      const chunks = splitTextForSpeechChunks(fullText, configuration.chunkLimits);
      const fallbackIndex = Math.min(Math.max(0, position.chunkIndex), Math.max(0, chunks.length - 1));
      resumeSlice = { matched: false, text: chunks.slice(fallbackIndex).join("\n\n") };
      new Notice("CosyVoice: the saved text anchor changed. Resuming from the nearest saved chunk.", 8e3);
    }
    if (!resumeSlice.text) {
      new Notice("CosyVoice: the saved position is no longer readable.", 6e3);
      return;
    }
    await this.activateControlView();
    await this.startReading(resumeSlice.text, `${file.basename || file.name || "note"} (resumed)`, {
      file,
      sourceKind: "markdown"
    });
  }
  async clearReadingPositions() {
    this.settings.readingPositions = {};
    await this.saveSettings();
    this.renderReaderViews();
    new Notice(getSettingsUiText(this.settings.settingsLanguage).positionsClearedNotice);
  }
  async saveSessionReadingPosition(session) {
    if (!session || !this.settings || !this.settings.rememberReadingPosition || !session.filePath || session.kind === "audio-export" || !["markdown", "pdf", "html"].includes(session.sourceKind) || !session.chunks.length || !Number.isInteger(session.currentChunkIndex)) {
      return false;
    }
    let chunkIndex = Math.max(0, Math.min(session.chunks.length - 1, session.currentChunkIndex));
    if (session.lastCompletedChunkIndex === chunkIndex && chunkIndex + 1 < session.chunks.length) {
      chunkIndex += 1;
    }
    const anchor = createReadingAnchor(session.chunks[chunkIndex]);
    if (!anchor) {
      return false;
    }
    this.settings.readingPositions = upsertReadingPosition(this.settings.readingPositions, {
      anchor,
      chunkIndex,
      fileMtime: session.fileMtime,
      filePath: session.filePath,
      kind: session.sourceKind,
      pageNumber: session.sourceKind === "pdf" ? Array.isArray(session.chunkPageNumbers) && session.chunkPageNumbers[chunkIndex] || 1 : null,
      updatedAt: Date.now()
    });
    await this.saveSettings();
    this.renderReaderViews();
    return true;
  }
  async clearSessionReadingPosition(session) {
    if (!session || !session.filePath || !this.settings || !this.settings.rememberReadingPosition) {
      return false;
    }
    const current = normalizeReadingPositions(this.settings.readingPositions);
    if (!current[session.filePath]) {
      return false;
    }
    this.settings.readingPositions = removeReadingPosition(current, session.filePath);
    await this.saveSettings();
    this.renderReaderViews();
    return true;
  }
  async readCurrentPdfFromSelection(pdfFile = null) {
    const file = pdfFile || (typeof this.app.workspace.getActiveFile === "function" ? this.app.workspace.getActiveFile() : null);
    if (!isPdfFile(file)) {
      new Notice("CosyVoice: no active PDF file.");
      return;
    }
    const selectionContext = this.getPdfSelectionForFile(file);
    if (!selectionContext) {
      new Notice("CosyVoice PDF: select text in the PDF first, then try again.", 8e3);
      return;
    }
    await this.readCurrentPdf(file, { selectionContext });
  }
  getSpeechConfiguration() {
    const speechEngine = normalizeSpeechEngine(this.settings.speechEngine);
    const engineLabel = getSpeechEngineLabel(this.settings);
    const scriptPath = String(this.settings.scriptPath || "").trim();
    if (speechEngine === "mimo-tts") {
      if (this.settings.mimoConsent !== true) {
        new Notice("MiMo TTS: enable online processing consent in settings before reading. Text is sent to Xiaomi; ZDR is not confirmed.", 1e4);
        return null;
      }
      const error = getRemoteCredentialConfigurationError({
        credentialSource: this.settings.mimoCredentialSource,
        secretName: this.settings.mimoSecretName,
        keyPath: this.settings.mimoKeyPath
      }, this.vaultBasePath, this.app, "MiMo API");
      if (error) {
        new Notice(`MiMo TTS: ${error}`, 1e4);
        return null;
      }
    }
    if (speechEngine === "edge-tts" && !hasEdgeTtsConsent(this.settings)) {
      new Notice("Edge TTS sends text to Microsoft. Enable online processing consent in the plugin settings before reading.", 1e4);
      return null;
    }
    if (speechEngine === "azure-speech" && !hasAzureSpeechConsent(this.settings)) {
      new Notice("Azure Speech sends text to your Microsoft Azure Speech resource. Enable Azure online processing consent before reading.", 1e4);
      return null;
    }
    if (speechEngine === "azure-speech") {
      const configurationError = getAzureSpeechConfigurationError(this.settings, this.vaultBasePath, this.app);
      if (configurationError) {
        new Notice(`Azure Speech: ${configurationError}`, 1e4);
        return null;
      }
    }
    if (speechEngine === "openrouter-tts" && !hasOpenRouterConsent(this.settings)) {
      new Notice("OpenRouter TTS sends text to OpenRouter and an eligible upstream provider. Enable OpenRouter online processing consent before reading.", 1e4);
      return null;
    }
    if (speechEngine === "openrouter-tts") {
      const configurationError = getOpenRouterConfigurationError(this.settings, this.vaultBasePath, this.app);
      if (configurationError) {
        new Notice(`OpenRouter TTS: ${configurationError}`, 1e4);
        return null;
      }
    }
    if (speechEngine === "local-cosyvoice" && (!scriptPath || !fs.existsSync(scriptPath))) {
      new Notice(`CosyVoice: script not found: ${scriptPath || "(empty)"}`, 8e3);
      return null;
    }
    return {
      chunkLimits: getChunkLimitsForSpeechEngine(this.settings, speechEngine),
      engineLabel,
      prefetchChunks: getSynthesisPrefetchCount(this.settings, speechEngine),
      speechEngine
    };
  }
  createSpeechSession(chunks, sourceLabel, configuration, options = {}) {
    const initialChunks = Array.isArray(chunks) ? chunks.slice() : [];
    const id = ++this.sequence;
    return {
      chunkWaiters: /* @__PURE__ */ new Set(),
      chunkPageNumbers: initialChunks.map(() => null),
      chunks: initialChunks,
      currentChunkIndex: null,
      engineLabel: configuration.engineLabel,
      fileMtime: getFileMtime(options.file),
      filePath: getPdfFileIdentity(options.file),
      files: [],
      id,
      kind: options.kind || "text",
      lastCompletedChunkIndex: null,
      pdfLoadingTask: null,
      pdfSelectionMatched: null,
      prefetchChunks: configuration.prefetchChunks,
      prepareAvailableChunks: null,
      producerError: null,
      productionComplete: options.productionComplete !== false,
      requestedChunkIndex: null,
      sourceLabel,
      sourceKind: options.sourceKind || "",
      speechEngine: configuration.speechEngine,
      speechStarted: false,
      stopped: false,
      taskState: createTaskState(id, options.kind === "pdf-progressive" ? "extracting" : "queued"),
      totalChunks: initialChunks.length
    };
  }
  transitionSessionPhase(session, phase) {
    if (!session || !session.taskState || !phase) {
      return;
    }
    const taskPhase = phase === "extracting PDF" ? "extracting" : phase;
    try {
      session.taskState = transitionTaskState(session.taskState, taskPhase, session.id);
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] Reading task state transition was rejected`, error);
    }
  }
  notifySessionChunkWaiters(session) {
    if (!session || !(session.chunkWaiters instanceof Set)) {
      return;
    }
    const waiters = Array.from(session.chunkWaiters);
    session.chunkWaiters.clear();
    for (const wake of waiters) {
      wake();
    }
  }
  appendSessionChunks(session, chunks, options = {}) {
    if (!this.isActive(session) || !Array.isArray(chunks)) {
      return 0;
    }
    const readableChunks = chunks.map((chunk) => {
      const detailed = chunk && typeof chunk === "object" && Object.prototype.hasOwnProperty.call(chunk, "text");
      const text = String(detailed ? chunk.text : chunk || "").trim();
      const pageNumber = detailed && chunk.metadata ? Math.max(1, Math.floor(Number(chunk.metadata.pageNumber) || 1)) : options.pageNumber ? Math.max(1, Math.floor(Number(options.pageNumber) || 1)) : null;
      return text ? { pageNumber, text } : null;
    }).filter(Boolean);
    if (!readableChunks.length) {
      return 0;
    }
    session.chunks.push(...readableChunks.map((chunk) => chunk.text));
    session.chunkPageNumbers.push(...readableChunks.map((chunk) => chunk.pageNumber));
    session.totalChunks = session.chunks.length;
    const currentChunk = this.readerState.currentChunk;
    this.setReaderState({
      ...getChunkNavigationState(currentChunk, session.totalChunks),
      totalChunks: session.totalChunks
    });
    this.notifySessionChunkWaiters(session);
    if (typeof session.prepareAvailableChunks === "function") {
      session.prepareAvailableChunks();
    }
    return readableChunks.length;
  }
  completeSessionChunks(session) {
    session.productionComplete = true;
    session.totalChunks = session.chunks.length;
    this.notifySessionChunkWaiters(session);
  }
  failSessionChunks(session, error) {
    session.producerError = error instanceof Error ? error : new Error(messageFromError(error));
    session.productionComplete = true;
    this.notifySessionChunkWaiters(session);
  }
  async waitForSessionChunk(session, index) {
    while (this.isActive(session) && index >= session.chunks.length && !session.productionComplete && !session.producerError) {
      await new Promise((resolve) => {
        const wake = () => {
          session.chunkWaiters.delete(wake);
          resolve();
        };
        session.chunkWaiters.add(wake);
      });
    }
    if (session.producerError) {
      throw session.producerError;
    }
    return index < session.chunks.length ? session.chunks[index] : null;
  }
  async readCurrentPdf(pdfFile = null, options = {}) {
    const file = pdfFile || (typeof this.app.workspace.getActiveFile === "function" ? this.app.workspace.getActiveFile() : null);
    if (!isPdfFile(file)) {
      new Notice("CosyVoice: no active PDF file.");
      return;
    }
    const selectionContext = options && options.selectionContext && getPdfFileIdentity(file) === options.selectionContext.filePath ? options.selectionContext : null;
    const resumePosition = options && options.resumePosition && getPdfFileIdentity(file) === options.resumePosition.filePath ? options.resumePosition : null;
    const startContext = selectionContext || (resumePosition ? {
      filePath: resumePosition.filePath,
      pageNumber: resumePosition.pageNumber,
      selectedText: resumePosition.anchor
    } : null);
    const configuration = this.getSpeechConfiguration();
    if (!configuration) {
      return;
    }
    await this.activateControlView();
    await this.stopReading({ silent: true });
    this.pauseRequested = false;
    const sourceLabel = file.basename || file.name || "PDF";
    const readingSourceLabel = resumePosition ? `${sourceLabel} (resumed PDF)` : selectionContext ? `${sourceLabel} (PDF from selection)` : `${sourceLabel} (PDF)`;
    const session = this.createSpeechSession([], readingSourceLabel, configuration, {
      file,
      kind: "pdf-progressive",
      productionComplete: false,
      sourceKind: "pdf"
    });
    this.activeSession = session;
    this.updateStatus("PDF text extraction", {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: true,
      currentChunk: 0,
      currentText: startContext ? `Loading PDF text from page ${startContext.pageNumber}...` : "Loading PDF text...",
      error: "",
      isPaused: false,
      phase: "extracting PDF",
      progress: 0,
      source: sourceLabel,
      status: "running",
      totalChunks: 0
    });
    session.producerPromise = this.producePdfSpeechChunks(
      file,
      session,
      startContext,
      configuration.chunkLimits
    ).then(() => {
      this.completeSessionChunks(session);
    }).catch((error) => {
      this.failSessionChunks(session, error);
    });
    const prefetchNotice = configuration.prefetchChunks > 0 ? "Up to one next chunk may be prepared early." : "Audio is synthesized only as needed.";
    new Notice(
      `${configuration.engineLabel}: progressively reading ${readingSourceLabel}. ${prefetchNotice}`,
      6e3
    );
    await this.runSpeechSession(session);
  }
  async producePdfSpeechChunks(file, session, selectionContext, chunkLimits) {
    const chunker = createIncrementalSpeechChunker(chunkLimits, { detailed: true });
    let readableTextLength = 0;
    let selectionFallbackNotified = false;
    await this.extractPdfText(file, session, {
      collectText: false,
      onPageText: async (pageText, pageInfo) => {
        if (!this.isActive(session)) {
          return;
        }
        const text = this.settings.stripMarkdown ? sanitizeTextForSpeech(pageText, { mathReadingLanguage: this.settings.mathReadingLanguage }) : normalizeLineBreaks(pageText).trim();
        readableTextLength += text.length;
        this.appendSessionChunks(session, chunker.push(text, { pageNumber: pageInfo.pageNumber }));
        if (selectionContext && pageInfo.pageNumber === selectionContext.pageNumber && session.pdfSelectionMatched === false && !selectionFallbackNotified) {
          selectionFallbackNotified = true;
          new Notice(
            `CosyVoice PDF: the selected text could not be matched exactly. Reading from the start of page ${selectionContext.pageNumber}.`,
            1e4
          );
        }
      },
      reportProgress: true,
      selectedText: selectionContext ? selectionContext.selectedText : "",
      selectionPosition: selectionContext ? selectionContext.selectionPosition : null,
      startPageNumber: selectionContext ? selectionContext.pageNumber : 1
    });
    if (!this.isActive(session)) {
      return;
    }
    this.appendSessionChunks(session, chunker.finish());
    if (!readableTextLength || !session.chunks.length) {
      throw new Error("No extractable text was found. This PDF may be scanned or image-only; run OCR first and try again.");
    }
  }
  async extractPdfText(file, session, options = {}) {
    if (!isPdfFile(file)) {
      throw new Error("The active file is not a PDF.");
    }
    if (Number(file.stat && file.stat.size) > PDF_MAX_BYTES) {
      throw new Error("This PDF is larger than 200 MB. Split or compress it before reading.");
    }
    if (typeof loadPdfJs !== "function") {
      throw new Error("PDF text extraction is unavailable in this Obsidian version. Update Obsidian and try again.");
    }
    if (!this.app.vault || typeof this.app.vault.readBinary !== "function") {
      throw new Error("Obsidian could not read the active PDF.");
    }
    const [pdfjsLib, binary] = await Promise.all([
      loadPdfJs(),
      this.app.vault.readBinary(file)
    ]);
    if (!this.isActive(session)) {
      return "";
    }
    if (!pdfjsLib || typeof pdfjsLib.getDocument !== "function") {
      throw new Error("Obsidian PDF.js did not load correctly.");
    }
    const data = binary instanceof Uint8Array ? new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength) : new Uint8Array(binary);
    const loadingTask = pdfjsLib.getDocument({ data });
    session.pdfLoadingTask = loadingTask;
    let pdfDocument = null;
    try {
      pdfDocument = await loadingTask.promise;
      if (!this.isActive(session)) {
        return "";
      }
      const totalPages = Math.max(0, Math.floor(Number(pdfDocument.numPages) || 0));
      if (!totalPages) {
        throw new Error("This PDF contains no readable pages.");
      }
      if (totalPages > PDF_MAX_PAGES) {
        throw new Error(`This PDF has more than ${PDF_MAX_PAGES} pages. Split it before reading.`);
      }
      const requestedStartPage = Math.floor(Number(options.startPageNumber) || 1);
      const startPageNumber = Math.max(1, Math.min(totalPages, requestedStartPage));
      const selectedText = String(options.selectedText || "").trim();
      const collectText = options.collectText !== false;
      const onPageText = typeof options.onPageText === "function" ? options.onPageText : null;
      const reportProgress = options.reportProgress !== false;
      if (!onPageText) {
        session.totalChunks = totalPages;
      }
      const pageTexts = [];
      let textLength = 0;
      for (let pageNumber = startPageNumber; pageNumber <= totalPages; pageNumber += 1) {
        if (!this.isActive(session)) {
          return "";
        }
        if (reportProgress && !session.speechStarted) {
          this.updateStatus(`PDF page ${pageNumber}/${totalPages}`, {
            canPause: false,
            canNextChunk: false,
            canPreviousChunk: false,
            canSeek: false,
            canStop: true,
            currentChunk: onPageText ? 0 : pageNumber - 1,
            currentText: `Extracting page ${pageNumber} of ${totalPages}...`,
            phase: "extracting PDF",
            progress: (pageNumber - 1) / totalPages,
            status: "running",
            totalChunks: onPageText ? session.totalChunks : totalPages
          });
        }
        let page = null;
        try {
          page = await pdfDocument.getPage(pageNumber);
          if (!this.isActive(session)) {
            return "";
          }
          const textContent = await page.getTextContent();
          if (!this.isActive(session)) {
            return "";
          }
          const viewport = typeof page.getViewport === "function" ? page.getViewport({ scale: 1 }) : null;
          const pageLayout = extractPdfTextLayout(textContent && textContent.items, { viewport });
          let pageText = pageLayout.text;
          if (selectedText && pageNumber === startPageNumber) {
            const selectionSlice = slicePdfTextFromSelection(pageText, selectedText, {
              layout: pageLayout,
              selectionPosition: options.selectionPosition
            });
            pageText = selectionSlice.text;
            session.pdfSelectionMatched = selectionSlice.matched;
          }
          if (collectText) {
            pageTexts.push(pageText);
          }
          textLength += pageText.length;
          if (textLength > PDF_MAX_TEXT_CHARS) {
            throw new Error("This PDF contains more than 5,000,000 extractable characters. Split it before reading.");
          }
          if (onPageText) {
            await onPageText(pageText, { pageNumber, totalPages });
          }
        } finally {
          if (page && typeof page.cleanup === "function") {
            page.cleanup();
          }
        }
        if (reportProgress && !session.speechStarted) {
          this.updateStatus(`PDF page ${pageNumber}/${totalPages}`, {
            currentChunk: onPageText ? 0 : pageNumber,
            progress: pageNumber / totalPages
          });
        }
      }
      return collectText ? joinPdfPageText(pageTexts) : "";
    } finally {
      const ownsLoadingTask = session.pdfLoadingTask === loadingTask;
      if (ownsLoadingTask) {
        session.pdfLoadingTask = null;
      }
      try {
        if (pdfDocument && typeof pdfDocument.destroy === "function") {
          await pdfDocument.destroy();
        } else if (ownsLoadingTask && loadingTask && typeof loadingTask.destroy === "function") {
          loadingTask.destroy();
        }
      } catch (error) {
        console.warn(`[${PLUGIN_ID}] Could not release PDF resources`, error);
      }
    }
  }
  async readSelection() {
    const activeFile = this.getCurrentReadableFile();
    if (isHtmlFile(activeFile)) {
      await this.readCurrentHtml(activeFile, "selection");
      return;
    }
    if (isPdfFile(activeFile)) {
      const selectionContext = this.getPdfSelectionForFile(activeFile);
      if (!selectionContext) {
        new Notice("CosyVoice PDF: select text in the PDF first, then try again.", 8e3);
        return;
      }
      await this.activateControlView();
      await this.startReading(
        selectionContext.selectedText,
        `${activeFile.basename || activeFile.name || "PDF"} (PDF selection)`
      );
      return;
    }
    const view = this.getActiveMarkdownView();
    if (!view) {
      return;
    }
    const selection = view.editor.getSelection();
    if (!selection || !selection.trim()) {
      new Notice("CosyVoice: select text first.");
      return;
    }
    await this.activateControlView();
    await this.startReading(selection, "selection");
  }
  async readFromSelection() {
    const activeFile = this.getCurrentReadableFile();
    if (isHtmlFile(activeFile)) {
      await this.readCurrentHtml(activeFile, "from-selection");
      return;
    }
    if (isPdfFile(activeFile)) {
      await this.readCurrentPdfFromSelection(activeFile);
      return;
    }
    const view = this.getActiveMarkdownView();
    if (!view) {
      return;
    }
    const selection = view.editor.getSelection();
    if (!selection || !selection.trim()) {
      new Notice("CosyVoice: select a start point first.");
      return;
    }
    const from = view.editor.getCursor("from");
    const lines = view.editor.getValue().split(/\r\n?|\n/);
    const text = getTextFromPositionToEnd(lines, from);
    if (!text) {
      new Notice("CosyVoice: nothing to read after selection.");
      return;
    }
    await this.activateControlView();
    await this.startReading(text, "from selection", { file: view.file, sourceKind: "markdown" });
  }
  async startReading(rawText, sourceLabel, options = {}) {
    const text = options.plainText || options.sourceKind === "html" ? this.prepareHtmlSpeechText(rawText) : this.settings.stripMarkdown ? sanitizeTextForSpeech(rawText, { mathReadingLanguage: this.settings.mathReadingLanguage }) : normalizeLineBreaks(rawText).trim();
    if (!text) {
      new Notice("CosyVoice: nothing readable in this note.");
      return;
    }
    const configuration = this.getSpeechConfiguration();
    if (!configuration) {
      return;
    }
    await this.stopReading({ silent: true });
    this.pauseRequested = false;
    const chunks = splitTextForSpeechChunks(text, configuration.chunkLimits);
    const session = this.createSpeechSession(chunks, sourceLabel, configuration, {
      file: options.file,
      sourceKind: options.sourceKind || ""
    });
    this.activeSession = session;
    this.updateStatus(`${configuration.engineLabel} 0/${chunks.length}`, {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: true,
      currentChunk: 0,
      currentText: previewText(chunks[0]),
      error: "",
      isPaused: false,
      phase: "queued",
      progress: 0,
      source: sourceLabel,
      status: "running",
      totalChunks: chunks.length
    });
    await this.writeRuntimeLog("start", {
      chunks: chunks.length,
      prefetchChunks: configuration.prefetchChunks,
      source: sourceLabel,
      textLength: text.length
    });
    new Notice(`${configuration.engineLabel}: reading ${sourceLabel}. First synthesis may take a while.`, 6e3);
    await this.runSpeechSession(session);
  }
  async runSpeechSession(session) {
    const preparedChunks = /* @__PURE__ */ new Map();
    const getPreparedChunk = (index, part = 0) => {
      const key = `${index}:${part}`;
      if (!preparedChunks.has(key)) {
        const preparing = this.queuePrepareChunk(getSpeechParts(session, index)[part], index, session, part);
        preparing.catch(() => {
        });
        preparedChunks.set(key, preparing);
      }
      return preparedChunks.get(key);
    };
    session.prepareAvailableChunks = () => {
      if (!this.isActive(session) || session.seekTarget || this.pauseRequested || !Number.isInteger(session.prefetchBaseIndex)) {
        return;
      }
      let cursor = { index: session.prefetchBaseIndex, part: session.currentPartIndex || 0 };
      for (let offset = 1; offset <= session.prefetchChunks; offset += 1) {
        cursor = adjacentSpeechPart(session, cursor.index, cursor.part, 1);
        if (!cursor) break;
        getPreparedChunk(cursor.index, cursor.part);
      }
    };
    try {
      let index = 0;
      let part = 0;
      while (this.isActive(session)) {
        if (Number.isInteger(session.requestedChunkIndex) && session.chunks.length) {
          index = Math.max(0, Math.min(session.chunks.length - 1, session.requestedChunkIndex));
          part = session.requestedPartIndex || 0;
          session.requestedChunkIndex = null;
          session.requestedPartIndex = null;
        }
        session.prefetchBaseIndex = index;
        if (session.kind === "pdf-progressive" && index >= session.chunks.length && !session.productionComplete) {
          this.updateStatus("PDF parsing next pages", {
            canPause: true,
            canNextChunk: false,
            canSeek: false,
            canStop: true,
            isPaused: false,
            phase: "extracting PDF",
            progress: Math.min(0.99, this.readerState.progress),
            status: "running"
          });
        }
        const chunkText = await this.waitForSessionChunk(session, index);
        if (!this.isActive(session)) {
          break;
        }
        if (chunkText === null) {
          break;
        }
        session.currentChunkIndex = index;
        session.currentPartIndex = part;
        if (session.lastCompletedChunkIndex === index) session.lastCompletedChunkIndex = null;
        const prepared = await getPreparedChunk(index, part);
        if (!this.isActive(session)) {
          break;
        }
        if (Number.isInteger(session.requestedChunkIndex)) {
          continue;
        }
        if (!session.seekTarget) session.prepareAvailableChunks();
        session.requestedChunkIndex = null;
        await this.playPreparedAudio(prepared, session, index, session.totalChunks, part);
        if (Number.isInteger(session.requestedChunkIndex)) {
          continue;
        } else if (part + 1 < getSpeechParts(session, index).length) {
          part += 1;
        } else {
          session.lastCompletedChunkIndex = index;
          index += 1;
          part = 0;
        }
      }
      if (this.isActive(session)) {
        this.updateStatus(`${session.engineLabel} complete`, {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          isPaused: false,
          phase: "complete",
          progress: 1,
          status: "complete"
        });
        await this.clearSessionReadingPosition(session);
        this.activeSession = null;
      }
    } catch (error) {
      if (this.isActive(session)) {
        const message = session.kind === "pdf-progressive" ? getPdfExtractionErrorMessage(error) : messageFromError(error);
        this.updateStatus(`${session.engineLabel} error`, {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          error: message,
          isPaused: false,
          phase: "error",
          status: "error"
        });
        await this.writeRuntimeLog("failed", {
          message
        });
        const noticePrefix = session.kind === "pdf-progressive" ? "CosyVoice PDF" : session.engineLabel;
        new Notice(`${noticePrefix} failed: ${message}`, 1e4);
        await this.saveSessionReadingPosition(session);
        await this.cancelSessionOperations(session);
        this.activeSession = null;
      }
    } finally {
      session.prepareAvailableChunks = null;
      session.prefetchBaseIndex = null;
      if (session.producerPromise) {
        await session.producerPromise.catch(() => {
        });
      }
      if (this.settings.cleanupCache) {
        await this.cleanupSessionFiles(session);
      }
    }
  }
  async prepareChunk(chunkText, index, session, part = 0) {
    if (!this.isActive(session)) {
      throw new Error("Reading stopped.");
    }
    session.speechStarted = true;
    session.synthesisSpeeds = session.synthesisSpeeds || {};
    session.synthesisSpeeds[index] = normalizeSpeed(this.settings.speed);
    const speechEngine = normalizeSpeechEngine(session.speechEngine || this.settings.speechEngine);
    const engineLabel = session.engineLabel || getSpeechEngineLabel(this.settings);
    const outputExtension = ["local-cosyvoice", "mimo-tts"].includes(speechEngine) ? "wav" : "mp3";
    const basename = `${Date.now()}-${session.id}-${index}-${part}`;
    const inputPath = path.join(this.cacheDir, `${basename}.txt`);
    const outputPath = path.join(this.cacheDir, `${basename}.${outputExtension}`);
    session.files.push(inputPath, outputPath);
    await fs.promises.writeFile(inputPath, chunkText, { encoding: "utf8", mode: 384 });
    const isAudioExport = session.kind === "audio-export";
    const isBackgroundPrefetch = Boolean(
      !isAudioExport && Number.isInteger(session.currentChunkIndex) && (index !== session.currentChunkIndex || part !== (session.currentPartIndex || 0))
    );
    if (!isBackgroundPrefetch) {
      this.updateStatus(`${engineLabel} synth ${index + 1}/${session.totalChunks || 0}`, {
        canPause: !isAudioExport,
        ...isAudioExport ? { canNextChunk: false, canPreviousChunk: false } : getChunkNavigationState(index + 1, session.totalChunks),
        canSeek: false,
        canStop: true,
        currentChunk: index + 1,
        currentText: previewText(session.chunks?.[index] || chunkText),
        isPaused: false,
        phase: "synthesizing",
        progress: session.totalChunks ? (index + this.getSegmentTiming(session, index, part, 0).fraction) / session.totalChunks : 0,
        status: "running",
        totalChunks: session.totalChunks || 0
      });
    }
    try {
      await this.runSpeechEngine(inputPath, outputPath, session, speechEngine);
    } finally {
      if (this.settings.cleanupCache) {
        await this.removeTempFile(inputPath);
      }
    }
    const outputStat = await fs.promises.stat(outputPath);
    if (outputStat.size <= 44) {
      throw new Error(`${engineLabel} generated an invalid audio file: ${outputStat.size} bytes.`);
    }
    if (!this.isActive(session)) {
      if (this.settings.cleanupCache) {
        await this.removeTempFile(outputPath);
      }
      throw new Error("Reading stopped.");
    }
    const url = getAudioUrlForFile(this.app.vault.adapter, this.vaultBasePath, outputPath);
    await this.writeRuntimeLog("prepared", {
      index,
      outputBytes: outputStat.size,
      urlScheme: String(url).split(":")[0]
    });
    return {
      outputPath,
      url
    };
  }
  queuePrepareChunk(chunkText, index, session, part = 0) {
    const promise = this.prepareChunk(chunkText, index, session, part);
    promise.catch(() => {
    });
    return promise;
  }
  runSpeechEngine(inputPath, outputPath, session, speechEngine = normalizeSpeechEngine(this.settings.speechEngine)) {
    if (speechEngine === "edge-tts") {
      return this.runEdgeTts(inputPath, outputPath, session);
    }
    if (speechEngine === "azure-speech") {
      return this.runAzureSpeech(inputPath, outputPath, session);
    }
    if (speechEngine === "openrouter-tts") {
      return this.runOpenRouterTts(inputPath, outputPath, session);
    }
    if (speechEngine === "mimo-tts") {
      return this.runMimoTts(inputPath, outputPath, session);
    }
    return this.runCosyVoice(inputPath, outputPath, session);
  }
  runCosyVoice(inputPath, outputPath, session) {
    const scriptPath = this.settings.scriptPath.trim();
    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-InputPath",
      inputPath,
      "-OutputPath",
      outputPath,
      "-Speed",
      String(normalizeSpeed(this.settings.speed))
    ];
    return new Promise((resolve, reject) => {
      const child = spawn(resolvePowerShellExecutable(), args, {
        cwd: path.dirname(scriptPath),
        windowsHide: true
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      this.currentProcess = child;
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill();
        reject(new Error("CosyVoice synthesis timed out after 10 minutes."));
      }, 10 * 60 * 1e3);
      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      child.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (this.currentProcess === child) {
          this.currentProcess = null;
        }
        reject(error);
      });
      child.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (this.currentProcess === child) {
          this.currentProcess = null;
        }
        if (!this.isActive(session)) {
          reject(new Error("Reading stopped."));
          return;
        }
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
          return;
        }
        const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
        reject(new Error(detail || `CosyVoice exited with code ${code}.`));
      });
    });
  }
  runEdgeTts(inputPath, outputPath, session) {
    const args = buildEdgeTtsArgs(inputPath, outputPath, this.settings);
    const executable = normalizeEdgeTtsExecutable(this.settings.edgeTtsExecutable);
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        windowsHide: true
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      this.currentProcess = child;
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill();
        reject(new Error("Edge TTS synthesis timed out after 10 minutes."));
      }, 10 * 60 * 1e3);
      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      child.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (this.currentProcess === child) {
          this.currentProcess = null;
        }
        reject(new Error(`Edge TTS command failed at ${executable}. Check the configured executable path. ${messageFromError(error)}`));
      });
      child.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (this.currentProcess === child) {
          this.currentProcess = null;
        }
        if (!this.isActive(session)) {
          reject(new Error("Reading stopped."));
          return;
        }
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
          return;
        }
        const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
        reject(new Error(detail || `Edge TTS exited with code ${code}.`));
      });
    });
  }
  async readSecretFileOutsideVault(configuredPathValue, serviceLabel) {
    const configuredPath = String(configuredPathValue || "").trim();
    const keyPath = await fs.promises.realpath(configuredPath);
    const vaultPath = await fs.promises.realpath(this.vaultBasePath).catch(() => path.resolve(this.vaultBasePath));
    if (isInsideDirectory(keyPath, vaultPath)) {
      throw new Error(`${serviceLabel} key file must be stored outside the Obsidian vault.`);
    }
    const stat = await fs.promises.stat(keyPath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 8192) {
      throw new Error(`${serviceLabel} key file must be a non-empty text file smaller than 8 KB.`);
    }
    const key = (await fs.promises.readFile(keyPath, "utf8")).replace(/^\uFEFF/, "").trim();
    if (!key || /[\r\n]/.test(key)) {
      throw new Error(`${serviceLabel} key file must contain exactly one non-empty line.`);
    }
    return key;
  }
  readObsidianSecret(secretNameValue, serviceLabel) {
    return readObsidianSecretValue(secretNameValue, this.app, serviceLabel);
  }
  async readOpenRouterKey() {
    if (normalizeCredentialSource(this.settings.openRouterCredentialSource) === "obsidian-secret") {
      return this.readObsidianSecret(this.settings.openRouterSecretName, "OpenRouter API");
    }
    return this.readSecretFileOutsideVault(this.settings.openRouterKeyPath, "OpenRouter API");
  }
  async readAzureSpeechKey() {
    if (normalizeCredentialSource(this.settings.azureSpeechCredentialSource) === "obsidian-secret") {
      return this.readObsidianSecret(this.settings.azureSpeechSecretName, "Azure Speech");
    }
    return this.readSecretFileOutsideVault(this.settings.azureSpeechKeyPath, "Azure Speech");
  }
  async waitForRemoteRetry(session, delayMs) {
    let remainingMs = Math.max(0, Number(delayMs) || 0);
    while (remainingMs > 0) {
      const intervalMs = Math.min(100, remainingMs);
      await sleep(intervalMs);
      if (!this.isActive(session)) {
        throw new Error("Reading stopped.");
      }
      remainingMs -= intervalMs;
    }
  }
  async requestRemoteAudio(options) {
    if (!(this.currentRequests instanceof Set)) {
      this.currentRequests = /* @__PURE__ */ new Set();
    }
    const { session, serviceLabel } = options;
    const maxAttempts = options.retryTemporaryFailures === true ? REMOTE_TTS_MAX_ATTEMPTS : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.requestRemoteAudioOnce(options);
        return;
      } catch (error) {
        if (!this.isActive(session)) {
          throw new Error("Reading stopped.");
        }
        if (!isRetryableRemoteError(error)) {
          throw error;
        }
        if (attempt === maxAttempts) {
          throw maxAttempts > 1 ? createRemoteRetryExhaustedError(serviceLabel, error, attempt) : error;
        }
        const fallbackDelayMs = REMOTE_TTS_RETRY_DELAYS_MS[attempt - 1] || REMOTE_TTS_RETRY_DELAYS_MS.at(-1);
        const retryAfterMs = Number(error.retryAfterMs);
        const delayMs = Number.isFinite(retryAfterMs) ? Math.max(fallbackDelayMs, retryAfterMs) : fallbackDelayMs;
        await this.waitForRemoteRetry(session, delayMs);
      }
    }
  }
  async requestRemoteAudioOnce({ endpoint, headers, body, outputPath, session, serviceLabel, expectedContentType, failureHint, decodeAudio }) {
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) {
          return;
        }
        settled = true;
        this.currentRequests.delete(request);
        callback(value);
      };
      const request = https.request(endpoint, {
        method: "POST",
        headers
      }, (response) => {
        const statusCode = Number(response.statusCode) || 0;
        if (statusCode !== 200) {
          response.resume();
          finish(reject, createRemoteHttpError(
            serviceLabel,
            statusCode,
            failureHint,
            response.headers && response.headers["retry-after"]
          ));
          return;
        }
        const responseHeaders = response.headers || {};
        const contentType = String(responseHeaders["content-type"] || "").split(";")[0].trim().toLowerCase();
        if (expectedContentType && contentType !== expectedContentType) {
          response.resume();
          finish(reject, new Error(`${serviceLabel} returned unexpected content type ${contentType || "(missing)"}.`));
          return;
        }
        const contentLength = Number(responseHeaders["content-length"]) || 0;
        if (contentLength > REMOTE_TTS_MAX_AUDIO_BYTES) {
          response.resume();
          finish(reject, new Error(`${serviceLabel} response exceeded the 20 MB safety limit.`));
          request.destroy();
          return;
        }
        const chunks = [];
        let totalBytes = 0;
        response.on("data", (chunk) => {
          if (settled) {
            return;
          }
          totalBytes += chunk.length;
          if (totalBytes > REMOTE_TTS_MAX_AUDIO_BYTES) {
            response.destroy();
            finish(reject, new Error(`${serviceLabel} response exceeded the 20 MB safety limit.`));
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on("aborted", () => {
          const error = new Error(`${serviceLabel} response was interrupted.`);
          error.code = "ECONNRESET";
          finish(reject, error);
        });
        response.on("error", (error) => {
          finish(reject, error);
        });
        response.on("end", async () => {
          if (settled) {
            return;
          }
          if (!this.isActive(session)) {
            finish(reject, new Error("Reading stopped."));
            return;
          }
          try {
            const responseBytes = Buffer.concat(chunks);
            const audioBytes = decodeAudio ? decodeAudio(responseBytes) : responseBytes;
            await fs.promises.writeFile(outputPath, audioBytes, { mode: 384 });
            finish(resolve);
          } catch (error) {
            finish(reject, error);
          }
        });
      });
      this.currentRequests.add(request);
      request.setTimeout(2 * 60 * 1e3, () => {
        const error = new Error(`${serviceLabel} synthesis timed out after 2 minutes.`);
        error.code = "ETIMEDOUT";
        finish(reject, error);
        request.destroy();
      });
      request.on("error", (error) => {
        finish(reject, error);
      });
      request.on("close", () => {
        if (!settled && !this.isActive(session)) {
          finish(reject, new Error("Reading stopped."));
        }
      });
      request.end(body);
    });
  }
  async runAzureSpeech(inputPath, outputPath, session) {
    const [text, subscriptionKey] = await Promise.all([
      fs.promises.readFile(inputPath, "utf8"),
      this.readAzureSpeechKey()
    ]);
    if (!this.isActive(session)) {
      throw new Error("Reading stopped.");
    }
    const body = buildAzureSpeechSsml(text, this.settings);
    await this.requestRemoteAudio({
      endpoint: new URL(buildAzureSpeechEndpoint(this.settings)),
      headers: {
        Accept: "audio/mpeg",
        "Content-Length": Buffer.byteLength(body, "utf8"),
        "Content-Type": "application/ssml+xml",
        "Ocp-Apim-Subscription-Key": subscriptionKey,
        "User-Agent": "note-reader-cosyvoice/0.2.6",
        "X-Microsoft-OutputFormat": AZURE_SPEECH_OUTPUT_FORMAT
      },
      body,
      outputPath,
      session,
      serviceLabel: "Azure Speech",
      expectedContentType: "audio/mpeg",
      failureHint: "Check the selected API credential, cloud, region, voice, resource status, and quota."
    });
  }
  async runMimoTts(inputPath, outputPath, session) {
    if (this.settings.mimoConsent !== true) throw new Error("MiMo online processing consent is required.");
    const apiKey = normalizeCredentialSource(this.settings.mimoCredentialSource) === "obsidian-secret" ? await this.readObsidianSecret(this.settings.mimoSecretName, "MiMo API") : await this.readSecretFileOutsideVault(this.settings.mimoKeyPath, "MiMo API");
    const text = await fs.promises.readFile(inputPath, "utf8");
    if (!this.isActive(session)) throw new Error("Reading stopped.");
    const body = buildMimoRequestBody(text, this.settings);
    await this.requestRemoteAudio({
      endpoint: new URL(MIMO_ENDPOINT),
      headers: { "api-key": apiKey, Accept: "application/json", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      body,
      outputPath,
      session,
      serviceLabel: "MiMo TTS",
      expectedContentType: "application/json",
      decodeAudio: decodeMimoAudio,
      failureHint: "Check the MiMo API key, TTS access, account balance, and rate limits. Promotional free access may change.",
      retryTemporaryFailures: true
    });
  }
  async runOpenRouterTts(inputPath, outputPath, session) {
    const [text, apiKey] = await Promise.all([
      fs.promises.readFile(inputPath, "utf8"),
      this.readOpenRouterKey()
    ]);
    if (!this.isActive(session)) {
      throw new Error("Reading stopped.");
    }
    const body = buildOpenRouterTtsRequestBody(text, this.settings);
    await this.requestRemoteAudio({
      endpoint: new URL(OPENROUTER_TTS_ENDPOINT),
      headers: {
        Accept: "audio/mpeg",
        Authorization: `Bearer ${apiKey}`,
        "Content-Length": Buffer.byteLength(body, "utf8"),
        "Content-Type": "application/json",
        "User-Agent": "note-reader-cosyvoice/0.2.6"
      },
      body,
      outputPath,
      session,
      serviceLabel: "OpenRouter TTS",
      expectedContentType: "audio/mpeg",
      failureHint: "Check the selected API credential, model, voice, account balance, and privacy settings.",
      retryTemporaryFailures: true
    });
  }
  async createPlayableAudioSource(prepared) {
    const audioBytes = await fs.promises.readFile(prepared.outputPath);
    const blobSource = createBlobAudioSource(audioBytes, prepared.outputPath);
    if (blobSource) {
      return blobSource;
    }
    return {
      mimeType: getAudioMimeType(prepared.outputPath),
      url: prepared.url,
      release() {
      }
    };
  }
  releaseAudioSource(audio) {
    if (!audio || typeof audio.noteReaderReleaseSource !== "function") {
      return;
    }
    const release = audio.noteReaderReleaseSource;
    audio.noteReaderReleaseSource = null;
    release();
  }
  getSegmentTiming(session = this.activeSession, index = Math.max(0, (this.readerState.currentChunk || 1) - 1), part = session?.currentPartIndex || 0, time = this.currentAudio?.currentTime || 0) {
    const timing = session?.chunks?.[index] !== void 0 ? getSpeechPartTiming(session, index, part, time, normalizeSpeed(this.settings.speed)) : { duration: Number(this.currentAudio?.duration) || 0, current: time, offset: 0 };
    return { ...timing, fraction: timing.duration > 0 ? Math.min(1, timing.current / timing.duration) : 0 };
  }
  async playPreparedAudio(prepared, session, index, total, part = 0) {
    if (!this.isActive(session)) {
      return;
    }
    if (!session.seekTarget) await this.waitWhilePaused(session);
    if (!this.isActive(session) || Number.isInteger(session.requestedChunkIndex) && (session.requestedChunkIndex !== index || (session.requestedPartIndex || 0) !== part)) {
      return;
    }
    const source = await this.createPlayableAudioSource(prepared);
    if (!this.isActive(session)) {
      source.release();
      return;
    }
    await new Promise((resolve, reject) => {
      let audio;
      let settled = false;
      let seekMetadataTimer = null;
      const getPlaybackTotal = () => Math.max(
        1,
        Math.floor(Number(session.totalChunks) || 0),
        Math.floor(Number(total) || 0)
      );
      const finish = (callback, value) => {
        if (settled) {
          return;
        }
        settled = true;
        if (seekMetadataTimer) clearTimeout(seekMetadataTimer);
        if (this.currentAudio === audio) {
          this.currentAudio = null;
        }
        this.releaseAudioSource(audio);
        callback(value);
      };
      try {
        audio = new Audio();
        audio.volume = normalizeVolume(this.settings.playbackVolume);
        audio.preservesPitch = true;
        audio.defaultPlaybackRate = normalizeSpeed(this.settings.playbackSpeed);
        audio.playbackRate = normalizeSpeed(this.settings.playbackSpeed);
        audio.noteReaderReleaseSource = source.release;
        audio.preload = "auto";
        const recordDuration = () => {
          if (this.isActive(session) && Number.isFinite(audio.duration) && audio.duration > 0) {
            session.audioDurations = session.audioDurations || {};
            session.partDurations || (session.partDurations = {});
            session.partDurations[`${index}:${part}`] = audio.duration;
            session.audioDurations[index] = getSpeechParts(session, index).length > 1 ? this.getSegmentTiming(session, index, part, audio.currentTime).duration : audio.duration;
          }
        };
        const applyPlaybackSpeed = () => {
          if (settled || !this.isActive(session)) return;
          audio.defaultPlaybackRate = normalizeSpeed(this.settings.playbackSpeed);
          audio.playbackRate = audio.defaultPlaybackRate;
          audio.preservesPitch = true;
        };
        audio.onloadedmetadata = () => {
          if (seekMetadataTimer) clearTimeout(seekMetadataTimer);
          applyPlaybackSpeed();
          recordDuration();
          if (settled || !this.isActive(session) || !session.seekTarget) return;
          const target = session.seekTarget;
          if (target.index !== index || (target.part || 0) !== part) {
            session.requestedChunkIndex = target.index;
            session.requestedPartIndex = target.part || 0;
            finish(resolve);
            return;
          }
          const duration = audio.duration;
          if (!Number.isFinite(duration) || duration <= 0) {
            finish(reject, new Error("Cannot seek across segments: audio duration is unavailable."));
            return;
          }
          if (target.fromEnd) {
            target.time += duration;
            target.fromEnd = false;
          }
          const previous = adjacentSpeechPart(session, index, part, -1);
          const next = adjacentSpeechPart(session, index, part, 1);
          if (target.time < 0 && previous) {
            Object.assign(target, previous);
            target.fromEnd = true;
          } else if (target.time >= duration && next) {
            target.time -= duration;
            Object.assign(target, next);
          } else {
            audio.currentTime = Math.max(0, Math.min(duration, target.time));
            session.seekTarget = null;
            if (!this.pauseRequested) session.prepareAvailableChunks?.();
            this.updateStatus(this.pauseRequested ? "CosyVoice paused" : "CosyVoice playing", {
              canSeek: true,
              isPaused: Boolean(this.pauseRequested),
              phase: this.pauseRequested ? "paused" : "playing",
              status: this.pauseRequested ? "paused" : "running",
              progress: (index + this.getSegmentTiming(session, index, part, audio.currentTime).fraction) / getPlaybackTotal()
            });
            if (!this.pauseRequested) Promise.resolve(audio.play()).catch((error) => finish(reject, error));
            return;
          }
          session.requestedChunkIndex = target.index;
          session.requestedPartIndex = target.part || 0;
          finish(resolve);
        };
        audio.onplaying = applyPlaybackSpeed;
        audio.ondurationchange = recordDuration;
        this.currentAudio = audio;
        const playbackTotal = getPlaybackTotal();
        this.updateStatus(`${session.engineLabel || getSpeechEngineLabel(this.settings)} play ${index + 1}/${playbackTotal}`, {
          canPause: true,
          canNextChunk: index + 1 < playbackTotal,
          canPreviousChunk: index > 0,
          canSeek: true,
          canStop: true,
          currentChunk: index + 1,
          currentText: previewText(Array.isArray(session.chunks) ? session.chunks[index] : ""),
          isPaused: false,
          phase: "playing",
          progress: (index + this.getSegmentTiming(session, index, part, 0).fraction) / playbackTotal,
          status: "running",
          totalChunks: playbackTotal
        });
        void this.writeRuntimeLog("play", {
          index,
          urlScheme: String(source.url).split(":")[0]
        });
        let lastProgressUpdate = 0;
        audio.ontimeupdate = () => {
          if (settled || !this.isActive(session)) return;
          recordDuration();
          const now = Date.now();
          if (now - lastProgressUpdate < 250) {
            return;
          }
          lastProgressUpdate = now;
          const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
          const chunkProgress = duration ? this.getSegmentTiming(session, index, part, audio.currentTime).fraction : 0;
          const currentTotal = getPlaybackTotal();
          this.setReaderState({
            progress: (index + chunkProgress) / currentTotal,
            totalChunks: currentTotal
          });
        };
        audio.onended = () => {
          if (settled) return;
          const currentTotal = getPlaybackTotal();
          this.setReaderState({
            canPause: false,
            ...getChunkNavigationState(index + 1, currentTotal),
            canSeek: false,
            isPaused: false,
            progress: (index + this.getSegmentTiming(session, index, part, audio.duration || 0).fraction) / currentTotal,
            totalChunks: currentTotal
          });
          finish(resolve);
        };
        audio.onerror = () => {
          finish(reject, new Error(`Unable to play ${prepared.outputPath}${describeMediaError(audio.error)}`));
        };
        if (session.seekTarget) {
          seekMetadataTimer = setTimeout(() => {
            finish(reject, new Error("Timed out loading audio duration for cross-segment seeking."));
          }, 15e3);
        }
        audio.src = source.url;
        applyPlaybackSpeed();
        if (session.seekTarget) {
          audio.load();
        } else {
          Promise.resolve(audio.play()).catch((error) => {
            finish(reject, error);
          });
        }
      } catch (error) {
        if (audio) {
          finish(reject, error);
        } else {
          source.release();
          reject(error);
        }
      }
    });
  }
  async waitWhilePaused(session) {
    while (this.isActive(session) && this.pauseRequested) {
      this.updateStatus("CosyVoice paused", {
        canPause: true,
        ...getChunkNavigationState(this.readerState.currentChunk, this.readerState.totalChunks),
        canSeek: Boolean(this.currentAudio),
        canStop: true,
        isPaused: true,
        phase: "paused",
        status: "paused"
      });
      await sleep(100);
    }
  }
  handleReaderKeydown(event, options = {}) {
    if (!event || event.defaultPrevented || isInteractiveKeyboardTarget(event.target)) {
      return false;
    }
    const seekDeltaSeconds = getKeyboardSeekDeltaSeconds(event);
    if (seekDeltaSeconds) {
      if (!this.seekCurrentAudioBySeconds(seekDeltaSeconds)) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      if (options.focusPanel) {
        focusElementWithoutScroll(options.focusPanel);
      }
      return true;
    }
    const state = this.readerState || createReaderState();
    if (options.allowPause === false || event.repeat || !state.canPause || !isSpaceKeyEvent(event)) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    void Promise.resolve(this.pauseOrResume()).finally(() => {
      if (options.focusPanel) {
        focusElementWithoutScroll(options.focusPanel);
      }
    });
    return true;
  }
  seekToProgress(progress) {
    const session = this.activeSession;
    if (session && session.kind === "audio-export") return false;
    const total = session && Array.isArray(session.chunks) ? session.chunks.length : 0;
    if (this.isActive(session) && total > 0) {
      const target = Math.min(total - 1, Math.floor(clampProgress(progress) * total));
      const current = Math.max(0, (this.readerState.currentChunk || 1) - 1);
      if (target !== current) return this.jumpToAdjacentChunk(target - current);
    }
    const audio = this.currentAudio;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      return false;
    }
    const seekTime = calculateCurrentChunkSeekTime({
      progress,
      currentChunk: this.readerState.currentChunk,
      totalChunks: this.readerState.totalChunks,
      duration: this.getSegmentTiming().duration
    });
    if (seekTime === null) {
      return false;
    }
    return this.seekCurrentSegmentToTime(seekTime);
  }
  seekCurrentAudioBySeconds(deltaSeconds) {
    const audio = this.currentAudio;
    const delta = Number(deltaSeconds);
    const session = this.activeSession;
    if (!Number.isFinite(delta) || session?.kind === "audio-export") {
      return false;
    }
    if (this.isActive(session) && session.seekTarget) {
      session.seekTarget.time += delta;
      return true;
    }
    if (!audio) return false;
    const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const time = currentTime + delta;
    const duration = audio.duration;
    if (this.isActive(session) && Array.isArray(session.chunks) && Number.isFinite(duration) && duration > 0 && (time < 0 || time >= duration)) {
      const index = Math.max(0, (this.readerState.currentChunk || 1) - 1);
      const adjacent = adjacentSpeechPart(session, index, session.currentPartIndex || 0, time < 0 ? -1 : 1);
      if (adjacent) {
        session.seekTarget = time < 0 ? { ...adjacent, time, fromEnd: true } : { ...adjacent, time: time - duration, fromEnd: false };
        session.requestedChunkIndex = session.seekTarget.index;
        session.requestedPartIndex = session.seekTarget.part;
        this.pauseRequested = Boolean(this.pauseRequested || audio.paused);
        audio.pause();
        if (typeof audio.onended === "function") audio.onended();
        this.updateStatus(this.settings.settingsLanguage === "chinese" ? "\u6B63\u5728\u8DE8\u6BB5\u5B9A\u4F4D" : "Seeking across segments", {
          canSeek: true,
          canPause: true,
          canStop: true,
          isPaused: this.pauseRequested,
          phase: "queued",
          status: this.pauseRequested ? "paused" : "running"
        });
        return true;
      }
    }
    return this.seekCurrentAudioToTime(currentTime + delta);
  }
  seekCurrentAudioToTime(seekTime) {
    const audio = this.currentAudio;
    const requestedTime = Number(seekTime);
    if (!audio || !Number.isFinite(requestedTime)) {
      return false;
    }
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    try {
      audio.currentTime = duration ? Math.min(duration, Math.max(0, requestedTime)) : Math.max(0, requestedTime);
    } catch (error) {
      return false;
    }
    if (!duration) {
      return true;
    }
    const chunkIndex = Math.max(0, (this.readerState.currentChunk || 1) - 1);
    const chunkProgress = duration ? this.getSegmentTiming().fraction : 0;
    this.setReaderState({
      progress: this.readerState.totalChunks ? (chunkIndex + chunkProgress) / this.readerState.totalChunks : 0
    });
    return true;
  }
  seekCurrentSegmentToTime(time) {
    const session = this.activeSession;
    const audio = this.currentAudio;
    if (!audio || !Number.isFinite(time) || session?.seekTarget) return false;
    const index = Math.max(0, (this.readerState.currentChunk || 1) - 1);
    if (!this.isActive(session) || getSpeechParts(session, index).length <= 1) return this.seekCurrentAudioToTime(time);
    const timing = this.getSegmentTiming();
    let localTime = Math.max(0, Math.min(timing.duration, time));
    let part = 0;
    while (part + 1 < timing.durations.length && localTime >= timing.durations[part]) {
      localTime -= timing.durations[part++];
    }
    if (part === (session.currentPartIndex || 0)) return this.seekCurrentAudioToTime(localTime);
    session.seekTarget = { index, part, time: localTime, fromEnd: false };
    session.requestedChunkIndex = index;
    session.requestedPartIndex = part;
    this.pauseRequested = Boolean(this.pauseRequested || audio.paused);
    audio.pause();
    audio.onended?.();
    this.setReaderState({ canSeek: false, canPause: true, isPaused: this.pauseRequested });
    return true;
  }
  jumpToAdjacentChunk(deltaChunks) {
    const session = this.activeSession;
    const total = Math.max(0, Math.floor(Number(this.readerState.totalChunks) || 0));
    const currentChunk = Math.max(0, Math.floor(Number(this.readerState.currentChunk) || 0));
    const delta = Math.trunc(Number(deltaChunks) || 0);
    if (!this.isActive(session) || !total || !currentChunk || !delta) {
      return false;
    }
    const currentIndex = Math.max(0, Math.min(total - 1, currentChunk - 1));
    const targetIndex = Math.max(0, Math.min(total - 1, currentIndex + delta));
    if (targetIndex === currentIndex) {
      return false;
    }
    session.requestedChunkIndex = targetIndex;
    session.requestedPartIndex = 0;
    session.seekTarget = null;
    this.pauseRequested = false;
    const audio = this.currentAudio;
    if (audio && typeof audio.pause === "function") {
      audio.pause();
    }
    if (audio && typeof audio.onended === "function") {
      audio.onended();
    }
    this.updateStatus(`${getSpeechEngineLabel(this.settings)} jump ${targetIndex + 1}/${total}`, {
      canPause: true,
      ...getChunkNavigationState(targetIndex + 1, total),
      canSeek: false,
      canStop: true,
      currentChunk: targetIndex + 1,
      isPaused: false,
      phase: "queued",
      progress: total ? targetIndex / total : 0,
      status: "running",
      totalChunks: total
    });
    return true;
  }
  async pauseOrResume() {
    const audio = this.activeSession?.seekTarget ? null : this.currentAudio;
    if (this.activeSession && this.activeSession.kind === "audio-export") {
      new Notice("CosyVoice: audio export can be stopped but not paused.", 6e3);
      return;
    }
    if (!audio) {
      if (!this.activeSession) {
        new Notice("CosyVoice: nothing is playing.");
        return;
      }
      this.pauseRequested = !this.pauseRequested;
      this.updateStatus(this.pauseRequested ? "CosyVoice paused" : "CosyVoice waiting", {
        canPause: true,
        ...getChunkNavigationState(this.readerState.currentChunk, this.readerState.totalChunks),
        canSeek: false,
        canStop: true,
        isPaused: this.pauseRequested,
        phase: this.pauseRequested ? "paused" : "synthesizing",
        status: this.pauseRequested ? "paused" : "running"
      });
      return;
    }
    if (audio.paused) {
      this.pauseRequested = false;
      await audio.play();
      this.updateStatus("CosyVoice playing", {
        canPause: true,
        ...getChunkNavigationState(this.readerState.currentChunk, this.readerState.totalChunks),
        canSeek: true,
        canStop: true,
        isPaused: false,
        phase: "playing",
        status: "running"
      });
    } else {
      this.pauseRequested = true;
      audio.pause();
      this.updateStatus("CosyVoice paused", {
        canPause: true,
        ...getChunkNavigationState(this.readerState.currentChunk, this.readerState.totalChunks),
        canSeek: true,
        canStop: true,
        isPaused: true,
        phase: "paused",
        status: "paused"
      });
    }
  }
  async cancelSessionOperations(session) {
    if (session) {
      session.stopped = true;
      this.notifySessionChunkWaiters(session);
    }
    if (session && session.pdfLoadingTask && typeof session.pdfLoadingTask.destroy === "function") {
      try {
        await session.pdfLoadingTask.destroy();
      } catch (error) {
        console.warn(`[${PLUGIN_ID}] Could not cancel PDF loading`, error);
      }
      session.pdfLoadingTask = null;
    }
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
    if (this.currentRequests instanceof Set) {
      for (const request of Array.from(this.currentRequests)) {
        request.destroy();
      }
      this.currentRequests.clear();
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.releaseAudioSource(this.currentAudio);
      this.currentAudio.removeAttribute("src");
      this.currentAudio.load();
      this.currentAudio = null;
    }
  }
  async stopReading(options = {}) {
    const previous = this.activeSession;
    await this.saveSessionReadingPosition(previous);
    this.transitionSessionPhase(previous, "stopping");
    this.sequence += 1;
    this.pauseRequested = false;
    await this.cancelSessionOperations(previous);
    this.transitionSessionPhase(previous, "idle");
    this.activeSession = null;
    this.updateStatus("CosyVoice idle", createReaderState());
    if (previous && this.settings && this.settings.cleanupCache) {
      await this.cleanupSessionFiles(previous);
    }
    if (!options.silent) {
      new Notice("CosyVoice: stopped.");
    }
  }
  async cleanupSessionFiles(session, options = {}) {
    if (!session || !Array.isArray(session.files)) {
      return;
    }
    const preservedPaths = new Set(
      (Array.isArray(options.preservePaths) ? options.preservePaths : []).filter(Boolean).map((filePath) => path.resolve(filePath))
    );
    for (const filePath of session.files) {
      if (preservedPaths.has(path.resolve(filePath))) {
        continue;
      }
      await this.removeTempFile(filePath);
    }
  }
  async removeTempFile(filePath) {
    if (!this.cacheDir || !isInsideDirectory(filePath, this.cacheDir)) {
      return;
    }
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if (error && error.code !== "ENOENT") {
        console.warn(`[${PLUGIN_ID}] Could not remove temp file`, filePath, error);
      }
    }
  }
  isActive(session) {
    return Boolean(session && this.activeSession === session && !session.stopped && session.id === this.sequence);
  }
  updateStatus(text, patch = {}) {
    if (patch && patch.phase && this.activeSession) {
      this.transitionSessionPhase(this.activeSession, patch.phase);
    }
    if (this.statusBar) {
      this.statusBar.setText(text);
    }
    this.setReaderState({
      label: text,
      ...patch
    });
  }
  async writeRuntimeLog(stage, _details = {}) {
    if (!this.logPath || !this.settings || !this.settings.diagnosticLogging) {
      return;
    }
    const event = createSafeRuntimeLogEvent(stage, this.settings);
    if (!event) {
      return;
    }
    const line = `${JSON.stringify(event)}
`;
    try {
      const stat = await fs.promises.stat(this.logPath).catch((error) => {
        if (error && error.code === "ENOENT") {
          return null;
        }
        throw error;
      });
      if (stat && stat.size + Buffer.byteLength(line, "utf8") > RUNTIME_LOG_MAX_BYTES) {
        await fs.promises.unlink(this.logPath);
      }
      await fs.promises.appendFile(this.logPath, line, { encoding: "utf8", mode: 384 });
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] Could not write runtime log`, error);
    }
  }
};
var CosyVoiceReaderView = class extends ItemView {
  translate(text) {
    if (this.plugin.settings?.settingsLanguage !== "chinese") return text;
    return {
      "Voice Reader": "\u8BED\u97F3\u6717\u8BFB",
      "Voice reader controls": "\u6717\u8BFB\u63A7\u5236\u9762\u677F",
      "Previous chunk": "\u4E0A\u4E00\u6BB5",
      "Next chunk": "\u4E0B\u4E00\u6BB5",
      "Reading progress": "\u6717\u8BFB\u8FDB\u5EA6",
      "Read selection": "\u6717\u8BFB\u9009\u4E2D\u6587\u5B57",
      "Read from selection": "\u4ECE\u9009\u4E2D\u4F4D\u7F6E\u6717\u8BFB",
      "Read file": "\u6717\u8BFB\u5168\u6587",
      "Export audio": "\u5BFC\u51FA\u97F3\u9891",
      "Export & insert audio": "\u5BFC\u51FA\u5E76\u63D2\u5165\u97F3\u9891",
      "Retry merge only": "\u4EC5\u91CD\u8BD5\u62FC\u63A5",
      "Resume file": "\u4ECE\u4E0A\u6B21\u4F4D\u7F6E\u7EED\u8BFB",
      "Resume": "\u7EE7\u7EED",
      "Pause": "\u6682\u505C",
      "Stop": "\u505C\u6B62",
      "Resume reading (or press Space)": "\u7EE7\u7EED\u6717\u8BFB\uFF08\u4E5F\u53EF\u6309\u7A7A\u683C\u952E\uFF09",
      "Pause reading (or press Space)": "\u6682\u505C\u6717\u8BFB\uFF08\u4E5F\u53EF\u6309\u7A7A\u683C\u952E\uFF09",
      "Export all, selected, or remaining audio from the current note, PDF or HTML": "\u5BFC\u51FA\u5F53\u524D\u7B14\u8BB0\u3001PDF \u6216 HTML \u7684\u5168\u90E8\u3001\u9009\u4E2D\u90E8\u5206\u6216\u9009\u4E2D\u4F4D\u7F6E\u4EE5\u540E\u7684\u97F3\u9891",
      "Export audio and insert it into the current Markdown note": "\u5BFC\u51FA\u97F3\u9891\u5E76\u63D2\u5165\u5F53\u524D Markdown \u7B14\u8BB0",
      "Audio can be inserted into Markdown notes, not PDF or HTML files": "\u97F3\u9891\u53EA\u80FD\u63D2\u5165 Markdown \u7B14\u8BB0\uFF0C\u4E0D\u80FD\u63D2\u5165 PDF \u6216 HTML",
      "Reuse the kept synthesized segments without making any TTS API requests": "\u590D\u7528\u4FDD\u7559\u7684\u5206\u6BB5\u97F3\u9891\uFF0C\u4E0D\u518D\u8C03\u7528\u8BED\u97F3 API",
      "Phase": "\u9636\u6BB5",
      "Source": "\u6765\u6E90",
      "Text": "\u6587\u672C",
      "Overall progress": "\u5168\u6587\u8FDB\u5EA6",
      "Current segment": "\u5F53\u524D\u6BB5",
      "Current segment progress": "\u5F53\u524D\u6BB5\u64AD\u653E\u8FDB\u5EA6",
      "Waiting for audio": "\u7B49\u5F85\u97F3\u9891"
    }[text] || text;
  }
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.handlePanelKeydown = this.handlePanelKeydown.bind(this);
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return this.translate("Voice Reader");
  }
  getIcon() {
    return "volume-2";
  }
  async onOpen() {
    this.plugin.registerReaderView(this);
  }
  async onClose() {
    this.plugin.unregisterReaderView(this);
  }
  render() {
    if (this.volumeInteracting) return;
    if (this.chunkSeekEditing && this.chunkSeekAudio === this.plugin.currentAudio && this.plugin.readerState?.canSeek) return;
    this.chunkSeekEditing = false;
    const root = this.contentEl || this.containerEl.children[1] || this.containerEl;
    const state = this.plugin.readerState || createReaderState();
    root.empty();
    root.addClass("note-reader-cosyvoice-view");
    root.setAttribute("tabindex", "0");
    root.setAttribute("aria-label", this.translate("Voice reader controls"));
    root.addEventListener("keydown", this.handlePanelKeydown);
    const header = root.createDiv({ cls: "note-reader-cosyvoice-panel-header" });
    header.createEl("h3", { text: this.translate("Voice Reader") });
    header.createDiv({ cls: `note-reader-cosyvoice-state is-${state.status}`, text: state.label });
    const progressWrap = root.createDiv({ cls: "note-reader-cosyvoice-progress-wrap" });
    progressWrap.createDiv({ cls: "note-reader-cosyvoice-section-label", text: this.translate("Overall progress") });
    const progressControls = progressWrap.createDiv({ cls: "note-reader-cosyvoice-progress-controls" });
    this.createIconButton(progressControls, "skip-back", "Previous chunk", () => {
      this.plugin.jumpToAdjacentChunk(-1);
    }, !state.canPreviousChunk, { triggerOnPointerDown: true });
    const canNavigateProgress = state.canSeek || state.canNextChunk || state.canPreviousChunk;
    const progressTrack = progressControls.createDiv({
      cls: `note-reader-cosyvoice-progress-track${canNavigateProgress ? " is-seekable" : ""}`
    });
    const progressFill = progressTrack.createDiv({ cls: "note-reader-cosyvoice-progress-fill" });
    progressFill.style.width = `${Math.round(state.progress * 100)}%`;
    const progressInput = progressTrack.createEl("input", {
      cls: "note-reader-cosyvoice-progress-input",
      attr: {
        "aria-label": this.translate("Reading progress"),
        max: "1000",
        min: "0",
        step: "1",
        title: this.plugin.settings?.settingsLanguage === "chinese" ? "\u8DF3\u8F6C\u5230\u6307\u5B9A\u5206\u6BB5\u7684\u5F00\u5934\uFF1B\u672A\u5408\u6210\u7684\u5206\u6BB5\u9700\u8981\u7B49\u5F85\u5408\u6210\u3002" : "Jump to the start of a segment; unprepared segments require synthesis.",
        type: "range",
        value: String(Math.round(state.progress * 1e3))
      }
    });
    progressInput.disabled = !canNavigateProgress;
    progressInput.addEventListener("pointerdown", (event) => {
      if (!canNavigateProgress || event.button !== 0) return;
      const bounds = progressInput.getBoundingClientRect();
      if (!bounds.width) return;
      event.preventDefault();
      event.stopPropagation();
      this.seekToSegment(clampProgress((event.clientX - bounds.left) / bounds.width));
    });
    progressInput.addEventListener("input", () => {
      if (!canNavigateProgress) {
        return;
      }
      const requestedProgress = Number(progressInput.value) / 1e3;
      this.seekToSegment(requestedProgress);
    });
    this.createIconButton(progressControls, "skip-forward", "Next chunk", () => {
      this.plugin.jumpToAdjacentChunk(1);
    }, !state.canNextChunk, { triggerOnPointerDown: true });
    const meta = progressWrap.createDiv({ cls: "note-reader-cosyvoice-meta" });
    meta.createSpan({ text: formatProgressLabel(state) });
    meta.createSpan({ text: `${Math.round(state.progress * 100)}%` });
    const estimate = estimatePlayback(
      this.plugin.activeSession,
      Math.max(0, (state.currentChunk || 1) - 1),
      this.plugin.getSegmentTiming().current,
      this.plugin.settings.speed,
      normalizeSpeed(this.plugin.settings.playbackSpeed)
    );
    if (estimate) {
      const zh = this.plugin.settings.settingsLanguage === "chinese";
      const timing = progressWrap.createDiv({ cls: "note-reader-cosyvoice-meta" });
      timing.style.flexWrap = "wrap";
      timing.style.gap = "4px 12px";
      timing.createSpan({ text: `${zh ? "\u9884\u8BA1\u603B\u65F6\u957F" : "Estimated total"} ${formatDuration(estimate.total)}` });
      timing.createSpan({ text: `${zh ? "\u9884\u8BA1\u5269\u4F59" : "Estimated remaining"} ${formatDuration(estimate.remaining)}` });
      if (estimate.partial) progressWrap.createDiv({
        cls: "note-reader-cosyvoice-meta",
        text: zh ? "\u4EC5\u8BA1\u5DF2\u89E3\u6790\u9875\u9762\uFF0C\u968F\u89E3\u6790\u66F4\u65B0" : "Parsed pages only; updates as parsing continues"
      });
      timing.title = zh ? "\u672A\u5408\u6210\u90E8\u5206\u6309\u6587\u672C\u4F30\u7B97\uFF1B\u4E0D\u542B\u7F51\u7EDC\u7B49\u5F85\u548C\u6682\u505C\u65F6\u95F4\u3002" : "Text estimate for unsynthesized chunks; excludes network waits and pauses.";
    }
    this.createChunkSeekPanel(root, state);
    const seekControls = root.createDiv({ cls: "note-reader-cosyvoice-actions" });
    const zhControls = this.plugin.settings?.settingsLanguage === "chinese";
    this.createActionButton(seekControls, "rotate-ccw", zhControls ? "\u540E\u9000 5 \u79D2" : "Back 5s", () => {
      this.plugin.seekCurrentAudioBySeconds(-KEYBOARD_SEEK_SECONDS);
    }, !state.canSeek && !this.plugin.activeSession?.seekTarget, { triggerOnPointerDown: true });
    this.createActionButton(seekControls, "rotate-cw", zhControls ? "\u524D\u8FDB 5 \u79D2" : "Forward 5s", () => {
      this.plugin.seekCurrentAudioBySeconds(KEYBOARD_SEEK_SECONDS);
    }, !state.canSeek && !this.plugin.activeSession?.seekTarget, { triggerOnPointerDown: true });
    const playbackOptions = root.createDiv({ cls: "note-reader-cosyvoice-playback-options" });
    this.createSpeedPanel(playbackOptions);
    this.createVolumePanel(playbackOptions);
    const actions = root.createDiv({ cls: "note-reader-cosyvoice-actions" });
    const canExportFile = typeof this.plugin.canExportCurrentFile !== "function" || this.plugin.canExportCurrentFile();
    const canInsertExport = typeof this.plugin.canInsertAudioExportIntoCurrentNote !== "function" || this.plugin.canInsertAudioExportIntoCurrentNote();
    this.createActionButton(actions, "play", "Read selection", () => {
      this.runPluginAction("Read selection", () => this.plugin.readSelection());
    }, false, { triggerOnPointerDown: true });
    this.createActionButton(actions, "list-start", "Read from selection", () => {
      this.runPluginAction("Read from selection", () => this.plugin.readFromSelection());
    }, false, { triggerOnPointerDown: true });
    this.createActionButton(actions, "file-text", "Read file", () => {
      this.runPluginAction("Read file", () => this.plugin.readCurrentNote());
    }, false, { triggerOnPointerDown: true });
    this.createActionButton(actions, "download", "Export audio", () => {
      this.runPluginAction("Export audio", () => this.plugin.exportCurrentFileAudio({ insertAfterExport: false }));
    }, !canExportFile, {
      title: "Export all, selected, or remaining audio from the current note, PDF or HTML",
      triggerOnPointerDown: true
    });
    this.createActionButton(actions, "paperclip", "Export & insert audio", () => {
      this.runPluginAction("Export and insert audio", () => this.plugin.exportCurrentFileAudio({ insertAfterExport: true }));
    }, !canInsertExport, {
      title: canInsertExport ? "Export audio and insert it into the current Markdown note" : "Audio can be inserted into Markdown notes, not PDF or HTML files",
      triggerOnPointerDown: true
    });
    const hasPendingAudioMerge = typeof this.plugin.hasPendingAudioMerge === "function" && this.plugin.hasPendingAudioMerge();
    if (hasPendingAudioMerge) {
      this.createActionButton(actions, "refresh-cw", "Retry merge only", () => {
        this.runPluginAction("Retry merge only", () => this.plugin.retryPendingAudioMerge());
      }, Boolean(this.plugin.activeSession), {
        title: "Reuse the kept synthesized segments without making any TTS API requests",
        triggerOnPointerDown: true
      });
    }
    const canResumeFile = typeof this.plugin.canResumeCurrentFile === "function" && this.plugin.canResumeCurrentFile();
    this.createActionButton(actions, "history", "Resume file", () => {
      this.runPluginAction("Resume file", () => this.plugin.resumeCurrentFile());
    }, !canResumeFile, { triggerOnPointerDown: true });
    this.createActionButton(
      seekControls,
      state.isPaused ? "play" : "pause",
      state.isPaused ? "Resume" : "Pause",
      () => {
        void this.plugin.pauseOrResume();
      },
      !state.canPause,
      {
        title: state.isPaused ? "Resume reading (or press Space)" : "Pause reading (or press Space)",
        triggerOnPointerDown: true
      }
    );
    this.createActionButton(
      seekControls,
      "square",
      "Stop",
      () => {
        this.runPluginAction("Stop", () => this.plugin.stopReading());
      },
      !state.canStop,
      { triggerOnPointerDown: true }
    );
    const details = root.createDiv({ cls: "note-reader-cosyvoice-details" });
    details.createDiv({ cls: "note-reader-cosyvoice-detail-label", text: this.translate("Phase") });
    details.createDiv({ cls: "note-reader-cosyvoice-detail-value", text: state.phase });
    details.createDiv({ cls: "note-reader-cosyvoice-detail-label", text: this.translate("Source") });
    details.createDiv({ cls: "note-reader-cosyvoice-detail-value", text: state.source || "-" });
    if (state.error) {
      root.createDiv({ cls: "note-reader-cosyvoice-error", text: state.error });
    }
    const preview = root.createDiv({ cls: "note-reader-cosyvoice-preview" });
    preview.createDiv({ cls: "note-reader-cosyvoice-detail-label", text: this.translate("Text") });
    preview.createDiv({
      cls: "note-reader-cosyvoice-preview-text",
      text: state.currentText || "-"
    });
  }
  seekToSegment(progress) {
    const state = this.plugin.readerState;
    const count = this.plugin.activeSession?.chunks?.length || state.totalChunks;
    if (!count) return;
    const target = Math.min(count - 1, Math.floor(clampProgress(progress) * count));
    const current = Math.max(0, (state.currentChunk || 1) - 1);
    if (target !== current) this.plugin.jumpToAdjacentChunk(target - current);
    else this.plugin.seekCurrentSegmentToTime(0);
  }
  createChunkSeekPanel(parent, state) {
    const audio = this.plugin.currentAudio;
    const timing = this.plugin.getSegmentTiming();
    const duration = timing.duration;
    const enabled = Boolean(state.canSeek && duration > 0 && !this.plugin.activeSession?.seekTarget);
    const panel = parent.createDiv({ cls: "note-reader-cosyvoice-chunk-seek" });
    const header = panel.createDiv({ cls: "note-reader-cosyvoice-meta" });
    header.createSpan({ text: `${this.translate("Current segment")} ${state.currentChunk || 0} / ${state.totalChunks || 0}` });
    const current = timing.current;
    const timeLabel = header.createSpan({ text: enabled ? `${formatDuration(current)} / ${formatDuration(duration)}` : this.translate("Waiting for audio") });
    const slider = panel.createEl("input", { attr: {
      type: "range",
      min: "0",
      max: "1000",
      step: "1",
      value: String(duration > 0 ? Math.round(current / duration * 1e3) : 0),
      "aria-label": this.translate("Current segment progress")
    } });
    slider.disabled = !enabled;
    const begin = () => {
      if (!enabled) return;
      this.chunkSeekEditing = true;
      this.chunkSeekAudio = audio;
    };
    const finish = () => {
      this.chunkSeekEditing = false;
    };
    slider.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !enabled) return;
      begin();
      try {
        slider.setPointerCapture(event.pointerId);
      } catch (_) {
        finish();
      }
    });
    slider.addEventListener("keydown", begin);
    slider.addEventListener("blur", () => {
      finish();
      this.render();
    });
    slider.addEventListener("pointercancel", () => {
      finish();
      this.render();
    });
    slider.addEventListener("lostpointercapture", finish);
    slider.addEventListener("pointerup", finish);
    slider.addEventListener("input", () => {
      timeLabel.textContent = `${formatDuration(Number(slider.value) / 1e3 * duration)} / ${formatDuration(duration)}`;
    });
    slider.addEventListener("change", () => {
      if (enabled && audio === this.plugin.currentAudio && this.plugin.readerState.canSeek && !this.plugin.activeSession?.seekTarget) {
        this.plugin.seekCurrentSegmentToTime(Number(slider.value) / 1e3 * duration);
      }
      finish();
      this.render();
    });
  }
  createVolumePanel(parent) {
    const zh = this.plugin.settings?.settingsLanguage === "chinese";
    const panel = parent.createDiv({ cls: "note-reader-cosyvoice-speed-panel" });
    const header = panel.createDiv({ cls: "note-reader-cosyvoice-speed-header" });
    header.createSpan({ text: zh ? "\u97F3\u91CF" : "Volume" });
    const volume = normalizeVolume(this.plugin.settings?.playbackVolume);
    const label = header.createSpan({ text: `${Math.round(volume * 100)}%` });
    const slider = panel.createEl("input", { attr: {
      type: "range",
      min: "0",
      max: "100",
      step: "1",
      value: String(Math.round(volume * 100)),
      "aria-label": zh ? "\u64AD\u653E\u97F3\u91CF" : "Playback volume"
    } });
    slider.style.width = "100%";
    slider.addEventListener("pointerdown", (event) => {
      if (Number.isFinite(event.button) && event.button !== 0) return;
      this.volumeInteracting = true;
      try {
        slider.setPointerCapture(event.pointerId);
      } catch (_) {
        this.volumeInteracting = false;
      }
    });
    const release = () => {
      this.volumeInteracting = false;
    };
    slider.addEventListener("lostpointercapture", release);
    slider.addEventListener("pointerup", release);
    slider.addEventListener("pointercancel", release);
    slider.addEventListener("blur", release);
    slider.addEventListener("keydown", () => {
      this.volumeInteracting = true;
    });
    slider.addEventListener("keyup", release);
    slider.addEventListener("input", () => {
      const next = this.plugin.setPlaybackVolume(Number(slider.value) / 100);
      label.textContent = `${Math.round(next * 100)}%`;
    });
    slider.addEventListener("change", () => {
      this.runPluginAction("Save playback volume", () => this.plugin.saveSettings());
    });
  }
  createSpeedPanel(parent) {
    const currentSpeed = normalizeSpeed(this.plugin.settings && this.plugin.settings.playbackSpeed);
    const panel = parent.createDiv({ cls: "note-reader-cosyvoice-speed-panel" });
    const header = panel.createDiv({ cls: "note-reader-cosyvoice-speed-header" });
    header.createSpan({ cls: "note-reader-cosyvoice-detail-label", text: this.plugin.settings?.settingsLanguage === "chinese" ? "\u64AD\u653E\u500D\u901F" : "Playback speed" });
    header.title = this.plugin.settings?.settingsLanguage === "chinese" ? "\u7ACB\u5373\u8C03\u8282\u64AD\u653E\u500D\u901F\uFF0C\u4E0D\u91CD\u65B0\u5408\u6210\u97F3\u9891\uFF0C\u4E0D\u6539\u53D8\u5BFC\u51FA\u6587\u4EF6\u3002" : "Immediate playback speed; no resynthesis or changes to exported files.";
    header.createSpan({ cls: "note-reader-cosyvoice-speed-current", text: formatSpeedLabel(currentSpeed) });
    const options = panel.createDiv({ cls: "note-reader-cosyvoice-speed-options" });
    for (const speed of getSpeedPresets()) {
      const isActive = Math.abs(currentSpeed - speed) < 1e-3;
      const speedTitle = this.plugin.settings?.settingsLanguage === "chinese" ? `\u64AD\u653E\u500D\u901F\u8BBE\u4E3A ${formatSpeedLabel(speed)}` : `Set playback speed to ${formatSpeedLabel(speed)}`;
      const button = options.createEl("button", {
        cls: `note-reader-cosyvoice-speed-option${isActive ? " is-active" : ""}`,
        text: formatSpeedLabel(speed),
        attr: {
          "aria-label": speedTitle,
          "aria-pressed": String(isActive),
          title: speedTitle
        }
      });
      this.wireButtonAction(button, () => {
        this.runPluginAction("Set playback speed", () => this.plugin.setPlaybackSpeed(speed));
      }, { triggerOnPointerDown: true });
    }
  }
  handlePanelKeydown(event) {
    this.plugin.handleReaderKeydown(event, { allowPause: true, focusPanel: event.currentTarget });
  }
  focusPanel(panel) {
    focusElementWithoutScroll(panel);
  }
  runPluginAction(label, action) {
    if (this.plugin && typeof this.plugin.runUserAction === "function") {
      void this.plugin.runUserAction(label, action);
      return;
    }
    try {
      const result = action();
      if (result && typeof result.catch === "function") {
        void result.catch((error) => console.error(`[${PLUGIN_ID}] ${label} failed`, error));
      }
    } catch (error) {
      console.error(`[${PLUGIN_ID}] ${label} failed`, error);
    }
  }
  createIconButton(parent, icon, label, onClick, disabled = false, options = {}) {
    label = this.translate(label);
    const button = parent.createEl("button", {
      cls: "note-reader-cosyvoice-icon-button",
      attr: {
        "aria-label": label,
        title: label
      }
    });
    button.disabled = disabled;
    if (typeof setIcon === "function") {
      setIcon(button, icon);
    }
    this.wireButtonAction(button, onClick, options);
    return button;
  }
  createActionButton(parent, icon, label, onClick, disabled = false, options = {}) {
    label = this.translate(label);
    const button = parent.createEl("button", {
      cls: "note-reader-cosyvoice-action",
      attr: {
        "aria-label": label,
        title: this.translate(options.title || label)
      }
    });
    button.disabled = disabled;
    const iconEl = button.createSpan({ cls: "note-reader-cosyvoice-action-icon" });
    if (typeof setIcon === "function") {
      setIcon(iconEl, icon);
    }
    button.createSpan({ cls: "note-reader-cosyvoice-action-label", text: label });
    this.wireButtonAction(button, onClick, options);
    return button;
  }
  wireButtonAction(button, onClick, options = {}) {
    let pointerHandled = false;
    if (options.triggerOnPointerDown) {
      button.addEventListener("pointerdown", (event) => {
        if (button.disabled || event.defaultPrevented || Number.isFinite(event.button) && event.button !== 0) {
          return;
        }
        pointerHandled = true;
        event.preventDefault();
        event.stopPropagation();
        onClick(event);
      });
    }
    button.addEventListener("click", (event) => {
      if (button.disabled) return;
      if (pointerHandled) {
        pointerHandled = false;
        event.preventDefault();
        return;
      }
      onClick(event);
    });
  }
};
var CosyVoiceReaderSettingTab = class extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Note and PDF Voice Reader" });
    const settingsLanguage = normalizeSettingsLanguage(this.plugin.settings.settingsLanguage);
    const ui = getSettingsUiText(settingsLanguage);
    const selectedSpeechEngine = normalizeSpeechEngine(this.plugin.settings.speechEngine);
    const microsoftVoicePresets = getMicrosoftVoicePresets(settingsLanguage);
    const commonVoiceIds = new Set(microsoftVoicePresets.map(([id]) => id));
    new Setting(containerEl).setName(ui.settingsLanguageName).setDesc(ui.settingsLanguageDesc).addDropdown((dropdown) => {
      dropdown.addOption("english", ui.settingsLanguageEnglish).addOption("chinese", ui.settingsLanguageChinese).setValue(settingsLanguage).onChange(async (value) => {
        this.plugin.settings.settingsLanguage = normalizeSettingsLanguage(value);
        await this.plugin.saveSettings();
        this.plugin.renderReaderViews();
        this.display();
      });
    });
    new Setting(containerEl).setName(ui.speechEngineName).setDesc(ui.speechEngineDesc).addDropdown((dropdown) => {
      dropdown.addOption("local-cosyvoice", ui.speechEngineLocal).addOption("edge-tts", ui.speechEngineEdge).addOption("azure-speech", ui.speechEngineAzure).addOption("openrouter-tts", ui.speechEngineOpenRouter).addOption("mimo-tts", "Xiaomi MiMo TTS").setValue(selectedSpeechEngine).onChange(async (value) => {
        this.plugin.settings.speechEngine = normalizeSpeechEngine(value);
        await this.plugin.saveSettings();
        this.display();
      });
    });
    if (selectedSpeechEngine === "mimo-tts") {
      const zh = settingsLanguage === "chinese";
      const label = (en, cn) => zh ? cn : en;
      new Setting(containerEl).setName(label("Allow MiMo online processing", "\u5141\u8BB8 MiMo \u5728\u7EBF\u5904\u7406")).setDesc(label(
        "Sends reading text to Xiaomi. Xiaomi states that supplied text is not used for training without prior consent. Zero data retention is NOT confirmed. This switch permits synthesis only, not model training.",
        "\u6717\u8BFB\u6587\u672C\u4F1A\u53D1\u9001\u7ED9\u5C0F\u7C73\u3002\u5C0F\u7C73\u58F0\u660E\u672A\u7ECF\u4E8B\u5148\u540C\u610F\u4E0D\u4F1A\u5C06\u63D0\u4F9B\u7684\u6587\u672C\u7528\u4E8E\u8BAD\u7EC3\uFF0C\u4F46\u672A\u786E\u8BA4\u96F6\u6570\u636E\u4FDD\u7559\uFF08ZDR\uFF09\u3002\u6B64\u5F00\u5173\u4EC5\u6388\u6743\u5728\u7EBF\u5408\u6210\uFF0C\u4E0D\u6388\u6743\u6A21\u578B\u8BAD\u7EC3\u3002"
      )).addToggle((toggle) => toggle.setValue(this.plugin.settings.mimoConsent === true).onChange(async (value) => {
        this.plugin.settings.mimoConsent = value;
        await this.plugin.saveSettings();
      }));
      new Setting(containerEl).setName(label("MiMo model and pricing", "MiMo \u6A21\u578B\u4E0E\u4EF7\u683C")).setDesc(label(
        "mimo-v2.5-tts with built-in voices. Listed as temporarily free on 2026-09-27; limits and pricing may change. Speed is a natural-language instruction, not an exact synthesis rate.",
        "\u4F7F\u7528 mimo-v2.5-tts \u5B98\u65B9\u9884\u7F6E\u97F3\u8272\u30022026-09-27 \u5B98\u65B9\u5217\u4E3A\u9650\u65F6\u514D\u8D39\uFF0C\u989D\u5EA6\u53CA\u4EF7\u683C\u53EF\u80FD\u53D8\u5316\u3002\u5408\u6210\u8BED\u901F\u901A\u8FC7\u81EA\u7136\u8BED\u8A00\u6307\u4EE4\u63A7\u5236\uFF0C\u4E0D\u4FDD\u8BC1\u7CBE\u786E\u500D\u7387\u3002"
      )).addButton((button) => button.setButtonText(label("Pricing", "\u5B98\u65B9\u4EF7\u683C")).onClick(() => window.open("https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go"))).addButton((button) => button.setButtonText(label("Privacy", "\u9690\u79C1\u653F\u7B56")).onClick(() => window.open("https://privacy.mi.com/XiaomiMiMoPlatform/zh_CN/")));
      new Setting(containerEl).setName(label("MiMo completeness protection", "MiMo \u5B8C\u6574\u6027\u4FDD\u62A4")).setDesc(label(
        "Abnormal completion stops reading without automatic resynthesis. Normal completion does not prove every word was spoken.",
        "\u5F02\u5E38\u7ED3\u675F\u4F1A\u505C\u6B62\u6717\u8BFB\uFF0C\u4E0D\u81EA\u52A8\u91CD\u65B0\u5408\u6210\u3002\u6B63\u5E38\u7ED3\u675F\u6807\u8BB0\u4ECD\u4E0D\u80FD\u8BC1\u660E\u6BCF\u4E2A\u5B57\u90FD\u5DF2\u8BFB\u51FA\u3002"
      ));
      new Setting(containerEl).setName(label("MiMo chunk character cap", "MiMo \u6BCF\u6BB5\u5B57\u7B26\u4E0A\u9650")).setDesc(label(
        "Client precaution, not an API limit. Default 200; adjustable 50-2000. Effective size is the smaller of this cap and online chunk limits. Smaller chunks increase request count.",
        "\u5BA2\u6237\u7AEF\u4FDD\u5B88\u503C\uFF0C\u4E0D\u662F\u63A5\u53E3\u4E0A\u9650\u3002\u9ED8\u8BA4 200\uFF0C\u53EF\u8C03 50\u20132000\uFF1B\u4E0E\u5728\u7EBF\u5206\u6BB5\u8BBE\u7F6E\u53D6\u8F83\u5C0F\u503C\u3002\u8F83\u5C0F\u7684\u5206\u6BB5\u4F1A\u589E\u52A0\u8BF7\u6C42\u6B21\u6570\u3002"
      )).addText((text) => text.setValue(String(this.plugin.settings.mimoChunkLimit || 200)).onChange(async (value) => {
        if (!/^\d+$/.test(value) || Number(value) < 50 || Number(value) > 2e3) return;
        this.plugin.settings.mimoChunkLimit = Number(value);
        await this.plugin.saveSettings();
      }));
      const credentialSource = normalizeCredentialSource(this.plugin.settings.mimoCredentialSource);
      new Setting(containerEl).setName(ui.credentialSourceName).setDesc(ui.credentialSourceDesc).addDropdown((dropdown) => dropdown.addOption("obsidian-secret", ui.credentialSourceSecret).addOption("key-file", ui.credentialSourceFile).setValue(credentialSource).onChange(async (value) => {
        this.plugin.settings.mimoCredentialSource = normalizeCredentialSource(value);
        await this.plugin.saveSettings();
        this.display();
      }));
      if (credentialSource === "obsidian-secret") {
        if (hasObsidianSecretStorageUi(this.app)) {
          new Setting(containerEl).setName(label("MiMo API secret", "MiMo API \u79D8\u5BC6")).setDesc(label(
            "Use a regular MiMo API key, not a Token Plan key. Only the secret name is saved in data.json.",
            "\u4F7F\u7528\u666E\u901A MiMo API Key\uFF0C\u4E0D\u662F Token Plan \u5BC6\u94A5\u3002data.json \u53EA\u4FDD\u5B58\u79D8\u5BC6\u540D\u79F0\uFF0C\u4E0D\u4FDD\u5B58\u5BC6\u94A5\u3002"
          )).addComponent((element) => new SecretComponent(this.app, element).setValue(this.plugin.settings.mimoSecretName || "").onChange(async (value) => {
            this.plugin.settings.mimoSecretName = String(value || "").trim();
            await this.plugin.saveSettings();
          }));
        } else {
          new Setting(containerEl).setName(ui.secretStorageUnavailableName).setDesc(ui.secretStorageUnavailableDesc);
        }
      } else {
        new Setting(containerEl).setName(label("MiMo API key file", "MiMo API \u5BC6\u94A5\u6587\u4EF6")).setDesc(label(
          "Absolute path to a one-line MiMo API key file outside the vault. Do not paste the key here.",
          "\u586B\u5199\u5E93\u5916\u5355\u884C MiMo API \u5BC6\u94A5\u6587\u4EF6\u7684\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u4E0D\u8981\u5728\u8FD9\u91CC\u7C98\u8D34\u5BC6\u94A5\u3002"
        )).addText((text) => text.setValue(this.plugin.settings.mimoKeyPath || "").onChange(async (value) => {
          this.plugin.settings.mimoKeyPath = value.trim();
          await this.plugin.saveSettings();
        }));
      }
      new Setting(containerEl).setName(label("MiMo voice", "MiMo \u97F3\u8272")).setDesc(label(
        "Eight official voices. English accents are not specified by Xiaomi. Default: Bai Hua (Chinese male).",
        "8 \u79CD\u5B98\u65B9\u97F3\u8272\u3002\u5B98\u65B9\u672A\u660E\u786E\u533A\u5206\u82F1\u8BED\u97F3\u8272\u7684\u82F1\u5F0F\u6216\u7F8E\u5F0F\u53E3\u97F3\u3002\u9ED8\u8BA4\u767D\u6866\uFF08\u4E2D\u6587\u7537\u58F0\uFF09\u3002"
      )).addDropdown((dropdown) => {
        for (const [id, en, cn] of MIMO_VOICES) dropdown.addOption(id, `${id} - ${label(en, cn)}`);
        dropdown.setValue(this.plugin.settings.mimoVoice || MIMO_DEFAULTS.mimoVoice).onChange(async (value) => {
          this.plugin.settings.mimoVoice = value;
          await this.plugin.saveSettings();
        });
      });
    }
    if (selectedSpeechEngine === "local-cosyvoice") {
      new Setting(containerEl).setName(ui.localScriptName).setDesc(ui.localScriptDesc).addText((text) => {
        text.setPlaceholder(RECOMMENDED_SCRIPT_PATH).setValue(this.plugin.settings.scriptPath).onChange(async (value) => {
          this.plugin.settings.scriptPath = value.trim();
          await this.plugin.saveSettings();
        });
        text.inputEl.addClass("note-reader-cosyvoice-script-input");
      });
    }
    if (selectedSpeechEngine === "edge-tts") {
      new Setting(containerEl).setName(ui.edgeConsentName).setDesc(ui.edgeConsentDesc).addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.edgeTtsConsent === true).onChange(async (value) => {
          this.plugin.settings.edgeTtsConsent = value;
          await this.plugin.saveSettings();
        });
      });
      new Setting(containerEl).setName(ui.edgeExecutableName).setDesc(ui.edgeExecutableDesc).addText((text) => {
        text.setPlaceholder(DEFAULT_EDGE_TTS_EXECUTABLE).setValue(normalizeEdgeTtsExecutable(this.plugin.settings.edgeTtsExecutable)).onChange(async (value) => {
          this.plugin.settings.edgeTtsExecutable = normalizeEdgeTtsExecutable(value);
          await this.plugin.saveSettings();
        });
        text.inputEl.addClass("note-reader-cosyvoice-script-input");
      });
      const currentEdgeVoice = normalizeEdgeTtsVoice(this.plugin.settings.edgeTtsVoice);
      new Setting(containerEl).setName(ui.edgeCommonVoicesName).setDesc(ui.edgeCommonVoicesDesc).addDropdown((dropdown) => {
        for (const [voiceId, label] of microsoftVoicePresets) {
          dropdown.addOption(voiceId, label);
        }
        dropdown.addOption("__custom__", ui.customVoiceOption).setValue(commonVoiceIds.has(currentEdgeVoice) ? currentEdgeVoice : "__custom__").onChange(async (value) => {
          if (value === "__custom__") {
            return;
          }
          this.plugin.settings.edgeTtsVoice = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });
      new Setting(containerEl).setName(ui.edgeVoiceName).setDesc(ui.edgeVoiceDesc).addText((text) => {
        text.setPlaceholder(DEFAULT_EDGE_TTS_VOICE).setValue(normalizeEdgeTtsVoice(this.plugin.settings.edgeTtsVoice)).onChange(async (value) => {
          this.plugin.settings.edgeTtsVoice = normalizeEdgeTtsVoice(value);
          await this.plugin.saveSettings();
        });
      });
    }
    if (selectedSpeechEngine === "azure-speech") {
      new Setting(containerEl).setName(ui.azureConsentName).setDesc(ui.azureConsentDesc).addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.azureSpeechConsent === true).onChange(async (value) => {
          this.plugin.settings.azureSpeechConsent = value;
          await this.plugin.saveSettings();
        });
      });
      new Setting(containerEl).setName(ui.azurePrivacyName).setDesc(ui.azurePrivacyDesc).addButton((button) => {
        button.setButtonText(ui.azurePrivacyButton).setTooltip(ui.azurePrivacyTooltip).onClick(() => {
          if (!openAzureTtsPrivacyDocs()) {
            new Notice(AZURE_TTS_PRIVACY_URL, 8e3);
          }
        });
      });
      new Setting(containerEl).setName(ui.azureCloudName).setDesc(ui.azureCloudDesc).addDropdown((dropdown) => {
        dropdown.addOption("public", ui.azurePublicCloud).addOption("china", ui.azureChinaCloud).setValue(normalizeAzureSpeechCloud(this.plugin.settings.azureSpeechCloud)).onChange(async (value) => {
          this.plugin.settings.azureSpeechCloud = normalizeAzureSpeechCloud(value);
          await this.plugin.saveSettings();
        });
      });
      new Setting(containerEl).setName(ui.azureRegionName).setDesc(ui.azureRegionDesc).addText((text) => {
        text.setPlaceholder("eastasia").setValue(this.plugin.settings.azureSpeechRegion || "").onChange(async (value) => {
          this.plugin.settings.azureSpeechRegion = normalizeAzureSpeechRegion(value);
          await this.plugin.saveSettings();
        });
      });
      const azureCredentialSource = normalizeCredentialSource(this.plugin.settings.azureSpeechCredentialSource);
      new Setting(containerEl).setName(ui.credentialSourceName).setDesc(ui.credentialSourceDesc).addDropdown((dropdown) => {
        dropdown.addOption("obsidian-secret", ui.credentialSourceSecret).addOption("key-file", ui.credentialSourceFile).setValue(azureCredentialSource).onChange(async (value) => {
          this.plugin.settings.azureSpeechCredentialSource = normalizeCredentialSource(value);
          await this.plugin.saveSettings();
          this.display();
        });
      });
      if (azureCredentialSource === "obsidian-secret") {
        if (hasObsidianSecretStorageUi(this.app)) {
          new Setting(containerEl).setName(ui.azureSecretName).setDesc(ui.azureSecretDesc).addComponent((element) => new SecretComponent(this.app, element).setValue(this.plugin.settings.azureSpeechSecretName || "").onChange(async (value) => {
            this.plugin.settings.azureSpeechSecretName = String(value || "").trim();
            await this.plugin.saveSettings();
          }));
        } else {
          new Setting(containerEl).setName(ui.secretStorageUnavailableName).setDesc(ui.secretStorageUnavailableDesc);
        }
      } else {
        new Setting(containerEl).setName(ui.azureKeyFileName).setDesc(ui.azureKeyFileDesc).addText((text) => {
          text.setPlaceholder("%LOCALAPPDATA%\\note-reader-cosyvoice\\azure-speech-key.txt").setValue(this.plugin.settings.azureSpeechKeyPath || "").onChange(async (value) => {
            this.plugin.settings.azureSpeechKeyPath = value.trim();
            await this.plugin.saveSettings();
          });
          text.inputEl.addClass("note-reader-cosyvoice-script-input");
        });
      }
      const currentAzureVoice = normalizeAzureSpeechVoice(this.plugin.settings.azureSpeechVoice);
      new Setting(containerEl).setName(ui.azureCommonVoicesName).setDesc(ui.azureCommonVoicesDesc).addDropdown((dropdown) => {
        for (const [voiceId, label] of microsoftVoicePresets) {
          dropdown.addOption(voiceId, label);
        }
        dropdown.addOption("__custom__", ui.customVoiceOption).setValue(commonVoiceIds.has(currentAzureVoice) ? currentAzureVoice : "__custom__").onChange(async (value) => {
          if (value === "__custom__") {
            return;
          }
          this.plugin.settings.azureSpeechVoice = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });
      new Setting(containerEl).setName(ui.azureVoiceName).setDesc(ui.azureVoiceDesc).addText((text) => {
        text.setPlaceholder(DEFAULT_AZURE_SPEECH_VOICE).setValue(currentAzureVoice).onChange(async (value) => {
          this.plugin.settings.azureSpeechVoice = normalizeAzureSpeechVoice(value);
          await this.plugin.saveSettings();
        });
      });
    }
    if (selectedSpeechEngine === "openrouter-tts") {
      new Setting(containerEl).setName(ui.openRouterConsentName).setDesc(ui.openRouterConsentDesc).addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.openRouterConsent === true).onChange(async (value) => {
          this.plugin.settings.openRouterConsent = value;
          await this.plugin.saveSettings();
        });
      });
      const openRouterCredentialSource = normalizeCredentialSource(this.plugin.settings.openRouterCredentialSource);
      new Setting(containerEl).setName(ui.credentialSourceName).setDesc(ui.credentialSourceDesc).addDropdown((dropdown) => {
        dropdown.addOption("obsidian-secret", ui.credentialSourceSecret).addOption("key-file", ui.credentialSourceFile).setValue(openRouterCredentialSource).onChange(async (value) => {
          this.plugin.settings.openRouterCredentialSource = normalizeCredentialSource(value);
          await this.plugin.saveSettings();
          this.display();
        });
      });
      if (openRouterCredentialSource === "obsidian-secret") {
        if (hasObsidianSecretStorageUi(this.app)) {
          new Setting(containerEl).setName(ui.openRouterSecretName).setDesc(ui.openRouterSecretDesc).addComponent((element) => new SecretComponent(this.app, element).setValue(this.plugin.settings.openRouterSecretName || "").onChange(async (value) => {
            this.plugin.settings.openRouterSecretName = String(value || "").trim();
            await this.plugin.saveSettings();
          }));
        } else {
          new Setting(containerEl).setName(ui.secretStorageUnavailableName).setDesc(ui.secretStorageUnavailableDesc);
        }
      } else {
        new Setting(containerEl).setName(ui.openRouterKeyFileName).setDesc(ui.openRouterKeyFileDesc).addText((text) => {
          text.setPlaceholder("%LOCALAPPDATA%\\note-reader-cosyvoice\\openrouter-api-key.txt").setValue(this.plugin.settings.openRouterKeyPath || "").onChange(async (value) => {
            this.plugin.settings.openRouterKeyPath = value.trim();
            await this.plugin.saveSettings();
          });
          text.inputEl.addClass("note-reader-cosyvoice-script-input");
        });
      }
      const currentOpenRouterModel = normalizeOpenRouterModel(this.plugin.settings.openRouterModel);
      const currentOpenRouterVoice = normalizeOpenRouterVoice(this.plugin.settings.openRouterVoice);
      const openRouterModels = getOpenRouterTtsModels(settingsLanguage);
      const selectedOpenRouterModel = openRouterModels.find(([model]) => model === currentOpenRouterModel);
      new Setting(containerEl).setName(ui.openRouterModelsName).setDesc(ui.openRouterModelsDesc).addDropdown((dropdown) => {
        for (const [model, , label] of openRouterModels) {
          dropdown.addOption(model, label);
        }
        dropdown.addOption("__custom__", ui.customModelOption).setValue(selectedOpenRouterModel ? currentOpenRouterModel : "__custom__").onChange(async (value) => {
          if (value === "__custom__") {
            return;
          }
          this.plugin.settings.openRouterModel = value;
          this.plugin.settings.openRouterVoice = getDefaultOpenRouterVoiceForModel(value);
          await this.plugin.saveSettings();
          this.display();
        });
      });
      new Setting(containerEl).setName(ui.openRouterModelName).setDesc(ui.openRouterModelDesc).addText((text) => {
        text.setPlaceholder(DEFAULT_OPENROUTER_TTS_MODEL).setValue(currentOpenRouterModel).onChange(async (value) => {
          this.plugin.settings.openRouterModel = normalizeOpenRouterModel(value);
          await this.plugin.saveSettings();
        });
        text.inputEl.addClass("note-reader-cosyvoice-script-input");
      });
      new Setting(containerEl).setName(ui.openRouterModelInfoName).setDesc(selectedOpenRouterModel ? selectedOpenRouterModel[3] : ui.customModelInfo);
      const openRouterVoicePresets = getOpenRouterTtsVoicePresets(currentOpenRouterModel, settingsLanguage);
      const openRouterVoiceIds = new Set(openRouterVoicePresets.map(([, voice]) => voice));
      new Setting(containerEl).setName(ui.openRouterVoicesName).setDesc(ui.openRouterVoicesDesc).addDropdown((dropdown) => {
        for (const [, voice, label] of openRouterVoicePresets) {
          dropdown.addOption(voice, label);
        }
        dropdown.addOption("__custom__", ui.customVoiceOption).setValue(openRouterVoiceIds.has(currentOpenRouterVoice) ? currentOpenRouterVoice : "__custom__").onChange(async (value) => {
          if (value === "__custom__") {
            return;
          }
          this.plugin.settings.openRouterVoice = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });
      new Setting(containerEl).setName(ui.openRouterVoiceName).setDesc(ui.openRouterVoiceDesc).addText((text) => {
        text.setPlaceholder(DEFAULT_OPENROUTER_TTS_VOICE).setValue(currentOpenRouterVoice).onChange(async (value) => {
          this.plugin.settings.openRouterVoice = normalizeOpenRouterVoice(value);
          await this.plugin.saveSettings();
        });
      });
      new Setting(containerEl).setName(ui.openRouterVoiceHelpName).setDesc(ui.openRouterVoiceHelpDesc).addButton((button) => {
        button.setButtonText(ui.openRouterModelPageButton).setTooltip(ui.openRouterVoiceHelpTooltip).onClick(() => {
          const url = getOpenRouterVoiceHelpLinks(this.plugin.settings.openRouterModel, settingsLanguage).modelPage;
          if (!openExternalUrl(url)) new Notice(url, 8e3);
        });
      }).addButton((button) => {
        button.setButtonText(ui.openRouterVoiceCatalogButton).setTooltip(ui.openRouterVoiceHelpTooltip).onClick(() => {
          const url = getOpenRouterVoiceHelpLinks(this.plugin.settings.openRouterModel, settingsLanguage).voiceCatalog;
          if (!openExternalUrl(url)) new Notice(url, 8e3);
        });
      });
      new Setting(containerEl).setName(ui.openRouterPrivacyName).setDesc(ui.openRouterPrivacyDesc);
    }
    new Setting(containerEl).setName(ui.speedName).setDesc(ui.speedDesc).addSlider((slider) => {
      slider.setLimits(0.5, 2, 0.05).setValue(this.plugin.settings.speed).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.speed = normalizeSpeed(value);
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(ui.chunkLimitsName).setDesc(ui.chunkLimitsDesc).addText((text) => {
      text.setValue(this.plugin.settings.chunkLimits).onChange(async (value) => {
        this.plugin.settings.chunkLimits = parseChunkLimits(value).join(",");
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(ui.onlineChunkLimitsName).setDesc(ui.onlineChunkLimitsDesc).addText((text) => {
      text.setValue(this.plugin.settings.onlineChunkLimits).onChange(async (value) => {
        this.plugin.settings.onlineChunkLimits = parseChunkLimits(
          value,
          DEFAULT_ONLINE_CHUNK_LIMITS
        ).join(",");
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(ui.onlinePrefetchName).setDesc(ui.onlinePrefetchDesc).addDropdown((dropdown) => {
      dropdown.addOption("0", ui.onlinePrefetchNone).addOption("1", ui.onlinePrefetchOne).setValue(String(normalizeOnlinePrefetchChunks(this.plugin.settings.onlinePrefetchChunks))).onChange(async (value) => {
        this.plugin.settings.onlinePrefetchChunks = normalizeOnlinePrefetchChunks(value);
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(ui.audioExportLocationName).setDesc(ui.audioExportLocationDesc).addDropdown((dropdown) => {
      dropdown.addOption("obsidian-attachment", ui.audioExportLocationAttachment).addOption("note-folder", ui.audioExportLocationNote).addOption("custom-folder", ui.audioExportLocationCustom).setValue(normalizeAudioExportLocation(this.plugin.settings.audioExportLocation)).onChange(async (value) => {
        this.plugin.settings.audioExportLocation = normalizeAudioExportLocation(value);
        await this.plugin.saveSettings();
        this.display();
      });
    });
    if (normalizeAudioExportLocation(this.plugin.settings.audioExportLocation) === "custom-folder") {
      new Setting(containerEl).setName(ui.audioExportFolderName).setDesc(ui.audioExportFolderDesc).addText((text) => {
        text.setPlaceholder(ui.audioExportFolderPlaceholder).setValue(this.plugin.settings.audioExportFolder).onChange(async (value) => {
          this.plugin.settings.audioExportFolder = normalizeAudioExportFolder(value);
          await this.plugin.saveSettings();
        });
      });
    }
    new Setting(containerEl).setName(ui.stripMarkdownName).setDesc(ui.stripMarkdownDesc).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.stripMarkdown).onChange(async (value) => {
        this.plugin.settings.stripMarkdown = value;
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(ui.mathLanguageName).setDesc(ui.mathLanguageDesc).addDropdown((dropdown) => {
      dropdown.addOption("english", ui.mathEnglish).addOption("chinese", ui.mathChinese).addOption("skip", ui.mathSkip).setValue(normalizeMathReadingLanguage(this.plugin.settings.mathReadingLanguage)).onChange(async (value) => {
        this.plugin.settings.mathReadingLanguage = normalizeMathReadingLanguage(value);
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(ui.rememberPositionName).setDesc(ui.rememberPositionDesc).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.rememberReadingPosition === true).onChange(async (value) => {
        this.plugin.settings.rememberReadingPosition = value;
        await this.plugin.saveSettings();
        this.plugin.renderReaderViews();
      });
    });
    new Setting(containerEl).setName(ui.clearPositionsName).setDesc(ui.clearPositionsDesc).addButton((button) => {
      button.setButtonText(ui.clearPositionsButton).setWarning().onClick(async () => {
        await this.plugin.clearReadingPositions();
        this.display();
      });
    });
    new Setting(containerEl).setName(ui.cleanupName).setDesc(ui.cleanupDesc).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.cleanupCache).onChange(async (value) => {
        this.plugin.settings.cleanupCache = value;
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(ui.diagnosticName).setDesc(ui.diagnosticDesc).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.diagnosticLogging === true).onChange(async (value) => {
        this.plugin.settings.diagnosticLogging = value;
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(ui.clearTemporaryName).setDesc(ui.clearTemporaryDesc).addButton((button) => {
      button.setButtonText(ui.clearNowButton).setWarning().onClick(async () => {
        await this.plugin.clearTemporaryData();
      });
    });
    new Setting(containerEl).setName(ui.restoreDefaultsName).setDesc(ui.restoreDefaultsDesc).addButton((button) => {
      button.setButtonText(ui.restoreDefaultsButton).setWarning().onClick(async () => {
        await this.plugin.resetSettingsToDefaults();
        new Notice(ui.settingsRestoredNotice);
        this.display();
      });
    });
    new Setting(containerEl).setName(ui.feedbackName).setDesc(ui.feedbackDesc).addButton((button) => {
      button.setButtonText(ui.feedbackButton).setTooltip(ui.feedbackTooltip).onClick(() => {
        if (!openGitHubIssues()) {
          new Notice(GITHUB_ISSUES_URL, 8e3);
        }
      });
    });
    containerEl.createEl("p", {
      cls: "note-reader-cosyvoice-muted",
      text: ui.commandsFooter
    });
  }
};
module.exports = {
  default: CosyVoiceReaderPlugin,
  __test: {
    AZURE_TTS_PRIVACY_URL,
    DEFAULT_ONLINE_CHUNK_LIMITS,
    GITHUB_ISSUES_URL,
    VIEW_TYPE,
    buildAzureSpeechEndpoint,
    buildAzureSpeechSsml,
    buildEdgeTtsArgs,
    buildOpenRouterTtsRequestBody,
    calculateCurrentChunkSeekTime,
    createAudioExportSummary,
    createBlobAudioSource,
    createDefaultSettings,
    createIncrementalSpeechChunker,
    createReadingAnchor,
    createReaderState,
    createRemoteHttpError,
    createRemoteRetryExhaustedError,
    createSafeRuntimeLogEvent,
    createTaskState,
    describeMediaError,
    extractPdfTextLayout,
    extractTextFromPdfItems,
    formatProgressLabel,
    formatSpeedLabel,
    getAzureSpeechConfigurationError,
    getAzureSpeechVoicePresets,
    getDefaultOpenRouterVoiceForModel,
    getEdgeTtsVoicePresets,
    getObsidianSecretConfigurationError,
    getOpenRouterConfigurationError,
    getOpenRouterTtsModels,
    getOpenRouterTtsPresets,
    getOpenRouterTtsVoicePresets,
    getOpenRouterVoiceHelpLinks,
    getChunkLimitsForSpeechEngine,
    getPdfPageNumberFromNode,
    getPdfSelectionContext,
    getPdfSelectionPosition,
    getPluginTempCacheDir,
    getSettingsUiText,
    getTextFromPositionToEnd,
    getAudioUrlForFile,
    getAudioExportExtension,
    getAudioExportScopeLabel,
    getAudioExportScopeUiText,
    getAudioExportUiText,
    getAvailableVaultAudioPath,
    getRemoteHttpErrorDetail,
    getSpeedPresets,
    getSynthesisPrefetchCount,
    hasAzureSpeechConsent,
    hasEdgeTtsConsent,
    hasObsidianSecretStorage,
    hasOpenRouterConsent,
    isRetryableRemoteError,
    isMarkdownFile,
    isPdfFile,
    isOwnedCacheFileName,
    isOnlineSpeechEngine,
    joinPdfPageText,
    normalizeAzureSpeechCloud,
    normalizeAzureSpeechRegion,
    normalizeAzureSpeechVoice,
    normalizeAudioExportFolder,
    normalizeAudioExportLocation,
    normalizeAudioExportScope,
    normalizeCredentialSource,
    normalizeEdgeTtsExecutable,
    normalizeEdgeTtsVoice,
    normalizeMathReadingLanguage,
    normalizeOpenRouterModel,
    normalizeOpenRouterVoice,
    normalizeOnlinePrefetchChunks,
    normalizePdfSelectionText,
    normalizeReadingPositions,
    normalizeSettingsLanguage,
    normalizeSpeechEngine,
    openAzureTtsPrivacyDocs,
    openGitHubIssues,
    parseRetryAfterMs,
    resolveDefaultScriptPath,
    resolvePowerShellExecutable,
    readObsidianSecretValue,
    sanitizeTextForSpeech,
    sanitizeLatexForSpeech,
    slicePdfTextFromSelection,
    sliceTextFromReadingPosition,
    selectKnownSettings,
    selectMarkdownAudioExportText,
    splitTextForSpeechChunks,
    transitionTaskState,
    upsertReadingPosition,
    toVaultRelativePath,
    verbalizeShortLatex
  }
};
function isInsideDirectory(filePath, directoryPath) {
  const relative = path.relative(path.resolve(directoryPath), path.resolve(filePath));
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}
function messageFromError(error) {
  if (!error) {
    return "unknown error";
  }
  if (error.message) {
    return String(error.message);
  }
  return String(error);
}
/*!
 * Bundled HTML parser notices
 * htmlparser2: Copyright 2010, 2011, Chris Winberry <chris@winberry.net>.
 * All rights reserved.
 * dom-serializer: Copyright (c) 2014 The cheeriojs contributors.
 * (The MIT License)
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * domhandler, domelementtype, domutils, entities (BSD-2-Clause):
 * Copyright (c) Felix Böhm. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation
 * and/or other materials provided with the distribution.
 * THIS IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
