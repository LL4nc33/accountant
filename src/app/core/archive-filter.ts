/**
 * Hilfsfunktion für Listen-Views: Default-Filter `archived: false`, optional
 * mit Toggle das alle inklusive archivierter zeigt. Vermeidet dass jeder
 * Caller das Filter-Snippet selbst schreibt.
 */
export function archiveScope(showArchived: boolean): { archived: boolean } | {} {
  return showArchived ? {} : { archived: false };
}
