import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Palette, Building2, CreditCard, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tenant, setTenant] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    agency_name: "",
    primary_color: "#A78BFA",
    accent_color: "#39FF14",
    logo_url: ""
  });

  useEffect(() => {
    loadTenant();
  }, []);

  const loadTenant = async () => {
    const tenants = await base44.entities.Tenant.list();
    if (tenants.length > 0) {
      const t = tenants[0];
      setTenant(t);
      setFormData({
        agency_name: t.agency_name || "",
        primary_color: t.primary_color || "#A78BFA",
        accent_color: t.accent_color || "#39FF14",
        logo_url: t.logo_url || ""
      });
    }
  };

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Tenant.update(tenant.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      loadTenant();
    }
  });

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData(prev => ({ ...prev, logo_url: file_url }));
    } catch (error) {
      console.error('Upload error:', error);
    }
    setUploading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const planLimits = {
    starter: { clients: 15, users: 1 },
    pro: { clients: 40, users: 3 },
    agency: { clients: 100, users: 999 }
  };

  const currentLimits = planLimits[tenant?.plan] || planLimits.starter;

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Configurações</h1>
          <p className="text-gray-600">Personalize sua agência e plano</p>
        </div>

        {/* Plano Atual */}
        <Card className="mb-6 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-purple-900">
                    Plano {tenant?.plan ? tenant.plan.charAt(0).toUpperCase() + tenant.plan.slice(1) : 'Starter'}
                  </CardTitle>
                  <p className="text-sm text-purple-700">
                    {tenant?.subscription_status === 'trial' ? '🎉 Período de teste ativo' : 'Assinatura ativa'}
                  </p>
                </div>
              </div>
              <Button
                onClick={() => navigate(createPageUrl("Pricing"))}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Ver Planos
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/60 rounded-lg p-3">
                <p className="text-sm text-purple-700">Limite de Clientes</p>
                <p className="text-2xl font-bold text-purple-900">{currentLimits.clients}</p>
              </div>
              <div className="bg-white/60 rounded-lg p-3">
                <p className="text-sm text-purple-700">Usuários Internos</p>
                <p className="text-2xl font-bold text-purple-900">{currentLimits.users}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Branding da Agência */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-purple-600" />
              <CardTitle>Identidade da Agência</CardTitle>
            </div>
            <p className="text-sm text-gray-600">
              Personalize como sua agência aparece para os clientes
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label>Nome da Agência</Label>
                <Input
                  value={formData.agency_name}
                  onChange={(e) => setFormData({...formData, agency_name: e.target.value})}
                  placeholder="Minha Agência"
                />
              </div>

              <div>
                <Label>Logo da Agência</Label>
                <div className="mt-2 flex items-center gap-4">
                  {formData.logo_url && (
                    <img
                      src={formData.logo_url}
                      alt="Logo"
                      className="w-20 h-20 object-contain rounded-lg border"
                    />
                  )}
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                      id="logo-upload"
                    />
                    <label htmlFor="logo-upload">
                      <Button type="button" variant="outline" asChild>
                        <span>
                          <Upload className="w-4 h-4 mr-2" />
                          {uploading ? 'Enviando...' : 'Upload Logo'}
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cor Primária (Roxo)</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      type="color"
                      value={formData.primary_color}
                      onChange={(e) => setFormData({...formData, primary_color: e.target.value})}
                      className="w-20 h-10"
                    />
                    <Input
                      value={formData.primary_color}
                      onChange={(e) => setFormData({...formData, primary_color: e.target.value})}
                      placeholder="#A78BFA"
                    />
                  </div>
                </div>

                <div>
                  <Label>Cor de Acento (Neon)</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      type="color"
                      value={formData.accent_color}
                      onChange={(e) => setFormData({...formData, accent_color: e.target.value})}
                      className="w-20 h-10"
                    />
                    <Input
                      value={formData.accent_color}
                      onChange={(e) => setFormData({...formData, accent_color: e.target.value})}
                      placeholder="#39FF14"
                    />
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="p-6 bg-gray-50 rounded-lg border-2 border-dashed">
                <p className="text-sm text-gray-600 mb-3">Preview do Portal do Cliente:</p>
                <div
                  className="p-4 rounded-lg"
                  style={{
                    backgroundColor: formData.primary_color,
                    color: 'white'
                  }}
                >
                  <div className="flex items-center gap-3">
                    {formData.logo_url && (
                      <img src={formData.logo_url} alt="Logo" className="w-10 h-10 bg-white rounded p-1" />
                    )}
                    <div>
                      <h3 className="font-bold">{formData.agency_name || 'Sua Agência'}</h3>
                      <p className="text-sm opacity-90">Portal do Cliente</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-700"
                  disabled={updateMutation.isPending || uploading}
                >
                  {updateMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}