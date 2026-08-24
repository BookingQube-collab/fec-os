"use client";

import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";

import { useI18nOverrides, useSaveI18nOverride } from "@/hooks/queries/useI18nOverrides";
import { useAuth } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import { flattenResources, normalizeLabel } from "@/i18n/overlay";
import { applyResourceOverlay } from "@/i18n";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const EDIT_MODE_KEY = "fec-os-i18n-edit";

type EditorState = {
  keys: string[];
  key: string;
  x: number;
  y: number;
  value: string;
};

type TranslationEditContextValue = {
  canEdit: boolean;
  editMode: boolean;
  setEditMode: (on: boolean) => void;
};

const TranslationEditContext = createContext<TranslationEditContextValue>({
  canEdit: false,
  editMode: false,
  setEditMode: () => {},
});

export function useTranslationEdit() {
  return useContext(TranslationEditContext);
}

function readEditMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(EDIT_MODE_KEY) === "1";
}

function isIgnoredTarget(el: Element | null): boolean {
  if (!el) return true;
  if (el.closest("#i18n-edit-popover, input, textarea, select, [contenteditable='true']")) return true;
  return false;
}

function collectLabel(el: Element): string {
  const attr = el.getAttribute("data-i18n-key");
  if (attr) return "";
  const text = normalizeLabel(el.textContent ?? "");
  return text;
}

class TranslationEditBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("[TranslationEditProvider]", error);
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

export function TranslationEditProvider({ children }: { children: ReactNode }) {
  return (
    <TranslationEditBoundary
      fallback={
        <TranslationEditContext.Provider value={{ canEdit: false, editMode: false, setEditMode: () => {} }}>
          {children}
        </TranslationEditContext.Provider>
      }
    >
      <TranslationEditProviderInner>{children}</TranslationEditProviderInner>
    </TranslationEditBoundary>
  );
}

