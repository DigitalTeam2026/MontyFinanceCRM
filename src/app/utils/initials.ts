/**
 * Generate avatar initials from a user's display name.
 *
 *   "TSK IE3"    → "TI"
 *   "Admin User" → "AU"
 *   "Madonna"    → "M"   (single name → first letter only)
 *
 * Rules: first letter of the first word + first letter of the last word,
 * extra whitespace ignored, always uppercase. When no display name is given,
 * falls back to the email local-part so we never render a hardcoded value.
 */
export function getInitials(name?: string | null, email?: string | null): string {
  const fromName = initialsFromWords(name);
  if (fromName) return fromName;

  // Fallback: derive from the email local-part, treating . _ - as separators.
  const local = (email ?? '').split('@')[0];
  const fromEmail = initialsFromWords(local.replace(/[._\-+]+/g, ' '));
  return fromEmail || 'U';
}

function initialsFromWords(raw?: string | null): string {
  const cleaned = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  const first = words[0].charAt(0);
  const last = words[words.length - 1].charAt(0);
  return (first + last).toUpperCase();
}
