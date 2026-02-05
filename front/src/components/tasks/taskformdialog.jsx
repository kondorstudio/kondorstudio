import React, { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Label } from "@/components/ui/label.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";
import { FormGrid, FormSection } from "@/components/ui/form.jsx";
import { DateField } from "@/components/ui/date-field.jsx";
import { ChevronDown } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "TODO", label: "A fazer" },
  { value: "IN_PROGRESS", label: "Em andamento" },
  { value: "REVIEW", label: "Revisão" },
  { value: "DONE", label: "Concluída" },
  { value: "BLOCKED", label: "Bloqueada" },
];

export default function Taskformdialog({
  open,
  onClose,
  task,
  clients = [],
  onSubmit,
  isSaving = false,
  onDelete,
  isDeleting = false,
}) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    clientId: "",
    status: "TODO",
    dueDate: "",
  });
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const clientMenuRef = useRef(null);
  const statusMenuRef = useRef(null);

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title || "",
        description: task.description || "",
        clientId: task.clientId || "",
        status: task.status || "TODO",
        dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
      });
    } else {
      setFormData({
        title: "",
        description: "",
        clientId: "",
        status: "TODO",
        dueDate: "",
      });
    }
  }, [task, open]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        clientMenuRef.current &&
        !clientMenuRef.current.contains(event.target)
      ) {
        setClientMenuOpen(false);
      }
      if (
        statusMenuRef.current &&
        !statusMenuRef.current.contains(event.target)
      ) {
        setStatusMenuOpen(false);
      }
    }
    if (clientMenuOpen || statusMenuOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [clientMenuOpen, statusMenuOpen]);

  const handleChange = (field) => (e) => {
    const value = e?.target ? e.target.value : e;
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert("Informe um título para a tarefa.");
      return;
    }
    if (onSubmit) {
      onSubmit(formData);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {task ? "Editar Tarefa" : "Nova Tarefa"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <FormSection title="Detalhes da tarefa" description="Defina escopo e contexto.">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Titulo</Label>
                <Input
                  value={formData.title}
                  onChange={handleChange("title")}
                  placeholder="Ex: Criar criativos da campanha X"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Descricao</Label>
                <Textarea
                  value={formData.description}
                  onChange={handleChange("description")}
                  placeholder="Detalhes da tarefa, contexto, links..."
                  rows={4}
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Planejamento" description="Cliente, status e prazo.">
            <FormGrid>
              <div className="space-y-2">
                <Label>Cliente</Label>
                <div className="relative" ref={clientMenuRef}>
                  <button
                    type="button"
                    className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-left text-sm text-[var(--text)] shadow-sm transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:border-slate-200/80 hover:bg-[var(--surface-muted)] focus:outline-none focus:ring-2 focus:ring-[rgba(var(--primary-rgb),0.2)] flex items-center justify-between"
                    onClick={() => setClientMenuOpen((prev) => !prev)}
                  >
                    <span>
                      {formData.clientId
                        ? clients.find((c) => c.id === formData.clientId)?.name ||
                          "Cliente indefinido"
                        : "Selecione um cliente"}
                    </span>
                    <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                  </button>
                  {clientMenuOpen && (
                    <div className="absolute mt-2 w-full max-h-48 overflow-y-auto rounded-[12px] border border-[var(--border)] bg-white shadow-[var(--shadow-md)] z-20 animate-fade-in-up">
                      {clients.length === 0 && (
                        <div className="p-3 text-xs text-[var(--text-muted)]">
                          <p>Nenhum cliente cadastrado ainda.</p>
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof window !== "undefined") {
                                window.location.href = "/clients";
                              }
                            }}
                            className="mt-2 inline-flex items-center rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[11px] font-semibold text-[var(--text)] shadow-[var(--shadow-sm)]"
                          >
                            Cadastrar cliente
                          </button>
                        </div>
                      )}
                      {clients.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--primary-light)] ${
                            formData.clientId === c.id
                              ? "bg-[var(--primary-light)] text-[var(--primary)]"
                              : "text-[var(--text)]"
                          }`}
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, clientId: c.id }));
                            setClientMenuOpen(false);
                          }}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <div className="relative" ref={statusMenuRef}>
                  <button
                    type="button"
                    className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-left text-sm text-[var(--text)] shadow-sm transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:border-slate-200/80 hover:bg-[var(--surface-muted)] focus:outline-none focus:ring-2 focus:ring-[rgba(var(--primary-rgb),0.2)] flex items-center justify-between"
                    onClick={() => setStatusMenuOpen((prev) => !prev)}
                  >
                    <span>
                      {STATUS_OPTIONS.find((s) => s.value === formData.status)
                        ?.label || "Selecione o status"}
                    </span>
                    <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                  </button>
                  {statusMenuOpen && (
                    <div className="absolute mt-2 w-full rounded-[12px] border border-[var(--border)] bg-white shadow-[var(--shadow-md)] z-20 animate-fade-in-up">
                      {STATUS_OPTIONS.map((status) => (
                        <button
                          key={status.value}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--primary-light)] ${
                            formData.status === status.value
                              ? "bg-[var(--primary-light)] text-[var(--primary)]"
                              : "text-[var(--text)]"
                          }`}
                          onClick={() => {
                            setFormData((prev) => ({
                              ...prev,
                              status: status.value,
                            }));
                            setStatusMenuOpen(false);
                          }}
                        >
                          {status.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Prazo</Label>
                <DateField
                  value={formData.dueDate}
                  onChange={handleChange("dueDate")}
                />
              </div>
            </FormGrid>
          </FormSection>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
            {task && onDelete && (
              <Button
                type="button"
                className="bg-red-600 hover:bg-red-700"
                disabled={isSaving || isDeleting}
                onClick={() => {
                  if (
                    !isDeleting &&
                    window.confirm("Deseja excluir esta tarefa?")
                  ) {
                    onDelete();
                  }
                }}
              >
                {isDeleting ? "Excluindo..." : "Excluir tarefa"}
              </Button>
            )}

            <div className="flex gap-3 ml-auto">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSaving || isDeleting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-purple-600 hover:bg-purple-700"
                disabled={isSaving || isDeleting}
              >
                {isSaving
                  ? "Salvando..."
                  : task
                  ? "Atualizar Tarefa"
                  : "Criar Tarefa"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
