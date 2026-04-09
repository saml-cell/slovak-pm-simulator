/** Escape HTML special characters to prevent XSS when inserting into innerHTML */
export function esc(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
