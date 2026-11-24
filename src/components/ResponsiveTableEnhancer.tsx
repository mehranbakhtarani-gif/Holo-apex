import { useEffect } from 'react';

const INTERACTIVE_SELECTOR =
  'button, input, select, textarea, [role="button"], [role="tab"]';

function getHeaderLabels(table: HTMLTableElement): string[] {
  const rows = Array.from(table.tHead?.rows ?? []);
  if (rows.length === 0) return [];

  const headerRow = rows.reduce((best, row) => {
    const width = Array.from(row.cells).reduce((sum, cell) => sum + Math.max(1, cell.colSpan), 0);
    const bestWidth = Array.from(best.cells).reduce(
      (sum, cell) => sum + Math.max(1, cell.colSpan),
      0
    );
    return width > bestWidth ? row : best;
  }, rows[0]);

  return Array.from(headerRow.cells).flatMap((cell) => {
    const label = (cell.textContent ?? '').replace(/\s+/g, ' ').trim();
    return Array.from({ length: Math.max(1, cell.colSpan) }, () => label);
  });
}

function enhanceTable(table: HTMLTableElement): void {
  if (
    table.dataset.apexSkip === 'true' ||
    table.getAttribute('role') === 'presentation' ||
    table.closest('[data-apex-static-table="true"]')
  ) return;

  const labels = getHeaderLabels(table);
  table.classList.add('apex-financial-table');
  if (labels.length > 0) table.classList.add('apex-responsive-table');

  if (labels.length > 0) {
    Array.from(table.tBodies).forEach((body) => {
      Array.from(body.rows).forEach((row) => {
        const cells = Array.from(row.cells).filter(
          (cell): cell is HTMLTableCellElement => cell.tagName.toLowerCase() === 'td'
        );
        if (cells.length === 0) return;

        if (cells.some((cell) => cell.colSpan > 1)) {
          row.classList.add('apex-table-summary-row');
          return;
        }

        cells.forEach((cell, index) => {
          const label = labels[index];
          if (label && cell.dataset.label !== label) cell.dataset.label = label;
        });
      });
    });
  }

  const parent = table.parentElement;
  if (!parent) return;

  // Keep React's DOM tree intact: enhance the existing parent instead of wrapping the table.
  parent.classList.add('apex-table-scroll');
  if (!parent.hasAttribute('role')) parent.setAttribute('role', 'region');
  if (!parent.hasAttribute('tabindex')) parent.setAttribute('tabindex', '0');
  if (!parent.hasAttribute('aria-label')) {
    parent.setAttribute('aria-label', table.caption?.textContent?.trim() || 'جدول اطلاعات');
  }
}

function enhanceControlGroup(group: HTMLElement): void {
  const directControls = Array.from(group.children).filter((child) =>
    child.matches(INTERACTIVE_SELECTOR)
  );
  if (directControls.length > 1) group.classList.add('apex-control-gap');
}

function enhanceButtonNames(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>('button[title]:not([aria-label])').forEach((button) => {
    if (!button.textContent?.trim()) button.setAttribute('aria-label', button.title);
  });
}

function enhance(root: HTMLElement): void {
  root.querySelectorAll<HTMLTableElement>('table:not([data-apex-skip="true"])').forEach(enhanceTable);
  if (root.matches('table:not([data-apex-skip="true"])')) enhanceTable(root as HTMLTableElement);

  root.querySelectorAll<HTMLElement>('.flex, .inline-flex, .grid').forEach(enhanceControlGroup);
  if (root.matches('.flex, .inline-flex, .grid')) enhanceControlGroup(root);
  enhanceButtonNames(root);
}

/**
 * Applies responsive and accessible behavior to existing accounting tables
 * without changing their data, sorting, editing, or save logic.
 */
export function ResponsiveTableEnhancer(): null {
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;

    enhance(root);

    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;

          if (node instanceof HTMLTableElement) enhanceTable(node);
          if (node.matches('.flex, .inline-flex, .grid')) enhanceControlGroup(node);
          if (node.matches('button[title]') && !node.hasAttribute('aria-label') && !node.textContent?.trim()) {
            node.setAttribute('aria-label', node.title);
          }

          node.querySelectorAll<HTMLTableElement>('table:not([data-apex-skip="true"])').forEach(enhanceTable);
          node.querySelectorAll<HTMLElement>('.flex, .inline-flex, .grid').forEach(enhanceControlGroup);
          enhanceButtonNames(node);
        });
      });
    });

    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
