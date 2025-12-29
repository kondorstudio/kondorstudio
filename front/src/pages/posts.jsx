import React, { useMemo, useState } from "react";
import { base44 } from "@/apiClient/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button.jsx";
import { Plus } from "lucide-react";
import Postkanban from "../components/posts/postkanban.jsx";
import Postformdialog from "../components/posts/postformdialog.jsx";

export default function Posts() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const queryClient = useQueryClient();

  const handleDialogClose = React.useCallback(() => {
    setDialogOpen(false);
    setEditingPost(null);
  }, []);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["posts"],
    queryFn: () => base44.entities.Post.list(),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const { data: integrations = [] } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => base44.entities.Integration.list(),
  });

  const invalidatePosts = () =>
    queryClient.invalidateQueries({ queryKey: ["posts"] });

  const showError = (error) => {
    const message =
      error?.data?.error ||
      error?.message ||
      "Erro ao salvar o post. Tente novamente.";
    alert(message);
  };

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Post.create(data),
    onSuccess: () => {
      invalidatePosts();
      handleDialogClose();
    },
    onError: showError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Post.update(id, data),
    onSuccess: () => {
      invalidatePosts();
      handleDialogClose();
    },
    onError: showError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Post.delete(id),
    onSuccess: () => {
      invalidatePosts();
      handleDialogClose();
    },
    onError: showError,
  });

  const sendToApprovalMutation = useMutation({
    mutationFn: (id) => base44.entities.Post.sendToApproval(id),
    onSuccess: () => {
      invalidatePosts();
    },
    onError: showError,
  });

  const handleEdit = (post) => {
    setEditingPost(post);
    setDialogOpen(true);
  };

  const handleStatusChange = (postId, newStatus) => {
    if (newStatus === "PENDING_APPROVAL") {
      sendToApprovalMutation.mutate(postId);
      return;
    }
    updateMutation.mutate({
      id: postId,
      data: { status: newStatus },
    });
  };

  const handleSubmit = (data) => {
    if (editingPost) {
      updateMutation.mutate({ id: editingPost.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    sendToApprovalMutation.isPending;

  const filteredPosts = useMemo(() => {
    if (!selectedClientId) return [];
    const start = dateStart ? new Date(`${dateStart}T00:00:00`) : null;
    const end = dateEnd ? new Date(`${dateEnd}T23:59:59`) : null;

    return (posts || []).filter((post) => {
      if (post.clientId !== selectedClientId) return false;
      if (!start && !end) return true;

      const postDateValue = post.scheduledDate || post.createdAt;
      if (!postDateValue) return false;
      const postDate = new Date(postDateValue);
      if (start && postDate < start) return false;
      if (end && postDate > end) return false;
      return true;
    });
  }, [posts, selectedClientId, dateStart, dateEnd]);

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Posts</h1>
              <p className="text-gray-600">
                Gerencie o fluxo de criação e aprovação
              </p>
            </div>
            <Button
              onClick={() => setDialogOpen(true)}
              className="self-start md:self-auto bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Post
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(260px,360px)_minmax(160px,200px)_minmax(160px,200px)] items-end">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700">
                Cliente
              </label>
              <select
                value={selectedClientId}
                onChange={(event) => setSelectedClientId(event.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Selecione um cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              {clients.length === 0 ? (
                <p className="text-[11px] text-amber-600">
                  Cadastre um cliente antes de visualizar posts.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700">
                Data inicial
              </label>
              <input
                type="date"
                value={dateStart}
                onChange={(event) => setDateStart(event.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={!selectedClientId}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700">
                Data final
              </label>
              <input
                type="date"
                value={dateEnd}
                onChange={(event) => setDateEnd(event.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={!selectedClientId}
              />
            </div>
          </div>
        </div>

        {!selectedClientId ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center text-sm text-slate-500">
            Selecione um cliente para visualizar os posts.
          </div>
        ) : (
          <Postkanban
            posts={filteredPosts}
            clients={clients}
            integrations={integrations}
            onEdit={handleEdit}
            onStatusChange={handleStatusChange}
            isLoading={isLoading}
          />
        )}

        <Postformdialog
          open={dialogOpen}
          onClose={handleDialogClose}
          post={editingPost}
          clients={clients}
          integrations={integrations}
          onSubmit={handleSubmit}
          isSaving={isSaving}
          onDelete={
            editingPost
              ? () => deleteMutation.mutate(editingPost.id)
              : undefined
          }
          isDeleting={deleteMutation.isPending}
        />
      </div>
    </div>
  );
}
