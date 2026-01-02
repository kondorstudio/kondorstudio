import React, { useMemo, useState } from "react";
import { base44 } from "@/apiClient/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button.jsx";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import FilterBar from "@/components/ui/filter-bar.jsx";
import EmptyState from "@/components/ui/empty-state.jsx";
import { Label } from "@/components/ui/label.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Checkbox } from "@/components/ui/checkbox.jsx";
import {
  buildStatusPayload,
  getWorkflowStatuses,
  isClientApprovalStatus,
  resolveWorkflowStatus,
} from "@/utils/postStatus.js";
import { ChevronDown, Plus, Search } from "lucide-react";
import Postkanban from "../components/posts/postkanban.jsx";
import Postcalendar from "../components/posts/postcalendar.jsx";
import Postformdialog from "../components/posts/postformdialog.jsx";

const VIEW_STORAGE_KEY = "kondor_posts_view_mode";
const KANBAN_STORAGE_KEY = "kondor_posts_kanban_collapsed";

const loadViewMode = () => {
  if (typeof window === "undefined") return "kanban";
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return raw === "calendar" || raw === "kanban" ? raw : "kanban";
  } catch (err) {
    return "kanban";
  }
};

const loadCollapsedColumns = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KANBAN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
};

const persistCollapsedColumns = (value) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KANBAN_STORAGE_KEY, JSON.stringify(value || {}));
  } catch (err) {
    return;
  }
};

const serializePreferences = (payload) => {
  try {
    return JSON.stringify(payload || {});
  } catch (err) {
    return "";
  }
};

