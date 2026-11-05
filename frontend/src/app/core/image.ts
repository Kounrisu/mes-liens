const MAX_WIDTH = 1600;

export function isImage(file: Blob): boolean {
  return /^image\/(png|jpeg|webp|gif)$/.test(file.type);
}

/** Réduit une capture trop large et la recompresse en WebP (une capture d'iPhone fait plusieurs Mo). Repli : l'original. */
export async function shrinkImage(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_WIDTH / bmp.width);
    if (scale === 1 && file.size < 400_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.85));
    return out && out.type === 'image/webp' && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}
