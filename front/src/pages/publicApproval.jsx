import React, { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import { Button } from "@/components/ui/button.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PublicApproval() {
  const { token } = useParams();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-approval", token],
    queryFn: () => base44.entities.PublicApprovals.getPublicApproval(token),
    enabled: Boolean(token),
  });

  const approval = data?.approval || null;
  const post = data?.post || null;
  const client = data?.client || null;

  const status = approval?.status || null;
  const isPending = status === "PENDING";
  const isApproved = status === "APPROVED";
  const isRejected = status === "REJECTED";

  const mediaPreview = useMemo(() => {
    if (!post?.mediaUrl) return null;
    return {
      url: post.mediaUrl,
      type: post.mediaType || "image",
    };
  }, [post]);

  const refreshData = () =>
    queryClient.invalidateQueries({ queryKey: ["public-approval", token] });

  const approveMutation = useMutation({
    mutationFn: () => base44.entities.PublicApprovals.publicApprove(token),
    onSuccess: () => {
      setMessage("Aprovado com sucesso!");
      refreshData();
    },
    onError: (err) => {
      setMessage(err?.data?.error || "Falha ao aprovar.");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      base44.entities.PublicApprovals.publicReject(token, {
        notes: note?.trim() || undefined,
      }),
    onSuccess: () => {
      setMessage("Rejeitado.");
      refreshData();
    },
    onError: (err) => {
      setMessage(err?.data?.error || "Falha ao rejeitar.");
    },
  });

  const changesMutation = useMutation({
    mutationFn: () =>
      base44.entities.PublicApprovals.publicRequestChanges(token, {
        message: note?.trim(),
      }),
    onSuccess: () => {
      setMessage("Solicitação enviada.");
      refreshData();
    },
    onError: (err) => {
      setMessage(err?.data?.error || "Falha ao solicitar ajustes.");
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        Carregando...
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Link de aprovação inválido
          </h1>
          <p className="text-sm text-gray-600">
            Este link pode ter expirado ou já foi utilizado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Aprovação de post
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">
              {post.title || "Post sem título"}
            </h1>
            {client?.name ? (
              <p className="text-sm text-slate-500">Cliente: {client.name}</p>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 overflow-hidden flex items-center justify-center">
              {mediaPreview ? (
                mediaPreview.type === "video" ? (
                  <video src={mediaPreview.url} controls className="w-full h-full object-cover" />
                ) : (
                  <img
                    src={mediaPreview.url}
                    alt="Preview do post"
                    className="w-full h-full object-cover"
                  />
                )
              ) : (
                <div className="p-8 text-sm text-slate-400">
                  Nenhuma mídia disponível.
                </div>
              )}
            </div>

            <div className="space-y-3 text-sm text-slate-600">
              <div>
                <p className="text-xs uppercase text-slate-400">Status</p>
                <p className="font-medium text-slate-900">
                  {isApproved ? "Aprovado" : isRejected ? "Rejeitado" : "Pendente"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-400">Agendamento</p>
                <p className="font-medium text-slate-900">
                  {formatDateTime(post.scheduledDate || post.scheduledAt)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-400">Legenda</p>
                <p className="whitespace-pre-line">{post.caption || "-"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200 space-y-4">
          <div>
            <p className="text-sm text-slate-600">
              Se precisar de ajustes, descreva abaixo. Você também pode aprovar ou recusar.
            </p>
          </div>

          <Textarea
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Escreva o que precisa ser ajustado..."
            disabled={!isPending}
          />

          {message ? <p className="text-sm text-slate-600">{message}</p> : null}

          <div className="flex flex-wrap gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => changesMutation.mutate()}
              disabled={!isPending || changesMutation.isPending || note.trim().length < 3}
            >
              {changesMutation.isPending ? "Enviando..." : "Solicitar ajustes"}
            </Button>
            <Button
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => {
                if (window.confirm("Tem certeza que deseja rejeitar este post?")) {
                  rejectMutation.mutate();
                }
              }}
              disabled={!isPending || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? "Rejeitando..." : "Rejeitar"}
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700"
              onClick={() => approveMutation.mutate()}
              disabled={!isPending || approveMutation.isPending}
            >
              {approveMutation.isPending ? "Aprovando..." : "Aprovar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
