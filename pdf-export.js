(function (root) {
  "use strict";

  const PAGE_WIDTH = 148 * 72 / 25.4;
  const PAGE_HEIGHT = 210 * 72 / 25.4;
  const MARGIN = 48;
  const TEXT_WIDTH = PAGE_WIDTH - MARGIN * 2;
  const TEXT_HEIGHT = PAGE_HEIGHT - MARGIN * 2;
  const NORMAL = { size: 12, bold: false, italic: false };

  function contentSpans(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    const spans = [];
    function add(text, style) {
      if (text) spans.push({ text, ...style });
    }
    function endsWithNewline() {
      return spans.length && spans[spans.length - 1].text.endsWith("\n");
    }
    function visit(node, style) {
      if (node.nodeType === Node.TEXT_NODE) {
        add(node.textContent.replace(/\r\n?/g, "\n"), style);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName;
      if (tag === "BR") {
        add("\n", style);
        return;
      }
      const block = tag === "DIV" || tag === "P";
      if (block && spans.length && !endsWithNewline()) add("\n", style);
      const next = { ...style };
      if (tag === "B" || tag === "STRONG") next.bold = true;
      if (tag === "I" || tag === "EM") next.italic = true;
      if (tag === "FONT") {
        const sizes = { 2: 10, 3: 12, 5: 18 };
        next.size = sizes[node.getAttribute("size")] || style.size;
      }
      for (const child of node.childNodes) visit(child, next);
      if (block && !endsWithNewline()) add("\n", style);
    }
    for (const child of template.content.childNodes) visit(child, NORMAL);
    return spans;
  }

  function fontFor(fonts, style) {
    if (style.bold && style.italic) return fonts.boldItalic;
    if (style.bold) return fonts.bold;
    if (style.italic) return fonts.italic;
    return fonts.normal;
  }

  function emojiKey(text) {
    if (!/[\p{Emoji_Presentation}\uFE0F\u20E3]/u.test(text)) return null;
    const codes = [...text].map(character => character.codePointAt(0).toString(16));
    const exact = codes.join("-");
    const withoutVariation = codes.filter(code => code !== "fe0f").join("-");
    if (Object.hasOwn(root.AdventureEmoji, exact)) return exact;
    return Object.hasOwn(root.AdventureEmoji, withoutVariation) ? withoutVariation : null;
  }

  function fontSpans(spans, fonts, t) {
    const output = [];
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const ignored = new Set([0x200d, 0xfe0e, 0xfe0f]);
    function supports(font, text) {
      const characters = [...text];
      if (!characters.every(character => {
        const code = character.codePointAt(0);
        return ignored.has(code) || font.characters.has(code);
      })) return false;
      if (characters.length === 1) return font.characters.has(characters[0].codePointAt(0));
      if (!font.shaper) font.shaper = root.fontkit.create(font.bytes);
      const glyphs = font.shaper.layout(text).glyphs;
      return glyphs.every(glyph => glyph.id !== 0) &&
        glyphs.flatMap(glyph => glyph.codePoints).join(",") ===
          characters.map(character => character.codePointAt(0)).join(",");
    }
    for (const span of spans) {
      const preferred = fontFor(fonts, span);
      for (const { segment } of segmenter.segment(span.text.replace(/\t/g, "    "))) {
        const emoji = emojiKey(segment);
        if (emoji) {
          const canExtract = supports(fonts.emoji, segment);
          const invisible = canExtract
            ? [{ text: segment, font: fonts.emoji.font }]
            : [...segment].filter(character => !ignored.has(character.codePointAt(0)))
              .map(character => {
                const font = supports(fonts.emoji, character) ? fonts.emoji :
                  supports(fonts.normal, character) ? fonts.normal : null;
                return font ? { text: character, font: font.font } : null;
              }).filter(Boolean);
          output.push({
            text: segment, size: span.size, emoji,
            invisible: invisible.length ? invisible : [{ text: " ", font: fonts.normal.font }],
            font: fonts.emoji
          });
          continue;
        }
        const font = segment === "\n" || supports(preferred, segment) ? preferred :
          supports(fonts.emoji, segment) ? fonts.emoji : null;
        if (!font) throw new Error(t("unsupportedCharacters", { characters: segment }));
        const previous = output[output.length - 1];
        if (previous && !previous.emoji && previous.font === font && previous.size === span.size) {
          previous.text += segment;
        } else {
          output.push({ text: segment, size: span.size, font });
        }
      }
    }
    return output;
  }

  function wrap(spans, fonts, t) {
    const lines = [];
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    let runs = [];
    let width = 0;
    let size = NORMAL.size;
    let endedWithNewline = false;
    function finish() {
      lines.push({ runs, height: size * 1.4 });
      runs = [];
      width = 0;
      size = NORMAL.size;
    }
    function addedWidth(text, style, font) {
      const last = runs[runs.length - 1];
      if (last && !last.emoji && last.font === font && last.size === style.size) {
        return font.widthOfTextAtSize(last.text + text, style.size) - last.width;
      }
      return font.widthOfTextAtSize(text, style.size);
    }
    function append(text, style, font) {
      const runWidth = addedWidth(text, style, font);
      const last = runs[runs.length - 1];
      if (last && !last.emoji && last.font === font && last.size === style.size) {
        last.text += text;
        last.width += runWidth;
      } else {
        runs.push({ text, font, size: style.size, width: runWidth });
      }
      width += runWidth;
      size = Math.max(size, style.size);
    }
    for (const span of fontSpans(spans, fonts, t)) {
      if (span.emoji) {
        const emojiWidth = span.size * 1.1;
        if (width && width + emojiWidth > TEXT_WIDTH) finish();
        runs.push({ ...span, font: span.font.font, width: emojiWidth });
        width += emojiWidth;
        size = Math.max(size, span.size);
        endedWithNewline = false;
        continue;
      }
      const font = span.font.font;
      const tokens = span.text.match(/\n|[^\S\n]+|[^\s]+/gu) || [];
      for (const token of tokens) {
        if (token === "\n") {
          finish();
          endedWithNewline = true;
          continue;
        }
        endedWithNewline = false;
        const isSpace = /^\s+$/u.test(token);
        const tokenWidth = font.widthOfTextAtSize(token, span.size);
        if (width && width + addedWidth(token, span, font) > TEXT_WIDTH) finish();
        if (!width && isSpace) continue;
        if (tokenWidth <= TEXT_WIDTH) {
          append(token, span, font);
          continue;
        }
        // Split a word that is wider than a full line without dropping characters.
        let part = "";
        for (const { segment: character } of segmenter.segment(token)) {
          const next = part + character;
          if (font.widthOfTextAtSize(next, span.size) > TEXT_WIDTH - width) {
            if (part) append(part, span, font);
            if (!part && !width) throw new Error("A character is wider than the page.");
            finish();
            part = character;
          } else {
            part = next;
          }
        }
        if (part) append(part, span, font);
      }
    }
    if (runs.length || (spans.length && !endedWithNewline)) finish();
    return lines;
  }

  function textSpan(text, style = NORMAL) {
    return [{ text: text.replace(/\r\n?/g, "\n"), ...style }];
  }

  async function drawLine(page, line, y, emojiImages, centered = false, pageNumbers = null) {
    const lineWidth = line.runs.reduce((sum, run) => sum + run.width, 0);
    let x = centered ? (PAGE_WIDTH - lineWidth) / 2 : MARGIN;
    for (const run of line.runs) {
      const baseline = PAGE_HEIGHT - MARGIN - y - line.height * 0.8;
      if (run.target !== undefined) {
        page.drawText(String(pageNumbers.get(run.target)), { x, y: baseline, font: run.font, size: run.size });
      } else if (run.emoji) {
        const image = await emojiImages.get(run.emoji);
        const { PDFOperator, PDFOperatorNames, PDFName, PDFHexString } = root.PDFLib;
        const properties = page.doc.context.obj({ ActualText: PDFHexString.fromText(run.text) });
        page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of("Span"), properties]));
        page.drawImage(image, { x, y: baseline - run.size * 0.1, width: run.width, height: run.width });
        page.pushOperators(root.PDFLib.pushGraphicsState(), root.PDFLib.setTextRenderingMode(root.PDFLib.TextRenderingMode.Invisible));
        const totalWidth = run.invisible.reduce((sum, part) => sum + part.font.widthOfTextAtSize(part.text, 1), 0);
        const invisibleSize = totalWidth ? Math.min(run.size, run.width / totalWidth) : run.size;
        let invisibleX = x;
        for (const part of run.invisible) {
          page.drawText(part.text, {
            x: invisibleX, y: baseline, font: part.font, size: invisibleSize
          });
          invisibleX += part.font.widthOfTextAtSize(part.text, invisibleSize);
        }
        page.pushOperators(root.PDFLib.popGraphicsState(), root.PDFLib.endMarkedContent());
      } else {
        page.drawText(run.text, { x, y: baseline, font: run.font, size: run.size });
      }
      x += run.width;
    }
  }

  function emojiImageCache(pdf) {
    const images = new Map();
    return {
      get(key) {
        if (!images.has(key)) {
          images.set(key, (async () => {
            const image = new Image();
            image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(root.AdventureEmoji[key])}`;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 96;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Cannot render emoji artwork.");
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            return pdf.embedPng(canvas.toDataURL("image/png"));
          })());
        }
        return images.get(key);
      },
      get size() { return images.size; }
    };
  }

  async function create(story, t) {
    const { PDFDocument } = root.PDFLib;
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(root.fontkit);
    const emojiImages = emojiImageCache(pdf);
    const fonts = {};
    for (const [name, data] of Object.entries(root.AdventureFonts)) {
      const bytes = Uint8Array.from(atob(data), character => character.charCodeAt(0));
      const font = await pdf.embedFont(bytes, { subset: true });
      fonts[name] = { font, bytes, characters: new Set(font.getCharacterSet()) };
    }
    pdf.setTitle(story.title.trim() || t("untitled"));
    if (story.author.trim()) pdf.setAuthor(story.author);

    const cover = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const titleLines = wrap(textSpan(story.title.trim() || t("untitled"), { ...NORMAL, size: 24, bold: true }), fonts, t);
    const authorLines = story.author.trim()
      ? wrap(textSpan(`${t("by")} ${story.author}`, { ...NORMAL, size: 14 }), fonts, t) : [];
    const coverHeight = [...titleLines, ...authorLines].reduce((sum, line) => sum + line.height, 0) +
      (authorLines.length ? 18 : 0);
    if (coverHeight > TEXT_HEIGHT) throw new Error(t("coverTooLong"));
    let coverY = (TEXT_HEIGHT - coverHeight) / 2;
    for (const line of titleLines) {
      await drawLine(cover, line, coverY, emojiImages, true);
      coverY += line.height;
    }
    if (authorLines.length) coverY += 18;
    for (const line of authorLines) {
      await drawLine(cover, line, coverY, emojiImages, true);
      coverY += line.height;
    }

    const order = Story.randomNumbers(story);
    const sections = [...story.sections].sort((a, b) => order.get(a.id) - order.get(b.id));
    const pageNumbers = new Map();
    const pages = [];
    const transition = (story.transitionText ?? t("defaultTransition")).trim();
    const numberFont = fonts.normal.font;
    const widestDigit = [..."0123456789"].reduce((widest, digit) =>
      numberFont.widthOfTextAtSize(digit, NORMAL.size) > numberFont.widthOfTextAtSize(widest, NORMAL.size) ? digit : widest);
    // A JavaScript array cannot hold more than 2^32 - 1 pages.
    const placeholder = widestDigit.repeat(10);
    let page;
    let y;
    function newPage() {
      page = { lines: [], number: pages.length + 1 };
      pages.push(page);
      y = 0;
    }
    function addLine(line) {
      if (y + line.height > TEXT_HEIGHT) newPage();
      page.lines.push({ ...line, y });
      y += line.height;
    }
    function addText(spans, gap = 0) {
      for (const line of wrap(spans, fonts, t)) addLine(line);
      y += gap;
    }
    function addReference(target) {
      const lines = wrap(textSpan(`${transition ? `${transition} ` : ""}${placeholder}`), fonts, t);
      const lastLine = lines[lines.length - 1];
      const lastRun = lastLine.runs[lastLine.runs.length - 1];
      if (!lastRun || !lastRun.text.endsWith(placeholder)) throw new Error(t("referenceTooLong"));
      lastRun.text = lastRun.text.slice(0, -placeholder.length);
      lastRun.width = numberFont.widthOfTextAtSize(lastRun.text, NORMAL.size);
      if (!lastRun.text) lastLine.runs.pop();
      lastLine.runs.push({
        target, font: numberFont, size: NORMAL.size,
        width: numberFont.widthOfTextAtSize(placeholder, NORMAL.size)
      });
      for (const line of lines) addLine(line);
      y += 8;
    }
    for (const section of sections) {
      newPage();
      pageNumbers.set(section.id, page.number);
      addLine({ runs: [], height: 24, heading: section.id });
      y += 10;
      addText(contentSpans(section.content), 10);
      if (section.ending) {
        addText(textSpan(t("end"), { ...NORMAL, bold: true }));
      } else {
        for (const choice of section.choices) {
          addText(textSpan(choice.text), 3);
          addReference(choice.target);
        }
        if (section.loop) addReference(section.loopTarget);
      }
    }

    for (const entry of pages) {
      const output = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      for (const line of entry.lines) {
        if (line.heading !== undefined) {
          const text = String(pageNumbers.get(line.heading));
          const style = { ...NORMAL, size: 17, bold: true };
          const wrapped = wrap(textSpan(text, style), fonts, t);
          if (wrapped.length !== 1) throw new Error(t("referenceTooLong"));
          await drawLine(output, { ...wrapped[0], height: line.height }, line.y, emojiImages);
        } else {
          await drawLine(output, line, line.y, emojiImages, false, pageNumbers);
        }
      }
    }
    if (emojiImages.size) {
      const credit = [
        t("emojiCredit"),
        "https://github.com/jdecked/twemoji | https://creativecommons.org/licenses/by/4.0/",
        t("emojiChanges")
      ];
      credit.forEach((text, index) => {
        cover.drawText(text, { x: MARGIN, y: 29 - index * 8, font: fonts.normal.font, size: 6 });
      });
    }
    return pdf.save();
  }

  root.PDFExport = { create };
})(window);
