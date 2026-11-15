# Adventure Maker

A client-side choose-your-own-adventure editor. Open `index.html` in a modern browser; no server or account is required.

The header's original pixel-art sword is included locally; the interface does not require an internet connection.

Enter the title and author, create sections, and connect them with choices. To create and connect a section in one step, choose **Create new section** in a choice's destination menu. Its initial name is the choice text, for example “If you climb the ladder”; the editor shows its number alongside it. If the choice is blank, the section is unnamed. You can edit names later, and existing names are not changed. The first section is always the starting section. Use the story map to expand branches and navigate; repeated nodes indicate a cycle. Sections not reachable from the start appear under Other sections. Editor section numbers and names are only for reference and do not appear in the printed story.

An ending prints END (or FIN in Spanish) and suppresses choices and loops until it is unchecked. An enabled loop adds an instruction to go to its selected section; choices can also point back to any section. When a section has both choices and a loop, the loop is an additional option.

Set **Choice transition text** in story information to customize the text before every choice and loop page number. It also appears beside each choice destination while editing. Leave it empty to print only the number. Until edited, it defaults to “Go to page” or “Ve a la página” in the selected interface language. A custom value stays unchanged when the interface language changes.

Save periodically using **Save Story** and reopen the `.sto` file with **Load Story**. Files contain story text, formatting, choices, and links; they are not saved automatically. Loading replaces the current story. Keep a backup of your story file. The `.sto` format contains JSON; to open a story saved by an earlier version, rename its `.json` extension to `.sto` first.

Use **Save A5 PDF** to download a book with an unnumbered cover and A5 pages. The starting section begins on page 1. Other sections are shuffled on each export, always begin on a new page, and can continue across subsequent pages; choices and loops refer to the destination's actual first page. Each section's first page shows its physical page number at the top; continuation pages count toward page numbers but do not display them. The language selected in the editor determines printed labels.

The PDF embeds Unicode Noto Sans and Noto Emoji fonts. Most emoji, including many skin-tone and combined sequences, use color artwork; emoji without artwork fall back to the monochrome font when supported. No font or artwork set covers all Unicode: unsupported characters or emoji sequences produce an error rather than being silently replaced.

The PDF library is pdf-lib 1.17.1, vendored for offline use under its [MIT license](vendor/pdf-lib/LICENSE.md), with [bundled dependency licenses](vendor/pdf-lib/licenses/). Its version is also recorded in `package.json`.

The embedded fonts are unmodified [Noto Sans](https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoSans) and [Noto Emoji](https://github.com/google/fonts/tree/main/ofl/notoemoji), distributed under their [font licenses](vendor/fonts/). Font embedding uses [fontkit](vendor/fontkit/LICENSE).

Color emoji artwork is [Twemoji](https://github.com/jdecked/twemoji), © 2019 Twitter, Inc. and contributors, licensed under [CC BY 4.0](vendor/twemoji/CC-BY-4.0.txt). Artwork from [@twemoji/svg](https://github.com/boywithkeyboard/twemoji_svg) is optimized and rasterized for PDFs. PDFs containing this artwork include attribution on the cover.

To run the checks, open [tests/app.html](tests/app.html) and [tests/pdf.html](tests/pdf.html) in a browser and confirm each reports `PASS`.
