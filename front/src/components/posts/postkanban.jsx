import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
  const getClientById = (id) => clients.find((c) => c.id === id) || null;

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {COLUMNS.map((col) => (
          <Card key={col.status} className="border-dashed border-purple-200">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-800">
                {col.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-16 bg-gray-100 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {COLUMNS.map((col) => {
        const columnPosts = posts.filter((p) => p.status === col.status);

        return (
          <Card key={col.status} className="bg-slate-50/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-800">
                  {col.title}
                </CardTitle>
                <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                  {columnPosts.length}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {columnPosts.length === 0 ? (
                <div className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg p-3 text-center">
                  Nenhum post aqui ainda.
                </div>
              ) : (
                columnPosts.map((post) => (
                  <Postcard
                    key={post.id}
                    post={post}
                    client={getClientById(post.clientId)}
                    onEdit={onEdit}
                    onStatusChange={onStatusChange}
                  />
                ))
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
