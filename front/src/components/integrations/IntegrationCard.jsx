import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Trash2 } from "lucide-react";

function StatusBadge({ status }) {
  const s = (status || "disconnected").toLowerCase();
  const cls =
    s === "connected"
      ? "border-emerald-200 text-emerald-700"
      : s === "error"
        ? "border-red-200 text-red-700"
        : "border-purple-200 text-purple-700";

  return (
    <Badge variant="outline" className={cls}>
      {s}
    </Badge>
  );
}

export default function IntegrationCard({
  title,
  description,
  status,
  metaLines = [],
  primaryAction,
  secondaryAction,
  dangerAction,
  footerHint,
  rightIcon,
}) {
  return (
    <Card className="border border-purple-100 bg-white">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold text-gray-900">
              {title}
            </CardTitle>
            <StatusBadge status={status} />
          </div>
          {description ? <p className="text-sm text-gray-600">{description}</p> : null}
        </div>

        {rightIcon ? <div className="mt-1">{rightIcon}</div> : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {metaLines?.length ? (
          <div className="space-y-1">
            {metaLines.map((line, idx) => (
              <div key={idx} className="text-xs text-gray-500">
                {line}
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {primaryAction ? (
            <Button
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              className={primaryAction.className || "bg-purple-600 hover:bg-purple-700"}
            >
              {primaryAction.label}
            </Button>
          ) : null}

          {secondaryAction ? (
            <Button
              variant="outline"
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.disabled}
            >
              {secondaryAction.label}
            </Button>
          ) : null}

          {dangerAction ? (
            <Button
              variant="outline"
              onClick={dangerAction.onClick}
              disabled={dangerAction.disabled}
              className="border-red-200 text-red-600 hover:bg-red-50"
              title={dangerAction.title || "Desconectar"}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {dangerAction.label}
            </Button>
          ) : null}
        </div>

        {footerHint ? (
          <div className="text-[11px] text-gray-500">{footerHint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
