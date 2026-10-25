// Phase C: shopping domain extracted from HomeScreen (pure move, no behavior change).
// Directed shopping lists + loose-item adoption + per-tab search.
// Stays in HomeScreen: toggleItem (shared item toggle), onAssign (tasks),
// refreshFamily/onRefreshShopping (family space loader).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import type { FamilyMember, Item, ShoppingList, Space } from '@mawjood/voice-engine';
import { splitShoppingItems } from '@mawjood/voice-engine';
import { engine } from '../../../lib/engine';
import { t, tx } from '../../../lib/i18n';
import { tap } from '../../../lib/haptics';
import { useTabSearch } from '../../../lib/useTabSearch';

export interface UseShoppingArgs {
  userId: string | null;
  viewSpace: Space | null;
  trashRetention: number;
  familyMembers: FamilyMember[] | null;
  displayName: string | null;
  userEmail: string | null;
  showUndo: (msg: string, run: () => void) => void;
  showToast: (msg: string) => void;
}

export function useShopping({
  userId,
  viewSpace,
  trashRetention,
  familyMembers,
  displayName,
  userEmail,
  showUndo,
  showToast,
}: UseShoppingArgs) {
  const [shopping, setShopping] = useState<Item[]>([]);
  const [shopLists, setShopLists] = useState<ShoppingList[]>([]); // directed lists ("يا جون جيب…")

  // Server-side search (audit P8): the old client-side filter only saw
  // the lists already loaded on screen (10), so older lists were
  // unfindable. The engine searches the whole space; if that call fails
  // we fall back to filtering what is loaded rather than showing
  // a false "no results".
  const shopSearch = useTabSearch<ShoppingList>({
    search: async (q) => {
      const sid = viewSpace?.id;
      if (!sid) return [];
      try {
        return await engine.searchShoppingLists(sid, q);
      } catch (e) {
        console.warn('shop server search failed — local fallback', e);
        const needle = q.toLowerCase();
        return shopLists.filter(
          (l) =>
            l.title.toLowerCase().includes(needle) ||
            (l.assigned_name ?? '').toLowerCase().includes(needle) ||
            l.items.some((i) => i.title.toLowerCase().includes(needle)),
        );
      }
    },
  });

  const [activeListId, setActiveListId] = useState<string | null>(null); // shopping-mode modal
  const adoptedRef = useRef<string | null>(null); // loose-shopping adoption, once per space

  const [newListOpen, setNewListOpen] = useState(false); // manual list creator modal
  const [newListTitle, setNewListTitle] = useState('');
  const [newListItems, setNewListItems] = useState('');
  const [newListAssignee, setNewListAssignee] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false); // save in flight — button disabled, modal stays open
  const [createError, setCreateError] = useState<string | null>(null); // inline, retryable
  const createBusyRef = useRef(false); // double-submit guard (state alone races on fast double-taps)
  const [archOpenId, setArchOpenId] = useState<string | null>(null); // expanded archived list
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [assignName, setAssignName] = useState('');

  /**
   * Set one shopping-list item's status: bought (✅), not found (❌ ما لقيناه),
   * or back to open. When every item is resolved the list is archived
   * (status done → moves to the history section).
   */
  const setShopItemStatus = useCallback(
    async (listId: string, item: Item, status: Item['status']) => {
      const list = shopLists.find((l) => l.id === listId);
      if (!list) return;
      tap('light');
      const now = new Date().toISOString();
      const items = list.items.map((p) =>
        p.id === item.id
          ? { ...p, status, bought_at: status === 'done' ? now : null }
          : p,
      );
      const allResolved = items.length > 0 && items.every((p) => p.status !== 'open');
      const listStatus = allResolved ? 'done' : 'open';
      // preserve the original archive date when editing an already-archived list
      const completedAt = allResolved ? (list.completed_at ?? now) : null;
      setShopLists((prev) =>
        prev.map((l) =>
          l.id === listId
            ? { ...l, items, status: listStatus, completed_at: completedAt }
            : l,
        ),
      );
      try {
        // ONE engine operation (audit P4): the RPC recomputes the list's
        // archive state in the same transaction; sync the list fields
        // from its authoritative result — a concurrent toggle by another
        // member may have landed first and changed the outcome.
        const res = await engine.setShopItemStatus(item.id, status);
        if (res.listId === listId && res.listStatus) {
          setShopLists((prev) =>
            prev.map((l) =>
              l.id === listId
                ? { ...l, status: res.listStatus as 'open' | 'done', completed_at: res.completedAt }
                : l,
            ),
          );
        }
      } catch (e) {
        console.warn('setShopItemStatus failed', e);
        // full rollback — items, status AND completed_at — plus a
        // visible error; the old code restored neither completed_at nor
        // told the user anything.
        setShopLists((prev) =>
          prev.map((l) =>
            l.id === listId
              ? { ...l, items: list.items, status: list.status, completed_at: list.completed_at }
              : l,
          ),
        );
        showToast(t('shopStatusFailed'));
      }
    },
    [shopLists, showToast],
  );

  /** Delete a shopping list → trash (Plus) or permanent (free). Single tap: trash is the safety net. */
  const deleteShopList = useCallback(
    async (listId: string) => {
      if (!userId) return;
      const idx = shopLists.findIndex((l) => l.id === listId);
      const snap = idx >= 0 ? shopLists[idx] : undefined;
      setShopLists((prev) => prev.filter((l) => l.id !== listId));
      if (activeListId === listId) setActiveListId(null);
      try {
        await engine.trashShoppingList(listId, userId, trashRetention);
        tap('medium');
        if (snap) {
          showUndo(t('deletedList'), () => {
            setShopLists((prev) => [snap, ...prev.filter((l) => l.id !== snap.id)]);
            void engine
              .undelete(
                snap.id,
                'shopping_lists',
                snap as unknown as Record<string, unknown>,
                (snap.items ?? []) as unknown as Record<string, unknown>[],
              )
              .catch((e) => {
                console.warn('undelete failed', e);
                // the restore did not land — take the row back off the
                // screen and say so, instead of showing a ghost list.
                setShopLists((prev) => prev.filter((l) => l.id !== snap.id));
                showToast(t('shopRestoreFailed'));
              });
          });
        }
      } catch (e) {
        console.warn('trashShoppingList failed', e);
        // the delete did NOT happen (engine aborts when the snapshot
        // reads fail) — put the list back where it was and tell the
        // user; the old code left it vanished from the screen only.
        if (snap) {
          setShopLists((prev) =>
            prev.some((l) => l.id === snap.id)
              ? prev
              : [...prev.slice(0, idx), snap, ...prev.slice(idx)],
          );
        }
        showToast(t('shopDeleteFailed'));
      }
    },
    [userId, trashRetention, activeListId, shopLists, showUndo, showToast],
  );

  /** share a shopping list as text: native share sheet on web (iOS share
   *  options: WhatsApp, Messages, Mail…), wa.me fallback elsewhere. */
  const shareShoppingList = useCallback((list: ShoppingList) => {
    const lines = list.items.map(
      (i) =>
        `${i.status === 'done' ? '✅' : i.status === 'not_found' ? '❌' : '⬜'} ${i.title}${
          i.status === 'not_found' ? ` ${t('shareNotFoundTag')}` : ''
        }`,
    );
    const text = `${t('shareListHead')}: ${list.title}\n${lines.join('\n')}`;
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }) : undefined;
    const waFallback = () =>
      void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`).catch(() =>
        console.warn('share failed'),
      );
    if (nav?.share) {
      nav.share({ text }).catch((e) => {
        // user cancelling the share sheet is not a failure; anything
        // else falls back to WhatsApp instead of dying silently.
        if ((e as { name?: string } | null)?.name === 'AbortError') return;
        console.warn('share failed — wa.me fallback', e);
        waFallback();
      });
      return;
    }
    waFallback();
  }, []);

  /** Restore an archived list to live: not_found items reopen, bought stay bought. */
  const restoreShopList = useCallback(
    async (listId: string) => {
      const list = shopLists.find((l) => l.id === listId);
      if (!list || list.status !== 'done') return;
      const items = list.items.map((p) =>
        p.status === 'not_found' ? { ...p, status: 'open' as const } : p,
      );
      setShopLists((prev) =>
        prev.map((l) =>
          l.id === listId ? { ...l, items, status: 'open' as const, completed_at: null } : l,
        ),
      );
      if (archOpenId === listId) setArchOpenId(null);
      try {
        await engine.restoreShoppingList(listId);
      } catch (e) {
        console.warn('restoreShoppingList failed', e);
        // roll back the optimistic update and tell the user
        setShopLists((prev) =>
          prev.map((l) => (l.id === listId ? { ...list, status: 'done' as const } : l)),
        );
        showToast(t('shopRestoreFailed'));
      }
    },
    [shopLists, archOpenId, showToast],
  );

  const [shopRefreshing, setShopRefreshing] = useState(false);

  /**
   * Create from the manual modal (audit P3). The modal now stays OPEN
   * while saving: inputs are cleared only after the save succeeds, a
   * failure keeps everything typed and shows a retryable inline error,
   * and a busy guard blocks double-submits. The assignee notification
   * still fires only after the list exists, and its failure stays
   * isolated from the creation result.
   */
  const createManualList = useCallback(async () => {
    if (createBusyRef.current) return;
    const items = splitShoppingItems(newListItems);
    const sid = viewSpace?.id;
    if (items.length === 0 || !sid || !userId) return;
    const member = (familyMembers ?? []).find((m) => m.user_id === newListAssignee) ?? null;
    const assigneeName = member?.display_name ?? null;
    const title =
      newListTitle.trim() ||
      (assigneeName ? tx('shopListTitle', { name: assigneeName }) : t('shopListGenericTitle'));
    createBusyRef.current = true;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const list = await engine.createShoppingList({
        spaceId: sid,
        title,
        assignedTo: member?.user_id ?? null,
        assignedName: assigneeName,
        items,
        userId,
      });
      setShopLists((prev) => [list, ...prev]);
      setNewListOpen(false);
      setNewListTitle('');
      setNewListItems('');
      setNewListAssignee(null);
      if (member?.user_id) {
        const speaker = displayName ?? userEmail ?? '';
        engine
          .notifyUser(
            member.user_id,
            t('shopListPushTitle'),
            tx('shopListPushBody', { by: speaker, items: items.join('، ') }),
          )
          .catch(() => {});
      }
    } catch (e) {
      console.warn('createManualList failed', e);
      setCreateError(t('shopCreateFailed'));
    } finally {
      createBusyRef.current = false;
      setCreateBusy(false);
    }
  }, [newListItems, newListTitle, newListAssignee, viewSpace, userId, familyMembers, displayName, userEmail]);

  /** Open the creator with a clean error slate. */
  const openNewList = useCallback(() => {
    setCreateError(null);
    setNewListOpen(true);
  }, []);

  /**
   * Transition helper: sweep any loose shopping items (created before the
   * list-only change, or by the old extract fn before its redeploy) into one
   * unassigned list so nothing stays invisible. Failure-safe (audit P12):
   * if attaching fails, the just-created empty list is removed again and
   * the sweep stays retryable — the old code left the orphan behind and
   * marked the space as adopted, so it never retried.
   * Returns true only when the sweep fully landed.
   */
  const adoptBusyRef = useRef(false);
  const adoptLooseShopping = useCallback(
    async (spaceId: string, loose: Item[]): Promise<boolean> => {
      if (loose.length === 0 || !userId) return false;
      let createdId: string | null = null;
      try {
        const list = await engine.createShoppingList({
          spaceId,
          title: t('shopListGenericTitle'),
          assignedTo: null,
          assignedName: null,
          items: [],
          userId,
        });
        createdId = list.id;
        await engine.attachItemsToList(
          loose.map((i) => i.id),
          list.id,
        );
        setShopping([]);
        // first page only — same page size as the tab's loader
        // (SHOP_LISTS_PAGE in index.tsx), so pagination state stays sane.
        const withItems = await engine.listShoppingLists(spaceId, { offset: 0, limit: 10 });
        setShopLists(withItems);
        return true;
      } catch (e) {
        console.warn('adoptLooseShopping failed', e);
        if (createdId) {
          await engine.deleteShoppingList(createdId).catch(() => {});
        }
        return false;
      }
    },
    [userId],
  );

  // list-only shopping: sweep stray loose items into one unassigned list
  // (once per space — covers items made before this change; a failed
  // sweep does NOT mark the space, so a later load retries it)
  useEffect(() => {
    adoptedRef.current = null;
  }, [viewSpace?.id]);
  useEffect(() => {
    const sid = viewSpace?.id;
    if (!sid || shopping.length === 0 || adoptedRef.current === sid || adoptBusyRef.current) return;
    adoptBusyRef.current = true;
    void adoptLooseShopping(sid, shopping).then((ok) => {
      adoptBusyRef.current = false;
      if (ok) adoptedRef.current = sid;
    });
  }, [viewSpace?.id, shopping, adoptLooseShopping]);

  return {
    shopping,
    setShopping,
    shopLists,
    setShopLists,
    shopSearch,
    activeListId,
    setActiveListId,
    newListOpen,
    setNewListOpen,
    newListTitle,
    setNewListTitle,
    newListItems,
    setNewListItems,
    newListAssignee,
    setNewListAssignee,
    createBusy,
    createError,
    openNewList,
    archOpenId,
    setArchOpenId,
    assignFor,
    setAssignFor,
    assignName,
    setAssignName,
    shopRefreshing,
    setShopRefreshing,
    setShopItemStatus,
    deleteShopList,
    shareShoppingList,
    restoreShopList,
    createManualList,
    adoptLooseShopping,
  };
}
