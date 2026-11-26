export function applyBrowserBranding(opts: {
  title?: string;
  iconUrl?: string;
}): void {
  if (typeof document === 'undefined') return;

  if (opts.title && opts.title.trim()) {
    document.title = opts.title.trim();
  }

  const icon = (opts.iconUrl || '').trim();
  if (!icon) return;

  const upsertLink = (rel: string) => {
    let link = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    if (link.href !== icon) {
      link.href = icon;
    }
  };

  upsertLink('icon');
  upsertLink('shortcut icon');
  upsertLink('apple-touch-icon');
}

export async function resizeImageToDataUrl(
  file: File,
  maxSize: number,
  squareCrop = false
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      if (!src) {
        reject(new Error('ملف الصورة غير صالح'));
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(src);
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(src);
            return;
          }

          if (squareCrop) {
            const side = Math.min(img.width, img.height);
            const sx = Math.max(0, (img.width - side) / 2);
            const sy = Math.max(0, (img.height - side) / 2);
            canvas.width = maxSize;
            canvas.height = maxSize;
            ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
            resolve(canvas.toDataURL('image/png'));
          } else {
            const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
            const targetW = Math.max(1, Math.round(img.width * scale));
            const targetH = Math.max(1, Math.round(img.height * scale));
            canvas.width = targetW;
            canvas.height = targetH;
            ctx.drawImage(img, 0, 0, targetW, targetH);
            const mime = file.type === 'image/png' || file.type === 'image/webp' ? 'image/png' : 'image/jpeg';
            resolve(canvas.toDataURL(mime, 0.9));
          }
        } catch {
          resolve(src);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Resize full-width product showcase / infographic images while preserving sharp horizontal resolution
 * (up to maxWidth) even for tall vertical Canva/product explanation sheets.
 */
export async function resizeDetailImageToDataUrl(
  file: File,
  maxWidth = 1440,
  maxHeight = 3600
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      if (!src) {
        reject(new Error('ملف الصورة غير صالح'));
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(src);
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(src);
            return;
          }
          const scaleW = img.width > maxWidth ? maxWidth / img.width : 1;
          const scaleH = img.height * scaleW > maxHeight ? maxHeight / img.height : scaleW;
          const scale = Math.min(1, scaleW, scaleH);
          const targetW = Math.max(1, Math.round(img.width * scale));
          const targetH = Math.max(1, Math.round(img.height * scale));
          canvas.width = targetW;
          canvas.height = targetH;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);
          resolve(canvas.toDataURL('image/jpeg', 0.86));
        } catch {
          resolve(src);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
