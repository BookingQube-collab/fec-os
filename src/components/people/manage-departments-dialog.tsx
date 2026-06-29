"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  createMasterDepartment,
  updateMasterDepartment,
} from "@/lib/people.functions";
import { useMasterDepartments } from "@/hooks/queries/useDepartments";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ManageDepartmentsDialog({ trigger }: { trigger?: React.ReactNode }) {
  const qc = useQueryClient();
  const { data: departments = [], isLoading } = useMasterDepartments();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");

  const invalidate = () => void qc.invalidateQueries({ queryKey: queryKeys.people.departments() });

  const createMut = useMutation({
    mutationFn: () =>
      createMasterDepartment({
        name: newName.trim(),
        code: newCode.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Department added");
      setNewName("");
      setNewCode("");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { id: string; name?: string; code?: string | null; active?: boolean; sortOrder?: number }) =>
      updateMasterDepartment(payload),
    onSuccess: () => {
      toast.success("Department updated");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs">
            <Settings2 className="mr-1 h-3 w-3" />
            Manage departments
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Master departments</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <div>
              <Label className="text-xs">New department</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Battle Arena"
              />
            </div>
            <div>
              <Label className="text-xs">Code</Label>
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="Optional"
                className="w-24"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                size="sm"
                onClick={() => createMut.mutate()}
                disabled={!newName.trim() || createMut.isPending}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-center">Active</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-xs text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : (
                  [...departments]
                    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
                    .map((d) => (
                      <tr key={d.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <Input
                            defaultValue={d.name}
                            className="h-8"
                            onBlur={(e) => {
                              const name = e.target.value.trim();
                              if (name && name !== d.name) updateMut.mutate({ id: d.id, name });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            defaultValue={d.code ?? ""}
                            className="h-8 w-24"
                            onBlur={(e) => {
                              const code = e.target.value.trim().toUpperCase() || null;
                              if (code !== (d.code ?? null)) updateMut.mutate({ id: d.id, code });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Checkbox
                            checked={d.active}
                            onCheckedChange={(v) => updateMut.mutate({ id: d.id, active: !!v })}
                          />
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
