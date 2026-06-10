import express from 'express';

import { Document, SimpleDocumentSearchResultSetUnit } from 'flexsearch';
import { existsSync, promises as fs } from 'fs';
import { ClassType, remult } from 'remult';
import { searchProxy } from '../shared/entities/searchable-entity';

const enableSearchIndexPersistence = true;

searchProxy.updateEntityIndex = async (entity: any) => {
  // Tolerant gegenüber Saves vor `initSearch()`: während der JSON→SQLite-Migration
  // ist der Index für die Entity noch nicht aufgebaut. Wir überspringen
  // dann den Index-Update — der Index wird beim `initSearch()`-Lauf ohnehin
  // frisch aus der DB neu aufgebaut.
  if (!indexes[entity?.constructor?.name]) return;
  updateEntityIndex(entity);
};
searchProxy.deleteEntityIndex = async (entity: any) => {
  if (!indexes[entity?.constructor?.name]) return;
  deleteEntityIndex(entity);
};
searchProxy.initEntityIndex = async (entityType: any, fields: string[]) => {
  initSearchIndex(entityType, fields);
};

/**
 * The collection of search indexes.
 * Each key represents the entity name and the value represents the search index document.
 */
export const indexes: { [key: string]: Document<any> } = {};

/**
 * Array of functions used to initialize the search index.
 * Each function returns a promise that resolves to a document index of type T.
 */
const initSearchIndexFunctions: (() => Promise<Document<any, false>>)[] = [];

const stringTypeToTypeMap: { [key: string]: ClassType<any> } = {};

/**
 * Initializes the search functionality.
 * This function executes a series of initialization functions to set up the search index.
 * @returns {Promise<void>} A promise that resolves when the search initialization is complete.
 */
export async function initSearch() {
  for (const f of initSearchIndexFunctions) {
    await f();
  }
}
/**
 * Initializes the search index for a given entity and fields and adds it to the initSearchIndexFunctions.
 *
 * @param entityType The entity class to index.
 * @param fields The fields of the entity to include in the index.
 * @returns A promise that resolves to the created search index document.
 */
export async function initSearchIndex<T>(
  entityType: ClassType<T>,
  fields: (keyof T)[]
) {
  console.log(
    `[search] Initializing search index for ${entityType.name}.`
  );

  initSearchIndexFunctions.push(async () => {
    const searchIndexFolder = getSearchIndexFolder(entityType.name);

    stringTypeToTypeMap[entityType.name] = entityType;

    const index = new Document<T>({
      document: {
        id: 'id',
        index: fields as string[],
      },
      tokenize: 'full',
    });

    if (!enableSearchIndexPersistence || !existsSync(searchIndexFolder)) {
      console.log('Generating index for', entityType.name, fields);
      const entities = await remult.repo(entityType).find();
      for (const entity of entities) {
        index.add(entity);
      }
      indexes[entityType.name] = index;
      console.log('Index created for', entityType.name, fields);

      if (enableSearchIndexPersistence) {
        // Check if folder 'searchindex' exists, otherwise create it:
        await fs.mkdir(searchIndexFolder, { recursive: true });
        index.export(async (key, data) => {
          await fs.writeFile(
            searchIndexFolder + key + '.json',
            (data as string) || '',
            'utf8'
          );
        });
      }
    } else if (enableSearchIndexPersistence) {
      console.log('Loading index for', entityType.name, fields);
      const files = await fs.readdir(searchIndexFolder);
      for (const file of files) {
        const data = await fs.readFile(searchIndexFolder + file, 'utf8');
        //console.log('Importing', file.replace('.json', ''));
        index.import(file.replace('.json', ''), data as any);
      }
      indexes[entityType.name] = index;
      console.log('[search] Index successfully loaded for', entityType.name, fields);
    }
    return index;
  });
}

function getSearchIndexFolder(typeName: string) {
  return 'data/searchindex/' + typeName + '/';
}

export function updateEntityIndex(entity: any) {
  const index = indexes[entity.constructor.name];

  index.update(entity);
  if (enableSearchIndexPersistence) {
    index.export(async (key, data) => {
      await fs.writeFile(
        getSearchIndexFolder(entity.constructor.name) + key + '.json',
        (data as string) || '',
        'utf8'
      );
    });
  }
}

export async function deleteEntityIndex(entity: any) {
  const index = indexes[entity.constructor.name];

  await index.removeAsync(entity);
  if (enableSearchIndexPersistence) {
    index.export(async (key, data) => {
      await fs.writeFile(
        getSearchIndexFolder(entity.constructor.name) + key + '.json',
        (data as string) || '',
        'utf8'
      );
    });
  }
}

/**
 * Express router for search endpoints.
 */
export const search = express.Router();

/**
 * Endpoint for searching in a specific index.
 *
 * @param req The request object.
 * @param res The response object.
 */
search.get('/api/search/:index/', async (req, res) => {
  const query = req.query['q'] as string;
  const indexName = req.params.index;
  const results = indexes[indexName]?.search(query) || [];
  res.json(results);
});

/**
 * Endpoint for searching in all indexes.
 *
 * @param req The request object.
 * @param res The response object.
 */
search.get('/api/search', async (req, res) => {
  const query = req.query['q'] as string;
  const limit = Number(req.query['limit']);
  const result: any = {};

  for (const indexName in indexes) {
    const results = indexes[indexName].search({
      query,
      limit,
      enrich: true, //TODO Sollte entitites zurückgeben, passiert aber nicht.
    });
    if (results.length) {
      const ergebnis = await Promise.all(
        results.map(
          async (
            value: SimpleDocumentSearchResultSetUnit,
            index: number,
            array: SimpleDocumentSearchResultSetUnit[]
          ) => {
            return {
              field: value.field,
              result: await remult
                .repo(stringTypeToTypeMap[indexName])
                .find({ where: { id: { $in: value.result } } }),
            };
          }
        )
      );
      result[indexName.toLowerCase() + 's'] = ergebnis;
    }
  }
  res.json(result);
});
