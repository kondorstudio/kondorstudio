import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Globe, Instagram, Facebook, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ClientCard({ client, onEdit, onDelete }) {
  return (
    <Card className="hover:shadow-lg transition-all duration-300 overflow-hidden">
      <CardHeader className="bg-gradient-to-br from-purple-100 to-purple-200 pb-16 relative">
        {client.logo_url ? (
          <img src={client.logo_url} alt={client.name} className="w-16 h-16 rounded-lg bg-white p-2 shadow-md" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-white flex items-center justify-center shadow-md">
            <span className="text-2xl font-bold text-purple-600">{client.name[0]}</span>
          </div>
        )}

        <div className="absolute top-4 right-4 flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(client)}
            className="bg-white/80 hover:bg-white"
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(client.id)}
            className="bg-white/80 hover:bg-white text-red-600"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        <h3 className="text-xl font-bold text-gray-900 mb-1">{client.name}</h3>
        <p className="text-sm text-gray-500 mb-4">{client.sector || 'Setor não definido'}</p>

        {client.monthly_value && (
          <div className="flex items-center gap-2 mb-4 text-green-600">
            <TrendingUp className="w-4 h-4" />
            <span className="font-semibold">R$ {client.monthly_value.toFixed(2)}/mês</span>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          {client.website && (
            <a href={client.website} target="_blank" rel="noopener noreferrer">
              <Badge variant="outline" className="cursor-pointer hover:bg-purple-50">
                <Globe className="w-3 h-3 mr-1" />
                Site
              </Badge>
            </a>
          )}
          {client.instagram && (
            <a href={`https://instagram.com/${client.instagram}`} target="_blank" rel="noopener noreferrer">
              <Badge variant="outline" className="cursor-pointer hover:bg-purple-50">
                <Instagram className="w-3 h-3 mr-1" />
                IG
              </Badge>
            </a>
          )}
          {client.facebook && (
            <a href={client.facebook} target="_blank" rel="noopener noreferrer">
              <Badge variant="outline" className="cursor-pointer hover:bg-purple-50">
                <Facebook className="w-3 h-3 mr-1" />
                FB
              </Badge>
            </a>
          )}
        </div>

        {client.tags && client.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {client.tags.map((tag, idx) => (
              <Badge key={idx} className="bg-purple-100 text-purple-700 text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}