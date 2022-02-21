import {
  asyncDerived,
  asyncReadable,
  derived,
  get,
  Loadable,
  loadAll,
  readable,
  reloadAll,
  writable,
} from '../src/index';

describe('loadAll / reloadAll utils', () => {
  const myNonAsync = readable('A');
  const myLoadable = { load: () => Promise.resolve('B') } as Loadable<string>;
  const myReloadable = {
    load: () => Promise.resolve('C'),
    reload: () => Promise.resolve('D'),
  } as Loadable<string>;
  const badLoadable = {
    load: () => Promise.reject(new Error('E')),
    reload: () => Promise.reject(new Error('F')),
  } as Loadable<string>;

  describe('loadAll function', () => {
    it('loads single store', () => {
      expect(loadAll(myLoadable)).resolves.toStrictEqual(['B']);
    });

    it('resolves to values of all stores', () => {
      expect(
        loadAll([myNonAsync, myLoadable, myReloadable])
      ).resolves.toStrictEqual(['A', 'B', 'C']);
    });

    it('handles rejection', () => {
      expect(loadAll([myLoadable, badLoadable])).rejects.toStrictEqual(
        new Error('E')
      );
    });
  });

  describe('reloadAll function', () => {
    it('reloads loads single store', () => {
      expect(reloadAll(myReloadable)).resolves.toStrictEqual(['D']);
    });

    it('reloads and resolves to values of all stores', () => {
      expect(
        reloadAll([myNonAsync, myLoadable, myReloadable])
      ).resolves.toStrictEqual(['A', 'B', 'D']);
    });

    it('handles rejection', () => {
      expect(reloadAll([myLoadable, badLoadable])).rejects.toStrictEqual(
        new Error('F')
      );
    });
  });
});

