"use client";
import { useState, useEffect } from "react";
import c from "./PhotoThumbnail.module.css";

interface PhotoThumbnailProps {
  file: File | null;
}

export default function PhotoThumbnail({ file }: PhotoThumbnailProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!file || file.type === "application/pdf") {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  if (!file) return null;

  if (file.type === "application/pdf") {
    return <span className={c.pdfBadge}>PDF</span>;
  }

  if (!url) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={c.previewBtn}>
        PRIKAŽI
      </button>

      {open && (
        <div onClick={() => setOpen(false)} className={c.lightbox}>
          <img src={url} alt="" onClick={(e) => e.stopPropagation()} className={c.lightboxImg} />
          <button type="button" onClick={() => setOpen(false)} className={c.closeBtn} aria-label="Zatvori">
            ✕
          </button>
        </div>
      )}
    </>
  );
}
