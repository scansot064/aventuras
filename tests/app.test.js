(function () {
  "use strict";

  const frame = document.getElementById("app");
  const result = document.getElementById("result");
  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  async function run() {
    try {
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      const $ = selector => doc.querySelector(selector);
      function change(selector, value, type = "input") {
        const node = $(selector);
        node.value = value;
        node.dispatchEvent(new win.Event(type, { bubbles: true }));
      }

      assert($("footer").textContent.includes("Unsaved changes will be lost"), "Show the save warning in English");
      assert($("#save").textContent === "Save Story" && $("#load").textContent === "Load Story" &&
        $("#file").accept === ".sto", "Use story labels and filter for story files");
      const info = $(".sidebar > details.info");
      assert(info && !info.open && $(".sidebar > .panel:first-child #map"), "Place collapsed story information below the map");
      info.querySelector("summary").click();
      assert(info.open, "Expand story information");
      change("#story-title", "My adventure");
      change("#story-author", "The author");
      info.querySelector("summary").click();
      assert(!info.open, "Collapse story information");
      change("#section-name", "introduction");
      assert($("#editor-heading").textContent === "1. introduction (Start)" &&
        $("#map").textContent.includes("1. introduction"), "Show the number and current name");
      $("#add-choice").click();
      assert($(".choice-transition").textContent === "Go to page", "Show the default transition");
      change("#language", "es", "change");
      assert($(".choice-transition").textContent === "Ve a la página", "Localize the default transition");
      assert($("#save").textContent === "Guardar historia" && $("#load").textContent === "Cargar historia",
        "Localize the story file controls");
      assert($("footer").textContent.includes("Los cambios sin guardar se perderán"), "Localize the save warning");
      change("#language", "en", "change");
      change(".choice input", "If you want to fight");
      change(".choice select", "create", "change");
      assert($(".choice select").value === "2", "Link the newly created section");
      assert($("#map").textContent.includes("2. If you want to fight"),
        "Name the new section after the choice");
      assert([...doc.querySelectorAll(".map-link")].some(button => button.textContent === "2. If you want to fight"),
        "Show matching choice and section names only once");
      assert([...$(".choice select").options].some(option => option.textContent === "2. If you want to fight"),
        "Show concise names in destination menus");
      change(".choice input", "A different choice");
      assert([...doc.querySelectorAll(".map-link")].some(button => button.textContent === "A different choice → 2. If you want to fight"),
        "Show both names when the choice differs");
      assert([...$(".choice select").options].some(option => option.textContent === "2. If you want to fight"),
        "Do not rename the destination when the choice changes later");
      change(".choice input", "If you want to fight");
      $("#add-choice").click();
      change("#transition-text", "  Proceed to  ");
      assert([...doc.querySelectorAll(".choice-transition")].every(node => node.textContent === "Proceed to"),
        "Update every preview as the transition changes");
      change("#transition-text", "");
      assert($(".choice-transition").textContent === "", "A blank transition must remain blank");
      doc.querySelectorAll(".choice button")[1].click();

      const target = [...doc.querySelectorAll(".map-link")].find(button => button.textContent.includes("2. If you want to fight"));
      target.click();
      assert($("#section-name").value === "If you want to fight", "Expose the generated name for editing");
      change("#section-name", "The battle");
      assert($("#editor-heading").textContent === "2. The battle", "Update the heading while editing the name");
      assert([...doc.querySelectorAll(".map-link")].some(button => button.textContent === "If you want to fight → 2. The battle"),
        "Show both names after renaming a destination");
      change("#language", "es", "change");
      $("#add-choice").click();
      change(".choice input", "Saltar");
      change(".choice select", "create", "change");
      assert([...$(".choice select").options].some(option => option.textContent === "3. Saltar"),
        "Use just the choice text in Spanish too");

      let saved;
      let filename;
      const createObjectURL = win.URL.createObjectURL;
      win.URL.createObjectURL = blob => {
        saved = blob;
        return createObjectURL.call(win.URL, blob);
      };
      win.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
      $("#save").click();
      assert(filename === "adventure.sto", "Download a .sto story file");
      const story = JSON.parse(await saved.text());
      assert(story.sections[1].name === "The battle" && story.sections[2].name === "Saltar",
        "Save manual and generated names");
      assert(story.title === "My adventure" && story.author === "The author", "Save collapsed story information");
      assert(story.sections[0].choices[0].target === 2 && story.sections[1].choices[0].target === 3,
        "Preserve branch destinations");
      assert(story.transitionText === "", "Save an intentionally blank transition");

      win.confirm = () => true;
      const transfer = new win.DataTransfer();
      transfer.items.add(new win.File([saved], filename, { type: "application/json" }));
      $("#file").files = transfer.files;
      $("#file").dispatchEvent(new win.Event("change", { bubbles: true }));
      for (let i = 0; i < 100 && $("#status").textContent !== "Historia cargada."; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert($("#status").textContent === "Historia cargada.", "Reload the saved story");
      info.querySelector("summary").click();
      assert($("#story-title").value === "My adventure" && $("#story-author").value === "The author",
        "Restore story information after reloading");
      assert($("#map").textContent.includes("2. The battle"), "Keep manual names after reloading");
      assert($(".choice-transition").textContent === "", "Keep a blank transition after reloading");
      change(".choice input", "A different choice");
      assert($("#map").textContent.includes("2. The battle"), "Do not overwrite a manual name when a choice changes");
      $("#add-choice").click();
      change(".choice:last-child select", "create", "change");
      assert([...doc.querySelectorAll(".choice:last-child select option")].some(option => option.textContent === "4. Sin nombre"),
        "Show an unnamed section when the choice is blank");

      story.sections[1].name = "From 1: If you want to fight";
      story.sections[2].name = "Section 2 Saltar";
      const legacy = new win.DataTransfer();
      legacy.items.add(new win.File([JSON.stringify(story)], "old.sto", { type: "application/json" }));
      $("#status").textContent = "";
      $("#file").files = legacy.files;
      $("#file").dispatchEvent(new win.Event("change", { bubbles: true }));
      for (let i = 0; i < 100 && $("#status").textContent !== "Historia cargada."; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert($("#map").textContent.includes("2. From 1: If you want to fight") &&
        [...$(".choice select").options].some(option => option.textContent === "3. Section 2 Saltar"),
        "Preserve names from existing stories");
      change("#section-name", "Volver a la sección");
      $("#loop-enabled").click();
      change("#loop-target", "1", "change");
      assert([...doc.querySelectorAll(".map-link")].some(button => button.textContent === "Volver a la sección → 1. Volver a la sección"),
        "Keep loop labels even when they match the destination name");
      result.textContent = "PASS";
    } catch (error) {
      result.textContent = `FAIL: ${error.message}`;
      throw error;
    }
  }

  if (frame.contentDocument.readyState === "complete" && frame.contentWindow.location.href.endsWith("/index.html")) {
    run();
  } else {
    frame.addEventListener("load", run, { once: true });
  }
})();
