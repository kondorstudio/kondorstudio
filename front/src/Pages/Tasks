import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "../apiClient/base44Client";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Taskboard from "../components/tasks/Taskboard";
import TaskFormDialog from "../components/tasks/TaskFormDialog";

export default function Tasks() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list(),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

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
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
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
    const payload = {
      title: data.title,
      description: data.description || "",
      clientId: data.clientId || null,
      status: data.status || "TODO",
      dueDate: data.dueDate || null,
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

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Tarefas</h1>
            <p className="text-gray-600">
              Organize o fluxo de trabalho da sua agência
            </p>
          </div>
          <Button
            onClick={handleNew}
            className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Tarefa
          </Button>
        </div>

        <Taskboard
          tasks={tasks}
          clients={clients}
          isLoading={isLoading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
        />

        <TaskFormDialog
          open={dialogOpen}
          onClose={handleCloseDialog}
          task={editingTask}
          clients={clients}
          onSubmit={handleSubmitForm}
          isSaving={saveMutation.isPending}
        />
      </div>
    </div>
  );
}
