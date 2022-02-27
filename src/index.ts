import {
  derived as vanillaDerived,
  get as vanillaGet,
  Readable as VanillaReadable,
  readable as vanillaReadable,
  Subscriber as VanillaSubscriber,
  Unsubscriber as VanillaUnsubscriber,
  Writable as VanillaWritable,
  writable as vanillaWritable,
} from 'svelte/store';

// PASS THROUGH

export const get = vanillaGet;
export type Readable<T> = VanillaReadable<T>;
export const readable = vanillaReadable;
export type Subscriber<T> = VanillaSubscriber<T>;
export type Unsubscriber = VanillaUnsubscriber;
export type Writable<T> = VanillaWritable<T>;
export const writable = vanillaWritable;

// TYPES

export interface Loadable<T> extends Readable<T> {
  load?(): Promise<T>;
  reload?(): Promise<T>;
}

export interface WritableLoadable<T> extends Loadable<T> {
  set(value: T): Promise<void>;
}

/* These types come from Svelte but are not exported, so copying them here */
/* One or more `Readable`s. */
export declare type Stores =
  | Readable<unknown>
  | [Readable<unknown>, ...Array<Readable<unknown>>]
  | Array<Readable<unknown>>;
/** One or more values from `Readable` stores. */
export declare type StoresValues<T> = T extends Readable<infer U>
  ? U
  : {
      [K in keyof T]: T[K] extends Readable<infer U> ? U : never;
    };

// INTERNAL FUNCTIONS

const getStoresArray = (stores: Stores): Readable<unknown>[] => {
  return Array.isArray(stores) ? stores : [stores];
};

export const isLoadable = (store: Readable<unknown>): boolean =>
  Object.prototype.hasOwnProperty.call(store, 'load');

export const isReloadable = (store: Readable<unknown>): boolean =>
  Object.prototype.hasOwnProperty.call(store, 'reload');

export const anyLoadable = (stores: Stores): boolean =>
  getStoresArray(stores).some(isLoadable);

export const anyReloadable = (stores: Stores): boolean =>
  getStoresArray(stores).some(isReloadable);

const loadDependencies = <S extends Stores, T>(
  thisStore: Readable<T>,
  loadFunction: (stores: S) => Promise<unknown>,
  stores: S
): (() => Promise<T>) => {
  return async () => {
    await loadFunction(stores);
    return get(thisStore);
  };
};

/**
 * Load a number of Stores. Loading a store will first await loadAll of any parents.
 * @param stores Any Readable or array of Readables to await loading of.
 * @returns Promise that resolves to an array of the loaded values of the input stores.
 * Non Loadables will resolve immediately.
 */
export const loadAll = <S extends Stores>(
  stores: S
): Promise<StoresValues<S>> => {
  const loadPromises = getStoresArray(stores).map((store) => {
    if (Object.prototype.hasOwnProperty.call(store, 'load')) {
      return (store as Loadable<unknown>).load();
    } else {
      return get(store);
    }
  });

  return Promise.all(loadPromises) as Promise<StoresValues<S>>;
};

/**
 * Reload a number of stores. Reloading a store will first await reloadAll of any parents.
 * If a store has no ancestors that are flagged as reloadable, reloading is equivalent to loading.
 * @param stores Any Readable or array of Readables to await reloading of.
 * Reloading a store will first await reloadAll of any parents.
 * @returns Promise that resolves to an array of the loaded values of the input stores.
 * Non Loadables will resolve immediately.
 */
export const reloadAll = <S extends Stores>(
  stores: S
): Promise<StoresValues<S>> => {
  const reloadPromises = getStoresArray(stores).map((store) => {
    if (Object.prototype.hasOwnProperty.call(store, 'reload')) {
      return (store as Loadable<unknown>).reload();
    } else if (Object.prototype.hasOwnProperty.call(store, 'load')) {
      return (store as Loadable<unknown>).load();
    } else {
      return get(store);
    }
  });

  return Promise.all(reloadPromises) as Promise<StoresValues<S>>;
};

// STORES
/**
 * Generate a Loadable store that is considered 'loaded' after resolving asynchronous behavior.
 * This asynchronous behavior may be derived from the value of parent Loadable or non Loadable stores.
 * If so, this store will begin loading only after the parents have loaded.
 * @param stores Any readable or array of Readables whose value is used to generate the asynchronous behavior of this store.
 * Any changes to the value of these stores post-load will restart the asynchronous behavior of the store using the new values.
 * @param mappingLoadFunction A function that takes in the values of the stores and generates a Promise that resolves
 * to the final value of the store when the asynchronous behavior is complete.
 * @param reloadable A flag that indicates whether this store should restart its asynchronous behavior whenever `reload`
 * is invoked on this store or any of its children.
 * @param initial The initial value of the store before it is loaded or on load failure. Otherwise undefined.
 * @returns A Loadable store whose value is set to the resolution of provided async behavior.
 * The loaded value of the store will be ready after awaiting the load function of this store.
 */
