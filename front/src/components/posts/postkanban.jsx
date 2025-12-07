import React from "react";
import Postcard from "./postcard.jsx";

const COLUMNS = [
  { status: "DRAFT", title: "Rascunho", description: "Ideias e conteúdos em rascunho." },
  { status: "PENDING_APPROVAL", title: "Aguardando aprovação", description: "Posts enviados para o cliente revisar." },
  { status: "APPROVED", title: "Aprovado", description: "Pronto para programar ou publicar." },
  { status: "SCHEDULED", title: "Programado", description: "Agendado nas plataformas." },
  { status: "PUBLISHED", title: "Publicado", description: "Entrou no ar recentemente." },
  { status: "ARCHIVED", title: "Arquivado", description: "Itens antigos ou pausados." },
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

  const renderSkeletonColumn = () => (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-24 rounded-2xl bg-slate-100/80 animate-pulse"
        />
      ))}
    </div>
  );

  const renderEmptyColumn = () => (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-xs text-slate-400">
      Nenhum post nesta coluna.
    </div>
  );

  return (
    <div className="pb-8">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {COLUMNS.map((col) => {
          const columnPosts = postsByStatus.get(col.status) || [];

          return (
            <div key={col.status}>
              <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm shadow-slate-100 backdrop-blur-md">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {col.title}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {col.description}
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                    {columnPosts.length}
                  </span>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto pr-1">
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
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
