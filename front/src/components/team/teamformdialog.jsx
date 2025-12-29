import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/apiClient/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Label } from "@/components/ui/label.jsx";
import { Checkbox } from "@/components/ui/checkbox.jsx";
import { ChevronDown } from "lucide-react";
import { DEFAULT_MODULES, normalizeTeamAccess } from "@/utils/teamAccess";

const MODULE_OPTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "clients", label: "Clientes" },
  { key: "posts", label: "Posts" },
  { key: "approvals", label: "Aprovações" },
  { key: "tasks", label: "Tarefas" },
  { key: "metrics", label: "Métricas" },
  { key: "integrations", label: "Integrações" },
  { key: "finance", label: "Financeiro" },
  { key: "library", label: "Biblioteca" },
  { key: "team", label: "Equipe" },
  { key: "settings", label: "Configurações" },
];

const ROLE_OPTIONS = [
  { value: "admin", label: "Administrador" },
  { value: "traffic_manager", label: "Gestor de Tráfego" },
  { value: "designer", label: "Designer" },
  { value: "social_media", label: "Social Media" },
  { value: "copywriter", label: "Copywriter" },
  { value: "videomaker", label: "Videomaker" },
];

function DropdownChip({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const currentLabel =
    options.find((option) => option.value === value)?.label || placeholder;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className={`w-full h-11 px-4 rounded-2xl border text-left text-sm font-medium flex items-center justify-between transition ${
          open
            ? "border-purple-300 bg-purple-50 text-purple-700"
            : "border-gray-200 bg-white text-gray-700 hover:border-purple-200"
        }`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{currentLabel}</span>
        <ChevronDown className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute z-40 mt-2 w-full rounded-2xl border border-gray-100 bg-white shadow-xl py-2">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`w-full text-left px-4 py-2 text-sm font-medium transition ${
                option.value === value
                  ? "text-purple-700 bg-purple-50"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Teamformdialog({ open, onClose, member }) {
  const queryClient = useQueryClient();
  const [clientSearch, setClientSearch] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
    role: "social_media",
    permissions: {
      modules: { ...DEFAULT_MODULES },
      clientAccess: { scope: "all", clientIds: [] },
    },
    salary: "",
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["team-form-clients"],
    queryFn: () => base44.entities.Clients?.list?.({ page: 1, perPage: 200 }),
    enabled: open,
  });

  useEffect(() => {
    if (member) {
      const normalized = normalizeTeamAccess(
        member.permissions || {},
        member._raw?.user?.role || member.role
      );
      setFormData({
        name: member.name || "",
        email: member.email || "",
        username: member.username || "",
        password: "",
        role: member.role || "social_media",
        permissions: normalized,
        salary:
          typeof member.salaryCents === "number"
            ? (member.salaryCents / 100).toString()
            : "",
      });
    } else if (open) {
      setFormData({
        name: "",
        email: "",
        username: "",
        password: "",
        role: "social_media",
        permissions: {
          modules: { ...DEFAULT_MODULES },
          clientAccess: { scope: "all", clientIds: [] },
        },
        salary: "",
      });
    }
  }, [member, open]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      if (member) {
        return base44.entities.TeamMember.update(member.id, data);
      }
      return base44.entities.TeamMember.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const usernameValue = formData.username ? formData.username.trim() : "";
    const salaryValue =
      formData.salary !== undefined && formData.salary !== null
        ? formData.salary.toString().trim()
        : "";

    const payload = {
      name: formData.name,
      email: formData.email,
      username: usernameValue || null,
      role: formData.role,
      permissions: formData.permissions,
      salary: salaryValue || null,
    };
    if (formData.password) {
      payload.password = formData.password;
    }
    mutation.mutate(payload);
  };

  const togglePermission = (key) => {
    setFormData((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        modules: {
          ...prev.permissions.modules,
          [key]: !prev.permissions.modules?.[key],
        },
      },
    }));
  };

  const toggleClient = (clientId) => {
    setFormData((prev) => {
      const current = prev.permissions.clientAccess.clientIds || [];
      const next = current.includes(clientId)
        ? current.filter((id) => id !== clientId)
        : [...current, clientId];
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          clientAccess: {
            ...prev.permissions.clientAccess,
            clientIds: next,
          },
        },
      };
    });
  };

  const visibleClients = clients.filter((client) => {
    if (!clientSearch) return true;
    const term = clientSearch.toLowerCase();
    return (
      client.name?.toLowerCase().includes(term) ||
      client.company?.toLowerCase().includes(term) ||
      client.email?.toLowerCase().includes(term)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle className="text-gray-900">
            {member ? "Editar Membro" : "Novo Membro"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-900">Nome *</Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
                className="bg-white border-gray-300"
              />
            </div>
            <div>
              <Label className="text-gray-900">Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                required
                className="bg-white border-gray-300"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-900">Login do membro</Label>
              <Input
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                placeholder="ex: joaosilva"
                className="bg-white border-gray-300"
              />
              <p className="text-xs text-gray-500 mt-1">
                Caso deixe em branco, o e-mail será usado como login.
              </p>
            </div>
            <div>
              <Label className="text-gray-900">
                {member ? "Atualizar senha" : "Senha de acesso"}
              </Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                placeholder="Defina uma senha segura"
                className="bg-white border-gray-300"
                required={!member}
              />
              {member && (
                <p className="text-xs text-gray-500 mt-1">
                  Deixe vazio se não quiser alterar a senha.
                </p>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-900">Função</Label>
              <DropdownChip
                value={formData.role}
                onChange={(value) => setFormData({ ...formData, role: value })}
                options={ROLE_OPTIONS}
                placeholder="Selecione..."
              />
            </div>
            <div>
              <Label className="text-gray-900">Salário mensal (opcional)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.salary}
                onChange={(e) =>
                  setFormData({ ...formData, salary: e.target.value })
                }
                placeholder="Ex: 3500.00"
                className="bg-white border-gray-300"
              />
              <p className="text-xs text-gray-500 mt-1">
                Ao informar, será criado um custo automático no financeiro.
              </p>
            </div>
          </div>

          <div>
            <Label className="mb-3 block text-gray-900">Permissões</Label>
            <div className="space-y-2 bg-gray-50 p-4 rounded-2xl border border-gray-200">
              {MODULE_OPTIONS.map((module) => (
                <div key={module.key} className="flex items-center gap-2">
                  <Checkbox
                    id={module.key}
                    checked={!!formData.permissions.modules?.[module.key]}
                    onCheckedChange={() => togglePermission(module.key)}
                  />
                  <label
                    htmlFor={module.key}
                    className="text-sm capitalize cursor-pointer text-gray-900"
                  >
                    {module.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-3 block text-gray-900">Acesso aos clientes</Label>
            <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    formData.permissions.clientAccess.scope === "all"
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-white text-gray-600 border-gray-200"
                  }`}
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      permissions: {
                        ...prev.permissions,
                        clientAccess: {
                          ...prev.permissions.clientAccess,
                          scope: "all",
                          clientIds: [],
                        },
                      },
                    }))
                  }
                >
                  Todos os clientes
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    formData.permissions.clientAccess.scope === "custom"
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-white text-gray-600 border-gray-200"
                  }`}
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      permissions: {
                        ...prev.permissions,
                        clientAccess: {
                          ...prev.permissions.clientAccess,
                          scope: "custom",
                        },
                      },
                    }))
                  }
                >
                  Selecionar clientes
                </button>
              </div>

              {formData.permissions.clientAccess.scope === "custom" && (
                <>
                  <Input
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Buscar cliente..."
                    className="bg-white border-gray-300"
                  />
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {visibleClients.map((client) => (
                      <div key={client.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`client-${client.id}`}
                          checked={formData.permissions.clientAccess.clientIds?.includes(client.id)}
                          onCheckedChange={() => toggleClient(client.id)}
                        />
                        <label
                          htmlFor={`client-${client.id}`}
                          className="text-sm cursor-pointer text-gray-900"
                        >
                          {client.name}
                          {client.company ? ` • ${client.company}` : ""}
                        </label>
                      </div>
                    ))}
                    {visibleClients.length === 0 && (
                      <p className="text-xs text-gray-500">Nenhum cliente encontrado.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-purple-600 hover:bg-purple-700"
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? "Salvando..."
                : member
                ? "Atualizar"
                : "Adicionar Membro"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
