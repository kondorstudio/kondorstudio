import React, { useState } from "react";
import { base44 } from "../apiClient/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Building2, Globe, Instagram, Facebook } from "lucide-react";
import ClientFormDialog from "../components/clients/ClientFormDialog";
import ClientCard from "../components/clients/ClientCard";

export default function Clients() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list()
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Client.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    }
  });

  const handleEdit = (client) => {
    setEditingClient(client);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (confirm('Tem certeza que deseja excluir este cliente?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingClient(null);
  };

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Clientes</h1>
            <p className="text-gray-600">Gerencie sua carteira de clientes</p>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Cliente
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <CardTitle className="h-6 bg-gray-200 rounded w-1/2" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 bg-gray-200 rounded mb-2 w-3/4" />
                  <div className="h-4 bg-gray-200 rounded mb-2 w-2/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : clients.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-dashed border-purple-200">
            <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-purple-100 mb-4">
              <Building2 className="w-8 h-8 text-purple-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Nenhum cliente cadastrado
            </h2>
            <p className="text-gray-500 mb-6">
              Comece adicionando seu primeiro cliente para organizar sua operação.
            </p>
            <Button
              onClick={() => setDialogOpen(true)}
              className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Cliente
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        <ClientFormDialog
          open={dialogOpen}
          onClose={handleDialogClose}
          client={editingClient}
        />
      </div>
    </div>
  );
}
