import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { SelectField } from '../../../components/controls';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { cn } from '../../../lib/format';

export interface Column<Row> {
  id: string;
  label: string;
  /** Full name for assistive tech and tooltips when `label` is abbreviated. */
  title?: string;
  value: (row: Row) => number | string | null | undefined;
  render?: (row: Row) => ReactNode;
  /** Text columns sort A to Z first and align left. */
  text?: boolean;
  /** Pinned columns stay visible whichever group is selected on small screens. */
  pinned?: boolean;
}

export interface ColumnGroup {
  id: string;
  label: string;
  columns: string[];
}

/**
 * Sortable data table. Below desktop width it shows one set of columns at a time, chosen
 * from a menu, so every value stays readable and the page never scrolls sideways.
 */
export function SortableTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  rowRole,
  activeKey,
  groups,
  phoneGroups,
  defaultSort,
}: {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  rowRole?: (row: Row) => string | undefined;
  activeKey?: string;
  groups?: ColumnGroup[];
  phoneGroups?: ColumnGroup[];
  defaultSort: string;
}) {
  const [sort, setSort] = useState({ id: defaultSort, descending: true });
  const [groupId, setGroupId] = useState('');
  const isCompact = useMediaQuery('(max-width: 1399px)');
  const isPhone = useMediaQuery('(max-width: 560px)');
  const activeGroups = isPhone ? phoneGroups ?? groups : isCompact ? groups : undefined;
  const activeGroup = activeGroups?.find((group) => group.id === groupId) ?? activeGroups?.[0];

  const visible = activeGroup ? columns.filter((column) => column.pinned || activeGroup.columns.includes(column.id)) : columns;

  const sorted = useMemo(() => {
    const column = columns.find((item) => item.id === sort.id);
    if (!column) return rows;
    return [...rows].sort((a, b) => {
      const left = column.value(a);
      const right = column.value(b);
      const leftMissing = left === null || left === undefined;
      const rightMissing = right === null || right === undefined;
      if (leftMissing || rightMissing) return Number(leftMissing) - Number(rightMissing);
      const order = typeof left === 'string' || typeof right === 'string' ? String(left).localeCompare(String(right)) : left - (right as number);
      return sort.descending ? -order : order;
    });
  }, [columns, rows, sort]);

  const onSort = (column: Column<Row>) => {
    setSort((current) => (current.id === column.id ? { id: column.id, descending: !current.descending } : { id: column.id, descending: !column.text }));
  };

  return (
    <div className="sortable">
      {activeGroups && activeGroup && (
        <SelectField label="Columns" value={activeGroup.id} onChange={setGroupId} className="sortable__columns">
          {activeGroups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
        </SelectField>
      )}
      <table className="data-table">
        <caption className="sr-only">{caption}. Column headers sort the table.</caption>
        <thead>
          <tr>
            {visible.map((column) => {
              const active = sort.id === column.id;
              return (
                <th key={column.id} scope="col" className={cn(!column.text && 'num')} aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : 'none'}>
                  <button type="button" className={cn('sort-button', active && 'is-active')} onClick={() => onSort(column)} title={column.title ?? column.label}>
                    {column.label}
                    <span className="sort-button__arrow" aria-hidden="true">
                      {active && (sort.descending ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = rowKey(row);
            return (
              <tr key={key} data-role={rowRole?.(row)} className={cn(key === activeKey && 'is-active')}>
                {visible.map((column) => (
                  <td key={column.id} className={cn(!column.text && 'num')}>{column.render ? column.render(row) : column.value(row)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
