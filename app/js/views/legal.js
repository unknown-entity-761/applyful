// Shows one of the pages in content/legal.js: privacy policy, data disclosure,
// product disclosure statement, terms of use, or help.

import { html, createScreen, mount, notFoundScreen } from '../ui.js';
import { LEGAL_PAGES } from '../content/legal.js';
import { subHeader, wireBack } from './components.js';

export async function renderLegal({ page }, ctx) {
  const content = Object.prototype.hasOwnProperty.call(LEGAL_PAGES, page) ? LEGAL_PAGES[page] : null;
  if (!content) {
    mount(notFoundScreen(), ctx);
    return;
  }

  const screen = createScreen(html`
    ${subHeader(content.title)}
    <main class="content">
      <article class="panel legal">
        ${content.draft && html`
          <p class="draft-note" role="note">
            <strong>Draft for testing.</strong> Fill in the parts in [square brackets] and have this reviewed by a qualified professional before public launch.
          </p>`}
        ${content.updated && html`<p class="legal-updated">Last updated ${content.updated}</p>`}
        <p class="legal-intro">${content.intro}</p>
        ${content.sections.map((section) => html`
          <section>
            <h2>${section.heading}</h2>
            ${(section.paragraphs ?? []).map((text) => html`<p>${text}</p>`)}
            ${section.list && html`<ul>${section.list.map((item) => html`<li>${item}</li>`)}</ul>`}
            ${(section.after ?? []).map((text) => html`<p>${text}</p>`)}
            ${section.table && html`
              <div class="table-scroll">
                <table class="data-table">
                  <thead><tr>${section.table.columns.map((col) => html`<th scope="col">${col}</th>`)}</tr></thead>
                  <tbody>${section.table.rows.map((row) => html`
                    <tr>${row.map((cell, i) => (i === 0 ? html`<th scope="row">${cellText(cell)}</th>` : html`<td>${cellText(cell)}</td>`))}</tr>`)}
                  </tbody>
                </table>
              </div>`}
          </section>`)}
      </article>
    </main>
  `);

  wireBack(screen, '/settings');
  mount(screen, ctx);
}

/** A table cell: text, or { text, note } with the note as a smaller second line. */
function cellText(cell) {
  return typeof cell === 'object' && cell ? html`${cell.text}<span class="cell-note">${cell.note}</span>` : cell;
}
