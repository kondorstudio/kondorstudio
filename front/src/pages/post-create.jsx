import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { base44 } from "@/apiClient/base44Client";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import { Button } from "@/components/ui/button.jsx";
import { PostForm } from "@/components/posts/postformdialog.jsx";
import Toast from "@/components/ui/toast.jsx";
import useToast from "@/hooks/useToast.js";
import { useActiveClient } from "@/hooks/useActiveClient.js";

function parseScheduleDate(value) {
  if (!value) return null;
  const safeValue = `${value}T00:00:00`;
  const date = new Date(safeValue);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export default function PostCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeClientId, setActiveClientId] = useActiveClient();
  const { toast, showToast } = useToast();
  const queryClient = useQueryClient();

  const clientParam = searchParams.get("clientId") || "";
  const dateParam = searchParams.get("date") || "";
  const initialScheduleDate = React.useMemo(
    () => parseScheduleDate(dateParam),
    [dateParam]
  );

  React.useEffect(() => {
    if (clientParam && clientParam !== activeClientId) {
      setActiveClientId(clientParam);
    }
  }, [clientParam, activeClientId, setActiveClientId]);

  const defaultClientId = clientParam || activeClientId || "";

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const { data: integrations = [] } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => base44.entities.Integration.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Post.create(data),
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

  const handleSubmit = React.useCallback(
    (data) => {
      createMutation.mutate(data);
    },
    [createMutation]
  );

  const handleCancel = React.useCallback(() => {
    navigate("/posts");
  }, [navigate]);

  return (
    <PageShell>
      <PageHeader
        title="Criar post"
        subtitle="Defina canais, conteudo e agenda em um unico fluxo."
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
          post={null}
          defaultClientId={defaultClientId}
          initialScheduleDate={initialScheduleDate}
          clients={clients}
          integrations={integrations}
          onSubmit={handleSubmit}
          isSaving={createMutation.isPending}
        />
      </div>

      <Toast toast={toast} />
    </PageShell>
  );
}