export const asyncWritable = <S extends Stores, T>(
  stores: S,
  mappingLoadFunction: (values: StoresValues<S>) => Promise<T> | T,
  mappingWriteFunction: (
    value: T,
    parentValues?: StoresValues<S>
  ) => Promise<void | T>,
  reloadable?: boolean,
  initial: T = undefined
): WritableLoadable<T> => {
  let loadedValuesString: string;
  let currentLoadPromise: Promise<T>;
  // eslint-disable-next-line prefer-const
  let loadDependenciesThenSet: (
    parentLoadFunction: (stores: S) => Promise<StoresValues<S>>,
    forceReload?: boolean
  ) => Promise<T>;

  const thisStore = writable(initial, () => {
    loadDependenciesThenSet(loadAll).catch(() => Promise.resolve());
    getStoresArray(stores).map((store) =>
      store.subscribe(() => {
        loadDependenciesThenSet(loadAll).catch(() => Promise.resolve());
      })
    );
  });

  loadDependenciesThenSet = async (
    parentLoadFunction: (stores: S) => Promise<StoresValues<S>>,
    forceReload = false
  ) => {
    const loadParentStores = parentLoadFunction(stores);

    try {
      await loadParentStores;
    } catch {
      currentLoadPromise = loadParentStores as Promise<T>;
      return currentLoadPromise;
    }

    const storeValues = getStoresArray(stores).map((store) =>
      get(store)
    ) as StoresValues<S>;

    if (!forceReload) {
      const newValuesString = JSON.stringify(storeValues);
      if (newValuesString === loadedValuesString) {
        // no change, don't generate new promise
        return currentLoadPromise;
      }
      loadedValuesString = newValuesString;
    }

    // if mappingLoadFunction takes in single store rather than array, give it first value
    currentLoadPromise = Promise.resolve(
      mappingLoadFunction(Array.isArray(stores) ? storeValues : storeValues[0])
    ).then((finalValue) => {
      thisStore.set(finalValue);
      return finalValue;
    });

    return currentLoadPromise;
  };

  const setStoreValueThenWrite = async (value: T) => {
    thisStore.set(value);

    const parentValues = await loadAll(stores);

    const writeResponse = await mappingWriteFunction(value, parentValues);

    if (writeResponse !== undefined) {
      thisStore.set(writeResponse as T);
    }
    if (reloadable) {
      await loadDependenciesThenSet(reloadAll, reloadable);
    }
  };

  const hasReloadFunction = Boolean(reloadable || anyReloadable(stores));

  return {
    subscribe: thisStore.subscribe,
    set: setStoreValueThenWrite,
    load: () => loadDependenciesThenSet(loadAll),
    ...(hasReloadFunction && {
      reload: () => loadDependenciesThenSet(reloadAll, reloadable),
    }),
  };
};

export const asyncDerived = <S extends Stores, T>(
  stores: S,
  mappingLoadFunction: (values: StoresValues<S>) => Promise<T>,
  reloadable?: boolean,
  initial: T = undefined
): Loadable<T> => {
  const thisStore = asyncWritable(
    stores,
    mappingLoadFunction,
    undefined,
    reloadable,
    initial
  );
  return {
    subscribe: thisStore.subscribe,
    load: thisStore.load,
    ...(thisStore.reload && { reload: thisStore.reload }),
  };
};

/**
 * Generates a Loadable store that will start asynchronous behavior when subscribed to,
 * and whose value will be equal to the resolution of that behavior when completed.
 * @param initial The initial value of the store before it has loaded or upon load failure.
 * @param loadFunction A function that generates a Promise that resolves to the final value
 * of the store when the asynchronous behavior is complete.
 * @param reloadable A flag that indicates whether this store should restart its asynchronous behavior whenever `reload`
 * is invoked on this store or any of its children.
 * @returns  A Loadable store whose value is set to the resolution of provided async behavior.
 * The loaded value of the store will be ready after awaiting the load function of this store.
 */
export const asyncReadable = <T>(
  initial: T,
  loadFunction: () => Promise<T>,
  reloadable = false
): Loadable<T> => {
  return asyncDerived([], loadFunction, reloadable, initial);
};

/**
 * A Derived store that is considered 'loaded' when all of its parents have loaded (and so on).
 * @param stores Any Readable or array of Readables used to generate the value of this store.
 * Any Loadable stores need to load before this store is considered loaded.
 * @param mappingFunction A function that maps the values of the parent store to the value of this store.
 * @returns A Loadable store that whose value is derived from the provided parent stores.
 * The loaded value of the store will be ready after awaiting the load function of this store.
 */
export const derived = <S extends Stores, T>(
  stores: S,
  mappingFunction: (values: StoresValues<S>) => T
): Loadable<T> => {
  const thisStore = vanillaDerived(stores, mappingFunction);
  return {
    subscribe: thisStore.subscribe,
    ...(anyLoadable(stores) && {
      load: loadDependencies(thisStore, loadAll, stores),
    }),
    ...(anyReloadable(stores) && {
      reload: loadDependencies(thisStore, reloadAll, stores),
    }),
  };
};

const shortcuts = asyncWritable(
  [],
  async () => {
    const response = await fetch('https://ourdomain.com/shortcuts');
    return response.json();
  },
  async (newShortcutsList) => {
    const postBody = JSON.stringify({ shortcuts: newShortcutsList });
    const response = await fetch('https://ourdomain.com/shortcuts', {
      method: 'POST',
      body: postBody,
    });
    return response.json();
  }
);

const shortcuts = asyncWritable(
  authToken,
  async ($authToken) => {
    const requestBody = JSON.stringify({ authorization: $authToken });
    const response = await fetch(
      'https://ourdomain.com/shortcuts',
      requestBody
    );
    return response.json();
  },
  async (newShortcutsList, $authToken) => {
    const postBody = JSON.stringify({
      authorization: $authToken,
      shortcuts: newShortcutsList,
    });
    const response = await fetch('https://ourdomain.com/shortcuts', {
      method: 'POST',
      body: postBody,
    });
    return response.json();
  }
);
