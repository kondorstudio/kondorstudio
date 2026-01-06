import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/apiClient/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button.jsx";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import FilterBar from "@/components/ui/filter-bar.jsx";
import EmptyState from "@/components/ui/empty-state.jsx";
import { Label } from "@/components/ui/label.jsx";
import { Input } from "@/components/ui/input.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";
import { DateField } from "@/components/ui/date-field.jsx";
import Toast from "@/components/ui/toast.jsx";
import useToast from "@/hooks/useToast.js";
import { useActiveClient } from "@/hooks/useActiveClient.js";
import {
  buildStatusPayload,
  isClientApprovalStatus,
} from "@/utils/postStatus.js";
import { Plus, Search } from "lucide-react";
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
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [activeClientId, setActiveClientId] = useActiveClient();
  const [selectedClientId, setSelectedClientId] = useState(activeClientId || "");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState(() => loadViewMode());
  const [collapsedColumns, setCollapsedColumns] = useState(() =>
    loadCollapsedColumns()
  );
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const lastSavedRef = React.useRef("");
  const saveTimeoutRef = React.useRef(null);
  const mainScrollRef = React.useRef(null);
  const scrollSnapshotRef = React.useRef(0);
  const shouldRestoreScrollRef = React.useRef(false);
  const queryClient = useQueryClient();
  const { toast, showToast } = useToast();

  const getMainScroll = () => {
    if (mainScrollRef.current) return mainScrollRef.current;
    if (typeof document === "undefined") return null;
    mainScrollRef.current = document.querySelector("main");
    return mainScrollRef.current;
  };

  const captureScrollPosition = () => {
    const container = getMainScroll();
    if (!container) return;
    scrollSnapshotRef.current = container.scrollTop;
    shouldRestoreScrollRef.current = true;
  };

  React.useLayoutEffect(() => {
    if (!shouldRestoreScrollRef.current) return;
    shouldRestoreScrollRef.current = false;
    const container = getMainScroll();
    if (!container) return;
    const targetScrollTop = scrollSnapshotRef.current;
    if (Math.abs(container.scrollTop - targetScrollTop) > 1) {
      container.scrollTop = targetScrollTop;
    }
  });

  React.useEffect(() => {
    if (activeClientId === selectedClientId) return;
    setSelectedClientId(activeClientId || "");
  }, [activeClientId, selectedClientId]);

  const handleDialogClose = React.useCallback(() => {
    setDialogOpen(false);
    setEditingPost(null);
  }, []);

  const handleNewPost = React.useCallback(
    (date) => {
      const params = new URLSearchParams();
      if (selectedClientId) {
        params.set("clientId", selectedClientId);
      }
      if (date instanceof Date && !Number.isNaN(date.getTime())) {
        params.set("date", date.toLocaleDateString("en-CA"));
      }
      const query = params.toString();
      navigate(`/posts/new${query ? `?${query}` : ""}`);
    },
    [navigate, selectedClientId]
  );

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
    showToast(message, "error");
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

  const handleEdit = async (post) => {
    if (!post?.id) return;
    try {
      const fullPost = await base44.entities.Post.get(post.id);
      setEditingPost(fullPost);
      setDialogOpen(true);
    } catch (error) {
      showToast("Erro ao carregar detalhes do post.", "error");
    }
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
      !searchTerm.trim();

    const lastFilters = preferences?.lastFilters;
    const hasSavedFilters =
      lastFilters && typeof lastFilters === "object" && Object.keys(lastFilters).length > 0;

    if (hasSavedFilters && filtersEmpty) {
      if (typeof lastFilters.clientId === "string") {
        setSelectedClientId(lastFilters.clientId);
        setActiveClientId(lastFilters.clientId);
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
    }

    const seedFilters = hasSavedFilters && filtersEmpty
      ? lastFilters
      : {
          clientId: selectedClientId || null,
          dateStart: dateStart || null,
          dateEnd: dateEnd || null,
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
  ]);

  const preferencesPayload = useMemo(() => {
    const trimmedSearch = searchTerm.trim();
    return {
      postsViewMode: viewMode,
      kanbanCollapsedColumns: collapsedColumns,
      lastFilters: {
        clientId: selectedClientId || null,
        dateStart: dateStart || null,
        dateEnd: dateEnd || null,
        search: trimmedSearch || null,
      },
    };
  }, [
    viewMode,
    collapsedColumns,
    selectedClientId,
    dateStart,
    dateEnd,
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

  const filters = useMemo(() => {
    const trimmedSearch = searchTerm.trim();
    return {
      clientId: selectedClientId || undefined,
      startDate: dateStart || undefined,
      endDate: dateEnd || undefined,
      q: trimmedSearch || undefined,
    };
  }, [selectedClientId, dateStart, dateEnd, searchTerm]);

  const postsQuery = useQuery({
    queryKey: ["posts", viewMode, filters],
    queryFn: () => {
      if (viewMode === "calendar") {
        return base44.entities.Post.listCalendar(filters);
      }
      return base44.entities.Post.listKanban(filters);
    },
  });

  const isLoading = postsQuery.isLoading;

  const kanbanPosts = useMemo(() => {
    const columns = postsQuery.data?.columns || {};
    return Object.values(columns).flatMap((column) => column.items || []);
  }, [postsQuery.data]);

  const calendarPosts = useMemo(() => postsQuery.data?.items || [], [postsQuery.data]);

  React.useEffect(() => {
    if (!postsQuery.isError) return;
    const message =
      postsQuery.error?.message ||
      "Erro ao carregar posts. Tente novamente.";
    showToast(message, "error");
  }, [postsQuery.isError, postsQuery.error, showToast]);

  const hasFilters = Boolean(
    selectedClientId ||
      dateStart ||
      dateEnd ||
      searchTerm.trim()
  );
  const hasResults =
    viewMode === "calendar"
      ? calendarPosts.length > 0
      : kanbanPosts.length > 0;

  return (
    <PageShell>
      <div onPointerDownCapture={captureScrollPosition}>
      <PageHeader
        title="Posts"
        subtitle="Gerencie o fluxo de criacao e aprovacao."
      />

      <FilterBar className="mt-6">
        <div className="min-w-[220px] flex-1">
          <Label>Perfil/cliente</Label>
          <SelectNative
            value={selectedClientId}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedClientId(value);
              setActiveClientId(value);
            }}
          >
            <option value="">Todos os clientes</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </SelectNative>
          {clients.length === 0 ? (
            <p className="text-[11px] text-amber-600 mt-1">
              Cadastre um cliente antes de visualizar posts.
            </p>
          ) : null}
        </div>

        <div className="min-w-[160px]">
          <Label>Periodo inicial</Label>
          <DateField
            value={dateStart}
            onChange={(event) => setDateStart(event.target.value)}
          />
        </div>

        <div className="min-w-[160px]">
          <Label>Periodo final</Label>
          <DateField
            value={dateEnd}
            onChange={(event) => setDateEnd(event.target.value)}
          />
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
          <Button leftIcon={Plus} onClick={() => handleNewPost()}>
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
          ) : !hasResults ? (
            <EmptyState
              title={hasFilters ? "Nenhum post encontrado" : "Nenhum post criado"}
              description={
                hasFilters
                  ? "Ajuste os filtros para encontrar posts neste periodo."
                  : "Crie seu primeiro post para iniciar o fluxo."
              }
              action={
                <Button leftIcon={Plus} onClick={() => handleNewPost()}>
                  Novo post
                </Button>
              }
            />
          ) : (
            <Postcalendar
              posts={calendarPosts}
              onPostClick={handleEdit}
              onDateClick={handleNewPost}
              isLoading={isLoading}
            />
          )
        ) : (
          <Postkanban
            posts={kanbanPosts}
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
        defaultClientId={selectedClientId}
        clients={clients}
        integrations={integrations}
        onSubmit={handleSubmit}
        isSaving={isSaving}
        onDelete={
          editingPost ? () => deleteMutation.mutate(editingPost.id) : undefined
        }
        isDeleting={deleteMutation.isPending}
      />

      <Toast toast={toast} />
      </div>
    </PageShell>
  );
}
