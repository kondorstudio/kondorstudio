import React, { useMemo, useState } from "react";
import { base44 } from "@/apiClient/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FiltersBar from "@/components/creatives/filtersBar.jsx";
import CreativeGrid from "@/components/creatives/creativeGrid.jsx";
import CreativeEmptyState from "@/components/creatives/creativeEmptyState.jsx";
import CreativeDetailsDrawer from "@/components/creatives/creativeDetailsDrawer.jsx";

export default function Biblioteca() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterClient, setFilterClient] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedCreative, setSelectedCreative] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data: creatives = [] } = useQuery({
    queryKey: ["creatives"],
    queryFn: () => base44.entities.Creative.list("-created_date"),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Creative.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creatives"] });
    },
  });

  const filteredCreatives = useMemo(() => {
    return creatives.filter((creative) => {
      const search = searchTerm.toLowerCase();
      const matchesSearch =
        creative.name?.toLowerCase().includes(search) ||
        creative.tags?.some((tag) => tag.toLowerCase().includes(search));
      const matchesClient =
        filterClient === "all" || creative.client_id === filterClient;
      const matchesType =
        filterType === "all" || creative.file_type === filterType;
      const currentStatus = creative.status || "in_use";
      const matchesStatus =
        filterStatus === "all" || currentStatus === filterStatus;

      return matchesSearch && matchesClient && matchesType && matchesStatus;
    });
  }, [creatives, searchTerm, filterClient, filterType, filterStatus]);

  const handleSelectCreative = (creative) => {
    setSelectedCreative(creative);
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedCreative(null);
  };

  const handleDeleteCreative = (creative) => {
    if (!creative) return;
    if (window.confirm("Tem certeza que deseja excluir este criativo?")) {
      deleteMutation.mutate(creative.id, {
        onSuccess: () => {
          if (selectedCreative?.id === creative.id) {
            handleCloseDrawer();
          }
        },
      });
    }
  };

  const handleDownloadCreative = (creative) => {
    if (!creative?.file_url) return;
    const link = document.createElement("a");
    link.href = creative.file_url;
    link.download = creative.name || "criativo";
    link.target = "_blank";
    link.rel = "noopener";
    link.click();
  };

  const handleUseInPost = (creative) => {
    console.log("Usar em post", creative);
    alert("Em breve você poderá vincular este criativo diretamente a um post.");
  };

  const handleArchiveCreative = (creative) => {
    console.log("Arquivar criativo", creative);
    alert("Funcionalidade de arquivamento será adicionada em breve.");
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 md:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400 font-semibold">
              Biblioteca
            </p>
            <h1 className="text-3xl font-bold text-slate-900">
              Biblioteca de Criativos
            </h1>
            <p className="text-slate-500 mt-1">
              Gerencie seus assets e encontre o criativo ideal para cada post.
            </p>
          </div>
        </div>

        <FiltersBar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          filterClient={filterClient}
          onClientChange={setFilterClient}
          clients={clients}
          filterType={filterType}
          onTypeChange={setFilterType}
          filterStatus={filterStatus}
          onStatusChange={setFilterStatus}
          total={filteredCreatives.length}
        />

        {filteredCreatives.length === 0 ? (
          <CreativeEmptyState />
        ) : (
          <CreativeGrid
            creatives={filteredCreatives}
            clients={clients}
            onSelectCreative={handleSelectCreative}
            onUseInPost={handleUseInPost}
            onDownloadCreative={handleDownloadCreative}
          />
        )}

        <CreativeDetailsDrawer
          creative={selectedCreative}
          open={drawerOpen}
          onClose={handleCloseDrawer}
          clientName={
            selectedCreative
              ? clients.find((c) => c.id === selectedCreative.client_id)?.name
              : ""
          }
          onUseInPost={handleUseInPost}
          onDownload={handleDownloadCreative}
          onDelete={handleDeleteCreative}
          onArchive={handleArchiveCreative}
        />
      </div>
    </div>
  );
}
