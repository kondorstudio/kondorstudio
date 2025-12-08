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
          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={formData.title}
              onChange={handleChange("title")}
              placeholder="Ex: Criar criativos da campanha X"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={formData.description}
              onChange={handleChange("description")}
              placeholder="Detalhes da tarefa, contexto, links..."
              rows={4}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <div className="relative" ref={clientMenuRef}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 shadow-sm hover:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 flex items-center justify-between"
                  onClick={() => setClientMenuOpen((prev) => !prev)}
                >
                  <span>
                    {formData.clientId
                      ? clients.find((c) => c.id === formData.clientId)?.name ||
                        "Cliente indefinido"
                      : "Selecione um cliente"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {clientMenuOpen && (
                  <div className="absolute mt-2 w-full max-h-48 overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-xl z-20">
                    {clients.length === 0 && (
                      <p className="text-xs text-gray-400 p-3">
                        Nenhum cliente cadastrado.
                      </p>
                    )}
                    {clients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-purple-50 ${
                          formData.clientId === c.id
                            ? "bg-purple-50 text-purple-700"
                            : "text-gray-700"
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
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 shadow-sm hover:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 flex items-center justify-between"
                  onClick={() => setStatusMenuOpen((prev) => !prev)}
                >
                  <span>
                    {STATUS_OPTIONS.find((s) => s.value === formData.status)
                      ?.label || "Selecione o status"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {statusMenuOpen && (
                  <div className="absolute mt-2 w-full rounded-2xl border border-gray-100 bg-white shadow-xl z-20">
                    {STATUS_OPTIONS.map((status) => (
                      <button
                        key={status.value}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-purple-50 ${
                          formData.status === status.value
                            ? "bg-purple-50 text-purple-700"
                            : "text-gray-700"
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
              <Input
                type="date"
                value={formData.dueDate}
                onChange={handleChange("dueDate")}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-6 sm:flex-row sm:justify-between sm:items-center">
            {task && onDelete && (
              <Button
                type="button"
                className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
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

            <div className="flex gap-3 justify-end w-full sm:w-auto">
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
