import React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import {
  Building2,
  CalendarDays,
  Mail,
  MessageCircle,
  Pencil,
  Tags,
  Trash2,
  Wallet,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge.jsx";

function formatCurrencyBRL(value) {
  if (!value && value !== 0) return "—";
  return (value / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

export default function ClientCard({ client, onEdit, onDelete }) {
  const logo = client.logoUrl || client.logo_url || null;
  const monthlyFeeLabel = formatCurrencyBRL(client.monthlyFeeCents);

  return (
    <Card className="group relative overflow-hidden border border-[var(--border)] bg-white transition hover:-translate-y-0.5 hover:shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[var(--primary-light)] flex items-center justify-center overflow-hidden">
            {logo ? (
              <img
                src={logo}
                alt={client.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-6 h-6 text-[var(--primary)]" />
            )}
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-[var(--text)]">
              {client.name}
            </CardTitle>
            {client.sector && (
              <p className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                <Building2 className="w-3 h-3 text-[var(--text-muted)]" />
                {client.sector}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-sm text-[var(--text)]">
        {(client.briefing || client.notes) && (
          <div className="text-xs text-[var(--text-muted)] bg-[var(--surface-muted)] rounded-lg p-3">
            {client.briefing && (
              <p className="mb-1">
                <span className="font-semibold">Briefing:</span>{" "}
                {client.briefing}
              </p>
            )}
            {client.notes && (
              <p>
                <span className="font-semibold">Notas:</span> {client.notes}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Wallet className="w-4 h-4 text-[var(--primary)]" />
            <span className="text-xs text-[var(--text)]">
              Valor mensal: <strong>{monthlyFeeLabel}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <CalendarDays className="w-4 h-4 text-[var(--primary)]" />
            <span className="text-xs text-[var(--text)]">
              Renovação: <strong>{formatDate(client.renewalDate)}</strong>
            </span>
          </div>
          {client.portalEmail && (
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <Mail className="w-4 h-4 text-[var(--primary)]" />
              <span className="text-xs break-all text-[var(--text)]">
                Portal: <strong>{client.portalEmail}</strong>
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <MessageCircle className="w-4 h-4 text-[var(--primary)]" />
            <span className="text-xs break-all text-[var(--text)]">
              WhatsApp:{" "}
              <strong>{client.whatsappNumberE164 || "não cadastrado"}</strong>
            </span>
          </div>
        </div>

        {client.tags && client.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Tags className="w-4 h-4 text-[var(--primary)]" />
            {client.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => onEdit(client)}
          >
            <Pencil className="w-4 h-4 mr-2" />
            Editar
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="text-red-600 hover:bg-red-50 flex-1"
            onClick={() => onDelete(client.id)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Excluir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