function TranslationEditProviderInner({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const canEdit = usePermission("admin.view");
  const [editMode, setEditModeState] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [hoverEl, setHoverEl] = useState<Element | null>(null);

  const overlays = useI18nOverrides("ar", { enabled: !!user });
  const save = useSaveI18nOverride();

  useEffect(() => {
    setEditModeState(readEditMode());
  }, []);

  useEffect(() => {
    const items = overlays.data?.items;
    if (!items) return;
    applyResourceOverlay("ar", items);
  }, [overlays.data?.items]);

  const setEditMode = useCallback((on: boolean) => {
    setEditModeState(on);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(EDIT_MODE_KEY, on ? "1" : "0");
    }
    if (!on) {
      setEditor(null);
      setHoverEl(null);
    }
  }, []);

  const reverseIndex = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!editMode || !canEdit) return map;
    const addBundle = (lng: string) => {
      const bundle = i18n.getResourceBundle(lng, "translation") as object | undefined;
      const flat = flattenResources(bundle);
      for (const [key, value] of Object.entries(flat)) {
        const label = normalizeLabel(value);
        if (!label) continue;
        const list = map.get(label) ?? [];
        if (!list.includes(key)) list.push(key);
        map.set(label, list);
      }
    };
    addBundle("en");
    addBundle("ar");
    return map;
  }, [i18n, overlays.data, editMode, canEdit]);

  const lookupKeys = useCallback(
    (el: Element): string[] => {
      const marked = el.closest("[data-i18n-key]")?.getAttribute("data-i18n-key");
      if (marked) return [marked];
      let node: Element | null = el;
      for (let i = 0; i < 6 && node; i += 1) {
        const label = collectLabel(node);
        if (label && label.length <= 180) {
          const keys = reverseIndex.get(label);
          if (keys?.length) return keys;
        }
        node = node.parentElement;
      }
      return [];
    },
    [reverseIndex],
  );

  useEffect(() => {
    if (!editMode || !canEdit) return;

    const onMove = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target || isIgnoredTarget(target)) {
        setHoverEl(null);
        return;
      }
      const keys = lookupKeys(target);
      setHoverEl(keys.length ? (target.closest("[data-i18n-key]") ?? target) : null);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target || isIgnoredTarget(target)) return;
      const keys = lookupKeys(target);
      if (!keys.length) return;
      event.preventDefault();
      event.stopPropagation();
      const key = keys[0];
      const current = i18n.getResource("ar", "translation", key);
      setEditor({
        keys,
        key,
        x: Math.min(event.clientX, window.innerWidth - 340),
        y: Math.min(event.clientY + 8, window.innerHeight - 260),
        value: typeof current === "string" ? current : "",
      });
    };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [editMode, canEdit, lookupKeys, i18n]);

  useEffect(() => {
    if (!hoverEl || !editMode) return;
    const prev = (hoverEl as HTMLElement).style.outline;
    (hoverEl as HTMLElement).style.outline = "1px dashed color-mix(in oklab, var(--primary) 70%, transparent)";
    (hoverEl as HTMLElement).style.outlineOffset = "2px";
    (hoverEl as HTMLElement).style.cursor = "text";
    return () => {
      (hoverEl as HTMLElement).style.outline = prev;
      (hoverEl as HTMLElement).style.outlineOffset = "";
      (hoverEl as HTMLElement).style.cursor = "";
    };
  }, [hoverEl, editMode]);

  const value = useMemo(
    () => ({ canEdit, editMode: canEdit && editMode, setEditMode }),
    [canEdit, editMode, setEditMode],
  );

  return (
    <TranslationEditContext.Provider value={value}>
      {children}
      {editor && canEdit && editMode ? (
        <div
          id="i18n-edit-popover"
          className="fixed z-[200] w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-card p-3 shadow-elevated-md"
          style={{ left: editor.x, top: editor.y }}
        >
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
            <Pencil className="h-3.5 w-3.5" />
            {t("i18n.editTitle")}
          </div>
          {editor.keys.length > 1 ? (
            <SearchableSelect
              value={editor.key}
              onValueChange={(key) => {
                const current = i18n.getResource("ar", "translation", key);
                setEditor((s) =>
                  s ? { ...s, key, value: typeof current === "string" ? current : "" } : s,
                );
              }}
              options={editor.keys.map((k) => ({ value: k, label: k }))}
              triggerClassName="mb-2 h-8 min-h-8 px-2 text-xs font-normal"
            />
          ) : (
            <p className="mb-2 truncate font-mono text-[10px] text-muted-foreground" title={editor.key}>
              {editor.key}
            </p>
          )}
          <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("i18n.arabicValue")}
          </label>
          <Textarea
            dir="rtl"
            lang="ar"
            rows={4}
            value={editor.value}
            onChange={(e) => setEditor((s) => (s ? { ...s, value: e.target.value } : s))}
            className="mb-3 text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditor(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={save.isPending || !editor.value.trim()}
              onClick={async () => {
                const result = await save.mutateAsync({
                  locale: "ar",
                  key: editor.key,
                  value: editor.value,
                });
                if (result?.item) {
                  applyResourceOverlay("ar", [result.item]);
                }
                void i18n.changeLanguage(i18n.language);
                setEditor(null);
              }}
            >
              {save.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      ) : null}
    </TranslationEditContext.Provider>
  );
}

export function TranslationEditMenuItem() {
  const { t } = useTranslation();
  const { canEdit, editMode, setEditMode } = useTranslationEdit();
  if (!canEdit) return null;
  return (
    <button
      type="button"
      className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-secondary"
      onClick={() => setEditMode(!editMode)}
    >
      <Pencil className="me-2 h-4 w-4" />
      {t("i18n.editTranslations")}
      {editMode ? ` · ${t("i18n.on")}` : ""}
    </button>
  );
}

export function TranslationEditToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { canEdit, editMode, setEditMode } = useTranslationEdit();
  if (!canEdit) return null;
  return (
    <button
      type="button"
      onClick={() => setEditMode(!editMode)}
      className={cn(className, editMode && "border-amber-300/80 text-amber-700")}
      title={t("i18n.editTranslations")}
    >
      <Pencil className="h-4 w-4 stroke-[1.5]" />
      <span className="sr-only">{t("i18n.editTranslations")}</span>
    </button>
  );
}
