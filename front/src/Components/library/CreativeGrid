import React from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Eye, TrendingUp, Image as ImageIcon, Video } from "lucide-react";

export default function CreativeGrid({ creatives, clients }) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Creative.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creatives'] });
    }
  });

  const handleDelete = (id) => {
    if (confirm('Tem certeza que deseja excluir este criativo?')) {
      deleteMutation.mutate(id);
    }
  };

  if (creatives.length === 0) {
    return (
      <Card className="border-2 border-dashed border-gray-300">
        <CardContent className="py-16 text-center">
          <ImageIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Nenhum criativo encontrado
          </h3>
          <p className="text-gray-600">
            Adicione seus primeiros criativos para começar
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {creatives.map((creative) => {
        const client = clients.find(c => c.id === creative.client_id);

        return (
          <Card key={creative.id} className="group hover:shadow-lg transition-all overflow-hidden">
            <div className="relative aspect-square bg-gray-100">
              {creative.file_type === 'video' ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Video className="w-16 h-16 text-gray-400" />
                </div>
              ) : (
                <img
                  src={creative.file_url}
                  alt={creative.name}
                  className="w-full h-full object-cover"
                />
              )}

              <div className="absolute top-2 right-2 flex gap-2">
                <Button
                  size="icon"
                  variant="secondary"
                  className="bg-white/90 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => window.open(creative.file_url, '_blank')}
                >
                  <Eye className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  className="bg-white/90 hover:bg-white text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDelete(creative.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              {creative.performance_score && (
                <div className="absolute bottom-2 left-2">
                  <Badge className="bg-purple-600 text-white">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    {creative.performance_score}/100
                  </Badge>
                </div>
              )}
            </div>

            <CardContent className="p-4">
              <h3 className="font-semibold text-gray-900 mb-1 truncate">
                {creative.name}
              </h3>

              {client && (
                <p className="text-sm text-gray-500 mb-3">{client.name}</p>
              )}

              {creative.tags && creative.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {creative.tags.slice(0, 3).map((tag, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {creative.tags.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{creative.tags.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}