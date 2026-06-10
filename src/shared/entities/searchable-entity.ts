import { ClassType, Entity, EntityOptions } from 'remult';

/**
 * An object that provides methods for updating, deleting, and initializing entity indexes.
 */
export const searchProxy = {
  /**
   * Updates the entity index.
   * @param entity - The entity to update the index for.
   */
  updateEntityIndex: async (entity: any) => { },

  /**
   * Deletes the entity index.
   * @param entity - The entity to delete the index for.
   */
  deleteEntityIndex: async (entity: any) => { },

  /**
   * Initializes the entity index.
   * @param entityType - The type of the entity.
   * @param fields - The fields to include in the index.
   */
  initEntityIndex: (entityType: any, fields: string[]) => { },
};

/**
 * Decorator function that makes an entity searchable.
 * @param entityType - The type of the entity.
 * @param key - The key for the entity.
 * @param options - The options for the entity.
 * @returns The decorated entity.
 */
export function SearchableEntity<T>(
  entityType: ClassType<T>,
  key: string,
  options: EntityOptions<
    T extends new (...args: any) => any
      ? InstanceType<T>
      : T
  > & { searchFields: string[] }
) {
  searchProxy.initEntityIndex(entityType, options.searchFields);

  return Entity(key, {
    ...options,
    saved: async (item, e) => {
      await options?.saved?.(item, e);
      await searchProxy.updateEntityIndex(item);
    },
    deleted: async (item, e) => {
      await options?.deleted?.(item, e);
      await searchProxy.deleteEntityIndex(item);
    },
  });
}


