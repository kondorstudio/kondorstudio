import React, { useState } from "react";
import { base44 } from "../apiClient/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import PostKanban from "../components/posts/PostKanban";
import PostFormDialog from "../components/posts/PostFormDialog";

export default function Posts() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const queryClient = useQueryClient();

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["posts"],
    queryFn: () => base44.entities.Post.list(),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Post.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
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

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingPost(null);
  };

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Posts</h1>
            <p className="text-gray-600">
              Gerencie o fluxo de criação e aprovação
            </p>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Post
          </Button>
        </div>

        <PostKanban
          posts={posts}
          clients={clients}
          onEdit={handleEdit}
          onStatusChange={handleStatusChange}
          isLoading={isLoading}
        />

        <PostFormDialog
          open={dialogOpen}
          onClose={handleDialogClose}
          post={editingPost}
          clients={clients}
        />
      </div>
    </div>
  );
}
