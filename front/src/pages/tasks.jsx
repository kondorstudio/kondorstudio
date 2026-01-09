import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import { Button } from "@/components/ui/button.jsx";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import { Plus } from "lucide-react";
import Taskboard from "../components/tasks/taskboard.jsx";
import Taskformdialog from "../components/tasks/taskformdialog.jsx";
import { useActiveClient } from "@/hooks/useActiveClient.js";

const TASKS_COLLAPSE_KEY = "kondor_tasks_kanban_collapsed";

const loadCollapsedColumns = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TASKS_COLLAPSE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
};

const persistCollapsedColumns = (value) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      TASKS_COLLAPSE_KEY,
      JSON.stringify(value || {})
    );
  } catch (err) {
    return;
  }
};

export default function Tasks() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [collapsedColumns, setCollapsedColumns] = useState(() =>
    loadCollapsedColumns()
  );
  const [activeClientId] = useActiveClient();
  const queryClient = useQueryClient();

  const showError = (error, fallback = "Erro ao processar a tarefa. Tente novamente.") => {
    const message =
      error?.data?.error ||
      error?.message ||
      error?.response?.data?.error ||
      fallback;
    alert(message);
  };

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list(),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  useEffect(() => {
    persistCollapsedColumns(collapsedColumns);
  }, [collapsedColumns]);

  const saveMutation = useMutation({
    mutationFn: ({ id, data }) =>
      id
        ? base44.entities.Task.update(id, data)
        : base44.entities.Task.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setDialogOpen(false);
      setEditingTask(null);
    },
    onError: (error) =>
      showError(error, "Não foi possível salvar a tarefa. Tente novamente."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setDialogOpen(false);
      setEditingTask(null);
    },
    onError: (error) =>
      showError(error, "Não foi possível excluir a tarefa. Tente novamente."),
  });

  const handleNew = () => {
    setEditingTask(null);
    setDialogOpen(true);
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (confirm("Tem certeza que deseja excluir esta tarefa?")) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleStatusChange = (id, status) => {
    saveMutation.mutate({
      id,
      data: { status },
    });
  };

  const handleSubmitForm = (data) => {
    if (!data.title || !data.title.trim()) {
      alert("Informe um título para a tarefa.");
      return;
    }

    const payload = {
      title: data.title,
      description: data.description || "",
      status: data.status || "TODO",
      dueDate: data.dueDate ? new Date(data.dueDate).toISOString() : null,
    };

    saveMutation.mutate({
      id: editingTask?.id || null,
      data: payload,
    });
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingTask(null);
  };

  const filteredTasks = activeClientId
    ? tasks.filter((task) => task.clientId === activeClientId)
    : tasks;

  return (
    <PageShell>
      <PageHeader
        title="Tarefas"
        subtitle="Mantenha o time alinhado e as entregas no prazo."
        actions={
          <Button size="lg" leftIcon={Plus} onClick={handleNew}>
            Criar tarefa
          </Button>
        }
      />

      <div className="mt-8">
        <Taskboard
          tasks={filteredTasks}
          clients={clients}
          isLoading={isLoading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          collapsedColumns={collapsedColumns}
          onCollapsedChange={setCollapsedColumns}
          onCreate={handleNew}
        />
      </div>

      <Taskformdialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onSubmit={handleSubmitForm}
        task={editingTask}
        clients={clients}
        isSaving={saveMutation.isPending}
        onDelete={
          editingTask ? () => handleDelete(editingTask.id) : undefined
        }
        isDeleting={deleteMutation.isPending}
      />
    </PageShell>
  );
}
