import React, { useState } from "react";
import { base44 } from "@/apiClient/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Plus, UserCircle, Mail, Shield } from "lucide-react";
import TeamFormDialog from "../components/team/teamformdialog.jsx";
import { normalizeTeamAccess } from "@/utils/teamAccess";

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
    <div className="p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Equipe</h1>
            <p className="text-gray-600">Gerencie os membros da sua agência</p>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Membro
          </Button>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="h-32 bg-gray-200" />
              </Card>
            ))}
          </div>
        ) : team.length === 0 ? (
          <Card className="border-2 border-dashed border-gray-300">
            <CardContent className="py-16 text-center">
              <UserCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Nenhum membro cadastrado
              </h3>
              <p className="text-gray-600 mb-6">
                Adicione membros da sua equipe
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Primeiro Membro
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {team.map((member) => {
              const canSendInvite =
                !member._raw ||
                !member._raw.user ||
                !member._raw.user.passwordHash;
              const access = normalizeTeamAccess(
                member.permissions || {},
                member._raw?.user?.role || member.role
              );

              return (
                <Card
                  key={member.id}
                  className="hover:shadow-lg transition-shadow"
                >
                  <CardHeader className="bg-gradient-to-br from-purple-50 to-purple-100">
                    <div className="flex items-center gap-4">
                      {member.avatar_url ? (
                        <img
                          src={member.avatar_url}
                          alt={member.name}
                          className="w-16 h-16 rounded-full"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center">
                          <span className="text-white font-bold text-2xl">
                            {member.name[0]}
                          </span>
                        </div>
                      )}
                      <div className="flex-1">
                        <CardTitle className="text-lg">
                          {member.name}
                        </CardTitle>
                        <Badge
                          className={`${roleColors[member.role]} mt-2`}
                          variant="secondary"
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

                    {access && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Shield className="w-4 h-4" />
                          <span className="font-medium">Permissões:</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(access.modules || {})
                            .filter(([_, value]) => value)
                            .map(([key]) => (
                              <Badge
                                key={key}
                                variant="outline"
                                className="text-xs"
                              >
                                {key}
                              </Badge>
                            ))}
                        </div>
                        {access.clientAccess?.scope === "custom" && (
                          <p className="text-xs text-gray-500">
                            Acesso limitado a {access.clientAccess.clientIds?.length || 0} cliente(s)
                          </p>
                        )}
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
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(member.id)}
                        >
                          Remover
                        </Button>
                      </div>
                      {canSendInvite && (
                        <Button
                          size="sm"
                          className="w-full bg-purple-600 hover:bg-purple-700"
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

        <TeamFormDialog
          open={dialogOpen}
          onClose={handleDialogClose}
          member={editingMember}
        />
      </div>
    </div>
  );
}
