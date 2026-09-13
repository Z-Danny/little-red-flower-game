'use client';
import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { X } from 'lucide-react';
export function GardenDialog({
  title,
  children,
  onClose,
  settlement = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  settlement?: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={`garden-dialog ${settlement ? 'garden-settlement' : ''}`}
      >
        <DialogTitle className="garden-sr-only">{title}</DialogTitle>
        {!settlement && (
          <button
            className="garden-dialog-close"
            aria-label="关闭"
            onClick={onClose}
          >
            <X />
          </button>
        )}
        {children}
      </DialogContent>
    </Dialog>
  );
}
