'use client';
import type { ReactNode, RefObject } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { X } from 'lucide-react';
export function GardenDialog({
  title,
  children,
  onClose,
  settlement = false,
  hideClose = false,
  className = '',
  initialFocus,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  settlement?: boolean;
  hideClose?: boolean;
  className?: string;
  initialFocus?: RefObject<HTMLElement | null>;
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
        className={`garden-dialog ${settlement ? 'garden-settlement' : ''} ${className}`}
        initialFocus={initialFocus}
      >
        <DialogTitle className="garden-sr-only">{title}</DialogTitle>
        {!settlement && !hideClose && (
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
