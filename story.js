(function (root) {
  "use strict";

  function createSection(id) {
    return { id, name: "", content: "", ending: false, loop: false, loopTarget: null, choices: [] };
  }

  function createStory() {
    return { version: 1, title: "", author: "", transitionText: null, nextId: 2, sections: [createSection(1)] };
  }

  function validateStory(value) {
    const invalid = () => { throw new Error("invalidFile"); };
    if (!value || typeof value !== "object" || value.version !== 1 ||
        typeof value.title !== "string" || typeof value.author !== "string" ||
        !(value.transitionText === undefined || value.transitionText === null || typeof value.transitionText === "string") ||
        !Number.isSafeInteger(value.nextId) || !Array.isArray(value.sections) || !value.sections.length) invalid();

    const ids = new Set();
    for (const section of value.sections) {
      if (!section || !Number.isSafeInteger(section.id) || section.id < 1 || ids.has(section.id) ||
          typeof section.name !== "string" || typeof section.content !== "string" ||
          typeof section.ending !== "boolean" || typeof section.loop !== "boolean" ||
          !(section.loopTarget === null || Number.isSafeInteger(section.loopTarget)) ||
          !Array.isArray(section.choices)) invalid();
      ids.add(section.id);
      for (const choice of section.choices) {
        if (!choice || typeof choice.text !== "string" ||
            !(choice.target === null || Number.isSafeInteger(choice.target))) invalid();
      }
    }
    if (value.nextId <= Math.max(...ids)) invalid();
    for (const section of value.sections) {
      if ((section.loopTarget !== null && !ids.has(section.loopTarget)) ||
          section.choices.some(choice => choice.target !== null && !ids.has(choice.target))) invalid();
    }
    if (value.transitionText === undefined) value.transitionText = null;
    return value;
  }

  function printProblem(story) {
    for (const section of story.sections) {
      if (section.ending) continue;
      if ((section.loop && section.loopTarget === null) ||
          section.choices.some(choice => choice.target === null)) return "invalidReferences";
      if (section.choices.some(choice => !choice.text.trim())) return "missingChoiceText";
    }
    return null;
  }

  function randomNumbers(story, random = Math.random) {
    const numbers = story.sections.slice(1).map((_, index) => index + 2);
    for (let i = numbers.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    const result = new Map([[story.sections[0].id, 1]]);
    story.sections.slice(1).forEach((section, index) => result.set(section.id, numbers[index]));
    return result;
  }

  root.Story = { createSection, createStory, validateStory, printProblem, randomNumbers };
})(typeof window === "undefined" ? globalThis : window);