describe('asyncDerived', () => {
  const writableParent = writable('writable');
  let mockReload = jest.fn();

  beforeEach(() => {
    mockReload = jest
      .fn()
      .mockReturnValue('default')
      .mockResolvedValueOnce('first value')
      .mockResolvedValueOnce('second value')
      .mockResolvedValueOnce('third value');
  });

  afterEach(() => {
    writableParent.set('writable');
    mockReload.mockReset();
  });

  describe('no parents / asyncReadable', () => {
    it('loads expected value', async () => {
      const myAsyncDerived = asyncReadable(undefined, () =>
        Promise.resolve('expected')
      );
      const fakeSubscribe = myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).resolves.toBe('expected');
      await myAsyncDerived.load();
      expect(get(myAsyncDerived)).toBe('expected');
    });

    it('loads initial value when rejected', async () => {
      const myAsyncDerived = asyncReadable('initial', () =>
        Promise.reject(new Error('error'))
      );
      const fakeSubscribe = myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).rejects.toStrictEqual(new Error('error'));
      await myAsyncDerived.load().catch(() => Promise.resolve());
      expect(get(myAsyncDerived)).toBe('initial');
    });

    it('does not reload if not reloadable', async () => {
      const myAsyncDerived = asyncReadable(undefined, mockReload);
      const fakeSubscribe = myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).resolves.toBe('first value');
      expect(myAsyncDerived.reload()).resolves.toBe('first value');
      await myAsyncDerived.reload();
      expect(get(myAsyncDerived)).toBe('first value');
    });

    it('does reload if reloadable', async () => {
      const myAsyncDerived = asyncReadable(undefined, mockReload, true);
      const fakeSubscribe = myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).resolves.toBe('first value');
      await myAsyncDerived.load();
      await myAsyncDerived.reload();
      expect(get(myAsyncDerived)).toBe('second value');
      expect(myAsyncDerived.load()).resolves.toBe('second value');
    });
  });

  describe('one parent', () => {
    it('loads expected value', async () => {
      const myAsyncDerived = asyncDerived(writableParent, (storeValue) =>
        Promise.resolve(`derived from ${storeValue}`)
      );
      const fakeSubscribe = myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).resolves.toBe('derived from writable');
      await myAsyncDerived.load();
      expect(get(myAsyncDerived)).toBe('derived from writable');
    });

    it('loads initial value when rejected', async () => {
      const myAsyncDerived = asyncDerived(
        writableParent,
        () => Promise.reject(new Error('error')),
        false,
        'initial'
      );
      const fakeSubscribe = myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).rejects.toStrictEqual(new Error('error'));
      await myAsyncDerived.load().catch(() => Promise.resolve());
      expect(get(myAsyncDerived)).toBe('initial');
    });

    it('does not reload if not reloadable', async () => {
      const myAsyncDerived = asyncDerived(writableParent, mockReload);
      const fakeSubscribe = myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).resolves.toBe('first value');
      expect(myAsyncDerived.reload()).resolves.toBe('first value');
      await myAsyncDerived.reload();
      expect(get(myAsyncDerived)).toBe('first value');
    });

    it('does reload if reloadable', async () => {
      const myAsyncDerived = asyncDerived(
        writableParent,
        mockReload,
        true,
        undefined
      );
      const fakeSubscribe = myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).resolves.toBe('first value');
      await myAsyncDerived.load();
      await myAsyncDerived.reload();
      expect(get(myAsyncDerived)).toBe('second value');
      expect(myAsyncDerived.load()).resolves.toBe('second value');
    });

    it('does reload if parent updates', async () => {
      const myAsyncDerived = asyncDerived(writableParent, mockReload);
      const fakeSubscribe = myAsyncDerived.subscribe(jest.fn);

      await myAsyncDerived.load();
      expect(get(myAsyncDerived)).toBe('first value');
      writableParent.set('updated');
      await myAsyncDerived.load();
      expect(get(myAsyncDerived)).toBe('second value');
    });

    it('loads asyncReadable parent', async () => {
      const asyncReadableParent: Loadable<string> = asyncReadable(
        undefined,
        mockReload
      );
      const myAsyncDerived = asyncDerived(asyncReadableParent, (storeValue) =>
        Promise.resolve(`derived from ${storeValue}`)
      );
      const fakeSubscribe = myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).resolves.toBe('derived from first value');
      await myAsyncDerived.reload();
      expect(get(myAsyncDerived)).toBe('derived from first value');
      expect(myAsyncDerived.load()).resolves.toBe('derived from first value');
    });

    it('reloads reloadable parent', async () => {
      const asyncReadableParent: Loadable<string> = asyncReadable(
        undefined,
        mockReload,
        true
      );
      const myAsyncDerived = asyncDerived(asyncReadableParent, (storeValue) =>
        Promise.resolve(`derived from ${storeValue}`)
      );
      const fakeSubscribe = myAsyncDerived.subscribe(jest.fn);

      await myAsyncDerived.load();
      expect(get(myAsyncDerived)).toBe('derived from first value');
      await myAsyncDerived.reload();
      expect(get(myAsyncDerived)).toBe('derived from second value');
      expect(myAsyncDerived.load()).resolves.toBe('derived from second value');
    });

    it('rejects load when parent load fails', () => {
      const asyncReadableParent: Loadable<string> = asyncReadable(
        undefined,
        () => Promise.reject(new Error('error'))
      );
      const myAsyncDerived = asyncDerived(asyncReadableParent, (storeValue) =>
        Promise.resolve(`derived from ${storeValue}`)
      );
      const fakeSubscribe = myAsyncDerived.subscribe(jest.fn);

      expect(myAsyncDerived.load()).rejects.toStrictEqual(new Error('error'));
    });
  });

  describe('multiple parents', () => {
    it('correctly derives from every kind of parent', async () => {
      const asyncReadableParent: Loadable<string> = asyncReadable(
        undefined,
        () => Promise.resolve('loadable')
      );
      const reloadableParent: Loadable<string> = asyncReadable(
        undefined,
        mockReload,
        true
      );
      const myAsyncDerived = asyncDerived(
        [writableParent, asyncReadableParent, reloadableParent],
        ([$writableParent, $loadableParent, $reloadableParent]) =>
          Promise.resolve(
            `derived from ${$writableParent}, ${$loadableParent}, ${$reloadableParent}`
          )
      );
      const fakeSubscribe = myAsyncDerived.subscribe(jest.fn);

      await myAsyncDerived.load();
      expect(get(myAsyncDerived)).toBe(
        'derived from writable, loadable, first value'
      );
      writableParent.set('new value');
      await myAsyncDerived.load();
      expect(get(myAsyncDerived)).toBe(
        'derived from new value, loadable, first value'
      );
      await myAsyncDerived.reload();
      expect(get(myAsyncDerived)).toBe(
        'derived from new value, loadable, second value'
      );
    });

    it('deterministically sets final value when receiving updates while loading', async () => {
      const delayedParent = asyncReadable(
        undefined,
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );
      const myDerived = asyncDerived(
        [writableParent, delayedParent],
        ([$writableParent, $delayedParent]) =>
          mockReload().then((response) => `${$writableParent}: ${response}`)
      );
      const fakeSubscribe = myDerived.subscribe(jest.fn);
      writableParent.set('A');
      writableParent.set('B');
      writableParent.set('C');
      writableParent.set('D');
      writableParent.set('E');
      writableParent.set('F');
      writableParent.set('G');
      writableParent.set('H');
      writableParent.set('I');
      writableParent.set('J');
      writableParent.set('K');
      writableParent.set('L');
      await myDerived.load();
      expect(get(myDerived)).toBe('L: first value');
    });
  });
});

