import {
  ITEM_CONDITIONS,
  ITEM_CONDITION_LABELS,
  PERMISSIONS,
  formatRupees,
  type InventoryItemRow,
  type ItemCondition,
} from '@school/shared';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageSpinner,
  Pagination,
  Select,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { Td, Th } from '../components/OpsParts';
import { tbodyClass, theadClass, useFormErrors } from '../ops-utils';
import {
  useDeleteInventoryCategory,
  useDeleteInventoryItem,
  useInventoryCategories,
  useInventoryItems,
  useInventorySummary,
  useSaveInventoryCategory,
  useSaveInventoryItem,
} from '../operations-api';
import { ExportButtons } from '@/features/reports/components/ExportButtons';
import { usePagination } from '@/lib/use-pagination';
import { useConfirm } from '@/lib/dialogs';

const CONDITION_TONE: Record<ItemCondition, 'green' | 'amber' | 'red' | 'gray'> = {
  GOOD: 'green',
  NEEDS_REPAIR: 'amber',
  DAMAGED: 'red',
  DISPOSED: 'gray',
};

export function InventoryPage() {
  const confirm = useConfirm();
  const { can } = useAuth();
  const manage = can(PERMISSIONS.INVENTORY_MANAGE);
  const categories = useInventoryCategories();
  const summary = useInventorySummary();
  const [categoryId, setCategoryId] = useState('');
  const [conditionStatus, setCondition] = useState<ItemCondition | ''>('');
  const [search, setSearch] = useState('');
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const debounced = useDebouncedValue(search);
  const items = useInventoryItems({
    categoryId: categoryId || undefined,
    conditionStatus: conditionStatus || undefined,
    search: debounced,
    page,
    pageSize,
  });
  const remove = useDeleteInventoryItem();
  const [editing, setEditing] = useState<InventoryItemRow | 'new' | null>(null);
  const [managingCategories, setManagingCategories] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onDelete = async (i: InventoryItemRow) => {
    if (
      !(await confirm({
        title: `Delete ${i.name} (${i.assetCode})?`,
        message: `Use this only for entries made by mistake; mark real disposals as "Disposed".`,
        confirmLabel: 'Delete',
        tone: 'danger',
      }))
    )
      return;
    setError(null);
    try {
      await remove.mutateAsync(i.id);
    } catch (e) {
      setError(errorMessages(e)[0]);
    }
  };
  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Inventory"
        description="The school's asset register: furniture, IT, lab and sports equipment, and where it is."
        actions={
          <>
            <ExportButtons report="inventory" params={{ categoryId: categoryId || undefined }} />
            {manage && (
              <>
                <Button variant="secondary" onClick={() => setManagingCategories(true)}>
                  Categories
                </Button>
                <Button onClick={() => setEditing('new')} disabled={!categories.data?.length}>
                  New item
                </Button>
              </>
            )}
          </>
        }
      />
      {summary.data && summary.data.categories.length > 0 && (
        <Card className="mb-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className={theadClass}>
              <tr>
                <Th>Category</Th>
                <Th right>Items</Th>
                <Th right>Quantity</Th>
                <Th right>Needs attention</Th>
                <Th right>Purchase value</Th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {summary.data.categories.map((c) => (
                <tr key={c.id}>
                  <Td>{c.name}</Td>
                  <Td right>{c.items}</Td>
                  <Td right>{c.quantity}</Td>
                  <Td right>{c.needsAttention || '—'}</Td>
                  <Td right>{formatRupees(c.value)}</Td>
                </tr>
              ))}
              <tr className="font-semibold">
                <Td>Total (excluding disposed)</Td>
                <Td right />
                <Td right />
                <Td right />
                <Td right>{formatRupees(summary.data.totalValue)}</Td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <Card>
        <div className="grid gap-3 border-b border-gray-100 p-4 sm:grid-cols-3">
          <Field label="Search" htmlFor="iv-search">
            <Input
              id="iv-search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Name, asset code or location"
            />
          </Field>
          <Field label="Category" htmlFor="iv-cat">
            <Select
              id="iv-cat"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Condition" htmlFor="iv-cond">
            <Select
              id="iv-cond"
              value={conditionStatus}
              onChange={(e) => {
                setCondition(e.target.value as ItemCondition | '');
                setPage(1);
              }}
            >
              <option value="">All</option>
              {ITEM_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {ITEM_CONDITION_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {items.isLoading ? (
          <PageSpinner />
        ) : !items.data?.items.length ? (
          <EmptyState
            title="No items"
            description={
              categories.data?.length
                ? undefined
                : 'Add a category first (e.g. Furniture, IT equipment).'
            }
          />
        ) : (
          <>
            <table className="min-w-full text-sm">
              <thead className={theadClass}>
                <tr>
                  <Th>Asset code</Th>
                  <Th>Item</Th>
                  <Th right>Qty</Th>
                  <Th>Location</Th>
                  <Th>Condition</Th>
                  <Th right>Cost</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {items.data.items.map((i) => (
                  <tr key={i.id}>
                    <Td className="font-mono text-xs">{i.assetCode}</Td>
                    <Td>
                      <div className="font-medium text-ink">{i.name}</div>
                      <div className="text-xs text-ink-muted">
                        {i.category.name}
                        {i.purchaseDate && ` · bought ${formatDate(i.purchaseDate)}`}
                      </div>
                    </Td>
                    <Td right>
                      {i.quantity} {i.unit}
                    </Td>
                    <Td>{i.location ?? '—'}</Td>
                    <Td>
                      <Badge tone={CONDITION_TONE[i.conditionStatus]}>
                        {ITEM_CONDITION_LABELS[i.conditionStatus]}
                      </Badge>
                    </Td>
                    <Td right>{i.purchaseCost === null ? '—' : formatRupees(i.purchaseCost)}</Td>
                    <Td right>
                      {manage && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => onDelete(i)}>
                            Delete
                          </Button>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={items.data.page}
              totalPages={items.data.totalPages}
              total={items.data.total}
              onChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </Card>
      {editing && (
        <ItemModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      {managingCategories && <CategoriesModal onClose={() => setManagingCategories(false)} />}
    </div>
  );
}

function ItemModal({ item, onClose }: { item: InventoryItemRow | null; onClose: () => void }) {
  const categories = useInventoryCategories();
  const save = useSaveInventoryItem();
  const errs = useFormErrors();
  const [form, setForm] = useState({
    categoryId: item?.category.id ?? categories.data?.[0]?.id ?? '',
    assetCode: item?.assetCode ?? '',
    name: item?.name ?? '',
    quantity: item?.quantity.toString() ?? '1',
    unit: item?.unit ?? '',
    location: item?.location ?? '',
    conditionStatus: item?.conditionStatus ?? 'GOOD',
    purchaseDate: item?.purchaseDate ?? '',
    purchaseCost: item?.purchaseCost?.toString() ?? '',
    notes: item?.notes ?? '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });
  const submit = async () => {
    errs.reset();
    try {
      await save.mutateAsync({
        id: item?.id,
        ...form,
        conditionStatus: form.conditionStatus as ItemCondition,
      });
      onClose();
    } catch (e) {
      errs.capture(e);
    }
  };
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={item ? `Edit ${item.name}` : 'New inventory item'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {errs.general && <Alert>{errs.general}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="it-name" error={errs.fields.name} required>
            <Input id="it-name" value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Category" htmlFor="it-cat" error={errs.fields.categoryId} required>
            <Select id="it-cat" value={form.categoryId} onChange={set('categoryId')}>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Asset code"
            htmlFor="it-code"
            error={errs.fields.assetCode}
            hint={item ? undefined : 'Leave empty to number automatically (AST-00001)'}
          >
            <Input id="it-code" value={form.assetCode} onChange={set('assetCode')} />
          </Field>
          <Field label="Location" htmlFor="it-loc">
            <Input
              id="it-loc"
              value={form.location}
              onChange={set('location')}
              placeholder="Computer lab"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Quantity" htmlFor="it-qty" error={errs.fields.quantity} required>
              <Input
                id="it-qty"
                type="number"
                min={0}
                step="any"
                value={form.quantity}
                onChange={set('quantity')}
              />
            </Field>
            <Field label="Unit" htmlFor="it-unit">
              <Input id="it-unit" value={form.unit} onChange={set('unit')} placeholder="pcs" />
            </Field>
          </div>
          <Field label="Condition" htmlFor="it-cond">
            <Select id="it-cond" value={form.conditionStatus} onChange={set('conditionStatus')}>
              {ITEM_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {ITEM_CONDITION_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Purchase date" htmlFor="it-date">
            <Input
              id="it-date"
              type="date"
              value={form.purchaseDate}
              onChange={set('purchaseDate')}
            />
          </Field>
          <Field label="Purchase cost (₹)" htmlFor="it-cost" error={errs.fields.purchaseCost}>
            <Input
              id="it-cost"
              inputMode="decimal"
              value={form.purchaseCost}
              onChange={set('purchaseCost')}
            />
          </Field>
        </div>
        <Field label="Notes" htmlFor="it-notes">
          <Input id="it-notes" value={form.notes} onChange={set('notes')} />
        </Field>
      </div>
    </Modal>
  );
}

function CategoriesModal({ onClose }: { onClose: () => void }) {
  const categories = useInventoryCategories();
  const save = useSaveInventoryCategory();
  const remove = useDeleteInventoryCategory();
  const errs = useFormErrors();
  const [name, setName] = useState('');
  const add = async () => {
    errs.reset();
    try {
      await save.mutateAsync({ name });
      setName('');
    } catch (e) {
      errs.capture(e);
    }
  };
  const del = async (id: string) => {
    errs.reset();
    try {
      await remove.mutateAsync(id);
    } catch (e) {
      errs.capture(e);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Inventory categories"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        {errs.general && <Alert>{errs.general}</Alert>}
        <ul className="divide-y divide-gray-100 text-sm">
          {categories.data?.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2">
              <span>
                {c.name} <span className="text-xs text-ink-muted">({c.items})</span>
              </span>
              {c.items === 0 && (
                <Button size="sm" variant="ghost" onClick={() => del(c.id)}>
                  Delete
                </Button>
              )}
            </li>
          ))}
        </ul>
        <div className="flex items-end gap-2">
          <Field label="New category" htmlFor="ic-name" error={errs.fields.name}>
            <Input
              id="ic-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Furniture"
            />
          </Field>
          <Button onClick={add} loading={save.isPending} disabled={!name.trim()}>
            Add
          </Button>
        </div>
      </div>
    </Modal>
  );
}
