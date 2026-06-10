import { Fields } from 'remult';
import { Base } from './base';
import { SearchableEntity } from './searchable-entity';

/**
 * Tag — flache Label-Entity zum Markieren von Kunden (und später ggf.
 * weiteren Entities). Hat eine HEX-Color für die Pill-Darstellung.
 *
 * Verwendung: Customer (Person + Company) hat ein `tagIds`-Feld als
 * Semikolon-getrennte ID-Liste. Wir vermeiden bewusst die Many-to-Many-
 * Relations-Tabelle in v1 — der Token-Spar einfacher Komma-Listen
 * überwiegt den marginalen Schema-Nachteil bei kleinen Datenmengen.
 *
 * Soft-Delete via Base.archived — alte Tags bleiben in tagIds-Strings
 * referenziert, werden aber nicht mehr im Picker angezeigt.
 */
@SearchableEntity(Tag, 'tags', {
  allowApiCrud: true,
  searchFields: ['name'],
})
export class Tag extends Base {
  @Fields.string({ caption: 'Name' })
  name = '';

  /** HEX-Farbe (z.B. #FF6600). Default Neutral-Grau wenn leer. */
  @Fields.string({ caption: 'Farbe' })
  color = '#888888';

  /** Optionale Beschreibung — kurzer Hinweis was dieses Label bedeutet. */
  @Fields.string({ caption: 'Beschreibung' })
  description = '';
}
