"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { FecButton as Button } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { parseChecklist } from "@/lib/training/engine";

type Item = { id: string; label: string; required: boolean };

export function PracticalChecklistEditor({
  body,
  disabled,
  onSave,
}: {
  body: string | null;
  disabled: boolean;
  onSave: (body: string) => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Item[]>([]);
  const [label, setLabel] = useState("");

  useEffect(() => {
    setItems(parseChecklist(body));
  }, [body]);

  function move(index: number, direction: -1 | 1) {
    const next = [...items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
  }

  return (
    <div className="grid gap-2 rounded-xl border border-border p-3">
      <p className="text-sm font-medium">{t("trainingCourses.practicalChecklist")}</p>
      <ol className="grid gap-2">
        {items.map((item, index) => (
          <li key={item.id} className="grid gap-2 rounded-lg border border-border p-2 md:grid-cols-[1fr_auto]">
            <Input
              value={item.label}
              disabled={disabled}
              aria-label={t("trainingCourses.practicalItem")}
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, label: event.target.value };
                setItems(next);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-h-12 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={item.required}
                  disabled={disabled}
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = { ...item, required: event.target.checked };
                    setItems(next);
                  }}
                />
                {t("trainingCourses.practicalRequiredItem")}
              </label>
              <Button type="button" variant="outline" className="min-h-12" disabled={disabled || index === 0} onClick={() => move(index, -1)}>{t("trainingCourses.up")}</Button>
              <Button type="button" variant="outline" className="min-h-12" disabled={disabled || index === items.length - 1} onClick={() => move(index, 1)}>{t("trainingCourses.down")}</Button>
              <Button type="button" variant="outline" className="min-h-12" disabled={disabled} onClick={() => setItems(items.filter((row) => row.id !== item.id))}>{t("trainingCourses.remove")}</Button>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2 md:flex-row">
        <Input
          value={label}
          disabled={disabled}
          placeholder={t("trainingCourses.practicalItem")}
          aria-label={t("trainingCourses.practicalItem")}
          onChange={(event) => setLabel(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          className="min-h-12"
          disabled={disabled || !label.trim()}
          onClick={() => {
            setItems([...items, { id: crypto.randomUUID(), label: label.trim(), required: true }]);
            setLabel("");
          }}
        >
          {t("trainingCourses.practicalAdd")}
        </Button>
      </div>
      <Button
        type="button"
        className="min-h-12"
        disabled={disabled}
        onClick={() => onSave(JSON.stringify(items.filter((item) => item.label.trim()).map((item) => ({ id: item.id, label: item.label.trim(), required: item.required }))))}
      >
        {t("trainingCourses.practicalSave")}
      </Button>
    </div>
  );
}
