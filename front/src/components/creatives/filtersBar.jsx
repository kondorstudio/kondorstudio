import React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input.jsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.jsx";

const STATUS_FILTERS = [
  { value: "all", label: "Todos os status" },
  { value: "in_use", label: "Em uso" },
  { value: "approved", label: "Aprovado" },
  { value: "archived", label: "Arquivado" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "Todos os tipos" },
  { value: "image", label: "Imagens" },
  { value: "video", label: "Vídeos" },
  { value: "gif", label: "GIFs" },
];

export default function FiltersBar({
  searchTerm,
  onSearchChange,
  filterClient,
  onClientChange,
  clients,
  filterType,
  onTypeChange,
  filterStatus,
  onStatusChange,
  total,
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-4 lg:p-6 space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar criativos..."
            className="h-12 pl-11 rounded-2xl border-slate-200"
          />
        </div>

        <div className="text-sm text-slate-500 font-medium lg:w-auto">
          {total} criativo{total === 1 ? "" : "s"} encontrados
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={filterClient} onValueChange={onClientChange}>
          <SelectTrigger className="flex-1 min-w-[180px] h-11 rounded-2xl border-slate-200">
            <SelectValue placeholder="Todos os clientes" />
          </SelectTrigger>
          <SelectContent className="bg-white">
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={onTypeChange}>
          <SelectTrigger className="flex-1 min-w-[150px] h-11 rounded-2xl border-slate-200">
            <SelectValue placeholder="Todos os tipos" />
          </SelectTrigger>
          <SelectContent className="bg-white">
            {TYPE_OPTIONS.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={onStatusChange}>
          <SelectTrigger className="flex-1 min-w-[150px] h-11 rounded-2xl border-slate-200">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent className="bg-white">
            {STATUS_FILTERS.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

FiltersBar.defaultProps = {
  clients: [],
  total: 0,
};
