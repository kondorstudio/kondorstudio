import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Label } from "@/components/ui/label.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";
import { pricingPlans } from "@/data/pricingPlans.js";
import { Check, Lock, Shield } from "lucide-react";
import logoHeader from "@/assets/logoheader.png";

const formatCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);

export default function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const defaultPlanId = location.state?.plan || "pro";
  const [selectedPlan, setSelectedPlan] = useState(
    pricingPlans.find((plan) => plan.id === defaultPlanId) ? defaultPlanId : "pro"
  );

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    cnpj: "",
    coupon: "",
    notes: "",
  });

  const plan = useMemo(
    () => pricingPlans.find((p) => p.id === selectedPlan) || pricingPlans[1],
    [selectedPlan]
  );

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      alert("Informe o nome e e-mail para continuar.");
      return;
    }

    alert(
      `Checkout recebido! Plano: ${plan.name}. Entraremos em contato no e-mail ${formData.email}.`
    );
    setFormData({
      name: "",
      email: "",
      company: "",
      cnpj: "",
      coupon: "",
      notes: "",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-purple-50 to-white">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <img src={logoHeader} alt="Kondor Studio" className="h-16 w-auto" />
            <button
              type="button"
              className="text-sm text-gray-500 hover:text-gray-800"
              onClick={() => navigate(-1)}
            >
              ← Voltar
            </button>
          </div>
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-500" />
            Checkout seguro
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Escolha o plano</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                {pricingPlans.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedPlan(item.id)}
                    className={`border rounded-xl p-4 text-left hover:border-purple-400 transition ${
                      selectedPlan === item.id
                        ? "border-purple-500 shadow-lg bg-white"
                        : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <p className="font-semibold text-lg text-gray-900">
                      {item.name}
                    </p>
                    <p className="text-sm text-gray-500">{item.description}</p>
                    <p className="text-2xl font-bold mt-3">
                      {formatCurrency(item.price)}
                      <span className="text-sm text-gray-500">/mês</span>
                    </p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                Alterar de plano é simples e você só começa a ser cobrado após o período de teste.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dados de cobrança</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome completo *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={handleChange("name")}
                      placeholder="Nome e sobrenome"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange("email")}
                      placeholder="nome@empresa.com"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="company">Empresa</Label>
                    <Input
                      id="company"
                      value={formData.company}
                      onChange={handleChange("company")}
                      placeholder="Nome fantasia"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cnpj">CNPJ / CPF</Label>
                    <Input
                      id="cnpj"
                      value={formData.cnpj}
                      onChange={handleChange("cnpj")}
                      placeholder="00.000.000/0000-00"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="coupon">Cupom</Label>
                    <Input
                      id="coupon"
                      value={formData.coupon}
                      onChange={handleChange("coupon")}
                      placeholder="Opcional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Observações</Label>
                    <Textarea
                      id="notes"
                      rows={3}
                      value={formData.notes}
                      onChange={handleChange("notes")}
                      placeholder="Informe necessidades específicas ou dúvidas."
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-purple-500 to-purple-700"
                  >
                    Finalizar assinatura segura
                    <Lock className="w-4 h-4 ml-2" />
                  </Button>
                  <p className="text-xs text-gray-500 text-center mt-2">
                    Ao continuar você concorda com os termos e privacidade do Kondor Studio.
                  </p>
                </div>
              </form>
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumo da assinatura</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-gray-600">
              <div className="flex justify-between items-center">
                <span className="font-semibold">{plan.name}</span>
                <span className="text-lg font-bold text-gray-900">
                  {formatCurrency(plan.price)} <small className="text-xs text-gray-500">/mês</small>
                </span>
              </div>
              <ul className="space-y-2">
                {plan.features.slice(0, 5).map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    {feature}
                  </li>
                ))}
              </ul>
              <hr />
              <p className="text-xs text-gray-500">
                Você só será cobrado após o período de teste gratuito. Cancelamento em 1 clique dentro do painel.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-purple-600 text-white">
            <CardContent className="p-6 space-y-3">
              <p className="font-semibold">Precisa de ajuda?</p>
              <p className="text-sm text-purple-100">
                Nosso time responde em menos de 5 minutos no WhatsApp.
              </p>
              <Button
                variant="outline"
                className="border-white text-white"
                onClick={() => window.open("https://wa.me/5500000000000", "_blank")}
              >
                Falar com suporte
              </Button>
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}