export default function Posts() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState(() => loadViewMode());
  const [collapsedColumns, setCollapsedColumns] = useState(() =>
    loadCollapsedColumns()
  );
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const statusMenuRef = React.useRef(null);
  const lastSavedRef = React.useRef("");
  const saveTimeoutRef = React.useRef(null);
  const queryClient = useQueryClient();
  const statusOptions = React.useMemo(() => getWorkflowStatuses(), []);

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

  const preferencesQuery = useQuery({
    queryKey: ["me-preferences"],
    queryFn: () => base44.me.getPreferences(),
  });

  const preferences = preferencesQuery.data?.preferences || null;

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

  const preferencesMutation = useMutation({
    mutationFn: (payload) => base44.me.updatePreferences(payload),
    onError: (error) => {
      console.error("Erro ao salvar preferencias", error);
    },
  });

  const handleEdit = (post) => {
    setEditingPost(post);
    setDialogOpen(true);
  };

  const handleStatusChange = async (postId, newStatus) => {
    const statusPayload = buildStatusPayload(newStatus);
    const data = {
      status: statusPayload.status,
      metadata: statusPayload.metadata,
    };

    if (isClientApprovalStatus(newStatus)) {
      try {
        await updateMutation.mutateAsync({ id: postId, data });
        await sendToApprovalMutation.mutateAsync(postId);
      } catch (error) {
        showError(error);
      }
      return;
    }

    updateMutation.mutate({
      id: postId,
      data,
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

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch (err) {
      return;
    }
  }, [viewMode]);

  React.useEffect(() => {
    persistCollapsedColumns(collapsedColumns);
  }, [collapsedColumns]);

  React.useEffect(() => {
    if (!preferencesQuery.isFetched || preferencesHydrated) return;

    if (preferences?.postsViewMode) {
      setViewMode(preferences.postsViewMode);
    }
    if (preferences?.kanbanCollapsedColumns) {
      setCollapsedColumns(preferences.kanbanCollapsedColumns);
    }

    const filtersEmpty =
      !selectedClientId &&
      !dateStart &&
      !dateEnd &&
      !searchTerm.trim() &&
      selectedStatuses.length === 0;

    const lastFilters = preferences?.lastFilters;
    const hasSavedFilters =
      lastFilters && typeof lastFilters === "object" && Object.keys(lastFilters).length > 0;

    if (hasSavedFilters && filtersEmpty) {
      if (typeof lastFilters.clientId === "string") {
        setSelectedClientId(lastFilters.clientId);
      }
      if (typeof lastFilters.dateStart === "string") {
        setDateStart(lastFilters.dateStart);
      }
      if (typeof lastFilters.dateEnd === "string") {
        setDateEnd(lastFilters.dateEnd);
      }
      if (typeof lastFilters.search === "string") {
        setSearchTerm(lastFilters.search);
      }
      if (Array.isArray(lastFilters.status)) {
        setSelectedStatuses(lastFilters.status);
      }
    }

    const seedFilters = hasSavedFilters && filtersEmpty
      ? lastFilters
      : {
          clientId: selectedClientId || null,
          dateStart: dateStart || null,
          dateEnd: dateEnd || null,
          status: selectedStatuses,
          search: searchTerm.trim() || null,
        };

    lastSavedRef.current = serializePreferences({
      postsViewMode: preferences?.postsViewMode || viewMode,
      kanbanCollapsedColumns: preferences?.kanbanCollapsedColumns || collapsedColumns,
      lastFilters: seedFilters || {},
    });
    setPreferencesHydrated(true);
  }, [
    preferencesQuery.isFetched,
    preferencesHydrated,
    preferences,
    viewMode,
    collapsedColumns,
    selectedClientId,
    dateStart,
    dateEnd,
    searchTerm,
    selectedStatuses,
  ]);

  React.useEffect(() => {
    if (!statusMenuOpen) return;

    const handleClickOutside = (event) => {
      if (!statusMenuRef.current) return;
      if (!statusMenuRef.current.contains(event.target)) {
        setStatusMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [statusMenuOpen]);

  const toggleStatus = (key) => {
    setSelectedStatuses((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const clearStatuses = () => {
    setSelectedStatuses([]);
  };

  const statusLabel = React.useMemo(() => {
    if (selectedStatuses.length === 0) return "Todos os status";
    if (selectedStatuses.length === 1) {
      const option = statusOptions.find((item) => item.key === selectedStatuses[0]);
      return option?.label || "1 status";
    }
    return `${selectedStatuses.length} status`;
  }, [selectedStatuses, statusOptions]);

  const preferencesPayload = useMemo(() => {
    const trimmedSearch = searchTerm.trim();
    return {
      postsViewMode: viewMode,
      kanbanCollapsedColumns: collapsedColumns,
      lastFilters: {
        clientId: selectedClientId || null,
        dateStart: dateStart || null,
        dateEnd: dateEnd || null,
        status: selectedStatuses,
        search: trimmedSearch || null,
      },
    };
  }, [
    viewMode,
    collapsedColumns,
    selectedClientId,
    dateStart,
    dateEnd,
    selectedStatuses,
    searchTerm,
  ]);

  React.useEffect(() => {
    if (!preferencesHydrated) return;

    const serialized = serializePreferences(preferencesPayload);
    if (serialized === lastSavedRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      preferencesMutation.mutate(preferencesPayload);
      lastSavedRef.current = serialized;
    }, 600);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [preferencesHydrated, preferencesPayload, preferencesMutation]);

  const clientMap = useMemo(() => {
    const map = new Map();
    (clients || []).forEach((client) => {
      if (client?.id) map.set(client.id, client);
    });
    return map;
  }, [clients]);

  const filteredPosts = useMemo(() => {
    const start = dateStart ? new Date(`${dateStart}T00:00:00`) : null;
    const end = dateEnd ? new Date(`${dateEnd}T23:59:59`) : null;
    const query = searchTerm.trim().toLowerCase();
    const statusSet = selectedStatuses.length ? new Set(selectedStatuses) : null;

    return (posts || []).filter((post) => {
      const postClientId = post.clientId || post.client_id;
      if (selectedClientId && postClientId !== selectedClientId) return false;

      if (statusSet) {
        const statusKey = resolveWorkflowStatus(post);
        if (!statusSet.has(statusKey)) return false;
      }

      if (query) {
        const clientName = clientMap.get(postClientId)?.name || "";
        const haystack = [
          post.title,
          post.body,
          post.caption,
          post.clientFeedback,
          post.client_feedback,
          clientName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (!start && !end) return true;

      const postDateValue =
        post.scheduledDate ||
        post.scheduledAt ||
        post.scheduled_at ||
        post.publishedDate ||
        post.published_at ||
        post.createdAt;
      if (!postDateValue) return false;
      const postDate = new Date(postDateValue);
      if (isNaN(postDate.getTime())) return false;
      if (start && postDate < start) return false;
      if (end && postDate > end) return false;
      return true;
    });
  }, [
    posts,
    selectedClientId,
    dateStart,
    dateEnd,
    searchTerm,
    selectedStatuses,
    clientMap,
  ]);

  const hasFilters = Boolean(
    selectedClientId ||
      dateStart ||
      dateEnd ||
      searchTerm.trim() ||
      selectedStatuses.length
  );

  return (
    <PageShell>
      <PageHeader
        title="Posts"
        subtitle="Gerencie o fluxo de criacao e aprovacao."
      />

      <FilterBar className="mt-6">
        <div className="min-w-[220px] flex-1">
          <Label>Perfil/cliente</Label>
          <select
            value={selectedClientId}
            onChange={(event) => setSelectedClientId(event.target.value)}
            className="w-full h-10 rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[rgba(109,40,217,0.2)]"
          >
            <option value="">Todos os clientes</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          {clients.length === 0 ? (
            <p className="text-[11px] text-amber-600 mt-1">
              Cadastre um cliente antes de visualizar posts.
            </p>
          ) : null}
        </div>

        <div className="min-w-[160px]">
          <Label>Periodo inicial</Label>
          <Input
            type="date"
            value={dateStart}
            onChange={(event) => setDateStart(event.target.value)}
          />
        </div>

        <div className="min-w-[160px]">
          <Label>Periodo final</Label>
          <Input
            type="date"
            value={dateEnd}
            onChange={(event) => setDateEnd(event.target.value)}
          />
        </div>

        <div className="relative min-w-[200px]" ref={statusMenuRef}>
          <Label>Status</Label>
          <button
            type="button"
            onClick={() => setStatusMenuOpen((prev) => !prev)}
            className="flex h-10 w-full items-center justify-between rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] shadow-sm hover:bg-gray-50"
            aria-expanded={statusMenuOpen}
          >
            <span className="text-[var(--text-muted)]">{statusLabel}</span>
            <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
          </button>
          {statusMenuOpen ? (
            <div className="absolute z-40 mt-2 w-[260px] rounded-[12px] border border-[var(--border)] bg-white shadow-[var(--shadow-md)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                <span className="text-xs font-semibold text-[var(--text-muted)]">
                  Selecionar status
                </span>
                {selectedStatuses.length ? (
                  <button
                    type="button"
                    onClick={clearStatuses}
                    className="text-xs font-semibold text-[var(--primary)] hover:underline"
                  >
                    Limpar
                  </button>
                ) : null}
              </div>
              <div className="max-h-56 overflow-auto p-2">
                {statusOptions.map((option) => {
                  const Icon = option.icon;
                  const checked = selectedStatuses.includes(option.key);
                  return (
                    <label
                      key={option.key}
                      className="flex cursor-pointer items-center gap-2 rounded-[10px] px-2 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-muted)]"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleStatus(option.key)}
                      />
                      {Icon ? (
                        <Icon className={`h-4 w-4 ${option.tone || "text-slate-500"}`} />
                      ) : null}
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="min-w-[220px] flex-1">
          <Label>Busca</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por titulo ou texto"
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto">
          <div className="flex items-center rounded-[10px] border border-[var(--border)] bg-white p-1">
            {[
              { key: "kanban", label: "Kanban" },
              { key: "calendar", label: "Calendario" },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setViewMode(option.key)}
                className={`h-8 rounded-[8px] px-3 text-xs font-semibold transition ${
                  viewMode === option.key
                    ? "bg-[var(--primary-light)] text-[var(--primary)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
                }`}
                aria-pressed={viewMode === option.key}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button leftIcon={Plus} onClick={() => setDialogOpen(true)}>
            Novo post
          </Button>
        </div>
      </FilterBar>

      <div className="mt-6">
        {viewMode === "calendar" ? (
          isLoading ? (
            <EmptyState
              title="Carregando posts"
              description="Aguarde enquanto carregamos o calendario."
            />
          ) : filteredPosts.length === 0 ? (
            <EmptyState
              title={hasFilters ? "Nenhum post encontrado" : "Nenhum post criado"}
              description={
                hasFilters
                  ? "Ajuste os filtros para encontrar posts neste periodo."
                  : "Crie seu primeiro post para iniciar o fluxo."
              }
              action={
                <Button leftIcon={Plus} onClick={() => setDialogOpen(true)}>
                  Novo post
                </Button>
              }
            />
          ) : (
            <Postcalendar posts={filteredPosts} onPostClick={handleEdit} />
          )
        ) : (
          <Postkanban
            posts={filteredPosts}
            clients={clients}
            integrations={integrations}
            onEdit={handleEdit}
            onStatusChange={handleStatusChange}
            isLoading={isLoading}
            collapsedColumns={collapsedColumns}
            onCollapsedChange={setCollapsedColumns}
          />
        )}
      </div>

      <Postformdialog
        open={dialogOpen}
        onClose={handleDialogClose}
        post={editingPost}
        clients={clients}
        integrations={integrations}
        onSubmit={handleSubmit}
        isSaving={isSaving}
        onDelete={
          editingPost ? () => deleteMutation.mutate(editingPost.id) : undefined
        }
        isDeleting={deleteMutation.isPending}
      />
    </PageShell>
  );
}
