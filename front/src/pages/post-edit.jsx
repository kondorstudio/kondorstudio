import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { base44 } from "@/apiClient/base44Client";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import { Button } from "@/components/ui/button.jsx";
import { PostForm } from "@/components/posts/postformdialog.jsx";
import Toast from "@/components/ui/toast.jsx";
import useToast from "@/hooks/useToast.js";
import EmptyState from "@/components/ui/empty-state.jsx";

export default function PostEdit() {
  const navigate = useNavigate();
  const { postId } = useParams();
  const { toast, showToast } = useToast();
  const queryClient = useQueryClient();

  const handleCancel = React.useCallback(() => {
    navigate("/posts");
  }, [navigate]);

  const { data: post, isLoading, isError } = useQuery({
    queryKey: ["post", postId],
    queryFn: () => base44.entities.Post.get(postId),
    enabled: Boolean(postId),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const { data: integrations = [] } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => base44.entities.Integration.list(),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Post.update(postId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (error) => {
      const message =
        error?.data?.error ||
        error?.message ||
        "Erro ao salvar o post. Tente novamente.";
      showToast(message, "error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Post.delete(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      navigate("/posts");
    },
    onError: (error) => {
      const message =
        error?.data?.error ||
        error?.message ||
        "Erro ao excluir o post. Tente novamente.";
      if (error?.data?.code === "NETWORK_DELETE_FAILED") {
        showToast(
          "Sem permissao da Meta para excluir na rede. Exclua apenas no Kondor.",
          "error"
        );
        return;
      }
      showToast(message, "error");
    },
  });

  const deleteLocalMutation = useMutation({
    mutationFn: () => base44.entities.Post.deleteLocal(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      navigate("/posts");
    },
    onError: (error) => {
      const message =
        error?.data?.error ||
        error?.message ||
        "Erro ao excluir o post. Tente novamente.";
      showToast(message, "error");
    },
  });

  const handleSubmit = React.useCallback(
    async (data) => {
      return updateMutation.mutateAsync(data);
    },
    [updateMutation]
  );

  const handleSendToApproval = React.useCallback(
    (id) => base44.entities.Post.sendToApproval(id),
    []
  );

  const handleApprovalFeedback = React.useCallback(
    ({ type, message }) => {
      if (message) {
        showToast(message, type || "info");
      }
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    [queryClient, showToast]
  );

  if (!postId) {
    return (
      <PageShell>
        <PageHeader
          title="Editar post"
          subtitle="Ajuste canais, conteudo e agenda em um unico fluxo."
          actions={
            <Button variant="ghost" leftIcon={ArrowLeft} onClick={handleCancel}>
              Voltar para posts
            </Button>
          }
        />
        <EmptyState
          title="Nada para editar por aqui"
          description="O link parece incompleto. Volte para a lista e escolha um post."
          action={
            <Button type="button" variant="ghost" onClick={handleCancel}>
              Voltar para posts
            </Button>
          }
          className="mt-6"
        />
      </PageShell>
    );
  }

  if (isLoading) {
    return (
      <PageShell>
        <PageHeader
          title="Editar post"
          subtitle="Ajuste canais, conteudo e agenda em um unico fluxo."
          actions={
            <Button variant="ghost" leftIcon={ArrowLeft} onClick={handleCancel}>
              Voltar para posts
            </Button>
          }
        />
        <EmptyState
          title="Carregando detalhes do post"
          description="Se estiver demorando, voce pode tentar atualizar."
          action={
            <Button type="button" variant="ghost" onClick={() => window.location.reload()}>
              Atualizar agora
            </Button>
          }
          className="mt-6"
        />
      </PageShell>
    );
  }

  if (isError || !post) {
    return (
      <PageShell>
        <PageHeader
          title="Editar post"
          subtitle="Ajuste canais, conteudo e agenda em um unico fluxo."
          actions={
            <Button variant="ghost" leftIcon={ArrowLeft} onClick={handleCancel}>
              Voltar para posts
            </Button>
          }
        />
        <EmptyState
          title="Post indisponivel"
          description="Ele pode ter sido removido ou movido. Selecione outro post."
          action={
            <Button type="button" variant="ghost" onClick={handleCancel}>
              Voltar para posts
            </Button>
          }
          className="mt-6"
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Editar post"
        subtitle="Ajuste canais, conteudo e agenda em um unico fluxo."
        actions={
          <Button variant="ghost" leftIcon={ArrowLeft} onClick={handleCancel}>
            Voltar para posts
          </Button>
        }
      />

      <div className="mt-6 overflow-hidden rounded-[16px] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
        <PostForm
          open
          showHeader={false}
          onCancel={handleCancel}
          post={post}
          clients={clients}
          integrations={integrations}
          onSubmit={handleSubmit}
          onSendToApproval={handleSendToApproval}
          onApprovalFeedback={handleApprovalFeedback}
          isSaving={updateMutation.isPending}
          onDelete={() => deleteMutation.mutate()}
          onDeleteLocal={() => deleteLocalMutation.mutate()}
          isDeleting={deleteMutation.isPending || deleteLocalMutation.isPending}
        />
      </div>

      <Toast toast={toast} />
    </PageShell>
  );
}
