import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sparkles, Copy, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AICaptionGenerator({ post, client, onApply }) {
  const [generating, setGenerating] = useState(false);
  const [captions, setCaptions] = useState([]);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const generateCaptions = async () => {
    setGenerating(true);
    try {
      const prompt = `Você é um especialista em social media. Gere 5 variações de legenda para um post de ${client?.name || 'marca'}.

Contexto:
- Título do post: ${post.title}
- Descrição atual: ${post.caption || 'Não fornecida'}
- Setor: ${client?.sector || 'Não especificado'}
- Tom: profissional e engajador

Para cada legenda, forneça:
1. A legenda completa (máximo 150 caracteres)
2. 3-5 hashtags relevantes
3. Um CTA (call-to-action)

Retorne no formato JSON exato:
{
  "captions": [
    {
      "text": "legenda aqui",
      "hashtags": ["#tag1", "#tag2"],
      "cta": "CTA aqui"
    }
  ]
}`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            captions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  hashtags: { type: "array", items: { type: "string" } },
                  cta: { type: "string" }
                }
              }
            }
          }
        }
      });

      setCaptions(result.captions || []);
      toast.success('Legendas geradas com sucesso!');
    } catch (error) {
      console.error('Error generating captions:', error);
      toast.error('Erro ao gerar legendas');
    }
    setGenerating(false);
  };

  const copyToClipboard = (caption, index) => {
    const fullText = `${caption.text}\n\n${caption.hashtags.join(' ')}\n\n${caption.cta}`;
    navigator.clipboard.writeText(fullText);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast.success('Legenda copiada!');
  };

  return (
    <div className="space-y-4">
      <Button
        onClick={generateCaptions}
        disabled={generating}
        className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
      >
        {generating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Gerando legendas...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Gerar Legendas com IA
          </>
        )}
      </Button>

      {captions.length > 0 && (
        <div className="space-y-3">
          {captions.map((caption, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Variação {index + 1}</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(caption, index)}
                    >
                      {copiedIndex === index ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onApply && onApply(caption)}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      Aplicar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <Label className="text-xs text-gray-500">Legenda</Label>
                  <p className="text-sm text-gray-900 mt-1">{caption.text}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Hashtags</Label>
                  <p className="text-sm text-purple-600 mt-1">{caption.hashtags.join(' ')}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">CTA</Label>
                  <p className="text-sm font-medium text-gray-900 mt-1">{caption.cta}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}