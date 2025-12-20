import React from "react";

export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 16px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Política de Privacidade</h1>
      <p style={{ opacity: 0.8, marginBottom: 24 }}>
        Última atualização: {new Date().toLocaleDateString("pt-BR")}
      </p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>1) Quem somos</h2>
      <p>
        A Kondor Studio é uma plataforma SaaS para gestão de conteúdos, aprovações e integrações
        (incluindo integrações via APIs de terceiros como Meta/WhatsApp).
      </p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>2) Dados que coletamos</h2>
      <ul>
        <li>Dados de conta: nome, e-mail e informações de autenticação.</li>
        <li>Dados de uso: registros de ações na plataforma (ex.: criação de posts e aprovações).</li>
        <li>
          Dados de integrações: identificadores técnicos necessários para operar integrações (ex.:
          IDs de conta/telefone e tokens de acesso criptografados quando aplicável).
        </li>
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>3) Como usamos os dados</h2>
      <ul>
        <li>Para fornecer e operar a plataforma e suas funcionalidades.</li>
        <li>Para autenticação, segurança, prevenção de fraudes e auditoria.</li>
        <li>Para operar integrações solicitadas pelo usuário (ex.: WhatsApp Cloud API).</li>
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>4) Compartilhamento</h2>
      <p>
        Não vendemos dados pessoais. Podemos compartilhar dados com provedores necessários para o
        funcionamento do serviço (ex.: hospedagem, banco de dados e APIs de terceiros) apenas na
        medida do necessário.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>5) Segurança</h2>
      <p>
        Adotamos medidas técnicas e organizacionais para proteger dados. Quando aplicável,
        tokens/segredos de integrações podem ser armazenados criptografados.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>6) Seus direitos</h2>
      <p>
        Você pode solicitar acesso, correção ou exclusão de dados conforme aplicável. Entre em
        contato pelo e-mail abaixo.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>7) Contato</h2>
      <p>
        E-mail: <strong>suporte@kondorstudio.com</strong>
      </p>
    </div>
  );
}