describe('synchronous derived', () => {
  const nonAsyncParent = writable('writable');
  const asyncReadableParent = asyncReadable(undefined, () =>
    Promise.resolve('loadable')
  );
  let reloadableGrandparent: Loadable<string>;
  let derivedParent: Loadable<string>;
  let mockReload = jest.fn();

  beforeEach(() => {
    mockReload = jest
      .fn()
      .mockReturnValue('default')
      .mockResolvedValueOnce('first value')
      .mockResolvedValueOnce('second value')
      .mockResolvedValueOnce('third value');
    reloadableGrandparent = asyncReadable(undefined, mockReload, true);
    derivedParent = derived(reloadableGrandparent, ($reloadableGrandparent) =>
      $reloadableGrandparent?.toUpperCase()
    );
  });

  afterEach(() => {
    nonAsyncParent.set('writable');
    mockReload.mockReset();
  });

  describe('derived', () => {
    it('gets derived values after loading and reloading', async () => {
      const myDerived = derived(
        [nonAsyncParent, asyncReadableParent, derivedParent],
        ([$nonAsyncParent, $loadableParent, $derivedParent]) =>
          `derived from ${$nonAsyncParent}, ${$loadableParent}, ${$derivedParent}`
      );
      const fakeSubscribe = myDerived.subscribe(jest.fn);

      expect(myDerived.load()).resolves.toBe(
        'derived from writable, loadable, FIRST VALUE'
      );
      await myDerived.load();
      expect(get(myDerived)).toBe(
        'derived from writable, loadable, FIRST VALUE'
      );
      await myDerived.reload();
      expect(get(myDerived)).toBe(
        'derived from writable, loadable, SECOND VALUE'
      );
    });

    it('deterministically sets final value when received many updates', () => {
      const myDerived = derived(
        nonAsyncParent,
        ($nonAsyncParent) => $nonAsyncParent
      );
      const fakeSubscribe = myDerived.subscribe(jest.fn);

      nonAsyncParent.set('A');
      nonAsyncParent.set('B');
      nonAsyncParent.set('C');
      nonAsyncParent.set('D');
      nonAsyncParent.set('E');
      nonAsyncParent.set('F');
      nonAsyncParent.set('G');
      nonAsyncParent.set('H');
      nonAsyncParent.set('I');
      nonAsyncParent.set('J');
      nonAsyncParent.set('K');
      nonAsyncParent.set('L');
      expect(get(myDerived)).toBe('L');
    });
  });
});
