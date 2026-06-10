import { Fields } from "remult";

/**
 * Base class for entities.
 */
export abstract class Base {
  /**
   * The unique identifier for the entity.
   */
  @Fields.cuid()
  id = '';

  /**
   * The date and time when the entity was created.
   */
  @Fields.createdAt({ caption: 'Erstellt am', allowApiUpdate: false })
  createdAt?: Date;

  /**
   * The date and time when the entity was last updated.
   */
  @Fields.updatedAt ({ caption: 'Aktualisiert am', allowApiUpdate: false })
  updatedAt?: Date;

  /**
   * Indicates whether the entity is archived or not.
   */
  @Fields.boolean({ caption: 'Archiviert' })
  archived = false;

}
