import { useEffect, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { usePendingChanges } from './usePendingChanges';
import { canPublishCustomizations } from './publicationService';
import PublishDialog from './PublishDialog';

/**
 * Global "Publish All Customizations" button for the Admin Studio header.
 * Shows the pending-change count and is hidden when the user lacks the
 * publish privilege (the RPC also enforces it server-side).
 */
export default function PublishAllButton() {
  const { summary, refresh } = usePendingChanges();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    canPublishCustomizations().then((v) => { if (!cancelled) setAllowed(v); }).catch(() => { if (!cancelled) setAllowed(false); });
    return () => { cancelled = true; };
  }, []);

  if (allowed === false) return null;

  const pending = summary?.total ?? 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        title="Publish all pending customizations to the Sales application"
      >
        <UploadCloud size={13} />
        Publish All
        {pending > 0 && (
          <span className="ml-0.5 min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full bg-white/25 text-[10px] font-semibold">
            {pending}
          </span>
        )}
      </button>

      {open && summary && (
        <PublishDialog
          summary={summary}
          onClose={() => { setOpen(false); void refresh(); }}
          onPublished={() => { void refresh(); }}
        />
      )}
    </>
  );
}
