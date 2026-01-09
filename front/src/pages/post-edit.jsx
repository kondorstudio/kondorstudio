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
      navigate("/posts");
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
      showToast(message, "error");
    },
  });

  const handleSubmit = React.useCallback(
    async (data) => {
      await updateMutation.mutateAsync(data);
    },
    [updateMutation]
  );

  if (!postId) {
    return (
      <PageShell>
        <PageHeader
          title="Editar post"
          subtitle="Configure perfis, canais, conteudo e agendamento."
          actions={
            <Button variant="ghost" leftIcon={ArrowLeft} onClick={handleCancel}>
              Voltar
            </Button>
          }
        />
        <EmptyState
          title="Post nao encontrado"
          description="Nao foi possivel localizar o post solicitado."
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
          subtitle="Configure perfis, canais, conteudo e agendamento."
          actions={
            <Button variant="ghost" leftIcon={ArrowLeft} onClick={handleCancel}>
              Voltar
            </Button>
          }
        />
        <EmptyState
          title="Carregando post"
          description="Aguarde enquanto carregamos os detalhes."
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
          subtitle="Configure perfis, canais, conteudo e agendamento."
          actions={
            <Button variant="ghost" leftIcon={ArrowLeft} onClick={handleCancel}>
              Voltar
            </Button>
          }
        />
        <EmptyState
          title="Post nao encontrado"
          description="Verifique se o post ainda existe ou tente novamente."
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
        subtitle="Configure perfis, canais, conteudo e agendamento."
        actions={
          <Button variant="ghost" leftIcon={ArrowLeft} onClick={handleCancel}>
            Voltar
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
          isSaving={updateMutation.isPending}
          onDelete={() => deleteMutation.mutate()}
          isDeleting={deleteMutation.isPending}
        />
      </div>

      <Toast toast={toast} />
    </PageShell>
  );
}
