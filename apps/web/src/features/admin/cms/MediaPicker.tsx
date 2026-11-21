import {
  MEDIA_CATEGORIES,
  MEDIA_CATEGORY_LABELS,
  type MediaCategory,
  type MediaItem,
} from '@school/shared';
import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Alert, Button, EmptyState, Modal, PageSpinner, Select } from '@/components/ui';
import { errorMessages } from '@/lib/api-client';
import { useMedia, useUploadMedia } from '../cms-api';

/** Choose a public image from the media library, or upload a new one on the spot. */
export function MediaPicker({
  open,
  onClose,
  onSelect,
  defaultCategory = 'GENERAL',
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (media: MediaItem) => void;
  defaultCategory?: MediaCategory;
}) {
  const [category, setCategory] = useState<MediaCategory | ''>('');
  const media = useMedia({ publicOnly: true, category: category || undefined, pageSize: 60 }, open);
  const upload = useUploadMedia();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const item = await upload.mutateAsync({
        file,
        category: category || defaultCategory,
        isPublic: true,
      });
      onSelect(item);
    } catch (e) {
      setError(errorMessages(e)[0]);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Choose an image" size="lg">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          className="max-w-[200px]"
          value={category}
          onChange={(e) => setCategory(e.target.value as MediaCategory | '')}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {MEDIA_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {MEDIA_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button
          variant="secondary"
          onClick={() => input.current?.click()}
          loading={upload.isPending}
        >
          <Upload className="h-4 w-4" aria-hidden="true" /> Upload new
        </Button>
      </div>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {media.isLoading ? (
        <PageSpinner />
      ) : !media.data?.items.length ? (
        <EmptyState title="No images yet" description="Upload one to get started." />
      ) : (
        <ul className="grid max-h-[50vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
          {media.data.items.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => onSelect(m)}
                className="group block w-full overflow-hidden rounded-md border border-gray-200 focus-visible:ring-2 focus-visible:ring-brand-gold"
                title={m.title ?? undefined}
              >
                <img
                  src={m.url}
                  alt={m.altText ?? m.title ?? ''}
                  className="aspect-square w-full object-cover group-hover:opacity-80"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
