import React, { useState } from "react";
import { base44 } from "@/apiClient/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import EmptyState from "@/components/ui/empty-state.jsx";
import { Plus, UserCircle, Mail, Shield } from "lucide-react";
import TeamFormDialog from "../components/team/teamformdialog.jsx";

const roleLabels = {
  admin: "Administrador",
  traffic_manager: "Gestor de Tráfego",
  designer: "Designer",
  social_media: "Social Media",
  copywriter: "Copywriter",
  videomaker: "Videomaker",
};

const roleColors = {
  admin: "bg-purple-100 text-purple-700",
  traffic_manager: "bg-blue-100 text-blue-700",
  designer: "bg-pink-100 text-pink-700",
  social_media: "bg-green-100 text-green-700",
  copywriter: "bg-yellow-100 text-yellow-700",
  videomaker: "bg-orange-100 text-orange-700",
};

export default function Team() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const queryClient = useQueryClient();

  const { data: team = [], isLoading } = useQuery({
    queryKey: ["team"],
    queryFn: () => base44.entities.TeamMember.list("-created_date"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TeamMember.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: (id) =>
      base44.jsonFetch(`/team/${id}/send-invite`, {
        method: "POST",
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      if (data && data.tempPassword) {
        alert(`Senha temporária gerada:\n\n${data.tempPassword}`);
      } else {
        alert("Convite gerado com sucesso.");
      }
    },
  });

  const handleEdit = (member) => {
    setEditingMember(member);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (confirm("Tem certeza que deseja remover este membro?")) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleSendInvite = async (member) => {
    await inviteMutation.mutateAsync(member.id);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingMember(null);
  };

  return (
    <PageShell>
      <PageHeader
        title="Equipe"
        subtitle="Monte o time certo para cada entrega."
        actions={
          <Button size="lg" leftIcon={Plus} onClick={() => setDialogOpen(true)}>
            Convidar membro
          </Button>
        }
      />

      <div className="mt-8">
        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="h-32 bg-gray-200" />
              </Card>
            ))}
          </div>
        ) : team.length === 0 ? (
          <EmptyState
            title="Equipe em branco"
            description="Convide pelo menos um membro para distribuir tarefas e aprovacoes."
            icon={UserCircle}
            action={
              <Button leftIcon={Plus} onClick={() => setDialogOpen(true)}>
                Convidar membro
              </Button>
            }
          />
          ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {team.map((member) => {
              const canSendInvite =
                !member._raw ||
                !member._raw.user ||
                !member._raw.user.passwordHash;

              return (
                <Card key={member.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="bg-[var(--surface-muted)]">
                    <div className="flex items-center gap-4">
                      {member.avatar_url ? (
                        <img
                          src={member.avatar_url}
                          alt={member.name}
                          className="w-16 h-16 rounded-full"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-[var(--primary)] flex items-center justify-center">
                          <span className="text-white font-bold text-2xl">
                            {member.name[0]}
                          </span>
                        </div>
                      )}
                      <div className="flex-1">
                        <CardTitle className="text-lg">{member.name}</CardTitle>
                        <Badge
                          className={`${roleColors[member.role]} mt-2`}
                          variant="default"
                        >
                          {roleLabels[member.role] || member.role}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="w-4 h-4" />
                      <span>{member.email}</span>
                    </div>

                    {member.permissions && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Shield className="w-4 h-4" />
                          <span className="font-medium">Permissoes:</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(member.permissions)
                            .filter(([_, value]) => value)
                            .map(([key]) => (
                              <Badge key={key} variant="outline" className="text-xs">
                                {key}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-2 pt-4">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleEdit(member)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => handleDelete(member.id)}
                        >
                          Remover
                        </Button>
                      </div>
                      {canSendInvite && (
                        <Button
                          size="sm"
                          disabled={inviteMutation.isPending}
                          onClick={() => handleSendInvite(member)}
                        >
                          {inviteMutation.isPending
                            ? "Gerando convite..."
                            : "Enviar convite"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <TeamFormDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        member={editingMember}
      />
    </PageShell>
  );
}
