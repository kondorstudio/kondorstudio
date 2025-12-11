import React, { useState } from "react";
import { base44 } from "@/apiClient/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button.jsx";
import { Plus } from "lucide-react";
import Postkanban from "../components/posts/postkanban.jsx";
import Postformdialog from "../components/posts/postformdialog.jsx";

export default function Posts() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
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

  const handleEdit = (post) => {
    setEditingPost(post);
    setDialogOpen(true);
  };

  const handleStatusChange = (postId, newStatus) => {
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

  const isSaving = createMutation.isPending || updateMutation.isPending;

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
        </div>

        <Postkanban
          posts={posts}
          clients={clients}
          onEdit={handleEdit}
          onStatusChange={handleStatusChange}
          isLoading={isLoading}
        />

        <Postformdialog
          open={dialogOpen}
          onClose={handleDialogClose}
          post={editingPost}
          clients={clients}
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
