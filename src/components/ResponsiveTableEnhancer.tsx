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
  ) {
    return;
  }

  table.classList.add('apex-responsive-table', 'apex-financial-table');
  const labels = getHeaderLabels(table);

  Array.from(table.tBodies).forEach((body) => {
    Array.from(body.rows).forEach((row) => {
      const cells = Array.from(row.cells).filter(
        (cell): cell is HTMLTableCellElement => cell.tagName.toLowerCase() === 'td'
      );
      if (cells.length === 0) return;

      if (cells.some((cell) => cell.colSpan > 1) || (labels.length > 0 && cells.length !== labels.length)) {
        row.classList.add('apex-table-summary-row');
        return;
      }

      cells.forEach((cell, index) => {
        const label = labels[index];
        if (label && cell.dataset.label !== label) cell.dataset.label = label;
      });
    });
  });

  const parent = table.parentElement;
  if (!parent) return;

  if (parent.classList.contains('apex-table-scroll')) {
    parent.setAttribute('role', 'region');
    parent.setAttribute('tabindex', '0');
    if (!parent.hasAttribute('aria-label')) {
      parent.setAttribute('aria-label', table.caption?.textContent?.trim() || 'جدول اطلاعات');
    }
    return;
  }

  if (parent.classList.contains('overflow-x-auto')) {
    parent.classList.add('apex-table-scroll');
    parent.setAttribute('role', 'region');
    parent.setAttribute('tabindex', '0');
    if (!parent.hasAttribute('aria-label')) {
      parent.setAttribute('aria-label', table.caption?.textContent?.trim() || 'جدول اطلاعات');
    }
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'apex-table-scroll';
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('tabindex', '0');
  wrapper.setAttribute('aria-label', table.caption?.textContent?.trim() || 'جدول اطلاعات');
  parent.insertBefore(wrapper, table);
  wrapper.appendChild(table);
}

function enhanceControlGroups(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.flex, .inline-flex, .grid').forEach((group) => {
    const directControls = Array.from(group.children).filter((child) =>
      child.matches(INTERACTIVE_SELECTOR)
    );
    if (directControls.length > 1) group.classList.add('apex-control-gap');
  });
}

function enhance(root: HTMLElement): void {
  root.querySelectorAll<HTMLTableElement>('table:not([data-apex-skip="true"])').forEach(enhanceTable);
  if (root.matches('table:not([data-apex-skip="true"])')) {
    enhanceTable(root as unknown as HTMLTableElement);
  }
  enhanceControlGroups(root);
}

/**
 * Applies consistent, semantic responsive behavior to existing accounting tables
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
          if (node.matches('table, .flex, .inline-flex, .grid')) enhance(node);
          else enhanceControlGroups(node);
          node.querySelectorAll?.('table').forEach((table) => {
            if (table instanceof HTMLTableElement) enhanceTable(table);
          });
        });
      });
    });

    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
