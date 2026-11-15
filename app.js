(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  let story = Story.createStory();
  let selectedId = 1;
  let language = "en";
  let selection = null;
  const expanded = new Set(["start"]);

  function t(key, values = {}, locale = language) {
    return window.locales[locale][key].replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
  }

  function currentSection() {
    return story.sections.find(section => section.id === selectedId);
  }

  function sectionLabel(section) {
    return `${section.id}. ${section.name.trim() || t("unnamed")}`;
  }

  function renderEditorHeading() {
    const section = currentSection();
    $("editor-heading").textContent = `${sectionLabel(section)}${section.id === story.sections[0].id ? ` (${t("start")})` : ""}`;
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  // Only formatting produced by the editor is allowed in imported or printed text.
  function cleanContent(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    const output = document.createElement("div");
    const allowed = new Set(["P", "DIV", "BR", "B", "STRONG", "I", "EM", "FONT"]);
    function copy(source, parent) {
      for (const child of source.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          parent.appendChild(document.createTextNode(child.textContent));
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "SVG", "MATH"].includes(child.tagName)) continue;
          if (!allowed.has(child.tagName)) {
            copy(child, parent);
            continue;
          }
          const clean = document.createElement(child.tagName.toLowerCase());
          if (child.tagName === "FONT" && ["2", "3", "5"].includes(child.getAttribute("size"))) {
            clean.setAttribute("size", child.getAttribute("size"));
          }
          copy(child, clean);
          parent.appendChild(clean);
        }
      }
    }
    copy(template.content, output);
    return output.innerHTML;
  }

  function translate() {
    selection = null;
    document.documentElement.lang = language;
    document.title = t("appTitle");
    document.querySelectorAll("[data-i18n]").forEach(node => {
      node.textContent = t(node.dataset.i18n);
    });
    document.querySelector(".toolbar").setAttribute("aria-label", t("formatting"));
    $("loop-target").setAttribute("aria-label", t("loopDestination"));
    $("transition-text").value = story.transitionText === null ? t("defaultTransition") : story.transitionText;
    renderEditor();
    renderMap();
  }

  function destinationSelect(value, onChange, createName = null) {
    const select = document.createElement("select");
    const empty = element("option", t("selectDestination"));
    empty.value = "";
    select.appendChild(empty);
    for (const section of story.sections) {
      const option = element("option", sectionLabel(section));
      option.value = String(section.id);
      select.appendChild(option);
    }
    if (createName) {
      const create = element("option", t("createDestination"));
      create.value = "create";
      select.appendChild(create);
    }
    select.value = value === null ? "" : String(value);
    select.addEventListener("change", () => {
      if (select.value === "create") {
        const section = Story.createSection(story.nextId++);
        section.name = createName();
        story.sections.push(section);
        onChange(section.id);
        updateDestinations();
      } else {
        onChange(select.value ? Number(select.value) : null);
      }
    });
    return select;
  }

  function renderChoices() {
    const container = $("choices");
    container.replaceChildren();
    const section = currentSection();
    if (!section.choices.length) container.appendChild(element("p", t("noChoices"), "hint"));
    section.choices.forEach((choice, index) => {
      const row = element("div", undefined, "choice");
      const textLabel = element("label");
      textLabel.appendChild(element("span", t("choiceText")));
      const input = document.createElement("input");
      input.type = "text";
      input.value = choice.text;
      input.addEventListener("input", () => {
        choice.text = input.value;
        renderMap();
      });
      textLabel.appendChild(input);
      const targetLabel = element("label");
      targetLabel.appendChild(element("span", t("destination")));
      targetLabel.appendChild(destinationSelect(choice.target, value => {
        choice.target = value;
        renderMap();
      }, () => choice.text.trim()));
      const targetGroup = element("div", undefined, "choice-destination");
      targetGroup.append(
        element("span", (story.transitionText ?? t("defaultTransition")).trim(), "choice-transition"),
        targetLabel
      );
      const remove = element("button", t("removeChoice"));
      remove.type = "button";
      remove.addEventListener("click", () => {
        section.choices.splice(index, 1);
        renderChoices();
        renderMap();
      });
      row.append(textLabel, targetGroup, remove);
      container.appendChild(row);
    });
  }

  function renderEditor() {
    const section = currentSection();
    renderEditorHeading();
    $("delete-section").disabled = section.id === story.sections[0].id;
    $("section-name").value = section.name;
    $("content").innerHTML = cleanContent(section.content);
    $("ending").checked = section.ending;
    $("branch-controls").hidden = section.ending;
    $("loop-enabled").checked = section.loop;
    const oldTarget = $("loop-target");
    const target = destinationSelect(section.loopTarget, value => {
      section.loopTarget = value;
      renderMap();
    });
    target.id = "loop-target";
    target.setAttribute("aria-label", t("loopDestination"));
    target.disabled = !section.loop;
    oldTarget.replaceWith(target);
    renderChoices();
  }

  function links(section) {
    if (section.ending) return [];
    const result = section.choices.filter(choice => choice.target !== null)
      .map(choice => ({ target: choice.target, label: choice.text.trim() || t("choiceText"), choiceText: choice.text.trim() }));
    if (section.loop && section.loopTarget !== null) result.push({ target: section.loopTarget, label: t("loop") });
    return result;
  }

  function reachableSections() {
    const reached = new Set();
    const pending = [story.sections[0].id];
    while (pending.length) {
      const id = pending.pop();
      if (reached.has(id)) continue;
      reached.add(id);
      const section = story.sections.find(item => item.id === id);
      for (const link of links(section)) pending.push(link.target);
    }
    return reached;
  }

  function renderMap() {
    const container = $("map");
    container.replaceChildren();
    function renderNode(id, path, ancestors, edge) {
      const section = story.sections.find(item => item.id === id);
      const wrapper = element("div", undefined, "map-item");
      const cycle = ancestors.has(id);
      const children = cycle ? [] : links(section);
      const edgeLabel = edge && edge.choiceText && edge.choiceText === section.name.trim() ? "" : edge?.label;
      const button = element("button", `${edgeLabel ? `${edgeLabel} → ` : ""}${sectionLabel(section)}`, "map-link");
      button.type = "button";
      if (id === selectedId) button.setAttribute("aria-current", "true");
      button.addEventListener("click", event => {
        event.stopPropagation();
        selectedId = id;
        selection = null;
        renderEditor();
        renderMap();
      });
      if (children.length) {
        const details = document.createElement("details");
        details.open = expanded.has(path);
        const summary = document.createElement("summary");
        summary.appendChild(button);
        details.appendChild(summary);
        if (details.open) {
          const branch = element("div", undefined, "map-children");
          const nextAncestors = new Set(ancestors);
          nextAncestors.add(id);
          children.forEach((child, index) => {
            branch.appendChild(renderNode(child.target, `${path}/${index}:${child.target}`, nextAncestors, child));
          });
          details.appendChild(branch);
        }
        details.addEventListener("toggle", () => {
          if (!details.isConnected) return;
          if (details.open === expanded.has(path)) return;
          if (details.open) expanded.add(path);
          else expanded.delete(path);
          renderMap();
        });
        wrapper.appendChild(details);
      } else {
        wrapper.appendChild(button);
        if (cycle) wrapper.appendChild(element("span", ` (${t("repeated")})`, "map-note"));
      }
      return wrapper;
    }
    container.appendChild(renderNode(story.sections[0].id, "start", new Set(), null));
    const reached = reachableSections();
    const others = story.sections.filter(section => !reached.has(section.id));
    if (others.length) {
      container.appendChild(element("h3", t("unconnected")));
      for (const section of others) {
        container.appendChild(renderNode(section.id, `other:${section.id}`, new Set(), null));
      }
    }
  }

  function updateDestinations() {
    selection = null;
    renderEditor();
    renderMap();
  }

  function save() {
    const blob = new Blob([JSON.stringify(story, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "adventure.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("status").textContent = t("saved");
  }

  async function load(file) {
    try {
      const loaded = Story.validateStory(JSON.parse(await file.text()));
      for (const section of loaded.sections) section.content = cleanContent(section.content);
      story = loaded;
      selectedId = story.sections[0].id;
      selection = null;
      expanded.clear();
      expanded.add("start");
      $("story-title").value = story.title;
      $("story-author").value = story.author;
      $("transition-text").value = story.transitionText === null ? t("defaultTransition") : story.transitionText;
      updateDestinations();
      $("status").textContent = t("loaded");
    } catch (error) {
      const message = error.message === "invalidFile" ? t("invalidFile") : error.message;
      $("status").textContent = t("loadError", { message });
    }
  }

  async function printStory() {
    const problem = Story.printProblem(story);
    if (problem) {
      $("status").textContent = t(problem);
      return;
    }
    $("print").disabled = true;
    try {
      const snapshot = structuredClone(story);
      const locale = language;
      const bytes = await PDFExport.create(snapshot, (key, values) => t(key, values, locale));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "adventure.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      $("status").textContent = t("pdfSaved");
    } catch (error) {
      $("status").textContent = t("pdfError", { message: error.message });
    } finally {
      $("print").disabled = false;
    }
  }

  $("language").addEventListener("change", event => {
    language = event.target.value;
    translate();
  });
  $("story-title").addEventListener("input", event => { story.title = event.target.value; });
  $("story-author").addEventListener("input", event => { story.author = event.target.value; });
  $("transition-text").addEventListener("input", event => {
    story.transitionText = event.target.value;
    document.querySelectorAll(".choice-transition").forEach(node => {
      node.textContent = story.transitionText.trim();
    });
  });
  $("section-name").addEventListener("input", event => {
    currentSection().name = event.target.value;
    renderEditorHeading();
    renderMap();
    // Refresh destination labels without replacing the input being edited.
    const labels = new Map(story.sections.map(section => [String(section.id), sectionLabel(section)]));
    document.querySelectorAll("#branch-controls select option").forEach(option => {
      if (labels.has(option.value)) option.textContent = labels.get(option.value);
    });
  });
  $("content").addEventListener("input", event => { currentSection().content = cleanContent(event.target.innerHTML); });
  $("content").addEventListener("paste", event => {
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
  });
  document.addEventListener("selectionchange", () => {
    const current = window.getSelection();
    if (current.rangeCount && $("content").contains(current.anchorNode)) selection = current.getRangeAt(0).cloneRange();
  });
  function format(command, value = null) {
    $("content").focus();
    if (selection) {
      const current = window.getSelection();
      current.removeAllRanges();
      current.addRange(selection);
    }
    document.execCommand(command, false, value);
    currentSection().content = cleanContent($("content").innerHTML);
  }
  document.querySelectorAll("[data-command]").forEach(button => {
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", () => format(button.dataset.command));
  });
  $("font-size").addEventListener("change", event => format("fontSize", event.target.value));
  $("ending").addEventListener("change", event => {
    currentSection().ending = event.target.checked;
    $("branch-controls").hidden = event.target.checked;
    renderMap();
  });
  $("loop-enabled").addEventListener("change", event => {
    currentSection().loop = event.target.checked;
    $("loop-target").disabled = !event.target.checked;
    renderMap();
  });
  $("add-choice").addEventListener("click", () => {
    currentSection().choices.push({ text: "", target: null });
    renderChoices();
  });
  $("add-section").addEventListener("click", () => {
    const section = Story.createSection(story.nextId++);
    story.sections.push(section);
    selectedId = section.id;
    selection = null;
    updateDestinations();
  });
  $("delete-section").addEventListener("click", () => {
    if (selectedId === story.sections[0].id || !window.confirm(t("deleteConfirm"))) return;
    story.sections = story.sections.filter(section => section.id !== selectedId);
    for (const section of story.sections) {
      if (section.loopTarget === selectedId) section.loopTarget = null;
      for (const choice of section.choices) if (choice.target === selectedId) choice.target = null;
    }
    selectedId = story.sections[0].id;
    selection = null;
    updateDestinations();
  });
  $("save").addEventListener("click", save);
  $("load").addEventListener("click", () => $("file").click());
  $("file").addEventListener("change", event => {
    const file = event.target.files[0];
    event.target.value = "";
    if (file && window.confirm(t("loadConfirm"))) load(file);
  });
  $("print").addEventListener("click", printStory);
  translate();
})();
