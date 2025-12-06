import React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card.jsx";
import Postcard from "./postcard.jsx";

const COLUMNS = [
  { status: "DRAFT", title: "Rascunho" },
  { status: "PENDING_APPROVAL", title: "Aguardando aprovação" },
  { status: "APPROVED", title: "Aprovado" },
  { status: "SCHEDULED", title: "Programado" },
  { status: "PUBLISHED", title: "Publicado" },
  { status: "ARCHIVED", title: "Arquivado" },
];

export default function Postkanban({
  posts = [],
  clients = [],
  onEdit,
  onStatusChange,
  isLoading,
}) {
  const clientMap = React.useMemo(() => {
    const map = new Map();
    (clients || []).forEach((client) => {
      if (client?.id) map.set(client.id, client);
    });
    return map;
  }, [clients]);

  const postsByStatus = React.useMemo(() => {
    const map = new Map();
    (posts || []).forEach((post) => {
      const bucket = map.get(post.status) || [];
      bucket.push(post);
      map.set(post.status, bucket);
    });
    return map;
  }, [posts]);

  const getClientById = (clientId) => {
    if (!clientId) return null;
    return clientMap.get(clientId) || null;
  };

  const renderSkeletonColumn = () => {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 rounded-md bg-slate-100 animate-pulse"
          />
        ))}
      </div>
    );
  };

  const renderEmptyColumn = () => (
    <div className="text-xs text-gray-400 italic">
      Nenhum post nesta coluna.
    </div>
  );

  return (
    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {COLUMNS.map((col) => {
        const columnPosts = postsByStatus.get(col.status) || [];

        return (
          <Card key={col.status} className="bg-slate-50/60 flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-800">
                  {col.title}
                </CardTitle>
                <span className="text-xs px-2 py-1 rounded-full bg-white text-gray-600 border border-slate-200">
                  {columnPosts.length}
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0 flex-1 overflow-y-auto space-y-3">
              {isLoading
                ? renderSkeletonColumn()
                : columnPosts.length === 0
                ? renderEmptyColumn()
                : columnPosts.map((post) => (
                    <Postcard
                      key={post.id}
                      post={post}
                      client={getClientById(post.clientId)}
                      onEdit={onEdit}
                      onStatusChange={onStatusChange}
                    />
                  ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
