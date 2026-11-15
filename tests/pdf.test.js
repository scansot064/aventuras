(async function () {
  "use strict";

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }
  function translate(key, values = {}) {
    return window.locales.es[key].replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
  }
  async function inspect(bytes) {
    const pdf = await PDFLib.PDFDocument.load(bytes);
    const pages = [];
    async function inflate(stream) {
      const inflated = new Blob([stream.getContents()]).stream().pipeThrough(new DecompressionStream("deflate"));
      return new Response(inflated).text();
    }
    for (const page of pdf.getPages()) {
      const fontResources = page.node.Resources().lookup(PDFLib.PDFName.of("Font"));
      const maps = new Map();
      const cache = new Map();
      for (const [name, ref] of fontResources.entries()) {
        const font = pdf.context.lookup(ref);
        const base = font.get(PDFLib.PDFName.of("BaseFont")).toString();
        if (!cache.has(base)) {
          const cmap = await inflate(font.lookup(PDFLib.PDFName.of("ToUnicode")));
          const map = new Map();
          for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
            for (const match of block[1].matchAll(/<([0-9A-F]{4})> <([0-9A-F]+)>/g)) {
              const unicode = match[2].match(/.{4}/g).map(code => String.fromCharCode(parseInt(code, 16))).join("");
              map.set(match[1], unicode);
            }
          }
          cache.set(base, map);
        }
        maps.set(name.toString(), cache.get(base));
      }
      const contents = pdf.context.lookup(page.node.Contents());
      const streams = contents instanceof PDFLib.PDFArray
        ? contents.asArray().map(ref => pdf.context.lookup(ref)) : [contents];
      let raw = "";
      for (const stream of streams) raw += await inflate(stream);
      let font;
      const text = [];
      let actualText = false;
      for (const match of raw.matchAll(/\/Span\s*<<\s*\/ActualText <([0-9A-F]+)>\s*>> BDC|\bEMC\b|(\/\S+)\s+[\d.]+\s+Tf|<([0-9A-F]+)> Tj/g)) {
        if (match[1]) {
          text.push(match[1].slice(4).match(/.{4}/g).map(code => String.fromCharCode(parseInt(code, 16))).join(""));
          actualText = true;
        } else if (match[0] === "EMC") {
          actualText = false;
        } else if (match[2]) font = maps.get(match[2]);
        else if (!actualText) text.push(match[3].match(/.{4}/g).map(code => {
          assert(font.has(code), `Missing Unicode mapping for ${code}`);
          return font.get(code);
        }).join(""));
      }
      const objects = page.node.Resources().lookup(PDFLib.PDFName.of("XObject"));
      let colorImages = 0;
      if (objects) {
        const refs = new Set();
        for (const [, ref] of objects.entries()) {
          if (refs.has(ref.toString())) continue;
          refs.add(ref.toString());
          const image = pdf.context.lookup(ref);
          const pixels = new Uint8Array(await new Response(
            new Blob([image.getContents()]).stream().pipeThrough(new DecompressionStream("deflate"))
          ).arrayBuffer());
          for (let i = 0; i + 2 < pixels.length; i += 3) {
            if (pixels[i] !== pixels[i + 1] || pixels[i + 1] !== pixels[i + 2]) {
              colorImages++;
              break;
            }
          }
        }
      }
      pages.push({ text, raw, colorImages, size: page.getSize() });
    }
    return pages;
  }

  try {
    const legacy = Story.createStory();
    delete legacy.transitionText;
    assert(Story.validateStory(legacy).transitionText === null, "Old stories must use the localized default");
    const invalid = Story.createStory();
    invalid.transitionText = 42;
    let invalidRejected = false;
    try {
      Story.validateStory(invalid);
    } catch (error) {
      invalidRejected = error.message === "invalidFile";
    }
    assert(invalidRejected, "Invalid transition text must be rejected");

    const story = Story.createStory();
    story.title = "La aventura 😀";
    story.author = "Señora Álvarez Καλημέρα";
    const longWord = "a".repeat(300);
    story.sections[0].content = `<b>INICIO 😀</b> ${longWord} ${"palabra ".repeat(3000)}`;
    story.sections[0].choices = [{ text: "Abrir puerta 🚀", target: 2 }, { text: "Volver", target: 3 }];
    const ending = Story.createSection(2);
    ending.content = "<i>DESTINO FINAL Привет</i>";
    ending.ending = true;
    const loop = Story.createSection(3);
    loop.content = "DESTINO BUCLE";
    loop.loop = true;
    loop.loopTarget = 1;
    story.sections.push(ending, loop);
    story.nextId = 4;

    const originalRandom = Math.random;
    try {
      Math.random = () => 0;
      const pages = await inspect(await PDFExport.create(story, translate));
      assert(pages.length > 4, "Long sections must continue onto additional pages");
      for (const [index, page] of pages.entries()) {
        assert(Math.abs(page.size.width - 148 * 72 / 25.4) < 0.01 &&
          Math.abs(page.size.height - 210 * 72 / 25.4) < 0.01, "Every page must be A5");
        if (index > 0) assert(!/1 0 0 1 [\d.]+ 22 Tm/.test(page.raw), "Story pages must not have a bottom page number");
      }
      const text = page => page.text.join("");
      assert(text(pages[0]).includes(story.title) && text(pages[0]).includes(story.author), "Unicode cover text");
      assert(text(pages[1]).includes("INICIO 😀"), "Unicode starting text must appear on page 1");
      assert(pages[1].raw.includes("NotoSans-Bold") && pages[1].raw.includes("NotoEmoji"), "Bold and emoji fonts must be embedded");
      assert(pages[0].colorImages > 0 && pages[1].colorImages > 0 && text(pages[0]).includes("Twemoji"),
        "Color emoji and artwork attribution must be included");
      const loopPage = pages.findIndex(page => text(page).includes("DESTINO BUCLE"));
      const endingPage = pages.findIndex(page => text(page).includes("DESTINO FINAL"));
      assert(loopPage > 9 && endingPage === loopPage + 1, "Sections start on separate pages after the long start");
      assert(pages[1].text[0] === "1" && pages[loopPage].text[0] === String(loopPage) &&
        pages[endingPage].text[0] === String(endingPage), "Section headings must show their physical page numbers");
      assert(text(pages[endingPage]).includes("Привет") && text(pages[endingPage]).includes("FIN") &&
        pages[endingPage].raw.includes("NotoSans-Italic"), "Unicode ending and italic formatting");
      const all = pages.map(text).join("");
      assert(all.includes(longWord) && (all.match(/palabra/g) || []).length === 3000,
        "Long words and continuation pages must not lose text");
      assert(all.includes(`Ve a la página ${endingPage}`) && all.includes(`Ve a la página ${loopPage}`), "Choices must point to physical pages");
      assert(all.includes("Abrir puerta 🚀"), "Unicode choice text must be retained");
      assert(text(pages[loopPage]).includes("Ve a la página 1"), "Loop must point to the starting page");

      Math.random = () => 0.999;
      const reversed = await inspect(await PDFExport.create(story, translate));
      assert(reversed.findIndex(page => text(page).includes("DESTINO FINAL")) <
        reversed.findIndex(page => text(page).includes("DESTINO BUCLE")), "Section ordering must be randomized");
      story.sections[0].content = `${"👩‍🚀".repeat(35)} e\u0301 🇪🇸 👋🏻 next`;
      const unicodePages = await inspect(await PDFExport.create(story, translate));
      const unicodeText = unicodePages.map(text).join("");
      assert(unicodeText.includes("👩‍🚀".repeat(35)) && unicodeText.includes("e\u0301 🇪🇸 👋🏻 next"),
        "Grapheme clusters must survive line wrapping and Unicode extraction");
      const emojiPage = unicodePages.find(page => text(page).includes("👩‍🚀"));
      assert(emojiPage.colorImages > 0, "Complex emoji must use color artwork");
      story.title = "Sin emoji";
      story.sections[0].content = "Texto normal";
      story.sections[0].choices[0].text = "Abrir puerta";
      const plainPages = await inspect(await PDFExport.create(story, translate));
      assert(!text(plainPages[0]).includes("Twemoji"), "Stories without artwork should not receive emoji attribution");
      story.transitionText = "Sigue hasta 👉 página";
      const customPages = await inspect(await PDFExport.create(story, translate));
      const customText = customPages.map(text).join("");
      const customEndingPage = customPages.findIndex(page => text(page).includes("DESTINO FINAL"));
      const customLoopPage = customPages.findIndex(page => text(page).includes("DESTINO BUCLE"));
      assert(customText.includes(`Sigue hasta 👉 página ${customEndingPage}`) &&
        customText.includes(`Sigue hasta 👉 página ${customLoopPage}`) &&
        text(customPages[customLoopPage]).includes("Sigue hasta 👉 página 1"),
        "Custom transition text must precede every choice and loop destination");
      story.transitionText = `${"Continúa ".repeat(70)}DESTINO`;
      story.sections[0].content = "tramo ".repeat(1400);
      const longPages = await inspect(await PDFExport.create(story, translate));
      const longText = longPages.map(text).join("");
      const longEndingPage = longPages.findIndex(page => text(page).includes("DESTINO FINAL"));
      const longLoopPage = longPages.findIndex(page => text(page).includes("DESTINO BUCLE"));
      assert(Math.max(longEndingPage, longLoopPage) >= 10 && longText.includes(`DESTINO ${longEndingPage}`) &&
        longText.includes(`DESTINO ${longLoopPage}`), "Long transitions must wrap without changing physical page references");
      story.transitionText = "";
      story.sections[0].content = "Texto normal";
      const emptyPages = await inspect(await PDFExport.create(story, translate));
      assert(!emptyPages.map(text).join("").includes("Ve a la página"), "An empty transition must not restore the default");
      story.sections[0].content = "Unsupported character 中文";
      let rejected = false;
      try {
        await PDFExport.create(story, translate);
      } catch (error) {
        rejected = error.message.includes("no admiten");
      }
      assert(rejected, "Unsupported characters must produce an error");
    } finally {
      Math.random = originalRandom;
    }
    document.getElementById("result").textContent = "PASS";
  } catch (error) {
    document.getElementById("result").textContent = `FAIL: ${error.message}`;
    throw error;
  }
})();
