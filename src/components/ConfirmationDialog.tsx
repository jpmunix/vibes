import React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "@/components/ui/icons";

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmButtonClass?: string;
  showOverlay?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  confirmButtonClass = "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
  showOverlay = true,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-y-auto pointer-events-none">
      <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
        {showOverlay && (
          <div
            className="fixed inset-0 z-[100] bg-black/40 transition-opacity pointer-events-auto"
            onClick={onCancel}
          />
        )}

        <div className="relative z-[101] transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 text-left shadow-xl transition-[opacity,transform] sm:my-8 sm:w-full sm:max-w-lg pointer-events-auto">
          <div className="bg-white dark:bg-gray-800 px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                <h3 className="typo-section-title">
                  {title}
                </h3>
                <div className="mt-2">
                  <p className="typo-caption">
                    {message}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
            <button
              type="button"
              className={`inline-flex w-full justify-center rounded-md border border-transparent px-4 py-2 typo-button focus:outline-none focus:ring-2 focus:ring-offset-2 sm:ml-3 sm:w-auto ${confirmButtonClass}`}
              onClick={onConfirm}
            >
              {confirmText}
            </button>
            <button
              type="button"
              className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white dark:bg-gray-600 dark:border-gray-500 px-4 py-2 typo-button hover:bg-gray-50 dark:hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 sm:mt-0 sm:w-auto"
              onClick={onCancel}
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
