"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  title: string;
  value: string;
  onChange: (value: string) => void;
}

export function PromptEditorDialog({ title, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  function handleOpen(isOpen: boolean) {
    if (isOpen) setDraft(value);
    setOpen(isOpen);
  }

  function handleSave() {
    onChange(draft);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        Modifier →
      </DialogTrigger>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <textarea
          className="flex-1 w-full font-mono text-sm p-3 border border-input rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button type="button" onClick={handleSave}>
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
