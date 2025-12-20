import React from "react";

export default function Terms() {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 16px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Termos de Uso</h1>
      <p style={{ opacity: 0.8, marginBottom: 24 }}>
        Última atualização: {new Date().toLocaleDateString("pt-BR")}
      </p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>1) Aceite</h2>
      <p>
        Ao acessar ou utilizar a Kondor Studio, você concorda com estes Termos de Uso.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>2) Uso da plataforma</h2>
      <ul>
        <li>Você é responsável pelas informações inseridas na plataforma.</li>
        <li>Você se compromete a não usar o serviço para fins ilegais ou abusivos.</li>
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>3) Integrações de terceiros</h2>
      <p>
        A plataforma pode integrar com serviços de terceiros (ex.: Meta/WhatsApp). O uso dessas
        integrações pode estar sujeito a termos e políticas desses terceiros.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>4) Disponibilidade</h2>
      <p>
        Podemos atualizar, modificar ou interromper recursos para manutenção e melhorias, buscando
        minimizar impactos.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>5) Limitação de responsabilidade</h2>
      <p>
        Na extensão permitida pela lei, a Kondor Studio não se responsabiliza por perdas indiretas
        decorrentes do uso do serviço.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>6) Contato</h2>
      <p>
        E-mail: <strong>suporte@kondorstudio.com</strong>
      </p>
    </div>
  );
}
