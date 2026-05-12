import React, { useRef, useState, useCallback } from "react";
import type { FileAttachment } from "@/ipc/types";
import { useAtom } from "jotai";
import { attachmentsAtom } from "@/atoms/chatAtoms";
import { showWarning } from "@/lib/toast";
import { useSelectedModelSupportsImages } from "./useSelectedModelSupportsImages";

export function useAttachments() {
  const [attachments, setAttachments] = useAtom(attachmentsAtom);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const supportsImages = useSelectedModelSupportsImages();

  const handleAttachmentClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (
      e: React.ChangeEvent<HTMLInputElement>,
      type: "chat-context" | "upload-to-codebase" = "chat-context",
    ) => {
      if (e.target.files && e.target.files.length > 0) {
        const files = Array.from(e.target.files);
        const fileAttachments: FileAttachment[] = files.map((file) => ({
          file,
          type,
        }));
        setAttachments((attachments) => [...attachments, ...fileAttachments]);
        // Clear the input value so the same file can be selected again
        e.target.value = "";
      }
    },
    [setAttachments],
  );

  const handleFileSelect = useCallback(
    (
      fileList: FileList,
      type: "chat-context" | "upload-to-codebase",
    ) => {
      const files = Array.from(fileList);
      const fileAttachments: FileAttachment[] = files.map((file) => ({
        file,
        type,
      }));
      setAttachments((attachments) => [...attachments, ...fileAttachments]);
    },
    [setAttachments],
  );

  const removeAttachment = useCallback(
    (index: number) => {
      setAttachments((attachments) =>
        attachments.filter((_, i) => i !== index),
      );
    },
    [setAttachments],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        let files = Array.from(e.dataTransfer.files);
        
        if (!supportsImages) {
          const hasImages = files.some(f => f.type.startsWith("image/"));
          if (hasImages) {
             showWarning("El modelo actual no soporta imágenes");
             files = files.filter(f => !f.type.startsWith("image/"));
             if (files.length === 0) return;
          }
        }
        const fileAttachments: FileAttachment[] = files.map((file) => ({
          file,
          type: "chat-context" as const,
        }));
        setAttachments((attachments) => [...attachments, ...fileAttachments]);
      }
    },
    [setAttachments, supportsImages],
  );

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, [setAttachments]);

  const addAttachments = useCallback(
    (
      files: File[],
      type: "chat-context" | "upload-to-codebase" = "chat-context",
    ) => {
      const fileAttachments: FileAttachment[] = files.map((file) => ({
        file,
        type,
      }));
      setAttachments((attachments) => [...attachments, ...fileAttachments]);
    },
    [setAttachments],
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const items = Array.from(clipboardData.items);
      const imageItems = items.filter((item) =>
        item.type.startsWith("image/"),
      );

      if (imageItems.length > 0) {
        e.preventDefault(); // Prevent default paste behavior for images

        if (!supportsImages) {
          showWarning("El modelo actual no soporta imágenes");
          return;
        }

        const imageFiles: File[] = [];
        // Generate base timestamp once to avoid collisions
        const baseTimestamp = new Date().toISOString().replace(/[:.]/g, "-");

        for (let i = 0; i < imageItems.length; i++) {
          const item = imageItems[i];
          const file = item.getAsFile();
          if (file) {
            // Create a more descriptive filename with timestamp and counter
            const extension = file.type.split("/")[1] || "png";
            const filename =
              imageItems.length === 1
                ? `pasted-image-${baseTimestamp}.${extension}`
                : `pasted-image-${baseTimestamp}-${i + 1}.${extension}`;
            const newFile = new File([file], filename, {
              type: file.type,
            });
            imageFiles.push(newFile);
          }
        }

        if (imageFiles.length > 0) {
          addAttachments(imageFiles, "chat-context");
          // Show a brief toast or indication that image was pasted
          console.log(`Pasted ${imageFiles.length} image(s) from clipboard`);
        }
      }
    },
    [addAttachments, supportsImages, isStrategistMode],
  );

  return {
    attachments,
    fileInputRef,
    isDraggingOver,
    handleAttachmentClick,
    handleFileChange,
    handleFileSelect,
    removeAttachment,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    clearAttachments,
    handlePaste,
    addAttachments,
  };
}
