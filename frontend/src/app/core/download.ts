/** Déclenche le téléchargement d'un fichier généré dans le navigateur. */
export function downloadFile(data: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const today = (): string => new Date().toISOString().slice(0, 10);
