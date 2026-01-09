import React, { useState } from "react";
import { base44 } from "../apiClient/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button.jsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.jsx";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import EmptyState from "@/components/ui/empty-state.jsx";
import { Plus, Building2 } from "lucide-react";
import ClientFormDialog from "../components/clients/clientformdialog.jsx";
import ClientCard from "../components/clients/clientcard.jsx";

export default function Clients() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [lastPortalPassword, setLastPortalPassword] = useState("");
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, data }) => {
      if (id) {
        return base44.entities.Client.update(id, data);
      }
      return base44.entities.Client.create(data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      if (!lastPortalPassword && result?.portalCredentials?.password) {
        const { email, password } = result.portalCredentials;
        alert(
          `Acesso do cliente gerado:\nEmail: ${email}\nSenha provisória: ${password}`
        );
      }
      setLastPortalPassword("");
      handleDialogClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Client.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });

  const handleEdit = (client) => {
    setEditingClient(client);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (confirm("Tem certeza que deseja excluir este cliente?")) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingClient(null);
    setLastPortalPassword("");
  };

  const handleFormSubmit = async (data) => {
    try {
      setLastPortalPassword(data.portalPassword || "");
      await saveMutation.mutateAsync({
        id: editingClient?.id ?? null,
        data,
      });
    } catch (err) {
      console.error("Erro ao salvar cliente:", err);
      alert(err?.message || "Não foi possível salvar o cliente.");
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Clientes"
        subtitle="Construa e acompanhe sua carteira com contexto."
        actions={
          <Button size="lg" leftIcon={Plus} onClick={() => setDialogOpen(true)}>
            Adicionar cliente
          </Button>
        }
      />

      <div className="mt-8">
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
          <EmptyState
            title="Sua carteira esta vazia"
            description="Cadastre um cliente para comecar a organizar projetos e entregas."
            icon={Building2}
            action={
              <Button leftIcon={Plus} onClick={() => setDialogOpen(true)}>
                Cadastrar cliente
              </Button>
            }
          />
        ) : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
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
      </div>

      <ClientFormDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        client={editingClient}
        onSubmit={handleFormSubmit}
        submitting={saveMutation.isLoading}
      />
    </PageShell>
  );
}
