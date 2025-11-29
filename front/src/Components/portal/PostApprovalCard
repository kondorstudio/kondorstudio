import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle,
  XCircle,
  MessageSquare,
  Image,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * FASE 3 — APROVAÇÕES
 *
 * Este componente NÃO atualiza mais o Post diretamente.
 * Ele usa SEMPRE a entidade Approval, via:
 *  - base44.entities.Approval.approve(id, { clientFeedback })
 *  - base44.entities.Approval.reject(id, { clientFeedback })
 *
 * Props:
 *  - post: objeto do post (id, title, caption, media_url, media_type, tags, cta...)
 *  - approval: objeto da approval associada a este post (id, status, notes, etc.)
 *  - primaryColor: (mantido para compatibilidade, caso usado em temas)
 */
export default function PostApprovalCard({ post, approval, primaryColor }) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");
  const queryClient = useQueryClient();

  const currentStatus = useMemo(() => {
    if (approval?.status) return approval.status;
    return "PENDING";
  }, [approval]);

  const isPending = currentStatus === "PENDING";
  const isApproved = currentStatus === "APPROVED";
  const isRejected = currentStatus === "REJECTED";

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!approval?.id) {
        throw new Error("Approval não encontrada para este post.");
      }
      return base44.entities.Approval.approve(approval.id, {
        // backend aceita clientFeedback / client_feedback
        clientFeedback:
          feedback && feedback.trim().length > 0
            ? feedback
            : "Aprovado sem comentários",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-posts"] });
      setShowFeedback(false);
      setFeedback("");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!approval?.id) {
        throw new Error("Approval não encontrada para este post.");
      }
      return base44.entities.Approval.reject(approval.id, {
        clientFeedback:
          feedback && feedback.trim().length > 0
            ? feedback
            : "Reprovado sem comentários",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-posts"] });
      setShowFeedback(false);
      setFeedback("");
    },
  });

  const handleApproveClick = () => {
    if (!approval?.id) {
      alert("Nenhuma solicitação de aprovação ativa para este post.");
      return;
    }

    if (!isPending) {
      // Já aprovado/reprovado: apenas mostra mensagem
      alert("Este post já foi processado (aprovado ou reprovado).");
      return;
    }

    if (showFeedback) {
      approveMutation.mutate();
    } else {
      setShowFeedback(true);
    }
  };

  const handleRejectClick = () => {
    if (!approval?.id) {
      alert("Nenhuma solicitação de aprovação ativa para este post.");
      return;
    }

    if (!isPending) {
      alert("Este post já foi processado (aprovado ou reprovado).");
      return;
    }

    if (showFeedback) {
      if (!feedback.trim()) {
        alert("Por favor, adicione um comentário ao reprovar");
        return;
      }
      rejectMutation.mutate();
    } else {
      setShowFeedback(true);
    }
  };

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="grid md:grid-cols-2 gap-6 p-6">
        {/* Preview do Post */}
        <div>
          {post.media_url ? (
            <div className="relative rounded-lg overflow-hidden bg-gray-100">
              {post.media_type === "video" ? (
                <div className="aspect-square flex items-center justify-center">
                  <Video className="w-16 h-16 text-gray-400" />
                </div>
              ) : (
                <img
                  src={post.media_url}
                  alt={post.title}
                  className="w-full aspect-square object-cover"
                />
              )}
            </div>
          ) : (
            <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
              <Image className="w-16 h-16 text-gray-400" />
            </div>
          )}
        </div>

        {/* Detalhes e Ações */}
        <div className="space-y-4">
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              {post.title}
            </h3>

            {/* Badge de status de aprovação */}
            <Badge
              className={
                isApproved
                  ? "bg-emerald-100 text-emerald-700"
                  : isRejected
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
              }
            >
              {isApproved
                ? "Post aprovado"
                : isRejected
                ? "Post reprovado"
                : "Aguardando sua aprovação"}
            </Badge>
          </div>

          {post.caption && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold text-sm text-gray-700 mb-2">
                Legenda:
              </h4>
              <p className="text-gray-600 whitespace-pre-wrap">
                {post.caption}
              </p>
            </div>
          )}

          {post.cta && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <h4 className="font-semibold text-sm text-gray-700 mb-1">
                CTA:
              </h4>
              <p className="text-gray-600">{post.cta}</p>
            </div>
          )}

          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Feedback opcional */}
          {showFeedback && (
            <div className="space-y-2">
              <Textarea
                placeholder="Adicione seus comentários (opcional)..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
              />
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleApproveClick}
              className="flex-1 bg-green-600 hover:bg-green-700"
              disabled={approveMutation.isPending || !isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {approveMutation.isPending ? "Aprovando..." : "Aprovar"}
            </Button>

            <Button
              onClick={handleRejectClick}
              variant="outline"
              className="flex-1 text-red-600 border-red-600 hover:bg-red-50"
              disabled={rejectMutation.isPending || !isPending}
            >
              <XCircle className="w-4 h-4 mr-2" />
              {rejectMutation.isPending ? "Reprovando..." : "Reprovar"}
            </Button>

            {showFeedback && (
              <Button
                onClick={() => {
                  setShowFeedback(false);
                  setFeedback("");
                }}
                variant="ghost"
              >
                Cancelar
              </Button>
            )}
          </div>

          {!showFeedback && (
            <Button
              onClick={() => setShowFeedback(true)}
              variant="ghost"
              className="w-full"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Adicionar comentário
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
